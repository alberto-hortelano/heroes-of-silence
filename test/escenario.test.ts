/**
 * La escena del mapa tal como la pinta el juego: partida en suelo fijo y
 * volúmenes por fotograma (`render/escenario/pintar.ts`), y pintada sin arte.
 *
 * Sin navegador: el contexto es un registro de llamadas. Lo que se comprueba es
 * QUÉ se pinta y con qué, no cómo queda; lo que se ve lo mira `pnpm taller
 * escenario` y `pnpm capturas`.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { componer } from '../src/client/render/escenario/colocar.js';
import { seHornea } from '../src/client/render/escenario/horneado.js';
import {
  ejeDelPaso,
  esHito,
  HITOS,
  nodoDePaso,
  piezaDeNodo,
  TABLILLAS,
  tablillaDelEje,
  varianteDeId,
} from '../src/client/render/escenario/nodos.js';
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
import { semillaDelArnes } from '../tools/qa/partida-del-arnes.js';
import { decidir } from '../tools/qa/politica.js';
import { catalogoDelDisco, escenaDe, partidaDe, primeraSemillaCon } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

const RAIZ = resolve(import.meta.dirname, '..');
const catalogo = catalogoDelDisco();

/** Cuántas rachas de dos o más columnas pintadas tiene una cara: los trozos de su contorno. */
function rachas(pintada: readonly (readonly [number, number] | null)[]): number {
  let n = 0;
  let largo = 0;
  for (const t of [...pintada, null]) {
    if (t !== null) largo++;
    else {
      if (largo >= 2) n++;
      largo = 0;
    }
  }
  return n;
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

/** Un relleno con un degradado lineal: el de cada cara de roca y el de cada canto. */
const lineal = (l: Llamada) =>
  l.metodo === 'fillRect' &&
  (l.fillStyle as { degradado?: string } | undefined)?.degradado === 'createLinearGradient';

describe('los caminos que se pintan son los que se trazaron', () => {
  it('las aristas de la escena son los tramos del mapa (#153)', () => {
    for (const semilla of [1, 2, 3]) {
      const { map } = newGame({ seed: semilla });
      const e = escenaDe(semilla);
      const clave = (x1: number, y1: number, x2: number, y2: number) =>
        `${x1 - 0.5},${y1 - 0.5}-${x2 - 0.5},${y2 - 0.5}`;
      const pintadas = e.caminos.map(([x1, y1, x2, y2]) => clave(x1, y1, x2, y2)).sort();
      const trazadas = map.caminos.tramos
        .map(([p, q]) => clave(p.x + 0.5, p.y + 0.5, q.x + 0.5, q.y + 0.5))
        .sort();
      expect(trazadas.length, `semilla ${semilla}`).toBeGreaterThan(0);
      expect(pintadas, `semilla ${semilla}`).toEqual(trazadas);
    }
  });
});

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
    // Primero la huella de las sendas y las trochas (`huella.ts`), que sin su
    // textura es de color; luego, un relleno por plano.
    const huella = rellenos.length - sep.planos.length;
    expect(huella).toBeGreaterThan(0);
    for (const l of rellenos.slice(0, huella)) expect(typeof l.fillStyle).toBe('string');
    expect(rellenos.slice(huella).map((l) => l.fillStyle)).toEqual(sep.planos.map((s) => s.color));
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
    // En el suelo, el único degradado lineal es el de cada cara de roca que se pinta.
    expect(r.llamadas.filter((l) => l.contexto === 0 && lineal(l))).toHaveLength(
      e.relieve.caras.filter((f) => f.pintada.some((t) => t !== null)).length,
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

  it('cada cara se pinta solo bajo la silueta de su pared (#159): un recorte por su contorno, sin tajos', () => {
    // La cara se pintaba entera, un rectángulo de bordes rectos donde la pared
    // no entraba. Con el relieve por celdas (R4/R5) la senda que baja ya no le
    // abre un tajo en `evenodd`: la bajada se pinta encima de la pared.
    const pintadas = e.relieve.caras
      .filter((f) => f.pintada.some((t) => t !== null))
      .sort((p, q) => p.y - q.y);
    expect(pintadas.length).toBeGreaterThan(0);
    // Que el guardia no mire al vacío: alguna cara tiene columnas sin pintar.
    expect(e.relieve.caras.some((f) => f.pintada.some((t) => t === null))).toBe(true);
    const r = registro();
    pintarSuelo(r.contexto(), e, sep, { ...sinImagenes, lienzo: r.lienzo });
    const suelo = r.llamadas.filter((l) => l.contexto === 0);
    const recortes = suelo.flatMap((l, i) => (l.metodo === 'clip' ? [i] : []));
    expect(recortes.map((i) => suelo[i]?.args)).toEqual(pintadas.map(() => []));
    for (const [k, f] of pintadas.entries()) {
      const i = recortes[k] as number;
      // El contorno: un trozo cerrado por cada racha de columnas pintadas.
      const desde = suelo.map((l) => l.metodo).lastIndexOf('beginPath', i);
      const camino = suelo.slice(desde, i).map((l) => l.metodo);
      expect(camino.filter((m) => m === 'rect')).toHaveLength(0);
      expect(camino.filter((m) => m === 'closePath')).toHaveLength(rachas(f.pintada));
      // Dentro, la textura y el degradado de la cara, y se deshace antes de lo siguiente.
      const hasta = suelo.findIndex((l, n) => n > i && l.metodo === 'restore');
      expect(suelo.slice(i + 1, hasta).map((l) => l.metodo)).toEqual(['fillRect', 'fillRect']);
      expect(lineal(suelo[hasta - 1] as Llamada)).toBe(true);
    }
  });

  it('junto a un puente (#157): cada vado se quita del barro, del agua y de la espuma', () => {
    // La primera semilla con vados (era la 5, escrita a mano, hasta #169).
    const { caso: conVados } = primeraSemillaCon('vados junto a un puente', (s) => {
      const e = escenaDe(s);
      return e.vados.length > 0 ? e : undefined;
    });
    const r = registro();
    pintarSuelo(r.contexto(), conVados, separar(conVados), { ...sinImagenes, lienzo: r.lienzo });
    const T = sinImagenes.tile;
    for (const v of conVados.vados) {
      const [x, y] = v[0] as readonly [number, number];
      const donde = r.llamadas.filter(
        (l) => l.metodo === 'moveTo' && l.args[0] === x * T && l.args[1] === y * T,
      );
      // En tres máscaras, ninguna el suelo: las sendas sí se trazan en el suelo y empiezan igual.
      const mascaras = new Set(donde.map((l) => l.contexto).filter((k) => k !== 0));
      expect(mascaras.size, `vado en ${x},${y}`).toBe(3);
    }
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

describe('los hitos de los nodos (#176): tres, por el id, ninguno con cruz', () => {
  /** El hito de cada nodo que lleva uno en el mapa de `semilla`, por su id. */
  const hitosDe = (semilla: number): Map<string, string> => {
    const map = newGame({ seed: semilla }).map;
    const a = analizar(map);
    const hitos = new Map<string, string>();
    for (const o of map.objects) {
      if (o.kind !== 'node' || a.puentes.has(o.id)) continue;
      const paso = a.pasos.get(o.id);
      if (paso === undefined) throw new Error(`el nodo ${o.id} no está en el análisis`);
      const pieza = piezaDeNodo(o.id, o.at, map.width, map.terrain, paso.barrera, paso.eje);
      if (esHito(pieza)) hitos.set(o.id, pieza);
    }
    return hitos;
  };

  it('el mismo id da siempre el mismo hito, y la variante no depende de la barrera', () => {
    for (const id of ['n0', 'n7', 'n13', 'nodo-raro'])
      expect(nodoDePaso(id, 'cliff', 'ancho')).toBe(nodoDePaso(id, null, 'hondo'));
    expect(nodoDePaso('n0', 'cliff', 'ancho')).toBe(HITOS[varianteDeId('n0', HITOS.length)]);
    expect(() => varianteDeId('n0', 0)).toThrow(/al menos una/);
  });

  it('en las semillas 1-40 salen los tres, y ninguno domina', () => {
    const cuenta = new Map<string, number>(HITOS.map((h) => [h, 0]));
    // Las tablillas cuentan juntas, apunten adonde apunten.
    const familia = (h: string) => (h.startsWith(TABLILLAS.este) ? TABLILLAS.este : h);
    for (let s = 1; s <= 40; s++)
      for (const h of hitosDe(s).values())
        cuenta.set(familia(h), (cuenta.get(familia(h)) ?? 0) + 1);
    const total = [...cuenta.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(30);
    for (const [h, n] of cuenta) expect(n, h).toBeGreaterThan(total / 6);
  });

  it('la escena pinta cada hito con su pieza, de una casilla de alto, y la de la cruz no existe', () => {
    const { semilla } = primeraSemillaCon('dos hitos o más', (s) =>
      hitosDe(s).size >= 2 ? s : undefined,
    );
    const hitos = hitosDe(semilla);
    const { escena } = partidaDe(semilla);
    for (const [id, pieza] of hitos) {
      const s = escena.sprites.find((x) => x.objeto?.id === id);
      expect(s?.src, id).toBe(`${pieza}.webp`);
      expect(s?.alto).toBe(1);
    }
    expect(escena.sprites.some((x) => x.src === 'nodo-hito.webp')).toBe(false);
    expect(existsSync(join(RAIZ, 'assets/mapa/nodo-hito.webp'))).toBe(false);
  });

  /** Hacia dónde apunta cada tablilla, en casillas del mapa (y crece hacia el sur). */
  const RUMBO: Readonly<Record<string, readonly [number, number]>> = {
    [TABLILLAS.este]: [1, 0],
    [TABLILLAS.oeste]: [-1, 0],
    [TABLILLAS.norte]: [0, -1],
    [TABLILLAS.noreste]: [1, -1],
    [TABLILLAS.noroeste]: [-1, -1],
  };

  it('la tablilla apunta a lo largo del eje, al fondo antes que a la cámara (§29)', () => {
    const eje = (p: readonly [number, number], q: readonly [number, number]) => [[p, q]];
    for (const [p, q] of [
      [
        [0.5, 0.5],
        [0.5, 4.5],
      ],
      [
        [0.5, 4.5],
        [0.5, 0.5],
      ],
    ] as const)
      expect(tablillaDelEje('n0', eje(p, q))).toBe(TABLILLAS.norte);
    expect(tablillaDelEje('n0', eje([0, 0], [4, 4]))).toBe(TABLILLAS.noroeste);
    expect(tablillaDelEje('n0', eje([4, 4], [0, 0]))).toBe(TABLILLAS.noroeste);
    expect(tablillaDelEje('n0', eje([0, 4], [4, 0]))).toBe(TABLILLAS.noreste);
    expect(tablillaDelEje('n0', eje([4, 0], [0, 4]))).toBe(TABLILLAS.noreste);
    // El este-oeste, por el sitio: el mismo eje da la misma, en los dos sentidos,
    // y a lo largo de una fila salen las dos.
    const eo = Array.from({ length: 6 }, (_, i) =>
      tablillaDelEje('n0', eje([i + 0.5, 3.5], [i + 4.5, 3.5])),
    );
    expect(new Set(eo)).toEqual(new Set([TABLILLAS.este, TABLILLAS.oeste]));
    expect(tablillaDelEje('n9', eje([4.5, 3.5], [0.5, 3.5]))).toBe(eo[0]);
    // En cruz (sin lados opuestos), el primer brazo.
    expect(tablillaDelEje('n0', [eje([2, 2], [2, 4])[0]!, eje([2, 2], [4, 2])[0]!])).toBe(
      TABLILLAS.norte,
    );
    expect(() => tablillaDelEje('n0', [])).toThrow(/no tiene eje/);
    expect(() => tablillaDelEje('n0', eje([1, 1], [1, 1]))).toThrow(/no va a ningún lado/);
  });

  it('ninguna tablilla de la escena apunta de través a su paso, y salen todos los rumbos (§29)', () => {
    // 15, 31 y 36 llevan los cinco (3, 31 y 36 hasta #188); la orden lenta, 1-40.
    const vistos = new Set<string>();
    for (const semilla of segunPrisa([15, 31, 36], rango(1, 40))) {
      const { map, escena } = partidaDe(semilla);
      for (const o of map.objects) {
        const pieza = escena.sprites
          .find((x) => x.objeto?.id === o.id)
          ?.src?.replace(/\.webp$/, '');
        if (pieza === undefined || !pieza.startsWith(TABLILLAS.este)) continue;
        vistos.add(pieza);
        const [p, q] = ejeDelPaso(o.at, map.width, map.terrain)[0] ?? [];
        const [rx, ry] = RUMBO[pieza] ?? [0, 0];
        // Paralela al eje: el producto vectorial es cero.
        const cruz = rx * ((q?.[1] ?? 0) - (p?.[1] ?? 0)) - ry * ((q?.[0] ?? 0) - (p?.[0] ?? 0));
        expect(Math.abs(cruz), `s${semilla} ${o.id} ${pieza}`).toBe(0);
      }
    }
    expect(vistos).toEqual(new Set(Object.values(TABLILLAS)));
  });

  it('el miliario va entonado: más oscuro y con menos contraste que su pieza (§29)', () => {
    const { semilla } = primeraSemillaCon('un miliario', (s) =>
      [...hitosDe(s).values()].includes('nodo-hito-miliar') ? s : undefined,
    );
    const hitos = hitosDe(semilla);
    for (const s of escenaDe(semilla).sprites) {
      const pieza = s.objeto === undefined ? undefined : hitos.get(s.objeto.id);
      if (pieza === undefined) continue;
      if (pieza === 'nodo-hito-miliar')
        expect(s.tono, s.objeto?.id).toMatch(/brightness\(0\.\d+\)/);
      else expect(s.tono, s.objeto?.id).toBeUndefined();
    }
  });

  it('sin tope: cada nodo de acantilado lleva su hito, también los nueve de s36 (§29)', () => {
    // Un nodo neutral no lleva bandera: sin su hito, no se vería que ahí hay
    // algo que tomar. En 1-40 son 142 (de 0 a 9 por mapa) y nunca hay dos a
    // menos de 5 casillas: muchos en un mapa es que el mapa tiene muchos pasos.
    for (const semilla of segunPrisa([36], rango(1, 40))) {
      const { map, escena } = partidaDe(semilla);
      const a = analizar(map);
      const nodos = map.objects.filter(
        (o) => o.kind === 'node' && a.pasos.get(o.id)?.barrera === 'cliff',
      );
      if (semilla === 36) expect(nodos).toHaveLength(9);
      for (const o of nodos) {
        const s = escena.sprites.find((x) => x.objeto?.id === o.id);
        expect(esHito(s?.src?.replace(/\.webp$/, '') ?? null), `s${semilla} ${o.id}`).toBe(true);
      }
    }
  });

  it('sin el arte de los hitos, cada uno cae a su marcador', () => {
    const { semilla } = primeraSemillaCon('dos hitos o más', (s) =>
      hitosDe(s).size >= 2 ? s : undefined,
    );
    const { map } = partidaDe(semilla);
    const piezas = Object.fromEntries(
      Object.entries(catalogo.piezas).filter(([id]) => !esHito(id)),
    );
    const escena = componer(map, semilla, { ...catalogo, piezas });
    for (const id of hitosDe(semilla).keys()) {
      const s = escena.sprites.find((x) => x.objeto?.id === id);
      expect(s?.src, id).toBeNull();
      expect(s?.alto).toBeCloseTo(0.6);
    }
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
    // La semilla de `pnpm qa`, buscada como la busca él (#131): es su plan y su partida.
    const { semilla } = await semillaDelArnes();
    const { plan } = decidir('map_generate', { want: { width: 34, height: 34 } }, semilla) as {
      plan: MapPlan;
    };
    const state = newGame({ seed: semilla, plan });
    expect(state.towns.some((t) => t.id.startsWith('qa-town-'))).toBe(true);
    const e = componer(state.map, semilla, catalogo);
    expect(e.informe.modulosQueFaltan).toEqual([]);
    expect(e.informe.basesSobreReserva).toBe(0);
    expect(e.informe.spritesSobreSenda).toBe(0);
    expect(e.informe.casillasDeBarreraSinFormacion).toBe(0);
    expect(e.informe.rampasDesviadas).toBe(0);
    const horneados = e.sprites.filter((s) => s.objeto !== undefined && seHornea(s.objeto.kind));
    expect(horneados.length).toBe(state.map.objects.filter((o) => seHornea(o.kind)).length);
    const antes = JSON.stringify(e);
    await jugar(state, 10, semilla);
    expect(JSON.stringify(componer(state.map, semilla, catalogo))).toBe(antes);
  });
});
