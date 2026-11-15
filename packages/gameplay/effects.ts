import * as THREE from 'three';
import { renderedTerrainHeight } from './hillsideScene';

/**
 * Visual-only shot feedback: a bullet tracer, a burst of sparks on a hit and a dust puff where a
 * missed shot lands. Nothing here affects scoring; hits are still decided by rayHitsTarget.
 */
export type ShotEffects = {
  /** Draw a tracer from `from` to `to` and spawn an impact burst at `to`. */
  shot(from: THREE.Vector3, to: THREE.Vector3, hit: boolean): void;
  tick(dt: number): void;
  reset(): void;
  /** Number of live particles + tracers (for tests). */
  readonly active: number;
  dispose(): void;
};

const TRACER_SECONDS = .09;
const PARTICLES = 48;
const MAX_RANGE = 160;
const SPIN_AXIS = new THREE.Vector3(1, 1, 0).normalize();

/** Where a ray first meets the drawn terrain, or a far point along it when it hits nothing. */
export function shotImpactPoint(origin: THREE.Vector3, direction: THREE.Vector3, result = new THREE.Vector3()) {
  const d = direction.clone().normalize();
  let previous = 0;
  for (let t = .5; t <= MAX_RANGE; t += .5) {
    const x = origin.x + d.x * t, y = origin.y + d.y * t, z = origin.z + d.z * t;
    if (y <= renderedTerrainHeight(x, z)) {
      // Refine between the last two samples so the puff sits on the surface.
      let lo = previous, hi = t;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const my = origin.y + d.y * mid;
        if (my <= renderedTerrainHeight(origin.x + d.x * mid, origin.z + d.z * mid)) hi = mid; else lo = mid;
      }
      return result.copy(origin).addScaledVector(d, hi);
    }
    previous = t;
  }
  return result.copy(origin).addScaledVector(d, MAX_RANGE);
}

export function makeShotEffects(scene: THREE.Scene): ShotEffects {
  const group = new THREE.Group();
  group.name = 'Shot effects';
  scene.add(group);

  // Tracer: a thin additive line that fades out quickly.
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const tracerMaterial = new THREE.LineBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
  tracer.frustumCulled = false;
  tracer.visible = false;
  group.add(tracer);
  let tracerLeft = 0;

  // Particles: one instanced mesh of small cubes, reused for sparks (hit) and dust (miss).
  const particleGeometry = new THREE.BoxGeometry(1, 1, 1);
  const particleMaterial = new THREE.MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false });
  const particles = new THREE.InstancedMesh(particleGeometry, particleMaterial, PARTICLES);
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  particles.count = 0;
  group.add(particles);
  const pos = Array.from({ length: PARTICLES }, () => new THREE.Vector3());
  const vel = Array.from({ length: PARTICLES }, () => new THREE.Vector3());
  const life = new Float32Array(PARTICLES), maxLife = new Float32Array(PARTICLES), size = new Float32Array(PARTICLES);
  let gravity = 0, live = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const spark = [new THREE.Color('#ffd166'), new THREE.Color('#ff7a3d'), new THREE.Color('#fff4d6')];
  const dust = [new THREE.Color('#a08a6c'), new THREE.Color('#7d6d58'), new THREE.Color('#c2ae8f')];

  function burst(at: THREE.Vector3, hit: boolean) {
    const palette = hit ? spark : dust;
    gravity = hit ? 9 : 2.5;
    live = hit ? PARTICLES : 26;
    for (let i = 0; i < live; i++) {
      pos[i].copy(at);
      const a = Math.random() * Math.PI * 2, up = hit ? Math.random() * 1.2 - .2 : Math.random() * .8 + .2;
      const speed = hit ? 4 + Math.random() * 7 : .8 + Math.random() * 1.8;
      vel[i].set(Math.cos(a), up, Math.sin(a)).normalize().multiplyScalar(speed);
      maxLife[i] = life[i] = hit ? .35 + Math.random() * .45 : .6 + Math.random() * .6;
      // Sparks are seen from ~61 m, so they are large; dust lands near or far.
      size[i] = hit ? .3 + Math.random() * .3 : .18 + Math.random() * .25;
      particles.setColorAt(i, palette[i % palette.length]);
    }
    particles.count = live;
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    particleMaterial.opacity = 1;
    write();
  }

  function write() {
    let anyAlive = false;
    for (let i = 0; i < live; i++) {
      const k = Math.max(0, life[i] / maxLife[i]);
      if (k > 0) anyAlive = true;
      q.setFromAxisAngle(SPIN_AXIS, life[i] * 9 + i);
      s.setScalar(size[i] * k);
      m.compose(pos[i], q, s);
      particles.setMatrixAt(i, m);
    }
    particles.instanceMatrix.needsUpdate = true;
    if (!anyAlive) { particles.count = 0; live = 0; }
  }

  return {
    shot(from, to, hit) {
      const p = tracerGeometry.attributes.position as THREE.BufferAttribute;
      p.setXYZ(0, from.x, from.y, from.z);
      p.setXYZ(1, to.x, to.y, to.z);
      p.needsUpdate = true;
      tracerGeometry.computeBoundingSphere();
      tracer.visible = true;
      tracerMaterial.opacity = 1;
      tracerLeft = TRACER_SECONDS;
      burst(to, hit);
    },
    tick(dt) {
      if (tracerLeft > 0) {
        tracerLeft -= dt;
        tracerMaterial.opacity = Math.max(0, tracerLeft / TRACER_SECONDS);
        if (tracerLeft <= 0) tracer.visible = false;
      }
      if (!live) return;
      for (let i = 0; i < live; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vel[i].y -= gravity * dt;
        vel[i].multiplyScalar(Math.max(0, 1 - dt * 1.5));
        pos[i].addScaledVector(vel[i], dt);
      }
      write();
    },
    reset() {
      tracerLeft = 0;
      tracer.visible = false;
      live = 0;
      particles.count = 0;
    },
    get active() { return live + (tracer.visible ? 1 : 0); },
    dispose() {
      tracerGeometry.dispose();
      tracerMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      particles.dispose();
      group.removeFromParent();
    },
  };
}
