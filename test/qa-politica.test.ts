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
 * Y aquí vivía un guardia que **no podía morder**. Comprobaba que `decidir`
 * lanza con `'hero_banter'` y con `'lo_que_sea'`, pero `decidir(kind: string)`
 * no tiene ninguna relación de tipos con `REQUEST_KINDS`: las dos filas
 * ejercitaban la misma rama `default` y una sobraba por construcción. Nada en el
 * repo afirmaba que `hero_banter` estuviera retirado, así que si mañana volviera
 * a `REQUEST_KINDS` el test seguiría verde y `pnpm qa` moriría en la primera
 * escucha de ese kind.
 *
 * El guardia que faltaba —y que ahora está— compara los kinds que `decidir`
 * atiende contra `REQUEST_KINDS` **en las dos direcciones**. Un guardia que no
 * puede ponerse rojo es peor que ninguno: ocupa el sitio del que sí.
 */
import { describe, expect, it } from 'vitest';
import { REQUEST_KINDS } from '../src/core/contract/agent.js';
import { validateMapPlan } from '../src/core/map/generate.js';
import { decidir, FIRMA_DEL_MAPA } from '../tools/qa/politica.js';

/**
 * Un payload mínimo por kind, con la forma que el servidor manda de verdad.
 *
 * Es la lista de lo que la política SABE atender, escrita como datos para poder
 * compararla con `REQUEST_KINDS`. Que las claves sean exactamente los kinds del
 * contrato es la mitad del guardia; que `decidir` no lance con ninguno es la otra.
 */
const PAYLOADS: Record<string, unknown> = {
  adventure_turn: {
    towns: [{ id: 't1', canBuildNow: [{ id: 'town_hall' }], recruitable: [] }],
    heroes: [{ id: 'h1', at: { x: 2, y: 2 } }],
  },
  battle_turn: { legalActions: [{ type: 'move' }, { type: 'attack', target: 's2' }] },
  map_generate: { want: { width: 24, height: 24, players: 2 } },
};

describe('la política del arnés de QA (#44)', () => {
  it('atiende EXACTAMENTE los kinds que el contrato declara, ni uno más ni uno menos', () => {
    // Las dos direcciones, que es lo que le faltaba a este fichero:
    //
    // - un kind nuevo en `REQUEST_KINDS` sin rama aquí pone esto rojo en cuatro
    //   segundos, en vez de matar `pnpm qa` en la primera escucha de ese kind;
    // - y un kind RETIRADO que vuelva —`hero_banter` es el caso que motivó
    //   esto— también, porque aparecería en `REQUEST_KINDS` y no en `PAYLOADS`.
    expect(Object.keys(PAYLOADS).sort()).toEqual([...REQUEST_KINDS].sort());
    for (const kind of REQUEST_KINDS) {
      expect(() => decidir(kind, PAYLOADS[kind]), kind).not.toThrow();
    }
  });

  it('`hero_banter` ya no existe en el contrato, y por eso la política lo rechaza', () => {
    // La afirmación explícita que faltaba. Sin ella, «este test se queda con
    // otro sentido» era una frase del comentario y nada más: el repo no decía
    // en ninguna parte que el kind estuviera retirado.
    expect([...REQUEST_KINDS]).not.toContain('hero_banter');
    // Y el mensaje nombra al kind: un rojo que no dice cuál obliga a leer el
    // arnés entero para saber qué rama falta.
    for (const kind of ['hero_banter', 'lo_que_sea']) {
      expect(() => decidir(kind, {}), kind).toThrow(new RegExp(kind));
    }
  });

  it('los tres kinds que sí atiende siguen respondiendo lo que deben', () => {
    // Que no lancen ya lo dice el test de arriba; esto mira QUÉ contestan. Si
    // una rama nueva se llevara por delante a las buenas, `pnpm qa` moriría en
    // la primera escucha y este test es más barato que descubrirlo allí.
    const aventura = decidir('adventure_turn', PAYLOADS.adventure_turn) as { actions: unknown[] };
    expect(aventura.actions.length).toBeGreaterThan(0);

    const batalla = decidir('battle_turn', PAYLOADS.battle_turn) as { action: { type: string } };
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
    const respuesta = decidir('map_generate', PAYLOADS.map_generate) as {
      plan: Parameters<typeof validateMapPlan>[0];
    };

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
