# FaZe Run It Back

HackUTA 2026 prototype: land an original browser trickshot, prove a remix, invite a teammate, and watch both attempts in a squad premiere.

## Start

Requires Node.js 22.13+ (Node 24 recommended) and npm. Run from this folder:

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173. No API keys, paid accounts, or external database are needed.

For a production build:

```powershell
npm.cmd run build
npm.cmd start
```

## Try the full experience

1. Choose **Run It Back** on the home page.
2. Start with **The Original** and the 14m target.
3. Enter the arena. Use WASD to move, Space to jump, mouse to aim, and F or click to fire. Q/E spins; up/down arrows adjust aim; R retries. Esc releases the mouse.
4. Land an airborne shot. You can change the preset or distance; changed settings require a new successful attempt.
5. Enter a player name and choose **Pass the Play**.
6. Copy the invitation and open it in a second browser tab or window. Enter the second player's name and complete the same shot.
7. Choose **Finish the Relay**, then **Watch Squad Premiere**.
8. Return to the host tab and check teammate progress, or open the shared link again. Completed relays show the premiere.

The default server accepts connections only from this computer. A localhost invitation works on this computer; it is not an internet link. Sharing across devices needs a reachable host with persistent storage. This prototype has no login, competitive anti-cheat, rate limiting, or production abuse controls; do not use it as a prize competition service.

## Agent ownership

| Owner            | Folder                                                      | Responsibility                                                            |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Gameplay         | `packages/gameplay/`                                        | Arena, controls, shot rules, replay capture and playback                  |
| Challenges       | `packages/challenges/`                                      | Presets, distance selector and completion status UI                       |
| Social & Replay  | `packages/social/`                                          | SQLite persistence, relay invitations, guest completion, API/client tests |
| Integration lead | `src/`, `server/`, `shared/`, `public/`, root configuration | App screens, shared contracts, branding, integration and releases         |

Read AGENTS.md before editing. Agents only edit their assigned folders. Shared interfaces and dependencies go through the integration lead. Each agent's HANDOFF.md documents its work.

## Checks

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

SQLite data is stored in ignored `data/relays.sqlite`. Restarting preserves relays. Source distributions do not contain local player data.

## Brand assets

`assets/brand-source/` preserves all 60 supplied toolkit files, source URLs, extracted guideline text and the timeline reference. `public/brand/` contains the selected original logo, web fonts and textures used in the app. The supplied FaZe brand assets retain their original ownership; inclusion does not grant a new license. The prototype's arena and weapon geometry are original and do not contain COD, Fortnite, or Valorant maps or models.

## Scope and limitations

This release includes one COD-inspired arena, three presets, discrete distance remixes, a two-person asynchronous relay and an in-app replay premiere. Replays use recorded transforms, not downloadable video. Success is reported by the game client and checked for consistency on the server; it is not independently verified anti-cheat. Reference clips, arbitrary clip reconstruction, AI analysis, Fortnite-style building, Valorant-style abilities, video export, public ranking and live multiplayer are future work. The product currently uses an original illustration rather than a fetched archive video.

The browser arena needs WebGL and keyboard/mouse for full gameplay. There is no cross-device gameplay parity claim.
