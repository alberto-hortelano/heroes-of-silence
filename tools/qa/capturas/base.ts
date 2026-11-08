/**
 * La base y su escena lateral en la página: la puerta de un edificio, pulsar en la base
 * y esperar a quien anda, pulsar una figura, entrar en una morada, elegir en ella y salir, y
 * las cotas del encuadre con que se comprueba. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright';
import { cajasDeLaMorada, EscenaMorada } from '../../../src/client/partida/morada/escena.js';
import { camaraDeLaBase, camaraQuieta } from '../../../src/client/render/base/camara.js';
import { dondeEsperaEnLaMorada } from '../../../src/client/render/base/fila.js';
import { dondePulsarElSitio } from '../../../src/client/render/base/recortes.js';
import { type CajaDeFigura, cajaDeFiguraEn } from '../../../src/client/render/figuras/caja.js';
import { pasoDeLaHoja } from '../../../src/client/render/figuras/de-pie.js';
import { enPantalla, pasoDeLaBase, type Tablero } from '../../../src/client/render/proyeccion.js';
import type { Session } from '../../../src/client/sesion/partida.js';
import type { VistaDeLaMorada } from '../../../src/client/sesion/vistas/morada.js';
import type { SitioId } from '../../../src/core/town/sitios.js';
import { COMPRESION_SUELO, type Plano } from '../../../src/shared/arte.js';
import { type Disposicion, disposicionDe } from '../../../src/shared/base.js';
import type { Caja } from './escenas.js';
import { caja, densidadDe, log, mismaBarra } from './pagina.js';

/** El medio de la puerta de un edificio: siempre pintado (`dondePulsarElSitio`). */
export const laPuerta =
  (d: Disposicion, sitio: SitioId) =>
  (t: Tablero): { x: number; y: number } =>
    dondePulsarElSitio(t, d.sitios[sitio]);

/** Un punto del suelo de la base. */
export const elSuelo =
  (p: Plano) =>
  (t: Tablero): { x: number; y: number } =>
    enPantalla(t, p);

/**
 * Pulsa lo que diga `donde` con quien camina en `foco`: la cámara sigue a la
 * figura y, quieta, está en `camaraQuieta`, así que el píxel sale de dónde está
 * ella con la misma cuenta que el juego.
 */
export async function pulsarEnLaBase(
  page: Page,
  d: Disposicion,
  foco: Plano,
  donde: (t: Tablero) => { x: number; y: number },
): Promise<void> {
  const bb = await caja(page);
  const lienzo = { ancho: bb.width, alto: bb.height };
  const q = donde(camaraDeLaBase(lienzo, camaraQuieta(d, lienzo, foco.x)));
  const antes = await page.locator('#canvas').getAttribute('data-base');
  await page.mouse.click(bb.x + q.x, bb.y + q.y);
  // El fotograma que echa a andar: sin esperarlo, un «quieto» de antes del clic
  // daría por llegada una marcha que no ha empezado. `data-base` lo escribe cada
  // fotograma, y una marcha dura varios: se mira en cada uno.
  await page.waitForFunction((m) => document.getElementById('canvas')?.dataset.base !== m, antes, {
    polling: 'raf',
    timeout: 5000,
  });
}

/**
 * Espera a que la base diga `marca` en `canvas[data-base]`: lo abierto al llegar.
 * Los paneles se pintan en el mismo fotograma que la escribe (`main.ts`).
 */
export async function esperarLaBase(page: Page, marca: string): Promise<void> {
  await page.locator(`#canvas[data-base="${marca}"]`).waitFor({ state: 'attached', timeout: 8000 });
}

/**
 * Pulsa (o toca) en el lienzo el medio del cuerpo de la figura de caja `c`, y
 * devuelve el píxel pulsado en el lienzo: lo que pulsa luego el espejo. El ratón
 * llega moviéndose, como una persona, para que la escena vea la señalada.
 */
export async function pulsarLaFigura(
  page: Page,
  b: Caja,
  c: CajaDeFigura,
  toque = false,
): Promise<{ x: number; y: number }> {
  const x = Math.round(b.x + c.x);
  const y = Math.round(b.y + c.suelo - c.alto * 0.5);
  if (toque) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x - 4, y);
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
  }
  return { x: x - b.x, y: y - b.y };
}

/**
 * La cota del encuadre de una escena de pie (E1 del ciclo de corrección de la
 * tropa; C2 de la morada), con las cajas de la misma cuenta que pinta la página y
 * el lienzo medido en ella: nadie más grande que su hoja a la densidad de la página
 * (`pasoDeLaHoja`; decisión del usuario del 20-10-2026: agrandadas pixelaban) ni fuera
 * del lienzo, y en una fila (`enFila`, de izquierda a derecha) ninguna pisa a la
 * de al lado. `dice` es lo que va al registro tras el número de figuras.
 */
function cotaDelEncuadre(
  b: Caja,
  densidad: number,
  quien: string,
  cajas: readonly CajaDeFigura[],
  dice: (alto: number, tope: number) => string,
  enFila = false,
): void {
  const tope = cajaDeFiguraEn(
    { paso: pasoDeLaHoja(densidad), origenX: 0, origenY: 0, compresion: COMPRESION_SUELO },
    { x: 0, y: 0 },
  ).alto;
  const grandes = cajas.filter((c) => c.alto > tope + 1e-6).length;
  const fuera = cajas.filter(
    (c) =>
      c.x - c.ancho / 2 < 0 ||
      c.x + c.ancho / 2 > b.width ||
      c.suelo - c.alto < 0 ||
      c.suelo > b.height,
  ).length;
  const pisadas = enFila
    ? cajas.filter((c, i) => i > 0 && c.x - cajas[i - 1]!.x < c.ancho).length
    : 0;
  log(
    `${quien}: ${dice(Math.round(Math.max(...cajas.map((c) => c.alto))), Math.round(tope))} en ${Math.round(b.width)}×${Math.round(b.height)}`,
  );
  if (grandes > 0 || fuera > 0 || pisadas > 0) {
    throw new Error(
      `${quien}: ${grandes} figuras más grandes que su hoja, ${fuera} fuera del lienzo y ${pisadas} pisando a la de al lado`,
    );
  }
}
// ------------------------------------------------------------------ la morada en escena

/**
 * La escena de la morada del espejo en el lienzo de la página: la MISMA clase que
 * lee el clic en la página (`EscenaMorada`). En Node no pinta: su fondo, la base,
 * no hace falta para encuadrar.
 */
async function escenaDeLaMorada(
  page: Page,
  espejo: Session,
): Promise<{ b: Caja; densidad: number; vista: VistaDeLaMorada; escena: EscenaMorada }> {
  const vista = espejo.vistaDeLaMorada();
  if (vista === null) throw new Error('morada: el espejo no está en la escena de la morada');
  const b = await caja(page);
  const escena = new EscenaMorada(
    () => espejo,
    () => null,
  );
  const densidad = await densidadDe(page);
  escena.encuadrar(b.width, b.height, densidad);
  return { b, densidad, vista, escena };
}

/**
 * Espera a que la página entre en la morada de `sitio` (`canvas[data-morada]`,
 * `<edificio>:<unidad>`), la abre en el espejo y comprueba que la página la abre
 * con el lateral arriba y la misma elegida y la misma barra que él.
 */
export async function entrarEnLaMorada(
  page: Page,
  espejo: Session,
  sitio: SitioId,
  quien: string,
): Promise<void> {
  espejo.abrirLaMorada(sitio);
  const vista = espejo.vistaDeLaMorada()!;
  await esperarLaElegidaDeLaMorada(page, espejo, `${quien}: entrar en ${vista.nombre}`);
  const escena = await page.locator('#app').getAttribute('data-escena');
  if (escena !== 'morada')
    throw new Error(`${quien}: la página está en «${escena}» y no en la morada`);
  const lateral = await page.evaluate(
    () => (document.getElementById('lateral') as HTMLElement).scrollTop,
  );
  if (lateral !== 0) {
    throw new Error(`${quien}: el panel de la morada abre bajado ${lateral} px: la lista no se ve`);
  }
  await mismaBarra(page, espejo, 'entrar', quien);
  // El fondo y la fila, ya con lo que haya de arte.
  await sleep(500);
}

/** Espera a que el lienzo diga que la elegida es la del espejo, y su ficha en el panel. */
async function esperarLaElegidaDeLaMorada(
  page: Page,
  espejo: Session,
  paso: string,
): Promise<void> {
  const vista = espejo.vistaDeLaMorada()!;
  const marca = `${vista.edificio}:${vista.figuras[vista.elegida]!.id}`;
  await page
    .waitForSelector(`#canvas[data-morada="${marca}"]`, { timeout: 8000 })
    .catch(async () => {
      const tiene = await page.locator('#canvas').getAttribute('data-morada');
      throw new Error(`${paso}: la página está en «${tiene}» y el espejo en «${marca}»`);
    });
  const titulo = (await page.locator('#side .ficha-de-la-morada h3').first().innerText()).trim();
  if (titulo.toUpperCase() !== vista.ficha.nombre.toUpperCase()) {
    throw new Error(
      `${paso}: la ficha de la página es «${titulo}» y la del espejo «${vista.ficha.nombre}»`,
    );
  }
}

/**
 * Pulsa (o toca) en el lienzo la figura de `unidad` y la elige en el espejo con la
 * misma escena que lee el clic en la página (`EscenaMorada`), en el píxel pulsado.
 */
export async function pulsarEnLaMorada(
  page: Page,
  espejo: Session,
  unidad: string,
  quien: string,
  toque = false,
): Promise<void> {
  const { b, vista, escena } = await escenaDeLaMorada(page, espejo);
  const i = vista.figuras.findIndex((f) => f.id === unidad);
  if (i < 0) throw new Error(`${quien}: ${unidad} no se recluta en ${vista.nombre}`);
  const e = escena.encuadre(vista);
  const p = await pulsarLaFigura(page, b, cajasDeLaMorada(e.camara)(e.en[i]!), toque);
  escena.pulsar(p.x, p.y);
  if (espejo.vistaDeLaMorada()!.figuras[espejo.vistaDeLaMorada()!.elegida]!.id !== unidad) {
    throw new Error(`${quien}: pulsar la figura de ${unidad} no la elige en el espejo`);
  }
  await esperarLaElegidaDeLaMorada(page, espejo, `${quien}: pulsar la figura de ${unidad}`);
}

/**
 * Vuelve de la morada a la base con «Volver a la base» (clic o toque) o con
 * Escape, en la página y en el espejo, y comprueba que una sola pulsación deja
 * la base —no el mapa— con quien anduvo quieto.
 */
export async function salirDeLaMorada(
  page: Page,
  espejo: Session,
  gesto: 'boton' | 'toque' | 'escape',
  quien: string,
): Promise<void> {
  const volver = page.locator('[data-action="cerrar-morada"]');
  if (gesto === 'escape') await page.keyboard.press('Escape');
  else if (gesto === 'toque') await volver.tap();
  else await volver.click();
  espejo.cerrarLaMorada();
  await esperarLaBase(page, 'quieto');
  // Un fotograma más: un Escape que cerrara también la base se vería ahora.
  await sleep(300);
  const escena = await page.locator('#app').getAttribute('data-escena');
  if (escena !== 'town' || (await page.locator('#canvas').getAttribute('data-morada')) !== null) {
    throw new Error(`${quien}: al salir de la morada con ${gesto} la página está en «${escena}»`);
  }
}

/**
 * La cota de la fila de la morada (C2, C12): enteras, sin pisarse y no más grandes
 * que su hoja, y quien anduvo, delante de la fila, no tapa a ninguna (su cabeza
 * queda por debajo de los pies de todas). Dice cuánto se acercó la cámara a la de la base.
 */
export async function cotaDeLaFila(page: Page, espejo: Session, quien: string): Promise<void> {
  const { b, densidad, vista, escena } = await escenaDeLaMorada(page, espejo);
  const e = escena.encuadre(vista);
  const cajas = e.en.map(cajasDeLaMorada(e.camara));
  const d = disposicionDe(vista.faccion);
  // Quien anduvo espera delante de la fila (`dondeEsperaEnLaMorada`): su cabeza,
  // por debajo de los pies de todos los reclutas.
  const suya = cajaDeFiguraEn(e.camara, dondeEsperaEnLaMorada(d, vista.sitio));
  const tapados = cajas.filter((c) => suya.suelo - suya.alto < c.suelo).length;
  if (tapados > 0) {
    throw new Error(`${quien}: quien anduvo tapa a ${tapados} reclutas, delante de la fila`);
  }
  const base = pasoDeLaBase(b.height);
  cotaDelEncuadre(
    b,
    densidad,
    quien,
    cajas,
    (alto, tope) =>
      `${vista.nombre} con ${e.en.length} figuras de ${alto} px (tope de la hoja, ${tope}), con la base acercada ×${(e.camara.paso / base).toFixed(2)} (${Math.round(base)} → ${Math.round(e.camara.paso)} px por paso),`,
    true,
  );
}
