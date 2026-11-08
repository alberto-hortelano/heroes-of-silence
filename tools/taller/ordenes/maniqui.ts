/**
 * Las órdenes del maniquí del Y Bot sobre el que se pinta: el propio de una unidad
 * o el civil de la gente, con su profundidad y, si se pide, su esqueleto
 * (`maniqui`), y los clips candidatos de una unidad (`muestrario`).
 */
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import { NOMBRES_DE_DIRECCION } from '../../../src/shared/arte.js';
import {
  CANDIDATOS_DEL_MUESTRARIO,
  carpetaDeFotogramas,
  carpetaDeManiqui,
  DIR_MANIQUIES,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
  OCHO_DIRECCIONES,
  renderizarMuestrario,
  renderizarOchoDirecciones,
} from '../../art/poses.js';
import { sha256 } from '../../comun/hash.js';
import { RAIZ } from '../../comun/raiz.js';
import { DIR_DEL_MANIQUI_CIVIL, POSE_DE_LA_IDENTIDAD } from '../npcs.js';
import { juegoDelYBot, unidad } from '../unidades.js';
import type { Orden } from './orden.js';

/**
 * El maniquí de la gente del banco de NPC (`DIR_DEL_MANIQUI_CIVIL`): el juego
 * `civil` del Y Bot, sin nada en las manos, en 8 direcciones y **con su
 * profundidad** (la pose con que se pinta la tropa desde el 10-10-2026), y la pose
 * de la identidad: el primer reposo de la dirección SE, solo en su celda, para que
 * la lámina de identidad pinte una figura y no veintiuna. Se renderiza una vez:
 * `_poses/civil-8d/`, el Y Bot sin profundidad con que el cliente pinta a quien no
 * tiene figura, no se toca.
 */
export async function renderizarElManiquiCivil(conHuesos = false): Promise<string> {
  if (conHuesos)
    return sacarElEsqueleto(join(RAIZ, DIR_DEL_MANIQUI_CIVIL), (temporal) =>
      renderizarOchoDirecciones('civil', temporal, {
        id: 'civil',
        atrezo: null,
        profundidad: true,
        huesos: true,
      }),
    );
  const carpeta = await renderizarOchoDirecciones(
    'civil',
    join(RAIZ, dirname(DIR_DEL_MANIQUI_CIVIL)),
    {
      id: 'civil',
      atrezo: null,
      profundidad: true,
    },
  );
  const { celda } = OCHO_DIRECCIONES;
  const d = NOMBRES_DE_DIRECCION.indexOf('frente-derecha');
  await sharp(join(carpeta, `d${d}-a.png`))
    .extract({ left: 0, top: 0, width: celda, height: celda })
    .png()
    .toFile(join(RAIZ, POSE_DE_LA_IDENTIDAD));
  return carpeta;
}

/**
 * El esqueleto de un maniquí ya renderizado (`maniqui --huesos`): lo renderiza
 * otra vez aparte apuntando los huesos y, si sus hojas salen idénticas byte a byte
 * a las de `carpeta` (en color y en profundidad), escribe junto a ellas SOLO los
 * `d<n>-<h>.huesos.json`. Si alguna difiere, lanza y no escribe nada: un esqueleto
 * de otro render mediría lo pintado contra otra pose. Así no hay una copia del
 * maniquí en la caché que se quede vieja sin que nadie se entere.
 */
export async function sacarElEsqueleto(
  carpeta: string,
  renderizar: (temporal: string) => Promise<string>,
): Promise<string> {
  const temporal = await mkdtemp(join(tmpdir(), 'taller-huesos-'));
  try {
    const hecha = await renderizar(temporal);
    const hojas = (await readdir(hecha))
      .filter((n) => /^d[0-7]-[a-c](\.profundidad)?\.png$/.test(n))
      .sort();
    const distintas: string[] = [];
    for (const n of hojas) {
      const ahora = join(carpeta, n);
      let igual = false;
      try {
        igual = sha256(await readFile(ahora)) === sha256(await readFile(join(hecha, n)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if (!igual) distintas.push(n);
    }
    if (distintas.length > 0)
      throw new Error(
        `con los huesos, ${distintas.length} hojas no salen idénticas a las de ${relative(RAIZ, carpeta)} (${distintas.slice(0, 4).join(', ')}${distintas.length > 4 ? '…' : ''}): ese maniquí es de otro render. Vuelve a renderizar sin \`--huesos\` y saca después el esqueleto`,
      );
    const esqueletos = (await readdir(hecha)).filter((n) => n.endsWith('.huesos.json'));
    for (const n of esqueletos) await writeFile(join(carpeta, n), await readFile(join(hecha, n)));
    console.log(`  · ${esqueletos.length} esqueletos, sobre ${hojas.length} hojas idénticas`);
    return carpeta;
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

/** El maniquí del Y Bot sobre el que se pinta. */
export const ORDENES_DEL_MANIQUI: Readonly<Record<string, Orden>> = {
  maniqui: {
    uso: `pnpm taller maniqui <unidad>… [--fotogramas]
    el maniquí propio de una unidad, con su profundidad, en \`_poses/unidades/<id>-8d/\`
pnpm taller maniqui --civil
    el de la gente del banco de NPC: el juego civil del Y Bot, sin armas
pnpm taller maniqui <unidad>… --huesos  (o \`--civil --huesos\`)
    el esqueleto de cada hoja, junto a ella: lo renderiza aparte y lanza si sus hojas no
    salen idénticas a las de \`assets/\``,
    correr: async (resto) => {
      // El de la gente (el banco de NPC): el juego civil del Y Bot, sin armas, con
      // su profundidad y la pose sola de la identidad.
      if (resto.includes('--civil')) {
        console.log(
          `→ ${relative(RAIZ, await renderizarElManiquiCivil(resto.includes('--huesos')))}`,
        );
        return;
      }
      // El maniquí propio de cada unidad que lo declara (`maniqui` en unidades.ts).
      for (const id of resto.filter((r) => !r.startsWith('--'))) {
        const u = unidad(id);
        const juego = juegoDelYBot(u);
        if (u.maniqui === undefined)
          throw new Error(`${id} no declara maniquí propio: usa el de «${juego}»`);
        if (!(juego in JUEGOS_DE_ARMAS))
          throw new Error(
            `${id}: el maniquí propio parte de un juego del Y Bot a pie, no de «${juego}»`,
          );
        const atrezo = u.maniqui;
        const opciones = (huesos: boolean) => ({
          id,
          huesos,
          atrezo,
          ...(u.clipsDelManiqui === undefined ? {} : { clips: u.clipsDelManiqui }),
          // Además, sus hojas en profundidad: la pose que se pinta.
          profundidad: true,
          // Y los fotogramas enteros de cada clip, para mirarlos (`carpetaDeFotogramas`).
          ...(resto.includes('--fotogramas') ? { fotogramas: carpetaDeFotogramas(id) } : {}),
        });
        // Con `--huesos`, solo el esqueleto de cada hoja, junto a ella: la verdad con que
        // la revisión mide lo pintado y la compuerta del trabajador. Las hojas no se tocan.
        const carpeta = resto.includes('--huesos')
          ? await sacarElEsqueleto(carpetaDeManiqui(id), (temporal) =>
              renderizarOchoDirecciones(juego as JuegoDeArmas, temporal, opciones(true)),
            )
          : await renderizarOchoDirecciones(juego as JuegoDeArmas, DIR_MANIQUIES, opciones(false));
        console.log(`→ ${relative(RAIZ, carpeta)}`);
      }
    },
  },
  muestrario: {
    uso: `pnpm taller muestrario <unidad> [clip…] [--fotogramas]
    los clips candidatos de una unidad, con su atrezo, para elegir sus acciones
    (\`.cache/taller/muestrario/<unidad>.png\`)`,
    correr: async (resto) => {
      // Los clips candidatos de una unidad, con su atrezo, para elegir sus acciones.
      const [id, ...clips] = resto.filter((r) => !r.startsWith('--'));
      if (id === undefined) throw new Error('pnpm taller muestrario <unidad> [clip…]');
      const u = unidad(id);
      const juego = juegoDelYBot(u);
      if (!(juego in JUEGOS_DE_ARMAS)) throw new Error(`${id}: el muestrario es de juegos a pie`);
      const destino = join(RAIZ, '.cache/taller/muestrario', `${id}.png`);
      await mkdir(dirname(destino), { recursive: true });
      await renderizarMuestrario(
        clips.length > 0 ? clips : CANDIDATOS_DEL_MUESTRARIO,
        u.maniqui ?? JUEGOS_DE_ARMAS[juego as JuegoDeArmas].atrezo,
        destino,
        160,
        // Con `--fotogramas`, cada clip entero (el visor del maniquí los anima).
        resto.includes('--fotogramas') ? join(RAIZ, '.cache/taller/muestrario', id) : undefined,
      );
      console.log(`→ ${relative(RAIZ, destino)}`);
    },
  },
};
