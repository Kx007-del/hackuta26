Chunk 1/3 · packages/gameplay/GameArena.tsx only. Apply the three chunks to the supplied file in order. Keep Props, renderer setup, lights, material and geometry tracking, weapon, resize and listeners. Add imports `import {ARENAS} from '../../shared/contracts';`, `import {createEnvironment} from './environments';`, and replace TARGET_HEIGHT/TARGET_RADIUS in the shotRules import with targetForArena. Treat environment blockers as Box3 below. If the helper stores meshes, normalize once at creation with `new THREE.Box3().setFromObject(mesh)` after world matrices update.

After callbacks.current, add:
```
  const playConfig=replay?.config??config;
  const {arenaId,templateId,targetDistance,requiredSpinDegrees,referenceClipId}=playConfig;
  const location=ARENAS.find(item=>item.id===arenaId)?.title??'ROOFTOP';
  const roof=arenaId==='rooftop-v1', buildyard=arenaId==='buildyard-v1';
  const tactical=arenaId==='tactical-v1', wallEdit=templateId==='wall-edit', dashPeek=templateId==='dash-peek';
  const objective=wallEdit?'BUILD. EDIT. JUMP. FIRE.':buildyard?'BUILD A RAMP. JUMP. FIRE.':dashPeek?'DASH OUT. STOP. FIRE.':tactical?'STOP. AIM. FIRE.':requiredSpinDegrees?`${requiredSpinDegrees}° AIRBORNE SHOT`:'JUMP. AIM. LAND IT.';
```
Extend `Hud` with `builds:number; edited:boolean; dashes:number; ads:boolean`, initialize each to zero/false and set initial message to `objective`. Add `build`, `edit`, `dash`, and `aim`, each `()=>void`, to the actions ref type.

Inside effect, replace from the first hardcoded rooftop box through the target-position declaration with:
```
    const environment=createEnvironment(scene,arenaId,targetDistance);
    const {height,radius}=targetForArena(arenaId);
    const targetPosition=new THREE.Vector3(0,height,-targetDistance);
```
Use `radius` for CircleGeometry and scale the ring/dot radii by `radius/1.65` to retain rooftop appearance. Remove the small box in front of the target. Replace grid cleanup with `environment.dispose()`. Use `environment.blockers` for `staticCover` below. If the environment helper leaves background/fog unchanged, set them by arena immediately after calling it: Buildyard `#b9dded`, fog same color with density `.008`; Courtyard `#d9c6b2`, same fog color with `.01`; retain the rooftop colors.

After weapon setup insert:
```
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
    const staticCover=tactical?environment.blockers:[];
    function showBuild(count:number,opened:boolean){
      structures.visible=buildyard&&count>0;
      platform.visible=!wallEdit;
      wallParts.forEach((part,index)=>{part.visible=wallEdit&&!(opened&&index===3);});
    }
    showBuild(0,false);
```
The platform rises toward the target, with its walkable span z=2 to -2. The edited wall removes its upper middle panel, leaving a shooting opening centered on the target lane. Geometry uses the existing disposal arrays. The tactical spawn in chunk 2 uses the supplied crate at (-4,-5); keep that crate a blocker. For dash-peek, use a fixed sideways dash from behind that cover into the central lane. This gives the keyboard button and onscreen button identical behavior.

Chunk 2/3 · GameArena.tsx. Replace from `const keys` through `actions.current=...` inclusive. Uses only the supplied wire fields. `rotationDegrees` keeps unwrapped yaw displacement from takeoff. Roof proof remains the supplied evaluator's legacy path.
```
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
      shotTime=Math.max(.001,now-started,(frames[frames.length-1]?.t??0)+.001);
      finished=true;frames.push(snapshot(shotTime));if(hit)target.material=blue;updateHud();
      callbacks.current.onComplete({id:crypto.randomUUID(),config:{...config},success,targetHit:hit,airborneAtShot:air,rotationDegrees:spin,durationMs:shotTime,frames:[...frames],shotTimeMs:shotTime,...(roof?{}:{mechanicState})});
      if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
    }
    actions.current={enter,jump,fire,reset,build,edit,dash,aim};
```
Important server consistency issue: wall shots around the panel and ramp shots from a ground jump can be geometric hits and still fail. If normalization currently derives success from hit + counts alone, preserve client-reported failure while validating claimed successes, or explicitly agree how to represent these extra checks. The supplied fields cannot prove an opening crossing or ramp takeoff by themselves. `mechanicState.edited` remains truthful even when the shot misses the opening.

Chunk 3/3 · GameArena.tsx. Add `KeyB`, `KeyG`, `KeyX`, `KeyC` to keydown's prevented controls. Add dispatch `if(e.code==='KeyB')build();if(e.code==='KeyG')edit();if(e.code==='KeyX')dash();if(e.code==='KeyC')aim();`. Set mouse sensitivity to `const sensitivity=ads?.0012:.0028;` and use it for both axes (spell as `ads ? .0012 : .0028` for clarity). Keep click/blur/resizing and frame interpolator. Immediately after interpolation in the replay branch add:
```
        const frame=data.length?data.findLast(item=>item.t<=t)??data[0]:undefined;
        showBuild(frame?.builds??0,frame?.edited===true);
```
Use the existing interpolation loop index instead of `findLast` if the TS lib predates ES2023: inside `if(data.length)` after the lerps, add `const frame=t>=b.t?b:a;showBuild(frame.builds??0,frame.edited===true);`. This preserves discrete wall states and shows the last one at the shot. Dash is present in replay through recorded position. The supplied schema has no ADS field, so replay uses its default FOV. Set replay startup message to `Recorded attempt` and `started=performance.now()` in its startup block.

In the live branch keep keyboard aiming, then replace everything from `const forward` to the branch's closing brace:
```
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
```
Before each renderer.render add `const fov=ads?40:68;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}weapon.position.x=ads?-.22:0;`. Queueing fire to the simulation tick measures actual horizontal speed during the shot, including active dash, instead of a stale keyboard sample. Make click-to-fire use the same queue.

Effect deps use `[arenaId,templateId,targetDistance,requiredSpinDegrees,referenceClipId,replay?.id]`. `finishShot` captures those fields through config, which stays stable by value for a run. In JSX use `${location} challenge` for live aria-label, `{location}` for the location label, `{objective}` in the objective, and `{targetDistance}` for distance. Telemetry can be replaced with:
```
      {!replay&&<div className="game-telemetry">
        {tactical?<span>{dashPeek?(hud.dashes?'Dash cleared':'Dash from cover'):'Stand still to shoot'}</span>:<span className={hud.air?'is-met':''}>{hud.air?'Airborne':'Get airborne'}</span>}
        {buildyard&&<span>{hud.edited?'Wall edited':hud.builds?'Build placed':'Place build'}</span>}
        {roof&&requiredSpinDegrees>0&&<span>{hud.spin}° / {requiredSpinDegrees}°</span>}
      </div>}
```
Replace quick-start button with `<button className="game-keyboard-start" onClick={()=>{arena.current?.focus({preventScroll:true});actions.current?.reset();actions.current?.aim();actions.current?.aim();}}>Keyboard start</button>` only if refactoring to expose a clean keyboard entry: preferred exact change is add `keyboard:()=>void` to the actions ref and add `keyboard:()=>{if(!replay){start();updateHud();}}` to its assignment, then invoke `actions.current?.keyboard()` from the button. Use that direct entry. Hide jump for tactical. Before Fire add:
```
{buildyard&&<button disabled={!!hud.builds||hud.finished} onClick={()=>actions.current?.build()}>Build {wallEdit?'wall':'ramp'} <kbd>B</kbd></button>}
{wallEdit&&<button disabled={!hud.builds||hud.edited||hud.finished} onClick={()=>actions.current?.edit()}>Edit wall <kbd>G</kbd></button>}
{dashPeek&&<button disabled={!!hud.dashes||hud.finished} onClick={()=>actions.current?.dash()}>Dash <kbd>X</kbd></button>}
<button aria-pressed={hud.ads} disabled={hud.finished} onClick={()=>actions.current?.aim()}>Aim down sights <kbd>C</kbd></button>
```
Keep existing Fire and Retry. Label Q/E as turn outside Rooftop. Desktop verification should cover all distances, stock rooftop replays, shot through and around the edited wall, ramp takeoff and ground takeoff, and tactical moving/dashing/stationary shots. If controls overflow, wrap `.game-action-buttons` in its existing gameplay stylesheet. Workbench source was not supplied in these packets, so this handoff contains GameArena changes only.