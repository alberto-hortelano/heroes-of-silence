/**
 * La inversa exacta de `construirVista`, y el ÚNICO sitio que rehace los `Set`.
 *
 * No es una tercera serialización del mapa —`ws-server.ts` ya avisa por escrito
 * de las dos que hay—: es la vuelta de la única que va por este cable. Lo que
 * hace son dos `new Set(...)`, porque `JSON.stringify` deja un `Set` en `{}` sin
 * decir nada y el emisor los manda como listas de claves `"x,y"`.
 *
 * Y no fabrica un `GameState` falso: desde este ciclo `drawAdventure` pide un
 * `AdventureScene` —los campos que de verdad lee— en vez de la partida entera,
 * así que aquí no hay que inventarse ni un `pendingBattle` ni un `log` ni una
 * `seed` para contentar al compilador. Esa mentira es la que dentro de seis
 * meses alguien lee como si fuera la partida.
 */

import type { SpectatorView } from '../../server/vista-espectador.js';
import type { AdventureScene } from '../render/adventure.js';

export function adaptarEscena(view: SpectatorView): AdventureScene {
  return {
    map: {
      width: view.map.width,
      height: view.map.height,
      terrain: view.map.terrain,
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
