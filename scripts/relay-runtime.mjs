import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { redact } from './relay-core.mjs';

export const REPO = 'Kx007-del/hackuta26';
export const BRANCH = 'automation/queue';
export const POLL_MS = 30000;
export function cli(exe, args) {
  if (!['codex', 'claude'].includes(exe)) return { exe, args };
  const candidates = [process.env[exe === 'codex' ? 'H26_CODEX_CLI' : 'H26_CLAUDE_CLI']];
  if (process.platform === 'win32') {
    candidates.push(join(homedir(), '.local', 'bin', `${exe}.exe`));
    const prefix = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules');
    candidates.push(exe === 'codex' ? join(prefix, '@openai/codex/bin/codex.js') : join(prefix, '@anthropic-ai/claude-code/cli.js'));
  }
  const entry = candidates.find(p => p && existsSync(p));
  return entry ? (/\.[cm]?js$/i.test(entry) ? { exe: process.execPath, args: [entry, ...args] } : { exe: entry, args }) : { exe, args };
}
export function command(exe, args, options = {}) {
  const c = cli(exe, args);
  const r = spawnSync(c.exe, c.args, { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 4_000_000, ...options });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(redact(r.stderr || r.stdout || `${exe} failed`));
  return (r.stdout ?? '').trimEnd();
}
export function api(path, method = 'GET', body) {
  const args = ['api', `repos/${REPO}/${path}`, '--method', method];
  if (body) args.push('--input', '-');
  return JSON.parse(command('gh', args, { input: body ? JSON.stringify(body) : undefined }));
}
export function getFile(path) {
  const r = api(`contents/automation/${path}?ref=${encodeURIComponent(BRANCH)}`);
  return { sha: r.sha, data: JSON.parse(Buffer.from(r.content, 'base64').toString('utf8')) };
}
export function optionalFile(path) {
  try { return getFile(path); } catch (error) { if (/HTTP 404/.test(error.message)) return null; throw error; }
}
export function putFile(path, data, sha) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  if (content.length > 700000) throw new Error('Queue payload too large');
  return api(`contents/automation/${path}`, 'PUT', { branch: BRANCH, message: `relay: update ${path}`, content, ...(sha ? { sha } : {}) });
}
export function mutate(path, transform) {
  // GitHub rejects stale blob SHAs. Retry only the CAS operation, never provider work.
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = optionalFile(path), data = transform(before?.data ?? null);
    if (before && JSON.stringify(data) === JSON.stringify(before.data)) return data;
    try { putFile(path, data, before?.sha); return data; }
    catch (error) { if (!/HTTP (409|422)/.test(error.message) || attempt === 3) throw error; }
  }
}
export function readControl() { return getFile('control.json').data; }
export function git(args, cwd) { return command('git', args, { cwd }); }
export function profileEnv(role) {
  const env = { ...process.env, DISABLE_AUTOUPDATER: '1' };
  env[role.startsWith('claude') ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME'] = process.env.H26_PROFILE_DIR || join(homedir(), '.hackuta26', 'profiles', role);
  // Use the signed-in assigned profile; never silently route to a different API identity.
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[key];
  return env;
}
export function provider(role, prompt, cwd, { kind = 'review', schema, taskId, stopCheck = async () => false, pollMs = POLL_MS, timeoutMs = 480000 } = {}) {
  const folder = join(cwd, '.team-local', 'relay', taskId);
  mkdirSync(folder, { recursive: true });
  const output = join(folder, 'reply.json');
  const isClaude = role.startsWith('claude');
  const writable = kind === 'implement' || kind === 'test';
  let args;
  if (isClaude) {
    const tools = writable ? 'Read,Glob,Grep,Edit,Write,Bash' : 'Read,Glob,Grep,Bash';
    args = ['-p', '--model', 'claude-opus-5-5', '--restricted', '--permission-mode', writable ? 'acceptEdits' : 'plan',
      '--tools', tools, '--allowedTools', writable ? 'Read,Glob,Grep,Edit,Write,Bash(npm test),Bash(npm run build),Bash(npm run check),Bash(git diff *),Bash(git show *),Bash(git status *)' : 'Read,Glob,Grep,Bash(git diff *),Bash(git show *),Bash(git log *),Bash(git status *)',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--output-format', 'json', '--no-session-persistence', '--max-turns', '20'];
    if (schema) args.push('--json-schema', JSON.stringify(schema));
  } else {
    args = ['--ask-for-approval', 'never', 'exec', '--sandbox', writable ? 'workspace-write' : 'read-only', '--output-last-message', output];
    if (schema) { const path = join(folder, 'schema.json'); writeFileSync(path, JSON.stringify(schema)); args.push('--output-schema', path); }
    args.push('-');
  }
  const c = cli(isClaude ? 'claude' : 'codex', args);
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', size = 0, stopped = false, checking = false, stopReason, killDeadline;
    const child = spawn(c.exe, c.args, { cwd, env: profileEnv(role), windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const stop = reason => {
      if (stopped) return;
      stopped = true;
      stopReason = reason;
      cleanup();
      if (child.pid && process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
      killDeadline = setTimeout(() => {
        if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
        reject(new Error(`${reason}; process termination was not confirmed`));
      }, 5000);
    };
    const timeout = setTimeout(() => stop('Provider timed out; no automatic retry'), timeoutMs);
    const poll = setInterval(async () => {
      if (checking) return; checking = true;
      try { if (await stopCheck()) stop('Paused/stopped remotely or worker lease lost'); }
      catch { stop('Cannot verify remote control; stopping provider'); }
      finally { checking = false; }
    }, pollMs);
    const cleanup = () => { clearTimeout(timeout); clearInterval(poll); clearTimeout(killDeadline); };
    const capture = (chunk, isError) => {
      size += chunk.length;
      if (size > 2_000_000) stop('Provider output exceeded local bound');
      else if (isError) stderr += chunk; else stdout += chunk;
    };
    child.stdout.on('data', chunk => capture(chunk, false));
    child.stderr.on('data', chunk => capture(chunk, true));
    child.stdin.on('error', () => {});
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      writeFileSync(join(folder, 'stdout.log'), stdout); writeFileSync(join(folder, 'stderr.log'), stderr);
      if (stopped) return reject(new Error(stopReason));
      if (code !== 0) return reject(new Error('Provider failed; inspect private .team-local logs. No automatic retry.'));
      try {
        if (!isClaude) {
          const text = readFileSync(output, 'utf8');
          if (!text.trim()) throw new Error('Codex returned an empty handoff');
          resolve({ text: redact(text), structured: schema ? JSON.parse(text) : null, model: 'assigned Codex profile' });
        } else {
          const wrapper = JSON.parse(stdout);
          if (wrapper.is_error) throw new Error('Claude provider error; no fallback');
          const models = Object.keys(wrapper.modelUsage ?? {});
          if (!models.length || models.some(m => !m.startsWith('claude-opus-5-5'))) throw new Error('Claude actual model was not exclusively Opus 5.5');
          if (typeof wrapper.result !== 'string' || !wrapper.result.trim()) {
            if (!schema || !wrapper.structured_output) throw new Error('Claude returned an empty handoff');
          }
          resolve({ text: redact(wrapper.result ?? JSON.stringify(wrapper.structured_output)), structured: wrapper.structured_output ?? null, model: models.join(',') });
        }
      } catch (error) { reject(error); }
    });
    child.stdin.end(prompt);
  });
}
