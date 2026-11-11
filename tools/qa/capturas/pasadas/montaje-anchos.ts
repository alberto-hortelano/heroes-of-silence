/**
 * La pasada «montaje-anchos» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): el
 * montaje de la arena a los tamaños de un portátil, con la muralla desplegada y plegada.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada.
 *
 * Existe por #246 (11-11-2026, `docs/agents/2026-11-11-arena-clic-a-1024/`): con la muralla
 * desplegada —lo de salida, con el navegador limpio— su franja se comía el alto del montaje
 * y los bandos y la ficha medían 0 px a 1024×768 y a 1280×800 (70 px a 1440×900). El clic
 * en el nombre de una unidad no la abría, y `elementFromPoint` daba la rejilla de la
 * muralla. Nadie lo vio porque la pasada «arena» mira a 1440×900, donde aún entraba el clic.
 */

import type { Browser, Page } from 'playwright';
import { unidad } from '../../../../src/core/unidad/catalogo.js';
import { abrirLaArena, asentada } from '../arena.js';
import { captura, log, type Problemas, vigilarConsola } from '../pagina.js';

/** Los tamaños de ventana que se miran: de un portátil pequeño a una pantalla grande. */
const TAMAÑOS: readonly (readonly [number, number])[] = [
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

/**
 * Dos unidades por bando, y en cada uno una que dispara: su ficha lleva un clip más
 * («Disparo») y es la más alta antes de la tabla de cifras.
 */
const BANDOS = {
  izquierda: ['templario-escudo', 'elfo-arquero'],
  derecha: ['imperio-arcabucero', 'orko-dos-armas'],
} as const;

/**
 * Lo que no se ve o no se puede pulsar del montaje, medido en la página: de cada bando, su
 * cabecera y su primera unidad enteras dentro de la vista (la de la ventana y la de su
 * columna, sin desplazarla); el nombre de cada unidad, que es lo que hay bajo su centro
 * (`elementFromPoint`); de la ficha, su título y la cabecera y la primera fila de su tabla
 * de cifras. Se evalúa en la página: sin funciones con nombre dentro, que tsx las envuelve.
 */
function loQueNoSeVe(): string[] {
  const fallos: string[] = [];
  // Lo que tiene que verse entero: el elemento, la columna que lo recorta y cómo se llama.
  const enteros: [Element, Element, string][] = [];
  for (const lado of ['izquierda', 'derecha']) {
    const bando = document.getElementById(`bando-${lado}`);
    const cabecera = bando?.querySelector('h3');
    const primera = bando?.querySelector('.puesto');
    if (bando == null || cabecera == null || primera == null) {
      fallos.push(`el bando ${lado} no tiene cabecera o unidades`);
      continue;
    }
    enteros.push([cabecera, bando, `la cabecera del bando ${lado}`]);
    enteros.push([primera, bando, `la primera unidad del bando ${lado}`]);
    for (const nombre of bando.querySelectorAll('.puesto button.nombre')) {
      const r = nombre.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const encima = document.elementFromPoint(x, y);
      if (encima === null || !nombre.contains(encima)) {
        const que =
          encima === null
            ? 'nada'
            : `${encima.tagName.toLowerCase()}${encima.id === '' ? '' : `#${encima.id}`}${[...encima.classList].map((c) => `.${c}`).join('')}`;
        fallos.push(
          `bajo el centro del nombre «${nombre.textContent?.trim()}» (bando ${lado}, en ${Math.round(x)},${Math.round(y)}) está ${que}, no el nombre`,
        );
      }
    }
  }
  const ficha = document.getElementById('ficha');
  const titulo = ficha?.querySelector('.titulo-de-ficha');
  const cabeceraDeCifras = ficha?.querySelector('.tabla-de-cifras thead tr');
  const primeraCifra = ficha?.querySelector('.tabla-de-cifras tbody tr');
  if (ficha == null || titulo == null || cabeceraDeCifras == null || primeraCifra == null)
    fallos.push('no hay ficha, o no tiene título o tabla de cifras');
  else {
    if (ficha.scrollTop !== 0) fallos.push(`la ficha está desplazada ${ficha.scrollTop} px`);
    enteros.push([titulo, ficha, 'el título de la ficha']);
    enteros.push([cabeceraDeCifras, ficha, 'la cabecera de la tabla de cifras de la ficha']);
    enteros.push([primeraCifra, ficha, 'la primera fila de la tabla de cifras de la ficha']);
  }
  for (const [de, zona, que] of enteros) {
    const r = de.getBoundingClientRect();
    const z = zona.getBoundingClientRect();
    const arriba = Math.max(z.top, 0);
    const abajo = Math.min(z.bottom, window.innerHeight);
    if (r.height === 0 || r.top < arriba - 0.5 || r.bottom > abajo + 0.5) {
      fallos.push(
        `${que}: ocupa de ${Math.round(r.top)} a ${Math.round(r.bottom)} px y se ve de ${Math.round(arriba)} a ${Math.round(abajo)} (su columna mide ${Math.round(z.height)} px de alto)`,
      );
    }
  }
  return fallos;
}

/**
 * Que la muralla se pueda usar: su cabecera a la vista, las herramientas, cada casilla de la
 * rejilla alcanzable (traída a la vista si hace falta, como haría quien dibuja) y que un clic
 * en la última ponga un muro y otro lo quite, y que la última forma de ejemplo se cargue.
 * Lanza con lo que no se puede.
 */
async function murallaUsable(page: Page, paso: string): Promise<void> {
  const muros = (): Promise<number> => page.locator('#muralla .hex.muro').count();
  const ultima = page.locator('#muralla .hex').last();
  await ultima.scrollIntoViewIfNeeded();
  const antes = await muros();
  await ultima.click({ timeout: 3000 });
  if ((await muros()) !== antes + 1)
    throw new Error(`${paso}: un clic en la última casilla de la muralla no pone un muro`);
  await ultima.click({ timeout: 3000 });
  if ((await muros()) !== antes)
    throw new Error(`${paso}: otro clic en la última casilla de la muralla no lo quita`);
  await page
    .locator('#muralla [data-arena="herramienta-muralla"][data-herramienta="goma"]')
    .click();
  await page
    .locator('#muralla [data-arena="herramienta-muralla"][data-herramienta="muro"]')
    .click();
  const forma = page.locator('#muralla [data-arena="cargar-forma"]').last();
  await forma.click({ timeout: 3000 });
  if ((await muros()) === 0)
    throw new Error(`${paso}: cargar la última forma de ejemplo no pone ningún muro`);
  await page.locator('#muralla [data-arena="vaciar-muralla"]').click();
  if ((await muros()) !== 0) throw new Error(`${paso}: «Vaciar» no quita los muros`);
}

/**
 * El montaje de la arena a 1024×768, 1280×800, 1440×900 y 1920×1080, con el navegador limpio
 * (la muralla desplegada) y con la muralla plegada: los dos bandos y la ficha se ven, el clic
 * de verdad en el nombre de cada unidad abre su ficha y se lee, y la muralla desplegada se
 * puede usar. Junta todo lo que falla en un tamaño antes de lanzar, y deja la captura de cada
 * caso (`montaje-<ancho>x<alto>-<desplegada|plegada>`).
 */
export async function montajeAVariosAnchos(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const fallos: string[] = [];
  for (const [ancho, alto] of TAMAÑOS) {
    // Un contexto por tamaño: el plegado se recuerda en el navegador
    // (`arena.muralla.plegada`) y cada tamaño empieza desplegado, como lo de salida.
    const contexto = await browser.newContext({ viewport: { width: ancho, height: alto } });
    const page = await contexto.newPage();
    const nombre = `montaje-${ancho}x${alto}`;
    vigilarConsola(page, nombre, problemas);
    await abrirLaArena(page, url, '?seed=7');
    for (const [lado, ids] of Object.entries(BANDOS)) {
      for (const id of ids) {
        await page
          .locator(`#catalogo [data-arena="añadir"][data-lado="${lado}"][data-unidad="${id}"]`)
          .click();
      }
    }
    for (const estado of ['desplegada', 'plegada'] as const) {
      const paso = `${nombre}, muralla ${estado}`;
      if (estado === 'plegada') await page.locator('[data-arena="plegar-muralla"]').click();
      await asentada(page);
      // La muralla, antes de mirar los bandos: su prueba la desplaza y la deja como estaba.
      if (estado === 'desplegada') await murallaUsable(page, paso);
      await page.evaluate(() => {
        for (const id of ['bando-izquierda', 'bando-derecha', 'ficha', 'muralla']) {
          const el = document.getElementById(id);
          if (el !== null) el.scrollTop = 0;
        }
      });
      await asentada(page);
      const sinVer = await page.evaluate(loQueNoSeVe);
      await captura(page, `${paso.replace(', muralla ', '-')}`);
      fallos.push(...sinVer.map((f) => `${paso}: ${f}`));
      if (sinVer.length > 0) continue;
      // El clic de verdad en el nombre de cada unidad abre su ficha, y se lee.
      for (const ids of Object.values(BANDOS)) {
        for (const id of ids) {
          const nombreDeLaUnidad = unidad(id).name;
          try {
            await page
              .locator(`.puesto button.nombre[data-unidad="${id}"]`)
              .click({ timeout: 3000, noWaitAfter: true });
          } catch (err) {
            fallos.push(
              `${paso}: el clic en «${nombreDeLaUnidad}» no llega: ${err instanceof Error ? err.message.split('\n')[0] : err}`,
            );
            continue;
          }
          const titulo = (await page.locator('#ficha .titulo-de-ficha .nombre').innerText()).trim();
          if (titulo !== nombreDeLaUnidad) {
            fallos.push(
              `${paso}: el clic en «${nombreDeLaUnidad}» deja abierta la ficha de «${titulo}»`,
            );
            continue;
          }
          await asentada(page);
          const deLaFicha = (await page.evaluate(loQueNoSeVe)).filter((f) => f.includes('ficha'));
          fallos.push(...deLaFicha.map((f) => `${paso}, ficha de «${nombreDeLaUnidad}»: ${f}`));
        }
      }
    }
    log(`${nombre}: medido, desplegada y plegada`);
    await contexto.close();
  }
  if (fallos.length > 0)
    throw new Error(`montaje de la arena: no se ve o no se pulsa:\n  ${fallos.join('\n  ')}`);
}
