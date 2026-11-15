import type { Express, Request, Response } from 'express';
import { cleanDisplayName, type AttemptProgress, type Board } from './rules';
import { openProgressionStore, type ProgressionStore, type ScoredAttempt } from './store';

export const GUEST_COOKIE = 'rib_guest';
const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
const ATTEMPT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const BOARDS = new Set<Board>(['score', 'streak', 'xp']);

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (typeof header !== 'string' || header.length > 8192) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || undefined;
  }
  return undefined;
}

function setGuestCookie(req: Request, res: Response, token: string) {
  const secure = req.secure ? '; Secure' : '';
  res.append('Set-Cookie', `${GUEST_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Lax${secure}`);
}

/** What the scoring route needs from progression. Kept small so scoring still works without it. */
export type ScoringProgress = {
  /** Look up (or create) the browser's guest and claim the attempt id before any scoring work. */
  begin(req: Request, res: Response, attemptId: unknown):
    | { kind: 'skip'; reason: string }
    | { kind: 'replay'; body: unknown }
    | { kind: 'busy' }
    | { kind: 'claimed'; finish<T extends object>(attempt: ScoredAttempt, body: T): T & { progress: AttemptProgress }; abort(): void };
};

type Options = { store?: ProgressionStore; now?: () => number; guestsPerHour?: number; renamesPerHour?: number };

export function registerProgression(app: Express, options: Options = {}) {
  const now = options.now ?? Date.now;
  const store = options.store ?? openProgressionStore({ now });
  const guestsPerHour = options.guestsPerHour ?? 20;
  const renamesPerHour = options.renamesPerHour ?? 10;
  const buckets = { guests: new Map<string, number[]>(), renames: new Map<string, number[]>() };
  function allow(bucket: Map<string, number[]>, key: string, limit: number) {
    const t = now(), recent = (bucket.get(key) ?? []).filter(x => t - x < 3_600_000);
    if (recent.length >= limit) { bucket.set(key, recent); return false; }
    recent.push(t); bucket.set(key, recent);
    if (bucket.size > 5000) for (const [k, v] of bucket) if (!v.some(x => t - x < 3_600_000)) bucket.delete(k);
    return true;
  }
  const viewer = (req: Request) => store.find(readCookie(req, GUEST_COOKIE));
  /** Existing guest, or a new one (rate-limited per client). An unknown cookie gets a fresh guest. */
  function ensureGuest(req: Request, res: Response) {
    const found = viewer(req);
    if (found) return { id: found.id, isNew: false };
    if (!allow(buckets.guests, req.ip ?? 'unknown', guestsPerHour)) return undefined;
    const created = store.createGuest();
    if ('full' in created) return undefined;
    setGuestCookie(req, res, created.token);
    return { id: created.player.id, isNew: true };
  }

  app.get('/api/progression/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const found = viewer(req);
    // Opening the page never creates a guest or awards anything.
    res.json({ profile: found ? store.profile(found.id) : null, trackingSince: new Date(store.trackingStartedAt).toISOString(), storageDurable: store.durable });
  });

  app.post('/api/progression/me/name', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const name = cleanDisplayName((req.body as { name?: unknown } | undefined)?.name);
    if (!name) { res.status(400).json({ error: 'Use 1–24 letters, numbers, spaces or . _ - ’' }); return; }
    if (!allow(buckets.renames, req.ip ?? 'unknown', renamesPerHour)) { res.status(429).json({ error: 'Too many name changes. Try again later.' }); return; }
    const guest = ensureGuest(req, res);
    if (!guest) { res.status(503).json({ error: 'Can’t create a guest profile right now. Try again later.' }); return; }
    store.rename(guest.id, name);
    res.json({ profile: store.profile(guest.id, guest.isNew) });
  });

  app.get('/api/progression/leaderboard', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const board = String(req.query.board ?? 'score') as Board;
    if (!BOARDS.has(board)) { res.status(400).json({ error: 'Unknown leaderboard.' }); return; }
    res.json(store.leaderboard(board, viewer(req)?.id));
  });

  const scoring: ScoringProgress = {
    begin(req, res, attemptId) {
      if (typeof attemptId !== 'string' || !ATTEMPT_ID.test(attemptId)) return { kind: 'skip', reason: 'This attempt had no valid attempt id, so it wasn’t recorded.' };
      const guest = ensureGuest(req, res);
      if (!guest) return { kind: 'skip', reason: 'Progress isn’t available right now, so this attempt wasn’t recorded.' };
      const claim = store.claim(guest.id, attemptId);
      if (claim.status === 'done') return { kind: 'replay', body: claim.response };
      if (claim.status === 'pending') return { kind: 'busy' };
      if (claim.status === 'limit') return { kind: 'skip', reason: 'Daily attempt limit reached; this one wasn’t recorded.' };
      return {
        kind: 'claimed',
        finish: (attempt, body) => store.complete(guest.id, attemptId, attempt, progress => ({ ...body, progress })).response as typeof body & { progress: AttemptProgress },
        abort: () => store.release(guest.id, attemptId),
      };
    },
  };
  return { store, scoring, close: () => store.close() };
}
