// Portable onboarding only. This is not a cross-machine agent dispatcher.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const state = JSON.parse(readFileSync(join(root, 'team/state.json'), 'utf8'));
const [command = 'status', role] = process.argv.slice(2);
const validRole = () => {
  if (!Object.hasOwn(state.roles, role ?? '')) throw new Error(`Choose: ${Object.keys(state.roles).join(', ')}`);
};
function run(exe, args, options = {}) {
  // Resolve official npm/native entry points without invoking a shell or .cmd shim.
  if (['codex', 'claude'].includes(exe)) {
    const override = process.env[exe === 'codex' ? 'H26_CODEX_CLI' : 'H26_CLAUDE_CLI'];
    const candidates = [override];
    if (process.platform === 'win32') {
      candidates.push(join(homedir(), '.local', 'bin', `${exe}.exe`));
      const npmRoot = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules');
      candidates.push(exe === 'codex' ? join(npmRoot, '@openai', 'codex', 'bin', 'codex.js') : join(npmRoot, '@anthropic-ai', 'claude-code', 'cli.js'));
    }
    const entry = candidates.find(candidate => candidate && existsSync(candidate));
    if (entry) {
      exe = entry;
      if (/\.[cm]?js$/i.test(entry)) { args = [entry, ...args]; exe = process.execPath; }
    }
  }
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${exe} failed`).trim());
  return result.stdout?.trim() ?? '';
}
function identity() {
  validRole();
  const profile = join(homedir(), '.hackuta26', 'profiles', role);
  const isClaude = role.startsWith('claude');
  return { profile, exe: isClaude ? 'claude' : 'codex', env: { ...process.env, [isClaude ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME']: profile } };
}
try {
  if (command === 'status') {
    console.log(JSON.stringify(state, null, 2));
  } else if (command === 'doctor') {
    validRole();
    let failures = 0;
    for (const [name, exe, args] of [
      ['Node', process.execPath, ['--version']], ['Git', 'git', ['--version']],
      ['GitHub CLI', 'gh', ['--version']],
      ['GitHub login', 'gh', ['auth', 'status']],
      ['Repository access', 'gh', ['repo', 'view', state.repository, '--json', 'nameWithOwner']],
      ['Agent CLI', role.startsWith('claude') ? 'claude' : 'codex', ['--version']]
    ]) {
      try { console.log(`OK ${name}: ${run(exe, args).split('\n')[0]}`); }
      catch (error) { failures++; console.log(`MISSING ${name}: ${error.message}`); }
    }
    console.log(`Feature development: ${state.status}. Doctor does not invoke an agent or resume work.`);
    process.exitCode = failures ? 1 : 0;
  } else if (command === 'prepare') {
    validRole();
    const remote = run('git', ['remote', 'get-url', 'origin']);
    if (!/github\.com[:/]Kx007-del\/hackuta26(?:\.git)?$/i.test(remote)) throw new Error('origin must be Kx007-del/hackuta26');
    run('git', ['fetch', 'origin']);
    const target = resolve(root, '..', 'agent-worktrees', role);
    if (existsSync(target)) throw new Error(`Folder already exists; inspect it instead of overwriting: ${target}`);
    mkdirSync(dirname(target), { recursive: true });
    run('git', ['worktree', 'add', '-b', `agents/${role}`, target, `origin/${state.integrationBranch}`]);
    console.log(`Prepared ${target}\nOpen that folder in your agent. Run npm ci there. Feature work remains ${state.status}.`);
  } else if (command === 'login') {
    const agent = identity();
    mkdirSync(agent.profile, { recursive: true });
    run(agent.exe, role.startsWith('claude') ? ['auth', 'login'] : ['login'], { env: agent.env, stdio: 'inherit' });
  } else if (command === 'auth-status') {
    const agent = identity();
    console.log(run(agent.exe, role.startsWith('claude') ? ['auth', 'status'] : ['login', 'status'], { env: agent.env }));
  } else if (command === 'prompt') {
    validRole();
    console.log(`You are ${role}, assigned to ${state.roles[role].computer}.\nYour permanent scope: ${state.roles[role].scope}.\nRead AGENTS.md, docs/MULTI-COMPUTER.md, team/state.json and docs/ROADMAP.md.\nProject feature development is ${state.status}. Only onboard and report connectivity; do not implement features or resume the old dispatcher.\nUse GitHub issue/PR handoffs with role labels and exact commit SHAs. Codex 1 coordinates; human instructions have priority.\nBoth Claude roles must use ${state.claudeModel}; stop if unavailable.\nConfirm your role, machine label, repository access, checkout SHA, clean/dirty state, provider login and actual model in the onboarding issue. Do not include tokens or personal login details.\nDo not claim another computer is connected without its check-in. Wait for explicit human resume before feature work.`);
  } else {
    throw new Error('Commands: status | doctor ROLE | prepare ROLE | login ROLE | auth-status ROLE | prompt ROLE');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
