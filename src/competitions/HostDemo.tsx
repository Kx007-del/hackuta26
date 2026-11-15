import { useReducer, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { CompetitionRules } from '../../shared/competitions';
import { parseRules } from '../../packages/competitions/rules';
import { createHostDemo, demoMetrics, demoStandings, DEMO_RULES, hostDemoReducer, type DemoResult } from './hostDemoModel';
import './host-demo.css';
const VIEWS = ['Overview', 'Create & edit', 'Leaderboard & review', 'Analytics', 'Audit log'] as const;
type View = typeof VIEWS[number];

/** Public simulation. It deliberately has no API client, identity or persistent-storage access. */
export default function HostDemo() {
  const [state, dispatch] = useReducer(hostDemoReducer, undefined, createHostDemo);
  const [view, setView] = useState<View>('Overview'), [creating, setCreating] = useState(false), [ack, setAck] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const event = state.events.find(e => e.id === state.activeId)!;
  const metrics = demoMetrics(state), standings = demoStandings(state);
  function newDraft() { setCreating(true); setView('Create & edit'); }
  function keyboard(e: KeyboardEvent, i: number) {
    const next = e.key === 'ArrowRight' ? (i + 1) % VIEWS.length : e.key === 'ArrowLeft' ? (i + VIEWS.length - 1) % VIEWS.length : e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : -1;
    if (next < 0) return; e.preventDefault(); setView(VIEWS[next]); tabs.current[next]?.focus();
  }
  return <section className="showcase-route events-view host-demo" aria-labelledby="host-demo-heading">
    <a href="/host">← Host an Event</a>
    <div className="host-demo-heading"><div><p className="showcase-eyebrow">YOUR COMMUNITY. YOUR RULES.</p><h1 id="host-demo-heading">Your host workspace.</h1><p>Run the event. Review the moments. See your community compete.</p></div>
      <div className="host-demo-avatar"><span aria-hidden="true">Y</span><div><b>You · Demo Host</b><small>Creator package · no charge</small></div></div></div>
    <aside className="host-demo-notice"><b>INTERACTIVE SHOWCASE DEMO</b><span>No sign-in needed. All events, players, results and analytics below are fictional. Controls only simulate changes in this page; real events and accounts are untouched. No payments or real prizes. Refresh or Reset restores the example.</span></aside>
    <div className="host-demo-workspace"><aside className="host-demo-events"><h2>Your demo events</h2>
      {state.events.map(e => <button className={e.id === event.id ? 'is-active' : ''} key={e.id} type="button" aria-pressed={e.id === event.id} onClick={() => { dispatch({ type: 'select', id: e.id }); setCreating(false); setAck(false); }}><span>{e.state}</span><b>{e.rules.title}</b><small>Fictional example · curated Fortnite</small></button>)}
      <button type="button" className="host-demo-new" onClick={newDraft}>+ Create demo event</button>
      <button type="button" className="host-demo-reset" onClick={() => { dispatch({ type: 'reset' }); setView('Overview'); setCreating(false); setAck(false); }}>↺ Reset demo</button>
      <p className="community-note">Real hosting stays behind account/guest ownership checks. This workspace is a separate simulation.</p></aside>
      <div className="host-demo-main"><div className="host-demo-event-heading"><div><p className="showcase-eyebrow">HOSTED BY YOU · DEMO</p><h2>{event.rules.title}</h2></div><span className={`host-demo-status is-${event.state}`}>{event.state}</span></div>
        <div className="host-demo-tabs" role="tablist" aria-label="Host demo features">{VIEWS.map((tab, i) => <button key={tab} ref={el => { tabs.current[i] = el; }} id={`host-demo-tab-${i}`} type="button" role="tab" aria-selected={view === tab} aria-controls="host-demo-panel" tabIndex={view === tab ? 0 : -1} onClick={() => setView(tab)} onKeyDown={e => keyboard(e, i)}>{tab}</button>)}</div>
        <p role="status" className="host-demo-feedback">{state.message}</p>
        <div role="tabpanel" id="host-demo-panel" aria-labelledby={`host-demo-tab-${VIEWS.indexOf(view)}`} tabIndex={0}>
          {view === 'Overview' && <>
            <div className="host-demo-metrics"><Metric label="Demo participants" value={metrics.participants} /><Metric label="Eligible attempts" value={metrics.eligible} /><Metric label="Completion rate" value={`${Math.round(metrics.completionRate * 100)}%`} /><Metric label="Needs review" value={metrics.pending} alert={metrics.pending > 0} /></div>
            <section className="event-card"><h3>Event controls</h3><p>Simulate the lifecycle: draft → published → closed → finalized. Publication freezes the rules; unresolved suspicious results block finalization.</p><div className="host-demo-actions">
              {event.state === 'draft' && <><button type="button" onClick={() => { setCreating(false); setView('Create & edit'); }}>Edit draft</button><button type="button" onClick={() => dispatch({ type: 'publish' })}>Publish demo event</button></>}
              {event.state === 'published' && <button type="button" onClick={() => dispatch({ type: 'close' })}>Close demo entries</button>}
              {event.state === 'closed' && <><label className="event-check"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I have reviewed the fictional entries.</label><button type="button" disabled={!ack} onClick={() => dispatch({ type: 'finalize', acknowledged: ack })}>Finalize demo standings</button></>}
              {event.state === 'finalized' && <p>Demo standings finalized. Reset the demo to explore the workflow again.</p>}
              <button type="button" className="host-demo-secondary" onClick={() => setView('Leaderboard & review')}>Review entries ({metrics.pending} pending)</button></div></section>
            <div className="event-grid"><section className="event-card"><h3>Frozen rules</h3><dl className="host-demo-rules"><dt>Challenge</dt><dd>Curated Fortnite hillside</dd><dt>Attempts</dt><dd>{event.rules.attemptLimit} per entrant</dd><dt>Scoring</dt><dd>Best eligible game-data score / 100</dd><dt>Ties</dt><dd>{event.rules.tieBreaker === 'score-hit-earliest-v1' ? 'Score → hit → earliest result → entrant ID' : 'Score → earliest result → entrant ID'}</dd><dt>Dates (illustrative UTC)</dt><dd>{event.rules.startsAt} → {event.rules.endsAt}</dd><dt>Prize description</dt><dd>{event.rules.prizeDescription}</dd></dl></section>
            <section className="event-card"><h3>Invite your community</h3><p>A real event has its own public link and separate standings. This safe preview only links back to the simulation.</p><label>Shareable demo page<input readOnly value="https://hackuta26.onrender.com/host/demo" /></label><p className="community-note">Event scores stay separate from global XP. Arbitrary uploaded clips do not become playable environments.</p></section></div>
            <details className="event-card"><summary>Preview public event page</summary><h3>{event.rules.title}</h3><p>{event.rules.description}</p><p>Demo only · {event.rules.attemptLimit} attempts · {event.rules.prizeDescription}</p><DemoTable entries={standings.slice(0,5)} /></details>
          </>}
          {view === 'Create & edit' && <DemoEditor key={`${event.id}:${creating}:${event.rules.title}`} initial={creating ? { ...structuredClone(DEMO_RULES), title: '' } : event.rules} locked={!creating && event.state !== 'draft'} creating={creating} onSave={rules => { dispatch({ type: 'save', rules, create: creating }); setCreating(false); }} onPublish={rules => { dispatch({ type: 'save', rules }); dispatch({ type: 'publish' }); }} onNew={newDraft} />}
          {view === 'Leaderboard & review' && <>
            <section className="event-card"><h3>Demo event leaderboard</h3><p>Fictional standings. One best eligible, clear/approved result per participant. Pending and excluded entries do not rank.</p><DemoTable entries={standings.slice(0,10)} /></section>
            <section className="event-card"><h3>Suspicious-entry review</h3><p>Try approving or excluding an entry with a reason. Rankings, analytics and the audit log update locally. Intrinsically ineligible results remain unranked.</p>
              {state.results.filter(r => r.eventId === event.id && (r.flag || r.review !== 'clear')).map(result => <DemoReview key={`${result.id}:${result.review}`} result={result} disabled={event.state === 'finalized'} onReview={(decision, reason) => dispatch({ type: 'review', resultId: result.id, decision, reason })} />)}
              {!state.results.some(r => r.eventId === event.id && r.flag) && <p>No flagged demo entries in this event.</p>}</section>
          </>}
          {view === 'Analytics' && <section className="event-card"><p className="showcase-eyebrow">FICTIONAL EVENT ANALYTICS</p><h3>The full picture.</h3><div className="host-demo-metrics"><Metric label="Participants" value={metrics.participants} /><Metric label="Reserved attempts" value={metrics.started} /><Metric label="Completed attempts" value={metrics.completed} /><Metric label="Eligible attempts" value={metrics.eligible} /><Metric label="Pending review" value={metrics.pending} /><Metric label="Excluded attempts" value={metrics.excluded} /></div>
            <div className="host-demo-completion"><div><b>Completion rate</b><strong>{Math.round(metrics.completionRate * 100)}%</strong></div><div className="host-demo-bar" role="progressbar" aria-label="Demo completion rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(metrics.completionRate * 100)}><span style={{width:`${metrics.completionRate * 100}%`}} /></div></div>
            <p>Completed attempts ÷ reserved attempts. Abandoned/expired reservations stay in the denominator. Participants are joined identities; eligible attempts exclude pending/excluded results. All numbers here come from the fictional demo dataset.</p></section>}
          {view === 'Audit log' && <section className="event-card"><h3>Demo workspace audit trail</h3><p>Simulated UTC timestamps and actions by Demo Host (you). Real hosting keeps an organizer-only server audit trail.</p><ol className="host-demo-audit">{state.audit.map((entry, i) => <li key={i}><time>{entry.at}</time><div><b>{entry.action}</b><p>{entry.detail}</p></div></li>)}</ol></section>}
        </div>
      </div>
    </div>
  </section>;
}
function Metric({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return <div className={`host-demo-metric${alert ? ' needs-review' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}
function DemoTable({ entries }: { entries: DemoResult[] }) {
  return <div className="event-table"><table><caption>Demo standings · fictional players and scores</caption><thead><tr><th>Rank</th><th>Player</th><th>Best score</th><th>Shot</th></tr></thead><tbody>{entries.map((r,i) => <tr key={r.id}><td>#{i+1}</td><td>{r.name}</td><td>{r.score}</td><td>{r.hit ? 'Hit' : 'Miss'}</td></tr>)}</tbody></table>{!entries.length && <p>No demo results in this event yet.</p>}</div>;
}
function DemoReview({ result, disabled, onReview }: { result: DemoResult; disabled: boolean; onReview: (decision:'approve'|'exclude', reason:string) => void }) {
  const [reason,setReason] = useState('');
  return <form className="host-demo-review" onSubmit={e => e.preventDefault()}><p><b>{result.name} · {result.score}/100</b> <span>{result.review}</span></p><p>{result.flag}</p><fieldset disabled={disabled}><legend>Demo moderation</legend><label>Review reason for {result.name}<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the decision" /></label><div className="host-demo-actions"><button type="button" disabled={!reason.trim()} onClick={()=>onReview('approve',reason)}>Approve {result.name}</button><button type="button" className="host-demo-secondary" disabled={!reason.trim()} onClick={()=>onReview('exclude',reason)}>Exclude {result.name}</button></div></fieldset></form>;
}
function DemoEditor({ initial, locked, creating, onSave, onPublish, onNew }: { initial: CompetitionRules; locked:boolean; creating:boolean; onSave:(r:CompetitionRules)=>void; onPublish:(rules:CompetitionRules)=>void; onNew:()=>void }) {
  const [rules,setRules]=useState(initial),[error,setError]=useState('');
  function update<K extends keyof CompetitionRules>(key:K,value:CompetitionRules[K]) { setRules(r=>({...r,[key]:value})); }
  function submit(e:FormEvent) { e.preventDefault(); try { const valid=parseRules(rules); setError(''); onSave(valid); } catch(error) { setError((error as Error).message); } }
  function publish() { try { const valid=parseRules(rules); setError(''); onPublish(valid); } catch(error) { setError((error as Error).message); } }
  return <form className="event-card" onSubmit={submit}><h3>{creating ? 'Create a demo event' : 'Event configuration'}</h3><p>{locked ? 'Published rules are frozen. Create a fresh demo draft to try editing.' : 'These fields mirror the real event setup. Saving or publishing only changes this simulation.'}</p><fieldset disabled={locked}><legend>Demo rules</legend>
    <label>Event title<input required maxLength={100} value={rules.title} onChange={e=>update('title',e.target.value)} /></label><label>Description<textarea maxLength={2000} value={rules.description} onChange={e=>update('description',e.target.value)} /></label>
    <label>Challenge<select value={rules.challengeTemplate} onChange={()=>{}}><option value="fortnite-hillside-v1">Curated Fortnite hillside</option></select></label>
    <div className="event-grid"><label>Start (UTC)<input type="datetime-local" required value={rules.startsAt.slice(0,16)} onChange={e=>update('startsAt',`${e.target.value}:00.000Z`)} /></label><label>End (UTC)<input type="datetime-local" required value={rules.endsAt.slice(0,16)} onChange={e=>update('endsAt',`${e.target.value}:00.000Z`)} /></label></div>
    <label>Attempt limit<input type="number" min={1} max={50} required value={rules.attemptLimit} onChange={e=>update('attemptLimit',Number(e.target.value))} /></label><label className="event-check"><input type="checkbox" checked={rules.scoring.requireHit} onChange={e=>update('scoring',{...rules.scoring,requireHit:e.target.checked})} />Require a hit</label>
    <label>Tie breaker<select value={rules.tieBreaker} onChange={e=>update('tieBreaker',e.target.value as CompetitionRules['tieBreaker'])}><option value="score-earliest-v1">Score → earliest result → entrant ID</option><option value="score-hit-earliest-v1">Score → hit → earliest result → entrant ID</option></select></label>
    <label>Prize description — no real prize<textarea maxLength={500} value={rules.prizeDescription} onChange={e=>update('prizeDescription',e.target.value)} /></label><button type="submit">{creating?'Create demo draft':'Save demo draft'}</button></fieldset>
    {locked ? <button type="button" className="host-demo-secondary" onClick={onNew}>Create a new demo draft</button> : !creating && <button type="button" className="host-demo-secondary" onClick={publish}>Publish demo event</button>}{error&&<p role="alert">{error}</p>}
  </form>;
}
