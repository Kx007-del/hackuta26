import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { clipShoulderCamera, makeHillsideScene, RAMP_HEADING, rayHitsTarget, spawnPlayer, stepPlayer, type PlayerState } from './hillsideScene';

type PreviewControls = { reset: () => void };
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

export default function HillsidePreview() {
  const mount = useRef<HTMLDivElement>(null);
  const controls = useRef<PreviewControls | null>(null);
  const marker = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
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
    let lookHeld = 0;
    let frame = 0, lastTime = performance.now(), disposed = false;

    function repaint() {
      const { x, y, z } = player;
      world.mannequin.position.set(x, y, z);
      world.mannequin.rotation.y = -heading;
      world.playerShadow.position.set(x, y + .024, z);
      world.playerShadow.visible = player.grounded;
      world.legPivots.forEach((leg, i) => {
        leg.rotation.x = player.grounded ? Math.sin(gait + i * Math.PI) * .42 * walkWeight : (i ? -.35 : .25);
      });
      world.target.rotation.x = -fall * Math.PI / 2;

      const sin = Math.sin(heading), cos = Math.cos(heading);
      pivot.set(x, y + PIVOT_HEIGHT, z);
      const shoulder = camera.aspect < 1.45 ? .50 : CAMERA_RIGHT;
      cameraOffset.set(-sin * CAMERA_BACK + cos * shoulder, .38 - 1.38 * pitch, cos * CAMERA_BACK + sin * shoulder);
      clipShoulderCamera(pivot, cameraOffset, cameraPosition);
      cameraPosition.y -= dip;
      world.mannequin.visible = pivot.distanceToSquared(cameraPosition) > .65 ** 2;
      camera.position.copy(cameraPosition);
      camera.rotation.set(pitch, -heading, 0, 'YXZ');
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
      keys.clear();
      player = spawnPlayer();
      heading = RAMP_HEADING;
      pitch = -.10;
      gait = walkWeight = cooldown = fall = dip = 0;
      fov = CAMERA_FOV;
      jumpQueued = targetDown = false;
      setShot(undefined);
      canvas.focus({ preventScroll: true });
      repaint();
    }

    function fire() {
      if (cooldown > 0 || targetDown) return;
      cooldown = FIRE_COOLDOWN;
      camera.getWorldDirection(aim);
      const hit = rayHitsTarget(camera.position, aim);
      const distance = Math.hypot(world.target.position.x - player.x, world.target.position.z - player.z);
      if (hit) targetDown = true;
      setShot({ hit, distance, airborne: !player.grounded, id: ++shotId });
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
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      player = stepPlayer(player, { forward, right, heading, jump: jumpQueued }, dt);
      jumpQueued = false;
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

    return () => {
      disposed = true;
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
      world.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  const hint = notice || (captured
    ? 'Click to fire · WASD move · Space jump · Esc release'
    : 'Click the scene to aim · WASD move · Space jump · R reset');

  return <div className="hillside-preview">
    <div className="hillside-stage" ref={stage}>
      <div className="hillside-canvas" ref={mount} />
      {!error && <span key={shot?.id ?? 0} className={`hillside-reticle${shot ? ' is-firing' : ''}`} aria-hidden="true"><i/><i/><i/><i/></span>}
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
  </div>;
}
