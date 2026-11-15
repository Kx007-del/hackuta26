/**
 * Showcase leaderboard: a fixed, fictional set of EXAMPLE players that shows how the
 * community boards look before real activity builds up. It lives only in this file and in
 * the browser. It is never written to the database, never ranked on Live standings and
 * never used for any badge or championship calculation.
 */
import { compareStandings, type BadgeId, type Board, type Profile } from './rules';

export type ExamplePlayer = {
  id: string; name: string;
  bestScore: number | null; bestAt: string;
  currentStreak: number; longestStreak: number; streakAt: string;
  xp: number; xpAt: string;
  attempts: number;
  badges: BadgeId[];
};

/** Fixed fixture. Edit only on purpose: the tests pin these values. */
export const EXAMPLE_PLAYERS: ReadonlyArray<ExamplePlayer> = Object.freeze([
  { id: 'example-01', name: 'Ridgeline Rae', bestScore: 94, bestAt: '2026-11-03T18:20:00Z', currentStreak: 9, longestStreak: 12, streakAt: '2026-11-07T16:00:00Z', xp: 1840, xpAt: '2026-11-14T19:05:00Z', attempts: 214, badges: ['first-run', 'regular', 'dedicated', 'streak-3', 'streak-7', 'top-ten', 'champion', 'reigning-champion'] },
  { id: 'example-02', name: 'Cone Climber', bestScore: 91, bestAt: '2026-11-05T21:42:00Z', currentStreak: 4, longestStreak: 8, streakAt: '2026-11-12T10:30:00Z', xp: 1210, xpAt: '2026-11-14T22:10:00Z', attempts: 133, badges: ['first-run', 'regular', 'dedicated', 'streak-3', 'streak-7', 'top-ten', 'champion'] },
  { id: 'example-03', name: 'Lefty Turner', bestScore: 88, bestAt: '2026-11-08T12:15:00Z', currentStreak: 7, longestStreak: 7, streakAt: '2026-11-09T08:45:00Z', xp: 980, xpAt: '2026-11-14T13:00:00Z', attempts: 101, badges: ['first-run', 'regular', 'dedicated', 'streak-3', 'streak-7', 'top-ten'] },
  { id: 'example-04', name: 'Hillside Hana', bestScore: 85, bestAt: '2026-11-10T17:05:00Z', currentStreak: 2, longestStreak: 5, streakAt: '2026-11-14T09:20:00Z', xp: 760, xpAt: '2026-11-14T20:40:00Z', attempts: 82, badges: ['first-run', 'regular', 'dedicated', 'streak-3', 'top-ten'] },
  { id: 'example-05', name: 'Quiet Scope', bestScore: 85, bestAt: '2026-11-11T09:30:00Z', currentStreak: 5, longestStreak: 5, streakAt: '2026-11-10T19:00:00Z', xp: 540, xpAt: '2026-11-14T18:25:00Z', attempts: 57, badges: ['first-run', 'regular', 'dedicated', 'streak-3', 'top-ten'] },
  { id: 'example-06', name: 'Midair Milo', bestScore: 79, bestAt: '2026-11-06T15:50:00Z', currentStreak: 0, longestStreak: 4, streakAt: '2026-11-04T11:00:00Z', xp: 430, xpAt: '2026-11-08T21:15:00Z', attempts: 44, badges: ['first-run', 'regular', 'streak-3', 'top-ten'] },
  { id: 'example-07', name: 'Tracer Tess', bestScore: 74, bestAt: '2026-11-12T20:10:00Z', currentStreak: 3, longestStreak: 3, streakAt: '2026-11-12T07:40:00Z', xp: 390, xpAt: '2026-11-14T07:55:00Z', attempts: 39, badges: ['first-run', 'regular', 'streak-3', 'top-ten'] },
  { id: 'example-08', name: 'Ledge Lark', bestScore: 68, bestAt: '2026-11-09T14:35:00Z', currentStreak: 1, longestStreak: 2, streakAt: '2026-11-14T15:10:00Z', xp: 210, xpAt: '2026-11-14T15:30:00Z', attempts: 21, badges: ['first-run', 'regular', 'top-ten'] },
  { id: 'example-09', name: 'Backspin Bo', bestScore: 61, bestAt: '2026-11-13T22:00:00Z', currentStreak: 2, longestStreak: 2, streakAt: '2026-11-13T22:00:00Z', xp: 150, xpAt: '2026-11-14T23:05:00Z', attempts: 15, badges: ['first-run', 'regular', 'top-ten'] },
  { id: 'example-10', name: 'Slow Burn', bestScore: 52, bestAt: '2026-11-07T10:10:00Z', currentStreak: 0, longestStreak: 1, streakAt: '2026-11-07T10:10:00Z', xp: 90, xpAt: '2026-11-07T10:45:00Z', attempts: 9, badges: ['first-run', 'top-ten'] },
  { id: 'example-11', name: 'Ramp Rookie', bestScore: null, bestAt: '2026-11-14T12:00:00Z', currentStreak: 1, longestStreak: 1, streakAt: '2026-11-14T12:00:00Z', xp: 40, xpAt: '2026-11-14T12:20:00Z', attempts: 4, badges: ['first-run'] },
  { id: 'example-12', name: 'Fresh Spawn', bestScore: null, bestAt: '2026-11-14T21:00:00Z', currentStreak: 1, longestStreak: 1, streakAt: '2026-11-14T21:00:00Z', xp: 10, xpAt: '2026-11-14T21:00:00Z', attempts: 1, badges: ['first-run'] },
].map(p => Object.freeze({ ...p, badges: Object.freeze([...p.badges]) as unknown as BadgeId[] })));

export type ShowcaseRow = { position: number; name: string; value: number; badges: BadgeId[]; kind: 'example' | 'you' };

const ms = (iso: string | null) => (iso ? Date.parse(iso) : Number.MAX_SAFE_INTEGER);

function exampleStanding(p: ExamplePlayer, board: Board) {
  if (board === 'score') return p.bestScore === null ? null : { id: p.id, value: p.bestScore, reachedAt: ms(p.bestAt) };
  if (board === 'streak') return p.currentStreak > 0 ? { id: p.id, value: p.currentStreak, tieValue: p.longestStreak, reachedAt: ms(p.streakAt) } : null;
  return p.xp > 0 ? { id: p.id, value: p.xp, reachedAt: ms(p.xpAt) } : null;
}

/** The visitor's real values for one board, or null when they have none there yet. */
export function realStanding(profile: Profile | null, board: Board) {
  if (!profile) return null;
  const id = `you:${profile.id}`;
  if (board === 'score') return profile.bestScore === null ? null : { id, value: profile.bestScore, reachedAt: ms(profile.reachedAt.score) };
  if (board === 'streak') return profile.currentStreak > 0 ? { id, value: profile.currentStreak, tieValue: profile.longestStreak, reachedAt: ms(profile.reachedAt.streak) } : null;
  return profile.xp > 0 ? { id, value: profile.xp, reachedAt: ms(profile.reachedAt.xp) } : null;
}

/**
 * Showcase rows for a board: the fixed examples, plus the visitor's real progress (if any)
 * placed by the same ordering as the live board. Positions are "showcase positions", never ranks.
 * Pure: the fixture is never modified.
 */
export function showcaseBoard(board: Board, profile: Profile | null): ShowcaseRow[] {
  type Item = { standing: NonNullable<ReturnType<typeof exampleStanding>>; name: string; badges: BadgeId[]; kind: ShowcaseRow['kind'] };
  const items: Item[] = [];
  for (const p of EXAMPLE_PLAYERS) {
    const standing = exampleStanding(p, board);
    if (standing) items.push({ standing, name: p.name, badges: [...p.badges], kind: 'example' });
  }
  const you = realStanding(profile, board);
  if (you && profile) items.push({ standing: you, name: profile.name, badges: profile.badges.filter(b => b.earnedAt).map(b => b.id), kind: 'you' });
  items.sort((a, b) => compareStandings(a.standing, b.standing));
  return items.map((item, i) => ({ position: i + 1, name: item.name, value: item.standing.value, badges: item.badges, kind: item.kind }));
}
