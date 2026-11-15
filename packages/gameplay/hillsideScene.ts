import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const RAMP_HEADING = THREE.MathUtils.degToRad(265);
export const RIDGE_HEADING = THREE.MathUtils.degToRad(200);
export const RIDGE_DISTANCE = 61;
const TILE = 5;
const RAMP_START = -3.7;
const RAMP_RUN = 10.5;
const LANDING_START = RAMP_START + RAMP_RUN;
const LANDING_END = LANDING_START + TILE;
/** The build descends: a high spawn platform, a downhill ramp, then the landing with the cone. */
const RAMP_TOP = 6.4;
const LANDING = 2.6;
const PLATFORM_START = RAMP_START - TILE;
/** Spawn on the top platform, facing down the ramp. */
const SPAWN_V = RAMP_START - 1.2;
const CONE_HEIGHT = 1.84;
const CONE_HALF = 2.3;
const CONE_CENTER = LANDING_START + TILE / 2;
const WALK_LIMIT = 72;
const PLAYER_RADIUS = .24;
const STEP_UP = .28;
const CAMERA_RADIUS = .16;
const HUT_YAW = -RAMP_HEADING + .13;
const HUT_SCALE = .76;
const HUT_HALF_WIDTH = 2.73 * HUT_SCALE;
const HUT_HALF_DEPTH = 2.45 * HUT_SCALE;
const rampForward = new THREE.Vector2(Math.sin(RAMP_HEADING), -Math.cos(RAMP_HEADING));
const rampRight = new THREE.Vector2(Math.cos(RAMP_HEADING), Math.sin(RAMP_HEADING));
const ridgeForward = new THREE.Vector2(Math.sin(RIDGE_HEADING), -Math.cos(RIDGE_HEADING));
const ridgeRight = new THREE.Vector2(Math.cos(RIDGE_HEADING), Math.sin(RIDGE_HEADING));
const hutPosition = rampForward.clone().multiplyScalar(19).addScaledVector(rampRight, 13.2);

/** The ridge crest sits just beyond the target so the dummy stands on the slope facing the shooting spot. */
const HILL_ALONG = (rampForward.x * CONE_CENTER * ridgeForward.x + rampForward.y * CONE_CENTER * ridgeForward.y) + RIDGE_DISTANCE + 5;

function bell(value: number, width: number) {
  return Math.exp(-((value / width) ** 2));
}

export function terrainHeight(x: number, z: number) {
  const along = x * ridgeForward.x + z * ridgeForward.y;
  const across = x * ridgeRight.x + z * ridgeRight.y;
  const hill = 14.1 * bell(along - HILL_ALONG, 26) * bell(across + 4, 52);
  const shoulder = 9.6 * bell(along - 40, 34) * bell(across - 33, 21);
  const leftBank = 7.8 * bell(along - 48, 28) * bell(across + 36, 24);
  const west = x * rampForward.x + z * rampForward.y;
  const lateral = x * rampRight.x + z * rampRight.y;
  const westRise = 6 * bell(west - 42, 12) * bell(lateral + .5, 26);
  const undulations = Math.sin(x * .14 + z * .09) * .46 + Math.sin(z * .22 - x * .082) * .25;
  const approach = 1.12 * bell(x - rampForward.x * RAMP_START, 4) * bell(z - rampForward.y * RAMP_START, 3.3);
  const raw = hill + shoulder + leftBank + westRise + undulations + approach - .73;
  return raw;
}

function deckHeight(x: number, z: number, padding = 0) {
  const u = x * rampRight.x + z * rampRight.y;
  const v = x * rampForward.x + z * rampForward.y;
  if (Math.abs(u) > TILE / 2 + padding || v < PLATFORM_START - padding || v > LANDING_END + padding) return undefined;
  if (v < RAMP_START) return RAMP_TOP;
  if (v < LANDING_START) return THREE.MathUtils.lerp(RAMP_TOP, LANDING, (v - RAMP_START) / RAMP_RUN);
  const fromApex = Math.max(Math.abs(u), Math.abs(v - CONE_CENTER));
  if (fromApex > CONE_HALF) return LANDING;
  return LANDING + CONE_HEIGHT * (1 - fromApex / CONE_HALF);
}

function overlapsHut(x: number, z: number, padding: number) {
  const dx = x - hutPosition.x, dz = z - hutPosition.y;
  const cos = Math.cos(HUT_YAW), sin = Math.sin(HUT_YAW);
  return Math.abs(cos * dx - sin * dz) < HUT_HALF_WIDTH + padding &&
    Math.abs(sin * dx + cos * dz) < HUT_HALF_DEPTH + padding;
}

export const SPAWN_POINT = { x: rampForward.x * SPAWN_V, z: rampForward.y * SPAWN_V };
export const spawnHeight = RAMP_TOP;

/** Where the clip's shot is fired from: on the landing, at the cone. The target is 61 m from here. */
export const SHOT_SPOT = { x: rampForward.x * CONE_CENTER, z: rampForward.y * CONE_CENTER };

/** True when a player at (x, y, z) is standing on the wooden build (platform, ramp, landing or cone). */
export function standingOnBuild(x: number, z: number, y: number) {
  const deck = deckHeight(x, z, PLAYER_RADIUS);
  return deck !== undefined && deck > terrainHeight(x, z) && Math.abs(y - deck) <= STEP_UP + .05;
}

/** The build is solid from the side and underneath; only its top surface can be walked on. */
export function walkHeight(x: number, z: number, previousHeight: number) {
  if (!withinWalkArea(x, z) || overlapsHut(x, z, PLAYER_RADIUS)) return undefined;
  const deck = deckHeight(x, z, PLAYER_RADIUS);
  const ground = terrainHeight(x, z);
  if (deck === undefined || ground >= deck) return ground;
  return deck <= previousHeight + STEP_UP ? deck : undefined;
}

const hutTop = terrainHeight(hutPosition.x, hutPosition.y) + 4.6 * HUT_SCALE;

/** Sweep the camera boom with clearance for the near plane. */
export function clipShoulderCamera(pivot: THREE.Vector3, offset: THREE.Vector3, result: THREE.Vector3) {
  const steps = Math.max(1, Math.ceil(offset.length() / .055));
  result.copy(pivot);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = pivot.x + offset.x * t, y = pivot.y + offset.y * t, z = pivot.z + offset.z * t;
    if (y <= hutTop + CAMERA_RADIUS && overlapsHut(x, z, CAMERA_RADIUS)) break;
    const deck = deckHeight(x, z, CAMERA_RADIUS);
    if (deck !== undefined && y <= deck + CAMERA_RADIUS) break;
    const ground = Math.max(terrainHeight(x, z),
      terrainHeight(x + CAMERA_RADIUS, z), terrainHeight(x - CAMERA_RADIUS, z),
      terrainHeight(x, z + CAMERA_RADIUS), terrainHeight(x, z - CAMERA_RADIUS));
    if (y <= ground + CAMERA_RADIUS) break;
    result.set(x, y, z);
  }
  return result;
}

// ---- Player physics: run, jump, gravity, slope limits ----------------------
// Tuned by eye against the reference: a quick run, a short hop, and a fall
// that visibly accelerates down the hillside.
export const RUN_SPEED = 6.2;
export const GRAVITY = 15;
export const JUMP_SPEED = 7;
const GROUND_ACCEL = 16;
const AIR_ACCEL = 2.5;
/** Steepest terrain a grounded player can walk up (rise over run, about 40°). */
export const MAX_CLIMB_SLOPE = .85;
const SNAP_DOWN = .45;
const MAX_FALL_SPEED = 45;

export type PlayerState = { x: number; z: number; y: number; vx: number; vz: number; vy: number; grounded: boolean };
export type PlayerInput = { forward: number; right: number; heading: number; jump: boolean };

type Support = { height: number; deck: boolean };

/** The surface a player at height y can stand on at (x, z), or undefined when the spot is solid. */
function supportAt(x: number, z: number, y: number): Support | undefined {
  if (!withinWalkArea(x, z) || overlapsHut(x, z, PLAYER_RADIUS)) return undefined;
  const ground = terrainHeight(x, z);
  const deck = deckHeight(x, z, PLAYER_RADIUS);
  if (deck !== undefined && deck > ground) {
    // The build is solid from the side and underneath; it only supports from above.
    return y >= deck - STEP_UP ? { height: deck, deck: true } : undefined;
  }
  return { height: ground, deck: false };
}

export function spawnPlayer(x = SPAWN_POINT.x, z = SPAWN_POINT.z): PlayerState {
  const y = supportAt(x, z, spawnHeight)?.height ?? spawnHeight;
  return { x, z, y, vx: 0, vz: 0, vy: 0, grounded: true };
}

/** Advance the player by dt seconds. Pure: returns a new state. */
export function stepPlayer(state: PlayerState, input: PlayerInput, dt: number): PlayerState {
  const p = { ...state };
  const length = Math.hypot(input.forward, input.right);
  let wishX = 0, wishZ = 0;
  if (length) {
    const sin = Math.sin(input.heading), cos = Math.cos(input.heading);
    wishX = (sin * input.forward + cos * input.right) / length;
    wishZ = (-cos * input.forward + sin * input.right) / length;
  }
  // In the air, steering never slows you below the speed you launched with.
  let speed = p.grounded ? RUN_SPEED : Math.max(RUN_SPEED, Math.hypot(p.vx, p.vz));
  if (p.grounded && length) {
    // Downhill carries you faster, uphill slows you down.
    const probe = .6;
    const here = supportAt(p.x, p.z, p.y)?.height ?? p.y;
    const ahead = supportAt(p.x + wishX * probe, p.z + wishZ * probe, p.y + STEP_UP)?.height ?? here;
    const grade = (ahead - here) / probe;
    // Downhill builds speed (the ramp runs you up to about 1.4x), uphill drags.
    speed *= THREE.MathUtils.clamp(1 - grade * (grade < 0 ? 1.1 : .45), .6, 1.6);
  }
  // Grounded: snappy acceleration and braking. Airborne: keep momentum and only steer while a key is held.
  const jumping = input.jump && p.grounded;
  if ((p.grounded && !jumping) || length) {
    // Carried speed bleeds off slowly so a run down the ramp keeps its momentum.
    const carrying = p.grounded && length > 0 && Math.hypot(p.vx, p.vz) > speed + .1;
    const blend = Math.min(1, (carrying ? 2.2 : p.grounded && !jumping ? GROUND_ACCEL : AIR_ACCEL) * dt);
    p.vx += (wishX * speed - p.vx) * blend;
    p.vz += (wishZ * speed - p.vz) * blend;
  }
  if (jumping) {
    p.vy = JUMP_SPEED;
    p.grounded = false;
  }

  const tryMove = (nx: number, nz: number) => {
    const support = supportAt(nx, nz, p.y);
    if (!support) return false;
    const rise = support.height - p.y;
    if (p.grounded) {
      if (support.deck ? rise > STEP_UP : rise > Math.max(.02, Math.hypot(nx - p.x, nz - p.z) * MAX_CLIMB_SLOPE)) return false;
    } else if (rise > STEP_UP) {
      return false;
    }
    p.x = nx;
    p.z = nz;
    return true;
  };
  const dx = p.vx * dt, dz = p.vz * dt;
  if ((dx || dz) && !tryMove(p.x + dx, p.z + dz)) {
    if (dx && tryMove(p.x + dx, p.z)) p.vz = 0;
    else if (dz && tryMove(p.x, p.z + dz)) p.vx = 0;
    else p.vx = p.vz = 0;
  }

  const floor = supportAt(p.x, p.z, p.y)?.height ?? p.y;
  if (p.grounded) {
    if (floor < p.y - SNAP_DOWN) {
      p.grounded = false;
      p.vy = 0;
    } else {
      p.y = floor;
    }
  }
  if (!p.grounded) {
    p.vy = Math.max(p.vy - GRAVITY * dt, -MAX_FALL_SPEED);
    p.y += p.vy * dt;
    if (p.y <= floor && p.vy <= 0) {
      p.y = floor;
      p.vy = 0;
      p.grounded = true;
    }
  }
  return p;
}

// ---- Target -----------------------------------------------------------------
export const TARGET_HEIGHT = 1.9;
export const TARGET_RADIUS = .42;
export const targetBase = (() => {
  // 61 m horizontally from the shooting spot on the landing, at the reference bearing (~200°).
  const x = SHOT_SPOT.x + ridgeForward.x * RIDGE_DISTANCE, z = SHOT_SPOT.z + ridgeForward.y * RIDGE_DISTANCE;
  return new THREE.Vector3(x, terrainHeight(x, z), z);
})();

// The ground mesh is a 250 m plane with 170×170 segments whose vertices sit on terrainHeight.
const GROUND_SIZE = 250;
const GROUND_SEGMENTS = 170;

/**
 * Height of the ground surface as rendered: the same triangles the GPU draws, not the smooth
 * formula. Shots must use this, otherwise a target that is visible over a crest can be "blocked".
 */
export function renderedTerrainHeight(x: number, z: number) {
  const step = GROUND_SIZE / GROUND_SEGMENTS, half = GROUND_SIZE / 2;
  const gx = (x + half) / step, gz = (z + half) / step;
  if (gx < 0 || gz < 0 || gx >= GROUND_SEGMENTS || gz >= GROUND_SEGMENTS) return terrainHeight(x, z);
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const h = (i: number, j: number) => terrainHeight(i * step - half, j * step - half);
  // PlaneGeometry splits each cell along the (ix, iz+1)–(ix+1, iz) diagonal.
  if (fx + fz <= 1) {
    const a = h(ix, iz);
    return a + (h(ix + 1, iz) - a) * fx + (h(ix, iz + 1) - a) * fz;
  }
  const c = h(ix + 1, iz + 1);
  return c + (h(ix, iz + 1) - c) * (1 - fx) + (h(ix + 1, iz) - c) * (1 - fz);
}

/** Solid scenery a shot cannot pass through: terrain (as rendered), the wooden build and the hut. */
function blocksShot(x: number, y: number, z: number) {
  if (y < renderedTerrainHeight(x, z)) return true;
  const deck = deckHeight(x, z);
  if (deck !== undefined && y < deck) return true;
  return y < hutTop && overlapsHut(x, z, 0);
}

/** Hitscan against the standing target (a vertical cylinder). Terrain, the build and the hut block the shot. */
export function rayHitsTarget(origin: THREE.Vector3, direction: THREE.Vector3, base = targetBase) {
  const d = direction.clone().normalize();
  const ox = origin.x - base.x, oz = origin.z - base.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return false;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - TARGET_RADIUS ** 2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  let hitAt: number | undefined;
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < 0) continue;
    const y = origin.y + d.y * t;
    if (y >= base.y && y <= base.y + TARGET_HEIGHT) { hitAt = t; break; }
  }
  if (hitAt === undefined) return false;
  for (let t = .25; t < hitAt - TARGET_RADIUS; t += .25) {
    if (blocksShot(origin.x + d.x * t, origin.y + d.y * t, origin.z + d.z * t)) return false;
  }
  return true;
}

function randomSequence(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function makeWoodGrain() {
  const width = 128, height = 64;
  const random = randomSequence(601);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x * Math.PI * 2 / width, v = y * Math.PI * 2 / height;
    const warp = Math.sin(u * 2 + v) * .45 + Math.sin(u * 5 - v * 2) * .22;
    const bands = Math.sin(v * 11 + warp) + Math.sin(v * 23 + 2 * warp) * .45;
    const shade = Math.min(255, Math.round(232 + bands * 10 + 10 * random()));
    const offset = (y * width + x) * 4;
    pixels.fill(shade, offset, offset + 3);
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function makeHillsideScene() {
  const scene = new THREE.Scene();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const instances: THREE.InstancedMesh[] = [];
  const random = randomSequence(264);
  function geometry<T extends THREE.BufferGeometry>(value: T): T {
    geometries.add(value);
    return value;
  }
  function material<T extends THREE.Material>(value: T): T {
    materials.add(value);
    return value;
  }
  function paint(color: string, roughness = .82, metalness = 0) {
    return material(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }
  const cube = geometry(new THREE.BoxGeometry());
  function box(parent: THREE.Object3D, mat: THREE.Material, size: number[], position: number[]) {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(position[0], position[1], position[2]);
    parent.add(mesh);
    return mesh;
  }

  const sky = material(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vSky;
      void main() {
        vSky = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vSky;
      void main() {
        vec3 ray = normalize(vSky);
        float height = pow(clamp(ray.y, 0.0, 1.0), 0.49);
        vec3 tint = mix(vec3(.035,.43,.63), vec3(.009,.23,.49), height);
        vec3 sun = normalize(vec3(-.65,.47,.50));
        float halo = max(dot(ray, sun), 0.0);
        tint += vec3(.04,.12,.13) * pow(halo, 9.0);
        float bands = sin(ray.x * 17.0 + ray.z * 9.0) * sin(ray.z * 19.0 - ray.x * 8.0);
        float wisps = smoothstep(.24,.84,bands) * smoothstep(.09,.21,ray.y) * (1.0-smoothstep(.26,.49,ray.y));
        tint = mix(tint, vec3(.23,.53,.64), wisps * .26);
        gl_FragColor = vec4(tint, 1.0);
        #include <colorspace_fragment>
      }
    `,
  }));
  scene.add(new THREE.Mesh(geometry(new THREE.SphereGeometry(175, 32, 16)), sky));
  scene.background = new THREE.Color('#1b9ebd');
  scene.fog = new THREE.FogExp2('#174d61', .013);
  scene.add(new THREE.HemisphereLight(0xa8e9ff, 0x244458, 1.9));
  const sun = new THREE.DirectionalLight(0x9adafa, .8);
  sun.position.set(-38, 45, 26);
  scene.add(sun);
  const bounce = new THREE.DirectionalLight(0x58c1ff, .35);
  bounce.position.set(38, 8, -25);
  scene.add(bounce);

  const ground = geometry(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS));
  ground.rotateX(-Math.PI / 2);
  const positions = ground.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const deep = new THREE.Color('#143c34');
  const light = new THREE.Color('#345f45');
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, terrainHeight(x, z));
    const patch = .46 + .19 * Math.sin(x * .27 + z * .13) + .15 * Math.cos(z * .38 - x * .19) + random() * .14;
    tint.copy(deep).lerp(light, patch).toArray(colors, i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ground.computeVertexNormals();
  scene.add(new THREE.Mesh(ground, material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))));

  // The ramp, floor and square pyramid are persistent scenery in both review views.
  const structure = new THREE.Group();
  structure.rotation.y = -RAMP_HEADING;
  scene.add(structure);
  const woodGrain = makeWoodGrain();
  const wood = ['#775e56', '#866a5b', '#937461', '#82685b', '#6f5b52'].map(color => {
    const plank = paint(color);
    plank.map = woodGrain;
    return plank;
  });
  const seam = paint('#6f4831');
  const hardware = paint('#596969', .6, .28);
  const stepAngle = Math.atan2(LANDING - RAMP_TOP, RAMP_RUN);
  const stepCount = 30;
  const slopeLength = Math.hypot(RAMP_RUN, LANDING - RAMP_TOP);
  const plankRun = slopeLength / stepCount;
  for (let i = 0; i < stepCount; i++) {
    const part = (i + .5) / stepCount;
    const y = THREE.MathUtils.lerp(RAMP_TOP, LANDING, part);
    const z = -(RAMP_START + RAMP_RUN * part);
    const plank = box(structure, wood[i % wood.length], [TILE, .12, plankRun - .018], [0, y - .075, z]);
    plank.rotation.x = stepAngle;
    for (const x of [-2.15, 2.15]) box(structure, hardware, [.062, .018, .06], [x, y + .012, z]);
    if (i % 2 === 0) {
      const grain = box(structure, wood[(i + 2) % wood.length], [.55 + random() * 1.9, .009, .018], [(random() - .5) * 2, y + .006, z]);
      grain.rotation.x = stepAngle;
    }
  }
  for (const x of [-2.4, 0, 2.4]) {
    const brace = box(structure, seam, [.15, .2, slopeLength], [x, (LANDING + RAMP_TOP) / 2 - .21, -(LANDING_START + RAMP_START) / 2]);
    brace.rotation.x = stepAngle;
  }
  for (let i = 0; i < 14; i++) {
    box(structure, wood[i % wood.length], [TILE, .15, TILE / 14 - .012], [0, LANDING - .075, -(LANDING_START + (i + .5) * TILE / 14)]);
  }
  for (let i = 0; i < 14; i++) {
    box(structure, wood[(i + 2) % wood.length], [TILE, .15, TILE / 14 - .012], [0, RAMP_TOP - .075, -(PLATFORM_START + (i + .5) * TILE / 14)]);
  }
  for (const x of [-2.3, 2.3]) for (const v of [PLATFORM_START + .22, RAMP_START - .22, RAMP_START + RAMP_RUN / 2, LANDING_START + .22, LANDING_END - .22]) {
    const top = v < RAMP_START ? RAMP_TOP : v < LANDING_START ? THREE.MathUtils.lerp(RAMP_TOP, LANDING, (v - RAMP_START) / RAMP_RUN) : LANDING;
    const at = terrainHeight(rampRight.x * x + rampForward.x * v, rampRight.y * x + rampForward.y * v);
    if (at < top) box(structure, seam, [.25, top - at, .25], [x, (top + at) / 2 - .1, -v]);
  }
  const cone = new THREE.Group();
  cone.name = 'Preplaced wooden cone';
  cone.position.set(0, LANDING, -CONE_CENTER);
  structure.add(cone);
  const corners = [
    new THREE.Vector3(-CONE_HALF, 0, -CONE_HALF), new THREE.Vector3(-CONE_HALF, 0, CONE_HALF),
    new THREE.Vector3(CONE_HALF, 0, CONE_HALF), new THREE.Vector3(CONE_HALF, 0, -CONE_HALF),
  ];
  const apex = new THREE.Vector3(0, CONE_HEIGHT, 0);
  const facePaint = material(new THREE.MeshStandardMaterial({ map: woodGrain, vertexColors: true, roughness: .9 }));
  const faceVertices: number[] = [];
  const faceColors: number[] = [];
  const faceUVs: number[] = [];
  const backing: number[] = [];
  for (let face = 0; face < 4; face++) {
    const a = corners[face];
    const b = corners[(face + 1) % 4];
    backing.push(...a.toArray(), ...b.toArray(), ...apex.toArray());
    for (let row = 0; row < 11; row++) {
      const lo = (row + .024) / 11, hi = Math.min(.9998, (row + .978) / 11);
      const v = [a.clone().lerp(apex, lo), b.clone().lerp(apex, lo), b.clone().lerp(apex, hi), a.clone().lerp(apex, hi)];
      const color = wood[(row + face * 2) % wood.length].color;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        faceVertices.push(v[k].x, v[k].y, v[k].z);
        faceColors.push(color.r, color.g, color.b);
        faceUVs.push(v[k].clone().sub(a).dot(b.clone().sub(a)) / (4 * CONE_HALF ** 2), k < 2 ? 0 : 1);
      }
    }
    const direction = apex.clone().sub(a);
    const beam = box(cone, seam, [.115, direction.length(), .115], a.clone().lerp(apex, .5).toArray());
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }
  const faceGeometry = geometry(new THREE.BufferGeometry());
  faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(faceVertices, 3));
  faceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(faceColors, 3));
  faceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(faceUVs, 2));
  faceGeometry.computeVertexNormals();
  cone.add(new THREE.Mesh(faceGeometry, facePaint));
  const backingGeometry = geometry(new THREE.BufferGeometry());
  backingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(backing, 3));
  backingGeometry.computeVertexNormals();
  const liner = new THREE.Mesh(backingGeometry, seam);
  liner.scale.setScalar(.994);
  liner.position.y = -.009;
  cone.add(liner);
  box(cone, wood[2], [.26, .13, .26], [0, CONE_HEIGHT - .04, 0]);

  function batch(g: THREE.BufferGeometry, m: THREE.Material, transforms: THREE.Matrix4[], colors?: THREE.Color[]) {
    const mesh = new THREE.InstancedMesh(g, m, transforms.length);
    transforms.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
      if (colors) mesh.setColorAt(i, colors[i]);
    });
    mesh.computeBoundingSphere();
    scene.add(mesh);
    instances.push(mesh);
  }
  const dummy = new THREE.Object3D();
  function transform(x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  }

  // Two crossed clusters of tapered grass blades, scattered densely around the approach.
  const blades: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.4;
    const x = Math.sin(angle) * .22, z = Math.cos(angle) * .22;
    const dx = Math.cos(angle) * .14, dz = Math.sin(angle) * .14;
    blades.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x * 2.2, .68 + (i % 3) * .13, z * 2.2);
  }
  const grass = geometry(new THREE.BufferGeometry());
  grass.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  grass.computeVertexNormals();
  const grassTransforms: THREE.Matrix4[] = [];
  const grassColors: THREE.Color[] = [];
  for (let i = 0; i < 6800; i++) {
    const near = i < 2300;
    const x = (random() - .5) * (near ? 41 : 145);
    const z = (random() - (near ? .4 : .35)) * (near ? 35 : 150);
    const y = terrainHeight(x, z);
    if (deckHeight(x,z) !== undefined) continue;
    const h = .17 + random() * .35;
    const yaw = random() * Math.PI * 2;
    grassTransforms.push(transform(x, y - .04, z, .38 + random() * .5, h, .65, yaw));
    grassColors.push(new THREE.Color().lerpColors(deep, light, .16 + random() * .84));
  }
  batch(grass, material(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 })), grassTransforms, grassColors);
  const bloom = geometry(new THREE.IcosahedronGeometry(1, 0));
  const stem = geometry(new THREE.CylinderGeometry(.016, .023, 1, 5));
  const stems: THREE.Matrix4[] = [], petals: THREE.Matrix4[] = [];
  const petalColors: THREE.Color[] = [];
  const flowerPalette = ['#f9d14e', '#ffdea0', '#8889f8', '#587bed', '#c6afff'].map(color => new THREE.Color(color));
  for (const [cx, cz] of [[-2, 4], [2, 2], [-4, 9], [-10, 5], [-5, -4], [-16, 21], [-26, 33], [-1, 9], [-5, 13], [-6, 17]]) {
    for (let i = 0; i < 31; i++) {
      const x = cx + (random() - .5) * 5, z = cz + (random() - .5) * 4;
      if (deckHeight(x,z) !== undefined) continue;
      const y = terrainHeight(x,z), h = .14 + random() * .27;
      stems.push(transform(x, y + h * .5, z, 1, h, 1));
      const color = flowerPalette[Math.floor(random() * flowerPalette.length)];
      for(let k=0;k<4;k++) {
        const angle=k*Math.PI/2;
        petals.push(transform(x+.064*Math.sin(angle), y+h, z+.064*Math.cos(angle), .081,.047,.065,angle));
        petalColors.push(color);
      }
    }
  }
  batch(stem, paint('#537843'), stems);
  batch(bloom, paint('#ffffff'), petals, petalColors);

  const trunk = geometry(new THREE.CylinderGeometry(.48, 1, 1, 9));
  const fir = geometry(new THREE.CylinderGeometry(.08, 1, 1, 10));
  const foliage = geometry(new THREE.IcosahedronGeometry(1, 2));
  const barkTransforms: THREE.Matrix4[] = [], broadleafTransforms: THREE.Matrix4[] = [], firTransforms: THREE.Matrix4[] = [];
  const leaves: THREE.Color[] = [], needles: THREE.Color[] = [];
  const barkPaint = paint('#594535');
  const canopy = ['#286341', '#348553', '#4a9960', '#35805e', '#5a9b57'].map(color => new THREE.Color(color));
  for (const [x,z,h,conifer] of [
    // f33/f45/f59: a left pair and an edge cluster frame a bare aim corridor.
    [13, 65, 9, 0], [16, 67, 14, 1], [-52, 46, 11, 0], [-55, 49, 8, 0], [-34, 23, 9, 0],
    // The west-facing review shows uphill silhouettes above the landing.
    [-32, 0, 12, 0], [-37, -4, 9, 1], [-36, 6, 9, 0], [-28, -16, 9, 1],
    [-45, -12, 10, 0], [-13, -19, 8, 0], [18, 38, 8, 0], [26, 48, 11, 1],
  ]) {
    const base = terrainHeight(x,z);
    barkTransforms.push(transform(x, base + h * .37, z, h*.067, h*.76, h*.067));
    if (conifer) {
      for (let i = 0; i < 4; i++) {
        const width = h * (.28 - i * .045);
        firTransforms.push(transform(x, base + h*(.47+i*.15), z, width, h*.39, width, random()));
        needles.push(canopy[i]);
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4;
        const r = h * (.08 + random() * .13);
        const size = h * (.16 + random() * .12);
        broadleafTransforms.push(transform(x + r*Math.cos(a), base+h*(.64+random()*.23), z+r*Math.sin(a), size, size*.8, size, a));
        leaves.push(canopy[i % canopy.length]);
      }
    }
  }
  batch(trunk, barkPaint, barkTransforms);
  batch(fir, paint('#def3e5'), firTransforms, needles);
  batch(foliage, paint('#f0f7e0'), broadleafTransforms, leaves);

  const hut = new THREE.Group();
  hut.rotation.y = HUT_YAW;
  hut.name = 'Uphill hut';
  hut.position.set(hutPosition.x, terrainHeight(hutPosition.x, hutPosition.y), hutPosition.y);
  hut.scale.setScalar(HUT_SCALE);
  scene.add(hut);
  const siding = ['#3d6464', '#4d7372', '#547e79'].map(color => paint(color));
  const trim = paint('#9fcbb9');
  const roof = paint('#344a59');
  const glass = paint('#e6bb70', .45, .05);
  glass.emissive.set('#b1793f');
  glass.emissiveIntensity = .24;
  box(hut, seam, [5.2, 1.55, 4.5], [0, -.44, 0]);
  box(hut, siding[0], [4.8, 3.25, 4], [0, 1.64, 0]);
  for(let i=0;i<13;i++){
    const y=.18+i*.245, mat=siding[i%3];
    for(const sign of [-1,1]){
      box(hut, mat, [4.82, .226, .055], [0,y,sign*2.025]);
      box(hut, mat, [.055, .226, 4.05], [sign*2.425,y,0]);
    }
  }
  for (const sign of [-1, 1]) {
    const panel = box(hut, roof, [3.04, .19, 4.75], [sign * 1.27, 3.71, 0]);
    panel.rotation.z = -sign * .47;
    const fascia = box(hut, trim, [3.04, .16, .075], [sign * 1.27, 3.67, 2.39]);
    fascia.rotation.z = -sign * .47;
  }
  const gable = new THREE.Shape();
  gable.moveTo(-2.5,3.27);gable.lineTo(0,4.45);gable.lineTo(2.5,3.27);gable.closePath();
  const gableMesh = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(gable, {depth:4,bevelEnabled:false})), siding[1]);
  gableMesh.position.z=-2;
  hut.add(gableMesh);
  box(hut, trim, [1.13, 1.4, .09], [1.43, 1.85, 2.081]);
  box(hut, glass, [.92, 1.16, .08], [1.43, 1.85, 2.14]);
  box(hut, seam, [.048, 1.2, .085], [1.43, 1.85, 2.18]);
  box(hut, seam, [.94, .06, .085], [1.43, 1.85, 2.18]);
  box(hut, trim, [1.36, 2.41, .095], [-.66, 1.22, 2.075]);
  box(hut, roof, [1.07, 2.25, .1], [-.66, 1.18, 2.13]);
  box(hut, wood[1], [1.81, .22, .8], [-.66, .17, 2.25]);

  // Original jointed mannequin and simple carried rifle. A separate walk pose
  // keeps the carried silhouette stable while the legs animate.
  const mannequin = new THREE.Group();
  scene.add(mannequin);
  const suit = paint('#72d4dc', .6);
  const armor = paint('#99eee8', .56);
  const joints = paint('#346f86');
  const dark = paint('#274653', .65, .14);
  const rifleStock = paint('#56665d');
  function rounded(parent: THREE.Object3D, mat: THREE.Material, w:number,h:number,d:number,r:number,x:number,y:number,z:number) {
    const mesh = new THREE.Mesh(geometry(new RoundedBoxGeometry(w,h,d,2,r)),mat);
    mesh.position.set(x,y,z);
    parent.add(mesh);
    return mesh;
  }
  rounded(mannequin, suit, .53,.58,.32,.115,0,1.27,0);
  rounded(mannequin, armor, .39,.26,.12,.055,0,1.4,.155);
  rounded(mannequin, joints, .46,.26,.31,.08,0,.93,0);
  rounded(mannequin, dark, .47,.08,.32,.026,0,1.04,.007);
  rounded(mannequin, joints, .22,.18,.22,.07,0,1.58,0);
  rounded(mannequin, armor, .39,.39,.36,.103,0,1.79,-.012);
  rounded(mannequin, joints, .25,.082,.038,.021,0,1.78,-.177);
  for(const sign of [-1,1]) rounded(mannequin, joints, .043,.13,.16,.018,sign*.188,1.78,0);
  const legPivots: THREE.Group[] = [];
  for (const x of [-.135,.135]) {
    const leg = new THREE.Group();
    leg.position.set(x,.92,.015);
    mannequin.add(leg);
    rounded(leg,suit,.208,.43,.226,.071,0,-.235,0);
    rounded(leg,joints,.19,.172,.21,.057,0,-.481,-.009);
    rounded(leg,armor,.19,.319,.195,.06,0,-.65,.012);
    rounded(leg,dark,.214,.13,.34,.045,0,-.845,-.04);
    legPivots.push(leg);
  }
  function limb(mat: THREE.Material, width: number, depth: number, a: THREE.Vector3, b: THREE.Vector3) {
    const direction = b.clone().sub(a);
    const midpoint = a.clone().lerp(b,.5);
    const mesh = rounded(mannequin, mat, width, direction.length()+width*.48, depth, Math.min(width,depth)*.38,midpoint.x,midpoint.y,midpoint.z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  }
  limb(suit,.175,.19,new THREE.Vector3(.29,1.46,-.035),new THREE.Vector3(.354,1.24,-.19));
  limb(armor,.145,.156,new THREE.Vector3(.354,1.24,-.19),new THREE.Vector3(.292,1.39,-.402));
  limb(suit,.175,.19,new THREE.Vector3(-.29,1.46,-.04),new THREE.Vector3(-.233,1.26,-.29));
  limb(armor,.141,.153,new THREE.Vector3(-.233,1.26,-.29),new THREE.Vector3(.158,1.37,-.66));
  const rifle = new THREE.Group();
  rifle.position.set(.26,1.40,-.29);
  rifle.rotation.x = .075;
  mannequin.add(rifle);
  rounded(rifle, rifleStock,.126,.118,.39,.021,0,-.006,-.08);
  rounded(rifle, dark,.085,.105,.27,.015,0,.005,-.31);
  rounded(rifle, rifleStock,.092,.083,.31,.016,0,-.028,-.52);
  box(rifle,dark,[.044,.043,.71],[0,.017,-.63]);
  box(rifle,dark,[.055,.017,.16],[0,.073,-.32]);
  box(rifle,joints,[.035,.042,.032],[0,.054,-.91]);
  rounded(rifle, dark,.066,.13,.077,.014,0,-.08,-.21);

  const playerShadow = new THREE.Mesh(geometry(new THREE.PlaneGeometry(1.36,1.15)),material(new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv; void main(){gl_FragColor=vec4(.03,.16,.18,.32*(1.-smoothstep(.15,.51,length(vUv-.5))));}`,
  })));
  playerShadow.rotation.x=-Math.PI/2;
  scene.add(playerShadow);

  // An original practice dummy at the estimated 61 m spot. It ignores fog and
  // glows slightly so it reads at distance against the dark hillside.
  const ridgePoint = targetBase.clone();
  const target = new THREE.Group();
  target.name = 'Target dummy';
  target.position.copy(targetBase);
  target.rotation.y = -RIDGE_HEADING;
  scene.add(target);
  const targetSkin = material(new THREE.MeshStandardMaterial({ color: '#ff6b35', emissive: '#ff4515', emissiveIntensity: .7, roughness: .55, fog: false }));
  const targetTrim = material(new THREE.MeshStandardMaterial({ color: '#ffe0b8', emissive: '#ffb070', emissiveIntensity: .5, roughness: .6, fog: false }));
  const torso = new THREE.Mesh(geometry(new THREE.CapsuleGeometry(.3, .62, 4, 10)), targetSkin);
  torso.position.y = 1.08;
  target.add(torso);
  const head = new THREE.Mesh(geometry(new THREE.SphereGeometry(.2, 14, 10)), targetTrim);
  head.position.y = 1.72;
  target.add(head);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(geometry(new THREE.CapsuleGeometry(.11, .5, 3, 8)), targetSkin);
    leg.position.set(side * .14, .38, 0);
    target.add(leg);
  }
  const band = new THREE.Mesh(geometry(new THREE.TorusGeometry(.31, .035, 6, 20)), targetTrim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.2;
  target.add(band);

  return {
    scene, mannequin, legPivots, playerShadow, ridgePoint, cone, target,
    dispose() {
      for(const mesh of instances) mesh.dispose();
      for(const value of geometries) value.dispose();
      for(const value of materials) value.dispose();
      woodGrain.dispose();
      scene.clear();
    },
  };
}

export function withinWalkArea(x: number, z: number) {
  return x * x + z * z <= WALK_LIMIT * WALK_LIMIT;
}
