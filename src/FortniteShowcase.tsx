import { lazy, Suspense, useEffect, useState } from 'react';
import { isLegacyShowcaseLink, SHOWCASE_REFERENCE } from './showcase';
import { CommunitySection, ProgressPanel, useProgression } from './community/Community';
import ScoreReport from './ShowcaseScoreReport';
import type { ScoreResponse } from '../packages/showcase-scoring/client';
import './fortnite-showcase.css';
import { EventsBrowse, PublicEvent, HostHome, HostManager } from './competitions/Events';
import { activeTab } from './competitions/api';

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

export default function FortniteShowcase({
  search = typeof window === 'undefined' ? '' : window.location.search,
  path = typeof window === 'undefined' ? '/' : window.location.pathname,
}: { search?: string; path?: string }) {
  const [currentPath, setCurrentPath] = useState(path);
  useEffect(() => { const changed = () => { setCurrentPath(window.location.pathname); setFallback(null); }; window.addEventListener('popstate', changed); return () => window.removeEventListener('popstate', changed); }, []);
  const [fallback, setFallback] = useState<ScoreResponse | null>(null);
  const route = fallback ? RESULTS : currentPath.replace(/\/+$/, '') || '/';
  const step = route === PRACTICE ? 'Practice' : route === RESULTS ? 'Results' : activeTab(route);
  const eventMatch = /^\/events\/([A-Za-z0-9-]+)$/.exec(route);
  const hostMatch = /^\/host\/events\/([A-Za-z0-9-]+)$/.exec(route);
  const known = ['/', '/play', PRACTICE, RESULTS, '/leaderboards', '/events', '/host'].includes(route) || eventMatch || hostMatch;
  function navigate(event: React.MouseEvent) {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor || anchor.target || anchor.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== location.origin || target.hash || !/^\/(?:$|play$|practice$|results$|leaderboards$|events(?:\/|$)|host(?:\/|$))/.test(target.pathname)) return;
    event.preventDefault(); window.history.pushState(null, '', target.pathname + target.search); setCurrentPath(target.pathname); setFallback(null); window.scrollTo(0, 0);
  }

  useEffect(() => {
    document.title = step + ' | Run It Back';
  }, [step]);

  function exitWithReport(result: ScoreResponse) {
    try { window.sessionStorage.setItem(REPORT_KEY, JSON.stringify(result)); } catch { /* The report remains in memory. */ }
    window.history.pushState(null, '', RESULTS);
    setCurrentPath(RESULTS);
    setFallback(result);
    window.scrollTo(0, 0);
  }

  return <div className="fortnite-showcase" onClick={navigate}>
    <header className="showcase-header">
      <a className="showcase-brand" href="/" aria-label="Run It Back home">
        <img src="/brand/logo.png" alt="FaZe" />
        <span>RUN IT BACK</span>
      </a>
      <nav className="competition-nav" aria-label="Main navigation">{[['Play', '/'], ['Leaderboards', '/leaderboards'], ['Join Events', '/events'], ['Host an Event', '/host']].map(([label, href]) => <a key={href} href={href} aria-current={activeTab(route) === label ? 'page' : undefined}>{label}</a>)}</nav>
    </header>
    <main>
      {step === 'Results' && <nav className="showcase-steps" aria-label="Showcase steps">
        <a href="/">01 Reference</a>
        <a href={PRACTICE}>02 Practice</a>
        <span aria-current="page">03 Results</span>
      </nav>}
      {!known ? <section className="showcase-route"><h1>Page not found</h1><a href="/">Back to Play</a></section> : route === '/events' ? <EventsBrowse /> : eventMatch ? <PublicEvent key={eventMatch[1]} code={eventMatch[1]} /> : route === '/host' ? <HostHome /> : hostMatch ? <HostManager key={hostMatch[1]} id={hostMatch[1]} /> : route === '/leaderboards' ? <GlobalStandings /> : step === 'Practice' ? <section className="showcase-route" aria-labelledby="practice-heading">
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

function GlobalStandings() {
  const progression = useProgression();
  return <section className="showcase-route"><h1>Leaderboards</h1><p>Global player rankings, XP, streaks and badge collection. Competition standings live on each event page.</p><ProgressPanel progression={progression} /><CommunitySection progression={progression} /></section>;
}
