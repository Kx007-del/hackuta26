# Three-minute judge demo

Use a desktop with keyboard/mouse and a current browser supporting WebGL. Open the site before presenting so the free Render instance has time to wake. Keep the source repository and this script available. Use game-data scoring for a reliable timed demo; show AI as an optional feature unless you have rehearsed a successful hosted response.

| Time | Screen and action | Suggested narration |
| --- | --- | --- |
| 0:00–0:20 | Home: show and play the supplied reference. | “Watching a legendary trick shot is exciting. What if you could step into the moment and try it yourself?” |
| 0:20–1:00 | Try it Yourself → practice. Show ramp, preplaced cone and hillside. Click the scene, move/turn and take one shot. | “We handcrafted this playable environment around one reference moment. You can try the movement and shot immediately in your browser.” |
| 1:00–1:25 | Exit after scoring to the result page; show score components and retry. | “The report turns a single attempt into a learning loop. Game data works on its own; optional AI compares the gameplay clip with consent. Results stay in the same tab.” |
| 1:25–1:55 | Leaderboards: switch Highest Score, Play Streak and Total XP; show badges. | “You can compete through skill, consistency or participation. Example players are labeled, and real eligible attempts update your progress.” |
| 1:55–2:15 | Join Events: show the featured fictional sponsored cup and event-specific rules/standings. | “Creators and communities can organize their own competitions, each with separate rules and standings. This sponsor example illustrates the opportunity.” |
| 2:15–2:45 | Host an Event → Explore host demo. Show review, analytics and audit tabs. | “Our business model is paid creator and sponsor hosting. This interactive organizer demo shows the workflow without charging money or altering a real competition.” |
| 2:45–3:00 | Return home or show source. | “Today we have one playable curated challenge. Next are durable storage, more curated moments and production organizer tools. We turn viewers into participants.” |

## Controls

WASD move; Space jump; mouse look after clicking the scene; arrow keys provide keyboard aiming; F or click fires; R or Reset starts a new attempt; Escape releases pointer lock. One shot per attempt. Full screen is available. If pointer lock is unavailable, use arrow keys and F.

## Reliable run-through

1. Rehearse the shot before recording; a miss still demonstrates a scored result but receives half the comparable hit score.
2. Wait at least 1.5 seconds before firing and move 3 metres or turn at least 20 degrees for an eligible ordinary attempt. Ordinary eligible attempts grant 10 XP, with daily limits. Do not claim event attempts grant global XP.
3. Use one deliberate attempt, wait for scoring, then use the visible Exit control to open Results. Do not navigate away while it is preparing the report.
4. Show the real-progress row separately from fictional showcase players. The current server may have no live entries after a redeploy.
5. In `/host/demo`, changes are local simulation. Refresh or Reset restores the fixtures. Never present example prize pools/entrant counts as actual activity.
6. Keep the Render URL as the fallback for custom-domain trouble. Both public domains use the same backend, so neither bypasses a free-instance cold start. Keep a local production build ready as the cold-start/network backup, with separate local data.

## Record the submission video

Record the above flow with a brief spoken pitch, crop out unrelated tabs/credentials, and upload the video to a destination accepted by the actual hackathon. Check its visibility in a signed-out browser. Provide the resulting URL in the submission form. This packet contains a script, not a finished narrated video.
