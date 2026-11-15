import type { BadgeId } from '../../packages/progression/rules';

/** Simple original badge shapes in the approved red / black / white palette. Decorative: text labels carry meaning. */
const SHAPES: Record<BadgeId, { frame: string; glyph: string }> = {
  'first-run': { frame: 'M24 3 45 24 24 45 3 24Z', glyph: 'M20 15v18M20 15h10l-3 4 3 4H20' },
  regular: { frame: 'M24 3 42 13.5v21L24 45 6 34.5v-21Z', glyph: 'M17 18h14M17 24h14M17 30h14' },
  dedicated: { frame: 'M24 3 42 13.5v21L24 45 6 34.5v-21Z', glyph: 'M15 28l5-5 4 4 9-9M15 33l5-5 4 4 9-9' },
  'streak-3': { frame: 'M24 3a21 21 0 1 1 0 42a21 21 0 1 1 0-42Z', glyph: 'M14 30l5-8 5 8 5-8 5 8' },
  'streak-7': { frame: 'M24 3a21 21 0 1 1 0 42a21 21 0 1 1 0-42Z', glyph: 'M12 31l4-7 4 7 4-7 4 7 4-7 4 7M14 17h20' },
  'top-ten': { frame: 'M8 5h32v22c0 9-8 15-16 18C16 42 8 36 8 27Z', glyph: 'M17 17v14M23 17h8v14h-8Z' },
  champion: { frame: 'M8 5h32v22c0 9-8 15-16 18C16 42 8 36 8 27Z', glyph: 'M15 31V18l5 6 4-8 4 8 5-6v13Z' },
  'reigning-champion': { frame: 'M24 2l5 7 8-2 1 8 7 4-4 7 4 7-7 4-1 8-8-2-5 7-5-7-8 2-1-8-7-4 4-7-4-7 7-4 1-8 8 2Z', glyph: 'M16 30V19l4 5 4-7 4 7 4-5v11Z' },
};

export function BadgeIcon({ id, earned, size = 48 }: { id: BadgeId; earned: boolean; size?: number }) {
  const shape = SHAPES[id];
  return <svg className={`badge-icon${earned ? ' is-earned' : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d={shape.frame} className="badge-icon__frame" />
    <path d={shape.glyph} className="badge-icon__glyph" />
  </svg>;
}
