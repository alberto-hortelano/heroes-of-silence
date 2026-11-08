/**
 * La pasada «rueda-contrincantes» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): los contrincantes de la rueda, en escritorio y en el móvil.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import {
  anguloDe as anguloEnLaRueda,
  medidasDeLaRueda,
} from '../../../../src/client/batalla/rueda/disco.js';
import { sitioEnLaRueda as sitioEnLaRuedaDe } from '../../../../src/client/batalla/rueda/rueda.js';
import { COLOR_BANDO } from '../../../../src/client/render/batalla/bandos.js';
import { ARO_DE_LA_RUEDA, cajaDeFigura } from '../../../../src/client/render/batalla/figura.js';
import { centroDeStack, tableroPara } from '../../../../src/client/render/proyeccion.js';
import { isAlive, stackHexes } from '../../../../src/core/battle/consultas.js';
import { nombreEnLaRueda } from '../../../../src/core/battle/formas-de-la-rueda.js';
import type { BattleStack } from '../../../../src/core/battle/types.js';
import type { TipoDeGolpe } from '../../../../src/core/types.js';
import { conLosCatalogosDevueltos, mismaPelea } from '../arena.js';
import {
  caja,
  captura,
  esperarCola,
  log,
  type Problemas,
  RUEDA,
  teclaDe,
  vigilarConsola,
} from '../pagina.js';
import { hastaLaRuedaYoContraYo, rellenoDelSector, TIPOS_DE_GOLPE } from '../rueda.js';

const MEDIDAS_DE_LA_RUEDA = medidasDeLaRueda(RUEDA);
const anguloDe = (t: TipoDeGolpe): number => anguloEnLaRueda(t, RUEDA);
const sitioEnLaRueda = (t: TipoDeGolpe) => sitioEnLaRuedaDe(t, RUEDA);
// ------------------------------------------- la rueda: sectores y contrincantes

/**
 * Lo que da `elementFromPoint` en el plano de la rueda, a `r` y `grados` (las
 * medidas de `MEDIDAS_DE_LA_RUEDA`): el `data-golpe` del botón que recibe ese
 * punto, o `null` si no es de ninguno.
 */
async function golpeEnElPunto(page: Page, r: number, grados: number): Promise<string | null> {
  const plato = await page.locator('#rueda .plato').boundingBox();
  if (plato === null) throw new Error('rueda: el plato no se ve');
  const k = plato.width / MEDIDAS_DE_LA_RUEDA.lado;
  const a = (grados * Math.PI) / 180;
  const x = plato.x + plato.width / 2 + r * k * Math.cos(a);
  const y = plato.y + plato.height / 2 + r * k * Math.sin(a);
  return await page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px as number, py as number)
        ?.closest('[data-golpe]')
        ?.getAttribute('data-golpe') ?? null,
    [x, y],
  );
}

/**
 * #258: toda la corona de cada sector responde, y solo ella. En los siete, el
 * borde de fuera (r 97) y los dos picos de fuera y de dentro (a 1,5° de la
 * junta) dan su sector, y Normal a r 39; fuera de la corona (r 103), en la junta
 * entre dos y en el hueco entre la corona y Normal (r 43), ninguno.
 */
async function sectoresEnteros(page: Page, quien: string, conRaton: boolean): Promise<string> {
  const m = MEDIDAS_DE_LA_RUEDA;
  const fallos: string[] = [];
  let medidos = 0;
  const debe = async (r: number, g: number, esperado: string | null, donde: string) => {
    medidos++;
    const visto = await golpeEnElPunto(page, r, g);
    if (visto !== esperado) fallos.push(`${donde}: ${String(visto)} (debía ${String(esperado)})`);
  };
  for (const t of TIPOS_DE_GOLPE) {
    // El «ⓘ» del sector (R1 de QA de #258): con ratón no es un hueco, el clic va
    // a su sector; tocando, es la nota, y tocarlo la abre.
    const { nota: n } = sitioEnLaRueda(t);
    await debe(
      Math.hypot(n.x, n.y),
      (Math.atan2(n.y, n.x) * 180) / Math.PI,
      conRaton ? t : null,
      `${t}, sobre su «ⓘ»`,
    );
    if (t === 'normal') {
      for (const g of [0, 90, 180, 270]) {
        await debe(m.radioDelCentro - 2, g, 'normal', `Normal a r ${m.radioDelCentro - 2}, ${g}°`);
        await debe(m.dentro - 2, g, null, `entre Normal y la corona, ${g}°`);
      }
      continue;
    }
    const c = anguloDe(t);
    const pico = m.medioSector - 1.5;
    await debe(m.fuera - 3, c, t, `${t}, borde de fuera`);
    for (const lado of [-1, 1]) {
      await debe(
        m.fuera - 3,
        c + lado * pico,
        t,
        `${t}, pico de fuera ${lado < 0 ? 'izquierdo' : 'derecho'}`,
      );
      await debe(
        m.dentro + 3,
        c + lado * pico,
        t,
        `${t}, pico de dentro ${lado < 0 ? 'izquierdo' : 'derecho'}`,
      );
    }
    await debe(m.fuera + 3, c, null, `${t}, fuera de la corona`);
    await debe((m.dentro + m.fuera) / 2, c + 30, null, `junta tras ${t}`);
  }
  if (fallos.length > 0) {
    throw new Error(`${quien}: la rueda no responde donde se ve: ${fallos.join('; ')}`);
  }
  return `${medidos} puntos de la rueda dan el sector que se ve`;
}

/**
 * Cuántos de 18 puntos de la mitad de delante (la que no tapa la figura) del aro
 * de la rueda alrededor de los pies de `s` (`ARO_DE_LA_RUEDA` veces el de su
 * bando) son del color de su bando.
 */
async function aroDeLaRueda(page: Page, s: BattleStack): Promise<number> {
  const b = await caja(page);
  const t = tableroPara(b.width, b.height);
  const c = cajaDeFigura(t, centroDeStack(stackHexes(s)));
  const rx = t.paso * 0.36 * ARO_DE_LA_RUEDA;
  const ry = rx * t.compresion * 0.95;
  const color = COLOR_BANDO[s.side];
  return await page.evaluate(
    ({ x, y, rx, ry, color }) => {
      const lienzo = document.getElementById('canvas') as HTMLCanvasElement;
      const k = lienzo.width / lienzo.getBoundingClientRect().width;
      const ctx = lienzo.getContext('2d');
      if (ctx === null) throw new Error('el lienzo de la batalla no tiene contexto 2d');
      const R = Number.parseInt(color.slice(1, 3), 16);
      const G = Number.parseInt(color.slice(3, 5), 16);
      const B = Number.parseInt(color.slice(5, 7), 16);
      let n = 0;
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI) / 17;
        const d = ctx.getImageData(
          Math.round((x + rx * Math.cos(a)) * k) - 1,
          Math.round((y + ry * Math.sin(a)) * k) - 1,
          3,
          3,
        ).data;
        for (let j = 0; j < d.length; j += 4) {
          if (
            Math.abs((d[j] ?? 0) - R) < 24 &&
            Math.abs((d[j + 1] ?? 0) - G) < 24 &&
            Math.abs((d[j + 2] ?? 0) - B) < 24
          ) {
            n++;
            break;
          }
        }
      }
      return n;
    },
    { x: c.x, y: c.suelo, rx, ry, color },
  );
}

/**
 * Si cada lienzo de las figuras de la cabecera cambia alguna vez en 3 s: se
 * animan. Mirados cada 150 ms contra el primero: un reposo lento puede enseñar
 * el mismo fotograma en dos instantes sueltos.
 */
async function figurasDeLaCabeceraAnimadas(page: Page): Promise<boolean[]> {
  const fotos = async () =>
    await page.$$eval('#rueda .cabecera-de-rueda canvas.figura', (ls) =>
      ls.map((l) => (l as HTMLCanvasElement).toDataURL()),
    );
  const primera = await fotos();
  const cambia = primera.map(() => false);
  for (let i = 0; i < 20 && cambia.some((c) => !c); i++) {
    await sleep(150);
    for (const [j, f] of (await fotos()).entries()) if (f !== primera[j]) cambia[j] = true;
  }
  return cambia;
}

/** ¿Se ve la vista previa del contrincante `id`? */
async function previaAbierta(page: Page, id: string): Promise<boolean> {
  return await page
    .locator(`#rueda [data-contrincante="${id}"] > .vista-previa`)
    .evaluate((el) => getComputedStyle(el).display !== 'none');
}

/**
 * La rueda con los dos contrincantes (#261) y todo el sector respondiendo (#258),
 * a escritorio, con clics de verdad en un tres contra tres. Los dos lienzos de la
 * cabecera se animan; el ratón por la figura de quien pega abre su vista previa
 * (con su vida) sin despertar los sectores; el clic abre su ficha de solo lectura
 * encima de la rueda, y Escape la cierra con la rueda en la misma fase. Los dos
 * llevan su aro en el tablero. Luego, la corona entera: `elementFromPoint` en los
 * bordes y picos de cada sector, y el clic real en la esquina de fuera de Fuerte,
 * que la enciende y la elige; la respuesta con su tecla, y el cruce sale en el parte.
 */
async function contrincantesEnElEscritorio(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const quien = 'rueda-contrincantes';
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, quien, problemas);
  const { espejo, atacante, objetivo, debenSer } = await hastaLaRuedaYoContraYo(
    page,
    url,
    1,
    quien,
    3,
  );
  await sleep(300);
  // Los dos, en orden: quien pega y quien recibe, con la figura de su hoja y su bando.
  const figuras = await page.$$eval('#rueda .cabecera-de-rueda canvas.figura', (ls) =>
    ls.map((l) => `${l.getAttribute('data-figura')}/${l.getAttribute('data-bando')}`),
  );
  if (JSON.stringify(figuras) !== JSON.stringify(debenSer)) {
    throw new Error(
      `${quien}: la cabecera enseña ${figuras.join(', ')} y debía ${debenSer.join(', ')}`,
    );
  }
  await captura(page, 'rueda-20-contrincantes');
  const animadas = await figurasDeLaCabeceraAnimadas(page);
  if (animadas.length !== 2 || animadas.some((a) => !a)) {
    throw new Error(`${quien}: las figuras de la cabecera no se animan (${animadas.join(', ')})`);
  }
  // El aro de la rueda en el tablero, de los dos; y de ningún otro de sus bandos.
  for (const x of [atacante, objetivo]) {
    const n = await aroDeLaRueda(page, x);
    if (n < 6)
      throw new Error(`${quien}: ${x.id} no lleva el aro de la rueda en el tablero (${n} de 18)`);
  }
  const otro = espejo.battle.stacks.find(
    (x) => isAlive(x) && x.side === objetivo.side && x.id !== objetivo.id,
  );
  if (otro !== undefined && (await aroDeLaRueda(page, otro)) >= 6) {
    throw new Error(`${quien}: ${otro.id}, que no se cruza, lleva el aro de la rueda`);
  }
  // La vista previa al pasar el ratón, sin despertar los sectores.
  const icono = page.locator(`#rueda [data-contrincante="${atacante.id}"] > button`);
  const b = await icono.boundingBox();
  if (b === null) throw new Error(`${quien}: la figura de quien pega no se ve`);
  await page.mouse.move(b.x + b.width / 2 - 6, b.y + b.height / 2 - 4);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
  await sleep(150);
  if (!(await previaAbierta(page, atacante.id))) {
    throw new Error(`${quien}: con el ratón en la figura, su vista previa no se abre`);
  }
  const previa = await page
    .locator(`#rueda [data-contrincante="${atacante.id}"] > .vista-previa`)
    .innerText();
  if (!previa.includes('PV') || !previa.includes('Contraataque')) {
    throw new Error(`${quien}: la vista previa no dice la vida ni el contraataque: «${previa}»`);
  }
  if ((await page.locator('#rueda[data-quieta]').count()) === 0) {
    throw new Error(`${quien}: pasar por la figura despierta los sectores de la rueda`);
  }
  await captura(page, 'rueda-21-vista-previa');
  // El clic: la ficha, de solo lectura, encima; Escape vuelve a la rueda.
  await page.mouse.down();
  await page.mouse.up();
  await page
    .locator('#editor-en-combate[open] fieldset.solo-lectura[disabled]')
    .waitFor({ timeout: 3000 });
  const titulo = await page.locator('#titulo-del-editor').innerText();
  if (!titulo.startsWith('Ficha de')) throw new Error(`${quien}: la ficha se titula «${titulo}»`);
  await captura(page, 'rueda-22-ficha');
  await page.keyboard.press('Escape');
  await page
    .locator('#editor-en-combate:not([open])')
    .waitFor({ state: 'attached', timeout: 3000 });
  if ((await page.locator('#rueda[open] .rueda[data-fase="golpe"]').count()) !== 1) {
    throw new Error(`${quien}: al cerrar la ficha la rueda no sigue en la fase del golpe`);
  }
  // El título vuelve con el evento `close`, que llega en una tarea aparte.
  await page
    .waitForFunction(
      (t) => document.getElementById('titulo-del-editor')?.textContent !== t,
      titulo,
      { timeout: 2000 },
    )
    .catch(() => {
      throw new Error(`${quien}: cerrada la ficha, el editor sigue titulado «${titulo}»`);
    });
  // #258: la corona entera responde, y solo ella.
  log(`${quien}: ${await sectoresEnteros(page, quien, true)}`);
  // El clic real en la esquina de fuera de Fuerte: la enciende y la elige.
  const plato = await page.locator('#rueda .plato').boundingBox();
  if (plato === null) throw new Error(`${quien}: el plato no se ve`);
  const k = plato.width / MEDIDAS_DE_LA_RUEDA.lado;
  // Antes, el ratón sobre el «ⓘ» de Fuerte: enciende su sector y abre su nota (R1).
  const info = sitioEnLaRueda('fuerte').nota;
  await page.mouse.move(
    plato.x + plato.width / 2 + info.x * k - 8,
    plato.y + plato.height / 2 + info.y * k,
  );
  await page.mouse.move(
    plato.x + plato.width / 2 + info.x * k,
    plato.y + plato.height / 2 + info.y * k,
    {
      steps: 3,
    },
  );
  await sleep(150);
  if ((await rellenoDelSector(page, 'fuerte')) === (await rellenoDelSector(page, 'rapido'))) {
    throw new Error(`${quien}: con el ratón en el «ⓘ» de Fuerte, su sector no se enciende`);
  }
  const notaAbierta = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('#rueda .sector-de-rueda[data-sector="fuerte"] > .nota') as Element,
        '::after',
      ).content,
  );
  if (notaAbierta === 'none' || notaAbierta === '') {
    throw new Error(`${quien}: con el ratón en el «ⓘ» de Fuerte, su nota no se abre`);
  }
  const g = ((anguloDe('fuerte') + MEDIDAS_DE_LA_RUEDA.medioSector - 2.5) * Math.PI) / 180;
  const r = MEDIDAS_DE_LA_RUEDA.fuera - 4;
  const esquina = {
    x: plato.x + plato.width / 2 + r * k * Math.cos(g),
    y: plato.y + plato.height / 2 + r * k * Math.sin(g),
  };
  await page.mouse.move(esquina.x - 10, esquina.y - 10);
  await page.mouse.move(esquina.x, esquina.y, { steps: 3 });
  await sleep(150);
  if ((await rellenoDelSector(page, 'fuerte')) === (await rellenoDelSector(page, 'rapido'))) {
    throw new Error(`${quien}: con el ratón en la esquina de fuera de Fuerte, no se enciende`);
  }
  await captura(page, 'rueda-23-esquina-de-fuerte');
  const antes = espejo.battle.log.length;
  await page.mouse.down();
  await page.mouse.up();
  espejo.elegirEnLaRueda('fuerte');
  await page.locator('#rueda[open] .rueda[data-fase="respuesta"]').waitFor({ timeout: 5000 });
  // La respuesta: su cabecera también lleva a los dos, en el mismo orden.
  const enLaRespuesta = await page.$$eval('#rueda .cabecera-de-rueda canvas.figura', (ls) =>
    ls.map((l) => `${l.getAttribute('data-figura')}/${l.getAttribute('data-bando')}`),
  );
  if (JSON.stringify(enLaRespuesta) !== JSON.stringify(debenSer)) {
    throw new Error(`${quien}: la cabecera de la respuesta enseña ${enLaRespuesta.join(', ')}`);
  }
  await page.keyboard.press(teclaDe('normal'));
  espejo.elegirEnLaRueda('normal');
  const cruce = espejo.battle.log.slice(antes).find((e) => e.kind === 'cruce');
  if (cruce?.kind !== 'cruce' || cruce.golpe !== 'fuerte') {
    throw new Error(`${quien}: el clic en la esquina de Fuerte no da el golpe Fuerte`);
  }
  await page.locator('#rueda[data-tramo~="rotulo"]').waitFor({ timeout: 8000 });
  const enElDesenlace = await page.locator('#rueda .cabecera-de-rueda canvas.figura').count();
  if (enElDesenlace !== 2)
    throw new Error(`${quien}: el desenlace enseña ${enElDesenlace} figuras`);
  await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
  await page
    .locator('#rueda[open]')
    .waitFor({ state: 'detached', timeout: 100 })
    .catch(() => undefined);
  const parte = await page.locator('#side').innerText();
  const dicho = `${nombreEnLaRueda('fuerte', RUEDA)} contra ${nombreEnLaRueda('normal', RUEDA)}`;
  if (!parte.includes(dicho)) {
    throw new Error(`${quien}: el parte no cuenta el cruce de Fuerte contra Normal`);
  }
  log(
    `${quien}: iconos animados, vista previa, ficha de solo lectura y vuelta, aros; Fuerte por su esquina`,
  );
  await page.close();
}

/**
 * La misma rueda en un móvil de verdad (toque, sin ratón): la cabecera con los
 * dos en dos líneas como mucho, y tocar una figura abre su ficha sin vista previa
 * (decisión del usuario, 14-10-2026); «Volver a la rueda» vuelve a la misma fase y
 * se elige tocando un sector por el borde de fuera.
 */
async function contrincantesEnElMovil(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const quien = 'rueda-contrincantes-movil';
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await contexto.newPage();
  vigilarConsola(page, quien, problemas);
  const { espejo, objetivo } = await hastaLaRuedaYoContraYo(page, url, 1, quien, 3);
  await sleep(300);
  if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
    throw new Error(`${quien}: el móvil emulado dice que tiene ratón: la prueba no prueba nada`);
  }
  // Dos líneas como mucho: las cajas de los dos y de «ataca a», por su alto.
  const filas = await page.$$eval('#rueda .cabecera-de-rueda :is(.contrincante, .ataca)', (els) => {
    const medios = els.map((e) => {
      const r = e.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const distintas: number[] = [];
    for (const m of medios) if (!distintas.some((d) => Math.abs(d - m) < 12)) distintas.push(m);
    return distintas.length;
  });
  if (filas > 2) throw new Error(`${quien}: la cabecera de la rueda ocupa ${filas} líneas`);
  await captura(page, 'rueda-24-contrincantes-movil');
  await page.locator(`#rueda [data-contrincante="${objetivo.id}"] > button`).tap();
  await page
    .locator('#editor-en-combate[open] fieldset.solo-lectura[disabled]')
    .waitFor({ timeout: 3000 });
  if (await previaAbierta(page, objetivo.id)) {
    throw new Error(`${quien}: tocar la figura abre también la vista previa`);
  }
  await captura(page, 'rueda-25-ficha-movil');
  await page.getByRole('button', { name: 'Volver a la rueda' }).tap();
  await page.locator('#rueda[open] .rueda[data-fase="golpe"]').waitFor({ timeout: 3000 });
  if ((await page.locator('#editor-en-combate[open]').count()) > 0) {
    throw new Error(`${quien}: «Volver a la rueda» no cierra la ficha`);
  }
  log(`${quien}: ${await sectoresEnteros(page, quien, false)}`);
  // Elegir tocando Ofensivo cerca de su borde de fuera.
  const plato = await page.locator('#rueda .plato').boundingBox();
  if (plato === null) throw new Error(`${quien}: el plato no se ve`);
  const k = plato.width / MEDIDAS_DE_LA_RUEDA.lado;
  const g = ((anguloDe('ofensivo') - MEDIDAS_DE_LA_RUEDA.medioSector + 3) * Math.PI) / 180;
  const r = MEDIDAS_DE_LA_RUEDA.fuera - 5;
  const antes = espejo.battle.log.length;
  await page.touchscreen.tap(
    plato.x + plato.width / 2 + r * k * Math.cos(g),
    plato.y + plato.height / 2 + r * k * Math.sin(g),
  );
  espejo.elegirEnLaRueda('ofensivo');
  await page.locator('#rueda[open] .rueda[data-fase="respuesta"]').waitFor({ timeout: 5000 });
  await page.keyboard.press(teclaDe('normal'));
  espejo.elegirEnLaRueda('normal');
  const cruce = espejo.battle.log.slice(antes).find((e) => e.kind === 'cruce');
  if (cruce?.kind !== 'cruce' || cruce.golpe !== 'ofensivo') {
    throw new Error(`${quien}: tocar el borde de Ofensivo no da el golpe Ofensivo`);
  }
  await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
  await mismaPelea(page, espejo, `${quien}: tras el cruce`);
  log(`${quien}: dos líneas, ficha al tocar sin vista previa, y Ofensivo por su borde`);
  await contexto.close();
}

/** Los dos contrincantes de la rueda (#261) y sus sectores enteros (#258), a escritorio y a móvil. */
export async function contrincantesDeLaRueda(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  await conLosCatalogosDevueltos('rueda-contrincantes', async () => {
    await contrincantesEnElEscritorio(browser, url, problemas);
    await contrincantesEnElMovil(browser, url, problemas);
  });
}
