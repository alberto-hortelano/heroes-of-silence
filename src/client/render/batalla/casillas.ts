/**
 * Las casillas del tablero de batalla ya trazadas (`hexesDe`: cada hexágono como un
 * `Path2D`, en el orden de su índice, rehechos solo al cambiar el tamaño del lienzo) y
 * cómo se pinta una (`EstiloDeCasilla`). Las leen el tablero, lo alto de cada columna de
 * la muralla, los disparos y las granadas. Era parte de `render/batalla.ts` hasta la
 * fase C de la reorganización (07-11-2026).
 */
import { allHexes, hexKey } from '@core/battle/board.js';
import type { Hex } from '@core/types.js';
import { type Tablero, verticesHex } from '../proyeccion.js';

/**
 * Los 104 hexes ya trazados, para el tablero de este tamaño. Cada uno eran seis
 * senos y cosenos por fotograma para dibujar siempre lo mismo; ahora se trazan
 * al cambiar el tamaño del lienzo y nada más.
 */
let geometria: { clave: string; hexes: CasillaPintada[] } | null = null;

/** Una casilla del tablero ya trazada, por su índice (`indiceDe`). */
export interface CasillaPintada {
  readonly hex: Hex;
  readonly k: string;
  readonly camino: Path2D;
}

export function hexesDe(t: Tablero): CasillaPintada[] {
  const clave = `${t.paso}|${t.origenX}|${t.origenY}|${t.compresion}`;
  if (geometria !== null && geometria.clave === clave) return geometria.hexes;
  // En el orden de `allHexes`, que es el de `indiceDe`: la lista se lee por índice.
  const hexes: CasillaPintada[] = allHexes().map((hex) => {
    const camino = new Path2D();
    for (const [i, p] of verticesHex(t, hex).entries()) {
      if (i === 0) camino.moveTo(p.x, p.y);
      else camino.lineTo(p.x, p.y);
    }
    camino.closePath();
    return { hex, k: hexKey(hex), camino };
  });
  geometria = { clave, hexes };
  return hexes;
}

/** Cómo se pinta una casilla: relleno, ancho y color del borde. */
export interface EstiloDeCasilla {
  readonly relleno: string;
  readonly ancho: number;
  readonly trazo: string;
}
