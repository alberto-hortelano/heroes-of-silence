/**
 * La pantalla de inicio (19-10-2026): antes de montar la partida, si la URL no
 * pide ninguna, pregunta qué jugar —«Nuevo juego» (la elección de facción y de la
 * complejidad del combate), «Cargar partida» (apagado: no hay guardado) o
 * «Partida rápida»— y lo deja escrito en la URL (`?seed=N&faccion=<id>` con la
 * complejidad, o `?seed=N&heroe=<tipo>` en la rápida). El héroe de «Nuevo juego»
 * se elige y se paga en la base, ante el ayuntamiento (22-10-2026): sin
 * `?heroe=`, la partida pregunta allí; la rápida lleva el de por defecto, ya
 * elegido. «Volver» y Escape retroceden un paso. La URL es la única fuente: el
 * menú, una recarga y un enlace entran por el mismo lector, el de `main.ts`, que
 * es quien la valida. Hasta elegir no existe `Session`, ni el mapa, ni su Worker
 * del suelo: `main.ts` se carga después (`entrada.ts`).
 *
 * Lo que se ve lo pinta `pantallas.ts`; aquí solo se conduce. Al marcar una
 * facción (el clic, el dedo o las flechas) se viste la página con su tema
 * (`ponerTema`); pasar el puntero o el foco por otra no la viste (20-10-2026: «que
 * no cambie de tema en hover sino en click»). El menú va en el neutro
 * (`quitarTema`).
 */

import type { ReglasDelCombate } from '@core/combate.js';
import { heroePorDefectoDeLaSemilla } from '@core/state/setup.js';
import { esFaccion, FACTION_IDS, type FactionId } from '@core/types.js';
import { combateALaURL, combateParaElMenu } from '../combate-en-la-url.js';
import { pintar } from '../html.js';
import { aLaBarra, semillaSorteada } from '../semilla.js';
import { ponerTema, quitarTema } from '../temas.js';
import { leerElCombate, leerSoloHeroe } from '../views/combate.js';
import { renderEleccion, renderMenu } from './pantallas.js';

function deLaPagina<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`la página no tiene #${id}: ¿es el index.html de la partida?`);
  return el as T;
}

/**
 * Lo que se elija en el menú, escrito en la URL. Se cumple cuando hay partida
 * que abrir. Solo se llama si la URL no pide ninguna (`hayQuePreguntar`, en
 * `entrada.ts`).
 */
export function pedirPartida(): Promise<void> {
  // La complejidad que traiga la URL sin semilla es con la que arranca el menú;
  // si no vale, no se pregunta: la partida dice por qué y cómo quitarla.
  const deLaURL = combateParaElMenu(location.search);
  if (deLaURL === null) return Promise.resolve();
  const app = deLaPagina('app');
  const inicio = deLaPagina('inicio');
  quitarTema();
  app.hidden = true;
  inicio.hidden = false;

  return new Promise<void>((empezar) => {
    let elegida: FactionId = FACTION_IDS[0];
    let pantalla: 'menu' | 'eleccion' = 'menu';
    /** La complejidad del combate (`views/combate.ts`): la de la URL, o la de siempre. */
    let combate: ReglasDelCombate = deLaURL.combate;
    /** «Solo la rueda del héroe»: la de la URL, o apagada. */
    let soloHeroe = deLaURL.soloHeroe;
    /** Lo que escucha el menú, que se suelta de una vez al empezar. */
    const escucha = new AbortController();
    const { signal } = escucha;

    const enfocar = (selector: string): void => {
      inicio.querySelector<HTMLElement>(selector)?.focus();
    };
    const aMenu = (): void => {
      pantalla = 'menu';
      quitarTema();
      pintar(inicio, renderMenu());
      enfocar('[data-inicio="nuevo"]');
    };
    const aEleccion = (): void => {
      pantalla = 'eleccion';
      pintar(inicio, renderEleccion(elegida, combate, soloHeroe));
      ponerTema(elegida);
      enfocar('input[name="faccion"]:checked');
    };
    /** Un paso atrás: de la facción al menú. */
    const atras = (): void => {
      if (pantalla === 'eleccion') aMenu();
    };
    /** Escribe lo elegido en la URL y deja paso a la partida. */
    const jugar = (pedido: {
      readonly seed: number;
      readonly faccion?: FactionId;
      readonly heroe?: string;
      readonly combate?: { readonly reglas: ReglasDelCombate; readonly soloHeroe: boolean };
    }): void => {
      aLaBarra((url) => {
        url.searchParams.set('seed', String(pedido.seed));
        if (pedido.faccion !== undefined) url.searchParams.set('faccion', pedido.faccion);
        if (pedido.heroe !== undefined) url.searchParams.set('heroe', pedido.heroe);
        if (pedido.combate !== undefined) {
          combateALaURL(url, pedido.combate.reglas, pedido.combate.soloHeroe);
        }
      });
      escucha.abort();
      inicio.hidden = true;
      app.hidden = false;
      empezar();
    };
    inicio.addEventListener(
      'click',
      (ev) => {
        const boton = (ev.target as Element).closest<HTMLElement>('[data-inicio]');
        if (boton === null || boton.getAttribute('aria-disabled') === 'true') return;
        switch (boton.dataset.inicio) {
          case 'nuevo':
            aEleccion();
            break;
          case 'rapida': {
            // La facción, la que saque la semilla (`faccionesDeLaSemilla`): el
            // menú no sortea nada que no sea la semilla. Y su héroe de por
            // defecto, ya elegido: la rápida no pregunta nada (y lo paga igual).
            const seed = semillaSorteada();
            jugar({ seed, heroe: heroePorDefectoDeLaSemilla(seed) });
            break;
          }
          case 'volver':
            atras();
            break;
        }
      },
      { signal },
    );
    inicio.addEventListener(
      'submit',
      (ev) => {
        ev.preventDefault();
        // Sin héroe: se elige y se paga en la base, ante el ayuntamiento.
        if (pantalla === 'eleccion') {
          jugar({
            seed: semillaSorteada(),
            faccion: elegida,
            combate: { reglas: combate, soloHeroe },
          });
        }
      },
      { signal },
    );
    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === 'Escape' && pantalla !== 'menu') {
          ev.preventDefault();
          atras();
        }
      },
      { signal },
    );
    inicio.addEventListener(
      'change',
      (ev) => {
        const delCombate = leerElCombate(ev.target as Element, combate);
        if (delCombate !== null) {
          combate = delCombate;
          return;
        }
        const marcada = leerSoloHeroe(ev.target as Element);
        if (marcada !== null) {
          soloHeroe = marcada;
          return;
        }
        const radio = (ev.target as Element).closest('input[name="faccion"]');
        if (radio === null) return;
        const valor = radio.getAttribute('value') ?? '';
        if (!esFaccion(valor)) throw new Error(`"${valor}" no es una facción`);
        elegida = valor;
        ponerTema(elegida);
      },
      { signal },
    );
    aMenu();
  });
}
