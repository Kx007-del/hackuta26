# H26-2 validation

Executed on November14,2026 with Nodev26.13.1. This supersedes the single-arena H26-1 validation. Provider turns supplied proposals and independent reviews; desktop applied changes and ran commands.

## Actual automated results

- npm test:49/49 pass, zero failures/skips/cancellations.
- npm run build: exit0, including TypeScript noEmit and Vite production build.
- Existing27tests retained. Claude2 supplied15clip/mechanics tests and5server normalization/linkage tests. Desktop added2brand provenance/font-declaration regressions.
- Test harness-only adaptations: actual shared/server import paths, correct POST route/body names, distinct guest attempt ID, express.json middleware, database disposal, Buffer-to-ArrayBuffer fetch typing. Assertions were preserved.
- Initial independent seeking test caught reversed Range responding416 instead of the agreed malformed-range full200; production range normalization was fixed. Seeking tests now cover full200, bounded/open/suffix206 and unsatisfiable416.
- Upload tests include modern MP4/WebM/MOV headers, invalid type/signature/encoding/query, empty/invalid trim, exactly50MiB and oversize, chunked upload, interrupted upload cleanup, persistence/reopen and seek responses. Synthetic headers test the API contract, not video decoding.
- Mechanics tests cover cross-mode invalid presets, build/edit/airborne requirements, grounded tactical precision, dash requirement, speed threshold.35, bounded proof fields, canonical config/replay fields, same-arena clip lookup and guest config mismatch.
- Byte hashes of all6served brand assets match supplied toolkit originals. CSS shorthand, font-family and inline SVG family scan rejects external/system font declarations. Browser computed-font audit independently confirmed Source/Anton only.

## Actual browser results

Independent browser helper used Chrome DOM controls without injected successful attempts. Passed COD grounded rejection and airborne success; Valorant stationary precision and real cover dash/settle success, missing-dash rejection; Fortnite missing-build rejection and actual build/edit/jump/through-opening success; 14→20m proof reset; distinct scenes; selected-mode refresh. Found monospace shorthand defect, then verified its fix. Three updated screenshots and full report: docs/team/H26-2-BROWSER-QA.md.

Root in-app browser separately verified malformed video rejection; actual playable4second generated MP4; trim0.5–2.5seconds saved and played; clip-linked tactical host proof, publish, refresh and independent guest proof/completion into premiere; attached clip retained; remix proof reset; Buildyard ramp placement, held forward movement900ms, jump/align/fire success. Same-tab saved reference draft survived refresh and actual server restart. Practice alignment was used; it does not supply required gameplay actions.

After the latest server restart, actual HTTP checks returned200 for the historical H26-1 explicit-rooftop relay and completed clip-linked tactical relay,200 for its saved clip metadata and206 bytes0–31/380356 for video media. This checks real bootstrap clipLookup wiring and persistent storage beyond synthetic lookup fixtures.

## Known limits

These are original lite practice environments, not copies of production game maps/engines/graphics. Recreation is player-guided; no automatic video interpretation, reconstruction or AI inference exists. Uploaded fixtures were generated test patterns; no real COD/Fortnite/Valorant sample footage was supplied for QA.

Browser180/360 timing, every preset/distance combination, mobile touch parity, advanced delayed-request races, simultaneous guest-browser completion, full512MiB quota exhaustion,60second timeout transport and injected filesystem failures remain untested. Rule/API tests supplement observed browser defaults. Client-reported gameplay is consistency-checked, not anti-cheat. Body parser buffering is bounded to two50MiB uploads in one server process. File fsync and atomic metadata publication are implemented; Windows directory/power-loss durability is unverified. Orphan media is retained and counted for explicit recovery; no deletion/eviction UI.

No push, merge, purchase or deployment was performed. Local preview remains http://127.0.0.1:5174.
