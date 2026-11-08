/**
 * La pasada «equipo» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): «Editar equipo» de la arena.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import type { Browser } from 'playwright';
import { LA_LLEVA_EL_HEROE } from '../../../../src/client/arena/paneles/equipo.js';
import { EQUIPO_DEL_JUEGO } from '../../../../src/core/equipo/atado.js';
import { leerCatalogo } from '../../../arena/borrador.js';
import { abrirLaArena, asentada, cifrasSinCortar, esperarBarra } from '../arena.js';
import { captura, log, type Problemas, vigilarConsola } from '../pagina.js';

// ------------------------------------------------------------------------ editor de equipo

/**
 * El editor de equipo de la arena, con clics de verdad: abrir la vista (cuatro
 * secciones por tipo, solo las de la arena), crear una pieza sobre la Espada y
 * ver que cambiar la Espada la cambia, ver la rueda de la Maza, crear una pieza,
 * guardarla y verla en la ficha de una unidad. Las reglas (lo que se rechaza, las
 * bases, el enlace, a media pelea) las prueban `test/arena-equipo.test.ts` y
 * `test/equipo-bases.test.ts`.
 */
export async function equipoDeLaArena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'equipo', problemas);
  await abrirLaArena(page, url, '?seed=7');
  await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
  await page.locator('[data-arena="ir-a-equipo"]').first().click();
  await page.locator('#app[data-escena="equipo"]').waitFor({ timeout: 2000 });
  // Por tipos (18-10-2026), y el catálogo entero: una sola clase de piezas.
  const secciones = await page
    .locator('[data-seccion-de-equipo]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-seccion-de-equipo')));
  if (
    JSON.stringify(secciones) !==
    JSON.stringify(['cuerpo', 'distancia', 'armadura', 'escudo', 'montura'])
  )
    throw new Error(`equipo: las secciones son ${JSON.stringify(secciones)}`);
  const enLaLista = await page.locator('#equipo [data-arena="elegir-pieza"]').count();
  if (enLaLista !== EQUIPO_DEL_JUEGO.piezas.size)
    throw new Error(
      `equipo: el editor enseña ${enLaLista} piezas y el catálogo tiene ${EQUIPO_DEL_JUEGO.piezas.size}`,
    );
  log('equipo: cinco secciones por tipo, con el catálogo entero');
  // La Espada: sin PV y con un precio, en oro.
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="espada"]').click();
  const fichaDeLaEspada = page.locator('#equipo [data-pieza-elegida="espada"]');
  await fichaDeLaEspada.waitFor({ timeout: 2000 });
  if (
    (await fichaDeLaEspada.locator('[data-arena-pieza-campo="pv"]').count()) > 0 ||
    (await fichaDeLaEspada.locator('[data-arena-pieza-campo^="precio-"]').count()) !== 1
  )
    throw new Error('equipo: la ficha de la Espada tiene PV o más de un precio');
  // La lleva también el héroe (H3 del QA 2): es de su equipo base, el de todo héroe
  // del juego y de la arena desde que son uno (19-10-2026).
  const llevanLaEspada = await fichaDeLaEspada.locator('[data-la-llevan]').innerText();
  if (!llevanLaEspada.includes(LA_LLEVA_EL_HEROE))
    throw new Error(`equipo: «La llevan» de la Espada no cuenta al héroe: «${llevanLaEspada}»`);
  // «Nueva sobre esta»: la nueva dice su cadena.
  await page.locator('#equipo [data-arena="crear-pieza-sobre"]').click();
  const sobre = page.locator('#equipo [data-pieza-elegida="espada-2"]');
  await sobre.waitFor({ timeout: 2000 });
  const cadena = (await sobre.locator('[data-cadena-de-bases]').innerText()).trim();
  if (cadena !== 'Espada → Espada 2') throw new Error(`equipo: la cadena dice «${cadena}»`);
  // Subir la fuerza de la Espada cambia la que está sobre ella. Era su daño máximo
  // hasta que un arma dejó de llevar daño y suma fuerza (fuerza, agilidad y peso,
  // 25-10-2026, `99132e20`: el campo `danio-max` ya no existe).
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="espada"]').click();
  const fuerza = page.locator(
    '#equipo [data-pieza-elegida="espada"] [data-arena-pieza-campo="fuerza"]',
  );
  const subida = String((EQUIPO_DEL_JUEGO.pieza('espada').fuerza ?? 0) + 4);
  await fuerza.fill(subida);
  await fuerza.press('Tab');
  await asentada(page);
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="espada-2"]').click();
  const final = (await sobre.locator('[data-final="fuerza"]').innerText()).trim();
  if (final !== subida)
    throw new Error(`equipo: la de encima de la Espada suma «${final}» de fuerza, no ${subida}`);
  await sobre.scrollIntoViewIfNeeded();
  await asentada(page);
  await captura(page, 'arena-12-equipo-sobre-la-espada');
  log('equipo: «Nueva sobre esta» de la Espada, y subir la Espada la cambia');
  // La rueda de la Maza, por niveles absolutos (vuelta 2): Fuerte en el 5 → ×1,83.
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="maza"]').click();
  /** La fila de un tipo en la rueda de la Maza. */
  const deLaMaza = (tipo: string) =>
    page.locator(`#equipo [data-pieza-elegida="maza"] .barra-de-la-rueda[data-tipo="${tipo}"]`);
  const fuerte = deLaMaza('fuerte').locator('[data-final="rueda-fuerte"]');
  await fuerte.waitFor({ timeout: 2000 });
  if ((await fuerte.innerText()).trim() !== 'Daño ×1,83')
    throw new Error(`equipo: la rueda de la Maza dice «${await fuerte.innerText()}»`);
  if ((await page.locator('#equipo [data-tipo="normal"].barra-de-la-rueda').count()) > 0)
    throw new Error('equipo: la rueda de la Maza tiene fila de Normal');
  await page.locator('#equipo [data-rueda-de-la-pieza]').scrollIntoViewIfNeeded();
  await asentada(page);
  await cifrasSinCortar(page, '#equipo .equipo-ficha', 'equipo, ficha de la Maza');
  await captura(page, 'arena-12-equipo-rueda-de-la-maza');
  log('equipo: la Maza enseña su rueda por niveles (Fuerte 5, ×1,83), sin Normal');
  // La Finta de la Maza, en el 1 (resta 3 a 7): «+» sube un nivel, la barra
  // crece a la derecha y resta menos; «−» la deja como estaba.
  const finta = deLaMaza('finta');
  const fintaDice = async () =>
    `${await finta.locator('.barra').getAttribute('data-nivel')} ${(await finta.locator('.final').innerText()).trim()}`;
  if ((await fintaDice()) !== '1 resta 3 a 7 casillas')
    throw new Error(`equipo: la Finta de la Maza empieza en «${await fintaDice()}»`);
  await finta.locator('[data-sentido="1"]').click();
  await asentada(page);
  if ((await fintaDice()) !== '2 resta 2 a 6 casillas')
    throw new Error(`equipo: tras «+», la Finta de la Maza dice «${await fintaDice()}»`);
  const sector = await page
    .locator('#equipo [data-pieza-elegida="maza"] .rueda-de-la-pieza [data-sector="finta"]')
    .getAttribute('data-nivel');
  if (sector !== '2') throw new Error(`equipo: el sector de la Finta sigue en el nivel ${sector}`);
  await captura(page, 'arena-12-equipo-finta-mas');
  await finta.locator('[data-sentido="-1"]').click();
  await asentada(page);
  if ((await fintaDice()) !== '1 resta 3 a 7 casillas')
    throw new Error(`equipo: tras «−», la Finta de la Maza dice «${await fintaDice()}»`);
  log('equipo: «+» en la Finta sube un nivel y resta menos (2 a 6), y «−» la devuelve');
  // Un arma a distancia nueva no lleva «Disparos»: llevarla ya es disparar (13-10-2026).
  await page.locator('[data-arena="crear-pieza"][data-hueco="distancia"]').click();
  await page
    .locator('#equipo [data-pieza-elegida] [data-arena-pieza-campo="nombre"]')
    .waitFor({ timeout: 2000 });
  const fichaDeLaPieza = await page.locator('#equipo [data-pieza-elegida]').innerText();
  if (
    /Disparos/.test(fichaDeLaPieza) ||
    (await page.locator('#equipo [data-arena-pieza-campo="disparos"]').count()) > 0
  ) {
    throw new Error('equipo: el arma a distancia nueva aún tiene el campo «Disparos»');
  }
  log('equipo: un arma a distancia nueva, sin campo «Disparos»');
  await page.locator('[data-arena="crear-pieza"][data-hueco="arma"]').click();
  const nombre = page.locator('#equipo [data-pieza-elegida] [data-arena-pieza-campo="nombre"]');
  await nombre.fill('Hoja de pruebas');
  await nombre.press('Tab');
  await asentada(page);
  await captura(page, 'arena-12-equipo');
  await page.locator('[data-arena="guardar"]').click();
  await esperarBarra(page, 'Guardado', 'equipo: guardar', { exacta: false });
  const enDisco = leerCatalogo(process.cwd()).piezas.map((p) => p.nombre);
  if (!enDisco.includes('Hoja de pruebas'))
    throw new Error(`equipo: guardar no deja la pieza en disco (${enDisco.join(', ')})`);
  log('equipo: pieza creada, nombrada y guardada');
  await page.locator('[data-arena="volver-de-equipo"]').click();
  await page.locator('#bando-izquierda [data-arena="editar"]').first().click();
  const opcion = page.locator('#ficha [data-arena-pieza="arma"] option', {
    hasText: 'Hoja de pruebas',
  });
  await page
    .locator('#ficha [data-arena-pieza="arma"]')
    .selectOption((await opcion.getAttribute('value')) ?? '');
  await page
    .locator('#bando-izquierda .puesto .cost')
    .first()
    .filter({ hasText: 'lleva Hoja de pruebas' })
    .waitFor({ timeout: 2000 });
  log('equipo: la ficha de la unidad la ofrece y la tarjeta la lleva');
  // Lo que el núcleo rechazaría no se ofrece (H3 del QA 2): la × del arma de
  // cuerpo a cuerpo.
  const ficha = page.locator('#ficha');
  if (
    (await ficha.locator('[data-arena="quitar-pieza"][data-hueco="arma"]').count()) > 0 ||
    (await ficha.locator('[data-no-se-quita="arma"]').count()) !== 1
  )
    throw new Error('equipo: la ficha de la unidad ofrece lo que el núcleo rechaza');
  // El héroe dice con qué arma pelea.
  await page.locator('[data-arena="poner-heroe"][data-lado="izquierda"]').click();
  const armaDelHeroe = (
    await ficha.locator('[data-armas-del-heroe] [data-arma-de-la-ficha="arma"]').innerText()
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (!armaDelHeroe.includes('Espada ·'))
    throw new Error(`equipo: la ficha del héroe dice «${armaDelHeroe}» de su arma`);
  await ficha.locator('[data-armas-del-heroe]').scrollIntoViewIfNeeded();
  await asentada(page);
  await captura(page, 'arena-12-equipo-ficha-del-heroe');
  log(`equipo: la ficha no ofrece lo que se rechaza y el héroe dice su arma (${armaDelHeroe})`);
  await page.close();
}
