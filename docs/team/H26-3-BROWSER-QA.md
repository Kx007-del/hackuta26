# H26-3 candidate browser checks

Candidate source: 74f0707 (frontend/helper/UI plus Claude 2's 16 independent guide tests). Desktop Codex 1 used the actual in-app browser at http://127.0.0.1:5174. This is candidate evidence, not a claim that Render has deployed it.

- Opened the Rooftop jump guide, then switched to 180 and 360 presets. The 180 guide describes the facing-away start; 360 describes facing the target. The guide and HUD changed from 14m to 20m. Spin modes had no ALIGN assist in the guide or arena controls.
- Switched to Fortnite. Ramp guidance describes B placement outside the slot, walking onto the ramp and jumping from it before firing. Wall-edit guidance describes B/G, near-side jump and firing through the upper opening, without a ramp. The guide appears once outside the clipped canvas.
- Switched to Valorant precision and dash-peek. Tactical guidance has no Space/jump action; dash-peek exposes X and the grounded-cover/right-dash/stop/fire sequence. The HUD says Q/E turn. DOM inspection found exactly one guide and computed body font Source.
- Followed Keyboard Start, Dash, practice Align Aim and Fire in the tactical candidate. The real HUD showed Dash cleared, then Shot landed and PROVEN. READY TO PASS. Alignment was an explicitly labelled aim assist; no success/proof was injected. No relay was published and no existing player records were modified.
- Captured a narrow viewport showing the tactical scene, successful attempt and readable ordered guide: h26-3-tactical-guide.jpg. The long controls list pushes later panels down on narrow screens; the independent reviewer rated that an optional layout improvement.

Separate hosted baseline: https://hackuta26.onrender.com/ and /api/health returned 200. Actual browser navigation opened clip workbench and Courtyard. That baseline lacked commit metadata. Deployment account/settings remain unverified, and no Render deployment was triggered.

Limits: clip-attached guide wording is covered by independent helper tests rather than a new uploaded-clip browser run. Replay precedence/premiere absence has source review; new replay browser coverage and runtime health checks await the combined candidate. Original H26-2 gameplay/clip browser evidence remains in its own report. All 65 application tests and the production build passed locally at this candidate.
