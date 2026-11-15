import { canonicalRelayRoute, hasHostMarker, parseRoute, rememberHost, routeSearch, type Route } from './navigation';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import ChallengeBuilder from "../packages/challenges/ChallengeBuilder";
import PracticeGuide from "../packages/challenges/PracticeGuide";
import EnvironmentPicker from './components/EnvironmentPicker';
import ClipWorkbench from './components/ClipWorkbench';
import Leaderboard from "../packages/leaderboard/Leaderboard";
import { postLeaderboardAttempt, readOptIn, writeOptIn } from "../packages/leaderboard/client";
import {
  ApiError,
  createRelay,
  getRelay,
  completeRelay,
} from "../packages/social/client";
import {
  DEFAULT_CONFIG,
  ARENAS, configForArena, validConfig,
  sameConfig,
  type ChallengeConfig,
  type AttemptResult,
  type Relay,
} from "../shared/contracts";
const GameArena = lazy(() => import("../packages/gameplay/GameArena"));
type Screen = "home" | "arena" | "relay" | "premiere";
const Arrow = () => <span aria-hidden="true">↗</span>;
function ArenaArtwork() {
  return (
    <svg viewBox="0 0 700 500" className="arena-art" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x2="0" y2="1">
          <stop stopColor="#3b2931" />
          <stop offset="1" stopColor="#171a20" />
        </linearGradient>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path
            d="M50 0H0V50"
            fill="none"
            stroke="#ffffff"
            strokeOpacity=".05"
          />
        </pattern>
      </defs>
      <rect width="700" height="500" fill="url(#sky)" />
      <circle cx="500" cy="130" r="75" fill="#e4002b" opacity=".14" />
      <path
        d="M0 320V230h35v-45h55v85h42v-65h62v65h20v-115h38v150h70v-80h50v50h50v-130h55v100h70v-55h32v120h60v-150h40v140h30v100z"
        fill="#15181e"
      />
      <path d="M-60 500l300-250 380 30 130 220z" fill="#292c32" />
      <path d="M-60 500l300-250 380 30 130 220z" fill="url(#grid)" />
      <path
        d="M50 470l220-180 290 22"
        fill="none"
        stroke="#e4002b"
        strokeWidth="4"
      />
      <path d="M285 315v-70l95-17 80 29v73l-80 15z" fill="#383b41" />
      <path d="M285 245l95-17 80 29-95 17z" fill="#4c4d54" />
      <path d="M380 228v80l80 22v-73z" fill="#22252c" />
      <path d="M495 286v-94h54v98" fill="#23252c" stroke="#52515a" />
      <circle cx="522" cy="218" r="22" fill="#e4002b" />
      <circle cx="522" cy="218" r="12" fill="#f5dce2" />
      <circle cx="522" cy="218" r="5" fill="#e4002b" />
      <path d="M310 191h40m-20-20v40" stroke="white" opacity=".6" />
      <path d="M160 377l20-30 38 8-20 30z" fill="#d10028" />
      {/* Right-aligned so the .arena-stamp headline (top-left overlay) never covers it. */}
      <text x="660" y="65" textAnchor="end" fill="#c2bec3" fontSize="11" fontFamily="Source">
        35° 42′ N / ROOFTOP TRAINING FACILITY
      </text>
      <text x="50" y="438" fill="white" fontSize="12" fontFamily="Source">
        ORIGINAL ARENA / BROWSER PLAYABLE
      </text>
    </svg>
  );
}
export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<ChallengeConfig>(DEFAULT_CONFIG);
  const [attempt, setAttempt] = useState<AttemptResult | null>(null);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [name, setName] = useState(() => {
    try {
      return sessionStorage.getItem('rib-name') || '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [clipBusy, setClipBusy] = useState(false);
  const [boardOptIn, setBoardOptIn] = useState(readOptIn);
  const [boardVersion, setBoardVersion] = useState(0);
  const [boardStatus, setBoardStatus] = useState('');
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [notice, setNotice] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const playColumn = useRef<HTMLElement>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [arenaKey, setArenaKey] = useState(0);
  const [sourceRelay, setSourceRelay] = useState<string | undefined>();
  const [host, setHost] = useState(false);
  const [routePending, setRoutePending] = useState(false);
  const [routeFailure, setRouteFailure] = useState<'invalid' | 'retryable' | 'unavailable' | null>(null);
  const generation = useRef(0);
  const activeRequest = useRef<number | null>(null);
  const proven = !!attempt?.success && sameConfig(attempt.config, config);
  const invitation = relay
    ? `${location.origin}/${routeSearch({ screen: 'relay', id: relay.id })}`
    : '';

  useEffect(() => {
    function restoreFromLocation() {
      enterRoute(parseRoute(location.search), true);
    }
    restoreFromLocation();
    window.addEventListener('popstate', restoreFromLocation);
    return () => {
      window.removeEventListener('popstate', restoreFromLocation);
      generation.current += 1;
      activeRequest.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('rib-name', name);
    } catch {
      // The current form can still use the name in memory.
    }
  }, [name]);
  useEffect(() => {
    if (screen !== 'arena' || relay || routePending) return;
    try { sessionStorage.setItem(`rib-draft:${config.arenaId}`, JSON.stringify(config)); } catch {}
  }, [screen, relay, routePending, config]);

  function writeRoute(route: Exclude<Route, { screen: 'invalid' }>, mode: 'push' | 'replace') {
    const url = `/${routeSearch(route)}`;
    if (mode === 'push') history.pushState(null, '', url);
    else if (location.pathname + location.search + location.hash !== url) {
      history.replaceState(null, '', url);
    }
  }

  function enterRoute(route: Route, restoring: boolean, remixConfig?: ChallengeConfig) {
    const token = ++generation.current;
    activeRequest.current = null;
    setBusy(false);
    setError('');
    setNotice('');
    setRelay(null);
    setHost(false);
    setAttempt(null);
    setReplayIndex(null);
    let restored: ChallengeConfig | undefined;
    if (restoring && route.screen === 'arena' && !route.parentId) {
      const arenaId = route.arenaId ?? DEFAULT_CONFIG.arenaId;
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(`rib-draft:${arenaId}`) || 'null');
        if (validConfig(saved) && saved.arenaId === arenaId) restored = saved;
      } catch {}
    }
    setConfig(remixConfig ?? restored ?? (route.screen === 'arena' && route.arenaId ? configForArena(route.arenaId) : DEFAULT_CONFIG));
    setSourceRelay(route.screen === 'arena' ? route.parentId : undefined);
    setRoutePending(false);
    setRouteFailure(null);
    setScreen(route.screen === 'home' || route.screen === 'arena' ? route.screen : 'relay');

    if (route.screen === 'invalid') {
      setRouteFailure('invalid');
      return;
    }
    if (route.screen === 'home' || route.screen === 'arena') writeRoute(route, 'replace');
    if (route.screen === 'home') return;
    if (route.screen === 'arena') {
      setArenaKey((key) => key + 1);
      if (restoring) setNotice('Unpublished attempts reset when you reopen the arena.');
      if (route.parentId && !remixConfig) void loadRoute(route.parentId, token, true);
      return;
    }
    void loadRoute(route.id, token, false);
  }

  async function loadRoute(id: string, token: number, remix: boolean) {
    setRoutePending(true);
    try {
      const result = await getRelay(id);
      if (token !== generation.current) return;
      if (remix) setConfig(result.challenge);
      else showRelay(result, readHost(id));
    } catch (cause) {
      if (token !== generation.current) return;
      if (cause instanceof ApiError && cause.status === 404) setRouteFailure('invalid');
      else if (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408 || cause.status === 429) setRouteFailure('retryable');
      else setRouteFailure('unavailable');
    } finally {
      if (token === generation.current) setRoutePending(false);
    }
  }

  function readHost(id: string) {
    try {
      return hasHostMarker(sessionStorage, id);
    } catch {
      return false;
    }
  }

  function showRelay(result: Relay, asHost: boolean) {
    const route = canonicalRelayRoute(result.id, result.status);
    setRelay(result);
    setConfig(result.challenge);
    setHost(asHost);
    if (asHost) setAttempt(result.hostAttempt);
    else setAttempt(null);
    setReplayIndex(null);
    setScreen(route.screen);
    writeRoute(route, 'replace');
  }

  function changeConfig(c: ChallengeConfig) {
    if (activeRequest.current !== null || relay) return;
    setConfig(c);
    if (c.arenaId !== config.arenaId) { setSourceRelay(undefined); writeRoute({screen: 'arena', arenaId: c.arenaId}, 'replace'); }
    setAttempt(null);
    setNotice('');
  }

  function navigate(route: Exclude<Route, { screen: 'invalid' }>, remixConfig?: ChallengeConfig) {
    writeRoute(route, 'push');
    enterRoute(route, false, remixConfig);
  }

  function home() {
    navigate({ screen: 'home' });
  }

  function newChallenge() {
    navigate({ screen: 'arena', arenaId: config.arenaId }, configForArena(config.arenaId));
  }

  function retryRoute() {
    enterRoute(parseRoute(location.search), true);
  }

  function startRequest() {
    const token = generation.current;
    activeRequest.current = token;
    setBusy(true);
    setError('');
    setNotice('');
    return token;
  }

  function endRequest(token: number) {
    if (token !== generation.current) return;
    activeRequest.current = null;
    setBusy(false);
  }

  function showRequestError(cause: unknown, token: number) {
    if (token !== generation.current) return;
    setError(cause instanceof Error ? cause.message : 'The request failed. Please try again.');
  }

  /** Show the missing-name error beside the field (not at the top of the page) and move focus there. */
  function requireName(message: string) {
    setNameError(message);
    nameInput.current?.focus();
    nameInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function postToLeaderboard(result: AttemptResult) {
    const player = name.trim();
    if (!boardOptIn || !player) return;
    setBoardStatus('Posting to the leaderboard…');
    postLeaderboardAttempt(player, result)
      .then(saved => {
        setBoardStatus(!saved.ranked
          ? 'Attempt counted, but Align Aim was used, so it is not ranked.'
          : result.success ? 'Landed shot posted to the leaderboard.' : 'Miss posted to the leaderboard. Check the fumbles board.');
        setBoardVersion(v => v + 1);
      })
      .catch(cause => setBoardStatus(cause instanceof Error ? cause.message : 'Could not post to the leaderboard.'));
  }

  function toggleBoardOptIn(value: boolean) {
    setBoardOptIn(value);
    writeOptIn(value);
    setBoardStatus(value && !name.trim() ? 'Add your player name to start posting attempts.' : '');
  }

  function showLeaderboard() {
    if (screen !== 'home') home();
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  }

  async function publish() {
    if (screen !== 'arena' || clipBusy || activeRequest.current !== null || !attempt || !proven) return;
    if (!name.trim()) {
      requireName('Add your player name before passing the shot.');
      return;
    }
    const token = startRequest();
    try {
      const result = await createRelay({
        hostName: name.trim(),
        hostAttempt: attempt,
        parentChallengeId: sourceRelay,
      });
      let recoverySaved = true;
      try {
        rememberHost(sessionStorage, result.id);
      } catch {
        recoverySaved = false;
      }
      if (token !== generation.current) return;
      showRelay(result, true);
      setNotice(recoverySaved
        ? 'Your relay is ready. Send the link to your teammate.'
        : 'Your relay is ready. Browser storage is unavailable, so refreshing may lose your host view.');
    } catch (cause) {
      showRequestError(cause, token);
    } finally {
      endRequest(token);
    }
  }

  async function finishRelay() {
    if (!guest || activeRequest.current !== null || !relay || !attempt || !proven) return;
    if (!name.trim()) {
      requireName('Add your player name to join the premiere.');
      return;
    }
    const token = startRequest();
    try {
      const result = await completeRelay(relay.id, {
        guestName: name.trim(),
        guestAttempt: attempt,
      });
      if (token === generation.current) showRelay(result, false);
    } catch (cause) {
      if (token !== generation.current) return;
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const current = await getRelay(relay.id);
          if (token !== generation.current) return;
          if (current.status === 'completed') {
            showRelay(current, false);
            return;
          }
        } catch (reloadCause) {
          showRequestError(reloadCause, token);
          return;
        }
      }
      showRequestError(cause, token);
    } finally {
      endRequest(token);
    }
  }

  async function refreshRelay() {
    if (!relay || activeRequest.current !== null) return;
    const token = startRequest();
    try {
      const result = await getRelay(relay.id);
      if (token !== generation.current) return;
      showRelay(result, host);
      if (result.status === 'waiting') {
        setNotice('Your teammate has not finished yet. Check again after they land it.');
      }
    } catch (cause) {
      if (token === generation.current && cause instanceof ApiError && cause.status === 404) {
        setRelay(null);
        setAttempt(null);
        setHost(false);
        setRouteFailure('invalid');
      } else {
        showRequestError(cause, token);
      }
    } finally {
      endRequest(token);
    }
  }

  async function copyLink() {
    const token = generation.current;
    try {
      await navigator.clipboard.writeText(invitation);
      if (token === generation.current) {
        setNotice('Invitation copied. Your teammate can open it on this server.');
      }
    } catch {
      if (token === generation.current) setNotice('Copy the invitation from the invitation field.');
    }
  }

  const guest = screen === 'relay' && !!relay && !host;
  const relaySpinDegrees =
    relay?.challenge.arenaId === "rooftop-v1" ? relay.challenge.requiredSpinDegrees : 0;
  const arenaInfo = ARENAS.find(a => a.id === config.arenaId)!;
  const replayAttempt =
    replayIndex === 0
      ? relay?.hostAttempt
      : replayIndex === 1
        ? relay?.guestAttempt
        : undefined;
  const playConfig = replayAttempt?.config ?? config;
  const playArenaInfo = ARENAS.find(a => a.id === playConfig.arenaId) ?? arenaInfo;
  const attemptGeneration = generation.current;
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={home} aria-label="Run It Back home">
          <img src="/brand/logo.png" alt="FaZe" />
          <span>
            RUN IT BACK
            <span className="brand-sub">THE NEXT CLIP IS YOURS.</span>
          </span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={screen === "home" ? "nav-active" : ""}
            onClick={home}
          >
            THE EXPERIENCE
          </button>
          <button
            className={screen === "arena" ? "nav-active" : ""}
            onClick={newChallenge}
          >
            THE ARENA
          </button>
          <button onClick={showLeaderboard}>LEADERBOARD</button>
          <a
            href="https://github.com/Kx007-del/hackuta26"
            target="_blank"
            rel="noreferrer"
          >
            THE BUILD <Arrow />
          </a>
        </nav>
        <span className="edition">
          <i /> HACKUTA ’26
        </span>
      </header>
      {screen === "home" ? (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="red-line" /> FROM THE FIRST CLIP. TO YOUR NEXT
                ONE.
              </div>
              <h1>
                HISTORY
                <br />
                DOESN’T
                <br />
                PLAY <span>ITSELF.</span>
              </h1>
              <p>
                Bring a Call of Duty, Fortnite, or Valorant clip. Recreate its
                moment in a game-inspired arena, raise the bar, and pass it to your squad.
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={newChallenge}>
                  BRING YOUR CLIP <Arrow />
                </button>
                <a className="text-link" href="#how-it-works">
                  HOW IT WORKS <span>↓</span>
                </a>
              </div>
              <div className="hero-tags">
                <span>FREE TO PLAY</span>
                <span>NO DOWNLOAD</span>
                <span>BUILT FOR YOUR SQUAD</span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="visual-heading">
                <span>
                  <i /> THREE WORLDS / ONE SQUAD
                </span>
                <span>READY WHEN YOU ARE ↗</span>
              </div>
              <ArenaArtwork />
              <div className="arena-stamp">
                ONE SHOT.
                <br />
                <span>YOUR LEGACY.</span>
              </div>
              <div className="visual-bottom">
                <div>
                  <span className="micro">NOW PLAYING</span>
                  <h2>THE ROOFTOP</h2>
                </div>
                <button
                  className="round-arrow"
                  onClick={newChallenge}
                  aria-label="Play The Rooftop"
                >
                  ↗
                </button>
              </div>
              <div className="visual-meta">
                <span>WATCH / RECREATE / RAISE THE BAR</span>
                <span>COD / FORTNITE / VALORANT</span>
              </div>
            </div>
          </section>
          <section className="home-worlds">
            <EnvironmentPicker config={config} onChange={c => navigate({screen:'arena', arenaId:c.arenaId}, c)} />
          </section>
          <div className="ticker" aria-hidden="true">
            <span>WATCH IT.</span>
            <b>↗</b>
            <span>LAND IT.</span>
            <b>↗</b>
            <span>REMIX IT.</span>
            <b>↗</b>
            <span>PASS IT.</span>
            <b>↗</b>
            <span>RUN IT BACK.</span>
            <b>↗</b>
          </div>
          <section id="how-it-works" className="how-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">A NEW WAY TO MAKE YOUR MARK</div>
                <h2>
                  DON’T JUST WATCH.
                  <br />
                  BECOME THE NEXT CLIP.
                </h2>
              </div>
              <p>
                One challenge starts a chain.
                <br />
                What your squad makes of it is up to you.
              </p>
            </div>
            <div className="steps">
              {[
                {
                  n: "01",
                  title: "MAKE THE SHOT",
                  text: "Choose your world. Paste a YouTube or TikTok link, pick its defining moment, and recreate the action.",
                  icon: "⌖",
                },
                {
                  n: "02",
                  title: "RAISE THE BAR",
                  text: "Add a spin, build and edit, or dash from cover. Prove your harder version before passing it.",
                  icon: "↻",
                },
                {
                  n: "03",
                  title: "PASS THE PLAY",
                  text: "Challenge a friend. Bring both attempts together in your squad premiere.",
                  icon: "↗",
                },
              ].map((s) => (
                <article key={s.n}>
                  <div className="step-top">
                    <span>{s.n} / THE PROCESS</span>
                    <b>{s.icon}</b>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
          </section>
          <div className="home-leaderboard">
            <Leaderboard id="leaderboard" refreshKey={boardVersion} />
          </div>
          <section className="legacy-strip">
            <div>
              <div className="eyebrow">INSPIRED BY THE TRICKSHOT ERA</div>
              <h2>
                THE SPIRIT OF THE TEAMTAGE.
                <br />A NEW WAY TO PLAY.
              </h2>
              <p>
                Built around the creativity, shared attempts, and squad montages
                at the heart of FaZe’s early story.
              </p>
            </div>
            <button className="primary light" onClick={newChallenge}>
              MAKE YOUR FIRST CLIP <Arrow />
            </button>
          </section>
        </main>
      ) : (
        <main className="workspace">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">
                {screen === "premiere"
                  ? "YOUR SQUAD / YOUR MOMENT"
                  : guest
                    ? "PASS THE PLAY / LEG 02"
                    : `${arenaInfo.game} / ${arenaInfo.title}`}
              </div>
              <h1>
                {screen === "premiere"
                  ? "SQUAD PREMIERE"
                  : guest
                    ? "YOUR TURN. MAKE IT COUNT."
                    : "MAKE THE NEXT CLIP."}
              </h1>
            </div>
            <button className="text-link" onClick={newChallenge}>
              NEW CHALLENGE <Arrow />
            </button>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert">
              {notice}
            </div>
          )}
          {!routePending && !routeFailure && <>
            <EnvironmentPicker config={config} onChange={changeConfig} locked={busy || clipBusy || !!relay || screen === 'premiere'} />
            <ClipWorkbench config={config} onChange={changeConfig} onBusyChange={setClipBusy} locked={busy || !!relay || screen === 'premiere'} />
          </>}
          {routePending ? (
            <div className="loading" role="status">
              {screen === 'arena' ? 'LOADING THE REMIX…' : 'LOADING YOUR SQUAD’S SHOT…'}
            </div>
          ) : routeFailure ? (
            <div className="empty-state">
              <h2>{screen === 'arena' ? 'THIS REMIX COULDN’T LOAD' : 'THIS RELAY COULDN’T LOAD'}</h2>
              <p role="alert">
                {routeFailure === 'invalid'
                  ? 'Check the link, or start a challenge of your own.'
                  : routeFailure === 'retryable'
                    ? 'The server couldn’t load this challenge. Try again.'
                    : 'This challenge is unavailable. Open the link again or start a new challenge.'}
              </p>
              {routeFailure === 'retryable' && (
                <button className="secondary" onClick={retryRoute}>TRY AGAIN</button>
              )}
              <button className="primary" onClick={newChallenge}>
                ENTER THE ARENA <Arrow />
              </button>
            </div>
          ) : screen === 'premiere' && relay ? (
            <>
              <div className="premiere-banner">
                <div>
                  <span className="micro">RELAY COMPLETE</span>
                  <h2>
                    {relay.hostName} <span>×</span> {relay.guestName}
                  </h2>
                </div>
                <span className="pill">TWO PLAYERS. ONE STORY.</span>
              </div>
              <div className="premiere-player">
                <Suspense
                  fallback={<div className="loading">LOADING REPLAY…</div>}
                >
                  {replayAttempt ? (
                    <GameArena
                      key={`replay-${replayIndex}-${arenaKey}`}
                      config={relay.challenge}
                      onComplete={() => {}}
                      replay={replayAttempt}
                      onReplayEnd={() => {
                        if (replayIndex === 0) setReplayIndex(1);
                      }}
                    />
                  ) : (
                    <div className="premiere-cover">
                      <img src="/brand/logo.png" alt="FaZe" />
                      <h2>
                        YOU BOTH
                        <br />
                        <span>RAN IT BACK.</span>
                      </h2>
                      <button
                        className="primary"
                        onClick={() => {
                          setArenaKey((k) => k + 1);
                          setReplayIndex(0);
                        }}
                      >
                        WATCH SQUAD PREMIERE ▷
                      </button>
                    </div>
                  )}
                </Suspense>
              </div>
              <div className="premiere-credits">
                {[relay.hostName, relay.guestName].map((n, i) => (
                  <button
                    className={replayIndex === i ? "selected" : ""}
                    key={i}
                    onClick={() => {
                      setArenaKey((k) => k + 1);
                      setReplayIndex(i);
                    }}
                  >
                    <span>
                      0{i + 1} / {i ? "THE RESPONSE" : "THE CHALLENGE"}
                    </span>
                    <strong>{n}</strong>
                    <small>
                      {relaySpinDegrees > 0 && `${relaySpinDegrees}° · `}
                      {relay.challenge.targetDistance}m · LANDED ✓
                    </small>
                  </button>
                ))}
              </div>
              <div className="premiere-actions">
                <button
                  className="primary"
                  onClick={() => navigate({ screen: 'arena', parentId: relay.id }, relay.challenge)}
                >
                  REMIX THIS RELAY <Arrow />
                </button>
                <button className="secondary" onClick={copyLink}>
                  COPY SQUAD LINK
                </button>
              </div>
              <p className="fine-print">
                A recorded in-app replay sequence. Downloadable video export is
                coming later.
              </p>
            </>
          ) : (
            <div className="play-layout">
              <section className="play-column" ref={playColumn}>
                <div className="arena-topbar">
                  <span>
                    <i /> {replayAttempt ? "TEAMMATE REPLAY" : "LIVE PRACTICE"}
                  </span>
                  <span>{playArenaInfo.game} / {playArenaInfo.title}</span>
                </div>
                <Suspense
                  fallback={
                    <div className="loading">PREPARING THE ARENA…</div>
                  }
                >
                  <GameArena
                    key={`${arenaKey}-${JSON.stringify(config)}-${replayAttempt?.id || "play"}`}
                    config={config}
                    replay={replayAttempt}
                    onReplayEnd={() => setReplayIndex(null)}
                    onComplete={(r) => {
                      if (attemptGeneration === generation.current) postToLeaderboard(r);
                      if (r.success && attemptGeneration === generation.current && !host && activeRequest.current === null) {
                        setAttempt(r);
                        setNotice(
                        guest
                          ? "Shot landed. Finish the relay to unlock your premiere."
                          : "Shot landed. Your challenge is ready to pass.",
                        );
                        setError("");
                      }
                    }}
                  />{" "}
                </Suspense>
                <div className="play-caption">
                  <span>ORIGINAL BROWSER ARENA</span>
                  <span>ESC TO RELEASE MOUSE</span>
                </div>
                {guest && relay && (
                  <div className="teammate-card">
                    <span className="avatar">
                      {relay.hostName[0]?.toUpperCase()}
                    </span>
                    <div>
                      <strong>{relay.hostName} passed you the play.</strong>
                      <p>
                        {relaySpinDegrees > 0 && `${relaySpinDegrees}° rotation · `}
                        {relay.challenge.targetDistance}m target · Your turn to
                        answer.
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => {
                        const watching = replayIndex !== 0;
                        setReplayIndex(watching ? 0 : null);
                        // The arena sits above this card; bring the replay into view.
                        if (watching) playColumn.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                      }}
                    >
                      {replayIndex === 0 ? "BACK TO PLAY" : "WATCH THEIR SHOT"}
                    </button>
                  </div>
                )}
                <PracticeGuide config={playConfig} isReplay={!!replayAttempt} />
              </section>
              <aside>
                <ChallengeBuilder
                  config={config}
                  onChange={changeConfig}
                  proven={proven}
                  locked={guest || !!relay}
                  viewer={guest ? 'guest' : 'host'}
                />
                <section className="share-panel">
                  <label htmlFor="player-name">YOUR PLAYER NAME</label>
                  <input
                    id="player-name"
                    ref={nameInput}
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameError(''); }}
                    maxLength={24}
                    placeholder="What does your squad call you?"
                    autoComplete="nickname"
                    aria-invalid={nameError ? true : undefined}
                    aria-describedby={nameError ? 'player-name-error' : undefined}
                  />
                  {nameError && (
                    <p id="player-name-error" className="field-error" role="alert">
                      {nameError}
                    </p>
                  )}
                  <label className="board-opt-in">
                    <input
                      type="checkbox"
                      checked={boardOptIn}
                      onChange={(e) => toggleBoardOptIn(e.target.checked)}
                    />
                    <span>Post my attempts, hits and misses, to the public leaderboard under this name</span>
                  </label>
                  <p className="board-status" role="status">{boardStatus}</p>
                  {guest ? (
                    <button
                      className="primary full"
                      disabled={!proven || busy || clipBusy}
                      onClick={finishRelay}
                    >
                      {busy ? "SAVING…" : "FINISH THE RELAY"} <Arrow />
                    </button>
                  ) : host && relay ? (
                    <>
                      <span className="micro">YOUR INVITATION</span>
                      <input
                        aria-label="Squad invitation link"
                        readOnly
                        value={invitation}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button className="primary full" onClick={copyLink}>
                        COPY INVITE LINK <Arrow />
                      </button>
                      <button
                        className="secondary full"
                        disabled={busy}
                        onClick={refreshRelay}
                      >
                        {busy ? 'CHECKING TEAMMATE PROGRESS…' : 'CHECK TEAMMATE PROGRESS ↻'}
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary full"
                      disabled={!proven || busy || clipBusy}
                      onClick={publish}
                    >
                      {busy ? "CREATING RELAY…" : "PASS THE PLAY"} <Arrow />
                    </button>
                  )}
                  <p className="fine-print">
                    {guest
                      ? proven
                        ? "Shot landed. Add your name and finish the relay to unlock your premiere."
                        : "Land your teammate’s exact challenge to unlock your premiere."
                      : relay
                        ? "The shot is locked. Your teammate plays the same setup."
                        : proven
                          ? "Shot proven. Add your name and pass the play to get your invite link."
                          : "Complete this setup to unlock your squad invitation."}
                  </p>
                </section>
                <Leaderboard refreshKey={boardVersion} arenaId={config.arenaId} compact />
              </aside>
            </div>
          )}
        </main>
      )}
      <footer>
        <span>
          FAZE RUN IT BACK <span className="footer-slash">/</span> HACKUTA 2026
        </span>
        <span>A FAN-BUILT CHALLENGE PROTOTYPE. ORIGINAL GAMEPLAY.</span>
        <span>THE NEXT CLIP IS YOURS. ↗</span>
      </footer>
    </div>
  );
}
