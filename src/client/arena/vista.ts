/**
 * Lo que se ve en la arena (`EstadoDeLaVista`): ir de una escena a otra (`irA`) con lo que dicen
 * la barra de arriba y la dirección (`?vista=`, `?pieza=`), lo que se recuerda en este navegador
 * (las fichas abiertas y lo plegado) y repintar lo que se ve —el montaje, la edición, el equipo,
 * una ficha o todo—, en el acto o en la tarea siguiente (`pedirRepintado`). Era parte de
 * `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import { laLlevaElHeroe } from '@core/arena/heroe.js';
import { idsPuestos } from '@core/equipo/vestir.js';
import { unaVezEnLaURL } from '@core/validar.js';
import { mensajeDe } from '../comun/errores.js';
import { html, pintar } from '../comun/html.js';
import { selectoresDelCombate } from '../views/combate.js';
import {
  cuerpoSinGuardar,
  listaDeUnidades,
  piezasSinGuardar,
  tarjetasDeLaLista,
} from './catalogo.js';
import { abiertasATexto, fichaDeClave, interiorDeFichaAbierta, renderEdicion } from './edicion.js';
import { pintarMuralla } from './editor-de-muralla.js';
import { aLaBarraDeLaArena, enlaceVigente } from './enlace.js';
import { fichaAbierta, fichaElegida, pintarEditor } from './fichas.js';
import { recogerFiguras } from './figuras.js';
import { describir, heroesDeLaPagina, ocupados } from './montaje.js';
import type { Escena, EstadoDeLaVista, PaginaDeLaArena } from './pagina.js';
import { renderBando, renderEnlace } from './paneles/bandos.js';
import { LA_LLEVA_EL_HEROE, renderEquipo, sinGuardarEnPalabras } from './paneles/equipo.js';
import { renderCatalogo } from './paneles/lista.js';

const ROTULO_DE_ESCENA: Readonly<Record<Escena, string>> = {
  montaje: 'Montaje',
  edicion: 'Edición',
  equipo: 'Equipo',
  magia: 'Magia',
  battle: 'Batalla',
};

const VUELTA_DE_EQUIPO: Readonly<Record<Exclude<Escena, 'equipo' | 'magia'>, string>> = {
  montaje: 'Volver al montaje',
  edicion: 'Volver a la edición',
  battle: 'Volver a la pelea',
};

/**
 * Cambia de escena: la variable, el `data-escena` que lee el CSS, el rótulo de la
 * barra y la URL (`vistaALaBarra`).
 */
export function irA(pagina: PaginaDeLaArena, e: Escena): void {
  const { vista, app, elDay, elTurn, botonVolverDeEquipo, botonVolverDeMagia } = pagina;
  if ((e === 'equipo' || e === 'magia') && vista.escena !== 'equipo' && vista.escena !== 'magia') {
    vista.escenaDeVuelta = vista.escena;
  }
  vista.escena = e;
  app.dataset.escena = e;
  elDay.textContent = ROTULO_DE_ESCENA[e];
  elTurn.textContent = '';
  botonVolverDeEquipo.textContent = VUELTA_DE_EQUIPO[vista.escenaDeVuelta];
  botonVolverDeMagia.textContent = VUELTA_DE_EQUIPO[vista.escenaDeVuelta];
  vistaALaBarra(vista);
}

/**
 * Las vistas que sobreviven a recargar la página (`?vista=`): la edición y el
 * equipo, este con su pieza elegida (`?pieza=`). El montaje es la de sin nada, y
 * la pelea no se recarga (su sesión vive en la página): vuelve al montaje.
 */
const VISTAS_EN_LA_URL = ['edicion', 'equipo', 'magia'] as const;

type VistaEnLaURL = (typeof VISTAS_EN_LA_URL)[number];

function esVistaEnLaURL(x: string): x is VistaEnLaURL {
  return (VISTAS_EN_LA_URL as readonly string[]).includes(x);
}

/** Escribe en la barra la vista de ahora y, en la de equipo, su pieza. */
function vistaALaBarra(vista: EstadoDeLaVista): void {
  aLaBarraDeLaArena((url) => {
    if (vista.escena === 'edicion' || vista.escena === 'equipo' || vista.escena === 'magia') {
      url.searchParams.set('vista', vista.escena);
    } else url.searchParams.delete('vista');
    if (vista.escena === 'equipo' && vista.piezaElegida !== null)
      url.searchParams.set('pieza', vista.piezaElegida);
    else url.searchParams.delete('pieza');
  });
}

/** Lo que dice la barra al entrar en la edición o en el equipo, con su botón o al recargar. */
export function avisoAlEntrar(pagina: PaginaDeLaArena, v: VistaEnLaURL): string {
  const { vista, pelea } = pagina;
  if (v === 'magia') {
    return pelea.sesion === null
      ? 'Elige un hechizo para cambiarlo, o crea uno: «Guardar» lo escribe en data/hechizos.json. El héroe lo lleva si lo marcas en su libro; una unidad, como poder en su ficha.'
      : 'En plena pelea: lo que cambies vale ya para quien lo lleve (lo ya echado sigue como se echó).';
  }
  if (v === 'edicion') {
    return vista.abiertas.length === 0
      ? 'Abre las fichas que quieras desde la lista: se añaden debajo. Lo que cambies vale para el montaje.'
      : 'Lo que cambies aquí vale para el montaje; «Volver al montaje» lo enseña allí.';
  }
  return pelea.sesion === null
    ? 'Elige una pieza para cambiarla, o crea una nueva en su hueco: «Guardar» la escribe en data/equipo.json, el catálogo del juego.'
    : EQUIPO_EN_PLENA_PELEA;
}

/**
 * La vista que pide la URL al abrir, con su pieza, o lo que no vale dicho para la
 * persona: la página abre entonces en el montaje.
 */
export function vistaDeLaURL(pagina: PaginaDeLaArena): {
  readonly vista: VistaEnLaURL | null;
  readonly pieza: string | null;
  readonly aviso: string;
} {
  const { catalogo, parametros } = pagina;
  try {
    const vista = unaVezEnLaURL(parametros.getAll('vista'), 'vista');
    const pieza = unaVezEnLaURL(parametros.getAll('pieza'), 'pieza');
    if (vista === null || vista === '') return { vista: null, pieza: null, aviso: '' };
    if (!esVistaEnLaURL(vista)) {
      throw new Error(
        `«?vista=${vista}» no es una vista de la arena: valen ${VISTAS_EN_LA_URL.map((v) => `«${v}»`).join(' y ')}`,
      );
    }
    if (pieza === null || vista !== 'equipo') return { vista, pieza: null, aviso: '' };
    if (!catalogo.equipo.piezas.has(pieza)) {
      const aviso = `La pieza «${pieza}» de la dirección no está en el catálogo de equipo. `;
      return { vista, pieza: null, aviso };
    }
    return { vista, pieza, aviso: '' };
  } catch (err) {
    return { vista: null, pieza: null, aviso: `${mensajeDe(err)}. ` };
  }
}

/**
 * Lo recordado en este navegador: comodidades de quien mira, no datos. Sin
 * `localStorage` —ventana privada, datos bloqueados— se lee `null` y se avisa en
 * consola, y lo que se cambie dura lo que la página.
 */
export function leerDelNavegador(clave: string, que: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch (err) {
    console.warn(`[arena] no se puede leer ${que}:`, err);
    return null;
  }
}

export function guardarEnElNavegador(clave: string, valor: string, que: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch (err) {
    console.warn(`[arena] no se puede recordar ${que}:`, err);
  }
}

/**
 * El editor de la muralla, plegado o no: a 1280×720 el editor desplegado deja
 * los bandos en ~250 px.
 */
export const CLAVE_DE_PLEGADO = 'arena.muralla.plegada';

export const QUE_PLEGADO = 'si la muralla va plegada';

/** Las fichas abiertas de la edición, en su orden. */
export const CLAVE_DE_ABIERTAS = 'arena.fichas-abiertas';

export const QUE_ABIERTAS = 'las fichas abiertas';

export function recordarAbiertas(vista: EstadoDeLaVista): void {
  guardarEnElNavegador(CLAVE_DE_ABIERTAS, abiertasATexto(vista.abiertas), QUE_ABIERTAS);
}

/** Si la lista de la edición va plegada: lo único que la cambia es su botón. */
export const CLAVE_DE_LISTA = 'arena.edicion.lista-plegada';

export const QUE_LISTA = 'si la lista de la edición va plegada';

export function repintarMontaje(pagina: PaginaDeLaArena): void {
  const { catalogo, montaje, vista, elFicha, elCatalogo, elCombate, elMontaje, elBando } = pagina;
  pintarVista(pagina, elMontaje, () => {
    for (const lado of ['izquierda', 'derecha'] as const) {
      pintar(
        elBando[lado],
        renderBando(
          lado,
          montaje.puestos[lado],
          (p) => describir(catalogo, p, lado),
          vista.elegida,
          montaje.combate.tope,
          montaje.heroes[lado],
          ocupados(montaje, lado),
          montaje.iaDelBando[lado],
        ),
      );
    }
    pintar(elFicha, fichaElegida(pagina));
    pintar(elCombate, selectoresDelCombate(montaje.combate));
    pintar(
      elCatalogo,
      html`${renderEnlace(enlaceVigente(pagina))}${renderCatalogo(
        tarjetasDeLaLista(catalogo),
        vista.filtro,
        { kind: 'montaje' },
        listaDeUnidades(catalogo),
      )}`,
    );
    pintarMuralla(pagina);
  });
}

/** Pinta una vista (el montaje o la edición) y recoge sus figuras para animarlas. */
function pintarVista(pagina: PaginaDeLaArena, raiz: Element, pintarla: () => void): void {
  const { pedirFotograma } = pagina;
  pintarla();
  recogerFiguras(pagina, raiz);
  pedirFotograma();
}

/** La vista de edición: la lista con «Abrir» y las fichas abiertas. */
function repintarEdicion(pagina: PaginaDeLaArena): void {
  const { catalogo, vista, elEdicion } = pagina;
  pintarVista(pagina, elEdicion, () => {
    const lista = renderCatalogo(
      tarjetasDeLaLista(catalogo),
      vista.filtro,
      { kind: 'edicion', abiertas: vista.abiertas, plegada: vista.listaPlegada },
      listaDeUnidades(catalogo),
    );
    pintar(
      elEdicion,
      renderEdicion({ lista, fichas: vista.abiertas.map((f) => fichaAbierta(pagina, f)) }),
    );
  });
}

/** La vista «Editar equipo»: el catálogo de equipo por tipo y la ficha de la elegida. */
function repintarEquipo(pagina: PaginaDeLaArena): void {
  const { catalogo, vista, pelea, elEquipo } = pagina;
  pintarVista(pagina, elEquipo, () => {
    pintar(
      elEquipo,
      renderEquipo({
        piezas: catalogo.equipo,
        elegida: vista.piezaElegida,
        llevan: (id) => quienesLaLlevan(pagina, id),
        rechazo: vista.aviso === vista.rechazado ? vista.aviso : null,
        enCombate: pelea.sesion !== null,
        sinGuardar: sinGuardarEnPalabras(
          piezasSinGuardar(catalogo).length,
          catalogo.unidadesSinGuardar.size,
          cuerpoSinGuardar(catalogo),
        ),
      }),
    );
    vistaALaBarra(vista);
  });
}

/**
 * Quiénes llevan la pieza `id`: las unidades del catálogo, por su nombre, todo
 * héroe si es de su equipo base (`laLlevaElHeroe`: la Espada y el gambesón) y los
 * héroes de los bandos que la llevan puesta.
 */
function quienesLaLlevan(pagina: PaginaDeLaArena, id: string): string[] {
  const { catalogo, montaje } = pagina;
  return [
    ...[...catalogo.unidadesDelCatalogo.values()]
      .filter((u) => idsPuestos(u.equipo).includes(id))
      .map((u) => u.name),
    ...(laLlevaElHeroe(id) ? [LA_LLEVA_EL_HEROE] : []),
    ...heroesDeLaPagina(montaje)
      .filter((h) => idsPuestos(h.equipo).includes(id))
      .map((h) => h.nombre),
  ];
}

/**
 * Tras un cambio en una ficha: en la edición, solo esa ficha. La lista no
 * cambia con una cifra, y repintarla entera devolvía su desplazamiento arriba a
 * cada tabulador. En el montaje y en la pelea, lo de siempre: el resumen de los
 * bandos y el editor dependen de la cifra.
 */
function repintarFicha(pagina: PaginaDeLaArena, clave: string): void {
  const { vista, elEdicion } = pagina;
  const f = fichaDeClave(clave);
  const marco =
    vista.escena === 'edicion' && f.kind !== 'heroe'
      ? elEdicion.querySelector(`article[data-clave-de-ficha="${CSS.escape(clave)}"]`)
      : null;
  if (marco === null || f.kind === 'heroe') repintar(pagina);
  else
    pintarVista(pagina, elEdicion, () =>
      pintar(marco, interiorDeFichaAbierta(fichaAbierta(pagina, f))),
    );
}

/** La barra de la vista de equipo a media pelea, hasta el primer cambio. */
export const EQUIPO_EN_PLENA_PELEA =
  'En plena pelea: lo que cambies vale ya para todos los que la llevan, de los dos bandos. La IA espera a que vuelvas.';

/** Repinta lo que se ve: el montaje o la edición, o en la batalla el editor y el panel. */
export function repintar(pagina: PaginaDeLaArena): void {
  const { vista, editorDeMagia, pedirFotograma, editor } = pagina;
  if (vista.escena === 'edicion') repintarEdicion(pagina);
  else if (vista.escena === 'equipo') repintarEquipo(pagina);
  else if (vista.escena === 'magia') editorDeMagia.repintar();
  else if (vista.escena === 'montaje') repintarMontaje(pagina);
  else {
    if (editor.open) pintarEditor(pagina);
    pedirFotograma();
  }
}

export function pedirRepintado(pagina: PaginaDeLaArena, clave: string | null = null): void {
  const { vista } = pagina;
  const antes = vista.pendiente;
  if (clave === null || antes === 'todo') vista.pendiente = 'todo';
  else if (antes === null) vista.pendiente = new Set([clave]);
  else antes.add(clave);
  if (antes === null) setTimeout(() => repintarLoPendiente(pagina), 0);
}

/**
 * Repinta lo pedido, si queda algo. Un clic no espera a la tarea siguiente —no
 * mueve el foco, y quien lo mira (`pnpm capturas` también) espera verlo ya—: lo
 * pide y lo repinta en el acto, junto con lo que hubiera pendiente.
 */
export function repintarLoPendiente(pagina: PaginaDeLaArena): void {
  const { vista } = pagina;
  const que = vista.pendiente;
  vista.pendiente = null;
  if (que === 'todo') repintar(pagina);
  else for (const k of que ?? []) repintarFicha(pagina, k);
}
