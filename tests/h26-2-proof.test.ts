// claude-2 H26-2 proof supplement: validateAttempt normalization + registerApi clipLookup.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { validateAttempt, registerApi } from '../packages/social/server'; // ADAPT path
import type { ClipReference, ChallengeConfig } from '../shared/contracts';

const clip = (id: string, arenaId: any): ClipReference => ({ id, arenaId, name: `${id}.mp4`, contentType: 'video/mp4', size: 1024, duration: 30, start: 2, end: 10, createdAt: '2026-11-14T00:00:00.000Z' });
const CLIPS = new Map([clip('clipRoof', 'rooftop-v1'), clip('clipRoof2', 'rooftop-v1'), clip('clipBuild', 'buildyard-v1'), clip('clipTac', 'tactical-v1')].map(c => [c.id, c]));
const lookup = (id: string) => CLIPS.get(id);
const cf = (arenaId: string, templateId: string, deg = 0) => ({ schemaVersion: 1, arenaId, templateId, targetDistance: 20, requiredSpinDegrees: deg }) as ChallengeConfig;
const ROOF = cf('rooftop-v1', 'spin180', 180), WALL = cf('buildyard-v1', 'wall-edit'), DASH = cf('tactical-v1', 'dash-peek');
const ST: Record<string, object | undefined> = { 'buildyard-v1': { builds: 2, dashes: 0, speedAtShot: 4, edited: true }, 'tactical-v1': { builds: 0, dashes: 1, speedAtShot: 0.35 } };
const F = [{ t: 0, x: 0, y: 1, z: 2, yaw: 0, pitch: 0 }, { t: 900, x: 3, y: 4, z: 5, yaw: 180, pitch: 0.2, builds: 2, dashes: 1, edited: true }];
const att = (c: ChallengeConfig, o: Record<string, unknown> = {}) => ({ id: 'att_1', config: c, success: true, targetHit: true, airborneAtShot: c.arenaId !== 'tactical-v1', rotationDegrees: c.requiredSpinDegrees, durationMs: 1000, shotTimeMs: 800, frames: F, ...(ST[c.arenaId] ? { mechanicState: ST[c.arenaId] } : {}), ...o });
const bad = (v: unknown, m: RegExp) => assert.throws(() => validateAttempt(v), m);

test('normalizes exact shape per arena, strips unknown keys, keeps ability frame fields', () => {
  for (const c of [ROOF, WALL, DASH]) {
    const s = ST[c.arenaId];
    assert.deepEqual(validateAttempt(att({ ...c, extra: 1 } as ChallengeConfig, { junk: 1, frames: F.map(f => ({ ...f, junk: 1 })), ...(s ? { mechanicState: { ...s, junk: 1 } } : {}) })), att(c));
  }
  const r = validateAttempt(att(ROOF));
  assert.equal('builds' in r.frames[0], false); assert.equal('mechanicState' in r, false);
  assert.equal(validateAttempt(att({ ...WALL, referenceClipId: 'clipBuild' })).config.referenceClipId, 'clipBuild');
  assert.deepEqual(validateAttempt(att(ROOF, { mechanicState: { builds: 0, dashes: 0, speedAtShot: 5 } })).mechanicState, { builds: 0, dashes: 0, speedAtShot: 5 });
});

test('mechanicState bounds and mechanic proof', () => {
  const W = (s: object) => att(WALL, { mechanicState: { builds: 1, dashes: 0, speedAtShot: 1, edited: true, ...s } });
  for (const s of [{ builds: 30 }, { dashes: 30 }, { speedAtShot: 100 }, { speedAtShot: 0 }]) validateAttempt(W(s));
  for (const s of [{ builds: 31 }, { builds: 1.5 }, { builds: -1 }, { builds: '1' }, { dashes: 31 }, { speedAtShot: 100.01 }, { speedAtShot: -0.01 }, { speedAtShot: NaN }, { edited: 'true' }]) bad(W(s), /mechanic state/i);
  bad(att(WALL, { mechanicState: null }), /mechanic state/i);
  bad(W({ edited: false }), /Complete/); bad(att(WALL, { mechanicState: undefined }), /Complete/);
  bad(att(DASH, { mechanicState: { builds: 0, dashes: 1, speedAtShot: 0.350001 } }), /Complete/);
  bad(att(DASH, { mechanicState: { builds: 0, dashes: 0, speedAtShot: 0 } }), /Complete/);
});

test('shot, timing and replay bounds', () => {
  validateAttempt(att(ROOF, { rotationDegrees: 3600 }));
  validateAttempt(att(ROOF, { durationMs: 60000, shotTimeMs: 60000, frames: [F[0], { ...F[1], t: 60000 }] }));
  for (const o of [{ rotationDegrees: 179.9 }, { rotationDegrees: 3601 }, { success: false }, { targetHit: 'true' }, { airborneAtShot: 1 }, { airborneAtShot: false }]) bad(att(ROOF, o), /Complete/);
  for (const o of [{ durationMs: 0, shotTimeMs: 0 }, { durationMs: 60001 }, { shotTimeMs: 1001 }, { shotTimeMs: -1 }]) bad(att(ROOF, o), /timing/);
  for (const fr of [[F[0]], Array(2001).fill(F[0]), 'x']) bad(att(ROOF, { frames: fr }), /between 2 and 2000/);
  for (const f of [{ t: 1001 }, { pitch: 10.01 }, { x: 10001 }, { yaw: NaN }, { builds: 31 }, { dashes: 1.5 }, { edited: 1 }]) bad(att(ROOF, { frames: [F[0], { ...F[1], ...f }] }), /frames/);
  bad(att(ROOF, { frames: [{ ...F[0], t: 500 }, { ...F[1], t: 400 }] }), /frames/);
  bad(att(cf('rooftop-v1', 'ramp-shot')), /settings/);
});

const R = { create: '/api/relays', join: (id: string) => `/api/relays/${id}/complete` }; // ADAPT to server.test.ts
const dir = mkdtempSync(join(tmpdir(), 'h26-2p-'));
after(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
async function boot(clipLookup?: typeof lookup) {
  const app = express();
  app.use(express.json());
  const closeDb = registerApi(app, { databasePath: join(dir, `db${n++}`), ...(clipLookup ? { clipLookup } : {}) });
  const s = await new Promise<any>(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const post = async (p: string, body: object) => { const r = await fetch(b + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j: any = await r.json().catch(() => null); return { s: r.status, rel: j?.relay ?? j }; };
  return { post, close: () => new Promise(r => { s.closeAllConnections(); s.close(() => { closeDb(); r(undefined); }); }) };
}
const host = (c: object) => ({ hostName: 'Host', hostAttempt: att(c as ChallengeConfig, {id:'host_attempt'}) });
const guest = (c: object) => ({ guestName: 'Guest', guestAttempt: att(c as ChallengeConfig, {id:'guest_attempt'}) });

test('clipLookup: preserves matching clip; rejects missing, cross-arena and guest mismatch', async () => {
  const api = await boot(lookup);
  try {
    for (const [c, id] of [[ROOF, 'clipRoof'], [WALL, 'clipBuild'], [DASH, 'clipTac']] as const) {
      const cc = { ...c, referenceClipId: id }, r = await api.post(R.create, host(cc));
      assert.ok(r.s < 300, `${id} ${r.s}`); assert.equal(r.rel.challenge.referenceClipId, id); assert.deepEqual(r.rel.hostAttempt.config, cc);
    }
    for (const [c, id] of [[ROOF, 'missing1'], [ROOF, 'clipBuild'], [WALL, 'clipTac'], [DASH, 'clipRoof']] as const)
      assert.ok((await api.post(R.create, host({ ...c, referenceClipId: id }))).s >= 400, id);
    const h = (await api.post(R.create, host({ ...ROOF, referenceClipId: 'clipRoof' }))).rel;
    for (const g of [ROOF, { ...ROOF, referenceClipId: 'clipRoof2' }, { ...ROOF, referenceClipId: 'clipBuild' }])
      assert.ok((await api.post(R.join(h.id), guest(g))).s >= 400, JSON.stringify(g));
    const ok = await api.post(R.join(h.id), guest({ ...ROOF, referenceClipId: 'clipRoof' }));
    assert.ok(ok.s < 300, String(ok.s)); assert.equal(ok.rel.guestAttempt.config.referenceClipId, 'clipRoof');
  } finally { await api.close(); }
});

test('no referenceClipId works with and without clipLookup', async () => {
  for (const l of [lookup, undefined]) { const api = await boot(l); try { assert.ok((await api.post(R.create, host(WALL))).s < 300); } finally { await api.close(); } }
});
