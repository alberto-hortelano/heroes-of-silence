/**
 * Las poses de arco del Y Bot: movimiento de articulaciones escrito a mano sobre
 * el rig, no un clip de arco descargado (Mixamo no tiene uno con este set). Se
 * inyecta en la copia temporal de `page.mjs` que monta `poses.ts`; el
 * renderizador original no se toca.
 *
 * Rescatado de `tools/art/ybot-ranged-poses.mjs` de la rama `archivo/gpt-rpg`:
 * el arco (tensar y soltar) y la ballesta (encarar y disparar), que es también
 * la pose del arcabuz y de la culebrina de mano. Sus tablas de seis poses son
 * hoy `CURVAS_DEL_DISPARO`. La granada (04-10-2026) es nueva: armar el brazo por
 * encima del hombro y lanzar.
 */
import { runInNewContext } from 'node:vm';

/**
 * Cuánto se tensa el arco (o se sube la ballesta) en cada nudo del disparo,
 * repartidos a la par de 0 a 1 en el progreso del clip. Son las tablas de seis
 * poses del rig de origen; entre nudos se interpola en línea recta.
 */
export const CURVAS_DEL_DISPARO = {
  bow: [0, 0.45, 1, 1, 0.65, 0],
  crossbow: [0, 0.7, 1, 1, 0.55, 0],
  // Armar el brazo detrás de la cabeza, soltar en lo más alto y acompañar el
  // tiro hacia delante y abajo mientras la curva vuelve a 0.
  grenade: [0, 0.6, 1, 1, 0.6, 0],
  // La pistola del jinete (`tools/art/montura/escena.js`): extender el brazo,
  // disparar y bajarla con el culatazo.
  pistol: [0, 0.8, 1, 1, 0.5, 0],
} as const;

/** Los clips de ataque que son un disparo: los que tienen curva. */
export type ClipDeDisparo = keyof typeof CURVAS_DEL_DISPARO;

export function esDisparo(clip: string): clip is ClipDeDisparo {
  return Object.hasOwn(CURVAS_DEL_DISPARO, clip);
}

/**
 * La curva del disparo, sin THREE: depende del PROGRESO del clip, de 0 a 1, y
 * no del índice del fotograma, así que vale igual a 6 fotogramas y a 12.
 *
 * La suelta no es una cifra aparte: es el último nudo en lo más alto de la
 * curva, donde empieza a aflojar. Así `cuerdaTensa` y la curva no pueden
 * separarse. Los nudos se calculan como `i / (n − 1)`, que da el mismo double
 * que escribir 0,2, 0,4… a mano: los píxeles no dependen de cómo se escriban.
 *
 * Es texto porque corre en la página de sprite-forge; `DISPARO_EN_NODE` evalúa
 * este mismo texto, no una copia.
 */
export const CURVA_DEL_DISPARO = `
const CURVAS_DEL_DISPARO = ${JSON.stringify(CURVAS_DEL_DISPARO)};
function ordenadasDelDisparo(kind) {
  const c = CURVAS_DEL_DISPARO[kind];
  if (!c) throw new Error('no hay curva de disparo para «' + kind + '»');
  return c;
}
function progresoDelDisparo(f, n) {
  return n > 1 ? f / (n - 1) : 0;
}
function curvaDelDisparo(kind, p) {
  const c = ordenadasDelDisparo(kind);
  if (!(p >= 0 && p <= 1)) throw new Error('el progreso del disparo va de 0 a 1, no ' + p);
  const ultimo = c.length - 1;
  // El primer tramo con p por debajo de su final: en un nudo da su valor exacto.
  for (let i = 0; i < ultimo; i += 1) {
    const x0 = i / ultimo, x1 = (i + 1) / ultimo;
    if (p < x1) return c[i] + ((c[i + 1] - c[i]) * (p - x0)) / (x1 - x0);
  }
  return c[ultimo];
}
function sueltaDelDisparo(kind) {
  const c = ordenadasDelDisparo(kind);
  return c.lastIndexOf(Math.max(...c)) / (c.length - 1);
}
function cuerdaTensa(kind, p) {
  return p <= sueltaDelDisparo(kind);
}
`;

/** La curva del disparo evaluada en Node: el mismo texto que corre en la página. */
export const DISPARO_EN_NODE: {
  progresoDelDisparo(f: number, n: number): number;
  curvaDelDisparo(kind: string, p: number): number;
  sueltaDelDisparo(kind: string): number;
  cuerdaTensa(kind: string, p: number): boolean;
} = runInNewContext(
  `${CURVA_DEL_DISPARO}; ({ progresoDelDisparo, curvaDelDisparo, sueltaDelDisparo, cuerdaTensa })`,
);

export const POSE_A_DISTANCIA = `${CURVA_DEL_DISPARO}
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
// \`tension\`: lo que da la curva del disparo en este fotograma, de 0 a 1;
// \`tensa\`: si aún no ha soltado. Solo la granada lo usa: antes de soltar la
// curva arma el brazo hacia atrás, y después lo lleva hacia delante.
function rangedPose(model, kind, tension, tensa) {
  if (kind === 'bow') {
    poseArm(model,'Left',new THREE.Vector3(.12,1.22+tension*.18,.40+tension*.20),new THREE.Vector3(.5,-1,0));
    poseArm(model,'Right',new THREE.Vector3(-.06,1.20+tension*.24,.38-tension*.28),new THREE.Vector3(-1,.15,0));
  } else if (kind === 'crossbow') {
    poseArm(model,'Left',new THREE.Vector3(.10,1.02+tension*.25,.43),new THREE.Vector3(.5,-1,0));
    poseArm(model,'Right',new THREE.Vector3(-.10,1.00+tension*.23,.24),new THREE.Vector3(-.5,-1,0));
  } else if (kind === 'grenade') {
    const mezcla = (a, b, t) => new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    // La izquierda apunta al blanco con el brazo alzado en lo más alto del tiro.
    const apunta = [0.16, 1.4, 0.5];
    if (tensa) {
      poseArm(model,'Left',mezcla([0.2,1.05,0.25],apunta,tension),new THREE.Vector3(.5,-1,0));
      poseArm(model,'Right',mezcla([-0.22,1.05,0.22],[-0.26,1.62,-0.24],tension),new THREE.Vector3(-1,-.5,.2));
    } else {
      poseArm(model,'Left',mezcla([0.25,0.98,0.1],apunta,tension),new THREE.Vector3(.5,-1,0));
      poseArm(model,'Right',mezcla([0.06,0.95,0.42],[-0.14,1.56,0.46],tension),new THREE.Vector3(-.5,-1,0));
    }
  } else {
    throw new Error('no sé disparar «' + kind + '»: solo bow, crossbow y grenade');
  }
}
`;
