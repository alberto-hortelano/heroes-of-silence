/**
 * El disco de la rueda del golpe, su geometría y sus iconos: lo comparten la rueda
 * del combate (`rueda.ts`, que elige y cuenta el desenlace) y la rueda de la ficha
 * de un arma (`ruedaDeLaPieza`, solo para leer), que va en `paneles.ts`. Aparte
 * para que `paneles.ts` no importe `rueda.ts`, que ya importa `paneles.ts`.
 */

import {
  ANILLO,
  type FilaDeLaRueda,
  NOMBRE_DE_GOLPE,
  NORMAL_EN_LA_FICHA,
  type TipoDeGolpe,
  type TipoDelAnillo,
} from '@core/battle/rueda.js';
import { type Html, html, unir } from '../html.js';

/**
 * Los iconos, dibujados (sin arte generado): trazos en una caja de 24, con el
 * color del texto. Cada uno dice su golpe de un vistazo: el rayo es rápido, el
 * escudo defiende, la flecha que se tuerce engaña, el martillo pega fuerte, el
 * escudo partido rompe la guardia, la espada ataca y la balanza no se inclina.
 */
export const ICONO: Readonly<Record<TipoDeGolpe, readonly string[]>> = {
  rapido: ['M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2z'],
  defensivo: [
    'M12 2.5 4.5 5.5v5.8c0 4.6 3.1 8.4 7.5 10.2 4.4-1.8 7.5-5.6 7.5-10.2V5.5z',
    'M12 6.5v11',
  ],
  finta: [
    'M4 20c.6-6.4 4.4-10.6 11.5-11',
    'M12.5 5.5l3.5 3.4-3.6 3.3',
    'M4.5 4.5l3 3',
    'M8.5 3.5l1 1',
  ],
  fuerte: ['M3.5 8.2 8.2 3.5l5.3 5.3-4.7 4.7z', 'M11.2 11.2 20.5 20.5', 'M17 21.5l4.5-4.5'],
  romperGuardia: [
    'M12 2.5 4.5 5.5v5.8c0 4.6 3.1 8.4 7.5 10.2 4.4-1.8 7.5-5.6 7.5-10.2V5.5z',
    'M12.6 5l-2.4 5.2 3.2 1.8-2.6 5.6',
  ],
  ofensivo: ['M12 1.8l2 3V15h-4V4.8z', 'M6.5 15h11', 'M12 15v5.4', 'M10 21.6h4'],
  normal: ['M12 3.5v17', 'M7.5 20.5h9', 'M4.5 7h15', 'M4.5 7 2 13.5h5z', 'M19.5 7 17 13.5h5z'],
};

export function icono(tipo: TipoDeGolpe): Html {
  return html`<svg class="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${unir(
    ICONO[tipo].map((d) => html`<path d="${d}"/>`),
  )}</svg>`;
}

/** El ángulo del centro de cada sector del anillo, en grados (0 a la derecha, 90 abajo). */
export function anguloDe(tipo: TipoDelAnillo): number {
  return -90 + ANILLO.indexOf(tipo) * (360 / ANILLO.length);
}

/** Un punto del plano de la rueda (centro en 0,0) a `r` y `grados`, con dos decimales. */
export function punto(r: number, grados: number): { readonly x: number; readonly y: number } {
  const a = (grados * Math.PI) / 180;
  return { x: Math.round(r * Math.cos(a) * 100) / 100, y: Math.round(r * Math.sin(a) * 100) / 100 };
}

export function xy(r: number, grados: number): string {
  const p = punto(r, grados);
  return `${p.x} ${p.y}`;
}

/** Radios del anillo, en la caja de −110 a 110. */
export const DENTRO = 45;
export const FUERA = 100;
export const BORDE = 104;
/** El radio del círculo de Normal: el que se pinta, el que se tiñe y el que recibe el clic. */
export const RADIO_DEL_CENTRO = DENTRO - 4;
/** Dónde va el centro del rótulo de cada sector del anillo. */
export const SITIO_DEL_ROTULO = 73;

/** Lo que mide de lado la caja de la rueda, de −110 a 110. */
export const LADO_DE_LA_CAJA = 220;
/** Medio sector, menos la junta entre dos. */
export const MEDIO_SECTOR = 360 / ANILLO.length / 2 - 1.2;

/**
 * Las medidas de la rueda en su plano (de −110 a 110), para quien mide desde
 * fuera dónde responde cada sector (`pnpm capturas`, #258): las mismas que
 * trazan `sector` y `formas`.
 */
export const MEDIDAS_DE_LA_RUEDA = {
  dentro: DENTRO,
  fuera: FUERA,
  radioDelCentro: RADIO_DEL_CENTRO,
  medioSector: MEDIO_SECTOR,
  lado: LADO_DE_LA_CAJA,
} as const;

export function sector(tipo: TipoDelAnillo): string {
  const c = anguloDe(tipo);
  const a = c - MEDIO_SECTOR;
  const b = c + MEDIO_SECTOR;
  return `M${xy(FUERA, a)}A${FUERA} ${FUERA} 0 0 1 ${xy(FUERA, b)}L${xy(DENTRO, b)}A${DENTRO} ${DENTRO} 0 0 0 ${xy(DENTRO, a)}Z`;
}

/**
 * Lo que enseña cada tipo del anillo en la rueda de la ficha de un arma, de su
 * fila (`filasDeLaRueda`): su nivel (el tinte, `data-nivel`), lo que da entero (su
 * `<title>`) y en pocas letras (lo que se lee en el sector).
 */
export type TipoEnLaFicha = Pick<FilaDeLaRueda, 'tipo' | 'nivel' | 'final' | 'corto'>;

/**
 * La rueda de un arma en su ficha, solo para leer (18-10-2026, decisión del
 * usuario: se edita en barras y la rueda va al lado): el mismo disco que la del
 * combate (`sector`, `anguloDe`), cada sector teñido por su nivel —el mismo tono
 * para el mismo nivel en toda arma: del rojo del 0 al verde del 6, pasando por el
 * neutro del 3 (`data-nivel`, en `arena.css`)—, con su icono y lo que da. Normal,
 * en el centro, sin nivel ni tinte.
 */
export function ruedaDeLaPieza(filas: readonly TipoEnLaFicha[]): Html {
  const rotulo = (
    tipo: TipoDeGolpe,
    t: Pick<TipoEnLaFicha, 'final' | 'corto'>,
    x: number,
    y: number,
  ): Html =>
    html`<g class="rotulo-en-la-pieza" data-tipo="${tipo}" transform="translate(${String(x)} ${String(y)})"><title>${NOMBRE_DE_GOLPE[tipo]}: ${t.final}</title>
        <g class="icono" transform="translate(-7 -22) scale(0.583)">${unir(ICONO[tipo].map((d) => html`<path d="${d}"/>`))}</g>
        <text class="nombre" y="5" text-anchor="middle">${NOMBRE_DE_GOLPE[tipo]}</text>
        <text class="cifra" y="16" text-anchor="middle">${t.corto}</text></g>`;
  const sectores = unir(
    filas.map(
      (f) =>
        html`<path class="sector" data-sector="${f.tipo}" data-nivel="${String(f.nivel)}" d="${sector(f.tipo)}"/>`,
    ),
  );
  const radios = unir(
    ANILLO.map((t) => {
      const g = anguloDe(t) + 30;
      return html`<path class="radio" d="M${xy(DENTRO - 2, g)}L${xy(BORDE - 1, g)}"/>`;
    }),
  );
  const rotulos = unir(
    filas.map((f) => {
      const p = punto(SITIO_DEL_ROTULO, anguloDe(f.tipo));
      return rotulo(f.tipo, f, p.x, p.y);
    }),
  );
  return html`<svg class="disco rueda-de-la-pieza" viewBox="-110 -110 220 220" role="img" aria-label="La rueda con esta arma: cada tipo, teñido por su nivel, del rojo del 0 al verde del 6">
      <circle class="fondo" r="108"/>
      <circle class="aro" r="${String(BORDE)}"/>
      ${sectores}${radios}
      <circle class="sector centro" data-sector="normal" r="${String(RADIO_DEL_CENTRO)}"/>
      <circle class="aro-de-dentro" r="${String(RADIO_DEL_CENTRO)}"/>
      ${rotulos}${rotulo('normal', NORMAL_EN_LA_FICHA, 0, 4)}
    </svg>`;
}
