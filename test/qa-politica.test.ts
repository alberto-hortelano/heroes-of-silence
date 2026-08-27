/**
 * La política del arnés de QA, y sobre todo la rama que el circuito no alcanza.
 *
 * `decidir` acababa en `default: return {}`. Un `{}` no valida contra ningún
 * esquema, así que zod lo rechazaba en el servidor — y el arnés lo contaba como
 * turno bueno, porque `heroes_respond` no devuelve `isError` en ese caso. Un
 * silencio verde para una respuesta que no se aplicó.
 *
 * Y no se puede ver morder jugando: hoy nadie emite un tercer `kind`
 * (`map_generate` es #27, todavía abierto), así que `pnpm qa` en verde no
 * prueba nada de esta rama. Solo un kind inventado a mano la alcanza, que es
 * exactamente lo que hace este fichero.
 *
 * `hero_banter` sigue en la lista de abajo, y desde #28 por el motivo
 * contrario: ya no existe en el contrato. Se le anunciaba al agente en
 * `heroes_listen` sin serializador, sin punto de llamada y sin sitio donde
 * enseñar la frase, así que se retiró el anuncio en vez de fingir la mitad que
 * faltaba. Aquí queda como el ejemplo de un kind **retirado** que alguien
 * podría seguir emitiendo por costumbre: la rama tiene que morder con él igual
 * que con uno inventado.
 */
import { describe, expect, it } from 'vitest';
import { decidir } from '../tools/qa/politica.js';

describe('la política del arnés de QA (#44)', () => {
  it('un kind que no sabe atender FALLA, en vez de mandar un objeto vacío', () => {
    // Y el mensaje nombra al kind: un rojo que no dice cuál obliga a leer el
    // arnés entero para saber qué rama falta.
    for (const kind of ['map_generate', 'hero_banter', 'lo_que_sea']) {
      expect(() => decidir(kind, {}), kind).toThrow(new RegExp(kind));
    }
  });

  it('los dos kinds que sí atiende siguen respondiendo', () => {
    // Si la rama nueva se llevara por delante a las buenas, `pnpm qa` moriría
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
});
