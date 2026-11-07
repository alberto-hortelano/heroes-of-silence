/**
 * El panel de la batalla de la arena (`renderPanelDeBatalla`): lo que solo tiene la
 * arena —quién mueve cada unidad, el resultado por lados, «Editar»— sobre las piezas
 * de la partida (`batalla/panel.ts`, `views/campo.ts`); lo que dice la barra de quién
 * mueve (`rotuloDelTurno`) y lo que la arena pone alrededor de los que se cruzan en la
 * rueda (`caraDeLaArena`, con su vista previa). Parte del marcado de la arena
 * (`arena/paneles/`, puro y sin DOM: ver `lista.ts`); era `arena/paneles.ts` hasta la
 * fase C de la reorganización (07-11-2026).
 */
import { LADOS, ladoDe } from '@core/arena/lados.js';
import { finalDeArena } from '@core/arena/montaje.js';
import { armaduraDe } from '@core/battle/armas.js';
import { CARGA } from '@core/battle/carga.js';
import { activeStack, isAlive } from '@core/battle/consultas.js';
import { ataqueYDefensaEnBatalla } from '@core/battle/golpe.js';
import { type BattleStack, type BattleState, MAX_ROUNDS } from '@core/battle/types.js';
import { textoDeModificador } from '@core/equipo/dicho.js';
import { conComa, conSigno } from '@core/texto.js';
import { NOMBRE_DE_CIFRA, SPEED_TO_HEXES, type UnitInfo } from '@core/types.js';
import { accionesDeLaUnidad, renderDespliegue, renderSpells } from '../../batalla/panel.js';
import { renderBattleLog } from '../../batalla/parte.js';
import { botonesDeArma, botonesDeMuralla, botonesDePoder } from '../../batalla/poderes.js';
import type { CaraDeLosContrincantes } from '../../batalla/rueda/rueda.js';
import { type Html, html, NADA } from '../../comun/html.js';
import { nombreEnElCampo } from '../../render/batalla/distintivo.js';
import type { SesionDeArena } from '../../sesion/sesion-de-arena.js';
import { listaDelCampo } from '../../views/campo.js';
import { apagadosPor, filaDeCifra } from '../../views/cifras.js';
import { rasgosDichos } from './bandos.js';
import { filasDeArmas } from './ficha.js';

/** Lo que el panel de la batalla lee de la sesión: la sesión misma, sin copiar su forma. */
export type VistaDeArena = Pick<
  SesionDeArena,
  | 'batallaALaVista'
  | 'despliegue'
  | 'semilla'
  | 'laLlevaLaIA'
  | 'turnoPropio'
  | 'battleLegalActions'
  | 'battleStepsLeft'
  | 'sinSalida'
  | 'trasLaFinta'
  | 'spellOptions'
  | 'heroeEnJuego'
  | 'hechizos'
  | 'muralla'
  | 'defensaEnLoAlto'
  | 'motivoDePoder'
  | 'arma'
  | 'apuntado'
  | 'prevision'
  | 'ruedaPendiente'
  | 'motivoDeLaRueda'
  | 'cuerpoDe'
>;

/**
 * Lo que dice la barra de arriba de quién mueve. Con la rueda esperando la
 * respuesta, toca responder aunque la unidad activa sea de la IA: decía «Mueve la
 * IA» mientras la cabecera de la rueda pedía la respuesta (H3 de QA, 13-10-2026).
 * Mientras se cuenta no adelanta el final.
 */
export function rotuloDelTurno(s: VistaDeArena, contandoAun: boolean): string {
  if (contandoAun) return 'Contando…';
  if (s.batallaALaVista.finished !== null) return 'Terminada';
  if (s.despliegue.enCurso !== null) return 'Despliegas';
  if (s.ruedaPendiente?.fase === 'respuesta') return 'Te toca responder';
  return s.turnoPropio === null ? 'Mueve la IA' : 'Te toca';
}

/**
 * El botón «Editar» de una unidad del campo (o del héroe): abre su ficha en el
 * editor de la batalla. Lo que se cambia vale para todo su tipo, ya.
 */
function botonDeEditar(x: BattleStack, nombre: string): Html {
  return html`<button class="editar-en-combate" data-arena="editar-en-combate" data-stack="${x.id}" title="Cambiar las cifras de ${nombre}: todo su tipo, ya en esta pelea">Editar</button>`;
}

/** Las cifras de un stack en la pelea a las que el equipo cambia algo (`delEquipo`). */
type CifraQueCambiaElEquipo = 'ataque' | 'defensa' | 'danio' | 'casillas';

/**
 * Lo que cambia el equipo una `cifra` de `u`: lo de ahora menos lo de su cuerpo
 * (`cuerpo`, el del stack sin equipo, `SesionDeArena.cuerpoDe`), en la pastilla de
 * toda suma de equipo, o nada si no cambia. Desde la fuerza y la agilidad
 * (25-10-2026) no es una suma: el peso resta agilidad, y con ella defensa, daño y
 * casillas, así que se dice la diferencia. La armadura no pasa por aquí: el cuerpo
 * no la lleva, toda es del equipo, y su fila la dice entera (`filasDelStack`).
 */
function delEquipo(u: UnitInfo, cuerpo: UnitInfo, cifra: CifraQueCambiaElEquipo): Html {
  if (u.equipo === undefined) return NADA;
  let dicho: string | null;
  switch (cifra) {
    case 'ataque':
    case 'defensa': {
      // Las dos son cifras de pieza: dichas como su modificador (`textoDeModificador`).
      const d = cifra === 'ataque' ? u.attack - cuerpo.attack : u.defense - cuerpo.defense;
      dicho = d === 0 ? null : textoDeModificador({ kind: 'cifra', cifra, valor: d });
      break;
    }
    case 'casillas': {
      const d = SPEED_TO_HEXES[u.speed] - SPEED_TO_HEXES[cuerpo.speed];
      dicho = d === 0 ? null : `${conSigno(d)} ${NOMBRE_DE_CIFRA.casillas}`;
      break;
    }
    case 'danio': {
      const a = u.damage[0] - cuerpo.damage[0];
      const b = u.damage[1] - cuerpo.damage[1];
      dicho =
        a === 0 && b === 0 ? null : `${conSigno(a)} / ${conSigno(b)} ${NOMBRE_DE_CIFRA.danio}`;
      break;
    }
  }
  if (dicho === null) return NADA;
  return html` <span class="modificador" data-cifra="${cifra}">${dicho}</span>`;
}

/**
 * Las cifras de un stack en la pelea, una fila cada una: vida, ataque y defensa
 * (los de la pelea al lado, `ataqueYDefensa`), daño y velocidad, cada una con lo
 * que le suma el equipo (`delEquipo`). Las leen el panel de la activa y la vista
 * previa de la rueda (`vistaPrevia`). `conArmas`: el daño, golpe a golpe con su
 * arma (`filasDeArmas`, el panel); si no, el del cuerpo a cuerpo, que es el de
 * la rueda, en una fila y sin notas (el bocadillo no se puede señalar).
 */
export function filasDelStack(
  s: Pick<VistaDeArena, 'batallaALaVista' | 'defensaEnLoAlto' | 'cuerpoDe'>,
  x: BattleStack,
  conArmas: boolean,
): Html {
  const b = s.batallaALaVista;
  const u = x.unit;
  const cuerpo = s.cuerpoDe(x);
  const danio =
    conArmas && u.equipo !== undefined
      ? filasDeArmas(u, (uso) => ataqueYDefensaEnBatalla(b, x, uso).ataque)
      : filaDeCifra('Daño', html`${u.damage[0]}–${u.damage[1]}${delEquipo(u, cuerpo, 'danio')}`);
  return html`${filaDeCifra('Vida', `${isAlive(x) ? x.topHp : 0} / ${u.hp} PV`)}
        ${filaDeCifra('Ataque / Defensa', html`${ataqueYDefensa(b, x, s.defensaEnLoAlto(x))}${delEquipo(u, cuerpo, 'ataque')}${delEquipo(u, cuerpo, 'defensa')}`)}
        ${armaduraDe(u) === 0 ? NADA : filaDeCifra(NOMBRE_DE_CIFRA.armadura, String(armaduraDe(u)))}
        ${danio}
        ${filaDeCifra('Velocidad', html`${SPEED_TO_HEXES[u.speed]} casillas${delEquipo(u, cuerpo, 'casillas')}`)}`;
}

/**
 * La vista previa de uno de los dos de la rueda (#261): su nombre, sus cifras
 * (`filasDelStack`) y si ya devolvió un golpe esta ronda. Todo del estado de la
 * batalla: lo que eligió el otro en la rueda no está ahí, va a ciegas en la
 * sesión. Lo que lleva colgado no va aquí: lo dice la cabecera de la rueda justo
 * al lado de su figura (`modificadoresEnCurso`, con lo que le queda en su nota).
 */
export function vistaPrevia(s: VistaDeArena, x: BattleStack): Html {
  return html`<strong class="nombre-de-la-previa">${nombreEnElCampo(s.batallaALaVista, x)}</strong>
    ${filasDelStack(s, x, false)}
    <div class="row"><span class="label">Contraataque</span><span data-contraataco="${x.retaliated ? 'si' : 'no'}">${x.retaliated ? 'ya devolvió un golpe esta ronda' : 'aún puede devolver uno esta ronda'}</span></div>`;
}

/**
 * Lo que la arena pone alrededor de la figura de los dos que se cruzan en la rueda
 * (#261; la figura es la común, `figuraDelContrincante`): en la rueda para elegir, un botón
 * que abre su ficha de solo lectura (`ficha-en-la-rueda`, `main.ts`) y, al pasar
 * el ratón o con el foco del teclado, su vista previa (`vistaPrevia`: del estado,
 * nunca lo elegido, que va a ciegas en la sesión).
 */
export function caraDeLaArena(s: VistaDeArena): CaraDeLosContrincantes {
  return {
    icono(x, nombre, paraElegir, figura) {
      if (!paraElegir) return html`<span class="icono-de-contrincante">${figura}</span>`;
      const previa = `previa-${x.id}`;
      return html`<button type="button" class="icono-de-contrincante" data-arena="ficha-en-la-rueda" data-stack="${x.id}" aria-label="${`Ficha de ${nombre}`}" aria-describedby="${previa}">${figura}</button><div class="vista-previa" id="${previa}" role="tooltip">${vistaPrevia(s, x)}</div>`;
    },
  };
}

/**
 * El ataque y la defensa con que pelea ahora: los suyos y, si cambian —un
 * efecto, defender, su héroe con la regla de fheroes2, lo alto de un muro—, los
 * de la pelea al lado. Salen del núcleo (`ataqueYDefensaEnBatalla`), las mismas
 * que cuenta el golpe; `enLoAlto` (`bonoEnLoAlto`) solo dice de dónde sale parte
 * de la defensa, que ya va dentro.
 */
function ataqueYDefensa(
  b: BattleState,
  s: Parameters<typeof ataqueYDefensaEnBatalla>[1],
  enLoAlto: number,
): string {
  const base = `${s.unit.attack} / ${s.unit.defense}`;
  const { ataque, defensa } = ataqueYDefensaEnBatalla(b, s);
  const alto = enLoAlto > 0 ? `, +${enLoAlto} de defensa en lo alto` : '';
  return ataque === s.unit.attack && defensa === s.unit.defense
    ? base
    : `${base} (en la pelea, ${conComa(ataque, 1)} / ${conComa(defensa, 1)}${alto})`;
}

/**
 * Quién gana y por qué, dicho por el lado del montaje con la causa del motor
 * (`finalDeArena`). Si se acabaron las rondas se dice con la regla del motor: sin
 * eso, «gana el derecho» tras cien rondas sin un rasguño parecía que el derecho
 * era más fuerte (H4 de QA). Y la caída de un héroe se dice como tal: contada
 * como «por tiempo», un Rayo en la ronda 1 salía como cien rondas sin vencedor
 * (H1 de QA del banco).
 */
function rotuloDelGanador(battle: BattleState): string {
  const fin = finalDeArena(battle);
  if (fin === null) return '';
  const quien = `el bando ${LADOS[fin.ganador].adjetivo}`;
  const perdedor = LADOS[fin.ganador === 'izquierda' ? 'derecha' : 'izquierda'].adjetivo;
  const cuando = `en la ronda ${battle.round}`;
  switch (fin.causa) {
    case 'heroe':
      return `Gana ${quien} ${cuando}: cayó el héroe del bando ${perdedor}.`;
    case 'sin_tropa':
      return `Gana ${quien} ${cuando}: el bando ${perdedor} no tiene a nadie en pie.`;
    case 'rendicion':
      return `Gana ${quien} ${cuando}: el bando ${perdedor} se rindió.`;
    case 'agotada': {
      const porque = fin.empate
        ? 'con las mismas unidades en pie, gana quien defiende'
        : 'gana quien tiene más unidades en pie';
      const sinVencedor =
        battle.round >= MAX_ROUNDS
          ? `Sin vencedor en ${MAX_ROUNDS} rondas: por tiempo`
          : `Sin vencedor ${cuando}: nadie puede actuar`;
      return `${sinVencedor}, ${porque}. Gana ${quien}.`;
    }
  }
}

/**
 * El panel lateral de la batalla. Las acciones, su ayuda —la de la carga
 * incluida— y la lista del campo son las piezas de la partida (`batalla/panel.ts`,
 * `views/campo.ts`); lo de aquí es lo que solo tiene la arena: quién mueve cada
 * unidad y el resultado por lados.
 *
 * @param contandoAun si el tablero aún cuenta la última jugada: con la batalla
 *   ya resuelta en el estado, el resultado se calla hasta que el tablero llega a
 *   él, como en el espectador.
 */
export function renderPanelDeBatalla(s: VistaDeArena, contandoAun: boolean): Html {
  // Lo que se ve (`batallaALaVista`): en el despliegue, sin el rival que aún no desplegó.
  const b = s.batallaALaVista;
  // Mientras el tablero cuenta, el estado ya va por delante de lo que se ve: el
  // parte, las vidas y la ficha de la activa contarían el final antes de que
  // llegue —con todo en IA, la pelea entera—. Se calla todo hasta que el tablero
  // alcanza al estado.
  if (contandoAun) {
    return html`${filaDeCifra('Ronda', '…')}
      <p>Contando la jugada…</p>`;
  }
  if (b.finished !== null) {
    return html`<h2>${rotuloDelGanador(b)}</h2>
      <p>Ronda ${b.round}. Semilla ${s.semilla}.</p>
      <div class="stack-list"><button data-arena="otra-vez" class="primary">Otra vez</button></div>
      <h3>Parte de guerra</h3>${renderBattleLog(b, null)}`;
  }
  // Cada uno en el campo: en el despliegue, sin «Editar» (aún no se pelea).
  const fila = (x: BattleStack, conBoton: boolean) => {
    const nombre = nombreEnElCampo(b, x);
    return {
      flecha: x.side === LADOS.izquierda.bando ? '▶' : '◀',
      nombre,
      cuenta: `${x.topHp} PV · ${s.laLlevaLaIA(x.id) ? 'IA' : 'tú'}`,
      ...(conBoton ? { boton: botonDeEditar(x, nombre) } : {}),
    };
  };
  // El despliegue de un bando «Yo»: el panel de la partida (`renderDespliegue`).
  const desplegando = s.despliegue.enCurso;
  if (desplegando !== null) {
    return renderDespliegue(s.despliegue, b, {
      quien: `bando ${LADOS[ladoDe(desplegando.side)].adjetivo}`,
      apagado: null,
      fila: (x) => fila(x, false),
    });
  }
  const activa = activeStack(b);
  const mia = s.turnoPropio !== null;
  const rasgos = activa === null ? '' : rasgosDichos(activa.unit.traits);
  const ficha =
    activa === null
      ? NADA
      : html`<h2>${nombreEnElCampo(b, activa)} ${botonDeEditar(activa, nombreEnElCampo(b, activa))}</h2>
        ${filaDeCifra('Bando', LADOS[ladoDe(activa.side)].rotulo)}
        ${filaDeCifra('La mueve', s.laLlevaLaIA(activa.id) ? 'la IA' : 'tú')}
        ${filasDelStack(s, activa, true)}
        ${rasgos === '' ? NADA : filaDeCifra('Rasgos', rasgos)}`;
  const heroe = s.heroeEnJuego;
  // Con la rueda en la respuesta, lo que se juega es eso (la activa es quien
  // pega, y puede ser de la IA): ni sus botones ni «Mueve la IA».
  const acciones =
    s.ruedaPendiente?.fase === 'respuesta'
      ? html`<p>Te toca responder en la rueda.</p>`
      : mia && activa !== null
        ? apagadosPor(
            s.motivoDeLaRueda,
            accionesDeLaUnidad({
              activa,
              carga: CARGA,
              legales: s.battleLegalActions(),
              pasos: s.battleStepsLeft(),
              sinSalida: s.sinSalida(),
              trasLaFinta: s.trasLaFinta(),
              modo: s.arma.modo,
              rendicion: NADA,
              poderes: html`${botonesDeArma(s, activa)}${botonesDePoder(s, activa)}`,
              hechizos:
                heroe === null ? NADA : renderSpells(s.hechizos.selectedSpell, s.spellOptions()),
              muralla: botonesDeMuralla(s, b, activa),
            }),
          )
        : html`<p>Mueve la IA…</p>`;
  const mana =
    heroe === null
      ? NADA
      : filaDeCifra(`Maná de ${heroe.mando.name}`, `${heroe.mando.mana} / ${heroe.manaMaximo}`);
  const campo = listaDelCampo(b, (x) => fila(x, true));
  return html`${ficha}
    ${filaDeCifra('Ronda', String(b.round))}
    ${mana}
    <div class="botones-de-la-pelea"><button data-arena="ir-a-equipo" title="Cambia una pieza de equipo: vale ya para todos los que la llevan, de los dos bandos">Editar equipo</button></div>
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${campo}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(b, null)}`;
}
