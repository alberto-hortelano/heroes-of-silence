/**
 * El panel de la batalla, uno para la partida y la arena (`panelDeBatalla`; R2 de la
 * reorganización, 07-11-2026): el esqueleto —el final, el despliegue, la ficha de la
 * activa, la ronda, el maná, lo que puede hacer la unidad activa (`accionesDeLaUnidad`),
 * «En el campo» y el parte— es este, y cada página pone lo suyo (`LoDeLaPagina`): cómo
 * acaba, la ficha de la activa, cómo dice a cada uno en el campo, su maná, sus botones y
 * lo que dice cuando mueve el otro. Lo de la partida vive en `partida/batalla/panel.ts`
 * y lo de la arena en `arena/paneles/batalla.ts`. Hasta R2 cada una llevaba su copia, y
 * ya divergían: lo que la arena decía de la activa —tras una Finta, que solo anda; rodeada,
 * que no sale; respondiendo en la rueda, que le toca responder— la partida no lo decía, y
 * tras una Finta invitaba a golpear sin poder (R2 de QA de #263). Lo de la arena es lo de
 * las dos.
 *
 * Era parte de `views/panels.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import { granadasQueQuedan, recargaQueFalta } from '@core/battle/a-distancia.js';
import { lanzaGranadas, tiroADistanciaDe } from '@core/battle/armas.js';
import { quedanCasillas } from '@core/battle/board.js';
import { CARGA, CARGA_MINIMA, type CifrasDeCarga } from '@core/battle/carga.js';
import { activeStack, stackById } from '@core/battle/consultas.js';
import { alcanceDeLaGranada } from '@core/battle/granada.js';
import type {
  BattleAction,
  BattleEvent,
  BattleFinish,
  BattleStack,
  BattleState,
  Side,
} from '@core/battle/types.js';
import { COMO_SE_COLOCA } from '../comun/dichos.js';
import { DESHABILITADO, type Html, html, NADA, unir } from '../comun/html.js';
import { nombreEnElCampo } from '../render/batalla/distintivo.js';
import type { ModoDelArma } from '../sesion/batalla/arma.js';
import type { SpellOption } from '../sesion/batalla/control.js';
import type { DespliegueEnPantalla } from '../sesion/batalla/despliegue.js';
import type { SesionDeBatalla } from '../sesion/batalla/sesion-de-batalla.js';
import { type FilaDelCampo, listaDelCampo, marcaDeComandante } from '../views/campo.js';
import { AVISO_DE_ESPERA, fieldsetApagado, filaDeCifra } from '../views/cifras.js';
import { renderBattleLog } from './parte.js';
import { botonesDeArma, botonesDeMuralla, botonesDePoder } from './poderes.js';

/**
 * Lo que el panel lee de la sesión, la de la partida o la de la arena: la batalla que
 * se ve, el despliegue, el turno propio, la rueda y lo que ofrece la activa con sus
 * piezas (`SesionDeBatalla`).
 */
export type SesionDelPanel = Pick<
  SesionDeBatalla,
  | 'batallaALaVista'
  | 'despliegue'
  | 'turnoPropio'
  | 'ruedaPendiente'
  | 'motivoDeLaRueda'
  | 'battleLegalActions'
  | 'battleStepsLeft'
  | 'sinSalida'
  | 'trasLaFinta'
  | 'arma'
  | 'hechizos'
  | 'spellOptions'
  | 'muralla'
  | 'apuntado'
  | 'motivoDePoder'
  | 'prevision'
>;

/**
 * Lo que cada página pone en el panel de la batalla (`panelDeBatalla`): la partida
 * (`partida/batalla/panel.ts`) y la arena (`arena/paneles/batalla.ts`). Las funciones,
 * porque lo que no se pinta no se pregunta: la rendición, sin turno propio.
 */
interface LoDeLaPagina {
  /**
   * El panel de la batalla terminada (`fin`): la partida, «Victoria» o «Derrota»; la
   * arena, quién gana y «Otra vez».
   */
  final(battle: BattleState, fin: BattleFinish): Html;
  /** Cómo se dice el bando que despliega (la arena, con los dos de la persona), o `null`. */
  quienDespliega(side: Side): string | null;
  /** La ficha de la activa, o lo que se dice sin ella. */
  ficha(battle: BattleState, activa: BattleStack | null): Html;
  /**
   * Cómo dice a cada uno «En el campo»: en el despliegue (`enLaPelea` falso) y en la
   * pelea, donde la arena le pone su «Editar».
   */
  fila(battle: BattleState, x: BattleStack, enLaPelea: boolean): FilaDelCampo;
  /** La fila del maná, o nada. */
  mana(): Html;
  /** Los botones de la página bajo el maná (la arena, «Editar equipo»), o nada. */
  readonly botones: Html;
  /** El botón de rendirse, o nada (la arena no se rinde). */
  rendicion(): Html;
  /** Lo que va en lugar de los hechizos si el bando de la activa no tiene héroe. */
  readonly sinHeroe: Html;
  /** Cuando la activa no es de la persona: «Turno del enemigo…», «Mueve la IA…». */
  readonly turnoAjeno: Html;
  /** El bando de quien lee el parte de guerra, o `null` si no lleva uno (la arena). */
  readonly mio: Side | null;
}

/**
 * Lo último que pintó quieto el panel de cada batalla, por su registro (`battle.log`):
 * lo que enseña mientras el tablero cuenta (`panelDeBatalla`). El registro es el
 * array que el núcleo va llenando en su sitio, uno por batalla, y lo comparte la vista
 * del despliegue (`batallaALaVista`): una batalla nueva, o rehecha, no casa nunca con
 * lo de otra y como mucho cae en lo callado. `WeakMap`: con la batalla se va lo suyo.
 */
const quietos = new WeakMap<readonly BattleEvent[], Html>();

/**
 * Lo que dice el panel mientras se cuenta una jugada de una batalla de la que aún no
 * hay nada pintado quieto (la arena con todo en IA, que se juega entera antes del
 * primer fotograma): sin ronda ni campo, que serían los del final.
 */
const CALLADO = html`${filaDeCifra('Ronda', '…')}
      <p>Contando la jugada…</p>`;

/**
 * El panel de la batalla de una página (`LoDeLaPagina`), con lo que se ve
 * (`batallaALaVista`): en el despliegue, sin el rival que aún no ha desplegado; el
 * defensor despliega sin ver la lista del atacante. Con la rueda en la respuesta, lo que
 * se juega es eso: la activa es quien pega, y puede ser del rival.
 *
 * `contandoAun`: el tablero aún cuenta lo jugado, y el estado ya trae el final de lo que
 * se cuenta —en la partida, la tanda entera de la IA hasta el turno de la persona—. El
 * panel no se adelanta: enseña lo último que pintó quieto de esta batalla (`quietos`),
 * entero y apagado (`fieldsetApagado` con `AVISO_DE_ESPERA`), y si no pintó nada quieto,
 * calla (`CALLADO`). Ni «Victoria» antes del último golpe, ni quien aún no se ha visto
 * caer fuera de «En el campo», ni el parte, la ronda o la recarga de lo que no se ha
 * contado (#257, 11-11-2026). Congelar y no retener por el animador: el panel lee
 * también lo que la sesión ofrece ahora (las acciones legales, el maná), y mezclarlo con
 * una foto a medias del animador enseñaría dos instantes a la vez. Una regla para la
 * partida y la arena, que hasta #257 callaba con su copia.
 *
 * Las líneas de la plantilla conservan la sangría de cuando vivían dentro de
 * `renderBattlePanel`: es marcado que el ancla de `test/fixtures/paneles.txt` compara
 * byte a byte.
 */
export function panelDeBatalla(s: SesionDelPanel, contandoAun: boolean, p: LoDeLaPagina): Html {
  const battle = s.batallaALaVista;
  if (battle === null) return NADA;
  if (contandoAun) {
    const quieto = quietos.get(battle.log);
    return quieto === undefined ? CALLADO : fieldsetApagado(AVISO_DE_ESPERA, quieto);
  }
  const hecho = battle.finished !== null ? p.final(battle, battle.finished) : enJuego(s, battle, p);
  quietos.set(battle.log, hecho);
  return hecho;
}

/**
 * La línea de estado de la batalla, la de la partida y la arena, con el tablero
 * contando o no (`contandoAun`): lo mismo que el panel, no adelanta el final. «La batalla
 * ha terminado.» espera a que el tablero cuente el último golpe (#257, 11-11-2026; en la
 * arena desde antes). El aviso de espera no espera: un clic durante el último desenlace
 * de la rueda se perdía sin decir nada (H4 de QA, 19-10-2026), y el aviso no adelanta
 * el final.
 */
export function barraDeLaBatalla(
  status: string,
  battle: BattleState | null,
  contandoAun: boolean,
): string {
  return contandoAun && battle?.finished != null && status !== AVISO_DE_ESPERA ? '' : status;
}

/** El panel de la batalla sin terminar y con el tablero quieto (`panelDeBatalla`). */
function enJuego(s: SesionDelPanel, battle: BattleState, p: LoDeLaPagina): Html {
  // El despliegue: lo propio y el rival que ya desplegó, nunca el que aún no.
  const desplegando = s.despliegue.enCurso;
  if (desplegando !== null) {
    return renderDespliegue(s.despliegue, battle, {
      quien: p.quienDespliega(desplegando.side),
      fila: (x) => p.fila(battle, x, false),
    });
  }

  const activa = activeStack(battle);
  const acciones =
    s.ruedaPendiente?.fase === 'respuesta'
      ? html`<p>Te toca responder en la rueda.</p>`
      : activa !== null && s.turnoPropio !== null
        ? fieldsetApagado(
            s.motivoDeLaRueda,
            accionesDeLaUnidad({
              activa,
              carga: CARGA,
              legales: s.battleLegalActions(),
              pasos: s.battleStepsLeft(),
              sinSalida: s.sinSalida(),
              trasLaFinta: s.trasLaFinta(),
              modo: s.arma.modo,
              rendicion: p.rendicion(),
              // Un bando sin héroe (una base que se defiende sola, #116) no tiene libro
              // que enseñar: «Este héroe no conoce ninguno» hablaría de uno que no está.
              hechizos:
                battle.heroes[activa.side] === null
                  ? p.sinHeroe
                  : renderSpells(s.hechizos.selectedSpell, s.spellOptions()),
              // La de la ciudad o el pueblo (fase 2 del puesto fronterizo) o la de la
              // arena: escalera y subir al que ataca, la puerta al que defiende; sin
              // muralla, nada.
              muralla: botonesDeMuralla(s, battle, activa),
              poderes: html`${botonesDeArma(s, activa)}${botonesDePoder(s, activa)}`,
            }),
          )
        : p.turnoAjeno;

  // El maná del héroe va junto a la ficha de la unidad activa: es un recurso de la
  // batalla entera, no del stack, y sin verlo no se decide si lanzar.
  return html`${p.ficha(battle, activa)}
    ${filaDeCifra('Ronda', String(battle.round))}
    ${p.mana()}${p.botones}
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${listaDelCampo(battle, (x) => p.fila(battle, x, true))}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(battle, p.mio)}`;
}

/** Lo que se dice de cada tanda del despliegue, por su bando y su momento (`TANDAS`). */
function fraseDeLaTanda(d: NonNullable<DespliegueEnPantalla['enCurso']>): string {
  if (d.momento === 'tras_el_enemigo') {
    return 'Despliegan los que salen cuando el enemigo ya está en el campo.';
  }
  return d.side === 'defender'
    ? 'Despliegas primero: el enemigo aún no está en el campo.'
    : 'El enemigo ya está en el campo: colócate frente a él.';
}

/**
 * El panel de la batalla en el despliegue de la persona (fase de despliegue,
 * 02-11-2026), uno para la partida y la arena: qué tanda es, un botón por cada uno
 * que se coloca (el elegido marcado; con el teclado se elige aquí y las flechas lo
 * mueven), cómo se coloca (`COMO_SE_COLOCA`), «Listo», que la cierra, y «En el
 * campo» con lo que se ve (`battle`, la vista: sin el rival que aún no desplegó).
 * `quien` es el bando dicho, donde la persona puede llevar los dos (la arena), o
 * `null`; `fila`, cómo dice cada página a cada uno en el campo. Con la jugada
 * contándose no se pinta: el panel enseña lo de antes, apagado (`panelDeBatalla`).
 */
function renderDespliegue(
  d: DespliegueEnPantalla,
  battle: BattleState,
  o: {
    readonly quien: string | null;
    readonly fila: (x: BattleStack) => FilaDelCampo;
  },
): Html {
  const ahora = d.enCurso;
  if (ahora === null) return NADA;
  const elegido = d.elegido;
  const botones = unir(
    ahora.colocables.map((id) => {
      const x = stackById(battle, id);
      const es = id === elegido?.id;
      return html`<button data-action="despliegue-elegir" data-stack="${id}"${es ? html` class="primary" aria-pressed="true"` : html` aria-pressed="false"`}>${marcaDeComandante(x)}${nombreEnElCampo(battle, x)} (${x.hex.col},${x.hex.row})</button>`;
    }),
  );
  return html`<h2>Despliegue${o.quien === null ? NADA : html` · ${o.quien}`}</h2>
    <p>${fraseDeLaTanda(ahora)}</p>
    <h3>Colocar</h3>
    <div class="stack-list" data-despliegue="${String(ahora.tanda)}">${botones}</div>
    <p class="cost" style="margin-top:.5rem">Para colocar, ${COMO_SE_COLOCA}</p>
    <div class="stack-list"><button data-action="desplegado" class="primary">Listo</button></div>
    <h3>En el campo</h3><div class="stack-list">${listaDelCampo(battle, o.fila)}</div>`;
}

/**
 * Lo que puede hacer la unidad activa de la persona: las casillas que le quedan,
 * los botones —valen o no según la lista legal, no una regla copiada aquí— y la
 * ayuda, con la de la carga si la unidad carga. Lo pinta el panel de las dos
 * páginas (`panelDeBatalla`); la partida añade la rendición.
 *
 * Las líneas de la plantilla conservan su sangría de cuando vivían dentro de
 * `renderBattlePanel`: es marcado que el ancla de `test/fixtures/paneles.txt`
 * compara byte a byte.
 */
export function accionesDeLaUnidad(o: {
  readonly activa: BattleStack;
  /** Con qué cifras carga la activa (`CARGA`): todo el que pega cuerpo a cuerpo. */
  readonly carga: CifrasDeCarga;
  readonly legales: readonly BattleAction[];
  readonly pasos: number | null;
  readonly rendicion: Html;
  readonly hechizos: Html;
  /** Los botones de los poderes de la unidad (Curar: `botonesDePoder`); sin ellos, `NADA`. */
  readonly poderes: Html;
  /**
   * Los botones de la muralla —«Abrir puerta» y «Cerrar puerta», «Poner
   * escalera» y «Subir»—, donde la hay (la ciudad, el pueblo, la arena); si no, `NADA`.
   */
  readonly muralla: Html;
  /**
   * Por qué no puede salir de su casilla, como frase (`contactoBlocker`: rodeada,
   * lo que le queda no paga salir del contacto), o nada. Va en la misma
   * línea del marcado que lo que le queda: sin él, el ancla de
   * `test/fixtures/paneles.txt` no cambia.
   */
  readonly sinSalida?: string | null;
  /**
   * Si ha golpeado con Finta y le queda solo el tramo de andar: la ayuda lo dice en
   * vez de invitar a golpear (R2 de QA de #263).
   */
  readonly trasLaFinta?: boolean;
  /**
   * En qué modo está el selector de arma (`ArmaDeLaActiva.modo`): en «A distancia»
   * la ayuda es la del disparo o la de la granada. Lo dice la sesión, no se deduce de
   * la lista (hallazgo S4 de /simplify, 02-11-2026).
   */
  readonly modo: ModoDelArma;
}): Html {
  const quedan = o.pasos === null ? null : quedanCasillas(o.pasos);
  const sinSalida =
    o.sinSalida == null ? NADA : html`<p class="cost" data-sin-salida>${o.sinSalida}</p>`;
  // La ayuda dice lo que se puede hacer: tras la Finta, solo andar un tramo; rodeada,
  // solo golpear a quien tiene al lado (C2 de QA de #259: no hay hexágonos verdes).
  // Con el selector de arma en «A distancia» (`ArmaDeLaActiva`), la del disparo o
  // la de la granada.
  const tiro = tiroADistanciaDe(o.activa.unit);
  const ayuda =
    o.trasLaFinta === true
      ? html`Finta: puede andar ${quedan === null ? 'lo que le queda' : quedan[1]}; andar termina el turno.`
      : o.modo === 'distancia' && tiro === 'disparo'
        ? html`A distancia: pulsa cualquier casilla para apuntar. Apuntar termina el turno y el
         disparo sale al empezar el siguiente, al primero de la recta. Q cambia de arma.`
        : o.modo === 'distancia' && tiro === 'granada'
          ? html`Granada: pulsa una casilla a su alcance (${alcanceDeLaGranada(o.activa.unit)}) para lanzarla.
         Lanzar termina el turno; explota al empezar el siguiente, en la casilla y sus vecinas,
         a quien esté, también a los tuyos. Q cambia de arma.`
          : o.sinSalida != null
            ? html`Pasa el ratón por un enemigo a su lado para golpearlo.`
            : html`Haz clic en un hexágono verde para moverte —puedes moverte en varios tramos—,
         o pasa el ratón por un enemigo y elige desde qué casilla golpearlo.
         ${ayudaDeCarga(o.carga)}${tiro !== null ? html` Q cambia de arma.` : NADA}`;
  return html`<h3>Acciones</h3>
       ${quedan === null ? NADA : filaDeCifra(`Le ${quedan[0]}`, quedan[1])}${filaADistancia(o.activa)}${sinSalida}
       <div class="stack-list">
         <button data-action="battle-end-turn">Terminar turno</button>
         ${o.rendicion}${o.muralla}${o.poderes}
       </div>
       ${o.hechizos}
       <p class="cost" style="margin-top:.5rem"${o.trasLaFinta === true ? html` data-tras-la-finta` : NADA}>
         ${ayuda}
         Espacio termina el turno de la unidad.
       </p>`;
}

/** La fila del panel de la activa con su estado a distancia, o nada (como `estadoADistancia`). */
function filaADistancia(s: BattleStack): Html {
  let dicho: string;
  if (s.recargando > 0) {
    dicho = `recargando: ${recargaQueFalta(s.recargando)}`;
  } else if (lanzaGranadas(s.unit)) {
    const quedan = granadasQueQuedan(s);
    dicho = `${quedan} ${quedan === 1 ? 'granada' : 'granadas'}, alcance ${alcanceDeLaGranada(s.unit)}`;
  } else {
    return NADA;
  }
  return html`<div class="row" data-a-distancia><span class="label">A distancia</span><span>${dicho}</span></div>`;
}

/**
 * El libro de hechizos durante la batalla.
 *
 * Lo que no se puede lanzar sale apagado y con el motivo en el `title`: se ve a
 * la vez lo que tienes y lo que te falta, igual que un solar vacío del castillo.
 * Ni el `castable` ni el motivo se deciden aquí — los da `spellOptions()` de la
 * sesión, la partida o la arena; `elegido` es el hechizo de su libro.
 */
function renderSpells(elegido: string | null, opciones: readonly SpellOption[]): Html {
  if (opciones.length === 0) {
    return html`<h3>Hechizos</h3>
      <div class="stack-list"><div class="stack empty">Este héroe no conoce ninguno</div></div>`;
  }
  const botones = unir(
    opciones.map((o) => {
      // El elegido se marca con `primary`, no el resto con `empty`: `.empty` es
      // el gris de un hueco vacío, y con él un hechizo perfectamente lanzable se
      // veía apagado, igual que uno que no se puede pagar. Lo apagado lo pone
      // `button:disabled`, y así los dos estados no se confunden en pantalla.
      return html`<button data-action="battle-spell" data-spell="${o.id}"
        class="stack${elegido === o.id ? ' primary' : ''}"
        ${o.castable ? NADA : DESHABILITADO}
        title="${o.castable ? `Cuesta ${o.cost} de maná` : o.motivo}">
        <span>${o.name}</span><span class="count">${o.cost}</span>
      </button>`;
    }),
  );
  const opcion = opciones.find((o) => o.id === elegido);
  return html`<h3>Hechizos</h3><div class="stack-list">${botones}</div>
    ${opcion === undefined ? NADA : html`<p class="cost" style="margin-top:.5rem">${opcion.name}: ${quePulsar(opcion.apunta)}. Escape cancela.</p>`}`;
}

/**
 * Qué se pulsa con un hechizo elegido, por lo que apunta (`SpellOption.apunta`). Era
 * siempre «pulsa sobre la unidad objetivo», también con uno de casilla y uno de cadáver
 * (H4 de QA de «Levantar zombi», 09-11-2026). Uno sin objetivo se lanza al elegirlo
 * (`LibroDeBatalla.selectSpell`) y no llega a quedar elegido; si llegara, no se dice
 * que se pulse nada.
 */
function quePulsar(apunta: SpellOption['apunta']): string {
  switch (apunta) {
    case 'unidad':
      return 'pulsa sobre la unidad objetivo';
    case 'casilla':
      return 'pulsa la casilla donde lanzarlo';
    case 'cadaver':
      return 'pulsa la casilla del cadáver que levantar';
    case 'nada':
      return 'se lanza sin elegir sobre quién';
  }
}

/**
 * La línea de ayuda de la carga, con las cifras de la carga (`CARGA`: desde #260
 * carga todo el que pega cuerpo a cuerpo, y desde el 26-10-2026 todos cobran lo
 * mismo). Se dice
 * siempre y no solo si hay casillas de carga ahora: el texto explica cómo se ve,
 * también el turno en que no sale ninguna.
 */
function ayudaDeCarga(carga: CifrasDeCarga): Html {
  // El número que enseña la casilla son las casillas que corre: sin un ejemplo fijo,
  // que con el jinete despistaba (C3 de QA de #260).
  return html`Al enemigo en naranja se le puede cargar: pasa por él y elige la casilla con
         «»» y las casillas que corre (de ${CARGA_MINIMA} a ${carga.tope}, +${carga.porcentaje} % cada una).`;
}
