# Arena graphics handoff

Codex 3 standalone frontend pass on work/codex-3/arena-graphics. Base c578ca521c803b429a09dbd12ea06455e3cb1182. Only gameplay rendering and this handoff are in scope.

- Rooftop has a layered skyline in both directions, mechanical rooftop props, a seamed and textured roof deck, a bracketed target, and a revised scope and receiver.
- Buildyard has a bright island backdrop, colorful workshops and fences, a marked build slot, visual ramp planks and fasteners, and a framed editable wall. A short highlight follows the existing build and edit events.
- Courtyard has staggered paving, plaster façades, recessed doors, windows and balconies, a segmented masonry arch, and paneled tactical cover. Short dash streaks stay toward the outside of the view.
- The renderer uses per-arena lights and atmosphere, shared geometry and instanced scenery. Hardware shadows update when the build state changes. Compact rendering uses contact shading, skips shadow maps and caps resolution. SwiftShader uses 80% of the CSS pixel count in each dimension.
- Tactical blocker bounds, build bounds, shot rules, camera movement, replay timing and recorded state formats are preserved. The pass uses original procedural geometry and textures and keeps the existing brand assets.

The production build and all 65 application tests passed. Local Chromium exercised Rooftop jump, Buildyard ramp takeoff and edited-wall shots, Courtyard precision and dash-peek, using the existing labelled aim assist for these successful live shots. Matched replay fixtures supplied fixed spawn, reverse, airborne, ramp, intact wall, edited wall and cover positions at the same 20 m setup. The 180 and 360 presets were visually checked in replay fixtures and covered by automated shot tests. Live successful spins, a fresh clip upload, and hardware-accelerated frame rates were outside the browser evidence.

The requester received 20 matched screenshots as an archive. For independent follow-up, exercise spin proof, replay transitions and high-quality shadows on hardware acceleration at the draft PR head.

Repeated in-page switches between all three arenas retained one canvas and showed no WebGL initialization error.

## Matched camera-path performance

Chrome 157.0.8103.51 headless, Windows, Core i7-1255U and Iris Xe host. WebGL used SwiftShader on both revisions. Same 1440 x 1000 browser viewport, same 949 x 618 CSS game viewport, same 20 m synthetic replay path and three-second sampling window after warm-up. The drawing buffer went from 949 x 618 to 759 x 494 under the software fallback. Draw counts include shadow passes where active.

| Arena | Median frame interval, before to after | p95 frame interval, before to after | Mean WebGL draws per frame, before to after |
| --- | ---: | ---: | ---: |
| Rooftop | 66.4 to 66.4 ms | 66.6 to 66.6 ms | 734 to 48 |
| Buildyard | 49.9 to 49.9 ms | 66.6 to 50.0 ms | 103.1 to 71.9 |
| Courtyard | 49.9 to 33.2 ms | 83.1 to 49.9 ms | 139 to 45 |

These timings characterize the software fallback and include the lower drawing resolution. Measure the full-resolution shadow tier separately on a physical GPU.
