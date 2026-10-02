/**
 * La página de una unidad en 8 direcciones (`<id>-8d.html`): una fila por
 * dirección y una columna por acción, cada clip a su reloj y anclado por sus
 * pies, con la sombra del contrato de luz pintada como la SILUETA del fotograma
 * aplastada sobre el suelo (`proyeccionDeSombra`). La muerte se queda en el
 * cadáver un rato antes de volver a empezar.
 *
 *   pnpm taller vista-8d dos-manos          # las poses del maniquí de un juego de armas
 *   pnpm taller vista-8d templario-escudo   # el arte de la unidad
 *
 * Las poses vienen en dos hojas de 3 filas por dirección; para verlas como el
 * arte se juntan en una de 6 en `.cache/` y se derivan con `derivarAtlas`, el
 * mismo que mide el arte. Se abre con `file://`.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { proyeccionDeSombra } from '../../src/shared/arte.js';
import {
  carpetaDePoses,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
  OCHO_DIRECCIONES,
} from '../art/poses.js';
import { type AtlasDerivado, derivarAtlas } from './derivar.js';
import { NOMBRES_DE_DIRECCION } from './direcciones.js';
import type { Fila } from './evaluar.js';
import { DIR_VISTA } from './vista.js';

const RAIZ = resolve(import.meta.dirname, '../..');

interface Direccion {
  /** Las acciones que el evaluador marca para revisar (`pnpm taller evaluar`), con su motivo. */
  readonly avisos?: Readonly<Record<string, string>>;
  readonly src: string;
  readonly atlas: AtlasDerivado;
}

/** Junta las dos hojas de pose de cada dirección en una de 6 filas y la deriva. */
async function desdeLasPoses(juego: JuegoDeArmas): Promise<Direccion[]> {
  const origen = carpetaDePoses(juego);
  const destino = join(DIR_VISTA, `poses-${juego}-8d`);
  await mkdir(destino, { recursive: true });
  const { celda } = OCHO_DIRECCIONES;
  const fuera: Direccion[] = [];
  for (let d = 0; d < 8; d++) {
    const a = join(origen, `d${d}-a.png`);
    const b = join(origen, `d${d}-b.png`);
    const { width } = await sharp(a).metadata();
    const ruta = join(destino, `d${d}.png`);
    await sharp({
      create: { width, height: 6 * celda, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: a, left: 0, top: 0 },
        { input: b, left: 0, top: 3 * celda },
      ])
      .png()
      .toFile(ruta);
    fuera.push({ src: relative(DIR_VISTA, ruta), atlas: await derivarAtlas(ruta) });
  }
  return fuera;
}

async function desdeElArte(id: string): Promise<Direccion[]> {
  const fuera: Direccion[] = [];
  // Lo que marcó el evaluador, si se ha pasado: la vista lo enseña con un borde.
  const rutaEval = join(RAIZ, '.cache/taller/evaluacion', `${id}.json`);
  const filas: Fila[] = existsSync(rutaEval)
    ? (JSON.parse(await readFile(rutaEval, 'utf8')) as { filas: Fila[] }).filas
    : [];
  for (let d = 0; d < 8; d++) {
    const ruta = join(RAIZ, 'assets/unidades', id, `d${d}`, 'atlas.webp');
    if (!existsSync(ruta))
      throw new Error(`${id} no tiene todavía la dirección ${d}: falta ${ruta}`);
    const atlas = JSON.parse(
      await readFile(ruta.replace(/\.webp$/, '.json'), 'utf8'),
    ) as AtlasDerivado;
    const avisos = Object.fromEntries(
      filas
        .filter((f) => f.direccion === d && f.marcada)
        .map((f) => [
          f.clip,
          `nivel ${f.nivel.toFixed(2)} · pico ${f.pico.toFixed(2)} en el fotograma ${f.peor + 1}`,
        ]),
    );
    fuera.push({ src: relative(DIR_VISTA, ruta), atlas, avisos });
  }
  return fuera;
}

function pagina(titulo: string, direcciones: readonly Direccion[]): string {
  const datos = direcciones.map((d, i) => ({ ...d, nombre: NOMBRES_DE_DIRECCION[i] }));
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Taller · ${titulo}</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  header { padding: 12px 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; background: #1b1d16; z-index: 1; border-bottom: 1px solid #34382b; }
  table { border-collapse: separate; border-spacing: 6px; padding: 6px 10px; }
  th { font-weight: 600; color: #b9b29a; text-transform: uppercase; letter-spacing: .06em; font-size: 12px; }
  th.dir { text-align: right; padding-right: 6px; white-space: nowrap; }
  canvas { display: block; background: url(../../../assets/rpg/campo.webp) center 70%; background-size: 170%; background-color: #7a7aa4; border-radius: 6px; }
  label { display: flex; gap: 6px; align-items: center; }
  .ayuda { color: #b9b29a; }
</style></head><body>
<header><strong>${titulo}</strong>
  <label>Velocidad <input id="vel" type="range" min="0.25" max="2" step="0.25" value="1"><span id="velv">1×</span></label>
  <label>Tamaño <input id="tam" type="range" min="0.5" max="1.5" step="0.1" value="0.8"><span id="tamv">0.8×</span></label>
  <label><input id="som" type="checkbox" checked> Sombra</label>
  <span class="ayuda">Luz desde la izquierda; la sombra es la silueta del fotograma. La muerte se queda en el cadáver. Borde rojo: el evaluador avisa (pasa el ratón para ver por qué).</span>
</header>
<table id="t"></table>
<script>
const DIRS = ${JSON.stringify(datos)};
const SOMBRA = ${JSON.stringify(proyeccionDeSombra())};
const ACCIONES = [['idle','quieto'],['walk','andando'],['charge','carga'],['attack','ataque'],['hurt','daño'],['death','muerte']];
/** Lo que se queda quieto al acabar un clip que no es bucle, en segundos; el cadáver, más. */
const PAUSA = { attack: 0.6, hurt: 0.6, death: 2.5 };
let vel = 1, tam = 0.8, conSombra = true;
const vel_ = document.getElementById('vel'), tam_ = document.getElementById('tam'), som_ = document.getElementById('som');
vel_.oninput = () => { vel = +vel_.value; document.getElementById('velv').textContent = vel + '×'; };
tam_.oninput = () => { tam = +tam_.value; document.getElementById('tamv').textContent = tam.toFixed(1) + '×'; };
som_.onchange = () => { conSombra = som_.checked; };

const t = document.getElementById('t');
const cab = t.insertRow(); cab.append(document.createElement('th'));
for (const [, n] of ACCIONES) { const th = document.createElement('th'); th.textContent = n; cab.append(th); }
const piezas = [];
for (const d of DIRS) {
  const img = new Image(); img.src = d.src;
  const fila = t.insertRow();
  const th = document.createElement('th'); th.className = 'dir'; th.textContent = d.nombre; fila.append(th);
  for (const [clip] of ACCIONES) {
    const c = document.createElement('canvas'); c.width = 300; c.height = 190;
    const aviso = d.avisos && d.avisos[clip];
    if (aviso) { c.style.outline = '3px solid #e0533d'; c.title = 'El evaluador avisa: ' + aviso; }
    fila.insertCell().append(c);
    piezas.push({ d, img, clip, c });
  }
}

// La silueta de un fotograma, teñida una vez y guardada.
const siluetas = new Map();
function silueta(img, sx, sy, lado) {
  const k = img.src + '|' + sx + '|' + sy;
  let s = siluetas.get(k);
  if (s) return s;
  s = document.createElement('canvas'); s.width = lado; s.height = lado;
  const g = s.getContext('2d');
  g.drawImage(img, sx, sy, lado, lado, 0, 0, lado, lado);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = 'rgb(23, 31, 28)';
  g.fillRect(0, 0, lado, lado);
  siluetas.set(k, s);
  return s;
}

function fotograma(k, seg) {
  if (k.loop) return Math.floor(seg * k.fps) % k.frames;
  const dura = k.frames / k.fps + (PAUSA[k.clip] ?? 0.6);
  return Math.min(k.frames - 1, Math.floor((seg % dura) * k.fps));
}

let reloj = 0, antes = performance.now();
function dibujar(ahora) {
  reloj += ((ahora - antes) / 1000) * vel; antes = ahora;
  for (const p of piezas) {
    const ctx = p.c.getContext('2d');
    ctx.clearRect(0, 0, p.c.width, p.c.height);
    const a = p.d.atlas, k = a.clips[p.clip];
    if (!k || !p.img.complete || p.img.naturalWidth === 0) continue;
    const f = fotograma({ ...k, clip: p.clip }, reloj);
    const lado = a.cell, sx = f * lado, sy = k.row * lado;
    const [ax, ay] = k.anchor;
    const px = p.c.width / 2, py = p.c.height * 0.72;
    if (conSombra) {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(tam, tam);
      ctx.transform(SOMBRA.a, SOMBRA.b, SOMBRA.c, SOMBRA.d, 0, 0);
      ctx.globalAlpha = SOMBRA.opacidad;
      ctx.filter = 'blur(1.5px)';
      ctx.drawImage(silueta(p.img, sx, sy, lado), -ax, -ay);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(tam, tam);
    ctx.drawImage(p.img, sx, sy, lado, lado, -ax, -ay, lado, lado);
    ctx.restore();
  }
  requestAnimationFrame(dibujar);
}
requestAnimationFrame(dibujar);
</script></body></html>
`;
}

export async function vista8d(fuente: string): Promise<string> {
  const esJuego = fuente in JUEGOS_DE_ARMAS;
  const direcciones = esJuego
    ? await desdeLasPoses(fuente as JuegoDeArmas)
    : await desdeElArte(fuente);
  await mkdir(DIR_VISTA, { recursive: true });
  const ruta = join(DIR_VISTA, `${esJuego ? `poses-${fuente}` : fuente}-8d.html`);
  await writeFile(
    ruta,
    pagina(
      esJuego ? `Poses de ${fuente} · 8 direcciones` : `${fuente} · 8 direcciones`,
      direcciones,
    ),
  );
  return ruta;
}
