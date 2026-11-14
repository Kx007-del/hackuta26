import type { ErrorRequestHandler, Express, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sameConfig, validConfig, mechanicSatisfied, type MechanicState, type ClipReference, type AttemptResult, type Relay, type ReplayFrame } from '../../shared/contracts';

export const apiErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const details = error !== null && typeof error === 'object'
    ? error as { status?: unknown; type?: unknown } : {};
  const malformedJson = details.status === 400 && details.type === 'entity.parse.failed';
  const status = details.status === 413 ? 413 : malformedJson ? 400 : 500;
  if (status === 500) console.error('Unhandled server request error.');
  res.status(status).json({error: status === 413
    ? 'Replay is too large. Try a shorter attempt.'
    : malformedJson ? 'Invalid JSON request body.' : 'Something went wrong. Please retry.'});
};

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
const count = (v: unknown): v is number => bounded(v, 0, 30) && Number.isInteger(v);
export function validateAttempt(value: unknown): AttemptResult {
  if (!record(value) || !validConfig(value.config)) throw new InputError('Invalid challenge settings.');
  const config = value.config;
  let mechanicState: MechanicState | undefined;
  if (value.mechanicState !== undefined) {
    const s = value.mechanicState;
    if (!record(s) || !count(s.builds) || !count(s.dashes) || !bounded(s.speedAtShot, 0, 100) || (s.edited !== undefined && typeof s.edited !== 'boolean')) throw new InputError('Invalid mechanic state.');
    mechanicState = { builds: s.builds, dashes: s.dashes, speedAtShot: s.speedAtShot, ...(s.edited === undefined ? {} : { edited: s.edited }) };
  }
  if (value.success !== true || value.targetHit !== true || typeof value.airborneAtShot !== 'boolean' || !bounded(value.rotationDegrees, config.requiredSpinDegrees, 3600) || !mechanicSatisfied(config, mechanicState, value.airborneAtShot)) throw new InputError('Complete the required shot and mechanics before sharing.');
  if (!bounded(value.durationMs, 1, 60000) || !bounded(value.shotTimeMs, 0, value.durationMs)) throw new InputError('Invalid attempt timing.');
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 2000) throw new InputError('Replay must contain between 2 and 2000 frames.');
  const durationMs = value.durationMs;
  let previousTime = -1;
  const frames: ReplayFrame[] = value.frames.map((frame: unknown) => {
    if (!record(frame) || !bounded(frame.t, 0, durationMs) || frame.t < previousTime || !bounded(frame.x, -10000, 10000) || !bounded(frame.y, -10000, 10000) || !bounded(frame.z, -10000, 10000) || !bounded(frame.yaw, -1000000, 1000000) || !bounded(frame.pitch, -10, 10) || (frame.builds !== undefined && !count(frame.builds)) || (frame.dashes !== undefined && !count(frame.dashes)) || (frame.edited !== undefined && typeof frame.edited !== 'boolean')) throw new InputError('Invalid replay frames.');
    previousTime = frame.t;
    return { t: frame.t, x: frame.x, y: frame.y, z: frame.z, yaw: frame.yaw, pitch: frame.pitch, ...(frame.builds === undefined ? {} : { builds: frame.builds as number }), ...(frame.dashes === undefined ? {} : { dashes: frame.dashes as number }), ...(frame.edited === undefined ? {} : { edited: frame.edited as boolean }) };
  });
  return {
    id: identifier(value.id),
    config: { schemaVersion: 1, arenaId: config.arenaId, templateId: config.templateId, targetDistance: config.targetDistance, requiredSpinDegrees: config.requiredSpinDegrees, ...(config.referenceClipId === undefined ? {} : { referenceClipId: config.referenceClipId }) },
    success: true, targetHit: true, airborneAtShot: value.airborneAtShot,
    rotationDegrees: value.rotationDegrees, durationMs, frames, shotTimeMs: value.shotTimeMs,
    ...(mechanicState === undefined ? {} : { mechanicState }),
  };
}

/** Attempts are client-reported. These checks do not constitute competitive anti-cheat. */
export function registerApi(app: Express, options: {databasePath?: string; clipLookup?: (id: string) => ClipReference | undefined} = {}): () => void {
  const normalizeAttempt = (input: unknown): AttemptResult => {
    const attempt = validateAttempt(input);
    const id = attempt.config.referenceClipId;
    if (id !== undefined) {
      const clip = options.clipLookup?.(id);
      if (!clip || clip.id !== id || clip.arenaId !== attempt.config.arenaId) throw new InputError('Reference clip is missing or belongs to another environment.');
    }
    return attempt;
  };
  const configuredFile = options.databasePath ?? (process.env.DATABASE_PATH?.trim() || resolve('data/relays.sqlite'));
  const file = configuredFile === ':memory:' ? configuredFile : resolve(configuredFile);
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
    const hostAttempt = normalizeAttempt(req.body.hostAttempt);
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
    const guestAttempt = normalizeAttempt(req.body.guestAttempt);
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
