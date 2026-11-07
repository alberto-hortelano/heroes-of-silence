/**
 * Una pieza de equipo: su formato, su regla (`problemasDePieza`), las bases sobre
 * las que va (`resolverBases`, la única suma) y el catálogo escrito en
 * `data/equipo.json` (`leerEquipo`, `EQUIPO`), con el del juego por id
 * (`PIEZAS_DEL_CATALOGO`, `pieza`) y de dónde sale una pieza (`seVende`,
 * `PIEZAS_DE_ARMERIA`, `PIEZAS_DE_BOTIN`). Lo que una pieza da puesta (`conEquipo`)
 * está en `vestir.ts`, y el catálogo atado, en `atado.ts` (eran `hero/equipo.ts`
 * hasta la fase N de la reorganización, 07-11-2026).
 *
 * Su lector vivía en `data.ts`, con las demás tablas; desde la fase N de la
 * reorganización (07-11-2026) cada `data/*.json` lo lee el módulo de su dominio, que
 * lo valida al cargar.
 */
import equipoJson from '../../../data/equipo.json' with { type: 'json' };
import {
  fueraDelAnillo,
  NIVEL_MAXIMO,
  NOMBRE_DE_GOLPE,
  problemasDeNiveles,
} from '../battle/cifras-de-la-rueda.js';
import {
  CIFRAS_DE_PIEZA,
  type CifraDePieza,
  camposDelHueco,
  type ExtrasDeLaRueda,
  esHuecoDePieza,
  esTipoDelAnillo,
  HUECOS_DE_PIEZA,
  type HuecoDePieza,
  type NivelesDeLaRueda,
  NOMBRE_DE_CIFRA,
  NOMBRE_DE_HUECO,
  TIPOS_DEL_ANILLO,
} from '../types.js';
import { AGILIDAD_DEL_CUERPO_MAX, AGILIDAD_DEL_CUERPO_MIN } from '../unidad/cuerpo.js';
import { enteroBlocker, enteroDesde, esIdDePieza, esObjeto, revisarLista } from '../validar.js';

/**
 * De dónde se consigue una pieza en la partida (18-10-2026, una sola clase de
 * piezas): la vende la armería (`armeria`) o cae como botín (`botin`). Una pieza
 * sin ninguno (`[]`) solo la llevan las unidades que nacen con ella (su kit, en
 * `data/unidades.json`). Es una propiedad de la pieza, escrita, y no una lista
 * aparte: «¿se vende?» se le pregunta a la pieza (`seVende`, `caeComoBotin`).
 */
export const DONDE_SE_CONSIGUE = ['armeria', 'botin'] as const;

export type DondeSeConsigue = (typeof DONDE_SE_CONSIGUE)[number];

/**
 * Cómo se dice cada sitio de donde sale una pieza, y la frase de la que no sale de
 * ninguno (`SOLO_EN_KITS`). **La tabla, una vez**: la leen la prosa del agente, el
 * motivo de `buyBlocker` (`deDondeSale`) y la ficha de la arena.
 */
export const DICHO_DE_DONDE: Readonly<Record<DondeSeConsigue, string>> = {
  armeria: 'se vende en la armería',
  botin: 'cae como botín',
};

/** Lo que se dice de una pieza que no se vende ni cae como botín (`seConsigue: []`). */
export const SOLO_EN_KITS =
  'no se vende ni cae como botín: solo la llevan las unidades que nacen con ella';

/**
 * Lo que tira una pieza de `distancia` que no es un arco ni una ballesta
 * (`Pieza.tiro`): un arma de fuego o una granada.
 */
export const TIPOS_DE_TIRO = ['fuego', 'granada'] as const;

export type TipoDeTiro = (typeof TIPOS_DE_TIRO)[number];

/** Lo más que recarga un arma de fuego, en turnos (`Pieza.recarga`). **Inventado**: deja probar de sobra. */
export const RECARGA_MAXIMA = 9;

/** Las más granadas que lleva una pieza a cada batalla (`Pieza.cargas`). **Inventado**, como `RECARGA_MAXIMA`. */
export const CARGAS_MAXIMAS = 9;

/** Una pieza de `data/equipo.json`. **Inventada y provisional**, como dice su `_comment`. */
export interface Pieza {
  readonly id: string;
  readonly nombre: string;
  /** El suyo; una de `arma` va también en `segunda` (`huecosDeLaPieza`). */
  readonly hueco: HuecoDePieza;
  /** De dónde se consigue en la partida (`DONDE_SE_CONSIGUE`); `[]`, de ningún sitio (`SOLO_EN_KITS`). */
  readonly seConsigue: readonly DondeSeConsigue[];
  readonly ataque: number;
  readonly defensa: number;
  /**
   * Puntos de armadura (#262): se restan del daño de cada golpe, disparo, hechizo
   * o poder que recibe quien la lleva, con mínimo 0 (`trasLaArmadura`,
   * `battle/armas.ts`). Ninguna pieza suma PV: protege esto. Sin el campo, 0.
   */
  readonly armadura?: number;
  /**
   * Lo que suma un arma a la fuerza de quien la lleva para el daño de su golpe
   * (25-10-2026: «daño mínimo es fuerza y daño máximo es fuerza × agilidad»,
   * `cifrasDelCuerpo`); sin el campo, nada. Solo las armas y la montura
   * (`camposDelHueco`). El peso no se compara con la de un arma: con la fuerza del
   * cuerpo. **En una montura es otra cosa** (26-10-2026): lo que carga encima del
   * jinete y lo que pone en la carga con lanza; no se suma a ningún daño.
   */
  readonly fuerza?: number;
  /**
   * La agilidad de una montura, de 2 a 7, como la de un cuerpo (26-10-2026): de ella,
   * tras el peso, salen sus casillas (`cifrasDelCuerpo`, `marchaDe`). Solo en el
   * hueco `montura`, y en él siempre. Lo leen solo `equipo/vestir.ts`,
   * `equipo/dicho.ts` y este módulo (lo vigila `invariantes.test.ts`).
   */
  readonly agilidad?: number;
  /**
   * Lo que pesa (25-10-2026: «todo tiene un peso»): la suma de lo puesto que pase
   * de la fuerza del cuerpo resta agilidad (`restaDelPeso`, `unidad/cuerpo.ts`).
   * Toda pieza lo dice, ≥ 0. Ninguna pieza resta movimiento: lo hace el peso.
   */
  readonly peso: number;
  /**
   * `2` si es un arma a dos manos, que no admite escudo ni segunda arma
   * (`manosBlocker`, la única lectura). Solo en el hueco `arma`; sin el campo, una mano.
   */
  readonly manos?: 1 | 2;
  /**
   * Si es una lanza (25-10-2026, «la lanza de carga fuera, será una lanza y una
   * regla especial de la lanza cuando se carga montado»): un arma de cuerpo a cuerpo
   * más, y con una montura de guerra puesta su carga va con la fuerza de la montura
   * más la de la lanza (`GolpeConArma.carga`, 26-10-2026). Solo en el hueco `arma`;
   * sin el campo, no lo es. Lo
   * leen solo `equipo/manos.ts` y este módulo (lo vigila `invariantes.test.ts`).
   */
  readonly lanza?: true;
  /**
   * Si es una montura de guerra (26-10-2026): se monta en batalla, carga el peso y
   * da las casillas; sin el campo, de silla, que solo sirve en el mapa. Solo en el
   * hueco `montura`. Lo leen solo `equipo/manos.ts`, este módulo y `unidad/cuerpo.ts` (lo
   * vigila `invariantes.test.ts`).
   */
  readonly guerra?: true;
  /**
   * Qué tira una pieza de `distancia` (02-11-2026, «armas de fuego y granadas», sin
   * azar): `fuego`, un arma de fuego (el disparo diferido de siempre, con su
   * `recarga` y su propia `agilidad`, y la armadura no lo para); `granada`, se lanza
   * por encima a una casilla y explota al empezar su siguiente turno (con sus
   * `cargas`). Sin el campo, arco o ballesta. Solo en `distancia`. Lo leen solo
   * `equipo/vestir.ts`, este módulo y `battle/armas.ts` (lo vigila `invariantes.test.ts`).
   */
  readonly tiro?: TipoDeTiro;
  /**
   * Los turnos que pasa un arma de fuego sin poder apuntar tras disparar, contando
   * aquel en que sale el disparo (decisión del usuario: con 1, dispara un turno sí y
   * otro no), de 1 a `RECARGA_MAXIMA`. Solo y siempre con `tiro: 'fuego'`.
   */
  readonly recarga?: number;
  /**
   * Las granadas que lleva a cada batalla, de 1 a `CARGAS_MAXIMAS`: lanzar gasta
   * una, y con 0 no se lanza. Fuera de batalla no se gastan ni se compran. Solo y
   * siempre con `tiro: 'granada'`.
   */
  readonly cargas?: number;
  /**
   * Su nivel en cada tipo del anillo de la rueda del golpe, de 0 a 6 (18-10-2026:
   * «una maza es mejor en ataque fuerte y peor en rápido»; los niveles, absolutos,
   * en la vuelta 2). Lo lleva **toda** pieza de un hueco que golpea en ella
   * (`camposDelHueco(h).conRueda`: `arma` y `lanza`), y ninguna otra. Lo lleva al
   * golpe `conEquipo` (`GolpeConArma.rueda`).
   */
  readonly rueda?: NivelesDeLaRueda;
  /** Lo que cuesta en la armería, en oro: el precio de una pieza es solo en oro. */
  readonly precio: number;
}

/**
 * Lo que una pieza con base suma encima de la suya (18-10-2026: «una espada de
 * herrería debería poder ser una espada normal con extras»): sus cifras, el daño
 * por componentes, la rueda por tipo y el precio en oro. **Enteros con signo**:
 * manda la regla de la pieza resuelta (`problemasDePieza`, un solo juez), así que
 * una «oxidada» puede restar y cambiar de base es reversible. Sin un campo, 0.
 */
export interface ExtrasDePieza {
  readonly ataque?: number;
  readonly fuerza?: number;
  readonly agilidad?: number;
  readonly defensa?: number;
  readonly armadura?: number;
  readonly peso?: number;
  /** Niveles de la rueda con signo, por tipo del anillo: el final, el de la base más este. */
  readonly rueda?: ExtrasDeLaRueda;
  readonly oro?: number;
}

/**
 * Cómo es cada extra (`ExtrasDePieza`), en el orden en que se escriben: un número
 * o uno por tipo del anillo (la rueda, en niveles).
 * **La tabla de los extras, una vez**: de ella salen sus campos
 * (`CAMPOS_DE_EXTRAS`), su forma (`problemasDePiezaConBase`), cómo se escriben
 * (`piezaConBaseCanonica`) y la suma de una base y su inversa (`sumarExtras`).
 */
const FORMA_DE_LOS_EXTRAS = {
  ataque: 'numero',
  fuerza: 'numero',
  agilidad: 'numero',
  defensa: 'numero',
  armadura: 'numero',
  peso: 'numero',
  rueda: 'porTipo',
  oro: 'numero',
} as const satisfies Readonly<Record<keyof ExtrasDePieza, 'numero' | 'porTipo'>>;

type CampoDeExtra = keyof typeof FORMA_DE_LOS_EXTRAS;

/** Los extras que son un número (`FORMA_DE_LOS_EXTRAS`). */
type ExtraNumerico = {
  [K in CampoDeExtra]: (typeof FORMA_DE_LOS_EXTRAS)[K] extends 'numero' ? K : never;
}[CampoDeExtra];

const EXTRAS = Object.keys(FORMA_DE_LOS_EXTRAS) as readonly CampoDeExtra[];

const EXTRAS_NUMERICOS = EXTRAS.filter(
  (c): c is ExtraNumerico => FORMA_DE_LOS_EXTRAS[c] === 'numero',
);

/** Unos extras con todo escrito (lo que no suma, 0): la forma en que se suman. */
export type ExtrasEnteros = { readonly [K in CampoDeExtra]-?: NonNullable<ExtrasDePieza[K]> };

/**
 * Una pieza escrita **sobre otra** (`base`, el id de otra pieza): su nombre, de
 * dónde se consigue (suyo: la Espada se vende y la Espada de herrería cae como
 * botín) y lo que suma encima (`extras`). El hueco y las manos son los de su
 * base, que no se repiten: si cambia la base, cambia ella (el vínculo es vivo). La
 * suma la hace solo `resolverBases`.
 */
export interface PiezaConBase {
  readonly id: string;
  readonly nombre: string;
  readonly base: string;
  readonly seConsigue: readonly DondeSeConsigue[];
  readonly extras: ExtrasDePieza;
}

/**
 * Una pieza como se ESCRIBE (el fichero, el enlace, la batalla): con
 * sus cifras enteras o sobre otra. Una `PiezaConBase` no encaja en `Pieza` (le
 * faltan el hueco y las cifras), así que nadie la lee como si estuviera resuelta.
 */
export type PiezaEscrita = Pieza | PiezaConBase;

/** Si `p` está escrita sobre otra. */
export function esPiezaConBase(p: PiezaEscrita): p is PiezaConBase {
  return 'base' in p;
}

/**
 * Los campos de una pieza, en el orden en que se escriben: lo demás se rechaza
 * diciéndolo (`problemasDePieza`). Con la lista en la regla de una pieza, un campo
 * ajeno en `data/equipo.json` —un `disparos` de antes de quitar la munición, un
 * `danyo` mal escrito— tumba la carga nombrando el fichero; antes el juego lo
 * ignoraba callando y la arena lanzaba después sin decir de dónde venía (H2 de QA,
 * 14-10-2026).
 */
export const CAMPOS_DE_PIEZA: readonly string[] = [
  'id',
  'nombre',
  'hueco',
  'seConsigue',
  'ataque',
  'fuerza',
  'agilidad',
  'defensa',
  'armadura',
  'peso',
  'manos',
  'lanza',
  'guerra',
  'tiro',
  'recarga',
  'cargas',
  'rueda',
  'precio',
];

/** Los campos de una pieza con base (`PiezaConBase`). */
export const CAMPOS_DE_PIEZA_CON_BASE: readonly string[] = [
  'id',
  'nombre',
  'base',
  'seConsigue',
  'extras',
];

/** Los campos de los extras de una pieza con base (`FORMA_DE_LOS_EXTRAS`). */
export const CAMPOS_DE_EXTRAS: readonly string[] = EXTRAS;

/** Cómo se nombra una pieza en un motivo: por su id si lo trae, si no `otro`. */
function quienEsLaPieza(p: Record<string, unknown>, otro: string): string {
  return typeof p.id === 'string' && p.id !== '' ? `"${p.id}"` : otro;
}

/**
 * Lo más que da de armadura una pieza (A4 de QA de #262: sin tope,
 * `1e3` entraba como 1000 y la pelea se agotaba en la ronda 100). **Inventado**:
 * la coraza (`barda`), la que más, da 7 (22 hasta la escala baja del 26-10-2026); 99
 * deja probar de sobra sin que nada sea inmune.
 * Lo juzga la regla de una pieza (`problemasDePieza`).
 */
export const ARMADURA_MAXIMA_DE_PIEZA = 99;

/** Cómo se dice una cifra en un motivo: «daño», «defensa». */
function cifraDicha(c: CifraDePieza): string {
  return NOMBRE_DE_CIFRA[c].toLowerCase();
}

/**
 * Si un valor ya leído suma algo: un número distinto de 0, o una lista o un
 * objeto con alguno (el daño, la rueda). Lo que no se ha escrito no suma.
 */
function sumaAlgo(v: unknown): boolean {
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.some(sumaAlgo);
  return typeof v === 'object' && v !== null && Object.values(v).some(sumaAlgo);
}

/**
 * Si la pieza golpea en la rueda del golpe: la de un hueco que golpea en ella
 * (`camposDelHueco(h).conRueda`: `arma` y `lanza`). Esas, y solo esas, dicen su
 * rueda (`Pieza.rueda`). **La regla, en un sitio**: la lee la de una pieza
 * (`problemasDePieza`).
 */
export function golpeaEnLaRueda(p: { readonly hueco?: unknown }): boolean {
  return typeof p.hueco === 'string' && esHuecoDePieza(p.hueco) && camposDelHueco(p.hueco).conRueda;
}

/**
 * Lo que no vale de `seConsigue`: una lista de sitios de `DONDE_SE_CONSIGUE`, sin
 * repetir, que se escribe siempre (`[]` si de ningún sitio).
 */
function problemasDeDondeSeConsigue(v: unknown, q: string): string[] {
  if (!Array.isArray(v)) {
    return [
      `${q}: seConsigue es una lista de dónde se consigue (${DONDE_SE_CONSIGUE.join(', ')}), [] si solo la llevan las unidades que nacen con ella`,
    ];
  }
  const problemas = v
    .filter((x) => !(DONDE_SE_CONSIGUE as readonly unknown[]).includes(x))
    .map(
      (x) =>
        `${q} se consigue en "${String(x)}", que no es ningún sitio; valen ${DONDE_SE_CONSIGUE.join(', ')}`,
    );
  if (new Set(v).size !== v.length) problemas.push(`${q}: seConsigue repite un sitio`);
  return problemas;
}

/**
 * Lo que no vale de UNA pieza, cada cosa con su frase, o vacío si vale: los
 * campos que existen (`CAMPOS_DE_PIEZA`: un `pv` no es uno, ninguna pieza da PV),
 * el id (`esIdDePieza`), el nombre, el hueco que existe, de dónde se consigue, las
 * cifras enteras ≥ 0 y solo las de su hueco (`camposDelHueco`), la armadura con
 * tope (`ARMADURA_MAXIMA_DE_PIEZA`), la fuerza que suma un arma, el peso que
 * lleva toda pieza, las manos solo en un arma, una rueda con sus seis niveles en
 * cada arma que golpea en ella (`problemasDeNiveles`) y el precio, solo en oro.
 * **La regla de una pieza, en un sitio**: la leen el cargador del catálogo
 * (`leerPiezas`, que añade las reglas de conjunto), la arena, que edita piezas una
 * a una (`validarPieza`, `piezaBlocker`), y la suma de una base
 * (`resolverBases`), que la juzga resuelta.
 */
export function problemasDePieza(bruta: unknown, quien?: string): string[] {
  const problemas: string[] = [];
  if (!esObjeto(bruta)) {
    return [`${quien ?? 'la pieza'} no es un objeto`];
  }
  const p = bruta as Record<string, unknown>;
  const q = quien ?? quienEsLaPieza(p, 'la pieza');
  for (const ajeno of Object.keys(p).filter((k) => !CAMPOS_DE_PIEZA.includes(k))) {
    problemas.push(
      ajeno === 'pv'
        ? `${q} suma PV: ninguna pieza da PV, se protege con armadura, que se resta de cada golpe`
        : ajeno === 'velocidad'
          ? `${q} dice velocidad: ninguna pieza resta movimiento, lo hace su peso («peso»)`
          : ajeno === 'danio'
            ? `${q} dice daño: un arma suma fuerza («fuerza») y el daño sale de la fuerza y la agilidad`
            : `${q}: «${ajeno}» no es un campo de una pieza; valen ${CAMPOS_DE_PIEZA.join(', ')}`,
    );
  }
  problemas.push(...problemasDeIdYNombre(p, q));
  const campos =
    typeof p.hueco === 'string' && esHuecoDePieza(p.hueco) ? camposDelHueco(p.hueco) : null;
  if (campos === null) {
    problemas.push(
      p.hueco === 'segunda'
        ? `${q} dice el hueco «segunda»: una segunda arma es una de «arma», que va en los dos`
        : `${q} va en el hueco "${p.hueco}", que no existe; valen ${HUECOS_DE_PIEZA.join(', ')}`,
    );
  }
  problemas.push(...problemasDeDondeSeConsigue(p.seConsigue, q));
  for (const campo of ['ataque', 'defensa'] as const) {
    if (!enteroDesde(p[campo], 0)) {
      problemas.push(`${q}: ${campo} tiene que ser un entero ≥ 0 y ${comoSeLee(p[campo])}`);
    }
  }
  if (p.armadura !== undefined && !enteroDesde(p.armadura, 0)) {
    problemas.push(`${q}: armadura tiene que ser un entero ≥ 0 y ${comoSeLee(p.armadura)}`);
  } else if (typeof p.armadura === 'number' && p.armadura > ARMADURA_MAXIMA_DE_PIEZA) {
    problemas.push(`${q}: la armadura va de 0 a ${ARMADURA_MAXIMA_DE_PIEZA} y es ${p.armadura}`);
  }
  for (const campo of ['fuerza', 'agilidad'] as const) {
    if (p[campo] !== undefined && !enteroDesde(p[campo], 0)) {
      problemas.push(`${q}: ${campo} tiene que ser un entero ≥ 0 y ${comoSeLee(p[campo])}`);
    }
  }
  // Los topes de la agilidad, cada uno en su sitio: la de una montura y la de un arma
  // de fuego (hallazgo S11 de /simplify, 02-11-2026: se citaban entre ellas).
  problemas.push(...problemasDeMontura(p, q), ...problemasDelTiro(p, q));
  // Todo pesa (25-10-2026): el peso se escribe siempre, y nada resta movimiento.
  if (!enteroDesde(p.peso, 0)) {
    problemas.push(
      p.peso === undefined
        ? `${q} no dice su peso: toda pieza pesa, un entero ≥ 0`
        : `${q}: peso tiene que ser un entero ≥ 0 y ${comoSeLee(p.peso)}`,
    );
  }
  // Cada tipo, solo sus cifras (decisión del usuario, 18-10-2026: «diferencia por
  // tipo»).
  if (campos !== null) {
    for (const cifra of CIFRAS_DE_PIEZA) {
      if (campos.cifras.includes(cifra) || !sumaAlgo(p[cifra])) continue;
      problemas.push(
        `${q} va en el hueco ${String(p.hueco)}, que no suma ${cifraDicha(cifra)}: en él una pieza suma ${campos.cifras.map(cifraDicha).join(', ')}`,
      );
    }
  }
  if (p.manos !== undefined) {
    if (p.manos !== 1 && p.manos !== 2) {
      problemas.push(`${q}: manos es 1 o 2, y es ${p.manos}`);
    } else if (campos?.conManos !== true) {
      problemas.push(
        `${q} va en el hueco ${p.hueco} y dice manos: solo un arma se lleva a dos manos`,
      );
    }
  }
  if (p.guerra !== undefined) {
    if (p.guerra !== true) {
      problemas.push(`${q}: guerra es true o no se escribe, y es ${String(p.guerra)}`);
    } else if (p.hueco !== 'montura') {
      problemas.push(
        `${q} va en el hueco ${p.hueco} y dice que es de guerra: solo una montura lo es`,
      );
    }
  }
  if (p.lanza !== undefined) {
    if (p.lanza !== true) {
      problemas.push(`${q}: lanza es true o no se escribe, y es ${String(p.lanza)}`);
    } else if (p.hueco !== 'arma') {
      problemas.push(
        `${q} va en el hueco ${p.hueco} y dice que es una lanza: solo un arma de cuerpo a cuerpo lo es`,
      );
    }
  }
  // La rueda (vuelta 2, 18-10-2026): toda arma de cuerpo a cuerpo dice su nivel en
  // los seis tipos del anillo («sin arma no se combate»), y ninguna otra pieza
  // lleva rueda.
  if (p.rueda === undefined) {
    if (golpeaEnLaRueda(p)) {
      problemas.push(
        `${q} es un arma de cuerpo a cuerpo y no dice su rueda: un nivel de 0 a ${NIVEL_MAXIMO} en ${TIPOS_DEL_ANILLO.map((t) => NOMBRE_DE_GOLPE[t]).join(', ')}`,
      );
    }
  } else if (campos !== null && !campos.conRueda) {
    problemas.push(
      `${q} va en el hueco ${String(p.hueco)} y lleva rueda del golpe: solo un arma de cuerpo a cuerpo o de carga golpea en ella`,
    );
  } else {
    problemas.push(...problemasDeNiveles(p.rueda, q));
  }
  // El precio es un número, en oro (simplify de F2: ni recursos ni `{ gold }`).
  if (!enteroDesde(p.precio, 0)) {
    problemas.push(
      typeof p.precio === 'number' && Number.isFinite(p.precio)
        ? `${q} cuesta ${p.precio} de oro: tiene que ser un entero ≥ 0`
        : `${q}: el precio es lo que cuesta en oro, un entero ≥ 0, y ${typeof p.precio === 'object' && p.precio !== null ? 'es un objeto: escribe solo el número' : comoSeLee(p.precio)}`,
    );
  }
  return problemas;
}

/**
 * Lo que no vale de la fuerza y la agilidad de una montura (26-10-2026): dice su
 * agilidad, de 2 a 7 como la de un cuerpo, y una fuerza de 1 o más (lo que carga:
 * `restaDelPeso` no sabe de fuerza 0). Que las dos sean enteros ≥ 0 lo dice
 * `problemasDePieza`, para toda pieza; que otra pieza no lleve agilidad, la regla de
 * las cifras del hueco y, a distancia, `problemasDelTiro`.
 */
function problemasDeMontura(p: Record<string, unknown>, q: string): string[] {
  if (p.hueco !== 'montura') return [];
  const problemas: string[] = [];
  const { agilidad, fuerza } = p;
  if (agilidad === undefined) {
    problemas.push(
      `${q} es una montura y no dice su agilidad: un entero de ${AGILIDAD_DEL_CUERPO_MIN} a ${AGILIDAD_DEL_CUERPO_MAX}, de la que salen sus casillas`,
    );
  } else if (
    enteroDesde(agilidad, 0) &&
    enteroBlocker(agilidad, AGILIDAD_DEL_CUERPO_MIN, AGILIDAD_DEL_CUERPO_MAX) !== null
  ) {
    problemas.push(
      `${q}: la agilidad de una montura va de ${AGILIDAD_DEL_CUERPO_MIN} a ${AGILIDAD_DEL_CUERPO_MAX} y ${comoSeLee(agilidad)}`,
    );
  }
  if (fuerza === undefined) {
    problemas.push(
      `${q} es una montura y no dice su fuerza: un entero de 1 o más, lo que carga encima del jinete`,
    );
  } else if (fuerza === 0) {
    problemas.push(`${q} es una montura de fuerza 0: tiene que cargar algo, un entero de 1 o más`);
  }
  return problemas;
}

/**
 * Lo que no vale de lo que tira una pieza (02-11-2026, armas de fuego y granadas):
 * `tiro` solo en `distancia`, y es `fuego` o `granada`; un arma de fuego dice su
 * `recarga` (1 a `RECARGA_MAXIMA`) y su `agilidad` (de 1 a la de un cuerpo: de ella
 * sale lo estrecho de su horquilla, `cifrasDelCuerpo`), y nada más la lleva en
 * `distancia`; una granada dice sus `cargas` (1 a `CARGAS_MAXIMAS`), y nada más las
 * lleva.
 */
function problemasDelTiro(p: Record<string, unknown>, q: string): string[] {
  const problemas: string[] = [];
  const { tiro, recarga, cargas, agilidad } = p;
  if (tiro !== undefined) {
    if (!(TIPOS_DE_TIRO as readonly unknown[]).includes(tiro)) {
      problemas.push(
        `${q}: tiro es ${TIPOS_DE_TIRO.join(' o ')}, o no se escribe (un arco o una ballesta), y es ${String(tiro)}`,
      );
    } else if (p.hueco !== 'distancia') {
      problemas.push(
        `${q} va en el hueco ${String(p.hueco)} y dice tiro: solo una pieza a distancia tira`,
      );
    }
  }
  const fuego = tiro === 'fuego' && p.hueco === 'distancia';
  const granada = tiro === 'granada' && p.hueco === 'distancia';
  if (recarga === undefined) {
    if (fuego) {
      problemas.push(
        `${q} es un arma de fuego y no dice su recarga: los turnos de 1 a ${RECARGA_MAXIMA} que pasa sin apuntar tras disparar`,
      );
    }
  } else if (!fuego) {
    problemas.push(`${q} dice recarga: solo un arma de fuego recarga`);
  } else if (enteroBlocker(recarga, 1, RECARGA_MAXIMA) !== null) {
    problemas.push(`${q}: la recarga va de 1 a ${RECARGA_MAXIMA} turnos y ${comoSeLee(recarga)}`);
  }
  if (cargas === undefined) {
    if (granada) {
      problemas.push(
        `${q} es una granada y no dice sus cargas: las que lleva a cada batalla, de 1 a ${CARGAS_MAXIMAS}`,
      );
    }
  } else if (!granada) {
    problemas.push(`${q} dice cargas: solo una granada se gasta`);
  } else if (enteroBlocker(cargas, 1, CARGAS_MAXIMAS) !== null) {
    problemas.push(`${q}: las cargas van de 1 a ${CARGAS_MAXIMAS} y ${comoSeLee(cargas)}`);
  }
  if (fuego) {
    if (agilidad === undefined) {
      problemas.push(
        `${q} es un arma de fuego y no dice su agilidad: un entero de 1 a ${AGILIDAD_DEL_CUERPO_MAX}, el de su horquilla [F, F × agilidad]`,
      );
    } else if (
      enteroDesde(agilidad, 0) &&
      enteroBlocker(agilidad, 1, AGILIDAD_DEL_CUERPO_MAX) !== null
    ) {
      // Que no sea un entero ≥ 0 ya lo dice `problemasDePieza`.
      problemas.push(
        `${q}: la agilidad de un arma de fuego va de 1 a ${AGILIDAD_DEL_CUERPO_MAX} y ${comoSeLee(agilidad)}`,
      );
    }
  } else if (p.hueco === 'distancia' && sumaAlgo(agilidad)) {
    problemas.push(`${q} dice agilidad: a distancia solo la lleva un arma de fuego (tiro: fuego)`);
  }
  return problemas;
}

/**
 * Lo que no vale del id y el nombre de una pieza, entera o con base: un id como
 * texto en minúsculas, cifras, `-` y `_` (`esIdDePieza`), y un nombre escrito.
 */
function problemasDeIdYNombre(p: Record<string, unknown>, q: string): string[] {
  const problemas: string[] = [];
  if (typeof p.id !== 'string' || p.id === '') problemas.push(`${q} no trae id como texto`);
  else if (!esIdDePieza(p.id)) {
    problemas.push(`${q}: el id «${p.id}» va en minúsculas, con cifras, guiones y _`);
  }
  if (typeof p.nombre !== 'string' || p.nombre.trim() === '') {
    problemas.push(`${q} no tiene nombre: escribe uno`);
  }
  return problemas;
}

/**
 * Lo que no vale de los extras de la rueda de una pieza con base
 * (`ExtrasDePieza.rueda`): un objeto con tipos del anillo (`TIPOS_DEL_ANILLO`) y
 * niveles con signo. Si el nivel final queda de 0 a 6 no se mira aquí: lo dice la
 * pieza resuelta (`problemasDeNiveles`, desde `problemasDePieza`).
 */
function problemasDeRueda(rueda: unknown, q: string): string[] {
  if (!esObjeto(rueda)) {
    return [`${q}: la rueda tiene que ser un objeto con un número por tipo de golpe`];
  }
  const problemas: string[] = [];
  for (const [tipo, cifra] of Object.entries(rueda)) {
    if (!esTipoDelAnillo(tipo)) {
      problemas.push(fueraDelAnillo(tipo, q));
    } else if (!enteroDesde(cifra, Number.MIN_SAFE_INTEGER)) {
      problemas.push(
        `${q}: lo que sube el nivel de ${tipo} tiene que ser un entero y ${comoSeLee(cifra)}`,
      );
    }
  }
  return problemas;
}

/**
 * Lo que no vale de UNA pieza con base (`PiezaConBase`), cada cosa con su frase:
 * sus campos, el id, el nombre, la base (otra pieza, no ella misma), de dónde se
 * consigue y la forma de los extras (`FORMA_DE_LOS_EXTRAS`), enteros con signo.
 * Que la base exista y no dé la vuelta lo dice `baseBlocker`, y que la pieza
 * resuelta valga, `resolverBases`.
 */
export function problemasDePiezaConBase(bruta: unknown, quien?: string): string[] {
  if (!esObjeto(bruta)) {
    return [`${quien ?? 'la pieza'} no es un objeto`];
  }
  const p = bruta as Record<string, unknown>;
  const q = quien ?? quienEsLaPieza(p, 'la pieza');
  const problemas: string[] = [];
  for (const ajeno of Object.keys(p).filter((k) => !CAMPOS_DE_PIEZA_CON_BASE.includes(k))) {
    problemas.push(
      CAMPOS_DE_PIEZA.includes(ajeno)
        ? `${q} tiene base y escribe «${ajeno}»: con base se escriben solo sus extras; el hueco y las manos son los de la base`
        : `${q}: «${ajeno}» no es un campo de una pieza con base; valen ${CAMPOS_DE_PIEZA_CON_BASE.join(', ')}`,
    );
  }
  problemas.push(...problemasDeIdYNombre(p, q), ...problemasDeDondeSeConsigue(p.seConsigue, q));
  if (typeof p.base !== 'string' || p.base === '') {
    problemas.push(`${q}: la base es el id de otra pieza, como texto`);
  } else if (p.base === p.id) {
    problemas.push(suPropiaBase(q));
  }
  const x = p.extras;
  if (!esObjeto(x)) {
    problemas.push(`${q}: los extras tienen que ser un objeto (vacío si no suma nada)`);
    return problemas;
  }
  const e = x as Record<string, unknown>;
  for (const ajeno of Object.keys(e).filter((k) => !CAMPOS_DE_EXTRAS.includes(k))) {
    problemas.push(
      `${q}: «${ajeno}» no es un extra de una pieza; valen ${CAMPOS_DE_EXTRAS.join(', ')}`,
    );
  }
  const conSigno = (n: unknown): boolean => enteroDesde(n, Number.MIN_SAFE_INTEGER);
  for (const campo of EXTRAS) {
    const v = e[campo];
    if (v === undefined) continue;
    switch (FORMA_DE_LOS_EXTRAS[campo]) {
      case 'numero':
        if (!conSigno(v)) {
          problemas.push(`${q}: el extra de ${campo} tiene que ser un entero y ${comoSeLee(v)}`);
        }
        break;
      case 'porTipo':
        problemas.push(...problemasDeRueda(v, q));
        break;
    }
  }
  return problemas;
}

/**
 * Cómo se dice lo que trae un campo que tenía que ser un número: «es 1.5», o que
 * no es un número (un campo vacío llegaba como `NaN` y se leía «y es NaN»).
 */
function comoSeLee(x: unknown): string {
  return typeof x === 'number' && Number.isFinite(x) ? `es ${x}` : 'no es un número';
}

/** Por qué una pieza no vale, la primera cosa (`problemasDePieza`), o `null` si vale. */
export function piezaBlocker(bruta: unknown): string | null {
  return problemasDePieza(bruta)[0] ?? null;
}

/** Los extras de una rueda sin los tipos que no cambian, o `undefined` si no cambia ninguno. */
function ruedaSinCeros(r: ExtrasDeLaRueda | undefined): ExtrasDeLaRueda | undefined {
  if (r === undefined) return undefined;
  const suma = TIPOS_DEL_ANILLO.filter((t) => (r[t] ?? 0) !== 0).map((t) => [t, r[t]] as const);
  return suma.length === 0 ? undefined : Object.fromEntries(suma);
}

/**
 * Los niveles de una rueda en el orden del anillo, **los seis**: un 0 es un nivel,
 * no un «nada» (quitarlo dejaría el arma sin decir su rueda). Lo que falte, a 0;
 * lo juzga la regla de una pieza.
 */
function nivelesEnOrden(r: ExtrasDeLaRueda): NivelesDeLaRueda {
  return Object.fromEntries(TIPOS_DEL_ANILLO.map((t) => [t, r[t] ?? 0])) as NivelesDeLaRueda;
}

/** De dónde se consigue, escrito siempre igual: en el orden de `DONDE_SE_CONSIGUE`. */
function enSuOrden(v: readonly DondeSeConsigue[]): readonly DondeSeConsigue[] {
  return DONDE_SE_CONSIGUE.filter((d) => v.includes(d));
}

/**
 * Una pieza ya válida escrita siempre igual: los campos en su orden, sin lo que no
 * suma nada (`armadura` y `fuerza` 0, una mano), de dónde se consigue en
 * su orden y la rueda entera en el orden del anillo (`nivelesEnOrden`: un nivel 0
 * se escribe). Es la forma que compara `mismaPieza`: el catálogo
 * (`leerPiezas`), la arena (`validarPieza`) y la suma de una base
 * (`resolverBases`) escriben así.
 */
export function piezaCanonica(p: Pieza): Pieza {
  const rueda = p.rueda === undefined ? undefined : nivelesEnOrden(p.rueda);
  return {
    id: p.id,
    nombre: p.nombre,
    hueco: p.hueco,
    seConsigue: enSuOrden(p.seConsigue),
    ataque: p.ataque,
    ...((p.fuerza ?? 0) > 0 ? { fuerza: p.fuerza } : {}),
    ...((p.agilidad ?? 0) > 0 ? { agilidad: p.agilidad } : {}),
    defensa: p.defensa,
    ...((p.armadura ?? 0) > 0 ? { armadura: p.armadura } : {}),
    peso: p.peso,
    ...(p.manos === 2 ? { manos: 2 as const } : {}),
    ...(p.lanza === true ? { lanza: true as const } : {}),
    ...(p.guerra === true ? { guerra: true as const } : {}),
    ...(p.tiro === undefined ? {} : { tiro: p.tiro }),
    ...(p.recarga === undefined ? {} : { recarga: p.recarga }),
    ...(p.cargas === undefined ? {} : { cargas: p.cargas }),
    ...(rueda === undefined ? {} : { rueda }),
    precio: p.precio,
  };
}

/** Una pieza con base ya válida escrita siempre igual: los extras en su orden y sin ceros. */
export function piezaConBaseCanonica(p: PiezaConBase): PiezaConBase {
  const x = p.extras;
  const extras: Record<string, unknown> = {};
  for (const campo of EXTRAS) {
    if (!sumaAlgo(x[campo])) continue;
    if (campo === 'rueda') extras.rueda = ruedaSinCeros(x.rueda);
    else extras[campo] = x[campo];
  }
  return {
    id: p.id,
    nombre: p.nombre,
    base: p.base,
    seConsigue: enSuOrden(p.seConsigue),
    extras: extras as ExtrasDePieza,
  };
}

/**
 * Lo que suma la pieza `p`, como extras sobre nada (`ExtrasEnteros`): sus cifras,
 * su daño, su rueda y su precio en oro. Con `conLosExtras`, la ficha edita una
 * pieza entera como edita los extras de una con base.
 */
export function extrasDe(p: Pieza): ExtrasEnteros {
  return {
    ataque: p.ataque,
    fuerza: p.fuerza ?? 0,
    agilidad: p.agilidad ?? 0,
    defensa: p.defensa,
    armadura: p.armadura ?? 0,
    peso: p.peso,
    rueda: p.rueda ?? {},
    oro: p.precio,
  };
}

/**
 * La pieza `p` sumando `x` (lo que no trae, 0) en lugar de lo suyo, **sin
 * juzgar**: su id, su nombre, su hueco, de dónde se consigue, sus manos y sus
 * marcas (lanza, de guerra) se quedan.
 * La inversa de `extrasDe`. La rueda, los seis niveles si `p` la lleva o `x` sube
 * alguno: así un extra de rueda sobre un arco llega a la pieza resuelta y lo
 * rechaza su regla, en lugar de perderse.
 */
export function conLosExtras(p: Pieza, x: ExtrasDePieza): Pieza {
  const conRueda = p.rueda !== undefined || sumaAlgo(x.rueda);
  return {
    id: p.id,
    nombre: p.nombre,
    hueco: p.hueco,
    seConsigue: p.seConsigue,
    ataque: x.ataque ?? 0,
    fuerza: x.fuerza ?? 0,
    // La agilidad, solo si suma algo: un arma con `agilidad: 0` no la lleva.
    ...((x.agilidad ?? 0) === 0 ? {} : { agilidad: x.agilidad }),
    defensa: x.defensa ?? 0,
    armadura: x.armadura ?? 0,
    peso: x.peso ?? 0,
    ...(p.manos === undefined ? {} : { manos: p.manos }),
    ...(p.lanza === undefined ? {} : { lanza: p.lanza }),
    ...(p.guerra === undefined ? {} : { guerra: p.guerra }),
    // Lo que tira, su recarga y sus cargas son de la pieza, como las manos: no son extras.
    ...(p.tiro === undefined ? {} : { tiro: p.tiro }),
    ...(p.recarga === undefined ? {} : { recarga: p.recarga }),
    ...(p.cargas === undefined ? {} : { cargas: p.cargas }),
    ...(conRueda ? { rueda: nivelesEnOrden(x.rueda ?? {}) } : {}),
    precio: x.oro ?? 0,
  };
}

/**
 * `a` más `b` por `signo`, extra a extra (`FORMA_DE_LOS_EXTRAS`): los números y
 * la rueda por tipo. Con `+1` es la suma de una base
 * (`sumarBase`); con `−1`, su inversa (`diferenciaDe`). Los ceros se quedan: los
 * quita la forma canónica.
 */
function sumarExtras(a: ExtrasDePieza, b: ExtrasDePieza, signo: 1 | -1): ExtrasEnteros {
  const mas = (x: number | undefined, y: number | undefined): number => (x ?? 0) + signo * (y ?? 0);
  const numeros = Object.fromEntries(EXTRAS_NUMERICOS.map((c) => [c, mas(a[c], b[c])])) as Record<
    ExtraNumerico,
    number
  >;
  return {
    ...numeros,
    rueda: Object.fromEntries(TIPOS_DEL_ANILLO.map((t) => [t, mas(a.rueda?.[t], b.rueda?.[t])])),
  };
}

/**
 * La pieza `e` sobre su base `base`, sumada y **sin juzgar** (`sumarExtras`): lo de
 * la base más los extras; el hueco y las manos, de la base; de dónde se consigue,
 * el suyo. La juzga `resolverBases` antes de escribirla canónica: un daño que
 * se queda en negativo tiene que poder verse.
 */
function sumarBase(base: Pieza, e: PiezaConBase): Pieza {
  return {
    ...conLosExtras(base, sumarExtras(extrasDe(base), e.extras, 1)),
    id: e.id,
    nombre: e.nombre,
    seConsigue: e.seConsigue,
  };
}

/**
 * Los extras que llevan de `base` a lo que suma `final`: la inversa de la suma de
 * una base. Con ellos, cambiar de base conserva lo que suma una pieza (`conBase`).
 */
export function diferenciaDe(final: Pieza, base: Pieza): ExtrasEnteros {
  return sumarExtras(extrasDe(final), extrasDe(base), -1);
}

/** «X no puede ser su propia base»: la forma de una pieza y la regla de una base lo dicen igual. */
function suPropiaBase(q: string): string {
  return `${q} no puede ser su propia base`;
}

/**
 * Por qué la pieza `quien` no puede ir sobre la de id `base`, o `null`. **La regla
 * de una base, en un sitio**: la base existe, no es ella misma, no está sobre ella
 * (sus bases darían la vuelta) y, si se dice `hueco`, va en él (cambiar de base no
 * cambia de hueco). `escritas` dice cómo está escrita cada pieza del catálogo. La
 * leen la suma de las bases (`resolverBases`), el cambio de base (`conBase`) y
 * lo que ofrece el desplegable «Base» (`basesPosibles`). Si la base misma está
 * rota, no se mira aquí: lo dice ella.
 */
export function baseBlocker(
  quien: { readonly id: string; readonly nombre: string },
  base: string,
  escritas: ReadonlyMap<string, PiezaEscrita>,
  hueco?: HuecoDePieza,
): string | null {
  const q = `«${quien.nombre}»`;
  if (base === quien.id) return suPropiaBase(q);
  const b = escritas.get(base);
  if (b === undefined) return `${q} toma de base «${base}», que no existe`;
  // De la base a su raíz, la que está entera: si pasa por `quien`, da la vuelta.
  const cadena: PiezaEscrita[] = [b];
  let raiz: PiezaEscrita = b;
  while (esPiezaConBase(raiz)) {
    if (raiz.base === quien.id) {
      const vuelta = [quien, ...cadena, quien].map((x) => `«${x.nombre}»`).join(' → ');
      return `${q}: sus bases dan la vuelta (${vuelta}); una pieza no puede estar sobre sí misma`;
    }
    const siguiente = escritas.get(raiz.base);
    if (siguiente === undefined || cadena.includes(siguiente)) return null;
    cadena.push(siguiente);
    raiz = siguiente;
  }
  if (hueco !== undefined && raiz.hueco !== hueco) {
    return `«${b.nombre}» va en ${NOMBRE_DE_HUECO[raiz.hueco]} y ${q} en ${NOMBRE_DE_HUECO[hueco]}: la base es del mismo hueco`;
  }
  return null;
}

/** Lo que sale de resolver unas piezas escritas: las resueltas, las escritas y lo que no vale, por id. */
export interface ResolucionDePiezas {
  /** Las que valen, resueltas, en el orden de las escritas. */
  readonly piezas: ReadonlyMap<string, Pieza>;
  readonly escritas: ReadonlyMap<string, PiezaEscrita>;
  /** Las que no valen, con su motivo; la que depende de una que no vale tampoco. */
  readonly problemas: ReadonlyMap<string, string>;
}

/**
 * Cada pieza de `escritas` (un catálogo entero, por id) resuelta: la entera, tal
 * cual; la que tiene base, su base resuelta más sus extras (`sumarBase`), en
 * cadena. **La única suma de una base** (lo vigila `test/invariantes.test.ts`): la
 * llama solo el cargador del catálogo (`leerPiezas`), por el que pasan el fichero,
 * el catálogo de la arena y las piezas de una pelea. No vale (con su motivo):
 * la base que no puede ser (`baseBlocker`) y la pieza resuelta que no cumple la
 * regla de una pieza (`problemasDePieza`). La que depende de una que no vale
 * tampoco vale, y lo dice: también si su base ni se leyó (`rotas`, por id, con su
 * nombre y su motivo), que si no diría que «no existe».
 */
function resolverBases(
  escritas: ReadonlyMap<string, PiezaEscrita>,
  rotas: ReadonlyMap<string, { readonly nombre: string; readonly motivo: string }> = new Map(),
): ResolucionDePiezas {
  const hechas = new Map<string, Pieza>();
  const problemas = new Map<string, string>();
  // Sin pila: `baseBlocker` no deja recorrer una base que dé la vuelta.
  const resolver = (id: string): Pieza | null => {
    const ya = hechas.get(id);
    if (ya !== undefined) return ya;
    if (problemas.has(id)) return null;
    const r = resolverUna(escritas.get(id) as PiezaEscrita);
    if (typeof r === 'string') {
      problemas.set(id, r);
      return null;
    }
    hechas.set(id, r);
    return r;
  };
  const resolverUna = (e: PiezaEscrita): Pieza | string => {
    if (!esPiezaConBase(e)) return e;
    const q = `«${e.nombre}»`;
    const rota = escritas.has(e.base) ? undefined : rotas.get(e.base);
    if (rota !== undefined) return `${q}: su base «${rota.nombre}» no vale (${rota.motivo})`;
    const mal = baseBlocker(e, e.base, escritas);
    if (mal !== null) return mal;
    const b = resolver(e.base);
    if (b === null) {
      const nombre = escritas.get(e.base)?.nombre ?? e.base;
      return `${q}: su base «${nombre}» no vale (${problemas.get(e.base) ?? ''})`;
    }
    const suma = sumarBase(b, e);
    const suyos = problemasDePieza(suma, `${q} (sobre «${b.nombre}»)`);
    if (suyos.length > 0) return suyos.join('; ');
    return piezaCanonica(suma);
  };
  for (const id of escritas.keys()) resolver(id);
  const piezas = new Map<string, Pieza>();
  for (const id of escritas.keys()) {
    const p = hechas.get(id);
    if (p !== undefined) piezas.set(id, p);
  }
  return { piezas, escritas, problemas };
}

/**
 * Una pieza comprobada con su regla (`problemasDePieza`, o `problemasDePiezaConBase`
 * si va sobre otra) y escrita siempre igual (`piezaCanonica`,
 * `piezaConBaseCanonica`), o la lista de lo que no vale. Lo que dé resuelta lo
 * juzga el catálogo (`leerPiezas`).
 */
function piezaEscrita(
  valor: unknown,
  quien?: string,
): { readonly pieza: PiezaEscrita } | { readonly problemas: readonly string[] } {
  if (!esObjeto(valor)) {
    return { problemas: [`${quien ?? 'la pieza'} no es un objeto`] };
  }
  const conBase = 'base' in valor;
  const problemas = conBase
    ? problemasDePiezaConBase(valor, quien)
    : problemasDePieza(valor, quien);
  if (problemas.length > 0) return { problemas };
  return {
    pieza: conBase
      ? piezaConBaseCanonica(valor as unknown as PiezaConBase)
      : piezaCanonica(valor as unknown as Pieza),
  };
}

/**
 * Una pieza, comprobada y escrita siempre igual (`piezaEscrita`); lanza diciendo
 * qué no cuadra. Todo lo que entra a la arena pieza a pieza (lo que manda el
 * servidor, el enlace, cada cambio de su editor) pasa por aquí.
 */
export function validarPieza(valor: unknown): PiezaEscrita {
  const nombre = (valor as { nombre?: unknown } | null)?.nombre;
  const quien = typeof nombre === 'string' && nombre !== '' ? `«${nombre}»` : undefined;
  const r = piezaEscrita(valor, quien);
  if ('problemas' in r) throw new Error(r.problemas.join('; '));
  return r.pieza;
}

/**
 * Un catálogo de equipo entero: cada pieza con su regla (`piezaEscrita`), sin ids
 * repetidos (`revisarLista`), resuelta con sus bases (`resolverBases`) y con
 * **alguna que caiga como botín**, que si no el botín no tendría qué dar.
 * Devuelve las escritas y las resueltas, en su orden, o **lanza con todos los
 * problemas a la vez**, escritos para quien edita el JSON (`donde` delante, si se
 * dice). Lo leen el cargador del fichero (`leerEquipo`) y todo catálogo que se
 * hace en memoria (`catalogoDeEquipo`, `equipo/atado.ts`): **una sola validación**
 * del catálogo, la del fichero que lee el juego.
 */
export function leerPiezas(
  lista: readonly unknown[],
  donde?: string,
): { readonly escritas: readonly PiezaEscrita[]; readonly piezas: readonly Pieza[] } {
  // Cómo se nombra la que no trae id: por su sitio en la lista, que `revisarLista`
  // recorre en orden.
  let i = 0;
  const { validas, invalidas } = revisarLista(
    lista,
    (bruta) => {
      const r = piezaEscrita(
        bruta,
        quienEsLaPieza((bruta ?? {}) as Record<string, unknown>, `la pieza ${i++}`),
      );
      if ('problemas' in r) throw new Error(r.problemas.join('; '));
      return r.pieza;
    },
    { campo: 'id', clave: (p) => p.id, quien: (id) => `"${id}"`, donde: 'el catálogo' },
  );
  const escritas = new Map(validas.map((p) => [p.id, p]));
  const rotas = new Map<string, { readonly nombre: string; readonly motivo: string }>();
  for (const { clave, motivo, crudo } of invalidas) {
    if (clave === null) continue;
    const nombre = (crudo as { nombre?: unknown }).nombre;
    rotas.set(clave, { nombre: typeof nombre === 'string' ? nombre : clave, motivo });
  }
  const resueltas = resolverBases(escritas, rotas);
  const problemas = [...invalidas.map((x) => x.motivo), ...resueltas.problemas.values()];
  if (
    problemas.length === 0 &&
    ![...resueltas.piezas.values()].some((p) => p.seConsigue.includes('botin'))
  ) {
    problemas.push(
      'no hay ninguna pieza que caiga como botín (seConsigue: ["botin"]): el botín no tendría qué dar',
    );
  }
  if (problemas.length > 0) {
    throw new Error(`${donde === undefined ? '' : `${donde}: `}${problemas.join('; ')}`);
  }
  return { escritas: validas, piezas: [...resueltas.piezas.values()] };
}

/** Dónde vive el catálogo de equipo, relativo a la raíz del repo: el juego lo carga y la arena lo escribe. */
export const RUTA_DEL_CATALOGO_DE_EQUIPO = 'data/equipo.json';

/**
 * El `_comment` de `data/equipo.json` si el fichero no trae uno: «Guardar» de la
 * arena conserva el que haya en disco, que es el que se edita.
 */
export const COMENTARIO_DEL_CATALOGO_DE_EQUIPO =
  'CATÁLOGO de equipo, una pieza por hueco. TODO INVENTADO y PROVISIONAL (HoMM2 no tiene equipo de tropa). Lo carga src/core/data.ts (leerEquipo) y lo escribe la arena al pulsar «Guardar», con la misma regla.';

/**
 * Lee un catálogo de equipo (`{ piezas: [...] }`) con la regla del catálogo
 * (`leerPiezas`), nombrando `fichero`. Lanza con todos los problemas a la vez. Lo
 * usan la carga del juego y «Guardar» de la arena (`tools/arena/borrador.ts`): la
 * misma regla en los dos lados. Exportada con el JSON de argumento por lo mismo
 * que `validarExperiencia`: un guardia que solo se prueba con el fichero bueno no
 * se ha visto morder.
 */
export function leerEquipo(
  json: unknown,
  fichero = RUTA_DEL_CATALOGO_DE_EQUIPO,
): { readonly escritas: readonly PiezaEscrita[]; readonly piezas: readonly Pieza[] } {
  const lista = ((json ?? {}) as { piezas?: unknown }).piezas;
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${fichero}: no trae ninguna pieza en "piezas"`);
  }
  return leerPiezas(lista, fichero);
}

const EQUIPO_LEIDO = leerEquipo(equipoJson);

/**
 * El catálogo de equipo como está escrito en el fichero, con sus bases: de él
 * parte la arena construida, y el juego lo resuelve en `EQUIPO`.
 */
export const EQUIPO_ESCRITO: readonly PiezaEscrita[] = EQUIPO_LEIDO.escritas;

/** El catálogo de equipo resuelto, en el orden del fichero: es el orden del sorteo del botín. */
export const EQUIPO: readonly Pieza[] = EQUIPO_LEIDO.piezas;

/** Las piezas que se pueden llevar, por su id. */
export type CatalogoDePiezas = ReadonlyMap<string, Pieza>;

/** El catálogo del juego: `data/equipo.json` por id, tal como se cargó. El único que ve el juego. */
export const PIEZAS_DEL_CATALOGO: CatalogoDePiezas = new Map(EQUIPO.map((p) => [p.id, p]));

/** La pieza `id`. Lanza si no existe: un id inventado en un estado es un bug, no un vacío. */
export function pieza(id: string): Pieza {
  return piezaDe(PIEZAS_DEL_CATALOGO, id);
}

export function piezaDe(piezas: CatalogoDePiezas, id: string): Pieza {
  const p = piezas.get(id);
  if (p === undefined) throw new Error(`pieza de equipo desconocida: "${id}"`);
  return p;
}

/**
 * Como `pieza`, pero `null` en vez de lanzar. La usan los que tienen que dar un
 * motivo escrito a un id que viene de fuera —el agente puede mandar cualquier
 * texto—, igual que `buildingIfExists`.
 */
export function piezaSiExiste(id: string): Pieza | null {
  return PIEZAS_DEL_CATALOGO.get(id) ?? null;
}

/**
 * Si la armería vende `p` (`Pieza.seConsigue`). **La regla de lo que se vende, en
 * un sitio**: la leen `buyBlocker`, para rechazar, y `PIEZAS_DE_ARMERIA`, para
 * enseñar. Escrita en los dos podían discrepar.
 */
export function seVende(p: Pieza): boolean {
  return p.seConsigue.includes('armeria');
}

/** Si `p` cae como botín (`Pieza.seConsigue`): la lee `PIEZAS_DE_BOTIN`. */
export function caeComoBotin(p: Pieza): boolean {
  return p.seConsigue.includes('botin');
}

/**
 * De dónde se consigue `p`, dicho para quien juega con la tabla del núcleo
 * (`DICHO_DE_DONDE`, `SOLO_EN_KITS`): «se vende en la armería», «cae como botín»,
 * las dos cosas o que solo la llevan las unidades que nacen con ella. Lo leen la
 * prosa del agente y el motivo de `buyBlocker`.
 */
export function deDondeSale(p: Pick<Pieza, 'seConsigue'>): string {
  if (p.seConsigue.length === 0) return SOLO_EN_KITS;
  return p.seConsigue.map((d) => DICHO_DE_DONDE[d]).join(' y ');
}

/** Lo que vende la armería, en el orden del catálogo (`seVende`). */
export const PIEZAS_DE_ARMERIA: readonly Pieza[] = EQUIPO.filter(seVende);

/**
 * Lo que puede caer como botín (`caeComoBotin`), en el orden del catálogo, que es
 * el del sorteo. Que haya alguna lo garantiza el cargador (`leerEquipo`).
 */
export const PIEZAS_DE_BOTIN: readonly Pieza[] = EQUIPO.filter(caeComoBotin);
