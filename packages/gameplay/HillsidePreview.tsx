import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { clipShoulderCamera, makeHillsideScene, RAMP_HEADING, rayHitsTarget, spawnPlayer, stepPlayer, type PlayerState } from './hillsideScene';
import { makeShotEffects, shotImpactPoint } from './effects';
import { createAttemptRecorder, newAttemptId, readConsent, ScoreError, submitScore, writeConsent, type AiConsent, type ScoreResponse } from '../showcase-scoring/client';
import type { AttemptTelemetry } from '../showcase-scoring/telemetry';

type PreviewControls = { reset: () => void };
type Scoring = { state: 'idle' } | { state: 'scoring' } | { state: 'done'; result: ScoreResponse } | { state: 'error'; message: string; retry?: () => void };
/** Turning faster than this (rad/s) counts as "still turning" for the aim-hold measure. */
const TURNING_RATE = .6;
/** Keep recording briefly after the shot so the hit is in the clip. */
const AFTER_SHOT_MS = 800;
type ShotResult = { hit: boolean; distance: number; airborne: boolean; id: number };

const CAMERA_FOV = 50;
const CAMERA_BACK = 3.05;
const CAMERA_RIGHT = .64;
const PIVOT_HEIGHT = 1.55;
const MOUSE_TURN = .0032;
const KEY_TURN = 2.6;
const KEY_TILT = 1.4;
const FIRE_COOLDOWN = .25;
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export default function HillsidePreview({ onExit, onScored, competition, onEventReset }: { onExit?: (result: ScoreResponse) => void; onScored?: (result: ScoreResponse) => void; competition?: { eventId: string; ticketId: string; attemptId: string }; onEventReset?: () => void } = {}) {
  const callbacks = useRef({ onScored, onEventReset });
  callbacks.current = { onScored, onEventReset };
  const mount = useRef<HTMLDivElement>(null);
  const controls = useRef<PreviewControls | null>(null);
  const marker = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scorePanel = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  function toggleFullscreen() {
    const el = stage.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
    el.querySelector('canvas')?.focus({ preventScroll: true });
  }
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shot, setShot] = useState<ShotResult>();
  const [consent, setConsent] = useState<AiConsent>(() => competition ? 'no' : readConsent());
  const consentRef = useRef<AiConsent>(consent);
  const [scoring, setScoring] = useState<Scoring>({ state: 'idle' });
  const [recordingSupported, setRecordingSupported] = useState(true);

  useEffect(() => {
    if (scoring.state !== 'done' && scoring.state !== 'error') return;
    let cancelled = false;
    async function revealResults() {
      const playStage = stage.current;
      if (playStage && playStage.contains(document.pointerLockElement)) document.exitPointerLock();
      if (playStage && document.fullscreenElement === playStage) {
        await document.exitFullscreen().catch(() => {});
      }
      if (cancelled) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scorePanel.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'instant' : 'smooth' });
    }
    void revealResults();
    return () => { cancelled = true; };
  }, [scoring.state]);


  function chooseConsent(value: 'yes' | 'no') {
    consentRef.current = value;
    setConsent(value);
    writeConsent(value);
    controls.current?.reset();
  }

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError('This preview needs WebGL. Try a browser with hardware acceleration enabled.');
      return;
    }

    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Hillside scene. Focus to play: WASD to move, Space to jump, arrow keys to look, F or click to fire, R to reset.');
    canvas.setAttribute('aria-describedby', 'hillside-controls');
    container.appendChild(canvas);
    const world = makeHillsideScene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, .07, 260);
    camera.rotation.order = 'YXZ';
    renderer.setClearColor('#80cbd3');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .88;
    const gl = renderer.getContext();
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const software = !!rendererInfo && /swiftshader|llvmpipe|software rasterizer/i.test(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, software ? .9 : 1.6));
    // Real-time sun shadows on hardware GPUs; software renderers keep the cheap blob shadow.
    renderer.shadowMap.enabled = !software;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const effects = makeShotEffects(world.scene);
    const muzzlePoint = new THREE.Vector3(), impactPoint = new THREE.Vector3();

    const keys = new Set<string>();
    const pivot = new THREE.Vector3();
    const cameraOffset = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const aim = new THREE.Vector3();
    const markerPoint = new THREE.Vector3();
    let fov = CAMERA_FOV, dip = 0, wasGrounded = true, lastVy = 0;
    let player: PlayerState = spawnPlayer();
    let heading = RAMP_HEADING, pitch = -.10;
    let gait = 0, walkWeight = 0, jumpQueued = false, cooldown = 0, shotId = 0, targetDown = false, fall = 0;
    let lookHeld = 0, kick = 0;
    let frame = 0, lastTime = performance.now(), disposed = false;
    // Attempt tracking for scoring: one shot per attempt, measured from the last reset.
    const recorder = createAttemptRecorder(canvas);
    setRecordingSupported(recorder.supported);
    let attemptStart = performance.now(), startHeading = RAMP_HEADING, lastTurnAt = performance.now(), lastHeading = RAMP_HEADING;
    let shotsThisAttempt = 0, scoreRequest: AbortController | undefined, attemptId = competition?.attemptId ?? newAttemptId();
    const startRecording = () => { if (consentRef.current === 'yes') recorder.start(); else recorder.cancel(); };

    function repaint() {
      const { x, y, z } = player;
      world.mannequin.position.set(x, y, z);
      world.mannequin.rotation.y = -heading;
      world.playerShadow.position.set(x, y + .024, z);
      world.playerShadow.visible = player.grounded && !renderer.shadowMap.enabled;
      world.updateLighting(x, y, z);
      world.character.pose({ grounded: player.grounded, gait, walkWeight, vy: player.vy, pitch, time: performance.now() / 1000 });
      world.target.rotation.x = -fall * Math.PI / 2;

      const sin = Math.sin(heading), cos = Math.cos(heading);
      pivot.set(x, y + PIVOT_HEIGHT, z);
      const shoulder = camera.aspect < 1.45 ? .50 : CAMERA_RIGHT;
      cameraOffset.set(-sin * CAMERA_BACK + cos * shoulder, .38 - 1.38 * pitch, cos * CAMERA_BACK + sin * shoulder);
      clipShoulderCamera(pivot, cameraOffset, cameraPosition);
      cameraPosition.y -= dip;
      world.mannequin.visible = pivot.distanceToSquared(cameraPosition) > .65 ** 2;
      camera.position.copy(cameraPosition);
      // A short recoil kick and shake after each shot (visual only; the shot ray was already taken).
      camera.rotation.set(pitch + kick * .03, -heading + kick * (Math.random() - .5) * .012, 0, 'YXZ');
      camera.updateMatrixWorld();
      placeMarker();
      renderer.render(world.scene, camera);
    }

    // A floating marker over the target with live distance; pinned to the edge when off-screen.
    function placeMarker() {
      const el = marker.current;
      if (!el) return;
      markerPoint.copy(world.target.position).y += 2.35;
      const distance = Math.hypot(world.target.position.x - player.x, world.target.position.z - player.z);
      markerPoint.project(camera);
      const behind = markerPoint.z > 1;
      let sx = behind ? -markerPoint.x : markerPoint.x, sy = behind ? -markerPoint.y : markerPoint.y;
      const offscreen = behind || Math.abs(sx) > .92 || Math.abs(sy) > .86;
      if (offscreen) {
        const scale = Math.max(Math.abs(sx) / .92, Math.abs(sy) / .86, 1e-6);
        sx /= scale; sy /= scale;
      }
      el.style.left = `${(sx + 1) * 50}%`;
      el.style.top = `${(1 - sy) * 50}%`;
      el.dataset.offscreen = String(offscreen);
      el.style.setProperty('--arrow', `${Math.atan2(-sy, sx)}rad`);
      el.dataset.down = String(targetDown);
      const label = el.lastElementChild as HTMLElement | null;
      if (label) label.textContent = targetDown ? 'DOWN' : `${Math.round(distance)} m`;
    }

    function reset() {
      if (competition) { callbacks.current.onEventReset?.(); return; }
      keys.clear();
      player = spawnPlayer();
      heading = RAMP_HEADING;
      pitch = -.10;
      gait = walkWeight = cooldown = fall = dip = 0;
      world.character.reset();
      effects.reset();
      kick = 0;
      fov = CAMERA_FOV;
      jumpQueued = targetDown = false;
      setShot(undefined);
      scoreRequest?.abort();
      scoreRequest = undefined;
      shotsThisAttempt = 0;
      attemptId = newAttemptId();
      attemptStart = lastTurnAt = performance.now();
      startHeading = lastHeading = heading;
      setScoring({ state: 'idle' });
      startRecording();
      canvas.focus({ preventScroll: true });
      repaint();
    }

    function fire() {
      // One shot per attempt (brief §5.2 S7): Reset or R starts the next attempt.
      if (cooldown > 0 || targetDown || shotsThisAttempt > 0) return;
      cooldown = FIRE_COOLDOWN;
      shotsThisAttempt = 1;
      camera.getWorldDirection(aim);
      const hit = rayHitsTarget(camera.position, aim);
      const distance = Math.hypot(world.target.position.x - player.x, world.target.position.z - player.z);
      if (hit) targetDown = true;
      setShot({ hit, distance, airborne: !player.grounded, id: ++shotId });
      world.character.fire();
      // Tracer from the rifle muzzle to the target (hit) or to where the ray meets the ground (miss).
      world.character.rifle.muzzle.getWorldPosition(muzzlePoint);
      if (hit) {
        impactPoint.copy(world.target.position).setY(world.target.position.y + 1.2).sub(camera.position);
        impactPoint.copy(camera.position).addScaledVector(aim, impactPoint.dot(aim));
      } else shotImpactPoint(camera.position, aim, impactPoint);
      effects.shot(muzzlePoint, impactPoint, hit);
      kick = 1;
      const shotAt = performance.now();
      const telemetry: AttemptTelemetry = {
        version: 1, shots: 1, ads: false, hit,
        startHeading, shotHeading: heading,
        aimHoldMs: Math.round(shotAt - lastTurnAt), elapsedMs: Math.round(shotAt - attemptStart),
        shooter: { x: player.x, y: player.y, z: player.z, grounded: player.grounded },
        ray: { origin: [camera.position.x, camera.position.y, camera.position.z], direction: [aim.x, aim.y, aim.z] },
      };
      const request = new AbortController(), thisAttempt = attemptId;
      scoreRequest = request;
      setScoring({ state: 'scoring' });
      window.setTimeout(async () => {
        if (disposed || request.signal.aborted) return;
        const clip = consentRef.current === 'yes' ? await recorder.finish() : undefined;
        void send({ telemetry, clip: clip?.blob, consent: consentRef.current, attemptId: thisAttempt }, request);
      }, AFTER_SHOT_MS);
    }

    /**
     * Submit (or re-submit) one attempt. A retry reuses the same attempt id, so the server
     * either records it for the first time or replays the stored result: never double XP.
     */
    async function send(submission: { telemetry: AttemptTelemetry; clip?: Blob; consent: AiConsent; attemptId: string }, request: AbortController) {
      try {
        const result = await submitScore(submission.telemetry, submission.clip, submission.consent, request.signal, submission.attemptId, competition);
        if (!request.signal.aborted && !disposed) callbacks.current.onScored?.(result);
        if (!request.signal.aborted && !disposed) setScoring({ state: 'done', result });
      } catch (cause) {
        if (request.signal.aborted || disposed) return;
        const status = cause instanceof ScoreError ? cause.status : 0;
        const detail = cause instanceof Error ? cause.message : 'Scoring is unavailable right now.';
        const retry = (status === 400 || (competition && [401, 403, 409].includes(status))) ? undefined : () => {
          if (scoreRequest !== request) return; // a newer attempt has started
          const again = new AbortController();
          scoreRequest = again;
          setScoring({ state: 'scoring' });
          void send(submission, again);
        };
        setScoring({
          state: 'error',
          message: competition ? detail : status === 409 ? 'This attempt is still being saved. Wait a moment, then retry.' : `Progress not saved: ${detail}`,
          retry,
        });
      }
    }

    function lockChanged() {
      keys.clear();
      const locked = document.pointerLockElement === canvas;
      setCaptured(locked);
      if (locked) setNotice('');
    }

    function onMouseDown(event: MouseEvent) {
      if (event.button === 0 && document.pointerLockElement === canvas) fire();
    }

    function onCanvasClick() {
      canvas.focus({ preventScroll: true });
      if (document.pointerLockElement === canvas) return;
      const unavailable = () => {
        if (!disposed) setNotice('Mouse look unavailable here. Use ← → ↑ ↓ to aim and F to fire.');
      };
      if (!canvas.requestPointerLock) {
        unavailable();
        return;
      }
      try {
        void canvas.requestPointerLock()?.catch(unavailable);
      } catch {
        unavailable();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Escape' && document.pointerLockElement === canvas) {
        document.exitPointerLock();
        return;
      }
      const focused = document.activeElement === canvas || document.pointerLockElement === canvas;
      if (!focused || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.code === 'KeyR') { event.preventDefault(); reset(); return; }
      if (event.code === 'KeyF') { event.preventDefault(); fire(); return; }
      if (!GAME_KEYS.has(event.code)) return;
      event.preventDefault();
      if (event.code === 'Space' && !event.repeat) jumpQueued = true;
      keys.add(event.code);
    }
    function onKeyUp(event: KeyboardEvent) {
      keys.delete(event.code);
    }
    function onMouse(event: MouseEvent) {
      if (document.pointerLockElement !== canvas) return;
      heading = (heading + event.movementX * MOUSE_TURN) % (Math.PI * 2);
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * .003, -.85, .67);
    }
    function clearInput() {
      keys.clear();
    }
    function animate(now: number) {
      if (disposed) return;
      const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      cooldown = Math.max(0, cooldown - dt);
      const turn = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
      const tilt = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
      if (turn || tilt) {
        // Taps make fine corrections; holding ramps up to full speed for big turns.
        lookHeld += dt;
        const ramp = Math.min(1, .08 + lookHeld * 2.2);
        heading = (heading + turn * dt * KEY_TURN * ramp) % (Math.PI * 2);
        pitch = THREE.MathUtils.clamp(pitch + tilt * dt * KEY_TILT * ramp, -.85, .67);
      } else {
        lookHeld = 0;
      }
      // Aim hold = time since the view last turned quickly (mouse or keys).
      const turned = heading - lastHeading;
      const turnRate = Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned))) / Math.max(dt, 1e-3);
      if (turnRate > TURNING_RATE && shotsThisAttempt === 0) lastTurnAt = now;
      lastHeading = heading;
      recorder.maintain(now);
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      player = stepPlayer(player, { forward, right, heading, jump: jumpQueued }, dt);
      jumpQueued = false;
      world.character.tick(dt);
      effects.tick(dt);
      kick = THREE.MathUtils.damp(kick, 0, 14, dt);
      const speed = Math.hypot(player.vx, player.vz);
      const moving = player.grounded && speed > .3;
      if (moving) gait += dt * speed * 1.7;
      walkWeight = THREE.MathUtils.damp(walkWeight, moving ? 1 : 0, 12, dt);
      if (targetDown && fall < 1) fall = Math.min(1, fall + dt * 3);
      // Feel the speed and the drop: FOV widens with speed and falling, landings dip the camera.
      const fallSpeed = player.grounded ? 0 : Math.max(0, -player.vy);
      const fovTarget = CAMERA_FOV + Math.max(0, speed - 6.2) * 2.2 + Math.min(12, fallSpeed * 1.1);
      fov = THREE.MathUtils.damp(fov, fovTarget, 6, dt);
      if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (player.grounded && !wasGrounded) dip = Math.min(.55, Math.max(0, -lastVy - 3) * .06);
      dip = THREE.MathUtils.damp(dip, 0, 9, dt);
      wasGrounded = player.grounded;
      lastVy = player.vy;
      repaint();
      frame = requestAnimationFrame(animate);
    }
    function resize() {
      const width = Math.max(container!.clientWidth, 1), height = Math.max(container!.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      repaint();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    controls.current = { reset };
    canvas.addEventListener('click', onCanvasClick);
    document.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('blur', clearInput);
    document.addEventListener('pointerlockchange', lockChanged);
    document.addEventListener('mousemove', onMouse);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    frame = requestAnimationFrame(animate);
    startRecording();

    return () => {
      disposed = true;
      scoreRequest?.abort();
      recorder.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('click', onCanvasClick);
      document.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('blur', clearInput);
      document.removeEventListener('pointerlockchange', lockChanged);
      document.removeEventListener('mousemove', onMouse);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      controls.current = null;
      effects.dispose();
      world.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  const hint = notice || (captured
    ? 'Click to fire · one shot per attempt · Esc release'
    : 'Click the scene to aim · WASD move · Space jump · F fire · R try again');

  return <div className="hillside-preview">
    <div className="hillside-stage" ref={stage}>
      <div className="hillside-canvas" ref={mount} />
      {!error && <span key={shot?.id ?? 0} className={`hillside-reticle${shot ? ' is-firing' : ''}${shot?.hit ? ' is-hit' : ''}`} aria-hidden="true"><i/><i/><i/><i/></span>}
      {!error && shot && <p key={`shot-${shot.id}`} className={`hillside-result${shot.hit ? ' is-hit' : ''}`} role="status">
        {shot.hit ? <>ELIMINATED <small>{Math.round(shot.distance)} m{shot.airborne ? ' · IN THE AIR' : ''}</small></> : 'MISS'}
      </p>}
      {!error && <div ref={marker} className="hillside-marker" aria-hidden="true"><i/><span/></div>}
      {!error && <div className="hillside-actions">
        <button type="button" className="hillside-reset" onClick={() => controls.current?.reset()} aria-label="Reset position (R)">↺ Reset</button>
        <button type="button" className="hillside-reset hillside-fullscreen" onClick={toggleFullscreen} aria-pressed={fullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>{fullscreen ? '✕ Exit' : '⛶ Full screen'}</button>
      </div>}
      {!error && <p className="hillside-hint" id="hillside-controls">{hint}</p>}
      {error && <p className="hillside-error" role="alert">{error}</p>}
    </div>
    {!error && <ScoringPanel panelRef={scorePanel} consent={consent} onConsent={chooseConsent} scoring={scoring} recordingSupported={recordingSupported} onExit={onExit} />}
  </div>;
}

function ScoringPanel({ panelRef, consent, onConsent, scoring, recordingSupported, onExit }: { panelRef: React.Ref<HTMLElement>; consent: AiConsent; onConsent: (v: 'yes' | 'no') => void; scoring: Scoring; recordingSupported: boolean; onExit?: (result: ScoreResponse) => void }) {
  return <section ref={panelRef} className="showcase-score" aria-labelledby="showcase-score-title">
    <h3 id="showcase-score-title">Attempt status</h3>
    {consent === undefined && <div className="showcase-score__consent">
      <p>Score each attempt against the reference clip with AI? Your gameplay clip (game view only, no camera or mic) is sent to Google Gemini to compare it. It isn’t stored.</p>
      <div className="showcase-score__choices">
        <button type="button" onClick={() => onConsent('yes')}>Allow AI scoring</button>
        <button type="button" onClick={() => onConsent('no')}>Game data only</button>
      </div>
    </div>}
    {consent === 'yes' && !recordingSupported && <p className="showcase-score__note">This browser can’t record the game view, so attempts are scored on game data only.</p>}
    <div role="status" aria-live="polite">
      {scoring.state === 'idle' && <p className="showcase-score__note">Take one shot per attempt. Press R or Reset to try again.</p>}
      {scoring.state === 'scoring' && <p className="showcase-score__note">Preparing your report…</p>}
      {scoring.state === 'error' && <div className="showcase-score__error">
        <p className="showcase-score__note">{scoring.message}</p>
        {scoring.retry && <button type="button" className="showcase-score__retry" onClick={scoring.retry}>Retry saving this attempt</button>}
        {scoring.retry && <p className="showcase-score__note">Retrying sends the same attempt again, so it can only count once.</p>}
      </div>}
      {scoring.state === 'done' && <p className="showcase-score__note">{scoring.result.competition ? `Event result: ${scoring.result.score}/100 · ${scoring.result.competition.eligible ? scoring.result.competition.review : scoring.result.competition.ineligibleReason}. No global XP awarded.` : 'Your report is ready.'}</p>}
    </div>
    {scoring.state === 'done' && onExit && <button type="button" className="showcase-start" onClick={() => onExit(scoring.result)}>Exit &amp; view results ↗</button>}
  </section>;
}
