/**
 * El formato de un **hechizo** (06-11-2026, el editor de magia de la arena;
 * `docs/agents/2026-11-06-editor-de-magia/`; petición del usuario: «Crear un editor
 * de magia en la arena para que pueda crear hechizos…»). Regla nuestra.
 *
 * Un hechizo es datos (`data/hechizos.json`): su nombre, una descripción libre, su
 * coste a mano (maná y nivel de gremio), cómo llega (`entrega`), qué se elige
 * (`objetivo`), a cuántos alcanza (`area`, `afecta`), cuánto dura lo que deja
 * (`duracion`) y una lista de efectos de un **vocabulario cerrado** (`Efecto`).
 * Cada palabra del vocabulario es una regla del motor (`battle/spells.ts`) con su
 * frase para la persona y el agente (`VOCABULARIO_DE_LA_MAGIA`): una palabra nueva
 * sin frase no compila.
 *
 * Cada hechizo es de una facción o de varias (`facciones`, 08-11-2026; petición del
 * usuario: «que cada hechizo pueda pertenecer a una o varias facciones»): el gremio
 * de una ciudad enseña solo los de la suya (`hechizosDelGremio`) y una unidad solo
 * usa como poder los de la suya (`poderDeUnidadBlocker`, `unidad/formato.ts`).
 *
 * El tipo es el JSON tal cual: lo que se lee es lo que se escribe («Guardar» de la
 * arena), sin forma intermedia. Lo valida `problemasDelHechizo` (`validar.ts`).
 */
import type { FactionId } from '../types.js';

/** Cómo llega un hechizo. */
export const ENTREGAS = [
  'libre',
  'sobreSi',
  'contacto',
  'alcance',
  'proyectil',
  'tablero',
] as const;
export type TipoDeEntrega = (typeof ENTREGAS)[number];

/**
 * Qué se elige al lanzar: una unidad de un bando, cualquiera, una casilla o el
 * cadáver de una casilla (08-11-2026, «Levantar zombi»: «se hace sobre un cadáver»).
 */
export const OBJETIVOS = ['aliado', 'enemigo', 'cualquiera', 'casilla', 'cadaver'] as const;
type Objetivo = (typeof OBJETIVOS)[number];

/** De los que alcanza, a quién: relativo al bando de quien lo lanza. */
export const AFECTA = ['aliados', 'enemigos', 'todos'] as const;
export type Afecta = (typeof AFECTA)[number];

/** Las cifras que un hechizo sube o baja. `casillas` es la velocidad de batalla. */
export const CIFRAS_DE_HECHIZO = [
  'ataque',
  'defensa',
  'armadura',
  'fuerza',
  'agilidad',
  'casillas',
] as const;
export type CifraDeHechizo = (typeof CIFRAS_DE_HECHIZO)[number];

/** Lo que un hechizo puede impedir. */
export const IMPEDIBLES = ['golpear', 'disparar', 'contraatacar', 'moverse', 'lanzar'] as const;
export type Impedible = (typeof IMPEDIBLES)[number];

/** Cuándo salta un disparador. */
export const CUANDO_SALTA = [
  'empezarSuTurno',
  'terminarSuTurno',
  'alSerGolpeado',
  'alGolpear',
  'alMorir',
] as const;
export type CuandoSalta = (typeof CUANDO_SALTA)[number];

/** A quién aplica lo suyo un disparador. */
export const A_QUIEN = ['portador', 'otro', 'alrededor'] as const;
export type AQuien = (typeof A_QUIEN)[number];

/** Los efectos de qué bando quita `disipar`, relativo al afectado. */
export const DISIPAR_DE = ['contrarios', 'propios', 'todos'] as const;
export type DisiparDe = (typeof DISIPAR_DE)[number];

/** El turno de quién cierra una duración «hasta…». `portador`, solo dentro de un disparador. */
export const TURNO_DE = ['afectado', 'lanzador', 'portador'] as const;
type TurnoDe = (typeof TURNO_DE)[number];

/** Quién, al caer, se lleva lo que dejó el hechizo. `portador`, solo dentro de un disparador. */
const SE_ACABA_SI_MUERE = ['lanzador', 'portador'] as const;
export type SeAcabaSiMuere = (typeof SE_ACABA_SI_MUERE)[number];

/** Un número fijo, o lo que rinde con el poder mágico de quien lo lanza (una unidad, poder 0). */
export type Cantidad = number | { readonly base: number; readonly porPoder: number };

type Entrega =
  | { readonly tipo: 'libre'; readonly diferido?: boolean }
  | { readonly tipo: 'sobreSi' }
  | { readonly tipo: 'contacto' }
  | { readonly tipo: 'alcance'; readonly casillas: number; readonly diferido?: boolean }
  | { readonly tipo: 'proyectil'; readonly casillas?: number; readonly diferido?: boolean }
  | { readonly tipo: 'tablero' };

/** Lo que dura lo que deja: unas rondas, hasta el próximo turno de alguien, o toda la pelea. */
export type Duracion =
  | { readonly rondas: number | 'poder' }
  | { readonly hasta: 'empezar' | 'terminar'; readonly turnoDe: TurnoDe }
  | 'pelea';

/** Lo que se hace en el acto: no pide duración. */
type EfectoInstantaneo =
  | { readonly tipo: 'danio'; readonly cantidad: Cantidad; readonly armadura: boolean }
  | { readonly tipo: 'cura'; readonly cantidad: Cantidad }
  | { readonly tipo: 'disipar'; readonly de: DisiparDe };

/** Lo que se cuelga del afectado y dura: pide duración. */
type EfectoQueDura =
  | { readonly tipo: 'cifra'; readonly cifra: CifraDeHechizo; readonly valor: number }
  | { readonly tipo: 'impide'; readonly que: readonly Impedible[] }
  | { readonly tipo: 'escudo'; readonly absorbe: Cantidad };

/** Lo que va dentro de un disparador: todo menos otro disparador. */
export type EfectoSimple = EfectoInstantaneo | EfectoQueDura;

/** Cuando le pasa algo a quien lo lleva, aplica sus efectos. Dura, como un efecto más. */
export interface Disparador {
  readonly tipo: 'disparador';
  readonly cuando: CuandoSalta;
  /** También salta al colgarse (solo con `empezarSuTurno`/`terminarSuTurno`): el pulso de un aura. */
  readonly yAlLanzarse?: boolean;
  readonly a: AQuien;
  /** Con `a: alrededor`: a cuántas casillas del portador y a quién. */
  readonly radio?: number;
  readonly afecta?: Afecta;
  /** Veces que salta antes de quitarse; sin él, mientras dure. */
  readonly cargas?: number;
  /** Lo que dura lo que deja, si deja algo que dura. */
  readonly duracion?: Duracion;
  readonly seAcabaSiMuere?: SeAcabaSiMuere;
  readonly efectos: readonly EfectoSimple[];
}

/**
 * Levanta una unidad del catálogo en la casilla del cadáver elegido, del bando de
 * quien lo lanza, y el cadáver se gasta (08-11-2026, «Levantar zombi»; regla nuestra).
 * Qué sale de cada cadáver lo dice el propio efecto, no el motor ni el catálogo de
 * unidades: el de una unidad que nombra `de` (su id), lo que diga ahí; el de un vivo
 * (sin el rasgo `undead`) que no nombra, `vivos`; el resto —otro no-muerto, el
 * cuerpo del héroe— no se levanta. Va solo con el objetivo `cadaver`, y no dentro de
 * un disparador (no es un `EfectoSimple`).
 */
interface Levantar {
  readonly tipo: 'levantar';
  /** La unidad que sale del cadáver de un vivo. */
  readonly vivos: string;
  /** Lo que sale del cadáver de cada unidad nombrada (un no-muerto), por su id. */
  readonly de?: Readonly<Record<string, string>>;
}

export type Efecto = EfectoSimple | Disparador | Levantar;
export type TipoDeEfecto = Efecto['tipo'];

export const TIPOS_DE_EFECTO = [
  'danio',
  'cura',
  'disipar',
  'cifra',
  'impide',
  'escudo',
  'disparador',
  'levantar',
] as const satisfies readonly TipoDeEfecto[];

/** Los que se hacen en el acto (el resto dura). */
export const INSTANTANEOS: readonly TipoDeEfecto[] = ['danio', 'cura', 'disipar', 'levantar'];

/** El efecto `levantar` de `h`, o `undefined`: el de un hechizo que apunta a un cadáver. */
export function levantarDe(h: Pick<Hechizo, 'efectos'>): Levantar | undefined {
  return h.efectos.find((e): e is Levantar => e.tipo === 'levantar');
}

/** Un hechizo, tal como se escribe en `data/hechizos.json`. */
export interface Hechizo {
  readonly id: string;
  readonly nombre: string;
  /** El campo para describirlo: prosa libre, la leen la persona y el agente. */
  readonly descripcion: string;
  /** Lo que cuesta al héroe, a mano. Una unidad que lo usa como poder no paga. */
  readonly mana: number;
  /** El nivel del gremio de magia que lo enseña, o `null` (ninguno: la arena y los poderes). */
  readonly gremio: number | null;
  /**
   * De qué facciones es: una o varias, sin repetir, en el orden de `FACTION_IDS`
   * cuando lo escribe el editor. Lo leen el gremio y los poderes de unidad.
   */
  readonly facciones: readonly FactionId[];
  readonly entrega: Entrega;
  /** Ausente con `sobreSi` y `tablero`. */
  readonly objetivo?: Objetivo;
  /** A cuántas casillas del punto de impacto alcanza (0, solo él), o la recta entera. */
  readonly area?: number | 'recta';
  readonly afecta?: Afecta;
  /** Ausente: instantáneo. */
  readonly duracion?: Duracion;
  readonly seAcabaSiMuere?: 'lanzador';
  readonly efectos: readonly Efecto[];
}

/** Lo que dice cuánto alcanza el área: 0 si no se escribe. */
export function areaDe(h: Pick<Hechizo, 'area'>): number | 'recta' {
  return h.area ?? 0;
}

/** Si el hechizo sale al empezar el siguiente turno de quien lo lanza. */
export function esDiferido(h: Pick<Hechizo, 'entrega'>): boolean {
  const e = h.entrega;
  return (
    (e.tipo === 'libre' || e.tipo === 'alcance' || e.tipo === 'proyectil') && e.diferido === true
  );
}

/**
 * Si se apunta a una casilla (y no a una unidad, ni a nada): la casilla o la del
 * cadáver, que se elige igual, con `at` (el cliente y el contrato no cambian).
 */
export function apuntaACasilla(h: Pick<Hechizo, 'objetivo'>): boolean {
  return h.objetivo === 'casilla' || h.objetivo === 'cadaver';
}

/** Si se lanza sin elegir nada: sobre sí o sobre el tablero entero. */
export function sinObjetivo(h: Pick<Hechizo, 'entrega'>): boolean {
  return h.entrega.tipo === 'sobreSi' || h.entrega.tipo === 'tablero';
}

/** Lo que rinde una cantidad con este poder mágico (una unidad, 0). */
export function rinde(c: Cantidad, poder: number): number {
  return typeof c === 'number' ? c : c.base + c.porPoder * poder;
}

/** Dónde está el catálogo de hechizos (lo lee `catalogo.ts`, lo escribe «Guardar» de la arena). */
export const RUTA_DE_LOS_HECHIZOS = 'data/hechizos.json';

/** El comentario del fichero si no tuviera uno (se conserva el del disco). */
export const COMENTARIO_DE_LOS_HECHIZOS =
  'Hechizos (el editor de magia de la arena, 06-11-2026). REGLA NUESTRA: el formato y su validación en src/core/magia/; lo escribe «Guardar» de la arena. Cifras, costes y facciones a mano; el gremio de una ciudad enseña solo los de su facción y una unidad usa como poder solo los de la suya.';

// ---------------------------------------------------------------- límites

export const MANA_MAXIMO = 99;
export const GREMIO_MAXIMO = 5;
export const CASILLAS_MAXIMAS = 12;
export const AREA_MAXIMA = 4;
export const RONDAS_MAXIMAS = 9;
export const VALOR_MAXIMO = 12;
export const CANTIDAD_MAXIMA = 999;
export const CARGAS_MAXIMAS = 9;
export const EFECTOS_MAXIMOS = 6;
export const LARGO_DEL_NOMBRE = 40;
export const LARGO_DE_LA_DESCRIPCION = 400;

/** La forma del id de un hechizo: minúsculas, cifras y `_` (los de hoy, `magic_arrow`). */
export function esIdDeHechizo(id: string): boolean {
  return /^[a-z0-9][a-z0-9_]*$/.test(id) && id.length <= LARGO_DEL_NOMBRE;
}

// ---------------------------------------------------------------- vocabulario

/**
 * Cada palabra del formato con su frase: los tooltips del editor, la prosa del
 * agente y los mensajes de la validación. Cerrado por tipo: una palabra nueva sin
 * frase no compila.
 */
export const VOCABULARIO_DE_LA_MAGIA: {
  readonly entregas: Readonly<Record<TipoDeEntrega, string>>;
  readonly objetivos: Readonly<Record<Objetivo, string>>;
  readonly afecta: Readonly<Record<Afecta, string>>;
  readonly efectos: Readonly<Record<TipoDeEfecto, string>>;
  readonly cifras: Readonly<Record<CifraDeHechizo, string>>;
  readonly impedibles: Readonly<Record<Impedible, string>>;
  readonly cuando: Readonly<Record<CuandoSalta, string>>;
  readonly aQuien: Readonly<Record<AQuien, string>>;
  readonly disipar: Readonly<Record<DisiparDe, string>>;
  readonly turnoDe: Readonly<Record<TurnoDe, string>>;
} = {
  entregas: {
    libre: 'a cualquiera del tablero, esté donde esté',
    sobreSi: 'sobre quien lo lanza (el cuerpo del héroe o la unidad); el área se centra en él',
    contacto: 'a una casilla de quien lo lanza',
    alcance: 'hasta N casillas de quien lo lanza, por encima (como la granada)',
    proyectil:
      'por la recta de quien lo lanza a la casilla elegida: da al primero vivo de cualquier bando; lo para un muro en el suelo',
    tablero: 'a todos los del tablero que diga «afecta»',
  },
  objetivos: {
    aliado: 'una unidad de su bando, quien lo lanza incluido',
    enemigo: 'una unidad del otro bando',
    cualquiera: 'una unidad de cualquier bando',
    casilla: 'una casilla (el área se centra en ella)',
    cadaver:
      'el cadáver de una casilla sin nadie vivo encima: el último que cayó en ella, que se gasta',
  },
  afecta: {
    aliados: 'solo a los del bando de quien lo lanza',
    enemigos: 'solo a los del otro bando',
    todos: 'a todos, amigos y enemigos',
  },
  efectos: {
    danio: 'quita vida; sin armadura, el daño llega entero',
    cura: 'repone la vida del de arriba, sin pasar de su máximo; nadie resucita',
    disipar: 'quita los efectos de hechizo del afectado (ni la rueda ni los rasgos)',
    cifra: 'sube o baja una cifra mientras dura',
    impide: 'no puede hacer eso mientras dura',
    escudo: 'se come el daño que llega (tras la armadura) hasta agotarse',
    disparador: 'cuando le pasa algo a quien lo lleva, aplica sus efectos',
    levantar:
      'levanta una unidad del catálogo en la casilla del cadáver, del bando de quien lo lanza; el cadáver se gasta',
  },
  cifras: {
    ataque: 'ataque',
    defensa: 'defensa',
    armadura: 'armadura',
    fuerza: 'fuerza',
    agilidad: 'agilidad',
    casillas: 'casillas que anda en batalla',
  },
  impedibles: {
    golpear: 'golpear cuerpo a cuerpo (y cargar)',
    disparar: 'apuntar o lanzar granadas (y lo apuntado no sale)',
    contraatacar: 'devolver el golpe',
    moverse: 'moverse',
    lanzar: 'lanzar hechizos o usar poderes',
  },
  cuando: {
    empezarSuTurno: 'al empezar cada turno de quien lo lleva',
    terminarSuTurno: 'al terminar cada turno de quien lo lleva',
    alSerGolpeado: 'cuando le golpean cuerpo a cuerpo (no un contraataque)',
    alGolpear: 'cuando golpea cuerpo a cuerpo (no un contraataque)',
    alMorir: 'cuando cae quien lo lleva',
  },
  aQuien: {
    portador: 'a quien lo lleva',
    otro: 'a quien le golpeó, o a quien golpeó',
    alrededor: 'a los que tiene a N casillas o menos',
  },
  disipar: {
    contrarios: 'lo que le echó el bando contrario',
    propios: 'lo que le echó su bando',
    todos: 'todo lo que le echó la magia',
  },
  turnoDe: {
    afectado: 'de quien lo recibe',
    lanzador: 'de quien lo lanzó',
    portador: 'de quien lleva el disparador',
  },
};
