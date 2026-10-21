/**
 * El ancla del marcado de los paneles.
 *
 * No comprueba que el marcado sea BUENO: comprueba que sea **el mismo**. Existe
 * para una tarea concreta —pasar las 169 interpolaciones de `views/panels.ts`
 * por la puerta de escapar sin mover un píxel— y para la clase de cambio que
 * viene detrás: uno mecánico, sobre líneas que ningún test mira, donde un
 * espacio de más o un `&lt;` donde había un `<` no lo ve nadie.
 *
 * Las quince escenas están en `escenas-paneles.ts` y buscan ramas, no realismo:
 * el castillo con héroe dentro y sin él, la batalla en marcha y terminada, el
 * turno del rival —lo único que enseña un botón deshabilitado—, y dos volcados
 * sintéticos con los quince hechos del parte de guerra y los diecisiete de la
 * crónica, que jugando no salen nunca todos.
 *
 * Si sale rojo: mira el diff. Si el cambio de píxel se quería, se regenera con
 * `npx tsx tools/qa/ancla-paneles.ts` y el fichero va en el mismo commit que lo
 * justifica. El generador NO lo llama este test a propósito: un ancla que se
 * repone sola certifica lo que acabe de salir.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { Session } from '../src/client/session.js';
import { renderSide, renderTopbar } from '../src/client/views/panels.js';
import { tiposDeHeroe } from '../src/core/data.js';
import { umbral } from '../src/core/hero/experiencia.js';
import { type Hero, heroUnit, maxMana } from '../src/core/hero/hero.js';
import { ascenderVeterano } from '../src/core/state/game.js';
import { conMiles } from '../src/core/types.js';
import { ponVeteranoEnLaBase } from '../tools/qa/veterano-en-la-base.js';
import { meAtacan, volcado } from './escenas-paneles.js';

const ANCLA = fileURLToPath(new URL('fixtures/paneles.txt', import.meta.url));

describe('el marcado de los paneles', () => {
  it('sale byte a byte igual que su ancla', async () => {
    const esperado = readFileSync(ANCLA, 'utf8');
    const salida = await volcado();

    // Se comparan por líneas y no de un tirón: con 34 KB en un solo `toBe`, el
    // diff que enseña vitest es ilegible y lo que importa es la PRIMERA línea
    // que se mueve, que es la que dice qué interpolación se torció.
    const suyas = esperado.split('\n');
    const mias = salida.split('\n');
    for (let i = 0; i < Math.max(suyas.length, mias.length); i++) {
      expect(mias[i], `línea ${i + 1} del volcado`).toBe(suyas[i]);
    }
    expect(salida).toBe(esperado);
  });
});

describe('las cifras grandes se leen con separador de miles (QA, 12-10-2026)', () => {
  it('«176000 / 304000» se pinta «176 000 / 304 000», con un espacio que no se parte', () => {
    expect(conMiles(176_000)).toBe('176\u00A0000');
    expect(conMiles(1_234_567)).toBe('1\u00A0234\u00A0567');
    // Cuatro cifras, juntas (RAE); y lo pequeño, tal cual.
    expect(conMiles(2500)).toBe('2500');
    expect(conMiles(0)).toBe('0');
    expect(conMiles(-12_000)).toBe('-12\u00A0000');
    expect(() => conMiles(2.5)).toThrow('no es un entero');
    // En el panel, la experiencia del héroe recién hecho (base 9 000 desde el 19-10-2026).
    expect(readFileSync(ANCLA, 'utf8')).toContain(
      '<span class="label">Experiencia</span><span>99\u00A0000 / 171\u00A0000</span>',
    );
  });
});

describe('la barra de arriba cuenta cómo acabó la partida', () => {
  it('el empate por días no se pinta como una derrota', () => {
    // Aquí y **no** con una escena más en el ancla: `escenas-paneles.ts` vuelca
    // `renderTopbar.resources` y no `.turn`, así que una escena de más movería
    // 34 KB de fixtura sin llegar a mirar la línea que cambia.
    //
    // Lo que vigila es que `winner === session.viewer` con un `null` delante es
    // `false` y **compila**: el ternario anidado de antes anunciaba «Partida
    // perdida» a una partida que no ha perdido nadie.
    const session = new Session(3);
    expect(renderTopbar(session).turn).toBe('Tu turno');

    session.state.finished = { winner: 0 };
    expect(renderTopbar(session).turn).toBe('Partida ganada');

    session.state.finished = { winner: 1 };
    expect(renderTopbar(session).turn).toBe('Partida perdida');

    session.state.finished = { winner: null };
    expect(renderTopbar(session).turn).toBe('Partida sin resolver');
  });
});

describe('el héroe nacido de la tropa en el panel del cliente', () => {
  it('enseña su tipo en la cabecera y su historia escapada debajo del nombre', () => {
    const session = new Session(5);
    const yo = session.viewer;
    const id = ponVeteranoEnLaBase(session.state, yo);
    const heroe = ascenderVeterano(session.state, yo, id, {
      name: 'Ana',
      story: 'Vio caer <i>tres</i> murallas & siguió.',
      heroType: tiposDeHeroe(session.state.players.find((p) => p.id === yo)!.faction)[2]!.id,
    });
    session.selectedHeroId = heroe.id;
    const salida = marcadoDe(renderSide(session));
    const tipo = tiposDeHeroe(heroe.faction)[2]!.nombre;
    // Rango 5, el de la tropa que acaba; nivel 3, el de su cuerpo de héroe.
    expect(salida).toContain(`HÉROE · RANGO 5 · NIVEL 4 · ${tipo}`);
    expect(salida).toContain('Vio caer &lt;i&gt;tres&lt;/i&gt; murallas &amp; siguió.');
    expect(salida).not.toContain('<i>tres');
  });
});

describe('la ficha del héroe cuenta lo que lleva puesto (I4)', () => {
  it('ataque y defensa enseñan la suma del equipo con la que pelea, y desnudo no', () => {
    // La ficha enseñaba «2 / 2» a un héroe que entraba en batalla con +3/+3 de
    // serie. El «(+N)» sale de `sumaDeEquipo`, la misma suma que aplica
    // `heroUnit`: aquí se comprueba contra el cuerpo con el que pelea.
    const session = new Session(12);
    const heroe = session.myHeroes()[0]!;
    session.selectedHeroId = heroe.id;
    const extraA = heroUnit(heroe).attack - heroUnit({ ...heroe, equipo: {} }).attack;
    const extraD = heroUnit(heroe).defense - heroUnit({ ...heroe, equipo: {} }).defense;
    expect(extraA).toBeGreaterThan(0);
    const ficha = `${heroe.attack} (+${extraA}) / ${heroe.defense} (+${extraD})`;
    expect(marcadoDe(renderSide(session))).toContain(`<span>${ficha}</span>`);

    heroe.equipo = {};
    expect(marcadoDe(renderSide(session))).toContain(
      `<span>${heroe.attack} / ${heroe.defense}</span>`,
    );
  });

  it('la cifra de fuera incluye lo que da el rango: un héroe de rango 6 pega uno más (A2)', () => {
    // Sumar `hero.attack + equipo` en el panel se saltaba `ataquePorRango`, y la
    // ficha de un rango 6 enseñaba uno menos de lo que pegaba.
    const session = new Session(12);
    const heroe = session.myHeroes()[0]!;
    session.selectedHeroId = heroe.id;
    heroe.experience = umbral(6);
    const desnudo = heroUnit({ ...heroe, equipo: {} });
    const puesto = heroUnit(heroe);
    expect(desnudo.attack).toBeGreaterThan(heroe.attack);
    const ficha = `${desnudo.attack} (+${puesto.attack - desnudo.attack}) / ${desnudo.defense} (+${puesto.defense - desnudo.defense})`;
    expect(marcadoDe(renderSide(session))).toContain(`<span>${ficha}</span>`);
  });
});

describe('la fila de un equipado (M5)', () => {
  it('«Lleva:» es solo texto, y los botones para quitar van en su línea con el nombre de la pieza', () => {
    const session = new Session(12);
    const heroe = session.myHeroes()[0]!;
    session.selectedHeroId = heroe.id;
    heroe.army = [
      {
        creature: 'goblin-lancero',
        veterania: {
          id: 'veterano-1',
          experiencia: 0,
          batallas: 0,
          bajas: 0,
          heroes: [],
          equipo: { arma: 'espada', armadura: 'brigantina' },
        },
      },
    ];
    const salida = marcadoDe(renderSide(session));
    expect(salida).toContain(
      '<span class="veterania">Lleva: Espada, Brigantina</span><span class="quitar-equipo">',
    );
    expect(salida).toMatch(
      /data-slot="armadura" data-veteran="veterano-1"[^>]*>× Brigantina<\/button>/,
    );
  });
});

describe('la pantalla cuenta lo que hizo la magia (#54)', () => {
  /**
   * El inicial nace con la Flecha mágica (`setup`) y aprende lo demás en el
   * gremio; el contratado lo aprende todo de golpe en el orden del gremio. Los
   * dos saben lo mismo y en el estado lo guardan en distinto orden.
   */
  function dosLibrosIguales(): { session: Session; inicial: Hero; contratado: Hero } {
    const session = new Session(12);
    const pueblo = session.myTowns()[0]!;
    const inicial = session.myHeroes()[0]!;
    // Nace dentro de su castillo (19-10-2026): se abre, sin andar hasta él.
    expect(inicial.at).toEqual(pueblo.at);
    session.openTown(pueblo.id);
    session.build('mage_guild_1');
    // El inicial deja el castillo para que el contratado nazca dentro.
    inicial.at = { ...inicial.at, x: inicial.at.x + 1 };
    session.openTown(pueblo.id);
    session.hireHero();
    const contratado = session.myHeroes().find((h) => h.id !== inicial.id)!;
    expect(new Set(inicial.spells)).toEqual(new Set(contratado.spells));
    expect(inicial.spells).not.toEqual(contratado.spells);
    return { session, inicial, contratado };
  }

  /** Los nombres de la lista que sigue al rótulo `{titulo}` (con `title` o sin él), en orden. */
  function lista(marcado: string, titulo: string): string[] {
    const desde = Math.max(
      marcado.indexOf(`<h3>${titulo}</h3>`),
      marcado.indexOf(`<h3 title="${titulo}">${titulo}</h3>`),
    );
    expect(desde).toBeGreaterThanOrEqual(0);
    const bloque = marcado.slice(desde).split('</div></div>')[0]!;
    return [...bloque.matchAll(/<div class="stack"><span>([^<]+)</g)].map((m) => m[1]!);
  }

  it('el libro del héroe va en el mismo orden que el gremio, lo aprendiera como lo aprendiera', () => {
    const { session, inicial, contratado } = dosLibrosIguales();
    session.closeTown();
    session.selectedHeroId = inicial.id;
    const delInicial = lista(marcadoDe(renderSide(session)), 'Hechizos');
    session.selectedHeroId = contratado.id;
    const delContratado = lista(marcadoDe(renderSide(session)), 'Hechizos');
    expect(delInicial).toEqual(delContratado);
    expect(delInicial).toEqual(['Prisa', 'Flecha mágica', 'Lentitud']);
  });

  it('el castillo enseña el libro del que está dentro y lo que aprendió allí', () => {
    const { session, contratado } = dosLibrosIguales();
    const marcado = marcadoDe(renderSide(session));
    expect(marcado).toContain(`<p class="cost">${contratado.name} está dentro.</p>`);
    expect(lista(marcado, 'Libro del héroe')).toEqual(['Prisa', 'Flecha mágica', 'Lentitud']);
    expect(marcado).toContain('<p class="cost">Aprendió aquí: Prisa, Flecha mágica, Lentitud.</p>');
  });

  it('el castillo sin nada aprendido allí no inventa la línea', () => {
    const session = new Session(12);
    const pueblo = session.myTowns()[0]!;
    session.openTown(pueblo.id);
    const marcado = marcadoDe(renderSide(session));
    // El nombre va en su línea, no en el rótulo: con tema, la barra es de una
    // línea y no cabía (QA del arranque, H3).
    expect(marcado).toContain('<h3>Libro del héroe</h3>');
    expect(marcado).toContain(`<p class="cost">${session.myHeroes()[0]!.name} está dentro.</p>`);
    expect(marcado).not.toContain('Aprendió aquí');
  });

  it('los hechizos de batalla van en el orden del libro', () => {
    const session = meAtacan(7);
    session.advanceEnemyTurns();
    // Defiende la persona (`meAtacan`); el libro de batalla es de solo lectura.
    session.battle!.heroes.defender = {
      ...session.battleHero!,
      spells: ['slow', 'magic_arrow', 'haste'],
    };
    expect(session.spellOptions().map((o) => o.id)).toEqual(['haste', 'magic_arrow', 'slow']);
  });

  it('al terminar la batalla sigue la fila de Maná, salvo si el héroe cayó', () => {
    const session = meAtacan(7);
    const batalla = session.battle!;
    const heroe = session.battleHero!;
    heroe.mana = 4;
    const fila = `<span class="label">Maná</span><span>4 / ${maxMana(heroe)}</span>`;

    batalla.finished = { winner: 'defender' };
    expect(marcadoDe(renderSide(session))).toContain(fila);
    batalla.finished = { winner: 'attacker', surrender: { gold: 100 } };
    expect(marcadoDe(renderSide(session))).toContain(fila);
    batalla.finished = { winner: 'attacker' };
    expect(marcadoDe(renderSide(session))).not.toContain('Maná');
  });
});

describe('el panel de la escena de la tropa', () => {
  it('cada «Poner» apagado lleva su motivo escrito debajo, y lo de serie no lleva ×', async () => {
    const { renderPanelDeLaTropa } = await import('../src/client/views/tropa.js');
    const { TROPA } = await import('./helpers.js');
    const s = new Session(7);
    s.abrirLaTropa();
    const hero = s.selectedHero!;
    hero.army = [{ creature: TROPA }];
    hero.mochila = ['mandoble', 'gambeson'];
    s.elegirEnLaTropa({ indice: 0 });
    const vista = s.vistaDeLaTropa()!;
    const m = marcadoDe(renderPanelDeLaTropa(vista));
    const mandoble = vista.ficha.mochila.find((p) => p.pieza.id === 'mandoble')!;
    expect(mandoble.poner).not.toBeNull();
    const fila = m.slice(m.indexOf('data-item="mandoble"'), m.indexOf('data-item="gambeson"'));
    expect(fila).toContain('disabled>Poner</button>');
    expect(fila).toContain(`<span class="motivo-apagado">${mandoble.poner}</span>`);
    // El gambesón sí se le pone: encendido y sin motivo.
    const gambeson = m.slice(m.indexOf('data-item="gambeson"'));
    expect(gambeson).not.toContain('motivo-apagado');
    expect(gambeson).toMatch(/data-action="tropa-poner" data-item="gambeson" >Poner/);
    // Lo de serie: «de serie» y ningún botón de quitar en todo su equipo (es un novato).
    expect(m).toContain('class="de-serie"');
    expect(m).not.toContain('data-action="tropa-quitar"');
  });
});
