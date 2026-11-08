/**
 * La pasada «veteranos» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): los veteranos en el panel y en el campo.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import { nombreEnElCampo } from '../../../../src/client/render/batalla/distintivo.js';
import { galonesDe } from '../../../../src/client/render/batalla/figura.js';
import type { Session } from '../../../../src/client/sesion/partida.js';
import { troopSummary } from '../../../../src/core/hero/troop.js';
import { nivelDeUnidad } from '../../../../src/core/unidad/nivel.js';
import { buscarVeteranos, VETERANOS } from '../escenas.js';
import { captura, comprobar, esperarCola, log, type Problemas } from '../pagina.js';
import { abrir, cajaDeEscritorio, guardiaALaVista, pasarDia } from '../partida.js';

/**
 * Los veteranos del héroe, en el panel: cada uno con «Veterano · rango N · nivel n · …»
 * —o «Nivel 1 · …» quien ya tiene experiencia y no llega al primer umbral—
 * tal y como lo deriva el espejo (`troopSummary`). Lanza si no hay ninguno de
 * nivel 2 o más: la pasada existe para enseñarlos, y una batalla ganada que no
 * deja a nadie arriba querría decir que la experiencia no llega al cliente.
 */
async function veteranosEnElPanel(page: Page, espejo: Session, paso: string): Promise<void> {
  const heroe = espejo.myHeroes()[0];
  if (heroe === undefined) throw new Error(`${paso}: no queda héroe en el espejo`);
  const filas = troopSummary(heroe.army).filter((g) => g.veterania !== undefined);
  if (!filas.some((g) => g.rango >= 2)) {
    throw new Error(
      `${paso}: ningún individuo de ${heroe.name} pasa del rango 1 (${filas.length} con experiencia): no hay veterano que enseñar`,
    );
  }
  const panel = (await page.locator('#side').innerText()).replace(/\s+/g, ' ');
  for (const g of filas) {
    const nivel = nivelDeUnidad(g.unit);
    const esperado =
      g.rango >= 2 ? `Veterano · rango ${g.rango} · nivel ${nivel}` : `Rango 1 · nivel ${nivel}`;
    if (!panel.includes(esperado)) {
      throw new Error(
        `${paso}: el espejo tiene un ${g.unit.name} de rango ${g.rango} y el panel no dice «${esperado}»`,
      );
    }
  }
  log(
    `${paso}: ${filas.length} veterano(s) en el panel — ${filas
      .map((g) => `${g.unit.name} rango ${g.rango}, ${g.veterania?.experiencia} exp`)
      .join('; ')}`,
  );
}

/**
 * Un veterano en el campo: «· rango N» en su fila de «En el campo», con el rango
 * que dice el espejo. Los galones del lienzo no se miran por píxel: van en la
 * captura, y su cuenta la prueba `galonesDe` en los tests.
 */
async function veteranoEnElCampo(page: Page, espejo: Session): Promise<void> {
  const battle = espejo.battle;
  if (battle === null) throw new Error('no hay batalla en el espejo');
  const vet = battle.stacks.find((s) => s.count > 0 && galonesDe(s) > 0);
  if (vet === undefined) throw new Error('ningún veterano de rango ≥ 2 pisa este tablero');
  // Con su distintivo, como lo nombra el panel (#198: dos arqueros, s2 con #224).
  const esperado = `${nombreEnElCampo(battle, vet)} · rango ${galonesDe(vet) + 1}`;
  const panel = (await page.locator('#side').innerText()).replace(/\s+/g, ' ');
  if (!panel.includes(esperado)) throw new Error(`en «En el campo» falta «${esperado}»`);
  log(`batalla con veterano: «${esperado}» en el campo, ${galonesDe(vet)} galón(es) en la figura`);
}

/**
 * La tropa que crece, vista (ciclo «la tropa crece»): una guardia resuelta deja
 * un veterano, el panel lo cuenta con su nivel y lo que le falta, y en la
 * batalla del día siguiente pisa el tablero con galones y «· rango N».
 *
 * Pasada propia y no dentro de la de escritorio: allí la primera batalla se
 * juega a clics cerrando turnos para enseñar la rendición, y nadie de la
 * tropa llega a pegar. La semilla la busca el espejo antes de abrir la página
 * (`buscarVeteranos`): la batalla más cercana a la vista —guardia, o el grupo
 * que embosca por el camino— deja un veterano y al día siguiente hay otra.
 */
export async function veteranos(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const b = await cajaDeEscritorio(browser, url, problemas);
  const semilla = await buscarVeteranos(b);
  log(`veteranos: semilla ${semilla}, buscada en el espejo`);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'veteranos',
    semilla,
    esperada: b,
  });
  await mapa.pulsar(await guardiaALaVista(mapa, espejo, VETERANOS));
  if (espejo.battle === null) throw new Error(`no hubo batalla: ${espejo.status}`);
  await esperarCola(espejo.battle, espejo.battle.log);
  await page.getByRole('button', { name: 'Resolver sola' }).click();
  espejo.autoResolveBattle();
  await sleep(400);
  await comprobar(page, espejo, 'resolver la primera batalla de los veteranos');
  await veteranosEnElPanel(page, espejo, 'tras la primera batalla');
  const cronica = await page.locator('#side').innerText();
  if (!cronica.includes('sube a veterano de rango')) {
    throw new Error('la crónica de la página no cuenta el ascenso de la tropa');
  }
  await captura(page, 'veteranos-01-panel');
  await pasarDia(page, espejo);
  await comprobar(page, espejo, 'pasar al día 2 con los veteranos');
  await mapa.pulsar(await guardiaALaVista(mapa, espejo, VETERANOS));
  if (espejo.battle === null) throw new Error(`no hubo segunda batalla: ${espejo.status}`);
  await esperarCola(espejo.battle, espejo.battle.log);
  await veteranoEnElCampo(page, espejo);
  await captura(page, 'veteranos-02-batalla-galones');
  await page.close();
}
