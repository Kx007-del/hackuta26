import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { DEFAULT_CONFIG, type AttemptResult } from '../shared/contracts';
import { apiErrorHandler, registerApi } from '../packages/social/server';

const attempt = (id: string): AttemptResult => ({id, config: {...DEFAULT_CONFIG}, success: true, targetHit: true, airborneAtShot: true, rotationDegrees: 0, durationMs: 1000, shotTimeMs: 900, frames: [{t: 0, x: 0, y: 2, z: 0, yaw: 0, pitch: 0}, {t: 1000, x: 0, y: 1, z: -1, yaw: 0, pitch: 0}]});
const host = (id: string) => ({hostName: 'Host', hostAttempt: attempt(id)});
const guest = (id = 'guest', guestName = 'Guest') => ({guestName, guestAttempt: attempt(id)});

type StartOptions = {databasePath?: string; before?: (app: Express) => void};

// Mirrors server/index.ts order: json parser (2mb), routes, exported apiErrorHandler last.
async function start(options: StartOptions = {databasePath: ':memory:'}) {
  const app = express();
  app.use(express.json({limit: '2mb'}));
  options.before?.(app);
  const closeDb = registerApi(app, options.databasePath === undefined ? {} : {databasePath: options.databasePath});
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  const url = `http://127.0.0.1:${address.port}`;
  const raw = async (path: string, init?: RequestInit) => {
    const response = await fetch(url + path, init);
    return {status: response.status, type: response.headers.get('content-type') ?? '', text: await response.text()};
  };
  const post = (path: string, body: string) => raw(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
  const call = async (path: string, body?: unknown) => {
    const r = body === undefined ? await raw(path) : await post(path, JSON.stringify(body));
    return {status: r.status, body: JSON.parse(r.text)};
  };
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    closeDb();
  };
  return {raw, post, call, close};
}

const assertJson = (r: {type: string; text: string}, label: string) => {
  assert.match(r.type, /application\/json/, label);
  assert.doesNotThrow(() => JSON.parse(r.text), label);
  assert.doesNotMatch(r.text, /node_modules|\n\s+at /, label);
};

test('malformed JSON returns JSON 400 via exported apiErrorHandler; later valid request succeeds', async () => {
  const api = await start();
  try {
    for (const body of ['{"hostName":', '{bad json}', '[1,2', 'undefined', '"text"']) {
      const r = await api.post('/api/relays', body);
      assert.equal(r.status, 400, body);
      assertJson(r, body);
    }
    const complete = await api.post('/api/relays/any/complete', '{');
    assert.equal(complete.status, 400);
    assertJson(complete, 'complete');
    const ok = await api.call('/api/relays', host('after-bad'));
    assert.equal(ok.status, 201);
    assert.equal((await api.call(`/api/relays/${ok.body.id}`)).body.hostAttempt.id, 'after-bad');
  } finally { await api.close(); }
});

test('oversized JSON keeps JSON 413 and does not poison later requests', async () => {
  const api = await start();
  try {
    const huge = JSON.stringify({...host('huge'), padding: 'x'.repeat(2 * 1024 * 1024 + 16)});
    const r = await api.post('/api/relays', huge);
    assert.equal(r.status, 413);
    assertJson(r, '413');
    assert.equal((await api.call('/api/relays', host('after-huge'))).status, 201);
  } finally { await api.close(); }
});

test('unexpected route errors become generic JSON 500 without leaking details', async () => {
  const api = await start({databasePath: ':memory:', before: app => {
    app.get('/__test/boom', (_req: Request, _res: Response, next: NextFunction) => next(new Error('secret-internal-detail')));
  }});
  try {
    const r = await api.raw('/__test/boom');
    assert.equal(r.status, 500);
    assertJson(r, '500');
    assert.doesNotMatch(r.text, /secret-internal-detail/);
    assert.equal((await api.call('/api/relays', host('after-500'))).status, 201);
  } finally { await api.close(); }
});

test('apiErrorHandler is a 4-arity error handler and delegates once headers are sent', () => {
  assert.equal(apiErrorHandler.length, 4);
  const error = new Error('late failure');
  const calls: unknown[] = [];
  const mustNotWrite = () => { throw new Error('handler wrote after headersSent'); };
  const res = {headersSent: true, status: mustNotWrite, json: mustNotWrite, send: mustNotWrite, end: mustNotWrite, set: mustNotWrite, type: mustNotWrite} as unknown as Response;
  apiErrorHandler(error, {} as Request, res, ((value?: unknown) => { calls.push(value); }) as NextFunction);
  assert.deepEqual(calls, [error]);
});

type Api = Awaited<ReturnType<typeof start>>;

async function withDatabaseEnv(value: string | undefined, run: () => Promise<void>) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'DATABASE_PATH');
  const previous = process.env.DATABASE_PATH;
  if (value === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = value;
  try { await run(); }
  finally { if (had) process.env.DATABASE_PATH = previous; else delete process.env.DATABASE_PATH; }
}

// Restores cwd BEFORE removal (Windows cannot delete the current directory); every API is closed inside run().
async function inTempDir(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'faze-h26-'));
  const cwd = process.cwd();
  try { await run(dir); }
  finally { process.chdir(cwd); rmSync(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}); }
}

async function createRelay(api: Api, id: string): Promise<string> {
  const created = await api.call('/api/relays', host(id));
  assert.equal(created.status, 201);
  return created.body.id;
}

test('trimmed DATABASE_PATH is used when no explicit option; nested parents are created', async () => {
  await inTempDir(async dir => {
    const file = join(dir, 'env', 'nested', 'relays.sqlite');
    await withDatabaseEnv(`  ${file}  `, async () => {
      const first = await start({});
      let id = '';
      try { id = await createRelay(first, 'env'); } finally { await first.close(); }
      assert.ok(existsSync(file), 'env database file created');
      const second = await start({databasePath: file});
      try { assert.equal((await second.call(`/api/relays/${id}`)).body.hostAttempt.id, 'env'); }
      finally { await second.close(); }
    });
  });
});

test('explicit databasePath overrides DATABASE_PATH, including :memory:', async () => {
  await inTempDir(async dir => {
    process.chdir(dir);
    const envFile = join(dir, 'from-env', 'relays.sqlite');
    const explicitFile = join(dir, 'explicit', 'deep', 'relays.sqlite');
    await withDatabaseEnv(envFile, async () => {
      const memory = await start({databasePath: ':memory:'});
      let memoryId = '';
      try { memoryId = await createRelay(memory, 'memory'); } finally { await memory.close(); }
      assert.equal(existsSync(envFile), false, 'env path untouched by explicit :memory:');
      const disk = await start({databasePath: explicitFile});
      try {
        await createRelay(disk, 'explicit');
        assert.equal((await disk.call(`/api/relays/${memoryId}`)).status, 404, ':memory: data not shared');
      } finally { await disk.close(); }
      assert.ok(existsSync(explicitFile));
      assert.equal(existsSync(envFile), false);
      assert.equal(existsSync(join(dir, 'data')), false, 'default path untouched');
    });
  });
});

test('DATABASE_PATH=:memory: stays in memory and is not shared between instances', async () => {
  await inTempDir(async dir => {
    process.chdir(dir);
    await withDatabaseEnv(':memory:', async () => {
      const a = await start({});
      let id = '';
      try { id = await createRelay(a, 'mem-env'); } finally { await a.close(); }
      const b = await start({});
      try { assert.equal((await b.call(`/api/relays/${id}`)).status, 404); } finally { await b.close(); }
    });
    assert.equal(existsSync(join(dir, 'data')), false);
  });
});

test('unset/blank DATABASE_PATH falls back to cwd/data/relays.sqlite; relative env resolves from cwd', async () => {
  await inTempDir(async dir => {
    process.chdir(dir);
    const ids: string[] = [];
    for (const blank of [undefined, '', '   ']) {
      await withDatabaseEnv(blank, async () => {
        const api = await start({});
        try { ids.push(await createRelay(api, `blank-${ids.length}`)); } finally { await api.close(); }
      });
    }
    const fallback = join(dir, 'data', 'relays.sqlite');
    assert.ok(existsSync(fallback));
    const check = await start({databasePath: fallback});
    try { for (const id of ids) assert.equal((await check.call(`/api/relays/${id}`)).status, 200, id); }
    finally { await check.close(); }
    await withDatabaseEnv(join('rel', 'deep', 'relays.sqlite'), async () => {
      const api = await start({});
      try { await createRelay(api, 'relative'); } finally { await api.close(); }
    });
    assert.ok(existsSync(join(dir, 'rel', 'deep', 'relays.sqlite')));
  });
});

test('waiting and completed relays survive close/reopen with completion rules intact', async () => {
  await inTempDir(async dir => {
    const file = join(dir, 'relays.sqlite');
    let waiting = '';
    let completed = '';
    const first = await start({databasePath: file});
    try {
      waiting = await createRelay(first, 'w');
      completed = await createRelay(first, 'c');
      assert.equal((await first.call(`/api/relays/${completed}/complete`, guest())).body.status, 'completed');
    } finally { await first.close(); }
    const second = await start({databasePath: file});
    try {
      const w = (await second.call(`/api/relays/${waiting}`)).body;
      assert.equal(w.status, 'waiting');
      assert.equal(w.hostAttempt.id, 'w');
      assert.ok(w.guestAttempt == null);
      const c = (await second.call(`/api/relays/${completed}`)).body;
      assert.equal(c.status, 'completed');
      assert.equal(c.guestName, 'Guest');
      assert.equal(c.guestAttempt.id, 'guest');
      assert.equal((await second.call(`/api/relays/${completed}/complete`, guest())).status, 200);
      assert.equal((await second.call(`/api/relays/${completed}/complete`, guest('guest', 'Someone else'))).status, 409);
      assert.equal((await second.call(`/api/relays/${waiting}/complete`, guest('late'))).body.status, 'completed');
    } finally { await second.close(); }
    const third = await start({databasePath: file});
    try {
      const w = (await third.call(`/api/relays/${waiting}`)).body;
      assert.equal(w.status, 'completed');
      assert.equal(w.guestAttempt.id, 'late');
    } finally { await third.close(); }
  });
});
