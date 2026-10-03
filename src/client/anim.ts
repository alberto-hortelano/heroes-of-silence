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
 * Lo que NO se anima: lo que el rival hizo antes de que la batalla se viera por
 * primera vez. El registro dice a dónde fue cada unidad, no de dónde venía, así
 * que la primera lectura de una batalla toma las posiciones tal y como están.
 */
import { isAlive, stackHexes } from '@core/battle/battle.js';
import type { BattleEvent, BattleStack, BattleState } from '@core/battle/types.js';
import { hexSize } from '@core/data.js';
import { type Direccion, direccionHacia } from './direccion.js';
import { msDeSuelta, msPorCasilla } from './marcha.js';
import type { CharacterClip } from './render/character.js';
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
} as const;

/** En qué fracción del paso se nota el impacto si nada dice otra cosa: el retroceso y la cifra. */
const IMPACTO = 0.55;

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
      /**
       * Las casillas por las que se anda, de `desde` a `hasta` las dos
       * incluidas: el camino del motor (`path` del hecho). Interpolar en recta
       * de `desde` a `hasta` cruzaba por encima de unidades que el camino rodea.
       */
      readonly camino: readonly Plano[];
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
    } & Reloj)
  | ({ readonly tipo: 'cast'; readonly target: string | null; readonly damage: number } & Reloj)
  | { readonly tipo: 'perished'; readonly stack: string; readonly dura: number };

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
   * Hacia dónde mira, en ocho sectores (`direccion.ts`): anda mirando a la
   * casilla siguiente, golpea mirando a su objetivo y se queda mirando a donde
   * miró la última vez. Es estado del animador, no del núcleo.
   */
  readonly mira: Direccion;
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
  | { readonly tipo: 'proyectil'; readonly desde: Plano; readonly hasta: Plano; readonly t: number }
  | { readonly tipo: 'danio'; readonly en: Plano; readonly cifra: number; readonly t: number }
  | { readonly tipo: 'hechizo'; readonly en: Plano; readonly t: number };

/**
 * Dónde va la figura en la fracción `t` de su paso: por los tramos del camino,
 * casilla a casilla y al mismo ritmo en todos (todas las casillas están a la
 * misma distancia de sus vecinas).
 */
/** Qué tramo del camino se anda en la fracción `t`: el mismo reparto que `porElCamino`. */
function tramoEn(camino: readonly Plano[], t: number): number {
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
        dura: DURACION.attack,
        impacto: IMPACTO,
        suelta: null,
      };
    case 'shoot':
      return {
        tipo: 'shoot',
        stack: e.stack,
        target: e.target,
        damage: e.damage,
        ...relojDelDisparo(stackDe(battle, e.stack, 'hace disparar').body),
      };
    case 'cast':
      return {
        tipo: 'cast',
        target: e.target ?? null,
        damage: e.damage ?? 0,
        dura: DURACION.cast,
        impacto: IMPACTO,
        suelta: null,
      };
    case 'perished':
      return { tipo: 'perished', stack: e.stack, dura: DURACION.perished };
    default:
      return null;
  }
}

/**
 * Lo que tarda el animador, a ritmo normal, en contar `nuevos`, hechos del
 * registro de `battle`: la misma cuenta que hace con su cola, para quien tiene
 * que esperar a que acabe de contar —el guion de capturas— sin un reloj propio
 * que se quede atrás. Un tramo son sus casillas (`path`) al paso de quien anda,
 * con la carga si el golpe que lo sigue carga.
 */
export function duracionDeLaJugada(battle: BattleState, nuevos: readonly BattleEvent[]): number {
  let ms = 0;
  for (const [i, e] of nuevos.entries()) {
    if (e.kind === 'move') {
      const s = stackDe(battle, e.stack, 'mueve');
      const siguiente = nuevos[i + 1];
      const carga =
        siguiente?.kind === 'attack' &&
        siguiente.stack === e.stack &&
        siguiente.charge !== undefined &&
        !siguiente.retaliation;
      const alto = ALTO_DE_FIGURA[hexSize(s.unit) > 1 ? 'grande' : 'normal'];
      ms += e.path.length * msPorCasilla(s.body, carga ? 'charge' : 'walk', alto);
    } else {
      const paso = pasoDeAccion(e, battle);
      if (paso !== null) ms += paso.dura;
    }
  }
  return ms;
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
  private actual: { paso: Paso; inicio: number; dura: number } | null = null;
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
      this.caidas.clear();
      this.heridas.clear();
      this.aCentro.clear();
      this.mirada.clear();
      for (const s of battle.stacks) {
        // Cada uno empieza mirando al otro lado del tablero: el defensor, al oeste.
        this.mirada.set(s.id, miradaDeSalida(s));
        const p = planoDeHex(s.hex);
        this.vista.set(s.id, p);
        this.destino.set(s.id, p);
        if (!isAlive(s)) this.caidas.set(s.id, Number.NEGATIVE_INFINITY);
      }
      this.leidos = battle.log.length;
      return;
    }
    for (let i = this.leidos; i < battle.log.length; i++) {
      const e = battle.log[i] as BattleEvent;
      const paso = this.traducir(e, battle);
      if (paso !== null) this.cola.push(paso);
      // El registro dice que hubo carga en el golpe, no en el paso que lo
      // precede: se le marca al paso, que sigue en la cola porque la acción
      // entera —andar y golpear— se lee de una vez.
      if (e.kind === 'attack' && e.charge !== undefined && !e.retaliation) {
        const previo = this.cola.at(-2);
        if (previo?.tipo === 'move' && previo.stack === e.stack) {
          this.cola[this.cola.length - 2] = { ...previo, carga: true };
        }
      }
    }
    this.leidos = battle.log.length;
  }

  private traducir(e: BattleEvent, battle: BattleState): Paso | null {
    switch (e.kind) {
      case 'move': {
        const hasta = planoDeHex(e.to);
        const desde = this.destino.get(e.stack) ?? hasta;
        this.destino.set(e.stack, hasta);
        const camino = [desde, ...e.path.map(planoDeHex)];
        const s = stackDe(battle, e.stack, 'mueve');
        const alto = ALTO_DE_FIGURA[hexSize(s.unit) > 1 ? 'grande' : 'normal'];
        return { tipo: 'move', stack: e.stack, desde, hasta, camino, body: s.body, alto };
      }
      default:
        return pasoDeAccion(e, battle);
    }
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
        if (ahora < fin) return;
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
      };
    }
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
    if (p.tipo === 'move') this.vista.set(p.stack, p.hasta);
    if (p.tipo === 'perished') this.caidas.set(p.stack, inicio);
    // El daño sigue después del paso: se apunta cuándo fue el impacto.
    if (p.tipo === 'attack' || p.tipo === 'shoot' || p.tipo === 'cast') {
      if (p.target !== null && p.damage > 0) this.heridas.set(p.target, inicio + p.impacto * dura);
    }
    // Quien actúa deja de dolerse: su propio paso manda.
    if (p.tipo !== 'cast') this.heridas.delete(p.stack);
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
    let clip: CharacterClip = 'idle';
    let tiempo = this.ahora;
    let golpe = 0;
    let alfaDelAro = 1;
    let mirada = this.mirada.get(s.id) ?? miradaDeSalida(s);
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
        mirada = miradaEnElTramo(paso.camino, tramoEn(paso.camino, t), mirada);
        clip = paso.carga === true ? 'charge' : 'walk';
        tiempo = desdeInicio;
      } else if ((paso.tipo === 'attack' || paso.tipo === 'shoot') && paso.stack === s.id) {
        clip = 'attack';
        mirada = this.miradaAlObjetivo(s.id, paso.target);
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
    return {
      en: this.centro(s, cabeza),
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
    const out: Efecto[] = [];
    if (paso.tipo === 'attack' || paso.tipo === 'shoot') {
      const a = donde(paso.stack);
      const b = donde(paso.target);
      const { impacto, suelta } = paso;
      if (a !== null && b !== null) {
        // Lo que vuela, vuela de la suelta al impacto.
        if (suelta !== null && t >= suelta && t < impacto) {
          out.push({ tipo: 'proyectil', desde: a, hasta: b, t: (t - suelta) / (impacto - suelta) });
        }
        if (t >= impacto && paso.damage > 0) {
          out.push({ tipo: 'danio', en: b, cifra: paso.damage, t: trasImpacto(t, impacto) });
        }
      }
    }
    if (paso.tipo === 'cast' && paso.target !== null) {
      const b = donde(paso.target);
      if (b !== null) {
        out.push({ tipo: 'hechizo', en: b, t });
        if (t >= paso.impacto && paso.damage > 0) {
          out.push({ tipo: 'danio', en: b, cifra: paso.damage, t: trasImpacto(t, paso.impacto) });
        }
      }
    }
    return out;
  }
}
