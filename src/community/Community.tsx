import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { BADGES, NAME_MAX, TIE_RULES, cleanDisplayName, type BadgeId, type Board, type Leaderboard, type Profile } from '../../packages/progression/rules';
import { showcaseBoard } from '../../packages/progression/showcase';
import { fetchBoard, fetchMe, saveName, type MeResponse } from './api';
import { BadgeIcon } from './BadgeIcon';
import { BADGE_FAMILIES, collection, compactBadges } from './badges';
import './community.css';

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };
const BADGE_NAMES = Object.fromEntries(BADGES.map(b => [b.id, b.name])) as Record<BadgeId, string>;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Next 00:00 UTC, shown in the player's local time so the day boundary is clear. */
function nextUtcReset(now = Date.now()) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return new Date(next).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Profile state shared by the progress panel and the community section. `version` bumps after each scored attempt. */
export function useProgression() {
  const [me, setMe] = useState<Load<MeResponse>>({ state: 'loading' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    fetchMe(request.signal)
      .then(data => setMe({ state: 'ready', data }))
      .catch(error => { if (!request.signal.aborted) setMe({ state: 'error', message: error instanceof Error ? error.message : 'Unavailable.' }); });
    return () => request.abort();
  }, [version]);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  const setProfile = useCallback((profile: Profile) => setMe(prev => prev.state === 'ready' ? { state: 'ready', data: { ...prev.data, profile } } : prev), []);
  return { me, version, refresh, setProfile };
}
export type Progression = ReturnType<typeof useProgression>;

function StorageNote({ durable }: { durable: boolean }) {
  return durable ? null : <p className="community-note">Heads-up: this demo server may reset saved progress when it restarts or redeploys.</p>;
}

/** Compact personal progress shown beside the game. */
export function ProgressPanel({ progression }: { progression: Progression }) {
  const { me } = progression;
  return <aside className="progress-panel" aria-labelledby="progress-panel-title">
    <h3 id="progress-panel-title">Your progress</h3>
    {me.state === 'loading' && <p className="community-note" role="status">Loading your progress…</p>}
    {me.state === 'error' && <p className="community-note" role="alert">{me.message} <button type="button" className="community-link" onClick={progression.refresh}>Try again</button></p>}
    {me.state === 'ready' && !me.data.profile && <p className="community-note">Finish an attempt to start earning XP. Your guest progress is saved in this browser.</p>}
    {me.state === 'ready' && me.data.profile && <ProgressSummary profile={me.data.profile} />}
  </aside>;
}

function ProgressSummary({ profile }: { profile: Profile }) {
  const earned = collection(profile.badges).filter(b => b.earned).length;
  return <div className="progress-summary">
    <p className="progress-summary__name">{profile.name}</p>
    <div className="progress-xp">
      <div className="progress-xp__label"><span>Today’s XP</span><b>{profile.xpToday} / {profile.xpCap}</b></div>
      <div className="progress-bar" role="progressbar" aria-label="XP earned today" aria-valuemin={0} aria-valuemax={profile.xpCap} aria-valuenow={profile.xpToday} aria-valuetext={`${profile.xpToday} of ${profile.xpCap} XP today`}>
        <span style={{ width: `${Math.min(100, (profile.xpToday / profile.xpCap) * 100)}%` }} />
      </div>
    </div>
    <dl className="progress-stats">
      <div><dt>Best score</dt><dd>{profile.bestScore ?? '—'}{profile.bestScore === null && <small>no score yet</small>}</dd></div>
      <div><dt>Eligible attempts</dt><dd>{profile.attempts}</dd></div>
      <div><dt>Total XP</dt><dd>{profile.xp}</dd></div>
      <div><dt>Streak</dt><dd>{profile.currentStreak} <small>longest {profile.longestStreak}</small></dd></div>
    </dl>
    <div className="progress-badges">
      <a href="/leaderboards/badges">Badge collection {earned} / {BADGE_FAMILIES.length} ↗</a>
      {earned > 0 ? <BadgeStrip ids={profile.badges.filter(b => b.earnedAt).map(b => b.id)} /> : <span className="community-muted">None yet</span>}
    </div>
    <p className="community-note">Daily XP resets at 00:00 UTC ({nextUtcReset()} your time).</p>
  </div>;
}

const TIE_TEXT: Record<Board, string> = TIE_RULES;
const TABS: Array<{ id: Board; label: string; metric: string }> = [
  { id: 'score', label: 'Highest Score', metric: 'Best score' },
  { id: 'streak', label: 'Play Streak', metric: 'Days' },
  { id: 'xp', label: 'Total XP', metric: 'XP' },
];

/** Community section: leaderboards, badge collection, name and the rules. */
export type BoardMode = 'showcase' | 'live';
export function CommunitySection({ progression }: { progression: Progression }) {
  const profile = progression.me.state === 'ready' ? progression.me.data.profile : null;
  const meta = progression.me.state === 'ready' ? progression.me.data : null;
  const [mode, setMode] = useState<BoardMode>('showcase');
  return <section className="showcase-community" aria-labelledby="community-heading">
    <p className="showcase-eyebrow">03 / COMMUNITY</p>
    <h2 id="community-heading">Leaderboards and badges</h2>
    <div className="community-grid">
      <div>
        <div className="board-mode" role="group" aria-label="Which standings to show">
          <button type="button" aria-pressed={mode === 'showcase'} onClick={() => setMode('showcase')}>Showcase leaderboard <small>example players</small></button>
          <button type="button" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Live standings <small>real players</small></button>
        </div>
        <Leaderboards version={progression.version} mode={mode} profile={profile} onShowcase={() => setMode('showcase')} />
      </div>
      <div className="community-side">
        <NameEditor profile={profile} onSaved={progression.setProfile} />
        <BadgeCollectionLink profile={profile} />
      </div>
    </div>
    <details className="community-rules">
      <summary>How progress works</summary>
      <ul>
        <li><b>Showcase leaderboard:</b> the example players are fictional and fixed, there to show how the boards work. They aren’t real users or activity, never appear in Live standings and never affect anyone’s badges. Your own row there uses your real progress; its number is a showcase position, not a rank.</li>
        <li><b>XP:</b> 10 XP for each eligible completed attempt, hit or miss, up to 200 XP per UTC day. Each attempt counts once; refreshing or resending it adds nothing.</li>
        <li><b>Eligible attempt:</b> one shot, at least 1.5 seconds after the attempt starts, after moving at least 3 m or turning at least 20°. Attempts less than 3 seconds apart don’t count.</li>
        <li><b>Days:</b> days run on UTC, using the server’s clock. A new day starts at 00:00 UTC ({nextUtcReset()} your time).</li>
        <li><b>Play Streak:</b> consecutive UTC days with at least one eligible attempt. More attempts on the same day don’t add to it. Missing a whole UTC day resets it; your longest streak is kept.</li>
        <li><b>Highest Score:</b> your best score from any eligible attempt. A new best updates the leaderboard straight away. Scores are partly AI-estimated and this isn’t anti-cheat.</li>
        <li><b>Champion:</b> at 00:00 UTC each day, the server saves who was Highest Score #1 at that moment. Champion means #1 at one checkpoint; Reigning Champion means #1 at seven checkpoints in a row.{meta && ` Checkpoints started on ${formatDate(meta.trackingSince)} (UTC).`}</li>
        <li><b>Guest profile:</b> progress belongs to this browser through a private cookie. It isn’t an account: clearing cookies or switching device or browser starts a new guest. Names aren’t verified and one person can have several guests.</li>
      </ul>
    </details>
    {meta && <StorageNote durable={meta.storageDurable} />}
  </section>;
}

function Leaderboards({ version, mode, profile, onShowcase }: { version: number; mode: BoardMode; profile: Profile | null; onShowcase: () => void }) {
  const [board, setBoard] = useState<Board>('score');
  const [data, setData] = useState<Load<Leaderboard>>({ state: 'loading' });
  const [retry, setRetry] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  useEffect(() => {
    if (mode !== 'live') return;
    const request = new AbortController();
    setData(prev => prev.state === 'ready' && prev.data.board === board ? prev : { state: 'loading' });
    fetchBoard(board, request.signal)
      .then(result => setData({ state: 'ready', data: result }))
      .catch(error => { if (!request.signal.aborted) setData({ state: 'error', message: error instanceof Error ? error.message : 'Unavailable.' }); });
    return () => request.abort();
  }, [board, version, retry, mode]);

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = (keys[event.key] + TABS.length) % TABS.length;
    setBoard(TABS[next].id);
    tabRefs.current[next]?.focus();
  }
  const tab = TABS.find(t => t.id === board)!;
  // Never show one board's rows under another tab while the new board loads.
  const view: Load<Leaderboard> = data.state === 'ready' && data.data.board !== board ? { state: 'loading' } : data;

  return <div className="community-boards">
    <div role="tablist" aria-label="Leaderboards" className="community-tabs">
      {TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[i] = el; }} type="button" role="tab" id={`${base}-tab-${t.id}`}
        aria-selected={board === t.id} aria-controls={`${base}-panel`} tabIndex={board === t.id ? 0 : -1}
        onClick={() => setBoard(t.id)} onKeyDown={event => onKey(event, i)}>{t.label}</button>)}
    </div>
    <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${board}`} className={`community-panel is-${mode}`} tabIndex={0}>
      {mode === 'showcase' && <ShowcaseTable board={board} metric={tab.metric} label={tab.label} profile={profile} />}
      {mode === 'live' && <>
      {view.state === 'loading' && <p className="community-note" role="status">Loading the {tab.label} board…</p>}
      {view.state === 'error' && <p className="community-note" role="alert">{view.message} <button type="button" className="community-link" onClick={() => setRetry(r => r + 1)}>Try again</button></p>}
      {view.state === 'ready' && <BoardTable board={view.data} metric={tab.metric} onShowcase={onShowcase} />}
      </>}
    </div>
  </div>;
}

function BoardTable({ board, metric, onShowcase }: { board: Leaderboard; metric: string; onShowcase: () => void }) {
  const empty: Record<Board, string> = {
    score: 'No scores yet. Finish an eligible attempt to set the first one.',
    streak: 'No active streaks yet. Finish an eligible attempt today to start one.',
    xp: 'No XP earned yet. Finish an eligible attempt to earn 10 XP.',
  };
  const youShown = board.entries.some(e => e.isYou);
  return <>
    {board.entries.length === 0
      ? <div className="community-empty">
          <p>{empty[board.board]}</p>
          <p>Live standings only list real players. <button type="button" className="community-link" onClick={onShowcase}>See the showcase leaderboard</button> to see how the boards look with example players.</p>
        </div>
      : <table className="community-table">
          <caption className="visually-hidden">{TABS.find(t => t.id === board.board)?.label} top {board.entries.length}</caption>
          <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">{metric}</th><th scope="col">Badges</th></tr></thead>
          <tbody>
            {board.entries.map(entry => <tr key={entry.rank} className={entry.isYou ? 'is-you' : undefined} aria-current={entry.isYou ? 'true' : undefined}>
              <td>#{entry.rank}</td>
              <td>{entry.name}{entry.isYou && <span className="community-you"> (you)</span>}</td>
              <td>{entry.value}</td>
              <td><BadgeStrip ids={entry.badges} /></td>
            </tr>)}
          </tbody>
        </table>}
    {board.you && !youShown && <p className="community-position">
      {board.you.rank ? <>Your position: <b>#{board.you.rank}</b> of {board.total} · {metric.toLowerCase()} {board.you.value}</> : 'You’re not on this board yet.'}
    </p>}
    <p className="community-note">Live standings: real guest players on this server. Ties: {board.tieRule}</p>
  </>;
}

/** Fixed example players plus the visitor's real progress, sorted by the live rules. Nothing here is saved. */
function ShowcaseTable({ board, metric, label, profile }: { board: Board; metric: string; label: string; profile: Profile | null }) {
  const rows = showcaseBoard(board, profile);
  const you = rows.find(r => r.kind === 'you');
  return <>
    <p className="showcase-banner"><b>Example players.</b> These players and results are fictional, for illustration only. They aren’t real users or real activity.</p>
    <table className="community-table">
      <caption className="visually-hidden">{label} showcase leaderboard with example players</caption>
      <thead><tr><th scope="col">Showcase position</th><th scope="col">Player</th><th scope="col">{metric}</th><th scope="col">Badges</th></tr></thead>
      <tbody>
        {rows.map(row => <tr key={`${row.kind}-${row.position}`} className={row.kind === 'you' ? 'is-you is-real' : 'is-example'}>
          <td>{row.position}</td>
          <td>{row.kind === 'you'
            ? <><span className="community-real-tag">You — real progress</span> {row.name}</>
            : <>{row.name} <span className="community-example-tag">Example</span></>}</td>
          <td>{row.value}</td>
          <td><BadgeStrip ids={row.badges} /></td>
        </tr>)}
      </tbody>
    </table>
    <p className="community-position">
      {you ? <>Your real progress would sit at <b>showcase position {you.position}</b> of {rows.length} among these examples. This isn’t a global rank: see Live standings for that.</>
        : profile ? 'You’re not on this board yet. Your row appears here once you have real progress for it.'
        : 'Finish an eligible attempt and your real progress will appear here as “You — real progress”.'}
    </p>
    <p className="community-note">Sorted with the same rules as Live standings. Ties: {TIE_TEXT[board]}</p>
  </>;
}

function BadgeStrip({ ids }: { ids: BadgeId[] }) {
  ids = compactBadges(ids);
  if (!ids.length) return <span className="community-muted">—</span>;
  return <span className="badge-strip" aria-label={ids.map(id => BADGE_NAMES[id]).join(', ')} role="img">
    {ids.map(id => <span key={id} title={BADGE_NAMES[id]}><BadgeIcon id={id} earned size={28} /></span>)}
  </span>;
}

function BadgeCollectionLink({ profile }: { profile: Profile | null }) {
  const badges = collection(profile?.badges), earned = badges.filter(b => b.earned).length;
  return <aside className="badge-collection-link"><p className="showcase-eyebrow">BUILT THROUGH PLAY</p><h3>Your badge collection</h3>
    <div className="badge-preview" aria-hidden="true">{badges.map(b => <BadgeIcon key={b.key} id={b.latest?.id ?? b.ids[0]} earned={b.earned} size={46} />)}</div>
    <p><b>{earned} / 5</b> families collected</p><a href="/leaderboards/badges">View my collection ↗</a></aside>;
}

function NameEditor({ profile, onSaved }: { profile: Profile | null; onSaved: (p: Profile) => void }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ kind: 'idle' });
  const id = useId();
  useEffect(() => { if (profile) setValue(profile.name); }, [profile?.name]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = cleanDisplayName(value);
    if (!name) { setStatus({ kind: 'error', message: 'Use 1–24 letters, numbers, spaces or . _ - ’' }); return; }
    setStatus({ kind: 'saving' });
    try {
      const { profile: saved } = await saveName(name);
      onSaved(saved);
      setStatus({ kind: 'saved', message: 'Name saved.' });
    } catch (error) { setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Couldn’t save the name.' }); }
  }
  return <form className="community-name" onSubmit={submit} noValidate>
    <label htmlFor={id}>Display name</label>
    <div>
      <input id={id} value={value} maxLength={NAME_MAX} autoComplete="nickname" placeholder="Pick a name"
        aria-describedby={`${id}-help ${id}-status`} aria-invalid={status.kind === 'error'} onChange={event => setValue(event.target.value)} />
      <button type="submit" disabled={status.kind === 'saving'}>{status.kind === 'saving' ? 'Saving…' : 'Save'}</button>
    </div>
    <p id={`${id}-help`} className="community-note">Shown on leaderboards. Up to {NAME_MAX} characters. Names aren’t unique or verified.</p>
    <p id={`${id}-status`} className="community-note" role="status">{status.kind === 'saved' || status.kind === 'error' ? status.message : ''}</p>
  </form>;
}
