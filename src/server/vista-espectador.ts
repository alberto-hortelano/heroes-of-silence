/**
 * La vista que ve un espectador, montada UNA vez: `construirVista`, el único
 * constructor del `SpectatorView` que viaja por el cable del espectador.
 *
 * El tipo vive en `src/shared/cable-del-espectador.ts` desde la fase S de la
 * reorganización (07-11-2026), con el mensaje que la lleva: lo lee también la
 * página del espectador, que no importa el servidor. Aquí se queda lo que solo
 * puede hacer el servidor, que tiene la partida; su vuelta exacta es `adaptar.ts`
 * (`src/client/espectador/`).
 *
 * **Todo esto lo ve el espectador entero, y es aposta**: mira la partida desde
 * fuera, no la juega. Es lo contrario que la consulta `map` del agente, que desde
 * #74 pasa por la niebla (`serializeKnownMap`). Si alguien viene a unificar las
 * dos, lo que junta son dos reglas distintas bajo un solo nombre.
 */
import type { BattleStack } from '@core/battle/types.js';
import { piezasPuestas } from '@core/equipo/vestir.js';
import { vecinosDeLaBase, vozDe } from '@core/gente/voces.js';
import { dueñoEnLaFoto, dueñosDeLaRed } from '@core/map/territorio.js';
import { regionDeLaBatalla } from '@core/state/batallas.js';
import { climaDeLaPartida } from '@core/state/clima.js';
import { battleOwners, week } from '@core/state/consultas.js';
import { sinSello } from '@core/state/events.js';
import { comoEstaElSitio, sitioDelObjeto } from '@core/state/sitios.js';
import type { GameState } from '@core/state/tipos.js';
import type { Town } from '@core/town/town.js';
import type { Point, Veterania } from '@core/types.js';
import type {
  SpectatorView,
  StackEnCable,
  VeteraniaEnCable,
  VozEnLaBase,
} from '../shared/cable-del-espectador.js';

/** Lo que dice hoy quien tiene voz narrada en esa base, en el orden de su gente. */
function vocesNarradas(state: GameState, t: Town): VozEnLaBase[] {
  const lineas = t.voces?.lineas;
  if (lineas === undefined) return [];
  const semana = week(state);
  return vecinosDeLaBase(t)
    .filter((v) => (lineas[v.id]?.length ?? 0) > 0)
    .map((v) => ({
      npc: v.id,
      nombre: v.nombre,
      papel: v.papel,
      linea: vozDe(t, v.id, semana, state.day),
    }));
}

/**
 * El único constructor de la vista.
 *
 * `directorLog` entra por parámetro y no se saca del estado porque no es del
 * estado: lo escribe el director, que es quien conduce. Y `| null` en `battle`
 * en vez de opcional, por `exactOptionalPropertyTypes`.
 */
export function construirVista(state: GameState, directorLog: readonly string[]): SpectatorView {
  const pending = state.pendingBattle;
  const indice = (p: Point): number => p.y * state.map.width + p.x;
  // Los dueños, de una pasada por la red: las ciudades y los sitios los leen.
  const dueños = dueñosDeLaRed(state);
  return {
    seed: state.seed,
    map: {
      width: state.map.width,
      height: state.map.height,
      terrain: state.map.terrain,
      tramos: state.map.caminos.tramos.flatMap(([p, q]) => [indice(p), indice(q)]),
      sueltas: state.map.caminos.sueltas.map(indice),
      objects: state.map.objects,
      regions: state.map.regions,
    },
    players: state.players.map((p) => ({
      id: p.id,
      faction: p.faction,
      oro: p.oro,
      defeated: p.defeated,
      fog: p.fog.indices(),
    })),
    heroes: state.heroes.map((h) => ({
      id: h.id,
      owner: h.owner,
      name: h.name,
      at: h.at,
      movePoints: h.movePoints,
      faction: h.faction,
      tipo: h.tipo,
      historia: h.origen?.historia ?? null,
      equipo: piezasPuestas(h.equipo).map((p) => p.nombre),
      // Sin el ejército: ningún panel del espectador lo lee, y desde la tropa
      // de individuos crece con cada uno, en cada fotograma. Si algún panel lo
      // necesita, se manda `troopSummary`, que es el que agrupa.
    })),
    towns: state.towns.map((t) => ({
      id: t.id,
      owner: dueñoEnLaFoto(dueños, t.id),
      name: t.name,
      at: t.at,
      buildings: t.buildings,
      voces: vocesNarradas(state, t),
    })),
    sitios: state.map.objects.flatMap((o) => {
      if (o.kind !== 'town' && o.kind !== 'village') return [];
      const { dueño, ocupante } = comoEstaElSitio(
        state,
        sitioDelObjeto(state, o),
        dueñoEnLaFoto(dueños, o.id),
      );
      return [{ id: o.id, at: o.at, owner: dueño, ocupante }];
    }),
    raiders: state.raiders.map((r) => ({ id: r.id, at: r.at, troops: r.troops })),
    // Sin el sello: el espectador ve la partida entera —eso es lo que es— pero
    // quién MÁS estaba mirando cada casilla es contabilidad de casa, y salía
    // entera por aquí mientras el mensaje del agente la borraba a propósito dos
    // ficheros más allá.
    log: state.log.slice(-40).map(sinSello),
    directorLog: directorLog.slice(-20),
    battle:
      pending === null
        ? null
        : {
            estado: { ...pending.battle, stacks: pending.battle.stacks.map(stackAlCable) },
            dueños: battleOwners(state, pending),
            region: regionDeLaBatalla(state, pending),
          },
    clima: climaDeLaPartida(state),
  };
}

/**
 * Se quita `unit` exactamente cuando `createBattle` la sacó del catálogo
 * (`origen: catalogo`), que es lo que deja a `adaptarBatalla` rehacerla con
 * `cifrasDeUnidad` sin adivinar nada: un veterano también, porque su
 * experiencia viaja en `origen.veterania`. El héroe la trae de otro sitio y
 * viaja con ella.
 *
 * Y no viaja lo que el espectador no lee: `ganado` —la contabilidad de la
 * batalla en curso, que cobra `settleBattle`—, el precio de rendición y la hoja
 * de servicios. Iban en cada fotograma por el solo hecho de estar en el objeto.
 *
 * Lo puesto (`UnitInfo.equipo`) sí viaja con las cifras del héroe (F6 de la
 * tarea del combate en el juego, 19-10-2026): son unos pocos
 * ids, y con ellos la vuelta (`adaptarBatalla`) es la inversa exacta, sin un
 * «menos el equipo» que la comparación tuviera que quitar; las del catálogo lo
 * rehacen con `cifrasDeUnidad`, como el resto de sus cifras.
 */
function stackAlCable(s: BattleStack): StackEnCable {
  const { unit, ganado: _ganado, origen, ...resto } = s;
  switch (origen.kind) {
    case 'catalogo':
      return {
        ...resto,
        origen: {
          kind: 'catalogo',
          unidad: origen.unidad,
          veterania: hojaAlCable(origen.veterania),
          ...(origen.salida === undefined ? {} : { salida: origen.salida }),
        },
      };
    case 'heroe':
      return { ...resto, unit, origen };
  }
}

function hojaAlCable(v: Veterania | null): VeteraniaEnCable | null {
  if (v === null) return null;
  return {
    id: v.id,
    experiencia: v.experiencia,
    ...(v.equipo === undefined ? {} : { equipo: v.equipo }),
  };
}
