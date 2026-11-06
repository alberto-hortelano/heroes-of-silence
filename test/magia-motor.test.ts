/**
 * La magia en la batalla (06-11-2026, el editor de magia;
 * docs/agents/2026-11-06-editor-de-magia/): cada entrega, cada efecto y cada
 * duración del formato hacen lo que dicen, con hechizos de prueba montados en la
 * batalla (`createBattle(…, hechizos)`). Reglas, no jugabilidad: ninguna cifra se mide.
 */
import { describe, expect, it } from 'vitest';
import { armaduraEnLaPelea } from '../src/core/battle/armas.js';
import {
  activeStack,
  applyAction,
  castBlocker,
  legalActions,
  movimientoBlocker,
  previsionDe,
  stackById,
  stackSpeed,
} from '../src/core/battle/battle.js';
import { danioPorIndividuo, effectiveAttack, effectiveDefense } from '../src/core/battle/damage.js';
import { hechizo } from '../src/core/magia/catalogo.js';
import { de, montar, turnoDeId, vida } from './magia-de-prueba.js';

describe('las entregas', () => {
  it('en contacto: a una casilla del lanzador sí; a dos, no, y lo dice', () => {
    const toque = de('toque', {
      entrega: { tipo: 'contacto' },
      objetivo: 'aliado',
      efectos: [{ tipo: 'cura', cantidad: 3 }],
    });
    const { b } = montar([toque]);
    expect(castBlocker(b, 'attacker', 'toque', 'attacker-0')).toBeNull();
    expect(castBlocker(b, 'attacker', 'toque', 'attacker-1')).toMatch(
      /se lanza en contacto, y eso está a 2 casillas/,
    );
  });

  it('a x casillas: hasta su alcance, y no más', () => {
    const bola = de('bola', { entrega: { tipo: 'alcance', casillas: 4 } });
    const { b } = montar([bola]);
    expect(castBlocker(b, 'attacker', 'bola', 'defender-0')).toBeNull();
    expect(castBlocker(b, 'attacker', 'bola', 'defender-1')).toMatch(
      /llega a 4 casillas, y eso está a 5/,
    );
  });

  it('un proyectil da al primero de la recta, sea de quien sea; «recta», a todos', () => {
    const saeta = de('saeta', {
      entrega: { tipo: 'proyectil' },
      objetivo: 'casilla',
      afecta: 'todos',
    });
    const lanza = de('lanza', {
      entrega: { tipo: 'proyectil' },
      objetivo: 'casilla',
      area: 'recta',
      afecta: 'todos',
    });
    const { b, rng } = montar([saeta, lanza]);
    const aliado = stackById(b, 'attacker-0');
    const antes = vida(aliado);
    // El aliado, en (3,4), está en la recta del héroe al orco de (6,4).
    applyAction(b, { type: 'cast', spell: 'saeta', at: { col: 6, row: 4 } }, rng);
    expect(vida(aliado)).toBeLessThan(antes);
    expect(vida(stackById(b, 'defender-0'))).toBe(stackById(b, 'defender-0').unit.hp);
    // Una por ronda: la previsión del segundo lanza con el motivo del núcleo.
    expect(() => previsionDe(b, { type: 'cast', spell: 'lanza', at: { col: 6, row: 4 } })).toThrow(
      /ya lanzó un hechizo esta ronda/,
    );
  });

  it('«recta» alcanza a todos los de la recta hasta el borde', () => {
    const lanza = de('lanza', {
      entrega: { tipo: 'proyectil' },
      objetivo: 'casilla',
      area: 'recta',
      afecta: 'enemigos',
    });
    const { b } = montar([lanza]);
    const p = previsionDe(b, { type: 'cast', spell: 'lanza', at: { col: 6, row: 4 } });
    if (p?.kind !== 'hechizo') throw new Error('sin previsión');
    expect(p.impactos.map((i) => i.objetivo).sort()).toEqual(['defender-0', 'defender-1']);
  });

  it('un área a una casilla alcanza solo a los que dice «afecta», y cada uno lleva su spell_hit', () => {
    const bola = de('bola', {
      entrega: { tipo: 'alcance', casillas: 6 },
      objetivo: 'casilla',
      area: 1,
      afecta: 'enemigos',
    });
    const { b, rng } = montar([bola], { casillas: { 'attacker-0': { col: 5, row: 4 } } });
    const desde = b.log.length;
    applyAction(b, { type: 'cast', spell: 'bola', at: { col: 6, row: 4 } }, rng);
    const golpes = b.log.slice(desde).filter((e) => e.kind === 'spell_hit');
    // El aliado de (5,4) está en el área pero no es enemigo; el orco de (7,4), también.
    expect(golpes.map((e) => (e.kind === 'spell_hit' ? e.stack : '')).sort()).toEqual([
      'defender-0',
      'defender-1',
    ]);
    expect(vida(stackById(b, 'attacker-0'))).toBe(stackById(b, 'attacker-0').unit.hp);
  });

  it('sobre sí, con área: alrededor de quien lo lanza; al tablero, a todos los que dice', () => {
    const grito = de('grito', {
      entrega: { tipo: 'sobreSi' },
      objetivo: undefined,
      area: 1,
      afecta: 'aliados',
      duracion: { rondas: 2 },
      efectos: [{ tipo: 'cifra', cifra: 'ataque', valor: 2 }],
    });
    const plegaria = de('plegaria', {
      entrega: { tipo: 'tablero' },
      objetivo: undefined,
      afecta: 'enemigos',
      duracion: { rondas: 2 },
      efectos: [{ tipo: 'cifra', cifra: 'defensa', valor: -1 }],
    });
    const { b, rng } = montar([grito, plegaria]);
    expect(legalActions(b).filter((a) => a.type === 'cast' && a.spell === 'grito')).toEqual([
      { type: 'cast', spell: 'grito' },
    ]);
    const lejos = effectiveAttack(stackById(b, 'attacker-1'));
    const cerca = effectiveAttack(stackById(b, 'attacker-0'));
    applyAction(b, { type: 'cast', spell: 'grito' }, rng);
    expect(effectiveAttack(stackById(b, 'attacker-0'))).toBe(cerca + 2);
    expect(effectiveAttack(stackById(b, 'attacker-1'))).toBe(lejos);
    b.heroes.attacker!.castThisRound = false;
    const def = effectiveDefense(stackById(b, 'defender-1'));
    applyAction(b, { type: 'cast', spell: 'plegaria' }, rng);
    expect(effectiveDefense(stackById(b, 'defender-1'))).toBe(def - 1);
  });

  it('lo diferido cae al empezar el siguiente turno de quien lo lanzó, desde donde esté', () => {
    const meteoro = de('meteoro', {
      entrega: { tipo: 'alcance', casillas: 6, diferido: true },
      objetivo: 'casilla',
      area: 0,
      afecta: 'todos',
    });
    const { b, rng } = montar([meteoro]);
    const orco = stackById(b, 'defender-0');
    applyAction(b, { type: 'cast', spell: 'meteoro', at: orco.hex }, rng);
    expect(b.log.at(-1)).toMatchObject({ kind: 'cast', spell: 'meteoro', diferido: true });
    expect(vida(orco)).toBe(orco.unit.hp);
    expect(stackById(b, 'attacker-heroe').hechizoEnElAire).toMatchObject({ hechizo: 'meteoro' });
    // Hasta que le toca al héroe otra vez, no cae; el orco se queda quieto.
    turnoDeId(b, 'attacker-heroe', rng);
    if (
      activeStack(b)?.id === 'attacker-heroe' &&
      stackById(b, 'attacker-heroe').hechizoEnElAire !== null
    ) {
      applyAction(b, { type: 'end_turn' }, rng);
      turnoDeId(b, 'attacker-heroe', rng);
    }
    expect(stackById(b, 'attacker-heroe').hechizoEnElAire).toBeNull();
    expect(b.log.some((e) => e.kind === 'spell_hit' && e.spell === 'meteoro')).toBe(true);
  });
});

describe('los efectos', () => {
  it('el daño sin armadura llega entero; con ella, la armadura lo para', () => {
    const con = de('con', {});
    const sin = de('sin', { efectos: [{ tipo: 'danio', cantidad: 10, armadura: false }] });
    const { b } = montar([con, sin]);
    const orco = stackById(b, 'defender-0');
    const a = armaduraEnLaPelea(orco);
    expect(a).toBeGreaterThan(0);
    const pCon = previsionDe(b, { type: 'cast', spell: 'con', target: orco.id });
    const pSin = previsionDe(b, { type: 'cast', spell: 'sin', target: orco.id });
    if (pCon?.kind !== 'hechizo' || pSin?.kind !== 'hechizo') throw new Error('sin previsión');
    expect(pSin.impactos[0]?.danio).toBe(10);
    expect(pCon.impactos[0]?.danio).toBe(Math.max(0, 10 - a));
  });

  it('las cifras se suman al leer: fuerza (daño), agilidad (defensa y casillas), armadura', () => {
    const toro = de('toro', {
      objetivo: 'aliado',
      duracion: { rondas: 3 },
      efectos: [
        { tipo: 'cifra', cifra: 'fuerza', valor: 2 },
        { tipo: 'cifra', cifra: 'agilidad', valor: 1 },
        { tipo: 'cifra', cifra: 'armadura', valor: 3 },
      ],
    });
    const { b, rng } = montar([toro]);
    const s = stackById(b, 'attacker-1');
    const [lo, hi] = danioPorIndividuo(s);
    const def = effectiveDefense(s);
    const casillas = stackSpeed(s);
    const armadura = armaduraEnLaPelea(s);
    applyAction(b, { type: 'cast', spell: 'toro', target: s.id }, rng);
    const ag = Math.floor(hi / lo);
    expect(danioPorIndividuo(s)).toEqual([lo + 2, (lo + 2) * (ag + 1)]);
    expect(effectiveDefense(s)).toBe(def + 1);
    expect(stackSpeed(s)).toBe(casillas + 1);
    expect(armaduraEnLaPelea(s)).toBe(armadura + 3);
  });

  it('la cura no pasa de la vida del de arriba', () => {
    const cura = de('cura', { objetivo: 'aliado', efectos: [{ tipo: 'cura', cantidad: 50 }] });
    const { b, rng } = montar([cura]);
    const s = stackById(b, 'attacker-1');
    s.topHp = s.unit.hp - 4;
    applyAction(b, { type: 'cast', spell: 'cura', target: s.id }, rng);
    expect(s.topHp).toBe(s.unit.hp);
  });

  it('el escudo se come el daño tras la armadura y, agotado, se va', () => {
    const escudo = de('escudo', {
      objetivo: 'aliado',
      duracion: 'pelea',
      efectos: [{ tipo: 'escudo', absorbe: 5 }],
    });
    const rayo = de('rayo', {
      objetivo: 'cualquiera',
      efectos: [{ tipo: 'danio', cantidad: 3, armadura: false }],
    });
    const { b, rng } = montar([escudo, rayo]);
    const s = stackById(b, 'attacker-1');
    applyAction(b, { type: 'cast', spell: 'escudo', target: s.id }, rng);
    b.heroes.attacker!.castThisRound = false;
    const antes = vida(s);
    applyAction(b, { type: 'cast', spell: 'rayo', target: s.id }, rng);
    expect(vida(s)).toBe(antes);
    expect(s.effects.find((e) => e.kind === 'escudo')).toMatchObject({ queda: 2 });
    b.heroes.attacker!.castThisRound = false;
    applyAction(b, { type: 'cast', spell: 'rayo', target: s.id }, rng);
    expect(vida(s)).toBe(antes - 1);
    expect(s.effects.some((e) => e.kind === 'escudo')).toBe(false);
  });

  it('impide: moverse, golpear, lanzar; los botones lo dicen con el nombre del hechizo', () => {
    const raices = de('raices', {
      objetivo: 'cualquiera',
      duracion: { rondas: 2 },
      efectos: [{ tipo: 'impide', que: ['moverse', 'golpear', 'lanzar'] }],
    });
    const { b, rng } = montar([raices]);
    turnoDeId(b, 'attacker-0', rng);
    const activa = activeStack(b)!;
    applyAction(b, { type: 'cast', spell: 'raices', target: activa.id }, rng);
    const acciones = legalActions(b);
    expect(acciones.some((a) => a.type === 'move' || a.type === 'attack')).toBe(false);
    expect(movimientoBlocker(b, { col: 0, row: 0 })).toMatch(/no puede moverse \(raices\)/);
    // Sobre el cuerpo del héroe, su libro se cierra.
    b.heroes.attacker!.castThisRound = false;
    applyAction(b, { type: 'cast', spell: 'raices', target: 'attacker-heroe' }, rng);
    b.heroes.attacker!.castThisRound = false;
    expect(castBlocker(b, 'attacker', 'raices')).toMatch(/no puede lanzar ni usar poderes/);
  });

  it('disipar quita lo que echó el bando contrario, y nada más', () => {
    const maldicion = de('maldicion', {
      objetivo: 'cualquiera',
      duracion: 'pelea',
      efectos: [{ tipo: 'cifra', cifra: 'ataque', valor: -2 }],
    });
    const disipar = de('disipar', {
      objetivo: 'cualquiera',
      efectos: [{ tipo: 'disipar', de: 'contrarios' }],
    });
    const { b, rng } = montar([maldicion, disipar]);
    const orco = stackById(b, 'defender-0');
    applyAction(b, { type: 'cast', spell: 'maldicion', target: orco.id }, rng);
    expect(orco.effects).toHaveLength(1);
    // Lo echó el atacante: para el orco es de los propios… del contrario.
    b.heroes.attacker!.castThisRound = false;
    applyAction(b, { type: 'cast', spell: 'disipar', target: orco.id }, rng);
    expect(orco.effects).toHaveLength(0);
    // Y sobre uno propio con lo suyo encima, «contrarios» no quita nada.
    const s = stackById(b, 'attacker-1');
    b.heroes.attacker!.castThisRound = false;
    applyAction(b, { type: 'cast', spell: 'maldicion', target: s.id }, rng);
    b.heroes.attacker!.castThisRound = false;
    applyAction(b, { type: 'cast', spell: 'disipar', target: s.id }, rng);
    expect(s.effects).toHaveLength(1);
  });
});

describe('las duraciones', () => {
  it('«hasta que empiece el turno de quien lo lanzó»: se va cuando le toca al lanzador', () => {
    const desarme = de('desarme', {
      objetivo: 'enemigo',
      duracion: { hasta: 'empezar', turnoDe: 'lanzador' },
      efectos: [{ tipo: 'impide', que: ['golpear'] }],
    });
    const { b, rng } = montar([desarme]);
    const orco = stackById(b, 'defender-0');
    applyAction(b, { type: 'cast', spell: 'desarme', target: orco.id }, rng);
    expect(orco.effects[0]).toMatchObject({
      kind: 'impide',
      hasta: { al: 'empezar', de: 'attacker-heroe' },
    });
    turnoDeId(b, 'attacker-heroe', rng);
    if (activeStack(b)?.id === 'attacker-heroe' && orco.effects.length > 0) {
      // Si el héroe ya tenía el turno al lanzarlo, es el siguiente.
      applyAction(b, { type: 'end_turn' }, rng);
      turnoDeId(b, 'attacker-heroe', rng);
    }
    expect(orco.effects).toHaveLength(0);
  });

  it('«se acaba si muere el lanzador»: cae el lanzador y se va lo que dejó', () => {
    const marca = de('marca', {
      objetivo: 'enemigo',
      duracion: 'pelea',
      seAcabaSiMuere: 'lanzador',
      efectos: [{ tipo: 'cifra', cifra: 'defensa', valor: -2 }],
    });
    const rayo = de('rayo', {
      objetivo: 'cualquiera',
      efectos: [{ tipo: 'danio', cantidad: 999, armadura: false }],
    });
    const { b, rng } = montar([marca, rayo]);
    const orco = stackById(b, 'defender-0');
    applyAction(b, { type: 'cast', spell: 'marca', target: orco.id }, rng);
    expect(orco.effects).toHaveLength(1);
    expect(orco.effects[0]).toMatchObject({ seAcabaSiMuere: 'attacker-heroe', roundsLeft: 100 });
    // Si cae quien lo lanzó (el cuerpo del héroe), la batalla se acaba; el efecto se
    // va antes, con su muerte.
    b.heroes.attacker!.castThisRound = false;
    applyAction(b, { type: 'cast', spell: 'rayo', target: 'attacker-heroe' }, rng);
    expect(orco.effects).toHaveLength(0);
    expect(b.log.some((e) => e.kind === 'effect_end' && e.stack === orco.id)).toBe(true);
  });
});

describe('los hechizos de antes, como siempre', () => {
  it('Flecha mágica: el hecho de siempre, con su daño', () => {
    const { b, rng } = montar([hechizo('magic_arrow')]);
    const orco = stackById(b, 'defender-0');
    applyAction(b, { type: 'cast', spell: 'magic_arrow', target: orco.id }, rng);
    const c = b.log.find((e) => e.kind === 'cast');
    expect(c).toMatchObject({
      kind: 'cast',
      side: 'attacker',
      spell: 'magic_arrow',
      target: orco.id,
    });
    expect(c && 'damage' in c ? c.damage : 0).toBeGreaterThan(0);
  });
});
