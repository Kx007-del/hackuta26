/**
 * Community progression rules, shared by the server (which enforces them) and the browser
 * (which only explains them). Nothing here trusts client-supplied XP, streaks, badges or scores.
 */

export const XP_PER_ATTEMPT = 10;
export const DAILY_XP_CAP = 200;
/** Minimum valid attempt: the shot comes at least this long after the attempt started… */
export const MIN_ATTEMPT_MS = 1500;
/** …and the player moved at least this far from spawn, or turned at least this much. */
export const MIN_MOVE_M = 3;
export const MIN_TURN_DEG = 20;
/** Server-side spacing between counted attempts for one player. */
export const MIN_ATTEMPT_SPACING_MS = 3000;
/** Attempts recorded per player per UTC day (beyond this they are scored but not stored). */
export const MAX_RECORDED_PER_DAY = 100;
export const LEADERBOARD_SIZE = 10;
export const NAME_MAX = 24;

export type BadgeId = 'first-run' | 'regular' | 'dedicated' | 'streak-3' | 'streak-7' | 'top-ten' | 'champion' | 'reigning-champion';
export const BADGES: ReadonlyArray<{ id: BadgeId; name: string; criteria: string }> = [
  { id: 'first-run', name: 'First Run', criteria: 'Complete your first eligible attempt.' },
  { id: 'regular', name: 'Regular', criteria: 'Complete 10 eligible attempts.' },
  { id: 'dedicated', name: 'Dedicated', criteria: 'Complete 50 eligible attempts.' },
  { id: 'streak-3', name: 'Three-Day Streak', criteria: 'Play on 3 consecutive UTC days.' },
  { id: 'streak-7', name: 'Seven-Day Streak', criteria: 'Play on 7 consecutive UTC days.' },
  { id: 'top-ten', name: 'Top Ten', criteria: 'Enter the Highest Score top ten for the first time.' },
  { id: 'champion', name: 'Champion', criteria: 'Be Highest Score #1 at a daily 00:00 UTC checkpoint.' },
  { id: 'reigning-champion', name: 'Reigning Champion', criteria: 'Be Highest Score #1 at 7 consecutive daily checkpoints.' },
];
export const BADGE_IDS = new Set<string>(BADGES.map(b => b.id));

export type Board = 'score' | 'streak' | 'xp';
export const TIE_RULES: Record<Board, string> = {
  score: 'Higher best score first. Ties go to whoever reached that score first.',
  streak: 'Longer current streak first, then longer best streak, then whoever reached the streak first.',
  xp: 'More XP first. Ties go to whoever reached that total first.',
};

const DAY_MS = 86_400_000;
/** UTC calendar day (YYYY-MM-DD) for a server timestamp in ms. */
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const dayStartMs = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
export const addDays = (day: string, n: number) => utcDay(dayStartMs(day) + n * DAY_MS);

/** Effective current streak: a streak counts only if its last play day is today or yesterday (UTC). */
export function effectiveStreak(current: number, lastDay: string | null, nowMs: number) {
  if (!lastDay) return 0;
  const today = utcDay(nowMs);
  return lastDay === today || lastDay === addDays(today, -1) ? current : 0;
}

/** Streak after a qualifying play on `day`, given the previous streak and its last day. */
export function advanceStreak(current: number, lastDay: string | null, day: string) {
  if (lastDay === day) return current; // more attempts the same day don't advance it
  if (lastDay && addDays(lastDay, 1) === day) return current + 1;
  return 1; // first play, or a missed full UTC day breaks the streak
}

export type EligibilityInput = { shots: number; elapsedMs: number; movedM: number; turnDeg: number };
/** Why an attempt does not count (or undefined when it does). */
export function ineligibleReason(a: EligibilityInput): string | undefined {
  if (a.shots !== 1) return 'Only one shot per attempt counts.';
  if (a.elapsedMs < MIN_ATTEMPT_MS) return 'Attempts must last at least 1.5 seconds before the shot.';
  if (a.movedM < MIN_MOVE_M && Math.abs(a.turnDeg) < MIN_TURN_DEG) return 'Move or turn before shooting for the attempt to count.';
  return undefined;
}

/** Display names: 1–24 visible characters (letters, numbers, spaces and . _ - '). Never used as identity. */
export function cleanDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 200) return undefined;
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > NAME_MAX) return undefined;
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) return undefined;
  return name;
}

/** Public shapes returned by the API. */
export type BadgeState = { id: BadgeId; name: string; criteria: string; earnedAt: string | null };
export type Profile = {
  id: string; name: string; isNew: boolean;
  xp: number; xpToday: number; xpCap: number;
  attempts: number; currentStreak: number; longestStreak: number;
  bestScore: number | null;
  ranks: Record<Board, number | null>;
  badges: BadgeState[];
  storageDurable: boolean;
  trackingSince: string;
};
export type LeaderboardEntry = { rank: number; name: string; value: number; badges: BadgeId[]; isYou: boolean };
export type Leaderboard = {
  board: Board; entries: LeaderboardEntry[];
  you: { rank: number | null; value: number | null } | null;
  tieRule: string; total: number; trackingSince: string; storageDurable: boolean;
};
export type AttemptProgress =
  | { status: 'counted'; xpAwarded: number; xpToday: number; xpCap: number; ranked: boolean; unrankedReason?: string; newBadges: BadgeId[]; currentStreak: number }
  | { status: 'not-counted'; reason: string };
