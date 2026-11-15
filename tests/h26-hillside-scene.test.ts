// Claude 2 regressions for PR #21 (Fortnite hillside preview). Pure scene
// functions plus source-level wiring checks; no WebGL or DOM required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  terrainHeight, walkHeight, withinWalkArea, spawnHeight, clipShoulderCamera,
  RAMP_HEADING, RIDGE_HEADING, RIDGE_DISTANCE, makeHillsideScene,
} from '../packages/gameplay/hillsideScene';

const LANDING = 4.34;
const forward = [Math.sin(RAMP_HEADING), -Math.cos(RAMP_HEADING)] as const;
const right = [Math.cos(RAMP_HEADING), Math.sin(RAMP_HEADING)] as const;
const at = (u: number, v: number) => [right[0] * u + forward[0] * v, right[1] * u + forward[1] * v] as const;
const local = (x: number, z: number) => ({ u: x * right[0] + z * right[1], v: x * forward[0] + z * forward[1] });
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Mirrors HillsidePreview.moveTo: a blocked step (undefined) leaves the player in place. */
function walk(from: readonly [number, number], to: readonly [number, number], startHeight: number, steps = 400) {
  let [x, z] = from, h = startHeight, blocked = 0;
  for (let i = 1; i <= steps; i++) {
    const nx = from[0] + (to[0] - from[0]) * i / steps, nz = from[1] + (to[1] - from[1]) * i / steps;
    const next = walkHeight(nx, nz, h);
    if (next === undefined) { blocked++; continue; }
    x = nx; z = nz; h = next;
  }
  return { x, z, h, blocked };
}

test('reference headings: ramp 265°, aim 200°, a 65° left turn', () => {
  assert.equal(Math.round(THREE.MathUtils.radToDeg(RAMP_HEADING)), 265);
  assert.equal(Math.round(THREE.MathUtils.radToDeg(RIDGE_HEADING)), 200);
  assert.equal(Math.round(THREE.MathUtils.radToDeg(RAMP_HEADING - RIDGE_HEADING)), 65);
});

test('spawn stands on the ramp deck, above the terrain', () => {
  assert.ok(spawnHeight > terrainHeight(0, 0) + 1, `spawn ${spawnHeight} vs ground ${terrainHeight(0, 0)}`);
  assert.equal(walkHeight(0, 0, spawnHeight), spawnHeight);
});

test('ridge marker is 61 m away along the aim heading and above eye level', () => {
  const world = makeHillsideScene();
  try {
    const { x, y, z } = world.ridgePoint;
    assert.equal(RIDGE_DISTANCE, 61);
    assert.ok(Math.abs(Math.hypot(x, z) - RIDGE_DISTANCE) < 1e-6);
    const bearing = Math.atan2(x, -z);
    assert.ok(Math.abs(THREE.MathUtils.euclideanModulo(bearing - RIDGE_HEADING + Math.PI, Math.PI * 2) - Math.PI) < 1e-6);
    assert.ok(y > spawnHeight + 1.55, `marker ${y} should sit above spawn eye level`);
    assert.equal(y, terrainHeight(x, z));
  } finally { world.dispose(); }
});

test('cone is preplaced scenery centred on the landing, present in every freshly built scene', () => {
  for (let run = 0; run < 3; run++) {
    const world = makeHillsideScene();
    try {
      world.scene.updateMatrixWorld(true);
      assert.equal(world.scene.getObjectByName('Preplaced wooden cone'), world.cone);
      assert.ok(world.cone.visible && world.cone.children.length > 0);
      const p = world.cone.getWorldPosition(new THREE.Vector3());
      const { u, v } = local(p.x, p.z);
      assert.ok(Math.abs(u) < 1e-6 && v > 6.8 && v < 11.8, `cone on landing, got u=${u} v=${v}`);
      assert.ok(Math.abs(p.y - LANDING) < 1e-6);
    } finally { world.dispose(); }
  }
});

test('walking up the ramp from the ground in front of the toe reaches the landing', () => {
  const start = at(0, -6);
  const r = walk(start, at(0, 6.9), terrainHeight(...start));
  assert.equal(r.blocked, 0, 'the ramp toe must be walkable');
  assert.ok(Math.abs(r.h - LANDING) < .05, `expected landing height, got ${r.h}`);
});

test('C1: side entry into the landing is blocked (no walking under or through the deck)', () => {
  const start = at(-8, 9);
  const r = walk(start, at(0, 9), terrainHeight(...start));
  assert.ok(r.blocked > 0, 'side entry should be blocked at the deck edge');
  assert.ok(local(r.x, r.z).u < -2.5, `player stopped outside the deck, u=${local(r.x, r.z).u}`);
});

test('C1: side entry into the high ramp is blocked from both sides', () => {
  for (const side of [-1, 1]) {
    const start = at(side * 8, 4);
    const r = walk(start, at(0, 4), terrainHeight(...start));
    assert.ok(r.blocked > 0 && Math.abs(local(r.x, r.z).u) > 2.5, `side ${side}: u=${local(r.x, r.z).u}`);
  }
});

test('walking off the landing edge drops back to terrain without getting stuck', () => {
  const r = walk(at(0, 6.9), at(-8, 6.9), LANDING);
  assert.equal(r.blocked, 0);
  assert.equal(r.h, terrainHeight(r.x, r.z));
});

test('the hut is solid: walking at it stops outside the footprint', () => {
  const world = makeHillsideScene();
  try {
    const hut = world.scene.getObjectByName('Uphill hut');
    assert.ok(hut, 'hut named for tests');
    const target = [hut.position.x, hut.position.z] as const;
    const start = [target[0] + 12, target[1]] as const;
    const r = walk(start, target, terrainHeight(...start));
    assert.ok(r.blocked > 0, 'walking into the hut should be blocked');
    assert.equal(walkHeight(target[0], target[1], 100), undefined);
  } finally { world.dispose(); }
});

test('walk area is a 72 m radius and the edge is a blocked move', () => {
  assert.equal(withinWalkArea(0, 0), true);
  assert.equal(withinWalkArea(72, 0), true);
  assert.equal(withinWalkArea(72.01, 0), false);
  assert.equal(walkHeight(72.5, 0, 50), undefined);
});

test('shoulder camera never ends below terrain across a full turn on ramp, aim spot and cone', () => {
  for (const [u, v, h] of [[0, 0, spawnHeight], [0, 9.3, LANDING + 1.84], [-2.42, 0, spawnHeight]] as const) {
    const [x, z] = at(u, v);
    for (let deg = 0; deg < 360; deg += 15) for (const pitch of [-.85, -.1, .67]) {
      const heading = THREE.MathUtils.degToRad(deg), sin = Math.sin(heading), cos = Math.cos(heading);
      const pivot = new THREE.Vector3(x, h + 1.55, z);
      const offset = new THREE.Vector3(-sin * 3.05 + cos * .64, .38 - 1.38 * pitch, cos * 3.05 + sin * .64);
      const cam = clipShoulderCamera(pivot, offset, new THREE.Vector3());
      assert.ok(cam.y > terrainHeight(cam.x, cam.z), `camera under terrain at ${deg}° pitch ${pitch}`);
      assert.ok(cam.distanceTo(pivot) <= offset.length() + 1e-9);
    }
  }
});

test('showcase is Fortnite-only: no GameArena, legacy arena or relay code is loaded', () => {
  const showcase = src('../src/FortniteShowcase.tsx');
  assert.match(showcase, /lazy\(\(\) => import\('\.\.\/packages\/gameplay\/HillsidePreview'\)\)/);
  assert.doesNotMatch(showcase, /GameArena|PracticeGuide|ChallengeBuilder|rooftop|tactical|relay/i);
});

test('preview wiring: Reset reuses the ramp review, Esc releases pointer lock, cleanup releases it', () => {
  const preview = src('../packages/gameplay/HillsidePreview.tsx');
  assert.match(preview, /onClick=\{\(\) => controls\.current\?\.review\('ramp'\)\}>Reset position</);
  assert.match(preview, /onClick=\{\(\) => controls\.current\?\.review\('ridge'\)\}>Aim up the hill</);
  assert.match(preview, /event\.code === 'Escape' && document\.pointerLockElement === canvas\)\s*\{\s*document\.exitPointerLock\(\)/);
  const cleanup = preview.slice(preview.indexOf('return () => {'));
  for (const piece of ['cancelAnimationFrame', "removeEventListener('pointerlockchange'", "removeEventListener('keydown'", 'exitPointerLock', 'world.dispose()', 'renderer.dispose()'])
    assert.ok(cleanup.includes(piece), `cleanup missing ${piece}`);
  const review = preview.slice(preview.indexOf('function review'), preview.indexOf('function lockChanged'));
  assert.match(review, /keys\.clear\(\)/);
  assert.match(review, /x = z = 0/);
});

test('C2: keyboard look is opt-in and only arrow keys turn the view', () => {
  const preview = src('../packages/gameplay/HillsidePreview.tsx');
  assert.match(preview, /const keyboardLook = useRef\(false\)/);
  assert.match(preview, /LOOK_KEYS = new Set\(\['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'\]\)/);
  assert.match(preview, /keyboardLook\.current && LOOK_KEYS\.has\(event\.code\)/);
  assert.match(preview, /type="checkbox"[^>]*checked=\{lookEnabled\}/);
});

test('the cone is climbable from the landing and its apex is the high point', () => {
  const r = walk(at(0, 6.9), at(0, 9.3), LANDING);
  assert.equal(r.blocked, 0);
  assert.ok(Math.abs(r.h - (LANDING + 1.84)) < .02, `apex height ${r.h}`);
});
