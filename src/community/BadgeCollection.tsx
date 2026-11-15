import { useState, type CSSProperties } from 'react';
import type { Profile } from '../../packages/progression/rules';
import { BadgeIcon } from './BadgeIcon';
import { collection } from './badges';

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function CommunityNav({ badges = false }: { badges?: boolean }) {
  return <nav className="community-subnav" aria-label="Leaderboards and collection">
    <a href="/leaderboards" aria-current={!badges ? 'page' : undefined}>Rankings</a>
    <a href="/leaderboards/badges" aria-current={badges ? 'page' : undefined}>My Badge Collection ↗</a>
  </nav>;
}
export default function BadgeCollection({ profile }: { profile: Profile | null }) {
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const badges = collection(profile?.badges), earned = badges.filter(b => b.earned).length;
  const visible = badges.filter(b => filter === 'all' || b.earned === (filter === 'earned'));
  return <section className="badge-vault" aria-labelledby="badge-vault-title">
    <header className="badge-vault-header"><div><p className="showcase-eyebrow">YOUR RUN. YOUR RECOGNITION.</p><h2 id="badge-vault-title">My Badge Collection</h2>
      <p>{profile ? `${profile.name}’s collection` : 'Your collection starts with your first eligible run.'} Five families. Every milestone earned through play.</p></div>
      <div className="badge-vault-total"><strong>{earned}<span>/ 5</span></strong><span>FAMILIES COLLECTED</span></div></header>
    <div className="badge-vault-progress" role="progressbar" aria-label="Badge families collected" aria-valuemin={0} aria-valuemax={5} aria-valuenow={earned}><span style={{ width: `${earned * 20}%` }} /></div>
    <div className="badge-filters" role="group" aria-label="Filter your badges">{(['all', 'earned', 'locked'] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
      {value === 'all' ? 'All badges' : value === 'earned' ? 'Collected' : 'To unlock'} <span>{value === 'all' ? 5 : value === 'earned' ? earned : 5 - earned}</span></button>)}</div>
    <p className="badge-results" role="status">{visible.length} {filter === 'all' ? 'badge families' : filter === 'earned' ? 'collected badge families' : 'badge families to unlock'}</p>
    {visible.length === 0 && <div className="badge-empty"><h3>Your collection is waiting.</h3><p>Finish an eligible run to earn First Run. Your awards appear here automatically.</p><a className="showcase-start" href="/">Watch &amp; play ↗</a></div>}
    <ul className="badge-vault-grid">{visible.map(b => <li className={`badge-card ${b.earned ? 'is-earned' : 'is-locked'}`} key={b.key} style={{ '--badge-color': b.color, '--badge-ink': b.ink } as CSSProperties}>
      <div className="badge-card-top"><span>{b.shape} / {b.key === 'first' ? 'STARTER' : b.key === 'regular' ? 'PRACTICE' : b.key === 'streak' ? 'CONSISTENCY' : b.key === 'top' ? 'RANKED' : 'MASTERY'}</span><b>{b.earned ? '✓ COLLECTED' : 'LOCKED'}</b></div>
      <div className="badge-card-art"><BadgeIcon id={b.latest?.id ?? b.ids[0]} earned={b.earned} size={112} /></div>
      <h3>{b.name}</h3><p className="badge-card-tagline">{b.tagline}</p>
      <p className="badge-card-requirement">{b.latest ? `${b.latest.name} · Earned ${date(b.latest.earnedAt!)} (UTC)` : b.milestones[0].criteria}</p>
      <ul className="badge-milestones" aria-label={`${b.name} milestones`}>{b.milestones.map(m => <li key={m.id} className={m.earnedAt ? 'is-earned' : ''}><span aria-hidden="true">{m.earnedAt ? '✓' : '◇'}</span><div><b>{m.name}</b><span>{m.criteria}</span></div><span className="visually-hidden">{m.earnedAt ? 'Earned' : 'Locked'}</span></li>)}</ul>
      {b.earned && b.next && <p className="badge-next">NEXT UP: {b.next.name}</p>}
      {b.earned && !b.next && <p className="badge-next">ALL MILESTONES COLLECTED</p>}
    </li>)}</ul>
    <p className="community-note">Your real awards only. Example leaderboard players do not add badges to this collection. Existing milestones are grouped into five families; earned dates and progress are preserved.</p>
  </section>;
}
