# Hosted competitions — verified release

- Release PR: https://github.com/Kx007-del/hackuta26/pull/33
- Candidate: `6c653964734495cb138fb456e6920e385a7b1826`
- **Merged and deployed SHA: `bbd7e634aff6e00128dc2ceaf6484e24c2d2fbcc`**
- Render service: `srv-dbsf9ujl550s738a7seg`; deploy `dep-dbspv9uk1f9s739vbdvg`, status **live** (2026-11-15 12:04:47 UTC).
- Verified `/api/health`: `{ "ok": true, "service": "run-it-back", "commit": "bbd7e634aff6e00128dc2ceaf6484e24c2d2fbcc" }`.
- Live: https://hackuta26.onrender.com/
- Merged-head CI: https://github.com/Kx007-del/hackuta26/actions/runs/43711918885 — success.

## Scope and review

The human explicitly requested Codex 2 self-review/testing/deployment, then preservation of the current UI design. No independent Claude approval is claimed. PR #32's backend is included once by PR #33; both PRs are marked merged. No automated dispatch was started.

Preserved the live reference/practice/results styling, supplied FaZe assets and fixed recording; added four labeled separate routes using the existing visual language. Retained global progress mechanics, actual global standings and clearly labeled fictional examples. PR #31 remains excluded: character.ts and hillsideScene.ts are identical to integration base `172ac54726cc31fe2f2731aac7f90d620ecda5e1`. Live-only histories remain on their original branch; no other worktree was modified or overwritten.

## Checks

- Application **201/201**, relay **9/9**, zero skipped or todos, production TypeScript/Vite build passes.
- Both candidate GitHub checks and the actual merged-commit check passed; merged tree equals tested candidate.
- Existing service remains **free**, auto-deploy **off**, same integration branch, build/start commands and storage settings. No new/paid infrastructure or deployment by another agent.

## Hosted browser and API verification

- Play `/`, Leaderboards `/leaderboards`, Join Events `/events`, Host an Event `/host`: direct loading and refresh work. Active tabs correct, features separated into views.
- Browser Back/Forward between organizer/public views restores correct route. Refreshed public page retains membership, used-attempt count and saved result.
- Mobile 390px: all four tabs visible, route content usable, no horizontal overflow (document width 390px). Original default narrow viewport was also checked during development.
- Fixed video loads (`readyState:4`, duration 3.103633 seconds, no media error) and plays (`paused:false`, currentTime advanced).
- Created **Release verification — demonstration only**, published it and observed disabled/frozen rule fields.
- Public code `22C76CAC631D`, event `a32db2cc-ba72-4ca1-be4d-506308450562`.
- Joined through UI; reserved before play; actual WASD movement + keyboard look + F shot produced **46/100, eligible, clear**, one reserved/completed attempt, one isolated leaderboard entry.
- Event result awarded **0 global XP**. Global profile UI remained 0 XP, 0 global eligible attempts, no ranked global score; real global standings remained separate.
- Event Reset removed that run without another reservation. Ordinary practice movement/keyboard look/R reset returned to the spawn view with the existing cone/character/rifle.
- Anonymous organizer access **401**; another guest's management/close **403**; anonymous public page **200**. Browser opening another organizer's draft showed denial and no edit controls.
- Closed event: new join **409**, new reservation **409**; public page remains readable and Start is disabled.
- Organizer approved the observed QA result with an audit reason; finalized after review acknowledgment. Final snapshot contains one 46-point entry.
- Analytics: participants 1, reservations 1, completed 1, eligible 1, pending/excluded 0, completion rate 100%. Audit shows created, publish, close, approve/reason and finalize.

The finalized QA event is explicitly a technical demonstration, not a real tournament, sponsor partnership, prize announcement or organic player activity. The additional authorization-test event remains a private, clearly labeled QA draft; no example fixtures entered real tables.

## Limitations

- Mouse capture is unavailable in this in-app browser. Keyboard look/movement/firing/reset verified. Escape release **not verified** because pointer lock could not be acquired.
- Current Render filesystem is ephemeral: events, guest ownership, audit and player progress can be lost on restart, spin-down or redeployment. Additive SQLite migrations preserve a surviving file; **durable hosted storage is not promised**.
- Guest cookie ownership has no verified identity/cross-device recovery. Validated client telemetry is not a server-authoritative anti-cheat simulation.
- Hosting and all prize descriptions are **demonstration/no charge**; no payments, player fees, prize money, payouts or real awards. Only curated Fortnite hillside is playable; uploads do not generate environments.

## Screenshots

- [Play — preserved design with navigation](play-desktop.jpg)
- [Mobile Play](play-mobile.jpg)
- [Global real standings / zero event XP](leaderboards-desktop.jpg)
- [Join Events](join-events-desktop.jpg)
- [Host draft form](host-draft-form.jpg)
- [Published rules frozen](host-published.jpg)
- [Real event gameplay result](event-game-result.jpg)
- [Organizer analytics](host-analytics.jpg)
- [Finalization and audit](host-finalized-audit.jpg)
- [Finalized public standings](event-finalized.jpg)
- [Organizer access rejected](organizer-access-denied.jpg)
- [Mobile Host](host-mobile.jpg)
- [Ordinary practice reset](practice-reset.jpg)
