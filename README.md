# Hackuta26: FaZe Run It Back

Private project: https://github.com/Kx007-del/hackuta26

A playable original rooftop trickshot arena: prove a remix, invite a friend, and watch both recorded attempts. Based on Kx007-del/faze-run-it-back at 3f66407f09880c445239f1c95858d6c73f449a30, using its supplied FaZe brand toolkit. Source asset ownership remains unchanged.

## Run locally (PowerShell)

Requires Node 22.13+ and npm. From this checkout:

```powershell
npm ci
$env:PORT='5174'
npm run dev
```

Open http://127.0.0.1:5174. The earlier reference project may still use port 5173. No external keys or database account are needed.

## Play

1. Choose Run It Back, The Original, 14m.
2. Quick Start jumps and aims; fire while airborne. Keyboard/mouse controls are shown in the arena.
3. Change preset/distance for a remix; land the new setup to unlock sharing.
4. Enter a name and Pass the Play.
5. Copy the invitation to a fresh browser session for the teammate.
6. Complete the same shot, Finish the Relay, then watch Squad Premiere.

## Storage and production commands

```powershell
npm run build
$env:PORT='5174'
# For a reachable hosted server use HOST=0.0.0.0 and a persistent disk.
# Choose a local folder outside OneDrive for long-running SQLite storage.
$env:DATABASE_PATH='C:/hackuta26-data/relays.sqlite'
npm start
```

DATABASE_PATH is optional; default is data/relays.sqlite relative to the working directory. The server creates parent directories. A persistent host must mount storage and set this variable. .env.example is a reference; export these variables in the shell or hosting settings. No deployment has been performed.

## Team and validation

See AGENTS.md, docs/ROADMAP.md and docs/TEAM-INSTRUCTIONS.md for the permanent five-role workflow. Existing signed-in profiles generate proposals; desktop applies them and runs actual checks. Separate worktrees live beside this checkout in ../agent-worktrees/.

```powershell
npm test
npm run build
```

## Scope

Original browser gameplay, jump/180/360 presets, discrete distance remixes, two-person relays and in-app replays. No arbitrary clip reconstruction, AI analysis, downloadable montage video, other game modes, live multiplayer or competitive anti-cheat. Keyboard/mouse and WebGL are required for full gameplay. A localhost invitation works only on this computer; internet sharing requires a reachable host. Server completion is client-reported. This prototype has no login or production abuse controls.
