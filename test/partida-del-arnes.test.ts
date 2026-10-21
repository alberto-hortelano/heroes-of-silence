/**
 * La búsqueda de la semilla del arnés (#131): lo que `pnpm qa` y el espectador
 * de `pnpm capturas` necesitan ver, leído de las peticiones de una partida.
 *
 * Las peticiones se escriben aquí a mano y no salen de una partida de verdad a
 * propósito: un test que dependiera de qué trae la semilla N se rompería con
 * cada cambio del generador, que es justo lo que la búsqueda vino a quitar.
 * Que la partida en el proceso diga lo mismo que el arnés de verdad se vio en
 * vivo: la búsqueda descarta la 7 por no tener dos tramos, y `QA_SEMILLA=7
 * pnpm qa` muere en `exigeDosTramos`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DECISIONES_DEL_ESPECTADOR,
  faltaParaElArnes,
  faltaParaElEspectador,
  type Peticion,
  semillaDelArnes,
} from '../tools/qa/partida-del-arnes.js';

let n = 0;
const id = (): string => `p-${++n}`;

function turno(acciones: readonly string[] = [], raiders = 0, equipado = false): Peticion {
  return {
    requestId: id(),
    kind: 'adventure_turn',
    payload: {
      knownMap: { raiders: Array.from({ length: raiders }, (_, i) => ({ id: `r${i}` })) },
      // Un individuo con una pieza puesta, como lo trae el turno (`cruzaElEquipo`).
      heroes: equipado
        ? [{ army: [{ id: 'v-1', equipment: { arma: 'espada', armadura: null } }] }]
        : [{ army: [{ id: 'v-1', equipment: { arma: null, armadura: null } }] }],
    },
    respuesta: { actions: acciones.map((type) => ({ type })) },
  };
}

function batalla(turnId: number, accion: string): Peticion {
  return {
    requestId: id(),
    kind: 'battle_turn',
    payload: { turnId },
    respuesta: { action: { type: accion } },
  };
}

function respuesta(): Peticion {
  return {
    requestId: id(),
    kind: 'battle_response',
    payload: {},
    respuesta: { response: 'normal' },
  };
}

function ascenso(): Peticion {
  return { requestId: id(), kind: 'hero_from_troop', payload: {}, respuesta: {} };
}

/** Una partida que lo da todo en tres turnos, con lo que cada caso quita. */
function completa(): Peticion[] {
  return [
    turno(['build', 'move_hero'], 1),
    batalla(4, 'move'),
    batalla(4, 'move'),
    batalla(5, 'attack'),
    respuesta(),
    respuesta(),
    ascenso(),
    turno(['dismiss', 'buy_item', 'equip']),
    turno(['move_hero'], 0, true),
  ];
}

describe('lo que pnpm qa necesita ver (#131)', () => {
  it('una partida que lo da todo en sus turnos no echa nada en falta', () => {
    expect(faltaParaElArnes(completa(), 3)).toEqual([]);
  });

  it('lo que llega después del último turno que escucha el arnés no cuenta', () => {
    // Con dos turnos, el arnés deja de escuchar en el segundo: la licencia, la
    // compra y el equipo de ese turno no se llegan a ver. El ascenso sí: el
    // nacido sale en ese segundo turno.
    const faltan = faltaParaElArnes(completa(), 2);
    expect(faltan).toEqual([
      'un «dismiss» con un turno después para verlo',
      'un «buy_item» con un turno después para verlo',
      'un «equip» con un turno después donde se vea el individuo equipado',
    ]);
  });

  it('un «equip» cuyo individuo no llega equipado a ningún turno no vale (#195)', () => {
    // El novato equipado que cae en la batalla de antes del turno siguiente: el
    // «equip» tuvo turno después, pero `pnpm qa` no ve a nadie con la pieza.
    const p = completa();
    p[8] = turno(['move_hero']);
    expect(faltaParaElArnes(p, 3)).toEqual([
      'un «equip» con un turno después donde se vea el individuo equipado',
    ]);
  });

  it('dos «move» solo cuentan en el mismo turno de la unidad', () => {
    const p = completa();
    p[2] = batalla(9, 'move');
    expect(faltaParaElArnes(p, 3)).toEqual([
      'una unidad del agente que mande dos «move» seguidos en el mismo turno',
    ]);
  });

  it('la rueda: dos respuestas, la segunda con una petición después (la primera va mala)', () => {
    // `pnpm qa` manda mala la primera y exige que otra entre (`exigeLaRueda`):
    // con una sola, la semilla 29 salía buscada y el arnés daba rojo (vuelta 3
    // de la ciudad amurallada, 21-10-2026).
    const falta =
      'dos «battle_response», la segunda con una petición después para ver su veredicto';
    const p = completa();
    expect(
      faltaParaElArnes(
        p.filter((_, i) => i !== 5),
        3,
      ),
    ).toEqual([falta]);
    // La segunda, la última: su veredicto no le llega a nadie.
    expect(faltaParaElArnes(p.slice(0, 6), 3)).toContain(falta);
    expect(faltaParaElArnes(p.slice(0, 7), 3)).not.toContain(falta);
  });

  it('sin asaltantes en ningún knownMap, falta', () => {
    const p = completa();
    p[0] = turno(['build', 'move_hero']);
    expect(faltaParaElArnes(p, 3)).toEqual(['un grupo de asaltantes en el knownMap de un turno']);
  });

  it('el segundo «move» necesita una petición después: con ella le llega su veredicto', () => {
    const p = [turno([], 1), batalla(4, 'move'), batalla(4, 'move')];
    expect(faltaParaElArnes(p, 3)).toContain(
      'una unidad del agente que mande dos «move» seguidos en el mismo turno',
    );
    expect(faltaParaElArnes([...p, turno()], 3)).not.toContain(
      'una unidad del agente que mande dos «move» seguidos en el mismo turno',
    );
  });
});

describe('lo que el espectador necesita ver (#131)', () => {
  it('un ascenso y de 2 al tope de decisiones de batalla', () => {
    expect(faltaParaElEspectador(completa())).toEqual([]);
    expect(faltaParaElEspectador(completa().filter((p) => p.kind !== 'hero_from_troop'))).toEqual([
      'un «hero_from_troop»',
    ]);
    expect(faltaParaElEspectador([ascenso(), batalla(1, 'attack')])).toEqual([
      'dos turnos de batalla del agente (hay 1)',
    ]);
  });

  it('más decisiones de las que el espectador cuenta en su plazo, no vale', () => {
    const muchas = Array.from({ length: DECISIONES_DEL_ESPECTADOR + 1 }, (_, i) =>
      batalla(i, 'attack'),
    );
    expect(faltaParaElEspectador([ascenso(), ...muchas])).toEqual([
      `como mucho ${DECISIONES_DEL_ESPECTADOR} decisiones de batalla (hay ${DECISIONES_DEL_ESPECTADOR + 1})`,
    ]);
  });
});

describe('QA_SEMILLA', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('juega la semilla pedida sin buscar', async () => {
    vi.stubEnv('QA_SEMILLA', '7');
    expect(await semillaDelArnes()).toEqual({
      semilla: 7,
      como: 'pedida con QA_SEMILLA, sin buscar',
    });
  });

  it('lo que no es semilla se rechaza diciéndolo, como HEROES_SEED', async () => {
    vi.stubEnv('QA_SEMILLA', 'siete');
    await expect(semillaDelArnes()).rejects.toThrow('"siete" no es una semilla');
  });
});
