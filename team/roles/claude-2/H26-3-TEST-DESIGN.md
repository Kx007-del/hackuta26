# H26-3 independent assertion matrix (Claude 2, design only)

Task b97db487-6ef0-4b74-accc-3306f81ae58d · base/head 411ce3c1bf5f138ab97fd14356eb0a7561daf687 · model claude-opus-5-5.
Status: DESIGN ONLY. No test code, no helper imports and no candidate validation yet. The assertions below are future work. They will be coded in `tests/` against the actual combined implementation SHA.

## Inspected at this SHA (evidence)
- docs/H26-3-PLAN.md, including the post-review frozen decisions (lines 33-39).
- shared/contracts.ts: `validConfig` covers 7 combos; `TARGET_DISTANCES` is 14/20/26.
- server/index.ts: PORT uses `Number(process.env.PORT||5173)`, so `+80`, `0x50` and `8e3` are all accepted today. HOST is `||` with no trim. Health is `{ok,service}` only, and the env is read after Vite starts.
- GameArena.tsx:111 sets yaw to π for spin180 and starts dash-peek at (-4,-2.8). :137 makes jump a no-op in tactical. :139 restarts the clock on a rooftop jump. :125/:140 define the ramp takeoff window. :147 is the build-slot occupancy check. :160-161 handle the dash guard and the fixed 4 m. :171-173 define the wall opening. :189/:280 hide ALIGN only on rooftop spin. :198 is captured-click fire. :212-215 map arrows to Q/E and aim. :269 uses `config.targetDistance`, the replay bug to be fixed. :275 has Keyboard Start and Esc. :280 says "Q / E spin" in every mode.
- src/App.tsx:358 is replayAttempt. :704 is the GameArena key and :705 has `config={config}`. :748-752 is the generic PLAYBOOK, which says "edit your opening" for ramp-shot. Premiere is :606-680.
- ClipWorkbench.tsx:186 has the existing honest "Guided recreation…" copy.
- package.json `test` covers packages/social, packages/gameplay and tests/*.test.ts. tests/brand-provenance.test.ts has the font guard.

## A. Runtime config (`tests/h26-3-runtime.test.ts`, imports only server/runtime-config.ts)
A0. Purity: the dynamic import works with `process.env` changed by a Proxy or sentinel, and makes no env read and no listen. Calling it twice with the same input gives deep-equal results. The returned keys are exactly {host,port,commit}, with no other env values echoed.
A1. HOST: `{}` → 127.0.0.1. `RENDER:'true'` → 0.0.0.0. These RENDER values all give 127.0.0.1: `'TRUE'`, `' true'`, `'1'`, `'yes'`, `''`. `HOST:'  ::1 '` gives `'::1'`. An explicit HOST beats RENDER=true. Blank or whitespace HOST falls back to the RENDER/local default.
A2. PORT accepted: unset, `''` and `'   '` all give 5173. `'0'`→0, `'65535'`, `' 8080 '`→8080, `'0080'`→80, `'00000'`→0, and `'000065535'`→65535.
A3. PORT rejected: `65536`, `99999999999999999999999` (huge), `+80`, `-1`, `-0`, `80.0`, `8.`, `0x50`, `8e3`, `1_000`, `８０` (full-width), `٨٠` (Arabic-Indic), `'8 0'`, `'80\n1'`, `'Infinity'`, `'NaN'` and `'abc'`. Each must throw, and the message must be byte-identical across all of them, not contain the input or any digit run from it, and match a fixed constant (e.g. /PORT/).
A4. Commit: a 40-hex value comes back unchanged. Uppercase and mixed case are lowercased. Surrounding whitespace is trimmed. These give null: unset, `''`, 39 or 41 chars, a non-hex `g`, an embedded space, a `0x` prefix, and a 7-char short SHA.
A5. Startup order and health: tests must not import server/index.ts. Instead, a source-text read of server/index.ts asserts that `resolveRuntimeConfig(process.env)` comes before `registerClipApi`, `registerApi`, `createServer` and `listen`. The health handler body must contain `ok: true`, `service: "run-it-back"` and `commit`, with no `process.env` inside it, and `listen` must take the resolved host and port. Limitation: this is static text, not runtime proof. Runtime health stays a desktop/local-server check.

## B. Guide (`tests/h26-3-guide.test.ts`, imports only packages/challenges/practice-guide.ts)
B0. Purity: an importable plain module with no React/three/CSS imports, checked by reading the source. Output is deterministic, and the input is not mutated (frozen config).
B1. For all 7 valid configs (contracts combos × 3 distances × with/without referenceClipId): the result has a non-empty title, ≥2 non-empty steps and non-empty controls, all strings, and steps ≠ controls. Same-preset output does not depend on referenceClipId. A distance change either leaves output identical or changes only the distance text.
B2. Common controls in every preset: WASD move, mouse plus arrows plus Q/E aim/turn, C aim-down-sights, F fire, R retry, Keyboard Start, captured-click fire, Esc release.
B3. Mode keys: Space appears for the rooftop 3 and buildyard 2, and not for precision or dash-peek. B appears only for buildyard. G appears only for wall-edit. X appears only for dash-peek. ALIGN is absent for spin180/spin360 and present or allowed elsewhere. Tactical output has no `/\bspin/i` and uses "turn".
B4. Mechanics (tested with robust token regexes, ordered where needed):
- jump: jump, then fire while airborne.
- spin180: starts facing away; turn about 180° after takeoff; fire airborne; net rotation is measured from takeoff.
- spin360: starts facing the target; net 360° after takeoff.
- ramp-shot: B outside the build slot, then walk onto the ramp, jump from it, and fire before landing. Steps are ordered build < ramp < jump < fire. No "edit" wording.
- wall-edit: B wall, then G opens the upper panel, then jump on the near side and shoot through the opening. No "ramp".
- precision: grounded and still/stop, then fire. No jump.
- dash-peek: start behind the left crate, one grounded X dash of 4 m to the right, then release movement, settle/stop and fire. Ordered.
B5. Honesty: no "detect", "automatic", "reconstruct", "anti-cheat", "verified", "✓", "complete(d)" or "done". There are no official-map or engine claims.

## C. UI source-level wiring (static reads of src/App.tsx and GameArena.tsx; behaviour belongs to desktop browser checks)
C1. App imports practiceGuide and calls it exactly once, with `replayAttempt?.config ?? config` (or an equivalent single playConfig). The "THE PLAYBOOK" generic sentences are gone, including "edit your opening".
C2. The premiere branch (`screen === 'premiere'`) contains no practiceGuide call.
C3. The GameArena objective distance uses the replay/play config, not a bare `config.targetDistance`. `onComplete` still copies `config`.
C4. The "Q / E spin" hint is conditional, with turn wording in tactical.
C5. ClipWorkbench keeps its "Guided recreation…not an automatic copy" copy, and no new src/packages file adds detection or reconstruction claims.

## D. Regressions
D1. Run the existing suite unchanged: brand provenance (hash and font guards now also cover any new guide CSS/kbd styles), h26-2, h26-2-proof, navigation, social-regressions, shotRules and social server.
D2. Diff guard against base 411ce3c: shared/contracts.ts, shotRules.ts, public/brand and docs/team/brand-provenance.json are unchanged.
D3. `npm test` reports a count above the baseline with 0 fail. `npm run build` passes.

## Limitations / handoffs
- Browser checks for representative presets, config switching and replay guides belong to desktop Codex 1. The hosted-baseline observation is separate.
- If an export name or the purity contract differs at the implementation SHA, the test result becomes a finding for the owner, not a test rewrite.
- Next: Codex 1 supplies the combined implementation SHA, then Claude 2 codes A-D and runs them.
