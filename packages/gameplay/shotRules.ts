import * as THREE from 'three';
import {mechanicSatisfied, type ArenaId, type MechanicState, type TemplateId} from '../../shared/contracts';

export const TARGET_HEIGHT=3.2;
export const TARGET_RADIUS=1.65;
export const JUMP_SPEED=7.8;
export const GRAVITY=9.8;
export const netSpinDegrees=(yaw:number,takeoffYaw:number)=>Math.abs(yaw-takeoffYaw)*180/Math.PI;
export function targetForArena(arenaId: ArenaId = 'rooftop-v1') {
  return arenaId === 'tactical-v1' ? {height:1.7,radius:.42} : arenaId === 'buildyard-v1' ? {height:3.2,radius:1.15} : {height:TARGET_HEIGHT,radius:TARGET_RADIUS};
}

/** Same geometric and movement rules used by live gameplay, isolated for verification. */
export function evaluateShot(input:{x:number;y:number;z:number;yaw:number;pitch:number;targetDistance:number;airborne:boolean;hasJumped:boolean;takeoffYaw:number;requiredSpinDegrees:number;arenaId?:ArenaId;templateId?:TemplateId;mechanicState?:MechanicState;obstructed?:boolean}){
  const direction=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(input.pitch,input.yaw,0,'YXZ')).normalize();
  const ray=new THREE.Ray(new THREE.Vector3(input.x,input.y,input.z),direction);
  const target=targetForArena(input.arenaId);
  const targetHit=!input.obstructed&&ray.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0,target.height,-input.targetDistance),target.radius));
  const rotationDegrees=netSpinDegrees(input.yaw,input.takeoffYaw);
  const arenaId=input.arenaId??'rooftop-v1';
  const mechanics=mechanicSatisfied({schemaVersion:1,arenaId,templateId:input.templateId??'jump',targetDistance:input.targetDistance,requiredSpinDegrees:input.requiredSpinDegrees as 0|180|360},input.mechanicState,input.airborne);
  return{targetHit,rotationDegrees,success:targetHit&&mechanics&&(arenaId==='tactical-v1'||input.hasJumped)&&rotationDegrees>=input.requiredSpinDegrees};
}
