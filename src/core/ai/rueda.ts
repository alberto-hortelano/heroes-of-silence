/**
 * La IA en la rueda del golpe (`battle/rueda.ts`): elige a ciegas,
 * con la mezcla de `data/rueda.json` y el `Rng` de la batalla.
 *
 * **No ve lo que eligió el otro**, y no es una cortesía: la elección es
 * simultánea. Por eso `elegirEnLaRueda` no recibe ni la acción ni el estado: lo
 * único que sabe es si golpea o responde. Una IA que «lea» al rival es otra tarea.
 */
import { activeStack, stackById } from '../battle/battle.js';
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
 * Lo que sale de completar un golpe en la rueda: la acción lista para darse
 * (`falta: null`), o la que espera la elección de una persona (`falta`, su
 * papel), con lo de la IA ya elegido.
 */
export type CruceCompletado =
  | { readonly falta: null; readonly accion: BattleAction }
  | { readonly falta: PapelEnLaRueda; readonly accion: BattleAction & { type: 'attack' } };

/**
 * La acción con lo que le falte de la rueda elegido por la IA, en su orden: el
 * golpe y luego la respuesta, cada uno sin ver el otro. Elige solo por los
 * bandos que lleva (`laLlevaLaIA`; sin decirlo, los dos): el primero que es de
 * una persona se queda en `falta`, y lo que viene detrás no se sortea aún, para
 * que el `Rng` gaste lo mismo en el mismo orden. Si no es un golpe, la misma
 * acción y sin tocar el `Rng`.
 *
 * El único sitio donde la IA completa un cruce: lo leen `autoResolve`, las dos
 * sesiones y el director del agente. **Parche temporal (F4 de la tarea del
 * combate en el juego, 19-10-2026)**: en la partida, la persona y el agente aún no
 * eligen (F5 y F6), así que su golpe y la respuesta que les toca los elige aquí la
 * IA a ciegas.
 */
export function completarCruce(
  state: BattleState,
  accion: BattleAction,
  rng: Rng,
  laLlevaLaIA: (side: Side) => boolean = () => true,
): CruceCompletado {
  if (accion.type !== 'attack') return { falta: null, accion };
  const atacante = activeStack(state);
  if (atacante === null) throw new Error('un golpe en la rueda sin nadie a quien le toque');
  // Quien elige cada papel: el golpe, el bando del que pega; la respuesta, el del
  // objetivo.
  const bando: Readonly<Record<PapelEnLaRueda, Side>> = {
    golpe: atacante.side,
    respuesta: stackById(state, accion.target).side,
  };
  let completa = accion;
  for (const papel of ['golpe', 'respuesta'] as const) {
    if (completa[papel] !== undefined) continue;
    if (!laLlevaLaIA(bando[papel])) return { falta: papel, accion: completa };
    completa = { ...completa, [papel]: elegirEnLaRueda(papel, rng) };
  }
  return { falta: null, accion: completa };
}
