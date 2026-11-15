import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialControl, makeTask, nextTask, canRun, changedPaths, assertOwned, validatePlan, redact } from './relay-core.mjs';
import { heartbeatUpdate, workerGoal } from './relay-core.mjs';
import { provider } from './relay-runtime.mjs';
const sha = 'a'.repeat(40);
const task = (role = 'codex-2', kind = 'implement', extra = {}) => makeTask({ role, kind, baseSha: sha, instruction: 'Bounded task', ...extra });

test('worker requirements exclude coordinator-only first-turn restrictions', () => {
  const control = { goal: 'For this first planning turn do not invoke tools.', productGoal: 'Implement tested runtime config and practice guidance.', coordinatorNotes: 'Codex 1 plans read-only.' };
  assert.equal(workerGoal(control), control.productGoal);
  assert.doesNotMatch(workerGoal(control), /do not invoke tools|Codex 1 plans/);
  assert.equal(workerGoal({ goal: 'Legacy product-only goal' }), 'Legacy product-only goal');
});

test('idle heartbeats bound GitHub writes while checking lease ownership and reporting state changes', () => {
  let state = { status: 'waiting', lease: { session: 'one', at: new Date(0).toISOString() } };
  let writes = 0;
  for (let time = 30000; time <= 3600000; time += 30000) {
    const next = heartbeatUpdate(state, 'one', { status: 'waiting' }, time);
    if (next !== state) writes++;
    state = next;
  }
  assert.equal(writes, 60);
  assert.equal(state.lease.at, new Date(3600000).toISOString());
  assert.equal(heartbeatUpdate(state, 'one', { status: 'working' }, 3600001).status, 'working');
  assert.throws(() => heartbeatUpdate(state, 'other', {}, 3600002), /lease lost/);
});

test('paused/stopped/blocked control fails closed except explicit setup onboarding', () => {
  const c = initialControl(sha), feature = task(), onboard = task('claude-1', 'onboard');
  assert.equal(canRun(c, feature), false); assert.equal(canRun(c, onboard), true);
  assert.equal(canRun({ ...c, status: 'running' }, feature), false);
  assert.equal(canRun({ ...c, status: 'running', humanResume: { instruction: 'resume' } }, feature), true);
  for (const status of ['blocked', 'stopped', 'complete', 'archiving', 'unknown']) assert.equal(canRun({ ...c, status }, onboard), false);
});
test('dependency failure and already-started turn cannot be automatically replayed', () => {
  const a = task(), b = makeTask({ role: 'claude-2', kind: 'test', baseSha: sha, instruction: 'Test actual diff', dependsOn: [a.id] }, [a]);
  const c = { ...initialControl(sha), status: 'running', humanResume: {}, tasks: [a, b] };
  assert.equal(nextTask(c, 'claude-2', {}), undefined);
  assert.equal(nextTask(c, 'claude-2', { [a.id]: { status: 'failed' } }), undefined);
  assert.equal(nextTask(c, 'claude-2', { [a.id]: { status: 'done' } }).id, b.id);
  assert.equal(nextTask(c, 'codex-2', { [a.id]: { status: 'running' } }), undefined);
});
test('permanent reviewer/test roles and exact base cannot be overridden by task data', () => {
  assert.throws(() => task('claude-1', 'implement'));
  assert.throws(() => task('claude-2', 'implement'));
  assert.throws(() => task('codex-1', 'implement'));
  assert.throws(() => task('codex-2', 'implement', { baseSha: 'main' }));
  assert.throws(() => task('codex-2', 'implement', { dependsOn: ['nonexistent'] }));
});
test('rename checks both ends and prevents stealing test/source/instruction ownership', () => {
  assert.deepEqual(changedPaths('R  server/new.ts\0src/old.ts\0?? server/extra.ts\0'), ['server/new.ts', 'src/old.ts', 'server/extra.ts']);
  assert.throws(() => assertOwned('codex-2', ['server/new.ts', 'src/old.ts'], 'implement'));
  assert.throws(() => assertOwned('codex-2', ['server/api.test.ts'], 'implement'));
  assert.throws(() => assertOwned('claude-2', ['server/api.ts'], 'test'));
  assert.throws(() => assertOwned('codex-3', ['AGENTS.md'], 'implement'));
  assert.throws(() => assertOwned('codex-3', ['src/../shared/contracts.ts'], 'implement'));
  assert.doesNotThrow(() => assertOwned('claude-2', ['server/api.test.ts', 'tests/clip.test.ts'], 'test'));
  assert.throws(() => assertOwned('claude-1', ['src/App.tsx'], 'review'));
  assert.throws(() => assertOwned('codex-2', ['server/api.ts'], 'onboard'));
});
test('coordinator cannot finish with missing tests/review or create acknowledgement loops', () => {
  const c = initialControl(sha);
  assert.throws(() => validatePlan({ summary: 'Done', decision: 'complete', tasks: [] }, c, {}));
  assert.throws(() => validatePlan({ summary: 'Waiting', decision: 'continue', tasks: [] }, c, {}));
  const tasks = [task(), task('codex-3'), task('claude-1', 'review'), task('claude-2', 'test')];
  const results = Object.fromEntries(tasks.map(t => [t.id, { status: 'done' }]));
  assert.doesNotThrow(() => validatePlan({ summary: 'Evidence linked', decision: 'complete', tasks: [] }, { ...c, tasks }, results));
  results[tasks[0].id].status = 'failed';
  assert.throws(() => validatePlan({ summary: 'Done', decision: 'complete', tasks: [] }, { ...c, tasks }, results));
});
test('common provider/GitHub credentials are redacted from published results', () => {
  assert.equal(redact(`token ghp_${'x'.repeat(30)} and sk-${'y'.repeat(30)}`), 'token [REDACTED] and [REDACTED]');
});

// Real child processes with a local mock CLI: no network, account or provider usage.
test('provider subprocesses use bounded modes, strict Claude model and stop on pause/failure', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'h26-relay-'));
  const mock = join(folder, 'provider.mjs');
  const oldCodex = process.env.H26_CODEX_CLI, oldClaude = process.env.H26_CLAUDE_CLI;
  process.env.H26_CODEX_CLI = mock; process.env.H26_CLAUDE_CLI = mock;
  try {
    writeFileSync(mock, `import fs from 'node:fs'; const args=process.argv.slice(2); let input=''; for await(const c of process.stdin) input+=c; fs.writeFileSync('args.json',JSON.stringify(args)); if(input==='wait'){setInterval(()=>{},1000)} else if(args.includes('--output-last-message')){fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'ready')}else{console.log(JSON.stringify({is_error:input==='error',result:'ready',modelUsage:{[input==='wrong'?'claude-sonnet-5-5':'claude-opus-5-5']:{}}}))}`);
    const c = await provider('codex-2', 'ready', folder, { kind: 'implement', taskId: 'codex' });
    assert.equal(c.text, 'ready');
    const codexArgs = JSON.parse(readFileSync(join(folder, 'args.json'), 'utf8'));
    assert.ok(codexArgs.includes('workspace-write')); assert.ok(!codexArgs.includes('--dangerously-bypass-approvals-and-sandbox'));
    const claude = await provider('claude-1', 'ready', folder, { taskId: 'claude' });
    assert.equal(claude.model, 'claude-opus-5-5');
    const claudeArgs = JSON.parse(readFileSync(join(folder, 'args.json'), 'utf8'));
    assert.ok(claudeArgs.includes('--restricted')); assert.ok(!claudeArgs.includes('Read,Glob,Grep,Edit,Write,Bash'));
    assert.ok(claudeArgs.some(a => a.includes('Bash(git diff *)')));
    await assert.rejects(provider('claude-1', 'wrong', folder, { taskId: 'wrong' }), /exclusively Opus/);
    await assert.rejects(provider('claude-1', 'error', folder, { taskId: 'error' }), /provider error/);
    await assert.rejects(provider('codex-2', 'wait', folder, { taskId: 'pause', pollMs: 50, stopCheck: async () => true }), /Paused/);
    await assert.rejects(provider('codex-2', 'wait', folder, { taskId: 'timeout', timeoutMs: 100 }), /timed out/);
    // Let the killed process close its pipes/logs before removing the isolated fixture.
    await new Promise(resolve => setTimeout(resolve, 150));
  } finally {
    if (oldCodex === undefined) delete process.env.H26_CODEX_CLI; else process.env.H26_CODEX_CLI = oldCodex;
    if (oldClaude === undefined) delete process.env.H26_CLAUDE_CLI; else process.env.H26_CLAUDE_CLI = oldClaude;
    rmSync(folder, { recursive: true, force: true });
  }
});
