/**
 * El clima: el tiempo (despejado, niebla, lluvia, tormenta) y la noche de cada
 * región, cada día. **Es presentación**: ninguna regla lo mira (ni la vista, ni
 * el tiro, ni la marcha). Lo pintan el mapa, la batalla y las escenas laterales,
 * y vive en `core` y no en el cliente porque lo que pide el narrador se guarda en
 * el estado y porque el «mapa vivo» quiere leer la noche desde las reglas de sus
 * lugares («un comerciante que solo sale de noche», `esDeNocheEn` y `climaEn`).
 *
 * Dos fuentes, una sola lectura por región (`climaDeHoy`, que leen
 * `climaDeLaPartida` para todas y `climaEn` para una):
 *
 * - **La semilla**, sin agente o donde no pide nada: una función pura de la
 *   semilla, el día y la región, en enteros y con **su propia corriente**
 *   (`createRng(hashDeTexto(…))`, como las voces de respaldo de la base): no
 *   consume ni una tirada de la partida, así que `pnpm banco` no la ve. El
 *   tiempo va en cadena —un tiempo general del día que sigue el de ayer con
 *   `seguir` ‰, y cada región que se aparta con `desvio` ‰—, y así salen rachas
 *   y pocos frentes, no un mosaico. La noche, también en cadena, con el peso de
 *   la facción del dueño de la región ahora (los no muertos, mucho más a menudo:
 *   decisión del usuario del 22-10-2026). **Con el dueño de ahora**: tomar una
 *   región cambia su cadena, y a veces su noche, en el acto, a media jornada
 *   (medido en 1-40, 10 regiones y días 1-15: el 10,9 % de las tomas, y el 44 %
 *   si la toma un no muerto). Se acepta: «cae la noche cuando llegan los no
 *   muertos» es lo que pidió el usuario, y fijar el dueño al empezar el día
 *   pediría guardar estado solo para eso (H3 del QA del clima, 22-10-2026).
 * - **El narrador** (`pedirClima`, el único que escribe `GameState.climaPedido`),
 *   por región y por días, como las voces de la base: ni crónica ni banco. Lo
 *   pedido se lee solo por `pedidoVigente`, que sabe cuándo caduca.
 *
 * Las cifras, inventadas, en `data/clima.json`, que solo importa este módulo.
 */
import climaJson from '../../../data/clima.json' with { type: 'json' };
import { enteroDesde } from '../data.js';
import { inBounds } from '../map/map.js';
import {
  dueñoDeLaRegion,
  dueñosDeLasRegiones,
  estructura,
  laMasCercana,
  type MapaDeRed,
} from '../map/regiones.js';
import { createRng, hashDeTexto, sortearPorPesos } from '../rng.js';
import { FACTION_IDS, type FactionId, type PlayerId, type Point } from '../types.js';
import { esIdDeMapa } from '../validar.js';
import { type GameState, lugarDelRival, type PendingBattle, playerById } from './game.js';

/** Los tiempos que hay, del más claro al más cerrado. Un clima nuevo es una fila más aquí y en las recetas del cliente. */
export const TIEMPOS = ['despejado', 'niebla', 'lluvia', 'tormenta'] as const;
export type Tiempo = (typeof TIEMPOS)[number];

export function esTiempo(texto: string): texto is Tiempo {
  return (TIEMPOS as readonly string[]).includes(texto);
}

/** El clima de un sitio: su tiempo y si es de noche. */
export interface ClimaDelSitio {
  readonly tiempo: Tiempo;
  readonly noche: boolean;
}

export const DESPEJADO: ClimaDelSitio = { tiempo: 'despejado', noche: false };

/** El clima de toda la partida hoy: el de cada región, en el orden de `map.regions`. */
export interface ClimaDeLaPartida {
  readonly regiones: readonly ClimaDelSitio[];
}

/** Lo que se pone encima del clima de un sitio: el tiempo, la noche o los dos. */
export interface ClimaForzadoDelSitio {
  readonly tiempo?: Tiempo;
  readonly noche?: boolean;
}

/**
 * Lo que el narrador pidió para una región: su tiempo, su noche o los dos, hasta
 * el día `hasta` incluido. Lo que no pide sale de la semilla.
 */
export interface PedidoDeClima extends ClimaForzadoDelSitio {
  readonly hasta: number;
}

// ------------------------------------------------------------------ los datos

/** Quién manda en la noche de una región: la facción de su dueño, o nadie. */
export type DueñoDelClima = FactionId | 'neutral';

/** Lo que se lee de `data/clima.json`. */
export interface ReglasDelClima {
  readonly tiempo: {
    readonly pesos: Readonly<Record<Tiempo, number>>;
    readonly seguir: number;
    readonly desvio: number;
  };
  readonly noche: {
    readonly pesos: Readonly<Record<DueñoDelClima, number>>;
    readonly seguir: number;
  };
  readonly diasMaximos: number;
  readonly porTurno: number;
}

const DUEÑOS: readonly DueñoDelClima[] = ['neutral', ...FACTION_IDS];

/**
 * Valida `data/clima.json` (**inventado**, como dice su `_comment`). Lanza con
 * todos los problemas a la vez; con el JSON de argumento para ver morder al
 * guardia con un fichero roto.
 */
export function validarClima(json: unknown, fichero = 'data/clima.json'): ReglasDelClima {
  const problemas: string[] = [];
  const objeto = (v: unknown, donde: string): Record<string, unknown> => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      problemas.push(`${donde} tiene que ser un objeto, y es ${JSON.stringify(v)}`);
      return {};
    }
    return v as Record<string, unknown>;
  };
  const sobran = (o: Record<string, unknown>, donde: string, valen: readonly string[]): void => {
    for (const k of Object.keys(o)) {
      if (!valen.includes(k)) problemas.push(`${donde} trae "${k}", que sobra`);
    }
  };
  const milesima = (o: Record<string, unknown>, clave: string, donde: string): number => {
    const v = o[clave];
    if (!enteroDesde(v, 0) || v > 1000) {
      problemas.push(
        `"${donde}${clave}" es en ‰: un entero de 0 a 1000, y lleva ${JSON.stringify(v)}`,
      );
      return 0;
    }
    return v;
  };
  const pesos = <K extends string>(
    o: Record<string, unknown>,
    donde: string,
    claves: readonly K[],
  ): Record<K, number> => {
    sobran(o, `"${donde}"`, claves);
    const r = {} as Record<K, number>;
    for (const k of claves) r[k] = milesima(o, k, `${donde}.`);
    return r;
  };

  const raiz = objeto(json, 'el fichero');
  sobran(raiz, 'el fichero', ['_comment', 'tiempo', 'noche', 'diasMaximos', 'porTurno']);
  const t = objeto(raiz.tiempo, '"tiempo"');
  sobran(t, '"tiempo"', ['pesos', 'seguir', 'desvio']);
  const pesosDelTiempo = pesos(objeto(t.pesos, '"tiempo.pesos"'), 'tiempo.pesos', TIEMPOS);
  if (TIEMPOS.every((k) => pesosDelTiempo[k] === 0))
    problemas.push('"tiempo.pesos" pesan todos 0: no habría tiempo que sortear');
  const n = objeto(raiz.noche, '"noche"');
  sobran(n, '"noche"', ['pesos', 'seguir']);
  const entero = (clave: string, desde: number, hasta: number): number => {
    const v = raiz[clave];
    if (!enteroDesde(v, desde) || v > hasta) {
      problemas.push(
        `"${clave}" tiene que ser un entero de ${desde} a ${hasta}, y lleva ${JSON.stringify(v)}`,
      );
      return desde;
    }
    return v;
  };
  const reglas: ReglasDelClima = {
    tiempo: {
      pesos: pesosDelTiempo,
      seguir: milesima(t, 'seguir', 'tiempo.'),
      desvio: milesima(t, 'desvio', 'tiempo.'),
    },
    noche: {
      pesos: pesos(objeto(n.pesos, '"noche.pesos"'), 'noche.pesos', DUEÑOS),
      seguir: milesima(n, 'seguir', 'noche.'),
    },
    diasMaximos: entero('diasMaximos', 1, 30),
    porTurno: entero('porTurno', 1, 32),
  };
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return reglas;
}

export const CLIMA: ReglasDelClima = validarClima(climaJson);

// ------------------------------------------------------------- la semilla

const sortearTiempo = (rng: ReturnType<typeof createRng>): Tiempo =>
  sortearPorPesos(rng, TIEMPOS, (t) => CLIMA.tiempo.pesos[t]);

/**
 * Lo hecho de las cadenas de UNA semilla: al preguntar por otra se tira todo.
 * Una página juega una partida y el servidor también, así que la memoria no
 * crece con el tiempo; los tests que recorren cuarenta semillas rehacen cada una
 * al pasar, que es lo que ya hacían la primera vez.
 */
let cadenas: {
  readonly semilla: number;
  readonly generales: Map<string, Tiempo[]>;
  readonly regionales: Map<string, { tiempo: Tiempo; aparte: boolean }[]>;
  readonly noches: Map<string, boolean[]>;
} | null = null;

function cadenasDe(semilla: number): NonNullable<typeof cadenas> {
  if (cadenas?.semilla !== semilla) {
    cadenas = { semilla, generales: new Map(), regionales: new Map(), noches: new Map() };
  }
  return cadenas;
}

/**
 * Una cadena por días memorizada: el valor del día `d` sale del de `d − 1` y de
 * una tirada propia del día. Se itera desde el día 1 y se guarda lo hecho, así
 * que preguntar el día 40 no recorre 40 días cada vez.
 */
function cadena<T>(
  memo: Map<string, T[]>,
  clave: string,
  dia: number,
  paso: (d: number, ayer: T | null) => T,
): T {
  if (!Number.isSafeInteger(dia) || dia < 1)
    throw new Error(`el día ${dia} no existe: empiezan en el 1`);
  let hechos = memo.get(clave);
  if (hechos === undefined) {
    hechos = [];
    memo.set(clave, hechos);
  }
  while (hechos.length < dia) {
    const d = hechos.length + 1;
    hechos.push(paso(d, d === 1 ? null : (hechos[d - 2] as T)));
  }
  return hechos[dia - 1] as T;
}

/** El tiempo general del día `dia` en la partida de `seed`: el de ayer con `seguir` ‰, si no uno sorteado. */
function tiempoGeneral(seed: number, dia: number): Tiempo {
  return cadena(cadenasDe(seed).generales, '', dia, (d, ayer) => {
    const rng = createRng(hashDeTexto(`clima|${seed}|${d}`));
    if (ayer !== null && rng.int(1, 1000) <= CLIMA.tiempo.seguir) return ayer;
    return sortearTiempo(rng);
  });
}

/**
 * El tiempo de la semilla en una región: el general del día, salvo cuando la
 * región se aparta (`desvio` ‰) con una tirada suya. Apartada, sigue apartada al
 * día siguiente con `seguir` ‰: un frente dura unos días y no parpadea.
 */
export function tiempoDeLaSemilla(seed: number, dia: number, region: string): Tiempo {
  return cadena(cadenasDe(seed).regionales, region, dia, (d, ayer) => {
    const rng = createRng(hashDeTexto(`clima|${seed}|${d}|${region}`));
    if (ayer?.aparte === true && rng.int(1, 1000) <= CLIMA.tiempo.seguir) return ayer;
    if (rng.int(1, 1000) <= CLIMA.tiempo.desvio)
      return { tiempo: sortearTiempo(rng), aparte: true };
    return { tiempo: tiempoGeneral(seed, d), aparte: false };
  }).tiempo;
}

/**
 * Si es de noche en una región según la semilla, con el peso de quien manda en
 * ella: la noche de ayer con `seguir` ‰ y, si no, una tirada con su peso. Es una
 * cadena con el peso de AHORA: si cambia el dueño, cambia la cadena entera, y
 * sigue siendo una función pura de la semilla, el día, la región y el dueño.
 */
export function nocheDeLaSemilla(
  seed: number,
  dia: number,
  region: string,
  dueño: DueñoDelClima,
): boolean {
  const peso = CLIMA.noche.pesos[dueño];
  return cadena(cadenasDe(seed).noches, `${region}|${peso}`, dia, (d, ayer) => {
    const rng = createRng(hashDeTexto(`noche|${seed}|${d}|${region}`));
    if (ayer !== null && rng.int(1, 1000) <= CLIMA.noche.seguir) return ayer;
    return rng.int(1, 1000) <= peso;
  });
}

// ----------------------------------------------------------- las regiones

const regionesDelClima = new WeakMap<MapaDeRed, Int32Array>();

/**
 * La región del clima de cada casilla (índice `y*width+x`, en `map.regions`): la
 * de `estructura` y, en las barreras, los nodos y los recintos, la de la región
 * más cercana (`laMasCercana`). Así cada frente cae en una cordillera o un río y
 * una ciudad, que es un nodo, tiene el tiempo de alrededor. −1 solo en un mapa
 * sin regiones.
 */
export function regionDelClima(map: MapaDeRed): Int32Array {
  const hecha = regionesDelClima.get(map);
  if (hecha !== undefined) return hecha;
  const region = laMasCercana(estructura(map).regionDe, map.width, map.height);
  regionesDelClima.set(map, region);
  return region;
}

/** La región del clima de la casilla `p`, por su índice en `map.regions` (−1 en un mapa sin regiones). Lanza fuera del mapa. */
export function regionDelSitio(map: MapaDeRed, p: Point): number {
  if (!inBounds(map, p)) throw new Error(`(${p.x},${p.y}) está fuera del mapa: no tiene clima`);
  return regionDelClima(map)[p.y * map.width + p.x] as number;
}

/** El clima de la región `k` del clima de la partida, o el despejado sin región (−1). */
export function climaDeLaRegion(clima: ClimaDeLaPartida, k: number): ClimaDelSitio {
  return k < 0 ? DESPEJADO : (clima.regiones[k] ?? DESPEJADO);
}

/** El clima de la casilla `p` (la región del clima que le toca), o el despejado en un mapa sin regiones. */
export function climaDelSitio(clima: ClimaDeLaPartida, map: MapaDeRed, p: Point): ClimaDelSitio {
  return climaDeLaRegion(clima, regionDelSitio(map, p));
}

// -------------------------------------------------------------- la partida

/**
 * Lo pedido que sigue en vigor hoy en una región, o `undefined`: la **única**
 * lectura de `GameState.climaPedido` (la caducidad, en un sitio).
 */
export function pedidoVigente(state: GameState, region: string): PedidoDeClima | undefined {
  const p = state.climaPedido?.[region];
  return p !== undefined && p.hasta >= state.day ? p : undefined;
}

const faccionDe = (state: GameState, dueño: PlayerId | null): DueñoDelClima =>
  dueño === null ? 'neutral' : playerById(state, dueño).faction;

/** El clima de hoy de la región `k`: lo pedido en vigor y, en lo demás, la semilla con la noche de su dueño. */
function climaDeHoy(state: GameState, k: number, dueño: DueñoDelClima): ClimaDelSitio {
  const reg = state.map.regions[k];
  if (reg === undefined) throw new Error(`este mapa no tiene región ${k}`);
  const pedido = pedidoVigente(state, reg.id);
  return {
    tiempo: pedido?.tiempo ?? tiempoDeLaSemilla(state.seed, state.day, reg.id),
    noche: pedido?.noche ?? nocheDeLaSemilla(state.seed, state.day, reg.id, dueño),
  };
}

/**
 * Lo último hecho de cada partida, con lo que lo cambia: el día, lo pedido (que
 * `pedirClima` sustituye entero, así que basta mirar si es el mismo objeto) y la
 * facción del dueño de cada región. Lo preguntan cada fotograma la página y cada
 * mensaje el servidor (la petición al agente y la vista del espectador), y la
 * cuenta de las noches no cambia casi nunca.
 */
const hechos = new WeakMap<
  GameState,
  {
    readonly dia: number;
    readonly pedido: GameState['climaPedido'];
    readonly dueños: string;
    readonly clima: ClimaDeLaPartida;
  }
>();

/**
 * El clima de cada región hoy: lo que pidió el narrador y siga en vigor y, en lo
 * demás, el de la semilla. La noche, con el dueño de ahora de cada región.
 */
export function climaDeLaPartida(state: GameState): ClimaDeLaPartida {
  const dueños = (state.map.regions.length === 0 ? [] : dueñosDeLasRegiones(state)).map((d) =>
    faccionDe(state, d),
  );
  const firma = dueños.join(',');
  const hecho = hechos.get(state);
  if (
    hecho !== undefined &&
    hecho.dia === state.day &&
    hecho.pedido === state.climaPedido &&
    hecho.dueños === firma
  ) {
    return hecho.clima;
  }
  const clima: ClimaDeLaPartida = {
    regiones: state.map.regions.map((_, k) => climaDeHoy(state, k, dueños[k] ?? 'neutral')),
  };
  hechos.set(state, { dia: state.day, pedido: state.climaPedido, dueños: firma, clima });
  return clima;
}

/**
 * El clima de hoy en la casilla `p`, sin hacer el de todo el mapa: solo su
 * región, con el dueño de esa región (`dueñoDeLaRegion`). Lo que lee una regla
 * de `core` sobre un sitio (el «mapa vivo»). En un mapa sin regiones, el
 * despejado; fuera del mapa, lanza.
 */
export function climaEn(state: GameState, p: Point): ClimaDelSitio {
  const k = regionDelSitio(state.map, p);
  if (k < 0) return DESPEJADO;
  return climaDeHoy(state, k, faccionDe(state, dueñoDeLaRegion(state, k)));
}

/**
 * Si es de noche hoy en la región `regionId`: lo que lee `core` (el «mapa vivo»
 * y sus lugares). Lanza con una región que no es del mapa.
 */
export function esDeNocheEn(state: GameState, regionId: string): boolean {
  const k = state.map.regions.findIndex((r) => r.id === regionId);
  if (k < 0) {
    throw new Error(
      `en este mapa no hay "${regionId}": hay ${state.map.regions.map((r) => r.id).join(', ')}`,
    );
  }
  return climaDeHoy(state, k, faccionDe(state, dueñoDeLaRegion(state, k))).noche;
}

/**
 * La región del clima donde se pelea una batalla del mapa: la del sitio de lo
 * atacado (`lugarDelRival`, la casilla del defensor). Es lo que viaja al
 * espectador (`VistaBatalla.region`), que saca de ahí el clima de su tablero.
 */
export function regionDeLaBatalla(state: GameState, pending: PendingBattle): number {
  return regionDelSitio(state.map, lugarDelRival(state, pending.foe));
}

/** El clima que hereda una batalla del mapa: el de la región donde se pelea, con `clima` (lo forzado encima, si lo hay). */
export function climaDeLaBatalla(
  state: GameState,
  clima: ClimaDeLaPartida,
  pending: PendingBattle,
): ClimaDelSitio {
  return climaDeLaRegion(clima, regionDeLaBatalla(state, pending));
}

// --------------------------------------------------------------- el narrador

/**
 * Una entrada de `weather` tal como la manda el narrador: **sin tipar**. El
 * esquema del contrato no la mira (una entrada mal escrita tumbaba el turno
 * entero, H1 de la vuelta de QA del 22-10-2026); la juzga `climaBlocker`, campo
 * a campo, y la que no vale se descarta sola con su motivo.
 */
export type EntradaDeClima = unknown;

/** Una entrada que `climaBlocker` dio por buena, ya con sus tipos. */
interface PedidoLeido {
  readonly at: Point;
  readonly weather?: Tiempo;
  readonly night?: boolean;
  readonly days?: number;
}

/** Lo que entró, por región, para contarlo en el veredicto. */
export interface ClimaAceptado extends PedidoDeClima {
  readonly region: string;
  readonly nombre: string;
}

export interface ClimaPuesto {
  readonly aceptados: readonly ClimaAceptado[];
  /** Cada pedido que no entró, con su motivo para la persona. */
  readonly rechazos: readonly string[];
}

/**
 * Cuántas entradas de `weather` se miran en una respuesta: las de después se
 * descartan juntas, diciéndolo, sin mirarlas (un veredicto de mil líneas no lo
 * lee nadie). Es el tope que tenía el esquema, que tumbaba el turno.
 */
export const PEDIDOS_QUE_SE_MIRAN = 16;

/** Lo que mandó el narrador, dicho corto: un texto suyo no llena el veredicto. */
function dicho(v: unknown): string {
  const t = JSON.stringify(v) ?? String(v);
  return t.length <= 40 ? t : `${t.slice(0, 39)}…`;
}

const esPunto = (v: unknown): v is Point =>
  typeof v === 'object' &&
  v !== null &&
  Number.isSafeInteger((v as { x?: unknown }).x) &&
  Number.isSafeInteger((v as { y?: unknown }).y);

/**
 * Por qué no se puede pedir esa entrada de clima, o `null` si se puede: la forma
 * (un objeto con `at`, y `weather`, `night` y `days` de su tipo) y lo que dice
 * (una casilla del mapa, un tiempo que existe, días dentro del tope). No mira
 * cuántos van ni si la región se repite: eso es de `pedirClima`.
 */
export function climaBlocker(state: GameState, entrada: EntradaDeClima): string | null {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    return `cada pedido es un objeto { "at", "weather", "night", "days" }, y llega ${dicho(entrada)}`;
  }
  const { at, weather, night, days } = entrada as Record<string, unknown>;
  if (!esPunto(at)) {
    return `"at" es una casilla { "x": N, "y": N } con dos enteros, y llega ${dicho(at)}`;
  }
  if (!inBounds(state.map, at)) return `(${at.x},${at.y}) está fuera del mapa`;
  if (state.map.regions.length === 0) return 'este mapa no tiene regiones: no hay clima que pedir';
  if (weather === undefined && night === undefined) {
    return 'no pide nada: lleva "weather", "night" o los dos';
  }
  if (weather !== undefined && (typeof weather !== 'string' || !esTiempo(weather))) {
    return `${dicho(weather)} no es un tiempo: valen ${TIEMPOS.join(', ')}`;
  }
  if (night !== undefined && typeof night !== 'boolean') {
    return `"night" va true o false, y llega ${dicho(night)}`;
  }
  if (
    days !== undefined &&
    (typeof days !== 'number' ||
      !Number.isSafeInteger(days) ||
      days < 1 ||
      days > CLIMA.diasMaximos)
  ) {
    return `days ${dicho(days)}: un entero de 1 a ${CLIMA.diasMaximos} días`;
  }
  return null;
}

/** Dónde dice el veredicto que cae una entrada: su casilla, si la trae, o su puesto. */
function dondeDe(entrada: EntradaDeClima, n: number): string {
  const at =
    typeof entrada === 'object' && entrada !== null ? (entrada as { at?: unknown }).at : undefined;
  return esPunto(at) ? `(${at.x},${at.y})` : `n.º ${n + 1}`;
}

/**
 * Pone el clima que pide el narrador. Es el **único** que escribe
 * `GameState.climaPedido`.
 *
 * Cada entrada se juzga sola (`climaBlocker`): una mala se rechaza con su motivo
 * sin tirar las demás ni el turno. Un pedido cubre la región de su casilla desde
 * hoy y `days` días (1 si no lo dice) y sustituye entero al que esa región
 * tuviera: lo que no pide (el tiempo o la noche) vuelve a salir de la semilla.
 * Entran como mucho `porTurno` por turno y una vez cada región, y se miran las
 * `PEDIDOS_QUE_SE_MIRAN` primeras. Lo caducado se borra.
 */
export function pedirClima(state: GameState, _player: PlayerId, entradas: unknown): ClimaPuesto {
  const vigente: Record<string, PedidoDeClima> = {};
  for (const reg of state.map.regions) {
    const p = pedidoVigente(state, reg.id);
    if (p !== undefined) vigente[reg.id] = p;
  }
  const aceptados: ClimaAceptado[] = [];
  const rechazos: string[] = [];
  const lista = Array.isArray(entradas) ? (entradas as readonly unknown[]) : null;
  if (lista === null) {
    rechazos.push(`es una lista de pedidos [ { "at", "weather", … } ], y llega ${dicho(entradas)}`);
  }
  for (const [n, entrada] of (lista ?? []).slice(0, PEDIDOS_QUE_SE_MIRAN).entries()) {
    const donde = dondeDe(entrada, n);
    const motivo = climaBlocker(state, entrada);
    if (motivo !== null) {
      rechazos.push(`${donde}: ${motivo}`);
      continue;
    }
    const pedido = entrada as PedidoLeido;
    if (aceptados.length >= CLIMA.porTurno) {
      rechazos.push(`${donde}: ya han entrado ${CLIMA.porTurno} este turno, que es el máximo`);
      continue;
    }
    const reg = state.map.regions[regionDelSitio(state.map, pedido.at)];
    if (reg === undefined) {
      rechazos.push(`${donde}: no es de ninguna región`);
      continue;
    }
    if (aceptados.some((a) => a.region === reg.id)) {
      rechazos.push(`${donde}: ${reg.name} ya tiene su clima más arriba en esta misma respuesta`);
      continue;
    }
    const puesto: PedidoDeClima = {
      ...(pedido.weather === undefined ? {} : { tiempo: pedido.weather }),
      ...(pedido.night === undefined ? {} : { noche: pedido.night }),
      hasta: state.day + (pedido.days ?? 1) - 1,
    };
    vigente[reg.id] = puesto;
    aceptados.push({ region: reg.id, nombre: reg.name, ...puesto });
  }
  if (lista !== null && lista.length > PEDIDOS_QUE_SE_MIRAN) {
    rechazos.push(
      `llegan ${lista.length} pedidos y se miran los ${PEDIDOS_QUE_SE_MIRAN} primeros: el resto (${lista.length - PEDIDOS_QUE_SE_MIRAN}) se descarta sin mirarlo`,
    );
  }
  state.climaPedido = vigente;
  return { aceptados, rechazos };
}

// ------------------------------------------------------- forzarlo para mirar

/** Lo que pide `?clima=`: para todo el mapa y, encima, por región. */
export interface ClimaForzado {
  readonly todo: ClimaForzadoDelSitio;
  readonly regiones: Readonly<Record<string, ClimaForzadoDelSitio>>;
}

const QUE_VALE_EN_CLIMA = `valen ${TIEMPOS.join(', ')}, noche y dia, separados por comas, y cualquiera de ellos para una región, como region-0:tormenta`;

/** Lo de un sitio mientras se lee: se va llenando trozo a trozo. */
type SitioQueSeLee = { -readonly [K in keyof ClimaForzadoDelSitio]: ClimaForzadoDelSitio[K] };

/**
 * Lo que pide un `?clima=`, `null` si no pide nada (como `parseSeed`: vacío es no
 * pedir), o lanza con lo que no se entiende. Es una lista separada por comas de
 * un tiempo (todo el mapa), `noche` o `dia`, y `<región>:<lo mismo>` para una
 * región. Fuerza la presentación, no la noche de las reglas. Que las regiones
 * sean del mapa lo mira `validarForzado`, que necesita el mapa.
 */
export function parseClima(texto: string | null | undefined): ClimaForzado | null {
  if (texto === null || texto === undefined || texto.trim() === '') return null;
  const todo: SitioQueSeLee = {};
  const regiones: Record<string, SitioQueSeLee> = {};
  for (const bruto of texto.split(',')) {
    const trozo = bruto.trim();
    if (trozo === '') throw new Error(`"${texto}" lleva una coma de más: ${QUE_VALE_EN_CLIMA}`);
    const dos = trozo.lastIndexOf(':');
    const region = dos < 0 ? null : trozo.slice(0, dos);
    const que = dos < 0 ? trozo : trozo.slice(dos + 1);
    if (region !== null && !esIdDeMapa(region)) {
      throw new Error(`"${region}" no es una región: ${QUE_VALE_EN_CLIMA}`);
    }
    let sitio = todo;
    if (region !== null) {
      sitio = regiones[region] ?? {};
      regiones[region] = sitio;
    }
    const para = region ?? 'todo el mapa';
    if (que === 'noche' || que === 'dia') {
      const noche = que === 'noche';
      if (sitio.noche !== undefined && sitio.noche !== noche) {
        throw new Error(`"${texto}" pide noche y día a la vez para ${para}: pon uno`);
      }
      sitio.noche = noche;
    } else if (esTiempo(que)) {
      if (sitio.tiempo !== undefined && sitio.tiempo !== que) {
        throw new Error(
          `"${texto}" pide dos tiempos para ${para} (${sitio.tiempo} y ${que}): pon uno`,
        );
      }
      sitio.tiempo = que;
    } else {
      throw new Error(`"${que}" no es un clima: ${QUE_VALE_EN_CLIMA}`);
    }
  }
  return { todo, regiones };
}

/**
 * Que las regiones de lo forzado sean de este mapa: lanza con la que no, diciendo
 * cuáles hay. Se llama una vez, al fijar lo forzado (la sesión al abrir la
 * partida, el espectador con la primera vista); pintar no valida nada.
 */
export function validarForzado(
  forzado: ClimaForzado | null,
  map: Pick<MapaDeRed, 'regions'>,
): void {
  if (forzado === null) return;
  const ids = map.regions.map((r) => r.id);
  for (const id of Object.keys(forzado.regiones)) {
    if (!ids.includes(id)) {
      throw new Error(
        ids.length === 0
          ? `"${id}": este mapa no tiene regiones`
          : `en este mapa no hay "${id}": hay ${ids[0]}…${ids[ids.length - 1]}`,
      );
    }
  }
}

function encima(sitio: ClimaDelSitio, f: ClimaForzadoDelSitio): ClimaDelSitio {
  return { tiempo: f.tiempo ?? sitio.tiempo, noche: f.noche ?? sitio.noche };
}

/**
 * El clima de la partida con lo forzado encima: lo de todo el mapa y, sobre eso,
 * lo de cada región. Lo forzado ya está validado contra el mapa
 * (`validarForzado`).
 */
export function forzarClima(
  clima: ClimaDeLaPartida,
  forzado: ClimaForzado | null,
  map: Pick<MapaDeRed, 'regions'>,
): ClimaDeLaPartida {
  if (forzado === null) return clima;
  return {
    regiones: clima.regiones.map((sitio, k) =>
      encima(encima(sitio, forzado.todo), forzado.regiones[map.regions[k]?.id ?? ''] ?? {}),
    ),
  };
}

/**
 * Lo forzado en un sitio sin regiones (la arena): el despejado con lo de todo el
 * mapa encima. Una región no tiene sentido ahí, y se dice.
 */
export function climaSinRegiones(forzado: ClimaForzado | null, quien: string): ClimaDelSitio {
  if (forzado === null) return DESPEJADO;
  const regiones = Object.keys(forzado.regiones);
  if (regiones.length > 0) {
    throw new Error(`${quien} no tiene regiones: quita "${regiones.join('", "')}" de «clima»`);
  }
  return encima(DESPEJADO, forzado.todo);
}
