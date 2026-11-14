# Hackuta26 five-role team

Codex 1 coordinates ideas, architecture, roadmap, assignments, review disposition and final decisions. Human instructions take precedence.

- Codex 1: docs/, shared/, root configuration and integration.
- Codex 2: server/ and packages/social/ except tests; non-UI application and persistence.
- Codex 3: src/, packages/challenges/ and packages/gameplay/ except tests; all frontend.
- Claude 1: independent plan and actual diff review, no author edits.
- Claude 2: tests/ and all *.test.ts; independent edge cases and regressions.

Cycle: plan, review plan, propose implementation, coordinator application, independent tests, actual checks, review changes, owner revisions, integration. Keep owned paths separate. Shared interface and dependency changes go through Codex 1. Record handoffs in docs/team/.

Feature development is PAUSED at human request. Read team/state.json and docs/MULTI-COMPUTER.md. Only coordination, setup and connectivity checks are authorized during this pause. Do not restart the old dispatcher.

The original local message service dispatches read-only proposals, not edits or commands. Desktop applied reviewed proposals and executed checks; do not claim independent execution. For the new four-computer workflow use separate clones/worktrees, per-role GitHub tasks, topic branches and PR handoffs. GitHub is durable coordination, not an automatic cross-machine agent dispatcher. Keep account files, service credentials, logs and player data outside Git. Respect account limits.

User authorized the local build, repository creation, and now publishing the reviewed build and multi-computer setup to Kx007-del/hackuta26 so the five roles can work through GitHub. This authorizes the setup upload on build/five-agent-h26, not future unrestricted pushes. Main merges and deployment still require explicit approval. Keep old hackuta and faze-run-it-back repositories unchanged.

Read docs/ROADMAP.md and shared/contracts.ts. Current H26-2 scope: clip upload/preview/trim, original Rooftop/Buildyard/Courtyard environments, mode-specific jump/spin/build/edit/stationary/dash proof, harder remixes, two-person relay and sequential replays. Read docs/H26-2-PLAN.md. Only toolkit Source/Anton fonts and supplied FaZe logos; preserve provenance. No automatic video reconstruction or anti-cheat claims. Balance substantive work across all three Codex and two Claude profiles; both Claude profiles are pinned to claude-opus-5-5.
