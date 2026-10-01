/**
 * La vista que ve un espectador, declarada UNA vez.
 *
 * Vivía a mano dentro de `broadcast()` y el mensaje que la llevaba decía
 * `view: unknown`, así que quien la pintara tendría que reimplementar el esquema
 * del emisor por su cuenta — que es exactamente lo que acaba de morder en
 * `MapPlan` contra `mapPlanSchema`. Aquí hay un solo tipo y un solo constructor,
 * y los dos extremos compilan contra él.
 *
 * **Sin zod, y es deliberado.** Lo que hizo falta validar en `MapPlan` lo escribe
 * el AGENTE, que es un modelo y puede escribir cualquier cosa. Esto lo escribe
 * este servidor y lo lee una página de este repositorio: los dos lados salen del
 * mismo `tsc`. Lo único que se comprueba en ejecución, y en el otro extremo, es
 * que el mensaje diga `type: 'snapshot'`.
 *
 * **Todo esto lo ve el espectador entero, y es aposta**: mira la partida desde
 * fuera, no la juega. Es lo contrario que la consulta `map` del agente, que desde
 * #74 pasa por la niebla (`serializeKnownMap`). Si alguien viene a unificar las
 * dos, lo que junta son dos reglas distintas bajo un solo nombre.
 */
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import type { MapObject, MapRegion } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import type { VistaAsaltante } from '@core/state/asaltantes.js';
import type { GameEventDraft } from '@core/state/events.js';
import { sinSello } from '@core/state/events.js';
import { battleOwners, type GameState } from '@core/state/game.js';
import type { FactionId, PlayerId, Point, Resources, UnitInfo } from '@core/types.js';

/**
 * El mapa sin `Set`: `roads` viaja como array de claves `"x,y"`.
 *
 * `JSON.stringify` deja un `Set` en `{}` sin decir nada —lo mismo que avisa #10
 * para el guardado—, así que la conversión es obligatoria y va aquí, no en el
 * llamante. `adaptar.ts`, en el cliente, es su inversa exacta.
 */
export interface VistaMapa {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainKind[];
  readonly roads: readonly string[];
  readonly objects: readonly MapObject[];
  /**
   * Las regiones declaradas del mapa de nodos (fase 2a). Viajan ya, aunque el
   * visor todavía no pinte el territorio (es de la 2b), para que el cable sea
   * la imagen entera del mapa y no haya que volver a abrir esta frontera.
   */
  readonly regions: readonly MapRegion[];
}

export interface VistaJugador {
  readonly id: PlayerId;
  readonly faction: FactionId;
  readonly resources: Resources;
  readonly defeated: boolean;
  /** Casillas exploradas, por clave `"x,y"`. Era un `Set`. */
  readonly fog: readonly string[];
}

export interface VistaHeroe {
  readonly id: string;
  readonly owner: PlayerId;
  readonly name: string;
  readonly at: Point;
  readonly movePoints: number;
}

export interface VistaPueblo {
  readonly id: string;
  readonly owner: PlayerId | null;
  readonly name: string;
  readonly at: Point;
  readonly buildings: readonly string[];
}

/**
 * Un stack de batalla tal y como viaja: **sin `unit` si sus cifras son las del
 * catálogo**, que el espectador ya tiene —`creature(body)`—, y con `unit` si es
 * un personaje, cuyas cifras no están en ninguna otra parte.
 *
 * Mandar el catálogo por el cable costaba +2 097 B en una batalla de 5 contra 5
 * (+72 % del estado de batalla) en cada fotograma, o sea ~90 KB por partida,
 * para repetir una tabla que las dos puntas ya tienen. `adaptarBatalla`, en el
 * cliente, es la inversa exacta.
 */
export type StackEnCable = Omit<BattleStack, 'unit'> & { readonly unit?: UnitInfo };

export interface BatallaEnCable extends Omit<BattleState, 'stacks'> {
  readonly stacks: readonly StackEnCable[];
}

/**
 * La batalla en curso, con **de quién es cada bando**.
 *
 * Los dueños viajan porque el espectador pinta cada bando del color de su
 * jugador, y sin esto tendría que rederivarlo del `foe` — o sea, una tercera
 * copia de `battleOwners`, que ya se escribió dos veces y ya discrepó una.
 *
 * Fuera de `unit`, el `BattleState` viaja tal cual: no lleva ni un `Set` ni un
 * `Map` dentro, así que el viaje por JSON no le quita nada. Comprobado en
 * `test/espectador.test.ts`.
 */
export interface VistaBatalla {
  readonly estado: BatallaEnCable;
  readonly dueños: Readonly<Record<Side, PlayerId | null>>;
}

export interface SpectatorView {
  readonly map: VistaMapa;
  readonly players: readonly VistaJugador[];
  readonly heroes: readonly VistaHeroe[];
  readonly towns: readonly VistaPueblo[];
  /**
   * Los grupos de asaltantes, con su tropa contada: la figura lleva el cuerpo
   * de su primera criatura y la chapa, cuántos son. La forma es la del núcleo
   * (`VistaAsaltante`), la misma que pinta el lienzo.
   */
  readonly raiders: readonly VistaAsaltante[];
  /**
   * Los últimos hechos, **sin el sello**: es `GameEventDraft` y no `GameEvent`, y
   * el tipo lo dice en vez de dejarlo en una nota. Lo que se quita es `seen`
   * —quién más estaba mirando—, que es contabilidad de casa.
   */
  readonly log: readonly GameEventDraft[];
  /** Lo que va diciendo el director, incluido el `reasoning` del agente. */
  readonly directorLog: readonly string[];
  /** `null` la mayor parte de la partida: casi siempre no hay batalla. */
  readonly battle: VistaBatalla | null;
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
  return {
    map: {
      width: state.map.width,
      height: state.map.height,
      terrain: state.map.terrain,
      roads: [...state.map.roads],
      objects: state.map.objects,
      regions: state.map.regions,
    },
    players: state.players.map((p) => ({
      id: p.id,
      faction: p.faction,
      resources: p.resources,
      defeated: p.defeated,
      fog: [...p.fog],
    })),
    heroes: state.heroes.map((h) => ({
      id: h.id,
      owner: h.owner,
      name: h.name,
      at: h.at,
      movePoints: h.movePoints,
      // Sin el ejército: ningún panel del espectador lo lee, y desde la tropa
      // de individuos crece con cada uno, en cada fotograma. Si algún panel lo
      // necesita, se manda `troopSummary`, que es el que agrupa.
    })),
    towns: state.towns.map((t) => ({
      id: t.id,
      owner: t.owner,
      name: t.name,
      at: t.at,
      buildings: t.buildings,
    })),
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
          },
  };
}

/**
 * Se quita `unit` exactamente cuando `createBattle` la sacó del catálogo
 * (`origen: catalogo`), que es lo que deja a `adaptarBatalla` rehacerla con
 * `creature(body)` sin adivinar nada. El personaje y el héroe la traen de otro
 * sitio y viajan con ella.
 */
function stackAlCable(s: BattleStack): StackEnCable {
  switch (s.origen.kind) {
    case 'catalogo': {
      const { unit: _catalogo, ...resto } = s;
      return resto;
    }
    case 'personaje':
    case 'heroe':
      return s;
  }
}
