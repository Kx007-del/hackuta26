import { lazy, Suspense, useEffect, useState } from "react";
import ChallengeBuilder from "../packages/challenges/ChallengeBuilder";
import {
  createRelay,
  getRelay,
  completeRelay,
} from "../packages/social/client";
import {
  DEFAULT_CONFIG,
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
      <text x="50" y="65" fill="#c2bec3" fontSize="11" fontFamily="monospace">
        35° 42′ N / ROOFTOP TRAINING FACILITY
      </text>
      <text x="50" y="438" fill="white" fontSize="12" fontFamily="monospace">
        ORIGINAL ARENA / BROWSER PLAYABLE
      </text>
    </svg>
  );
}
export default function App() {
  const initialId = new URLSearchParams(location.search).get("relay");
  const [screen, setScreen] = useState<Screen>(initialId ? "relay" : "home");
  const [config, setConfig] = useState<ChallengeConfig>(DEFAULT_CONFIG);
  const [attempt, setAttempt] = useState<AttemptResult | null>(null);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [name, setName] = useState(
    () => sessionStorage.getItem("rib-name") || "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [replayIndex, setReplayIndex] = useState<number | null>(null),
    [arenaKey, setArenaKey] = useState(0);
  const [sourceRelay, setSourceRelay] = useState<string | undefined>();
  const proven = !!attempt?.success && sameConfig(attempt.config, config);
  const invitation = relay ? `${location.origin}/?relay=${relay.id}` : "";
  useEffect(() => {
    if (!initialId) return;
    setBusy(true);
    getRelay(initialId)
      .then((r) => {
        setRelay(r);
        setConfig(r.challenge);
        if (r.status === "completed") setScreen("premiere");
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    sessionStorage.setItem("rib-name", name);
  }, [name]);
  function changeConfig(c: ChallengeConfig) {
    setConfig(c);
    setAttempt(null);
    setNotice("");
  }
  function home() {
    setScreen("home");
    setReplayIndex(null);
    setError("");
    history.replaceState(null, "", "/");
  }
  function newChallenge() {
    setArenaKey((k) => k + 1);
    setError("");
    setNotice("");
    setRelay(null);
    setAttempt(null);
    setReplayIndex(null);
    setConfig(DEFAULT_CONFIG);
    setSourceRelay(undefined);
    history.replaceState(null, "", "/");
    setScreen("arena");
  }
  async function publish() {
    if (!attempt || !proven) return;
    if (!name.trim()) {
      setError("Add your player name before passing the shot.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await createRelay({
        hostName: name.trim(),
        hostAttempt: attempt,
        parentChallengeId: sourceRelay,
      });
      setRelay(r);
      setNotice("Your relay is ready. Send the link to your teammate.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finishRelay() {
    if (!relay || !attempt || !proven) return;
    if (!name.trim()) {
      setError("Add your player name to join the premiere.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await completeRelay(relay.id, {
        guestName: name.trim(),
        guestAttempt: attempt,
      });
      setRelay(r);
      setReplayIndex(null);
      setNotice("");
      setScreen("premiere");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshRelay() {
    if (!relay) return;
    setBusy(true);
    try {
      const r = await getRelay(relay.id);
      setRelay(r);
      if (r.status === "completed") {
        setNotice("");
        setScreen("premiere");
        setReplayIndex(null);
      } else
        setNotice(
          "Your teammate has not finished yet. Check again after they land it.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invitation);
      setNotice("Invitation copied. Your teammate can open it on this server.");
    } catch {
      setNotice("Copy the invitation from the field below.");
    }
  }
  const guest = screen === "relay";
  const replayAttempt =
    replayIndex === 0
      ? relay?.hostAttempt
      : replayIndex === 1
        ? relay?.guestAttempt
        : undefined;
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
          <a
            href="https://github.com/Kx007-del/faze-run-it-back"
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
                Iconic energy. Your shot. Recreate a trickshot, put your own
                spin on it, and pass the challenge to your squad.
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={newChallenge}>
                  RUN IT BACK <Arrow />
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
                  <i /> ARENA 001
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
                <span>JUMP / SPIN / LAND IT</span>
                <span>01 — 03 PRESETS</span>
              </div>
            </div>
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
                  text: "Enter an original browser arena. Jump, aim, and land your first trickshot.",
                  icon: "⌖",
                },
                {
                  n: "02",
                  title: "RAISE THE BAR",
                  text: "Add a rotation or push the distance. Complete your remix before you pass it.",
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
                    : "THE ROOFTOP / ORIGINAL ARENA"}
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
          {busy && !relay && guest ? (
            <div className="loading">LOADING YOUR SQUAD’S SHOT…</div>
          ) : guest && !relay ? (
            <div className="empty-state">
              <h2>THIS RELAY COULDN’T LOAD</h2>
              <p>Check the invitation, or start a challenge of your own.</p>
              <button className="primary" onClick={newChallenge}>
                ENTER THE ARENA <Arrow />
              </button>
            </div>
          ) : screen === "premiere" && relay ? (
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
                      {relay.challenge.requiredSpinDegrees}° ·{" "}
                      {relay.challenge.targetDistance}m · LANDED ✓
                    </small>
                  </button>
                ))}
              </div>
              <div className="premiere-actions">
                <button
                  className="primary"
                  onClick={() => {
                    setSourceRelay(relay.id);
                    setConfig(relay.challenge);
                    setRelay(null);
                    setAttempt(null);
                    setReplayIndex(null);
                    setScreen("arena");
                    history.replaceState(null, "", "/");
                  }}
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
              <section className="play-column">
                <div className="arena-topbar">
                  <span>
                    <i /> {replayAttempt ? "TEAMMATE REPLAY" : "LIVE PRACTICE"}
                  </span>
                  <span>ROOFTOP / VOL. 01</span>
                </div>
                <Suspense
                  fallback={
                    <div className="loading">PREPARING THE ROOFTOP…</div>
                  }
                >
                  <GameArena
                    key={`${arenaKey}-${JSON.stringify(config)}-${replayAttempt?.id || "play"}`}
                    config={config}
                    replay={replayAttempt}
                    onReplayEnd={() => setReplayIndex(null)}
                    onComplete={(r) => {
                      if (r.success) {
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
                        {relay.challenge.requiredSpinDegrees}° rotation ·{" "}
                        {relay.challenge.targetDistance}m target · Your turn to
                        answer.
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        setReplayIndex(replayIndex === 0 ? null : 0)
                      }
                    >
                      {replayIndex === 0 ? "BACK TO PLAY" : "WATCH THEIR SHOT"}
                    </button>
                  </div>
                )}
                <div className="tip-panel">
                  <span>THE PLAYBOOK</span>
                  <p>
                    Start with The Original. Jump and aim at the center of the
                    target. Once you’ve landed it, add a rotation or increase
                    the distance to make it your own.
                  </p>
                </div>
              </section>
              <aside>
                <ChallengeBuilder
                  config={config}
                  onChange={changeConfig}
                  proven={proven}
                  locked={guest || !!relay}
                />
                <section className="share-panel">
                  <label htmlFor="player-name">YOUR PLAYER NAME</label>
                  <input
                    id="player-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={24}
                    placeholder="What does your squad call you?"
                    autoComplete="nickname"
                  />
                  {guest ? (
                    <button
                      className="primary full"
                      disabled={!proven || busy}
                      onClick={finishRelay}
                    >
                      {busy ? "SAVING…" : "FINISH THE RELAY"} <Arrow />
                    </button>
                  ) : relay ? (
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
                        CHECK TEAMMATE PROGRESS ↻
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary full"
                      disabled={!proven || busy}
                      onClick={publish}
                    >
                      {busy ? "CREATING RELAY…" : "PASS THE PLAY"} <Arrow />
                    </button>
                  )}
                  <p className="fine-print">
                    {guest
                      ? "Land your teammate’s exact challenge to unlock your premiere."
                      : relay
                        ? "The shot is locked. Your teammate plays the same setup."
                        : "Complete this setup to unlock your squad invitation."}
                  </p>
                </section>
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
