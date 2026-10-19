/**
 * El parte de guerra cuenta la espera y la defensa (#82), y se deja leer (#198):
 * sigue al final, y los homónimos llevan su letra. El color de la moral y la
 * suerte desde quien lee está con los demás colores, en `battle.test.ts`.
 *
 * Se callaban desde que el parte existe, cuando la IA no las jugaba nunca. Desde
 * #52 la IA espera en 49 de cada 100 batallas espejo, y quien mira veía a una
 * unidad quedarse quieta sin una línea que dijera que había cedido la
 * iniciativa. Los hechos de aquí los escribe el motor (`applyAction`), no se
 * fabrican a mano: lo que se comprueba es lo que de verdad llega al parte.
 */
import { describe, expect, it } from 'vitest';
import { type Html, html, marcadoDe, unir } from '../src/client/html.js';
import { desplazamientoTrasPintar, pintarSiguiendoElFinal } from '../src/client/views/al-final.js';
import { nombreEnElCampo } from '../src/client/views/distintivo.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import { activeStack, applyAction, createBattle } from '../src/core/battle/battle.js';
import { effectiveDefense } from '../src/core/battle/damage.js';
import type { BattleState, Side } from '../src/core/battle/types.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import { createRng } from '../src/core/rng.js';
import { startingArmy } from '../src/core/state/setup.js';

function espejo(semilla: number): { battle: BattleState; rng: ReturnType<typeof createRng> } {
  const rng = createRng(semilla);
  const battle = createBattle(
    { army: troopsAsStacks(startingArmy('templarios', rng)), hero: null },
    { army: troopsAsStacks(startingArmy('no-muertos', rng)), hero: null },
    rng,
  );
  return { battle, rng };
}

const parte = (battle: BattleState, mio: Side | null): string =>
  marcadoDe(renderBattleLog(battle, mio));

const otro = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');

describe('el parte de guerra cuenta la espera y la defensa (#82)', () => {
  it('la espera nombra a la unidad y su bando desde quien lee, y dice que cede la iniciativa', () => {
    const { battle, rng } = espejo(1);
    const quien = activeStack(battle);
    if (quien === null) throw new Error('la batalla espejo no tiene unidad activa');
    applyAction(battle, { type: 'wait' }, rng);
    const linea = 'cede la iniciativa y pasa al final de la ronda';

    // Con la letra de los homónimos (#198): el ejército de salida trae varios iguales.
    const nombre = nombreEnElCampo(battle, quien);
    expect(parte(battle, quien.side)).toContain(
      `<div>Espera ${nombre}, de tu bando: ${linea}</div>`,
    );
    expect(parte(battle, otro(quien.side))).toContain(
      `<div>Espera ${nombre}, del enemigo: ${linea}</div>`,
    );
    // El espectador y la arena leen sin bando: atacante o defensor, como la rendición.
    const rol = quien.side === 'attacker' ? 'atacante' : 'defensor';
    expect(parte(battle, null)).toContain(`<div>Espera ${nombre}, del ${rol}: ${linea}</div>`);
  });

  it('la defensa dice la cifra que de verdad aplica el motor y hasta cuándo', () => {
    const { battle, rng } = espejo(1);
    const quien = activeStack(battle);
    if (quien === null) throw new Error('la batalla espejo no tiene unidad activa');
    applyAction(battle, { type: 'defend' }, rng);

    // La cifra no se copia en el test: sale de lo que `effectiveDefense` hace
    // con el stack defendiéndose, así que si cambia la regla y no el texto,
    // esto se pone rojo.
    const pct = Math.round((effectiveDefense(quien) / quien.unit.defense - 1) * 100);
    expect(pct).toBeGreaterThan(0);
    expect(parte(battle, quien.side)).toContain(
      `<div>Se defiende ${nombreEnElCampo(battle, quien)}, de tu bando: +${pct}\u00a0% de defensa hasta el final de la ronda</div>`,
    );
  });

  it('cada espera que juega la IA en una batalla entera sale en el parte, una línea por espera', () => {
    // La primera semilla espejo en la que la IA espera: la regla de #52 se
    // dispara en la mitad de las batallas, así que no hay que ir lejos.
    let resuelta: BattleState | null = null;
    for (let s = 1; s <= 50 && resuelta === null; s++) {
      const { battle, rng } = espejo(s);
      const { state } = autoResolve(battle, rng);
      if (state.log.slice(-40).some((e) => e.kind === 'wait')) resuelta = state;
    }
    if (resuelta === null)
      throw new Error('ninguna de 50 batallas espejo espera en sus 40 últimos hechos');
    const esperas = resuelta.log.slice(-40).filter((e) => e.kind === 'wait').length;
    const lineas = parte(resuelta, null).match(/<div>Espera /g) ?? [];
    expect(lineas.length).toBe(esperas);
  });

  it('una espera de una unidad que no está en el campo lanza, no se pinta como «alguien»', () => {
    const { battle } = espejo(1);
    battle.log.push({ kind: 'wait', stack: 'fantasma' });
    expect(() => parte(battle, null)).toThrow(
      'el parte habla de una unidad que no está en el campo: fantasma',
    );
  });
});

describe('las unidades homónimas llevan una letra estable (#198)', () => {
  /** Los nombres de un bando, en el orden de `battle.stacks`. */
  const nombres = (battle: BattleState, side: Side): string[] =>
    battle.stacks.filter((s) => s.side === side).map((s) => nombreEnElCampo(battle, s));

  it('cada homónimo de un bando lleva su letra, A, B, C…, y el que no tiene igual va sin ella', () => {
    const { battle } = espejo(1);
    for (const side of ['attacker', 'defender'] as const) {
      const delBando = battle.stacks.filter((s) => s.side === side);
      const vistas = new Map<string, number>();
      for (const s of delBando) {
        const iguales = delBando.filter((x) => x.unit.name === s.unit.name).length;
        const n = vistas.get(s.unit.name) ?? 0;
        vistas.set(s.unit.name, n + 1);
        expect(nombreEnElCampo(battle, s)).toBe(
          iguales === 1 ? s.unit.name : `${s.unit.name} ${'ABCDEFG'[n]}`,
        );
      }
      // Y ningún nombre se repite en el bando, que es todo lo que se pedía.
      const todos = nombres(battle, side);
      expect(new Set(todos).size).toBe(todos.length);
    }
    // La semilla 1 tiene homónimos de verdad: si dejara de tenerlos, este test
    // no probaría nada.
    expect(nombres(battle, 'attacker').some((n) => / [A-G]$/.test(n))).toBe(true);
  });

  it('la letra no se mueve cuando cae una hermana: cuenta también a los caídos', () => {
    const { battle } = espejo(1);
    const homonimo = battle.stacks.find(
      (s) =>
        battle.stacks.filter((x) => x.side === s.side && x.unit.name === s.unit.name).length > 1,
    );
    if (homonimo === undefined) throw new Error('la semilla 1 no trae homónimos');
    const antes = battle.stacks.map((s) => nombreEnElCampo(battle, s));
    homonimo.count = 0;
    expect(battle.stacks.map((s) => nombreEnElCampo(battle, s))).toEqual(antes);
  });

  it('la letra que dice el parte es la del tablero, también con una copia del stack', () => {
    const { battle, rng } = espejo(1);
    const quien = activeStack(battle);
    if (quien === null) throw new Error('la batalla espejo no tiene unidad activa');
    // El tablero puede pintar una copia (la jugada que aún se cuenta): va por id.
    expect(nombreEnElCampo(battle, { ...quien })).toBe(nombreEnElCampo(battle, quien));
    applyAction(battle, { type: 'wait' }, rng);
    expect(parte(battle, null)).toContain(`Espera ${nombreEnElCampo(battle, quien)}, del`);
  });

  it('una unidad que no está en esta batalla lanza en vez de llevarse una letra cualquiera', () => {
    const { battle } = espejo(1);
    const homonimo = battle.stacks.find(
      (s) =>
        battle.stacks.filter((x) => x.side === s.side && x.unit.name === s.unit.name).length > 1,
    );
    if (homonimo === undefined) throw new Error('la semilla 1 no trae homónimos');
    expect(() => nombreEnElCampo(battle, { ...homonimo, id: 'fantasma' })).toThrow(
      `no se puede nombrar a ${homonimo.unit.name} (fantasma): no está en esta batalla`,
    );
  });
});

describe('el parte sigue al final salvo que se haya subido a leer (#198)', () => {
  const caja = (scrollTop: number, scrollHeight = 500, clientHeight = 192) => ({
    scrollTop,
    scrollHeight,
    clientHeight,
  });

  it('una caja nueva, o una que estaba al final, baja al final de la nueva', () => {
    expect(desplazamientoTrasPintar(undefined, 640)).toBe(640);
    expect(desplazamientoTrasPintar(caja(500 - 192), 640)).toBe(640);
    // Medio píxel por encima del fondo, que es lo que deja el zoom del navegador.
    expect(desplazamientoTrasPintar(caja(500 - 192 - 0.5), 640)).toBe(640);
    // Una caja que aún no desborda está al final aunque su `scrollTop` sea 0.
    expect(desplazamientoTrasPintar(caja(0, 100, 192), 640)).toBe(640);
  });

  it('si la persona había subido, se queda donde estaba', () => {
    expect(desplazamientoTrasPintar(caja(40), 640)).toBe(40);
    expect(desplazamientoTrasPintar(caja(0), 640)).toBe(0);
  });

  /**
   * Un `Element` de juguete: lo justo para `pintarSiguiendoElFinal`. Cada
   * `innerHTML` crea cajas nuevas con `scrollTop = 0`, como el navegador, una
   * por cada `data-al-final` del marcado, y de alto 20 px por línea.
   */
  function destinoDeJuguete() {
    let cajas: { nombre: string; scrollTop: number; scrollHeight: number; clientHeight: number }[] =
      [];
    const destino = {
      // Sin foco dentro: `pintar` lo mira antes de repintar.
      ownerDocument: { activeElement: null },
      set innerHTML(marcado: string) {
        cajas = [...marcado.matchAll(/data-al-final="(\w+)">((?:<div>[^<]*<\/div>)*)/g)].map(
          (m) => ({
            nombre: m[1] as string,
            scrollTop: 0,
            scrollHeight: Math.max(100, 20 * ((m[2] ?? '').match(/<div>/g) ?? []).length),
            clientHeight: 100,
          }),
        );
      },
      querySelectorAll: () =>
        cajas.map((c) =>
          Object.assign(c, { getAttribute: (_: string): string | null => c.nombre }),
        ),
    };
    return { destino: destino as unknown as Element, cajas: () => cajas };
  }

  const lineas = (n: number): Html =>
    unir(Array.from({ length: n }, (_, i) => html`<div>línea ${i}</div>`));

  it('repintar empareja cada caja con la suya por nombre y orden, no por posición', () => {
    const { destino, cajas } = destinoDeJuguete();
    // Como el espectador: el desenlace (un parte corto) y el parte entero.
    const pinta = (n: number) =>
      pintarSiguiendoElFinal(
        destino,
        html`<div data-al-final="parte">${lineas(2)}</div><div data-al-final="parte">${lineas(n)}</div>`,
      );
    pinta(10);
    expect(cajas().map((c) => c.scrollTop)).toEqual([100, 200]);
    // La persona sube a leer el parte entero; el desenlace se queda al final.
    cajas()[1]!.scrollTop = 20;
    pinta(12);
    expect(cajas().map((c) => c.scrollTop)).toEqual([100, 20]);
    // Vuelve al fondo y entra otra línea: lo sigue.
    cajas()[1]!.scrollTop = 240 - 100;
    pinta(13);
    expect(cajas()[1]!.scrollTop).toBe(260);
  });

  it('una caja que sustituye a otra de nombre distinto empieza al final, no donde se dejó la otra', () => {
    const { destino, cajas } = destinoDeJuguete();
    pintarSiguiendoElFinal(destino, html`<div data-al-final="cronica">${lineas(20)}</div>`);
    cajas()[0]!.scrollTop = 0;
    pintarSiguiendoElFinal(destino, html`<div data-al-final="parte">${lineas(20)}</div>`);
    expect(cajas()[0]!.scrollTop).toBe(400);
  });
});
