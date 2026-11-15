# FaZe typography update

The user requested the supplied FaZe fonts throughout the UI, initially for local review. The subsequent instruction, “Can you push it to git and render,” authorizes publishing and deploying this typography update.

`src/showcase-typography.css` uses the toolkit's unchanged `Sample_FaZed_Sans.otf` as FaZeDisplay for headings, navigation, buttons, short labels and score displays across the current showcase. This supersedes the historical Source/Anton-only restriction for this typography request. The supplied brand guidelines reserve the custom font for titles and short phrases; reading text and editable fields retain toolkit Source.

The supplied custom font sample has letters but no ASCII digits or punctuation. Its declared Unicode range covers English letters and spaces; supplied Anton handles other display characters. Scores remain legible. No font is downloaded from an outside provider or synthesized. The original logo artwork remains unchanged.

The original asset is served byte-for-byte at `public/brand/FaZed-Sans.otf`, with its source and SHA-256 recorded in `docs/team/brand-provenance.json`. The typography stylesheet loads last so live routes, including login and event forms, share this treatment. Inactive historical screens and gameplay mechanics are unchanged.

Validation before release: production build and all 216 application tests passed, including the toolkit byte-provenance checks. Local production browser checks confirmed the custom display family on navigation, headings, login labels/buttons and practice controls, with Source retained in editable fields. Home, sign-in, leaderboard, join-event and host-event pages had no page-width overflow at 390px; the desktop header also fits at 1280px. Desktop/mobile preview screenshots are saved locally under `.team-local/faze-typography-*.jpg`. The release PR records integration checks and deployment status.
