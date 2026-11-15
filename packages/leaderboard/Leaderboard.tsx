import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ARENAS, type ArenaId } from '../../shared/contracts';
import { getLeaderboard, type LeaderboardResponse } from './client';
import type { CategoryId } from './scoring';
import './leaderboard.css';

type Props = {
  /** Change this number to reload after a new attempt is posted. */
  refreshKey?: number;
  /** Start filtered to this arena; viewers can switch to all arenas. */
  arenaId?: ArenaId;
  compact?: boolean;
  id?: string;
};

export default function Leaderboard({ refreshKey = 0, arenaId, compact = false, id }: Props) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<CategoryId>('closest');
  const [arena, setArena] = useState<ArenaId | 'all'>(arenaId ?? 'all');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();

  useEffect(() => { setArena(arenaId ?? 'all'); }, [arenaId]);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    getLeaderboard(arena === 'all' ? undefined : arena, controller.signal)
      .then(setData)
      .catch(cause => { if (cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'The leaderboard is unavailable right now.'); });
    return () => controller.abort();
  }, [arena, refreshKey]);

  const categories = data?.categories ?? [];
  const selected = categories.find(c => c.id === category) ?? categories[0];
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : step ? (index + step + categories.length) % categories.length : -1;
    if (next < 0) return;
    event.preventDefault();
    setCategory(categories[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <section className={`leaderboard${compact ? ' leaderboard--compact' : ''}`} aria-labelledby={`${base}-title`} id={id}>
      <div className="leaderboard__head">
        <div>
          <span className="leaderboard__eyebrow">PLAYER BOARD</span>
          <h2 id={`${base}-title`}>Leaderboard</h2>
        </div>
        <label className="leaderboard__filter">
          <span>Arena</span>
          <select value={arena} onChange={e => setArena(e.target.value as ArenaId | 'all')}>
            <option value="all">All arenas</option>
            {ARENAS.map(a => <option key={a.id} value={a.id}>{a.title.charAt(0) + a.title.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="leaderboard__error" role="alert">{error}</p>}
      {!data && !error && <p className="leaderboard__empty" role="status">Loading the leaderboard…</p>}
      {selected && (
        <>
          <div className="leaderboard__tabs" role="tablist" aria-label="Leaderboard categories">
            {categories.map((c, index) => (
              <button
                key={c.id}
                ref={el => { tabs.current[index] = el; }}
                id={`${base}-tab-${c.id}`}
                role="tab"
                type="button"
                aria-selected={c.id === selected.id}
                aria-controls={`${base}-panel`}
                tabIndex={c.id === selected.id ? 0 : -1}
                onClick={() => setCategory(c.id)}
                onKeyDown={e => onKey(e, index)}
              >
                {c.title}
              </button>
            ))}
          </div>
          <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${selected.id}`} className="leaderboard__panel">
            <p className="leaderboard__description">{selected.description}</p>
            {selected.entries.length ? (
              <ol className="leaderboard__list">
                {selected.entries.map(entry => (
                  <li key={`${selected.id}-${entry.rank}`}>
                    <span className="leaderboard__rank" aria-hidden="true">{String(entry.rank).padStart(2, '0')}</span>
                    <span className="leaderboard__player">{entry.player}</span>
                    <span className="leaderboard__value">{entry.value}</span>
                    <span className="leaderboard__detail">{entry.detail}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="leaderboard__empty">No entries yet. Turn on “Post my attempts” in the arena and take the first spot.</p>
            )}
          </div>
          <p className="leaderboard__note">Scores are reported by players’ browsers and are not verified. Shots using the Align Aim practice assist are not ranked. {data!.attempts} attempt{data!.attempts === 1 ? '' : 's'} posted.</p>
        </>
      )}
    </section>
  );
}
