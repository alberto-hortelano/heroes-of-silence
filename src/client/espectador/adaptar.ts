/**
 * La inversa exacta de `construirVista`, y el ÚNICO sitio que rehace los `Set`.
 *
 * No es una tercera serialización del mapa —`ws-server.ts` ya avisa por escrito
 * de las dos que hay—: es la vuelta de la única que va por este cable. Rehace la
 * niebla con un `new Set(...)`, porque `JSON.stringify` deja un `Set` en `{}`
 * sin decir nada y el emisor la manda como lista de claves `"x,y"`. Y la red de
 * caminos, que viaja plana —índices, dos por tramo— y se rehace con
 * `RedDeCaminos.desdeTramos`, la misma puerta que la del servidor (#153).
 *
 * Y no fabrica un `GameState` falso: `drawMapa` pide un
 * `AdventureScene` —los campos que de verdad lee— en vez de la partida entera,
 * así que aquí no hay que inventarse ni un `pendingBattle` ni un `log` ni una
 * `seed` para contentar al compilador. Esa mentira es la que dentro de seis
 * meses alguien lee como si fuera la partida.
 */

import type { BattleStack, BattleState } from '@core/battle/types.js';
import { cifrasDeCatalogo } from '@core/hero/experiencia.js';
import { aPunto, RedDeCaminos, type TramoDeCamino } from '@core/map/map.js';
import { BARRERAS, type TerrainKind } from '@core/map/terrain.js';
import type { UnitInfo, Veterania } from '@core/types.js';
import type {
  SpectatorView,
  StackEnCable,
  VeteraniaEnCable,
  VistaBatalla,
  VistaMapa,
} from '../../server/vista-espectador.js';
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

/**
 * La red de caminos de la vista: los índices, otra vez tramos de casillas.
 *
 * **Lanza** con lo que no es una red: además de lo que rechaza `desdeTramos`,
 * una vista sin `tramos` —la de un `pnpm partida` arrancado antes de #153, que
 * aún manda `roads`— y una lista de longitud impar, que dejaría el último
 * tramo con una punta `undefined` y, sin esto, se pintaba en silencio sin él.
 */
function redDelCable(m: VistaMapa): RedDeCaminos {
  if (!Array.isArray(m.tramos) || !Array.isArray(m.sueltas)) {
    throw new Error(
      'el mapa llega sin `tramos` ni `sueltas`: el servidor habla el formato de antes de #153 ' +
        '(`roads`). Reinicia `pnpm partida` con el código de ahora',
    );
  }
  if (m.tramos.length % 2 !== 0) {
    throw new Error(
      `los tramos de camino llegan con ${m.tramos.length} índices, y van dos por tramo`,
    );
  }
  const punto = (i: number) => aPunto(i, m.width);
  const tramos: TramoDeCamino[] = [];
  for (let k = 0; k < m.tramos.length; k += 2) {
    tramos.push([punto(m.tramos[k] as number), punto(m.tramos[k + 1] as number)]);
  }
  return RedDeCaminos.desdeTramos(tramos, m.width, m.height, m.sueltas.map(punto));
}

/**
 * Que cada nodo traiga la barrera que cruza (#145): el escenógrafo la lee para
 * su pieza, y sin ella no sabría si es un puente. Un `pnpm partida` arrancado
 * antes la manda sin ella, y lo honrado es decirlo y no pintar hitos.
 */
function nodosDelCable(objetos: SpectatorView['map']['objects']): void {
  for (const o of objetos) {
    if (o.kind !== 'node' || (BARRERAS as readonly unknown[]).includes(o.barrera)) continue;
    throw new Error(
      `el nodo ${o.id} llega sin la barrera que cruza: el servidor habla el formato de antes de #145. ` +
        'Reinicia `pnpm partida` con el código de ahora',
    );
  }
}

/**
 * **Lanza** si la vista no se entiende: la red de caminos o un nodo sin su
 * barrera. Por eso se miran antes que el terreno: un fotograma que se rechaza
 * no debe tocar `terrenoAnterior`.
 */
export function adaptarEscena(view: SpectatorView): AdventureScene {
  const caminos = redDelCable(view.map);
  nodosDelCable(view.map.objects);
  return {
    map: {
      width: view.map.width,
      height: view.map.height,
      terrain: terrenoEstable(view.map.terrain),
      caminos,
      objects: view.map.objects,
      regions: view.map.regions,
    },
    players: view.players.map((p) => ({ id: p.id, fog: new Set(p.fog) })),
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
 * Una criatura del catálogo llega sin `unit` y se rehace con
 * `cifrasDeCatalogo`, la misma regla que usó `createBattle` —en el nivel 1, la
 * misma referencia del catálogo—; un personaje o el héroe la traen puesta. Se
 * reparte por `origen`, que viaja, y no por si `unit` vino o no: un personaje
 * que llegara sin cifras lanza nombrándolo en vez de ir a buscar al catálogo las
 * de un cuerpo que no está en él.
 *
 * **Es exacta en lo que se pinta, no en lo que el cable no manda**, y eso se
 * dice aquí en vez de disimularlo: `ganado`, el precio de rendición y la hoja de
 * servicios no viajan (`stackAlCable`). El precio se rehace —es del catálogo—;
 * lo ganado y la hoja vuelven VACÍOS, porque inventarse una cifra que se parezca
 * sería peor. Ningún lector del espectador los mira, y el test compara la vuelta
 * con la batalla quitando exactamente esos campos.
 */
export function adaptarBatalla(batalla: VistaBatalla): BattleState {
  const { estado } = batalla;
  return { ...estado, stacks: estado.stacks.map(stackDelCable) };
}

function stackDelCable(s: StackEnCable): BattleStack {
  const { unit: _cifras, origen: _origen, ...resto } = s;
  const ganado = { experiencia: 0, bajas: 0, heroes: [] };
  switch (s.origen.kind) {
    case 'catalogo': {
      const unit = cifrasDeCatalogo(s.body, s.origen.veterania);
      return {
        ...resto,
        unit,
        ganado,
        origen: {
          kind: 'catalogo',
          oro: unit.cost.gold ?? 0,
          veterania: hojaDelCable(s.origen.veterania),
        },
      };
    }
    case 'personaje':
      return {
        ...resto,
        unit: cifrasQueViajan(s),
        ganado,
        origen: { kind: 'personaje', id: s.origen.id, veterania: hojaDelCable(s.origen.veterania) },
      };
    case 'heroe':
      return { ...resto, unit: cifrasQueViajan(s), ganado, origen: s.origen };
  }
}

function cifrasQueViajan(s: StackEnCable): UnitInfo {
  if (s.unit === undefined) {
    throw new Error(`${s.id} (${s.origen.kind}) llega por el cable sin sus cifras`);
  }
  return s.unit;
}

/** La hoja de un veterano sin lo que no viaja: batallas, bajas y héroes, vacíos. */
function hojaDelCable(v: VeteraniaEnCable | null): Veterania | null {
  if (v === null) return null;
  return {
    id: v.id,
    experiencia: v.experiencia,
    batallas: 0,
    bajas: 0,
    heroes: [],
    ...(v.equipo === undefined ? {} : { equipo: v.equipo }),
  };
}
