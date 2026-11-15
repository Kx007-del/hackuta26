import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * An original stylized bolt-action hunting rifle (not a copy of any game's weapon model).
 * Painted wood and dark steel, iron sights, and a muted green accent inlay.
 *
 * Local space: the barrel points along -Z, +Y is up, the origin is at the pistol grip.
 */
export type Rifle = {
  root: THREE.Group;
  /** Muzzle tip; the flash is attached here. */
  muzzle: THREE.Object3D;
  /** Where the right hand holds the pistol grip (rifle-local). */
  gripPoint: THREE.Vector3;
  /** Where the left hand supports the forend (rifle-local). */
  forendPoint: THREE.Vector3;
  /** Centre of the butt plate, pressed into the shoulder (rifle-local). */
  buttPoint: THREE.Vector3;
  /** Recoil amount 0..1 (1 right after a shot). */
  readonly recoil: number;
  readonly flashVisible: boolean;
  fire(): void;
  /** Advance recoil and flash timers. */
  tick(dt: number): void;
  reset(): void;
  dispose(): void;
};

export const RIFLE_LENGTH = 1.2;
const FLASH_SECONDS = .055;
const RECOIL_SECONDS = .22;

export function makeRifle(): Rifle {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => (geometries.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (materials.push(m), m);
  // Painted-looking: high roughness, little or no metalness, soft colours.
  const wood = mat(new THREE.MeshStandardMaterial({ color: '#8b5a36', roughness: .78 }));
  const woodDark = mat(new THREE.MeshStandardMaterial({ color: '#6c4329', roughness: .8 }));
  const steel = mat(new THREE.MeshStandardMaterial({ color: '#3d454b', roughness: .55, metalness: .25 }));
  const rubber = mat(new THREE.MeshStandardMaterial({ color: '#24282b', roughness: .9 }));
  const accent = mat(new THREE.MeshStandardMaterial({ color: '#5aa84a', roughness: .6, emissive: '#1f4a17', emissiveIntensity: .25 }));

  const root = new THREE.Group();
  root.name = 'Hunting rifle (original)';
  const rounded = (m: THREE.Material, w: number, h: number, d: number, r: number, x: number, y: number, z: number, rx = 0) => {
    const mesh = new THREE.Mesh(geo(new RoundedBoxGeometry(w, h, d, 2, r)), m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    root.add(mesh);
    return mesh;
  };
  const cylinder = (m: THREE.Material, r1: number, r2: number, length: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo(new THREE.CylinderGeometry(r1, r2, length, 12)), m);
    mesh.rotation.x = Math.PI / 2; // align with Z
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };

  // Stock: butt, comb and wrist, with a slight drop toward the butt.
  rounded(wood, .062, .118, .30, .025, 0, -.045, .2, -.07);
  rounded(woodDark, .056, .05, .2, .02, 0, .012, .15, -.05); // comb
  rounded(rubber, .066, .132, .026, .012, 0, -.058, .355, -.07); // butt plate
  rounded(wood, .05, .11, .06, .02, 0, -.075, .025, .38); // pistol grip
  // Receiver, trigger guard and bolt.
  rounded(steel, .056, .062, .23, .014, 0, .004, -.1);
  rounded(steel, .012, .036, .07, .006, 0, -.045, -.06);
  const boltArm = new THREE.Mesh(geo(new THREE.CylinderGeometry(.007, .007, .07, 8)), steel);
  boltArm.rotation.z = Math.PI / 2;
  boltArm.position.set(.05, .012, -.02);
  root.add(boltArm);
  const boltKnob = new THREE.Mesh(geo(new THREE.SphereGeometry(.016, 10, 8)), steel);
  boltKnob.position.set(.085, .002, -.02);
  root.add(boltKnob);
  // Forend and barrel.
  rounded(wood, .058, .068, .38, .022, 0, -.018, -.38);
  cylinder(steel, .0135, .0145, .62, 0, .02, -.52);
  cylinder(rubber, .018, .018, .045, 0, .02, -.835);
  // Iron sights.
  rounded(steel, .03, .02, .016, .004, 0, .048, -.2);
  rounded(steel, .008, .03, .012, .003, 0, .048, -.8);
  // Muted green accent: inlays on both stock sides and a band on the forend.
  for (const side of [-1, 1]) rounded(accent, .004, .016, .17, .002, side * .032, -.03, .2, -.07);
  cylinder(accent, .036, .036, .02, 0, -.018, -.52);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, .02, -.86);
  root.add(muzzle);

  // Restrained muzzle flash: a short additive cone and core, no light, no texture.
  const flashMaterial = mat(new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const flash = new THREE.Group();
  flash.name = 'Muzzle flash';
  const cone = new THREE.Mesh(geo(new THREE.ConeGeometry(.045, .17, 8, 1, true)), flashMaterial);
  cone.rotation.x = -Math.PI / 2; // point along -Z
  cone.position.z = -.085;
  flash.add(cone);
  const core = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(.035, 0)), flashMaterial);
  flash.add(core);
  flash.visible = false;
  muzzle.add(flash);

  let recoil = 0, flashLeft = 0;
  return {
    root, muzzle,
    gripPoint: new THREE.Vector3(0, -.075, .03),
    forendPoint: new THREE.Vector3(0, -.05, -.23),
    buttPoint: new THREE.Vector3(0, -.05, .36),
    get recoil() { return recoil; },
    get flashVisible() { return flash.visible; },
    fire() {
      recoil = 1;
      flashLeft = FLASH_SECONDS;
      flash.visible = true;
      flash.rotation.z = Math.random() * Math.PI;
      flash.scale.setScalar(.85 + Math.random() * .3);
    },
    tick(dt: number) {
      recoil = Math.max(0, recoil - dt / RECOIL_SECONDS);
      if (flashLeft > 0) {
        flashLeft -= dt;
        if (flashLeft <= 0) flash.visible = false;
      }
    },
    reset() {
      recoil = 0;
      flashLeft = 0;
      flash.visible = false;
    },
    dispose() {
      for (const g of geometries.splice(0)) g.dispose();
      for (const m of materials.splice(0)) m.dispose();
      root.removeFromParent();
    },
  };
}
