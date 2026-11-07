/**
 * Las murallas del mapa (puesto fronterizo, fase 2, 04-11-2026;
 * `docs/agents/2026-11-04-puesto-fronterizo/plan.md` §4 y §7): las dos formas de
 * `data/sitios.json` y la regla que las juzga al cargar (`murallaDelMapaBlocker`,
 * `leerSitios`), qué muralla lleva cada batalla del mapa
 * (`murallaDelSitio` por `montarLaBatalla`), la escalera de todo el bando atacante
 * (D8, `alAsalto`) y que la IA las asalte y la batalla acabe.
 *
 * Se escribe desde los criterios del plan, no desde el código: cada regla con una
 * forma rota a propósito y su frase.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { EscenaBatalla } from '../src/client/batalla/escena.js';
import { marcadoDe } from '../src/client/comun/html.js';
import { renderSide } from '../src/client/partida/paneles.js';
import { alturaDeColumna, alzadoDeLaMuralla } from '../src/client/render/batalla/muralla.js';
import { centroHex, tableroPara } from '../src/client/render/proyeccion.js';
import { Session } from '../src/client/sesion/partida.js';
import { resolvePendingBattle } from '../src/core/ai/turn.js';
import { columna } from '../src/core/arena/murallas.js';
import { applyAction } from '../src/core/battle/battle.js';
import { allHexes, bandoDeSalida, hexKey } from '../src/core/battle/board.js';
import { stackById } from '../src/core/battle/consultas.js';
import { legalActions } from '../src/core/battle/legalidad.js';
import { alAsalto, createBattle } from '../src/core/battle/montaje.js';
import {
  ladoDeLaMuralla,
  murallaDelMapaBlocker,
  SIN_MURALLA,
  validarMuralla,
} from '../src/core/battle/muralla.js';
import type { BattleState } from '../src/core/battle/types.js';
import { MAX_ROUNDS } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng } from '../src/core/rng.js';
import { baseOf, heroesOf } from '../src/core/state/consultas.js';
import { newGame } from '../src/core/state/setup.js';
import {
  dueñoDeLaCiudad,
  leerSitios,
  MURALLAS_DEL_MAPA,
  ponerLaGuarnicion,
  sitioPorId,
} from '../src/core/state/sitios.js';
import type { GameState } from '../src/core/state/tipos.js';
import { type Army, FACTION_IDS, type FactionId, hasTrait } from '../src/core/types.js';
import { unidadDelJuego, unidadesDeFaccion } from '../src/core/unidad/catalogo.js';
import { aMano, bandoAMano, forzarTurno, muralla } from './batalla-de-prueba.js';
import { ctx, JINETE, NO_MUERTO, PESADA, TROPA_BARATA } from './comun.js';
import {
  copiaDePartida,
  ejercito,
  forzarBatalla,
  guarnecer,
  pegadoA,
  unPaso,
  unPuebloDe,
} from './partida-de-prueba.js';

const h = (col: number, row: number) => ({ col, row });
const DOS_BARATAS = () => ejercito({ creature: TROPA_BARATA, count: 2 });

/**
 * La batalla de un héroe del jugador 0 (con `atacante`, si se dice) contra la base
 * del 1 guardada por `guarnicion` y sin su héroe dentro. Sobre `state` si se da (una
 * copia de la plantilla), o sobre la partida de `seed`.
 */
function contraLaBase(
  seed: number,
  guarnicion: Army,
  atacante?: Army,
  state: GameState = newGame({ seed }),
): { readonly state: GameState; readonly b: BattleState } {
  const base = baseOf(state, 1)!;
  heroesOf(state, 1)[0]!.at = { x: 0, y: 0 };
  guarnecer(state, base, guarnicion);
  const heroe = heroesOf(state, 0)[0]!;
  if (atacante !== undefined) heroe.army = atacante;
  forzarBatalla(state, ctx(seed), heroe, base.at);
  return { state, b: state.pendingBattle!.battle };
}

/** Lo mismo contra un pueblo del jugador 1 guardado por `guarnicion`. */
function contraElPueblo(
  seed: number,
  guarnicion: Army,
  atacante?: Army,
  state: GameState = newGame({ seed }),
): { readonly state: GameState; readonly b: BattleState } {
  const pueblo = unPuebloDe(state, 1);
  ponerLaGuarnicion(state, sitioPorId(state, pueblo.id), 1, guarnicion);
  const heroe = heroesOf(state, 0)[0]!;
  if (atacante !== undefined) heroe.army = atacante;
  forzarBatalla(state, ctx(seed), heroe, pueblo.at);
  return { state, b: state.pendingBattle!.battle };
}

describe('las dos formas de data/sitios.json', () => {
  it('pasan la regla del mapa: la de la ciudad, de piedra, y la del pueblo, de madera', () => {
    expect(MURALLAS_DEL_MAPA.ciudad.material).toBe('piedra');
    expect(MURALLAS_DEL_MAPA.pueblo.material).toBe('madera');
    for (const m of Object.values(MURALLAS_DEL_MAPA)) expect(murallaDelMapaBlocker(m)).toBeNull();
  });

  it('la de la ciudad es la base del defensor (06-11-2026): lo de dentro es su salida, y nada más', () => {
    // La «Base derecha» del usuario. Con la «gruesa» de antes, en medio del tablero,
    // la columna 8 de las filas pares quedaba dentro y fuera de la salida: rojo.
    const dentro = allHexes().filter(
      (x) => ladoDeLaMuralla(MURALLAS_DEL_MAPA.ciudad, x) === 'dentro',
    );
    expect(dentro).toHaveLength(21);
    for (const x of dentro) expect(bandoDeSalida(x), hexKey(x)).toBe('defender');
  });

  it('cada regla rechaza con su frase una forma rota a propósito', () => {
    const PUERTA = { a: h(7, 4), b: h(8, 4) };
    const con = (muros: { col: number; row: number }[], puertas = [PUERTA]) =>
      murallaDelMapaBlocker(muralla(muros, puertas, 'madera'));
    // Abierta: la línea con puerta sin su última casilla se rodea andando.
    expect(con(columna(7, 0, 7).filter((x) => x.row !== 4))).toBe(
      'una muralla del mapa cierra: con esta, el atacante la rodea andando',
    );
    // Sin pie de fuera: muros en toda la salida del atacante, que no deja suelo fuera.
    expect(con([...columna(0), ...columna(1), ...columna(2)])).toBe(
      'ningún muro tiene un pie de suelo fuera desde el que poner una escalera',
    );
    // Sin bajada dentro: muros en toda la salida del defensor, que no deja suelo dentro.
    expect(con(allHexes().filter((x) => bandoDeSalida(x) === 'defender'))).toBe(
      'subiendo por fuera no se llega andando por lo alto a ningún muro con suelo dentro adonde bajar',
    );
    // Sin puerta: la línea recta cierra, pero no lleva ninguna.
    expect(con(columna(7), [])).toBe('una muralla del mapa lleva al menos una puerta');
    // Una puerta que no separa: la línea recta con una puerta fuera, en (2,4)-(3,4).
    expect(con(columna(7), [{ a: h(2, 4), b: h(3, 4) }])).toBe(
      'la puerta (2,4)-(3,4) no separa fuera de dentro: no sirve de nada',
    );
    // Despliegue que no cabe: la salida del atacante, tapada salvo dos casillas.
    expect(
      con([
        ...columna(0),
        ...columna(1),
        ...columna(2, 0, 6),
        ...columna(7).filter((x) => x.row !== 4),
      ]),
    ).toBe(
      'no caben los 7 de un bando: la muralla deja 2 casillas de salida a la izquierda y hacen falta 7',
    );
  });

  it('el fichero se lee entero o lanza nombrándolo', () => {
    const { ciudad: gruesa, pueblo: linea } = MURALLAS_DEL_MAPA;
    const usos = {
      ciudad: { muralla: 'gruesa' },
      pueblo: { muralla: 'linea' },
      empalizada: { muralla: 'linea', precio: 1500 },
      muralla: { muralla: 'gruesa', precio: 4000 },
    };
    const bien = { murallas: { gruesa, linea }, usos };
    const con = (cambio: Record<string, unknown>) => () => leerSitios({ ...bien, ...cambio });
    expect(leerSitios(bien).murallas.pueblo).toEqual(linea);
    // Una forma que nadie nombra vale: las formas son un conjunto abierto.
    expect(con({ murallas: { gruesa, linea, otra: linea } })).not.toThrow();
    expect(() => leerSitios({})).toThrow('data/sitios.json: falta «murallas»');
    expect(con({ mejoras: {} })).toThrow(
      'data/sitios.json: «mejoras» no es un campo; valen _comment, murallas, usos',
    );
    const { pueblo: _sinPueblo, ...sinElPueblo } = usos;
    expect(con({ usos: sinElPueblo })).toThrow('data/sitios.json: «usos»: falta «pueblo»');
    expect(con({ usos: { ...usos, paso: { muralla: 'linea' } } })).toThrow(
      '«usos»: «paso» no es un campo; valen ciudad, pueblo, empalizada, muralla',
    );
    // Quién usa cuál nombra una forma que está.
    expect(con({ usos: { ...usos, ciudad: { muralla: 'ciudad' } } })).toThrow(
      'data/sitios.json: el uso «ciudad»: «muralla» "ciudad" no existe; valen gruesa, linea',
    );
    // Que sea una muralla (`validarMuralla`), con su frase y su nombre.
    const { material: _, ...sinMaterial } = linea;
    expect(con({ murallas: { gruesa, linea: sinMaterial } })).toThrow(
      'data/sitios.json: la muralla «linea»: la muralla: falta «material»',
    );
    expect(con({ murallas: { gruesa, linea: { ...linea, material: 'barro' } } })).toThrow(
      'data/sitios.json: la muralla «linea»: la muralla: material "barro" no existe; valen piedra, madera',
    );
    // Y que valga para el mapa (`murallaDelMapaBlocker`), aunque nadie la nombre.
    expect(
      con({
        murallas: { gruesa, linea, rota: { muros: columna(7), puertas: [], material: 'madera' } },
      }),
    ).toThrow(
      'data/sitios.json: la muralla «rota» no vale: una muralla del mapa lleva al menos una puerta',
    );
  });

  it('lo ya validado vuelve tal cual: todas las batallas comparten el objeto de su muralla', () => {
    expect(validarMuralla(MURALLAS_DEL_MAPA.ciudad)).toBe(MURALLAS_DEL_MAPA.ciudad);
    expect(validarMuralla(SIN_MURALLA)).toBe(SIN_MURALLA);
    // Lo de fuera se copia: un objeto igual que no salió de aquí da otro.
    const copia = { ...MURALLAS_DEL_MAPA.ciudad };
    expect(validarMuralla(copia)).not.toBe(copia);
    expect(contraLaBase(5, DOS_BARATAS()).b.muralla).toBe(MURALLAS_DEL_MAPA.ciudad);
  });
});

describe('qué muralla lleva cada batalla del mapa', () => {
  it('la de la ciudad contra la base, la del pueblo contra un pueblo, ninguna en un paso ni contra un monstruo', () => {
    // La base del rival con guarnición y sin su héroe dentro.
    const base = contraLaBase(5, DOS_BARATAS(), ejercito({ creature: PESADA, count: 3 }));
    expect(base.state.pendingBattle!.foe).toEqual({
      kind: 'garrison',
      site: baseOf(base.state, 1)!.id,
    });
    expect(base.b.muralla).toBe(MURALLAS_DEL_MAPA.ciudad);
    // Y con ella, cada stack atacante y su héroe llevan escalera, y el defensor no.
    const suyos = base.b.stacks.filter((s) => s.side === 'attacker');
    expect(suyos).toHaveLength(4);
    expect(suyos.some((s) => s.origen.kind === 'heroe')).toBe(true);
    for (const s of suyos) expect(s.escalera, s.id).toBe(true);
    for (const s of base.b.stacks.filter((x) => x.side === 'defender')) {
      expect(s.escalera).toBe(false);
    }

    // Un pueblo con guarnición ajena: la empalizada.
    expect(contraElPueblo(5, DOS_BARATAS()).b.muralla).toBe(MURALLAS_DEL_MAPA.pueblo);

    // Un paso con guarnición ajena: sin obra no hay muralla (con obra, `mejoras-del-puesto.test.ts`), y sin escaleras.
    const s3 = newGame({ seed: 5 });
    const paso = unPaso(s3);
    paso.owner = 1;
    ponerLaGuarnicion(s3, sitioPorId(s3, paso.id), 1, DOS_BARATAS());
    forzarBatalla(s3, ctx(5), heroesOf(s3, 0)[0]!, paso.at);
    const b3 = s3.pendingBattle!.battle;
    expect(b3.muralla).toBe(SIN_MURALLA);
    expect(b3.stacks.some((s) => s.escalera)).toBe(false);

    // Un monstruo: sin muralla.
    const s4 = newGame({ seed: 5 });
    forzarBatalla(s4, ctx(5), heroesOf(s4, 0)[0]!);
    expect(s4.pendingBattle!.foe.kind).toBe('monster');
    expect(s4.pendingBattle!.battle.muralla).toBe(SIN_MURALLA);
  });

  it('una ciudad neutral también es de piedra', () => {
    const state = newGame({ seed: 5 });
    const neutral = state.towns.find((t) => dueñoDeLaCiudad(state, t) === null);
    if (neutral === undefined) throw new Error('la semilla 5 no tiene ciudad neutral');
    guarnecer(state, neutral, ejercito({ creature: TROPA_BARATA, count: 1 }));
    forzarBatalla(state, ctx(5), heroesOf(state, 0)[0]!, neutral.at);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'garrison', site: neutral.id });
    expect(state.pendingBattle!.battle.muralla.material).toBe('piedra');
  });

  it('el héroe atacado en su base defiende tras la piedra, y en su pueblo tras la madera', () => {
    const s1 = newGame({ seed: 5 });
    const defensor = heroesOf(s1, 1)[0]!;
    defensor.at = { ...baseOf(s1, 1)!.at };
    forzarBatalla(s1, ctx(5), heroesOf(s1, 0)[0]!, defensor.at);
    expect(s1.pendingBattle!.foe).toEqual({ kind: 'hero', heroId: defensor.id });
    expect(s1.pendingBattle!.battle.muralla.material).toBe('piedra');

    const s2 = newGame({ seed: 5 });
    const pueblo = unPuebloDe(s2, 1);
    const suyo = heroesOf(s2, 1)[0]!;
    suyo.at = { ...pueblo.at };
    forzarBatalla(s2, ctx(5), heroesOf(s2, 0)[0]!, pueblo.at);
    expect(s2.pendingBattle!.foe).toEqual({ kind: 'hero', heroId: suyo.id });
    expect(s2.pendingBattle!.battle.muralla.material).toBe('madera');
  });
});

describe('las jugadas de la muralla, en la lista legal', () => {
  it('el atacante al pie de un muro pone su escalera, y el defensor abre la puerta', () => {
    const { b } = contraElPueblo(5, DOS_BARATAS());
    // La empalizada es la columna 7: (6,1) está a su pie, del lado de fuera.
    stackById(b, 'attacker-heroe').hex = h(6, 1);
    forzarTurno(b, 'attacker-heroe');
    expect(legalActions(b)).toContainEqual({ type: 'poner_escalera', muro: h(7, 1) });
    applyAction(b, { type: 'poner_escalera', muro: h(7, 1) }, createRng(1));
    expect(b.escaleras).toEqual([{ pie: h(6, 1), muro: h(7, 1) }]);
    expect(stackById(b, 'attacker-heroe').escalera).toBe(false);

    forzarTurno(b, 'defender-0');
    expect(legalActions(b)).toContainEqual({
      type: 'abrir_puerta',
      puerta: MURALLAS_DEL_MAPA.pueblo.puertas[0],
    });
  });
});

describe('la IA asalta las murallas del mapa y la batalla acaba', () => {
  /** Tres unidades de la facción, repitiendo hasta `n`: la tropa de un bando. */
  const tropaDe = (f: FactionId, n: number) => {
    const us = unidadesDeFaccion(f).filter((u) => u.edificio !== null);
    return ejercito(
      ...Array.from({ length: n }, (_, i) => ({ creature: us[i % us.length]!.id, count: 1 })),
    );
  };
  // Una partida para las 50: hacerla cada vez era casi todo lo que tardaba el test.
  let plantilla: GameState;
  beforeAll(() => {
    plantilla = newGame({ seed: 5 });
  });

  it('una guarnición de cada facción contra un héroe con tropa de cada facción, en las dos formas', () => {
    const agotadas: string[] = [];
    let escaleras = 0;
    let conMuralla = 0;
    for (const [i, defiende] of FACTION_IDS.entries()) {
      for (const [j, ataca] of FACTION_IDS.entries()) {
        for (const [forma, contra] of [
          ['piedra', contraLaBase],
          ['madera', contraElPueblo],
        ] as const) {
          const seed = 100 + i * 10 + j;
          const state = copiaDePartida(plantilla);
          // Sin libro: los hechizos acaban la pelea antes de que nadie llegue al muro.
          heroesOf(state, 0)[0]!.spells = [];
          const { b } = contra(seed, tropaDe(defiende, 5), tropaDe(ataca, 6), state);
          expect(b.muralla.material).toBe(forma);
          conMuralla++;
          resolvePendingBattle(state, ctx(seed));
          if (b.round >= MAX_ROUNDS) agotadas.push(`${ataca} contra ${defiende} (${forma})`);
          escaleras += b.log.filter((e) => e.kind === 'ladder_placed').length;
        }
      }
    }
    expect(conMuralla).toBe(FACTION_IDS.length * FACTION_IDS.length * 2);
    expect(agotadas, 'batallas que llegan al tope de rondas').toEqual([]);
    expect(escaleras, 'escaleras puestas en todas').toBeGreaterThan(0);
  });

  it('el volador no lleva escalera aunque su bando ataque una muralla', () => {
    // El catálogo no tiene ningún volador (QA de la fase 2, H-F2-2: el test de antes
    // buscaba uno, no lo encontraba y solo miraba al jinete). Uno hecho a mano, por el
    // camino del mapa: `alAsalto` da escalera a todos y `createBattle` se la quita a
    // quien no la usaría (`quienNoEscala`). Sin la rama de quien vuela, rojo.
    const volador = aMano(NO_MUERTO, { name: 'Vampiro', traits: ['undead', 'flying'] });
    expect(hasTrait(volador, 'flying')).toBe(true);
    const forma = MURALLAS_DEL_MAPA.ciudad;
    const b = createBattle(
      alAsalto(bandoAMano([volador, unidadDelJuego(JINETE)]), forma),
      { army: [{ creature: TROPA_BARATA, count: 1 }], hero: null },
      createRng(5),
      COMBATE_COMPLETO,
      forma,
    );
    const atacantes = b.stacks.filter((x) => x.side === 'attacker');
    expect(atacantes.map((x) => [x.unit.name, x.escalera])).toEqual([
      ['Vampiro', false],
      [unidadDelJuego(JINETE).name, true],
    ]);
    // Y en la batalla del mapa, el héroe y su tropa que anda, con la suya.
    const { b: delMapa } = contraLaBase(
      5,
      ejercito({ creature: TROPA_BARATA, count: 1 }),
      ejercito({ creature: JINETE, count: 1 }),
    );
    const delAtacante = delMapa.stacks.filter((x) => x.side === 'attacker');
    expect(delAtacante.length).toBe(2);
    for (const s of delAtacante) expect(s.escalera, s.id).toBe(true);
  });
});

describe('la partida juega la muralla con la pieza de la arena (`MurallaDeLaActiva`)', () => {
  /** La partida de la persona en la batalla contra un pueblo, con su héroe al pie de la empalizada. */
  function alPieDeLaEmpalizada(): { readonly s: Session; readonly b: BattleState } {
    const s = new Session(5);
    const pueblo = unPuebloDe(s.state, 1);
    ponerLaGuarnicion(s.state, sitioPorId(s.state, pueblo.id), 1, DOS_BARATAS());
    const hero = heroesOf(s.state, 0)[0]!;
    hero.at = pegadoA(s.state, pueblo.at);
    hero.movePoints = 100000;
    s.moveHeroTo(hero.id, pueblo.at);
    expect(s.scene).toBe('battle');
    // La batalla de la persona empieza desplegando (la fase de despliegue de
    // `main`): se acepta tal cual, y la muralla se juega después.
    s.despliegue.listoTalCual();
    const b = s.battle!;
    expect(b.muralla.material).toBe('madera');
    stackById(b, 'attacker-heroe').hex = h(6, 1);
    forzarTurno(b, 'attacker-heroe');
    return { s, b };
  }

  it('atacando un pueblo: «Poner escalera» sale en el panel y la pone; defendiendo, la puerta', () => {
    const { s, b } = alPieDeLaEmpalizada();
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain('data-action="battle-muralla" data-jugada="poner_escalera"');
    expect(panel).not.toContain('data-jugada="abrir_puerta"');
    // Tres muros al pie: el botón espera el clic en uno (lo dice la barra), y otra
    // pulsación lo cancela.
    const version = s.version;
    s.muralla.elegir('poner_escalera');
    expect(s.muralla.muroPorElegir).toBe('poner_escalera');
    expect(s.status).toBe(
      'Elige el muro: pulsa en lo alto de una de las columnas marcadas, o Escape para cancelar.',
    );
    expect(s.version, 'el botón que espera se marca: la partida repinta').not.toBe(version);
    expect(marcadoDe(renderSide(s))).toMatch(/data-jugada="poner_escalera" class="escala primary"/);
    s.muralla.elegir('poner_escalera');
    expect(s.muralla.muroPorElegir).toBeNull();
    s.playBattleAction({ type: 'poner_escalera', muro: h(7, 1) });
    expect(b.escaleras).toEqual([{ pie: h(6, 1), muro: h(7, 1) }]);

    // La unidad del pueblo, si fuera de la persona, abriría la puerta: el motivo lo
    // escribe el núcleo, y al que ataca no le sale el botón.
    forzarTurno(b, 'defender-0');
    expect(s.muralla.motivo('abrir_puerta')).toBe('Ahora no mueve ninguna unidad tuya.');
  });

  it('con «Poner escalera» esperando el muro, un clic en una casilla de andar no mueve y lo dice (QF2-1)', () => {
    const { s, b } = alPieDeLaEmpalizada();
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(1280, 720);
    const t = tableroPara(1280, 720, alzadoDeLaMuralla(b.muralla));
    const heroe = stackById(b, 'attacker-heroe');
    // Una casilla de andar lejos de las columnas: su centro no lo tapa ninguna.
    const destino = s.battleMovable().find((x) => x.col <= 4);
    if (destino === undefined) throw new Error('ninguna casilla de andar lejos del muro');
    const c = centroHex(t, destino);

    s.muralla.elegir('poner_escalera');
    escena.pulsar(c.x, c.y);
    expect(heroe.hex, 'el clic no anda').toEqual(h(6, 1));
    expect(s.muralla.porElegir, 'y el botón sigue esperando').toBe('poner_escalera');
    expect(s.status).toBe(
      'Para poner la escalera, pulsa en lo alto de una columna marcada al pie de la unidad, o Escape para cancelar.',
    );
    expect(b.log.some((e) => e.kind === 'move')).toBe(false);

    // En lo alto de una columna marcada, la pone.
    const muro = centroHex(t, h(7, 1));
    escena.pulsar(muro.x, muro.y - alturaDeColumna(t));
    expect(b.escaleras).toEqual([{ pie: h(6, 1), muro: h(7, 1) }]);
    expect(s.muralla.porElegir).toBeNull();
  });

  it('suelto el botón con Escape, el mismo clic en esa casilla sí anda (QF2-1)', () => {
    const { s, b } = alPieDeLaEmpalizada();
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(1280, 720);
    const t = tableroPara(1280, 720, alzadoDeLaMuralla(b.muralla));
    const destino = s.battleMovable().find((x) => x.col <= 4)!;
    const c = centroHex(t, destino);
    s.muralla.elegir('poner_escalera');
    s.soltarLoApuntado();
    escena.pulsar(c.x, c.y);
    expect(stackById(b, 'attacker-heroe').hex).toEqual(destino);
  });

  it('lo que espera el clic de la muralla es uno con lo apuntado: Escape y la jugada lo sueltan', () => {
    const { s } = alPieDeLaEmpalizada();
    // Escape (`soltarLoApuntado`, lo que llama la tecla) suelta el muro por elegir.
    s.muralla.elegir('poner_escalera');
    expect(s.muralla.porElegir).toBe('poner_escalera');
    s.soltarLoApuntado();
    expect(s.muralla.porElegir).toBeNull();
    expect(s.status).toBe('');
    // Y uno suelta al otro: elegir un muro suelta el hechizo, y apuntar uno, el muro.
    s.apuntados.apuntar({ kind: 'hechizo', id: 'cualquiera' });
    s.muralla.elegir('poner_escalera');
    expect(s.apuntado).toBeNull();
    s.apuntados.apuntar({ kind: 'poder', id: 'curar' });
    expect(s.muralla.porElegir).toBeNull();
    s.apuntados.soltar();
    // Cualquier jugada lo suelta también: terminar el turno.
    s.muralla.elegir('poner_escalera');
    s.playBattleAction({ type: 'end_turn' });
    expect(s.muralla.porElegir).toBeNull();
  });
});
