/**
 * Vestir una red de nodos ya validada: fronteras gruesas y variadas, obstáculos
 * dentro de cada región y caminos entre lo que importa (ciclo «mapas densos»,
 * 03-10-2026). Es la carpeta `map/vestir/`, y esto es lo que comparten sus partes.
 *
 * El generador (`map/generar/`) traza la red fina de siempre —Voronoi en espejo,
 * muro de una casilla, nodos, `problemasDeRed` y perfil de saltos— y **solo
 * después** la viste con lo de aquí. El orden es lo que hace segura la mitad
 * que más miedo daba: todo lo que hace el vestido es **convertir casillas
 * pisables en barrera**, y añadir muro nunca abre un paso. Lo único que puede
 * romper es partir una región o dejar algo sin alcanzar, y las dos cosas se
 * miran antes de aceptar cada cambio (o se rechaza el vestido entero). El grafo
 * de regiones y nodos es el mismo que validó el perfil, así que el equilibrio
 * entre las dos bases no se toca. Y por eso un vestido que falla **no tira la
 * red**: el generador vuelve a vestir la misma.
 *
 * Todo es puro y determinista: el único azar es el `rng` que se pasa.
 *
 * Las partes: el engorde de las fronteras (`fronteras.ts`), que llama a las
 * líneas de una casilla (`lineas.ts`) y al relieve de lo engordado
 * (`relieve.ts`); los obstáculos (`obstaculos.ts`) y los caminos
 * (`caminos.ts`). Aquí, lo que leen todas: la rejilla de tipos (`Tipos`,
 * `ABIERTA`) con su única escritura, `ponerTipo`, que no deja cortar el río
 * (`conElRio`, `esDelRio`); los sorteos con el `rng` (`sortear`, `barajar`); y la
 * regla de las líneas que separan dos regiones a dos pasos (`lineasQueSeparan`,
 * `separadasDeCerca`, `aguaALaVista`); y qué barreras levanta el vestido en cada
 * sitio, la tabla de `data/barreras.json` (`BARRERAS_DEL_MAPA`), que leen el
 * engorde, los obstáculos y el vestido de la red del generador. Todo el vestido
 * estaba en `map/vestir.ts` hasta la fase N de la reorganización (07-11-2026), y
 * la tabla, en `map/generar/datos.ts`; esto no importa ninguna de las otras
 * partes, ni nada de `map/generar/`.
 */
import barrerasJson from '../../../../data/barreras.json' with { type: 'json' };
import type { Rng } from '../../rng.js';
import { enteroDesde } from '../../validar.js';
import { BARRERAS, type Barrera, SUELOS_PISABLES, type Suelo } from '../terrain.js';

/** Sin barrera en `Tipos`: la casilla se pisa. */
export const ABIERTA = -1;

/**
 * La barrera de cada casilla, como índice en `BARRERAS`, o `ABIERTA`. Una sola
 * rejilla para frontera y obstáculos: los dos se emiten como `walls` del plan.
 */
export type Tipos = Int8Array;

/** El tipo de una casilla como terreno, o `null` si se pisa. */
export function barreraDe(tipos: Tipos, i: number): Barrera | null {
  const t = tipos[i] as number;
  return t === ABIERTA ? null : (BARRERAS[t] as Barrera);
}

/**
 * El río de cada rejilla de tipos (`conElRio`), con el ancho del mapa para
 * decir dónde. Va aparte y no dentro de `Tipos`, que es una rejilla plana que
 * leen y copian medio vestido y los tests.
 */
export const RIO_DE_LOS_TIPOS = new WeakMap<
  Tipos,
  { readonly rio: Uint8Array; readonly W: number }
>();

/**
 * Escribe el río (`core/map/rio.ts`) en `tipos`, como agua, y lo deja fijo: de
 * aquí en adelante `ponerTipo` lanza si se le pide cambiar una casilla suya.
 */
export function conElRio(tipos: Tipos, rio: Uint8Array, W: number): void {
  const AGUA = indiceDe('water');
  for (let i = 0; i < rio.length; i++) if (rio[i] === 1) ponerTipo(tipos, i, AGUA);
  RIO_DE_LOS_TIPOS.set(tipos, { rio, W });
}

/** Si la casilla `i` es del río de `tipos` (`conElRio`): agua que nadie cambia. */
export function esDelRio(tipos: Tipos, i: number): boolean {
  return RIO_DE_LOS_TIPOS.get(tipos)?.rio[i] === 1;
}

/**
 * **La única escritura de `tipos`** (#144, río continuo). Lanza si `i` es del
 * río: el río del paso 2 se cortaba porque diecisiete pasadas del vestido
 * escribían en la rejilla sin saber que una casilla era suya (las esquinas de
 * las sendas, el agua derramada, las orillas de las espigas…). La pasada que
 * querría tocarlo salta esa casilla o elige otra; si ni así, su vestido no vale.
 * Lo vigila `invariantes.test.ts`: nadie más escribe `tipos[…] =`.
 */
export function ponerTipo(tipos: Tipos, i: number, t: number): void {
  const delRio = RIO_DE_LOS_TIPOS.get(tipos);
  if (delRio !== undefined && delRio.rio[i] === 1 && t !== tipos[i]) {
    const x = i % delRio.W;
    throw new Error(
      `la casilla (${x},${(i - x) / delRio.W}) es del río y se iba a volver ${t === ABIERTA ? 'tierra que se pisa' : BARRERAS[t]}: el río no se corta (#144)`,
    );
  }
  tipos[i] = t;
}

/** Un sorteo por pesos con el `rng` de la partida: la única forma de elegir barrera. */
export function sortear(rng: Rng, candidatas: readonly BarreraConPeso[]): Barrera {
  const total = candidatas.reduce((s, c) => s + c.peso, 0);
  if (total <= 0) throw new Error('no hay barreras candidatas que sortear');
  let tirada = rng.int(0, total - 1);
  for (const c of candidatas) {
    if (tirada < c.peso) return c.barrera;
    tirada -= c.peso;
  }
  throw new Error('el sorteo de barrera se ha salido de la tabla');
}

export const indiceDe = (b: Barrera): number => BARRERAS.indexOf(b);

/** La lista barajada con el `rng` (Fisher-Yates), sin tocar la de entrada. */
export function barajar<T>(rng: Rng, lista: readonly T[]): T[] {
  const fuera = [...lista];
  for (let i = fuera.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [fuera[i], fuera[j]] = [fuera[j] as T, fuera[i] as T];
  }
  return fuera;
}

/**
 * Las líneas de una casilla que pueden separar dos regiones a dos pasos: la
 * excepción a los tres pasos de `RADIO_DEL_PASO`. A un mismo nivel, el agua
 * (#144: el río de una casilla). Entre dos niveles, el acantilado (#215: el
 * borde de la meseta, con lo bajo a su pie) o el agua (#144, paso 2b: el río al
 * pie de la meseta). El agua va siempre a ras de la más baja de las dos —una
 * más baja que las dos orillas sería un cañón, y el relieve la deja a ras de la
 * más baja de las regiones que toca su franja (#210)— y tiene que verse
 * (`aguaALaVista`).
 */
export function lineasQueSeparan(nivelA: number, nivelB: number): readonly Barrera[] {
  return nivelA === nivelB ? ['water'] : ['cliff', 'water'];
}

/**
 * Si el agua de `m` se ve desde la cámara: nada más alto justo al norte o, si
 * lo hay, más agua justo al sur (`sigue`: la que cuenta). La cara de lo alto
 * cuelga hacia la cámara, de norte a sur, unas 0,6 casillas (el alto de una
 * caída de 1 a 25°) y taparía un río de una casilla al pie de la meseta: ahí el
 * río va a dos (decisión del usuario, 16-10-2026). Al este, al oeste o al sur de
 * lo alto, la ladera y la espalda no lo tapan. `nivel` es el de la escena.
 */
export function aguaALaVista(
  W: number,
  H: number,
  tipos: Tipos,
  nivel: ArrayLike<number>,
  m: number,
  sigue: (j: number) => boolean,
): boolean {
  if (m < W || (nivel[m - W] as number) <= (nivel[m] as number)) return true;
  const sur = m + W;
  return sur < W * H && tipos[sur] === indiceDe('water') && sigue(sur);
}

/**
 * Si dos casillas que se pisan de regiones distintas a dos pasos (Chebyshev 2)
 * tienen en medio una de sus líneas (`lineasQueSeparan`): una casilla de ella
 * en la caja de lo que toca a las dos, que `cuenta`; si es agua, a ras de la
 * más baja de las dos y a la vista (`aguaALaVista`). Con su línea en medio, en
 * ocho vecinas no se tocan y la escena pinta entre ellas una caída o un río. A
 * un paso, nunca: se tocan. Es la regla del paso 7d de `engordarFronteras`, y la
 * miran todos los que abren casillas de una barrera (`abrirLinea`,
 * `quitarEspigas`, `puertasSinMuesca`, `abrirEsquinasTorcidas`). `nivel` es el
 * de la escena (`nivelesDeLoEngordado`) y `nivelI`, `nivelQ`, los de sus
 * regiones.
 *
 * El agua entre dos niveles solo cuenta con `aguaEntreNiveles`, que pide el
 * 7d: el río de una casilla al pie de la meseta (#144) separa sus dos orillas.
 * Los demás que abren casillas no se arriman a ella: abrir junto a un agua de
 * una casilla entre dos niveles (con el río que se adelgazaba, 16-10-2026) le
 * comía la esquina a una ciudad o la orilla a un vado.
 */
export function separadasDeCerca(
  W: number,
  H: number,
  tipos: Tipos,
  nivel: ArrayLike<number>,
  i: number,
  q: number,
  nivelI: number,
  nivelQ: number,
  cuenta: (m: number) => boolean,
  aguaEntreNiveles = false,
): boolean {
  const x = i % W;
  const y = (i - x) / W;
  const qx = q % W;
  const qy = (q - qx) / W;
  if (Math.max(Math.abs(x - qx), Math.abs(y - qy)) !== 2) return false;
  const AGUA = indiceDe('water');
  const acantilado = nivelI === nivelQ ? -1 : indiceDe('cliff');
  const bajo = Math.min(nivelI, nivelQ);
  for (let my = Math.max(y, qy) - 1; my <= Math.min(y, qy) + 1; my++)
    for (let mx = Math.max(x, qx) - 1; mx <= Math.min(x, qx) + 1; mx++) {
      if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
      const m = my * W + mx;
      if (!cuenta(m)) continue;
      if (tipos[m] === acantilado) return true;
      if (
        tipos[m] === AGUA &&
        (aguaEntreNiveles || nivelI === nivelQ) &&
        (nivel[m] as number) === bajo &&
        aguaALaVista(W, H, tipos, nivel, m, cuenta)
      )
        return true;
    }
  return false;
}

/**
 * Cada cuántas casillas de frontera puede cambiar de lado el que engorda donde
 * dos regiones quedarían a dos pasos (`engordarFronteras`, paso 4b). Medido en
 * un prototipo (#169, 07-10-2026, tramos rectos de ≥ 8 en 1-300): con 2, 36;
 * con 4, 23; con 6, 22, y la de 6 con más mapas con un tramo de ≥ 10. Son
 * cuentas que bailan ±10 con otra tirada de monedas: 4 es «de 3 a 6», no un
 * óptimo.
 */
export const TRECHO_DEL_LADO = 4;

/** Una barrera con su peso en un sorteo. */
export interface BarreraConPeso {
  readonly barrera: Barrera;
  readonly peso: number;
}

/**
 * Qué barrera levanta el generador en cada sitio, de `data/barreras.json`.
 * **Inventado y provisional**, como dice su `_comment`.
 */
export interface ReglasDeBarreras {
  /** Por suelo: las barreras de una frontera que lo toca. Una frontera suma las de sus dos lados. */
  readonly frontera: Readonly<Record<Suelo, readonly BarreraConPeso[]>>;
  /** Por suelo: las barreras de las manchas de dentro de una región. */
  readonly obstaculos: Readonly<Record<Suelo, readonly BarreraConPeso[]>>;
  /** Qué parte de cada región cubren los obstáculos, en % entero. */
  readonly densidadPorCiento: { readonly min: number; readonly max: number };
  /**
   * Cuántas casillas tiene una mancha. `min` vale para todas **menos la última de
   * cada región**, que se recorta a lo que falta para la densidad sorteada: con
   * regiones de treinta casillas, la diferencia entre llegar y no llegar era a
   * veces una casilla.
   */
  readonly mancha: { readonly min: number; readonly max: number };
  /**
   * Casillas de frontera que lleva, como poco, cada una de las `TIPOS_POR_MAPA`
   * barreras que el generador garantiza por mapa. Sin él la garantía era de
   * nombre: una barrera podía quedarse en dos casillas, o en ninguna si su
   * única frontera eran casillas de nodo, que `buildMap` abre (QA, semillas 864
   * y 986 en 34×34).
   */
  readonly casillasMinimasPorTipo: number;
}

/**
 * Valida la tabla de barreras y la devuelve tipada. **Lanza con todos los
 * problemas a la vez**. Exportada con el JSON de argumento, como
 * `leerEquipo`, para que el guardia se pueda ver morder con un fichero roto.
 *
 * Que estén **todos** los suelos que se pisan no es capricho: el generador
 * sortea por el suelo de cada región, y un suelo sin fila daría una frontera
 * sin candidatas a mitad de un mapa.
 */
export function validarBarreras(json: unknown, fichero = 'data/barreras.json'): ReglasDeBarreras {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  const tabla = (campo: 'frontera' | 'obstaculos'): Record<Suelo, BarreraConPeso[]> => {
    const bruta = j[campo];
    // Se rellena entera abajo, o se lanza: el `as` es lo que tarda en llenarse.
    const salida = {} as Record<Suelo, BarreraConPeso[]>;
    if (bruta === null || typeof bruta !== 'object') {
      problemas.push(`no trae "${campo}"`);
      return salida;
    }
    for (const suelo of Object.keys(bruta)) {
      if (!(SUELOS_PISABLES as readonly string[]).includes(suelo)) {
        problemas.push(
          `"${campo}" tiene una fila para "${suelo}", que no es un suelo que se pise; valen ${SUELOS_PISABLES.join(', ')}`,
        );
      }
    }
    for (const suelo of SUELOS_PISABLES) {
      const fila = (bruta as Record<string, unknown>)[suelo];
      if (fila === null || typeof fila !== 'object' || Object.keys(fila).length === 0) {
        problemas.push(`"${campo}" no tiene fila para el suelo "${suelo}"`);
        continue;
      }
      const lista: BarreraConPeso[] = [];
      for (const [barrera, peso] of Object.entries(fila)) {
        if (!(BARRERAS as readonly string[]).includes(barrera)) {
          problemas.push(
            `"${campo}.${suelo}" pide "${barrera}", que no es una barrera; valen ${BARRERAS.join(', ')}`,
          );
        } else if (!enteroDesde(peso, 1)) {
          problemas.push(
            `"${campo}.${suelo}.${barrera}" pesa ${peso}: tiene que ser un entero > 0`,
          );
        } else {
          lista.push({ barrera: barrera as Barrera, peso });
        }
      }
      salida[suelo] = lista;
    }
    return salida;
  };
  const rango = (campo: 'densidadPorCiento' | 'mancha', desde: number, hasta: number) => {
    const r = (j[campo] ?? {}) as { min?: unknown; max?: unknown };
    if (!enteroDesde(r.min, desde) || !enteroDesde(r.max, desde) || r.max > hasta) {
      problemas.push(
        `"${campo}" tiene que llevar "min" y "max" enteros entre ${desde} y ${hasta}, y lleva ${JSON.stringify(j[campo])}`,
      );
      return { min: 0, max: 0 };
    }
    if (r.min > r.max) problemas.push(`"${campo}": min (${r.min}) es mayor que max (${r.max})`);
    return { min: r.min, max: r.max };
  };
  const frontera = tabla('frontera');
  const obstaculos = tabla('obstaculos');
  for (const suelo of SUELOS_PISABLES) {
    if (obstaculos[suelo]?.some((c) => c.barrera === 'cliff')) {
      problemas.push(
        `"obstaculos.${suelo}" pide "cliff": un acantilado dentro de una región es una mesa suelta, y el acantilado es el borde de una meseta (#143)`,
      );
    }
    if (obstaculos[suelo]?.some((c) => c.barrera === 'wall')) {
      problemas.push(
        `"obstaculos.${suelo}" pide "wall": una muralla dentro de una región es una ruina que no cierra nada, y la muralla es el cierre de un paso (#232)`,
      );
    }
  }
  const densidadPorCiento = rango('densidadPorCiento', 0, 90);
  const mancha = rango('mancha', 1, 50);
  const casillasMinimasPorTipo = j.casillasMinimasPorTipo;
  if (!enteroDesde(casillasMinimasPorTipo, 1)) {
    problemas.push(
      `"casillasMinimasPorTipo" tiene que ser un entero > 0, y lleva ${JSON.stringify(casillasMinimasPorTipo)}`,
    );
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    frontera,
    obstaculos,
    densidadPorCiento,
    mancha,
    casillasMinimasPorTipo: casillasMinimasPorTipo as number,
  };
}

export const BARRERAS_DEL_MAPA: ReglasDeBarreras = validarBarreras(barrerasJson);
