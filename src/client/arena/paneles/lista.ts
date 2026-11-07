/**
 * La lista de la arena (`/arena/`): las unidades del catálogo en tarjetas, por facción
 * (`renderCatalogo`, `tarjetasDelCatalogo`), con «Nueva unidad», por qué una no se monta
 * (`porQueNoSeMonta`) y lo que dice la barra al leer el catálogo y al crear una unidad
 * (`avisoDelCatalogoLeido`, `avisoDeNuevaUnidad`).
 *
 * El marcado de la arena vive en `arena/paneles/`, un fichero por sección de la página
 * (la lista, los bandos, la ficha, el equipo, la batalla y la muralla): puro, sin DOM,
 * y por eso con tests —la lección del espectador: un panel que vive en el módulo que
 * toca `document` al importarse no lo prueba nadie—. Todo sale por `html.ts`: las
 * cifras, el nombre que la persona escribe y las habilidades del cuaderno van por
 * huecos de texto o de atributo; las imágenes, por `srcDeImagen`. Era un fichero,
 * `arena/paneles.ts`, hasta la fase C de la reorganización (07-11-2026).
 */
import { lecturaDelNivel } from '@core/arena/ficha.js';
import type { EquipoAtado } from '@core/equipo/atado.js';
import { FACTION_IDS, NOMBRE_DE_FACCION } from '@core/types.js';
import { type Hoja, type Unidad, unidadDeCombate } from '@core/unidad/formato.js';
import { DESHABILITADO, type Html, html, NADA, srcDeImagen, unir } from '../../comun/html.js';
import { abrirFichaBlocker, claveDeFicha, estaAbierta, type FichaEditable } from '../edicion.js';

const rutaDeIdentidad = (id: string): string => `/unidades/${id}/identidad.webp`;

/** Qué enseña la lista: todas las hojas o las de una facción. */
export type FiltroDeArena = Hoja['faccion'] | 'todas';

/**
 * Una unidad del catálogo en la lista: la de una hoja o una nueva (`unidadNueva`).
 * Su id, su nombre y su facción (los del catálogo, nunca los de su hoja:
 * `tarjetasDelCatalogo`) y el retrato de identidad de su hoja (`retrato`).
 * `sello`, lo que la distingue en la lista («nueva»); `incompleta`, por qué no se
 * monta (#140).
 */
export interface TarjetaDeUnidad {
  readonly id: string;
  readonly nombre: string;
  readonly faccion: Hoja['faccion'];
  /** La hoja de cuyo retrato de identidad se pinta. */
  readonly retrato: string;
  readonly sello?: string;
  readonly incompleta: string | null;
}

/** La tarjeta de una unidad en la lista. Una incompleta se ve con su motivo y sin botones que la monten. */
function tarjetaDeUnidad(t: TarjetaDeUnidad, modo: ModoDelCatalogo): Html {
  return html`<div class="hoja${t.incompleta === null ? '' : ' incompleta'}" data-unidad-catalogo="${t.id}">
        <img${srcDeImagen(rutaDeIdentidad(t.retrato))} alt="${t.nombre}" loading="lazy" width="64" height="64">
        ${t.sello === undefined ? NADA : html`<span class="sello">${t.sello}</span>`}
        <span class="nombre">${t.nombre}</span>
        <span class="cost">${NOMBRE_DE_FACCION[t.faccion]}</span>
        ${t.incompleta === null ? NADA : html`<span class="cost" data-incompleta title="${t.incompleta}">Incompleta: ${t.incompleta}</span>`}
        <span class="botones">${botonesDeTarjeta(modo, { kind: 'unidad', id: t.id }, t.incompleta)}</span>
      </div>`;
}

/**
 * Un cuerpo con el que se crea una «Nueva unidad»: una hoja con su arte entero.
 * Una hoja a medias no se ofrece (#140), y las criaturas del catálogo del juego no
 * entran en la arena (13-10-2026).
 */
export interface CuerpoDeLaNueva {
  readonly id: string;
  readonly nombre: string;
}

/** Lo que la lista enseña además de las hojas: las unidades nuevas y los cuerpos de «Nueva unidad». */
export interface ListaDeUnidades {
  readonly cuerpos?: readonly CuerpoDeLaNueva[];
}

/**
 * Por qué la unidad `u` no se monta, o `null` si se monta: la hoja de su cuerpo
 * no está o está a medias en el taller (#140). Nunca se pinta con el Y Bot en su
 * lugar.
 */
export function porQueNoSeMonta(u: Unidad, hojas: ReadonlyMap<string, Hoja>): string | null {
  const h = hojas.get(u.cuerpo.hoja);
  if (h === undefined) return `su hoja «${u.cuerpo.hoja}» no está en assets/unidades/`;
  return h.incompleta;
}

/**
 * Las tarjetas de la lista: cada unidad del catálogo con **su** nombre y **su**
 * facción (`data/unidades.json`, lo que se edita y se guarda), y el retrato de la
 * hoja de su cuerpo. El nombre de la hoja es el del taller (`tools/taller/unidades.ts`,
 * lo que se le pidió pintar) y no se enseña como el de la unidad. Primero las de
 * una hoja, en el orden del taller, y detrás las nuevas, con su sello. Una cuya
 * hoja no está o está a medias va con el motivo (#140).
 */
export function tarjetasDelCatalogo(
  unidades: Iterable<Unidad>,
  hojas: readonly Hoja[],
): TarjetaDeUnidad[] {
  const porId = new Map(hojas.map((h) => [h.id, h]));
  const tarjeta = (u: Unidad, sello?: string): TarjetaDeUnidad => ({
    id: u.id,
    nombre: u.name,
    faccion: u.faction,
    retrato: u.cuerpo.hoja,
    ...(sello === undefined ? {} : { sello }),
    incompleta: porQueNoSeMonta(u, porId),
  });
  const todas = [...unidades];
  const deUnaHoja = new Map(todas.filter((u) => porId.has(u.id)).map((u) => [u.id, u]));
  return [
    ...hojas.flatMap((h) => {
      const u = deUnaHoja.get(h.id);
      return u === undefined ? [] : [tarjeta(u)];
    }),
    ...todas.filter((u) => !porId.has(u.id)).map((u) => tarjeta(u, 'nueva')),
  ];
}

/**
 * El selector de «Nueva unidad»: un desplegable con los cuerpos (el id de su
 * hoja) y el botón que la crea. Lo que se crea lo decide el núcleo
 * (`unidadNueva`); aquí solo se elige.
 */
function renderNuevaUnidad(cuerpos: readonly CuerpoDeLaNueva[]): Html {
  return html`<div class="nueva-unidad" data-nueva-unidad="si">
      <label class="campo"><span class="label">Nueva unidad</span>
        <select data-arena-nueva="si" title="Su cuerpo: con qué figura se pinta. Nace con las cifras mínimas y la Espada; su nivel sale de sus cifras, sus rasgos y su equipo">
          <option value="">— elige un cuerpo —</option>
          ${unir(cuerpos.map((h) => html`<option value="${h.id}">${h.nombre}</option>`))}
        </select></label>
      <button data-arena="crear-unidad" title="Crea una unidad nueva con ese cuerpo, las cifras mínimas y la Espada">Crear</button>
    </div>`;
}

/**
 * Para qué se enseña la lista: en el montaje, cada tarjeta se añade a un bando;
 * en la vista de edición, abre su ficha (`abiertas`: las que ya lo están).
 */
export type ModoDelCatalogo =
  | { readonly kind: 'montaje' }
  | {
      readonly kind: 'edicion';
      readonly abiertas: readonly FichaEditable[];
      /** Plegada, la lista es solo su cabecera (`listaPlegadaTras`). */
      readonly plegada: boolean;
    };

/**
 * La cabecera de la lista. En la edición, con alguna ficha abierta, lleva el
 * botón que la pliega a esta línea o la despliega para elegir otra.
 */
function cabeceraDeLaLista(modo: ModoDelCatalogo): Html {
  if (modo.kind === 'montaje' || modo.abiertas.length === 0) {
    if (modo.kind === 'edicion' && modo.plegada)
      throw new Error('la lista de la edición no se pliega sin ninguna ficha abierta');
    return html`<h3>Unidades</h3>`;
  }
  return html`<h3 class="cabecera-lista"><span>Unidades</span>
    <button class="boton-de-cabecera" data-arena="plegar-lista" aria-expanded="${modo.plegada ? 'false' : 'true'}" title="${modo.plegada ? 'Despliega la lista para abrir otra ficha' : 'Pliega la lista: las fichas abiertas ganan su alto'}">${modo.plegada ? 'Desplegar' : 'Plegar'}</button></h3>`;
}

/**
 * Los botones de una tarjeta de la lista. En el montaje, «+ izq.» y «+ der.»
 * (deshabilitados si la hoja está a medias). En la edición, «Abrir», con el
 * motivo de `abrirFichaBlocker` en su `title` y deshabilitado si no se abre.
 */
function botonesDeTarjeta(
  modo: ModoDelCatalogo,
  f: FichaEditable,
  incompleta: string | null,
): Html {
  const quien = html`data-unidad="${f.id}"`;
  if (modo.kind === 'edicion') {
    const motivo = abrirFichaBlocker(modo.abiertas, f, incompleta);
    const abierta = estaAbierta(modo.abiertas, claveDeFicha(f));
    return html`<button data-arena="abrir-ficha" ${quien} title="${motivo ?? 'Abre su ficha junto a las demás'}" ${motivo === null ? NADA : DESHABILITADO}>${abierta ? 'Abierta' : 'Abrir'}</button>`;
  }
  const montable = incompleta === null ? NADA : DESHABILITADO;
  return html`
          <button data-arena="añadir" data-lado="izquierda" ${quien} title="Añadir al bando izquierdo" ${montable}>+ izq.</button>
          <button data-arena="añadir" data-lado="derecha" ${quien} title="Añadir al bando derecho" ${montable}>+ der.</button>`;
}

/**
 * La lista de unidades (`tarjetasDelCatalogo`), por facción. Con `cuerpos`,
 * arriba el selector de «Nueva unidad». Sin el catálogo del juego: en la arena
 * solo están las cinco facciones (13-10-2026).
 */
export function renderCatalogo(
  todas: readonly TarjetaDeUnidad[],
  filtro: FiltroDeArena,
  modo: ModoDelCatalogo = { kind: 'montaje' },
  extra: ListaDeUnidades = {},
): Html {
  const cabecera = cabeceraDeLaLista(modo);
  if (modo.kind === 'edicion' && modo.plegada) return cabecera;
  const nueva = extra.cuerpos === undefined ? NADA : renderNuevaUnidad(extra.cuerpos);
  const botones = unir(
    (['todas', ...FACTION_IDS] as const).map((f) => {
      const nombre = f === 'todas' ? 'Todas' : NOMBRE_DE_FACCION[f];
      return html`<button data-arena="filtro" data-faccion="${f}" class="${f === filtro ? 'primary' : ''}">${nombre}</button>`;
    }),
  );
  const tarjetas = unir(
    todas
      .filter((t) => filtro === 'todas' || t.faccion === filtro)
      .map((t) => tarjetaDeUnidad(t, modo)),
  );
  return html`${cabecera}
    ${nueva}
    <div class="filtros">${botones}</div>
    <div class="catalogo">${tarjetas}</div>`;
}

/**
 * Lo que dice la barra al crear una unidad nueva (`unidadNueva`). El nivel se
 * **lee** del índice, el mismo de su ficha (`lecturaDelNivel` de lo que pelea):
 * decía «nivel 1» escrito a mano y la ficha de al lado, «Índice 217 · nivel 2»,
 * con un Paladín (R1 de la re-verificación de QA, 12-10-2026). En la edición no
 * hay bandos y su ficha ya está abierta.
 */
export function avisoDeNuevaUnidad(
  u: Unidad,
  escena: 'montaje' | 'edicion',
  piezas: EquipoAtado,
): string {
  // Nace con la Espada (sin arma no se combate): se dice lo que lleva.
  const lleva = piezas.piezasPuestas(u.equipo).map((p) => p.nombre);
  const con = lleva.length === 0 ? 'sin equipo' : `con ${lleva.join(', ')}`;
  const como = `Nueva unidad «${u.name}», ${con} (${lecturaDelNivel(unidadDeCombate(u, piezas))})`;
  return escena === 'edicion'
    ? `${como}: su ficha está abierta.`
    : `${como}: añádela a un bando o cambia su ficha.`;
}

/**
 * La primera frase de la barra al leer el catálogo de unidades: cuántas hay. Con
 * ninguna, la lista no ofrece nada que montar (las cifras solo salen del
 * catálogo) y lo dice; «Nueva unidad» sí crea.
 */
export function avisoDelCatalogoLeido(ruta: string, unidades: number): string {
  if (unidades > 0)
    return `Cargado ${ruta}: ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}.`;
  return `${ruta} no trae ninguna unidad: no hay unidades que montar; «Nueva unidad» sí crea.`;
}
