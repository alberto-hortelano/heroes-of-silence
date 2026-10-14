/**
 * La rueda del golpe, pintada (la arena con «Golpe: rueda»; la regla es de
 * `core/battle/rueda.ts`).
 *
 * Es un `<dialog id="rueda">` modal sobre el lienzo, con dos caras:
 *
 * - **Elegir** (`renderEleccion`): el anillo con sus seis tipos y Normal en el
 *   centro, en la disposición de la petición, cada sector con su icono, su nombre,
 *   lo que daría (`previsionDeLaRueda`) y su efecto en una nota. Elige quien pega
 *   o quien responde, y nunca se ve lo que eligió el otro: lo que llega aquí es
 *   `RuedaPendiente`, que no lo lleva.
 * - **El desenlace** (`renderDesenlace`): la rueda gira y se para, caen los dos
 *   marcadores del color de cada bando en sus sectores, se enciende el arco entre
 *   ellos, y el medidor de cinco muescas marca el golpe y el contraataque con un
 *   rótulo. El reloj es el del animador (`DURACION.cruce`): aquí solo se pinta UNA
 *   vez por cruce, y `tramosDelDesenlace` dice qué tramos lleva; el CSS anima
 *   dentro de cada uno, con duraciones en fracciones de ese mismo reloj
 *   (`--cruce`, `ajustarLaRueda`). Repintar cada fotograma reiniciaría las
 *   animaciones.
 *
 * Solo pinta: elegir y cancelar lo hace la sesión (`SesionDeArena`), y quien
 * conecta los gestos es `main.ts`.
 */

import { ladoDe } from '@core/arena.js';
import {
  ANILLO,
  efectoDeGolpe,
  type HechoDelCruce,
  NOMBRE_DE_GOLPE,
  NOMBRE_DEL_PUNTO,
  type PapelEnLaRueda,
  type Punto,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
} from '@core/battle/rueda.js';
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import { DURACION } from '../anim.js';
import { type Html, html, NADA, unir } from '../html.js';
import { COLOR_BANDO } from '../render/batalla.js';
import type { RuedaPendiente } from '../session.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import { nota } from '../views/panels.js';
import { horquilla } from '../views/prevision.js';
import { type VistaDeArena, vistaPrevia } from './paneles.js';

/**
 * Los iconos, dibujados (sin arte generado): trazos en una caja de 24, con el
 * color del texto. Cada uno dice su golpe de un vistazo: el rayo es rápido, el
 * escudo defiende, la flecha que se tuerce engaña, el martillo pega fuerte, el
 * escudo partido rompe la guardia, la espada ataca y la balanza no se inclina.
 */
const ICONO: Readonly<Record<TipoDeGolpe, readonly string[]>> = {
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

function icono(tipo: TipoDeGolpe): Html {
  return html`<svg class="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${unir(
    ICONO[tipo].map((d) => html`<path d="${d}"/>`),
  )}</svg>`;
}

/** El ángulo del centro de cada sector del anillo, en grados (0 a la derecha, 90 abajo). */
export function anguloDe(tipo: TipoDeGolpe): number {
  const i = ANILLO.indexOf(tipo);
  if (i < 0) throw new Error(`«${tipo}» no está en el anillo de la rueda`);
  return -90 + i * (360 / ANILLO.length);
}

/** Un punto del plano de la rueda (centro en 0,0) a `r` y `grados`, con dos decimales. */
function punto(r: number, grados: number): { readonly x: number; readonly y: number } {
  const a = (grados * Math.PI) / 180;
  return { x: Math.round(r * Math.cos(a) * 100) / 100, y: Math.round(r * Math.sin(a) * 100) / 100 };
}

function xy(r: number, grados: number): string {
  const p = punto(r, grados);
  return `${p.x} ${p.y}`;
}

/** Radios del anillo, en la caja de −110 a 110. */
const DENTRO = 45;
const FUERA = 100;
const BORDE = 104;
/** El radio del círculo de Normal: el que se pinta, el que se tiñe y el que recibe el clic. */
const RADIO_DEL_CENTRO = DENTRO - 4;
/** Dónde va el centro del rótulo de cada sector del anillo. */
const SITIO_DEL_ROTULO = 73;
/**
 * Dónde va el «ⓘ» de cada sector del anillo: cerca del borde de fuera y a un
 * lado del centro, donde no pisa el rótulo. Sale del ángulo del sector, no de su
 * tipo: el orden del anillo puede cambiar sin tocar la colocación.
 */
const SITIO_DE_LA_NOTA = { r: 88, desvio: 20 } as const;
/** El «ⓘ» de Normal: arriba a la derecha, dentro de su círculo. */
const NOTA_DEL_CENTRO = { r: 28, grados: -45 } as const;
/** Lo que mide de lado la caja de la rueda, de −110 a 110. */
const LADO_DE_LA_CAJA = 220;
/** Medio sector, menos la junta entre dos. */
const MEDIO_SECTOR = 360 / ANILLO.length / 2 - 1.2;

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

function sector(tipo: TipoDeGolpe): string {
  const c = anguloDe(tipo);
  const a = c - MEDIO_SECTOR;
  const b = c + MEDIO_SECTOR;
  return `M${xy(FUERA, a)}A${FUERA} ${FUERA} 0 0 1 ${xy(FUERA, b)}L${xy(DENTRO, b)}A${DENTRO} ${DENTRO} 0 0 0 ${xy(DENTRO, a)}Z`;
}

/** El id del `<clipPath>` del sector `tipo`, el que recorta su botón. */
export function idDeLaForma(tipo: TipoDeGolpe): string {
  return `forma-de-${tipo}`;
}

/**
 * Un `<clipPath>` por tipo, para recortar cada botón (que mide el plato entero)
 * a su sector: así responde al ratón toda la superficie que se ve y solo esa
 * (#258; con una caja ovalada en el centro de cada sector, las esquinas de la
 * corona no respondían). La forma es la misma que pinta el disco: `sector` o el
 * círculo de `RADIO_DEL_CENTRO`. En `objectBoundingBox` la caja del botón va de 0
 * a 1 y el plano de la rueda de −110 a 110; la transformación lleva el uno al
 * otro. Cada `clip-path` lo pone `ajustarLaRueda`. Solo en la rueda para elegir:
 * los ids son únicos en la página.
 */
function formas(): Html {
  const medio = LADO_DE_LA_CAJA / 2;
  const aLaCaja = `scale(${1 / LADO_DE_LA_CAJA}) translate(${medio} ${medio})`;
  return html`<svg class="formas" width="0" height="0" aria-hidden="true" focusable="false"><defs>${unir(
    TIPOS_DE_GOLPE.map(
      (t) =>
        html`<clipPath id="${idDeLaForma(t)}" clipPathUnits="objectBoundingBox">${
          t === 'normal'
            ? html`<circle transform="${aLaCaja}" r="${String(RADIO_DEL_CENTRO)}"/>`
            : html`<path transform="${aLaCaja}" d="${sector(t)}"/>`
        }</clipPath>`,
    ),
  )}</defs></svg>`;
}

/**
 * El disco de debajo: el fondo, los seis sectores, el centro y el aro; con
 * `elige`, el aro del bando que elige, que late.
 */
function disco(elige: Side | null): Html {
  const sectores = unir(
    ANILLO.map((t) => html`<path class="sector" data-sector="${t}" d="${sector(t)}"/>`),
  );
  // Las líneas finas del dibujo: los radios entre sectores, como en una rueda.
  const radios = unir(
    ANILLO.map((t) => {
      const g = anguloDe(t) + 30;
      return html`<path class="radio" d="M${xy(DENTRO - 2, g)}L${xy(BORDE - 1, g)}"/>`;
    }),
  );
  return html`<svg class="disco" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
      <circle class="fondo" r="108"/>
      <circle class="aro" r="${BORDE}"/>
      ${sectores}${radios}
      <circle class="sector centro" data-sector="normal" r="${String(RADIO_DEL_CENTRO)}"/>
      <circle class="aro-de-dentro" r="${String(RADIO_DEL_CENTRO)}"/>
      ${elige === null ? NADA : html`<circle class="aro-del-bando" r="${String(BORDE + 2.5)}" stroke="${COLOR_BANDO[elige]}"/>`}
    </svg>`;
}

/** «7–12» (`horquilla`, la de la previsión), o «2 × 7–12» con más de un golpe. */
function conSusGolpes(d: { readonly min: number; readonly max: number }, golpes: number): string {
  return golpes > 1 ? `${golpes} × ${horquilla(d)}` : horquilla(d);
}

/** La tecla de cada tipo: su puesto en `TIPOS_DE_GOLPE`, del 1 al 7. */
export function teclaDe(tipo: TipoDeGolpe): string {
  return String(TIPOS_DE_GOLPE.indexOf(tipo) + 1);
}

/** El tipo de una tecla (`teclaDe` al revés), o `null` si no es la de ninguno. */
export function tipoDeLaTecla(tecla: string): TipoDeGolpe | null {
  return TIPOS_DE_GOLPE.find((t) => teclaDe(t) === tecla) ?? null;
}

/** Lo que dice la barra de cada sector: el daño o, sin contraataque, nada. */
function loQueDa(p: RuedaPendiente, tipo: TipoDeGolpe): string {
  const s = p.prevision.porTipo?.[tipo];
  return s === undefined ? '—' : conSusGolpes(s.danio, s.golpes);
}

function etiquetaDe(p: RuedaPendiente, tipo: TipoDeGolpe): string {
  const s = p.prevision.porTipo?.[tipo];
  const nombre = `${NOMBRE_DE_GOLPE[tipo]} (tecla ${teclaDe(tipo)})`;
  // Sin contraataque no hay daño que decir: la nota ya lo cuenta.
  if (s === undefined) return `${nombre}. ${notaDe(p, tipo)}`;
  const dano = `${conSusGolpes(s.danio, s.golpes)} de daño${p.fase === 'respuesta' ? ' al devolver el golpe' : ''}`;
  return `${nombre}: ${dano}. ${notaDe(p, tipo)}`;
}

/**
 * La nota del sector: lo que hace el tipo para quien elige ahora
 * (`efectoDeGolpe`), y en una respuesta que no devolverá el golpe, solo lo que
 * vale: el cruce. Todo lo demás de la respuesta va con el contraataque.
 */
function notaDe(p: RuedaPendiente, tipo: TipoDeGolpe): string {
  return efectoDeGolpe(tipo, p.fase, p.prevision.sinContraataque === null);
}

/** El círculo del color de un bando, para decir de quién se habla. */
function chapa(side: Side): Html {
  return html`<svg class="chapa" viewBox="-6 -6 12 12" aria-hidden="true" focusable="false"><circle r="5" fill="${COLOR_BANDO[side]}"/></svg>`;
}

/**
 * La figura de quien se cruza, la misma del botón del puesto en el montaje
 * (`canvas.figura`, que anima `main.ts` y tiñe del color de su bando por
 * `data-lado`): con varias unidades iguales el nombre no dice cuál es (#261).
 */
function figuraDe(x: BattleStack): Html {
  return html`<canvas class="figura" data-figura="${x.body}" data-lado="${ladoDe(x.side)}" width="80" height="96" aria-hidden="true"></canvas>`;
}

/**
 * Uno de los dos: su figura, la chapa de su bando y su nombre en el campo. Con
 * `vista` (la rueda para elegir), la figura es un botón que abre su ficha de solo
 * lectura (`ficha-en-la-rueda`, `main.ts`) y, al pasar el ratón o con el foco del
 * teclado, su vista previa (`vistaPrevia`: del estado, nunca lo elegido, que va
 * a ciegas en la sesión). En el desenlace, solo la figura: la ficha abierta ahí
 * quedaría debajo de la rueda de la fase siguiente.
 */
function contrincante(battle: BattleState, x: BattleStack, vista: VistaDeArena | null): Html {
  const nombre = nombreEnElCampo(battle, x);
  const previa = `previa-${x.id}`;
  const icono =
    vista === null
      ? html`<span class="icono-de-contrincante">${figuraDe(x)}</span>`
      : html`<button type="button" class="icono-de-contrincante" data-arena="ficha-en-la-rueda" data-stack="${x.id}" aria-label="${`Ficha de ${nombre}`}" aria-describedby="${previa}">${figuraDe(x)}</button><div class="vista-previa" id="${previa}" role="tooltip">${vistaPrevia(vista, x)}</div>`;
  return html`<span class="contrincante" data-contrincante="${x.id}">${icono}<span class="quien">${chapa(x.side)}<span class="nombre-del-contrincante">${nombre}</span></span></span>`;
}

const LADO: Readonly<Record<Side, string>> = { attacker: 'izquierdo', defender: 'derecho' };

/**
 * La cabecera de las dos caras: el título y quién pega a quién, siempre en ese
 * orden («Orco ataca a Templario»), también cuando elige quien recibe, cada uno
 * con su figura (`contrincante`). «ataca a» va pegado al objetivo: al partirse la
 * línea en un móvil no queda suelto. Un `<div>` y no un `<p>`: la vista previa
 * lleva filas en bloque, y dentro de un `<p>` el analizador lo cerraba antes.
 */
function cabecera(
  battle: BattleState,
  titulo: Html,
  atacante: BattleStack,
  objetivo: BattleStack,
  vista: VistaDeArena | null,
): Html {
  return html`<header class="cabecera-de-rueda">
      <h2 id="titulo-de-la-rueda">${titulo}</h2>
      <div class="quienes">${contrincante(battle, atacante, vista)}<span class="hacia"><span class="ataca">ataca a</span>${contrincante(battle, objetivo, vista)}</span></div>
    </header>`;
}

/** Hacia dónde se abre el bocadillo de una nota de la rueda: hacia fuera de ella. */
export type HaciaFuera = 'arriba' | 'derecha' | 'abajo' | 'izquierda';

/**
 * Hacia fuera de la rueda desde `grados` (0 a la derecha, 90 abajo): el lado más
 * cercano, para que el bocadillo no tape su sector. De −135 a −45, arriba, y así
 * de cuarto en cuarto (los bordes, al siguiente en el sentido de las agujas).
 */
export function haciaDe(grados: number): HaciaFuera {
  const g = (((grados + 45) % 360) + 360) % 360;
  if (g < 90) return 'derecha';
  if (g < 180) return 'abajo';
  if (g < 270) return 'izquierda';
  return 'arriba';
}

/**
 * Los siete sitios de la rueda, uno por tipo: cada uno, una capa del plato entero
 * con lo que ponga `dentro`. Lo coloca `ajustarLaRueda` desde el ángulo de su
 * sector en el anillo (`sitioEnLaRueda`), y `data-hacia` dice hacia dónde abre su
 * nota. Nada de la colocación va por tipo: si cambia el orden del anillo, todo
 * sigue a su sector. `atributos`, lo que lleva cada sitio además de su tipo.
 */
function sitios(dentro: (t: TipoDeGolpe) => Html, atributos: (t: TipoDeGolpe) => Html): Html {
  return unir(
    TIPOS_DE_GOLPE.map(
      (t) =>
        html`<div class="sector-de-rueda en-${t}" data-sector="${t}"${atributos(t)} data-hacia="${t === 'normal' ? 'abajo' : haciaDe(anguloDe(t))}">${dentro(t)}</div>`,
    ),
  );
}

/** Lo que se ve de un tipo: su icono y su nombre. */
function rotuloDe(t: TipoDeGolpe): Html {
  return html`${icono(t)}<span class="nombre">${NOMBRE_DE_GOLPE[t]}</span>`;
}

/**
 * La rueda para elegir. En la fase `golpe` elige quien pega; en `respuesta`,
 * quien recibe, que no ve el golpe. Los sectores son botones (`data-golpe`, con
 * la tecla en su etiqueta) del tamaño del plato, recortados a su sector
 * (`formas`), y su efecto, una nota al lado. De `s`, la sesión, sale la vista
 * previa de los dos.
 */
export function renderEleccion(s: VistaDeArena, p: RuedaPendiente): Html {
  const golpe = p.fase === 'golpe';
  const titulo = golpe
    ? html`Golpe del bando ${LADO[p.bando]}`
    : html`Respuesta del bando ${LADO[p.bando]}`;
  const guia = golpe
    ? 'Elige cómo golpear. El rival elige a la vez, sin ver el tuyo: cuanto más lejos en la rueda, más daño.'
    : p.prevision.sinContraataque === null
      ? 'Elige tu respuesta sin ver su golpe: si lo aciertas recibes el mínimo y devuelves el máximo.'
      : `No devolverá el golpe (${p.prevision.sinContraataque}): la respuesta solo cuenta para el cruce.`;
  // El sector abre su nota también al pasar por él (`[data-abre-nota]`, style.css).
  const sectores = sitios(
    (
      t,
    ) => html`<button type="button" data-golpe="${t}" aria-label="${etiquetaDe(p, t)}" aria-keyshortcuts="${teclaDe(t)}">
          <span class="rotulo-del-sector">${rotuloDe(t)}<span class="da">${loQueDa(p, t)}</span></span>
        </button>${nota(notaDe(p, t))}`,
    () => html` data-abre-nota`,
  );
  return html`<div class="rueda" data-fase="${p.fase}" data-bando="${p.bando}">
    ${cabecera(s.battle, titulo, p.atacante, p.objetivo, s)}
    <div class="plato">
      ${formas()}
      <div class="giro">${disco(p.bando)}${sectores}</div>
    </div>
    <footer class="pie-de-rueda">
      <p class="guia">${guia}</p>
      <p class="teclas"><kbd>1</kbd>–<kbd>7</kbd> o <kbd>←</kbd><kbd>→</kbd> e <kbd>Intro</kbd>${golpe ? html` · <kbd>Esc</kbd> cancela` : NADA}</p>
    </footer>
  </div>`;
}

/** Los tramos del desenlace, en orden, con la fracción del paso en que empieza cada uno. */
const TRAMOS: readonly (readonly [string, number])[] = [
  ['giro', 0],
  ['marcas', 0.33],
  ['arco', 0.45],
  ['rotulo', 0.57],
];

/**
 * Los tramos del desenlace que ya han empezado en la fracción `t`, separados por
 * espacios («giro marcas»): van en `data-tramo` y el CSS los lee con `~=`, así
 * que lo ya pasado se queda puesto y su animación no se reinicia.
 */
export function tramosDelDesenlace(t: number): string {
  return TRAMOS.filter(([, desde]) => t >= desde)
    .map(([nombre]) => nombre)
    .join(' ');
}

/** El ángulo en que se posa el marcador de un papel en un sector del anillo: a un lado del centro. */
function anguloDeLaMarca(tipo: TipoDeGolpe, papel: 'golpe' | 'respuesta'): number {
  return anguloDe(tipo) + (papel === 'golpe' ? -13 : 13);
}

/** Dónde se posa el marcador de un papel: en el aro, o en el borde del centro si es Normal. */
function dondeCae(tipo: TipoDeGolpe, papel: 'golpe' | 'respuesta'): { x: number; y: number } {
  if (tipo === 'normal') return punto(RADIO_DEL_CENTRO, -90 + (papel === 'golpe' ? -42 : 42));
  return punto(BORDE, anguloDeLaMarca(tipo, papel));
}

/**
 * El arco entre los dos marcadores: por el aro, por el lado corto, que es la
 * distancia que fija el punto; con Normal, una recta del centro a la marca del
 * otro; los dos en Normal, el borde del centro. `data-punto` le da el color.
 */
function arco(golpe: TipoDeGolpe, respuesta: TipoDeGolpe, p: Punto): Html {
  let d: string;
  if (golpe === 'normal' && respuesta === 'normal') {
    const r = RADIO_DEL_CENTRO;
    d = `M${xy(r, -90)}A${r} ${r} 0 0 1 ${xy(r, 90)}A${r} ${r} 0 0 1 ${xy(r, -90)}`;
  } else if (golpe === 'normal' || respuesta === 'normal') {
    const [otro, papel] =
      golpe === 'normal' ? [respuesta, 'respuesta' as const] : [golpe, 'golpe' as const];
    const g = anguloDeLaMarca(otro, papel);
    d = `M${xy(RADIO_DEL_CENTRO, g)}L${xy(BORDE, g)}`;
  } else {
    const a = anguloDeLaMarca(golpe, 'golpe');
    const b = anguloDeLaMarca(respuesta, 'respuesta');
    const delta = ((b - a + 540) % 360) - 180;
    d = `M${xy(BORDE, a)}A${BORDE} ${BORDE} 0 0 ${delta >= 0 ? 1 : 0} ${xy(BORDE, b)}`;
  }
  return html`<path class="arco" data-punto="${String(p)}" pathLength="1" d="${d}"/>`;
}

/** El sector elegido, teñido del color de quien lo eligió. */
function tinte(tipo: TipoDeGolpe, side: Side): Html {
  return tipo === 'normal'
    ? html`<circle class="tinte" r="${String(RADIO_DEL_CENTRO)}" fill="${COLOR_BANDO[side]}"/>`
    : html`<path class="tinte" d="${sector(tipo)}" fill="${COLOR_BANDO[side]}"/>`;
}

/**
 * Un marcador: el disco del color de su bando, que cae a su sitio. `data-papel`
 * retrasa la caída del de la respuesta (arena.css).
 */
function marcador(side: Side, en: { x: number; y: number }, papel: PapelEnLaRueda): Html {
  return html`<g transform="translate(${String(en.x)} ${String(en.y)})"><g class="marca" data-papel="${papel}">
      <circle class="halo" r="10" fill="${COLOR_BANDO[side]}"/>
      <circle r="6.5" fill="${COLOR_BANDO[side]}" class="cuerpo"/>
    </g></g>`;
}

/** Lo que se lee en el rótulo: del punto, para quien pega. */
const ROTULO: Readonly<Record<Punto, string>> = {
  0: '¡Parado! Mínimo',
  1: 'Bajo',
  2: 'Medio',
  3: '¡Alto!',
  4: '¡Máximo!',
};

/** El medidor de cinco muescas, con la aguja del golpe arriba y la del contraataque abajo. */
function medidor(
  e: HechoDelCruce,
  contraataque: Punto | null,
  atacante: Side,
  objetivo: Side,
): Html {
  const x = (p: Punto): number => 20 + p * 50;
  const muescas = unir(
    ([0, 1, 2, 3, 4] as const).map(
      (p) =>
        html`<g data-punto="${String(p)}" class="muesca${p === e.punto ? ' del-golpe' : ''}${p === contraataque ? ' del-contraataque' : ''}">
          <circle cx="${String(x(p))}" cy="22" r="5.5"/>
          <text x="${String(x(p))}" y="54">${NOMBRE_DEL_PUNTO[p]}</text>
        </g>`,
    ),
  );
  const aguja = (p: Punto, side: Side, arriba: boolean): Html =>
    html`<path class="aguja" fill="${COLOR_BANDO[side]}" d="${
      arriba ? `M${x(p) - 6} 4h12l-6 9z` : `M${x(p) - 6} 40h12l-6 -9z`
    }"/>`;
  return html`<svg class="medidor" viewBox="0 0 240 60" role="img" aria-label="${`Golpe en el ${NOMBRE_DEL_PUNTO[e.punto]}${contraataque === null ? '' : `, contraataque en el ${NOMBRE_DEL_PUNTO[contraataque]}`}`}">
      <rect class="pista" x="16" y="19" width="208" height="6" rx="3"/>
      <rect class="encendida" data-punto="${String(e.punto)}" x="16" y="19" width="${String(x(e.punto) - 12)}" height="6" rx="3"/>
      ${muescas}
      ${aguja(e.punto, atacante, true)}
      ${contraataque === null ? NADA : aguja(contraataque, objetivo, false)}
    </svg>`;
}

/**
 * El desenlace de un cruce: los dos tipos ya a la vista, los marcadores, el arco,
 * el medidor y el rótulo. `contraataque`, el punto del contraataque que de verdad
 * hubo (`contraataqueDelCruce`), o `null`.
 */
export function renderDesenlace(
  battle: BattleState,
  e: HechoDelCruce,
  contraataque: Punto | null,
): Html {
  const atacante = battle.stacks.find((s) => s.id === e.stack);
  const objetivo = battle.stacks.find((s) => s.id === e.target);
  if (atacante === undefined || objetivo === undefined) {
    throw new Error(
      `la rueda cuenta un cruce de ${e.stack} a ${e.target}, que no están en el campo`,
    );
  }
  // Qué sector eligió cada papel: lo leen los tests y `pnpm capturas`, que
  // comprueban que la respuesta se elige sin verlo.
  const elegido: Partial<Record<TipoDeGolpe, string>> = { [e.golpe]: 'golpe' };
  elegido[e.respuesta] = e.respuesta === e.golpe ? 'los-dos' : 'respuesta';
  const etiquetas = sitios(
    (t) => html`<span class="rotulo-del-sector">${rotuloDe(t)}</span>`,
    (t) => html` data-elegido="${elegido[t] ?? ''}"`,
  );
  const contra =
    contraataque === null
      ? 'sin contraataque'
      : html`contraataque <strong data-punto="${String(contraataque)}">${NOMBRE_DEL_PUNTO[contraataque]}</strong>`;
  const titulo = html`<span class="mientras-gira">La rueda gira…</span><span class="cuando-para">${NOMBRE_DE_GOLPE[e.golpe]} contra ${NOMBRE_DE_GOLPE[e.respuesta]}</span>`;
  return html`<div class="rueda" data-fase="desenlace">
    ${cabecera(battle, titulo, atacante, objetivo, null)}
    <div class="plato">
      <div class="giro">${disco(null)}${etiquetas}</div>
      <svg class="marcas" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
        ${tinte(e.golpe, atacante.side)}
        ${tinte(e.respuesta, objetivo.side)}
        ${arco(e.golpe, e.respuesta, e.punto)}
        ${marcador(atacante.side, dondeCae(e.golpe, 'golpe'), 'golpe')}
        ${marcador(objetivo.side, dondeCae(e.respuesta, 'respuesta'), 'respuesta')}
      </svg>
    </div>
    <footer class="pie-de-rueda">
      <p class="rotulo" data-punto="${String(e.punto)}" role="status">${ROTULO[e.punto]}</p>
      ${medidor(e, contraataque, atacante.side, objetivo.side)}
      <p class="contraataque">${contra}</p>
    </footer>
  </div>`;
}

/**
 * Dónde va lo de cada sector, en el plano de la rueda: el centro de su rótulo y
 * su «ⓘ», desde el ángulo de su sector en `ANILLO` (Normal, en el centro).
 */
export function sitioEnLaRueda(tipo: TipoDeGolpe): {
  readonly rotulo: { readonly x: number; readonly y: number };
  readonly nota: { readonly x: number; readonly y: number };
} {
  if (tipo === 'normal') {
    return { rotulo: { x: 0, y: 0 }, nota: punto(NOTA_DEL_CENTRO.r, NOTA_DEL_CENTRO.grados) };
  }
  const g = anguloDe(tipo);
  return {
    rotulo: punto(SITIO_DEL_ROTULO, g),
    nota: punto(SITIO_DE_LA_NOTA.r, g + SITIO_DE_LA_NOTA.desvio),
  };
}

/**
 * Lo que el marcado no lleva y se pone con `style` tras pintar (un hueco `style`
 * no se escribe con `html.ts`): el reloj del desenlace (`--cruce`, el de
 * `DURACION.cruce`, del que el CSS saca cada animación en fracciones), el sitio
 * de lo de cada sector (`sitioEnLaRueda`: `--x`, `--y` el rótulo; `--nx`, `--ny`
 * el «ⓘ») y el recorte de cada botón a su sector (`clip-path`, al `<clipPath>`
 * de `formas`). Un botón sin su forma recibiría el clic en el plato entero y se
 * comería los de debajo: eso lanza.
 */
export function ajustarLaRueda(dialogo: HTMLElement): void {
  dialogo.style.setProperty('--cruce', `${DURACION.cruce}ms`);
  const enPorcentaje = (v: number): string => `${50 + (v * 100) / LADO_DE_LA_CAJA}%`;
  for (const t of TIPOS_DE_GOLPE) {
    const sitio = dialogo.querySelector<HTMLElement>(`.sector-de-rueda[data-sector="${t}"]`);
    if (sitio === null) continue;
    const { rotulo, nota: delInfo } = sitioEnLaRueda(t);
    sitio.style.setProperty('--x', enPorcentaje(rotulo.x));
    sitio.style.setProperty('--y', enPorcentaje(rotulo.y));
    sitio.style.setProperty('--nx', enPorcentaje(delInfo.x));
    sitio.style.setProperty('--ny', enPorcentaje(delInfo.y));
    const boton = sitio.querySelector<HTMLElement>('button[data-golpe]');
    if (boton === null) continue;
    const id = idDeLaForma(t);
    if (dialogo.querySelector(`clipPath[id="${id}"]`) === null) {
      throw new Error(`el sector ${NOMBRE_DE_GOLPE[t]} de la rueda no tiene su forma (#${id})`);
    }
    boton.style.clipPath = `url(#${id})`;
  }
}
