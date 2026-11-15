import type { ScoreResponse } from '../packages/showcase-scoring/client';
import { BADGES } from '../packages/progression/rules';

function Bar({ label, value }: { label: string; value: number }) {
  return <li className="score-bar"><span>{label}</span><span className="score-bar__track" aria-hidden="true"><span style={{ width: `${value}%` }} /></span><b>{value}</b></li>;
}

const AI_LABELS: Record<string, string> = { setup: 'Set-up', turn: 'Turn', aimHold: 'Aim hold', shot: 'Shot', timing: 'Timing' };
const GAME_LABELS: Record<string, string> = { distance: 'Distance', turn: 'Turn', aimHold: 'Aim hold', onStructure: 'On the build / jump', singleHipShot: 'One hip-fire shot' };
const UNAVAILABLE: Record<string, string> = {
  'no-key': 'AI scoring isn’t set up on this server yet.',
  'rate-limited': 'AI scoring is busy right now.',
  timeout: 'AI scoring took too long.',
  'model-unavailable': 'The AI model isn’t available right now.',
};

export default function ScoreResult({ result }: { result: ScoreResponse }) {
  const { ai, telemetry } = result;
  return <div className="showcase-score__result">
    <p className="showcase-score__total"><b>{result.score}</b><span>/ 100</span>{!result.hit && <em>Missed — a miss halves your score.</em>}</p>
    {ai.status === 'ok' && <p className="showcase-score__feedback">{ai.feedback}</p>}
    <div className="showcase-score__parts">
      {ai.status === 'ok' && <div>
        <h4>AI comparison <small>{ai.similarity}/100</small></h4>
        <ul>{Object.entries(ai.components).map(([k, v]) => <Bar key={k} label={AI_LABELS[k] ?? k} value={v} />)}</ul>
      </div>}
      <div>
        <h4>Game data <small>{telemetry.score}/100 · {telemetry.distanceM} m · turned {Math.abs(telemetry.turnDeg)}° {telemetry.turnDeg < 0 ? 'left' : 'right'}</small></h4>
        <ul>{Object.entries(telemetry.components).map(([k, v]) => <Bar key={k} label={GAME_LABELS[k] ?? k} value={v} />)}</ul>
      </div>
    </div>
    <p className="showcase-score__note">
      {ai.status === 'ok' ? 'AI-estimated similarity to the reference — may be imperfect. Final score blends the AI comparison (60%) with game data (40%).'
        : ai.status === 'declined' ? 'Scored on game data only.'
        : `${UNAVAILABLE[ai.reason] ?? 'AI scoring is unavailable right now.'} Scored on game data only.`}
    </p>
    {result.progress && <AttemptProgressNote progress={result.progress} replayed={!!result.replayed} />}
  </div>;
}

const BADGE_NAMES: Record<string, string> = Object.fromEntries(BADGES.map(b => [b.id, b.name]));
function AttemptProgressNote({ progress, replayed }: { progress: NonNullable<ScoreResponse['progress']>; replayed: boolean }) {
  if (progress.status === 'not-counted') return <p className="showcase-score__progress is-muted">Not counted toward progress: {progress.reason}</p>;
  const xp = progress.xpAwarded > 0 ? `+${progress.xpAwarded} XP` : 'Daily XP cap reached (0 XP)';
  return <div className="showcase-score__progress">
    <p className="showcase-score__summary">
      <span><small>XP earned</small><b>{xp}</b></span>
      <span><small>Best score</small><b>{progress.bestScore ?? '—'}</b>{progress.newBest && <em>New best</em>}</span>
      <span><small>Today</small><b>{progress.xpToday}/{progress.xpCap} XP</b></span>
      <span><small>Streak</small><b>{progress.currentStreak} day{progress.currentStreak === 1 ? '' : 's'}</b></span>
    </p>
    {progress.newBadges.length > 0 && <p className="showcase-score__badge"><strong>New badge: {progress.newBadges.map(id => BADGE_NAMES[id] ?? id).join(', ')}</strong></p>}
    <p className="showcase-score__note">{replayed ? 'Already saved — this is the stored result, counted once.' : 'Saved to your progress.'}{progress.ranked ? ' Counts for Highest Score.' : ` ${progress.unrankedReason ?? 'Not ranked.'}`}</p>
  </div>;
}
