/**
 * El lado de disco de la arena (`/arena/`): qué hojas hay, el catálogo de
 * unidades (`data/unidades.json`, el que lee `core/catalogo.ts`) y los borradores
 * de las piezas de equipo (`data/borradores/equipo.json`) y de las formas de
 * muralla. Lo sirve el servidor de desarrollo (`vite.config.ts`) y nada más: el
 * navegador no puede escribir en el repo. La partida no lee los borradores.
 *
 * Aparte de `vite.config.ts` para que los tests lo ejerzan contra una carpeta
 * temporal sin arrancar vite.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  COMENTARIO_DEL_BORRADOR_DE_EQUIPO,
  catalogoDeLaArena,
  type HojaDeArena,
  revisarBorradorDeEquipo,
  validarBorradorDeEquipo,
  validarHojasDeArena,
} from '../../src/core/arena.js';
import {
  COMENTARIO_DEL_BORRADOR_DE_MURALLAS,
  type FormaDeMuralla,
  type FormaSinValidar,
  revisarBorradorDeMurallas,
  validarBorradorDeMurallas,
} from '../../src/core/arena-murallas.js';
import type { PiezaEscrita } from '../../src/core/data.js';
import { EQUIPO_DEL_JUEGO, type EquipoAtado } from '../../src/core/hero/equipo.js';
import {
  COMENTARIO_DEL_CATALOGO_DE_UNIDADES,
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  revisarCatalogo,
  type UnidadDeArena,
  type UnidadSinValidar,
  validarCatalogo,
} from '../../src/core/unidad.js';
import type { ElementoSinValidar } from '../../src/core/validar.js';
import { NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import {
  arteEnOchoDirecciones,
  HEROES,
  juegoDelYBot,
  perfilDeArena,
  UNIDADES,
} from '../taller/unidades.js';
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
 * El arte propio de una unidad tal como lo lee la arena: sus ocho
 * `dN/atlas.json`, o `null` sin ninguno (sale con el Y Bot), y si lo tiene a
 * medias, el motivo en `incompleta` (#140). Una unidad a medias no lanza —el
 * taller la está generando, y la lista de la arena y `vite build` caían con
 * ella— pero tampoco se pinta con el Y Bot: la arena la lista y no la monta.
 */
export function direccionesDe(
  raiz: string,
  id: string,
): Pick<HojaDeArena, 'direcciones' | 'incompleta'> {
  const arte = arteEnOchoDirecciones(raiz, id);
  if (arte.hecho === 'ninguno') return { direcciones: null, incompleta: null };
  if (arte.hecho === 'a-medias') return { direcciones: null, incompleta: arte.motivo };
  const direcciones = NOMBRES_DE_DIRECCION.map(
    (_, d) =>
      JSON.parse(
        readFileSync(join(raiz, 'assets/unidades', id, `d${d}`, 'atlas.json'), 'utf8'),
      ) as unknown,
  );
  return { direcciones, incompleta: null };
}

/**
 * Todas las unidades del taller, la tropa primero y los héroes detrás, en el
 * orden de `tools/taller/unidades.ts`: toda figura tiene 8 direcciones —las
 * suyas o las del Y Bot de su juego de armas (decisión del usuario,
 * 03-10-2026)—, así que ya no hace falta arte propio para montarla. Pasan por
 * la misma validación que la página aplica al recibirlas, así que un perfil que
 * la arena no conoce revienta aquí, al servir la lista, y no a mitad de una pelea.
 */
export function hojasDeArena(raiz: string): readonly HojaDeArena[] {
  const todas = [
    ...UNIDADES.map((u) => ({ u, heroe: false })),
    ...HEROES.map((u) => ({ u, heroe: true })),
  ];
  return validarHojasDeArena(
    todas.map(({ u, heroe }) => ({
      id: u.id,
      nombre: u.nombre,
      faccion: u.faccion,
      perfil: perfilDeArena(u),
      personaje: u.personaje ?? u.id,
      heroe,
      casillas: velocidadDelCuerpo(u.personaje ?? u.id),
      juego: juegoDelYBot(u),
      ...direccionesDe(raiz, u.id),
    })),
  );
}

/**
 * Un fichero de la arena en disco —el catálogo de unidades y los borradores de
 * piezas y de murallas—: dónde vive, qué lista lleva y con qué regla se lee y se
 * escribe. Comparten `leer` y `escribir`, que son los que guardan las garantías
 * (lo que no vale se conserva, lo ilegible no se pisa, la escritura es atómica).
 */
interface FicheroDeLaArena<T, I extends { readonly crudo: unknown }> {
  readonly ruta: string;
  /** La lista del archivo: `{ _comment, [campo]: [...] }`. */
  readonly campo: string;
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
 * El catálogo de unidades en disco. Se **lee** con las piezas de la arena `eq`,
 * como las lee la página: una unidad cuya pieza no está sale como «no vale» con
 * su motivo y se conserva, como cualquier otra. Se **escribe** con la regla con
 * que lo carga el juego (`validarCatalogo` con las piezas de `data/equipo.json`,
 * `escribirCatalogo`).
 */
function deUnidades(eq: EquipoAtado): FicheroDeLaArena<UnidadDeArena, UnidadSinValidar> {
  return {
    ruta: RUTA_DEL_CATALOGO_DE_UNIDADES,
    campo: 'unidades',
    comentario: COMENTARIO_DEL_CATALOGO_DE_UNIDADES,
    revisar: (valor) => revisarCatalogo(valor, eq),
    validar: (valor) => validarCatalogo(valor, EQUIPO_DEL_JUEGO),
    clave: (u) => u.id,
    claveSinValidar: (u) => u.id,
  };
}

/**
 * Lo guardado, elemento a elemento (`revisar`); vacío si todavía no se ha
 * guardado nada. Lanza si el archivo no es JSON o no tiene su forma (`{ [campo]: [...] }`):
 * ahí no hay nada que salvar, y guardar encima lo borraría.
 */
function leer<T, I extends { readonly crudo: unknown }>(
  raiz: string,
  b: FicheroDeLaArena<T, I>,
): Revisado<T, I> {
  const ruta = join(raiz, b.ruta);
  if (!existsSync(ruta)) return { validas: [], invalidas: [] };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(ruta, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`${b.ruta} no es JSON: ${err instanceof Error ? err.message : err}`);
  }
  return b.revisar(json);
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
interface Preparado {
  readonly ruta: string;
  readonly contenido: unknown;
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
  let antes: { readonly validas: readonly T[]; readonly invalidas: readonly I[] };
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
      _comment: b.comentario,
      [b.campo]: [...validas, ...conservadas.map((i) => i.crudo)],
    },
    escritas: validas.length,
    conservadas: conservadas.length,
  };
}

/**
 * Un temporal por archivo y luego los `rename`: un guardado a medias dejaría un
 * JSON roto, y con dos archivos, todos los temporales se escriben antes de que
 * ninguno pise al suyo.
 */
function escribirAtomico(listos: readonly Preparado[]): void {
  const temporales = listos.map(({ ruta, contenido }) => {
    mkdirSync(dirname(ruta), { recursive: true });
    const temporal = `${ruta}.${process.pid}.tmp`;
    writeFileSync(temporal, `${JSON.stringify(contenido, null, 2)}\n`);
    return { temporal, ruta };
  });
  for (const { temporal, ruta } of temporales) renameSync(temporal, ruta);
}

/**
 * El catálogo de unidades y el borrador de piezas tal como están en disco: lo que vale y lo
 * que no y por qué. Solo el formato de hoy: lo de antes no vale, y se conserva
 * tal cual al guardar como cualquier otra cosa que no vale.
 *
 * Las unidades se leen con las piezas guardadas: una puede llevar una nueva. Un
 * archivo de piezas ilegible no deja ilegible el de unidades: se leen con las
 * piezas del juego y `equipoIlegible` dice por qué (las que llevan una pieza
 * nueva salen como «no vale» y se conservan). Guardar, en cambio, no lo pisa.
 */
export function leerCatalogo(raiz: string): {
  readonly unidades: readonly UnidadDeArena[];
  readonly invalidas: readonly UnidadSinValidar[];
  readonly piezas: readonly PiezaEscrita[];
  readonly piezasInvalidas: readonly ElementoSinValidar[];
  readonly equipoIlegible?: string;
} {
  let equipo: Revisado<PiezaEscrita, ElementoSinValidar>;
  let equipoIlegible: string | null = null;
  try {
    equipo = leer(raiz, DE_EQUIPO);
  } catch (err) {
    equipo = { validas: [], invalidas: [] };
    equipoIlegible = err instanceof Error ? err.message : String(err);
  }
  const { validas, invalidas } = leer(raiz, deUnidades(catalogoDeLaArena(equipo.validas)));
  return {
    unidades: validas,
    invalidas,
    piezas: equipo.validas,
    piezasInvalidas: equipo.invalidas,
    ...(equipoIlegible === null ? {} : { equipoIlegible }),
  };
}

/**
 * «Guardar» de la arena, **una sola operación**: las piezas y las unidades
 * (`{ unidades, piezas }`). Si todo vale se escriben los dos archivos, cada uno
 * atómico (`escribirAtomico`); si algo no vale, o uno de los dos de ahora no se
 * puede leer, no se escribe ninguno y se dice por qué. El de piezas no se crea si
 * no hay nada que poner.
 *
 * Las unidades se validan **una vez, con la regla con que las carga el juego**
 * (`validarCatalogo` con las piezas de `data/equipo.json`, como
 * `core/catalogo.ts`): una unidad que solo vale con una pieza del borrador de
 * equipo (nueva, o cambiada de forma que con la del fichero no valdría) tumbaría
 * esa carga, así que no se guarda, y el motivo lo dice. Las piezas de la arena y
 * las del fichero son dos cosas hasta que el editor de equipo escriba en
 * `data/equipo.json` (F2).
 */
export function escribirCatalogo(
  raiz: string,
  cuerpo: unknown,
): {
  readonly unidades: number;
  readonly conservadas: number;
  readonly rutaDePiezas: string;
  readonly piezas: number;
  readonly piezasConservadas: number;
} {
  const piezas = validarBorradorDeEquipo(cuerpo);
  const deEquipo = preparar(raiz, DE_EQUIPO, piezas);
  const catalogo = deUnidades(catalogoDeLaArena(piezas));
  const deUnidadesListo = preparar(raiz, catalogo, catalogo.validar(cuerpo));
  const sinNadaQuePoner = deEquipo.escritas + deEquipo.conservadas === 0;
  escribirAtomico(
    sinNadaQuePoner && !existsSync(deEquipo.ruta) ? [deUnidadesListo] : [deEquipo, deUnidadesListo],
  );
  return {
    unidades: deUnidadesListo.escritas,
    conservadas: deUnidadesListo.conservadas,
    rutaDePiezas: RUTA_DE_EQUIPO,
    piezas: deEquipo.escritas,
    piezasConservadas: deEquipo.conservadas,
  };
}

/** Dónde viven las piezas de la arena, relativo a la raíz del repo. */
export const RUTA_DE_EQUIPO = 'data/borradores/equipo.json';

const DE_EQUIPO: FicheroDeLaArena<PiezaEscrita, ElementoSinValidar> = {
  ruta: RUTA_DE_EQUIPO,
  campo: 'piezas',
  comentario: COMENTARIO_DEL_BORRADOR_DE_EQUIPO,
  revisar: revisarBorradorDeEquipo,
  validar: validarBorradorDeEquipo,
  clave: (p) => p.id,
  claveSinValidar: (p) => p.clave,
};

// ---------------------------------------------------------------- murallas

/** Dónde viven las formas de muralla, relativo a la raíz del repo. */
export const RUTA_DE_MURALLAS = 'data/borradores/murallas.json';

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
