/**
 * Figuras de pie mirando a la cámara, con la elegida y la señalada por su aro:
 * lo que comparten la escena de la tropa (`render/tropa/`) y la de la morada
 * (`render/morada/`), con el aire de su encuadre. Cada escena dice dónde cae la
 * caja de cada figura (la tropa encoge lo del fondo del arco; la morada, en fila,
 * no), y de aquí salen el orden de pintar, el clic y el pintado. La escena que
 * las conduce es `escenas/de-pie.ts`.
 *
 * Las figuras son las de siempre (`pintarFiguraConSombra`): de pie, mirando a la
 * cámara (`S`) y respirando (`idle`), con la hoja que les da su vista; sin arte, su
 * marcador con la inicial. Se pintan de atrás adelante para que la de delante tape
 * a la de detrás. La elegida lleva el aro dorado grueso y la que señala el ratón,
 * el fino, en los pies.
 */
import { COMPRESION_SUELO, FIGURA } from '../../shared/arte.js';
import type { Plano } from '../../shared/base.js';
import {
  type CajaDeFigura,
  cajaDeFiguraEn,
  dentroDeLaFigura,
  pintarAroDeFigura,
} from './batalla.js';
import { type FiguraColocada, piesDeFigura, pintarFiguraConSombra } from './figura.js';

/**
 * El aire del encuadre de las dos escenas, en partes del lienzo: encima de la
 * cabeza más alta, debajo de los pies de delante (y además su aro, `AL_PIE`) y a
 * cada lado.
 */
export const MARGEN = { arriba: 0.07, abajo: 0.04, lados: 0.04 } as const;
/** Lo que el aro y la sombra bajan de los pies, en partes del alto de la figura. */
export const AL_PIE = 0.12;
/**
 * Lo que sobra de alto con las figuras a la escala del combate, cuánto va debajo
 * de los pies de delante: el resto queda encima, en el fondo del campo.
 */
export const LIBRE_DEBAJO = 0.35;
/**
 * Sin otro fondo que el campo del combate, su horizonte, desde la cabeza de la
 * figura del fondo hacia abajo, en partes de su alto: detrás de los hombros. Así
 * el grupo pisa suelo de punta a punta y lo de arriba es la linde del bosque del
 * campo, no cielo.
 */
export const HORIZONTE_EN_LA_FIGURA = 0.3;
/**
 * Lo menos que se separan dos vecinas, en pasos: la caja de una figura mide 0,40
 * de ancho y con 0,43 queda un dedo entre las dos. Lo más, cada escena el suyo.
 */
export const SEPARACION_MINIMA = 0.43;
/** Una figura de pie a un paso de un píxel: de ella salen el alto y el ancho en pasos. */
export const UNA = cajaDeFiguraEn(
  { paso: 1, origenX: 0, origenY: 0, compresion: COMPRESION_SUELO },
  { x: 0, y: 0 },
);

/**
 * El lienzo de una escena de pie: su tamaño en píxeles CSS y su densidad (píxeles
 * de dispositivo por píxel CSS), que dice cuánto se puede agrandar una figura.
 */
export interface LienzoDePie {
  readonly ancho: number;
  readonly alto: number;
  readonly densidad: number;
}

/**
 * El paso más grande con que una figura de pie sale sin ampliar su hoja: el adulto
 * mide `FIGURA.alturaAdulto` píxeles en su celda, y en pantalla no pasa de esos
 * píxeles de dispositivo. Es el tope de las dos escenas (decisiones del usuario del
 * 20-10-2026: agrandadas a toda la escena pixelaban, y a la escala del combate «se
 * ve muy pequeña»).
 */
export function pasoDeLaHoja(densidad: number): number {
  return FIGURA.alturaAdulto / (UNA.alto * densidad);
}

/** Una figura de la escena, ya colocada: quién es (para su compás), cómo se pinta y dónde pisa. */
export interface FiguraEnLaEscena {
  readonly id: string;
  readonly nombre: string;
  readonly cuerpo: string;
  readonly en: Plano;
}

/** Dónde cae en el lienzo la figura que pisa en `en`: lo dice cada escena. */
export type CajaEn = (en: Plano) => CajaDeFigura;

/** De atrás adelante: el orden en que se pintan (y, al revés, en que se pulsan). */
export function deAtrasAdelante(figuras: readonly FiguraEnLaEscena[]): number[] {
  return figuras.map((_, i) => i).sort((a, b) => figuras[a]!.en.y - figuras[b]!.en.y || a - b);
}

/**
 * La figura bajo un píxel, o `null`: de delante atrás, la primera cuyo cuerpo lo
 * cubre (`dentroDeLaFigura`, la regla del clic de la batalla y de la base).
 */
export function figuraBajo(
  caja: CajaEn,
  figuras: readonly FiguraEnLaEscena[],
  px: number,
  py: number,
): number | null {
  for (const i of deAtrasAdelante(figuras).reverse()) {
    if (dentroDeLaFigura(caja(figuras[i]!.en), px, py)) return i;
  }
  return null;
}

export interface PintadoDePie {
  readonly caja: CajaEn;
  readonly figuras: readonly FiguraEnLaEscena[];
  /** El índice de la elegida y el de la señalada en `figuras`, o `null`. */
  readonly elegida: number;
  readonly señalada: number | null;
  readonly color: string;
  /** Milisegundos para el reloj del reposo. */
  readonly ahora: number;
}

export function pintarDePie(ctx: CanvasRenderingContext2D, v: PintadoDePie): void {
  for (const i of deAtrasAdelante(v.figuras)) {
    const f = v.figuras[i]!;
    const c = v.caja(f.en);
    const grueso = i === v.elegida ? 3 : i === v.señalada ? 1.5 : null;
    const aro =
      grueso === null
        ? undefined
        : (colocada: FiguraColocada) => pintarAroDeFigura(ctx, c, piesDeFigura(colocada), grueso);
    pintarFiguraConSombra(
      ctx,
      {
        id: f.id,
        body: f.cuerpo,
        clip: 'idle',
        tiempo: v.ahora,
        x: c.x,
        suelo: c.suelo,
        alto: c.alto,
        mira: 'S',
        color: v.color,
        rotulo: f.nombre.charAt(0).toUpperCase(),
      },
      aro,
    );
  }
}
