# Permanent agent folders and ownership

Confirmed against the original human assignment in “Set up four-agent coding workflow”, chat 01a1d97c-5635-7271-94fe-19bd246f3473, role-assignment turn 01a1d99e-dcbf-7701-a79e-41cd1d21e54f. Codex 1 was assigned ideas, thinking, plans and roadmap; Codex 2 execution; Codex 3 UI/frontend; Claude 1 review/improvements/errors; Claude 2 tests/edge cases. Later instructions made Codex 1 coordinator with final say among agents, required balanced substantive effort, and pinned both Claude profiles to Opus 5.5. Human authority takes precedence.

| Role folder | Local full working copy, relative to the project folder | Git branch | Device |
| --- | --- | --- | --- |
| codex-1/ | agent-worktrees/codex-1/ | agents/codex-1 | Windows 1 |
| codex-2/ | agent-worktrees/codex-2/ | agents/codex-2 | Mac |
| codex-3/ | agent-worktrees/codex-3/ | agents/codex-3 | Windows 3 |
| claude-1/ | agent-worktrees/claude-1/ | agents/claude-1 | Windows 1 |
| claude-2/ | agent-worktrees/claude-2/ | agents/claude-2 | Windows 2 |

Each role writes its task notes/handoffs only in its own tracked role folder. Codex 1 may maintain this index. The application source is not duplicated into these tracked folders; each separate local worktree already contains the whole application on an independent branch. The GitHub role branches are starting points, not proof of live signed-in agent sessions.

Ownership:
- Codex 1: docs/, shared/, root configuration, coordination and integration. Route shared contracts/dependencies here.
- Codex 2: server/ and packages/social/, excluding all test files.
- Codex 3: src/, packages/challenges/ and packages/gameplay/, excluding all test files.
- Claude 1: independent plan and exact-head diff review; write findings in its own role folder or GitHub, never patch an author's branch.
- Claude 2: tests/ and all *.test.ts, plus its own role folder. Tests inside an implementation package belong to Claude 2, not that package's implementation owner.

Before editing, claim a bounded GitHub task with base SHA and owned paths. Start a work/ROLE/TASK branch in your own worktree. Never switch branches or run edits in another role's folder. Never reset, clean, force-push, stash or overwrite another role's work. If an owned-path change needs another owner, ask Codex 1 to record a temporary assignment first. Full worktree visibility is needed for reading and testing; these are coordination rules, not filesystem permission boundaries.

Record every handoff with task, role, base/head SHA, files, checks actually run, findings and next owner. Claude 2 tests the actual implementation commit; Claude 1 reviews the actual final diff. Codex 1 integrates after review/checks and required human approval. Git does not automatically merge role branches or wake agents; the optional running relay in docs/AUTOMATION.md dispatches tasks through GitHub under Codex 1's control.

Feature development remains paused. Only setup and connection checks may run until the human resumes. Follow team/state.json and docs/MULTI-COMPUTER.md. Keep credentials, local databases, uploads, dependencies and generated build output out of Git; package-lock.json and build commands reproduce the build.
