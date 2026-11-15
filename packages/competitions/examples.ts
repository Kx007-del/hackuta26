import { COMPETITION_TEMPLATE, HOSTING_NOTICE } from '../../shared/competitions';

/** Fictional read-only fixtures. Never inserted into any real event/player table. */
export const competitionExamples = () => [
  { id: 'example-lantern-open', code: 'EXAMPLE-LANTERN', title: 'Lantern Hillside Open',
    organizer: 'Fictional Lantern Pixel Collective', description: 'A fictional event illustrating the curated challenge.',
    challengeTemplate: COMPETITION_TEMPLATE, startsAt: '2027-06-01T12:00:00.000Z', endsAt: '2027-06-02T12:00:00.000Z',
    state: 'published', example: true, readOnly: true, hostingNotice: HOSTING_NOTICE,
    prizeDescription: 'Example only: an imaginary digital ribbon. No real prize.',
    leaderboard: [{ rank: 1, name: 'Example Player A', score: 88 }, { rank: 2, name: 'Example Player B', score: 74 }] },
  { id: 'example-willow-session', code: 'EXAMPLE-WILLOW', title: 'Willow Practice Session',
    organizer: 'Fictional Willow Lantern Studio', description: 'A second independent fictional event, not a partnership.',
    challengeTemplate: COMPETITION_TEMPLATE, startsAt: '2027-07-01T12:00:00.000Z', endsAt: '2027-07-01T18:00:00.000Z',
    state: 'published', example: true, readOnly: true, hostingNotice: HOSTING_NOTICE,
    prizeDescription: 'No prize is awarded for this sample event.',
    leaderboard: [{ rank: 1, name: 'Example Player C', score: 81 }] },
];
