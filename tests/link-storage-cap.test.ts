// Author-written tests (Claude 1, at the human's request) for the reference-record cap on POST /api/clips/link.
// Only YouTube links are used, which resolve without any network request.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { MAX_REFERENCE_RECORDS, registerClipApi } from '../packages/social/clips.ts';

async function withClips(directory: string, maxRecords: number, fn: (base: string) => Promise<void>) {
  const app = express();
  const clips = registerClipApi(app, { directory, maxRecords });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.close(); clips.close(); }
}
const save = (base: string, videoId: string, start = 1, arenaId = 'rooftop-v1') => fetch(`${base}/api/clips/link`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: `https://youtu.be/${videoId}`, arenaId, start, end: start + 4 }),
});
const vid = (n: number) => `video${String(n).padStart(6, '0')}`;
const jsonFiles = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.json')).length;

test('the default cap is a sensible bound', () => {
  assert.ok(MAX_REFERENCE_RECORDS >= 1000 && MAX_REFERENCE_RECORDS <= 20000);
});

test('saving the same moment again reuses the record instead of writing a new one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-cap-'));
  try {
    await withClips(dir, 10, async base => {
      const first = await save(base, vid(1));
      assert.equal(first.status, 201);
      const again = await save(base, vid(1));
      assert.equal(again.status, 200);
      assert.equal((await again.json()).id, (await first.json()).id);
      assert.equal((await save(base, vid(1), 2)).status, 201, 'a different moment is a new record');
      assert.equal((await save(base, vid(1), 1, 'tactical-v1')).status, 201, 'a different arena is a new record');
      assert.equal(jsonFiles(dir), 3);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new links are refused with 507 once the cap is reached, and existing records stay readable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-cap-'));
  try {
    let firstId = '';
    await withClips(dir, 3, async base => {
      for (let i = 0; i < 3; i++) {
        const res = await save(base, vid(i));
        assert.equal(res.status, 201);
        if (i === 0) firstId = (await res.json()).id;
      }
      const full = await save(base, vid(99));
      assert.equal(full.status, 507);
      assert.match((await full.json()).error, /storage is full/i);
      assert.equal((await save(base, vid(0))).status, 200, 'an already-saved moment is still returned when full');
      assert.equal((await fetch(`${base}/api/clips/${firstId}`)).status, 200);
      assert.equal(jsonFiles(dir), 3, 'nothing was written past the cap');
    });
    // A restart counts the records already on disk and keeps both the cap and the reuse index.
    await withClips(dir, 3, async base => {
      assert.equal((await save(base, vid(100))).status, 507);
      assert.equal((await save(base, vid(2))).status, 200);
    });
    await withClips(dir, 4, async base => {
      assert.equal((await save(base, vid(100))).status, 201, 'raising the cap allows new records again');
      assert.equal((await save(base, vid(101))).status, 507);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
