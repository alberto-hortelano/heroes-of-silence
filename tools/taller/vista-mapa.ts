/**
 * La composición de prueba de los mapas densos: un mapa real del generador
 * (`newGame`), pintado con las texturas y las piezas de `mapa-denso.ts`.
 *
 * Sirve para juzgar el arte en su sitio —un bosque nevado tiene que leerse
 * como muro al lado de la nieve, no en una lámina— y para proponer a la sesión
 * de reglas cómo elegir la pieza de cada casilla (`piezaDeCasilla`,
 * `nodoDePaso`). No es el render del juego: `render/mapa.ts` no se toca.
 *
 * Lo que aún no existe se pinta con su pigmento, así que la página vale desde
 * el primer encargo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { HITOS, NODOS, nodoDePaso, pasoDeNodo } from '../../src/client/render/escenario/nodos.js';
import { pigments } from '../../src/client/render/terreno.js';
import type { MapObject } from '../../src/core/map/map.js';
import {
  type Barrera,
  esBarrera,
  type Suelo,
  type TerrainKind,
} from '../../src/core/map/terrain.js';
import { newGame } from '../../src/core/state/setup.js';
import { familiasConIds, idsDe, LAMINAS, piezaDeCasilla, TEXTURAS } from './mapa-denso.js';
import { DIR_VISTA } from './vista.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Cuántas casillas de ancho ocupa cada clase de pieza en la composición. */
const ANCHO_EN_CASILLAS = {
  borde: 2.0,
  /** La orilla es baja y larga: a 2 casillas parecía un tronco flotando en el agua. */
  orilla: 1.3,
  obstaculo: 1.15,
  nodo: 1.7,
  ciudad: 2.4,
  pueblo: 1.9,
} as const;

/** Una casilla de mancha interior tiene a lo sumo este tamaño: las fronteras son más largas. */
const MANCHA_MAXIMA = 6;

interface Medidas {
  readonly ancho: number;
  readonly alto: number;
  readonly ancla: readonly [number, number];
}

function medidas(id: string): Medidas | null {
  const ruta = join(RAIZ, `assets/mapa/${id}.json`);
  if (!existsSync(ruta)) return null;
  const j = JSON.parse(readFileSync(ruta, 'utf8')) as Medidas;
  return { ancho: j.ancho, alto: j.alto, ancla: j.ancla };
}

/** Un entero de 0 a 9 699 que depende solo de la casilla y la semilla. */
function azar(x: number, y: number, semilla: number): number {
  return (((x * 73856093) ^ (y * 19349663) ^ (semilla * 83492791)) >>> 0) % 9700;
}

interface Cosa {
  readonly pieza: string | null;
  /** El pie, en casillas. */
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly color: string;
  readonly etiqueta: string;
}

export interface MapaCompuesto {
  readonly ancho: number;
  readonly alto: number;
  /** El suelo que se pinta debajo de cada casilla (el de al lado si es barrera), o el agua. */
  readonly suelo: readonly (Suelo | 'water')[];
  readonly barrera: readonly (Barrera | null)[];
  readonly cosas: readonly Cosa[];
  /** Parejas de barrera y suelo para las que no hay familia: lo que faltaría. */
  readonly sinPieza: readonly string[];
}

/** Compone el mapa de una semilla: suelo de cada casilla y piezas ordenadas por el pie. */
export function componerMapa(semilla: number): MapaCompuesto {
  const { map } = newGame({ seed: semilla });
  const W = map.width;
  const H = map.height;
  const terreno = map.terrain as readonly TerrainKind[];
  const nodos = new Set(
    map.objects.filter((o) => o.kind === 'node').map((o) => o.at.y * W + o.at.x),
  );

  // Las manchas interiores son componentes pequeños de una misma barrera que no
  // tocan el borde del mapa; lo demás es frontera.
  const componente = new Int32Array(W * H).fill(-1);
  const tamano: number[] = [];
  const alBorde: boolean[] = [];
  for (let i = 0; i < W * H; i++) {
    const t = terreno[i] as TerrainKind;
    if (!esBarrera(t) || componente[i] !== -1) continue;
    const c = tamano.length;
    tamano.push(0);
    alBorde.push(false);
    const pila = [i];
    componente[i] = c;
    while (pila.length > 0) {
      const j = pila.pop() as number;
      tamano[c] = (tamano[c] as number) + 1;
      const x = j % W;
      const y = Math.floor(j / W);
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) alBorde[c] = true;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (componente[k] === -1 && terreno[k] === t) {
          componente[k] = c;
          pila.push(k);
        }
      }
    }
  }

  // El suelo más cercano de cada casilla, y de qué lado queda: un BFS desde
  // todas las casillas que se pisan (los nodos no, que son tierra de paso).
  const cercano = new Int32Array(W * H).fill(-1);
  const cola: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!esBarrera(terreno[i] as TerrainKind) && !nodos.has(i)) {
      cercano[i] = i;
      cola.push(i);
    }
  }
  for (let q = 0; q < cola.length; q++) {
    const j = cola[q] as number;
    const x = j % W;
    const y = Math.floor(j / W);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (cercano[k] === -1) {
          cercano[k] = cercano[j] as number;
          cola.push(k);
        }
      }
  }

  const suelo: (Suelo | 'water')[] = [];
  const barrera: (Barrera | null)[] = [];
  const cosas: Cosa[] = [];
  const sinPieza = new Set<string>();
  for (let i = 0; i < W * H; i++) {
    const t = terreno[i] as TerrainKind;
    const x = i % W;
    const y = Math.floor(i / W);
    const fuente = cercano[i] as number;
    const s = (fuente === -1 ? 'dirt' : terreno[fuente]) as Suelo;
    if (!esBarrera(t)) {
      suelo.push(t);
      barrera.push(null);
      continue;
    }
    suelo.push(t === 'water' ? 'water' : s);
    barrera.push(t);
    const c = componente[i] as number;
    const uso = (tamano[c] as number) <= MANCHA_MAXIMA && !alBorde[c] ? 'obstaculo' : 'borde';
    // El agua solo lleva orilla donde toca tierra: el resto es el pigmento.
    if (
      t === 'water' &&
      Math.max(Math.abs((fuente % W) - x), Math.abs(Math.floor(fuente / W) - y)) > 1
    )
      continue;
    // El eje de la frontera: si el suelo cercano queda arriba o abajo, corre a lo ancho.
    const ddx = (fuente % W) - x;
    const ddy = Math.floor(fuente / W) - y;
    const eje = Math.abs(ddy) >= Math.abs(ddx) ? 'ancho' : 'hondo';
    // Un tramo con cara (muro, acantilado) en cada casilla se apila como un
    // peine en una frontera diagonal: uno de cada dos basta, porque mide dos.
    if (uso === 'borde' && (t === 'wall' || t === 'cliff') && (x + y) % 2 === 1) continue;
    const pieza = piezaDeCasilla(t, s, uso, azar(x, y, semilla), eje);
    if (pieza === null) sinPieza.add(`${t} ${uso === 'borde' ? 'junto a' : 'dentro de'} ${s}`);
    cosas.push({
      pieza,
      x: x + 0.5 + ((azar(x, y, semilla) % 5) - 2) * 0.06,
      y: y + 0.85,
      ancho: t === 'water' ? ANCHO_EN_CASILLAS.orilla : ANCHO_EN_CASILLAS[uso],
      color: rgb(pigments[t]),
      etiqueta: `${t} ${uso} sobre ${s}`,
    });
  }

  for (const o of map.objects) cosas.push(...cosaDeObjeto(o, W, terreno));
  cosas.sort((a, b) => a.y - b.y || a.x - b.x);
  return { ancho: W, alto: H, suelo, barrera, cosas, sinPieza: [...sinPieza].sort() };
}

function rgb(c: readonly [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function cosaDeObjeto(o: MapObject, W: number, terreno: readonly TerrainKind[]): Cosa[] {
  const x = o.at.x + 0.5;
  const y = o.at.y + 0.85;
  switch (o.kind) {
    case 'node': {
      const { barrera, eje } = pasoDeNodo(o, W, terreno);
      const pieza = nodoDePaso(o.id, barrera, eje);
      return [
        {
          pieza,
          x,
          y,
          ancho: ANCHO_EN_CASILLAS.nodo,
          color: '#c9b27a',
          etiqueta: `nodo (${barrera}, ${eje})`,
        },
      ];
    }
    case 'town':
      return [
        {
          pieza: 'ciudad',
          x,
          y,
          ancho: ANCHO_EN_CASILLAS.ciudad,
          color: '#d8c8a0',
          etiqueta: 'ciudad',
        },
      ];
    case 'village':
      return [
        {
          pieza: 'pueblo',
          x,
          y,
          ancho: ANCHO_EN_CASILLAS.pueblo,
          color: '#b89870',
          etiqueta: 'pueblo',
        },
      ];
    case 'monster':
    case 'chest':
      return [
        {
          pieza: null,
          x,
          y,
          ancho: 0.5,
          color: o.kind === 'monster' ? '#b0553f' : '#8a7a5a',
          etiqueta: o.kind,
        },
      ];
  }
}

/** La página: el mapa compuesto, con zoom, y la galería de todo el catálogo. */
export async function vistaMapa(semilla = 1): Promise<string> {
  const m = componerMapa(semilla);
  const usadas = new Set(m.cosas.map((c) => c.pieza).filter((p): p is string => p !== null));
  const catalogo = [
    ...familiasConIds().flatMap(({ ids }) => ids),
    ...NODOS.flatMap(idsDe),
    ...HITOS,
    'ciudad',
    'pueblo',
  ];
  const piezas = Object.fromEntries(
    [...new Set([...catalogo, ...usadas])].map((id) => [id, medidas(id)]),
  );
  const texturas = Object.fromEntries(
    Object.keys(TEXTURAS).map((s) => [s, existsSync(join(RAIZ, `assets/mapa/suelos/${s}.webp`))]),
  );
  const laminas = (Object.keys(LAMINAS) as (keyof typeof LAMINAS)[]).filter((l) =>
    existsSync(join(RAIZ, `assets/mapa/muestras/denso-${l}.webp`)),
  );
  const pigmentos = Object.fromEntries(Object.entries(pigments).map(([k, v]) => [k, rgb(v)]));
  const hechas = Object.values(piezas).filter((p) => p !== null).length;
  const datos = JSON.stringify({ m, piezas, texturas, pigmentos });
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Mapa denso</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #14150f; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; background: #1e2018ee; padding: 8px 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  header b { font-size: 15px; }
  .aviso { color: #e0a060; }
  #marco { overflow: auto; max-height: calc(100vh - 52px); }
  canvas { display: block; }
  h2 { font-size: 15px; margin: 18px 16px 6px; }
  .galeria { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; padding: 0 16px 16px; }
  figure { margin: 0; background: #23261c; border-radius: 6px; padding: 6px; }
  figure img { width: 100%; height: 130px; object-fit: contain; object-position: bottom; display: block; }
  figure.falta { opacity: .45; }
  figcaption { font-size: 12px; color: #c9c2a8; margin-top: 4px; word-break: break-all; }
  .lamina img { max-width: 100%; }
  .texturas { display: flex; gap: 10px; flex-wrap: wrap; padding: 0 16px 16px; }
  .textura { width: 256px; height: 256px; background-size: 128px 128px; border-radius: 6px; display: flex; align-items: end; }
  .textura span { background: #000a; padding: 2px 6px; font-size: 12px; }
</style></head><body>
<header>
  <b>Mapa denso · semilla ${semilla}</b>
  <label>casilla <input id="zoom" type="range" min="20" max="110" step="2" value="48"> <span id="px">48</span> px</label>
  <label><input id="rejilla" type="checkbox"> rejilla</label>
  <label><input id="piezas" type="checkbox" checked> piezas</label>
  <span>${hechas} de ${Object.keys(piezas).length} piezas hechas</span>
  ${m.sinPieza.length > 0 ? `<span class="aviso">sin familia: ${m.sinPieza.join(' · ')}</span>` : ''}
</header>
<div id="marco"><canvas id="lienzo"></canvas></div>
<h2>Texturas del suelo (repetidas 2×2: la costura no se debe ver)</h2>
<div class="texturas">${Object.keys(TEXTURAS)
    .map(
      (s) =>
        `<div class="textura" style="${texturas[s] ? `background-image:url(../../../assets/mapa/suelos/${s}.webp)` : `background:${pigmentos[s]}`}"><span>${s}${texturas[s] ? '' : ' (falta)'}</span></div>`,
    )
    .join('')}</div>
${laminas.map((l) => `<h2>Lámina ${l.toUpperCase()}</h2><div class="lamina" style="padding:0 16px"><img src="../../../assets/mapa/muestras/denso-${l}.webp"></div>`).join('')}
<h2>Piezas</h2>
<div class="galeria">${Object.entries(piezas)
    .map(([id, p]) =>
      p === null
        ? `<figure class="falta"><div style="height:130px"></div><figcaption>${id} (falta)</figcaption></figure>`
        : `<figure><img src="../../../assets/mapa/${id}.webp" loading="lazy"><figcaption>${id} · ${p.ancho}×${p.alto}</figcaption></figure>`,
    )
    .join('')}</div>
<script>
const D = ${datos};
const R = '../../../assets/mapa/';
const imgs = {};
let pendientes = 0;
function cargar(clave, src) {
  if (imgs[clave] !== undefined) return imgs[clave];
  const im = new Image();
  imgs[clave] = im;
  pendientes++;
  im.onload = im.onerror = () => { pendientes--; dibujar(); };
  im.src = src;
  return im;
}
for (const [s, hay] of Object.entries(D.texturas)) if (hay) cargar('suelo-' + s, R + 'suelos/' + s + '.webp');
for (const [id, p] of Object.entries(D.piezas)) if (p !== null) cargar(id, R + id + '.webp');
const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d');
const patrones = {};
function dibujar() {
  const T = Number(document.getElementById('zoom').value);
  document.getElementById('px').textContent = T;
  const { m } = D;
  const dpr = window.devicePixelRatio || 1;
  lienzo.width = m.ancho * T * dpr;
  lienzo.height = (m.alto + 1) * T * dpr;
  lienzo.style.width = m.ancho * T + 'px';
  lienzo.style.height = (m.alto + 1) * T + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, T);
  ctx.imageSmoothingQuality = 'high';
  // 1 · el suelo: la textura anclada al mundo (una textura de 512 cubre 4 casillas).
  for (let y = 0; y < m.alto; y++)
    for (let x = 0; x < m.ancho; x++) {
      const s = m.suelo[y * m.ancho + x];
      const im = imgs['suelo-' + s];
      if (im && im.complete && im.naturalWidth > 0) {
        let p = patrones[s];
        if (!p) { p = patrones[s] = ctx.createPattern(im, 'repeat'); }
        p.setTransform(new DOMMatrix().scale((4 * T) / im.naturalWidth));
        ctx.fillStyle = p;
      } else ctx.fillStyle = D.pigmentos[s];
      ctx.fillRect(x * T, y * T, T + 0.5, T + 0.5);
      const b = m.barrera[y * m.ancho + x];
      if (b !== null && b !== 'water') {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x * T, y * T, T + 0.5, T + 0.5);
      }
    }
  if (document.getElementById('rejilla').checked) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x <= m.ancho; x++) { ctx.beginPath(); ctx.moveTo(x * T, 0); ctx.lineTo(x * T, m.alto * T); ctx.stroke(); }
    for (let y = 0; y <= m.alto; y++) { ctx.beginPath(); ctx.moveTo(0, y * T); ctx.lineTo(m.ancho * T, y * T); ctx.stroke(); }
  }
  if (!document.getElementById('piezas').checked) return;
  // 2 · las piezas, por el pie: el ancla de la pieza va al pie de la cosa.
  for (const c of m.cosas) {
    const p = c.pieza === null ? null : D.piezas[c.pieza];
    const im = c.pieza === null ? null : imgs[c.pieza];
    const w = c.ancho * T;
    if (p && im && im.complete && im.naturalWidth > 0) {
      const k = w / p.ancho;
      ctx.drawImage(im, c.x * T - p.ancla[0] * k, c.y * T - p.ancla[1] * k, p.ancho * k, p.alto * k);
    } else {
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(c.x * T - w / 4, c.y * T - w / 2, w / 2, w / 2);
      ctx.globalAlpha = 1;
    }
  }
}
document.getElementById('zoom').addEventListener('input', dibujar);
document.getElementById('rejilla').addEventListener('change', dibujar);
document.getElementById('piezas').addEventListener('change', dibujar);
dibujar();
</script></body></html>
`;
  await mkdir(DIR_VISTA, { recursive: true });
  const ruta = join(DIR_VISTA, 'mapa-denso.html');
  await writeFile(ruta, html);
  return ruta;
}
