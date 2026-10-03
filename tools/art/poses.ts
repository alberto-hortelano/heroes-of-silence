/**
 * Las hojas de REFERENCIA DE POSE: el maniquí Y Bot renderizado por sprite-forge
 * con la cámara del juego (ortográfica, 25° hacia abajo). Es la primera imagen de
 * todo encargo de atlas: manda en la cámara, la anatomía y el movimiento; la
 * identidad del personaje solo pone el aspecto.
 *
 *   npx tsx tools/art/poses.ts espada-escudo
 *   npx tsx tools/art/poses.ts --todos
 *
 * Escribe `assets/unidades/_poses/<perfil>.png` (7 columnas × 3 filas de 256:
 * reposo, marcha y ataque) y su `.json` con la cámara, los clips y los índices.
 *
 * Rescatado de `tools/art/prepare-*.mjs` de la rama `archivo/gpt-rpg`, que eran
 * tres copias del mismo script. sprite-forge solo publica `frontal_8`, así que
 * se copia a un directorio temporal y se le añade `tactical_25` allí: el
 * servicio instalado no se toca. Sin servicios de pago: es render local.
 *
 * Dónde están sprite-forge y los FBX lo dicen `SPRITE_FORGE_DIR` y
 * `SPRITE_FORGE_ASSETS`; por defecto, los repos hermanos de este checkout.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';
import { FIGURA, FIGURA_8D, luzEnElMundo } from '../../src/shared/arte.js';
import { POSE_A_DISTANCIA } from './ybot-a-distancia.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const FORGE = resolve(process.env.SPRITE_FORGE_DIR ?? join(RAIZ, '../sprite-forge'));
const FBX = resolve(process.env.SPRITE_FORGE_ASSETS ?? join(RAIZ, '../ne-fan/assets/characters'));
export const DIR_POSES = join(RAIZ, 'assets/unidades/_poses');

/** El FBX de recibir daño: la fila `hurt` y la pose de la que arranca la muerte. */
const CLIP_DE_DAÑO = 'anims/sword_and_shield/sword and shield impact (3).fbx';

/** Las animaciones que se le añaden al set de sprite-forge, además de las suyas. */
const ANIMS_EXTRA = [
  // Recibir daño: de los tres `impact` del pack, el (3) es el que se lee a 160 px
  // (retrocede girando el torso); el primero es un respingo casi quieto.
  { id: 'impact3', file: CLIP_DE_DAÑO },
  // Los otros reposos del pack, para los juegos de armas a los que la guardia de
  // lado de `idle` no les sirve.
  { id: 'idle2', file: 'anims/sword_and_shield/sword and shield idle (2).fbx' },
  { id: 'idle3', file: 'anims/sword_and_shield/sword and shield idle (3).fbx' },
  { id: 'idle4', file: 'anims/sword_and_shield/sword and shield idle (4).fbx' },
  { id: 'casting', file: 'anims/sword_and_shield/sword and shield casting.fbx' },
  // El arco no tiene clip de Mixamo: el FBX solo da la postura y los brazos los
  // coloca `POSE_A_DISTANCIA` fotograma a fotograma.
  { id: 'bow', file: 'anims/sword_and_shield/sword and shield attack (4).fbx' },
  { id: 'crossbow', file: 'anims/sword_and_shield/sword and shield attack (4).fbx' },
];

/**
 * Un perfil es qué clip de Mixamo hace de ataque. Reposo y marcha son los
 * mismos para todos: misma cámara y misma escala en las tres filas.
 */
export const PERFILES = {
  'espada-escudo': { ataque: 'quick', describe: 'golpe corto de espada con escudo' },
  'dos-manos': { ataque: 'heavy', describe: 'tajo amplio con las dos manos' },
  baston: { ataque: 'casting', describe: 'lanzamiento con el brazo extendido' },
  arco: { ataque: 'bow', describe: 'tensar y soltar un arco' },
  ballesta: {
    ataque: 'crossbow',
    describe:
      'encarar y disparar un arma a la altura del hombro (ballesta, arcabuz o culebrina de mano)',
  },
} as const;
export type Perfil = keyof typeof PERFILES;

/** Fotogramas de un clip renderizado, repartidos en las columnas de la hoja. */
export function indicesDeClip(total: number, columnas: number, enBucle: boolean): number[] {
  if (total <= 0) throw new Error(`un clip sin fotogramas no se puede muestrear (${total})`);
  return Array.from({ length: columnas }, (_, i) =>
    enBucle
      ? Math.floor((i * total) / columnas)
      : Math.round((i * (total - 1)) / Math.max(1, columnas - 1)),
  );
}

function sha256(datos: Buffer | string): string {
  return createHash('sha256').update(datos).digest('hex');
}

/** Cómo se encuadra el render: el alto del encuadre en metros y a qué altura mira. */
interface Encuadre {
  readonly ortho: number;
  /** La altura en metros del punto al que apunta la cámara (sprite-forge usa 0,95). */
  readonly objetivo: number;
}
const ENCUADRE_DE_FIGURA: Encuadre = { ortho: FIGURA.camara.ortho, objetivo: 0.95 };

/**
 * La muerte arranca desde el último fotograma de recibir daño, no desde el
 * reposo: al preparar el clip `death` se carga además el de `hit_react` y se
 * funde de su pose final a la muerte en los primeros `FUNDIDO_MUERTE` segundos.
 */
const FUNDIDO_MUERTE = 0.4;

/**
 * La altura del punto más bajo de la MALLA deformada, en metros: lo que toca el
 * suelo. No vale el hueso más bajo: la punta del pie es un hueso dentro de la
 * bota, y con el pie de puntillas la suela quedaba unos centímetros en el aire.
 */
const PUNTO_MAS_BAJO = `
function puntoMasBajo(model) {
  let y = Infinity;
  const v = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    n.skeleton.update();
    const total = n.geometry.attributes.position.count;
    for (let i = 0; i < total; i += 1) {
      n.getVertexPosition(i, v).applyMatrix4(n.matrixWorld);
      if (v.y < y) y = v.y;
    }
  });
  return y;
}
`;

/**
 * El atrezo del maniquí: una espada (un palo con guarda) en la mano derecha y un
 * escudo de cometa plano en el antebrazo izquierdo. Con el arma dibujada en la
 * referencia, el modelo de imagen copia su largo y su ángulo en vez de
 * inventarlos (como la lanza del jinete en `montura/escena.js`). Gris como el
 * maniquí: dice forma, no aspecto.
 *
 * No se cuelgan del hueso con un giro elegido a ojo (la primera vez salió la
 * hoja por el lado del meñique): se colocan en cada fotograma con la anatomía.
 *  - La espada va por la línea de los nudillos, del meñique al índice, que es el
 *    eje del puño cerrado; la hoja sale por el lado del índice y el pulgar.
 *  - El escudo cuelga por fuera del antebrazo izquierdo, separado de él, con el
 *    antebrazo cruzando su cara interior y la punta hacia abajo.
 */
const ATREZO = `
function crearAtrezo(model, conf) {
  let material = null;
  model.traverse((n) => { if (!material && n.isMesh) material = Array.isArray(n.material) ? n.material[0] : n.material; });
  // Una copia: el del maniquí puede pasar a colores de vértice (las piernas) y
  // el atrezo no los tiene, así que con el mismo material saldría negro.
  material = material.clone();
  const e = conf.espada;
  const espada = new THREE.Group();
  const r = e.grosor ?? 0.022;
  const hoja = new THREE.Mesh(new THREE.CylinderGeometry(r, r, e.largo, 8), material);
  hoja.position.y = e.agarre + e.largo / 2;
  // El orden y las medidas de hoja, guarda y puño son los de las espadas ya
  // aprobadas: cambiarlos movía unos píxeles sus poses.
  const rp = e.grosor === undefined ? 0.02 : Math.max(0.02, r);
  const puño = new THREE.Mesh(new THREE.CylinderGeometry(rp, rp, e.puño, 8), material);
  puño.position.y = e.agarre - e.puño / 2;
  const punta = e.agarre + e.largo;
  if (e.guarda > 0) {
    const guarda = new THREE.Mesh(new THREE.BoxGeometry(e.guarda, 0.03, 0.035), material);
    guarda.position.y = e.agarre;
    espada.add(hoja, guarda, puño);
  } else {
    espada.add(hoja, puño);
  }
  // Una bola en la punta: la cabeza de la maza o la bola del mayal.
  if (e.cabeza) {
    const bola = new THREE.Mesh(new THREE.SphereGeometry(e.cabeza, 12, 8), material);
    bola.position.y = punta;
    espada.add(bola);
  }
  // Un cono: la punta de la lanza.
  if (e.moharra) {
    const cono = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, e.moharra, 8), material);
    cono.position.y = punta + e.moharra / 2;
    espada.add(cono);
  }
  // Una cruz: el remate del bastón y del báculo.
  if (e.remate === 'cruz') {
    const palo = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.035), material);
    palo.position.y = punta + 0.12;
    const brazo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.035), material);
    brazo.position.y = punta + 0.16;
    espada.add(palo, brazo);
  }
  // Un libro en la mano izquierda.
  const libro = conf.libro ? new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.06), material) : null;
  if (!conf.escudo) return { espada, escudo: null, libro };
  const forma = new THREE.Shape();
  forma.moveTo(-0.24, 0.3);
  forma.lineTo(0.24, 0.3);
  forma.lineTo(0.2, -0.05);
  forma.lineTo(0, -0.45);
  forma.lineTo(-0.2, -0.05);
  forma.closePath();
  const escudo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.03, bevelEnabled: false }), material);
  return { espada, escudo, libro };
}
function colocarAtrezo(model, prefijo, atrezo, conf, suelo, aplanar, frente) {
  const p = (nombre) => {
    const h = model.getObjectByName(prefijo + nombre);
    if (!h) throw new Error('el rig no tiene el hueso ' + prefijo + nombre);
    return h.getWorldPosition(new THREE.Vector3());
  };
  // La espada: el puño en el hueco de los dedos, la hoja hacia el índice.
  const indice = p('RightHandIndex1'), meñique = p('RightHandPinky1');
  const eje = indice.clone().sub(meñique).normalize();
  // La hoja (o el asta) no puede cruzar el cuerpo: los clips son de espada y
  // escudo, con la derecha en la cadera, y siguiendo los nudillos una hoja larga
  // atravesaba el torso. Se la inclina hasta un mínimo hacia delante (dos manos,
  // lanza) o hacia arriba (bastón, que va de pie junto al cuerpo).
  const inclinar = (hacia, minimo) => {
    if (!(minimo > 0)) return;
    const d = eje.dot(hacia);
    if (d >= minimo) return;
    const resto = eje.clone().addScaledVector(hacia, -d);
    if (resto.lengthSq() < 1e-6) resto.set(1, 0, 0);
    resto.normalize();
    eje.copy(resto.multiplyScalar(Math.sqrt(1 - minimo * minimo)).addScaledVector(hacia, minimo)).normalize();
  };
  inclinar(frente, conf.adelanteMinimo);
  inclinar(new THREE.Vector3(0, 1, 0), conf.arribaMinimo ?? 0);
  const centro = indice.clone().add(meñique).multiplyScalar(0.5).lerp(p('RightHandMiddle2'), 0.5);
  atrezo.espada.position.copy(centro);
  atrezo.espada.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje);
  // A dos manos las dos manos cogen el puño delante del cuerpo, en el centro:
  // del clip se toman la dirección de la hoja y la altura y el alcance de la
  // mano derecha; se le quita el desvío lateral y se lleva cada mano a su sitio
  // del puño con la IK de dos huesos (la derecha junto a la guarda, la izquierda
  // debajo), con los codos hacia abajo.
  if (conf.dosManos) {
    const pechoD = p('Spine2');
    const lateral = new THREE.Vector3().crossVectors(frente, new THREE.Vector3(0, 1, 0)).normalize();
    const agarre = centro.clone();
    agarre.addScaledVector(lateral, -agarre.clone().sub(pechoD).dot(lateral) * conf.centrado);
    const alcance = agarre.clone().sub(pechoD).dot(frente);
    if (alcance < conf.alcanceMinimo) agarre.addScaledVector(frente, conf.alcanceMinimo - alcance);
    // Que lo alcancen los dos brazos sin estirarse del todo: con el brazo
    // recto el codo cae sobre la línea hombro-mano y no hay arco que formar,
    // y si no llega, la mano se queda corta del puño.
    for (const lado of ['Right', 'Left']) {
      const hombro = p(lado + 'Arm');
      const largo = hombro.distanceTo(p(lado + 'ForeArm')) + p(lado + 'ForeArm').distanceTo(p(lado + 'Hand'));
      const hasta = agarre.clone().sub(hombro);
      const maximo = largo * conf.estiramiento;
      if (hasta.length() > maximo) agarre.copy(hombro).addScaledVector(hasta.normalize(), maximo);
    }
    // Los codos hacia fuera de su lado, abajo y algo adelante: con los dos hacia
    // abajo el brazo derecho se plegaba dentro del pecho, y sin la parte de
    // delante se iba detrás del torso. Hombro y mano no se mueven; solo gira el
    // plano del brazo, que forma un arco.
    const codo = (lado) =>
      new THREE.Vector3(0, -1, 0)
        .addScaledVector(lateral, lado * conf.codosAfuera)
        .addScaledVector(frente, conf.codosAdelante)
        .normalize();
    poseArm(model, 'Right', agarre, codo(1));
    const manoIzquierda = agarre.clone().addScaledVector(eje, -conf.separacionManos);
    poseArm(model, 'Left', manoIzquierda, codo(-1));
    centro.copy(agarre);
    atrezo.espada.position.copy(centro);
  }
  if (atrezo.libro) {
    const mano = model.getObjectByName(prefijo + 'LeftHand');
    atrezo.libro.position.copy(p('LeftHand')).lerp(p('LeftHandMiddle2'), 0.6);
    atrezo.libro.quaternion.copy(mano.getWorldQuaternion(new THREE.Quaternion()));
  }
  if (!atrezo.escudo) return;
  // El escudo: normal hacia fuera del cuerpo, perpendicular al antebrazo.
  const codo = p('LeftForeArm'), muñeca = p('LeftHand'), pecho = p('Spine2');
  const brazo = muñeca.clone().sub(codo).normalize();
  const medio = codo.clone().add(muñeca).multiplyScalar(0.5);
  const fuera = medio.clone().sub(pecho);
  fuera.addScaledVector(brazo, -fuera.dot(brazo)).normalize();
  const arriba = new THREE.Vector3().crossVectors(fuera, brazo).normalize();
  if (arriba.y < 0) arriba.negate();
  const lado = new THREE.Vector3().crossVectors(arriba, fuera).normalize();
  atrezo.escudo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lado, arriba, fuera));
  atrezo.escudo.position.copy(medio).addScaledVector(fuera, 0.07).addScaledVector(arriba, 0.04);
  // Al morir, el escudo se tumba con el cuerpo hasta quedar plano en el suelo,
  // bajo el antebrazo y con la cara hacia arriba.
  if (aplanar > 0) {
    const largo = new THREE.Vector3(arriba.x, 0, arriba.z);
    if (largo.lengthSq() < 1e-6) largo.set(0, 0, 1);
    largo.normalize();
    const cara = new THREE.Vector3(0, 1, 0);
    const ancho = new THREE.Vector3().crossVectors(largo, cara).normalize();
    const plano = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ancho, largo, cara));
    const enSuelo = new THREE.Vector3(medio.x, suelo + 0.005, medio.z);
    atrezo.escudo.quaternion.slerp(plano, aplanar);
    atrezo.escudo.position.lerp(enSuelo, aplanar);
  }
}
`;

/**
 * Las piernas del maniquí en dos colores, para que el modelo de imagen no las
 * confunda en la marcha ni gire la figura de espaldas: la DERECHA roja y la
 * IZQUIERDA azul (lo dice el prompt, y que el personaje no lleva esos colores).
 * Cada vértice toma el color de su hueso dominante; el resto del cuerpo, el gris
 * de siempre.
 */
const PIERNAS = `
function colorearPiernas(model) {
  const rojo = new THREE.Color(0.8, 0.08, 0.06);
  const azul = new THREE.Color(0.08, 0.22, 0.85);
  model.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    const g = n.geometry;
    const indices = g.attributes.skinIndex, pesos = g.attributes.skinWeight;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    const gris = mats[0].color.clone();
    const total = g.attributes.position.count;
    const colores = new Float32Array(total * 3);
    for (let i = 0; i < total; i += 1) {
      let hueso = 0, peso = -1;
      for (let k = 0; k < 4; k += 1) {
        const w = pesos.getComponent(i, k);
        if (w > peso) { peso = w; hueso = indices.getComponent(i, k); }
      }
      const nombre = n.skeleton.bones[hueso]?.name ?? '';
      const c = /Right(UpLeg|Leg|Foot|Toe)/.test(nombre) ? rojo : /Left(UpLeg|Leg|Foot|Toe)/.test(nombre) ? azul : gris;
      colores[i * 3] = c.r; colores[i * 3 + 1] = c.g; colores[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    for (const m of mats) { m.vertexColors = true; m.color.set(0xffffff); m.needsUpdate = true; }
  });
}
`;

async function prepararForge(
  temporal: string,
  encuadre: Encuadre = ENCUADRE_DE_FIGURA,
  atrezo: Atrezo | null = null,
  piernasDeColor = false,
): Promise<void> {
  for (const item of ['src', 'bin', 'sets', 'package.json']) {
    await cp(join(FORGE, item), join(temporal, item), { recursive: true });
  }
  await symlink(join(FORGE, 'node_modules'), join(temporal, 'node_modules'), 'dir');

  const rutaAngulos = join(temporal, 'src/angles.mjs');
  const angulos = await readFile(rutaAngulos, 'utf8');
  for (const esperado of ['frontal_8:', 'pitchDeg: -8.0', 'ortho: 2.4']) {
    if (!angulos.includes(esperado)) {
      throw new Error(`sprite-forge cambió: falta «${esperado}» en angles.mjs. Revisa su cámara.`);
    }
  }
  await writeFile(
    rutaAngulos,
    angulos
      .replace('frontal_8:', 'tactical_25:')
      .replace('pitchDeg: -8.0', `pitchDeg: -${FIGURA.camara.elevacionGrados}.0`)
      .replace('ortho: 2.4', `ortho: ${encuadre.ortho}`)
      .replace(
        'front view, eye-level camera',
        'three-quarter view, camera looking down 25 degrees',
      ),
  );

  const rutaSet = join(temporal, 'sets/mixamo.json');
  const set = JSON.parse(await readFile(rutaSet, 'utf8')) as { animations: unknown[] };
  set.animations.push(...ANIMS_EXTRA);
  await writeFile(rutaSet, JSON.stringify(set));

  // El arco: congela el clip en su primer fotograma y coloca los brazos.
  const rutaPagina = join(temporal, 'src/page.mjs');
  let pagina = await readFile(rutaPagina, 'utf8');
  const luz = luzEnElMundo();
  const parches: [string, string][] = [
    // La luz del contrato (`luzEnElMundo`): desde la izquierda, con la sombra hacia
    // la cámara. La de sprite-forge viene de la derecha y por delante.
    [
      'const LIGHT_DIR = new THREE.Vector3(-0.32139380, -0.76604444, -0.55667040);',
      `const LIGHT_DIR = new THREE.Vector3(${luz.x}, ${luz.y}, ${luz.z});`,
    ],
    ['const TARGET_HEIGHT = 0.95;', `const TARGET_HEIGHT = ${encuadre.objetivo};`],
    // El cadáver cae en su sitio (decisión del usuario): la muerte no se desplaza
    // por el suelo, igual que las locomociones. Los no muertos lo levantan ahí.
    [
      'const hipsKeys = lockHipsXZ(clip, animId, locomotion === true);',
      "const hipsKeys = lockHipsXZ(clip, animId, locomotion === true || animId === 'death');",
    ],
    // Ni flota ni se hunde: en cada fotograma el punto más bajo de la malla se
    // apoya en el suelo, donde está en la pose de reposo del rig. La carrera de
    // Mixamo tiene una fase de vuelo de 10 cm que se leía flotando, y la muerte
    // levantaba al personaje al retroceder.
    [
      '    renderer.render(scene, camera);\n    out.push(',
      `    pivot.position.y = 0;
    scene.updateMatrixWorld(true);
    pivot.position.y = state.suelo - puntoMasBajo(state.model);
    if (state.atrezo) {
      scene.updateMatrixWorld(true);
      // En la muerte el escudo se aplana entre el 45 % y el 80 % del clip.
      const avance = Math.min(1, (frameStep * f) / clip.duration);
      const w = state.animId === 'death' ? Math.min(1, Math.max(0, (avance - 0.45) / 0.35)) : 0;
      colocarAtrezo(state.model, state.bonePrefix, state.atrezo, state.confAtrezo, state.suelo, w * w * (3 - 2 * w), new THREE.Vector3(Math.sin(pivot.rotation.y), 0, Math.cos(pivot.rotation.y)));
    }
    renderer.render(scene, camera);
    out.push(`,
    ],
    [
      'Object.assign(state, { renderer, scene, camera, pivot, mixer, clip });',
      `let golpe = null;
  if (animId === 'death') {
    const urlGolpe = animUrl.replace(/[^/]*death[.]fbx$/, '${encodeURIComponent(basename(CLIP_DE_DAÑO))}');
    if (urlGolpe === animUrl) throw new Error('no sé dónde está el clip de daño junto a ' + animUrl);
    const raizGolpe = await loadFbx(urlGolpe);
    const clipGolpe = raizGolpe.animations.find((c) => c.name === 'mixamo.com') ?? raizGolpe.animations.at(-1);
    remapTrackPrefix(clipGolpe, detectBonePrefix(clipGolpe.tracks.map((t) => trackNode(t.name).node)), bonePrefix);
    const accionGolpe = mixer.clipAction(clipGolpe);
    accionGolpe.setLoop(THREE.LoopOnce, 1);
    accionGolpe.clampWhenFinished = true;
    accionGolpe.play();
    golpe = { accion: accionGolpe, fin: clipGolpe.duration - 1e-4, muerte: action };
  }
  const confAtrezo = ${JSON.stringify(atrezo)};
  const atrezo = confAtrezo ? crearAtrezo(model, confAtrezo) : null;
  if (atrezo) scene.add(atrezo.espada);
  if (atrezo?.escudo) scene.add(atrezo.escudo);
  if (atrezo?.libro) scene.add(atrezo.libro);
  if (${piernasDeColor}) colorearPiernas(model);
  scene.updateMatrixWorld(true);
  const suelo = puntoMasBajo(model);
  Object.assign(state, { renderer, scene, camera, pivot, mixer, clip, model, animId, golpe, suelo, atrezo, confAtrezo, bonePrefix });`,
    ],
    [
      '    mixer.setTime(Math.min(clip.duration, frameStep * f));',
      `    if (state.animId === 'bow' || state.animId === 'crossbow') {
      pivot.rotation.set(0, 0, 0);
      mixer.setTime(0);
      scene.updateMatrixWorld(true);
      rangedPose(state.model, state.animId, f);
      pivot.rotation.set(0, (2 * Math.PI * dir) / directions, 0);
    } else if (state.golpe) {
      const t = Math.min(clip.duration, frameStep * f);
      const w = Math.min(1, t / ${FUNDIDO_MUERTE});
      const s = w * w * (3 - 2 * w);
      mixer.setTime(t);
      state.golpe.accion.time = state.golpe.fin;
      state.golpe.accion.setEffectiveWeight(1 - s);
      state.golpe.muerte.setEffectiveWeight(s);
      mixer.update(0);
    } else {
      mixer.setTime(Math.min(clip.duration, frameStep * f));
    }`,
    ],
  ];
  for (const [antes, despues] of parches) {
    if (!pagina.includes(antes))
      throw new Error(`sprite-forge cambió: falta «${antes}» en page.mjs`);
    pagina = pagina.replace(antes, despues);
  }
  await writeFile(rutaPagina, pagina + POSE_A_DISTANCIA + PUNTO_MAS_BAJO + ATREZO + PIERNAS);
}

interface MetaDeClip {
  readonly frame_count: number;
  readonly [k: string]: unknown;
}

export async function renderizarPerfil(perfil: Perfil): Promise<string> {
  if (!existsSync(join(FORGE, 'bin/sprite-forge.mjs'))) {
    throw new Error(`no encuentro sprite-forge en ${FORGE}: define SPRITE_FORGE_DIR`);
  }
  if (!existsSync(join(FBX, 'mixamo/y_bot/character.fbx'))) {
    throw new Error(`no encuentro el rig y_bot bajo ${FBX}: define SPRITE_FORGE_ASSETS`);
  }
  const { celda, columnas } = FIGURA;
  const clips = [
    { clip: 'idle', anim: 'idle', enBucle: true },
    { clip: 'walk', anim: 'walk', enBucle: true },
    { clip: 'attack', anim: PERFILES[perfil].ataque, enBucle: false },
  ] as const;

  const temporal = await mkdtemp(join(tmpdir(), 'heroes-poses-'));
  try {
    await prepararForge(temporal);
    const salida = join(temporal, 'out');
    execFileSync(
      process.execPath,
      [
        join(temporal, 'bin/sprite-forge.mjs'),
        'render',
        '--assets',
        FBX,
        '--models',
        'y_bot',
        '--anims',
        ...new Set(clips.map((c) => c.anim)),
        '--angle',
        'tactical_25',
        '--directions',
        '8',
        '--fps',
        '6',
        '--width',
        String(celda),
        '--height',
        String(celda),
        '--out',
        join(salida, 'frames'),
        '--cache',
        join(salida, 'cache'),
      ],
      { stdio: 'inherit' },
    );

    const filas = [];
    const capas = [];
    for (const [fila, c] of clips.entries()) {
      const dir = join(salida, 'frames/y_bot', c.anim, 'tactical_25');
      const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as MetaDeClip;
      // El arco y la ballesta son 6 poses escritas a mano, no fotogramas de un clip.
      const total = c.anim === 'bow' || c.anim === 'crossbow' ? 6 : meta.frame_count;
      const indices = indicesDeClip(total, columnas, c.enBucle);
      filas.push({ clip: c.clip, anim: c.anim, indices, sourceMetadata: meta });
      for (const [col, i] of indices.entries()) {
        capas.push({
          input: join(
            dir,
            `dir_${FIGURA.camara.direccion}_frame_${String(i).padStart(3, '0')}.png`,
          ),
          left: col * celda,
          top: fila * celda,
        });
      }
    }

    await mkdir(DIR_POSES, { recursive: true });
    const png = await sharp({
      create: {
        width: columnas * celda,
        height: clips.length * celda,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(capas)
      .png()
      .toBuffer();
    const rutaPng = join(DIR_POSES, `${perfil}.png`);
    await writeFile(rutaPng, png);
    const forge = execFileSync('git', ['-C', FORGE, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    await writeFile(
      join(DIR_POSES, `${perfil}.json`),
      `${JSON.stringify(
        {
          perfil,
          ataque: PERFILES[perfil].describe,
          model: 'y_bot',
          renderer: 'sprite-forge',
          spriteForgeCommit: forge.trim(),
          camera: {
            pitchDegrees: -FIGURA.camara.elevacionGrados,
            direction: FIGURA.camara.direccion,
            directions: 8,
            projection: 'orthographic',
            ortho: FIGURA.camara.ortho,
          },
          cell: celda,
          columns: columnas,
          clips: filas,
          sha256: sha256(png),
        },
        null,
        2,
      )}\n`,
    );
    return rutaPng;
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

/** El atrezo de un juego de armas, en metros. `agarre`: dónde queda la guarda sobre el puño derecho. */
export interface Atrezo {
  /**
   * El arma de la mano derecha, en metros: la hoja (o el asta) sale por el lado
   * del índice desde `agarre`, y el puño queda hacia el meñique.
   */
  readonly espada: {
    readonly largo: number;
    readonly guarda: number;
    readonly puño: number;
    readonly agarre: number;
    readonly grosor?: number;
    /** Radio de una bola en la punta (maza, mayal). */
    readonly cabeza?: number;
    /** Largo de una punta de lanza. */
    readonly moharra?: number;
    readonly remate?: 'cruz';
  };
  readonly escudo: boolean;
  /** Un libro en la mano izquierda. */
  readonly libro?: boolean;
  /** La mano izquierda también en el puño de la espada. */
  readonly dosManos: boolean;
  /** Cuánto apunta la hoja, como mínimo, hacia donde mira (coseno). */
  readonly adelanteMinimo: number;
  /** Cuánto apunta, como mínimo, hacia arriba (coseno): un bastón va de pie. */
  readonly arribaMinimo?: number;
  /** A dos manos: cuánto se lleva el agarre a la línea central del cuerpo (0 a 1). */
  readonly centrado: number;
  /** A dos manos: a cuántos metros por delante del pecho queda el agarre, como mínimo. */
  readonly alcanceMinimo: number;
  /** A dos manos: distancia entre las dos manos sobre el puño, en metros. */
  readonly separacionManos: number;
  /** A dos manos: cuánto se abren los codos hacia fuera, frente a hacia abajo (1 = 45°). */
  readonly codosAfuera: number;
  /** A dos manos: cuánto se adelantan los codos (en la misma escala). */
  readonly codosAdelante: number;
  /** A dos manos: a qué fracción de su largo, como mucho, se estira cada brazo. */
  readonly estiramiento: number;
}

/**
 * Las referencias de Mixamo por juego de armas: el rig `y_bot` con los clips del
 * pack de espada y escudo (no hay otros en la máquina) y el atrezo de cada arma.
 * Cada juego se renderiza una vez en `assets/unidades/_poses/<juego>-8d/` y lo
 * reutilizan todas las unidades que lleven esas armas; uno nuevo se hace
 * copiando el más parecido y retocándolo.
 */
/** Lo que no usa un arma de una mano: los ajustes del agarre a dos manos, a cero. */
const UNA_MANO = {
  escudo: false,
  dosManos: false,
  adelanteMinimo: 0,
  centrado: 0,
  alcanceMinimo: 0,
  separacionManos: 0,
  codosAfuera: 0,
  codosAdelante: 0,
  estiramiento: 1,
} as const;

export const JUEGOS_DE_ARMAS = {
  'espada-escudo': {
    describe: 'espada de una mano y escudo de cometa',
    ataque: 'quick',
    reposo: 'idle',
    // El templario con escudo se aprobó con el maniquí gris (su procedencia
    // apunta aquel render); el caballero, que lo reutiliza, ya va con color.
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 0.85, guarda: 0.2, puño: 0.17, agarre: 0.085 },
      escudo: true,
      dosManos: false,
      adelanteMinimo: 0,
      centrado: 0,
      alcanceMinimo: 0,
      separacionManos: 0,
      codosAfuera: 0,
      codosAdelante: 0,
      estiramiento: 1,
    },
  },
  // Los clips son de espada y escudo: la mano izquierda se lleva al puño con IK
  // en cada fotograma. El ataque es el tajo amplio, que es el que ya usaba el
  // perfil `dos-manos` de una dirección.
  'dos-manos': {
    describe: 'espada larga empuñada con las dos manos',
    ataque: 'heavy',
    // La guardia de `idle` gira torso y cabeza a media animación y, de frente, el
    // modelo de imagen lo exageraba hasta enseñar la espalda. `idle (4)` es una
    // guardia quieta con la espada vertical (elegida entre las cuatro del pack).
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 1.1, guarda: 0.3, puño: 0.3, agarre: 0.05 },
      escudo: false,
      dosManos: true,
      adelanteMinimo: 0.5,
      centrado: 0.85,
      alcanceMinimo: 0.3,
      separacionManos: 0.11,
      codosAfuera: 4,
      codosAdelante: 0.7,
      estiramiento: 0.7,
    },
  },
  // Bastón o báculo rematado en cruz, en la derecha: el monje y el abad. El
  // ataque es el lanzamiento con el brazo extendido del perfil `baston`.
  baston: {
    describe: 'bastón alto rematado en cruz en la mano derecha',
    ataque: 'casting',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 1.15, guarda: 0, puño: 0.5, agarre: 0, grosor: 0.024, remate: 'cruz' },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
  },
  // Lanza de infantería en la derecha, sin escudo: el escudero.
  lanza: {
    describe: 'lanza en la mano derecha, sin escudo',
    ataque: 'quick',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 1.45, guarda: 0, puño: 0.6, agarre: 0, grosor: 0.02, moharra: 0.25 },
      ...UNA_MANO,
      adelanteMinimo: 0.6,
    },
  },
  // Maza de una mano en la derecha y un libro en la izquierda: el inquisidor.
  maza: {
    describe: 'maza de una mano en la derecha y un libro en la izquierda',
    ataque: 'quick',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 0.42, guarda: 0, puño: 0.14, agarre: 0, grosor: 0.025, cabeza: 0.07 },
      ...UNA_MANO,
      libro: true,
    },
  },
  // Mayal de una mano: mango corto y la bola de pinchos al final de la cadena,
  // que en el maniquí va rígida. El ataque es el tajo amplio.
  mayal: {
    describe: 'mayal de bola de pinchos en la mano derecha',
    ataque: 'heavy',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 0.55, guarda: 0, puño: 0.16, agarre: 0, grosor: 0.012, cabeza: 0.08 },
      ...UNA_MANO,
    },
  },
} as const satisfies Record<
  string,
  { describe: string; ataque: string; reposo: string; piernasDeColor: boolean; atrezo: Atrezo }
>;
export type JuegoDeArmas = keyof typeof JUEGOS_DE_ARMAS;

/**
 * Un juego de armas con poses en 8 direcciones: los de sprite-forge y la
 * montura, que sale de `tools/art/montura.ts --8d` y no está en
 * `JUEGOS_DE_ARMAS`.
 */
export type JuegoEn8d = JuegoDeArmas | 'montado-lanza';

/** La carpeta de las poses en 8 direcciones de un juego de armas, la montura incluida. */
export const carpetaDePoses = (j: JuegoEn8d): string => join(DIR_POSES, `${j}-8d`);

/**
 * La unidad definitiva: 8 direcciones y 6 acciones. Cada dirección se reparte en
 * dos hojas de 3 filas, que es el tamaño que ChatGPT pinta bien: la A es la
 * locomoción y la B es ataque, daño y muerte, juntos para que la muerte se pinte
 * en la misma imagen que el daño del que arranca. No se espeja ninguna
 * dirección: con la luz fija a la izquierda, espejar la traería de la derecha.
 */
export const OCHO_DIRECCIONES = {
  /** A 6 fps la carrera da 4 fotogramas para 7 columnas: se repetirían. */
  fps: 12,
  /** El cadáver cae hacia la cámara y en 256 se sale por abajo. */
  celda: FIGURA_8D.celda,
  encuadre: { ortho: FIGURA_8D.ortho, objetivo: FIGURA_8D.objetivo },
  /**
   * El alto del maniquí de pie en la hoja, en píxeles: el Y Bot mide 1,8047 m y
   * a 25° se ve por `cos 25°`. Es el mismo en las 8 direcciones (la cámara es
   * ortográfica), y es contra él contra lo que se escala. Medido por la caja del
   * reposo salía más alto de espaldas, con la espada asomando sobre la cabeza,
   * y el personaje pintado quedaba más pequeño.
   */
  altoDelManiqui: Math.round(
    (1.8047 * Math.cos((FIGURA.camara.elevacionGrados * Math.PI) / 180) * FIGURA_8D.celda) /
      FIGURA_8D.ortho,
  ),
  hojas: {
    a: [
      { clip: 'idle', anim: 'idle', enBucle: true },
      { clip: 'walk', anim: 'walk', enBucle: true },
      { clip: 'charge', anim: 'run', enBucle: true },
    ],
    b: [
      // El clip del ataque lo pone el juego de armas (`hojasDe`).
      { clip: 'attack', anim: 'quick', enBucle: false },
      { clip: 'hurt', anim: 'impact3', enBucle: false },
      { clip: 'death', anim: 'death', enBucle: false },
    ],
  },
} as const;
export type Hoja8d = keyof typeof OCHO_DIRECCIONES.hojas;

/** Las dos hojas de un juego de armas: las comunes con su ataque. */
export function hojasDe(j: JuegoDeArmas) {
  const { a, b } = OCHO_DIRECCIONES.hojas;
  const reposo: string = JUEGOS_DE_ARMAS[j].reposo;
  return {
    a: a.map((c) => (c.clip === 'idle' ? { ...c, anim: reposo } : c)),
    b: b.map((c) => (c.clip === 'attack' ? { ...c, anim: JUEGOS_DE_ARMAS[j].ataque } : c)),
  };
}

/**
 * La referencia de pose del GIRO: el primer reposo de cada dirección, en 4
 * columnas por 2 filas y en el orden de las direcciones (0 a 3 arriba, 4 a 7
 * abajo). Es la pose de la lámina de identidad que fija el personaje por los
 * ocho lados antes de pintar sus hojas. Sale de las hojas ya renderizadas.
 */
export async function componerGiro(carpeta: string): Promise<string> {
  const { celda } = OCHO_DIRECCIONES;
  const capas = await Promise.all(
    Array.from({ length: 8 }, async (_, d) => ({
      input: await sharp(join(carpeta, `d${d}-a.png`))
        .extract({ left: 0, top: 0, width: celda, height: celda })
        .png()
        .toBuffer(),
      left: (d % 4) * celda,
      top: Math.floor(d / 4) * celda,
    })),
  );
  const png = await sharp({
    create: {
      width: 4 * celda,
      height: 2 * celda,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
  await writeFile(join(carpeta, 'giro.png'), png);
  return sha256(png);
}

/** Renderiza las 16 hojas de pose de un juego de armas y devuelve su carpeta. */
export async function renderizarOchoDirecciones(
  juego: JuegoDeArmas,
  destino = DIR_POSES,
): Promise<string> {
  const { celda, encuadre } = OCHO_DIRECCIONES;
  const hojas = hojasDe(juego);
  const perfil = `${juego}-8d`;
  const { columnas } = FIGURA;
  const temporal = await mkdtemp(join(tmpdir(), 'heroes-poses-8d-'));
  try {
    await prepararForge(
      temporal,
      encuadre,
      JUEGOS_DE_ARMAS[juego].atrezo,
      JUEGOS_DE_ARMAS[juego].piernasDeColor,
    );
    const salida = join(temporal, 'out');
    const anims = [...new Set(Object.values(hojas).flatMap((h) => h.map((c) => c.anim)))];
    execFileSync(
      process.execPath,
      [
        join(temporal, 'bin/sprite-forge.mjs'),
        'render',
        '--assets',
        FBX,
        '--models',
        'y_bot',
        '--anims',
        ...anims,
        '--angle',
        'tactical_25',
        '--directions',
        '8',
        '--fps',
        String(OCHO_DIRECCIONES.fps),
        '--width',
        String(celda),
        '--height',
        String(celda),
        '--out',
        join(salida, 'frames'),
        '--cache',
        join(salida, 'cache'),
      ],
      { stdio: 'inherit' },
    );

    const carpeta = join(destino, perfil);
    await mkdir(carpeta, { recursive: true });
    const meta: Record<string, unknown> = {};
    const indicesPorClip: Record<string, number[]> = {};
    for (const filas of Object.values(hojas)) {
      for (const c of filas) {
        const dir = join(salida, 'frames/y_bot', c.anim, 'tactical_25');
        const m = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as MetaDeClip;
        meta[c.clip] = m;
        indicesPorClip[c.clip] = indicesDeClip(m.frame_count, columnas, c.enBucle);
      }
    }
    const shas: Record<string, string> = {};
    for (let d = 0; d < 8; d += 1) {
      for (const [hoja, filas] of Object.entries(hojas)) {
        const capas = filas.flatMap((c, fila) =>
          (indicesPorClip[c.clip] ?? []).map((i, col) => ({
            input: join(
              salida,
              'frames/y_bot',
              c.anim,
              'tactical_25',
              `dir_${d}_frame_${String(i).padStart(3, '0')}.png`,
            ),
            left: col * celda,
            top: fila * celda,
          })),
        );
        const png = await sharp({
          create: {
            width: columnas * celda,
            height: filas.length * celda,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite(capas)
          .png()
          .toBuffer();
        const nombre = `d${d}-${hoja}.png`;
        await writeFile(join(carpeta, nombre), png);
        shas[nombre] = sha256(png);
      }
    }
    shas['giro.png'] = await componerGiro(carpeta);
    const forge = execFileSync('git', ['-C', FORGE, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    await writeFile(
      join(carpeta, 'poses.json'),
      `${JSON.stringify(
        {
          perfil,
          juegoDeArmas: juego,
          atrezo: JUEGOS_DE_ARMAS[juego].atrezo,
          piernasDeColor: JUEGOS_DE_ARMAS[juego].piernasDeColor,
          model: 'y_bot',
          renderer: 'sprite-forge',
          spriteForgeCommit: forge.trim(),
          camera: {
            pitchDegrees: -FIGURA.camara.elevacionGrados,
            directions: 8,
            projection: 'orthographic',
            ortho: encuadre.ortho,
            target: encuadre.objetivo,
          },
          light: luzEnElMundo(),
          deathStartsFrom: { clip: 'hurt', blendSeconds: FUNDIDO_MUERTE },
          cell: celda,
          columns: columnas,
          sheets: Object.fromEntries(
            Object.entries(hojas).map(([h, filas]) => [
              h,
              filas.map((c) => ({ ...c, indices: indicesPorClip[c.clip] })),
            ]),
          ),
          sourceMetadata: meta,
          sha256: shas,
        },
        null,
        2,
      )}\n`,
    );
    return carpeta;
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) {
  const arg = process.argv[2];
  if (arg === '--giro' || arg === '--8d') {
    const juego = process.argv[3] as JuegoDeArmas;
    if (!(juego in JUEGOS_DE_ARMAS)) {
      throw new Error(
        `juego de armas desconocido «${juego}». Hay: ${Object.keys(JUEGOS_DE_ARMAS).join(', ')}`,
      );
    }
    console.log(
      arg === '--giro'
        ? await componerGiro(carpetaDePoses(juego))
        : `→ ${await renderizarOchoDirecciones(juego, process.argv[4])}`,
    );
    process.exit(0);
  }
  const todos = Object.keys(PERFILES) as Perfil[];
  const pedidos = arg === '--todos' ? todos : [arg as Perfil];
  for (const p of pedidos) {
    if (!(p in PERFILES)) {
      throw new Error(`perfil desconocido «${p}». Hay: ${todos.join(', ')}, o --todos`);
    }
    console.log(`→ ${await renderizarPerfil(p)}`);
  }
}
