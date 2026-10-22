/**
 * Lo que se ve en la escena del ayuntamiento (22-10-2026, «el selector de héroe
 * al iniciar la partida similar al reclutamiento, mostrándolos en la base»): una
 * figura por tipo de héroe de la facción, de pie ante el ayuntamiento como la
 * tropa ante su morada, y la ficha del elegido con lo que cuesta.
 *
 * Solo **lee** el núcleo: los candidatos, su precio y por qué no se puede
 * contratar uno son de `candidatosAHeroe` (que la sesión pasa hechos, con el
 * motivo del turno si no se puede jugar, que aquí se pone una vez), la hoja de
 * cada uno de `figuraDelHeroe` y el edificio, el que está levantado en el sitio
 * del ayuntamiento (`construidoEn`). Lo compone la sesión
 * (`vistaDelAyuntamiento`, cacheada por su `version`) y lo pintan el lienzo y el
 * panel.
 */
import { figuraDelHeroe } from '@core/data.js';
import type { CandidatoAHeroe, EleccionDeHeroe } from '@core/state/game.js';
import { building } from '@core/town/buildings.js';
import { construidoEn, type SitioId } from '@core/town/sitios.js';
import type { Town } from '@core/town/town.js';
import type { Army, FactionId, PlayerId } from '@core/types.js';

/** El sitio de la base ante el que se eligen los héroes. */
export const SITIO_DEL_AYUNTAMIENTO: SitioId = 'hall';

/** Una figura de la fila: un tipo de héroe. */
export interface FiguraDelAyuntamiento {
  /** El id del tipo: para su compás y para `canvas[data-ayuntamiento]`. */
  readonly id: string;
  /** El nombre del tipo: lo que dice la barra al señalarlo. */
  readonly nombre: string;
  /** La hoja con que se pinta (`figuraDelHeroe`), la misma del mapa y la batalla. */
  readonly cuerpo: string;
}

/**
 * La ficha del elegido: el candidato del núcleo y su retrato, con el motivo de no
 * poder jugar ahora (el turno) delante del suyo.
 */
export interface FichaDelAyuntamiento extends CandidatoAHeroe {
  /** La hoja de su retrato (`identidad.webp`). */
  readonly hoja: string;
}

export interface VistaDelAyuntamiento {
  readonly faccion: FactionId;
  /** Su color tiñe las figuras (`playerColor`). */
  readonly owner: PlayerId | null;
  readonly sitio: SitioId;
  /** El id del edificio del ayuntamiento: el de su arte (no tiene versión abierta). */
  readonly edificio: string;
  /** El nombre del edificio. */
  readonly nombre: string;
  /** El nombre que llevará el héroe, sea cual sea el tipo (`EleccionDeHeroe.nombre`). */
  readonly heroe: string;
  /**
   * Con qué tropa sale el de salida, o `null` en una contratación: así se sabe
   * cuál de las dos es (`EleccionDeHeroe.tropa`).
   */
  readonly tropa: Army | null;
  readonly figuras: readonly FiguraDelAyuntamiento[];
  /** El índice en `figuras` del elegido. */
  readonly elegida: number;
  readonly ficha: FichaDelAyuntamiento;
}

/**
 * La vista del ayuntamiento de `town` con el tipo `elegido` (con `null`, el
 * primero: el de por defecto), y `turno`, por qué no se puede jugar ahora (o
 * `null`). Lanza, diciéndolo, si en el sitio no hay nada levantado o si el elegido
 * no es un candidato: la sesión la compone antes de entrar y de elegir, así que
 * no entra ni elige mal.
 */
export function componerVistaDelAyuntamiento(
  town: Town,
  { nombre, tropa, candidatos }: EleccionDeHeroe,
  elegido: string | null,
  turno: string | null,
): VistaDelAyuntamiento {
  const edificio = construidoEn(town, SITIO_DEL_AYUNTAMIENTO);
  if (edificio === null) {
    throw new Error(`no se puede elegir héroe en ${town.name}: no tiene ayuntamiento`);
  }
  const i = elegido === null ? 0 : candidatos.findIndex((c) => c.tipo === elegido);
  const c = candidatos[i];
  if (c === undefined) {
    throw new Error(
      elegido === null
        ? `no se puede elegir héroe en ${town.name}: su facción no tiene ningún tipo de héroe`
        : `"${elegido}" no es un héroe que se pueda contratar en ${town.name}: valen ${candidatos.map((x) => x.tipo).join(', ')}`,
    );
  }
  const hoja = (tipo: string) => figuraDelHeroe({ faction: town.faction, tipo });
  return {
    faccion: town.faction,
    owner: town.owner,
    sitio: SITIO_DEL_AYUNTAMIENTO,
    edificio,
    nombre: building(edificio).name,
    heroe: nombre,
    tropa,
    figuras: candidatos.map((x) => ({ id: x.tipo, nombre: x.nombreDelTipo, cuerpo: hoja(x.tipo) })),
    elegida: i,
    ficha: { ...c, motivo: turno ?? c.motivo, hoja: hoja(c.tipo) },
  };
}
