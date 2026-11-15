import type { Board, Leaderboard, Profile } from '../../packages/progression/rules';

export type MeResponse = { profile: Profile | null; trackingSince: string; storageDurable: boolean };

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Community progress is unavailable right now.');
  return data as T;
}

export const fetchMe = (signal?: AbortSignal) =>
  fetch('/api/progression/me', { credentials: 'same-origin', signal }).then(r => json<MeResponse>(r));

export const fetchBoard = (board: Board, signal?: AbortSignal) =>
  fetch(`/api/progression/leaderboard?board=${board}`, { credentials: 'same-origin', signal }).then(r => json<Leaderboard>(r));

export const saveName = (name: string) =>
  fetch('/api/progression/me/name', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then(r => json<{ profile: Profile }>(r));
