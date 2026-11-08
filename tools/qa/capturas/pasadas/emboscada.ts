/**
 * La pasada «emboscada» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la emboscada que la ruta avisa.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser } from 'playwright';
import { buscarEmboscada } from '../escenas.js';
import { caja, captura, log, type Problemas } from '../pagina.js';
import { abrir, cajaDeEscritorio } from '../partida.js';
import { pixelesDelLienzo } from '../pixeles.js';

/**
 * La ruta que pisa la región de un grupo que embosca: el grupo se ve sin «Ver
 * mapa entero» (H1), la ruta se pinta en rojo desde la casilla donde salta, la
 * barra lo dice delante (H2) y, al pulsar, la batalla es contra ese grupo —el
 * aviso es verdad—.
 */
export async function emboscadaAvisada(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const b0 = await cajaDeEscritorio(browser, url, problemas);
  const escena = buscarEmboscada(b0);
  const adonde = escena.destino;
  log(
    `emboscada: semilla ${escena.semilla} y destino (${adonde.x},${adonde.y}), buscados en el espejo`,
  );
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'emboscada avisada',
    semilla: escena.semilla,
    esperada: b0,
  });
  const ruta = espejo.previewPath(adonde);
  const salta = ruta.find((p) => p.emboscada !== undefined);
  // La búsqueda ya lo exigió en otro espejo; si aquí no sale, espejo y búsqueda
  // no juegan la misma partida.
  if (salta === undefined || salta.emboscada === undefined) {
    throw new Error(
      `semilla ${escena.semilla}: la búsqueda dio una emboscada en la ruta a (${adonde.x},${adonde.y}) y el espejo no la ve`,
    );
  }
  const grupo = salta.emboscada;
  const explorado = espejo.explorado;
  if (explorado === null || !explorado.has(grupo.at)) {
    throw new Error(`emboscada: ${grupo.id} embosca y no está pintado: la niebla lo tapa (H1)`);
  }
  const b = await caja(page);
  const enSalto = await mapa.pixel(salta.at);
  const rojos = (px: number[]): number => {
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if ((px[i] ?? 0) > 170 && (px[i + 1] ?? 0) < 90 && (px[i + 2] ?? 0) < 90) n++;
    }
    return n;
  };
  const antes = rojos(await pixelesDelLienzo(page, enSalto.x - b.x, enSalto.y - b.y));
  const destino = await mapa.pixel(adonde);
  await page.mouse.move(destino.x, destino.y);
  await sleep(250);
  const despues = rojos(await pixelesDelLienzo(page, enSalto.x - b.x, enSalto.y - b.y));
  const dice = await page.locator('#status').innerText();
  log(
    `emboscada: ${grupo.id} en (${grupo.at.x},${grupo.at.y}) pintado sin descubrir el mapa; ` +
      `la ruta salta en (${salta.at.x},${salta.at.y}) con ${antes} → ${despues} píxeles rojos — «${dice}»`,
  );
  await captura(page, 'emboscada-01-ruta-avisada');
  if (!dice.startsWith('Cuidado: el camino cruza la región de')) {
    throw new Error(`emboscada: la barra no avisa: «${dice}»`);
  }
  if (despues - antes < 10) {
    throw new Error(
      `emboscada: la casilla donde salta no se pinta en rojo (${antes} → ${despues})`,
    );
  }
  await mapa.pulsar(adonde);
  const atacante = espejo.state.pendingBattle?.attacker;
  if (atacante?.kind !== 'raider' || atacante.raiderId !== grupo.id) {
    throw new Error(`emboscada: al pulsar no hay batalla con ${grupo.id}: ${espejo.status}`);
  }
  await sleep(400);
  await captura(page, 'emboscada-02-batalla');
  log(`emboscada: al pulsar, batalla con ${grupo.id} atacando, como avisaba la ruta`);
  await page.close();
}
