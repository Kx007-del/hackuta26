import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import type {ChallengeConfig, AttemptResult, ReplayFrame} from '../../shared/contracts';
import './gameplay.css';
import {evaluateShot,netSpinDegrees,TARGET_HEIGHT,TARGET_RADIUS,JUMP_SPEED,GRAVITY} from './shotRules';

type Props = {config:ChallengeConfig; onComplete:(r:AttemptResult)=>void; replay?:AttemptResult; onReplayEnd?:()=>void};
type Hud = {air:boolean; spin:number; message:string; ready:boolean; finished:boolean};

export default function GameArena({config,onComplete,replay,onReplayEnd}:Props){
  const mount=useRef<HTMLDivElement>(null);
  const arena=useRef<HTMLElement>(null);
  const actions=useRef<{enter:()=>void;jump:()=>void;fire:()=>void;reset:()=>void}|undefined>(undefined);
  const callbacks=useRef({onComplete,onReplayEnd});
  callbacks.current={onComplete,onReplayEnd};
  const [hud,setHud]=useState<Hud>({air:false,spin:0,message:'One rooftop. One shot. Your moment.',ready:false,finished:false});
  const [error,setError]=useState('');

  useEffect(()=>{
    const container=mount.current;
    if(!container)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}
    catch{setError('This arena needs a browser with WebGL enabled. Try Chrome or Edge with hardware acceleration.');return;}
    setError('');
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
    box(14,1,12,0,-.5,0,concrete);
    box(14,.08,.10,0,.02,-5.85,red);
    box(.1,.08,12,-6.9,.02,0,blue);box(.1,.08,12,6.9,.02,0,blue);
    const grid=new THREE.GridHelper(14,14,0x56667e,0x354253);grid.position.y=.008;scene.add(grid);
    // Fixed procedural skyline: decorative geometry never changes challenge rules.
    for(let i=0;i<26;i++){const x=(i%2?1:-1)*(19+(i%5)*7),z=-15-Math.floor(i/2)*7,h=8+(i*13%23);box(5,h,5,x,h/2-14,z,i%3?dark:concrete);box(4,.12,.12,x,h-14+.2,z+2.55,i%2?red:blue);}
    box(4,19,3,0,-8,-config.targetDistance,concrete);
    box(4.3,.16,3.3,0,1.6,-config.targetDistance,dark);
    const targetPosition=new THREE.Vector3(0,TARGET_HEIGHT,-config.targetDistance);
    const targetGeometry=new THREE.CircleGeometry(TARGET_RADIUS,48);geometries.push(targetGeometry);
    const target=new THREE.Mesh(targetGeometry,red);target.position.copy(targetPosition);scene.add(target);
    const innerGeometry=new THREE.RingGeometry(.58,.7,40);geometries.push(innerGeometry);
    const inner=new THREE.Mesh(innerGeometry,white);inner.position.copy(targetPosition);inner.position.z+=.012;scene.add(inner);
    const dotGeometry=new THREE.CircleGeometry(.12,24);geometries.push(dotGeometry);
    const dot=new THREE.Mesh(dotGeometry,white);dot.position.copy(targetPosition);dot.position.z+=.02;scene.add(dot);
    box(.05,.05,.3,0,TARGET_HEIGHT,-config.targetDistance+.08,white);
    // A compact, original weapon silhouette attached to the camera.
    const weapon=new THREE.Group();
    function gunBox(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material){const g=new THREE.BoxGeometry(w,h,d);geometries.push(g);const o=new THREE.Mesh(g,m);o.position.set(x,y,z);weapon.add(o);}
    gunBox(.12,.14,.55,.24,-.22,-.48,dark);gunBox(.045,.045,.55,.24,-.18,-.88,concrete);gunBox(.075,.075,.22,.24,-.11,-.48,red);camera.add(weapon);scene.add(camera);
    const keys=new Set<string>();
    let x=0,y=1.7,z=3,yaw=0,pitch=0,vy=0,air=false,hasJumped=false,takeoffYaw=0,finished=false,ready=false;
    let started=performance.now(),last=started,lastRecord=0,lastHud=0,raf=0,disposed=false,replayEnded=false;
    let frames:ReplayFrame[]=[],shotTime=-1,replayShotShown=false;
    let message='One rooftop. One shot. Your moment.';
    function updateHud(){setHud({air,spin:Math.round(netSpinDegrees(yaw,takeoffYaw)),message,ready,finished});}
    function snapshot(t:number):ReplayFrame{return{t,x,y,z,yaw,pitch};}
    function reset(){if(replay)return;x=0;y=1.7;z=3;vy=0;yaw=config.requiredSpinDegrees===180?Math.PI:0;pitch=0;air=false;hasJumped=false;takeoffYaw=yaw;finished=false;started=performance.now();lastRecord=0;frames=[snapshot(0)];shotTime=-1;target.material=red;message='Jump, line up the target, then fire.';updateHud();}
    function focusArena(){arena.current?.focus({preventScroll:true});}
    function enter(){if(replay)return;ready=true;focusArena();message='Space to jump · Q / E to spin · click or F to fire';updateHud();const promise=renderer.domElement.requestPointerLock?.();if(promise&&typeof promise.catch==='function')promise.catch(()=>{message='Click the arena to aim. Keyboard controls are ready.';updateHud();});}
    function jump(){if(replay||finished||air)return;ready=true;focusArena();started=performance.now();lastRecord=0;frames=[snapshot(0)];shotTime=-1;vy=JUMP_SPEED;air=true;hasJumped=true;takeoffYaw=yaw;message='Make it count. Fire while you are in the air.';updateHud();}
    function fire(){if(replay||finished||!ready)return;
      const now=performance.now();if(now-started>59000){reset();message='Fresh attempt started. Jump and try again.';updateHud();return;}shotTime=Math.max(.001,now-started);
      const evaluated=evaluateShot({x,y,z,yaw,pitch,targetDistance:config.targetDistance,airborne:air,hasJumped,takeoffYaw,requiredSpinDegrees:config.requiredSpinDegrees});
      const hit=evaluated.targetHit,spin=evaluated.rotationDegrees,success=evaluated.success;
      finished=true;frames.push(snapshot(shotTime));
      message=success?'SHOT LANDED. That one is yours.':!air?'Get airborne before you fire.':!hit?'Just missed. Reset and run it back.':`Hit! Add ${Math.ceil(config.requiredSpinDegrees-spin)}° more rotation.`;
      if(hit)target.material=blue;updateHud();
      callbacks.current.onComplete({id:crypto.randomUUID(),config:{...config},success,targetHit:hit,airborneAtShot:air,rotationDegrees:spin,durationMs:shotTime,frames:[...frames],shotTimeMs:shotTime});
      if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
    }
    actions.current={enter,jump,fire,reset};
    function keydown(e:KeyboardEvent){if(replay)return;const active=document.activeElement;const locked=document.pointerLockElement===renderer.domElement;if(!locked&&active!==arena.current&&active!==renderer.domElement)return;if((e.target as HTMLElement)?.closest('input,textarea,select,button,a'))return;
      if(['Space','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyF','KeyR','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
      keys.add(e.code);if(e.repeat)return;if(e.code==='Space')jump();if(e.code==='KeyF')fire();if(e.code==='KeyR')reset();}
    function keyup(e:KeyboardEvent){keys.delete(e.code);}
    function mousemove(e:MouseEvent){if(replay||finished||document.pointerLockElement!==renderer.domElement)return;yaw-=e.movementX*.0028;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0028,-1.35,1.35);}
    function click(){if(replay)return;if(document.pointerLockElement!==renderer.domElement){enter();return;}fire();}
    function blur(){keys.clear();}
    function resize(){const w=container!.clientWidth,h=container!.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();}
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('mousemove',mousemove);window.addEventListener('blur',blur);renderer.domElement.addEventListener('click',click);
    reset();
    if(replay){ready=true;message='Your squad. Their moment.';updateHud();}
    function animate(now:number){if(disposed)return;raf=requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.04);last=now;
      if(replay){
        const t=now-started;const data=replay.frames;
        if(data.length){let i=0;while(i<data.length-2&&data[i+1].t<t)i++;const a=data[i],b=data[Math.min(i+1,data.length-1)];const f=b.t===a.t?0:THREE.MathUtils.clamp((t-a.t)/(b.t-a.t),0,1);x=THREE.MathUtils.lerp(a.x,b.x,f);y=THREE.MathUtils.lerp(a.y,b.y,f);z=THREE.MathUtils.lerp(a.z,b.z,f);yaw=THREE.MathUtils.lerp(a.yaw,b.yaw,f);pitch=THREE.MathUtils.lerp(a.pitch,b.pitch,f);}
        if(!replayShotShown&&t>=replay.shotTimeMs){replayShotShown=true;if(replay.targetHit)target.material=blue;message=replay.success?'SHOT LANDED.':'RUN IT BACK.';updateHud();}
        if(!replayEnded&&t>Math.max(replay.durationMs,data[data.length-1]?.t??0)+1100){replayEnded=true;callbacks.current.onReplayEnd?.();}
      }else if(ready&&!finished){
        if(keys.has('KeyQ')||keys.has('ArrowLeft'))yaw+=5.9*dt;
        if(keys.has('KeyE')||keys.has('ArrowRight'))yaw-=5.9*dt;
        if(keys.has('ArrowUp'))pitch=THREE.MathUtils.clamp(pitch+1.1*dt,-1.35,1.35);
        if(keys.has('ArrowDown'))pitch=THREE.MathUtils.clamp(pitch-1.1*dt,-1.35,1.35);
        const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);const speed=3.3*dt;
        x+=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed;z+=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed;
        if(air){vy-=GRAVITY*dt;y+=vy*dt;if(y<=1.7&&vy<0&&Math.abs(x)<7&&Math.abs(z)<6){y=1.7;vy=0;air=false;hasJumped=false;message='Landed. Jump again or press R for a fresh attempt.';}}
        else if(Math.abs(x)>=7||Math.abs(z)>=6){air=true;vy=0;}
        if(y< -8){reset();message='Watch the edge. Ready for another run.';}
        if(now-started>59000){reset();message='Fresh attempt. Your 60-second run has restarted.';}
        const t=Math.max(0,now-started);if(t-lastRecord>=33&&frames.length<1800){frames.push(snapshot(t));lastRecord=t;}
        if(now-lastHud>100){updateHud();lastHud=now;}
      }
      camera.position.set(x,y,z);camera.rotation.set(pitch,yaw,0,'YXZ');
      weapon.position.y=air?Math.sin(now*.008)*.008:0;
      renderer.render(scene,camera);
    }
    raf=requestAnimationFrame(animate);
    return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('mousemove',mousemove);window.removeEventListener('blur',blur);renderer.domElement.removeEventListener('click',click);if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());grid.geometry.dispose();(grid.material as THREE.Material).dispose();renderer.dispose();renderer.domElement.remove();actions.current=undefined;};
  },[config.arenaId,config.templateId,config.targetDistance,config.requiredSpinDegrees,replay?.id]);

  return <section className="game-arena" ref={arena} tabIndex={replay?-1:0} aria-label={replay?'Recorded attempt replay':'Playable rooftop challenge'}>
    <div className="game-viewport" ref={mount}/>
    {error?<div className="game-error">{error}</div>:<>
      <div className="game-top"><span className="game-location">ROOFTOP / 001</span><span className="game-live">{replay?'● REPLAY':'● PRACTICE ARENA'}</span></div>
      <div className="game-crosshair" aria-hidden="true"><i/><i/></div>
      <div className="game-objective"><span className="game-kicker">THE SHOT</span><strong>{config.requiredSpinDegrees?`${config.requiredSpinDegrees}° AIRBORNE SHOT`:'JUMP. AIM. LAND IT.'}</strong><span>{config.targetDistance}m target · {replay?'Recorded gameplay':'One shot per attempt'}</span></div>
      {!replay&&<div className="game-telemetry"><span className={hud.air?'is-met':''}>{hud.air?'✓ AIRBORNE':'○ GET AIRBORNE'}</span><span className={hud.spin>=config.requiredSpinDegrees?'is-met':''}>{hud.spin}° / {config.requiredSpinDegrees}°</span></div>}
      {!hud.ready&&!replay&&<div className="game-start"><button onClick={()=>actions.current?.enter()}>ENTER THE ARENA <span>↗</span></button><button className="game-keyboard-start" onClick={()=>actions.current?.jump()}>QUICK START: JUMP INTO PRACTICE</button><p>Mouse mode captures your cursor. Esc releases it.</p></div>}
      <div className="game-bottom"><p role="status">{hud.message}</p>{!replay&&<><div className="game-action-buttons"><button disabled={hud.air||hud.finished} onClick={()=>actions.current?.jump()}>↑ JUMP <kbd>SPACE</kbd></button><button disabled={!hud.ready||hud.finished} onClick={()=>actions.current?.fire()}>⌖ FIRE <kbd>F</kbd></button><button onClick={()=>{actions.current?.reset();arena.current?.focus({preventScroll:true})}}>↻ RETRY <kbd>R</kbd></button></div><div className="game-controls"><span><kbd>WASD</kbd> move</span><span><kbd>Q / E</kbd> spin</span><span><kbd>↑ / ↓</kbd> aim</span><span>Click arena for mouse aim · Esc releases</span></div></>}</div>
    </>}
  </section>;
}
