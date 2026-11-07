/**
 * Las fichas de la arena: cuál contiene un elemento (un gesto de ficha escribe en la suya, no en
 * la elegida), qué se pinta en una —la de una unidad o un héroe, en el montaje, la edición o el
 * editor de la batalla— y el editor de la batalla: abrirlo, pintarlo y lo que pasa al cerrarlo. Y
 * el campo de su nombre. Era parte de `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import { tipoDelStack } from '@core/arena/ficha.js';
import type { BattleStack } from '@core/battle/types.js';
import { type Html, html, pintar } from '../comun/html.js';
import { nombreEnElCampo } from '../render/batalla/distintivo.js';
import { arteDe } from '../render/figuras/personajes.js';
import type { SesionDeArena } from '../sesion/sesion-de-arena.js';
import { hechizosQueValen, hojasDeHeroe, unidadDe } from './catalogo.js';
import { claveDeFicha, type FichaAbierta, type FichaEditable, fichaDeClave } from './edicion.js';
import type { EstadoDelCatalogo, PaginaDeLaArena } from './pagina.js';
import type { Elegida } from './paneles/bandos.js';
import {
  type ComoDeLaFicha,
  enElMontaje,
  renderFicha,
  renderFichaDeHeroe,
} from './paneles/ficha.js';

/** La ficha que contiene el botón de un gesto de ficha: sin ella, el marcado está mal. */
export function laFichaDe(el: Element, que: string): Elegida {
  const f = fichaDelElemento(el);
  if (f === null) throw new Error(`${que} no está dentro de ninguna ficha`);
  return f;
}

/** Una ficha abierta: su cabecera y la ficha de siempre (`fichaDe`) con las piezas del montaje. */
export function fichaAbierta(pagina: PaginaDeLaArena, f: FichaEditable): FichaAbierta {
  const { catalogo } = pagina;
  return {
    clave: claveDeFicha(f),
    titulo: nombreDeFicha(catalogo, f),
    cuerpo: fichaDe(pagina, f, enElMontaje(catalogo.equipo, hechizosQueValen(catalogo))),
  };
}

/** El nombre de lo que enseña una ficha: el de su unidad, del catálogo, con el que se le haya puesto. */
export function nombreDeFicha(catalogo: EstadoDelCatalogo, f: FichaEditable): string {
  return unidadDe(catalogo, f.id).name;
}

/** La clave de la ficha que contiene `el` (`data-clave-de-ficha`), o `null` si no está en ninguna. */
export function claveDelElemento(el: Element): string | null {
  return el.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha') ?? null;
}

/**
 * La ficha que contiene `el`, o `null` si no está dentro de ninguna. Es a quién
 * va un gesto de ficha —un campo, un rasgo, quitar una habilidad, el clip, girar,
 * cerrar—: con cuatro abiertas, leer `elegida` escribía en la equivocada.
 */
export function fichaDelElemento(el: Element): Elegida | null {
  const clave = claveDelElemento(el);
  return clave === null ? null : fichaDeClave(clave);
}

/**
 * La ficha de lo elegido: una unidad o el héroe de un lado. `enCombate`: la del editor de la batalla, sin figura animada (el bucle
 * de las miniaturas no corre en la batalla) y diciendo que el cambio vale ya.
 */
export function fichaElegida(pagina: PaginaDeLaArena, enCombate = false): Html {
  const { catalogo, vista, pelea } = pagina;
  const como =
    enCombate && pelea.sesion !== null
      ? { enCombate, piezas: catalogo.equipo, hechizos: hechizosQueValen(catalogo) }
      : enElMontaje(catalogo.equipo, hechizosQueValen(catalogo));
  return fichaDe(pagina, vista.elegida, como);
}

/**
 * La ficha de `e` —la de siempre, la misma en el montaje, la batalla y la
 * edición—, o la vacía. Si se está renombrando (`renombrando`), con el campo del
 * nombre en su título.
 */
function fichaDe(pagina: PaginaDeLaArena, e: Elegida | null, como0: ComoDeLaFicha): Html {
  const { catalogo, montaje, vista } = pagina;
  if (e === null) return renderFicha(null, false, como0);
  const como = vista.renombrando.has(claveDeFicha(e)) ? { ...como0, renombrando: true } : como0;
  switch (e.kind) {
    case 'unidad': {
      const u = unidadDe(catalogo, e.id);
      return renderFicha(u, arteDe(u.cuerpo.hoja).dispara, como);
    }
    case 'heroe': {
      const h = montaje.heroes[e.lado];
      if (h === null) return renderFicha(null, false, como0);
      return renderFichaDeHeroe(e.lado, h, como, hojasDeHeroe(catalogo));
    }
  }
}

/**
 * El editor de la batalla, con la ficha de lo elegido y lo último que pasó al
 * cambiarla. Abierto desde la rueda (`fichaDeLaRueda`), la ficha va dentro de un
 * `<fieldset disabled>`: se mira y no se cambia.
 */
export function pintarEditor(pagina: PaginaDeLaArena): void {
  const { vista, pelea, elFichaDelEditor, elAvisoDelEditor } = pagina;
  const ficha = fichaElegida(pagina, true);
  pintar(
    elFichaDelEditor,
    pelea.fichaDeLaRueda
      ? html`<fieldset disabled class="solo-lectura">${ficha}</fieldset>`
      : ficha,
  );
  elAvisoDelEditor.textContent = vista.aviso;
  elAvisoDelEditor.classList.toggle('rechazo', vista.aviso === vista.rechazado);
}

/**
 * Abre el editor de la batalla con la ficha del tipo de `st` (`tipoDelStack`: la
 * unidad de la que sale, o el héroe de su lado): para cambiarla, o desde la rueda
 * (`soloLectura`), para mirarla. Encima de la rueda: `showModal` apila los dos en
 * el orden en que se abren, y Escape cierra solo el de arriba.
 */
export function abrirEditor(
  pagina: PaginaDeLaArena,
  s: SesionDeArena,
  st: BattleStack,
  soloLectura: boolean,
): void {
  const { vista, pelea, textosDelEditor, editor, elTituloDelEditor, botonCerrarEditor } = pagina;
  vista.elegida = tipoDelStack(st);
  const nombre = nombreEnElCampo(s.battle, st);
  pelea.fichaDeLaRueda = soloLectura;
  elTituloDelEditor.textContent = soloLectura ? `Ficha de ${nombre}` : textosDelEditor.titulo;
  botonCerrarEditor.textContent = soloLectura ? 'Volver a la rueda' : textosDelEditor.cerrar;
  vista.aviso = soloLectura
    ? 'Solo para mirar: con la rueda abierta no se cambian cifras. Para eso, «Editar» en el panel de la pelea.'
    : 'Lo que cambies aquí vale ya, para todas las de su tipo en el campo.';
  pintarEditor(pagina);
  if (!editor.open) editor.showModal();
}

/**
 * El campo del nombre (`input.renombrar`) visto por lo que se usa de él. Sin el
 * tipo del DOM a propósito: los nombres con `HTML` los vigila `invariantes.test.ts`.
 */
type CampoDelNombre = Element & {
  value: string;
  readonly defaultValue: string;
  focus(): void;
  blur(): void;
  select(): void;
};

/** `el`, si es el campo del nombre de una ficha; si no, `null`. */
export function campoDelNombre(el: EventTarget | null): CampoDelNombre | null {
  return el instanceof Element && el.matches('input.renombrar') ? (el as CampoDelNombre) : null;
}

/**
 * Cerrar el editor (su botón o Escape) vuelve a la batalla tal como estaba: no
 * toca la sesión, solo repinta el panel con las cifras nuevas. Abierto desde la
 * rueda, vuelve a ella (seguía abierta debajo, en su fase), y el editor recobra
 * su título y su botón de cambiar cifras. Era un oyente de primer nivel de `main.ts`
 * hasta R8 de la reorganización (07-11-2026).
 */
export function instalarElCierreDelEditor(pagina: PaginaDeLaArena): void {
  const { pelea, pedirFotograma, textosDelEditor, editor, elTituloDelEditor, botonCerrarEditor } =
    pagina;
  editor.addEventListener('close', () => {
    if (pelea.fichaDeLaRueda) {
      pelea.fichaDeLaRueda = false;
      elTituloDelEditor.textContent = textosDelEditor.titulo;
      botonCerrarEditor.textContent = textosDelEditor.cerrar;
    }
    pedirFotograma();
  });
}
