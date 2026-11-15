import { COMPETITION_TEMPLATE, HOSTING_NOTICE } from '../../shared/competitions';

/** Fictional read-only fixtures. Never inserted into any real event/player table. */
export const competitionExamples = () => [
  // A full sponsored event, laid out the way a brand would run one. Every company, person,
  // prize and number here is made up; nothing can be entered and nothing is paid.
  { id: 'example-summit-rush-cup', code: 'EXAMPLE-SUMMIT', title: 'Summit Rush Ridge Cup',
    featured: true, organizer: 'Kestrel Esports (fictional)', sponsor: 'Summit Rush Energy (fictional brand)',
    package: 'Sponsor',
    tagline: 'One ramp. One turn. One shot. Two weeks to land the cleanest run-it-back on the ridge.',
    description: 'A two-week sponsored community cup on the curated hillside challenge. Qualify with your best eligible run, then the top 8 play a live final on stream.',
    challengeTemplate: COMPETITION_TEMPLATE, startsAt: '2026-11-22T17:00:00.000Z', endsAt: '2026-12-06T23:00:00.000Z',
    state: 'published', example: true, readOnly: true, hostingNotice: HOSTING_NOTICE,
    stats: { entrants: 1284, attempts: 9312, countries: 14, daysLeft: 'Starts in 7 days' },
    schedule: [
      { when: 'Nov 22 – Dec 3', what: 'Open qualifier: 5 attempts per player, best eligible score counts' },
      { when: 'Dec 4', what: 'Top 8 announced; organizer reviews every finalist clip' },
      { when: 'Dec 6, 7 PM ET', what: 'Live final on the Kestrel stream: one attempt each, highest score wins' },
    ],
    rules: [
      'Curated Fortnite-inspired hillside only; one shot per attempt.',
      'Eligible runs last at least 1.5 s and move 3 m or turn 20° before the shot.',
      'Score 0–100 from server game data; a miss halves the score. Ties go to the earliest submission.',
      'Open to players 13+. One account per player; duplicate accounts are removed.',
    ],
    prizes: [
      { place: '1st', reward: '$1,000 + Summit Rush Ridge jersey' },
      { place: '2nd', reward: '$500' },
      { place: '3rd', reward: '$250' },
      { place: '4th–8th', reward: '$150 each' },
    ],
    prizeDescription: 'Example prize pool for illustration only: $2,500 total. No real prizes, payments or payouts exist on this site.',
    leaderboard: [
      { rank: 1, name: 'Ridgeline Rae', score: 96 }, { rank: 2, name: 'Cone Climber', score: 93 },
      { rank: 3, name: 'Lefty Turner', score: 91 }, { rank: 4, name: 'Quiet Scope', score: 89 },
      { rank: 5, name: 'Midair Milo', score: 87 }, { rank: 6, name: 'Hillside Hana', score: 86 },
      { rank: 7, name: 'Tracer Tess', score: 84 }, { rank: 8, name: 'Ledge Lark', score: 82 },
    ] },
];
