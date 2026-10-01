/**
 * La inversa exacta de `construirVista`, y el ÚNICO sitio que rehace los `Set`.
 *
 * No es una tercera serialización del mapa —`ws-server.ts` ya avisa por escrito
 * de las dos que hay—: es la vuelta de la única que va por este cable. Lo que
 * hace son dos `new Set(...)`, porque `JSON.stringify` deja un `Set` en `{}` sin
 * decir nada y el emisor los manda como listas de claves `"x,y"`.
 *
 * Y no fabrica un `GameState` falso: `drawMapa` pide un
 * `AdventureScene` —los campos que de verdad lee— en vez de la partida entera,
 * así que aquí no hay que inventarse ni un `pendingBattle` ni un `log` ni una
 * `seed` para contentar al compilador. Esa mentira es la que dentro de seis
 * meses alguien lee como si fuera la partida.
 */

import type { BattleState } from '@core/battle/types.js';
import { creature } from '@core/data.js';
import type { TerrainKind } from '@core/map/terrain.js';
import type { UnitInfo } from '@core/types.js';
import type { SpectatorView, StackEnCable, VistaBatalla } from '../../server/vista-espectador.js';
import type { AdventureScene } from '../render/mapa.js';

/**
 * El terreno del fotograma anterior, para devolver EL MISMO array si no ha
 * cambiado. El lienzo del mapa rehace la superficie cuando el array es otro, y
 * cada fotograma del cable trae uno recién parseado aunque el terreno sea el de
 * siempre —el terreno no cambia en toda la partida—. Comparar 576 casillas una
 * vez por fotograma del cable es lo que ahorra rehacer la superficie en cada uno.
 */
let terrenoAnterior: readonly TerrainKind[] | null = null;

function terrenoEstable(terreno: readonly TerrainKind[]): readonly TerrainKind[] {
  const antes = terrenoAnterior;
  if (
    antes !== null &&
    antes.length === terreno.length &&
    antes.every((t, i) => t === terreno[i])
  ) {
    return antes;
  }
  terrenoAnterior = terreno;
  return terreno;
}

export function adaptarEscena(view: SpectatorView): AdventureScene {
  return {
    map: {
      width: view.map.width,
      height: view.map.height,
      terrain: terrenoEstable(view.map.terrain),
      roads: new Set(view.map.roads),
      objects: view.map.objects,
    },
    players: view.players.map((p) => ({ id: p.id, fog: new Set(p.fog) })),
    heroes: view.heroes,
  };
}

/**
 * Dónde centrar la cámara: el primer héroe vivo, y si no queda ninguno, el
 * primer castillo.
 *
 * El cliente que juega centra en SU héroe seleccionado; aquí no hay «suyo», así
 * que se mira lo que haya. Con el mapa de 24×24 entero en pantalla esto casi
 * nunca importa — pero en 48×48 sí, y el día que la partida se juegue ahí, una
 * cámara clavada en (0,0) enseñaría una esquina vacía.
 */
export function centroDeLaEscena(view: SpectatorView): { x: number; y: number } {
  return view.heroes[0]?.at ?? view.towns[0]?.at ?? { x: 0, y: 0 };
}

/**
 * La batalla del cable con sus cifras otra vez: la inversa de `stackAlCable`.
 *
 * Una criatura del catálogo llega sin `unit` y se rehace con `creature(body)`,
 * la misma referencia que puso `createBattle`; un personaje o el héroe la traen
 * puesta. Se reparte por `origen`, que viaja, y no por si `unit` vino o no: un
 * personaje que llegara sin cifras lanza nombrándolo en vez de ir a buscar al
 * catálogo las de un cuerpo que no está en él.
 */
export function adaptarBatalla(batalla: VistaBatalla): BattleState {
  const { estado } = batalla;
  return {
    ...estado,
    stacks: estado.stacks.map((s) => ({ ...s, unit: cifrasDe(s) })),
  };
}

function cifrasDe(s: StackEnCable): UnitInfo {
  switch (s.origen.kind) {
    case 'catalogo':
      return creature(s.body);
    case 'personaje':
    case 'heroe':
      if (s.unit === undefined) {
        throw new Error(`${s.id} (${s.origen.kind}) llega por el cable sin sus cifras`);
      }
      return s.unit;
  }
}
