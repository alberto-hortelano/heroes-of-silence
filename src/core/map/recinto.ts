/**
 * El recinto de una ciudad (la ciudad amurallada, vuelta 3, 21-10-2026).
 *
 * La ciudad del mapa se pinta como un recinto amurallado de `LADO_DEL_RECINTO`
 * casillas por lado con la ciudad en el medio (`render/escenario/recinto.ts`).
 * Hasta la vuelta 2 eso era solo de la escena, y el núcleo ponía cosas donde la
 * escena levantaba la muralla: dos ciudades a tres casillas, con los recintos
 * fundidos en un solo castillo (s2, cuatro en uno); un nodo entre las casas de
 * una ciudad-puente (s98, s105); y el héroe de salida dentro de su base, de pie
 * sobre los tejados. «Dos ciudades no quedan tan cerca que sus recintos se
 * toquen» y «el héroe de salida no nace dentro de su recinto» son decisiones
 * del usuario (21-10-2026), así que **dónde está el recinto es del núcleo**, y
 * aquí, una vez: lo leen el generador (para no poner nada dentro), la puerta de
 * los planes (`validateMapPlan`, para rechazarlo diciéndolo) y la escena (para
 * pintarlo donde el núcleo lo dejó libre).
 *
 * Por dónde se entra todavía no: el héroe pisa el recinto como cualquier otra
 * casilla. Eso es la fase 2 del plan (`pasoPermitido`), y con ella la
 * ciudad-puente pasa a la casilla del medio de su recinto. Hasta entonces la
 * ciudad-puente sigue en el río y su recinto va tierra adentro
 * (`centroDelRecinto`): con el movimiento de hoy, en ocho vecinas y sin pasos
 * prohibidos, la ciudad a dos casillas del río no tocaría la región de
 * enfrente, y abrir la casilla del río uniría las tres regiones por las
 * esquinas de su recinto.
 */
import type { Point } from '../types.js';
import type { GameMap } from './map.js';
import { estructura } from './regiones.js';
import { type MapaDelRio, orillaDeLaCiudad } from './rio.js';

/**
 * Lo ancho del recinto en casillas: el 3 × 3 de la ciudad. Lo eligió el usuario
 * viendo tres maquetas (20-10-2026): con 2 se veían 1-3 casas y sus torres se
 * apilaban; con 4 tapaba los caminos y doblaba la huella.
 */
export const LADO_DEL_RECINTO = 3;

/**
 * Lo que dista (Chebyshev) el medio de un recinto del de otro, como poco: con 5
 * quedan dos casillas libres entre los dos anillos y ninguna casilla de fuera
 * es vecina de los dos. Con 3 los dos 3 × 3 se tocaban y la senda que iba de
 * uno a otro pasaba bajo sus torres (s50, s62, s105); con 4, una sola casilla
 * entre dos murallas.
 */
export const SEPARACION_DE_CIUDADES = 5;

/** El rectángulo de casillas de un recinto, de `[i0, j0]` a `[i1, j1]`, las dos incluidas. */
export interface RectDelRecinto {
  readonly i0: number;
  readonly j0: number;
  readonly i1: number;
  readonly j1: number;
}

/** Lo que hay del medio del recinto a su borde. */
const MEDIO = (LADO_DEL_RECINTO - 1) / 2;

/** Si el recinto con el medio en `centro` cabe entero en un mapa de `W × H`. */
export function cabeElRecinto(centro: Point, W: number, H: number): boolean {
  return (
    centro.x - MEDIO >= 0 && centro.y - MEDIO >= 0 && centro.x + MEDIO < W && centro.y + MEDIO < H
  );
}

/**
 * El recinto con el medio en `centro`. **Lanza** si no cabe: una ciudad en el
 * borde la rechaza `problemasDeRecintos` antes de construir el mapa, y corrido
 * contra el borde (como hacía la escena con la de la columna 0 de s21) el
 * recinto ya no tenía la ciudad en el medio.
 */
export function recintoDeLaCiudad(centro: Point, W: number, H: number): RectDelRecinto {
  if (!cabeElRecinto(centro, W, H)) {
    throw new Error(
      `el recinto de la ciudad con el medio en (${centro.x},${centro.y}) no cabe en un mapa de ${W}×${H}: mide ${LADO_DEL_RECINTO} de lado y una ciudad va a una casilla del borde o más`,
    );
  }
  return {
    i0: centro.x - MEDIO,
    j0: centro.y - MEDIO,
    i1: centro.x + MEDIO,
    j1: centro.y + MEDIO,
  };
}

/** Si la casilla `p` cae en el recinto `r`. */
export const enElRecintoDeLaCiudad = (r: RectDelRecinto, p: Point): boolean =>
  p.x >= r.i0 && p.x <= r.i1 && p.y >= r.j0 && p.y <= r.j1;

/**
 * El medio del recinto de la ciudad de `at`: su casilla, salvo la ciudad-puente
 * (#144), que está en el río y lleva el recinto en su `orilla` tierra adentro,
 * con la orilla en su fila del río: el medio, a dos casillas del río. Es la
 * regla con la orilla ya leída (`orillaDeLaCiudad`); la escena la tiene en su
 * análisis. Con el mapa, `centroDeLaCiudad`.
 */
export function centroDelRecinto(at: Point, orilla: Point | undefined): Point {
  return orilla === undefined ? at : { x: 2 * orilla.x - at.x, y: 2 * orilla.y - at.y };
}

/** `centroDelRecinto` leyendo la orilla del mapa: lo que hacen el generador y la puerta de los planes. */
export function centroDeLaCiudad(map: MapaDelRio, at: Point, regionDe: Int32Array): Point {
  return centroDelRecinto(at, orillaDeLaCiudad(map, at, regionDe)?.orilla);
}

/** Las caras del recinto que pueden llevar puerta: la del este y la del oeste, nunca (decisión del usuario, 21-10-2026). */
export type CaraConPuerta = 'n' | 'ne' | 'se' | 's' | 'so' | 'no';

/** Un desplazamiento en casillas desde el medio del recinto. */
type Paso = readonly [number, number];

/**
 * Las puertas de una ciudad, relativas al medio de su recinto: la casilla de la
 * puerta (la del anillo) y sus accesos, las de fuera desde las que se entra
 * por ella. La del norte y la del sur, la de en medio de su lado con su acceso
 * de frente; las diagonales, la esquina con sus tres vecinas de fuera, que
 * cruzan el chaflán de su cara por su arco. Las caras del este y del oeste no
 * llevan puerta: vista de lado, la senda llegaba a un muro (H3 del QA de la
 * vuelta 2). Por qué caras de estas se entra lo dirán los caminos (fase 2);
 * hoy lo lee el inicio de cada héroe (`ORDEN_DEL_INICIO`).
 */
export const PUERTAS_DE_LA_CIUDAD: Readonly<
  Record<CaraConPuerta, { readonly casilla: Paso; readonly accesos: readonly Paso[] }>
> = {
  n: { casilla: [0, -1], accesos: [[0, -2]] },
  ne: {
    casilla: [1, -1],
    accesos: [
      [1, -2],
      [2, -2],
      [2, -1],
    ],
  },
  se: {
    casilla: [1, 1],
    accesos: [
      [2, 1],
      [2, 2],
      [1, 2],
    ],
  },
  s: { casilla: [0, 1], accesos: [[0, 2]] },
  so: {
    casilla: [-1, 1],
    accesos: [
      [-1, 2],
      [-2, 2],
      [-2, 1],
    ],
  },
  no: {
    casilla: [-1, -1],
    accesos: [
      [-2, -1],
      [-2, -2],
      [-1, -2],
    ],
  },
};

/**
 * En qué orden se mira dónde empieza el héroe de una base: delante de la puerta
 * por la que entra el camino de su región, y si entra por varias, la primera de
 * esta lista. Las de abajo antes: la cámara mira desde el sur y el héroe queda
 * delante de su muralla, no detrás.
 */
export const ORDEN_DEL_INICIO: readonly CaraConPuerta[] = ['s', 'se', 'so', 'n', 'ne', 'no'];

/** Una ciudad, para decirla: su id, su nombre y su casilla. */
export interface CiudadConNombre {
  readonly id: string;
  readonly name: string;
  readonly at: Point;
}

/** Algo que ocupa una casilla y no es un objeto del mapa (un inicio, un grupo de asaltantes), dicho para la persona. */
export interface OcupaUnaCasilla {
  readonly quien: string;
  readonly at: Point;
}

const casilla = (p: Point): string => `(${p.x},${p.y})`;
const chebyshev = (a: Point, b: Point): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Cómo se dice un objeto del mapa que cae dentro de un recinto. */
function queEs(o: GameMap['objects'][number]): string {
  switch (o.kind) {
    case 'town':
      return `la ciudad ${o.id}`;
    case 'node':
      return `el nodo ${o.id}`;
    case 'mine':
      return `la mina de ${o.resource}`;
    case 'village':
      return `el pueblo "${o.name}"`;
    case 'resource':
      return `el recurso ${o.resource}`;
    case 'monster':
      return `el monstruo ${o.creature}`;
    case 'chest':
      return 'el cofre';
  }
}

/**
 * Lo que impide que cada ciudad lleve su recinto, en frases para quien hizo el
 * plan: una ciudad cuyo recinto no cabe (está en el borde), dos a menos de
 * `SEPARACION_DE_CIUDADES` y cualquier cosa dentro de un recinto que no sea su
 * ciudad —un nodo, otra ciudad, una mina, un pueblo, un recurso, un monstruo,
 * un cofre, y lo de `otros`: los inicios y los asaltantes—. Vacío: todo cabe.
 *
 * La corren los dos productores de planes: `validateMapPlan` (el agente se
 * entera de por qué, y se juega el procedimental) y el final del vestido del
 * generador, que tira ese vestido en vez de entregar lo que la puerta
 * rechazaría. Pide un mapa con la red ya válida (`problemasDeRed`): la orilla
 * de una ciudad-puente se lee de sus regiones.
 */
export function problemasDeRecintos(
  map: GameMap,
  ciudades: readonly CiudadConNombre[],
  otros: readonly OcupaUnaCasilla[],
): string[] {
  const problemas: string[] = [];
  const W = map.width;
  const H = map.height;
  const { regionDe } = estructura(map);
  const nombre = (c: CiudadConNombre): string => `"${c.name}" (${c.id}, en ${casilla(c.at)})`;
  const conRecinto: {
    readonly c: CiudadConNombre;
    readonly centro: Point;
    readonly r: RectDelRecinto;
  }[] = [];
  for (const c of ciudades) {
    const centro = centroDeLaCiudad(map, c.at, regionDe);
    if (!cabeElRecinto(centro, W, H)) {
      const donde =
        centro.x === c.at.x && centro.y === c.at.y
          ? 'con ella en el medio'
          : `en su orilla, con el medio en ${casilla(centro)}`;
      problemas.push(
        `la ciudad ${nombre(c)} está en el borde del mapa: lleva un recinto amurallado de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO} casillas ${donde}, que no cabe; ponla a una casilla del borde o más`,
      );
      continue;
    }
    conRecinto.push({ c, centro, r: recintoDeLaCiudad(centro, W, H) });
  }
  for (const [k, a] of conRecinto.entries()) {
    for (const b of conRecinto.slice(k + 1)) {
      const d = chebyshev(a.centro, b.centro);
      if (d >= SEPARACION_DE_CIUDADES) continue;
      problemas.push(
        `las ciudades ${nombre(a.c)} y ${nombre(b.c)} llevan sus recintos a ${d} casillas uno de otro: se tocarían; entre dos ciudades van ${SEPARACION_DE_CIUDADES} casillas o más, contando la diagonal como una`,
      );
    }
  }
  const dentro: (OcupaUnaCasilla & { readonly id?: string })[] = [
    ...map.objects.map((o) => ({ quien: queEs(o), at: o.at, id: o.id })),
    ...otros,
  ];
  for (const { c, r } of conRecinto) {
    for (const o of dentro) {
      if (o.id === c.id) continue;
      if (!enElRecintoDeLaCiudad(r, o.at)) continue;
      problemas.push(
        `${o.quien} de ${casilla(o.at)} cae dentro del recinto de la ciudad ${nombre(c)}, de ${casilla({ x: r.i0, y: r.j0 })} a ${casilla({ x: r.i1, y: r.j1 })}: dentro de su muralla solo va ella`,
      );
    }
  }
  return problemas;
}
