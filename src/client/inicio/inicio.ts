/**
 * La pantalla de inicio (19-10-2026): antes de montar la partida, si la URL no
 * pide ninguna, pregunta qué jugar —«Nuevo juego» (la elección de facción y luego
 * la del héroe), «Cargar partida» (apagado: no hay guardado) o «Partida
 * rápida»— y lo deja escrito en la URL (`?seed=N&faccion=<id>&heroe=<tipo>`, o
 * solo `?seed=N` en la rápida). «Volver» y Escape retroceden un paso. La
 * URL es la única fuente: el menú, una recarga y un enlace entran por el mismo
 * lector, el de `main.ts`, que es quien la valida. Hasta elegir no existe
 * `Session`, ni el mapa, ni su Worker del suelo: `main.ts` se carga después
 * (`entrada.ts`).
 *
 * Lo que se ve lo pinta `pantallas.ts`; aquí solo se conduce. Al marcar una
 * facción (el clic, el dedo o las flechas) se viste la página con su tema
 * (`ponerTema`); pasar el puntero o el foco por otra no la viste (20-10-2026: «que
 * no cambie de tema en hover sino en click»). El menú va en el neutro
 * (`quitarTema`); la elección del héroe va con el de la facción elegida.
 */
import { tipoDeHeroe, tipoDeHeroePorDefecto } from '@core/data.js';
import { esFaccion, FACTION_IDS, type FactionId } from '@core/types.js';
import { leerElClimaDeLaURL, salidaDelClima } from '../clima-de-la-url.js';
import { pintar } from '../html.js';
import { aLaBarra, semillaSorteada } from '../semilla.js';
import { ponerTema, quitarTema } from '../temas.js';
import { renderEleccion, renderEleccionDeHeroe, renderMenu } from './pantallas.js';

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
  // Un `?clima=` que no se entiende (que no es un tiempo, o mal escrito) se dice
  // al cargar, como un `?seed=` malo, y no tras elegir facción y héroe (H5 del QA
  // del clima, 22-10-2026). Lo que depende del mapa —una región que no tiene— lo
  // dice la partida al abrirse.
  try {
    leerElClimaDeLaURL(new URLSearchParams(location.search));
  } catch (motivo) {
    throw new Error(salidaDelClima(motivo), { cause: motivo });
  }
  const app = deLaPagina('app');
  const inicio = deLaPagina('inicio');
  quitarTema();
  app.hidden = true;
  inicio.hidden = false;

  return new Promise<void>((empezar) => {
    let elegida: FactionId = FACTION_IDS[0];
    /**
     * El tipo de héroe marcado y de qué facción es: al volver a la facción y
     * cambiarla, el de la otra no vale y se marca el de por defecto de la nueva.
     */
    let heroe: { readonly faccion: FactionId; readonly tipo: string } = {
      faccion: elegida,
      tipo: tipoDeHeroePorDefecto(elegida),
    };
    let pantalla: 'menu' | 'eleccion' | 'heroe' = 'menu';
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
      pintar(inicio, renderEleccion(elegida));
      ponerTema(elegida);
      enfocar('input[name="faccion"]:checked');
    };
    const aHeroe = (): void => {
      pantalla = 'heroe';
      if (heroe.faccion !== elegida)
        heroe = { faccion: elegida, tipo: tipoDeHeroePorDefecto(elegida) };
      pintar(inicio, renderEleccionDeHeroe(elegida, heroe.tipo));
      ponerTema(elegida);
      enfocar('input[name="heroe"]:checked');
    };
    /** Un paso atrás: del héroe a la facción, y de la facción al menú. */
    const atras = (): void => {
      if (pantalla === 'heroe') aEleccion();
      else if (pantalla === 'eleccion') aMenu();
    };
    /** Escribe lo elegido en la URL y deja paso a la partida. */
    const jugar = (pedido: {
      readonly seed: number;
      readonly faccion?: FactionId;
      readonly heroe?: string;
    }): void => {
      aLaBarra((url) => {
        url.searchParams.set('seed', String(pedido.seed));
        if (pedido.faccion !== undefined) url.searchParams.set('faccion', pedido.faccion);
        if (pedido.heroe !== undefined) url.searchParams.set('heroe', pedido.heroe);
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
          case 'rapida':
            // La facción, la que saque la semilla (`faccionesDeLaSemilla`): el
            // menú no sortea nada que no sea la semilla.
            jugar({ seed: semillaSorteada() });
            break;
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
        if (pantalla === 'eleccion') aHeroe();
        else if (pantalla === 'heroe') {
          jugar({ seed: semillaSorteada(), faccion: elegida, heroe: heroe.tipo });
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
        const delHeroe = (ev.target as Element).closest('input[name="heroe"]');
        if (delHeroe !== null) {
          const tipo = delHeroe.getAttribute('value') ?? '';
          if (tipoDeHeroe(elegida, tipo) === null) {
            throw new Error(`"${tipo}" no es un tipo de héroe de ${elegida}`);
          }
          heroe = { faccion: elegida, tipo };
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
