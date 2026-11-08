/**
 * El render del maniquí Y Bot con sprite-forge a la cámara del juego: copia
 * sprite-forge a un directorio temporal y lo parchea (`prepararForge`: la cámara a
 * 25°, la luz del contrato, los clips de `ANIMS_EXTRA` y el JavaScript de
 * `three.ts`), y renderiza las hojas de referencia de un perfil
 * (`renderizarPerfil`), las de ocho direcciones de un juego o del maniquí propio de
 * una unidad (`renderizarOchoDirecciones`, con su profundidad, `hojaDeProfundidad`),
 * el giro (`componerGiro`) y el muestrario de clips (`renderizarMuestrario`).
 *
 * Lleva sharp y lanza el proceso de sprite-forge (que trae three y playwright, en su
 * repositorio); las tablas que lee son de `juegos.ts` y `clips.ts`. Lo lanzan
 * `cli.ts` y las órdenes del taller. Vivía en `tools/art/poses.ts` (H4 de la
 * reorganización, 08-11-2026).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FIGURA, type HojaDeFigura, luzEnElMundo } from '../../../src/shared/arte.js';
import { sha256 } from '../../comun/hash.js';
import { aRaster, dePng } from '../../comun/imagen.js';
import { RAIZ } from '../../comun/raiz.js';
import { type ClipDeDisparo, esDisparo, POSE_A_DISTANCIA } from '../ybot-a-distancia.js';
import {
  ANIMS_EXTRA,
  type ArchivosDeDañoYMuerte,
  archivoDeClip,
  archivosDeDañoYMuerte,
  type ClipsDeManiqui,
  type FilaDePose,
  hojasDe,
  indicesDeClip,
  indicesDeTramo,
  OCHO_DIRECCIONES,
} from './clips.js';
import {
  type Atrezo,
  armaDeManoDe,
  clipDeDisparoDe,
  DIR_POSES,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
  PERFILES,
  type Perfil,
} from './juegos.js';
import { ATREZO, HUESOS, PIERNAS, PUNTO_MAS_BAJO } from './three.js';

const FORGE = resolve(process.env.SPRITE_FORGE_DIR ?? join(RAIZ, '../sprite-forge'));
const FBX = resolve(process.env.SPRITE_FORGE_ASSETS ?? join(RAIZ, '../ne-fan/assets/characters'));

/** Cómo se encuadra el render: el alto del encuadre en metros y a qué altura mira. */
interface Encuadre {
  readonly ortho: number;
  /** La altura en metros del punto al que apunta la cámara (sprite-forge usa 0,95). */
  readonly objetivo: number;
}
const ENCUADRE_DE_FIGURA: Encuadre = { ortho: FIGURA.camara.ortho, objetivo: 0.95 };

/**
 * El mapa de profundidad del maniquí (prueba del 10-10-2026: ¿el modelo de
 * imagen copia mejor el balanceo si ve el volumen?). La cámara se ciñe a
 * `metros` delante y detrás del punto mirado, y al componer la hoja los grises
 * de cada celda se estiran entre sus percentiles `recorte` y `1 − recorte`
 * hasta `de`-255: lo más lejano no se confunde con el negro del fondo sobre el
 * que se le enseña.
 */
export const PROFUNDIDAD_DEL_MANIQUI = { metros: 0.9, de: 48, recorte: 0.02 } as const;

/**
 * La muerte arranca desde el último fotograma de recibir daño, no desde el
 * reposo: al preparar el clip `death` se carga además el de `hit_react` y se
 * funde de su pose final a la muerte en los primeros `FUNDIDO_MUERTE` segundos.
 */
const FUNDIDO_MUERTE = 0.4;

async function prepararForge(
  temporal: string,
  encuadre: Encuadre = ENCUADRE_DE_FIGURA,
  atrezo: Atrezo | null = null,
  piernasDeColor = false,
  /** El clip del disparo, si el juego dispara: el de su `disparo`. */
  clipDeDisparo: ClipDeDisparo | null = null,
  /**
   * El segundo del clip `death` desde el que se muestrea (`ClipsDeManiqui.tramos`):
   * el fundido desde el final del daño empieza ahí, no en el 0.
   */
  inicioDeLaMuerte = 0,
  /**
   * El mapa de profundidad en vez del color (`PROFUNDIDAD_DEL_MANIQUI`): cada
   * fotograma con `MeshDepthMaterial`, claro cerca, y la cámara ceñida a la
   * figura para que los grises den el volumen y no el encuadre.
   */
  profundidad = false,
  /** Los FBX del daño y de la muerte (`archivosDeDañoYMuerte`). */
  archivos: ArchivosDeDañoYMuerte = archivosDeDañoYMuerte(),
  /**
   * Además de cada fotograma, dónde cae en él cada hueso y cada pieza del atrezo
   * (`HUESOS_DEL_MANIQUI`): el esqueleto de verdad con que se juzga lo pintado.
   * Solo lee: la imagen sale igual.
   */
  huesos = false,
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
  const set = JSON.parse(await readFile(rutaSet, 'utf8')) as {
    animations: unknown[];
  };
  // Copias: el bucle de abajo les cambia el FBX y `ANIMS_EXTRA` es de todo el proceso
  // (el 10-10-2026 el `impact2` de una unidad se quedó en las siguientes).
  set.animations.push(...ANIMS_EXTRA.map((a) => ({ ...a })));
  // El golpe y la muerte de la unidad: las filas siguen llamándose `impact3` y
  // `death` (la muerte se funde desde el daño por ese id), pero con su FBX.
  for (const a of set.animations as { id: string; file: string }[]) {
    if (a.id === OCHO_DIRECCIONES.anims.hurt) a.file = archivos.daño;
    if (a.id === OCHO_DIRECCIONES.anims.death) a.file = archivos.muerte;
  }
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
    // Una vez por escena: cada clip monta la suya (__spriteSetup).
    if (${profundidad} && scene.overrideMaterial === null) {
      const lejos = camera.position.distanceTo(new THREE.Vector3(0, TARGET_HEIGHT, 0));
      camera.near = lejos - ${PROFUNDIDAD_DEL_MANIQUI.metros};
      camera.far = lejos + ${PROFUNDIDAD_DEL_MANIQUI.metros};
      camera.updateProjectionMatrix();
      scene.overrideMaterial = new THREE.MeshDepthMaterial();
    }
    if (${huesos}) apuntarHuesos(f);
    renderer.render(scene, camera);
    out.push(`,
    ],
    [
      'Object.assign(state, { renderer, scene, camera, pivot, mixer, clip });',
      `let golpe = null;
  if (animId === 'death') {
    const urlGolpe = animUrl.replace(/[/]assets[/].*$/, '/assets/${archivos.daño.split('/').map(encodeURIComponent).join('/')}');
    if (urlGolpe === animUrl) throw new Error('no sé dónde está el clip de daño junto a ' + animUrl);
    const raizGolpe = await loadFbx(urlGolpe);
    const clipGolpe = raizGolpe.animations.find((c) => c.name === 'mixamo.com') ?? raizGolpe.animations.at(-1);
    remapTrackPrefix(clipGolpe, detectBonePrefix(clipGolpe.tracks.map((t) => trackNode(t.name).node)), bonePrefix);
    const accionGolpe = mixer.clipAction(clipGolpe);
    accionGolpe.setLoop(THREE.LoopOnce, 1);
    accionGolpe.clampWhenFinished = true;
    accionGolpe.play();
    golpe = { accion: accionGolpe, fin: clipGolpe.duration - 1e-4, duracion: clipGolpe.duration, muerte: action };
  }
  const confAtrezo = ${JSON.stringify(atrezo)};
  const atrezo = confAtrezo ? crearAtrezo(model, bonePrefix, confAtrezo) : null;
  for (const pieza of atrezo?.piezas ?? []) scene.add(pieza);
  if (${piernasDeColor}) colorearPiernas(model);
  scene.updateMatrixWorld(true);
  const suelo = puntoMasBajo(model);
  Object.assign(state, { renderer, scene, camera, pivot, mixer, clip, model, animId, golpe, suelo, atrezo, prefijo: bonePrefix, clipDeDisparo: ${JSON.stringify(clipDeDisparo)} });`,
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
      const w = Math.min(1, Math.max(0, (t - ${inicioDeLaMuerte}) / ${FUNDIDO_MUERTE}));
      const s = w * w * (3 - 2 * w);
      mixer.setTime(t);
      // El daño se sostiene en el último fotograma que enseña su fila, el
      // fotograma n − 1 de sprite-forge (n = round(duración × fps)), no en el final
      // del clip: en su último instante Mixamo vuelve a la guardia, y la
      // muerte arrancaba de una pose que la fila del daño no enseña.
      const n = Math.max(1, Math.round(state.golpe.duracion / frameStep));
      state.golpe.accion.time = Math.min(state.golpe.fin, (n - 1) * frameStep);
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
  await writeFile(
    rutaPagina,
    pagina + POSE_A_DISTANCIA + PUNTO_MAS_BAJO + ATREZO + PIERNAS + (huesos ? HUESOS : ''),
  );
  if (huesos) {
    const rutaRender = join(temporal, 'src/render.mjs');
    const render = await readFile(rutaRender, 'utf8');
    const antes = `        return writeFile(join(destino, nombreFrame(d, f)), Buffer.from(b64, "base64"));
      }),
    );
`;
    if (!render.includes(antes))
      throw new Error('sprite-forge cambió: falta la escritura de los fotogramas en render.mjs');
    await writeFile(
      rutaRender,
      render.replace(
        antes,
        `${antes}    const huesos = await page.evaluate(() => { const h = window.__huesos ?? {}; window.__huesos = {}; return h; });
    await writeFile(join(destino, \`dir_\${d}_huesos.json\`), JSON.stringify(huesos));
`,
      ),
    );
  }
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
    { clip: 'idle', anim: 'idle4', enBucle: true },
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

/** Una llamada a sprite-forge: los clips de Mixamo que renderiza con un mismo atrezo. */
interface PasadaDelRender {
  readonly atrezo: Atrezo | null;
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
  atrezo: Atrezo | null,
): PasadaDelRender[] {
  const filas = Object.values(hojas).flat();
  const animsDe = (f: (c: FilaDePose) => boolean) => [
    ...new Set(filas.filter(f).map((c) => c.anim)),
  ];
  const disparo = clipDeDisparoDe(juego);
  if (disparo === null) return [{ atrezo, anims: animsDe(() => true), disparo }];
  const ataque = filas.find((c) => c.clip === 'attack')?.anim;
  // Un tirador sin arma de mano pintaría su ataque con el arma de tiro, que es
  // justo lo que la hoja C vino a quitar.
  const deCerca = armaDeManoDe(juego, atrezo).atrezo;
  if (ataque === disparo) {
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
  maniqui?: {
    readonly id: string;
    /**
     * `null`: sin nada en las manos, el maniquí civil de la gente (`pnpm taller
     * maniqui --civil`, el banco de NPC): el de `_poses/civil-8d/` sin
     * profundidad, que es el Y Bot del cliente y no se toca.
     */
    readonly atrezo: Atrezo | null;
    readonly clips?: ClipsDeManiqui;
    /** Además, cada hoja en mapa de profundidad y en color sombreado por él. */
    readonly profundidad?: boolean;
    /**
     * Una carpeta donde guardar los fotogramas enteros de cada clip (en color),
     * no solo los siete de cada fila (`carpetaDeFotogramas`), para mirarlos: los
     * leían los modelos de vídeo del taller, retirados el 06-11-2026.
     */
    readonly fotogramas?: string;
    /**
     * Además, por hoja, `d<n>-<h>.huesos.json`: el esqueleto de cada celda en sus
     * píxeles y en el mundo (`HUESOS_DEL_MANIQUI`), con el sha256 de la hoja de la
     * que sale: el que mide lo pintado contra el maniquí y la compuerta del
     * trabajador (`tools/taller/revision/maniqui.ts`). Apuntarlo no cambia la imagen.
     */
    readonly huesos?: boolean;
  },
): Promise<string> {
  const { celda, encuadre } = OCHO_DIRECCIONES;
  const hojas = hojasDe(juego, maniqui?.clips);
  const inicioDeLaMuerte = maniqui?.clips?.tramos?.death?.[0] ?? 0;
  // La muerte arranca del último fotograma del daño entero (`prepararForge`):
  // con un tramo del daño, su primera columna dejaría de ser la última de él.
  if (maniqui?.clips?.tramos?.hurt !== undefined)
    throw new Error(`${maniqui.id}: el daño no admite tramo, la muerte arranca de su final`);
  const perfil = maniqui ? `${maniqui.id}-8d` : `${juego}-8d`;
  const atrezo: Atrezo | null =
    maniqui === undefined ? JUEGOS_DE_ARMAS[juego].atrezo : maniqui.atrezo;
  const { piernasDeColor } = JUEGOS_DE_ARMAS[juego];
  const { columnas } = FIGURA;
  const pasadas = pasadasDelRender(juego, hojas, atrezo);
  const temporal = await mkdtemp(join(tmpdir(), 'heroes-poses-8d-'));
  try {
    // Dónde dejó cada pasada los fotogramas de cada clip de Mixamo, en color y
    // (si se pide) en profundidad: la misma pasada otra vez con ese material.
    const framesDe: Record<string, string> = {};
    const profundidadDe: Record<string, string> = {};
    const tandas = pasadas.flatMap((pasada, n) => [
      { pasada, n, profundidad: false },
      ...(maniqui?.profundidad ? [{ pasada, n, profundidad: true }] : []),
    ]);
    for (const { pasada, n, profundidad } of tandas) {
      const forge = join(temporal, `pasada-${n}${profundidad ? '-profundidad' : ''}`);
      await mkdir(forge);
      await prepararForge(
        forge,
        encuadre,
        pasada.atrezo,
        piernasDeColor,
        pasada.disparo,
        inicioDeLaMuerte,
        profundidad,
        archivosDeDañoYMuerte(maniqui?.clips),
        maniqui?.huesos === true && !profundidad,
      );
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
      for (const a of pasada.anims)
        (profundidad ? profundidadDe : framesDe)[a] = join(
          salida,
          'frames/y_bot',
          a,
          'tactical_25',
        );
    }
    if (maniqui?.fotogramas !== undefined)
      for (const [anim, dir] of Object.entries(framesDe))
        await cp(dir, join(maniqui.fotogramas, anim), { recursive: true });

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
        indicesPorClip[c.clip] = indicesDeTramo(
          m.frame_count,
          OCHO_DIRECCIONES.fps,
          c.tramo,
          columnas,
          c.enBucle,
          c.vaiven === true,
        );
      }
    }
    const shas: Record<string, string> = {};
    for (let d = 0; d < 8; d += 1) {
      for (const [hoja, filas] of Object.entries(hojas)) {
        const componer = (de: Record<string, string>) =>
          sharp({
            create: {
              width: columnas * celda,
              height: filas.length * celda,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          })
            .composite(
              filas.flatMap((c, fila) =>
                (indicesPorClip[c.clip] ?? []).map((i, col) => ({
                  input: join(
                    de[c.anim] as string,
                    `dir_${d}_frame_${String(i).padStart(3, '0')}.png`,
                  ),
                  left: col * celda,
                  top: fila * celda,
                })),
              ),
            )
            .png()
            .toBuffer();
        const png = await componer(framesDe);
        const nombre = `d${d}-${hoja}.png`;
        await writeFile(join(carpeta, nombre), png);
        shas[nombre] = sha256(png);
        let profundidadDeLaHoja: Buffer | null = null;
        if (maniqui?.profundidad) {
          // La hoja en profundidad, la pose que se pinta. La mezcla (el color
          // sombreado por ella) era de las pruebas de `experimento.ts`, retiradas el
          // 30-10-2026: ya no se escribe.
          profundidadDeLaHoja = await hojaDeProfundidad(png, await componer(profundidadDe));
          const otra = `d${d}-${hoja}.profundidad.png`;
          await writeFile(join(carpeta, otra), profundidadDeLaHoja);
          shas[otra] = sha256(profundidadDeLaHoja);
        }
        if (maniqui?.huesos) {
          const filasDeHuesos = [];
          for (const c of filas) {
            const deLaDireccion = JSON.parse(
              await readFile(join(framesDe[c.anim] as string, `dir_${d}_huesos.json`), 'utf8'),
            ) as Record<string, unknown>;
            filasDeHuesos.push({
              clip: c.clip,
              celdas: (indicesPorClip[c.clip] ?? []).map((i) => {
                const h = deLaDireccion[String(i)];
                if (h === undefined)
                  throw new Error(
                    `${perfil} d${d} «${c.clip}»: el render no apuntó el esqueleto del fotograma ${i}`,
                  );
                return { fotograma: i, ...(h as object) };
              }),
            });
          }
          await writeFile(
            join(carpeta, `d${d}-${hoja}.huesos.json`),
            `${JSON.stringify({
              hoja: {
                png: sha256(png),
                profundidad: profundidadDeLaHoja === null ? null : sha256(profundidadDeLaHoja),
              },
              celda,
              filas: filasDeHuesos,
            })}\n`,
          );
        }
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
          deathStartsFrom: {
            clip: 'hurt',
            blendSeconds: FUNDIDO_MUERTE,
            at: inicioDeLaMuerte,
          },
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

/**
 * De una hoja del maniquí en color y la misma en profundidad, la que se le enseña
 * al pintor: los grises de cada celda estirados entre sus percentiles `recorte` y
 * `1 − recorte` hasta `PROFUNDIDAD_DEL_MANIQUI.de`-255 (claro cerca: por celda,
 * porque estirada la hoja entera la espada y la carga se comían el rango y la
 * figura quieta salía plana), con la alfa de la de color: su silueta es la que lee
 * `escalaDePose`.
 */
export async function hojaDeProfundidad(color: Buffer, profundidad: Buffer): Promise<Buffer> {
  const c = await aRaster(color);
  const p = (await aRaster(profundidad)).data;
  const { width, height } = c;
  if (p.length !== c.data.length)
    throw new Error(`la hoja de profundidad no mide lo que la de color (${width}×${height})`);
  const { de, recorte } = PROFUNDIDAD_DEL_MANIQUI;
  const lado = width / FIGURA.columnas;
  const gris = Buffer.alloc(c.data.length);
  const pixeles = (cx: number, cy: number) =>
    Array.from({ length: lado * lado }, (_, k) => {
      const x = cx * lado + (k % lado);
      const y = cy * lado + Math.floor(k / lado);
      return (y * width + x) * 4;
    });
  for (let cy = 0; cy < height / lado; cy++) {
    for (let cx = 0; cx < FIGURA.columnas; cx++) {
      const celda = pixeles(cx, cy);
      const dentro = celda.filter(
        (i) => (c.data[i + 3] as number) >= 40 && (p[i + 3] as number) >= 40,
      );
      const grises = dentro.map((i) => p[i] as number).sort((a, b) => a - b);
      const min = grises[Math.floor(grises.length * recorte)] ?? 0;
      const max = grises[Math.ceil(grises.length * (1 - recorte)) - 1] ?? 255;
      for (const i of celda) {
        const alfa = c.data[i + 3] as number;
        const t =
          max > min && (p[i + 3] as number) >= 40
            ? Math.min(1, Math.max(0, ((p[i] as number) - min) / (max - min)))
            : 0;
        const v = de + Math.round(t * (255 - de));
        gris.fill(v, i, i + 3);
        gris[i + 3] = alfa;
      }
    }
  }
  return dePng({ data: gris, width, height });
}

/**
 * Un muestrario de clips para elegir las acciones de una unidad
 * (`ClipsDeManiqui.acciones`): cada clip en una fila, visto de frente y de lado
 * (direcciones 0 y 2) con el atrezo dado, siete columnas por lado repartidas
 * por el clip entero, en una celda pequeña. Devuelve el PNG.
 */
export async function renderizarMuestrario(
  anims: readonly string[],
  atrezo: Atrezo | null,
  destino: string,
  lado = 160,
  /** Además, los fotogramas enteros de cada clip, en `<fotogramas>/<clip>/` (el visor del maniquí). */
  fotogramas?: string,
): Promise<string> {
  for (const a of anims) archivoDeClip(a);
  const { encuadre, celda } = OCHO_DIRECCIONES;
  const temporal = await mkdtemp(join(tmpdir(), 'heroes-muestrario-'));
  try {
    await prepararForge(temporal, encuadre, atrezo);
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
      { stdio: 'ignore' },
    );
    const columnas = FIGURA.columnas;
    const capas: { input: Buffer; left: number; top: number }[] = [];
    if (fotogramas !== undefined)
      for (const a of anims)
        await cp(join(salida, 'frames/y_bot', a, 'tactical_25'), join(fotogramas, a), {
          recursive: true,
        });
    for (const [fila, a] of anims.entries()) {
      const dir = join(salida, 'frames/y_bot', a, 'tactical_25');
      const m = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as MetaDeClip;
      const indices = indicesDeTramo(
        m.frame_count,
        OCHO_DIRECCIONES.fps,
        undefined,
        columnas,
        false,
        false,
      );
      for (const [n, d] of [0, 2].entries())
        for (const [col, i] of indices.entries())
          capas.push({
            input: await sharp(join(dir, `dir_${d}_frame_${String(i).padStart(3, '0')}.png`))
              .resize(lado, lado)
              .toBuffer(),
            left: (n * (columnas + 1) + col) * lado + 220,
            top: fila * lado,
          });
      capas.push({
        input: Buffer.from(
          `<svg width="220" height="${lado}"><text x="8" y="${lado / 2}" font-size="22" font-family="sans-serif">${a} ${(m.frame_count / OCHO_DIRECCIONES.fps).toFixed(1)}s</text></svg>`,
        ),
        left: 0,
        top: fila * lado,
      });
    }
    const png = join(destino);
    await sharp({
      create: {
        width: 220 + (2 * columnas + 1) * lado,
        height: anims.length * lado,
        channels: 4,
        background: { r: 235, g: 235, b: 235, alpha: 1 },
      },
    })
      .composite(capas)
      .png()
      .toFile(png);
    return png;
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}
