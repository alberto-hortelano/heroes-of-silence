/**
 * La pasada «tropa» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la escena de la tropa, el tablero de despliegue.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import { EscenaTropa } from '../../../../src/client/partida/tropa/escena.js';
import { Session } from '../../../../src/client/sesion/partida.js';
import type { Hex } from '../../../../src/core/types.js';
import { urlDePartida } from '../../navegador/url-de-partida.js';
import type { Caja } from '../escenas.js';
import {
  caja,
  captura,
  comprobar,
  log,
  mismaBarra,
  type Problemas,
  vigilarConsola,
} from '../pagina.js';
import { abrir, salirDeLaBase } from '../partida.js';

// ------------------------------------------------------------------ la tropa en escena

/**
 * Una muestra de la luz del lienzo, uno de cada 16 píxeles de dispositivo: con
 * ella se mira si el mapa de después de la tropa es el de antes (la misma cámara),
 * sin exigir que las figuras que respiran estén en el mismo fotograma.
 */
async function huellaDelLienzo(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    const l = document.getElementById('canvas') as HTMLCanvasElement;
    const c = l.getContext('2d');
    if (c === null) throw new Error('el lienzo no tiene contexto 2D');
    const d = c.getImageData(0, 0, l.width, l.height).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4 * 16) {
      out.push(((d[i] ?? 0) * 2 + (d[i + 1] ?? 0) * 7 + (d[i + 2] ?? 0)) / 10);
    }
    return out;
  });
}

/** La parte de las muestras que cambia de luz más de 40: con la cámara movida, casi todas. */
function cuantoCambia(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > 40) n++;
  return n / a.length;
}

/**
 * La escena de la tropa del espejo en el lienzo de la página: la MISMA clase que
 * lee el clic en la página (`EscenaTropa`), encuadrada en su lienzo. En Node no
 * pinta: las figuras están en su casilla sin haberlas animado.
 */
async function escenaDeLaTropa(
  page: Page,
  espejo: Session,
): Promise<{ b: Caja; escena: EscenaTropa }> {
  if (espejo.vistaDeLaTropa() === null) {
    throw new Error('tropa: el espejo no está en la escena de la tropa');
  }
  const b = await caja(page);
  const escena = new EscenaTropa(() => espejo);
  escena.encuadrar(b.width, b.height);
  return { b, escena };
}

/** Pulsa en la página el punto `(x, y)` del lienzo y lo mismo en el espejo, con la misma escena. */
async function pulsarEnElTablero(
  page: Page,
  b: Caja,
  escena: EscenaTropa,
  x: number,
  y: number,
): Promise<void> {
  const px = Math.round(b.x + x);
  const py = Math.round(b.y + y);
  await page.mouse.move(px - 4, py);
  await page.mouse.move(px, py);
  await page.mouse.click(px, py);
  escena.pulsar(px - b.x, py - b.y);
}

/**
 * Pulsa en el lienzo el cuerpo del stack `id` de la formación, en un punto que la
 * escena lee como elegirlo (`EscenaTropa.clicEn`: el centro de una casilla verde
 * de detrás gana a la figura que lo tapa), y lo mismo en el espejo.
 */
async function elegirEnLaTropa(page: Page, espejo: Session, id: string): Promise<void> {
  const { b, escena } = await escenaDeLaTropa(page, espejo);
  const c = escena.cajaDe(id);
  if (c === null) throw new Error(`tropa: no hay ${id} en la formación`);
  for (const alto of [0.5, 0.65, 0.35, 0.8, 0.2]) {
    const y = c.suelo - c.alto * alto;
    const clic = escena.clicEn(Math.round(b.x + c.x) - b.x, Math.round(b.y + y) - b.y);
    if (clic?.kind === 'elegir' && clic.stack.id === id) {
      await pulsarEnElTablero(page, b, escena, c.x, y);
      return;
    }
  }
  throw new Error(`tropa: ningún punto del cuerpo de ${id} lo elige: lo tapan casillas verdes`);
}

/** Pulsa en el lienzo el centro de la casilla `at` (colocar al elegido ahí), y lo mismo en el espejo. */
async function colocarEnLaTropa(page: Page, espejo: Session, at: Hex): Promise<void> {
  const { b, escena } = await escenaDeLaTropa(page, espejo);
  const c = escena.centroDe(at);
  await pulsarEnElTablero(page, b, escena, c.x, c.y);
}

/** Espera a que el lienzo diga que la elegida es la del espejo (`canvas[data-tropa]`). */
async function esperarLaElegida(page: Page, espejo: Session, paso: string): Promise<void> {
  const vista = espejo.vistaDeLaTropa();
  const id = vista?.figuras[vista.elegida]?.id;
  if (id === undefined) throw new Error(`tropa: tras «${paso}» el espejo no tiene elegida`);
  await page.waitForSelector(`#canvas[data-tropa="${id}"]`, { timeout: 3000 }).catch(async () => {
    const tiene = await page.locator('#canvas').getAttribute('data-tropa');
    throw new Error(`tropa: tras «${paso}» la página elige «${tiene}» y el espejo «${id}»`);
  });
  // Y la formación de la página, la del espejo: cada botón del panel dice su casilla.
  const dicen = (await page.locator('#side [data-action="tropa-elegir"]').allInnerTexts()).map(
    (t) => /\((\d+),(\d+)\)/.exec(t)?.[0] ?? t,
  );
  const espera = vista!.figuras.map((f) => `(${f.sale.col},${f.sale.row})`);
  if (dicen.join(' ') !== espera.join(' ')) {
    throw new Error(
      `tropa: tras «${paso}» la formación de la página es ${dicen.join(' ')} y la del espejo ${espera.join(' ')}`,
    );
  }
  const titulo = (await page.locator('#side .ficha-de-la-tropa h2').innerText()).trim();
  if (titulo.toUpperCase() !== vista!.ficha.nombre.toUpperCase()) {
    throw new Error(
      `tropa: tras «${paso}» la ficha de la página es «${titulo}» y la del espejo «${vista!.ficha.nombre}»`,
    );
  }
}

/**
 * La cota del tablero de la tropa: con el héroe y los suyos en su formación, en el
 * lienzo de la página (en el móvil, el tablero de 860 px que se desplaza, como el
 * de la batalla), toda figura cabe entera en el lienzo.
 */
async function cotaDeLaTropa(page: Page, espejo: Session, quien: string): Promise<void> {
  const { b, escena } = await escenaDeLaTropa(page, espejo);
  const vista = espejo.vistaDeLaTropa()!;
  const cajas = vista.figuras.map((f) => escena.cajaDe(f.id)!);
  const fuera = cajas.filter(
    (c) =>
      c.x - c.ancho / 2 < 0 ||
      c.x + c.ancho / 2 > b.width ||
      c.suelo - c.alto < 0 ||
      c.suelo > b.height,
  ).length;
  log(
    `${quien}: ${cajas.length} figuras en el tablero de ${Math.round(b.width)}×${Math.round(b.height)}, de ${Math.round(Math.min(...cajas.map((c) => c.alto)))} px de alto`,
  );
  if (fuera > 0) throw new Error(`${quien}: ${fuera} figuras fuera del lienzo`);
}

/**
 * La tropa del héroe en escena (19-10-2026; el tablero de despliegue desde el
 * 02-11-2026): con la T se abre el tablero con el héroe y los suyos en su
 * formación; se pone al héroe en un hueco de su zona pulsando la casilla, se elige
 * a uno de la tropa pulsándole el cuerpo y se le pone en la casilla del héroe (se
 * cambian), con el espejo a la par (la barra, el elegido y la formación del
 * panel); salir y volver a entrar la conserva. Se le quita el gambesón al héroe y
 * se le pone, con doble clic, a un novato que no es el primero de su tipo, el
 * panel abre arriba aunque el del mapa estuviera bajado, y «Volver al mapa» deja
 * el mapa con la cámara de antes y su panel donde estaba (la vista movida con la
 * rueda y un arrastre, para que volver a la de siempre no pase por igual). Y la
 * escena a 1280×720, a 1024×768 y en el móvil, con todas las figuras en el lienzo.
 */
export async function tropaEnEscena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const semilla = 7;
  const { page, espejo, mapa } = await abrir(browser, url, problemas, { nombre: 'tropa', semilla });
  const heroe = espejo.selectedHero;
  if (heroe === null || heroe.army.length < 2) {
    throw new Error(`tropa: la semilla ${semilla} no abre con un héroe con tropa`);
  }
  await mapa.rueda(1);
  await mapa.arrastrar(-160, -90);
  await page.mouse.move(5, 5);
  await sleep(300);
  const cajaAntes = await caja(page);
  const huellaAntes = await huellaDelLienzo(page);
  // El panel del mapa, bajado del todo: la tropa abre arriba igual y, al volver,
  // el mapa lo encuentra donde lo dejó (QA, H3).
  const lateralDelMapa = await page.evaluate(() => {
    const l = document.getElementById('lateral') as HTMLElement;
    l.scrollTop = l.scrollHeight;
    return l.scrollTop;
  });
  if (lateralDelMapa <= 0) {
    throw new Error(
      'tropa: el panel del mapa no se desplaza y no se puede ver si la tropa abre arriba',
    );
  }

  await page.keyboard.press('t');
  espejo.abrirLaTropa();
  await page.waitForSelector('#app[data-escena="tropa"]', { timeout: 5000 });
  await esperarLaElegida(page, espejo, 'abrir con la T');
  await mismaBarra(page, espejo, 'abrir con la T');
  const lateralDeLaTropa = await page.evaluate(
    () => (document.getElementById('lateral') as HTMLElement).scrollTop,
  );
  if (lateralDeLaTropa !== 0) {
    throw new Error(
      `tropa: el panel de la tropa abre bajado ${lateralDeLaTropa} px (el del mapa estaba en ${lateralDelMapa}): la lista de a quién elegir no se ve`,
    );
  }
  await sleep(400);
  await cotaDeLaTropa(page, espejo, 'tropa');
  await captura(page, 'tropa-01-escena');

  // El héroe, a un hueco de su zona: pulsar la casilla verde.
  const vista0 = espejo.vistaDeLaTropa()!;
  const hueco = espejo.formacion.zona.find(
    (z) => !vista0.figuras.some((f) => f.sale.col === z.col && f.sale.row === z.row) && z.col > 0,
  );
  if (hueco === undefined) throw new Error('tropa: la zona del héroe no tiene hueco');
  await colocarEnLaTropa(page, espejo, hueco);
  await sleep(200);
  await mismaBarra(page, espejo, `poner al héroe en (${hueco.col},${hueco.row})`);
  await esperarLaElegida(page, espejo, `poner al héroe en (${hueco.col},${hueco.row})`);
  if (!espejo.status.endsWith(`sale en (${hueco.col},${hueco.row}).`)) {
    throw new Error(`tropa: tras poner al héroe en un hueco la barra dice «${espejo.status}»`);
  }
  log(`tropa: ${espejo.status}`);
  await captura(page, 'tropa-02-heroe-movido');

  // El segundo de la tropa, pulsándole el cuerpo, y a la casilla del héroe: se cambian.
  await elegirEnLaTropa(page, espejo, 'attacker-1');
  await esperarLaElegida(page, espejo, 'pulsar al segundo de la tropa');
  await mismaBarra(page, espejo, 'pulsar al segundo de la tropa');
  await colocarEnLaTropa(page, espejo, hueco);
  await sleep(200);
  await mismaBarra(page, espejo, 'ponerlo en la casilla del héroe');
  await esperarLaElegida(page, espejo, 'ponerlo en la casilla del héroe');
  if (!espejo.status.endsWith('se cambian de sitio.')) {
    throw new Error(`tropa: tras ponerlo en la casilla del héroe la barra dice «${espejo.status}»`);
  }
  log(`tropa: ${espejo.status}`);
  await captura(page, 'tropa-03-intercambio');

  // Salir y volver a entrar: la formación se guardó en el héroe.
  const guardada = espejo.vistaDeLaTropa()!.figuras.map((f) => f.sale);
  await page.locator('[data-action="cerrar-tropa"]').click();
  espejo.cerrarLaTropa();
  await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 5000 });
  await page.keyboard.press('t');
  espejo.abrirLaTropa();
  await page.waitForSelector('#app[data-escena="tropa"]', { timeout: 5000 });
  await esperarLaElegida(page, espejo, 'volver a abrir la tropa');
  const otraVez = espejo.vistaDeLaTropa()!.figuras.map((f) => f.sale);
  if (JSON.stringify(otraVez) !== JSON.stringify(guardada)) {
    throw new Error(
      `tropa: al volver a abrirla la formación es ${JSON.stringify(otraVez)} y era ${JSON.stringify(guardada)}`,
    );
  }
  await sleep(300);
  await captura(page, 'tropa-04-al-volver');

  // Al héroe, por su botón del panel, y quitarle el gambesón.
  await page.locator('#side [data-action="tropa-elegir"][data-quien="heroe"]').click();
  espejo.elegirEnLaTropa({ heroe: true });
  await esperarLaElegida(page, espejo, 'elegir al héroe en el panel');
  await page.locator('#side [data-action="tropa-quitar"][data-slot="armadura"]').click();
  espejo.quitarALaElegida('armadura');
  await sleep(200);
  await mismaBarra(page, espejo, 'quitarle el gambesón al héroe');
  await comprobar(page, espejo, 'quitarle el gambesón al héroe');
  if (!heroe.mochila.includes('gambeson')) {
    throw new Error(`tropa: el gambesón no ha vuelto a la mochila del espejo: ${espejo.status}`);
  }
  const armadura = page.locator('#side .ficha-de-la-tropa .row', { hasText: 'Armadura' });
  const dice = (await armadura.innerText()).replace(/\s+/g, ' ').trim();
  if (!dice.endsWith(String(espejo.vistaDeLaTropa()!.ficha.armadura))) {
    throw new Error(
      `tropa: sin el gambesón la ficha dice «${dice}» y el espejo ${espejo.vistaDeLaTropa()!.ficha.armadura}`,
    );
  }
  await captura(page, 'tropa-05-sin-gambeson');

  // Ponérselo a un novato que no es el primero de su tipo, pulsado en el lienzo:
  // lo lleva ÉL y la elección no salta al primero (QA, H2). Con doble clic en
  // «Poner»: juega una vez y la barra no dice que algo falló (QA, H6).
  const otro = heroe.army.findIndex(
    (t, i) =>
      t.veterania === undefined &&
      heroe.army.slice(0, i).some((u) => u.creature === t.creature && u.veterania === undefined),
  );
  if (otro < 0) {
    throw new Error(
      `tropa: la semilla ${semilla} no lleva dos novatos del mismo tipo para ver a quién se le pone`,
    );
  }
  await elegirEnLaTropa(page, espejo, `attacker-${otro}`);
  await esperarLaElegida(page, espejo, `pulsar al ${otro + 1}.º de la tropa`);
  const poner = page.locator('#side [data-action="tropa-poner"][data-item="gambeson"]');
  if (!(await poner.isEnabled())) {
    throw new Error(
      `tropa: «Poner» el gambesón sale apagado: ${espejo.vistaDeLaTropa()!.ficha.mochila[0]?.poner}`,
    );
  }
  await poner.dblclick();
  espejo.ponerALaElegida('gambeson');
  espejo.ponerALaElegida('gambeson');
  await sleep(200);
  await mismaBarra(page, espejo, `ponerle el gambesón al ${otro + 1}.º con doble clic`);
  await esperarLaElegida(page, espejo, `ponerle el gambesón al ${otro + 1}.º`);
  if (heroe.army[otro]?.veterania?.equipo?.armadura !== 'gambeson') {
    throw new Error(
      `tropa: el gambesón no lo lleva el ${otro + 1}.º de la tropa: ${espejo.status}`,
    );
  }
  if (!espejo.status.endsWith('lleva ahora Gambesón.')) {
    throw new Error(`tropa: tras el doble clic en «Poner» la barra dice «${espejo.status}»`);
  }
  await comprobar(page, espejo, `ponerle el gambesón al ${otro + 1}.º`);
  await captura(page, 'tropa-06-gambeson-puesto');
  log(`tropa: ${espejo.status} (el ${otro + 1}.º de la tropa, con doble clic)`);

  // «Volver al mapa»: el mismo héroe y la misma cámara.
  await page.locator('[data-action="cerrar-tropa"]').click();
  espejo.cerrarLaTropa();
  await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 5000 });
  await page.mouse.move(5, 5);
  await sleep(500);
  const cajaDespues = await caja(page);
  if (
    cajaDespues.width !== cajaAntes.width ||
    cajaDespues.height !== cajaAntes.height ||
    cajaDespues.x !== cajaAntes.x ||
    cajaDespues.y !== cajaAntes.y
  ) {
    throw new Error(
      `tropa: el lienzo del mapa era ${JSON.stringify(cajaAntes)} y al volver es ${JSON.stringify(cajaDespues)}`,
    );
  }
  const cambio = cuantoCambia(huellaAntes, await huellaDelLienzo(page));
  log(`tropa: al volver al mapa cambia el ${(cambio * 100).toFixed(1)} % del lienzo`);
  if (cambio > 0.05) {
    await captura(page, 'tropa-07-mapa-movido');
    throw new Error(
      `tropa: al volver al mapa cambia el ${(cambio * 100).toFixed(1)} % del lienzo: la cámara no es la de antes`,
    );
  }
  await comprobar(page, espejo, 'volver al mapa');
  // Como lo dejó: bajado lo mismo, o hasta el fondo si el panel ha encogido (el
  // gambesón ya no está en la mochila del héroe).
  const alVolver = await page.evaluate(() => {
    const l = document.getElementById('lateral') as HTMLElement;
    return { en: l.scrollTop, fondo: l.scrollHeight - l.clientHeight };
  });
  const esperado = Math.min(lateralDelMapa, alVolver.fondo);
  log(
    `tropa: el panel del mapa, bajado ${lateralDelMapa} px; en la tropa, 0; al volver, ${alVolver.en} (fondo ${alVolver.fondo})`,
  );
  if (Math.abs(alVolver.en - esperado) > 2) {
    throw new Error(
      `tropa: el panel del mapa estaba bajado ${lateralDelMapa} px y al volver está en ${alVolver.en} (su fondo, ${alVolver.fondo})`,
    );
  }
  const elegido = await page.locator('#side h2').first().innerText();
  if (elegido.trim().toUpperCase() !== heroe.name.toUpperCase()) {
    throw new Error(`tropa: al volver al mapa el panel enseña a «${elegido}» y no a ${heroe.name}`);
  }
  await captura(page, 'tropa-07-de-vuelta-en-el-mapa');
  await page.close();

  // A 1280×720, a 1024×768 y en el móvil: abrir con el botón «Tropa» (tocándolo en el
  // móvil), y la cota del encuadre en cada uno.
  for (const v of [
    { nombre: 'tropa-1280', viewport: { width: 1280, height: 720 }, movil: false },
    { nombre: 'tropa-1024', viewport: { width: 1024, height: 768 }, movil: false },
    { nombre: 'tropa-movil', viewport: { width: 390, height: 844 }, movil: true },
  ]) {
    const contexto = await browser.newContext(
      v.movil
        ? { viewport: v.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { viewport: v.viewport },
    );
    const p = await contexto.newPage();
    vigilarConsola(p, v.nombre, problemas);
    await p.goto(`${url}${urlDePartida(semilla)}`, { waitUntil: 'networkidle' });
    await salirDeLaBase(p, v.nombre, v.movil ? 'toque' : 'clic');
    const boton = p.locator('#side [data-action="abrir-tropa"]');
    if (v.movil) await boton.tap();
    else await boton.click();
    await p.waitForSelector(`#app[data-escena="tropa"]`, { timeout: 5000 });
    await p.waitForSelector('#canvas[data-tropa="attacker-heroe"]', { timeout: 3000 });
    await sleep(600);
    const espejoDeVer = new Session(semilla);
    espejoDeVer.abrirLaTropa();
    await cotaDeLaTropa(p, espejoDeVer, v.nombre);
    await captura(p, `${v.nombre}-escena`);
    await contexto.close();
  }
}
