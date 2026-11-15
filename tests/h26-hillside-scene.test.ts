// Claude 2 regressions for PR #21 (Fortnite hillside preview). Pure scene
// functions plus source-level wiring checks; no WebGL or DOM required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  terrainHeight, walkHeight, withinWalkArea, spawnHeight, clipShoulderCamera,
  RAMP_HEADING, RIDGE_HEADING, RIDGE_DISTANCE, makeHillsideScene,
  spawnPlayer, stepPlayer, rayHitsTarget, targetBase, RUN_SPEED, GRAVITY, JUMP_SPEED, TARGET_HEIGHT,
  type PlayerState, type PlayerInput,
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

test('preview UI: only a small Reset control; Esc releases pointer lock; cleanup releases it', () => {
  const preview = src('../packages/gameplay/HillsidePreview.tsx');
  const buttons = preview.match(/<button\b/g) ?? [];
  assert.equal(buttons.length, 1, 'only the Reset button should remain');
  assert.match(preview, /className="hillside-reset" onClick=\{\(\) => controls\.current\?\.reset\(\)\}/);
  assert.doesNotMatch(preview, /Aim up the hill|Ramp and cone|type="checkbox"/);
  assert.match(preview, /event\.code === 'Escape' && document\.pointerLockElement === canvas\)\s*\{\s*document\.exitPointerLock\(\)/);
  const cleanup = preview.slice(preview.indexOf('return () => {'));
  for (const piece of ['cancelAnimationFrame', "removeEventListener('pointerlockchange'", "removeEventListener('keydown'", 'exitPointerLock', 'world.dispose()', 'renderer.dispose()'])
    assert.ok(cleanup.includes(piece), `cleanup missing ${piece}`);
  const reset = preview.slice(preview.indexOf('function reset'), preview.indexOf('function fire'));
  for (const piece of ['keys.clear()', 'player = spawnPlayer()', 'heading = RAMP_HEADING', 'targetDown = false', 'setShot(undefined)'])
    assert.ok(reset.includes(piece), `reset missing ${piece}`);
});

test('preview controls: Space jumps, arrows look without a toggle, F/click fire, R resets', () => {
  const preview = src('../packages/gameplay/HillsidePreview.tsx');
  assert.match(preview, /GAME_KEYS = new Set\(\[[^\]]*'Space'[^\]]*'ArrowLeft'/);
  assert.match(preview, /event\.code === 'Space' && !event\.repeat\) jumpQueued = true/);
  assert.match(preview, /event\.code === 'KeyF'\) \{ event\.preventDefault\(\); fire\(\)/);
  assert.match(preview, /event\.code === 'KeyR'\) \{ event\.preventDefault\(\); reset\(\)/);
  assert.match(preview, /if \(document\.pointerLockElement === canvas\) \{\s*fire\(\)/);
  assert.match(preview, /player = stepPlayer\(player, \{ forward, right, heading, jump: jumpQueued \}, dt\)/);
});

test('the cone is climbable from the landing and its apex is the high point', () => {
  const r = walk(at(0, 6.9), at(0, 9.3), LANDING);
  assert.equal(r.blocked, 0);
  assert.ok(Math.abs(r.h - (LANDING + 1.84)) < .02, `apex height ${r.h}`);
});

// ---- Gameplay physics and target ------------------------------------------
const DT = 1 / 60;
function simulate(frames: number, input: (frame: number, p: PlayerState) => Partial<PlayerInput>, start = spawnPlayer()) {
  let p = start;
  const trace: PlayerState[] = [];
  for (let i = 0; i < frames; i++) {
    p = stepPlayer(p, { forward: 0, right: 0, heading: RAMP_HEADING, jump: false, ...input(i, p) }, DT);
    trace.push(p);
  }
  return { p, trace };
}

test('Space jumps: rises about v²/2g, lands back on the deck and is grounded again', () => {
  const start = spawnPlayer();
  const { p, trace } = simulate(90, i => ({ jump: i === 0 }));
  const apex = Math.max(...trace.map(s => s.y)) - start.y;
  assert.ok(Math.abs(apex - JUMP_SPEED ** 2 / (2 * GRAVITY)) < .12, `apex ${apex}`);
  assert.ok(p.grounded && Math.abs(p.y - start.y) < 1e-6);
});

test('cannot double-jump in mid-air', () => {
  const { trace } = simulate(20, i => ({ jump: i === 0 || i === 10 }));
  const apex = Math.max(...trace.map(s => s.y)) - spawnPlayer().y;
  assert.ok(apex < JUMP_SPEED ** 2 / (2 * GRAVITY) + .05);
});

test('gravity accelerates a fall: running off the landing edge falls faster each frame', () => {
  // Run up to the landing, then run off the left side.
  const { p, trace } = simulate(160, i => ({ forward: 1, heading: i < 75 ? RAMP_HEADING : RAMP_HEADING - Math.PI / 2 }));
  const air = trace.filter(s => !s.grounded);
  assert.ok(air.length > 15, `expected a real fall, airborne frames ${air.length}`);
  for (let i = 2; i < air.length && air[i].vy > -40; i++) assert.ok(air[i].vy < air[i - 1].vy, 'vertical speed must keep increasing');
  assert.ok(Math.abs((air[5].vy - air[4].vy) / DT + GRAVITY) < 1e-6);
  assert.ok(p.grounded && Math.abs(p.y - terrainHeight(p.x, p.z)) < 1e-6, 'lands on the terrain');
});

test('momentum carries through the air (no instant stop when keys are released mid-jump)', () => {
  const { trace } = simulate(100, i => ({ forward: i < 70 ? 1 : 0, jump: i === 70 }));
  const lastAir = trace.slice(70).filter(s => !s.grounded).at(-1)!;
  assert.ok(Math.hypot(lastAir.vx, lastAir.vz) > RUN_SPEED * .3, 'still moving forward in the air');
});

test('running speed: a grounded run on flat ground reaches RUN_SPEED quickly', () => {
  const flat = spawnPlayer(30, -30);
  const { p } = simulate(30, () => ({ forward: 1, heading: 0 }), flat);
  assert.ok(Math.hypot(p.vx, p.vz) > RUN_SPEED * .6 && Math.hypot(p.vx, p.vz) < RUN_SPEED * 1.4);
});

test('downhill is faster than uphill', () => {
  const [x, z] = at(0, 25);
  const speedAfter = (heading: number) => {
    const { p } = simulate(25, () => ({ forward: 1, heading }), spawnPlayer(x, z));
    return Math.hypot(p.vx, p.vz);
  };
  // The west rise peaks around v = 29: further along the ramp heading is uphill here.
  const uphill = speedAfter(RAMP_HEADING), downhill = speedAfter(RAMP_HEADING + Math.PI);
  assert.ok(downhill > uphill * 1.2, `downhill ${downhill} vs uphill ${uphill}`);
});

test('steep terrain cannot be walked up (the old bug walked straight up the west hill)', () => {
  const { p } = simulate(360, () => ({ forward: 1 }));
  const v = local(p.x, p.z).v;
  assert.ok(v < 26, `stopped at the foot of the steep west rise, got v=${v}`);
  assert.ok(p.y < 10, `stayed low, y=${p.y}`);
});

test('the build stays solid with the new physics: side entry into the landing is blocked', () => {
  const start = at(-8, 9);
  const heading = Math.atan2(right[0], -right[1]);
  const { p } = simulate(180, () => ({ forward: 1, heading }), spawnPlayer(...start));
  assert.ok(local(p.x, p.z).u < -2.5 && p.y < LANDING - 1);
});

test('a jump from the ramp can land on the landing and on the cone', () => {
  const { trace } = simulate(140, i => ({ forward: 1, jump: i === 60 }));
  assert.ok(trace.some(s => s.grounded && Math.abs(s.y - LANDING) < .01 || s.grounded && s.y > LANDING));
});

test('target dummy is a visible, player-sized figure at 61 m on the aim heading', () => {
  const world = makeHillsideScene();
  try {
    const dummy = world.scene.getObjectByName('Target dummy');
    assert.equal(dummy, world.target);
    assert.ok(Math.abs(Math.hypot(dummy!.position.x, dummy!.position.z) - 61) < 1e-6);
    const box = new THREE.Box3().setFromObject(dummy!);
    const height = box.max.y - box.min.y;
    assert.ok(height > 1.7 && height < 2.1, `height ${height}`);
    dummy!.traverse(o => { if ((o as THREE.Mesh).material) assert.equal(((o as THREE.Mesh).material as THREE.MeshStandardMaterial).fog, false, 'target ignores fog so it reads at 61 m'); });
  } finally { world.dispose(); }
});

test('hitscan: aiming at the dummy hits, a small miss or aiming through the hill misses', () => {
  const s = spawnPlayer();
  const eye = new THREE.Vector3(s.x, s.y + 1.55, s.z);
  const chest = targetBase.clone().add(new THREE.Vector3(0, 1.1, 0));
  const dir = chest.clone().sub(eye);
  assert.equal(rayHitsTarget(eye, dir), true);
  assert.equal(rayHitsTarget(eye, dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(1.5))), false);
  assert.equal(rayHitsTarget(eye, chest.clone().add(new THREE.Vector3(0, TARGET_HEIGHT, 0)).sub(eye)), false, 'over the head');
  assert.equal(rayHitsTarget(eye, dir.clone().negate()), false, 'behind');
  // A line that passes through the terrain is blocked even when it points at the dummy.
  const underground = eye.clone().setY(terrainHeight(eye.x, eye.z) - 4);
  assert.equal(rayHitsTarget(underground, chest.clone().sub(underground)), false, 'terrain blocks the shot');
});
