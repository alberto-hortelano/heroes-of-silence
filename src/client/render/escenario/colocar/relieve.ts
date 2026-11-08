/**
 * Las piezas del relieve por celdas (R4, R5) y sus guardias: las diagonales y las
 * bajadas, con sus marcadores; dónde caen sus filos y sus pies; qué hace una pared
 * en la reserva de un objeto (`vaciaPorque`, `puntosDeCelda`); y lo que cuenta el
 * informe de `componer` del relieve: paredes sin su pieza (`celdasMalCubiertas`),
 * bajadas sin pieza, tapadas o encima de un nodo, la senda bajo el relieve (#189),
 * lo alto de un acantilado sin roca (#205) y el tono del pedregal suelto de una
 * cara.
 */
import type { Suelo, TerrainKind } from '@core/map/terrain.js';
import { bajoLaSilueta, type PerfilDe, perfilesDelCatalogo } from '../caras.js';
import {
  type Catalogo,
  esHojaDeBajada,
  esHojaDeDiagonal,
  esHojaDeRampa,
  type Modulo,
  type ModuloDeBajada,
  type ModuloDeDiagonal,
  type ModuloDeRampa,
} from '../catalogo.js';
import {
  abajoDe,
  type Bajada,
  type Caidas,
  type Celda,
  claveDeCelda,
  FILA_DEL_FILO,
  filosDe,
  JUNTAS,
  pieDeJunta,
  rampaDe,
  taludDeBajada as taludDeBajadaDe,
} from '../celdas.js';
import { seHornea } from '../horneado.js';
import { type Caja, cajaDeSprite } from '../pasillo.js';
import { claveDe, ordenDeVolumenes, separar } from '../pintar.js';
import { ALTO_DE_NIVEL, CARA_DE_SUELO } from '../relieve.js';
import { ANCHO_DE_SENDA, type Senda } from '../sendas.js';
import { juntasColocadas, modulosDeLadera } from './laderas.js';
import { PASO_POR_EL_TABLERO } from './pasos-y-puentes.js';
import type { Sprite } from './sprite.js';
import { esDeLoAlto, materialDeCara, tonoDe } from './tablas.js';

/**
 * Las casillas de acantilado sin ninguna roca ni masa de `ALTO_DE_LO_ALTO` o
 * más con el pie en ellas (#205): lo alto que se lee como un suelo que se pisa.
 * No cuentan las de `bajoUnObjeto`, la huella de una ciudad, un pueblo o un
 * nodo, que tapa el objeto y donde no entra nada (su reserva). Es
 * `informe.acantiladosLisos`: antes de `cimaDeRoca`, 1 167 de 4 016 en 1-40 (la
 * cubierta y las piedras de lo alto no cuentan); con ella, 2, dos casillas
 * entre dos sendas donde ni el pico más estrecho cabe de 0,4.
 */
export function acantiladosLisos(
  sprites: readonly Pick<Sprite, 'clase' | 'alto' | 'x' | 'y'>[],
  terreno: readonly TerrainKind[],
  W: number,
  bajoUnObjeto: (i: number) => boolean,
): number[] {
  const conCima = new Set(
    sprites.filter(esDeLoAlto).map((s) => Math.floor(s.y) * W + Math.floor(s.x)),
  );
  const lisos: number[] = [];
  for (let i = 0; i < terreno.length; i++)
    if (terreno[i] === 'cliff' && !conCima.has(i) && !bajoUnObjeto(i)) lisos.push(i);
  return lisos;
}

/**
 * Hasta dónde, en casillas a cada lado, mira el pedregal de una cara si tiene
 * pared al lado (`tonoDelPedregalSuelto`).
 */
const ALREDEDOR_DEL_PEDREGAL = 0.3;

/**
 * El tono del pedregal de una cara, según lo que tiene alrededor (#170): con
 * una pared de acantilado o de ladera al lado, el de la cara (el que trae);
 * suelto, el de su suelo, como las rocas que se esparcen por él. Donde la
 * pared no entró ya no se pinta la cara (`pintadaDeCara`), y el pedregal con
 * el tono del basalto (`brightness(0.5)`) se leía como una mancha negra en el
 * llano (s9, junto al castillo del sureste).
 */
export function tonoDelPedregalSuelto(
  s: Sprite,
  sprites: readonly Sprite[],
  sueloEn: (x: number, y: number) => Suelo,
): string | undefined {
  const conPared = sprites.some((p) => {
    if (p.clase !== 'pared' || p === s || p.src === null || /rocas-caidas/.test(p.src))
      return false;
    const [x0, y0, x1, y1] = cajaDeSprite(p);
    return (
      s.x >= x0 - ALREDEDOR_DEL_PEDREGAL &&
      s.x <= x1 + ALREDEDOR_DEL_PEDREGAL &&
      s.y >= y0 &&
      s.y <= y1 + ALREDEDOR_DEL_PEDREGAL
    );
  });
  if (conPared) return s.tono;
  return materialDeCara(CARA_DE_SUELO[sueloEn(Math.floor(s.x), Math.floor(s.y))]).pedregal;
}

/**
 * Lo que una frontal puede salirse de su tramo de junta a junta, en casillas.
 * Un módulo mide de 1 a 2 casillas de ancho, y corrido más allá de su junta se
 * metía por encima de la diagonal que dobla la esquina: la escalera de #160.
 */
export const SALE_DE_SU_TRAMO = 0.15;

/** El color del marcador de una diagonal y el de una bajada sin arte: se tienen que ver. */
export const COLOR_DE_DIAGONAL = '#d4479b';
export const COLOR_DE_BAJADA = '#3fb8d8';

/**
 * Hasta qué caída hay arte de diagonales y bajadas: la 3 y las mayores llevan
 * la pieza de 2 estirada en alto (decisión del usuario, 07-10-2026).
 */
const caidaDeArte = (caida: number): 1 | 2 => (caida <= 1 ? 1 : 2);

/** Lo que se estira en alto una pieza de `caidaDeArte` puesta en una caída mayor. */
const estiramiento = (caida: number) => Math.max(1, caida / caidaDeArte(caida));

/**
 * Lo que se pinta una pieza del relieve por debajo del pie de su pared, en
 * casillas, como clave de profundidad: después de las frontales de su tramo,
 * que van a 0,05 ± 0,06 (`pared`), y así su junta queda encima.
 */
export const DETRAS_DEL_PIE = 0.12;

/** La hoja de diagonales de una pared: `diagonales-<material>-<se|so>-<caída de arte>`. */
export function hojaDeDiagonal(c: Pick<Celda, 'tipo' | 'material' | 'caida'>): string {
  const lado = c.tipo.startsWith('SE') ? 'se' : 'so';
  return `diagonales-${materialDeCara(c.material).nombre}-${lado}-${caidaDeArte(c.caida)}`;
}

/** La hoja de bajadas de una bajada: `bajadas-<material>-<caída de arte>`. */
export function hojaDeBajada(b: Pick<Bajada, 'material' | 'caida'>): string {
  return `bajadas-${materialDeCara(b.material).nombre}-${caidaDeArte(b.caida)}`;
}

/** Dónde quedaron los dos extremos del filo de una pieza de rampa ya colocada: lo inverso de `spriteDeRampa`. */
export function filoColocado(
  m: ModuloDeRampa,
  s: Pick<Sprite, 'x' | 'y' | 'ax' | 'ay' | 'nw' | 'nh' | 'alto' | 'ancho'>,
): readonly [readonly [number, number], readonly [number, number]] {
  return [enElMapa(s, m.rampa.filo[0]), enElMapa(s, m.rampa.filo[1])];
}

/** Los pies de las dos juntas de una pared, en el orden de `JUNTAS`. */
function piesDe(c: Celda): readonly [readonly [number, number], readonly [number, number]] {
  const [a, b] = JUNTAS[c.tipo];
  const [fa, fb] = filosDe(c);
  return [pieDeJunta(fa, a[2], c.caida), pieDeJunta(fb, b[2], c.caida)];
}

/** Lo que mide en casillas, en x y en y, un píxel de un módulo colocado: su escala. */
function escalaDe(s: Pick<Sprite, 'nw' | 'nh' | 'alto' | 'ancho'>): readonly [number, number] {
  const ky = s.alto / s.nh;
  return [s.ancho === undefined ? ky : s.ancho / s.nw, ky];
}

/** Un punto del módulo de `s`, en píxeles, llevado al mapa: lo inverso de colocarlo. */
function enElMapa(
  s: Pick<Sprite, 'x' | 'y' | 'ax' | 'ay' | 'nw' | 'nh' | 'alto' | 'ancho'>,
  [px, py]: readonly [number, number],
): readonly [number, number] {
  const [kx, ky] = escalaDe(s);
  return [s.x - (s.ax - px) * kx, s.y - (s.ay - py) * ky];
}

/**
 * Una pieza del relieve con dos puntos `m` del módulo sobre dos puntos `w` del
 * mapa, estirada en alto `estira` veces, y con su ancla bajada a `yClave` (su
 * clave de profundidad). La escala sale de la distancia entre los dos puntos.
 */
export function sobreDosPuntos(
  modulo: Pick<Modulo, 'src' | 'nw' | 'nh' | 'ax'>,
  m: readonly [readonly [number, number], readonly [number, number]],
  w: readonly [readonly [number, number], readonly [number, number]],
  porCasilla: number,
  estira: number,
  yClave: number,
): Pick<Sprite, 'src' | 'nw' | 'nh' | 'ax' | 'ay' | 'x' | 'y' | 'alto' | 'ancho'> {
  const kx = 1 / porCasilla;
  const ky = kx * estira;
  const x = (w[0][0] + (modulo.ax - m[0][0]) * kx + w[1][0] + (modulo.ax - m[1][0]) * kx) / 2;
  // El ancla, en el píxel del módulo que cae en `yClave`.
  const ay = (m[0][1] + (yClave - w[0][1]) / ky + m[1][1] + (yClave - w[1][1]) / ky) / 2;
  return {
    src: modulo.src,
    nw: modulo.nw,
    nh: modulo.nh,
    ax: modulo.ax,
    ay,
    x,
    y: yClave,
    alto: modulo.nh * ky,
    ...(estira === 1 ? {} : { ancho: modulo.nw * kx }),
  };
}

/**
 * La fila de las casillas altas de una diagonal (`Sprite.filaAlta`): la de
 * arriba de su vértice. La convexa cuelga de una de ella (NO o NE); la cóncava,
 * de las dos y de la de abajo que dobla la esquina, que también está delante.
 */
const filaAltaDeDiagonal = (c: Celda): number => c.vy - 1;

/**
 * Dónde va el módulo `m` de diagonal en la pared `c`: sus dos filos sobre los
 * dos de la celda (`filosDe`), de los que sale la escala; en una caída mayor
 * que la de su arte, estirado en alto. Su clave, bajo el pie de su pared.
 *
 * Estirado, los dos filos no caen a la vez en su sitio: van a media casilla en
 * y, y la media casilla crece con el estirón. Van centrados (en caída 3, cada
 * uno a un octavo de casilla del suyo): mejor eso que una pieza de caída 2 con
 * el pie 0,6 casillas corto.
 */
export function spriteDeDiagonal(m: ModuloDeDiagonal, hoja: string, c: Celda): Sprite {
  const w = filosDe(c);
  const [ma, mb] = m.diagonal.filo;
  const porCasilla =
    Math.hypot(mb[0] - ma[0], mb[1] - ma[1]) / Math.hypot(w[1][0] - w[0][0], w[1][1] - w[0][1]);
  const [pa, pb] = piesDe(c);
  const tono = tonoDe(hoja);
  return {
    ...(tono === undefined ? {} : { tono }),
    ...sobreDosPuntos(
      m,
      [ma, mb],
      w,
      porCasilla,
      estiramiento(c.caida),
      Math.max(pa[1], pb[1]) + DETRAS_DEL_PIE,
    ),
    clase: 'pared',
    color: COLOR_DE_DIAGONAL,
    capa: 0,
    sombra: true,
    filaAlta: filaAltaDeDiagonal(c),
  };
}

/** Dónde quedaron los dos filos de un módulo de diagonal ya colocado: lo inverso de `spriteDeDiagonal`. */
export function filosColocados(
  m: ModuloDeDiagonal,
  s: Pick<Sprite, 'x' | 'y' | 'ax' | 'ay' | 'nw' | 'nh' | 'alto' | 'ancho'>,
): readonly [readonly [number, number], readonly [number, number]] {
  return [enElMapa(s, m.diagonal.filo[0]), enElMapa(s, m.diagonal.filo[1])];
}

/** El marcador de una diagonal sin arte: en medio de sus filos, con la clave de su pieza. */
export function marcadorDeDiagonal(c: Celda): Sprite {
  const [fa, fb] = filosDe(c);
  const [pa, pb] = piesDe(c);
  return {
    src: null,
    nw: 1,
    nh: 1,
    ax: 0.5,
    ay: 1,
    x: (fa[0] + fb[0]) / 2,
    y: Math.max(pa[1], pb[1]) + DETRAS_DEL_PIE,
    alto: c.caida * ALTO_DE_NIVEL + 0.4,
    clase: 'pared',
    color: COLOR_DE_DIAGONAL,
    capa: 0,
    sombra: true,
    filaAlta: filaAltaDeDiagonal(c),
  };
}

/**
 * Dónde va el módulo `m` de bajada: su `arriba` donde la senda cruza el filo y
 * su `abajo` en el pie de la pared bajo él (`abajoDe`). La escala sale de lo que
 * mide su guía entre los dos, a la caída de su arte; en una mayor, estirada en
 * alto. Su clave, bajo el pie: después de las frontales de su tramo.
 */
export function spriteDeBajada(m: ModuloDeBajada, hoja: string, b: Bajada, yClave: number): Sprite {
  const de = caidaDeArte(b.caida);
  const { arriba, abajo } = m.bajada;
  const porCasilla =
    Math.hypot(abajo[0] - arriba[0], abajo[1] - arriba[1]) /
    Math.hypot(taludDeBajadaDe(b.rumbo, de), de * ALTO_DE_NIVEL);
  const w = [b.arriba, abajoDe(b)] as const;
  const estira = estiramiento(b.caida);
  // Con los dos puntos se ancla por `arriba`: estirada, `abajo` no cae en su sitio en x.
  const s = sobreDosPuntos(m, [arriba, arriba], [w[0], w[0]], porCasilla, estira, yClave);
  const tono = tonoDe(hoja);
  return {
    ...(tono === undefined ? {} : { tono }),
    ...s,
    clase: 'pared',
    color: COLOR_DE_BAJADA,
    capa: 0,
    sombra: false,
    filaAlta: b.alto[1],
  };
}

/** El marcador de una bajada sin arte: en el pie, con la clave de su pieza. */
export function marcadorDeBajada(b: Bajada, yClave: number): Sprite {
  const [x] = abajoDe(b);
  return {
    src: null,
    nw: 1,
    nh: 1,
    ax: 0.5,
    ay: 1,
    x,
    y: yClave,
    alto: b.caida * ALTO_DE_NIVEL + 0.35,
    clase: 'pared',
    color: COLOR_DE_BAJADA,
    capa: 0,
    sombra: false,
    filaAlta: b.alto[1],
  };
}

/**
 * La clave de profundidad de una bajada: bajo el pie más bajo de las paredes que
 * cruza (las de las celdas que tocan su `arriba`) y bajo el suyo. Así se pinta
 * después de ellas: con la de su pie, la diagonal convexa que cruza, que tiene
 * el pie más abajo, la tapaba.
 */
export function claveDeBajada(b: Bajada, vistas: readonly Celda[]): number {
  let pie = abajoDe(b)[1];
  for (const c of vistas)
    if (Math.abs(b.arriba[0] - c.vx) <= 0.5 + 1e-9 && Math.abs(b.arriba[1] - c.vy) <= 0.5 + 1e-9)
      for (const [, y] of piesDe(c)) pie = Math.max(pie, y);
  return pie + DETRAS_DEL_PIE;
}

/** El camino de la rampa de una bajada (`rampaDe`), cada `PASO_POR_EL_TABLERO`. */
export function caminoDeBajada(b: Bajada): (readonly [number, number])[] {
  const [[ax, ay], [bx, by]] = rampaDe(b);
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / PASO_POR_EL_TABLERO));
  return Array.from(
    { length: n + 1 },
    (_, j) => [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n] as const,
  );
}

/**
 * Si lo que pinta `s` cubre el punto `(x, y)`: bajo la silueta de su módulo
 * (`bajoLaSilueta`), o, sin arte, dentro del triángulo de su marcador.
 */
export function tapaElPunto(s: Sprite, perfilDe: PerfilDe, x: number, y: number): boolean {
  if (s.src === null) {
    const w = s.alto * 0.45;
    if (y > s.y || y < s.y - s.alto) return false;
    return Math.abs(x - s.x) <= (w * (y - (s.y - s.alto))) / s.alto;
  }
  return bajoLaSilueta(s, perfilDe(s), x, y, cajaDeSprite(s));
}

/**
 * Por qué una pared vista puede quedar sin pieza, o null si no hay razón: la
 * caja de una pared que la puerta no dejó entrar en alguno de sus puntos
 * (`puntosDeCelda`), por un puente que taparía (`rechazos`). La reserva de un
 * objeto ya no es razón: la pared pasa por detrás de él (#221).
 */
export function vaciaPorque(c: Celda, rechazos: readonly Rechazo[]): string | null {
  const puntos = puntosDeCelda(c);
  for (const { caja, razon } of rechazos)
    if (puntos.some(([x, y]) => x >= caja[0] && x <= caja[2] && y >= caja[1] && y <= caja[3]))
      return razon;
  return null;
}

/**
 * Qué hace una pared con un punto en la reserva de un objeto (`ponerPared`,
 * #221): el pedregal no va (`fuera`); la frontal y la ladera pasan por detrás
 * si no lo tapan a él ni a su camino, encogidas si hace falta (`detras`); y la
 * diagonal, además, se ordena detrás del objeto que taparía (`ordenada`).
 */
export type Reserva = 'fuera' | 'detras' | 'ordenada';

/** Una pared que la puerta no dejó entrar: lo que ocupaba y por qué. */
export interface Rechazo {
  readonly caja: Caja;
  readonly razon: 'objeto' | 'puente';
}

/**
 * Los puntos de una pared que miran la reserva de un objeto: sus filos, sus
 * pies y, entre ellos, cada cuarto de casilla. Los mira la puerta de una
 * diagonal y, para toda pared, la razón de quedar vacía (`vaciaPorque`): una
 * frontal se para en la reserva de su pie o de su filo, que caen entre ellos.
 */
export function puntosDeCelda(c: Celda): (readonly [number, number])[] {
  const [fa, fb] = filosDe(c);
  const [pa, pb] = piesDe(c);
  const fuera: (readonly [number, number])[] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    fuera.push(
      [fa[0] + (fb[0] - fa[0]) * t, fa[1] + (fb[1] - fa[1]) * t],
      [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t + 0.05],
    );
  }
  // Y por donde puede caer el ancla de su pieza: a su clave, bajo el pie, y a
  // los lados del medio de sus filos (el módulo no se ancla en el medio).
  const y = Math.max(pa[1], pb[1]) + DETRAS_DEL_PIE;
  const x = (fa[0] + fb[0]) / 2;
  for (const dx of [-0.3, -0.15, 0, 0.15, 0.3]) fuera.push([x + dx, y]);
  return fuera;
}

/** Lo que se tolera entre dónde quedó una junta y dónde debía, en casillas. */
const HOLGURA_DE_JUNTA = 0.02;

export const cerca = (p: readonly [number, number], q: readonly [number, number]) =>
  Math.abs(p[0] - q[0]) <= HOLGURA_DE_JUNTA && Math.abs(p[1] - q[1]) <= HOLGURA_DE_JUNTA;

/** Cuánto va estirado en alto un sprite (`Sprite.ancho`): 1 si no lo va. */
const estiramientoDe = (s: Pick<Sprite, 'nw' | 'nh' | 'alto' | 'ancho'>) =>
  s.ancho === undefined ? 1 : s.alto / s.nh / (s.ancho / s.nw);

/**
 * Si los dos filos de una diagonal colocada caen en los de su celda. Sin
 * estirar, cada uno en el suyo. Estirada (`spriteDeDiagonal`), en x cada uno en
 * el suyo y en y centrados, separados lo que la celda por el estirón: es el
 * desvío declarado de la caída 3, y nada más. Con la holgura de los filos sueltos
 * el lote (07-10-2026) dio 257 «fuera de toda celda» en 1-40, todas de caída 3.
 */
function filosEnSuSitio(
  puestos: readonly [readonly [number, number], readonly [number, number]],
  suyos: readonly [readonly [number, number], readonly [number, number]],
  estira: number,
): boolean {
  if (estira === 1) return cerca(puestos[0], suyos[0]) && cerca(puestos[1], suyos[1]);
  const [a, b] = puestos;
  const [fa, fb] = suyos;
  return (
    Math.abs(a[0] - fa[0]) <= HOLGURA_DE_JUNTA &&
    Math.abs(b[0] - fb[0]) <= HOLGURA_DE_JUNTA &&
    Math.abs((a[1] + b[1]) / 2 - (fa[1] + fb[1]) / 2) <= HOLGURA_DE_JUNTA &&
    Math.abs(b[1] - a[1] - (fb[1] - fa[1]) * estira) <= HOLGURA_DE_JUNTA
  );
}

/** Los módulos de diagonales, de bajadas y de rampas del catálogo por su `src`. */
export function modulosDelRelieve(catalogo: Catalogo): {
  diagonales: Map<string, ModuloDeDiagonal>;
  bajadas: Map<string, ModuloDeBajada>;
  rampas: Map<string, ModuloDeRampa>;
} {
  const diagonales = new Map<string, ModuloDeDiagonal>();
  const bajadas = new Map<string, ModuloDeBajada>();
  const rampas = new Map<string, ModuloDeRampa>();
  for (const [hoja, ms] of Object.entries(catalogo.hojas))
    for (const m of ms) {
      if (esHojaDeDiagonal(hoja) && m.diagonal !== undefined)
        diagonales.set(m.src, m as ModuloDeDiagonal);
      if (esHojaDeBajada(hoja) && m.bajada !== undefined) bajadas.set(m.src, m as ModuloDeBajada);
      if (esHojaDeRampa(hoja) && m.rampa !== undefined) rampas.set(m.src, m as ModuloDeRampa);
    }
  return { diagonales, bajadas, rampas };
}

/**
 * Lo que pinta el camino de una bajada: su pieza de `bajadas-*` (o su marcador)
 * o el cuerpo de una rampa (#225). No el costado, que es pared.
 */
function esCaminoDeBajada(
  s: Sprite,
  m: Pick<ReturnType<typeof modulosDelRelieve>, 'bajadas' | 'rampas'>,
): boolean {
  if (s.src === null) return s.color === COLOR_DE_BAJADA;
  const pieza = m.rampas.get(s.src)?.rampa.pieza;
  return m.bajadas.has(s.src) || pieza === 'cuerpo' || pieza === 'muesca';
}

/**
 * Las paredes vistas mal cubiertas, cada una con lo que le pasa. Se reconstruye
 * desde lo puesto, por la geometría de cada sprite (dónde quedaron sus juntas),
 * no por lo que `componer` apuntó al ponerlo:
 *
 * - una caída al sur lleva al menos una frontal (`paredes-*`) apoyada en su pie
 *   que cubre el centro de su celda;
 * - una al este o al oeste, exactamente una ladera con su filo en el de la celda;
 * - una diagonal, exactamente una pieza con sus dos filos en los de la celda, o
 *   su marcador donde va;
 *
 * salvo las vacías por una razón declarada (`vacia`: la reserva de un objeto, un
 * puente) y los barrancos (`Caidas.barrancos`), que llevan peñascos.
 */
export function celdasMalCubiertas(
  sprites: readonly Sprite[],
  rel: Pick<Caidas, 'vistas' | 'barrancos'>,
  catalogo: Catalogo,
  vacia: (c: Celda) => string | null,
): string[] {
  const deLadera = modulosDeLadera(catalogo);
  const { diagonales } = modulosDelRelieve(catalogo);
  const barrancos = new Set(rel.barrancos);
  /** Cuántas piezas lleva cada pared, por `claveDeCelda`. */
  const piezas = new Map<string, number>();
  const sumar = (k: string) => piezas.set(k, (piezas.get(k) ?? 0) + 1);
  const porFilos = new Map<string, Celda[]>();
  // Por la x de cada filo y la y de su punto medio, que es lo que no mueve el
  // estirón de una caída mayor que la del arte (`filosEnSuSitio`): con la y de
  // cada filo, en caída 4 (un cuarto de casilla de desvío) caía en otra clave.
  const claveDeFilos = (p: readonly [number, number], q: readonly [number, number]) =>
    `${Math.round(p[0] * 2)},${Math.round(q[0] * 2)},${Math.round((p[1] + q[1]) * 2)}`;
  const porVertice = new Map<string, Celda[]>();
  for (const c of rel.vistas) {
    const [fa, fb] = filosDe(c);
    const k = claveDeFilos(fa, fb);
    porFilos.set(k, [...(porFilos.get(k) ?? []), c]);
    const v = `${c.vx},${c.vy}`;
    porVertice.set(v, [...(porVertice.get(v) ?? []), c]);
  }
  /** Las paredes de los vértices de la columna `vx` de las filas `vy0` a `vy1`. */
  const enColumna = (vx: number, vy0: number, vy1: number) =>
    Array.from(
      { length: vy1 - vy0 + 1 },
      (_, k) => porVertice.get(`${vx},${vy0 + k}`) ?? [],
    ).flat();
  const frontales: { caja: readonly [number, number, number, number]; y: number }[] = [];
  const mal: string[] = [];
  for (const s of sprites) {
    if (s.clase !== 'pared') continue;
    if (s.src?.includes('/paredes-') === true) {
      frontales.push({ caja: cajaDeSprite(s), y: s.y });
      continue;
    }
    const ladera = s.src === null ? undefined : deLadera.get(s.src);
    if (ladera !== undefined) {
      const { filo, pie } = juntasColocadas(ladera.modulo, s);
      const este = pie[0] > filo[0];
      const fila = filo[1];
      const vx = Math.round(filo[0]);
      if (
        Math.abs(filo[0] - vx) > HOLGURA_DE_JUNTA ||
        Math.abs(fila * 2 - Math.round(fila * 2)) > HOLGURA_DE_JUNTA * 2
      ) {
        mal.push(
          `${s.src} con el filo en ${filo[0].toFixed(2)},${filo[1].toFixed(2)}: fuera de toda junta`,
        );
        continue;
      }
      for (let k = 0; k < ladera.modulo.ladera.largo; k++) {
        const vy = Math.round(fila * 2) / 2 + 0.5 + k;
        const c = porVertice.get(`${vx},${vy}`)?.find((o) => o.tipo === (este ? 'E' : 'O'));
        if (c === undefined)
          mal.push(`${s.src} en ${vx},${vy}: no hay ladera ${este ? 'este' : 'oeste'} ahí`);
        else sumar(claveDeCelda(c));
      }
      continue;
    }
    const diagonal = s.src === null ? undefined : diagonales.get(s.src);
    const filos =
      diagonal !== undefined
        ? filosColocados(diagonal, s)
        : s.src === null && s.color === COLOR_DE_DIAGONAL
          ? null
          : undefined;
    if (filos === undefined) continue;
    const suyas =
      filos === null
        ? // El marcador va en medio de sus filos, a un cuarto de casilla de su
          // vértice en x, y con su clave bajo el pie, hasta la caída más alta.
          enColumna(Math.round(s.x), Math.floor(s.y) - 4, Math.ceil(s.y)).filter((c) => {
            const m = marcadorDeDiagonal(c);
            return cerca([m.x, m.y], [s.x, s.y]) && Math.abs(m.alto - s.alto) < 1e-6;
          })
        : (porFilos.get(claveDeFilos(filos[0], filos[1])) ?? []).filter((c) =>
            filosEnSuSitio(filos, filosDe(c), estiramientoDe(s)),
          );
    if (suyas.length === 0)
      mal.push(
        `${s.src ?? 'marcador de diagonal'} en ${s.x.toFixed(2)},${s.y.toFixed(2)}: fuera de toda celda`,
      );
    for (const c of suyas) sumar(claveDeCelda(c));
  }
  for (const c of rel.vistas) {
    if (barrancos.has(c)) continue;
    const k = claveDeCelda(c);
    const donde = `${c.vx},${c.vy} ${c.tipo}`;
    const n =
      c.tipo === 'S'
        ? frontales.some(
            ({ caja, y }) =>
              caja[0] <= c.vx &&
              caja[2] >= c.vx &&
              Math.abs(y - (c.vy + c.caida * ALTO_DE_NIVEL)) <= 0.3,
          )
          ? 1
          : 0
        : (piezas.get(k) ?? 0);
    if (n > 1) mal.push(`${donde}: ${n} piezas`);
    else if (n === 0 && vacia(c) === null) mal.push(`${donde}: sin pieza y sin razón`);
  }
  return mal;
}

/**
 * El `arriba` de una bajada ya colocada (su pieza, su marcador o, la de una
 * rampa, el medio del filo de su cuerpo), o null si `s` no es una bajada.
 */
function arribaColocado(
  s: Sprite,
  { bajadas, rampas }: Pick<ReturnType<typeof modulosDelRelieve>, 'bajadas' | 'rampas'>,
  b: Bajada,
): readonly [number, number] | null {
  const m = s.src === null ? undefined : bajadas.get(s.src);
  if (m !== undefined) return enElMapa(s, m.bajada.arriba);
  const r = s.src === null ? undefined : rampas.get(s.src);
  if (r !== undefined) {
    if ((r.rampa.pieza !== 'cuerpo' && r.rampa.pieza !== 'muesca') || b.deUnaRampa !== true)
      return null;
    // El medio del filo de su fondo: el del cuerpo, o la fila de detrás de la de la muesca.
    const [fa, fb] = filoColocado(r, s);
    return [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2 - (FILA_DEL_FILO[r.rampa.pieza] - 1)];
  }
  if (s.src === null && s.color === COLOR_DE_BAJADA) {
    // El marcador va en la x del pie, con la clave por debajo de él.
    const [x, y] = abajoDe(b);
    return Math.abs(s.x - x) <= HOLGURA_DE_JUNTA && s.y >= y ? b.arriba : null;
  }
  return null;
}

/** Las bajadas sin su pieza (o su marcador) con el `arriba` en su sitio, cada una dicha. */
export function bajadasSinPieza(
  sprites: readonly Sprite[],
  bajadas: readonly Bajada[],
  catalogo: Catalogo,
): string[] {
  const m = modulosDelRelieve(catalogo);
  return bajadas
    .filter(
      (b) =>
        !sprites.some((s) => s.clase === 'pared' && cercaDe(arribaColocado(s, m, b), b.arriba)),
    )
    .map(
      (b) => `bajada ${b.rumbo} en ${b.arriba[0].toFixed(2)},${b.arriba[1].toFixed(2)}: sin pieza`,
    );
}

const cercaDe = (p: readonly [number, number] | null, q: readonly [number, number]) =>
  p !== null && cerca(p, q);

/**
 * Lo que tapa el camino de alguna bajada, medido desde lo pintado: cada volumen
 * que `separar` pone después de la bajada (y se pinta encima) cuya silueta
 * (`bajoLaSilueta`: el perfil de su módulo, o su caja si no lo trae) cubre algún
 * punto de su camino por la pared, de `arriba` a `abajo`, mirado cada
 * `PASO_POR_EL_TABLERO`. Como `puentesTapados`, no pregunta a la puerta.
 * No cuentan lo horneado ni los muros, ni las rocas planas del pie.
 */
export function bajadasTapadas(
  sprites: readonly Sprite[],
  bajadas: readonly Bajada[],
  catalogo: Catalogo,
): string[] {
  const m = modulosDelRelieve(catalogo);
  const perfilDe = perfilesDelCatalogo(catalogo);
  const { volumenes } = separar({ sprites });
  const fuera: string[] = [];
  for (const b of bajadas) {
    const k = volumenes.findIndex(
      ({ s }) => s.clase === 'pared' && cercaDe(arribaColocado(s, m, b), b.arriba),
    );
    if (k < 0) continue;
    const puntos = caminoDeBajada(b);
    // La que baja a un nodo y lo pisa va a su profundidad, justo detrás de él
    // (`componer`): lo que se pinta delante del nodo está delante de su llegada
    // y puede taparla. Sin esto, en s10, s31 y s36 una pared de delante de la
    // ciudad o del hito contaba como tapándola.
    const nodo = volumenes.find(({ s: n }, j) => j > k && esNodoHorneado(n) && llegaA(b, n))?.s;
    for (const { s } of volumenes.slice(k + 1)) {
      if (s.clase === 'objeto' || s.clase === 'muro') continue;
      if (nodo !== undefined && ordenDeVolumenes(s, nodo) > 0) continue;
      // Otra bajada que se cruza con esta es el mismo camino que se abre en dos.
      if (esCaminoDeBajada(s, m)) continue;
      if (puntos.some(([x, y]) => tapaElPunto(s, perfilDe, x, y))) {
        fuera.push(
          `bajada ${b.rumbo} en ${b.arriba[0].toFixed(2)},${b.arriba[1].toFixed(2)}: la tapa ${s.src ?? s.clase} en ${s.x.toFixed(2)},${s.y.toFixed(2)}`,
        );
        break;
      }
    }
  }
  return fuera;
}

/** Lo horneado de un nodo: ciudad, pueblo o nodo (`seHornea`). */
export const esNodoHorneado = (s: Sprite): boolean =>
  s.clase === 'objeto' && s.objeto !== undefined && seHornea(s.objeto.kind);

/**
 * Si lo horneado `n` está en la casilla baja de la bajada `b`: la rampa baja
 * hacia él, que queda delante. El de la casilla alta queda detrás de ella: la
 * rampa sale de su puerta hacia la cámara y se pinta encima, como la senda.
 */
export const llegaA = (b: Bajada, n: Sprite): boolean =>
  Math.floor(n.x) === b.bajo[0] && Math.floor(n.y) === b.bajo[1];

/** Paso de la rejilla con la que `seSolapan` busca un punto pintado por los dos. */
const PASO_DE_SOLAPE = 0.05;

/** Si `a` y `b` pintan algún punto en común, bajo sus siluetas (`tapaElPunto`). */
export function seSolapan(a: Sprite, b: Sprite, perfilDe: PerfilDe): boolean {
  const ca = cajaDeSprite(a);
  const cb = cajaDeSprite(b);
  const x0 = Math.max(ca[0], cb[0]);
  const x1 = Math.min(ca[2], cb[2]);
  const y0 = Math.max(ca[1], cb[1]);
  const y1 = Math.min(ca[3], cb[3]);
  for (let x = x0; x <= x1; x += PASO_DE_SOLAPE)
    for (let y = y0; y <= y1; y += PASO_DE_SOLAPE)
      if (tapaElPunto(a, perfilDe, x, y) && tapaElPunto(b, perfilDe, x, y)) return true;
  return false;
}

/**
 * Desde cuánto tapada se ve cortada la senda, en casillas de su trazo: un
 * tramo más corto queda bajo el labio de una pared y se sigue leyendo.
 */
export const SENDA_CORTADA = 0.5;

/**
 * Lo que la frontal o la ladera que pasa por detrás de un objeto (#222) puede
 * esconder de senda, en casillas seguidas: casi nada. Con `SENDA_CORTADA`, un
 * trozo de 0,45 al pie de una ciudad quedaba bajo la pared y, con la senda ya
 * apartada, contaba (s90 (5, 8)).
 */
export const ESCONDIDO_DETRAS = 0.3;

/**
 * Lo que la senda deja quieto a cada lado de la rampa de una bajada (#206): ahí
 * la cruza la pared por la bajada, que la pinta encima, y apartarla movería el
 * filo por donde cruza.
 */
export const JUNTO_A_LA_RAMPA = 0.45;

/**
 * Desde cuánto la senda apartada no mira un acantilado, un muro ni una
 * cordillera (#206): a media casilla de su canto, del centro de la casilla a lo
 * largo de un eje. Más cerca, no se le arrima más de lo que ya estaba. Con
 * 0,75 o 0,65 apartaba algo más (6,3 y 6,2 tramos por mapa frente a 6,55) y
 * rompía las cumbres de #204.
 */
export const LEJOS_DE_LA_BARRERA = 1;

/**
 * Por dónde se mira el agua alrededor del final de la salida recta de una
 * puerta (`sePisaJuntoAlRecinto`): la senda de 0,16 de media anchura y la orilla
 * pintada, que entra en lo que se pisa.
 */
export const CERCA_DEL_AGUA: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.35, 0],
  [-0.35, 0],
  [0, 0.35],
  [0, -0.35],
];

/**
 * Lo que la senda que pisaría el anillo de una ciudad puede arrimarse a una
 * barrera para apartarse de él: un cuarto de casilla de su canto. Entre una
 * cordillera y la torre de una esquina del recinto queda una casilla, y con
 * `LEJOS_DE_LA_BARRERA` la senda no cabía (s5 (28, 35-36)).
 */
export const CERCA_DE_LA_BARRERA_JUNTO_A_UN_RECINTO = 0.75;

/**
 * Qué del relieve tapa el punto `(x, y)` del suelo: `'bajada'` si lo pinta una
 * bajada —la rampa, que es camino—, `'pared'` si cae bajo la silueta de una
 * frontal, una ladera o una diagonal (`tapaElPunto`) y no lo tapa encima un
 * objeto que se pinta después (por su caja: la pared que pasa por detrás de una
 * ciudad, #221), o null. El pedregal no cuenta: es un peñasco suelto, no la
 * pared. Lo preguntan el contador
 * (`sendaBajoElRelieve`) y la senda que se aparta de lo alto
 * (`apartarDeLoQueTapa`, #206): una sola regla de qué la esconde.
 */
export function loQueTapa(
  sprites: readonly Sprite[],
  catalogo: Catalogo,
): (x: number, y: number) => 'pared' | 'bajada' | null {
  const m = modulosDelRelieve(catalogo);
  const perfilDe = perfilesDelCatalogo(catalogo);
  const esBajada = (s: Sprite) => esCaminoDeBajada(s, m);
  // Las paredes por casilla de su caja: un punto mira solo las de la suya.
  const porCasilla = new Map<number, Sprite[]>();
  for (const s of sprites) {
    if (s.clase !== 'pared' || s.src?.includes('/rocas-caidas/') === true) continue;
    const [x0, y0, x1, y1] = cajaDeSprite(s);
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        const k = y * 4096 + x;
        const lista = porCasilla.get(k);
        if (lista === undefined) porCasilla.set(k, [s]);
        else lista.push(s);
      }
  }
  const objetos = sprites
    .filter((s) => s.clase === 'objeto')
    .map((o) => ({ clave: claveDe(o), caja: cajaDeSprite(o) }));
  /** Si lo que pinta `s` en `(x, y)` lo tapa un objeto que se pinta después (#221). */
  const bajoUnObjeto = (s: Sprite, x: number, y: number) =>
    objetos.some(
      (o) =>
        o.clave > claveDe(s) &&
        x >= o.caja[0] &&
        x <= o.caja[2] &&
        y >= o.caja[1] &&
        y <= o.caja[3],
    );
  return (x, y) => {
    let pared = false;
    for (const s of porCasilla.get(Math.floor(y) * 4096 + Math.floor(x)) ?? []) {
      if (!tapaElPunto(s, perfilDe, x, y)) continue;
      if (esBajada(s)) return 'bajada';
      if (!bajoUnObjeto(s, x, y)) pared = true;
    }
    return pared ? 'pared' : null;
  };
}

/**
 * Los tramos de senda pintada que desaparecen bajo una pieza del relieve —una
 * frontal, una ladera o una diagonal—, cada uno dicho: su trazo, mirado cada
 * `PASO_POR_EL_TABLERO`, cae bajo la silueta de una pared (`tapaElPunto`) en
 * `SENDA_CORTADA` casillas seguidas o más. La bajada no cuenta, ni lo que tapa
 * ella: es la rampa que lleva la senda por la pared, a propósito (R5). Se mira
 * la huella entera, su centro y sus dos bordes a la media anchura de
 * `ANCHO_DE_SENDA`: lo que cuenta es que la senda desaparezca, no que una
 * pared le muerda el borde (la auditoría de 08-10-2026 miró solo el centro de
 * la senda de 0,2 y contó 589 tramos en 1-40).
 */
export function sendaBajoElRelieve(
  sprites: readonly Sprite[],
  sendas: readonly Senda[],
  catalogo: Catalogo,
): string[] {
  return tramosBajoElRelieve(sprites, sendas, catalogo).map(
    ({ desde, largo }) =>
      `senda bajo el relieve desde ${desde[0].toFixed(2)},${desde[1].toFixed(2)}: ${largo.toFixed(2)} casillas`,
  );
}

/** Los tramos de `sendaBajoElRelieve`: de dónde salen y cuánto miden. */
export function tramosBajoElRelieve(
  sprites: readonly Sprite[],
  sendas: readonly Senda[],
  catalogo: Catalogo,
  minimo = SENDA_CORTADA,
  aLaVista: (x: number, y: number) => boolean = () => false,
): { readonly desde: readonly [number, number]; readonly largo: number }[] {
  const queTapa = loQueTapa(sprites, catalogo);
  const tapado = (x: number, y: number): boolean => !aLaVista(x, y) && queTapa(x, y) === 'pared';
  const fuera: { desde: readonly [number, number]; largo: number }[] = [];
  for (const senda of sendas) {
    let desde: readonly [number, number] | undefined;
    let largo = 0;
    const cerrar = () => {
      if (desde !== undefined && largo >= minimo - 1e-9) fuera.push({ desde, largo });
      desde = undefined;
      largo = 0;
    };
    for (let i = 0; i + 1 < senda.length; i++) {
      const [ax, ay] = senda[i] as readonly [number, number];
      const [bx, by] = senda[i + 1] as readonly [number, number];
      const l = Math.hypot(bx - ax, by - ay);
      if (l === 0) continue;
      const n = Math.max(1, Math.round(l / PASO_POR_EL_TABLERO));
      // La normal a la media anchura de la huella: se mira el centro y los dos bordes.
      const nx = (-(by - ay) / l) * (ANCHO_DE_SENDA / 2);
      const ny = ((bx - ax) / l) * (ANCHO_DE_SENDA / 2);
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const y = ay + ((by - ay) * k) / n;
        if (tapado(x, y) && tapado(x + nx, y + ny) && tapado(x - nx, y - ny)) {
          desde ??= [x, y];
          largo += l / n;
        } else cerrar();
      }
    }
    cerrar();
  }
  return fuera;
}

/**
 * Las bajadas que el pintor pinta después de lo horneado del nodo al que bajan
 * (`llegaA`) y con el que se solapan (`seSolapan`), cada una dicha. La que baja
 * a una ciudad pintaba su camino sobre la muralla (s9).
 */
export function bajadasSobreNodo(
  sprites: readonly Sprite[],
  bajadas: readonly Bajada[],
  catalogo: Catalogo,
): string[] {
  const m = modulosDelRelieve(catalogo);
  const perfilDe = perfilesDelCatalogo(catalogo);
  const { volumenes } = separar({ sprites });
  const fuera: string[] = [];
  for (const b of bajadas) {
    const k = volumenes.findIndex(
      ({ s }) => s.clase === 'pared' && cercaDe(arribaColocado(s, m, b), b.arriba),
    );
    if (k < 0) continue;
    const s = (volumenes[k] as (typeof volumenes)[number]).s;
    const nodo = volumenes
      .slice(0, k)
      .find(({ s: n }) => esNodoHorneado(n) && llegaA(b, n) && seSolapan(s, n, perfilDe));
    if (nodo !== undefined)
      fuera.push(
        `bajada ${b.rumbo} en ${b.arriba[0].toFixed(2)},${b.arriba[1].toFixed(2)}: encima de ${nodo.s.objeto?.kind} ${nodo.s.objeto?.id}`,
      );
  }
  return fuera;
}
