/**
 * La pasada «movil» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la partida en un móvil.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser } from 'playwright';
import { camaraQuieta } from '../../../../src/client/render/base/camara.js';
import { baseOf } from '../../../../src/core/state/consultas.js';
import { disposicionDe, FONDO_DE_LA_FRANJA } from '../../../../src/shared/base.js';
import { elSuelo, esperarLaBase, pulsarEnLaBase } from '../base.js';
import { caja, captura, comprobar, esperarCola, log, type Problemas } from '../pagina.js';
import {
  abrir,
  cajaDeMovil,
  guardiaALaVista,
  semillaDelMovil,
  turnoDeBatalla,
} from '../partida.js';

export async function jugarMovil(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const semilla = await semillaDelMovil(browser, url, problemas);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'móvil',
    semilla,
    movil: true,
    esperada: await cajaDeMovil(browser, url, problemas),
  });
  await captura(page, 'movil-01-mapa');
  const suBase = baseOf(espejo.state, espejo.jugador.id);
  if (suBase === null) throw new Error('móvil: el jugador no tiene base');
  await mapa.pulsar(suBase.at);
  await esperarLaBase(page, 'quieto');
  // En el móvil la base es una ventana que sigue a quien camina: se le manda al
  // extremo izquierdo de lo que se ve, y la vista va con él.
  {
    const d = disposicionDe(espejo.activeTown!.faction);
    const bb = await caja(page);
    const lienzo = { ancho: bb.width, alto: bb.height };
    const antes = camaraQuieta(d, lienzo, d.entrada.x);
    const destino = { x: antes + 0.5, y: FONDO_DE_LA_FRANJA - 0.9 };
    // Que eche a andar de verdad (lo espera `pulsarEnLaBase`): un clic fuera del
    // lienzo dejaba «quieto» y la captura salía con la figura en la entrada (la
    // primera redacción de esto).
    await pulsarEnLaBase(page, d, d.entrada, elSuelo(destino));
    await esperarLaBase(page, 'quieto');
    const despues = camaraQuieta(d, lienzo, destino.x);
    if (antes === despues) {
      throw new Error('móvil: la vista de la base no tenía hacia dónde seguir a quien camina');
    }
    log(
      `móvil: la vista sigue a quien camina, de x=${antes.toFixed(2)} a x=${despues.toFixed(2)} pasos`,
    );
  }
  await captura(page, 'movil-02-castillo');
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  espejo.closeTown();
  await sleep(200);
  await comprobar(page, espejo, 'móvil: volver del castillo');
  await mapa.pulsar(await guardiaALaVista(mapa, espejo));
  if (espejo.battle === null)
    throw new Error(`móvil: el espejo no ha entrado en batalla: ${espejo.status}`);
  await esperarCola(espejo.battle, espejo.battle.log);
  await captura(page, 'movil-03-batalla');
  // El tablero es más ancho que la pantalla: se desplaza en horizontal.
  const desplazable = await page.evaluate(() => {
    const l = document.getElementById('lienzo');
    return l === null ? null : { ancho: l.scrollWidth, visible: l.clientWidth, x: l.scrollLeft };
  });
  log(
    `móvil: tablero de ${desplazable?.ancho} px en un marco de ${desplazable?.visible}, desplazado a ${desplazable?.x}`,
  );
  for (let n = 3; n < 6 && espejo.battle?.finished === null; n++) {
    await turnoDeBatalla(page, espejo, n);
  }
  await captura(page, 'movil-04-batalla-jugada');
  await page.close();
}
