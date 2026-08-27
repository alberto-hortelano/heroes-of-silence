/**
 * La política del arnés de QA, y sobre todo la rama que el circuito no alcanza.
 *
 * `decidir` acababa en `default: return {}`. Un `{}` no valida contra ningún
 * esquema, así que zod lo rechazaba en el servidor — y el arnés lo contaba como
 * turno bueno, porque `heroes_respond` no devuelve `isError` en ese caso. Un
 * silencio verde para una respuesta que no se aplicó.
 *
 * Y no se puede ver morder jugando: los tres kinds que el contrato declara
 * tienen ya su rama, así que `pnpm qa` en verde no prueba nada de esta. Solo un
 * kind inventado a mano la alcanza, que es exactamente lo que hace este fichero.
 *
 * `hero_banter` está en la lista de abajo, y desde #28 por un motivo que no es
 * el de antes: ya **no existe** en el contrato. Se le anunciaba al agente en
 * `heroes_listen` sin serializador, sin punto de llamada y sin sitio donde
 * enseñar la frase, así que se retiró el anuncio en vez de fingir la mitad que
 * faltaba. Aquí queda como el ejemplo de un kind **retirado** que alguien podría
 * seguir emitiendo por costumbre: la rama tiene que morder con él igual que con
 * uno inventado.
 */
import { describe, expect, it } from 'vitest';
import { validateMapPlan } from '../src/core/map/generate.js';
import { decidir, FIRMA_DEL_MAPA } from '../tools/qa/politica.js';

describe('la política del arnés de QA (#44)', () => {
  it('un kind que no sabe atender FALLA, en vez de mandar un objeto vacío', () => {
    // Y el mensaje nombra al kind: un rojo que no dice cuál obliga a leer el
    // arnés entero para saber qué rama falta.
    for (const kind of ['hero_banter', 'lo_que_sea']) {
      expect(() => decidir(kind, {}), kind).toThrow(new RegExp(kind));
    }
  });

  it('los tres kinds que sí atiende siguen respondiendo', () => {
    // Si una rama nueva se llevara por delante a las buenas, `pnpm qa` moriría
    // en la primera escucha y este test es más barato que descubrirlo allí.
    const aventura = decidir('adventure_turn', {
      towns: [{ id: 't1', canBuildNow: [{ id: 'town_hall' }], recruitable: [] }],
      heroes: [{ id: 'h1', at: { x: 2, y: 2 } }],
    }) as { actions: unknown[] };
    expect(aventura.actions.length).toBeGreaterThan(0);

    const batalla = decidir('battle_turn', {
      legalActions: [{ type: 'move' }, { type: 'attack', target: 's2' }],
    }) as { action: { type: string } };
    // Pegar va antes que moverse: si no, el arnés pasea sin resolver ninguna
    // batalla y la partida no termina nunca.
    expect(batalla.action.type).toBe('attack');
  });

  it('el plan de mapa del arnés es jugable y va FIRMADO (#27)', () => {
    // Las dos mitades del plan del arnés, y las dos importan:
    //
    // - jugable, porque un plan que el servidor rechace deja a `pnpm qa`
    //   jugando el mapa procedimental y saliendo verde sin haber ejercitado
    //   `map_generate`. Que salga del generador es lo que lo garantiza sin
    //   inventarse la conectividad a mano.
    // - firmado, porque esa firma es lo ÚNICO que distingue los dos mundos
    //   desde fuera: el arnés la exige en el primer `game_state`.
    const respuesta = decidir('map_generate', {
      want: { width: 24, height: 24, players: 2 },
    }) as { plan: Parameters<typeof validateMapPlan>[0] };

    expect(validateMapPlan(respuesta.plan)).toEqual([]);
    expect(respuesta.plan.towns.map((t) => t.id)).toEqual([
      `${FIRMA_DEL_MAPA}0`,
      `${FIRMA_DEL_MAPA}1`,
    ]);
    // Y los jugadores son los de la partida: un plan con otros es jugable y deja
    // al agente sin un solo turno, en silencio.
    expect(respuesta.plan.heroStarts.map((h) => h.player).sort()).toEqual([0, 1]);
  });
});
