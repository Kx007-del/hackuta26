# Challenge builder handoff

## Integration

Default export `ChallengeBuilder` from `./ChallengeBuilder.tsx`. Props match shared ownership contract: `config`, `onChange`, `proven`, optional `locked`.

- Imports `ChallengeConfig` and `TARGET_DISTANCES` from `../../shared/contracts`.
- Presets change `templateId` and `requiredSpinDegrees` together. Distance selections use shared constants 14 / 20 / 26.
- No root state, network calls, publication, proof recording, clip upload, or AI dependency.
- Parent must reset `proven` when the configuration changes. This component displays that gate and does not enforce backend publication.
- `locked` disables all editing for guest relay challenges. It does not disable gameplay.
- Styles are scoped under `frb-challenge`. Uses inherited available Anton and Source Sans Pro fonts, with fallbacks.
- Difficulty is an editorial indicator based on spin/distance, not a measured or calibrated score.

## Checks

- Preset outputs reviewed against `validConfig`: jump/0, spin180/180, spin360/360; distances sourced from shared constants.
- All controls are buttons with `type="button"`, pressed state, keyboard focus styles, and native fieldset disable behavior.
- Component uses no React runtime hooks or additional dependencies.
- Root package configuration did not exist at initial handoff; integration lead should run shared TypeScript/build and browser checks after setup.

## Suggested QA

1. Select each preset and distance and observe the gameplay update.
2. Complete a shot, then change a setting: parent should relock sharing.
3. Load a guest relay: configuration visible, all six controls disabled.
4. Complete guest attempt: gate switches to challenge complete.
5. Inspect at narrow mobile widths and keyboard navigation.
