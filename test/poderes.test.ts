/**
 * Los poderes de unidad de la arena (docs/agents/2026-10-11-poderes-y-edicion-en-combate/):
 * el monje cura a un aliado en su turno, con la regla escrita una vez en el
 * núcleo (`poderBlocker`) y las cifras de su hechizo (`data/hechizos.json`).
 *
 * Escritos desde los criterios del plan: A1 (Curar), A5 (cada motivo del rechazo), la lista legal, la previsión, el
 * cargador y A4 (la IA los usa).
 */

import { describe, expect, it } from 'vitest';
import { type HeroeDeArena, heroePorDefecto } from '../src/core/arena/heroe.js';
import { batallaDeArena } from '../src/core/arena/montaje.js';
import { applyAction } from '../src/core/battle/battle.js';
import { activeStack } from '../src/core/battle/consultas.js';
import { poderBlocker } from '../src/core/battle/lanzar.js';
import { legalActions } from '../src/core/battle/legalidad.js';
import { previsionDe } from '../src/core/battle/prevision.js';
import type { BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/equipo/atado.js';
import { catalogoDeHechizos, HECHIZOS_DEL_JUEGO, hechizo } from '../src/core/magia/catalogo.js';
import { rinde } from '../src/core/magia/formato.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { UNIDADES, unidadDelJuego, unidadesDelJuego } from '../src/core/unidad/catalogo.js';
import { hechizosDeUnidadesBlocker, poderDeUnidadBlocker } from '../src/core/unidad/formato.js';
import { avanzarHasta } from './batalla-de-prueba.js';
import { SANADOR } from './comun.js';
import { delBorrador, unidadDeArena as unidad } from './pelea-de-arena.js';

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
function hastaSuTurnoEn50(b: BattleState, id: string, rng: Rng): void {
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
  hastaSuTurnoEn50(b, monje.id, rng);
  escudero.topHp = escudero.unit.hp - herida;
  return { b, rng, monje, escudero, orco };
}

describe('Curar (A1)', () => {
  it('repone lo que dice el poder, sin pasar del máximo, cierra el turno y lo cuenta', () => {
    const { b, rng, monje, escudero } = enElTurnoDelMonje(6);
    const [efecto] = hechizo('curar').efectos;
    if (efecto?.tipo !== 'cura') throw new Error('Curar cura');
    const cura = { cura: rinde(efecto.cantidad, 0) };
    const accion = { type: 'power', poder: 'curar', target: escudero.id } as const;
    const p = previsionDe(b, accion);
    expect(p).toMatchObject({ kind: 'poder', poder: 'curar', objetivo: escudero.id });
    expect(p?.kind === 'poder' ? p.impactos[0]?.cura : null).toBe(Math.min(cura.cura, 6));
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

describe('los poderes son hechizos de la unidad (Unidad.hechizos, 06-11-2026)', () => {
  it('cada unidad del juego trae sus hechizos como poderes, y nada más: el monje, Curar', () => {
    for (const u of unidadesDelJuego()) {
      expect(u.poderes ?? [], u.id).toEqual(unidad(u.id).hechizos ?? []);
    }
    expect(unidadDelJuego(SANADOR).poderes).toEqual(['curar']);
  });

  it('un hechizo que no existe, o que crece con el poder mágico, no vale como poder', () => {
    const monje = unidad('templario-monje');
    const cat = catalogoDeHechizos([hechizo('curar'), hechizo('cure')]);
    expect(hechizosDeUnidadesBlocker([monje], cat)).toBeNull();
    expect(hechizosDeUnidadesBlocker([{ ...monje, hechizos: ['nada'] }], cat)).toMatch(
      /usa el hechizo «nada», que no existe/,
    );
    expect(hechizosDeUnidadesBlocker([{ ...monje, hechizos: ['cure'] }], cat)).toMatch(
      /«porPoder» no sumaría nada/,
    );
  });

  it('un poder de otra facción no vale: el monje templario con el Zombi pegajoso (08-11-2026)', () => {
    const monje = unidad('templario-monje');
    const zombi = hechizo('zombi_pegajoso');
    expect(poderDeUnidadBlocker(monje, hechizo('curar'))).toBeNull();
    expect(poderDeUnidadBlocker(monje, zombi)).toEqual({
      motivo: '«Zombi pegajoso» no es de su facción (Templarios): es de No muertos',
      corto: 'de otra facción',
    });
    // Uno que crece con el poder lo dice antes que la facción: es lo primero que hay que arreglar.
    const cure = poderDeUnidadBlocker({ faction: 'orkos' }, hechizo('cure'));
    expect(cure?.motivo).toMatch(/«porPoder»/);
    expect(cure?.corto).toBe('crece con el poder');
    // Lo mismo dice la carga, con la unidad delante.
    const cat = catalogoDeHechizos([hechizo('curar'), zombi]);
    expect(hechizosDeUnidadesBlocker([{ ...monje, hechizos: ['zombi_pegajoso'] }], cat)).toBe(
      'la unidad «Monje»: «Zombi pegajoso» no es de su facción (Templarios): es de No muertos',
    );
    // Y el catálogo del juego carga: nadie lleva un poder ajeno.
    expect(hechizosDeUnidadesBlocker(UNIDADES, HECHIZOS_DEL_JUEGO)).toBeNull();
  });
});
