/**
 * Lo que cualquier pasada de `pnpm capturas` hace con una página: la carpeta de las
 * capturas (`DESTINO`) y el registro (`log`), vigilar su consola (`vigilarConsola`,
 * `Problemas`), sacar una captura, medir una caja, comparar la barra con el espejo
 * (`comprobar`, `mismaBarra`), esperar la marcha y la cola del animador, desplegar tal cual
 * y responder la rueda del golpe con las teclas de la rueda de referencia. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright';
import { duracionDeLaJugada } from '../../../src/client/batalla/anim.js';
import { teclaDe as teclaEnLaRueda } from '../../../src/client/batalla/rueda/rueda.js';
import type { ControlDeBatalla } from '../../../src/client/sesion/batalla/control.js';
import type { Session } from '../../../src/client/sesion/partida.js';
import { SesionDeArena } from '../../../src/client/sesion/sesion-de-arena.js';
import { rotuloDeDia } from '../../../src/client/views/notas.js';
import { RUEDA_DE_REFERENCIA } from '../../../src/core/battle/formas-de-la-rueda.js';
import type { BattleEvent, BattleState } from '../../../src/core/battle/types.js';
import type { TipoDeGolpe } from '../../../src/core/types.js';
import type { Caja } from './escenas.js';

/**
 * Las capturas juegan con la complejidad de siempre (7 / 7): la rueda de la
 * batalla es la de referencia, la de 7, con su geometría, sus teclas y sus nombres
 * (complejidad del combate, 22-10-2026).
 */
export const RUEDA = RUEDA_DE_REFERENCIA;
export const teclaDe = (t: TipoDeGolpe): string => teclaEnLaRueda(t, RUEDA);

// Ninguna pasada escribe su semilla: la busca en el espejo. Por qué, y las que se escribían
// a mano hasta #131, en `docs/calidad.md` («Las semillas de `pnpm capturas`»).
// Por defecto, una carpeta ignorada por git y de este checkout (dos worktrees no
// se pisan); un ciclo que quiera guardarlas le pasa la suya.
export const DESTINO = resolve(process.argv[2] ?? '.cache/capturas');

export function log(msg: string): void {
  console.log(`\x1b[36m[capturas]\x1b[0m ${msg}`);
}
// ------------------------------------------------------------------ navegador
// ------------------------------------------------------------------- la página

export interface Problemas {
  readonly lista: string[];
}

/**
 * Todo error de consola es un problema, salvo los que el guion provoca a
 * propósito (`esperados`): en la pasada sin arte se le niegan las imágenes al
 * navegador, y ese 404 es la prueba, no un fallo. Se filtra por la URL, que
 * sale en la ubicación del mensaje, para no tapar ningún otro 404.
 */
export function vigilarConsola(
  page: Page,
  nombre: string,
  problemas: Problemas,
  esperados?: RegExp,
): void {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (esperados?.test(m.location().url) === true) return;
    // Sin imágenes, el suelo del mapa dice que se pinta sin ellas: también es la prueba.
    if (esperados !== undefined && m.text().startsWith('el suelo del mapa se pinta sin')) return;
    problemas.lista.push(`[${nombre}] consola: ${m.text()} (${m.location().url})`);
  });
  page.on('pageerror', (e) => problemas.lista.push(`[${nombre}] excepción: ${e.message}`));
}

export async function captura(page: Page, nombre: string): Promise<void> {
  const ruta = join(DESTINO, `${nombre}.png`);
  await page.screenshot({ path: ruta });
  log(`captura ${nombre}.png`);
}

/** La densidad de la pantalla de la página: con ella encuadran las escenas de pie (`pasoDeLaHoja`). */
export async function densidadDe(page: Page): Promise<number> {
  return page.evaluate(() => window.devicePixelRatio || 1);
}

export async function caja(page: Page): Promise<Caja> {
  // Con las fuentes ya cargadas: la barra de arriba del móvil mide otra cosa
  // con la de respaldo, y la caja medida en la s1 salía 3,4 px más arriba que
  // la de la semilla buscada (#229, con la máquina cargada).
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const b = await page.locator('#canvas').boundingBox();
  if (b === null) throw new Error('el lienzo no está en la página');
  return b;
}

/** Las capturas del despliegue ya hechas: una por cada nombre, la primera vez que se ve. */
const desplieguesCapturados = new Set<string>();

/**
 * «Listo» en la página (y en el espejo, si aún despliega) mientras la persona
 * despliega (fase de despliegue, 02-11-2026): las pasadas miran la batalla, no el
 * despliegue, y lo aceptan tal como sale (su formación o la regla de hoy). Lo
 * lleva la página: el espejo de la arena ya lo aceptó al empezar
 * (`DespliegueEnPantalla.listoTalCual`), porque las búsquedas de semilla lo juegan sin página. Cada
 * tanda se espera pintada antes de seguir: con los dos bandos «Yo», un clic sobre
 * el «Listo» de antes cerraría la del otro sin verla. La primera vez que se ve
 * cada `captura_`, se captura antes de pulsar.
 */
export async function desplegarTalCual(
  page: Page,
  espejo: ControlDeBatalla,
  donde: string,
  captura_?: string,
): Promise<void> {
  const listo = page.locator('#side [data-action="desplegado"]');
  for (let i = 0; i < 4; i++) {
    if (espejo.despliegue.enCurso !== null) {
      await listo.waitFor({ timeout: 10_000 }).catch(async () => {
        throw new Error(
          `${donde}: el espejo despliega y la página no enseña «Listo»: ${await page.locator('#side').innerText()}`,
        );
      });
    } else {
      // El espejo de la partida va al paso de la página: sin despliegue en él, no
      // lo hay. El de la arena lo aceptó al empezar, y la página pinta el panel un
      // fotograma después de pasar a la batalla: se le da ese fotograma.
      if (!(espejo instanceof SesionDeArena)) return;
      await listo.waitFor({ timeout: i === 0 ? 1_500 : 500 }).catch(() => null);
      if ((await listo.count()) === 0) return;
    }
    const tanda = await page.locator('#side [data-despliegue]').getAttribute('data-despliegue');
    if (captura_ !== undefined && !desplieguesCapturados.has(captura_)) {
      desplieguesCapturados.add(captura_);
      await sleep(300);
      await captura(page, captura_);
    }
    await listo.click();
    if (espejo.despliegue.enCurso !== null) espejo.despliegue.listo();
    // La página ha repintado su panel cuando ya no enseña «Listo» o enseña otra tanda.
    await page
      .waitForFunction(
        (antes) => {
          const t = document.querySelector('#side [data-despliegue]');
          return t === null || t.getAttribute('data-despliegue') !== antes;
        },
        tanda,
        { timeout: 10_000 },
      )
      .catch(() => {
        throw new Error(`${donde}: tras «Listo» (tanda ${tanda}) la página no pasa a la siguiente`);
      });
  }
  throw new Error(`${donde}: cuatro «Listo» y la página sigue desplegando`);
}

/** Comprueba que la página y el espejo juegan la misma partida. */
export async function comprobar(page: Page, espejo: Session, paso: string): Promise<void> {
  const oro = await page.locator('#resources .oro').innerText();
  const dia = await page.locator('#day').innerText();
  const esperadoDia = rotuloDeDia(espejo.state.day);
  // En el mapa, además, el movimiento que le queda al héroe: es lo que se separa
  // si un clic cae en otra casilla que la que el espejo cree.
  if (espejo.scene === 'adventure' && espejo.selectedHero !== null) {
    const h = espejo.selectedHero;
    const fila = page.locator('#side .row', { hasText: 'Movimiento' });
    const mov = (await fila.count()) > 0 ? (await fila.innerText()).replace(/\s+/g, ' ') : '';
    if (!mov.includes(`${h.movePoints} /`)) {
      throw new Error(
        `tras «${paso}» el héroe de la página no está donde el del espejo: la página dice «${mov}» y el espejo ${h.movePoints} en (${h.at.x},${h.at.y})`,
      );
    }
  }
  // Con separador de miles (`conMiles`): las cifras, sin él.
  if (oro.replace(/\s/g, '') !== String(espejo.oro) || dia.trim() !== esperadoDia) {
    throw new Error(
      `tras «${paso}» la página y el espejo se han separado: la página dice ${dia} y ${oro} de oro; ` +
        `el espejo, ${esperadoDia} y ${espejo.oro}`,
    );
  }
}

/**
 * Espera a que el héroe llegue: el clic que lo mueve deja la marcha en pantalla
 * (`#app[data-marcha]`, que la página pone en el fotograma siguiente) y lo que abre
 * la llegada —la batalla, la base, la guarnición— espera a que acabe. El espejo no
 * la enseña (`Session.enseñarLaMarcha`): abre en el acto.
 */
export async function esperarLaMarcha(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForSelector('#app:not([data-marcha])', { timeout: 30_000 });
}

/** Espera a que la batalla acabe de contarse: lo que tarda la cola de lo que se acaba de jugar. */
export async function esperarCola(
  battle: BattleState,
  nuevos: readonly BattleEvent[],
): Promise<void> {
  await sleep(250 + duracionDeLaJugada(battle, nuevos));
}

/**
 * La rueda del golpe en la batalla del juego (F5): mientras el espejo espera una
 * elección de la persona —su golpe, o su respuesta cuando la golpean—, espera a
 * que la página abra la rueda en esa fase (tras contar la marcha), pulsa la tecla
 * de `tipo` y lo replica en el espejo; y espera a que la página cuente el cruce,
 * para no leer la rueda de antes como la siguiente.
 */
export async function responderLaRueda(
  page: Page,
  espejo: Session | SesionDeArena,
  tipo: TipoDeGolpe = 'normal',
) {
  for (let i = 0; i < 20 && espejo.ruedaPendiente !== null; i++) {
    const { fase } = espejo.ruedaPendiente;
    await page
      .locator(`#rueda[open] .rueda[data-fase="${fase}"]`)
      .waitFor({ timeout: 20000 })
      .catch(async () => {
        throw new Error(
          `la página no abre la rueda en la fase «${fase}» (barra: «${await page.locator('#status').innerText()}»)`,
        );
      });
    await page.keyboard.press(teclaDe(tipo));
    espejo.elegirEnLaRueda(tipo);
    // Su desenlace, también cuando el espejo ya pide otra respuesta: con dos
    // seguidas (dos golpes del rival a la tropa), esperar solo a la «respuesta»
    // encontraba aún abierta la de antes, la tecla se perdía y la página se
    // quedaba pidiendo la segunda mientras el espejo seguía (escritorio, en la
    // fusión del héroe en la base con la complejidad, 22-10-2026).
    await page.locator('#rueda .rueda[data-fase="desenlace"]').waitFor({ timeout: 20000 });
  }
}

/**
 * Lo mismo que `responderLaRueda` sin página: las búsquedas de semilla juegan
 * solo el espejo, y la persona elige lo mismo que elegirá en la pasada. La
 * respuesta se le pide siempre que la golpean cuerpo a cuerpo (F5), así que una
 * pauta que no la contesta se queda sin turno propio.
 */
export function contestarEnElEspejo(espejo: SesionDeArena, tipo: TipoDeGolpe = 'normal'): void {
  for (let i = 0; i < 20 && espejo.ruedaPendiente !== null; i++) espejo.elegirEnLaRueda(tipo);
}
// --------------------------------------------------------------------- partidas

/**
 * Espera a que los iconos de los recursos sustituyan a sus muestras de color: la
 * barra crece entonces (1,4 px en escritorio, 3,4 en el móvil) y el lienzo baja
 * otro tanto. Midiendo antes, con la máquina cargada (carga ~40, 09-10-2026), la
 * caja era la de la barra sin iconos y la partida de la pasada, abierta tras
 * pintar el suelo, ya no cuadraba.
 */
export async function conLosIconosDeLaBarra(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#resources .swatch').length === 0 &&
      [...document.querySelectorAll<HTMLImageElement>('#resources img')].every((i) => i.complete),
    undefined,
    { timeout: 30_000 },
  );
}

/** Lanza diciendo el paso y lo que había si `vale` no se cumple. */
export function exigir<T>(cosa: T, vale: (x: T) => boolean, paso: string): void {
  if (!vale(cosa))
    throw new Error(`arranque: ${paso}; la página está así: ${JSON.stringify(cosa)}`);
}

/** La barra de la página dice lo mismo que la del espejo; si no, lanza con `quien` delante. */
export async function mismaBarra(
  page: Page,
  espejo: Session,
  paso: string,
  quien = 'tropa',
): Promise<void> {
  const dice = (await page.locator('#status').innerText()).trim();
  if (dice !== espejo.status) {
    throw new Error(
      `${quien}: tras «${paso}» la barra dice «${dice}» y la del espejo «${espejo.status}»`,
    );
  }
}
