// Claude 2 regressions for PR #21 (Fortnite hillside preview). Pure scene
// functions plus source-level wiring checks; no WebGL or DOM required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  terrainHeight, walkHeight, withinWalkArea, spawnHeight, cameraFloor,
  RAMP_HEADING, RIDGE_HEADING, RIDGE_DISTANCE, makeHillsideScene,
} from '../packages/gameplay/hillsideScene';

const forward = [Math.sin(RAMP_HEADING), -Math.cos(RAMP_HEADING)] as const;
const right = [Math.cos(RAMP_HEADING), Math.sin(RAMP_HEADING)] as const;
const at = (u: number, v: number) => [right[0] * u + forward[0] * v, right[1] * u + forward[1] * v] as const;
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('reference headings: ramp 265°, aim 200°, a 65° left turn', () => {
  assert.equal(Math.round(THREE.MathUtils.radToDeg(RAMP_HEADING)), 265);
  assert.equal(Math.round(THREE.MathUtils.radToDeg(RIDGE_HEADING)), 200);
  assert.equal(Math.round(THREE.MathUtils.radToDeg(RAMP_HEADING - RIDGE_HEADING)), 65);
});

test('spawn stands on the ramp deck, above the terrain', () => {
  assert.ok(spawnHeight > terrainHeight(0, 0) + 2, `spawn ${spawnHeight} vs ground ${terrainHeight(0, 0)}`);
  assert.equal(walkHeight(0, 0, spawnHeight), spawnHeight);
  assert.equal(cameraFloor(0, 0), spawnHeight);
});

test('ridge marker is 61 m away along the aim heading and above eye level', () => {
  const world = makeHillsideScene();
  try {
    const { x, y, z } = world.ridgePoint;
    assert.ok(Math.abs(Math.hypot(x, z) - RIDGE_DISTANCE) < 1e-6);
    assert.equal(RIDGE_DISTANCE, 61);
    const bearing = Math.atan2(x, -z); // same convention as sin(h), -cos(h)
    assert.ok(Math.abs(THREE.MathUtils.euclideanModulo(bearing - RIDGE_HEADING + Math.PI, Math.PI * 2) - Math.PI) < 1e-6);
    assert.ok(y > spawnHeight + 1.55, `marker ${y} should sit above spawn eye level`);
    assert.equal(y, terrainHeight(x, z));
  } finally { world.dispose(); }
});

test('cone is preplaced scenery on the landing, present in every freshly built scene', () => {
  for (let run = 0; run < 3; run++) {
    const world = makeHillsideScene();
    try {
      world.scene.updateMatrixWorld(true);
      const found = world.scene.getObjectByName('Preplaced wooden cone');
      assert.equal(found, world.cone);
      assert.ok(world.cone.visible && world.cone.children.length > 0);
      const p = world.cone.getWorldPosition(new THREE.Vector3());
      const v = p.x * forward[0] + p.z * forward[1];
      const u = p.x * right[0] + p.z * right[1];
      assert.ok(Math.abs(u) < 1e-6 && v > 1.3 && v < 6.3, `cone on landing, got u=${u} v=${v}`);
      assert.ok(Math.abs(p.y - 4.34) < 1e-6);
    } finally { world.dispose(); }
  }
});

test('walking up the ramp from the ground reaches the landing deck', () => {
  let [x, z] = at(0, -6);
  let h = terrainHeight(x, z), peak = h;
  for (let v = -6; v <= 1.5; v += .05) { [x, z] = at(0, v); h = walkHeight(x, z, h); peak = Math.max(peak, h); }
  assert.ok(h >= 4.3, `expected to stand near landing height 4.34, got ${h}`);
});

test('a drop off the deck edge falls back to terrain', () => {
  const [x, z] = at(4, 3);
  assert.equal(walkHeight(x, z, 4.34), terrainHeight(x, z));
});

test('walk area is a 72 m radius around spawn', () => {
  assert.equal(withinWalkArea(0, 0), true);
  assert.equal(withinWalkArea(72, 0), true);
  assert.equal(withinWalkArea(72.01, 0), false);
});

test('KNOWN GAP C1: walking into the landing from the side passes under/through it', { todo: 'side collision not implemented (Claude 1 C1)' }, () => {
  let [x, z] = at(-6, 3.8);
  let h = terrainHeight(x, z);
  for (let u = -6; u <= 0; u += .05) {
    [x, z] = at(u, 3.8);
    h = walkHeight(x, z, h);
    if (Math.abs(u) < 2.5) assert.ok(h >= cameraFloor(x, z) - .4, `player at ${h.toFixed(2)} inside deck at ${cameraFloor(x, z).toFixed(2)}`);
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
  // Review resets position and clears held keys so a reset is deterministic.
  const review = preview.slice(preview.indexOf('function review'), preview.indexOf('function lockChanged'));
  assert.match(review, /keys\.clear\(\)/);
  assert.match(review, /x = z = 0/);
});
