import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { DEFAULT_CONFIG, type AttemptResult } from '../../shared/contracts';
import { registerApi } from './server';

const attempt = (id: string): AttemptResult => ({id, config: {...DEFAULT_CONFIG}, success: true, targetHit: true, airborneAtShot: true, rotationDegrees: 0, durationMs: 1000, shotTimeMs: 900, frames: [{t: 0, x: 0, y: 2, z: 0, yaw: 0, pitch: 0}, {t: 1000, x: 0, y: 1, z: -1, yaw: 0, pitch: 0}]});
async function start(databasePath = ':memory:') {
  const app = express();
  app.use(express.json({limit: '2mb'}));
  const closeDb = registerApi(app, {databasePath});
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  const url = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(url + path, body === undefined ? undefined : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  const close = async () => {
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    closeDb();
  };
  return {call, close};
}
test('relay survives reload, locks settings, completes idempotently and rejects overwrites', async () => {
  const api = await start();
  try {
    const created = await api.call('/api/relays', {hostName: ' Host ', hostAttempt: attempt('host')});
    assert.equal(created.status, 201);
    assert.equal(created.body.hostName, 'Host');
    const path = `/api/relays/${created.body.id}`;
    assert.equal((await api.call(path)).body.status, 'waiting');
    const changed = attempt('guest'); changed.config.targetDistance = 20;
    assert.equal((await api.call(path + '/complete', {guestName: 'Guest', guestAttempt: changed})).status, 400);
    const completion = {guestName: 'Guest', guestAttempt: attempt('guest')};
    assert.equal((await api.call(path + '/complete', completion)).body.status, 'completed');
    assert.equal((await api.call(path + '/complete', completion)).status, 200);
    assert.equal((await api.call(path + '/complete', {...completion, guestName: 'Someone else'})).status, 409);
    assert.equal((await api.call(path)).body.guestAttempt.id, 'guest');
    assert.equal((await api.call('/api/relays/missing')).status, 404);
  } finally { await api.close(); }
});
test('rejects failed, invalid, oversized and inconsistent replay submissions', async () => {
  const api = await start();
  try {
    const mutations: Array<(value: AttemptResult) => void> = [
      v => { v.success = false; },
      v => { v.airborneAtShot = false; },
      v => { v.config.templateId = 'spin360'; v.config.requiredSpinDegrees = 360; },
      v => { v.frames[1].t = -1; },
      v => { v.frames[1].x = Infinity; },
      v => { v.frames = Array(2001).fill(v.frames[0]); },
      v => { v.durationMs = 60001; },
      v => { v.shotTimeMs = 1001; },
    ];
    for (const mutate of mutations) {
      const value = attempt('invalid'); mutate(value);
      assert.equal((await api.call('/api/relays', {hostName: 'Host', hostAttempt: value})).status, 400);
    }
    assert.equal((await api.call('/api/relays', {hostName: ' '.repeat(2), hostAttempt: attempt('host')})).status, 400);
  } finally { await api.close(); }
});
test('relay persists across server restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'faze-social-'));
  const databasePath = join(directory, 'relays.sqlite');
  try {
    const first = await start(databasePath);
    let relayId: string;
    try { relayId = (await first.call('/api/relays', {hostName: 'Host', hostAttempt: attempt('persist')})).body.id; }
    finally { await first.close(); }
    const second = await start(databasePath);
    try { assert.equal((await second.call(`/api/relays/${relayId}`)).body.hostAttempt.id, 'persist'); }
    finally { await second.close(); }
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
