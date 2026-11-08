/**
 * Lo que se pregunta a una batalla sin cambiarla: de quién es el turno y en qué fase
 * está (`activeStack`, `faseDelTurno`, `faseBlocker`), lo que le queda a una unidad
 * (`pasosQueQuedan`), a dónde puede ir y por qué no (`movableFrom`,
 * `movimientoBlocker`), las distancias andando con la muralla (`distanciaHasta`), quién
 * toca a quién (`canReachMelee`) y lo que cuesta salir del contacto (`costesDelPaso`),
 * el golpe preparado (`golpePreparado`) y su carga (`cargaDesde`, `medirCargas`,
 * `casillasDeCarga`), el contraataque y la salpicadura, lo que impide un hechizo
 * (`impedimentoBlocker`), la rendición (`surrenderBlocker`) y el final
 * (`bandoVencido`, `causaDelFinal`).
 *
 * Es lo más bajo de la batalla: lo leen el motor (`battle.ts`), las piezas que juzgan
 * cada jugada (`golpe.ts`, `a-distancia.ts`, `lanzar.ts`, `asalto.ts`, `legalidad.ts`,
 * `prevision.ts`), la IA y la pantalla, y no importa ninguna de ellas. Vivía en
 * `battle.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import { HEROE } from '../hero/cuerpo-del-heroe.js';
import { HECHIZOS_DEL_JUEGO } from '../magia/catalogo.js';
import { dichoDeImpide } from '../magia/dicho.js';
import type { Hechizo, Impedible } from '../magia/formato.js';
import { type Hex, hasTrait, SPEED_TO_HEXES } from '../types.js';
import { montadoDeGuerra } from '../unidad/cuerpo.js';
import {
  alcanceConCostes,
  allHexes,
  areAdjacent,
  BOARD_SIZE,
  type CosteDeSalir,
  carreraConCostes,
  distanciasDesde,
  hexDistance,
  hexEquals,
  hexKey,
  indiceDe,
  isInside,
  neighbours,
  type PasoPermitido,
  quedanCasillas,
  reachable,
  rectaLibre,
  siguienteEnRecta,
} from './board.js';
import { CARGA, CARGA_MINIMA, cargaEfectiva, porcientoDeLaCarga } from './carga.js';
import { fraseDelContacto, salirCuesta } from './contacto.js';
import { effectTotal, impedidoPor } from './effects.js';
import { formaDeLaBatalla } from './formas-de-la-rueda.js';
import {
  type CierreDeLaMuralla,
  casillasDeMuro,
  cierreDeLaMuralla,
  claveDeAbiertas,
  enLoAlto,
  esMuro,
  hayMuralla,
  ladoDeLaMuralla,
  mismoNivel,
  nivelDe,
  pasoAlAndar,
  pasoPorPuertas,
} from './muralla.js';
import { cruceBlocker } from './rueda.js';
import type {
  BattleAction,
  BattleStack,
  BattleState,
  CargaMedida,
  GolpeEnCurso,
  MurallaDeBatalla,
  Paso,
  Side,
  TurnoDeUnidad,
} from './types.js';

export function stackById(state: BattleState, id: string): BattleStack {
  const found = state.stacks.find((s) => s.id === id);
  if (found === undefined) throw new Error(`stack desconocido: "${id}"`);
  return found;
}

export function isAlive(s: BattleStack): boolean {
  return s.count > 0;
}

/**
 * Σ `f` sobre lo que un bando tiene en pie, en el orden de `stacks`. Es la
 * suma; qué se suma —efectivos, amenaza, peso— lo decide quien la pide, y
 * cada medida sigue siendo suya.
 */
export function sumaDelBando(
  state: BattleState,
  side: Side,
  f: (s: BattleStack) => number,
): number {
  let total = 0;
  for (const s of state.stacks) {
    if (s.side === side && isAlive(s)) total += f(s);
  }
  return total;
}

export function activeStack(state: BattleState): BattleStack | null {
  return state.turno === null ? null : stackById(state, state.turno.stack);
}

/**
 * Las casillas que le quedan a `s` en este turno: su velocidad menos lo que
 * lleva gastado si es quien está actuando, y la velocidad entera si no. La
 * velocidad se lee ahora y no al abrir el turno, así que una Lentitud a mitad
 * de turno recorta lo que queda —sin bajar de 0— en vez de llegar tarde. Tras
 * golpear con Finta (la rueda), resta además lo que quita su éxito
 * (`TurnoDeUnidad.finta`): «lo que le queda menos la penalización» (decisión del
 * usuario, 14-10-2026). No va en `gastado`, que son las casillas recorridas.
 */
export function pasosQueQuedan(state: BattleState, s: BattleStack): number {
  return Math.max(0, stackSpeed(s) - gastadoEn(state, s) - fintaEn(state, s));
}

/** Lo que `s` lleva gastado en este turno: 0 si no es quien está actuando. */
function gastadoEn(state: BattleState, s: BattleStack): number {
  return state.turno !== null && state.turno.stack === s.id ? state.turno.gastado : 0;
}

/** Lo que le resta la Finta a `s` en este turno: 0 si no golpeó con ella o no le toca. */
function fintaEn(state: BattleState, s: BattleStack): number {
  return state.turno !== null && state.turno.stack === s.id ? (state.turno.finta ?? 0) : 0;
}

/**
 * En qué fase está el turno abierto: `libre` (no ha hecho nada que lo limite),
 * `movido` (ha andado un tramo: ya no apunta; decisión del usuario),
 * `plantado` (espera la rueda, `golpeEnCurso`: ante su objetivo, o en su salida
 * si carga, que la carga se elige antes de correr) o `trasLaFinta` (ha golpeado con Finta y le queda un
 * tramo solo de andar, `TurnoDeUnidad.finta`). `null` sin turno abierto. Las
 * fases que limitan qué jugada vale las dice `faseBlocker`.
 */
type FaseDelTurno = 'libre' | 'movido' | 'plantado' | 'trasLaFinta';

export function faseDelTurno(state: BattleState): FaseDelTurno | null {
  const turno = state.turno;
  if (turno === null) return null;
  if (state.golpeEnCurso !== null) return 'plantado';
  if (turno.finta !== undefined) return 'trasLaFinta';
  return turno.gastado > 0 ? 'movido' : 'libre';
}

/**
 * Por qué la unidad activa no puede jugar `tipo` por la fase de su turno, o
 * `null`. Plantado ante su objetivo, solo vale ese golpe (lo fino, contra quién y
 * con qué elecciones, lo dice `golpeEnCursoBlocker`); tras la Finta, el resto del
 * turno es un tramo **solo de andar**: andar o terminar (decisión del usuario,
 * 14-10-2026), ni volver a golpear, ni disparar, ni un poder, ni el hechizo del
 * héroe, ni rendirse, ni puertas o escaleras. Lo de después
 * de un tramo (`movido`) lo dice cada jugada con su frase, en su sitio entre sus
 * otros motivos. La leen `applyAction`, la lista legal (que ofrece lo de su
 * fase) y el principio de cada `*Blocker` que pinta la pantalla.
 */
export function faseBlocker(state: BattleState, tipo: BattleAction['type']): string | null {
  switch (faseDelTurno(state)) {
    case 'plantado':
      return tipo === 'attack' ? null : PLANTADO(state.golpeEnCurso as GolpeEnCurso);
    case 'trasLaFinta':
      return tipo === 'move' || tipo === 'end_turn' ? null : TRAS_LA_FINTA;
    default:
      return null;
  }
}

const TRAS_LA_FINTA = 'tras golpear con Finta solo puede andar o terminar el turno';

/** La frase del golpe plantado: la dicen `faseBlocker` y `golpeEnCursoBlocker`. */
const PLANTADO = (g: GolpeEnCurso): string =>
  `${g.stack} está plantado ante ${g.target}: elige en la rueda o cancela el golpe`;

/**
 * La firma del turno abierto: el ordinal, lo gastado, lo que le quitó la Finta y
 * el golpe plantado que espera la rueda. Dos estados con la misma firma tienen el
 * mismo recorrido por andar (con las mismas puertas, que van aparte). La leen
 * `applyAction`, que rechaza un `Movibles` de otra firma, y la clave de las
 * cachés de la sesión. Sin la Finta, un recorrido de antes de golpear con ella
 * valía después y andaba de más; sin el golpe plantado, la carga, que se planta
 * sin andar ni gastar (31-10-2026), dejaba la misma firma antes y después.
 */
export function firmaDelTurno(turno: TurnoDeUnidad, plantado: GolpeEnCurso | null): string {
  const finta = turno.finta === undefined ? '' : ` y ${turno.finta} menos por la Finta`;
  const gastadas = turno.gastado === 1 ? '1 casilla gastada' : `${turno.gastado} casillas gastadas`;
  const golpe = plantado === null ? '' : `, plantado ante ${plantado.target}`;
  return `turno ${turno.n} con ${gastadas}${finta}${golpe}`;
}

/**
 * ¿Son `a` y `b` el MISMO turno? Por el ordinal, que es lo único que no se deja
 * engañar por la misma unidad en dos turnos seguidos (la última de una ronda que
 * abre la siguiente) ni por una copia del
 * estado (el mismo turno, otro objeto). `null` no es el mismo turno que nada.
 */
export function mismoTurno(
  a: Pick<TurnoDeUnidad, 'n'> | null | undefined,
  b: Pick<TurnoDeUnidad, 'n'> | null | undefined,
): boolean {
  return a != null && b != null && a.n === b.n;
}

/**
 * ¿Ha movido ya `s` en este turno? Tras moverse no se apunta (decisión del
 * usuario): solo queda moverse más, golpear o terminar. Cada `move` cuesta al menos una casilla, así que «ha movido» es
 * «lleva algo gastado».
 */
export function seHaMovido(state: BattleState, s: BattleStack): boolean {
  return gastadoEn(state, s) > 0;
}

export function stackSpeed(s: BattleStack): number {
  const base = SPEED_TO_HEXES[s.unit.speed];
  // La agilidad de un hechizo mueve también las casillas, salvo montado de guerra:
  // las casillas son las de la montura (`cifrasDelCuerpo`).
  const agilidad = montadoDeGuerra(s.unit) ? 0 : effectTotal(s, 'agilidad');
  return Math.max(1, base + effectTotal(s, 'speed') + agilidad);
}

/**
 * Los hexes que ocupa un stack: el suyo. Toda unidad ocupa una casilla
 * (13-10-2026); la lista se queda porque es lo que leen el contrato (`occupies`)
 * y el tablero, que la pintan igual.
 */
export function stackHexes(s: BattleStack): Hex[] {
  return [s.hex];
}

/**
 * Los hexes en los que `s` no puede entrar: los de cualquier otra unidad viva y
 * los que la muralla le cierra para posarse (`cierreDeLaMuralla`).
 *
 * Se llamaba `blockedHexes(state, exceptId)` y solo contaba unidades. Cambió de
 * nombre y de firma con la muralla a propósito: necesita saber el BANDO de quien
 * pregunta —la puerta deja pasar al defensor—, y así el typecheck señaló a cada
 * llamante en vez de dejar alguno contando solo unidades.
 */
export function cerradasPara(state: BattleState, s: BattleStack): Set<string> {
  const cerradas = new Set<string>(cierreDe(state, s).posarse);
  for (const o of state.stacks) {
    if (!isAlive(o) || o.id === s.id) continue;
    for (const h of stackHexes(o)) cerradas.add(hexKey(h));
  }
  return cerradas;
}

/** Lo que la muralla le cierra a `s`, por su bando y si vuela. */
function cierreDe(state: BattleState, s: BattleStack): CierreDeLaMuralla {
  return cierreDeLaMuralla(state.muralla, state.puertas, s.side, hasTrait(s.unit, 'flying'));
}

/**
 * Cómo anda `s` desde donde está, con las casillas `cerradas` para posarse
 * (`cerradasPara`): lo que se le cierra a su cabeza por el camino y el paso que
 * no puede dar, si alguno (`cierreDeLaMuralla`). Sin muralla, `cerradas` tal
 * cual, el mismo objeto, y ningún paso: el banco no se mueve.
 */
function alAndar(
  state: BattleState,
  s: BattleStack,
  cerradas: ReadonlySet<string>,
): { readonly cerradas: ReadonlySet<string>; readonly paso: PasoPermitido | undefined } {
  const c = cierreDe(state, s);
  const deMas = c.recorrer === c.posarse ? cerradas : new Set([...cerradas, ...c.recorrer]);
  return { cerradas: deMas, paso: c.paso };
}

/**
 * Si `s` no cabe en `hex` —fuera del tablero o en `cerradas`—. Es LA
 * comprobación de dónde se posa una unidad: la hace `movableFrom` para cada
 * destino y `movimientoBlocker` para decir por qué no, así que una restricción
 * nueva va aquí y las dos la ven.
 */
function noCabe(hex: Hex, cerradas: ReadonlySet<string>): boolean {
  return !isInside(hex) || cerradas.has(hexKey(hex));
}

/** La frase de la casilla `c` que `noCabe` encontró cerrada a `s`. */
function porQueNoCabe(state: BattleState, s: BattleStack, c: Hex): string {
  const ocupa = state.stacks.find(
    (o) => isAlive(o) && o.id !== s.id && stackHexes(o).some((h) => hexEquals(h, c)),
  );
  if (ocupa === undefined) {
    throw new Error(`(${c.col},${c.row}) está cerrada a ${s.id} sin muro, puerta ni unidad`);
  }
  return `ahí está ${ocupa.unit.name}`;
}

/**
 * Por qué la unidad activa no puede moverse a `hex`, o `null` si puede. La frase
 * la escribe el núcleo y la leen `moveTo` —que lanza con ella— y la pantalla,
 * que la pinta tal cual. Antes el cliente inventaba «No puedes llegar a ese
 * hexágono.», que con una muralla delante no decía por qué.
 */
export function movimientoBlocker(state: BattleState, hex: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  if (!isInside(hex)) return `(${hex.col},${hex.row}) está fuera del tablero`;
  const impedido = impedimentoBlocker(state, s, 'moverse');
  if (impedido !== null) return impedido;
  if (movableFrom(state, s).has(hexKey(hex))) return null;
  if (hexEquals(hex, s.hex)) return 'ya está ahí';
  if (noCabe(hex, cerradasPara(state, s))) return porQueNoCabe(state, s, hex);
  const subida = subidaAndando(state, s, hex);
  if (subida !== null) return subida;
  // Rodeado, no va a ninguna parte: lo que le cierra es su casilla, no el camino.
  const rodeado = contactoBlocker(state, s);
  if (rodeado !== null) return rodeado;
  // La puerta antes que el lado: si abierta llegaría, lo que se lo impide es ella.
  const puerta = porLaPuerta(state, s, hex);
  if (puerta !== null) return puerta;
  const lado = porElLado(state, s, hex);
  if (lado !== null) return lado;
  const quedan = pasosQueQuedan(state, s);
  // Si fue la Finta la que se comió lo que falta, se dice (`fintaEn`).
  const finta = fintaEn(state, s) > 0 ? 'tras la Finta ' : '';
  if (quedan === 0) return `${finta}ya no le quedan casillas este turno`;
  const [verbo, casillas] = quedanCasillas(quedan);
  // Si saliendo gratis llegaría, lo que no le deja es el contacto del camino.
  if (movibles(state, s, false).has(hexKey(hex))) {
    return `no llega: ${finta}le ${verbo} ${casillas} y salir de una casilla con enemigos al lado cuesta 1 más por cada uno`;
  }
  return hayMuralla(state.muralla) && !hasTrait(s.unit, 'flying')
    ? `no llega: ${finta}le ${verbo} ${casillas} y la muralla o las unidades cortan el camino`
    : `no llega: ${finta}le ${verbo} ${casillas}`;
}

/**
 * Por qué el atacante que anda por el suelo no llega a `hex` si es un muro:
 * a la muralla no se sube andando. `null` si no es el caso.
 */
function subidaAndando(state: BattleState, s: BattleStack, hex: Hex): string | null {
  // Con dentro y fuera, el defensor también lleva un paso: no es de él de quien se habla.
  if (s.side !== 'attacker' || cierreDe(state, s).paso === undefined || enLoAlto(state, s)) {
    return null;
  }
  if (!esMuro(state.muralla, hex)) return null;
  switch (comoSube(s)) {
    case 'escalando':
      return 'a la muralla no se sube andando: desde su pie, «Subir»';
    case 'con su escalera':
      return 'a la muralla no se sube andando: desde su pie, «Poner escalera»';
    case null:
      return 'para subir a la muralla hace falta una escalera o saber escalar';
  }
}

/**
 * Cómo sube `s` desde un pie sin escalera puesta: escalando (rasgo `escalar`),
 * poniendo la suya, o de ninguna manera. Una escalera puesta la usa cualquiera.
 */
export function comoSube(s: BattleStack): 'escalando' | 'con su escalera' | null {
  if (hasTrait(s.unit, 'escalar')) return 'escalando';
  return s.escalera ? 'con su escalera' : null;
}

/**
 * Por qué `s` no llega a `hex` si lo que se lo impide es el lado de la muralla
 * (`pasoPermitido`): con la regla sin dentro ni fuera llegaría, y con ella no.
 * `null` si no es el caso. Si `hex` es de fuera, lo que no le deja es bajar a
 * él; si no, subir desde fuera.
 */
function porElLado(state: BattleState, s: BattleStack, hex: Hex): string | null {
  const m = state.muralla;
  if (m.muros.length === 0 || hasTrait(s.unit, 'flying')) return null;
  const blocked = cerradasPara(state, s);
  const sinLados = recorrer(
    state,
    s,
    true,
    pasosQueQuedan(state, s),
    alAndar(state, s, blocked).cerradas,
    pasoAlAndar(m, state.puertas, s.side, false),
  );
  if (!sinLados.has(hexKey(hex))) return null;
  return ladoDeLaMuralla(m, hex) === 'fuera'
    ? 'desde la muralla solo se baja hacia dentro'
    : 'desde fuera no se sube a la muralla: sus escaleras están dentro';
}

/** La frase de la puerta cerrada: la dicen el paso, el camino y el tiro. */
const PUERTA_CERRADA = 'la puerta está cerrada: no pasa nadie';

/**
 * Por qué `s` no llega a `hex` si lo que se lo impide es una puerta cerrada: con
 * todas abiertas llegaría. `null` si no es el caso. Sin esto, quien señalaba lo
 * de detrás de la puerta leía «la muralla o las unidades cortan el camino».
 */
function porLaPuerta(state: BattleState, s: BattleStack, hex: Hex): string | null {
  if (hasTrait(s.unit, 'flying') || state.puertas.every((p) => p.abierta)) return null;
  const abiertas = { ...state, puertas: state.puertas.map((p) => ({ ...p, abierta: true })) };
  return movableFrom(abiertas, s).has(hexKey(hex)) ? PUERTA_CERRADA : null;
}

/**
 * Cuántos pasos le costaría a `s` ir de `desde` a pegarse a `objetivo` para
 * golpearlo —a uno de sus hexes— andando, sin contar las unidades, que se
 * mueven, pero sí la muralla, que no. `Infinity` si la muralla no le deja llegar.
 *
 * Con muralla, «pegarse» es a una casilla **de su nivel**: al pie de una
 * columna no se golpea a quien está arriba. Se recorre desde esas casillas y se
 * suma el paso que falta, que es la misma cuenta que antes sin niveles.
 */
export function distanciaACaminar(
  state: BattleState,
  s: BattleStack,
  objetivo: BattleStack,
): (desde: Hex) => number {
  const suyas = stackHexes(objetivo);
  if (!hayMuralla(state.muralla) || hasTrait(s.unit, 'flying')) {
    return distanciaHasta(state, s, suyas);
  }
  const nivel = nivelDe(state.muralla, objetivo.hex);
  const cerradas = cierreDe(state, s).recorrer;
  const vistos = new Set<string>();
  const desdeDonde: Hex[] = [];
  for (const h of suyas) {
    for (const n of neighbours(h)) {
      const k = hexKey(n);
      if (vistos.has(k) || cerradas.has(k) || nivelDe(state.muralla, n) !== nivel) continue;
      vistos.add(k);
      desdeDonde.push(n);
    }
  }
  if (desdeDonde.length === 0) return () => Number.POSITIVE_INFINITY;
  const hasta = recorrido(state, s, desdeDonde, 'golpe');
  return (desde) => hasta(desde) + 1;
}

/**
 * Cuántos pasos le costaría a `s` ir de `desde` al más cercano de `destino`
 * andando, con la muralla de su bando y sin las unidades.
 *
 * Es regla del tablero y no de la IA, por eso vive aquí. **Sin muralla, o para
 * un volador, es `hexDistance`** tal cual: la IA de siempre, hex a hex, y el
 * banco no se mueve. Con muralla, un recorrido desde `destino` —que cuenta
 * aunque esté en una puerta: al defensor se le golpea en ella—, guardado por
 * muralla, bando y destino: la IA pregunta lo mismo varias veces por decisión
 * (a quién ir, hacia dónde, si conviene esperar) y la muralla no cambia.
 */
export function distanciaHasta(
  state: BattleState,
  s: BattleStack,
  destino: readonly Hex[],
): (desde: Hex) => number {
  if (!hayMuralla(state.muralla) || hasTrait(s.unit, 'flying')) {
    return (desde) => Math.min(...destino.map((h) => hexDistance(desde, h)));
  }
  return recorrido(state, s, destino, 'pisar');
}

/**
 * Lo mismo que `distanciaHasta`, sin guardar el recorrido: para destinos que
 * dependen de dónde están las unidades ahora —los pies libres de la IA—, que en
 * la caché por muralla se irían acumulando batalla adentro sin volver a leerse.
 */
export function distanciaAndando(
  state: BattleState,
  s: BattleStack,
  destino: readonly Hex[],
): (desde: Hex) => number {
  if (!hayMuralla(state.muralla) || hasTrait(s.unit, 'flying')) {
    return (desde) => Math.min(...destino.map((h) => hexDistance(desde, h)));
  }
  const c = cierreDe(state, s);
  return distanciasDesde(destino, c.recorrer, c.paso);
}

/** El recorrido hacia atrás desde `destino`, guardado por muralla, bando y destino. */
function recorrido(
  state: BattleState,
  s: BattleStack,
  destino: readonly Hex[],
  para: 'pisar' | 'golpe',
): (desde: Hex) => number {
  let porDestino = DISTANCIAS.get(state.muralla);
  if (porDestino === undefined) {
    porDestino = new Map();
    DISTANCIAS.set(state.muralla, porDestino);
  }
  // Con las puertas abiertas: el camino cambia al abrir, y una caché solo por
  // muralla devolvería el de antes (criterio 24 de la muralla alta).
  const clave = `${claveDeAbiertas(state.puertas)}|${s.side}|${para}|${destino.map(hexKey).join('|')}`;
  let lector = porDestino.get(clave);
  if (lector === undefined) {
    const c = cierreDe(state, s);
    lector = distanciasDesde(destino, c.recorrer, c.paso);
    porDestino.set(clave, lector);
  }
  return lector;
}

/** Los recorridos de `distanciaHasta`, por muralla: por puertas abiertas, bando y destino. */
const DISTANCIAS = new WeakMap<MurallaDeBatalla, Map<string, (desde: Hex) => number>>();

export function enemiesOf(state: BattleState, s: BattleStack): BattleStack[] {
  return state.stacks.filter((o) => isAlive(o) && o.side !== s.side);
}

/**
 * ¿Hay un enemigo pegado **a su nivel**? Un tirador así no puede disparar. El
 * de lo alto de un muro no está trabado por quien tiene al pie.
 */
export function isEngaged(state: BattleState, s: BattleStack): boolean {
  return enemiesOf(state, s).some((e) => canReachMelee(state, s, e));
}

/**
 * ¿Puede `s` golpear a `target` desde donde está? Pegados y al mismo nivel: de
 * lo alto de un muro al suelo no se llega con la espada, ni del suelo arriba.
 * Es LA regla del «se tocan»: la leen el golpe, la represalia, el trabado y la
 * salpicadura.
 */
export function canReachMelee(state: BattleState, s: BattleStack, target: BattleStack): boolean {
  if (!mismoNivel(state, s, target)) return false;
  const own = stackHexes(s);
  return stackHexes(target).some((th) => own.some((oh) => areAdjacent(oh, th)));
}

/** El vivo que está en `hex`, o `null`: lo que buscan la recta del disparo y la explosión. */
export function vivoEn(state: BattleState, hex: Hex): BattleStack | null {
  return state.stacks.find((x) => isAlive(x) && hexEquals(x.hex, hex)) ?? null;
}

/**
 * Por qué `target` no vale como blanco de `s`: muerto o de su bando. `verbo` es
 * lo que se iba a hacer («atacar», «disparar»). Lo comparten el golpe, el disparo
 * y la frase de `ataqueBlocker`.
 */
export function rivalBlocker(s: BattleStack, target: BattleStack, verbo: string): string | null {
  if (!isAlive(target)) return `${target.id} ya está destruido`;
  if (target.side === s.side) return `no se puede ${verbo} a un aliado`;
  return null;
}

/**
 * Por qué `s` no puede golpear a `target` desde `from` —o desde donde está, sin
 * `from`—, o `null` si puede: vivo, rival, la casilla al alcance (en `costes`, el
 * recorrido de este tramo) y el objetivo pegado desde ella. ÚNICA redacción del
 * golpe: la leen `applyAction`, que lanza ANTES de mover, y `previsionDe`.
 */
function golpeBlocker(
  state: BattleState,
  s: BattleStack,
  target: BattleStack,
  from: Hex | undefined,
  costes: () => ReadonlyMap<string, Paso>,
): string | null {
  const rival = rivalBlocker(s, target, 'atacar');
  if (rival !== null) return rival;
  const impedido = impedimentoBlocker(state, s, 'golpear');
  if (impedido !== null) return impedido;
  if (from !== undefined && !costes().has(hexKey(from))) {
    return `${s.id} no puede moverse a (${from.col},${from.row})`;
  }
  const desdeAhi = from === undefined ? s : { ...s, hex: from };
  if (!canReachMelee(state, desdeAhi, target))
    return `${s.id} no alcanza a ${target.id} cuerpo a cuerpo`;
  return null;
}

/**
 * Un golpe cuerpo a cuerpo de `s` listo para darse o preverse: el objetivo,
 * `s` donde golpeará (una copia en `from`, que nadie mueve aquí) y la carga, con
 * la carrera que se anda para cobrarla (`medida`, `CargaMedida`). Lanza
 * con el motivo si no se puede (`golpeBlocker`, y lo de la rueda con
 * `cruceBlocker`; `completa` para darlo, no para preverlo). La preparación de
 * `applyAction`, `previsionDe` y `previsionDeLaRueda`, escrita una vez.
 */
export function golpePreparado(
  state: BattleState,
  s: BattleStack,
  accion: BattleAction & { type: 'attack' },
  completa: boolean,
  costes: () => ReadonlyMap<string, Paso> = () => movableFrom(state, s),
): {
  readonly target: BattleStack;
  readonly desdeAhi: BattleStack;
  readonly carga: number;
  readonly medida: CargaMedida | null;
} {
  const enCurso = golpeEnCursoBlocker(state, accion, completa);
  if (enCurso !== null) throw new Error(enCurso);
  const target = stackById(state, accion.target);
  const plantado = state.golpeEnCurso;
  // Plantado con carga, no ha corrido: golpeará desde la llegada de su carrera, y
  // esa casilla se mira en el recorrido como cualquier `from`.
  const from = plantado?.carga?.carrera.at ?? accion.from;
  const motivo = golpeBlocker(state, s, target, from, costes);
  if (motivo !== null) throw new Error(motivo);
  const sinCruce = cruceBlocker(accion, completa, formaDeLaBatalla(state));
  if (sinCruce !== null) throw new Error(sinCruce);
  // La carga se mide ANTES de mover, desde donde empieza este tramo: es la regla
  // del usuario, «se puede mover un tramo y se vuelve a calcular». Lo recorrido
  // en tramos anteriores no cuenta, y por eso no hace falta guardarlo en ningún
  // sitio: viaja hasta el golpe como argumento. Y se mide contra ESTE objetivo:
  // carga solo si está en la recta. Con un golpe plantado, la medida es la que
  // guardó al plantarse (`golpeEnCurso.carga`): sin carga, ya anduvo y desde donde
  // está no hay recta; con ella, aún no corrió y se mide lo que guardó.
  const medida =
    plantado !== null
      ? plantado.carga
      : from === undefined
        ? null
        : medirCargas(state, s)(from, target);
  return {
    target,
    // Golpea desde `from`: desde ahí se mira si el objetivo le alcanza para
    // devolverlo.
    desdeAhi: from === undefined ? s : { ...s, hex: from },
    carga: medida?.recta ?? 0,
    medida,
  };
}

/**
 * Por qué `accion` no vale con un golpe plantado esperando la rueda
 * (`BattleState.golpeEnCurso`), o `null` si vale o no hay ninguno. Con uno
 * plantado, solo vale ese golpe: contra su objetivo, sin andar más y —para
 * darlo, `completa`— con sus dos elecciones; preverlo no las pide. Lo leen
 * `applyAction`, antes de nada, y `golpePreparado`; `legalActions` ofrece solo
 * ese golpe.
 */
export function golpeEnCursoBlocker(
  state: BattleState,
  accion: BattleAction,
  completa = true,
): string | null {
  const g = state.golpeEnCurso;
  if (g === null) return null;
  const esEse =
    accion.type === 'attack' &&
    accion.target === g.target &&
    accion.from === undefined &&
    (!completa || (accion.golpe !== undefined && accion.respuesta !== undefined));
  return esEse ? null : PLANTADO(g);
}

/**
 * ¿Es este `attack` un «plantarse»? El golpe que llega sin ninguna
 * de las dos elecciones y sin otro plantado: espera la rueda (`golpeEnCurso`), sin
 * cerrar el turno. Sin carga, primero se anda hasta `from` y luego se elige
 * (decisión del usuario, 13-10-2026); **con carga, primero se elige y luego se
 * corre**, que la rueda tras la carrera era anticlimática (decisión del usuario,
 * 31-10-2026): se planta en su salida, sin andar ni gastar nada.
 */
export function esPlantarse(
  state: BattleState,
  accion: BattleAction & { type: 'attack' },
): boolean {
  return (
    state.golpeEnCurso === null && accion.golpe === undefined && accion.respuesta === undefined
  );
}

/**
 * Hexes a los que el stack puede moverse este turno, con la casilla y los pasos
 * que cuesta llegar a cada uno, indexados por `hexKey`.
 *
 * Los pasos no son un extra: son lo que la carga necesita saber. Antes `moveTo`
 * validaba el destino con `movableHexes` y volvía a lanzar el BFS para contar
 * los hexes recorridos — dos recorridos para la misma pregunta.
 *
 * Y el `Hex` tampoco: **el BFS ya lo tenía en la mano** y lo tiraba para
 * quedarse con la clave. Reconstruirlo costaba partir la cadena por la coma y
 * convertir dos trozos a número, aquí para filtrar los que no caben y otra vez
 * en `movableHexes` para devolverlos. Se llamaba `movableCosts`, y el nombre
 * cambió a propósito con la firma: así el typecheck señala a todos los
 * llamantes en vez de dejar que alguno se quede con la versión de antes
 * creyendo que sigue valiendo.
 */
export function movableFrom(state: BattleState, s: BattleStack): Map<string, Paso> {
  return movibles(state, s, true);
}

/**
 * `movableFrom` pagando o no el contacto (`contacto`): sin pagarlo lo pregunta
 * `movimientoBlocker`, para decir si es el contacto lo que no le deja llegar, sin
 * fabricar un estado distinto.
 */
function movibles(state: BattleState, s: BattleStack, contacto: boolean): Map<string, Paso> {
  // Impedido de moverse (un hechizo): no va a ninguna parte.
  if (impedidoPor(s, 'moverse') !== null) return new Map();
  // Sin casillas no hay a dónde ir, y no se recorre el tablero para saberlo: es
  // el caso de cada unidad que acaba de gastar su tramo entero, y preguntar qué
  // le queda tras moverse (`quedaAlgoQueHacer`) pasa por aquí.
  const pasos = pasosQueQuedan(state, s);
  if (pasos === 0) return new Map();
  const info = s.unit;
  const blocked = cerradasPara(state, s);

  // Los voladores ignoran lo que hay en medio: solo les importa dónde aterrizan.
  const volando = hasTrait(info, 'flying');
  const andando = volando ? null : alAndar(state, s, blocked);
  // El atacante que arranca en el suelo no sube andando, así que no pisa ningún
  // muro en todo el recorrido: el muro entero se le cierra y no se pregunta paso
  // a paso. Solo aquí, donde dónde se acaba también es el recorrido: en la recta
  // de la carga (`cargaDesde`) la última casilla no se mira en `cerradas`, y el
  // paso es lo que impide acabarla en un muro. El defensor sí sube andando. Las puertas cerradas sí se preguntan: van entre dos casillas, no en una (ampliación 4).
  const dist =
    andando === null
      ? recorrer(state, s, contacto, pasos, new Set())
      : andando.paso !== undefined && s.side === 'attacker' && !enLoAlto(state, s)
        ? recorrer(
            state,
            s,
            contacto,
            pasos,
            new Set([...andando.cerradas, ...casillasDeMuro(state.muralla)]),
            pasoPorPuertas(state.muralla, state.puertas),
          )
        : recorrer(state, s, contacto, pasos, andando.cerradas, andando.paso);

  const out = new Map<string, Paso>();
  for (const [key, paso] of dist) {
    if (hexEquals(paso.at, s.hex) || noCabe(paso.at, blocked)) continue;
    out.set(key, paso);
  }
  return out;
}

/**
 * El recorrido de `s` desde donde está con `pasos` de presupuesto: el de costes
 * (`alcanceConCostes`) con lo que cuesta salir de cada casilla (`costesDelPaso`)
 * o, sin pagar el contacto (`contacto` falso: solo cuando `movimientoBlocker`
 * pregunta si es el contacto lo que no le deja llegar), el BFS de siempre
 * (`reachable`). Lo leen `movableFrom` y `porElLado`, para que lo que se enseña,
 * lo que se anda y lo que se explica salgan de la misma cuenta.
 */
function recorrer(
  state: BattleState,
  s: BattleStack,
  contacto: boolean,
  pasos: number,
  cerradas: ReadonlySet<string>,
  paso?: PasoPermitido,
): Map<string, Paso> {
  // Sin un enemigo a `pasos + 2` o menos, ninguna casilla del recorrido tiene uno
  // al lado y salir de cada una cuesta 1: con costes todos de 1, `alcanceConCostes`
  // asienta en el orden en que el BFS descubre, así que el BFS de siempre da el
  // mismo `Map`, en el mismo orden, sin contar contactos casilla a casilla.
  return contacto && hayEnemigoA(state, s, pasos + 2)
    ? alcanceConCostes(s.hex, pasos, cerradas, costesDelPaso(state, s), paso)
    : reachable(s.hex, pasos, cerradas, paso);
}

/** ¿Hay algún enemigo vivo de `s` a `distancia` casillas o menos de donde está? */
function hayEnemigoA(state: BattleState, s: BattleStack, distancia: number): boolean {
  for (const e of state.stacks) {
    if (e.side !== s.side && isAlive(e) && hexDistance(s.hex, e.hex) <= distancia) return true;
  }
  return false;
}

// ---------------------------------------------------------- salir del contacto

/**
 * Cuántos enemigos vivos golpearían a `s` cuerpo a cuerpo si estuviera en `hex`:
 * los que tiene en contacto ahí (`contacto.ts`). Es la regla del trabado,
 * `canReachMelee` (decisión del usuario, 14-10-2026): el de lo alto del muro de
 * al lado no cuenta, y el del otro lado de una puerta cerrada sí, porque hoy se
 * golpea a través de ellas. **La única cuenta**: la leen `costesDelPaso`, para
 * cada casilla de un recorrido, y `contactoBlocker`. `enemigos`, si quien
 * pregunta por muchas casillas ya los tiene.
 */
export function enContactoEn(
  state: BattleState,
  s: BattleStack,
  hex: Hex,
  enemigos: readonly BattleStack[] = enemiesOf(state, s),
): number {
  // Para tocarse van a 1 (toda unidad, una casilla): lo de más lejos no se
  // pregunta a `canReachMelee`, ni se copia `s` en `hex` para preguntarlo.
  const lejos = 1;
  let ahi: BattleStack | null = null;
  let n = 0;
  for (const e of enemigos) {
    if (hexDistance(hex, e.hex) > lejos) continue;
    ahi ??= hexEquals(hex, s.hex) ? s : { ...s, hex };
    if (canReachMelee(state, ahi, e)) n++;
  }
  return n;
}

/**
 * Por qué `s` no puede salir de su casilla, o `null` si puede: lo que le queda no
 * paga salir de donde está (#259). Sin
 * casillas no es esto: «ya no le quedan casillas» lo dice `movimientoBlocker`.
 * La leen `movimientoBlocker`, para cualquier casilla a la que se le pida ir, y
 * el panel de la arena, que lo dice sin que se señale ninguna.
 */
export function contactoBlocker(state: BattleState, s: BattleStack): string | null {
  const quedan = pasosQueQuedan(state, s);
  if (quedan === 0) return null;
  const n = enContactoEn(state, s, s.hex);
  return salirCuesta(n) > quedan ? fraseDelContacto(n, quedan, fintaEn(state, s) > 0) : null;
}

/**
 * Lo que cuesta a `s` salir de cada casilla, por índice, para recorrer el
 * tablero con costes. Andando, `1 + N` de cada casilla de la que sale; volando,
 * `1 + N` de la casilla de la que despega y 1 por cada una de las demás: el
 * volador no paga por lo que sobrevuela (decisión del usuario). Cada casilla se
 * cuenta una vez, y solo si el recorrido sale de ella.
 */
function costesDelPaso(state: BattleState, s: BattleStack): CosteDeSalir {
  const enemigos = enemiesOf(state, s);
  const casillas = allHexes();
  // −1: aún no contada. Un recorrido sale de cada casilla una vez como mucho,
  // pero la carga pregunta por la misma recta desde muchas casillas.
  const contados = new Int8Array(BOARD_SIZE).fill(-1);
  const coste = (i: number): number => {
    let n = contados[i] as number;
    if (n === -1) {
      n = enContactoEn(state, s, casillas[i] as Hex, enemigos);
      contados[i] = n;
    }
    return salirCuesta(n);
  };
  if (!hasTrait(s.unit, 'flying')) return coste;
  const despega = indiceDe(s.hex);
  return (i) => (i === despega ? coste(i) : 1);
}

/** Hexes a los que el stack puede moverse este turno. */
export function movableHexes(state: BattleState, s: BattleStack): Hex[] {
  return [...movableFrom(state, s).values()].map((p) => p.at);
}

// ---------------------------------------------------------------- la carga

/**
 * La longitud de la recta de carga si `s` golpeara a `target` desde `from`; 0 si
 * no carga. ÚNICA regla de CUÁNDO hay carga (decisiones del usuario,
 * 02-10-2026): carga todo el que pega cuerpo a cuerpo (#260; montado de guerra y
 * con lanza, con la fuerza de la montura: `GolpeConArma.carga`), solo si `from` está **en línea
 * recta** desde donde está ahora —una de las 6 rectas del hexágono, sin giros—,
 * con la recta libre de unidades, a **`CARGA_MINIMA` casillas o más**, y con
 * **el enemigo en esa misma recta**: la casilla que sigue a `from` tiene que ser
 * suya. «El enemigo tiene que estar en la línea recta, no se puede cargar contra
 * un enemigo que esté al lado»: un golpe que llega a la recta y luego gira para
 * pegar al de al lado no carga, y uno pegado de salida tampoco —la recta mide 0—.
 * Con un enemigo de dos casillas basta con que una lo sea. Cuánto suma lo dice
 * `carga.ts`, que aplica el tope y el bono (`cargaEfectiva`): aquí no se
 * recorta nada.
 *
 * La primera redacción no miraba al enemigo, y la persona veía casillas
 * naranjas «desde las que cargaría» sin nadie delante (QA, H1). Un volador
 * también tiene que recorrerla: «sin giros» es la forma del trayecto, no de dónde
 * aterriza.
 *
 * `bloqueadas` es una pista para quien pregunta por muchas casillas a la vez:
 * las ocupadas no cambian entre una y otra, así que se calculan una vez.
 */
export function cargaDesde(
  state: BattleState,
  s: BattleStack,
  from: Hex,
  target: BattleStack,
  bloqueadas?: ReadonlySet<string>,
): number {
  return medirCargas(state, s, bloqueadas)(from, target)?.recta ?? 0;
}

/**
 * Mide las cargas de `s` desde las casillas que se le pregunten, contra el
 * objetivo que se le diga: `cargaDesde` hecha para muchas preguntas, con lo que
 * no cambia de una a otra (las ocupadas, el paso de la muralla, el coste de salir
 * de cada casilla) contado una vez y solo si alguna pregunta llega a necesitarlo.
 * `null` si desde ahí no carga. Primero lo barato, que descarta casi todas: la
 * distancia y el objetivo en la recta, y después la recta libre y lo que cuesta
 * andarla. La leen `cargaDesde`, el golpe (`golpePreparado`), el anuncio
 * (`casillasDeCarga`) y la IA, que desempata con lo que pagará.
 */
export function medirCargas(
  state: BattleState,
  s: BattleStack,
  bloqueadas?: ReadonlySet<string>,
): (from: Hex, target: BattleStack) => CargaMedida | null {
  let andando: ReturnType<typeof alAndar> | null = null;
  let salirDe: CosteDeSalir | null = null;
  return (from, target) => {
    if (hexDistance(s.hex, from) < CARGA_MINIMA) return null;
    const hacia = siguienteEnRecta(s.hex, from);
    if (hacia === null || !stackHexes(target).some((h) => hexEquals(h, hacia))) return null;
    // La recta es un recorrido: con muralla, lo que no se anda tampoco se carga.
    andando ??= alAndar(state, s, bloqueadas ?? cerradasPara(state, s));
    const d = rectaLibre(s.hex, from, andando.cerradas, andando.paso);
    if (d === null || d < CARGA_MINIMA) return null;
    // La carrera se paga por la recta, que es lo que se anda (`moveTo`): si no cabe en lo que le queda, la casilla puede seguir a
    // mano por otro camino más barato, pero sin carga. Cuenta casillas, no pasos.
    salirDe ??= costesDelPaso(state, s);
    const carrera = carreraConCostes(s.hex, from, salirDe);
    if (carrera === null || carrera.steps > pasosQueQuedan(state, s)) return null;
    return { recta: d, carrera };
  };
}

/**
 * Las cargas que `s` tiene a mano en este tramo: a qué enemigo, desde qué
 * casilla a la que puede ir y con cuántas casillas COBRARÍA —ya recortadas por
 * `cargaEfectiva`—. Es lo que se ENSEÑA —el enemigo marcado y su casilla con su
 * «»N» en el cliente, el `chargeFrom` del agente— y sale de `cargaDesde` y
 * `cargaEfectiva`, las mismas que cobran, así que el anuncio no puede discrepar
 * del golpe. Una casilla vacía de la recta sin enemigo detrás no sale: desde ahí
 * solo se mueve.
 */
export function casillasDeCarga(
  state: BattleState,
  s: BattleStack,
  costes?: ReadonlyMap<string, Paso>,
): readonly CasillaDeCarga[] {
  if (state.turno?.stack === s.id) {
    // Tras la Finta no hay golpe que cobrarla: solo se anda.
    if (faseDelTurno(state) === 'trasLaFinta') return SIN_CARGAS;
    // Plantado, la única carga es la que espera la rueda (si carga): el tablero la
    // marca y el agente la lee en `chargeFrom` como al apuntarla.
    const g = state.golpeEnCurso;
    if (g !== null) {
      return g.carga === null
        ? SIN_CARGAS
        : [casillaDeCarga(g.target, g.carga.carrera.at, g.carga.recta)];
    }
  }
  const medir = medirCargas(state, s);
  const enemigos = enemiesOf(state, s);
  const out: CasillaDeCarga[] = [];
  for (const paso of (costes ?? movableFrom(state, s)).values()) {
    // Desde cada casilla, el único enemigo que se puede cargar es el que ocupa la
    // siguiente de la recta: a él se le pregunta, y no a todos.
    const hacia = siguienteEnRecta(s.hex, paso.at);
    if (hacia === null) continue;
    const e = enemigos.find((x) => stackHexes(x).some((h) => hexEquals(h, hacia)));
    if (e === undefined) continue;
    const medida = medir(paso.at, e);
    if (medida === null) continue;
    out.push(casillaDeCarga(e.id, paso.at, medida.recta));
  }
  return out;
}

/** La carga contra `target` desde `at` con una recta de `recta` casillas, como se enseña. */
function casillaDeCarga(target: string, at: Hex, recta: number): CasillaDeCarga {
  const hexes = cargaEfectiva(recta, CARGA);
  return { target, at, hexes, porciento: porcientoDeLaCarga(hexes, CARGA) };
}

/** Una carga posible: contra quién, desde qué casilla y con cuántas casillas. */
export interface CasillaDeCarga {
  readonly target: string;
  readonly at: Hex;
  readonly hexes: number;
  /**
   * Lo que suma al daño, en tanto por ciento entero (`porcientoDeLaCarga`): el
   * tablero y la barra lo pintan sin hacer la cuenta, que depende de quién carga.
   */
  readonly porciento: number;
}

/**
 * Ninguna carga. Una sola instancia para quien no tiene nada que enseñar —sin
 * el rasgo, sin turno propio, el espectador—, en vez de una lista vacía por cada
 * sitio que la necesita.
 */
export const SIN_CARGAS: readonly CasillaDeCarga[] = Object.freeze([]);

// ------------------------------------------------------------- el contraataque

/**
 * Por qué `target` no devolverá el golpe de `attacker`, o `null` si lo devolverá
 * (si sigue en pie): uno por ronda, si quien pega lo permite y si lo alcanza. La
 * leen el golpe (`melee`) y la previsión (`previsionDe`, la de la rueda), que no
 * puede prometer un contraataque que no llega.
 */
export function contraataqueBlocker(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
): string | null {
  if (target.retaliated) return `${target.unit.name} ya devolvió un golpe esta ronda`;
  const impedido = impedimentoBlocker(state, target, 'contraatacar');
  if (impedido !== null) return impedido;
  if (hasTrait(attacker.unit, 'no_retaliation')) {
    return `a ${attacker.unit.name} no se le devuelve el golpe`;
  }
  if (!canReachMelee(state, target, attacker)) {
    return `${target.unit.name} no alcanza a ${attacker.unit.name} desde donde está`;
  }
  return null;
}

export function devolveraElGolpe(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
): boolean {
  return contraataqueBlocker(state, attacker, target) === null;
}

/**
 * A quién alcanza la salpicadura de un disparo de `shooter` sobre `target`: todo
 * lo vivo pegado a él, **de cualquier bando**, como en el original, salvo el
 * propio tirador: con el disparo diferido puede acabar pegado a lo que alcanza
 * (alguien se le puso al lado mientras esperaba), y no se salpica.
 *
 * Está exportada porque la IA necesita la MISMA respuesta para no dispararse a
 * los suyos (`tactics.ts`). Cuando la deducía por su cuenta, el día que
 * cambiara el radio la IA habría seguido jugando con la forma vieja sin que
 * nadie se enterase.
 */
export function splashTargets(
  state: BattleState,
  shooter: BattleStack,
  target: BattleStack,
): BattleStack[] {
  // "Pegado al objetivo" y "alcanza al objetivo cuerpo a cuerpo" son la misma
  // pregunta, así que se hace con la misma función.
  return state.stacks.filter(
    (otro) =>
      otro.id !== target.id &&
      otro.id !== shooter.id &&
      isAlive(otro) &&
      canReachMelee(state, otro, target),
  );
}

// -------------------------------------------------- los hechizos de la batalla

/** El nombre de un hechizo de la batalla, o su id si ya no lo lleva (lo quitó la arena). */
function nombreDelHechizo(state: BattleState, id: string): string {
  return state.libro[id]?.nombre ?? id;
}

/**
 * Por qué `s` no puede hacer `que` porque se lo impide un hechizo (`impide`), con la
 * frase para la persona, o `null`. La leen los `*Blocker` de golpear, disparar,
 * contraatacar, moverse y lanzar.
 */
export function impedimentoBlocker(
  state: BattleState,
  s: BattleStack,
  que: Impedible,
): string | null {
  const e = impedidoPor(s, que);
  if (e === null) return null;
  return `${s.unit.name} ${dichoDeImpide([que])} (${nombreDelHechizo(state, e.source)})`;
}

/**
 * El hechizo `id` de esta batalla (`BattleState.libro`) o, si no lo lleva (un libro
 * que cambió después de montarla), el del juego. Lanza con uno que no está en
 * ninguno.
 */
export function hechizoDeLaBatalla(state: BattleState, id: string): Hechizo {
  const h = state.libro[id] ?? HECHIZOS_DEL_JUEGO.get(id);
  if (h === undefined) throw new Error(`esta batalla no lleva el hechizo «${id}»`);
  return h;
}

// ---------------------------------------------------------------- la rendición

/**
 * Lo que cuesta rendirse: un porcentaje del oro de catálogo de la tropa viva
 * que se salva, redondeado hacia arriba. El héroe no cuenta: no es tropa.
 *
 * Proporcional a lo que se salva, como en HoMM: rendirse con el ejército entero
 * cuesta, rendirse con dos campesinos casi nada. El porcentaje es provisional
 * y está en `data/heroe.json`, declarado inventado (decisión del usuario: 50 %).
 */
function surrenderCost(state: BattleState, side: Side): number {
  const oro = sumaDelBando(state, side, oroDeCatalogo);
  return Math.ceil((oro * HEROE.rendicion.porcentajeDelOro) / 100);
}

/**
 * El oro de catálogo de un stack: lo que vale para la rendición. Un `switch`
 * que devuelve, y no uno que suma: así un origen nuevo no compila hasta que
 * alguien decida cuánto vale, en vez de valer 0 en silencio.
 */
function oroDeCatalogo(s: BattleStack): number {
  switch (s.origen.kind) {
    case 'catalogo':
      // El precio viaja en el origen: `unit` ya no es siempre la referencia
      // del catálogo —la de un veterano es una copia con sus cifras—, y volver
      // a `creature(body)` es lo que prohíbe `test/invariantes.test.ts`. Un
      // veterano cuesta lo mismo que un novato: rendirse paga la tropa, no su
      // historia.
      return s.origen.oro * s.count;
    case 'heroe':
      return 0;
  }
}

/**
 * Lo que costaría rendirse y, si no se puede, por qué (`motivo`; `null` si se
 * puede). Las dos cosas en una llamada porque las piden juntas los tres que la
 * leen —`applyAction` al rechazar, `legalActions` al ofrecer y la pantalla para
 * rotular el botón—, y el motivo «cuesta N» ya necesita el precio. Como
 * `castBlocker`, la frase la escribe el núcleo.
 */
export function surrenderBlocker(
  state: BattleState,
  side: Side,
): { readonly coste: number; readonly motivo: string | null } {
  const coste = surrenderCost(state, side);
  return { coste, motivo: motivoParaNoRendirse(state, side, coste) };
}

function motivoParaNoRendirse(state: BattleState, side: Side, coste: number): string | null {
  if (state.finished !== null) return 'la batalla ya ha terminado';
  const porLaFase = faseBlocker(state, 'surrender');
  if (porLaFase !== null) return porLaFase;
  const hero = state.heroes[side];
  if (hero === null) return SIN_HEROE;
  if ('blocked' in hero.retreat) return hero.retreat.blocked;
  if (coste > hero.retreat.purse) return `cuesta ${coste} de oro y tienes ${hero.retreat.purse}`;
  return null;
}

/** Se escribe una vez y se lee en dos: el bloqueador y el estrechamiento. */
export const SIN_HEROE = 'este bando no tiene héroe';

// ---------------------------------------------------------------- el final

/**
 * Por qué no se juega ningún turno: la batalla aún está en el despliegue. Va
 * antes que «no hay stack activo» (`applyAction`), que no diría por qué.
 */
export function despliegueEnCursoBlocker(state: BattleState): string | null {
  return state.despliegue === null ? null : 'la batalla está en el despliegue: aún no hay turnos';
}

/**
 * Un bando pierde cuando se queda sin nadie en pie **o cuando cae su héroe**,
 * aunque le quede tropa (fase 1b): el héroe es el que manda, y sin él la tropa
 * no sigue peleando.
 */
export function bandoVencido(state: BattleState, side: Side): boolean {
  let alguienVivo = false;
  for (const s of state.stacks) {
    if (s.side !== side) continue;
    if (s.origen.kind === 'heroe' && !isAlive(s)) return true;
    if (isAlive(s)) alguienVivo = true;
  }
  return !alguienVivo;
}

/**
 * Por qué acabó una batalla, con la misma regla que la cerró (`bandoVencido`):
 * - `heroe`: cayó el héroe del que pierde, aunque le quede tropa;
 * - `sin_tropa`: el que pierde no tiene a nadie en pie;
 * - `rendicion`: el que pierde pagó por irse;
 * - `agotada`: los dos siguen en pie y el motor la cerró por no avanzar
 *   (`finishByExhaustion`: el tope de rondas o una ronda sin nadie que actúe).
 *
 * La arena lo dice al acabar: leyendo «quedan unidades en los dos bandos» como
 * «se acabaron las rondas», un Rayo que mataba al héroe en la ronda 1 salía como
 * «sin vencedor en 100 rondas: por tiempo» (H1 de QA de la arena).
 */
export type CausaDelFinal = 'heroe' | 'sin_tropa' | 'rendicion' | 'agotada';

export function causaDelFinal(state: BattleState): CausaDelFinal | null {
  if (state.finished === null) return null;
  if (state.finished.surrender !== undefined) return 'rendicion';
  const perdedor: Side = state.finished.winner === 'attacker' ? 'defender' : 'attacker';
  if (!bandoVencido(state, perdedor)) return 'agotada';
  const cayoSuHeroe = state.stacks.some(
    (s) => s.side === perdedor && s.origen.kind === 'heroe' && !isAlive(s),
  );
  return cayoSuHeroe ? 'heroe' : 'sin_tropa';
}
