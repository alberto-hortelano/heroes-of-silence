/**
 * Las formas de muralla de la arena: los ejemplos, el borrador
 * (`data/borradores/murallas.json`) validado forma a forma y escrito sin
 * perder lo que no se tocó, y la pelea de la arena con la muralla puesta.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderMuralla } from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { despliegueDeArenaBlocker, finalDeArena } from '../src/core/arena.js';
import {
  COMENTARIO_DEL_BORRADOR_DE_MURALLAS,
  columna,
  FORMAS_DE_EJEMPLO,
  revisarBorradorDeMurallas,
  validarBorradorDeMurallas,
  validarFormaDeMuralla,
} from '../src/core/arena-murallas.js';
import { stackHexes } from '../src/core/battle/battle.js';
import { FORMA_DEL_TABLERO, hexKey } from '../src/core/battle/board.js';
import { validarMuralla } from '../src/core/battle/muralla.js';
import { LIDERAZGO } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { escribirMurallas, leerMurallas, RUTA_DE_MURALLAS } from '../tools/arena/borrador.js';
import {
  aPelear,
  montajeDePrueba,
  peleaDelMotor,
  sesionDeArena,
  unidadDeArena,
} from './helpers.js';

const RAIZ = resolve(import.meta.dirname, '..');
const unidad = unidadDeArena;

const muro = {
  muros: [{ col: 6, row: 2 }],
  puertas: [{ a: { col: 6, row: 3 }, b: { col: 7, row: 3 } }],
};

describe('las formas de ejemplo', () => {
  it('validan y montan batalla con siete grandes por bando', () => {
    expect(FORMAS_DE_EJEMPLO.map((f) => f.nombre)).toEqual([
      'Línea recta',
      'Línea con puerta',
      'Semicírculo',
      'En L',
      'Muralla gruesa',
      'Semicírculo grueso',
    ]);
    // Grandes por el motor: la arena ya no las hace (13-10-2026), y el despliegue
    // junto a los muros es del motor.
    const grandes = Array.from({ length: LIDERAZGO.maxPorBando }, () => ({
      unidad: unidad('troll-maza'),
      grande: true,
    }));
    for (const f of FORMAS_DE_EJEMPLO) {
      const b = peleaDelMotor(grandes, grandes, createRng(1), f.muralla);
      const cerradas = new Set(f.muralla.muros.map(hexKey));
      for (const s of b.stacks) {
        for (const h of stackHexes(s)) expect(cerradas.has(hexKey(h)), f.nombre).toBe(false);
      }
      // Y ninguna grande empieza con una puerta, que empieza cerrada, entre cabeza y cola.
      for (const s of b.stacks) {
        const [cabeza, cola] = stackHexes(s);
        for (const p of f.muralla.puertas) {
          const parte = [cabeza, cola].every(
            (h) => h !== undefined && (hexKey(h) === hexKey(p.a) || hexKey(h) === hexKey(p.b)),
          );
          expect(parte, f.nombre).toBe(false);
        }
      }
      expect(b.muralla).toEqual(f.muralla);
    }
  });

  it('no se guardan con su nombre', () => {
    expect(() => validarFormaDeMuralla({ nombre: 'Línea recta', muralla: muro })).toThrow(
      '«Línea recta» es una forma de ejemplo: guárdala con otro nombre',
    );
    // Ni cambiando mayúsculas ni con espacios alrededor.
    expect(() => validarFormaDeMuralla({ nombre: '  en l ', muralla: muro })).toThrow(
      'es una forma de ejemplo',
    );
  });
});

describe('validarFormaDeMuralla', () => {
  it('acepta nombre y muralla, y recorta el nombre', () => {
    expect(validarFormaDeMuralla({ nombre: ' Torreón ', muralla: muro })).toEqual({
      nombre: 'Torreón',
      muralla: muro,
    });
  });

  it('lanza diciendo qué falta o qué sobra', () => {
    expect(() => validarFormaDeMuralla({ muralla: muro })).toThrow(
      'la forma de muralla: el nombre tiene que ser un texto no vacío',
    );
    expect(() => validarFormaDeMuralla({ nombre: '   ', muralla: muro })).toThrow(
      'el nombre tiene que ser un texto no vacío',
    );
    expect(() => validarFormaDeMuralla({ nombre: 'x'.repeat(41), muralla: muro })).toThrow(
      'pasa de 40 letras',
    );
    expect(() => validarFormaDeMuralla({ nombre: 'A', muralla: muro, color: 'rojo' })).toThrow(
      'la forma no entiende «color»',
    );
    expect(() =>
      validarFormaDeMuralla({ nombre: 'A', muralla: { muros: [{ col: 0, row: 9 }], puertas: [] } }),
    ).toThrow('la forma «A»: la muralla: el muro 1 cae en (0,9), fuera del tablero');
  });
});

describe('el borrador de murallas', () => {
  it('separa las que valen de las que no, cada una con su motivo', () => {
    const buena = { nombre: 'Torreón', muralla: muro };
    const mala = { nombre: 'Rota', muralla: { muros: [{ col: 99, row: 0 }], puertas: [] } };
    const repetida = { nombre: 'Torreón', muralla: muro };
    const { validas, invalidas } = revisarBorradorDeMurallas({ formas: [buena, mala, repetida] });
    expect(validas).toEqual([buena]);
    expect(invalidas.map((i) => [i.nombre, i.motivo])).toEqual([
      [
        'Rota',
        `la forma «Rota»: la muralla: el muro 1 cae en (99,0), fuera del tablero (${FORMA_DEL_TABLERO})`,
      ],
      ['Torreón', 'la forma «Torreón» está dos veces en el borrador'],
    ]);
    expect(invalidas[0]?.crudo).toBe(mala);
    // Una forma guardada antes de la ampliación 4, con la puerta en una casilla:
    // no vale, se dice por qué y se conserva tal cual (C31).
    const vieja = {
      nombre: 'Vieja',
      muralla: { muros: [{ col: 7, row: 1 }], puertas: [{ col: 7, row: 4 }] },
    };
    const conVieja = revisarBorradorDeMurallas({ formas: [vieja] });
    expect(conVieja.validas).toEqual([]);
    expect(conVieja.invalidas[0]?.motivo).toBe(
      'la forma «Vieja»: la muralla: la puerta 1 es una casilla, como antes; ahora una puerta va entre dos casillas vecinas en horizontal: {a, b}, con b al este de a',
    );
    expect(conVieja.invalidas[0]?.crudo).toBe(vieja);
    expect(() => revisarBorradorDeMurallas({ unidades: [] })).toThrow(
      'el borrador de murallas tiene que ser { formas: [...] }',
    );
    expect(() => validarBorradorDeMurallas({ formas: [buena, repetida] })).toThrow(
      'está dos veces',
    );
  });

  describe('en disco', () => {
    let dir: string | null = null;
    afterEach(() => {
      if (dir !== null) rmSync(dir, { recursive: true, force: true });
      dir = null;
    });

    it('lo que no valida no se escribe; lo que valida vuelve igual', () => {
      dir = mkdtempSync(join(tmpdir(), 'murallas-'));
      const ruta = join(dir, RUTA_DE_MURALLAS);
      expect(leerMurallas(dir)).toEqual({ formas: [], invalidas: [] });
      expect(() =>
        escribirMurallas(dir as string, { formas: [{ nombre: 'Línea recta', muralla: muro }] }),
      ).toThrow('es una forma de ejemplo');
      expect(existsSync(ruta)).toBe(false);

      const torreon = { nombre: 'Torreón', muralla: muro };
      expect(escribirMurallas(dir, { formas: [torreon] })).toEqual({ formas: 1, conservadas: 0 });
      const json = JSON.parse(readFileSync(ruta, 'utf8')) as { _comment: string };
      expect(json._comment).toBe(COMENTARIO_DEL_BORRADOR_DE_MURALLAS);
      expect(leerMurallas(dir).formas).toEqual([torreon]);
      // Borrar es mandar la lista sin ella.
      escribirMurallas(dir, { formas: [] });
      expect(leerMurallas(dir).formas).toEqual([]);
    });

    it('una forma que no vale se conserva al guardar, y un archivo ilegible no se pisa', () => {
      dir = mkdtempSync(join(tmpdir(), 'murallas-'));
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      const mala = { nombre: 'Rota', muralla: { muros: 'todas', puertas: [] } };
      writeFileSync(join(dir, RUTA_DE_MURALLAS), JSON.stringify({ formas: [mala] }));
      expect(leerMurallas(dir).invalidas.map((i) => i.nombre)).toEqual(['Rota']);
      const torreon = { nombre: 'Torreón', muralla: muro };
      expect(escribirMurallas(dir, { formas: [torreon] })).toEqual({ formas: 1, conservadas: 1 });
      const json = JSON.parse(readFileSync(join(dir, RUTA_DE_MURALLAS), 'utf8')) as {
        formas: unknown[];
      };
      expect(json.formas).toEqual([torreon, mala]);

      writeFileSync(join(dir, RUTA_DE_MURALLAS), '{ no es json');
      expect(() => leerMurallas(dir as string)).toThrow(`${RUTA_DE_MURALLAS} no es JSON`);
      expect(() => escribirMurallas(dir as string, { formas: [torreon] })).toThrow(
        'no se guarda para no pisarlo',
      );
    });

    it('una forma repetida se conserva al guardar otra (QA, M3)', () => {
      dir = mkdtempSync(join(tmpdir(), 'murallas-'));
      mkdirSync(join(dir, 'data/borradores'), { recursive: true });
      const buena = { nombre: 'Buena', muralla: muro };
      const repetida = { nombre: 'Buena', muralla: { muros: [{ col: 2, row: 2 }], puertas: [] } };
      writeFileSync(join(dir, RUTA_DE_MURALLAS), JSON.stringify({ formas: [buena, repetida] }));
      expect(leerMurallas(dir).invalidas.map((i) => i.motivo)).toEqual([
        'la forma «Buena» está dos veces en el borrador',
      ]);
      // La página manda lo que tiene —la buena, siempre— y una nueva: la
      // repetida no se ha tocado y sigue en el archivo.
      const nueva = { nombre: 'Nueva QA', muralla: muro };
      expect(escribirMurallas(dir, { formas: [buena, nueva] })).toEqual({
        formas: 2,
        conservadas: 1,
      });
      const json = JSON.parse(readFileSync(join(dir, RUTA_DE_MURALLAS), 'utf8')) as {
        formas: unknown[];
      };
      expect(json.formas).toEqual([buena, nueva, repetida]);
    });
  });

  it('el borrador guardado en el repo, si lo hay, se puede leer', () => {
    expect(() => leerMurallas(RAIZ)).not.toThrow();
  });
});

describe('la arena pelea con la muralla', () => {
  it('con la línea recta y todo cuerpo a cuerpo, se acaba por tiempo y lo dice', () => {
    const linea = FORMAS_DE_EJEMPLO[0]!.muralla;
    // El zombi no tira ni escala, y sin escalera no sube a la muralla desde fuera:
    // nadie la cruza.
    const zombi = unidad('zombi');
    const s = sesionDeArena(
      [{ unidad: zombi, ia: true, escalera: false }],
      [{ unidad: zombi, ia: true, escalera: false }],
      5,
      linea,
    );
    s.empezar();
    expect(s.battle.muralla).toEqual(linea);
    const fin = finalDeArena(s.battle);
    expect(fin?.causa).toBe('agotada');
  });

  it('a mano: el muro no se ofrece al atacante y el motivo es del núcleo', () => {
    const conPuerta = FORMAS_DE_EJEMPLO[1]!.muralla;
    const s = sesionDeArena(
      [{ unidad: unidad('zombi'), ia: false, escalera: false }],
      [{ unidad: unidad('zombi'), ia: true, escalera: false }],
      5,
      conPuerta,
    );
    s.empezar();
    expect(s.turnoPropio).not.toBeNull();
    const cerradas = new Set(conPuerta.muros.map(hexKey));
    for (const h of s.battleMovable()) expect(cerradas.has(hexKey(h))).toBe(false);
    expect(s.moveRejection({ col: 7, row: 0 })).toBe(
      'Para subir a la muralla hace falta una escalera o saber escalar.',
    );
    // El zombi no llega a la puerta este turno: lo que se le dice es eso, no la puerta.
    expect(s.moveRejection({ col: 8, row: 4 })).toMatch(/^No llega: le quedan/);
  });

  it('el editor pinta cada pieza con su clase y las de ejemplo sin «Borrar»', () => {
    const marcado = marcadoDe(
      renderMuralla({
        muralla: FORMAS_DE_EJEMPLO[1]!.muralla,
        herramienta: 'puerta',
        nombre: 'Mía',
        ejemplos: FORMAS_DE_EJEMPLO,
        guardadas: [
          {
            nombre: 'Torreón <1>',
            muralla: validarFormaDeMuralla({ nombre: 'T', muralla: muro }).muralla,
          },
        ],
        sinGuardado: null,
        despliegue: null,
        plegado: false,
      }),
    );
    expect(marcado.match(/class="hex muro/g)?.length).toBe(8);
    // La puerta, en el lado: borde este de (7,4) y oeste de (8,4).
    expect(marcado.match(/class="hex puerta-este/g)?.length).toBe(1);
    expect(marcado.match(/class="hex puerta-oeste/g)?.length).toBe(1);
    expect(marcado).toContain('title="(7,4) vacío, fuera, puerta al este"');
    expect(marcado).toContain('title="(8,4) vacío, puerta al oeste"');
    expect(marcado).toContain('class="rejilla herramienta-puerta"');
    // Una casilla por hex del tablero: filas de 12 y 11, 104.
    expect(marcado.match(/data-arena="hex-muralla"/g)?.length).toBe(104);
    expect(marcado).not.toContain('title="(11,1)');
    expect(marcado).toContain('title="(11,0) vacío"');
    expect(marcado.match(/data-arena="borrar-forma"/g)?.length).toBe(1);
    expect(marcado).toContain('Torreón &lt;1&gt;');
    expect(marcado).toContain('8 muros y 1 puerta');
    // Las tarjetas con su plural (QA, M6): «9 muro · 0 puerta» decía antes.
    expect(marcado).toContain('9 muros · 0 puertas · ejemplo');
    expect(marcado).toContain('1 muro · 1 puerta</span>');
    expect(marcado).not.toContain('aviso-despliegue');
    expect(marcado).not.toContain('aviso-guardado');
  });

  it('sin poder guardar, los botones dicen por qué y el editor también (QA, M4)', () => {
    const porQue = 'data/borradores/murallas.json no se puede leer (no es JSON)';
    const marcado = marcadoDe(
      renderMuralla({
        muralla: FORMAS_DE_EJEMPLO[1]!.muralla,
        herramienta: 'muro',
        nombre: '',
        ejemplos: FORMAS_DE_EJEMPLO,
        guardadas: [{ nombre: 'Mía', muralla: FORMAS_DE_EJEMPLO[0]!.muralla }],
        sinGuardado: porQue,
        despliegue: null,
        plegado: false,
      }),
    );
    const titulo = `title="No se puede guardar: ${porQue}."`;
    expect(marcado).toContain(`data-arena="guardar-forma" disabled ${titulo}`);
    expect(marcado).toContain(`data-arena="borrar-forma" data-nombre="Mía" disabled ${titulo}`);
    expect(marcado).toContain(`No se pueden guardar ni borrar formas: ${porQue}.`);
  });

  it('plegado, el editor es su cabecera y lo que impide luchar (QA, M7)', () => {
    const plegado = (despliegue: string | null): string =>
      marcadoDe(
        renderMuralla({
          muralla: FORMAS_DE_EJEMPLO[1]!.muralla,
          herramienta: 'muro',
          nombre: '',
          ejemplos: FORMAS_DE_EJEMPLO,
          guardadas: [],
          sinGuardado: null,
          despliegue,
          plegado: true,
        }),
      );
    expect(plegado(null)).not.toContain('data-arena="hex-muralla"');
    expect(plegado(null)).toContain('8 muros y 1 puerta');
    expect(plegado(null)).toContain('data-arena="plegar-muralla" aria-expanded="false">Desplegar');
    expect(plegado('no caben')).toContain('No se puede luchar: no caben.');
  });

  it('si el montaje no cabe con la muralla, el editor lo dice mientras se dibuja', () => {
    const tapia = validarMuralla({
      muros: [...columna(0), ...columna(1), ...columna(2, 0, 5)],
      puertas: [],
    });
    const siete = Array.from({ length: LIDERAZGO.maxPorBando }, () => unidad('zombi'));
    const motivo = despliegueDeArenaBlocker(montajeDePrueba(aPelear(siete), aPelear(siete), tapia));
    expect(motivo).toBe('la muralla deja 3 casillas de salida a la izquierda y hacen falta 7');
    expect(
      despliegueDeArenaBlocker(montajeDePrueba(aPelear(siete.slice(0, 3)), aPelear(siete), tapia)),
    ).toBeNull();
    expect(
      despliegueDeArenaBlocker(
        montajeDePrueba(aPelear(siete), aPelear(siete), FORMAS_DE_EJEMPLO[0]!.muralla),
      ),
    ).toBeNull();
    const marcado = marcadoDe(
      renderMuralla({
        muralla: tapia,
        herramienta: 'muro',
        nombre: '',
        ejemplos: FORMAS_DE_EJEMPLO,
        guardadas: [],
        sinGuardado: null,
        despliegue: motivo,
        plegado: false,
      }),
    );
    expect(marcado).toContain(`No se puede luchar: ${motivo}.`);
  });
});
