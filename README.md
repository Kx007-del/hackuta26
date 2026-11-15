# Hackuta26 — Fortnite showcase

**Current scope supersedes the historical guide below.** The public site is Fortnite-only with one fixed supplied recording. Game selection, arbitrary clip inputs, relays and leaderboards are no longer exposed. Old game/relay links open the Fortnite showcase with a notice. The old multi-game App and server contracts are retained as inactive compatibility code; no player records were deleted.

The reference plays from `/showcase/fortnite-reference.mp4`; its exact hash is in [reference.json](docs/showcase/reference.json). Current gameplay is still the clearly labeled Buildyard prototype. The matching hillside, preplaced cone, third-person camera and revised controls are unfinished.

Render hosts https://hackuta26.onrender.com/ from `build/five-agent-h26`. Verify release commits at `/api/health`. Current validation: 100 application tests, 9 relay tests and production build pass. Automation remains stopped. The next manual assignment is [Codex 3's updated prompt](docs/showcase/CODEX-3-NEXT-PROMPT.md). See [cleanup details](docs/showcase/CLEANUP.md).

## Historical multi-game guide (not the current public experience)

Three original, game-inspired browser environments with reference clip uploads, guided recreation, harder remixes, two-person relays and recorded squad replays.

**Feature development is paused.** For the three-Windows/one-Mac, five-agent setup, start with [Multi-computer instructions](docs/MULTI-COMPUTER.md). The shared state is [team/state.json](team/state.json).

For automatic task dispatch under Codex 1, use the [distributed team relay](docs/AUTOMATION.md). Each computer needs its assigned signed-in worker running; setup does not resume feature development.

Use the [device-specific copy-paste prompts](docs/DEVICE-PROMPTS.md) to connect the Mac, Windows 2 and Windows 3.

| Game inspiration | Environment | Playable mechanics |
| --- | --- | --- |
| Call of Duty | Military rooftop | Sniper silhouette, aim down sights, jump, 180/360 spin shots |
| Fortnite | Bright low-poly Buildyard | Place ramp, walk/jump from it, build and edit wall, shoot through opening |
| Valorant | Tactical Courtyard | Grounded stationary precision, cover collision, dash out and settle before firing |

These are original practice arenas, not copies of real game maps. Clip recreation is guided: the player selects the moment, mechanic and distance. Video is not automatically reconstructed or analyzed by AI.

## Start locally in PowerShell

Requires Node 22.13+ and npm:

```powershell
npm ci
$env:PORT='5174'
npm run dev
```

Open http://127.0.0.1:5174. No API keys or external database account are needed.

## Play the complete loop

1. Choose your game from the home page or arena selector.
2. Choose a playable MP4, WebM or modern MOV, up to 50 MiB and 90 seconds. Select start/end of the moment and Use This Clip.
3. Set the mechanic and target distance. Play Selected Moment keeps the reference available while practicing.
4. Keyboard Start gives keyboard controls without mouse capture. WASD moves, Space jumps, Q/E turns, arrow keys aim, F fires, R retries. B places a build, G edits a wall, X dashes, C aims down sights when available. Buttons expose the same actions.
5. Align Aim is an explicitly labeled practice assist; it aims only. Required actions must still succeed. It is unavailable for spin challenges.
6. Land the required shot. Changing mode, preset, distance or clip invalidates proof. Enter a name and Pass the Play.
7. Send the invitation to a fresh browser tab. The guest receives the same environment, challenge and reference clip, completes it, and opens Squad Premiere.
8. Watch both recorded attempts. Remix to raise the difficulty; the new challenge needs a new successful attempt.

Uploaded draft references/settings survive same-tab refresh. Unpublished gameplay attempts reset. Published relay progress is stored on the server. Host markers are session-scoped UI recovery hints, not authentication; duplicated tabs may inherit them.

## Storage and production

```powershell
npm run build
$env:PORT='5174'
$env:DATABASE_PATH='C:/hackuta26-data/relays.sqlite'
$env:CLIP_DIRECTORY='C:/hackuta26-data/clips'
npm start
```

CLIP_DIRECTORY defaults beside a custom DATABASE_PATH, otherwise data/clips. SQLite and media need persistent storage when hosted. Keep long-running data outside OneDrive. The env example documents variables; set them in your shell or host settings.

Clip storage is a single-process local prototype: two uploads at once, 50 MiB per clip, 512 MiB stored-media quota, 60-second receive deadline. Container headers and metadata are checked; browser playback checks decoding. File data is fsynced and metadata published atomically; Windows directory/power-loss durability is not established. No committed clip eviction or deletion UI is included. Conservative MOV policy requires a qt ftyp header; H.264 MP4 is the preferred compatible upload.

The default server listens only on localhost. Localhost invitation links do not work from another device without a reachable host. No login, public abuse controls, competitive anti-cheat, multiplayer networking, arbitrary clip reconstruction or exported montage video is claimed. Full movement requires keyboard/mouse and WebGL; mobile parity is unverified.

## Brand and team

All served fonts, logo and textures match the downloaded FaZe Drive toolkit byte for byte. Authored typography uses Source and Anton only. Game names are plain text; scene geometry and weapon silhouettes are original. See docs/team/brand-provenance.json.

Permanent roles: Codex 1 coordination/contracts, Codex 2 backend, Codex 3 UI/gameplay, Claude 1 independent review/brand audit, Claude 2 independent tests. Both Claude profiles are pinned to claude-opus-5-5. Existing account profiles remained separate and produced fresh successful turns. Read-only provider proposals were applied and tested by desktop. See docs/team/H26-2-ACCOUNTS.md and AGENTS.md.

## Validation

```powershell
npm test
npm run build
```

49 tests pass. See docs/team/H26-2-BROWSER-QA.md for independently performed browser checks and separate root upload/ramp/relay checks, plus screenshots. Detailed limits are in docs/VALIDATION.md.

Private repository https://github.com/Kx007-del/hackuta26 was created. Work is local on build/five-agent-h26; no push, main merge or deployment has been performed. Reference prototype: Kx007-del/faze-run-it-back commit 3f66407f09880c445239f1c95858d6c73f449a30.
