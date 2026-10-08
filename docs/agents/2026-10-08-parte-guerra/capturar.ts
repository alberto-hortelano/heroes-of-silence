/**
 * Captura del parte de guerra con una espera y una defensa (#82), en el cliente
 * de verdad y con clics: abre una partida, pulsa una guardia que se ve desde el
 * héroe, y en la batalla pulsa «Esperar» y luego «Defender».
 *
 * La semilla y la guardia las busca el espejo (`Session`), como `capturas.ts`.
 * Uso (con un vite ya arrancado): npx tsx docs/agents/2026-10-08-parte-guerra/capturar.ts http://localhost:3347
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { TILE_INICIAL } from '../../../src/client/render/camara-mapa.js';
import { Session } from '../../../src/client/session.js';
import { encuadreDe, pixelDeCasilla, tocable } from '../../../tools/qa/escenas-de-capturas.js';

const URL_BASE = process.argv[2] ?? 'http://localhost:3347';
const DESTINO = 'docs/agents/2026-10-08-parte-guerra/capturas';
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function chromiumInstalado(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  return readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .map((d) => join(cache, d, 'chrome-linux64', 'chrome'))
    .find((p) => existsSync(p));
}

const browser = await chromium.launch({ headless: true, executablePath: chromiumInstalado() });
const errores: string[] = [];
const nueva = async (): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  page.on('pageerror', (e) => errores.push(String(e)));
  return page;
};

try {
  // La caja del lienzo no depende de la partida: se mide con la semilla 1.
  const medir = await nueva();
  await medir.goto(`${URL_BASE}/?seed=1`, { waitUntil: 'networkidle' });
  const b = await medir.locator('#canvas').boundingBox();
  if (b === null) throw new Error('el lienzo no está en la página');
  await medir.close();

  // Una semilla con una guardia que se toca con la cámara en el héroe y a la que
  // un clic lleva a la batalla, y en la que a la persona le toca esperar antes
  // de que se acabe.
  let elegida: { semilla: number; x: number; y: number } | null = null;
  for (let semilla = 1; semilla <= 300 && elegida === null; semilla++) {
    const mira = new Session(semilla);
    const e = encuadreDe(b, mira);
    for (const o of mira.state.map.objects) {
      if (o.kind !== 'monster' || o.defeated) continue;
      const p = pixelDeCasilla(b, e, TILE_INICIAL, mira, o.at);
      if (!tocable(b, p)) continue;
      const espejo = new Session(semilla);
      espejo.clickTile(o.at);
      if (espejo.battle === null) continue;
      elegida = { semilla, ...p };
      break;
    }
  }
  if (elegida === null) throw new Error('ninguna semilla de 1-300 tiene una guardia tocable');
  console.log(`semilla ${elegida.semilla}, guardia en el píxel (${elegida.x}, ${elegida.y})`);

  const page = await nueva();
  await page.goto(`${URL_BASE}/?seed=${elegida.semilla}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app[data-escenario="pintado"]', { timeout: 60_000 });
  await sleep(500);
  await page.mouse.click(elegida.x, elegida.y);

  const boton = (accion: string) => page.locator(`button[data-action="${accion}"]:not([disabled])`);
  await boton('battle-wait').waitFor({ timeout: 30_000 });
  await sleep(800);
  await page.screenshot({ path: `${DESTINO}/01-batalla-antes-de-esperar.png` });
  await boton('battle-wait').click();
  await page.locator('#side .log', { hasText: 'Espera ' }).waitFor({ timeout: 10_000 });
  // La siguiente decisión de la persona: «Defender» habilitado otra vez.
  await sleep(1500);
  await boton('battle-defend').waitFor({ timeout: 30_000 });
  // El parte va al final del panel lateral, que hace scroll: se baja hasta él.
  await page.locator('#side .log').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DESTINO}/02-parte-con-la-espera.png` });
  await boton('battle-defend').click();
  await page.locator('#side .log', { hasText: 'Se defiende ' }).waitFor({ timeout: 10_000 });
  await sleep(1500);
  await page.locator('#side .log').scrollIntoViewIfNeeded();
  // La caja del parte tiene su propio scroll y se queda arriba: se baja a lo último.
  await page.locator('#side .log').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: `${DESTINO}/03-parte-con-la-defensa.png` });
  const log = await page.locator('#side .log').innerText();
  console.log('--- parte de guerra en la página ---');
  console.log(log);
  await page.locator('#side .log').screenshot({ path: `${DESTINO}/04-el-parte.png` });
} finally {
  await browser.close();
}
console.log(errores.length === 0 ? 'consola: sin errores' : `consola: ${errores.join('\n')}`);
if (errores.length > 0) process.exitCode = 1;
