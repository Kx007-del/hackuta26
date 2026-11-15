import type { Express, Request, Response, NextFunction } from 'express';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ProgressionStore } from '../progression/store';
import { GUEST_COOKIE, readCookie } from '../progression/server';
import { openAuthStore, SESSION_SECONDS, type AuthStore } from './store';

export const ACCOUNT_COOKIE = 'rib_account';
const PARAMS = { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, PARAMS, (error, result) => error ? reject(error) : resolve(result));
});
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
async function verify(password: string, stored?: string) {
  const [, salt, hex] = stored?.split(':') ?? [];
  const valid = /^[a-f0-9]{32}$/.test(salt ?? '') && /^[a-f0-9]{128}$/.test(hex ?? '');
  const actual = await derive(password, valid ? salt : '0'.repeat(32));
  const expected = Buffer.from(valid ? hex : '0'.repeat(128), 'hex');
  return timingSafeEqual(actual, expected) && valid;
}
function cookie(req: Request, res: Response, name: string, token: string, maxAge: number) {
  res.append('Set-Cookie', `${name}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
}

export function registerAuth(app: Express, options: { progression: ProgressionStore; store?: AuthStore; now?: () => number; attemptsPerWindow?: number }) {
  const now = options.now ?? Date.now;
  const store = options.store ?? openAuthStore({ now });
  const progression = options.progression;
  const attempts = new Map<string, { count: number; until: number }>();
  let active = 0;
  function allow(key: string, limit: number) {
    const t = now();
    for (const [k, value] of attempts) if (value.until <= t) attempts.delete(k);
    const value = attempts.get(key);
    if (value && value.count >= limit) return false;
    if (!value && attempts.size >= 5000) return false;
    attempts.set(key, { count: (value?.count ?? 0) + 1, until: value?.until ?? t + 15 * 60_000 }); return true;
  }
  function current(req: Request) { return store.session(readCookie(req, ACCOUNT_COOKIE)); }
  const publicAccount = (account: { username: string; player_id: string } | undefined) => {
    if (!account) return null;
    const profile = progression.profile(account.player_id);
    return profile ? { username: account.username, playerId: profile.id, name: profile.name } : null;
  };
  app.use('/api/auth', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  function guard(req: Request, res: Response, next: NextFunction) {
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
      res.status(403).json({ error: 'Open the sign-in page on this site and try again.' }); return;
    }
    if (!req.is('application/json')) { res.status(415).json({ error: 'Send a JSON request.' }); return; }
    next();
  }
  app.get('/api/auth/me', (req, res) => res.json({ account: publicAccount(current(req)), storageDurable: progression.durable }));
  for (const action of ['register', 'login'] as const) app.post(`/api/auth/${action}`, guard, async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['username', 'password'].includes(k)) ||
      typeof body.username !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(body.username) ||
      typeof body.password !== 'string' || body.password.length < 15 || body.password.length > 128 || !body.password.trim() ||
      ['passwordpassword', '123456789012345', '12345678901234567890', 'qwertyuiopasdfgh'].includes(body.password.toLowerCase())) {
      res.status(400).json({ error: 'Use a 3–24 character username (letters, numbers, _ . -) and a 15–128 character password.' }); return;
    }
    const username = body.username.toLowerCase();
    if (active >= 2) { res.setHeader('Retry-After', '2'); res.status(429).json({ error: 'Sign-in is busy. Please try again in a moment.' }); return; }
    if (!allow(`ip:${req.ip}`, options.attemptsPerWindow ?? 30) || !allow(`name:${username}`, 10)) {
      res.setHeader('Retry-After', '900'); res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' }); return;
    }
    if (current(req)) { res.status(409).json({ error: 'Sign out before switching or creating another account.' }); return; }
    active++;
    try {
      let playerId: string;
      let token: string | undefined;
      let guestAdopted = false;
      if (action === 'register') {
        const passwordHash = await hashPassword(body.password);
        if (store.account(username)) { res.status(409).json({ error: 'Unable to create this account. Choose another username or sign in.' }); return; }
        const guest = progression.find(readCookie(req, GUEST_COOKIE));
        if (guest && store.hasPlayer(guest.id)) { res.status(409).json({ error: 'This profile already has an account. Sign in to continue.' }); return; }
        const created = guest ? undefined : progression.createGuest();
        if (created && 'full' in created) { res.status(503).json({ error: 'Account creation is temporarily unavailable.' }); return; }
        playerId = guest?.id ?? (created as { player: { id: string } }).player.id;
        guestAdopted = !!guest;
        token = store.register(username, playerId, passwordHash);
        if (!token) { res.status(409).json({ error: 'Unable to create this account. Choose another username or sign in.' }); return; }
        if (!guest) progression.rename(playerId, username);
      } else {
        const account = store.account(username);
        if (!await verify(body.password, account?.password_hash)) { res.status(401).json({ error: 'Incorrect username or password.' }); return; }
        playerId = account!.player_id;
        if (!progression.profile(playerId)) { res.status(401).json({ error: 'This account is no longer available on this server.' }); return; }
        token = store.issue(playerId);
      }
      store.revoke(readCookie(req, ACCOUNT_COOKIE));
      cookie(req, res, ACCOUNT_COOKIE, token, SESSION_SECONDS);
      // Signing into a different account must not discard the browser's separate
      // guest progress. Signup adopts that guest, so its old token is retired.
      if (action === 'register') cookie(req, res, GUEST_COOKIE, '', 0);
      res.json({ account: publicAccount({ username, player_id: playerId }), storageDurable: progression.durable, guestAdopted });
    } finally { active--; }
  });
  app.post('/api/auth/logout', guard, (req, res) => {
    store.revoke(readCookie(req, ACCOUNT_COOKIE));
    cookie(req, res, ACCOUNT_COOKIE, '', 0);
    res.json({ ok: true });
  });
  return {
    identity(req: Request) { const account = publicAccount(current(req)); return account ? { id: account.playerId, name: account.name } : undefined; },
    isRegistered: (id: string) => store.hasPlayer(id),
    close: () => store.close(),
  };
}
