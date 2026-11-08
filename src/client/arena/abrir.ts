/**
 * Abrir la arena (R8 de la reorganización, 07-11-2026: era la última sentencia de `main.ts`): lo
 * que hay en disco (el catálogo, las formas de muralla), el enlace que traiga la URL, lo
 * recordado en este navegador y la vista que pide la dirección, con lo que dice la barra al
 * acabar. Nada se hace al importarse: lo llama `main.ts`, lo último.
 */
import { mensajeDe } from '../../shared/errores.js';
import { arrancar, porQueNoSeMonta, unidadDe } from './catalogo.js';
import { leerAbiertas, listaPlegadaTras } from './edicion.js';
import { arrancarMurallas } from './editor-de-muralla.js';
import { montarDelEnlace } from './enlace.js';
import type { PaginaDeLaArena } from './pagina.js';
import {
  avisoAlEntrar,
  CLAVE_DE_ABIERTAS,
  CLAVE_DE_LISTA,
  irA,
  leerDelNavegador,
  QUE_ABIERTAS,
  QUE_LISTA,
  repintar,
  vistaDeLaURL,
} from './vista.js';

/**
 * Abre la arena: lee de disco el catálogo y las formas de muralla, monta el enlace que traiga
 * la URL, recupera las fichas abiertas la última vez y lo plegado de la lista, compone lo que dice
 * la barra y va a la vista que pide la dirección (o al montaje). Si algo lanza, la barra lo dice.
 * Era la última sentencia de `main.ts` hasta R8 de la reorganización (07-11-2026).
 */
export function abrirLaArena(pagina: PaginaDeLaArena): void {
  const { catalogo, montaje, vista, editorDeMuralla, elStatus } = pagina;
  // Las dos lecturas no dependen una de otra: van a la vez.
  Promise.all([arrancar(pagina), arrancarMurallas(editorDeMuralla)]).then(
    ([, avisoDeMurallas]) => {
      const delEnlace = montarDelEnlace(pagina);
      // Las fichas abiertas la última vez: solo las que aún se abren (la hoja está
      // y está entera).
      const recordadas = leerAbiertas(
        leerDelNavegador(CLAVE_DE_ABIERTAS, QUE_ABIERTAS),
        (f) =>
          catalogo.unidadesDelCatalogo.has(f.id) &&
          porQueNoSeMonta(catalogo, unidadDe(catalogo, f.id)) === null,
      );
      vista.abiertas = recordadas.abiertas;
      vista.listaPlegada = listaPlegadaTras(
        'entrar',
        leerDelNavegador(CLAVE_DE_LISTA, QUE_LISTA) === '1',
        vista.abiertas.length,
      );
      const deAbiertas = recordadas.aviso === '' ? '' : ` ${recordadas.aviso}`;
      const pedida = vistaDeLaURL(pagina);
      const queHacer =
        pedida.vista === null
          ? 'Añade unidades a los dos bandos y pulsa Luchar.'
          : avisoAlEntrar(pagina, pedida.vista);
      vista.aviso = delEnlace?.montado
        ? `${delEnlace.aviso}${vista.aviso}${catalogo.avisoDeIncompletas}${avisoDeMurallas}${deAbiertas}`
        : `${montaje.avisoDeSemilla}${delEnlace?.aviso ?? ''}${vista.aviso}${catalogo.avisoDeIncompletas}${avisoDeMurallas} ${queHacer}${deAbiertas}`;
      vista.aviso = `${pedida.aviso}${vista.aviso}`;
      // Recargar deja la vista donde estaba: la edición con sus fichas (recordadas
      // arriba) o el equipo con su pieza.
      if (pedida.vista === 'equipo') {
        vista.piezaElegida = pedida.pieza ?? catalogo.equipo.piezas.keys().next().value ?? null;
      }
      irA(pagina, pedida.vista ?? 'montaje');
      repintar(pagina);
    },
    (err: unknown) => {
      console.error('[arena] no ha arrancado', err);
      vista.aviso = `La arena no ha podido arrancar: ${mensajeDe(err)}`;
      elStatus.textContent = vista.aviso;
    },
  );
}
