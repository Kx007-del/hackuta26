import type { CompetitionRules, CompetitionState } from '../../shared/competitions';
import { parseRules } from '../../packages/competitions/rules';

/** Fictional, in-memory presentation data. No identity, cookies, persistence or network access. */
export type DemoEvent = { id: string; rules: CompetitionRules; state: CompetitionState; participants: number; abandoned: number };
export type DemoResult = { id: string; eventId: string; playerId: string; name: string; score: number; hit: boolean; eligible: boolean; review: 'clear' | 'pending' | 'approved' | 'excluded'; flag: string; at: string };
export type DemoAudit = { action: string; detail: string; at: string };
export type HostDemoState = { events: DemoEvent[]; activeId: string; results: DemoResult[]; audit: DemoAudit[]; sequence: number; message: string };
export type DemoAction = { type: 'select'; id: string } | { type: 'save'; rules: CompetitionRules; create?: boolean }
  | { type: 'publish' | 'close' | 'finalize'; acknowledged?: boolean }
  | { type: 'review'; resultId: string; decision: 'approve' | 'exclude'; reason: string } | { type: 'reset' };
const BASE = Date.parse('2026-11-15T15:00:00.000Z');
export const DEMO_RULES: CompetitionRules = {
  title: 'Run It Back — Creator Showcase', description: 'A fictional community competition hosted by you for this presentation.',
  challengeTemplate: 'fortnite-hillside-v1', startsAt: '2026-11-15T15:00:00.000Z', endsAt: '2026-11-17T16:00:00.000Z', attemptLimit: 5,
  scoring: { method: 'server-game-data-v1', requireHit: false }, tieBreaker: 'score-earliest-v1', prizeDescription: 'Demonstration recognition only. No real prize or payout.',
};
export function createHostDemo(): HostDemoState {
  const names = ['Avery', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Taylor'];
  return { events: [
    { id: 'demo-showcase', rules: structuredClone(DEMO_RULES), state: 'published', participants: 24, abandoned: 13 },
    { id: 'demo-draft', rules: { ...structuredClone(DEMO_RULES), title: 'Your Next Community Session' }, state: 'draft', participants: 0, abandoned: 0 },
  ], activeId: 'demo-showcase', sequence: 0, message: '', results: Array.from({ length: 39 }, (_, i) => ({
    id: `demo-result-${i}`, eventId: 'demo-showcase', playerId: `demo-player-${i % 24}`, name: names[i % 24] ?? `Player ${i % 24 + 1}`,
    score: 96 - (i % 24) * 2 - (i >= 24 ? 5 : 0), hit: i % 3 !== 0, eligible: i !== 37 && i !== 38,
    review: i === 1 || i === 4 ? 'pending' : 'clear', flag: i === 1 ? 'Illustrative duplicate-telemetry flag.' : i === 4 ? 'Illustrative timing anomaly.' : '',
    at: new Date(BASE + (i + 1) * 60000).toISOString(),
  })), audit: [
    { action: 'Draft created', detail: 'Fictional event created by Demo Host (you).', at: '2026-11-15T14:00:00.000Z' },
    { action: 'Published', detail: 'Rules frozen; fictional results loaded for the presentation.', at: '2026-11-15T15:00:00.000Z' },
  ] };
}
export function demoMetrics(state: HostDemoState) {
  const event = state.events.find(e => e.id === state.activeId)!;
  const rows = state.results.filter(r => r.eventId === event.id);
  const started = rows.length + event.abandoned;
  return { participants: event.participants, started, completed: rows.length,
    eligible: rows.filter(r => r.eligible && ['clear','approved'].includes(r.review)).length,
    pending: rows.filter(r => r.review === 'pending').length, excluded: rows.filter(r => r.review === 'excluded').length,
    completionRate: started ? rows.length / started : 0 };
}
export function demoStandings(state: HostDemoState) {
  const event = state.events.find(e => e.id === state.activeId)!;
  const rows = state.results.filter(r => r.eventId === event.id && r.eligible && ['clear','approved'].includes(r.review));
  rows.sort((a,b) => b.score - a.score || (event.rules.tieBreaker === 'score-hit-earliest-v1' ? Number(b.hit) - Number(a.hit) : 0)
    || a.at.localeCompare(b.at) || a.playerId.localeCompare(b.playerId));
  const players = new Set<string>();
  return rows.filter(r => { if (players.has(r.playerId)) return false; players.add(r.playerId); return true; });
}
export function hostDemoReducer(state: HostDemoState, action: DemoAction): HostDemoState {
  if (action.type === 'reset') return createHostDemo();
  if (action.type === 'select') return state.events.some(e => e.id === action.id) ? { ...state, activeId: action.id, message: '' } : state;
  const event = state.events.find(e => e.id === state.activeId)!;
  const fail = (message: string) => ({ ...state, message });
  const record = (next: HostDemoState, title: string, detail: string) => ({ ...next, sequence: state.sequence + 1,
    message: `${title}. Demo only — no real event changed.`, audit: [...next.audit, { action: title, detail, at: new Date(BASE + (61 + state.sequence) * 60000).toISOString() }] });
  if (action.type === 'save') {
    if (!action.create && event.state !== 'draft') return fail('Published rules are frozen. Select a draft to edit.');
    let rules: CompetitionRules;
    try { rules = parseRules(action.rules); } catch (error) { return fail((error as Error).message); }
    if (action.create) {
      if (state.events.length >= 10) return fail('Demo limit reached. Reset the demo to start again.');
      const id = `demo-created-${state.sequence + 1}`;
      return record({ ...state, activeId: id, events: [...state.events, { id, rules, state: 'draft', participants: 0, abandoned: 0 }] }, 'Draft created', `Demo Host (you) created “${rules.title}”.`);
    }
    return record({ ...state, events: state.events.map(e => e.id === event.id ? { ...e, rules } : e) }, 'Draft saved', `Updated “${rules.title}” before publication.`);
  }
  if (action.type === 'review') {
    if (event.state === 'draft' || event.state === 'finalized') return fail('Review is unavailable in this state.');
    const reason = action.reason.trim();
    if (!reason || reason.length > 500) return fail('Add a review reason (1–500 characters).');
    const result = state.results.find(r => r.id === action.resultId && r.eventId === event.id);
    if (!result) return fail('Result does not belong to this demo event.');
    return record({ ...state, results: state.results.map(r => r.id === result.id ? { ...r, review: action.decision === 'approve' ? 'approved' : 'excluded' } : r) },
      action.decision === 'approve' ? 'Result approved' : 'Result excluded', `${result.name}: ${reason}`);
  }
  if (action.type === 'publish' && event.state !== 'draft') return fail('Only a draft can be published.');
  if (action.type === 'close' && event.state !== 'published') return fail('Only a published event can be closed.');
  if (action.type === 'finalize' && (event.state !== 'closed' || !action.acknowledged || demoMetrics(state).pending > 0)) return fail('Close entries, resolve pending reviews and acknowledge review before finalizing.');
  const target: CompetitionState = action.type === 'publish' ? 'published' : action.type === 'close' ? 'closed' : 'finalized';
  return record({ ...state, events: state.events.map(e => e.id === event.id ? { ...e, state: target } : e) },
    target === 'published' ? 'Published' : target === 'closed' ? 'Entries closed' : 'Standings finalized', `“${event.rules.title}” is now ${target}. Rules remain frozen.`);
}
