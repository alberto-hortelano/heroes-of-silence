/**
 * Animaciones por repintado de atlas.
 *
 *   npx tsx tools/gen/animate.ts peasant --go
 *
 * La idea, heredada de los laboratorios de ne-fan: en vez de pedir N imágenes
 * sueltas —que salen con un personaje distinto cada una—, se manda UNA sola
 * imagen con todas las poses en rejilla. Dentro de un atlas la consistencia es
 * casi perfecta; entre llamadas distintas, no.
 *
 * Reglas que no son negociables, y por qué:
 *   - Máximo 10 celdas por llamada. Con más, el modelo colapsa y pinta la misma
 *     pose en todas.
 *   - Rejilla más o menos cuadrada. Un 4×1 hizo que el modelo re-maquetara.
 *   - La segunda referencia define la IDENTIDAD, no la pose, y hay que decirlo
 *     explícitamente o el resultado sale como hoja de turnaround.
 *   - Si el modelo devuelve el atlas sin repintar, se rechaza y NO se cachea:
 *     cachear eso deja a la criatura congelada para siempre.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { cutoutBackground, detectBackgroundColor, transparencyRatio } from './cutout.js';
import { FalClient, toDataUri } from './fal.js';
import { STYLE_TOKEN } from './prompts.js';
import { CREATURE_PROMPTS } from './prompts.js';

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, 'tools', 'gen', '.cache');
const SPEND_FILE = join(ROOT, 'tools', 'gen', 'spend.json');
const SPRITES_DIR = join(ROOT, 'assets', 'generated', 'creatures');
const OUT_DIR = join(ROOT, 'assets', 'generated', 'anim');

/** Tope duro: por encima, el modelo repite la misma pose en todas las celdas. */
export const ATLAS_MAX_CELLS = 10;
const CELL = 320;

/** Las poses de una unidad de combate por turnos, en orden de lectura. */
export const POSES: readonly { id: string; describe: string }[] = [
  { id: 'idle', describe: 'standing at rest, weapon lowered, weight on both feet' },
  { id: 'ready', describe: 'braced in a combat stance, weapon raised, knees bent' },
  { id: 'attack', describe: 'lunging forward mid-swing, weapon thrust out to the right' },
  { id: 'hit', describe: 'recoiling backwards from a blow, head turned away, off balance' },
  { id: 'die', describe: 'collapsing to the ground, knees buckling, weapon dropped' },
  { id: 'win', describe: 'standing tall in triumph, weapon raised overhead' },
];

const MODEL = {
  endpoint: 'fal-ai/nano-banana-pro/edit',
  costUsd: 0.15,
  params: { resolution: '1K', num_images: 1, output_format: 'png' },
};

function layoutFor(n: number): { cols: number; rows: number } {
  if (n > ATLAS_MAX_CELLS) throw new Error(`${n} celdas superan el tope de ${ATLAS_MAX_CELLS}`);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  // Apaisado: es la forma con la que se validó el atlas en ne-fan.
  return cols >= rows ? { cols, rows } : { cols: rows, rows: cols };
}

/** Rejilla con el mismo sprite repetido: el lienzo que el modelo va a repintar. */
async function composeGrid(sprite: string, n: number): Promise<{ buffer: Buffer; cols: number; rows: number }> {
  const { cols, rows } = layoutFor(n);
  const celda = await sharp(sprite)
    .resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const composites = Array.from({ length: n }, (_, i) => ({
    input: celda,
    left: (i % cols) * CELL,
    top: Math.floor(i / cols) * CELL,
  }));

  const buffer = await sharp({
    create: {
      width: cols * CELL,
      height: rows * CELL,
      channels: 4,
      // Fondo neutro: sobre transparente el modelo inventa escenografía.
      background: { r: 235, g: 235, b: 235, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return { buffer, cols, rows };
}

function buildAtlasPrompt(identidad: string, cols: number, rows: number, n: number): string {
  const celdas = POSES.slice(0, n)
    .map((p, i) => `cell ${i + 1}: ${p.describe}`)
    .join('; ');
  return (
    `${identidad}. The input image is a ${cols}x${rows} grid containing EXACTLY ${n} ` +
    `identical copies of the same character. Repaint every cell so that each one shows ` +
    `the SAME character in a different body pose, in reading order — ${celdas}. ` +
    `Keep the same ${cols}x${rows} grid layout, the same number of cells, and keep every ` +
    `cell aligned to its own square: do not add cells, do not merge cells, do not crop, ` +
    `never split a character across two cells. Every cell keeps the character in side ` +
    `profile facing RIGHT, at the same scale, with the same clothing, colors and gear. ` +
    `The second reference image defines the character's appearance and identity ONLY. ` +
    `Plain flat light-grey background in every cell, no scenery, no text, no borders. ` +
    `${STYLE_TOKEN}`
  );
}

/**
 * ¿Ha repintado el modelo, o ha devuelto el mismo lienzo?
 * Se compara celda a celda: si TODAS son casi idénticas a la entrada, no ha
 * hecho nada y no vale la pena guardarlo.
 */
async function echoScore(original: Buffer, resultado: Buffer): Promise<number> {
  const norm = (b: Buffer): Promise<Buffer> =>
    sharp(b).removeAlpha().resize(64, 64, { fit: 'fill' }).greyscale().raw().toBuffer();
  const [a, b] = await Promise.all([norm(original), norm(resultado)]);
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += Math.abs((a[i] as number) - (b[i] as number));
  return suma / a.length;
}

/** Por debajo de esto, el modelo no ha repintado nada. */
const ECHO_THRESHOLD = 8;

/** Las doce criaturas base: las que se ven sin haber mejorado nada. */
export const BASE_CREATURES = [
  'peasant',
  'archer',
  'pikeman',
  'swordsman',
  'cavalry',
  'paladin',
  'skeleton',
  'zombie',
  'mummy',
  'vampire',
  'lich',
  'bone_dragon',
] as const;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const go = args.includes('--go');

  // Modo por lotes: un atlas por criatura, uno detrás de otro.
  if (args.includes('--all')) {
    for (const c of BASE_CREATURES) {
      try {
        await animar(c, go, POSES.length);
      } catch (err) {
        console.error(`  \x1b[31m[error]\x1b[0m ${c}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return;
  }

  const id = args.find((a) => !a.startsWith('-'));
  // El tope real es el menor de dos: las poses que hay descritas y el máximo
  // de celdas que el modelo aguanta sin colapsar.
  const pedidas = Number(args[args.indexOf('--poses') + 1]) || POSES.length;
  const n = Math.max(2, Math.min(pedidas, POSES.length, ATLAS_MAX_CELLS));

  if (id === undefined || CREATURE_PROMPTS[id] === undefined) {
    console.error(`uso: npx tsx tools/gen/animate.ts <criatura|--all> [--go] [--poses N]
criaturas: ${Object.keys(CREATURE_PROMPTS).join(', ')}`);
    process.exit(1);
  }

  await animar(id, go, n);
}

async function animar(id: string, go: boolean, n: number): Promise<void> {
  const identidad = CREATURE_PROMPTS[id];
  if (identidad === undefined) throw new Error(`no hay descripción para "${id}"`);

  const sprite = join(SPRITES_DIR, `${id}.png`);
  if (!existsSync(sprite)) {
    throw new Error(`falta el sprite base ${sprite}. Genera antes: pnpm gen -- creatures --go`);
  }

  const { buffer: grid, cols, rows } = await composeGrid(sprite, n);
  const prompt = buildAtlasPrompt(identidad, cols, rows, n);

  console.log(
    `\n${go ? '\x1b[31mGENERANDO\x1b[0m' : '\x1b[36mSIMULACIÓN\x1b[0m'} · atlas de "${id}" · ` +
      `${n} poses en ${cols}×${rows} · coste $${MODEL.costUsd.toFixed(2)}\n`,
  );
  if (!go) {
    console.log('Añade --go para pedirlo de verdad.\n');
    return;
  }

  const client = new FalClient({ cacheDir: CACHE_DIR, spendFile: SPEND_FILE, budgetUsd: 6 });
  const gridPath = join(CACHE_DIR, `grid-${id}.png`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(gridPath, grid);

  const { path } = await client.image(
    MODEL.endpoint,
    {
      prompt,
      image_urls: [toDataUri(gridPath), toDataUri(sprite)],
      ...MODEL.params,
    },
    MODEL.costUsd,
    `anim/${id}`,
    `atlas-v1-${n}`,
  );

  const salida = await sharp(path).toBuffer();
  const eco = await echoScore(grid, salida);
  if (eco < ECHO_THRESHOLD) {
    // Se lanza en vez de salir: en modo por lotes, una criatura fallida no
    // debe llevarse por delante a las once restantes.
    throw new Error(
      `el modelo ha devuelto el atlas casi sin tocar (eco ${eco.toFixed(1)} < ${ECHO_THRESHOLD}); no se guarda`,
    );
  }
  console.log(`  repintado confirmado (eco ${eco.toFixed(1)})`);

  // Corte en frames + hoja final, con metadatos al estilo Aseprite.
  const meta = await sharp(salida).metadata();
  const anchoCelda = Math.floor((meta.width ?? cols * CELL) / cols);
  const altoCelda = Math.floor((meta.height ?? rows * CELL) / rows);

  mkdirSync(join(OUT_DIR, id), { recursive: true });
  const frames: { frame: { x: number; y: number; w: number; h: number }; duration: number }[] = [];

  // El fondo se mide UNA vez en el atlas completo: en las celdas donde el
  // personaje toca el borde, sus propias esquinas no sirven de referencia.
  const colorFondo = await detectBackgroundColor(salida);

  for (let i = 0; i < n; i++) {
    const x = (i % cols) * anchoCelda;
    const y = Math.floor(i / cols) * altoCelda;
    // Se recortan unos píxeles del borde: el modelo dibuja una fina línea
    // divisoria entre celdas que, si se cuela, rompe el relleno del recorte.
    const margen = 3;
    const celda = await sharp(salida)
      .extract({
        left: x + margen,
        top: y + margen,
        width: anchoCelda - margen * 2,
        height: altoCelda - margen * 2,
      })
      .png()
      .toBuffer();

    // El modelo devuelve fondo gris plano, no alfa: hay que recortarlo.
    const limpio = await cutoutBackground(celda, {
      tolerance: 34,
      feather: 0.4,
      backgroundColor: colorFondo,
    });
    const vacio = await transparencyRatio(limpio);
    if (vacio < 0.1) {
      console.warn(`  [aviso] la pose "${POSES[i]!.id}" apenas ha perdido fondo (${Math.round(vacio * 100)}%)`);
    }

    await sharp(limpio)
      .trim({ threshold: 10 })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(join(OUT_DIR, id, `${POSES[i]!.id}.png`));
    frames.push({ frame: { x, y, w: anchoCelda, h: altoCelda }, duration: 120 });
  }

  // El atlas entero NO se copia junto al juego: pesa más de un mega y el
  // cliente solo carga los fotogramas sueltos. Se queda en la caché, que es
  // donde sirve para volver a cortarlo sin pagar otra vez.
  writeFileSync(
    join(OUT_DIR, id, 'atlas.json'),
    `${JSON.stringify(
      {
        frames,
        meta: {
          // Ruta del atlas dentro de la caché, por si hay que recortar de nuevo.
          image: path,
          size: { w: meta.width, h: meta.height },
          layout: { cols, rows },
          frameTags: POSES.slice(0, n).map((p, i) => ({ name: p.id, from: i, to: i })),
        },
      },
      null,
      2,
    )}\n`,
  );

  console.log(`  \x1b[32m[listo]\x1b[0m ${n} poses en assets/generated/anim/${id}/`);
  console.log(`  gasto acumulado: $${client.totalSpent.toFixed(2)}\n`);

  // Índice de lo animado, para que el cliente sepa qué puede animar.
  const indice = BASE_CREATURES.filter((c) => existsSync(join(OUT_DIR, c, 'atlas.json')));
  writeFileSync(
    join(OUT_DIR, 'index.json'),
    `${JSON.stringify({ creatures: indice, poses: POSES.map((p) => p.id) }, null, 2)}\n`,
  );
}

main().catch((err) => {
  console.error('\x1b[31m[animate] ha fallado:\x1b[0m', err);
  process.exit(1);
});
