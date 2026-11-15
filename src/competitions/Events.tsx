import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { HOSTING_NOTICE, HOSTING_PACKAGES, type CompetitionAnalytics, type CompetitionReceipt, type CompetitionRules, type CompetitionStanding, type CompetitionView } from '../../shared/competitions';
import { newAttemptId } from '../../packages/showcase-scoring/client';
import { api, eventCode, EventError, type Entrant, type EventEnvelope, type Ticket } from './api';
import './events.css';
const HillsidePreview = lazy(() => import('../../packages/gameplay/HillsidePreview'));

type Load<T> = { key: string; data?: T; error?: string; status?: number };
function useRemote<T>(path: string, version = 0) {
  const key = `${path}:${version}`;
  const [state, setState] = useState<Load<T>>({ key: '' });
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, undefined, 'GET', undefined, controller.signal).then(data => setState({ key, data }))
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error.message, status: error.status }); });
    return () => controller.abort();
  }, [path, key]);
  return state.key.startsWith(`${path}:`) ? state : { key };
}
function BusyOrError({ load }: { load: Load<unknown> }) {
  return load.error ? <p role="alert" className="event-error">{load.error}</p> : !load.data ? <p role="status">Loading…</p> : null;
}
export function EventDetails() {
  return <details className="event-notice"><summary>Event information</summary><p>{HOSTING_NOTICE}</p><p>Events and browser-linked ownership may reset when the server restarts or redeploys.</p></details>;
}
const packageLabel = (value: string) => value.replace(/-demo$/, '').replace(/^./, letter => letter.toUpperCase());
function Identity({ onReady }: { onReady: () => void }) {
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/progression/me/name', { name }); onReady(); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <form className="event-card" onSubmit={submit}><h3>Use your browser guest profile</h3>
    <p><a href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/host' : window.location.pathname)}`}>Sign in</a> for account access across devices, or continue with a guest profile below.</p>
    <p>Your display name is public. Your profile and event access are linked to this browser; cross-device recovery is not available.</p>
    <label>Display name<input required maxLength={24} value={name} autoComplete="nickname" onChange={e => setName(e.target.value)} /></label>
    <button disabled={busy}>Save guest profile</button>{error && <p role="alert">{error}</p>}</form>;
}
function Dates({ event }: { event: CompetitionView }) {
  return <p><time dateTime={event.startsAt}>{event.startsAt.replace('T', ' ').replace('.000Z', ' UTC')}</time> → <time dateTime={event.endsAt}>{event.endsAt.replace('T', ' ').replace('.000Z', ' UTC')}</time></p>;
}
function EventLink({ event }: { event: CompetitionView }) {
  return <article className="event-card"><p className="showcase-eyebrow">{event.state} · {event.code}</p><h3><a href={event.publicPath}>{event.title}</a></h3>
    <p>{event.description}</p><Dates event={event} /><p>{event.attemptLimit} attempts · Curated Fortnite hillside</p>
    <a href={event.publicPath}>View rules and event leaderboard ↗</a></article>;
}
type SampleEvent = {
  id: string; code: string; title: string; organizer: string; description: string; prizeDescription: string;
  startsAt: string; endsAt: string; featured?: boolean; sponsor?: string; package?: string; tagline?: string;
  stats?: { entrants: number; attempts: number; countries: number; daysLeft: string };
  schedule?: { when: string; what: string }[]; rules?: string[]; prizes?: { place: string; reward: string }[];
  leaderboard: { rank: number; name: string; score: number }[];
};
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
/** A full sponsored event from a fictional company, shown so visitors can see what a real one looks like. */
function FeaturedSample({ event }: { event: SampleEvent }) {
  return <article className="event-card event-featured" aria-labelledby={`${event.id}-title`}>
    <p className="showcase-eyebrow">{event.package} event · presented by {event.sponsor}</p>
    <h3 id={`${event.id}-title`}>{event.title}</h3>
    {event.tagline && <p className="event-featured__tagline">{event.tagline}</p>}
    <p>Hosted by {event.organizer} · {day(event.startsAt)} – {day(event.endsAt)} · code {event.code}</p>
    {event.stats && <dl className="event-metrics event-featured__stats">
      <div><dt>Entrants</dt><dd>{event.stats.entrants.toLocaleString('en-US')}</dd></div>
      <div><dt>Attempts</dt><dd>{event.stats.attempts.toLocaleString('en-US')}</dd></div>
      <div><dt>Countries</dt><dd>{event.stats.countries}</dd></div>
      <div><dt>Status</dt><dd className="event-featured__status">{event.stats.daysLeft}</dd></div>
    </dl>}
    <p>{event.description}</p>
    <div className="event-grid event-featured__grid">
      {event.prizes && <section><h4>Prize pool</h4><ul className="event-featured__list">{event.prizes.map(p => <li key={p.place}><b>{p.place}</b> {p.reward}</li>)}</ul><p className="event-featured__fine">{event.prizeDescription}</p></section>}
      {event.schedule && <section><h4>Schedule</h4><ul className="event-featured__list">{event.schedule.map(s => <li key={s.when}><b>{s.when}</b> {s.what}</li>)}</ul></section>}
    </div>
    {event.rules && <details><summary>Official rules</summary><ol>{event.rules.map(r => <li key={r}>{r}</li>)}</ol></details>}
    <div className="event-table"><table><caption>Qualifier standings</caption><thead><tr><th>Rank</th><th>Player</th><th>Best score</th></tr></thead>
      <tbody>{event.leaderboard.map(row => <tr key={row.rank}><td>{row.rank}</td><td>{row.name}</td><td>{row.score}</td></tr>)}</tbody></table></div>
    <p className="event-featured__fine">Example event: the sponsor, organizer, players and prizes are fictional.</p>
    <p className="event-featured__actions"><a className="showcase-start" href="/practice">Practice this challenge ↗</a> <a href="/host">Host an event like this ↗</a></p>
  </article>;
}
export function EventsBrowse() {
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [code, setCode] = useState(''), [error, setError] = useState('');
  const list = useRemote<{ events: CompetitionView[] }>(`/api/competitions?search=${encodeURIComponent(query)}`);
  const examples = useRemote<{ events: SampleEvent[] }>('/api/competition-examples');
  const featured = examples.data?.events.find(event => event.featured);
  return <section className="showcase-route events-view"><p className="showcase-eyebrow">COMPETE IN YOUR OWN COMMUNITY</p><h1>Join Events</h1>
    <p>Find a competition, review the rules and take your shot. Every event has its own leaderboard.</p><EventDetails />
    <div className="event-grid"><form className="event-card" onSubmit={e => { e.preventDefault(); setQuery(search); }}><label>Search published events<input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} /></label><button>Search</button></form>
    <form className="event-card" onSubmit={e => { e.preventDefault(); const parsed = eventCode(code); if (!parsed) { setError('Enter a valid event code or /events/ link.'); return; } window.history.pushState(null, '', `/events/${parsed}`); window.dispatchEvent(new PopStateEvent('popstate')); }}>
      <label>Event code or link<input value={code} maxLength={500} onChange={e => setCode(e.target.value)} /></label><button>Open event</button>{error && <p role="alert">{error}</p>}</form></div>
    {featured && <><h2>Featured event</h2><FeaturedSample event={featured} /></>}
    <h2>Upcoming &amp; live</h2><BusyOrError load={list} />{list.data && !list.data.events.length && <p>No matching published events yet. <a href="/host">Create the first event</a>.</p>}
    <div className="event-grid">{list.data?.events.map(event => <EventLink key={event.id} event={event} />)}</div>
  </section>;
}
export function PublicEvent({ code }: { code: string }) {
  const [version, refresh] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [ticket, setTicket] = useState<Ticket>();
  const requestId = useRef<string | undefined>(undefined);
  const load = useRemote<EventEnvelope>(`/api/competitions/${encodeURIComponent(code)}`, version);
  const event = load.data?.event;
  async function act(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); refresh(v => v + 1); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  return <section className="showcase-route events-view"><a href="/events">← Join Events</a><BusyOrError load={load} />{event && <>
    <p className="showcase-eyebrow">{event.state} · EVENT {event.code}</p><h1>{event.title}</h1><p>{event.description}</p><EventDetails />
    <section className="event-card"><h2>Rules &amp; dates</h2><Dates event={event} /><p>Start inclusive, end exclusive, using server UTC. Results must arrive before the end and before the five-minute attempt expiry. Joining early is allowed.</p>
      <p>{event.attemptLimit} attempts per guest. Abandoned and expired reservations count. Curated Fortnite hillside only; uploaded clips do not create playable worlds.</p>
      <p>Server game-data score, 0–100; misses halve the score. {event.scoring.requireHit ? 'A hit is required.' : 'Eligible misses may rank.'} One shot, at least 1.5 seconds, move 3 m or turn 20°.</p>
      <p>Ties: score, {event.tieBreaker === 'score-hit-earliest-v1' ? 'hit first, ' : ''}earliest server submission, then entrant ID. Best eligible approved/clear result per entrant. Event attempts do not award global XP.</p>
      <p><b>Prize information:</b> {event.prizeDescription || 'None.'}<br />{event.prizeNotice}</p><p>{event.rulesFrozen ? 'Published rules are frozen.' : 'Draft rules.'}</p></section>
    <EventBoard code={event.code} version={version} />
    <PlayerEntry key={event.id} event={event} version={version} busy={busy} act={act} refresh={() => refresh(v => v + 1)} onStart={async () => {
      requestId.current ??= newAttemptId();
      const result = await api<{ attempt: Ticket }>(`/api/competitions/${event.id}/attempts`, { attemptId: requestId.current });
      if (result.attempt.completed) { requestId.current = undefined; throw new Error('That attempt is already completed. Refresh its receipt before starting another.'); }
      setTicket(result.attempt); requestId.current = undefined;
    }} />
    {error && <p role="alert" className="event-error">{error}</p>}
    {ticket && <section className="event-card"><h2>Event attempt</h2><p>Expires {ticket.expiresAt}. Reset abandons this reservation; starting again consumes another attempt.</p>
      <Suspense fallback={<p>Loading the curated hillside…</p>}><HillsidePreview key={ticket.id}
        competition={{ eventId: event.id, ticketId: ticket.id, attemptId: ticket.attemptId }} onScored={() => refresh(v => v + 1)} onEventReset={() => { setTicket(undefined); refresh(v => v + 1); }} /></Suspense></section>}
  </>}</section>;
}
function PlayerEntry({ event, version, busy, act, refresh, onStart }: { event: CompetitionView; version: number; busy: boolean; act: (fn: () => Promise<void>) => Promise<void>; refresh: () => void; onStart: () => Promise<void> }) {
  const me = useRemote<Entrant>(`/api/competitions/${event.id}/me`, version);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (me.status === 401) return <Identity onReady={refresh} />;
  const live = event.state === 'published' && clock >= Date.parse(event.startsAt) && clock < Date.parse(event.endsAt);
  return <section className="event-card"><h2>Your event entry</h2><BusyOrError load={me} />{me.data && <>
    <p>{me.data.usedAttempts} / {me.data.attemptLimit} attempts reserved. Limits and timing are enforced by the server.</p>
    {!me.data.joined ? <button disabled={busy || event.state !== 'published'} onClick={() => void act(async () => { await api(`/api/competitions/${event.id}/join`, {}); })}>Join this event</button>
      : <><p>Joined.</p><button disabled={busy || !live || me.data.usedAttempts >= me.data.attemptLimit} onClick={() => void act(onStart)}>Start event attempt</button>{!live && <p>Entries are not open at this time.</p>}</>}
    {me.data.results.map(result => <p key={result.resultId}>Result {result.score}/100 · {result.eligible ? result.review : `ineligible: ${result.ineligibleReason}`} · {result.submittedAt}. {result.review === 'pending' && 'Awaiting organizer review; not ranked.'}{result.review === 'excluded' && 'Excluded from standings.'}</p>)}
  </>}</section>;
}
function EventBoard({ code, version }: { code: string; version: number }) {
  const [offset, setOffset] = useState(0);
  const board = useRemote<{ entries: CompetitionStanding[]; total: number; finalized: boolean }>(`/api/competitions/${code}/leaderboard?offset=${offset}`, version);
  return <section className="event-card"><h2>Event leaderboard</h2><p>Only this event. Global rankings and XP are separate. Pending/excluded results do not rank.</p><BusyOrError load={board} />
    {board.data && <><p>{board.data.finalized ? 'Finalized standings' : 'Provisional standings'} · {board.data.total} ranked entrants</p>
      <div className="event-table"><table><caption className="visually-hidden">Competition-specific standings</caption><thead><tr><th>Rank</th><th>Player</th><th>Best score</th><th>Submitted (UTC)</th></tr></thead><tbody>{board.data.entries.map(row => <tr key={row.entrantId}><td>{row.rank}</td><td>{row.name}</td><td>{row.score}{row.hit ? ' · hit' : ' · miss'}</td><td>{row.achievedAt}</td></tr>)}</tbody></table></div>
      {!board.data.entries.length && <p>No eligible reviewed results yet.</p>}
      <button disabled={!offset} onClick={() => setOffset(v => Math.max(0, v - 100))}>Previous</button> <button disabled={offset + 100 >= board.data.total} onClick={() => setOffset(v => v + 100)}>Next</button></>}
  </section>;
}
export function HostHome() {
  const [version, refresh] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [hostingPackage, setPackage] = useState<string>(HOSTING_PACKAGES[0]);
  const me = useRemote<{ hosting: { package: string } | null }>('/api/organizer/me', version);
  const [created, setCreated] = useState<CompetitionView>();
  return <section className="showcase-route events-view"><p className="showcase-eyebrow">YOUR COMMUNITY. YOUR CHALLENGE.</p><h1>Host an Event</h1>
    <p>Create a competition for your community. Set the rules, invite players and track results on your event’s own leaderboard.</p><EventDetails />
    <section className="event-card host-demo-entry"><div><p className="showcase-eyebrow">PRESENT THE HOST EXPERIENCE</p><h2>Try the host demo.</h2><p>Explore a ready-made organizer workspace, fictional leaderboards, review controls and analytics. No account needed. No real data changed.</p></div><a className="showcase-start" href="/host/demo">Explore host demo ↗</a></section>
    <p>Hosting is free, with no payment required. Sign in to access your account’s events across devices, or use this browser’s guest profile.</p>
    {me.status === 401 ? <Identity onReady={() => refresh(v => v + 1)} /> : <BusyOrError load={me} />}
    {me.data && !me.data.hosting && <form className="event-card" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await api('/api/organizer/enroll', { package: hostingPackage, acknowledgeDemo: true }); refresh(v => v + 1); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>
      <h2>Choose your hosting package</h2><label>Package — free<select value={hostingPackage} onChange={e => setPackage(e.target.value)}>{HOSTING_PACKAGES.map(p => <option key={p} value={p}>{packageLabel(p)}</option>)}</select></label>
      <label className="event-check"><input type="checkbox" required />I understand hosting and entry are free, and no real prizes, payments or payouts are enabled.</label><button disabled={busy}>Start hosting</button></form>}
    {error && <p role="alert">{error}</p>}
    {me.data?.hosting && <><p>Your hosting package: {packageLabel(me.data.hosting.package)} · free.</p><OwnedList version={version} />
      {created ? <p role="status">Draft created: <a href={`/host/events/${created.id}`}>Manage {created.title} ↗</a></p> : <RulesForm onSaved={event => { setCreated(event); refresh(v => v + 1); }} />}</>}
  </section>;
}
function OwnedList({ version }: { version: number }) {
  const load = useRemote<{ events: CompetitionView[] }>('/api/organizer/events', version);
  return <section className="event-card"><h2>Your events</h2><BusyOrError load={load} /><ul>{load.data?.events.map(event => <li key={event.id}><a href={`/host/events/${event.id}`}>{event.title}</a> · {event.state}</li>)}</ul>{load.data?.events.length === 0 && <p>No events yet. Create your first draft below.</p>}</section>;
}
const defaultRules = (): CompetitionRules => ({ title: '', description: '', challengeTemplate: 'fortnite-hillside-v1',
  startsAt: new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(), endsAt: new Date(Math.floor(Date.now() / 60000) * 60000 + 3600000).toISOString(),
  attemptLimit: 3, scoring: { method: 'server-game-data-v1', requireHit: false }, tieBreaker: 'score-earliest-v1', prizeDescription: 'Recognition on the event leaderboard. No real prize.' });
function RulesForm({ event, onSaved }: { event?: CompetitionView; onSaved: (event: CompetitionView) => void }) {
  const [rules, setRules] = useState<CompetitionRules>(() => event ? Object.fromEntries(Object.keys(defaultRules()).map(k => [k, event[k as keyof CompetitionRules]])) as CompetitionRules : defaultRules());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const id = useRef(newAttemptId());
  function field<K extends keyof CompetitionRules>(key: K, value: CompetitionRules[K]) { setRules(r => ({ ...r, [key]: value })); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = event ? await api<EventEnvelope>(`/api/organizer/events/${event.id}`, { version: event.version, rules }, 'PUT')
      : await api<EventEnvelope>('/api/organizer/events', rules, 'POST', { 'Idempotency-Key': id.current }); onSaved(result.event); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <form className="event-card event-form" onSubmit={submit}><h2>{event ? 'Event rules' : 'Create a draft'}</h2><fieldset disabled={busy || (!!event && event.rulesFrozen)}><legend>{event?.rulesFrozen ? 'Published rules are frozen' : 'Curated Fortnite hillside — UTC dates'}</legend>
    <label>Title<input required maxLength={100} value={rules.title} onChange={e => field('title', e.target.value)} /></label>
    <label>Description<textarea maxLength={2000} value={rules.description} onChange={e => field('description', e.target.value)} /></label>
    <label>Challenge template<select value={rules.challengeTemplate} onChange={() => {}}><option value="fortnite-hillside-v1">Curated Fortnite hillside</option></select></label>
    <div className="event-grid"><label>Start (UTC, inclusive)<input type="datetime-local" required value={rules.startsAt.slice(0, 16)} onChange={e => field('startsAt', `${e.target.value}:00.000Z`)} /></label>
      <label>End (UTC, exclusive)<input type="datetime-local" required value={rules.endsAt.slice(0, 16)} onChange={e => field('endsAt', `${e.target.value}:00.000Z`)} /></label></div>
    <label>Attempt limit<input type="number" required min={1} max={50} value={rules.attemptLimit} onChange={e => field('attemptLimit', Number(e.target.value))} /></label>
    <p>Server game-data score, 0–100. Event scoring awards no global XP.</p><label className="event-check"><input type="checkbox" checked={rules.scoring.requireHit} onChange={e => field('scoring', { method: 'server-game-data-v1', requireHit: e.target.checked })} />Require a hit for eligibility</label>
    <label>Tie breaker<select value={rules.tieBreaker} onChange={e => field('tieBreaker', e.target.value as CompetitionRules['tieBreaker'])}><option value="score-earliest-v1">Score → earliest server submission → entrant ID</option><option value="score-hit-earliest-v1">Score → hit → earliest server submission → entrant ID</option></select></label>
    <label>Prize description — example only, no real prize<textarea maxLength={500} value={rules.prizeDescription} onChange={e => field('prizeDescription', e.target.value)} /></label>
    {!event?.rulesFrozen && <button>{busy ? 'Saving…' : event ? 'Save draft' : 'Create draft'}</button>}</fieldset>{error && <p role="alert">{error} Retry uses the same request ID.</p>}</form>;
}
export function HostManager({ id }: { id: string }) {
  const [version, refresh] = useState(0);
  const load = useRemote<EventEnvelope>(`/api/organizer/events/${encodeURIComponent(id)}`, version);
  return <section className="showcase-route events-view"><a href="/host">← Host an Event</a><h1>Manage your event</h1><EventDetails /><BusyOrError load={load} />
    {load.status === 401 && <Identity onReady={() => refresh(v => v + 1)} />}
    {load.data && <OwnedDetails key={`${id}:${load.data.event.version}`} event={load.data.event} version={version} refresh={() => refresh(v => v + 1)} />}</section>;
}
function OwnedDetails({ event, version, refresh }: { event: CompetitionView; version: number; refresh: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [ack, setAck] = useState(false);
  const analytics = useRemote<{ analytics: CompetitionAnalytics; definitions: Record<string, string> }>(`/api/organizer/events/${event.id}/analytics`, version);
  const results = useRemote<{ results: (CompetitionReceipt & { entrantId: string; flags: string[] })[] }>(`/api/organizer/events/${event.id}/results`, version);
  const audit = useRemote<{ audit: { id: number; action: string; actorId: string; at: string; details: unknown }[] }>(`/api/organizer/events/${event.id}/audit`, version);
  async function transition(action: string) {
    setBusy(true); setError('');
    try { await api(`/api/organizer/events/${event.id}/${action}`, { version: event.version, ...(action === 'finalize' ? { reviewAcknowledged: ack } : {}) }); refresh(); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <><h2>{event.title}</h2><p>State: {event.state} · Version {event.version}</p><p>Share after publishing: <a href={event.publicPath}>{typeof location === 'undefined' ? '' : location.origin}{event.publicPath}</a></p>
    <RulesForm event={event} onSaved={refresh} />
    <div className="event-card"><h2>Publication &amp; entry control</h2><p>Publishing permanently freezes all rules. Closing rejects new entries and unfinished attempts. Finalization freezes rankings and analytics.</p>
      {event.state === 'draft' && <button disabled={busy} onClick={() => void transition('publish')}>Publish and freeze rules</button>}
      {event.state === 'published' && <button disabled={busy} onClick={() => void transition('close')}>Close entries</button>}
      {event.state === 'closed' && <><label className="event-check"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I reviewed all results and exclusions. Finalize this event.</label><button disabled={busy || !ack || !!analytics.data?.analytics.pendingReview} onClick={() => void transition('finalize')}>Finalize standings</button></>}
      {error && <p role="alert">{error}</p>}</div>
    <section className="event-card"><h2>Event analytics</h2><BusyOrError load={analytics} />{analytics.data && <><dl className="event-metrics">{Object.entries(analytics.data.analytics).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{key === 'completionRate' ? `${(value * 100).toFixed(1)}%` : value}</dd></div>)}</dl><details><summary>Metric definitions</summary>{Object.entries(analytics.data.definitions).map(([key, value]) => <p key={key}><b>{key}:</b> {value}</p>)}</details></>}</section>
    <section className="event-card"><h2>Review results</h2><p>Pending and excluded entries do not rank. Approving cannot override rule ineligibility. Every moderation action requires a reason and is audited.</p><BusyOrError load={results} />{results.data?.results.map(result => <ReviewResult key={`${result.resultId}:${result.review}`} event={event} result={result} onSaved={refresh} />)}{results.data?.results.length === 0 && <p>No submitted results yet.</p>}</section>
    <details className="event-card"><summary>Organizer audit trail</summary><BusyOrError load={audit} />{audit.data?.audit.map(entry => <div key={entry.id}><p>{entry.at} · {entry.action}</p><pre>{JSON.stringify(entry.details, null, 2)}</pre></div>)}</details>
  </>;
}
function ReviewResult({ event, result, onSaved }: { event: CompetitionView; result: CompetitionReceipt & { entrantId: string; flags: string[] }; onSaved: () => void }) {
  const [reason, setReason] = useState(''), [decision, setDecision] = useState('approve'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <form className="event-review" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await api(`/api/organizer/events/${event.id}/results/${result.resultId}/review`, { decision, reason }); onSaved(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>
    <p>{result.entrantId} · {result.score}/100 · {result.eligible ? 'rule eligible' : result.ineligibleReason} · {result.review}</p>{result.flags.map(flag => <p key={flag}>{flag}</p>)}
    {event.state !== 'finalized' && <fieldset disabled={busy}><legend>Organizer review</legend><label>Decision<select value={decision} onChange={e => setDecision(e.target.value)}><option value="approve">Approve</option><option value="exclude">Exclude</option><option value="flag">Flag for review</option></select></label>
      <label>Reason<input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><button>Save review</button></fieldset>}{error && <p role="alert">{error}</p>}</form>;
}
