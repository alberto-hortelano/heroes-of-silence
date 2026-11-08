/**
 * Las piezas pequeñas de marcado que comparten las tres páginas —la partida, la arena y
 * el espectador—: la nota (`nota`, la forma única de toda aclaración), las pastillas de
 * lo que suma una pieza y de lo que lleva colgado un stack (`modificadoresEnPantalla`,
 * `modificadoresEnCurso`, con quién puso cada efecto y lo que dura), el color de lo que
 * suma o resta (`clase`), la historia de un héroe nacido de la tropa y el día de la
 * barra (`rotuloDeDia`). Puro y sin sesión: lo carga el espectador. Era parte de
 * `views/panels.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import {
  CARGA,
  type CargaDeLaRueda,
  dichoCortoDeLaCarga,
  dichoDeLaCarga,
  porcientoDeLaCarga,
} from '@core/battle/carga.js';
import {
  dichoCortoDelEfecto,
  dichoDelEfecto,
  enRondas,
  signoDelEfecto,
} from '@core/battle/effects.js';
import { type FormaDeLaRueda, nombreEnLaRueda } from '@core/battle/formas-de-la-rueda.js';
import { duracion } from '@core/battle/rueda.js';
import {
  type BattleState,
  type CuandoVence,
  MAX_ROUNDS,
  type StackEffect,
} from '@core/battle/types.js';
import { modificadoresDePieza, textoDeModificador } from '@core/equipo/dicho.js';
import type { Pieza } from '@core/equipo/pieza.js';
import { nombreDeHechizo } from '@core/magia/catalogo.js';
import { esTipoDeGolpe } from '@core/types.js';
import { type Html, html, NADA, unir } from '../comun/html.js';

/**
 * El día como se lee en la barra: «Día 3 · Semana 2». Lo usan la barra del que
 * juega, la del espectador y el guion de capturas, que la compara con su espejo.
 */
export function rotuloDeDia(day: number): string {
  return `Día ${((day - 1) % 7) + 1} · Semana ${Math.floor((day - 1) / 7) + 1}`;
}

/**
 * La historia que el narrador le escribió al héroe nacido de la tropa, o nada:
 * el inicial y el contratado no tienen. Es texto del agente y sale por la puerta
 * como todo; la comparten el panel del cliente y el del espectador.
 */
export function historiaDelHeroe(historia: string | null): Html {
  return historia === null ? NADA : html`<p class="cost historia">${historia}</p>`;
}

/**
 * Nombres de los RASGOS que ponen efectos. Los hechizos no están aquí: ya se
 * llaman a sí mismos en `data/hechizos.json`, y copiarlos era una segunda fuente
 * de verdad que se quedaría vieja al retocar el catálogo. Y ninguno lleva el
 * nombre de su criatura: el día que una segunda tenga `fear`, el nombre de la
 * primera en su terror sería mentira.
 */
const FUENTE_RASGO: Readonly<Record<string, string>> = {
  fear: 'Terror',
};

/**
 * Cómo se llama en el parte lo que puso un efecto. Si no es un rasgo ni un golpe de
 * la rueda, es un hechizo: el de la batalla (`libro`: la arena pelea con hechizos sin
 * guardar) o el del juego (`nombreDeHechizo`).
 */
export function nombreFuente(
  source: string,
  forma: FormaDeLaRueda,
  libro?: BattleState['libro'],
): string {
  // Lo que deja un golpe de la rueda (Defensivo, Romper guardia…), por el nombre que
  // le da la rueda de la batalla: en la de 3, «Rápido» aunque quite el ataque su
  // parte de Romper guardia (`EfectoDeLaRueda.fuente`).
  if (esTipoDeGolpe(source)) return nombreEnLaRueda(source, forma);
  return FUENTE_RASGO[source] ?? nombreDeHechizo(source, libro);
}

/**
 * Lo que dura un efecto colgado, dicho: «3 rondas», o, el de la rueda del golpe,
 * «hasta que empiece (o termine) su próximo turno» (`vence`, `duracion`); sus
 * rondas son solo el tope y contarlas sería mentir.
 */
export function duracionDeEfecto(e: {
  readonly rounds: number;
  readonly vence?: CuandoVence | undefined;
}): string {
  // Lo que dura toda la pelea (un hechizo, `MAX_ROUNDS`) no se cuenta en rondas.
  if (e.vence === undefined && e.rounds >= MAX_ROUNDS) return 'toda la pelea';
  return e.vence === undefined ? `durante ${enRondas(e.rounds)}` : duracion(e.vence, 'su');
}

/**
 * Un efecto que lleva colgado un stack, dicho entero: quién lo puso, qué hace y
 * lo que le queda («Defensivo: defensa +1 hasta que empiece su próximo turno»).
 * Con las mismas tres piezas que el parte (`nombreFuente`, `cifraDeEfecto`,
 * `duracionDeEfecto`), que lo dice al colgarse; esto lo dice mientras dura (la
 * vista previa de la rueda, #261).
 */
export function efectoEnCurso(
  e: StackEffect,
  forma: FormaDeLaRueda,
  libro?: BattleState['libro'],
): string {
  const dura = duracionDeEfecto({ rounds: e.roundsLeft, vence: e.hasta?.al });
  return `${nombreFuente(e.source, forma, libro)}: ${dichoDelEfecto(e)} ${dura}`;
}

/**
 * Lo que suma una pieza, pintado: un `.modificador` por cosa de
 * `modificadoresDePieza`, con su texto de `textoDeModificador` y la cifra en
 * `data-cifra` (la marca, en `data-marca`). La misma forma en la ficha de la
 * arena, el editor de equipo y los paneles del juego; donde no cabe marcado (un
 * `<option>`), `cifrasDePieza`, que es este mismo texto separado por comas.
 * `vacio`, lo que se dice si no suma nada.
 */
export function modificadoresEnPantalla(p: Pieza, vacio = 'no suma nada'): Html {
  const mods = modificadoresDePieza(p);
  if (mods.length === 0) return html`<span class="modificadores sin-modificadores">${vacio}</span>`;
  return html`<span class="modificadores">${unir(
    mods.map((m) =>
      pastilla(
        textoDeModificador(m),
        m.kind === 'cifra'
          ? html` data-cifra="${m.cifra}"`
          : m.kind === 'tiro'
            ? html` data-tiro="${m.cual.kind}"`
            : html` data-marca="${m.marca}"`,
      ),
    ),
  )}</span>`;
}

/**
 * Una pastilla de modificador (`.modificador`): la única forma de una, la de lo
 * que suma una pieza (`modificadoresEnPantalla`) y la de lo que lleva colgado un
 * stack (`modificadoresEnCurso`). `atributos`, lo que dice de qué es, con su
 * espacio delante.
 */
export function pastilla(texto: string, atributos: Html): Html {
  return html`<span class="modificador"${atributos}>${texto}</span>`;
}

/**
 * Lo que lleva colgado un stack ahora (`BattleStack.effects`: lo que deja la
 * rueda, los hechizos y los poderes), en pastillas cortas: una por efecto con lo
 * que hace (`cifraDeEfecto`: «ataque +3») y, con `carga`, la que cobra quien
 * golpea (`dichoCortoDeLaCarga`). Detrás, **una sola** nota con cada uno entero
 * —quién lo puso y cuánto le queda (`efectoEnCurso`), y la carga
 * (`dichoDeLaCarga`)—. `data-signo` dice si le suma o le resta, del signo de la
 * cifra que enseña (la del efecto; la de la carga, lo que suma); el equipo y el
 * rango no van: ya están en sus cifras. Sin nada, nada (ni el hueco). Lo pintan
 * «En el campo» (`listaDelCampo`) y los dos que se cruzan en la rueda.
 */
export function modificadoresEnCurso(
  efectos: readonly StackEffect[],
  forma: FormaDeLaRueda,
  carga: CargaDeLaRueda | null = null,
  libro?: BattleState['libro'],
): Html {
  if (efectos.length === 0 && carga === null) return NADA;
  const signo = (n: number): Html => html` data-signo="${n < 0 ? '−' : '+'}"`;
  const pastillas = efectos.map((e) =>
    pastilla(dichoCortoDelEfecto(e), html` data-efecto="${e.kind}"${signo(signoDelEfecto(e))}`),
  );
  const enteros = efectos.map((e) => efectoEnCurso(e, forma, libro));
  if (carga !== null) {
    const suma = porcientoDeLaCarga(carga.casillas, CARGA);
    pastillas.push(pastilla(dichoCortoDeLaCarga(carga.casillas), html` data-carga${signo(suma)}`));
    enteros.push(dichoDeLaCarga(carga.casillas, carga.montada));
  }
  return html`<span class="modificadores en-curso">${unir(pastillas)}${nota(enteros.join('; '))}</span>`;
}

/**
 * Una nota de la ficha: la forma única de toda aclaración (13-10-2026, el
 * usuario: «cualquier aclaración o nota debe ir como tooltip»). Un «ⓘ» con su
 * texto en `aria-label`; `style.css` lo enseña en un bocadillo junto al «ⓘ» al
 * pasar el ratón, al tocarlo o con el foco del teclado en él. Sin `title`: el
 * navegador pintaba su tooltip encima del bocadillo. Se alcanza con el tabulador
 * salvo la de una fila de cifras (`enfocable: false`): entre casilla y casilla,
 * el tabulador caía en el «ⓘ» de la fila siguiente; esa la lleva su casilla en
 * `aria-description`, y con el ratón o el dedo se abre como las demás.
 */
export function nota(texto: string, enfocable = true): Html {
  return html`<span class="nota" tabindex="${enfocable ? '0' : '-1'}" role="note" aria-label="${texto}" data-nota="si">ⓘ</span>`;
}

/**
 * Verde lo que te suma, rojo lo que te resta, sin color lo que ni una cosa ni
 * otra. Devuelve el atributo entero —con su espacio delante— o nada, así que
 * `<div${clase(...)}>` no deja un `class=""` colgando cuando no hay color.
 *
 * Vive aquí y no dentro de `renderLog` porque nació dentro y a la vez había
 * CINCO copias escritas a mano de lo mismo: cuatro en el parte de batalla y una
 * en el fin de la partida. Un helper que no cubre ni a su propia rama es un
 * helper que no existe.
 */
export function clase(bueno: boolean, malo: boolean): Html {
  return bueno ? html` class="win"` : malo ? html` class="lose"` : NADA;
}
