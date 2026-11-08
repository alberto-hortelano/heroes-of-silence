/**
 * La pasada «edicion» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): «Editar fichas» de la arena.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import type { Browser, Page } from 'playwright';
import {
  abrirLaArena,
  asentada,
  ataqueEnLaPelea,
  bandosDichos,
  esperarBarra,
  sinElCatalogoDelJuego,
} from '../arena.js';
import { cifrasCortadas } from '../ficha.js';
import { captura, log, type Problemas, vigilarConsola } from '../pagina.js';

// --------------------------------------------------------------- edición

/**
 * Los tamaños en los que cada ficha abierta tiene que verse sin desplazarse por
 * dentro ni recortarse, en tres columnas como mucho y las demás debajo (ciclo
 * 2026-10-12, fichas sin tope). Que se vean enteras a la vista ya no se pide: la
 * vista se desplaza como una página.
 */
const PANTALLAS_DE_EDICION = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/** Como mucho tres columnas: lo pidió el usuario a cambio de la letra más grande. */
const COLUMNAS_DE_EDICION = 3;

/**
 * Lo que no vale en la vista de edición, medido en la página: una ficha con
 * desplazamiento propio (su `overflow` o su contenido más alto o más ancho que
 * ella), algo dentro de ella que se sale de su caja, un campo que se desplaza
 * por dentro, el nombre que no se lee entero (H5), una región de dentro de la
 * vista con desplazamiento propio (la vista se desplaza entera, como una
 * página: H2, H3), o la vista o la página desplazándose en horizontal. Devuelve
 * los fallos, en cuántas columnas y filas van las fichas y si la vista se
 * desplaza en vertical (`desplaza`).
 */
async function medirLaEdicion(page: Page): Promise<{
  fallos: string[];
  columnas: number;
  filas: number;
  n: number;
  desplaza: boolean;
}> {
  return page.evaluate(() => {
    const fallos: string[] = [];
    const raiz = document.documentElement;
    const vista = document.querySelector('#edicion') as HTMLElement;
    vista.scrollTop = 0;
    if (vista.scrollWidth > vista.clientWidth + 1)
      fallos.push(
        `la vista se desplaza en horizontal (${vista.scrollWidth} > ${vista.clientWidth})`,
      );
    for (const d of vista.querySelectorAll<HTMLElement>('*')) {
      if (d.tagName === 'SELECT' || d.tagName === 'OPTION') continue;
      const ds = getComputedStyle(d);
      if (
        ['auto', 'scroll'].includes(ds.overflowY) &&
        d.scrollHeight > d.clientHeight + 1 &&
        d.closest('.ficha-abierta') === null
      )
        fallos.push(`${d.className || d.tagName} se desplaza por su cuenta dentro de la vista`);
    }
    if (raiz.scrollWidth > raiz.clientWidth + 1)
      fallos.push(
        `la página se desplaza en horizontal (${raiz.scrollWidth} > ${raiz.clientWidth})`,
      );
    const fichas = [...document.querySelectorAll<HTMLElement>('#edicion .ficha-abierta')];
    const izquierdas = new Set<number>();
    const arribas = new Set<number>();
    for (const f of fichas) {
      const quien = f.getAttribute('data-clave-de-ficha');
      const cs = getComputedStyle(f);
      for (const eje of ['overflowX', 'overflowY'] as const) {
        if (cs[eje] === 'auto' || cs[eje] === 'scroll' || cs[eje] === 'hidden')
          fallos.push(`${quien}: ${eje} es ${cs[eje]}`);
      }
      if (f.scrollHeight > f.clientHeight + 1)
        fallos.push(`${quien}: más alta por dentro (${f.scrollHeight} > ${f.clientHeight})`);
      if (f.scrollWidth > f.clientWidth + 1)
        fallos.push(`${quien}: más ancha por dentro (${f.scrollWidth} > ${f.clientWidth})`);
      const caja = f.getBoundingClientRect();
      izquierdas.add(Math.round(caja.left));
      arribas.add(Math.round(caja.top));
      for (const n of f.querySelectorAll<HTMLInputElement>('input[type="text"]')) {
        if (n.scrollWidth > n.clientWidth + 1)
          fallos.push(`${quien}: «${n.value}» no se lee entero en su campo`);
      }
      for (const d of f.querySelectorAll<HTMLElement>('*')) {
        if (d.tagName === 'OPTION') continue;
        const r = d.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const nombre = `${d.tagName.toLowerCase()}${d.className === '' ? '' : `.${String(d.className).replace(/ /g, '.')}`}`;
        if (r.left < caja.left - 1 || r.right > caja.right + 1 || r.bottom > caja.bottom + 1)
          fallos.push(
            `${quien}: ${nombre} se sale de la ficha (${Math.round(r.left)}-${Math.round(r.right)} en ${Math.round(caja.left)}-${Math.round(caja.right)})`,
          );
        const ds = getComputedStyle(d);
        // Sin funciones con nombre aquí dentro: tsx les pone `__name`, que en la página no existe.
        const desplaza = ['auto', 'scroll'];
        if (
          d.tagName !== 'SELECT' &&
          ((desplaza.includes(ds.overflowY) && d.scrollHeight > d.clientHeight + 1) ||
            (desplaza.includes(ds.overflowX) && d.scrollWidth > d.clientWidth + 1))
        )
          fallos.push(`${quien}: ${nombre} se desplaza por dentro`);
      }
    }
    return {
      fallos,
      columnas: izquierdas.size,
      filas: arribas.size,
      n: fichas.length,
      desplaza: vista.scrollHeight > vista.clientHeight + 1,
    };
  });
}

/**
 * Mide la edición en los tres tamaños de escritorio: cada ficha sin desplazarse
 * por dentro ni recortarse, en `COLUMNAS_DE_EDICION` columnas como mucho (con
 * menos, una por ficha) y las demás en filas debajo. La lista sigue desplegada:
 * abrir una ficha no la pliega (12-10-2026).
 */
async function edicionEntera(page: Page, paso: string): Promise<void> {
  if (
    (await page.locator('#edicion [data-arena="plegar-lista"][aria-expanded="false"]').count()) > 0
  )
    throw new Error(`edición, ${paso}: la lista se ha plegado sola`);
  const dichas: string[] = [];
  for (const v of PANTALLAS_DE_EDICION) {
    await page.setViewportSize(v);
    await asentada(page);
    const m = await medirLaEdicion(page);
    m.fallos.push(...(await page.evaluate(cifrasCortadas, '#edicion')));
    const donde = `${v.width}×${v.height}`;
    if (m.fallos.length > 0)
      throw new Error(`edición, ${paso} a ${donde}:\n  ${m.fallos.join('\n  ')}`);
    const columnas = Math.min(m.n, COLUMNAS_DE_EDICION);
    const filas = Math.ceil(m.n / COLUMNAS_DE_EDICION);
    if (m.columnas !== columnas || m.filas !== filas)
      throw new Error(
        `edición, ${paso} a ${donde}: ${m.n} fichas en ${m.columnas} columnas y ${m.filas} filas, no en ${columnas} y ${filas}`,
      );
    dichas.push(`${v.width} ${m.columnas}×${m.filas}${m.desplaza ? ', se desplaza' : ''}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await asentada(page);
  log(`edición: ${paso}, ${dichas.join('; ')}`);
}

/**
 * La vista de edición de la arena (ciclos 2026-10-11, página de edición, y
 * 2026-10-12, fichas sin tope): se entra desde el montaje y se abren seis fichas
 * de hojas (hasta el 13-10-2026, dos eran criaturas del catálogo) sin tope y sin que la lista se
 * pliegue; con 1 a 6, como mucho tres columnas y las demás debajo, sin
 * desplazarse ni recortarse ninguna, y a 390 de ancho una columna; girar una no
 * gira otra, un campo cambia SU ficha, lo ilegal no entra, y al volver el
 * montaje sigue como estaba con la cifra nueva. «✎» cambia el nombre (Intro lo
 * guarda, Escape no) y un rasgo se pone y se quita por su etiqueta, hasta el
 * montaje. Al ir y volver otra vez, las mismas abiertas.
 */
export async function edicionDeLaArena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'edicion', problemas);
  await abrirLaArena(page, url, `?seed=7`);
  // El montaje que tiene que seguir igual: dos unidades y una muralla de ejemplo.
  await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
  await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
  await page.locator('[data-arena="cargar-forma"]').first().click();
  const murosAntes = await page.locator('#muralla .hex.muro').count();
  if (murosAntes === 0) throw new Error('edición: la forma de ejemplo no ha puesto muros');
  const bandosAntes = await bandosDichos(page);
  const urlAntes = page.url();

  await page.locator('[data-arena="ir-a-edicion"]').click();
  await page.locator('#app[data-escena="edicion"]').waitFor({ timeout: 2000 });
  if (await page.locator('#montaje').isVisible()) throw new Error('edición: se ve el montaje');
  if (await page.locator('[data-arena="luchar"]').isVisible())
    throw new Error('edición: «Luchar» se ve en la edición');

  /** La lista plegada con su botón (la captura) se despliega para elegir. */
  const desplegar = async (): Promise<void> => {
    const plegada = page.locator('#edicion [data-arena="plegar-lista"][aria-expanded="false"]');
    if ((await plegada.count()) === 1) await plegada.click();
  };
  // Abrir una trae su ficha a la vista sin plegar la lista (M3 de QA): su
  // cabecera, entera en la vista y por encima de la barra de estado. Antes la
  // primera caía en y=853 de 900, bajo la barra, y desde la cuarta, pantallas
  // más abajo.
  const abrir = async (que: string, paso: string): Promise<void> => {
    await page.locator(`#edicion [data-arena="abrir-ficha"]${que}`).click();
    const [, id] = /^\[data-unidad="([^"]+)"\]$/.exec(que) ?? [];
    if (id === undefined) throw new Error(`edición: «${que}» no dice qué ficha se abre`);
    const clave = `unidad:${id}`;
    await asentada(page);
    const donde = await page.evaluate((c) => {
      const t = document
        .querySelector(`#edicion article[data-clave-de-ficha="${c}"] .titulo-de-ficha`)
        ?.getBoundingClientRect();
      const v = (document.querySelector('#edicion') as HTMLElement).getBoundingClientRect();
      const barra = (document.querySelector('#statusbar') as HTMLElement).getBoundingClientRect();
      if (t === undefined) return `${c} no tiene título`;
      const abajo = Math.min(v.bottom, barra.top);
      return t.top >= v.top - 1 && t.bottom <= abajo + 1
        ? null
        : `la cabecera de ${c} va de ${Math.round(t.top)} a ${Math.round(t.bottom)}, fuera de la vista (${Math.round(v.top)}-${Math.round(abajo)})`;
    }, clave);
    if (donde !== null) throw new Error(`edición, ${paso}: ${donde}`);
    await edicionEntera(page, paso);
  };
  await abrir('[data-unidad="templario-escudo"]', '1 abierta');
  const otraVez = page.locator(
    '#edicion [data-arena="abrir-ficha"][data-unidad="templario-escudo"]',
  );
  if (!(await otraVez.isDisabled()) || (await otraVez.innerText()) !== 'Abierta')
    throw new Error('edición: la ficha abierta se puede abrir otra vez');
  // El monje es la más alta (poderes y habilidades), y el caballero de la muerte
  // lleva el nombre largo que no se leía entero (H5).
  await abrir('[data-unidad="templario-monje"]', '2 abiertas');
  await abrir('[data-unidad="caballero-de-la-muerte"]', '3 abiertas');
  // Por su facción, como se elige en la lista: sin el catálogo del juego (13-10-2026).
  await sinElCatalogoDelJuego(page, '#edicion', 'edición');
  await page.locator('#edicion [data-arena="filtro"][data-faccion="elfos"]').click();
  await abrir('[data-unidad="elfo-arquero"]', '4 abiertas');
  // Sin tope: la quinta y la sexta entran, debajo de las tres primeras.
  await page.locator('#edicion [data-arena="filtro"][data-faccion="no-muertos"]').click();
  await abrir('[data-unidad="esqueleto-guerrero"]', '5 abiertas');
  await page.locator('#edicion [data-arena="filtro"][data-faccion="todas"]').click();
  await abrir('[data-unidad="zombi"]', '6 abiertas');
  await esperarBarra(page, 'Zombie: ficha abierta.', 'edición: la sexta', { exacta: true });
  if ((await page.locator('#edicion .ficha-abierta').count()) !== 6)
    throw new Error('edición: no hay seis fichas abiertas');
  if (!(await medirLaEdicion(page)).desplaza)
    throw new Error('edición: con seis abiertas a 1440×900 la vista no se desplaza');

  // La captura, con la lista plegada por su botón: las fichas, desde arriba.
  await page.locator('#edicion [data-arena="plegar-lista"]').click();
  await asentada(page);
  await captura(page, 'arena-10-edicion-6');
  await desplegar();

  // A 390 de ancho: una debajo de otra y sin desplazarse en horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  await asentada(page);
  const movil = await medirLaEdicion(page);
  movil.fallos.push(...(await page.evaluate(cifrasCortadas, '#edicion')));
  if (movil.fallos.length > 0)
    throw new Error(`edición a 390×844:\n  ${movil.fallos.join('\n  ')}`);
  if (movil.columnas !== 1) throw new Error(`edición a 390×844: en ${movil.columnas} columnas`);
  await page.locator('#edicion .fichas-abiertas').evaluate((e) => e.scrollIntoView());
  await captura(page, 'arena-11-edicion-movil');
  await page.setViewportSize({ width: 1440, height: 900 });
  await asentada(page);
  log('edición: a 390×844, una columna y sin desplazarse en horizontal');

  // Girar la ficha del templario carga su siguiente dirección (d2; ver «Las 8
  // direcciones» en `jugarArena`), y la del monje no: cada ficha gira la suya.
  // Se espera a la respuesta de esa hoja, que es la señal de que se ha pintado.
  const pedidas = (): Promise<string[]> =>
    page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname),
    );
  const ficha = (id: string): string => `#edicion article[data-clave-de-ficha="unidad:${id}"]`;
  const d2 = (id: string): string => `/unidades/${id}/d2/atlas.webp`;
  const girar = async (id: string): Promise<void> => {
    if ((await pedidas()).includes(d2(id)))
      throw new Error(`edición: ${d2(id)} ya estaba pedida antes de girar: no prueba nada`);
    await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === d2(id), { timeout: 5000 }),
      page.locator(`${ficha(id)} [data-arena="girar"]`).click(),
    ]).catch((err: unknown) => {
      throw new Error(`edición: girar la ficha de ${id} no la ha girado: ${String(err)}`);
    });
  };
  await girar('templario-escudo');
  if ((await pedidas()).includes(d2('templario-monje')))
    throw new Error('edición: girar la ficha del templario ha girado también la del monje');
  await girar('templario-monje');
  log('edición: girar una ficha gira la suya y no la de al lado');

  // Un campo cambia SU ficha, el foco sigue en la misma ficha tras repintar, y
  // la vista no vuelve arriba: un cambio repinta solo su ficha. La lista va
  // desplegada encima, así que escribir en el campo ya desplaza la vista hasta
  // él: se mide desde ahí.
  const lista = page.locator('#edicion');
  const monjeAntes = await page
    .locator(`${ficha('templario-monje')} [data-campo="attack"]`)
    .inputValue();
  const ataque = page.locator(`${ficha('templario-escudo')} [data-campo="attack"]`);
  const ataqueAntes = await ataque.inputValue();
  const nuevo = String(Number(ataqueAntes) + 3);
  await ataque.fill(nuevo);
  const bajada = await lista.evaluate((e) => e.scrollTop);
  if (bajada === 0) throw new Error('edición: la vista no se desplaza: no se puede probar');
  await ataque.press('Tab');
  // Un cambio que entra deja la barra vacía; uno rechazado diría «No se cambia: …».
  await esperarBarra(page, '', 'edición: cambiar el ataque del templario', { exacta: true });
  await asentada(page);
  const foco = await page.evaluate(() => {
    const a = document.activeElement;
    return `${a?.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha')} ${a?.getAttribute('data-campo')}`;
  });
  if (foco !== 'unidad:templario-escudo fuerza')
    throw new Error(`edición: tras cambiar el ataque, el foco está en «${foco}»`);
  const trasElCambio = await lista.evaluate((e) => e.scrollTop);
  if (trasElCambio !== bajada)
    throw new Error(`edición: un cambio ha movido la vista de ${bajada} a ${trasElCambio}`);
  if (
    (await page.locator(`${ficha('templario-escudo')} [data-campo="attack"]`).inputValue()) !==
    nuevo
  )
    throw new Error('edición: el ataque del templario no se ha quedado en el nuevo');
  if (
    (await page.locator(`${ficha('templario-monje')} [data-campo="attack"]`).inputValue()) !==
    monjeAntes
  )
    throw new Error('edición: cambiar el templario ha cambiado el monje');
  // Lo ilegal no entra, y se dice.
  const vida = page.locator(`${ficha('templario-monje')} [data-campo="hp"]`);
  const vidaAntes = await vida.inputValue();
  await vida.fill('0');
  await vida.press('Tab');
  await esperarBarra(page, 'No se cambia:', 'edición: una vida de 0', { exacta: false });
  await asentada(page);
  if ((await vida.inputValue()) !== vidaAntes)
    throw new Error('edición: una vida de 0 se ha quedado en la ficha');
  log('edición: un campo cambia su ficha (y solo ella se repinta) y lo ilegal no entra');

  // De vuelta: el montaje como estaba, con el ataque nuevo.
  await page.locator('[data-arena="volver-de-edicion"]').click();
  await page.locator('#app[data-escena="montaje"]').waitFor({ timeout: 2000 });
  if ((await page.locator('#muralla .hex.muro').count()) !== murosAntes)
    throw new Error('edición: al volver, la muralla es otra');
  if (page.url() !== urlAntes) throw new Error(`edición: al volver, la URL es otra: ${page.url()}`);
  const bandosDespues = await bandosDichos(page);
  // El templario va el primero: su «A n ·» es el primero de los bandos. La tarjeta
  // dice el ataque con el que pelea, el de su cuerpo (el campo) más el de su espada.
  const conLaEspada = (a: string): number => ataqueEnLaPelea(Number(a));
  const bandosConElAtaque = bandosAntes.replace(
    `A ${conLaEspada(ataqueAntes)} ·`,
    `A ${conLaEspada(nuevo)} ·`,
  );
  if (bandosDespues !== bandosConElAtaque)
    throw new Error(
      `edición: al volver, los bandos son otros:\n${bandosAntes}\n=====\n${bandosDespues}`,
    );
  await page.locator('#bando-izquierda button.ver[data-unidad="templario-escudo"]').click();
  if ((await page.locator('#ficha [data-campo="attack"]').inputValue()) !== nuevo)
    throw new Error('edición: la ficha del montaje no enseña el ataque cambiado');
  log('edición: de vuelta, el montaje sigue como estaba y lleva el ataque nuevo');

  // Otra vez a la edición: las mismas, en su orden; y cerrar una deja las demás.
  await page.locator('[data-arena="ir-a-edicion"]').click();
  const orden = (): Promise<(string | null)[]> =>
    page
      .locator('#edicion .ficha-abierta')
      .evaluateAll((xs) => xs.map((x) => x.getAttribute('data-clave-de-ficha')));
  const abiertas = await orden();
  const esperadas = [
    'unidad:templario-escudo',
    'unidad:templario-monje',
    'unidad:caballero-de-la-muerte',
    'unidad:elfo-arquero',
    'unidad:esqueleto-guerrero',
    'unidad:zombi',
  ];
  if (abiertas.join() !== esperadas.join())
    throw new Error(`edición: al volver a entrar están abiertas ${abiertas.join(', ')}`);
  await page.locator(`${ficha('templario-monje')} [data-arena="cerrar-ficha"]`).click();
  const quedan = await orden();
  if (quedan.join() !== esperadas.filter((x) => x !== 'unidad:templario-monje').join())
    throw new Error(`edición: al cerrar el monje quedan ${quedan.join(', ')}`);
  if (
    (await page.locator('#edicion [data-arena="plegar-lista"][aria-expanded="false"]').count()) > 0
  )
    throw new Error('edición: cerrar una ficha ha plegado la lista');
  log('edición: al volver, las mismas abiertas; cerrar una deja las demás y la lista como estaba');

  // El nombre, por su «✎» en el título: Intro lo guarda —en la ficha y en el
  // montaje—, Escape deja el de antes. Entre las cifras ya no hay campo de nombre.
  const escudo = ficha('templario-escudo');
  if ((await page.locator(`${escudo} .cifras [data-campo="name"]`).count()) > 0)
    throw new Error('edición: el nombre sigue entre las cifras');
  const nombreAntes = await page.locator(`${escudo} .titulo-de-ficha .nombre`).innerText();
  await page.locator(`${escudo} [data-arena="renombrar"]`).click();
  const campoDelNombre = page.locator(`${escudo} input.renombrar`);
  const listo = await campoDelNombre.evaluate(
    (e: HTMLInputElement) =>
      document.activeElement === e && e.selectionStart === 0 && e.selectionEnd === e.value.length,
  );
  if (!listo) throw new Error('edición: «✎» no deja el nombre enfocado y seleccionado');
  /** El título vuelve a ser el nombre, y es `texto`. */
  const tituloEs = async (texto: string, tras: string): Promise<void> => {
    const titulo = page.locator(`${escudo} .titulo-de-ficha .nombre`);
    await page
      .waitForFunction(
        ([sel, t]) => document.querySelector(sel as string)?.textContent === t,
        [`${escudo} .titulo-de-ficha .nombre`, texto] as const,
        { timeout: 2000 },
      )
      .catch(async () => {
        const hay = (await titulo.count()) === 0 ? 'el campo, aún' : await titulo.innerText();
        throw new Error(`edición: tras ${tras}, el título dice «${hay}», no «${texto}»`);
      });
  };
  await campoDelNombre.fill('Escudo de prueba');
  await campoDelNombre.press('Enter');
  await tituloEs('Escudo de prueba', 'Intro');
  await page.locator(`${escudo} [data-arena="renombrar"]`).click();
  await page.locator(`${escudo} input.renombrar`).fill('No se queda');
  await page.locator(`${escudo} input.renombrar`).press('Escape');
  await tituloEs('Escudo de prueba', 'Escape');
  // Un rasgo por su desplegable y su etiqueta: se pone «vuela» y se quita «no-muerto»
  // del esqueleto del catálogo (su prueba).
  await page.locator(`${escudo} select[data-arena-rasgo]`).selectOption('flying');
  await page
    .locator(`${escudo} [data-arena="quitar-rasgo"][data-rasgo="flying"]`)
    .waitFor({ timeout: 2000 });
  if ((await page.locator(`${escudo} select[data-arena-rasgo] option[value="flying"]`).count()) > 0)
    throw new Error('edición: «vuela» sigue en el desplegable tras ponerlo');
  // Quitar con el teclado (M2 de QA): el foco sigue en la ficha, en el × de la
  // etiqueta siguiente y, sin ninguna detrás, en su «Añadir». Antes caía al `body`.
  const focoEn = (): Promise<string> =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (a === null || a === document.body) return 'body';
      const f = a.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha');
      const que =
        a.getAttribute('data-arena') ??
        (a.hasAttribute('data-arena-rasgo') ? 'añadir-rasgo' : null) ??
        (a.hasAttribute('data-arena-habilidad') ? 'añadir-habilidad' : a.tagName);
      return `${f} ${que} ${a.getAttribute('data-rasgo') ?? a.getAttribute('data-habilidad') ?? ''}`.trim();
    });
  const conElTeclado = async (sel: string, esperado: string, que: string): Promise<void> => {
    await page.locator(sel).focus();
    await page.keyboard.press('Enter');
    await asentada(page);
    const ahora = await focoEn();
    if (ahora !== esperado)
      throw new Error(
        `edición: tras quitar ${que} con Intro el foco está en «${ahora}», no en «${esperado}»`,
      );
  };
  await page.locator(`${escudo} select[data-arena-rasgo]`).selectOption('no_retaliation');
  await conElTeclado(
    `${escudo} [data-arena="quitar-rasgo"][data-rasgo="flying"]`,
    'unidad:templario-escudo quitar-rasgo no_retaliation',
    '«vuela» (con otro detrás)',
  );
  await conElTeclado(
    `${escudo} [data-arena="quitar-rasgo"][data-rasgo="no_retaliation"]`,
    'unidad:templario-escudo añadir-rasgo',
    'el último rasgo',
  );
  const habilidad = await page
    .locator(`${escudo} select[data-arena-habilidad] option`)
    .last()
    .getAttribute('value');
  if (habilidad === null || habilidad === '')
    throw new Error('edición: no hay habilidad que poner');
  await page.locator(`${escudo} select[data-arena-habilidad]`).selectOption(habilidad);
  await conElTeclado(
    `${escudo} [data-arena="quitar-habilidad"][data-habilidad="${habilidad}"]`,
    'unidad:templario-escudo añadir-habilidad',
    `la habilidad «${habilidad}», la última de su grupo`,
  );
  // Y otra vez «vuela», que el montaje enseña más abajo.
  await page.locator(`${escudo} select[data-arena-rasgo]`).selectOption('flying');
  await page
    .locator(`${escudo} [data-arena="quitar-rasgo"][data-rasgo="flying"]`)
    .waitFor({ timeout: 2000 });
  log(
    'edición: quitar un rasgo o una habilidad con Intro deja el foco en la siguiente o en «Añadir»',
  );
  // Con el ratón, el foco no se lleva a ningún sitio (como `pintar`).
  const esqueleto = '#edicion article[data-clave-de-ficha="unidad:esqueleto-guerrero"]';
  await page.locator(`${esqueleto} [data-arena="quitar-rasgo"][data-rasgo="undead"]`).click();
  await page
    .locator(`${esqueleto} [data-arena="quitar-rasgo"]`)
    .first()
    .waitFor({ state: 'detached', timeout: 2000 })
    .catch(() => {
      throw new Error('edición: el esqueleto sigue con su rasgo tras quitarlo');
    });
  if ((await focoEn()) !== 'body')
    throw new Error(`edición: quitar con el ratón ha llevado el foco a «${await focoEn()}»`);
  await page.locator('[data-arena="volver-de-edicion"]').click();
  // El bando lleva el nombre y «vuela» en el resumen (y la escalera dice que no la usa).
  const conNombre = await bandosDichos(page);
  const resumenConVuela = new RegExp(
    `Escudo de prueba\\n[\\s\\S]*?A ${conLaEspada(nuevo)} · [^\\n]* casillas · vuela · lleva [^\\n]*\\n`,
  );
  if (!conNombre.includes('Escudo de prueba') || !resumenConVuela.test(conNombre))
    throw new Error(`edición: el montaje no lleva el nombre y el rasgo:\n${conNombre}`);
  // Y se quita por su etiqueta, también en la ficha del montaje.
  await page.locator('#ficha [data-arena="quitar-rasgo"][data-rasgo="flying"]').click();
  if ((await bandosDichos(page)) !== bandosConElAtaque.replace(nombreAntes, 'Escudo de prueba'))
    throw new Error('edición: quitar «vuela» en el montaje no lo quita del bando');
  await page.locator('[data-arena="ir-a-edicion"]').click();
  log(
    'edición: «✎» + Intro cambia el nombre (Escape no) y un rasgo se pone y se quita por su etiqueta, hasta el montaje',
  );

  // Y al recargar la página, la misma vista —la edición va en la URL, `?vista=edicion`
  // («La arena recuerda la vista al recargar», 23-10-2026, `7bd54662`)— y las mismas
  // fichas abiertas (`localStorage`, de comodidad). Antes de eso se volvía al montaje y
  // la pasada pulsaba «Editar fichas», que en la edición no se ve.
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .locator('#app[data-escena="edicion"]')
    .waitFor({ timeout: 5000 })
    .catch(() => {
      throw new Error(`edición: al recargar no vuelve a la edición (${page.url()})`);
    });
  if (new URL(page.url()).searchParams.get('vista') !== 'edicion')
    throw new Error(`edición: la dirección no lleva la vista: ${page.url()}`);
  await page.locator('[data-unidad-catalogo]').first().waitFor({ timeout: 5000 });
  const recargadas = await orden();
  if (recargadas.join() !== quedan.join())
    throw new Error(`edición: al recargar están abiertas ${recargadas.join(', ')}`);
  log('edición: al recargar, la misma vista y las mismas abiertas');

  // Cerrar con el teclado (H4): el foco pasa al × de la de al lado —la
  // siguiente, o la anterior si era la última— y, sin ninguna, al «Abrir» de la
  // que se cerró. Se llega al primer × con el tabulador, como quien no usa ratón.
  const enfocado = (): Promise<string> =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (a === null || a === document.body) return 'body';
      const ficha = a.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha');
      return `${a.getAttribute('data-arena')} ${ficha ?? a.getAttribute('data-unidad')}`;
    });
  await page.locator(`${ficha('templario-escudo')} [data-arena-habilidad]`).focus();
  await page.keyboard.press('Tab');
  if ((await enfocado()) !== 'cerrar-ficha unidad:caballero-de-la-muerte')
    throw new Error(
      `edición: el tabulador no llega al × de la ficha siguiente: ${await enfocado()}`,
    );
  const tras = [
    'cerrar-ficha unidad:elfo-arquero',
    'cerrar-ficha unidad:esqueleto-guerrero',
    'cerrar-ficha unidad:zombi',
    'cerrar-ficha unidad:templario-escudo',
    'abrir-ficha templario-escudo',
  ];
  for (const esperado of tras) {
    await page.keyboard.press('Enter');
    await asentada(page);
    const ahora = await enfocado();
    if (ahora !== esperado)
      throw new Error(
        `edición: tras cerrar con Intro el foco está en «${ahora}», no en «${esperado}»`,
      );
  }
  log('edición: cerrar con el teclado deja el foco en la de al lado y, sin ninguna, en su «Abrir»');
  await page.close();
}
