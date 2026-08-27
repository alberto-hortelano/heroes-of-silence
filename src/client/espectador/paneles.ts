/**
 * El panel lateral del espectador: puro, sin DOM, y por eso con tests.
 *
 * Vivía dentro de `main.ts`, que toca `document` nada más importarse, así que
 * **no se podía probar**: `vitest` corre en `node`. Eso no era un detalle de
 * ergonomía — es lo que dejó pasar B-1, un `?? -1` que paraba la página entera en
 * la primera batalla contra un monstruo neutral, algo que un test de tres líneas
 * habría cazado. Aquí dentro no hay ni un `document`: entra una `SpectatorView` y
 * sale marcado.
 *
 * Todo sale por la puerta de `html.ts`, incluido el `directorLog`, que lleva el
 * `reasoning` del agente: 2000 caracteres de prosa libre de un modelo, que es el
 * texto ajeno más ancho que hay en el cable.
 */
import type { Side } from '@core/battle/types.js';
import { creature } from '@core/data.js';
import type { SpectatorView, VistaBatalla } from '../../server/vista-espectador.js';
import { NADIE } from '../desenlace.js';
import { fondoDeColor, type Html, html, NADA, unir } from '../html.js';
import { playerColor } from '../render/palette.js';
import { renderBattleLog, renderLog } from '../views/panels.js';

/**
 * Quien mira no es ningún jugador, así que no tiene un «tú».
 *
 * `renderLog` escribe «Tú» para los hechos de `viewer`; con un id que no es de
 * nadie la crónica entera se lee en tercera persona —«El jugador 0 construye…»—,
 * que es lo correcto para quien ve la partida desde fuera. Lo mismo hace el parte
 * de guerra con `mio: null`: sin bando propio no pinta victorias ni derrotas.
 *
 * Se re-exporta y no se declara: el dueño es `desenlace.ts`, que es el único
 * sitio donde «no tienes bando» y «no es tu bando» dan respuestas distintas.
 * Declararlo aquí y compararlo allí eran dos `-1` que nadie comparaba.
 */
export { NADIE };

/** Cómo terminó la partida, tal y como llega en el snapshot. */
export interface FinDePartida {
  readonly winner: number | null;
  readonly note: string;
}

export function panelDelEspectador(v: SpectatorView, fin: FinDePartida | null): Html {
  return html`${finDeLaPartida(fin)}${jugadores(v)}${batalla(v)}${crónica(v)}${vozDelDirector(v)}`;
}

/**
 * Criterio 9: se ve terminar la partida y quién ganó.
 *
 * Es lo mismo que `game_over` le dice al agente en vez de dejarlo colgado; aquí
 * es una línea arriba del todo, no un `alert` ni un silencio. Y **también cuando
 * no gana nadie**: una partida que se agota sin resolver dejaba al espectador en
 * el último día sin una línea, que es justo lo que este criterio prohíbe.
 */
function finDeLaPartida(fin: FinDePartida | null): Html {
  if (fin === null) return NADA;
  return html`<h2>Fin de la partida</h2>
    <p class="cost">${fin.note}</p>`;
}
function jugadores(v: SpectatorView): Html {
  return html`<h3>Jugadores</h3>
    <div class="stack-list">${unir(
      v.players.map((p) => {
        const castillos = v.towns.filter((t) => t.owner === p.id).length;
        const heroes = v.heroes.filter((h) => h.owner === p.id).length;
        const estado = p.defeated ? 'derrotado' : `${castillos} cast · ${heroes} hér`;
        return html`<div class="stack">
          <span>${bandera(p.id)} jugador ${p.id} · ${p.faction}</span>
          <span class="count">${estado}</span>
        </div>
        <div class="row"><span class="label">oro</span><span>${p.resources.gold}</span></div>
        <div class="row"><span class="label">explorado</span><span>${p.fog.length} casillas</span></div>
        ${unir(
          v.heroes
            .filter((h) => h.owner === p.id)
            // El nombre del héroe SÍ se pinta, y es el criterio 8 («los héroes»)
            // pero también la fuga que señaló la crítica: `hireHero` lo deriva del
            // pueblo (`Capitán de ${town.name}`), o sea que un nombre de pueblo
            // que escriba el agente acaba aquí. Sale por la puerta como todo.
            .map(
              (h) => html`<div class="stack empty">
                <span>${h.name}</span><span class="count">${h.movePoints}</span>
              </div>`,
            ),
        )}`;
      }),
    )}</div>`;
}

/**
 * El cuadradito de color del jugador, igual que el que pinta el mapa. `null` es
 * el bando de un monstruo neutral, y `playerColor` ya sabe pintarlo gris.
 *
 * Aquí había un `?? -1` «por si acaso» que costó el ciclo entero: cogía el
 * `null` que la función SÍ trata —es su primera línea— y lo convertía en un −1
 * que no trata nadie. **Una defensa que convierte un caso soportado en uno
 * imposible es peor que no poner ninguna**, y esta paraba la página en la
 * primera batalla contra un monstruo, que es juego normal.
 */
function bandera(id: number | null): Html {
  return html`<span class="swatch"${fondoDelJugador(id)}></span>`;
}

/**
 * `playerColor` da un `#rrggbb`; `fondoDeColor` lo valida y escribe el atributo
 * entero. Un hueco dentro de `style="…"` lo rechaza la puerta —escapar comillas
 * no para una declaración de estilo de más—, y este es el camino que sí pasa.
 */
function fondoDelJugador(id: number | null): Html {
  return fondoDeColor(playerColor(id));
}

export function batalla(v: SpectatorView): Html {
  if (v.battle === null) return NADA;
  const { estado, dueños } = v.battle;
  const deQuien = (side: Side): Html => {
    const id = dueños[side];
    return id === null ? html`neutral` : html`${bandera(id)} jugador ${id}`;
  };
  return html`<h3>Batalla · ronda ${estado.round}</h3>
    <div class="row"><span class="label">atacante</span><span>${deQuien('attacker')}</span></div>
    <div class="row"><span class="label">defensor</span><span>${deQuien('defender')}</span></div>
    <div class="stack-list">${unir(
      estado.stacks
        .filter((s) => s.count > 0)
        .map(
          (s) => html`<div class="stack${s.id === estado.activeId ? '' : ' empty'}">
            <span>${bandera(dueños[s.side])} ${creature(s.creature).name}</span>
            <span class="count">${s.count}</span>
          </div>`,
        ),
    )}</div>
    ${parteDeGuerra(estado)}`;
}

/**
 * «Y qué acaba de pasar», que es la mitad del criterio 16 que el tablero solo no
 * cuenta: con los fotogramas llegando en ráfaga, las unidades cambian de sitio y
 * de tamaño y no se sabe quién pegó a quién.
 *
 * El dato ya viajaba dentro de `battle.log`; lo que faltaba era pintarlo. Va con
 * `mio: null` porque el espectador no lleva bando: sin él, `renderBattleLog` no
 * pinta victorias ni derrotas, solo lo que pasó.
 */
function parteDeGuerra(estado: VistaBatalla['estado']): Html {
  return html`<h3>Parte de guerra</h3>${renderBattleLog(estado, null)}`;
}

function crónica(v: SpectatorView): Html {
  return html`<h3>Crónica</h3>${renderLog(v.log, NADIE)}`;
}

/**
 * Lo que va diciendo el director, **y ahí dentro va el `reasoning` del agente**.
 *
 * Es el texto ajeno más ancho que hay en el cable —2000 caracteres de prosa libre
 * de un modelo, `z.string().max(2000)`— y hasta ahora no lo pintaba nadie. Por
 * eso este ciclo empieza por la puerta de escapar y no por esta página: aquí sale
 * por `html`, como todo lo demás.
 */
function vozDelDirector(v: SpectatorView): Html {
  if (v.directorLog.length === 0) return NADA;
  return html`<h3>El director</h3>
    <div class="log">${unir(v.directorLog.map((linea) => html`<div>${linea}</div>`))}</div>`;
}
