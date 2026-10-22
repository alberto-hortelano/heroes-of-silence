/**
 * El clima en pantalla, con un Chromium de verdad: capturas de cada clima en los
 * tres escenarios, la niebla de guerra intacta, el rayo y los fps.
 *
 *     npx tsx tools/qa/clima.ts [carpeta] [--sin-fps] [--solo-fps] [--escenas=mapa,…] [--climas=a;b] [--solo-espectador] [--solo-rayo]
 *
 * Los modos abaratan repetir una parte (la máquina es compartida): `--sin-fps`,
 * todo menos los fps; `--solo-fps`, solo los fps, y con `--escenas=` (de
 * `mapa`, `batalla`, `base` y `mapa 4K`) y `--climas=` (separados por `;`) solo
 * esas; `--solo-espectador` y `--solo-rayo`, solo esa prueba. El cierre, entero.
 *
 * Arranca su propio vite (`vite-propio.ts`) y deja los PNG en `carpeta` (por
 * defecto `.cache/clima/`):
 *
 * - por cada `?clima=` de `CLIMAS`: la base (la partida abre en ella), la morada
 *   (con la noche), el mapa con la niebla de guerra y con el mapa entero a la
 *   vista, y una batalla de la arena;
 * - **la niebla de guerra no cambia** (criterio 3): todo píxel que con el
 *   despejado es lo inexplorado (`#080a10`) lo sigue siendo con cada clima;
 * - **fps** (criterio 6): en 2560×1440, el mapa al tope de alejar arrastrándolo
 *   3 s, la batalla y la base, por clima y con el despejado intercalado; y el
 *   mapa una vez más en 3840×2160. Imprime la tabla con la fecha y sale con 1 si
 *   algún clima pierde más de un 10 % frente al despejado de su escena.
 *
 * Sale con 1 también si algo de lo de arriba falla o hay un error en la consola.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Browser, chromium, type Page } from 'playwright';
import sharp from 'sharp';
import WebSocket from 'ws';
import { FONDO_INEXPLORADO } from '../../src/client/render/minimapa.js';
import type {
  AgentHelloMsg,
  AgentResponseMsg,
  ServerToAgentMsg,
} from '../../src/server/protocol.js';
import { mediana } from './estadistica.js';
import { entornoDelArnes } from './partida-del-arnes.js';
import { decidir } from './politica.js';
import { arrancarServidor, type ServidorDePartida } from './servidor.js';
import { arrancarVite, chromiumInstalado, esperarElSuelo, matarGrupo } from './vite-propio.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const CARPETA = resolve(args.find((a) => !a.startsWith('--')) ?? join(RAIZ, '.cache/clima'));
const SIN_FPS = args.includes('--sin-fps');
const SOLO_FPS = args.includes('--solo-fps');
/** Solo el espectador (para iterar). */
const SOLO_ESPECTADOR = args.includes('--solo-espectador');
/** Solo el rayo (para iterar). */
const SOLO_RAYO = args.includes('--solo-rayo');
/** `--escenas=mapa,batalla`: solo esas escenas en los fps (para iterar; el cierre las mide todas). */
const ESCENAS_DE_FPS = args
  .find((a) => a.startsWith('--escenas='))
  ?.slice('--escenas='.length)
  .split(',');

/** La semilla de la partida: el héroe nace en `region-0`, junto a `region-5` y `region-8`. */
const SEMILLA = 7;
/**
 * Los climas que se miran; el último, por región, con su frente a la vista. Cada
 * tiempo **con su noche dicha** (`dia` o `noche`): un `?clima=despejado` solo
 * fija el tiempo, y la noche sigue saliendo de la semilla (la 7 abre el día 1
 * con tres regiones de noche). Sin `dia`, el «despejado» de la tabla de fps
 * pintaba la luz de esas noches, y la `noche` era la niebla de la semilla de
 * noche (vuelta de QA 1, 22-10-2026).
 */
const CLIMAS = [
  'despejado,dia',
  'niebla,dia',
  'lluvia,dia',
  'tormenta,dia',
  'despejado,noche',
  'tormenta,noche',
  'despejado,dia,region-0:tormenta,region-5:niebla,region-8:lluvia,region-4:noche',
] as const;
/** El despejado de día: contra el que se comparan los fps y lo inexplorado. */
const DESPEJADO = CLIMAS[0];
/** Lo que se mide de fps: los cuatro tiempos, la noche y la mezcla. */
const CLIMAS_DE_FPS: readonly string[] =
  args
    .find((a) => a.startsWith('--climas='))
    ?.slice('--climas='.length)
    .split(';') ?? CLIMAS.slice(1);
/** Cuánto pueden perder los fps con clima frente al despejado (criterio 6). */
const PERDIDA_MAXIMA = 0.1;

function log(msg: string): void {
  console.log(`\x1b[36m[clima]\x1b[0m ${msg}`);
}

const nombreDe = (clima: string): string =>
  clima.includes(':')
    ? 'mezcla'
    : clima === 'despejado,noche'
      ? 'noche'
      : clima.replace(/,dia$/, '').replace(',', '-');

const errores: string[] = [];
function vigilar(page: Page, quien: string): void {
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`${quien}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errores.push(`${quien}: ${e.message}`));
}

async function guardar(page: Page, nombre: string): Promise<Buffer> {
  const ruta = join(CARPETA, `${nombre}.png`);
  const png = await page.screenshot({ path: ruta });
  log(`  ${ruta}`);
  return png;
}

/** La partida con `clima`, ya en su base. */
async function abrirLaPartida(page: Page, url: string, clima: string): Promise<void> {
  await page.goto(`${url}/?seed=${SEMILLA}&clima=${encodeURIComponent(clima)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 60_000 });
  // Que llegue el arte de la base y quien camina se quede quieto.
  await page.waitForSelector('#canvas[data-base]:not([data-base="andando"])', { timeout: 30_000 });
  await sleep(1500);
}

/** La arena con `clima`, con una pelea de tres contra dos montada y empezada. */
async function abrirLaBatalla(page: Page, url: string, clima: string): Promise<void> {
  await page.goto(`${url}/arena/?seed=3&clima=${encodeURIComponent(clima)}`, {
    waitUntil: 'networkidle',
  });
  await page.locator('[data-unidad-catalogo]').first().waitFor({ timeout: 30_000 });
  for (const [unidad, lado] of [
    ['templario-escudo', 'izquierda'],
    ['templario-monje', 'izquierda'],
    ['templario-escudo', 'izquierda'],
    ['orko-dos-armas', 'derecha'],
    ['orko-dos-armas', 'derecha'],
  ] as const) {
    await page.locator(`[data-unidad-catalogo="${unidad}"] [data-lado="${lado}"]`).click();
  }
  await page.locator('[data-arena="luchar"]').click();
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 5000 });
  await sleep(2500);
}

/** Los píxeles RGBA de una captura PNG. */
async function pixeles(png: Buffer): Promise<{ data: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

const [NEGRO_R, NEGRO_G, NEGRO_B] = FONDO_INEXPLORADO;

/** Los índices de los píxeles que son lo inexplorado (`FONDO_INEXPLORADO`, `#080a10`) exacto. */
function inexplorados(img: { data: Buffer }): number[] {
  const out: number[] = [];
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === NEGRO_R && img.data[i + 1] === NEGRO_G && img.data[i + 2] === NEGRO_B)
      out.push(i);
  }
  return out;
}

// ------------------------------------------------------------- las capturas

async function capturas(browser: Browser, url: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let negroDelDespejado: number[] | null = null;
  for (const clima of CLIMAS) {
    const n = nombreDe(clima);
    log(`clima «${clima}»`);
    const page = await ctx.newPage();
    vigilar(page, n);
    await abrirLaPartida(page, url, clima);
    await guardar(page, `base-${n}`);
    if (n === 'noche' || n === 'lluvia') {
      await page.click('[data-action="ir-a-sitio"][data-sitio="lvl1"]');
      await page
        .waitForSelector('#app[data-escena="morada"]', { timeout: 15_000 })
        .catch(() => log('  (la morada no se abrió desde la lista: sin captura)'));
      if ((await page.locator('#app').getAttribute('data-escena')) === 'morada') {
        await sleep(1500);
        await guardar(page, `morada-${n}`);
        await page.click('[data-action="cerrar-morada"]');
        await page.waitForSelector('#app[data-escena="town"]');
      }
    }
    await page.click('[data-action="close-town"]');
    await page.waitForSelector('#app[data-escena="adventure"]');
    await esperarElSuelo(page, n, 180_000, log);
    await sleep(1200);
    const mapa = await pixeles(await guardar(page, `mapa-${n}`));
    // Criterio 3: lo inexplorado del despejado sigue siendo lo inexplorado.
    if (negroDelDespejado === null) {
      // Dos fotogramas del despejado: lo que es negro en los dos es lo
      // inexplorado quieto (una figura que respira encima de él no cuenta).
      await sleep(700);
      const enLosDos = new Set(inexplorados(await pixeles(await page.screenshot())));
      negroDelDespejado = inexplorados(mapa).filter((i) => enLosDos.has(i));
      log(`  ${negroDelDespejado.length} píxeles inexplorados en el despejado`);
    } else {
      // Exacto en lo hondo; en el borde blando de la niebla de guerra (su
      // máscara se amplía con suavizado) asoma lo de debajo en la misma parte
      // que asoma el terreno, y eso no es revelar: se cuenta lo que cambia más
      // de `ASOMA` en algún canal, que se vería.
      const ASOMA = 24;
      let exactos = 0;
      let seVen = 0;
      let mayor = 0;
      for (const i of negroDelDespejado) {
        const d = Math.max(
          Math.abs((mapa.data[i] ?? 0) - NEGRO_R),
          Math.abs((mapa.data[i + 1] ?? 0) - NEGRO_G),
          Math.abs((mapa.data[i + 2] ?? 0) - NEGRO_B),
        );
        if (d === 0) exactos++;
        if (d > ASOMA) seVen++;
        mayor = Math.max(mayor, d);
      }
      log(
        `  lo inexplorado: ${exactos} de ${negroDelDespejado.length} píxeles exactos; el que más cambia, ${mayor}; ${seVen} cambian más de ${ASOMA}`,
      );
      if (seVen > 0) {
        errores.push(`${n}: el clima se ve en ${seVen} píxeles de lo inexplorado`);
      }
    }
    await page.click('[data-action="toggle-fog"]');
    await sleep(1200);
    await guardar(page, `mapa-${n}-entero`);
    await page.close();

    const arena = await ctx.newPage();
    vigilar(arena, `arena ${n}`);
    await abrirLaBatalla(arena, url, clima);
    await guardar(arena, `batalla-${n}`);
    await arena.close();
  }
  await ctx.close();
}

/**
 * El rayo: la tormenta de la arena fotografiada hasta pillar un destello (uno
 * cada 4-9 s). Guarda el fotograma con más luz en el cielo y dice qué parte del
 * cielo se encendió.
 */
async function rayo(browser: Browser, url: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  vigilar(page, 'rayo');
  await abrirLaBatalla(page, url, 'tormenta');
  const lienzo = await page.locator('#canvas').boundingBox();
  if (lienzo === null) throw new Error('rayo: no hay lienzo');
  const clip = { x: lienzo.x, y: lienzo.y, width: lienzo.width, height: 260 };
  const azul = (img: { data: Buffer }): number => {
    let suma = 0;
    for (let k = 2; k < img.data.length; k += 4) suma += img.data[k] ?? 0;
    return suma / (img.data.length / 4);
  };
  // Una sola captura por vuelta, y el cielo se recorta de ella: con dos, el
  // destello caía en una y la que se guardaba era la otra.
  const delCielo = async (png: Buffer): Promise<number> =>
    azul(
      await pixeles(
        await sharp(png)
          .extract({
            left: Math.round(clip.x),
            top: Math.round(clip.y),
            width: Math.round(clip.width),
            height: clip.height,
          })
          .png()
          .toBuffer(),
      ),
    );
  const base = await delCielo(await page.screenshot());
  let mejor = { luz: base, png: null as Buffer | null };
  const desde = Date.now();
  // El destello dura 160 ms y cae cada 4-9 s: en 30 s, varios, y alguna captura
  // cae dentro.
  while (Date.now() - desde < 30_000) {
    const png = await page.screenshot();
    const luz = await delCielo(png);
    if (luz > mejor.luz) mejor = { luz, png };
  }
  log(
    `rayo: luz media del cielo ${base.toFixed(1)} sin destello, ${mejor.luz.toFixed(1)} la mayor`,
  );
  if (mejor.png !== null && mejor.luz > base + 3) {
    const ruta = join(CARPETA, 'batalla-tormenta-rayo.png');
    await sharp(mejor.png).toFile(ruta);
    log(`  ${ruta}`);
  } else {
    errores.push('rayo: en 30 s de tormenta no se ha visto ningún destello');
  }
  await ctx.close();
}

// ------------------------------------------------------------- el espectador

/**
 * El espectador ve el clima de la partida, también el que pide el narrador:
 * un agente de prueba (la política de `pnpm qa`) pide en su primer turno una
 * tormenta en una región que ve, y se fotografía el espectador sin `?clima=`
 * (lo que viene del servidor) y con `?clima=lluvia` (lo forzado).
 */
async function espectador(browser: Browser, url: string): Promise<void> {
  let servidor: ServidorDePartida | null = null;
  let agente: WebSocket | null = null;
  const paginas: Page[] = [];
  try {
    servidor = await arrancarServidor(entornoDelArnes(SEMILLA));
    const puerto = servidor.espectador;
    const libre = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    paginas.push(libre);
    vigilar(libre, 'espectador');
    await libre.goto(`${url}/espectador/?puerto=${puerto}`);
    const forzado = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    paginas.push(forzado);
    vigilar(forzado, 'espectador forzado');
    await forzado.goto(`${url}/espectador/?puerto=${puerto}&clima=lluvia`);
    const conectado = new WebSocket(`ws://localhost:${servidor.agente}`);
    agente = conectado;
    const enviar = (msg: AgentHelloMsg | AgentResponseMsg): void =>
      conectado.send(JSON.stringify(msg));
    await new Promise<void>((ok, mal) => {
      let turnos = 0;
      conectado.on('open', () => enviar({ type: 'hello', client: 'clima' }));
      conectado.on('error', mal);
      conectado.on('message', (datos) => {
        void (async () => {
          const msg = JSON.parse(String(datos)) as ServerToAgentMsg;
          if (msg.type !== 'request') return;
          let data = decidir(msg.kind, msg.payload, SEMILLA) as Record<string, unknown>;
          if (msg.kind === 'adventure_turn') {
            turnos++;
            if (turnos === 1) {
              const vistas = (msg.payload as { world?: { weather?: { at: unknown }[] } }).world
                ?.weather;
              const at = vistas?.[0]?.at;
              if (at !== undefined)
                data = { ...data, weather: [{ at, weather: 'tormenta', days: 3 }] };
            } else {
              // El turno siguiente: lo pedido ya está en el fotograma.
              await esperarElSuelo(libre, 'espectador', 60_000, log);
              await esperarElSuelo(forzado, 'espectador forzado', 60_000, log);
              await sleep(1500);
              await guardar(libre, 'espectador-tormenta-del-narrador');
              await guardar(forzado, 'espectador-lluvia-forzada');
              ok();
            }
          }
          enviar({ type: 'response', requestId: msg.requestId, data });
        })().catch(mal);
      });
    });
  } finally {
    // Las páginas antes que el servidor: si no, se quedan llamando a la puerta
    // de un canal cerrado, y cada intento es un error en la consola.
    for (const p of paginas) await p.close();
    agente?.close();
    servidor?.parar();
  }
}

// ------------------------------------------------------------------- fps

/** Lo que da una ventana: los fps y el tiempo de CPU del hilo de la página por fotograma, en ms. */
interface Medida {
  readonly fps: number;
  readonly cpu: number;
}

/** Fotogramas durante `ms`, contando `requestAnimationFrame` en la página. */
const CONTAR = (ms: number): string => `new Promise((ok) => {
  let n = 0;
  const t0 = performance.now();
  const paso = (t) => { n++; if (t - t0 < ${ms}) requestAnimationFrame(paso); else ok({ n, s: (t - t0) / 1000 }); };
  requestAnimationFrame(paso);
})`;

/**
 * Una ventana de `ms`: los fps y la CPU del hilo de la página por fotograma
 * (`TaskDuration` de CDP en tiempo de hilo). Los fps bailan con la carga de la
 * máquina; la CPU por fotograma, bastante menos: es lo que cuesta pintar, no lo
 * que se espera a que haya núcleo libre.
 */
async function ventana(page: Page, ms: number, mientras?: () => Promise<void>): Promise<Medida> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });
  const tareas = async (): Promise<number> => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
  };
  const antes = await tareas();
  const cuenta = page.evaluate(CONTAR(ms)) as Promise<{ n: number; s: number }>;
  if (mientras !== undefined) await mientras();
  const { n, s } = await cuenta;
  const despues = await tareas();
  await cdp.detach();
  return { fps: n / s, cpu: ((despues - antes) * 1000) / Math.max(1, n) };
}

async function fpsDelMapa(page: Page, ancho: number, alto: number): Promise<Medida[]> {
  const c = { x: ancho / 2, y: alto / 2 };
  await page.mouse.move(c.x, c.y);
  // Al tope de alejar: la rueda hasta que no aleje más.
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, 300);
    await sleep(40);
  }
  await sleep(600);
  await page.mouse.down();
  const medidas: Medida[] = [];
  let k = 0;
  for (let v = 0; v < 3; v++) {
    medidas.push(
      await ventana(page, 1500, async () => {
        const desde = Date.now();
        while (Date.now() - desde < 1500) {
          k++;
          const a = (k % 120) / 120;
          await page.mouse.move(
            c.x + Math.round(160 * Math.sin(a * 6.283)),
            c.y + Math.round(90 * Math.cos(a * 6.283)),
          );
          await sleep(16);
        }
      }),
    );
  }
  await page.mouse.up();
  return medidas;
}

/** Tres ventanas de 1,5 s sin tocar nada (la batalla y la base). */
async function fpsQuieto(page: Page): Promise<Medida[]> {
  const medidas: Medida[] = [];
  for (let v = 0; v < 3; v++) medidas.push(await ventana(page, 1500));
  return medidas;
}

async function fps(browser: Browser, url: string): Promise<void> {
  const fecha = new Date().toISOString().slice(0, 10);
  const filas: {
    escena: string;
    clima: string;
    fps: number;
    mejor: number;
    despejado: number;
    mejorDespejado: number;
    cpu: number;
    cpuDespejado: number;
  }[] = [];
  const medir = async (
    escena: string,
    ancho: number,
    alto: number,
    clima: string,
    hacer: (page: Page) => Promise<Medida[]>,
  ): Promise<Medida[]> => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
    const page = await ctx.newPage();
    vigilar(page, `fps ${escena} ${nombreDe(clima)}`);
    const r = await hacer(page);
    await ctx.close();
    log(
      `  ${escena} ${ancho}×${alto} «${nombreDe(clima)}»: ${r.map((m) => `${m.fps.toFixed(1)} fps ${m.cpu.toFixed(1)} ms`).join(' · ')}`,
    );
    return r;
  };
  const escenas: {
    escena: string;
    ancho: number;
    alto: number;
    climas: readonly string[];
    hacer: (clima: string) => (page: Page) => Promise<Medida[]>;
  }[] = [
    {
      escena: 'mapa',
      ancho: 2560,
      alto: 1440,
      climas: CLIMAS_DE_FPS,
      hacer: (clima) => async (page) => {
        await abrirLaPartida(page, url, clima);
        await page.click('[data-action="close-town"]');
        await esperarElSuelo(page, `fps ${clima}`, 240_000, () => {});
        await sleep(800);
        return await fpsDelMapa(page, 2560, 1440);
      },
    },
    {
      escena: 'batalla',
      ancho: 2560,
      alto: 1440,
      climas: CLIMAS_DE_FPS,
      hacer: (clima) => async (page) => {
        await abrirLaBatalla(page, url, clima);
        return await fpsQuieto(page);
      },
    },
    {
      escena: 'base',
      ancho: 2560,
      alto: 1440,
      climas: CLIMAS_DE_FPS,
      hacer: (clima) => async (page) => {
        await abrirLaPartida(page, url, clima);
        return await fpsQuieto(page);
      },
    },
    {
      escena: 'mapa 4K',
      ancho: 3840,
      alto: 2160,
      climas: ['tormenta,dia'],
      hacer: (clima) => async (page) => {
        await abrirLaPartida(page, url, clima);
        await page.click('[data-action="close-town"]');
        await esperarElSuelo(page, `fps 4K ${clima}`, 240_000, () => {});
        await sleep(800);
        return await fpsDelMapa(page, 3840, 2160);
      },
    },
  ];
  // La máquina es compartida y una medida suelta de fps baila de 9 a 58 con la
  // carga (22-10-2026): cada escena se recorre dos veces, con el despejado
  // delante, tres ventanas por página. De los fps queda el mejor; de la CPU por
  // fotograma, la mediana, que es la que se juzga.
  for (const e of escenas) {
    if (ESCENAS_DE_FPS !== undefined && !ESCENAS_DE_FPS.includes(e.escena)) continue;
    const todas = new Map<string, Medida[]>();
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      for (const clima of [DESPEJADO, ...e.climas]) {
        const m = await medir(e.escena, e.ancho, e.alto, clima, e.hacer(clima));
        todas.set(clima, [...(todas.get(clima) ?? []), ...m]);
      }
    }
    const de = (clima: string) => todas.get(clima) ?? [];
    for (const clima of e.climas) {
      filas.push({
        escena: `${e.escena} ${e.ancho}×${e.alto}`,
        clima,
        fps: mediana(de(clima).map((m) => m.fps)),
        mejor: Math.max(...de(clima).map((m) => m.fps)),
        despejado: mediana(de(DESPEJADO).map((m) => m.fps)),
        mejorDespejado: Math.max(...de(DESPEJADO).map((m) => m.fps)),
        cpu: mediana(de(clima).map((m) => m.cpu)),
        cpuDespejado: mediana(de(DESPEJADO).map((m) => m.cpu)),
      });
    }
  }
  console.log(`\nfps del clima, ${fecha} (Chromium sin GPU de Playwright, máquina compartida)`);
  console.log(
    '| escena | clima | fps despejado (mediana · mejor) | fps con clima (mediana · mejor) | CPU/fotograma despejado | con clima |',
  );
  console.log('|---|---|---|---|---|---|');
  for (const f of filas) {
    // Lo que se juzga es la **mediana** de las seis ventanas contra la del
    // despejado (H9 de la vuelta de QA 1: con el mejor de seis, una noche que
    // perdía un 22 % en dos de cada tres ventanas pasaba). El mejor va al lado,
    // que dice lo que da la página cuando la máquina la deja, y la CPU por
    // fotograma, que baila menos con la carga ajena.
    const dif = (f.fps - f.despejado) / f.despejado;
    const difMejor = (f.mejor - f.mejorDespejado) / f.mejorDespejado;
    const pc = (x: number): string => `${(x * 100).toFixed(1)} %`;
    console.log(
      `| ${f.escena} | ${nombreDe(f.clima)} | ${f.despejado.toFixed(1)} · ${f.mejorDespejado.toFixed(1)} | ${f.fps.toFixed(1)} (${pc(dif)}) · ${f.mejor.toFixed(1)} (${pc(difMejor)}) | ${f.cpuDespejado.toFixed(1)} ms | ${f.cpu.toFixed(1)} ms |`,
    );
    if (!f.escena.includes('3840') && dif < -PERDIDA_MAXIMA) {
      errores.push(`${f.escena} con ${nombreDe(f.clima)}: ${pc(dif)} de fps (mediana)`);
    }
  }
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  let vite: Awaited<ReturnType<typeof arrancarVite>> | null = null;
  let browser: Browser | null = null;
  try {
    vite = await arrancarVite();
    log(`vite en ${vite.url}`);
    const ejecutable = chromiumInstalado(log);
    browser = await chromium.launch(ejecutable === undefined ? {} : { executablePath: ejecutable });
    if (SOLO_RAYO) {
      await rayo(browser, vite.url);
    } else if (SOLO_ESPECTADOR) {
      await espectador(browser, vite.url);
    } else {
      if (!SOLO_FPS) {
        await capturas(browser, vite.url);
        await rayo(browser, vite.url);
        await espectador(browser, vite.url);
      }
      if (!SIN_FPS) await fps(browser, vite.url);
    }
  } finally {
    await browser?.close();
    matarGrupo(vite?.proceso ?? null, log);
  }
  if (errores.length > 0) {
    console.error(`\x1b[31m[clima] ${errores.length} fallo(s):\x1b[0m\n- ${errores.join('\n- ')}`);
    process.exit(1);
  }
  log('todo en orden');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
