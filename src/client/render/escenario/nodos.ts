/**
 * Lo que el escenógrafo saca de un nodo: qué barrera cruza —la guarda el mapa,
 * `buildMap` al abrir su casilla (#145)— y en qué eje va su frontera, que sale
 * de sus ocho vecinas.
 */
import type { MapObject, TramoDeCamino } from '@core/map/map.js';
import { type Barrera, esBarrera, type TerrainKind } from '@core/map/terrain.js';
import { azarDe } from './esparcir.js';

/**
 * Los nodos de paso, uno por barrera; la puerta en las dos orientaciones de la
 * frontera. El agua no está: su nodo es un puente, y lo decide `puentes.ts` por
 * las orillas (#157). El acantilado tampoco: su pieza de escaleras subía siempre
 * hacia el mismo lado, sin casar con el desnivel ni con el camino (#168); lleva
 * un hito (`HITOS`), y lo que baja lo pinta la rampa. El bosque tampoco (#196):
 * su portillo era de abetos verdes sin nieve, y en un bosque nevado, de árboles
 * muertos o entre dos suelos (la mitad de los pasos de bosque de 1-40 separan
 * dos) no se entendía qué era; el paso lo abren los árboles del propio bosque
 * (`pasosALaVista`), la trocha lo cruza y el hito dice que se toma. `n` es su
 * sitio en la lámina `b` de `mapa-denso.ts`.
 */
export const NODOS: readonly {
  id: string;
  n: number;
  barrera: Barrera;
  variantes: readonly string[];
}[] = [
  { id: 'nodo-puerta', n: 2, barrera: 'wall', variantes: ['ancho', 'hondo'] },
  { id: 'nodo-paso-montana', n: 3, barrera: 'mountain', variantes: [''] },
];

/**
 * El eje de la frontera de un nodo, por las barreras de sus ocho vecinas: la
 * frontera se estrecha a una casilla en el nodo, y la barrera queda a sus
 * lados. La barrera no se deduce de aquí: en un empate se inventaba un río
 * (#187), y es un dato del mapa (`MapObject.barrera`).
 */
export function ejeDeLaFrontera(
  at: { x: number; y: number },
  W: number,
  terreno: readonly TerrainKind[],
): 'ancho' | 'hondo' {
  const H = terreno.length / W;
  let lados = 0;
  let arribaAbajo = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = at.x + dx;
      const ny = at.y + dy;
      if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!esBarrera(terreno[ny * W + nx] as TerrainKind)) continue;
      if (dy === 0) lados++;
      if (dx === 0) arribaAbajo++;
    }
  return lados >= arribaAbajo ? 'ancho' : 'hondo';
}

/** Lo que cruza un nodo: la barrera que guarda el mapa y el eje de su frontera. */
export interface PasoDeNodo {
  readonly barrera: Barrera;
  readonly eje: 'ancho' | 'hondo';
}

export function pasoDeNodo(
  nodo: Extract<MapObject, { kind: 'node' }>,
  W: number,
  terreno: readonly TerrainKind[],
): PasoDeNodo {
  return { barrera: nodo.barrera, eje: ejeDeLaFrontera(nodo.at, W, terreno) };
}

/**
 * Los hitos del nodo que no tiene pieza de paso: el de acantilado, el de bosque
 * (#196) y el que no cruza ninguna barrera. Tres, porque uno solo repetido por un llano se leía como
 * un cementerio (#176): el de la lámina llevaba una cruz y parecía una lápida.
 */
export const HITOS = ['nodo-hito-miliar', 'nodo-hito-mojon', 'nodo-hito-tablilla'] as const;

/**
 * Una de `n` variantes por el id de lo que se pinta: siempre la misma para el
 * mismo objeto, en el cliente, el espectador y el taller, y sin tocar el azar de
 * la escena (que movería todo lo que se siembra después).
 */
export function varianteDeId(id: string, n: number): number {
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`no se elige variante de ${id} entre ${n}: hace falta al menos una`);
  return [...id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7) % n;
}

/**
 * La pieza de un nodo de paso según la barrera que cruza y el eje de la
 * frontera; sin pieza para esa barrera, uno de los hitos, por su id (el agua no
 * llega aquí: su puente sale de `puenteDe`).
 */
export function nodoDePaso(id: string, barrera: Barrera | null, eje: 'ancho' | 'hondo'): string {
  const nodo = NODOS.find((n) => n.barrera === barrera);
  if (nodo === undefined) return HITOS[varianteDeId(id, HITOS.length)] as string;
  return nodo.variantes.includes(eje) ? `${nodo.id}-${eje}` : nodo.id;
}

/**
 * La tablilla por el rumbo al que apunta su flecha (§29). La de la lámina (#176)
 * apuntaba siempre al este, fuera donde fuera el paso (auditoría 3, defecto 6).
 * Ninguna se espeja: con la luz de la izquierda, la del oeste espejada la
 * tendría de la derecha; cada rumbo es su pieza, pintada con su luz.
 */
export const TABLILLAS = {
  este: 'nodo-hito-tablilla',
  oeste: 'nodo-hito-tablilla-oeste',
  norte: 'nodo-hito-tablilla-norte',
  noreste: 'nodo-hito-tablilla-noreste',
  noroeste: 'nodo-hito-tablilla-noroeste',
} as const;

/**
 * La tablilla que apunta a lo largo del eje del paso (`ejeDelPaso`, su primer
 * brazo). Un eje tiene dos sentidos y se elige el que se ve: al fondo antes que
 * hacia la cámara, donde la flecha quedaría de canto y tapada por el poste. En
 * el este-oeste los dos se ven, y va uno u otro por el sitio del eje, para que
 * no apunten todas igual.
 */
export function tablillaDelEje(
  id: string,
  eje: readonly (readonly (readonly [number, number])[])[],
): string {
  const [p, q] = eje[0] ?? [];
  if (p === undefined || q === undefined)
    throw new Error(`el nodo ${id} no tiene eje: no se sabe hacia dónde apunta su tablilla`);
  const dx = Math.sign(q[0] - p[0]);
  const dy = Math.sign(q[1] - p[1]);
  if (dx === 0 && dy === 0) throw new Error(`el eje del nodo ${id} no va a ningún lado`);
  // Por el sitio y no por el id: `varianteDeId` en módulo 2 y 3 sale de la misma
  // suma de letras, y entre los nodos que ya llevaban tablilla daba el este 11
  // veces de 12 en 1-40.
  const [cx, cy] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  if (dy === 0) return Math.floor(cx + cy) % 2 === 0 ? TABLILLAS.este : TABLILLAS.oeste;
  if (dx === 0) return TABLILLAS.norte;
  // De arriba a la izquierda a abajo a la derecha, o al revés: se ve el noroeste.
  return dx === dy ? TABLILLAS.noroeste : TABLILLAS.noreste;
}

/**
 * La pieza de un nodo de paso (`nodoDePaso`) con la tablilla ya orientada por su
 * eje: la que pinta el escenógrafo.
 */
export function piezaDeNodo(
  id: string,
  at: { x: number; y: number },
  W: number,
  terreno: readonly TerrainKind[],
  barrera: Barrera | null,
  ejeDeLaFrontera: 'ancho' | 'hondo',
): string {
  const pieza = nodoDePaso(id, barrera, ejeDeLaFrontera);
  return pieza === TABLILLAS.este ? tablillaDelEje(id, ejeDelPaso(at, W, terreno)) : pieza;
}

/** ¿Es `pieza` uno de los hitos, con cualquier tablilla? Se miden por el alto, no por el ancho. */
export function esHito(pieza: string | null): boolean {
  return (
    (HITOS as readonly (string | null)[]).includes(pieza) ||
    (Object.values(TABLILLAS) as (string | null)[]).includes(pieza)
  );
}

/** ¿Llega algún tramo de camino a la casilla del nodo? Con camino, el puente es de piedra. */
export function pasaElCamino(
  tramos: readonly TramoDeCamino[],
  at: { x: number; y: number },
): boolean {
  return tramos.some(([p, q]) => (p.x === at.x && p.y === at.y) || (q.x === at.x && q.y === at.y));
}

/**
 * Los ejes que se prueban, en el orden de `ejeDelNodo` (`vestir.ts`): los rectos
 * y luego los diagonales, cada uno con su opuesto.
 */
const EJES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, -1],
  [1, 1],
];

/**
 * El eje de un nodo de paso, como línea por centros de casilla: de la segunda
 * casilla de una entrada, por el nodo, a la segunda de la opuesta. Es lo que
 * protege el vestido (`ejeDelNodo`, #161: dos entradas opuestas, hasta la
 * segunda casilla) y lo que tiene que verse para que se lea el collado (#173).
 *
 * El vestido no guarda el eje, así que se rehace con su mismo orden sobre el
 * terreno —pleno recto, pleno diagonal, corto— sin las regiones: en un
 * estrechamiento de una casilla, dos lados pisables opuestos son dos regiones.
 * Pegado al borde, lo pisable que haya en ese lado. Sin lados opuestos
 * pisables (el nodo que el vestido dejó con una vecina por región), un brazo
 * hasta cada vecina pisable en cruz: esas son sus entradas.
 */
export function ejeDelPaso(
  at: { x: number; y: number },
  W: number,
  terreno: readonly TerrainKind[],
): (readonly [number, number])[][] {
  const H = terreno.length / W;
  const pisable = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && !esBarrera(terreno[y * W + x] as TerrainKind);
  const centro = (x: number, y: number): readonly [number, number] => [x + 0.5, y + 0.5];
  /** Hasta dónde llega por `(dx, dy)`: 2 si las dos casillas se pisan, 1 si solo la primera. */
  const alcance = (dx: number, dy: number) =>
    !pisable(at.x + dx, at.y + dy) ? 0 : pisable(at.x + 2 * dx, at.y + 2 * dy) ? 2 : 1;
  for (const minimo of [2, 1])
    for (const [dx, dy] of EJES) {
      const a = alcance(dx, dy);
      const b = alcance(-dx, -dy);
      if (a >= minimo && b >= minimo)
        return [[centro(at.x - b * dx, at.y - b * dy), centro(at.x + a * dx, at.y + a * dy)]];
    }
  return EJES.slice(0, 2)
    .flatMap(([dx, dy]) => [
      [dx, dy],
      [-dx, -dy],
    ])
    .filter(([dx, dy]) => alcance(dx as number, dy as number) > 0)
    .map(([dx, dy]) => {
      const a = alcance(dx as number, dy as number);
      return [centro(at.x, at.y), centro(at.x + a * (dx as number), at.y + a * (dy as number))];
    });
}

/** Un nodo de paso y su eje (`ejeDelPaso`): lo que no puede quedar tapado (#173). */
export interface PasoALaVista {
  readonly id: string;
  readonly eje: readonly (readonly (readonly [number, number])[])[];
}

/**
 * Las barreras cuyo nodo abre su eje entre los volúmenes (#173): las de una
 * masa que lo enterraría. Ni el agua, cuyo puente se aparta con su tablero
 * (`formasDeLosTableros`), ni el acantilado, que lleva el hito y su rampa. El
 * bosque está aunque ya no tenga pieza (#196): su paso es justo ese hueco.
 */
export const BARRERAS_CON_PASO_A_LA_VISTA: readonly Barrera[] = ['wall', 'mountain', 'forest'];

/** Los nodos de paso que tienen que verse, con su eje (`BARRERAS_CON_PASO_A_LA_VISTA`). */
export function pasosALaVista(
  map: {
    readonly width: number;
    readonly terrain: readonly TerrainKind[];
    readonly objects: readonly MapObject[];
  },
  puentes: ReadonlySet<string>,
): PasoALaVista[] {
  return map.objects.flatMap((o) => {
    if (o.kind !== 'node' || puentes.has(o.id)) return [];
    if (!BARRERAS_CON_PASO_A_LA_VISTA.includes(o.barrera)) return [];
    return [{ id: o.id, eje: ejeDelPaso(o.at, map.width, map.terrain) }];
  });
}

/**
 * Las barreras cuyo nodo sin camino lleva trocha (#190): un paso de bosque, de
 * montaña o de acantilado sin camino era una manchita de tierra entre árboles o
 * rocas, y de lejos se leía cerrado (defecto 2 de la auditoría de caminos,
 * 08-10-2026: ~4,4 por mapa). La puerta de muralla y el puente se leen solos.
 */
export const BARRERAS_CON_TROCHA: readonly Barrera[] = ['forest', 'mountain', 'cliff'];

/**
 * Lo ancho de la trocha pintada, en casillas (`huella.ts`): menos de la mitad
 * de la senda (`ANCHO_DE_SENDA`), que es un paso y no un camino.
 */
export const ANCHO_DE_TROCHA = 0.15;

/**
 * La media anchura de la trocha que no pisa nada de lo que se aparta del camino
 * (`formaDeLasTrochas`, `colocar.ts`), ni lo bajo: los abetos de 0,6 casillas
 * de la nieve, que no son volumen, la enterraban entera (s1, el paso de bosque
 * (10,5)). La trocha y un arcén de 0,1.
 */
export const SEMIANCHO_DE_LA_TROCHA = ANCHO_DE_TROCHA / 2 + 0.1;

/** Cuánto se tuerce la trocha a un lado de su eje, en casillas: poco, que va dentro del paso. */
export const VAIVEN_DE_TROCHA = 0.07;

/**
 * La trocha de cada nodo de `BARRERAS_CON_TROCHA` al que no llega camino: su
 * eje (`ejeDelPaso`, el que se deja sin volúmenes) en puntos cada cuarto de
 * casilla, torcido `VAIVEN_DE_TROCHA` a un lado y a otro, con los extremos en
 * su sitio. Es solo escena: no abarata el paso ni es un segundo camino de la
 * pareja de regiones (#149), y por eso no va con las sendas ni a su pasillo.
 */
export function trochasDeLosPasos(
  map: {
    readonly width: number;
    readonly terrain: readonly TerrainKind[];
    readonly objects: readonly MapObject[];
    readonly caminos: { readonly tramos: readonly TramoDeCamino[] };
  },
  puentes: ReadonlySet<string>,
  semilla: number,
): (readonly [number, number])[][] {
  const azar = azarDe(semilla * 3371 + 23);
  return map.objects.flatMap((o) => {
    if (o.kind !== 'node' || puentes.has(o.id)) return [];
    if (!BARRERAS_CON_TROCHA.includes(o.barrera)) return [];
    if (pasaElCamino(map.caminos.tramos, o.at)) return [];
    return ejeDelPaso(o.at, map.width, map.terrain).map(([a, b]) => {
      const [x0, y0] = a as readonly [number, number];
      const [x1, y1] = (b ?? a) as readonly [number, number];
      const largo = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(largo / 0.25));
      const fase = azar() * Math.PI * 2;
      const periodo = 1.5 + azar() * 1.5;
      return Array.from({ length: n + 1 }, (_, i): readonly [number, number] => {
        const t = i / n;
        const d =
          Math.sin(fase + ((t * largo) / periodo) * Math.PI) *
          VAIVEN_DE_TROCHA *
          Math.min(1, 4 * t, 4 * (1 - t));
        const nx = largo === 0 ? 0 : -(y1 - y0) / largo;
        const ny = largo === 0 ? 0 : (x1 - x0) / largo;
        return [x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d];
      });
    });
  });
}
