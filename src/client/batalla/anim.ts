/**
 * La batalla, contada en orden.
 *
 * El motor resuelve cada acción de golpe y deja un registro de eventos; el turno
 * del rival, además, se juega entero de forma síncrona dentro de la misma
 * llamada. Sin esto, la persona pulsaba, y al siguiente fotograma tres unidades
 * enemigas ya estaban en otro sitio y la suya había perdido la mitad de la vida
 * sin ver de dónde le vino.
 *
 * Aquí se lee ese registro y se pone en una **cola**: cada movimiento, golpe,
 * disparo, hechizo y caída se reproduce uno detrás de otro con un tiempo fijo.
 * Lo que sale son posiciones interpoladas en el plano del tablero y el clip que
 * toca a cada figura. El juego no sabe que existe, y mientras está ocupado
 * `main.ts` no manda clics, porque el tablero que se ve aún no es el del estado.
 * Lo usan los dos lienzos: el cliente que juega y el espectador.
 *
 * **La vida y quién actúa también van al ritmo de la cola** (H6 de la QA de la
 * rueda, 13-10-2026): el estado ya trae el final de todo lo que se cuenta —con
 * todo en IA, el final de la pelea—, así que la barra de cada unidad se queda en
 * la vida de su último impacto visto (`EstadoFigura.pv`) y el aro, en quien
 * actúa en el paso que se cuenta (`activo`). Antes, el tablero enseñaba quién
 * moría antes que la rueda y la animación.
 *
 * Lo que NO se anima: lo que el rival hizo antes de que la batalla se viera por
 * primera vez. El registro dice a dónde fue cada unidad, no de dónde venía, así
 * que la primera lectura de una batalla toma las posiciones tal y como están.
 */
import { isAlive, stackHexes } from '@core/battle/consultas.js';
import { stackHp, trasElGolpe } from '@core/battle/damage.js';
import { nivelDe } from '@core/battle/muralla.js';
import type { HechoDelCruce } from '@core/battle/rueda.js';
import type { BattleEvent, BattleStack, BattleState, StackEffect } from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import { ALTO_DE_FIGURA, type Plano } from '../../shared/arte.js';
import type { Efecto, EstadoFigura, VistaBatalla } from '../render/batalla/tablero.js';
import type { CharacterClip } from '../render/figuras/character.js';
import { type Direccion, direccionHacia } from '../render/figuras/direccion.js';
import { msDeSuelta, msPorCasilla } from '../render/figuras/marcha.js';
import { type ArteDeFigura, arteDe } from '../render/figuras/personajes.js';
import { centroDeStack, planoDeHex } from '../render/proyeccion.js';

/**
 * Lo que dura en pantalla cada paso de la cola, en milisegundos. El de andar no
 * está: depende de cuántas casillas se andan y de la zancada de quien anda
 * (`msPorCasilla`). El de disparar es el de quien no tiene suelta medida: quien
 * sí la tiene tarda lo que diga su hoja (`relojDelDisparo`).
 */
export const DURACION = {
  attack: 560,
  shoot: 620,
  cast: 520,
  perished: 520,
  /** Lo levantado de un cadáver aparece en su casilla (`raised`, «Levantar zombi»). */
  raised: 520,
  /** El tirador se vuelve hacia la casilla a la que apunta (`aimed`). */
  apunta: 360,
  /**
   * El desenlace de la rueda del golpe: la rueda gira y se para, caen
   * los marcadores, se enciende el arco y sale el rótulo. Es el reloj de la rueda
   * entera: el diálogo pinta cada tramo según lo que lleve este paso.
   */
  cruce: 1900,
} as const;

/**
 * En qué fracción del paso se nota el impacto si nada dice otra cosa: el
 * retroceso, la cifra y la barra que baja. Exportada para `pnpm capturas`, que
 * mira que la barra no baje antes.
 */
export const IMPACTO = 0.55;

/** Lo que vuela el proyectil de un disparo con suelta, de la suelta al impacto. */
const VUELO_MS = 340;
/** Lo que se ve tras el impacto de un disparo con suelta: el temblor y la cifra. */
const TRAS_EL_IMPACTO_MS = 280;

/**
 * Cómo se reparte en el tiempo un paso que no anda: lo que dura, en qué
 * fracción llega el impacto y, si vuela algo, en cuál sale (`suelta`; `null`,
 * nada vuela).
 */
interface Reloj {
  readonly dura: number;
  readonly impacto: number;
  readonly suelta: number | null;
}

/**
 * El reloj del disparo de `body`. Con la suelta en su hoja (`msDeSuelta`), el
 * proyectil sale cuando la figura suelta la cuerda, vuela `VUELO_MS` y el paso
 * acaba `TRAS_EL_IMPACTO_MS` después del impacto. Sin ella, sale en 0 y el paso
 * dura `DURACION.shoot`, con el impacto en `IMPACTO`.
 */
function relojDelDisparo(body: string): Reloj {
  const suelta = msDeSuelta(body);
  if (suelta === null) return { dura: DURACION.shoot, impacto: IMPACTO, suelta: 0 };
  const dura = suelta + VUELO_MS + TRAS_EL_IMPACTO_MS;
  return { dura, impacto: (suelta + VUELO_MS) / dura, suelta: suelta / dura };
}

/** Las artes de las que ya se ha dicho que disparan sin pintar el disparo: una vez cada una. */
const SIN_DISPARO_AVISADAS = new WeakSet<ArteDeFigura>();

/**
 * Si el núcleo hace disparar a `body` y su arte no pinta `shoot`, se pinta con
 * su ataque y se dice UNA vez por arte con un `console.warn`: pasa con el arte
 * pintado antes de que existiera la hoja C (los tiradores del Imperio hasta que
 * se repinten) y con quien dispara en el núcleo sin arma de tiro (el bastón del
 * liche). Es un aviso y no un error: la figura se pinta, y `pnpm capturas` solo
 * falla con errores.
 */
function avisarSiNoPintaElDisparo(body: string): void {
  const arte = arteDe(body);
  if (arte.dispara || SIN_DISPARO_AVISADAS.has(arte)) return;
  SIN_DISPARO_AVISADAS.add(arte);
  console.warn(
    `${body} dispara y su arte (${arte.nombre}) no tiene clip shoot: se pinta con attack`,
  );
}

/** Cuánto lleva lo que pasa DESPUÉS del impacto, de 0 a 1: el temblor y la cifra. */
function trasImpacto(t: number, impacto: number): number {
  return (t - impacto) / (1 - impacto);
}

type Paso =
  | {
      readonly tipo: 'move';
      readonly stack: string;
      readonly desde: Plano;
      readonly hasta: Plano;
      /** La casilla de `hasta`: donde se la ve quieta al acabar (`EstadoFigura.casilla`). */
      readonly casilla: Hex;
      /**
       * Las casillas por las que se anda, de `desde` a `hasta` las dos
       * incluidas: el camino del motor (`path` del hecho). Interpolar en recta
       * de `desde` a `hasta` cruzaba por encima de unidades que el camino rodea.
       */
      readonly camino: readonly Plano[];
      /**
       * Lo alto de cada punto de `camino`: 1 en lo alto de un muro, 0 en el
       * suelo. Entre dos se interpola, y así se ve subir y bajar de la columna.
       */
      readonly alturas: readonly number[];
      /**
       * El tramo va corriendo, con el clip y el ritmo de la carga: la carrera de una
       * carga o un tramo largo (`vaCorriendo`); si no, caminando.
       */
      readonly corre?: true;
      /** Quién anda y lo alto que se pinta, en pasos: lo que fija su zancada. */
      readonly body: string;
      readonly alto: number;
    }
  | ({
      readonly tipo: 'attack';
      readonly stack: string;
      readonly target: string;
      readonly damage: number;
      /** Lo que paró la armadura del objetivo (la arena, #262); 0 sin ella. */
      readonly parado: number;
      /** Es un contraataque: quien pega no es quien actúa (`activo`). */
      readonly devuelto: boolean;
    } & Reloj)
  /**
   * El disparo diferido (25-10-2026): vuela de quien tira hacia `at`, la casilla que
   * apuntó, y cae en `target`, el primero de la recta, o en la casilla si no dio a
   * nadie (`target` a `null`).
   */
  | ({
      readonly tipo: 'shoot';
      readonly stack: string;
      readonly target: string | null;
      readonly at: Hex;
      readonly damage: number;
      readonly parado: number;
      readonly devuelto: false;
    } & Reloj)
  /**
   * El tirador se vuelve hacia la casilla a la que apunta: el disparo sale en su turno
   * siguiente. Con `granada`, la lanza (`thrown`): explota en su turno siguiente.
   */
  | {
      readonly tipo: 'apunta';
      readonly stack: string;
      readonly at: Hex;
      readonly dura: number;
      readonly granada?: true;
    }
  /**
   * Un hechizo. `lanza`, la unidad que lo lanza con su poder (Curar), que lo hace con su clip de ataque —no hay arte de lanzar—; el del
   * héroe, `null`: su libro no mueve la figura.
   */
  | ({
      readonly tipo: 'cast';
      readonly lanza: string | null;
      readonly target: string | null;
      readonly damage: number;
      /** Lo que paró la armadura del objetivo, como en el golpe. */
      readonly parado: number;
      /** Los PV que repuso, si cura: el poder lo dice (`power.cura`); el hechizo del héroe, no. */
      readonly cura: number;
      /** Si es la explosión de una granada (`blast`): de quién y dónde. Sin arte propio, la del hechizo. */
      readonly granada?: { readonly de: string; readonly at: Hex };
    } & Reloj)
  | { readonly tipo: 'perished'; readonly stack: string; readonly dura: number }
  /**
   * Se levanta `stack` del cadáver `from` (08-11-2026): hasta que acaba el paso, el
   * levantado no se ve y el cadáver sigue en el suelo; después, al revés.
   */
  | {
      readonly tipo: 'raised';
      readonly stack: string;
      readonly from: string;
      readonly dura: number;
    }
  /**
   * El cruce de la rueda del golpe: nadie se mueve; lo cuenta el diálogo de la
   * rueda. `efectos`, lo que llevaba colgado cada stack antes de leer la jugada del
   * cruce (`FotoDeEfectos`): la cabecera del desenlace los pinta.
   */
  | {
      readonly tipo: 'cruce';
      readonly evento: HechoDelCruce;
      readonly dura: number;
      readonly efectos: FotoDeEfectos;
    };

/**
 * Lo que lleva colgado cada stack (`BattleStack.effects`), por su id, como estaba
 * en una lectura del animador: copias, que `tickEffects` baja el `roundsLeft` en el
 * sitio.
 */
export type FotoDeEfectos = ReadonlyMap<string, readonly StackEffect[]>;

/** La foto de los efectos de `battle` ahora (`FotoDeEfectos`). */
export function fotoDeEfectos(battle: BattleState): FotoDeEfectos {
  return new Map(battle.stacks.map((s) => [s.id, s.effects.map((e) => ({ ...e }))]));
}

/**
 * El cruce de la rueda que cuenta el animador (`BattleAnimator.cruceEnCurso`):
 * su hecho, cuánto lleva de 0 a 1 y lo que llevaba colgado cada stack antes de
 * él. Lo leen el diálogo de la rueda y la escena de batalla.
 */
export interface CruceEnCurso {
  readonly evento: HechoDelCruce;
  readonly t: number;
  readonly efectos: FotoDeEfectos;
}

/**
 * El paso de un hecho que no anda (`pasoDeAccion`): el del cruce, aún sin la foto
 * de los efectos, que pone quien la tiene (`BattleAnimator.traducir`).
 */
type PasoDeAccion =
  | Exclude<Paso, { tipo: 'move' | 'cruce' }>
  | Omit<Extract<Paso, { tipo: 'cruce' }>, 'efectos'>;

/** La vida de una unidad como la escribe el núcleo: lo que cambia un golpe. */
type Vida = Pick<BattleStack, 'count' | 'topHp'>;

/**
 * Las unidades cuya vida cambia un paso al llegar su impacto. Quien pega cuenta
 * también: el drenaje del vampiro no va en el registro, y así su barra no se
 * queda con lo del estado mientras su golpe espera en la cola.
 */
function tocadosPor(p: Paso): readonly string[] {
  switch (p.tipo) {
    case 'attack':
      return [p.target, p.stack];
    case 'shoot':
      return p.target === null ? [] : [p.target];
    case 'cast':
      return p.target === null ? [] : [p.target];
    default:
      return [];
  }
}

/**
 * Quién actúa en el paso `p`, o `null` si el paso no cambia de actor: un
 * contraataque, una caída o el hechizo del héroe, que no gasta el turno de nadie.
 */
function actorDe(p: Paso): string | null {
  switch (p.tipo) {
    case 'move':
      return p.stack;
    case 'attack':
      return p.devuelto ? null : p.stack;
    case 'shoot':
    case 'apunta':
      return p.stack;
    case 'cast':
      return p.lanza;
    case 'cruce':
      return p.evento.stack;
    case 'perished':
    case 'raised':
      return null;
  }
}

/**
 * La mirada al andar el tramo `i` del camino: la de cada tramo hasta ese,
 * girándose en cada uno.
 */
function miradaEnElTramo(camino: readonly Plano[], i: number, antes: Direccion): Direccion {
  let m = antes;
  for (let k = 0; k <= i && k + 1 < camino.length; k++) {
    m = direccionHacia(camino[k] as Plano, camino[k + 1] as Plano, m);
  }
  return m;
}

/**
 * Dónde va la figura en la fracción `t` de su paso: por los tramos del camino,
 * casilla a casilla y al mismo ritmo en todos (todas las casillas están a la
 * misma distancia de sus vecinas).
 */
/** Qué tramo del camino se anda en la fracción `t`: el mismo reparto que `porElCamino`. */
function tramoEn(camino: readonly unknown[], t: number): number {
  const tramos = camino.length - 1;
  return Math.max(0, Math.min(tramos - 1, Math.floor(Math.min(1, Math.max(0, t)) * tramos)));
}

export function porElCamino(camino: readonly Plano[], t: number): Plano {
  const tramos = camino.length - 1;
  if (tramos <= 0) return camino[0] as Plano;
  const recorrido = Math.min(1, Math.max(0, t)) * tramos;
  const i = tramoEn(camino, t);
  const a = camino[i] as Plano;
  const b = camino[i + 1] as Plano;
  const f = recorrido - i;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Lo alto que va la figura en la fracción `t` del camino: el mismo reparto que `porElCamino`. */
function alturaEnElCamino(alturas: readonly number[], t: number): number {
  const tramos = alturas.length - 1;
  if (tramos <= 0) return alturas[0] ?? 0;
  const recorrido = Math.min(1, Math.max(0, t)) * tramos;
  const i = tramoEn(alturas, t);
  const a = alturas[i] as number;
  const b = alturas[i + 1] as number;
  return a + (b - a) * (recorrido - i);
}

/** Lo largo que es un camino en el plano: casillas, si son vecinas. */
function largoDe(camino: readonly Plano[]): number {
  let largo = 0;
  for (let k = 0; k + 1 < camino.length; k++) {
    const a = camino[k] as Plano;
    const b = camino[k + 1] as Plano;
    largo += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return largo;
}

/**
 * Lo que dura un paso a ritmo normal. Un tramo dura lo que tarda su figura en
 * andar sus casillas sin patinar (`msPorCasilla`): con la marcha, o con la carga
 * si va corriendo (`vaCorriendo`). Antes eran 520 ms para cualquier tramo, de
 * una casilla o de seis.
 */
function duracionDelPaso(p: Paso): number {
  if (p.tipo !== 'move') return p.dura;
  return largoDe(p.camino) * msPorCasilla(p.body, p.corre === true ? 'charge' : 'walk', p.alto);
}

/**
 * Si un `move` se anima corriendo, con el clip y el ritmo de la carga: la carrera
 * de una carga (`charge`) o un tramo de más de la mitad del movimiento máximo de
 * quien anda (`corre`, que escribe el núcleo con `seCorre`, 25-10-2026). Si no,
 * caminando. La única lectura de las dos marcas: la leen la cola del animador y
 * lo que tarda una jugada.
 */
function vaCorriendo(e: BattleEvent & { kind: 'move' }): boolean {
  return e.charge === true || e.corre === true;
}

function stackDe(battle: BattleState, id: string, que: string): BattleStack {
  const s = battle.stacks.find((x) => x.id === id);
  if (s === undefined) throw new Error(`el registro ${que} a ${id}, que no está en la batalla`);
  return s;
}

/**
 * Lo que un paso hace con lo pendiente a distancia de un stack (`BattleAnimator.aDistancia`):
 * el disparo y la explosión lo sueltan (`sale`: se ve hasta su impacto); el «apunta» y
 * el lanzamiento lo ponen (se esconde hasta que empiezan). `null`, lo demás.
 */
function pendienteDelPaso(paso: Paso): {
  readonly que: 'apuntado' | 'granada';
  readonly de: string;
  readonly at: Hex;
  readonly sale: boolean;
} | null {
  switch (paso.tipo) {
    case 'shoot':
      return { que: 'apuntado', de: paso.stack, at: paso.at, sale: true };
    case 'apunta':
      return {
        que: paso.granada === true ? 'granada' : 'apuntado',
        de: paso.stack,
        at: paso.at,
        sale: false,
      };
    case 'cast':
      return paso.granada === undefined
        ? null
        : { que: 'granada', de: paso.granada.de, at: paso.granada.at, sale: true };
    default:
      return null;
  }
}

/**
 * El paso de un hecho que no anda, con su reloj ya resuelto: el de un disparo
 * depende de quién dispara. `null` si el hecho no se cuenta.
 */
function pasoDeAccion(e: BattleEvent, battle: BattleState): PasoDeAccion | null {
  switch (e.kind) {
    case 'attack':
      return {
        tipo: 'attack',
        stack: e.stack,
        target: e.target,
        damage: e.damage,
        parado: e.parado ?? 0,
        devuelto: e.retaliation,
        dura: DURACION.attack,
        impacto: IMPACTO,
        suelta: null,
      };
    case 'shoot': {
      const { body } = stackDe(battle, e.stack, 'hace disparar');
      avisarSiNoPintaElDisparo(body);
      return {
        tipo: 'shoot',
        stack: e.stack,
        target: e.target,
        at: e.at,
        damage: e.damage,
        parado: e.parado ?? 0,
        devuelto: false,
        ...relojDelDisparo(body),
      };
    }
    case 'cast':
    case 'power':
      // El poder de una unidad es un hechizo con otra mano: el mismo paso.
      return {
        tipo: 'cast',
        lanza: e.kind === 'power' ? e.stack : null,
        target: e.target ?? null,
        damage: e.kind === 'cast' ? (e.damage ?? 0) : 0,
        parado: e.kind === 'cast' ? (e.parado ?? 0) : 0,
        cura: e.kind === 'power' ? (e.cura ?? 0) : 0,
        dura: DURACION.cast,
        impacto: IMPACTO,
        suelta: null,
      };
    case 'perished':
      return { tipo: 'perished', stack: e.stack, dura: DURACION.perished };
    case 'raised':
      return { tipo: 'raised', stack: e.stack, from: e.from, dura: DURACION.raised };
    case 'aimed':
      return { tipo: 'apunta', stack: e.stack, at: e.at, dura: DURACION.apunta };
    case 'thrown':
      return { tipo: 'apunta', stack: e.stack, at: e.at, dura: DURACION.apunta, granada: true };
    case 'blast':
      // La explosión, como un hechizo sobre cada alcanzado: no hay arte de explosión.
      return {
        tipo: 'cast',
        lanza: null,
        target: e.target,
        damage: e.damage,
        parado: e.parado ?? 0,
        cura: 0,
        granada: { de: e.stack, at: e.at },
        dura: DURACION.cast,
        impacto: IMPACTO,
        suelta: null,
      };
    case 'cruce':
      return { tipo: 'cruce', evento: e, dura: DURACION.cruce };
    default:
      return null;
  }
}

/**
 * Lo que tarda el animador, a ritmo normal, en contar `nuevos`, hechos del
 * registro de `battle`: la misma cuenta que hace con su cola, para quien tiene
 * que esperar a que acabe de contar —el guion de capturas— sin un reloj propio
 * que se quede atrás. Un tramo son sus casillas (`path`) al paso de quien anda,
 * corriendo si el tramo va corriendo (`vaCorriendo`).
 */
export function duracionDeLaJugada(battle: BattleState, nuevos: readonly BattleEvent[]): number {
  let ms = 0;
  for (const e of nuevos) {
    if (e.kind === 'move' || e.kind === 'climbed') {
      // Subir es un paso de una casilla, a la marcha.
      const s = stackDe(battle, e.stack, e.kind === 'move' ? 'mueve' : 'hace subir');
      const corre = e.kind === 'move' && vaCorriendo(e);
      const casillas = e.kind === 'move' ? e.path.length : 1;
      ms += casillas * msPorCasilla(s.body, corre ? 'charge' : 'walk', ALTO_DE_FIGURA);
    } else {
      const paso = pasoDeAccion(e, battle);
      if (paso !== null) ms += paso.dura;
    }
  }
  return ms;
}

/** La vida de `s` como está escrita: una copia, que el núcleo la cambia en el sitio. */
function vidaDe(s: BattleStack): Vida {
  return { count: s.count, topHp: s.topHp };
}

/** Cada bando sale mirando al otro: el atacante al este, el defensor al oeste. */
function miradaDeSalida(s: BattleStack): Direccion {
  return s.side === 'defender' ? 'O' : 'E';
}

/**
 * Lo que el animador dice del tablero que se pinta (`VistaBatalla`), al ritmo de su cola:
 * dónde y cómo está cada figura, con la vida de su último impacto visto (`figura`), quién
 * actúa (`activo`), lo que vuela y la cifra del golpe (`efectos`) y lo pendiente a distancia
 * (`apuntados`, `granadas`). Lo leen igual el tablero de la partida y la arena
 * (`EscenaBatalla`) y el del espectador (R4 de la reorganización, 07-11-2026).
 */
type LoQueCuentaElAnimador = Pick<
  VistaBatalla,
  'figura' | 'activo' | 'efectos' | 'apuntados' | 'granadas'
>;

export class BattleAnimator {
  /** Qué batalla se está contando: la da quien observa (ver `observe`). */
  private identidad: unknown = null;
  private leidos = 0;
  private readonly cola: Paso[] = [];
  /** El paso que se cuenta ahora; `impactado`, si ya llegó su impacto a la vida (`impactar`). */
  private actual: { paso: Paso; inicio: number; dura: number; impactado: boolean } | null = null;
  /**
   * A qué ritmo se cuenta, 1 el normal. Lo sube el espectador cuando se queda
   * detrás de la partida (`ritmoDeReproduccion` en `espectador/telon.ts`); el
   * cliente que juega no lo toca. Se lee al EMPEZAR cada paso y el paso guarda su
   * duración: cambiarlo a mitad no hace saltar la figura que ya se está moviendo.
   */
  private ritmo = 1;

  get velocidad(): number {
    return this.ritmo;
  }

  /** Solo acelera: frenar por debajo de 1 no lo pide nadie y se diría como fallo. */
  set velocidad(v: number) {
    if (!Number.isFinite(v) || v < 1) {
      throw new Error(`el animador no puede ir a ritmo ${v}: va de 1 (normal) hacia arriba`);
    }
    this.ritmo = v;
  }
  /** Dónde se VE cada unidad, en el plano, con el hex de cabeza. */
  private readonly vista = new Map<string, Plano>();
  /** Dónde estará cuando la cola acabe: el `desde` del siguiente movimiento. */
  private readonly destino = new Map<string, Plano>();
  /** Lo alto que se VE cada unidad (`EstadoFigura.elevacion`), como `vista`. */
  private readonly altura = new Map<string, number>();
  /** Lo alto que estará cuando la cola acabe, como `destino`. */
  private readonly alturaDestino = new Map<string, number>();
  /**
   * Las que ya cayeron en pantalla, con el instante en que EMPEZÓ su caída: el
   * cadáver sigue el reloj de la muerte desde ahí. Las que ya estaban muertas al
   * verse la batalla, desde siempre.
   */
  private readonly caidas = new Map<string, number>();
  /**
   * El instante del último impacto que recibió cada una, igual que `caidas`
   * guarda el de la caída: su clip de daño sigue desde ahí aunque el paso del
   * golpe ya haya acabado. Cuándo ACABA lo decide quien pinta con el reloj del
   * clip en el atlas (`clipEnCurso`), que el animador no conoce.
   */
  private readonly heridas = new Map<string, number>();
  /** Hacia dónde miró cada una la última vez. */
  private readonly mirada = new Map<string, Direccion>();
  /**
   * De su casilla al centro de cada unidad, en el plano (`centroDeStack`). No
   * cambia en toda la batalla: antes se rehacía con `stackHexes` por figura y
   * por fotograma.
   */
  private readonly aCentro = new Map<string, Plano>();
  /**
   * Lo levantado de un cadáver cuyo paso aún no se ha contado: el estado ya lo trae,
   * pero no se ve hasta que acaba su `raised` (08-11-2026, «Levantar zombi»).
   */
  private readonly porAparecer = new Set<string>();
  /** Los cadáveres gastados ya contados: no se pintan (`OrigenDelStack.levantadoDe`). */
  private readonly gastados = new Set<string>();
  /** El instante del fotograma, fijado por `tick`. */
  private ahora = 0;
  /** La casilla de cabeza en la que se VE quieta cada una, como `vista`. */
  private readonly casillaVista = new Map<string, Hex>();
  /**
   * La vida que se VE de cada una con algo suyo por contar: la del estado antes
   * de lo que espera en la cola, con los impactos ya vistos encima. Sin nada por
   * contar (`porContar`), manda el estado.
   */
  private readonly vidaVista = new Map<string, Vida>();
  /** Cuántos pasos de la cola, o el de ahora antes de su impacto, cambian la vida de cada una. */
  private readonly porContar = new Map<string, number>();
  /**
   * Lo que llevaba colgado cada stack en la lectura anterior (`fotoDeEfectos`): lo
   * de antes de la jugada que se lee ahora. El paso de un cruce se lo lleva, porque
   * el estado ya trae lo que el cruce dejó (el Defensivo de quien pega) y lo de las
   * jugadas de después. Si una sola lectura trae dos cruces, el segundo lleva lo de
   * antes de los dos (riesgo aceptado en el plan del 31-10-2026).
   */
  private efectosLeidos: FotoDeEfectos = new Map();
  /**
   * La última batalla observada: al contarse el último impacto de una unidad,
   * su vida es la de aquí —lo que el registro no dice, como el drenaje, también—.
   */
  private ultima: BattleState | null = null;
  /**
   * Quién actúa en lo que se cuenta: el del último paso con actor (`actorDe`).
   * Con la cola vacía manda el turno del estado (`activo`), y de él se parte.
   */
  private actor: string | null = null;

  /**
   * Lee lo nuevo del registro y lo encola.
   *
   * Una batalla nueva empieza de cero con las posiciones de ahora. Qué es «nueva»
   * lo dice `identidad`, y no la identidad del objeto: el espectador recibe una
   * batalla recién parseada con cada fotograma del cable, y por identidad la
   * reiniciaba en cada uno. El cliente que juega pasa el propio objeto, que sí
   * es estable; el espectador, un contador de batallas. Y un registro más corto
   * que lo leído también es otra batalla, venga de donde venga.
   */
  observe(battle: BattleState, identidad: unknown = battle): void {
    if (identidad !== this.identidad || battle.log.length < this.leidos) {
      this.identidad = identidad;
      this.cola.length = 0;
      this.actual = null;
      this.vista.clear();
      this.destino.clear();
      this.altura.clear();
      this.alturaDestino.clear();
      this.caidas.clear();
      this.heridas.clear();
      this.aCentro.clear();
      this.mirada.clear();
      this.casillaVista.clear();
      this.vidaVista.clear();
      this.porContar.clear();
      this.porAparecer.clear();
      this.gastados.clear();
      for (const s of battle.stacks) {
        // Lo ya levantado se ve, y su cadáver no: no hay nada que contar.
        if (s.origen.kind === 'catalogo' && s.origen.levantadoDe !== undefined) {
          this.gastados.add(s.origen.levantadoDe);
        }
        // Cada uno empieza mirando al otro lado del tablero: el defensor, al oeste.
        this.mirada.set(s.id, miradaDeSalida(s));
        this.enSuCasilla(battle, s);
        if (!isAlive(s)) this.caidas.set(s.id, Number.NEGATIVE_INFINITY);
      }
      this.leidos = battle.log.length;
      this.efectosLeidos = fotoDeEfectos(battle);
      this.alDiaCon(battle);
      return;
    }
    for (let i = this.leidos; i < battle.log.length; i++) {
      const e = battle.log[i] as BattleEvent;
      const paso = this.traducir(e, battle);
      if (paso !== null) {
        if (paso.tipo === 'raised') this.porAparecer.add(paso.stack);
        this.cola.push(paso);
        for (const id of tocadosPor(paso))
          this.porContar.set(id, (this.porContar.get(id) ?? 0) + 1);
      }
    }
    // La foto se rehace solo si el registro creció: los efectos no cambian sin un
    // hecho (y así no se copian en cada fotograma).
    if (battle.log.length > this.leidos) this.efectosLeidos = fotoDeEfectos(battle);
    this.leidos = battle.log.length;
    this.alDiaCon(battle);
  }

  /** `s` quieto en su casilla de ahora, a su alto: al empezar una batalla y en el despliegue. */
  private enSuCasilla(battle: BattleState, s: BattleStack): void {
    const p = planoDeHex(s.hex);
    this.vista.set(s.id, p);
    this.destino.set(s.id, p);
    const alto = nivelDe(battle.muralla, s.hex);
    this.altura.set(s.id, alto);
    this.alturaDestino.set(s.id, alto);
    this.casillaVista.set(s.id, s.hex);
  }

  /**
   * Lo que del estado ya se puede enseñar: la vida de quien no tiene nada por
   * contar y, con la cola vacía, quién actúa. Va DESPUÉS de leer lo nuevo: con
   * algo suyo recién leído, la unidad se queda con la vida de antes, que es la
   * que se apuntó en la lectura anterior.
   */
  private alDiaCon(battle: BattleState): void {
    this.ultima = battle;
    // En el despliegue, cada uno en su casilla de ahora: colocar no deja línea en
    // el registro (es estado, `aplicarDespliegue`), así que lo de arriba no lo ve y
    // la figura se quedaba donde nació; tampoco al que reasienta abrir una tanda.
    // Con algo en la cola no se toca: en el despliegue no hay nada que contar.
    if (battle.despliegue !== null && !this.busy) {
      for (const s of battle.stacks) this.enSuCasilla(battle, s);
    }
    for (const s of battle.stacks) {
      if ((this.porContar.get(s.id) ?? 0) === 0) this.vidaVista.set(s.id, vidaDe(s));
    }
    if (!this.busy) this.actor = battle.turno?.stack ?? null;
  }

  private traducir(e: BattleEvent, battle: BattleState): Paso | null {
    switch (e.kind) {
      case 'move': {
        // La carga y la carrera las dice el `move`, que las escribe el núcleo. Con
        // carga, el `move` va tras el `cruce` (la rueda antes de correr, 31-10-2026):
        // se cuenta el desenlace, la carrera y el golpe, en ese orden.
        return this.andar(battle, e.stack, e.to, e.path, 'mueve', vaCorriendo(e));
      }
      // Subir a la muralla se cuenta como un paso del pie a la columna.
      case 'climbed':
        return this.andar(battle, e.stack, e.to, [e.to], 'hace subir');
      default: {
        const paso = pasoDeAccion(e, battle);
        // El cruce se lleva la foto de antes de leer su jugada, que es del animador.
        return paso?.tipo === 'cruce' ? { ...paso, efectos: this.efectosLeidos } : paso;
      }
    }
  }

  /** El paso de andar `path` hasta `to`, desde donde acabó el anterior y a su altura. */
  private andar(
    battle: BattleState,
    stack: string,
    to: Hex,
    path: readonly Hex[],
    que: string,
    corre = false,
  ): Paso {
    const hasta = planoDeHex(to);
    const desde = this.destino.get(stack) ?? hasta;
    this.destino.set(stack, hasta);
    const camino = [desde, ...path.map(planoDeHex)];
    const altoAntes = this.alturaDestino.get(stack) ?? 0;
    const alturas = [altoAntes, ...path.map((h) => nivelDe(battle.muralla, h))];
    this.alturaDestino.set(stack, alturas.at(-1) as number);
    const s = stackDe(battle, stack, que);
    return {
      tipo: 'move',
      stack,
      desde,
      hasta,
      casilla: to,
      camino,
      alturas,
      body: s.body,
      alto: ALTO_DE_FIGURA,
      ...(corre ? { corre: true as const } : {}),
    };
  }

  /**
   * Fija el instante del fotograma y avanza la cola hasta él. Una vez por
   * fotograma, y antes de decidir si se acepta un clic.
   *
   * Antes cada lectura —`busy`, `figura`, `efectos`— avanzaba la cola por su
   * cuenta con su propio reloj: preguntar si la batalla estaba ocupada cambiaba
   * la batalla, y dos figuras del mismo fotograma podían verse en dos instantes.
   * Ahora las lecturas no tocan nada.
   */
  tick(ahora: number): void {
    this.ahora = ahora;
    // El siguiente paso empieza cuando ACABÓ el anterior, no cuando alguien
    // vuelve a mirar: si un fotograma llega tarde, la cola no se estira.
    let libreDesde = ahora;
    for (;;) {
      if (this.actual !== null) {
        const fin = this.actual.inicio + this.actual.dura;
        if (ahora < fin) {
          if (ahora >= this.instanteDelImpacto(this.actual)) this.impactar(this.actual);
          return;
        }
        // Un fotograma que llega tarde se salta el impacto, pero no la vida que quita.
        this.impactar(this.actual);
        this.terminar(this.actual);
        this.actual = null;
        libreDesde = fin;
      }
      const siguiente = this.cola.shift();
      if (siguiente === undefined) return;
      this.actual = {
        paso: siguiente,
        inicio: libreDesde,
        dura: duracionDelPaso(siguiente) / this.ritmo,
        impactado: false,
      };
      this.actor = actorDe(siguiente) ?? this.actor;
    }
  }

  /** Cuándo llega el impacto de un paso; el de uno sin impacto, al acabar. */
  private instanteDelImpacto(a: { paso: Paso; inicio: number; dura: number }): number {
    const p = a.paso;
    return p.tipo === 'attack' || p.tipo === 'shoot' || p.tipo === 'cast'
      ? a.inicio + p.impacto * a.dura
      : a.inicio + a.dura;
  }

  /**
   * El impacto del paso, una vez: la vida de su objetivo baja lo que dice el
   * registro (`trasElGolpe`, la cuenta del núcleo) o sube lo que curó, y cada
   * unidad que tocaba tiene una cosa menos por contar. Con la última, su vida es
   * la del estado.
   */
  private impactar(a: { paso: Paso; impactado: boolean }): void {
    if (a.impactado) return;
    a.impactado = true;
    const p = a.paso;
    if ((p.tipo === 'attack' || p.tipo === 'shoot' || p.tipo === 'cast') && p.target !== null) {
      const s = this.ultima?.stacks.find((x) => x.id === p.target);
      const antes = this.vidaVista.get(p.target);
      if (s !== undefined && antes !== undefined) {
        const tras = trasElGolpe({ ...antes, unit: s.unit }, p.damage);
        const cura = p.tipo === 'cast' ? p.cura : 0;
        this.vidaVista.set(
          p.target,
          cura > 0 && tras.count > 0
            ? { count: tras.count, topHp: Math.min(s.unit.hp, tras.topHp + cura) }
            : tras,
        );
      }
    }
    for (const id of tocadosPor(p)) {
      const quedan = (this.porContar.get(id) ?? 0) - 1;
      if (quedan > 0) {
        this.porContar.set(id, quedan);
        continue;
      }
      this.porContar.delete(id);
      const s = this.ultima?.stacks.find((x) => x.id === id);
      if (s !== undefined) this.vidaVista.set(id, vidaDe(s));
    }
  }

  /**
   * Quién actúa en el tablero: con la cola vacía, el del turno del estado; si
   * no, quien actúa en lo que se cuenta. Sin esto el aro saltaba al siguiente
   * en cuanto el núcleo cerraba la jugada, con la figura aún andando.
   */
  activo(battle: BattleState): string | null {
    return this.busy ? this.actor : (battle.turno?.stack ?? null);
  }

  private terminar({ paso: p, inicio, dura }: { paso: Paso; inicio: number; dura: number }): void {
    // La mirada con la que acaba el paso se queda: después de andar o de golpear
    // no se vuelve a su lado por defecto.
    if (p.tipo === 'move') {
      this.mirada.set(
        p.stack,
        miradaEnElTramo(p.camino, p.camino.length - 2, this.miradaDe(p.stack)),
      );
    }
    if (p.tipo === 'attack') {
      this.mirada.set(p.stack, this.miradaAlObjetivo(p.stack, p.target));
    }
    if (p.tipo === 'shoot' || p.tipo === 'apunta') {
      this.mirada.set(p.stack, this.miradaALaCasilla(p.stack, p.at));
    }
    if (p.tipo === 'cast' && p.lanza !== null && p.target !== null && p.target !== p.lanza) {
      this.mirada.set(p.lanza, this.miradaAlObjetivo(p.lanza, p.target));
    }
    if (p.tipo === 'move') {
      this.vista.set(p.stack, p.hasta);
      this.casillaVista.set(p.stack, p.casilla);
      this.altura.set(p.stack, p.alturas.at(-1) as number);
    }
    if (p.tipo === 'perished') this.caidas.set(p.stack, inicio);
    if (p.tipo === 'raised') {
      this.porAparecer.delete(p.stack);
      this.gastados.add(p.from);
    }
    // El daño sigue después del paso: se apunta cuándo fue el impacto.
    if (p.tipo === 'attack' || p.tipo === 'shoot' || p.tipo === 'cast') {
      if (p.target !== null && p.damage > 0) this.heridas.set(p.target, inicio + p.impacto * dura);
    }
    // Quien actúa deja de dolerse: su propio paso manda. El cruce no es un paso
    // de nadie en el tablero: lo cuenta la rueda.
    if (p.tipo !== 'cast' && p.tipo !== 'cruce') this.heridas.delete(p.stack);
  }

  /**
   * El cruce de la rueda que se está contando y cuánto lleva, de 0 a 1, o `null`
   * si el paso de ahora es otro: lo lee el diálogo de la rueda para pintar el
   * desenlace al ritmo de la cola.
   */
  cruceEnCurso(): CruceEnCurso | null {
    const paso = this.actual?.paso;
    return paso?.tipo === 'cruce'
      ? { evento: paso.evento, t: this.progreso(), efectos: paso.efectos }
      : null;
  }

  /**
   * Los dos del cruce que se cuenta ahora (quien pega y quien recibe), o `null`:
   * los marca el tablero con su aro (`VistaBatalla.enLaRueda`) en la partida, la
   * arena y el espectador.
   */
  losDelCruce(): { readonly atacante: string; readonly objetivo: string } | null {
    const cruce = this.cruceEnCurso();
    return cruce === null ? null : { atacante: cruce.evento.stack, objetivo: cruce.evento.target };
  }

  /**
   * Lo pendiente a distancia de cada uno **al ritmo de la cola**: lo apuntado de cada
   * tirador (`BattleStack.apuntado`) y la granada en el aire de cada granadero
   * (`BattleStack.granada`). El estado ya trae el final de lo que se cuenta, y el
   * tirador que abre su turno ya disparó en él y no apunta a nada, mientras la cola
   * aún cuenta lo que jugaron antes los contrarios (26-10-2026: «se quita la marca del
   * disparo demasiado pronto, debería quitarse justo antes de disparar»). Por stack y
   * por cosa, manda su primer paso que falta por contar (`pendienteDelPaso`): un
   * disparo o una explosión que aún no impactó deja ver su casilla hasta el impacto,
   * y un «apunta» o un lanzamiento que aún no empezó la esconde hasta entonces. Una
   * pasada por la cola para los dos (hallazgo S9 de /simplify, 02-11-2026: la granada
   * era una copia). Lo lee el tablero (`VistaBatalla.apuntados`, `granadas`) en la
   * partida, la arena y el espectador.
   */
  aDistancia(battle: BattleState): {
    readonly apuntados: ReadonlyMap<string, Hex>;
    readonly granadas: ReadonlyMap<string, Hex>;
  } {
    const r = { apuntado: new Map<string, Hex>(), granada: new Map<string, Hex>() };
    for (const s of battle.stacks) {
      if (!isAlive(s)) continue;
      if (s.apuntado !== null) r.apuntado.set(s.id, s.apuntado);
      if (s.granada !== null) r.granada.set(s.id, s.granada);
    }
    if (this.busy) {
      const vistos = { apuntado: new Set<string>(), granada: new Set<string>() };
      const ver = (paso: Paso, enCurso: boolean, impactado: boolean): void => {
        const p = pendienteDelPaso(paso);
        if (p === null || vistos[p.que].has(p.de)) return;
        vistos[p.que].add(p.de);
        if (p.sale) {
          if (impactado) r[p.que].delete(p.de);
          else r[p.que].set(p.de, p.at);
        } else if (!enCurso) {
          r[p.que].delete(p.de);
        }
      };
      if (this.actual !== null) ver(this.actual.paso, true, this.actual.impactado);
      for (const paso of this.cola) ver(paso, false, false);
    }
    return { apuntados: r.apuntado, granadas: r.granada };
  }

  /**
   * Lo que cuenta del tablero de `battle`, de una vez (`LoQueCuentaElAnimador`): lo que la
   * escena de batalla y el espectador le pedían campo a campo, cada uno con su copia.
   */
  loQueCuenta(battle: BattleState): LoQueCuentaElAnimador {
    return {
      figura: (s) => this.figura(s),
      activo: this.activo(battle),
      efectos: this.efectos(battle),
      ...this.aDistancia(battle),
    };
  }

  /** ¿Queda algo por enseñar? Mientras sí, se repinta y no se aceptan clics. */
  get busy(): boolean {
    return this.actual !== null || this.cola.length > 0;
  }

  /** Cuánto lleva el paso en curso, de 0 a 1. */
  private progreso(): number {
    if (this.actual === null) return 0;
    return Math.min(1, (this.ahora - this.actual.inicio) / this.actual.dura);
  }

  /** Dónde pintar el centro de un stack cuya cabeza se ve en `cabeza`. */
  private centro(s: BattleStack, cabeza: Plano): Plano {
    let d = this.aCentro.get(s.id);
    if (d === undefined) {
      const c = centroDeStack(stackHexes(s));
      const propia = planoDeHex(s.hex);
      d = { x: c.x - propia.x, y: c.y - propia.y };
      this.aCentro.set(s.id, d);
    }
    return { x: cabeza.x + d.x, y: cabeza.y + d.y };
  }

  private miradaDe(id: string): Direccion {
    return this.mirada.get(id) ?? 'E';
  }

  /** Mirando a la casilla del objetivo, desde donde se ve cada uno ahora. */
  private miradaAlObjetivo(id: string, objetivo: string): Direccion {
    const antes = this.miradaDe(id);
    const yo = this.vista.get(id);
    const el = this.vista.get(objetivo);
    if (yo === undefined || el === undefined) return antes;
    return direccionHacia(yo, el, antes);
  }

  /** Hacia dónde mira `id` para apuntar o disparar a la casilla `at`: el disparo va por la recta. */
  private miradaALaCasilla(id: string, at: Hex): Direccion {
    const antes = this.miradaDe(id);
    const yo = this.vista.get(id);
    if (yo === undefined) return antes;
    return direccionHacia(yo, planoDeHex(at), antes);
  }

  figura(s: BattleStack): EstadoFigura {
    const paso = this.actual?.paso;
    const t = this.progreso();
    const desdeInicio = this.ahora - (this.actual?.inicio ?? 0);
    let cabeza = this.vista.get(s.id) ?? planoDeHex(s.hex);
    let elevacion = this.altura.get(s.id) ?? 0;
    let clip: CharacterClip = 'idle';
    let tiempo = this.ahora;
    let golpe = 0;
    let alfaDelAro = 1;
    let mirada = this.mirada.get(s.id) ?? miradaDeSalida(s);
    let casilla: Hex | null = this.casillaVista.get(s.id) ?? s.hex;
    // El daño de un golpe que ya acabó sigue su clip desde el impacto, si nada
    // de lo que pasa ahora le toca a esta figura.
    const herida = this.heridas.get(s.id);
    if (herida !== undefined) {
      clip = 'hurt';
      tiempo = this.ahora - herida;
    }

    if (paso !== undefined) {
      if (paso.tipo === 'move' && paso.stack === s.id) {
        cabeza = porElCamino(paso.camino, t);
        elevacion = alturaEnElCamino(paso.alturas, t);
        mirada = miradaEnElTramo(paso.camino, tramoEn(paso.camino, t), mirada);
        clip = paso.corre === true ? 'charge' : 'walk';
        tiempo = desdeInicio;
        casilla = null;
      } else if ((paso.tipo === 'attack' || paso.tipo === 'shoot') && paso.stack === s.id) {
        // El golpe con su ataque, cuerpo a cuerpo; el disparo con su clip, que
        // en quien no lo pinta es su ataque (`figuraDe`), hacia la casilla apuntada.
        clip = paso.tipo;
        mirada =
          paso.tipo === 'shoot'
            ? this.miradaALaCasilla(s.id, paso.at)
            : this.miradaAlObjetivo(s.id, paso.target);
        tiempo = desdeInicio;
      } else if (paso.tipo === 'apunta' && paso.stack === s.id) {
        mirada = this.miradaALaCasilla(s.id, paso.at);
      } else if (paso.tipo === 'cast' && paso.lanza === s.id) {
        // Quien lanza con su poder, con el ataque: es la acción que hay. Sobre sí
        // misma no se gira.
        clip = 'attack';
        if (paso.target !== null && paso.target !== s.id) {
          mirada = this.miradaAlObjetivo(s.id, paso.target);
        }
        tiempo = desdeInicio;
      } else if (
        // Lo recibe igual un golpe, un disparo o un hechizo: una sola rama.
        (paso.tipo === 'attack' || paso.tipo === 'shoot' || paso.tipo === 'cast') &&
        paso.target === s.id &&
        t >= paso.impacto
      ) {
        golpe = trasImpacto(t, paso.impacto);
        if (paso.damage > 0) {
          // Con daño, se duele: el clip arranca en el impacto.
          clip = 'hurt';
          tiempo = desdeInicio - paso.impacto * (this.actual?.dura ?? 0);
        }
      } else if (paso.tipo === 'perished' && paso.stack === s.id) {
        // Cae con su clip de muerte; lo que se funde es el aro y la barra, no
        // la figura, que se queda en el suelo como cadáver.
        clip = 'death';
        tiempo = desdeInicio;
        alfaDelAro = 1 - t;
      }
    }

    // Una unidad muerta en el estado sigue en pie hasta que su caída se ve.
    const inicioDeLaCaida = isAlive(s) ? undefined : this.caidas.get(s.id);
    // Ni el levantado antes de contarse ni el cadáver gastado después: ninguno se pinta.
    const fuera = this.porAparecer.has(s.id) || this.gastados.has(s.id);
    const visible = inicioDeLaCaida === undefined && !fuera;
    const caida = inicioDeLaCaida === undefined || fuera ? null : this.ahora - inicioDeLaCaida;
    const vida = (this.porContar.get(s.id) ?? 0) > 0 ? this.vidaVista.get(s.id) : undefined;
    return {
      en: this.centro(s, cabeza),
      elevacion,
      pv: vida === undefined ? stackHp(s) : stackHp({ ...s, ...vida }),
      casilla,
      clip,
      tiempo,
      golpe,
      visible,
      alfaDelAro,
      mira: mirada,
      caida,
    };
  }

  /** Los efectos del paso en curso: el proyectil que vuela y la cifra del golpe. */
  efectos(battle: BattleState): Efecto[] {
    const paso = this.actual?.paso;
    if (paso === undefined) return [];
    const t = this.progreso();
    const donde = (id: string): Plano | null => {
      const s = battle.stacks.find((x) => x.id === id);
      return s === undefined ? null : this.centro(s, this.vista.get(id) ?? planoDeHex(s.hex));
    };
    const alto = (id: string): number => this.altura.get(id) ?? 0;
    const out: Efecto[] = [];
    if (paso.tipo === 'attack' || paso.tipo === 'shoot') {
      const a = donde(paso.stack);
      // El disparo que no dio a nadie cae en la casilla apuntada, a ras de suelo.
      const b =
        paso.target === null
          ? paso.tipo === 'shoot'
            ? planoDeHex(paso.at)
            : null
          : donde(paso.target);
      const altoDelBlanco = paso.target === null ? 0 : alto(paso.target);
      const { impacto, suelta } = paso;
      if (a !== null && b !== null) {
        // Lo que vuela, vuela de la suelta al impacto.
        if (suelta !== null && t >= suelta && t < impacto) {
          out.push({
            tipo: 'proyectil',
            desde: a,
            hasta: b,
            t: (t - suelta) / (impacto - suelta),
            altoDesde: alto(paso.stack),
            altoHasta: altoDelBlanco,
          });
        }
        if (t >= impacto && paso.target !== null) {
          out.push(...cifraDelGolpe(paso, b, altoDelBlanco, t, impacto));
        }
      }
    }
    if (paso.tipo === 'cast' && paso.target !== null) {
      const b = donde(paso.target);
      if (b !== null) {
        const arriba = alto(paso.target);
        out.push({ tipo: 'hechizo', en: b, alto: arriba, t });
        if (t >= paso.impacto) out.push(...cifraDelGolpe(paso, b, arriba, t, paso.impacto));
      }
    }
    return out;
  }
}

/**
 * La cifra que sale sobre quien recibe en el impacto: «−N» con daño, «parado» si
 * la armadura se lo comió entero (#262) y nada si no hubo golpe que contar (una
 * Prisa, una cura).
 */
function cifraDelGolpe(
  paso: { readonly damage: number; readonly parado: number },
  en: Plano,
  alto: number,
  t: number,
  impacto: number,
): Efecto[] {
  const tras = trasImpacto(t, impacto);
  if (paso.damage > 0) return [{ tipo: 'danio', en, alto, cifra: paso.damage, t: tras }];
  if (paso.parado > 0) return [{ tipo: 'parado', en, alto, t: tras }];
  return [];
}
