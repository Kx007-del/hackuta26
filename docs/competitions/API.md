# Hosted competitions — historical Phase 1 contract

This is the original implementation handoff, not the current release status. The public showcase now includes event screens, optional accounts and a separate public host simulation. See the root README and `docs/submission/READINESS.md` for the verified current build. Historical pending-deployment and no-account statements below describe that earlier phase.

Backend candidate only. **Render update pending.** No frontend changes in this phase.
Types: `shared/competitions.ts`; HTTP: `packages/competitions/server.ts`;
SQLite/ranking: `packages/competitions/store.ts`. All examples below are fictional.

## Four separate routes for Codex 3

Keep supplied FaZe branding, fixed reference video, current playable challenge and player progress.
Implement four labeled tabs as separate routes/views, not a long page containing all four:

| Tab | Route | Content / API |
| --- | --- | --- |
| Play (default) | `/` (optional `/play` alias) | Existing reference/game; existing ordinary play/progression behavior. Explicit event context when starting an event attempt. |
| Leaderboards | `/leaderboards` | Existing `/api/progression/leaderboard?board=score\|xp\|streak`, profile, XP, streaks, badges. Preserve global progress and its existing example labels. |
| Join Events | `/events`, `/events/:code` | Browse/search published upcoming/live events. Enter code or parse event URL. Show rules, UTC/local dates, attempt limit, scoring/ties, demonstration prize notice and **event-only** leaderboard before joining. Public read requires no cookie. |
| Host an Event | `/host`, `/host/events/:id` | Hosting explanation and no-charge preview; authenticated enrollment, draft creation/editing, own events, publish/close, analytics, suspicious-results review/audit, finalize. Server always enforces ownership. |

Support direct links, reloads, Back/Forward, active-tab indication and usable mobile navigation.
Preserve query/event context across history without starting attempts on mount/refresh.
Production Express already serves the SPA fallback for non-API routes; UI routing is still Codex 3 work.
Render acceptance must test **each of the four routes directly and after refresh**, history navigation,
event joining, organizer restrictions and the full real-attempt lifecycle. Never mix global/event standings.

## Authentication and safety boundaries

Reuse the existing random HttpOnly `rib_guest` cookie; server stores its token hash. Same display
name, public code, submitted player ID or guessed event UUID never grants management rights.
`GET /api/progression/me` is read-only. If profile is null, intentionally submit
`POST /api/progression/me/name` with `{"name":"Example Host"}` to create the existing browser guest.
Use same-origin requests with cookies (`credentials: 'same-origin'`); do not copy/read/store cookie tokens.
`POST /api/organizer/enroll` binds demonstration hosting to that server-resolved guest.
There is no verified-creator approval, account recovery or cross-device login in this version.
Losing the cookie/database loses organizer access. Fresh guest identities can evade per-identity limits:
this is a demonstration foundation, not verified identity or tournament anti-cheat.

All new management/join/reservation mutations require JSON and reject cross-site/foreign Origin requests.
Private/identity responses are `no-store`. Display descriptions/review text as escaped text, never HTML.
No payments, fees, prize custody, payouts or actual prizes. Package selection is **demonstration/no charge**;
`/api/hosting/preview` has `checkout:false`, not a checkout session. Arbitrary uploaded clips do not become
playable environments. Only `fortnite-hillside-v1`, version `hillside-2026-11-15-v1`, is approved.

## Rules, timing, states and attempts

Dates must be real ISO UTC timestamps ending in `Z`, normalized to milliseconds. Convert datetime inputs
to UTC explicitly and show timezone labels. End follows start, maximum 90 days. Limits: 1–50 attempts,
100 events per organizer, 5,000 events total, 1,000 entrants/event; browse returns up to 100 events.

`draft → published → closed → finalized`. Only draft rules can change. Publication freezes **all** rules,
including title, text, challenge version, dates, attempt limit, scoring, ties and prize text. A published
event is effectively closed at its end even without a scheduled job. Organizer may close early.
Finalization requires closed state, explicit review acknowledgment and zero pending suspicious results;
it snapshots standings/analytics and forbids subsequent moderation. No reopen/delete endpoint.
Draft changes/transitions require the current integer `version`; stale versions return 409. Refresh first.
These transitions do not charge, announce awards or fulfill prizes.

Joining upcoming published events is allowed. Actual reservations/results require server time
**start inclusive, end exclusive**: `startsAt <= serverNow < endsAt`. A result must also arrive before
its ticket expiry, `min(startedAt + 5 minutes, endsAt)`. Exactly at end/expiry is rejected.
At least 1.5 seconds must pass on the server before scoring. Server time, not browser clock, decides.
Each reservation immediately consumes one attempt, including abandoned, invalid or expired attempts.
Only one unfinished unexpired reservation per entrant/event. No refunds in this version.
Closing prevents new/uncompleted submissions; exact retries of already completed results remain readable.

Use a stable random UUID per creation (`Idempotency-Key`) and per played attempt (`attemptId`).
Retries reuse these IDs, including after network timeout. Never generate a fresh ID just to retry.
Creation replay with different initial rules returns 409. Reservation retries return the original ticket
without consuming another slot (even after closure). Result retries require identical parsed telemetry;
changed payload returns 409. SQLite immediate transactions/unique keys serialize independent processes.

## Endpoints

JSON errors are `{"error":"..."}`. 400 invalid input; 401 no guest; 403 wrong owner/entrant/origin;
404 absent/private draft; 409 state/version/timing/limits/idempotency conflict; 415 non-JSON mutation;
429 storage/rate cap; 500 transient internal failure (retry the same ID). Existing scoring rate limit is
30 requests/minute/IP, including retries. Handle 429 without reserving a new attempt.

| Method/path | Request / response |
| --- | --- |
| GET `/api/competitions/meta` | Templates, hosting notice/packages, auth limitations, persistence and timing boundaries. |
| GET `/api/hosting/preview` | `{demonstration:true, charged:false, notice, packages:[{id,label,demonstration:true,checkout:false,charge:"No charge"}]}` |
| GET `/api/organizer/me` | Auth required. `{profile:{id,name},hosting:null\|{package},demonstration:true,notice}` |
| POST `/api/organizer/enroll` | `{package:"creator-demo",acknowledgeDemo:true}`. Packages: community-demo, creator-demo, sponsor-demo. Returns `{organizer:true,package,demonstration:true,charged:false,notice}`. |
| GET `/api/organizer/events` | Owner only: `{events:CompetitionView[],persistence}`. |
| POST `/api/organizer/events` | Full rules object below, required Idempotency-Key (8–64 safe alphanumeric/underscore/hyphen chars). 201 `{event:CompetitionView}`. |
| GET `/api/organizer/events/:id` | Owner only `{event}`. |
| PUT `/api/organizer/events/:id` | `{version:1,rules:{...fullRules}}`; owner/draft only. `{event}`. |
| POST `/api/organizer/events/:id/publish` or `/close` | `{version:1}` → `{event}`. |
| POST `/api/organizer/events/:id/finalize` | `{version:3,reviewAcknowledged:true}` → `{event}`. |
| GET `/api/organizer/events/:id/results` | Private `{results:[{...CompetitionReceipt,entrantId,flags:string[]}]}` for moderation. |
| POST `/api/organizer/events/:id/results/:resultId/review` | `{decision:"flag"\|"approve"\|"exclude",reason:"Required nonblank explanation"}` → `{result:CompetitionReceipt}`. Audit is append-only; approval cannot override intrinsic ineligibility. |
| GET `/api/organizer/events/:id/audit` | Private `{audit:[{id,actorId,action,details,at}]}`; creation/edit/transition/automatic flag/review records. |
| GET `/api/organizer/events/:id/analytics` | Private `{analytics,definitions}`; example below. |
| GET `/api/competitions?search=Lantern` | Public `{events:CompetitionView[],example:false,persistence}`; title substring, only upcoming/live published. |
| GET `/api/competitions/:code` | Public `{event}`; codes case-insensitive; closed/finalized pages remain readable. |
| GET `/api/competitions/:code/leaderboard?offset=0` | `{eventId,state,finalized,tieBreaker,total,entries:CompetitionStanding[],example:false,storageDurable:false}`; 100/page, offset 0–1000. |
| POST `/api/competitions/:id/join` | Empty `{}`; uses cookie identity. `{joined:true,eventId,entrantId,replayed}`. |
| GET `/api/competitions/:id/me` | Own `{joined,usedAttempts,attemptLimit,results:CompetitionReceipt[]}`. |
| POST `/api/competitions/:id/attempts` | `{attemptId:"client-generated-uuid"}` → 201 `{attempt:{id,eventId,attemptId,startedAt,expiresAt,completed,consumesAttempt:true,challengeTemplate,challengeVersion,replayed}}`. |
| GET `/api/competition-examples` | `{example:true,readOnly:true,events:[...]}`. Separate deterministic fictional fixtures, never DB records. |

Public code resolves an event view; management/join/reservation use its UUID `id`. Do not confuse codes
with authorization. No delete/payments/payout endpoint exists. Unknown rule fields (including score,
owner, fees or billing amounts) are rejected. Public event pages must always render `hostingNotice`
and `prizeNotice` next to organizer-supplied prize text so it cannot imply a real award.

## Example rules and responses (fictional)

Creation request:

```json
{
  "title": "Example Lantern Session",
  "description": "Fictional hosting demonstration; not a real sponsored competition.",
  "challengeTemplate": "fortnite-hillside-v1",
  "startsAt": "2027-06-01T12:00:00.000Z",
  "endsAt": "2027-06-01T13:00:00.000Z",
  "attemptLimit": 3,
  "scoring": {"method": "server-game-data-v1", "requireHit": false},
  "tieBreaker": "score-earliest-v1",
  "prizeDescription": "Example digital ribbon only. No real prize."
}
```

`CompetitionView` includes those fields plus these response fields (IDs are illustrative):

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "code": "AB12CD34EF56", "publicPath": "/events/AB12CD34EF56",
  "state": "draft", "version": 1, "rulesFrozen": false,
  "challengeVersion": "hillside-2026-11-15-v1", "publishedAt": null,
  "finalizedAt": null, "example": false, "storageDurable": false,
  "hostingNotice": "Demonstration only — no charge, entry fees, real prizes, payment collection or payouts.",
  "prizeNotice": "Example prize description only. No real prize is offered or fulfilled."
}
```

`example:false` means a user-created record, **not** a paid/real-prize competition. Curated fixtures
always use `example:true`, `readOnly:true`, `example-*` IDs. Do not merge them into the real browse,
analytics, profiles or global/event leaderboards. Label them “Fictional example — cannot join”.

## Submitting actual gameplay results

Reserve **before** enabling the event run. Capture the existing single-shot telemetry from the same
curated playable challenge. POST `/api/showcase/score` with no clip/body and these headers:

```text
x-competition-id: <event UUID>
x-competition-attempt: <server reservation id>
x-attempt-id: <same client attemptId used to reserve>
x-score-telemetry: <base64url(JSON.stringify(existing AttemptTelemetry))>
x-score-ai: no
```

Do not post a client score/hit/XP or replay an unrelated global scored result. Existing strict telemetry
validation and server scene geometry derive hit, distance, footing and weighted 0–100 score using
`scoreTelemetry` + `blendScore(..., null, derivedHit)` (miss penalty). Event path never calls Gemini,
never awards XP/streaks/badges or writes global standings. Ordinary play continues its existing behavior.
Same telemetry request copied to another ticket is flagged within that event; client/server duration
mismatch >3 seconds is also flagged. This detects limited anomalies; **telemetry is client-reported**,
not a server-authoritative simulation or proof of honest play. No anti-cheat guarantee.

The response retains existing score/telemetry/AI fields and adds this receipt:

```json
{
  "competition": {
    "eventId": "11111111-1111-4111-8111-111111111111",
    "attemptId": "22222222-2222-4222-8222-222222222222",
    "resultId": "33333333-3333-4333-8333-333333333333",
    "score": 74, "hit": false, "eligible": true, "ineligibleReason": null,
    "review": "pending", "submittedAt": "2027-06-01T12:01:02.000Z",
    "replayed": false, "globalXpAwarded": 0
  }
}
```

Player states: not joined → upcoming/joined → ready → reserving → playing (ticket expiry visible) →
submitting → accepted / rule-ineligible / pending review / excluded. Network uncertainty means
**retry the same ID/payload**; 409 expiry/closed/limit means stop, keep the receipt/used-attempt count.
Refresh `/me` and leaderboard after acceptance/review. `eligible` is intrinsic rule eligibility;
only eligible + `clear`/`approved` is rankable. Pending/excluded must never display as a final rank.
Expose remaining attempts including consumed abandoned reservations. Do not auto-reserve on route load.

Per entrant choose its best eligible clear/approved result. Order: score descending; optional hit-first
when `score-hit-earliest-v1`; server completion timestamp ascending; entrant UUID ascending. For the
same entrant's otherwise identical results, result UUID resolves ties. All ranks are sequential, not
shared. Server completion time is not client performance time. Finalization freezes the full snapshot.

Analytics example: `{participants:4,startedAttempts:6,completedAttempts:3,eligibleAttempts:2,
pendingReview:1,excludedAttempts:0,completionRate:0.5}`. Participants = joined guest identities,
started = reservations (abandoned/expired included), completed = validated scored receipts (even
ineligible/excluded), eligible = intrinsic eligibility + clear/approved. Completion rate = completed /
started, zero when none; **not** percent of joined people finishing. Pending/excluded are moderation counts.

## Persistence and release gates

Inspected existing Render service `srv-dbsf9ujl550s738a7seg` in the confirmed My Workspace:
free plan, integration branch `build/five-agent-h26`, auto-deploy off. No infrastructure was changed.
Live progression reports `storageDurable:false`. Free web-service filesystem is ephemeral; Render
persistent disks require paid compute ([Render disk docs](https://render.com/docs/disks)). Thus events,
results, audit and guest ownership **are not durable across Render restart/spin-down/redeployment**.
A future durable store/backup/identity plan requires separate approval; do not provision paid resources.

Additive schema v1 creates only `competition_*` tables/indexes in the existing `DATABASE_PATH`
(default `data/relays.sqlite`), alongside untouched progression/relay tables. It uses WAL, immediate
transactions and a schema version; future versions fail rather than rewrite. Reopening the **same
surviving SQLite file** preserves records, ownership, idempotency, audit and global XP. This local
restart property is not a Render durability claim. Keep databases/WAL/backups out of Git.

Revision reconciliation at phase start: latest integration `172ac54726cc31fe2f2731aac7f90d620ecda5e1`
(merged community progression PR #29); live health/deploy is
`2a5f71b723bb66fe9e00bd9eb59f622e6df16f24` (`dep-dbsopqs9v7es73b7tvig`). Live history contains
unreviewed PR #31 character work plus later leaderboard edits. Both histories/files were preserved;
this branch starts from integration and imports none of those live-only changes. Before combined
release, recheck both refs and review/disposition any needed live-only non-character fixes explicitly;
never deploy an unreviewed live branch or overwrite another worktree. PR #31 stays excluded.

Codex 2 alone coordinates the combined release. No dispatch/relay, frontend deployment or merge now.
After Codex 3 UI, Claude 2 independent tests and Claude 1 exact-final-candidate review: prepare one
combined RC, run all app/relay/build/required GitHub checks, merge approved integration, deploy **existing**
service without plan/storage changes. Verify `/api/health` exact merged SHA plus all four routes,
history, event creation/publication, actual joined gameplay result, isolated leaderboard, unauthorized
management rejection and closure. Post SHA/evidence/limitations. Until then: **Render update pending**.
