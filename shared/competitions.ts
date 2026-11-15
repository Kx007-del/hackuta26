/** Phase-1 competition contract. No browser, database or environment side effects. */
export const COMPETITION_TEMPLATE = 'fortnite-hillside-v1' as const;
export const COMPETITION_CHALLENGE_VERSION = 'hillside-2026-11-15-v1' as const;
export const HOSTING_NOTICE = 'Demonstration only — no charge, entry fees, real prizes, payment collection or payouts.';
export const HOSTING_PACKAGES = ['community-demo', 'creator-demo', 'sponsor-demo'] as const;
export type HostingPackage = typeof HOSTING_PACKAGES[number];
export type CompetitionState = 'draft' | 'published' | 'closed' | 'finalized';
export type TieBreaker = 'score-earliest-v1' | 'score-hit-earliest-v1';
export type CompetitionRules = {
  title: string; description: string; challengeTemplate: typeof COMPETITION_TEMPLATE;
  startsAt: string; endsAt: string; attemptLimit: number;
  scoring: { method: 'server-game-data-v1'; requireHit: boolean };
  tieBreaker: TieBreaker; prizeDescription: string;
};
export type CompetitionView = CompetitionRules & {
  id: string; code: string; publicPath: string; state: CompetitionState; version: number;
  challengeVersion: string; rulesFrozen: boolean; publishedAt: string | null; finalizedAt: string | null;
  example: false; hostingNotice: string; prizeNotice: string; storageDurable: false;
};
export type CompetitionStanding = { rank: number; entrantId: string; name: string; score: number; hit: boolean; achievedAt: string; resultId: string };
export type CompetitionAnalytics = {
  participants: number; startedAttempts: number; completedAttempts: number; eligibleAttempts: number;
  pendingReview: number; excludedAttempts: number; completionRate: number;
};
export type CompetitionReceipt = {
  eventId: string; attemptId: string; resultId: string; score: number; hit: boolean;
  eligible: boolean; ineligibleReason: string | null; review: 'clear' | 'pending' | 'approved' | 'excluded';
  submittedAt: string; replayed: boolean; globalXpAwarded: 0;
};
