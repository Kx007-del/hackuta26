import type { CSSProperties } from 'react';
import { ARENAS, configForArena, type ChallengeConfig } from '../../shared/contracts';
import './clip-workbench.css';

type Props = { config: ChallengeConfig; onChange: (config: ChallengeConfig) => void; locked?: boolean };

export default function EnvironmentPicker({ config, onChange, locked = false }: Props) {
  return <section className="environment-picker" aria-label="Choose a game environment">
    <div className="clip-section-label"><span>01 / CHOOSE YOUR WORLD</span><span>{locked ? 'RELAY ENVIRONMENT LOCKED' : 'THREE WORLDS. YOUR NEXT MOMENT.'}</span></div>
    <div className="environment-grid">
      {ARENAS.map((arena, index) => <button
        type="button"
        className={`environment-card environment-card--${arena.id}${config.arenaId === arena.id ? ' is-selected' : ''}`}
        style={{ '--environment-accent': arena.accent } as CSSProperties}
        key={arena.id}
        aria-pressed={config.arenaId === arena.id}
        disabled={locked}
        onClick={() => { if (config.arenaId !== arena.id) onChange(configForArena(arena.id)); }}
      >
        <span className="environment-card__top"><span>0{index + 1} / {arena.game}</span><span aria-hidden="true">{config.arenaId === arena.id ? '●' : '↗'}</span></span>
        <span className="environment-card__scene" aria-hidden="true"><i/><i/><i/><b/><b/></span>
        <strong>{arena.title}</strong>
        <span className="environment-card__detail">{arena.detail}</span>
        <span className="environment-card__selected">{config.arenaId === arena.id ? 'SELECTED ENVIRONMENT' : 'ENTER THIS WORLD'}</span>
      </button>)}
    </div>
    <p className="environment-picker__note">Original, game-inspired practice arenas. Choose your game, bring a clip, and build your version of the moment.</p>
  </section>;
}
