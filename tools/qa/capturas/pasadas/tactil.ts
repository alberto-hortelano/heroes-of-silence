/**
 * La pasada «tactil» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la partida en un móvil, con el dedo.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser } from 'playwright';
import { Session } from '../../../../src/client/sesion/partida.js';
import type { Point } from '../../../../src/core/types.js';
import { esperarElSuelo } from '../../../comun/navegador.js';
import { urlDePartida } from '../../navegador/url-de-partida.js';
import { destinoTactil } from '../escenas.js';
import {
  captura,
  comprobar,
  desplegarTalCual,
  esperarCola,
  esperarLaMarcha,
  log,
  type Problemas,
  vigilarConsola,
} from '../pagina.js';
import { cajaDeMovil, guardiaALaVista, salirDeLaBase, semillaDelMovil } from '../partida.js';
import { cerrarLaGuarnicion, Mapa, pixelesDelLienzo } from '../pixeles.js';

/**
 * La pasada con el dedo: un contexto táctil de verdad (`hasTouch`), donde un
 * toque manda `pointerdown`, `pointerup` y —siempre— `pointerleave`. Las otras
 * pasadas pulsan como ratón y por eso no vieron que la ruta del primer toque no
 * se pintaba nunca: el `pointerleave` la borraba.
 *
 * Comprueba en el lienzo que el primer toque dibuja la ruta (los píxeles de un
 * paso intermedio cambian) y que el segundo la anda; y en la batalla, que la
 * pista del borde dice dónde está el enemigo, que pulsarla lleva el marco allí
 * y que la barra de abajo no tapa los hechizos.
 */
export async function jugarTactil(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await contexto.newPage();
  vigilarConsola(page, 'táctil', problemas);
  const semilla = await semillaDelMovil(browser, url, problemas);
  const medida = await cajaDeMovil(browser, url, problemas);
  const espejo = new Session(semilla);
  await page.goto(`${url}${urlDePartida(semilla)}`, { waitUntil: 'networkidle' });
  await salirDeLaBase(page, 'táctil', 'toque');
  await esperarElSuelo(page, 'táctil', 60_000, log);
  await sleep(450);
  const mapa = new Mapa(page, espejo);

  // El destino más lejano que se alcance hoy y se vea entero en el lienzo, con
  // tres pasos o más: hace falta uno intermedio, lejos del héroe y del destino.
  // Explorado: un toque en la niebla no enseña ruta (`destinoTactil`).
  const { b, e } = await mapa.encuadre();
  if (
    b.x !== medida.x ||
    b.y !== medida.y ||
    b.width !== medida.width ||
    b.height !== medida.height
  ) {
    throw new Error(
      `táctil: la semilla se buscó con el lienzo del móvil en ${medida.width}×${medida.height} (${medida.x},${medida.y}) ` +
        `y el contexto táctil lo abre en ${b.width}×${b.height} (${b.x},${b.y})`,
    );
  }
  const destino = destinoTactil(b, e, espejo);
  if (destino === null) {
    throw new Error('táctil: no hay a la vista un destino de hoy a tres pasos o más');
  }
  // Los pasos intermedios, y de ellos el que más cambia. Uno solo —el del
  // medio— podía caer bajo un árbol o una peña que se pinta encima de la ruta:
  // con los bordes de #169 la semilla 19 lo tenía así, y la pasada daba rojo
  // con la ruta pintada. Lo que esto vigila es que el `pointerleave` del toque
  // no la borre, y entonces no cambia ninguno.
  // Lejos del héroe y del destino (Chebyshev ≥ 2): la figura que respira al
  // lado movería píxeles sin ruta ninguna.
  const ruta = espejo.previewPath(destino);
  const heroe = espejo.selectedHero?.at ?? destino;
  const lejos = (p: Point, q: Point) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) >= 2;
  const lejosDeLosDos = ruta.filter((paso) => lejos(paso.at, heroe) && lejos(paso.at, destino));
  const intermedios =
    lejosDeLosDos.length > 0
      ? lejosDeLosDos
      : [ruta[Math.floor((ruta.length - 1) / 2)] as (typeof ruta)[number]];
  const enLienzo = await Promise.all(intermedios.map((paso) => mapa.pixel(paso.at)));
  const antes = await Promise.all(
    enLienzo.map((p) => pixelesDelLienzo(page, p.x - b.x, p.y - b.y)),
  );
  const px = await mapa.pixel(destino);
  await page.touchscreen.tap(px.x, px.y);
  await sleep(300);
  const despues = await Promise.all(
    enLienzo.map((p) => pixelesDelLienzo(page, p.x - b.x, p.y - b.y)),
  );
  const cambios = antes.map((a, k) =>
    a.reduce((t, v, i) => t + Math.abs(v - (despues[k]?.[i] ?? 0)), 0),
  );
  const cambio = Math.max(0, ...cambios);
  const elQueMas = intermedios[cambios.indexOf(cambio)]?.at;
  const dice = await page.locator('#status').innerText();
  log(
    `táctil: primer toque → «${dice}»; de ${intermedios.length} pasos intermedios, el que más cambia ` +
      `(${elQueMas?.x},${elQueMas?.y}) cambia ${cambio}`,
  );
  if (!dice.includes('Toca otra vez')) throw new Error(`táctil: el primer toque dice «${dice}»`);
  if (cambio < 2000) {
    throw new Error(
      `táctil: tras el primer toque la ruta no se ha pintado (ningún paso intermedio cambia más de ${cambio})`,
    );
  }
  await captura(page, 'tactil-01-ruta-tras-el-primer-toque');
  await page.touchscreen.tap(px.x, px.y);
  espejo.clickTile(destino);
  await esperarLaMarcha(page);
  await sleep(300);
  await cerrarLaGuarnicion(page, espejo, 'táctil: segundo toque');
  await comprobar(page, espejo, 'táctil: segundo toque');
  log(
    `táctil: el segundo toque anda hasta (${espejo.selectedHero?.at.x},${espejo.selectedHero?.at.y})`,
  );

  // A la batalla de la semilla, desde el principio otra vez (el héroe ya ha
  // andado), con dos toques: el primero enseña, el segundo va.
  await page.goto(`${url}${urlDePartida(semilla)}`, { waitUntil: 'networkidle' });
  await salirDeLaBase(page, 'táctil, otra vez', 'toque');
  await sleep(450);
  const otra = new Session(semilla);
  const enOtra = new Mapa(page, otra);
  const monstruo = await guardiaALaVista(enOtra, otra);
  const enMonstruo = await enOtra.pixel(monstruo);
  await page.touchscreen.tap(enMonstruo.x, enMonstruo.y);
  await sleep(200);
  await page.touchscreen.tap(enMonstruo.x, enMonstruo.y);
  otra.clickTile(monstruo);
  if (otra.battle === null) {
    throw new Error(`táctil: el espejo no ha entrado en batalla: ${otra.status}`);
  }
  await esperarLaMarcha(page);
  await desplegarTalCual(page, otra, 'táctil');
  await esperarCola(otra.battle, otra.battle.log);
  await sleep(300);

  const pista = page.locator('#hacia-enemigo');
  if (!(await pista.isVisible()))
    throw new Error('táctil: al empezar la batalla no hay pista del enemigo');
  const texto = await pista.innerText();
  log(`táctil: pista del borde «${texto}»`);
  await captura(page, 'tactil-02-batalla-pista-del-enemigo');

  // La barra de abajo es una fila aparte: el escenario acaba donde empieza ella.
  const solape = await page.evaluate(() => {
    const escenario = document.getElementById('stage')?.getBoundingClientRect();
    const barra = document.getElementById('statusbar')?.getBoundingClientRect();
    return escenario === undefined || barra === undefined ? null : escenario.bottom - barra.top;
  });
  if (solape === null || solape > 1) {
    throw new Error(`táctil: la barra de abajo se monta ${solape} px sobre el escenario`);
  }
  // Buscar, desplazar y mirar en UNA evaluación: los paneles se rehacen cuando
  // cambia la batalla, y con un localizador el botón resuelto en un paso podía
  // ser otro nodo en el siguiente («Element is not attached to the DOM», dos
  // veces en `pnpm capturas`). Dentro de un `evaluate` no se rehace nada.
  const tapado = await page.evaluate(() => {
    const el = document.querySelector('[data-action="battle-spell"]');
    if (el === null) return 'no hay botón de hechizos';
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return encima === null || !el.contains(encima) ? (encima?.id ?? encima?.tagName ?? 'nada') : '';
  });
  if (tapado !== '') throw new Error(`táctil: el hechizo lo tapa «${tapado}»`);
  await captura(page, 'tactil-03-batalla-hechizos-a-la-vista');

  // Pulsar la pista lleva el marco hasta el enemigo.
  await pista.scrollIntoViewIfNeeded();
  const x0 = await page.evaluate(() => document.getElementById('lienzo')?.scrollLeft ?? 0);
  await pista.tap();
  await sleep(900);
  const x1 = await page.evaluate(() => document.getElementById('lienzo')?.scrollLeft ?? 0);
  log(`táctil: pulsar la pista desplaza el marco de ${x0} a ${x1}`);
  if (x1 <= x0) throw new Error('táctil: pulsar la pista no ha llevado el marco hacia el enemigo');
  if (await pista.isVisible()) {
    throw new Error(
      `táctil: con el marco en el enemigo la pista sigue diciendo «${await pista.innerText()}»`,
    );
  }
  await captura(page, 'tactil-04-batalla-marco-en-el-enemigo');
  await contexto.close();
}
