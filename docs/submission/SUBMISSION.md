# FaZe Run It Back

## Elevator pitch

Turn watching a legendary trick shot into trying it yourself: a playable browser challenge with feedback, progression and community competitions.

## Inspiration

Gaming communities share incredible moments, but most viewers can only watch. We wanted to turn that excitement into participation: watch the moment, step into a recreation, take your shot and improve. Our showcase centers on a supplied 2019 FaZe Mews Fortnite trick-shot clip and a focused, handcrafted environment around its setup.

## What it does

FaZe Run It Back turns one reference moment into an interactive challenge. Players watch the clip on the home page, select Try it Yourself and enter a third-person browser arena with the ramp, preplaced cone, hillside and ridge target. Keyboard and mouse controls let them move, jump, turn and fire. A same-tab result report shows a score and feedback, and players can reset and improve.

The platform extends the loop beyond an isolated attempt. Highest Score, Play Streak and Total XP boards give players different ways to progress. Eligible ordinary attempts earn XP and unlock achievement milestones grouped into five badge families. Example standings make the feature understandable immediately, while a player's own real progress updates after eligible attempts. Optional accounts allow the same server identity to be used across devices while the database is available.

Join Events gives competitions their own rules and standings. Host an Event supports ownership-protected event management, and a separate interactive demo lets judges explore event creation, publication, moderation, analytics and finalization without creating an account or changing real event data. Demo participants, sponsors, results and prizes are explicitly fictional.

## How we built it

We built the interface in React and TypeScript with Vite, and the playable environment in Three.js. Express runs the API and serves the production app. SQLite stores account/session data, progression and competitions. The service is deployed on Render, and GitHub hosts the source and runs the automated build and tests.

Scoring combines explicit game rules with an optional Google Gemini video-comparison path. With player consent, the browser records only the game view and the server compares it to the fixed reference. When AI comparison succeeds, it contributes 60% of the ordinary-play score, with game data contributing 40%. Without consent or when the model is unavailable, game data supplies the score. Misses halve the result. Event attempts deliberately use deterministic scoring rather than AI, keeping their rules consistent.

The UI uses the supplied FaZe toolkit logo and fonts, with recorded source hashes. We used a five-role workflow across three Codex and two Claude accounts for planning/integration, backend, frontend, review and tests. The project converged on one polished showcase challenge instead of the earlier multi-game plan. Agent automation is development tooling, not a runtime requirement or product feature.

## Challenges we worked through

Matching the reference required translating a short video into a usable scene layout, camera position, movement and shot timing. We also had to separate engaging sample content from real player records, keep global and event standings distinct, preserve guest progress during account creation, and make scoring failures recover without awarding progress twice. Deployment coordination required verifying the actual hosted commit rather than assuming a GitHub push had reached Render.

## Accomplishments

- A complete reference → practice → result → retry loop that stays in one browser tab.
- A focused 3D scene with the cone already placed in the environment.
- Three progression categories and five recognizable badge families representing eight milestones.
- Separate player, event-discovery and organizer experiences.
- Optional accounts and ownership checks without requiring sign-in to explore the product.
- A consent-based AI integration with a usable deterministic fallback.
- A tested build, a public source repository and a verified hosted release.

## What we learned

A strong hackathon experience benefits from one convincing end-to-end loop. We learned to make claims match the actual implementation, distinguish example data from live activity, and treat deployment verification, readable UI, identity boundaries and fallback behavior as part of the product experience.

## Business model and next steps

Our intended customer is a creator, esports organizer or sponsor who pays to host a branded challenge and community competition. Future revenue could come from event packages, custom challenge production and organizer analytics. Current packages are a no-charge preview; payment collection and prize payouts are not implemented.

Next steps are durable storage, account recovery, verified organizer workflows, stronger abuse prevention, more curated reference challenges and validated billing. These would be needed before relying on the platform for real prize competitions. We would also extend input support and benchmark performance across more devices.

## Current boundaries

This is an independent Fortnite-inspired browser recreation, not the original Fortnite game, an official FaZe/Epic integration or automatic reconstruction from arbitrary uploads. The showcase uses one fixed supplied clip and one handcrafted world. AI estimates may be imperfect; successful hosted AI comparison should only be claimed when an actual result confirms it. The application handles gameplay clips in memory and does not persist them; the AI provider's own policies are separate. Current Render storage can reset on restart/redeploy, including accounts and real events. Sample sponsors, player counts and prize pools are illustrative rather than traction or actual awards.

## Built with

TypeScript, React, Three.js, Vite, Node.js, Express, SQLite, Google Gemini API integration, Render, GitHub Actions; Codex and Claude Code for development assistance.

## Project links

- Live demo: https://hackuta26.onrender.com/
- Source: https://github.com/Kx007-del/hackuta26
- Organizer demo: https://hackuta26.onrender.com/host/demo
- Demo script: [DEMO-SCRIPT.md](DEMO-SCRIPT.md)
- Technical verification and remaining submission items: [READINESS.md](READINESS.md)

Team member names, prize-track selection and a recorded demo-video URL must be supplied by the team in the submission form. No accomplishments, customers, awards or team identities have been invented.
