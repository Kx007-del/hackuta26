import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {ArenaId} from '../../shared/contracts';

type ArtDirection = {
  horizon: string; zenith: string; fogNear: number; fogFar: number;
  sun: string; sunPower: number; sunPosition: [number, number, number];
  skyFill: string; groundFill: string; fillPower: number;
};

const art: Record<ArenaId, ArtDirection> = {
  'rooftop-v1': {horizon:'#d8b797',zenith:'#456987',fogNear:34,fogFar:125,sun:'#ffca91',sunPower:2.7,sunPosition:[-24,17,-13],skyFill:'#b8d4ef',groundFill:'#69727a',fillPower:2},
  'buildyard-v1': {horizon:'#c3f1ff',zenith:'#278acb',fogNear:43,fogFar:145,sun:'#fff2cb',sunPower:3.2,sunPosition:[-18,29,19],skyFill:'#d5efff',groundFill:'#95a46d',fillPower:1.65},
  'tactical-v1': {horizon:'#f0d8bd',zenith:'#669fca',fogNear:44,fogFar:130,sun:'#ffe2bf',sunPower:3.0,sunPosition:[10,24,6],skyFill:'#b4d3ff',groundFill:'#6e666d',fillPower:1.55},
};

function sampler(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Tileable original mineral grain for color variation. */
function grain(repeat: [number, number], strength: number, paving=false) {
  const size = 128;
  const random = sampler(8317);
  const data = new Uint8Array(size * size * 4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const mottling = .5 + .18*Math.sin(3*u+2*v) + .15*Math.cos(7*v-u) + .1*Math.sin(13*u-9*v) + .22*random();
    const seam=paving&&(y%64===0||(x+(y<64?0:64))%128===0);
    const grey = Math.round(255 * (1-strength + strength*mottling) * (seam?.69:1));
    const i = (y*size+x)*4;
    data[i]=grey; data[i+1]=grey; data[i+2]=grey; data[i+3]=255;
  }
  const texture = new THREE.DataTexture(data,size,size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createEnvironment(scene: THREE.Scene, arenaId: ArenaId, distance: number, shadows: boolean) {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const instances: THREE.InstancedMesh[] = [];
  const blockers: THREE.Mesh[] = [];
  const direction = art[arenaId];

  const track = <T extends THREE.BufferGeometry>(geometry: T) => {
    geometries.push(geometry);
    return geometry;
  };
  function material(color: string, metalness=0, roughness=.85, map?: THREE.Texture) {
    const m = new THREE.MeshStandardMaterial({color,metalness,roughness,map});
    materials.push(m);
    return m;
  }
  function mineral(color:string, repeat:[number,number], strength=.34, paving=false) {
    const map=grain(repeat,strength,paving);
    textures.push(map);
    return material(color,0,.94,map);
  }

  // Only the original tactical collision meshes enter blockers. Decorative
  // shapes use instance batches and never influence movement or shot tests.
  const cube = track(new THREE.BoxGeometry(1,1,1));
  const barrel = track(new THREE.CylinderGeometry(1,1,1,12));
  const rock = track(new THREE.IcosahedronGeometry(1,1));
  const cone = track(new THREE.CylinderGeometry(.54,1,1,12));
  const batches = new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;cast:boolean;matrices:THREE.Matrix4[]}>();
  const transform = new THREE.Object3D();
  function shape(g:THREE.BufferGeometry,m:THREE.Material,w:number,h:number,d:number,x:number,y:number,z:number,cast=true,yaw=0) {
    const key = `${g.id}:${m.uuid}:${cast}`;
    let batch = batches.get(key);
    if (!batch) {
      batch={geometry:g,material:m,cast,matrices:[]};
      batches.set(key,batch);
    }
    transform.position.set(x,y,z);
    transform.rotation.set(0,yaw,0);
    transform.scale.set(w,h,d);
    transform.updateMatrix();
    batch.matrices.push(transform.matrix.clone());
  }
  function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,cast=true) {
    shape(cube,m,w,h,d,x,y,z,cast);
  }
  function solid(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material) {
    const o = new THREE.Mesh(cube,m);
    o.scale.set(w,h,d);
    o.position.set(x,y,z);
    o.castShadow = shadows;
    o.receiveShadow = true;
    scene.add(o);
    blockers.push(o);
  }

  const sun = new THREE.DirectionalLight(direction.sun,direction.sunPower);
  sun.position.set(...direction.sunPosition);
  sun.target.position.z = -10;
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-25,right:25,top:26,bottom:-26,near:1,far:80});
  sun.shadow.normalBias = .055;
  sun.shadow.bias = -.0003;
  scene.add(sun,sun.target,new THREE.HemisphereLight(direction.skyFill,direction.groundFill,direction.fillPower));
  scene.background = new THREE.Color(direction.horizon);
  scene.fog = new THREE.Fog(direction.horizon,direction.fogNear,direction.fogFar);

  const skyMaterial = new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:{
      horizon:{value:new THREE.Color(direction.horizon)},
      zenith:{value:new THREE.Color(direction.zenith)},
      sunDirection:{value:sun.position.clone().sub(sun.target.position).normalize()},
      glow:{value:new THREE.Color(direction.sun)},
    },
    vertexShader:`
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader:`
      varying vec3 skyDirection;
      uniform vec3 horizon, zenith, sunDirection, glow;
      void main() {
        vec3 ray = normalize(skyDirection);
        float above = pow(max(ray.y, 0.0), 0.54);
        float towardSun = max(dot(ray, sunDirection), 0.0);
        vec3 color = mix(horizon, zenith, above);
        color += glow * (0.16 * pow(towardSun, 12.0) + 0.8 * smoothstep(0.99925, 0.99975, towardSun));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  materials.push(skyMaterial);
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(165,24,12)),skyMaterial);
  sky.renderOrder = -1;
  scene.add(sky);

  const contactMaterial = new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader:`
      varying vec2 vUv;
      void main() {
        float distanceFromCenter = length((vUv - 0.5) * 2.0);
        gl_FragColor = vec4(0.07, 0.08, 0.09, (1.0 - smoothstep(0.3, 1.0, distanceFromCenter)) * 0.29);
      }`,
  });
  materials.push(contactMaterial);
  const contactPlane=track(new THREE.PlaneGeometry(1,1));
  function contact(x:number,z:number,w:number,d:number) {
    const mesh=new THREE.Mesh(contactPlane,contactMaterial);
    mesh.rotation.x=-Math.PI/2;
    mesh.scale.set(w,d,1);
    mesh.position.set(x,.021,z);
    scene.add(mesh);
  }

  if (arenaId === 'rooftop-v1') {
    const deck=mineral('#797770',[7,6],.48), concrete=mineral('#666964',[2,1]);
    const seam=material('#494848'), cap=material('#6a7476',.45,.54);
    const zinc=material('#8a9697',.48,.48), equipment=material('#535d55',.28,.65);
    const rubber=material('#2c302e'), rust=material('#77604d'), hazard=material('#e2b650');
    const building=[material('#686b6a'),material('#888379'),material('#575d60'),material('#77675e')];
    const glazing=[material('#3c515a',.33,.4),material('#72848a',.26,.48),material('#bca079',.15,.62)];
    box(14,1,12,0,-.5,0,deck,false);
    for (let x=-5;x<=5;x+=2.5) box(.022,.006,11.65,x,.004,0,seam,false);
    for (let z=-4;z<=4;z+=2) box(13.25,.006,.022,0,.004,z,seam,false);
    for (const x of [-6.8,6.8]) {
      box(.32,1.1,12,x,.55,0,concrete);
      box(.42,.085,12.05,x,1.115,0,cap);
      box(.18,.007,11.4,x*.96,.008,0,seam,false);
      for (let z=-5;z<=5;z+=2) box(.03,.12,.2,x*.974,.93,z,hazard,false);
    }
    box(14,.6,.3,0,.3,5.8,concrete);
    box(14,.075,.39,0,.61,5.8,cap);
    box(13.3,.009,.11,0,.008,-5.8,hazard,false);
    for (const [x,z] of [[-4,0],[4,1],[-4.5,-3]]) {
      contact(x,z,3,3.4);
      box(1.8,.15,2,x,.08,z,rubber);
      box(1.6,.83,1.8,x,.58,z,equipment);
      box(1.66,.09,1.86,x,1.035,z,zinc);
      box(1.25,.57,.035,x,.58,z+.91,rubber);
      for(let row=0;row<8;row++) box(1.2,.029,.032,x,.35+row*.067,z+.94,cap,false);
      shape(barrel,zinc,.62,.045,.62,x,1.1,z);
      shape(barrel,rubber,.49,.048,.49,x,1.12,z,false);
      for(let i=0;i<6;i++) box(.71,.012,.035,x,1.15,z-.31+i*.125,zinc,false);
      box(.035,.2,.35,x+.815,.39,z-.52,rust,false);
    }
    box(1.55,2.45,1.8,-5.25,1.225,4.25,concrete);
    box(1.7,.12,1.95,-5.25,2.48,4.25,cap);
    box(1,1.96,.05,-5.25,1.02,3.33,equipment);
    box(.12,.035,.035,-4.96,1,3.296,zinc,false);
    box(.06,.065,6.4,6.42,.15,1,zinc);
    box(.96,.065,.06,5.98,.15,1,zinc);
    shape(barrel,cap,.09,3.8,.09,5,1.9,-4);
    box(1.6,.04,.06,5,3.37,-4,zinc);
    box(.05,.04,1.2,5,3.61,-4,zinc);
    for (const x of [-5.85,5.85]) {
      box(.49,.012,.34,x,.009,-4.7,rust,false);
      for(let i=0;i<6;i++) box(.38,.012,.019,x,.016,-4.84+i*.054,rubber,false);
    }

    const random=sampler(7281);
    for (let row=0;row<4;row++) for(let col=-5;col<=5;col++) {
      const x=col*13+(row%2)*5, z=-24-row*18-random()*5;
      if(Math.abs(x)<8&&row<2) continue;
      const h=13+random()*22,w=5+random()*5,d=6+random()*4,y=h/2-18;
      const facade=building[(col+row+8)%building.length];
      box(w,h,d,x,y,z,facade,false);
      box(w+.3,.29,d+.24,x,y+h/2+.12,z,cap,false);
      box(w*.55,2.4,d*.58,x+.7,y+h/2+1.2,z-1,facade,false);
      if(row===0) for(let floor=0;floor<8;floor++) {
        const level=y+h/2-1.6-floor*2;
        box(w+.065,.07,d+.065,x,level-.57,z,cap,false);
        for(let bay=0;bay<4;bay++) {
          const pane=glazing[random()<.08?2:(bay+floor)%2];
          box(w*.14,.83,.025,x+w*(-.33+bay*.22),level,z+d/2+.02,pane,false);
          box(.024,.83,d*.135,x+(col<0?1:-1)*(w/2+.02),level,z+d*(-.33+bay*.22),pane,false);
        }
      }
      if(row<2&&col%3===0) box(.075,4,.075,x,y+h/2+4,z,cap,false);
      if(row===0) for(const side of [-1,1]) {
        box(w*.84,h*.72,d,x+side*4,y-5,24+random()*8,facade,false);
        box(w*.65,.27,d+.2,x+side*4,y-5+h*.36,25,cap,false);
      }
    }
    for (const side of [-1,1]) for(let i=0;i<5;i++) {
      const h=9+random()*17;
      const x=side*(13+i*3),z=-12+i*5;
      box(7,h,8,x,h/2-15,z,building[i%4],false);
      box(7.3,.27,8.3,x,h-14.9,z,cap,false);
      for(let floor=0;floor<7;floor++) {
        const y=h-16.3-floor*1.7;
        for(let bay=-1;bay<=1;bay++) {
          box(.027,.7,1.14,x-side*3.52,y,z+bay*1.87,glazing[(bay+floor+1)%2],false);
          box(1.14,.7,.027,x+bay*1.7,y,z+4.018,glazing[(bay+floor+1)%2],false);
        }
      }
    }
    // The 180 preset starts facing the rear parapet, so build depth on both
    // sides of the roof rather than leaving that view on an empty horizon.
    for(let row=0;row<3;row++) for(let col=-4;col<=4;col++) {
      const x=col*12+(row%2)*4,z=27+row*17+random()*4;
      const h=15+random()*23,w=6+random()*4;
      const facade=building[(col+row+4)%building.length];
      box(w,h,6.4,x,h/2-17,z,facade,false);
      box(w+.35,.23,6.8,x,h-16.9,z,cap,false);
      if(row===0) for(let floor=0;floor<6;floor++) for(let bay=-1;bay<=1;bay++){
        box(w*.18,.93,.023,x+bay*w*.27,h-18.4-floor*1.94,z-3.22,glazing[(floor+bay+1)%2],false);
      }
      if(row<2) box(w*.47,1.8,3,x+.4,h-16.1,z+.55,facade,false);
    }
    // Mount and roof behind the target plane.
    box(5,18,4,0,-7.4,-distance-2.07,concrete,false);
    box(5.4,.2,4.3,0,1.7,-distance-2.25,cap);
    for(const x of [-1.25,1.25]) box(.19,1.65,.2,x,2.42,-distance-.15,equipment);
  } else if (arenaId === 'buildyard-v1') {
    const grass=material('#70a640'), lime=material('#97bc55'), dirt=material('#a36e48');
    const darkerRock=material('#aa8875'), brightRock=material('#dfad83');
    const paint=material('#36a9ba'), trim=material('#fff0ad'), roof=material('#cd5c52');
    const soil=material('#bd935b'), bark=material('#774e3a');
    const leaves=[material('#26896c'),material('#65aa55'),material('#9bc852')];
    const foam=material('#edf7ff'), sea=material('#55aed4',.13,.48);
    const random=sampler(12689);
    box(190,.3,180,0,-4.3,-36,sea,false);
    box(64,2,75,0,-1.02,-14,dirt,false);
    box(64,.2,75,0,-.1,-14,grass,false);
    box(5.2,.014,6,0,.009,0,soil,false);
    for(const x of [-2.65,2.65]) {
      box(.11,.012,6.25,x,.016,0,trim,false);
      for(let z=-2.4;z<=2.4;z+=1.2) box(.5,.013,.08,x*.83,.018,z,trim,false);
    }
    for (const side of [-1,1]) {
      for (let i=0;i<8;i++) {
        const z=-43+i*7,x=side*(21+random()*8);
        shape(rock,darkerRock,7,7+random()*7,8,x,-1,z,false,.2*i);
        shape(rock,brightRock,6.6,6,7,x,2,z,false,.2*i);
        shape(rock,leaves[1],6.5,2.1,7.6,x,6,z,false,.2*i);
      }
      for(const z of [-9,-21,-31,5]) {
        const x=side*(11+random()*5);
        const h=2.8+random()*1.8;
        contact(x,z,5.4,4.7);
        shape(barrel,bark,.31,h,.35,x,h/2,z);
        shape(rock,leaves[0],2.45,1.75,2.05,x,h,z,true,.45);
        shape(rock,leaves[1],2.15,1.9,2.4,x+.8,h+.85,z-.62,true,1);
        shape(rock,leaves[2],1.52,1.4,1.58,x-.45,h+1.65,z+.2,true,2);
      }
      const x=side*12.8,z=-13;
      box(5.7,.18,6.1,x,.1,z,soil);
      box(4.6,3.7,4.9,x,1.95,z,paint);
      box(4.8,.29,5,x,.31,z,trim);
      shape(cone,roof,3.6,1.8,3.8,x,4.45,z,true,Math.PI/12);
      box(1.16,2.45,.06,x,.1+1.225,z+2.5,bark);
      for (const offset of [-1.35,1.35]) {
        box(.9,1.02,.06,x+offset,2.45,z+2.5,trim);
        box(.65,.77,.08,x+offset,2.45,z+2.55,foam);
      }
      for(let j=0;j<6;j++) {
        const fz=-2-j*2.3;
        box(.18,1.01,.18,side*9,.51,fz,bark);
        if(j<5) for(const y of [.38,.72]) box(.15,.12,2.34,side*9,y,fz-1.14,soil);
      }
      for(let i=0;i<30;i++) {
        const px=side*(5.8+random()*12),pz=6-random()*45;
        shape(rock,lime,.21+random()*.2,.12+random()*.16,.23,px,.05,pz,false,random());
      }
    }
    for (let i=0;i<8;i++) for(let j=0;j<4;j++) {
      shape(rock,foam,3.6+j*.7,1.2+(j%2)*.75,2.7,-42+i*13+j*2.15,13+(i%3)*4+Math.sin(j)*.75,-65-i%2*9,false);
    }
    box(3.2,.24,2,0,1.8,-distance-.3,soil);
    for(const x of [-1.28,1.28]) {
      box(.22,3.05,.22,x,1.53,-distance-.19,bark);
      box(.33,.19,.33,x,2.87,-distance-.19,trim);
    }
  } else {
    const paving=mineral('#b9a892',[32/1.8,58/3.1],.22,true), plaster=mineral('#dcc5a6',[2,16],.12);
    const rose=mineral('#be8e76',[2,16],.13), limestone=material('#e4cead');
    const base=material('#9b8e83'), dark=material('#444e5a');
    const teal=material('#4c777b'), iron=material('#37414b',.35,.62), tile=material('#a86654');
    const crate=material('#759b97',.14,.78), inset=material('#5c797e'), edge=material('#bdd4bf');
    const green=material('#667b54'), planter=material('#a47961');
    box(32,1,58,0,-.5,-14,paving,false);
    for(const side of [-1,1]) {
      const x=side*10, face=side*8.5, inner=side*8.44;
      solid(3,9,50,x,4.5,-14,side<0?rose:plaster);
      box(.12,.64,50,inner,.32,-14,base);
      box(.21,.14,50,inner,.71,-14,limestone);
      box(3.4,.21,50.3,x,8.93,-14,limestone);
      box(3.3,.26,50.3,x,9.17,-14,tile);
      for(let z=6;z>=-37;z-=5.6) {
        box(.21,7.7,.38,inner,4.55,z,limestone);
        box(.06,2.46,1.38,inner,1.24,z-2.67,dark);
        box(.07,2.2,1.15,inner-side*.04,1.13,z-2.67,side<0?teal:iron);
        for(const end of [-1,1]) box(.16,2.62,.16,face-side*.12,1.31,z-2.67+end*.76,limestone);
        box(.19,.2,1.68,inner,2.64,z-2.67,limestone);
        box(.065,1.33,1.62,inner,5.42,z-2.67,dark);
        box(.19,.14,1.81,inner,4.72,z-2.67,limestone);
        for(let bar=-2;bar<=2;bar++) box(.09,1.22,.028,inner-side*.067,5.42,z-2.67+bar*.265,iron,false);
        if(Math.round(z)%2===0) {
          box(.43,.13,1.96,inner-side*.17,4.64,z-2.67,limestone);
          box(.047,.058,1.98,inner-side*.38,5.18,z-2.67,iron,false);
          for(const end of [-1,1]) box(.043,.58,.046,inner-side*.38,4.92,z-2.67+end*.9,iron,false);
        }
      }
      for(const z of [4,-33]) {
        shape(cone,planter,.61,.64,.61,side*7.7,.32,z);
        shape(rock,green,.68,.82,.62,side*7.7,.92,z);
      }
    }
    for (const [x,z] of [[-4,-5],[4,-11],[-4,-21],[4,-28]]) {
      contact(x,z,4.5,4.5);
      solid(2.8,2.6,2.8,x,1.3,z,crate);
      box(2.76,.15,2.76,x,2.52,z,iron);
      box(2.76,.14,2.76,x,.078,z,iron);
      // Thin surface details leave the blocker dimensions unchanged.
      for(const side of [-1,1]) {
        box(2.33,1.77,.012,x,1.3,z+side*1.398,inset,false);
        box(.012,1.77,2.33,x+side*1.398,1.3,z,inset,false);
        for(const end of [-1,1]) {
          box(.15,2.26,.013,x+end*1.225,1.3,z+side*1.399,edge,false);
          box(.013,2.26,.15,x+side*1.399,1.3,z+end*1.225,edge,false);
        }
        box(1.12,.105,.016,x,1.99,z+side*1.4,edge,false);
      }
    }
    box(16,6,1,0,3,-39,rose);
    box(16.6,.27,1.2,0,6,-39,limestone);
    box(4.8,3.2,.1,0,1.6,-38.43,teal);
    for(const x of [-2.55,2.55]) box(.27,3.4,.19,x,1.7,-38.4,limestone);
    box(5.2,.23,.25,0,3.34,-38.35,limestone);
    for(const [x,h,z] of [[-11,11,-49],[6,10,-53],[14,14,-47]]) {
      box(7,h,5,x,h/2,z,plaster,false);
      box(7.45,.48,5.48,x,h,z,tile,false);
      for(const offset of [-2,0,2]) box(.88,1.72,.045,x+offset,h-2,z+2.52,teal,false);
    }
    for(const x of [-4.5,4.5]) {
      box(1.2,6,1,x,3,-18,limestone);
      box(1.32,.26,1.08,x,.13,-18,base);
      box(1.32,.25,1.08,x,4.96,-18,limestone);
    }
    // Segmented masonry arch. The opening stays above the target lane.
    const count=15;
    const archStones:THREE.ExtrudeGeometry[]=[];
    for(let i=0;i<count;i++) {
      const a0=i*Math.PI/count+.004, a1=(i+1)*Math.PI/count-.004;
      const voussoir=new THREE.Shape();
      voussoir.moveTo(5.1*Math.cos(a0),4.36+2.88*Math.sin(a0));
      voussoir.lineTo(5.1*Math.cos(a1),4.36+2.88*Math.sin(a1));
      voussoir.lineTo(3.9*Math.cos(a1),4.36+2.12*Math.sin(a1));
      voussoir.lineTo(3.9*Math.cos(a0),4.36+2.12*Math.sin(a0));
      voussoir.closePath();
      archStones.push(new THREE.ExtrudeGeometry(voussoir,{depth:1.05,bevelEnabled:false}));
    }
    const arch=new THREE.Mesh(track(mergeGeometries(archStones)),limestone);
    archStones.forEach(stone=>stone.dispose());
    arch.position.z=-18.525;
    arch.castShadow=shadows;
    arch.receiveShadow=true;
    scene.add(arch);
    box(.95,2.18,.34,0,1.09,-distance-.24,dark);
    box(1.07,.105,.49,0,.1,-distance-.29,base);
  }

  for (const {geometry,material,cast,matrices} of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry,material,matrices.length);
    matrices.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    instances.push(mesh);
  }

  return {
    blockers,
    dispose:()=>{
      sun.shadow.dispose();
      instances.forEach(mesh=>mesh.dispose());
      geometries.forEach(geometry=>geometry.dispose());
      materials.forEach(m=>m.dispose());
      textures.forEach(texture=>texture.dispose());
    },
  };
}
