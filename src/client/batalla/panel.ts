/**
 * El panel de la batalla de la partida (`renderBattlePanel`) y lo que comparte con el de
 * la arena (`arena/paneles`): el despliegue (`renderDespliegue`), lo que puede hacer la
 * unidad activa (`accionesDeLaUnidad`) y el libro de hechizos (`renderSpells`). Los dos
 * paneles aún no son uno (R2 de la reorganización). Era parte de `views/panels.ts`
 * hasta la fase C de la reorganización (07-11-2026).
 */
import { granadasQueQuedan, recargaQueFalta } from '@core/battle/a-distancia.js';
import { lanzaGranadas, tiroADistanciaDe } from '@core/battle/armas.js';
import { quedanCasillas } from '@core/battle/board.js';
import { CARGA, CARGA_MINIMA, type CifrasDeCarga } from '@core/battle/carga.js';
import { activeStack, stackById } from '@core/battle/consultas.js';
import { alcanceDeLaGranada } from '@core/battle/granada.js';
import type { BattleAction, BattleStack, BattleState } from '@core/battle/types.js';
import { maxMana } from '@core/hero/hero.js';
import { COMO_SE_COLOCA } from '../comun/dichos.js';
import { DESHABILITADO, type Html, html, NADA, unir } from '../comun/html.js';
import { nombreEnElCampo } from '../render/batalla/distintivo.js';
import type { ModoDelArma } from '../sesion/batalla/arma.js';
import type { SpellOption } from '../sesion/batalla/control.js';
import type { DespliegueEnPantalla } from '../sesion/batalla/despliegue.js';
import type { Session } from '../sesion/partida.js';
import { listaDelCampo, marcaDeComandante, marcaDeVeterano } from '../views/campo.js';
import { AVISO_DE_ESPERA, apagadosPor, filaDeCifra, motivoParaApagar } from '../views/cifras.js';
import { renderBattleLog } from './parte.js';
import { botonesDeArma, botonesDeMuralla, botonesDePoder } from './poderes.js';

export function renderBattlePanel(session: Session, contandoAun: boolean): Html {
  // Lo que se ve (`batallaALaVista`): en el despliegue, sin el rival que aún no ha
  // desplegado; el defensor despliega sin ver la lista del atacante.
  const battle = session.batallaALaVista;
  if (battle === null) return NADA;

  // El bando de la persona lo DERIVA la sesión del dueño de la batalla; aquí no
  // se supone. Decir «Tú» al atacante era la misma suposición que el ciclo de
  // #29 quitó del servidor, y le habría cantado «Victoria» a quien acababa de
  // perder el castillo el primer día que la persona defienda.
  const mio = session.miBando;

  if (battle.finished !== null) {
    const gane = battle.finished.winner === mio;
    // Rendirse no es caer: el héroe vuelve a la base con la tropa que salvó.
    // Quien se rinde es siempre el que pierde, así que en la derrota basta con
    // saber si hubo rendición.
    const rendicion = battle.finished.surrender;
    const derrota =
      rendicion === undefined
        ? 'Tu héroe ha caído.'
        : `Te has rendido por ${rendicion.gold} de oro: tu héroe vuelve a la base con la tropa viva.`;
    return html`<h2>${gane ? 'Victoria' : 'Derrota'}</h2>
      <p>${gane ? 'El campo es tuyo.' : derrota}</p>
      ${gane || rendicion !== undefined ? filaManaDeBatalla(session) : NADA}
      <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
  }

  const fila = (x: BattleStack) => ({
    flecha: x.side === mio ? '▶' : '◀',
    nombre: `${marcaDeComandante(x)}${nombreEnElCampo(battle, x)}${marcaDeVeterano(x)}`,
    cuenta: x.count,
  });

  // El despliegue: lo propio y el rival que ya desplegó, nunca el que aún no.
  if (session.despliegue.enCurso !== null) {
    return renderDespliegue(session.despliegue, battle, {
      quien: null,
      apagado: contandoAun ? AVISO_DE_ESPERA : null,
      fila,
    });
  }

  const s = activeStack(battle);
  const activo =
    s === null
      ? html`<p>Sin unidad activa.</p>`
      : html`<h2>${nombreEnElCampo(battle, s)}</h2>
        ${filaDeCifra('Bando', s.side === mio ? 'Tú' : 'Enemigo')}
        ${filaDeCifra('Efectivos', String(s.count))}
        ${filaDeCifra('Moral', String(s.morale))}`;

  const suTurno = s !== null && s.side === mio;
  const acciones = suTurno
    ? apagadosPor(
        motivoParaApagar(session, contandoAun),
        accionesDeLaUnidad({
          activa: s,
          carga: CARGA,
          legales: session.battleLegalActions(),
          pasos: session.battleStepsLeft(),
          rendicion: renderRendicion(session),
          // Una base que se defiende sola (#116) no tiene héroe: no hay libro que
          // enseñar, y «Este héroe no conoce ninguno» hablaba de uno que no está.
          hechizos:
            battle.heroes[s.side] === null
              ? SIN_HEROE_EN_LA_BATALLA
              : renderSpells(session.hechizos.selectedSpell, session.spellOptions()),
          // La de la ciudad o el pueblo (fase 2 del puesto fronterizo): escalera y
          // subir al que ataca, la puerta al que defiende; sin muralla, nada.
          muralla: botonesDeMuralla(session, battle, s),
          poderes: html`${botonesDeArma(session, s)}${botonesDePoder(session, s)}`,
          modo: session.arma.modo,
        }),
      )
    : html`<p>Turno del enemigo…</p>`;

  // El maná del héroe, junto a la ficha de la unidad activa: es un recurso de la
  // batalla entera, no del stack, y sin verlo no se decide si lanzar.
  const mana = filaManaDeBatalla(session);

  const orden = listaDelCampo(battle, fila);

  return html`${activo}
    ${filaDeCifra('Ronda', String(battle.round))}
    ${mana}
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${orden}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
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
 * `null`; `apagado`, el motivo para apagar los botones (la jugada que se cuenta);
 * `fila`, cómo dice cada página a cada uno en el campo.
 */
export function renderDespliegue(
  d: DespliegueEnPantalla,
  battle: BattleState,
  o: {
    readonly quien: string | null;
    readonly apagado: string | null;
    readonly fila: Parameters<typeof listaDelCampo>[1];
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
  return html`${apagadosPor(
    o.apagado,
    html`<h2>Despliegue${o.quien === null ? NADA : html` · ${o.quien}`}</h2>
    <p>${fraseDeLaTanda(ahora)}</p>
    <h3>Colocar</h3>
    <div class="stack-list" data-despliegue="${String(ahora.tanda)}">${botones}</div>
    <p class="cost" style="margin-top:.5rem">Para colocar, ${COMO_SE_COLOCA}</p>
    <div class="stack-list"><button data-action="desplegado" class="primary">Listo</button></div>`,
  )}
    <h3>En el campo</h3><div class="stack-list">${listaDelCampo(battle, o.fila)}</div>`;
}

/**
 * La fila de Maná del héroe de la persona en la batalla, o nada si no lleva.
 * Sale también al terminar, si el héroe sigue en pie (ganó o se rindió): ese
 * número es el que decide si toca volver al castillo a dormir, y la fila
 * desaparecía justo entonces (#54). Con el héroe caído no hay nada que decidir.
 */
function filaManaDeBatalla(session: Session): Html {
  const heroe = session.battleHero;
  return heroe === null ? NADA : filaDeCifra('Maná', `${heroe.mana} / ${maxMana(heroe)}`);
}

/**
 * Lo que puede hacer la unidad activa de la persona: las casillas que le quedan,
 * los tres botones —valen o no según la lista legal, no una regla copiada aquí:
 * tras moverse ya no se defiende ni se espera (decisión del usuario)— y la
 * ayuda, con la de la carga si la unidad carga. Lo comparten la partida y la
 * arena; la partida añade la rendición y el libro, que la arena no tiene.
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
   * escalera» y «Subir»—, donde la hay (la arena); si no, `NADA`.
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
   * Si ha golpeado con Finta y le queda solo el tramo de andar (la rueda de la
   * arena): la ayuda lo dice en vez de invitar a golpear (R2 de QA de #263).
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
 * El botón de rendirse, con su precio. Apagado y con el motivo en el `title`
 * cuando no se puede —sin base, defendiéndola o sin oro—, igual que un hechizo:
 * la frase la escribe el núcleo (`surrenderBlocker`).
 */
function renderRendicion(session: Session): Html {
  const opcion = session.surrenderOption();
  if (opcion === null) return NADA;
  const rotulo = `Rendirse (${opcion.coste} oro)`;
  return opcion.motivo === null
    ? html`<button data-action="battle-surrender">${rotulo}</button>`
    : html`<button data-action="battle-surrender" ${DESHABILITADO} title="${opcion.motivo}">${rotulo}</button>`;
}

/** La sección de hechizos de un bando sin héroe en la batalla: nadie lanza. */
const SIN_HEROE_EN_LA_BATALLA = html`<h3>Hechizos</h3>
  <div class="stack-list"><div class="stack empty">Sin héroe en esta batalla: nadie lanza hechizos</div></div>`;

/**
 * El libro de hechizos durante la batalla.
 *
 * Lo que no se puede lanzar sale apagado y con el motivo en el `title`: se ve a
 * la vez lo que tienes y lo que te falta, igual que un solar vacío del castillo.
 * Ni el `castable` ni el motivo se deciden aquí — los da `spellOptions()` de la
 * sesión, la partida o la arena; `elegido` es el hechizo de su libro.
 */
export function renderSpells(elegido: string | null, opciones: readonly SpellOption[]): Html {
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
    ${opcion === undefined ? NADA : html`<p class="cost" style="margin-top:.5rem">${opcion.name}: pulsa sobre la unidad objetivo. Escape cancela.</p>`}`;
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
