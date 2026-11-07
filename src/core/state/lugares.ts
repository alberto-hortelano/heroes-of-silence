/**
 * Lo que hace un lugar de un mundo en la partida: **la única escritura** de lo que
 * da o quita y del estado y las marcas de `GameState.mundo` (`aplicarEfectos`, cada
 * efecto con su hecho), y lo que el mundo recuerda de una opción elegida
 * (`anotarLaEleccion`: lo cobrado y dónde quedó la conversación). Si una opción se
 * puede elegir lo dice `mundo/reglas.ts`, que solo pregunta; el encuentro ganado lo
 * anota el cierre de su batalla (`applyVictory`, `cierre.ts`).
 *
 * Vivía en `game.ts` hasta la fase N de la reorganización (07-11-2026), que lo
 * repartió por lo que hace.
 */
import { sacarDeLaMochila } from '../equipo/portador.js';
import { withTroops } from '../hero/troop.js';
import {
  batallaDe,
  type Cobro as CobroDelMundo,
  claveDeOpcion,
  daPremio,
  type Efecto,
  type EstadoDelMundo,
  type Lugar,
  type Opcion,
  recordarLaConversacion,
} from '../mundo/formato.js';
import { mundoDe, type RefDeOpcion } from '../mundo/reglas.js';
import type { Hero, PlayerId } from '../types.js';
import { abrirBatalla } from './batallas.js';
import { playerById } from './consultas.js';
import { emit } from './cronica.js';
import { aLaMochila } from './equipar.js';
import type { BattleFoe } from './events.js';
import type { GameContext, GameState } from './tipos.js';

/**
 * Aplica los efectos de un lugar, en orden, cada uno con su hecho en la crónica.
 * **La única escritura** de lo que da o quita un lugar y del estado y las marcas
 * de `GameState.mundo` (lo cobrado y la conversación, `anotarLaEleccion`): la
 * llaman la opción elegida (`elegir_en_lugar`) y el cierre de una batalla de un
 * lugar (`alGanar`, `alPerder`). Quien llama ya ha comprobado que se puede
 * (`opcionBlocker`, o la validación del mundo, que en `alGanar` no deja pagos ni
 * tropa y en `alPerder` solo deja estado y marca): aquí no se falla a medias.
 *
 * `hero` es quien recibe lo que se da; al perder puede haber caído ya, y entonces
 * es `null` (`alPerder` no da nada). `dueño` es el protagonista de los hechos.
 * `ctx` y `ref` (la opción elegida) solo hacen falta si hay batalla: la abre
 * `abrirBatalla`, como un ataque, y la batalla recuerda qué opción la abrió.
 */
export function aplicarEfectos(
  state: GameState,
  dueño: PlayerId,
  hero: Hero | null,
  lugar: Lugar,
  efectos: readonly Efecto[],
  ctx: GameContext | null,
  ref: RefDeOpcion | null = null,
): void {
  const mundo = mundoDe(state);
  const at = lugar.at;
  const player = playerById(state, dueño);
  const delHeroe = (que: string): Hero => {
    if (hero === null) throw new Error(`«${que}» en ${lugar.nombre} sin héroe que lo reciba`);
    return hero;
  };
  for (const e of efectos) {
    if ('estado' in e) {
      const from = mundo.estados[lugar.id] as string;
      if (from === e.estado) continue;
      mundo.estados[lugar.id] = e.estado;
      emit(state, {
        kind: 'place_state',
        lugar: lugar.id,
        nombre: lugar.nombre,
        estado: e.estado,
        from,
        dicho: lugar.estados[e.estado] ?? e.estado,
        actor: dueño,
        at,
      });
    } else if ('marca' in e) {
      if (mundo.marcas.includes(e.marca)) continue;
      mundo.marcas.push(e.marca);
      emit(state, { kind: 'world_mark', marca: e.marca, lugar: lugar.id, actor: dueño, at });
    } else if ('oro' in e) {
      player.oro += e.oro;
      emit(
        state,
        e.oro > 0
          ? { kind: 'gold_gained', amount: e.oro, from: 'lugar', lugar: lugar.id, actor: dueño, at }
          : { kind: 'gold_paid', amount: -e.oro, lugar: lugar.id, actor: dueño, at },
      );
    } else if ('pieza' in e) {
      const h = delHeroe('pieza');
      aLaMochila(h, e.pieza);
      emit(state, {
        kind: 'loot_found',
        hero: h.id,
        item: e.pieza,
        from: 'lugar',
        lugar: lugar.id,
        actor: dueño,
        at,
      });
    } else if ('quitar' in e) {
      const h = delHeroe('quitar');
      h.mochila = sacarDeLaMochila(h.mochila, e.quitar);
      emit(state, {
        kind: 'item_given',
        hero: h.id,
        item: e.quitar,
        lugar: lugar.id,
        actor: dueño,
        at,
      });
    } else if ('tropa' in e) {
      const h = delHeroe('tropa');
      h.army = withTroops(h.army, e.tropa.unidad, e.tropa.n);
      emit(state, {
        kind: 'troops_joined',
        hero: h.id,
        creature: e.tropa.unidad,
        count: e.tropa.n,
        lugar: lugar.id,
        actor: dueño,
        at,
      });
    } else {
      const h = delHeroe('batalla');
      if (ctx === null || ref === null)
        throw new Error(`una batalla de ${lugar.nombre} sin la opción que la abra`);
      abrirBatalla(
        state,
        {
          attacker: { kind: 'hero', heroId: h.id },
          foe: {
            kind: 'lugar',
            lugar: lugar.id,
            encuentro: e.batalla,
            opcion: { punto: ref.punto, nodo: ref.nodo, opcion: ref.opcion },
          },
        },
        ctx,
      );
    }
  }
}

/**
 * Lo que el mundo recuerda de una opción elegida, antes de aplicarla: su premio,
 * cobrado por el dueño de `hero` (`cobradas`; el de una opción con batalla, al
 * ganarla, `applyVictory`), y dónde queda la conversación de ese jugador con su
 * punto (`recordarLaConversacion`). Con lo de `aplicarEfectos` y el encuentro
 * ganado, lo único que escribe `GameState.mundo`.
 */
export function anotarLaEleccion(
  mundo: EstadoDelMundo,
  ref: RefDeOpcion,
  opcion: Opcion,
  hero: Hero,
): void {
  if (daPremio(opcion) && batallaDe(opcion) === null)
    mundo.cobradas[claveDeOpcion(ref)] ??= cobroDe(hero);
  recordarLaConversacion(mundo.conversaciones, hero.owner, ref, opcion);
}

/** Quién cobra: el dueño de `hero` y su nombre, que dicen las frases del otro jugador. */
export function cobroDe(hero: Hero): CobroDelMundo {
  return { jugador: hero.owner, heroe: hero.name };
}

/** La opción que abrió la batalla de un lugar, o lanza. */
export function opcionDeLaBatalla(
  lugar: Lugar,
  foe: Extract<BattleFoe, { kind: 'lugar' }>,
): Opcion {
  const punto = lugar.puntos.find((p) => p.id === foe.opcion.punto);
  const opcion =
    lugar.dialogos[punto?.dialogo ?? '']?.nodos[foe.opcion.nodo]?.opciones[foe.opcion.opcion];
  if (opcion === undefined) {
    throw new Error(
      `la batalla de «${lugar.nombre}» no sabe qué opción la abrió (${foe.opcion.punto}/${foe.opcion.nodo}/${foe.opcion.opcion})`,
    );
  }
  return opcion;
}
