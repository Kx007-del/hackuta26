# Optional showcase accounts

`/login`, `/signup` and `/account` add username/password sign-in to the existing Express/SQLite service. There is no new external provider, paid resource, OAuth credential, email service, build command or hosting setting. Play, global progression and event hosting continue to support guests.

Creating an account attaches credentials to the current guest player ID, preserving XP, badges, attempts and event ownership. Without a guest, a new player is created. Signing into an existing account loads that account; unrelated guest progress is not merged and remains accessible again after logout. No data is automatically transferred between distinct users.

Credentials and sessions use additive `auth_accounts` and `auth_sessions` tables in the configured `DATABASE_PATH` (same default database as progression). Passwords use asynchronous salted scrypt (N=32768, r=8, p=3); only password hashes and hashed random session tokens are stored. Cookies are HttpOnly, SameSite=Lax and Secure over HTTPS. Account sessions expire after seven days, are revoked on logout, and are limited to five per account. Signup retires the adopted guest cookie, and registered player IDs cannot be authorized by old guest tokens. JSON/same-origin checks and bounded login throttling/concurrent hashing protect auth mutations.

Account changes clear the current tab's private attempt report. Guest signup preserves it because the player identity is unchanged. Other already-open tabs may retain their displayed state until navigation/reload; server authorization remains authoritative.

Important existing limit: the current temporary Render filesystem can reset accounts, credentials, progression and event data on restart/redeploy/spin-down. Login does not make storage persistent. The auth page explains this. Password recovery, email/Google sign-in and MFA are not implemented or advertised. A production account service needs durable storage, recovery and broader operational abuse controls before real prize events.

Author validation: nine auth regressions cover guest conversion/XP/badges/event ownership, old guest token rejection, different-account isolation, cross-browser login, logout, secure cookies, expiry, persisted hashed credentials, CSRF/input handling, throttling, concurrent signup, guest restoration and private-report clearing. Existing gameplay/community/event regressions remain required. A separate read-only review found two identity-transition issues; both were corrected and independently rechecked with 9/9 auth tests passing and no remaining blocking findings in the inspected source.

Local browser validation covered signup, signed-in header/account view, logout, wrong-password feedback, sign-in redirect back to Host, and persistence across reload. Mobile account tabs must stay visible despite historical generic nav styles. Final release revision and hosted evidence are recorded on the PR.
