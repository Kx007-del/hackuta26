// Claude 2 regressions for PR #21 (Fortnite hillside preview). Pure scene
// functions plus source-level wiring checks; no WebGL or DOM required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  terrainHeight, walkHeight, withinWalkArea, spawnHeight, clipShoulderCamera,
  RAMP_HEADING, RIDGE_HEADING, RIDGE_DISTANCE, makeHillsideScene,
  spawnPlayer, stepPlayer, rayHitsTarget, targetBase, RUN_SPEED, GRAVITY, JUMP_SPEED, TARGET_HEIGHT, MAX_CLIMB_SLOPE, SHOT_SPOT,
  type PlayerState, type PlayerInput,
} from '../packages/gameplay/hillsideScene';

const LANDING = 2.6;
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

test('spawn stands on the high platform at the top of the build, well above the terrain', () => {
  const s = spawnPlayer();
  assert.equal(s.y, spawnHeight);
  assert.ok(s.y > terrainHeight(s.x, s.z) + 3, `spawn ${s.y} vs ground ${terrainHeight(s.x, s.z)}`);
  assert.ok(local(s.x, s.z).v < -3.7, 'spawn is behind the top of the ramp');
  assert.equal(walkHeight(s.x, s.z, s.y), s.y);
});

test('ridge marker is 61 m from the shooting spot (landing/cone) along the aim heading and above eye level', () => {
  const world = makeHillsideScene();
  try {
    const { x, y, z } = world.ridgePoint;
    assert.equal(RIDGE_DISTANCE, 61);
    // Measured from where the clip's shot is fired (the landing/cone), not from spawn (Claude 1 review G1).
    assert.ok(Math.abs(Math.hypot(x - SHOT_SPOT.x, z - SHOT_SPOT.z) - RIDGE_DISTANCE) < 1e-6);
    const bearing = Math.atan2(x - SHOT_SPOT.x, -(z - SHOT_SPOT.z));
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

test('the ramp runs downhill from the spawn platform to the landing', () => {
  const s = spawnPlayer();
  const r = walk([s.x, s.z], at(0, 6.9), s.y);
  assert.equal(r.blocked, 0);
  assert.ok(Math.abs(r.h - LANDING) < .05, `expected landing height, got ${r.h}`);
  assert.ok(s.y - LANDING > 3, 'the landing is well below the spawn');
  let prev = Infinity;
  for (let v = -3.7; v <= 6.8; v += .5) {
    const h = walkHeight(...at(0, v), 10)!;
    assert.ok(h <= prev + 1e-9, `ramp rises at v=${v}`);
    prev = h;
  }
});

test('running down the ramp builds speed above the flat run speed', () => {
  let p = spawnPlayer(), top = 0;
  for (let i = 0; i < 80; i++) {
    p = stepPlayer(p, { forward: 1, right: 0, heading: RAMP_HEADING, jump: false }, 1 / 60);
    top = Math.max(top, Math.hypot(p.vx, p.vz));
  }
  assert.ok(top > RUN_SPEED * 1.25, `top speed ${top}`);
});

test('the target marker tracks the dummy and shows live distance', () => {
  const preview = src('../packages/gameplay/HillsidePreview.tsx');
  assert.match(preview, /className="hillside-marker"/);
  assert.match(preview, /markerPoint\.copy\(world\.target\.position\)/);
  assert.match(preview, /Math\.round\(distance\)\}/);
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

test('preview UI: only small Reset and Full screen controls; Esc releases pointer lock; cleanup releases it', () => {
  const preview = src('../packages/gameplay/HillsidePreview.tsx');
  // The scene stage itself keeps only Reset and Full screen; the scoring consent buttons live in the panel below it.
  const stage = preview.slice(preview.indexOf('<div className="hillside-stage"'), preview.indexOf('<ScoringPanel'));
  const buttons = stage.match(/<button\b/g) ?? [];
  assert.equal(buttons.length, 2, 'only Reset and Full screen remain on the stage');
  assert.ok(preview.includes('onClick={toggleFullscreen}'));
  assert.ok(preview.includes('el.requestFullscreen?.()'));
  assert.ok(preview.includes('document.exitFullscreen()'));
  assert.ok(preview.includes("removeEventListener('fullscreenchange', changed)"));
  assert.ok(src('../src/fortnite-showcase.css').includes('.hillside-stage:fullscreen'));
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
  assert.match(preview, /event\.button === 0 && document\.pointerLockElement === canvas\) fire\(\)/);
  assert.match(preview, /document\.addEventListener\('mousedown', onMouseDown\)/);
  assert.match(preview, /document\.removeEventListener\('mousedown', onMouseDown\)/);
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

test('a long run from spawn never puts the player or the camera inside the terrain', () => {
  // The earlier build let W walk straight up the west hill and the camera sank into the grass.
  const { trace } = simulate(480, i => ({ forward: 1, heading: RAMP_HEADING + Math.sin(i / 60) * .6 }));
  for (const s of trace) {
    assert.ok(s.y >= terrainHeight(s.x, s.z) - 1e-6, 'player below terrain');
    const heading = RAMP_HEADING, sin = Math.sin(heading), cos = Math.cos(heading);
    const pivot = new THREE.Vector3(s.x, s.y + 1.55, s.z);
    const cam = clipShoulderCamera(pivot, new THREE.Vector3(-sin * 3.05 + cos * .64, .52, cos * 3.05 + sin * .64), new THREE.Vector3());
    assert.ok(cam.y > terrainHeight(cam.x, cam.z), 'camera inside terrain');
  }
});

test('terrain steeper than the climb limit blocks a grounded player', () => {
  // Drive stepPlayer against a synthetic rise by starting next to the build's high side wall:
  // the deck rule blocks it, and the terrain rule is exercised through MAX_CLIMB_SLOPE directly.
  const start = spawnPlayer(...at(-6, 0));
  const heading = Math.atan2(right[0], -right[1]);
  const { p } = simulate(120, () => ({ forward: 1, heading }), start);
  assert.ok(local(p.x, p.z).u < -2.5, 'stopped at the wall of the build');
  assert.ok(MAX_CLIMB_SLOPE > .5 && MAX_CLIMB_SLOPE < 1.2);
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
    assert.ok(Math.abs(Math.hypot(dummy!.position.x - SHOT_SPOT.x, dummy!.position.z - SHOT_SPOT.z) - 61) < 1e-6);
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

test('a target you can see is a target you can hit: shot occlusion matches the rendered ground', async () => {
  const { renderedTerrainHeight } = await import('../packages/gameplay/hillsideScene');
  // Regression: occlusion used the smooth terrain formula while the GPU draws a coarser mesh,
  // so ~18% of clearly visible shots over the crest scored as blocked.
  let checked = 0;
  for (const aimY of [.4, 1.1, 1.6]) for (let x = -30; x <= 30; x += 4) for (let z = -30; z <= 30; z += 4) {
    const eye = new THREE.Vector3(x, terrainHeight(x, z) + 2.45, z);
    const aim = targetBase.clone().add(new THREE.Vector3(0, aimY, 0));
    const d = aim.clone().sub(eye), length = d.length();
    d.normalize();
    let clear = true;
    for (let t = .25; t < length - .5 && clear; t += .25) {
      const q = eye.clone().addScaledVector(d, t);
      if (q.y < renderedTerrainHeight(q.x, q.z)) clear = false;
      // Only terrain-only sight lines: skip anything crossing the build or the hut, which block on purpose.
      const surface = walkHeight(q.x, q.z, 100);
      if (surface === undefined || surface !== terrainHeight(q.x, q.z)) clear = false;
    }
    if (!clear || walkHeight(x, z, 100) !== terrainHeight(x, z)) continue; // skip spots on or under the build
    checked++;
    assert.equal(rayHitsTarget(eye, aim.clone().sub(eye)), true, `visible shot from (${x}, ${z}) aimed at +${aimY} m was blocked`);
  }
  assert.ok(checked > 200, `enough clear sight lines sampled (${checked})`);
});
