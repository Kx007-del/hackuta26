import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  COMPETITION_CHALLENGE_VERSION, HOSTING_NOTICE, type HostingPackage, type CompetitionRules,
  type CompetitionState, type CompetitionView, type CompetitionStanding, type CompetitionReceipt,
  type CompetitionAnalytics,
} from '../../shared/competitions';
import { identifier, reject } from './rules';

type EventRow = { id: string; code: string; owner_id: string; rules: string; state: CompetitionState; version: number; published_at: number | null; finalized_at: number | null; challenge_version: string; final_snapshot: string | null; creation_hash: string };
type TicketRow = { id: string; event_id: string; player_id: string; client_id: string; started_at: number; expires_at: number; payload_hash: string | null; completed_at: number | null; score: number | null; hit: number | null; eligible: number | null; reason: string | null; review: 'clear' | 'pending' | 'approved' | 'excluded'; flags: string };
/** Only the existing server scoring route constructs this after validating/re-deriving telemetry. */
export type ValidatedCompetitionScore = { score: number; hit: boolean; ineligible?: string; elapsedMs: number };
type Param = string | number | null;
const iso = (n: number) => new Date(n).toISOString();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export function openCompetitionStore(options: { databasePath?: string; now?: () => number; revision?: string | null } = {}) {
  const now = options.now ?? Date.now;
  const configured = options.databasePath ?? (process.env.DATABASE_PATH?.trim() || resolve('data/relays.sqlite'));
  const file = configured === ':memory:' ? configured : resolve(configured);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  const get = <T>(sql: string, ...params: Param[]) => db.prepare(sql).get(...params) as T | undefined;
  const all = <T>(sql: string, ...params: Param[]) => db.prepare(sql).all(...params) as T[];
  const run = (sql: string, ...params: Param[]) => db.prepare(sql).run(...params);
  function tx<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  db.exec('CREATE TABLE IF NOT EXISTS competition_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const version = Number(get<{ value: string }>("SELECT value FROM competition_meta WHERE key='schema_version'")?.value ?? 0);
  if (version > 1 || !Number.isInteger(version) || version < 0) { db.close(); throw new Error('Unsupported competition schema version.'); }
  if (version === 0) tx(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS competition_organizers (player_id TEXT PRIMARY KEY, package TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS competition_events (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, creation_key TEXT NOT NULL,
        creation_hash TEXT NOT NULL, rules TEXT NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL,
        challenge_version TEXT NOT NULL, release_revision TEXT, created_at INTEGER NOT NULL,
        published_at INTEGER, finalized_at INTEGER, final_snapshot TEXT, UNIQUE(owner_id,creation_key));
      CREATE TABLE IF NOT EXISTS competition_entrants (
        event_id TEXT NOT NULL REFERENCES competition_events(id), player_id TEXT NOT NULL,
        name TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY(event_id,player_id));
      CREATE TABLE IF NOT EXISTS competition_attempts (
        id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES competition_events(id), player_id TEXT NOT NULL,
        client_id TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        payload_hash TEXT, completed_at INTEGER, score INTEGER, hit INTEGER, eligible INTEGER, reason TEXT,
        review TEXT NOT NULL DEFAULT 'clear', flags TEXT NOT NULL DEFAULT '[]', UNIQUE(event_id,player_id,client_id));
      CREATE INDEX IF NOT EXISTS competition_attempts_event ON competition_attempts(event_id,player_id,completed_at);
      CREATE INDEX IF NOT EXISTS competition_attempts_hash ON competition_attempts(event_id,payload_hash);
      CREATE TABLE IF NOT EXISTS competition_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES competition_events(id),
        actor_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
    run("INSERT OR REPLACE INTO competition_meta(key,value) VALUES('schema_version','1')");
  });

  const row = (id: string) => get<EventRow>('SELECT * FROM competition_events WHERE id=?', id) ?? reject(404, 'Competition not found.');
  const rules = (e: EventRow) => JSON.parse(e.rules) as CompetitionRules;
  const state = (e: EventRow, t = now()): CompetitionState => e.state === 'published' && t >= Date.parse(rules(e).endsAt) ? 'closed' : e.state;
  function owner(id: string, actor: string) {
    const e = row(id);
    if (e.owner_id !== actor) reject(403, 'Only this competition’s organizer may manage it.');
    return e;
  }
  function audit(e: EventRow, actor: string, action: string, details: unknown, t = now()) {
    run('INSERT INTO competition_audit(event_id,actor_id,action,details,created_at) VALUES(?,?,?,?,?)', e.id, actor, action, JSON.stringify(details), t);
  }
  function expected(e: EventRow, v: number) { if (!Number.isInteger(v) || e.version !== v) reject(409, 'Competition changed. Refresh its version before retrying.'); }
  function openForAttempts(e: EventRow, t: number) {
    const r = rules(e);
    if (state(e, t) !== 'published' || t < Date.parse(r.startsAt) || t >= Date.parse(r.endsAt)) reject(409, 'Entries are not open at this server time.');
    if (e.challenge_version !== COMPETITION_CHALLENGE_VERSION) reject(409, 'This challenge version is not currently available.');
  }
  function view(e: EventRow): CompetitionView {
    return { ...rules(e), id: e.id, code: e.code, publicPath: `/events/${e.code}`, state: state(e), version: e.version,
      challengeVersion: e.challenge_version, rulesFrozen: e.state !== 'draft', publishedAt: e.published_at === null ? null : iso(e.published_at),
      finalizedAt: e.finalized_at === null ? null : iso(e.finalized_at), example: false, hostingNotice: HOSTING_NOTICE,
      prizeNotice: 'Example prize description only. No real prize is offered or fulfilled.', storageDurable: false };
  }
  function publicRow(code: string) {
    const e = get<EventRow>('SELECT * FROM competition_events WHERE code=? COLLATE NOCASE', code);
    if (!e || e.state === 'draft') reject(404, 'Published competition not found.');
    return e;
  }
  function standings(e: EventRow): CompetitionStanding[] {
    if (e.final_snapshot) return JSON.parse(e.final_snapshot).leaderboard;
    const hit = rules(e).tieBreaker === 'score-hit-earliest-v1' ? 'a.hit DESC,' : '';
    const order = `a.score DESC,${hit}a.completed_at ASC,a.id ASC`;
    const rows = all<{ player_id: string; name: string; score: number; hit: number; completed_at: number; id: string }>(`
      WITH best AS (SELECT a.*, ROW_NUMBER() OVER(PARTITION BY a.player_id ORDER BY ${order}) AS n
      FROM competition_attempts a WHERE a.event_id=? AND a.completed_at IS NOT NULL AND a.eligible=1 AND a.review IN ('clear','approved'))
      SELECT a.player_id,e.name,a.score,a.hit,a.completed_at,a.id FROM best a
      JOIN competition_entrants e ON e.event_id=a.event_id AND e.player_id=a.player_id WHERE a.n=1
      ORDER BY a.score DESC,${hit}a.completed_at ASC,a.player_id ASC`, e.id);
    return rows.map((r, i) => ({ rank: i + 1, entrantId: r.player_id, name: r.name, score: r.score, hit: !!r.hit, achievedAt: iso(r.completed_at), resultId: r.id }));
  }
  function analytics(e: EventRow): CompetitionAnalytics {
    if (e.final_snapshot) return JSON.parse(e.final_snapshot).analytics;
    const participants = get<{ n: number }>('SELECT COUNT(*) AS n FROM competition_entrants WHERE event_id=?', e.id)!.n;
    const a = get<{ started: number; completed: number; eligible: number; pending: number; excluded: number }>(`
      SELECT COUNT(*) AS started,COUNT(completed_at) AS completed,
      COALESCE(SUM(CASE WHEN eligible=1 AND review IN ('clear','approved') THEN 1 ELSE 0 END),0) AS eligible,
      COALESCE(SUM(CASE WHEN review='pending' THEN 1 ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN review='excluded' THEN 1 ELSE 0 END),0) AS excluded
      FROM competition_attempts WHERE event_id=?`, e.id)!;
    return { participants, startedAttempts: a.started, completedAttempts: a.completed, eligibleAttempts: a.eligible,
      pendingReview: a.pending, excludedAttempts: a.excluded, completionRate: a.started ? a.completed / a.started : 0 };
  }
  function ticketView(a: TicketRow) {
    return { id: a.id, eventId: a.event_id, attemptId: a.client_id, startedAt: iso(a.started_at), expiresAt: iso(a.expires_at),
      completed: a.completed_at !== null, consumesAttempt: true, challengeTemplate: rules(row(a.event_id)).challengeTemplate,
      challengeVersion: row(a.event_id).challenge_version };
  }
  function receipt(a: TicketRow, replayed: boolean): CompetitionReceipt {
    return { eventId: a.event_id, attemptId: a.client_id, resultId: a.id, score: a.score!, hit: !!a.hit, eligible: !!a.eligible,
      ineligibleReason: a.reason, review: a.review, submittedAt: iso(a.completed_at!), replayed, globalXpAwarded: 0 };
  }
  const persistence = { storageDurable: false, engine: 'sqlite', sameFilesystemRestart: file !== ':memory:',
    redeployPersistence: 'not-guaranteed', notice: 'Current Render free-plan storage is temporary. Events and guest ownership may be lost on restart, redeploy or spin-down.' } as const;

  return {
    persistence,
    enroll(actor: string, hostingPackage: HostingPackage) {
      tx(() => { run('INSERT INTO competition_organizers(player_id,package,created_at) VALUES(?,?,?) ON CONFLICT(player_id) DO UPDATE SET package=excluded.package', actor, hostingPackage, now()); });
      return { organizer: true, package: hostingPackage, demonstration: true, charged: false, notice: HOSTING_NOTICE };
    },
    organizer(actor: string) { return get<{ package: HostingPackage }>('SELECT package FROM competition_organizers WHERE player_id=?', actor) ?? null; },
    create(actor: string, key: string, r: CompetitionRules) {
      identifier(key);
      return tx(() => {
        if (!get('SELECT player_id FROM competition_organizers WHERE player_id=?', actor)) reject(403, 'Enable hosting for this signed-in browser first.');
        const serialized = JSON.stringify(r), digest = hash(serialized);
        const previous = get<EventRow>('SELECT * FROM competition_events WHERE owner_id=? AND creation_key=?', actor, key);
        if (previous) { if (previous.creation_hash !== digest) reject(409, 'Request id was already used with different rules.'); return view(previous); }
        if (get<{ n: number }>('SELECT COUNT(*) AS n FROM competition_events')!.n >= 5000 || get<{ n: number }>('SELECT COUNT(*) AS n FROM competition_events WHERE owner_id=?', actor)!.n >= 100) reject(429, 'Competition storage limit reached.');
        const id = randomUUID(), code = randomBytes(6).toString('hex').toUpperCase(), t = now();
        run('INSERT INTO competition_events(id,code,owner_id,creation_key,creation_hash,rules,state,version,challenge_version,release_revision,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, code, actor, key, digest, serialized, 'draft', 1, COMPETITION_CHALLENGE_VERSION, options.revision ?? null, t);
        const e = row(id); audit(e, actor, 'created', { rules: r, demonstration: true }, t); return view(e);
      });
    },
    edit(actor: string, id: string, v: number, r: CompetitionRules) {
      return tx(() => { const e = owner(id, actor); expected(e, v); if (e.state !== 'draft') reject(409, 'Published rules are frozen.');
        run('UPDATE competition_events SET rules=?,version=version+1 WHERE id=?', JSON.stringify(r), id);
        audit(e, actor, 'edited', { before: rules(e), after: r }); return view(row(id)); });
    },
    transition(actor: string, id: string, v: number, action: 'publish' | 'close' | 'finalize', acknowledged = false) {
      return tx(() => {
        const e = owner(id, actor); expected(e, v); const t = now(), effective = state(e, t);
        if (action === 'publish') {
          if (e.state !== 'draft' || t >= Date.parse(rules(e).endsAt)) reject(409, 'Only an unexpired draft can be published.');
          run("UPDATE competition_events SET state='published',published_at=?,version=version+1 WHERE id=?", t, id);
        } else if (action === 'close') {
          if (e.state !== 'published') reject(409, 'Only a published competition can be closed.');
          run("UPDATE competition_events SET state='closed',version=version+1 WHERE id=?", id);
        } else {
          if (effective !== 'closed' || !acknowledged) reject(409, 'Close entries and acknowledge organizer review before finalizing.');
          if (analytics(e).pendingReview > 0) reject(409, 'Review every suspicious result before finalizing.');
          const snapshot = { leaderboard: standings(e), analytics: analytics(e) };
          run("UPDATE competition_events SET state='finalized',finalized_at=?,final_snapshot=?,version=version+1 WHERE id=?", t, JSON.stringify(snapshot), id);
        }
        audit(e, actor, action, { previousState: effective, rulesFrozen: true }, t); return view(row(id));
      });
    },
    owned(actor: string, id: string) { return view(owner(id, actor)); },
    ownedList(actor: string) { return all<EventRow>('SELECT * FROM competition_events WHERE owner_id=? ORDER BY created_at DESC,id', actor).map(view); },
    publicEvent(code: string) { return view(publicRow(code)); },
    browse(search = '') { return all<EventRow>("SELECT * FROM competition_events WHERE state='published' ORDER BY created_at DESC,id").filter(e => now() < Date.parse(rules(e).endsAt) && rules(e).title.toLocaleLowerCase('en-US').includes(search.toLocaleLowerCase('en-US'))).slice(0, 100).map(view); },
    join(actor: string, name: string, id: string) {
      return tx(() => {
        const e = row(id), t = now();
        if (state(e, t) !== 'published') reject(409, 'This competition is not accepting entrants.');
        const existing = get('SELECT player_id FROM competition_entrants WHERE event_id=? AND player_id=?', id, actor);
        if (!existing) {
          if (get<{ n: number }>('SELECT COUNT(*) AS n FROM competition_entrants WHERE event_id=?', id)!.n >= 1000) reject(429, 'Entrant limit reached.');
          run('INSERT INTO competition_entrants(event_id,player_id,name,joined_at) VALUES(?,?,?,?)', id, actor, name, t);
        }
        return { joined: true, eventId: id, entrantId: actor, replayed: !!existing };
      });
    },
    entrant(actor: string, id: string) {
      const e = row(id);
      if (e.state === 'draft') reject(404, 'Published competition not found.');
      return { joined: !!get('SELECT player_id FROM competition_entrants WHERE event_id=? AND player_id=?', id, actor),
        usedAttempts: get<{ n: number }>('SELECT COUNT(*) AS n FROM competition_attempts WHERE event_id=? AND player_id=?', id, actor)!.n,
        attemptLimit: rules(e).attemptLimit, results: all<TicketRow>('SELECT * FROM competition_attempts WHERE event_id=? AND player_id=? AND completed_at IS NOT NULL ORDER BY completed_at,id', id, actor).map(a => receipt(a, false)) };
    },
    begin(actor: string, id: string, clientId: string) {
      identifier(clientId);
      return tx(() => {
        const e = row(id);
        const existing = get<TicketRow>('SELECT * FROM competition_attempts WHERE event_id=? AND player_id=? AND client_id=?', id, actor, clientId);
        if (existing) return { ...ticketView(existing), replayed: true };
        const t = now(); openForAttempts(e, t);
        if (!get('SELECT player_id FROM competition_entrants WHERE event_id=? AND player_id=?', id, actor)) reject(403, 'Join this competition before starting an attempt.');
        if (get<{ n: number }>('SELECT COUNT(*) AS n FROM competition_attempts WHERE event_id=? AND player_id=?', id, actor)!.n >= rules(e).attemptLimit) reject(409, 'Competition attempt limit reached.');
        // Only one unfinished, unexpired attempt per entrant/event, including concurrent requests.
        if (get('SELECT id FROM competition_attempts WHERE event_id=? AND player_id=? AND completed_at IS NULL AND expires_at>?', id, actor, t)) reject(409, 'Finish the current attempt or wait for it to expire.');
        const ticketId = randomUUID(), expires = Math.min(t + 300000, Date.parse(rules(e).endsAt));
        run('INSERT INTO competition_attempts(id,event_id,player_id,client_id,started_at,expires_at) VALUES(?,?,?,?,?,?)', ticketId, id, actor, clientId, t, expires);
        return { ...ticketView(get<TicketRow>('SELECT * FROM competition_attempts WHERE id=?', ticketId)!), replayed: false };
      });
    },
    record(actor: string, id: string, ticketId: string, clientId: string, payloadHash: string, score: ValidatedCompetitionScore): CompetitionReceipt {
      return tx(() => {
        const e = row(id), a = get<TicketRow>('SELECT * FROM competition_attempts WHERE id=?', ticketId);
        if (!a || a.event_id !== id || a.player_id !== actor || a.client_id !== clientId) reject(403, 'Attempt does not belong to this entrant and competition.');
        if (a.completed_at !== null) {
          if (a.payload_hash !== payloadHash) reject(409, 'This attempt was already submitted with different telemetry.');
          return receipt(a, true);
        }
        const t = now(); openForAttempts(e, t);
        if (t >= a.expires_at) reject(409, 'Attempt expired. It still consumes its reserved attempt.');
        if (t - a.started_at < 1500) reject(409, 'Wait at least 1.5 seconds after the server starts the attempt.');
        if (!Number.isInteger(score.score) || score.score < 0 || score.score > 100 || typeof score.hit !== 'boolean') reject(400, 'Invalid server scoring result.');
        const flags: string[] = [];
        if (Math.abs(score.elapsedMs - (t - a.started_at)) > 3000) flags.push('Client/server duration differs by more than three seconds.');
        if (get('SELECT id FROM competition_attempts WHERE event_id=? AND payload_hash=? AND id<>? LIMIT 1', id, payloadHash, ticketId)) flags.push('Identical telemetry appears in another event attempt.');
        const reason = score.ineligible ?? (rules(e).scoring.requireHit && !score.hit ? 'This competition requires a hit.' : null);
        run('UPDATE competition_attempts SET payload_hash=?,completed_at=?,score=?,hit=?,eligible=?,reason=?,review=?,flags=? WHERE id=?', payloadHash, t, score.score, Number(score.hit), Number(reason === null), reason, flags.length ? 'pending' : 'clear', JSON.stringify(flags), ticketId);
        if (flags.length) audit(e, 'server', 'flagged', { resultId: ticketId, reasons: flags }, t);
        return receipt(get<TicketRow>('SELECT * FROM competition_attempts WHERE id=?', ticketId)!, false);
      });
    },
    review(actor: string, id: string, resultId: string, decision: 'flag' | 'approve' | 'exclude', reason: string) {
      return tx(() => {
        const e = owner(id, actor);
        if (e.state === 'draft' || e.state === 'finalized') reject(409, 'This competition cannot be moderated in its current state.');
        const a = get<TicketRow>('SELECT * FROM competition_attempts WHERE id=? AND event_id=? AND completed_at IS NOT NULL', resultId, id);
        if (!a) reject(404, 'Result not found in this competition.');
        const review = decision === 'flag' ? 'pending' : decision === 'approve' ? 'approved' : 'excluded';
        run('UPDATE competition_attempts SET review=? WHERE id=?', review, resultId);
        audit(e, actor, decision, { resultId, before: a.review, after: review, reason });
        return receipt(get<TicketRow>('SELECT * FROM competition_attempts WHERE id=?', resultId)!, false);
      });
    },
    moderation(actor: string, id: string) { owner(id, actor); return all<TicketRow>('SELECT * FROM competition_attempts WHERE event_id=? AND completed_at IS NOT NULL ORDER BY completed_at,id', id).map(a => ({ ...receipt(a, false), entrantId: a.player_id, flags: JSON.parse(a.flags) })); },
    analytics(actor: string, id: string) { return analytics(owner(id, actor)); },
    audit(actor: string, id: string) { owner(id, actor); return all<{ id: number; actor_id: string; action: string; details: string; created_at: number }>('SELECT * FROM competition_audit WHERE event_id=? ORDER BY id', id).map(a => ({ id: a.id, actorId: a.actor_id, action: a.action, details: JSON.parse(a.details), at: iso(a.created_at) })); },
    leaderboard(code: string, offset = 0) { const e = publicRow(code), rows = standings(e); return { eventId: e.id, state: state(e), finalized: e.state === 'finalized', tieBreaker: rules(e).tieBreaker, total: rows.length, entries: rows.slice(offset, offset + 100), example: false, storageDurable: false }; },
    close() { db.close(); },
  };
}
export type CompetitionStore = ReturnType<typeof openCompetitionStore>;
