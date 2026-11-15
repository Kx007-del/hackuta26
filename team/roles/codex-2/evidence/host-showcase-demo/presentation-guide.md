# Host an Event — hackathon demonstration

Open: https://hackuta26.onrender.com/host/demo
Or use **Host an Event → Explore host demo** on the live site. No account or login is required.

You appear as **You · Demo Host**. All data and actions are explicitly fictional; this page does not change real events, account ownership or player progress. No payments or real prizes.

## Suggested presentation flow

1. **Overview:** show your published showcase event and draft in the sidebar, 24 fictional participants, 35 eligible attempts, 75% completion and two pending reviews.
2. **Create & edit:** select the draft or click Create demo event. Edit its title/attempt limit and publish it. Published fields become locked.
3. Return to the showcase event. **Leaderboard & review:** approve Jordan and exclude Casey, entering a short reason for each. Rankings and review counts update locally.
4. **Analytics:** show the completion funnel and clear metric definitions. Counts derive from the fictional results, not live users.
5. **Overview:** close demo entries. After resolving pending reviews, acknowledge review and finalize demo standings.
6. **Audit log:** show publication, review reasons, closure and finalization with simulated UTC timestamps.
7. **Reset demo:** restore all starting data for another judge. Refresh also resets the simulation.

The showcase is deterministic code-based data, so it remains available after deployment/restart. Your changes during a demonstration intentionally do not persist. Real event creation/management continues to require server-verified ownership through the normal host flow.

Release PR: https://github.com/Kx007-del/hackuta26/pull/45
Merged commit: 6c9ade460a7a7b5842c39665d566d82491dcb8d7
Validation: 231 application tests, 9 relay tests, production build. Interactive local validation left real competition and attempt tables at zero.
