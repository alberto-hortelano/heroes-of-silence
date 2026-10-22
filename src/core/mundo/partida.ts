/**
 * Del mundo a la partida, y la partida de un mundo nuevo: las dos puertas entre
 * el paquete en disco y `newGame`.
 */
import { tipoDeHeroePorDefecto } from '../data.js';
import { generateMapPlan, type MapPlan } from '../map/generate.js';
import { createRng } from '../rng.js';
import type { GameState } from '../state/game.js';
import { faccionesDeLaSemilla, newGame } from '../state/setup.js';
import type { Controller, FactionId, PlayerId } from '../types.js';
import { type Mundo, type MundoLeido, VERSION_DEL_MUNDO } from './formato.js';

/** Lo que se pide para un mundo nuevo (`pnpm mundo nuevo`, el menú de `pnpm dev`). */
export interface PedidoDeMundo {
  readonly id: string;
  readonly semilla: number;
  readonly faccion: FactionId;
  readonly heroe?: string | undefined;
  readonly regionesPorBando: number;
}

/**
 * Lo que pide el menú: lo mismo, con el id y la semilla que pone el servidor si
 * no los trae (`gen-<AAAAMMDD>-<semilla>`, una al azar).
 */
export type PedidoDelMenu = Omit<PedidoDeMundo, 'id' | 'semilla'> & {
  readonly id?: string | undefined;
  readonly semilla?: number | undefined;
};

/**
 * El `mundo.json` y el plan congelado de un mundo nuevo: el plan procedimental de
 * esa semilla, con la facción pedida para el jugador 0 y el rival que saque la
 * semilla (`faccionesDeLaSemilla`). Sin historia: esa la escribe el motor.
 */
export function mundoNuevo(p: PedidoDeMundo): { readonly mundo: Mundo; readonly plan: MapPlan } {
  const plan = generateMapPlan(createRng(p.semilla), {
    factions: faccionesDeLaSemilla(p.semilla, p.faccion),
    regionesPorBando: p.regionesPorBando,
  });
  return {
    mundo: {
      version: VERSION_DEL_MUNDO,
      id: p.id,
      semilla: p.semilla,
      jugador: { heroe: p.heroe ?? tipoDeHeroePorDefecto(p.faccion) },
      rivales: 1,
    },
    plan,
  };
}

/**
 * La partida de un mundo leído (`leerMundo`, sin juzgarlo otra vez): su semilla,
 * su plan congelado, su historia y el héroe que se eligió. Las tiradas de la
 * partida salen de su semilla como en cualquier otra: el mismo mundo da la misma
 * partida.
 */
export function partidaDelMundo(
  leido: MundoLeido,
  controllers?: Readonly<Record<PlayerId, Controller>>,
  maxDays?: number,
): GameState {
  return newGame({
    seed: leido.mundo.semilla,
    mundo: leido,
    tipoDelHeroe: leido.mundo.jugador.heroe,
    ...(controllers === undefined ? {} : { controllers }),
    maxDays,
  });
}
