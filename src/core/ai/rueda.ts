/**
 * La IA en la rueda del golpe (`battle/rueda.ts`): elige a ciegas,
 * con la mezcla de `data/rueda.json` y el `Rng` de la batalla.
 *
 * **No ve lo que eligió el otro**, y no es una cortesía: la elección es
 * simultánea. Por eso `elegirEnLaRueda` no recibe ni la acción ni el estado: lo
 * único que sabe es si golpea o responde. Una IA que «lea» al rival es otra tarea.
 */
import { activeStack, plantarse, stackById } from '../battle/battle.js';
import {
  type PapelEnLaRueda,
  PESOS_DE_LA_RUEDA,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
} from '../battle/rueda.js';
import type { BattleAction, BattleState, Side } from '../battle/types.js';
import { type Rng, sortearPorPesos } from '../rng.js';

/** Un tipo al azar con los pesos de su papel: una tirada de `rng.int`. */
export function elegirEnLaRueda(papel: PapelEnLaRueda, rng: Rng): TipoDeGolpe {
  const pesos = PESOS_DE_LA_RUEDA[papel];
  return sortearPorPesos(rng, TIPOS_DE_GOLPE, (t) => pesos[t]);
}

/**
 * Quién elige cada papel de la rueda: `true` si la IA, a ciegas; si no, se espera
 * (la persona, el agente). Recibe el papel y el bando que lo elige.
 */
export type LaIAElige = (side: Side, papel: PapelEnLaRueda) => boolean;

/**
 * Lo que sale de completar un golpe en la rueda: la acción lista para darse
 * (`falta: null`), o la que espera la elección de otro (`falta`, su papel), con
 * lo de la IA ya elegido.
 */
export type CruceCompletado =
  | { readonly falta: null; readonly accion: BattleAction }
  | { readonly falta: PapelEnLaRueda; readonly accion: AtaqueEnLaRueda };

type AtaqueEnLaRueda = Extract<BattleAction, { type: 'attack' }>;

/**
 * La acción con lo que le falte de la rueda elegido por la IA, en su orden: el
 * golpe y luego la respuesta, cada uno sin ver el otro. Elige solo los papeles
 * que lleva (`laIAElige`; sin decirlo, todos): el primero que no es suyo se queda
 * en `falta`, y lo que viene detrás no se sortea aún, para que el `Rng` gaste lo
 * mismo en el mismo orden. Si no es un golpe, la misma acción y sin tocar el `Rng`.
 *
 * El único sitio donde la IA completa un cruce: lo leen `autoResolve` y
 * `pasoDelCruce`, el paso de quien espera a alguien (las dos sesiones y el
 * director del agente).
 */
export function completarCruce(
  state: BattleState,
  accion: BattleAction,
  rng: Rng,
  laIAElige: LaIAElige = () => true,
): CruceCompletado {
  if (accion.type !== 'attack') return { falta: null, accion };
  const bando = bandosDeLaRueda(state, accion);
  let completa = accion;
  for (const papel of ['golpe', 'respuesta'] as const) {
    if (completa[papel] !== undefined) continue;
    if (!laIAElige(bando[papel], papel)) return { falta: papel, accion: completa };
    completa = { ...completa, [papel]: elegirEnLaRueda(papel, rng) };
  }
  return { falta: null, accion: completa };
}

/** Quién elige cada papel: el golpe, el bando del que pega; la respuesta, el del objetivo. */
function bandosDeLaRueda(
  state: BattleState,
  accion: AtaqueEnLaRueda,
): Readonly<Record<PapelEnLaRueda, Side>> {
  const atacante = activeStack(state);
  if (atacante === null) throw new Error('un golpe en la rueda sin nadie a quien le toque');
  return { golpe: atacante.side, respuesta: stackById(state, accion.target).side };
}

/**
 * Un paso del cruce: la acción lista (`lista`), o quien pega ya plantado ante su
 * objetivo (`plantarse`, si no lo estaba) y lo que falta —el papel y el bando que
 * lo elige—, con lo que lleva la IA ya elegido (`completarCruce`). `accion` es el
 * golpe que espera, sin `from`: ya anduvo. **El paso de los dos que esperan a
 * alguien**, la sesión de la persona (`CruceDeLaRueda`) y el director del agente
 * (`Director.conLaRueda`): cada uno, con lo que falta, pregunta a quien le toca y
 * vuelve con lo elegido.
 */
export function pasoDelCruce(
  state: BattleState,
  accion: BattleAction,
  rng: Rng,
  laIAElige: LaIAElige,
):
  | { readonly lista: BattleAction }
  | {
      readonly falta: PapelEnLaRueda;
      readonly bando: Side;
      readonly accion: AtaqueEnLaRueda;
    } {
  const c = completarCruce(state, accion, rng, laIAElige);
  if (c.falta === null) return { lista: c.accion };
  const bando = bandosDeLaRueda(state, c.accion)[c.falta];
  const { from, ...espera } = c.accion;
  // La segunda fase (una respuesta tras un golpe elegido) ya está plantada.
  if (state.golpeEnCurso === null) {
    plantarse(state, from === undefined ? espera : { ...espera, from }, rng);
  }
  return { falta: c.falta, bando, accion: espera };
}
