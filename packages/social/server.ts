import type { Express, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sameConfig, validConfig, type AttemptResult, type Relay, type ReplayFrame } from '../../shared/contracts';

class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 32 || /[\u0000-\u001f\u007f]/.test(value)) throw new InputError('Use a name between 1 and 32 characters.');
  return value.trim();
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new InputError('Invalid identifier.');
  return value;
}
export function validateAttempt(value: unknown): AttemptResult {
  if (!record(value) || !validConfig(value.config)) throw new InputError('Invalid challenge settings.');
  const config = value.config;
  if (value.success !== true || value.targetHit !== true || value.airborneAtShot !== true || !bounded(value.rotationDegrees, config.requiredSpinDegrees, 3600)) throw new InputError('Complete the airborne shot and required rotation before sharing.');
  if (!bounded(value.durationMs, 1, 60000) || !bounded(value.shotTimeMs, 0, value.durationMs)) throw new InputError('Invalid attempt timing.');
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 2000) throw new InputError('Replay must contain between 2 and 2000 frames.');
  let previousTime = -1;
  const frames: ReplayFrame[] = value.frames.map((frame: unknown) => {
    if (!record(frame) || !bounded(frame.t, 0, value.durationMs as number) || frame.t < previousTime ||
        !bounded(frame.x, -10000, 10000) || !bounded(frame.y, -10000, 10000) || !bounded(frame.z, -10000, 10000) ||
        !bounded(frame.yaw, -1000000, 1000000) || !bounded(frame.pitch, -10, 10)) throw new InputError('Invalid replay frames.');
    previousTime = frame.t;
    return {t: frame.t, x: frame.x, y: frame.y, z: frame.z, yaw: frame.yaw, pitch: frame.pitch};
  });
  return {
    id: identifier(value.id),
    config: {schemaVersion: 1, arenaId: 'rooftop-v1', templateId: config.templateId, targetDistance: config.targetDistance, requiredSpinDegrees: config.requiredSpinDegrees},
    success: true, targetHit: true, airborneAtShot: true,
    rotationDegrees: value.rotationDegrees, durationMs: value.durationMs, frames, shotTimeMs: value.shotTimeMs,
  };
}

/** Attempts are client-reported. These checks do not constitute competitive anti-cheat. */
export function registerApi(app: Express, options: {databasePath?: string} = {}): () => void {
  const file = options.databasePath ?? resolve('data/relays.sqlite');
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS relays (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  const select = db.prepare('SELECT payload FROM relays WHERE id = ?');
  const insert = db.prepare('INSERT INTO relays (id, payload) VALUES (?, ?)');
  const update = db.prepare('UPDATE relays SET payload = ? WHERE id = ?');
  const get = (id: string): Relay => {
    const row = select.get(id) as {payload: string} | undefined;
    if (!row) throw new InputError('Relay not found.', 404);
    return JSON.parse(row.payload) as Relay;
  };
  const handle = (fn: (req: Request, res: Response) => void) => (req: Request, res: Response) => {
    try { fn(req, res); } catch (error) {
      if (error instanceof InputError) res.status(error.status).json({error: error.message});
      else { console.error('Relay API error:', error); res.status(500).json({error: 'Unable to save the relay. Please try again.'}); }
    }
  };
  app.post('/api/relays', handle((req, res) => {
    if (!record(req.body)) throw new InputError('Invalid request.');
    const hostName = name(req.body.hostName);
    const hostAttempt = validateAttempt(req.body.hostAttempt);
    const parentChallengeId = req.body.parentChallengeId === undefined ? undefined : identifier(req.body.parentChallengeId);
    if (parentChallengeId) get(parentChallengeId);
    const relay: Relay = {id: randomUUID(), challenge: hostAttempt.config, hostName, hostAttempt, createdAt: new Date().toISOString(), status: 'waiting', ...(parentChallengeId ? {parentChallengeId} : {})};
    insert.run(relay.id, JSON.stringify(relay));
    res.status(201).json(relay);
  }));
  app.get('/api/relays/:id', handle((req, res) => { res.json(get(identifier(req.params.id))); }));
  app.post('/api/relays/:id/complete', handle((req, res) => {
    if (!record(req.body)) throw new InputError('Invalid request.');
    const relay = get(identifier(req.params.id));
    const guestName = name(req.body.guestName);
    const guestAttempt = validateAttempt(req.body.guestAttempt);
    if (!sameConfig(relay.challenge, guestAttempt.config)) throw new InputError('Play the exact challenge attached to this invitation.');
    if (guestAttempt.id === relay.hostAttempt.id) throw new InputError('The guest must submit a new attempt.');
    if (relay.status === 'completed') {
      if (relay.guestName === guestName && JSON.stringify(relay.guestAttempt) === JSON.stringify(guestAttempt)) { res.json(relay); return; }
      throw new InputError('This relay is already complete. Start a new remix to keep playing.', 409);
    }
    relay.guestName = guestName;
    relay.guestAttempt = guestAttempt;
    relay.status = 'completed';
    update.run(JSON.stringify(relay), relay.id);
    res.json(relay);
  }));
  return () => db.close();
}
