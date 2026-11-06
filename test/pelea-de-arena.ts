/**
 * La pelea de la arena en un test, sin el cliente: las unidades del catálogo con
 * cambios (`unidadDeArena`, `catalogoEntero`, `delBorrador`), el catálogo de equipo
 * con piezas encima (`catalogoCon`, `elCatalogoCon`), la carpeta que lee «Guardar»
 * (`carpetaDeLaArena`), el montaje y la pelea por la arena o por el motor
 * (`montajeDePrueba`, `peleaDeArena`, `peleaDelMotor`), y lo que la sesión de la
 * arena le pasa a `retocarEnBatalla` para los tests que retocan una batalla a
 * mano: el catálogo de su pelea con las piezas que se digan (`montar` recuerda el
 * montaje de cada batalla, `catalogoDe`). Lo de `test/helpers.ts` llegó en la fase
 * T de la reorganización (06-11-2026).
 */
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  batallaDeArena,
  type CatalogoDeLaArena,
  catalogoDeLaPelea,
  conPiezas,
  type FuenteDeArena,
  type MontajeDeArena,
} from '../src/core/arena.js';
import { type BattleSide, createBattle, type StackDeBatalla } from '../src/core/battle/battle.js';
import { type MurallaDeBatalla, SIN_MURALLA } from '../src/core/battle/muralla.js';
import type { BattleState } from '../src/core/battle/types.js';
import { type CatalogoDeUnidades, UNIDADES, unidad } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import {
  COMENTARIO_DEL_CATALOGO_DE_EQUIPO,
  EQUIPO_ESCRITO,
  type PiezaEscrita,
  RUTA_DEL_CATALOGO_DE_EQUIPO,
} from '../src/core/equipo/pieza.js';
import { RUTA_DEL_HEROE } from '../src/core/hero/cuerpo-del-heroe.js';
import {
  type CatalogoDeEquipo,
  catalogoDeEquipo,
  EQUIPO_DEL_JUEGO,
} from '../src/core/hero/equipo.js';
import type { Rng } from '../src/core/rng.js';
import type { Unidad } from '../src/core/unidad.js';
import { RAIZ } from './comun.js';

const MONTAJES = new WeakMap<BattleState, MontajeDeArena>();

/** `batallaDeArena`, recordando su montaje para `catalogoDe`. */
export function montar(m: MontajeDeArena, rng: Rng): BattleState {
  const b = batallaDeArena(m, rng);
  MONTAJES.set(b, m);
  return b;
}

/** El catálogo de la pelea `b`: las unidades de su montaje con las piezas `eq`. */
export function catalogoDe(b: BattleState, eq: CatalogoDeEquipo): CatalogoDeLaArena {
  const m = MONTAJES.get(b);
  if (m === undefined) throw new Error('esta batalla no la montó `montar`');
  return catalogoDeLaPelea(
    [...m.izquierda.unidades, ...m.derecha.unidades].map((f) => f.unidad),
    eq,
  );
}

/**
 * Una unidad del catálogo (`data/unidades.json`, `core/catalogo.ts`) con los
 * cambios que diga el test: la misma fuente de cifras que la arena y el juego.
 */
export function unidadDeArena(id: string, cambios: Partial<Unidad> = {}): Unidad {
  return { ...unidad(id), ...cambios };
}

/**
 * El catálogo entero de unidades (`data/unidades.json`) con `cambios` encima: la
 * del mismo id la sustituye en su sitio, una nueva va detrás. «Guardar» exige un
 * catálogo con el que arranque el juego —cada morada produce alguna unidad
 * (`moradasBlocker`)—, así que una prueba que guarda lo hace sobre el entero.
 */
export function catalogoEntero(...cambios: Unidad[]): Unidad[] {
  const porId = new Map(cambios.map((u) => [u.id, u]));
  const ids = new Set(UNIDADES.map((u) => u.id));
  return [...UNIDADES.map((u) => porId.get(u.id) ?? u), ...cambios.filter((u) => !ids.has(u.id))];
}

/**
 * El catálogo de equipo del juego (`EQUIPO_ESCRITO`) con `encima` puestas
 * (`conPiezas`: la del mismo id la sustituye, una nueva va detrás): el catálogo
 * entero que una prueba hace (`catalogoCon`) o guarda.
 */
export function elCatalogoCon(...encima: PiezaEscrita[]): readonly PiezaEscrita[] {
  return conPiezas(EQUIPO_ESCRITO, encima);
}

/**
 * Una carpeta temporal con lo que la arena lee del repo además de lo que escribe:
 * el catálogo de equipo (`data/equipo.json`, el del juego) y el héroe
 * (`data/heroe.json`). Sin ellos, `leerCatalogo` no tiene con qué leer, como no lo
 * tendría el juego.
 */
export function carpetaDeLaArena(prefijo = 'arena-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(
    join(dir, RUTA_DEL_CATALOGO_DE_EQUIPO),
    JSON.stringify({ _comment: COMENTARIO_DEL_CATALOGO_DE_EQUIPO, piezas: EQUIPO_ESCRITO }),
  );
  // Y el héroe del repo: «Guardar» escribe su cuerpo y conserva lo demás.
  copyFileSync(join(RAIZ, RUTA_DEL_HEROE), join(dir, RUTA_DEL_HEROE));
  // Y los hechizos (el editor de magia): las unidades los usan como poder.
  copyFileSync(join(RAIZ, 'data/hechizos.json'), join(dir, 'data/hechizos.json'));
  return dir;
}

/** El catálogo del juego con `encima` puestas (`elCatalogoCon`), leído (`catalogoDeEquipo`). */
export function catalogoCon(...encima: PiezaEscrita[]): CatalogoDeEquipo {
  return catalogoDeEquipo(elCatalogoCon(...encima));
}

/** Lo común de un montaje de prueba: el catálogo de equipo del juego. */
export const MONTAJE = {
  equipo: EQUIPO_DEL_JUEGO,
  combate: COMBATE_COMPLETO,
} as const satisfies Pick<MontajeDeArena, 'equipo' | 'combate'>;

/** Una unidad del borrador a su puesto de la pelea, con su escalera o sin ella. */
export interface PuestoDeLaPelea {
  readonly unidad: Unidad;
  readonly escalera?: boolean;
}

/** Las unidades, cada una a su puesto de la pelea, sin escalera (`batallaDeArena`). */
export function aPelear(unidades: readonly Unidad[]): PuestoDeLaPelea[] {
  return unidades.map((unidad) => ({ unidad }));
}

/**
 * El montaje de la arena con unidades del borrador, sin héroes: los tests de la
 * muralla no miran ni el catálogo ni la magia. Con el catálogo de equipo del
 * juego salvo que se pida otro (`extra`: el catálogo hecho, `catalogoCon`).
 */
export function montajeDePrueba(
  izquierda: readonly PuestoDeLaPelea[],
  derecha: readonly PuestoDeLaPelea[],
  muralla: MurallaDeBatalla = SIN_MURALLA,
  extra: Partial<Pick<MontajeDeArena, 'equipo'>> = {},
): MontajeDeArena {
  const lado = (puestos: readonly PuestoDeLaPelea[]) => ({
    unidades: puestos.map(({ unidad, escalera }) => ({ unidad, escalera: escalera === true })),
    heroe: null,
  });
  return {
    izquierda: lado(izquierda),
    derecha: lado(derecha),
    muralla,
    combate: COMBATE_COMPLETO,
    equipo: extra.equipo ?? EQUIPO_DEL_JUEGO,
  };
}

/** `batallaDeArena` con `montajeDePrueba`. */
export function peleaDeArena(
  izquierda: readonly PuestoDeLaPelea[],
  derecha: readonly PuestoDeLaPelea[],
  rng: Rng,
  muralla: MurallaDeBatalla = SIN_MURALLA,
): BattleState {
  return batallaDeArena(montajeDePrueba(izquierda, derecha, muralla), rng);
}

/**
 * La pelea de `peleaDeArena` por la vía del motor, sin la arena: cada bando lleva
 * sus unidades en su catálogo de la pelea (`BattleSide.catalogo`, con el equipo
 * del juego), y el motor saca de él sus cifras de combate (`cifrasDeUnidad`, las
 * de `unidadDeCombate`). Con las reglas del juego (`createBattle`). Con `heroes`,
 * el de cada bando: es la puerta con la que se compara la de la arena
 * (`batallaDeArena`).
 */
export function peleaDelMotor(
  izquierda: readonly PuestoDeLaPelea[],
  derecha: readonly PuestoDeLaPelea[],
  rng: Rng,
  muralla: MurallaDeBatalla = SIN_MURALLA,
  heroes: { readonly izquierda: BattleSide['hero']; readonly derecha: BattleSide['hero'] } = {
    izquierda: null,
    derecha: null,
  },
): BattleState {
  const lado = (puestos: readonly PuestoDeLaPelea[], hero: BattleSide['hero']): BattleSide => {
    // Un id por puesto, `motor-<n>`: dos puestos de la misma unidad, o de dos que
    // se llaman igual, son dos fuentes, como en el montaje de la arena.
    const porId = new Map<string, Unidad>(
      puestos.map(({ unidad }, i) => [`motor-${i}`, { ...unidad, id: `motor-${i}` }]),
    );
    const army: StackDeBatalla[] = puestos.map(({ escalera }, i) => ({
      creature: `motor-${i}`,
      count: 1,
      ...(escalera === true ? { escalera: true } : {}),
    }));
    const catalogo: CatalogoDeUnidades = {
      unidad: (id) => {
        const u = porId.get(id);
        if (u === undefined) throw new Error(`el bando no lleva ninguna unidad «${id}»`);
        return u;
      },
      equipo: EQUIPO_DEL_JUEGO,
    };
    return { army, hero, catalogo };
  };
  return createBattle(
    lado(izquierda, heroes.izquierda),
    lado(derecha, heroes.derecha),
    rng,
    COMBATE_COMPLETO,
    muralla,
  );
}

/** Una unidad del borrador como fuente del montaje de la arena. */
export function delBorrador(unidad: Unidad, escalera = false): FuenteDeArena {
  return escalera ? { unidad, escalera } : { unidad };
}
