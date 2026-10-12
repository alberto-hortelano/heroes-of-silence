/**
 * La muralla alta (`docs/agents/2026-10-09-muralla-alta/`): el muro es otro
 * nivel. Lo que cambia con él —la línea de tiro, el cuerpo a cuerpo, el trabado,
 * la defensa del tirador de arriba, la escalera y el rasgo `escalar`—, la IA que
 * sube y escala, y lo que el cliente hace con ello: la figura subida, el clic en
 * lo alto de la columna y los botones de la arena.
 */
import { describe, expect, it } from 'vitest';
import { BattleAnimator } from '../src/client/anim.js';
import { renderBando, renderMuralla, renderPanelDeBatalla } from '../src/client/arena/paneles.js';
import { EscenaBatalla } from '../src/client/escenas/batalla.js';
import { marcadoDe } from '../src/client/html.js';
import { alturaDeColumna, alzadoDeLaMuralla, cajaDeFigura } from '../src/client/render/batalla.js';
import { centroHex, hexEnPixel, planoDeHex, tableroPara } from '../src/client/render/proyeccion.js';
import { autoResolve, chooseBattleAction } from '../src/core/ai/tactics.js';
import { escaleraDeArenaBlocker } from '../src/core/arena.js';
import {
  COMENTARIO_DEL_BORRADOR_DE_MURALLAS,
  FORMAS_DE_EJEMPLO,
  REGLA_DE_LA_MURALLA,
} from '../src/core/arena-murallas.js';
import {
  applyAction,
  ataqueBlocker,
  type BattleSide,
  canReachMelee,
  createBattle,
  escalaBlocker,
  escaleraBlocker,
  isEngaged,
  legalActions,
  MAX_ROUNDS,
  mismoTurno,
  movimientoBlocker,
  opcionesDeDanio,
  stackById,
  subirBlocker,
  tiroBlocker,
} from '../src/core/battle/battle.js';
import { hexKey, lineaLibre } from '../src/core/battle/board.js';
import { computeDamage, effectiveDefense, expectedDamage } from '../src/core/battle/damage.js';
import {
  bonoEnLoAlto,
  enLoAlto,
  esMuro,
  hayLinea,
  type MurallaDeBatalla,
  puertasAlEmpezar,
  validarMuralla,
} from '../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO } from '../src/core/battle/reglas.js';
import type { BattleAction, BattleState } from '../src/core/battle/types.js';
import { LIDERAZGO, MURALLA } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack } from '../src/core/types.js';
import {
  abrirPuertas,
  aPelear,
  forzarTurno,
  peleaDeArena,
  sesionDeArena,
  unidadDeArena,
} from './helpers.js';

const forma = (nombre: string): MurallaDeBatalla => {
  const f = FORMAS_DE_EJEMPLO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay forma de ejemplo «${nombre}»`);
  return f.muralla;
};

/** La columna 7 entera, y la misma con la puerta en (7,4). */
const LINEA = forma('Línea recta');
const CON_PUERTA = forma('Línea con puerta');

const lado = (army: readonly Stack[]): BattleSide => ({ army, hero: null });

/** Les da escalera a los atacantes de esos puestos, como la casilla del montaje. */
function conEscalera(state: BattleState, ...puestos: number[]): void {
  for (const i of puestos) stackById(state, `attacker-${i}`).escalera = true;
}

/**
 * Uno contra uno de catálogo, cada uno donde diga el test y con el turno de
 * quien diga. `escalera`: si el atacante la lleva.
 */
function duelo(
  muralla: MurallaDeBatalla,
  atacante: string,
  en: Hex,
  defensor: string,
  enDefensor: Hex,
  turnoDe: 'attacker-0' | 'defender-0' = 'attacker-0',
  { escalera = false, cuantos = 3 }: { escalera?: boolean; cuantos?: number } = {},
): BattleState {
  const state = createBattle(
    lado([{ creature: atacante, count: cuantos }]),
    lado([{ creature: defensor, count: cuantos }]),
    createRng(3),
    muralla,
  );
  if (escalera) conEscalera(state, 0);
  stackById(state, 'attacker-0').hex = en;
  stackById(state, 'defender-0').hex = enDefensor;
  // Sin moral: un turno extra por la buena hace que «cierra el turno» no se vea.
  for (const s of state.stacks) s.morale = 0;
  forzarTurno(state, turnoDe);
  return state;
}

const tipos = (acciones: readonly BattleAction[]): string[] => acciones.map((a) => a.type);

describe('la línea de tiro', () => {
  it('en el suelo nadie dispara a través del muro', () => {
    const state = duelo(
      LINEA,
      'swordsman',
      { col: 5, row: 4 },
      'archer',
      { col: 9, row: 4 },
      'defender-0',
    );
    const d = stackById(state, 'defender-0');
    const a = stackById(state, 'attacker-0');
    expect(tiroBlocker(state, d, a)).toBe('el muro está en medio');
    expect(tipos(legalActions(state))).not.toContain('shoot');
    expect(ataqueBlocker(state, 'attacker-0')).toBe(
      'el muro está en medio, y no alcanza a esa unidad cuerpo a cuerpo este turno',
    );
    expect(() => applyAction(state, { type: 'shoot', target: 'attacker-0' }, createRng(1))).toThrow(
      'defender-0 no puede disparar a attacker-0: el muro está en medio',
    );
  });

  it('desde lo alto sí', () => {
    const state = duelo(
      LINEA,
      'swordsman',
      { col: 3, row: 4 },
      'archer',
      { col: 7, row: 2 },
      'defender-0',
    );
    expect(enLoAlto(state, stackById(state, 'defender-0'))).toBe(true);
    expect(legalActions(state)).toContainEqual({ type: 'shoot', target: 'attacker-0' });
  });

  it('al de lo alto, también: los de fuera le disparan', () => {
    const state = duelo(LINEA, 'archer', { col: 3, row: 4 }, 'swordsman', { col: 7, row: 6 });
    expect(legalActions(state)).toContainEqual({ type: 'shoot', target: 'defender-0' });
    // Y al que está en el suelo detrás de la columna, no.
    stackById(state, 'defender-0').hex = { col: 9, row: 4 };
    expect(legalActions(state)).not.toContainEqual({ type: 'shoot', target: 'defender-0' });
  });

  it('a través de la puerta cerrada tampoco; de la abierta, sí (C20)', () => {
    const state = duelo(CON_PUERTA, 'archer', { col: 4, row: 4 }, 'swordsman', { col: 9, row: 4 });
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    expect(tiroBlocker(state, a, d)).toBe('la puerta cerrada está en medio');
    abrirPuertas(state);
    expect(tiroBlocker(state, a, d)).toBeNull();
    expect(legalActions(state)).toContainEqual({ type: 'shoot', target: 'defender-0' });
    // Abierta, la puerta no le quita al muro lo suyo: por la fila de al lado, muro.
    d.hex = { col: 9, row: 2 };
    a.hex = { col: 4, row: 2 };
    expect(tiroBlocker(state, a, d)).toBe('el muro está en medio');
  });

  it('la recta es de casillas enteras, sin los extremos', () => {
    const muro = new Set(['5,4']);
    expect(lineaLibre({ col: 0, row: 4 }, { col: 10, row: 4 }, muro)).toBe(false);
    expect(lineaLibre({ col: 0, row: 3 }, { col: 10, row: 3 }, muro)).toBe(true);
    // Los extremos no cuentan: quien tira o recibe en una casilla cerrada no se tapa a sí mismo.
    expect(lineaLibre({ col: 5, row: 4 }, { col: 9, row: 4 }, muro)).toBe(true);
    expect(lineaLibre({ col: 4, row: 4 }, { col: 5, row: 4 }, muro)).toBe(true);
    // Una diagonal que pasa por (5,4): de (3,0) a (7,8) en odd-r.
    expect(lineaLibre({ col: 3, row: 0 }, { col: 7, row: 8 }, new Set(['5,4']))).toBe(false);
  });

  it('un fuerte contra el borde no se dispara por la casilla que falta (QA I1, 12-10-2026)', () => {
    // El fuerte de la esquina de abajo a la derecha, dibujable en el editor:
    // fila 5 de la columna 5 a la 10 y la columna 5 abajo. Andando, desde
    // (11,4) no se entra: sus vecinas de abajo son (10,5), muro, y el hueco
    // (11,5). Con la casilla de fuera «saltada», el rayo que rozaba el marco
    // por el hueco pasaba y (11,4)→(11,6) y (11,4)→(11,8) daban tiro; fuera
    // cuenta como tapado (decisión del usuario), así que decide (10,5).
    const fuerte = validarMuralla({
      muros: [
        ...[5, 6, 7, 8, 9, 10].map((col) => ({ col, row: 5 })),
        { col: 5, row: 6 },
        { col: 5, row: 7 },
        { col: 5, row: 8 },
      ],
      puertas: [],
    });
    const p = puertasAlEmpezar(fuerte);
    expect(hayLinea(fuerte, p, { col: 11, row: 4 }, { col: 11, row: 6 })).toBe(false);
    expect(hayLinea(fuerte, p, { col: 11, row: 4 }, { col: 11, row: 8 })).toBe(false);
    expect(hayLinea(fuerte, p, { col: 10, row: 4 }, { col: 10, row: 6 })).toBe(false);
    // Dentro del fuerte, sí: entre dos casillas del suelo sin muro en medio.
    expect(hayLinea(fuerte, p, { col: 11, row: 6 }, { col: 11, row: 8 })).toBe(true);
  });

  it('sin muralla, siempre hay tiro', () => {
    const state = duelo(
      validarMuralla({ muros: [], puertas: [] }),
      'archer',
      { col: 0, row: 4 },
      'swordsman',
      { col: 10, row: 4 },
    );
    expect(tiroBlocker(state, stackById(state, 'attacker-0'), stackById(state, 'defender-0'))).toBe(
      null,
    );
  });
});

describe('el cuerpo a cuerpo, solo al mismo nivel', () => {
  it('del suelo no se golpea a quien está arriba', () => {
    const state = duelo(LINEA, 'swordsman', { col: 6, row: 4 }, 'pikeman', { col: 7, row: 4 });
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    expect(canReachMelee(state, a, d)).toBe(false);
    expect(
      legalActions(state).filter((x) => x.type === 'attack' && x.target === 'defender-0'),
    ).toEqual([]);
    expect(ataqueBlocker(state, 'defender-0')).toBe(
      'no alcanza a esa unidad cuerpo a cuerpo este turno',
    );
  });

  it('al que señala una columna ocupada se le dice quién está, no que es grande', () => {
    const state = duelo(LINEA, 'swordsman', { col: 6, row: 4 }, 'archer', { col: 7, row: 4 });
    expect(movimientoBlocker(state, { col: 7, row: 4 })).toBe('ahí está Arquero');
  });

  it('arriba, los dos en el muro, sí', () => {
    const state = duelo(LINEA, 'swordsman', { col: 7, row: 3 }, 'pikeman', { col: 7, row: 4 });
    expect(legalActions(state)).toContainEqual({ type: 'attack', target: 'defender-0' });
  });

  it('el que baja a golpear sale de una casilla de su nivel', () => {
    // El piquero defensor está arriba y el espadachín en el suelo, dentro: las
    // casillas desde las que se le golpea son del suelo, nunca un muro.
    const state = duelo(
      LINEA,
      'swordsman',
      { col: 9, row: 4 },
      'pikeman',
      { col: 7, row: 4 },
      'defender-0',
    );
    const desdes = legalActions(state).flatMap((x) =>
      x.type === 'attack' && x.from !== undefined ? [x.from] : [],
    );
    expect(desdes.length).toBeGreaterThan(0);
    for (const h of desdes) expect(h.col, hexKey(h)).not.toBe(7);
  });

  it('un tirador en lo alto con un enemigo al pie no está trabado; con uno arriba, sí', () => {
    const state = duelo(
      LINEA,
      'swordsman',
      { col: 6, row: 4 },
      'archer',
      { col: 7, row: 4 },
      'defender-0',
    );
    const d = stackById(state, 'defender-0');
    expect(isEngaged(state, d)).toBe(false);
    expect(legalActions(state)).toContainEqual({ type: 'shoot', target: 'attacker-0' });
    stackById(state, 'attacker-0').hex = { col: 7, row: 3 };
    expect(isEngaged(state, d)).toBe(true);
    expect(tipos(legalActions(state))).not.toContain('shoot');
  });
});

describe('la defensa del tirador en lo alto', () => {
  it(`suma ${MURALLA.defensaEnLoAlto} a su defensa, y solo si tira`, () => {
    const state = duelo(LINEA, 'swordsman', { col: 3, row: 4 }, 'archer', { col: 7, row: 4 });
    const arquero = stackById(state, 'defender-0');
    const espada = stackById(state, 'attacker-0');
    expect(MURALLA.defensaEnLoAlto).toBeGreaterThan(0);
    const bono = bonoEnLoAlto(state, arquero);
    expect(bono).toBe(MURALLA.defensaEnLoAlto);
    expect(effectiveDefense(arquero, REGLAS_DEL_JUEGO, bono)).toBe(
      arquero.unit.defense + MURALLA.defensaEnLoAlto,
    );
    expect(effectiveDefense(arquero, REGLAS_DEL_JUEGO)).toBe(arquero.unit.defense);
    // Lo pone `opcionesDeDanio`, la única forma de montar las opciones del daño:
    // así lo cuentan a la vez el golpe, la IA y la previsión.
    expect(opcionesDeDanio(state, espada, arquero).bonoEnLoAlto).toBe(bono);
    // La IA lo hereda por `expectedDamage`.
    expect(expectedDamage(espada, arquero, opcionesDeDanio(state, espada, arquero))).toBeLessThan(
      expectedDamage(espada, arquero, { reglas: REGLAS_DEL_JUEGO }),
    );
    // El que no tira, arriba, no suma; ni el tirador en el suelo.
    espada.hex = { col: 7, row: 3 };
    expect(bonoEnLoAlto(state, espada)).toBe(0);
    arquero.hex = { col: 9, row: 4 };
    expect(bonoEnLoAlto(state, arquero)).toBe(0);
  });

  it('el disparo que le llega arriba cobra con esa defensa', () => {
    const muro = validarMuralla({ muros: [{ col: 6, row: 1 }], puertas: [] });
    const state = duelo(
      muro,
      'archer',
      { col: 2, row: 1 },
      'archer',
      { col: 6, row: 1 },
      'attacker-0',
      { cuantos: 12 },
    );
    const tirador = stackById(state, 'attacker-0');
    const blanco = stackById(state, 'defender-0');
    const con = (alto: boolean): number =>
      computeDamage(tirador, blanco, createRng(9), {
        reglas: REGLAS_DEL_JUEGO,
        ranged: true,
        distance: 4,
        bonoEnLoAlto: alto ? MURALLA.defensaEnLoAlto : 0,
      }).damage;
    expect(con(true)).toBeLessThan(con(false));
    applyAction(state, { type: 'shoot', target: 'defender-0' }, createRng(9));
    const tiro = state.log.find((e) => e.kind === 'shoot');
    expect(tiro?.kind === 'shoot' && tiro.damage).toBe(con(true));
  });
});

describe('la escalera', () => {
  /** Un espadachín con escalera al pie de (7,4), y un arquero lejos. */
  const alPie = (): BattleState =>
    duelo(LINEA, 'swordsman', { col: 6, row: 4 }, 'archer', { col: 10, row: 0 }, 'attacker-0', {
      escalera: true,
    });

  it('un turno ponerla, otro subir, y al subir no hace nada más', () => {
    const state = alPie();
    const a = stackById(state, 'attacker-0');
    expect(a.escalera).toBe(true);
    const muro = { col: 7, row: 4 };
    // Delante de `defend`, y sin subir aún: no hay escalera puesta ni sabe escalar.
    const legales = legalActions(state);
    expect(legales[0]).toEqual({ type: 'poner_escalera', muro });
    expect(tipos(legales)).not.toContain('subir');
    expect(subirBlocker(state, muro)).toBe(
      'no hay escalera puesta: primero hay que ponerla (un turno), y subir es el siguiente',
    );

    applyAction(state, { type: 'poner_escalera', muro }, createRng(1));
    expect(state.escaleras).toEqual([{ pie: { col: 6, row: 4 }, muro }]);
    expect(a.escalera).toBe(false);
    expect(state.log.filter((e) => e.kind === 'ladder_placed')).toEqual([
      { kind: 'ladder_placed', stack: 'attacker-0', pie: { col: 6, row: 4 }, muro },
    ]);
    // Ponerla es el turno entero.
    expect(state.turno?.stack).not.toBe('attacker-0');

    forzarTurno(state, 'attacker-0');
    const turnoDeSubir = state.turno;
    expect(legalActions(state)).toContainEqual({ type: 'subir', muro });
    // La escalera ya no va a cuestas: no se pone otra.
    expect(escaleraBlocker(state, muro)).toBe('no lleva escalera');
    applyAction(state, { type: 'subir', muro }, createRng(1));
    expect(a.hex).toEqual(muro);
    expect(enLoAlto(state, a)).toBe(true);
    expect(state.log.filter((e) => e.kind === 'climbed')).toEqual([
      { kind: 'climbed', stack: 'attacker-0', from: { col: 6, row: 4 }, to: muro },
    ]);
    // El turno se cerró: el que haya ahora es otro (aquí, la ronda siguiente).
    expect(mismoTurno(turnoDeSubir, state.turno)).toBe(false);
    expect(state.log.at(-1)?.kind).not.toBe('attack');
  });

  it('al subir no golpea aunque tenga al lado a uno arriba', () => {
    const state = alPie();
    state.escaleras.push({ pie: { col: 6, row: 4 }, muro: { col: 7, row: 4 } });
    stackById(state, 'defender-0').hex = { col: 7, row: 3 };
    const golpesAntes = state.log.filter((e) => e.kind === 'attack').length;
    applyAction(state, { type: 'subir', muro: { col: 7, row: 4 } }, createRng(1));
    expect(state.turno?.stack).not.toBe('attacker-0');
    expect(state.log.filter((e) => e.kind === 'attack' && e.stack === 'attacker-0').length).toBe(
      golpesAntes,
    );
  });

  it('sin moverse antes: quien llega al pie sube en el turno siguiente', () => {
    const state = alPie();
    forzarTurno(state, 'attacker-0', 1);
    const tipos2 = tipos(legalActions(state));
    expect(tipos2).not.toContain('poner_escalera');
    expect(tipos2).not.toContain('subir');
    expect(escaleraBlocker(state, { col: 7, row: 4 })).toBe(
      'ya se ha movido este turno: se llega al pie y se sube en el turno siguiente',
    );
    expect(() =>
      applyAction(state, { type: 'poner_escalera', muro: { col: 7, row: 4 } }, createRng(1)),
    ).toThrow('attacker-0 no puede poner la escalera: ya se ha movido este turno');
  });

  it('la escalera puesta se queda para otros atacantes', () => {
    const state = createBattle(
      lado([
        { creature: 'swordsman', count: 2 },
        { creature: 'pikeman', count: 2 },
      ]),
      lado([{ creature: 'archer', count: 2 }]),
      createRng(3),
      LINEA,
    );
    conEscalera(state, 0);
    const pie = { col: 6, row: 4 };
    const muro = { col: 7, row: 4 };
    stackById(state, 'attacker-0').hex = pie;
    stackById(state, 'attacker-1').hex = { col: 4, row: 4 };
    stackById(state, 'defender-0').hex = { col: 10, row: 0 };
    forzarTurno(state, 'attacker-0');
    applyAction(state, { type: 'poner_escalera', muro }, createRng(1));
    // El primero se va a otro sitio; el piquero, sin escalera, llega al pie y sube por ella.
    stackById(state, 'attacker-0').hex = { col: 2, row: 8 };
    stackById(state, 'attacker-1').hex = pie;
    forzarTurno(state, 'attacker-1');
    expect(stackById(state, 'attacker-1').escalera).toBe(false);
    expect(legalActions(state)).toContainEqual({ type: 'subir', muro });
    // Desde otro pie del mismo muro, no: la escalera es de ese pie y ese muro.
    stackById(state, 'attacker-1').hex = { col: 6, row: 3 };
    expect(subirBlocker(state, muro)).toBe('no hay escalera puesta ahí y no sabe escalar');
  });

  it('dice por qué no a quien no puede', () => {
    const state = alPie();
    const muro = { col: 7, row: 4 };
    expect(subirBlocker(state, { col: 5, row: 4 })).toBe('en (5,4) no hay muro');
    expect(escaleraBlocker(state, { col: 7, row: 1 })).toBe('no está al pie de ese muro');
    stackById(state, 'defender-0').hex = muro;
    state.escaleras.push({ pie: { col: 6, row: 4 }, muro });
    expect(subirBlocker(state, muro)).toBe('en ese muro está Arquero');
    forzarTurno(state, 'defender-0');
    expect(subirBlocker(state, { col: 7, row: 3 })).toBe(
      'quien defiende sube a la muralla andando',
    );
    expect(escalaBlocker(state, 'subir')).toBe('quien defiende sube a la muralla andando');
  });

  it('la grande y el volador no escalan', () => {
    const grande = duelo(LINEA, 'bone_dragon', { col: 6, row: 4 }, 'archer', { col: 10, row: 0 });
    expect(subirBlocker(grande, { col: 7, row: 4 })).toBe(
      'una unidad de dos casillas no sube a la muralla',
    );
    const volador = duelo(LINEA, 'vampire', { col: 6, row: 4 }, 'archer', { col: 10, row: 0 });
    expect(subirBlocker(volador, { col: 7, row: 4 })).toBe(
      'vuela: se posa en la muralla sin escalera',
    );
  });

  it('la escalera del montaje solo llega a quien puede ponerla', () => {
    const conLaSuya = (unidad: ReturnType<typeof unidadDeArena>) => ({ unidad, escalera: true });
    const state = peleaDeArena(
      [
        conLaSuya(unidadDeArena('zombi')),
        conLaSuya(unidadDeArena('zombi', { hexes: 2 })),
        conLaSuya(unidadDeArena('zombi', { traits: ['flying'] })),
      ],
      [conLaSuya(unidadDeArena('zombi'))],
      createRng(1),
      LINEA,
    );
    // El de una casilla que anda, sí; la grande, el volador y el defensor, no.
    expect(state.stacks.map((s) => [s.id, s.escalera])).toEqual([
      ['attacker-0', true],
      ['attacker-1', false],
      ['attacker-2', false],
      ['defender-0', false],
    ]);
  });
});

describe('el rasgo escalar', () => {
  it('sube en un turno, sin escalera', () => {
    const trepa = unidadDeArena('zombi', { traits: ['escalar'] });
    const state = peleaDeArena(
      aPelear([trepa]),
      aPelear([unidadDeArena('zombi')]),
      createRng(1),
      LINEA,
    );
    stackById(state, 'attacker-0').hex = { col: 6, row: 4 };
    stackById(state, 'defender-0').hex = { col: 10, row: 0 };
    forzarTurno(state, 'attacker-0');
    expect(legalActions(state)[0]).toEqual({ type: 'subir', muro: { col: 7, row: 4 } });
    expect(tipos(legalActions(state))).not.toContain('poner_escalera');
    applyAction(state, { type: 'subir', muro: { col: 7, row: 4 } }, createRng(1));
    expect(stackById(state, 'attacker-0').hex).toEqual({ col: 7, row: 4 });
  });
});

describe('la IA con la muralla alta', () => {
  it('el atacante sin camino escala: va al pie, pone la escalera y sube', () => {
    const state = createBattle(
      lado([
        { creature: 'swordsman', count: 3 },
        { creature: 'pikeman', count: 3 },
      ]),
      lado([{ creature: 'archer', count: 3 }]),
      createRng(5),
      LINEA,
    );
    conEscalera(state, 0, 1);
    autoResolve(state, createRng(5));
    expect(state.finished).not.toBeNull();
    expect(state.round).toBeLessThan(MAX_ROUNDS);
    const kinds = state.log.map((e) => e.kind);
    expect(kinds).toContain('ladder_placed');
    expect(kinds).toContain('climbed');
    expect(kinds.indexOf('ladder_placed')).toBeLessThan(kinds.indexOf('climbed'));
  });

  it('el que sabe escalar sube sin escalera', () => {
    const trepa = unidadDeArena('zombi', { traits: ['escalar'] });
    // Defensores de dos casillas: no suben, así que no salen a buscarle por arriba.
    const grande = unidadDeArena('zombi', { hexes: 2 });
    const state = peleaDeArena(
      aPelear([trepa, trepa]),
      aPelear([grande, grande]),
      createRng(2),
      LINEA,
    );
    autoResolve(state, createRng(2));
    expect(state.finished).not.toBeNull();
    const kinds = state.log.map((e) => e.kind);
    expect(kinds).toContain('climbed');
    expect(kinds).not.toContain('ladder_placed');
  });

  it('la grande no va a por una escalera puesta: no podría subir por ella', () => {
    const state = peleaDeArena(
      aPelear([unidadDeArena('zombi', { hexes: 2 })]),
      aPelear([unidadDeArena('zombi')]),
      createRng(1),
      LINEA,
    );
    stackById(state, 'attacker-0').hex = { col: 2, row: 4 };
    stackById(state, 'defender-0').hex = { col: 10, row: 4 };
    state.escaleras.push({ pie: { col: 6, row: 4 }, muro: { col: 7, row: 4 } });
    forzarTurno(state, 'attacker-0');
    // Antes de la regla única de la escala andaba hacia el pie de la escalera.
    expect(chooseBattleAction(state)).toEqual({ type: 'defend' });
  });

  it('el atacante al pie con escalera la pone, y el que puede subir sube', () => {
    const state = duelo(
      LINEA,
      'swordsman',
      { col: 6, row: 4 },
      'archer',
      { col: 10, row: 0 },
      'attacker-0',
      {
        escalera: true,
      },
    );
    expect(chooseBattleAction(state)).toEqual({
      type: 'poner_escalera',
      muro: { col: 7, row: 4 },
    });
    state.escaleras.push({ pie: { col: 6, row: 4 }, muro: { col: 7, row: 4 } });
    stackById(state, 'attacker-0').escalera = false;
    expect(chooseBattleAction(state)).toEqual({ type: 'subir', muro: { col: 7, row: 4 } });
  });

  it('el tirador que defiende sube al muro, y arriba se queda tras subir', () => {
    const state = duelo(
      LINEA,
      'swordsman',
      { col: 2, row: 4 },
      'archer',
      { col: 8, row: 4 },
      'defender-0',
    );
    const accion = chooseBattleAction(state);
    expect(accion.type).toBe('move');
    if (accion.type !== 'move') throw new Error('esperaba un move');
    expect(accion.to.col).toBe(7);
    // Ya arriba y con el tramo gastado: cierra el turno, no baja a por nadie.
    stackById(state, 'defender-0').hex = accion.to;
    forzarTurno(state, 'defender-0', 1);
    expect(chooseBattleAction(state)).toEqual({ type: 'end_turn' });
    // Al turno siguiente, dispara desde arriba.
    forzarTurno(state, 'defender-0');
    expect(chooseBattleAction(state)).toEqual({ type: 'shoot', target: 'attacker-0' });
  });
});

describe('el cliente', () => {
  it('la figura de lo alto se pinta subida lo que mide la columna', () => {
    const t = tableroPara(1280, 720);
    const state = duelo(LINEA, 'swordsman', { col: 6, row: 4 }, 'archer', { col: 7, row: 4 });
    const s = stackById(state, 'defender-0');
    const en = planoDeHex(s.hex);
    expect(cajaDeFigura(t, s, en, 1).suelo).toBeCloseTo(
      cajaDeFigura(t, s, en, 0).suelo - alturaDeColumna(t),
    );
  });

  it('el animador sube a la figura al trepar, de 0 a 1', () => {
    const state = duelo(
      LINEA,
      'swordsman',
      { col: 6, row: 4 },
      'archer',
      { col: 10, row: 0 },
      'attacker-0',
      { escalera: true },
    );
    state.escaleras.push({ pie: { col: 6, row: 4 }, muro: { col: 7, row: 4 } });
    const anim = new BattleAnimator();
    anim.observe(state);
    anim.tick(0);
    const a = stackById(state, 'attacker-0');
    expect(anim.figura(a).elevacion).toBe(0);
    applyAction(state, { type: 'subir', muro: { col: 7, row: 4 } }, createRng(1));
    anim.observe(state);
    anim.tick(1);
    expect(anim.busy).toBe(true);
    // A medio camino va a media altura; al acabar, arriba.
    anim.tick(150);
    const medio = anim.figura(a).elevacion;
    expect(medio).toBeGreaterThan(0);
    expect(medio).toBeLessThan(1);
    anim.tick(100_000);
    expect(anim.figura(a).elevacion).toBe(1);
  });

  it('un clic en lo alto de la columna sube por ella', () => {
    const trepa = unidadDeArena('zombi', { traits: ['escalar'] });
    const s = sesionDeArena(
      [{ unidad: trepa, ia: false, escalera: false }],
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      4,
      LINEA,
    );
    s.empezar();
    const yo = s.turnoPropio?.stack;
    if (yo === undefined) throw new Error('esperaba el turno de la izquierda');
    yo.hex = { col: 6, row: 4 };
    stackById(s.battle, 'defender-0').hex = { col: 10, row: 8 };
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(1280, 720);
    // El de la escena: con muralla, el tablero baja lo que pide lo alto.
    const t = tableroPara(1280, 720, alzadoDeLaMuralla(LINEA));
    const muro = { col: 7, row: 4 };
    const c = centroHex(t, muro);
    escena.pulsar(c.x, c.y - alturaDeColumna(t));
    expect(yo.hex).toEqual(muro);
    expect(s.battle.log.some((e) => e.kind === 'climbed')).toBe(true);
  });

  it('el centro del hex que tapa una columna sigue siendo un clic para ir allí', () => {
    // Las tapas de (7,7) y (8,7), cuatro veces más altas desde la ampliación,
    // cubren el centro de alguna casilla del suelo unas filas más atrás: el clic
    // ahí mira primero lo alto —a la columna no se va desde ahí— y luego el
    // suelo, que es a donde se quiere ir.
    const dos = validarMuralla({
      muros: [
        { col: 7, row: 7 },
        { col: 8, row: 7 },
      ],
      puertas: [],
    });
    const s = sesionDeArena(
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      [{ unidad: unidadDeArena('imperio-rodelero'), ia: false, escalera: false }],
      4,
      dos,
    );
    s.empezar();
    const yo = s.turnoPropio?.stack;
    if (yo === undefined) throw new Error('esperaba el turno de la derecha');
    yo.hex = { col: 10, row: 2 };
    stackById(s.battle, 'attacker-0').hex = { col: 0, row: 8 };
    const escena = new EscenaBatalla(() => s);
    // Un lienzo bajo: la cámara se queda a 25°, la que más tapa.
    escena.encuadrar(1600, 520);
    const t = tableroPara(1600, 520, alzadoDeLaMuralla(dos));
    const tapaEn = (h: Hex): Hex | null => {
      const c = centroHex(t, h);
      return hexEnPixel({ ...t, origenY: t.origenY - alturaDeColumna(t) }, c.x, c.y);
    };
    const movibles = new Set(s.battleMovable().map(hexKey));
    const detras = [...movibles]
      .map((k) => {
        const [col, row] = k.split(',').map(Number) as [number, number];
        return { col, row };
      })
      .find((h) => {
        const tapa = tapaEn(h);
        return tapa !== null && esMuro(dos, tapa);
      });
    if (detras === undefined) throw new Error('ninguna casilla a mano bajo una tapa');
    const c = centroHex(t, detras);
    escena.pulsar(c.x, c.y);
    expect(yo.hex).toEqual(detras);
  });

  it('los botones de la escala salen con la muralla, y deshabilitados dicen por qué', () => {
    const s = sesionDeArena(
      [{ unidad: unidadDeArena('zombi'), ia: false, escalera: true }],
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      4,
      LINEA,
    );
    s.empezar();
    const marcado = marcadoDe(renderPanelDeBatalla(s, false));
    expect(marcado).toContain('Poner escalera');
    expect(marcado).toContain('Subir');
    // Lejos del muro: los dos deshabilitados con la frase del núcleo.
    expect(marcado).toContain('title="No está al pie de ningún muro."');
    // Y sin muralla no salen.
    const sin = sesionDeArena(
      [{ unidad: unidadDeArena('zombi'), ia: false, escalera: true }],
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      4,
    );
    sin.empezar();
    expect(marcadoDe(renderPanelDeBatalla(sin, false))).not.toContain('Poner escalera');
  });
});

describe('tras QA', () => {
  it('la ayuda del editor y el borrador dicen la regla del muro alto (I1)', () => {
    const ayuda = marcadoDe(
      renderMuralla({
        muralla: LINEA,
        herramienta: 'muro',
        nombre: 'Mía',
        ejemplos: FORMAS_DE_EJEMPLO,
        guardadas: [],
        sinGuardado: null,
        despliegue: null,
        plegado: false,
      }),
    );
    for (const texto of [ayuda, COMENTARIO_DEL_BORRADOR_DE_MURALLAS]) {
      expect(texto).toContain(REGLA_DE_LA_MURALLA);
      // La regla del primer ciclo, que decía lo contrario.
      expect(texto).not.toMatch(/cierra el paso a los dos bandos|no se posan/);
    }
    for (const parte of ['sube andando', 'escalera', 'sabe escalar', 'se posan', 'a través']) {
      expect(REGLA_DE_LA_MURALLA).toContain(parte);
    }
  });

  it('el motivo de «Subir» es el del muro de la escalera puesta, no el del primero (I2)', () => {
    // El caso de la semilla 21 en la arena: «Línea con puerta», la escalera de
    // 6,3 a 7,2 con el que la puso arriba y el lancero al pie. Al pie de 6,3
    // están 7,2 y 7,3, y el primero de `neighbours` es el que no tiene escalera.
    const state = createBattle(
      lado([
        { creature: 'swordsman', count: 2 },
        { creature: 'pikeman', count: 2 },
      ]),
      lado([{ creature: 'archer', count: 2 }]),
      createRng(21),
      CON_PUERTA,
    );
    const pie = { col: 6, row: 3 };
    const muro = { col: 7, row: 2 };
    state.escaleras.push({ pie, muro });
    stackById(state, 'attacker-0').hex = muro;
    stackById(state, 'attacker-1').hex = pie;
    stackById(state, 'defender-0').hex = { col: 10, row: 0 };
    forzarTurno(state, 'attacker-1');
    expect(subirBlocker(state, { col: 7, row: 3 })).toBe(
      'no hay escalera puesta ahí y no sabe escalar',
    );
    expect(subirBlocker(state, muro)).toBe('en ese muro está Espadachín');
    expect(escalaBlocker(state, 'subir')).toBe('en ese muro está Espadachín');
  });

  it('subir y poner la escalera cierran el turno aunque la moral regale otro (M3)', () => {
    // Con moral +3, una de cada ocho tiradas da el turno extra (54 de 400 en la
    // sonda de QA): en 100 semillas, ninguna lo da tras escalar.
    let extrasConOtraAccion = 0;
    for (let semilla = 1; semilla <= 100; semilla++) {
      for (const accion of ['poner_escalera', 'subir', 'defend'] as const) {
        const state = duelo(
          LINEA,
          'swordsman',
          { col: 6, row: 4 },
          'archer',
          { col: 10, row: 0 },
          'attacker-0',
          { escalera: true },
        );
        const a = stackById(state, 'attacker-0');
        a.morale = 3;
        const muro = { col: 7, row: 4 };
        if (accion === 'subir') state.escaleras.push({ pie: a.hex, muro });
        const turno = state.turno;
        applyAction(
          state,
          accion === 'defend' ? { type: 'defend' } : { type: accion, muro },
          createRng(semilla),
        );
        const otraVez = state.turno?.stack === 'attacker-0';
        if (accion === 'defend') {
          if (otraVez) extrasConOtraAccion++;
          continue;
        }
        expect(otraVez, `${accion}, semilla ${semilla}`).toBe(false);
        expect(mismoTurno(turno, state.turno)).toBe(false);
        expect(state.log.some((e) => e.kind === 'morale')).toBe(false);
      }
    }
    // La misma moral, con otra acción, sí lo da: lo de arriba no es suerte.
    expect(extrasConOtraAccion).toBeGreaterThan(0);
  });

  it('«Lleva escalera» sale deshabilitada, con su motivo, a quien no la usaría (M1)', () => {
    const anda = unidadDeArena('zombi');
    const grande = unidadDeArena('zombi', { hexes: 2 });
    const vuela = unidadDeArena('zombi', { traits: ['flying'] });
    expect(escaleraDeArenaBlocker({ kind: 'borrador', unidad: anda }, 'izquierda')).toBeNull();
    expect(escaleraDeArenaBlocker({ kind: 'borrador', unidad: grande }, 'izquierda')).toBe(
      'una unidad de dos casillas no sube a la muralla',
    );
    expect(escaleraDeArenaBlocker({ kind: 'borrador', unidad: vuela }, 'izquierda')).toBe(
      'vuela: se posa en la muralla sin escalera',
    );
    const unidades = [anda, grande, vuela];
    const marcado = marcadoDe(
      renderBando(
        'izquierda',
        unidades.map((_, i) => ({
          clave: i,
          fuente: { kind: 'hoja' as const, hoja: String(i) },
          escalera: true,
        })),
        (p) => {
          const u = unidades[p.clave]!;
          return {
            nombre: u.name,
            resumen: '',
            figura: u.id,
            sello: 'borrador',
            noEscala: escaleraDeArenaBlocker({ kind: 'borrador', unidad: u }, 'izquierda'),
          };
        },
        null,
        LIDERAZGO.maxPorBando,
        null,
        unidades.length,
        false,
      ),
    );
    const casillas = marcado.match(/<input type="checkbox" data-arena="escalera"[^>]*>/g) ?? [];
    expect(casillas).toEqual([
      '<input type="checkbox" data-arena="escalera" data-clave="0" checked>',
      '<input type="checkbox" data-arena="escalera" data-clave="1" disabled>',
      '<input type="checkbox" data-arena="escalera" data-clave="2" disabled>',
    ]);
    expect(marcado).toContain('No la usa: una unidad de dos casillas no sube a la muralla.');
    expect(marcado).toContain('No la usa: vuela: se posa en la muralla sin escalera.');
  });

  it('los botones de la escala no salen a quien no escala nunca: el defensor (M5)', () => {
    const s = sesionDeArena(
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: true }],
      [{ unidad: unidadDeArena('zombi'), ia: false, escalera: false }],
      4,
      LINEA,
    );
    s.empezar();
    expect(s.turnoPropio?.stack.side).toBe('defender');
    const marcado = marcadoDe(renderPanelDeBatalla(s, false));
    expect(marcado).toContain('data-action=');
    expect(marcado).not.toContain('Poner escalera');
    expect(marcado).not.toContain('Subir');
  });
});
