import { COMPETITION_TEMPLATE, type CompetitionRules } from '../../shared/competitions';

export class CompetitionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function reject(status: number, message: string): never { throw new CompetitionError(status, message); }
export const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function text(value: unknown, label: string, max: number, blank = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) reject(400, `Invalid ${label}.`);
  const cleaned = value.trim();
  if (!blank && !cleaned) reject(400, `Invalid ${label}.`);
  return cleaned;
}
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) reject(400, 'Use a valid request or attempt id.');
  return value;
}
function utc(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) reject(400, 'Dates must be UTC ISO timestamps ending in Z.');
  const ms = Date.parse(value);
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, digits: string | undefined) => `.${(digits ?? '').padEnd(3, '0')}Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== normalized) reject(400, 'Use valid UTC dates.');
  return normalized;
}
export function parseRules(value: unknown): CompetitionRules {
  if (!object(value)) reject(400, 'Expected competition rules.');
  const allowed = ['title', 'description', 'challengeTemplate', 'startsAt', 'endsAt', 'attemptLimit', 'scoring', 'tieBreaker', 'prizeDescription'];
  if (Object.keys(value).some(k => !allowed.includes(k))) reject(400, 'Unknown competition rule field.');
  const startsAt = utc(value.startsAt), endsAt = utc(value.endsAt);
  if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 90 * 86400000) reject(400, 'End must follow start by at most 90 days.');
  if (value.challengeTemplate !== COMPETITION_TEMPLATE) reject(400, 'Select the curated Fortnite hillside challenge.');
  if (!Number.isInteger(value.attemptLimit) || Number(value.attemptLimit) < 1 || Number(value.attemptLimit) > 50) reject(400, 'Attempt limit must be an integer from 1 to 50.');
  if (!object(value.scoring) || value.scoring.method !== 'server-game-data-v1' || typeof value.scoring.requireHit !== 'boolean' || Object.keys(value.scoring).some(k => !['method', 'requireHit'].includes(k))) reject(400, 'Unsupported scoring rules.');
  if (value.tieBreaker !== 'score-earliest-v1' && value.tieBreaker !== 'score-hit-earliest-v1') reject(400, 'Unsupported tie breaker.');
  return {
    title: text(value.title, 'title', 100), description: text(value.description, 'description', 2000, true),
    challengeTemplate: COMPETITION_TEMPLATE, startsAt, endsAt, attemptLimit: Number(value.attemptLimit),
    scoring: { method: 'server-game-data-v1', requireHit: value.scoring.requireHit }, tieBreaker: value.tieBreaker,
    prizeDescription: text(value.prizeDescription, 'example prize description', 500, true),
  };
}
