// Author-written tests for the leaderboard (Claude 1, at the human's request). Independent tests remain Claude 2's role.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { evaluateShot } from '../packages/gameplay/shotRules.ts';
import { aimMiss, attemptMetrics, buildLeaderboard, type LeaderboardRow } from '../packages/leaderboard/scoring.ts';
import { MAX_LEADERBOARD_ROWS, registerLeaderboardApi } from '../packages/leaderboard/server.ts';
import type { AttemptResult, ChallengeConfig } from '../shared/contracts.ts';

const rooftop: ChallengeConfig = { schemaVersion: 1, arenaId: 'rooftop-v1', templateId: 'jump', targetDistance: 14, requiredSpinDegrees: 0 };
/** Aim from (0,y,3) at a point offset sideways by `offset` metres on the target plane. */
function aimAt(config: ChallengeConfig, offset: number, height = config.arenaId === 'tactical-v1' ? 1.7 : 3.2) {
  const from = { x: 0, y: 4.2, z: 3 };
  const dz = -config.targetDistance - from.z;
  const yaw = Math.atan2(-offset, -dz);
  const pitch = Math.atan2(height - from.y, Math.hypot(offset, dz));
  return { ...from, yaw, pitch };
}
let seq = 0;
function attempt(config: ChallengeConfig, offset: number, success: boolean, extra: Partial<AttemptResult> = {}): AttemptResult {
  const aim = aimAt(config, offset);
  const hit = Math.abs(offset) < 1;
  return {
    id: `a${++seq}`, config: { ...config }, success, targetHit: success || (extra.targetHit ?? hit), airborneAtShot: config.arenaId !== 'tactical-v1',
    rotationDegrees: config.requiredSpinDegrees, durationMs: 2000, shotTimeMs: 1500, assisted: false,
    frames: [{ t: 0, x: 0, y: 1.7, z: 3, yaw: 0, pitch: 0 }, { t: 1500, ...aim }],
    ...(config.arenaId === 'rooftop-v1' ? {} : { mechanicState: { builds: 1, dashes: 1, speedAtShot: 0, edited: true } }),
    ...extra,
  };
}

test('aimMiss agrees with the live sphere hit test across offsets, heights and arenas', () => {
  for (const arenaId of ['rooftop-v1', 'buildyard-v1', 'tactical-v1'] as const) {
    for (const targetDistance of [14, 20, 26]) {
      for (const offset of [-3, -1.6, -1.1, -0.4, 0, 0.3, 0.41, 0.43, 1.14, 1.16, 1.64, 1.66, 4]) {
        for (const pitchNudge of [-0.2, 0, 0.05]) {
          const config = { ...rooftop, arenaId, targetDistance };
          const aim = aimAt(config, offset);
          const frame = { ...aim, pitch: aim.pitch + pitchNudge };
          const live = evaluateShot({ ...frame, targetDistance, airborne: true, hasJumped: true, takeoffYaw: frame.yaw, requiredSpinDegrees: 0, arenaId });
          const { missMeters, radius } = aimMiss(frame, arenaId, targetDistance);
          assert.equal(missMeters <= radius, live.targetHit, `${arenaId} ${targetDistance} ${offset} ${pitchNudge}: miss ${missMeters}`);
        }
      }
    }
  }
});

test('a dead-centre shot measures ~0 m and facing away is flagged wrong-way', () => {
  assert.ok(attemptMetrics(attempt(rooftop, 0, true)).missMeters < 1e-9);
  const away = attempt(rooftop, 0, false);
  away.frames[1] = { ...away.frames[1], yaw: away.frames[1].yaw + Math.PI, pitch: 0 };
  away.targetHit = false;
  const m = attemptMetrics(away);
  assert.equal(m.fumble, 'wrong-way');
  assert.ok(m.missMeters > 10);
});

test('fumble labels describe the shot, not the player', () => {
  const sky = attempt(rooftop, 3, false); sky.frames[1] = { ...sky.frames[1], pitch: 0.9 };
  const floor = attempt(rooftop, 3, false); floor.frames[1] = { ...floor.frames[1], pitch: -0.9 };
  const spin = { ...rooftop, templateId: 'spin360' as const, requiredSpinDegrees: 360 as const };
  const shortSpin = attempt(spin, 0.2, false, { rotationDegrees: 200, targetHit: true });
  const overSpin = attempt(spin, 4, false, { rotationDegrees: 700, targetHit: false });
  const wide = attempt(rooftop, 4, false);
  const noMove = attempt({ ...rooftop, arenaId: 'tactical-v1', templateId: 'precision' }, 0, false, { targetHit: true });
  assert.deepEqual([sky, floor, shortSpin, overSpin, wide, noMove].map(a => attemptMetrics(a).fumble),
    ['sky', 'floor', 'short-spin', 'over-spin', 'wide', 'move-missing']);
  assert.equal(attemptMetrics(attempt(rooftop, 0.2, true)).fumble, null);
});

const row = (player: string, over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  id: `${player}-${++seq}`, player, arenaId: 'rooftop-v1', templateId: 'jump', targetDistance: 14, success: true,
  missMeters: 0.5, rotationDegrees: 0, shotTimeMs: 2000, fumble: null, assisted: false, createdAt: `2026-11-15T03:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...over,
});

test('categories rank correctly, keep one entry per player and cap at the limit', () => {
  const rows = [
    row('Ava', { missMeters: 0.4, shotTimeMs: 1800 }), row('ava', { missMeters: 0.1, shotTimeMs: 2500 }),
    row('Ben', { missMeters: 0.2, shotTimeMs: 900, templateId: 'spin360', rotationDegrees: 410 }),
    row('Cy', { success: false, missMeters: 9, fumble: 'sky' }), row('Cy', { success: false, missMeters: 2, fumble: 'wide' }),
    row('Dee', { success: false, missMeters: 4, fumble: 'floor' }),
    row('Eli', { arenaId: 'tactical-v1', templateId: 'precision', missMeters: 0.05, rotationDegrees: 0 }),
  ];
  const board = Object.fromEntries(buildLeaderboard(rows).map(c => [c.id, c.entries]));
  assert.deepEqual(board.closest.map(e => [e.player, e.value]), [['Eli', '5 cm from centre'], ['ava', '10 cm from centre'], ['Ben', '20 cm from centre']]);
  assert.deepEqual(board.fumbles.map(e => [e.player, e.value]), [['Cy', 'Aimed for the clouds'], ['Dee', 'Shot the floor']]);
  assert.deepEqual(board.fastest.map(e => e.player), ['Ben', 'Ava', 'Eli']);
  assert.deepEqual(board.spin.map(e => [e.player, e.value]), [['Ben', '410° of spin']]);
  assert.equal(board.grinders[0].player.toLowerCase(), 'ava');
  assert.equal(board.grinders[0].value, '2 attempts');
  const many = Array.from({ length: 30 }, (_, i) => row(`P${i}`, { missMeters: i / 100 }));
  assert.equal(buildLeaderboard(many, 10)[0].entries.length, 10);
});

async function withServer(fn: (base: string) => Promise<void>, maxRows?: number) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  let tick = 0;
  const close = registerLeaderboardApi(app, { databasePath: ':memory:', maxRows, now: () => new Date(Date.UTC(2026, 10, 15, 3, 0, 0, tick++)) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.close(); close(); }
}
const post = (base: string, body: unknown) => fetch(`${base}/api/leaderboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('API stores hits and misses, ranks them, and is idempotent per attempt id', async () => {
  await withServer(async base => {
    const hit = attempt(rooftop, 0.3, true);
    const miss = attempt(rooftop, 5, false);
    assert.equal((await post(base, { playerName: '  Ava  ', attempt: hit })).status, 201);
    assert.equal((await post(base, { playerName: 'Ava', attempt: hit })).status, 200, 'replaying the same attempt does not duplicate it');
    const saved = await (await post(base, { playerName: 'Ben', attempt: miss })).json();
    assert.equal(saved.fumble, 'wide');
    const board = await (await fetch(`${base}/api/leaderboard`)).json();
    assert.equal(board.attempts, 2);
    const closest = board.categories.find((c: { id: string }) => c.id === 'closest');
    assert.equal(closest.entries[0].player, 'Ava');
    assert.equal(board.categories.find((c: { id: string }) => c.id === 'fumbles').entries[0].player, 'Ben');
    const filtered = await (await fetch(`${base}/api/leaderboard?arena=tactical-v1`)).json();
    assert.equal(filtered.attempts, 2, 'attempts is the global count');
    assert.equal(filtered.categories.every((c: { entries: unknown[] }) => c.entries.length === 0), true);
    assert.equal((await fetch(`${base}/api/leaderboard?arena=nope`)).status, 400);
  });
});

test('API rejects bad names, malformed attempts and landed claims that do not match the aim', async () => {
  await withServer(async base => {
    for (const playerName of ['', '   ', 'x'.repeat(33), 'bad\u0007name', 'a‮b', 7]) {
      assert.equal((await post(base, { playerName, attempt: attempt(rooftop, 0, true) })).status, 400, JSON.stringify(playerName));
    }
    const fakeLanded = attempt(rooftop, 6, true);
    const res = await post(base, { playerName: 'Cheater', attempt: fakeLanded });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /does not match/);
    const badConfig = attempt(rooftop, 0, false); (badConfig.config as { targetDistance: number }).targetDistance = 99;
    assert.equal((await post(base, { playerName: 'A', attempt: badConfig })).status, 400);
    const noFrames = attempt(rooftop, 0, false, { frames: [] });
    assert.equal((await post(base, { playerName: 'A', attempt: noFrames })).status, 400);
    const missingMechanics = attempt({ ...rooftop, arenaId: 'buildyard-v1', templateId: 'ramp-shot' }, 0, true, { mechanicState: { builds: 0, dashes: 0, speedAtShot: 0 } });
    assert.equal((await post(base, { playerName: 'A', attempt: missingMechanics })).status, 400);
    assert.equal((await (await fetch(`${base}/api/leaderboard`)).json()).attempts, 0);
  });
});

test('storage is capped: the oldest rows are dropped beyond maxRows', async () => {
  assert.ok(MAX_LEADERBOARD_ROWS >= 1000 && MAX_LEADERBOARD_ROWS <= 20000);
  await withServer(async base => {
    for (let i = 0; i < 8; i++) { const r = await post(base, { playerName: `P${i}`, attempt: attempt(rooftop, 5, false) }); assert.equal(r.status, 201, await r.text()); }
    const board = await (await fetch(`${base}/api/leaderboard`)).json();
    assert.equal(board.attempts, 5);
    const players = board.categories.find((c: { id: string }) => c.id === 'grinders').entries.map((e: { player: string }) => e.player).sort();
    assert.deepEqual(players, ['P3', 'P4', 'P5', 'P6', 'P7']);
  }, 5);
});

test('assisted and unknown-assist attempts never rank, but still count as attempts', () => {
  const rows = [
    row('Fair', { missMeters: 0.3, shotTimeMs: 1500 }),
    row('Assist', { missMeters: 0.0, shotTimeMs: 12, assisted: true }),
    row('Legacy', { missMeters: 0.01, shotTimeMs: 20, assisted: null }),
    row('AssistMiss', { success: false, missMeters: 30, fumble: 'sky', assisted: true }),
    row('Spinner', { templateId: 'spin360', rotationDegrees: 999, assisted: true }),
  ];
  const board = Object.fromEntries(buildLeaderboard(rows).map(c => [c.id, c.entries.map(e => e.player)]));
  assert.deepEqual(board.closest, ['Fair']);
  assert.deepEqual(board.fastest, ['Fair']);
  assert.deepEqual(board.fumbles, []);
  assert.deepEqual(board.spin, []);
  assert.equal(board.grinders.length, 5, 'every attempt still counts towards Never gives up');
});

test('API ranks only attempts that report assisted:false', async () => {
  await withServer(async base => {
    const assisted = await (await post(base, { playerName: 'A', attempt: attempt(rooftop, 0, true, { assisted: true }) })).json();
    const missing = attempt(rooftop, 0.1, true); delete (missing as { assisted?: boolean }).assisted;
    const unknown = await (await post(base, { playerName: 'B', attempt: missing })).json();
    const fair = await (await post(base, { playerName: 'C', attempt: attempt(rooftop, 0.5, true) })).json();
    assert.deepEqual([assisted.ranked, unknown.ranked, fair.ranked], [false, false, true]);
    assert.equal((await post(base, { playerName: 'D', attempt: attempt(rooftop, 0, true, { assisted: 'yes' as unknown as boolean }) })).status, 400);
    const board = await (await fetch(`${base}/api/leaderboard`)).json();
    assert.deepEqual(board.categories.find((c: { id: string }) => c.id === 'closest').entries.map((e: { player: string }) => e.player), ['C']);
    assert.equal(board.attempts, 3);
  });
});

test('an existing leaderboard table gains the assisted column; old rows stay unranked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-migrate-'));
  const file = join(dir, 'db.sqlite');
  try {
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE leaderboard_attempts (id TEXT PRIMARY KEY, player TEXT NOT NULL, arena_id TEXT NOT NULL, template_id TEXT NOT NULL,
      target_distance INTEGER NOT NULL, success INTEGER NOT NULL, miss_m REAL NOT NULL, rotation REAL NOT NULL, shot_ms REAL NOT NULL, fumble TEXT, created_at TEXT NOT NULL);
      INSERT INTO leaderboard_attempts VALUES ('old1','OldTimer','rooftop-v1','jump',14,1,0.01,0,12,NULL,'2026-11-15T03:00:00.000Z');`);
    old.close();
    const app = express(); app.use(express.json());
    const close = registerLeaderboardApi(app, { databasePath: file });
    const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      assert.equal((await post(base, { playerName: 'New', attempt: attempt(rooftop, 0.4, true) })).status, 201);
      const board = await (await fetch(`${base}/api/leaderboard`)).json();
      assert.equal(board.attempts, 2);
      assert.deepEqual(board.categories.find((c: { id: string }) => c.id === 'closest').entries.map((e: { player: string }) => e.player), ['New']);
    } finally { server.close(); close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('GameArena marks ALIGN AIM attempts as assisted, resets the flag per attempt and always reports it', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../packages/gameplay/GameArena.tsx'), 'utf8');
  const align = src.slice(src.indexOf('align:()=>{'), src.indexOf('}};', src.indexOf('align:()=>{')));
  assert.match(align, /start\(\);[\s\S]*assisted=true/, 'align starts the attempt, then marks it assisted');
  const reset = src.slice(src.indexOf('function reset(){'), src.indexOf('function start(){'));
  assert.match(reset, /assisted=false/, 'each new attempt starts unassisted');
  assert.match(src, /callbacks\.current\.onComplete\(\{[^}]*\}[^;]*assisted\}\)/, 'onComplete always includes assisted');
});
