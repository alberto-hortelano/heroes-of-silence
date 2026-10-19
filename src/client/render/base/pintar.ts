/**
 * Pinta la escena de la base: la plaza, lo construido y, delante, la gente.
 *
 * Con arte (vuelta 3), debajo de todo va un solo empedrado repetible
 * (`assets/bases/<f>/suelo.webp`) para toda la plaza; encima, lo que hay por
 * encima del pie de cada tramo (el cuadro sin edificios, `tramo-<n>.webp`),
 * cada uno bajado por su pie y cosido al anterior dentro del árbol de la junta;
 * y encima, el recorte de cada edificio construido, en su sitio del cuadro: los
 * dos salen del mismo cuadro maestro, así que casan sin escala ni ancla que
 * cuadrar (`colocarLaPlaca`, `colocarEnElCuadro`). Por encima de lo pintado, un
 * cielo liso del color medio de la fila de arriba. Sin arte —el nigromante este ciclo,
 * un tramo que aún no está, o mientras llega—, un cielo, un muro bajo recto, el
 * suelo entonado y cada edificio un bloque con su nombre: la escena se juega igual.
 *
 * La plaza y lo construido no cambian de un fotograma a otro mientras la cámara
 * está quieta: se pintan en un lienzo aparte (`Fondo`) y se copia entero; se
 * rehace cuando cambia algo de su clave (la cámara, el tamaño, el arte, lo
 * construido o lo señalado). El resaltado del edificio señalado va en él.
 *
 * Las figuras son las de siempre (`pintarFiguraConSombra`), del alto de una
 * figura de combate (`cajaDeFiguraEn`): el héroe o el alcaide anda con su
 * clip `walk`, y la gente respira en `idle`.
 */
import type { FactionId } from '@core/types.js';
import {
  bordeDeAtras,
  columnasALaVista,
  type Disposicion,
  FONDO_DE_LA_FRANJA,
  planoDelCuadro,
} from '../../../shared/base.js';
import { temaDelLienzo } from '../../temas.js';
import { cajaDeFiguraEn, pintarAroDeFigura } from '../batalla.js';
import { type Figura, pintarFiguraConSombra } from '../figura.js';
import { COLOR_NEUTRO } from '../palette.js';
import { enPantalla, type Tablero } from '../proyeccion.js';
import { type ArteDeLaBase, CIELO_SIN_ARTE } from './arte.js';
import type { Elemento } from './escena.js';
import type { Golpe } from './golpe.js';
import { cajaDelEdificio, colocarLaPlaca, escalaDelCuadro } from './recortes.js';

export interface PintadoDeLaBase {
  readonly d: Disposicion;
  readonly t: Tablero;
  readonly lienzo: { readonly ancho: number; readonly alto: number };
  readonly elementos: readonly Elemento[];
  readonly arte: ArteDeLaBase | null;
  /** El color del dueño, que tiñe a quien camina. */
  readonly color: string;
  /** Lo que está bajo el ratón, para resaltarlo. */
  readonly señalado: Exclude<Golpe, { tipo: 'suelo' }> | null;
}

/**
 * Los tonos del marcador sin arte, por facción: tierra de los templarios, ceniza de
 * los no muertos; los del Imperio, los Elfos y los Orkos, INVENTADOS (19-10-2026).
 */
const TONOS_SIN_ARTE = {
  templarios: {
    cielo: ['#3b4250', '#7d6f5c'],
    relleno: '#4d4a40',
    plaza: '#7d6e52',
    franja: '#8a7a58',
    bloque: '#5b4f3c',
  },
  'no-muertos': {
    cielo: ['#1d1b24', '#4a4350'],
    relleno: '#34303a',
    plaza: '#4f4953',
    franja: '#5f5862',
    bloque: '#433b46',
  },
  imperio: {
    cielo: ['#2f3a4a', '#8a8778'],
    relleno: '#4a4642',
    plaza: '#857b6a',
    franja: '#968a74',
    bloque: '#5a5249',
  },
  elfos: {
    cielo: ['#22352c', '#6f8466'],
    relleno: '#3c4a36',
    plaza: '#5f6e4c',
    franja: '#6f7d58',
    bloque: '#46543c',
  },
  orkos: {
    cielo: ['#3a2a22', '#7f5f44'],
    relleno: '#4a3a2c',
    plaza: '#6e5a40',
    franja: '#7d684a',
    bloque: '#544232',
  },
} as const satisfies Record<FactionId, unknown>;

/** Lo que sube el muro de relleno del marcador, en pasos de pantalla. */
const ALTO_DEL_RELLENO = 0.8;

/**
 * El marcador de la plaza entre `x0` y `x1` (en pasos): cielo, un muro bajo
 * sobre el borde de atrás de lo que se pisa, la plaza y la franja.
 */
function pintarSinArte(
  ctx: CanvasRenderingContext2D,
  v: PintadoDeLaBase,
  x0: number,
  x1: number,
): void {
  const { t, d, lienzo } = v;
  const tono = TONOS_SIN_ARTE[d.faccion];
  const izq = Math.max(0, enPantalla(t, { x: x0, y: 0 }).x);
  const der = Math.min(lienzo.ancho, enPantalla(t, { x: x1, y: 0 }).x);
  if (der <= izq) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(izq, 0, der - izq, lienzo.alto);
  ctx.clip();
  const cielo = ctx.createLinearGradient(0, 0, 0, lienzo.alto);
  cielo.addColorStop(0, tono.cielo[0]);
  cielo.addColorStop(1, tono.cielo[1]);
  ctx.fillStyle = cielo;
  ctx.fillRect(izq, 0, der - izq, lienzo.alto);
  const borde = Array.from({ length: 49 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / 48;
    return enPantalla(t, { x, y: bordeDeAtras(d, x) });
  });
  const subir = ALTO_DEL_RELLENO * t.paso;
  const linea = (puntos: readonly { x: number; y: number }[], dy = 0): void => {
    for (const [i, p] of puntos.entries()) {
      if (i === 0) ctx.moveTo(p.x, p.y + dy);
      else ctx.lineTo(p.x, p.y + dy);
    }
  };
  ctx.fillStyle = tono.relleno;
  ctx.beginPath();
  linea(borde);
  linea([...borde].reverse(), -subir);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tono.plaza;
  ctx.beginPath();
  linea(borde);
  ctx.lineTo(der, lienzo.alto);
  ctx.lineTo(izq, lienzo.alto);
  ctx.closePath();
  ctx.fill();
  const a = enPantalla(t, { x: x0, y: 0 });
  const b = enPantalla(t, { x: x1, y: FONDO_DE_LA_FRANJA });
  ctx.fillStyle = tono.franja;
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.restore();
}

/**
 * El empedrado de toda la plaza, por todo el lienzo: lo tapa lo que hay por
 * encima del pie de cada tramo. Va pegado al escenario (se mueve con la cámara)
 * y a la escala del cuadro, como las placas.
 */
function pintarElSuelo(
  ctx: CanvasRenderingContext2D,
  v: PintadoDeLaBase,
  suelo: HTMLImageElement,
): void {
  const patron = ctx.createPattern(suelo, 'repeat');
  if (patron === null) return;
  const k = escalaDelCuadro(v.t);
  const o = enPantalla(v.t, { x: 0, y: 0 });
  patron.setTransform(new DOMMatrix().translate(o.x, o.y).scale(k));
  ctx.fillStyle = patron;
  ctx.fillRect(0, 0, v.lienzo.ancho, v.lienzo.alto);
}

/**
 * Lo que va con el marcador, en pasos: una racha por cada serie de tramos
 * seguidos sin arte. Pintado tramo a tramo, cada recorte suavizaba su borde y
 * en la junta quedaba una raya oscura de arriba abajo (QA, H10). Cubre lo que
 * es suyo del escenario: sin el solape del primero, que es del anterior.
 */
export function rachasSinArte(
  d: Disposicion,
  placas: readonly (HTMLImageElement | null)[],
): { x0: number; x1: number }[] {
  const rachas: { x0: number; x1: number }[] = [];
  let racha: { x0: number; x1: number } | null = null;
  for (let i = 0; i < d.tramos; i++) {
    if ((placas[i] ?? null) !== null) {
      racha = null;
      continue;
    }
    const { desde, hasta } = columnasALaVista(d, i + 1);
    const x1 = Math.min(d.ancho, planoDelCuadro(d, i + 1, [hasta, 0]).x);
    if (racha === null) {
      racha = { x0: Math.max(0, planoDelCuadro(d, i + 1, [desde, 0]).x), x1 };
      rachas.push(racha);
    } else racha.x1 = x1;
  }
  return rachas;
}

/**
 * La plaza: el suelo y cada tramo con lo suyo o, si falta, su marcador. Por
 * encima de cada tramo, el cielo liso del arte, que entra fundido en él.
 */
function pintarLaPlaza(ctx: CanvasRenderingContext2D, v: PintadoDeLaBase): void {
  const { t, d, lienzo, arte } = v;
  const placas = arte?.tramos ?? [];
  const hayPlaca = placas.some((p) => p !== null);
  const cajas = Array.from({ length: d.tramos }, (_, i) => colocarLaPlaca(t, d, i + 1));
  const cielo = arte?.cielo ?? CIELO_SIN_ARTE;
  if (hayPlaca) {
    if (arte?.suelo) pintarElSuelo(ctx, v, arte.suelo);
    // Cada tramo va bajado por su pie: el cielo llega hasta el más bajo.
    const arriba = Math.max(...cajas.map((c) => c.y));
    if (arriba > 0) {
      ctx.fillStyle = cielo;
      ctx.fillRect(0, 0, lienzo.ancho, arriba + 1);
    }
  }
  for (const { x0, x1 } of rachasSinArte(d, placas)) pintarSinArte(ctx, v, x0, x1);
  for (const [i, caja] of cajas.entries()) {
    if (caja.x > lienzo.ancho || caja.x + caja.ancho < 0) continue;
    const placa = placas[i] ?? null;
    if (placa === null) continue;
    // Encima del anterior: desde el segundo, el tramo llega con su solape
    // fundido a transparente (lo hornea el taller), dentro del árbol de la junta.
    // Lo que trae es lo de encima de su pie: su alto es el suyo, no el del cuadro.
    ctx.drawImage(placa, caja.x, caja.y, caja.ancho, placa.naturalHeight * caja.k);
    if (caja.y > 0) {
      const hondo = caja.alto * 0.12;
      const funde = ctx.createLinearGradient(0, caja.y, 0, caja.y + hondo);
      funde.addColorStop(0, cielo);
      funde.addColorStop(1, cielo.replace('rgb(', 'rgba(').replace(')', ', 0)'));
      ctx.fillStyle = funde;
      ctx.fillRect(caja.x, caja.y, caja.ancho, hondo);
    }
  }
}

function pintarEdificio(
  ctx: CanvasRenderingContext2D,
  v: PintadoDeLaBase,
  e: Extract<Elemento, { tipo: 'edificio' }>,
): void {
  const señalado = v.señalado?.tipo === 'sitio' && v.señalado.sitio === e.sitio;
  const { caja, pieza } = cajaDelEdificio(v.t, v.d, e, v.arte);
  if (caja.x > v.lienzo.ancho || caja.x + caja.ancho < 0) return;
  if (pieza !== null) {
    ctx.save();
    // En el fondo cacheado (`Fondo`): el filtro se paga al rehacerlo, no en cada fotograma.
    if (señalado) ctx.filter = 'brightness(1.18) drop-shadow(0 0 6px rgba(245, 217, 115, 0.85))';
    ctx.drawImage(pieza.imagen, caja.x, caja.y, caja.ancho, caja.alto);
    ctx.restore();
    return;
  }
  ctx.fillStyle = TONOS_SIN_ARTE[v.d.faccion].bloque;
  ctx.fillRect(caja.x, caja.y, caja.ancho, caja.alto);
  ctx.strokeStyle = señalado ? '#f5d973' : 'rgba(0,0,0,0.6)';
  ctx.lineWidth = señalado ? 3 : 1.5;
  ctx.strokeRect(caja.x, caja.y, caja.ancho, caja.alto);
  const tema = temaDelLienzo();
  ctx.fillStyle = tema.rotulo;
  ctx.font = `bold ${Math.max(10, Math.round(v.t.paso * 0.16))}px ${tema.letraUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.nombre, caja.x + caja.ancho / 2, caja.y + caja.alto / 2, caja.ancho - 8);
}

function pintarPersona(
  ctx: CanvasRenderingContext2D,
  v: PintadoDeLaBase,
  e: Extract<Elemento, { tipo: 'figura' }>,
): void {
  const c = cajaDeFiguraEn(v.t, e.en);
  if (c.x + c.ancho < 0 || c.x - c.ancho > v.lienzo.ancho) return;
  if (v.señalado?.tipo === 'pnj' && v.señalado.id === e.id) pintarAroDeFigura(ctx, c);
  const figura: Figura = {
    id: e.id,
    body: e.cuerpo,
    clip: e.clip,
    tiempo: e.tiempo,
    x: c.x,
    suelo: c.suelo,
    alto: c.alto,
    mira: e.mira,
    // Solo quien camina lleva el color del jugador: la gente de la base va en el
    // neutro, y así se ve de un vistazo a quién se mueve. Todos del mismo rojo,
    // el alcaide se perdía entre los vecinos.
    color: e.pnj ? COLOR_NEUTRO : v.color,
    rotulo: e.nombre.charAt(0).toUpperCase(),
  };
  pintarFiguraConSombra(ctx, figura);
}

/**
 * La plaza y lo construido, pintados una vez en un lienzo del tamaño del de la
 * escena en píxeles de dispositivo, y la clave con que se pintaron. Con la
 * cámara quieta, un fotograma de la base es copiar este lienzo y pintar las
 * figuras: el patrón del suelo, los degradados del cielo y el filtro del
 * resaltado ya no se rehacen en cada uno.
 */
interface Fondo {
  readonly lienzo: HTMLCanvasElement;
  clave: readonly unknown[];
}
let fondo: Fondo | null = null;

const mismaClave = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Pinta la plaza y lo construido en `ctx`: lo copia del fondo, o lo rehace si cambió su clave. */
function pintarElFondo(
  ctx: CanvasRenderingContext2D,
  v: PintadoDeLaBase,
  edificios: readonly Extract<Elemento, { tipo: 'edificio' }>[],
): void {
  const m = ctx.getTransform();
  const ancho = Math.max(1, Math.round(v.lienzo.ancho * m.a));
  const alto = Math.max(1, Math.round(v.lienzo.alto * m.d));
  const señalado = v.señalado?.tipo === 'sitio' ? v.señalado.sitio : null;
  // Lo que cambia lo pintado: la vista, el arte (cada recorte que llega es un
  // `ArteDeLaBase` nuevo), lo construido y lo señalado. Los elementos se
  // rehacen en cada fotograma: entran por lo que tienen dentro.
  const clave = [
    v.t.origenX,
    v.t.origenY,
    v.t.paso,
    ancho,
    alto,
    v.d,
    v.arte,
    señalado,
    ...edificios.map((e) => e.edificio),
  ];
  fondo ??= { lienzo: document.createElement('canvas'), clave: [] };
  if (!mismaClave(fondo.clave, clave)) {
    const l = fondo.lienzo;
    if (l.width !== ancho || l.height !== alto) {
      l.width = ancho;
      l.height = alto;
    }
    const f = l.getContext('2d');
    if (f === null) throw new Error('el navegador no da un lienzo 2D para el fondo de la base');
    f.setTransform(m.a, 0, 0, m.d, 0, 0);
    f.clearRect(0, 0, v.lienzo.ancho, v.lienzo.alto);
    pintarLaPlaza(f, v);
    for (const e of edificios) pintarEdificio(f, v, e);
    fondo.clave = clave;
  }
  ctx.drawImage(fondo.lienzo, 0, 0, v.lienzo.ancho, v.lienzo.alto);
}

export function pintarBase(ctx: CanvasRenderingContext2D, v: PintadoDeLaBase): void {
  // Toda figura va delante de todo edificio (`componerBase`): los edificios van
  // en el fondo y las figuras encima.
  pintarElFondo(
    ctx,
    v,
    v.elementos.filter((e): e is Extract<Elemento, { tipo: 'edificio' }> => e.tipo === 'edificio'),
  );
  for (const e of v.elementos) if (e.tipo === 'figura') pintarPersona(ctx, v, e);
}
