/**
 * La arena en la página, lo que comparten sus pasadas: abrirla, montar la pelea con la
 * pauta del espejo, comparar el campo del espejo con el de la página, esperar su barra y, al
 * acabar, devolver los catálogos que escribe «Guardar» (`conLosCatalogosDevueltos`). Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright';
import type { SesionDeArena } from '../../../src/client/sesion/sesion-de-arena.js';
import type { FuenteDeArena } from '../../../src/core/arena/lados.js';
import { hexDistance, hexEquals } from '../../../src/core/battle/board.js';
import { isAlive } from '../../../src/core/battle/consultas.js';
import type { BattleAction, BattleStack } from '../../../src/core/battle/types.js';
import { EQUIPO_DEL_JUEGO } from '../../../src/core/equipo/atado.js';
import { unidad } from '../../../src/core/unidad/catalogo.js';
import {
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  type Unidad,
  unidadDeCombate,
} from '../../../src/core/unidad/formato.js';
import { FICHEROS_DEL_CATALOGO } from '../../arena/borrador.js';
import { cifrasCortadas } from './ficha.js';
import { log } from './pagina.js';

/**
 * El ataque con que pelea el guerrero con escudo si su cuerpo tiene `ataque`: el
 * de su cuerpo con su equipo encima, que lo suma `unidadDeCombate`. La tarjeta y
 * el stack enseñan este; la ficha, el del cuerpo.
 */
export function ataqueEnLaPelea(ataque: number): number {
  // La página pelea con el catálogo de equipo del disco, el del juego (`conLosCatalogosDevueltos`).
  return unidadDeCombate(delCatalogo('templario-escudo', { attack: ataque }), EQUIPO_DEL_JUEGO)
    .attack;
}

/**
 * La unidad `id` del catálogo (`data/unidades.json`), con los cambios que se le
 * pidan: la misma fuente de cifras que la página, así que el espejo pelea lo
 * mismo que ella.
 */
export function delCatalogo(id: string, cambios: Partial<Unidad> = {}): Unidad {
  return { ...unidad(id), ...cambios };
}

/** Una unidad del catálogo como fuente del montaje del espejo. */
export function delBorrador(unidad: Unidad): FuenteDeArena {
  return { unidad };
}

/**
 * Lo que la persona hace en su turno de la pelea de la arena: golpear al primer
 * enemigo al que llega, la primera vez que puede; si aún no ha golpeado ni
 * andado, un tramo hacia el enemigo más cercano; y si no, «Terminar turno».
 * La juegan la pasada y la búsqueda de su semilla, que tienen que hacer lo mismo.
 */
export type JugadaDeLaPauta =
  | { readonly tipo: 'golpe'; readonly contra: BattleStack }
  | { readonly tipo: 'tramo'; readonly mover: BattleAction & { type: 'move' } }
  | { readonly tipo: 'terminar' };

export function jugadaDeLaPauta(
  espejo: SesionDeArena,
  tramos: number,
  golpes: number,
): JugadaDeLaPauta {
  const turno = espejo.turnoPropio;
  if (turno === null)
    throw new Error('arena: el espejo devuelve el control sin que le toque a la persona');
  const acciones = espejo.battleLegalActions();
  const enemigos = espejo.battle.stacks.filter((x) => isAlive(x) && x.side !== turno.side);
  const contra = enemigos.find((e) =>
    acciones.some(
      (a) =>
        (a.type === 'attack' && a.target === e.id) || (a.type === 'aim' && hexEquals(a.at, e.hex)),
    ),
  );
  if (golpes === 0 && contra !== undefined) return { tipo: 'golpe', contra };
  if (golpes === 0 && tramos === 0 && acciones.some((a) => a.type === 'move')) {
    // El hex al que se puede ir más cerca del enemigo más cercano.
    const cerca = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.map((e) => hexDistance(h, e.hex)));
    const mover = acciones
      .flatMap((a) => (a.type === 'move' ? [a] : []))
      .sort((a, b) => cerca(a.to) - cerca(b.to))[0] as BattleAction & { type: 'move' };
    return { tipo: 'tramo', mover };
  }
  return { tipo: 'terminar' };
}

/** Lo que el panel «En el campo» tiene que decir, sacado del espejo. */
function campoDelEspejo(s: SesionDeArena): string[] {
  return s.battle.stacks
    .filter((x) => isAlive(x))
    .map((x) => `${x.topHp} PV · ${s.laLlevaLaIA(x.id) ? 'IA' : 'tú'}`);
}

async function campoDeLaPagina(page: Page): Promise<string[]> {
  // `div.stack`: los botones del libro también son `.stack` y llevan su coste en `.count`.
  return (await page.locator('#side div.stack .count').allInnerTexts()).map((t) =>
    t.replace(/\s+/g, ' ').trim(),
  );
}

/** Comprueba, con el tablero ya quieto, que la página y el espejo pelean la misma batalla. */
export async function mismaPelea(page: Page, espejo: SesionDeArena, paso: string): Promise<void> {
  const esperado = campoDelEspejo(espejo);
  const plazo = Date.now() + 8_000;
  let visto: string[] = [];
  while (Date.now() < plazo) {
    visto = await campoDeLaPagina(page);
    if (JSON.stringify(visto) === JSON.stringify(esperado)) return;
    await sleep(120);
  }
  throw new Error(
    `arena: tras «${paso}» la página y el espejo se han separado: la página dice ${JSON.stringify(visto)} y el espejo ${JSON.stringify(esperado)}`,
  );
}

/**
 * Juega `fn` y deja los ficheros que escribe «Guardar» (`FICHEROS_DEL_CATALOGO`:
 * equipo, unidades, el cuerpo del héroe y los hechizos) como estaban al salir, pase
 * lo que pase: la prueba no puede dejar en el repo lo que nadie ha pedido. Eran solo
 * los dos primeros, de cuando «Guardar» no escribía más: desde el cuerpo del héroe
 * (03-11-2026) la página lo manda siempre, y la arena dejaba `data/heroe.json` con
 * sus objetos de una línea desplegados. **No se apartan** (simplify de F1,
 * 18-10-2026): los importa el núcleo y de ellos leen la página y el espejo; sin
 * ellos no carga nada.
 */
export async function conLosCatalogosDevueltos(
  quien: string,
  fn: (ruta: string) => Promise<void>,
): Promise<void> {
  const como = FICHEROS_DEL_CATALOGO.map((r) => {
    const donde = join(process.cwd(), r);
    return { donde, texto: readFileSync(donde, 'utf8') };
  });
  try {
    await fn(join(process.cwd(), RUTA_DEL_CATALOGO_DE_UNIDADES));
  } finally {
    for (const { donde, texto } of como) writeFileSync(donde, texto);
    log(
      `${quien}: los ficheros de «Guardar» devueltos como estaban (${FICHEROS_DEL_CATALOGO.join(', ')})`,
    );
  }
}

/**
 * Espera a que la barra diga `texto`: exactamente (`exacta`, sin los blancos de
 * los lados) o en alguna parte. `que` dice la pasada y lo que se esperaba, para
 * el error.
 */
export async function esperarBarra(
  page: Page,
  texto: string,
  que: string,
  { exacta }: { readonly exacta: boolean },
): Promise<void> {
  await page
    .waitForFunction(
      ([t, e]) => {
        const barra = document.getElementById('status')?.textContent?.trim() ?? '';
        return e ? barra === t : barra.includes(t as string);
      },
      [texto, exacta] as const,
      { timeout: 3000 },
    )
    .catch(async () => {
      throw new Error(
        `${que}: la barra debía decir «${texto}» y dice «${await page.locator('#status').innerText()}»`,
      );
    });
}

/** La arena con `query` (`?seed=…`), con la lista de unidades ya pintada. */
export async function abrirLaArena(page: Page, url: string, query: string): Promise<void> {
  // Lo que se pidió lo cuentan `jugarArena` y `edicionDeLaArena` con Resource Timing,
  // cuyo búfer es de 250 entradas, y en vite dev cada módulo es una. Desde la fase N
  // de la reorganización la arena carga 247 módulos y el búfer se llenaba antes de
  // pedir las hojas de las figuras: «no se cargaron las hojas que se pintan» con las
  // tres pedidas (medido el 07-11-2026: 226 entradas en `ae15843b`, 250 y el búfer
  // lleno en `c98bd8b1`), y «ya estaba pedida antes de girar» no podía morder.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
  await page.goto(`${url}/arena/${query}`, { waitUntil: 'networkidle' });
  await page.locator('[data-unidad-catalogo]').first().waitFor({ timeout: 5000 });
}

/**
 * Que la lista de la arena bajo `raiz` no ofrezca un catálogo del juego aparte
 * (13-10-2026): ni un botón u opción que lo nombre. Mira lo que la página
 * genera hoy: buscar el `data-faccion="catalogo"` de antes pasaba siempre, porque
 * nadie lo escribe ya.
 */
export async function sinElCatalogoDelJuego(page: Page, raiz: string, paso: string): Promise<void> {
  const nombrado = await page
    .locator(`${raiz} :is(button, option)`, { hasText: /cat[aá]logo del juego/i })
    .count();
  const ids = await page
    .locator(`${raiz} [data-unidad-catalogo], ${raiz} [data-arena-nueva] option`)
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-unidad-catalogo') ?? e.getAttribute('value') ?? ''),
    );
  if (!ids.some((id) => id !== '')) {
    throw new Error(
      `${paso}: la lista de la arena no tiene unidades, y no hay catálogo que buscar`,
    );
  }
  // Las criaturas de `data/creatures.json` ya no existen (19-10-2026): el
  // catálogo del juego es el de la arena, y solo queda que nada lo nombre aparte.
  if (nombrado > 0) {
    throw new Error(
      `${paso}: la lista de la arena aún ofrece un «catálogo del juego» aparte (${nombrado} botones u opciones que lo nombran)`,
    );
  }
}

/**
 * Hasta que la página ha pintado lo último que se le pidió: las fuentes cargadas
 * y dos fotogramas (el del repintado pendiente y el siguiente, ya con él).
 */
/**
 * Las cifras de las fichas visibles bajo `raiz`, sin cortar (`cifrasCortadas`:
 * ninguna casilla corta su número ni deja de caber cinco cifras, ninguna
 * cabecera se parte, todo a la derecha). Lanza con todo lo que encuentra.
 */
export async function cifrasSinCortar(page: Page, raiz: string, paso: string): Promise<void> {
  const fallos = await page.evaluate(cifrasCortadas, raiz);
  if (fallos.length > 0)
    throw new Error(`${paso}: las cifras de la ficha no se leen:\n  ${fallos.join('\n  ')}`);
}

export async function asentada(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    ),
  );
}
// ------------------------------------------------------------- el enlace de la pelea

/** Lo que dice el montaje de los dos bandos, para comparar dos páginas. */
export async function bandosDichos(page: Page): Promise<string> {
  const izquierda = await page.locator('#bando-izquierda').innerText();
  const derecha = await page.locator('#bando-derecha').innerText();
  return `${izquierda}\n---\n${derecha}`;
}
