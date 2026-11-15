# FaZe Run It Back

Watch an iconic trick shot. Step into a browser recreation. Run it back, improve your score, and compete with your community.

- Live demo: https://hackuta26.onrender.com/
- Custom domain: https://faze-runitback.us/ (use the Render URL as the submission backup)
- Source: https://github.com/Kx007-del/hackuta26
- Submission write-up: [docs/submission/SUBMISSION.md](docs/submission/SUBMISSION.md)
- Judge demo: [docs/submission/DEMO-SCRIPT.md](docs/submission/DEMO-SCRIPT.md)
- Verification and remaining submission items: [docs/submission/READINESS.md](docs/submission/READINESS.md)

## Current showcase

The public product is a single Fortnite-inspired trick-shot challenge based on the supplied 2019 FaZe Mews reference clip. Its handcrafted 3D hillside contains the ramp, landing, preplaced cone, trees, hut and ridge target. Players watch the clip, enter third-person practice, take a shot and view results in the same browser tab.

Four main tabs separate the experience:

| Tab | What works |
| --- | --- |
| Play | Fixed reference video, playable scene, reset/fullscreen, scored attempts and same-tab result reports. |
| Leaderboards | Highest Score, Play Streak and Total XP, real server progression, example standings and five visual badge families. |
| Join Events | Published-event browsing, event-code access, a clearly fictional sponsor example, rules and separate event standings. |
| Host an Event | Ownership-protected real event management, plus a public interactive host simulation at `/host/demo`. |

Guest play and optional username/password accounts are supported. The host simulation uses fictional events, entrants, results and analytics and resets on refresh; it never changes real events or awards prizes.

## Scoring

Ordinary play compares distance, turn, aim hold, position on the structure and one hip-fire shot against reference targets. The server recomputes hit/occlusion, distance and footing. If a player opts into gameplay recording and Gemini comparison succeeds, the final score blends 60% AI comparison with 40% game data. Otherwise it uses game data alone. A miss halves the final score. Event attempts use deterministic game-data scoring and do not award global XP.

AI comparison is optional, requires a working server-side Google API key/video-capable model and may be unavailable. It does not generate the environment. This is a game-inspired browser recreation, not the original Fortnite runtime or tournament anti-cheat.

## Run locally

Requires Node.js 22.13 or newer and npm.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. No API key is required for game-data scoring.

```powershell
npm test
npm run team:test
npm run build
npm start
```

`npm start` serves the production build. Optional settings are documented in `.env.example`; set environment variables through your shell or hosting service. Keep actual API keys outside Git. `PORT` overrides the default 5173. `DATABASE_PATH` selects the SQLite file; the default is `data/relays.sqlite`.

## Architecture

React + TypeScript + Vite power the UI; Three.js renders the browser arena; Express runs scoring, account, progression and competition APIs; SQLite stores account/session/progression/event records. Gemini video comparison is a server-side REST integration. Render hosts the combined service from `build/five-agent-h26`.

`src/` contains the showcase, account and event screens. `packages/gameplay/` contains the scene and controls. `packages/showcase-scoring/`, `packages/progression/`, `packages/auth/` and `packages/competitions/` contain the active feature logic. `server/` wires the service; `shared/` holds contracts. Historical multi-game and relay code remains in the repository for compatibility but is not the current public showcase. Old roadmap documents are historical; this README and the submission packet describe the present build. Team automation is not required to run the app.

## Design and assets

The UI uses supplied FaZe logo/font assets with byte provenance in `docs/team/brand-provenance.json`. FaZeDisplay is the toolkit custom display font; toolkit Anton supplies characters absent from the font sample, and Source remains the reading/editable-text font. Reference footage provenance is recorded in `docs/showcase/reference.json`. Scene meshes, character and rifle are original stylized browser assets; no official Fortnite game runtime is embedded. The interface is independent and does not imply official affiliation.

## Showcase limits

The hosted filesystem is currently ephemeral: redeploys/restarts can reset accounts, progress and real events. Login does not provide durable storage. There is no password recovery, email/OAuth login, multiplayer, arbitrary clip-to-world generation, payment processing or prize payout. Creator/organizer/sponsor packages illustrate the intended business model; current hosting is no charge. Desktop keyboard/mouse is the intended gameplay setup; mobile navigation is supported, but touch gameplay is not promised.

See the submission readiness report for checks tied to the verified release rather than relying on historical test counts in older handoffs.
