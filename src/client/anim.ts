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
  | { readonly tipo: 'move'; readonly stack: string; readonly desde: Plano; readonly hasta: Plano }
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
}

/** Un efecto suelto encima del tablero: un proyectil o una cifra de daño. */
export type Efecto =
  | { readonly tipo: 'proyectil'; readonly desde: Plano; readonly hasta: Plano; readonly t: number }
  | { readonly tipo: 'danio'; readonly en: Plano; readonly cifra: number; readonly t: number }
  | { readonly tipo: 'hechizo'; readonly en: Plano; readonly t: number };

export class BattleAnimator {
  /** Qué batalla se está contando: la da quien observa (ver `observe`). */
  private identidad: unknown = null;
  private leidos = 0;
  private readonly cola: Paso[] = [];
  private actual: { paso: Paso; inicio: number } | null = null;
  /** Dónde se VE cada unidad, en el plano, con el hex de cabeza. */
  private readonly vista = new Map<string, Plano>();
  /** Dónde estará cuando la cola acabe: el `desde` del siguiente movimiento. */
  private readonly destino = new Map<string, Plano>();
  /** Las que ya cayeron en pantalla. */
  private readonly caidas = new Set<string>();
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
      for (const s of battle.stacks) {
        const p = planoDeHex(s.hex);
        this.vista.set(s.id, p);
        this.destino.set(s.id, p);
        if (!isAlive(s)) this.caidas.add(s.id);
      }
      this.leidos = battle.log.length;
      return;
    }
    for (let i = this.leidos; i < battle.log.length; i++) {
      const paso = this.traducir(battle.log[i] as BattleEvent);
      if (paso !== null) this.cola.push(paso);
    }
    this.leidos = battle.log.length;
  }

  private traducir(e: BattleEvent): Paso | null {
    switch (e.kind) {
      case 'move': {
        const hasta = planoDeHex(e.to);
        const desde = this.destino.get(e.stack) ?? hasta;
        this.destino.set(e.stack, hasta);
        return { tipo: 'move', stack: e.stack, desde, hasta };
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
        const fin = this.actual.inicio + DURACION[this.actual.paso.tipo];
        if (ahora < fin) return;
        this.terminar(this.actual.paso);
        this.actual = null;
        libreDesde = fin;
      }
      const siguiente = this.cola.shift();
      if (siguiente === undefined) return;
      this.actual = { paso: siguiente, inicio: libreDesde };
    }
  }

  private terminar(p: Paso): void {
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
    return Math.min(1, (this.ahora - this.actual.inicio) / DURACION[this.actual.paso.tipo]);
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

  figura(s: BattleStack): EstadoFigura {
    const paso = this.actual?.paso;
    const t = this.progreso();
    const desdeInicio = this.ahora - (this.actual?.inicio ?? 0);
    let cabeza = this.vista.get(s.id) ?? planoDeHex(s.hex);
    let clip: CharacterClip = 'idle';
    let tiempo = this.ahora;
    let golpe = 0;
    let alfa = 1;

    if (paso !== undefined) {
      if (paso.tipo === 'move' && paso.stack === s.id) {
        cabeza = {
          x: paso.desde.x + (paso.hasta.x - paso.desde.x) * t,
          y: paso.desde.y + (paso.hasta.y - paso.desde.y) * t,
        };
        clip = 'walk';
        tiempo = desdeInicio;
      } else if ((paso.tipo === 'attack' || paso.tipo === 'shoot') && paso.stack === s.id) {
        clip = 'attack';
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
    return { en: this.centro(s, cabeza), clip, tiempo, golpe, visible, alfa };
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
