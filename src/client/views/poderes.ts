/**
 * Los botones de los poderes de la unidad activa (Curar, Bendecir), los mismos en
 * la partida y la arena (F6 de la tarea del combate en el juego, 19-10-2026: hasta
 * entonces solo la arena los pintaba, y la partida decía «su tropa no tiene
 * poderes» aunque el monje los trajera). Qué se puede y por qué no lo dice el
 * núcleo (`poderBlocker`, por la lista legal y `motivoDePoder`); aquí solo se
 * pinta. El gesto lo lleva la sesión (`PoderesDeLaActiva.usar`).
 */
import type { Prevision } from '@core/battle/battle.js';
import { type PoderId, poder, queHaceElPoder } from '@core/battle/poderes.js';
import type { BattleAction, BattleStack, BattleState } from '@core/battle/types.js';
import { isShooter } from '@core/data.js';
import { type Html, html, NADA, unir } from '../html.js';
import type { Apuntado } from '../session.js';
import { nombreEnElCampo } from './distintivo.js';
import { textoDePrevision } from './prevision.js';

/** Lo que piden los botones de los poderes a la sesión: la de la partida y la de la arena. */
export interface ControlDePoderes {
  readonly battle: BattleState | null;
  readonly apuntado: Apuntado | null;
  battleLegalActions(): readonly BattleAction[];
  /** Por qué la activa no puede usar el poder ahora, con la frase del núcleo; `null` si puede. */
  motivoDePoder(id: PoderId): string | null;
  prevision(action: BattleAction): Prevision | null;
}

/**
 * El botón de algo que, con más de una jugada posible, se elige con un clic en el
 * tablero —escala, puerta, poder—: habilitado si se puede, y marcado mientras
 * espera ese clic (`esperando`); si no, deshabilitado con el motivo del núcleo en
 * el `title`. `ayuda`, el `title` cuando se puede. `dato`, el atributo que dice
 * cuál (`data-escala="subir"`), que lee quien atiende el clic.
 */
export function botonDeElegir(o: {
  readonly accion: string;
  readonly dato: Html;
  readonly clase: string;
  readonly rotulo: string;
  readonly motivo: string | null;
  readonly esperando: boolean;
  readonly ayuda?: string;
}): Html {
  const clase = o.motivo === null && o.esperando ? `${o.clase} primary` : o.clase;
  const estado =
    o.motivo !== null
      ? html`disabled title="${o.motivo}"`
      : o.ayuda === undefined
        ? NADA
        : html`title="${o.ayuda}"`;
  return html`<button data-action="${o.accion}" ${o.dato} class="${clase}" ${estado}>${o.rotulo}</button>`;
}

/**
 * Un botón por poder de la unidad activa —tuya—: habilitado si hay algún aliado
 * sobre el que usarlo, y si no con el motivo del núcleo en el `title`. Con un
 * solo aliado posible se usa ya; con varios, el clic en el tablero elige (el
 * botón queda marcado mientras espera). Sin poderes, nada.
 */
export function botonesDePoder(s: ControlDePoderes, activa: BattleStack): Html {
  const ids = activa.unit.poderes ?? [];
  if (ids.length === 0) return NADA;
  const apuntado = s.apuntado;
  const legales = s.battleLegalActions();
  return unir(
    ids.map((id) => {
      const p = poder(id);
      // Se puede si la lista legal lo trae; el motivo, al núcleo solo si no.
      const suyas = legales.filter((a) => a.type === 'power' && a.poder === id);
      return html`
         ${botonDeElegir({
           accion: 'battle-poder',
           dato: html`data-poder="${id}"`,
           clase: 'poder',
           rotulo: p.nombre,
           motivo: suyas.length > 0 ? null : s.motivoDePoder(id),
           esperando: apuntado?.kind === 'poder' && apuntado.id === id,
           ayuda: suyas.length === 1 ? previsionDelUnico(s, suyas[0]) : queHaceElPoder(p),
         })}`;
    }),
  );
}

/**
 * Con un solo aliado posible el clic en el botón ya juega, sin pasar por el
 * tablero ni por su previsión: la ayuda del botón es esa previsión, con a quién y
 * cuánto de verdad («Curar a Guerrero con escudo: cura 2 PV.», con el tope de la
 * herida; M1 de QA: decía «cura 4 PV» aunque la herida fuera menor). Lanza si la
 * sesión no la da: el botón solo sale en un turno propio, y una jugada de la
 * lista legal siempre tiene previsión.
 */
function previsionDelUnico(s: ControlDePoderes, accion: BattleAction | undefined): string {
  if (accion === undefined) throw new Error('el poder no tiene jugada que prever');
  const p = s.prevision(accion);
  const b = s.battle;
  if (p === null || b === null) {
    throw new Error('la jugada del poder no tiene previsión: no es un turno propio');
  }
  return textoDePrevision(p, (id) => {
    const x = b.stacks.find((st) => st.id === id);
    return x === undefined ? id : nombreEnElCampo(b, x);
  });
}

/** Lo que pide el botón «Apuntar» a la sesión: el disparo de la activa (`DisparoDeLaActiva`). */
export interface ControlDeDisparo {
  readonly disparo: { readonly esperando: boolean; motivo(): string | null };
}

/**
 * El botón «Apuntar» del tirador activo —tuyo— (el disparo diferido, 25-10-2026):
 * deja el siguiente clic eligiendo la casilla, la que sea, y marcado mientras
 * espera; apagado con el motivo del núcleo si no puede (se ha movido, tiene a
 * alguien encima). Quien no dispara no lo lleva. Un clic en un enemigo apunta a su
 * casilla sin pasar por aquí.
 */
export function botonDeApuntar(s: ControlDeDisparo, activa: BattleStack): Html {
  if (!isShooter(activa.unit)) return NADA;
  return botonDeElegir({
    accion: 'battle-apuntar',
    dato: html`data-tirador="${activa.id}"`,
    clase: 'apuntar',
    rotulo: 'Apuntar',
    motivo: s.disparo.motivo(),
    esperando: s.disparo.esperando,
    ayuda:
      'Apunta a una casilla y cierra el turno: el disparo sale al empezar su siguiente turno, en línea recta, y da al primero que encuentre, también a uno tuyo. Cuanto más cerca de la casilla, más daño.',
  });
}
