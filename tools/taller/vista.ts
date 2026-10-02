/**
 * Láminas de revisión de un lote: lo que se le enseña al usuario ANTES de
 * engancharlo al juego (los ids todavía no existen en el catálogo).
 *
 *   pnpm taller vista templario-escudo templario-mandoble …
 *
 * Escribe en `.cache/taller/vista/`:
 *  - `lote.png`: cada unidad sobre `campo.webp`, al tamaño al que la pinta la
 *    batalla, con la sombra del contrato de luz (`sombraDeFigura`), mirando a
 *    la derecha y espejada a la izquierda, como atacante y defensor;
 *  - `<id>.webp`: animado, reposo, marcha y ataque a su reloj, en los dos
 *    sentidos. Una fila de poses parecidas no es un ciclo de marcha: se revisa
 *    reproduciéndolo, no mirando la hoja.
 *
 * Que la lámina se vea bien NO es la aceptación: la aceptación es del usuario,
 * con capturas del juego cuando las unidades existan.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { sombraDeFigura } from '../../src/shared/arte.js';
import type { AtlasDerivado } from './derivar.js';

const RAIZ = resolve(import.meta.dirname, '../..');
export const DIR_VISTA = join(RAIZ, '.cache/taller/vista');
/** Alto en pantalla de una figura adulta en la batalla (≈ 0,95 × el paso del tablero). */
const ALTO_EN_JUEGO = 132;

interface Hoja {
  readonly id: string;
  readonly png: Buffer;
  readonly atlas: AtlasDerivado;
}

async function cargar(id: string): Promise<Hoja> {
  const dir = join(RAIZ, 'assets/unidades', id);
  const atlas = JSON.parse(await readFile(join(dir, 'atlas.json'), 'utf8')) as AtlasDerivado;
  const png = await sharp(await readFile(join(dir, 'atlas.webp')))
    .png()
    .toBuffer();
  return { id, png, atlas };
}

/** Un fotograma recortado y escalado como lo dibuja `drawCharacter`: la celda a `escala`. */
async function fotograma(
  h: Hoja,
  clip: keyof AtlasDerivado['clips'],
  i: number,
  escala: number,
  espejo: boolean,
): Promise<{ img: Buffer; ancla: [number, number]; lado: number }> {
  const { cell } = h.atlas;
  const c = h.atlas.clips[clip];
  const lado = Math.round(cell * escala);
  let img = sharp(h.png)
    .extract({ left: i * cell, top: c.row * cell, width: cell, height: cell })
    .resize(lado, lado);
  if (espejo) img = img.flop();
  const ax = espejo ? cell - c.anchor[0] : c.anchor[0];
  return {
    img: await img.png().toBuffer(),
    ancla: [Math.round(ax * escala), Math.round(c.anchor[1] * escala)],
    lado,
  };
}

/** La sombra de suelo de una figura, como la pinta la batalla: elipse desplazada según la luz. */
function sombra(x: number, suelo: number, alto: number): OverlayOptions {
  const s = sombraDeFigura(alto);
  const rx = alto * 0.36;
  const ry = rx * 0.42;
  const w = Math.ceil(rx * 2 + Math.abs(s.x) + 4);
  const h = Math.ceil(ry * 2 + Math.abs(s.y) + 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><ellipse cx="${rx + 2 + s.x * 0.35}" cy="${ry + 2 + s.y * 0.2}" rx="${rx}" ry="${ry}" fill="black" fill-opacity="${s.opacidad + 0.12}"/></svg>`;
  return { input: Buffer.from(svg), left: Math.round(x - rx - 2), top: Math.round(suelo - ry - 2) };
}

async function lamina(hojas: readonly Hoja[]): Promise<Buffer> {
  const ancho = 260 * hojas.length + 120;
  const alto = 520;
  const campo = await sharp(join(RAIZ, 'assets/rpg/campo.webp'))
    .resize(ancho, Math.round(alto * 1.9), { fit: 'cover' })
    .extract({ left: 0, top: Math.round(alto * 0.8), width: ancho, height: alto })
    .png()
    .toBuffer();
  const capas: OverlayOptions[] = [];
  for (const [n, h] of hojas.entries()) {
    const escala = ALTO_EN_JUEGO / 160;
    for (const [fila, espejo] of [false, true].entries()) {
      const x = 120 + n * 260 + (espejo ? 90 : 0);
      const suelo = 230 + fila * 230;
      const f = await fotograma(h, 'idle', 0, escala, espejo);
      capas.push(sombra(x, suelo, h.atlas.altura * escala));
      capas.push({ input: f.img, left: x - f.ancla[0], top: suelo - f.ancla[1] });
    }
  }
  return sharp(campo).composite(capas).png().toBuffer();
}

/** Los tres clips en bucle, en los dos sentidos, como un WebP animado de 12 fps. */
async function animacion(h: Hoja): Promise<Buffer> {
  const FPS = 12;
  const DUR = 2; // segundos
  const clips = ['idle', 'walk', 'attack'] as const;
  const W = 3 * 200;
  const H = 2 * 230;
  const escala = 1;
  const paginas: Buffer[] = [];
  for (let t = 0; t < FPS * DUR; t++) {
    const capas: OverlayOptions[] = [];
    for (const [k, clip] of clips.entries()) {
      const c = h.atlas.clips[clip];
      const i = c.loop
        ? Math.floor((t / FPS) * c.fps) % c.frames
        : Math.min(c.frames - 1, Math.floor(((t % FPS) / FPS) * c.fps));
      for (const [fila, espejo] of [false, true].entries()) {
        const f = await fotograma(h, clip, i, escala * 0.82, espejo);
        const x = 100 + k * 200;
        const suelo = 210 + fila * 230;
        capas.push(sombra(x, suelo, h.atlas.altura * 0.82));
        capas.push({ input: f.img, left: x - f.ancla[0], top: suelo - f.ancla[1] });
      }
    }
    paginas.push(
      await sharp({ create: { width: W, height: H, channels: 4, background: '#6f7550' } })
        .composite(capas)
        .raw()
        .toBuffer(),
    );
  }
  return sharp(Buffer.concat(paginas), {
    raw: { width: W, height: H * paginas.length, channels: 4, pageHeight: H },
  })
    .webp({ quality: 85, loop: 0, delay: Array(paginas.length).fill(Math.round(1000 / FPS)) })
    .toBuffer();
}

/** Un ejército de la página: su nombre y sus hojas, tropas primero y héroes después. */
export interface Ejercito {
  readonly id: string;
  readonly nombre: string;
  readonly tropas: readonly Hoja[];
  readonly heroes: readonly Hoja[];
}

/**
 * La página de los ejércitos: reproduce las hojas como las reproduce el juego
 * —cada clip a su reloj y anclado por sus pies, mirando a los dos lados, sobre
 * el campo de batalla— y deja elegir qué ejército se ve.
 *
 *  - **Uno**: sus tarjetas en rejilla, con reposo, marcha y ataque en tres columnas.
 *  - **Dos o tres**: cada columna de la página es un ejército, para compararlos
 *    tropa a tropa. Al elegir un cuarto se suelta el que se eligió primero.
 *
 * La selección vive en la URL (`#templarios,orkos`), así que una comparación se
 * recarga o se comparte tal cual. Se abre con `file://`: las imágenes se leen de
 * `assets/` con una ruta relativa, así que enseña siempre las hojas de ahora.
 */
function pagina(ejercitos: readonly Ejercito[]): string {
  const hoja = (h: Hoja) => ({
    id: h.id,
    src: `../../../assets/unidades/${h.id}/atlas.webp`,
    atlas: h.atlas,
  });
  const datos = ejercitos.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    tropas: e.tropas.map(hoja),
    heroes: e.heroes.map(hoja),
  }));
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Taller · ejércitos</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  header { padding: 12px 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; background: #1b1d16; z-index: 1; border-bottom: 1px solid #34382b; }
  .ejercitos { display: flex; gap: 6px; flex-wrap: wrap; }
  .ejercitos button { font: inherit; color: #e8e2cf; background: #2a2d22; border: 1px solid #4a4f3c; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
  .ejercitos button[aria-pressed="true"] { background: #6b5a2e; border-color: #c9a85a; }
  .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(744px, 1fr)); gap: 12px; padding: 12px 16px 16px; }
  .columnas { display: grid; gap: 12px; padding: 12px 16px 16px; align-items: start; }
  .columna { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  h2 { font-size: 16px; margin: 4px 0 0; }
  h3 { font-size: 13px; margin: 8px 0 0; color: #b9b29a; text-transform: uppercase; letter-spacing: .08em; grid-column: 1 / -1; }
  figure { margin: 0; background: #2a2d22; border-radius: 6px; overflow: hidden; }
  figcaption { padding: 6px 10px; display: flex; justify-content: space-between; gap: 8px; }
  canvas { display: block; width: 100%; background: url(../../../assets/rpg/campo.webp) center 70%; background-size: 170%; background-color: #7a7aa4; }
  label { display: flex; gap: 6px; align-items: center; }
  .ayuda { color: #b9b29a; }
</style></head><body>
<header><strong>Ejércitos del taller</strong>
  <div class="ejercitos" id="ejercitos"></div>
  <label>Velocidad <input id="vel" type="range" min="0.25" max="2" step="0.25" value="1"><span id="velv">1×</span></label>
  <label>Tamaño <input id="tam" type="range" min="0.6" max="1.6" step="0.1" value="1"><span id="tamv">1×</span></label>
  <span class="ayuda">Elige uno, o hasta tres para compararlos · en cada tarjeta: reposo · marcha · ataque; arriba a la derecha, abajo espejado</span>
</header>
<main id="vista"></main>
<script>
const EJERCITOS = ${JSON.stringify(datos)};
const CLIPS = ['idle', 'walk', 'attack'];
const SOMBRA = ${JSON.stringify(sombraDeFigura(100))};
const MAXIMO = 3;
let vel = 1, tam = 1;
const vel_ = document.getElementById('vel'), tam_ = document.getElementById('tam');
vel_.oninput = () => { vel = +vel_.value; document.getElementById('velv').textContent = vel + '×'; };
tam_.oninput = () => { tam = +tam_.value; document.getElementById('tamv').textContent = tam.toFixed(1) + '×'; };

// Una tarjeta por hoja, creada una sola vez y reutilizada al cambiar de vista.
const imagenes = new Map();
function tarjeta(h) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas'); c.width = 600; c.height = 440;
  const cap = document.createElement('figcaption');
  const f = Object.values(h.atlas.clips).map((k) => k.frames).join('/');
  const a = document.createElement('span'); a.textContent = h.id;
  const b = document.createElement('span'); b.textContent = 'altura ' + h.atlas.altura + ' px · fotogramas ' + f;
  cap.append(a, b); fig.append(c, cap);
  if (!imagenes.has(h.id)) { const img = new Image(); img.src = h.src; imagenes.set(h.id, img); }
  return { h, c, img: imagenes.get(h.id) };
}
let piezas = [];

// La selección, en el orden en que se eligió: al pasar de tres se suelta la primera.
function desdeLaUrl() {
  const ids = location.hash.slice(1).split(',').filter((id) => EJERCITOS.some((e) => e.id === id)).slice(0, MAXIMO);
  return ids.length > 0 ? ids : [EJERCITOS[0].id];
}
let seleccion = desdeLaUrl();
// Si se cambia la URL a mano con la página abierta, la vista la sigue.
addEventListener('hashchange', () => {
  const ids = desdeLaUrl();
  if (ids.join(',') !== seleccion.join(',')) { seleccion = ids; pintarVista(); }
});
const botones = document.getElementById('ejercitos');
for (const e of EJERCITOS) {
  const b = document.createElement('button');
  b.textContent = e.nombre + ' (' + (e.tropas.length + e.heroes.length) + ')';
  b.onclick = () => {
    if (seleccion.includes(e.id)) { if (seleccion.length > 1) seleccion = seleccion.filter((x) => x !== e.id); }
    else { seleccion = [...seleccion, e.id].slice(-MAXIMO); }
    pintarVista();
  };
  b.dataset.id = e.id;
  botones.append(b);
}

function titulo(texto, etiqueta) { const h = document.createElement(etiqueta); h.textContent = texto; return h; }

function pintarVista() {
  history.replaceState(null, '', '#' + seleccion.join(','));
  for (const b of botones.children) b.setAttribute('aria-pressed', String(seleccion.includes(b.dataset.id)));
  const vista = document.getElementById('vista');
  vista.replaceChildren();
  piezas = [];
  const elegidos = seleccion.map((id) => EJERCITOS.find((e) => e.id === id));
  if (elegidos.length === 1) {
    const e = elegidos[0];
    const rejilla = document.createElement('div'); rejilla.className = 'rejilla';
    rejilla.append(titulo('Tropas', 'h3'));
    for (const h of e.tropas) { const p = tarjeta(h); piezas.push(p); rejilla.append(p.c.parentElement); }
    if (e.heroes.length) rejilla.append(titulo('Héroes', 'h3'));
    for (const h of e.heroes) { const p = tarjeta(h); piezas.push(p); rejilla.append(p.c.parentElement); }
    vista.append(rejilla);
  } else {
    const columnas = document.createElement('div'); columnas.className = 'columnas';
    columnas.style.gridTemplateColumns = 'repeat(' + elegidos.length + ', minmax(0, 1fr))';
    for (const e of elegidos) {
      const col = document.createElement('div'); col.className = 'columna';
      col.append(titulo(e.nombre, 'h2'), titulo('Tropas', 'h3'));
      for (const h of e.tropas) { const p = tarjeta(h); piezas.push(p); col.append(p.c.parentElement); }
      if (e.heroes.length) col.append(titulo('Héroes', 'h3'));
      for (const h of e.heroes) { const p = tarjeta(h); piezas.push(p); col.append(p.c.parentElement); }
      columnas.append(col);
    }
    vista.append(columnas);
  }
  observar();
}

// Solo se dibujan las tarjetas que están a la vista: con cinco ejércitos hay
// medio centenar de lienzos, y repintarlos todos a 60 Hz no tiene sentido.
const visibles = new Set();
let observador = null;
function observar() {
  if (observador) observador.disconnect();
  visibles.clear();
  observador = new IntersectionObserver((entradas) => {
    for (const en of entradas) { if (en.isIntersecting) visibles.add(en.target); else visibles.delete(en.target); }
  });
  for (const p of piezas) observador.observe(p.c);
}

const t0 = performance.now();
function dibujar(ahora) {
  const t = ((ahora - t0) / 1000) * vel;
  for (const { h, c, img } of piezas) {
    if (!visibles.has(c)) continue;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    if (!img.complete || img.naturalWidth === 0) continue;
    const cell = h.atlas.cell, esc = 0.85 * tam;
    CLIPS.forEach((nombre, k) => {
      const clip = h.atlas.clips[nombre];
      const n = Math.floor(t * clip.fps);
      // El ataque se repite cada 2 s para poder verlo; en el juego sale una vez.
      const i = clip.loop ? n % clip.frames : Math.min(clip.frames - 1, Math.floor((t % 2) * clip.fps));
      [false, true].forEach((espejo, fila) => {
        const x = 100 + k * 200, suelo = 200 + fila * 215;
        const alto = h.atlas.altura * esc;
        const r = alto * 0.36;
        ctx.fillStyle = 'rgba(0,0,0,' + (SOMBRA.opacidad + 0.12) + ')';
        ctx.beginPath();
        ctx.ellipse(x + SOMBRA.x * alto / 100 * 0.35, suelo + SOMBRA.y * alto / 100 * 0.2, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save(); ctx.translate(x, suelo); if (espejo) ctx.scale(-1, 1);
        ctx.drawImage(img, i * cell, clip.row * cell, cell, cell,
          -clip.anchor[0] * esc, -clip.anchor[1] * esc, cell * esc, cell * esc);
        ctx.restore();
      });
    });
  }
  requestAnimationFrame(dibujar);
}
pintarVista();
requestAnimationFrame(dibujar);
</script></body></html>
`;
}

/** Los nombres de los ejércitos, en el orden de la página. */
const NOMBRES_DE_EJERCITO: Readonly<Record<string, string>> = {
  templarios: 'Templarios',
  'no-muertos': 'No muertos',
  imperio: 'Imperio',
  elfos: 'Elfos',
  orkos: 'Orkos',
};

/**
 * La página de todos los ejércitos (`ejercitos.html`), con las unidades del
 * taller que ya tienen atlas. Las que no lo tienen todavía no salen.
 */
export async function vistaEjercitos(): Promise<string> {
  const { HEROES, UNIDADES } = await import('./unidades.js');
  const conAtlas = (id: string): boolean =>
    existsSync(join(RAIZ, 'assets/unidades', id, 'atlas.json'));
  const ejercitos: Ejercito[] = [];
  for (const [id, nombre] of Object.entries(NOMBRES_DE_EJERCITO)) {
    const tropas = await Promise.all(
      UNIDADES.filter((u) => u.faccion === id && conAtlas(u.id)).map((u) => cargar(u.id)),
    );
    const heroes = await Promise.all(
      HEROES.filter((u) => u.faccion === id && conAtlas(u.id)).map((u) => cargar(u.id)),
    );
    if (tropas.length + heroes.length > 0) ejercitos.push({ id, nombre, tropas, heroes });
  }
  await mkdir(DIR_VISTA, { recursive: true });
  const ruta = join(DIR_VISTA, 'ejercitos.html');
  await writeFile(ruta, pagina(ejercitos));
  return ruta;
}

export async function vista(ids: readonly string[]): Promise<string[]> {
  await mkdir(DIR_VISTA, { recursive: true });
  const hojas = await Promise.all(ids.map(cargar));
  const fuera = [join(DIR_VISTA, 'animaciones.html'), join(DIR_VISTA, 'lote.png')];
  await writeFile(
    fuera[0] as string,
    pagina([{ id: 'seleccion', nombre: 'Selección', tropas: hojas, heroes: [] }]),
  );
  await writeFile(fuera[1] as string, await lamina(hojas));
  for (const h of hojas) {
    const r = join(DIR_VISTA, `${h.id}.webp`);
    await writeFile(r, await animacion(h));
    fuera.push(r);
  }
  return fuera;
}

/**
 * La página de revisión de los efectos de batalla: cada efecto animado en bucle
 * sobre una casilla del campo, con una figura al lado para la escala; los
 * iconos a 32 px (como se pintarán) y a 96 px; y los sprites quietos.
 */
export async function vistaEfectos(): Promise<string> {
  const { readdir } = await import('node:fs/promises');
  const base = join(RAIZ, 'assets/efectos');
  const animados = (await readdir(join(base, 'animados')))
    .filter((f) => f.endsWith('.json') && !f.endsWith('.procedencia.json'))
    .map((f) => f.slice(0, -5));
  // Los iconos pueden no existir todavía (la lámina va aparte): la página lo dice.
  const rutaIconos = join(base, 'iconos/iconos.json');
  const iconos = existsSync(rutaIconos)
    ? (JSON.parse(await readFile(rutaIconos, 'utf8')) as {
        iconos: { nombre: string; imagen: string }[];
      })
    : { iconos: [] };
  const rutaRecursos = join(RAIZ, 'assets/iconos/recursos/recursos.json');
  const recursos = existsSync(rutaRecursos)
    ? (JSON.parse(await readFile(rutaRecursos, 'utf8')) as {
        iconos: { nombre: string; imagen: string }[];
      })
    : { iconos: [] };
  const quietos = (await readdir(base))
    .filter((f) => f.endsWith('.webp'))
    .map((f) => f.slice(0, -5));
  const datos = await Promise.all(
    animados.map(async (id) => ({
      id,
      ...(JSON.parse(await readFile(join(base, 'animados', `${id}.json`), 'utf8')) as object),
    })),
  );
  const R = '../../../assets';
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Taller · efectos</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  h2 { font-size: 16px; padding: 12px 16px 0; margin: 0; }
  .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; padding: 12px 16px; }
  figure { margin: 0; background: #2a2d22; border-radius: 6px; overflow: hidden; }
  figcaption { padding: 6px 10px; }
  canvas { display: block; width: 100%; background: url(${R}/rpg/campo.webp) center 70%; background-size: 170%; background-color: #7a7aa4; }
  .iconos { display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 16px; }
  .icono { background: #2a2d22; border-radius: 6px; padding: 8px; text-align: center; width: 120px; }
  .icono img { display: block; margin: 4px auto; }
  .quieto img { width: 100%; height: 220px; object-fit: contain; background: url(${R}/rpg/campo.webp) center 70%; background-size: 170%; }
</style></head><body>
<h2>Efectos animados (en bucle; en el juego salen una vez)</h2>
<div class="rejilla" id="animados"></div>
<h2>Iconos de estado, a 32 px y a 96 px</h2>
<div class="iconos">${iconos.iconos.length === 0 ? '<p>Todavía no hay lámina de iconos.</p>' : ''}${iconos.iconos
    .map(
      (i) =>
        `<div class="icono"><img src="${R}/efectos/iconos/${i.imagen}" width="32" height="32"><img src="${R}/efectos/iconos/${i.imagen}" width="96" height="96">${i.nombre}</div>`,
    )
    .join('')}</div>
<h2>Iconos de recursos, a 20 px (como en la barra) y a 64 px</h2>
<div class="iconos">${recursos.iconos.length === 0 ? '<p>Todavía no hay iconos de recursos.</p>' : ''}${recursos.iconos
    .map(
      (i) =>
        `<div class="icono"><img src="${R}/iconos/recursos/${i.imagen}" width="20" height="20"><img src="${R}/iconos/recursos/${i.imagen}" width="64" height="64">${i.nombre}</div>`,
    )
    .join('')}</div>
<h2>Sprites quietos</h2>
<div class="rejilla">${quietos
    .map(
      (q) =>
        `<figure class="quieto"><img src="${R}/efectos/${q}.webp"><figcaption>${q}</figcaption></figure>`,
    )
    .join('')}</div>
<script>
const EFECTOS = ${JSON.stringify(datos)};
const figura = new Image(); figura.src = '${R}/unidades/templario-escudo/atlas.webp';
const piezas = EFECTOS.map((e) => {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const cap = document.createElement('figcaption'); cap.textContent = e.id + ' · ' + e.fotogramas + ' fotogramas';
  fig.append(c, cap); document.getElementById('animados').append(fig);
  const img = new Image(); img.src = '${R}/efectos/animados/' + e.id + '.webp';
  return { e, c, img };
});
const t0 = performance.now();
function dibujar(ahora) {
  const t = (ahora - t0) / 1000;
  for (const { e, c, img } of piezas) {
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    // La casilla: una elipse a 25°.
    ctx.strokeStyle = 'rgba(255,240,200,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(220, 230, 60, 26, 0, 0, Math.PI * 2); ctx.stroke();
    if (figura.complete && figura.naturalWidth) ctx.drawImage(figura, 0, 0, 256, 256, 20, 100, 160, 160);
    if (!img.complete || !img.naturalWidth) continue;
    const i = Math.floor(t * 10) % (e.fotogramas + 4); // 10 fps y una pausa
    if (i < e.fotogramas) ctx.drawImage(img, i * e.celda, 0, e.celda, e.celda, 120, 60, 200, 200);
  }
  requestAnimationFrame(dibujar);
}
requestAnimationFrame(dibujar);
</script></body></html>
`;
  const ruta = join(DIR_VISTA, 'efectos.html');
  await mkdir(DIR_VISTA, { recursive: true });
  await writeFile(ruta, html);
  return ruta;
}
