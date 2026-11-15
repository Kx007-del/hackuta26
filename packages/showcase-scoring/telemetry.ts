/**
 * Deterministic "telemetry" half of the showcase score: how closely the recorded
 * attempt matches the reference moment (docs/showcase/FORTNITE-REFERENCE-BRIEF.md §1, §5.2).
 * Pure and shared by the browser and the server; the server re-derives what it can.
 */

/** Ground truth from the reference clip (brief §1). */
export const REFERENCE = {
  /** Kill-feed distance in the clip, metres (horizontal). */
  distanceM: 61,
  /** Left turn from the start facing (≈265°) to the shot facing (≈200°), degrees. Negative = left. */
  turnDeg: -65,
  /** Steady aim before the shot, after the turn finished (≈1.13 s → 2.00 s in the clip). */
  aimHoldMs: 870,
} as const;

/** One attempt as the game records it. Angles are radians in the scene's compass convention (+ = right). */
export type AttemptTelemetry = {
  version: 1;
  /** Shots fired in this attempt (the showcase allows one). */
  shots: number;
  /** Aim-down-sights was active at the shot (the showcase has no ADS, so this is false). */
  ads: boolean;
  /** Facing at the start of the attempt and at the shot. */
  startHeading: number;
  shotHeading: number;
  /** Time the aim was held steady (no significant turning) right before the shot. */
  aimHoldMs: number;
  /** Time from the start of the attempt to the shot. */
  elapsedMs: number;
  /** Player feet position and state at the shot. */
  shooter: { x: number; y: number; z: number; grounded: boolean };
  /** The shot's ray (camera position and look direction). */
  ray: { origin: [number, number, number]; direction: [number, number, number] };
  /** The game's own hit result (the server recomputes it). */
  hit: boolean;
};

export type TelemetryParts = {
  hit: boolean;
  onStructure: boolean;
  distanceM: number;
  turnDeg: number;
  components: { distance: number; turn: number; aimHold: number; onStructure: number; singleHipShot: number };
  score: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Full marks within `full` of the ideal, falling linearly to zero at `zero`. */
export function falloff(error: number, full: number, zero: number) {
  const e = Math.abs(error);
  if (e <= full) return 100;
  if (e >= zero) return 0;
  return Math.round(100 * (1 - (e - full) / (zero - full)));
}
/** Smallest signed difference b - a in degrees, in (-180, 180]. */
export function signedTurnDeg(fromRad: number, toRad: number) {
  const deg = ((toRad - fromRad) * 180) / Math.PI;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export const TELEMETRY_WEIGHTS = { distance: 25, turn: 25, aimHold: 20, onStructure: 15, singleHipShot: 15 } as const;
/** A miss can never score above this, whatever else matches. */
export const MISS_CAP = 25;

/**
 * Score telemetry 0–100. `hit` and `onStructure` and `distanceM` should come from the
 * server's own recomputation, not the client's claim.
 */
export function scoreTelemetry(t: AttemptTelemetry, derived: { hit: boolean; onStructure: boolean; distanceM: number }): TelemetryParts {
  const turnDeg = signedTurnDeg(t.startHeading, t.shotHeading);
  const components = {
    distance: falloff(derived.distanceM - REFERENCE.distanceM, 1, 15),
    turn: falloff(turnDeg - REFERENCE.turnDeg, 8, 60),
    aimHold: falloff(t.aimHoldMs - REFERENCE.aimHoldMs, 400, 2500),
    onStructure: derived.onStructure ? 100 : 0,
    singleHipShot: t.shots === 1 && !t.ads ? 100 : 0,
  };
  let total = 0;
  for (const key of Object.keys(TELEMETRY_WEIGHTS) as Array<keyof typeof TELEMETRY_WEIGHTS>) total += components[key] * TELEMETRY_WEIGHTS[key];
  let score = Math.round(total / 100);
  if (!derived.hit) score = Math.min(score, MISS_CAP);
  return { hit: derived.hit, onStructure: derived.onStructure, distanceM: derived.distanceM, turnDeg, components, score: clamp(score, 0, 100) };
}

/** Blend weights for the final score. */
export const BLEND = { gemini: 60, telemetry: 40 } as const;
/** Final 0–100. When Gemini is unavailable the telemetry score stands alone. A miss is capped. */
export function blendScore(telemetry: number, gemini: number | null, hit: boolean) {
  const raw = gemini === null ? telemetry : (gemini * BLEND.gemini + telemetry * BLEND.telemetry) / 100;
  return Math.round(clamp(hit ? raw : Math.min(raw, MISS_CAP), 0, 100));
}

const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const vec3 = (v: unknown, lim: number): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(n => finite(n, -lim, lim));

/** Strict validation of client-sent telemetry. Returns undefined when anything is off. */
export function parseTelemetry(value: unknown): AttemptTelemetry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const s = v.shooter as Record<string, unknown> | undefined;
  const r = v.ray as Record<string, unknown> | undefined;
  if (v.version !== 1 || !Number.isInteger(v.shots) || !finite(v.shots, 0, 20) || typeof v.ads !== 'boolean' || typeof v.hit !== 'boolean') return undefined;
  if (!finite(v.startHeading, -1000, 1000) || !finite(v.shotHeading, -1000, 1000) || !finite(v.aimHoldMs, 0, 120000) || !finite(v.elapsedMs, 0, 600000)) return undefined;
  if (!s || typeof s !== 'object' || !finite(s.x, -200, 200) || !finite(s.y, -50, 100) || !finite(s.z, -200, 200) || typeof s.grounded !== 'boolean') return undefined;
  if (!r || typeof r !== 'object' || !vec3(r.origin, 300) || !vec3(r.direction, 2)) return undefined;
  const [dx, dy, dz] = r.direction;
  if (Math.hypot(dx, dy, dz) < .5) return undefined;
  return {
    version: 1, shots: v.shots as number, ads: v.ads, startHeading: v.startHeading, shotHeading: v.shotHeading,
    aimHoldMs: v.aimHoldMs, elapsedMs: v.elapsedMs, hit: v.hit,
    shooter: { x: s.x, y: s.y, z: s.z, grounded: s.grounded },
    ray: { origin: [...r.origin] as [number, number, number], direction: [dx, dy, dz] },
  };
}
