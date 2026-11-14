# Team instructions

This project uses the permanent five-role assignment in AGENTS.md. Earlier Gameplay/Challenges/Social handoffs under packages/ describe the inherited reference prototype, not this build's active staffing.

Codex 1: ideas, planning, contracts, roadmap, assignment and final decision.
Codex 2: non-UI implementation and server persistence.
Codex 3: UI, gameplay frontend and navigation.
Claude 1: independent plan/change reviewer.
Claude 2: independent tests and edge cases.

Each has an isolated local worktree on agents/<role> beside this checkout in ../agent-worktrees/. The desktop integration checkout uses build/five-agent-h26. Signed-in service profiles remain in their original private account directory. They do not reside in this repository or its worktrees. The existing dispatcher uses read-only turns and supplied source packets; desktop applies reviewed output in the integration checkout and records actual results.

Do not edit another role's paths or mutate shared Git state. Ask Codex 1 to change contracts. Keep new work coherent with docs/ROADMAP.md. No push, main merge or deployment without explicit human authorization.
