/**
 * Los botones de los poderes de la unidad activa (Curar, Bendecir), los mismos en
 * la partida y la arena (F6 de la tarea del combate en el juego, 19-10-2026: hasta
 * entonces solo la arena los pintaba, y la partida decía «su tropa no tiene
 * poderes» aunque el monje los trajera). Qué se puede y por qué no lo dice el
 * núcleo (`poderBlocker`, por la lista legal y `motivoDePoder`); aquí solo se
 * pinta. El gesto lo lleva la sesión (`PoderesDeLaActiva.usar`).
 */
import type { Prevision } from '@core/battle/battle.js';
import { esDeCura, type Poder, type PoderId, poder } from '@core/battle/poderes.js';
import { delHeroe, efectoDe } from '@core/battle/spells.js';
import type { BattleAction, BattleStack, BattleState } from '@core/battle/types.js';
import { type Html, html, NADA, unir } from '../html.js';
import type { Apuntado } from '../session.js';
import { nombreEnElCampo } from './distintivo.js';
import { curaOEfecto, textoDePrevision } from './prevision.js';

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
      const suyas = legales.filter((a) => a.type === 'poder' && a.poder === id);
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

/**
 * Lo que hace un poder, en una frase para la ficha y el botón. Que no se suma al
 * hechizo del héroe se dice porque los dos dejan un efecto del mismo origen, que
 * refresca y no se apila (`applyEffect`): se compara, no se da por hecho.
 */
export function queHaceElPoder(p: Poder): string {
  const s = p.hechizo;
  const e = efectoDe(s, p.lanzador);
  const hace = curaOEfecto(esDeCura(p) ? p.lanzador.cantidad : null, e) ?? '';
  if (esDeCura(p)) return `${hace} a un aliado herido, incluida la propia unidad`;
  const elDelHeroe = efectoDe(s, delHeroe(s, { spellPower: 1 }));
  const unoSolo = e !== null && elDelHeroe !== null && elDelHeroe.source === e.source;
  return `${hace} a un aliado${unoSolo ? `; es la ${s.name} del héroe: las dos no se suman` : ''}`;
}
