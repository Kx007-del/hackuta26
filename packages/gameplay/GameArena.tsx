import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {ARENAS} from '../../shared/contracts';
import {createEnvironment} from './environments';
import type {ChallengeConfig, AttemptResult, ReplayFrame} from '../../shared/contracts';
import './gameplay.css';
import {evaluateShot,netSpinDegrees,targetForArena,JUMP_SPEED,GRAVITY} from './shotRules';

type Props = {config:ChallengeConfig; onComplete:(r:AttemptResult)=>void; replay?:AttemptResult; onReplayEnd?:()=>void};
type Hud = {air:boolean; spin:number; message:string; ready:boolean; finished:boolean;builds:number;edited:boolean;dashes:number;ads:boolean};

export default function GameArena({config,onComplete,replay,onReplayEnd}:Props){
  const mount=useRef<HTMLDivElement>(null);
  const arena=useRef<HTMLElement>(null);
  const actions=useRef<{enter:()=>void;jump:()=>void;fire:()=>void;reset:()=>void;build:()=>void;edit:()=>void;dash:()=>void;aim:()=>void;keyboard:()=>void;align:()=>void}|undefined>(undefined);
  const callbacks=useRef({onComplete,onReplayEnd});
  callbacks.current={onComplete,onReplayEnd};
  const playConfig=replay?.config??config;
  const {arenaId,templateId,targetDistance,requiredSpinDegrees,referenceClipId}=playConfig;
  const location=ARENAS.find(item=>item.id===arenaId)?.title??'ROOFTOP';
  const roof=arenaId==='rooftop-v1', buildyard=arenaId==='buildyard-v1';
  const tactical=arenaId==='tactical-v1', wallEdit=templateId==='wall-edit', dashPeek=templateId==='dash-peek';
  const objective=wallEdit?'BUILD. EDIT. JUMP. FIRE.':buildyard?'BUILD A RAMP. JUMP. FIRE.':dashPeek?'DASH OUT. STOP. FIRE.':tactical?'STOP. AIM. FIRE.':requiredSpinDegrees?`${requiredSpinDegrees}° AIRBORNE SHOT`:'JUMP. AIM. LAND IT.';

  const [hud,setHud]=useState<Hud>({air:false,spin:0,message:'Choose your action. Make your moment.',ready:false,finished:false,builds:0,edited:false,dashes:0,ads:false});
  const [error,setError]=useState('');

  useEffect(()=>{
    const container=mount.current;
    if(!container)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}
    catch{setError('This arena needs a browser with WebGL enabled. Try Chrome or Edge with hardware acceleration.');return;}
    setError('');
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    scene.background=new THREE.Color('#0b101b');
    scene.fog=new THREE.FogExp2('#10182a',0.012);
    const camera=new THREE.PerspectiveCamera(68,1,.1,250);
    camera.rotation.order='YXZ';
    scene.add(new THREE.HemisphereLight(0xaacbff,0x18202b,2.3));
    const sun=new THREE.DirectionalLight(0xffc7a4,2.6);sun.position.set(12,24,8);scene.add(sun);
    const materials:THREE.Material[]=[];
    const geometries:THREE.BufferGeometry[]=[];
    function material(color:string,emissive?:string){const m=new THREE.MeshStandardMaterial({color,roughness:.8,...(emissive?{emissive,emissiveIntensity:2}:{})});materials.push(m);return m;}
    const concrete=material('#293343'),dark=material('#111b2b'),red=material('#ff3e47','#c91d2a'),white=material('#e8f0f4'),blue=material('#55d6e8','#276d84');
    function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material){const g=new THREE.BoxGeometry(w,h,d);geometries.push(g);const o=new THREE.Mesh(g,m);o.position.set(x,y,z);scene.add(o);return o;}
    const environment=createEnvironment(scene,arenaId,targetDistance);
    const {height,radius}=targetForArena(arenaId);
    const targetPosition=new THREE.Vector3(0,height,-targetDistance);
    const targetGeometry=new THREE.CircleGeometry(radius,48);geometries.push(targetGeometry);
    const target=new THREE.Mesh(targetGeometry,red);target.position.copy(targetPosition);scene.add(target);
    const innerGeometry=new THREE.RingGeometry(.58*radius/1.65,.7*radius/1.65,40);geometries.push(innerGeometry);
    const inner=new THREE.Mesh(innerGeometry,white);inner.position.copy(targetPosition);inner.position.z+=.012;scene.add(inner);
    const dotGeometry=new THREE.CircleGeometry(.12*radius/1.65,24);geometries.push(dotGeometry);
    const dot=new THREE.Mesh(dotGeometry,white);dot.position.copy(targetPosition);dot.position.z+=.02;scene.add(dot);

    // A compact, original weapon silhouette attached to the camera.
    const weapon=new THREE.Group();
    function gunBox(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material){const g=new THREE.BoxGeometry(w,h,d);geometries.push(g);const o=new THREE.Mesh(g,m);o.position.set(x,y,z);weapon.add(o);}
    const gunFinish=material(roof?'#4a514a':buildyard?'#9059ce':'#667f84');gunFinish.metalness=roof?.65:.35;gunFinish.roughness=.4;
    gunBox(buildyard?.19:.12,.14,.55,.24,-.22,-.48,gunFinish);
    gunBox(buildyard?.10:.045,buildyard?.08:.045,roof?.75:buildyard?.32:.52,.24,-.18,-.88,concrete);
    gunBox(.075,roof?.09:.04,roof?.28:.16,.24,-.11,-.48,roof?dark:red);
    gunBox(.09,.19,.12,.24,-.34,-.41,dark);
    if(buildyard){gunBox(.16,.08,.22,.24,-.26,-.76,gunFinish);gunBox(.20,.05,.12,.24,-.17,-.62,white);}
    if(tactical){gunBox(.07,.24,.16,.24,-.35,-.59,dark);gunBox(.05,.04,.42,.24,-.12,-.76,white);}
    if(roof){const scopeGeometry=new THREE.CylinderGeometry(.055,.055,.32,16);geometries.push(scopeGeometry);const scope=new THREE.Mesh(scopeGeometry,dark);scope.rotation.x=Math.PI/2;scope.position.set(.24,-.08,-.5);weapon.add(scope);}
    camera.add(weapon);scene.add(camera);
    const structures=new THREE.Group();
    scene.add(structures);
    const timber=material('#bb8148'), edge=material('#efbf81');
    const platform=box(2.8,.16,Math.hypot(4,1.4),0,.62,0,timber);
    platform.rotation.x=Math.atan2(1.4,4);
    structures.add(platform);
    const wallParts=[box(.75,4.6,.2,-1.825,2.3,0,timber),
      box(.75,4.6,.2,1.825,2.3,0,timber),
      box(2.9,2.35,.2,0,1.175,0,timber),
      box(2.9,2.25,.2,0,3.475,0,edge)];
    wallParts.forEach(part=>structures.add(part));
    const wallBounds=wallParts.map(part=>new THREE.Box3().setFromObject(part));
    scene.updateMatrixWorld(true);
    const staticCover=tactical?environment.blockers.map(mesh=>new THREE.Box3().setFromObject(mesh)):[];
    function showBuild(count:number,opened:boolean){
      structures.visible=buildyard&&count>0;
      platform.visible=!wallEdit;
      wallParts.forEach((part,index)=>{part.visible=wallEdit&&!(opened&&index===3);});
    }
    showBuild(0,false);

    const keys=new Set<string>();
    let x=dashPeek?-4:0,y=1.7,z=dashPeek?-2.8:3,yaw=0,pitch=0,vy=0;
    let air=false,hasJumped=false,takeoffYaw=0,finished=false,ready=false;
    let builds=0,dashes=0,edited=false,ads=false,speed=0,dashLeft=0;
    let dashCleared=false,rampTakeoff=false,firePending=false;
    let started=performance.now(),last=started,lastRecord=0,lastHud=0,raf=0,disposed=false,replayEnded=false;
    let frames:ReplayFrame[]=[],shotTime=-1,replayShotShown=false;
    let message=objective;
    function updateHud(){setHud({air,spin:Math.round(netSpinDegrees(yaw,takeoffYaw)),message,ready,finished,builds,edited,dashes,ads});}
    function snapshot(t:number):ReplayFrame{return {t,x,y,z,yaw,pitch,...(roof?{}:{builds,dashes,edited})};}
    function record(now:number){
      const t=Math.max(0,now-started);
      if(t>(frames[frames.length-1]?.t??-1)&&frames.length<1799){frames.push(snapshot(t));lastRecord=t;}
    }
    function reset(){
      if(replay)return;
      x=dashPeek?-4:0;y=1.7;z=dashPeek?-2.8:3;vy=0;yaw=requiredSpinDegrees===180?Math.PI:0;pitch=0;
      air=false;hasJumped=false;takeoffYaw=yaw;finished=false;keys.clear();
      builds=0;dashes=0;edited=false;ads=false;speed=0;dashLeft=0;dashCleared=false;rampTakeoff=false;firePending=false;
      started=performance.now();lastRecord=0;frames=[snapshot(0)];shotTime=-1;target.material=red;
      showBuild(0,false);message=objective;updateHud();
    }
    function focusArena(){arena.current?.focus({preventScroll:true});}
    function start(){if(!ready){reset();ready=true;}focusArena();}
    function enter(){
      if(replay)return;
      start();updateHud();
      const fallback=()=>{if(disposed||finished)return;message='Keyboard controls are ready. Click the arena for mouse aim.';updateHud();};
      try{renderer.domElement.requestPointerLock?.()?.catch(fallback);}catch{fallback();}
    }
    function rampHeight(){return buildyard&&!wallEdit&&builds&&Math.abs(x)<1.4&&z>=-2&&z<=2?(2-z)*.35:0;}
    function wallSolids(){return wallEdit&&builds?wallBounds.slice(0,edited?3:4):[];}
    function shotRay(){return new THREE.Ray(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ')));}
    function occludes(ray:THREE.Ray,boxes:THREE.Box3[],distance:number){
      return boxes.some(bounds=>{const point=ray.intersectBox(bounds,new THREE.Vector3());return !!point&&point.distanceTo(ray.origin)<distance;});
    }
    function covered(){
      const origin=new THREE.Vector3(x,y,z);
      const direction=targetPosition.clone().sub(origin);
      return occludes(new THREE.Ray(origin,direction.clone().normalize()),staticCover,direction.length());
    }
    function jump(){
      if(replay||finished||air||tactical)return;
      start();
      if(roof){started=performance.now();lastRecord=0;frames=[snapshot(0)];}
      rampTakeoff=rampHeight()>0;
      vy=JUMP_SPEED;air=true;hasJumped=true;takeoffYaw=yaw;
      message='Fire while airborne.';updateHud();
    }
    function build(){
      if(replay||finished||!buildyard||builds)return;
      start();
      const occupied=wallEdit?Math.abs(x)<2.5&&Math.abs(z)<.4:Math.abs(x)<1.7&&z>-2.3&&z<2.3;
      if(occupied){message='Step outside the build slot first.';updateHud();return;}
      builds=1;showBuild(builds,edited);record(performance.now());
      message=wallEdit?'Edit the wall to open the shot.':'Walk onto the ramp, then jump.';updateHud();
    }
    function edit(){
      if(replay||finished||!wallEdit||!builds||edited)return;
      focusArena();edited=true;showBuild(builds,edited);record(performance.now());
      message='Jump on the near side and shoot through the opening.';updateHud();
    }
    function dash(){
      if(replay||finished||!dashPeek||dashLeft||dashes||air)return;
      start();
      if(x>=-2||!covered()){message='Move behind the left crate to start the dash.';updateHud();return;}
      dashLeft=4;dashCleared=false;message='Release movement before firing.';updateHud();
    }
    function aim(){if(replay||finished)return;start();ads=!ads;updateHud();}
    function fire(){if(!replay&&!finished&&ready)firePending=true;}
    function finishShot(now:number){
      const ray=shotRay();
      const impact=ray.intersectSphere(new THREE.Sphere(targetPosition,radius),new THREE.Vector3());
      const distance=impact?.distanceTo(ray.origin)??0;
      const blocked=occludes(ray,[...staticCover,...wallSolids()],distance);
      const crossing=new THREE.Vector3();
      const throughOpening=wallEdit&&edited&&z>.1&&ray.direction.z<0&&
        ray.at(-z/ray.direction.z,crossing).y>2.35&&crossing.y<4.6&&Math.abs(crossing.x)<1.45&&
        -z/ray.direction.z<distance;
      const mechanicState={builds,dashes,speedAtShot:speed,...(wallEdit?{edited}:{})};
      const result=evaluateShot({x,y,z,yaw,pitch,targetDistance,airborne:air,hasJumped,takeoffYaw,requiredSpinDegrees,arenaId,templateId,mechanicState,obstructed:blocked});
      const {targetHit:hit,rotationDegrees:spin}=result;
      const success=result.success&&(!buildyard||(wallEdit?throughOpening:rampTakeoff));
      message=success?'Shot landed.':buildyard&&!builds?'Place the build first.':wallEdit&&!edited?'Edit the wall first.':
        tactical&&(air||speed>.35)?'Stop moving before firing.':dashPeek&&!dashes?'Dash from behind cover into the lane first.':
        !tactical&&!air?'Fire while airborne.':buildyard&&!wallEdit&&!rampTakeoff?'Jump from the ramp first.':
        blocked?'Cover blocked the shot.':!hit?'Missed. Try again.':wallEdit&&!throughOpening?'Shoot through the opening.':
        `Add ${Math.ceil(requiredSpinDegrees-spin)}° more rotation.`;
      shotTime=Math.max(1,now-started,(frames[frames.length-1]?.t??0)+.001);
      finished=true;frames.push(snapshot(shotTime));if(hit)target.material=blue;updateHud();
      callbacks.current.onComplete({id:crypto.randomUUID(),config:{...config},success,targetHit:hit,airborneAtShot:air,rotationDegrees:spin,durationMs:shotTime,frames:[...frames],shotTimeMs:shotTime,...(roof?{}:{mechanicState})});
      if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
    }
    actions.current={enter,jump,fire,reset,build,edit,dash,aim,keyboard:()=>{if(!replay){start();updateHud();}},align:()=>{
      if(replay||finished||(roof&&requiredSpinDegrees>0))return; start();
      const direction=targetPosition.clone().sub(new THREE.Vector3(x,y,z)).normalize();
      yaw=Math.atan2(-direction.x,-direction.z);pitch=Math.asin(direction.y);message='Practice aim aligned. Complete the required movement and fire.';updateHud();
    }};
    function keydown(e:KeyboardEvent){if(replay)return;const active=document.activeElement;const locked=document.pointerLockElement===renderer.domElement;if(!locked&&active!==arena.current&&active!==renderer.domElement)return;if((e.target as HTMLElement)?.closest('input,textarea,select,button,a'))return;
      if(['Space','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyF','KeyR','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyB','KeyG','KeyX','KeyC'].includes(e.code))e.preventDefault();
      keys.add(e.code);if(e.repeat)return;if(e.code==='Space')jump();if(e.code==='KeyF')fire();if(e.code==='KeyR')reset();if(e.code==='KeyB')build();if(e.code==='KeyG')edit();if(e.code==='KeyX')dash();if(e.code==='KeyC')aim();}
    function keyup(e:KeyboardEvent){keys.delete(e.code);}
    function mousemove(e:MouseEvent){if(replay||finished||document.pointerLockElement!==renderer.domElement)return;const sensitivity=ads ? .0012 : .0028;yaw-=e.movementX*sensitivity;pitch=THREE.MathUtils.clamp(pitch-e.movementY*sensitivity,-1.35,1.35);}
    function click(){if(replay)return;if(document.pointerLockElement!==renderer.domElement){enter();return;}fire();}
    function blur(){keys.clear();}
    function resize(){const w=container!.clientWidth,h=container!.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();}
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('mousemove',mousemove);window.addEventListener('blur',blur);renderer.domElement.addEventListener('click',click);
    reset();
    if(replay){ready=true;started=performance.now();message='Recorded attempt';updateHud();}
    function animate(now:number){if(disposed)return;raf=requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.04);last=now;
      if(replay){
        const t=now-started;const data=replay.frames;
        if(data.length){let i=0;while(i<data.length-2&&data[i+1].t<t)i++;const a=data[i],b=data[Math.min(i+1,data.length-1)];const f=b.t===a.t?0:THREE.MathUtils.clamp((t-a.t)/(b.t-a.t),0,1);x=THREE.MathUtils.lerp(a.x,b.x,f);y=THREE.MathUtils.lerp(a.y,b.y,f);z=THREE.MathUtils.lerp(a.z,b.z,f);yaw=THREE.MathUtils.lerp(a.yaw,b.yaw,f);pitch=THREE.MathUtils.lerp(a.pitch,b.pitch,f);const frame=t>=b.t?b:a;showBuild(frame.builds??0,frame.edited===true);}
        if(!replayShotShown&&t>=replay.shotTimeMs){replayShotShown=true;if(replay.targetHit)target.material=blue;message=replay.success?'SHOT LANDED.':'RUN IT BACK.';updateHud();}
        if(!replayEnded&&t>Math.max(replay.durationMs,data[data.length-1]?.t??0)+1100){replayEnded=true;callbacks.current.onReplayEnd?.();}
      }else if(ready&&!finished){
        if(keys.has('KeyQ')||keys.has('ArrowLeft'))yaw+=5.9*dt;
        if(keys.has('KeyE')||keys.has('ArrowRight'))yaw-=5.9*dt;
        if(keys.has('ArrowUp'))pitch=THREE.MathUtils.clamp(pitch+1.1*dt,-1.35,1.35);
        if(keys.has('ArrowDown'))pitch=THREE.MathUtils.clamp(pitch-1.1*dt,-1.35,1.35);
        const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
        const side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
        const pace=3.3/Math.max(1,Math.hypot(forward,side));
        const step=Math.min(dashLeft,13*dt);
        const dx=step||(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*pace*dt;
        const dz=step?0:(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*pace*dt;
        const previousX=x,previousZ=z;
        const solids=[...staticCover,...wallSolids()];
        function canMove(nx:number,nz:number){
          if(!roof&&(Math.abs(nx)>(tactical?8:10)||nz>8||nz< -30))return false;
          const body=new THREE.Box3(new THREE.Vector3(nx-.24,y-1.7,nz-.24),new THREE.Vector3(nx+.24,y+.12,nz+.24));
          return !solids.some(bounds=>bounds.intersectsBox(body));
        }
        if(canMove(x+dx,z))x+=dx;
        if(canMove(x,z+dz))z+=dz;
        speed=dt>0?Math.hypot(x-previousX,z-previousZ)/dt:0;
        if(step){
          dashLeft=Math.max(0,dashLeft-step);
          if(x>=-1.4&&!covered())dashCleared=true;
          if(x===previousX||dashLeft<.00001){
            dashLeft=0;
            if(dashCleared&&x>=-1.4&&!covered()){dashes=1;record(now);}
            message=dashes?'Dash cleared. Stop and fire.':'Dash blocked. Return behind cover.';
          }
        }
        const floor=1.7+rampHeight();
        const onFloor=!roof||(Math.abs(x)<7&&Math.abs(z)<6);
        if(air){
          vy-=GRAVITY*dt;y+=vy*dt;
          if(onFloor&&y<=floor&&vy<0){
            y=floor;vy=0;air=false;hasJumped=false;rampTakeoff=false;message='Landed. '+objective;
          }
        }else if(!onFloor||y-floor>.15){air=true;vy=0;}
        else y=floor;
        if(y< -8||now-started>59000){reset();message='Fresh attempt. '+objective;}
        else if(firePending){firePending=false;finishShot(now);}
        else if(now-started-lastRecord>=33)record(now);
        if(now-lastHud>100){updateHud();lastHud=now;}
      }
      camera.position.set(x,y,z);camera.rotation.set(pitch,yaw,0,'YXZ');
      weapon.position.y=air?Math.sin(now*.008)*.008:0;
      const fov=ads?40:68;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}weapon.position.x=ads?-.22:0;
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(animate);
    return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('mousemove',mousemove);window.removeEventListener('blur',blur);renderer.domElement.removeEventListener('click',click);if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());environment.dispose();renderer.dispose();renderer.domElement.remove();actions.current=undefined;};
  },[arenaId,templateId,targetDistance,requiredSpinDegrees,referenceClipId,replay?.id]);

  return <section className="game-arena" ref={arena} tabIndex={replay?-1:0} aria-label={replay?'Recorded attempt replay':`${location} challenge`}>
    <div className="game-viewport" ref={mount}/>
    {error?<div className="game-error">{error}</div>:<>
      <div className="game-top"><span className="game-location">{location}</span><span className="game-live">{replay?'● REPLAY':'● PRACTICE ARENA'}</span></div>
      <div className="game-crosshair" aria-hidden="true"><i/><i/></div>
      <div className="game-objective"><span className="game-kicker">THE SHOT</span><strong>{objective}</strong><span>{config.targetDistance}m target · {replay?'Recorded gameplay':'One shot per attempt'}</span></div>
      {!replay&&<div className="game-telemetry">
        {tactical?<span>{dashPeek?(hud.dashes?'Dash cleared':'Dash from cover'):'Stand still to shoot'}</span>:<span className={hud.air?'is-met':''}>{hud.air?'Airborne':'Get airborne'}</span>}
        {buildyard&&<span>{hud.edited?'Wall edited':hud.builds?'Build placed':'Place build'}</span>}
        {roof&&requiredSpinDegrees>0&&<span>{hud.spin}° / {requiredSpinDegrees}°</span>}
      </div>}
      {!hud.ready&&!replay&&<div className="game-start"><button onClick={()=>actions.current?.enter()}>ENTER THE ARENA <span>↗</span></button><button className="game-keyboard-start" onClick={()=>actions.current?.keyboard()}>KEYBOARD START</button><p>Mouse mode captures your cursor. Esc releases it.</p></div>}
      <div className="game-bottom"><p role="status">{hud.message}</p>{!replay&&<><div className="game-action-buttons">{!tactical&&<button disabled={hud.air||hud.finished} onClick={()=>actions.current?.jump()}>↑ JUMP <kbd>SPACE</kbd></button>}{buildyard&&<button disabled={!!hud.builds||hud.finished} onClick={()=>actions.current?.build()}>Build {wallEdit?'wall':'ramp'} <kbd>B</kbd></button>}
{wallEdit&&<button disabled={!hud.builds||hud.edited||hud.finished} onClick={()=>actions.current?.edit()}>Edit wall <kbd>G</kbd></button>}
{dashPeek&&<button disabled={!!hud.dashes||hud.finished} onClick={()=>actions.current?.dash()}>Dash <kbd>X</kbd></button>}
<button aria-pressed={hud.ads} disabled={hud.finished} onClick={()=>actions.current?.aim()}>Aim down sights <kbd>C</kbd></button>
{(!roof||requiredSpinDegrees===0)&&<button disabled={hud.finished} onClick={()=>actions.current?.align()}>ALIGN AIM <kbd>PRACTICE ASSIST</kbd></button>}<button disabled={!hud.ready||hud.finished} onClick={()=>actions.current?.fire()}>⌖ FIRE <kbd>F</kbd></button><button onClick={()=>{actions.current?.reset();arena.current?.focus({preventScroll:true})}}>↻ RETRY <kbd>R</kbd></button></div><div className="game-controls"><span><kbd>WASD</kbd> move</span><span><kbd>Q / E</kbd> spin</span><span><kbd>↑ / ↓</kbd> aim</span><span>Click arena for mouse aim · Esc releases</span></div></>}</div>
    </>}
  </section>;
}
