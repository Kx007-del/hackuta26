import express, { type Express, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { airborneOffBuild, rayHitsTarget, SPAWN_POINT, standingOnBuild, targetBase } from '../gameplay/hillsideScene';
import { ineligibleReason, type AttemptProgress } from '../progression/rules';
import type { ScoringProgress } from '../progression/server';
import { judgeAttempt, type GeminiOutcome } from './gemini';
import { blendScore, parseTelemetry, scoreTelemetry, type TelemetryParts } from './telemetry';

export const MAX_CLIP_BYTES = 8 * 1024 * 1024;
const CLIP_TYPES = new Set(['video/webm', 'video/mp4']);
const TELEMETRY_HEADER = 'x-score-telemetry';
const CONSENT_HEADER = 'x-score-ai';
/** Random id the browser makes once per attempt, so retries of the same attempt are recorded once. */
const ATTEMPT_HEADER = 'x-attempt-id';

export type ScoreResponse = {
  score: number;
  hit: boolean;
  telemetry: Omit<TelemetryParts, 'hit'>;
  ai: { status: 'ok'; similarity: number; components: Record<string, number>; feedback: string; confidence: number }
    | { status: 'unavailable'; reason: string }
    | { status: 'declined' };
  /** Community progress for this attempt (present when progression is enabled). */
  progress?: AttemptProgress;
};

type Options = {
  /** Read on each request so a key added later is picked up; never logged or returned. */
  env?: () => { apiKey?: string; model?: string; timeoutMs?: number };
  judge?: typeof judgeAttempt;
  referencePath?: string;
  maxConcurrent?: number;
  aiPerMinute?: number;
  requestsPerMinute?: number;
  now?: () => number;
  /** Optional community progression (XP, streaks, badges). Scoring works without it. */
  progress?: ScoringProgress;
};

export function registerShowcaseScoring(app: Express, options: Options = {}) {
  const env = options.env ?? (() => {
    // Optional override, e.g. GEMINI_TIMEOUT_MS=120000. Clamped to 10–170 s.
    const timeout = Number(process.env.GEMINI_TIMEOUT_MS);
    return {
      apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
      model: process.env.GEMINI_MODEL?.trim() || undefined,
      timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(170_000, Math.max(10_000, timeout)) : undefined,
    };
  });
  const judge = options.judge ?? judgeAttempt;
  const maxConcurrent = options.maxConcurrent ?? 2;
  const aiPerMinute = options.aiPerMinute ?? 6;
  const requestsPerMinute = options.requestsPerMinute ?? 30;
  const now = options.now ?? Date.now;
  let reference: { mimeType: string; base64: string } | undefined;
  const loadReference = () => reference ??= {
    mimeType: 'video/mp4',
    base64: readFileSync(options.referencePath ?? resolve('public/showcase/fortnite-reference.mp4')).toString('base64'),
  };

  let inFlight = 0;
  const requests = new Map<string, number[]>();
  const aiCalls = new Map<string, number[]>();
  const cache = new Map<string, { at: number; outcome: GeminiOutcome }>();
  const CACHE_MS = 10 * 60_000, CACHE_MAX = 50;
  function allow(bucket: Map<string, number[]>, key: string, limit: number) {
    const t = now(), recent = (bucket.get(key) ?? []).filter(x => t - x < 60_000);
    if (recent.length >= limit) { bucket.set(key, recent); return false; }
    recent.push(t); bucket.set(key, recent);
    if (bucket.size > 5000) for (const [k, v] of bucket) if (!v.some(x => t - x < 60_000)) bucket.delete(k);
    return true;
  }

  const raw = express.raw({ type: (req) => CLIP_TYPES.has(String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()), limit: MAX_CLIP_BYTES, inflate: false });
  app.post('/api/showcase/score', (req, res, next) => {
    const client = req.ip ?? 'unknown';
    if (!allow(requests, client, requestsPerMinute)) { res.status(429).json({ error: 'Too many scoring requests. Wait a minute and try again.' }); return; }
    raw(req, res, error => {
      if (error) { res.status((error as { status?: number }).status === 413 ? 413 : 400).json({ error: 'The attempt clip must be a WebM or MP4 video up to 8 MB.' }); return; }
      next();
    });
  }, async (req: Request, res: Response) => {
    let telemetryJson: unknown;
    try {
      const header = req.headers[TELEMETRY_HEADER];
      if (typeof header !== 'string' || header.length > 4096) throw new Error();
      telemetryJson = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    } catch { res.status(400).json({ error: 'Missing or invalid attempt data.' }); return; }
    const telemetry = parseTelemetry(telemetryJson);
    if (!telemetry) { res.status(400).json({ error: 'Missing or invalid attempt data.' }); return; }

    // The server's own view of the shot: distance, footing and hit come from shared scene geometry.
    const { shooter, ray } = telemetry;
    const origin = new THREE.Vector3(...ray.origin);
    const nearShooter = origin.distanceTo(new THREE.Vector3(shooter.x, shooter.y + 1.5, shooter.z)) <= 8;
    const hit = telemetry.shots === 1 && nearShooter && rayHitsTarget(origin, new THREE.Vector3(...ray.direction));
    const derived = {
      hit,
      // On the build, or in the air just off it (the clip's jump shot).
      onStructure: shooter.grounded ? standingOnBuild(shooter.x, shooter.z, shooter.y) : airborneOffBuild(shooter.x, shooter.z, shooter.y),
      distanceM: Math.round(Math.hypot(targetBase.x - shooter.x, targetBase.z - shooter.z) * 10) / 10,
    };
    const parts = scoreTelemetry(telemetry, derived);

    // Claim the attempt before any AI work: a replayed or duplicate request is recorded once.
    const progress = options.progress?.begin(req, res, req.headers[ATTEMPT_HEADER]);
    if (progress?.kind === 'replay') { res.setHeader('Cache-Control', 'no-store'); res.json(progress.body); return; }
    if (progress?.kind === 'busy') { res.status(409).json({ error: 'This attempt is still being scored.' }); return; }
    let finished = false;
    try {
      const consent = req.headers[CONSENT_HEADER] === 'yes';
      const clip = Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined;
      let outcome: GeminiOutcome | { status: 'declined' };
      if (!consent || !clip) outcome = { status: 'declined' };
      else {
        const mimeType = String(req.headers['content-type']).split(';')[0].trim().toLowerCase();
        const key = createHash('sha256').update(clip).digest('hex');
        const cached = cache.get(key);
        if (cached && now() - cached.at < CACHE_MS) outcome = cached.outcome;
        else if (!allow(aiCalls, req.ip ?? 'unknown', aiPerMinute) || inFlight >= maxConcurrent) outcome = { status: 'unavailable', reason: 'rate-limited' };
        else {
          inFlight += 1;
          try {
            const { apiKey, model, timeoutMs } = env();
            outcome = await judge({ apiKey, model, timeoutMs, reference: loadReference(), attempt: { mimeType, base64: clip.toString('base64') } });
          } finally { inFlight -= 1; }
          if (outcome.status === 'ok') {
            cache.set(key, { at: now(), outcome });
            if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
          } else console.error(`Showcase scoring: AI unavailable (${outcome.reason}).`);
        }
      }
      const ai: ScoreResponse['ai'] = outcome.status === 'ok'
        ? { status: 'ok', similarity: outcome.judgement.similarity, components: outcome.judgement.components, feedback: outcome.judgement.feedback, confidence: outcome.judgement.confidence }
        : outcome.status === 'declined' ? { status: 'declined' } : { status: 'unavailable', reason: outcome.reason };
      const base: ScoreResponse = {
        score: blendScore(parts.score, ai.status === 'ok' ? ai.similarity : null, hit),
        hit,
        telemetry: { onStructure: parts.onStructure, distanceM: parts.distanceM, turnDeg: Math.round(parts.turnDeg), components: parts.components, score: parts.score },
        ai,
      };
      const movedM = Math.hypot(shooter.x - SPAWN_POINT.x, shooter.z - SPAWN_POINT.z);
      const ineligible = ineligibleReason({ shots: telemetry.shots, elapsedMs: telemetry.elapsedMs, movedM, turnDeg: parts.turnDeg });
      const body: ScoreResponse = progress?.kind === 'claimed'
        ? progress.finish({ score: base.score, hit, aiStatus: ai.status, ineligible }, base)
        : progress?.kind === 'skip' ? { ...base, progress: { status: 'not-counted', reason: progress.reason } } : base;
      finished = true;
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } finally {
      if (!finished && progress?.kind === 'claimed') progress.abort();
    }
  });
}
