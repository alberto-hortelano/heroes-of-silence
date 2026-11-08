/**
 * La caja de una figura de pie en pantalla (`CajaDeFigura`, `cajaDeFiguraEn`: el centro
 * de sus pies, el suelo, su alto y su ancho), si un píxel cae en su cuerpo
 * (`dentroDeLaFigura`) y el aro dorado a sus pies (`pintarAroDeFigura`). La leen la base
 * caminable, las escenas de pie (la morada y el ayuntamiento) y la batalla, que la
 * asienta en su casilla y la sube a lo alto de una columna (`cajaDeFigura`, en
 * `render/batalla/figura.ts`). Era parte de `render/batalla.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { ALTO_DE_FIGURA, type Plano } from '../../../shared/arte.js';
import { enPantalla, type Tablero } from '../proyeccion.js';
import { aroDeFigura, type PiesDeLaFigura } from './aro.js';

/** Una figura en pantalla: el centro de sus pies, el suelo, su alto y su ancho, en píxeles. */
export interface CajaDeFigura {
  readonly x: number;
  readonly suelo: number;
  readonly alto: number;
  readonly ancho: number;
}

/**
 * La caja de una figura de pie con los pies en `en`, sin el desplazamiento
 * dentro de su hex que lleva la del combate (`cajaDeFigura`): la de la base
 * caminable, que no tiene hexes, y la que hay debajo de la del combate. Así un
 * adulto mide lo mismo en los dos.
 */
export function cajaDeFiguraEn(t: Tablero, en: Plano): CajaDeFigura {
  const p = enPantalla(t, en);
  const alto = t.paso * ALTO_DE_FIGURA;
  return { x: p.x, suelo: p.y, alto, ancho: alto * 0.42 };
}

/**
 * El aro dorado a los pies de una figura de pie: el de quien señala el ratón en
 * la base y el de la elegida en la escena de la tropa (`grueso` dice cuál pesa más).
 * Centrado en sus pies y del tamaño que los abarque (`aroDeFigura`, con `pies` de
 * `piesDeFigura`; sin ellos, el de siempre). Va encima de la sombra y debajo de
 * la figura (`pintarFiguraConSombra` con él en medio): la sombra es del suelo y el
 * aro se lee encima.
 */
export function pintarAroDeFigura(
  ctx: CanvasRenderingContext2D,
  c: CajaDeFigura,
  pies: PiesDeLaFigura | null,
  grueso = 2,
): void {
  const aro = aroDeFigura(c, pies);
  ctx.save();
  ctx.strokeStyle = '#f5d973';
  ctx.lineWidth = grueso;
  ctx.beginPath();
  ctx.ellipse(aro.x, aro.y, aro.rx, aro.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Lo que se cuenta por debajo del suelo como pulsar la figura, en píxeles: la sombra de los pies. */
const BAJO_LOS_PIES = 4;

/** Si un píxel cae en el cuerpo de una figura: lo leen el clic de la batalla y el de la base. */
export function dentroDeLaFigura(c: CajaDeFigura, px: number, py: number): boolean {
  return (
    Math.abs(px - c.x) <= c.ancho / 2 && py <= c.suelo + BAJO_LOS_PIES && py >= c.suelo - c.alto
  );
}
