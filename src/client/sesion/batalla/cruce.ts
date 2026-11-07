/**
 * El golpe que espera la rueda y lo que se hace con él (`CruceDeLaRueda`), para la
 * partida y la arena: lo de la IA lo sortea el núcleo a ciegas y lo de la persona
 * espera aquí (`RuedaPendiente`). Con el director del servidor, es lo único que
 * conduce el paso del cruce, y lo único del cliente que suelta el golpe plantado (lo
 * vigila `invariantes-batalla.test.ts`). Era parte de `sesion/partida.ts` hasta la
 * fase C de la reorganización (07-11-2026).
 */
import { type LaIAElige, pasoDelCruce } from '@core/ai/rueda.js';
import { applyAction, soltarElGolpe } from '@core/battle/battle.js';
import type { PapelEnLaRueda } from '@core/battle/cifras-de-la-rueda.js';
import { activeStack, stackById } from '@core/battle/consultas.js';
import { formaDeLaBatalla, tipoDeGolpeBlocker } from '@core/battle/formas-de-la-rueda.js';
import { previsionDeLaRueda, previsionDelGolpeQueViene } from '@core/battle/prevision.js';
import type { BattleAction, BattleStack, BattleState, Side } from '@core/battle/types.js';
import type { Rng } from '@core/rng.js';
import type { TipoDeGolpe } from '@core/types.js';
import { mensajeDe } from '../../comun/errores.js';
import type { LoApuntado } from './apuntado.js';
import { comoFrase, NINGUNA_TUYA, type TurnoPropio } from './control.js';

/** Lo que la rueda enseña a quien elige (`CruceDeLaRueda.pendiente`). */
export interface RuedaPendiente {
  readonly fase: PapelEnLaRueda;
  readonly atacante: BattleStack;
  readonly objetivo: BattleStack;
  /** El bando que elige ahora. */
  readonly bando: Side;
  readonly prevision: ReturnType<typeof previsionDeLaRueda>;
  /**
   * Al responder, lo que te haría el golpe que viene con cada respuesta
   * (`previsionDelGolpeQueViene`); al golpear, `null`: quien pega ya ve su golpe en
   * `prevision.porTipo`.
   */
  readonly golpeQueViene: ReturnType<typeof previsionDelGolpeQueViene> | null;
}

/** Lo que dice la barra a quien quiere hacer otra cosa con la rueda abierta. */
export const ELIGE_EN_LA_RUEDA = 'elige antes en la rueda del golpe';

/**
 * Por qué no se juega nada más con la rueda abierta, como frase, o `null` si no
 * espera nada. La misma de la barra (`ELIGE_EN_LA_RUEDA`): con ella el panel apaga
 * sus botones, que con el diálogo modal encima no recibían el clic y se veían
 * encendidos (H3 de QA, 19-10-2026).
 */
export function motivoDeLaRueda(pendiente: RuedaPendiente | null): string | null {
  return pendiente === null ? null : comoFrase(ELIGE_EN_LA_RUEDA);
}

/**
 * El golpe que espera la rueda (`battle/rueda.ts`) y lo que se hace con él, para
 * las dos sesiones: la de la partida y la de la arena eligen igual (F5 de la tarea
 * del combate en el juego, 19-10-2026; antes vivía solo en la arena). Cada una
 * dice quién lleva cada bando (`laLlevaLaIA`): lo de la IA lo sortea
 * `completarCruce` a ciegas, y lo de la persona espera aquí.
 *
 * Sin carga, primero se anda y luego se elige (decisión del usuario, 13-10-2026);
 * con carga, primero se elige y luego se corre (31-10-2026). Un golpe al que le
 * falta lo de una persona planta a quien pega (el `attack` sin elecciones,
 * `BattleState.golpeEnCurso`: ante su objetivo, o en su salida si carga) y abre la
 * fase; la vista abre el diálogo cuando el animador acaba lo que hubiera que
 * contar. La carrera de la carga, el núcleo la escribe tras el cruce. En la fase `golpe` elige
 * quien pega, y la acción va sin golpe; en `respuesta`, quien recibe, y la acción
 * lleva ya el golpe elegido, que **no sale de aquí**: `pendiente` enseña la fase,
 * no la elección del otro.
 *
 * Solo hay un golpe a la vez y es de la batalla en la que se plantó: quien lo
 * lleva no deja jugar otra cosa mientras espera (`ELIGE_EN_LA_RUEDA`).
 */
export class CruceDeLaRueda {
  private cruce: {
    readonly accion: BattleAction & { type: 'attack' };
    readonly pendiente: RuedaPendiente;
  } | null = null;

  constructor(
    private readonly conductor: ConductorDelCruce,
    private readonly rng: Rng,
    private readonly laLlevaLaIA: LaIAElige,
  ) {}

  /**
   * La jugada de la persona (`playBattleAction` de las dos sesiones): con la rueda
   * abierta o sin turno propio no se acepta, y la barra dice por qué. Un golpe
   * cuerpo a cuerpo sin elegir anda (si carga, no: corre tras elegir) y abre la
   * fase del golpe (`completar`):
   * plantarse hace las comprobaciones del golpe antes de andar, así que uno que no
   * se puede dar no mueve a nadie ni abre la rueda. Lo demás, se aplica.
   */
  jugar(battle: BattleState, accion: BattleAction): void {
    const { sesion } = this.conductor;
    if (this.cruce !== null) {
      sesion.status = comoFrase(ELIGE_EN_LA_RUEDA);
      return;
    }
    if (sesion.turnoPropio === null) {
      sesion.status = NINGUNA_TUYA;
      return;
    }
    let lista: BattleAction | null;
    try {
      lista = this.completar(battle, accion);
    } catch (err) {
      sesion.status = mensajeDe(err);
      return;
    }
    // Plantado, la rueda espera: el tablero cuenta la marcha y luego se abre.
    this.conductor.alMoverse();
    if (lista === null) sesion.status = '';
    else this.aplicar(battle, lista);
  }

  /** Lo que elige quien le toca en la rueda (`elegir`), y la jugada si ya está lista. */
  elegirYJugar(battle: BattleState, tipo: string): void {
    let lista: BattleAction | null;
    try {
      lista = this.elegir(battle, tipo);
    } catch (err) {
      this.conductor.sesion.status = mensajeDe(err);
      return;
    }
    this.conductor.alMoverse();
    if (lista !== null) this.aplicar(battle, lista);
  }

  /** Escape en la rueda (`cancelar`), y la IA sigue si le toca. Devuelve si se canceló. */
  cancelarGolpe(battle: BattleState): boolean {
    const { sesion } = this.conductor;
    try {
      sesion.status = this.cancelar(battle);
    } catch (err) {
      sesion.status = mensajeDe(err);
      return false;
    }
    this.conductor.alMoverse();
    this.conductor.seguirLaIA();
    return true;
  }

  /**
   * Aplica una jugada lista y deja a la IA mover lo suyo. Una jugada aplicada deja
   * lo apuntado sin sentido —el hechizo ya se lanzó, o la unidad activa es otra—:
   * se suelta aquí y no en cada llamante.
   */
  private aplicar(battle: BattleState, accion: BattleAction): void {
    const { sesion } = this.conductor;
    try {
      applyAction(battle, accion, this.rng);
      this.conductor.alMoverse();
      sesion.status = '';
    } catch (err) {
      sesion.status = mensajeDe(err);
      return;
    }
    sesion.apuntados.soltar();
    this.conductor.seguirLaIA();
  }

  /**
   * Lo que la rueda enseña ahora, o `null` si no espera a nadie. Se calcula una
   * vez, al abrir la fase (con la rueda abierta la batalla no se mueve), y es el
   * mismo objeto mientras dura: quien pinta repinta al cambiar.
   */
  get pendiente(): RuedaPendiente | null {
    return this.cruce?.pendiente ?? null;
  }

  /**
   * Un paso del cruce (`pasoDelCruce`, el mismo del director): la acción con lo de
   * la rueda que le toque a la IA y lista para darse; o, si falta lo de una
   * persona, `null`: quien pega se ha plantado ante su objetivo y la rueda queda
   * abierta en su fase. Lo que no es un golpe, la misma acción. Lanza con la frase
   * del núcleo si plantarse no vale: uno que no se puede dar no mueve a nadie.
   */
  completar(battle: BattleState, accion: BattleAction): BattleAction | null {
    const paso = pasoDelCruce(battle, accion, this.rng, this.laLlevaLaIA);
    if ('lista' in paso) return paso.lista;
    const atacante = activeStack(battle);
    if (atacante === null) throw new Error('la rueda espera un golpe y no le toca a nadie');
    this.cruce = {
      accion: paso.accion,
      pendiente: {
        fase: paso.falta,
        atacante,
        objetivo: stackById(battle, paso.accion.target),
        bando: paso.bando,
        prevision: previsionDeLaRueda(battle, paso.accion, paso.falta),
        golpeQueViene:
          paso.falta === 'respuesta' ? previsionDelGolpeQueViene(battle, paso.accion) : null,
      },
    };
    return null;
  }

  /**
   * Lo que elige quien le toca: en la fase `golpe`, quien pega; si el objetivo es
   * de la IA, ella responde a ciegas y sale la acción lista, y si es de una
   * persona, la rueda pasa a la `respuesta` sin enseñar el golpe (`null`). En la
   * `respuesta`, la acción lista. `tipo` llega del marcado: uno que no es un tipo,
   * o una rueda que no espera nada, lanza con la frase para la barra.
   */
  elegir(battle: BattleState, tipo: string): BattleAction | null {
    const c = this.cruce;
    if (c === null) throw new Error('La rueda no espera ninguna elección.');
    // Solo los de la rueda de la batalla: un sector de otra lanza con su motivo.
    const motivo = tipoDeGolpeBlocker(tipo, formaDeLaBatalla(battle));
    if (motivo !== null) throw new Error(`${motivo}.`);
    // Sin motivo, `tipo` es un golpe de esta rueda.
    const elegido: Partial<Record<PapelEnLaRueda, TipoDeGolpe>> = {
      [c.pendiente.fase]: tipo as TipoDeGolpe,
    };
    this.cruce = null;
    return this.completar(battle, { ...c.accion, ...elegido });
  }

  /**
   * Escape en la rueda: deja el golpe sin dar, solo antes de elegirlo. Sin carga,
   * quien pega ya anduvo: se queda donde llegó y sigue su turno; con carga no
   * corrió, y sigue en su salida sin nada gastado (`soltarElGolpe`). Si no le
   * queda nada, el turno se cierra y juega quien siga (eso lo hace la sesión). La
   * respuesta no se cancela: el golpe ya viene, y lanza diciéndolo. Devuelve la
   * frase de la barra.
   */
  cancelar(battle: BattleState): string {
    if (this.cruce?.pendiente.fase !== 'golpe') {
      throw new Error(
        this.cruce === null
          ? 'La rueda no espera ninguna elección.'
          : 'El golpe ya viene: elige la respuesta en la rueda.',
      );
    }
    this.cruce = null;
    soltarElGolpe(battle, this.rng);
    return 'Golpe cancelado.';
  }
}

/**
 * Lo que el cruce pide de la sesión que lo conduce (la de la partida y la de la
 * arena): su barra, su turno y lo apuntado; qué hace cuando la batalla se mueve
 * (la partida sube su versión; la arena la deriva de la batalla) y cómo sigue la
 * IA hasta la siguiente jugada de la persona.
 */
interface ConductorDelCruce {
  readonly sesion: {
    status: string;
    readonly turnoPropio: TurnoPropio | null;
    readonly apuntados: LoApuntado;
  };
  readonly alMoverse: () => void;
  readonly seguirLaIA: () => void;
}
