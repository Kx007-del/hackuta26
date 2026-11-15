import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openProgressionStore } from '../packages/progression/store';
import { registerProgression } from '../packages/progression/server';
import { openAuthStore, SESSION_SECONDS } from '../packages/auth/store';
import { registerAuth } from '../packages/auth/server';
import { registerCompetitions } from '../packages/competitions/server';
import { openCompetitionStore } from '../packages/competitions/store';
import { apiErrorHandler } from '../packages/social/server';
import { clearPrivateReport } from '../src/auth/session';

const PASSWORD = 'A unique test passphrase 736!';
async function fixture(options: { attemptsPerWindow?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'h26-auth-')), file = join(dir, 'app.sqlite');
  const clock = { time: Date.parse('2026-11-15T12:00:00Z') }, now = () => clock.time;
  const store = openProgressionStore({ databasePath: file, now });
  const authStore = openAuthStore({ databasePath: file, now });
  const app = express(); app.set('trust proxy', 1); app.use(express.json({ limit: '2mb' }));
  let auth: ReturnType<typeof registerAuth>;
  const progression = registerProgression(app, { store, now, accountIdentity: req => auth.identity(req), isRegistered: id => auth.isRegistered(id) });
  auth = registerAuth(app, { progression: store, store: authStore, now, ...options });
  const competitions = registerCompetitions(app, { identity: progression.identity, store: openCompetitionStore({ databasePath: file, now }), now });
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  async function request(path: string, body?: unknown, cookie = '', headers: Record<string, string> = {}) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any, headers: response.headers,
      cookie: response.headers.getSetCookie().find(value => value.startsWith('rib_account='))?.split(';')[0] ?? '' };
  }
  return { file, base, clock, store, authStore, request, async close() {
    await new Promise<void>(resolve => server.close(() => resolve())); auth.close(); progression.close(); competitions.close();
    rmSync(dir, { recursive: true, force: true });
  } };
}

test('sign-up attaches credentials to the existing guest without losing XP, badges or event ownership', async () => {
  const f = await fixture();
  try {
    const guest = f.store.createGuest(); assert.ok(!('full' in guest));
    f.store.claim(guest.player.id, 'existing-attempt');
    f.store.complete(guest.player.id, 'existing-attempt', { score: 60, hit: true, aiStatus: 'ok' }, progress => ({ progress }));
    const oldCookie = `rib_guest=${guest.token}`;
    assert.equal((await f.request('/api/organizer/enroll', { package: 'creator-demo', acknowledgeDemo: true }, oldCookie)).status, 200);
    const rules = { title: 'Owned event', description: 'Local auth test', challengeTemplate: 'fortnite-hillside-v1',
      startsAt: new Date(f.clock.time).toISOString(), endsAt: new Date(f.clock.time + 3600000).toISOString(), attemptLimit: 3,
      scoring: { method: 'server-game-data-v1', requireHit: false }, tieBreaker: 'score-earliest-v1', prizeDescription: 'No prize' };
    const created = await f.request('/api/organizer/events', rules, oldCookie, { 'Idempotency-Key': 'auth-owned-event' });
    assert.equal(created.status, 201);
    const signup = await f.request('/api/auth/register', { username: 'Player_One', password: PASSWORD }, oldCookie);
    assert.equal(signup.status, 200); assert.equal(signup.body.account.playerId, guest.player.id);
    assert.equal(signup.body.guestAdopted, true);
    assert.equal(signup.body.account.username, 'player_one');
    assert.equal(signup.headers.get('cache-control'), 'no-store');
    const profile = (await f.request('/api/progression/me', undefined, signup.cookie)).body.profile;
    assert.equal(profile.xp, 10); assert.equal(profile.attempts, 1); assert.ok(profile.badges.some((b: any) => b.id === 'first-run' && b.earnedAt));
    const owned = await f.request('/api/organizer/events', undefined, signup.cookie);
    assert.equal(owned.status, 200); assert.equal(owned.body.events[0].id, created.body.event.id);
    assert.equal((await f.request('/api/progression/me', undefined, oldCookie)).body.profile, null, 'old guest token cannot authorize a registered account');
    assert.equal((await f.request('/api/organizer/events', undefined, oldCookie)).status, 401);
    assert.equal((await f.request('/api/auth/register', { username: 'stolen_guest', password: PASSWORD }, oldCookie)).status, 409);
  } finally { await f.close(); }
});

test('login works in another browser; logout revokes the session and cannot expose another account', async () => {
  const f = await fixture();
  try {
    const a = await f.request('/api/auth/register', { username: 'account_a', password: PASSWORD });
    const b = await f.request('/api/auth/register', { username: 'account_b', password: PASSWORD });
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(a.body.guestAdopted, false);
    const signedIn = await f.request('/api/auth/login', { username: 'ACCOUNT_A', password: PASSWORD });
    assert.equal(signedIn.status, 200); assert.notEqual(signedIn.cookie, a.cookie);
    assert.equal((await f.request('/api/progression/me', undefined, signedIn.cookie)).body.profile.id, a.body.account.playerId);
    assert.equal((await f.request('/api/progression/me', undefined, b.cookie)).body.profile.id, b.body.account.playerId);
    assert.equal((await f.request('/api/auth/login', { username: 'account_b', password: PASSWORD }, signedIn.cookie)).status, 409);
    const logout = await f.request('/api/auth/logout', {}, signedIn.cookie);
    assert.equal(logout.status, 200);
    assert.equal((await f.request('/api/auth/me', undefined, signedIn.cookie)).body.account, null);
    assert.equal((await f.request('/api/organizer/events', undefined, signedIn.cookie)).status, 401);
    assert.equal((await f.request('/api/auth/me', undefined, a.cookie)).body.account.username, 'account_a', 'another device remains signed in');
    const wrong = await f.request('/api/auth/login', { username: 'account_a', password: PASSWORD + 'wrong' });
    const unknown = await f.request('/api/auth/login', { username: 'not_registered', password: PASSWORD });
    assert.equal(wrong.status, 401); assert.deepEqual(wrong.body, unknown.body);
    assert.equal(wrong.cookie, '');
  } finally { await f.close(); }
});

test('session cookies are HttpOnly, SameSite=Lax, Secure over HTTPS, and expire server-side', async () => {
  const f = await fixture();
  try {
    const a = await f.request('/api/auth/register', { username: 'secure_account', password: PASSWORD }, '', { 'X-Forwarded-Proto': 'https' });
    assert.equal(a.status, 200);
    const set = a.headers.getSetCookie().find(v => v.startsWith('rib_account='))!;
    for (const flag of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Path=/', `Max-Age=${SESSION_SECONDS}`]) assert.ok(set.includes(flag), flag);
    f.clock.time += SESSION_SECONDS * 1000 + 1;
    assert.equal((await f.request('/api/auth/me', undefined, a.cookie)).body.account, null);
    assert.equal((await f.request('/api/organizer/events', undefined, a.cookie)).status, 401);
  } finally { await f.close(); }
});

test('credentials and sessions survive restart; only password/token hashes are stored', async () => {
  const f = await fixture();
  try {
    const a = await f.request('/api/auth/register', { username: 'persisted', password: PASSWORD });
    const db = new DatabaseSync(f.file);
    const row = db.prepare('SELECT password_hash FROM auth_accounts').get() as { password_hash: string };
    assert.match(row.password_hash, /^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.ok(!row.password_hash.includes(PASSWORD));
    const saved = db.prepare('SELECT token_hash FROM auth_sessions').get() as { token_hash: string };
    assert.equal(saved.token_hash.length, 64); assert.ok(!a.cookie.includes(saved.token_hash)); db.close();
    const reopened = openAuthStore({ databasePath: f.file, now: () => f.clock.time });
    assert.equal(reopened.session(a.cookie.split('=')[1])?.username, 'persisted'); reopened.close();
    const same = await f.request('/api/auth/register', { username: 'PERSISTED', password: PASSWORD });
    assert.equal(same.status, 409);
  } finally { await f.close(); }
});

test('cross-origin registration/login/logout and malformed credential payloads fail closed', async () => {
  const f = await fixture();
  try {
    for (const path of ['register', 'login', 'logout']) {
      assert.equal((await f.request(`/api/auth/${path}`, { username: 'blocked', password: PASSWORD }, '', { Origin: 'https://other.test' })).status, 403);
      assert.equal((await f.request(`/api/auth/${path}`, {}, '', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    }
    for (const body of [null, [], { username: '<script>', password: PASSWORD }, { username: 'valid', password: 'short' },
      { username: 'valid', password: 'x'.repeat(129) }, { username: 'valid', password: ' '.repeat(15) },
      { username: 'valid', password: 'passwordpassword' }, { username: 'valid', password: PASSWORD, playerId: 'forged' }]) {
      assert.equal((await f.request('/api/auth/register', body)).status, 400);
    }
    const plain = await fetch(f.base + '/api/auth/login', { method: 'POST', body: 'username=valid&password=anything' });
    assert.equal(plain.status, 415);
    assert.equal((await f.request('/api/auth/me')).body.account, null);
  } finally { await f.close(); }
});

test('login attempts are throttled and do not award progression', async () => {
  const f = await fixture({ attemptsPerWindow: 2 });
  try {
    for (let i = 0; i < 2; i++) assert.equal((await f.request('/api/auth/login', { username: 'unknown', password: PASSWORD })).status, 401);
    const blocked = await f.request('/api/auth/login', { username: 'unknown', password: PASSWORD });
    assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '900');
    assert.equal((await f.request('/api/progression/me')).body.profile, null);
    f.clock.time += 900001;
    assert.equal((await f.request('/api/auth/login', { username: 'unknown', password: PASSWORD })).status, 401);
  } finally { await f.close(); }
});

test('simultaneous account registrations cannot claim one guest twice', async () => {
  const f = await fixture();
  try {
    const guest = f.store.createGuest(); assert.ok(!('full' in guest));
    const responses = await Promise.all(['race_a', 'race_b'].map(username => f.request('/api/auth/register', { username, password: PASSWORD }, `rib_guest=${guest.token}`)));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const winner = responses.find(r => r.status === 200)!;
    assert.equal(winner.body.account.playerId, guest.player.id);
  } finally { await f.close(); }
});

test('signing into another account preserves the browser guest and restores it on logout', async () => {
  const f = await fixture();
  try {
    const account = await f.request('/api/auth/register', { username: 'returning_user', password: PASSWORD });
    const guest = f.store.createGuest(); assert.ok(!('full' in guest));
    const guestCookie = `rib_guest=${guest.token}`;
    const login = await f.request('/api/auth/login', { username: 'returning_user', password: PASSWORD }, guestCookie);
    assert.equal(login.status, 200);
    assert.ok(login.headers.getSetCookie().every(v => !v.startsWith('rib_guest=')), 'login must retain the guest cookie');
    const both = `${guestCookie}; ${login.cookie}`;
    assert.equal((await f.request('/api/progression/me', undefined, both)).body.profile.id, account.body.account.playerId);
    const logout = await f.request('/api/auth/logout', {}, both);
    assert.ok(logout.headers.getSetCookie().every(v => !v.startsWith('rib_guest=')));
    assert.equal((await f.request('/api/progression/me', undefined, guestCookie)).body.profile.id, guest.player.id);
  } finally { await f.close(); }
});

test('account changes clear only the previous private report and tolerate unavailable storage', () => {
  const values = new Map([['showcase:attempt-report:v1', 'private report'], ['unrelated', 'keep']]);
  clearPrivateReport({ removeItem(key) { values.delete(key); } });
  assert.equal(values.has('showcase:attempt-report:v1'), false); assert.equal(values.get('unrelated'), 'keep');
  assert.doesNotThrow(() => clearPrivateReport({ removeItem() { throw new Error('Storage blocked'); } }));
});
