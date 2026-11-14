# Team instructions

## Open the app

The preview on the development computer is http://127.0.0.1:5173.

To restart later, open PowerShell in the project folder and run `npm.cmd run dev`. After downloading a fresh copy of the repository, run `npm.cmd install` once first. Keep that terminal open while playing.

Repository: https://github.com/Kx007-del/faze-run-it-back (private).

This release includes one rooftop arena. Fortnite-inspired and Valorant-inspired modes have not been built yet.

## Keep work separate

1. Pull the latest main branch before starting a task.
2. Work only in your assigned agent folder from AGENTS.md.
3. Do not change shared types, root package files, dependencies, assets or another agent's files without coordination with the lead.
4. Run relevant checks and update your folder's HANDOFF.md with completed changes, checks and known limits.
5. Send your work to the integration lead. The lead owns shared integration, commits, conflict resolution and pushes.

If a human teammate uses a separate clone, use a branch named `agent/gameplay`, `agent/challenges` or `agent/social`. Do not run multiple Git checkout operations in the same shared working folder.

## What the user needs to do

- Keep the project folder and downloaded brand pack available.
- Use the running local preview to test gameplay.
- For a two-player demo on one computer, open the invitation in a second tab and change the player name there.
- Give feedback on controls, challenge difficulty and branding.
- Do not paste secrets into chat. The app does not require any API keys.
- Add human collaborators through GitHub's repository settings if needed; the coding agents here work locally and do not need separate GitHub accounts.
- Before presenting, use the Original preset, check audio/video requirements of the event separately, and rehearse the actual two-player flow. Video export is not part of this version.

## Follow-up priorities

1. Tune movement and shot feel based on player feedback.
2. Add a curated reference clip with known usage permission.
3. Export the squad replay as one video.
4. Add the next game-inspired mode only after keeping the complete relay working.
