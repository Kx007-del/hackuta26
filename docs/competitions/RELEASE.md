# Hosted competition combined release — Codex 2 self-review

The human requested that Codex 2 review/test and deploy this work itself, then clarified that
features must blend into the current UI instead of replacing its design. This supersedes the
previous requirement to wait for independent Claude approval and a separate Codex 3 UI assignment.
No independent approval is claimed. The backend contract remains in [API.md](API.md).

## Combined scope and reconciliation

This release includes PR #32's backend exactly once and adds the four routed views, organizer/public
flows and reserved real-gameplay submission. The live reference/practice/results presentation,
brand/header typography, buttons and source video are preserved using the non-character files from
live `a9233ab8c449519a8914ce511e4d23d1c0692f21`, reviewed here before selection. The existing
community implementation retains both correctly labeled fictional examples and actual global boards.
Navigation moves those boards to Leaderboards rather than putting all features on the homepage.

No live branch was merged wholesale. PR #31's character/model edits are excluded: character.ts and
scene geometry remain byte-identical to integration `172ac54726cc31fe2f2731aac7f90d620ecda5e1`.
Only the preview's submission/lifecycle UI is extended; movement, camera, collision, geometry and
weapon controls retain their integration implementation. All original branches/history are preserved.

## Self-review and fixes

- Browser-cookie ownership is resolved on the server. Cross-event/client score injection, public
  codes as credentials, cross-origin writes, stale versions and moderation after finalization fail.
- Validated scene scoring is reused; event mode sends no recording/AI request and awards no global XP.
- A ticket is reserved by an explicit action, never route mount. Retries reuse IDs and exact telemetry.
  Reset in event mode leaves the reservation consumed, unmounts its run and requires a new explicit start.
  Unfinished reservations block another start until their five-minute expiry; abandoned slots are not refunded.
- Keep mounted game/receipts during refresh, avoiding accidental game remount when leaderboards update.
- Event 401/403/409 errors show their actual cause, rather than the global scoring busy-retry message.
- A clock update enables/disables the event start UI around UTC boundaries; server remains authoritative.
- Found and fixed legacy mobile CSS hiding all nav anchors. Four tabs now remain visible on mobile.
- Event styling excludes the game Reset/Fullscreen controls so those retain their existing appearance.
- Direct URLs, browser history, active tabs, unknown pages and escaped event text have explicit handling.
- Existing UI assertions updated for separate routes instead of insisting on the former long homepage.
  Added rendered route-separation checks and client telemetry/header/no-AI regression coverage.

## Evidence and limitations

Author checks: 201 application tests, 9 relay tests, no skipped/todos; production TypeScript/Vite build.
The increase is 183 integration tests + 15 backend + 1 rendered route + 2 client tests.
Local browser verified create → publish/frozen form → public rules → join → reservation → WASD/keyboard
look/fire → actual server score 45 → isolated leaderboard; Back/Forward and refresh preserve membership/result.
No invented score or fake successful gameplay result is used for browser acceptance.

Hosting/prizes remain demonstration/no charge. Guest auth is not verified identity and has no recovery;
telemetry validation is not server-authoritative anti-cheat. Examples are read-only separate fixtures.
The current Render free filesystem is ephemeral: database/global progress/event ownership may be lost
on deployment/restart/spin-down. Additive migration preserves the data of a surviving SQLite file, not
infrastructure durability. No paid infrastructure, plan/storage setting changes or automated dispatch.

Release PR comments will record the exact candidate/merged/deployed SHA, GitHub checks and hosted
verification/screenshots. **Render update pending** until live deploy, exact health SHA and four-route /
event lifecycle checks succeed. Mouse capture/Escape must be reported separately if unavailable.
