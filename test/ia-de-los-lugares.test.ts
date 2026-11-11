/**
 * La IA de reglas en los lugares de un mundo (`core/ai/lugares.ts`, #284): lo que
 * elige no depende del orden en que la historia escribe sus opciones. No se mira si
 * elige bien (no se prueba la jugabilidad): se mira que, con los mismos puntos y las
 * mismas opciones en otro orden, elige **la misma opción por lo que hace**, no por
 * su índice, también cuando dos valen lo mismo, y que preguntárselo no cambia nada
 * de la partida.
 *
 * Visto morder (11-11-2026), una sonda cada vez en `ai/lugares.ts`: con la regla de
 * antes (el primer candidato escrito, que es lo que hacía `todas.find(...)` en las dos
 * búsquedas), rojos el marqués, el sello, el empate y los dos encargos, cada uno con
 * la opción que estaba escrita primero; con el valor bien y el empate por posición
 * (`desempate` a cero), rojo el empate; con el hash sin la semilla, rojo el empate
 * («expected 1 to be 2»: siempre el mismo); con `mejorJugada` avanzando un contador
 * del estado (`siguienteBotin++`), rojo el último.
 */
import { describe, expect, it } from 'vitest';
import { hariaAlgoEn, jugadaEnElLugar } from '../src/core/ai/lugares.js';
import { pieza } from '../src/core/equipo/pieza.js';
import { fuerzaDe } from '../src/core/hero/fuerza.js';
import { partidaDelMundo } from '../src/core/mundo/partida.js';
import { opcionDe } from '../src/core/mundo/reglas.js';
import { type CrudosDelMundo, leerMundo, problemasDelMundo } from '../src/core/mundo/validar.js';
import type { GameState } from '../src/core/state/tipos.js';
import type { Hero } from '../src/core/types.js';
import { leerCrudos } from '../tools/mundo/disco.js';
import { leerBancoDeDisco } from '../tools/npcs/banco.js';

const BANCO = leerBancoDeDisco();

async function crudosDe(id: string): Promise<CrudosDelMundo> {
  const leido = await leerCrudos(id);
  if ('sinMundo' in leido) throw new Error(leido.sinMundo);
  if ('problemas' in leido) throw new Error(leido.problemas.join('\n'));
  return leido.crudos;
}
const CRUDOS = { prueba: await crudosDe('prueba'), ejemplo: await crudosDe('ejemplo') };

type OpcionCruda = Record<string, unknown>;
interface NodoCrudo {
  texto: string;
  opciones: OpcionCruda[];
}
interface LugarCrudo {
  id: string;
  puntos: { id: string }[];
  dialogos: Record<string, { inicio: string; nodos: Record<string, NodoCrudo> }>;
}
interface HistoriaCruda {
  marcas: Record<string, unknown>;
  lugares: LugarCrudo[];
}

/** Una copia de los crudos de `id` con la historia cambiada por `cambio`. */
function con(id: keyof typeof CRUDOS, cambio: (h: HistoriaCruda) => void): CrudosDelMundo {
  const c = structuredClone(CRUDOS[id]) as unknown as { historia: HistoriaCruda };
  cambio(c.historia);
  return c as unknown as CrudosDelMundo;
}

const lugarCrudo = (h: HistoriaCruda, id: string): LugarCrudo =>
  h.lugares.find((l) => l.id === id)!;

/** Las opciones de un nodo, al revés: lo mismo escrito en el otro orden. */
function alReves(h: HistoriaCruda, lugar: string, dialogo: string, nodo: string): void {
  lugarCrudo(h, lugar).dialogos[dialogo]!.nodos[nodo]!.opciones.reverse();
}

/**
 * La partida de un mundo con el héroe del rival (la IA, el jugador 1) plantado en
 * `lugar` y el mundo preparado por `preparar` (marcas puestas, el estado del lugar).
 */
function rivalEn(
  crudos: CrudosDelMundo,
  id: string,
  lugar: string,
  preparar: (s: GameState) => void = () => {},
): { state: GameState; hero: Hero } {
  expect(problemasDelMundo(crudos, id, BANCO)).toEqual([]);
  const state = partidaDelMundo(leerMundo(crudos, id, BANCO));
  const hero = state.heroes.find((h) => h.owner === 1)!;
  hero.at = { ...state.mundo!.historia.lugares.find((l) => l.id === lugar)!.at };
  preparar(state);
  return { state, hero };
}

/** Lo que elige la IA, por lo que es (dónde está y qué hace), no por su índice. */
function loQueElige(state: GameState, hero: Hero): string {
  const ref = jugadaEnElLugar(state, hero);
  if (ref === null) return 'nada';
  const { opcion } = opcionDe(state, hero.id, ref);
  return `${ref.punto}/${ref.nodo}: ${opcion.texto} ${JSON.stringify(opcion.hace)}`;
}

/** Lo que elige en el mundo de `crudos` y en el mismo con `reordenar` aplicado. */
function enLosDosOrdenes(
  id: keyof typeof CRUDOS,
  cambio: (h: HistoriaCruda) => void,
  reordenar: (h: HistoriaCruda) => void,
  lugar: string,
  preparar: (s: GameState) => void = () => {},
  seed?: number,
): [string, string] {
  const eleccion = (c: CrudosDelMundo) => {
    const { state, hero } = rivalEn(c, id, lugar, preparar);
    const s = seed === undefined ? state : { ...state, seed };
    return loQueElige(s, hero);
  };
  const tal = con(id, cambio);
  const otro = con(id, (h) => {
    cambio(h);
    reordenar(h);
  });
  return [eleccion(tal), eleccion(otro)];
}

/** El fragmento de los desenlaces excluyentes de la skill, el del sello del abad. */
const SELLO = {
  marcas: {
    'sello-a-la-orden': {
      falta: 'nadie ha llevado aún el sello',
      ya: 'el sello ya es de la Orden',
    },
    'sello-a-los-orkos': {
      falta: 'nadie ha vendido aún el sello',
      ya: 'el sello ya es de los orkos',
    },
  },
  nodo: (oroDeGruk: number): NodoCrudo => ({
    texto: 'El abad te pone el sello en la mano. «Solo hay uno.»',
    opciones: [
      {
        texto: 'Llevárselo a la Orden',
        si: [{ no: { marca: 'sello-a-la-orden' } }, { no: { marca: 'sello-a-los-orkos' } }],
        hace: [{ marca: 'sello-a-la-orden' }, { pieza: 'brigantina' }],
      },
      {
        texto: `Vendérselo a Gruk (${oroDeGruk} de oro)`,
        si: [{ no: { marca: 'sello-a-los-orkos' } }, { no: { marca: 'sello-a-la-orden' } }],
        hace: [{ marca: 'sello-a-los-orkos' }, { oro: oroDeGruk }],
      },
    ],
  }),
};

/** El sello en la garita del puente de Corvo, al que se llega desde su inicio sin «hace». */
const conElSello =
  (oroDeGruk: number) =>
  (h: HistoriaCruda): void => {
    Object.assign(h.marcas, SELLO.marcas);
    const garita = lugarCrudo(h, 'puente-de-corvo').dialogos.garita!;
    garita.nodos.sello = SELLO.nodo(oroDeGruk);
    garita.nodos.dentro!.opciones.push({ texto: 'Preguntar por el sello', ir: 'sello' });
  };

/**
 * El puente sin nada más que coger: la lanza, ya cogida, y Corvo, ya libre (su punto
 * no está). Así lo que se compara es lo del sello y no otro premio del lugar.
 */
const soloElSello = (s: GameState): void => {
  s.mundo!.marcas.push('lanza-cogida');
  s.mundo!.estados['puente-de-corvo'] = 'libre';
};

const selloAlReves = (h: HistoriaCruda) => alReves(h, 'puente-de-corvo', 'garita', 'sello');

describe('la IA en un lugar no elige por el orden escrito (#284)', () => {
  it('el marqués de «ejemplo»: de dos premios del mismo desenlace, el mismo en los dos órdenes', () => {
    // «Dárselo para que lo queme» (300 y el arnés) y «Dárselo y callar también lo
    // del Robledal» (500 y el arnés), las dos elegibles con las dos marcas puestas.
    const preparar = (s: GameState) =>
      s.mundo!.marcas.push('orden-fuera-de-la-ermita', 'el-fuego-del-robledal');
    const [tal, otro] = enLosDosOrdenes(
      'ejemplo',
      () => {},
      (h) => {
        const ops = lugarCrudo(h, 'quinta-de-los-osorio').dialogos.marques!.nodos['la-orden']!
          .opciones;
        [ops[0], ops[1]] = [ops[1]!, ops[0]!];
      },
      'quinta-de-los-osorio',
      preparar,
    );
    expect(otro).toBe(tal);
    // Por lo que vale: la de 500 y el arnés.
    expect(tal).toMatch(/^marques\/la-orden: .*"oro":500/);
  });

  it('dos desenlaces excluyentes en el mismo nodo (el sello de la skill): el mismo en los dos órdenes', () => {
    const [tal, otro] = enLosDosOrdenes(
      'prueba',
      conElSello(400),
      selloAlReves,
      'puente-de-corvo',
      soloElSello,
    );
    expect(otro).toBe(tal);
    // La brigantina vale su precio del catálogo, más que 400 de oro.
    expect(pieza('brigantina').precio).toBeGreaterThan(400);
    expect(tal).toMatch(/^garita\/sello: Llevárselo a la Orden/);
  });

  it('con empate, lo desempata la semilla y lo que es la opción, nunca su posición', () => {
    // Gruk paga justo lo que vale la brigantina: los dos desenlaces valen lo mismo.
    const empate = conElSello(pieza('brigantina').precio);
    const vistas = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const [tal, otro] = enLosDosOrdenes(
        'prueba',
        empate,
        selloAlReves,
        'puente-de-corvo',
        soloElSello,
        seed,
      );
      expect(otro, `semilla ${seed}`).toBe(tal);
      expect(tal).toMatch(/^garita\/sello: /);
      vistas.add(tal);
    }
    // No es un orden fijo con otro nombre: según la partida, sale uno u otro.
    expect(vistas.size).toBe(2);
  });

  it('entre dos caminos sin premio, el que lleva al que más vale, en los dos órdenes', () => {
    // Dos encargos que se excluyen (cada uno pone su marca y lleva a su nodo); el
    // premio está detrás: 300 tras la Orden, 500 tras Gruk.
    const encargos = (h: HistoriaCruda): void => {
      Object.assign(h.marcas, {
        'con-la-orden': { falta: 'nadie sirve aún a la Orden', ya: 'alguien sirve ya a la Orden' },
        'con-gruk': { falta: 'nadie sirve aún a Gruk', ya: 'alguien sirve ya a Gruk' },
        'pagado-orden': { falta: 'la Orden no ha pagado', ya: 'la Orden ya pagó' },
        'pagado-gruk': { falta: 'Gruk no ha pagado', ya: 'Gruk ya pagó' },
      });
      const nodos = lugarCrudo(h, 'puente-de-corvo').dialogos.garita!.nodos;
      const ninguno = [{ no: { marca: 'con-la-orden' } }, { no: { marca: 'con-gruk' } }];
      nodos.encargos = {
        texto: 'Dos cartas sobre el catre: una de la Orden y otra de Gruk.',
        opciones: [
          {
            texto: 'Servir a la Orden',
            si: ninguno,
            hace: [{ marca: 'con-la-orden' }],
            ir: 'orden',
          },
          { texto: 'Servir a Gruk', si: ninguno, hace: [{ marca: 'con-gruk' }], ir: 'gruk' },
        ],
      };
      nodos.orden = {
        texto: 'La Orden paga por adelantado.',
        opciones: [
          {
            texto: 'Cobrar',
            si: [{ no: { marca: 'pagado-orden' } }],
            hace: [{ oro: 300 }, { marca: 'pagado-orden' }],
          },
        ],
      };
      nodos.gruk = {
        texto: 'Gruk paga por adelantado.',
        opciones: [
          {
            texto: 'Cobrar',
            si: [{ no: { marca: 'pagado-gruk' } }],
            hace: [{ oro: 500 }, { marca: 'pagado-gruk' }],
          },
        ],
      };
      nodos.dentro!.opciones.push({ texto: 'Mirar las cartas', ir: 'encargos' });
    };
    const [tal, otro] = enLosDosOrdenes(
      'prueba',
      encargos,
      (h) => alReves(h, 'puente-de-corvo', 'garita', 'encargos'),
      'puente-de-corvo',
      // Leída la carta del capitán, ningún otro camino del puente lleva a nada.
      (s) => {
        soloElSello(s);
        s.mundo!.marcas.push('carta-leida');
      },
    );
    expect(otro).toBe(tal);
    expect(tal).toMatch(/^garita\/encargos: Servir a Gruk/);
  });

  it('preguntárselo no cambia la partida: ni el mundo, ni los contadores de sus corrientes', () => {
    const { state, hero } = rivalEn(
      con('prueba', conElSello(pieza('brigantina').precio)),
      'prueba',
      'puente-de-corvo',
      soloElSello,
    );
    const antes = structuredClone(state);
    const lugar = state.mundo!.historia.lugares.find((l) => l.id === 'puente-de-corvo')!;
    expect(hariaAlgoEn(state, hero, lugar, fuerzaDe(hero))).toBe(true);
    expect(jugadaEnElLugar(state, hero)).not.toBeNull();
    expect(state).toEqual(antes);
    // Y la misma pregunta, la misma respuesta: no hay nada que se gaste entre una y otra.
    expect(loQueElige(state, hero)).toBe(loQueElige(state, hero));
  });
});
