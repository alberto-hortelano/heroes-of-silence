/**
 * La pasada «morada» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la escena de la morada.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import type { Browser } from 'playwright';
import { Session } from '../../../../src/client/sesion/partida.js';
import { disposicionDe } from '../../../../src/shared/base.js';
import { urlDePartida } from '../../navegador/url-de-partida.js';
import {
  cotaDeLaFila,
  entrarEnLaMorada,
  esperarLaBase,
  laPuerta,
  pulsarEnLaBase,
  pulsarEnLaMorada,
  salirDeLaMorada,
} from '../base.js';
import { captura, log, type Problemas, vigilarConsola } from '../pagina.js';

/**
 * Reclutar dentro de la morada (20-10-2026), en el escritorio y en el móvil: los
 * templarios (su edificio, abierto si su versión abierta está en el índice) y los
 * orkos (su marcador, con las cuatro figuras de su pueblo delante).
 * Se entra pulsando el edificio en la base (en el móvil, tocándolo en la lista),
 * se elige la segunda figura en el lienzo y se sale: en el escritorio con un solo
 * Escape, que deja la base y no el mapa; en el móvil, tocando «Volver a la base».
 */
export async function moradaEnEscena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const semilla = 12;
  for (const faccion of ['templarios', 'orkos'] as const) {
    for (const movil of [false, true]) {
      const nombre = `morada-${faccion}${movil ? '-movil' : ''}`;
      const contexto = await browser.newContext(
        movil
          ? {
              viewport: { width: 390, height: 844 },
              deviceScaleFactor: 2,
              isMobile: true,
              hasTouch: true,
            }
          : { viewport: { width: 1440, height: 900 } },
      );
      const page = await contexto.newPage();
      vigilarConsola(page, nombre, problemas);
      const espejo = new Session(semilla, faccion);
      espejo.abrirSuBase();
      await page.goto(`${url}${urlDePartida(semilla, faccion)}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
      await esperarLaBase(page, 'quieto');
      const d = disposicionDe(faccion);
      if (movil) {
        await page.locator('#side [data-action="ir-a-sitio"][data-sitio="lvl1"]').tap();
      } else {
        await pulsarEnLaBase(page, d, d.entrada, laPuerta(d, 'lvl1'));
      }
      await entrarEnLaMorada(page, espejo, 'lvl1', nombre);
      const vista = espejo.vistaDeLaMorada()!;
      const esperadas = faccion === 'orkos' ? 4 : 2;
      if (vista.figuras.length !== esperadas) {
        throw new Error(
          `${nombre}: ${vista.nombre} tiene ${vista.figuras.length} unidades y no ${esperadas}`,
        );
      }
      await cotaDeLaFila(page, espejo, nombre);
      await captura(page, `${nombre}-01-entrar`);
      await pulsarEnLaMorada(page, espejo, vista.figuras[1]!.id, nombre, movil);
      await captura(page, `${nombre}-02-la-segunda`);
      // El panel de la elegida: sus cifras, su reclutamiento y, si no se puede, por qué.
      const f = espejo.vistaDeLaMorada()!.ficha;
      const ficha = (await page.locator('#side .ficha-de-la-morada').innerText()).replace(
        /\s+/g,
        ' ',
      );
      for (const texto of [`Índice ${f.indice} · nivel ${f.nivel}`, `${f.precio} cada uno`]) {
        if (!ficha.includes(texto))
          throw new Error(`${nombre}: la ficha no dice «${texto}»: ${ficha}`);
      }
      if (f.motivo !== null && !ficha.includes(f.motivo)) {
        throw new Error(`${nombre}: la ficha no escribe por qué no se recluta («${f.motivo}»)`);
      }
      log(`${nombre}: ${f.nombre}, ${f.motivo === null ? `caben ${f.plan?.maximo}` : f.motivo}`);
      await salirDeLaMorada(page, espejo, movil ? 'toque' : 'escape', nombre);
      await captura(page, `${nombre}-03-de-vuelta-en-la-base`);
      await contexto.close();
    }
  }
}
