# Public host showcase demo

Human explicitly switched from account-owned event setup to a dummy Host an Event page for feature presentation.
Branch `work/codex-2/host-showcase-demo`, from `019d14f`. No account creation/sign-in/ownership transfer required.

`/host/demo` is a public, deterministic, in-memory simulation under the existing Host an Event tab.
`/host` includes a prominent Explore host demo link above the normal authenticated flows. Existing FaZe
styling, real event ownership, gameplay and standings are preserved.

Features: demo host workspace, published sample + draft, create/edit/publish with frozen rules, close and
finalize, fictional best-per-player leaderboard, pending-entry approval/exclusion with reasons, derived
analytics and audit timeline, public-page preview, Reset. One refresh restores fixtures. All events, players,
results, timestamps and analytics are explicitly labeled fictional. No payments, real prizes or fake
production activity. No API client, cookies, identity or persistent storage in the demo component/model.

Validation: 231 app tests, 9 relay tests, production build. Tests cover deterministic fixture isolation,
metrics, best-result ranking, frozen rules, draft lifecycle, moderation reasons/event isolation,
finalization gate and freeze, no network/storage paths, public routing and entry point.
Local browser exercised approval + exclusion, close/finalize/audit, create/publish/frozen form, Reset,
direct refresh and mobile 390px without overflow. After these actions, actual SQLite still had zero
competition records and zero attempts. No simulated actions call real organizer/result mutations.

Render update pending until exact merged SHA and hosted demo are verified. No plan/storage changes,
paid provisioning, automatic dispatch or real-event migrations. The simulation survives redeploys as
code-based fixtures; it intentionally does not preserve local demo actions across refresh.
