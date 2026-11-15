// Community progression: XP, streaks, badges, championship checkpoints, rankings, identity and storage.
// Multi-day scenarios use a controlled clock and a throwaway database; nothing touches production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import * as THREE from 'three';
import { RAMP_HEADING, SHOT_SPOT, SPAWN_POINT, targetBase } from '../packages/gameplay/hillsideScene';
import { REFERENCE, type AttemptTelemetry } from '../packages/showcase-scoring/telemetry';
import type { GeminiOutcome } from '../packages/showcase-scoring/gemini';
import { registerShowcaseScoring, type ScoreResponse } from '../packages/showcase-scoring/server';
import { registerProgression, GUEST_COOKIE } from '../packages/progression/server';
import { openProgressionStore, SCHEMA_VERSION, type ProgressionStore, type ScoredAttempt } from '../packages/progression/store';
import {
  advanceStreak, cleanDisplayName, DAILY_XP_CAP, effectiveStreak, ineligibleReason, utcDay, type AttemptProgress, type Leaderboard, type Profile,
} from '../packages/progression/rules';

const T0 = Date.parse('2026-11-15T10:00:00.000Z');
const DAY = 86_400_000;
function clock(start = T0) {
  const c = { t: start, now: () => c.t, advance: (ms: number) => { c.t += ms; }, at: (iso: string) => { c.t = Date.parse(iso); } };
  return c;
}
function freshStore(c = clock(), path = ':memory:') {
  return openProgressionStore({ databasePath: path, now: c.now, durable: false });
}
function guest(store: ProgressionStore) {
  const created = store.createGuest();
  assert.ok(!('full' in created));
  return created;
}
const scored = (over: Partial<ScoredAttempt> = {}): ScoredAttempt => ({ score: 50, hit: true, aiStatus: 'ok', ...over });
/** Play one attempt through claim + complete, the same path the scoring route uses. */
function play(store: ProgressionStore, playerId: string, over: Partial<ScoredAttempt> = {}, attemptId = randomUUID()): AttemptProgress {
  assert.equal(store.claim(playerId, attemptId).status, 'claimed');
  return store.complete(playerId, attemptId, scored(over), progress => ({ progress })).progress;
}
/** Play `n` attempts spaced past the 3 s anti-spam window. */
function playMany(store: ProgressionStore, c: ReturnType<typeof clock>, id: string, n: number, over: Partial<ScoredAttempt> = {}) {
  const out: AttemptProgress[] = [];
  for (let i = 0; i < n; i++) { c.advance(4000); out.push(play(store, id, over)); }
  return out;
}
const counted = (p: AttemptProgress) => { assert.equal(p.status, 'counted', p.status === 'not-counted' ? p.reason : ''); return p as Extract<AttemptProgress, { status: 'counted' }>; };

// ---------------- pure rules ----------------

test('rules: UTC days, streak advance, missed-day reset and the effective streak', () => {
  assert.equal(utcDay(Date.parse('2026-11-15T23:59:59.999Z')), '2026-11-15');
  assert.equal(utcDay(Date.parse('2026-11-16T00:00:00.000Z')), '2026-11-16');
  assert.equal(advanceStreak(0, null, '2026-11-15'), 1);
  assert.equal(advanceStreak(3, '2026-11-15', '2026-11-15'), 3, 'same day does not advance');
  assert.equal(advanceStreak(3, '2026-11-15', '2026-11-16'), 4);
  assert.equal(advanceStreak(3, '2026-11-15', '2026-11-17'), 1, 'a missed full day breaks it');
  assert.equal(advanceStreak(5, '2026-12-31', '2027-01-01'), 6, 'year boundary');
  assert.equal(effectiveStreak(4, '2026-11-14', Date.parse('2026-11-15T12:00:00Z')), 4, 'yesterday still alive');
  assert.equal(effectiveStreak(4, '2026-11-13', Date.parse('2026-11-15T00:00:00Z')), 0, 'a whole missed day shows 0');
});

test('rules: minimum valid attempt and display-name validation', () => {
  assert.equal(ineligibleReason({ shots: 1, elapsedMs: 2000, movedM: 10, turnDeg: 0 }), undefined);
  assert.equal(ineligibleReason({ shots: 1, elapsedMs: 2000, movedM: 0, turnDeg: -65 }), undefined, 'turning alone is enough');
  assert.match(ineligibleReason({ shots: 1, elapsedMs: 300, movedM: 10, turnDeg: 0 })!, /1\.5 seconds/);
  assert.match(ineligibleReason({ shots: 1, elapsedMs: 5000, movedM: 1, turnDeg: 5 })!, /Move or turn/);
  assert.match(ineligibleReason({ shots: 2, elapsedMs: 5000, movedM: 10, turnDeg: 0 })!, /one shot/);
  assert.equal(cleanDisplayName('  Mews   Fan '), 'Mews Fan');
  assert.equal(cleanDisplayName("Zoë_o'Neil-2.0"), "Zoë_o'Neil-2.0");
  for (const bad of ['', '   ', 'x'.repeat(25), '<script>', 'a\u0000b', 'name‮evil', 42, null, { name: 'x' }]) assert.equal(cleanDisplayName(bad), undefined, String(bad));
});

// ---------------- XP, caps and idempotency ----------------

test('XP: 10 per eligible attempt including misses and unranked results; capped at 200 per UTC day', () => {
  const c = clock(), store = freshStore(c), { player } = guest(store);
  const first = counted(playMany(store, c, player.id, 1, { hit: false, score: 12, aiStatus: 'declined' })[0]);
  assert.equal(first.xpAwarded, 10, 'a genuine miss still earns XP');
  assert.equal(first.ranked, false);
  const rest = playMany(store, c, player.id, 21).map(counted);
  assert.equal(rest[18].xpToday, 200, '20th attempt reaches the cap');
  assert.equal(rest[19].xpAwarded, 0, 'past the cap: still counted, no XP');
  assert.equal(rest[20].xpToday, DAILY_XP_CAP);
  let profile = store.profile(player.id)!;
  assert.equal(profile.xp, 200); assert.equal(profile.xpToday, 200); assert.equal(profile.attempts, 22);
  c.at('2026-11-16T00:00:01.000Z');
  const next = counted(play(store, player.id));
  assert.equal(next.xpAwarded, 10, 'the cap resets at 00:00 UTC');
  profile = store.profile(player.id)!;
  assert.equal(profile.xp, 210); assert.equal(profile.xpToday, 10);
  store.close();
});

test('XP: ineligible and too-fast attempts never award anything', () => {
  const c = clock(), store = freshStore(c), { player } = guest(store);
  const empty = play(store, player.id, { ineligible: 'Move or turn before shooting for the attempt to count.' });
  assert.equal(empty.status, 'not-counted');
  counted(play(store, player.id));
  c.advance(1000);
  const tooFast = play(store, player.id);
  assert.equal(tooFast.status, 'not-counted');
  const profile = store.profile(player.id)!;
  assert.equal(profile.xp, 10); assert.equal(profile.attempts, 1);
  store.close();
});

test('idempotency: an attempt id is recorded once; replays return the stored result and a pending one is busy', () => {
  const c = clock(), store = freshStore(c), { player } = guest(store);
  const id = randomUUID();
  assert.equal(store.claim(player.id, id).status, 'claimed');
  assert.equal(store.claim(player.id, id).status, 'pending', 'concurrent duplicate while scoring');
  const first = store.complete(player.id, id, scored({ score: 70 }), progress => ({ score: 70, progress }));
  c.advance(10_000);
  const again = store.complete(player.id, id, scored({ score: 99 }), progress => ({ score: 99, progress }));
  assert.equal(again.progress.status, 'not-counted', 'second completion changes nothing');
  const replay = store.claim(player.id, id);
  assert.equal(replay.status, 'done');
  assert.deepEqual((replay as { response: unknown }).response, first.response);
  const profile = store.profile(player.id)!;
  assert.equal(profile.xp, 10); assert.equal(profile.attempts, 1); assert.equal(profile.bestScore, 70);
  // A released claim (failed scoring) can be retried.
  const retry = randomUUID();
  store.claim(player.id, retry); store.release(player.id, retry);
  assert.equal(store.claim(player.id, retry).status, 'claimed');
  store.close();
});

test('storage is bounded: at most 100 attempt records per player per UTC day', () => {
  const c = clock(), store = freshStore(c), { player } = guest(store);
  for (let i = 0; i < 100; i++) assert.equal(store.claim(player.id, `bulk-attempt-${i}`).status, 'claimed');
  assert.equal(store.claim(player.id, 'bulk-attempt-x').status, 'limit');
  c.advance(DAY);
  assert.equal(store.claim(player.id, 'bulk-attempt-y').status, 'claimed');
  store.close();
});

// ---------------- streaks ----------------

test('streaks: one advance per UTC day, missed day resets, longest is kept, boundary at 00:00 UTC', () => {
  const c = clock(Date.parse('2026-11-15T23:59:50.000Z')), store = freshStore(c), { player } = guest(store);
  assert.equal(counted(play(store, player.id)).currentStreak, 1);
  c.advance(5000);
  assert.equal(counted(play(store, player.id)).currentStreak, 1, 'same UTC day');
  c.at('2026-11-16T00:00:01.000Z');
  assert.equal(counted(play(store, player.id)).currentStreak, 2, 'seconds later but a new UTC day');
  c.at('2026-11-17T12:00:00.000Z');
  const third = counted(play(store, player.id));
  assert.equal(third.currentStreak, 3);
  assert.deepEqual(third.newBadges, ['streak-3']);
  c.at('2026-11-18T23:00:00.000Z');
  assert.equal(store.profile(player.id)!.currentStreak, 3, 'still alive the next day before playing');
  c.at('2026-11-19T00:00:00.000Z');
  assert.equal(store.profile(player.id)!.currentStreak, 0, 'a whole missed UTC day breaks it');
  c.at('2026-11-19T08:00:00.000Z');
  assert.equal(counted(play(store, player.id)).currentStreak, 1);
  const profile = store.profile(player.id)!;
  assert.equal(profile.longestStreak, 3);
  store.close();
});

test('badges: attempt and streak badges unlock once, with dates; locked badges stay listed', () => {
  const c = clock(), store = freshStore(c), { player } = guest(store);
  const results = playMany(store, c, player.id, 50).map(counted);
  const unlocked = results.flatMap((r, i) => r.newBadges.map(b => `${i + 1}:${b}`));
  assert.deepEqual(unlocked, ['1:first-run', '1:top-ten', '10:regular', '50:dedicated']);
  for (let d = 1; d <= 6; d++) { c.at(new Date(T0 + d * DAY).toISOString()); counted(play(store, player.id)); }
  const badges = store.profile(player.id)!.badges;
  assert.equal(badges.length, 8, 'all badges listed');
  const earned = Object.fromEntries(badges.map(b => [b.id, b.earnedAt]));
  assert.equal(earned['first-run'], new Date(T0 + 4000).toISOString());
  assert.equal(earned['streak-3'], new Date(T0 + 2 * DAY).toISOString());
  assert.equal(earned['streak-7'], new Date(T0 + 6 * DAY).toISOString());
  assert.equal(earned.champion, new Date(Date.parse('2026-11-16T00:00:00Z')).toISOString(), 'sole ranked player is #1 at the first checkpoint');
  assert.equal(earned['reigning-champion'], null, 'only 6 checkpoints so far');
  c.advance(DAY);
  assert.ok(store.profile(player.id)!.badges.find(b => b.id === 'reigning-champion')!.earnedAt, '7th consecutive checkpoint');
  store.close();
});

// ---------------- rankings ----------------

test('rankings: deterministic ties, unranked results excluded from Highest Score, your position beyond the top ten', () => {
  const c = clock(), store = freshStore(c);
  const a = guest(store).player, b = guest(store).player, d = guest(store).player;
  c.advance(4000); play(store, a.id, { score: 80 });
  c.advance(4000); play(store, b.id, { score: 80 });           // same score, later
  c.advance(4000); play(store, d.id, { score: 99, aiStatus: 'unavailable' }); // not ranked
  c.advance(4000); play(store, d.id, { score: 99, aiStatus: 'declined' });
  const score = store.leaderboard('score', b.id);
  assert.deepEqual(score.entries.map(e => [e.rank, e.value, e.isYou]), [[1, 80, false], [2, 80, true]], 'earlier achiever wins the tie');
  assert.equal(store.profile(d.id)!.bestScore, null);
  assert.match(score.tieRule, /first/);
  const xp = store.leaderboard('xp', d.id);
  assert.deepEqual(xp.entries.map(e => e.value), [20, 10, 10]);
  assert.equal(xp.entries[0].isYou, true);
  assert.deepEqual(xp.entries.slice(1).map(e => e.name), [store.profile(a.id)!.name, store.profile(b.id)!.name], 'XP ties go to who reached it first');
  // 12 more players outrank a late low scorer; that player still sees their own position.
  for (let i = 0; i < 12; i++) { const p = guest(store).player; c.advance(4000); play(store, p.id, { score: 90 - i }); }
  const late = guest(store).player; c.advance(4000); play(store, late.id, { score: 5 });
  const board = store.leaderboard('score', late.id);
  assert.equal(board.entries.length, 10);
  assert.deepEqual(board.you, { rank: 15, value: 5 });
  assert.equal(board.total, 15);
  store.close();
});

test('rankings: Top Ten is earned on first entry only, from an improved ranked best', () => {
  const c = clock(), store = freshStore(c);
  for (let i = 0; i < 10; i++) { const p = guest(store).player; c.advance(4000); play(store, p.id, { score: 60 + i }); }
  const me = guest(store).player;
  c.advance(4000); assert.deepEqual(counted(play(store, me.id, { score: 10 })).newBadges, ['first-run'], 'rank 11: no Top Ten');
  c.advance(4000); assert.deepEqual(counted(play(store, me.id, { score: 95 })).newBadges, ['top-ten']);
  c.advance(4000); assert.deepEqual(counted(play(store, me.id, { score: 97 })).newBadges, [], 'unlocks once');
  store.close();
});

// ---------------- championship history ----------------

test('championship: checkpoints use persisted history at 00:00 UTC, not the current board', () => {
  const c = clock(Date.parse('2026-11-15T09:00:00Z')), store = freshStore(c);
  const a = guest(store).player, b = guest(store).player;
  play(store, a.id, { score: 80 });
  c.at('2026-11-15T23:59:55.000Z'); counted(play(store, b.id, { score: 79 }));
  c.at('2026-11-16T00:00:00.500Z'); counted(play(store, b.id, { score: 95 })); // just after the checkpoint
  // Nobody viewed anything until day 3: the day-1 checkpoint must still name A.
  c.at('2026-11-17T09:00:00Z');
  const champ = (id: string) => store.profile(id)!.badges.find(x => x.id === 'champion')!.earnedAt;
  assert.equal(champ(a.id), '2026-11-16T00:00:00.000Z');
  assert.equal(champ(b.id), '2026-11-17T00:00:00.000Z', 'B led at the day-2 checkpoint');
  assert.equal(store.leaderboard('score').entries[0].name, store.profile(b.id)!.name, 'current board shows B');
  store.close();
});

test('championship: Reigning Champion needs 7 consecutive checkpoints; a lost day restarts the run; tracking starts at launch', () => {
  const c = clock(Date.parse('2026-11-01T12:00:00Z')), store = freshStore(c);
  const a = guest(store).player, b = guest(store).player;
  play(store, a.id, { score: 70 });                             // A leads checkpoints 11-02 .. 11-05 (4)
  c.at('2026-11-05T12:00:00Z'); play(store, b.id, { score: 75 }); // B leads 11-06
  c.at('2026-11-06T12:00:00Z'); play(store, a.id, { score: 90 }); // A leads 11-07 .. onward
  const reign = (id: string) => store.profile(id)!.badges.find(x => x.id === 'reigning-champion')!.earnedAt;
  c.at('2026-11-12T12:00:00Z');                                  // checkpoints through 11-12 00:00: A has 6 in a row
  assert.equal(reign(a.id), null);
  c.at('2026-11-13T12:00:00Z');
  assert.equal(reign(a.id), '2026-11-13T00:00:00.000Z');
  assert.ok(store.profile(b.id)!.badges.find(x => x.id === 'champion')!.earnedAt);
  // A store launched later never back-fills checkpoints from before its launch.
  const late = freshStore(clock(Date.parse('2026-11-20T12:00:00Z')));
  assert.equal(late.trackingStartedAt, Date.parse('2026-11-20T12:00:00Z'));
  late.close();
  store.close();
});

// ---------------- persistence and migration ----------------

test('persistence: progress, identity and the launch date survive a restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'progression-'));
  try {
    const path = join(dir, 'relays.sqlite');
    const c = clock();
    let store = freshStore(c, path);
    const { player, token } = guest(store);
    store.rename(player.id, 'Night Owl');
    play(store, player.id, { score: 66 });
    store.close();
    c.advance(DAY);
    store = freshStore(c, path);
    const again = store.find(token)!;
    assert.equal(again.id, player.id);
    const profile = store.profile(again.id)!;
    assert.equal(profile.name, 'Night Owl'); assert.equal(profile.xp, 10); assert.equal(profile.bestScore, 66);
    assert.equal(store.trackingStartedAt, T0, 'launch date kept');
    assert.equal(store.find('not-a-real-token'), undefined);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration: additive on an existing database; existing tables and rows untouched; reruns are no-ops', () => {
  const dir = mkdtempSync(join(tmpdir(), 'progression-mig-'));
  try {
    const path = join(dir, 'relays.sqlite');
    const legacy = new DatabaseSync(path);
    legacy.exec("CREATE TABLE leaderboard_attempts (id TEXT PRIMARY KEY, score INTEGER); INSERT INTO leaderboard_attempts VALUES ('old-1', 42);");
    legacy.close();
    for (let i = 0; i < 2; i++) freshStore(clock(), path).close();
    const db = new DatabaseSync(path);
    assert.deepEqual({ ...db.prepare('SELECT id, score FROM leaderboard_attempts').get() as object }, { id: 'old-1', score: 42 });
    assert.equal((db.prepare("SELECT value FROM progression_meta WHERE key = 'schema_version'").get() as { value: string }).value, String(SCHEMA_VERSION));
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map(r => r.name);
    assert.deepEqual(tables, ['leaderboard_attempts', 'progression_attempts', 'progression_badges', 'progression_checkpoints', 'progression_days', 'progression_meta', 'progression_players']);
    const tokenColumn = (db.prepare('PRAGMA table_info(progression_players)').all() as Array<{ name: string }>).map(r => r.name);
    assert.ok(tokenColumn.includes('token_hash') && !tokenColumn.includes('token'), 'only a hash of the guest token is stored');
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------- HTTP: identity, scoring hook, validation ----------------

const LANDING = 2.6, CONE_HEIGHT = 1.84, DEG = Math.PI / 180;
function telemetry(over: Partial<AttemptTelemetry> = {}): AttemptTelemetry {
  const eye = new THREE.Vector3(SHOT_SPOT.x, LANDING + CONE_HEIGHT + 1.55, SHOT_SPOT.z);
  const dir = targetBase.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(eye).normalize();
  return {
    version: 1, shots: 1, ads: false, hit: true,
    startHeading: RAMP_HEADING, shotHeading: RAMP_HEADING + REFERENCE.turnDeg * DEG,
    aimHoldMs: REFERENCE.aimHoldMs, elapsedMs: 3000,
    shooter: { x: SHOT_SPOT.x, y: LANDING + CONE_HEIGHT, z: SHOT_SPOT.z, grounded: true },
    ray: { origin: [eye.x, eye.y, eye.z], direction: [dir.x, dir.y, dir.z] },
    ...over,
  };
}
type Judge = NonNullable<Parameters<typeof registerShowcaseScoring>[1]>['judge'];
const okJudge: Judge = async () => ({ status: 'ok', judgement: { similarity: 82, components: { setup: 90, turn: 80, aimHold: 70, shot: 95, timing: 75 }, feedback: 'Nice.', confidence: .7 } }) as GeminiOutcome;

async function withApp(fn: (api: Api, c: ReturnType<typeof clock>) => Promise<void>, opts: { judge?: Judge; guestsPerHour?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'progression-http-'));
  const referencePath = join(dir, 'ref.mp4');
  writeFileSync(referencePath, Buffer.from('reference-bytes'));
  const c = clock();
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const progression = registerProgression(app, { store: openProgressionStore({ databasePath: ':memory:', now: c.now }), now: c.now, guestsPerHour: opts.guestsPerHour });
  registerShowcaseScoring(app, { referencePath, judge: opts.judge ?? okJudge, env: () => ({ apiKey: 'test-key' }), progress: progression.scoring, requestsPerMinute: 1000, aiPerMinute: 1000, maxConcurrent: 10, now: c.now });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try { await fn(new Api(`http://127.0.0.1:${(server.address() as AddressInfo).port}`), c); }
  finally { server.close(); progression.close(); rmSync(dir, { recursive: true, force: true }); }
}
class Api {
  cookie = '';
  constructor(readonly base: string) {}
  private keep(res: Response) {
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return res;
  }
  get(path: string) { return fetch(this.base + path, { headers: this.cookie ? { cookie: this.cookie } : {} }).then(r => this.keep(r)); }
  post(path: string, body: unknown) {
    return fetch(this.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) }, body: JSON.stringify(body) }).then(r => this.keep(r));
  }
  score(t: AttemptTelemetry | Record<string, unknown>, attemptId?: string, clip = true, extra: Record<string, string> = {}) {
    return fetch(`${this.base}/api/showcase/score`, {
      method: 'POST',
      headers: {
        'x-score-telemetry': Buffer.from(JSON.stringify(t)).toString('base64url'), 'x-score-ai': clip ? 'yes' : 'no',
        ...(clip ? { 'Content-Type': 'video/webm' } : {}), ...(attemptId ? { 'x-attempt-id': attemptId } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}), ...extra,
      },
      body: clip ? new Uint8Array(Buffer.from(`clip-${attemptId ?? 'none'}`)) : undefined,
    }).then(r => this.keep(r));
  }
  async me() { return (await (await this.get('/api/progression/me')).json() as { profile: Profile | null }).profile; }
}

test('http: opening the page creates nothing; the first scored attempt issues a secure guest cookie', async () => {
  await withApp(async api => {
    const res = await api.get('/api/progression/me');
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal((await res.json() as { profile: unknown }).profile, null);
    const scoredRes = await api.score(telemetry(), randomUUID());
    const cookie = scoredRes.headers.get('set-cookie')!;
    assert.match(cookie, new RegExp(`^${GUEST_COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`));
    const body = await scoredRes.json() as ScoreResponse;
    assert.equal(body.progress?.status, 'counted');
    assert.equal((body.progress as { ranked: boolean }).ranked, true);
    const profile = (await api.me())!;
    assert.equal(profile.xp, 10); assert.match(profile.name, /^Player [0-9A-F]{4}$/);
    assert.equal(profile.storageDurable, false);
  });
});

test('http: repeating the same attempt request or refreshing never adds XP; concurrent duplicates are recorded once', async () => {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  let slow = false;
  const judge: Judge = async o => { if (slow) await gate; return okJudge!(o); };
  await withApp(async (api, c) => {
    const id = randomUUID();
    const first = await (await api.score(telemetry(), id)).json();
    for (let i = 0; i < 3; i++) {
      c.advance(5000);
      assert.deepEqual(await (await api.score(telemetry(), id)).json(), { ...(first as object), replayed: true }, 'identical stored result, marked as a replay');
      await api.me();
    }
    assert.equal((await api.me())!.xp, 10);
    // Two identical in-flight requests: one is scored, the other is told it's busy.
    slow = true; c.advance(5000);
    const twin = randomUUID();
    const a = api.score(telemetry(), twin), b = new Promise<Response>(r => setTimeout(() => r(api.score(telemetry(), twin)), 50));
    const second = await b; assert.equal(second.status, 409);
    release();
    assert.equal((await a).status, 200);
    assert.equal((await api.me())!.xp, 20);
    // A fresh attempt id for a too-fast follow-up does not count.
    const fast = await (await api.score(telemetry(), randomUUID())).json() as ScoreResponse;
    assert.equal(fast.progress?.status, 'not-counted');
  }, { judge });
});

test('http: the server judges eligibility and ranking; client-claimed XP, scores or badges are ignored', async () => {
  await withApp(async (api, c) => {
    const quick = await (await api.score(telemetry({ elapsedMs: 200 }), randomUUID())).json() as ScoreResponse;
    assert.equal(quick.progress?.status, 'not-counted');
    c.advance(5000);
    const idle = await (await api.score(telemetry({ shooter: { x: SPAWN_POINT.x, y: 0, z: SPAWN_POINT.z, grounded: true }, shotHeading: RAMP_HEADING }), randomUUID())).json() as ScoreResponse;
    assert.match((idle.progress as { reason: string }).reason, /Move or turn/);
    c.advance(5000);
    const forged = { ...telemetry(), xp: 5000, score: 100, badges: ['champion'] };
    const res = await api.score(forged, randomUUID(), false, { 'x-xp': '9999', 'x-score': '100' });
    assert.equal(res.status, 200, 'unknown fields are dropped by the telemetry parser');
    const forgedBody = await res.json() as ScoreResponse;
    const forgedProgress = counted(forgedBody.progress!);
    assert.equal(forgedProgress.xpAwarded, 10, 'XP comes from the server rule, not the client');
    assert.equal(forgedProgress.ranked, false, 'game-data-only result is not ranked');
    assert.deepEqual(forgedProgress.newBadges, ['first-run']);
    c.advance(5000);
    const noId = await (await api.score(telemetry(), undefined)).json() as ScoreResponse;
    assert.equal(noId.progress?.status, 'not-counted');
    c.advance(5000);
    assert.equal((await api.score(telemetry(), 'bad id!')).status, 200, 'bad attempt ids are scored but not recorded');
    const profile = (await api.me())!;
    assert.equal(profile.xp, 10);
    assert.equal(profile.badges.find(b => b.id === 'champion')!.earnedAt, null);
    assert.equal(profile.bestScore, null, 'no ranked score yet');
  });
});

test('http: names are validated, never identity; unknown cookies get a fresh guest; leaderboard input is bounded', async () => {
  await withApp(async (api, c) => {
    for (const name of ['', 'x'.repeat(30), '<b>hi</b>', 5]) assert.equal((await api.post('/api/progression/me/name', { name })).status, 400);
    const ok = await api.post('/api/progression/me/name', { name: '  Ramp   Rat ' });
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { profile: Profile }).profile.name, 'Ramp Rat');
    await api.score(telemetry(), randomUUID());
    const twin = new Api(api.base);
    await twin.post('/api/progression/me/name', { name: 'Ramp Rat' });
    c.advance(5000);
    await twin.score(telemetry(), randomUUID());
    const board = await (await api.get('/api/progression/leaderboard?board=xp')).json() as Leaderboard;
    assert.deepEqual(board.entries.map(e => [e.name, e.isYou]), [['Ramp Rat', true], ['Ramp Rat', false]], 'same name, separate players');
    assert.equal((await api.get('/api/progression/leaderboard?board=../../etc')).status, 400);
    const stranger = new Api(api.base);
    stranger.cookie = `${GUEST_COOKIE}=forged-token-value`;
    assert.equal(await stranger.me(), null, 'an unknown cookie is not anyone');
  });
});

test('http: guest creation is rate-limited per client', async () => {
  await withApp(async api => {
    for (let i = 0; i < 2; i++) assert.equal((await new Api(api.base).post('/api/progression/me/name', { name: `Guest ${i}` })).status, 200);
    assert.equal((await new Api(api.base).post('/api/progression/me/name', { name: 'Guest 3' })).status, 503);
    const body = await (await new Api(api.base).score(telemetry(), randomUUID())).json() as ScoreResponse;
    assert.equal(body.progress?.status, 'not-counted', 'scoring still works without a profile');
  }, { guestsPerHour: 2 });
});
