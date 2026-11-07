/**
 * Lo que se aparta de las sendas y de las murallas: las formas que lee el índice de
 * obstáculos (`pasillo.ts`) —la senda, los tableros de los puentes, las paredes
 * del desnivel— y las reservas de un objeto, del puesto de un nodo y del recinto
 * de una ciudad; lo que mira la línea de cada muralla alrededor de su franja
 * (`alrededorDeMurallas`); y las piezas de la muralla del recinto (sus módulos y
 * sus sprites, que coloca `recintoDe`). Con los guardias de lo que pisa la senda
 * (`sobreLaSenda`) y de los testeros de las tiradas de norte a sur
 * (`testerosDeLaEscena`).
 */
import { cruzaSuBarrera } from '@core/map/map.js';
import { esBarrera, type TerrainKind } from '@core/map/terrain.js';
import type { MapObject } from '@core/map/tipos.js';
import type { Analisis } from '../analizar.js';
import { esPiezaDelRelieve } from '../bordes.js';
import { altoDeLaSilueta, type PerfilDe } from '../caras.js';
import type { Catalogo, Pieza } from '../catalogo.js';
import { type Celda, claveDeCelda, esVisto } from '../celdas.js';
import type { Paso } from '../esqueleto.js';
import { type Alrededor, CIUDAD } from '../muralla.js';
import {
  type ConImagen,
  cajaDeSprite,
  type Forma,
  type Medida,
  Obstaculos,
  pasilloDe,
  seTocan,
} from '../pasillo.js';
import { claveDe, esVolumen, ordenDeVolumenes, type PreguntaDeVolumen } from '../pintar.js';
import type { Puente } from '../puentes.js';
import { type DondeNoVaUnPuesto, esObra, HOLGURA_DEL_PUESTO } from '../puestos.js';
import {
  ALTO_DE_LA_PUERTA_DEL_RECINTO,
  ALTO_DE_TORRE_DEL_RECINTO,
  ALTO_DEL_MURO_DEL_RECINTO,
  ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO,
  CARA_DEL_RECINTO,
  casillasDelRecinto,
  contornoDelRecinto,
  enElRecinto,
  HOJA_DEL_RECINTO,
  MODULOS_DEL_RECINTO,
  type ModuloDeLaHojaDelRecinto,
  type ModuloDelRecinto,
  type ModulosDelRecinto,
  type Par,
  type PiezaDelRecinto,
  PROPORCION_DE_TORRE,
  PX_POR_CASILLA_DEL_PUEBLO,
  RADIO_DE_TORRE,
  type Rect,
  type Sitio,
} from '../recinto.js';
import { SEMIANCHO_DE_LA_HUELLA, type Senda } from '../sendas.js';
import { type ModuloDeTirada, testerosAMediaTirada } from '../tirada.js';
import { SEMIANCHO_DEL_PASO } from './pasos-y-puentes.js';
import { puntosDeCelda } from './relieve.js';
import type { Sprite } from './sprite.js';
import {
  APARTE,
  HOJA_DE_CASAS,
  MARCADOR,
  RADIO_DE_OBJETO,
  SEMIANCHO_DE_PARED,
  TRAMOS_NORTE_SUR,
} from './tablas.js';

/** Lo que el índice de obstáculos mira de un sprite: dónde cae su imagen y de qué clase es. */
export type Medible = ConImagen & Pick<Sprite, 'clase' | 'clave' | 'cumbre' | 'plano'>;

/** La medida con la que se aparta cada clase de lo que no tapa: su media anchura, por el rectángulo. */
const MEDIDA_DE_CLASE: Readonly<Record<Sprite['clase'], Medida | null>> = Object.fromEntries(
  Object.entries(APARTE).map(([c, r]) => [
    c,
    r === null ? null : { radio: r.semiancho, soloElPie: false },
  ]),
) as Record<Sprite['clase'], Medida | null>;

/** La media anchura más grande de lo que se aparta. */
const SEMIANCHO_MAXIMO = Math.max(...Object.values(APARTE).map((r) => r?.semiancho ?? 0));

/** Unas sendas como obstáculo: lo que se aparta del camino no pisa su pasillo, cada clase con su media anchura. */
export function formaDeLaSenda(trazos: readonly Senda[]): Forma<Medible> {
  return { trazos, alcance: SEMIANCHO_MAXIMO, mide: (s) => MEDIDA_DE_CLASE[s.clase] };
}

/**
 * Lo que la línea de cada muralla mira alrededor de su franja (#197): dónde se
 * apoya (otra barrera o su nodo, el borde o la huella de una ciudad o un pueblo) y el lado de cada casilla pisable. El lado es la
 * componente de lo que se pisa sin los nodos, en 8-vecinas: lo que el núcleo
 * llama región, derivado del terreno porque el escenógrafo no lee las regiones
 * declaradas (`MapaDeEscena`).
 */
export function alrededorDeMurallas(
  a: Pick<Analisis, 'W' | 'H' | 'terreno' | 'objetos' | 'franjaDe' | 'red'>,
  huellas: readonly (readonly (readonly [number, number])[])[],
  nivel: ArrayLike<number>,
): Alrededor {
  const { W, H } = a;
  const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // Los nodos de la red: el paso, la ciudad y el pueblo del muro. La ciudad de
  // dentro de una región es de su región, y su lado, el de ella.
  const nodo = new Uint8Array(W * H);
  for (const n of a.red.nodos) nodo[n.at.y * W + n.at.x] = 1;
  /**
   * Los nodos de otra barrera, por su casilla: son la puerta de esa barrera y la
   * muralla que llega a uno acaba en ella. El nodo de acantilado de s699 (15,2)
   * une los dos lados de una franja de muro de 2×2 contra el borde; sin apoyo
   * allí, la línea se quedaba en el borde y los dos lados se juntaban por debajo.
   */
  const nodoDeOtra = new Map<number, string>();
  for (const o of a.objetos)
    if (cruzaSuBarrera(o) && o.barrera !== 'wall') nodoDeOtra.set(o.at.y * W + o.at.x, o.id);
  /** Bajo qué huellas cae cada casilla: las de una ciudad y un pueblo cercanos se pisan (s64 (5,9)). */
  const enHuella = new Map<number, string[]>();
  huellas.forEach((h, k) => {
    for (const [x, y] of h)
      enHuella.set(y * W + x, [...(enHuella.get(y * W + x) ?? []), `${CIUDAD}${k}`]);
  });
  const lado = new Int32Array(W * H).fill(-1);
  const pisa = (i: number) => !nodo[i] && !esBarrera(a.terreno[i] as TerrainKind);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (lado[i] !== -1 || !pisa(i)) continue;
    lado[i] = n;
    const pila = [i];
    while (pila.length > 0) {
      const j = pila.pop() as number;
      const x = j % W;
      const y = Math.floor(j / W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = (y + dy) * W + x + dx;
          if (!dentro(x + dx, y + dy) || lado[k] !== -1 || !pisa(k)) continue;
          lado[k] = n;
          pila.push(k);
        }
    }
    n++;
  }
  return {
    apoyos: (x, y) => {
      const cosas = new Set<string>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!dentro(nx, ny)) {
            cosas.add('borde');
            continue;
          }
          const i = ny * W + nx;
          const t = a.terreno[i] as TerrainKind;
          if (t !== 'wall' && esBarrera(t)) cosas.add(`franja:${a.franjaDe[i]}`);
          const n = nodoDeOtra.get(i);
          if (n !== undefined) cosas.add(`nodo:${n}`);
          for (const c of enHuella.get(i) ?? []) cosas.add(c);
        }
      return [...cosas];
    },
    lado: (x, y) => (dentro(x, y) ? (lado[y * W + x] as number) : -1),
    bajoCiudad: (x, y) => (dentro(x, y) ? (enHuella.get(y * W + x) ?? []) : []),
    nivel: (x, y) => (dentro(x, y) ? (nivel[y * W + x] as number) : 0),
  };
}

/**
 * La senda pintada, sin arcén, como obstáculo de la muralla (#193): el muro
 * puede llegar hasta ella, porque es la barrera que el camino cruza por su
 * puerta, pero no taparla. Solo mira la clase `muro`.
 */
export function sendaParaLaMuralla(trazos: readonly Senda[]): Obstaculos<Medible> {
  const medida: Medida = { radio: SEMIANCHO_DE_LA_HUELLA, soloElPie: false };
  return new Obstaculos<Medible>([
    { trazos, alcance: medida.radio, mide: (s) => (s.clase === 'muro' ? medida : null) },
  ]);
}

/**
 * Los sprites de una clase que se aparta del camino cuyo rectángulo pisa su
 * pasillo, y las obras de los puestos (`esObra`) cuya caja pisa la huella de la
 * senda: el puesto no se aparta, se le busca sitio (`sitiosDeLosPuestos`), y
 * esto lo mira desde lo puesto. Lo cuenta el informe y lo recuenta el test por
 * su cuenta.
 */
export function sobreLaSenda(sprites: readonly Sprite[], trazos: readonly Senda[]): Sprite[] {
  const senda = new Obstaculos([formaDeLaSenda(trazos)]);
  const huella = pasilloDe<Sprite>(trazos, SEMIANCHO_DE_LA_HUELLA);
  return sprites.filter((s) => s.capa === 0 && (esObra(s) ? huella.pisa(s) : senda.pisa(s)));
}

/** El color del marcador de una casa de un recinto, sin la hoja `casas`. */
const COLOR_DE_CASA = '#9a6a4a';

const MEDIDA_DE_PARED: Medida = { radio: SEMIANCHO_DE_PARED, soloElPie: false };

/**
 * El tablero de cada puente como obstáculo: lo que se aparta del camino y la
 * pared no lo tapan. Solo lo mira lo que se pintaría después del puente, y por
 * tanto encima: un volumen (`esVolumen`, con el alto que se pregunta) que va
 * detrás de él en el orden del pintor (`ordenDeVolumenes`), los de `separar`.
 * Lo plano va al suelo, debajo del puente; lo de detrás lo tapa el puente a él.
 * Es la única regla de profundidad de los puentes: la de esta puerta y la de
 * `laderasMalCubiertas`.
 *
 * Apartando también lo de detrás, la cara de una isleta o de la orilla de al
 * lado se quedaba sin pared y se leía como un rectángulo de roca lisa.
 */
export function formasDeLosTableros(
  puentes: readonly Pick<Puente, 'tablero' | 'centro'>[],
): Forma<Medible>[] {
  return puentes.map(({ centro: [x, y], tablero }) => ({
    trazos: [tablero],
    alcance: Math.max(SEMIANCHO_MAXIMO, SEMIANCHO_DE_PARED),
    mide: (s, alto) =>
      vaDelante(conAlto(s, alto), { x, y })
        ? s.clase === 'pared'
          ? MEDIDA_DE_PARED
          : MEDIDA_DE_CLASE[s.clase]
        : null,
  }));
}

/**
 * Lo que una masa se aparta de la silueta de una pared que taparía, en
 * casillas: algo más que la mitad del hueco entre dos columnas del perfil (32
 * por módulo, ~0,06 en una frontal de 2), para que no se cuele entre ellas.
 */
export const MARGEN_DE_LA_PARED = 0.05;

const MEDIDA_DE_LA_PARED: Medida = { radio: MARGEN_DE_LA_PARED, soloElPie: false };

/**
 * Las paredes del desnivel (`esPiezaDelRelieve`) como obstáculo de la masa
 * (#216): un pico o un árbol que se pintaría después de una pared (`vaDelante`,
 * la regla de los tableros) no cubre su silueta; se encoge o no va. Lo de
 * detrás no se mira: la pared lo tapa a él, y es lo que dice que la cordillera
 * está en lo alto. Antes la cordillera plantaba picos delante de su propia
 * pared, del lado bajo y en las filas de más al sur, y la pared asomaba a trozos
 * (692 de 2 150 piezas tapadas en 1-40; bajo una montaña, 447 de 837).
 *
 * Cada pared es una columna por franja de su perfil, de lo alto de su silueta
 * al pie de su caja: la misma silueta que mide `paredesTapadasPorLaMasa`.
 */
export function formasDeLasParedes(
  sprites: readonly Sprite[],
  perfilDe: PerfilDe,
): Forma<Medible>[] {
  return sprites.filter(esPiezaDelRelieve).map((p) => {
    const caja = cajaDeSprite(p);
    const perfil = perfilDe(p);
    const n = perfil?.length ?? 1;
    const columnas: Senda[] = [];
    // El medio de cada franja, y los dos bordes de la caja.
    for (const k of [0, ...Array.from({ length: n }, (_, k) => k + 0.5), n]) {
      const x = caja[0] + ((caja[2] - caja[0]) * k) / n;
      const arriba = altoDeLaSilueta(p, perfil, x, caja) ?? caja[1];
      columnas.push([
        [x, arriba],
        [x, caja[3]],
      ]);
    }
    return {
      trazos: columnas,
      alcance: MARGEN_DE_LA_PARED,
      mide: (s, alto) =>
        s.clase === 'masa' && vaDelante(conAlto(s, alto), p) ? MEDIDA_DE_LA_PARED : null,
    };
  });
}

/** Una pieza de una tirada de muralla de norte a sur (`tiradaDelMapa`) y el paso de la tirada al que va. */
export interface PiezaDeTirada {
  readonly tramo: Sprite;
  readonly paso: number;
}

/** Las piezas de los pasos de la línea de una franja de muro (`piezasDeLaLinea`). */
export interface PiezasDeLaLinea {
  /** El tramo suelto de cada paso. */
  readonly sueltos: ReadonlyMap<Paso, Sprite>;
  /** Las piezas de cada tirada de norte a sur (`tiradasDeLaFranja`), o `null` sin arte. */
  readonly tiradas: ReadonlyMap<readonly Paso[], readonly PiezaDeTirada[] | null>;
}

/** Lo que mira `vaDelante` de un sprite: dónde, su clave y si es un volumen. */
type Delante = Pick<Sprite, 'x' | 'y' | 'clave'> & PreguntaDeVolumen;

/** Si `s` se pinta después de lo que está en `t` y, por tanto, lo taparía. */
const vaDelante = (s: Delante, t: Pick<Sprite, 'x' | 'y' | 'clave'>) =>
  esVolumen(s) && ordenDeVolumenes(s, t) > 0;

/** `s` con el alto `alto`, como lo mide `vaDelante`: con su clave, si la lleva. */
const conAlto = (s: Medible, alto: number): Delante => ({
  x: s.x,
  y: s.y,
  ...(s.clave === undefined ? {} : { clave: s.clave }),
  plano: s.plano,
  clase: s.clase,
  alto,
});

/**
 * La reserva de un objeto: el disco de radio `radio` alrededor del centro de su
 * casilla, un trazo de un solo punto. Lo que se aparta no apoya el pie en él y,
 * si es un volumen que se pinta después del objeto (`vaDelante`, la regla de
 * los tableros), tampoco lo cubre con su rectángulo: un árbol al sur de una
 * mina crecía hasta taparle la puerta (#151). Antes, el arbolillo se sondeaba a
 * 0,45 y 0,8 por encima del pie; las masas y las rocas, nada.
 *
 * La pared y la muralla no se apartan: miran la reserva por sus puntos (`en`).
 */
export function reservaDe(
  o: Pick<MapObject, 'at'>,
  radio: number,
  objeto: Pick<Sprite, 'x' | 'y'>,
): Forma<Medible> {
  const pie: Medida = { radio, soloElPie: true };
  const caja: Medida = { radio, soloElPie: false };
  return {
    trazos: [[[o.at.x + 0.5, o.at.y + 0.5]]],
    alcance: radio,
    mide: (s, alto) =>
      APARTE[s.clase] === null ? null : vaDelante(conAlto(s, alto), objeto) ? caja : pie,
  };
}

/**
 * Lo que el puesto de un nodo aparta de la senda y del tablero de un puente, más
 * allá de la huella, en casillas (`dondeNoVaUnPuesto`).
 */
const MARGEN_DEL_PUESTO = 0.05;

/**
 * Dónde no va el puesto de un nodo (`sitiosDeLosPuestos`), de lo que ya está en la
 * escena: no pisa la huella de la senda, de la rampa de una bajada ni del tablero
 * de un puente (`MARGEN_DEL_PUESTO` más allá) ni el eje de un paso
 * (`SEMIANCHO_DEL_PASO`), en un solo índice; apoya en tierra que no es muro, ni
 * recinto ni fuera del mapa; y no toca nada de lo `ocupado` (objetos, sus
 * reservas, paredes, puentes, piezas de bajada y la muralla por venir) que no sea
 * de su nodo (su hito, que no se pinta con él) y que se pinte después de él, si es
 * una pared, un muro o un puente, o en cualquier orden, si no. El de la orilla de un
 * puente se pinta por su pie, como todo, y no toca la pieza del puente si va
 * antes que ella: subirle la clave tras el puente lo pintaba encima de lo que
 * tenía delante.
 */
export function dondeNoVaUnPuesto(e: {
  readonly W: number;
  readonly H: number;
  readonly terreno: readonly TerrainKind[];
  readonly bajoUnRecinto: Uint8Array;
  readonly sendas: readonly Senda[];
  readonly ejes: readonly Senda[];
  readonly ocupado: readonly Sprite[];
}): DondeNoVaUnPuesto {
  const huella: Medida = { radio: SEMIANCHO_DE_LA_HUELLA + MARGEN_DEL_PUESTO, soloElPie: false };
  const paso: Medida = { radio: SEMIANCHO_DEL_PASO, soloElPie: false };
  const noSePisa = new Obstaculos<Sprite>([
    { trazos: e.sendas, alcance: huella.radio, mide: () => huella },
    { trazos: e.ejes, alcance: paso.radio, mide: () => paso },
  ]);
  const ocupado = e.ocupado.map((s) => ({
    nodo: s.deNodo?.id,
    caja: cajaDeSprite(s),
    // La pared, la muralla o el puente de su nodo que se pinta antes que el
    // puesto lo tapa él: va a su pie. Lo demás no se toca en ningún orden, el
    // puente de otro nodo tampoco (`puestosQueTapan`: s63, 42×42).
    puente: s.puente,
    clave:
      s.clase === 'pared' || s.clase === 'muro' || s.puente !== undefined
        ? claveDe(s)
        : Number.POSITIVE_INFINITY,
  }));
  return {
    pisa: (s) => noSePisa.pisa(s),
    apoya: (x, y) => {
      if (x < 0.1 || x > e.W - 0.1 || y < 0.1 || y > e.H - 0.05) return false;
      const i = Math.floor(y - 0.02) * e.W + Math.floor(x);
      return e.terreno[i] !== 'water' && e.terreno[i] !== 'wall' && e.bajoUnRecinto[i] !== 1;
    },
    choca: (s, id) => {
      const caja = cajaDeSprite(s);
      return ocupado.some(
        (o) =>
          o.nodo !== id &&
          (o.clave > s.y || (o.puente !== undefined && o.puente !== id)) &&
          seTocan(caja, o.caja, HOLGURA_DEL_PUESTO),
      );
    },
  };
}

/**
 * La reserva del puesto de un nodo (fase 4), como la de un objeto (`reservaDe`) o
 * la de un recinto (`reservaDelRecinto`), con lo que ocupará (`envolturaDelPuesto`):
 * dos trazos de lado a lado de su planta, uno por su pie y otro por el medio de su
 * `fondo`, que la cubren. Lo que se aparta no apoya el pie en ella y, si se pinta
 * después del puesto, tampoco la cubre con su rectángulo: lo de delante que
 * taparía la obra sube desde su pie y cruza el de ella. Sin ella, un árbol al sur
 * del puesto crecía hasta taparlo, como el de la mina de #151. La pared y la
 * muralla la miran por sus puntos (`reservaEn`).
 */
export function reservaDelPuesto(envoltura: Sprite, fondo: number): Forma<Medible> {
  const [x0, , x1] = cajaDeSprite(envoltura);
  const r = fondo / 2;
  const pie: Medida = { radio: r, soloElPie: true };
  const caja: Medida = { radio: r, soloElPie: false };
  const deLadoALado = (y: number): Senda => [
    [x0 + r, y],
    [x1 - r, y],
  ];
  return {
    trazos: [deLadoALado(envoltura.y), deLadoALado(envoltura.y - r)],
    alcance: r,
    mide: (s, alto) =>
      APARTE[s.clase] === null ? null : vaDelante(conAlto(s, alto), envoltura) ? caja : pie,
  };
}

/**
 * Lo que la reserva de un recinto pasa de sus casillas: un trazo por fila, del
 * centro de su primera casilla al de la última, con este radio, cubre sus
 * esquinas y un cuarto de casilla alrededor.
 */
export const RADIO_DEL_RECINTO = 0.75;

/**
 * Lo que el recinto pinta por los lados de su rectángulo: media torre, la de
 * sus vértices del este y del oeste.
 */
const MARGEN_DE_LA_ENVOLTURA = (ALTO_DE_TORRE_DEL_RECINTO * PROPORCION_DE_TORRE) / 2;

/**
 * Lo que pintará un recinto, como un sprite sin imagen: su caja, de media torre
 * por los lados a lo alto de las torres del norte, y la clave de su muro sur,
 * lo último que se pinta de él. Es quien ocupa su reserva (`reservaEn`): lo
 * que se mide contra él (la pared que pasa por detrás, el tramo de muralla que
 * se ordena antes) lo mide contra esto. No entra en la escena.
 */
export function envolturaDelRecinto(id: string, r: Rect): Sprite {
  const ancho = r.i1 + 1 - r.i0 + 2 * MARGEN_DE_LA_ENVOLTURA;
  const [, y] = contornoDelRecinto(r).vertices[4] as Par;
  return {
    src: null,
    nw: 1,
    nh: 1,
    ax: 0.5,
    ay: 1,
    x: (r.i0 + r.i1 + 1) / 2,
    y,
    alto: y - r.j0 + ALTO_DE_TORRE_DEL_RECINTO,
    ancho,
    clase: 'objeto',
    color: MARCADOR.wall as string,
    capa: 0,
    sombra: false,
    objeto: { id, kind: 'town' },
  };
}

/**
 * Lo que pinta un recinto hasta lo más bajo de sus torres: su envoltura
 * (`envolturaDelRecinto`) acaba en su muro sur, y cada torre tiene el pie
 * `RADIO_DE_TORRE` bajo su vértice (`recintoDe`) y su imagen baja aún lo que
 * pinte bajo el ancla. Lo mira el puesto de un nodo, que se pone antes que las
 * piezas del recinto y no las tapa (`puestosQueTapan`): con la envoltura sola, la
 * torre del puesto al pie de una ciudad se montaba sobre el pie de una torre del
 * sur (QA de la fase 4, H-F4-2, s45 (14,8)). La envoltura no se toca: es la que
 * mide lo demás contra el recinto.
 */
export function hastaElPieDeSusTorres(envoltura: Sprite, torres: readonly ModuloConSrc[]): Sprite {
  const bajo =
    RADIO_DE_TORRE +
    Math.max(0, ...torres.map((t) => ((t.nh - t.ay) / t.nh) * ALTO_DE_TORRE_DEL_RECINTO));
  return { ...envoltura, y: envoltura.y + bajo, alto: envoltura.alto + bajo };
}

/**
 * La reserva de un recinto (`reservaDe` con su rectángulo): un trazo por fila
 * de casillas, de `RADIO_DEL_RECINTO`. Lo que se aparta no apoya el pie en ella
 * y, si se pinta después del recinto, tampoco la cubre con su rectángulo.
 */
export function reservaDelRecinto(r: Rect, envoltura: Pick<Sprite, 'x' | 'y'>): Forma<Medible> {
  const pie: Medida = { radio: RADIO_DEL_RECINTO, soloElPie: true };
  const caja: Medida = { radio: RADIO_DEL_RECINTO, soloElPie: false };
  const trazos: Senda[] = [];
  for (let y = r.j0; y <= r.j1; y++)
    trazos.push([
      [r.i0 + 0.5, y + 0.5],
      [r.i1 + 0.5, y + 0.5],
    ]);
  return {
    trazos,
    alcance: RADIO_DEL_RECINTO,
    mide: (s, alto) =>
      APARTE[s.clase] === null ? null : vaDelante(conAlto(s, alto), envoltura) ? caja : pie,
  };
}

/** Lo que se mira alrededor de un recinto en `celdasBajoLosRecintos`, en casillas desde el vértice de la celda. */
const CERCA_DEL_RECINTO = 4;

/**
 * Las paredes del relieve que tienen algún punto (`puntosDeCelda`: sus filos,
 * sus pies y lo de en medio) en un recinto, con su borde, como `claveDeCelda`:
 * no llevan pieza. Lo de dentro es la plaza de la ciudad (criterio 8b): la cara
 * de un acantilado que cruzaba el recinto (un tercio de las ciudades tiene otro
 * nivel en su 3 × 3) se leía como una grieta entre las casas.
 */
export function celdasBajoLosRecintos(cs: readonly Celda[], rects: readonly Rect[]): Set<string> {
  const fuera = new Set<string>();
  if (rects.length === 0) return fuera;
  for (const c of cs) {
    if (!esVisto(c.tipo)) continue;
    // Solo las de cerca de algún recinto: sus puntos caen a una casilla y pico
    // de su vértice (la caída de 3 cuelga más; cerca es de sobra).
    const cerca = rects.filter(
      (r) =>
        c.vx >= r.i0 - CERCA_DEL_RECINTO &&
        c.vx <= r.i1 + 1 + CERCA_DEL_RECINTO &&
        c.vy >= r.j0 - CERCA_DEL_RECINTO &&
        c.vy <= r.j1 + 1 + CERCA_DEL_RECINTO,
    );
    if (cerca.length === 0) continue;
    if (puntosDeCelda(c).some(([x, y]) => cerca.some((r) => enElRecinto(r, x, y))))
      fuera.add(claveDeCelda(c));
  }
  return fuera;
}

/** Lo alto con que se mide el pie de una casa contra la calle: su base, de su ancho. */
export const ALTO_DEL_PIE_DE_CASA = 0.05;

/**
 * Las torres de la hoja `muro`: una de las dos por casilla en la muralla del mapa
 * (`torreEn`) y por ciudad en su recinto.
 */
export const TORRES_DEL_MURO = ['torre-redonda', 'torre-cuadrada'] as const;

/** Un módulo del recinto con su imagen, o con `src: null` si no hay arte (el marcador). */
export type ModuloConSrc = ModuloDelRecinto & { readonly src: string | null };

/**
 * Lo ancho del tramo de norte a sur (`muro-ns-1`, 384 × 1 426 px) en veces su
 * alto: su marcador sin arte.
 */
const PROPORCION_DEL_TRAMO_NORTE_SUR = 0.27;

/**
 * Un módulo sin arte para el recinto, de `ancho × alto` casillas: la regla lo
 * mide como uno de verdad y `componer` pinta su marcador de ese tamaño.
 */
function sinArte(nombre: string, ancho: number, alto: number): ModuloConSrc {
  return {
    nombre,
    src: null,
    nw: ancho * PX_POR_CASILLA_DEL_PUEBLO,
    nh: alto * PX_POR_CASILLA_DEL_PUEBLO,
    ax: (ancho * PX_POR_CASILLA_DEL_PUEBLO) / 2,
    ay: alto * PX_POR_CASILLA_DEL_PUEBLO,
  };
}

/**
 * Un tramo de norte a sur (§29) con el paso de su tirada. Su ancla es la junta
 * de delante de su guía, en el eje del muro (`pnpm taller derivar-muros`), no
 * el medio de la imagen, que la tira de la cara del este corre a un lado. Lo
 * leen la muralla del mapa y el recinto.
 */
export function moduloNorteSur(p: Pieza): Pieza & ModuloDeTirada {
  if (p.tirada === undefined)
    throw new Error(
      `el tramo de norte a sur ${p.src} no trae el paso de su tirada: derívalo (pnpm taller derivar-muros)`,
    );
  return { src: p.src, nw: p.nw, nh: p.nh, ax: p.ax, ay: p.ay, tirada: p.tirada };
}

/**
 * El paso de la tirada del marcador de un tramo de norte a sur sin arte, en
 * veces su alto: recto hacia el fondo y a un tercio, para que su testero quede
 * dentro de la de delante como con el arte.
 */
const PASO_SIN_ARTE = 1 / 3;

/**
 * Los módulos del recinto de una ciudad, del catálogo: las torres y los tramos
 * de norte a sur de la muralla del mapa, las puertas y los tramos lisos (el
 * recto y los dos en diagonal) de la hoja `recinto` y las casas sueltas. Lo que falte va con su
 * marcador, a la medida de la pieza, y se apunta en `faltan`.
 */
export function modulosDelRecinto(
  catalogo: Catalogo,
  faltan: Set<string>,
): ModulosDelRecinto<ModuloConSrc> {
  const hoja = (h: string) => catalogo.hojas[h] ?? [];
  const deLaHoja = (h: string, nombre: string, ancho: number, alto: number): ModuloConSrc => {
    const m = hoja(h).find((k) => k.nombre === nombre);
    if (m !== undefined) return m;
    faltan.add(h);
    return sinArte(nombre, ancho, alto);
  };
  const altoDeTorre = ALTO_DE_TORRE_DEL_RECINTO;
  const delRecinto = Object.fromEntries(
    MODULOS_DEL_RECINTO.map((n) => {
      const m = deLaHoja(
        HOJA_DEL_RECINTO,
        n,
        CARA_DEL_RECINTO,
        n.startsWith('puerta-') ? ALTO_DE_LA_PUERTA_DEL_RECINTO : ALTO_DEL_MURO_DEL_RECINTO,
      );
      if (m.src !== null && m.junta === undefined)
        throw new Error(
          `el módulo «${n}» de «${HOJA_DEL_RECINTO}» no trae sus juntas: derívalas (pnpm taller derivar-recinto) y rehaz el catálogo (pnpm taller catalogo-escena)`,
        );
      return [n, m];
    }),
  ) as Record<ModuloDeLaHojaDelRecinto, ModuloConSrc>;
  const casas: ModuloConSrc[] = [...hoja(HOJA_DE_CASAS)];
  if (casas.length === 0) {
    faltan.add(HOJA_DE_CASAS);
    casas.push(sinArte('', 0.69, 0.72));
  }
  return {
    torres: TORRES_DEL_MURO.map((n) =>
      deLaHoja('muro', n, altoDeTorre * PROPORCION_DE_TORRE, altoDeTorre),
    ),
    norteSur: TRAMOS_NORTE_SUR.map((id): ModuloConSrc & ModuloDeTirada => {
      const p = catalogo.piezas[id];
      if (p !== undefined) return { nombre: id, ...moduloNorteSur(p) };
      faltan.add(id);
      const m = sinArte(
        id,
        ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO * PROPORCION_DEL_TRAMO_NORTE_SUR,
        ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO,
      );
      return { ...m, tirada: [0, -m.nh * PASO_SIN_ARTE] };
    }),
    delRecinto,
    casas,
  };
}

/**
 * El sprite de una pieza del recinto de la ciudad `objeto`, con su papel
 * (`Sprite.recinto`): sin arte, su marcador a su medida. Solo las torres llevan
 * sombra al pie: con unas veinte manchas, la plaza quedaba oscurecida entera.
 */
export function spriteDelRecinto(
  p: PiezaDelRecinto<ModuloConSrc>,
  objeto: NonNullable<Sprite['objeto']>,
): Sprite {
  return {
    ...(p.src === null
      ? { src: null, nw: 1, nh: 1, ax: 0.5, ay: 1, ancho: (p.alto * p.nw) / p.nh }
      : { src: p.src, nw: p.nw, nh: p.nh, ax: p.ax, ay: p.ay }),
    x: p.x,
    y: p.y,
    alto: p.alto,
    ...(p.clave === undefined ? {} : { clave: p.clave }),
    clase: 'objeto',
    color: p.que === 'casa' ? COLOR_DE_CASA : (MARCADOR.wall as string),
    capa: 0,
    sombra: p.que === 'torre',
    objeto,
    recinto: p.que,
  };
}

/**
 * Las casillas que tapa un objeto en `at` (su casilla): una ciudad, su recinto
 * (`rect`); un pueblo y un nodo, las de su reserva (`RADIO_DE_OBJETO`). Lo de
 * debajo lo tapa el propio objeto, y la muralla une lo que llega a ella.
 */
export function casillasDeLaHuella(
  o: Pick<MapObject, 'kind'>,
  at: Sitio,
  rect: Rect | undefined,
  W: number,
  H: number,
): Par[] {
  if (rect !== undefined) return casillasDelRecinto(rect);
  const r = o.kind === 'village' || o.kind === 'node' ? RADIO_DE_OBJETO[o.kind] : undefined;
  if (r === undefined) return [];
  const fuera: Par[] = [];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = at.x + dx;
      const y = at.y + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(dx, dy) < r) fuera.push([x, y]);
    }
  return fuera;
}

/**
 * Los tramos de norte a sur de la escena que enseñan su testero a media tirada
 * (`testerosAMediaTirada`): lo que tapa una junta son las torres de la hoja
 * `muro` (las del mapa y las del recinto) y las puertas de la muralla del mapa
 * (`nodo-puerta-*`: la de norte a sur y la de este a oeste que cruza).
 */
export function testerosDeLaEscena(sprites: readonly Sprite[], catalogo: Catalogo): string[] {
  const conClave = (s: Sprite) => ({ ...s, clave: claveDe(s) });
  return testerosAMediaTirada(
    sprites.filter((s) => /^muro-ns-\d+\.webp$/.test(s.src ?? '')).map(conClave),
    sprites
      .filter(
        (s) =>
          (TORRES_DEL_MURO as readonly string[]).some((t) => s.src === `modulos/muro/${t}.webp`) ||
          /^nodo-puerta-[a-z-]+\.webp$/.test(s.src ?? ''),
      )
      .map(conClave),
    (src) => catalogo.piezas[src.replace(/\.webp$/, '')]?.tirada,
  );
}
