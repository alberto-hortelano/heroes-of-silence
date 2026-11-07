/**
 * La ciudad amurallada (20-10-2026): la ciudad del mapa ya no es una maqueta de
 * otra escala (la hoja `ciudades`, 2,4 casillas con decenas de casas de una
 * décima), sino un recinto que se compone en la escena: un anillo de muralla
 * con las piezas modulares —torres, tramos y puertas— a `ESCALA_DEL_RECINTO`
 * de lo que miden en las murallas del mapa, y dentro, apiñadas y pegadas a la
 * muralla, las casas sueltas de la hoja `casas` a la escala del pueblo, que es
 * lo que se integraba (decisión del usuario, con la maqueta intermedia de
 * `docs/agents/2026-10-20-ciudad-amurallada/`).
 *
 * - El recinto es el 3 × 3 de la casilla de la ciudad, y es del núcleo
 *   (`recintoDeLaCiudad` y `centroDelRecinto`, `core/map/recinto.ts`, vuelta 3):
 *   el generador no pone nada dentro ni dos que se toquen, y la escena lo pinta
 *   donde él lo dejó libre. El de una ciudad-puente (#144), el de su orilla
 *   tierra adentro. Lo leen la huella, la reserva, las paredes que no se ponen,
 *   el suelo de la plaza, la superficie y los guardias.
 * - La muralla es un **octógono** (`contornoDelRecinto`, vuelta 2): ocho caras
 *   iguales con una torre en cada vértice, para que se entre por cualquiera de
 *   las ocho direcciones por una puerta apoyada en su cara. Con el cuadrado, la
 *   senda que llega en diagonal (el 75 %) abría de 1 a 1,6 casillas de muro
 *   (s15 (12,16)), y el usuario pidió puertas («cierralo con puertas»).
 * - Cada cara lleva su puerta o su tramo liso, siempre entre dos torres: una
 *   regla para las ocho. Qué caras llevan puerta lo dice el núcleo
 *   (`puertasDelNucleo` → `puertasDeLaCiudad`: donde llega un camino, y la del
 *   río de una ciudad-puente), y la escena no lo deduce de nada (vuelta 3, fase
 *   3); la senda pintada se lleva luego por el arco (`tendidosDeLasPuertas`,
 *   `sendasPorLosTendidos` en `celdas.ts`). Dentro, casas por todo el
 *   recinto, sin plaza mayor: libre solo la calle junto a cada puerta y donde
 *   pisa quien está en la ciudad (`tapaElPieDelHeroe`).
 *
 * Es puro y determinista, con su propia corriente de azar: no sabe de sprites
 * ni de la escena; `componer` le da los módulos y la calle de las casas
 * (`entraLaCasa`) y pone lo que devuelve.
 *
 * Aquí, `recintoDe`: el anillo de piezas, de vértice a vértice, y las casas de
 * dentro, con lo que no tapan (la calle de cada puerta, el pie de quien está en la
 * ciudad, el vano de un arco). Lo demás del recinto, al lado, en `recinto/` (fase
 * C de la reorganización, 07-11-2026, que repartió `recinto.ts`): el octógono y
 * sus medidas (`octogono.ts`), el orden de pintado del anillo (`orden.ts`), la
 * senda por los arcos (`sendas.ts`) y los guardias que lee el informe de la escena
 * (`guardias.ts`).
 */
import { hashDeTexto } from '@core/rng.js';
import { azarDe, barajar } from '../esparcir.js';
import { varianteDeId } from '../nodos.js';
import type { Senda } from '../sendas.js';
import { type ModuloDeTirada, tiradaNorteSur } from '../tirada.js';
import {
  ALTO_DE_TORRE_DEL_RECINTO,
  ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO,
  ARRANQUE_DEL_ARCO,
  type Cara,
  type CaraDelContorno,
  type Contorno,
  caraDelContorno,
  contornoDelRecinto,
  EJE_DE_LA_CARA,
  ESCALA_DEL_MODULO,
  filaDelContorno,
  GRUESO_DEL_TORREON,
  LUZ_DEL_ARCO,
  MARCO_DEL_EJE,
  type ModuloDeLaHojaDelRecinto,
  type Par,
  PX_POR_CASILLA_DEL_PUEBLO,
  puertaDelEje,
  RADIO_DE_TORRE,
  type Rect,
  tramoDelEje,
} from './octogono.js';
import { ordenDelAnillo } from './orden.js';

/** Un módulo de una hoja tal como lo lee la regla: su nombre, su tamaño, su ancla y, si va de vértice a vértice, sus juntas. */
export interface ModuloDelRecinto {
  readonly nombre: string;
  readonly nw: number;
  readonly nh: number;
  readonly ax: number;
  readonly ay: number;
  /**
   * El pie de sus dos puntas, en píxeles de su imagen (las puertas y los tramos
   * en diagonal de la hoja `recinto`, que deriva `pnpm taller derivar-recinto`):
   * se coloca poniéndolas en los dos vértices de su cara.
   */
  readonly junta?: readonly [Par, Par];
  /**
   * De dónde a dónde va lo opaco de su imagen, por franjas de columnas de
   * izquierda a derecha, en fracciones del alto (`Modulo.silueta`, las casas):
   * lo que mira `tapaElArco`. Sin ella (el marcador sin arte), su caja.
   */
  readonly silueta?: readonly (readonly [number, number])[];
}

/** Qué es cada pieza del recinto: lo dice la regla, y lo leen los guardias. */
export type PapelEnElRecinto = 'torre' | 'tramo' | 'puerta' | 'casa';

/** Una pieza del recinto en su sitio: el módulo con su pie en `(x, y)`, en casillas, como un sprite. */
export type PiezaDelRecinto<M extends ModuloDelRecinto = ModuloDelRecinto> = M & {
  readonly que: PapelEnElRecinto;
  readonly x: number;
  readonly y: number;
  readonly alto: number;
  /** La clave del pintor si no es su pie: el tramo va detrás de la torre con la que comparte pie. */
  readonly clave?: number;
  /** La cara del anillo en que va (torres: la que empieza en su vértice). */
  readonly cara?: Cara;
};

export interface ModulosDelRecinto<M extends ModuloDelRecinto> {
  /** Las torres de la hoja `muro` (redonda y cuadrada): una por ciudad. */
  readonly torres: readonly M[];
  /**
   * Los tramos de norte a sur (`muro-ns-1`, `muro-ns-2`), por su ancla del
   * medio y con el paso de su tirada (`tiradaNorteSur`): las caras este y oeste.
   */
  readonly norteSur: readonly (M & ModuloDeTirada)[];
  /** Las piezas de la hoja `recinto` por su nombre (`MODULOS_DEL_RECINTO`), con sus juntas. */
  readonly delRecinto: Readonly<Record<ModuloDeLaHojaDelRecinto, M>>;
  readonly casas: readonly M[];
}

export interface EntradaDeRecinto<M extends ModuloDelRecinto> {
  readonly id: string;
  readonly rect: Rect;
  readonly semilla: number;
  /** Las caras con puerta (`puertasDelNucleo`). */
  readonly puertas: readonly Cara[];
  readonly modulos: ModulosDelRecinto<M>;
  /** Si una casa entra: su pie, de su ancho, lejos de la calle y fuera de la reserva de otro objeto. */
  readonly entraLaCasa: (p: PiezaDelRecinto<M>) => boolean;
}

export interface Recinto<M extends ModuloDelRecinto = ModuloDelRecinto> {
  readonly contorno: Contorno;
  readonly puertas: readonly Cara[];
  readonly torres: readonly PiezaDelRecinto<M>[];
  readonly tramos: readonly PiezaDelRecinto<M>[];
  /** Las piezas de puerta, una por cara con puerta. */
  readonly arcos: readonly PiezaDelRecinto<M>[];
  readonly casas: readonly PiezaDelRecinto<M>[];
}

/**
 * Lo que el adarve de una cara del este o del oeste puede quedarse corto de cada
 * vértice: lo tapa la torre, de `RADIO_DE_TORRE`, hasta la mitad. Con él, la
 * cara (1,23) iba en dos piezas de su tirada y no en tres; con el muro a la
 * altura del de las diagonales (`ESCALA_DEL_MURO_NORTE_SUR`, vuelta 4), en una.
 */
const HOLGURA_DE_LA_CARA = RADIO_DE_TORRE / 2;

/** Lo que el pie de la primera fila de casas queda por debajo del muro norte. */
const PRIMERA_FILA = 0.3;

/**
 * Cada cuánto va una fila de casas, de norte a sur, como mucho (`recintoDe`
 * las reparte de la primera a la última). Una casa mide de 0,57 a 0,9
 * de alto: cada fila tapa la base de la de detrás y se ven los tejados, que es
 * la ciudad apiñada que pidió el usuario.
 */
const PASO_DE_FILA = 0.42;

/** Lo que la última fila queda por encima del muro sur. */
const ULTIMA_FILA = 0.15;

/**
 * Lo que el pie de una casa queda por dentro de cada cara del anillo: pegada a
 * la muralla, y en los chaflanes, que cortan las esquinas, la fila empieza más
 * adentro (`filaDelContorno`).
 */
export const DENTRO_DE_LA_MURALLA = 0.15;

/**
 * Lo mismo en los chaflanes: el muro en diagonal no tapa el pie de lo que tiene
 * detrás como el de norte a sur, y con 0,15 las filas de arriba y de abajo se
 * quedaban en dos casas (las ciudades de tres puertas, en 8-10).
 */
export const DENTRO_DE_LOS_CHAFLANES = 0.05;

/** El hueco entre dos casas de una fila. */
const ENTRE_CASAS = 0.04;

/**
 * Cuánto avanza la fila cuando ninguna casa entra en su sitio (la calle de una
 * puerta, donde pisa el héroe). Con 0,1 y tres módulos por sitio, las calles
 * hasta la plaza mayor de la fase 3 dejaban la mediana de casas por ciudad de
 * 1-20 en 12; con este y probando todos, en 13 (vuelta 3).
 */
const AVANCE_SIN_CASA = 0.05;

/** Las caras de detrás: su muro se ve por dentro y va detrás de las casas. */
export const DE_DETRAS: ReadonlySet<Cara> = new Set(['n', 'ne', 'no']);

/**
 * La pieza `m` de vértice a vértice de la cara `k`: sus dos juntas en `a` y `b`,
 * a su escala propia (`ESCALA_DEL_MODULO`, 1 si no la tiene) alrededor del
 * medio de la cara. Basta una junta en su sitio (o el medio de las dos en el
 * medio de la cara) y lo que van de una a otra (la escala); su rumbo es el de
 * la imagen, que se pidió en el de su cara. Sin juntas (el marcador sin arte),
 * de su ancho a lo largo de la cara.
 */
function deVerticeAVertice<M extends ModuloDelRecinto>(
  m: M,
  k: CaraDelContorno,
  que: PapelEnElRecinto,
): PiezaDelRecinto<M> {
  const largo = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
  const [j0, j1] = m.junta ?? [
    [0, m.nh],
    [m.nw, m.nh],
  ];
  const propia = ESCALA_DEL_MODULO[m.nombre as ModuloDeLaHojaDelRecinto] ?? 1;
  const escala = (propia * largo) / Math.hypot(j1[0] - j0[0], j1[1] - j0[1]);
  const ys = [k.a[1], k.b[1]];
  const base = { ...m, que, alto: m.nh * escala, cara: k.cara };
  // La de una cara de detrás, por el medio y antes que lo de su vértice de
  // arriba; la de una de delante que baja (en diagonal, o la del este y el
  // oeste), por su junta de abajo, que con su escala propia cae en su vértice
  // de abajo corrido hacia el medio: se pinta tras todo lo que tapa, y la clave
  // del pintor no pasa de su pie (con el pie en el medio y la clave abajo,
  // `separar` la tenía por mal ordenada).
  const vertice = k.a[1] >= k.b[1] ? k.a : k.b;
  const abajo: Par = [
    k.medio[0] + propia * (vertice[0] - k.medio[0]),
    k.medio[1] + propia * (vertice[1] - k.medio[1]),
  ];
  const jAbajo = j0[1] >= j1[1] ? j0 : j1;
  if (!DE_DETRAS.has(k.cara) && Math.abs(k.a[1] - k.b[1]) > 1e-9 && Math.abs(j0[1] - j1[1]) > 1e-9)
    return {
      ...base,
      ax: jAbajo[0],
      ay: jAbajo[1],
      x: abajo[0],
      y: abajo[1],
      clave: abajo[1] - 0.005,
    };
  return {
    ...base,
    ax: (j0[0] + j1[0]) / 2,
    ay: (j0[1] + j1[1]) / 2,
    x: k.medio[0],
    y: k.medio[1],
    clave: Math.min(k.medio[1], DE_DETRAS.has(k.cara) ? Math.min(...ys) : Math.max(...ys)) - 0.005,
  };
}

/**
 * El anillo y las casas de un recinto.
 *
 * En cada vértice del octógono, una torre (del tipo de la ciudad, por su id);
 * en cada cara, su puerta o su tramo liso: al este y al oeste una tirada de
 * norte a sur (`tiradaNorteSur`), y en las demás los de la hoja `recinto`, que
 * van de vértice a vértice por sus juntas (`deVerticeAVertice`), como las
 * puertas.
 *
 * Las casas, por filas de norte a sur, de oeste a este desde el muro, con el pie
 * dentro del octógono (`filaDelContorno`), sin tapar donde pisa el héroe
 * (`tapaElPieDelHeroe`) ni el vano de un arco (`tapaElArco`): la siguiente de
 * una baraja de la hoja que no sea la de su izquierda ni una de la fila de
 * detrás que se le solape; si no entra (la calle de una puerta, el pie del
 * héroe, un arco), la siguiente de la baraja que entre, y si ninguna, la fila
 * avanza.
 */
export function recintoDe<M extends ModuloDelRecinto>(e: EntradaDeRecinto<M>): Recinto<M> {
  const { modulos } = e;
  const contorno = contornoDelRecinto(e.rect);
  const azar = azarDe(Math.imul(e.semilla, 7307) + hashDeTexto(e.id));
  const conPuerta = new Set(e.puertas);

  const torre = modulos.torres[varianteDeId(e.id, modulos.torres.length)] as M;
  // El pie de una torre (el ancla de su imagen) es lo de delante de su base:
  // la base, redonda, va centrada en el vértice, que tapa las puntas de sus
  // dos caras.
  const torresAlPie = contorno.caras.map(
    (k): PiezaDelRecinto<M> => ({
      ...torre,
      que: 'torre',
      x: k.a[0],
      y: k.a[1] + RADIO_DE_TORRE,
      alto: ALTO_DE_TORRE_DEL_RECINTO,
      cara: k.cara,
    }),
  );

  const tramos: PiezaDelRecinto<M>[] = [];
  const arcos: PiezaDelRecinto<M>[] = [];
  for (const k of contorno.caras) {
    const eje = EJE_DE_LA_CARA[k.cara];
    if (conPuerta.has(k.cara)) {
      arcos.push(deVerticeAVertice(modulos.delRecinto[puertaDelEje(eje)], k, 'puerta'));
      continue;
    }
    if (eje !== 'e-o') {
      tramos.push(deVerticeAVertice(modulos.delRecinto[tramoDelEje(eje)], k, 'tramo'));
      continue;
    }
    // Este u oeste: una tirada de norte a sur (`tiradaNorteSur`), un solo
    // módulo al mismo alto y cada pieza a un paso de la de delante, que tapa su
    // testero. Con dos piezas en la misma columna, partidas a media cara, el de
    // la de atrás asomaba a media cara y el muro se leía partido (el usuario,
    // 21-10-2026; s16, town-0).
    const yNorte = Math.min(k.a[1], k.b[1]);
    const ySur = Math.max(k.a[1], k.b[1]);
    const m = modulos.norteSur[varianteDeId(`${e.id}:${k.cara}`, modulos.norteSur.length)] as M &
      ModuloDeTirada;
    const alto = ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO;
    // Con las torres de sus puntas, cada pieza va delante o detrás según lo que
    // cada una tiene más cerca de la cámara donde se solapan (`ordenDelAnillo`).
    for (const p of tiradaNorteSur(m, alto, k.a[0], yNorte, ySur, HOLGURA_DE_LA_CARA))
      tramos.push({ ...m, que: 'tramo', x: p.x, y: p.y, alto, clave: p.y - 0.005, cara: k.cara });
  }
  // Una torre y cada pieza de sus dos caras, en el orden de la geometría: la
  // torre del vértice de arriba de la puerta del noreste de s16 (town-0) se
  // pintaba encima del torreón, que es grueso y tiene su cara de dentro más
  // cerca de la cámara (marca 20261021-173248-s16-11-6, «mal z index»).
  const orden = ordenDelAnillo(contorno, torresAlPie, [...tramos, ...arcos]);
  const torres = orden.torres;
  tramos.splice(0, tramos.length, ...orden.piezas.filter((p) => p.que === 'tramo'));
  arcos.splice(0, arcos.length, ...orden.piezas.filter((p) => p.que === 'puerta'));
  // Lo que el orden bajó por delante, con su clave de antes y la de ahora: la
  // casa que se pintaba antes que una de ellas se sigue pintando antes
  // (`techoDeLaCasa`).
  const ordenadas = [...orden.torres, ...orden.piezas];
  const bajadas = orden.porDelante.map(({ i, vieja, nueva }) => ({
    caja: cajaEnPantalla(ordenadas[i] as PiezaDelRecinto<M>),
    vieja,
    nueva,
  }));

  // Las casas, apiñadas: por filas, de oeste a este.
  const vanos = arcos.map((a) => ({
    vano: vanoDelArco(caraDelContorno(contorno, a.cara as Cara)),
    clave: a.clave ?? a.y,
  }));
  const casas: PiezaDelRecinto<M>[] = [];
  const ms = modulos.casas;
  let baraja: number[] = [];
  let detras: PiezaDelRecinto<M>[] = [];
  const anchoDe = (m: Pick<ModuloDelRecinto, 'nw'>) => m.nw / PX_POR_CASILLA_DEL_PUEBLO;
  const izquierdaDe = (p: PiezaDelRecinto<M>) => p.x - p.ax / PX_POR_CASILLA_DEL_PUEBLO;
  const masEstrecha = Math.min(...ms.map(anchoDe));
  const [, y0] = contorno.vertices[0] as Par;
  const [, y1] = contorno.vertices[4] as Par;
  // Las filas, repartidas de la primera a la última: con el paso fijo, la última
  // quedaba a 0,56 del muro sur y dejaba una franja de plaza vacía delante.
  const primera = y0 + PRIMERA_FILA;
  const ultima = y1 - ULTIMA_FILA - 1e-6;
  const filas = Math.ceil((ultima - primera) / PASO_DE_FILA) + 1;
  const paso = filas > 1 ? (ultima - primera) / (filas - 1) : 0;
  for (let f = 0; ms.length > 0 && f < filas; f++) {
    const y = primera + f * paso;
    const fila: PiezaDelRecinto<M>[] = [];
    const tramo = filaDelContorno(contorno, y, (k) =>
      EJE_DE_LA_CARA[k.cara] === 'ne-so' || EJE_DE_LA_CARA[k.cara] === 'no-se'
        ? DENTRO_DE_LOS_CHAFLANES
        : DENTRO_DE_LA_MURALLA,
    );
    if (tramo === null) continue;
    const [inicio, fin] = tramo;
    let x = inicio;
    while (x + masEstrecha <= fin) {
      if (baraja.length < ms.length)
        baraja = [
          ...baraja,
          ...barajar(
            Array.from(ms, (_, k) => k),
            azar,
          ),
        ];
      const izquierda = fila.at(-1);
      let puesta: PiezaDelRecinto<M> | undefined;
      for (const k of new Set(baraja)) {
        const m = ms[k] as M;
        const w = anchoDe(m);
        if (x + w > fin) continue;
        // Ni la de su izquierda ni una de la fila de detrás que se le solape.
        if (izquierda?.nombre === m.nombre) continue;
        if (
          detras.some(
            (d) =>
              d.nombre === m.nombre && izquierdaDe(d) < x + w && izquierdaDe(d) + anchoDe(d) > x,
          )
        )
          continue;
        const enSuSitio: PiezaDelRecinto<M> = {
          ...m,
          que: 'casa',
          x: x + m.ax / PX_POR_CASILLA_DEL_PUEBLO,
          y,
          alto: m.nh / PX_POR_CASILLA_DEL_PUEBLO,
        };
        const techo = techoDeLaCasa(enSuSitio, bajadas);
        const c = techo < y ? { ...enSuSitio, clave: techo } : enSuSitio;
        if (
          tapaElPieDelHeroe(contorno, c) ||
          vanos.some((a) => tapaElArco(a.vano, a.clave, c)) ||
          !e.entraLaCasa(c)
        )
          continue;
        puesta = c;
        baraja.splice(baraja.indexOf(k), 1);
        break;
      }
      if (puesta === undefined) {
        x += AVANCE_SIN_CASA;
        continue;
      }
      fila.push(puesta);
      x += anchoDe(puesta) + ENTRE_CASAS;
    }
    casas.push(...fila);
    detras = fila;
  }

  casasEnSuOrden(casas);
  return { contorno, puertas: e.puertas, torres, tramos, arcos, casas };
}

/** Lo que una casa queda por debajo de la clave de la pieza del anillo que el orden bajó (`techoDeLaCasa`). */
const ENTRE_CASA_Y_PIEZA = 0.001;

/**
 * La clave del pintor más alta que puede llevar la casa `c`: la de cada pieza
 * del anillo que `ordenDelAnillo` bajó por debajo de su pie y con la que se
 * solapa en pantalla, un poco menos. Sin ninguna, `Infinity`.
 *
 * El tramo en diagonal de delante va por su vértice de abajo (su clave, en la
 * fila del muro sur) para pintarse después de las casas que tapa, y el orden lo
 * baja detrás de la torre de su vértice de arriba, 0,56 más al norte: las casas
 * de la última fila que su caja toca, junto a ese vértice de abajo, se
 * pintarían encima de él. Bajan con él, y quedan delante de la fila de detrás
 * (`casasEnSuOrden` lo comprueba).
 */
function techoDeLaCasa(
  c: PiezaDelRecinto,
  bajadas: readonly {
    readonly caja: CajaEnPantalla;
    readonly vieja: number;
    readonly nueva: number;
  }[],
): number {
  const caja = cajaEnPantalla(c);
  let techo = Number.POSITIVE_INFINITY;
  for (const b of bajadas)
    if (c.y > b.nueva && c.y <= b.vieja && seCruzan(caja, b.caja))
      techo = Math.min(techo, b.nueva - ENTRE_CASA_Y_PIEZA);
  return techo;
}

/**
 * Lanza si dos casas que se solapan en pantalla no se pintan en el orden de
 * sus pies (de norte a sur y, en la misma fila, de oeste a este): lo que
 * `techoDeLaCasa` baje no puede pasar a una casa detrás de la de su fila de
 * detrás.
 */
function casasEnSuOrden(casas: readonly PiezaDelRecinto[]): void {
  const porElPie = (p: PiezaDelRecinto, q: PiezaDelRecinto) => p.y - q.y || p.x - q.x;
  const porLaClave = (p: PiezaDelRecinto, q: PiezaDelRecinto) =>
    (p.clave ?? p.y) - (q.clave ?? q.y) || p.x - q.x;
  for (const [i, a] of casas.entries())
    for (const b of casas.slice(i + 1))
      if (
        seCruzan(cajaEnPantalla(a), cajaEnPantalla(b)) &&
        Math.sign(porElPie(a, b)) !== Math.sign(porLaClave(a, b))
      )
        throw new Error(
          `las casas de ${a.x.toFixed(2)},${a.y.toFixed(2)} y ${b.x.toFixed(2)},${b.y.toFixed(2)} se solapan y se pintarían al revés de sus pies: el techo de la una (${(a.clave ?? a.y).toFixed(3)}) o de la otra (${(b.clave ?? b.y).toFixed(3)}) pasa de la fila de detrás`,
        );
}

/**
 * Lo que queda bajo el centro del recinto donde pisa quien está en la ciudad,
 * en casillas: `PIES.heroe` (`figuras-del-mapa.ts`) menos media casilla.
 */
export const PIE_EN_LA_PLAZA = 0.3;

/**
 * Lo que queda libre de casas alrededor de donde pisa quien está en la ciudad,
 * en casillas, a cada lado (`ancho`) y por delante y por detrás (`hondo`)
 * (`tapaElPieDelHeroe`): sus pies van sobre la piedra de la plaza y no sobre un
 * tejado. Es lo justo, el sitio de sus pies (decisión del usuario tras la fase 3
 * de la vuelta 3: «llena, sin plaza mayor»): con las piernas abiertas, del pie
 * izquierdo al derecho mide unas 0,4 casillas (s13, en el navegador). Con una
 * plaza mayor de 0,3 alrededor y una calle de cada puerta hasta ella, la mediana
 * de casas por ciudad de 1-40 bajaba de 15 a 13 y la ciudad se veía vacía; con
 * un círculo de 0,1 se ganaba media casa de media, pero el pie izquierdo quedaba
 * al filo de la casa de al lado y el aro del héroe la pisaba.
 */
export const LIBRE_BAJO_EL_HEROE = { ancho: 0.2, hondo: 0.1 } as const;

/** Donde pisa quien está en la ciudad del recinto de `c`. */
export const pieDelHeroe = (c: Contorno): Par => [c.centro[0], c.centro[1] + PIE_EN_LA_PLAZA];

/**
 * Si la casa `p` tapa donde pisa quien está en la ciudad del recinto de `c`: su
 * imagen, de su pie a su alto y de su ancho, entra en la elipse de
 * `LIBRE_BAJO_EL_HEROE` alrededor de su pie. La imagen y no solo el pie: quien
 * está dentro se pinta delante del recinto entero (`Escenario.cubiertas`), así
 * que el tejado de la casa de delante le quedaba bajo los pies.
 */
export function tapaElPieDelHeroe(
  c: Contorno,
  p: Pick<PiezaDelRecinto, 'x' | 'y' | 'alto' | 'nw' | 'nh' | 'ax'>,
): boolean {
  const ancho = (p.alto * p.nw) / p.nh;
  const izquierda = p.x - (p.ax * p.alto) / p.nh;
  const [cx, cy] = pieDelHeroe(c);
  const dx = Math.max(izquierda - cx, 0, cx - (izquierda + ancho));
  const dy = Math.max(p.y - p.alto - cy, 0, cy - p.y);
  return Math.hypot(dx / LIBRE_BAJO_EL_HEROE.ancho, dy / LIBRE_BAJO_EL_HEROE.hondo) < 1;
}

/**
 * Lo que la calle de una puerta entra en el recinto desde su cara, en casillas:
 * lo que entra la senda (`DENTRO_DE_LA_PUERTA`) y su media anchura. Por detrás
 * y de lado era 0,6, un margen para que el tejado de la casa de delante no
 * tapara el arco; no lo hacía en las diagonales (H1 del QA de la ciudad llena,
 * 21-10-2026), y ahora lo dice lo que se ve (`tapaElArco`). Con los dos, las
 * casas por ciudad de 1-40 se quedaban en una mediana de 14 (media 14,27); con
 * la calle corta, 15 (14,44; eran 14,60 tapando arcos).
 */
export const FONDO_DE_LA_CALLE = 0.35;

/**
 * Lo que el pie de una casa del recinto queda del eje de la calle de una puerta
 * (`callesDeLasPuertas`): la media anchura de la senda (0,16), que es lo que
 * entra por el arco. La fase 2 dejaba media luz del arco (0,2).
 */
export const MEDIA_CALLE = 0.15;

/**
 * La calle de cada puerta: de fuera de su arco a `FONDO_DE_LA_CALLE` dentro, por
 * su normal, lo que no lleva casas en el pie (`entraLaCasa`). Lo justo para que
 * la senda entre (su tendido entra `DENTRO_DE_LA_PUERTA`); que el arco no quede
 * tapado lo dice `tapaElArco`, y más allá, la ciudad va llena.
 */
export function callesDeLasPuertas(r: Pick<Recinto, 'contorno' | 'puertas'>): Senda[] {
  return r.contorno.caras
    .filter((k) => r.puertas.includes(k.cara))
    .map((k): Senda => {
      const [nx, ny] = k.normal;
      return [
        [k.medio[0] + nx * 0.2, k.medio[1] + ny * 0.2],
        [k.medio[0] - nx * FONDO_DE_LA_CALLE, k.medio[1] - ny * FONDO_DE_LA_CALLE],
      ];
    });
}

/**
 * Un rectángulo del mapa tal como se ve, en casillas: con lo alto restado de la
 * fila (la proyección del mapa, `y − z`), de `x0` a `x1` y de `y0`, lo de
 * arriba, a `y1`.
 */
export interface CajaEnPantalla {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** En cuántas columnas se mide el vano de un arco (`vanoDelArco`): cada una, de 0,03 casillas. */
const COLUMNAS_DEL_VANO = 12;

/**
 * El vano del arco de la puerta de la cara `k`, tal como se ve: la boca que
 * dibuja la guía (`arco`, `tools/taller/recinto.ts`), en la cara del torreón
 * que se ve (`MARCO_DEL_EJE`), de media luz a cada lado de su medio y del suelo
 * a lo alto del arco. Es el paso por el que entra el camino: puesta sobre las
 * cuatro puertas de la hoja `recinto`, cubre su hueco oscuro y el suelo del
 * paso.
 *
 * En `COLUMNAS_DEL_VANO` columnas, cada una la caja de su trozo de boca: en las
 * diagonales la boca va inclinada 45° (el suelo del paso sube a lo largo de la
 * cara) y su caja entera se come un triángulo de muro debajo y otro encima; la
 * casa de delante a la derecha del arco del noroeste, que solo tapa la base del
 * torreón, contaba como que tapaba el vano: cada puerta de detrás costaba 0,7
 * casas de media en 1-40, y con las columnas la media de casas por ciudad
 * sube de 14,04 a 14,27. La del este y el oeste se ve de canto, y su vano es la
 * línea de esa cara.
 */
export function vanoDelArco(k: CaraDelContorno): readonly CajaEnPantalla[] {
  const { u, v } = MARCO_DEL_EJE[EJE_DE_LA_CARA[k.cara]];
  const r = LUZ_DEL_ARCO / 2;
  const cx = k.medio[0] + (GRUESO_DEL_TORREON / 2) * v[0];
  const cy = k.medio[1] + (GRUESO_DEL_TORREON / 2) * v[1];
  // Un punto `a` de la boca, a lo largo del muro: el suelo en `a·u` y lo alto
  // del arco a `ARRANQUE + √(r² − a²)` sobre él. Lo alto, `a·u_y − √(r² − a²)`
  // en la fila, es convexo en `a`: en cada trozo, en su mínimo o en una punta.
  const alto = (a: number) => a * u[1] - Math.sqrt(Math.max(0, r * r - a * a));
  const minimo = (-u[1] * r) / Math.hypot(1, u[1]);
  return Array.from({ length: COLUMNAS_DEL_VANO }, (_, j): CajaEnPantalla => {
    const a0 = -r + (2 * r * j) / COLUMNAS_DEL_VANO;
    const a1 = -r + (2 * r * (j + 1)) / COLUMNAS_DEL_VANO;
    const cima = Math.min(
      alto(a0),
      alto(a1),
      minimo > a0 && minimo < a1 ? alto(minimo) : Number.POSITIVE_INFINITY,
    );
    return {
      x0: cx + Math.min(a0 * u[0], a1 * u[0]),
      x1: cx + Math.max(a0 * u[0], a1 * u[0]),
      y0: cy - ARRANQUE_DEL_ARCO + cima,
      y1: cy + Math.max(a0 * u[1], a1 * u[1]),
    };
  });
}

/** La caja de la imagen de una pieza del recinto, tal como se ve: de su ancho, y de lo alto de su imagen a lo bajo. */
export function cajaEnPantalla(
  p: Pick<PiezaDelRecinto, 'x' | 'y' | 'alto' | 'nw' | 'nh' | 'ax' | 'ay'>,
): CajaEnPantalla {
  const escala = p.alto / p.nh;
  return {
    x0: p.x - p.ax * escala,
    x1: p.x + (p.nw - p.ax) * escala,
    y0: p.y - p.ay * escala,
    y1: p.y + (p.nh - p.ay) * escala,
  };
}

/** Lo que mira `tapaElArco` de una casa: dónde va, su imagen y, si la trae, su silueta. */
export type CasaQueTapa = Pick<
  PiezaDelRecinto,
  'x' | 'y' | 'alto' | 'nw' | 'nh' | 'ax' | 'ay' | 'clave' | 'silueta'
>;

const seCruzan = (a: CajaEnPantalla, b: CajaEnPantalla) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Si la casa `casa` tapa el vano `vano` del arco cuya clave del pintor es
 * `claveDelArco`: se pinta después de él (su clave, que es su pie, va más al
 * sur; la de antes la tapa el arco) y lo opaco de su imagen entra en el vano:
 * alguna franja de su silueta (`Modulo.silueta`), o sin ella, su caja.
 *
 * Es la regla por lo que se ve, la que cumple `recintoDe` y vigila
 * `arcosTapados` (QA de la ciudad llena, H1, 21-10-2026). La calle de la puerta
 * (`callesDeLasPuertas`) mira el pie de la casa a lo largo de la normal de la
 * cara, y en una diagonal esa normal no es la vertical de la pantalla, que es
 * por donde sube el tejado: la casa `1` quedaba a 0,63 por la normal de la
 * puerta del noroeste, pasado el fondo de 0,6, y justo bajo el arco, y su
 * tejado tapaba el vano en 25 de 553 ciudades (s16 (10, 7)). Por la silueta y
 * no por la caja: las esquinas de arriba de un tejado en punta son
 * transparentes, y con la caja la casa de al lado de la calle de una puerta
 * contaba como que tapaba (con la calle de entonces y el vano en una caja,
 * la media de casas por ciudad de 1-40 era 13,86 con la caja de la casa y
 * 14,04 con su silueta).
 */
export function tapaElArco(
  vano: readonly CajaEnPantalla[],
  claveDelArco: number,
  casa: CasaQueTapa,
): boolean {
  // La clave del pintor (`claveDe`, `pintar.ts`, que aquí no se importa: pinta
  // la plaza con `huella.ts`, que importa este módulo).
  if ((casa.clave ?? casa.y) <= claveDelArco) return false;
  const caja = cajaEnPantalla(casa);
  // Estrictas: el vano de canto, una línea, entra si la casa la cruza.
  const cruzadas = vano.filter((c) => seCruzan(caja, c));
  if (cruzadas.length === 0) return false;
  const franjas = casa.silueta;
  if (franjas === undefined) return true;
  const escala = casa.alto / casa.nh;
  const n = franjas.length;
  return franjas.some(([arriba, abajo], k) => {
    if (abajo <= arriba) return false;
    // Las columnas de la franja, como las cuenta `siluetaDeModulo`.
    const a = Math.floor((k * casa.nw) / n);
    const b = Math.max(a + 1, Math.floor(((k + 1) * casa.nw) / n));
    const franja = {
      x0: caja.x0 + a * escala,
      x1: caja.x0 + b * escala,
      y0: caja.y0 + arriba * casa.alto,
      y1: caja.y0 + abajo * casa.alto,
    };
    return cruzadas.some((c) => seCruzan(franja, c));
  });
}
