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
 * escudo de cometa plano en el antebrazo izquierdo, colgados de sus huesos para
 * que sigan cada clip. Con el arma dibujada en la referencia, el modelo de
 * imagen copia su largo y su ángulo en vez de inventarlos (como la lanza del
 * jinete en `montura/escena.js`). Gris como el maniquí: dice forma, no aspecto.
 *
 * Los giros y posiciones van en el sistema del hueso, en centímetros; se
 * ajustan mirando el render (`HEROES_ATREZO` los sobrescribe para probar).
 */
const AJUSTE_ATREZO = (() => {
  const base = {
    // La hoja sale hacia el lado del pulgar: en el ataque prolonga el brazo
    // hacia el enemigo y en reposo apunta abajo y adelante (elegida entre los
    // cuatro ejes posibles mirando el render).
    espada: { largo: 0.85, giro: [0, 0, Math.PI / 2], pos: [0, 8, 0] },
    // Plano, vertical y con la punta abajo, por fuera del antebrazo.
    escudo: { giro: [0, 0, Math.PI / 2], pos: [0, 12, 6] },
  };
  const env = process.env.HEROES_ATREZO;
  return env === undefined ? base : { ...base, ...(JSON.parse(env) as Partial<typeof base>) };
})();

const ATREZO = `
function ponerAtrezo(model, prefijo, ajuste) {
  let material = null;
  model.traverse((n) => { if (!material && n.isMesh) material = Array.isArray(n.material) ? n.material[0] : n.material; });
  const hueso = (nombre) => {
    const h = model.getObjectByName(prefijo + nombre);
    if (!h) throw new Error('el rig no tiene el hueso ' + prefijo + nombre);
    return h;
  };
  const espada = new THREE.Group();
  const hoja = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, ajuste.espada.largo, 8), material);
  hoja.position.y = ajuste.espada.largo / 2 + 0.07;
  const guarda = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.035), material);
  guarda.position.y = 0.07;
  const puño = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), material);
  espada.add(hoja, guarda, puño);
  espada.scale.setScalar(100);
  espada.rotation.set(...ajuste.espada.giro);
  espada.position.set(...ajuste.espada.pos);
  hueso('RightHand').add(espada);

  const forma = new THREE.Shape();
  forma.moveTo(-0.24, 0.3);
  forma.lineTo(0.24, 0.3);
  forma.lineTo(0.2, -0.05);
  forma.lineTo(0, -0.45);
  forma.lineTo(-0.2, -0.05);
  forma.closePath();
  const plano = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.03, bevelEnabled: false }), material);
  const escudo = new THREE.Group();
  escudo.add(plano);
  escudo.scale.setScalar(100);
  escudo.rotation.set(...ajuste.escudo.giro);
  escudo.position.set(...ajuste.escudo.pos);
  hueso('LeftForeArm').add(escudo);
}
`;

async function prepararForge(
  temporal: string,
  encuadre: Encuadre = ENCUADRE_DE_FIGURA,
  atrezo = false,
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
  if (${atrezo}) ponerAtrezo(model, bonePrefix, ${JSON.stringify(AJUSTE_ATREZO)});
  scene.updateMatrixWorld(true);
  const suelo = puntoMasBajo(model);
  Object.assign(state, { renderer, scene, camera, pivot, mixer, clip, model, animId, golpe, suelo });`,
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
  await writeFile(rutaPagina, pagina + POSE_A_DISTANCIA + PUNTO_MAS_BAJO + ATREZO);
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

/**
 * La unidad definitiva: 8 direcciones y 6 acciones. Cada dirección se reparte en
 * dos hojas de 3 filas, que es el tamaño que ChatGPT pinta bien: la A es la
 * locomoción y la B es ataque, daño y muerte, juntos para que la muerte se pinte
 * en la misma imagen que el daño del que arranca. No se espeja ninguna
 * dirección: con la luz fija a la izquierda, espejar la traería de la derecha.
 */
export const OCHO_DIRECCIONES = {
  perfil: 'espada-escudo-8d',
  /** A 6 fps la carrera da 4 fotogramas para 7 columnas: se repetirían. */
  fps: 12,
  /** El cadáver cae hacia la cámara y en 256 se sale por abajo. */
  celda: FIGURA_8D.celda,
  encuadre: { ortho: FIGURA_8D.ortho, objetivo: FIGURA_8D.objetivo },
  hojas: {
    a: [
      { clip: 'idle', anim: 'idle', enBucle: true },
      { clip: 'walk', anim: 'walk', enBucle: true },
      { clip: 'charge', anim: 'run', enBucle: true },
    ],
    b: [
      { clip: 'attack', anim: 'quick', enBucle: false },
      { clip: 'hurt', anim: 'impact3', enBucle: false },
      { clip: 'death', anim: 'death', enBucle: false },
    ],
  },
} as const;
export type Hoja8d = keyof typeof OCHO_DIRECCIONES.hojas;

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

/** Renderiza las 16 hojas de pose y devuelve su carpeta. */
export async function renderizarOchoDirecciones(destino = DIR_POSES): Promise<string> {
  const { celda, encuadre, hojas, perfil } = OCHO_DIRECCIONES;
  const { columnas } = FIGURA;
  const temporal = await mkdtemp(join(tmpdir(), 'heroes-poses-8d-'));
  try {
    await prepararForge(temporal, encuadre, true);
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
  if (arg === '--giro') {
    console.log(await componerGiro(join(DIR_POSES, OCHO_DIRECCIONES.perfil)));
    process.exit(0);
  }
  if (arg === '--8d') {
    console.log(`→ ${await renderizarOchoDirecciones(process.argv[3])}`);
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
