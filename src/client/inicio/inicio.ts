/**
 * La pantalla de inicio (19-10-2026): antes de montar la partida, si la URL no
 * pide ninguna, pregunta qué jugar —«Nuevo juego» (con la elección de facción),
 * «Cargar partida» (apagado: no hay guardado) o «Partida rápida»— y lo deja
 * escrito en la URL (`?seed=N&faccion=<id>`, o solo `?seed=N` en la rápida). La
 * URL es la única fuente: el menú, una recarga y un enlace entran por el mismo
 * lector, el de `main.ts`, que es quien la valida. Hasta elegir no existe
 * `Session`, ni el mapa, ni su Worker del suelo: `main.ts` se carga después
 * (`entrada.ts`).
 *
 * Lo que se ve lo pinta `pantallas.ts`; aquí solo se conduce. Al mirar una
 * facción se viste la página con su tema (`ponerTema`); el menú va en el neutro
 * (`quitarTema`).
 */
import { FACTION_IDS, type FactionId } from '@core/types.js';
import { pintar } from '../html.js';
import { semillaSorteada } from '../semilla.js';
import { ponerTema, quitarTema } from '../temas.js';
import { hayQuePreguntar, renderEleccion, renderMenu } from './pantallas.js';

function deLaPagina<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`la página no tiene #${id}: ¿es el index.html de la partida?`);
  return el as T;
}

function esFaccion(x: string): x is FactionId {
  return (FACTION_IDS as readonly string[]).includes(x);
}

/**
 * Lo que pide la URL o, si no pide nada, lo que se elija en el menú, escrito en
 * ella. Se cumple cuando hay partida que abrir: al momento si la URL ya la pide.
 */
export function pedirPartida(): Promise<void> {
  if (!hayQuePreguntar(location.search)) return Promise.resolve();
  const app = deLaPagina('app');
  const inicio = deLaPagina('inicio');
  quitarTema();
  app.hidden = true;
  inicio.hidden = false;

  return new Promise<void>((empezar) => {
    let elegida: FactionId = FACTION_IDS[0];
    let pantalla: 'menu' | 'eleccion' = 'menu';

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
      pintar(inicio, renderEleccion(elegida));
      ponerTema(elegida);
      enfocar('input[name="faccion"]:checked');
    };
    /** Escribe lo elegido en la URL y deja paso a la partida. */
    const jugar = (pedido: { readonly seed: number; readonly faccion?: FactionId }): void => {
      const url = new URL(location.href);
      url.searchParams.set('seed', String(pedido.seed));
      if (pedido.faccion === undefined) url.searchParams.delete('faccion');
      else url.searchParams.set('faccion', pedido.faccion);
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      inicio.removeEventListener('click', alPulsar);
      inicio.removeEventListener('submit', alEnviar);
      document.removeEventListener('keydown', alTeclear);
      inicio.removeEventListener('focusin', alMirar);
      inicio.removeEventListener('pointermove', alMoverse);
      inicio.removeEventListener('pointerout', alDejarDeMirar);
      inicio.removeEventListener('change', alMarcar);
      inicio.hidden = true;
      pintar(inicio, renderMenu());
      app.hidden = false;
      empezar();
    };

    const alPulsar = (ev: MouseEvent): void => {
      const boton = (ev.target as Element).closest<HTMLElement>('[data-inicio]');
      if (boton === null || boton.getAttribute('aria-disabled') === 'true') return;
      switch (boton.dataset.inicio) {
        case 'nuevo':
          aEleccion();
          break;
        case 'rapida':
          // La facción, la que saque la semilla (`faccionesDeLaSemilla`): el
          // menú no sortea nada que no sea la semilla.
          jugar({ seed: semillaSorteada() });
          break;
        case 'volver':
          aMenu();
          break;
      }
    };
    const alEnviar = (ev: SubmitEvent): void => {
      ev.preventDefault();
      jugar({ seed: semillaSorteada(), faccion: elegida });
    };
    const alTeclear = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' && pantalla === 'eleccion') {
        ev.preventDefault();
        aMenu();
      }
    };
    /** La facción con el foco o bajo el puntero: su tema, ya. */
    const alMirar = (ev: Event): void => {
      const f = (ev.target as Element).closest<HTMLElement>('[data-faccion]')?.dataset.faccion;
      if (f !== undefined && esFaccion(f)) ponerTema(f);
    };
    /**
     * Solo si el puntero se ha movido: el navegador también avisa cuando lo de
     * debajo cambia con él quieto (al cambiar de tema cambian la letra y las
     * medidas), y con el ratón parado encima de una facción el tema de la que se
     * elige con el teclado volvía a la de debajo.
     */
    const alMoverse = (ev: PointerEvent): void => {
      if (ev.movementX !== 0 || ev.movementY !== 0) alMirar(ev);
    };
    /** Al salir el puntero de las facciones, el tema vuelve al de la marcada. */
    const alDejarDeMirar = (ev: PointerEvent): void => {
      const lista = inicio.querySelector('.facciones');
      if (lista === null) return;
      const hacia = ev.relatedTarget;
      if (hacia instanceof Node && lista.contains(hacia)) return;
      ponerTema(elegida);
    };
    const alMarcar = (ev: Event): void => {
      const radio = (ev.target as Element).closest('input[name="faccion"]');
      if (radio === null) return;
      const valor = radio.getAttribute('value') ?? '';
      if (!esFaccion(valor)) throw new Error(`"${valor}" no es una facción`);
      elegida = valor;
      ponerTema(elegida);
    };

    inicio.addEventListener('click', alPulsar);
    inicio.addEventListener('submit', alEnviar);
    document.addEventListener('keydown', alTeclear);
    inicio.addEventListener('focusin', alMirar);
    inicio.addEventListener('pointermove', alMoverse);
    inicio.addEventListener('pointerout', alDejarDeMirar);
    inicio.addEventListener('change', alMarcar);
    aMenu();
  });
}
