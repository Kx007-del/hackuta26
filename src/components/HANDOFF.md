# Clip interface implementation helper

Implemented `EnvironmentPicker` and `ClipWorkbench` with local scoped styling. This is an implementation helper's work, not a subscription-profile execution claim.

- Picker displays three game names as text (no game logos), distinct CSS scene motifs and ARENAS metadata. Selection resets through configForArena and drops any prior reference. Locked relays cannot switch game.
- Workbench supports file/drop selection, MP4/WebM/MOV validation, 50 MB and decoded 0.25–90 second limits, inline video, selected start/end, selected-moment playback and raw upload to the agreed native endpoint.
- New upload saves referenceClipId through onChange, so the integration's existing proof invalidation applies. Locked mode fetches saved metadata/media for guests and persisted relay reopening.
- Fetches cancel/ignore stale work. Browser object URLs are revoked, duplicate uploads locked, aborted requests don't write late UI. Clip selection cancellation preserves the existing saved reference.
- Only Anton/Source font families and `/brand/logo.png` are used by these components. CSS scene motifs contain no third-party marks.
- Integration: render both components above the live arena. Props are `{config,onChange,locked?}`. Workbench also works in a read-only premiere/reference panel if desired.

Validation and browser walkthrough are the integrator's responsibility after endpoint and page integration. Browser codec support is checked by video decoding; unsupported MOV codecs surface an actionable error. Clip recreation is explicitly guided, not automatic map reconstruction.
