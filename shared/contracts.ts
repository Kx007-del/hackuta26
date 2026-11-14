export type ChallengeConfig = {
  schemaVersion: 1;
  arenaId: "rooftop-v1";
  templateId: "jump" | "spin180" | "spin360";
  targetDistance: number;
  requiredSpinDegrees: 0 | 180 | 360;
};
export type ReplayFrame = {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
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
export function validConfig(c: unknown): c is ChallengeConfig {
  if (!c || typeof c !== "object") return false;
  const v = c as ChallengeConfig;
  return (
    v.schemaVersion === 1 &&
    v.arenaId === "rooftop-v1" &&
    TARGET_DISTANCES.includes(v.targetDistance as 14) &&
    ((v.templateId === "jump" && v.requiredSpinDegrees === 0) ||
      (v.templateId === "spin180" && v.requiredSpinDegrees === 180) ||
      (v.templateId === "spin360" && v.requiredSpinDegrees === 360))
  );
}
export const sameConfig = (a: ChallengeConfig, b: ChallengeConfig) =>
  a.schemaVersion === b.schemaVersion &&
  a.arenaId === b.arenaId &&
  a.templateId === b.templateId &&
  a.targetDistance === b.targetDistance &&
  a.requiredSpinDegrees === b.requiredSpinDegrees;
