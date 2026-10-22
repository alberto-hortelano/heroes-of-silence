/**
 * El héroe de salida se elige en la base y se paga (22-10-2026, «el selector de
 * héroe al iniciar la partida similar al reclutamiento, mostrándolos en la base,
 * con coste que se descuenta de lo que queda para reclutar más tropa»;
 * `docs/agents/2026-10-22-heroe-en-la-base/`). Todo héroe cuesta
 * `ECONOMIA.precioDelHeroe` y entra por una sola puerta (`hire_hero`, `hireHero`):
 * el de salida de la IA, del agente y de `newGame` por defecto, pagado al crear
 * la partida; el de la persona sin `?heroe=`, pendiente hasta que lo elige.
 */
import { describe, expect, it } from 'vitest';
import { ECONOMIA, tipoDeHeroePorDefecto, validarEconomia } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import {
  type AdventureAction,
  applyAdventureAction,
  candidatosAHeroe,
  contratarBlocker,
  type GameState,
  salidaPendienteBlocker,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { oroBlocker } from '../src/core/town/town.js';

const ctx = () => ({ rng: createRng(7) });
const baseDe = (state: GameState, jugador = 0) => {
  const id = state.players.find((p) => p.id === jugador)!.base!;
  return state.towns.find((t) => t.id === id)!;
};
const accion = (state: GameState, a: AdventureAction, quien = 0) =>
  applyAdventureAction(state, a, ctx(), quien);

describe('el precio de todo héroe', () => {
  it('newGame por defecto da a cada jugador su héroe ya pagado', () => {
    const state = newGame({ seed: 11 });
    const sinPagar = newGame({ seed: 11, tipoDelHeroe: null });
    expect(state.heroes.map((h) => h.owner)).toEqual(state.players.map((p) => p.id));
    for (const p of state.players) expect(p.heroeDeSalida).toBeNull();
    // El jugador 1 aún no ha cobrado la renta del día 1; el 0, que abre, sí.
    expect(state.players[1]!.oro).toBe(ECONOMIA.oroDeSalida - ECONOMIA.precioDelHeroe);
    expect(state.players[0]!.oro).toBe(sinPagar.players[0]!.oro - ECONOMIA.precioDelHeroe);
  });

  it('un precio mayor que el oro de salida no carga: el de salida no se podría pagar', () => {
    const bueno = {
      oroPorIndice: { divisor: 500 },
      crecimientoPorNivel: [12, 8, 5, 4, 3, 2],
      costeDeLaMorada: [200, 1000, 2250, 7000, 8000, 20000],
      oroDeSalida: 1000,
      rentaDelPueblo: 250,
      precioDelHeroe: 1000,
    };
    expect(validarEconomia(bueno).precioDelHeroe).toBe(1000);
    expect(() => validarEconomia({ ...bueno, precioDelHeroe: 1001 })).toThrow(
      'precioDelHeroe (1001) no puede pasar de oroDeSalida (1000): el héroe de salida se paga con él',
    );
    expect(() => validarEconomia({ ...bueno, precioDelHeroe: 2.5 })).toThrow(
      'precioDelHeroe tiene que ser un entero ≥ 0 de oro y es 2.5',
    );
  });
});

describe('el héroe de salida por elegir', () => {
  const porElegir = (faccion: 'imperio' | 'elfos' = 'imperio') =>
    newGame({ seed: 11, faccionDelJugador: faccion, tipoDelHeroe: null });

  it('el jugador 0 empieza sin héroe y sin pagarlo; el rival, con el suyo pagado', () => {
    const state = porElegir();
    const elegido = newGame({ seed: 11, faccionDelJugador: 'imperio' });
    expect(state.heroes.map((h) => h.owner)).toEqual([1]);
    expect(state.players[0]!.heroeDeSalida).not.toBeNull();
    expect(state.players[0]!.oro).toBe(elegido.players[0]!.oro + ECONOMIA.precioDelHeroe);
    expect(state.players[1]!.oro).toBe(ECONOMIA.oroDeSalida - ECONOMIA.precioDelHeroe);
  });

  it('hasta elegirlo no se recluta, no se construye ni se pasa el turno, con su motivo', () => {
    const state = porElegir();
    const base = baseDe(state);
    const motivo = `antes de nada, elige a tu héroe de salida ante el ayuntamiento de ${base.name}`;
    expect(salidaPendienteBlocker(state, 0)).toBe(motivo);
    const unidad = Object.keys(base.available)[0]!;
    expect(() =>
      accion(state, { type: 'recruit', town: base.id, creature: unidad, count: 1 }),
    ).toThrow(motivo);
    expect(() => accion(state, { type: 'build', town: base.id, building: 'tavern' })).toThrow(
      motivo,
    );
    const oro = state.players[0]!.oro;
    expect(() => accion(state, { type: 'end_turn' })).toThrow(motivo);
    expect(state.players[0]!.oro).toBe(oro);
    expect(state.current).toBe(0);
  });

  it('elegirlo lo asienta con ese tipo y su tropa de salida, sin la guarnición, y lo cobra', () => {
    const state = porElegir();
    const base = baseDe(state);
    const guarnicion = [...base.garrison];
    accion(state, { type: 'hire_hero', town: base.id, tipo: 'ingeniero' });

    const elegido = newGame({ seed: 11, faccionDelJugador: 'imperio', tipoDelHeroe: 'ingeniero' });
    // La misma partida que con el tipo ya elegido: los mismos héroes en el mismo
    // orden, el mismo oro y la base con su guarnición.
    expect(state.heroes).toEqual(elegido.heroes);
    expect(state.heroes[0]!.tipo).toBe('ingeniero');
    expect(state.heroes[0]!.army.length).toBeGreaterThan(0);
    expect(state.players.map((p) => p.oro)).toEqual(elegido.players.map((p) => p.oro));
    expect(base.garrison).toEqual(guarnicion);
    expect(state.players[0]!.heroeDeSalida).toBeNull();
    // Sin hecho en la crónica: el de salida nunca lo tuvo.
    expect(state.log.filter((e) => e.kind === 'hero_hired')).toEqual([]);
    // Y ya se juega.
    expect(salidaPendienteBlocker(state, 0)).toBeNull();
    accion(state, { type: 'end_turn' });
  });

  it('sin oro no se elige, con la frase de `oroBlocker`', () => {
    const state = porElegir();
    const base = baseDe(state);
    state.players[0]!.oro = ECONOMIA.precioDelHeroe - 1;
    const frase = oroBlocker(ECONOMIA.precioDelHeroe, ECONOMIA.precioDelHeroe - 1)!;
    expect(contratarBlocker(state, 0, base.id, 'mago')).toBe(frase);
    expect(candidatosAHeroe(state, 0, base.id).candidatos.map((c) => c.motivo)).toEqual(
      Array(4).fill(frase),
    );
    expect(() => accion(state, { type: 'hire_hero', town: base.id, tipo: 'mago' })).toThrow(
      `no se puede contratar un héroe: ${frase}`,
    );
    expect(state.players[0]!.heroeDeSalida).not.toBeNull();
  });

  it('un tipo de otra facción no se elige, diciendo cuáles valen', () => {
    const state = porElegir();
    const base = baseDe(state);
    expect(() => accion(state, { type: 'hire_hero', town: base.id, tipo: 'lich' })).toThrow(
      '"lich" no es un tipo de héroe de imperio: valen duelista, mago, capitan_mercenario, ingeniero',
    );
  });

  it('los candidatos son todos los tipos de la facción, el de por defecto el primero', () => {
    const imperio = porElegir('imperio');
    const eleccion = candidatosAHeroe(imperio, 0, baseDe(imperio).id);
    const deImperio = eleccion.candidatos;
    expect(deImperio.map((c) => c.tipo)).toEqual([
      'duelista',
      'mago',
      'capitan_mercenario',
      'ingeniero',
    ]);
    expect(deImperio[0]!.tipo).toBe(tipoDeHeroePorDefecto('imperio'));
    for (const c of deImperio) {
      expect(c.precio).toBe(ECONOMIA.precioDelHeroe);
      expect(c.motivo).toBeNull();
    }
    // Lo que no depende del tipo, una vez: el nombre y la tropa del de salida.
    expect(eleccion.nombre).toBe(imperio.players[0]!.heroeDeSalida!.name);
    expect(eleccion.tropa).toEqual(imperio.players[0]!.heroeDeSalida!.army);
    const elfos = porElegir('elfos');
    expect(candidatosAHeroe(elfos, 0, baseDe(elfos).id).candidatos).toHaveLength(3);
  });
});

describe('contratar a media partida', () => {
  /** Una partida con el héroe de salida fuera de la base y oro de sobra. */
  const conLaBaseVacia = () => {
    const state = newGame({ seed: 11, faccionDelJugador: 'imperio' });
    const base = baseDe(state);
    state.heroes[0]!.at = { x: base.at.x, y: base.at.y + 2 };
    state.players[0]!.oro = 100_000;
    return { state, base };
  };

  it('contrata el tipo elegido, y sin tipo el de por defecto', () => {
    const { state, base } = conLaBaseVacia();
    accion(state, { type: 'hire_hero', town: base.id, tipo: 'mago' });
    const mago = state.heroes.at(-1)!;
    expect(mago.id).toMatch(/^hero-0-c/);
    expect(mago.tipo).toBe('mago');
    expect(mago.name).toBe(`Capitán de ${base.name}`);
    expect(state.players[0]!.oro).toBe(100_000 - ECONOMIA.precioDelHeroe);

    mago.at = { x: base.at.x + 1, y: base.at.y + 2 };
    accion(state, { type: 'hire_hero', town: base.id });
    expect(state.heroes.at(-1)!.tipo).toBe(tipoDeHeroePorDefecto('imperio'));
  });

  it('los candidatos del contratado llevan su nombre y salen sin tropa', () => {
    const { state, base } = conLaBaseVacia();
    const { nombre, tropa, candidatos } = candidatosAHeroe(state, 0, base.id);
    expect(nombre).toBe(`Capitán de ${base.name}`);
    expect(tropa).toBeNull();
    expect(candidatos[0]!.motivo).toBeNull();
  });

  it('un jugador sin héroes y sin el de salida pendiente sigue pasando el turno', () => {
    const state = newGame({ seed: 11 });
    state.heroes.splice(
      state.heroes.findIndex((h) => h.owner === 0),
      1,
    );
    state.players[0]!.oro = 0;
    expect(salidaPendienteBlocker(state, 0)).toBeNull();
    accion(state, { type: 'end_turn' });
    expect(state.current).not.toBe(0);
  });
});
