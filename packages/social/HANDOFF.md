# Social API handoff

Exports `registerApi(app, {databasePath?})` from `server.ts`; returns a database cleanup function. Root owns JSON parsing (`express.json({limit:'2mb'})`), `/api/health`, static files, and UI routes. Default SQLite database is `data/relays.sqlite`, relative to process working directory. Use a persistent directory for hosting.

Client exports `createRelay({hostName,hostAttempt,parentChallengeId?})`, `getRelay(id)`, `completeRelay(id,{guestName,guestAttempt})`, and `ApiError` with numeric `status`. All functions return `Promise<Relay>` directly, without an envelope. Errors return `{error:string}`.

`parentChallengeId` references an existing relay's ID, tracking the remix lineage. Published config is immutable. The guest must use the same config. Duplicate exact completion is idempotent; replacing a completed attempt is rejected with 409.

Attempt completion is client-reported, not secure competitive verification. Server checks success/hit/airborne flags, required rotation, config validity, timing (maximum 60 seconds), replay length (2–2000 frames), finite bounded transforms, and names (1–32 trimmed characters). Replay timestamps and shot timestamp are milliseconds. No recording upload or video export: root renders the recorded transforms through gameplay's replay component and assembles the sequential premiere.

Checks: `node --import tsx --test packages/social/server.test.ts` tests the HTTP flow, immutable config, duplicate completion/overwrite, invalid replays, missing IDs, and persistence across restart. Dependencies are root-owned.

Validation completed: all 3 API tests passed. Project type check reported no social-package errors; gameplay and app-shell work was still in progress at check time.
