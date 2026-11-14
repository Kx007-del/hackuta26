claude-2 H26-2 exact test packet. These are proposed tests only: nothing has been applied or executed. Code is in the two preceding handoffs (PART 1 + PART 2 = tests/h26-2.test.ts, about 9.7k chars). It only touches my own test path. Base SHA: whatever the desktop supplies when it applies the file. I have not seen one.

COMMANDS (desktop picks the one matching the existing harness):
- node:test via tsx: `npx tsx --test tests/h26-2.test.ts`
- vitest: change line 3's module to 'vitest' (test/beforeEach/afterEach names are identical), then `npx vitest run tests/h26-2.test.ts`
- Then the repo's full test script plus typecheck/build. Needs Node >= 20.1 (readdirSync recursive, global fetch, closeAllConnections).

ASSUMPTIONS TO CONFIRM WHEN APPLYING:
1. The pure functions and types are exported from ../packages/challenges. If not, fix the import path only.
2. Upload success returns 200/201 with the ClipReference either as the body or as {clip}. Both are handled.
3. Rejections are any 4xx. Oversize is 413 or a connection reset.
4. Missing arenaId, duplicate numeric query params and Content-Encoding gzip are rejected.
5. Exactly 50*1024*1024 bytes is accepted. If the implementation uses 50e6, that boundary test fails by design: it's a real mismatch with the MiB contract.
6. Content-Range on a clamped end (bytes=0-N+50) follows RFC 9110 (206 clamped). bytes=9-2 is treated as malformed and returns 200.
7. The no-residue checks compare non-empty files under the temp dir before and after. This tolerates an eagerly created empty index or directories.

COVERED: mechanicSatisfied positive/negative/boundary per preset (.35 passes, .350001 fails; wall-edit needs edited===true; dash-peek needs a dash; malformed counts/speed fail; rooftop legacy unchanged). validConfig: all 7 valid combos, cross-game presets, distance, schemaVersion, referenceClipId regex edges, non-objects, missing arenaId rejected (no migration). sameConfig: no-op equal, every field including clip id differs. Clip API: MP4/WebM/MOV fake signatures, persistence across restart, MIME and box-size signature rejection, 'constructor' MIME and arenaId, empty body, gzip, bad/empty/array/out-of-order trim and duration, 50 MiB boundary, chunked upload, abort cleanup, full and partial range responses, malformed and multi-range returning 200, 416 with 'bytes */N', bad ids.

NOT COVERED: these need source or layout I don't have, or are too slow or flaky:
- the 512 MiB quota
- the two-concurrent-uploads cap
- the 60s receive deadline
- corrupted metadata or media-size mismatch (depends on the storage layout)
- API-level mechanicState normalization (unknown keys, counts 0..30, speed 0..100) — needs codex-2's proof-normalization API source. The pure mechanicSatisfied has no upper bounds, so I deliberately didn't assert them there.
- invite/restart preservation of the config, remix proof invalidation in relay flow, two-player flow and replays
- toolkit-only asset scan

I will add these as a second bounded test file once codex-2/codex-3 source packets and layout arrive. Live-browser evidence remains with the browser agent.