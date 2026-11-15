import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
type Account = { username: string; player_id: string; password_hash: string };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export function openAuthStore(options: { databasePath?: string; now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const file = options.databasePath ?? (process.env.DATABASE_PATH?.trim() || resolve('data/relays.sqlite'));
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS auth_accounts (
      username TEXT PRIMARY KEY, player_id TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_sessions_player ON auth_sessions(player_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);`);
  const byName = db.prepare('SELECT * FROM auth_accounts WHERE username=?');
  const byPlayer = db.prepare('SELECT * FROM auth_accounts WHERE player_id=?');
  const sessionQuery = db.prepare('SELECT a.* FROM auth_sessions s JOIN auth_accounts a ON a.player_id=s.player_id WHERE s.token_hash=? AND s.expires_at>?');
  function issue(playerId: string) {
    db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').run(now());
    // Keep at most five devices per account; evict the oldest before issuing.
    db.prepare('DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE player_id=? ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 4)').run(playerId);
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(digest(token), playerId, now(), now() + SESSION_SECONDS * 1000);
    return token;
  }
  return {
    account(username: string) { return byName.get(username) as Account | undefined; },
    hasPlayer(id: string) { return !!byPlayer.get(id); },
    session(token: string | undefined) { return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? sessionQuery.get(digest(token), now()) as Account | undefined : undefined; },
    register(username: string, playerId: string, passwordHash: string) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (byName.get(username) || byPlayer.get(playerId)) { db.exec('ROLLBACK'); return undefined; }
        db.prepare('INSERT INTO auth_accounts VALUES (?,?,?,?)').run(username, playerId, passwordHash, now());
        const token = issue(playerId);
        db.exec('COMMIT'); return token;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    issue(playerId: string) {
      db.exec('BEGIN IMMEDIATE');
      try { const token = issue(playerId); db.exec('COMMIT'); return token; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    revoke(token: string | undefined) { if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(digest(token)); },
    close() { db.close(); },
  };
}
export type AuthStore = ReturnType<typeof openAuthStore>;
