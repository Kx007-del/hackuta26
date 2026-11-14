import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateShot,GRAVITY,JUMP_SPEED,netSpinDegrees} from './shotRules';

const base={x:0,y:1.7,z:3,yaw:0,pitch:0,targetDistance:14,airborne:true,hasJumped:true,takeoffYaw:0,requiredSpinDegrees:0};

test('novice jump shots can hit through the real ballistic arc at all supported distances',()=>{
  for(const targetDistance of [14,20,26])for(const t of [.03,.2,.5,.8,1.1,1.5]){
    const y=1.7+JUMP_SPEED*t-.5*GRAVITY*t*t;
    assert.equal(evaluateShot({...base,y,targetDistance}).success,true,`distance ${targetDistance}, flight ${t}s`);
  }
});
test('grounded shots and falls without a jump cannot prove a challenge',()=>{
  assert.equal(evaluateShot({...base,airborne:false}).success,false);
  assert.equal(evaluateShot({...base,hasJumped:false}).success,false);
});
test('180 and 360 presets are physically reachable before landing',()=>{
  for(const requiredSpinDegrees of [180,360]){
    const takeoffYaw=requiredSpinDegrees===180?Math.PI:0;
    const yaw=2*Math.PI;
    const t=(yaw-takeoffYaw)/5.9;
    assert.ok(t<2*JUMP_SPEED/GRAVITY);
    const y=1.7+JUMP_SPEED*t-.5*GRAVITY*t*t;
    assert.equal(evaluateShot({...base,y,yaw,takeoffYaw,requiredSpinDegrees}).success,true);
  }
});
test('a visible hit with too little net rotation still fails the spin objective',()=>{
  const result=evaluateShot({...base,requiredSpinDegrees:360});
  assert.equal(result.targetHit,true);
  assert.equal(result.success,false);
});
test('turning back and forth cannot accumulate a full spin',()=>{
  assert.equal(netSpinDegrees(.1,0),.1*180/Math.PI);
  assert.ok(netSpinDegrees(.1,0)<360);
});
test('a wrong heading or pitch misses despite meeting movement requirements',()=>{
  assert.equal(evaluateShot({...base,yaw:Math.PI}).targetHit,false);
  assert.equal(evaluateShot({...base,pitch:1}).targetHit,false);
});
