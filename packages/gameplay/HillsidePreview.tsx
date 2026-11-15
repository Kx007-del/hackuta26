import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cameraFloor, makeHillsideScene, RAMP_HEADING, RIDGE_DISTANCE, RIDGE_HEADING, spawnHeight, walkHeight, withinWalkArea } from './hillsideScene';

type ReviewView = 'ramp' | 'ridge';
type PreviewControls = {
  review: (view: ReviewView) => void;
  capture: () => void;
};

const WALK_SPEED = 4.2;
const CAMERA_FOV = 50;
const CAMERA_BACK = 3.05;
const CAMERA_RIGHT = .64;
const PIVOT_HEIGHT = 1.55;
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

export default function HillsidePreview() {
  const mount = useRef<HTMLDivElement>(null);
  const controls = useRef<PreviewControls | null>(null);
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    canvas.setAttribute('aria-label', 'Hillside scene. Focus here to walk with WASD. Click to capture mouse look.');
    canvas.setAttribute('aria-describedby', 'hillside-controls');
    container.appendChild(canvas);
    const world = makeHillsideScene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, .07, 260);
    camera.rotation.order = 'YXZ';
    renderer.setClearColor('#80cbd3');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    const gl = renderer.getContext();
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const software = !!rendererInfo && /swiftshader|llvmpipe|software rasterizer/i.test(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, software ? .9 : 1.6));

    const keys = new Set<string>();
    const pivot = new THREE.Vector3();
    const cameraOffset = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    let x = 0, z = 0, floor = spawnHeight, elevation = spawnHeight;
    let heading = RAMP_HEADING, pitch = -.16;
    let gait = 0, walkWeight = 0;
    let frame = 0, lastTime = performance.now(), disposed = false, lookDirty = false;

    function repaint() {
      world.mannequin.position.set(x, elevation, z);
      world.mannequin.rotation.y = -heading;
      world.playerShadow.position.set(x, floor + .024, z);
      world.legPivots.forEach((leg, i) => {
        leg.rotation.x = Math.sin(gait + i * Math.PI) * .42 * walkWeight;
      });

      const sin = Math.sin(heading), cos = Math.cos(heading);
      pivot.set(x, elevation + PIVOT_HEIGHT, z);
      const shoulder = camera.aspect < 1.45 ? .50 : CAMERA_RIGHT;
      cameraOffset.set(-sin * CAMERA_BACK + cos * shoulder, .38 - 1.38 * pitch, cos * CAMERA_BACK + sin * shoulder);
      let clear = 1;
      // Keep the camera above the same terrain and build surfaces used for walking.
      for (let sample = 1; sample <= 12; sample++) {
        const t = sample / 12;
        const cx = pivot.x + cameraOffset.x * t, cz = pivot.z + cameraOffset.z * t;
        if (pivot.y + cameraOffset.y * t < cameraFloor(cx, cz) + .20) {
          clear = Math.max(.32, (sample - 1) / 12);
          break;
        }
      }
      cameraPosition.copy(pivot).addScaledVector(cameraOffset, clear);
      cameraPosition.y = Math.max(cameraPosition.y, cameraFloor(cameraPosition.x, cameraPosition.z) + .22);
      camera.position.copy(cameraPosition);
      camera.rotation.set(pitch, -heading, 0, 'YXZ');
      renderer.render(world.scene, camera);
    }

    function review(view: ReviewView) {
      keys.clear();
      x = z = 0;
      if (view === 'ridge') {
        // Use the left side of the same upper ramp to keep the cone out of
        // the central sightline after the turn.
        x = -1.65 * Math.cos(RAMP_HEADING) - .57 * Math.sin(RAMP_HEADING);
        z = -1.65 * Math.sin(RAMP_HEADING) + .57 * Math.cos(RAMP_HEADING);
      }
      floor = elevation = walkHeight(x, z, spawnHeight);
      gait = walkWeight = 0;
      heading = view === 'ramp' ? RAMP_HEADING : RIDGE_HEADING;
      // In the aim frame the reticle sits below the skyline and the mannequin
      // remains visible from the head down through the legs.
      pitch = view === 'ramp' ? -.16 : Math.atan2(world.ridgePoint.y + .55 - elevation - PIVOT_HEIGHT, RIDGE_DISTANCE) - .085;
      canvas.focus({ preventScroll: true });
      repaint();
    }

    function lockChanged() {
      keys.clear();
      const locked = document.pointerLockElement === canvas;
      setCaptured(locked);
      if (locked) setNotice('');
    }

    function capture() {
      canvas.focus({ preventScroll: true });
      if (document.pointerLockElement === canvas) return;
      const unavailable = () => {
        if (!disposed) setNotice('Mouse look is unavailable in this browser context. You can still walk and use both review views.');
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
      if (!MOVE_KEYS.has(event.code) ||
          (document.activeElement !== canvas && document.pointerLockElement !== canvas) ||
          event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      keys.add(event.code);
    }
    function onKeyUp(event: KeyboardEvent) {
      keys.delete(event.code);
    }
    function onMouse(event: MouseEvent) {
      if (document.pointerLockElement !== canvas) return;
      heading = (heading + event.movementX * .0032) % (Math.PI * 2);
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * .003, -.85, .67);
      lookDirty = true;
    }
    function clearInput() {
      keys.clear();
    }
    function animate(now: number) {
      if (disposed) return;
      const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      let moving = false;
      if (forward || right) {
        const step = WALK_SPEED * dt / Math.hypot(forward, right);
        const sin = Math.sin(heading), cos = Math.cos(heading);
        const nx = x + (sin * forward + cos * right) * step;
        const nz = z + (-cos * forward + sin * right) * step;
        if (withinWalkArea(nx, nz)) {
          x = nx;
          z = nz;
          floor = walkHeight(x, z, floor);
          gait += dt * 10;
          moving = true;
        }
      }
      const poseChanged = moving || walkWeight > 0 || elevation !== floor || lookDirty;
      walkWeight = THREE.MathUtils.damp(walkWeight, moving ? 1 : 0, 12, dt);
      if (!moving && walkWeight < .002) walkWeight = 0;
      elevation = floor >= elevation ? floor : Math.max(floor, elevation - dt * 7);
      if (poseChanged) repaint();
      lookDirty = false;
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
    controls.current = { review, capture };
    canvas.addEventListener('click', capture);
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
      canvas.removeEventListener('click', capture);
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

  return <div className="hillside-preview">
    <div className="hillside-stage">
      <div className="hillside-canvas" ref={mount} />
      {!error && <span className="hillside-reticle" aria-hidden="true" />}
      {error && <p className="hillside-error" role="alert">{error}</p>}
    </div>
    {!error && <>
      <div className="hillside-toolbar" role="group" aria-label="Hillside preview controls">
        <button type="button" onClick={() => controls.current?.review('ramp')}>Ramp and cone</button>
        <button type="button" onClick={() => controls.current?.review('ridge')}>Aim up the hill</button>
        <button type="button" onClick={() => controls.current?.review('ramp')}>Reset position</button>
      </div>
      <p className="hillside-instructions" id="hillside-controls">
        <strong>WASD</strong> to walk while the scene is focused. Click the scene for mouse look. Press <strong>Esc</strong> to release.
      </p>
      <p className="hillside-status" role="status">{notice || (captured ? 'Mouse captured.' : 'Mouse free.')}</p>
    </>}
  </div>;
}
