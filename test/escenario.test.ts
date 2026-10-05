/**
 * La escena del mapa tal como la pinta el juego: partida en suelo fijo y
 * volúmenes por fotograma (`render/escenario/pintar.ts`), y pintada sin arte.
 *
 * Sin navegador: el contexto es un registro de llamadas. Lo que se comprueba es
 * QUÉ se pinta y con qué, no cómo queda; lo que se ve lo mira `pnpm taller
 * escenario` y `pnpm capturas`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Catalogo } from '../src/client/render/escenario/catalogo.js';
import { RUTA_DEL_CATALOGO } from '../src/client/render/escenario/catalogo.js';
import { componer, type Escena } from '../src/client/render/escenario/colocar.js';
import { seHornea } from '../src/client/render/escenario/horneado.js';
import {
  imagenesDeEscena,
  type OpcionesDePintura,
  pintarSprite,
  pintarSuelo,
  separar,
  UMBRAL_DE_VOLUMEN,
} from '../src/client/render/escenario/pintar.js';
import { playAiTurn } from '../src/core/ai/turn.js';
import type { MapPlan } from '../src/core/map/generate.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { decidir } from '../tools/qa/politica.js';

const RAIZ = resolve(import.meta.dirname, '..');
const catalogo = JSON.parse(readFileSync(join(RAIZ, RUTA_DEL_CATALOGO), 'utf8')) as Catalogo;

const escenas = new Map<number, Escena>();
function escenaDe(semilla: number): Escena {
  let e = escenas.get(semilla);
  if (e === undefined) {
    e = componer(newGame({ seed: semilla }).map, semilla, catalogo);
    escenas.set(semilla, e);
  }
  return e;
}

interface Llamada {
  readonly metodo: string;
  readonly args: readonly unknown[];
  readonly fillStyle: unknown;
  /** El contexto que la recibió, por orden de creación: 0 es el primero que se pide. */
  readonly contexto: number;
  readonly filter: unknown;
}

/**
 * Un contexto 2D que no pinta: apunta cada llamada con el `fillStyle` que había
 * en ese momento. Los lienzos que pide el pintor para sus máscaras son de la
 * misma especie, y se apuntan para distinguir «copió una máscara» de «pintó una
 * imagen».
 */
function registro(): {
  llamadas: Llamada[];
  lienzos: Set<object>;
  contexto: () => CanvasRenderingContext2D;
  lienzo: NonNullable<OpcionesDePintura['lienzo']>;
  contextoDe: Map<object, number>;
} {
  const llamadas: Llamada[] = [];
  const lienzos = new Set<object>();
  let contextos = 0;
  const contextoDe = new Map<object, number>();
  const contexto = (): CanvasRenderingContext2D => {
    const estado: Record<string | symbol, unknown> = {};
    const id = contextos++;
    return new Proxy(estado, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'createImageData')
          return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
          return () => ({ degradado: k, addColorStop: () => undefined });
        if (k === 'createPattern') return () => null;
        return (...args: unknown[]) => {
          llamadas.push({
            metodo: String(k),
            args,
            fillStyle: t.fillStyle,
            contexto: id,
            filter: t.filter,
          });
        };
      },
      set(t, k, v) {
        t[k] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  };
  const lienzo = (ancho: number, alto: number) => {
    // Un contexto por lienzo, como en el navegador: `contextoDe` dice de quién es.
    let suyo: CanvasRenderingContext2D | undefined;
    const l = {
      width: ancho,
      height: alto,
      getContext: () => {
        if (suyo === undefined) {
          suyo = contexto();
          contextoDe.set(l, contextos - 1);
        }
        return suyo;
      },
    };
    lienzos.add(l);
    return l as unknown as HTMLCanvasElement;
  };
  return { llamadas, lienzos, contexto, lienzo, contextoDe };
}

describe('separar: el suelo fijo y los volúmenes', () => {
  for (const semilla of [1, 9]) {
    const e = escenaDe(semilla);
    const { planos, volumenes } = separar(e);

    it(`semilla ${semilla}: cada sprite del suelo va a una sola lista y las nubes a ninguna`, () => {
      const enPlanos = new Set(planos);
      const enVolumenes = new Set(volumenes.map((v) => v.s));
      for (const s of e.sprites) {
        const dondeVa = Number(enPlanos.has(s)) + Number(enVolumenes.has(s));
        expect(dondeVa).toBe(s.capa === 1 ? 0 : 1);
      }
      expect(planos.length + volumenes.length).toBe(e.sprites.filter((s) => s.capa === 0).length);
    });

    it(`semilla ${semilla}: ninguna masa, muro, pared ni objeto en el suelo; nada alto tampoco`, () => {
      for (const s of planos) {
        expect(['masa', 'muro', 'pared', 'objeto', 'nube']).not.toContain(s.clase);
        expect(s.alto).toBeLessThanOrEqual(UMBRAL_DE_VOLUMEN);
      }
      // Y lo bajo que no es de esas clases no es volumen: una mata no tapa a nadie.
      for (const v of volumenes)
        if (!['masa', 'muro', 'pared', 'objeto'].includes(v.s.clase))
          expect(v.s.alto).toBeGreaterThan(UMBRAL_DE_VOLUMEN);
    });

    it(`semilla ${semilla}: los volúmenes van por la y de su base y, a igualdad, por la x`, () => {
      for (const v of volumenes) expect(v.clave).toBe(v.s.y);
      for (let i = 1; i < volumenes.length; i++) {
        const a = volumenes[i - 1]!;
        const b = volumenes[i]!;
        expect(a.clave < b.clave || (a.clave === b.clave && a.s.x <= b.s.x)).toBe(true);
      }
    });
  }

  it('lo que el filtro deja fuera no va a ninguna lista: lo pinta el juego', () => {
    const e = escenaDe(1);
    const { planos, volumenes } = separar(e, { objeto: (o) => o.kind !== 'monster' });
    const todos = [...planos, ...volumenes.map((v) => v.s)];
    expect(e.sprites.some((s) => s.objeto?.kind === 'monster')).toBe(true);
    expect(todos.some((s) => s.objeto?.kind === 'monster')).toBe(false);
  });

  it('el umbral es un parámetro: con uno enorme, solo las clases que tapan siempre', () => {
    const { volumenes } = separar(escenaDe(1), { umbral: 99 });
    for (const v of volumenes) expect(['masa', 'muro', 'pared', 'objeto']).toContain(v.s.clase);
  });
});

describe('sin arte se pinta igual: cada pieza, su marcador de color', () => {
  const e = escenaDe(3);
  const sep = separar(e);
  const sinImagenes = { tile: 8, imagen: () => undefined } as const;

  it('el suelo: un relleno del color de cada plano, y ningún drawImage que no sea una máscara suya', () => {
    const r = registro();
    pintarSuelo(r.contexto(), e, sep, { ...sinImagenes, lienzo: r.lienzo });
    const rellenos = r.llamadas.filter((l) => l.metodo === 'fill');
    expect(rellenos.map((l) => l.fillStyle)).toEqual(sep.planos.map((s) => s.color));
    const copias = r.llamadas.filter((l) => l.metodo === 'drawImage');
    expect(copias.length).toBeGreaterThan(0);
    for (const l of copias) expect(r.lienzos.has(l.args[0] as object)).toBe(true);
  });

  it('los cantos no van nítidos al suelo: en un lienzo aparte que se copia entero difuminado', () => {
    // Pintados franja a franja sobre el suelo, cada canto era un rectángulo de
    // bordes duros: la costura recta del nivel y del agua junto a los caminos
    // (QA de los caminos despejados, 05-10-2026).
    expect(e.relieve.cantos.length).toBeGreaterThan(0);
    const r = registro();
    pintarSuelo(r.contexto(), e, sep, { ...sinImagenes, lienzo: r.lienzo });
    const lineal = (l: Llamada) =>
      l.metodo === 'fillRect' &&
      (l.fillStyle as { degradado?: string } | undefined)?.degradado === 'createLinearGradient';
    // En el suelo, el único degradado lineal es el de cada cara de roca.
    expect(r.llamadas.filter((l) => l.contexto === 0 && lineal(l))).toHaveLength(
      e.relieve.caras.length,
    );
    const franjas = r.llamadas.filter((l) => l.contexto !== 0 && lineal(l));
    expect(franjas).toHaveLength(e.relieve.cantos.length);
    const nitido = new Set(franjas.map((l) => l.contexto));
    expect(nitido.size).toBe(1);
    // Y ese lienzo se copia una sola vez, con desenfoque, a otro que no es el suelo.
    const copias = r.llamadas.filter(
      (l) => l.metodo === 'drawImage' && nitido.has(r.contextoDe.get(l.args[0] as object) ?? -1),
    );
    expect(copias).toHaveLength(1);
    expect(copias[0]?.contexto).not.toBe(0);
    expect(String(copias[0]?.filter)).toMatch(/^blur\(/);
  });

  it('los volúmenes: uno a uno, su marcador y ninguna imagen', () => {
    const r = registro();
    const ctx = r.contexto();
    for (const v of sep.volumenes) pintarSprite(ctx, v.s, sinImagenes);
    expect(r.llamadas.filter((l) => l.metodo === 'drawImage')).toEqual([]);
    expect(r.llamadas.filter((l) => l.metodo === 'fill').map((l) => l.fillStyle)).toEqual(
      sep.volumenes.map((v) => v.s.color),
    );
  });
});

describe('lo que se carga: solo lo que se pinta, y todo existe', () => {
  for (const semilla of [1, 2, 3, 4, 5]) {
    it(`semilla ${semilla}: ni monstruos ni recursos ni cofres, y cada imagen está en assets/mapa/`, () => {
      const e = escenaDe(semilla);
      const lista = imagenesDeEscena(e, (o) => seHornea(o.kind));
      const deLoQueNoSeHornea = e.sprites
        .filter((s) => s.objeto !== undefined && !seHornea(s.objeto.kind) && s.src !== null)
        .map((s) => s.src as string);
      // La premisa: hay recursos y cofres con pieza en el mapa.
      expect(deLoQueNoSeHornea.length).toBeGreaterThan(0);
      for (const src of deLoQueNoSeHornea) expect(lista).not.toContain(src);
      expect(lista.length).toBeGreaterThan(50);
      const faltan = lista.filter((src) => !existsSync(join(RAIZ, 'assets/mapa', src)));
      expect(faltan).toEqual([]);
    });
  }

  it('el monstruo no pide imagen: la suya era de un arte que ya no existe', () => {
    const e = escenaDe(1);
    const monstruos = e.sprites.filter((s) => s.objeto?.kind === 'monster');
    expect(monstruos.length).toBeGreaterThan(0);
    for (const m of monstruos) expect(m.src).toBeNull();
    expect(imagenesDeEscena(e).some((src) => src.includes('unidades/'))).toBe(false);
  });
});

describe('la escena es de la partida entera: no cambia al jugarla', () => {
  /** Juega la IA hasta el día `dias` o hasta que acabe. */
  async function jugar(state: ReturnType<typeof newGame>, dias: number, semilla: number) {
    const ctx = { rng: createRng(semilla) };
    while (state.finished === null && state.day <= dias) await playAiTurn(state, ctx);
  }

  it('la semilla 2, tras 10 días de IA, compone la misma escena que el día 1', async () => {
    const state = newGame({ seed: 2 });
    const antes = JSON.stringify(componer(state.map, 2, catalogo));
    await jugar(state, 10, 2);
    expect(state.day).toBeGreaterThan(3);
    expect(JSON.stringify(componer(state.map, 2, catalogo))).toBe(antes);
  });

  it('el mapa que diseña el agente (el plan de `pnpm qa`) vale igual', async () => {
    const { plan } = decidir('map_generate', { want: { width: 34, height: 34 } }) as {
      plan: MapPlan;
    };
    const state = newGame({ seed: 11, plan });
    expect(state.towns.some((t) => t.id.startsWith('qa-town-'))).toBe(true);
    const e = componer(state.map, 11, catalogo);
    expect(e.informe.modulosQueFaltan).toEqual([]);
    expect(e.informe.basesSobreReserva).toBe(0);
    expect(e.informe.spritesSobreSenda).toBe(0);
    expect(e.informe.casillasDeBarreraSinFormacion).toBe(0);
    const horneados = e.sprites.filter((s) => s.objeto !== undefined && seHornea(s.objeto.kind));
    expect(horneados.length).toBe(state.map.objects.filter((o) => seHornea(o.kind)).length);
    const antes = JSON.stringify(e);
    await jugar(state, 10, 11);
    expect(JSON.stringify(componer(state.map, 11, catalogo))).toBe(antes);
  });
});
