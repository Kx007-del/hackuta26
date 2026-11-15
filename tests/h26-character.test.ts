// Claude 2: original character + rifle (packages/gameplay/character.ts, rifle.ts).
// Pure three.js checks; no WebGL or DOM required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeCharacter, UPPER_ARM, FOREARM, type CharacterPose } from '../packages/gameplay/character';
import { makeRifle } from '../packages/gameplay/rifle';
import { makeHillsideScene } from '../packages/gameplay/hillsideScene';

const base: CharacterPose = { grounded: true, gait: 0, walkWeight: 0, vy: 0, pitch: 0, time: 0 };
const poses: Array<[string, CharacterPose]> = [
  ['idle', base],
  ['idle aim up', { ...base, pitch: .5 }],
  ['idle aim down', { ...base, pitch: -.55 }],
  ...[0, 1, 2, 3, 4, 5].map(i => [`run ${i}`, { ...base, gait: i, walkWeight: 1, time: i }] as [string, CharacterPose]),
  ['jump rising', { ...base, grounded: false, vy: 5 }],
  ['falling aim up', { ...base, grounded: false, vy: -8, pitch: .4 }],
];
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the cylindrical mask face clears the shell from both quarters at all review pitches', () => {
  const c = makeCharacter();
  try {
    const shell = c.root.getObjectByName('Helmet shell') as THREE.Mesh;
    assert.ok(shell?.isMesh);
    const mask = shell.parent!;
    const strokes = mask.children.filter(node => node.name.startsWith('Mask ')) as THREE.Mesh[];
    assert.equal(strokes.filter(node => node.name === 'Mask eye').length, 4);
    assert.equal(strokes.filter(node => node.name === 'Mask smile').length, 1);
    const ray = new THREE.Raycaster();
    for (const pitch of [-.6, 0, .55]) {
      c.pose({ ...base, pitch });
      c.root.updateMatrixWorld(true);
      for (const stroke of strokes) {
        const positions = stroke.geometry.attributes.position;
        const indices = stroke.geometry.index!;
        for (let i = 0; i < indices.count; i += 3) {
          const point = new THREE.Vector3();
          for (let j = 0; j < 3; j++) {
            point.add(new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i+j)));
          }
          point.multiplyScalar(1/3);
          const centre = new THREE.Vector3(0,point.y,0);
          const origin = point.clone().sub(centre).multiplyScalar(2.6).add(centre);
          const worldOrigin = mask.localToWorld(origin);
          ray.set(worldOrigin, mask.localToWorld(centre).sub(worldOrigin).normalize());
          const paint = ray.intersectObject(stroke,false)[0];
          const white = ray.intersectObject(shell,false)[0];
          assert.ok(paint && white && white.distance - paint.distance > .0006,
            `${stroke.name} breaks through the shell at pitch ${pitch}, triangle ${i/3}`);
        }
      }
    }
  } finally { c.dispose(); }
});

test('keeps a boot planted during the run cycle and settles after landing', () => {
  const c = makeCharacter();
  function footHeight() {
    c.root.updateMatrixWorld(true);
    const heights: number[] = [];
    c.root.traverse(o => { if (o.name === 'Boot') heights.push(new THREE.Box3().setFromObject(o,true).min.y); });
    assert.equal(heights.length,2);
    return Math.min(...heights);
  }
  try {
    for(let i=0;i<32;i++) {
      c.pose({ ...base, walkWeight:1, gait:i*Math.PI/16 });
      assert.ok(footHeight() >= -.001 && footHeight() < .02, 'at least one boot stays level with the sole planted');
    }
    c.pose({ ...base, grounded:false, vy:-4 });
    c.pose(base);
    assert.ok(footHeight() >= -.001 && footHeight() < .02);
    const compressed = c.joints.rightShoulder.clone();
    c.tick(.2);
    c.pose(base);
    assert.ok(compressed.distanceTo(c.joints.rightShoulder) > .006, 'the landing compression releases');
  } finally { c.dispose(); }
});

test('both hands stay on the rifle in every pose (no floating hands, no stretched arms)', () => {
  const c = makeCharacter();
  try {
    for (const [name, pose] of poses) {
      c.pose(pose);
      const j = c.joints;
      for (const [s, e, w, t, side] of [
        [j.rightShoulder, j.rightElbow, j.rightWrist, j.rightTarget, 'right'],
        [j.leftShoulder, j.leftElbow, j.leftWrist, j.leftTarget, 'left'],
      ] as const) {
        assert.ok(Math.abs(s.distanceTo(e) - UPPER_ARM) < 1e-6, `${name} ${side} upper arm stretched`);
        assert.ok(e.distanceTo(w) <= FOREARM + 1e-6, `${name} ${side} forearm stretched`);
        assert.ok(w.distanceTo(t) < .012, `${name} ${side} hand ${w.distanceTo(t).toFixed(3)} m off the rifle`);
        assert.ok(e.y < Math.max(s.y, w.y) + .02, `${name} ${side} elbow sticks up above the shoulder and hand`);
      }
    }
  } finally { c.dispose(); }
});

test('the rifle points where the player aims (forward, following pitch)', () => {
  const c = makeCharacter();
  try {
    for (const pitch of [-.5, 0, .4]) {
      c.pose({ ...base, pitch });
      c.root.updateMatrixWorld(true);
      const back = new THREE.Vector3(), front = new THREE.Vector3();
      c.rifle.root.localToWorld(back.set(0, .02, .2));
      c.rifle.muzzle.getWorldPosition(front);
      const dir = front.sub(back).normalize();
      assert.ok(dir.z < -.8, `barrel forward at pitch ${pitch}`);
      assert.ok(Math.abs(Math.asin(dir.y) - pitch) < .05, `barrel pitch ${Math.asin(dir.y).toFixed(3)} vs ${pitch}`);
    }
  } finally { c.dispose(); }
});

test('boots touch the ground standing still, and the rifle stays clear of the helmet', () => {
  const c = makeCharacter();
  try {
    for (const pitch of [-.55, 0, .55]) {
      c.pose({ ...base, pitch });
      c.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(c.root);
      assert.ok(Math.abs(box.min.y) < .03, `lowest point ${box.min.y.toFixed(3)} should be at the ground`);
      const helmet = c.root.getObjectByProperty('type', 'Mesh');
      void helmet;
      const head = new THREE.Vector3(0, 1.27 + .3 + .2, 0);
      const barrel = [0, -.2, -.4, -.6, -.86].map(z => c.rifle.root.localToWorld(new THREE.Vector3(0, .02, z)));
      for (const p of barrel) assert.ok(p.distanceTo(head) > .2, `barrel ${p.distanceTo(head).toFixed(3)} m from helmet centre`);
    }
    c.pose(base);
    c.root.updateMatrixWorld(true);
    const tall = new THREE.Box3().setFromObject(c.root);
    assert.ok(tall.max.y > 1.75 && tall.max.y < 2.05, `character height ${tall.max.y.toFixed(2)}`);
  } finally { c.dispose(); }
});

test('jump pose tucks the legs; run pose swings them', () => {
  const c = makeCharacter();
  try {
    const boots = () => {
      c.root.updateMatrixWorld(true);
      const ys: number[] = [];
      c.root.traverse(o => { if (o.name === 'Boot') ys.push(new THREE.Box3().setFromObject(o).min.y); });
      assert.equal(ys.length, 2);
      return ys;
    };
    c.pose(base);
    const [l0, r0] = boots();
    assert.ok(Math.abs(l0 - r0) < .01, 'feet level when standing');
    c.pose({ ...base, grounded: false, vy: 5 });
    for (const y of boots()) assert.ok(y > l0 + .12, `boot only ${(y - l0).toFixed(2)} m up in the jump pose`);
    c.pose({ ...base, gait: Math.PI / 2, walkWeight: 1 });
    const [l1, r1] = boots();
    assert.ok(Math.abs(l1 - r1) > .03, 'run pose lifts one foot');
  } finally { c.dispose(); }
});

test('firing shows a brief muzzle flash and a recoil that settles', () => {
  const r = makeRifle();
  try {
    assert.equal(r.flashVisible, false);
    r.fire();
    assert.equal(r.flashVisible, true);
    assert.equal(r.recoil, 1);
    r.tick(.1);
    assert.equal(r.flashVisible, false, 'flash lasts well under 0.1 s');
    assert.ok(r.recoil > 0 && r.recoil < 1);
    r.tick(.3);
    assert.equal(r.recoil, 0);
    r.fire(); r.reset();
    assert.equal(r.flashVisible, false);
    assert.equal(r.recoil, 0);
  } finally { r.dispose(); }
});

test('dispose releases every geometry and material, and is safe to call twice', () => {
  const disposed = new Set<unknown>();
  const c = makeCharacter();
  const owned = new Set<THREE.BufferGeometry | THREE.Material>();
  c.root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { owned.add(m.geometry); owned.add(m.material as THREE.Material); }
  });
  for (const item of owned) item.addEventListener('dispose', () => disposed.add(item));
  c.dispose();
  c.dispose();
  assert.equal(disposed.size, owned.size, `${owned.size - disposed.size} resources not disposed`);
  assert.equal(c.root.parent, null);
});

test('scene integration: exactly one character, rebuilt cleanly each mount', () => {
  for (let mount = 0; mount < 3; mount++) {
    const world = makeHillsideScene();
    try {
      const found: THREE.Object3D[] = [];
      world.scene.traverse(o => { if (o.name === 'Player character') found.push(o); });
      assert.equal(found.length, 1);
      assert.equal(world.mannequin, world.character.root);
      assert.ok(world.character.root.getObjectByName('Hunting rifle (original)'));
    } finally { world.dispose(); }
  }
});

test('preview wiring: pose each frame, fire triggers recoil, reset clears it, no old leg pivots', () => {
  const preview = src('../packages/gameplay/HillsidePreview.tsx');
  assert.match(preview, /world\.character\.pose\(\{ grounded: player\.grounded, gait, walkWeight, vy: player\.vy, pitch,/);
  assert.match(preview, /world\.character\.tick\(dt\)/);
  const fire = preview.slice(preview.indexOf('function fire'), preview.indexOf('function lockChanged'));
  assert.match(fire, /world\.character\.fire\(\)/);
  const reset = preview.slice(preview.indexOf('function reset'), preview.indexOf('function fire'));
  assert.match(reset, /world\.character\.reset\(\)/);
  assert.doesNotMatch(preview, /legPivots/);
  // Hit detection is untouched: still the camera ray.
  assert.match(fire, /rayHitsTarget\(camera\.position, aim\)/);
});
