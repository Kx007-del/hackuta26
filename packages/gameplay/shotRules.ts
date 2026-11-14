import * as THREE from 'three';

export const TARGET_HEIGHT=3.2;
export const TARGET_RADIUS=1.65;
export const JUMP_SPEED=7.8;
export const GRAVITY=9.8;
export const netSpinDegrees=(yaw:number,takeoffYaw:number)=>Math.abs(yaw-takeoffYaw)*180/Math.PI;

/** Same geometric and movement rules used by live gameplay, isolated for verification. */
export function evaluateShot(input:{x:number;y:number;z:number;yaw:number;pitch:number;targetDistance:number;airborne:boolean;hasJumped:boolean;takeoffYaw:number;requiredSpinDegrees:number}){
  const direction=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(input.pitch,input.yaw,0,'YXZ')).normalize();
  const ray=new THREE.Ray(new THREE.Vector3(input.x,input.y,input.z),direction);
  const targetHit=ray.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0,TARGET_HEIGHT,-input.targetDistance),TARGET_RADIUS));
  const rotationDegrees=netSpinDegrees(input.yaw,input.takeoffYaw);
  return{targetHit,rotationDegrees,success:targetHit&&input.airborne&&input.hasJumped&&rotationDegrees>=input.requiredSpinDegrees};
}
