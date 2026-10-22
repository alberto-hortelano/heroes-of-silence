/**
 * Lo que hay en la escena de la base, en el orden en que se pinta.
 *
 * Edificios y figuras van en **una sola lista**: primero los edificios, del pie
 * más hondo al menos (sus regiones no se pisan, así que el orden entre ellos
 * solo lo fija), y después las figuras por su `y`. Toda figura va delante de
 * todo edificio (criterio 4' de la vuelta 2): el recorte es del cuadro, y lo que
 * se pisa empieza por delante de los umbrales (`bordeDeAtras`).
 *
 * Lo que se ve lo trae la sesión ya resuelto (`VistaDeLaBase`): qué se ha
 * levantado en cada sitio y quién hay. Aquí no se aplica ninguna regla.
 */
import type { SitioId } from '@core/town/sitios.js';
import type { FactionId, PlayerId } from '@core/types.js';
import { type Disposicion, type Mirada, type Plano, planoDelCuadro } from '../../../shared/base.js';
import { CUERPO_DE_VECINO } from '../personajes.js';

export interface EdificioEnLaBase {
  readonly sitio: SitioId;
  /** El último eslabón construido en ese sitio. */
  readonly edificio: string;
  readonly nombre: string;
}

export interface PersonaEnLaBase {
  readonly id: string;
  readonly nombre: string;
  readonly papel: string;
  readonly sitio: SitioId | null;
  /** Un vecino, su clave en `data/vecinos.json` y en `d.vecinos`; un encargado, `null`. */
  readonly clave: string | null;
  /** Lo que dice hoy (`vozDe`). */
  readonly linea: string;
}

/** Lo que la sesión cuenta de la base abierta: lo construido, la gente y quién camina. */
export interface VistaDeLaBase {
  readonly faccion: FactionId;
  readonly townId: string;
  /** El dueño: su color tiñe a quien camina (lo pone la escena, `playerColor`). */
  readonly owner: PlayerId | null;
  readonly edificios: readonly EdificioEnLaBase[];
  readonly gente: readonly PersonaEnLaBase[];
  /** El héroe que está dentro o, si no hay, el alcaide. */
  readonly caminante: {
    readonly id: string;
    readonly nombre: string;
    readonly cuerpo: string;
  };
}

/** Dónde está y qué hace quien camina, en pasos del escenario. */
export interface EstadoDelCaminante {
  readonly en: Plano;
  readonly mira: Mirada;
  readonly clip: 'idle' | 'walk';
  /** Milisegundos desde que empezó su clip. */
  readonly tiempo: number;
}

export type Elemento =
  | {
      readonly tipo: 'edificio';
      /** Dónde está: su tramo y su región son los de `d.sitios[sitio]`. */
      readonly sitio: SitioId;
      readonly edificio: string;
      readonly nombre: string;
      /** La profundidad de su pie pintado, en pasos. */
      readonly pie: number;
    }
  | {
      readonly tipo: 'figura';
      readonly id: string;
      readonly cuerpo: string;
      readonly nombre: string;
      readonly en: Plano;
      readonly mira: Mirada;
      readonly clip: 'idle' | 'walk';
      readonly tiempo: number;
      /** Si es alguien con quien se habla (no quien camina). */
      readonly pnj: boolean;
      readonly pie: number;
    };

/** Dónde está una persona de la base: el encargado junto a su puerta, el vecino en su sitio. */
export function dondeEsta(
  d: Disposicion,
  p: Pick<PersonaEnLaBase, 'id' | 'sitio' | 'clave'>,
): { en: Plano; mira: Mirada } {
  if (p.sitio !== null) return { en: d.sitios[p.sitio].encargado, mira: 'S' };
  const v = p.clave === null ? undefined : d.vecinos[p.clave];
  if (v === undefined) throw new Error(`la base no sabe dónde está "${p.id}"`);
  return v;
}

/**
 * Edificios (lo de detrás primero) y luego gente y quien camina, por su pie. Sin
 * `gente`, solo quien camina: dentro de una morada (`EscenaBase.pintarLaMorada`)
 * el encargado esperaría donde van los reclutas, y dentro no se habla con nadie.
 * Sin `caminante`, tampoco él: ante el ayuntamiento se plantaba en medio de los
 * candidatos a héroe, una figura más que no se elige (22-10-2026).
 */
export function componerBase(
  d: Disposicion,
  vista: VistaDeLaBase,
  caminante: EstadoDelCaminante,
  tiempo: number,
  {
    gente = true,
    caminante: conCaminante = true,
  }: { readonly gente?: boolean; readonly caminante?: boolean } = {},
): Elemento[] {
  const elementos: Elemento[] = [
    ...vista.edificios.map((e): Elemento => {
      const s = d.sitios[e.sitio];
      const pie = planoDelCuadro(d, s.tramo, [s.umbral.enElCuadro[0], s.region.pie]).y;
      return { tipo: 'edificio', ...e, pie };
    }),
    ...(gente ? vista.gente : []).map((p): Elemento => {
      const { en, mira } = dondeEsta(d, p);
      return {
        tipo: 'figura',
        id: p.id,
        // Se pinta sin armas y en reposo de civil, no con el Y Bot en guardia de
        // su criatura (`CUERPO_DE_VECINO`).
        cuerpo: CUERPO_DE_VECINO,
        nombre: p.nombre,
        en,
        mira,
        clip: 'idle',
        tiempo,
        pnj: true,
        pie: en.y,
      };
    }),
    ...(conCaminante
      ? [
          {
            tipo: 'figura',
            id: vista.caminante.id,
            cuerpo: vista.caminante.cuerpo,
            nombre: vista.caminante.nombre,
            en: caminante.en,
            mira: caminante.mira,
            clip: caminante.clip,
            tiempo: caminante.tiempo,
            pnj: false,
            pie: caminante.en.y,
          } satisfies Elemento,
        ]
      : []),
  ];
  const capa = (e: Elemento): number => (e.tipo === 'edificio' ? 0 : 1);
  return elementos.sort((a, b) => capa(a) - capa(b) || a.pie - b.pie);
}
