import type { CSSProperties } from 'react';
import type { BadgeId } from '../../packages/progression/rules';
import { familyFor } from './badges';

// Original vector insignia: shape + symbol + label make recognition independent of color.
const ART = {
  first: { frame: 'M32 3 61 32 32 61 3 32Z', glyph: 'M23 17h22l-6 8 6 8H26v15h-6V17Z' },
  regular: { frame: 'M18 4h28l15 28-15 28H18L3 32Z', glyph: 'M16 27l16-12 16 12-5 6-11-8-11 8Zm0 15 16-12 16 12-5 6-11-8-11 8Z' },
  streak: { frame: 'M33 2c3 14 20 18 23 34 3 15-8 25-24 26C13 61 4 49 9 34c3-9 10-13 12-23l8 11C34 16 34 10 33 2Z', glyph: 'M34 23 22 39h9l-2 13 15-20H34Z' },
  top: { frame: 'M7 5h50v27c0 14-13 24-25 30C20 56 7 46 7 32Z', glyph: 'M17 21h7v23h-7Zm13 0h16v23H30Zm6 6v11h4V27Z' },
  champion: { frame: 'M32 2 41 21 62 25 47 40 51 61 32 51 13 61 17 40 2 25 23 21Z', glyph: 'M18 25 26 31 32 19 38 31 46 25 42 44H22Zm6 21h16v4H24Z' },
};
export function BadgeIcon({ id, earned, size = 64 }: { id: BadgeId; earned: boolean; size?: number }) {
  const family = familyFor(id), art = ART[family.key];
  return <svg className={`badge-icon${earned ? ' is-earned' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false"
    style={{ '--badge-color': family.color, '--badge-ink': family.ink } as CSSProperties}>
    <path d={art.frame} className="badge-icon__frame" />
    <path d={art.glyph} className="badge-icon__glyph" />
  </svg>;
}
