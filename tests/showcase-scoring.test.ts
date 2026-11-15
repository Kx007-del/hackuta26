// Author-written tests (Claude 1, at the human's request) for showcase similarity scoring.
// No network and no real API key: Gemini is mocked throughout.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import * as THREE from 'three';
import { RAMP_HEADING, RIDGE_HEADING, SHOT_SPOT, rayHitsTarget, standingOnBuild, targetBase, terrainHeight } from '../packages/gameplay/hillsideScene';
import { REFERENCE, blendScore, falloff, MISS_CAP, parseTelemetry, scoreTelemetry, signedTurnDeg, type AttemptTelemetry } from '../packages/showcase-scoring/telemetry';
import { buildRequestBody, DEFAULT_GEMINI_MODEL, judgeAttempt, parseJudgement, type GeminiOutcome } from '../packages/showcase-scoring/gemini';
import { MAX_CLIP_BYTES, registerShowcaseScoring, type ScoreResponse } from '../packages/showcase-scoring/server';

const LANDING = 2.6, CONE_HEIGHT = 1.84;
const apexEye = () => new THREE.Vector3(SHOT_SPOT.x, LANDING + CONE_HEIGHT + 1.55, SHOT_SPOT.z);
const chest = () => targetBase.clone().add(new THREE.Vector3(0, 1.1, 0));

// ---------- G1 / G2 scene preconditions ----------
test('G1: the target is 61 m (±0.5) from the landing/cone at the ~200° reference bearing, and visible from there', () => {
  const d = Math.hypot(targetBase.x - SHOT_SPOT.x, targetBase.z - SHOT_SPOT.z);
  assert.ok(Math.abs(d - REFERENCE.distanceM) <= .5, `distance ${d}`);
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(targetBase.x - SHOT_SPOT.x, -(targetBase.z - SHOT_SPOT.z)));
  assert.ok(Math.abs(THREE.MathUtils.euclideanModulo(bearing - THREE.MathUtils.radToDeg(RIDGE_HEADING) + 180, 360) - 180) < .01, `bearing ${bearing}`);
  assert.ok(targetBase.y > LANDING + CONE_HEIGHT + 1.55, 'target sits above eye level on the ridge');
  assert.equal(standingOnBuild(SHOT_SPOT.x, SHOT_SPOT.z, LANDING + CONE_HEIGHT), true, 'the shooting spot is on the build (cone apex)');
  // The cone covers almost the whole landing: check from its apex and from part-way up its slope.
  const slopeU = 1.2, slopeDeck = LANDING + CONE_HEIGHT * (1 - slopeU / 2.3);
  const rightX = Math.cos(RAMP_HEADING), rightZ = Math.sin(RAMP_HEADING);
  const slopeEye = new THREE.Vector3(SHOT_SPOT.x + rightX * slopeU, slopeDeck + 1.55, SHOT_SPOT.z + rightZ * slopeU);
  assert.equal(standingOnBuild(slopeEye.x, slopeEye.z, slopeDeck), true);
  for (const eye of [apexEye(), slopeEye]) {
    assert.equal(rayHitsTarget(eye, chest().sub(eye)), true, `clear shot from ${eye.y.toFixed(2)} m`);
  }
  // From the start facing, the target is about 65° to the left, as in the clip.
  assert.ok(Math.abs(signedTurnDeg(RAMP_HEADING, RIDGE_HEADING) - REFERENCE.turnDeg) < .01);
});

test('G2: the wooden build and the hut block shots; terrain still blocks', () => {
  const inside = new THREE.Vector3(SHOT_SPOT.x, LANDING + .8, SHOT_SPOT.z);
  assert.equal(rayHitsTarget(inside, chest().sub(inside)), false, 'from inside the cone body');
  // Just behind the cone, below its apex, aiming through it.
  const toTarget = chest().sub(apexEye()).setY(0).normalize();
  const behind = new THREE.Vector3(SHOT_SPOT.x - toTarget.x * 3, LANDING + .9, SHOT_SPOT.z - toTarget.z * 3);
  assert.equal(rayHitsTarget(behind, chest().sub(behind)), false, 'from behind the cone, through it');
  const underground = new THREE.Vector3(SHOT_SPOT.x, terrainHeight(SHOT_SPOT.x, SHOT_SPOT.z) - 3, SHOT_SPOT.z);
  assert.equal(rayHitsTarget(underground, chest().sub(underground)), false, 'through terrain');
});

// ---------- telemetry scoring ----------
const DEG = Math.PI / 180;
function telemetry(over: Partial<AttemptTelemetry> = {}): AttemptTelemetry {
  const eye = apexEye(), dir = chest().sub(eye).normalize();
  return {
    version: 1, shots: 1, ads: false, hit: true,
    startHeading: RAMP_HEADING, shotHeading: RAMP_HEADING + REFERENCE.turnDeg * DEG,
    aimHoldMs: REFERENCE.aimHoldMs, elapsedMs: 3000,
    shooter: { x: SHOT_SPOT.x, y: LANDING + CONE_HEIGHT, z: SHOT_SPOT.z, grounded: true },
    ray: { origin: [eye.x, eye.y, eye.z], direction: [dir.x, dir.y, dir.z] },
    ...over,
  };
}
const perfectDerived = { hit: true, onStructure: true, distanceM: 61 };

test('helpers: falloff and signed turn', () => {
  assert.equal(falloff(0, 1, 15), 100);
  assert.equal(falloff(1, 1, 15), 100);
  assert.equal(falloff(8, 1, 15), 50);
  assert.equal(falloff(-20, 1, 15), 0);
  assert.equal(Math.round(signedTurnDeg(265 * DEG, 200 * DEG)), -65);
  assert.equal(Math.round(signedTurnDeg(350 * DEG, 10 * DEG)), 20);
  assert.equal(Math.round(signedTurnDeg(10 * DEG, 350 * DEG + 4 * Math.PI)), -20, 'wraps whole turns');
});

test('telemetry: a perfect recreation scores ≥ 90; clearly wrong runs score low', () => {
  assert.ok(scoreTelemetry(telemetry(), perfectDerived).score >= 90);
  const wrongWay = scoreTelemetry(telemetry({ shotHeading: RAMP_HEADING + 65 * DEG }), perfectDerived);
  const ads = scoreTelemetry(telemetry({ ads: true }), perfectDerived);
  const twoShots = scoreTelemetry(telemetry({ shots: 2 }), perfectDerived);
  const tooClose = scoreTelemetry(telemetry(), { ...perfectDerived, distanceM: 30, onStructure: false });
  const noHold = scoreTelemetry(telemetry({ aimHoldMs: 0 }), perfectDerived);
  const miss = scoreTelemetry(telemetry(), { ...perfectDerived, hit: false });
  assert.ok(wrongWay.score <= 75, `wrong way ${wrongWay.score}`);
  const perfect = scoreTelemetry(telemetry(), perfectDerived).score;
  assert.ok(ads.score < 90 && twoShots.score < 90 && noHold.score < perfect, 'each deviation costs points');
  assert.ok(tooClose.score <= 60, `too close / off the build ${tooClose.score}`);
  assert.ok(miss.score <= MISS_CAP, `miss ${miss.score}`);
  assert.ok(wrongWay.score < scoreTelemetry(telemetry({ shotHeading: RAMP_HEADING - 50 * DEG }), perfectDerived).score, 'closer turn scores higher');
});

test('blend: 60 % AI + 40 % game data; game data alone when AI is unavailable; a miss is capped', () => {
  assert.equal(blendScore(80, 100, true), 92);
  assert.equal(blendScore(80, null, true), 80);
  assert.equal(blendScore(80, 100, false), MISS_CAP);
});

test('parseTelemetry accepts a well-formed attempt and rejects malformed input', () => {
  assert.ok(parseTelemetry(telemetry()));
  const bad: unknown[] = [null, [], 'x', { ...telemetry(), version: 2 }, { ...telemetry(), shots: 1.5 }, { ...telemetry(), aimHoldMs: -1 },
    { ...telemetry(), shooter: { x: 0, y: 0, z: 0 } }, { ...telemetry(), ray: { origin: [0, 0], direction: [0, 0, 1] } },
    { ...telemetry(), ray: { origin: [0, 0, 0], direction: [0, 0, 0] } }, { ...telemetry(), startHeading: Number.NaN }, { ...telemetry(), ads: 'no' }];
  for (const value of bad) assert.equal(parseTelemetry(value), undefined, JSON.stringify(value));
});

// ---------- Gemini client ----------
const okJudgement = { similarity: 82, components: { setup: 90, turn: 80, aimHold: 70, shot: 95, timing: 75 }, feedback: 'Turn a little sooner after the landing.', confidence: .7 };
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const geminiBody = (judgement: unknown) => ({ candidates: [{ content: { parts: [{ text: typeof judgement === 'string' ? judgement : JSON.stringify(judgement) }] } }] });
const clipRef = { mimeType: 'video/mp4', base64: 'UkVG' }, clipAttempt = { mimeType: 'video/webm', base64: 'QVRU' };

test('parseJudgement: strict schema, clamps nothing silently, sanitises feedback', () => {
  assert.deepEqual(parseJudgement(JSON.stringify(okJudgement)), okJudgement);
  for (const bad of ['not json', '[]', JSON.stringify({ ...okJudgement, extra: 1 }), JSON.stringify({ ...okJudgement, similarity: 140 }),
    JSON.stringify({ ...okJudgement, components: { ...okJudgement.components, turn: -3 } }), JSON.stringify({ ...okJudgement, components: { setup: 1 } }),
    JSON.stringify({ ...okJudgement, confidence: 2 }), JSON.stringify({ ...okJudgement, feedback: 7 }), 'x'.repeat(5000), 42])
    assert.equal(parseJudgement(bad), undefined, String(bad).slice(0, 60));
  const tricky = parseJudgement(JSON.stringify({ ...okJudgement, feedback: '<b>Nice</b>\u0007 shot ‮' + 'x'.repeat(300) }))!;
  assert.doesNotMatch(tricky.feedback, /[<>\u0007‮]/);
  assert.ok(tricky.feedback.length <= 140);
});

test('judgeAttempt: no key → unavailable without any request', async () => {
  let calls = 0;
  const out = await judgeAttempt({ apiKey: undefined, reference: clipRef, attempt: clipAttempt, fetchImpl: async () => { calls++; return reply(200, {}); } });
  assert.deepEqual(out, { status: 'unavailable', reason: 'no-key' });
  assert.equal(calls, 0);
});

test('judgeAttempt: request shape (key in header only, both videos inline, JSON schema, temperature 0)', async () => {
  let seen: { url: string; init: { headers: Record<string, string>; body: string } } | undefined;
  const out = await judgeAttempt({
    apiKey: 'test-key-123', model: 'my-model', reference: clipRef, attempt: clipAttempt,
    fetchImpl: async (url, init) => { seen = { url, init }; return reply(200, geminiBody(okJudgement)); },
  });
  assert.equal(out.status, 'ok');
  assert.match(seen!.url, /\/models\/my-model:generateContent$/);
  assert.doesNotMatch(seen!.url, /test-key-123/);
  assert.equal(seen!.init.headers['x-goog-api-key'], 'test-key-123');
  const body = JSON.parse(seen!.init.body);
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  const inline = body.contents[0].parts.filter((p: { inline_data?: unknown }) => p.inline_data);
  assert.deepEqual(inline.map((p: { inline_data: { mime_type: string } }) => p.inline_data.mime_type), ['video/mp4', 'video/webm']);
  assert.match(body.contents[0].parts[0].text, /Ignore completely: graphics/);
  assert.ok(DEFAULT_GEMINI_MODEL.length > 0);
  assert.deepEqual(buildRequestBody(clipRef, clipAttempt).contents[0].parts.length, 5);
});

test('judgeAttempt: one retry on 429/5xx, then gives up; 404 model; malformed reply; timeout', async () => {
  let n = 0;
  assert.equal((await judgeAttempt({ apiKey: 'k', reference: clipRef, attempt: clipAttempt, fetchImpl: async () => (n++ ? reply(200, geminiBody(okJudgement)) : reply(429, {})) })).status, 'ok');
  assert.equal(n, 2);
  n = 0;
  assert.deepEqual(await judgeAttempt({ apiKey: 'k', reference: clipRef, attempt: clipAttempt, fetchImpl: async () => { n++; return reply(503, {}); } }), { status: 'unavailable', reason: 'upstream' });
  assert.equal(n, 2, 'exactly one retry');
  assert.deepEqual(await judgeAttempt({ apiKey: 'k', reference: clipRef, attempt: clipAttempt, fetchImpl: async () => reply(404, {}) }), { status: 'unavailable', reason: 'model-unavailable' });
  assert.deepEqual(await judgeAttempt({ apiKey: 'k', reference: clipRef, attempt: clipAttempt, fetchImpl: async () => reply(200, geminiBody('nope')) }), { status: 'unavailable', reason: 'invalid-response' });
  assert.deepEqual(await judgeAttempt({ apiKey: 'k', reference: clipRef, attempt: clipAttempt, fetchImpl: async () => reply(400, {}) }), { status: 'unavailable', reason: 'upstream' });
  const timeoutError = Object.assign(new Error('t'), { name: 'TimeoutError' });
  assert.deepEqual(await judgeAttempt({ apiKey: 'k', reference: clipRef, attempt: clipAttempt, fetchImpl: async () => { throw timeoutError; } }), { status: 'unavailable', reason: 'timeout' });
});

// ---------- endpoint ----------
type Judge = Parameters<typeof registerShowcaseScoring>[1] extends infer O ? O extends { judge?: infer J } ? J : never : never;
async function withServer(fn: (base: string, dir: string) => Promise<void>, opts: { judge?: Judge; aiPerMinute?: number; maxConcurrent?: number; requestsPerMinute?: number; apiKey?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'score-'));
  const referencePath = join(dir, 'ref.mp4');
  writeFileSync(referencePath, Buffer.from('reference-bytes'));
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  registerShowcaseScoring(app, { referencePath, judge: opts.judge, env: () => ({ apiKey: opts.apiKey ?? 'secret-test-key' }), aiPerMinute: opts.aiPerMinute, maxConcurrent: opts.maxConcurrent, requestsPerMinute: opts.requestsPerMinute });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, dir); }
  finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}
const enc = (t: unknown) => Buffer.from(JSON.stringify(t)).toString('base64url');
function score(base: string, t: unknown, clip?: Buffer, consent = true, type = 'video/webm') {
  return fetch(`${base}/api/showcase/score`, {
    method: 'POST',
    headers: { 'x-score-telemetry': enc(t), 'x-score-ai': consent ? 'yes' : 'no', ...(clip ? { 'Content-Type': type } : {}) },
    body: clip ? new Uint8Array(clip) : undefined,
  });
}
const okJudge: Judge = async () => ({ status: 'ok', judgement: okJudgement }) as GeminiOutcome;

test('endpoint: game-data-only when the player declines; server recomputes the hit', async () => {
  let calls = 0;
  await withServer(async base => {
    const res = await score(base, telemetry(), Buffer.from('clip'), false);
    assert.equal(res.status, 200);
    const body = await res.json() as ScoreResponse;
    assert.equal(body.ai.status, 'declined');
    assert.equal(calls, 0, 'no AI call without consent');
    assert.equal(body.hit, true);
    assert.equal(body.telemetry.onStructure, true);
    assert.ok(Math.abs(body.telemetry.distanceM - 61) <= .5);
    assert.equal(body.score, body.telemetry.score);
    // A claimed hit whose ray misses is a miss; the client's flag is ignored.
    const lie = telemetry({ hit: true, ray: { origin: telemetry().ray.origin, direction: [0, 1, 0] } });
    const lied = await (await score(base, lie, undefined, false)).json() as ScoreResponse;
    assert.equal(lied.hit, false);
    assert.ok(lied.score <= MISS_CAP);
    // A ray fired from far away from the shooter is not trusted either.
    const far = telemetry({ ray: { origin: [targetBase.x + 2, targetBase.y + 1.1, targetBase.z + 2], direction: [-1, 0, -1] } });
    assert.equal(((await (await score(base, far, undefined, false)).json()) as ScoreResponse).hit, false);
  }, { judge: async () => { calls++; return okJudge!({} as never); } });
});

test('endpoint: with consent and a clip, the AI result is blended, cached by clip, and never leaks the key', async () => {
  let calls = 0;
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args.join(' ')); };
  try {
    await withServer(async base => {
      const first = await score(base, telemetry(), Buffer.from('same-clip'));
      const text = await first.text();
      assert.doesNotMatch(text, /secret-test-key/);
      const body = JSON.parse(text) as ScoreResponse;
      assert.equal(body.ai.status, 'ok');
      assert.equal(body.score, blendScore(body.telemetry.score, okJudgement.similarity, true));
      await score(base, telemetry(), Buffer.from('same-clip'));
      assert.equal(calls, 1, 'second identical clip served from cache');
      await score(base, telemetry(), Buffer.from('other-clip'));
      assert.equal(calls, 2);
    }, { judge: async (o) => { calls++; assert.equal(o.apiKey, 'secret-test-key'); assert.equal(o.attempt.mimeType, 'video/webm'); return okJudge!(o); } });
  } finally { console.error = original; }
  assert.ok(logged.every(line => !line.includes('secret-test-key')));
});

test('endpoint: AI unavailable or rate-limited falls back to game data; limits are enforced', async () => {
  await withServer(async base => {
    const body = await (await score(base, telemetry(), Buffer.from('a'))).json() as ScoreResponse;
    assert.deepEqual(body.ai, { status: 'unavailable', reason: 'no-key' });
    assert.equal(body.score, body.telemetry.score);
  }, { judge: judgeAttempt, apiKey: '' });

  let calls = 0;
  await withServer(async base => {
    await score(base, telemetry(), Buffer.from('c1'));
    const limited = await (await score(base, telemetry(), Buffer.from('c2'))).json() as ScoreResponse;
    assert.deepEqual(limited.ai, { status: 'unavailable', reason: 'rate-limited' });
    assert.equal(calls, 1);
  }, { judge: async (o) => { calls++; return okJudge!(o); }, aiPerMinute: 1 });

  await withServer(async base => {
    assert.equal((await score(base, telemetry(), Buffer.alloc(MAX_CLIP_BYTES + 1))).status, 413);
    const bad = await fetch(`${base}/api/showcase/score`, { method: 'POST', headers: { 'x-score-telemetry': 'not-base64-json' } });
    assert.equal(bad.status, 400);
    assert.equal((await score(base, { ...telemetry(), version: 9 })).status, 400);
    const textBody = await score(base, telemetry(), Buffer.from('x'), true, 'text/plain');
    assert.equal(((await textBody.json()) as ScoreResponse).ai.status, 'declined', 'non-video bodies are ignored');
  }, { judge: okJudge });

  await withServer(async base => {
    assert.equal((await score(base, telemetry(), undefined, false)).status, 200);
    assert.equal((await score(base, telemetry(), undefined, false)).status, 200);
    assert.equal((await score(base, telemetry(), undefined, false)).status, 429);
  }, { judge: okJudge, requestsPerMinute: 2 });
});

test('endpoint: at most N AI calls in flight; extra requests fall back instead of queueing', async () => {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  let started = 0;
  await withServer(async base => {
    const slow = score(base, telemetry(), Buffer.from('slow'));
    while (started === 0) await new Promise(r => setTimeout(r, 10));
    const second = await (await score(base, telemetry(), Buffer.from('fast'))).json() as ScoreResponse;
    assert.deepEqual(second.ai, { status: 'unavailable', reason: 'rate-limited' });
    release();
    assert.equal(((await (await slow).json()) as ScoreResponse).ai.status, 'ok');
  }, { judge: async (o) => { started++; await gate; return okJudge!(o); }, maxConcurrent: 1 });
});

test('wiring: scoring is registered before the /api 404, and the preview allows one shot per attempt', async () => {
  const { readFileSync } = await import('node:fs');
  const index = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.ok(index.indexOf('registerShowcaseScoring(app)') > 0 && index.indexOf('registerShowcaseScoring(app)') < index.indexOf('Unknown API route'));
  const preview = readFileSync(new URL('../packages/gameplay/HillsidePreview.tsx', import.meta.url), 'utf8');
  assert.match(preview, /shotsThisAttempt > 0\) return/);
  assert.match(preview, /consentRef\.current === 'yes' \? await recorder\.finish\(\) : undefined/);
  assert.match(preview, /It isn’t stored/);
  const client = readFileSync(new URL('../packages/showcase-scoring/client.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /getUserMedia|getDisplayMedia|audioBitsPerSecond|AudioContext/, 'records the game canvas only');
  assert.doesNotMatch(client + preview, /GEMINI_API_KEY|x-goog-api-key/, 'the key never reaches browser code');
});
