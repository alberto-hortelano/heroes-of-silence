/**
 * La disposición de la base como escenario lateral: una franja por la que se
 * camina delante y, detrás, la plaza pintada en un solo cuadro. La leen el
 * cliente (la escena) y el taller (las guías que se le dan a Codex y el
 * recorte), y por eso vive en `shared`: el núcleo no la lee nunca —un sitio no
 * tiene coordenadas en las reglas— y lo vigila `invariantes.test.ts`.
 *
 * Todo va en **pasos**, la unidad del tablero de combate (`render/proyeccion.ts`):
 * la escena comparte con él el tamaño de la figura, así que un adulto mide en la
 * base lo mismo que en una batalla (vuelta 2, pregunta B). La franja ocupa
 * `x ∈ [0, ancho]` e `y ∈ [bordeDeAtras, FONDO_DE_LA_FRANJA]`.
 *
 * **Manda el cuadro** (vuelta 3): la plaza son `tramos` cuadros de
 * `TRAMO.ancho × TRAMO.alto` a `TRAMO.pxPorPaso`, pintados con todos sus
 * edificios a la vez, cosidos por una junta (un árbol alto con su pilar, que se
 * funde en `SOLAPE`) y puestos sobre un suelo propio, el mismo empedrado para
 * toda la plaza: de cada tramo se pinta solo lo que hay por encima de su pie,
 * alineado por su pie (`bajar`, uno por tramo). Dónde quedó cada edificio lo decidió Codex
 * y se MIDE sobre el cuadro: el JSON (`data/bases/<f>.json`) guarda, de cada
 * sitio, su tramo, el umbral de su puerta y la banda de columnas de su región en
 * píxeles del tramo. De píxel a escenario hay una sola cuenta, `planoDelCuadro`,
 * que leen el pintor y el golpe (`render/base/recortes.ts`) y la disposición
 * misma (los umbrales). La curva del arco de la vuelta 2 se dio por perdida:
 * Codex la pinta casi recta (tres pruebas).
 *
 * `leerDisposicion` lanza con lo que está mal: un sitio que falta o sobra, un
 * tramo fuera de rango, una región que sale de su tramo o pisa otra, una puerta
 * fuera de su región o lejos de la franja, y lo que no se pisa.
 */
import elfosJson from '../../data/bases/elfos.json' with { type: 'json' };
import imperioJson from '../../data/bases/imperio.json' with { type: 'json' };
import noMuertosJson from '../../data/bases/no-muertos.json' with { type: 'json' };
import orkosJson from '../../data/bases/orkos.json' with { type: 'json' };
import templariosJson from '../../data/bases/templarios.json' with { type: 'json' };
import { SITIOS, type SitioId } from '../core/town/sitios.js';
import { idsDeVecinos } from '../core/town/voces.js';
import type { FactionId } from '../core/types.js';
import {
  COMPRESION_SUELO,
  FONDO_DEL_COMBATE,
  MARGEN_ABAJO,
  MIRADAS,
  type Mirada,
  type Plano,
} from './arte.js';

export type { Mirada, Plano };

/**
 * Lo que mide de fondo la franja por la que se camina: la mitad de la rejilla
 * de combate (`FONDO_DEL_COMBATE`, 6,93 pasos), a medio paso: 3,5. Con la mitad
 * exacta (3,46) la raya de la franja sube dos píxeles en el cuadro, y con ella
 * `bajar`, el pie de cada tramo y todo el arte derivado, medido con 3,5.
 */
export const FONDO_DE_LA_FRANJA = Math.round(FONDO_DEL_COMBATE) / 2;
/**
 * Lo que se queda quien camina de los lados del escenario: media figura, la
 * mitad de su alto (0,95 pasos) redondeada. Con 0,4, medio cuerpo, la lanza del
 * héroe en guardia tocaba el marco en los dos extremos (QA, H7: a x 0,4 y 57,6
 * su punta quedaba a 2 px del borde del lienzo).
 */
export const MARGEN_DE_LA_FRANJA = 0.5;

/**
 * Un tramo de la plaza pintada: 1536×1024 a 128 px por paso, la escala del juego,
 * así que el recorte entra sin remuestrear. Tres edificios por tramo es lo que
 * cabe a escala de personaje: con seis, los pequeños salían con la puerta a 0,85
 * adultos (tercera prueba de la vuelta 3).
 */
export const TRAMO = { ancho: 1536, alto: 1024, pxPorPaso: 128 } as const;
/** Los pasos de un tramo entero. */
export const PASOS_POR_TRAMO = TRAMO.ancho / TRAMO.pxPorPaso;
/**
 * Lo que un tramo se monta sobre el anterior, en píxeles: medio paso, dentro de
 * la junta (el árbol alto que se pide en cada borde que da a otro tramo,
 * `JUNTA` de `tools/taller/base.ts`), donde se funden hoja con hoja. Antes eran
 * 256 px de un lienzo que llevaba pintado el final del anterior, para que Codex
 * lo continuara: lo conservó píxel a píxel, pero justo después subió la plaza
 * 55 px, y alinear cada tramo por su pie no casa con un trozo compartido
 * (costura T1|T2 de F2). Con la junta, cada tramo se pide solo.
 */
export const SOLAPE = 64;
/** Lo que avanza el escenario de un tramo al siguiente, en pasos. */
export const PASO_DE_TRAMO = (TRAMO.ancho - SOLAPE) / TRAMO.pxPorPaso;
/**
 * Lo que se queda fuera del escenario, como mucho, de cada tramo de los
 * extremos, en pasos. Cinco tramos son 60 pasos y el usuario pidió unos 50
 * (vuelta 3): se recorta por fuera y sin pedir nada otra vez. Cuánto, lo dice el
 * cuadro (`fuera` del JSON): el primer maestro puso sus dos edificios a lo ancho
 * del tramo entero, a escala de personaje, en vez de apretarlos en los 7 pasos
 * de dentro, y recortar 5 le cortaba la iglesia por la puerta.
 */
const FUERA_MAXIMO = PASOS_POR_TRAMO / 2;
/** Lo más lejos de la raya de la franja que puede quedar el umbral de una puerta, en pasos. */
const PUERTA_LEJOS_DE_LA_RAYA = 1.5;

/** Dónde se camina para entrar: justo delante del umbral de la puerta. */
const Y_DE_LA_PUERTA = 0.15;
/** Dónde espera el encargado: a un lado de la puerta (el que da al centro) y un poco delante. */
const ENCARGADO = { x: 0.7, y: 0.5 } as const;

/**
 * La fila de un tramo, en sus píxeles desde arriba, de un punto del escenario a
 * profundidad `y`, con el borde de abajo del tramo en el del lienzo. La leen la
 * guía del taller y `bajar`: si discrepan con la cámara (`render/base/camara.ts`,
 * con las mismas constantes), la franja caminable no cae sobre el empedrado pintado.
 */
export function filaDelPanorama(y: number): number {
  return (
    TRAMO.alto - (MARGEN_ABAJO + (FONDO_DE_LA_FRANJA - y) * COMPRESION_SUELO) * TRAMO.pxPorPaso
  );
}

/** La inversa de `filaDelPanorama`: la profundidad, en pasos, de una fila del tramo. */
export function profundidadDeFila(fila: number): number {
  return (
    FONDO_DE_LA_FRANJA - ((TRAMO.alto - fila) / TRAMO.pxPorPaso - MARGEN_ABAJO) / COMPRESION_SUELO
  );
}

/** La banda de columnas de un sitio en su tramo, en sus píxeles: de `x0` a `x1`, hasta la fila `pie`. */
export interface Region {
  readonly x0: number;
  readonly x1: number;
  /** La fila más baja que puede ser edificio: su pie pintado y la sombra de contacto. */
  readonly pie: number;
}

export interface SitioEnLaPlaza {
  /** En qué tramo está, de 1 a `tramos`, de izquierda a derecha. */
  readonly tramo: number;
  /** El umbral de la puerta, medido en el cuadro: en píxeles del tramo y en el escenario. */
  readonly umbral: { readonly enElCuadro: readonly [number, number]; readonly en: Plano };
  /** Adonde se camina para entrar: justo delante del umbral. */
  readonly puerta: Plano;
  /** Dónde espera su encargado. Dentro de la franja. */
  readonly encargado: Plano;
  readonly region: Region;
}

export interface Disposicion {
  readonly faccion: FactionId;
  /** Cuántos tramos tiene la plaza pintada. */
  readonly tramos: number;
  /** El ancho del escenario, en pasos: `12 + (tramos − 1) × PASO_DE_TRAMO − fuera.izq − fuera.der`. */
  readonly ancho: number;
  /** Lo que se recorta por fuera del primer tramo y del último, en pasos, medido sobre el cuadro. */
  readonly fuera: { readonly izq: number; readonly der: number };
  /**
   * Lo que se baja cada tramo, en píxeles suyos, para que su pie —la mediana de
   * los umbrales de sus puertas, que Codex pinta sobre el borde de atrás del
   * empedrado— caiga en la raya de la franja: cada tramo, pedido solo, pinta la
   * plaza a su altura (en F2, T1 a 708 y T2 a 645). Negativo si lo pintó por
   * encima. Derivado, nunca escrito.
   */
  readonly bajar: readonly number[];
  /** Por donde se llega a la base: aquí aparece quien camina. */
  readonly entrada: Plano;
  readonly sitios: Readonly<Record<SitioId, SitioEnLaPlaza>>;
  readonly vecinos: Readonly<Record<string, { readonly en: Plano; readonly mira: Mirada }>>;
  /** Los umbrales de las puertas, de izquierda a derecha: por ellos pasa `bordeDeAtras`. */
  readonly umbrales: readonly Plano[];
}

/**
 * Las columnas de un tramo que son suyas en el escenario: los de los extremos
 * pierden lo de fuera, y desde el segundo, el solape es del anterior (encima va
 * fundido el árbol de la junta de este).
 */
export function columnasALaVista(
  d: Pick<Disposicion, 'tramos' | 'fuera'>,
  tramo: number,
): { desde: number; hasta: number } {
  return {
    desde: tramo === 1 ? Math.round(d.fuera.izq * TRAMO.pxPorPaso) : SOLAPE,
    hasta:
      tramo === d.tramos ? TRAMO.ancho - Math.round(d.fuera.der * TRAMO.pxPorPaso) : TRAMO.ancho,
  };
}

/** Lo que se baja el tramo `tramo` (`Disposicion.bajar`); lanza si no lo hay. */
export function bajarDe(d: Pick<Disposicion, 'bajar'>, tramo: number): number {
  const bajar = d.bajar[tramo - 1];
  if (bajar === undefined) throw new Error(`no hay tramo ${tramo}: hay ${d.bajar.length}`);
  return bajar;
}

/**
 * De un píxel de un tramo al escenario: la ÚNICA cuenta de píxel a pasos. La
 * leen el pintor (dónde va cada placa y cada recorte) y el golpe
 * (`render/base/recortes.ts`), y de ella salen los umbrales de la disposición,
 * así que lo que se pinta, lo que se pulsa y por donde se anda no pueden discrepar.
 */
export function planoDelCuadro(
  d: Pick<Disposicion, 'bajar' | 'fuera'>,
  tramo: number,
  [px, fila]: readonly [number, number],
): Plano {
  return {
    x: PASO_DE_TRAMO * (tramo - 1) + px / TRAMO.pxPorPaso - d.fuera.izq,
    y: profundidadDeFila(fila + bajarDe(d, tramo)),
  };
}

/**
 * La disposición de cada facción. La de los Templarios es la de los caballeros, con
 * su arte (19-10-2026); las otras cuatro, la de marcadores de los no muertos (la
 * del nigromante), cada una con sus vecinos (`data/vecinos.json`).
 */
const CRUDOS: Readonly<Record<FactionId, unknown>> = {
  templarios: templariosJson,
  'no-muertos': noMuertosJson,
  imperio: imperioJson,
  elfos: elfosJson,
  orkos: orkosJson,
};

/**
 * El borde de atrás de lo que se pisa en `x`: la recta a trozos que une los
 * umbrales de las puertas, plana más allá de las de los extremos. Lo que se pisa
 * ya no es convexo: quien camina en recta resbala por él (`alaFranja` en cada
 * fotograma de la marcha, `escenas/castillo.ts`).
 */
export function bordeDeAtras(d: Pick<Disposicion, 'umbrales'>, x: number): number {
  const u = d.umbrales;
  const primero = u[0];
  const ultimo = u[u.length - 1];
  if (primero === undefined || ultimo === undefined) return 0;
  if (x <= primero.x) return primero.y;
  if (x >= ultimo.x) return ultimo.y;
  for (let i = 1; i < u.length; i++) {
    const a = u[i - 1] as Plano;
    const b = u[i] as Plano;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return ultimo.y;
}

/** Si `p` cae dentro de lo que se pisa. */
export function enLaFranja(d: Pick<Disposicion, 'ancho' | 'umbrales'>, p: Plano): boolean {
  return (
    p.x >= MARGEN_DE_LA_FRANJA &&
    p.x <= d.ancho - MARGEN_DE_LA_FRANJA &&
    p.y >= bordeDeAtras(d, p.x) - 1e-9 &&
    p.y <= FONDO_DE_LA_FRANJA
  );
}

/**
 * El punto de lo que se pisa frente a `p`: el mismo si se pisa. Es lo que hace
 * un clic fuera —sobre una fachada, el cielo o el margen—: llevar a la figura al
 * borde, en esa `x`, no ignorarlo.
 */
export function alaFranja(d: Pick<Disposicion, 'ancho' | 'umbrales'>, p: Plano): Plano {
  const x = Math.max(MARGEN_DE_LA_FRANJA, Math.min(d.ancho - MARGEN_DE_LA_FRANJA, p.x));
  return { x, y: Math.max(bordeDeAtras(d, x), Math.min(FONDO_DE_LA_FRANJA, p.y)) };
}

function numeros(v: unknown, n: number, que: string): number[] {
  if (!Array.isArray(v) || v.length !== n || !v.every((k) => typeof k === 'number')) {
    throw new Error(`${que} tiene que ser una lista de ${n} números`);
  }
  return v as number[];
}

function punto(v: unknown, que: string): Plano {
  const [x, y] = numeros(v, 2, `${que} ([x, y] en pasos)`) as [number, number];
  return { x, y };
}

/** La disposición de la base de una facción, comprobada. Lanza con lo que está mal. */
export function disposicionDe(faccion: FactionId): Disposicion {
  const cache = CACHE.get(faccion);
  if (cache !== undefined) return cache;
  const d = leerDisposicion(faccion, CRUDOS[faccion]);
  CACHE.set(faccion, d);
  return d;
}
const CACHE = new Map<FactionId, Disposicion>();

/** Cuántos tramos de la plaza de una base sirven de fondo a la escena de un lugar. */
export const TRAMOS_DE_UN_LUGAR = 2;

/**
 * La disposición del fondo de la escena de un lugar de un mundo (F1a del mapa
 * vivo, sin arte nuevo): los primeros `tramos` de la plaza de la base de esa
 * facción, con su ancho recalculado y solo los umbrales que caen dentro (por ellos
 * pasa el borde de atrás de lo que se pisa). Los sitios se quedan, pero el lugar
 * no pinta edificios. Se camina por ella con la cámara y la franja de la base.
 */
export function disposicionDelLugar(faccion: FactionId, tramos = TRAMOS_DE_UN_LUGAR): Disposicion {
  const clave = `${faccion}:${tramos}`;
  const hecha = DEL_LUGAR.get(clave);
  if (hecha !== undefined) return hecha;
  const d = disposicionDe(faccion);
  const n = Math.max(1, Math.min(tramos, d.tramos));
  const der = n === d.tramos ? d.fuera.der : 0;
  const ancho = PASOS_POR_TRAMO + (n - 1) * PASO_DE_TRAMO - d.fuera.izq - der;
  const lugar: Disposicion = {
    ...d,
    tramos: n,
    ancho,
    fuera: { izq: d.fuera.izq, der },
    bajar: d.bajar.slice(0, n),
    entrada: alaFranja({ ancho, umbrales: d.umbrales }, { x: 1, y: FONDO_DE_LA_FRANJA / 2 }),
    umbrales: d.umbrales.filter((u) => u.x <= ancho),
  };
  DEL_LUGAR.set(clave, lugar);
  return lugar;
}
const DEL_LUGAR = new Map<string, Disposicion>();

/** La mediana de una lista no vacía. */
export function mediana(v: readonly number[]): number {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 1 ? (o[m] as number) : ((o[m - 1] as number) + (o[m] as number)) / 2;
}

/** Lee y comprueba una disposición cruda; `disposicionDe` la lee de `data/bases/`. */
export function leerDisposicion(faccion: FactionId, crudo: unknown): Disposicion {
  const donde = `data/bases/${faccion}.json`;
  const j = crudo as {
    tramos?: unknown;
    fuera?: unknown;
    entrada?: unknown;
    sitios?: Record<string, { tramo?: unknown; puerta?: unknown; region?: unknown }>;
    vecinos?: Record<string, { en?: unknown; mira?: unknown }>;
  };
  const tramos = j?.tramos;
  if (typeof tramos !== 'number' || !Number.isInteger(tramos) || tramos < 1) {
    throw new Error(`${donde}: falta «tramos», cuántos cuadros de la plaza hay (un entero ≥ 1)`);
  }
  const [izq, der] = numeros(j.fuera, 2, `${donde}: fuera ([izquierda, derecha] en pasos)`) as [
    number,
    number,
  ];
  for (const [lado, v] of [
    ['izquierda', izq],
    ['derecha', der],
  ] as const) {
    if (v < 0 || v > FUERA_MAXIMO) {
      throw new Error(
        `${donde}: lo que se recorta por la ${lado} son ${v} pasos: va de 0 a ${FUERA_MAXIMO}`,
      );
    }
  }
  const fuera = { izq, der };
  const ancho = PASOS_POR_TRAMO + (tramos - 1) * PASO_DE_TRAMO - izq - der;
  if (!(ancho > 2 * MARGEN_DE_LA_FRANJA)) {
    throw new Error(`${donde}: con ${tramos} tramos el escenario mide ${ancho} pasos: no se anda`);
  }

  const crudos = j.sitios ?? {};
  for (const k of Object.keys(crudos)) {
    if (!(SITIOS as readonly string[]).includes(k)) {
      throw new Error(`${donde}: sobra el sitio "${k}": los sitios son ${SITIOS.join(', ')}`);
    }
  }
  const leidos = SITIOS.map((id) => {
    const s = crudos[id];
    if (s === undefined) throw new Error(`${donde}: falta el sitio "${id}"`);
    const tramo = s.tramo;
    if (typeof tramo !== 'number' || !Number.isInteger(tramo) || tramo < 1 || tramo > tramos) {
      throw new Error(
        `${donde}: el sitio "${id}" está en el tramo ${tramo}, y los hay del 1 al ${tramos}`,
      );
    }
    const [px, fila] = numeros(
      s.puerta,
      2,
      `${donde}: sitios.${id}.puerta ([x, fila] en píxeles de su tramo)`,
    ) as [number, number];
    const [x0, x1, pie] = numeros(
      s.region,
      3,
      `${donde}: sitios.${id}.region ([x0, x1, pie] en píxeles de su tramo)`,
    ) as [number, number, number];
    const vista = columnasALaVista({ tramos, fuera }, tramo);
    if (!(x0 < x1) || x0 < vista.desde || x1 > vista.hasta || pie > TRAMO.alto || pie <= 0) {
      throw new Error(
        `${donde}: la región de "${id}" (${x0}-${x1}, hasta la fila ${pie}) sale de lo que se ve de su tramo ${tramo} (columnas ${vista.desde}-${vista.hasta}, filas hasta ${TRAMO.alto})`,
      );
    }
    if (px < x0 || px > x1 || fila > pie) {
      throw new Error(
        `${donde}: la puerta de "${id}" (${px}, ${fila}) cae fuera de su región (${x0}-${x1}, hasta la fila ${pie})`,
      );
    }
    return { id, tramo, px, fila, region: { x0, x1, pie } };
  });
  for (const a of leidos)
    for (const b of leidos)
      if (
        a.id < b.id &&
        a.tramo === b.tramo &&
        a.region.x0 < b.region.x1 &&
        b.region.x0 < a.region.x1
      ) {
        throw new Error(
          `${donde}: las regiones de "${a.id}" (${a.region.x0}-${a.region.x1}) y "${b.id}" (${b.region.x0}-${b.region.x1}) se pisan en el tramo ${a.tramo}`,
        );
      }

  // Cada tramo se baja (o se sube) lo que su pie quedó por encima de la raya.
  // Todos tienen algún sitio: un tramo vacío no tendría pie que medir.
  const bajar = Array.from({ length: tramos }, (_, i) => {
    const filas = leidos.filter((s) => s.tramo === i + 1).map((s) => s.fila);
    if (filas.length === 0) {
      throw new Error(
        `${donde}: el tramo ${i + 1} no tiene ningún sitio: sin puertas no hay pie por el que alinearlo`,
      );
    }
    return filaDelPanorama(0) - mediana(filas);
  });
  const umbrales = leidos.map((s) => ({
    id: s.id,
    en: planoDelCuadro({ bajar, fuera }, s.tramo, [s.px, s.fila]),
  }));
  for (const u of umbrales) {
    if (Math.abs(u.en.y) > PUERTA_LEJOS_DE_LA_RAYA) {
      throw new Error(
        `${donde}: la plaza pintada no casa con la franja: el umbral de "${u.id}" queda a ${u.en.y.toFixed(2)} pasos de la raya (alineando su tramo por la mediana de sus puertas), más de ${PUERTA_LEJOS_DE_LA_RAYA}`,
      );
    }
  }
  const forma = {
    ancho,
    umbrales: umbrales.map((u) => u.en).sort((a, b) => a.x - b.x),
  };
  const pisable = (p: Plano, que: string): Plano => {
    if (!enLaFranja(forma, p)) {
      throw new Error(
        `${donde}: ${que} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) cae fuera de lo que se pisa (x de ${MARGEN_DE_LA_FRANJA} a ${ancho - MARGEN_DE_LA_FRANJA}; en esa x, y de ${bordeDeAtras(forma, p.x).toFixed(2)} a ${FONDO_DE_LA_FRANJA})`,
      );
    }
    return p;
  };

  const sitios = {} as Record<SitioId, SitioEnLaPlaza>;
  for (const [i, s] of leidos.entries()) {
    const umbral = (umbrales[i] as (typeof umbrales)[number]).en;
    const ex = umbral.x + (umbral.x > ancho / 2 ? -ENCARGADO.x : ENCARGADO.x);
    sitios[s.id] = {
      tramo: s.tramo,
      umbral: { enElCuadro: [s.px, s.fila], en: umbral },
      puerta: pisable({ x: umbral.x, y: umbral.y + Y_DE_LA_PUERTA }, `la puerta de "${s.id}"`),
      encargado: pisable(
        { x: ex, y: bordeDeAtras(forma, ex) + ENCARGADO.y },
        `el encargado de "${s.id}"`,
      ),
      region: s.region,
    };
  }

  const entrada = pisable(punto(j.entrada, `${donde}: entrada`), 'la entrada');
  const esperados = new Set(idsDeVecinos(faccion));
  const vecinos: Record<string, { en: Plano; mira: Mirada }> = {};
  for (const [id, v] of Object.entries(j.vecinos ?? {})) {
    if (!esperados.has(id)) {
      throw new Error(
        `${donde}: el vecino "${id}" no está en data/vecinos.json (hay ${[...esperados].join(', ')})`,
      );
    }
    const mira = MIRADAS.find((m) => m === v.mira);
    if (mira === undefined) {
      throw new Error(`${donde}: vecinos.${id}.mira tiene que ser una de ${MIRADAS.join(', ')}`);
    }
    vecinos[id] = {
      en: pisable(punto(v.en, `${donde}: vecinos.${id}.en`), `el vecino "${id}"`),
      mira,
    };
  }
  for (const id of esperados) {
    if (vecinos[id] === undefined) {
      throw new Error(`${donde}: falta dónde está el vecino "${id}" de data/vecinos.json`);
    }
  }

  return {
    faccion,
    tramos,
    ancho,
    fuera,
    bajar,
    entrada,
    sitios,
    vecinos,
    umbrales: forma.umbrales,
  };
}

/** Una imagen derivada en el índice del arte, con los sha256 que cazan una sustituida sin volver a derivar. */
export interface DerivadaEnElIndice {
  readonly imagen: string;
  readonly ancho: number;
  readonly alto: number;
  /** El sha256 del WebP: cambia si alguien sustituye la imagen sin volver a derivarla. */
  readonly sha256: string;
  /** El sha256 de los píxeles derivados, antes de comprimir: lo vuelve a derivar `base-arte.test.ts`. */
  readonly origen: string;
}

/** Un recorte en el índice: dónde está en su tramo (su esquina de arriba a la izquierda, en píxeles del tramo). */
export interface RecorteEnElIndice extends DerivadaEnElIndice {
  readonly tramo: number;
  readonly en: readonly [number, number];
}

/**
 * `assets/bases/<f>/indice.json`: lo escribe el taller (`recortarLaBase`,
 * `tools/taller/recorte-base.ts`) y lo lee el cliente de una vez
 * (`render/base/arte.ts`). Todo lo que se puede derivar del cuadro va hecho:
 * el cliente no crea lienzos al cargar.
 */
export interface IndiceDeLaBase {
  /**
   * Lo que se pinta de cada tramo, de izquierda a derecha: la placa por encima
   * de su pie y, desde el segundo, con su solape (`SOLAPE`) fundido a
   * transparente; `null` el que falta.
   */
  readonly tramos: readonly (DerivadaEnElIndice | null)[];
  /** El empedrado repetible que va debajo de toda la plaza, y de qué tramo sale; `null` sin placa de la que sacarlo. */
  readonly suelo: (DerivadaEnElIndice & { readonly tramo: number }) | null;
  /**
   * El cielo que sigue por encima del cuadro: la media de la fila de arriba de
   * todas las placas, en RGB. Uno solo: con el de cada una se veía la raya donde
   * se cosen. `null` sin placas.
   */
  readonly cielo: readonly [number, number, number] | null;
  readonly edificios: Readonly<Record<string, RecorteEnElIndice>>;
  /**
   * La versión abierta de cada morada que la tiene, por el id de su edificio: el
   * mismo edificio sin la pared de delante, con su sala dentro (la «casa de
   * muñecas», 20-10-2026), que sustituye a su recorte mientras se recluta en ella
   * (`escenas/morada.ts`, `conLaAbierta`). Se recorta como cualquier edición, por
   * la diferencia con la placa en la región de su sitio, y va en la raíz de la
   * base (`abierta-<id>.webp`).
   */
  readonly abiertas: Readonly<Record<string, RecorteEnElIndice>>;
  readonly derivadoPor: 'tools/taller/recorte-base.ts';
}

/**
 * El índice de una base sin arte: el de las facciones con marcadores, el que se
 * escribe sin fuentes y el que usa el cliente si no llega el suyo.
 */
export const INDICE_VACIO: IndiceDeLaBase = {
  tramos: [],
  suelo: null,
  cielo: null,
  edificios: {},
  abiertas: {},
  derivadoPor: 'tools/taller/recorte-base.ts',
};
