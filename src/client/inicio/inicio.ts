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
import { esFaccion, FACTION_IDS, type FactionId } from '@core/types.js';
import { pintar } from '../html.js';
import { aLaBarra, semillaSorteada } from '../semilla.js';
import { ponerTema, quitarTema } from '../temas.js';
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
  const app = deLaPagina('app');
  const inicio = deLaPagina('inicio');
  quitarTema();
  app.hidden = true;
  inicio.hidden = false;

  return new Promise<void>((empezar) => {
    let elegida: FactionId = FACTION_IDS[0];
    let pantalla: 'menu' | 'eleccion' = 'menu';
    /**
     * Dónde estaba el puntero la última vez que se supo, y dónde estaba al abrir
     * la elección. El puntero solo viste la facción de debajo tras moverse de
     * verdad desde que se abrió (`punteroVivo`): al pulsar «Nuevo juego» con el
     * ratón y dejarlo quieto, la elección se pinta con «No muertos» bajo él, el
     * navegador avisa de un `pointerover` sin que nadie mueva nada, y la página
     * se vestía de no muertos con «Templarios» marcado (QA, H2).
     */
    let punto: { readonly x: number; readonly y: number } | null = null;
    let alAbrir: { readonly x: number; readonly y: number } | null = null;
    let punteroVivo = false;
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
      punteroVivo = false;
      alAbrir = punto;
      pintar(inicio, renderEleccion(elegida));
      ponerTema(elegida);
      enfocar('input[name="faccion"]:checked');
    };
    /** Escribe lo elegido en la URL y deja paso a la partida. */
    const jugar = (pedido: { readonly seed: number; readonly faccion?: FactionId }): void => {
      aLaBarra((url) => {
        url.searchParams.set('seed', String(pedido.seed));
        if (pedido.faccion !== undefined) url.searchParams.set('faccion', pedido.faccion);
      });
      escucha.abort();
      inicio.hidden = true;
      app.hidden = false;
      empezar();
    };
    /** La facción de `el` (o de lo que lo contiene) en la elección, si es una. */
    const faccionDe = (el: EventTarget | null): FactionId | null => {
      if (!(el instanceof Element)) return null;
      const f = el.closest<HTMLElement>('[data-faccion]')?.dataset.faccion;
      return f !== undefined && esFaccion(f) ? f : null;
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
          case 'rapida':
            // La facción, la que saque la semilla (`faccionesDeLaSemilla`): el
            // menú no sortea nada que no sea la semilla.
            jugar({ seed: semillaSorteada() });
            break;
          case 'volver':
            aMenu();
            break;
        }
      },
      { signal },
    );
    inicio.addEventListener(
      'submit',
      (ev) => {
        ev.preventDefault();
        jugar({ seed: semillaSorteada(), faccion: elegida });
      },
      { signal },
    );
    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === 'Escape' && pantalla === 'eleccion') {
          ev.preventDefault();
          aMenu();
        }
      },
      { signal },
    );
    // La facción con el foco o bajo el puntero: su tema, ya. La lista mide lo
    // mismo con cualquier tema (`.opcion-de-faccion`, `style.css`): si cambiara
    // de medidas, el navegador avisaría de otro `pointerover` con el ratón quieto
    // y el tema de la que se elige con el teclado volvería a la de debajo.
    const alMirar = (ev: Event): void => {
      const f = faccionDe(ev.target);
      if (f !== null) ponerTema(f);
    };
    inicio.addEventListener('focusin', alMirar, { signal });
    inicio.addEventListener(
      'pointerover',
      (ev) => {
        if (punteroVivo && ev.pointerType !== 'touch') alMirar(ev);
      },
      { signal },
    );
    // Un movimiento cuenta si su punto no es el de antes de abrir la elección.
    // Sin punto conocido (se abrió con el teclado y el ratón no había dado
    // señales), el primero solo lo apunta: un `pointermove` sintético en el mismo
    // sitio no basta para despertarlo. El dedo no tiene vista previa: deslizar
    // para bajar hasta «Empezar» vestiría cada facción por la que pasa; con él,
    // viste la que se toca (`change`).
    document.addEventListener(
      'pointermove',
      (ev) => {
        if (ev.pointerType === 'touch') return;
        const aqui = { x: ev.clientX, y: ev.clientY };
        punto = aqui;
        if (pantalla !== 'eleccion' || punteroVivo) return;
        if (alAbrir === null) {
          alAbrir = aqui;
          return;
        }
        if (aqui.x === alAbrir.x && aqui.y === alAbrir.y) return;
        punteroVivo = true;
        alMirar(ev);
      },
      { signal },
    );
    document.addEventListener(
      'pointerdown',
      (ev) => {
        punto = { x: ev.clientX, y: ev.clientY };
      },
      { signal },
    );
    // Al salir el puntero de las facciones, el tema vuelve al de la marcada.
    inicio.addEventListener(
      'pointerout',
      (ev) => {
        const lista = inicio.querySelector('.facciones');
        if (lista === null || !(ev.target instanceof Node) || !lista.contains(ev.target)) return;
        const hacia = ev.relatedTarget;
        if (hacia instanceof Node && lista.contains(hacia)) return;
        ponerTema(elegida);
      },
      { signal },
    );
    inicio.addEventListener(
      'change',
      (ev) => {
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
