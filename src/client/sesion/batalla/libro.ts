/**
 * El libro de hechizos del héroe en la batalla (`LibroDeBatalla`): el hechizo
 * elegido, sobre quién cae y por qué no; y la jugada de lo apuntado a una casilla
 * (`loApuntadoEnCasilla`). Uno para la partida y la arena. Era parte de
 * `sesion/partida.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import { hechizoDeLaBatalla } from '@core/battle/consultas.js';
import { castBlocker, poderBlocker } from '@core/battle/lanzar.js';
import { queSeApunta } from '@core/battle/spells.js';
import type { BattleAction } from '@core/battle/types.js';
import { nombreDeHechizo } from '@core/magia/catalogo.js';
import type { Hex } from '@core/types.js';
import type { LoApuntado } from './apuntado.js';
import {
  type Apuntado,
  type ControlDeBatalla,
  comoFrase,
  type HechizosDeBatalla,
  NINGUNA_TUYA,
  type SpellOption,
  type TurnoPropio,
} from './control.js';

/** Lo que el libro necesita de la sesión que lo lleva. */
interface DueñoDelLibro {
  readonly turnoPropio: TurnoPropio | null;
  /** Las opciones de ahora, de la caché de la sesión (`opcionesDeHechizo`). */
  spellOptions(): readonly SpellOption[];
  status: string;
  battleLegalActions(): readonly BattleAction[];
  playBattleAction(action: BattleAction): void;
}

/**
 * La jugada de lo apuntado (un hechizo o un poder que se lanza a una casilla) en la
 * casilla `at`, o por qué no vale ahí con la frase del núcleo (`castBlocker`,
 * `poderBlocker`); `null` si lo apuntado no se lanza a una casilla (va a una
 * unidad). Lo leen el clic y la previsión del tablero (06-11-2026, el editor de magia).
 */
export function loApuntadoEnCasilla(
  s: Pick<ControlDeBatalla, 'batallaALaVista' | 'turnoPropio'>,
  apunta: Apuntado,
  at: Hex,
): { readonly accion: BattleAction } | { readonly motivo: string } | null {
  const b = s.batallaALaVista;
  if (b === null) return null;
  const h = hechizoDeLaBatalla(b, apunta.id);
  if (queSeApunta(h) !== 'casilla') return null;
  const turno = s.turnoPropio;
  if (turno === null) return { motivo: NINGUNA_TUYA };
  const motivo =
    apunta.kind === 'hechizo'
      ? castBlocker(b, turno.side, apunta.id, undefined, at)
      : poderBlocker(b, apunta.id, undefined, at);
  if (motivo !== null) return { motivo: comoFrase(motivo) };
  return {
    accion:
      apunta.kind === 'hechizo'
        ? { type: 'cast', spell: apunta.id, at }
        : { type: 'power', poder: apunta.id, at },
  };
}

/**
 * El hechizo elegido y lo que se hace con él: elegirlo, soltarlo, sobre quién
 * cae y por qué no. Uno para la partida y la arena, que antes solo tenía la
 * partida; cada sesión le da su turno, sus opciones y su barra.
 */
export class LibroDeBatalla implements HechizosDeBatalla {
  constructor(
    private readonly dueño: DueñoDelLibro,
    private readonly apuntados: LoApuntado,
  ) {}

  /** El hechizo elegido: lo apuntado, si es un hechizo (`LoApuntado`). */
  get selectedSpell(): string | null {
    return this.apuntados.de('hechizo');
  }
  set selectedSpell(v: string | null) {
    if (v === null) this.apuntados.soltar('hechizo');
    else this.apuntados.apuntar({ kind: 'hechizo', id: v });
  }

  /** Ids de los stacks sobre los que se puede lanzar el hechizo elegido. */
  castTargets(): readonly string[] {
    const elegido = this.selectedSpell;
    if (elegido === null) return [];
    return this.dueño.spellOptions().find((o) => o.id === elegido)?.targets ?? [];
  }

  /**
   * Por qué el hechizo elegido no se puede lanzar sobre ese stack.
   *
   * Apuntar mal es una regla del juego —a un aliado, a un muerto—,
   * así que la frase la escribe el núcleo y la pantalla solo la enseña. Si el
   * par no está entre las acciones legales, el bloqueador TIENE motivo: son las
   * dos caras de la misma función.
   */
  castRejection(targetId: string): string {
    const turno = this.dueño.turnoPropio;
    const elegido = this.selectedSpell;
    if (turno === null || elegido === null) return '';
    const motivo = castBlocker(turno.battle, turno.side, elegido, targetId);
    if (motivo === null) {
      throw new Error(
        `${nombreDeHechizo(elegido, turno.battle.libro)} no se ofrece sobre ${targetId} y el núcleo no dice por qué`,
      );
    }
    return motivo;
  }

  /** Elige hechizo, o lo suelta si ya estaba elegido. */
  selectSpell(spellId: string): void {
    if (this.selectedSpell === spellId) {
      this.clearSpell();
      return;
    }
    const opcion = this.dueño.spellOptions().find((o) => o.id === spellId);
    if (opcion === undefined) return;
    if (!opcion.castable) {
      this.dueño.status = `No puedes lanzar ${opcion.name}: ${opcion.motivo}.`;
      return;
    }
    // Sobre sí o al tablero no se elige nada: se lanza ya (el editor de magia).
    const suyas = this.dueño
      .battleLegalActions()
      .filter((a) => a.type === 'cast' && a.spell === spellId);
    const [sinApuntar] = suyas;
    if (
      suyas.length === 1 &&
      sinApuntar?.type === 'cast' &&
      sinApuntar.target === undefined &&
      sinApuntar.at === undefined
    ) {
      this.dueño.playBattleAction(sinApuntar);
      return;
    }
    this.selectedSpell = spellId;
    const aCasilla = suyas.some((a) => a.type === 'cast' && a.at !== undefined);
    this.dueño.status = aCasilla
      ? `${opcion.name}: pulsa la casilla donde lanzarlo, o Escape para cancelar.`
      : `${opcion.name}: elige sobre quién lanzarlo.`;
  }

  clearSpell(): void {
    if (this.selectedSpell === null) return;
    this.selectedSpell = null;
    this.dueño.status = '';
  }
}
