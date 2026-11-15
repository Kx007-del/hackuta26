import type { ArenaId, AttemptResult, ReplayFrame, TemplateId } from '../../shared/contracts';

/** Same target placement as packages/gameplay/shotRules.ts, kept here so this module stays free of three.js. */
export function leaderboardTarget(arenaId: ArenaId, targetDistance: number) {
  const size = arenaId === 'tactical-v1' ? { height: 1.7, radius: 0.42 }
    : arenaId === 'buildyard-v1' ? { height: 3.2, radius: 1.15 }
    : { height: 3.2, radius: 1.65 };
  return { x: 0, y: size.height, z: -targetDistance, radius: size.radius };
}

/** The frame recorded at the moment of the shot (the last frame at or before shotTimeMs). */
export function shotFrame(attempt: Pick<AttemptResult, 'frames' | 'shotTimeMs'>): ReplayFrame {
  let chosen = attempt.frames[attempt.frames.length - 1];
  for (let i = attempt.frames.length - 1; i >= 0; i--) {
    if (attempt.frames[i].t <= attempt.shotTimeMs) { chosen = attempt.frames[i]; break; }
  }
  return chosen;
}

/**
 * Closest distance in metres between the aim ray and the target centre.
 * Matches three.js Ray.distanceSqToPoint with the camera's YXZ Euler order, so
 * missMeters <= radius exactly when the live game's sphere hit test passes (cover aside).
 */
export function aimMiss(frame: Pick<ReplayFrame, 'x' | 'y' | 'z' | 'yaw' | 'pitch'>, arenaId: ArenaId, targetDistance: number) {
  const target = leaderboardTarget(arenaId, targetDistance);
  const dx = -Math.sin(frame.yaw) * Math.cos(frame.pitch);
  const dy = Math.sin(frame.pitch);
  const dz = -Math.cos(frame.yaw) * Math.cos(frame.pitch);
  const vx = target.x - frame.x, vy = target.y - frame.y, vz = target.z - frame.z;
  const along = vx * dx + vy * dy + vz * dz;
  const t = Math.max(0, along);
  const px = frame.x + dx * t - target.x, py = frame.y + dy * t - target.y, pz = frame.z + dz * t - target.z;
  return { missMeters: Math.hypot(px, py, pz), wrongWay: along < 0, radius: target.radius };
}

export type FumbleKind = 'wrong-way' | 'sky' | 'floor' | 'move-missing' | 'short-spin' | 'over-spin' | 'wide';
export const FUMBLE_LABELS: Record<FumbleKind, string> = {
  'wrong-way': 'Shot the wrong way entirely',
  sky: 'Aimed for the clouds',
  floor: 'Shot the floor',
  'move-missing': 'Hit it, but the move didn’t count',
  'short-spin': 'Ran out of spin',
  'over-spin': 'Spun right past it',
  wide: 'Just wide',
};

export type AttemptMetrics = {
  success: boolean;
  targetHit: boolean;
  missMeters: number;
  rotationDegrees: number;
  shotTimeMs: number;
  fumble: FumbleKind | null;
};

/** Pure, deterministic metrics for one attempt. Fumble labels describe the shot, never the player. */
export function attemptMetrics(attempt: AttemptResult): AttemptMetrics {
  const { arenaId, targetDistance, requiredSpinDegrees } = attempt.config;
  const frame = shotFrame(attempt);
  const { missMeters, wrongWay } = aimMiss(frame, arenaId, targetDistance);
  let fumble: FumbleKind | null = null;
  if (!attempt.success) {
    if (attempt.targetHit) {
      fumble = requiredSpinDegrees > 0 && attempt.rotationDegrees < requiredSpinDegrees ? 'short-spin' : 'move-missing';
    } else if (wrongWay) fumble = 'wrong-way';
    else if (frame.pitch > 0.45) fumble = 'sky';
    else if (frame.pitch < -0.35) fumble = 'floor';
    else if (requiredSpinDegrees > 0 && attempt.rotationDegrees < requiredSpinDegrees) fumble = 'short-spin';
    else if (requiredSpinDegrees > 0 && attempt.rotationDegrees > requiredSpinDegrees + 270) fumble = 'over-spin';
    else fumble = 'wide';
  }
  return {
    success: attempt.success,
    targetHit: attempt.targetHit,
    missMeters,
    rotationDegrees: attempt.rotationDegrees,
    shotTimeMs: attempt.shotTimeMs,
    fumble,
  };
}

export type LeaderboardRow = {
  id: string;
  player: string;
  arenaId: ArenaId;
  templateId: TemplateId;
  targetDistance: number;
  success: boolean;
  missMeters: number;
  rotationDegrees: number;
  shotTimeMs: number;
  fumble: FumbleKind | null;
  createdAt: string;
};

export type LeaderboardEntry = {
  rank: number;
  player: string;
  value: string;
  detail: string;
  arenaId: ArenaId;
  templateId: TemplateId;
  targetDistance: number;
};

export type CategoryId = 'closest' | 'fumbles' | 'fastest' | 'spin' | 'grinders';
export type LeaderboardCategory = { id: CategoryId; title: string; description: string; entries: LeaderboardEntry[] };

const PRESET_NAMES: Record<TemplateId, string> = {
  jump: 'Jump shot', spin180: '180°', spin360: '360°', 'ramp-shot': 'Ramp shot',
  'wall-edit': 'Wall edit', precision: 'Precision', 'dash-peek': 'Dash peek',
};
const ARENA_NAMES: Record<ArenaId, string> = { 'rooftop-v1': 'Rooftop', 'buildyard-v1': 'Buildyard', 'tactical-v1': 'Courtyard' };
const describe = (row: LeaderboardRow) => `${ARENA_NAMES[row.arenaId]} · ${PRESET_NAMES[row.templateId]} · ${row.targetDistance} m`;
const playerKey = (name: string) => name.toLocaleLowerCase();

/** Keep each player's best row by `better`, then rank. Ties go to the earlier attempt. */
function bestPerPlayer(rows: LeaderboardRow[], better: (a: LeaderboardRow, b: LeaderboardRow) => number, limit: number) {
  const best = new Map<string, LeaderboardRow>();
  for (const row of rows) {
    const key = playerKey(row.player);
    const current = best.get(key);
    if (!current || better(row, current) < 0 || (better(row, current) === 0 && row.createdAt < current.createdAt)) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => better(a, b) || a.createdAt.localeCompare(b.createdAt)).slice(0, limit);
}

export function buildLeaderboard(rows: LeaderboardRow[], limit = 10): LeaderboardCategory[] {
  const landed = rows.filter(r => r.success);
  const missed = rows.filter(r => !r.success && r.fumble);
  const entry = (row: LeaderboardRow, rank: number, value: string, detail = describe(row)): LeaderboardEntry =>
    ({ rank, player: row.player, value, detail, arenaId: row.arenaId, templateId: row.templateId, targetDistance: row.targetDistance });

  const closest = bestPerPlayer(landed, (a, b) => a.missMeters - b.missMeters, limit)
    .map((r, i) => entry(r, i + 1, `${Math.round(r.missMeters * 100)} cm from centre`));
  // Funniest fumbles: one per player, the wildest miss (furthest from the target).
  const fumbles = bestPerPlayer(missed, (a, b) => b.missMeters - a.missMeters, limit)
    .map((r, i) => entry(r, i + 1, FUMBLE_LABELS[r.fumble!], `${r.missMeters.toFixed(1)} m off · ${describe(r)}`));
  const fastest = bestPerPlayer(landed, (a, b) => a.shotTimeMs - b.shotTimeMs, limit)
    .map((r, i) => entry(r, i + 1, `${(r.shotTimeMs / 1000).toFixed(2)} s`));
  const spin = bestPerPlayer(landed.filter(r => r.arenaId === 'rooftop-v1' && r.rotationDegrees >= 1), (a, b) => b.rotationDegrees - a.rotationDegrees, limit)
    .map((r, i) => entry(r, i + 1, `${Math.round(r.rotationDegrees)}° of spin`));

  const counts = new Map<string, { row: LeaderboardRow; attempts: number; landed: number }>();
  for (const row of rows) {
    const key = playerKey(row.player);
    const current = counts.get(key) ?? { row, attempts: 0, landed: 0 };
    current.attempts += 1;
    if (row.success) current.landed += 1;
    if (row.createdAt > current.row.createdAt) current.row = row;
    counts.set(key, current);
  }
  const grinders = [...counts.values()]
    .sort((a, b) => b.attempts - a.attempts || b.landed - a.landed || a.row.player.localeCompare(b.row.player))
    .slice(0, limit)
    .map((c, i) => entry(c.row, i + 1, `${c.attempts} attempt${c.attempts === 1 ? '' : 's'}`, `${c.landed} landed`));

  return [
    { id: 'closest', title: 'Closest hit', description: 'Landed shots nearest the bullseye.', entries: closest },
    { id: 'fumbles', title: 'Funniest fumbles', description: 'The wildest misses, one per player.', entries: fumbles },
    { id: 'fastest', title: 'Quickest draw', description: 'Fastest landed shots from the start of the attempt.', entries: fastest },
    { id: 'spin', title: 'Most spin', description: 'Most rotation on a landed Rooftop shot.', entries: spin },
    { id: 'grinders', title: 'Never gives up', description: 'Most attempts posted.', entries: grinders },
  ];
}
