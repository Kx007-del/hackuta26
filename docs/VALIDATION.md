# Validation: Hackuta26 H26-1

Date: November 14, 2026. Runtime: Node v26.13.1. Reference baseline: 98ece8b; source reference 3f66407f09880c445239f1c95858d6c73f449a30. Checks below were executed by the desktop coordinator against the integrated code, not by the read-only provider turns.

## Automated results

- npm ci --ignore-scripts: exit 0; 153 packages installed; npm reported zero vulnerabilities at install time.
- npm test: exit 0; 27 passed, zero failed/skipped/cancelled.
- Original nine tests retained: six gameplay rule cases and three API/persistence cases.
- Claude 2 supplied eighteen new tests, applied with assertions unchanged: nine navigation/marker cases and nine HTTP/persistence cases.
- npm run build: exit 0, including TypeScript noEmit (also checks tests/) and Vite production bundle.
- New tests cover route parsing/round-trips, malformed/duplicate params, ID boundaries, parameter injection, canonical completed/waiting routes, isolated host markers, corrupt markers, storage exceptions, actual exported JSON error middleware, 400/413/500, headersSent delegation, path precedence, nested directories, relative/default/memory paths, and waiting/completed persistence after close/reopen.
- Generic500 regression intentionally emits one fixed 'Unhandled server request error.' log. This is expected test output.

## Actual production entry checks

Started npm start on port5175 with DATABASE_PATH pointing at a nested folder under the Windows temporary directory.

- Health200, SPA arena fallback200, malformed JSON400, payload over2MB413, health still200.
- Created a relay with a real browser-recorded attempt fixture:201.
- Stopped/restarted the production listener with the same custom DATABASE_PATH.
- Read the saved relay:200, same host name and waiting state. Nested database file exists.

## Browser checks executed through normal controls

- Original14m jump/fire succeeded; publication produced a relay URL.
- Host refresh restored invitation and progress controls.
- Home then Back restored that host workspace.
- A fresh tab without the host session marker opened as guest, with settings locked.
- Guest real jump/fire succeeded and completion opened the premiere URL.
- Premiere showed both credits; playback automatically advanced from host to selected guest segment.
- Host progress check opened the completed premiere.
- Remix then Back restored premiere; Forward/Back restored navigation.
- Proven14m changed to20m: sharing locked until another successful shot.
- Missing invitation showed recovery; Enter Arena worked.
- Stopped the dev server while SPA remained loaded, navigated to a saved relay, observed retryable failure; restarted and clicked Try Again. Saved premiere returned and old error cleared.
- Default SQLite relay survived that dev-server restart.

Screenshot: docs/team/browser-premiere.jpg. Browser viewport was narrow; this confirms the layout used in the walkthrough, not broad device parity.

## Review fixes applied

- Save the session host marker before discarding a stale publish response; keep UI/history generation guarded.
- Completion409 performs guarded reload and shows completed premiere.
- Route loading treats408/429 as retryable alongside network/5xx errors.
- Server error middleware returns JSON400 for malformed JSON and413 for oversized payloads.
- Configurable persistent SQLite location; default and explicit memory behavior retained.

## Verification limits and follow-up

Delayed-response races, disabled storage during a live browser publish, simultaneous browser guest completions, and browser-timed180/360 successes were not injected or executed. Spin feasibility is covered by gameplay rule tests; conflict behavior by API tests and source review. Pure navigation tests do not prove popstate wiring by themselves; browser navigation checks supplement them.

Explicit databasePath:'' is a low-priority developer-option edge case deferred by Codex1; normal app startup uses the trimmed environment setting or default. Identical Home/New navigation can create duplicate history entries. Session markers are UI recovery hints, not authentication; duplicated tabs may inherit them. This is not a production competition service.

No deployment, payment, main merge or push was performed as part of these checks.
