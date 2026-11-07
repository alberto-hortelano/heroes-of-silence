/**
 * La muralla del tablero de batalla: hexes de muro y puertas entre dos casillas.
 *
 * Es del tablero, no de nadie: no tiene turno, ni vida, ni bando. El **muro es
 * alto** —otro nivel, una columna— y la **puerta no es una casilla**: es el lado
 * que comparten dos casillas de suelo vecinas en horizontal (`PuertaDeMuralla`,
 * `{a, b}` con `b` al este de `a`). Las dos se pisan como cualquier suelo; la
 * puerta solo corta el paso de una a otra (decisión del usuario, ampliación 4:
 * «la puerta bloquea el paso de una a otra pero no ocupa una casilla»).
 *
 * - al muro sube andando **quien defiende**, desde dentro (las escaleras de
 *   dentro); quien ataca, solo con la acción `subir` (escalera o rasgo
 *   `escalar`), y una vez arriba anda por los muros (`pasoPermitido`);
 * - de lo alto **solo se baja hacia dentro**, sea quien sea el que está arriba
 *   (decisión del usuario, 09-10-2026). Dentro y fuera se derivan de la forma
 *   (`ladoDeLaMuralla`), por cercanía andando a cada salida: también la que no
 *   cierra tiene un delante y un detrás;
 * - el volador se posa en un muro libre, de cualquier bando, y baja donde quiera;
 * - la puerta se abre y se cierra (`EstadoDePuerta`, en el estado de la
 *   batalla y no aquí): **cerrada no la cruza nadie que ande**, ni el defensor,
 *   y corta el tiro del suelo; **abierta la cruza cualquiera** y no tapa. La abre
 *   o la cierra quien defiende al principio del turno de una de sus unidades
 *   (`puertaBlocker`, en `battle.ts`). Decisión del usuario (ampliación 3): «si
 *   está abierta puede pasar cualquiera y si está cerrada no pasa nadie, es más
 *   realista». Empieza cerrada.
 *
 * Quién está arriba se deriva del hex (`nivelDe`): no hay campo que se pueda
 * quedar viejo. Lo que cambia con el nivel —el cuerpo a cuerpo, la línea de
 * tiro, la defensa del tirador— lo aplica `battle.ts` preguntando aquí.
 *
 * Viaja con el estado tal cual —listas de hexes, sin `Set`—, así que cruza el
 * cable del espectador y un `structuredClone` sin perder nada. Los conjuntos se
 * calculan al preguntar y se guardan por objeto (`conjuntosDe`); lo que depende
 * de qué puertas están abiertas, además por esa combinación (`vigenteDe`): con
 * una o dos puertas son dos o cuatro, y una caché por muralla sola se quedaría
 * vieja al abrir.
 */
import murallaJson from '../../../data/muralla.json' with { type: 'json' };
import { LIDERAZGO } from '../hero/liderazgo.js';
import type { Hex } from '../types.js';
import { deLaListaBlocker, problemasDeObjeto } from '../validar.js';
import { isShooter } from './armas.js';
import {
  allHexes,
  BOARD_SIZE,
  bandoDeSalida,
  codigoDeLado,
  FORMA_DEL_TABLERO,
  hexKey,
  indiceDe,
  isInside,
  neighbours,
  type PasoPermitido,
  reachable,
} from './board.js';
import { salidaDe } from './salida.js';
import {
  type BattleStack,
  type BattleState,
  type EstadoDePuerta,
  MATERIALES_DE_MURALLA,
  type MaterialDeMuralla,
  type MurallaDeBatalla,
  type PuertaDeMuralla,
  SIDES,
  type Side,
} from './types.js';

/** ¿Es `x` un material de muralla? */
export function esMaterialDeMuralla(x: unknown): x is MaterialDeMuralla {
  return MATERIALES_DE_MURALLA.includes(x as MaterialDeMuralla);
}

/**
 * **Esta batalla no tiene muralla**: la de un paso, un monstruo, un grupo de
 * asaltantes o un lugar. Su material no decide nada: sin muros ni puertas no hay
 * nada que pintar ni que decir (`hayMuralla`), y va porque el tipo lo pide. El
 * editor de la arena no parte de aquí, sino de una vacía con su material escrito
 * (`murallaVacia`): lo que se dibuja no sale de piedra por el centinela.
 */
export const SIN_MURALLA: MurallaDeBatalla = Object.freeze({
  muros: Object.freeze([]) as readonly Hex[],
  puertas: Object.freeze([]) as readonly PuertaDeMuralla[],
  material: 'piedra',
});

/**
 * Una muralla sin muros ni puertas de `material`: de donde parte el editor de la
 * arena (de piedra) al abrir y al vaciar.
 */
export function murallaVacia(material: MaterialDeMuralla): MurallaDeBatalla {
  return validarMuralla({ muros: [], puertas: [], material });
}

/** Lo que pone el editor de la arena: muros en casillas, puertas entre dos. */
export type PiezaDeMuralla = 'muro' | 'puerta';

/** Las puertas de `m` como empieza la batalla: todas cerradas (decisión del usuario). */
export function puertasAlEmpezar(m: MurallaDeBatalla): EstadoDePuerta[] {
  return m.puertas.map(({ a, b }) => ({ a, b, abierta: false, cambiadaEn: null }));
}

/** ¿Son la misma puerta? Por sus dos casillas. */
export function mismaPuerta(p: PuertaDeMuralla, q: PuertaDeMuralla): boolean {
  return p.a.col === q.a.col && p.a.row === q.a.row && p.b.col === q.b.col && p.b.row === q.b.row;
}

/** «(6,4)-(7,4)»: cómo se dice una puerta en una frase. */
export function nombreDePuerta(p: PuertaDeMuralla): string {
  return `(${p.a.col},${p.a.row})-(${p.b.col},${p.b.row})`;
}

/** ¿Está abierta la puerta `p`? `false` si no es una puerta de `puertas`. */
export function puertaAbierta(puertas: readonly EstadoDePuerta[], p: PuertaDeMuralla): boolean {
  return puertas.some((q) => q.abierta && mismaPuerta(p, q));
}

/** ¿Hay algo? Es lo que decide si se paga la regla o se va por el camino de siempre. */
export function hayMuralla(m: MurallaDeBatalla): boolean {
  return m.muros.length > 0 || m.puertas.length > 0;
}

/**
 * De qué lado de la muralla cae `h`: `muralla` si es muro; si es suelo, del lado
 * cuya salida (`bandoDeSalida`) le queda más cerca andando con los muros y las
 * puertas cerradas: `fuera` si es la del atacante, `dentro` si es la del
 * defensor, si empatan o si no se llega desde ninguna (el hueco de un anillo).
 * Las dos casillas de una puerta son suelo y tienen su lado, cada una el suyo.
 *
 * Por cercanía y no por «unido a la salida del defensor»: con eso, una forma que
 * no separa las dos salidas —un semicírculo que no llega a los bordes, una línea
 * con hueco— dejaba todo dentro, y de lo alto se bajaba por delante. Es lo que vio
 * el usuario al probarlo («ha pasado por encima de la muralla y ha bajado por el
 * otro lado», ampliación 2). Con las puertas siempre cerradas para esta cuenta:
 * abrir una no cambia la forma de lado (criterio 22).
 *
 * Es lo que lee `pasoPermitido`: de lo alto solo se baja hacia dentro y el
 * defensor sube solo desde dentro. Se calcula una vez por muralla.
 */
export function ladoDeLaMuralla(m: MurallaDeBatalla, h: Hex): LadoDeLaMuralla {
  if (!hayMuralla(m) || !isInside(h)) return 'dentro';
  const c = conjuntosDe(m);
  const i = indiceDe(h);
  if (c.murosPorIndice[i] === 1) return 'muralla';
  return c.fueraPorIndice[i] === 1 ? 'fuera' : 'dentro';
}

export type LadoDeLaMuralla = 'dentro' | 'fuera' | 'muralla';

/**
 * ¿Separa la muralla —muros y puertas cerradas— la salida del defensor de la
 * del atacante? Si no, el atacante la rodea andando; dentro y fuera los hay
 * igual (`ladoDeLaMuralla`). En odd-r una puerta mal puesta deja rendija por
 * las diagonales: lo dice la ayuda del editor de la arena.
 */
export function cierra(m: MurallaDeBatalla): boolean {
  return hayMuralla(m) && conjuntosDe(m).cierra;
}

/** ¿Es `h` un muro? */
export function esMuro(m: MurallaDeBatalla, h: Hex): boolean {
  return nivelDe(m, h) === 1;
}

/**
 * El nivel del hex `h`: 1 en lo alto de un muro, 0 en el suelo. LA pregunta del
 * nivel: la leen el cuerpo a cuerpo, la línea de tiro, la defensa del tirador,
 * la IA y el lienzo. Sin muros, 0 sin mirar ningún conjunto: la hace cada
 * batalla del mapa, que no lleva muralla.
 */
export function nivelDe(m: MurallaDeBatalla, h: Hex): 0 | 1 {
  if (m.muros.length === 0 || !isInside(h)) return 0;
  return conjuntosDe(m).murosPorIndice[indiceDe(h)] === 1 ? 1 : 0;
}

/**
 * ¿Está `s` en lo alto de la muralla? Se deriva de su hex: estar en un muro ES
 * estar arriba.
 */
export function enLoAlto(
  state: Pick<BattleState, 'muralla'>,
  s: Pick<BattleStack, 'hex'>,
): boolean {
  return nivelDe(state.muralla, s.hex) === 1;
}

/** ¿Están `a` y `b` al mismo nivel? Es lo que pide el cuerpo a cuerpo. */
export function mismoNivel(
  state: Pick<BattleState, 'muralla'>,
  a: Pick<BattleStack, 'hex'>,
  b: Pick<BattleStack, 'hex'>,
): boolean {
  return nivelDe(state.muralla, a.hex) === nivelDe(state.muralla, b.hex);
}

/**
 * Lo que suma a la defensa de `s` estar en lo alto: `MURALLA.defensaEnLoAlto` si
 * es un tirador en un muro, y 0 si no. LA regla: la leen el daño de verdad
 * (`strike`, `shoot`), la IA al medir el daño y la ficha de la arena.
 */
export function bonoEnLoAlto(state: Pick<BattleState, 'muralla'>, s: BattleStack): number {
  return enLoAlto(state, s) && isShooter(s.unit) ? MURALLA.defensaEnLoAlto : 0;
}

/**
 * Los hexes de muro. Es donde no despliega nadie (nadie empieza arriba) y lo que
 * el atacante del suelo no pisa andando.
 */
export function casillasDeMuro(m: MurallaDeBatalla): ReadonlySet<string> {
  return conjuntosDe(m).muros;
}

/**
 * Lo que la muralla le cierra a una unidad de `side`, que vuela o no, con las
 * puertas como están (`puertas`). LA regla de por dónde se va, en un sitio:
 *
 * - `posarse`: donde no puede acabar. Nada: al muro se sube, andando o volando,
 *   y las casillas de una puerta son suelo, para los dos bandos.
 * - `recorrer`: por donde no pasa al andar. Nada más que lo de `posarse`.
 * - `paso`: el paso que no se da al andar: el de los niveles (`pasoPermitido`) y
 *   el que cruza una puerta cerrada. Al volador no le quita nada: `undefined`.
 *
 * Toda unidad ocupa una casilla (13-10-2026): lo que la muralla le cerraba a la
 * de dos —el muro bajo la cola, la puerta entre la cabeza y la cola— se fue con
 * ella (simplify de F3-F6, 19-10-2026).
 */
export interface CierreDeLaMuralla {
  readonly posarse: ReadonlySet<string>;
  readonly recorrer: ReadonlySet<string>;
  readonly paso: PasoPermitido | undefined;
}

export function cierreDeLaMuralla(
  m: MurallaDeBatalla,
  puertas: readonly EstadoDePuerta[],
  side: Side,
  vuela: boolean,
): CierreDeLaMuralla {
  if (!hayMuralla(m)) return SIN_CIERRE;
  const v = vigenteDe(m, puertas);
  const clave = `${side}|${vuela}`;
  const hecho = v.cierres.get(clave);
  if (hecho !== undefined) return hecho;
  const cierre: CierreDeLaMuralla = {
    posarse: NINGUNA,
    recorrer: NINGUNA,
    paso: vuela ? undefined : pasoAlAndar(m, puertas, side),
  };
  v.cierres.set(clave, cierre);
  return cierre;
}

/**
 * El paso que cortan las puertas cerradas, solo eso, o `undefined` si no hay
 * ninguna cerrada: lo lee quien ya cierra los muros enteros (el atacante del
 * suelo, en `movableFrom`).
 */
export function pasoPorPuertas(
  m: MurallaDeBatalla,
  puertas: readonly EstadoDePuerta[],
): PasoPermitido | undefined {
  return m.puertas.length === 0 ? undefined : vigenteDe(m, puertas).pasoPorPuertas;
}

/**
 * El paso de la de una casilla que anda: el de los niveles (`pasoPermitido`,
 * con o sin lados) y el de las puertas cerradas, juntos. `undefined` si ninguno
 * le quita nada.
 */
export function pasoAlAndar(
  m: MurallaDeBatalla,
  puertas: readonly EstadoDePuerta[],
  side: Side,
  conLados = true,
): PasoPermitido | undefined {
  const niveles = pasoPermitido(m, side, conLados);
  if (m.puertas.length === 0) return niveles;
  const v = vigenteDe(m, puertas);
  const porPuertas = v.pasoPorPuertas;
  if (porPuertas === undefined) return niveles;
  if (niveles === undefined) return porPuertas;
  const clave = `${side}|${conLados}`;
  const hecho = v.pasos.get(clave);
  if (hecho !== undefined) return hecho;
  const paso: PasoPermitido = (desde, hasta) => niveles(desde, hasta) && porPuertas(desde, hasta);
  v.pasos.set(clave, paso);
  return paso;
}

/**
 * El paso que `side` puede dar andando de una casilla a su vecina, por índice
 * (`indiceDe`), o `undefined` si cualquiera. LA regla de los niveles al andar
 * (las puertas, aparte: `pasoAlAndar`):
 *
 * - suelo → muro: solo el defensor, y solo desde dentro (las escaleras de
 *   dentro). El atacante sube con `subir`, que no es un paso;
 * - muro → muro: cualquiera que esté arriba;
 * - muro → suelo: cualquiera, solo hacia dentro (`ladoDeLaMuralla`). Al que subió
 *   escalando se le cierra el camino por donde vino: el usuario, al probarlo,
 *   «el que está arriba no debería poder bajar por la parte de fuera».
 *
 * `conLados = false` es la regla sin dentro ni fuera —la de antes de la
 * ampliación—: la lee solo `movimientoBlocker`, para decir si lo que no deja
 * llegar es el lado. Sin muros, `undefined`.
 */
export function pasoPermitido(
  m: MurallaDeBatalla,
  side: Side,
  conLados = true,
): PasoPermitido | undefined {
  if (m.muros.length === 0) return undefined;
  const c = conjuntosDe(m);
  const ataca = side === 'attacker';
  // Sin lados, el defensor anda como en el suelo: el mismo recorrido de siempre.
  if (!ataca && !conLados) return undefined;
  const clave = `${side}|${conLados}`;
  const hecho = c.pasos.get(clave);
  if (hecho !== undefined) return hecho;
  const muro = c.murosPorIndice;
  const dentro = conLados ? c.dentroPorIndice : TODO_DENTRO;
  const paso: PasoPermitido = (desde, hasta) =>
    muro[hasta] === 1
      ? muro[desde] === 1 || (!ataca && dentro[desde] === 1)
      : muro[desde] === 0 || dentro[hasta] === 1;
  c.pasos.set(clave, paso);
  return paso;
}

const NINGUNA: ReadonlySet<string> = new Set();
/** La regla sin lados (`pasoPermitido` con `conLados = false`): todo es dentro. */
const TODO_DENTRO = new Uint8Array(BOARD_SIZE).fill(1);
const SIN_CIERRE: CierreDeLaMuralla = {
  posarse: NINGUNA,
  recorrer: NINGUNA,
  paso: undefined,
};

/** Los lados de las puertas de `lista`, en los dos sentidos. */
function ladosDe(lista: readonly PuertaDeMuralla[]): Set<number> {
  const cortes = new Set<number>();
  for (const { a, b } of lista) {
    const i = indiceDe(a);
    const j = indiceDe(b);
    cortes.add(codigoDeLado(i, j));
    cortes.add(codigoDeLado(j, i));
  }
  return cortes;
}

/**
 * Lo que depende de qué puertas están abiertas, para una combinación: se guarda
 * en la muralla por la lista de las abiertas (`claveDeAbiertas`).
 */
interface Vigente {
  /** Los lados de las puertas cerradas, en los dos sentidos; `undefined` si no hay ninguna. */
  readonly cortes: ReadonlySet<number> | undefined;
  /** El paso que corta una puerta cerrada, o `undefined` si no hay ninguna. */
  readonly pasoPorPuertas: PasoPermitido | undefined;
  /** Los de `cierreDeLaMuralla`, por `bando|vuela`. */
  readonly cierres: Map<string, CierreDeLaMuralla>;
  /** Los de `pasoAlAndar`, por `bando|con lados`. */
  readonly pasos: Map<string, PasoPermitido>;
}

/**
 * La clave de las puertas abiertas: sus casillas, en el orden del estado. `''`
 * si no hay ninguna, que es como empieza toda batalla.
 */
export function claveDeAbiertas(puertas: readonly EstadoDePuerta[]): string {
  let clave = '';
  for (const p of puertas) if (p.abierta) clave += `${hexKey(p.a)}|${hexKey(p.b)};`;
  return clave;
}

function vigenteDe(m: MurallaDeBatalla, puertas: readonly EstadoDePuerta[]): Vigente {
  const c = conjuntosDe(m);
  const clave = claveDeAbiertas(puertas);
  const hecho = c.vigentes.get(clave);
  if (hecho !== undefined) return hecho;
  for (const p of puertas) {
    if (!m.puertas.some((q) => mismaPuerta(p, q))) {
      throw new Error(`${nombreDePuerta(p)} no es una puerta de esta muralla`);
    }
  }
  const cerradas = m.puertas.filter((p) => !puertaAbierta(puertas, p));
  const cortes = cerradas.length === 0 ? undefined : ladosDe(cerradas);
  const v: Vigente = {
    cortes,
    pasoPorPuertas:
      cortes === undefined ? undefined : (desde, hasta) => !cortes.has(codigoDeLado(desde, hasta)),
    cierres: new Map(),
    pasos: new Map(),
  };
  c.vigentes.set(clave, v);
  return v;
}

interface Conjuntos {
  readonly muros: ReadonlySet<string>;
  /** 1 en el índice de cada muro (`indiceDe`): lo leen el nivel y el paso sin claves de texto. */
  readonly murosPorIndice: Uint8Array;
  /**
   * 1 en el índice de cada casilla adonde se baja de lo alto y desde donde sube
   * el defensor: el suelo de dentro (`ladoDeLaMuralla`).
   */
  readonly dentroPorIndice: Uint8Array;
  /** 1 en el índice de cada casilla de suelo de fuera (`ladoDeLaMuralla`). */
  readonly fueraPorIndice: Uint8Array;
  /** ¿Separa la salida del defensor de la del atacante? */
  readonly cierra: boolean;
  /** Los de `pasoPermitido`, por `bando|con lados`: uno por muralla. */
  readonly pasos: Map<string, PasoPermitido>;
  /** Lo que depende de las puertas abiertas, por `claveDeAbiertas`. */
  readonly vigentes: Map<string, Vigente>;
}

/**
 * Se piden en cada recorrido del tablero —decenas por decisión—, y la muralla
 * no cambia en toda la batalla: se calculan una vez por objeto (y lo de las
 * puertas, una vez por combinación de abiertas).
 */
const CACHE = new WeakMap<MurallaDeBatalla, Conjuntos>();

function conjuntosDe(m: MurallaDeBatalla): Conjuntos {
  const hecho = CACHE.get(m);
  if (hecho !== undefined) return hecho;
  const muros = new Set(m.muros.map(hexKey));
  const murosPorIndice = new Uint8Array(BOARD_SIZE);
  for (const h of m.muros) murosPorIndice[indiceDe(h)] = 1;
  const { fuera, cierra } = dentroYFuera(muros, ladosDe(m.puertas));
  const dentro = new Uint8Array(BOARD_SIZE);
  for (const [i, hex] of allHexes().entries())
    dentro[i] = muros.has(hexKey(hex)) || fuera[i] === 1 ? 0 : 1;
  const c: Conjuntos = {
    muros,
    murosPorIndice,
    dentroPorIndice: dentro,
    fueraPorIndice: fuera,
    cierra,
    pasos: new Map(),
    vigentes: new Map(),
  };
  CACHE.set(m, c);
  return c;
}

/**
 * El suelo de fuera (`ladoDeLaMuralla`): el que queda más cerca andando, sin
 * pisar muro ni cruzar ninguna puerta (todas cerradas, `cortes`), de la salida
 * del atacante que de la del defensor. Y si la forma cierra: si desde la salida
 * del defensor no se llega a la del atacante.
 */
function dentroYFuera(
  muros: ReadonlySet<string>,
  cortes: ReadonlySet<number>,
): {
  fuera: Uint8Array;
  cierra: boolean;
} {
  const alDefensor = distanciasDesde('defender', muros, cortes);
  const alAtacante = distanciasDesde('attacker', muros, cortes);
  const fuera = new Uint8Array(BOARD_SIZE);
  let cierra = true;
  for (const [i, hex] of allHexes().entries()) {
    if (muros.has(hexKey(hex))) continue;
    // Sin llegar, la distancia es `Infinity`: un empate o un hueco cerrado es dentro.
    if ((alAtacante[i] as number) < (alDefensor[i] as number)) fuera[i] = 1;
    if (bandoDeSalida(hex) === 'attacker' && alDefensor[i] !== Infinity) cierra = false;
  }
  return { fuera, cierra };
}

/** Los pasos andando de cada casilla a la salida de `side`, por índice; `Infinity` si no se llega. */
function distanciasDesde(
  side: Side,
  muros: ReadonlySet<string>,
  cortes: ReadonlySet<number>,
): Float64Array {
  const dist = new Float64Array(BOARD_SIZE).fill(Infinity);
  let frente: Hex[] = [];
  for (const [i, hex] of allHexes().entries()) {
    if (bandoDeSalida(hex) !== side || muros.has(hexKey(hex))) continue;
    dist[i] = 0;
    frente.push(hex);
  }
  for (let d = 1; frente.length > 0; d++) {
    const siguiente: Hex[] = [];
    for (const h of frente) {
      const desde = indiceDe(h);
      for (const n of neighbours(h)) {
        const i = indiceDe(n);
        if (dist[i] !== Infinity || muros.has(hexKey(n)) || cortes.has(codigoDeLado(desde, i)))
          continue;
        dist[i] = d;
        siguiente.push(n);
      }
    }
    frente = siguiente;
  }
  return dist;
}

/**
 * Una muralla de fuera —el borrador de la arena, el enlace, `data/sitios.json`, lo
 * que mande quien sea— o excepción con lo que no se entiende. Devuelve una copia
 * limpia y congelada: nada de lo que llega se guarda por referencia.
 *
 * Cada puerta es `{a, b}`: dos casillas vecinas en horizontal, `b` justo al este
 * de `a`, ninguna de las dos un muro. Una puerta de antes de la ampliación 4
 * —una casilla, `{col, row}`— se rechaza diciéndolo: el borrador la conserva
 * tal cual y la marca como inválida.
 *
 * **Lo que ya devolvió, lo devuelve tal cual** (`VALIDADAS`): `createBattle` la
 * pide siempre, y así las batallas contra una ciudad comparten el objeto de su
 * muralla y sus cachés (`conjuntosDe`), en vez de rehacerlas por batalla. Lo que
 * devuelve está congelado, así que no puede dejar de valer.
 */
export function validarMuralla(valor: unknown): MurallaDeBatalla {
  if (VALIDADAS.has(valor as MurallaDeBatalla)) return valor as MurallaDeBatalla;
  const [problema] = problemasDeObjeto(valor, CAMPOS_DE_LA_MURALLA, CAMPOS_DE_LA_MURALLA);
  if (problema !== undefined) throw new Error(`la muralla: ${problema}`);
  const o = valor as Record<string, unknown>;
  const material = o.material;
  if (!esMaterialDeMuralla(material)) {
    throw new Error(`la muralla: material ${deLaListaBlocker(material, MATERIALES_DE_MURALLA)}`);
  }
  if (!Array.isArray(o.muros)) throw new Error('la muralla necesita «muros» como lista de hexes');
  if (!Array.isArray(o.puertas)) {
    throw new Error('la muralla necesita «puertas» como lista de {a, b}');
  }
  const vistos = new Set<string>();
  const muros = Object.freeze(
    o.muros.map((h: unknown, i) => {
      const hex = hexDeLaMuralla(h, `muro ${i + 1}`);
      const clave = hexKey(hex);
      if (vistos.has(clave)) throw new Error(`la muralla repite muro en (${hex.col},${hex.row})`);
      vistos.add(clave);
      return hex;
    }),
  );
  const puestas: PuertaDeMuralla[] = [];
  const puertas = Object.freeze(
    o.puertas.map((p: unknown, i) => {
      const puerta = puertaDeLaMuralla(p, i + 1);
      for (const h of [puerta.a, puerta.b]) {
        if (vistos.has(hexKey(h))) {
          throw new Error(
            `la puerta ${nombreDePuerta(puerta)} cae en el muro de (${h.col},${h.row}): va entre dos casillas de suelo`,
          );
        }
      }
      if (puestas.some((q) => mismaPuerta(q, puerta))) {
        throw new Error(`la muralla repite la puerta ${nombreDePuerta(puerta)}`);
      }
      puestas.push(puerta);
      return puerta;
    }),
  );
  const m: MurallaDeBatalla = Object.freeze({ muros, puertas, material });
  VALIDADAS.add(m);
  return m;
}

/** Los campos de una muralla, todos obligatorios: lo demás se rechaza diciéndolo. */
const CAMPOS_DE_LA_MURALLA: readonly string[] = ['muros', 'puertas', 'material'];

/** Lo que ha devuelto `validarMuralla` (y el vacío de siempre): congelado y ya juzgado. */
const VALIDADAS = new WeakSet<MurallaDeBatalla>([SIN_MURALLA]);

function puertaDeLaMuralla(p: unknown, n: number): PuertaDeMuralla {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    throw new Error(`la muralla: la puerta ${n} no es un {a, b}`);
  }
  const o = p as Record<string, unknown>;
  if ('col' in o || 'row' in o) {
    throw new Error(
      `la muralla: la puerta ${n} es una casilla, como antes; ahora una puerta va entre dos casillas vecinas en horizontal: {a, b}, con b al este de a`,
    );
  }
  const sobra = Object.keys(o).filter((k) => k !== 'a' && k !== 'b');
  if (sobra.length > 0) {
    throw new Error(`la muralla: la puerta ${n} no entiende «${sobra.join('», «')}»`);
  }
  const a = hexDeLaMuralla(o.a, `lado a de la puerta ${n}`);
  const b = hexDeLaMuralla(o.b, `lado b de la puerta ${n}`);
  if (b.row !== a.row || b.col !== a.col + 1) {
    throw new Error(
      `la muralla: la puerta ${n} va de (${a.col},${a.row}) a (${b.col},${b.row}); sus dos casillas tienen que ser vecinas en horizontal, b justo al este de a`,
    );
  }
  return Object.freeze({ a, b });
}

function hexDeLaMuralla(h: unknown, cual: string): Hex {
  if (typeof h !== 'object' || h === null) {
    throw new Error(`la muralla: el ${cual} no es un hex {col, row}`);
  }
  const { col, row } = h as Record<string, unknown>;
  if (!Number.isInteger(col) || !Number.isInteger(row)) {
    throw new Error(`la muralla: el ${cual} necesita col y row enteros`);
  }
  const c = col as number;
  const r = row as number;
  if (!isInside({ col: c, row: r })) {
    throw new Error(
      `la muralla: el ${cual} cae en (${c},${r}), fuera del tablero (${FORMA_DEL_TABLERO})`,
    );
  }
  return Object.freeze({ col: c, row: r });
}

/**
 * Por qué `m` no vale como muralla de una batalla del mapa (`data/sitios.json`: la
 * de las ciudades y la de los pueblos), o `null` si vale. Lo pide la carga de los
 * sitios (`state/sitios.ts`), que antes la valida como muralla (`validarMuralla`) y
 * lanza nombrando el fichero: una forma que no cumple esto no llega a ninguna
 * partida. La arena dibuja lo que quiera; esto es lo que el mapa exige, porque allí
 * nadie la arregla a media pelea:
 *
 * - que **cierre** (D7: «las murallas sí cierran»): sin rodearla andando;
 * - que **se asalte**: un muro con un pie de suelo `fuera` desde el que poner la
 *   escalera y, andando de muro a muro, un muro junto a suelo `dentro` adonde bajar
 *   (`asaltoBlocker`);
 * - que lleve **puertas**, y que cada una separe `fuera` de `dentro`
 *   (`ladoDeLaMuralla`): una que no separa no sirve de nada;
 * - que quepan `LIDERAZGO.maxPorBando` en la salida de cada bando (`salidaDe`).
 *
 * En este orden, para que cada regla tenga su forma rota y su frase: con las
 * puertas antes, una forma sin suelo fuera o dentro no tiene puertas que separen, y
 * la frase que salía era la de la puerta. Sin esto, una forma rota daba una batalla
 * que acababa por `MAX_ROUNDS` (el riesgo 3 del plan): aquí se para al cargar.
 */
export function murallaDelMapaBlocker(m: MurallaDeBatalla): string | null {
  if (!cierra(m)) return 'una muralla del mapa cierra: con esta, el atacante la rodea andando';
  const asalto = asaltoBlocker(m);
  if (asalto !== null) return asalto;
  if (m.puertas.length === 0) return 'una muralla del mapa lleva al menos una puerta';
  for (const p of m.puertas) {
    const lados = [ladoDeLaMuralla(m, p.a), ladoDeLaMuralla(m, p.b)];
    if (!lados.includes('fuera') || !lados.includes('dentro')) {
      return `la puerta ${nombreDePuerta(p)} no separa fuera de dentro: no sirve de nada`;
    }
  }
  for (const side of SIDES) {
    const { motivo } = salidaDe(LIDERAZGO.maxPorBando, side, casillasDeMuro(m));
    if (motivo !== null) return `no caben los ${LIDERAZGO.maxPorBando} de un bando: ${motivo}`;
  }
  return null;
}

/**
 * Por qué no se puede asaltar `m` (subir por fuera y bajar dentro), o `null` si se
 * puede: de un muro con un pie `fuera`, andando como anda el atacante arriba
 * (`pasoPermitido`: de muro a muro, y de lo alto solo hacia dentro), a suelo
 * `dentro`. No reescribe el paso de lo alto: lo recorre.
 */
function asaltoBlocker(m: MurallaDeBatalla): string | null {
  const conPie = m.muros.filter((w) =>
    neighbours(w).some((n) => !esMuro(m, n) && ladoDeLaMuralla(m, n) === 'fuera'),
  );
  if (conPie.length === 0) {
    return 'ningún muro tiene un pie de suelo fuera desde el que poner una escalera';
  }
  const paso = pasoPermitido(m, 'attacker');
  const bajaDentro = conPie.some((w) =>
    [...reachable(w, BOARD_SIZE, NINGUNA, paso).values()].some(
      (p) => ladoDeLaMuralla(m, p.at) === 'dentro',
    ),
  );
  return bajaDentro
    ? null
    : 'subiendo por fuera no se llega andando por lo alto a ningún muro con suelo dentro adonde bajar';
}

/**
 * Cómo se nombra cada cosa en la regla de la muralla dicha (`reglaDeLaMuralla`):
 * los bandos y las cuatro jugadas. La arena dice «la izquierda» y «poner la
 * escalera»; el agente, «el ATACANTE» y `"place_ladder"`.
 */
export interface PalabrasDeLaMuralla {
  /** Quien ataca y quien defiende, como sujeto de una frase: «la izquierda (ataca)». */
  readonly atacante: string;
  readonly defensor: string;
  /** Las cuatro jugadas, como verbo: «ponerla», «subir», «la abre», «la cierra». */
  readonly ponerEscalera: string;
  readonly subir: string;
  readonly abrir: string;
  readonly cerrar: string;
}

/**
 * **La regla de la muralla dicha, una vez** (simplify de la fase 2 del puesto
 * fronterizo, 04-11-2026): el muro alto y quién sube, de lo alto solo hacia dentro,
 * el volador, las puertas, el tiro y el bono del tirador en lo alto, con las
 * palabras de quien la lee (`PalabrasDeLaMuralla`). La leen la ayuda del editor de la
 * arena y el `_comment` de su borrador (`REGLA_DE_LA_MURALLA`) y la prosa del agente
 * (`contract/formato.ts`): eran tres copias a mano, y dos ya se habían quedado diciendo la regla
 * del primer ciclo (QA de la muralla alta, I1). Lo que solo es de quien la lee —el
 * dentro y fuera del editor, los campos de `walls`— lo pone cada uno.
 */
export function reglaDeLaMuralla(p: PalabrasDeLaMuralla): string {
  return [
    `El muro es alto, una columna: ${p.defensor} sube andando desde dentro; ${p.atacante} sube desde su pie, sin haberse movido ese turno, con escalera (un turno ${p.ponerEscalera}, y se queda puesta para quien llegue; otro, ${p.subir}) o si sabe escalar, y al subir no hace nada más ese turno.`,
    'Arriba se anda de muro a muro, y de lo alto solo se baja hacia dentro, sea quien sea.',
    'Los voladores se posan en lo alto sin escalera y bajan donde quieran.',
    `Las puertas empiezan cerradas: cerrada no la cruza nadie que ande, tampoco ${p.defensor}, y tapa el tiro; abierta la cruza cualquiera, de los dos bandos, y no tapa. ${mayuscula(p.defensor)} ${p.abrir} y ${p.cerrar} al principio del turno de una de sus unidades, antes de moverla (no gasta el turno), cada puerta una vez por turno.`,
    `En el suelo nadie dispara a través de un muro ni de una puerta cerrada; desde lo alto, o a quien está arriba, sí, y un tirador en lo alto suma ${MURALLA.defensaEnLoAlto} a su defensa.`,
  ].join(' ');
}

function mayuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * La muralla de la arena, de `data/muralla.json`. **Inventado y provisional**,
 * como dice su `_comment`: en HoMM2 no hay tirador que se suba al muro.
 */
export interface ReglasDeLaMuralla {
  /** Lo que suma a su defensa un tirador en lo alto de un muro (`effectiveDefense`). */
  readonly defensaEnLoAlto: number;
}

/** Se edita a mano: una cifra que no es un entero ≥ 0 se dice al cargar, no en la batalla. */
function defensaEnLoAlto(v: unknown): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0) {
    throw new Error(
      `data/muralla.json: defensaEnLoAlto tiene que ser un entero de 0 en adelante y es ${JSON.stringify(v)}`,
    );
  }
  return v as number;
}

export const MURALLA: ReglasDeLaMuralla = {
  defensaEnLoAlto: defensaEnLoAlto(murallaJson.defensaEnLoAlto),
};
