import type { ChallengeConfig } from '../../shared/contracts';
import { TARGET_DISTANCES, ARENAS } from '../../shared/contracts';
import './challenge-builder.css';

export type ChallengeBuilderProps = {
  config: ChallengeConfig;
  onChange: (config: ChallengeConfig) => void;
  proven: boolean;
  locked?: boolean;
};

const ROOFTOP_PRESETS = [
  { id: 'jump', spin: 0, number: '01', label: 'THE ORIGINAL', detail: 'Jump. Aim. Make it count.', mark: '↗' },
  { id: 'spin180', spin: 180, number: '02', label: 'HALF TURN', detail: 'Turn it around. Hit your shot.', mark: '↶' },
  { id: 'spin360', spin: 360, number: '03', label: 'FULL SEND', detail: 'One full rotation. One clean hit.', mark: '⟳' },
] as const;

export default function ChallengeBuilder({ config, onChange, proven, locked = false }: ChallengeBuilderProps) {
  const PRESETS = config.arenaId === 'rooftop-v1' ? ROOFTOP_PRESETS : config.arenaId === 'buildyard-v1' ? [
    {id:'ramp-shot' as const,spin:0 as const,number:'01',label:'RAMP RUSH',detail:'Build a ramp. Jump from it. Land the shot.',mark:'↗'},
    {id:'wall-edit' as const,spin:0 as const,number:'02',label:'EDIT & ELEVATE',detail:'Build a wall. Edit. Shoot through the opening.',mark:'◇'},
  ] : [
    {id:'precision' as const,spin:0 as const,number:'01',label:'DEAD STILL',detail:'Stop moving. Place the precision shot.',mark:'⌖'},
    {id:'dash-peek' as const,spin:0 as const,number:'02',label:'DASH & SETTLE',detail:'Dash out of cover. Stop. Fire.',mark:'↗'},
  ];
  const arena = ARENAS.find(a => a.id === config.arenaId)!;
  const preset = PRESETS.find((item) => item.id === config.templateId) ?? PRESETS[0];
  const difficulty = config.requiredSpinDegrees === 360 || config.targetDistance === 26
    ? 'EXPERT' : config.requiredSpinDegrees === 180 || config.targetDistance === 20 ? 'CHALLENGER' : 'ROOKIE';
  const spinObjective = config.requiredSpinDegrees ? `Rotate at least ${config.requiredSpinDegrees}°, then ` : '';

  function changePreset(item: typeof PRESETS[number]) {
    if (!locked) onChange({ ...config, templateId: item.id, requiredSpinDegrees: item.spin });
  }

  return (
    <section className="frb-challenge" aria-label={locked ? 'Your squad challenge' : 'Challenge builder'}>
      <div className="frb-challenge__eyebrow"><span className="frb-challenge__live-dot" />{arena.title} / {arena.game}</div>
      <div className="frb-challenge__heading-row">
        <h2>{locked ? 'THE CHALLENGE' : 'MAKE YOUR MOVE'}</h2>
        <span className={`frb-challenge__difficulty frb-challenge__difficulty--${difficulty.toLowerCase()}`}>{difficulty}</span>
      </div>
      <p className="frb-challenge__intro">{locked ? 'Your teammate set the shot. You write the next chapter.' : 'Pick your shot. Set the distance. Prove you can land it.'}</p>

      <fieldset className="frb-challenge__fieldset" disabled={locked}>
        <legend><span>01</span> PICK YOUR STYLE {locked && <span className="frb-challenge__locked-label">LOCKED FOR THIS RELAY</span>}</legend>
        <div className="frb-challenge__presets">
          {PRESETS.map((item) => (
            <button key={item.id} type="button" className={`frb-challenge__preset${config.templateId === item.id ? ' is-active' : ''}`} aria-pressed={config.templateId === item.id} onClick={() => changePreset(item)}>
              <span className="frb-challenge__preset-icon" aria-hidden="true">{item.mark}</span>
              <span className="frb-challenge__preset-content"><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className="frb-challenge__preset-value">{config.arenaId === 'rooftop-v1' ? `${item.spin}°` : item.number}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="frb-challenge__fieldset frb-challenge__distance-field" disabled={locked}>
        <legend><span>02</span> PUSH THE DISTANCE</legend>
        <div className="frb-challenge__distances" role="group" aria-label="Target distance">
          {TARGET_DISTANCES.map((distance, index) => (
            <button key={distance} type="button" className={`frb-challenge__distance${config.targetDistance === distance ? ' is-active' : ''}`} aria-pressed={config.targetDistance === distance} onClick={() => { if (!locked) onChange({ ...config, targetDistance: distance }); }}>
              <strong>{distance}<small>m</small></strong><span>{['CLOSE', 'LONG', 'EXTREME'][index]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="frb-challenge__objective">
        <span className="frb-challenge__crosshair" aria-hidden="true">⌖</span>
        <div><span className="frb-challenge__caption">YOUR OBJECTIVE · {preset.label}</span><p>{config.arenaId === 'rooftop-v1' ? `${spinObjective}hit the ${config.targetDistance}m target while airborne.` : config.arenaId === 'buildyard-v1' ? `Build ${config.templateId === 'wall-edit' ? 'and edit the wall; shoot through its opening' : 'a ramp; jump from it'}, then hit the ${config.targetDistance}m target while airborne.` : `${config.templateId === 'dash-peek' ? 'Dash out of cover, then stop and' : 'Stay grounded and still;'} hit the ${config.targetDistance}m precision target.`}</p></div>
      </div>
      <div className={`frb-challenge__gate${proven ? ' is-proven' : ''}`} role="status">
        <span className="frb-challenge__gate-symbol" aria-hidden="true">{proven ? '✓' : '◇'}</span>
        <div><strong>{proven ? (locked ? 'CHALLENGE COMPLETE' : 'PROVEN. READY TO PASS.') : (locked ? 'YOUR TURN TO RUN IT BACK' : 'LAND IT TO UNLOCK YOUR RELAY')}</strong><p>{proven ? (locked ? 'Your shot is ready for the squad replay.' : 'Your successful attempt unlocks the invitation link.') : (locked ? 'Match the challenge to complete the squad replay.' : 'Changing the challenge means proving the new shot.')}</p></div>
      </div>
    </section>
  );
}
