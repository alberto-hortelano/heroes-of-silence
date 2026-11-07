/**
 * La escena de la tropa, por la sesión de verdad (C1, C3-C6): abrirla y cerrarla,
 * la ficha de cada uno con sus cifras de las puertas de siempre, y repartir el
 * equipo por `equip` y `unequip`, con lo que no se puede apagado con el motivo
 * del núcleo. Y la formación (fase C del despliegue, 02-11-2026: «la vista de
 * tropa pasa a ser la de despliegue»): el tablero con cada uno en su casilla de
 * `formacionDe`, colocar por `formar` con la frase del núcleo, y la batalla
 * siguiente que despliega desde ahí.
 */
import { describe, expect, it } from 'vitest';
import { EscenaTropa } from '../src/client/escenas/tropa.js';
import { AYUDA_DE_LA_TROPA, Session } from '../src/client/session.js';
import { zonaDeSalida } from '../src/core/battle/despliegue.js';
import { EQUIPO } from '../src/core/equipo/pieza.js';
import { aDosManos, pieza } from '../src/core/hero/equipo.js';
import { rangoDeHeroe, umbral } from '../src/core/hero/experiencia.js';
import { heroUnit } from '../src/core/hero/hero.js';
import { troopUnit } from '../src/core/hero/troop.js';
import { turnBlocker } from '../src/core/state/consultas.js';
import {
  formacionDe,
  formarBlocker,
  ponerseBlocker,
  unequipBlocker,
} from '../src/core/state/game.js';
import type { Hex } from '../src/core/types.js';
import { UNIDADES } from '../src/core/unidad/catalogo.js';
import { indiceDePoder, nivelDeUnidad } from '../src/core/unidad/nivel.js';
import { sesionAntesDelMonstruo } from './batalla-de-cliente.js';
import { TROPA_BARATA } from './comun.js';

const SEMILLA = 7;

function abierta(): Session {
  const s = new Session(SEMILLA);
  s.abrirLaTropa();
  return s;
}

describe('abrir y cerrar la escena de la tropa (C1)', () => {
  it('sin héroe elegido o fuera de tu turno no se abre, y dice por qué', () => {
    const s = new Session(SEMILLA);
    s.selectedHeroId = null;
    expect(s.tropaBlocker()).toBe('Elige antes a uno de tus héroes para ver su tropa.');
    expect(() => s.abrirLaTropa()).toThrow(
      'no se puede abrir la tropa: Elige antes a uno de tus héroes para ver su tropa.',
    );
    const r = new Session(SEMILLA);
    r.state.current = 1;
    const motivo = turnBlocker(r.state, 0);
    expect(motivo).not.toBeNull();
    expect(r.tropaBlocker()).toBe(motivo);
    expect(() => r.abrirLaTropa()).toThrow(`no se puede abrir la tropa: ${motivo}`);
    expect(r.scene).toBe('adventure');
  });

  it('abre con el héroe elegido y al cerrar vuelve al mapa con el mismo héroe', () => {
    const s = new Session(SEMILLA);
    const id = s.selectedHeroId;
    s.abrirLaTropa();
    expect(s.scene).toBe('tropa');
    expect(s.status).toBe(AYUDA_DE_LA_TROPA);
    expect(s.elegidoEnLaTropa).toEqual({ heroe: true });
    s.cerrarLaTropa();
    expect(s.scene).toBe('adventure');
    expect(s.selectedHeroId).toBe(id);
    expect(s.vistaDeLaTropa()).toBeNull();
  });
});

describe('lo que se ve (C2, C3)', () => {
  it('el tablero de la formación: el héroe y cada uno de los suyos en su casilla de `formacionDe`, y nadie más', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const vista = s.vistaDeLaTropa()!;
    expect(hero.army.length).toBeGreaterThan(0);
    expect(vista.figuras).toHaveLength(hero.army.length + 1);
    const formacion = formacionDe(s.state, hero);
    expect(vista.figuras[0]).toMatchObject({ id: 'attacker-heroe', sale: formacion.heroe });
    for (const [i, h] of formacion.tropa.entries()) {
      expect(vista.figuras[i + 1]).toMatchObject({ id: `attacker-${i}`, sale: h });
    }
    // Solo lo propio, en despliegue: la tanda del atacante abierta y sin turno.
    expect(vista.batalla.stacks.map((x) => x.id).sort()).toEqual(
      vista.figuras.map((f) => f.id).sort(),
    );
    expect(vista.batalla.stacks.every((x) => x.side === 'attacker')).toBe(true);
    expect(vista.batalla.despliegue).not.toBeNull();
    expect(vista.batalla.turno).toBeNull();
    // La zona del elegido (el héroe) es la del núcleo, en el marco del atacante.
    expect(s.formacion.zona).toEqual(zonaDeSalida(heroUnit(hero), 'attacker'));
    // La vista no se rehace si nada cambia.
    expect(s.vistaDeLaTropa()).toBe(vista);
  });

  it('la ficha del héroe dice su rango, su experiencia y la del rango siguiente, y sus cifras', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const f = s.vistaDeLaTropa()!.ficha;
    const rango = rangoDeHeroe(hero);
    expect(f.rango).toBe(rango);
    expect(f.experiencia).toBe(hero.experience);
    expect(f.siguiente).toBe(umbral(rango + 1));
    expect(f.cifras).toEqual(heroUnit(hero));
    expect(f.nivel).toBe(nivelDeUnidad(heroUnit(hero)));
    expect(f.indice).toBe(indiceDePoder(heroUnit(hero)));
    expect(f.servicio).toBeNull();
  });

  it('elegir a uno de la tropa enseña su ficha: novato, rango 1, sin hoja de servicios', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    s.elegirEnLaTropa({ indice: 0 });
    const vista = s.vistaDeLaTropa()!;
    expect(vista.elegida).toBe(1);
    expect(vista.ficha.cifras).toEqual(troopUnit(hero.army[0]!));
    expect(vista.ficha.rango).toBe(1);
    expect(vista.ficha.queEs).toMatch(/^Novato · /);
    expect(() => s.elegirEnLaTropa({ indice: 99 })).toThrow(
      `${hero.name} no lleva a nadie en el puesto 99 de su tropa`,
    );
  });
});

describe('repartir el equipo (C4, C5, C6)', () => {
  it('a un novato, que no lleva nada suyo, quitarle algo lo rechaza el núcleo con su motivo', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    hero.army = [{ creature: TROPA_BARATA }];
    s.elegirEnLaTropa({ indice: 0 });
    s.quitarALaElegida('armadura');
    expect(s.status).toMatch(/^no se puede desequipar: .*/);
    expect(hero.army[0]).toEqual({ creature: TROPA_BARATA });
  });

  it('el arma del héroe sale sin poder quitarse, con el motivo de `unequipBlocker`', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const arma = s.vistaDeLaTropa()!.ficha.huecos.find((h) => h.hueco === 'arma')!;
    const motivo = unequipBlocker(s.state, 0, { type: 'unequip', hero: hero.id, slot: 'arma' });
    expect(motivo).not.toBeNull();
    expect(arma.quitar).toEqual({ motivo });
    // Si llega igual, falla con el mismo motivo y no cambia nada.
    s.quitarALaElegida('arma');
    expect(s.status).toBe(`no se puede desequipar: ${motivo}`);
    expect(hero.equipo.arma).toBe('espada');
  });

  it('una pieza a dos manos para quien lleva escudo de serie sale apagada con el motivo de `ponerseBlocker`', () => {
    // Elegidas por lo que son: la primera unidad con escudo de serie y la primera
    // arma a dos manos del catálogo.
    const conEscudo = UNIDADES.find((u) => u.equipo.escudo !== undefined);
    const dosManos = EQUIPO.find((p) => p.hueco === 'arma' && aDosManos(p));
    if (conEscudo === undefined || dosManos === undefined)
      throw new Error('el catálogo no tiene unidad con escudo de serie o arma a dos manos');
    const s = abierta();
    const hero = s.selectedHero!;
    hero.army = [{ creature: conEscudo.id }];
    hero.mochila = [dosManos.id];
    s.elegirEnLaTropa({ indice: 0 });
    const motivo = ponerseBlocker(hero, { indice: 0 }, dosManos.id);
    // No pide quitar el escudo, que es de serie y no se puede (QA, H4).
    expect(motivo).toBe(
      `esa unidad de ${conEscudo.name} no admite ${dosManos.nombre}: es un arma a dos manos y su ${pieza(conEscudo.equipo.escudo!).nombre} es de serie, que no se quita`,
    );
    expect(s.vistaDeLaTropa()!.ficha.mochila).toEqual([expect.objectContaining({ poner: motivo })]);
    // Si llega igual, el núcleo la rechaza con el mismo motivo y no cambia nada.
    s.ponerALaElegida(dosManos.id);
    expect(s.status).toBe(`no se puede equipar: ${motivo}`);
    expect(hero.mochila).toEqual([dosManos.id]);
    expect(hero.army).toEqual([{ creature: conEscudo.id }]);
  });

  it('fuera de tu turno todo sale apagado con el motivo del turno', () => {
    const s = abierta();
    s.state.current = 1;
    const motivo = turnBlocker(s.state, 0);
    const f = s.vistaDeLaTropa()!.ficha;
    expect(f.huecos.find((h) => h.hueco === 'armadura')!.quitar).toEqual({ motivo });
  });
});

describe('la formación en el tablero (fase C del despliegue)', () => {
  /** Una casilla de la zona de `x` (el marco del atacante) que no es la de nadie de la formación. */
  function libre(s: Session): Hex {
    const v = s.vistaDeLaTropa()!;
    const at = s.formacion.zona.find(
      (z) => !v.figuras.some((f) => f.sale.col === z.col && f.sale.row === z.row),
    );
    if (at === undefined) throw new Error('la zona del elegido no tiene hueco');
    return at;
  }

  it('colocar al héroe en un hueco lo pone ahí, lo guarda en él y sigue elegido', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const at = libre(s);
    const antes = formacionDe(s.state, hero);
    expect(s.formacion.dichoDeColocar(at)).toBe(`${hero.name} saldría en (${at.col},${at.row}).`);
    s.formacion.colocarEn(at);
    expect(s.status).toBe(`${hero.name} sale en (${at.col},${at.row}).`);
    expect(hero.salida).toEqual(at);
    const despues = formacionDe(s.state, hero);
    expect(despues.heroe).toEqual(at);
    // Nadie más se movió: la formación se congeló entera antes.
    expect(despues.tropa).toEqual(antes.tropa);
    expect(s.elegidoEnLaTropa).toEqual({ heroe: true });
    const v = s.vistaDeLaTropa()!;
    expect(v.figuras[v.elegida]!.sale).toEqual(at);
    expect(s.formacion.elegido?.hex).toEqual(at);
  });

  it('elegir a uno de la tropa y colocarlo en la casilla del héroe los cambia', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const antes = formacionDe(s.state, hero);
    s.formacion.elegir('attacker-0');
    expect(s.elegidoEnLaTropa).toEqual({ indice: 0 });
    const nombre = troopUnit(hero.army[0]!).name;
    expect(s.status).toBe(
      `${nombre}: su ficha está en el panel; pulsa la casilla verde donde sale.`,
    );
    expect(s.vistaDeLaTropa()!.ficha.nombre).toBe(nombre);
    s.formacion.colocarEn(antes.heroe);
    expect(s.status).toBe(`${nombre} y ${hero.name} se cambian de sitio.`);
    const despues = formacionDe(s.state, hero);
    expect(despues.heroe).toEqual(antes.tropa[0]);
    expect(despues.tropa[0]).toEqual(antes.heroe);
    // Y la ficha sigue al elegido, que es el mismo.
    expect(s.elegidoEnLaTropa).toEqual({ indice: 0 });
    expect(s.vistaDeLaTropa()!.ficha.nombre).toBe(nombre);
  });

  it('fuera de su zona, la frase del núcleo en la barra y nadie se mueve', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const antes = formacionDe(s.state, hero);
    const at = { col: 8, row: 4 };
    const motivo = formarBlocker(s.state, 0, {
      type: 'formar',
      hero: hero.id,
      quien: { heroe: true },
      at,
    });
    expect(motivo).toMatch(/queda fuera de la zona de salida/);
    const frase = `${motivo!.charAt(0).toUpperCase()}${motivo!.slice(1)}.`;
    expect(s.formacion.dichoDeColocar(at)).toBe(frase);
    s.formacion.colocarEn(at);
    expect(s.status).toBe(frase);
    expect(formacionDe(s.state, hero)).toEqual(antes);
    expect(hero.salida).toBeUndefined();
  });

  it('fuera de tu turno no se coloca, con el motivo del turno', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const at = libre(s);
    s.state.current = 1;
    s.formacion.colocarEn(at);
    expect(s.status).toBe(turnBlocker(s.state, 0));
    expect(hero.salida).toBeUndefined();
  });

  it('las flechas mueven al elegido a la casilla de al lado, juzgada por el núcleo', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const desde = formacionDe(s.state, hero).heroe;
    // El héroe sale en el centro de la columna del borde: a la derecha hay sitio.
    s.formacion.mover(1, 0);
    expect(formacionDe(s.state, hero).heroe).toEqual({ col: desde.col + 1, row: desde.row });
    // Y a la izquierda del borde no hay casilla: lo dice y no se mueve.
    s.formacion.mover(-1, 0);
    s.formacion.mover(-1, 0);
    expect(s.status).toMatch(/no es una casilla del tablero|fuera de la zona/i);
    expect(formacionDe(s.state, hero).heroe).toEqual(desde);
  });

  it('la escena: el clic en el centro de una casilla verde coloca; sobre el cuerpo de otro, lo elige', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const escena = new EscenaTropa(() => s);
    escena.encuadrar(1280, 720);
    expect(escena.marca).toBe('attacker-heroe');
    const at = libre(s);
    const c = escena.centroDe(at);
    expect(escena.mover(c.x, c.y)).toBe(true);
    expect(s.status).toBe(`${hero.name} saldría en (${at.col},${at.row}).`);
    expect(escena.pulsar(c.x, c.y)).toBe(true);
    expect(formacionDe(s.state, hero).heroe).toEqual(at);
    // El cuerpo del primero de la tropa (por encima de sus pies): lo elige.
    const caja = escena.cajaDe('attacker-0')!;
    expect(escena.pulsar(caja.x, caja.suelo - caja.alto * 0.6)).toBe(true);
    expect(s.elegidoEnLaTropa).toEqual({ indice: 0 });
    expect(escena.marca).toBe('attacker-0');
    // Fuera del tablero no hace nada.
    expect(escena.pulsar(2, 2)).toBe(false);
  });

  it('la batalla siguiente despliega desde la formación guardada', () => {
    const { s, at } = sesionAntesDelMonstruo();
    const hero = s.selectedHero!;
    s.abrirLaTropa();
    s.formacion.colocarEn(libre(s));
    s.formacion.elegir('attacker-0');
    s.formacion.colocarEn(formacionDe(s.state, hero).heroe);
    const formacion = formacionDe(s.state, hero);
    s.cerrarLaTropa();
    s.clickTile(at);
    const b = s.battle;
    expect(b).not.toBeNull();
    expect(s.despliegue.enCurso?.side).toBe('attacker');
    const en = (id: string) => b!.stacks.find((x) => x.id === id)!.hex;
    expect(en('attacker-heroe')).toEqual(formacion.heroe);
    for (const [i, h] of formacion.tropa.entries()) expect(en(`attacker-${i}`)).toEqual(h);
  });
});
