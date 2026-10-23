/**
 * El lado de disco de la arena (`/arena/`): qué hojas hay, los catálogos de
 * unidades (`data/unidades.json`, el que lee `core/catalogo.ts`) y de equipo
 * (`data/equipo.json`, el que carga `core/data.ts`) y el borrador de las formas de
 * muralla. Lo sirve el servidor de desarrollo (`vite.config.ts`) y nada más: el
 * navegador no puede escribir en el repo. La partida no lee el borrador.
 *
 * Aparte de `vite.config.ts` para que los tests lo ejerzan contra una carpeta
 * temporal sin arrancar vite.
 */
import { join } from 'node:path';

import {
  COMENTARIO_DEL_BORRADOR_DE_MURALLAS,
  type FormaDeMuralla,
  type FormaSinValidar,
  RUTA_DE_MURALLAS,
  revisarBorradorDeMurallas,
  validarBorradorDeMurallas,
} from '../../src/core/arena-murallas.js';
import {
  COMENTARIO_DEL_CATALOGO_DE_EQUIPO,
  type PiezaEscrita,
  RUTA_DEL_CATALOGO_DE_EQUIPO,
} from '../../src/core/data.js';
import {
  type CatalogoDeEquipo,
  catalogoDelFichero,
  type EquipoAtado,
} from '../../src/core/hero/equipo.js';
import { moradasBlocker } from '../../src/core/town/buildings.js';
import {
  COMENTARIO_DEL_CATALOGO_DE_UNIDADES,
  type Hoja,
  leerCatalogos,
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  revisarCatalogo,
  type Unidad,
  type UnidadSinValidar,
  validarCatalogo,
  validarHojas,
} from '../../src/core/unidad.js';
import { type AEscribir, comentarioDe, escribirAtomico, jsonDe } from '../json.js';
import { direccionesDe } from '../taller/arte-en-disco.js';
import { HEROES, juegoDelYBot, perfilDeUnidad, UNIDADES } from '../taller/unidades.js';
import { VELOCIDAD_DEL_CUERPO } from './velocidades.js';

/**
 * Las casillas del cuerpo de un personaje: uno sin las suyas es un olvido, y se
 * dice. Las del cuerpo, sin el equipo: con el escudo de su perfil pelea con una menos.
 */
function velocidadDelCuerpo(personaje: string): number {
  const fila = VELOCIDAD_DEL_CUERPO[personaje];
  if (fila === undefined) {
    throw new Error(
      `el personaje ${personaje} no tiene la velocidad de su cuerpo en tools/arena/velocidades.ts`,
    );
  }
  return fila[0];
}

/**
 * Todas las unidades del taller, la tropa primero y los héroes detrás, en el
 * orden de `tools/taller/unidades.ts`: toda figura tiene 8 direcciones —las
 * suyas o las del Y Bot de su juego de armas (decisión del usuario,
 * 03-10-2026)—, así que ya no hace falta arte propio para montarla. Pasan por
 * la misma validación que la página aplica al recibirlas, así que un perfil que
 * la arena no conoce revienta aquí, al servir la lista, y no a mitad de una pelea.
 */
export function hojasDelTaller(raiz: string): readonly Hoja[] {
  const todas = [
    ...UNIDADES.map((u) => ({ u, heroe: false })),
    ...HEROES.map((u) => ({ u, heroe: true })),
  ];
  return validarHojas(
    todas.map(({ u, heroe }) => ({
      id: u.id,
      nombre: u.nombre,
      faccion: u.faccion,
      perfil: perfilDeUnidad(u),
      personaje: u.personaje ?? u.id,
      heroe,
      casillas: velocidadDelCuerpo(u.personaje ?? u.id),
      juego: juegoDelYBot(u),
      ...direccionesDe(raiz, u.id),
    })),
  );
}

/**
 * Un fichero de la arena en disco —el catálogo de unidades y el borrador de
 * murallas—: dónde vive, qué lista lleva y con qué regla se lee y se
 * escribe. Comparten `leer` y `escribir`, que son los que guardan las garantías
 * (lo que no vale se conserva, lo ilegible no se pisa, la escritura es atómica).
 */
interface FicheroDeLaArena<T, I extends { readonly crudo: unknown }> {
  readonly ruta: string;
  /** La lista del archivo: `{ _comment, [campo]: [...] }`. */
  readonly campo: string;
  /** El `_comment` si el archivo no trae uno: el que trae se conserva (`comentarioDe`). */
  readonly comentario: string;
  /** Lo del archivo, elemento a elemento: solo el formato de hoy. */
  readonly revisar: (valor: unknown) => Revisado<T, I>;
  readonly validar: (valor: unknown) => readonly T[];
  readonly clave: (t: T) => string;
  /** La clave de uno que no valida, si la trae: mandar uno válido con ella es arreglarlo. */
  readonly claveSinValidar: (i: I) => string | null;
}

/** Lo que da `revisar`: lo que vale y lo que no. */
interface Revisado<T, I> {
  readonly validas: readonly T[];
  readonly invalidas: readonly I[];
}

/**
 * El catálogo de unidades en disco, con las piezas `eq`: las del catálogo de
 * equipo en disco al leerlo, y las que se van a escribir con él al guardar. Se
 * **lee** como lo lee la página: una unidad cuya pieza no está sale como «no
 * vale» con su motivo y se conserva, como cualquier otra. Se **escribe** con la
 * regla con que lo carga el juego (`validarCatalogo`).
 */
function deUnidades(eq: EquipoAtado): FicheroDeLaArena<Unidad, UnidadSinValidar> {
  return {
    ruta: RUTA_DEL_CATALOGO_DE_UNIDADES,
    campo: 'unidades',
    comentario: COMENTARIO_DEL_CATALOGO_DE_UNIDADES,
    revisar: (valor) => revisarCatalogo(valor, eq),
    validar: (valor) => validarCatalogo(valor, eq),
    clave: (u) => u.id,
    claveSinValidar: (u) => u.id,
  };
}

/**
 * Lo guardado, elemento a elemento (`revisar`), con su comentario; vacío si todavía
 * no se ha guardado nada. Lanza si el archivo no es JSON o no tiene su forma
 * (`{ [campo]: [...] }`): ahí no hay nada que salvar, y guardar encima lo borraría.
 */
function leer<T, I extends { readonly crudo: unknown }>(
  raiz: string,
  b: FicheroDeLaArena<T, I>,
): Revisado<T, I> & { readonly comentario: string } {
  const json = jsonDe(raiz, b.ruta);
  if (json === undefined) return { validas: [], invalidas: [], comentario: b.comentario };
  return { ...b.revisar(json), comentario: comentarioDe(json, b.comentario) };
}

/**
 * Escribe el fichero si es válido, y si no lanza con la frase de `validar` sin
 * tocar el fichero (`preparar`, `escribirAtomico`).
 */
function escribir<T, I extends { readonly crudo: unknown }>(
  raiz: string,
  b: FicheroDeLaArena<T, I>,
  cuerpo: unknown,
): { readonly escritas: number; readonly conservadas: number } {
  const listo = preparar(raiz, b, b.validar(cuerpo));
  escribirAtomico([listo]);
  return listo;
}

/** Lo que se va a escribir en un fichero de la arena: dónde, qué, y cuántos de cada. */
interface Preparado extends AEscribir {
  readonly escritas: number;
  readonly conservadas: number;
}

/**
 * El archivo entero con `validas` (ya validadas) y lo que hay que conservar del de
 * ahora, sin escribir nada todavía.
 *
 * **Guardar no pierde nada que no se haya tocado** (H2 de QA): lo del archivo
 * que no valida se escribe otra vez tal cual —salvo que la página mande uno
 * válido con la misma clave, que es arreglarlo—, y si el archivo de ahora no se
 * puede leer, no se pisa: se rechaza diciéndolo.
 *
 * Arreglarlo es mandar una clave que el archivo no tenía buena. Si ya la tenía,
 * lo que no valida es una repetida, y la página manda la buena porque la manda
 * siempre, no para arreglar la otra: la repetida se conserva, como promete el
 * aviso (QA, M3; antes se la comía la primera forma que se guardara).
 */
function preparar<T, I extends { readonly crudo: unknown }>(
  raiz: string,
  b: FicheroDeLaArena<T, I>,
  validas: readonly T[],
): Preparado {
  let antes: ReturnType<typeof leer<T, I>>;
  try {
    antes = leer(raiz, b);
  } catch (err) {
    throw new Error(
      `no se guarda para no pisarlo: ${err instanceof Error ? err.message : err}. Arréglalo o bórralo a mano`,
    );
  }
  const nuevas = new Set(validas.map(b.clave));
  const yaBuenas = new Set(antes.validas.map(b.clave));
  const conservadas = antes.invalidas.filter((i) => {
    const clave = b.claveSinValidar(i);
    return clave === null || !nuevas.has(clave) || yaBuenas.has(clave);
  });
  return {
    ruta: join(raiz, b.ruta),
    contenido: {
      _comment: antes.comentario,
      [b.campo]: [...validas, ...conservadas.map((i) => i.crudo)],
    },
    escritas: validas.length,
    conservadas: conservadas.length,
  };
}

/**
 * El catálogo de equipo en disco (`data/equipo.json`), hecho con la regla con que
 * lo carga el juego (`catalogoDelFichero`, una sola validación): lanza con lo que
 * no vale. Del disco y no del módulo (`EQUIPO`): el servidor lo cargó al arrancar
 * y «Guardar» lo cambia. Con su comentario, que «Guardar» conserva.
 */
function equipoEnDisco(raiz: string): {
  readonly equipo: CatalogoDeEquipo;
  readonly comentario: string;
} {
  const json = jsonDe(raiz, RUTA_DEL_CATALOGO_DE_EQUIPO);
  if (json === undefined) throw new Error(`${RUTA_DEL_CATALOGO_DE_EQUIPO} no existe`);
  return {
    equipo: catalogoDelFichero(json),
    comentario: comentarioDe(json, COMENTARIO_DEL_CATALOGO_DE_EQUIPO),
  };
}

/**
 * Los catálogos de unidades y de equipo tal como están en disco. Las unidades, lo
 * que vale y lo que no y por qué (solo el formato de hoy: lo de antes no vale, y
 * se conserva tal cual al guardar como cualquier otra cosa que no vale), leídas
 * con las piezas del disco: una puede llevar una nueva. El catálogo de equipo,
 * entero: si no vale, lanza (el juego tampoco lo cargaría) y no se lee nada.
 */
export function leerCatalogo(raiz: string): {
  readonly unidades: readonly Unidad[];
  readonly invalidas: readonly UnidadSinValidar[];
  readonly piezas: readonly PiezaEscrita[];
} {
  const { equipo } = equipoEnDisco(raiz);
  const { validas, invalidas } = leer(raiz, deUnidades(equipo));
  return { unidades: validas, invalidas, piezas: [...equipo.escritas.values()] };
}

/**
 * «Guardar» de la arena, **una sola operación**: el catálogo de equipo y el de
 * unidades (`{ unidades, piezas }`). Si todo vale se escriben los dos archivos,
 * cada uno atómico (`escribirAtomico`) y con el comentario que tenía en disco; si
 * algo no vale, o el de unidades de ahora no se puede leer, no se escribe ninguno
 * y se dice por qué.
 *
 * **La misma regla con que los carga el juego**: las piezas, entero
 * (`catalogoDelFichero`: cada pieza, sus bases, alguna de botín) y, con ellas, lo
 * que se exige a los dos catálogos juntos (`leerCatalogos`: el equipo base del
 * héroe y las unidades) y a las unidades con los edificios (`moradasBlocker`). Un catálogo de equipo que no vale no se conserva a medias:
 * el juego no arrancaría con él.
 */
export function escribirCatalogo(
  raiz: string,
  cuerpo: unknown,
): {
  readonly unidades: number;
  readonly conservadas: number;
  readonly piezas: number;
} {
  const equipo = catalogoDelFichero(cuerpo);
  const unidades = leerCatalogos(equipo, cuerpo);
  // Y con los edificios: una unidad que sale de una morada que no es de su
  // facción, o una morada sin unidades, y la partida no arrancaría.
  const moradas = moradasBlocker(unidades);
  if (moradas !== null) throw new Error(`no se guarda: ${moradas}`);
  const deUnidadesListo = preparar(raiz, deUnidades(equipo), unidades);
  const escritas = [...equipo.escritas.values()];
  // El comentario del disco. Ilegible, no se pisa, como el de unidades (`preparar`).
  let json: unknown;
  try {
    json = jsonDe(raiz, RUTA_DEL_CATALOGO_DE_EQUIPO);
  } catch (err) {
    throw new Error(
      `no se guarda para no pisarlo: ${err instanceof Error ? err.message : err}. Arréglalo o bórralo a mano`,
    );
  }
  escribirAtomico([
    {
      ruta: join(raiz, RUTA_DEL_CATALOGO_DE_EQUIPO),
      contenido: {
        _comment: comentarioDe(json, COMENTARIO_DEL_CATALOGO_DE_EQUIPO),
        piezas: escritas,
      },
      escritas: escritas.length,
      conservadas: 0,
    },
    deUnidadesListo,
  ]);
  return {
    unidades: deUnidadesListo.escritas,
    conservadas: deUnidadesListo.conservadas,
    piezas: escritas.length,
  };
}

// ---------------------------------------------------------------- murallas

const DE_MURALLAS: FicheroDeLaArena<FormaDeMuralla, FormaSinValidar> = {
  ruta: RUTA_DE_MURALLAS,
  campo: 'formas',
  comentario: COMENTARIO_DEL_BORRADOR_DE_MURALLAS,
  revisar: revisarBorradorDeMurallas,
  validar: validarBorradorDeMurallas,
  clave: (f) => f.nombre,
  claveSinValidar: (f) => f.nombre,
};

/** Las formas guardadas, una a una; vacío si aún no se ha guardado ninguna. */
export function leerMurallas(raiz: string): {
  readonly formas: readonly FormaDeMuralla[];
  readonly invalidas: readonly FormaSinValidar[];
} {
  const { validas, invalidas } = leer(raiz, DE_MURALLAS);
  return { formas: validas, invalidas };
}

/**
 * Escribe la lista entera de formas que manda la página —guardar una es mandar
 * la lista con ella; borrarla, sin ella—, con las garantías de `escribir`.
 */
export function escribirMurallas(
  raiz: string,
  cuerpo: unknown,
): { readonly formas: number; readonly conservadas: number } {
  const { escritas, conservadas } = escribir(raiz, DE_MURALLAS, cuerpo);
  return { formas: escritas, conservadas };
}
