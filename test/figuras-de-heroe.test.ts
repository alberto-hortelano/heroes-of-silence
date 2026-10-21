/**
 * La figura del héroe (vuelta 2 del arranque, 19-10-2026: «al empezar la partida
 * nueva no he elegido al heroe y la imagen es el y_bot»). Cada tipo de héroe de
 * cada facción se pinta con una hoja de `assets/unidades/`
 * (`data/figuras-de-heroe.json`), y esa hoja la llevan el mapa, la base, la
 * batalla y el espectador: aquí, la tabla contra el disco y contra los tipos, y que
 * el héroe de la partida —el de la persona, el de la IA y el contratado— entra en
 * la batalla con la suya sin que la crónica deje de contarlo como «el héroe».
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import figurasJson from '../data/figuras-de-heroe.json' with { type: 'json' };
import tiposJson from '../data/tipos-de-heroe.json' with { type: 'json' };
import { HERO_BODY, queEs } from '../src/core/battle/types.js';
import {
  figuraDelHeroe,
  tipoDeHeroePorDefecto,
  tiposDeHeroe,
  validarFigurasDeHeroe,
  validarTiposDeHeroe,
} from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { applyAdventureAction } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { FACTION_IDS, type FactionId } from '../src/core/types.js';
import { hojasDelTaller } from '../tools/arena/borrador.js';

const RAIZ = join(import.meta.dirname, '..');
const TIPOS = validarTiposDeHeroe(tiposJson, FACTION_IDS);

describe('la tabla tipo → hoja (criterio 13)', () => {
  it('cada tipo de cada facción tiene su hoja, completa en ocho direcciones y con su retrato', () => {
    const hojas = new Map(hojasDelTaller(RAIZ).map((h) => [h.id, h]));
    for (const faction of FACTION_IDS) {
      for (const t of tiposDeHeroe(faction)) {
        const id = figuraDelHeroe({ faction, tipo: t.id });
        const hoja = hojas.get(id);
        expect(hoja, `${faction}/${t.id} → ${id}: no está en el taller`).toBeDefined();
        expect(hoja!.heroe).toBe(true);
        // Completa: con su arte propio en las ocho, no el Y Bot de su juego.
        expect(hoja!.incompleta, `${id}`).toBeNull();
        expect(hoja!.direcciones).toHaveLength(8);
        for (let d = 0; d < 8; d++) {
          expect(
            existsSync(join(RAIZ, 'assets/unidades', id, `d${d}`, 'atlas.webp')),
            `${id} d${d}`,
          ).toBe(true);
        }
        // El retrato de la elección del menú.
        expect(existsSync(join(RAIZ, 'assets/unidades', id, 'identidad.webp')), id).toBe(true);
      }
    }
  });

  it('no queda ninguna hoja de héroe sin tipo, ni en el taller ni en el disco', () => {
    // El Gran maestre templario era una hoja sin tipo en el cuaderno: «no debería
    // existir» (decisión del usuario), y se borró.
    const usadas = new Set(
      FACTION_IDS.flatMap((faction) =>
        tiposDeHeroe(faction).map((t) => figuraDelHeroe({ faction, tipo: t.id })),
      ),
    );
    const delTaller = hojasDelTaller(RAIZ)
      .filter((h) => h.heroe)
      .map((h) => h.id);
    const enDisco = readdirSync(join(RAIZ, 'assets/unidades')).filter((d) =>
      d.startsWith('heroe-'),
    );
    expect(delTaller.filter((id) => !usadas.has(id))).toEqual([]);
    expect(enDisco.filter((id) => !usadas.has(id))).toEqual([]);
    expect(new Set(enDisco)).toEqual(usadas);
  });

  it('los tipos sin arte ya no están en el catálogo (criterio 16)', () => {
    // Señor de las bestias (elfos) y Señor de la guerra montado en jabalí (orkos):
    // fuera del cuaderno, y el JSON regenerado desde él.
    const ids = FACTION_IDS.flatMap((f) => tiposDeHeroe(f).map((t) => t.id));
    expect(ids).not.toContain('senor_de_las_bestias');
    expect(ids).not.toContain('senor_de_la_guerra_montado_en_jabali');
  });

  it('dos tipos que comparten id en dos facciones (el mago) llevan cada uno la suya', () => {
    expect(figuraDelHeroe({ faction: 'imperio', tipo: 'mago' })).toBe('heroe-imperio-mago');
    expect(figuraDelHeroe({ faction: 'elfos', tipo: 'mago' })).toBe('heroe-elfo-druida');
  });

  it('un tipo que no es de su facción lanza diciéndolo, en vez de pintar el Y Bot', () => {
    expect(() => figuraDelHeroe({ faction: 'templarios', tipo: 'lich' })).toThrow(
      'el tipo de héroe "lich" no existe en templarios',
    );
  });
});

describe('validarFigurasDeHeroe muerde', () => {
  const buena = figurasJson as { figuras: Record<string, Record<string, string>> };
  const con = (cambiar: (f: Record<string, Record<string, string>>) => void): unknown => {
    const figuras = structuredClone(buena.figuras);
    cambiar(figuras);
    return { figuras };
  };

  it('el fichero de verdad vale', () => {
    expect(() => validarFigurasDeHeroe(figurasJson, TIPOS)).not.toThrow();
  });

  it('un tipo sin hoja', () => {
    expect(() =>
      validarFigurasDeHeroe(
        con((f) => {
          delete f.orkos!.goblin;
        }),
        TIPOS,
      ),
    ).toThrow('el tipo goblin (Goblin (Jefe goblin)) de orkos no tiene hoja');
  });

  it('una fila que no es ningún tipo (la de uno que el cuaderno retiró)', () => {
    expect(() =>
      validarFigurasDeHeroe(
        con((f) => {
          f.elfos!.senor_de_las_bestias = 'heroe-elfo-senor-de-las-bestias';
        }),
        TIPOS,
      ),
    ).toThrow('"senor_de_las_bestias" no es ningún tipo de héroe de elfos');
  });

  it('una hoja que no es un id de carpeta, una facción que no existe, y todo a la vez', () => {
    const mala = con((f) => {
      f.templarios!.caballero = 'Heroe Caballero';
      f.caballeros = { caballero: 'heroe-templario-caballero' };
      delete f.imperio!.mago;
    });
    expect(() => validarFigurasDeHeroe(mala, TIPOS)).toThrow(
      /data\/figuras-de-heroe\.json: la hoja del tipo caballero de templarios no es el id de una carpeta de assets\/unidades\/: "Heroe Caballero"; el tipo mago .* de imperio no tiene hoja; "caballeros" no es ninguna facción del motor/,
    );
  });
});

describe('el héroe de la partida pisa el tablero con la hoja de su tipo (criterio 14)', () => {
  /** La figura con que entraría en una batalla el héroe `id` de `state`. */
  const enLaBatalla = (state: ReturnType<typeof newGame>, faction: FactionId) =>
    state.heroes.filter((h) => h.faction === faction).map((h) => figuraDelHeroe(h));

  it('el de la persona con el tipo elegido, el de la IA con el de por defecto', () => {
    const state = newGame({ seed: 7, faccionDelJugador: 'elfos', tipoDelHeroe: 'cantora' });
    const [suyo, rival] = state.heroes;
    expect(suyo!.tipo).toBe('cantora');
    expect(figuraDelHeroe(suyo!)).toBe('heroe-elfo-cantora');
    expect(rival!.tipo).toBe(tipoDeHeroePorDefecto(rival!.faction));
    expect(enLaBatalla(state, 'elfos')).toEqual(['heroe-elfo-cantora']);
  });

  it('el contratado, con la hoja del tipo de por defecto de su facción', () => {
    const state = newGame({ seed: 7, faccionDelJugador: 'orkos', tipoDelHeroe: 'chaman_goblin' });
    state.players[0]!.oro = 100_000;
    const base = state.towns.find((t) => t.owner === 0)!;
    // El inicial está dentro: se le saca para que la base deje contratar.
    state.heroes[0]!.at = { x: base.at.x, y: base.at.y + 1 };
    applyAdventureAction(state, { type: 'hire_hero', town: base.id }, { rng: createRng(7) }, 0);
    const contratado = state.heroes.at(-1)!;
    expect(contratado.id).toMatch(/^hero-0-c/);
    expect(figuraDelHeroe(contratado)).toBe(
      figuraDelHeroe({ faction: 'orkos', tipo: tipoDeHeroePorDefecto('orkos') }),
    );
    expect(figuraDelHeroe(contratado)).toBe('heroe-orko-kaudillo');
  });

  it('la figura no es lo que el héroe ES: la crónica y el agente lo siguen contando como «hero»', () => {
    const stack = {
      body: 'heroe-lich',
      origen: { kind: 'heroe' as const, desnudo: {} as never },
    };
    expect(queEs(stack)).toBe(HERO_BODY);
  });
});

describe('el tipo del héroe en `newGame` (criterio 15)', () => {
  it('uno que no es de la facción del jugador lanza diciendo cuáles valen', () => {
    expect(() =>
      newGame({ seed: 7, faccionDelJugador: 'templarios', tipoDelHeroe: 'lich' }),
    ).toThrow('"lich" no es un tipo de héroe de templarios: valen caballero, monje, inquisidor');
  });

  it('pedir el de por defecto es no pedir nada, y otro solo cambia el tipo del héroe', () => {
    // Es presentación hasta que los tipos den habilidades: ni el mapa, ni la
    // tropa, ni nada más de la partida se mueve.
    const sin = newGame({ seed: 11, faccionDelJugador: 'imperio' });
    const porDefecto = newGame({
      seed: 11,
      faccionDelJugador: 'imperio',
      tipoDelHeroe: 'duelista',
    });
    const otro = newGame({ seed: 11, faccionDelJugador: 'imperio', tipoDelHeroe: 'ingeniero' });
    expect(porDefecto).toEqual(sin);
    expect(otro.heroes[0]!.tipo).toBe('ingeniero');
    expect({ ...otro, heroes: otro.heroes.map((h) => ({ ...h, tipo: '' })) }).toEqual({
      ...sin,
      heroes: sin.heroes.map((h) => ({ ...h, tipo: '' })),
    });
  });
});
