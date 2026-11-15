# Showcase similarity scoring

**Authorization.** On 2026-11-15 the human asked for attempts to be scored against the fixed reference clip using the Google Gemini API ("if you play the shot just like the video it will get more points"). For this feature only, that replaces the earlier plan text "no new video-AI claims or paid services". Gameplay clips are sent to Gemini **only after the player opts in**. Claude 1 implemented it at the human's request.

## How a score is made

One shot per attempt. Reset or R starts the next attempt. Final score 0–100:

| Part | Weight | Source |
|---|---|---|
| AI comparison | 60 % | Gemini compares the attempt clip with `public/showcase/fortnite-reference.mp4`. It judges set-up, turn, aim hold, shot and timing, and is told to ignore graphics, HUD and stream overlays. |
| Game data | 40 % | Deterministic checks, recomputed on the server: distance at the shot vs 61 m, a ~65° left turn, ~0.9 s aim hold, standing on the build, one hip-fire shot. |

- A miss halves the final score (at most 50/100).
- Without consent, a recording, a key or the model, the game-data score stands alone, and the panel says so.
- Labelled "AI-estimated similarity to the reference — may be imperfect". No "verified" or anti-cheat claims.
- Event attempts use deterministic game-data scoring only and do not award global XP.

## Privacy and safety

- **Recording:** only the game canvas is recorded (no camera, mic, page or system audio), at ~1.5 Mbps, for the current attempt.
- **Storage:** the clip is processed in memory on the server and never written to disk or stored.
- **Logging:** logs contain only `Showcase scoring: AI unavailable (<reason>)`. No video, no model text, no key.
- **Limits:** clips up to 8 MB, WebM or MP4. Per client, 30 requests and 6 AI calls a minute; at most 2 Gemini calls in flight; identical clips are cached for 10 minutes.
- **Trust:** the server re-derives the hit (including occlusion by terrain, the build and the hut), the distance and the footing from shared scene geometry. It doesn't trust the browser's claims.

## Configuration (server only)

- `GEMINI_API_KEY`: set it in Render's environment settings and in a local `.env`. Never commit it or put it in browser code. If it's empty, scoring uses game data only.
- `GEMINI_MODEL` (optional): defaults to `gemini-3.8-flash`. Check https://ai.google.dev/gemini-api/docs/models for a current video-capable model. An unknown model falls back to game-data scoring.
