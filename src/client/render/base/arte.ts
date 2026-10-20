/**
 * El arte de la base de una facción: el empedrado de toda la plaza (`suelo`,
 * repetible), lo que hay por encima del pie de cada tramo (la plaza pintada sin
 * edificios) y el recorte de cada edificio, sacado del cuadro maestro en su
 * sitio exacto (vuelta 3). Se pide la primera vez que se pinta esa base y nunca
 * lanza: sin arte, la escena pinta sus marcadores (`pintar.ts`) y se juega igual.
 *
 * Lo que hay lo dice `assets/bases/<f>/indice.json`, que deriva el taller de lo
 * que hay en la carpeta (`recortarLaBase`): no se pide nada que no esté en él,
 * así que una facción sin arte no deja un 404 en la consola por cada edificio.
 * Un tramo sin placa va como marcador y el resto se pinta. El índice trae hecho
 * lo que se deriva del cuadro —el solape fundido de cada tramo, el color del
 * cielo—: el cliente no crea lienzos al cargar.
 *
 * De los recortes se piden, con el índice y los tramos, solo los de lo que está
 * construido; lo que se construya después se pide al construirlo. Cada recorte
 * lleva su máscara de alfa a 1/4 (`MASCARA`), que se hace la primera vez que se
 * pulsa cerca (`mascaraDe`): el clic sobre un edificio es sobre lo pintado, no
 * sobre su caja.
 *
 * La versión abierta de una morada (`abierta-<id>.webp`: el edificio sin la
 * pared de delante, con su sala) se pide aparte y solo al entrar en ella
 * (`abiertaDe`), si el índice la trae, y sustituye a su recorte con `conLaAbierta`.
 */
import type { FactionId } from '@core/types.js';
import { INDICE_VACIO, type IndiceDeLaBase, type RecorteEnElIndice } from '../../../shared/base.js';
import { imagenDeLaBase, tandaDeArte } from '../assets.js';

/** A qué fracción de su tamaño se guarda la máscara de un recorte. */
export const MASCARA = 1 / 4;

/** El cielo sin arte, o con un índice sin placas. */
export const CIELO_SIN_ARTE = 'rgb(0, 0, 0)';

/** Dónde está un recorte en su tramo, en píxeles del tramo: su esquina de arriba a la izquierda y su tamaño. */
export type MedidasDelRecorte = Pick<RecorteEnElIndice, 'tramo' | 'en' | 'ancho' | 'alto'>;

export interface RecorteDeLaBase extends MedidasDelRecorte {
  readonly imagen: HTMLImageElement;
}

/** El alfa de un recorte a `MASCARA` de resolución, fila a fila. */
export interface MascaraDelRecorte {
  readonly ancho: number;
  readonly alto: number;
  readonly alfa: Uint8ClampedArray;
}

export interface ArteDeLaBase {
  /**
   * Lo que se pinta de cada tramo, de izquierda a derecha: su placa por encima
   * de su pie, con el pie fundido a transparente y, desde el segundo, el solape
   * también (se pinta encima del anterior y la costura cae dentro del árbol de
   * la junta); `null` donde falta (se pinta su marcador).
   */
  readonly tramos: readonly (HTMLImageElement | null)[];
  /** El empedrado de toda la plaza, repetible, a la escala del cuadro; `null` sin él. */
  readonly suelo: HTMLImageElement | null;
  /** El color medio de la fila de arriba de las placas: el cielo que sigue por encima del cuadro. */
  readonly cielo: string;
  /** Los recortes que ya han llegado, por edificio. Cada llegada es un `ArteDeLaBase` nuevo. */
  readonly edificios: ReadonlyMap<string, RecorteDeLaBase>;
}

interface Cargado {
  readonly indice: IndiceDeLaBase;
  arte: ArteDeLaBase;
  /** Los recortes ya pedidos: los que llegaron y los que están en camino. */
  readonly pedidos: Set<string>;
}

const cargado = new Map<FactionId, Cargado>();
const pedido = new Set<FactionId>();

const urlDe = (f: FactionId, imagen: string): string => `/bases/${f}/${imagen}`;

async function recorteDe(f: FactionId, e: RecorteEnElIndice): Promise<RecorteDeLaBase | null> {
  const imagen = await imagenDeLaBase(urlDe(f, e.imagen));
  return imagen === null
    ? null
    : { imagen, tramo: e.tramo, en: e.en, ancho: e.ancho, alto: e.alto };
}

async function cargar(f: FactionId, construidos: readonly string[]): Promise<void> {
  let indice: IndiceDeLaBase;
  try {
    const r = await fetch(urlDe(f, 'indice.json'));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    indice = (await r.json()) as IndiceDeLaBase;
  } catch (err) {
    console.warn(`[base] sin índice del arte de ${f}: ${err instanceof Error ? err.message : err}`);
    cargado.set(f, {
      indice: INDICE_VACIO,
      arte: { tramos: [], suelo: null, cielo: CIELO_SIN_ARTE, edificios: new Map() },
      pedidos: new Set(),
    });
    return;
  }
  const aPedir = construidos.filter((id) => indice.edificios[id] !== undefined);
  const [suelo, tramos, recortes] = await Promise.all([
    indice.suelo === null ? null : imagenDeLaBase(urlDe(f, indice.suelo.imagen)),
    Promise.all(indice.tramos.map((t) => (t === null ? null : imagenDeLaBase(urlDe(f, t.imagen))))),
    Promise.all(aPedir.map((id) => recorteDe(f, indice.edificios[id] as RecorteEnElIndice))),
  ]);
  const edificios = new Map<string, RecorteDeLaBase>();
  for (const [i, r] of recortes.entries()) if (r !== null) edificios.set(aPedir[i] as string, r);
  const c = indice.cielo;
  cargado.set(f, {
    indice,
    arte: {
      tramos,
      suelo,
      cielo: c === null ? CIELO_SIN_ARTE : `rgb(${c[0]}, ${c[1]}, ${c[2]})`,
      edificios,
    },
    pedidos: new Set(aPedir),
  });
}

/** Pide el recorte de un edificio construido después de abrir la base. */
async function cargarRecorte(f: FactionId, c: Cargado, id: string): Promise<void> {
  const r = await recorteDe(f, c.indice.edificios[id] as RecorteEnElIndice);
  if (r === null) return;
  c.arte = { ...c.arte, edificios: new Map([...c.arte.edificios, [id, r]]) };
}

/**
 * El arte de la base de `f` con los recortes de `construidos`, o `null` mientras
 * llega (o donde no hay navegador: los tests). La primera llamada lo pide; lo
 * construido después, la primera vez que se pinta. Cuando llega algo,
 * `tandaDeArte` pide otro fotograma.
 */
export function arteDeLaBase(f: FactionId, construidos: readonly string[]): ArteDeLaBase | null {
  const hay = cargado.get(f);
  if (hay !== undefined) {
    for (const id of construidos) {
      if (hay.pedidos.has(id) || hay.indice.edificios[id] === undefined) continue;
      hay.pedidos.add(id);
      tandaDeArte(cargarRecorte(f, hay, id));
    }
    return hay.arte;
  }
  if (!pedido.has(f) && typeof Image !== 'undefined' && typeof fetch !== 'undefined') {
    pedido.add(f);
    tandaDeArte(cargar(f, construidos));
  }
  return null;
}

/** Las versiones abiertas pedidas, por `<facción>/<edificio>`: `null` la que no llegó, `undefined` en camino. */
const abiertas = new Map<string, RecorteDeLaBase | null | undefined>();

/**
 * La versión abierta de la morada `edificio` de `f`, o `null` mientras llega, si
 * no la hay o si no llegó (la morada se ve entonces con su exterior). Solo se pide
 * lo que dice el índice: una morada sin versión abierta no deja un 404 en la
 * consola. La primera llamada pide el índice si no estaba (`arteDeLaBase`).
 */
export function abiertaDe(f: FactionId, edificio: string): RecorteDeLaBase | null {
  const hay = cargado.get(f);
  if (hay === undefined) {
    arteDeLaBase(f, [edificio]);
    return null;
  }
  const e = hay.indice.abiertas[edificio];
  if (e === undefined) return null;
  const clave = `${f}/${edificio}`;
  if (abiertas.has(clave)) return abiertas.get(clave) ?? null;
  abiertas.set(clave, undefined);
  tandaDeArte(recorteDe(f, e).then((r) => void abiertas.set(clave, r)));
  return null;
}

/** Lo ya sustituido, por arte y por versión abierta: cada fotograma da el mismo objeto. */
const sustituidos = new WeakMap<ArteDeLaBase, WeakMap<RecorteDeLaBase, ArteDeLaBase>>();

/**
 * El arte de la base con el recorte de `edificio` cambiado por su versión
 * abierta: la ÚNICA sustitución, que leen el pintor y el golpe por
 * `arte.edificios`. Sin versión abierta (o sin arte), el mismo objeto; y dos
 * llamadas con lo mismo dan el mismo objeto, porque el fondo cacheado de la base
 * (`Fondo`, `pintar.ts`) se rehace cuando cambia la identidad del arte.
 */
export function conLaAbierta(
  arte: ArteDeLaBase | null,
  edificio: string,
  abierta: RecorteDeLaBase | null,
): ArteDeLaBase | null {
  if (arte === null || abierta === null) return arte;
  let porArte = sustituidos.get(arte);
  if (porArte === undefined) {
    porArte = new WeakMap();
    sustituidos.set(arte, porArte);
  }
  const hay = porArte.get(abierta);
  if (hay !== undefined) return hay;
  const nuevo: ArteDeLaBase = {
    ...arte,
    edificios: new Map([...arte.edificios, [edificio, abierta]]),
  };
  porArte.set(abierta, nuevo);
  return nuevo;
}

const mascaras = new WeakMap<HTMLImageElement, MascaraDelRecorte | null>();

/**
 * La máscara de alfa de un recorte, hecha la primera vez que se pide: la lee el
 * golpe y solo cuando el clic cae en su caja. `null` si no se pudo leer (sin
 * lienzo): entonces vale la caja entera.
 */
export function mascaraDe(r: RecorteDeLaBase): MascaraDelRecorte | null {
  const hay = mascaras.get(r.imagen);
  if (hay !== undefined) return hay;
  const img = r.imagen;
  const ancho = Math.max(1, Math.round(img.naturalWidth * MASCARA));
  const alto = Math.max(1, Math.round(img.naturalHeight * MASCARA));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  let m: MascaraDelRecorte | null = null;
  if (ctx !== null) {
    ctx.drawImage(img, 0, 0, ancho, alto);
    const datos = ctx.getImageData(0, 0, ancho, alto).data;
    const alfa = new Uint8ClampedArray(ancho * alto);
    for (let i = 0; i < alfa.length; i++) alfa[i] = datos[i * 4 + 3] as number;
    m = { ancho, alto, alfa };
  }
  mascaras.set(img, m);
  return m;
}
