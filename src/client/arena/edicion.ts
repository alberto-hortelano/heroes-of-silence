/**
 * La vista de edición de la arena: las fichas abiertas que se quieran, en
 * columnas (como mucho tres) y las que no caben, debajo. Es una vista de la misma página —las cifras que se cambian aquí
 * son las del montaje, y «Guardar» las escribe como allí—, así que aquí solo vive
 * qué fichas se ven: abrir, cerrar, recordar y el marco de cada una.
 *
 * Puro, sin DOM, y por eso con tests (`test/arena-edicion.test.ts`). Las fichas
 * mismas no se pintan aquí: el cuerpo de cada una lo da `main.ts` con
 * `renderFicha`, la de siempre, sin copia.
 */
import { type Html, html, unir } from '../html.js';
import type { Elegida } from './paneles.js';

/** Lo que se abre en la vista de edición: una unidad (los héroes, no). */
export type FichaEditable = Extract<Elegida, { readonly kind: 'unidad' }>;

/**
 * Los tipos de clave de las fichas de una criatura del catálogo del juego, que
 * ya no está en la arena (13-10-2026): recordadas, se descartan sin decir nada
 * (`leerAbiertas`), que lo de `localStorage` es comodidad de quien mira.
 */
const CLAVES_DEL_CATALOGO: readonly string[] = ['catalogo', 'criatura'];

/** Lo que se dice cuando lo recordado no se entiende. */
const NO_SE_LEEN = 'No se leen las fichas que estaban abiertas: se empieza sin ninguna.';

/**
 * La identidad de una ficha: en el marcado (`data-clave-de-ficha`), en
 * `localStorage` y en la animación de su retrato. El héroe también tiene la
 * suya —su ficha está en el montaje y su retrato anima— aunque aquí no se abra.
 */
export function claveDeFicha(e: Elegida): string {
  return e.kind === 'heroe' ? `heroe:${e.lado}` : `${e.kind}:${e.id}`;
}

/**
 * Un `tipo:id` partido por sus primeros dos puntos (el id puede llevar más), o
 * `null` si no los lleva. La forma de las claves de ficha.
 */
function partirClave(clave: string): { readonly tipo: string; readonly id: string } | null {
  const dos = clave.indexOf(':');
  return dos < 0 ? null : { tipo: clave.slice(0, dos), id: clave.slice(dos + 1) };
}

/**
 * La inversa de `claveDeFicha`, para las tres: lo que no entiende lo dice. Lee
 * también `hoja:<id>`, la de antes de las unidades nuevas (lo recordado en
 * `localStorage`): la unidad de una hoja tiene el id de su hoja.
 */
export function fichaDeClave(clave: string): Elegida {
  const { tipo, id } = partirClave(clave) ?? { tipo: null, id: '' };
  if (id !== '' && (tipo === 'unidad' || tipo === 'hoja')) return { kind: 'unidad', id };
  if (tipo === 'heroe' && (id === 'izquierda' || id === 'derecha')) {
    return { kind: tipo, lado: id };
  }
  throw new Error(
    `«${clave}» no es la clave de una ficha: se esperaba «unidad:<id>» o «heroe:<izquierda|derecha>»`,
  );
}

/** Si la de `clave` está abierta. */
export function estaAbierta(abiertas: readonly FichaEditable[], clave: string): boolean {
  return abiertas.some((a) => claveDeFicha(a) === clave);
}

/**
 * Por qué `f` no se abre, o `null` si se abre: la hoja de su cuerpo está a medias en el
 * taller (`incompleta`, #140) o ya está abierta. No hay tope (12-10-2026: el
 * usuario quitó el de cuatro; las que no caben en la fila van debajo y la vista
 * se desplaza como una página). Un motivo, un texto: lo leen el botón (deshabilitado, en su `title`), el gesto y
 * `abrirFicha`.
 */
export function abrirFichaBlocker(
  abiertas: readonly FichaEditable[],
  f: FichaEditable,
  incompleta: string | null,
): string | null {
  if (incompleta !== null) return `No se abre: ${incompleta}.`;
  if (estaAbierta(abiertas, claveDeFicha(f))) return 'Su ficha ya está abierta.';
  return null;
}

/** Lo que queda abierto tras un gesto, y lo que se le dice a quien lo hizo. */
export interface Abiertas {
  readonly abiertas: readonly FichaEditable[];
  readonly aviso: string;
}

/**
 * Abre `f` al final. Si no se abre (`abrirFichaBlocker`), lo abierto no cambia
 * —el mismo array— y el aviso dice por qué.
 */
export function abrirFicha(
  abiertas: readonly FichaEditable[],
  f: FichaEditable,
  nombre: string,
  incompleta: string | null = null,
): Abiertas {
  const motivo = abrirFichaBlocker(abiertas, f, incompleta);
  if (motivo !== null) return { abiertas, aviso: `${nombre}. ${motivo}` };
  return { abiertas: [...abiertas, f], aviso: `${nombre}: ficha abierta.` };
}

/** Cierra la de `clave` y deja las demás como estaban; una que no está abierta es un error del gesto. */
export function cerrarFicha(abiertas: readonly FichaEditable[], clave: string): FichaEditable[] {
  if (!estaAbierta(abiertas, clave)) {
    throw new Error(`no hay ninguna ficha «${clave}» abierta que cerrar`);
  }
  return abiertas.filter((a) => claveDeFicha(a) !== clave);
}

/**
 * Adónde va el foco al cerrar con el teclado la ficha `clave` (H4 de QA): al ×
 * de la de al lado —la siguiente, o la anterior si era la última—, y si no queda
 * ninguna, al «Abrir» de la que se cerró. Sin esto caía al `body` y quien va con
 * el teclado volvía a empezar desde arriba.
 */
export type FocoTrasCerrar =
  | { readonly kind: 'cerrar'; readonly clave: string }
  | { readonly kind: 'abrir'; readonly ficha: FichaEditable };

export function focoTrasCerrar(antes: readonly FichaEditable[], clave: string): FocoTrasCerrar {
  const i = antes.findIndex((a) => claveDeFicha(a) === clave);
  if (i < 0) throw new Error(`no hay ninguna ficha «${clave}» abierta que cerrar`);
  const vecina = antes[i + 1] ?? antes[i - 1];
  return vecina === undefined
    ? { kind: 'abrir', ficha: antes[i] as FichaEditable }
    : { kind: 'cerrar', clave: claveDeFicha(vecina) };
}

/** Lo que pliega o despliega la lista de la edición. */
export type GestoDeLaLista = 'entrar' | 'abrir' | 'cerrar' | 'alternar';

/**
 * Si la lista de la edición va plegada tras `gesto`, con `abiertas` fichas
 * abiertas ya contadas. Solo su botón la pliega o la despliega: plegarse sola al
 * abrir una ficha (H1 de QA del ciclo anterior) obligaba a desplegarla para
 * abrir la siguiente, y el usuario pidió que no (12-10-2026: «que el selector de
 * unidades no se pliegue cada vez que seleccionas una»). Sin ninguna abierta va
 * siempre desplegada: plegada no quedaría nada que ver.
 */
export function listaPlegadaTras(
  gesto: GestoDeLaLista,
  plegada: boolean,
  abiertas: number,
): boolean {
  if (abiertas === 0) return false;
  return gesto === 'alternar' ? !plegada : plegada;
}

/** Lo que se guarda en `localStorage`: las claves, en su orden. */
export function abiertasATexto(abiertas: readonly FichaEditable[]): string {
  return JSON.stringify(abiertas.map(claveDeFicha));
}

/**
 * Lo que había abierto la última vez, leído de `localStorage` (`null` si no
 * había nada): se vuelve a abrir una a una con `abrirFicha`, la misma regla que
 * el gesto. Es una comodidad, no un dato: lo ilegible se dice y se empieza sin
 * ninguna; la ficha de una criatura del catálogo se descarta callando
 * (`CLAVES_DEL_CATALOGO`); lo que ya no se puede abrir (`sePuede` dice que no: la hoja se borró,
 * o quedó a medias en el taller) y lo repetido se quita diciéndolo.
 */
export function leerAbiertas(
  texto: string | null,
  sePuede: (f: FichaEditable) => boolean,
): Abiertas {
  if (texto === null) return { abiertas: [], aviso: '' };
  let claves: unknown;
  try {
    claves = JSON.parse(texto);
  } catch {
    // El motivo exacto del parser no le sirve a nadie: lo que importa es que no se lee.
    return { abiertas: [], aviso: NO_SE_LEEN };
  }
  if (!Array.isArray(claves) || !claves.every((c) => typeof c === 'string')) {
    return { abiertas: [], aviso: NO_SE_LEEN };
  }
  const fuera: string[] = [];
  const abiertas = (claves as string[]).reduce<readonly FichaEditable[]>((hasta, c) => {
    if (CLAVES_DEL_CATALOGO.includes(partirClave(c)?.tipo ?? '')) return hasta;
    let f: Elegida;
    try {
      f = fichaDeClave(c);
    } catch {
      // Lo que no es una clave se dice abajo con las demás que no entran.
      fuera.push(c);
      return hasta;
    }
    if (f.kind === 'heroe' || !sePuede(f)) {
      fuera.push(c);
      return hasta;
    }
    const r = abrirFicha(hasta, f, c);
    if (r.abiertas === hasta) fuera.push(c);
    return r.abiertas;
  }, []);
  const aviso =
    fuera.length === 0
      ? ''
      : `No se vuelven a abrir ${fuera.map((c) => `«${c}»`).join(', ')}: ya no se pueden abrir o estaban repetidas.`;
  return { abiertas, aviso };
}

/** Una ficha abierta: su clave, el nombre de su cabecera y su cuerpo (la ficha de siempre). */
export interface FichaAbierta {
  readonly clave: string;
  readonly titulo: string;
  readonly cuerpo: Html;
}

/**
 * Lo de dentro de una ficha abierta: el × y la ficha. El nombre no se repite: lo
 * lleva la ficha en su título, con su botón de editar, y el × se pone en esa
 * misma línea (`arena.css`). Se repinta sola tras un cambio.
 */
export function interiorDeFichaAbierta(f: FichaAbierta): Html {
  return html`<button class="boton-de-cabecera cerrar-ficha" data-arena="cerrar-ficha" aria-label="Cerrar la ficha de ${f.titulo}" title="Cerrar esta ficha">×</button>
        ${f.cuerpo}`;
}

/**
 * La vista entera, que se desplaza como una página: la lista arriba y las fichas
 * abiertas debajo, en columnas (como mucho tres; las demás, en filas debajo). El
 * × de cada ficha la cierra por la clave de su `article`.
 */
export function renderEdicion(v: {
  readonly lista: Html;
  readonly fichas: readonly FichaAbierta[];
}): Html {
  const n = v.fichas.length;
  const fichas =
    n === 0
      ? html`<p class="cost sin-fichas">Ninguna ficha abierta: pulsa «Abrir» en una unidad de la lista; las que abras se añaden debajo.</p>`
      : unir(
          v.fichas.map(
            (f) =>
              html`<article class="ficha-abierta" data-clave-de-ficha="${f.clave}">${interiorDeFichaAbierta(f)}</article>`,
          ),
        );
  return html`<section class="edicion-lista">${v.lista}</section>
    <section class="edicion-fichas">
      <h3 class="cabecera-abiertas">Fichas abiertas · ${n}</h3>
      <div class="fichas-abiertas">${fichas}</div>
    </section>`;
}
