# Fortnite reference brief — "61 m no-scope" showcase

Author: Claude 1 (review/analysis role). Analysis and specification only: no production files changed, nothing merged or deployed.

**Reference:** `Recording 2026-11-14 221821.mp4`, as supplied by the human.
- Inspected with ffprobe: **3.104 s**, **1920×1080**, H.264, **30 fps**, **94 frames** (all extracted and read in order), AAC audio.
- Timestamps below are `frame / 30` from the start of the file. "fN" means frame N, counting from f0.

**Source inspected:** `build/five-agent-h26` @ **`8af6b2ceb9e2ab2aef8ce8c5e540f9fe24b0ff99`** (merge of PR #19, 2026-11-14 21:13 CST). Older README text is not relied on.

**Legend:**
- **[O]** observed directly in the frames.
- **[E]** estimate or inference from the frames.
- **[U]** unseen or undeterminable from this clip.

---

## 0. Summary

**What happens** [O]:
1. A third-person player stands on a wooden stairs/ramp structure on a grassy hillside, in build mode with the **cone** piece selected.
2. They place a cone at 0.87 s.
3. They switch to a green single-round long rifle at 0.93 s and turn about **65° left** in about 0.25 s.
4. They hold aim at a grassy ridge for about 0.9 s.
5. They **hip-fire** at 2.00 s.

**The kill feed** then reads **"FaZe Mew NO-SCOPED iKxtie_x (61 m)"** (from f64; fully legible in f66–f92).

**Verified:**
- The kill feed's "61 m" text is legible and stable across frames 64–92.
- "NO-SCOPED" is consistent with what is visible: the four-tick hip-fire reticle and no scope overlay in f59–f60.
- The 61 m figure is the game's own reported distance. I cannot measure it independently, and the target is never visible before the shot.

**Not established by the video:**
- Any cone launch or boost.
- Any edit.
- Any jump being required for the shot.

The player builds the cone in the clip. Per the human's scope, the showcase instead **pre-places** it.

---

## 1. Timestamped action breakdown

| Time (frames) | Observed [O] | Notes |
|---|---|---|
| 0.000–0.833 s (f0–f25) | **Third-person view** from behind and above the right shoulder. **Build mode** with the cone slot (4th, key **X**) highlighted on the build bar `Q C F X Tab`. The player stands on a **wooden stairs/ramp** with horizontal plank stripes, rising toward a **wooden landing**. A **translucent blue cone preview** sits on the landing ahead. Prompts: `140 HP`, `EDIT Lock`, `BUILD 10` with a wood icon, `R ROTATE`. Compass **264–266° (W)**. Wood **369**, brick 993, metal 181. Storm timer **0:45 → 0:43**. Top-right counters `4` (players) and `4` (eliminations). Health 100, shield 0. | The camera **oscillates vertically about 6 times** (about 7 Hz). In the down-pointing frames (f3–4, f8–10, f14–15, f19–20, f23) a **red-tinted preview** covers the wood below. **[U]** whether this is look-flicking or repeated small jumps. |
| 0.867 s (f26) | **White placement flash** on the cone. The centre wood counter reads **359**; the side counter animates 369 → 365 → 363 → 362 (f26–f28). | **Cone placed** (10 wood). |
| 0.900 s (f27) | Build prompts still visible (`MATERIAL` label now readable). Camera moving. | |
| 0.933 s (f28) | **Slot 3 equipped:** a green-rarity long rifle. Ammo readout **`1 │ 174`** (one-round magazine). The build bar collapses to small icons. Camera pointing down at the grass slope. | Weapon type **[E]**: single-shot hunting-style rifle. The exact item is **[U]**. |
| 0.93–1.13 s (f28–f34) | **Fast left turn:** heading 264° → **201°** (the compass is unreadable mid-turn), plus a pitch-up revealing a grassy **ridge** and cyan sky. | About **63–67° in about 0.2–0.25 s** [E]. |
| 1.13–1.97 s (f34–f59) | **Aim hold:** heading **198–202°**. Slow pitch-up: the skyline at x=1100 moves y ≈ 329 → 475 px. A **pale build surface is visible under the feet**. The four-tick **hip-fire reticle** sits at screen centre, just below the ridge line. No scope overlay. Storm timer 0:42. | The player appears to stand **on top of the structure** [E]. The target is **not visible** at this resolution [U]. |
| **2.000 s (f60)** | **Shot.** An orange **muzzle flash** at the rifle. Skyline at y ≈ 531 (slightly higher pitch). The ammo readout is changing. | |
| 2.033 s (f61) | Magazine **0 │ 174**; slot total 175 → **174**. **White fragments** burst across the left half of the frame. | The fragments' source is **[U]** (impact debris, a build piece breaking, or an effect). Do not invent one. |
| 2.067–2.100 s (f62–f63) | **Camera pitches down sharply** (skyline y ≈ 443 → 302–373). A smear/blur across the right-hand HUD. **The minimap disappears** from f63 on. | Post-shot camera motion or recoil [E]. The HUD change is **[U]**, likely a stream or HUD toggle; not part of the scene. |
| 2.133 s (f64) | Kill feed (bottom left): **"FaZe Mew NO-SCOPED iKxtie_x (61 m)"**. Top right: **eliminations 4 → 5**, a new `14` counter, and the timer shows `0:41`, then **`✓ 0:59`** (f66). | 61 m confirmed in an upscaled crop (f66, f90). |
| 2.200 s (f66) | Centre: **`ELIMINATED iKxtie_x`** (red name). **White radial light streaks** converge on a point on the ridge crest (screen ≈ x 880–940, y 380), where small objects are visible. | The streaks mark the **victim's position** [E]. Whether the streaks are a game effect or a stream overlay is **[U]**. |
| 2.20–3.07 s (f66–f92) | Hold on the result. The character is shown in a stride pose with **grass and flowers directly underfoot**. "2 more spectators joined" appears (f90). | The player may have stepped or dropped off the structure after the shot [E]. |

**Audio:** speech and music dominate. One of the three largest peaks (31,991) falls at f60, which is consistent with the shot but not proof on its own.

---

## 2. Scene layout and object inventory

### 2.1 Coordinates for the recreation (proposed)

- **+Y up.** Spawn facing heading 265° (the "start facing" direction).
- The target bears **≈ 200°**, so it is **≈ 65° to the player's left** of the start facing.
- Distances are horizontal metres.

### 2.2 Inventory

| Object | Observed [O] | Estimate [E] / unseen [U] | Recreation requirement |
|---|---|---|---|
| **Wooden stairs/ramp** | The player stands on it from f0. Plank stripes, warm wood, rising ahead (W). | One standard build tile: about 5 m run × 5 m wide, rising about 3.8 m [E, genre convention, not measured]. The base sits on the grass slope. | **Pre-placed and static.** Walkable surface. |
| **Wooden landing/floor** | At the top of the ramp; the cone preview sits on it. | One tile, about 5 × 5 m, at ramp-top height [E]. | Pre-placed and walkable. |
| **Wooden cone** | Preview pyramid on the landing (square base the width of the tile, centred apex), placed at f26. | Height about 1.5–2 m [E]. Final placed appearance mostly **[U]** (the camera turns away immediately). | **Pre-placed on spawn and on every retry. No build step.** Walkable top surface. Same wood material as the ramp. |
| **Grassy terrain** | Dark, saturated green slope with grass texture and small **yellow and blue/purple flowers** (f64–f92). A ridge crest above eye level toward ~200°. | The ground rises from the structure to the ridge [E]. The ridge crest is about 61 m from the shooting position at heading ~200° [E, from the kill feed and bearing]. | Heightfield (or sculpted mesh) slope that rises toward the target ridge. Walkable. |
| **Trees** | Dark tree trunks uphill (W, f0–f28). A **round-canopy broadleaf tree** and a **conifer** on the skyline at the upper left (f33–f66). A tree mass at the upper right after the shot. | Positions are approximate [E]. | Original stylised trees at those screen positions; no collision needed beyond trunks. |
| **Building** | A **small dark hut/shed** with a lighter, bluish roof edge, uphill and to the right at the start (f0–f28, top right). | About 3–4 m cube-like hut, about 15–25 m away [E]. Interior **[U]**. | Static prop, original design. |
| **Storm boundary** | The minimap shows a **purple hatched storm area** around a green safe circle containing the player (red arrow). A **bright, irregular white band** runs along the ridge/skyline (f29–f92). | Whether the white band is the storm wall edge, haze or a light effect is **[U]**. | Minimap and HUD are **not** required (they are overlays). Optional distant storm-wall band: needs the human's confirmation (Q3). |
| **Sky and lighting** | A strong **cyan cast over the whole 3D view** (sky, terrain and character), while the **HUD keeps its normal colours** (orange and green items, purple minimap). Soft, flat light; no hard shadows visible. | Cause **[U]**: an in-game effect, the storm, or a capture/colour filter. | Default: overcast, soft-key lighting with cyan-teal grading, behind a **toggle** (Q2). |
| **Target / opponent** | **Not visible** before the shot. After it, the elimination streaks converge on the ridge crest at roughly screen centre. | On the ridge crest, **61 m** away, bearing ~200–202° [E]. Pose and size **[U]**. | One **original stand-in opponent** (no real names or skins) on the ridge crest at 61 m. Hittable hitbox about 0.6 × 1.9 m [E, genre-typical]. |
| **Player character** | A **Marshmello-style skin** (white cylindrical head, light outfit) with a **purple back item**. | | **Do not copy the skin.** Use an original, neutral mannequin; Fortnite-like proportions only. |
| **Weapon** | Green-rarity long rifle, **1-round magazine**, `1 │ 174`, hip-fired. | Exact item **[U]**. | Generic original long rifle; magazine of 1. |
| **Broadcast overlays (exclude)** | Webcam, donation goal and bars, "TOP DONATION" / "RECENT SUB" / "RECENT DONATION" panels, chat, viewer count `76,117`, party list, minimap, compass, build bar, hotbar, material counts, storm timer, spectator line. | | **None of these go in the 3D scene.** A minimal original HUD is allowed (crosshair, ammo `1 │ 0`, result text). |

### 2.3 Spawn and reset requirements

- **Spawn:**
  - On **top of the pre-placed structure**, on the landing beside the cone or on the cone top (Q4).
  - Facing **heading ~265°** (toward the hut and trees), so the target starts about 65° off-screen to the left, as in the clip.
  - Rifle equipped, magazine **1**.
- **Retry** (single key, configurable) restores everything: player position, facing, camera, ammo (1), target (alive, same place), cone and ramp (intact, same place), and timer. **No build or edit step at any point.**
- **Deterministic:** the same geometry and target position on every attempt; no randomness.

---

## 3. Third-person camera and proposed control mappings

### 3.1 Camera (estimates from the frames)

- **Rig:** over-the-right-shoulder chase camera. The character sits **left of centre** (body about x 650–1000 px of 1920), head top at y ≈ 440–470 px, feet below the frame bottom.
- **Aim point:** the **crosshair is fixed at screen centre**, just right of the head. Shots raycast **from the camera through the crosshair**, then from the weapon muzzle to that aim point (genre convention [E]).
- **Distances** [E]: camera about 2.5–3.5 m behind the character, about 0.5–0.7 m to the right, pivot near head height.
- **FOV:** the existing code uses `PerspectiveCamera(68, …)` (vertical). A Fortnite-like look at 16:9 suggests a horizontal FOV around 80° (vertical ≈ 50°) [E]. Make it configurable.
- **Collision:** the camera must not clip through the ramp, cone or terrain (spring-arm shortening).
- **Look:** mouse with pointer lock. Pitch is clamped (about −80° to +80°). Yaw is unclamped.
- **ADS** (optional, not needed for this moment): narrower FOV and a closer shoulder. The success criteria require **hip-fire**, so ADS must **void** the no-scope result.

### 3.2 Control mappings

Proposed, configurable, Fortnite-like PC defaults. Conflicts with the current app are marked.

| Action | Proposed default | Current app (8af6b2c) | Notes |
|---|---|---|---|
| Move | **W A S D** | WASD | Keep. |
| Look | **Mouse** (pointer lock) | Mouse; Q/E and arrows turn | Keep keyboard turning as an **accessibility option**, off by default (Q is a build key in Fortnite). |
| Jump | **Space** | Space | Not required for this moment, but available. |
| Fire | **Left mouse** | F or left-click while captured | **F conflicts** with the stairs bind seen in the HUD. Make F optional. |
| Aim down sights | **Right mouse** | C toggles ADS | Using ADS voids "no-scope". |
| Sprint | **Left Shift** (hold) | none | **[U]** whether sprint is needed. The clip shows no sprinting before the shot. |
| Crouch | **Left Ctrl** | none | Optional. |
| Retry | **Backspace** (proposed) | R | **R conflicts** with Fortnite's reload/rotate. Needs the human's choice (Q6). |
| Keyboard-only start | Enter | "Keyboard Start" button | Keep for accessibility. |
| Release mouse | **Esc** | Esc | Keep. |

Bindings live in one config object, can be remapped, and are shown on screen.

---

## 4. Minimum mechanics to reproduce this moment

1. **Third-person movement:** walk, optional sprint, jump, gravity. Collision with **terrain slope**, ramp, landing and **cone top** (standing on the structure). The current code only supports flat floors plus one ramp height and bounds of |x| ≤ 10, −30 ≤ z ≤ 8. It needs **generic standable surfaces and a larger walkable area** to cover the ~61 m line.
2. **Pre-placed static structure:** ramp, landing and cone, with no building, editing or destruction. No launch, boost or bounce physics.
3. **Single-shot hitscan rifle:** one round per attempt, hip-fire allowed, centre-crosshair raycast. Projectile drop and travel time are **not established** by the clip: start with hitscan and treat drop as an open question (Q7).
4. **Target:** one stand-in opponent on the ridge crest at **61 m ± 0.5 m** horizontal from the shooting spot. Head and body hitbox; one hit eliminates (a single shot did in the clip).
5. **Result:** on a hit, show an original "ELIMINATED" result and a feed line in the style of **"You NO-SCOPED Target (61 m)"**. Compute the metres from the actual shooter-to-target distance at the shot and round to whole metres. **No real usernames.**
6. **No-scope rule:** the shot counts as a no-scope only if ADS was **not** active at the moment of firing.
7. **Retry/reset** exactly as in §2.3.
8. **Not required:** building, editing, materials, cone placement, storm damage, the minimap, other players, loot.

**Contract impact** (Codex 1 decision). In `shared/contracts.ts`:
- `ArenaId` is fixed to three arenas.
- `TARGET_DISTANCES` is `[14, 20, 26]`.
- `validConfig` would **reject 61 m** and any new arena or template.

Relays, proof, the practice guide and the leaderboard all depend on these. The showcase therefore needs either a new frozen arena/template contract or a **separate showcase mode** that doesn't use relay validation (Q8).

---

## 5. Visual comparison checklist and testable success criteria

### 5.1 Visual checklist (compare paired screenshots at matched times)

| # | Check | Reference frame |
|---|---|---|
| V1 | Spawn view: third-person from behind and right; wooden ramp underfoot rising ahead; **cone already standing** on the landing; hut uphill on the right; trees uphill. | f8 (layout; the cone is a preview there) |
| V2 | Wood colour and plank-stripe pattern on the ramp, landing and cone. Square cone base with a centred apex. | f0, f8, f26 |
| V3 | After turning ~65° left: a grassy slope rising to a **ridge above eye level**, a broadleaf and a conifer on the upper-left skyline, a tree mass at the upper right. | f33, f45, f59 |
| V4 | Character framing: body left of centre, head top at about 41–44 % of screen height, crosshair right of the head. | f45 |
| V5 | Lighting: soft, flat, no hard shadows. Cyan-teal grading if Q2 = yes. | f45, f80 |
| V6 | Grass detail near the feet: dark green blades with small yellow and blue flowers. | f80 |
| V7 | Result: centred "ELIMINATED" text, a feed line with "(61 m)", and an optional radial-streak effect on the target point if Q5 = yes. | f66, f90 |
| V8 | **No** webcam, chat, donation panels, viewer count, party list or minimap anywhere. | all |
| V9 | Only the supplied FaZe toolkit fonts (Source, Anton) and logos; no Fortnite or real-player names, skins or logos. | all |

### 5.2 Testable success criteria

| ID | Criterion | How to test |
|---|---|---|
| S1 | The showcase lists **only the Fortnite-style arena**. No COD or Valorant names, arenas, presets, guides or leaderboard filters are reachable from the showcase. | UI/DOM test plus route test. |
| S2 | **The cone exists at spawn and after every retry** without any input, at the same transform (± 1 mm). | Unit test on scene state after `reset()` called N times. |
| S3 | No build or edit input is required. Build keys (B/G) do nothing, or are absent, in the showcase. | Input test. |
| S4 | Spawn heading 265° ± 2°; target bearing from the spawn spot 200° ± 3° (a 65° ± 5° left turn). | Geometry test. |
| S5 | Horizontal distance from the shooting spot to the target centre is **61 m ± 0.5 m**, and the result line shows **"(61 m)"** for a hit from the spawn area. | Pure-function test plus a scripted hit. |
| S6 | A hip-fire hit at the target from the structure → success with the **NO-SCOPED** label. The same hit with ADS active → **not** labelled no-scope. A miss → no elimination. | Scripted shots via the shot function. |
| S7 | One round per attempt; the magazine shows `1` before the shot and `0` after; firing again does nothing until retry. | State test. |
| S8 | The player can **stand on the ramp, landing and cone top** without falling through. Walking off returns them to the terrain slope. | Physics/collision test. |
| S9 | The third-person camera never clips inside the cone, ramp or terrain within the play area. | Sampled camera positions vs. geometry. |
| S10 | All bindings are remappable from one config. Defaults match §3.2 after Q6. Esc always releases the mouse. | Unit test plus browser check. |
| S11 | The existing brand-provenance test and font guard still pass. No new remote assets or libraries are required (three.js 0.180, React 19, Vite stay). | `npm test`. |
| S12 | Matched-screenshot review V1–V9 is signed off by the human, with V8 strictly no overlays. | Manual browser evidence. |

---

## 6. Assumptions and questions for human confirmation

1. **Reference video hosting and rights.** The clip shows a real streamer's webcam and real usernames ("FaZe Mew", "iKxtie_x"). Do we have permission to host and show this exact file in the showcase? If so, should it be cropped and blurred to the gameplay area, or linked to its original source instead?
2. **Cyan colour cast.** Should the recreation copy the strong cyan grading (it covers the whole 3D view but not the HUD), or use neutral daylight colours? I propose a toggle, default **on** for a "match the clip" mode.
3. **Storm.** Should a distant storm wall or white band on the ridge be shown? Storm damage and the minimap would stay out.
4. **Spawn spot.** Should the player spawn **on the cone top**, on the landing beside the cone, or at the foot of the ramp? The clip shows the player on the ramp below the landing, then apparently on the structure at the shot.
5. **Elimination effect.** Should the white radial streaks after the kill be recreated? Their source (game or stream) is unclear.
6. **Retry key.** R conflicts with Fortnite's reload/rotate. Should Retry be Backspace, T, or kept as R?
7. **Bullet physics.** Hitscan (simplest; not contradicted by the clip), or a projectile with drop and travel time? The clip cannot establish this.
8. **Contracts and the existing app.** Should the showcase be a separate mode that hides COD/Valorant but keeps their data and relays readable, or are those arenas being removed? Either way, Codex 1 needs to freeze new interfaces: arena id, template, the 61 m distance, the no-scope flag, and the result format.
9. **Target visibility.** The target is never visible before the shot. Should the stand-in be visible at 61 m (fairer), or deliberately hard to see, like the clip?
10. **Character.** I assume an original neutral mannequin, not the Marshmello-style skin or the purple back item.
11. **Rifle.** I assume a generic original long rifle with a one-round magazine; exact item stats are not identifiable.
12. **What counts as success.** Is it only "hip-fire hit at 61 m", or must it also be "after turning from the start facing" or "within N seconds"? The clip took about 1.1 s from weapon equip to shot.

---

## Evidence notes

- Frames were extracted with `ffmpeg -vsync 0`, and contact sheets with timestamps were reviewed. Full-resolution frames f0, f4, f8, f26–f28, f33, f45, f59–f62, f64, f66, f80 and f90 were inspected individually.
- The kill feed was upscaled 4× from f64, f66 and f90; "(61 m)" is legible in f66 and f90 and partly drawn in f64.
- Compass headings were read from upscaled crops: f0 264, f8 265, f16 264, f34 201, f40 198–199, f50 198–199, f58 202, f62 202. The compass is hidden after the f63 HUD change.
- Skyline rows were measured per frame at x = 1100 and x = 1300 to quantify pitch changes.
- Source facts were read from `packages/gameplay/GameArena.tsx`, `packages/gameplay/shotRules.ts`, `packages/gameplay/environments.ts` and `shared/contracts.ts` at the SHA above.
