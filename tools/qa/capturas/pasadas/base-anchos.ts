/**
 * La pasada «base-anchos» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la base a varios anchos de ventana.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser } from 'playwright';
import { pasoDeLaBase } from '../../../../src/client/render/proyeccion.js';
import { Session } from '../../../../src/client/sesion/partida.js';
import { urlDePartida } from '../../navegador/url-de-partida.js';
import { cotaDeLaFila, entrarEnLaMorada, esperarLaBase, salirDeLaMorada } from '../base.js';
import { caja, captura, log, type Problemas, vigilarConsola } from '../pagina.js';

// ------------------------------------------------------------------ la base a varios anchos

/**
 * La pausa de la pasada antes de un toque que cae donde cayó el de antes. El navegador cuenta
 * dos toques en el mismo sitio a menos de 400 ms como un doble toque (el clic del segundo llega
 * con `detail` 2; medido el 07-11-2026: a 399 ms, doble; a 415, dos sueltos), y el segundo clic
 * de un doble clic no cuenta en ningún botón salvo los que suman de uno en uno (decisión del
 * usuario, 07-11-2026: `repartirClic`, `partida/reparto-del-clic.ts`). En el móvil, «Volver al
 * mapa» de la base cae donde estaba «Volver a la base» de la morada: con solo lo que espera
 * `salirDeLaMorada`, unas veces llegaba a 399 ms y la base no se cerraba.
 */
const PAUSA_ANTES_DE_OTRO_TOQUE_MS = 500;

/**
 * La base a todo el alto (C16 de la vuelta 2 de la morada, 20-10-2026: «al hacer
 * la pantalla más estrecha se encoge la parte donde se ve la base; eso no pasa en
 * el mapa»): a 1440, 1100 y 800 de ancho, el lienzo de la base, el de la morada y
 * el del mapa miden lo mismo de alto (a 800 la barra de arriba ocupa dos líneas y
 * los tres pierden lo mismo), y el adulto, 0,95 pasos de la base de ese alto
 * (`pasoDeLaBase`, que no lee el ancho); en el móvil, el marco de 380 del
 * combate. Deja la base y la morada de cada ancho en captura.
 */
export async function baseAVariosAnchos(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const semilla = 12;
  for (const ancho of [1440, 1100, 800, 390]) {
    const movil = ancho < 760;
    const nombre = `base-anchos-${ancho}`;
    const contexto = await browser.newContext(
      movil
        ? {
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
          }
        : { viewport: { width: ancho, height: 900 } },
    );
    const page = await contexto.newPage();
    vigilarConsola(page, nombre, problemas);
    const espejo = new Session(semilla, 'templarios');
    espejo.abrirSuBase();
    await page.goto(`${url}${urlDePartida(semilla, 'templarios')}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
    await esperarLaBase(page, 'quieto');
    // El arte de la base, ya llegado: la captura es para mirarla.
    await sleep(800);
    const enLaBase = await caja(page);
    const marco = await page.locator('.map-wrap').boundingBox();
    if (marco === null) throw new Error(`${nombre}: no hay marco del lienzo`);
    const paso = pasoDeLaBase(enLaBase.height);
    log(
      `${nombre}: la base en ${Math.round(enLaBase.width)}×${Math.round(enLaBase.height)} (marco de ${Math.round(marco.height)} de alto), el adulto de ${Math.round(0.95 * paso)} px`,
    );
    await captura(page, `${nombre}-01-base`);
    const lista = page.locator('#side [data-action="ir-a-sitio"][data-sitio="lvl1"]');
    if (movil) await lista.tap();
    else await lista.click();
    await entrarEnLaMorada(page, espejo, 'lvl1', nombre);
    const enLaMorada = await caja(page);
    if (Math.abs(enLaMorada.height - enLaBase.height) > 0.5) {
      throw new Error(
        `${nombre}: la morada mide ${enLaMorada.height} de alto y la base ${enLaBase.height}`,
      );
    }
    await cotaDeLaFila(page, espejo, nombre);
    await sleep(500);
    await captura(page, `${nombre}-02-morada`);
    await salirDeLaMorada(page, espejo, movil ? 'toque' : 'escape', nombre);
    // La base, al alto del mapa, también en el móvil (QA I2 de la vuelta 2).
    const volver = page.locator('[data-action="close-town"]');
    if (movil) {
      await sleep(PAUSA_ANTES_DE_OTRO_TOQUE_MS);
      await volver.tap();
    } else await volver.click();
    await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 10_000 });
    const enElMapa = await caja(page);
    if (Math.abs(enElMapa.height - enLaBase.height) > 0.5) {
      throw new Error(
        `${nombre}: la base mide ${enLaBase.height} de alto y el mapa ${enElMapa.height}`,
      );
    }
    await contexto.close();
  }
}
