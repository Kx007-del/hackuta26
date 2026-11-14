# H26-2 browser QA

Dedicated browser-testing helper, separate from the five signed-in subscription profiles. The completed gameplay pass used Chrome DOM controls only; no application state, successful attempt, or relay was injected through JavaScript or APIs.

## Independently exercised by the browser agent

- Three environment choices render. Switching changes the game name, objective, weapon silhouette, scenery and mechanics. Screenshots show the military skyline, bright low-poly island, and pastel tactical courtyard as visibly distinct environments.
- COD: Keyboard Start → Align → Fire while grounded failed with **Fire while airborne** and kept sharing locked. Retry → Jump → Align → Fire succeeded and unlocked sharing.
- Valorant precision: Keyboard Start → Align → Fire while stationary and grounded succeeded.
- Valorant dash preset: firing without dashing failed with **Dash from behind cover into the lane first** and kept sharing locked. Retry → Dash → observed **Dash cleared. Stop and fire.** → Align → Fire succeeded.
- Fortnite: airborne shot without building failed with **Place the build first** and kept sharing locked.
- Fortnite ramp placement created the build and showed **Walk onto the ramp, then jump**. Ramp completion with a held movement key was not attempted by this DOM-only helper.
- Fortnite wall edit: Build wall → Edit wall showed **Wall edited** and **Jump on the near side and shoot through the opening**. Jump → Align → Fire succeeded and unlocked sharing.
- Changing a proven 14 m challenge to 20 m locked sharing again.
- Refresh of the unpublished Fortnite workspace preserved the environment through `?screen=arena&arena=buildyard-v1`. Unpublished preset/distance/attempt reset, consistent with the displayed reset notice.
- No error/warning entries were observed in the inspected browser log sample during the initial COD checks.

All successes used the displayed practice alignment helper plus real required actions. The helper does not claim independent accuracy without assistance.

## Brand finding and retest

Computed body font was **Source**, heading font **Anton**, and all observed app image source URLs were `/brand/logo.png`.

The first computed-font audit found **monospace** on `.brand-sub`, `.edition`, `.eyebrow`, `.arena-topbar`, `.play-caption`, the playbook and player-name labels, and the footer. This was sent to the coordinator as a concrete violation of the user’s toolkit-only font requirement. The coordinator corrected the remaining CSS shorthand declarations. After a full reload, the computed font set across every #root element was exactly **Source** and **Anton**, with no remaining non-toolkit font nodes. The brand finding is **closed**. All three screenshots were refreshed after the fix.

## Root coordinator checks (reported separately)

The root coordinator reported its independent in-app-browser checks:

- Invalid video rejected.
- Actual playable MP4 test fixture uploaded with a 0.5–2.5-second selected segment.
- Reference clip retained after host refresh and visible to an independent guest.
- Actual two-player tactical relay completed into the premiere.
- Remix cleared proof.
- Ramp gameplay succeeded after Build ramp → held W for 900 ms through the documented browser key API → Jump → Align → Fire.

Those checks were performed by the root coordinator, not this Chrome helper. The clip fixture was a generated four-second test pattern, not COD/Fortnite/Valorant footage.

## Screenshots

- `docs/team/h26-2-qa-rooftop.jpg`
- `docs/team/h26-2-qa-buildyard.jpg`
- `docs/team/h26-2-qa-tactical.jpg`

Captured at a temporary desktop viewport of 1280×900. The viewport override was successfully reset at the end of the completed QA session. The final Chrome preview was left open as a deliverable.

## Earlier interrupted pass

The first child turn had no available in-app browser. Chrome file chooser setFiles was blocked because the extension lacked file-URL access. No extension permission was changed. Native fallback then triggered a URL-confidence policy stop. That turn ended immediately. A new, explicitly assigned QA turn then completed the DOM-only game tests above; uploads remained with root’s in-app browser.

## Limits

This helper did not upload files, complete a clip-attached relay, test real COD/Fortnite/Valorant source footage, test 180/360 timing, verify every distance in browser, or exercise mobile touch gameplay. It verified the initial game-specific objectives at 14 m with practice alignment and negative gates described above. The root’s reported automated checks are separate evidence.


## Final H26-2 root additions

After the independent helper pass, root added same-tab draft configuration recovery: saved clip references, presets and distance now survive refresh, while gameplay proof still resets. Root verified a saved Buildyard reference remained visible after both refresh and an actual server restart. The earlier helper observation about unpublished settings resetting describes the pre-improvement build. New Challenge intentionally starts fresh for the selected mode.

Root also restarted the latest server and confirmed: historical H26-1 rooftop relay returned200 with explicit rooftop-v1; clip-linked tactical relay returned200 completed; linked clip metadata returned200 and media Range returned206 with bytes0–31/380356. This is actual bootstrap/storage wiring evidence, supplementing synthetic clipLookup tests.
