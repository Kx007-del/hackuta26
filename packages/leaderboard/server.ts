import express, { type Express, type Request, type Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ARENAS, mechanicSatisfied, validConfig, type ArenaId, type AttemptResult, type MechanicState } from '../../shared/contracts';
import { attemptMetrics, buildLeaderboard, leaderboardTarget, type FumbleKind, type LeaderboardRow } from './scoring';

/** Oldest rows are dropped beyond this, so the public endpoint can never grow storage without bound. */
export const MAX_LEADERBOARD_ROWS = 5000;

class InputError extends Error {}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const count = (v: unknown): v is number => bounded(v, 0, 30) && Number.isInteger(v);

export function playerName(value: unknown): string {
  if (typeof value !== 'string') throw new InputError('Add your player name to join the leaderboard.');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32 || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/.test(trimmed)) {
    throw new InputError('Use a player name between 1 and 32 characters.');
  }
  return trimmed;
}

/**
 * Accepts any finished attempt, landed or not. Only the shot frame is used, and frames are never stored.
 * Attempts are client-reported: these checks keep entries self-consistent, they are not anti-cheat.
 */
export function validateLeaderboardAttempt(value: unknown): AttemptResult {
  if (!record(value) || !validConfig(value.config)) throw new InputError('Invalid challenge settings.');
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) throw new InputError('Invalid attempt.');
  if (typeof value.success !== 'boolean' || typeof value.targetHit !== 'boolean' || typeof value.airborneAtShot !== 'boolean') throw new InputError('Invalid attempt.');
  if (!bounded(value.rotationDegrees, 0, 3600) || !bounded(value.durationMs, 1, 60000) || !bounded(value.shotTimeMs, 0, value.durationMs)) throw new InputError('Invalid attempt timing.');
  if (!Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > 2000) throw new InputError('Invalid replay frames.');
  const frames = value.frames.map((frame: unknown) => {
    if (!record(frame) || !bounded(frame.t, 0, value.durationMs as number) || !bounded(frame.x, -10000, 10000) || !bounded(frame.y, -10000, 10000) || !bounded(frame.z, -10000, 10000) || !bounded(frame.yaw, -1000000, 1000000) || !bounded(frame.pitch, -10, 10)) throw new InputError('Invalid replay frames.');
    return { t: frame.t, x: frame.x, y: frame.y, z: frame.z, yaw: frame.yaw, pitch: frame.pitch };
  });
  const config = value.config;
  let mechanicState: MechanicState | undefined;
  if (value.mechanicState !== undefined) {
    const s = value.mechanicState;
    if (!record(s) || !count(s.builds) || !count(s.dashes) || !bounded(s.speedAtShot, 0, 100) || (s.edited !== undefined && typeof s.edited !== 'boolean')) throw new InputError('Invalid mechanic state.');
    mechanicState = { builds: s.builds, dashes: s.dashes, speedAtShot: s.speedAtShot, ...(s.edited === undefined ? {} : { edited: s.edited }) };
  }
  const attempt: AttemptResult = {
    id: value.id,
    config: { schemaVersion: 1, arenaId: config.arenaId, templateId: config.templateId, targetDistance: config.targetDistance, requiredSpinDegrees: config.requiredSpinDegrees },
    success: value.success, targetHit: value.targetHit, airborneAtShot: value.airborneAtShot,
    rotationDegrees: value.rotationDegrees, durationMs: value.durationMs, shotTimeMs: value.shotTimeMs, frames,
    ...(mechanicState === undefined ? {} : { mechanicState }),
  };
  if (attempt.success) {
    const consistent = attempt.targetHit && attempt.rotationDegrees >= config.requiredSpinDegrees && mechanicSatisfied(attempt.config, mechanicState, attempt.airborneAtShot);
    const { missMeters } = attemptMetrics(attempt);
    if (!consistent || missMeters > leaderboardTarget(config.arenaId, config.targetDistance).radius + 0.01) throw new InputError('This landed shot does not match its recorded aim.');
  }
  return attempt;
}

type Row = { id: string; player: string; arena_id: string; template_id: string; target_distance: number; success: number; miss_m: number; rotation: number; shot_ms: number; fumble: string | null; created_at: string };
const toRow = (r: Row): LeaderboardRow => ({
  id: r.id, player: r.player, arenaId: r.arena_id as ArenaId, templateId: r.template_id as LeaderboardRow['templateId'],
  targetDistance: r.target_distance, success: r.success === 1, missMeters: r.miss_m, rotationDegrees: r.rotation,
  shotTimeMs: r.shot_ms, fumble: r.fumble as FumbleKind | null, createdAt: r.created_at,
});

export function registerLeaderboardApi(app: Express, options: { databasePath?: string; maxRows?: number; now?: () => Date } = {}): () => void {
  const configured = options.databasePath ?? (process.env.DATABASE_PATH?.trim() || resolve('data/relays.sqlite'));
  const file = configured === ':memory:' ? configured : resolve(configured);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const maxRows = options.maxRows ?? MAX_LEADERBOARD_ROWS;
  const now = options.now ?? (() => new Date());
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2000;
    CREATE TABLE IF NOT EXISTS leaderboard_attempts (
      id TEXT PRIMARY KEY, player TEXT NOT NULL, arena_id TEXT NOT NULL, template_id TEXT NOT NULL,
      target_distance INTEGER NOT NULL, success INTEGER NOT NULL, miss_m REAL NOT NULL, rotation REAL NOT NULL,
      shot_ms REAL NOT NULL, fumble TEXT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS leaderboard_attempts_created ON leaderboard_attempts (created_at);`);
  const insert = db.prepare('INSERT OR IGNORE INTO leaderboard_attempts (id, player, arena_id, template_id, target_distance, success, miss_m, rotation, shot_ms, fumble, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const trim = db.prepare('DELETE FROM leaderboard_attempts WHERE id IN (SELECT id FROM leaderboard_attempts ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?)');
  const all = db.prepare('SELECT * FROM leaderboard_attempts');
  const byArena = db.prepare('SELECT * FROM leaderboard_attempts WHERE arena_id = ?');
  const total = db.prepare('SELECT COUNT(*) AS n FROM leaderboard_attempts');

  const fail = (res: Response, message: string, status = 400) => res.status(status).json({ error: message });
  app.post('/api/leaderboard', express.json({ limit: '1mb' }), (req: Request, res: Response) => {
    try {
      if (!record(req.body)) throw new InputError('Invalid request.');
      const player = playerName(req.body.playerName);
      const attempt = validateLeaderboardAttempt(req.body.attempt);
      const m = attemptMetrics(attempt);
      const createdAt = now().toISOString();
      const result = insert.run(attempt.id, player, attempt.config.arenaId, attempt.config.templateId, attempt.config.targetDistance, m.success ? 1 : 0, m.missMeters, m.rotationDegrees, m.shotTimeMs, m.fumble, createdAt);
      if (result.changes > 0) trim.run(maxRows);
      res.status(result.changes > 0 ? 201 : 200).json({ id: attempt.id, success: m.success, missMeters: m.missMeters, fumble: m.fumble });
    } catch (error) {
      if (error instanceof InputError) fail(res, error.message);
      else { console.error('Leaderboard save failed.'); fail(res, 'Unable to save to the leaderboard. Please try again.', 500); }
    }
  });
  app.get('/api/leaderboard', (req: Request, res: Response) => {
    const arena = typeof req.query.arena === 'string' ? req.query.arena : undefined;
    if (arena !== undefined && !ARENAS.some(a => a.id === arena)) { fail(res, 'Unknown arena.'); return; }
    try {
      const rows = ((arena ? byArena.all(arena) : all.all()) as Row[]).map(toRow);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ categories: buildLeaderboard(rows), attempts: (total.get() as { n: number }).n });
    } catch {
      console.error('Leaderboard read failed.');
      fail(res, 'Unable to load the leaderboard. Please try again.', 500);
    }
  });
  return () => db.close();
}
