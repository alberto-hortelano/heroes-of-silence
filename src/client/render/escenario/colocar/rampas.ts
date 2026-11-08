/**
 * Las rampas: la que abre la pared donde el camino baja de frente (#225: el cuerpo
 * y un costado a cada lado, o la pieza de la muesca, §36), con su guardia
 * (`rampasSinSusPiezas`), y la de un nodo entre dos niveles sin camino, que baja
 * por su eje (#143: `tramosDeLasRampas`, `nodosSinRampa`).
 */
import type { TramoDeCamino } from '@core/map/red-de-caminos.js';
import type { Analisis, MapaDeEscena } from '../analizar.js';
import {
  type Catalogo,
  esHojaDeRampa,
  formaDeHoja,
  type ModuloDeRampa,
  PIEZAS_DE_LA_FORMA,
  type PiezaDeRampa,
} from '../catalogo.js';
import { type Bajada, FILA_DEL_FILO, type Rampa, TRAMO_DE_PIEZA_DE_RAMPA } from '../celdas.js';
import { ejeDelPaso, pasaElCamino } from '../nodos.js';
import { cajaDeSprite } from '../pasillo.js';
import { ALTO_DE_NIVEL, nodoEntreNiveles } from '../relieve.js';
import {
  COLOR_DE_BAJADA,
  cerca,
  DETRAS_DEL_PIE,
  filoColocado,
  modulosDelRelieve,
  sobreDosPuntos,
} from './relieve.js';
import type { Sprite } from './sprite.js';
import { materialDeCara, tonoDe } from './tablas.js';

/**
 * La hoja de una rampa (#225), sin estirar: `rampa-<material>-<caída>` la recta
 * (§35) y `rampa-muesca-<material>-<caída>` la muesca (§36).
 */
export function hojaDeRampa(r: Pick<Rampa, 'forma' | 'material' | 'caida'>): string {
  const forma = r.forma === 'muesca' ? 'muesca-' : '';
  return `rampa-${forma}${materialDeCara(r.material).nombre}-${r.caida}`;
}

/**
 * Las piezas de una hoja de rampa (las de su forma, `PIEZAS_DE_LA_FORMA`), o null
 * si le falta alguna: sin ellas va la bajada de siempre.
 */
export function piezasDeRampa(
  catalogo: Catalogo,
  hoja: string,
): Readonly<Partial<Record<PiezaDeRampa, ModuloDeRampa>>> | null {
  const ms = catalogo.hojas[hoja];
  if (ms === undefined || !esHojaDeRampa(hoja)) return null;
  const fuera: Partial<Record<PiezaDeRampa, ModuloDeRampa>> = {};
  for (const m of ms) if (m.rampa !== undefined) fuera[m.rampa.pieza] = m as ModuloDeRampa;
  return PIEZAS_DE_LA_FORMA[formaDeHoja(hoja)].every((p) => fuera[p] !== undefined) ? fuera : null;
}

/**
 * Lo que entra en el costado de una rampa la frontal que tapa su extremo de
 * fuera: menos de lo que el costado sigue a su alto entero (0,4, `ENTERO` de la
 * guía, `tools/taller/rampas.ts`), que de ahí baja en diagonal.
 */
export const DENTRO_DEL_COSTADO = 0.3;

/**
 * Lo que se adelanta la clave de un costado de rampa a su pie: lo pintan antes
 * las frontales de su cara, que van a 0,05 ± 0,06 de él y tapan su corte recto.
 */
const COSTADO_DETRAS_DE_LA_FRONTAL = 0.1;

/**
 * Dónde va la pieza `m` de la rampa `r`: los dos extremos de su filo sobre los
 * de su tramo (`TRAMO_DE_PIEZA_DE_RAMPA`), de los que sale la escala. El cuerpo
 * se pinta después de las paredes de su fila, como una bajada; los costados,
 * antes que las frontales de al lado.
 */
export function spriteDeRampa(m: ModuloDeRampa, hoja: string, r: Rampa): Sprite {
  const [a, b] = TRAMO_DE_PIEZA_DE_RAMPA[m.rampa.pieza];
  const filo = r.y + FILA_DEL_FILO[m.rampa.pieza];
  const pie = filo + r.caida * ALTO_DE_NIVEL;
  const [ma, mb] = m.rampa.filo;
  const cuerpo = m.rampa.pieza === 'cuerpo';
  const tono = tonoDe(hoja);
  return {
    ...(tono === undefined ? {} : { tono }),
    ...sobreDosPuntos(
      m,
      [ma, mb],
      [
        [r.x + a, filo],
        [r.x + b, filo],
      ],
      (mb[0] - ma[0]) / (b - a),
      1,
      cuerpo ? pie + DETRAS_DEL_PIE : pie - COSTADO_DETRAS_DE_LA_FRONTAL,
    ),
    clase: 'pared',
    color: cuerpo ? COLOR_DE_BAJADA : '#4c463e',
    capa: 0,
    sombra: !cuerpo,
    filaAlta: r.y,
  };
}

/**
 * Las rampas sin sus piezas, cada una dicha (#225): cada una lleva exactamente
 * una de cada pieza de su forma (`PIEZAS_DE_LA_FORMA`; la recta, un cuerpo y un
 * costado a cada lado; la muesca, la suya) con su filo en su tramo
 * (`TRAMO_DE_PIEZA_DE_RAMPA`, en su fila, `FILA_DEL_FILO`), y ninguna frontal,
 * ladera, diagonal ni bajada de las de siempre tapa su hueco: el punto del medio
 * de la casilla baja a media caída de su filo de detrás. Se reconstruye desde lo
 * puesto.
 */
export function rampasSinSusPiezas(
  sprites: readonly Sprite[],
  rampas: readonly Rampa[],
  catalogo: Catalogo,
): string[] {
  const { rampas: deRampa } = modulosDelRelieve(catalogo);
  const mal: string[] = [];
  for (const r of rampas) {
    const donde = `rampa en ${r.x},${r.y}`;
    for (const p of PIEZAS_DE_LA_FORMA[r.forma]) {
      const [a, b] = TRAMO_DE_PIEZA_DE_RAMPA[p];
      const filo = r.y + FILA_DEL_FILO[p];
      const n = sprites.filter((s) => {
        const m = s.src === null ? undefined : deRampa.get(s.src);
        if (m === undefined || m.rampa.pieza !== p) return false;
        const [fa, fb] = filoColocado(m, s);
        return cerca(fa, [r.x + a, filo]) && cerca(fb, [r.x + b, filo]);
      }).length;
      if (n !== 1) mal.push(`${donde}: ${n} piezas ${p} en su sitio`);
    }
    const hx = r.x + 0.5;
    const hy = r.y + 1 + (r.caida * ALTO_DE_NIVEL) / 2;
    for (const s of sprites) {
      const de = /\/(paredes|laderas|diagonales|bajadas)-/.exec(s.src ?? '')?.[1];
      if (de === undefined) continue;
      const [x0, y0, x1, y1] = cajaDeSprite(s);
      if (x0 < hx && hx < x1 && y0 < hy && hy < y1)
        mal.push(
          `${donde}: ${de === 'paredes' ? 'la frontal' : 'la pieza'} ${s.src} en ${s.x.toFixed(2)} tapa el hueco`,
        );
    }
  }
  return mal;
}

/**
 * Los tramos de la rampa de cada nodo entre dos niveles sin camino (#143): del
 * nodo a cada casilla de su eje que tiene al lado (`ejeDelPaso`), como si
 * fueran de camino. `bajadasDe` se queda con los que cruzan una pared hacia la
 * cámara o de lado. Ni los puentes, que son su propio paso, ni los nodos con
 * camino, cuya bajada ya sale de él.
 */
export function tramosDeLasRampas(map: MapaDeEscena, a: Analisis): TramoDeCamino[] {
  return a.red.nodos.flatMap((n) => {
    if (n.clase === 'ciudad' || a.puentes.has(n.id) || !nodoEntreNiveles(a, n.regiones)) return [];
    if (pasaElCamino(map.caminos.tramos, n.at)) return [];
    return ejeDelPaso(n.at, a.W, map.terrain).flatMap((linea) =>
      linea.flatMap(([px, py]): TramoDeCamino[] => {
        const dx = Math.sign(Math.floor(px) - n.at.x);
        const dy = Math.sign(Math.floor(py) - n.at.y);
        if (dx === 0 && dy === 0) return [];
        return [[n.at, { x: n.at.x + dx, y: n.at.y + dy }]];
      }),
    );
  });
}

/**
 * Los nodos entre dos niveles sin camino que no llevan la rampa de una bajada
 * (#143), por su id: ninguna bajada sale ni llega a su casilla, y alguna
 * casilla de su eje a otro nivel bajaría hacia la cámara o de lado (la que baja
 * al norte va de espaldas y su pared no se ve). Si ninguna casilla de su eje
 * está a otro nivel, el eje no cruza el desnivel y también cuenta. Los nodos
 * con camino, y las ciudades, bajan por el camino (`bajadasSinPieza`).
 */
export function nodosSinRampa(
  map: MapaDeEscena,
  a: Analisis,
  nivel: ArrayLike<number>,
  bajadas: readonly Bajada[],
): string[] {
  const tramos = tramosDeLasRampas(map, a);
  const N = (p: { x: number; y: number }) => nivel[p.y * a.W + p.x] as number;
  return a.red.nodos.flatMap((n) => {
    if (n.clase === 'ciudad' || a.puentes.has(n.id) || !nodoEntreNiveles(a, n.regiones)) return [];
    if (pasaElCamino(map.caminos.tramos, n.at)) return [];
    const enSuCasilla = ([x, y]: readonly [number, number]) => x === n.at.x && y === n.at.y;
    if (bajadas.some((b) => enSuCasilla(b.alto) || enSuCasilla(b.bajo))) return [];
    const cruzan = tramos.filter(([p, q]) => enSuCasilla([p.x, p.y]) && N(q) !== N(p));
    // De la casilla alta a la baja: si baja al norte (dy < 0), de espaldas.
    const deEspaldas = ([p, q]: (typeof cruzan)[number]) =>
      (N(p) > N(q) ? q.y - p.y : p.y - q.y) < 0;
    return cruzan.length > 0 && cruzan.every(deEspaldas) ? [] : [n.id];
  });
}
