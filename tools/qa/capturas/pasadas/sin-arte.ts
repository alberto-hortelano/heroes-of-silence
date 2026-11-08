/**
 * La pasada «sin-arte» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la partida sin imágenes, con los marcadores.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser } from 'playwright';
import { buscarSinArte } from '../escenas.js';
import { captura, esperarCola, log, type Problemas } from '../pagina.js';
import { abrir, cajaDeEscritorio, guardiaALaVista, patrullaALaVista } from '../partida.js';

/** Lo mismo sin el arte de la rama: cada figura tiene que caer a su marcador. */
export async function sinArte(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const b = await cajaDeEscritorio(browser, url, problemas);
  const semilla = await buscarSinArte(b);
  log(`sin arte: semilla ${semilla}, buscada en el espejo`);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'sin arte',
    semilla,
    esperada: b,
    // Solo las imágenes: los JSON de las hojas se importan como módulo y viven
    // en la misma carpeta; negarlos no es «sin arte», es romper la página. Con
    // los mapas densos entran también las piezas de `assets/mapa/` y las
    // texturas de terreno: sin ellas, montañas, nodos, ciudades, pueblos y
    // recursos caen a su marcador y el suelo a su pigmento. Y las hojas de las
    // unidades (`assets/unidades/`): desde que el juego recluta las de la arena
    // (19-10-2026) la tropa se pintaba con su arte, y la escena de la tropa no
    // enseñaba ningún marcador.
    sinImagenes: /\/(rpg|characters|mapa|unidades|generated\/terrain)\/.*\.(png|webp)$/,
  });
  await captura(page, 'sin-arte-01-mapa');
  // La escena de la tropa sin arte: cada figura, su marcador con la inicial.
  await page.keyboard.press('t');
  await page.waitForSelector('#app[data-escena="tropa"]', { timeout: 5000 });
  await sleep(300);
  await captura(page, 'sin-arte-03-tropa');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 5000 });
  await page.mouse.move(5, 5);
  await sleep(300);
  // Sin arte la figura no respira y el lienzo no se repinta solo: el
  // deslizamiento de la patrulla es lo que tiene que pedir los fotogramas.
  await patrullaALaVista(page, espejo, mapa, 'sin-arte-02');
  await mapa.pulsar(await guardiaALaVista(mapa, espejo));
  if (espejo.battle !== null) {
    await esperarCola(espejo.battle, espejo.battle.log);
    await captura(page, 'sin-arte-02-batalla');
  }
  await page.close();
}
