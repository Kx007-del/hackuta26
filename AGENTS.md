# Hackuta26 five-role team

Codex 1 coordinates ideas, architecture, roadmap, assignments, review disposition and final decisions. Human instructions take precedence.

- Codex 1: docs/, shared/, root configuration and integration.
- Codex 2: server/ and packages/social/ except tests; non-UI application and persistence.
- Codex 3: src/, packages/challenges/ and packages/gameplay/ except tests; all frontend.
- Claude 1: independent plan and actual diff review, no author edits.
- Claude 2: tests/ and all *.test.ts; independent edge cases and regressions.

Cycle: plan, review plan, propose implementation, coordinator application, independent tests, actual checks, review changes, owner revisions, integration. Keep owned paths separate. Shared interface and dependency changes go through Codex 1. Record handoffs in docs/team/.

Use the existing five signed-in profiles and local message service. It dispatches read-only proposals, not edits or commands. Desktop applies reviewed proposals and executes checks. Do not claim independent agent execution. Keep account files, service credentials, logs and player data outside Git. Respect account limits.

User authorized this local build and creation of Kx007-del/hackuta26. Pushes, main merges and deployment still require explicit approval. Use an integration branch. Keep old hackuta and faze-run-it-back repositories unchanged.

Read docs/ROADMAP.md and shared/contracts.ts. MVP: original rooftop, jump/180/360, prove-remix gate, two-person relay, persistence and sequential replays. No arbitrary reconstruction, video export or anti-cheat claims.
