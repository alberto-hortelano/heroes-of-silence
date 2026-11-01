/**
 * La rueda del golpe, pintada, en la batalla de la partida y en la de la arena (la
 * regla es de `core/battle/rueda.ts`; F5 de la tarea del combate en el juego,
 * 19-10-2026: antes era solo de la arena).
 *
 * Es un `<dialog id="rueda">` modal sobre el lienzo, con dos caras:
 *
 * - **Elegir** (`renderEleccion`): el anillo con los tipos de la rueda de la
 *   batalla (`BattleState.rueda`: 6, 4 o 3) y Normal en el centro si lo lleva, en
 *   la disposición de la petición, cada sector con su icono, su nombre,
 *   lo que daría (`previsionDeLaRueda`) y su efecto en una nota. Elige quien pega
 *   o quien responde, y nunca se ve lo que eligió el otro: lo que llega aquí es
 *   `RuedaPendiente`, que no lo lleva.
 * - **El desenlace** (`renderDesenlace`): la rueda gira y se para, caen los dos
 *   marcadores del color de cada bando en sus sectores, se enciende el arco entre
 *   ellos, y el medidor (una muesca por punto que da el cruce) marca el golpe y el contraataque con un
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

import type { DanioDeLosGolpes, GolpeEnSuPunto, GolpeQueViene } from '@core/battle/battle.js';
import { dichoDeLaCarga } from '@core/battle/carga.js';
import type { StackEffect } from '@core/battle/effects.js';
import {
  cargaDelCruce,
  contraataqueDelCruce,
  dichoDelCiclo,
  dichoDelCruce,
  efectoDeGolpe,
  type FormaDeLaRueda,
  formaDeLaBatalla,
  golpeNeutro,
  type HechoDelCruce,
  NOMBRE_DEL_PUNTO,
  nombreEnLaRueda,
  type PapelEnLaRueda,
  type Punto,
  puntosDeLaForma,
  type TipoDeGolpe,
} from '@core/battle/rueda.js';
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import { type CruceEnCurso, DURACION } from '../anim.js';
import { type Html, html, NADA, unir } from '../html.js';
import { COLOR_BANDO } from '../render/batalla.js';
import type { RuedaPendiente } from '../session.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import { modificadoresEnCurso, nota } from '../views/panels.js';
import { horquilla } from '../views/prevision.js';
import {
  anchoDelSector,
  anguloDe,
  BORDE,
  icono,
  LADO_DE_LA_CAJA,
  punto,
  RADIO_DEL_CENTRO,
  radios,
  SITIO_DEL_ROTULO,
  sector,
  xy,
} from './disco.js';
import { figuraDelContrincante } from './figuras.js';

// Las medidas y el ángulo de cada sector se leen desde aquí (`pnpm capturas`, los tests).
export { anguloDe, medidasDeLaRueda } from './disco.js';

/**
 * Dónde va el «ⓘ» de cada sector del anillo: cerca del borde de fuera y a un
 * lado del centro, donde no pisa el rótulo: un tercio del ancho del sector (20°
 * en la de 7, 30° en la de 5, 40° en la de 3; con 20° fijos, el «ⓘ» pisaba
 * «Romper guardia» abajo en la de 5). Sale del ángulo del sector, no de su tipo:
 * el orden del anillo puede cambiar sin tocar la colocación.
 */
const SITIO_DE_LA_NOTA = { r: 88, desvioPorSector: 1 / 3 } as const;
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
function formas(forma: FormaDeLaRueda): Html {
  const medio = LADO_DE_LA_CAJA / 2;
  const aLaCaja = `scale(${1 / LADO_DE_LA_CAJA}) translate(${medio} ${medio})`;
  return html`<svg class="formas" width="0" height="0" aria-hidden="true" focusable="false"><defs>${unir(
    forma.golpes.map(
      (t) =>
        html`<clipPath id="${idDeLaForma(t)}" clipPathUnits="objectBoundingBox">${
          t === 'normal'
            ? html`<circle transform="${aLaCaja}" r="${String(RADIO_DEL_CENTRO)}"/>`
            : html`<path transform="${aLaCaja}" d="${sector(t, forma)}"/>`
        }</clipPath>`,
    ),
  )}</defs></svg>`;
}

/**
 * El disco de debajo: el fondo, los sectores de `forma`, el centro y el aro; con
 * `elige`, el aro del bando que elige, que late. Sin Normal (la de 3), el centro
 * es solo madera: ni sector ni botón. Con `niveles` (al elegir: los del arma de
 * quien pega, `previsionDeLaRueda().niveles`), cada sector lleva su `data-nivel` y
 * se tiñe de rojo a verde como la ficha del arma (`rueda.css`); Normal, sin tono.
 */
function disco(
  elige: Side | null,
  forma: FormaDeLaRueda,
  niveles: Readonly<Partial<Record<TipoDeGolpe, number>>> | null,
): Html {
  // La veta alterna por el orden del anillo, no por una lista de tipos en el CSS:
  // con la lista, reordenar el anillo (#263) dejaba dos sectores iguales seguidos.
  // Con un número impar de sectores (la de 3), el último y el primero quedarían
  // iguales y juntos: el último lleva la tercera.
  const n = forma.anillo.length;
  const veta = (i: number): string =>
    n % 2 === 1 && i === n - 1 ? 'tercera' : i % 2 === 0 ? 'mesa' : 'madera';
  const nivelDe = (t: TipoDeGolpe): Html => {
    const nivel = niveles?.[t];
    return nivel === undefined ? NADA : html` data-nivel="${String(nivel)}"`;
  };
  const sectores = unir(
    forma.anillo.map(
      (t, i) =>
        html`<path class="sector" data-sector="${t}" data-veta="${veta(i)}"${nivelDe(t)} d="${sector(t, forma)}"/>`,
    ),
  );
  const centro = forma.centro
    ? html`<circle class="sector centro" data-sector="normal" r="${String(RADIO_DEL_CENTRO)}"/>`
    : html`<circle class="sin-centro" r="${String(RADIO_DEL_CENTRO)}"/>`;
  return html`<svg class="disco" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
      <circle class="fondo" r="108"/>
      <circle class="aro" r="${BORDE}"/>
      ${sectores}${radios(forma)}
      ${centro}
      <circle class="aro-de-dentro" r="${String(RADIO_DEL_CENTRO)}"/>
      ${elige === null ? NADA : html`<circle class="aro-del-bando" r="${String(BORDE + 2.5)}" stroke="${COLOR_BANDO[elige]}"/>`}
    </svg>`;
}

/**
 * «7–12» (`horquilla`, la de la previsión), o «2 × 7–12» con más de un golpe; con
 * carga, el primero aparte, que es el único que la cobra: «9–15 + 7–12». Lo mismo
 * para un sector de quien elige y para un golpe del que viene (`GolpeQueViene`).
 */
function conSusGolpes(s: DanioDeLosGolpes): string {
  if (s.siguientes !== null) {
    const resto = s.golpes - 1;
    return `${horquilla(s.danio)} + ${resto > 1 ? `${resto} × ` : ''}${horquilla(s.siguientes)}`;
  }
  return s.golpes > 1 ? `${s.golpes} × ${horquilla(s.danio)}` : horquilla(s.danio);
}

/**
 * La tecla de cada tipo de la rueda `forma`: su puesto en sus golpes, del 1
 * al número de tipos (el anillo desde arriba y Normal la última). Lanza con un
 * tipo que no es de esa rueda.
 */
export function teclaDe(tipo: TipoDeGolpe, forma: FormaDeLaRueda): string {
  const i = forma.golpes.indexOf(tipo);
  if (i < 0) throw new Error(`«${tipo}» no es un golpe de la rueda de ${forma.golpes.length}`);
  return String(i + 1);
}

/**
 * El tipo de una tecla en la rueda `forma` (`teclaDe` al revés), o `null` si no es
 * la de ninguno: un solo dígito, del 1 al número de tipos.
 */
export function tipoDeLaTecla(tecla: string, forma: FormaDeLaRueda): TipoDeGolpe | null {
  if (!/^[1-9]$/.test(tecla)) return null;
  return forma.golpes[Number(tecla) - 1] ?? null;
}

/**
 * La marca del sector cuyo golpe que viene puede tumbarte (`te-tumba`), tras el
 * número grande, y la misma delante de la línea del pie que la explica. Para el
 * lector de pantalla lo dicen la etiqueta y el pie.
 */
const MARCA_DE_TUMBA = html`<span class="marca-de-tumba" aria-hidden="true">†</span>`;

/**
 * Lo que dice cada sector. Al golpear, tu daño o, sin contraataque, «—»; con carga
 * y más de un golpe, el primero y los siguientes en dos líneas («48–91» y «+ 4–16»):
 * en una sola, el de Rápido se salía del sector y se comía un dígito (R5 de QA de
 * #260). Al responder (31-10-2026, el usuario: «que la rueda muestre los numeros de
 * daño del atacante»), arriba y más grande lo que te haría su golpe con esa
 * respuesta, de lo menos a lo más de todo lo que puede elegir (`GolpeQueViene`), y
 * debajo, más pequeño, tu contraataque si lo hay.
 */
function loQueDa(p: RuedaPendiente, tipo: TipoDeGolpe): Html {
  const s = p.prevision.porTipo?.[tipo];
  const viene = p.golpeQueViene?.[tipo];
  if (viene !== undefined) {
    const tuyo = s === undefined ? NADA : html`<span class="da tuyo">${conSusGolpes(s)}</span>`;
    return html`<span class="da del-atacante">${horquilla(viene.total)}${viene.puedeTumbarte ? MARCA_DE_TUMBA : NADA}</span>${tuyo}`;
  }
  if (s === undefined) return html`<span class="da">—</span>`;
  if (s.siguientes === null) return html`<span class="da">${conSusGolpes(s)}</span>`;
  const resto = s.golpes - 1;
  return html`<span class="da">${horquilla(s.danio)}</span><span class="da">+ ${resto > 1 ? `${resto} × ` : ''}${horquilla(s.siguientes)}</span>`;
}

/**
 * La etiqueta del botón de un sector: su nombre y su tecla, el daño que se dice
 * y su nota (`notaDe`, ya hecha). Al golpear, tu daño; al responder, lo que te
 * haría su golpe y, si devuelves el golpe, el tuyo. Sin contraataque no hay daño
 * tuyo que decir: la nota ya lo cuenta.
 */
function etiquetaDe(
  p: RuedaPendiente,
  tipo: TipoDeGolpe,
  forma: FormaDeLaRueda,
  nota: string,
): string {
  const s = p.prevision.porTipo?.[tipo];
  const viene = p.golpeQueViene?.[tipo];
  const nombre = `${nombreEnLaRueda(tipo, forma)} (tecla ${teclaDe(tipo, forma)})`;
  if (viene !== undefined) {
    const teHaria = `te haría ${horquilla(viene.total)} de daño${viene.puedeTumbarte ? ' y puede tumbarte' : ''}`;
    return s === undefined
      ? `${nombre}: ${teHaria}. ${nota}`
      : `${nombre}: ${teHaria}; tú, ${conSusGolpes(s)} de daño al devolver el golpe. ${nota}`;
  }
  if (s === undefined) return `${nombre}. ${nota}`;
  return `${nombre}: ${conSusGolpes(s)} de daño${p.fase === 'respuesta' ? ' al devolver el golpe' : ''}. ${nota}`;
}

/**
 * Lo que te haría cada golpe del que viene con esta respuesta, golpe a golpe: «Su
 * golpe te haría: con Fuerte (alto), 504; con Rápido (medio), 2 × 199; …». Así se
 * lee de dónde sale la horquilla grande del sector (`GolpeQueViene.total`); va en
 * la nota del sector, que no deja ver el golpe: es el mismo elija lo que elija.
 *
 * El golpe que te tumba no dice su daño en bruto, que pasa de tu vida y del número
 * grande del sector, topado en ella (H2 de QA, 01-11-2026: «con Fuerte (medio),
 * 43» bajo un «…–28» se leía como una contradicción): «te tumba», y si solo lo
 * más que quita llega, «de 18 a tumbarte» (`GolpeEnSuPunto.tumba`, del núcleo).
 */
function desgloseDelGolpe(viene: GolpeQueViene, forma: FormaDeLaRueda): string {
  const golpes = viene.porGolpe
    .map(
      (g) =>
        `con ${nombreEnLaRueda(g.tipo, forma)} (${NOMBRE_DEL_PUNTO[g.punto]}), ${loQueTeHaria(g)}`,
    )
    .join('; ');
  return ` Su golpe ${viene.puedeTumbarte ? 'puede tumbarte' : 'te haría'}: ${golpes}.`;
}

/** Lo que te haría un golpe del que viene, en la nota (`desgloseDelGolpe`). */
function loQueTeHaria(g: GolpeEnSuPunto): string {
  switch (g.tumba) {
    case 'siempre':
      return 'te tumba';
    case 'puede':
      return `de ${g.quita.min} a tumbarte`;
    case 'no':
      return conSusGolpes(g);
  }
}

/**
 * La nota del sector: en una rueda de ciclo, a quién gana y con quién pierde
 * (`dichoDelCiclo`); lo que hace el tipo para quien elige ahora, con las cifras
 * de su arma (`efectoDeGolpe`, `previsionDeLaRueda().rueda`), y en una respuesta
 * que no devolverá el golpe, solo lo que vale: el cruce. Todo lo demás de la respuesta va con el contraataque.
 */
function notaDe(p: RuedaPendiente, tipo: TipoDeGolpe, forma: FormaDeLaRueda): string {
  // En un ciclo, primero a quién gana y con quién pierde: es lo que decide el cruce.
  const ciclo = dichoDelCiclo(tipo, forma);
  const viene = p.golpeQueViene?.[tipo];
  const desglose = viene === undefined ? '' : desgloseDelGolpe(viene, forma);
  return `${ciclo === '' ? '' : `${ciclo} `}${efectoDeGolpe(tipo, p.fase, p.prevision.sinContraataque === null, p.prevision.rueda, forma)}${contraataqueRebajado(p, tipo, forma)}${desglose}`;
}

/**
 * Al golpear con un tipo que rebaja el contraataque del rival (Romper guardia),
 * en cuánto quedaría con cada éxito que lo cambia, frente al de un golpe que no
 * deja nada (R3 de QA de #263: antes de elegir no se veía). Sale de
 * `previsionDeLaRueda`, la misma cuenta que el golpe; si no hay nada que decir,
 * vacío.
 */
function contraataqueRebajado(p: RuedaPendiente, tipo: TipoDeGolpe, forma: FormaDeLaRueda): string {
  const s = p.prevision.porTipo?.[tipo];
  const ahora = p.prevision.contraataque;
  if (s === undefined || ahora === null || s.contraataquePorExito.length === 0) return '';
  const porExito = s.contraataquePorExito
    .map(({ punto, danio }) => `${NOMBRE_DEL_PUNTO[punto]}, ${horquilla(danio)}`)
    .join('; ');
  // El golpe neutro de la rueda, por su nombre; en la de 3, que no lo tiene, sin nombre.
  const neutro = golpeNeutro(forma);
  const con = neutro === null ? 'sin quitarle nada' : `con ${nombreEnLaRueda(neutro, forma)}`;
  return ` Su contraataque (${con}, ${horquilla(ahora)}) queda, según el éxito, en: ${porExito}.`;
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
 * chapa de su bando y su nombre en el campo y, debajo, sus `modificadores`, ya
 * pintados (`modificadoresEnCurso`, lo mismo que «En el campo», 31-10-2026). Con
 * `quienMira`, el bando de quien mira (la sesión, `SesionConRueda.quienMira`),
 * cada uno se marca «tú» o «rival».
 */
function contrincante(
  battle: BattleState,
  x: BattleStack,
  modificadores: Html,
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
  return html`<span class="contrincante" data-contrincante="${x.id}">${icono}<span class="datos-del-contrincante"><span class="quien">${chapa(x.side)}<span class="nombre-del-contrincante">${nombre}</span>${deQuien}</span>${modificadores}</span></span>`;
}

const LADO: Readonly<Record<Side, string>> = { attacker: 'izquierdo', defender: 'derecho' };

/**
 * La cabecera de las dos caras: el título y quién pega a quién, siempre en ese
 * orden («Orco ataca a Templario»), también cuando elige quien recibe, cada uno
 * con su figura y sus modificadores (`contrincante`): `delAtacante` y
 * `delObjetivo`. Al elegir, lo que llevan ahora; en el desenlace, lo que el
 * animador vio antes de contar el cruce (`CruceEnCurso.efectos`): el estado ya trae
 * lo que el cruce dejó. «ataca a» va pegado al objetivo: al partirse la línea en
 * un móvil no queda suelto. Un `<div>` y no un `<p>`: la vista previa lleva filas
 * en bloque, y dentro de un `<p>` el analizador lo cerraba antes.
 */
function cabecera(
  battle: BattleState,
  titulo: Html,
  [atacante, delAtacante]: readonly [BattleStack, Html],
  [objetivo, delObjetivo]: readonly [BattleStack, Html],
  quienMira: Side | null,
  cara: CaraDeLosContrincantes | null,
  paraElegir: boolean,
): Html {
  const uno = contrincante(battle, atacante, delAtacante, quienMira, cara, paraElegir);
  const otro = contrincante(battle, objetivo, delObjetivo, quienMira, cara, paraElegir);
  return html`<header class="cabecera-de-rueda">
      <h2 id="titulo-de-la-rueda">${titulo}</h2>
      <div class="quienes">${uno}<span class="hacia"><span class="ataca">ataca a</span>${otro}</span></div>
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
 * Los sitios de la rueda `forma`, uno por tipo: cada uno, una capa del plato
 * entero con lo que ponga `dentro`. Lo coloca `ajustarLaRueda` desde el ángulo de
 * su sector en el anillo (`sitioEnLaRueda`), y `data-hacia` dice hacia dónde abre
 * su nota. Nada de la colocación va por tipo: si cambia el orden del anillo, todo
 * sigue a su sector. `atributos`, lo que lleva cada sitio además de su tipo.
 */
function sitios(
  forma: FormaDeLaRueda,
  dentro: (t: TipoDeGolpe) => Html,
  atributos: (t: TipoDeGolpe) => Html,
  /** Lo que se le añade a la clase del sector: `te-tumba` en la respuesta (`renderEleccion`). */
  clase: (t: TipoDeGolpe) => string = () => '',
): Html {
  return unir(
    forma.golpes.map(
      (t) =>
        html`<div class="sector-de-rueda${clase(t)}" data-sector="${t}"${atributos(t)} data-hacia="${t === 'normal' ? 'abajo' : haciaDe(anguloDe(t, forma))}">${dentro(t)}</div>`,
    ),
  );
}

/** Lo que se ve de un tipo: su icono y su nombre en la rueda `forma`. */
function rotuloDe(t: TipoDeGolpe, forma: FormaDeLaRueda): Html {
  return html`${icono(t)}<span class="nombre">${nombreEnLaRueda(t, forma)}</span>`;
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
  const forma = formaDeLaBatalla(battle);
  // Si quien elige es quien mira: «Tu golpe»; si no (la arena con los dos bandos
  // de la persona), por su lado.
  const titulo =
    quienMira === p.bando
      ? html`${golpe ? 'Tu golpe' : 'Tu respuesta'}`
      : golpe
        ? html`Golpe del bando ${LADO[p.bando]}`
        : html`Respuesta del bando ${LADO[p.bando]}`;
  const guia = golpe
    ? `Elige cómo golpear. El rival elige a la vez, sin ver el tuyo; ${dichoDelCruce(forma)}`
    : p.prevision.sinContraataque === null
      ? `Elige tu respuesta sin ver su golpe; ${dichoDelCruce(forma)} Tu contraataque cae en el punto contrario.`
      : `No devolverá el golpe (${p.prevision.sinContraataque}): la respuesta solo cuenta para el cruce.`;
  // El tinte de los sectores es el arma de quien pega (`disco`): al golpear, la de
  // quien elige; al responder, la del rival, que es lo que se teme.
  const tinte = golpe
    ? 'El color de cada sector, el nivel de tu arma en ese golpe: rojo, peor; verde, mejor.'
    : 'El color de cada sector, el nivel del arma de quien te golpea: rojo, flojo; verde, fuerte.';
  // El sector abre su nota también al pasar por él (`[data-abre-nota]`, style.css).
  const sectores = sitios(
    forma,
    (t) => {
      const suNota = notaDe(p, t, forma);
      return html`<button type="button" data-golpe="${t}" aria-label="${etiquetaDe(p, t, forma, suNota)}" aria-keyshortcuts="${teclaDe(t, forma)}">
          <span class="rotulo-del-sector">${rotuloDe(t, forma)}${loQueDa(p, t)}</span>
        </button>${nota(suNota)}`;
    },
    () => html` data-abre-nota`,
    // El máximo del sector es tu vida: se marca, para que no se lea como el techo
    // de su golpe (H2 de QA, 01-11-2026).
    (t) => (p.golpeQueViene?.[t]?.puedeTumbarte === true ? ' te-tumba' : ''),
  );
  const tumba = forma.golpes.some((t) => p.golpeQueViene?.[t]?.puedeTumbarte === true);
  const ultima = String(forma.golpes.length);
  return html`<div class="rueda" data-fase="${p.fase}" data-bando="${p.bando}" data-tipos="${String(forma.golpes.length)}">
    ${cabecera(
      battle,
      titulo,
      [p.atacante, modificadoresEnCurso(p.atacante.effects, forma, p.prevision.carga)],
      [p.objetivo, modificadoresEnCurso(p.objetivo.effects, forma)],
      quienMira,
      cara,
      true,
    )}
    <div class="plato">
      ${formas(forma)}
      <div class="giro">${disco(p.bando, forma, p.prevision.niveles)}${sectores}</div>
    </div>
    <footer class="pie-de-rueda">
      <p class="guia">${guia}</p>
      <p class="tinte-de-la-rueda" data-tinte>${tinte}</p>
      ${tumba ? html`<p class="tumba-de-la-rueda" data-tumba>${MARCA_DE_TUMBA} Puede tumbarte: el número grande llega a la vida que te queda.</p>` : NADA}
      ${
        // Con carga, las cifras llevan la de la carrera que se correrá tras elegir: al
        // golpear, las tuyas; al responder, las de su golpe.
        p.prevision.carga === null
          ? NADA
          : html`<p class="carga-de-la-rueda" data-carga>${golpe ? 'Las cifras llevan' : 'Su golpe lleva'} la ${dichoDeLaCarga(p.prevision.carga.casillas, p.prevision.carga.montada)}.</p>`
      }
      <p class="teclas"><kbd>1</kbd>–<kbd>${ultima}</kbd> o <kbd>←</kbd><kbd>→</kbd> e <kbd>Intro</kbd>${golpe ? html` · <kbd>Esc</kbd> cancela` : NADA}</p>
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
function anguloDeLaMarca(
  tipo: TipoDeGolpe,
  papel: 'golpe' | 'respuesta',
  forma: FormaDeLaRueda,
): number {
  return anguloDe(tipo, forma) + (papel === 'golpe' ? -13 : 13);
}

/** Dónde se posa el marcador de un papel: en el aro, o en el borde del centro si es Normal. */
function dondeCae(
  tipo: TipoDeGolpe,
  papel: 'golpe' | 'respuesta',
  forma: FormaDeLaRueda,
): { x: number; y: number } {
  if (tipo === 'normal') return punto(RADIO_DEL_CENTRO, -90 + (papel === 'golpe' ? -42 : 42));
  return punto(BORDE, anguloDeLaMarca(tipo, papel, forma));
}

/**
 * El arco entre los dos marcadores: por el aro, por el lado corto, que es la
 * distancia que fija el punto; con Normal, una recta del centro a la marca del
 * otro; los dos en Normal, el borde del centro. `data-punto` le da el color.
 */
function arco(golpe: TipoDeGolpe, respuesta: TipoDeGolpe, p: Punto, forma: FormaDeLaRueda): Html {
  // Una recta del centro a la marca del que no eligió Normal.
  const desdeElCentro = (g: number): string => `M${xy(RADIO_DEL_CENTRO, g)}L${xy(BORDE, g)}`;
  let d: string;
  if (golpe !== 'normal' && respuesta !== 'normal') {
    const a = anguloDeLaMarca(golpe, 'golpe', forma);
    const b = anguloDeLaMarca(respuesta, 'respuesta', forma);
    const delta = ((b - a + 540) % 360) - 180;
    d = `M${xy(BORDE, a)}A${BORDE} ${BORDE} 0 0 ${delta >= 0 ? 1 : 0} ${xy(BORDE, b)}`;
  } else if (golpe !== 'normal') {
    d = desdeElCentro(anguloDeLaMarca(golpe, 'golpe', forma));
  } else if (respuesta !== 'normal') {
    d = desdeElCentro(anguloDeLaMarca(respuesta, 'respuesta', forma));
  } else {
    const r = RADIO_DEL_CENTRO;
    d = `M${xy(r, -90)}A${r} ${r} 0 0 1 ${xy(r, 90)}A${r} ${r} 0 0 1 ${xy(r, -90)}`;
  }
  return html`<path class="arco" data-punto="${String(p)}" pathLength="1" d="${d}"/>`;
}

/** El sector elegido, teñido del color de quien lo eligió. */
function tinte(tipo: TipoDeGolpe, side: Side, forma: FormaDeLaRueda): Html {
  return tipo === 'normal'
    ? html`<circle class="tinte" r="${String(RADIO_DEL_CENTRO)}" fill="${COLOR_BANDO[side]}"/>`
    : html`<path class="tinte" d="${sector(tipo, forma)}" fill="${COLOR_BANDO[side]}"/>`;
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

/**
 * El medidor, con una muesca por punto que da el cruce de la rueda `forma`
 * (`puntosDeLaForma`: cinco en la de 7, tres en un ciclo, en el mismo sitio de la
 * pista), y la aguja del golpe arriba y la del contraataque abajo.
 */
function medidor(
  e: HechoDelCruce,
  contraataque: Punto | null,
  atacante: Side,
  objetivo: Side,
  forma: FormaDeLaRueda,
): Html {
  const x = (p: Punto): number => 20 + p * 50;
  const muescas = unir(
    puntosDeLaForma(forma).map(
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
 * El desenlace de un cruce (`cruce.evento`, que está en el registro de `battle`):
 * los dos tipos ya a la vista, los marcadores, el arco, el medidor y el rótulo.
 * Del registro, lo que de verdad hubo tras él: el punto del contraataque
 * (`contraataqueDelCruce`) y la carga que cobró quien pega (`cargaDelCruce`). En
 * la cabecera, lo que llevaba colgado cada uno antes del cruce
 * (`cruce.efectos`, la foto del animador: `battle` ya trae lo que el cruce dejó).
 */
export function renderDesenlace(
  battle: BattleState,
  cruce: Pick<CruceEnCurso, 'evento' | 'efectos'>,
  quienMira: Side | null,
  cara: CaraDeLosContrincantes | null,
): Html {
  const e = cruce.evento;
  const i = battle.log.indexOf(e);
  if (i < 0) throw new Error('la rueda cuenta un cruce que no está en el registro');
  const atacante = battle.stacks.find((s) => s.id === e.stack);
  const objetivo = battle.stacks.find((s) => s.id === e.target);
  if (atacante === undefined || objetivo === undefined) {
    throw new Error(
      `la rueda cuenta un cruce de ${e.stack} a ${e.target}, que no están en el campo`,
    );
  }
  // Qué sector eligió cada papel: lo leen los tests y `pnpm capturas`, que
  // comprueban que la respuesta se elige sin verlo.
  const contraataque = contraataqueDelCruce(battle.log, i);
  const elegido: Partial<Record<TipoDeGolpe, string>> = { [e.golpe]: 'golpe' };
  elegido[e.respuesta] = e.respuesta === e.golpe ? 'los-dos' : 'respuesta';
  const forma = formaDeLaBatalla(battle);
  const etiquetas = sitios(
    forma,
    (t) => html`<span class="rotulo-del-sector">${rotuloDe(t, forma)}</span>`,
    (t) => html` data-elegido="${elegido[t] ?? ''}"`,
  );
  const contra =
    contraataque === null
      ? 'sin contraataque'
      : html`contraataque <strong data-punto="${String(contraataque)}">${NOMBRE_DEL_PUNTO[contraataque]}</strong>`;
  const antes = (x: BattleStack): readonly StackEffect[] => {
    const suyos = cruce.efectos.get(x.id);
    if (suyos === undefined) {
      throw new Error(`la rueda no sabe qué llevaba ${x.id} antes del cruce`);
    }
    return suyos;
  };
  const carga = cargaDelCruce(battle.log, i, atacante.unit);
  const titulo = html`<span class="mientras-gira">La rueda gira…</span><span class="cuando-para">${nombreEnLaRueda(e.golpe, forma)} contra ${nombreEnLaRueda(e.respuesta, forma)}</span>`;
  return html`<div class="rueda" data-fase="desenlace" data-tipos="${String(forma.golpes.length)}">
    ${cabecera(
      battle,
      titulo,
      [atacante, modificadoresEnCurso(antes(atacante), forma, carga)],
      [objetivo, modificadoresEnCurso(antes(objetivo), forma)],
      quienMira,
      cara,
      false,
    )}
    <div class="plato">
      <div class="giro">${disco(null, forma, null)}${etiquetas}</div>
      <svg class="marcas" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
        ${tinte(e.golpe, atacante.side, forma)}
        ${tinte(e.respuesta, objetivo.side, forma)}
        ${arco(e.golpe, e.respuesta, e.punto, forma)}
        ${marcador(atacante.side, dondeCae(e.golpe, 'golpe', forma), 'golpe')}
        ${marcador(objetivo.side, dondeCae(e.respuesta, 'respuesta', forma), 'respuesta')}
      </svg>
    </div>
    <footer class="pie-de-rueda">
      <p class="rotulo" data-punto="${String(e.punto)}" role="status">${ROTULO[e.punto]}</p>
      ${medidor(e, contraataque, atacante.side, objetivo.side, forma)}
      <p class="contraataque">${contra}</p>
    </footer>
  </div>`;
}

/**
 * Dónde va lo de cada sector de la rueda `forma`, en su plano: el centro de su
 * rótulo y su «ⓘ», desde el ángulo de su sector en el anillo (Normal, en el
 * centro). El «ⓘ» va a un lado del centro del sector, `SITIO_DE_LA_NOTA.desvio`
 * grados: en la de 3 y la de 5 los sectores son más anchos y sigue dentro.
 */
export function sitioEnLaRueda(
  tipo: TipoDeGolpe,
  forma: FormaDeLaRueda,
): {
  readonly rotulo: { readonly x: number; readonly y: number };
  readonly nota: { readonly x: number; readonly y: number };
} {
  if (tipo === 'normal') {
    return { rotulo: { x: 0, y: 0 }, nota: punto(NOTA_DEL_CENTRO.r, NOTA_DEL_CENTRO.grados) };
  }
  const g = anguloDe(tipo, forma);
  return {
    rotulo: punto(SITIO_DEL_ROTULO, g),
    nota: punto(SITIO_DE_LA_NOTA.r, g + anchoDelSector(forma) * SITIO_DE_LA_NOTA.desvioPorSector),
  };
}

/**
 * Lo que el marcado no lleva y se pone con `style` tras pintar (un hueco `style`
 * no se escribe con `html.ts`): el reloj del desenlace (`--cruce`, el de
 * `DURACION.cruce`, del que el CSS saca cada animación en fracciones), el sitio
 * de lo de cada sector (`sitioEnLaRueda`: `--x`, `--y` el rótulo; `--nx`, `--ny`
 * el «ⓘ») y el recorte de cada botón a su sector (`clip-path`, al `<clipPath>`
 * de `formas`). Un botón sin su forma recibiría el clic en el plato entero y se
 * comería los de debajo: eso lanza. `forma`, la rueda de la batalla que se pintó.
 */
export function ajustarLaRueda(dialogo: HTMLElement, forma: FormaDeLaRueda): void {
  dialogo.style.setProperty('--cruce', `${DURACION.cruce}ms`);
  const enPorcentaje = (v: number): string => `${50 + (v * 100) / LADO_DE_LA_CAJA}%`;
  for (const t of forma.golpes) {
    const sitio = dialogo.querySelector<HTMLElement>(`.sector-de-rueda[data-sector="${t}"]`);
    if (sitio === null) continue;
    const { rotulo, nota: delInfo } = sitioEnLaRueda(t, forma);
    sitio.style.setProperty('--x', enPorcentaje(rotulo.x));
    sitio.style.setProperty('--y', enPorcentaje(rotulo.y));
    sitio.style.setProperty('--nx', enPorcentaje(delInfo.x));
    sitio.style.setProperty('--ny', enPorcentaje(delInfo.y));
    const boton = sitio.querySelector<HTMLElement>('button[data-golpe]');
    if (boton === null) continue;
    const id = idDeLaForma(t);
    if (dialogo.querySelector(`clipPath[id="${id}"]`) === null) {
      throw new Error(
        `el sector ${nombreEnLaRueda(t, forma)} de la rueda no tiene su forma (#${id})`,
      );
    }
    boton.style.clipPath = `url(#${id})`;
  }
}
