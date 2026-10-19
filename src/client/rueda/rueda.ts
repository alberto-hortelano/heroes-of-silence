/**
 * La rueda del golpe, pintada, en la batalla de la partida y en la de la arena (la
 * regla es de `core/battle/rueda.ts`; F5 de la tarea del combate en el juego,
 * 19-10-2026: antes era solo de la arena).
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
 * Solo pinta: elegir y cancelar lo hace la sesión (`CruceDeLaRueda`), y quien
 * conecta los gestos es `dialogo.ts`. Lo que cada página pone de los dos que se
 * cruzan (su figura, su vista previa, su ficha) llega en `CaraDeLosContrincantes`.
 */

import type { SectorDeLaRueda } from '@core/battle/battle.js';
import {
  ANILLO,
  efectoDeGolpe,
  type HechoDelCruce,
  NOMBRE_DE_GOLPE,
  NOMBRE_DEL_PUNTO,
  type PapelEnLaRueda,
  PUNTOS,
  type Punto,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
  type TipoDelAnillo,
} from '@core/battle/rueda.js';
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import { DURACION } from '../anim.js';
import { type Html, html, NADA, unir } from '../html.js';
import { COLOR_BANDO } from '../render/batalla.js';
import type { RuedaPendiente } from '../session.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import { nota } from '../views/panels.js';
import { horquilla } from '../views/prevision.js';
import {
  anguloDe,
  BORDE,
  DENTRO,
  icono,
  LADO_DE_LA_CAJA,
  punto,
  RADIO_DEL_CENTRO,
  SITIO_DEL_ROTULO,
  sector,
  xy,
} from './disco.js';
import { figuraDelContrincante } from './figuras.js';

// Las medidas y el ángulo de cada sector se leen desde aquí (`pnpm capturas`, los tests).
export { anguloDe, MEDIDAS_DE_LA_RUEDA } from './disco.js';

/**
 * Dónde va el «ⓘ» de cada sector del anillo: cerca del borde de fuera y a un
 * lado del centro, donde no pisa el rótulo. Sale del ángulo del sector, no de su
 * tipo: el orden del anillo puede cambiar sin tocar la colocación.
 */
const SITIO_DE_LA_NOTA = { r: 88, desvio: 20 } as const;
/** El «ⓘ» de Normal: arriba a la derecha, dentro de su círculo. */
const NOTA_DEL_CENTRO = { r: 28, grados: -45 } as const;
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
  // La veta alterna por el orden del anillo, no por una lista de tipos en el CSS:
  // con la lista, reordenar el anillo (#263) dejaba dos sectores iguales seguidos.
  const sectores = unir(
    ANILLO.map(
      (t, i) =>
        html`<path class="sector" data-sector="${t}" data-veta="${i % 2 === 0 ? 'mesa' : 'madera'}" d="${sector(t)}"/>`,
    ),
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

/**
 * «7–12» (`horquilla`, la de la previsión), o «2 × 7–12» con más de un golpe; con
 * carga, el primero aparte, que es el único que la cobra: «9–15 + 7–12».
 */
function conSusGolpes(s: SectorDeLaRueda): string {
  if (s.siguientes !== null) {
    const resto = s.golpes - 1;
    return `${horquilla(s.danio)} + ${resto > 1 ? `${resto} × ` : ''}${horquilla(s.siguientes)}`;
  }
  return s.golpes > 1 ? `${s.golpes} × ${horquilla(s.danio)}` : horquilla(s.danio);
}

/** La tecla de cada tipo: su puesto en `TIPOS_DE_GOLPE`, del 1 al 7. */
export function teclaDe(tipo: TipoDeGolpe): string {
  return String(TIPOS_DE_GOLPE.indexOf(tipo) + 1);
}

/** El tipo de una tecla (`teclaDe` al revés), o `null` si no es la de ninguno. */
export function tipoDeLaTecla(tecla: string): TipoDeGolpe | null {
  return TIPOS_DE_GOLPE.find((t) => teclaDe(t) === tecla) ?? null;
}

/**
 * Lo que dice cada sector: el daño o, sin contraataque, «—». Con carga y más de un
 * golpe, el primero y los siguientes en dos líneas («48–91» y «+ 4–16»): en una
 * sola, el de Rápido se salía del sector y se comía un dígito (R5 de QA de #260).
 */
function loQueDa(p: RuedaPendiente, tipo: TipoDeGolpe): Html {
  const s = p.prevision.porTipo?.[tipo];
  if (s === undefined) return html`<span class="da">—</span>`;
  if (s.siguientes === null) return html`<span class="da">${conSusGolpes(s)}</span>`;
  const resto = s.golpes - 1;
  return html`<span class="da">${horquilla(s.danio)}</span><span class="da">+ ${resto > 1 ? `${resto} × ` : ''}${horquilla(s.siguientes)}</span>`;
}

function etiquetaDe(p: RuedaPendiente, tipo: TipoDeGolpe): string {
  const s = p.prevision.porTipo?.[tipo];
  const nombre = `${NOMBRE_DE_GOLPE[tipo]} (tecla ${teclaDe(tipo)})`;
  // Sin contraataque no hay daño que decir: la nota ya lo cuenta.
  if (s === undefined) return `${nombre}. ${notaDe(p, tipo)}`;
  const dano = `${conSusGolpes(s)} de daño${p.fase === 'respuesta' ? ' al devolver el golpe' : ''}`;
  return `${nombre}: ${dano}. ${notaDe(p, tipo)}`;
}

/**
 * La nota del sector: lo que hace el tipo para quien elige ahora, con las cifras
 * de su arma (`efectoDeGolpe`, `previsionDeLaRueda().rueda`), y en una respuesta
 * que no devolverá el golpe, solo lo que vale: el cruce. Todo lo demás de la respuesta va con el contraataque.
 */
function notaDe(p: RuedaPendiente, tipo: TipoDeGolpe): string {
  return `${efectoDeGolpe(tipo, p.fase, p.prevision.sinContraataque === null, p.prevision.rueda)}${contraataqueRebajado(p, tipo)}`;
}

/**
 * Al golpear con un tipo que rebaja el contraataque del rival (Romper guardia),
 * en cuánto quedaría con cada éxito que lo cambia, frente al de Normal (R3 de QA
 * de #263: antes de elegir no se veía). Sale de `previsionDeLaRueda`, la misma
 * cuenta que el golpe; si no hay nada que decir, vacío.
 */
function contraataqueRebajado(p: RuedaPendiente, tipo: TipoDeGolpe): string {
  const s = p.prevision.porTipo?.[tipo];
  const ahora = p.prevision.contraataque;
  if (s === undefined || ahora === null || s.contraataquePorExito.length === 0) return '';
  const porExito = s.contraataquePorExito
    .map(({ punto, danio }) => `${NOMBRE_DEL_PUNTO[punto]}, ${horquilla(danio)}`)
    .join('; ');
  return ` Su contraataque (con ${NOMBRE_DE_GOLPE.normal}, ${horquilla(ahora)}) queda, según el éxito, en: ${porExito}.`;
}

/** El círculo del color de un bando, para decir de quién se habla. */
function chapa(side: Side): Html {
  return html`<svg class="chapa" viewBox="-6 -6 12 12" aria-hidden="true" focusable="false"><circle r="5" fill="${COLOR_BANDO[side]}"/></svg>`;
}

/**
 * Lo que cada página pone de los dos que se cruzan en la cabecera de la rueda: con
 * varias unidades iguales el nombre no dice cuál es (#261). La arena pone su figura
 * animada y, en la rueda para elegir, un botón que abre su ficha con su vista
 * previa (`arena/main.ts`); la partida, de momento, solo la chapa y el nombre.
 */
export interface CaraDeLosContrincantes {
  /**
   * Lo que va alrededor de la figura de uno de los dos (`figura`, la común,
   * `figuraDelContrincante`). `nombre` es el suyo en el campo; `paraElegir`, si es
   * la rueda para elegir (en el desenlace, solo la figura: lo que se abriera ahí
   * quedaría debajo de la rueda de la fase siguiente).
   */
  icono(x: BattleStack, nombre: string, paraElegir: boolean, figura: Html): Html;
}

/**
 * Uno de los dos: su figura (con lo que ponga la página alrededor, `cara`), la
 * chapa de su bando y su nombre en el campo. Con `quienMira`, el bando de quien
 * mira (la sesión, `SesionConRueda.quienMira`), cada uno se marca «tú» o «rival».
 */
function contrincante(
  battle: BattleState,
  x: BattleStack,
  quienMira: Side | null,
  cara: CaraDeLosContrincantes | null,
  paraElegir: boolean,
): Html {
  const nombre = nombreEnElCampo(battle, x);
  const figura = figuraDelContrincante(x);
  const icono =
    cara?.icono(x, nombre, paraElegir, figura) ??
    html`<span class="icono-de-contrincante">${figura}</span>`;
  const deQuien =
    quienMira === null
      ? NADA
      : html` <span class="de-quien">(${x.side === quienMira ? 'tú' : 'rival'})</span>`;
  return html`<span class="contrincante" data-contrincante="${x.id}">${icono}<span class="quien">${chapa(x.side)}<span class="nombre-del-contrincante">${nombre}</span>${deQuien}</span></span>`;
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
  quienMira: Side | null,
  cara: CaraDeLosContrincantes | null,
  paraElegir: boolean,
): Html {
  return html`<header class="cabecera-de-rueda">
      <h2 id="titulo-de-la-rueda">${titulo}</h2>
      <div class="quienes">${contrincante(battle, atacante, quienMira, cara, paraElegir)}<span class="hacia"><span class="ataca">ataca a</span>${contrincante(battle, objetivo, quienMira, cara, paraElegir)}</span></div>
    </header>`;
}

/** Hacia dónde se abre el bocadillo de una nota de la rueda: hacia fuera de ella. */
type HaciaFuera = 'arriba' | 'derecha' | 'abajo' | 'izquierda';

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
        html`<div class="sector-de-rueda" data-sector="${t}"${atributos(t)} data-hacia="${t === 'normal' ? 'abajo' : haciaDe(anguloDe(t))}">${dentro(t)}</div>`,
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
 * (`formas`), y su efecto, una nota al lado. `quienMira`, el bando de quien mira
 * (`SesionConRueda.quienMira`); de `cara`, lo que la página pone alrededor de la
 * figura de cada uno (`CaraDeLosContrincantes`).
 */
export function renderEleccion(
  battle: BattleState,
  p: RuedaPendiente,
  quienMira: Side | null,
  cara: CaraDeLosContrincantes | null,
): Html {
  const golpe = p.fase === 'golpe';
  // Si quien elige es quien mira: «Tu golpe»; si no (la arena con los dos bandos
  // de la persona), por su lado.
  const titulo =
    quienMira === p.bando
      ? html`${golpe ? 'Tu golpe' : 'Tu respuesta'}`
      : golpe
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
          <span class="rotulo-del-sector">${rotuloDe(t)}${loQueDa(p, t)}</span>
        </button>${nota(notaDe(p, t))}`,
    () => html` data-abre-nota`,
  );
  return html`<div class="rueda" data-fase="${p.fase}" data-bando="${p.bando}">
    ${cabecera(battle, titulo, p.atacante, p.objetivo, quienMira, cara, true)}
    <div class="plato">
      ${formas()}
      <div class="giro">${disco(p.bando)}${sectores}</div>
    </div>
    <footer class="pie-de-rueda">
      <p class="guia">${guia}</p>
      ${
        // Tras una carrera, las cifras ya llevan la carga, y Escape la pierde (R6 de QA de #260).
        p.prevision.carga === null
          ? NADA
          : html`<p class="carga-de-la-rueda" data-carga>Las cifras llevan la ${p.prevision.carga}; con <kbd>Esc</kbd> se pierde.</p>`
      }
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
function anguloDeLaMarca(tipo: TipoDelAnillo, papel: 'golpe' | 'respuesta'): number {
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
  // Una recta del centro a la marca del que no eligió Normal.
  const desdeElCentro = (g: number): string => `M${xy(RADIO_DEL_CENTRO, g)}L${xy(BORDE, g)}`;
  let d: string;
  if (golpe !== 'normal' && respuesta !== 'normal') {
    const a = anguloDeLaMarca(golpe, 'golpe');
    const b = anguloDeLaMarca(respuesta, 'respuesta');
    const delta = ((b - a + 540) % 360) - 180;
    d = `M${xy(BORDE, a)}A${BORDE} ${BORDE} 0 0 ${delta >= 0 ? 1 : 0} ${xy(BORDE, b)}`;
  } else if (golpe !== 'normal') {
    d = desdeElCentro(anguloDeLaMarca(golpe, 'golpe'));
  } else if (respuesta !== 'normal') {
    d = desdeElCentro(anguloDeLaMarca(respuesta, 'respuesta'));
  } else {
    const r = RADIO_DEL_CENTRO;
    d = `M${xy(r, -90)}A${r} ${r} 0 0 1 ${xy(r, 90)}A${r} ${r} 0 0 1 ${xy(r, -90)}`;
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
 * retrasa la caída del de la respuesta (`rueda.css`).
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
    PUNTOS.map(
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
  quienMira: Side | null,
  cara: CaraDeLosContrincantes | null,
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
    ${cabecera(battle, titulo, atacante, objetivo, quienMira, cara, false)}
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
