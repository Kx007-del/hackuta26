# Concrete corrected-cycle proposal

The first H26-3 run is blocked. Preserve it and its failed/cancelled results in queue history; do not replay the old tasks.

The Mac's native Codex 2 diagnosis confirms a coordinator prompt-scoping error, not a demonstrated permission or quota failure. The shared human goal wrongly contained “For this first planning turn do not invoke tools”, and the implementation worker obeyed it. The worktree stayed clean at a2d7080. Claude 2's task was cancelled when that failure blocked the queue. Codex 3 separately has a real host-policy restriction and remains in proposal-only mode.

Prepared corrections on work/codex-1/h26-3-plan:

- Separate productGoal from coordinator-only operating notes; workers receive the product requirements. A regression test covers the leaked-instruction case.
- Preserve bounded/redacted blocker handoffs in the queue. Updated workers stay listening after failure, with no automatic task replay.
- Reduce idle GitHub heartbeat writes to one per minute while retaining lease checks and immediate status changes.
- Add pinned-action Linux CI for application tests, relay tests and production build. Its first run found Windows-only separators in the brand manifest; portable paths fix that without changing any brand bytes or weakening the test.
- Configure the repository homepage to the supplied Render URL, keep automatic merge disabled and agent branches preserved, and protect build/five-agent-h26 with passing Build and tests, required PRs, no force-push and no deletion. No required peer GitHub approval count is imposed because all five roles currently share one GitHub identity; independent review evidence remains required by team policy.

After explicit human approval to recover:

1. Archive the failed cycle and start a new bounded H26-3 cycle with only product requirements in the worker goal.
2. Claude 1 reviews the corrected frozen plan. Codex 2 implements the runtime/health work on the Mac. Claude 2 independently designs and then executes tests against published source SHAs. Codex 3 authors frontend proposals from supplied source packets without local tools; desktop Codex 1 applies those in its authorized workspace and records authorship versus execution. No policy bypass, account rotation or invented worker edits.
3. Restart the Mac worker after its clean-state check. Windows 2 should verify its worker/restart wrapper is running. Running workers use their currently loaded runner until restarted; fetch and fast-forward the coordinator branch only in clean worktrees, preserving partial work if any.
4. Review actual combined changes, run checks and actual candidate browser QA, then prepare an integration PR. Main/integration merge and deployment remain separate human approvals.

Render note: https://hackuta26.onrender.com/ is reachable and usable for shared browser QA. The connected Render account is not the hosting account; deployment branch, auto-deploy and persistent storage remain unverified. Those settings cannot be changed through GitHub repository settings. No Render configuration change or deployment was performed.
