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
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { NOMBRE_DE_FACCION_DE_ARENA } from '../../src/core/unidad.js';
import {
  type ClipDeFigura,
  colorDeSombra,
  FILAS_DEL_ATLAS,
  NOMBRES_DE_DIRECCION,
  PROYECCION_DE_SOMBRA,
} from '../../src/shared/arte.js';
import {
  carpetaDeManiqui,
  carpetaDePoses,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
} from '../art/poses.js';
import { type AtlasDerivado, ELEVACION_DEL_CADAVER, RELOJ } from './derivar.js';
import type { Fila } from './evaluar.js';
import { carpetaDelExperimento, costeDe, DIR_EXPERIMENTOS, pruebasDe } from './experimento.js';
import { derivarDireccionDePoses, rutaJunta } from './poses-8d.js';
import {
  EN_OCHO_DIRECCIONES,
  HEROES,
  JUEGO_DEL_YBOT,
  rangoDe,
  tieneSusOchoDirecciones,
  UNIDADES,
  unidad,
} from './unidades.js';
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
  readonly atlas: Pick<AtlasDerivado, 'clips' | 'altura' | 'cadaver' | 'cell'>;
}

/**
 * Las poses de un juego, juntadas en hojas de 6 filas y medidas como las mide el
 * juego (`poses-8d.ts`, sin elevar la muerte: el render crudo no la lleva subida).
 */
async function desdeLasPoses(juego: JuegoDeArmas, maniqui?: string): Promise<Direccion[]> {
  const fuera: Direccion[] = [];
  for (let d = 0; d < NOMBRES_DE_DIRECCION.length; d++) {
    const atlas = await derivarDireccionDePoses(juego, d, undefined, maniqui);
    fuera.push({
      src: relative(DIR_VISTA, rutaJunta(maniqui ?? juego, d)),
      atlas,
    });
  }
  return fuera;
}

/**
 * El arte de una unidad, o con `carpeta` el de una prueba (`experimento.ts`):
 * la carpeta de su dirección `d`. Las pruebas no llevan los bordes del evaluador.
 */
async function desdeElArte(id: string, carpeta?: (d: number) => string): Promise<Direccion[]> {
  const fuera: Direccion[] = [];
  // Lo que marcó el evaluador, si se ha pasado: la vista lo enseña con un borde.
  const rutaEval = join(RAIZ, '.cache/taller/evaluacion', `${id}.json`);
  const filas: Fila[] =
    carpeta === undefined && existsSync(rutaEval)
      ? (JSON.parse(await readFile(rutaEval, 'utf8')) as { filas: Fila[] }).filas
      : [];
  for (let d = 0; d < NOMBRES_DE_DIRECCION.length; d++) {
    const ruta = join(carpeta?.(d) ?? join(RAIZ, 'assets/unidades', id, `d${d}`), 'atlas.webp');
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

/** El primer selector: un ejército, o las poses del maniquí, o las pruebas. */
const POSES = 'Poses del maniquí';
const EXPERIMENTOS = 'Experimentos';
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

/**
 * El dibujo de las figuras de un visor, a su reloj y con su sombra: lo comparten
 * el visor de 8 direcciones y el de versiones (`vistaDeVersiones`). Lee del
 * script de la página `piezas` ({ d: { atlas }, img, clip, c }), `vel`, `tam`,
 * `conSombra`, `SOMBRA`, `BAJO_LOS_PIES` y `PAUSA`.
 */
const DIBUJO_DE_FIGURAS = `// La silueta de un fotograma, teñida y desenfocada una vez y guardada: el
// desenfoque de un lienzo 2D es caro, y por pieza y fotograma congelaba el
// visor de versiones (64 lienzos).
const siluetas = new Map();
function silueta(o) {
  const k = o.clave + '|' + o.sx + '|' + o.sy;
  let s = siluetas.get(k);
  if (s) return s;
  const lado = o.lado;
  const t = document.createElement('canvas'); t.width = lado; t.height = lado;
  const g = t.getContext('2d');
  g.drawImage(o.img, o.sx, o.sy, lado, lado, 0, 0, lado, lado);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '${colorDeSombra()}';
  g.fillRect(0, 0, lado, lado);
  s = document.createElement('canvas'); s.width = lado; s.height = lado;
  const b = s.getContext('2d');
  b.filter = 'blur(1.5px)';
  b.drawImage(t, 0, 0);
  siluetas.set(k, s);
  return s;
}

// De dónde sale el fotograma \`f\` de una pieza: de la fila ya recortada de su
// clip (\`p.filas\`, la del visor de versiones: 64 atlas enteros no caben en la
// caché de imágenes y se redecodificaban sin parar) o de su atlas.
function origen(p, k, f) {
  const lado = p.d.atlas.cell;
  const r = p.filas && p.filas.get(p.clip);
  if (r) return { img: r.bmp, sx: Math.round(f * lado * r.escala), sy: 0, lado: Math.round(lado * r.escala), clave: p.d.src + '|' + p.clip };
  if (p.filas || !p.img.complete || p.img.naturalWidth === 0) return null;
  return { img: p.img, sx: f * lado, sy: k.row * lado, lado, clave: p.img.src };
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
      if (p.oculta) continue;
      const a = p.d.atlas, k = a.clips[p.clip];
      const f = k ? fotograma({ ...k, clip: p.clip }, reloj) : -1;
      const o = k ? origen(p, k, f) : null;
      const lista = o !== null;
      // Solo se repinta lo que cambia: las figuras van a 10 fps como mucho.
      const estado = [f, lista, p.clip, tam, conSombra, p.c.width, p.c.height, p.pie].join('|');
      if (p.estado === estado) continue;
      p.estado = estado;
      const ctx = p.c.getContext('2d');
      ctx.clearRect(0, 0, p.c.width, p.c.height);
      if (!lista) continue;
      const lado = a.cell;
      const [ax, ay] = k.anchor;
      // Los pies dejan sitio debajo: el cadáver cae hacia la cámara. El lienzo va
      // a \`DENSIDAD\` píxeles por píxel de la página, y una pieza puede decir
      // dónde van sus pies (\`p.pie\`, desde abajo, en píxeles del lienzo).
      const px = p.c.width / 2, py = p.c.height - (p.pie ?? 10 + BAJO_LOS_PIES * tam);
      const escala = tam * DENSIDAD;
      if (conSombra) {
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(escala, escala);
        ctx.transform(SOMBRA.a, SOMBRA.b, SOMBRA.c, SOMBRA.d, 0, 0);
        ctx.globalAlpha = SOMBRA.opacidad;
        ctx.drawImage(silueta(o), -ax, -ay, lado, lado);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(escala, escala);
      ctx.drawImage(o.img, o.sx, o.sy, o.lado, o.lado, -ax, -ay, lado, lado);
      ctx.restore();
    }
  } finally {
    requestAnimationFrame(dibujar);
  }
}
requestAnimationFrame(dibujar);
`;

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
const DENSIDAD = 1;
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

${DIBUJO_DE_FIGURAS}
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

/**
 * Las unidades con maniquí propio ya renderizado (`pnpm taller maniqui`), con
 * el juego del que parte: se ven en el grupo de las poses, junto a la suya.
 */
function maniquiesRenderizados(): {
  readonly id: string;
  readonly juego: JuegoDeArmas;
}[] {
  const ultima = NOMBRES_DE_DIRECCION.length - 1;
  return [...UNIDADES, ...HEROES]
    .filter((u) => u.maniqui !== undefined)
    .filter((u) => existsSync(join(carpetaDeManiqui(u.id), `d${ultima}-b.png`)))
    .map((u) => ({ id: u.id, juego: JUEGO_DEL_YBOT[u.id] as JuegoDeArmas }))
    .filter((m) => m.juego in JUEGOS_DE_ARMAS);
}

/** Las pruebas de `experimento.ts` con sus 8 direcciones juntadas. */
function experimentosCompletos(): { readonly variante: string; readonly id: string }[] {
  const base = join(RAIZ, DIR_EXPERIMENTOS);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((v) => v.isDirectory())
    .flatMap((v) =>
      readdirSync(join(base, v.name), { withFileTypes: true })
        .filter((u) => u.isDirectory())
        .map((u) => ({ variante: v.name, id: u.name })),
    )
    .filter(({ variante, id }) =>
      NOMBRES_DE_DIRECCION.every((_, d) =>
        existsSync(join(RAIZ, carpetaDelExperimento(variante, id, d), 'atlas.json')),
      ),
    );
}

/** Las pruebas de `experimento.ts` con alguna dirección juntada. */
function experimentosConAlguna(): { readonly variante: string; readonly id: string }[] {
  const base = join(RAIZ, DIR_EXPERIMENTOS);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((v) => v.isDirectory())
    .flatMap((v) =>
      readdirSync(join(base, v.name), { withFileTypes: true })
        .filter((u) => u.isDirectory())
        .map((u) => ({ variante: v.name, id: u.name })),
    )
    .filter(({ variante, id }) =>
      NOMBRES_DE_DIRECCION.some((_, d) =>
        existsSync(join(RAIZ, carpetaDelExperimento(variante, id, d), 'atlas.json')),
      ),
    );
}

/** Las direcciones de una prueba que ya tienen atlas; las que no, `null`. */
async function desdeLaPrueba(carpeta: (d: number) => string): Promise<(Direccion | null)[]> {
  return Promise.all(
    NOMBRES_DE_DIRECCION.map(async (_, d) => {
      const ruta = join(carpeta(d), 'atlas.webp');
      if (!existsSync(ruta)) return null;
      const atlas = JSON.parse(
        await readFile(ruta.replace(/\.webp$/, '.json'), 'utf8'),
      ) as AtlasDerivado;
      return { src: relative(DIR_VISTA, ruta), atlas };
    }),
  );
}

/** El id de un maniquí propio en el visor: el de la unidad es su arte pintado. */
const idDeManiqui = (id: string): string => `maniqui-${id}`;

const nombrar = (direcciones: readonly Direccion[]) =>
  direcciones.map((d, i) => ({ ...d, nombre: NOMBRES_DE_DIRECCION[i] as string }));

/**
 * Escribe el visor con todas las fuentes y devuelve su ruta, con `#<elegida>`
 * si se pide una. Borra las páginas sueltas de antes (`<id>-8d.html`).
 */
export async function vista8d(elegida?: string): Promise<string> {
  const unidades = unidadesCompletas();
  const juegos = juegosConPoses();
  const maniquies = maniquiesRenderizados();
  if (
    elegida !== undefined &&
    !unidades.includes(elegida) &&
    !(juegos as string[]).includes(elegida) &&
    !maniquies.some((m) => idDeManiqui(m.id) === elegida) &&
    !experimentosCompletos().some((e) => `exp-${e.variante}-${e.id}` === elegida)
  )
    throw new Error(
      `«${elegida}» no está en el visor: ni es una unidad con sus 8 direcciones (${unidades.join(', ')}), ni un juego de armas con poses (${juegos.join(', ')}), ni un maniquí propio (${maniquies.map((m) => idDeManiqui(m.id)).join(', ')})`,
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
  for (const { variante, id } of experimentosCompletos())
    fuentes.push({
      id: `exp-${variante}-${id}`,
      titulo: `${variante}: ${id}`,
      ejercito: EXPERIMENTOS,
      rango: null,
      direcciones: nombrar(
        await desdeElArte(id, (d) => join(RAIZ, carpetaDelExperimento(variante, id, d))),
      ),
    });
  for (const m of maniquies)
    fuentes.push({
      id: idDeManiqui(m.id),
      titulo: `maniquí: ${m.id}`,
      ejercito: POSES,
      rango: null,
      direcciones: nombrar(await desdeLasPoses(m.juego, m.id)),
    });
  await mkdir(DIR_VISTA, { recursive: true });
  for (const viejo of [...unidades, ...juegos.map((j) => `poses-${j}`)])
    await rm(join(DIR_VISTA, `${viejo}-8d.html`), { force: true });
  const ruta = join(DIR_VISTA, 'visor-8d.html');
  await writeFile(ruta, pagina(fuentes));
  return elegida === undefined ? ruta : `${ruta}#${elegida}`;
}

/** Una columna del visor de versiones: un nombre y sus 8 direcciones. */
interface Version {
  readonly nombre: string;
  readonly direcciones: readonly (
    | (Direccion & {
        readonly nombre: string;
        /** La caja de las figuras de cada clip, respecto a su ancla: [izq, arriba, der, abajo]. */
        readonly cajas: Readonly<Record<string, readonly [number, number, number, number]>>;
      })
    | null
  )[];
}

/**
 * La caja de las figuras de cada clip de la hoja A de un atlas, respecto a su
 * ancla: el visor de versiones dimensiona con ella sus lienzos a tamaño
 * natural. Se mide aquí porque desde \`file://\` el navegador no deja leer los
 * píxeles de las imágenes.
 */
async function cajasDeLosClips(
  d: Direccion,
): Promise<Record<string, readonly [number, number, number, number]>> {
  const { data, info } = await sharp(join(DIR_VISTA, d.src))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lado = d.atlas.cell;
  const fuera: Record<string, readonly [number, number, number, number]> = {};
  for (const clip of CLIPS_DE_VERSIONES) {
    const k = d.atlas.clips[clip];
    if (k === undefined) continue;
    let [x0, y0, x1, y1] = [lado, lado, -1, -1];
    for (let f = 0; f < k.frames; f++)
      for (let y = 0; y < lado; y++)
        for (let x = 0; x < lado; x++)
          if ((data[((k.row * lado + y) * info.width + f * lado + x) * 4 + 3] as number) > 40) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
    const [ax, ay] = k.anchor;
    if (x1 >= 0) fuera[clip] = [x0 - ax, y0 - ay, x1 - ax, y1 - ay];
  }
  return fuera;
}

/** Las direcciones de una versión, con su nombre y las cajas de sus clips. */
const conCajas = async (
  direcciones: readonly (Direccion | null)[],
): Promise<Version['direcciones']> =>
  Promise.all(
    direcciones.map(async (d, i) =>
      d === null
        ? null
        : { ...d, nombre: NOMBRES_DE_DIRECCION[i] as string, cajas: await cajasDeLosClips(d) },
    ),
  );

/** Los clips que compara el visor de versiones: los de la hoja A. */
const CLIPS_DE_VERSIONES = ['idle', 'walk', 'charge'] as const;

/**
 * El visor de versiones de una unidad (`visor-8d-<id>.html`): su maniquí, su arte
 * y cada prueba de `experimento.ts` con sus 8 direcciones, una al lado de otra,
 * con una fila por dirección y el clip que se elija (quieto, andando o carga),
 * cada una a su reloj, a la misma escala y con el mismo dibujo que el visor de 8
 * direcciones (`DIBUJO_DE_FIGURAS`).
 */
export async function vistaDeVersiones(id: string): Promise<string> {
  const u = unidad(id);
  const versiones: Version[] = [];
  const juego = JUEGO_DEL_YBOT[id] as JuegoDeArmas;
  if (maniquiesRenderizados().some((m) => m.id === id))
    versiones.push({
      nombre: 'maniquí',
      direcciones: await conCajas(await desdeLasPoses(juego, id)),
    });
  if (tieneSusOchoDirecciones(RAIZ, id))
    versiones.push({ nombre: 'arte de hoy', direcciones: await conCajas(await desdeElArte(id)) });
  const conAlguna = new Set(
    experimentosConAlguna()
      .filter((e) => e.id === id)
      .map((e) => e.variante),
  );
  const completas = new Set(
    experimentosCompletos()
      .filter((e) => e.id === id)
      .map((e) => e.variante),
  );
  // También las pruebas a medias (una dirección de un modelo nuevo): lo que falta, en blanco.
  for (const variante of pruebasDe(id).filter((v) => conAlguna.has(v))) {
    // El precio por hoja en la cabecera, si se pintó en fal.
    const coste = costeDe(variante, id);
    const direcciones = await desdeLaPrueba((d) =>
      join(RAIZ, carpetaDelExperimento(variante, id, d)),
    );
    const hechas = direcciones.filter((d) => d !== null).length;
    versiones.push({
      nombre:
        (coste === null ? variante : `${variante} · ${coste.porHoja.toFixed(2)} $/hoja`) +
        (completas.has(variante) ? '' : ` (${hechas}/8)`),
      direcciones: await conCajas(direcciones),
    });
  }
  if (versiones.length === 0) throw new Error(`${id} no tiene ni maniquí, ni arte, ni pruebas`);
  await mkdir(DIR_VISTA, { recursive: true });
  const ruta = join(DIR_VISTA, `visor-8d-${id}.html`);
  await writeFile(ruta, paginaDeVersiones(u.nombre, versiones));
  return ruta;
}

function paginaDeVersiones(titulo: string, versiones: readonly Version[]): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Versiones · ${titulo}</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  header { padding: 10px 16px; display: flex; gap: 10px 16px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; left: 0; background: #1b1d16; z-index: 1; border-bottom: 1px solid #34382b; }
  select { font: inherit; background: #2a2d22; color: #e8e2cf; border: 1px solid #4a4f3c; border-radius: 4px; padding: 4px 8px; }
  table { border-collapse: separate; border-spacing: 6px; padding: 6px 10px; }
  th { font-weight: 600; color: #b9b29a; letter-spacing: .04em; font-size: 12px; }
  th.dir { text-align: right; padding-right: 6px; white-space: nowrap; text-transform: uppercase; position: sticky; left: 0; background: #1b1d16; }
  canvas { display: block; background: url(../../../assets/rpg/campo.webp) center 70%; background-size: 170%; background-color: #7a7aa4; border-radius: 6px; }
  label { display: flex; gap: 6px; align-items: center; }
  #columnas { display: flex; gap: 4px 12px; flex-wrap: wrap; align-items: center; }
  #columnas label { color: #b9b29a; font-size: 13px; }
  .oculta { display: none; }
</style></head><body>
<header>
  <strong>${titulo}</strong>
  <label>Animación <select id="clip">${CLIPS_DE_VERSIONES.map((c) => `<option value="${c}">${NOMBRE_DE_ACCION[c]}</option>`).join('')}</select></label>
  <label>Velocidad <input id="vel" type="range" min="0.25" max="2" step="0.25" value="1"><span id="velv">1×</span></label>
  <label>Tamaño <input id="tam" type="range" min="0.5" max="2" step="0.25" value="1"><span id="tamv">1× (natural)</span></label>
  <label><input id="som" type="checkbox" checked> Sombra</label>
  <span id="columnas">Columnas:</span>
</header>
<table id="t"></table>
<script>
const VERSIONES = ${JSON.stringify(versiones)};
const SOMBRA = ${JSON.stringify(PROYECCION_DE_SOMBRA)};
const BAJO_LOS_PIES = 0;
const PAUSA = ${JSON.stringify(PAUSA)};
// A tamaño 1, un píxel del atlas es un píxel de la pantalla: el lienzo va a la
// densidad de la pantalla para no reducir ni emborronar.
const DENSIDAD = window.devicePixelRatio || 1;
let vel = 1, tam = 1, conSombra = true;
const vel_ = document.getElementById('vel'), tam_ = document.getElementById('tam'), som_ = document.getElementById('som'), clip_ = document.getElementById('clip');
vel_.oninput = () => { vel = +vel_.value; document.getElementById('velv').textContent = vel + '×'; };
tam_.oninput = () => { tam = +tam_.value; document.getElementById('tamv').textContent = tam + '×' + (tam === 1 ? ' (natural)' : ''); ajustarLienzos(); };
som_.onchange = () => { conSombra = som_.checked; };
// El clip va en el # de la URL, para recargar o compartir.
clip_.value = location.hash.slice(1) || 'idle';
clip_.onchange = () => {
  history.replaceState(null, '', '#' + clip_.value);
  for (const p of piezas) { p.clip = clip_.value; recortar(p); }
  ajustarLienzos();
};

// Las columnas ocultas, recordadas en este navegador (si deja).
const CLAVE = 'visor-versiones-ocultas:' + ${JSON.stringify(titulo)};
let ocultas = new Set();
try { ocultas = new Set(JSON.parse(localStorage.getItem(CLAVE) ?? '[]')); } catch {}
const columnas_ = document.getElementById('columnas');
VERSIONES.forEach((v, i) => {
  const l = document.createElement('label');
  const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !ocultas.has(v.nombre);
  c.onchange = () => {
    if (c.checked) ocultas.delete(v.nombre); else ocultas.add(v.nombre);
    try { localStorage.setItem(CLAVE, JSON.stringify([...ocultas])); } catch {}
    mostrarColumnas();
  };
  l.append(c, v.nombre); columnas_.append(l);
});

const t = document.getElementById('t');
const piezas = [];
const cab = t.insertRow(); cab.append(document.createElement('th'));
const cabeceras = VERSIONES.map((v) => { const th = document.createElement('th'); th.textContent = v.nombre; cab.append(th); return th; });
for (let i = 0; i < 8; i++) {
  const fila = t.insertRow();
  const th = document.createElement('th'); th.className = 'dir'; th.textContent = VERSIONES[0].direcciones[i].nombre; fila.append(th);
  VERSIONES.forEach((v, col) => {
    const d = v.direcciones[i];
    const td = fila.insertCell();
    // Una prueba a medias: la dirección que falta, en blanco.
    if (d === null) { td.textContent = '—'; td.style.textAlign = 'center'; td.style.color = '#6b6f5c'; return; }
    const img = new Image(); img.src = d.src;
    const c = document.createElement('canvas');
    td.append(c);
    const p = { d, img, clip: clip_.value, c, td, col, filas: new Map(), oculta: false };
    piezas.push(p);
    img.onload = () => recortar(p);
  });
}

function mostrarColumnas() {
  VERSIONES.forEach((v, col) => cabeceras[col].classList.toggle('oculta', ocultas.has(v.nombre)));
  for (const p of piezas) {
    p.oculta = ocultas.has(VERSIONES[p.col].nombre);
    p.td.classList.toggle('oculta', p.oculta);
    if (p.oculta) soltar(p); else recortar(p);
  }
  ajustarLienzos();
}

// El lienzo de cada pieza cabe la figura más grande de las columnas visibles
// en esta animación (su caja respecto al ancla, \`cajasDeLosClips\`), con margen.
function ajustarLienzos() {
  let izq = 60, der = 60, arriba = 120, abajo = 10;
  for (const p of piezas) {
    const k = p.d.cajas[p.clip];
    if (p.oculta || !k) continue;
    izq = Math.max(izq, -k[0]); der = Math.max(der, k[2]); arriba = Math.max(arriba, -k[1]); abajo = Math.max(abajo, k[3]);
  }
  const ancho = Math.ceil((2 * Math.max(izq, der) + 16) * tam), alto = Math.ceil((arriba + abajo + 26) * tam);
  for (const p of piezas) {
    p.c.style.width = ancho + 'px'; p.c.style.height = alto + 'px';
    // Reasignar el tamaño borra el lienzo: solo si cambia.
    const w = Math.round(ancho * DENSIDAD), h = Math.round(alto * DENSIDAD);
    if (p.c.width !== w) p.c.width = w;
    if (p.c.height !== h) p.c.height = h;
    p.pie = (abajo + 10) * tam * DENSIDAD;
  }
}

// Cada pieza dibuja de la fila de su clip recortada a tamaño natural: con los 64
// atlas enteros el navegador los redecodificaba sin parar y se congelaba.
async function recortar(p) {
  if (p.oculta || !p.img.complete || p.img.naturalWidth === 0 || p.filas.has(p.clip)) return;
  const clip = p.clip, k = p.d.atlas.clips[clip];
  if (!k) return;
  const lado = p.d.atlas.cell, columnas = Math.min(k.frames, Math.floor(p.img.naturalWidth / lado));
  const bmp = await createImageBitmap(p.img, 0, k.row * lado, columnas * lado, lado);
  if (p.clip !== clip || p.oculta) { bmp.close(); return; }
  soltar(p);
  p.filas.set(clip, { bmp, escala: 1 });
  ajustarLienzos();
}
function soltar(p) { for (const r of p.filas.values()) r.bmp.close(); p.filas.clear(); }

mostrarColumnas();
${DIBUJO_DE_FIGURAS}
</script></body></html>
`;
}
