/**
 * La hoja de REFERENCIA DE POSE montada: un caballo y su jinete renderizados con
 * la cámara del juego, para que ChatGPT los repinte como hace con el maniquí a
 * pie (`tools/art/poses.ts`).
 *
 *   npx tsx tools/art/montura.ts            → assets/unidades/_poses/montado-lanza.png + .json
 *   npx tsx tools/art/montura.ts --prueba   → fotogramas sueltos en .cache/taller/montura/
 *
 * No parchea sprite-forge: aquí hay dos modelos, uno en glTF y otro que no es un
 * humanoide de Mixamo, y todos sus guardias suponen lo contrario. Monta su propia
 * escena (`tools/art/montura/escena.js`) con la misma cámara y la misma luz, la
 * sirve con un `node:http` local y la conduce con el Chromium de Playwright.
 * three.js sale de `../sprite-forge/node_modules/three`, sin dependencia nueva.
 *
 * El caballo: `tools/art/modelos/caballo-quaternius.glb` (CC0, ver `LICENCIA.md`).
 * El jinete: el `y_bot` y `sitting_idle` de ne-fan, como en `poses.ts`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { FIGURA } from '../../src/shared/arte.js';
import { indicesDeClip } from './poses.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const FORGE = resolve(process.env.SPRITE_FORGE_DIR ?? join(RAIZ, '../sprite-forge'));
const FBX = resolve(process.env.SPRITE_FORGE_ASSETS ?? join(RAIZ, '../ne-fan/assets/characters'));
const ESCENA = join(RAIZ, 'tools/art/montura');
const MODELOS = join(RAIZ, 'tools/art/modelos');
const CABALLO = join(MODELOS, 'caballo-quaternius.glb');
const DIR_POSES = join(RAIZ, 'assets/unidades/_poses');

/** La celda de las monturas: a la escala humana de siempre no caben en 256. */
export const CELDA_MONTADA = 384;

/**
 * La colocación del jinete, en metros y en los ejes del caballo. Calibrada a ojo
 * sobre el render (`--prueba`): es lo único de este fichero que no sale de una
 * medida, y por eso está junto, en una tabla, y no repartido por el código.
 */
const AJUSTE = {
  sillaAdelante: 0.28,
  sillaArriba: 0.2,
  estriboAdelante: 0.32,
  estriboArriba: -0.45,
  estriboLado: 0.32,
  lanza: 2.6,
  espada: 0.9,
  /**
   * Giro de la espada respecto a la mano derecha (radianes, XYZ). Elegido entre
   * tres probados sobre el render: con -90° en Z la hoja sale del puño. Se puede
   * probar otro con `MONTURA_GIRO=x,y,z npx tsx tools/art/montura.ts --prueba`.
   */
  espadaGiro: (process.env.MONTURA_GIRO?.split(',').map(Number) ?? [0, 0, -Math.PI / 2]) as [
    number,
    number,
    number,
  ],
  sentadoT: 0,
};

/**
 * Las cuatro filas de la hoja montada (decisión del usuario, 02-10-2026):
 * reposo y paso con la lanza en alto; la CARGA, que es el paso con la lanza
 * bajada y en bucle como la marcha; y el ATAQUE ya parado en combate, con el
 * caballo quieto y el jinete dando un tajo de espada, sin lanza.
 */
const FILAS = [
  { clip: 'idle', caballo: 'Idle', postura: 'reposo', enBucle: true },
  { clip: 'walk', caballo: 'Walk', postura: 'reposo', enBucle: true },
  { clip: 'charge', caballo: 'Walk', postura: 'carga', enBucle: true },
  { clip: 'attack', caballo: 'Idle', postura: 'ataque', enBucle: false },
] as const;

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.fbx': 'application/octet-stream',
};

/** Sirve tres raíces y nada fuera de ellas. */
function servir(): Promise<Server> {
  const raices: Record<string, string> = {
    '/three/': join(FORGE, 'node_modules/three/'),
    '/modelos/': `${MODELOS}/`,
    '/fbx/': `${FBX}/`,
  };
  const servidor = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0] as string);
    let ruta: string | null = null;
    if (url === '/') ruta = join(ESCENA, 'pagina.html');
    else if (url === '/escena.js') ruta = join(ESCENA, 'escena.js');
    else {
      for (const [prefijo, dir] of Object.entries(raices)) {
        if (!url.startsWith(prefijo)) continue;
        const r = normalize(join(dir, url.slice(prefijo.length)));
        if (r.startsWith(normalize(dir)) || r === normalize(dir).replace(new RegExp(`${sep}$`), ''))
          ruta = r;
      }
    }
    if (ruta === null || !existsSync(ruta)) {
      res.writeHead(404).end(`no está: ${url}`);
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(ruta)] ?? 'application/octet-stream' });
    res.end(await readFile(ruta));
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(servidor)));
}

/** El Chromium de Playwright: el que pide, o el más reciente de los que hay (como `capturas.ts`). */
function ejecutable(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const hay = existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
        .map((d) => join(cache, d, 'chrome-linux64', 'chrome'))
        .filter((p) => existsSync(p))
    : [];
  if (hay[0] === undefined)
    throw new Error('no hay Chromium de Playwright: `npx playwright install chromium`');
  return hay[0];
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

export async function renderizarMontura(prueba: boolean): Promise<string> {
  for (const [que, ruta] of [
    ['el caballo', CABALLO],
    ['three.js de sprite-forge', join(FORGE, 'node_modules/three/build/three.module.js')],
    ['el y_bot', join(FBX, 'mixamo/y_bot/character.fbx')],
    ['sitting_idle', join(FBX, 'mixamo/ambient_anims/sitting_idle.fbx')],
    ['el tajo de espada', join(FBX, 'anims/sword_and_shield/sword and shield slash.fbx')],
  ] as const) {
    if (!existsSync(ruta)) throw new Error(`no encuentro ${que} en ${ruta}`);
  }
  const servidor = await servir();
  const puerto = (servidor.address() as AddressInfo).port;
  const exe = ejecutable();
  const navegador = await chromium.launch({
    ...(exe === undefined ? {} : { executablePath: exe }),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const pagina = await navegador.newPage();
    const errores: string[] = [];
    pagina.on('pageerror', (e) => errores.push(e.message));
    await pagina.goto(`http://127.0.0.1:${puerto}/`);
    await pagina.waitForFunction(
      () => (window as unknown as { __listo?: boolean }).__listo === true,
      null,
      {
        timeout: 30_000,
      },
    );
    // La escala humana de siempre: 2,8 m de encuadre en 256 px, así que 4,2 m en 384.
    const ortho = (FIGURA.camara.ortho * CELDA_MONTADA) / FIGURA.celda;
    const info = await pagina.evaluate((o) => (window as any).__montar(o), {
      caballo: '/modelos/caballo-quaternius.glb',
      ybot: '/fbx/mixamo/y_bot/character.fbx',
      sentado: '/fbx/mixamo/ambient_anims/sitting_idle.fbx',
      ataque: '/fbx/anims/sword_and_shield/sword and shield slash.fbx',
      celda: CELDA_MONTADA,
      picado: -FIGURA.camara.elevacionGrados,
      ortho,
      mira: 1.25,
      // Tres cuartos hacia la derecha y el frente, como el maniquí a pie: nunca de perfil.
      guinada: Math.PI / 2 - Math.PI / 5,
      altoCaballo: 1.75,
      ajuste: AJUSTE,
    });
    if (errores.length > 0) throw new Error(`la escena falló: ${errores.join(' | ')}`);
    console.log('clips del caballo:', info.clips.join(', '));

    const { columnas } = FIGURA;
    const celdas: { fila: number; col: number; png: Buffer }[] = [];
    const indices: Record<string, number[]> = {};
    const duraciones = Object.fromEntries(
      (info.clips as string[]).map((c) => {
        const m = /^(.*) \(([\d.]+) s\)$/.exec(c);
        return [m?.[1], Number(m?.[2])];
      }),
    ) as Record<string, number>;
    for (const [fila, f] of FILAS.entries()) {
      // El ataque lo marca el tajo del jinete; lo demás, el clip del caballo.
      const dur = f.postura === 'ataque' ? (info.duracionAtaque as number) : duraciones[f.caballo];
      if (dur === undefined) throw new Error(`el caballo no tiene ${f.caballo}`);
      // Se muestrea a 24 fps y se reparten 7 columnas por el clip.
      const total = Math.max(1, Math.round(dur * 24));
      indices[f.clip] = indicesDeClip(total, columnas, f.enBucle);
      for (const [col, i] of (indices[f.clip] as number[]).entries()) {
        const url = (await pagina.evaluate(
          ([clip, t, postura, tj]) => (window as any).__fotograma(clip, t, postura, tj),
          [f.caballo, f.postura === 'ataque' ? 0 : i / 24, f.postura, i / 24] as const,
        )) as string;
        celdas.push({ fila, col, png: Buffer.from(url.split(',')[1] as string, 'base64') });
      }
    }
    if (errores.length > 0) throw new Error(`la escena falló: ${errores.join(' | ')}`);

    if (prueba) {
      const dir = join(RAIZ, '.cache/taller/montura');
      await mkdir(dir, { recursive: true });
      for (const c of celdas) await writeFile(join(dir, `f${c.fila}-${c.col}.png`), c.png);
    }
    const png = await sharp({
      create: {
        width: columnas * CELDA_MONTADA,
        height: FILAS.length * CELDA_MONTADA,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(
        celdas.map((c) => ({
          input: c.png,
          left: c.col * CELDA_MONTADA,
          top: c.fila * CELDA_MONTADA,
        })),
      )
      .png()
      .toBuffer();
    const salida = prueba
      ? join(RAIZ, '.cache/taller/montura/montado-lanza.png')
      : join(DIR_POSES, 'montado-lanza.png');
    await mkdir(join(salida, '..'), { recursive: true });
    await writeFile(salida, png);
    if (!prueba) {
      await writeFile(
        join(DIR_POSES, 'montado-lanza.json'),
        `${JSON.stringify(
          {
            perfil: 'montado-lanza',
            ataque:
              'parado en combate: caballo quieto y tajo de espada; la carga es el paso con la lanza bajada',
            renderer: 'tools/art/montura.ts (three.js, la cámara y la luz de sprite-forge)',
            caballo: {
              fichero: 'tools/art/modelos/caballo-quaternius.glb',
              sha256: sha256(await readFile(CABALLO)),
              licencia: 'CC0 (ver tools/art/modelos/LICENCIA.md)',
            },
            jinete: { model: 'y_bot', postura: 'sitting_idle + IK de piernas y brazos' },
            camera: {
              pitchDegrees: -FIGURA.camara.elevacionGrados,
              projection: 'orthographic',
              ortho,
            },
            cell: CELDA_MONTADA,
            columns: columnas,
            clips: FILAS.map((f) => ({
              clip: f.clip,
              caballo: f.caballo,
              postura: f.postura,
              indices: indices[f.clip],
              fps: 24,
            })),
            ajuste: AJUSTE,
            sha256: sha256(png),
          },
          null,
          2,
        )}\n`,
      );
    }
    return salida;
  } finally {
    await navegador.close();
    servidor.close();
  }
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) console.log(`→ ${await renderizarMontura(process.argv.includes('--prueba'))}`);
