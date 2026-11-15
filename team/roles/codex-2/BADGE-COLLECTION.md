# Five-family badge collection

User requested bolder, colored, recognizable badges; only 4–5 categories and a separate personal collection.
Branch `work/codex-2/badge-collection` starts at latest integration `0e6c4b1` and preserves current UI/gameplay.

Five visible families: First Run (red diamond/flag), Regular (blue hexagon/chevrons), Streak (orange flame/bolt),
Top Ten (mint shield/10), Champion (gold star/crown). Shape, large glyph and text identify each independently
of color; locked/collected labels and original earned dates remain explicit. Original SVGs, no external assets.

`/leaderboards/badges` is a separate routed view under the existing Leaderboards tab, with All / Collected /
To unlock filters and personal family count. It supports refresh, history and mobile. Rankings have a compact
five-symbol preview/link instead of a second inline collection. Account and personal progress link to badges.

Existing eight server milestones are grouped into these five families (regular/dedicated, 3/7-day streak,
champion/reigning champion are tiers). Backend IDs, award rules, saved timestamps, API, database and XP are
unchanged. No migration or destructive badge removal. Example players never populate the personal collection.

Validation: 223 application tests, 9 relay tests, TypeScript/Vite build. New tests cover complete/unique mapping,
retention of every legacy award/date, no invented awards, compact-strip deduplication and direct routing.
Local real gameplay earned First Run + Top Ten; collection showed 2/5, filter showed two cards, empty filter
state also verified. Mobile 390px direct refresh had no horizontal overflow. Existing FaZe palette/layout is
retained around the badge-specific user-authorized colors. No automation or hosting/storage settings changed.
