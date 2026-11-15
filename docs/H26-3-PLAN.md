# H26-3 — hosted testing and game-specific practice guidance

The human resumed project work and requested continuous coordination of the five assigned accounts. The shared browser test target is https://hackuta26.onrender.com/. GitHub remains the source of truth. No main/integration merge or hosting change is implied by a worker task.

Baseline: H26-2 is implemented with 49 passing tests and a production build. On the hosted site the homepage and /api/health return 200; actual browser navigation opens the clip workbench and tactical arena. The public health response currently has only ok/service, so the exact deployed commit cannot be identified from it. The served main bundle filenames match the last locally verified build; this is not proof of an exact Git SHA. The connected Render account is different from the hosting account, so deploy branch/automatic deploy/persistent storage settings remain unverified.

## Bounded outcome

Make the existing three-game clip-to-practice flow easier to understand and the hosted build easier to identify/test. Preserve clip upload/trim, exact arena/config linkage, replay/relay proof rules, and toolkit-only fonts/logos. These remain original browser practice arenas, not official game engines or copied maps. No new video-AI claims, external game assets, accounts, paid services or storage migrations.

## Five-role deliverables

1. Codex 1: plan, frozen interfaces, task allocation, exact-SHA integration, hosted baseline/browser evidence and final disposition. Maintain substantive balance, not message counts.
2. Claude 1: first independently review this plan and actual relevant files. After changes, review exact tested diffs, misleading claims, brand provenance and error cases. Review-only, Opus 5.5.
3. Codex 2 (Mac): implement server/runtime-config.ts exporting resolveRuntimeConfig(env: Record<string, string | undefined>) returning {host: string, port: number, commit: string | null}. Preserve local host 127.0.0.1 and default port 5173. Use 0.0.0.0 by default only when RENDER === 'true'; explicit nonblank HOST wins. PORT must be an integer from 0 through 65535 (0 supports ephemeral local tests); blank/unset uses 5173, invalid values fail clearly. commit is a validated 40-hex-character RENDER_GIT_COMMIT or null; no other environment information is returned. Bootstrap uses this config, and GET /api/health preserves {ok:true, service:'run-it-back'} plus commit. Own server/ only for this task, excluding tests. Do not change deployed Render settings or persistence.
4. Codex 3 (Windows 3): after its file-access preflight succeeds, add a compact, accessible, config-driven practice guide for all seven presets. Own src/ and packages/challenges/ plus relevant non-test gameplay UI. Expose packages/challenges/practice-guide.ts with practiceGuide(config: ChallengeConfig): {title: string, steps: string[], controls: string[]} for independent tests. Show concrete ordered actions for jump, spin180/360, ramp-shot, wall-edit, precision and dash-peek; controls must match real implemented keys (Space, Q/E, B/G, X, F/R), and show turn rather than spin wording for tactical play. Reflect the selected config on switching/remix/invitation. Describe reference clips honestly as player-guided; do not fabricate live completion indicators. Do not change physics/proof contracts, unrelated graphics or font/logo sources. Polish existing per-game control hints to expose the correct actions, without creating a second input system.
5. Claude 2 (Windows 2): independent contract-driven tests for runtime host/port/commit handling and the seven preset guides, plus existing regression suite and brand guards. Work from actual published implementation SHAs, tests/ and *.test.ts only. Add meaningful assertions for mode-specific controls and malformed config/runtime input where contracted; do not merely snapshot the implementation. Report actual commands/results. Opus 5.5. Browser checks require actual browser tools; otherwise explicitly hand them to desktop Codex 1.

Codex 2 and Codex 3 are parallel implementations after plan review. Shared interfaces above belong to Codex 1. Claude 2 tests a combined integration SHA or explicit individual implementation SHAs; Claude 1 reviews the final tested combined SHA. Owners fix their findings; Codex 1 integrates only reviewed/tested work on a separate branch. No agent edits another role's working tree.

## Access and publication gates

Coordination update: Codex 3's local preflight confirmed a real host-policy rejection before PowerShell starts; keep its worker in read-only proposal mode. Codex 3 still authors frontend code from supplied source packets; desktop Codex 1 applies reviewed proposals in its authorized workspace and records authorship versus execution explicitly. This preserves the original coordinator-mediated workflow without weakening the remote policy. Its tool permissions are not claimed fixed. The Mac's first turn was instead blocked by a coordinator-only instruction leaking into its shared goal; no Mac permission failure or source change was established. Product requirements and coordinator operating notes must be separate before the corrected cycle.

Claude 1's plan corrections are frozen: practiceGuide accepts valid ChallengeConfig only; use replay?.config ?? config for guides and objective distance. Every mode includes actual WASD/aim/C/F/R controls; Space is excluded for tactical, G is wall-edit-only, X is dash-peek-only, and ALIGN is absent for spin presets. Steps must describe real ramp takeoff, wall opening and cover/dash/settle requirements. Trim HOST/PORT; blank PORT defaults, otherwise ASCII digits only 0..65535. Trim valid case-insensitive 40-hex commit and normalize lowercase; invalid gives null. These update the initial wording above.

Codex 3 previously had a real execution-policy rejection reading project files. Its later successful transport check did not prove coding access. Do not assign implementation to it until the local worker's read/owned-folder-write capability is verified. Diagnose policy normally; never disable security controls or bypass permissions. If backend or coordinator tooling is blocked too, report the exact blocker without claiming execution.

The resumed user instruction authorizes bounded work and publication of unique task branches. Render's deployment source/settings must be confirmed before pushing an integration branch that might auto-deploy. Do not trigger a deployment or change hosting resources while that information is missing. Use the public Render site for current-build read-only/browser QA, and locally test candidate changes before any separately authorized deploy. Uploaded QA data must be clearly synthetic/disposable; do not touch existing player records.

## Acceptance

## Post-review frozen decisions

Claude 1's review at 7137eef is dispositioned as follows. All new executable tests go under tests/ so npm test discovers them. Both helper modules are pure on import: no process.env reads, React/Three/CSS imports or server startup. Unit tests never import server/index.ts. Leading-zero ASCII PORT values are accepted as decimal (0080 becomes 80); plus signs, exponent/hex/decimal notation, full-width digits, negatives, out-of-range and nonfinite huge values are rejected with a fixed message that does not echo input. Resolve runtime config before storage/Vite/listen side effects.

Guide steps explicitly distinguish spin180's facing-away start from spin360's facing-target start, and net rotation after takeoff. Ramp shots require B outside the slot, walking onto the ramp and jumping from it before firing airborne. Wall-edit has no ramp: B/G open the upper wall panel, then jump on the near side and shoot through the opening. Dash-peek starts behind the left crate and uses one grounded X dash 4m to the right, then release movement, settle and fire. Include Keyboard Start, captured-click fire and Esc release in the actual controls.

Render the guide once in the play layout using replayAttempt?.config ?? config, replacing the existing generic THE PLAYBOOK copy. Do not add a guide to the premiere screen. GameArena replay objective distance must use playConfig too. Supply Codex 3 a complete actual source packet for exact proposals. Temporary execution assignment: desktop Codex 1 may apply Codex 3-authored proposals in src/ and non-test packages/challenges/ and packages/gameplay/ in the coordinator's own workspace, with authorship and execution recorded separately. This is not a permission change on Windows 3.

## Acceptance checks

- Runtime config and health commit identity are deterministic and expose no credentials or arbitrary environment values.
- Every preset has correct, readable steps and controls; switching games/presets updates the guide; labels describe original practice mechanics honestly.
- Existing relay, clip, proof and brand behavior remains intact; independent new tests and existing tests pass; production build passes.
- Independent exact-diff review is resolved. Actual local browser checks cover representative rooftop, build/edit and dash/settle guides, including config switching. Record the hosted baseline separately from candidate/local results.
- Report actual role responses, source SHAs, validation evidence and remaining access/deployment limits. No statement that the live URL contains new changes until its deployed revision is verified.

Official Render environment reference consulted: https://render.com/docs/environment-variables.md (RENDER, RENDER_GIT_COMMIT and PORT). No Render account settings were changed.
