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
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FIGURA } from '../../src/shared/arte.js';
import { POSE_A_DISTANCIA } from './ybot-a-distancia.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const FORGE = resolve(process.env.SPRITE_FORGE_DIR ?? join(RAIZ, '../sprite-forge'));
const FBX = resolve(process.env.SPRITE_FORGE_ASSETS ?? join(RAIZ, '../ne-fan/assets/characters'));
export const DIR_POSES = join(RAIZ, 'assets/unidades/_poses');

/** Las animaciones que se le añaden al set de sprite-forge, además de las suyas. */
const ANIMS_EXTRA = [
  { id: 'casting', file: 'anims/sword_and_shield/sword and shield casting.fbx' },
  // El arco no tiene clip de Mixamo: el FBX solo da la postura y los brazos los
  // coloca `POSE_A_DISTANCIA` fotograma a fotograma.
  { id: 'bow', file: 'anims/sword_and_shield/sword and shield attack (4).fbx' },
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

async function prepararForge(temporal: string): Promise<void> {
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
      .replace('ortho: 2.4', `ortho: ${FIGURA.camara.ortho}`)
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
  const parches: [string, string][] = [
    [
      'Object.assign(state, { renderer, scene, camera, pivot, mixer, clip });',
      'Object.assign(state, { renderer, scene, camera, pivot, mixer, clip, model, animId });',
    ],
    [
      '    mixer.setTime(Math.min(clip.duration, frameStep * f));',
      `    if (state.animId === 'bow') {
      pivot.rotation.set(0, 0, 0);
      mixer.setTime(0);
      scene.updateMatrixWorld(true);
      rangedPose(state.model, 'bow', f);
      pivot.rotation.set(0, (2 * Math.PI * dir) / directions, 0);
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
  await writeFile(rutaPagina, pagina + POSE_A_DISTANCIA);
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
      // El arco son 6 poses escritas a mano, no fotogramas de un clip.
      const total = c.anim === 'bow' ? 6 : meta.frame_count;
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

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) {
  const arg = process.argv[2];
  const todos = Object.keys(PERFILES) as Perfil[];
  const pedidos = arg === '--todos' ? todos : [arg as Perfil];
  for (const p of pedidos) {
    if (!(p in PERFILES)) {
      throw new Error(`perfil desconocido «${p}». Hay: ${todos.join(', ')}, o --todos`);
    }
    console.log(`→ ${await renderizarPerfil(p)}`);
  }
}
