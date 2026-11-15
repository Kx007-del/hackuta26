# Submission readiness — 2026-11-15

## Scope of this check

The audit started from the public integration release `8c9d50af7c70b9471d9bab3339399c7012c4a1e9`. This packet adds current documentation and corrects fictional organizer-demo misses to respect the same 50-point maximum as gameplay. It does not add paid services or resume agent automation. The PR for this packet records the final release commit and deployment result.

## Checks completed

| Check | Result and scope |
| --- | --- |
| Application tests | 232 passed; zero failures, skips or todos, including the new fictional-score regression. |
| Team-tool tests | 9 passed using test providers; no real agent workers started. |
| Production build | TypeScript check and Vite production build passed after the fixture correction. |
| Production dependency audit | `npm audit --omit=dev`: zero reported vulnerabilities at the audit time. This is a registry check, not a complete security audit. |
| Targeted independent source review | No blocking findings in account/session boundaries, scoring claims, persistence limits or final fixture/docs diff. No obvious credentials/private-key patterns in current tracked text; no full Git-history secret scan or penetration test claimed. |
| Public source | GitHub reports the repository public; an unauthenticated request returned HTTP 200. Default branch is `build/five-agent-h26`. |
| Public health | Both `https://hackuta26.onrender.com/api/health` and `https://faze-runitback.us/api/health` returned healthy and the audited release commit. |
| Public route availability | HTTP 200 for home, practice, results, leaderboards, events, host, host demo, login and signup. This checks routing, not every interactive case. |
| Public progression API | Profile and score/XP/streak leaderboard GETs returned HTTP 200. |
| Reference asset | Hosted MP4 returned HTTP 200, 4,181,740 bytes, SHA-256 `e7c636dd29c4b048fb25e61d8a140202a1534e49d199eaa72e1129f5b8d3a04f`, matching the supplied reference manifest. |
| Brand provenance | Existing automated tests verify served logo/font/pattern assets are byte-identical to their supplied toolkit sources. |
| Local gameplay browser run | Rendered the arena, aimed with arrow keys when pointer lock was unavailable, fired one shot, and exited to `/results` in the same tab. A 35/100 missed attempt showed game-data scoring, +10 XP, one-day streak and First Run/Top Ten unlocks. No production player record was created for this test. |
| Local progression browser run | The same real local attempt appeared in fictional showcase comparison and real Live standings; Total XP showed 10. These were separate views, not merged datasets. |
| Local organizer browser run | Opened public host demo, verified corrected sample rankings, approved a flagged fictional entry with a reason, and saw eligible/pending analytics update. Demo actions remained simulation-only. |
| Hosted AI/fallback browser run | Opted into a game-canvas recording on the custom domain, fired an intentionally stationary attempt, and reached a same-tab 22/100 game-data-only result. The UI disclosed AI unavailable and correctly rejected the stationary attempt for XP. Render logs showed configured `gemini-2.5-flash` returned HTTP 429 `RESOURCE_EXHAUSTED`, then HTTP 503 `UNAVAILABLE`; no successful live AI judgement was observed. No further paid resources or model/config changes were made. |
| Earlier typography release check | Live browser verified custom FaZe display fonts, reference video and no horizontal home-page overflow at desktop size; local checks also covered 390px mobile layouts. |
| Documentation | Current README replaces the obsolete multi-game pitch. Account support, miss penalty, deterministic event scoring and demo boundaries are now described accurately. |

## Capabilities and limits judges should understand

- One fixed supplied reference clip and one handcrafted Fortnite-inspired world; no arbitrary upload-to-world conversion or original Fortnite runtime.
- AI comparison is optional. The live check encountered provider quota/availability errors (429 then 503), and fallback worked. Rehearse with Game data only unless a later opt-in attempt produces a successful AI result. Do not label a game-data-only result an AI success or imply the provider issue is fixed.
- Current Render data storage is temporary. Accounts, progression and real events may reset on redeploy/restart. The host simulation remains available because its fixtures are code-based; its local changes reset on refresh.
- Example sponsor/event/player figures are fictional. No real prizes, payments, customers, sponsor partnership or revenue are established by those examples.
- Account recovery, email/OAuth login, durable tournament storage, verified identity and tournament anti-cheat are future work.
- Desktop keyboard/mouse gameplay is the supported demo path. Mobile page layout checks do not establish touch gameplay support or a performance guarantee on every device.

## Final submission items the team must supply

- [ ] Confirm the exact hackathon and prize track, deadline, video-length limit, required disclosures and submission fields against the actual organizer's rules. Those details were not provided, so contest eligibility is not certified here.
- [ ] Fill in team name and actual member names/profile links.
- [ ] Record the demo using `DEMO-SCRIPT.md`, upload it to an allowed destination, and check the URL in a signed-out browser. A finished demo-video URL has not been supplied.
- [ ] Add live demo/source/video URLs, screenshots and the prepared write-up to the submission form. The supplied 3.104-second reference clip is not a substitute for a full project demo video.
- [ ] Confirm reference-footage/brand-source attribution and any organizer requirements for supplied third-party materials. Toolkit byte provenance does not itself establish a broader license or endorsement.
- [ ] Rehearse on the presentation computer with the hosted instance awake; keep the local production build as backup.
- [ ] Inspect the final preview and submit the hackathon entry yourself. No final Devpost submission was made by this audit.

The technical showcase has passed the checks above. The unchecked items are submission metadata, a recorded demo, organizer-specific requirements and the final submission action; they must not be represented as already complete.
