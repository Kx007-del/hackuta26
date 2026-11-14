// claude-2 independent H26-2 tests. Fake container fixtures = header/API behaviour only, NOT decodable video.
// Runner: node:test names (test/beforeEach/afterEach). If repo uses vitest, change only the next line's module to 'vitest'.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerClipApi } from '../packages/social/clips';
import { DEFAULT_CONFIG, ARENAS, configForArena, mechanicSatisfied, validConfig, sameConfig } from '../shared/contracts';
import type { ChallengeConfig, MechanicState } from '../shared/contracts';

const ms = (builds: number, dashes: number, speedAtShot: number, edited?: boolean): MechanicState =>
  ({ builds, dashes, speedAtShot, ...(edited === undefined ? {} : { edited }) });
const cfg = (arenaId: string, templateId: string, extra: object = {}) =>
  ({ schemaVersion: 1, arenaId, templateId, targetDistance: 14, requiredSpinDegrees: 0, ...extra }) as ChallengeConfig;
const ROOF = cfg('rooftop-v1', 'jump'), RAMP = cfg('buildyard-v1', 'ramp-shot'), WALL = cfg('buildyard-v1', 'wall-edit');
const PREC = cfg('tactical-v1', 'precision'), DASH = cfg('tactical-v1', 'dash-peek');

test('rooftop = airborne only (legacy unchanged)', () => {
  assert.equal(mechanicSatisfied(ROOF, undefined, true), true);
  assert.equal(mechanicSatisfied(ROOF, undefined, false), false);
  assert.equal(mechanicSatisfied(cfg('rooftop-v1', 'spin360', { requiredSpinDegrees: 360 }), ms(0, 0, 5), true), true);
});
test('ramp-shot: build + airborne', () => {
  assert.equal(mechanicSatisfied(RAMP, ms(1, 0, 3), true), true);
  assert.equal(mechanicSatisfied(RAMP, ms(0, 0, 3), true), false);
  assert.equal(mechanicSatisfied(RAMP, ms(1, 0, 3), false), false);
  assert.equal(mechanicSatisfied(RAMP, undefined, true), false);
});
test('wall-edit: build + edited===true + airborne', () => {
  assert.equal(mechanicSatisfied(WALL, ms(1, 0, 2, true), true), true);
  assert.equal(mechanicSatisfied(WALL, ms(1, 0, 2, false), true), false);
  assert.equal(mechanicSatisfied(WALL, ms(1, 0, 2), true), false);
  assert.equal(mechanicSatisfied(WALL, ms(0, 0, 2, true), true), false);
  assert.equal(mechanicSatisfied(WALL, ms(1, 0, 2, true), false), false);
  assert.equal(mechanicSatisfied(WALL, { ...ms(1, 0, 2), edited: 'true' as unknown as boolean }, true), false);
});
test('precision: grounded, speed <= .35 inclusive', () => {
  assert.equal(mechanicSatisfied(PREC, ms(0, 0, 0), false), true);
  assert.equal(mechanicSatisfied(PREC, ms(0, 0, 0.35), false), true);
  assert.equal(mechanicSatisfied(PREC, ms(0, 0, 0.350001), false), false);
  assert.equal(mechanicSatisfied(PREC, ms(0, 0, 0), true), false);
  assert.equal(mechanicSatisfied(PREC, undefined, false), false);
});
test('dash-peek: dash + grounded + stationary', () => {
  assert.equal(mechanicSatisfied(DASH, ms(0, 1, 0.1), false), true);
  assert.equal(mechanicSatisfied(DASH, ms(0, 0, 0.1), false), false);
  assert.equal(mechanicSatisfied(DASH, ms(0, 1, 0.5), false), false);
  assert.equal(mechanicSatisfied(DASH, ms(0, 1, 0), true), false);
});
test('malformed mechanicState fails non-rooftop', () => {
  for (const bad of [ms(1.5, 0, 0), ms(-1, 0, 0), ms(1, -1, 0), ms(1, 0.5, 0), ms(1, 1, NaN), ms(1, 1, Infinity), ms(1, 1, -0.01)])
    for (const c of [RAMP, PREC]) assert.equal(mechanicSatisfied(c, bad, c === RAMP), false, JSON.stringify(bad));
  assert.equal(mechanicSatisfied(PREC, { builds: '0', dashes: 0, speedAtShot: 0 } as unknown as MechanicState, false), false);
});
test('validConfig accepts 7 combos, defaults, clip ids', () => {
  assert.ok(validConfig(DEFAULT_CONFIG));
  for (const a of ARENAS) { const c = configForArena(a.id); assert.ok(validConfig(c)); assert.equal(c.templateId, a.template); }
  for (const c of [ROOF, cfg('rooftop-v1', 'spin180', { requiredSpinDegrees: 180 }), cfg('rooftop-v1', 'spin360', { requiredSpinDegrees: 360 }), RAMP, WALL, PREC, DASH])
    assert.ok(validConfig(c), c.templateId);
  for (const d of [14, 20, 26]) assert.ok(validConfig({ ...RAMP, targetDistance: d }));
  assert.ok(validConfig({ ...PREC, referenceClipId: 'Ab_9-' }));
  assert.ok(validConfig({ ...PREC, referenceClipId: 'a'.repeat(100) }));
});
test('validConfig rejects cross-game presets and bad fields', () => {
  const bad: unknown[] = [null, undefined, 'x', 42, [], {},
    cfg('rooftop-v1', 'spin180'), cfg('rooftop-v1', 'jump', { requiredSpinDegrees: 180 }), cfg('rooftop-v1', 'ramp-shot'),
    cfg('buildyard-v1', 'spin360', { requiredSpinDegrees: 360 }), cfg('buildyard-v1', 'ramp-shot', { requiredSpinDegrees: 180 }), cfg('buildyard-v1', 'precision'),
    cfg('tactical-v1', 'dash-peek', { requiredSpinDegrees: 360 }), cfg('tactical-v1', 'wall-edit'), cfg('arena-x', 'jump'), cfg('constructor', 'jump'),
    { ...ROOF, arenaId: undefined }, { ...ROOF, schemaVersion: 2 }, { ...ROOF, targetDistance: 15 }, { ...ROOF, targetDistance: '20' }, { ...ROOF, targetDistance: null },
    { ...ROOF, referenceClipId: '' }, { ...ROOF, referenceClipId: '../x' }, { ...ROOF, referenceClipId: 'a'.repeat(101) }, { ...ROOF, referenceClipId: 7 }, { ...ROOF, referenceClipId: null }];
  bad.forEach((c, i) => assert.equal(validConfig(c), false, `case ${i}`));
});
test('sameConfig: no-op equal; any field incl. clip differs', () => {
  const base = { ...WALL, referenceClipId: 'clipA' };
  assert.ok(sameConfig(base, { ...base }));
  assert.ok(sameConfig(DEFAULT_CONFIG, configForArena('rooftop-v1')));
  for (const ch of [{ arenaId: 'tactical-v1' }, { templateId: 'ramp-shot' }, { targetDistance: 20 }, { requiredSpinDegrees: 180 }, { referenceClipId: 'clipB' }, { referenceClipId: undefined }, { schemaVersion: 2 }])
    assert.equal(sameConfig(base, { ...base, ...ch } as ChallengeConfig), false, JSON.stringify(ch));
});

// ---- clip API. FAKE_* = valid signatures only, NON-PLAYABLE; browser agent uses a real fixture ----
const MiB = 1024 * 1024;
const ftyp = (brand: string) => { const b = Buffer.alloc(24); b.writeUInt32BE(24, 0); b.write('ftyp', 4, 'latin1');
  b.write(brand, 8, 'latin1'); b.writeUInt32BE(0x200, 12); b.write(brand, 16, 'latin1'); b.write('mp42', 20, 'latin1'); return b; };
const FAKE_MP4 = Buffer.concat([ftyp('isom'), Buffer.alloc(1000, 7)]);
const FAKE_MOV = Buffer.concat([ftyp('qt  '), Buffer.alloc(200, 3)]);
const FAKE_WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(300, 1)]);
let dir = '', base = '', server: http.Server | undefined, api: ReturnType<typeof registerClipApi> | undefined;
async function boot() { const app = express(); api = registerClipApi(app, { directory: dir });
  server = await new Promise<http.Server>(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; }
async function shutdown() { server?.closeAllConnections(); await new Promise(r => (server ? server.close(() => r(0)) : r(0)));
  await api?.close(); server = undefined; api = undefined; }
const files = () => (readdirSync(dir, { recursive: true }) as string[])
  .filter(f => { const s = statSync(join(dir, f)); return s.isFile() && s.size > 0; }).sort();
beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'h26-2-')); await boot(); });
afterEach(async () => { await shutdown(); rmSync(dir, { recursive: true, force: true }); });
const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
const OK = { arenaId: 'rooftop-v1', name: 'ref.mp4', duration: 30, start: 2, end: 10 };
const up = (body: Buffer, type = 'video/mp4', qs = q(OK), h: Record<string, string> = {}) =>
  fetch(`${base}/api/clips?${qs}`, { method: 'POST', headers: { 'content-type': type, ...h }, body: new Uint8Array(body).buffer });
const clipOf = (j: any) => j?.clip ?? j;
const created = (s: number) => s === 200 || s === 201;

test('mp4/webm/mov accepted; metadata + media survive restart', async () => {
  const ids: string[] = [];
  for (const [buf, type, arenaId] of [[FAKE_MP4, 'video/mp4', 'rooftop-v1'], [FAKE_WEBM, 'video/webm', 'buildyard-v1'], [FAKE_MOV, 'video/quicktime', 'tactical-v1']] as const) {
    const r = await up(buf, type, q({ ...OK, arenaId })); assert.ok(created(r.status), `${type} ${r.status}`);
    const c = clipOf(await r.json()); assert.match(c.id, /^[A-Za-z0-9_-]{1,100}$/);
    assert.deepEqual([c.arenaId, c.contentType, c.size, c.duration, c.start, c.end], [arenaId, type, buf.length, 30, 2, 10]);
    ids.push(c.id);
  }
  await shutdown(); await boot();
  const m = await fetch(`${base}/api/clips/${ids[0]}`); assert.equal(m.status, 200);
  const c = clipOf(await m.json()); assert.equal(c.size, FAKE_MP4.length); assert.equal(c.arenaId, 'rooftop-v1');
  assert.ok(Buffer.from(await (await fetch(`${base}/api/clips/${ids[0]}/media`)).arrayBuffer()).equals(FAKE_MP4));
});
test('rejects bad type/signature/encoding/query; no residue', async () => {
  const before = files(); const M = (o: object) => [FAKE_MP4, 'video/mp4', q({ ...OK, ...o })] as [Buffer, string, string];
  const cases: [Buffer, string, string, Record<string, string>?][] = [
    [FAKE_MP4, 'text/plain', q(OK)], [FAKE_MP4, 'constructor', q(OK)], [FAKE_MP4, 'video/x-msvideo', q(OK)],
    [Buffer.from('MZ not a video, padding padding'), 'video/mp4', q(OK)], [Buffer.alloc(0), 'video/mp4', q(OK)],
    [Buffer.from('xxxxftypisom' + 'x'.repeat(12)), 'video/mp4', q(OK)], [FAKE_MP4, 'video/mp4', q(OK), { 'content-encoding': 'gzip' }],
    ...[{ arenaId: 'nope' }, { arenaId: 'constructor' }, { duration: 91 }, { duration: 0 }, { duration: -1 }, { duration: 'NaN' }, { duration: '' },
      { start: -1 }, { start: 10, end: 10 }, { start: 12, end: 10 }, { end: 31 }, { start: 'x' }].map(M),
    [FAKE_MP4, 'video/mp4', q(OK) + '&duration=40'], [FAKE_MP4, 'video/mp4', 'name=x.mp4&duration=30&start=0&end=5']];
  for (const [b, t, qs, h] of cases) { const r = await up(b, t, qs, h); assert.ok(r.status >= 400 && r.status < 500, `${t} ${qs} ${r.status}`); await r.arrayBuffer(); }
  assert.deepEqual(files(), before);
});
test('>50 MiB rejected 413 w/o residue; exactly 50 MiB ok', async () => {
  const before = files(); const big = Buffer.concat([FAKE_MP4, Buffer.alloc(50 * MiB + 1 - FAKE_MP4.length)]);
  const s = await up(big).then(async r => { await r.arrayBuffer(); return r.status; }, () => 'reset');
  assert.ok(s === 413 || s === 'reset', String(s)); assert.deepEqual(files(), before);
  const ok = await up(big.subarray(0, 50 * MiB)); assert.ok(created(ok.status), String(ok.status));
});
const raw = (h: Record<string, string>) => http.request(`${base}/api/clips?${q(OK)}`, { method: 'POST', headers: { 'content-type': 'video/mp4', ...h } });
test('chunked upload accepted', async () => {
  const req = raw({}); const st = new Promise<number>((r, j) => { req.on('response', s => { s.resume(); r(s.statusCode!); }); req.on('error', j); });
  req.write(FAKE_MP4.subarray(0, 10)); req.end(FAKE_MP4.subarray(10)); assert.ok(created(await st));
});
test('client abort mid-upload leaves no files', async () => {
  const before = files(); const req = raw({ 'content-length': String(FAKE_MP4.length * 10) }); req.on('error', () => {});
  req.write(FAKE_MP4); await new Promise(r => setTimeout(r, 150)); req.destroy(); await new Promise(r => setTimeout(r, 400));
  assert.deepEqual(files(), before);
});
test('media: 200 full, 206 ranges, malformed/multi 200, unsatisfiable 416, bad ids', async () => {
  const id = clipOf(await (await up(FAKE_MP4)).json()).id, N = FAKE_MP4.length;
  const get = (range?: string) => fetch(`${base}/api/clips/${id}/media`, range ? { headers: { range } } : {});
  let r = await get(); assert.equal(r.status, 200); assert.equal(r.headers.get('accept-ranges'), 'bytes');
  assert.equal(r.headers.get('content-type')?.split(';')[0], 'video/mp4'); assert.ok(Buffer.from(await r.arrayBuffer()).equals(FAKE_MP4));
  for (const [h, s, e] of [['bytes=0-9', 0, 9], ['bytes=10-', 10, N - 1], ['bytes=-5', N - 5, N - 1], [`bytes=0-${N + 50}`, 0, N - 1]] as const) {
    r = await get(h); assert.equal(r.status, 206, h); assert.equal(r.headers.get('content-range'), `bytes ${s}-${e}/${N}`);
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(FAKE_MP4.subarray(s, e + 1)), h);
  }
  for (const h of ['bytes=abc', 'items=0-1', 'bytes=9-2', 'bytes=0-1,4-5']) { r = await get(h); assert.equal(r.status, 200, h); await r.arrayBuffer(); }
  r = await get(`bytes=${N}-`); assert.equal(r.status, 416); assert.equal(r.headers.get('content-range'), `bytes */${N}`); await r.arrayBuffer();
  for (const p of ['missing123', '..%2F..%2Fetc', 'constructor']) { const m = await fetch(`${base}/api/clips/${p}`); assert.ok(m.status === 404 || m.status === 400, p); await m.arrayBuffer(); }
});
