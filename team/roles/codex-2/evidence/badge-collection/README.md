# Badge collection — verified release

PR: https://github.com/Kx007-del/hackuta26/pull/42
Live collection: https://hackuta26.onrender.com/leaderboards/badges
Candidate: `da046eeb0bc78d2f674fc041a2ac513cd52037d0`
Merged/deployed: `61bae3b52364c389cf70c060ff8d35789dd31907`
Render deploy: `dep-dbst1dt6e07s73aq5brg`, live. `/api/health` matches the merged commit.

Five visible families with original vector insignia:

- First Run: red diamond / flag.
- Regular: blue hexagon / double chevrons.
- Streak: orange flame / lightning bolt.
- Top Ten: mint shield / 10.
- Champion: gold star / crown.

Dedicated, seven-day streak and reigning champion remain milestone tiers, preserving all eight existing server award IDs and dates. The UI shows five families, not eight separate categories. Backend, DB, XP rules and award calculations are unchanged.

Separate collection route under Leaderboards, with All / Collected / To unlock filters, locked/earned states, category count, earned dates and clear criteria. Collection is linked from Rankings, personal progress and account. Leaderboard strips use at most five larger colored symbols; the old inline eight-card collection is replaced with a compact preview. Existing FaZe styling/homepage/gameplay preserved.

Validation: **223 application tests, 9 relay tests, production build and candidate/merged GitHub checks pass**. Tests cover legacy mapping, timestamp retention, no invented awards, deduplicated strips and routing.

Local real game-data-only gameplay earned First Run + Top Ten: collection displayed 2/5, Collected filter displayed two cards. Saved local-earned-collection.jpg is that local test, not a production player's collection.
Hosted direct load/refresh showed five cards with the Leaderboards tab active. Collected 0 displayed the empty state, To unlock displayed five cards. Rankings link and browser Back restored the collection. Mobile 390px had five cards, visible navigation and document width 390px (no horizontal overflow). Saved screenshots reflect the actual hosted UI except the explicitly labeled local earned test.

No new dependencies, paid infrastructure, service-plan/storage changes or automated dispatch. Current Render storage remains temporary; this change does not make award persistence durable across redeployment/restart.
