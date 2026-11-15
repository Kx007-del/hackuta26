export type ArenaId = 'rooftop-v1' | 'buildyard-v1' | 'tactical-v1';
export type TemplateId = 'jump' | 'spin180' | 'spin360' | 'ramp-shot' | 'wall-edit' | 'precision' | 'dash-peek';
export type MechanicState = { builds: number; dashes: number; speedAtShot: number; edited?: boolean };
type ReferenceMoment = { id: string; arenaId: ArenaId; name: string; start: number; end: number; createdAt: string };
export type UploadedClipReference = ReferenceMoment & { source?: 'upload'; contentType: string; size: number; duration: number };
export type LinkedClipReference = ReferenceMoment & { source: 'link'; provider: 'youtube' | 'tiktok'; videoId: string; url: string };
export type ClipReference = UploadedClipReference | LinkedClipReference;
export type ChallengeConfig = {
  schemaVersion: 1;
  arenaId: ArenaId;
  templateId: TemplateId;
  targetDistance: number;
  requiredSpinDegrees: 0 | 180 | 360;
  referenceClipId?: string;
};
export type ReplayFrame = {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  builds?: number;
  dashes?: number;
  edited?: boolean;
};
export type AttemptResult = {
  id: string;
  config: ChallengeConfig;
  success: boolean;
  targetHit: boolean;
  airborneAtShot: boolean;
  rotationDegrees: number;
  durationMs: number;
  frames: ReplayFrame[];
  shotTimeMs: number;
  mechanicState?: MechanicState;
  /** True when the ALIGN AIM practice assist was used during this attempt. */
  assisted?: boolean;
};
export type Relay = {
  id: string;
  challenge: ChallengeConfig;
  parentChallengeId?: string;
  hostName: string;
  guestName?: string;
  hostAttempt: AttemptResult;
  guestAttempt?: AttemptResult;
  createdAt: string;
  status: "waiting" | "completed";
};
export const DEFAULT_CONFIG: ChallengeConfig = {
  schemaVersion: 1,
  arenaId: "rooftop-v1",
  templateId: "jump",
  targetDistance: 14,
  requiredSpinDegrees: 0,
};
export const TARGET_DISTANCES = [14, 20, 26] as const;
export const ARENAS = [
  { id: 'rooftop-v1', game: 'CALL OF DUTY', title: 'ROOFTOP', detail: 'Military skyline · sniper · jump & spin', accent: '#bda67d', template: 'jump' },
  { id: 'buildyard-v1', game: 'FORTNITE', title: 'BUILDYARD', detail: 'Bright island · ramps · walls & edits', accent: '#78d5a3', template: 'ramp-shot' },
  { id: 'tactical-v1', game: 'VALORANT', title: 'COURTYARD', detail: 'Tactical lanes · precision · dash & peek', accent: '#e8aaa3', template: 'precision' },
] as const;
export function configForArena(arenaId: ArenaId): ChallengeConfig {
  return { ...DEFAULT_CONFIG, arenaId, templateId: ARENAS.find(a => a.id === arenaId)!.template, requiredSpinDegrees: 0 };
}
export function mechanicSatisfied(config: ChallengeConfig, state: MechanicState | undefined, airborne: boolean): boolean {
  if (config.arenaId === 'rooftop-v1') return airborne;
  if (!state || !Number.isFinite(state.speedAtShot) || state.speedAtShot < 0 || state.speedAtShot > 100 || !Number.isInteger(state.builds) || !Number.isInteger(state.dashes) || state.builds < 0 || state.dashes < 0 || state.builds > 30 || state.dashes > 30 || (state.edited !== undefined && typeof state.edited !== 'boolean')) return false;
  if (config.arenaId === 'buildyard-v1') return airborne && state.builds >= 1 && (config.templateId !== 'wall-edit' || state.edited === true);
  return !airborne && state.speedAtShot <= 0.35 && (config.templateId !== 'dash-peek' || state.dashes >= 1);
}
export function validConfig(c: unknown): c is ChallengeConfig {
  if (!c || typeof c !== "object") return false;
  const v = c as ChallengeConfig;
  return (
    v.schemaVersion === 1 &&
    ARENAS.some(a => a.id === v.arenaId) &&
    (v.referenceClipId === undefined || (typeof v.referenceClipId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v.referenceClipId))) &&
    TARGET_DISTANCES.includes(v.targetDistance as 14) &&
    ((v.arenaId === 'rooftop-v1' && ((v.templateId === "jump" && v.requiredSpinDegrees === 0) ||
      (v.templateId === "spin180" && v.requiredSpinDegrees === 180) ||
      (v.templateId === "spin360" && v.requiredSpinDegrees === 360))) ||
      (v.arenaId === 'buildyard-v1' && ['ramp-shot', 'wall-edit'].includes(v.templateId) && v.requiredSpinDegrees === 0) ||
      (v.arenaId === 'tactical-v1' && ['precision', 'dash-peek'].includes(v.templateId) && v.requiredSpinDegrees === 0))
  );
}
export const sameConfig = (a: ChallengeConfig, b: ChallengeConfig) =>
  a.schemaVersion === b.schemaVersion &&
  a.arenaId === b.arenaId &&
  a.templateId === b.templateId &&
  a.targetDistance === b.targetDistance &&
  a.requiredSpinDegrees === b.requiredSpinDegrees &&
  a.referenceClipId === b.referenceClipId;
