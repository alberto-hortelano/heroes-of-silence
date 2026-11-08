/**
 * La pasada «perdida» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la batalla que se pierde.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser } from 'playwright';
import { baseOf } from '../../../../src/core/state/consultas.js';
import { buscarDerrota } from '../escenas.js';
import { captura, comprobar, esperarCola, log, type Problemas } from '../pagina.js';
import { abrir, cajaDeEscritorio, mirarGuardia } from '../partida.js';

export async function batallaPerdida(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  // Era una semilla fija —la 273, la 534, la 97…— que caía cada vez que el
  // héroe o el mapa cambiaban; la busca el espejo (`buscarDerrota`).
  const b = await cajaDeEscritorio(browser, url, problemas);
  const { semilla, guardia: suya } = buscarDerrota(b);
  log(`batalla perdida: semilla ${semilla}, guardia (${suya.x},${suya.y}), buscadas en el espejo`);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'batalla perdida',
    semilla,
    esperada: b,
  });
  const guardia = { at: await mirarGuardia(mapa, suya) };
  await mapa.pulsar(guardia.at);
  if (espejo.battle === null) {
    throw new Error(`semilla ${semilla}: no hubo batalla: ${espejo.status}`);
  }
  await esperarCola(espejo.battle, espejo.battle.log);
  await captura(page, 'desktop-13-batalla-que-se-pierde');
  await page.getByRole('button', { name: 'Resolver sola' }).click();
  espejo.autoResolveBattle();
  await sleep(400);
  await comprobar(page, espejo, 'resolver la batalla perdida');
  const final = [...espejo.state.log].reverse().find((e) => e.kind === 'battle_ended');
  const perdida = final?.kind === 'battle_ended' && final.winner === 'defender';
  log(`batalla de la semilla ${semilla}: ${perdida ? 'PERDIDA' : 'ganada'}`);
  if (!perdida) throw new Error('la batalla que debía perderse se ha ganado: cambia de guardia');
  // El héroe derrotado vuelve a la base: en el castillo, sin tropa y sin
  // movimiento, y la crónica lo cuenta en ese orden.
  const vuelto = espejo.myHeroes()[0];
  const base = baseOf(espejo.state, espejo.jugador.id);
  if (vuelto === undefined || base === null) {
    throw new Error('el héroe derrotado no ha vuelto a la base: no está en el mapa');
  }
  if (vuelto.at.x !== base.at.x || vuelto.at.y !== base.at.y || vuelto.movePoints !== 0) {
    throw new Error(
      `el héroe derrotado debía estar en (${base.at.x},${base.at.y}) sin movimiento y está en (${vuelto.at.x},${vuelto.at.y}) con ${vuelto.movePoints}`,
    );
  }
  const suyos = espejo.state.log
    .filter(
      (e) => (e.kind === 'hero_defeated' || e.kind === 'hero_returned') && e.hero === vuelto.id,
    )
    .map((e) => e.kind);
  if (suyos.join() !== 'hero_defeated,hero_returned') {
    throw new Error(`la crónica del héroe derrotado dice ${suyos.join(', ')}`);
  }
  const cronica = await page.locator('#side').innerText();
  if (!cronica.includes('vuelve a la base')) {
    throw new Error('la crónica de la página no cuenta que el héroe vuelve a la base');
  }
  log(`héroe derrotado: de vuelta en (${base.at.x},${base.at.y}), sin tropa y sin movimiento`);
  await captura(page, 'desktop-14-mapa-tras-batalla-perdida');
  await page.close();
}
