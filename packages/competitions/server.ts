import type { Express, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { COMPETITION_TEMPLATE, COMPETITION_CHALLENGE_VERSION, HOSTING_NOTICE, HOSTING_PACKAGES, type CompetitionReceipt } from '../../shared/competitions';
import type { AttemptTelemetry } from '../showcase-scoring/telemetry';
import { competitionExamples } from './examples';
import { CompetitionError, identifier, object, parseRules, reject, text } from './rules';
import { openCompetitionStore, type CompetitionStore, type ValidatedCompetitionScore } from './store';

export type CompetitionIdentity = { id: string; name: string };
export type CompetitionScoring = { score(req: Request, telemetry: AttemptTelemetry, result: ValidatedCompetitionScore): CompetitionReceipt };

/** Same-site cookie authentication is necessary, but public names/codes never grant authority. */
function sameOrigin(req: Request) {
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) reject(403, 'Cross-origin competition changes are not allowed.');
}

export function registerCompetitions(app: Express, options: {
  identity: (req: Request) => CompetitionIdentity | undefined;
  store?: CompetitionStore; now?: () => number; revision?: string | null;
}) {
  const store = options.store ?? openCompetitionStore({ now: options.now, revision: options.revision });
  const identity = (req: Request) => options.identity(req) ?? reject(401, 'Use your existing guest profile to sign in to this browser first.');
  const body = (req: Request) => object(req.body) ? req.body : reject(400, 'Expected a JSON object.');
  const wrap = (fn: (req: Request, res: Response) => void) => (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        sameOrigin(req);
        if (!req.is('application/json')) reject(415, 'Use application/json.');
      }
      fn(req, res);
    } catch (error) {
      if (error instanceof CompetitionError) res.status(error.status).json({ error: error.message });
      else { console.error('Competition request failed.'); res.status(500).json({ error: 'Competition request failed. Retry the same request id.' }); }
    }
  };
  app.get('/api/competitions/meta', wrap((_req, res) => res.json({
    templates: [{ id: COMPETITION_TEMPLATE, version: COMPETITION_CHALLENGE_VERSION, title: 'Curated Fortnite hillside',
      description: 'The existing playable hillside. Uploaded video does not generate a playable environment.' }],
    hosting: { demonstration: true, charged: false, notice: HOSTING_NOTICE, packages: HOSTING_PACKAGES },
    persistence: store.persistence, auth: { kind: 'guest-cookie', ownership: 'server-enforced', crossDeviceRecovery: false },
    boundaries: 'UTC server time: start inclusive, end exclusive. Attempt receipts must arrive before end and before the five-minute ticket expiry.',
  })));
  app.get('/api/competition-examples', wrap((_req, res) => res.json({ example: true, readOnly: true, events: competitionExamples() })));
  app.get('/api/hosting/preview', wrap((_req, res) => res.json({ demonstration: true, charged: false, notice: HOSTING_NOTICE,
    packages: HOSTING_PACKAGES.map(id => ({ id, label: id.replace('-demo', ''), demonstration: true, checkout: false, charge: 'No charge' })) })));
  app.get('/api/organizer/me', wrap((req, res) => {
    const actor = identity(req); res.json({ profile: { id: actor.id, name: actor.name }, hosting: store.organizer(actor.id), demonstration: true, notice: HOSTING_NOTICE });
  }));
  app.post('/api/organizer/enroll', wrap((req, res) => {
    const actor = identity(req), b = body(req);
    if (!HOSTING_PACKAGES.includes(b.package as typeof HOSTING_PACKAGES[number]) || b.acknowledgeDemo !== true || Object.keys(b).some(k => !['package', 'acknowledgeDemo'].includes(k))) reject(400, 'Select a hosting package and acknowledge that there is no charge or real prize.');
    res.json(store.enroll(actor.id, b.package as typeof HOSTING_PACKAGES[number]));
  }));
  app.get('/api/organizer/events', wrap((req, res) => res.json({ events: store.ownedList(identity(req).id), persistence: store.persistence })));
  app.post('/api/organizer/events', wrap((req, res) => {
    const key = identifier(req.headers['idempotency-key']);
    res.status(201).json({ event: store.create(identity(req).id, key, parseRules(body(req))) });
  }));
  app.get('/api/organizer/events/:id', wrap((req, res) => res.json({ event: store.owned(identity(req).id, String(req.params.id)) })));
  app.put('/api/organizer/events/:id', wrap((req, res) => {
    const b = body(req);
    if (Object.keys(b).some(k => !['version', 'rules'].includes(k))) reject(400, 'Expected version and rules only.');
    res.json({ event: store.edit(identity(req).id, String(req.params.id), Number(b.version), parseRules(b.rules)) });
  }));
  for (const action of ['publish', 'close', 'finalize'] as const) app.post(`/api/organizer/events/:id/${action}`, wrap((req, res) => {
    const b = body(req);
    if (Object.keys(b).some(k => !['version', 'reviewAcknowledged'].includes(k))) reject(400, 'Unknown transition field.');
    res.json({ event: store.transition(identity(req).id, String(req.params.id), Number(b.version), action, b.reviewAcknowledged === true) });
  }));
  app.get('/api/organizer/events/:id/analytics', wrap((req, res) => res.json({ analytics: store.analytics(identity(req).id, String(req.params.id)), definitions: {
    participants: 'Distinct guest identities that joined this event.', startedAttempts: 'Server reservations, including abandoned/expired attempts.',
    completedAttempts: 'Reservations with one validated server-scored result, including ineligible or excluded results.',
    eligibleAttempts: 'Rule-eligible completed attempts with clear/approved review status; pending/excluded results do not count.',
    completionRate: 'completedAttempts / startedAttempts, or 0 when no attempts were started.',
  } })));
  app.get('/api/organizer/events/:id/results', wrap((req, res) => res.json({ results: store.moderation(identity(req).id, String(req.params.id)) })));
  app.get('/api/organizer/events/:id/audit', wrap((req, res) => res.json({ audit: store.audit(identity(req).id, String(req.params.id)) })));
  app.post('/api/organizer/events/:id/results/:resultId/review', wrap((req, res) => {
    const b = body(req);
    if (!['flag', 'approve', 'exclude'].includes(String(b.decision)) || Object.keys(b).some(k => !['decision', 'reason'].includes(k))) reject(400, 'Choose flag, approve or exclude, with a reason.');
    res.json({ result: store.review(identity(req).id, String(req.params.id), String(req.params.resultId), b.decision as 'flag' | 'approve' | 'exclude', text(b.reason, 'review reason', 500)) });
  }));
  app.get('/api/competitions', wrap((req, res) => res.json({ events: store.browse(text(req.query.search ?? '', 'search', 100, true)), example: false, persistence: store.persistence })));
  app.get('/api/competitions/:code', wrap((req, res) => res.json({ event: store.publicEvent(String(req.params.code)) })));
  app.get('/api/competitions/:code/leaderboard', wrap((req, res) => {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000) reject(400, 'Invalid leaderboard offset.');
    res.json(store.leaderboard(String(req.params.code), offset));
  }));
  app.post('/api/competitions/:id/join', wrap((req, res) => {
    if (Object.keys(body(req)).length) reject(400, 'Join uses the authenticated identity, not a submitted name or owner id.');
    const actor = identity(req); res.json(store.join(actor.id, actor.name, String(req.params.id)));
  }));
  app.get('/api/competitions/:id/me', wrap((req, res) => res.json(store.entrant(identity(req).id, String(req.params.id)))));
  app.post('/api/competitions/:id/attempts', wrap((req, res) => {
    const b = body(req);
    if (Object.keys(b).some(k => k !== 'attemptId')) reject(400, 'Only attemptId is accepted. Scores cannot be submitted by clients.');
    res.status(201).json({ attempt: store.begin(identity(req).id, String(req.params.id), identifier(b.attemptId)) });
  }));
  const scoring: CompetitionScoring = {
    score(req, telemetry, result) {
      sameOrigin(req);
      const actor = identity(req);
      if ((Buffer.isBuffer(req.body) && req.body.length) || (object(req.body) && Object.keys(req.body).length)) reject(400, 'Competition results use validated telemetry only, not video or client scores.');
      const eventId = identifier(req.headers['x-competition-id']), ticketId = identifier(req.headers['x-competition-attempt']), clientId = identifier(req.headers['x-attempt-id']);
      const digest = createHash('sha256').update(JSON.stringify(telemetry)).digest('hex');
      return store.record(actor.id, eventId, ticketId, clientId, digest, result);
    },
  };
  return { store, scoring, close: () => store.close() };
}
