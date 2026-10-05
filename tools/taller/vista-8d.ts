/**
 * El visor de las unidades en 8 direcciones (`visor-8d.html`): UNA página con un
 * selector de todas las unidades de `EN_OCHO_DIRECCIONES` que tienen ya sus 8
 * direcciones y de las poses de cada juego de armas. Por unidad, una fila por
 * dirección y una columna por acción, cada clip a su reloj y anclado por sus
 * pies, con la sombra del contrato de luz pintada como la SILUETA del fotograma
 * aplastada sobre el suelo (`PROYECCION_DE_SOMBRA`). La muerte se queda en el
 * cadáver un rato antes de volver a empezar.
 *
 *   pnpm taller vista-8d                    # el visor, con la primera unidad
 *   pnpm taller vista-8d templario-escudo   # el visor, abierto en esa unidad (`#templario-escudo`)
 *   pnpm taller vista-8d dos-manos          # abierto en las poses de un juego de armas
 *
 * La elección va en el `#` de la URL, así que se puede recargar o compartir.
 *
 * Las poses vienen en dos hojas de 3 filas por dirección, y una tercera de una
 * fila con el disparo de quien dispara; para verlas como el arte se juntan en
 * una de 6 o 7 en `.cache/` y se miden con `poses-8d.ts`, lo mismo que lee el
 * juego. Se abre con `file://`. Quien no dispara deja vacía la columna del disparo.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { NOMBRE_DE_FACCION_DE_ARENA } from '../../src/core/arena.js';
import {
  type ClipDeFigura,
  colorDeSombra,
  FILAS_DEL_ATLAS,
  NOMBRES_DE_DIRECCION,
  PROYECCION_DE_SOMBRA,
} from '../../src/shared/arte.js';
import { carpetaDePoses, JUEGOS_DE_ARMAS, type JuegoDeArmas } from '../art/poses.js';
import { type AtlasDerivado, ELEVACION_DEL_CADAVER, RELOJ } from './derivar.js';
import type { Fila } from './evaluar.js';
import { derivarDireccionDePoses, rutaJunta } from './poses-8d.js';
import { EN_OCHO_DIRECCIONES, rangoDe, tieneSusOchoDirecciones, unidad } from './unidades.js';
import { DIR_VISTA } from './vista.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** La cabecera de cada columna del visor: una por fila del atlas. */
const NOMBRE_DE_ACCION: Readonly<Record<ClipDeFigura, string>> = {
  idle: 'quieto',
  walk: 'andando',
  charge: 'carga',
  attack: 'ataque',
  hurt: 'daño',
  death: 'muerte',
  shoot: 'disparo',
};

/**
 * Lo que se queda quieto al acabar cada clip que no es bucle (`RELOJ`), en
 * segundos; el cadáver, más.
 */
const PAUSA = Object.fromEntries(
  Object.entries(RELOJ)
    .filter(([, r]) => !r.loop)
    .map(([clip]) => [clip, clip === 'death' ? 2.5 : 0.6]),
);

interface Direccion {
  /** Las acciones que el evaluador marca para revisar (`pnpm taller evaluar`), con su motivo. */
  readonly avisos?: Readonly<Record<string, string>>;
  readonly src: string;
  readonly atlas: Pick<AtlasDerivado, 'clips' | 'altura' | 'cadaver'>;
}

/**
 * Las poses de un juego, juntadas en hojas de 6 filas y medidas como las mide el
 * juego (`poses-8d.ts`, sin elevar la muerte: el render crudo no la lleva subida).
 */
async function desdeLasPoses(juego: JuegoDeArmas): Promise<Direccion[]> {
  const fuera: Direccion[] = [];
  for (let d = 0; d < NOMBRES_DE_DIRECCION.length; d++) {
    const atlas = await derivarDireccionDePoses(juego, d);
    fuera.push({ src: relative(DIR_VISTA, rutaJunta(juego, d)), atlas });
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
  for (let d = 0; d < NOMBRES_DE_DIRECCION.length; d++) {
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
          `nivel ${f.nivel.toFixed(2)} · pico ${f.pico.toFixed(2)} en el fotograma ${f.peor + 1}` +
            ((f.conAzul ?? []).length > 0
              ? ` · AZUL del maniquí en ${(f.conAzul ?? []).map((n) => n + 1).join(', ')}`
              : ''),
        ]),
    );
    fuera.push({ src: relative(DIR_VISTA, ruta), atlas, avisos });
  }
  return fuera;
}

/** El primer selector: un ejército, o las poses del maniquí. */
const POSES = 'Poses del maniquí';
/** Dentro de un ejército, el segundo selector agrupa en este orden. */
const RANGOS = [
  ['heroe', 'Héroes'],
  ['elite', 'Élite'],
  ['tropa', 'Tropa'],
] as const;

interface Fuente {
  readonly id: string;
  readonly titulo: string;
  /** El ejército de la unidad (su nombre), o `POSES`. */
  readonly ejercito: string;
  /** Héroes, Élite o Tropa; las poses no lo tienen. */
  readonly rango: string | null;
  readonly direcciones: readonly (Direccion & { readonly nombre: string })[];
}

function pagina(fuentes: readonly Fuente[]): string {
  const ejercitos = [...new Set(fuentes.map((f) => f.ejercito))];
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Taller · 8 direcciones</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  header { padding: 12px 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; background: #1b1d16; z-index: 1; border-bottom: 1px solid #34382b; }
  select { font: inherit; background: #2a2d22; color: #e8e2cf; border: 1px solid #4a4f3c; border-radius: 4px; padding: 4px 8px; }
  table { border-collapse: separate; border-spacing: 6px; padding: 6px 10px; }
  th { font-weight: 600; color: #b9b29a; text-transform: uppercase; letter-spacing: .06em; font-size: 12px; }
  th.dir { text-align: right; padding-right: 6px; white-space: nowrap; }
  canvas { display: block; background: url(../../../assets/rpg/campo.webp) center 70%; background-size: 170%; background-color: #7a7aa4; border-radius: 6px; }
  label { display: flex; gap: 6px; align-items: center; }
  .ayuda { color: #b9b29a; }
</style></head><body>
<header>
  <label>Ejército <select id="ejercito">${ejercitos.map((e) => `<option>${e}</option>`).join('')}</select></label>
  <label>Ver <select id="fuente"></select></label>
  <label>Velocidad <input id="vel" type="range" min="0.25" max="2" step="0.25" value="1"><span id="velv">1×</span></label>
  <label>Tamaño <input id="tam" type="range" min="0.4" max="1.5" step="0.1" value="0.8"><span id="tamv">0.8×</span></label>
  <label><input id="som" type="checkbox" checked> Sombra</label>
  <span class="ayuda">Luz desde la izquierda; la sombra es la silueta del fotograma. La muerte se queda en el cadáver. Borde rojo: el evaluador avisa (pasa el ratón para ver por qué).</span>
</header>
<table id="t"></table>
<script>
const FUENTES = ${JSON.stringify(fuentes)};
const RANGOS = ${JSON.stringify(RANGOS.map(([, n]) => n))};
const SOMBRA = ${JSON.stringify(PROYECCION_DE_SOMBRA)};
const BAJO_LOS_PIES = ${ELEVACION_DEL_CADAVER + 42};
const ACCIONES = ${JSON.stringify(FILAS_DEL_ATLAS.map((c) => [c, NOMBRE_DE_ACCION[c]]))};
const PAUSA = ${JSON.stringify(PAUSA)};
let vel = 1, tam = 0.8, conSombra = true;
const vel_ = document.getElementById('vel'), tam_ = document.getElementById('tam'), som_ = document.getElementById('som');
vel_.oninput = () => { vel = +vel_.value; document.getElementById('velv').textContent = vel + '×'; };
tam_.oninput = () => { tam = +tam_.value; document.getElementById('tamv').textContent = tam.toFixed(1) + '×'; ajustarLienzos(); };
som_.onchange = () => { conSombra = som_.checked; };

const t = document.getElementById('t');
const sel = document.getElementById('fuente');
let piezas = [];
let altoFuente = 0;
function ajustarLienzos() {
  // Bajo los pies cabe el cadáver: llega a ELEVACION_DEL_CADAVER + 42 px de la celda.
  const h = Math.max(260, Math.ceil(altoFuente * tam + 40 + BAJO_LOS_PIES * tam));
  for (const p of piezas) if (p.c.height !== h) p.c.height = h;
}
// El segundo selector, con las fuentes del ejército elegido: las unidades en
// Héroes, Élite y Tropa, y las poses sin agrupar.
const selEjercito = document.getElementById('ejercito');
function llenarFuentes(ejercito) {
  const del = FUENTES.filter((x) => x.ejercito === ejercito);
  const opcion = (x) => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.titulo; return o; };
  sel.replaceChildren();
  if (del.every((x) => x.rango === null)) { for (const x of del) sel.append(opcion(x)); return; }
  for (const r of RANGOS) {
    const suyas = del.filter((x) => x.rango === r);
    if (suyas.length === 0) continue;
    const g = document.createElement('optgroup'); g.label = r;
    for (const x of suyas) g.append(opcion(x));
    sel.append(g);
  }
}
selEjercito.onchange = () => {
  llenarFuentes(selEjercito.value);
  mostrar(sel.options[0].value);
};
function mostrar(id) {
  const f = FUENTES.find((x) => x.id === id) ?? FUENTES[0];
  if (selEjercito.value !== f.ejercito || sel.options.length === 0) {
    selEjercito.value = f.ejercito;
    llenarFuentes(f.ejercito);
  }
  sel.value = f.id;
  document.title = 'Taller · ' + f.titulo;
  // Todas a la MISMA escala, para poder compararlas: lo que cambia es el lienzo,
  // que crece hasta que quepa la figura más alta (la montura con la lanza).
  altoFuente = Math.max(...f.direcciones.map((d) => d.atlas.altura ?? 0));
  if (location.hash.slice(1) !== f.id) history.replaceState(null, '', '#' + f.id);
  t.replaceChildren();
  piezas = [];
  const cab = t.insertRow(); cab.append(document.createElement('th'));
  for (const [, n] of ACCIONES) { const th = document.createElement('th'); th.textContent = n; cab.append(th); }
  for (const d of f.direcciones) {
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
  ajustarLienzos();
}
sel.onchange = () => mostrar(sel.value);
window.onhashchange = () => mostrar(location.hash.slice(1));
mostrar(decodeURIComponent(location.hash.slice(1)));

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
  g.fillStyle = '${colorDeSombra()}';
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
  try {
    reloj += ((ahora - antes) / 1000) * vel; antes = ahora;
    for (const p of piezas) {
      const ctx = p.c.getContext('2d');
      ctx.clearRect(0, 0, p.c.width, p.c.height);
      const a = p.d.atlas, k = a.clips[p.clip];
      if (!k || !p.img.complete || p.img.naturalWidth === 0) continue;
      const f = fotograma({ ...k, clip: p.clip }, reloj);
      const lado = a.cell, sx = f * lado, sy = k.row * lado;
      const [ax, ay] = k.anchor;
      // Los pies dejan sitio debajo: el cadáver cae hacia la cámara.
      const px = p.c.width / 2, py = p.c.height - 10 - BAJO_LOS_PIES * tam;
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
  } finally {
    requestAnimationFrame(dibujar);
  }
}
requestAnimationFrame(dibujar);
</script></body></html>
`;
}

/** Las unidades de 8 direcciones que ya tienen las 8, en el orden de `EN_OCHO_DIRECCIONES`. */
function unidadesCompletas(): string[] {
  return Object.keys(EN_OCHO_DIRECCIONES).filter((id) => tieneSusOchoDirecciones(RAIZ, id));
}

/** Los juegos de armas con sus poses de 8 direcciones renderizadas. */
function juegosConPoses(): JuegoDeArmas[] {
  const ultima = NOMBRES_DE_DIRECCION.length - 1;
  return (Object.keys(JUEGOS_DE_ARMAS) as JuegoDeArmas[]).filter((j) =>
    existsSync(join(carpetaDePoses(j), `d${ultima}-b.png`)),
  );
}

const nombrar = (direcciones: readonly Direccion[]) =>
  direcciones.map((d, i) => ({ ...d, nombre: NOMBRES_DE_DIRECCION[i] as string }));

/**
 * Escribe el visor con todas las fuentes y devuelve su ruta, con `#<elegida>`
 * si se pide una. Borra las páginas sueltas de antes (`<id>-8d.html`).
 */
export async function vista8d(elegida?: string): Promise<string> {
  const unidades = unidadesCompletas();
  const juegos = juegosConPoses();
  if (
    elegida !== undefined &&
    !unidades.includes(elegida) &&
    !(juegos as string[]).includes(elegida)
  )
    throw new Error(
      `«${elegida}» no está en el visor: ni es una unidad con sus 8 direcciones (${unidades.join(', ')}) ni un juego de armas con poses (${juegos.join(', ')})`,
    );
  const fuentes: Fuente[] = [];
  for (const id of unidades) {
    const u = unidad(id);
    fuentes.push({
      id,
      // Dentro del grupo Héroes, el «(héroe…)» del nombre sobra.
      titulo: u.nombre.replace(/,? *\(?héroe[^)]*\)?/, '').trim(),
      ejercito: NOMBRE_DE_FACCION_DE_ARENA[u.faccion],
      rango: (RANGOS.find(([r]) => r === rangoDe(u)) as (typeof RANGOS)[number])[1],
      direcciones: nombrar(await desdeElArte(id)),
    });
  }
  // El orden de los ejércitos es el de `NOMBRE_DE_FACCION_DE_ARENA`.
  const orden = Object.values(NOMBRE_DE_FACCION_DE_ARENA) as string[];
  fuentes.sort((a, b) => orden.indexOf(a.ejercito) - orden.indexOf(b.ejercito));
  for (const j of juegos)
    fuentes.push({
      id: j,
      titulo: `poses: ${j}`,
      ejercito: POSES,
      rango: null,
      direcciones: nombrar(await desdeLasPoses(j)),
    });
  await mkdir(DIR_VISTA, { recursive: true });
  for (const viejo of [...unidades, ...juegos.map((j) => `poses-${j}`)])
    await rm(join(DIR_VISTA, `${viejo}-8d.html`), { force: true });
  const ruta = join(DIR_VISTA, 'visor-8d.html');
  await writeFile(ruta, pagina(fuentes));
  return elegida === undefined ? ruta : `${ruta}#${elegida}`;
}
