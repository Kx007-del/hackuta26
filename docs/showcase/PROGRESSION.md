# Community progression

**Authorization.** On 2026-11-15 the human asked Claude 1 to build category leaderboards, XP, play streaks and badges for the Fortnite showcase.

## Identity
- On a player's first scored attempt (or first name save), the server creates a guest and sets the `rib_guest` cookie: a random 32-byte token, HttpOnly, SameSite=Lax, and Secure on HTTPS, valid for one year. Only a SHA-256 hash of the token is stored.
- Opening the page creates nothing. An unknown cookie belongs to no one.
- Display names are 1–24 letters, numbers, spaces or `. _ - '`. They are not unique, not verified, and never used as identity.
- Guest progress belongs to that browser. Optional username/password accounts can preserve the same server identity across browsers/devices while the database exists; see [accounts](AUTHENTICATION.md). Login does not make the current Render filesystem durable.

## Rules (server-enforced; `packages/progression/rules.ts`)
| Rule | Value |
|---|---|
| XP | 10 per eligible completed attempt, hit or miss; 200 per UTC day at most |
| Eligible attempt | one shot, at least 1.5 s after the attempt starts, moved at least 3 m from spawn or turned at least 20°, and at least 3 s after the player's previous counted attempt |
| Idempotency | the browser sends a random `x-attempt-id` per attempt. The server claims it before scoring and records it once; a replay returns the stored result, and a duplicate still in flight gets 409 |
| Storage bound | at most 100 attempt records per player per UTC day; more are scored but not stored |
| Streak | consecutive UTC days with at least one eligible attempt. One advance per day; a whole missed UTC day resets it to 0; the longest streak is kept |
| Highest Score | best score among all **eligible** attempts, with or without a completed AI comparison. A new best updates the board immediately |
| Days | UTC, from the server's clock |

## Rankings and ties
- **Highest Score:** score desc, then who reached it first, then id.
- **Play Streak:** current streak desc, then longest streak desc, then who reached the streak first, then id.
- **Total XP:** XP desc, then who reached it first, then id.
- Each board shows the top 10, plus the viewer's own position.

## Badges
First Run (1 attempt), Regular (10), Dedicated (50), Three-Day and Seven-Day Streak, Top Ten (first time a ranked best enters the top 10), Champion (#1 at a daily checkpoint) and Reigning Champion (#1 at 7 consecutive checkpoints). Each badge unlocks once and stores its earned time.

**Checkpoints:** for each completed UTC day, starting on the day progression launched on a given database (`progression_meta.tracking_started_at`), the server saves the Highest Score leader as of 00:00 UTC. It works this out from the stored ranked attempts completed before that instant, not from the current board. Checkpoints are computed on the next request after midnight and never back-filled before launch.

## Showcase leaderboard vs Live standings
- **Showcase leaderboard** (shown by default): 12 fixed, fictional example players in `packages/progression/showcase.ts`, labelled "Example players". They exist only in code and the browser. They are never written to the database, never shown in Live standings, and never used for Top Ten, Champion or Reigning Champion.
- If the visitor has real progress on a board, it appears among the examples as a distinct "You — real progress" row. It is placed with the same ordering as Live standings (`compareStandings`, which tests check against the SQL order) and labelled "Showcase position", never a rank.
- **Live standings:** real guest players on this server only. When a board is empty, the page says so and links to the showcase.

## Saving and retries
- Each attempt has one id. If saving fails (network error, server error or still in progress), the result says "Progress not saved" and offers **Retry**, which re-sends the same attempt id.
- The server either records it for the first time (a failed save releases the claim) or returns the stored result marked `replayed`. XP is never awarded twice.
- After every saved game, the progress panel and boards refresh without a page reload.

## Storage and limitations
- Additive SQLite tables (`progression_*`, versioned in `progression_meta`) live in the existing `DATABASE_PATH` database. No table is changed or dropped.
- **Render free plan:** the filesystem is ephemeral, so progress resets on every redeploy, restart or idle spin-down. The UI says so unless `PROGRESSION_STORAGE=durable` is set. That flag should only be set after a persistent disk or an external database is approved and attached; it is a paid change and needs the human's approval.
- Telemetry still comes from the browser (the server re-derives hit, distance and footing). Scores are AI-estimated. This is **not** anti-cheat, and a person can make several guests.
