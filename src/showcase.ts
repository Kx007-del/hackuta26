import { configForArena } from '../shared/contracts';

// Keep the showcase entry separate from historical relay contracts and records.
export const SHOWCASE_CONFIG = configForArena('buildyard-v1');
export const SHOWCASE_REFERENCE = {
  src: '/showcase/fortnite-reference.mp4',
  title: 'FaZe Mews trickshot from 2019',
  durationSeconds: 3.104,
} as const;

export function isLegacyShowcaseLink(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('relay') || params.has('parent') ||
    params.getAll('arena').some(arena => arena !== 'buildyard-v1');
}
