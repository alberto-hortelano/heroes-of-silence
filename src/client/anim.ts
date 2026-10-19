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
import { isAlive, stackHexes } from '@core/battle/battle.js';
import { stackHp, trasElGolpe } from '@core/battle/damage.js';
import { nivelDe } from '@core/battle/muralla.js';
import type { HechoDelCruce } from '@core/battle/rueda.js';
import type { BattleEvent, BattleStack, BattleState } from '@core/battle/types.js';
import { hexSize } from '@core/data.js';
import type { Hex } from '@core/types.js';
import { type Direccion, direccionHacia } from './direccion.js';
import { msDeSuelta, msPorCasilla } from './marcha.js';
import type { CharacterClip } from './render/character.js';
import { type ArteDeFigura, arteDe } from './render/personajes.js';
import { ALTO_DE_FIGURA, centroDeStack, type Plano, planoDeHex } from './render/proyeccion.js';

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
export const VUELO_MS = 340;
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
export function relojDelDisparo(body: string): Reloj {
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
      /** El tramo con el que se carga: el jinete lo anda con la lanza bajada. */
      readonly carga?: true;
      /** Quién anda y lo alto que se pinta, en pasos: lo que fija su zancada. */
      readonly body: string;
      readonly alto: number;
    }
  | ({
      readonly tipo: 'attack' | 'shoot';
      readonly stack: string;
      readonly target: string;
      readonly damage: number;
      /** Lo que paró la armadura del objetivo (la arena, #262); 0 sin ella. */
      readonly parado: number;
      /** Es un contraataque: quien pega no es quien actúa (`activo`). */
      readonly devuelto: boolean;
    } & Reloj)
  /**
   * Un hechizo. `lanza`, la unidad que lo lanza con su poder (la arena: Curar,
   * Bendecir), que lo hace con su clip de ataque —no hay arte de lanzar—; el del
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
    } & Reloj)
  | { readonly tipo: 'perished'; readonly stack: string; readonly dura: number }
  /** El cruce de la rueda del golpe: nadie se mueve; lo cuenta el diálogo de la rueda. */
  | { readonly tipo: 'cruce'; readonly evento: HechoDelCruce; readonly dura: number };

/** Lo que el lienzo necesita de una figura en este instante. */
export interface EstadoFigura {
  /** Dónde está, en el plano del tablero (centro de la figura, no del hex de cabeza). */
  readonly en: Plano;
  readonly clip: CharacterClip;
  /** Milisegundos desde que empezó su clip actual. */
  readonly tiempo: number;
  /** 0 si no le están pegando; de 0 a 1 mientras dura el golpe que recibe. */
  readonly golpe: number;
  /** Se pinta aunque el estado diga que ha caído: su caída aún no se ha visto. */
  readonly visible: boolean;
  /**
   * La opacidad del aro, la barra, el nombre y la corona: lo que se funde
   * cuando cae. La figura con arte no se funde —se queda de cadáver—; sin arte,
   * su marcador va con el aro (`Figura.alfaSinArte`).
   */
  readonly alfaDelAro: number;
  /**
   * Cuánto lleva caída, en ms, si ya se vio caer —o desde antes de que la
   * batalla se viera—: el lienzo deja el cadáver en su casilla hasta el final
   * (`fotogramaDeCaida`). `null` mientras esté en pie o cayendo en la cola.
   */
  readonly caida: number | null;
  /**
   * Lo alto que está: 0 en el suelo, 1 en lo alto de un muro, y lo de en medio
   * mientras sube o baja. El lienzo lo multiplica por lo que mide una columna.
   */
  readonly elevacion: number;
  /**
   * Hacia dónde mira, en ocho sectores (`direccion.ts`): anda mirando a la
   * casilla siguiente, golpea mirando a su objetivo y se queda mirando a donde
   * miró la última vez. Es estado del animador, no del núcleo.
   */
  readonly mira: Direccion;
  /**
   * Los PV que se ven en su barra: los de su último impacto ya contado, no los
   * del estado, que ya trae lo que la cola aún no ha enseñado. Con nada suyo por
   * contar, los del estado.
   */
  readonly pv: number;
  /**
   * La casilla de cabeza en la que se la ve quieta —la de antes de un tramo que
   * aún no ha andado—, o `null` mientras anda: el resaltado del activo va donde
   * está la figura, no donde la deja el estado.
   */
  readonly casilla: Hex | null;
}

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
      return [p.target];
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
      return p.stack;
    case 'cast':
      return p.lanza;
    case 'cruce':
      return p.evento.stack;
    case 'perished':
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

/** Un efecto suelto encima del tablero: un proyectil o una cifra de daño. */
export type Efecto =
  | {
      readonly tipo: 'proyectil';
      readonly desde: Plano;
      readonly hasta: Plano;
      readonly t: number;
      /** Lo alto de quien tira y de su blanco (`EstadoFigura.elevacion`): la flecha sale de la columna. */
      readonly altoDesde: number;
      readonly altoHasta: number;
    }
  | {
      readonly tipo: 'danio';
      readonly en: Plano;
      readonly alto: number;
      readonly cifra: number;
      readonly t: number;
    }
  /** Un golpe que la armadura paró entero (#262): en vez de «−0», «parado». */
  | { readonly tipo: 'parado'; readonly en: Plano; readonly alto: number; readonly t: number }
  | { readonly tipo: 'hechizo'; readonly en: Plano; readonly alto: number; readonly t: number };

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
export function alturaEnElCamino(alturas: readonly number[], t: number): number {
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
 * si es el tramo con el que carga. Antes eran 520 ms para cualquier tramo, de
 * una casilla o de seis.
 */
export function duracionDelPaso(p: Paso): number {
  if (p.tipo !== 'move') return p.dura;
  return largoDe(p.camino) * msPorCasilla(p.body, p.carga === true ? 'charge' : 'walk', p.alto);
}

function stackDe(battle: BattleState, id: string, que: string): BattleStack {
  const s = battle.stacks.find((x) => x.id === id);
  if (s === undefined) throw new Error(`el registro ${que} a ${id}, que no está en la batalla`);
  return s;
}

/**
 * El paso de un hecho que no anda, con su reloj ya resuelto: el de un disparo
 * depende de quién dispara. `null` si el hecho no se cuenta.
 */
function pasoDeAccion(e: BattleEvent, battle: BattleState): Exclude<Paso, { tipo: 'move' }> | null {
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
    case 'cruce':
      return { tipo: 'cruce', evento: e, dura: DURACION.cruce };
    default:
      return null;
  }
}

/** Lo alto que se pinta `s`, en pasos: lo que fija su zancada (`msPorCasilla`). */
function altoDeFigura(s: BattleStack): number {
  return ALTO_DE_FIGURA[hexSize(s.unit) > 1 ? 'grande' : 'normal'];
}

/**
 * Lo que tarda el animador, a ritmo normal, en contar `nuevos`, hechos del
 * registro de `battle`: la misma cuenta que hace con su cola, para quien tiene
 * que esperar a que acabe de contar —el guion de capturas— sin un reloj propio
 * que se quede atrás. Un tramo son sus casillas (`path`) al paso de quien anda,
 * con la carga si el tramo es una carrera de carga (`charge` de su `move`).
 */
export function duracionDeLaJugada(battle: BattleState, nuevos: readonly BattleEvent[]): number {
  let ms = 0;
  for (const e of nuevos) {
    if (e.kind === 'move' || e.kind === 'climbed') {
      // Subir es un paso de una casilla, a la marcha.
      const s = stackDe(battle, e.stack, e.kind === 'move' ? 'mueve' : 'hace subir');
      const carga = e.kind === 'move' && e.charge === true;
      const casillas = e.kind === 'move' ? e.path.length : 1;
      ms += casillas * msPorCasilla(s.body, carga ? 'charge' : 'walk', altoDeFigura(s));
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
   * De la cabeza al centro de cada unidad, en el plano. En una unidad grande es
   * medio hex hacia atrás, y no cambia en toda la batalla: antes se rehacía con
   * `stackHexes` por figura y por fotograma.
   */
  private readonly aCentro = new Map<string, Plano>();
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
      for (const s of battle.stacks) {
        // Cada uno empieza mirando al otro lado del tablero: el defensor, al oeste.
        this.mirada.set(s.id, miradaDeSalida(s));
        const p = planoDeHex(s.hex);
        this.vista.set(s.id, p);
        this.destino.set(s.id, p);
        const alto = nivelDe(battle.muralla, s.hex);
        this.altura.set(s.id, alto);
        this.alturaDestino.set(s.id, alto);
        if (!isAlive(s)) this.caidas.set(s.id, Number.NEGATIVE_INFINITY);
        this.casillaVista.set(s.id, s.hex);
      }
      this.leidos = battle.log.length;
      this.alDiaCon(battle);
      return;
    }
    for (let i = this.leidos; i < battle.log.length; i++) {
      const e = battle.log[i] as BattleEvent;
      const paso = this.traducir(e, battle);
      if (paso !== null) {
        this.cola.push(paso);
        for (const id of tocadosPor(paso))
          this.porContar.set(id, (this.porContar.get(id) ?? 0) + 1);
      }
    }
    this.leidos = battle.log.length;
    this.alDiaCon(battle);
  }

  /**
   * Lo que del estado ya se puede enseñar: la vida de quien no tiene nada por
   * contar y, con la cola vacía, quién actúa. Va DESPUÉS de leer lo nuevo: con
   * algo suyo recién leído, la unidad se queda con la vida de antes, que es la
   * que se apuntó en la lectura anterior.
   */
  private alDiaCon(battle: BattleState): void {
    this.ultima = battle;
    for (const s of battle.stacks) {
      if ((this.porContar.get(s.id) ?? 0) === 0) this.vidaVista.set(s.id, vidaDe(s));
    }
    if (!this.busy) this.actor = battle.turno?.stack ?? null;
  }

  private traducir(e: BattleEvent, battle: BattleState): Paso | null {
    switch (e.kind) {
      case 'move': {
        // La carga la dice el `move`, que la escribe el núcleo: con la rueda, el
        // golpe que la cobra llega en otra jugada, después de la rueda.
        return this.andar(battle, e.stack, e.to, e.path, 'mueve', e.charge === true);
      }
      // Subir a la muralla se cuenta como un paso del pie a la columna.
      case 'climbed':
        return this.andar(battle, e.stack, e.to, [e.to], 'hace subir');
      default:
        return pasoDeAccion(e, battle);
    }
  }

  /** El paso de andar `path` hasta `to`, desde donde acabó el anterior y a su altura. */
  private andar(
    battle: BattleState,
    stack: string,
    to: Hex,
    path: readonly Hex[],
    que: string,
    carga = false,
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
      alto: altoDeFigura(s),
      ...(carga ? { carga: true as const } : {}),
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
    if (p.tipo === 'attack' || p.tipo === 'shoot') {
      this.mirada.set(p.stack, this.miradaAlObjetivo(p.stack, p.target));
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
  cruceEnCurso(): { readonly evento: HechoDelCruce; readonly t: number } | null {
    const paso = this.actual?.paso;
    return paso?.tipo === 'cruce' ? { evento: paso.evento, t: this.progreso() } : null;
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
        clip = paso.carga === true ? 'charge' : 'walk';
        tiempo = desdeInicio;
        casilla = null;
      } else if ((paso.tipo === 'attack' || paso.tipo === 'shoot') && paso.stack === s.id) {
        // El golpe con su ataque, cuerpo a cuerpo; el disparo con su clip, que
        // en quien no lo pinta es su ataque (`figuraDe`).
        clip = paso.tipo;
        mirada = this.miradaAlObjetivo(s.id, paso.target);
        tiempo = desdeInicio;
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
    const visible = inicioDeLaCaida === undefined;
    const caida = inicioDeLaCaida === undefined ? null : this.ahora - inicioDeLaCaida;
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
      const b = donde(paso.target);
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
            altoHasta: alto(paso.target),
          });
        }
        if (t >= impacto) out.push(...cifraDelGolpe(paso, b, alto(paso.target), t, impacto));
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
 * Bendición, una cura).
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
