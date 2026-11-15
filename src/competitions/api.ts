import type { CompetitionReceipt, CompetitionView } from '../../shared/competitions';
export type Ticket = { id: string; eventId: string; attemptId: string; expiresAt: string; completed: boolean };
export type Entrant = { joined: boolean; usedAttempts: number; attemptLimit: number; results: CompetitionReceipt[] };
export class EventError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function api<T>(path: string, body?: unknown, method = 'POST', headers?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : method, credentials: 'same-origin', signal,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new EventError(result?.error ?? 'Request failed. Please retry.', response.status);
  return result as T;
}
export function eventCode(input: string) {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); return /^\/events\/[A-Za-z0-9-]+\/?$/.test(url.pathname) ? url.pathname.split('/')[2] : ''; } catch { return ''; }
  }
  return /^[A-Za-z0-9-]+$/.test(value) ? value : '';
}
export function activeTab(path: string) {
  if (path === '/leaderboards') return 'Leaderboards';
  if (path === '/events' || path.startsWith('/events/')) return 'Join Events';
  if (path === '/host' || path.startsWith('/host/')) return 'Host an Event';
  return 'Play';
}
export type EventEnvelope = { event: CompetitionView };
