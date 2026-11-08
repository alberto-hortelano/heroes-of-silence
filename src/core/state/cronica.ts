/**
 * La crónica de la partida: **el único sitio que escribe `state.log`** (`emit`, con
 * el sello de quién lo estaba mirando, `observa`) y la crónica de los sitios
 * (`fotoDeLosSitios`, `anotarLosSitios`: lo que cambió de dueño o de ocupante sin
 * que nadie lo hiciera a propósito).
 *
 * `emit` se exporta, pero la importa solo una lista cerrada de módulos de la
 * partida —`turnos`, `marcha`, `batallas`, `cierre`, `lugares`, `heroes` y `game`—,
 * y cada uno cuenta algo (lo vigila `invariantes-partida.test.ts`). Nadie fuera de
 * `state/`: los sitios, el clima, la renta y los asaltantes no escriben hechos, los
 * cuenta quien los llama. Era privada de `game.ts` hasta la fase N de la
 * reorganización (07-11-2026), que lo repartió por lo que hace.
 */
import { dueñoEnLaFoto, dueñosDeLaRed } from '../map/territorio.js';
import type { PlayerId, Point } from '../types.js';
import { type GameEvent, type GameEventDraft, type Ocupante, SE_VE_POR } from './events.js';
import {
  casillaDelSitio,
  comoEstaElSitio,
  enUnNodo,
  type Sitio,
  type SitioVisto,
  sitioDelObjeto,
} from './sitios.js';
import type { GameState } from './tipos.js';
import { visibleNowAt } from './vision.js';

/**
 * Escribe un hecho en la crónica, sellado con quién lo estaba mirando.
 * **El único sitio que toca `state.log`.**
 *
 * El sello se pone AL OCURRIR y no al leer, y eso es la decisión de fondo: la
 * crónica es memoria, no una ventana. Recalcular al leer no era la opción
 * barata sino la imposible —el héroe muerto ya no tiene dueño a quien
 * preguntar— y encima filtraría al revés: 133 eventos por 40 semillas que no vi
 * cuando pasaron y cuya casilla hoy sí miro. Medido: el 14,8 % de los eventos
 * del rival cambia de veredicto según cuándo se evalúe.
 *
 * **Y el sello se calcula DESPUÉS de la mutación**, que es la trampa del
 * cambio: cuando se sella la muerte de un héroe, el héroe ya no está en el
 * mapa y su dueño no mira desde ninguna parte; cuando se sella una captura, el
 * castillo ya lleva la bandera nueva. A esos dos no los salva el sello, los
 * salvan las cláusulas de «siempre» de `visibleTo` — `actor` y `from`.
 *
 * Recorre `state.players` EN ORDEN, nunca la iteración de un `Set`: el `JSON`
 * de dos partidas con la misma semilla tiene que salir idéntico.
 *
 * `state.log` es de solo lectura para que «el único sitio» lo compruebe el
 * compilador; el `as` de aquí abajo es la única grieta, y está a la vista y
 * comentada en vez de repartida por diecinueve sitios.
 */
export function emit(state: GameState, draft: GameEventDraft): void {
  // «`game_over` es el último hecho» es una regla del núcleo y no una
  // costumbre de los bucles: un hecho escrito después del final lanza aquí,
  // donde se escribe, en vez de esperar a que lo vea el invariante de la
  // crónica en las semillas que lo pisen. Los `return` de los bucles se quedan:
  // son los que hacen que no se llegue aquí.
  if (state.finished !== null && draft.kind !== 'game_over') {
    throw new Error(
      `la partida ya ha terminado y se iba a escribir "${draft.kind}" después del final`,
    );
  }
  const sitio = draft.at;
  const seen: PlayerId[] = [];
  // Un hecho sin sitio no lo observa nadie, y no es un agujero: los cuatro que
  // no tienen casilla —el día, el turno, la derrota y el fin— van siempre.
  if (sitio !== null) {
    for (const p of state.players) {
      if (observa(state, p.id, draft, sitio)) seen.push(p.id);
    }
  }
  (state.log as GameEvent[]).push({ ...draft, seen });
}

/**
 * Si `p` observa un hecho ocurrido en `sitio`, con la vara que dice `SE_VE_POR`:
 * por su casilla (`visibleNowAt`: el radio de sus héroes, castillos y nodos sobre
 * lo explorado), y la marcha que se para por un grupo, por la casilla del héroe
 * **y** la del grupo: si no, la crónica le contaría al rival que mira al héroe un
 * grupo y su tropa que su niebla le tapa (H4 de QA).
 */
function observa(state: GameState, p: PlayerId, draft: GameEventDraft, sitio: Point): boolean {
  switch (SE_VE_POR[draft.kind]) {
    case 'casilla':
      return visibleNowAt(state, p, sitio);
    case 'casilla y grupo': {
      if (draft.kind !== 'march_halted') {
        throw new Error(`"${draft.kind}" se sella por su grupo y no lleva grupo`);
      }
      const grupo = state.raiders.find((r) => r.id === draft.raider);
      if (grupo === undefined) {
        throw new Error(`la marcha se para por el grupo ${draft.raider}, que no está en el mapa`);
      }
      return visibleNowAt(state, p, sitio) && visibleNowAt(state, p, grupo.at);
    }
  }
}

/** De quién es un sitio y quién lo ocupa, en un instante (`fotoDeLosSitios`). */
type SitioEnLaFoto = SitioVisto & { readonly sitio: Sitio };

/**
 * De quién es cada ciudad y cada pueblo y quién lo ocupa, ahora: lo que compara
 * `anotarLosSitios` al acabar una acción o una batalla. Los dueños, de una pasada
 * por la red (`dueñosDeLaRed`), no uno por sitio.
 */
export function fotoDeLosSitios(state: GameState): ReadonlyMap<string, SitioEnLaFoto> {
  const dueños = dueñosDeLaRed(state);
  const foto = new Map<string, SitioEnLaFoto>();
  for (const o of state.map.objects) {
    if (o.kind !== 'town' && o.kind !== 'village') continue;
    const sitio = sitioDelObjeto(state, o);
    foto.set(o.id, { sitio, ...comoEstaElSitio(state, sitio, dueñoEnLaFoto(dueños, o.id)) });
  }
  return foto;
}

/** Si dos ocupantes son el mismo (el mismo héroe, o una guarnición del mismo dueño). */
function mismoOcupante(a: Ocupante | null, b: Ocupante | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'heroe') return b.kind === 'heroe' && a.heroId === b.heroId;
  return b.kind === 'guarnicion' && a.dueño === b.dueño;
}

/**
 * **La crónica de los sitios** (tarea 2, 05-11-2026): compara la foto de antes
 * (`fotoDeLosSitios`) con la de ahora y cuenta lo que cambió sin que nadie lo
 * hiciera a propósito —una ciudad de dentro de una región que cambia de dueño con
 * ella (`town_owner_changed`; la del muro ya lo cuenta `tomarElNodo`), un sitio que
 * queda ocupado (`site_occupied`) y uno que deja de estarlo (`site_freed`)—. Así
 * marcharse, perder una batalla, cerrar una región y la guarnición que se queda
 * dentro de lo que cambia de dueño (P1) son un solo camino, y ninguna acción tiene
 * que acordarse de contarlo. Cada hecho, con su dueño de protagonista y en su
 * casilla. Lo llaman `applyAdventureAction` y `settleBattle`, al acabar; tras
 * `game_over`, nada (es el último hecho).
 */
export function anotarLosSitios(state: GameState, antes: ReadonlyMap<string, SitioEnLaFoto>): void {
  if (state.finished !== null) return;
  for (const [id, ahora] of fotoDeLosSitios(state)) {
    const previo = antes.get(id);
    if (previo === undefined) continue;
    const at = casillaDelSitio(ahora.sitio);
    if (
      ahora.sitio.kind === 'ciudad' &&
      previo.dueño !== ahora.dueño &&
      !enUnNodo(state, ahora.sitio)
    ) {
      emit(state, {
        kind: 'town_owner_changed',
        town: id,
        from: previo.dueño,
        to: ahora.dueño,
        actor: ahora.dueño,
        at,
      });
    }
    if (mismoOcupante(previo.ocupante, ahora.ocupante)) continue;
    if (ahora.ocupante !== null) {
      emit(state, { kind: 'site_occupied', site: id, by: ahora.ocupante, actor: ahora.dueño, at });
    } else if (ahora.dueño !== null) {
      // Sin dueño ya no hay ocupación que acabe: no se le cuenta a nadie que se
      // «liberó» un sitio que ya no es suyo.
      emit(state, { kind: 'site_freed', site: id, actor: ahora.dueño, at });
    }
  }
}
