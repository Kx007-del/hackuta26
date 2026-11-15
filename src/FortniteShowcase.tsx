import { lazy, Suspense, useState } from 'react';
import PracticeGuide from '../packages/challenges/PracticeGuide';
import { isLegacyShowcaseLink, SHOWCASE_CONFIG, SHOWCASE_REFERENCE } from './showcase';
import type { AttemptResult } from '../shared/contracts';
import './fortnite-showcase.css';

const GameArena = lazy(() => import('../packages/gameplay/GameArena'));

export default function FortniteShowcase({ search = window.location.search }: { search?: string }) {
  const [playing, setPlaying] = useState(false);
  const [attempt, setAttempt] = useState<AttemptResult>();
  const [videoError, setVideoError] = useState(false);
  const legacyLink = isLegacyShowcaseLink(search);

  return <div className="fortnite-showcase">
    <header className="showcase-header">
      <a href="/" aria-label="Run It Back home"><img src="/brand/logo.png" alt="FaZe" /></a>
      <span>RUN IT BACK / HACKUTA26</span><span className="showcase-tag">FORTNITE SHOWCASE</span>
    </header>
    <main>
      {legacyLink && <p role="status" className="showcase-notice">This link belongs to an earlier demo. The showcase now uses one Fortnite reference. <a href="/">Open the showcase</a></p>}
      <section className="showcase-intro">
        <p className="showcase-eyebrow">ONE CLIP. ONE WORLD. YOUR MOMENT.</p>
        <h1>WATCH THE MOMENT.<br/><em>RUN IT BACK.</em></h1>
        <p>A Fortnite moment becomes a practice challenge. Start with the fixed reference below and explore the current prototype.</p>
      </section>
      <section className="showcase-reference" aria-labelledby="reference-heading">
        <div>
          <p className="showcase-eyebrow">01 / THE REFERENCE</p>
          <h2 id="reference-heading">{SHOWCASE_REFERENCE.title}</h2>
          <p>Watch the ramp, the cone on the landing, the turn toward the hillside, and the shot.</p>
          <p className="showcase-muted">This is the single reference for the hackathon build.</p>
        </div>
        <div>
          <video controls playsInline preload="metadata" aria-label="Fortnite showcase reference video" onError={() => setVideoError(true)}>
            <source src={SHOWCASE_REFERENCE.src} type="video/mp4"/>
            Your browser cannot play this reference. <a href={SHOWCASE_REFERENCE.src}>Open the video</a>.
          </video>
          {videoError && <p role="alert">The reference could not load. <a href={SHOWCASE_REFERENCE.src}>Open the video directly</a>.</p>}
        </div>
      </section>
      <section className="showcase-practice" aria-labelledby="practice-heading">
        <p className="showcase-eyebrow">02 / PRACTICE PROTOTYPE</p>
        <h2 id="practice-heading">ENTER THE BUILDYARD</h2>
        <p>The existing Fortnite-inspired arena is playable. The reference-matched hillside, preplaced cone, and third-person controls are still being built.</p>
        <p className="showcase-muted">Prototype rules currently require building a ramp and firing while airborne. These will change to match the reference.</p>
        {!playing ? <button type="button" className="showcase-start" onClick={() => setPlaying(true)}>START PRACTICE ↗</button> : <>
          <PracticeGuide config={SHOWCASE_CONFIG} isReplay={false}/>
          <Suspense fallback={<p role="status">Loading practice arena…</p>}>
            <GameArena config={SHOWCASE_CONFIG} onComplete={setAttempt}/>
          </Suspense>
          {attempt && <p role="status">{attempt.success ? 'Prototype challenge complete. Try another run in the arena.' : 'Keep practicing. Use the arena retry control for another run.'}</p>}
        </>}
      </section>
    </main>
    <footer className="showcase-footer">An original, game-inspired practice prototype. Reference footage shown for the showcase. No game affiliation implied.</footer>
  </div>;
}
