/**
 * Las cifras de la rueda del golpe por niveles (`data/rueda.json`) y lo que da el
 * nivel de un arma en cada tipo (`Pieza.rueda`, vuelta 2 del 18-10-2026): leerlas,
 * traducir unos niveles a cifras y decir lo que no vale. **Sin dependencias** del
 * resto del núcleo (solo `types.ts`, `validar.ts` y el JSON): la regla de una
 * pieza (`problemasDePieza`, `data.ts`) juzga con ellas la rueda de un arma al
 * cargar `data/equipo.json`, y `data.ts` no puede importar `rueda.ts`, que lo lee.
 * El resto de la rueda —el cruce, los efectos, las notas— está en `rueda.ts`, que
 * reexporta lo de aquí.
 */
import ruedaJson from '../../../data/rueda.json' with { type: 'json' };
import {
  esTipoDelAnillo,
  type NivelesDeLaRueda,
  TIPOS_DE_GOLPE,
  TIPOS_DEL_ANILLO,
  type TipoDeGolpe,
  type TipoDelAnillo,
} from '../types.js';
import { entero, objetoCon } from '../validar.js';

/** El punto del cruce, del mínimo (0) al máximo (4). */
export type Punto = 0 | 1 | 2 | 3 | 4;

/** Los cinco puntos, del mínimo al máximo: las muescas del medidor y las claves de un éxito. */
export const PUNTOS: readonly Punto[] = [0, 1, 2, 3, 4];

/** Quien elige en la rueda: el que pega o el que recibe. */
export type PapelEnLaRueda = 'golpe' | 'respuesta';

/** Una cifra por éxito del golpe: el punto del cruce de quien pega, del mínimo al máximo. */
export type PorExito = Readonly<Record<Punto, number>>;

/**
 * Las cifras de cada tipo con los niveles de un arma (`cifrasDeLosNiveles`), con
 * el nombre de lo que son. Normal no está: siempre es ×1 (decisión del usuario,
 * 18-10-2026).
 */
export interface CifrasDeLaRueda {
  /** El % del daño del Fuerte (150: ×1,5). */
  readonly fuerte: { readonly porcentaje: number };
  /** El % del daño de cada golpe del Rápido, y por cuánto multiplica los golpes. */
  readonly rapido: { readonly porcentaje: number; readonly golpes: number };
  /** Lo que suma Ofensivo al ataque del golpe que se da. */
  readonly ofensivo: { readonly ataque: number };
  /** La defensa que se pone quien golpea con Defensivo. */
  readonly defensivo: { readonly defensa: number };
  /** Lo que quita Romper guardia al ataque del atacado, por éxito (0 o menos). */
  readonly romperGuardia: { readonly ataque: PorExito };
  /** Las casillas que resta la Finta de lo que le queda por andar, por éxito (0 o más). */
  readonly finta: { readonly casillas: PorExito };
}

/** La mezcla de la IA al elegir en la rueda, por papel: un peso por tipo. */
export type PesosDeLaRueda = Readonly<
  Record<PapelEnLaRueda, Readonly<Record<TipoDeGolpe, number>>>
>;

/** Cómo se llama cada tipo para la persona: en la rueda, el parte y la barra. */
export const NOMBRE_DE_GOLPE: Readonly<Record<TipoDeGolpe, string>> = {
  rapido: 'Rápido',
  defensivo: 'Defensivo',
  finta: 'Finta',
  fuerte: 'Fuerte',
  romperGuardia: 'Romper guardia',
  ofensivo: 'Ofensivo',
  normal: 'Normal',
};

/**
 * El nivel más alto de un tipo (el más bajo es 0): siete niveles, del 0 al 6
 * (decisión del usuario, 18-10-2026). Es la forma de la tabla, no una cifra que
 * se ajuste: cambiarlo es cambiar `data/rueda.json` entero.
 */
export const NIVEL_MAXIMO = 6;

/**
 * Lo que se dice de Normal, que no tiene nivel (decisión del usuario, 18-10-2026).
 * La única frase: la leen la regla de los niveles, la de los extras de una pieza
 * con base y la nota de la rueda en la ficha de un arma.
 */
export const NORMAL_SIN_NIVEL = 'Normal no tiene nivel: siempre ×1';

/**
 * Lo que no vale de una clave de la rueda de `q` que no es un tipo del anillo:
 * Normal, que no tiene nivel, o un tipo que no existe. La leen los niveles de un
 * arma (`problemasDeNiveles`) y los extras de una pieza con base (`data.ts`).
 */
export function fueraDelAnillo(clave: string, q: string): string {
  return clave === 'normal'
    ? `${q}: ${NORMAL_SIN_NIVEL}`
    : `${q}: «${clave}» no es un tipo del anillo de la rueda; valen ${TIPOS_DEL_ANILLO.join(', ')}`;
}

/** Una cifra por nivel, del 0 al `NIVEL_MAXIMO`. */
type PorNivel = readonly number[];

/** La tabla de `data/rueda.json`: lo que da cada nivel de cada tipo. */
interface TablaDeLaRueda {
  readonly fuerte: PorNivel;
  readonly rapido: PorNivel;
  readonly golpesDelRapido: number;
  readonly ofensivo: PorNivel;
  readonly defensivo: PorNivel;
  /** Lo que quita Romper guardia con el éxito máximo (0 o menos). */
  readonly romperGuardia: PorNivel;
  /**
   * Lo que resta la Finta con el éxito mínimo (0 o más); cada punto de éxito,
   * una casilla menos, sin bajar de 0.
   */
  readonly finta: PorNivel;
}

const CAMPOS_DE_LA_RUEDA = [
  '_comment',
  'fuerte',
  'rapido',
  'ofensivo',
  'defensivo',
  'romperGuardia',
  'finta',
  'pesos',
];

/**
 * Siete enteros, uno por nivel, desde `minimo` y hasta `maximo`, que **no
 * empeoran al subir** (`mejora`: 1 si mejorar es subir la cifra, −1 si es
 * bajarla, como la Finta, que mejora restando menos casillas). Lanza diciendo el
 * campo y el nivel.
 */
function porNivel(
  valor: unknown,
  quien: string,
  limites: { readonly minimo: number; readonly maximo?: number; readonly mejora: 1 | -1 },
): PorNivel {
  if (!Array.isArray(valor) || valor.length !== NIVEL_MAXIMO + 1) {
    throw new Error(
      `${quien}: tiene que ser una lista de ${NIVEL_MAXIMO + 1} enteros, la cifra de los niveles 0 a ${NIVEL_MAXIMO}`,
    );
  }
  const cifras = valor.map((v, nivel) => {
    const n = entero(v, `el nivel ${nivel}`, quien, limites.minimo);
    if (limites.maximo !== undefined && n > limites.maximo) {
      throw new Error(`${quien}: el nivel ${nivel} va hasta ${limites.maximo}, y es ${n}`);
    }
    return n;
  });
  for (let nivel = 1; nivel < cifras.length; nivel++) {
    const antes = cifras[nivel - 1] as number;
    const ahora = cifras[nivel] as number;
    if ((ahora - antes) * limites.mejora < 0) {
      throw new Error(
        `${quien}: el nivel ${nivel} (${ahora}) es peor que el ${nivel - 1} (${antes}): un nivel más alto no empeora`,
      );
    }
  }
  return cifras;
}

/** Los pesos de un papel: uno por tipo, enteros ≥ 0, y alguno mayor que 0. */
function pesosDe(valor: unknown, quien: string): Readonly<Record<TipoDeGolpe, number>> {
  const o = objetoCon(valor, TIPOS_DE_GOLPE, quien);
  const pesos = {} as Record<TipoDeGolpe, number>;
  for (const t of TIPOS_DE_GOLPE) {
    if (!(t in o)) throw new Error(`${quien}: falta el peso de «${t}»`);
    pesos[t] = entero(o[t], `el peso de «${t}»`, quien, 0);
  }
  if (TIPOS_DE_GOLPE.every((t) => pesos[t] === 0)) {
    throw new Error(`${quien}: todos los pesos son 0, y la IA no tendría qué elegir`);
  }
  return pesos;
}

/**
 * Valida la tabla de la rueda y la devuelve tipada; lanza diciendo el fichero y
 * el campo. Exportada con el JSON de argumento para que un test la vea morder.
 */
export function validarRueda(
  json: unknown,
  fichero = 'data/rueda.json',
): { readonly tabla: TablaDeLaRueda; readonly pesos: PesosDeLaRueda } {
  const j = objetoCon(json, CAMPOS_DE_LA_RUEDA, fichero);
  const campo = (nombre: string, campos: readonly string[]): Record<string, unknown> => {
    if (!(nombre in j)) throw new Error(`${fichero}: falta «${nombre}»`);
    return objetoCon(j[nombre], campos, `${fichero}: ${nombre}`);
  };
  const fuerte = campo('fuerte', ['porcentaje']);
  const rapido = campo('rapido', ['porcentaje', 'golpes']);
  const ofensivo = campo('ofensivo', ['ataque']);
  const defensivo = campo('defensivo', ['defensa']);
  const romper = campo('romperGuardia', ['conExitoMaximo']);
  const finta = campo('finta', ['conExitoMinimo']);
  const pesos = campo('pesos', ['golpe', 'respuesta']);
  // Los % en enteros (×1,5 = 150): se validan sin coma, y un golpe que no hace
  // daño no es un golpe (1 o más).
  const tabla: TablaDeLaRueda = {
    fuerte: porNivel(fuerte.porcentaje, `${fichero}: fuerte.porcentaje`, { minimo: 1, mejora: 1 }),
    rapido: porNivel(rapido.porcentaje, `${fichero}: rapido.porcentaje`, { minimo: 1, mejora: 1 }),
    golpesDelRapido: entero(rapido.golpes, 'los golpes', `${fichero}: rapido`, 1),
    ofensivo: porNivel(ofensivo.ataque, `${fichero}: ofensivo.ataque`, { minimo: 0, mejora: 1 }),
    defensivo: porNivel(defensivo.defensa, `${fichero}: defensivo.defensa`, {
      minimo: 0,
      mejora: 1,
    }),
    // Quita ataque: 0 o menos, y mejor cuanto más quita.
    romperGuardia: porNivel(romper.conExitoMaximo, `${fichero}: romperGuardia.conExitoMaximo`, {
      minimo: Number.MIN_SAFE_INTEGER,
      maximo: 0,
      mejora: -1,
    }),
    // Resta casillas: 0 o más, y mejor cuanto menos resta.
    finta: porNivel(finta.conExitoMinimo, `${fichero}: finta.conExitoMinimo`, {
      minimo: 0,
      mejora: -1,
    }),
  };
  return {
    tabla,
    pesos: {
      golpe: pesosDe(pesos.golpe, `${fichero}: pesos.golpe`),
      respuesta: pesosDe(pesos.respuesta, `${fichero}: pesos.respuesta`),
    },
  };
}

const LEIDA = validarRueda(ruedaJson);

/**
 * La tabla de `data/rueda.json`. **Privada**: la lee solo `cifrasDeLosNiveles`
 * (y los golpes del Rápido, `GOLPES_DEL_RAPIDO`), así que una cifra de la rueda
 * sale siempre de los niveles del arma del golpe. Lo vigila
 * `test/invariantes.test.ts`.
 */
const TABLA: TablaDeLaRueda = LEIDA.tabla;

/**
 * Por cuánto multiplica Rápido los golpes: no depende del nivel (el arma cambia el
 * daño de cada golpe, no cuántos). Lo lee `golpesDe`.
 */
export const GOLPES_DEL_RAPIDO: number = TABLA.golpesDelRapido;

/**
 * La mezcla de la IA al elegir en la rueda, por papel (`ai/rueda.ts`): no depende
 * del arma, y va aparte de las cifras para que lo que se enseña de un golpe
 * (`previsionDeLaRueda().rueda`) no lleve nada de cómo elige la IA.
 */
export const PESOS_DE_LA_RUEDA: PesosDeLaRueda = LEIDA.pesos;

/**
 * La cifra de `tabla` en el nivel de `tipo` de `n`; si no está en ella (un bug:
 * la pieza ya se juzgó), lanza con lo que diría la regla de los niveles.
 */
function delNivel(tabla: PorNivel, n: NivelesDeLaRueda, tipo: TipoDelAnillo): number {
  const cifra = tabla[n[tipo]];
  if (cifra === undefined) throw new Error(problemasDeNiveles(n, 'la rueda del arma').join('; '));
  return cifra;
}

/**
 * Las cifras de la rueda con los niveles `n` de un arma: **la única lectura de la
 * tabla** (`TABLA`). Por éxito `p` (el punto del cruce, 0 el mínimo, 4 el máximo),
 * en enteros: Romper guardia quita `⌊|q| · p / 4⌋` (q, lo que quita su nivel con
 * el éxito máximo: con el nivel 3, 0, 0, −1, −2, −3), y la Finta resta
 * `max(0, m − p)` (m, lo que resta su nivel con el éxito mínimo: una casilla menos
 * por cada punto de éxito; con el nivel 3, 5, 4, 3, 2, 1). Con más éxito,
 * Romper guardia quita más y la Finta resta menos. Lo leen el golpe
 * (`ruedaDelGolpe`) y la ficha de una pieza (`filasDeLaRueda`).
 */
export function cifrasDeLosNiveles(n: NivelesDeLaRueda): CifrasDeLaRueda {
  const guardadas = CIFRAS_POR_NIVELES.get(n);
  if (guardadas !== undefined) return guardadas;
  const quita = -delNivel(TABLA.romperGuardia, n, 'romperGuardia');
  const resta = delNivel(TABLA.finta, n, 'finta');
  const romper = {} as Record<Punto, number>;
  const finta = {} as Record<Punto, number>;
  for (const p of PUNTOS) {
    // `0 - x` y no `-x`: con `quita` 0, `-0` no es `0` para quien compara con `toEqual`.
    romper[p] = 0 - Math.floor((quita * p) / 4);
    finta[p] = Math.max(0, resta - p);
  }
  const c: CifrasDeLaRueda = {
    fuerte: { porcentaje: delNivel(TABLA.fuerte, n, 'fuerte') },
    rapido: {
      porcentaje: delNivel(TABLA.rapido, n, 'rapido'),
      golpes: TABLA.golpesDelRapido,
    },
    ofensivo: { ataque: delNivel(TABLA.ofensivo, n, 'ofensivo') },
    defensivo: { defensa: delNivel(TABLA.defensivo, n, 'defensivo') },
    romperGuardia: { ataque: romper },
    finta: { casillas: finta },
  };
  CIFRAS_POR_NIVELES.set(n, c);
  return c;
}

/**
 * Las cifras ya calculadas de cada objeto de niveles: los de un arma
 * (`Pieza.rueda`) no cambian —cambiar una pieza en la arena pone otra—, y las
 * piden cada golpe de la rueda, su previsión y la IA que lo simula. Débil, para no
 * retener las de piezas que ya no lleva nadie. Una función pura recordada.
 */
const CIFRAS_POR_NIVELES = new WeakMap<NivelesDeLaRueda, CifrasDeLaRueda>();

/**
 * Lo que no vale de los niveles de la rueda de un arma (`Pieza.rueda`), cada cosa
 * con su frase, o vacío si valen: un objeto con **los seis** tipos del anillo, cada
 * uno un entero de 0 a `NIVEL_MAXIMO`; Normal no tiene nivel. `q` dice de qué
 * pieza. Lo lee la regla de una pieza (`problemasDePieza`).
 */
export function problemasDeNiveles(r: unknown, q: string): string[] {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) {
    return [`${q}: la rueda tiene que ser un objeto con un nivel por tipo`];
  }
  const o = r as Record<string, unknown>;
  const problemas: string[] = [];
  for (const ajeno of Object.keys(o).filter((k) => !esTipoDelAnillo(k))) {
    problemas.push(fueraDelAnillo(ajeno, q));
  }
  for (const t of TIPOS_DEL_ANILLO) {
    const v = o[t];
    if (v === undefined) {
      problemas.push(`${q}: falta el nivel de ${NOMBRE_DE_GOLPE[t]} (de 0 a ${NIVEL_MAXIMO})`);
    } else if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
      problemas.push(
        `${q}: el nivel de ${NOMBRE_DE_GOLPE[t]} tiene que ser un entero de 0 a ${NIVEL_MAXIMO}`,
      );
    } else if (v < 0 || v > NIVEL_MAXIMO) {
      problemas.push(`${q}: el nivel de ${NOMBRE_DE_GOLPE[t]} es ${v}: va de 0 a ${NIVEL_MAXIMO}`);
    }
  }
  return problemas;
}
