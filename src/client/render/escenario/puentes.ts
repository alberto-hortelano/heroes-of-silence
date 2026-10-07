/**
 * Los puentes (#157): de un nodo que cruza un río, qué pieza va, por dónde
 * cruza, dónde tocan el suelo sus estribos y por dónde pasa su tablero. Lo
 * deciden las ORILLAS —las regiones que el nodo une—, no las vecinas que son
 * agua: con solo la barrera y su eje no hay más que dos orientaciones.
 *
 * Puro, como el resto del escenógrafo: un análisis, un relieve y el catálogo
 * entran y un `Puente` sale. Lo coloca `componer`.
 */
import type { TramoDeCamino } from '@core/map/map.js';
import { isWalkable, type TerrainKind } from '@core/map/terrain.js';
import { type Analisis, regionPisable } from './analizar.js';
import type { Catalogo, MedidasDePuente } from './catalogo.js';
import { pasaElCamino } from './nodos.js';
import { ALTO_DE_NIVEL } from './relieve.js';
import { ANCHO_DEL_VADO, grafoDeTramos, type Senda, type Tramo } from './sendas.js';

/** Por dónde cruza: de norte a sur, de oeste a este, o en una de las diagonales. */
export const EJES_DE_PUENTE = ['ns', 'eo', 'ne-so', 'no-se'] as const;
export type EjeDePuente = (typeof EJES_DE_PUENTE)[number];

/**
 * Cada eje como un paso de rejilla (la `y` crece hacia el sur), en el orden en
 * que se prueban: los rectos antes que las diagonales, que el arte recto lee
 * mejor el cruce.
 */
const PASO_DEL_EJE: Readonly<Record<EjeDePuente, readonly [number, number]>> = {
  ns: [0, 1],
  eo: [1, 0],
  'ne-so': [1, -1],
  'no-se': [1, 1],
};

const EJES = Object.keys(PASO_DEL_EJE) as EjeDePuente[];

/** El paso de un eje hecho unitario: por donde se mide el largo del tablero. */
const unitario = ([dx, dy]: readonly [number, number]): Punto => {
  const l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
};
const UNITARIO_DEL_EJE: Readonly<Record<EjeDePuente, Punto>> = {
  ns: unitario(PASO_DEL_EJE.ns),
  eo: unitario(PASO_DEL_EJE.eo),
  'ne-so': unitario(PASO_DEL_EJE['ne-so']),
  'no-se': unitario(PASO_DEL_EJE['no-se']),
};

export const CLASES_DE_PUENTE = ['piedra', 'troncos'] as const;
export type ClaseDePuente = (typeof CLASES_DE_PUENTE)[number];

/** Un punto en casillas. */
export type Punto = readonly [number, number];

export interface Puente {
  /** El id del nodo que cruza. */
  readonly id: string;
  /** La pieza del catálogo (`puente-piedra-ns-sube`…), haya arte o no. */
  readonly pieza: string;
  readonly eje: EjeDePuente;
  readonly clase: ClaseDePuente;
  /** El centro de la casilla del nodo: de ahí salían los tramos que ahora llegan a los estribos. */
  readonly nodo: Punto;
  /** El centro del tablero, en el suelo: el pie del sprite y su clave de profundidad. */
  readonly centro: Punto;
  /**
   * Por cuánto se multiplica la pieza (alto, largo y altura del tablero): 1 en
   * los cruces rectos; en los quebrados, lo que deja los dos estribos en tierra
   * (`asentar`), entre 0,7 y 1,15.
   */
  readonly escala: number;
  /**
   * Donde va la marca del dueño (el óvalo y el mástil de la bandera), en
   * casillas de pantalla: sobre el tablero, en el punto de su línea más cercano
   * al centro del nodo, alzado la altura del tablero. Así se lee y cae en la
   * casilla que se pulsa; en el centro del nodo quedaba en el río, bajo el
   * tablero.
   */
  readonly asiento: Punto;
  /**
   * El pie del mástil de la bandera del dueño, en casillas de pantalla: sobre el
   * tablero, a `MASTIL_EN_EL_TABLERO` de su largo hacia el extremo de la
   * derecha (el de abajo en N-S, que queda delante), a la altura del tablero
   * ahí. En un extremo, para que no lo tape quien esté en el medio; con el
   * mástil de los demás nodos, 0,65 casillas por encima del tablero, flotaba en
   * el aire sobre el río (H1 del QA de #157).
   */
  readonly mastil: Punto;
  /** Donde cada estribo toca el suelo, a `largo / 2` del centro por el eje. */
  readonly extremos: readonly [Punto, Punto];
  /**
   * Lo que el tablero ocupa en pantalla, como una senda: de un extremo en el
   * suelo, por el tablero alzado su `altura`, al otro. Es el pasillo que no
   * pisan pared, ladera ni nada que se aparte del camino.
   */
  readonly tablero: Senda;
}

/**
 * Las medidas de un puente sin arte, para su marcador y su senda: las del de
 * troncos plano, redondeadas. El juego se juega sin imágenes, y el camino
 * tiene que llegar igual a algún sitio.
 */
const SIN_ARTE: MedidasDePuente = { pxPorCasilla: 1, altura: 0.25, largo: 2.2 };

/**
 * El eje más cercano a la dirección `(vx, vy)`: recto si la otra componente no
 * pasa de tan 22,5° ≈ 0,414 de la mayor; si no, la diagonal de su signo.
 */
export function ejeMasCercano(vx: number, vy: number): EjeDePuente {
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (ay <= 0.414 * ax) return 'eo';
  if (ax <= 0.414 * ay) return 'ns';
  return vx * vy > 0 ? 'no-se' : 'ne-so';
}

/**
 * El puente del nodo `nodo`, que cruza agua (`barreraDeNodo`):
 *
 * 1. Si dos vecinas opuestas se pisan y son de regiones distintas, el eje es el
 *    suyo (en el orden de `PASO_DEL_EJE`) y el centro, el del nodo.
 * 2. Si no (un cruce quebrado: las orillas no se miran), el par de vecinas de
 *    regiones distintas más separado; el eje, el más cercano a su dirección, y
 *    el centro, el punto medio de las dos.
 * 3. Con menos de dos regiones alrededor, el eje de la barrera
 *    (`Analisis.pasos`: un río a lo ancho se cruza de norte a sur).
 *
 * Sube (`-sube`) solo en el caso 1, con las orillas a distinto nivel y la alta
 * donde la tiene el arte —al norte en N-S, al este en E-O— y si el catálogo
 * trae la pieza; si no, la plana (lo que falta, en `peticiones.md` §21). Es de
 * piedra si algún tramo de camino toca el nodo, y de troncos si no.
 */
export function puenteDe(
  nodo: { readonly id: string; readonly at: { readonly x: number; readonly y: number } },
  a: Pick<Analisis, 'W' | 'H' | 'fuente' | 'region' | 'pasos'>,
  nivel: ArrayLike<number>,
  tramos: readonly TramoDeCamino[],
  catalogo: Catalogo,
): Puente {
  const { x, y } = nodo.at;
  /** La vecina `(dx, dy)` si se pisa: su índice y su región. */
  const orilla = (dx: number, dy: number) => {
    const r = regionPisable(a, x + dx, y + dy);
    return r < 0 ? null : { i: (y + dy) * a.W + x + dx, r, dx, dy };
  };
  const clase: ClaseDePuente = pasaElCamino(tramos, { x, y }) ? 'piedra' : 'troncos';

  let eje: EjeDePuente | null = null;
  let centro: Punto = [x + 0.5, y + 0.5];
  let escala = 1;
  let sube = false;
  for (const e of EJES) {
    const [dx, dy] = PASO_DEL_EJE[e];
    const p = orilla(dx, dy);
    const q = orilla(-dx, -dy);
    if (p === null || q === null || p.r === q.r) continue;
    eje = e;
    // `p` es la del sur en N-S y la del este en E-O: el arte sube al norte y al este.
    const np = nivel[p.i] as number;
    const nq = nivel[q.i] as number;
    sube = (e === 'ns' && nq > np) || (e === 'eo' && np > nq);
    break;
  }
  if (eje === null) {
    // Orillas que no se miran: un plan del agente pone el nodo donde quiere y
    // `problemasDeRed` no mira las orillas; en el procedimental, solo el ~1 %
    // de nodos cuya red fina no tiene vecinas opuestas (#161). Ver `asentar`.
    const vecinas = [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1].flatMap((dx) => ((dx !== 0 || dy !== 0) && orilla(dx, dy)) || []),
    );
    let mejor: { d: number; p: (typeof vecinas)[number]; q: (typeof vecinas)[number] } | null =
      null;
    for (const [k, p] of vecinas.entries())
      for (const q of vecinas.slice(k + 1)) {
        if (p.r === q.r) continue;
        const d = (p.dx - q.dx) * (p.dx - q.dx) + (p.dy - q.dy) * (p.dy - q.dy);
        if (mejor === null || d > mejor.d) mejor = { d, p, q };
      }
    if (mejor !== null) {
      const { p, q } = mejor;
      const medio: Punto = [x + 0.5 + (p.dx + q.dx) / 2, y + 0.5 + (p.dy + q.dy) / 2];
      const asentado = asentar(
        [x + 0.5, y + 0.5],
        medio,
        [q.dx - p.dx, q.dy - p.dy],
        [p.r, q.r],
        a,
        (e) => medidasDe(`puente-${clase}-${e}`, catalogo),
      );
      eje = asentado?.eje ?? ejeMasCercano(q.dx - p.dx, q.dy - p.dy);
      centro = asentado?.centro ?? medio;
      escala = asentado?.escala ?? 1;
    } else {
      const paso = a.pasos.get(nodo.id);
      if (paso === undefined) throw new Error(`el nodo ${nodo.id} no está en el análisis del mapa`);
      eje = paso.eje === 'ancho' ? 'ns' : 'eo';
    }
  }
  const plana = `puente-${clase}-${eje}`;
  const pieza = sube && catalogo.piezas[`${plana}-sube`] !== undefined ? `${plana}-sube` : plana;
  const medidas = catalogo.piezas[pieza]?.puente ?? SIN_ARTE;
  const extremos = extremosDe(centro, eje, medidas.largo * escala);
  const [e0, e1] = extremos;
  const altura = medidas.altura * escala;
  // El punto del tablero, ya alzado, más cercano al centro del nodo en
  // pantalla: el de la línea en el suelo más cercano al centro bajado la altura.
  // Proyectando el centro sin bajarlo, al alzarlo caía en la casilla de arriba
  // en algún quebrado, y se pulsaba otra.
  const [cx, cy] = centro;
  const [vx, vy] = [e1[0] - e0[0], e1[1] - e0[1]];
  const t = Math.max(
    -0.5,
    Math.min(0.5, ((x + 0.5 - cx) * vx + (y + 0.5 + altura - cy) * vy) / (vx * vx + vy * vy)),
  );
  // `e1` es siempre el extremo de la derecha (o el de abajo, en N-S): todos los
  // pasos de `PASO_DEL_EJE` tienen la x ≥ 0, y el de N-S, la y > 0. En una pieza
  // que sube, el tablero sube un nivel de punta a punta: en N-S hacia el norte
  // (`e0`) y en E-O hacia el este (`e1`).
  const m = MASTIL_EN_EL_TABLERO;
  const subida = !pieza.endsWith('-sube') ? 0 : (eje === 'eo' ? m : -m) * ALTO_DE_NIVEL * escala;
  return {
    id: nodo.id,
    pieza,
    eje,
    clase,
    nodo: [x + 0.5, y + 0.5],
    centro,
    escala,
    asiento: [cx + t * vx, cy + t * vy - altura],
    mastil: [cx + m * vx, cy + m * vy - altura - subida],
    extremos,
    tablero: [e0, [e0[0], e0[1] - altura], [e1[0], e1[1] - altura], e1],
  };
}

/**
 * Dónde va el mástil por el tablero, en fracción de su largo desde el centro:
 * dentro de lo llano en las dos clases (las rampas empiezan en ±0,37) y fuera
 * del medio, donde se pinta quien lo pisa.
 */
const MASTIL_EN_EL_TABLERO = 0.28;

/**
 * Media anchura de lo que se pulsa de un puente, en casillas, a escala 1: algo
 * más que la del tablero (0,28 la piedra y 0,25 los troncos), que al borde se
 * pulsa sin apuntar.
 */
const MEDIO_ANCHO_PULSABLE = 0.32;

/**
 * El puente que se pulsa en el punto `(x, y)` de pantalla, en casillas, o null.
 * Lo que se pulsa es su figura de perfil —de un estribo, por el tablero alzado,
 * al otro y de vuelta por el suelo, con el arco y el agua de debajo—, con
 * `MEDIO_ANCHO_PULSABLE` de margen, y solo si la casilla bajo el ratón es agua
 * (no se pisa) o la del nodo. `pisable(cx, cy)` dice si la casilla entera
 * `(cx, cy)` se pisa. Si dos lo cogen, el más cercano a su medio.
 *
 * El tablero se ve alzado y, en los quebrados, corrido: la casilla bajo el
 * ratón era a menudo agua, y pulsar el puente decía «No hay camino» (H2 del QA
 * de #157). Pero la tierra de otra casilla manda sobre el puente aunque el
 * tablero la tape en pantalla: en los N-S, el tablero alzado cubre la casilla
 * de la orilla norte, y pulsar al héroe que esperaba en ella lo bajaba al
 * puente, o seleccionaba al otro héroe que había en él (H9 del QA de #157).
 */
export function puenteBajo<P extends Pick<Puente, 'tablero' | 'centro' | 'escala' | 'nodo'>>(
  puentes: readonly P[],
  x: number,
  y: number,
  pisable: (cx: number, cy: number) => boolean,
): P | null {
  const [cx, cy] = [Math.floor(x), Math.floor(y)];
  const sobreTierra = pisable(cx, cy);
  let mejor: { p: P; d: number } | null = null;
  for (const p of puentes) {
    if (sobreTierra && (cx !== Math.floor(p.nodo[0]) || cy !== Math.floor(p.nodo[1]))) continue;
    if (distanciaAFigura(p.tablero, x, y) > MEDIO_ANCHO_PULSABLE * p.escala) continue;
    const alMedio = Math.hypot(x - p.centro[0], y - p.centro[1]);
    if (mejor === null || alMedio < mejor.d) mejor = { p, d: alMedio };
  }
  return mejor?.p ?? null;
}

/**
 * `puenteBajo` sobre un mapa: lo que se pisa lo dice su terreno (`ancho`
 * casillas por fila); fuera del mapa no se pisa. Lo preguntan el puntero
 * (`casillaBajo`) y una marca de fallo (`queHayEn`), y tienen que contestar lo mismo.
 */
export function puenteEnElTerreno<P extends Pick<Puente, 'tablero' | 'centro' | 'escala' | 'nodo'>>(
  puentes: readonly P[],
  terreno: readonly TerrainKind[],
  ancho: number,
  x: number,
  y: number,
): P | null {
  return puenteBajo(puentes, x, y, (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= ancho) return false;
    const t = terreno[cy * ancho + cx];
    return t !== undefined && isWalkable(t);
  });
}

/** La distancia de `(x, y)` a un polígono convexo cerrado (0 dentro), aunque sea plano. */
function distanciaAFigura(figura: readonly Punto[], x: number, y: number): number {
  let d = Number.POSITIVE_INFINITY;
  let signo = 0;
  let dentro = figura.length >= 3;
  for (const [k, [ax, ay]] of figura.entries()) {
    const [bx, by] = figura[(k + 1) % figura.length] as Punto;
    const [vx, vy] = [bx - ax, by - ay];
    const l2 = vx * vx + vy * vy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
    d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
    const cruz = vx * (y - ay) - vy * (x - ax);
    if (cruz !== 0) {
      if (signo === 0) signo = Math.sign(cruz);
      else if (Math.sign(cruz) !== signo) dentro = false;
    }
  }
  return dentro && signo !== 0 ? 0 : d;
}

/** Las medidas de una pieza plana, o las del puente sin arte. */
const medidasDe = (pieza: string, catalogo: Catalogo): MedidasDePuente =>
  catalogo.piezas[pieza]?.puente ?? SIN_ARTE;

/** Los extremos de un tablero de `largo` centrado en `centro` por `eje`. */
function extremosDe(centro: Punto, eje: EjeDePuente, largo: number): readonly [Punto, Punto] {
  const [ux, uy] = UNITARIO_DEL_EJE[eje].map((u) => u * (largo / 2)) as [number, number];
  const [cx, cy] = centro;
  return [
    [cx - ux, cy - uy],
    [cx + ux, cy + uy],
  ];
}

/**
 * Las escalas que se prueban en un cruce quebrado, de la pieza tal cual a lo
 * más que se aparta. Más allá de ±15 %, el de troncos se lee como de juguete o
 * de gigante al lado de los rectos; solo se baja de ahí para que el medio del
 * tablero caiga en la casilla del nodo (`EXIGENCIAS`).
 */
const ESCALAS = [1, 0.95, 1.05, 0.9, 1.1, 0.85, 1.15];
/** Hasta dónde se corre el centro desde el punto medio de las orillas, en casillas, por cada eje. */
const CORRIMIENTO = 0.6;
/**
 * Lo que tiene que haber de tierra alrededor de cada extremo, en casillas: el
 * estribo de tierra se ensancha ahí, y con solo el extremo en tierra asomaba
 * medio estribo sobre el agua.
 */
const HOLGURA_DEL_ESTRIBO = 0.15;

/** Lo que se le pide a un asiento: holgura de tierra en cada estribo y escalas que se prueban. */
interface Exigencia {
  readonly holgura: number;
  readonly escalas: readonly number[];
  /** Si el medio del tablero, alzado, tiene que caer en la casilla del nodo. */
  readonly enLaCasilla: boolean;
}

/**
 * Si `v` cae en la casilla de `centro` (por un eje) a `MARGEN_EN_LA_CASILLA` o
 * más de su borde: en el borde, el medio del tablero se lee de las dos.
 */
const dentroDeLaCasilla = (v: number, centro: number) =>
  Math.abs(v - centro) <= 0.5 - MARGEN_EN_LA_CASILLA;
const MARGEN_EN_LA_CASILLA = 0.05;

/** Lo más lejos que pasa la línea del tablero, en el suelo, del centro del nodo. */
const CRUZA_EL_NODO = 0.5;

/**
 * Lo que se pide, de más a menos. Primero, estribos holgados a ±15 % y el medio
 * del tablero —como se ve, alzado— en la casilla del nodo, que es la que se
 * pulsa y donde se pinta quien lo pisa. Si no cabe, el extremo en tierra a
 * secas y el puente más corto, hasta el 70 %: antes se pierde holgura que
 * casilla. Y si ni así (4 de 101 en las semillas 1-40: las dos orillas quedan
 * una fila por encima del nodo, y alzado el tablero cae en la de arriba), la
 * línea del tablero pasa por la casilla en el suelo, como antes: un estribo en
 * el río es peor que un medio corrido, y el clic lo resuelve `puenteBajo`.
 */
const EXIGENCIAS: readonly Exigencia[] = [
  { holgura: HOLGURA_DEL_ESTRIBO, escalas: ESCALAS, enLaCasilla: true },
  { holgura: 0, escalas: [...ESCALAS, 0.8, 0.75, 0.7], enLaCasilla: true },
  { holgura: HOLGURA_DEL_ESTRIBO, escalas: ESCALAS, enLaCasilla: false },
];

/**
 * Dónde se asienta el puente de un cruce quebrado (las orillas no se miran):
 * el eje, el centro y la escala con los que los dos estribos caen en tierra,
 * uno en cada orilla (`regiones`), y el medio del tablero, como se ve, en la
 * casilla del nodo (con las rebajas de `EXIGENCIAS`). De los que valen, el que
 * menos se aparta del eje de las orillas (`vector`), del punto `medio` y de la
 * escala 1. Null si ninguno vale: queda el punto medio y el eje más cercano,
 * con un estribo en el agua.
 *
 * **Es para lo que el generador no controla**, como la rama `eje === null` de
 * `puenteDe` que lo llama: un puente recto entre orillas que no se miran solo
 * se asienta corriéndolo y estirándolo. Desde #161 el vestido abre cada nodo por
 * un eje y en el procedimental ya casi no hay quebrados (1 de 89 puentes en las
 * semillas 1-40, de una red fina sin vecinas opuestas); quedan los planes del
 * agente, que ponen el nodo donde quieren. La escala 0,7-1,15 se queda: esos
 * planes no tienen cota. Antes de #161, con el punto medio a secas, 15 de los
 * 35 quebrados de 1-40 dejaban un estribo en el río.
 */
export function asentar(
  nodo: Punto,
  medio: Punto,
  vector: Punto,
  regiones: readonly [number, number],
  a: Pick<Analisis, 'W' | 'H' | 'fuente' | 'region'>,
  medidas: (eje: EjeDePuente) => Pick<MedidasDePuente, 'largo' | 'altura'>,
): { coste: number; eje: EjeDePuente; centro: Punto; escala: number } | null {
  const nv = Math.hypot(vector[0], vector[1]);
  const [ra, rb] = regiones;
  const pasos = Math.round(CORRIMIENTO * 10);
  const buscar = ({ holgura, escalas, enLaCasilla }: Exigencia) => {
    /** La región en la que se asienta el estribo de `e` (que sale por `(ux, uy)`), o -1. */
    const estribo = ([ex, ey]: Punto, ux: number, uy: number): number => {
      const r = regionPisable(a, ex, ey);
      const alrededor: Punto[] = [
        [ex + ux * holgura, ey + uy * holgura],
        [ex - uy * holgura, ey + ux * holgura],
        [ex + uy * holgura, ey - ux * holgura],
      ];
      return r >= 0 && alrededor.every(([px, py]) => regionPisable(a, px, py) === r) ? r : -1;
    };
    let mejor: { coste: number; eje: EjeDePuente; centro: Punto; escala: number } | null = null;
    for (const eje of EJES) {
      const [ux, uy] = UNITARIO_DEL_EJE[eje];
      const { largo: largoDelEje, altura } = medidas(eje);
      // Lo que se aparta del eje de las orillas: 0 si va por él, 1 si lo cruza en ángulo recto.
      const giro = 1 - Math.abs(ux * vector[0] + uy * vector[1]) / nv;
      for (const escala of escalas)
        for (let i = -pasos; i <= pasos; i++)
          for (let j = -pasos; j <= pasos; j++) {
            const centro: Punto = [medio[0] + i / 10, medio[1] + j / 10];
            const coste = 4 * giro + (i * i + j * j) / 100 + 2 * (escala - 1) * (escala - 1);
            if (mejor !== null && coste >= mejor.coste) continue;
            // El medio del tablero, como se ve —alzado su altura—, en la casilla
            // del nodo: es la que se pulsa y donde se pinta quien lo pisa. Sin
            // esto, 26 de 101 lo dejaban en otra, casi siempre agua (QA de #157).
            if (
              enLaCasilla &&
              (!dentroDeLaCasilla(centro[0], nodo[0]) ||
                !dentroDeLaCasilla(centro[1] - altura * escala, nodo[1]))
            )
              continue;
            // Y si no, que la línea del tablero, en el suelo, pase por la casilla.
            const [wx, wy] = [nodo[0] - centro[0], nodo[1] - centro[1]];
            if (Math.abs(wx * uy - wy * ux) > CRUZA_EL_NODO) continue;
            if (Math.abs(wx * ux + wy * uy) > (largoDelEje * escala) / 2) continue;
            const [e0, e1] = extremosDe(centro, eje, largoDelEje * escala);
            const r0 = estribo(e0, -ux, -uy);
            const r1 = estribo(e1, ux, uy);
            if (!((r0 === ra && r1 === rb) || (r0 === rb && r1 === ra))) continue;
            mejor = { coste, eje, centro, escala };
          }
    }
    return mejor;
  };
  for (const exigencia of EXIGENCIAS) {
    const mejor = buscar(exigencia);
    if (mejor !== null) return mejor;
  }
  return null;
}

/** Cuántas casillas se sigue por una senda buscando dónde reengancharla al estribo. */
const PASOS_HASTA_EL_ESTRIBO = 4;

/**
 * Los tramos con la senda cortada en los estribos: lo que llegaba al nodo de un
 * puente llega ahora a uno de sus `extremos`, y nada cruza el agua por encima
 * del tablero.
 *
 * Cada tramo `(nodo, P)` pasa a `(extremo, P)`, con el extremo más cercano a
 * `P` (y, si las dos sendas de un nodo eligen el mismo, el reparto que menos
 * anda). Si `P` queda bajo el puente —más cerca del centro, por el eje, que su
 * extremo— y la senda sigue por él sin cruce, se salta también: si no, la senda
 * llegaba a `P` y volvía hacia atrás hasta el estribo, en un gancho.
 *
 * `tramos` en casillas, por el centro de cada una (`x + 0,5`), como los pinta
 * `componer`, y como `Puente.nodo`.
 */
export function tramosHastaLosEstribos(
  tramos: readonly Tramo[],
  puentes: readonly Pick<Puente, 'nodo' | 'centro' | 'extremos'>[],
): Tramo[] {
  const { puntos, vecinos, numero, arista } = grafoDeTramos(tramos);
  const punto = (k: number) => puntos[k] as Punto;
  const deUnNodo = new Set(puentes.flatMap((pu) => numero(...pu.nodo) ?? []));
  const quitadas = new Set<number>();
  const nuevas: Tramo[] = [];
  const dist = (p: Punto, q: Punto) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  for (const pu of puentes) {
    const n = numero(...pu.nodo);
    if (n === undefined) continue;
    const salidas = vecinos[n] as readonly number[];
    const [e0, e1] = pu.extremos;
    let destinos = salidas.map((k) => (dist(punto(k), e0) <= dist(punto(k), e1) ? e0 : e1));
    if (salidas.length === 2 && destinos[0] === destinos[1]) {
      const [p, q] = salidas.map(punto) as [Punto, Punto];
      destinos = dist(p, e0) + dist(q, e1) <= dist(p, e1) + dist(q, e0) ? [e0, e1] : [e1, e0];
    }
    for (const [j, p] of salidas.entries()) {
      const e = destinos[j] as Punto;
      const largo = dist(e, pu.centro);
      const ux = (e[0] - pu.centro[0]) / largo;
      const uy = (e[1] - pu.centro[1]) / largo;
      /** Si `q` cae bajo el puente: por el eje, más cerca del centro que el extremo. */
      const bajo = ([qx, qy]: Punto) =>
        (qx - pu.centro[0]) * ux + (qy - pu.centro[1]) * uy < largo - 1e-6;
      let antes = n;
      let ahora = p;
      quitadas.add(arista(antes, ahora));
      for (let paso = 0; paso < PASOS_HASTA_EL_ESTRIBO; paso++) {
        const sigue = vecinos[ahora] as readonly number[];
        if (!bajo(punto(ahora)) || sigue.length !== 2) break;
        const siguiente = sigue.find((v) => v !== antes);
        if (siguiente === undefined || deUnNodo.has(siguiente)) break;
        quitadas.add(arista(ahora, siguiente));
        antes = ahora;
        ahora = siguiente;
      }
      const [ax, ay] = punto(ahora);
      nuevas.push([e[0], e[1], ax, ay]);
    }
  }
  return [
    ...tramos.filter(
      ([x0, y0, x1, y1]) =>
        !quitadas.has(arista(numero(x0, y0) as number, numero(x1, y1) as number)),
    ),
    ...nuevas,
  ];
}

/**
 * Hasta dónde se mira una senda desde el estribo buscando agua, en casillas de
 * su largo: la que sale de un estribo pasa la orilla en las dos primeras (lo
 * más lejos, 1,8 en las semillas 1-40).
 */
const LARGO_DEL_VADO = 3;
/** Lo que sigue el vado por la senda pasada la última agua, en casillas: que la orilla no corte en seco. */
const COLA_DEL_VADO = 0.4;

/**
 * Los vados: los trozos de senda que salen de un estribo y pasan por agua en
 * sus primeras `LARGO_DEL_VADO` casillas, desde el estribo hasta pasada la
 * última agua. Ahí el agua no se pinta (`pintarSuelo`), y la senda llega al
 * puente por una lengua de tierra.
 *
 * El camino del núcleo cruza a menudo en diagonal entre dos casillas de tierra
 * que solo se tocan por la esquina, con agua en las otras dos; o el estribo
 * cae en una orilla de una casilla con agua alrededor. El agua se pinta después
 * de la senda y la tapaba: entre el estribo y la orilla se veía un trozo de río
 * y la senda asomaba por debajo (H4 del QA de #157: 36 de 94 sendas de estribo
 * en las semillas 1-40). Solo junto a los estribos: lejos de un puente, una
 * senda que roza una esquina de agua ya era así y lo seguiría siendo.
 *
 * `esAgua(x, y)` dice si la casilla entera `(x, y)` es agua en la escena.
 */
export function vadosDeLosEstribos(
  sendas: readonly Senda[],
  puentes: readonly Pick<Puente, 'extremos'>[],
  esAgua: (x: number, y: number) => boolean,
): Senda[] {
  const estribos = puentes.flatMap((p) => p.extremos);
  const enUnEstribo = ([x, y]: Punto) =>
    estribos.some(([ex, ey]) => Math.abs(ex - x) < 1e-6 && Math.abs(ey - y) < 1e-6);
  const vados: Senda[] = [];
  for (const senda of sendas) {
    const desde: Senda[] = [];
    if (senda.length > 1 && enUnEstribo(senda[0] as Punto)) desde.push(senda);
    if (senda.length > 1 && enUnEstribo(senda[senda.length - 1] as Punto))
      desde.push([...senda].reverse());
    for (const camino of desde) {
      let largo = 0;
      let ultimaAgua = -1;
      let hasta = 0;
      for (const [k, p] of camino.entries()) {
        if (k > 0) {
          const q = camino[k - 1] as Punto;
          largo += Math.hypot(p[0] - q[0], p[1] - q[1]);
        }
        if (largo > LARGO_DEL_VADO + COLA_DEL_VADO) break;
        if (largo <= LARGO_DEL_VADO && esAgua(Math.floor(p[0]), Math.floor(p[1])))
          ultimaAgua = largo;
        if (ultimaAgua >= 0 && largo <= ultimaAgua + COLA_DEL_VADO) hasta = k;
      }
      if (ultimaAgua >= 0) vados.push(camino.slice(0, hasta + 1));
    }
  }
  return vados;
}

/**
 * Las sendas de estribo que pasan por agua pintada: algún punto de sus primeras
 * `LARGO_DEL_VADO` casillas cae en una casilla de agua y a más de medio
 * `ANCHO_DEL_VADO` de todo vado. Lo cuenta el informe (`sendasDeEstriboEnAgua`)
 * y tiene que ser 0. Recorre las sendas por su cuenta, sin `vadosDeLosEstribos`:
 * mide la geometría de lo que se deja sin agua, no repite el corte.
 */
export function sendasDeEstriboEnAgua(
  sendas: readonly Senda[],
  puentes: readonly Pick<Puente, 'extremos'>[],
  vados: readonly Senda[],
  esAgua: (x: number, y: number) => boolean,
): Senda[] {
  const estribos = puentes.flatMap((p) => p.extremos);
  const cerca = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const secoEn = (p: Punto) =>
    vados.some((v) =>
      v.some((q, k) => {
        const r = v[k + 1];
        if (r === undefined) return false;
        const [vx, vy] = [r[0] - q[0], r[1] - q[1]];
        const l2 = vx * vx + vy * vy;
        const t =
          l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - q[0]) * vx + (p[1] - q[1]) * vy) / l2));
        return Math.hypot(p[0] - q[0] - t * vx, p[1] - q[1] - t * vy) < ANCHO_DEL_VADO / 2 - 0.05;
      }),
    );
  return sendas.filter((senda) =>
    [senda, [...senda].reverse()].some((camino) => {
      const inicio = camino[0];
      if (inicio === undefined || !estribos.some((e) => cerca(e, inicio))) return false;
      let largo = 0;
      return camino.some((p, k) => {
        const q = camino[k - 1];
        if (q !== undefined) largo += Math.hypot(p[0] - q[0], p[1] - q[1]);
        return largo <= LARGO_DEL_VADO && esAgua(Math.floor(p[0]), Math.floor(p[1])) && !secoEn(p);
      });
    }),
  );
}
