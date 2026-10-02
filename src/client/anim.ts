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
import { type Direccion, direccionHacia, tieneLado } from './direccion.js';
import type { CharacterClip } from './render/character.js';
import { centroDeStack, type Plano, planoDeHex } from './render/proyeccion.js';

/** Lo que dura en pantalla cada paso de la cola, en milisegundos. */
export const DURACION = {
  move: 520,
  attack: 560,
  shoot: 620,
  cast: 520,
  perished: 520,
} as const;

/** En qué fracción del golpe se nota el impacto: el retroceso y la cifra. */
const IMPACTO = 0.55;

/** Cuánto lleva lo que pasa DESPUÉS del impacto, de 0 a 1: el temblor y la cifra. */
function trasImpacto(t: number): number {
  return (t - IMPACTO) / (1 - IMPACTO);
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
    }
  | {
      readonly tipo: 'attack' | 'shoot';
      readonly stack: string;
      readonly target: string;
      readonly damage: number;
    }
  | { readonly tipo: 'cast'; readonly target: string | null; readonly damage: number }
  | { readonly tipo: 'perished'; readonly stack: string };

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
  readonly alfa: number;
  /**
   * Hacia dónde mira, en ocho sectores (`direccion.ts`): anda mirando a la
   * casilla siguiente, golpea mirando a su objetivo y se queda mirando a donde
   * miró la última vez. Es estado del animador, no del núcleo.
   */
  readonly mira: Direccion;
  /**
   * La última dirección con lado (este u oeste) que tuvo: lo que necesita un
   * arte que no tiene norte ni sur para no girarse solo al mirar en vertical.
   */
  readonly lado: Direccion;
}

/** Hacia dónde mira una figura y hacia qué lado miraba por última vez. */
interface Mirada {
  readonly mira: Direccion;
  readonly lado: Direccion;
}

/** La mirada tras girarse hacia `d`: si `d` no tiene lado, el lado se queda. */
function girar(antes: Mirada, d: Direccion): Mirada {
  return { mira: d, lado: tieneLado(d) ? d : antes.lado };
}

/**
 * La mirada al andar el tramo `i` del camino: la de cada tramo hasta ese,
 * girándose en cada uno.
 */
function miradaEnElTramo(camino: readonly Plano[], i: number, antes: Mirada): Mirada {
  let m = antes;
  for (let k = 0; k <= i && k + 1 < camino.length; k++) {
    m = girar(m, direccionHacia(camino[k] as Plano, camino[k + 1] as Plano, m.mira));
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

/** Cada bando sale mirando al otro: el atacante al este, el defensor al oeste. */
function miradaDeSalida(s: BattleStack): Mirada {
  const d: Direccion = s.side === 'defender' ? 'O' : 'E';
  return { mira: d, lado: d };
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
  /** Las que ya cayeron en pantalla. */
  private readonly caidas = new Set<string>();
  /** Hacia dónde miró cada una la última vez. */
  private readonly mirada = new Map<string, Mirada>();
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
      this.aCentro.clear();
      this.mirada.clear();
      for (const s of battle.stacks) {
        // Cada uno empieza mirando al otro lado del tablero: el defensor, al oeste.
        this.mirada.set(s.id, miradaDeSalida(s));
        const p = planoDeHex(s.hex);
        this.vista.set(s.id, p);
        this.destino.set(s.id, p);
        if (!isAlive(s)) this.caidas.add(s.id);
      }
      this.leidos = battle.log.length;
      return;
    }
    for (let i = this.leidos; i < battle.log.length; i++) {
      const e = battle.log[i] as BattleEvent;
      const paso = this.traducir(e);
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

  private traducir(e: BattleEvent): Paso | null {
    switch (e.kind) {
      case 'move': {
        const hasta = planoDeHex(e.to);
        const desde = this.destino.get(e.stack) ?? hasta;
        this.destino.set(e.stack, hasta);
        const camino = [desde, ...e.path.map(planoDeHex)];
        return { tipo: 'move', stack: e.stack, desde, hasta, camino };
      }
      case 'attack':
      case 'shoot':
        return { tipo: e.kind, stack: e.stack, target: e.target, damage: e.damage };
      case 'cast':
        return { tipo: 'cast', target: e.target ?? null, damage: e.damage ?? 0 };
      case 'perished':
        return { tipo: 'perished', stack: e.stack };
      default:
        return null;
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
        this.terminar(this.actual.paso);
        this.actual = null;
        libreDesde = fin;
      }
      const siguiente = this.cola.shift();
      if (siguiente === undefined) return;
      this.actual = {
        paso: siguiente,
        inicio: libreDesde,
        dura: DURACION[siguiente.tipo] / this.ritmo,
      };
    }
  }

  private terminar(p: Paso): void {
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
    if (p.tipo === 'perished') this.caidas.add(p.stack);
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

  private miradaDe(id: string): Mirada {
    return this.mirada.get(id) ?? { mira: 'E', lado: 'E' };
  }

  /** Mirando a la casilla del objetivo, desde donde se ve cada uno ahora. */
  private miradaAlObjetivo(id: string, objetivo: string): Mirada {
    const antes = this.miradaDe(id);
    const yo = this.vista.get(id);
    const el = this.vista.get(objetivo);
    if (yo === undefined || el === undefined) return antes;
    return girar(antes, direccionHacia(yo, el, antes.mira));
  }

  figura(s: BattleStack): EstadoFigura {
    const paso = this.actual?.paso;
    const t = this.progreso();
    const desdeInicio = this.ahora - (this.actual?.inicio ?? 0);
    let cabeza = this.vista.get(s.id) ?? planoDeHex(s.hex);
    let clip: CharacterClip = 'idle';
    let tiempo = this.ahora;
    let golpe = 0;
    let alfa = 1;
    let mirada = this.mirada.get(s.id) ?? miradaDeSalida(s);

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
        t >= IMPACTO
      ) {
        golpe = trasImpacto(t);
      } else if (paso.tipo === 'perished' && paso.stack === s.id) {
        alfa = 1 - t;
      }
    }

    // Una unidad muerta en el estado sigue en pie hasta que su caída se ve.
    const visible = isAlive(s) || !this.caidas.has(s.id);
    return { en: this.centro(s, cabeza), clip, tiempo, golpe, visible, alfa, ...mirada };
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
      if (a !== null && b !== null) {
        if (paso.tipo === 'shoot' && t < IMPACTO) {
          out.push({ tipo: 'proyectil', desde: a, hasta: b, t: t / IMPACTO });
        }
        if (t >= IMPACTO && paso.damage > 0) {
          out.push({ tipo: 'danio', en: b, cifra: paso.damage, t: trasImpacto(t) });
        }
      }
    }
    if (paso.tipo === 'cast' && paso.target !== null) {
      const b = donde(paso.target);
      if (b !== null) {
        out.push({ tipo: 'hechizo', en: b, t });
        if (t >= IMPACTO && paso.damage > 0) {
          out.push({ tipo: 'danio', en: b, cifra: paso.damage, t: trasImpacto(t) });
        }
      }
    }
    return out;
  }
}
