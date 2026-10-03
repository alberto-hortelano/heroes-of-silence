/**
 * El pintor de la escena: una página con un canvas que dibuja lo que compuso
 * `colocar.ts`, capa a capa, y mide cuánto suelo queda desnudo.
 *
 * Capas, de abajo arriba: el suelo fundido entre regiones, la sombra de cada
 * nivel, los caminos, el agua con su barro, y en orden de profundidad (por la y)
 * las caras de roca y los sprites; encima, las nubes y una viñeta.
 *
 * Al terminar deja en `window.__informe` el suelo desnudo: los píxeles del mapa
 * donde no hay nada encima de la textura del suelo.
 */
import type { Escena } from './colocar.js';

export function paginaDeEscena(e: Escena, rutaAssets: string, tile = 48): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Escenario · semilla ${e.semilla}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0d0e0b; color: #ddd; font: 13px system-ui, sans-serif; }
  #info { position: fixed; top: 6px; right: 10px; background: #000a; padding: 4px 8px; border-radius: 4px; }
  canvas { display: block; }
</style></head><body>
<div id="info">cargando…</div>
<canvas id="lienzo"></canvas>
<script>
const E = ${JSON.stringify(e)};
const A = ${JSON.stringify(rutaAssets)};
const T = Number(new URLSearchParams(location.search).get('t')) || ${tile};
const M = 1.4 * T; // margen alrededor del mapa, para las nubes
const imgs = new Map();
function img(src) {
  if (!imgs.has(src)) {
    const im = new Image();
    im.src = A + src;
    imgs.set(src, im);
  }
  return imgs.get(src);
}
const listo = (im) => im && (im instanceof HTMLCanvasElement || (im.complete && im.naturalWidth > 0));
const SUELOS = [...new Set(E.suelo)];
for (const s of SUELOS) img('suelos/' + s + '.webp');
for (const t of ['agua', 'barro', 'cara-roca', 'cara-arenisca', 'cara-basalto', 'cara-nevada']) img('texturas/' + t + '.webp');
for (const s of E.sprites) if (s.src) img(s.src);

const PIGMENTO = { grass: '#4f5239', dirt: '#6f5e46', rough: '#5b5950', sand: '#94856a', swamp: '#354139', snow: '#a7acab', lava: '#553328' };
const lienzo = document.getElementById('lienzo');
lienzo.width = E.W * T + 2 * M;
lienzo.height = E.H * T + 2 * M;
const ctx = lienzo.getContext('2d');

function capaDeMascara(pred, desenfoque) {
  const chico = document.createElement('canvas');
  chico.width = E.W; chico.height = E.H;
  const c = chico.getContext('2d');
  const d = c.createImageData(E.W, E.H);
  for (let i = 0; i < E.W * E.H; i++) if (pred(i)) { d.data[i * 4 + 3] = 255; }
  c.putImageData(d, 0, 0);
  const grande = document.createElement('canvas');
  grande.width = E.W * T; grande.height = E.H * T;
  const g = grande.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.filter = 'blur(' + desenfoque + 'px)';
  g.drawImage(chico, 0, 0, E.W * T, E.H * T);
  g.filter = 'none';
  return grande;
}
function rellenar(capa, src, color, casillasPorTextura) {
  const g = capa.getContext('2d');
  g.globalCompositeOperation = 'source-in';
  const im = imgs.get(src);
  if (listo(im)) {
    const p = g.createPattern(im, 'repeat');
    p.setTransform(new DOMMatrix().scale((casillasPorTextura * T) / im.naturalWidth));
    g.fillStyle = p;
  } else g.fillStyle = color;
  g.fillRect(0, 0, capa.width, capa.height);
  g.globalCompositeOperation = 'source-over';
  return capa;
}

// Un filtro de canvas por sprite es lentísimo en Chromium (miles de piedras):
// cada imagen se entona una sola vez y se guarda la copia.
const entonadas = new Map();
function entonada(im, src, tono) {
  const clave = src + '|' + tono;
  let copia = entonadas.get(clave);
  if (!copia) {
    copia = document.createElement('canvas');
    copia.width = im.naturalWidth; copia.height = im.naturalHeight;
    const g = copia.getContext('2d');
    g.filter = tono;
    g.drawImage(im, 0, 0);
    entonadas.set(clave, copia);
  }
  return copia;
}

function pintarSprite(c, s, soloSilueta) {
  const original = s.src ? imgs.get(s.src) : null;
  const im = listo(original) && s.tono && !soloSilueta ? entonada(original, s.src, s.tono) : original;
  const k = (s.alto * T) / s.nh;
  if (listo(im)) {
    if (s.recorte) c.drawImage(im, s.recorte[0], s.recorte[1], s.recorte[2], s.recorte[3], s.x * T - s.ax * k, s.y * T - s.ay * k, s.nw * k, s.nh * k);
    else c.drawImage(im, s.x * T - s.ax * k, s.y * T - s.ay * k, s.nw * k, s.nh * k);
  } else {
    c.fillStyle = soloSilueta ? '#fff' : s.color;
    c.beginPath();
    const w = s.alto * T * 0.45;
    c.moveTo(s.x * T - w, s.y * T);
    c.lineTo(s.x * T, s.y * T - s.alto * T);
    c.lineTo(s.x * T + w, s.y * T);
    c.fill();
  }
}

function pintarCara(c, f, soloSilueta) {
  const x = f.x0 * T, y = (f.y + 1) * T, w = (f.x1 - f.x0 + 1) * T, h = f.caida * E.altoDeNivel * T;
  const im = imgs.get('texturas/' + f.material + '.webp');
  if (soloSilueta) { c.fillStyle = '#fff'; c.fillRect(x, y, w, h); return; }
  if (listo(im)) {
    const p = c.createPattern(im, 'repeat');
    p.setTransform(new DOMMatrix().translate(0, y).scale((1.6 * T) / im.naturalWidth));
    c.fillStyle = p;
  } else c.fillStyle = '#4c463e';
  c.fillRect(x, y, w, h);
  // La cara se oscurece hacia el pie y se aclara en el filo.
  const gr = c.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, 'rgba(255,240,210,0.18)');
  gr.addColorStop(0.08, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = gr;
  c.fillRect(x, y, w, h);
}

function dibujar(c, silueta) {
  c.save();
  c.translate(M, M);
  if (!silueta) {
    // 1 · El suelo: cada suelo con su máscara difuminada, así las regiones se funden.
    c.fillStyle = PIGMENTO.dirt;
    c.fillRect(0, 0, E.W * T, E.H * T);
    // Las texturas aprobadas son oscuras; la referencia tiene praderas vivas. El
    // color se aviva al pintar, por suelo, sin tocar el arte.
    const VIVEZA = { grass: 'saturate(1.45) brightness(1.3)', dirt: 'saturate(1.2) brightness(1.15)', swamp: 'saturate(1.15) brightness(1.1)', sand: 'saturate(0.8) brightness(0.92)', snow: 'brightness(1.15)', lava: 'saturate(1.2) brightness(1.15)', rough: 'brightness(1.12)' };
    for (const s of SUELOS) {
      const capa = capaDeMascara((i) => E.suelo[i] === s, T * 0.45);
      c.filter = VIVEZA[s] || 'none';
      c.drawImage(rellenar(capa, 'suelos/' + s + '.webp', PIGMENTO[s], 4), 0, 0);
      c.filter = 'none';
    }
    // 2 · La sombra de cada nivel: lo bajo, más oscuro.
    for (const n of [-1, 0, 1]) {
      const capa = capaDeMascara((i) => E.nivel[i] === n, T * 0.3);
      const g = capa.getContext('2d');
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = 'rgba(0,0,0,' + (0.12 * (2 - n)) + ')';
      g.fillRect(0, 0, capa.width, capa.height);
      c.drawImage(capa, 0, 0);
    }
    // 3 · Los caminos: tierra pisada con su orla oscura.
    c.lineCap = 'round'; c.lineJoin = 'round';
    // Las sendas ya vienen encadenadas y serpenteando: finas, con orla y huella clara.
    const trazar = () => {
      c.beginPath();
      for (const l of E.sendas) {
        c.moveTo(l[0][0] * T, l[0][1] * T);
        for (let i = 1; i < l.length; i++) c.lineTo(l[i][0] * T, l[i][1] * T);
      }
    };
    for (const [w, color] of [[0.2, 'rgba(30,22,15,0.45)'], [0.12, 'rgba(138,112,78,0.92)'], [0.05, 'rgba(176,150,108,0.55)']]) {
      c.strokeStyle = color; c.lineWidth = w * T;
      trazar();
      c.stroke();
    }
    // 4 · El agua: barro en la orilla y el agua encima, más oscura en el centro.
    const agua = new Set(E.agua);
    c.drawImage(rellenar(capaDeMascara((i) => agua.has(i), T * 0.55), 'texturas/barro.webp', '#3b3326', 3), 0, 0);
    c.filter = 'saturate(1.3) brightness(1.45)';
    c.drawImage(rellenar(capaDeMascara((i) => agua.has(i), T * 0.22), 'texturas/agua.webp', '#24405a', 3), 0, 0);
    c.filter = 'none';
    // La espuma de la orilla: el agua menos su interior, en blanco tenue.
    const espuma = capaDeMascara((i) => agua.has(i), T * 0.12);
    const ge = espuma.getContext('2d');
    ge.globalCompositeOperation = 'source-in'; ge.fillStyle = 'rgba(225,235,235,0.38)'; ge.fillRect(0, 0, espuma.width, espuma.height);
    ge.globalCompositeOperation = 'destination-out';
    ge.drawImage(capaDeMascara((i) => agua.has(i) && [1, -1, E.W, -E.W].every((d) => agua.has(i + d)), T * 0.35), 0, 0);
        c.drawImage(espuma, 0, 0);
    const hondo = capaDeMascara((i) => agua.has(i) && [1, -1, E.W, -E.W].every((d) => agua.has(i + d)), T * 0.5);
    const gh = hondo.getContext('2d'); gh.globalCompositeOperation = 'source-in'; gh.fillStyle = 'rgba(5,15,30,0.45)'; gh.fillRect(0, 0, hondo.width, hondo.height);
    c.drawImage(hondo, 0, 0);
    // 5 · Los cantos de las caídas al este y al oeste.
    for (const [x, y, lado] of E.relieve.cantos) {
      const gx = lado === 'este' ? (x + 1) * T : x * T;
      const gr = c.createLinearGradient(gx, 0, gx + (lado === 'este' ? 0.35 : -0.35) * T, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.fillRect(lado === 'este' ? gx : gx - 0.35 * T, y * T, 0.35 * T, T);
    }
    // 6 · Las sombras al pie de lo que tiene volumen.
    for (const s of E.sprites) {
      if (!s.sombra) continue;
      const r = s.alto * T * 0.42;
      const gr = c.createRadialGradient(s.x * T + r * 0.3, s.y * T, 0, s.x * T + r * 0.3, s.y * T, r);
      gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.fillRect(s.x * T - r, s.y * T - r, 2.3 * r, 2 * r);
    }
  } else {
    // En la silueta cuenta como cubierto lo que tapa el suelo desnudo.
    c.fillStyle = '#fff';
    c.lineCap = 'round';
    c.strokeStyle = '#fff'; c.lineWidth = 0.2 * T;
    c.beginPath();
    for (const l of E.sendas) { c.moveTo(l[0][0] * T, l[0][1] * T); for (let i = 1; i < l.length; i++) c.lineTo(l[i][0] * T, l[i][1] * T); }
    c.stroke();
    for (const i of E.agua) c.fillRect((i % E.W) * T, Math.floor(i / E.W) * T, T, T);
  }
  // 7 · En orden de profundidad: las caras de roca y los sprites.
  const orden = [
    ...E.relieve.caras.map((f) => ({ y: f.y + 1 - 0.01, cara: f })),
    ...E.sprites.filter((s) => s.capa === 0).map((s) => ({ y: s.y, s })),
  ].sort((p, q) => p.y - q.y);
  for (const o of orden) o.cara ? pintarCara(c, o.cara, silueta) : pintarSprite(c, o.s, silueta);
  c.restore();
  if (silueta) return;
  // 8 · La luz y la niebla baja; luego las nubes y la viñeta.
  c.save();
  c.translate(M, M);
  const COLOR_DE_LUZ = { fuego: [255, 170, 80, 0.22], brasa: [255, 90, 30, 0.2], niebla: [210, 222, 228, 0.16] };
  for (const l of E.luces) {
    const [r, g, b, al] = COLOR_DE_LUZ[l.clase];
    c.globalCompositeOperation = l.clase === 'niebla' ? 'screen' : 'lighter';
    const gr = c.createRadialGradient(l.x * T, l.y * T, 0, l.x * T, l.y * T, l.r * T);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + al + ')');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    c.fillStyle = gr;
    // La niebla se tumba: más ancha que alta, como en la cámara a 25°.
    c.save();
    c.translate(l.x * T, l.y * T); c.scale(1, l.clase === 'niebla' ? 0.55 : 1); c.translate(-l.x * T, -l.y * T);
    c.fillRect((l.x - l.r) * T, (l.y - l.r) * T, 2 * l.r * T, 2 * l.r * T);
    c.restore();
  }
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 0.92;
  for (const s of E.sprites) if (s.capa === 1) pintarSprite(c, s, false);
  c.restore();
  const v = c.createRadialGradient(lienzo.width / 2, lienzo.height / 2, lienzo.height * 0.35, lienzo.width / 2, lienzo.height / 2, lienzo.height * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = v;
  c.fillRect(0, 0, lienzo.width, lienzo.height);
}

function medir() {
  const s = document.createElement('canvas');
  s.width = lienzo.width; s.height = lienzo.height;
  const c = s.getContext('2d');
  dibujar(c, true);
  const d = c.getImageData(M, M, E.W * T, E.H * T).data;
  let desnudo = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 40) desnudo++;
  return desnudo / (d.length / 4);
}

let pendientes = 0;
for (const im of imgs.values()) if (!im.complete) { pendientes++; im.onload = im.onerror = () => { if (--pendientes === 0) fin(); }; }
if (pendientes === 0) fin();
function fin() {
  dibujar(ctx, false);
  let desnudo = null;
  try {
    desnudo = medir();
  } catch {
    // Abierta desde file:// el canvas queda contaminado y no se puede medir: se pinta igual.
  }
  const faltan = [...imgs.entries()].filter(([, im]) => !listo(im)).map(([k]) => k);
  window.__informe = { desnudo, imagenesQueFaltan: faltan.length, ...E.informe };
  document.getElementById('info').textContent = (desnudo === null ? 'sin medir (ábrela con pnpm taller escenario)' : 'suelo desnudo ' + (desnudo * 100).toFixed(1) + ' %') + ' · sprites ' + E.sprites.length + (faltan.length ? ' · faltan ' + faltan.length + ' imágenes' : '');
}
</script></body></html>
`;
}
