import { useId } from 'react';
import type { ChallengeConfig } from '../../shared/contracts';
import { practiceGuide } from './practice-guide';
import './practice-guide.css';

type Props = {
  config: ChallengeConfig;
  isReplay: boolean;
};

export default function PracticeGuide({ config, isReplay }: Props) {
  const titleId = useId();
  const { title, steps, controls } = practiceGuide(config);

  return (
    <section className="practice-guide" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {isReplay && <p>Use this guide when you return to live practice.</p>}
      <ol>
        {steps.map(step => <li key={step}>{step}</li>)}
      </ol>
      <h3>Practice controls</h3>
      <ul>
        {controls.map(control => <li key={control}>{control}</li>)}
      </ul>
    </section>
  );
}
