import { randomUUID } from 'node:crypto';

export const ROLES = ['codex-1', 'codex-2', 'codex-3', 'claude-1', 'claude-2'];
export const WORKERS = ROLES.slice(1);
export const KINDS = ['onboard', 'implement', 'test', 'review'];
export const shaPattern = /^[a-f0-9]{40}$/;
export function checkRole(role) { if (!ROLES.includes(role)) throw new Error('Unknown role'); return role; }
export function workerGoal(control) { return control.productGoal ?? control.goal; }
export function heartbeatUpdate(old, session, extra = {}, time = Date.now()) {
  if (old?.lease?.session !== session) throw new Error('Worker lease lost');
  if (time - Date.parse(old.lease.at) < 60000 && Object.entries(extra).every(([key, value]) => old[key] === value)) return old;
  return { ...old, ...extra, lease: { ...old.lease, at: new Date(time).toISOString() } };
}
export function initialControl(baseSha) {
  if (!shaPattern.test(baseSha)) throw new Error('Invalid base SHA');
  return { version: 1, runId: randomUUID(), status: 'paused', goal: '', baseSha,
    maxTurns: 30, turns: 0, tasks: [], humanResume: null, summary: 'Setup only; feature work paused.' };
}
export function makeTask(input, existing = []) {
  checkRole(input.role);
  if (!KINDS.includes(input.kind) || (input.role === 'codex-1' && input.kind !== 'onboard')) throw new Error('Invalid task kind/role');
  if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 9000) throw new Error('Instruction must be 1–9000 characters');
  if (!shaPattern.test(input.baseSha)) throw new Error('Task needs exact base SHA');
  if (input.role === 'claude-1' && !['review', 'onboard'].includes(input.kind)) throw new Error('Claude 1 is review-only');
  if (input.role === 'claude-2' && !['test', 'onboard'].includes(input.kind)) throw new Error('Claude 2 owns tests');
  if (['codex-2', 'codex-3'].includes(input.role) && input.kind === 'test') throw new Error('Independent tests belong to Claude 2');
  const dependsOn = input.dependsOn ?? [];
  if (!Array.isArray(dependsOn) || dependsOn.length > 20 || dependsOn.some(id => !existing.some(t => t.id === id))) throw new Error('Dependencies must be existing task IDs');
  return { id: randomUUID(), role: input.role, kind: input.kind, instruction: input.instruction,
    baseSha: input.baseSha, dependsOn, createdAt: new Date().toISOString() };
}
export function canRun(control, task) {
  if (!['paused', 'running'].includes(control.status)) return false;
  return task.kind === 'onboard' || (control.status === 'running' && Boolean(control.humanResume));
}
export function allResults(records) { return Object.assign({}, ...records.map(r => r?.results ?? {})); }
export function nextTask(control, role, results) {
  return control.tasks.find(t => t.role === role && !results[t.id] && canRun(control, t)
    && t.dependsOn.every(id => results[id]?.status === 'done'));
}
export function owns(role, path) {
  if (path.startsWith(`team/roles/${role}/`)) return true;
  if (path.startsWith('.') || path.includes('..') || path.includes('\\')) return false;
  const test = path.startsWith('tests/') || path.endsWith('.test.ts');
  if (role === 'claude-2') return test;
  if (role === 'claude-1') return false;
  if (test) return false;
  if (role === 'codex-2') return path.startsWith('server/') || path.startsWith('packages/social/');
  if (role === 'codex-3') return ['src/', 'packages/challenges/', 'packages/gameplay/'].some(p => path.startsWith(p));
  return role === 'codex-1' && (path.startsWith('docs/') || path.startsWith('shared/'));
}
export function changedPaths(porcelain) {
  const fields = porcelain.split('\0'), paths = [];
  for (let i = 0; i < fields.length && fields[i]; i++) {
    const entry = fields[i];
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) paths.push(fields[++i]);
  }
  return paths;
}
export function assertOwned(role, paths, kind) {
  if (kind === 'onboard' && paths.length) throw new Error('Onboarding must not change tracked/source files');
  const invalid = paths.filter(p => !owns(role, p));
  if (invalid.length) throw new Error(`Ownership violation; changes left for human inspection: ${invalid.join(', ')}`);
}
export function redact(text) {
  return String(text).replace(/(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]+)/g, '[REDACTED]').slice(0, 10000);
}
export const planSchema = {
  type: 'object', additionalProperties: false, required: ['summary', 'decision', 'tasks'],
  properties: {
    summary: { type: 'string' }, decision: { type: 'string', enum: ['continue', 'complete', 'blocked'] },
    tasks: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false,
      required: ['role', 'kind', 'instruction', 'baseSha', 'dependsOn'], properties: {
        role: { type: 'string', enum: WORKERS }, kind: { type: 'string', enum: ['implement', 'test', 'review'] },
        instruction: { type: 'string' }, baseSha: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } }
      } } }
  }
};
export function validatePlan(reply, control, results) {
  if (!reply || typeof reply.summary !== 'string' || reply.summary.length > 6000 || !['continue', 'complete', 'blocked'].includes(reply.decision)
    || !Array.isArray(reply.tasks) || reply.tasks.length > 4) throw new Error('Invalid coordinator response');
  if (new Set(reply.tasks.map(t => t.role)).size !== reply.tasks.length) throw new Error('One task per role per coordinator turn');
  const tasks = reply.tasks.map(t => { if (!WORKERS.includes(t.role)) throw new Error('Only coordinator assigns worker tasks'); return makeTask(t, control.tasks); });
  if (control.tasks.length + tasks.length > 100) throw new Error('Run task limit reached');
  if (reply.decision !== 'continue' && tasks.length) throw new Error('Final decision cannot enqueue work');
  if (reply.decision === 'complete') {
    if (control.tasks.some(t => results[t.id]?.status !== 'done')) throw new Error('Outstanding/failed tasks prevent completion');
    if (WORKERS.some(role => !control.tasks.some(t => t.role === role && t.kind !== 'onboard'))) throw new Error('All four workers need substantive deliverables');
  }
  if (reply.decision === 'continue' && !tasks.length) throw new Error('No empty coordinator acknowledgement loops');
  return tasks;
}
