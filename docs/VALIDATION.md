# Validation — first playable release

## Automated checks

- TypeScript check and production bundle pass.
- Production server smoke checks pass: home page serves built assets, health returns OK, and client routes return the app.
- Nine tests pass: six gameplay-rule tests and three API/persistence tests.
- Gameplay tests exercise airborne requirements, all supported target distances, 180/360 feasibility, insufficient spin, oscillation, and missed aim.
- API tests exercise the actual HTTP lifecycle, frozen settings, duplicate completion, overwrite rejection, invalid submissions and SQLite persistence across restart.

## Browser checks completed

- Home page loads with supplied logo and web fonts.
- A real airborne shot unlocks sharing through the normal game UI.
- Creating a new challenge resets gameplay.
- Changing a proven 14m challenge to 20m disables sharing until the new shot is completed.
- A completed 20m shot creates an invitation.
- A second browser tab loads that invitation with challenge controls locked.
- The second player completes the actual shot, submits it, and unlocks the premiere.
- Both recorded attempts play sequentially with player credits.
- No console errors or warnings were captured in the tested teammate session.

## Limits of verification

Desktop Chrome was tested on this machine. Mobile gameplay and cross-browser parity are not established. The spin presets have gameplay-rule feasibility tests; the end-to-end browser relay was tested with the basic jump preset at 14m and 20m. Hosting, internet sharing, video export, secure competition verification and external clip reconstruction are outside this release.
