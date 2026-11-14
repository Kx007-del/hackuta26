# Gameplay handoff

Dependencies: react, three, @types/three only. No physics dependency or proprietary assets.

`GameArena.tsx` is default exported and accepts the requested shared-contract props. Original procedural rooftop and skyline, fixed stationary target, custom ballistic jump, first-person movement, net-yaw spin validation, one shot per attempt. Starts facing away for the 180 preset. Camera eye-height is 1.7; jump speed 7.8 and gravity 9.8 produce roughly 1.59 seconds of airtime. Q/E spin at 5.9 radians/sec permits a full rotation during one jump.

Controls: Enter Arena, click arena for mouse lock; mouse aim; WASD move; Space jump; Q/E spin; arrow up/down aim; F or mouse click fire; R or Retry resets. Esc releases mouse. On-screen Jump/Fire/Retry provide a pointer-lock-independent route. Quick Start jumps directly into practice without pointer lock. Full movement and aiming remain desktop keyboard/mouse oriented. Keyboard handlers only act when arena itself owns focus or its canvas has pointer lock, and ignore focused buttons/fields.

Completion callback fires once per shot, including failures. No automatic callback on landing. Editing config remounts the scene state. `AttemptResult` contains camera snapshots around 30Hz and exact shot timestamp. Replay interpolates stored camera snapshots; target flashes cyan on a hit and replay-end callback fires once after 1.1 seconds of hold. In-app montage sequencing should use the callback. No video export or server verification claimed.

Each actual jump starts a fresh attempt clock and initial camera snapshot without resetting the player's aim or position. Saved successful replays begin with the jump, excluding idle setup time. A same-tick shot still appends a final frame with a positive duration (minimum 0.001ms), preserving the two-frame contract.

Acceptance reasoning: hit requires a forward ray/sphere intersection; success additionally requires airborne and a jump initiated from the platform; required spin uses absolute net yaw since takeoff rather than accumulated back/forth movement. Jump velocity makes all preset spin requirements possible. Replay uses recorded states instead of rerunning physics. Cleanup removes listeners, pointer lock, resize observer, RAF, renderer, geometries, and materials. Root should run TypeScript/build checks and browser acceptance on integration.

Novice target is an original training disc with radius 1.65 at height 3.2. A centered shot remains geometrically hittable throughout the normal jump, so basic jump/fire does not require adjusting pitch at the apex. Spin presets still require turning back to the target. `shotRules.ts` contains the actual live geometric validation. Run `npx tsx --test packages/gameplay/shotRules.test.ts` for ballistic arc, all distances, all preset feasibility, missing movement, missed aim, and net-spin checks.

Known scope: results are client-validated and not secure competitive proofs. Movement/airtime intentionally simplified. Recording is bounded at 1,800 snapshots and attempts restart at 59 seconds; normal attempts last seconds.
