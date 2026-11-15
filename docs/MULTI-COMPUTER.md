# Four computers, five permanent agents

Feature development is paused at the human's request. The old Windows message dispatcher is paused with zero running jobs. This setup does not resume it. Only onboarding and connectivity checks should happen until the human says to resume.

## Preserve the original assignment

The saved agreement in the original “Set up four-agent coding workflow” chat assigned these responsibilities. Although the chat title says four, the permanent agreement was expanded to five verified account profiles. This is the proposed device placement, not a claim that the remote computers are already connected.

| Computer | Account/role | Deliverable every milestone |
| --- | --- | --- |
| Windows 1: current computer | Codex 1 | Approved plan, contracts, bounded tasks, integration and final disposition |
| Windows 1: separate profile and worktree | Claude 1, Opus 5.5 | Independent plan review, exact-diff review, brand audit and findings |
| Mac | Codex 2 | Backend/server/persistence implementation and handoff |
| Windows 3 | Codex 3 | Frontend, graphics, controls and gameplay implementation and handoff |
| Windows 2 | Claude 2, Opus 5.5 | Independent tests, edge cases, regressions and browser evidence |

The human outranks every agent. Codex 1 has final say among agents. Balance meaningful effort, not message count: give each role a concrete deliverable, size it small/medium/large, and split large assignments before the next milestone. Reviews and tests are substantial work; do not change their roles into extra feature authors merely to equalize commits. Codex 2 and Codex 3 may clarify interfaces directly, with the decision recorded for Codex 1.

Originally, all five accounts were on this Windows computer, behind a localhost message service. That service routed read-only proposals; desktop applied changes and ran checks. It was limited to two simultaneous provider turns. All five had fresh successful responses in the last completed cycle; see H26-2 account-health records. Enabled configuration alone never proved connectivity. The service's proposal transport and coordinator-mediated edits were a bottleneck for truly distributed coding.

The workflow shares committed source, task packets, reviews and evidence through this private GitHub repository. Each computer runs its own agent session. The subsequently requested [distributed relay](AUTOMATION.md) can automatically dispatch tasks while its coordinator/worker processes are running. GitHub alone does not wake sessions or synchronize private chat histories.

## Install and sign in on each computer

Use a local development folder outside OneDrive/iCloud/Dropbox. Do not copy the current computer's account folders, tokens, SQLite databases, uploaded clips or node_modules. Each provider account owner signs in on the assigned computer. GitHub access and Codex/Claude subscriptions are separate logins; every computer needs GitHub access to Kx007-del/hackuta26. If a person uses a different GitHub identity, the repository owner must invite that person first.

Install Git, Node.js 24, and GitHub CLI using their official installers. Git for Windows also provides the shell Claude may need. Open a fresh terminal and verify:

```text
git --version
node --version
npm --version
gh --version
gh auth login
gh auth setup-git
gh repo view Kx007-del/hackuta26
```

Install Codex on Windows 1, Windows 3 and the Mac:

```text
npm install -g @openai/codex
codex --version
```

Install Claude Code on Windows 1 and Windows 2 using the official installer or:

```text
npm install -g @anthropic-ai/claude-code
claude --version
```

Install links: [Git](https://git-scm.com/downloads), [Node](https://nodejs.org/en/download), [GitHub CLI](https://cli.github.com/), [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [Claude installation](https://support.claude.com/en/articles/14552382-your-first-day-in-claude-code). Provider installation and model names can change; use these official sources if an installer fails.

## Clone the same repository

Windows 2 and Windows 3, in PowerShell:

```powershell
New-Item -ItemType Directory -Force C:\dev | Out-Null
Set-Location C:\dev
git clone --branch build/five-agent-h26 https://github.com/Kx007-del/hackuta26.git
Set-Location hackuta26
```

Mac, in Terminal:

```bash
mkdir -p ~/dev
cd ~/dev
git clone --branch build/five-agent-h26 https://github.com/Kx007-del/hackuta26.git
cd hackuta26
```

Windows 1 already has a checkout; do not clone over it. It may continue using its current local checkout for onboarding. A later move outside OneDrive should be a fresh clone after all changes are committed, not a cloud-synced copy of .git.

Choose your assigned role below. Commands use codex-2 on the Mac as an example; substitute codex-3 on Windows 3, claude-2 on Windows 2, and codex-1 or claude-1 on Windows 1.

```text
node scripts/team.mjs doctor codex-2
node scripts/team.mjs prepare codex-2
```

Prepare fetches GitHub and creates a separate worktree at ../agent-worktrees/codex-2 on branch agents/codex-2. It never overwrites an existing folder or branch. Open the printed folder in your agent/editor, then run npm ci there. Each role has its own complete source tree, Git index and node_modules. Do not use the same branch from two computers simultaneously. This computer already has all five folders under agent-worktrees; open those existing folders instead of preparing them again. The earlier hackuta26-codex-1 and hackuta26-claude-1 sibling folders are older onboarding copies; use agent-worktrees for the permanent role workspaces.

See [role folders and ownership](../team/roles/README.md). These tracked role folders hold assignments and handoffs. Actual application files stay in their existing build paths; isolated worktrees prevent agents from editing the same working copy. Worktrees prevent direct file interference, but overlapping changes can still conflict during integration, so the owned-path rules remain necessary.

## Separate account profiles

From the role's worktree:

```text
node scripts/team.mjs login codex-2
node scripts/team.mjs auth-status codex-2
node scripts/team.mjs prompt codex-2
```

Login stores provider state outside Git under ~/.hackuta26/profiles/ROLE. It signs in only; it does not dispatch feature work. The prompt command prints the role's onboarding instructions for you to paste into the agent. On Windows 1, existing verified profiles remain untouched; the portable login is a separate sign-in if you choose to migrate. Do not sign out an existing account to activate a different role.

For agent sessions to use that same portable profile, set the environment in that terminal before opening the agent. Windows example for Codex 3:

```powershell
$env:CODEX_HOME=Join-Path $HOME '.hackuta26/profiles/codex-3'
codex
```

Windows example for Claude 1 (separate terminal):

```powershell
$env:CLAUDE_CONFIG_DIR=Join-Path $HOME '.hackuta26/profiles/claude-1'
claude --model claude-opus-5-5
```

Windows example for Claude 2:

```powershell
$env:CLAUDE_CONFIG_DIR=Join-Path $HOME '.hackuta26/profiles/claude-2'
claude --model claude-opus-5-5
```

Mac example for Codex 2:

```bash
export CODEX_HOME="$HOME/.hackuta26/profiles/codex-2"
codex
```

Paste the generated onboarding prompt. Both Claude sessions must confirm their actual model using /status. Opus 5.5 is pinned by the launch command and durable team instructions; do not substitute another model if unavailable. [Official model configuration](https://support.claude.com/en/articles/11940350-claude-code-model-configuration).

The helper resolves standard Windows npm/native installs without a shell. For a custom installation, set H26_CODEX_CLI or H26_CLAUDE_CLI to the absolute executable or JavaScript entry point before running it. This is a path, never a token. Doctor checks tools and GitHub access; auth-status checks the isolated provider login separately. Neither proves that the model has answered a task.

## Prove each connection before resuming

Use the repository's onboarding issue as the shared attendance record. Each role posts its own concise check-in, with human help where required:

```text
Role: codex-2
Machine: Mac
Repository: Kx007-del/hackuta26 accessible
Checkout SHA: [git rev-parse HEAD]
Working tree: [git status --short; clean or describe changes]
Provider login: verified locally, no account details
Actual model: [reported by provider; Claude must say claude-opus-5-5]
Role acknowledgement: [one sentence]
State: onboarded, waiting for human resume
```

Use GitHub in the browser or write this report to an ignored .team-local/checkin.md and run:

```text
gh issue comment ISSUE_NUMBER --repo Kx007-del/hackuta26 --body-file .team-local/checkin.md
```

Codex 1 checks the five reports, asks one narrow backend/frontend interface question to verify their handoff, and records readiness. Do not mark the other computers connected from this computer's tests. Only the human can resume feature development. On resume, Codex 1 updates team/state.json and records the human instruction in the onboarding issue; every role must fetch/read the integration branch's current state before accepting a task. The pause file is guidance, not a security barrier or a remote process kill switch.

## Work through GitHub after explicit resume

1. Codex 1 opens one bounded issue per deliverable using the agent-task template: exact base SHA, approved roadmap, owned paths, dependencies, interfaces, acceptance criteria and checks. Claude 1 reviews the plan before dependent implementation. Keep shared contracts with Codex 1.
2. Each author starts a fresh task branch from the specified integration commit. Example: git fetch origin, then git switch -c work/codex-2/ISSUE-short-name BASE_SHA. No two roles edit the same task branch. Claude 2 gets a separate test branch from the implementation SHA under test.
3. Authors commit, and with push authorization publish their topic branch and open a draft PR against build/five-agent-h26. Use the PR template. Link the issue and handoff recipient. Avoid copying large source files into messages. Never force-push another role's branch.
4. Claude 2 tests the actual implementation SHA on Windows 2 and records commands/results, failure cases and regression-test commit. For gameplay changes, also report actual browser steps and observed result. A static read is not a browser test. To run the site locally: npm ci, npm run dev, then the local URL printed by the server. Codex 2 also checks backend behavior on the Mac when platform compatibility matters.
5. Claude 1 reviews the actual final diff at the tested head SHA and posts findings with file/line references. An author cannot approve their own work by posting as the reviewer. Role names are labels in GitHub, not five GitHub user identities; if everyone shares one GitHub login, comments document the roles but do not provide independent GitHub approval enforcement.
6. Owners fix findings; checks and review repeat when the head changes. Codex 1 integrates only the reviewed/tested commits after required human approvals. Main merges and deployment remain separate explicit human decisions. Do not enable automatic merging or deployment as part of onboarding.

Before starting, each agent fetches the integration branch and reads current pause state and issue comments. Each handoff includes role, issue, exact SHA, owned files, checks actually run, blockers and next owner. Each milestone must have all five substantive deliverables; avoid repeated coordinator acknowledgement turns. Keep provider usage within each account's limits; do not move work between identities to bypass a quota.

The old loopback bus remains local and paused. Do not expose port 17861 to the network or copy its credentials to other computers. For automatic dispatch, follow [AUTOMATION.md](AUTOMATION.md); each machine must start its assigned local worker once. Those listeners then receive subsequent bounded tasks without manual prompt copying. Feature work remains paused until explicit human resume.

## Initial verification and limits

The current reviewed build was tested before this pause: 49 tests passed and production build/typecheck passed; recorded browser evidence is in docs/team/H26-2-BROWSER-QA.md. Onboarding helper syntax, status/prompt and isolated worktree preparation are checked on the current Windows machine. Other computers, their sign-ins, macOS execution and their live model responses remain unverified until their own check-ins. No feature code changes are part of this setup.
