import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { BADGES, NAME_MAX, cleanDisplayName, type BadgeId, type Board, type Profile } from '../../packages/progression/rules';
import { fetchMe, saveName, type MeResponse } from './api';
import { showcaseBoard } from '../../packages/progression/showcase';
import { BadgeIcon } from './BadgeIcon';
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
  const earned = profile.badges.filter(b => b.earnedAt).length;
  return <div className="progress-summary">
    <p className="progress-summary__name">{profile.name}</p>
    <div className="progress-xp">
      <div className="progress-xp__label"><span>Today’s XP</span><b>{profile.xpToday} / {profile.xpCap}</b></div>
      <div className="progress-bar" role="progressbar" aria-label="XP earned today" aria-valuemin={0} aria-valuemax={profile.xpCap} aria-valuenow={profile.xpToday} aria-valuetext={`${profile.xpToday} of ${profile.xpCap} XP today`}>
        <span style={{ width: `${Math.min(100, (profile.xpToday / profile.xpCap) * 100)}%` }} />
      </div>
    </div>
    <dl className="progress-stats">
      <div><dt>Best score</dt><dd>{profile.bestScore ?? '—'}{profile.bestScore === null && <small>no ranked score yet</small>}</dd></div>
      <div><dt>Eligible attempts</dt><dd>{profile.attempts}</dd></div>
      <div><dt>Total XP</dt><dd>{profile.xp}</dd></div>
      <div><dt>Streak</dt><dd>{profile.currentStreak} <small>longest {profile.longestStreak}</small></dd></div>
    </dl>
    <div className="progress-badges">
      <span>Badges {earned} / {profile.badges.length}</span>
      {earned > 0 ? <BadgeStrip ids={profile.badges.filter(b => b.earnedAt).map(b => b.id)} /> : <span className="community-muted">None yet</span>}
    </div>
    <p className="community-note">Daily XP resets at 00:00 UTC ({nextUtcReset()} your time).</p>
  </div>;
}

const TABS: Array<{ id: Board; label: string; metric: string }> = [
  { id: 'score', label: 'Highest Score', metric: 'Best score' },
  { id: 'streak', label: 'Play Streak', metric: 'Days' },
  { id: 'xp', label: 'Total XP', metric: 'XP' },
];

/** Community section: leaderboards, badge collection, name and the rules. */
export function CommunitySection({ progression }: { progression: Progression }) {
  const profile = progression.me.state === 'ready' ? progression.me.data.profile : null;
  const meta = progression.me.state === 'ready' ? progression.me.data : null;
  return <section className="showcase-community" aria-labelledby="community-heading">
    <p className="showcase-eyebrow">03 / COMMUNITY</p>
    <h2 id="community-heading">Leaderboard</h2>
    <div className="community-grid">
      <Leaderboards profile={profile} />
      <div className="community-side">
        <NameEditor profile={profile} onSaved={progression.setProfile} />
        <BadgeCollection profile={profile} />
      </div>
    </div>
    <details className="community-rules">
      <summary>How progress works</summary>
      <ul>
        <li><b>XP:</b> 10 XP for each eligible completed attempt, hit or miss, up to 200 XP per UTC day. Each attempt counts once; refreshing or resending it adds nothing.</li>
        <li><b>Eligible attempt:</b> one shot, at least 1.5 seconds after the attempt starts, after moving at least 3 m or turning at least 20°. Attempts less than 3 seconds apart don’t count.</li>
        <li><b>Days:</b> days run on UTC, using the server’s clock. A new day starts at 00:00 UTC ({nextUtcReset()} your time).</li>
        <li><b>Play Streak:</b> consecutive UTC days with at least one eligible attempt. More attempts on the same day don’t add to it. Missing a whole UTC day resets it; your longest streak is kept.</li>
        <li><b>Highest Score:</b> your best score from attempts with a completed AI comparison. Game-data-only, declined or unavailable AI results earn XP but aren’t ranked. Scores are AI-estimated and this isn’t anti-cheat.</li>
        <li><b>Champion:</b> at 00:00 UTC each day, the server saves who was Highest Score #1 at that moment. Champion means #1 at one checkpoint; Reigning Champion means #1 at seven checkpoints in a row.{meta && ` Checkpoints started on ${formatDate(meta.trackingSince)} (UTC).`}</li>
        <li><b>Guest profile:</b> progress belongs to this browser through a private cookie. It isn’t an account: clearing cookies or switching device or browser starts a new guest. Names aren’t verified and one person can have several guests.</li>
      </ul>
    </details>
    {meta && <StorageNote durable={meta.storageDurable} />}
  </section>;
}

function Leaderboards({ profile }: { profile: Profile | null }) {
  const [board, setBoard] = useState<Board>('score');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = (keys[event.key] + TABS.length) % TABS.length;
    setBoard(TABS[next].id);
    tabRefs.current[next]?.focus();
  }
  const tab = TABS.find(t => t.id === board)!;

  return <div className="community-boards">
    <div role="tablist" aria-label="Leaderboard" className="community-tabs">
      {TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[i] = el; }} type="button" role="tab" id={`${base}-tab-${t.id}`}
        aria-selected={board === t.id} aria-controls={`${base}-panel`} tabIndex={board === t.id ? 0 : -1}
        onClick={() => setBoard(t.id)} onKeyDown={event => onKey(event, i)}>{t.label}</button>)}
    </div>
    <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${board}`} className="community-panel" tabIndex={0}>
      <LeaderboardTable board={board} profile={profile} metric={tab.metric} label={tab.label} />
    </div>
  </div>;
}

function LeaderboardTable({ board, profile, metric, label }: { board: Board; profile: Profile | null; metric: string; label: string }) {
  const rows = showcaseBoard(board, profile);
  return <table className="community-table">
    <caption className="visually-hidden">{label} leaderboard</caption>
    <thead><tr><th scope="col">Position</th><th scope="col">Player</th><th scope="col">{metric}</th><th scope="col">Badges</th></tr></thead>
    <tbody>
      {rows.map(row => <tr key={row.position} className={row.kind === 'you' ? 'is-you' : undefined} aria-current={row.kind === 'you' ? 'true' : undefined}>
        <td>#{row.position}</td>
        <td>{row.name}{row.kind === 'you' && <span className="community-you"> (you)</span>}</td>
        <td>{row.value}</td>
        <td><BadgeStrip ids={row.badges} /></td>
      </tr>)}
    </tbody>
  </table>;
}

function BadgeStrip({ ids }: { ids: BadgeId[] }) {
  if (!ids.length) return <span className="community-muted">—</span>;
  return <span className="badge-strip" aria-label={ids.map(id => BADGE_NAMES[id]).join(', ')} role="img">
    {ids.map(id => <span key={id} title={BADGE_NAMES[id]}><BadgeIcon id={id} earned size={22} /></span>)}
  </span>;
}

function BadgeCollection({ profile }: { profile: Profile | null }) {
  const badges = profile?.badges ?? BADGES.map(b => ({ ...b, earnedAt: null }));
  return <div className="badge-collection">
    <h3>Badges</h3>
    <ul>
      {badges.map(b => <li key={b.id} className={b.earnedAt ? 'is-earned' : 'is-locked'}>
        <BadgeIcon id={b.id} earned={!!b.earnedAt} />
        <div>
          <p className="badge-collection__name">{b.name} <span className="visually-hidden">{b.earnedAt ? '(earned)' : '(locked)'}</span></p>
          <p className="badge-collection__criteria">{b.criteria}</p>
          <p className="badge-collection__state">{b.earnedAt ? `Earned ${formatDate(b.earnedAt)} (UTC)` : 'Locked'}</p>
        </div>
      </li>)}
    </ul>
  </div>;
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
