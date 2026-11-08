/**
 * «En el campo» de la batalla, una forma para las tres páginas: una fila por unidad en
 * pie con lo que lleva colgado (`listaDelCampo`), lo que dice su arma a distancia
 * (`estadoADistancia`: la recarga y las granadas) y las marcas del comandante y del
 * veterano junto a su nombre. Qué dice cada fila lo pone quien llama (`FilaDelCampo`).
 * Puro y sin lienzo: lo carga el espectador, que pinta con él su lista desde R2 de la
 * reorganización (07-11-2026; hasta entonces, con su copia, sin lo que lleva colgado).
 * Era parte de `views/panels.ts` hasta la fase C de la reorganización.
 */
import { granadasQueQuedan } from '@core/battle/a-distancia.js';
import { cargasDe, lanzaGranadas } from '@core/battle/armas.js';
import { formaDeLaBatalla } from '@core/battle/formas-de-la-rueda.js';
import { type BattleStack, type BattleState, rangoDeVeterania } from '@core/battle/types.js';
import { type Html, html, NADA, unir } from '../comun/html.js';
import { MARCA_DE_COMANDANTE } from '../render/palette.js';
import { modificadoresEnCurso, pastilla } from './notas.js';

/** Lo que dice una fila de «En el campo» (`listaDelCampo`): lo pone cada página. */
export interface FilaDelCampo {
  /** Delante del nombre: de qué lado es (la partida y la arena, ▶ y ◀; el espectador, el color de su dueño). */
  readonly flecha: string | Html;
  readonly nombre: string;
  readonly cuenta: string | number;
  /** Un botón al final de la fila (la arena: «Editar»); sin él, nada. */
  readonly boton?: Html;
}

/**
 * «En el campo»: una fila por unidad en pie, la activa resaltada. Qué dice cada
 * fila lo pone quien llama —la partida, «Tú/Enemigo» y efectivos; la arena, los
 * PV y quién la mueve; el espectador, el color de su dueño y efectivos—; la forma
 * es una.
 */
export function listaDelCampo(battle: BattleState, fila: (x: BattleStack) => FilaDelCampo): Html {
  const forma = formaDeLaBatalla(battle);
  return unir(
    battle.stacks
      .filter((x) => x.count > 0)
      .map((x) => {
        const f = fila(x);
        // Lo que lleva colgado, en su propia línea debajo (`modificadoresEnCurso`,
        // `.con-efectos`): la misma forma en las tres páginas, y una fila
        // sin nada, como siempre.
        const aDistancia = estadoADistancia(x);
        const conEfectos = x.effects.length > 0 || aDistancia !== NADA;
        return html`<div class="stack${x.id === battle.turno?.stack ? '' : ' empty'}${conEfectos ? ' con-efectos' : ''}">
          <span>${f.flecha} ${f.nombre}</span>
          <span class="count">${f.cuenta}</span>${f.boton ?? NADA}${modificadoresEnCurso(x.effects, forma)}${aDistancia}
        </div>`;
      }),
  );
}

/**
 * Lo que dice de `s` su arma a distancia en esta batalla (02-11-2026): los turnos
 * de recarga que le faltan a un arma de fuego y las granadas que le quedan, en
 * pastillas como los efectos. Nada si no recarga ni lleva granada. Lo pinta «En el
 * campo» (`listaDelCampo`), en las tres páginas; el panel de la activa lo dice en su
 * fila (`filaADistancia`).
 */
function estadoADistancia(s: BattleStack): Html {
  const pastillas: Html[] = [];
  if (s.recargando > 0) {
    pastillas.push(
      pastilla(`Recargando: ${s.recargando}`, html` data-recarga="${String(s.recargando)}"`),
    );
  }
  if (lanzaGranadas(s.unit)) {
    const quedan = granadasQueQuedan(s);
    pastillas.push(
      pastilla(
        `Granadas: ${quedan} de ${cargasDe(s.unit)}`,
        html` data-granadas="${String(quedan)}"`,
      ),
    );
  }
  if (pastillas.length === 0) return NADA;
  return html`<span class="modificadores a-distancia">${unir(pastillas)}</span>`;
}

/**
 * La corona delante del nombre del comandante: la misma que lleva en el
 * tablero (`MARCA_DE_COMANDANTE`), para que la figura y su fila se reconozcan
 * como la misma pieza. Texto, y no marcado: la pone `html` en su hueco.
 */
export function marcaDeComandante(s: BattleStack): string {
  return s.origen.kind === 'heroe' ? `${MARCA_DE_COMANDANTE} ` : '';
}

/**
 * El rango de un veterano detrás de su nombre en «En el campo», o nada: la fila
 * dice con palabras lo que la figura dice con galones (`galonesDe`, en
 * `render/batalla/figura.ts`, que este módulo no importa: es puro y lo carga el
 * espectador sin lienzo).
 */
export function marcaDeVeterano(s: BattleStack): string {
  const rango = rangoDeVeterania(s.origen);
  return rango > 1 ? ` · rango ${rango}` : '';
}
