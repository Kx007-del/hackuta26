# Codex 1 controls the distributed team

The private GitHub branch automation/queue carries a durable task queue and per-role results/heartbeats. Codex 1 assigns tasks and decides next steps. The four workers automatically poll, invoke their assigned CLI, return results, and wait for the next assignment. No public server, copied provider tokens, API billing account or incoming network port is required. GitHub CLI authenticates each computer to the private repository.

This desktop chat can inspect and control the queue. A separate signed-in Codex 1 CLI process supplies background planning when the desktop chat is idle; its context is the committed repository plus the shared goal/results, not this chat's entire private history. It is the saved Codex 1 profile, not another account or an extra subscription. The desktop coordinator handles integration and any blockers that need human/browser tools. It does not silently merge or deploy.

The human's earlier feature pause remains in force. Installing or starting listeners does not resume feature development. The old localhost dispatcher stays paused; do not run both dispatchers for the same roles.

Copy-paste onboarding prompts for the other computers are in [DEVICE-PROMPTS.md](DEVICE-PROMPTS.md). Current-machine verification is recorded in [RELAY-SETUP.md](team/RELAY-SETUP.md).

## Machines and startup

| Computer | Process | Account |
| --- | --- | --- |
| Windows 1 | coordinate | Codex 1 |
| Windows 1, separate worktree/terminal | worker claude-1 | Claude 1, Opus 5.5 |
| Mac | worker codex-2 | Codex 2 |
| Windows 3 | worker codex-3 | Codex 3 |
| Windows 2 | worker claude-2 | Claude 2, Opus 5.5 |

First follow docs/MULTI-COMPUTER.md to install Git/Node/GitHub CLI/provider CLIs, authenticate each assigned account, clone, and prepare the role worktree. Only run worker commands from agent-worktrees/ROLE. Keep each computer awake, online, and its worker running. No boot/login service is installed. Closing the process stops receipt of new work; a heartbeat older than two minutes is offline. A connected heartbeat proves the relay, not a successful model response.

To update an idle, clean role worktree to the current runner before first startup:

```text
git fetch origin
git merge --ff-only origin/build/five-agent-h26
```

Do not run this over uncommitted task changes or a diverged task branch. Ask Codex 1 for the next base instead. Run npm ci once in each role worktree so app tests/builds have dependencies. The relay itself uses only Node built-ins and installed Git/GitHub/provider CLIs.

Codex 1, on this computer, from the integration checkout:

```text
node scripts/relay.mjs coordinate
```

Claude 1, from agent-worktrees/claude-1:

```text
node scripts/relay.mjs worker claude-1
```

Mac, from agent-worktrees/codex-2:

```text
node scripts/relay.mjs worker codex-2
```

Windows 3, from agent-worktrees/codex-3:

```text
node scripts/relay.mjs worker codex-3
```

Windows 2, from agent-worktrees/claude-2:

```text
node scripts/relay.mjs worker claude-2
```

Profiles default to ~/.hackuta26/profiles/ROLE, matching the portable login helper. To use an existing verified local profile, set H26_PROFILE_DIR in that process's terminal to its private absolute folder; do not copy or commit the folder. Set H26_CODEX_CLI/H26_CLAUDE_CLI only if the executable is outside the standard installation. The current Windows machine also needs its configured GitHub CLI on PATH and its existing GH_CONFIG_DIR in the process environment. New computers can use their normal gh auth login configuration. Provider API override variables are removed by the runner so tasks stay on the assigned signed-in profile. Both Claude invocations pin and verify actual claude-opus-5-5 model usage; a mismatch fails the turn with no fallback.

## Controls from this Codex

Initialization is performed once from this checkout after publishing the runner:

```text
node scripts/relay.mjs init
node scripts/relay.mjs status
```

The queue starts PAUSED. For a setup-only live check, write an ignored .team-local/onboard.json:

```json
{
  "role": "claude-1",
  "kind": "onboard",
  "baseSha": "EXACT_40_CHARACTER_SETUP_COMMIT_SHA",
  "instruction": "Confirm your permanent review role, model, checkout and readiness. Do not edit files or perform feature work.",
  "dependsOn": []
}
```

Then assign it. A running worker picks it up automatically:

```text
node scripts/relay.mjs assign --file .team-local/onboard.json
```

Once all five account connections are verified and the human explicitly resumes feature work, Codex 1 saves the concrete approved goal in an ignored .team-local/goal.md and records that instruction:

```text
node scripts/relay.mjs start --goal .team-local/goal.md --approval "Exact human instruction resuming the approved goal"
```

Do not issue start just because setup was authorized. Its approval argument is an audit record of a real human instruction, not permission to invent one. The shared remote control then supersedes the historical paused text for that bounded goal. It starts the planning cycle only while the coordinator listener is running.

Codex 1 automatically plans, sends Claude 1 a plan-review task, assigns implementation to Codex 2/3, asks Claude 2 for independent tests, routes exact-diff review and revisions, and reports completion or a blocker. Different roles can run in parallel, one turn per role. Base SHAs and dependencies keep tests/reviews tied to actual commits; tasks/results persist through computer restarts. Branches are fetched before planning so the coordinator can read published changes. The coordinator decides the workflow; the runner does not itself certify quality or merge worker branches. Integration/shared-contract changes and browser actions unavailable to a worker are explicit desktop-coordinator handoffs. Main merges and deployment still need separate human authorization.

Controls:

```text
node scripts/relay.mjs status
node scripts/relay.mjs pause
node scripts/relay.mjs stop
node scripts/relay.mjs resume --approval "Explicit human instruction resuming this paused goal"
```

Pause stops feature work and keeps setup-only onboarding possible. Stop prevents all new tasks, including onboarding. Running providers check control every 30 seconds and are terminated on a disallowed state or failed control check. State/lease is checked again before commit and push; an already-in-flight GitHub request or push may finish. Stop is not instantaneous; a disconnected/unresponsive computer cannot be remotely guaranteed stopped. If urgent, stop its local worker/provider process too. Ctrl+C requests local shutdown; an active provider is cancelled at the next control check. Resume requires explicit human instruction, preserves the turn limit, and only resumes a previously started paused cycle without failed tasks. Cancellation during active work records a failed turn for inspection rather than silently replaying partial edits.

## Editing, publication and authority

Each implementation/test task starts a unique work/ROLE/TASK_ID branch in that role's own worktree at an exact base SHA. Codex uses workspace-write for implementation; read-only for review/onboarding/coordinator turns. Claude uses restricted mode and limited tools, with source edits enabled only for its test role. Shell-dependent tests may report a permission blocker; the runner never uses bypass-permission flags. Do not loosen permissions automatically to make a task pass.

The worker requires a clean tree before starting. It checks both sides of renames, staged/unstaged/untracked changes, branch and HEAD after the turn. It rejects role ownership violations, onboarding edits and agent-created commits. On passing checks, it commits owned changes and publishes only that task branch; this narrow publication is part of the human-requested collaboration automation. It posts a bounded handoff with exact head SHA. Read-only reviews return their findings through the queue. Publication is not approval: Codex 1 still checks the actual diff/test evidence and integrates separately.

Ownership checks are after-the-fact coordination checks, not a security sandbox or rollback. A failed turn can leave local changes; preserve and inspect them. Provider sandboxes/permissions remain in place, but no claim is made that this is safe execution of hostile code. Treat only trusted repository writers as coordinators: the queue uses GitHub repository permissions, and people sharing one GitHub identity are not cryptographically separated into roles. Lease/CAS checks prevent accidental duplicate workers; they cannot stop an authorized writer deliberately altering the queue.

Do not put tokens, personal login details, uploads or sensitive logs in tasks. Provider logs remain ignored under .team-local/relay. Published text has common token-pattern redaction, which cannot detect every possible secret. The private queue contains project prompts/results and machine names, so only give repository access to intended collaborators.

## Limits and recovery

Each provider turn has an eight-minute timeout and bounded output; Claude has a 20-turn bound. The coordinator has a 30-planning-turn cycle limit, at most four assignments per turn and 100 tasks per cycle. No quota retries, identity rotation, model fallback or repeated empty acknowledgement turns. Any worker failure blocks the shared cycle, preserves local work and records the error. A coordinator failure/limit blocks the cycle too. Workers remain listeners until stopped, but blocked tasks do not retry themselves.

Idle heartbeat writes are throttled to once per minute, with immediate status changes and lease validation on every check. Unchanged queue writes are skipped. Failed provider handoffs are preserved in redacted bounded form alongside the error. Updated workers stay online after a failed turn while the queue is blocked; human-authorized recovery is still required, and the failed task is never replayed automatically. Workers launched from older code need a local restart to load these updates.

For an interrupted process, first stop it locally and inspect the role's worktree/logs. A local .team-local/ROLE.lock prevents a second process in the same folder; remove that single lock only after verifying the old worker/provider is gone. The remote lease expires after two minutes. For a stale remote running turn, human-directed recovery is explicit:

```text
node scripts/relay.mjs recover ROLE --approval "Human instruction authorizing recovery after inspection"
```

Recovery preserves failed history and never replays the task. After inspection and explicit human authorization, the desktop coordinator may archive the previous control/results and prepare a new paused cycle with node scripts/relay.mjs new-cycle --approval "Human authorization for a new reviewed cycle". Running/interrupted tasks must be resolved first. The archive stays on the private queue branch. Interrupted initialization can be rerun without resetting existing control/results. An interrupted archive stays in archiving (no tasks run); rerun the explicitly authorized new-cycle command to continue preserving the existing history files. Start still requires explicit human resume for the new goal. Do not erase queue files to bypass a limit. Starting/stopping listeners can be done independently of authorizing a new project cycle.

Run verification with npm run team:test. It exercises pause/dependency/role/ownership/completion guards and real local child-process cancellation/model mismatch using a mock provider (no subscriptions used by those tests). Real GitHub transport and each real account response are separate checks recorded in the setup report. Windows 2, Windows 3 and the Mac remain unverified until their workers actually connect and answer a setup-only task. This computer cannot install or start their processes remotely without access to those devices.
