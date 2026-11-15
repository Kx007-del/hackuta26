import { BADGES, type BadgeId, type BadgeState } from '../../packages/progression/rules';

/** Five visible families; existing server awards stay intact as milestones within a family. */
export const BADGE_FAMILIES = [
  { key: 'first', name: 'First Run', color: '#ff4161', ink: '#19050b', shape: 'Diamond', ids: ['first-run'], tagline: 'Every run starts somewhere.' },
  { key: 'regular', name: 'Regular', color: '#57b7ff', ink: '#051728', shape: 'Hexagon', ids: ['regular', 'dedicated'], tagline: 'Put in the reps.' },
  { key: 'streak', name: 'Streak', color: '#ff9c44', ink: '#251205', shape: 'Flame', ids: ['streak-3', 'streak-7'], tagline: 'Keep the fire going.' },
  { key: 'top', name: 'Top Ten', color: '#5ce3ad', ink: '#062218', shape: 'Shield', ids: ['top-ten'], tagline: 'Make the leaderboard.' },
  { key: 'champion', name: 'Champion', color: '#f8d45b', ink: '#241d05', shape: 'Star', ids: ['champion', 'reigning-champion'], tagline: 'Own the top spot.' },
] as const;
export type BadgeFamily = typeof BADGE_FAMILIES[number];
export const familyFor = (id: BadgeId): BadgeFamily => BADGE_FAMILIES.find(f => (f.ids as readonly BadgeId[]).includes(id))!;
export function collection(badges: readonly BadgeState[] = []) {
  return BADGE_FAMILIES.map(family => {
    const milestones = family.ids.map(id => ({ ...BADGES.find(b => b.id === id)!, earnedAt: badges.find(b => b.id === id)?.earnedAt ?? null }));
    const earned = milestones.filter(b => b.earnedAt);
    return { ...family, milestones, earned: earned.length > 0, latest: earned.at(-1), next: milestones.find(b => !b.earnedAt) };
  });
}
/** Coalesce strips into five recognizable symbols, retaining the highest earned milestone. */
export function compactBadges(ids: readonly BadgeId[]) {
  return BADGE_FAMILIES.flatMap(f => {
    const id = [...f.ids].reverse().find(id => ids.includes(id));
    return id ? [id] : [];
  });
}
