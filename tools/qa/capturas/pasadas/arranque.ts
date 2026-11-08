/**
 * La pasada «arranque» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): el menú de inicio, la facción y el héroe de salida ante el ayuntamiento, con el ratón y con el dedo.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import { EscenaAyuntamiento } from '../../../../src/client/partida/ayuntamiento/escena.js';
import { cajasDeLaMorada } from '../../../../src/client/partida/morada/escena.js';
import { Session } from '../../../../src/client/sesion/partida.js';
import {
  figuraDelHeroe,
  tipoDeHeroePorDefecto,
  tiposDeHeroe,
} from '../../../../src/core/hero/tipos-de-heroe.js';
import { parseSeed } from '../../../../src/core/rng.js';
import { baseOf } from '../../../../src/core/state/consultas.js';
import { faccionesDeLaSemilla } from '../../../../src/core/state/setup.js';
import { describirCoste } from '../../../../src/core/texto.js';
import { ECONOMIA } from '../../../../src/core/town/economia.js';
import { FACTION_IDS, type FactionId } from '../../../../src/core/types.js';
import { esperarElSuelo } from '../../../comun/navegador.js';
import { esperarLaBase, pulsarLaFigura } from '../base.js';
import {
  caja,
  captura,
  comprobar,
  densidadDe,
  exigir,
  log,
  type Problemas,
  vigilarConsola,
} from '../pagina.js';
import { estadoDelArranque, salirDeLaBase } from '../partida.js';

/**
 * En `pnpm dev` (y aquí se corre `vite` en modo desarrollo), «Empezar» lleva a «El
 * mundo» (`desarrollo/mundo.ts`, F1a del mapa vivo), que generaría uno con el motor
 * de narrativa: estas pasadas juegan el procedimental, por su botón, «Jugar sin
 * historia». La pantalla **se exige**: si «Empezar» fuera derecho a la partida, el
 * flujo de `pnpm dev` habría cambiado sin que nadie lo dijera, y aceptar las dos
 * lo callaba. Con `nombre`, se captura antes la pantalla.
 */
async function sinHistoria(page: Page, nombre: string | null, tocar = false): Promise<void> {
  await page
    .waitForSelector('[data-mundo="eleccion"]', { timeout: 30_000 })
    .catch((err: unknown) => {
      throw new Error(
        `arranque: «Empezar» en pnpm dev no lleva a «El mundo» (desarrollo/mundo.ts): ${err instanceof Error ? err.message : err}`,
      );
    });
  if (nombre !== null) await captura(page, nombre);
  const boton = page.locator('[data-mundo="sin-historia"]');
  if (tocar) {
    await boton.scrollIntoViewIfNeeded();
    const caja = await boton.boundingBox();
    if (caja === null) throw new Error('«Jugar sin historia» no se ve');
    await page.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2);
  } else await boton.click();
}

/**
 * Si la query `search` pide exactamente `esperado`, sin mirar el orden: el héroe
 * se escribe al elegirlo, detrás de la complejidad del combate, que va desde el
 * principio (fusión del héroe en la base con la complejidad, 22-10-2026).
 */
function mismaQuery(search: string, esperado: Readonly<Record<string, string>>): boolean {
  const q = new URLSearchParams(search);
  const claves = [...new Set(q.keys())];
  return (
    claves.length === Object.keys(esperado).length &&
    Object.entries(esperado).every(([k, v]) => q.getAll(k).length === 1 && q.get(k) === v)
  );
}

/**
 * La pantalla de inicio (19-10-2026): `/` sin nada pide qué jugar y no monta la
 * partida hasta elegir (ni escena ni suelo); «Cargar partida» no hace nada, ni
 * con el teclado; «Nuevo juego» lleva a la elección, que viste la página con la
 * facción marcada (el clic o las flechas; pasar el ratón o el foco, no) y vuelve
 * al neutro con Escape; «Empezar» escribe `?seed=N&faccion=<id>` y abre la base de
 * esa facción ante el ayuntamiento (22-10-2026), con un candidato a héroe por tipo
 * y el oro entero; pulsar uno en el lienzo cambia la ficha (su retrato, su precio);
 * recargar a media elección vuelve a preguntar igual; «Contratar» lo cobra, vuelve
 * a la base con él dentro, pintado con la hoja de su tipo (no el Y Bot), y deja
 * `&heroe=<tipo>` en la URL; al salir, el mapa con el tema; recargar entra sin menú
 * y sin elegir en la misma partida. Y la rápida (con su héroe por defecto en la
 * URL), una facción que no existe y un héroe que no es de la facción.
 */
export async function arranque(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  // Las tres páginas de la pasada en un contexto: lo que cambia entre ellas es la
  // URL, no el navegador.
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contexto.newPage();
  vigilarConsola(page, 'arranque', problemas);
  await page.goto(`${url}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#inicio:not([hidden]) [data-inicio="nuevo"]');
  await sleep(300);
  exigir(
    await estadoDelArranque(page),
    (e) =>
      e.menu &&
      !e.app &&
      e.escenario === null &&
      e.tema === null &&
      e.search === '' &&
      e.foco === 'nuevo',
    'en «/» tiene que verse solo el menú, sin partida montada, sin tema, sin nada en la URL y con el foco en «Nuevo juego»',
  );
  await captura(page, 'inicio-01-menu');

  // «Cargar partida»: el teclado llega, Intro y el clic no hacen nada.
  await page.keyboard.press('Tab');
  exigir(await estadoDelArranque(page), (e) => e.foco === 'cargar', 'Tab lleva a «Cargar partida»');
  await page.keyboard.press('Enter');
  // Playwright no pulsa lo que lleva `aria-disabled`: se le obliga, como el ratón.
  await page.locator('[data-inicio="cargar"]').click({ force: true });
  await sleep(300);
  exigir(
    await estadoDelArranque(page),
    (e) => e.menu && e.search === '' && e.foco === 'cargar',
    '«Cargar partida» no hace nada',
  );
  const motivo = await page.locator('#sin-partidas').innerText();
  if (!/no hay partidas guardadas/i.test(motivo))
    throw new Error(`arranque: «Cargar partida» no dice por qué: «${motivo}»`);

  // «Nuevo juego», con el teclado: la elección, con la marcada vestida; Escape
  // vuelve al neutro.
  await page.mouse.move(5, 5);
  await page.locator('[data-inicio="nuevo"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-inicio="eleccion"]');
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0] && e.foco === `faccion:${FACTION_IDS[0]}`,
    `la elección empieza con ${FACTION_IDS[0]} marcada, enfocada y vestida`,
  );
  const opciones = await page.locator('.opcion-de-faccion').count();
  if (opciones !== FACTION_IDS.length)
    throw new Error(`arranque: la elección trae ${opciones} facciones y son ${FACTION_IDS.length}`);
  await captura(page, 'inicio-02-eleccion');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-inicio="nuevo"]');
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === null,
    'Escape vuelve al menú y al neutro',
  );
  // Pasar el ratón o el foco por una facción no la viste (20-10-2026: «que no
  // cambie de tema en hover sino en click»); marcarla con el clic, sí.
  await page.locator('[data-inicio="nuevo"]').click();
  await page.waitForSelector('[data-inicio="eleccion"]');
  await page.locator('[data-faccion="elfos"]').hover();
  await sleep(200);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0],
    `pasar el ratón por los elfos no los viste: sigue ${FACTION_IDS[0]}, la marcada`,
  );
  await page.locator('[data-faccion="orkos"] input').focus();
  await sleep(200);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0],
    `el foco en los orkos no los viste: sigue ${FACTION_IDS[0]}, la marcada`,
  );
  await page.locator('[data-faccion="orkos"]').click();
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === 'orkos',
    'el clic en los orkos los viste',
  );
  await page.locator('[data-faccion="imperio"]').hover();
  await sleep(200);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === 'orkos',
    'marcados los orkos, pasar por el imperio no lo viste',
  );
  await page.locator('[data-faccion="orkos"] input').focus();
  await page.keyboard.press('ArrowDown');
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema !== 'orkos' && e.tema !== null,
    'las flechas marcan la siguiente y la visten',
  );
  await page.locator('[data-faccion="orkos"]').click();
  await captura(page, 'inicio-02b-eleccion-orkos');

  // «Empezar»: la URL dice semilla y facción, sin héroe, y la partida abre en la
  // base de los orkos, ante el ayuntamiento, con un candidato por tipo, el de por
  // defecto elegido y el oro entero (22-10-2026: el héroe se elige y se paga en la
  // base). Lo que pide la página se apunta desde aquí: la hoja del tipo elegido
  // tiene que llegar, y el Y Bot de espada y escudo (el de `HERO_BODY`, con que se
  // pintaba el héroe) no.
  const TIPO = 'chaman_goblin';
  const tiposOrkos = tiposDeHeroe('orkos');
  const hojaDelTipo = figuraDelHeroe({ faction: 'orkos', tipo: TIPO });
  const pedidas: string[] = [];
  page.on('request', (r) => pedidas.push(new URL(r.url()).pathname));
  await page.locator('[data-inicio="empezar"]').click();
  await sinHistoria(page, 'inicio-02d-el-mundo');
  await page.waitForSelector('#app[data-escena="ayuntamiento"]', { timeout: 30_000 });
  const pedida = new URL(page.url()).searchParams;
  const semilla = parseSeed(pedida.get('seed'));
  if (semilla === null || pedida.get('faccion') !== 'orkos' || pedida.has('heroe'))
    throw new Error(
      `arranque: «Empezar» no deja en la URL la semilla y la facción sin héroe: ${page.url()}`,
    );
  exigir(
    await estadoDelArranque(page),
    (e) => !e.menu && e.app && e.tema === 'orkos',
    'la partida, con el tema de los orkos y sin menú',
  );
  let espejo = new Session(semilla, 'orkos', null);
  espejo.abrirSuBase();
  if (espejo.scene !== 'ayuntamiento')
    throw new Error(`arranque: el espejo abre en «${espejo.scene}» y no ante el ayuntamiento`);
  await esperarElElegidoDelAyuntamiento(page, espejo, 'arranque: abrir la partida');
  await comprobar(page, espejo, 'arranque: ante el ayuntamiento, sin pagar aún');
  const candidatos = await page.locator('#side [data-action="ayuntamiento-elegir"]').count();
  if (candidatos !== tiposOrkos.length)
    throw new Error(
      `arranque: el ayuntamiento de los orkos ofrece ${candidatos} héroes y son ${tiposOrkos.length}`,
    );
  const ficha = (await page.locator('#side .ficha-del-ayuntamiento').innerText()).replace(
    /\s+/g,
    ' ',
  );
  if (!ficha.includes(describirCoste(ECONOMIA.precioDelHeroe)))
    throw new Error(`arranque: la ficha del candidato no dice su precio: «${ficha}»`);
  await captura(page, 'inicio-03-ayuntamiento-orkos');

  // El chamán, pulsado en el lienzo: su ficha y su retrato, el de su hoja.
  await pulsarEnElAyuntamiento(page, espejo, TIPO, 'arranque');
  const retrato = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>(
      '.ficha-del-ayuntamiento .retrato-de-heroe',
    );
    await img?.decode().catch(() => undefined);
    return img === null ? null : { src: new URL(img.src).pathname, ancho: img.naturalWidth };
  });
  if (retrato?.src !== `/unidades/${hojaDelTipo}/identidad.webp` || retrato.ancho === 0)
    throw new Error(
      `arranque: el retrato del ${TIPO} no es el de su hoja, o no carga: ${JSON.stringify(retrato)}`,
    );
  await captura(page, 'inicio-03b-ayuntamiento-chaman');

  // Recargar a media elección vuelve a preguntar, igual: la misma URL, el mismo
  // oro y el de por defecto elegido otra vez.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app[data-escena="ayuntamiento"]', { timeout: 30_000 });
  espejo = new Session(semilla, 'orkos', null);
  espejo.abrirSuBase();
  await esperarElElegidoDelAyuntamiento(page, espejo, 'arranque: recargar a media elección');
  await comprobar(page, espejo, 'arranque: recargar a media elección');
  exigir(
    await estadoDelArranque(page),
    (e) => mismaQuery(e.search, { seed: `${semilla}`, faccion: 'orkos', tropa: '7', rueda: '7' }),
    'recargar a media elección no escribe ningún héroe en la URL',
  );
  await pulsarEnElAyuntamiento(page, espejo, TIPO, 'arranque, tras recargar');

  // «Contratar»: cobra, vuelve a la base con él dentro y la URL lo lleva.
  await page.locator(`#side [data-action="hire-hero"][data-tipo="${TIPO}"]`).click();
  espejo.hireHero(TIPO);
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 10_000 });
  await comprobar(page, espejo, 'arranque: contratar al chamán');
  exigir(
    await estadoDelArranque(page),
    (e) =>
      mismaQuery(e.search, {
        seed: `${semilla}`,
        faccion: 'orkos',
        heroe: TIPO,
        tropa: '7',
        rueda: '7',
      }),
    'elegido el héroe, la URL lo lleva',
  );
  const heroe = espejo.myHeroes()[0];
  if (heroe === undefined || espejo.jugador.faction !== 'orkos' || heroe.tipo !== TIPO)
    throw new Error(`arranque: el espejo no juega con los orkos y un ${TIPO}`);
  const suBase = baseOf(espejo.state, espejo.jugador.id);
  if (heroe.at.x !== suBase?.at.x || heroe.at.y !== suBase.at.y)
    throw new Error('arranque: el héroe del espejo no está dentro de su base');
  // Quien camina por la base es él (lo pinta el lienzo: se lee del espejo).
  const caminante = espejo.vistaDeLaBase()?.caminante;
  if (caminante?.id !== heroe.id || caminante.cuerpo !== hojaDelTipo)
    throw new Error(
      `arranque: por la base camina ${caminante?.id} con ${caminante?.cuerpo}, y no ${heroe.id} con ${hojaDelTipo}`,
    );
  await esperarLaBase(page, 'quieto');
  const delTipo = new RegExp(`^/unidades/${hojaDelTipo}/d[0-7]/atlas\\.webp$`);
  // La hoja se pide detrás del arte de la base (tramos y recortes): se le da tiempo.
  for (let t = 0; t < 40 && !pedidas.some((p) => delTipo.test(p)); t++) await sleep(200);
  if (!pedidas.some((p) => delTipo.test(p)))
    throw new Error(
      `arranque: la base no pidió ninguna dirección de ${hojaDelTipo}: el héroe no se pinta con su hoja`,
    );
  // Con tema, las barras de sección son de una línea y lo que no cabe sale con
  // «…»: «Tropa de Grommash Dientenegro» no cabía (QA del arranque, H3).
  const cortados = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#side h3')]
      .filter((h) => h.scrollWidth > h.clientWidth)
      .map((h) => h.textContent?.trim() ?? ''),
  );
  if (cortados.length > 0)
    throw new Error(`arranque: en el panel de la base salen cortados «${cortados.join('», «')}»`);
  await captura(page, 'inicio-04-base-orkos');
  log(`arranque: semilla ${semilla}, orkos, ${heroe.name} elegido ante el ayuntamiento y pagado`);
  espejo.closeTown();

  // Salir de la base con Escape: el mapa, con el tema, y la partida es la del espejo.
  await salirDeLaBase(page, 'arranque', 'escape');
  await esperarElSuelo(page, 'arranque', 60_000, log);
  await comprobar(page, espejo, 'arranque: al salir de la base');
  exigir(await estadoDelArranque(page), (e) => e.tema === 'orkos', 'el mapa sigue con su tema');
  await sleep(450);
  // Ni en la base ni en el mapa se pinta nadie con el Y Bot de espada y escudo, el
  // de `HERO_BODY`: es lo que tenía el héroe («la imagen es el y_bot»).
  const ybot = pedidas.filter((p) => p.startsWith('/unidades/_poses/espada-escudo-8d/'));
  if (ybot.length > 0)
    throw new Error(`arranque: la base o el mapa pintan el Y Bot del héroe: ${ybot.join(', ')}`);
  await captura(page, 'inicio-05-mapa-orkos');
  log(`arranque: el ${TIPO} se pinta con ${hojaDelTipo} en la base y el mapa, sin el Y Bot`);

  // La URL reproduce la partida: recargar entra sin menú, en su base, con la misma semilla.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
  exigir(
    await estadoDelArranque(page),
    (e) =>
      // Con la complejidad del combate (22-10-2026), «Nuevo juego» escribe también
      // el tope y la rueda: los de siempre si no se tocan.
      !e.menu &&
      e.tema === 'orkos' &&
      mismaQuery(e.search, {
        seed: `${semilla}`,
        faccion: 'orkos',
        heroe: TIPO,
        tropa: '7',
        rueda: '7',
      }),
    'recargar entra sin menú en la misma partida',
  );
  const rotulo = (await page.locator('#seed').innerText()).trim();
  if (rotulo !== `semilla ${semilla}`)
    throw new Error(`arranque: tras recargar la barra dice «${rotulo}»`);
  // El suelo del mapa se pinta mientras se está en la base (`calentarElMapa`):
  // al salir ya está, sin el rato de sucedáneo y esbozo.
  await esperarElSuelo(page, 'arranque, sin salir de la base', 60_000, log);
  exigir(
    await estadoDelArranque(page),
    (e) => e.escena === 'town',
    'el suelo del mapa se pinta sin salir de la base',
  );
  await salirDeLaBase(page, 'arranque, tras recargar');
  exigir(
    await estadoDelArranque(page),
    (e) => e.escenario === 'pintado',
    'al salir de la base, el suelo ya está pintado',
  );
  await page.close();

  // «Partida rápida»: semilla al azar y la facción que saque, sin elegir; también en la base.
  const rapida = await contexto.newPage();
  vigilarConsola(rapida, 'arranque, partida rápida', problemas);
  await rapida.goto(`${url}/`, { waitUntil: 'networkidle' });
  await rapida.locator('[data-inicio="rapida"]').click();
  await rapida.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
  const deLaRapida = new URL(rapida.url()).searchParams;
  const sRapida = parseSeed(deLaRapida.get('seed'));
  if (sRapida === null) throw new Error(`arranque: la rápida no deja semilla: ${rapida.url()}`);
  const suya: FactionId = faccionesDeLaSemilla(sRapida)[0];
  exigir(
    await estadoDelArranque(rapida),
    (e) =>
      e.tema === suya &&
      deLaRapida.get('faccion') === suya &&
      deLaRapida.get('heroe') === tipoDeHeroePorDefecto(suya),
    `la rápida juega con la de la semilla ${sRapida} (${suya}) y su héroe por defecto, y lo deja en la URL`,
  );
  await captura(rapida, 'inicio-06-partida-rapida');
  log(`arranque: partida rápida, semilla ${sRapida} con ${suya}`);
  await rapida.close();

  // Una facción que no existe no se juega: la página dice por qué y cómo salir.
  // Sin vigilar la consola: el error es lo que se prueba.
  const mala = await contexto.newPage();
  await mala.goto(`${url}/?faccion=xyz`, { waitUntil: 'networkidle' });
  await mala.waitForSelector('#no-arranca', { timeout: 15_000 });
  const dicho = (await mala.locator('#no-arranca').innerText()).replace(/\s+/g, ' ');
  if (!/"xyz" no es una facción/.test(dicho) || !/quita "\?faccion=…"/.test(dicho))
    throw new Error(`arranque: ?faccion=xyz no dice por qué ni cómo salir: «${dicho}»`);
  log('arranque: ?faccion=xyz se rechaza diciéndolo');
  // Un héroe que no es de la facción, igual.
  await mala.goto(`${url}/?seed=7&faccion=templarios&heroe=lich`, { waitUntil: 'networkidle' });
  await mala.waitForSelector('#no-arranca', { timeout: 15_000 });
  const dichoDelHeroe = (await mala.locator('#no-arranca').innerText()).replace(/\s+/g, ' ');
  if (
    !/"lich" no es un tipo de héroe de templarios/.test(dichoDelHeroe) ||
    !/quita "\?heroe=…"/.test(dichoDelHeroe)
  )
    throw new Error(
      `arranque: ?heroe=lich con los templarios no dice por qué ni cómo salir: «${dichoDelHeroe}»`,
    );
  log('arranque: ?heroe=lich con los templarios se rechaza diciéndolo');
  await contexto.close();
  await eleccionConElDedo(browser, url, problemas);
}

/**
 * La elección en un teléfono pequeño (375×667), con el dedo: no cabe, así que
 * hay que bajar hasta «Empezar» deslizando, con toques de verdad por CDP. El
 * `tap()` de Playwright no vale para esto: desplaza la página por programa hasta
 * el botón, y así escondía que no había forma de llegar (QA, H1). Deslizar no
 * viste ninguna facción: el dedo no tiene vista previa. Luego el héroe, ante el
 * ayuntamiento (22-10-2026), con el dedo también: tocar una figura del lienzo trae
 * su ficha con «Contratar» a la vista (QA H2); se vuelve arriba deslizando sobre el
 * panel, se baja hasta el botón del último candidato, se toca, y su «Contratar»
 * llega solo.
 */
async function eleccionConElDedo(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const contexto = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await contexto.newPage();
  vigilarConsola(page, 'arranque, con el dedo', problemas);
  await page.goto(`${url}/`, { waitUntil: 'networkidle' });
  const centro = async (selector: string): Promise<{ x: number; y: number }> => {
    const b = await page.locator(selector).boundingBox();
    if (b === null) throw new Error(`arranque, con el dedo: no se ve ${selector}`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const abajo = (selector: string): Promise<{ readonly bajo: number; readonly alto: number }> =>
    page.evaluate(
      (sel) => ({
        bajo: (document.querySelector(sel) as HTMLElement).getBoundingClientRect().bottom,
        alto: innerHeight,
      }),
      selector,
    );
  const cdp = await contexto.newCDPSession(page);
  /**
   * Dónde se puede apoyar el dedo para desplazar lo que contiene a `selector`: la
   * franja de abajo arriba que se ve de lo que se desplaza (su primer antepasado
   * con `overflow-y` que desplaza, o la página), sin el lienzo (`touch-action:
   * none`) ni lo que tiene encima. En la partida es `#stage`, entre el lienzo y la
   * barra de abajo: con una «y» fija el dedo caía en `#statusbar`, que no desplaza
   * nada (QA H1, 22-10-2026).
   */
  const franjaPara = (
    selector: string,
  ): Promise<{ readonly x: number; readonly arriba: number; readonly abajo: number } | null> =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      let quien = el.parentElement;
      while (
        quien !== null &&
        !(
          /(auto|scroll)/.test(getComputedStyle(quien).overflowY) &&
          quien.scrollHeight > quien.clientHeight
        )
      )
        quien = quien.parentElement;
      const r = quien?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
      const x = Math.round(innerWidth / 2);
      // Sin funciones con nombre aquí dentro: tsx les pone `__name`, que en la
      // página no existe.
      let abajo: number | null = null;
      let arriba = 0;
      const tope = Math.ceil(Math.max(r.top, 0));
      for (let y = Math.floor(Math.min(r.bottom, innerHeight)) - 2; y > tope; y -= 2) {
        const bajo = document.elementFromPoint(x, y);
        const vale =
          bajo !== null &&
          (quien === null || quien.contains(bajo)) &&
          bajo.closest('canvas') === null &&
          getComputedStyle(bajo).touchAction !== 'none';
        if (vale) {
          abajo ??= y;
          arriba = y;
        } else if (abajo !== null) break;
      }
      return abajo === null ? null : { x, arriba, abajo };
    }, selector);
  /** Un dedo de `y0` a `y1` en `x`, a toques de CDP. */
  const deslizar = async (x: number, y0: number, y1: number): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: y0 }],
    });
    const paso = y1 < y0 ? -20 : 20;
    for (let y = y0 + paso; paso < 0 ? y >= y1 : y <= y1; y += paso) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y }],
      });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
  };
  /** Desliza hacia arriba, como un dedo, hasta que `selector` se vea entero. */
  const bajarHasta = async (selector: string): Promise<void> => {
    for (let vez = 0; vez < 4; vez++) {
      const { bajo, alto } = await abajo(selector);
      if (bajo <= alto) return;
      const f = await franjaPara(selector);
      if (f === null)
        throw new Error(
          `arranque, con el dedo: a 375×667 no hay dónde apoyar el dedo para bajar hasta ${selector}`,
        );
      await deslizar(f.x, f.abajo, Math.max(5, f.abajo - 380));
    }
    const despues = await abajo(selector);
    if (despues.bajo > despues.alto)
      throw new Error(
        `arranque, con el dedo: a 375×667 no se llega a ${selector} deslizando: sigue en ${Math.round(despues.bajo)} de ${despues.alto}`,
      );
  };
  /** Desliza hacia abajo, como un dedo, hasta que `#stage` vuelva arriba (el lienzo entero). */
  const volverArriba = async (): Promise<void> => {
    const arriba = () => page.evaluate(() => document.getElementById('stage')!.scrollTop);
    // Con el lienzo bajando a la vista, la franja del panel se estrecha y cada
    // pasada sube menos: hasta diez.
    for (let vez = 0; vez < 10 && (await arriba()) > 0; vez++) {
      const f = await franjaPara('#side');
      if (f === null)
        throw new Error('arranque, con el dedo: a 375×667 no hay dónde apoyar el dedo para subir');
      await deslizar(f.x, f.arriba, 660);
    }
    const queda = await arriba();
    if (queda > 0)
      throw new Error(`arranque, con el dedo: deslizando no se vuelve arriba (#stage en ${queda})`);
  };
  const nuevo = await centro('[data-inicio="nuevo"]');
  await page.touchscreen.tap(nuevo.x, nuevo.y);
  await page.waitForSelector('[data-inicio="eleccion"]');
  await sleep(300);
  const EMPEZAR = '[data-inicio="empezar"]';
  const antes = await abajo(EMPEZAR);
  if (antes.bajo <= antes.alto)
    throw new Error(
      `arranque, con el dedo: a 375×667 «Empezar» ya se ve sin bajar (${Math.round(antes.bajo)} de ${antes.alto}): así no se prueba que se llegue deslizando`,
    );
  await bajarHasta(EMPEZAR);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0],
    `deslizar no viste ninguna facción: sigue la de ${FACTION_IDS[0]}, la marcada`,
  );
  await captura(page, 'inicio-07-eleccion-movil');
  const empezar = await centro(EMPEZAR);
  await page.touchscreen.tap(empezar.x, empezar.y);
  await sinHistoria(page, null, true);
  await page.waitForSelector('#app[data-escena="ayuntamiento"]', { timeout: 30_000 });
  await sleep(300);
  // Tocar una figura del lienzo trae su ficha con «Contratar» a la vista, sin
  // deslizar (QA H2, 22-10-2026: el panel asoma una franja bajo el lienzo y no
  // se veía pasar nada).
  const semilla = parseSeed(new URL(page.url()).searchParams.get('seed'));
  if (semilla === null)
    throw new Error(`arranque, con el dedo: «Empezar» no deja semilla: ${page.url()}`);
  const espejo = new Session(semilla, FACTION_IDS[0], null);
  espejo.abrirSuBase();
  const tipos = tiposDeHeroe(FACTION_IDS[0]).map((t) => t.id);
  const contratarA = (tipo: string) => `#side [data-action="hire-hero"][data-tipo="${tipo}"]`;
  const seVe = async (selector: string): Promise<boolean> => {
    const { bajo, alto } = await abajo(selector);
    return bajo <= alto;
  };
  if (await seVe(contratarA(tipos[0]!)))
    throw new Error(
      'arranque, con el dedo: a 375×667 «Contratar» ya se ve al entrar: así no se prueba que tocar una figura lo traiga',
    );
  await pulsarEnElAyuntamiento(page, espejo, tipos[1]!, 'arranque, con el dedo', true);
  for (let vez = 0; vez < 20 && !(await seVe(contratarA(tipos[1]!))); vez++) await sleep(100);
  if (!(await seVe(contratarA(tipos[1]!))))
    throw new Error(
      `arranque, con el dedo: tocar la figura de ${tipos[1]} en el lienzo no trae su «Contratar» a la vista`,
    );
  await captura(page, 'inicio-08-ayuntamiento-movil-toque');
  // De vuelta arriba deslizando sobre el panel, y el último candidato, tocado en
  // el panel: hay que bajar hasta él, y su ficha llega sola.
  await volverArriba();
  const ultimo = tipos.at(-1)!;
  const DEL_ULTIMO = `#side [data-action="ayuntamiento-elegir"][data-tipo="${ultimo}"]`;
  await bajarHasta(DEL_ULTIMO);
  const elUltimo = await centro(DEL_ULTIMO);
  await page.touchscreen.tap(elUltimo.x, elUltimo.y);
  await page.waitForSelector(`#canvas[data-ayuntamiento="${ultimo}"]`, { timeout: 8000 });
  const CONTRATAR = contratarA(ultimo);
  for (let vez = 0; vez < 20 && !(await seVe(CONTRATAR)); vez++) await sleep(100);
  if (!(await seVe(CONTRATAR)))
    throw new Error(
      `arranque, con el dedo: tocar el botón de ${ultimo} no trae su «Contratar» a la vista`,
    );
  await captura(page, 'inicio-09-ayuntamiento-movil');
  const contratar = await centro(CONTRATAR);
  await page.touchscreen.tap(contratar.x, contratar.y);
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 10_000 });
  exigir(
    await estadoDelArranque(page),
    (e) => {
      const q = new URLSearchParams(e.search);
      return (
        e.tema === FACTION_IDS[0] &&
        q.get('faccion') === FACTION_IDS[0] &&
        q.get('heroe') === ultimo
      );
    },
    `«Contratar», tocado tras deslizar, deja la base de ${FACTION_IDS[0]} con un ${ultimo}`,
  );
  log(
    `arranque: con el dedo, a 375×667 se baja hasta «Empezar», tocar una figura trae su «Contratar», se sube y se baja por el panel y abre la base con un ${ultimo}`,
  );
  await contexto.close();
}
// ------------------------------------------------------------------ el ayuntamiento en escena

/**
 * Espera a que el lienzo diga que el elegido del ayuntamiento es el del espejo
 * (`canvas[data-ayuntamiento]`, su tipo), y su ficha en el panel.
 */
async function esperarElElegidoDelAyuntamiento(
  page: Page,
  espejo: Session,
  paso: string,
): Promise<void> {
  const vista = espejo.vistaDelAyuntamiento();
  if (vista === null) throw new Error(`${paso}: el espejo no está ante el ayuntamiento`);
  const marca = vista.figuras[vista.elegida]!.id;
  await page
    .waitForSelector(`#canvas[data-ayuntamiento="${marca}"]`, { timeout: 8000 })
    .catch(async () => {
      const tiene = await page.locator('#canvas').getAttribute('data-ayuntamiento');
      throw new Error(`${paso}: la página está en «${tiene}» y el espejo en «${marca}»`);
    });
  const tipo = (
    await page.locator('#side .ficha-del-ayuntamiento .tipo-de-heroe').innerText()
  ).trim();
  if (tipo.toUpperCase() !== vista.ficha.nombreDelTipo.toUpperCase()) {
    throw new Error(
      `${paso}: la ficha de la página es de «${tipo}» y la del espejo de «${vista.ficha.nombreDelTipo}»`,
    );
  }
}

/**
 * Pulsa en el lienzo la figura del tipo `tipo` y la elige en el espejo con
 * la misma escena que lee el clic en la página (`EscenaAyuntamiento`), en el píxel
 * pulsado. En Node no pinta: su fondo, la base, no hace falta para encuadrar.
 */
async function pulsarEnElAyuntamiento(
  page: Page,
  espejo: Session,
  tipo: string,
  quien: string,
  toque = false,
): Promise<void> {
  const vista = espejo.vistaDelAyuntamiento();
  if (vista === null) throw new Error(`${quien}: el espejo no está ante el ayuntamiento`);
  const b = await caja(page);
  const escena = new EscenaAyuntamiento(
    () => espejo,
    () => null,
  );
  escena.encuadrar(b.width, b.height, await densidadDe(page));
  const i = vista.figuras.findIndex((f) => f.id === tipo);
  if (i < 0) throw new Error(`${quien}: ${tipo} no se contrata en ${vista.nombre}`);
  const e = escena.encuadre(vista);
  const p = await pulsarLaFigura(page, b, cajasDeLaMorada(e.camara)(e.en[i]!), toque);
  escena.pulsar(p.x, p.y);
  const ahora = espejo.vistaDelAyuntamiento()!;
  if (ahora.figuras[ahora.elegida]!.id !== tipo) {
    throw new Error(`${quien}: pulsar la figura de ${tipo} no la elige en el espejo`);
  }
  await esperarElElegidoDelAyuntamiento(page, espejo, `${quien}: pulsar la figura de ${tipo}`);
}
