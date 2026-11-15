# Claude 2 — H26-3 standalone UI-wiring and runtime-config tests

This was a standalone human-directed assignment on Windows 2 using claude-opus-5-5. It is not a retry of relay task db193fec. The global relay was not resumed. No production code was edited, and nothing was merged or deployed.

## Exact SHAs

- **Tested implementation:** `c7f59fd8d18f5757a58445f83cfdb1edc6f5fb30`. This is Codex 2's `work/codex-2/h26-3-runtime-standalone`, one commit on top of candidate `work/codex-1/h26-3-plan` at `fdb39ce`.
- **Frontend code:** `src/` and `packages/` are identical at `74f0707`, `fdb39ce` and `c7f59fd`. Codex 2's commit touches only `server/`.
- **This branch:** `work/claude-2/h26-3-standalone-tests` = `c7f59fd` plus this commit. It changes only `tests/` and this role folder.

## Failed relay task db193fec: the blocker

- **Run details:** branch `work/claude-2/db193fec…`, base `74f0707`. The provider finished normally: 21 turns, modelUsage exclusively `claude-opus-5-5`, `is_error=false`.
- **Its own results:** `npm test` 73/73 and `npm run build` passed.
- **What failed:** its handoff said `npm run team:test` was "not run (permission denied)". The worker's allowlist is limited to `npm test`, `npm run build` and `npm run check`, and its blocker check treats any reply containing "permission denied" as a blocker.
- **Consequence:** the worker recorded the task as failed, set the queue to blocked, and published nothing.
- **Preserved:** the partial `tests/h26-3-ui-wiring.test.ts`, the local branch, the logs (also copied under `.team-local/preserved/db193fec`) and the queue failure record are all kept unchanged. No credentials appear in the logs that were inspected.
- **Suggested fix for Codex 1:** either allow `Bash(npm run team:test)` for test tasks, or narrow the blocker check so that an optional check reported as not run does not fail a completed task. This is a suggestion only; I did not change the relay.

## New tests

### `tests/h26-3-ui-wiring.test.ts` (8 tests)

This is the db193fec draft, now reviewed and verified. It parses the TypeScript source rather than importing it, so no React/CSS/Three/server code loads into Node. It checks:

- **Guide data flow:** App → guide component → `practiceGuide` uses `replayAttempt?.config ?? config`. The guide appears exactly once inside `.play-layout`, outside the clipped arena, and not in a premiere branch.
- **Topbar:** shows the displayed config's arena.
- **Guide markup:** a named landmark, then a heading, then an `<ol>` of steps, then a labelled list of controls, with no completion indicators.
- **GameArena objective:** the distance comes from `replay?.config ?? config`.
- **Tactical Q/E hint:** says "turn".
- **Playbook copy:** the old generic text is removed.
- **Fixtures:** equivalent wiring passes and defective wiring is rejected.

### `tests/h26-3-runtime-config.test.ts` (10 tests)

These are derived from the frozen plan, not from the implementation. Seven unit tests import only `server/runtime-config.ts`:

- **Purity:** the module reads no `process` and has no side-effect imports.
- **Defaults:** `127.0.0.1`, port `5173`, `commit: null`, and exactly those three keys.
- **Host:** `0.0.0.0` only when `RENDER` is exactly `true`. A trimmed, non-blank `HOST` takes precedence.
- **Accepted PORT values:**
  - blank or unset defaults to 5173
  - surrounding whitespace is trimmed
  - 0 and 65535 are accepted
  - leading zeros are decimal (`0080` gives 80)
- **Rejected PORT values:**
  - `+`, `-`, exponent, hex, octal and binary forms
  - decimals, embedded spaces, `NaN` and `Infinity`
  - full-width and Arabic-Indic digits
  - 65536 and larger, including huge values
  - every rejection gives the same fixed message, which never echoes the input
- **Commit:**
  - accepted: a trimmed, case-insensitive 40-hex value, returned in lowercase
  - null: 39 or 41 characters, non-hex, 64-hex, inner whitespace, `0x` prefix, multiple lines
- **No leakage:** other environment variables, including secret-looking ones, never appear in the result.

Three bootstrap tests start `server/index.ts` as a separate Node process with throwaway storage, so the unit tests never import it:

- **Invalid PORT:** the process exits non-zero before creating the relay database or clip folder, and does not echo the input.
- **Health with a commit:** `GET /api/health` returns `{ok: true, service: 'run-it-back', commit}` with the commit normalized to lowercase. HOST and PORT come from the runtime config, and unknown API routes still return 404.
- **Health without a valid commit:** an invalid `RENDER_GIT_COMMIT` gives `commit: null`.

## Commands and results at c7f59fd + these tests

- `npm test`: 83 tests, 83 pass, 0 fail (65 existing + 8 UI-wiring + 10 runtime).
- `npm run team:test`: 9 tests, 9 pass. `npm run team` does not exist; the only team scripts are `team:test` and `team:status`.
- `npm run build`: `tsc --noEmit` is clean and the Vite production build succeeds.

## Independence check (mutation testing)

Each test file was also run against deliberately broken copies of the source, inside the git-ignored `.team-local`. The real files were never modified. In every case the unmodified control passed and the broken copy was caught by the intended test.

- **UI wiring, 10 mutations, all caught:**
  - guide fed `config` instead of the displayed config
  - guide rendered twice
  - topbar showing the live arena
  - `playConfig` replaced by `config`
  - objective using `config.targetDistance`
  - tactical hint changed to "spin"
  - steps not in an ordered list
  - a ✓ added to steps
  - guide landmark unlabelled
  - playbook copy restored
- **Runtime, 13 mutations, all caught:**
  - `RENDER` matched case-insensitively
  - `HOST` not trimmed
  - `PORT` not trimmed
  - `PORT` digit-only check removed
  - upper bound raised to 65536
  - error message echoes the input
  - commit not lowercased
  - commit not trimmed
  - commit allowed to be 7–40 characters
  - module reads `process.env`
  - health response drops `commit`
  - health response renames `service`
  - config resolved after storage setup (caught by the bootstrap test)

While doing this I found and fixed a bug in my own bootstrap test: a regressed server that wrongly accepted `+N` kept running after the test ended. The test now uses a free port and always terminates the server after 20 seconds. A final check found no leftover server processes.

## Limitations

- **UI checks are static.** They do not render React or exercise replay state changes, and I ran no browser checks. The desktop browser evidence in `docs/team/H26-3-BROWSER-QA.md` is Codex 1's, not mine.
- **Premiere detection** finds the `'premiere'` string literal inside a condition.
- **Not covered:** tactical telemetry text and the hidden jump button.
- **Startup speed:** the bootstrap tests spawn real processes, which adds a few seconds and needs the local loopback network.
- **Not checked:** the combined frontend + backend candidate after Codex 1 integrates, and any hosted or Render behavior. The live URL is not claimed to contain these changes.
- **No approval implied:** nothing here approves integration, a main merge or a deployment.
