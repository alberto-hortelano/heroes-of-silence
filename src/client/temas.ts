/**
 * El tema de la interfaz: uno por ejército (13-10-2026).
 *
 * El color y la letra viven en un solo sitio, la hoja de estilos: el `:root` de
 * `style.css` es el tema neutro (el de siempre, el del espectador) y cada bloque
 * `:root[data-tema='…']` de `temas.css` lo redefine entero. Aquí solo se elige
 * cuál manda (`ponerTema`, el único que escribe `data-tema`) y se le leen al CSS
 * las fichas que pinta el lienzo (`temaDelLienzo`), que no ve la hoja de estilos.
 *
 * Los temas son las cinco facciones del juego (19-10-2026: desde que son las de
 * la arena, el tema de quien juega es su facción tal cual, sin tabla que lo
 * traduzca). La partida pone el de su jugador; la elección de facción del menú,
 * el de la que se mira; el menú y lo demás (la arena, el espectador) van en el
 * neutro, sin `data-tema` (`quitarTema`).
 */
import { FACTION_IDS, type FactionId } from '@core/types.js';

export type Tema = FactionId;

/** Los temas: la lista de facciones del núcleo, no otra. */
export const TEMAS: readonly Tema[] = FACTION_IDS;

export function esTema(x: string): x is Tema {
  return (TEMAS as readonly string[]).includes(x);
}

/**
 * Lo que es interfaz dentro del lienzo: chapas, fondo de la barra de vida,
 * galones, rótulos de la base, el recuadro del minimapa y las letras. Los
 * colores de jugador y de bando, los de la vida, los aros y el terreno no
 * entran: son información, no decoración, y no cambian con el tema.
 */
export interface TemaDelLienzo {
  /** Fondo (opaco) de las chapas: la cifra de un grupo y el nombre en la batalla. */
  readonly chapaFondo: string;
  readonly chapaBorde: string;
  readonly chapaTinta: string;
  /** Lo oscuro de debajo de la barra de vida y del contorno de los galones (opaco). */
  readonly vidaFondo: string;
  readonly galon: string;
  /** El nombre de un edificio sin arte en la base. */
  readonly rotulo: string;
  readonly vistaMinimapa: string;
  /** La familia de la letra de las chapas, rótulos y marcas: sin tamaño ni grosor. */
  readonly letraUi: string;
  /** La de las cifras de daño, que se leen como un titular. */
  readonly letraTitulo: string;
}

/** De qué ficha del CSS sale cada campo. */
export const FICHAS_DEL_LIENZO: Readonly<Record<keyof TemaDelLienzo, string>> = {
  chapaFondo: '--chapa-fondo',
  chapaBorde: '--chapa-borde',
  chapaTinta: '--chapa-tinta',
  vidaFondo: '--vida-fondo',
  galon: '--galon',
  rotulo: '--rotulo',
  vistaMinimapa: '--vista-minimapa',
  letraUi: '--letra-ui',
  letraTitulo: '--letra-titulo',
};

/**
 * El respaldo sin DOM (los tests en Node): **son los valores del `:root` neutro
 * de `style.css`**, no otro tema. No es una segunda fuente de los colores: lo
 * compara con la hoja `test/temas.test.ts`, y cambiar uno sin el otro sale rojo.
 */
export const LIENZO_NEUTRO: TemaDelLienzo = {
  chapaFondo: '#191509',
  chapaBorde: '#cbb780',
  chapaTinta: '#fbe8b5',
  vidaFondo: '#0c0a06',
  galon: '#e8c35a',
  rotulo: '#e8dcc4',
  vistaMinimapa: '#fbe6a5aa',
  letraUi: 'system-ui, sans-serif',
  letraTitulo: 'Georgia, serif',
};

/** Lo leído del CSS para el tema de ahora; lo borran `ponerTema` y la llegada de su letra. */
let leido: TemaDelLienzo | null = null;

/** La carga de la letra de título del tema de ahora (`letrasListas`). */
let cargaDeLetras: Promise<void> = Promise.resolve();

/**
 * El tema que manda en la página. Es lo único que escribe `data-tema` (lo vigila
 * `invariantes.test.ts`), y por `dataset`: `setAttribute` solo lo usa la puerta
 * del marcado. Borra lo leído para el lienzo, que en el siguiente fotograma
 * vuelve a leer las fichas; el mismo tema otra vez no toca nada.
 *
 * Y pide su letra de título (`fuentes.css`) para el lienzo. El CSS la cambia
 * solo al llegar (`swap`) y baja lo que pinta, pero el lienzo no: un `ctx.font`
 * con una familia que aún no ha llegado pinta con la de respaldo y no se entera
 * de cuándo llega. Mientras, el lienzo pinta con el respaldo de la cadena; al
 * llegar, se olvida lo leído y el siguiente fotograma ya la usa.
 */
export function ponerTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (raiz.dataset.tema === tema) return;
  raiz.dataset.tema = tema;
  leido = null;
  cargaDeLetras = cargarLetraDeTitulo(tema);
}

/**
 * Vuelve al tema neutro (el `:root` de `style.css`): el menú de inicio, al volver
 * de la elección de facción. La otra cara de `ponerTema`, y por eso aquí: es lo
 * único más que toca `data-tema`.
 */
export function quitarTema(): void {
  const raiz = document.documentElement;
  if (raiz.dataset.tema === undefined) return;
  delete raiz.dataset.tema;
  leido = null;
  cargaDeLetras = Promise.resolve();
}

/**
 * Lo único que el lienzo escribe con la letra de título: las cifras de daño,
 * «−12», en negrita (`render/batalla.ts`).
 */
const CIFRAS_DE_DANIO = '−0123456789';

/**
 * Baja de la letra de título del tema lo que pinta el lienzo: la negrita de sus
 * cifras de daño. `document.fonts.load` con el texto baja solo las caras cuyo
 * `unicode-range` lo toca (de las que no sirven para cifras, la del «−»), y solo
 * lo que tiene `@font-face`: de la cadena, la OFL del tema; lo demás lo baja el
 * CSS al pintarlo. Si falla, lanza con el tema: la letra está en el repositorio,
 * y que no llegue es que algo se rompió (el texto sigue con el respaldo, pero no
 * se calla).
 */
async function cargarLetraDeTitulo(tema: Tema): Promise<void> {
  const familia = getComputedStyle(document.documentElement)
    .getPropertyValue(FICHAS_DEL_LIENZO.letraTitulo)
    .trim();
  try {
    await document.fonts.load(`bold 16px ${familia}`, CIFRAS_DE_DANIO);
  } catch (err) {
    throw new Error(`no llega la letra de título del tema ${tema} (${familia})`, { cause: err });
  }
  if (document.documentElement.dataset.tema === tema) leido = null;
}

/**
 * Se cumple cuando el lienzo ya puede pintar con la letra de título del tema de
 * ahora (o al momento, sin tema). Lo esperan las medidas desde la página antes de
 * fotografiar el lienzo.
 */
export function letrasListas(): Promise<void> {
  return cargaDeLetras;
}

/**
 * Las fichas del lienzo del tema de ahora, leídas del CSS una vez por cambio de
 * tema (`getComputedStyle` en cada chapa de cada fotograma costaría lo que
 * cuesta pintarla). Sin DOM, el neutro. Una ficha que falta lanza: es que la
 * página no cargó `style.css`, y pintar con un color inventado lo escondería.
 */
export function temaDelLienzo(): TemaDelLienzo {
  if (leido !== null) return leido;
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return LIENZO_NEUTRO;
  }
  const estilo = getComputedStyle(document.documentElement);
  const leer = (campo: keyof TemaDelLienzo): string => {
    const ficha = FICHAS_DEL_LIENZO[campo];
    const valor = estilo.getPropertyValue(ficha).trim();
    if (valor === '') {
      throw new Error(
        `la hoja de estilos no define ${ficha}, que pinta el lienzo: ¿carga la página style.css?`,
      );
    }
    return valor;
  };
  leido = {
    chapaFondo: leer('chapaFondo'),
    chapaBorde: leer('chapaBorde'),
    chapaTinta: leer('chapaTinta'),
    vidaFondo: leer('vidaFondo'),
    galon: leer('galon'),
    rotulo: leer('rotulo'),
    vistaMinimapa: leer('vistaMinimapa'),
    letraUi: leer('letraUi'),
    letraTitulo: leer('letraTitulo'),
  };
  return leido;
}
