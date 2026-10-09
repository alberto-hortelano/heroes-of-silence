/**
 * `pnpm taller escenario [semilla…]`: compone el mapa de cada semilla, lo pinta,
 * lo captura con Chromium y mide. Corre solo: cada iteración del escenógrafo es
 * esta orden y mirar el PNG.
 *
 * Escribe en `.cache/taller/escenario/`:
 *   - `<semilla>.html`, la página (se puede abrir con `?t=64` para otro zoom);
 *   - `<semilla>.png`, la captura;
 *   - `<semilla>.json`, el informe: suelo desnudo, murallas partidas, bases
 *     sobre una reserva, casillas de barrera sin formación y módulos que faltan.
 */
import { globSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { Marca } from '../../../src/client/desarrollo/tipos.js';
import { cajaEnPixeles } from '../../../src/client/render/camara-mapa.js';
import { componer } from '../../../src/client/render/escenario/colocar.js';
import { MARGEN } from '../../../src/client/render/escenario/pintar.js';
import { newGame } from '../../../src/core/state/setup.js';
import { leerCatalogo } from './catalogo-disco.js';
import { paginaDeEscena } from './pintor.js';

const RAIZ = resolve(import.meta.dirname, '../../..');
export const DIR_ESCENARIO = join(RAIZ, '.cache/taller/escenario');

/** El Chromium que instaló Playwright, o el suyo por defecto si no se encuentra. */
function chromiumInstalado(): string | undefined {
  return globSync(join(homedir(), '.cache/ms-playwright/chromium-*/chrome-linux*/chrome'))
    .sort()
    .at(-1);
}

const TIPOS: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
};

/**
 * Un servidor de ficheros del repo, en un puerto que da el sistema y solo en
 * 127.0.0.1. Hace falta porque una imagen cargada desde \`file://\` contamina el
 * canvas y el pintor ya no puede leer sus píxeles para medir el suelo desnudo.
 */
async function servir(): Promise<{ servidor: Server; base: string }> {
  const servidor = createServer(async (req, res) => {
    const ruta = resolve(RAIZ, `.${decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')}`);
    if (!ruta.startsWith(RAIZ)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(ruta);
      const ext = ruta.slice(ruta.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': TIPOS[ext] ?? 'application/octet-stream' }).end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  return { servidor, base: `http://127.0.0.1:${port}` };
}

export interface Resultado {
  readonly html: string;
  readonly png: string;
  readonly informe: Record<string, unknown>;
}

/** Una página del taller abierta y pintada, con los errores que vaya dando. */
interface PaginaDeEscena {
  readonly pagina: Page;
  /** Fallos de la página y errores de consola (menos los 404 del arte que falta). */
  readonly errores: readonly string[];
}

/**
 * Chromium y el servidor de ficheros del repo para `trabajo`, cerrados al acabar
 * pase lo que pase. `abrir(nombre, …)` carga `.cache/taller/escenario/<nombre>`
 * (con `?t=` si se da) y espera a que el pintor publique su informe: el único
 * camino por el que el taller abre una escena, para el informe y para el
 * recorte de una marca.
 */
async function conPaginasDeEscena<T>(
  trabajo: (
    abrir: (
      nombre: string,
      lado: { width: number; height: number },
      t?: number,
    ) => Promise<PaginaDeEscena>,
  ) => Promise<T>,
): Promise<T> {
  await mkdir(DIR_ESCENARIO, { recursive: true });
  const ejecutable = chromiumInstalado();
  const navegador = await chromium.launch(
    ejecutable === undefined ? {} : { executablePath: ejecutable },
  );
  const { servidor, base } = await servir();
  try {
    return await trabajo(async (nombre, lado, t) => {
      const pagina = await navegador.newPage({ viewport: lado });
      const errores: string[] = [];
      pagina.on('pageerror', (e) => errores.push(String(e)));
      pagina.on('console', (m) => {
        if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|404/.test(m.text()))
          errores.push(m.text());
      });
      await pagina.goto(
        `${base}/.cache/taller/escenario/${nombre}${t === undefined ? '' : `?t=${t}`}`,
      );
      await pagina.waitForFunction(
        () => (window as unknown as { __informe?: unknown }).__informe !== undefined,
        null,
        { timeout: 120_000 },
      );
      return { pagina, errores };
    });
  } finally {
    await navegador.close();
    servidor.close();
  }
}

export async function escenario(semillas: readonly number[], tile = 48): Promise<Resultado[]> {
  // Del disco y no de `escena.json`: así se ve al momento una hoja recién cortada.
  const catalogo = await leerCatalogo();
  return conPaginasDeEscena(async (abrir) => {
    const fuera: Resultado[] = [];
    for (const semilla of semillas) {
      const escena = componer(newGame({ seed: semilla }).map, semilla, catalogo);
      const html = join(DIR_ESCENARIO, `${semilla}.html`);
      await writeFile(html, await paginaDeEscena(escena, '../../../assets/mapa/', tile));
      const { pagina, errores } = await abrir(`${semilla}.html`, { width: 1800, height: 1800 });
      const informe = {
        ...((await pagina.evaluate(
          () => (window as unknown as { __informe: object }).__informe,
        )) as Record<string, unknown>),
        sprites: escena.sprites.length,
        errores,
      };
      const png = join(DIR_ESCENARIO, `${semilla}.png`);
      await pagina.locator('#lienzo').screenshot({ path: png });
      await pagina.close();
      await writeFile(
        join(DIR_ESCENARIO, `${semilla}.json`),
        `${JSON.stringify(informe, null, 2)}\n`,
      );
      fuera.push({ html, png, informe });
    }
    return fuera;
  });
}

/**
 * El recorte de una marca de fallo (`pnpm marcas recorte <id>`), pintado por el
 * taller: compone el mapa de su semilla, lo pinta a la densidad de la marca
 * (`tile × densidad` px por casilla) y corta la caja del mundo que cubre su PNG.
 * Escribe `salida` y devuelve los avisos —si el taller compone otra escena que
 * la del juego, el recorte no es el mismo sitio y hay que saberlo—. Lanza si la
 * página da errores, de consola incluidos: un recorte de una página rota no vale.
 *
 * El taller pinta con `pintarEscena` y el juego con el suelo del Worker y sus
 * volúmenes: lo que difiera entre los dos caminos es en sí un hallazgo.
 */
export async function recorteDeMarca(marca: Marca, salida: string): Promise<{ avisos: string[] }> {
  const avisos: string[] = [];
  // Píxeles de dispositivo por casilla: los del PNG de la marca.
  const T = marca.camara.tile * marca.lienzo.densidad;
  await recortesDeSemilla(marca.semilla, T, [{ caja: marca.recorte, salida }], (escena) => {
    if (escena.sprites.length !== marca.queHay.spritesDeLaEscena)
      avisos.push(
        `el taller compone ${escena.sprites.length} sprites y el juego compuso ${marca.queHay.spritesDeLaEscena}: el catálogo del disco no es el de assets/mapa/escena.json (pnpm taller catalogo-escena), y el recorte puede no ser el mismo sitio`,
      );
  });
  return { avisos };
}

/**
 * Recortes de la escena de `semilla` pintada por el taller a `T` px por
 * casilla: cada `caja` del mundo (x0, y0, x1, y1, en casillas) a su `salida`.
 * El de una marca y el de antes y después de un arreglo (`pnpm taller
 * recorte`). Lanza si la página da errores, de consola incluidos.
 */
export async function recortesDeSemilla(
  semilla: number,
  T: number,
  recortes: readonly {
    readonly caja: readonly [number, number, number, number];
    readonly salida: string;
  }[],
  mirar?: (escena: ReturnType<typeof componer>) => void,
): Promise<void> {
  const catalogo = await leerCatalogo();
  const escena = componer(newGame({ seed: semilla }).map, semilla, catalogo);
  mirar?.(escena);
  const nombre = `recorte-${semilla}-${T}.html`;
  await mkdir(DIR_ESCENARIO, { recursive: true });
  await writeFile(
    join(DIR_ESCENARIO, nombre),
    await paginaDeEscena(escena, '../../../assets/mapa/', T),
  );
  await conPaginasDeEscena(async (abrir) => {
    const { pagina, errores } = await abrir(nombre, { width: 1200, height: 900 }, T);
    for (const { caja, salida } of recortes) {
      const url = await pagina.evaluate(
        ({ sx, sy, sw, sh }) => {
          const lienzo = document.getElementById('lienzo') as HTMLCanvasElement;
          const corte = document.createElement('canvas');
          corte.width = sw;
          corte.height = sh;
          (corte.getContext('2d') as CanvasRenderingContext2D).drawImage(
            lienzo,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            sw,
            sh,
          );
          return corte.toDataURL('image/png');
        },
        cajaEnPixeles(caja, T, MARGEN * T),
      );
      if (errores.length > 0) throw new Error(`la página del taller falló: ${errores.join(' · ')}`);
      await writeFile(salida, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    }
  });
}
