import { lazy, Suspense, useEffect, useState } from 'react';
import { isLegacyShowcaseLink, SHOWCASE_REFERENCE } from './showcase';
import { CommunitySection, ProgressPanel, useProgression } from './community/Community';
import ScoreReport from './ShowcaseScoreReport';
import type { ScoreResponse } from '../packages/showcase-scoring/client';
import './fortnite-showcase.css';

const HillsidePreview = lazy(() => import('../packages/gameplay/HillsidePreview'));
const PRACTICE = '/practice';
const RESULTS = '/results';
const REPORT_KEY = 'showcase:attempt-report:v1';

function readReport(): ScoreResponse | null {
  try {
    const report = JSON.parse(window.sessionStorage.getItem(REPORT_KEY) ?? 'null') as ScoreResponse | null;
    return report && typeof report.score === 'number' && report.ai && report.telemetry ? report : null;
  } catch {
    return null;
  }
}

/** Copy only the completed report into the new tab's session, then break the opener link. */
function openReportTab(result: ScoreResponse): boolean {
  let tab: Window | null = null;
  try {
    tab = window.open('', '_blank');
    if (!tab) return false;
    tab.sessionStorage.setItem(REPORT_KEY, JSON.stringify(result));
    tab.opener = null;
    tab.location.replace(RESULTS);
    return true;
  } catch {
    tab?.close();
    return false;
  }
}

export default function FortniteShowcase({
  search = typeof window === 'undefined' ? '' : window.location.search,
  path = typeof window === 'undefined' ? '/' : window.location.pathname,
}: { search?: string; path?: string }) {
  const [fallback, setFallback] = useState<ScoreResponse | null>(null);
  const route = fallback ? RESULTS : path.replace(/\/+$/, '') || '/';
  const step = route === PRACTICE ? 'Practice' : route === RESULTS ? 'Results' : 'Reference';

  useEffect(() => {
    document.title = step + ' | Run It Back';
  }, [step]);

  function exitWithReport(result: ScoreResponse) {
    if (openReportTab(result)) {
      window.location.replace('/');
      return;
    }
    // Popup restrictions should still let the player finish in the current tab.
    try { window.sessionStorage.setItem(REPORT_KEY, JSON.stringify(result)); } catch { /* The report remains in memory. */ }
    window.history.replaceState(null, '', RESULTS);
    setFallback(result);
    window.scrollTo(0, 0);
  }

  return <div className="fortnite-showcase">
    <header className="showcase-header">
      <a className="showcase-brand" href="/" aria-label="Run It Back home">
        <img src="/brand/logo.png" alt="FaZe" />
        <span>RUN IT BACK</span>
      </a>
    </header>
    <main>
      {step === 'Results' && <nav className="showcase-steps" aria-label="Showcase steps">
        <a href="/">01 Reference</a>
        <a href={PRACTICE}>02 Practice</a>
        <span aria-current="page">03 Results</span>
      </nav>}
      {step === 'Practice' ? <section className="showcase-route" aria-labelledby="practice-heading">
        <h1 id="practice-heading">Take the trick shot</h1>
        <p className="showcase-muted">Run up the ramp, jump off the landing and turn toward the target. Take one shot, then exit to view your report.</p>
        {typeof window !== 'undefined' && <Suspense fallback={<p role="status">Loading the practice arena…</p>}>
          <HillsidePreview onExit={exitWithReport} />
        </Suspense>}
      </section> : step === 'Results' ? <ResultsPage current={fallback} /> : <HomePage search={search} />}
    </main>
    <footer className="showcase-footer">An original, game-inspired practice prototype. Reference footage shown for the showcase. No affiliation implied.</footer>
  </div>;
}

function ResultsPage({ current }: { current: ScoreResponse | null }) {
  const [stored] = useState(readReport);
  const result = current ?? stored;
  const progression = useProgression();
  return <>
    <section className="showcase-route" aria-labelledby="results-heading">
      <p className="showcase-eyebrow">03 / RESULTS</p>
      <h1 id="results-heading">Your shot report</h1>
      {result ? <section className="showcase-score" aria-labelledby="score-report-title">
        <h2 id="score-report-title">How close was your shot?</h2>
        <ScoreReport result={result} />
      </section> : <p className="showcase-muted">No attempt report in this tab yet. Play the trick shot to get a score and breakdown.</p>}
      <a className="showcase-start" href={PRACTICE}>{result ? 'Try another shot' : 'Try it yourself'} ↗</a>
      <ProgressPanel progression={progression} />
    </section>
    <CommunitySection progression={progression} />
  </>;
}

function HomePage({ search }: { search: string }) {
  const [videoError, setVideoError] = useState(false);
  return <>
    {isLegacyShowcaseLink(search) && <p role="status" className="showcase-notice">This link belongs to an earlier demo. The showcase now uses one Fortnite reference. <a href="/">Open the showcase</a></p>}
    <section className="showcase-intro">
      <p className="showcase-eyebrow">ONE CLIP. ONE WORLD. YOUR MOMENT.</p>
      <h1>WATCH THE MOMENT.<br/><em>RUN IT BACK.</em></h1>
      <p>Watch the original Fortnite trick shot, then take your own shot and see how it compares.</p>
    </section>
    <section className="showcase-reference" aria-labelledby="reference-heading">
      <div>
        <p className="showcase-eyebrow">01 / THE REFERENCE</p>
        <h2 id="reference-heading">{SHOWCASE_REFERENCE.title}</h2>
        <p>Watch the ramp, the cone on the landing, the turn toward the hillside, and the shot.</p>
      </div>
      <div>
        <video controls playsInline preload="metadata" aria-label="Fortnite showcase reference video" onError={() => setVideoError(true)}>
          <source src={SHOWCASE_REFERENCE.src} type="video/mp4"/>
          Your browser cannot play this reference. <a href={SHOWCASE_REFERENCE.src}>Open the video</a>.
        </video>
        {videoError && <p role="alert">The reference could not load. <a href={SHOWCASE_REFERENCE.src}>Open the video directly</a>.</p>}
        <a href={PRACTICE} className="showcase-start">Try it yourself ↗</a>
      </div>
    </section>
  </>;
}
