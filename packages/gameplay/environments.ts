import * as THREE from 'three';
import type {ArenaId} from '../../shared/contracts';

/** Original geometry. No maps, models, marks or textures from the named games. */
export function createEnvironment(scene:THREE.Scene, arenaId:ArenaId, distance:number) {
  const geometries:THREE.BufferGeometry[]=[], materials:THREE.Material[]=[];
  const blockers:THREE.Mesh[]=[];
  const mat=(color:string,metalness=0,roughness=.85)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness});materials.push(m);return m;};
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,block=false)=>{
    const g=new THREE.BoxGeometry(w,h,d);geometries.push(g);const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);if(block)blockers.push(o);return o;
  };
  const cylinder=(r:number,h:number,x:number,y:number,z:number,m:THREE.Material)=>{const g=new THREE.CylinderGeometry(r,r,h,10);geometries.push(g);const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;};
  const sun=new THREE.DirectionalLight(arenaId==='rooftop-v1'?0xffd5a0:0xffffff,arenaId==='buildyard-v1'?3.2:2.7);sun.position.set(12,28,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-42;sun.shadow.camera.right=42;sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;scene.add(sun);
  const sky=arenaId==='rooftop-v1'?'#b6b3a9':arenaId==='buildyard-v1'?'#7dcffc':'#cbd9df';
  scene.background=new THREE.Color(sky);scene.fog=new THREE.Fog(sky,38,125);scene.add(new THREE.HemisphereLight(arenaId==='rooftop-v1'?0xd6d9df:0xffffff,0x5c646b,2.1));
  if(arenaId==='rooftop-v1') {
    const concrete=mat('#686b67'),dark=mat('#313c3c'),steel=mat('#526063',.5),sand=mat('#b4ac92'),glass=mat('#778f96',.6,.24),black=mat('#272b2a'),hazard=mat('#c9b04e');
    box(14,1,12,0,-.5,0,concrete);box(14,.06,.1,0,.04,-5.84,hazard);
    for(const x of [-6.8,6.8]) {box(.32,1.1,12,x,.55,0,dark);for(let z=-5;z<=5;z+=2)box(.34,1.1,.18,x,.55,z,hazard);}
    box(14,.6,.3,0,.3,5.8,dark);
    for(const [x,z] of [[-4,0],[4,1],[-4.5,-3]]) {box(1.6,1,1.8,x,.5,z,steel,true);for(let i=0;i<7;i++)box(1.4,.025,.055,x,1.015,z-.7+i*.22,black);}
    box(1.4,.65,1.3,3,.325,-4,sand,true);box(1.3,.6,1.15,3,.95,-4,sand,true);
    cylinder(.7,1.3,-5,.65,3,steel);cylinder(.1,3.8,5,1.9,-4,steel);box(2,.04,.05,5,3.4,-4,steel);box(.05,.04,2,5,3.4,-4,steel);
    for(let i=0;i<28;i++) {const x=(i%2?1:-1)*(15+(i%5)*7),z=-8-Math.floor(i/2)*7,h=12+(i*13%22);box(5.7,h,6,x,h/2-15,z,i%3?dark:concrete);for(let row=0;row<6;row++)for(let col=0;col<3;col++)box(.9,.8,.025,x-1.8+col*1.8,h-17-row*2,z+3.02,glass);box(6,.4,6.3,x,h-14.8,z,dark);}
    box(5,18,4,0,-7.4,-distance,concrete);box(5.4,.2,4.3,0,1.7,-distance,dark);
  } else if(arenaId==='buildyard-v1') {
    const grass=mat('#70b74f'),soil=mat('#9f7858'),wood=mat('#bd834c'),trunk=mat('#785234'),leaf=mat('#42a65a'),leaf2=mat('#77c954'),paint=mat('#5aa6d6'),roof=mat('#d76b77'),cloud=mat('#eef9ff');
    box(64,2,75,0,-1.05,-14,soil);box(64,.2,75,0,-.1,-14,grass);
    // A pale build pad marks the usable training grid.
    const grid=new THREE.GridHelper(30,10,0xc5ddb2,0x8ebe6e);grid.position.set(0,.025,-8);scene.add(grid);geometries.push(grid.geometry);materials.push(grid.material as THREE.Material);
    for(const [x,z] of [[-9,-5],[11,-13],[-12,-22],[13,-28],[-17,5],[17,8]]) {cylinder(.4,3.5,x,1.75,z,trunk);for(let k=0;k<3;k++){const g=new THREE.IcosahedronGeometry(2.4-k*.38,0);geometries.push(g);const m=new THREE.Mesh(g,k%2?leaf2:leaf);m.position.set(x+k*.25,3.5+k,z);m.castShadow=true;scene.add(m);}}
    for(const x of [-15,15]) {box(5,5,6,x,2.5,-8,paint);const g=new THREE.ConeGeometry(4.8,2.5,4);geometries.push(g);const m=new THREE.Mesh(g,roof);m.rotation.y=Math.PI/4;m.position.set(x,6.2,-8);scene.add(m);box(1.3,2.5,.1,x,1.25,-4.94,wood);for(const dx of [-1.6,1.6])box(.9,1,.1,x+dx,3.2,-4.94,cloud);}
    for(let i=0;i<7;i++){const x=-27+i*9;box(7,1,2,x,11+(i%2),-55,cloud);}
    for(const x of [-5,5])for(let z=-2;z>-30;z-=5){box(.17,.15,.17,x,.1,z,wood);}
    box(3,.25,3,0,2,-distance,wood);box(.2,3,.2,-1.35,.5,-distance,wood);box(.2,3,.2,1.35,.5,-distance,wood);
  } else {
    const stone=mat('#d5c5b1'),salmon=mat('#c57d71'),teal=mat('#436e72'),tile=mat('#e9d7be'),dark=mat('#303f48'),green=mat('#92a889'),crate=mat('#96b3a0'),gold=mat('#d5b686');
    box(32,1,58,0,-.5,-14,stone);
    for(let z=7;z>-40;z-=3)box(30,.015,.04,0,.008,z,tile);
    for(const x of [-10,10]) {box(3,9,50,x,4.5,-14,x<0?salmon:teal,true);box(3.2,.35,50.3,x,9.2,-14,tile);for(let z=2;z>-35;z-=8){box(.18,3.7,2,x+(x<0?1.6:-1.6),2,z,dark);box(.2,2.4,1.3,x+(x<0?1.72:-1.72),2,z,gold);}}
    for(const [x,z] of [[-4,-5],[4,-11],[-4,-21],[4,-28]]) {box(2.8,2.6,2.8,x,1.3,z,crate,true);box(2.85,.12,2.85,x,2.66,z,teal);for(const dx of [-1,1])box(.1,2.5,.05,x+dx,1.3,z+1.43,teal);}
    box(16,6,1,0,3,-39,salmon);box(5,3,.2,0,1.5,-38.3,dark);box(4.8,.3,.2,0,3.1,-38.1,tile);
    // Geometric archway framing a clear central aim lane.
    box(1.2,6,1,-4.5,3,-18,tile);box(1.2,6,1,4.5,3,-18,tile);box(10.2,1,1,0,6.3,-18,tile);
    for(const x of [-7,7]) {cylinder(.7,.6,x,.3,3,teal);cylinder(.23,2,x,1.6,3,green);}
    box(1.5,2.5,.7,0,1.25,-distance-.3,dark);box(1.7,.12,.9,0,2.6,-distance-.3,gold);
  }
  return {blockers,dispose:()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
