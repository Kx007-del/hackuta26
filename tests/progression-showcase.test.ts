// Showcase leaderboard (fixed fictional example players) vs Live standings (real players only),
// plus save retries. Simulated days use a controlled clock and throwaway databases.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import * as THREE from 'three';
import { RAMP_HEADING, SHOT_SPOT, targetBase } from '../packages/gameplay/hillsideScene';
import { REFERENCE, type AttemptTelemetry } from '../packages/showcase-scoring/telemetry';
import type { GeminiOutcome } from '../packages/showcase-scoring/gemini';
import { registerShowcaseScoring, type ScoreResponse } from '../packages/showcase-scoring/server';
import { registerProgression } from '../packages/progression/server';
import { openProgressionStore, type ProgressionStore } from '../packages/progression/store';
import { EXAMPLE_PLAYERS, realStanding, showcaseBoard } from '../packages/progression/showcase';
import { BADGES, compareStandings, type Board, type Profile } from '../packages/progression/rules';

const T0 = Date.parse('2026-11-15T10:00:00.000Z');
function clock(start = T0) {
  const c = { t: start, now: () => c.t, advance: (ms: number) => { c.t += ms; }, at: (iso: string) => { c.t = Date.parse(iso); } };
  return c;
}
const store = (c = clock(), path = ':memory:') => openProgressionStore({ databasePath: path, now: c.now, durable: false });
function guest(s: ProgressionStore, name?: string) {
  const g = s.createGuest();
  assert.ok(!('full' in g));
  if (name) s.rename(g.player.id, name);
  return g;
}
function play(s: ProgressionStore, id: string, score: number, aiStatus: 'ok' | 'declined' = 'ok') {
  const a = randomUUID();
  assert.equal(s.claim(id, a).status, 'claimed');
  return s.complete(id, a, { score, hit: true, aiStatus }, progress => ({ progress })).progress;
}
const exampleNames = new Set(EXAMPLE_PLAYERS.map(p => p.name));
const exampleIds = new Set(EXAMPLE_PLAYERS.map(p => p.id));

// ---------------- the fixture ----------------

test('fixture: fixed, deterministic, frozen and plausible', () => {
  assert.equal(EXAMPLE_PLAYERS.length, 12);
  assert.equal(exampleIds.size, 12); assert.equal(exampleNames.size, 12);
  assert.ok(Object.isFrozen(EXAMPLE_PLAYERS) && EXAMPLE_PLAYERS.every(p => Object.isFrozen(p) && Object.isFrozen(p.badges)));
  assert.throws(() => { (EXAMPLE_PLAYERS[0] as { xp: number }).xp = 1; }, TypeError);
  const valid = new Set(BADGES.map(b => b.id));
  for (const p of EXAMPLE_PLAYERS) {
    assert.ok(p.badges.every(b => valid.has(b)), p.name);
    assert.ok(p.longestStreak >= p.currentStreak, `${p.name}: longest streak covers current`);
    assert.ok(p.xp <= p.attempts * 10, `${p.name}: XP fits 10 per attempt`);
    if (p.attempts >= 10) assert.ok(p.badges.includes('regular'), p.name);
    if (p.attempts >= 50) assert.ok(p.badges.includes('dedicated'), p.name);
    if (p.longestStreak >= 7) assert.ok(p.badges.includes('streak-7'), p.name);
  }
  // A few different progression levels.
  assert.ok(new Set(EXAMPLE_PLAYERS.map(p => p.badges.length)).size >= 5);
  // Deterministic: the same call gives the same rows.
  for (const board of ['score', 'streak', 'xp'] as Board[]) assert.deepEqual(showcaseBoard(board, null), showcaseBoard(board, null));
});

test('showcase board: the examples are sorted by the same rules as Live standings', () => {
  const score = showcaseBoard('score', null);
  assert.deepEqual(score.map(r => r.position), score.map((_, i) => i + 1));
  assert.deepEqual(score.map(r => r.value), [94, 91, 88, 85, 85, 79, 74, 68, 61, 52]);
  assert.deepEqual(score.slice(3, 5).map(r => r.name), ['Hillside Hana', 'Quiet Scope'], 'equal score: whoever reached it first');
  assert.ok(score.every(r => r.kind === 'example'));
  const streak = showcaseBoard('streak', null);
  assert.equal(streak.length, 10, 'no zero streaks');
  assert.deepEqual(streak.slice(0, 3).map(r => [r.name, r.value]), [['Ridgeline Rae', 9], ['Lefty Turner', 7], ['Quiet Scope', 5]]);
  assert.deepEqual(streak.filter(r => r.value === 2).map(r => r.name), ['Hillside Hana', 'Backspin Bo'], 'equal streak: longer best streak first');
  assert.equal(showcaseBoard('xp', null).length, 12);
});

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'real-1', name: 'Visitor', isNew: false, xp: 0, xpToday: 0, xpCap: 200, attempts: 0, currentStreak: 0, longestStreak: 0,
    bestScore: null, ranks: { score: null, streak: null, xp: null }, reachedAt: { score: null, streak: null, xp: null },
    badges: BADGES.map(b => ({ ...b, earnedAt: null })), storageDurable: false, trackingSince: new Date(T0).toISOString(), ...over,
  };
}

test('showcase board: the visitor’s real progress is inserted by the same rules without changing the fixture', () => {
  const before = JSON.stringify(EXAMPLE_PLAYERS);
  const me = profile({
    bestScore: 86, xp: 30, attempts: 3, currentStreak: 2, longestStreak: 2,
    reachedAt: { score: '2026-11-15T09:00:00Z', streak: '2026-11-14T09:00:00Z', xp: '2026-11-15T09:00:00Z' },
    badges: BADGES.map(b => ({ ...b, earnedAt: b.id === 'first-run' ? '2026-11-14T09:00:00Z' : null })),
  });
  const score = showcaseBoard('score', me);
  const you = score.find(r => r.kind === 'you')!;
  assert.deepEqual([you.position, you.name, you.value, you.badges], [4, 'Visitor', 86, ['first-run']]);
  assert.equal(score.length, 11);
  assert.equal(score.filter(r => r.kind === 'you').length, 1);
  // Tie with examples: reached later, so placed after both 85s.
  const tie = showcaseBoard('score', profile({ bestScore: 85, reachedAt: { score: '2026-11-15T09:00:00Z', streak: null, xp: null } }));
  assert.equal(tie.find(r => r.kind === 'you')!.position, 6);
  // Streak 2: after Hillside Hana (longer best streak), after Backspin Bo (same best streak, reached 11-13, earlier).
  const streak = showcaseBoard('streak', me);
  assert.deepEqual(streak.filter(r => r.value === 2).map(r => r.kind === 'you' ? 'you' : r.name), ['Hillside Hana', 'Backspin Bo', 'you']);
  const earlier = showcaseBoard('streak', profile({ currentStreak: 2, longestStreak: 2, reachedAt: { score: null, streak: '2026-11-13T08:00:00Z', xp: null } }));
  assert.deepEqual(earlier.filter(r => r.value === 2).map(r => r.kind === 'you' ? 'you' : r.name), ['Hillside Hana', 'you', 'Backspin Bo'], 'reached first wins the tie');
  assert.equal(showcaseBoard('xp', me).find(r => r.kind === 'you')!.position, 12, '30 XP: between Ramp Rookie (40) and Fresh Spawn (10)');
  // No real progress on a board: no row there.
  assert.equal(showcaseBoard('score', profile({ xp: 10 })).some(r => r.kind === 'you'), false);
  assert.equal(JSON.stringify(EXAMPLE_PLAYERS), before, 'fixture unchanged');
});

test('showcase uses the live ordering: comparator order equals the server’s SQL order', () => {
  const c = clock(), s = store(c);
  const ids: string[] = [];
  for (const [name, score] of [['A', 70], ['B', 70], ['C', 90], ['D', 50], ['E', 90]] as const) {
    c.advance(5000); const g = guest(s, name); ids.push(g.player.id); play(s, g.player.id, score);
  }
  c.advance(5000); play(s, ids[3], 55); // D: second attempt -> more XP than the rest
  for (const board of ['score', 'streak', 'xp'] as Board[]) {
    const live = s.leaderboard(board).entries.map(e => e.name);
    const viaComparator = ids.map(id => s.profile(id)!).map(p => ({ p, st: realStanding(p, board)! }))
      .sort((a, b) => compareStandings({ ...a.st, id: a.p.id }, { ...b.st, id: b.p.id })).map(x => x.p.name);
    assert.deepEqual(viaComparator, live, board);
  }
  s.close();
});

// ---------------- isolation: fixture never touches real data or achievements ----------------

test('isolation: example players never enter the database, Live standings or badge calculations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-iso-'));
  try {
    const path = join(dir, 'relays.sqlite');
    const c = clock(Date.parse('2026-11-15T12:00:00Z'));
    const s = store(c, path);
    const me = guest(s, 'Real Rookie').player;
    // A modest real score (40) is far below the examples (positions 1–10 score 52+)…
    play(s, me.id, 40);
    const showcasePos = showcaseBoard('score', s.profile(me.id)!).find(r => r.kind === 'you')!.position;
    assert.equal(showcasePos, 11, 'below every example in the showcase');
    // …but Live standings and achievements only see real players.
    const live = s.leaderboard('score', me.id);
    assert.deepEqual(live.entries.map(e => [e.rank, e.name]), [[1, 'Real Rookie']]);
    for (const board of ['score', 'streak', 'xp'] as Board[]) assert.ok(s.leaderboard(board).entries.every(e => !exampleNames.has(e.name)), board);
    c.at('2026-11-16T09:00:00Z');
    const earned = Object.fromEntries(s.profile(me.id)!.badges.map(b => [b.id, b.earnedAt]));
    assert.ok(earned['top-ten'], 'real top ten, not blocked by fictional scores');
    assert.equal(earned.champion, '2026-11-16T00:00:00.000Z', 'real #1 at the checkpoint');
    s.close();
    const db = new DatabaseSync(path);
    const names = (db.prepare('SELECT name FROM progression_players').all() as Array<{ name: string }>).map(r => r.name);
    assert.deepEqual(names, ['Real Rookie']);
    const everything = JSON.stringify([
      db.prepare('SELECT * FROM progression_players').all(), db.prepare('SELECT * FROM progression_attempts').all(),
      db.prepare('SELECT * FROM progression_badges').all(), db.prepare('SELECT * FROM progression_checkpoints').all(),
    ]);
    for (const p of EXAMPLE_PLAYERS) { assert.ok(!everything.includes(p.name), p.name); assert.ok(!everything.includes(p.id), p.id); }
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('isolation: server code never imports the showcase fixture', () => {
  for (const file of ['packages/progression/store.ts', 'packages/progression/server.ts', 'packages/showcase-scoring/server.ts', 'server/index.ts']) {
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /showcase['"]|EXAMPLE_PLAYERS/, file);
  }
});

// ---------------- HTTP: save retries, duplicates, caps ----------------

const LANDING = 2.6, CONE_HEIGHT = 1.84, DEG = Math.PI / 180;
function telemetry(): AttemptTelemetry {
  const eye = new THREE.Vector3(SHOT_SPOT.x, LANDING + CONE_HEIGHT + 1.55, SHOT_SPOT.z);
  const dir = targetBase.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(eye).normalize();
  return {
    version: 1, shots: 1, ads: false, hit: true, startHeading: RAMP_HEADING, shotHeading: RAMP_HEADING + REFERENCE.turnDeg * DEG,
    aimHoldMs: REFERENCE.aimHoldMs, elapsedMs: 3000, shooter: { x: SHOT_SPOT.x, y: LANDING + CONE_HEIGHT, z: SHOT_SPOT.z, grounded: true },
    ray: { origin: [eye.x, eye.y, eye.z], direction: [dir.x, dir.y, dir.z] },
  };
}
type Judge = NonNullable<Parameters<typeof registerShowcaseScoring>[1]>['judge'];
async function withApp(judge: Judge, fn: (send: (id?: string) => Promise<Response>, me: () => Promise<Profile>, c: ReturnType<typeof clock>) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-http-'));
  writeFileSync(join(dir, 'ref.mp4'), Buffer.from('ref'));
  const c = clock(), app = express();
  app.use(express.json());
  const progression = registerProgression(app, { store: store(c), now: c.now });
  registerShowcaseScoring(app, { referencePath: join(dir, 'ref.mp4'), judge, env: () => ({ apiKey: 'k' }), progress: progression.scoring, requestsPerMinute: 1000, aiPerMinute: 1000, maxConcurrent: 10, now: c.now });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = '';
  const keep = (r: Response) => { const v = r.headers.get('set-cookie'); if (v) cookie = v.split(';')[0]; return r; };
  const send = (id?: string) => fetch(`${base}/api/showcase/score`, {
    method: 'POST', body: new Uint8Array(Buffer.from('clip')),
    headers: { 'x-score-telemetry': Buffer.from(JSON.stringify(telemetry())).toString('base64url'), 'x-score-ai': 'yes', 'Content-Type': 'video/webm', ...(id ? { 'x-attempt-id': id } : {}), ...(cookie ? { cookie } : {}) },
  }).then(keep);
  const me = async () => ((await (await fetch(`${base}/api/progression/me`, { headers: { cookie } })).json()) as { profile: Profile }).profile;
  try { await fn(send, me, c); } finally { server.close(); progression.close(); rmSync(dir, { recursive: true, force: true }); }
}
const okJudge: Judge = async () => ({ status: 'ok', judgement: { similarity: 80, components: { setup: 80, turn: 80, aimHold: 80, shot: 80, timing: 80 }, feedback: 'ok', confidence: .8 } }) as GeminiOutcome;

test('save retry: a failed save releases the attempt; retrying the same id counts it exactly once', async () => {
  let failNext = true;
  const flaky: Judge = async o => { if (failNext) { failNext = false; throw new Error('upstream down'); } return okJudge!(o); };
  await withApp(flaky, async (send, me, c) => {
    const id = randomUUID();
    const failed = await send(id);
    assert.equal(failed.status, 500, 'the save failed');
    const first = await send(id);
    assert.equal(first.status, 200);
    const body = await first.json() as ScoreResponse;
    assert.equal(body.progress?.status, 'counted');
    assert.equal(body.replayed, undefined);
    // The response is lost and the browser retries again: stored result, no new XP.
    c.advance(10_000);
    const again = await (await send(id)).json() as ScoreResponse;
    assert.equal(again.replayed, true);
    assert.equal(again.score, body.score);
    const p = await me();
    assert.equal(p.xp, 10); assert.equal(p.attempts, 1);
  });
});

test('post-game updates: each eligible game updates real progress; caps and duplicates hold', async () => {
  await withApp(okJudge, async (send, me, c) => {
    for (let i = 1; i <= 22; i++) {
      c.advance(5000);
      const res = await (await send(randomUUID())).json() as ScoreResponse;
      assert.equal(res.progress?.status, 'counted');
      const progress = res.progress as Extract<NonNullable<ScoreResponse['progress']>, { status: 'counted' }>;
      assert.equal(progress.xpAwarded, i <= 20 ? 10 : 0, `game ${i}`);
      assert.equal(progress.bestScore, res.score);
      assert.equal(progress.newBest, i === 1, 'same clip, same score: only the first is a new best');
      const p = await me();
      assert.equal(p.attempts, i); assert.equal(p.xp, Math.min(200, i * 10)); assert.equal(p.currentStreak, 1);
    }
    c.advance(1000);
    const tooSoon = await (await send(randomUUID())).json() as ScoreResponse;
    assert.equal(tooSoon.progress?.status, 'not-counted');
    assert.equal((await me()).attempts, 22);
  });
});

test('wiring: the client retries with the same attempt id and loads progress on the results page', () => {
  const preview = readFileSync(new URL('../packages/gameplay/HillsidePreview.tsx', import.meta.url), 'utf8');
  assert.match(preview, /void send\(submission, again\)/, 'retry re-sends the same submission');
  assert.match(preview, /submission\.attemptId/);
  const page = readFileSync(new URL('../src/FortniteShowcase.tsx', import.meta.url), 'utf8');
  assert.match(page, /<CommunitySection progression=\{progression\} \/>/);
  const community = readFileSync(new URL('../src/community/Community.tsx', import.meta.url), 'utf8');
  assert.match(community, /<Leaderboards profile=\{profile\} \/>/, 'the board receives refreshed player progress');
});
