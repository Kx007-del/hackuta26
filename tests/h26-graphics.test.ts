// Claude 2: graphics pass (sun shadows, sky, shot effects). Visual only: scoring must not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeHillsideScene, rayHitsTarget, renderedTerrainHeight, SHOT_SPOT, spawnHeight, targetBase } from '../packages/gameplay/hillsideScene';
import { makeShotEffects, shotImpactPoint } from '../packages/gameplay/effects';

test('the sun casts shadows; ground receives; grass stays out of the shadow pass', () => {
  const world = makeHillsideScene();
  try {
    assert.ok(world.sun.castShadow);
    const ground = world.scene.getObjectByName('Hillside ground') as THREE.Mesh;
    assert.ok(ground.receiveShadow && !ground.castShadow);
    let casters = 0;
    world.character.root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.castShadow) casters++; });
    assert.ok(casters > 5, 'player casts a shadow');
    world.cone.traverse(o => { if ((o as THREE.Mesh).isMesh) assert.ok(o.castShadow && o.receiveShadow); });
    const instanced = world.scene.children.filter(o => (o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
    assert.equal(instanced[0].castShadow, false, 'grass does not cast');
    assert.ok(instanced.slice(-3).every(m => m.castShadow), 'trees cast');
  } finally { world.dispose(); }
});

test('the shadow box follows the player and the sun keeps its direction', () => {
  const world = makeHillsideScene();
  try {
    const dir = () => world.sun.position.clone().sub(world.sun.target.position).normalize();
    const before = dir();
    world.updateLighting(SHOT_SPOT.x, 2.6, SHOT_SPOT.z);
    assert.ok(world.sun.target.position.distanceTo(new THREE.Vector3(SHOT_SPOT.x, 2.6, SHOT_SPOT.z)) < .05);
    assert.ok(dir().angleTo(before) < 1e-6);
  } finally { world.dispose(); }
});

test('miss impact lands on the drawn terrain; a sky shot flies to max range', () => {
  const origin = new THREE.Vector3(SHOT_SPOT.x, spawnHeight + 1.5, SHOT_SPOT.z);
  const down = new THREE.Vector3(.3, -.4, -1);
  const p = shotImpactPoint(origin, down);
  assert.ok(Math.abs(p.y - renderedTerrainHeight(p.x, p.z)) < .05, `impact ${p.y.toFixed(2)} vs ground`);
  const sky = shotImpactPoint(origin, new THREE.Vector3(0, 1, 0));
  assert.ok(sky.distanceTo(origin) > 150);
});

test('shot effects: tracer and burst fade out, reset clears, dispose is clean', () => {
  const scene = new THREE.Scene();
  const fx = makeShotEffects(scene);
  const owned: Array<THREE.BufferGeometry | THREE.Material> = [];
  scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) owned.push(m.geometry); if (m.material) owned.push(m.material as THREE.Material); });
  let disposed = 0;
  for (const item of owned) item.addEventListener('dispose', () => disposed++);
  fx.shot(new THREE.Vector3(), targetBase.clone(), true);
  assert.ok(fx.active > 1);
  for (let i = 0; i < 120; i++) fx.tick(1 / 60);
  assert.equal(fx.active, 0, 'everything fades within 2 s');
  fx.shot(new THREE.Vector3(), new THREE.Vector3(0, 0, -5), false);
  fx.reset();
  assert.equal(fx.active, 0);
  fx.dispose();
  assert.equal(disposed, owned.length);
  assert.equal(scene.getObjectByName('Shot effects'), undefined);
});

test('scoring is untouched: the clip shot still hits and the preview still uses the camera ray', () => {
  const origin = new THREE.Vector3(SHOT_SPOT.x, 2.6 + 1.9, SHOT_SPOT.z);
  const aim = targetBase.clone().setY(targetBase.y + 1.2).sub(origin);
  assert.ok(rayHitsTarget(origin, aim));
  const preview = readFileSync(new URL('../packages/gameplay/HillsidePreview.tsx', import.meta.url), 'utf8');
  const fire = preview.slice(preview.indexOf('function fire'), preview.indexOf('function lockChanged'));
  assert.match(fire, /const hit = rayHitsTarget\(camera\.position, aim\);/);
  // Effects are drawn after the hit is decided, and the recoil kick never feeds back into the ray.
  assert.ok(fire.indexOf('effects.shot') > fire.indexOf('rayHitsTarget'));
  assert.doesNotMatch(fire.slice(0, fire.indexOf('rayHitsTarget')), /kick/);
});
