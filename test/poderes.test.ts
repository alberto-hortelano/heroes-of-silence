/**
 * Los poderes de unidad de la arena (docs/agents/2026-10-11-poderes-y-edicion-en-combate/):
 * el monje cura y bendice a un aliado en su turno, con la regla escrita una vez
 * en el núcleo (`poderBlocker`) y las cifras de `data/poderes.json`.
 *
 * Escritos desde los criterios del plan: A1 (Curar), A2 (Bendecir y el mismo
 * origen), A5 (cada motivo del rechazo), la lista legal, la previsión, el
 * cargador y A4 (la IA los usa).
 */
import { describe, expect, it } from 'vitest';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { batallaDeArena, type HeroeDeArena, heroePorDefecto } from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  isAlive,
  legalActions,
  poderBlocker,
  previsionDe,
} from '../src/core/battle/battle.js';
import { hexKey, neighbours } from '../src/core/battle/board.js';
import { poder, validarPoderes } from '../src/core/battle/poderes.js';
import {
  REGLAS_DEL_JUEGO,
  type ReglasDeBatalla,
  reglasDeLaURL,
} from '../src/core/battle/reglas.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { allCreatures } from '../src/core/data.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { avanzarHasta, delBorrador, unidadDeArena as unidad } from './helpers.js';

/** El monje y el escudero a la izquierda contra un orco, con la semilla y las reglas que se pidan. */
function pelea(
  rng: Rng,
  reglas: ReglasDeBatalla = REGLAS_DEL_JUEGO,
  heroe: HeroeDeArena | null = null,
): BattleState {
  return batallaDeArena(
    {
      izquierda: {
        // El escudero con las cifras del cuerpo común (3 / 3, daño 10–10): los
        // casos de la IA hacen la cuenta con ellas.
        unidades: [
          unidad('templario-monje'),
          unidad('templario-escudo', { defense: 3, damage: [10, 10] }),
        ].map((u) => delBorrador(u)),
        heroe,
      },
      derecha: { unidades: [delBorrador(unidad('orko-dos-armas'))], heroe: null },
      reglas,
      piezas: [],
    },
    rng,
  );
}

function stack(b: BattleState, slot: number, side: 'attacker' | 'defender' = 'attacker') {
  const s = b.stacks.find((x) => x.side === side && x.slot === slot && x.origen.kind !== 'heroe');
  if (s === undefined) throw new Error(`no hay puesto ${slot} en ${side}`);
  return s;
}

/** Cierra turnos hasta que le toca a `id`: el resto no hace nada. */
function hastaSuTurno(b: BattleState, id: string, rng: Rng): void {
  if (!avanzarHasta(b, rng, id, () => ({ type: 'end_turn' }), 50)) {
    throw new Error(`a ${id} no le llega el turno`);
  }
}

/** La pelea en el turno del monje, con el escudero herido `herida` PV. */
function enElTurnoDelMonje(
  herida: number,
  reglas: ReglasDeBatalla = REGLAS_DEL_JUEGO,
  heroe: HeroeDeArena | null = heroePorDefecto('izquierda'),
) {
  const rng = createRng(7);
  const b = pelea(rng, reglas, heroe);
  const monje = stack(b, 0);
  const escudero = stack(b, 1);
  const orco = stack(b, 0, 'defender');
  hastaSuTurno(b, monje.id, rng);
  escudero.topHp = escudero.unit.hp - herida;
  return { b, rng, monje, escudero, orco };
}

describe('Curar (A1)', () => {
  it('repone lo que dice el poder, sin pasar del máximo, cierra el turno y lo cuenta', () => {
    const { b, rng, monje, escudero } = enElTurnoDelMonje(6);
    const cura = { cura: poder('curar').lanzador.cantidad };
    const accion = { type: 'poder', poder: 'curar', target: escudero.id } as const;
    const p = previsionDe(b, accion);
    expect(p).toMatchObject({ kind: 'poder', poder: 'curar', objetivo: escudero.id });
    expect(p?.kind === 'poder' ? p.cura : null).toBe(Math.min(cura.cura, 6));
    const antes = escudero.topHp;
    const desde = b.log.length;
    applyAction(b, accion, rng);
    // La previsión es la cura que se aplica.
    expect(escudero.topHp).toBe(antes + Math.min(cura.cura, 6));
    expect(b.log.slice(desde)[0]).toEqual({
      kind: 'power',
      stack: monje.id,
      poder: 'curar',
      target: escudero.id,
      cura: Math.min(cura.cura, 6),
    });
    expect(monje.acted).toBe(true);
    expect(activeStack(b)?.id).not.toBe(monje.id);
  });

  it('con menos herida que la cura, cura solo la herida', () => {
    const { b, rng, escudero } = enElTurnoDelMonje(1);
    applyAction(b, { type: 'poder', poder: 'curar', target: escudero.id }, rng);
    expect(escudero.topHp).toBe(escudero.unit.hp);
  });
});

describe('Bendecir (A2)', () => {
  it('cuelga la suerte de la Bendición con sus rondas, y repetida refresca', () => {
    const { b, rng, monje, escudero } = enElTurnoDelMonje(0);
    const bendecir = { rondas: poder('bendecir').lanzador.rondas };
    applyAction(b, { type: 'poder', poder: 'bendecir', target: escudero.id }, rng);
    expect(escudero.effects).toEqual([
      { kind: 'luck', amount: 1, source: 'bless', roundsLeft: bendecir.rondas },
    ]);
    expect(b.log.some((e) => e.kind === 'power' && e.cura === undefined)).toBe(true);
    hastaSuTurno(b, monje.id, rng);
    applyAction(b, { type: 'poder', poder: 'bendecir', target: escudero.id }, rng);
    expect(escudero.effects.filter((e) => e.source === 'bless')).toHaveLength(1);
  });

  it('es la misma que la del héroe: tras su Bendición no se suma', () => {
    const { b, rng, escudero } = enElTurnoDelMonje(0);
    applyAction(b, { type: 'cast', spell: 'bless', target: escudero.id }, rng);
    applyAction(b, { type: 'poder', poder: 'bendecir', target: escudero.id }, rng);
    expect(escudero.effects.filter((e) => e.source === 'bless')).toHaveLength(1);
  });

  it('con la regla (e) de fheroes2 fija la tirada, como la del héroe', () => {
    const { b, rng, escudero } = enElTurnoDelMonje(0, reglasDeLaURL('bendicion'));
    applyAction(b, { type: 'poder', poder: 'bendecir', target: escudero.id }, rng);
    expect(escudero.effects).toMatchObject([{ kind: 'tirada', amount: 1, source: 'bless' }]);
  });
});

describe('los rechazos los escribe poderBlocker (A5)', () => {
  it('cada motivo, y applyAction lanza con él', () => {
    const { b, rng, monje, escudero, orco } = enElTurnoDelMonje(0);
    const motivos: [string, string | undefined, string][] = [
      ['curar', escudero.id, 'Escudero no tiene ninguna herida'],
      ['curar', undefined, 'nadie de su bando tiene ninguna herida'],
      ['bendecir', orco.id, '«Bendecir» va dirigido a un aliado'],
      ['curar', 'nadie', 'no hay ninguna unidad "nadie"'],
      ['volar', escudero.id, 'no hay ningún poder «volar»'],
    ];
    for (const [p, t, motivo] of motivos) {
      expect(poderBlocker(b, p, t)).toContain(motivo.replace('Escudero', escudero.unit.name));
      if (t !== undefined) {
        expect(() => applyAction(b, { type: 'poder', poder: p, target: t }, rng)).toThrow(
          `${monje.unit.name} no puede usar ese poder:`,
        );
      }
    }
    // Muerto.
    escudero.count = 0;
    expect(poderBlocker(b, 'bendecir', escudero.id)).toBe('el objetivo ya está destruido');
    escudero.count = 1;
    // Tras moverse, ninguno: es al principio del turno.
    const paso = legalActions(b).find((a) => a.type === 'move');
    if (paso === undefined) throw new Error('el monje no se puede mover');
    applyAction(b, paso, rng);
    expect(poderBlocker(b, 'bendecir', escudero.id)).toBe(
      'ya se ha movido este turno: «Bendecir» se usa al principio del turno',
    );
    expect(legalActions(b).some((a) => a.type === 'poder')).toBe(false);
  });

  it('quien no tiene el poder no lo sabe', () => {
    const rng = createRng(7);
    const b = pelea(rng);
    const escudero = stack(b, 1);
    hastaSuTurno(b, escudero.id, rng);
    expect(poderBlocker(b, 'curar', escudero.id)).toBe(`${escudero.unit.name} no sabe Curar`);
    expect(legalActions(b).some((a) => a.type === 'poder')).toBe(false);
  });

  it('la lista legal ofrece exactamente los pares que deja pasar el bloqueador', () => {
    const { b, escudero, monje } = enElTurnoDelMonje(3);
    const ofrecidos = legalActions(b)
      .flatMap((a) => (a.type === 'poder' ? [`${a.poder}>${a.target}`] : []))
      .sort();
    const validos = ['curar', 'bendecir']
      .flatMap((p) =>
        b.stacks.filter((t) => poderBlocker(b, p, t.id) === null).map((t) => `${p}>${t.id}`),
      )
      .sort();
    expect(ofrecidos).toEqual(validos);
    // Curar, al herido; Bendecir, a todo aliado vivo, también a sí mismo y al héroe.
    expect(ofrecidos).toContain(`curar>${escudero.id}`);
    expect(ofrecidos).toContain(`bendecir>${monje.id}`);
    expect(ofrecidos.filter((x) => x.startsWith('curar>'))).toEqual([`curar>${escudero.id}`]);
    // El poder va detrás del hechizo y antes de terminar el turno.
    const tipos = legalActions(b).map((a) => a.type);
    expect(tipos.lastIndexOf('cast')).toBeLessThan(tipos.indexOf('poder'));
    expect(tipos.at(-1)).toBe('end_turn');
  });
});

describe('el catálogo de poderes (data/poderes.json)', () => {
  const bueno = {
    poderes: [
      { id: 'curar', nombre: 'Curar', habilidad: 'Curar (X)', hechizo: 'cure', cura: 4 },
      { id: 'bendecir', nombre: 'Bendecir', habilidad: 'Bendecir', hechizo: 'bless', rondas: 3 },
    ],
  };

  it('el bueno se lee', () => {
    expect(validarPoderes(bueno).poderes.map((p) => p.id)).toEqual(['curar', 'bendecir']);
  });

  it('lanza con la cura que falta, un hechizo de daño o uno al enemigo', () => {
    const con = (cambio: object, i = 0) => ({
      ...bueno,
      poderes: bueno.poderes.map((p, j) => (j === i ? { ...p, ...cambio } : p)),
    });
    const { cura: _fuera, ...sinCura } = bueno.poderes[0] as { cura: number };
    expect(() => validarPoderes({ ...bueno, poderes: [sinCura, bueno.poderes[1]] })).toThrow(
      'data/poderes.json: el poder «curar»: la cura tiene que ser un número entero',
    );
    expect(() => validarPoderes(con({ cura: 0 }))).toThrow('la cura tiene que ser 1 o más');
    expect(() =>
      validarPoderes({ ...bueno, poderes: [bueno.poderes[0], bueno.poderes[0]] }),
    ).toThrow('el poder «curar» está dos veces');
    expect(() => validarPoderes(con({ hechizo: 'lightning_bolt' }))).toThrow('es de daño');
    expect(() => validarPoderes(con({ hechizo: 'curse', rondas: 3 }, 1))).toThrow(
      'va a un enemigo',
    );
    expect(() => validarPoderes(con({ rondas: 2 }))).toThrow('no lleva «rondas»');
  });

  it('ninguna criatura del juego trae poderes: la jugada `poder` no sale fuera de la arena', () => {
    expect(allCreatures().filter((c) => c.poderes !== undefined)).toEqual([]);
  });
});

describe('la IA de batalla usa los poderes (A4)', () => {
  /** El orco, en una casilla libre de al lado del escudero. */
  function orcoJuntoAlEscudero(b: BattleState, escudero: BattleStack, orco: BattleStack): void {
    const ocupadas = new Set(b.stacks.filter(isAlive).map((x) => hexKey(x.hex)));
    const libre = neighbours(escudero.hex).find((h) => !ocupadas.has(hexKey(h)));
    if (libre === undefined) throw new Error('el escudero no tiene una casilla libre al lado');
    orco.hex = libre;
  }

  it('cura a quien puede caer si la pelea se gana; si no corre peligro, no gasta el turno en él', () => {
    // Sin héroe: con él, la IA lanza antes su hechizo, que no gasta el turno.
    // 30 de herida sobre los 80 del escudero (la brigantina da armadura, no PV:
    // #262), y le quedan 50.
    const { b, escudero, orco } = enElTurnoDelMonje(30, REGLAS_DEL_JUEGO, null);
    orco.topHp = 30; // el bando del monje va ganando la carrera
    // Lejos del orco, 50 PV no corren peligro: el monje no se queda curando.
    expect(chooseBattleAction(b)).not.toMatchObject({ type: 'poder' });
    // Con el orco pegado (dos golpes de 40-70, menos los 7 de la brigantina),
    // 50 PV caen: lo cura.
    orcoJuntoAlEscudero(b, escudero, orco);
    expect(chooseBattleAction(b)).toEqual({ type: 'poder', poder: 'curar', target: escudero.id });
    // Y si la pelea se pierde, curar solo la alarga: pega o se mueve. Con los 80
    // PV del orco entero y sus 10 de armadura la pelea aún se gana: con la vida
    // que tenía cuando el arnés daba 100 PV (180), se pierde.
    Object.assign(orco, { unit: { ...orco.unit, hp: 180 } });
    orco.topHp = orco.unit.hp;
    expect(chooseBattleAction(b)).not.toMatchObject({ type: 'poder' });
  });

  it('bendice cuando compensa: a un aliado que pega mucho más que él, y no a quien ya está bendecido', () => {
    // Con las cifras del escudero, suerte +1 (1/24 de golpe doble) no vale lo que
    // el golpe del monje o acercarse: no bendice.
    expect(chooseBattleAction(enElTurnoDelMonje(0, REGLAS_DEL_JUEGO, null).b)).not.toMatchObject({
      type: 'poder',
    });
    // Con un escudero que pega diez veces más, y un orco que aguanta para que esas
    // rondas lleguen a jugarse, tres rondas de suerte sí.
    const rng = createRng(7);
    const b = batallaDeArena(
      {
        izquierda: {
          unidades: [
            unidad('templario-monje'),
            unidad('templario-escudo', { damage: [400, 600] }),
          ].map((u) => delBorrador(u)),
          heroe: null,
        },
        derecha: { unidades: [delBorrador(unidad('orko-dos-armas', { hp: 4000 }))], heroe: null },
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      rng,
    );
    const monje = stack(b, 0);
    const escudero = stack(b, 1);
    hastaSuTurno(b, monje.id, rng);
    expect(chooseBattleAction(b)).toEqual({
      type: 'poder',
      poder: 'bendecir',
      target: escudero.id,
    });
    // Ya bendecido (por el héroe o por el monje), refrescarlo no le gana al turno.
    applyAction(b, { type: 'poder', poder: 'bendecir', target: escudero.id }, rng);
    hastaSuTurno(b, monje.id, rng);
    expect(escudero.effects.some((x) => x.source === 'bless')).toBe(true);
    expect(chooseBattleAction(b)).not.toMatchObject({ type: 'poder', poder: 'bendecir' });
  });
});
