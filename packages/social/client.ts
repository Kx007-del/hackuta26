import type { AttemptResult, Relay } from '../../shared/contracts';

export type CreateRelayInput = {hostName: string; hostAttempt: AttemptResult; parentChallengeId?: string};
export type CompleteRelayInput = {guestName: string; guestAttempt: AttemptResult};
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error ?? 'The request could not be completed. Please try again.', response.status);
  return data as T;
}
export const createRelay = (input: CreateRelayInput): Promise<Relay> => request('/api/relays', input);
export const getRelay = (id: string): Promise<Relay> => request(`/api/relays/${encodeURIComponent(id)}`);
export const completeRelay = (id: string, input: CompleteRelayInput): Promise<Relay> => request(`/api/relays/${encodeURIComponent(id)}/complete`, input);
