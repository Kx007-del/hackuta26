import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRifle, type Rifle } from './rifle';

/**
 * An original stylized player character for the hillside showcase: a rounded white helmet with a
 * dark visor band, an off-white suit with charcoal detailing and a purple back pack. It is not a
 * copy of any game or real-world character.
 *
 * Root space: feet at the origin, facing -Z, +Y up. The rifle is held in both hands; the arms are
 * solved each frame (two-bone IK) so the hands stay on the grip and forend at every aim angle.
 */
export type CharacterPose = {
  grounded: boolean;
  /** Walk cycle phase (radians) and how much of the walk pose to apply (0..1). */
  gait: number;
  walkWeight: number;
  /** Vertical speed (m/s); rising vs falling changes the air pose. */
  vy: number;
  /** Camera pitch (radians, + looks up). The rifle and head follow it. */
  pitch: number;
  /** Seconds, for the idle breathing cycle. */
  time: number;
};

export type Character = {
  root: THREE.Group;
  rifle: Rifle;
  pose(state: CharacterPose): void;
  fire(): void;
  tick(dt: number): void;
  reset(): void;
  /** Debug/test access to solved joints in root space. */
  readonly joints: {
    rightShoulder: THREE.Vector3; rightElbow: THREE.Vector3; rightWrist: THREE.Vector3;
    leftShoulder: THREE.Vector3; leftElbow: THREE.Vector3; leftWrist: THREE.Vector3;
    rightTarget: THREE.Vector3; leftTarget: THREE.Vector3;
  };
  dispose(): void;
};

export const UPPER_ARM = .33;
export const FOREARM = .31;
/** Hand length from wrist to palm centre. */
const HAND = .07;
const HIP_HEIGHT = .95;
/** Torso yaw: a bladed rifle stance with the left shoulder forward. */
const STANCE_YAW = -.6;
const AIM_PIVOT = new THREE.Vector3(.05, 1.4, 0);

export function makeCharacter(): Character {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => (geometries.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (materials.push(m), m);
  // Painted-looking materials: soft, rough, no metal.
  const suit = mat(new THREE.MeshStandardMaterial({ color: '#eceef0', roughness: .82 }));
  const suitShade = mat(new THREE.MeshStandardMaterial({ color: '#d3d8dd', roughness: .85 }));
  const charcoal = mat(new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: .78 }));
  const pack = mat(new THREE.MeshStandardMaterial({ color: '#a24bd0', roughness: .74 }));
  const packDark = mat(new THREE.MeshStandardMaterial({ color: '#6a2b8f', roughness: .8 }));
  const visor = mat(new THREE.MeshStandardMaterial({ color: '#13262d', roughness: .32, emissive: '#0c4d58', emissiveIntensity: .35 }));

  const root = new THREE.Group();
  root.name = 'Player character';
  const add = (parent: THREE.Object3D, mesh: THREE.Mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const rbox = (m: THREE.Material, w: number, h: number, d: number, r: number) => new THREE.Mesh(geo(new RoundedBoxGeometry(w, h, d, 2, r)), m);
  const capsule = (m: THREE.Material, r: number, length: number) => new THREE.Mesh(geo(new THREE.CapsuleGeometry(r, length, 4, 10)), m);

  // ---- Hips and legs -------------------------------------------------------
  const hips = new THREE.Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);
  add(hips, rbox(suitShade, .36, .2, .25, .07), 0, 0, 0);
  add(hips, rbox(charcoal, .38, .06, .27, .025), 0, .07, 0); // belt
  const thighs: THREE.Group[] = [], knees: THREE.Group[] = [], ankles: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * .1, -.03, 0);
    hips.add(thigh);
    add(thigh, capsule(suit, .085, .29), 0, -.215, 0);
    const knee = new THREE.Group();
    knee.position.y = -.45;
    thigh.add(knee);
    add(knee, rbox(charcoal, .14, .09, .05, .02), 0, 0, -.075); // knee pad
    add(knee, capsule(suit, .074, .28), 0, -.205, 0);
    const ankle = new THREE.Group();
    ankle.position.y = -.405;
    knee.add(ankle);
    add(ankle, rbox(charcoal, .13, .115, .26, .045), 0, 0, -.04).name = 'Boot';
    thighs.push(thigh);
    knees.push(knee);
    ankles.push(ankle);
  }

  // ---- Torso, pack and helmet ---------------------------------------------
  const chest = new THREE.Group();
  chest.position.set(0, 1.27, 0);
  chest.rotation.y = STANCE_YAW;
  root.add(chest);
  add(chest, rbox(suit, .46, .44, .27, .11), 0, .02, 0);
  add(chest, rbox(charcoal, .48, .05, .29, .02), 0, -.17, 0); // lower trim
  for (const side of [-1, 1]) {
    const strap = add(chest, rbox(charcoal, .05, .46, .02, .01), side * .1, .03, -.138);
    strap.rotation.z = side * .14;
    add(chest, new THREE.Mesh(geo(new THREE.SphereGeometry(.085, 12, 10)), suitShade), side * .25, .15, 0); // shoulder caps
  }
  const packGroup = new THREE.Group();
  packGroup.rotation.y = -STANCE_YAW * .55; // sits square on the back from the camera's view
  chest.add(packGroup);
  add(packGroup, rbox(pack, .32, .35, .14, .05), 0, .02, .2);
  add(packGroup, rbox(packDark, .26, .1, .04, .015), 0, -.05, .28);
  const roll = add(packGroup, new THREE.Mesh(geo(new THREE.CylinderGeometry(.06, .06, .3, 12)), packDark), 0, .23, .2);
  roll.rotation.z = Math.PI / 2;

  const head = new THREE.Group();
  head.position.set(0, .3, 0);
  chest.add(head);
  add(head, capsule(charcoal, .07, .05), 0, .02, 0); // neck
  const helmet = new THREE.Group();
  helmet.position.y = .19;
  head.add(helmet);
  const dome = add(helmet, new THREE.Mesh(geo(new THREE.SphereGeometry(.165, 20, 14)), suit));
  dome.name = 'Helmet shell';
  dome.scale.set(1, 1.1, 1.04);
  // Clear the shell's largest scaled radius, including between the visor's
  // polygon vertices. A tapered lower rim previously intersected the helmet.
  const visorRadius = .165 * 1.04 + .004;
  add(helmet, new THREE.Mesh(geo(new THREE.CylinderGeometry(visorRadius, visorRadius, .085, 32, 1, true, Math.PI - 1.15, 2.3)), visor), 0, -.005, 0).name = 'Helmet visor';
  for (const side of [-1, 1]) {
    const ear = add(helmet, new THREE.Mesh(geo(new THREE.CylinderGeometry(.055, .055, .04, 14)), charcoal), side * .165, 0, 0);
    ear.rotation.z = Math.PI / 2;
  }
  add(helmet, rbox(charcoal, .03, .1, .03, .01), -.12, .17, .03); // small antenna

  // ---- Rifle on an aim pivot that follows the camera pitch -------------------
  const rifle = makeRifle();
  const aim = new THREE.Group();
  aim.position.copy(AIM_PIVOT);
  root.add(aim);
  rifle.root.position.set(.12, 0, -.42);
  aim.add(rifle.root);

  // ---- Arms: meshes re-placed each frame from IK ----------------------------
  const shoulderLocal = [new THREE.Vector3(.25, .15, 0), new THREE.Vector3(-.25, .15, 0)];
  const arm = () => ({
    upper: add(root, capsule(suit, .062, UPPER_ARM - .1)),
    fore: add(root, capsule(suitShade, .055, FOREARM - .1)),
    elbow: add(root, new THREE.Mesh(geo(new THREE.SphereGeometry(.06, 10, 8)), charcoal)),
    hand: add(root, rbox(charcoal, .07, .09, .1, .03)),
  });
  const arms = [arm(), arm()];
  const joints = {
    rightShoulder: new THREE.Vector3(), rightElbow: new THREE.Vector3(), rightWrist: new THREE.Vector3(),
    leftShoulder: new THREE.Vector3(), leftElbow: new THREE.Vector3(), leftWrist: new THREE.Vector3(),
    rightTarget: new THREE.Vector3(), leftTarget: new THREE.Vector3(),
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), pole = new THREE.Vector3(), palm = new THREE.Vector3();

  function place(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    mesh.position.copy(a).lerp(b, .5);
    mesh.quaternion.setFromUnitVectors(UP, tmp.copy(b).sub(a).normalize());
  }

  /** Two-bone IK: elbow bends toward `poleDir`; the wrist lands on `target` unless out of reach. */
  function solve(shoulder: THREE.Vector3, target: THREE.Vector3, poleDir: THREE.Vector3, elbowOut: THREE.Vector3, wristOut: THREE.Vector3) {
    dir.copy(target).sub(shoulder);
    const distance = THREE.MathUtils.clamp(dir.length(), Math.abs(UPPER_ARM - FOREARM) + 1e-3, UPPER_ARM + FOREARM - 1e-3);
    dir.normalize();
    const cosA = (UPPER_ARM ** 2 + distance ** 2 - FOREARM ** 2) / (2 * UPPER_ARM * distance);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    pole.copy(poleDir).addScaledVector(dir, -poleDir.dot(dir)).normalize();
    elbowOut.copy(shoulder).addScaledVector(dir, UPPER_ARM * cosA).addScaledVector(pole, UPPER_ARM * sinA);
    wristOut.copy(shoulder).addScaledVector(dir, distance);
  }

  const rightPole = new THREE.Vector3(.6, -1, .25), leftPole = new THREE.Vector3(-.55, -1, -.1);
  const toRoot = new THREE.Matrix4();
  function solveArms() {
    root.updateMatrixWorld(true);
    toRoot.copy(root.matrixWorld).invert();
    const handTargets = [rifle.gripPoint, rifle.forendPoint];
    const out = [
      [joints.rightShoulder, joints.rightElbow, joints.rightWrist, joints.rightTarget, rightPole],
      [joints.leftShoulder, joints.leftElbow, joints.leftWrist, joints.leftTarget, leftPole],
    ] as const;
    for (let i = 0; i < 2; i++) {
      const [shoulder, elbow, wrist, target, poleDir] = out[i];
      shoulder.copy(shoulderLocal[i]).applyMatrix4(chest.matrixWorld).applyMatrix4(toRoot);
      palm.copy(handTargets[i]).applyMatrix4(rifle.root.matrixWorld).applyMatrix4(toRoot);
      // Aim the wrist a hand-length back from the palm toward the shoulder.
      target.copy(palm).addScaledVector(dir.copy(shoulder).sub(palm).normalize(), HAND * .5);
      solve(shoulder, target, poleDir, elbow, wrist);
      const parts = arms[i];
      place(parts.upper, shoulder, elbow);
      place(parts.fore, elbow, wrist);
      parts.elbow.position.copy(elbow);
      parts.hand.position.copy(wrist).lerp(palm, .5);
      parts.hand.quaternion.setFromUnitVectors(UP, dir.copy(palm).sub(wrist).normalize());
    }
  }

  function pose(state: CharacterPose) {
    const w = state.grounded ? state.walkWeight : 0;
    const breathe = Math.sin(state.time * 2.1) * .006 * (1 - w);
    hips.position.y = HIP_HEIGHT + (state.grounded ? -Math.abs(Math.sin(state.gait)) * .035 * w : 0);
    chest.position.y = 1.27 + breathe + (hips.position.y - HIP_HEIGHT);
    chest.rotation.x = -.12 * w + (state.grounded ? 0 : -.06);
    if (state.grounded) {
      thighs.forEach((thigh, i) => {
        const phase = state.gait + i * Math.PI;
        thigh.rotation.x = Math.sin(phase) * .7 * w;
        knees[i].rotation.x = -(Math.max(0, Math.sin(phase - .9)) * 1.05 * w + .06);
      });
    } else {
      const rising = state.vy > 0 ? 1 : .6;
      thighs[0].rotation.x = .8 * rising; knees[0].rotation.x = -1.3 * rising;
      thighs[1].rotation.x = .5 * rising; knees[1].rotation.x = -1.25 * rising;
    }
    // Keep the soles close to level whatever the hip and knee are doing.
    ankles.forEach((ankle, i) => { ankle.rotation.x = -(thighs[i].rotation.x + knees[i].rotation.x) * .85; });
    const aimPitch = THREE.MathUtils.clamp(state.pitch, -.6, .55);
    const kick = rifle.recoil * rifle.recoil;
    aim.position.copy(AIM_PIVOT).setY(AIM_PIVOT.y + (chest.position.y - 1.27)).add(tmp.set(0, 0, .055 * kick));
    aim.rotation.x = aimPitch + .07 * kick;
    head.rotation.x = aimPitch * .5;
    head.rotation.y = -STANCE_YAW * .7; // look down the barrel, not along the bladed torso
    solveArms();
  }

  pose({ grounded: true, gait: 0, walkWeight: 0, vy: 0, pitch: 0, time: 0 });

  return {
    root, rifle, joints, pose,
    fire() { rifle.fire(); },
    tick(dt) { rifle.tick(dt); },
    reset() { rifle.reset(); },
    dispose() {
      rifle.dispose();
      for (const g of geometries.splice(0)) g.dispose();
      for (const m of materials.splice(0)) m.dispose();
      root.removeFromParent();
    },
  };
}
