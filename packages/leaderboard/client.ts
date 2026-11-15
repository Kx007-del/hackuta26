import type { ArenaId, AttemptResult } from '../../shared/contracts';
import type { FumbleKind, LeaderboardCategory } from './scoring';

export type LeaderboardResponse = { categories: LeaderboardCategory[]; attempts: number };
export type PostedAttempt = { id: string; success: boolean; missMeters: number; fumble: FumbleKind | null; ranked: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? 'The leaderboard is unavailable right now.');
  return data as T;
}

export const getLeaderboard = (arenaId?: ArenaId, signal?: AbortSignal): Promise<LeaderboardResponse> =>
  call(`/api/leaderboard${arenaId ? `?arena=${encodeURIComponent(arenaId)}` : ''}`, { signal });

export const postLeaderboardAttempt = (playerName: string, attempt: AttemptResult): Promise<PostedAttempt> =>
  call('/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerName, attempt }) });

const OPT_IN_KEY = 'rib-leaderboard-opt-in';
export function readOptIn(): boolean {
  try { return localStorage.getItem(OPT_IN_KEY) === 'yes'; } catch { return false; }
}
export function writeOptIn(value: boolean) {
  try { localStorage.setItem(OPT_IN_KEY, value ? 'yes' : 'no'); } catch { /* storage unavailable: opt-in lasts for this page only */ }
}
