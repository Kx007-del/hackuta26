import { lazy, Suspense, useState } from 'react';
import { isLegacyShowcaseLink, SHOWCASE_REFERENCE } from './showcase';
import './fortnite-showcase.css';

const HillsidePreview = lazy(() => import('../packages/gameplay/HillsidePreview'));

export default function FortniteShowcase({ search = window.location.search }: { search?: string }) {
  const [playing, setPlaying] = useState(false);
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
        <p>Watch the Fortnite reference, then explore an original hillside from the same shoulder perspective.</p>
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
        <p className="showcase-eyebrow">02 / SCENE PREVIEW</p>
        <h2 id="practice-heading">EXPLORE THE HILLSIDE</h2>
        <p>Walk the ramp and landing with the cone already in place, or turn toward the ridge. The uphill marker is positioned at an estimated 61 m from spawn.</p>
        <p className="showcase-muted">Movement and mouse look are available. Firing and scoring are still being built.</p>
        {!playing
          ? <button type="button" className="showcase-start" onClick={() => setPlaying(true)}>START PRACTICE PREVIEW ↗</button>
          : <Suspense fallback={<p role="status">Loading hillside preview…</p>}>
              <HillsidePreview />
            </Suspense>}
      </section>
    </main>
    <footer className="showcase-footer">An original, game-inspired practice prototype. Reference footage shown for the showcase. No game affiliation implied.</footer>
  </div>;
}
