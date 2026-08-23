/**
 * Generador de assets del juego.
 *
 *   pnpm gen                      # simula: dice qué falta y qué costaría
 *   pnpm gen -- terrains --go     # genera de verdad los terrenos
 *   pnpm gen -- all --go --budget 5
 *
 * Por defecto SIMULA. Para gastar dinero hay que pedirlo con `--go`, y aun así
 * `--budget` aborta antes de pasarse: es el tope del gasto ACUMULADO del
 * proyecto, no el de esta tanda. Lo ya generado se sirve de la caché y no se
 * vuelve a pagar.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allCreatures } from '@core/data.js';
import { TERRAIN_KINDS } from '@core/map/terrain.js';
import { RESOURCE_KINDS } from '@core/types.js';
import { FalClient } from './fal.js';
import {
  BUILDING_SIZE,
  ICON_SIZE,
  processBuilding,
  processScene,
  processSprite,
  processTerrain,
  SPRITE_SIZE,
} from './postprocess.js';
import {
  BUILDING_PROMPTS,
  buildingPrompt,
  creatureSpritePrompt,
  RESOURCE_ICON_PROMPTS,
  TERRAIN_PROMPTS,
  TOWN_BACKDROP_PROMPTS,
} from './prompts.js';

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, 'tools', 'gen', '.cache');
const SPEND_FILE = join(ROOT, 'tools', 'gen', 'spend.json');
const OUT_DIR = join(ROOT, 'assets', 'generated');

/**
 * Modelos de fal, con su coste por imagen.
 *
 * "cheap" es para iterar prompts hasta que el look convenza; "quality" para la
 * tirada final. Los costes son los del tarifario y solo sirven para presupuestar.
 */
interface ModelSpec {
  readonly endpoint: string;
  readonly costUsd: number;
  readonly params: Record<string, unknown>;
}

const MODELS: Record<string, Record<'cheap' | 'quality', ModelSpec>> = {
  // Texturas de terreno: hace falta que TILEEN sin costura.
  terrain: {
    cheap: {
      endpoint: 'fal-ai/z-image/turbo/tiling',
      costUsd: 0.02,
      params: { image_size: 'square_hd', num_images: 1 },
    },
    quality: {
      endpoint: 'fal-ai/z-image/turbo/tiling',
      costUsd: 0.02,
      params: { image_size: 'square_hd', num_images: 1 },
    },
  },
  // Sprites e iconos: hace falta canal alfa de verdad.
  sprite: {
    cheap: {
      endpoint: 'fal-ai/ideogram/v3/generate-transparent',
      costUsd: 0.03,
      params: { rendering_speed: 'TURBO', num_images: 1, image_size: 'square_hd' },
    },
    quality: {
      endpoint: 'fal-ai/ideogram/v3/generate-transparent',
      costUsd: 0.09,
      params: { rendering_speed: 'QUALITY', num_images: 1, image_size: 'square_hd' },
    },
  },
  // Fondo de castillo: ni repite ni necesita alfa, así que no vale ninguno
  // de los dos modelos de arriba.
  scene: {
    cheap: {
      endpoint: 'fal-ai/z-image/turbo',
      costUsd: 0.02,
      params: { image_size: 'landscape_16_9', num_images: 1 },
    },
    quality: {
      endpoint: 'fal-ai/z-image/turbo',
      costUsd: 0.02,
      params: { image_size: 'landscape_16_9', num_images: 1 },
    },
  },
};

interface Job {
  readonly group: 'terrains' | 'creatures' | 'icons' | 'buildings' | 'towns';
  readonly name: string;
  readonly kind: 'terrain' | 'sprite' | 'scene';
  readonly prompt: string;
  /** Ruta final dentro de `assets/generated`. */
  readonly out: string;
}

function buildJobs(only: string): Job[] {
  const jobs: Job[] = [];

  if (only === 'all' || only === 'terrains') {
    for (const t of TERRAIN_KINDS) {
      jobs.push({
        group: 'terrains',
        name: t,
        kind: 'terrain',
        prompt: TERRAIN_PROMPTS[t],
        out: join('terrain', `${t}.png`),
      });
    }
  }

  if (only === 'all' || only === 'creatures') {
    for (const c of allCreatures()) {
      jobs.push({
        group: 'creatures',
        name: c.id,
        kind: 'sprite',
        prompt: creatureSpritePrompt(c.id),
        out: join('creatures', `${c.id}.png`),
      });
    }
  }

  if (only === 'all' || only === 'icons') {
    for (const r of RESOURCE_KINDS) {
      jobs.push({
        group: 'icons',
        name: r,
        kind: 'sprite',
        prompt: RESOURCE_ICON_PROMPTS[r],
        out: join('icons', `${r}.png`),
      });
    }
  }

  if (only === 'all' || only === 'buildings') {
    for (const name of Object.keys(BUILDING_PROMPTS)) {
      jobs.push({
        group: 'buildings',
        name,
        kind: 'sprite',
        prompt: buildingPrompt(name),
        out: join('buildings', `${name}.png`),
      });
    }
    for (const [faction, prompt] of Object.entries(TOWN_BACKDROP_PROMPTS)) {
      jobs.push({
        group: 'towns',
        name: faction,
        kind: 'scene',
        prompt,
        out: join('towns', `${faction}.jpg`),
      });
    }
  }

  return jobs;
}

function parseArgs(argv: string[]): {
  only: string;
  go: boolean;
  quality: 'cheap' | 'quality';
  budget: number;
  limit: number;
} {
  const args = argv.slice(2);
  const only = args.find((a) => !a.startsWith('-')) ?? 'all';
  const valor = (flag: string, def: number): number => {
    const i = args.indexOf(flag);
    return i < 0 ? def : Number(args[i + 1]);
  };
  return {
    only,
    go: args.includes('--go'),
    quality: args.includes('--quality') ? 'quality' : 'cheap',
    budget: valor('--budget', 5),
    limit: valor('--limit', Number.POSITIVE_INFINITY),
  };
}

async function main(): Promise<void> {
  const { only, go, quality, budget, limit } = parseArgs(process.argv);
  const grupos = ['all', 'terrains', 'creatures', 'icons', 'buildings'];
  if (!grupos.includes(only)) {
    console.error(`grupo desconocido: "${only}". Elige uno de: ${grupos.join(', ')}`);
    process.exit(1);
  }

  const jobs = buildJobs(only).slice(0, limit);
  const client = new FalClient({
    cacheDir: CACHE_DIR,
    spendFile: SPEND_FILE,
    budgetUsd: budget,
    dryRun: !go,
  });

  const coste = jobs.reduce((t, j) => t + MODELS[j.kind]![quality].costUsd, 0);
  console.log(
    `\n${go ? '\x1b[31mGENERANDO\x1b[0m' : '\x1b[36mSIMULACIÓN\x1b[0m'} · grupo "${only}" · ` +
      `calidad "${quality}" · ${jobs.length} imágenes · coste máximo $${coste.toFixed(2)} ` +
      `(tope acumulado: $${budget.toFixed(2)})\n`,
  );
  if (!go) console.log('Nada de esto se ha pedido todavía. Añade --go para generarlo de verdad.\n');

  let pagadas = 0;
  let reutilizadas = 0;

  for (const job of jobs) {
    const spec = MODELS[job.kind]![quality];
    const payload = { prompt: job.prompt, output_format: 'png', ...spec.params };

    try {
      const { path, cached } = await client.image(
        spec.endpoint,
        payload,
        spec.costUsd,
        `${job.group}/${job.name}`,
        // La versión entra en la clave: así se invalida solo lo afectado
        // cuando cambia el formato, sin repagar todo lo demás.
        'v1',
      );
      if (cached) reutilizadas++;
      else pagadas++;

      if (go) {
        // El PNG crudo de fal se queda en la caché; al juego va la versión
        // recortada y a la resolución que realmente usa.
        const destino = join(OUT_DIR, job.out);
        mkdirSync(join(destino, '..'), { recursive: true });
        if (job.kind === 'terrain') await processTerrain(path, destino);
        else if (job.kind === 'scene') await processScene(path, destino);
        else if (job.group === 'buildings') await processBuilding(path, destino);
        else await processSprite(path, destino, job.group === 'icons' ? ICON_SIZE : SPRITE_SIZE);
        const kb = Math.round(statSync(destino).size / 1024);
        console.log(`  \x1b[32m[listo]\x1b[0m ${job.out} (${kb} kB)`);
      }
    } catch (err) {
      console.error(`  \x1b[31m[error]\x1b[0m ${job.group}/${job.name}: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof Error && err.message.includes('tope de gasto')) break;
    }
  }

  if (go) {
    // El índice describe TODO lo que hay en disco, no solo lo de esta tanda:
    // escribirlo con los trabajos del grupo actual borraba del manifiesto los
    // terrenos y las criaturas en cuanto se generaba un grupo suelto.
    const manifest = {
      generatedAt: new Date().toISOString(),
      style: 'painted',
      files: buildJobs('all')
        .filter((j) => existsSync(join(OUT_DIR, j.out)))
        .map((j) => ({ group: j.group, name: j.name, path: j.out })),
    };
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(
    `\nResumen: ${pagadas} generadas, ${reutilizadas} reutilizadas de la caché. ` +
      `Gasto acumulado del proyecto: $${client.totalSpent.toFixed(2)}\n`,
  );
}

main().catch((err) => {
  console.error('\x1b[31m[gen] ha fallado:\x1b[0m', err);
  process.exit(1);
});
