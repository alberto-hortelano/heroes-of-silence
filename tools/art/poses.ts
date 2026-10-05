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
import {
  type ClipDeFigura,
  FIGURA,
  FIGURA_8D,
  HOJAS_DE_FIGURA,
  type HojaDeFigura,
  hojasDeFigura,
  luzEnElMundo,
} from '../../src/shared/arte.js';
import {
  type ClipDeDisparo,
  DISPARO_EN_NODE,
  esDisparo,
  POSE_A_DISTANCIA,
} from './ybot-a-distancia.js';

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
  { id: 'grenade', file: 'anims/sword_and_shield/sword and shield attack (4).fbx' },
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
// Cada arma se crea con su función de colocar: \`crearAtrezo\` elige una vez y en
// cada fotograma se llama a \`atrezo.colocar(suelo, aplanar, frente, disparo)\`.
// \`disparo\` es \`{ tension, tensa }\` en un fotograma de disparo y \`null\` en
// cualquier otro.
function crearAtrezo(model, prefijo, conf) {
  let material = null;
  model.traverse((n) => { if (!material && n.isMesh) material = Array.isArray(n.material) ? n.material[0] : n.material; });
  // Una copia: el del maniquí puede pasar a colores de vértice (las piernas) y
  // el atrezo no los tiene, así que con el mismo material saldría negro.
  material = material.clone();
  const p = huesoEn(model, prefijo);
  if (conf.arco) return crearArco(p, conf, material);
  if (conf.ballesta) return crearBallesta(model, p, conf, material);
  if (conf.granada) return crearGranada(p, conf, material);
  return crearArmaDeMano(model, prefijo, p, conf, material);
}
function crearArmaDeMano(model, prefijo, p, conf, material) {
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
  // Una esfera: el remate del báculo de un mago.
  if (e.remate === 'esfera') {
    const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), material);
    esfera.position.y = punta + 0.075;
    espada.add(esfera);
  }
  // La hoja de la alabarda: una hacha plana a un lado del asta, bajo la punta.
  if (e.remate === 'hacha') {
    const hacha = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.02), material);
    hacha.position.set(0.1, punta - 0.12, 0);
    espada.add(hacha);
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
  // Una daga en la mano izquierda: la de parada del duelista.
  let daga = null;
  if (conf.daga) {
    daga = new THREE.Group();
    const hojaDaga = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, conf.daga.largo, 6), material);
    hojaDaga.position.y = 0.05 + conf.daga.largo / 2;
    const guardaDaga = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), material);
    guardaDaga.position.y = 0.05;
    daga.add(hojaDaga, guardaDaga);
  }
  let escudo = null;
  if (conf.rodela) {
    // La rodela: un disco redondo en vez de la cometa.
    escudo = new THREE.Mesh(new THREE.CylinderGeometry(conf.rodela, conf.rodela, 0.03, 24), material);
    escudo.geometry.rotateX(Math.PI / 2);
  } else if (conf.escudo) {
    const forma = new THREE.Shape();
    forma.moveTo(-0.24, 0.3);
    forma.lineTo(0.24, 0.3);
    forma.lineTo(0.2, -0.05);
    forma.lineTo(0, -0.45);
    forma.lineTo(-0.2, -0.05);
    forma.closePath();
    escudo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.03, bevelEnabled: false }), material);
  }
  const atrezo = { espada, escudo, libro, daga };
  return {
    // El orden de las piezas en la escena es el orden en que se pintan: con
    // otro, donde dos piezas se tocan podría ganar la otra y cambiar un píxel.
    piezas: [espada, escudo, libro, daga].filter(Boolean),
    colocar: (suelo, aplanar, frente) => colocarArmaDeMano(model, prefijo, p, atrezo, conf, suelo, aplanar, frente),
  };
}
// Un tramo recto de radio r y largo 1 en y: se coloca y se estira entre dos
// puntos en cada fotograma (la cuerda, que se tensa).
function tramo(material, r) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), material);
}
function estirarEntre(tramo, a, b) {
  const d = b.clone().sub(a);
  const largo = d.length();
  tramo.position.copy(a).add(b).multiplyScalar(0.5);
  tramo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), largo > 1e-6 ? d.divideScalar(largo) : new THREE.Vector3(0, 1, 0));
  tramo.scale.set(1, Math.max(1e-4, largo), 1);
}
// El arco: la empuñadura en el origen, el eje largo en y y la panza hacia +x;
// las palas se curvan hacia -x, que es el lado de la cuerda. Así su cara (z) es
// la que queda arriba cuando se tumba en el suelo, como la del escudo.
function crearArco(p, conf, material) {
  const a = conf.arco;
  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-a.combadura, -a.largo / 2, 0),
    new THREE.Vector3(a.combadura, 0, 0),
    new THREE.Vector3(-a.combadura, a.largo / 2, 0),
  );
  const arco = new THREE.Mesh(new THREE.TubeGeometry(curva, 24, a.grosor, 6, false), material);
  const puntas = [curva.getPoint(0), curva.getPoint(1)];
  const cuerda = [tramo(material, 0.006), tramo(material, 0.006)];
  const flecha = tramo(material, 0.008);
  const piezas = [arco, ...cuerda, flecha];
  let aljaba = null;
  if (conf.aljaba) {
    aljaba = new THREE.Group();
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.55, 10), material);
    aljaba.add(tubo);
    // Tres astiles asomando por la boca: sin ellos, a 160 px, es un termo. Con
    // plumas de caja se leían como dedos o como orejas junto a la cabeza.
    for (const [x, z] of [[0.025, 0.01], [-0.02, 0.015], [0, -0.025]]) {
      const astil = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 5), material);
      astil.position.set(x, 0.32, z);
      aljaba.add(astil);
    }
    piezas.push(aljaba);
  }
  const atrezo = { arco, puntas, cuerda, flecha, aljaba };
  return {
    piezas,
    colocar: (suelo, aplanar, frente, disparo) => colocarArco(p, atrezo, conf, suelo, aplanar, frente, disparo),
  };
}
// La ballesta: el tablero a lo largo de y, con el agarre en el origen; el arco
// transversal en x, delante, curvado hacia atrás; la cara de arriba en +z.
function crearBallesta(model, p, conf, material) {
  const b = conf.ballesta;
  const ballesta = new THREE.Group();
  // Sin palas es un arma de fuego (arcabuz, culebrina, rifle): culata y cañón,
  // sin arco, cuerda ni virote. Con el arco, el arcabucero salía con ballesta.
  if (!(b.palas > 0)) {
    const culata = new THREE.Mesh(new THREE.BoxGeometry(0.05, b.atras + 0.15, 0.08), material);
    culata.position.y = (0.15 - b.atras) / 2;
    const canon = new THREE.Mesh(new THREE.CylinderGeometry(b.grosor, b.grosor, b.delante - 0.1, 8), material);
    canon.position.set(0, 0.1 + (b.delante - 0.1) / 2, 0.02);
    ballesta.add(culata, canon);
    const atrezo = { ballesta, virote: null };
    return {
      piezas: [ballesta],
      colocar: (suelo, aplanar, frente, disparo, anim) => colocarBallesta(model, p, atrezo, conf, suelo, aplanar, frente, disparo, anim),
    };
  }
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(0.05, b.delante + b.atras, 0.07), material);
  tablero.position.y = (b.delante - b.atras) / 2;
  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-b.palas / 2, b.delante - b.combadura, 0),
    new THREE.Vector3(0, b.delante + b.combadura, 0),
    new THREE.Vector3(b.palas / 2, b.delante - b.combadura, 0),
  );
  const palas = new THREE.Mesh(new THREE.TubeGeometry(curva, 20, b.grosor, 6, false), material);
  const cuerda = tramo(material, 0.006);
  estirarEntre(cuerda, curva.getPoint(0), curva.getPoint(1));
  // El virote sobre el tablero: se ve hasta que se dispara.
  const virote = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, b.delante + 0.06, 5), material);
  virote.position.set(0, (b.delante + 0.06) / 2, 0.045);
  ballesta.add(tablero, palas, cuerda, virote);
  const atrezo = { ballesta, virote };
  return {
    piezas: [ballesta],
    colocar: (suelo, aplanar, frente, disparo, anim) => colocarBallesta(model, p, atrezo, conf, suelo, aplanar, frente, disparo, anim),
  };
}
// La granada: una bola de hierro con la mecha asomando, en el puño derecho
// hasta que la suelta; después del tiro la mano va vacía.
function crearGranada(p, conf, material) {
  const g = conf.granada;
  const granada = new THREE.Group();
  const bola = new THREE.Mesh(new THREE.SphereGeometry(g.radio, 14, 10), material);
  const mecha = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, g.mecha, 5), material);
  mecha.position.y = g.radio + g.mecha / 2;
  granada.add(bola, mecha);
  return {
    piezas: [granada],
    colocar: (suelo, aplanar, frente, disparo) => {
      const { centro } = ejeDeNudillos(p, 'Right');
      granada.position.copy(centro);
      granada.visible = disparo === null || disparo.tensa;
      // Al morir la suelta: rueda hasta el suelo junto a la mano.
      if (aplanar > 0) granada.position.lerp(new THREE.Vector3(centro.x, suelo + g.radio, centro.z), aplanar);
    },
  };
}
function huesoEn(model, prefijo) {
  return (nombre) => {
    const h = model.getObjectByName(prefijo + nombre);
    if (!h) throw new Error('el rig no tiene el hueso ' + prefijo + nombre);
    return h.getWorldPosition(new THREE.Vector3());
  };
}
// El eje del puño cerrado de una mano: la línea de los nudillos, del meñique al
// índice; y su centro, en el hueco de los dedos.
function ejeDeNudillos(p, lado) {
  const indice = p(lado + 'HandIndex1'), meñique = p(lado + 'HandPinky1');
  const eje = indice.clone().sub(meñique).normalize();
  const centro = indice.clone().add(meñique).multiplyScalar(0.5).lerp(p(lado + 'HandMiddle2'), 0.5);
  return { eje, centro };
}
// Lleva \`eje\` hasta que apunte, como mínimo, \`minimo\` (coseno) hacia \`hacia\`.
function inclinar(eje, hacia, minimo) {
  if (!(minimo > 0)) return;
  const d = eje.dot(hacia);
  if (d >= minimo) return;
  const resto = eje.clone().addScaledVector(hacia, -d);
  if (resto.lengthSq() < 1e-6) resto.set(1, 0, 0);
  resto.normalize();
  eje.copy(resto.multiplyScalar(Math.sqrt(1 - minimo * minimo)).addScaledVector(hacia, minimo)).normalize();
}
// La pista de la IK para el codo: hacia abajo, abierto \`afuera\` por \`lateral\` y
// \`adelante\` por \`frente\`.
function codoHacia(lateral, frente, afuera, adelante) {
  return new THREE.Vector3(0, -1, 0).addScaledVector(lateral, afuera).addScaledVector(frente, adelante).normalize();
}
// Al morir, una pieza plana se tumba con el cuerpo hasta quedar en el suelo con
// su cara (z) hacia arriba y su largo (y) por donde apuntaba \`eje\`, bajo \`centro\`.
function tumbar(objeto, eje, centro, suelo, w, alto) {
  if (!(w > 0)) return;
  const largo = new THREE.Vector3(eje.x, 0, eje.z);
  if (largo.lengthSq() < 1e-6) largo.set(0, 0, 1);
  largo.normalize();
  const cara = new THREE.Vector3(0, 1, 0);
  const ancho = new THREE.Vector3().crossVectors(largo, cara).normalize();
  const plano = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ancho, largo, cara));
  const enSuelo = new THREE.Vector3(centro.x, suelo + alto, centro.z);
  objeto.quaternion.slerp(plano, w);
  objeto.position.lerp(enSuelo, w);
}
function colocarArmaDeMano(model, prefijo, p, atrezo, conf, suelo, aplanar, frente) {
  // La espada: el puño en el hueco de los dedos, la hoja hacia el índice.
  const { eje, centro } = ejeDeNudillos(p, 'Right');
  // La hoja (o el asta) no puede cruzar el cuerpo: los clips son de espada y
  // escudo, con la derecha en la cadera, y siguiendo los nudillos una hoja larga
  // atravesaba el torso. Se la inclina hasta un mínimo hacia delante (dos manos,
  // lanza) o hacia arriba (bastón, que va de pie junto al cuerpo).
  inclinar(eje, frente, conf.adelanteMinimo);
  inclinar(eje, new THREE.Vector3(0, 1, 0), conf.arribaMinimo ?? 0);
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
    const codo = (lado) => codoHacia(lateral, frente, lado * conf.codosAfuera, conf.codosAdelante);
    poseArm(model, 'Right', agarre, codo(1));
    const manoIzquierda = agarre.clone().addScaledVector(eje, -conf.separacionManos);
    poseArm(model, 'Left', manoIzquierda, codo(-1));
    centro.copy(agarre);
    atrezo.espada.position.copy(centro);
  }
  if (atrezo.daga) {
    // Como la espada, por la línea de los nudillos de la izquierda.
    const izq = ejeDeNudillos(p, 'Left');
    inclinar(izq.eje, frente, conf.adelanteMinimo);
    atrezo.daga.position.copy(izq.centro);
    atrezo.daga.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), izq.eje);
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
  tumbar(atrezo.escudo, arriba, medio, suelo, aplanar, 0.005);
}
// Pone \`objeto\` en \`centro\` con su eje largo (y) por \`eje\` y su x por \`cara\`
// (la panza del arco, el arco transversal de la ballesta); z sale de las dos.
function orientar(objeto, centro, eje, cara) {
  const z = new THREE.Vector3().crossVectors(cara, eje).normalize();
  objeto.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(cara, eje, z));
  objeto.position.copy(centro);
}
// El arco va en la IZQUIERDA. Fuera del disparo, por la línea de los nudillos
// como la espada, con la panza hacia donde apunta el antebrazo; en el disparo,
// vertical y con la panza de la mano de la cuerda a la del arco, para que la
// derecha quede en su plano y la cuerda no tire de lado.
function colocarArco(p, atrezo, conf, suelo, aplanar, frente, disparo) {
  const izq = ejeDeNudillos(p, 'Left');
  const der = ejeDeNudillos(p, 'Right');
  const eje = izq.eje.clone();
  const cara = new THREE.Vector3();
  if (disparo) {
    eje.set(0, 1, 0);
    cara.copy(izq.centro).sub(der.centro).setY(0);
    if (cara.lengthSq() < 1e-6) cara.copy(frente);
    cara.normalize();
    // Con la cuerda floja las dos manos están juntas y su línea es de lado: la
    // panza no puede apuntar menos que esto hacia donde mira.
    inclinar(cara, frente, conf.panzaAdelanteMinimo);
  } else {
    // Los clips mueven el puño como si llevara espada: a la carrera, por los
    // nudillos, el arco iba en horizontal como una barra. Se lo pone de pie.
    inclinar(eje, new THREE.Vector3(0, eje.y < 0 ? -1 : 1, 0), conf.arribaMinimo);
    cara.copy(p('LeftHand')).sub(p('LeftForeArm'));
    cara.addScaledVector(eje, -cara.dot(eje));
    if (cara.lengthSq() < 1e-6) cara.copy(frente);
    cara.normalize();
  }
  orientar(atrezo.arco, izq.centro, eje, cara);
  tumbar(atrezo.arco, eje, izq.centro, suelo, aplanar, conf.arco.grosor);
  atrezo.arco.updateMatrixWorld(true);
  const puntas = atrezo.puntas.map((v) => atrezo.arco.localToWorld(v.clone()));
  // La cuerda va a la mano derecha mientras está tensa; floja (tensión 0,1 o
  // menos, o ya suelta), recta entre las puntas: con las manos juntas en el
  // primer fotograma, engancharla daba una V de lado.
  const tensa = disparo !== null && disparo.tensa && disparo.tension > 0.1;
  const gancho = tensa ? der.centro : puntas[0].clone().add(puntas[1]).multiplyScalar(0.5);
  estirarEntre(atrezo.cuerda[0], puntas[0], gancho);
  estirarEntre(atrezo.cuerda[1], gancho, puntas[1]);
  // La flecha, solo en la cuerda: de la mano derecha hacia el arco, y asoma por delante.
  atrezo.flecha.visible = tensa;
  if (tensa) {
    const hacia = izq.centro.clone().sub(gancho).normalize();
    estirarEntre(atrezo.flecha, gancho, gancho.clone().addScaledVector(hacia, conf.flecha));
  }
  if (atrezo.aljaba) colocarAljaba(p, atrezo.aljaba);
}
// La aljaba, a la espalda y con la boca hacia el hombro derecho, que es por
// donde saca la flecha. La base sale de los hombros y del cuello, no de los
// ejes locales del hueso: así no hay que adivinar hacia dónde mira cada uno.
function colocarAljaba(p, aljaba) {
  const pecho = p('Spine2');
  const arriba = p('Neck').sub(p('Spine1')).normalize();
  const derecha = p('RightArm').sub(p('LeftArm'));
  derecha.addScaledVector(arriba, -derecha.dot(arriba)).normalize();
  const atras = new THREE.Vector3().crossVectors(derecha, arriba).normalize();
  const eje = arriba.clone().multiplyScalar(Math.cos(0.35)).addScaledVector(derecha, Math.sin(0.35)).normalize();
  const lado = new THREE.Vector3().crossVectors(eje, atras).normalize();
  aljaba.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lado, eje, atras));
  aljaba.position.copy(pecho).addScaledVector(atras, 0.16).addScaledVector(arriba, -0.05);
}
// La ballesta va en la DERECHA. En el disparo apunta a donde mira, encarada, y
// la izquierda sujeta el tablero por delante con la misma IK que el agarre a
// dos manos, con el codo abierto hacia fuera.
function colocarBallesta(model, p, atrezo, conf, suelo, aplanar, frente, disparo, anim) {
  const arriba = new THREE.Vector3(0, 1, 0);
  // Fuera del disparo y de la muerte se lleva con las DOS manos delante del
  // cuerpo, terciada y algo baja, siguiendo al torso en cada fotograma: con
  // los clips de espada la derecha iba en la cadera con la ballesta colgando
  // al lado y la izquierda libre, y el modelo de imagen la pintaba flotando o
  // cogida con una mano (lo vio el usuario el 05-10-2026). En la muerte se
  // suelta y cae con la mano, como antes.
  if (!disparo && anim !== 'death') {
    const lateral = new THREE.Vector3().crossVectors(frente, arriba).normalize();
    const agarre = p('Spine2')
      .addScaledVector(frente, 0.3)
      .addScaledVector(arriba, -0.24)
      .addScaledVector(lateral, 0.1);
    const eje = frente.clone().multiplyScalar(Math.cos(conf.bajaEnReposo)).addScaledVector(arriba, -Math.sin(conf.bajaEnReposo))
      .addScaledVector(lateral, -0.35).normalize();
    poseArm(model, 'Right', agarre, codoHacia(lateral, frente, 0.6, 0));
    poseArm(model, 'Left', agarre.clone().addScaledVector(eje, conf.separacionManos), codoHacia(lateral, frente, -0.6, 0));
  }
  const der = ejeDeNudillos(p, 'Right');
  const eje = der.eje.clone();
  if (disparo) {
    eje.copy(frente);
    const lateral = new THREE.Vector3().crossVectors(frente, arriba).normalize();
    const apoyo = der.centro.clone().addScaledVector(frente, conf.separacionManos).add(new THREE.Vector3(0, -0.03, 0));
    poseArm(model, 'Left', apoyo, codoHacia(lateral, frente, -0.5, 0));
  } else {
    // Fuera del disparo apunta adelante, algo baja y cruzada hacia la
    // izquierda, de la mano derecha a la izquierda, con la cara de arriba
    // arriba. Por los nudillos, como la lanza, el reposo de espada la
    // levantaba sobre el hombro y se leía como un pico.
    const lateral = new THREE.Vector3().crossVectors(frente, arriba).normalize();
    eje.copy(frente).multiplyScalar(Math.cos(conf.bajaEnReposo)).add(new THREE.Vector3(0, -Math.sin(conf.bajaEnReposo), 0));
    if (anim !== 'death') eje.addScaledVector(lateral, -0.35);
    eje.normalize();
    arriba.addScaledVector(eje, -arriba.dot(eje)).normalize();
  }
  const lado = new THREE.Vector3().crossVectors(eje, arriba).normalize();
  orientar(atrezo.ballesta, der.centro, eje, lado);
  if (atrezo.virote) atrezo.virote.visible = disparo === null || disparo.tensa;
  tumbar(atrezo.ballesta, eje, der.centro, suelo, aplanar, 0.04);
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
  /** El clip del disparo, si el juego dispara: el de su `disparo`. */
  clipDeDisparo: ClipDeDisparo | null = null,
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
      state.atrezo.colocar(state.suelo, w * w * (3 - 2 * w), new THREE.Vector3(Math.sin(pivot.rotation.y), 0, Math.cos(pivot.rotation.y)), state.disparo, state.animId);
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
  const atrezo = confAtrezo ? crearAtrezo(model, bonePrefix, confAtrezo) : null;
  for (const pieza of atrezo?.piezas ?? []) scene.add(pieza);
  if (${piernasDeColor}) colorearPiernas(model);
  scene.updateMatrixWorld(true);
  const suelo = puntoMasBajo(model);
  Object.assign(state, { renderer, scene, camera, pivot, mixer, clip, model, animId, golpe, suelo, atrezo, clipDeDisparo: ${JSON.stringify(clipDeDisparo)} });`,
    ],
    [
      '    mixer.setTime(Math.min(clip.duration, frameStep * f));',
      // El disparo se resuelve una vez por fotograma: lo leen la pose y el atrezo.
      `    state.disparo = null;
    if (state.animId === state.clipDeDisparo) {
      const p = progresoDelDisparo(f, frameCount);
      state.disparo = { tension: curvaDelDisparo(state.animId, p), tensa: cuerdaTensa(state.animId, p) };
      pivot.rotation.set(0, 0, 0);
      mixer.setTime(0);
      scene.updateMatrixWorld(true);
      rangedPose(state.model, state.animId, state.disparo.tension, state.disparo.tensa);
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
    const ataque = PERFILES[perfil].ataque;
    await prepararForge(temporal, undefined, null, false, esDisparo(ataque) ? ataque : null);
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
      const indices = indicesDeClip(meta.frame_count, columnas, c.enBucle);
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

/**
 * El atrezo de un juego de armas, en metros: un arma de mano (la espada y todo
 * lo que se empuña como ella), un arco o una ballesta. La clave dice cuál es
 * (`'arco' in a`), y cada rama lleva solo lo suyo: al arco no se le aplican las
 * reglas de inclinación de la hoja ni el agarre a dos manos.
 */
export type Atrezo = AtrezoDeMano | AtrezoDeArco | AtrezoDeBallesta | AtrezoDeGranada;

/** El atrezo de quien dispara: el arco, la ballesta (o arma de fuego) y la granada. */
export type AtrezoDeTiro = AtrezoDeArco | AtrezoDeBallesta | AtrezoDeGranada;

/**
 * El arma con la que quien dispara pelea cuerpo a cuerpo: la del clip `attack`
 * (decisión del usuario, 04-10-2026). `describe` es lo que se le dice al pintor
 * en la hoja B; `atrezo`, lo que lleva el maniquí en ese clip, que reemplaza al
 * arma de tiro mientras dura.
 */
export interface CuerpoACuerpo {
  readonly describe: string;
  readonly atrezo: AtrezoDeMano;
}

/** El arma de la mano derecha. `agarre`: dónde queda la guarda sobre el puño. */
export interface AtrezoDeMano {
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
    /** Lo que remata la punta: la cruz del báculo, la esfera del mago o la hoja de la alabarda. */
    readonly remate?: 'cruz' | 'esfera' | 'hacha';
  };
  readonly escudo: boolean;
  /** Una rodela redonda de este radio en vez del escudo de cometa. */
  readonly rodela?: number;
  /** Una daga en la mano izquierda, de este largo de hoja. */
  readonly daga?: { readonly largo: number };
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

/** Un arco en la mano IZQUIERDA; la derecha, vacía, tensa la cuerda al disparar. */
export interface AtrezoDeArco {
  readonly arco: {
    /** De punta a punta, en recto. */
    readonly largo: number;
    /** Cuánto se curvan las palas hacia la cuerda. */
    readonly combadura: number;
    readonly grosor: number;
  };
  /** La aljaba a la espalda. */
  readonly aljaba: boolean;
  /** El largo de la flecha que se ve en la cuerda mientras se tensa. */
  readonly flecha: number;
  /**
   * En el disparo, cuánto apunta la panza del arco, como mínimo, hacia donde
   * mira (coseno): con la cuerda floja las manos están juntas y su línea es de lado.
   */
  readonly panzaAdelanteMinimo: number;
  /** Fuera del disparo, cuánto apunta, como mínimo, en vertical (coseno). */
  readonly arribaMinimo: number;
  readonly cuerpoACuerpo: CuerpoACuerpo;
}

/** Una ballesta en la mano DERECHA; al disparar, la izquierda sujeta el tablero. */
export interface AtrezoDeBallesta {
  readonly ballesta: {
    /** Tablero por delante del agarre, hasta el arco transversal. */
    readonly delante: number;
    /** Tablero por detrás del agarre: la culata. */
    readonly atras: number;
    /** De punta a punta del arco transversal; 0, un arma de fuego sin arco. */
    readonly palas: number;
    /** Cuánto se curva el arco transversal hacia atrás. */
    readonly combadura: number;
    readonly grosor: number;
  };
  /** Al disparar: a cuántos metros por delante de la derecha sujeta la izquierda. */
  readonly separacionManos: number;
  /** Fuera del disparo: cuánto apunta hacia el suelo, en radianes bajo la horizontal. */
  readonly bajaEnReposo: number;
  readonly cuerpoACuerpo: CuerpoACuerpo;
}

/** Una granada de mano en la DERECHA, que desaparece al soltarla. */
export interface AtrezoDeGranada {
  readonly granada: {
    readonly radio: number;
    /** Lo que asoma la mecha por arriba. */
    readonly mecha: number;
  };
  readonly cuerpoACuerpo: CuerpoACuerpo;
}

/**
 * Las referencias de Mixamo por juego de armas: el rig `y_bot` con los clips del
 * pack de espada y escudo (no hay otros en la máquina) y el atrezo de cada arma.
 * Cada juego se renderiza una vez en `assets/unidades/_poses/<juego>-8d/` y lo
 * reutilizan todas las unidades que lleven esas armas; uno nuevo se hace
 * copiando el más parecido y retocándolo.
 */
/** Lo que no usa un arma de una mano: los ajustes del agarre a dos manos, a cero. */
export const UNA_MANO = {
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

/**
 * Las armas de mano de los tiradores (la tabla del usuario, 04-10-2026). Una
 * hoja recta con guarda, como las espadas ya aprobadas: el pintor cambia la
 * forma por la del personaje (`PAPELES.pose`), el maniquí dice dónde va la mano
 * y hacia dónde apunta el filo.
 */
export const DAGA: CuerpoACuerpo = {
  describe: 'una daga corta en la mano derecha',
  atrezo: {
    espada: { largo: 0.3, guarda: 0.1, puño: 0.1, agarre: 0.06, grosor: 0.012 },
    ...UNA_MANO,
  },
};
export const ESPADA_CORTA: CuerpoACuerpo = {
  describe: 'una espada corta de una mano en la derecha',
  atrezo: {
    espada: { largo: 0.6, guarda: 0.16, puño: 0.13, agarre: 0.07, grosor: 0.018 },
    ...UNA_MANO,
  },
};
export const SABLE: CuerpoACuerpo = {
  describe: 'un sable de una mano en la derecha',
  atrezo: {
    espada: { largo: 0.8, guarda: 0.14, puño: 0.14, agarre: 0.07, grosor: 0.016 },
    ...UNA_MANO,
  },
};

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
  // Arco en la izquierda y la derecha vacía, con la aljaba a la espalda: los
  // arqueros. El disparo son las poses de tensar y soltar de `POSE_A_DISTANCIA`;
  // el ataque, la daga con el golpe corto de espada, sin el arco (decisión del
  // usuario, 04-10-2026); el reposo, la guardia quieta de `idle (4)`, como todo
  // juego sin escudo.
  arco: {
    describe: 'arco en la mano izquierda y aljaba a la espalda',
    ataque: 'quick',
    disparo: 'bow',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      arco: { largo: 1.25, combadura: 0.12, grosor: 0.018 },
      aljaba: true,
      flecha: 0.7,
      panzaAdelanteMinimo: 0.7,
      arribaMinimo: 0.8,
      cuerpoACuerpo: DAGA,
    },
  },
  // Ballesta en la derecha: el ballestero. Al disparar se la sube al hombro; de
  // cerca, espada corta. Quien dispara otra arma al hombro (arcabuz, culebrina,
  // rifle) lleva su propio maniquí sin arco (`maniqui` en `tools/taller/unidades.ts`).
  ballesta: {
    describe: 'ballesta en la mano derecha',
    ataque: 'quick',
    disparo: 'crossbow',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      ballesta: { delante: 0.5, atras: 0.2, palas: 0.6, combadura: 0.08, grosor: 0.025 },
      separacionManos: 0.24,
      bajaEnReposo: 0.5,
      cuerpoACuerpo: ESPADA_CORTA,
    },
  },
  // Granada de mano en la derecha: el granadero (04-10-2026). El disparo arma
  // el brazo por encima del hombro y lanza (`grenade` en `POSE_A_DISTANCIA`); de
  // cerca, el sable.
  granada: {
    describe: 'granada de mano en la derecha, lanzada por encima del hombro',
    ataque: 'quick',
    disparo: 'grenade',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: { granada: { radio: 0.08, mecha: 0.07 }, cuerpoACuerpo: SABLE },
  },
} as const satisfies Record<
  string,
  {
    describe: string;
    /** El clip del ataque, que es siempre cuerpo a cuerpo. */
    ataque: string;
    /** Solo quien dispara: el clip del disparo (hoja C) y su curva (`CURVAS_DEL_DISPARO`). */
    disparo?: ClipDeDisparo;
    reposo: string;
    piernasDeColor: boolean;
    atrezo: Atrezo;
  }
>;
export type JuegoDeArmas = keyof typeof JUEGOS_DE_ARMAS;

/**
 * Un juego de armas con poses en 8 direcciones: los de sprite-forge y la
 * montura, que sale de `tools/art/montura.ts --8d` y no está en
 * `JUEGOS_DE_ARMAS`.
 */
export type JuegoEn8d = JuegoDeArmas | JuegoMontado;

/**
 * Los jinetes, que salen de `tools/art/montura.ts --8d` y no de
 * `JUEGOS_DE_ARMAS`: con qué pelean de cerca —el tajo de espada desde la silla,
 * los dos— y, quien dispara, con qué curva (`CURVAS_DEL_DISPARO`) y cuánto dura
 * el disparo, que no sale de un clip de Mixamo.
 */
export const JUEGOS_MONTADOS: Readonly<
  Record<
    'montado-lanza' | 'montado-pistola',
    {
      readonly cuerpoACuerpo: string;
      readonly disparo?: ClipDeDisparo;
      /** En segundos; solo quien dispara. */
      readonly duracionDelDisparo?: number;
    }
  >
> = {
  'montado-lanza': {
    cuerpoACuerpo: 'una espada de una mano, con un tajo desde la silla',
  },
  'montado-pistola': {
    cuerpoACuerpo: 'una espada de una mano, con un tajo desde la silla',
    disparo: 'pistol',
    duracionDelDisparo: 1,
  },
};
export type JuegoMontado = keyof typeof JUEGOS_MONTADOS;

const esMontado = (j: JuegoEn8d): j is JuegoMontado => j in JUEGOS_MONTADOS;

/** La carpeta de las poses en 8 direcciones de un juego de armas, la montura incluida. */
export const carpetaDePoses = (j: JuegoEn8d): string => join(DIR_POSES, `${j}-8d`);

/**
 * La unidad definitiva: 8 direcciones y 6 acciones, y la séptima, el disparo,
 * en quien dispara. Cada dirección se reparte en las hojas de `HOJAS_DE_FIGURA`:
 * dos de 3 filas, que es el tamaño que ChatGPT pinta bien, y la C de una sola
 * fila para el disparo. No se espeja ninguna dirección: con la luz fija a la
 * izquierda, espejar la traería de la derecha.
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
  /**
   * El clip de Mixamo de las acciones que son iguales en todo juego, y cuáles
   * se muestrean en bucle. El reposo, el ataque y el disparo los pone cada juego
   * de armas (`hojasDe`).
   */
  anims: { walk: 'walk', charge: 'run', hurt: 'impact3', death: 'death' },
  enBucle: ['idle', 'walk', 'charge'] as readonly ClipDeFigura[],
} as const;

/** Una fila de una hoja de pose: qué acción es, con qué clip de Mixamo y si es bucle. */
export interface FilaDePose {
  readonly clip: ClipDeFigura;
  readonly anim: string;
  readonly enBucle: boolean;
}

/**
 * Las hojas de un juego de armas, en el reparto de `HOJAS_DE_FIGURA`: la A y la
 * B siempre, la C solo si dispara. Cada fila con el clip que le pone el juego.
 */
export function hojasDe(j: JuegoDeArmas): Partial<Record<HojaDeFigura, FilaDePose[]>> {
  const juego: { readonly reposo: string; readonly ataque: string; readonly disparo?: string } =
    JUEGOS_DE_ARMAS[j];
  const anims: Partial<Record<ClipDeFigura, string>> = {
    ...OCHO_DIRECCIONES.anims,
    idle: juego.reposo,
    attack: juego.ataque,
    ...(juego.disparo === undefined ? {} : { shoot: juego.disparo }),
  };
  const fila = (clip: ClipDeFigura): FilaDePose => {
    const anim = anims[clip];
    if (anim === undefined)
      throw new Error(`el juego «${j}» no dice con qué clip se pinta «${clip}»`);
    return { clip, anim, enBucle: OCHO_DIRECCIONES.enBucle.includes(clip) };
  };
  return Object.fromEntries(
    hojasDeFigura(clipDeDisparoDe(j) !== null).map((h) => [h, HOJAS_DE_FIGURA[h].map(fila)]),
  );
}

/** El clip del disparo de un juego (arco, ballesta, granada, pistola); `null` si no dispara. */
export function clipDeDisparoDe(j: JuegoEn8d): ClipDeDisparo | null {
  if (esMontado(j)) return JUEGOS_MONTADOS[j].disparo ?? null;
  const juego: { readonly ataque: string; readonly disparo?: ClipDeDisparo } = JUEGOS_DE_ARMAS[j];
  return juego.disparo ?? null;
}

/**
 * Con qué pelea cuerpo a cuerpo quien dispara, para decírselo al pintor de su
 * hoja B; `null` si no dispara. El atrezo es el de su maniquí, si tiene uno
 * propio, o el de su juego; el de un jinete está en `JUEGOS_MONTADOS`, porque su
 * tajo de espada lo pinta `montura/escena.js`.
 */
export function cuerpoACuerpoDe(j: JuegoEn8d, maniqui?: Atrezo): string | null {
  if (clipDeDisparoDe(j) === null) return null;
  if (esMontado(j)) return JUEGOS_MONTADOS[j].cuerpoACuerpo;
  return armaDeManoDe(j, maniqui ?? JUEGOS_DE_ARMAS[j].atrezo).describe;
}

/** El arma de mano del atrezo de un tirador; lanza si no la lleva. */
function armaDeManoDe(j: JuegoDeArmas, atrezo: Atrezo): CuerpoACuerpo {
  if (!('cuerpoACuerpo' in atrezo)) {
    throw new Error(
      `el juego «${j}» dispara y su atrezo no lleva arma de cuerpo a cuerpo (\`cuerpoACuerpo\`): su ataque no tendría con qué pintarse`,
    );
  }
  return atrezo.cuerpoACuerpo;
}

/**
 * La primera columna de la fila del disparo (`shoot`) en la que ya ha soltado:
 * la misma `indicesDeClip` que reparte los fotogramas del render en las
 * columnas y la misma curva con la que el maniquí deja de pintar la flecha. La
 * escribe `pnpm taller derivar-poses` en `atlas-8d.json` (`suelta`) y el
 * cliente suelta ahí el proyectil. Lanza si la cuerda no llega a soltarse.
 */
export function columnaDeSuelta(clip: ClipDeDisparo, fotogramas: number, columnas: number): number {
  const col = indicesDeClip(fotogramas, columnas, false).findIndex(
    (f) => !DISPARO_EN_NODE.cuerdaTensa(clip, DISPARO_EN_NODE.progresoDelDisparo(f, fotogramas)),
  );
  if (col <= 0) {
    throw new Error(
      `el disparo «${clip}» en ${fotogramas} fotogramas y ${columnas} columnas no tiene columna de suelta (${col}): o nunca suelta o ya empieza suelto`,
    );
  }
  return col;
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

/**
 * El maniquí propio de una unidad: el de su juego de armas con el atrezo
 * cambiado para que se parezca a lo que lleva (decisión del usuario,
 * 04-10-2026: el Y Bot no es sagrado; si lleva daga, el palo se acorta).
 */
export const DIR_MANIQUIES = join(DIR_POSES, 'unidades');
export const carpetaDeManiqui = (id: string): string => join(DIR_MANIQUIES, `${id}-8d`);

/** Una llamada a sprite-forge: los clips de Mixamo que renderiza con un mismo atrezo. */
interface PasadaDelRender {
  readonly atrezo: Atrezo;
  readonly anims: readonly string[];
  readonly disparo: ClipDeDisparo | null;
}

/**
 * Las llamadas a sprite-forge de un juego. Quien no dispara, una. Quien dispara,
 * dos: todo con su arma de tiro y, aparte, el ataque con su arma de mano
 * (decisión del usuario, 04-10-2026: el ataque es cuerpo a cuerpo). Van aparte
 * porque sprite-forge reconoce un clip por el hash del FBX, no por su id: `quick`
 * y `bow` son el mismo `attack (4).fbx`, y en una sola llamada el ataque salía
 * con el arco. Valida al tirador antes de renderizar nada.
 */
function pasadasDelRender(
  juego: JuegoDeArmas,
  hojas: Partial<Record<HojaDeFigura, FilaDePose[]>>,
  atrezo: Atrezo,
): PasadaDelRender[] {
  const filas = Object.values(hojas).flat();
  const animsDe = (f: (c: FilaDePose) => boolean) => [
    ...new Set(filas.filter(f).map((c) => c.anim)),
  ];
  const disparo = clipDeDisparoDe(juego);
  if (disparo === null) return [{ atrezo, anims: animsDe(() => true), disparo }];
  const { ataque } = JUEGOS_DE_ARMAS[juego];
  // Un tirador sin arma de mano pintaría su ataque con el arma de tiro, que es
  // justo lo que la hoja C vino a quitar.
  const deCerca = armaDeManoDe(juego, atrezo).atrezo;
  if ((ataque as string) === disparo) {
    throw new Error(`el juego «${juego}» ataca y dispara con el mismo clip «${disparo}»`);
  }
  return [
    { atrezo, anims: animsDe((c) => c.clip !== 'attack'), disparo },
    { atrezo: deCerca, anims: animsDe((c) => c.clip === 'attack'), disparo: null },
  ];
}

/**
 * Renderiza las hojas de pose de un juego de armas —16, o 24 si dispara— y
 * devuelve su carpeta. Con `maniqui`, las de una unidad: los clips del juego
 * con su atrezo, en `carpetaDeManiqui(id)`.
 */
export async function renderizarOchoDirecciones(
  juego: JuegoDeArmas,
  destino = DIR_POSES,
  maniqui?: { readonly id: string; readonly atrezo: Atrezo },
): Promise<string> {
  const { celda, encuadre } = OCHO_DIRECCIONES;
  const hojas = hojasDe(juego);
  const perfil = maniqui ? `${maniqui.id}-8d` : `${juego}-8d`;
  const atrezo: Atrezo = maniqui?.atrezo ?? JUEGOS_DE_ARMAS[juego].atrezo;
  const { piernasDeColor } = JUEGOS_DE_ARMAS[juego];
  const { columnas } = FIGURA;
  const pasadas = pasadasDelRender(juego, hojas, atrezo);
  const temporal = await mkdtemp(join(tmpdir(), 'heroes-poses-8d-'));
  try {
    // Dónde dejó cada pasada los fotogramas de cada clip de Mixamo.
    const framesDe: Record<string, string> = {};
    for (const [n, pasada] of pasadas.entries()) {
      const forge = join(temporal, `pasada-${n}`);
      await mkdir(forge);
      await prepararForge(forge, encuadre, pasada.atrezo, piernasDeColor, pasada.disparo);
      const salida = join(forge, 'out');
      execFileSync(
        process.execPath,
        [
          join(forge, 'bin/sprite-forge.mjs'),
          'render',
          '--assets',
          FBX,
          '--models',
          'y_bot',
          '--anims',
          ...pasada.anims,
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
      for (const a of pasada.anims) framesDe[a] = join(salida, 'frames/y_bot', a, 'tactical_25');
    }

    const carpeta = join(destino, perfil);
    await mkdir(carpeta, { recursive: true });
    const meta: Record<string, unknown> = {};
    const indicesPorClip: Record<string, number[]> = {};
    for (const filas of Object.values(hojas)) {
      for (const c of filas) {
        const m = JSON.parse(
          await readFile(join(framesDe[c.anim] as string, 'meta.json'), 'utf8'),
        ) as MetaDeClip;
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
              framesDe[c.anim] as string,
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
          ...(maniqui ? { unidad: maniqui.id } : {}),
          atrezo,
          piernasDeColor,
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
