/**
 * Las cifras de la rueda del golpe (`data/rueda.json`) y lo que les suma un arma
 * (`Pieza.rueda`, 18-10-2026): leerlas, sumarles el arma y decir lo que no vale.
 * **Sin dependencias** del resto del núcleo (solo `types.ts`, `validar.ts` y el
 * JSON): la regla de una pieza (`problemasDePieza`, `data.ts`) juzga con ellas la
 * rueda de un arma al cargar `data/equipo.json`, y `data.ts` no puede importar
 * `rueda.ts`, que lo lee. El resto de la rueda —el cruce, los efectos, las notas—
 * está en `rueda.ts`, que reexporta lo de aquí.
 */
import ruedaJson from '../../../data/rueda.json' with { type: 'json' };
import { type RuedaDelArma, TIPOS_DE_GOLPE, type TipoDeGolpe } from '../types.js';
import { entero, objetoCon, porcentaje } from '../validar.js';

/** El punto del cruce, del mínimo (0) al máximo (4). */
export type Punto = 0 | 1 | 2 | 3 | 4;

/** Los cinco puntos, del mínimo al máximo: las muescas del medidor y las claves de un éxito. */
export const PUNTOS: readonly Punto[] = [0, 1, 2, 3, 4];

/** Quien elige en la rueda: el que pega o el que recibe. */
export type PapelEnLaRueda = 'golpe' | 'respuesta';

/** Una cifra por éxito del golpe: el punto del cruce de quien pega, del mínimo al máximo. */
export type PorExito = Readonly<Record<Punto, number>>;

/**
 * Las cifras de cada tipo, de `data/rueda.json` con lo que sume el arma del golpe
 * (`cifrasDeLaRuedaCon`), con el nombre de lo que son.
 */
export interface CifrasDeLaRueda {
  /** El % del daño del Fuerte (125: ×1,25). */
  readonly fuerte: { readonly porcentaje: number };
  /** El % del daño de cada golpe del Rápido, y por cuánto multiplica los golpes. */
  readonly rapido: { readonly porcentaje: number; readonly golpes: number };
  /** El % del daño del Normal (100: sin modificar; un arma puede cambiarlo). */
  readonly normal: { readonly porcentaje: number };
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

/** Lo que dice `COMO_SUMA_EL_ARMA` de un tipo: según qué cifra suya cambia el arma. */
type ComoSuma =
  | { readonly unidad: string; readonly mide: 'porcentaje' }
  | {
      readonly unidad: string;
      readonly mide: 'cifra';
      readonly de: (c: CifrasDeLaRueda) => number;
    }
  | { readonly unidad: string; readonly mide: 'porExito'; readonly signo: 'quita' | 'resta' };

/**
 * Cómo cambia un arma cada tipo, un descriptor por tipo: en qué se mide lo que
 * suma (`unidad`, para la persona) y qué cifra suya cambia (`mide`): el % del daño
 * (Fuerte, Rápido y Normal: el factor del golpe, que tiene que quedar por encima
 * de 0), una cifra de ataque o de defensa (Ofensivo y Defensivo, `de`: 0 o más) o
 * una por éxito que quita o resta (Romper guardia y la Finta, `signo`: el arma la
 * aleja de 0 o, con un negativo, la acerca, sin pasar de él). Lo leen la suma
 * (`cifrasDeLaRuedaCon`), lo que no vale (`ruedaDelArmaBlocker`), el factor del
 * golpe (`rueda.ts`) y la tabla de la ficha de una pieza.
 */
export const COMO_SUMA_EL_ARMA = {
  fuerte: { unidad: '% de daño', mide: 'porcentaje' },
  rapido: { unidad: '% de daño por golpe', mide: 'porcentaje' },
  normal: { unidad: '% de daño', mide: 'porcentaje' },
  ofensivo: { unidad: 'ataque', mide: 'cifra', de: (c: CifrasDeLaRueda) => c.ofensivo.ataque },
  defensivo: {
    unidad: 'defensa',
    mide: 'cifra',
    de: (c: CifrasDeLaRueda) => c.defensivo.defensa,
  },
  romperGuardia: {
    unidad: 'ataque que quita de más en cada éxito',
    mide: 'porExito',
    signo: 'quita',
  },
  finta: { unidad: 'casillas que resta de más en cada éxito', mide: 'porExito', signo: 'resta' },
} as const satisfies Readonly<Record<TipoDeGolpe, ComoSuma>>;

/** Los tipos que cambian el daño del golpe, en % (`COMO_SUMA_EL_ARMA`, `mide: 'porcentaje'`). */
export type TipoDeDanio = {
  [T in TipoDeGolpe]: (typeof COMO_SUMA_EL_ARMA)[T]['mide'] extends 'porcentaje' ? T : never;
}[TipoDeGolpe];

/** Si el tipo `t` cambia el daño del golpe, en % (Fuerte, Rápido, Normal). */
export function esTipoDeDanio(t: TipoDeGolpe): t is TipoDeDanio {
  return COMO_SUMA_EL_ARMA[t].mide === 'porcentaje';
}

const CAMPOS_DE_LA_RUEDA = [
  '_comment',
  'fuerte',
  'rapido',
  'ofensivo',
  'defensivo',
  'romperGuardia',
  'finta',
  'normal',
  'pesos',
];

/** El nombre de cada punto en `data/rueda.json`: las claves de una cifra por éxito. */
const CLAVE_DEL_PUNTO: Readonly<Record<Punto, string>> = {
  0: 'minimo',
  1: 'bajo',
  2: 'medio',
  3: 'alto',
  4: 'maximo',
};

/**
 * Una cifra por éxito: las cinco claves (`CLAVE_DEL_PUNTO`), enteros, y del signo
 * de lo que son: Romper guardia quita (`quita`, 0 o menos) y la Finta resta
 * casillas (0 o más). Falta una o sobra un campo, lanza diciendo cuál.
 */
function porExito(valor: unknown, quien: string, signo: 'quita' | 'resta'): PorExito {
  const claves = PUNTOS.map((p) => CLAVE_DEL_PUNTO[p]);
  const o = objetoCon(valor, claves, quien);
  const out = {} as Record<Punto, number>;
  for (const p of PUNTOS) {
    const clave = CLAVE_DEL_PUNTO[p];
    if (!(clave in o)) throw new Error(`${quien}: falta el éxito «${clave}»`);
    const n = entero(o[clave], `el éxito «${clave}»`, quien, signo === 'quita' ? -1000 : 0);
    if (signo === 'quita' && n > 0) {
      throw new Error(`${quien}: el éxito «${clave}» quita, así que es 0 o menos, y es ${n}`);
    }
    out[p] = n;
  }
  return out;
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
 * Valida las cifras de la rueda y las devuelve tipadas; lanza diciendo el
 * fichero y el campo. Exportada con el JSON de argumento para que un test la vea
 * morder.
 */
export function validarRueda(
  json: unknown,
  fichero = 'data/rueda.json',
): { readonly cifras: CifrasDeLaRueda; readonly pesos: PesosDeLaRueda } {
  const j = objetoCon(json, CAMPOS_DE_LA_RUEDA, fichero);
  const campo = (nombre: string, campos: readonly string[]): Record<string, unknown> =>
    objetoCon(j[nombre], campos, `${fichero}: ${nombre}`);
  const fuerte = campo('fuerte', ['porcentaje']);
  const rapido = campo('rapido', ['porcentaje', 'golpes']);
  const normal = campo('normal', ['porcentaje']);
  const ofensivo = campo('ofensivo', ['ataque']);
  const defensivo = campo('defensivo', ['defensa']);
  const romper = campo('romperGuardia', ['ataque']);
  const finta = campo('finta', ['casillas']);
  const pesos = campo('pesos', ['golpe', 'respuesta']);
  // En el JSON, en tanto por ciento y en enteros: se valida sin coma, y se guarda
  // así para que el arma sume puntos de % (`cifrasDeLaRuedaCon`).
  const enPorcentaje = (o: Record<string, unknown>, quien: string): number =>
    porcentaje(o, `${fichero}: ${quien}`);
  const cifras: CifrasDeLaRueda = {
    fuerte: { porcentaje: enPorcentaje(fuerte, 'fuerte') },
    rapido: {
      porcentaje: enPorcentaje(rapido, 'rapido'),
      golpes: entero(rapido.golpes, 'los golpes', `${fichero}: rapido`, 1),
    },
    normal: { porcentaje: enPorcentaje(normal, 'normal') },
    ofensivo: { ataque: entero(ofensivo.ataque, 'el ataque', `${fichero}: ofensivo`, 0) },
    defensivo: { defensa: entero(defensivo.defensa, 'la defensa', `${fichero}: defensivo`, 0) },
    romperGuardia: {
      ataque: porExito(
        romper.ataque,
        `${fichero}: romperGuardia.ataque`,
        COMO_SUMA_EL_ARMA.romperGuardia.signo,
      ),
    },
    finta: {
      casillas: porExito(
        finta.casillas,
        `${fichero}: finta.casillas`,
        COMO_SUMA_EL_ARMA.finta.signo,
      ),
    },
  };
  return {
    cifras,
    pesos: {
      golpe: pesosDe(pesos.golpe, `${fichero}: pesos.golpe`),
      respuesta: pesosDe(pesos.respuesta, `${fichero}: pesos.respuesta`),
    },
  };
}

const LEIDA = validarRueda(ruedaJson);

/**
 * Las cifras de `data/rueda.json`, sin arma. **Privada**: quien las quiera las
 * pide con su arma (`cifrasDeLaRuedaCon`; un golpe, `ruedaDelGolpe`), y sin arma
 * con `cifrasDeLaRuedaCon(undefined)`, que lo dice al leerse. Lo vigila
 * `test/invariantes.test.ts`.
 */
const RUEDA_SIN_ARMA: CifrasDeLaRueda = LEIDA.cifras;

/**
 * La mezcla de la IA al elegir en la rueda, por papel (`ai/rueda.ts`): no depende
 * del arma, y va aparte de las cifras para que lo que se enseña de un golpe
 * (`previsionDeLaRueda().rueda`) no lleve nada de cómo elige la IA.
 */
export const PESOS_DE_LA_RUEDA: PesosDeLaRueda = LEIDA.pesos;

/**
 * Una cifra por éxito con `mas` de más en cada uno, en el sentido de su `signo`
 * (`COMO_SUMA_EL_ARMA`): lo que quita, quita `mas` más; lo que resta, resta `mas`
 * más. Con un `mas` negativo se acerca a 0, sin pasar de él.
 */
function porExitoCon(valores: PorExito, mas: number, signo: 'quita' | 'resta'): PorExito {
  const out = {} as Record<Punto, number>;
  for (const p of PUNTOS) {
    out[p] = signo === 'quita' ? Math.min(0, valores[p] - mas) : Math.max(0, valores[p] + mas);
  }
  return out;
}

/**
 * Las cifras de la rueda con lo que suma un arma (`Pieza.rueda`, 18-10-2026: «una
 * maza es mejor en ataque fuerte y peor en rápido»), cada tipo en su unidad
 * (`COMO_SUMA_EL_ARMA`): Fuerte, Rápido y Normal, puntos de %; Ofensivo, ataque;
 * Defensivo, defensa; Romper guardia quita `mod` más en cada éxito, sin pasar de
 * 0 (un −1 quita uno menos, hasta nada); la Finta resta `mod` casillas más en
 * cada éxito, sin bajar de 0. Sin arma o sin nada que sumar, **la misma
 * referencia**. Lo que deja una rueda rota (un Fuerte en 0 %) lo dice
 * `ruedaDelArmaBlocker`, antes.
 */
export function cifrasDeLaRuedaCon(mods: RuedaDelArma | undefined): CifrasDeLaRueda {
  const c = RUEDA_SIN_ARMA;
  if (mods === undefined || TIPOS_DE_GOLPE.every((t) => (mods[t] ?? 0) === 0)) return c;
  const m = (t: TipoDeGolpe): number => mods[t] ?? 0;
  const { romperGuardia, finta } = COMO_SUMA_EL_ARMA;
  return {
    fuerte: { porcentaje: c.fuerte.porcentaje + m('fuerte') },
    rapido: { porcentaje: c.rapido.porcentaje + m('rapido'), golpes: c.rapido.golpes },
    normal: { porcentaje: c.normal.porcentaje + m('normal') },
    ofensivo: { ataque: c.ofensivo.ataque + m('ofensivo') },
    defensivo: { defensa: c.defensivo.defensa + m('defensivo') },
    romperGuardia: {
      ataque: porExitoCon(c.romperGuardia.ataque, m('romperGuardia'), romperGuardia.signo),
    },
    finta: { casillas: porExitoCon(c.finta.casillas, m('finta'), finta.signo) },
  };
}

/**
 * Por qué lo que suma un arma a la rueda (`Pieza.rueda`) no vale, o `null`: el %
 * final de Fuerte, Rápido y Normal tiene que quedar por encima de 0 (un golpe que
 * no hace daño no es un golpe), y lo que suman Ofensivo y Defensivo, en 0 o más
 * (que Ofensivo reste ataque es otro tipo). Romper guardia y la Finta se quedan
 * en 0 solas (`cifrasDeLaRuedaCon`). Lo lee la regla de una pieza
 * (`problemasDePieza`), también al cargar `data/equipo.json`.
 */
export function ruedaDelArmaBlocker(mods: RuedaDelArma | undefined): string | null {
  const c = cifrasDeLaRuedaCon(mods);
  const sinArma = cifrasDeLaRuedaCon(undefined);
  for (const t of TIPOS_DE_GOLPE) {
    const como = COMO_SUMA_EL_ARMA[t];
    if (esTipoDeDanio(t) && c[t].porcentaje <= 0) {
      return `con ella, ${NOMBRE_DE_GOLPE[t]} haría el ${c[t].porcentaje} % del daño: tiene que quedar por encima de 0 (sin arma, ${sinArma[t].porcentaje} %)`;
    }
    if (como.mide === 'cifra' && como.de(c) < 0) {
      return `con ella, ${NOMBRE_DE_GOLPE[t]} restaría ${como.unidad} (${como.de(c)}): como mucho se queda en 0`;
    }
  }
  return null;
}
