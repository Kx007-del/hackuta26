import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BADGES, DAILY_XP_CAP, LEADERBOARD_SIZE, MAX_RECORDED_PER_DAY, MIN_ATTEMPT_SPACING_MS, TIE_RULES, XP_PER_ATTEMPT,
  addDays, advanceStreak, dayStartMs, effectiveStreak, utcDay,
  type AttemptProgress, type BadgeId, type Board, type Leaderboard, type Profile,
} from './rules';

export const SCHEMA_VERSION = 1;
export const MAX_PLAYERS = 50_000;

/** A completed, server-scored attempt. Everything here comes from the server's own scoring. */
export type ScoredAttempt = {
  score: number; hit: boolean;
  aiStatus: 'ok' | 'declined' | 'unavailable';
  /** Reason the attempt can't count, from the shared eligibility rules (undefined = eligible). */
  ineligible?: string;
};

type PlayerRow = {
  id: string; token_hash: string; name: string; created_at: number; xp: number; attempts: number;
  streak_current: number; streak_last_day: string | null; streak_reached_at: number | null; longest_streak: number;
  best_score: number | null; best_score_at: number | null; last_xp_at: number | null; last_attempt_at: number | null;
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const iso = (ms: number) => new Date(ms).toISOString();

export function openProgressionStore(options: { databasePath?: string; now?: () => number; durable?: boolean } = {}) {
  const now = options.now ?? Date.now;
  const configured = options.databasePath ?? (process.env.DATABASE_PATH?.trim() || resolve('data/relays.sqlite'));
  const file = configured === ':memory:' ? configured : resolve(configured);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');

  // ---- additive, versioned migrations (never drops or rewrites existing tables) ----
  db.exec('CREATE TABLE IF NOT EXISTS progression_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const getMeta = db.prepare('SELECT value FROM progression_meta WHERE key = ?');
  const setMeta = db.prepare('INSERT INTO progression_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const version = Number((getMeta.get('schema_version') as { value: string } | undefined)?.value ?? 0);
  if (version < 1) {
    db.exec(`BEGIN;
      CREATE TABLE IF NOT EXISTS progression_players (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
        streak_current INTEGER NOT NULL DEFAULT 0, streak_last_day TEXT, streak_reached_at INTEGER, longest_streak INTEGER NOT NULL DEFAULT 0,
        best_score INTEGER, best_score_at INTEGER, last_xp_at INTEGER, last_attempt_at INTEGER);
      CREATE TABLE IF NOT EXISTS progression_attempts (
        player_id TEXT NOT NULL, attempt_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
        completed_at INTEGER, day TEXT, eligible INTEGER, ranked INTEGER, score INTEGER, hit INTEGER, ai_status TEXT,
        xp_awarded INTEGER, response TEXT, PRIMARY KEY (player_id, attempt_id));
      CREATE INDEX IF NOT EXISTS progression_attempts_ranked ON progression_attempts (ranked, completed_at);
      CREATE INDEX IF NOT EXISTS progression_attempts_created ON progression_attempts (player_id, created_at);
      CREATE TABLE IF NOT EXISTS progression_days (
        player_id TEXT NOT NULL, day TEXT NOT NULL, attempts INTEGER NOT NULL, xp INTEGER NOT NULL, first_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, day));
      CREATE TABLE IF NOT EXISTS progression_badges (
        player_id TEXT NOT NULL, badge TEXT NOT NULL, earned_at INTEGER NOT NULL, PRIMARY KEY (player_id, badge));
      CREATE TABLE IF NOT EXISTS progression_checkpoints (
        day TEXT PRIMARY KEY, leader_id TEXT, score INTEGER, taken_at INTEGER NOT NULL);
      COMMIT;`);
    setMeta.run('schema_version', String(SCHEMA_VERSION));
  }
  if (!getMeta.get('tracking_started_at')) setMeta.run('tracking_started_at', String(now()));
  const trackingStartedAt = Number((getMeta.get('tracking_started_at') as { value: string }).value);
  const durable = options.durable ?? process.env.PROGRESSION_STORAGE?.trim() === 'durable';

  const q = {
    playerByToken: db.prepare('SELECT * FROM progression_players WHERE token_hash = ?'),
    playerById: db.prepare('SELECT * FROM progression_players WHERE id = ?'),
    countPlayers: db.prepare('SELECT COUNT(*) AS n FROM progression_players'),
    insertPlayer: db.prepare('INSERT INTO progression_players (id, token_hash, name, created_at) VALUES (?, ?, ?, ?)'),
    rename: db.prepare('UPDATE progression_players SET name = ? WHERE id = ?'),
    attempt: db.prepare('SELECT * FROM progression_attempts WHERE player_id = ? AND attempt_id = ?'),
    claimsSince: db.prepare('SELECT COUNT(*) AS n FROM progression_attempts WHERE player_id = ? AND created_at >= ?'),
    claim: db.prepare("INSERT OR IGNORE INTO progression_attempts (player_id, attempt_id, status, created_at) VALUES (?, ?, 'pending', ?)"),
    release: db.prepare("DELETE FROM progression_attempts WHERE player_id = ? AND attempt_id = ? AND status = 'pending'"),
    complete: db.prepare("UPDATE progression_attempts SET status = 'done', completed_at = ?, day = ?, eligible = ?, ranked = ?, score = ?, hit = ?, ai_status = ?, xp_awarded = ?, response = ? WHERE player_id = ? AND attempt_id = ? AND status = 'pending'"),
    dayRow: db.prepare('SELECT * FROM progression_days WHERE player_id = ? AND day = ?'),
    upsertDay: db.prepare('INSERT INTO progression_days (player_id, day, attempts, xp, first_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(player_id, day) DO UPDATE SET attempts = attempts + 1, xp = xp + excluded.xp'),
    updatePlayer: db.prepare(`UPDATE progression_players SET xp = ?, attempts = ?, streak_current = ?, streak_last_day = ?, streak_reached_at = ?,
      longest_streak = ?, best_score = ?, best_score_at = ?, last_xp_at = ?, last_attempt_at = ? WHERE id = ?`),
    badges: db.prepare('SELECT badge, earned_at FROM progression_badges WHERE player_id = ?'),
    award: db.prepare('INSERT OR IGNORE INTO progression_badges (player_id, badge, earned_at) VALUES (?, ?, ?)'),
    checkpoint: db.prepare('SELECT * FROM progression_checkpoints WHERE day = ?'),
    insertCheckpoint: db.prepare('INSERT OR IGNORE INTO progression_checkpoints (day, leader_id, score, taken_at) VALUES (?, ?, ?, ?)'),
    recentCheckpoints: db.prepare('SELECT day, leader_id FROM progression_checkpoints WHERE day <= ? ORDER BY day DESC LIMIT 7'),
    // Leader as of a past instant, from persisted ranked attempts only (never from the current board).
    leaderAt: db.prepare(`WITH best AS (
        SELECT player_id, MAX(score) AS s FROM progression_attempts WHERE status = 'done' AND ranked = 1 AND completed_at < ? GROUP BY player_id)
      SELECT best.player_id AS id, best.s AS score, MIN(a.completed_at) AS at FROM best
      JOIN progression_attempts a ON a.player_id = best.player_id AND a.status = 'done' AND a.ranked = 1 AND a.score = best.s AND a.completed_at < ?
      GROUP BY best.player_id ORDER BY score DESC, at ASC, id ASC LIMIT 1`),
  };

  const badgesOf = (id: string) => new Map((q.badges.all(id) as Array<{ badge: string; earned_at: number }>).map(r => [r.badge as BadgeId, r.earned_at]));
  const award = (id: string, badge: BadgeId, at: number) => Number(q.award.run(id, badge, at).changes) > 0;
  function tx<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try { const out = fn(); db.exec('COMMIT'); return out; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  // ---- daily championship checkpoints, computed from history, starting at launch ----
  let checkpointedThrough: string | null = null;
  function ensureCheckpoints() {
    const yesterday = addDays(utcDay(now()), -1);
    if (checkpointedThrough === yesterday) return;
    let day = utcDay(trackingStartedAt);
    for (let guard = 0; day <= yesterday && guard < 400; guard++, day = addDays(day, 1)) {
      if (q.checkpoint.get(day)) continue;
      const takenAt = dayStartMs(addDays(day, 1)); // 00:00 UTC after the day
      tx(() => {
        const leader = q.leaderAt.get(takenAt, takenAt) as { id: string; score: number } | undefined;
        if (!Number(q.insertCheckpoint.run(day, leader?.id ?? null, leader?.score ?? null, takenAt).changes)) return;
        if (!leader) return;
        award(leader.id, 'champion', takenAt);
        const recent = q.recentCheckpoints.all(day) as Array<{ day: string; leader_id: string | null }>;
        const consecutive = recent.length === 7 && recent.every((c, i) => c.leader_id === leader.id && c.day === addDays(day, -i));
        if (consecutive) award(leader.id, 'reigning-champion', takenAt);
      });
    }
    checkpointedThrough = yesterday;
  }

  // ---- rankings (deterministic; explained in TIE_RULES) ----
  const effStreakSql = `CASE WHEN streak_last_day >= ? THEN streak_current ELSE 0 END`;
  const boards: Record<Board, { where: string; value: string; order: string }> = {
    score: { where: 'best_score IS NOT NULL', value: 'best_score', order: 'best_score DESC, best_score_at ASC, id ASC' },
    streak: { where: `(${effStreakSql}) > 0`, value: effStreakSql, order: `(${effStreakSql}) DESC, longest_streak DESC, streak_reached_at ASC, id ASC` },
    xp: { where: 'xp > 0', value: 'xp', order: 'xp DESC, last_xp_at ASC, id ASC' },
  };
  function rankedIds(board: Board) {
    const b = boards[board], yesterday = addDays(utcDay(now()), -1);
    const params = board === 'streak' ? [yesterday, yesterday, yesterday] : [];
    return db.prepare(`SELECT id, ${b.value} AS value FROM progression_players WHERE ${b.where} ORDER BY ${b.order}`).all(...params) as Array<{ id: string; value: number }>;
  }
  function rankOf(board: Board, id: string) {
    const index = rankedIds(board).findIndex(r => r.id === id);
    return index < 0 ? null : index + 1;
  }

  function profileOf(row: PlayerRow, isNew = false): Profile {
    ensureCheckpoints();
    const earned = badgesOf(row.id);
    const today = q.dayRow.get(row.id, utcDay(now())) as { xp: number } | undefined;
    return {
      id: row.id, name: row.name, isNew,
      xp: row.xp, xpToday: today?.xp ?? 0, xpCap: DAILY_XP_CAP,
      attempts: row.attempts,
      currentStreak: effectiveStreak(row.streak_current, row.streak_last_day, now()),
      longestStreak: row.longest_streak,
      bestScore: row.best_score,
      reachedAt: {
        score: row.best_score_at === null ? null : iso(row.best_score_at),
        streak: row.streak_reached_at === null ? null : iso(row.streak_reached_at),
        xp: row.last_xp_at === null ? null : iso(row.last_xp_at),
      },
      ranks: { score: rankOf('score', row.id), streak: rankOf('streak', row.id), xp: rankOf('xp', row.id) },
      badges: BADGES.map(b => ({ ...b, earnedAt: earned.has(b.id) ? iso(earned.get(b.id)!) : null })),
      storageDurable: durable,
      trackingSince: iso(trackingStartedAt),
    };
  }

  return {
    trackingStartedAt,
    durable,
    /** The player for a cookie token, if it is known. Never creates one. */
    find(token: string | undefined) {
      if (!token || token.length > 128) return undefined;
      return q.playerByToken.get(hashToken(token)) as PlayerRow | undefined;
    },
    /** Create a fresh guest; returns its secret cookie token (only the hash is stored). */
    createGuest(): { player: PlayerRow; token: string } | { full: true } {
      if ((q.countPlayers.get() as { n: number }).n >= MAX_PLAYERS) return { full: true };
      const fresh = randomBytes(32).toString('base64url');
      const id = randomBytes(12).toString('base64url');
      const name = `Player ${randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;
      q.insertPlayer.run(id, hashToken(fresh), name, now());
      return { player: q.playerById.get(id) as PlayerRow, token: fresh };
    },
    profile(id: string, isNew = false) {
      const row = q.playerById.get(id) as PlayerRow | undefined;
      return row ? profileOf(row, isNew) : undefined;
    },
    rename(id: string, name: string) { q.rename.run(name, id); },

    /** Claim an attempt id before scoring. Returns a stored response for a replayed, finished attempt. */
    claim(playerId: string, attemptId: string): { status: 'claimed' } | { status: 'pending' } | { status: 'limit' } | { status: 'done'; response: unknown } {
      const existing = q.attempt.get(playerId, attemptId) as { status: string; response: string | null } | undefined;
      if (existing?.status === 'done' && existing.response) return { status: 'done', response: JSON.parse(existing.response) };
      if (existing) return { status: 'pending' };
      const t = now();
      // Bounded storage: at most MAX_RECORDED_PER_DAY attempt records per player per UTC day.
      if ((q.claimsSince.get(playerId, dayStartMs(utcDay(t))) as { n: number }).n >= MAX_RECORDED_PER_DAY) return { status: 'limit' };
      return Number(q.claim.run(playerId, attemptId, t).changes) > 0 ? { status: 'claimed' } : { status: 'pending' };
    },
    /** Give up a claim (e.g. the scoring request failed) so a retry can score it. */
    release(playerId: string, attemptId: string) { q.release.run(playerId, attemptId); },

    /** Record a claimed attempt exactly once and apply XP, streak and badges. */
    complete(playerId: string, attemptId: string, attempt: ScoredAttempt, buildResponse: (progress: AttemptProgress) => unknown): { progress: AttemptProgress; response: unknown } {
      const t = now(), day = utcDay(t);
      const result = tx(() => {
        // Only a pending claim can be completed: a second completion of the same attempt changes nothing.
        const claimRow = q.attempt.get(playerId, attemptId) as { status: string; response: string | null } | undefined;
        if (claimRow?.status !== 'pending') {
          return { progress: { status: 'not-counted', reason: 'This attempt was already recorded.' } as AttemptProgress, response: claimRow?.response ? JSON.parse(claimRow.response) : undefined };
        }
        const row = q.playerById.get(playerId) as PlayerRow | undefined;
        const dayRow = q.dayRow.get(playerId, day) as { attempts: number; xp: number } | undefined;
        let progress: AttemptProgress;
        let reason = attempt.ineligible;
        if (!row) reason = 'Player not found.';
        else if (!reason && row.last_attempt_at !== null && t - row.last_attempt_at < MIN_ATTEMPT_SPACING_MS) reason = 'Attempts less than 3 seconds apart don’t count.';
        if (reason || !row) {
          progress = { status: 'not-counted', reason: reason ?? 'Not counted.' };
        } else {
          const ranked = attempt.aiStatus === 'ok';
          const xpAwarded = Math.max(0, Math.min(XP_PER_ATTEMPT, DAILY_XP_CAP - (dayRow?.xp ?? 0)));
          const streak = advanceStreak(row.streak_current, row.streak_last_day, day);
          const newDay = row.streak_last_day !== day;
          const better = ranked && (row.best_score === null || attempt.score > row.best_score);
          const p = {
            xp: row.xp + xpAwarded, attempts: row.attempts + 1,
            streak, streakLastDay: day, streakReachedAt: newDay ? t : row.streak_reached_at,
            longest: Math.max(row.longest_streak, streak),
            best: better ? attempt.score : row.best_score, bestAt: better ? t : row.best_score_at,
            lastXpAt: xpAwarded > 0 ? t : row.last_xp_at,
          };
          q.upsertDay.run(playerId, day, xpAwarded, t);
          q.updatePlayer.run(p.xp, p.attempts, p.streak, p.streakLastDay, p.streakReachedAt, p.longest, p.best, p.bestAt, p.lastXpAt, t, playerId);
          const newBadges: BadgeId[] = [];
          const give = (b: BadgeId, when: boolean) => { if (when && award(playerId, b, t)) newBadges.push(b); };
          give('first-run', p.attempts >= 1);
          give('regular', p.attempts >= 10);
          give('dedicated', p.attempts >= 50);
          give('streak-3', p.streak >= 3);
          give('streak-7', p.streak >= 7);
          if (better) give('top-ten', (rankOf('score', playerId) ?? Infinity) <= LEADERBOARD_SIZE);
          progress = {
            status: 'counted', xpAwarded, xpToday: (dayRow?.xp ?? 0) + xpAwarded, xpCap: DAILY_XP_CAP, ranked,
            ...(ranked ? {} : { unrankedReason: attempt.aiStatus === 'declined' ? 'Scored on game data only (AI scoring off), so it isn’t ranked.' : 'AI scoring was unavailable, so it isn’t ranked.' }),
            newBadges, currentStreak: p.streak, bestScore: p.best, newBest: better,
          };
        }
        const response = buildResponse(progress);
        const counted = progress.status === 'counted';
        q.complete.run(t, day, counted ? 1 : 0, counted && progress.status === 'counted' && progress.ranked ? 1 : 0,
          Math.round(attempt.score), attempt.hit ? 1 : 0, attempt.aiStatus, counted && progress.status === 'counted' ? progress.xpAwarded : 0,
          JSON.stringify(response), playerId, attemptId);
        return { progress, response };
      });
      return result;
    },

    leaderboard(board: Board, viewerId?: string): Leaderboard {
      ensureCheckpoints();
      const all = rankedIds(board);
      const top = all.slice(0, LEADERBOARD_SIZE);
      const entries = top.map((r, i) => {
        const row = q.playerById.get(r.id) as PlayerRow;
        return { rank: i + 1, name: row.name, value: r.value, badges: [...badgesOf(r.id).keys()], isYou: r.id === viewerId };
      });
      const index = viewerId ? all.findIndex(r => r.id === viewerId) : -1;
      return {
        board, entries, total: all.length, tieRule: TIE_RULES[board], trackingSince: iso(trackingStartedAt), storageDurable: durable,
        you: viewerId ? { rank: index < 0 ? null : index + 1, value: index < 0 ? null : all[index].value } : null,
      };
    },
    close() { db.close(); },
  };
}
export type ProgressionStore = ReturnType<typeof openProgressionStore>;
