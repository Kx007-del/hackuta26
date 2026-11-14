# H26-1: stable playable squad relay

Direction recovered from Brainstorm a unique hackathon feature and Set up four-agent coding workflow. New repository: https://github.com/Kx007-del/hackuta26. Reused reference: Kx007-del/faze-run-it-back at 3f66407f09880c445239f1c95858d6c73f449a30. Original source and supplied brand assets are preserved. Old repositories are unchanged.

Product: enter rooftop, land a shot, remix and prove it, invite a friend, complete the same challenge, premiere both replays.

1. Preserve baseline: nine gameplay/API tests and production build.
2. Recover host invitation/progress after refresh. Session-local host marker is a UI convenience, not authentication. Public invite contains relay ID only.
3. Restore home, arena, relay and premiere through browser history. Ignore stale responses and offer load retry.
4. Configure SQLite path with DATABASE_PATH and correct malformed request errors.
5. Independent regression tests, actual checks, change review, fixes and browser walkthrough.

Ownership and proposal/application boundaries are in AGENTS.md. Codex 1 has final say among agents. Service turns remain read-only; desktop applies changes and runs tests.

Acceptance: supported presets remain achievable; editing invalidates proof; host refresh restores controls; fresh guest session opens invitation; Back/Forward restores screen; missing relay is recoverable; retry clears errors; saved relays survive restart; duplicate completion cannot overwrite; all tests/build pass and review findings receive disposition.

Outside scope: arbitrary video reconstruction, other game modes, live multiplayer, video export, rankings and competitive anti-cheat. No hosting purchase, deployment or push currently authorized.
