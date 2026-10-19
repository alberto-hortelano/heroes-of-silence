/**
 * Lo que comparten los arneses de navegador (`pnpm capturas`,
 * `tools/qa/neutro.ts`): un vite propio, en un puerto que elige el sistema y en
 * su propio grupo de procesos, para matarlo entero sin tocar el vite de nadie más
 * (la máquina es compartida); el Chromium que haya, y la espera del suelo del mapa.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

export function matarGrupo(p: ChildProcess | null, log: (msg: string) => void): void {
  if (p?.pid === undefined || p.exitCode !== null) return;
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch (err) {
    // El grupo ya no existe: se dice, no se calla, pero no es un fallo del guion.
    log(`el grupo ya había terminado: ${err instanceof Error ? err.message : err}`);
  }
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
