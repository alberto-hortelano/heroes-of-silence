/**
 * Los pasos y los puentes en la escena: el eje de cada paso como obstáculo
 * (`formaDeLosPasos`, #173) y lo que lo tapa o lo atraviesa, las sendas que no
 * llegan a un pueblo por su puerta (#188), lo que tapa el tablero de un puente,
 * contado desde el orden del pintor (#157), y las paredes del relieve que no llevan
 * pieza bajo un puente (`celdasBajoLosPuentes`).
 */
import { cruzaSuBarrera } from '@core/map/map.js';
import { puertaDe } from '@core/map/puertas.js';
import { esBarrera, type TerrainKind } from '@core/map/terrain.js';
import type { MapObject } from '@core/map/tipos.js';
import { type Celda, claveDeCelda, esVisto, filosDe } from '../celdas.js';
import type { PasoALaVista } from '../nodos.js';
import { cajaDeSprite, type Forma, type Medida, pasilloDe } from '../pasillo.js';
import { esVolumen, separar } from '../pintar.js';
import type { Puente } from '../puentes.js';
import { esObra } from '../puestos.js';
import { SEMIANCHO_DEL_PASILLO_DE_MASA } from '../sendas.js';
import type { Medible } from './sendas-y-murallas.js';
import type { Sprite } from './sprite.js';
import { APARTE } from './tablas.js';

/**
 * La media anchura del eje de un nodo de paso que no pisa ningún volumen: la
 * del pasillo de las masas, para que el collado se lea como el hueco que abre
 * una senda en una cordillera (#173).
 */
export const SEMIANCHO_DEL_PASO = SEMIANCHO_DEL_PASILLO_DE_MASA;

const MEDIDA_DEL_PASO: Medida = { radio: SEMIANCHO_DEL_PASO, soloElPie: false };

/**
 * Los ejes de los nodos de paso (`pasosALaVista`) como obstáculo: ningún
 * volumen de lo que se aparta los pisa. Lo bajo no cuenta: va al suelo, debajo
 * de todo, y no tapa el collado; quitarlo también dejaba una franja recta y
 * pelada donde no hay camino. Así, la masa, que siempre es volumen, se encoge
 * hasta salir, y lo demás puede quedarse en el umbral del volumen, como suelo.
 */
export function formaDeLosPasos(pasos: readonly PasoALaVista[]): Forma<Medible> {
  return {
    trazos: pasos.flatMap((p) => p.eje),
    alcance: SEMIANCHO_DEL_PASO,
    mide: (s, alto) =>
      APARTE[s.clase] !== null && esVolumen({ clase: s.clase, alto, plano: s.plano })
        ? MEDIDA_DEL_PASO
        : null,
  };
}

/**
 * Los nodos de paso cuyo eje pisa el rectángulo de un volumen de una clase que
 * se aparta (`APARTE`), medido desde lo puesto y con un pasillo por nodo: no
 * pregunta a la puerta (`formaDeLosPasos`), así que si se equivoca, esto lo ve. No
 * cuentan los muros y las paredes, que no se apartan de nada, ni lo horneado;
 * sí las obras de los puestos (`esObra`).
 */
export function pasosTapados(
  sprites: readonly Sprite[],
  pasos: readonly PasoALaVista[],
): PasoALaVista[] {
  // Con las obras de los puestos, que no se apartan: se les busca sitio fuera.
  const volumenes = sprites.filter(
    (s) => (APARTE[s.clase] !== null || esObra(s)) && s.capa === 0 && esVolumen(s),
  );
  return pasos.filter((p) => {
    const eje = pasilloDe(p.eje, SEMIANCHO_DEL_PASO);
    return volumenes.some((s) => eje.pisa(s));
  });
}

/**
 * Los nodos de paso de montaña o de bosque cuya propia pieza, la que no es un
 * hito, pisa su eje (#203): la del paso de montaña era un par de picos con la
 * garganta de norte a sur, y en 21 de 23 nodos de la auditoría 4 el camino
 * llegaba de lado y se metía bajo la roca. `pasosTapados` no lo veía:
 * mira lo que se aparta, y la pieza es el objeto. La puerta de muralla no
 * cuenta, que se cruza por ella, ni el pueblo en el muro (pueblos en un nodo,
 * fase 3), que va en el paso y la senda lo cruza; las obras de su puesto
 * (`esObra`), que son piezas suyas, sí, también en el paso de la muralla. Tiene
 * que ser 0.
 */
export function pasosAtravesados(
  sprites: readonly Sprite[],
  pasos: readonly PasoALaVista[],
): PasoALaVista[] {
  return pasos.filter((p) => {
    const eje = pasilloDe(p.eje, SEMIANCHO_DEL_PASO);
    return sprites.some(
      (s) =>
        ((p.barrera !== 'wall' &&
          s.objeto?.id === p.id &&
          s.objeto.kind !== 'village' &&
          s.deNodo === undefined) ||
          (esObra(s) && s.deNodo.id === p.id)) &&
        eje.pisa(s),
    );
  });
}

/**
 * Los pueblos a los que la senda no llega como en el HoMM (#188): con un solo
 * tramo, que sale de su puerta (`puertaDe`: la casilla de debajo). Si no se
 * pisa o cae fuera del mapa, vale cualquier tramo, pero uno. Se mide
 * sobre los tramos que se pintan, de centro a centro de casilla, no sobre el
 * plan: si el trazado se equivoca, esto lo ve. El pueblo en el muro (pueblos en
 * un nodo, fase 3) no cuenta: no tiene puerta y la senda lo cruza por su eje,
 * como un paso.
 */
export function sendasPorObjeto(
  caminos: readonly (readonly [number, number, number, number])[],
  objetos: readonly MapObject[],
  terreno: readonly TerrainKind[],
  W: number,
  H: number,
): MapObject[] {
  return objetos.filter((o) => {
    // El pueblo del muro no tiene puerta (`puertaDe`), pero no se salta por eso:
    // el de dentro sin puerta (al borde) también pide un solo tramo.
    if (o.kind !== 'village' || cruzaSuBarrera(o)) return false;
    const cx = o.at.x + 0.5;
    const cy = o.at.y + 0.5;
    const llegan = caminos.flatMap(([x0, y0, x1, y1]) =>
      x0 === cx && y0 === cy ? [[x1, y1]] : x1 === cx && y1 === cy ? [[x0, y0]] : [],
    );
    if (llegan.length !== 1) return true;
    const puerta = puertaDe(o, W, H);
    if (puerta === null || esBarrera(terreno[puerta.y * W + puerta.x] as TerrainKind)) return false;
    const [x, y] = llegan[0] as number[];
    return x !== puerta.x + 0.5 || y !== puerta.y + 0.5;
  });
}

/** Cada cuánto se mira el tablero, en casillas, para ver si algo lo tapa. */
export const PASO_POR_EL_TABLERO = 0.05;

/**
 * Lo que tapa el tablero de algún puente, medido desde lo pintado y no desde la
 * puerta: cada volumen que `separar` pone después del sprite del puente (y se
 * pinta encima) cuyo rectángulo cubre algún punto de la línea de su tablero,
 * mirada cada `PASO_POR_EL_TABLERO`. No pregunta a `vaDelante` ni al pasillo:
 * si la regla de profundidad de la puerta se equivoca, esto lo ve (#157).
 *
 * Cuenta lo que esa puerta gobierna: lo que se aparta del camino (`APARTE`) y
 * la pared (paredes, laderas, peñascos y pedregal), y las obras de los puestos
 * (`esObra`), a las que se busca sitio fuera. No cuentan lo horneado (la
 * clase `objeto`) ni los muros de murallas y ruinas, que no se apartan de nada
 * y se colocan antes (`docs/historia.md`). Tampoco las caras de roca, que van
 * con el suelo, debajo de todos los volúmenes.
 */
export function puentesTapados(
  sprites: readonly Sprite[],
  puentes: readonly Pick<Puente, 'id' | 'tablero'>[],
): Sprite[] {
  const { volumenes } = separar({ sprites });
  const tapan = new Set<Sprite>();
  for (const pu of puentes) {
    const k = volumenes.findIndex((v) => v.s.puente === pu.id);
    if (k < 0) throw new Error(`el puente ${pu.id} no está entre los volúmenes de la escena`);
    const puntos = pu.tablero.slice(1).flatMap((q, i) => {
      const p = pu.tablero[i] as readonly [number, number];
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / PASO_POR_EL_TABLERO));
      return Array.from({ length: n + 1 }, (_, j): readonly [number, number] => [
        p[0] + ((q[0] - p[0]) * j) / n,
        p[1] + ((q[1] - p[1]) * j) / n,
      ]);
    });
    const xs = puntos.map(([x]) => x);
    const ys = puntos.map(([, y]) => y);
    const [tx0, ty0, tx1, ty1] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    for (const { s } of volumenes.slice(k + 1)) {
      if ((s.clase === 'objeto' && !esObra(s)) || s.clase === 'muro') continue;
      const [x0, y0, x1, y1] = cajaDeSprite(s);
      if (x0 > tx1 || x1 < tx0 || y0 > ty1 || y1 < ty0) continue;
      if (puntos.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) tapan.add(s);
    }
  }
  return [...tapan];
}

/**
 * Si los tramos `a → b` y `c → d` se cortan; con `porDentro`, solo si `a` y `b`
 * caen a lados opuestos de la recta de `c → d`, no en ella.
 */
function seCortan(
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
  [cx, cy]: readonly [number, number],
  [dx, dy]: readonly [number, number],
  porDentro = false,
): boolean {
  const lado = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const ab = lado(cx, cy, dx, dy, ax, ay) * lado(cx, cy, dx, dy, bx, by);
  return (
    lado(ax, ay, bx, by, cx, cy) * lado(ax, ay, bx, by, dx, dy) <= 0 &&
    (porDentro ? ab < 0 : ab <= 0)
  );
}

/**
 * Las paredes que cruza un puente, de estribo a estribo, como `claveDeCelda`:
 * no llevan pieza, que la tapa su estribo y bajo el tablero se ve el agua. Es lo
 * que antes abría un tajo en la cara (`cortes`).
 *
 * Con `porDentro`, solo las que cruza por dentro de su filo. Las que solo toca
 * en una punta —la junta de dos paredes, donde cae todo puente de norte a sur
 * o de este a oeste, por el centro de su casilla— sí llevan pieza (#222), por
 * detrás del puente: con las dos de la junta fuera, la cara acababa a media
 * casilla del tablero (s30 (21, 20)).
 */
export function celdasBajoLosPuentes(
  cs: readonly Celda[],
  puentes: readonly Pick<Puente, 'extremos'>[],
  porDentro = false,
): Set<string> {
  const fuera = new Set<string>();
  for (const c of cs) {
    if (!esVisto(c.tipo)) continue;
    const [fa, fb] = filosDe(c);
    for (const { extremos } of puentes)
      if (seCortan(fa, fb, extremos[0], extremos[1], porDentro)) fuera.add(claveDeCelda(c));
  }
  return fuera;
}
