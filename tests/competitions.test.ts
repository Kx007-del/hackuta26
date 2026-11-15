// Codex 2 author validation. Independent Claude 2 testing/review is still required before release.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { COMPETITION_TEMPLATE, type CompetitionRules } from '../shared/competitions';
import { openProgressionStore } from '../packages/progression/store';
import { registerProgression } from '../packages/progression/server';
import { registerCompetitions } from '../packages/competitions/server';
import { openCompetitionStore } from '../packages/competitions/store';
import { parseRules, CompetitionError } from '../packages/competitions/rules';
import { registerShowcaseScoring } from '../packages/showcase-scoring/server';
import { SHOT_SPOT, RAMP_HEADING } from '../packages/gameplay/hillsideScene';

const T = Date.parse('2026-11-15T12:00:00.000Z');
const iso = (t: number) => new Date(t).toISOString();
const draft = (over: Partial<CompetitionRules> = {}): CompetitionRules => ({ title: 'Test event', description: 'Author test, not a live event',
  challengeTemplate: COMPETITION_TEMPLATE, startsAt: iso(T), endsAt: iso(T + 600000), attemptLimit: 5,
  scoring: { method: 'server-game-data-v1', requireHit: false }, tieBreaker: 'score-earliest-v1', prizeDescription: 'Imaginary ribbon only', ...over });
const status = (fn: () => unknown, code: number) => assert.throws(fn, (e: unknown) => e instanceof CompetitionError && e.status === code);
const telemetry = (extra = 0) => ({ version: 1, shots: 1, ads: false, hit: true, startHeading: RAMP_HEADING,
  shotHeading: RAMP_HEADING - 65 * Math.PI / 180, aimHoldMs: 870 + extra, elapsedMs: 2000,
  shooter: { x: SHOT_SPOT.x, y: 4.44, z: SHOT_SPOT.z, grounded: true },
  ray: { origin: [SHOT_SPOT.x, 5.94, SHOT_SPOT.z], direction: [0, 1, 0] } });
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'h26-events-')), file = join(dir, 'app.sqlite');
  const clock = { t: T }, now = () => clock.t;
  let p = openProgressionStore({ databasePath: file, now });
  let c = openCompetitionStore({ databasePath: file, now });
  let server: ReturnType<express.Express['listen']>;
  let base = '';
  async function boot() {
    const app = express(); app.use(express.json());
    const progression = registerProgression(app, { store: p, now, renamesPerHour: 10000 });
    const events = registerCompetitions(app, { identity: progression.identity, store: c, now });
    registerShowcaseScoring(app, { progress: progression.scoring, competitions: events.scoring, now, requestsPerMinute: 10000,
      judge: async () => { throw new Error('Event requests must never invoke AI judging'); } });
    server = await new Promise<ReturnType<express.Express['listen']>>(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }
  await boot();
  async function request(cookie: string, path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() as any, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
  }
  async function guest(name: string) {
    const r = await request('', '/api/progression/me/name', 'POST', { name }); assert.equal(r.status, 200); return { cookie: r.cookie, id: r.body.profile.id };
  }
  async function event(actor: { cookie: string }, rules = draft()) {
    assert.equal((await request(actor.cookie, '/api/organizer/enroll', 'POST', { package: 'creator-demo', acknowledgeDemo: true })).status, 200);
    const r = await request(actor.cookie, '/api/organizer/events', 'POST', rules, { 'idempotency-key': randomUUID() }); assert.equal(r.status, 201); return r.body.event;
  }
  async function publish(actor: { cookie: string }, e: any) {
    const r = await request(actor.cookie, `/api/organizer/events/${e.id}/publish`, 'POST', { version: e.version }); assert.equal(r.status, 200); return r.body.event;
  }
  async function reserve(actor: { cookie: string }, e: any, attemptId = randomUUID()) {
    const r = await request(actor.cookie, `/api/competitions/${e.id}/attempts`, 'POST', { attemptId }); assert.equal(r.status, 201); return r.body.attempt;
  }
  const score = (actor: { cookie: string }, e: any, ticket: any, data = telemetry(), body?: unknown) => request(actor.cookie, '/api/showcase/score', 'POST', body,
    { 'x-competition-id': e.id, 'x-competition-attempt': ticket.id, 'x-attempt-id': ticket.attemptId, 'x-score-telemetry': Buffer.from(JSON.stringify(data)).toString('base64url'), 'x-score-ai': 'yes' });
  async function stop() { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
  return { request, guest, event, publish, reserve, score, clock, file, get store() { return c; }, get progression() { return p; },
    async restart() { await stop(); c.close(); p.close(); p = openProgressionStore({ databasePath: file, now }); c = openCompetitionStore({ databasePath: file, now }); await boot(); },
    async close() { await stop(); c.close(); p.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('competition rules: strict UTC, real dates, curated template and fixed scoring/tie choices', () => {
  assert.equal(parseRules(draft()).startsAt, iso(T));
  for (const over of [{ startsAt: '2026-02-30T12:00:00Z' }, { startsAt: '2026-11-15T12:00:00+00:00' }, { endsAt: iso(T) }, { attemptLimit: 0 }, { attemptLimit: 51 }, { challengeTemplate: 'uploaded-clip' }, { scoring: { method: 'client-score', requireHit: false } }, { tieBreaker: 'random' }, { ownerId: 'fake' }]) status(() => parseRules({ ...draft(), ...over }), 400);
});

test('ownership: secret cookie, not display name or public event code; drafts are private', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Same Name'), b = await f.guest('Same Name'); const e = await f.event(a);
    assert.equal((await f.request('', '/api/organizer/events')).status, 401);
    assert.equal((await f.request(b.cookie, `/api/organizer/events/${e.id}`)).status, 403);
    assert.equal((await f.request(b.cookie, `/api/organizer/events/${e.id}`, 'PUT', { version: e.version, rules: draft() })).status, 403);
    assert.equal((await f.request('', `/api/competitions/${e.code}`)).status, 404);
    assert.deepEqual((await f.request('', '/api/competitions')).body.events, []);
    const p = await f.publish(a, e);
    assert.equal((await f.request('', `/api/competitions/${p.code}`)).status, 200);
    assert.equal((await f.request(e.code, `/api/organizer/events/${p.id}/close`, 'POST', { version: p.version })).status, 401);
    assert.equal((await f.request(b.cookie, `/api/organizer/events/${p.id}/close`, 'POST', { version: p.version })).status, 403);
  } finally { await f.close(); }
});

test('hosting preview/enrollment are explicitly demo/no-charge; invalid paid fields rejected', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Organizer');
    const preview = (await f.request('', '/api/hosting/preview')).body;
    assert.equal(preview.charged, false); assert.equal(preview.demonstration, true); assert.ok(preview.packages.every((p: any) => p.checkout === false));
    assert.equal((await f.request(a.cookie, '/api/organizer/events', 'POST', draft(), { 'idempotency-key': randomUUID() })).status, 403);
    assert.equal((await f.request(a.cookie, '/api/organizer/enroll', 'POST', { package: 'sponsor-demo', acknowledgeDemo: true, payment: 10 })).status, 400);
    assert.equal((await f.request(a.cookie, '/api/organizer/enroll', 'POST', { package: 'sponsor-demo', acknowledgeDemo: true })).body.charged, false);
    assert.equal((await f.request(a.cookie, '/api/organizer/enroll', 'POST', { package: 'sponsor-demo', acknowledgeDemo: true }, { origin: 'https://evil.test' })).status, 403);
  } finally { await f.close(); }
});

test('creation retries are idempotent and draft versioning/publication freezes all rules', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const e = await f.event(a), key = randomUUID();
    const create = () => f.request(a.cookie, '/api/organizer/events', 'POST', draft(), { 'idempotency-key': key });
    const responses = await Promise.all([create(), create(), create()]); assert.equal(new Set(responses.map(r => r.body.event.id)).size, 1);
    assert.equal((await f.request(a.cookie, '/api/organizer/events', 'POST', draft({ title: 'Changed' }), { 'idempotency-key': key })).status, 409);
    const edited = await f.request(a.cookie, `/api/organizer/events/${e.id}`, 'PUT', { version: 1, rules: draft({ title: 'Edited' }) }); assert.equal(edited.status, 200);
    assert.equal((await f.request(a.cookie, `/api/organizer/events/${e.id}/publish`, 'POST', { version: 1 })).status, 409);
    const published = await f.publish(a, edited.body.event); assert.equal(published.rulesFrozen, true);
    assert.equal((await f.request(a.cookie, `/api/organizer/events/${e.id}`, 'PUT', { version: published.version, rules: draft() })).status, 409);
  } finally { await f.close(); }
});

test('UTC boundaries: join upcoming, start inclusive, end exclusive for reservations/results', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'), b = await f.guest('Player'); const e = await f.publish(a, await f.event(a, draft({ startsAt: iso(T + 10000), endsAt: iso(T + 20000) })));
    assert.equal((await f.request(b.cookie, `/api/competitions/${e.id}/join`, 'POST', {})).status, 200);
    f.clock.t = T + 9999; assert.equal((await f.request(b.cookie, `/api/competitions/${e.id}/attempts`, 'POST', { attemptId: randomUUID() })).status, 409);
    f.clock.t = T + 10000; const ticket = await f.reserve(b, e);
    f.clock.t = T + 12000; assert.equal((await f.score(b, e, ticket)).status, 200);
    f.clock.t = T + 18000; const next = await f.reserve(b, e);
    f.clock.t = T + 20000; assert.equal((await f.score(b, e, next)).status, 409);
    assert.equal((await f.request(b.cookie, `/api/competitions/${e.id}/attempts`, 'POST', { attemptId: randomUUID() })).status, 409);
    assert.equal((await f.request('', `/api/competitions/${e.code}`)).body.event.state, 'closed');
    assert.equal((await f.score(b, e, ticket)).status, 200, 'a completed exact retry still works after end');
  } finally { await f.close(); }
});

test('attempt limits: concurrent reservations/retries consume one slot, including abandoned/expired attempts', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const e = await f.publish(a, await f.event(a, draft({ attemptLimit: 1 })));
    await f.request(a.cookie, `/api/competitions/${e.id}/join`, 'POST', {});
    const id = randomUUID(); const replies = await Promise.all(Array.from({ length: 8 }, () => f.request(a.cookie, `/api/competitions/${e.id}/attempts`, 'POST', { attemptId: id })));
    assert.ok(replies.every(r => r.status === 201)); assert.equal(new Set(replies.map(r => r.body.attempt.id)).size, 1);
    assert.equal((await f.request(a.cookie, `/api/competitions/${e.id}/me`)).body.usedAttempts, 1);
    f.clock.t += 300000; assert.equal((await f.score(a, e, replies[0].body.attempt)).status, 409);
    assert.equal((await f.request(a.cookie, `/api/competitions/${e.id}/attempts`, 'POST', { attemptId: randomUUID() })).status, 409);
  } finally { await f.close(); }
});

test('score retries/concurrency: same ticket has one immutable result and no global XP or AI invocation', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const e = await f.publish(a, await f.event(a)); await f.request(a.cookie, `/api/competitions/${e.id}/join`, 'POST', {});
    const ticket = await f.reserve(a, e); assert.equal((await f.score(a, e, ticket)).status, 409, 'server timer cannot be forged');
    f.clock.t += 2000; const replies = await Promise.all(Array.from({ length: 8 }, () => f.score(a, e, ticket)));
    assert.ok(replies.every(r => r.status === 200)); assert.equal(new Set(replies.map(r => r.body.competition.resultId)).size, 1);
    assert.equal(replies.filter(r => !r.body.competition.replayed).length, 1);
    assert.ok(replies.every(r => r.body.ai.status === 'declined' && r.body.competition.globalXpAwarded === 0));
    assert.equal(f.progression.profile(a.id)!.xp, 0); assert.equal(f.progression.profile(a.id)!.attempts, 0);
    assert.equal(f.store.analytics(a.id, e.id).completedAttempts, 1);
    assert.equal((await f.score(a, e, ticket, telemetry(10))).status, 409, 'same ticket, altered telemetry');
  } finally { await f.close(); }
});

test('cross-event/entrant isolation and invented scores are rejected by the HTTP boundary', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'), b = await f.guest('Other'); const e = await f.publish(a, await f.event(a)), other = await f.publish(a, await f.event(a));
    await f.request(a.cookie, `/api/competitions/${e.id}/join`, 'POST', {}); const ticket = await f.reserve(a, e); f.clock.t += 2000;
    assert.equal((await f.score(b, e, ticket)).status, 403);
    assert.equal((await f.score(a, other, ticket)).status, 403);
    assert.equal((await f.score(a, e, ticket, telemetry(), { score: 100, hit: true })).status, 400);
    assert.equal((await f.request(a.cookie, `/api/competitions/${e.id}/attempts`, 'POST', { attemptId: randomUUID(), score: 100 })).status, 400);
    assert.equal((await f.score(a, e, ticket)).status, 200);
    assert.equal(f.store.leaderboard(e.code).total, 1); assert.equal(f.store.leaderboard(other.code).total, 0);
  } finally { await f.close(); }
});

test('review gate, exclusions/reasons, analytics and finalization snapshot', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'), b = await f.guest('Player'); const e = await f.publish(a, await f.event(a));
    for (const g of [a, b]) await f.request(g.cookie, `/api/competitions/${e.id}/join`, 'POST', {});
    const first = await f.reserve(a, e); f.clock.t += 2000; await f.score(a, e, first);
    const second = await f.reserve(b, e); f.clock.t += 2000; const suspicious = await f.score(b, e, second); assert.equal(suspicious.body.competition.review, 'pending', 'copied telemetry is flagged');
    const third = await f.reserve(a, e); assert.ok(third.id);
    const analytics = f.store.analytics(a.id, e.id); assert.deepEqual(analytics, { participants: 2, startedAttempts: 3, completedAttempts: 2, eligibleAttempts: 1, pendingReview: 1, excludedAttempts: 0, completionRate: 2 / 3 });
    const closed = (await f.request(a.cookie, `/api/organizer/events/${e.id}/close`, 'POST', { version: e.version })).body.event;
    assert.equal((await f.request(a.cookie, `/api/organizer/events/${e.id}/finalize`, 'POST', { version: closed.version, reviewAcknowledged: true })).status, 409);
    const route = `/api/organizer/events/${e.id}/results/${second.id}/review`;
    assert.equal((await f.request(b.cookie, route, 'POST', { decision: 'exclude', reason: 'Copied' })).status, 403);
    assert.equal((await f.request(a.cookie, route, 'POST', { decision: 'exclude', reason: '' })).status, 400);
    assert.equal((await f.request(a.cookie, route, 'POST', { decision: 'exclude', reason: 'Duplicated telemetry reviewed by organizer' })).status, 200);
    const final = await f.request(a.cookie, `/api/organizer/events/${e.id}/finalize`, 'POST', { version: closed.version, reviewAcknowledged: true }); assert.equal(final.status, 200); assert.equal(final.body.event.state, 'finalized');
    assert.equal((await f.request(a.cookie, route, 'POST', { decision: 'approve', reason: 'Late change' })).status, 409);
    const board = f.store.leaderboard(e.code); assert.equal(board.total, 1); assert.equal(board.finalized, true);
    assert.ok(f.store.audit(a.id, e.id).some(v => v.action === 'exclude' && v.details.reason.includes('Duplicated')));
    assert.ok(f.store.audit(a.id, e.id).some(v => v.action === 'finalize'));
    assert.equal((await f.request(a.cookie, `/api/competitions/${e.id}/join`, 'POST', {})).status, 409);
  } finally { await f.close(); }
});

test('best result, hit tie-break option and deterministic final entrant-id ordering', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const e = await f.publish(a, await f.event(a, draft({ tieBreaker: 'score-hit-earliest-v1' })));
    const add = (actor: string, name: string, score: number, hit: boolean, digest: string) => {
      f.store.join(actor, name, e.id); const ticket = f.store.begin(actor, e.id, randomUUID()); f.clock.t += 2000;
      return f.store.record(actor, e.id, ticket.id, ticket.attemptId, digest, { score, hit, elapsedMs: 2000 });
    };
    add('entrant-b', 'Same Name', 80, false, 'digest-b1');
    add('entrant-b', 'Same Name', 90, false, 'digest-b2');
    add('entrant-a', 'Same Name', 90, true, 'digest-a1');
    assert.deepEqual(f.store.leaderboard(e.code).entries.map(r => [r.entrantId, r.score]), [['entrant-a', 90], ['entrant-b', 90]]);
    const both = [];
    for (const id of ['entrant-d', 'entrant-c']) { f.store.join(id, id, e.id); both.push({ id, ticket: f.store.begin(id, e.id, randomUUID()) }); }
    f.clock.t += 2000;
    for (const { id, ticket } of both) f.store.record(id, e.id, ticket.id, ticket.attemptId, id, { score: 100, hit: true, elapsedMs: 2000 });
    assert.deepEqual(f.store.leaderboard(e.code).entries.slice(0, 2).map(r => r.entrantId), ['entrant-c', 'entrant-d']);
  } finally { await f.close(); }
});

test('ineligible results cannot be promoted into rankings by approving their review', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const e = await f.publish(a, await f.event(a, draft({ scoring: { method: 'server-game-data-v1', requireHit: true } })));
    await f.request(a.cookie, `/api/competitions/${e.id}/join`, 'POST', {}); const ticket = await f.reserve(a, e); f.clock.t += 2000;
    const result = await f.score(a, e, ticket); assert.equal(result.body.competition.eligible, false);
    f.store.review(a.id, e.id, ticket.id, 'approve', 'Reviewed miss'); assert.equal(f.store.leaderboard(e.code).total, 0);
  } finally { await f.close(); }
});

test('fictional fixtures are deterministic, read-only and never enter real records', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const one = (await f.request('', '/api/competition-examples')).body;
    assert.deepEqual(one, (await f.request('', '/api/competition-examples')).body); assert.equal(one.example, true);
    assert.ok(one.events.every((e: any) => e.example && e.readOnly));
    assert.deepEqual((await f.request('', '/api/competitions')).body.events, []);
    assert.equal((await f.request(a.cookie, '/api/competitions/example-lantern-open/join', 'POST', {})).status, 404);
    assert.deepEqual(f.store.ownedList(a.id), []);
    assert.equal(f.progression.profile(a.id)!.xp, 0);
  } finally { await f.close(); }
});

test('additive migration/restart preserves guest cookie, global progress, events, results and audit', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const id = randomUUID(); f.progression.claim(a.id, id); f.progression.complete(a.id, id, { score: 75, hit: true, aiStatus: 'ok' }, progress => ({ progress }));
    const e = await f.publish(a, await f.event(a)); await f.request(a.cookie, `/api/competitions/${e.id}/join`, 'POST', {});
    const ticket = await f.reserve(a, e); f.clock.t += 2000; await f.score(a, e, ticket);
    const profile = f.progression.profile(a.id), board = f.store.leaderboard(e.code), audit = f.store.audit(a.id, e.id);
    await f.restart(); await f.restart();
    assert.deepEqual(f.progression.profile(a.id), profile); assert.deepEqual(f.store.leaderboard(e.code), board); assert.deepEqual(f.store.audit(a.id, e.id), audit);
    assert.equal((await f.request(a.cookie, `/api/organizer/events/${e.id}`)).status, 200);
    assert.equal((await f.score(a, e, ticket)).body.competition.replayed, true);
    assert.equal(f.store.persistence.storageDurable, false); assert.equal(f.store.persistence.sameFilesystemRestart, true);
  } finally { await f.close(); }
});

test('future competition schemas are refused rather than rewritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h26-events-schema-')), file = join(dir, 'db.sqlite');
  try {
    const db = new DatabaseSync(file); db.exec("CREATE TABLE competition_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO competition_meta VALUES('schema_version','999');"); db.close();
    assert.throws(() => openCompetitionStore({ databasePath: file }), /Unsupported competition schema/);
    const check = new DatabaseSync(file); assert.equal((check.prepare("SELECT value FROM competition_meta WHERE key='schema_version'").get() as { value: string }).value, '999'); check.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('separate processes retry one reservation without double-consuming its attempt limit', async () => {
  const f = await fixture(); try {
    const a = await f.guest('Host'); const e = await f.publish(a, await f.event(a, draft({ attemptLimit: 1 }))); f.store.join(a.id, 'Host', e.id);
    const clientId = randomUUID();
    const code = `import { openCompetitionStore } from ${JSON.stringify(pathToFileURL(resolve('packages/competitions/store.ts')).href)}; const s=openCompetitionStore({databasePath:process.argv[1],now:()=>${T}}); try{console.log(JSON.stringify(s.begin(process.argv[2],process.argv[3],process.argv[4])))}finally{s.close()}`;
    const worker = () => new Promise<any>((ok, fail) => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, f.file, a.id, e.id, clientId], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = ''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c); child.on('error', fail); child.on('close', n => { if (n !== 0) fail(new Error(err)); else { try { ok(JSON.parse(out)); } catch (e) { fail(e); } } });
    });
    const results = await Promise.all([worker(), worker()]); assert.equal(results[0].id, results[1].id); assert.equal(results.filter(r => !r.replayed).length, 1);
    assert.equal(f.store.entrant(a.id, e.id).usedAttempts, 1);
  } finally { await f.close(); }
});

test('featured sample event: a complete sponsored event that is clearly fictional and cannot be entered', async () => {
  const { competitionExamples } = await import('../packages/competitions/examples');
  const events = competitionExamples();
  const featured = events.filter(e => (e as { featured?: boolean }).featured);
  assert.equal(featured.length, 1);
  const e = featured[0] as Record<string, unknown> & { prizes: unknown[]; schedule: unknown[]; rules: unknown[]; leaderboard: unknown[] };
  assert.equal(e.example, true); assert.equal(e.readOnly, true);
  assert.match(String(e.organizer), /fictional/i); assert.match(String(e.sponsor), /fictional/i);
  assert.match(String(e.prizeDescription), /illustration only/i);
  assert.match(String(e.code), /^EXAMPLE-/);
  assert.ok(e.prizes.length && e.schedule.length && e.rules.length && e.leaderboard.length >= 8);
  const ui = (await import('node:fs')).readFileSync(new URL('../src/competitions/Events.tsx', import.meta.url), 'utf8');
  assert.match(ui, /Example event: the sponsor, organizer, players and prizes are fictional\./);
  assert.doesNotMatch(ui, /Sample events — view only/, 'the old collapsed sample box is gone');
  assert.equal(events.length, 1, 'only the featured example remains');
});
