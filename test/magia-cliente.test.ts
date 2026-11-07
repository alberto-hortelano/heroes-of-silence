/**
 * La magia del editor en la pelea de la persona y en el contrato del agente
 * (06-11-2026): un hechizo sobre sí se lanza al elegirlo, uno a una casilla espera
 * el clic en una casilla con la frase del núcleo si no vale, y el agente manda
 * `cast` con `at` y lee lo que hace (`spell_list`).
 */
import { describe, expect, it } from 'vitest';
import { loApuntadoEnCasilla, SesionDeArena } from '../src/client/session.js';
import { heroePorDefecto } from '../src/core/arena.js';
import { activeStack } from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import { formaDeLaBatalla } from '../src/core/battle/formas-de-la-rueda.js';
import { UNIDADES } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { battleActionSchema } from '../src/core/contract/esquemas.js';
import { hechizosAlAgente } from '../src/core/contract/vistas.js';
import { accionDeBatallaDelAgente } from '../src/core/contract/vocabulario.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { catalogoDeHechizos, todosLosHechizos } from '../src/core/magia/catalogo.js';

function unidad(id: string) {
  const u = UNIDADES.find((x) => x.id === id);
  if (u === undefined) throw new Error(id);
  return { unidad: u };
}

/** Una pelea de la arena con el héroe de la izquierda (de la persona) que sabe `hechizos`. */
function pelea(hechizos: readonly string[]): SesionDeArena {
  const s = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: {
        unidades: [unidad('templario-escudo')],
        heroe: { ...heroePorDefecto('izquierda'), hechizos },
        ia: false,
      },
      derecha: { unidades: [unidad('orko-dos-armas')], heroe: null, ia: true },
      equipo: EQUIPO_DEL_JUEGO,
      hechizos: catalogoDeHechizos(todosLosHechizos()),
    },
    7,
  );
  s.empezar();
  s.despliegue.listoTalCual();
  return s;
}

describe('la persona lanza los hechizos del editor', () => {
  it('uno sobre sí se lanza al elegirlo, sin esperar un clic', () => {
    const s = pelea(['furia_propia']);
    expect(activeStack(s.battle)?.side).toBe('attacker');
    const desde = s.battle.log.length;
    s.hechizos.selectSpell('furia_propia');
    expect(s.battle.log.slice(desde)).toContainEqual(
      expect.objectContaining({ kind: 'cast', spell: 'furia_propia' }),
    );
    expect(s.hechizos.selectedSpell).toBeNull();
  });

  it('uno a una casilla espera el clic: dentro de su alcance juega; fuera, la frase del núcleo', () => {
    const s = pelea(['bola_de_fuego']);
    s.hechizos.selectSpell('bola_de_fuego');
    expect(s.hechizos.selectedSpell).toBe('bola_de_fuego');
    expect(s.status).toMatch(/pulsa la casilla donde lanzarlo/);
    const apunta = s.apuntado;
    if (apunta === null) throw new Error('no espera el clic');
    const cuerpo = s.battle.stacks.find((x) => x.id === 'attacker-heroe');
    if (cuerpo === undefined) throw new Error('sin cuerpo');
    const cerca = { col: cuerpo.hex.col + 2, row: cuerpo.hex.row };
    const lejos = { col: cuerpo.hex.col + 9, row: cuerpo.hex.row };
    expect(hexDistance(cuerpo.hex, lejos)).toBeGreaterThan(5);
    expect(loApuntadoEnCasilla(s, apunta, cerca)).toEqual({
      accion: { type: 'cast', spell: 'bola_de_fuego', at: cerca },
    });
    expect(loApuntadoEnCasilla(s, apunta, lejos)).toMatchObject({
      motivo: expect.stringMatching(/llega a 5 casillas/),
    });
  });

  it('uno a una unidad no se juzga por casilla', () => {
    const s = pelea(['berserker']);
    s.hechizos.selectSpell('berserker');
    const apunta = s.apuntado;
    if (apunta === null) throw new Error('no espera el clic');
    expect(loApuntadoEnCasilla(s, apunta, { col: 3, row: 3 })).toBeNull();
  });
});

describe('el agente', () => {
  it('manda «cast» con «at», y el núcleo lo juega', () => {
    const escrita = { type: 'cast', spell: 'bola_de_fuego', at: { col: 4, row: 4 } } as const;
    expect(battleActionSchema.safeParse(escrita).success).toBe(true);
    const s = pelea(['bola_de_fuego']);
    expect(accionDeBatallaDelAgente(escrita, formaDeLaBatalla(s.battle))).toEqual({
      type: 'cast',
      spell: 'bola_de_fuego',
      at: { col: 4, row: 4 },
    });
  });

  it('«spell_list» dice de cada hechizo a qué se lanza y lo que hace', () => {
    const lista = hechizosAlAgente();
    expect(lista).toHaveLength(todosLosHechizos().length);
    expect(lista.find((h) => h.id === 'meteoro')).toMatchObject({ target: 'tile', level: null });
    expect(lista.find((h) => h.id === 'onda_de_choque')?.target).toBe('self');
    expect(lista.find((h) => h.id === 'plegaria')?.target).toBe('all');
    expect(lista.find((h) => h.id === 'magic_arrow')).toMatchObject({
      target: 'enemy',
      level: 1,
      cost: 3,
    });
    expect(lista.find((h) => h.id === 'zombi_pegajoso')?.summary).toMatch(/no puede golpear/);
  });
});
