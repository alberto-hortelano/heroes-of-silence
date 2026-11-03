/**
 * Los poderes de unidad de la arena (docs/agents/2026-10-11-poderes-y-edicion-en-combate/):
 * el monje cura a un aliado en su turno, con la regla escrita una vez en el
 * núcleo (`poderBlocker`) y las cifras de `data/poderes.json`.
 *
 * Escritos desde los criterios del plan: A1 (Curar), A5 (cada motivo del rechazo), la lista legal, la previsión, el
 * cargador y A4 (la IA los usa).
 */

import { describe, expect, it } from 'vitest';
import { batallaDeArena, type HeroeDeArena, heroePorDefecto } from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  legalActions,
  poderBlocker,
  previsionDe,
} from '../src/core/battle/battle.js';
import { poder, poderDeHabilidad, validarPoderes } from '../src/core/battle/poderes.js';
import type { BattleState } from '../src/core/battle/types.js';
import { unidadDelJuego, unidadesDelJuego } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { avanzarHasta, delBorrador, SANADOR, unidadDeArena as unidad } from './helpers.js';

/** El monje y el escudero a la izquierda contra un orco, con la semilla que se pida. */
function pelea(rng: Rng, heroe: HeroeDeArena | null = null): BattleState {
  return batallaDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: {
        unidades: [unidad('templario-monje'), unidad('templario-escudo')].map((u) =>
          delBorrador(u),
        ),
        heroe,
      },
      derecha: { unidades: [delBorrador(unidad('orko-dos-armas'))], heroe: null },
      equipo: EQUIPO_DEL_JUEGO,
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
  heroe: HeroeDeArena | null = heroePorDefecto('izquierda'),
) {
  const rng = createRng(7);
  const b = pelea(rng, heroe);
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
    const accion = { type: 'power', poder: 'curar', target: escudero.id } as const;
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
    applyAction(b, { type: 'power', poder: 'curar', target: escudero.id }, rng);
    expect(escudero.topHp).toBe(escudero.unit.hp);
  });
});

describe('los rechazos los escribe poderBlocker (A5)', () => {
  it('la lista legal ofrece exactamente los pares que deja pasar el bloqueador', () => {
    const { b, escudero } = enElTurnoDelMonje(3);
    const ofrecidos = legalActions(b)
      .flatMap((a) => (a.type === 'power' ? [`${a.poder}>${a.target}`] : []))
      .sort();
    const validos = ['curar']
      .flatMap((p) =>
        b.stacks.filter((t) => poderBlocker(b, p, t.id) === null).map((t) => `${p}>${t.id}`),
      )
      .sort();
    expect(ofrecidos).toEqual(validos);
    // Curar, al herido.
    expect(ofrecidos).toContain(`curar>${escudero.id}`);
    expect(ofrecidos.filter((x) => x.startsWith('curar>'))).toEqual([`curar>${escudero.id}`]);
    // El poder va detrás del hechizo y antes de terminar el turno.
    const tipos = legalActions(b).map((a) => a.type);
    expect(tipos.lastIndexOf('cast')).toBeLessThan(tipos.indexOf('power'));
    expect(tipos.at(-1)).toBe('end_turn');
  });
});

describe('el catálogo de poderes (data/poderes.json)', () => {
  const bueno = {
    poderes: [
      { id: 'curar', nombre: 'Curar', habilidad: 'Curar (X)', hechizo: 'cure', cura: 4 },
      { id: 'apresurar', nombre: 'Apresurar', habilidad: 'Apresurar', hechizo: 'haste', rondas: 3 },
    ],
  };

  it('el bueno se lee', () => {
    expect(validarPoderes(bueno).poderes.map((p) => p.id)).toEqual(['curar', 'apresurar']);
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
    expect(() => validarPoderes(con({ hechizo: 'slow', rondas: 3 }, 1))).toThrow('va a un enemigo');
    expect(() => validarPoderes(con({ rondas: 2 }))).toThrow('no lleva «rondas»');
  });

  it('cada unidad del juego trae los poderes de sus habilidades, y nada más: el monje, Curar', () => {
    for (const u of unidadesDelJuego()) {
      const suyos = unidad(u.id).habilidades.flatMap((h) => {
        const p = poderDeHabilidad(h);
        return p === null ? [] : [p];
      });
      expect(u.poderes ?? [], u.id).toEqual(suyos);
    }
    expect(unidadDelJuego(SANADOR).poderes).toEqual(['curar']);
  });
});
