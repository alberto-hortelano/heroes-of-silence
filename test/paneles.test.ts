import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/comun/html.js';
import { renderSide, renderTopbar } from '../src/client/partida/paneles.js';
import { Session } from '../src/client/sesion/partida.js';
import { heroUnit, maxMana } from '../src/core/hero/hero.js';
import { umbral } from '../src/core/hero/rango.js';
import { tiposDeHeroe } from '../src/core/hero/tipos-de-heroe.js';
import { castilloSuyoDelHeroe } from '../src/core/state/consultas.js';
import { ascenderVeterano } from '../src/core/state/heroes.js';
import { conMiles, conSigno } from '../src/core/texto.js';
import type { Veterania } from '../src/core/types.js';
import { nivelDeUnidad } from '../src/core/unidad/nivel.js';
import { ponVeteranoEnLaBase } from '../tools/qa/agente/veterano-en-la-base.js';
import { TROPA, TROPA_BARATA } from './comun.js';
import { meAtacan } from './escenas-paneles.js';
import { fueraDeSuBase } from './partida-de-prueba.js';

/** «(+2)» o «(−1)»: lo que cambia el equipo una cifra del héroe, como lo dice la ficha. */
const conCambio = (base: number, total: number): string => `(${conSigno(total - base)})`;

describe('las cifras grandes se leen con separador de miles (QA, 12-10-2026)', () => {
  it('«176000 / 304000» se pinta «176 000 / 304 000», con un espacio que no se parte', () => {
    expect(conMiles(176_000)).toBe('176\u00A0000');
    expect(conMiles(1_234_567)).toBe('1\u00A0234\u00A0567');
    // Cuatro cifras, juntas (RAE); y lo pequeño, tal cual.
    expect(conMiles(2500)).toBe('2500');
    expect(conMiles(0)).toBe('0');
    expect(conMiles(-12_000)).toBe('-12\u00A0000');
    expect(() => conMiles(2.5)).toThrow('no es un entero');
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
    // Rango 5, el de la tropa que acaba; el nivel, el de su cuerpo de héroe.
    expect(salida).toContain(`HÉROE · RANGO 5 · NIVEL ${nivelDeUnidad(heroUnit(heroe))} · ${tipo}`);
    expect(salida).toContain('Vio caer &lt;i&gt;tres&lt;/i&gt; murallas &amp; siguió.');
    expect(salida).not.toContain('<i>tres');
  });
});

describe('la ficha del héroe cuenta lo que lleva puesto (I4)', () => {
  it('ataque y defensa enseñan la suma del equipo con la que pelea, y desnudo no', () => {
    // La ficha enseñaba «2 / 2» a un héroe que entraba en batalla con +3/+3 de
    // serie. El «(+N)» es lo que le suma el equipo, la misma suma que aplica
    // `heroUnit`: aquí se comprueba contra el cuerpo con el que pelea.
    const session = new Session(12);
    const heroe = session.myHeroes()[0]!;
    session.selectedHeroId = heroe.id;
    const desnudo = heroUnit({ ...heroe, equipo: {} });
    const puesto = heroUnit(heroe);
    expect(puesto.attack).toBeGreaterThan(desnudo.attack);
    // Desnudo, la defensa es su Defensa más su agilidad (25-10-2026).
    expect(desnudo.defense).toBe(heroe.defense + desnudo.agilidad);
    const ficha = `${desnudo.attack} ${conCambio(desnudo.attack, puesto.attack)} / ${desnudo.defense}${puesto.defense === desnudo.defense ? '' : ` ${conCambio(desnudo.defense, puesto.defense)}`}`;
    expect(marcadoDe(renderSide(session))).toContain(`<span>${ficha}</span>`);

    heroe.equipo = {};
    expect(marcadoDe(renderSide(session))).toContain(
      `<span>${desnudo.attack} / ${desnudo.defense}</span>`,
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
    const ficha = `${desnudo.attack} ${conCambio(desnudo.attack, puesto.attack)} / ${desnudo.defense}${puesto.defense === desnudo.defense ? '' : ` ${conCambio(desnudo.defense, puesto.defense)}`}`;
    expect(marcadoDe(renderSide(session))).toContain(`<span>${ficha}</span>`);
  });
});

describe('el «−1» en el panel del héroe en el mapa (licenciar en cualquier casilla, 09-11-2026)', () => {
  /** Las filas de la tropa del panel, una por grupo: lo que va tras «Tropa ·». */
  const filasDeLaTropa = (session: Session): string[] => {
    const marcado = marcadoDe(renderSide(session));
    const tropa = marcado.slice(marcado.indexOf('<h3>Tropa ·'));
    return tropa.split('<div class="stack">').slice(1);
  };
  const veterano = (id: string): Veterania => ({
    id,
    experiencia: 30,
    batallas: 1,
    bajas: 0,
    heroes: [],
    equipo: { arma: 'maza' },
  });

  it('fuera del castillo, un «−1» por tipo en la fila de quien se iría, junto a los «Equipar»; pulsarlo licencia', () => {
    const session = new Session(12);
    const heroe = fueraDeSuBase(session.state, session.viewer);
    expect(castilloSuyoDelHeroe(session.state, heroe)).toBeUndefined();
    session.selectedHeroId = heroe.id;
    // Un veterano con dos novatos de su tipo detrás (se iría un novato) y otro
    // veterano solo (se iría él). Los veteranos llevan maza: su «×» dice su id,
    // y así se sabe de quién es cada fila.
    heroe.army = [
      { creature: TROPA_BARATA, veterania: veterano('v-1') },
      { creature: TROPA_BARATA },
      { creature: TROPA_BARATA },
      { creature: TROPA, veterania: veterano('v-2') },
    ];
    const deVeterano = (id: string) => (f: string) => f.includes(`data-veteran="${id}"`);
    const licencia = (creature: string) =>
      `data-action="dismiss" data-hero="${heroe.id}" data-creature="${creature}"`;

    let filas = filasDeLaTropa(session);
    expect(filas).toHaveLength(3);
    expect(filas.filter((f) => f.includes('data-action="dismiss"'))).toHaveLength(2);
    expect(filas.find(deVeterano('v-1'))).not.toContain('data-action="dismiss"');
    const novatos = filas.find((f) => f.includes(licencia(TROPA_BARATA)));
    expect(novatos).toBeDefined();
    expect(novatos).not.toContain('data-veteran=');
    expect(filas.find(deVeterano('v-2'))).toContain(licencia(TROPA));

    // Con una pieza elegida, el «−1» y el «Equipar» conviven en la fila.
    heroe.mochila = ['daga'];
    session.selectItem('daga');
    filas = filasDeLaTropa(session);
    const conLosDos = filas.find((f) => f.includes(licencia(TROPA_BARATA)));
    expect(conLosDos).toContain('data-action="equip"');
    expect(filas.find(deVeterano('v-2'))).toContain('data-action="equip"');

    session.dismiss(heroe.id, TROPA_BARATA, 1);
    expect(session.status).toBe('');
    expect(heroe.army).toHaveLength(3);
    expect(heroe.army.filter((t) => t.creature === TROPA_BARATA)).toHaveLength(2);
    expect(marcadoDe(renderSide(session))).toContain('<h3>Tropa · 3 individuos</h3>');
  });
});

describe('la pantalla cuenta lo que hizo la magia (#54)', () => {
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
    const { renderPanelDeLaTropa } = await import('../src/client/partida/tropa/panel.js');
    const { TROPA } = await import('./comun.js');
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
    // El motivo es un rechazo del núcleo: en su color, el de la guarnición (H5; R2 de
    // la reorganización, 07-11-2026: hasta entonces, `motivo-apagado`, en el apagado).
    expect(fila).toContain(`<span class="veterania motivo">${mandoble.poner}</span>`);
    // El gambesón sí se le pone: encendido y sin motivo.
    const gambeson = m.slice(m.indexOf('data-item="gambeson"'));
    expect(gambeson).not.toContain('class="veterania motivo"');
    expect(gambeson).toMatch(/data-action="tropa-poner" data-item="gambeson" >Poner/);
    // Lo de serie: «de serie» y ningún botón de quitar en todo su equipo (es un novato).
    expect(m).toContain('class="de-serie"');
    expect(m).not.toContain('data-action="tropa-quitar"');
    // La lista dice dónde sale cada uno en su formación (la escena es el tablero de
    // despliegue), con la corona del héroe, como el panel del despliegue.
    const [heroe, primero] = vista.figuras;
    expect(m).toContain(`♛ ${hero.name} (${heroe!.sale.col},${heroe!.sale.row})`);
    expect(m).toContain(`(${primero!.sale.col},${primero!.sale.row})</span>`);
  });
});
