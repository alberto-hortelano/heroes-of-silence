/**
 * Los temas con sus piezas puestas, medidos en el navegador (afinado del
 * 18-10-2026, `docs/agents/2026-10-13-temas-de-las-laminas/hallazgos-afinado.md`):
 *
 *     npx tsx tools/qa/temas-con-piezas.ts [carpeta de capturas]
 *
 * En la partida (`?seed=42644`), con cada tema puesto desde la página
 * (`ponerTema`: el juego solo tiene caballero y nigromante) y sin tema, mide:
 *
 * 1. **El rótulo de cada barra de sección sobre su pieza**: el contraste WCAG de
 *    la tinta (`color` computado) sobre los píxeles de la barra **bajo cada
 *    letra**. Se hacen dos fotos de la barra, con el rótulo y con el rótulo
 *    transparente: donde difieren está la letra, y lo que hay ahí en la segunda
 *    es lo que la letra tapa. Se da la mediana y el peor décimo. Tiene que dar
 *    ≥ 4,5 en la mediana (son 12 px: no es texto grande).
 * 2. **El lienzo**: la caja de `#canvas` en cada ventana de `LIENZO`, la misma
 *    con cada tema que sin él, y la anotada: el mapa ocupa todo el ancho que deja
 *    el panel en cualquier ventana (sin figuras en los márgenes desde el
 *    18-10-2026: `docs/historia.md`).
 * 3. **Cuánto tapan del mapa** el marco (lo que su banda entra sobre lo que se
 *    ve del mapa, por lado), el remate y la cartela (desde el borde de arriba de
 *    lo que se ve), con su tope (`TAPA_COMO_MUCHO`): sin él, la moldura crecía
 *    con el alto de la ventana y en una vertical de 1080×1920 tapaba 62 px por el
 *    pie (QA v3, V3-2). Por eso se mide también en 1080×1920 y en 2560×1440.
 * 4. **La luz del margen** a 1920: la mediana (luma Rec. 709) del borde de la
 *    ventana al marco del mapa, de arriba abajo de `#stage`, frente a la franja
 *    x 0-75 de la lámina, que es como la midió QA en su vuelta 2 (`qa.md`). Sin
 *    las figuras es la franja de `#stage` que no tapa el marco (2 px a 1920): el
 *    color del escenario con su textura, que es lo que pinta todo el hueco.
 *
 * Y si se le da una carpeta, deja las capturas lado a lado con la lámina
 * (`afinado-<tema>-<ancho>.png`) a 1440 y 1920 y la del móvil
 * (`afinado-movil-390.png`). Sale con 1 si algo no cumple, si hay un error de
 * consola o una petición ≥ 400.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import { FACTION_IDS } from '../../src/core/types.js';
import { arrancarVite, chromiumInstalado, esperarElSuelo, matarGrupo } from './vite-propio.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const TEMAS = FACTION_IDS;
type Tema = (typeof TEMAS)[number];

/**
 * La caja de `#canvas` [x, y, ancho, alto] que no se mueve, con tema y sin él: la
 * de `implementacion.md` (tanda B, 13-10-2026) y, la vertical y la de 2560, la del
 * neutro del 18-10-2026. En el escritorio, el ancho es el de la ventana menos 360
 * (el panel de 19rem, el relleno, el hueco y el borde del mapa).
 */
const LIENZO: Record<string, number[]> = {
  '390x844': [13, 127, 364, 513],
  '1440x900': [21, 58, 1080, 770],
  '1820x1000': [21, 58, 1460, 870],
  '1920x1080': [21, 58, 1560, 950],
  '1080x1920': [21, 58, 720, 1790],
  '2560x1440': [21, 58, 2200, 1310],
};
/**
 * Lo que pueden tapar del mapa, en px CSS desde el borde de lo que se ve: el
 * marco por los costados (y por arriba) y por el pie, que en las piezas es más
 * grueso, y el remate y la cartela (QA v3, V3-2 y V3-3). Son los de `forma.css`
 * (`--tapa-el-costado`, `--tapa-el-pie` y los 64 de `--tope`), escritos aquí
 * otra vez a propósito: esto mide lo pintado, no lee la hoja.
 */
const TAPA_COMO_MUCHO = { costado: 24, pie: 32, remate: 64, cartela: 64 } as const;
const CONTRASTE_MINIMO = 4.5;
/**
 * La luz del margen frente a la lámina: ±15 (QA, vuelta 2), salvo el imperio, que
 * se quedó a −19 por decisión del coordinador (opción c: casi negro, como detrás
 * de las figuras de su lámina, no el pardo de +13 que dejó la textura del marco
 * sin neutralizar): de −22 (la cifra con la luz de la lámina que midió QA) a −12.
 */
const LUZ_DEL_MARGEN: Record<Tema, readonly [number, number]> = {
  templarios: [-15, 15],
  'no-muertos': [-15, 15],
  imperio: [-22, -12],
  elfos: [-15, 15],
  orkos: [-15, 15],
};

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const lineal = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminancia = (r: number, g: number, b: number): number =>
  0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
const contraste = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const mediana = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? Number.NaN;
};
const percentil = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)] ?? Number.NaN;
};

async function crudo(png: Buffer): Promise<{ data: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** La luz mediana de la franja x 0-75 de la lámina, de arriba abajo (la de QA). */
async function luzDeLaLamina(tema: Tema): Promise<number> {
  const { data, w, h } = await crudo(
    await sharp(join(RAIZ, `assets/art/temas/${tema}.png`))
      .png()
      .toBuffer(),
  );
  const ls: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < 76; x++) {
      const i = (y * w + x) * 3;
      ls.push(luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0));
    }
  return mediana(ls);
}

async function ponerTema(page: Page, tema: Tema | null): Promise<void> {
  await page.evaluate(async (t: string | null) => {
    // El módulo lo sirve el vite de la página; la ruta, en una variable para que
    // TypeScript no la busque en el disco.
    const ruta = '/temas.ts';
    const m = (await import(/* @vite-ignore */ ruta)) as {
      ponerTema: (t: string) => void;
      letrasListas: () => Promise<void>;
    };
    if (t === null) {
      delete document.documentElement.dataset.tema;
      return;
    }
    m.ponerTema(t);
    await m.letrasListas();
  }, tema);
  // Las piezas son imágenes: se espera a que todas las de la página estén.
  await page.evaluate(async () => {
    const urls = new Set<string>();
    for (const el of document.querySelectorAll('*'))
      for (const ps of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, ps || null);
        for (const v of [cs.backgroundImage, cs.borderImageSource])
          for (const m of v.matchAll(/url\("([^"]+)"\)/g)) urls.add(m[1] as string);
      }
    await Promise.all(
      [...urls].map(
        (u) =>
          new Promise<void>((ok) => {
            const i = new Image();
            i.onload = () => ok();
            i.onerror = () => ok();
            i.src = u;
          }),
      ),
    );
  });
  await page.waitForTimeout(300);
}

/** El contraste de cada rótulo de sección visible sobre lo que tiene debajo. */
async function rotulos(page: Page): Promise<{ texto: string; mediana: number; peor: number }[]> {
  const n = await page.locator('#side h3').count();
  const out: { texto: string; mediana: number; peor: number }[] = [];
  for (let k = 0; k < n; k++) {
    const h3 = page.locator('#side h3').nth(k);
    if (!(await h3.isVisible())) continue;
    await h3.scrollIntoViewIfNeeded();
    const { texto, tinta } = await h3.evaluate((el) => {
      const c = getComputedStyle(el).color;
      return { texto: el.textContent ?? '', tinta: c };
    });
    const con = await crudo(await h3.screenshot());
    await h3.evaluate((el) => {
      (el as HTMLElement).style.setProperty('color', 'transparent', 'important');
    });
    const sin = await crudo(await h3.screenshot());
    await h3.evaluate((el) => (el as HTMLElement).style.removeProperty('color'));
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(tinta);
    if (m === null) throw new Error(`el rótulo «${texto}» no tiene un color que se lea: ${tinta}`);
    const lt = luminancia(Number(m[1]), Number(m[2]), Number(m[3]));
    const cs: number[] = [];
    for (let i = 0; i < Math.min(con.data.length, sin.data.length); i += 3) {
      const d =
        Math.abs((con.data[i] ?? 0) - (sin.data[i] ?? 0)) +
        Math.abs((con.data[i + 1] ?? 0) - (sin.data[i + 1] ?? 0)) +
        Math.abs((con.data[i + 2] ?? 0) - (sin.data[i + 2] ?? 0));
      // Solo el cuerpo de la letra: lo que cambia mucho (el borde suavizado, no).
      if (d < 60) continue;
      cs.push(
        contraste(lt, luminancia(sin.data[i] ?? 0, sin.data[i + 1] ?? 0, sin.data[i + 2] ?? 0)),
      );
    }
    if (cs.length === 0) throw new Error(`el rótulo «${texto}» no pinta ni un píxel`);
    out.push({ texto: texto.trim(), mediana: mediana(cs), peor: percentil(cs, 0.1) });
  }
  // El panel, otra vez arriba: la captura del tema siguiente lo enseña desde el principio.
  await page.evaluate(() => {
    (document.getElementById('lateral') as HTMLElement).scrollTop = 0;
  });
  return out;
}

/** La caja del lienzo, lo que tapan del mapa el marco y los adornos, y los ids que no se ven. */
const medir = (page: Page) =>
  page.evaluate(() => {
    const r = (el: Element | null) => {
      if (el === null) return null;
      const b = el.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map(Math.round);
    };
    const mapa = document.getElementById('lienzo') as HTMLElement;
    const cm = getComputedStyle(mapa);
    const borde = Number.parseFloat(cm.borderTopWidth);
    const mr = mapa.getBoundingClientRect();
    // Lo que se ve del mapa: dentro de su borde.
    const visto = {
      top: mr.top + borde,
      bottom: mr.bottom - borde,
      left: mr.left + borde,
      right: mr.right - borde,
    };
    const ad = document.querySelector('.adornos-del-mapa') as HTMLElement;
    const ca = getComputedStyle(ad);
    const visible = ca.display !== 'none';
    let marco: number[] | null = null;
    let remate: number | null = null;
    let cartela: number | null = null;
    if (visible) {
      const ar = ad.getBoundingClientRect();
      // La banda del marco: la que pinta el adorno (encima del lienzo), si tiene imagen.
      if (ca.borderImageSource !== 'none') {
        const salida = Number.parseFloat(ca.borderImageOutset);
        const anchos = ca.borderImageWidth.split(/\s+/).map(Number.parseFloat);
        const [a, d, b, i] = [
          anchos[0],
          anchos[1] ?? anchos[0],
          anchos[2] ?? anchos[0],
          anchos[3] ?? anchos[1] ?? anchos[0],
        ] as number[];
        // Lo que entra: desde el borde de fuera de la banda (la caja más su salida) hasta lo visto.
        marco = [
          ar.top - salida + (a as number) - visto.top,
          visto.right - (ar.right + salida - (d as number)),
          visto.bottom - (ar.bottom + salida - (b as number)),
          ar.left - salida + (i as number) - visto.left,
        ].map((v) => Math.max(0, Math.round(v * 10) / 10));
      }
      const re = ad.querySelector('.remate') as HTMLElement;
      const rr = re.getBoundingClientRect();
      remate = Math.round(rr.bottom - visto.top);
      // La cartela es uno o dos pseudoelementos de `.cartela`.
      const cartelaEl = ad.querySelector('.cartela') as HTMLElement;
      const cr = cartelaEl.getBoundingClientRect();
      let fondo = Number.NEGATIVE_INFINITY;
      for (const ps of ['::before', '::after']) {
        const cs = getComputedStyle(cartelaEl, ps);
        if (cs.content === 'none' || cs.display === 'none') continue;
        const top = Number.parseFloat(cs.top);
        const alto = Number.parseFloat(cs.height);
        if (Number.isFinite(top) && Number.isFinite(alto))
          fondo = Math.max(fondo, cr.top + top + alto);
      }
      cartela = Number.isFinite(fondo) ? Math.round(fondo - visto.top) : null;
    }
    return {
      lienzo: r(document.getElementById('canvas')),
      marco,
      remate,
      cartela,
      herramientas: r(document.querySelector('.map-tools')),
      visto: [visto.left, visto.top, visto.right, visto.bottom].map(Math.round),
      anchoDePagina: document.documentElement.scrollWidth,
    };
  });

/** La luz mediana del margen izquierdo de una captura: de la ventana al marco del mapa. */
async function luzDelMargen(page: Page, png: Buffer): Promise<{ luz: number; ancho: number }> {
  const caja = await page.evaluate(() => {
    const s = (document.getElementById('stage') as HTMLElement).getBoundingClientRect();
    const m = (document.getElementById('lienzo') as HTMLElement).getBoundingClientRect();
    // El borde de fuera del marco: la caja del mapa menos lo que sale su banda.
    const ad = document.querySelector('.adornos-del-mapa') as HTMLElement;
    const salida =
      getComputedStyle(ad).display === 'none'
        ? 0
        : Number.parseFloat(getComputedStyle(ad).borderImageOutset) || 0;
    return {
      x0: 0,
      x1: Math.floor(m.left - salida),
      y0: Math.ceil(s.top),
      y1: Math.floor(s.bottom),
    };
  });
  const { data, w } = await crudo(png);
  const ls: number[] = [];
  for (let y = caja.y0; y < caja.y1; y++)
    for (let x = caja.x0; x < caja.x1; x++) {
      const i = (y * w + x) * 3;
      ls.push(luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0));
    }
  if (ls.length === 0)
    throw new Error('el margen no tiene ni un píxel entre la ventana y el marco');
  return { luz: mediana(ls), ancho: caja.x1 - caja.x0 };
}

async function ladoALado(png: Buffer, tema: Tema, alto: number, salida: string): Promise<void> {
  const lamina = await sharp(join(RAIZ, `assets/art/temas/${tema}.png`))
    .resize({ height: alto })
    .png()
    .toBuffer();
  const { width: wl = 0 } = await sharp(lamina).metadata();
  const { width: wc = 0 } = await sharp(png).metadata();
  await sharp({ create: { width: wc + 8 + wl, height: alto, channels: 3, background: '#808080' } })
    .composite([
      { input: png, left: 0, top: 0 },
      { input: lamina, left: wc + 8, top: 0 },
    ])
    .png()
    .toFile(salida);
}

const CAPTURAS = process.argv[2] === undefined ? null : resolve(process.argv[2]);
if (CAPTURAS !== null) mkdirSync(CAPTURAS, { recursive: true });
const fallos: string[] = [];
const errores: string[] = [];
const log = (m: string): void => console.log(m);

const vite = await arrancarVite();
log(`vite en ${vite.url} (grupo ${vite.proceso.pid})`);
const ruta = chromiumInstalado(log);
const navegador = await chromium.launch(ruta === undefined ? {} : { executablePath: ruta });
try {
  const luzLamina = Object.fromEntries(
    await Promise.all(TEMAS.map(async (t) => [t, await luzDeLaLamina(t)] as const)),
  ) as Record<Tema, number>;
  const movil: Buffer[] = [];
  for (const [ventana, esperado] of Object.entries(LIENZO)) {
    const [ancho, alto] = ventana.split('x').map(Number) as [number, number];
    const ctx = await navegador.newContext({
      viewport: { width: ancho, height: alto },
      deviceScaleFactor: 1,
      ...(ancho < 761 ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    // tsx mete `__name` en las funciones con nombre que viajan a `evaluate`.
    await page.addInitScript('globalThis.__name = (f) => f');
    page.on('console', (m) => {
      if (m.type() === 'error') errores.push(`${ventana}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errores.push(`${ventana}: ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 400) errores.push(`${ventana}: ${r.status()} ${r.url()}`);
    });
    await page.goto(`${vite.url}/?seed=42644`);
    await esperarElSuelo(page, ventana, 180_000, log);
    // El del neutro en esta misma página: con tema, el lienzo es ese y el anotado.
    let delNeutro: string | null = null;
    for (const tema of [null, ...TEMAS] as const) {
      await ponerTema(page, tema);
      const m = await medir(page);
      const quien = tema ?? 'neutro';
      const caja = JSON.stringify(m.lienzo);
      if (tema === null) delNeutro = caja;
      const igual = caja === JSON.stringify(esperado);
      if (!igual)
        fallos.push(`${ventana} ${quien}: el lienzo es ${caja}, no ${JSON.stringify(esperado)}`);
      if (tema !== null && caja !== delNeutro)
        fallos.push(`${ventana} ${quien}: el lienzo es ${caja} y sin tema ${delNeutro}`);
      if (m.anchoDePagina > ancho)
        fallos.push(`${ventana} ${quien}: la página mide ${m.anchoDePagina} de ancho`);
      let linea = `${ventana} ${quien.padEnd(10)} lienzo ${igual ? 'igual' : 'DISTINTO'} ${JSON.stringify(m.lienzo)}`;
      if (tema !== null && m.marco !== null)
        linea += ` · el marco tapa ${m.marco.join('/')} (arriba/der./abajo/izq.)`;
      if (tema !== null && m.remate !== null) linea += ` · el remate tapa ${m.remate}`;
      if (tema !== null && m.cartela !== null) linea += ` · la cartela ${m.cartela}`;
      if (tema !== null && ancho >= 761 && m.herramientas !== null) {
        const [hx = 0, hy = 0, hw = 0, hh = 0] = m.herramientas;
        const [, , vr = 0, vb = 0] = m.visto;
        linea += ` · herramientas a ${vr - (hx + hw)}/${vb - (hy + hh)} del borde`;
      }
      log(linea);
      if (tema === null) continue;
      if (m.marco !== null) {
        const [arriba = 0, der = 0, abajo = 0, izq = 0] = m.marco;
        const costado = Math.max(arriba, der, izq);
        if (costado > TAPA_COMO_MUCHO.costado)
          fallos.push(
            `${ventana} ${tema}: el marco tapa ${costado} px por un costado (tope ${TAPA_COMO_MUCHO.costado})`,
          );
        if (abajo > TAPA_COMO_MUCHO.pie)
          fallos.push(
            `${ventana} ${tema}: el marco tapa ${abajo} px por el pie (tope ${TAPA_COMO_MUCHO.pie})`,
          );
      }
      if (m.remate !== null && m.remate > TAPA_COMO_MUCHO.remate)
        fallos.push(
          `${ventana} ${tema}: el remate tapa ${m.remate} px (tope ${TAPA_COMO_MUCHO.remate})`,
        );
      if (m.cartela !== null && m.cartela > TAPA_COMO_MUCHO.cartela)
        fallos.push(
          `${ventana} ${tema}: la cartela tapa ${m.cartela} px (tope ${TAPA_COMO_MUCHO.cartela})`,
        );
      const png = await page.screenshot();
      if (ancho >= 761 && (ancho === 1440 || ancho === 1920)) {
        for (const x of await rotulos(page)) {
          const bien = x.mediana >= CONTRASTE_MINIMO;
          if (!bien)
            fallos.push(
              `${ventana} ${tema}: «${x.texto}» a ${x.mediana.toFixed(2)} sobre su barra`,
            );
          log(
            `    «${x.texto}»: ${x.mediana.toFixed(2)} (peor décimo ${x.peor.toFixed(2)})${bien ? '' : '  ✗'}`,
          );
        }
        if (CAPTURAS !== null)
          await ladoALado(png, tema, alto, join(CAPTURAS, `afinado-${tema}-${ancho}.png`));
      }
      if (ancho === 1920) {
        const { luz, ancho: anchoDelMargen } = await luzDelMargen(page, png);
        const d = Math.round(luz - luzLamina[tema]);
        const [lo, hi] = LUZ_DEL_MARGEN[tema];
        const bien = d >= lo && d <= hi;
        if (!bien)
          fallos.push(
            `${tema}: la luz del margen es ${Math.round(luz)}, ${d} de la lámina (${lo}…${hi})`,
          );
        log(
          `    margen (${anchoDelMargen} px): luz ${Math.round(luz)}, lámina ${Math.round(luzLamina[tema])}, ${d > 0 ? '+' : ''}${d}${bien ? '' : '  ✗'}`,
        );
      }
      if (ancho < 761) movil.push(png);
    }
    await ctx.close();
  }
  if (CAPTURAS !== null && movil.length > 0) {
    const metas = await Promise.all(movil.map((b) => sharp(b).metadata()));
    const w = metas[0]?.width ?? 390;
    const h = metas[0]?.height ?? 844;
    await sharp({
      create: { width: movil.length * (w + 8), height: h, channels: 3, background: '#808080' },
    })
      .composite(movil.map((input, i) => ({ input, left: i * (w + 8), top: 0 })))
      .png()
      .toFile(join(CAPTURAS, 'afinado-movil-390.png'));
  }
} finally {
  await navegador.close();
  matarGrupo(vite.proceso, log);
}
if (errores.length > 0) fallos.push(...errores.map((e) => `consola o red: ${e}`));
if (fallos.length > 0) {
  console.log(`\n${fallos.length} fallos:\n${fallos.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\ntodo en su sitio');
