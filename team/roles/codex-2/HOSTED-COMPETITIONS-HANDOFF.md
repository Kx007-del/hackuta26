# Hosted competition Phase 1 handoff

Human-authorized backend/contracts assignment from integration
`172ac54726cc31fe2f2731aac7f90d620ecda5e1`, branch `work/codex-2/hosted-competitions`.
The PR handoff comment records the exact immutable candidate SHA. No frontend/gameplay changes,
PR #31 import, integration merge, deployment or automation. Existing logs/work preserved.

Contract for Codex 3: [API and navigation](../../../docs/competitions/API.md), with types in
`shared/competitions.ts`. Implement the four separate Play, Leaderboards, Join Events and Host an Event
routes, authenticated ownership flows, reservation/validated-score wiring, demonstration labeling,
moderation and analytics. Preserve FaZe branding/gameplay/global progression. The human must give
Codex 3 its next prompt; this file/GitHub comments do not dispatch an agent.

Author validation: 15 new deterministic cases (HTTP/store, including two-process concurrency).
Full app suite 198/198, relay 9/9, zero skipped/todos, production TypeScript/Vite build passes.
The integration baseline had 183 app tests; the 15 added cases explain the difference.
Author tests are **not** independent Claude 2 approval.

Manual independent tasks, tied to the PR exact head:

- Claude 2 (assigned Windows 2 account): independently test ownership/CSRF, event isolation,
  UTC boundaries, rule freezing, retries/concurrency/limits, ties, moderation/finalization,
  fixtures, additive migration/restart and global regression. Add tests on your own branch;
  report exact tested head, results and blockers. Do not merge/deploy/start relay.
- Claude 1 (assigned Windows 1 account): review actual final backend/contracts diff and independent
  test findings. Review security/guest-auth limits, telemetry trust, frozen rules, persistence and
  billing/prize-demo claims. Report exact reviewed head and approve or actionable findings.
  No author edits, integration merge, deployment or automation.

Render remains on a divergent live revision containing PR #31 work. See contract reconciliation.
Storage is ephemeral; persistent records across Render deploy/restart are not promised. Hosting is
no-charge demonstration only; no fees, prize custody, payouts or real award announcement.

Codex 2 retains combined release ownership; frontend + independent approval are pending.
**Render update pending.**
