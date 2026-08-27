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
import type { BattleState, Side } from '@core/battle/types.js';
import type { MapObject } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import type { GameEventDraft } from '@core/state/events.js';
import { sinSello } from '@core/state/events.js';
import { battleOwners, type GameState } from '@core/state/game.js';
import type { Army, FactionId, PlayerId, Point, Resources } from '@core/types.js';

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
  readonly army: Army;
}

export interface VistaPueblo {
  readonly id: string;
  readonly owner: PlayerId | null;
  readonly name: string;
  readonly at: Point;
  readonly buildings: readonly string[];
  readonly garrison: Army;
}

/**
 * La batalla en curso, con **de quién es cada bando**.
 *
 * Los dueños viajan porque el espectador pinta cada bando del color de su
 * jugador, y sin esto tendría que rederivarlo del `foe` — o sea, una tercera
 * copia de `battleOwners`, que ya se escribió dos veces y ya discrepó una.
 *
 * `BattleState` viaja tal cual: no lleva ni un `Set` ni un `Map` dentro, así que
 * el viaje por JSON no le quita nada. Comprobado en `test/espectador.test.ts`.
 */
export interface VistaBatalla {
  readonly estado: BattleState;
  readonly dueños: Readonly<Record<Side, PlayerId | null>>;
}

export interface SpectatorView {
  readonly map: VistaMapa;
  readonly players: readonly VistaJugador[];
  readonly heroes: readonly VistaHeroe[];
  readonly towns: readonly VistaPueblo[];
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
      army: h.army,
    })),
    towns: state.towns.map((t) => ({
      id: t.id,
      owner: t.owner,
      name: t.name,
      at: t.at,
      buildings: t.buildings,
      garrison: t.garrison,
    })),
    // Sin el sello: el espectador ve la partida entera —eso es lo que es— pero
    // quién MÁS estaba mirando cada casilla es contabilidad de casa, y salía
    // entera por aquí mientras el mensaje del agente la borraba a propósito dos
    // ficheros más allá.
    log: state.log.slice(-40).map(sinSello),
    directorLog: directorLog.slice(-20),
    battle:
      pending === null ? null : { estado: pending.battle, dueños: battleOwners(state, pending) },
  };
}
