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
import { chromium } from 'playwright';
import { newGame } from '../../../src/core/state/setup.js';
import { derivarPieza } from '../derivar.js';
import { componer, type PiezasExtra } from './colocar.js';
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

export async function escenario(semillas: readonly number[], tile = 48): Promise<Resultado[]> {
  await mkdir(DIR_ESCENARIO, { recursive: true });
  const ejecutable = chromiumInstalado();
  const navegador = await chromium.launch(
    ejecutable === undefined ? {} : { executablePath: ejecutable },
  );
  const fuera: Resultado[] = [];
  const { servidor, base } = await servir();
  // Las piezas del atlas viejo no traen JSON: se miden aquí.
  const extra: Record<string, PiezasExtra[string]> = {};
  for (const id of ['atlas/mina', 'atlas/cofre']) {
    const d = await derivarPieza(join(RAIZ, `assets/mapa/${id}.webp`));
    extra[id] = { src: `${id}.webp`, nw: d.ancho, nh: d.alto, ax: d.ancla[0], ay: d.ancla[1] };
  }
  try {
    for (const semilla of semillas) {
      const escena = componer(newGame({ seed: semilla }).map, semilla, extra);
      const html = join(DIR_ESCENARIO, `${semilla}.html`);
      await writeFile(html, paginaDeEscena(escena, '../../../assets/mapa/', tile));
      const pagina = await navegador.newPage({ viewport: { width: 1800, height: 1800 } });
      const errores: string[] = [];
      pagina.on('pageerror', (e) => errores.push(String(e)));
      pagina.on('console', (m) => {
        if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|404/.test(m.text()))
          errores.push(m.text());
      });
      await pagina.goto(`${base}/.cache/taller/escenario/${semilla}.html`);
      await pagina.waitForFunction(
        () => (window as unknown as { __informe?: unknown }).__informe !== undefined,
        null,
        {
          timeout: 120_000,
        },
      );
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
  } finally {
    await navegador.close();
    servidor.close();
  }
  return fuera;
}
