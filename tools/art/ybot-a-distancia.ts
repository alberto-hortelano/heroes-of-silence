/**
 * Las poses de arco del Y Bot: movimiento de articulaciones escrito a mano sobre
 * el rig, no un clip de arco descargado (Mixamo no tiene uno con este set). Se
 * inyecta en la copia temporal de `page.mjs` que monta `poses.ts`; el
 * renderizador original no se toca.
 *
 * Rescatado de `tools/art/ybot-ranged-poses.mjs` de la rama `archivo/gpt-rpg`:
 * el arco (tensar y soltar) y la ballesta (encarar y disparar), que es también
 * la pose del arcabuz y de la culebrina de mano. Sus tablas de seis poses son
 * hoy `CURVAS_DEL_DISPARO`. La granada (04-10-2026) es nueva: armar el brazo
 * izquierdo por encima del hombro y lanzar, con el sable bajo en la derecha.
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
// La postura del clip en espejo de izquierda a derecha: cada hueso toma el giro
// de su gemelo reflejado. Se refleja el giro de cada hueso respecto del reposo
// (la T, simétrica), en el mundo, para no depender de cómo orientó Mixamo los
// ejes locales de cada lado.
//
// Reflejar en el plano x = 0 del modelo refleja también hacia dónde mira: el
// clip mira a −56° (de lado, como el reposo y el ataque de la hoja A y la B) y
// en espejo miraría a +56°, 112° girado, y al pasar del reposo al tiro el
// granadero daba media vuelta (31-10-2026). Así que el cuerpo entero se gira
// después alrededor de la vertical de las caderas hasta mirar donde el clip:
// es un espejo en su propio plano de simetría, el de las caderas del clip.
//
// Se calcula una vez por modelo y se guarda: \`mixer.setTime(0)\` no vuelve a
// escribir un hueso cuyo valor no cambió desde la última vez (PropertyMixer),
// así que en el fotograma siguiente la postura ya estaría en espejo y
// reflejarla otra vez la devolvería a la del clip.
function espejarPostura(model) {
  const guardada=model.userData.posturaEnEspejo;
  if (guardada) {
    for (const [h,q] of guardada.giros) h.quaternion.copy(q);
    guardada.caderas.position.copy(guardada.posicion);
    model.updateWorldMatrix(true,true);
    return;
  }
  model.updateWorldMatrix(true,true);
  // El reposo de cada hueso, de la malla que lo ata (el Y Bot lleva dos, y cada
  // esqueleto solo los huesos que la mueven), en el mundo de hoy: la malla se
  // movió desde que se ató.
  const reposo=new Map();
  const m=new THREE.Matrix4(), p=new THREE.Vector3(), e=new THREE.Vector3();
  model.traverse((malla)=>{
    if (!malla.isSkinnedMesh) return;
    const desdeElAtado=malla.matrixWorld.clone().multiply(malla.bindMatrix.clone().invert());
    malla.skeleton.bones.forEach((h,i)=>{
      if (reposo.has(h)) return;
      const q=new THREE.Quaternion();
      m.copy(malla.skeleton.boneInverses[i]).invert().premultiply(desdeElAtado).decompose(p,q,e);
      reposo.set(h,q);
    });
  });
  const huesos=[]; model.traverse((h)=>{ if (reposo.has(h)) huesos.push(h); });
  const porNombre=new Map(huesos.map((h)=>[h.name,h]));
  const delta=new Map(huesos.map((h)=>[h,h.getWorldQuaternion(new THREE.Quaternion()).multiply(reposo.get(h).clone().invert())]));
  const gemelo=(h)=>{
    const n=h.name.includes('Left')?h.name.replace('Left','Right'):h.name.replace('Right','Left');
    const g=porNombre.get(n);
    if (!g) throw new Error('espejarPostura: «'+h.name+'» no tiene gemelo «'+n+'»');
    return g;
  };
  // Hacia dónde miran las caderas del clip (en el suelo, de la derecha a la
  // izquierda girado un cuarto): en espejo miraría a (−x, z); el giro que lo
  // devuelve es el doble de su rumbo.
  const piernaIzquierda=model.getObjectByName('mixamorigLeftUpLeg').getWorldPosition(new THREE.Vector3());
  const piernaDerecha=model.getObjectByName('mixamorigRightUpLeg').getWorldPosition(new THREE.Vector3());
  const lado=piernaIzquierda.sub(piernaDerecha);
  const rumbo=Math.atan2(-lado.z, lado.x);
  const vuelta=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),2*rumbo);
  const mundo=new Map();
  for (const h of huesos) {
    const d=delta.get(gemelo(h));
    mundo.set(h,vuelta.clone().multiply(new THREE.Quaternion(d.x,-d.y,-d.z,d.w)).multiply(reposo.get(h)));
  }
  // Las caderas se quedan donde están: el giro es alrededor de su vertical.
  const caderas=model.getObjectByName('mixamorigHips');
  const enMundo=caderas.getWorldPosition(new THREE.Vector3());
  // En orden de la jerarquía: el padre ya tiene su giro nuevo. Lo que no ata
  // ninguna malla (las puntas, HeadTop_End…) conserva su giro local.
  for (const h of huesos) {
    const padre=mundo.get(h.parent)??h.parent.getWorldQuaternion(new THREE.Quaternion());
    h.quaternion.copy(padre.clone().invert().multiply(mundo.get(h)));
  }
  caderas.parent.updateWorldMatrix(true,false);
  caderas.position.copy(caderas.parent.worldToLocal(enMundo));
  model.updateWorldMatrix(true,true);
  model.userData.posturaEnEspejo={
    giros: huesos.map((h)=>[h,h.quaternion.clone()]),
    caderas,
    posicion: caderas.position.clone(),
  };
}
// Gira las caderas un ángulo alrededor del eje vertical del mundo sin mover
// las piernas: los muslos conservan su giro en el mundo.
function girarCaderas(model, angulo) {
  const caderas=model.getObjectByName('mixamorigHips');
  const muslos=['Left','Right'].map((l)=>model.getObjectByName('mixamorig'+l+'UpLeg'));
  model.updateWorldMatrix(true,true);
  const antes=muslos.map((m)=>m.getWorldQuaternion(new THREE.Quaternion()));
  const giro=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angulo);
  const padre=caderas.parent.getWorldQuaternion(new THREE.Quaternion());
  const mundo=giro.multiply(caderas.getWorldQuaternion(new THREE.Quaternion()));
  caderas.quaternion.copy(padre.invert().multiply(mundo));
  muslos.forEach((m,i)=>m.quaternion.copy(mundo.clone().invert().multiply(antes[i])));
  model.updateWorldMatrix(true,true);
}
// El marco del cuerpo en este fotograma: el origen bajo las caderas (en el
// suelo del modelo, la altura va tal cual), \`lado\` hacia su izquierda (de la
// cadera derecha a la izquierda) y \`delante\` hacia donde miran las caderas.
// \`punto\` lleva [lado, alto, delante] al mundo; \`rumbo\`, una dirección.
function marcoDelCuerpo(model) {
  model.updateWorldMatrix(true,true);
  const pos=(n)=>model.getObjectByName('mixamorig'+n).getWorldPosition(new THREE.Vector3());
  const lado=pos('LeftUpLeg').sub(pos('RightUpLeg')).setY(0).normalize();
  const delante=new THREE.Vector3(-lado.z,0,lado.x);
  const caderas=pos('Hips');
  const rumbo=([l,a,d])=>lado.clone().multiplyScalar(l).add(delante.clone().multiplyScalar(d)).setY(a);
  return {
    rumbo,
    punto: (v)=>rumbo(v).add(new THREE.Vector3(caderas.x,0,caderas.z)),
  };
}
// Gira el tronco (Spine1) un ángulo alrededor del eje vertical del mundo.
function torcerTronco(model, angulo) {
  const tronco=model.getObjectByName('mixamorigSpine1');
  tronco.updateWorldMatrix(true,false);
  const giro=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angulo);
  const padre=tronco.parent.getWorldQuaternion(new THREE.Quaternion());
  const mundo=tronco.getWorldQuaternion(new THREE.Quaternion());
  tronco.quaternion.copy(padre.invert().multiply(giro.multiply(mundo)));
  model.updateWorldMatrix(true,true);
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
    // El clip de la postura (\`attack (4)\`) es de diestro; para lanzar con la
    // IZQUIERDA va en espejo, mirando adonde mira el clip (el reposo y el
    // ataque): ver \`espejarPostura\`.
    espejarPostura(model);
    const bezier = (a, c, b, t) => a.map((x, i) => (1 - t) * (1 - t) * x + 2 * t * (1 - t) * c[i] + t * t * b[i]);
    const mezcla = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
    // La IZQUIERDA lleva la granada (31-10-2026) y tira hacia donde mira el
    // cuerpo. Todo va en el MARCO DEL CUERPO (\`marcoDelCuerpo\`): [lado, alto,
    // delante] en metros, lado hacia su izquierda y delante hacia donde miran
    // sus caderas en este fotograma; el clip no mira a +z del modelo sino a
    // −56°, y con las cifras en el modelo el tiro salía de lado.
    //
    // Antes de soltar, \`tension\` va de 0 a 1: de la guardia (la granada a la
    // vista, junto a la cadera y algo delante) baja hacia atrás y sube a armar,
    // el codo atrás y la mano detrás del lado izquierdo de la cabeza; en línea
    // recta, a media curva la mano rozaba el hombro y el brazo se plegaba.
    // Después, \`suelta\` va de 1 (la primera columna tras soltar) a 0: el
    // brazo estirado delante y arriba, y de ahí abajo y cruzado hacia la cadera
    // derecha. Con la suelta en su propia pose la columna 4 no se queda
    // plegada sobre la cabeza.
    const guardia = [0.28, 0.98, 0.12], atras = [0.3, 0.98, -0.45], armada = [0.2, 1.6, -0.3];
    const arranque = [0.18, 1.72, 0.05], estirada = [0.1, 1.62, 0.62], fin = [-0.15, 0.95, 0.3];
    const suelta = tensa ? 1 : Math.min(1, tension / 0.85) ** 1.5;
    // Caderas y tronco giran con el tiro (radianes sobre la vertical; positivo,
    // el hombro izquierdo atrás): arman hacia atrás y se desenroscan hacia
    // delante al soltar. Los pies no se mueven: solo los muslos siguen a las
    // caderas.
    const giro = (armado, final) => (tensa ? armado * tension : final * (1 - 0.6 * suelta));
    girarCaderas(model, giro(0.26, -0.2));
    torcerTronco(model, giro(0.4, -0.15));
    const cuerpo = marcoDelCuerpo(model);
    // La derecha lleva el sable bajo, a su lado, lejos del tiro.
    poseArm(model,'Right',cuerpo.punto([-0.4,0.92,0.12]),cuerpo.rumbo([-1,-.6,0]));
    if (tensa) {
      // Arma del todo en la columna 2 (\`tension\` 0,87) y en la 3 (1) ya
      // arranca: el codo sale a su lado y la mano, aún detrás de la cabeza,
      // sube y viene algo hacia delante. Con las dos columnas quietas, la mano
      // saltaba de detrás de la cabeza a estirada delante en una.
      const armado = Math.min(1, tension / 0.87), arranca = Math.max(0, (tension - 0.87) / 0.13);
      const mano = mezcla(bezier(guardia,atras,armada,armado),arranque,arranca);
      poseArm(model,'Left',cuerpo.punto(mano),cuerpo.rumbo(mezcla([.5,-.2,-1],[1,-.1,.2],arranca)));
    } else {
      poseArm(model,'Left',cuerpo.punto(mezcla(fin,estirada,suelta)),cuerpo.rumbo([.3,-1,0]));
    }
  } else {
    throw new Error('no sé disparar «' + kind + '»: solo bow, crossbow y grenade');
  }
}
`;
