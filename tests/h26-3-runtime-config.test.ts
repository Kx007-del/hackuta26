// claude-2 independent H26-3 runtime-config regressions.
// Derived from the frozen contract in docs/H26-3-PLAN.md (task item 3 plus "Claude 1's plan corrections"
// and "Post-review frozen decisions"), not from the implementation. Unit tests import only the pure
// server/runtime-config.ts module. server/index.ts is NEVER imported: bootstrap ordering and the
// /api/health shape are checked by launching it as a separate Node process with throwaway storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {resolveRuntimeConfig} from '../server/runtime-config';

const root = resolve(import.meta.dirname, '..');
const SHA = 'a'.repeat(20) + '0123456789'.repeat(2);
const resolveWith = (env: Record<string, string | undefined>) => resolveRuntimeConfig(Object.freeze({...env}));
const rejects = (env: Record<string, string | undefined>) => {
  let error: unknown;
  try { resolveWith(env); } catch (e) { error = e; }
  assert.ok(error instanceof Error, `expected rejection for ${JSON.stringify(env)}`);
  return error.message;
};

// ---------------- pure resolver ----------------
test('module is pure on import: no process.env, React/Three/CSS, server or storage imports', () => {
  const text = readFileSync(join(root, 'server/runtime-config.ts'), 'utf8');
  assert.doesNotMatch(text, /\bprocess\b/, 'must not read process/process.env');
  for (const m of text.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
    assert.doesNotMatch(m[1], /react|three|\.css$|express|sqlite|social|^\.\/index|vite/i, `side-effectful import ${m[1]}`);
  }
  assert.doesNotMatch(text, /^\s*import\s+['"]/m, 'no bare side-effect imports');
});

test('defaults: local 127.0.0.1:5173, commit null, exactly three public keys', () => {
  const r = resolveWith({});
  assert.deepEqual(r, {host: '127.0.0.1', port: 5173, commit: null});
  assert.deepEqual(Object.keys(r).sort(), ['commit', 'host', 'port']);
});

test('host: 0.0.0.0 only when RENDER is exactly "true"; explicit nonblank trimmed HOST wins', () => {
  assert.equal(resolveWith({RENDER: 'true'}).host, '0.0.0.0');
  for (const RENDER of ['TRUE', 'True', '1', 'yes', 'false', '', ' true']) {
    assert.equal(resolveWith({RENDER}).host, '127.0.0.1', `RENDER=${JSON.stringify(RENDER)}`);
  }
  assert.equal(resolveWith({HOST: '  10.1.2.3  ', RENDER: 'true'}).host, '10.1.2.3');
  assert.equal(resolveWith({HOST: 'localhost'}).host, 'localhost');
  assert.equal(resolveWith({HOST: '   ', RENDER: 'true'}).host, '0.0.0.0', 'blank HOST falls back');
  assert.equal(resolveWith({HOST: '\t\n'}).host, '127.0.0.1', 'blank HOST falls back');
});

test('port: blank/unset defaults; trimmed ASCII digits 0..65535 accepted, leading zeros decimal', () => {
  for (const PORT of [undefined, '', '   ', '\t']) assert.equal(resolveWith({PORT}).port, 5173, JSON.stringify(PORT));
  const ok: Array<[string, number]> = [['0', 0], ['1', 1], ['80', 80], [' 8080 ', 8080], ['\t3000\n', 3000],
    ['65535', 65535], ['0080', 80], ['00000', 0], ['010', 10]];
  for (const [PORT, port] of ok) assert.equal(resolveWith({PORT}).port, port, JSON.stringify(PORT));
});

test('port: malformed values fail with one fixed message that never echoes the input', () => {
  const bad = ['65536', '70000', '-1', '+80', '1e3', '0x50', '0o17', '0b11', '80.0', '80.5', '8 0', '80abc', 'abc',
    'NaN', 'Infinity', '８０' /* full-width 80 */, '٨٠' /* Arabic-Indic 80 */, '99999999999999999999',
    '9'.repeat(400), '١'];
  const messages = new Set<string>();
  for (const PORT of bad) {
    const message = rejects({PORT});
    messages.add(message);
    if (PORT.trim().length > 1) assert.ok(!message.includes(PORT.trim()), `message echoes ${JSON.stringify(PORT)}`);
  }
  assert.equal(messages.size, 1, `expected one fixed message, got ${[...messages].join(' | ')}`);
  assert.match([...messages][0], /PORT/);
  assert.equal(rejects({PORT: 'sk-' + 'x'.repeat(30)}).includes('sk-'), false, 'never reflects secret-looking input');
});

test('commit: trimmed case-insensitive 40-hex RENDER_GIT_COMMIT, normalized lowercase; anything else null', () => {
  assert.equal(resolveWith({RENDER_GIT_COMMIT: SHA}).commit, SHA);
  assert.equal(resolveWith({RENDER_GIT_COMMIT: `  ${SHA.toUpperCase()}\n`}).commit, SHA);
  assert.equal(resolveWith({RENDER_GIT_COMMIT: 'AbCdEf' + SHA.slice(6)}).commit, 'abcdef' + SHA.slice(6));
  for (const RENDER_GIT_COMMIT of [undefined, '', '   ', SHA.slice(1), SHA + '0', 'g'.repeat(40), `${SHA.slice(0, 20)} ${SHA.slice(21)}`,
    'f'.repeat(64), `0x${SHA.slice(2)}`, `${SHA}\n${SHA}`, 'main']) {
    assert.equal(resolveWith({RENDER_GIT_COMMIT}).commit, null, JSON.stringify(RENDER_GIT_COMMIT));
  }
});

test('commit/host handling is independent of PORT validity order and reads no other environment', () => {
  const env = {HOST: 'h', PORT: '1', RENDER_GIT_COMMIT: SHA, RENDER: 'true', SECRET_TOKEN: 'sk-' + 'z'.repeat(40),
    DATABASE_PATH: '/private/db.sqlite', GITHUB_TOKEN: 'ghp_' + 'q'.repeat(36), RENDER_SERVICE_ID: 'srv-123'};
  const r = resolveWith(env);
  assert.deepEqual(r, {host: 'h', port: 1, commit: SHA});
  const json = JSON.stringify(r);
  for (const leak of ['sk-', 'ghp_', 'private', 'srv-123', 'RENDER']) assert.ok(!json.includes(leak), `leaks ${leak}`);
  assert.deepEqual(resolveWith(env), r, 'deterministic');
});

// ---------------- bootstrap, as a separate process (server/index.ts is never imported) ----------------
type Run = {code: number | null; out: string};
const freePort = () => new Promise<number>((ok, fail) => {
  const s = createServer();
  s.once('error', fail);
  s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => ok(typeof a === 'object' && a ? a.port : 0)); });
});
function launch(env: Record<string, string>, store: string) {
  const childEnv: Record<string, string | undefined> = {...process.env, ...env,
    DATABASE_PATH: join(store, 'relays.sqlite'), CLIP_DIRECTORY: join(store, 'clips')};
  for (const k of ['HOST', 'PORT', 'RENDER', 'RENDER_GIT_COMMIT']) if (!(k in env)) delete childEnv[k];
  // Single node process (tsx loader via --import) so the test can terminate it directly on every OS.
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--production'],
    {cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let out = '';
  child.stdout.on('data', c => { out += c; });
  child.stderr.on('data', c => { out += c; });
  const exited = new Promise<Run>(ok => child.on('exit', code => ok({code, out})));
  return {child, exited, output: () => out};
}
async function withStore(fn: (store: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'h26-3-runtime-'));
  try { await fn(join(dir, 'store')); } finally { rmSync(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); }
}

test('bootstrap rejects invalid PORT before storage, Vite or listen side effects', {timeout: 60000}, async () => {
  await withStore(async store => {
    // A free port, so a regressed server that wrongly accepts '+N' cannot collide with anything; it is
    // always terminated below rather than leaked.
    const bad = `+${await freePort()}`;
    const {child, exited} = launch({PORT: bad}, store);
    let started = false;
    const guard = setTimeout(() => { started = true; child.kill(); }, 20000);
    const r = await exited;
    clearTimeout(guard);
    assert.equal(started, false, `server kept running instead of rejecting PORT=${bad}:\n${r.out}`);
    assert.notEqual(r.code, 0, `server should refuse to start:\n${r.out}`);
    assert.match(r.out, /PORT/);
    assert.ok(!r.out.includes(bad), 'error output must not echo the input');
    assert.doesNotMatch(r.out, /ready at/i);
    assert.equal(existsSync(store), false, 'no relay database or clip directory created');
  });
});

test('GET /api/health keeps {ok, service} and adds the normalized commit; HOST/PORT come from runtime config', {timeout: 60000}, async () => {
  await withStore(async store => {
    const port = await freePort();
    const {child, exited, output} = launch({HOST: ' 127.0.0.1 ', PORT: ` ${port} `, RENDER_GIT_COMMIT: SHA.toUpperCase()}, store);
    try {
      const deadline = Date.now() + 45000;
      let body: unknown;
      while (Date.now() < deadline && body === undefined) {
        if (child.exitCode !== null) assert.fail(`server exited early (${child.exitCode}):\n${output()}`);
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/health`);
          assert.equal(res.status, 200);
          body = await res.json();
        } catch (e) {
          if (e instanceof assert.AssertionError) throw e;
          await new Promise(r => setTimeout(r, 250));
        }
      }
      assert.deepEqual(body, {ok: true, service: 'run-it-back', commit: SHA});
      assert.match(output(), new RegExp(`ready at http://127\\.0\\.0\\.1:${port}\\b`));
      const missing = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`);
      assert.equal(missing.status, 404, 'unknown API routes still 404');
    } finally {
      child.kill();
      await exited;
    }
  });
});

test('GET /api/health reports commit null when RENDER_GIT_COMMIT is absent or invalid', {timeout: 60000}, async () => {
  await withStore(async store => {
    const port = await freePort();
    const {child, exited, output} = launch({PORT: String(port), RENDER_GIT_COMMIT: 'not-a-sha'}, store);
    try {
      const deadline = Date.now() + 45000;
      let body: unknown;
      while (Date.now() < deadline && body === undefined) {
        if (child.exitCode !== null) assert.fail(`server exited early (${child.exitCode}):\n${output()}`);
        try { body = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); }
        catch { await new Promise(r => setTimeout(r, 250)); }
      }
      assert.deepEqual(body, {ok: true, service: 'run-it-back', commit: null});
      assert.doesNotMatch(output(), /not-a-sha/);
    } finally {
      child.kill();
      await exited;
    }
  });
});
