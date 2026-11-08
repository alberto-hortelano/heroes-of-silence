/**
 * El panel de la batalla de la partida (`renderBattlePanel`): lo que la partida pone en
 * el panel de la batalla de las dos páginas (`panelDeBatalla`, `batalla/panel.ts`, desde
 * R2 de la reorganización, 07-11-2026): «Victoria» o «Derrota», la ficha de la activa
 * con su bando dicho desde la persona («Tú», «Enemigo»), el maná de su héroe, la
 * rendición y «Turno del enemigo…». Hasta R2 era el panel entero, en `batalla/panel.ts`.
 */
import type { BattleFinish, BattleStack, BattleState } from '@core/battle/types.js';
import { maxMana } from '@core/hero/hero.js';
import { panelDeBatalla } from '../../batalla/panel.js';
import { renderBattleLog } from '../../batalla/parte.js';
import { DESHABILITADO, type Html, html, NADA } from '../../comun/html.js';
import { nombreEnElCampo } from '../../render/batalla/distintivo.js';
import type { Session } from '../../sesion/partida.js';
import { marcaDeComandante, marcaDeVeterano } from '../../views/campo.js';
import { filaDeCifra } from '../../views/cifras.js';

/**
 * @param contandoAun si el tablero de batalla aún cuenta la última jugada: sus
 *   botones salen apagados.
 */
export function renderBattlePanel(session: Session, contandoAun: boolean): Html {
  // El bando de la persona lo DERIVA la sesión del dueño de la batalla; aquí no
  // se supone. Decir «Tú» al atacante era la misma suposición que el ciclo de
  // #29 quitó del servidor, y le habría cantado «Victoria» a quien acababa de
  // perder el castillo el primer día que la persona defienda.
  const mio = session.miBando;
  return panelDeBatalla(session, contandoAun, {
    final: (battle, fin) => finalDeLaBatalla(session, battle, fin),
    quienDespliega: () => null,
    ficha: (battle, s) =>
      s === null
        ? html`<p>Sin unidad activa.</p>`
        : html`<h2>${nombreEnElCampo(battle, s)}</h2>
        ${filaDeCifra('Bando', s.side === mio ? 'Tú' : 'Enemigo')}
        ${filaDeCifra('Efectivos', String(s.count))}
        ${filaDeCifra('Moral', String(s.morale))}`,
    fila: (battle: BattleState, x: BattleStack) => ({
      flecha: x.side === mio ? '▶' : '◀',
      nombre: `${marcaDeComandante(x)}${nombreEnElCampo(battle, x)}${marcaDeVeterano(x)}`,
      cuenta: x.count,
    }),
    mana: () => filaManaDeBatalla(session),
    botones: NADA,
    rendicion: () => renderRendicion(session),
    sinHeroe: SIN_HEROE_EN_LA_BATALLA,
    turnoAjeno: html`<p>Turno del enemigo…</p>`,
    mio,
  });
}

/**
 * La batalla terminada, desde la persona: «Victoria» o «Derrota», y el parte. Rendirse
 * no es caer: el héroe vuelve a la base con la tropa que salvó. Quien se rinde es
 * siempre el que pierde, así que en la derrota basta con saber si hubo rendición.
 */
function finalDeLaBatalla(session: Session, battle: BattleState, fin: BattleFinish): Html {
  const mio = session.miBando;
  const gane = fin.winner === mio;
  const rendicion = fin.surrender;
  const derrota =
    rendicion === undefined
      ? 'Tu héroe ha caído.'
      : `Te has rendido por ${rendicion.gold} de oro: tu héroe vuelve a la base con la tropa viva.`;
  return html`<h2>${gane ? 'Victoria' : 'Derrota'}</h2>
      <p>${gane ? 'El campo es tuyo.' : derrota}</p>
      ${gane || rendicion !== undefined ? filaManaDeBatalla(session) : NADA}
      <h3>Parte de guerra</h3>${renderBattleLog(battle, mio)}`;
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
