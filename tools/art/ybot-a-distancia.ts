/**
 * Las poses de arco del Y Bot: movimiento de articulaciones escrito a mano sobre
 * el rig, no un clip de arco descargado (Mixamo no tiene uno con este set). Se
 * inyecta en la copia temporal de `page.mjs` que monta `poses.ts`; el
 * renderizador original no se toca.
 *
 * Rescatado tal cual de `tools/art/ybot-ranged-poses.mjs` de la rama
 * `archivo/gpt-rpg` (solo la rama del arco: la ballesta no tiene unidad hoy).
 */
export const POSE_A_DISTANCIA = `
function turnJoint(bone, child, destination) {
  bone.updateWorldMatrix(true,true);
  const origin=bone.getWorldPosition(new THREE.Vector3());
  const direction=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const desired=destination.clone().sub(origin).normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(direction,desired);
  const parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const worldQ=bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentQ.clone().invert().multiply(delta.multiply(worldQ)));
  bone.updateWorldMatrix(true,true);
}
function poseArm(model, side, target, hint) {
  const upper=model.getObjectByName('mixamorig'+side+'Arm');
  const lower=model.getObjectByName('mixamorig'+side+'ForeArm');
  const hand=model.getObjectByName('mixamorig'+side+'Hand');
  const start=upper.getWorldPosition(new THREE.Vector3());
  const middle=lower.getWorldPosition(new THREE.Vector3());
  const end=hand.getWorldPosition(new THREE.Vector3());
  const a=start.distanceTo(middle),b=middle.distanceTo(end);
  const line=target.clone().sub(start); const distance=Math.min(a+b-.001,Math.max(.01,line.length()));
  line.normalize();
  const bend=hint.clone().sub(line.clone().multiplyScalar(hint.dot(line))).normalize();
  const along=(a*a-b*b+distance*distance)/(2*distance);
  const elbow=start.clone().addScaledVector(line,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));
  turnJoint(upper,lower,elbow); turnJoint(lower,hand,start.clone().addScaledVector(line,distance));
}
function rangedPose(model, kind, frame) {
  const draw=[0,.45,1,1,.65,0][frame%6];
  poseArm(model,'Left',new THREE.Vector3(.12,1.22+draw*.18,.40+draw*.20),new THREE.Vector3(.5,-1,0));
  poseArm(model,'Right',new THREE.Vector3(-.06,1.20+draw*.24,.38-draw*.28),new THREE.Vector3(-1,.15,0));
}
`;
