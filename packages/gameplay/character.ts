import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRifle, type Rifle } from './rifle';

/**
 * An original stylized character: white streetwear and a round helmet
 * with a glowing visor (no face). Not a copy of any game or real person's look; no game meshes or
 * textures are used.
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
  const visor = mat(new THREE.MeshStandardMaterial({ color: '#13262d', roughness: .32, emissive: '#0c4d58', emissiveIntensity: .35 }));

  const root = new THREE.Group();
  root.name = 'Player character';
  const add = (parent: THREE.Object3D, mesh: THREE.Mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const rbox = (m: THREE.Material, w: number, h: number, d: number, r: number) => new THREE.Mesh(geo(new RoundedBoxGeometry(w, h, d, 2, r)), m);
  function tailored(m: THREE.Material, profile: [number, number][], depth: number, segments = 20) {
    const geometry = geo(new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments));
    geometry.scale(1, 1, depth);
    return new THREE.Mesh(geometry, m);
  }

  // ---- Hips and legs -------------------------------------------------------
  const hips = new THREE.Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);
  add(hips, rbox(suitShade, .39, .22, .29, .08), 0, 0, 0);
  add(hips, rbox(suit, .4, .09, .29, .033), 0, .085, 0);
  add(hips, rbox(charcoal, .13, .15, .051, .021), .155, -.022, -.132);
  const thighs: THREE.Group[] = [], knees: THREE.Group[] = [], ankles: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * .1, -.03, 0);
    hips.add(thigh);
    add(thigh, tailored(suit, [[0,-.47],[.073,-.46],[.092,-.36],[.111,-.21],[.111,-.055],[.084,.035],[0,.053]], .89));
    add(thigh, rbox(suitShade, .086, .12, .031, .014), side * .067,-.169,-.078);
    const knee = new THREE.Group();
    knee.position.y = -.45;
    thigh.add(knee);
    add(knee, tailored(suit, [[0,-.411],[.058,-.407],[.063,-.315],[.079,-.187],[.092,-.047],[.077,.038],[0,.063]], .86));
    add(knee, rbox(suitShade, .12, .096, .032, .017), 0,-.027,-.073);
    add(knee, rbox(suitShade, .134, .07, .125, .021), 0,-.36,0);
    const ankle = new THREE.Group();
    ankle.position.y = -.405;
    knee.add(ankle);
    add(ankle, rbox(suit, .152, .132, .265, .049), 0, .008, -.055).name = 'Boot';
    add(ankle, rbox(charcoal, .159, .024, .272, .011), 0,-.053,-.055);
    for(const z of [-.08,-.114,-.144]) add(ankle,rbox(suitShade,.082,.008,.014,.003),0,.065,z);
    thighs.push(thigh);
    knees.push(knee);
    ankles.push(ankle);
  }

  // ---- Torso and helmet ---------------------------------------------
  const chest = new THREE.Group();
  chest.position.set(0, 1.27, 0);
  chest.rotation.y = STANCE_YAW;
  root.add(chest);
  add(chest, tailored(suit, [[0,-.259],[.174,-.255],[.185,-.225],[.18,-.115],[.221,.008],[.246,.117],[.221,.192],[.132,.23],[.082,.245],[0,.245]], .69));
  add(chest, rbox(suitShade, .38,.063,.264,.027),0,-.226,0);
  add(chest, rbox(suitShade, .239,.257,.085,.04),0,.027,.122);
  add(chest, rbox(charcoal,.012,.333,.015,.006),0,.015,-.156);
  add(chest, rbox(suitShade,.235,.092,.072,.027),0,-.132,-.115);
  for (const side of [-1, 1]) {
    const strap = add(chest, rbox(suitShade, .018, .19, .013, .006), side * .045, .131, -.151);
    strap.rotation.z = side * .11;
    add(chest, rbox(suit,.173,.177,.191,.077),side*.222,.129,0);
  }
  const head = new THREE.Group();
  head.position.set(0, .3, 0);
  chest.add(head);
  add(head,rbox(suitShade,.196,.09,.178,.037),0,-.005,0);
  const helmet = new THREE.Group();
  helmet.position.y = .19;
  head.add(helmet);
  const dome = add(helmet, new THREE.Mesh(geo(new THREE.SphereGeometry(.165, 24, 16)), suit));
  dome.name = 'Helmet shell';
  dome.scale.set(1, 1.1, 1.04);
  // The visor band clears the shell's largest scaled radius so it never clips into the dome.
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
    upper: add(root, tailored(suit, [[0,-.194],[.064,-.19],[.081,-.132],[.077,-.041],[.064,.121],[.06,.178],[0,.193]],.97)),
    fore: add(root, tailored(suit, [[0,-.176],[.061,-.175],[.066,-.095],[.057,.04],[.043,.131],[.041,.157],[0,.16]],.98)),
    elbow: add(root, rbox(suitShade,.123,.126,.119,.056)),
    cuff: add(root,rbox(suitShade,.095,.05,.092,.021)),
    hand: add(root, rbox(charcoal, .073, .089, .092, .029)),
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
  let wasGrounded = true, landingBend = 0;
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
      parts.cuff.position.copy(wrist).lerp(elbow,.065);
      parts.cuff.quaternion.copy(parts.fore.quaternion);
      parts.hand.position.copy(wrist).lerp(palm, .5);
      parts.hand.quaternion.setFromUnitVectors(UP, dir.copy(palm).sub(wrist).normalize());
    }
  }

  function pose(state: CharacterPose) {
    const w = state.grounded ? state.walkWeight : 0;
    if (state.grounded && !wasGrounded) landingBend = 1;
    wasGrounded = state.grounded;
    const breathe = Math.sin(state.time * 2.1) * .004 * (1 - w);
    hips.position.y = HIP_HEIGHT;
    if (state.grounded) {
      thighs.forEach((thigh, i) => {
        const phase = state.gait + i * Math.PI;
        thigh.rotation.x = Math.sin(phase) * .59 * w + .11 * landingBend;
        knees[i].rotation.x = -(Math.max(0, Math.sin(phase - .65)) ** 1.5 * .86 * w + .05 + .21 * landingBend);
      });
    } else {
      const tuck = THREE.MathUtils.lerp(.57,1,THREE.MathUtils.smoothstep(state.vy,-6,4));
      thighs[0].rotation.x = .75 * tuck; knees[0].rotation.x = -1.19 * tuck;
      thighs[1].rotation.x = .46 * tuck; knees[1].rotation.x = -1.09 * tuck;
    }
    let lowestSole = Infinity;
    ankles.forEach((ankle,i)=>{
      const thigh = thighs[i].rotation.x, shin = thigh + knees[i].rotation.x;
      ankle.rotation.x = -shin;
      const sole = hips.position.y + thighs[i].position.y + knees[i].position.y*Math.cos(thigh) + ankle.position.y*Math.cos(shin) - .065;
      lowestSole = Math.min(lowestSole,sole);
    });
    if (state.grounded) hips.position.y -= lowestSole;
    chest.position.y = 1.27 + breathe + (hips.position.y - HIP_HEIGHT);
    chest.rotation.x = -.095 * w - .045 * (state.grounded ? landingBend : 1);
    const aimPitch = THREE.MathUtils.clamp(state.pitch, -.6, .55);
    const kick = rifle.recoil * rifle.recoil;
    aim.position.copy(AIM_PIVOT).setY(AIM_PIVOT.y + (chest.position.y - 1.27)).add(tmp.set(0, 0, .055 * kick));
    aim.rotation.x = aimPitch + .07 * kick;
    head.rotation.x = aimPitch * .5;
    head.rotation.y = -STANCE_YAW * .87;
    solveArms();
  }

  pose({ grounded: true, gait: 0, walkWeight: 0, vy: 0, pitch: 0, time: 0 });

  return {
    root, rifle, joints, pose,
    fire() { rifle.fire(); },
    tick(dt) {
      rifle.tick(dt);
      landingBend = Math.max(0,landingBend - dt/.19);
    },
    reset() {
      rifle.reset();
      landingBend = 0;
      wasGrounded = true;
    },
    dispose() {
      rifle.dispose();
      for (const g of geometries.splice(0)) g.dispose();
      for (const m of materials.splice(0)) m.dispose();
      root.removeFromParent();
    },
  };
}
