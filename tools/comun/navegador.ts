/**
 * Lo que comparten los arneses de navegador (`pnpm capturas`, `qa/clima`, `qa/neutro`,
 * `qa/temas-con-piezas`) y el taller que abre un Chromium (`art/montura`,
 * `taller/escenario`): un vite propio, en un puerto que elige el sistema y en su propio grupo de
 * procesos, para matarlo entero sin tocar el vite de nadie más (la máquina es compartida); el
 * Chromium que haya; la espera del suelo del mapa; la consola vigilada, y un servidor de ficheros.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer, type Server } from 'node:http';
import { type AddressInfo, createServer } from 'node:net';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { chromium, type Page } from 'playwright';

/** Los códigos de color ANSI; escritos con `fromCharCode` porque Biome no deja un ESC literal en una regex. */
const COLORES_DE_TERMINAL = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * Un puerto libre, preguntándoselo al sistema. `vite --port 0` NO es un puerto
 * efímero: vite toma el 0 por «no me lo han dicho» y abre el 5173 —se vio al
 * correrlo—, que choca con el vite de cualquier otro proyecto de la máquina.
 */
async function puertoLibre(): Promise<number> {
  return await new Promise((ok, mal) => {
    const srv = createServer();
    srv.once('error', mal);
    srv.listen(0, '127.0.0.1', () => {
      const dir = srv.address();
      srv.close(() =>
        typeof dir === 'object' && dir !== null ? ok(dir.port) : mal(new Error('sin puerto')),
      );
    });
  });
}

/** Vite en un puerto libre y en su propio grupo, para poder matarlo entero. */
export async function arrancarVite(): Promise<{ proceso: ChildProcess; url: string }> {
  const puerto = await puertoLibre();
  const proceso = spawn('node_modules/.bin/vite', ['--port', String(puerto), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let salida = '';
  const url = await new Promise<string>((ok, mal) => {
    const plazo = setTimeout(
      () => mal(new Error(`vite no anunció su dirección en 15 s. Salida:\n${salida}`)),
      15_000,
    );
    const leer = (trozo: Buffer): void => {
      // Sin los códigos de color: vite pinta el puerto en negrita.
      salida += trozo.toString().replace(COLORES_DE_TERMINAL, '');
      const m = /Local:\s+(http:\/\/\S+)/.exec(salida);
      if (m?.[1] !== undefined) {
        clearTimeout(plazo);
        ok(m[1].replace(/\/$/, ''));
      }
    };
    proceso.stdout?.on('data', leer);
    proceso.stderr?.on('data', leer);
    proceso.on('exit', (code) => {
      clearTimeout(plazo);
      mal(new Error(`vite salió con ${code} antes de arrancar. Salida:\n${salida}`));
    });
  });
  return { proceso, url };
}

/**
 * El Chromium que haya. Playwright pide una revisión concreta y la descarga si
 * falta; aquí no se descarga nada: si la suya no está, se usa la más reciente
 * de las que ya hay en su caché, y se dice cuál.
 */
export function chromiumInstalado(log: (msg: string) => void): string | undefined {
  const propio = chromium.executablePath();
  if (existsSync(propio)) return undefined;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const candidatos = existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
        .map((d) => join(cache, d, 'chrome-linux64', 'chrome'))
        .filter((p) => existsSync(p))
    : [];
  const elegido = candidatos[0];
  if (elegido === undefined) {
    throw new Error(
      `no hay ningún Chromium de Playwright en ${cache}: instálalo con \`npx playwright install chromium\``,
    );
  }
  log(`Playwright pide ${propio}; uso el que hay: ${elegido}`);
  return elegido;
}

/**
 * Espera al suelo del mapa (`#app[data-escenario]`, que apunta
 * `apuntarElSueloEn`): `pintado` es la resolución plena, la que fotografían las
 * capturas; `esbozado`, el esbozo, que basta para leer el estilo de la página
 * (`neutro.ts`). Antes se ve el sucedáneo de pigmentos.
 */
export async function esperarElSuelo(
  page: Page,
  quien: string,
  tope: number,
  log: (msg: string) => void,
  hasta: 'esbozado' | 'pintado' = 'pintado',
): Promise<void> {
  const desde = Date.now();
  const estados = hasta === 'esbozado' ? ['esbozado', 'pintado'] : ['pintado'];
  await page
    .waitForSelector(estados.map((e) => `#app[data-escenario="${e}"]`).join(', '), {
      timeout: tope,
    })
    .catch(async () => {
      const estado = await page.locator('#app').getAttribute('data-escenario');
      throw new Error(
        `${quien}: el suelo del mapa no llegó a «${hasta}» en ${tope / 1000} s (está en «${estado}»)`,
      );
    });
  log(`${quien}: suelo ${hasta} en ${((Date.now() - desde) / 1000).toFixed(1)} s`);
}

/**
 * Apunta en `errores` cada error de la consola de `page` y cada excepción suya, con quién la dio
 * delante («1440x900: …»). Lo que se hace con la lista (fallar al acabar, decir cuáles) es de cada
 * arnés; `pnpm capturas` y el taller filtran lo que esperan y llevan su propia vigilancia.
 */
export function vigilarLaConsola(page: Page, quien: string, errores: string[]): void {
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`${quien}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errores.push(`${quien}: ${e.message}`));
}

/**
 * Un servidor de ficheros en 127.0.0.1, en un puerto que da el sistema, para lo que el taller abre
 * en Chromium (`art/montura`: three.js y los modelos; `taller/escenario`: la página del pintor y el
 * arte). Hace falta un servidor porque una imagen cargada desde `file://` contamina el lienzo y la
 * página ya no puede leer sus píxeles. `donde` dice qué fichero sirve cada ruta pedida (sin la
 * consulta y descodificada), o `null` si ninguno; lo que no da o no se lee, 404 con la ruta. El
 * tipo, por la extensión (`tipos`), o `application/octet-stream`.
 */
export async function servirFicheros(
  donde: (pedida: string) => string | null,
  tipos: Readonly<Record<string, string>>,
): Promise<{ servidor: Server; base: string }> {
  const servidor = createHttpServer(async (req, res) => {
    const pedida = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const ruta = donde(pedida);
    // Un fichero que no está o es una carpeta no es un fallo del servidor: es un 404 para la página.
    const bytes = ruta === null ? null : await readFile(ruta).catch(() => null);
    if (ruta === null || bytes === null) {
      res.writeHead(404).end(`no está: ${pedida}`);
      return;
    }
    res
      .writeHead(200, { 'content-type': tipos[extname(ruta)] ?? 'application/octet-stream' })
      .end(bytes);
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  return { servidor, base: `http://127.0.0.1:${port}` };
}
