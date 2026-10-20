/**
 * La escena de la tropa, por la sesión de verdad (C1, C3-C6): abrirla y cerrarla,
 * la ficha de cada uno con sus cifras de las puertas de siempre, y repartir el
 * equipo por `equip` y `unequip`, con lo que no se puede apagado con el motivo
 * del núcleo.
 */
import { describe, expect, it } from 'vitest';
import { AYUDA_DE_LA_TROPA, Session } from '../src/client/session.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import { equipoPuestoDe, hojaDeUnidad } from '../src/core/catalogo.js';
import { figuraDelHeroe } from '../src/core/data.js';
import { rangoDeHeroe, umbral } from '../src/core/hero/experiencia.js';
import { heroUnit } from '../src/core/hero/hero.js';
import { troopUnit } from '../src/core/hero/troop.js';
import { indiceDePoder, nivelDeUnidad } from '../src/core/nivel.js';
import { ponerseBlocker, turnBlocker, unequipBlocker } from '../src/core/state/game.js';
import { TROPA, TROPA_BARATA } from './helpers.js';

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
  it('una figura por individuo más el héroe, cada uno con su hoja', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    const vista = s.vistaDeLaTropa()!;
    expect(vista.figuras).toHaveLength(hero.army.length + 1);
    expect(hero.army.length).toBeGreaterThan(0);
    expect(vista.figuras[0]!.cuerpo).toBe(figuraDelHeroe(hero));
    for (const [i, t] of hero.army.entries()) {
      expect(vista.figuras[i + 1]!.cuerpo).toBe(hojaDeUnidad(t.creature));
    }
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
    expect(vista.ficha.cifras).toEqual(troopUnit(hero.army[0]!, s.state.characters));
    expect(vista.ficha.rango).toBe(1);
    expect(vista.ficha.queEs).toMatch(/^Novato · /);
    expect(() => s.elegirEnLaTropa({ indice: 99 })).toThrow(
      `${hero.name} no lleva a nadie en el puesto 99 de su tropa`,
    );
  });
});

describe('repartir el equipo (C4, C5, C6)', () => {
  it('quitarle el gambesón al héroe lo manda a la mochila y su armadura baja', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    expect(hero.equipo.armadura).toBe('gambeson');
    const antes = s.vistaDeLaTropa()!.ficha.armadura;
    s.quitarALaElegida('armadura');
    expect(hero.mochila).toEqual(['gambeson']);
    expect(s.status).toBe(`Gambesón vuelve a la mochila de ${hero.name}.`);
    const f = s.vistaDeLaTropa()!.ficha;
    expect(f.armadura).toBeLessThan(antes);
    expect(f.armadura).toBe(armaduraDe(heroUnit(hero)));
    expect(f.mochila.map((m) => m.pieza.id)).toEqual(['gambeson']);
  });

  it('ponérselo al tercer novato de un tipo se lo pone a ÉL, y la elección no salta (QA, H2)', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    hero.army = [
      { creature: TROPA_BARATA },
      { creature: TROPA_BARATA },
      { creature: TROPA_BARATA },
    ];
    s.quitarALaElegida('armadura');
    s.elegirEnLaTropa({ indice: 2 });
    expect(s.vistaDeLaTropa()!.ficha.mochila[0]!.poner).toBeNull();
    s.ponerALaElegida('gambeson');
    expect(hero.army[2]!.veterania?.equipo).toEqual({ armadura: 'gambeson' });
    expect(hero.army[0]).toEqual({ creature: TROPA_BARATA });
    expect(hero.army[1]).toEqual({ creature: TROPA_BARATA });
    expect(s.elegidoEnLaTropa).toEqual({ indice: 2 });
    const cifras = troopUnit(hero.army[2]!, s.state.characters);
    expect(s.status).toBe(`${cifras.name} lleva ahora Gambesón.`);
    const vista = s.vistaDeLaTropa()!;
    expect(vista.elegida).toBe(3);
    expect(vista.figuras[3]!.id).toBe(hero.army[2]!.veterania!.id);
    expect(vista.ficha.cifras).toEqual(cifras);
    expect(vista.ficha.nivel).toBe(nivelDeUnidad(cifras));
    expect(vista.ficha.indice).toBe(indiceDePoder(cifras));
    // Lo suyo se le quita; lo de serie (su escudo) no lleva ×.
    const armadura = vista.ficha.huecos.find((h) => h.hueco === 'armadura')!;
    expect(armadura).toMatchObject({ deSerie: false, quitar: { motivo: null } });
    const escudo = vista.ficha.huecos.find((h) => h.hueco === 'escudo')!;
    expect(escudo.deSerie).toBe(true);
    expect(escudo.quitar).toBeNull();
    // Y de vuelta: se lo quita a ÉL, no al héroe.
    s.quitarALaElegida('armadura');
    expect(hero.army[2]!.veterania?.equipo).toEqual({});
    expect(hero.mochila).toEqual(['gambeson']);
    expect(hero.equipo.armadura).toBeUndefined();
  });

  it('a un novato, que no lleva nada suyo, quitarle algo lo rechaza el núcleo con su motivo', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    hero.army = [{ creature: TROPA_BARATA }];
    s.elegirEnLaTropa({ indice: 0 });
    s.quitarALaElegida('armadura');
    expect(s.status).toMatch(/^no se puede desequipar: .*/);
    expect(hero.army[0]).toEqual({ creature: TROPA_BARATA });
  });

  it('un doble clic en «Poner» o en «×» juega una vez y no escribe un error (QA, H6)', () => {
    const s = abierta();
    const hero = s.selectedHero!;
    s.quitarALaElegida('armadura');
    const quitado = s.status;
    // El segundo clic llega al botón de antes de repintar: nada cambió desde el primero.
    s.quitarALaElegida('armadura');
    expect(s.status).toBe(quitado);
    expect(hero.mochila).toEqual(['gambeson']);
    s.ponerALaElegida('gambeson');
    const puesto = s.status;
    expect(puesto).toBe(`${hero.name} lleva ahora Gambesón.`);
    s.ponerALaElegida('gambeson');
    expect(s.status).toBe(puesto);
    expect(hero.equipo.armadura).toBe('gambeson');
    expect(hero.mochila).toEqual([]);
    // Si algo cambió entremedias, ya no es la misma jugada repetida: llega al
    // núcleo, que la rechaza con su motivo (el fail-loud sigue en su sitio).
    s.elegirEnLaTropa({ heroe: true });
    s.ponerALaElegida('gambeson');
    expect(s.status).toBe(`no se puede equipar: ${hero.name} no lleva Gambesón en la mochila`);
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
    const s = abierta();
    const hero = s.selectedHero!;
    hero.army = [{ creature: TROPA }];
    hero.mochila = ['mandoble'];
    s.elegirEnLaTropa({ indice: 0 });
    expect(equipoPuestoDe(hero, { indice: 0 }).escudo).toBeDefined();
    const motivo = ponerseBlocker(hero, { indice: 0 }, 'mandoble');
    // No pide quitar el escudo, que es de serie y no se puede (QA, H4).
    expect(motivo).toMatch(
      /no admite Mandoble: es un arma a dos manos y su .* es de serie, que no se quita$/,
    );
    expect(s.vistaDeLaTropa()!.ficha.mochila).toEqual([expect.objectContaining({ poner: motivo })]);
    s.ponerALaElegida('mandoble');
    expect(s.status).toBe(`no se puede equipar: ${motivo}`);
    expect(hero.mochila).toEqual(['mandoble']);
  });

  it('fuera de tu turno todo sale apagado con el motivo del turno', () => {
    const s = abierta();
    s.state.current = 1;
    const motivo = turnBlocker(s.state, 0);
    const f = s.vistaDeLaTropa()!.ficha;
    expect(f.huecos.find((h) => h.hueco === 'armadura')!.quitar).toEqual({ motivo });
  });
});
