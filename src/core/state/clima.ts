/**
 * El clima: el tiempo (despejado, niebla, lluvia, tormenta) y la noche de cada
 * región, cada día. **Es presentación**: ninguna regla lo mira (ni la vista, ni
 * el tiro, ni la marcha). Lo pintan el mapa, la batalla y las escenas laterales,
 * y vive en `core` y no en el cliente porque lo que pide el narrador se guarda en
 * el estado y porque el «mapa vivo» quiere leer la noche desde las reglas de sus
 * lugares («un comerciante que solo sale de noche», `esDeNocheEn`).
 *
 * Dos fuentes, una sola lectura (`climaDeLaPartida`):
 *
 * - **La semilla**, sin agente o donde no pide nada: una función pura de la
 *   semilla, el día y la región, en enteros y con **su propia corriente**
 *   (`createRng(hashDeTexto(…))`, como las voces de respaldo de la base): no
 *   consume ni una tirada de la partida, así que `pnpm banco` no la ve. El
 *   tiempo va en cadena —un tiempo general del día que sigue el de ayer con
 *   `seguir` ‰, y cada región que se aparta con `desvio` ‰—, y así salen rachas
 *   y pocos frentes, no un mosaico. La noche, también en cadena, con el peso de
 *   la facción del dueño de la región ahora (los no muertos, mucho más a menudo:
 *   decisión del usuario del 22-10-2026).
 * - **El narrador** (`pedirClima`, el único que escribe `GameState.climaPedido`),
 *   por región y por días, como las voces de la base: ni crónica ni banco.
 *
 * Las cifras, inventadas, en `data/clima.json`, que solo importa este módulo.
 */
import climaJson from '../../../data/clima.json' with { type: 'json' };
import { enteroDesde } from '../data.js';
import { inBounds } from '../map/map.js';
import { estructura, type MapaDeRed, territorio, VECINAS } from '../map/regiones.js';
import { createRng, hashDeTexto, sortearPorPesos } from '../rng.js';
import { FACTION_IDS, type FactionId, type PlayerId, type Point } from '../types.js';
import type { GameState, PendingBattle } from './game.js';

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
  readonly dia: number;
  readonly regiones: readonly ClimaDelSitio[];
}

/**
 * Lo que el narrador pidió para una región: su tiempo, su noche o los dos, hasta
 * el día `hasta` incluido. Lo que no pide sale de la semilla.
 */
export interface PedidoDeClima {
  readonly tiempo?: Tiempo;
  readonly noche?: boolean;
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

const generales = new Map<string, Tiempo[]>();
const regionales = new Map<string, { tiempo: Tiempo; aparte: boolean }[]>();
const noches = new Map<string, boolean[]>();

/** El tiempo general del día `dia` en la partida de `seed`: el de ayer con `seguir` ‰, si no uno sorteado. */
function tiempoGeneral(seed: number, dia: number): Tiempo {
  return cadena(generales, `${seed}`, dia, (d, ayer) => {
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
  return cadena(regionales, `${seed}|${region}`, dia, (d, ayer) => {
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
  return cadena(noches, `${seed}|${region}|${peso}`, dia, (d, ayer) => {
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
 * más cercana (una búsqueda en anchura desde todas a la vez, en el orden de
 * `VECINAS`). Así cada frente cae en una cordillera o un río y una ciudad, que es
 * un nodo, tiene el tiempo de alrededor. −1 solo en un mapa sin regiones.
 */
export function regionDelClima(map: MapaDeRed): Int32Array {
  const hecha = regionesDelClima.get(map);
  if (hecha !== undefined) return hecha;
  const { width: W, height: H } = map;
  const region = Int32Array.from(estructura(map).regionDe);
  const cola: number[] = [];
  for (let i = 0; i < region.length; i++) if ((region[i] as number) >= 0) cola.push(i);
  for (let k = 0; k < cola.length; k++) {
    const i = cola[k] as number;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of VECINAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if ((region[j] as number) !== -1) continue;
      region[j] = region[i] as number;
      cola.push(j);
    }
  }
  regionesDelClima.set(map, region);
  return region;
}

// -------------------------------------------------------------- la partida

/** Lo pedido que sigue en vigor hoy en una región, o `undefined`. */
function pedidoVigente(state: GameState, region: string): PedidoDeClima | undefined {
  const p = state.climaPedido?.[region];
  return p !== undefined && p.hasta >= state.day ? p : undefined;
}

/**
 * El clima de cada región hoy: lo que pidió el narrador y siga en vigor y, en lo
 * demás, el de la semilla. La noche, con el dueño de ahora de cada región
 * (`territorio`).
 */
export function climaDeLaPartida(state: GameState): ClimaDeLaPartida {
  const regiones = state.map.regions;
  const dueños = regiones.length === 0 ? [] : territorio(state).dueñoDeRegion;
  const faccion = new Map<PlayerId, FactionId>(state.players.map((p) => [p.id, p.faction]));
  return {
    dia: state.day,
    regiones: regiones.map((reg, k) => {
      const pedido = pedidoVigente(state, reg.id);
      const dueño = dueños[k] ?? null;
      return {
        tiempo: pedido?.tiempo ?? tiempoDeLaSemilla(state.seed, state.day, reg.id),
        noche:
          pedido?.noche ??
          nocheDeLaSemilla(
            state.seed,
            state.day,
            reg.id,
            dueño === null ? 'neutral' : (faccion.get(dueño) ?? 'neutral'),
          ),
      };
    }),
  };
}

/** El clima de la casilla `p` (la región del clima que le toca), o el despejado en un mapa sin regiones. */
export function tiempoDelSitio(clima: ClimaDeLaPartida, map: MapaDeRed, p: Point): ClimaDelSitio {
  if (!inBounds(map, p)) throw new Error(`(${p.x},${p.y}) está fuera del mapa: no tiene clima`);
  const k = regionDelClima(map)[p.y * map.width + p.x] as number;
  return k < 0 ? DESPEJADO : (clima.regiones[k] ?? DESPEJADO);
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
  return (climaDeLaPartida(state).regiones[k] as ClimaDelSitio).noche;
}

/**
 * Dónde se pelea una batalla del mapa: donde está lo atacado (el monstruo, el
 * héroe, la ciudad o el grupo) y, en una emboscada, el héroe emboscado. Es la
 * casilla de la que la batalla hereda el clima.
 */
export function sitioDeLaBatalla(state: GameState, pending: PendingBattle): Point {
  const foe = pending.foe;
  const at = ((): Point | undefined => {
    switch (foe.kind) {
      case 'monster':
        return state.map.objects.find((o) => o.id === foe.objectId)?.at;
      case 'hero':
        return state.heroes.find((h) => h.id === foe.heroId)?.at;
      case 'town':
        return state.towns.find((t) => t.id === foe.townId)?.at;
      case 'raider':
        return state.raiders.find((r) => r.id === foe.raiderId)?.at;
    }
  })();
  if (at !== undefined) return at;
  const quien = pending.attacker;
  const atacante =
    quien.kind === 'hero' ? state.heroes.find((h) => h.id === quien.heroId)?.at : undefined;
  if (atacante !== undefined) return atacante;
  throw new Error(
    'la batalla pendiente no tiene sitio: ni lo atacado ni el atacante están en el mapa',
  );
}

// --------------------------------------------------------------- el narrador

/** Lo que manda el narrador para una región: un punto suyo y lo que pide. */
export interface ClimaPedidoPorElAgente {
  readonly at: Point;
  readonly weather?: string;
  readonly night?: boolean;
  readonly days?: number;
}

/** Lo que entró, por región, para contarlo en el veredicto. */
export interface ClimaAceptado {
  readonly region: string;
  readonly nombre: string;
  readonly tiempo?: Tiempo;
  readonly noche?: boolean;
  readonly hasta: number;
}

export interface ClimaPuesto {
  readonly aceptados: readonly ClimaAceptado[];
  /** Cada pedido que no entró, con su motivo para la persona. */
  readonly rechazos: readonly string[];
}

/** Por qué no se puede pedir ese clima, o `null` si se puede. No mira cuántos van. */
export function climaBlocker(state: GameState, pedido: ClimaPedidoPorElAgente): string | null {
  const { at } = pedido;
  if (!inBounds(state.map, at)) return `(${at.x},${at.y}) está fuera del mapa`;
  if (state.map.regions.length === 0) return 'este mapa no tiene regiones: no hay clima que pedir';
  if (pedido.weather === undefined && pedido.night === undefined) {
    return 'no pide nada: lleva "weather", "night" o los dos';
  }
  if (pedido.weather !== undefined && !esTiempo(pedido.weather)) {
    return `"${pedido.weather}" no es un tiempo: valen ${TIEMPOS.join(', ')}`;
  }
  if (
    pedido.days !== undefined &&
    (!Number.isSafeInteger(pedido.days) || pedido.days < 1 || pedido.days > CLIMA.diasMaximos)
  ) {
    return `days ${pedido.days}: va de 1 a ${CLIMA.diasMaximos} días`;
  }
  return null;
}

/**
 * Pone el clima que pide el narrador. Es el **único** que escribe
 * `GameState.climaPedido`.
 *
 * Cada pedido se juzga solo (`climaBlocker`): uno malo se rechaza con su motivo
 * sin tirar los demás. Un pedido cubre la región de su casilla desde hoy y
 * `days` días (1 si no lo dice) y sustituye entero al que esa región tuviera:
 * lo que no pide (el tiempo o la noche) vuelve a salir de la semilla. Entran
 * como mucho `porTurno` por turno y una vez cada región. Lo caducado se borra.
 */
export function pedirClima(
  state: GameState,
  _player: PlayerId,
  pedidos: readonly ClimaPedidoPorElAgente[],
): ClimaPuesto {
  const vigente: Record<string, PedidoDeClima> = {};
  for (const [id, p] of Object.entries(state.climaPedido ?? {})) {
    if (p.hasta >= state.day) vigente[id] = p;
  }
  const aceptados: ClimaAceptado[] = [];
  const rechazos: string[] = [];
  const regionDe = pedidos.length === 0 ? null : regionDelClima(state.map);
  for (const pedido of pedidos) {
    const donde = `(${pedido.at.x},${pedido.at.y})`;
    const motivo = climaBlocker(state, pedido);
    if (motivo !== null) {
      rechazos.push(`${donde}: ${motivo}`);
      continue;
    }
    if (aceptados.length >= CLIMA.porTurno) {
      rechazos.push(`${donde}: ya han entrado ${CLIMA.porTurno} este turno, que es el máximo`);
      continue;
    }
    const k = (regionDe as Int32Array)[pedido.at.y * state.map.width + pedido.at.x] as number;
    const reg = state.map.regions[k];
    if (reg === undefined) {
      rechazos.push(`${donde}: no es de ninguna región`);
      continue;
    }
    if (aceptados.some((a) => a.region === reg.id)) {
      rechazos.push(`${donde}: ${reg.name} ya tiene su clima más arriba en esta misma respuesta`);
      continue;
    }
    const hasta = state.day + (pedido.days ?? 1) - 1;
    const tiempo = pedido.weather as Tiempo | undefined;
    const puesto: PedidoDeClima = {
      ...(tiempo === undefined ? {} : { tiempo }),
      ...(pedido.night === undefined ? {} : { noche: pedido.night }),
      hasta,
    };
    vigente[reg.id] = puesto;
    aceptados.push({ region: reg.id, nombre: reg.name, ...puesto });
  }
  state.climaPedido = vigente;
  return { aceptados, rechazos };
}

// ------------------------------------------------------- forzarlo para mirar

/** Lo que fuerza `?clima=` en un sitio: el tiempo, la noche o los dos. */
export interface ClimaForzadoDelSitio {
  readonly tiempo?: Tiempo;
  readonly noche?: boolean;
}

/** Lo que pide `?clima=`: para todo el mapa y, encima, por región. */
export interface ClimaForzado {
  readonly todo: ClimaForzadoDelSitio;
  readonly regiones: Readonly<Record<string, ClimaForzadoDelSitio>>;
}

const QUE_VALE_EN_CLIMA = `valen ${TIEMPOS.join(', ')}, noche y dia, separados por comas, y cualquiera de ellos para una región, como region-0:tormenta`;

/**
 * Lo que pide un `?clima=`, `null` si no pide nada (como `parseSeed`: vacío es no
 * pedir), o lanza con lo que no se entiende. Es una lista separada por comas de
 * un tiempo (todo el mapa), `noche` o `dia`, y `<región>:<lo mismo>` para una
 * región. Fuerza la presentación, no la noche de las reglas.
 */
export function parseClima(texto: string | null | undefined): ClimaForzado | null {
  if (texto === null || texto === undefined || texto.trim() === '') return null;
  const todo: { tiempo?: Tiempo; noche?: boolean } = {};
  const regiones: Record<string, { tiempo?: Tiempo; noche?: boolean }> = {};
  for (const bruto of texto.split(',')) {
    const trozo = bruto.trim();
    if (trozo === '') throw new Error(`"${texto}" lleva una coma de más: ${QUE_VALE_EN_CLIMA}`);
    const dos = trozo.lastIndexOf(':');
    const region = dos < 0 ? null : trozo.slice(0, dos);
    const que = dos < 0 ? trozo : trozo.slice(dos + 1);
    if (region !== null && !/^[a-z0-9][a-z0-9_-]*$/.test(region)) {
      throw new Error(`"${region}" no es una región: ${QUE_VALE_EN_CLIMA}`);
    }
    if (region !== null && regiones[region] === undefined) regiones[region] = {};
    const sitio =
      region === null ? todo : (regiones[region] as { tiempo?: Tiempo; noche?: boolean });
    const para = region === null ? 'todo el mapa' : region;
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

function encima(sitio: ClimaDelSitio, f: ClimaForzadoDelSitio): ClimaDelSitio {
  return { tiempo: f.tiempo ?? sitio.tiempo, noche: f.noche ?? sitio.noche };
}

/**
 * El clima de la partida con lo forzado encima: lo de todo el mapa y, sobre eso,
 * lo de cada región. Lanza con una región que el mapa no tiene, diciendo cuáles.
 */
export function forzarClima(
  clima: ClimaDeLaPartida,
  forzado: ClimaForzado | null,
  map: Pick<MapaDeRed, 'regions'>,
): ClimaDeLaPartida {
  if (forzado === null) return clima;
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
  return {
    dia: clima.dia,
    regiones: clima.regiones.map((sitio, k) => {
      const id = ids[k] as string;
      return encima(encima(sitio, forzado.todo), forzado.regiones[id] ?? {});
    }),
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
