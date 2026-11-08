/**
 * La arena (`/arena/`, `pnpm arena`): se montan dos bandos con las hojas de las
 * cinco facciones, se cambian sus cifras, se elige quién mueve cada unidad y se
 * pelea con el mismo tablero y los mismos controles que la partida.
 *
 * Aquí solo se conecta: las reglas las aplica `SesionDeArena` (en
 * `sesion/sesion-de-arena.ts`, de la única puerta del cliente al núcleo, `sesion/`), el
 * ratón del tablero lo traduce `EscenaBatalla` —la misma de la partida— y el marcado
 * sale de `paneles/`. Lo que hace cada parte de la página vive en `arena/` desde R8 de la
 * reorganización (07-11-2026) —el catálogo (`catalogo.ts`), el montaje (`montaje.ts`), el editor
 * de la muralla (`editor-de-muralla.ts`), la dirección y el enlace (`enlace.ts`), las fichas
 * (`fichas.ts`) y sus figuras (`figuras.ts`), lo que se ve (`vista.ts`), los cambios
 * (`cambios.ts`), la pelea (`pelea.ts`), el fotograma (`dibujo.ts`), el puntero (`puntero.ts`),
 * el clic (`clic.ts`), el teclado (`teclado.ts`), lo que se pide al servidor (`servidor.ts`) y
 * abrirla (`abrir.ts`)—, y la página que comparten, con sus cinco estados, en `pagina.ts`.
 * Ninguna registra un oyente ni hace nada al importarse: aquí se construye cada cosa y se instala
 * cada parte en el orden de siempre, porque es comportamiento (dos oyentes del mismo evento en el
 * mismo nodo corren en el orden en que se registraron) y porque lo que se lee al cargar —lo
 * plegado de la muralla en `localStorage`, la URL— decide qué se dice primero.
 * Las cifras se guardan en el catálogo de unidades del repo a través del servidor de
 * desarrollo (`tools/vite/arena.ts`); sin él la página lo dice y sigue sirviendo para
 * pelear.
 */

import { IA_POR_DEFECTO } from '@core/arena/enlace.js';
import { murallaVacia } from '@core/battle/muralla.js';
import { COMBATE_COMPLETO } from '@core/combate.js';
import { EQUIPO_DEL_JUEGO } from '@core/equipo/atado.js';
import { HEROE } from '@core/hero/cuerpo-del-heroe.js';
import { todosLosHechizos } from '@core/magia/catalogo.js';
import { DESPEJADO } from '@core/state/clima.js';
import { EscenaBatalla } from '../batalla/escena.js';
import { GestosDeBatalla } from '../batalla/gestos.js';
import { DialogoDeLaRueda } from '../batalla/rueda/dialogo.js';
import { bucleDeDibujo } from '../comun/bucle.js';
import { mensajeDe } from '../comun/errores.js';
import { cargarArte } from '../render/assets.js';
import { ajustarLienzo } from '../render/lienzo.js';
import { abrirLaArena } from './abrir.js';
import { instalarLosCambios } from './cambios.js';
import { catalogoDeMagia, hechizosSinGuardar, instalarElAvisoAlCerrar } from './catalogo.js';
import { instalarElClic } from './clic.js';
import { dibujarFotograma } from './dibujo.js';
import { leerLaURL } from './enlace.js';
import { instalarElCierreDelEditor } from './fichas.js';
import { vigiaDeLasFiguras } from './figuras.js';
import { montarEditorDeMagia } from './magia.js';
import { quienUsaElHechizo } from './montaje.js';
import {
  type EstadoDeLaPelea,
  type EstadoDeLaVista,
  type EstadoDelCatalogo,
  type EstadoDelEditorDeMuralla,
  type EstadoDelMontaje,
  elementosDeLaArena,
  type PaginaDeLaArena,
} from './pagina.js';
import { caraDeLaArena } from './paneles/batalla.js';
import { jugadaEnCurso } from './pelea.js';
import { instalarElPuntero } from './puntero.js';
import { instalarElTeclado } from './teclado.js';
import { CLAVE_DE_PLEGADO, leerDelNavegador, QUE_PLEGADO, repintar } from './vista.js';

const elementos = elementosDeLaArena();
const { canvas, elStatus, elMagia, elRueda, elTituloDelEditor, botonCerrarEditor } = elementos;

/**
 * El bucle de dibujo (`comun/bucle.ts`), con la red de la arena: un fallo al pintar se
 * escribe en la barra y no se pide otro fotograma hasta el siguiente gesto. Va aquí arriba
 * porque lo recogen desde el principio los gestos y la rueda; lo que pinta, `dibujarFotograma`,
 * en `dibujo.ts`, con la página, que se monta más abajo (el primer fotograma llega después).
 */
const pedirFotograma = bucleDeDibujo({
  pintar: (ahora) => dibujarFotograma(pagina, ahora),
  alFallar: (motivo) => {
    console.error('[arena] fallo al pintar', motivo);
    elStatus.textContent = `No se ha podido pintar la pantalla: ${mensajeDe(motivo)}`;
    return false;
  },
});

// ---------------------------------------------------------------- estado

/** Los hechizos con que abre la página: los del núcleo, hasta que lleguen los de disco. */
const hechizosDelNucleo = todosLosHechizos();
const catalogo: EstadoDelCatalogo = {
  hojas: [],
  hojasPorId: new Map(),
  unidadesDelCatalogo: new Map(),
  equipo: EQUIPO_DEL_JUEGO,
  equipoGuardado: EQUIPO_DEL_JUEGO,
  hechizosDeLaPagina: hechizosDelNucleo,
  hechizosGuardados: hechizosDelNucleo,
  cuerpoDeTodoHeroe: HEROE.combate,
  cuerpoGuardado: HEROE.combate,
  avisoDeIncompletas: '',
  sinGuardado: null,
  versionLeida: null,
  unidadesSinGuardar: new Set(),
};

/**
 * El editor de magia: lo que cambia, la página lo adopta y, en plena pelea, la
 * batalla también (`retocarEnBatalla`, `kind: 'hechizos'`).
 */
const editorDeMagia = montarEditorDeMagia(elMagia, {
  hechizos: () => catalogo.hechizosDeLaPagina,
  cambiar: (lista, elegido) => {
    catalogo.hechizosDeLaPagina = lista;
    editorDeMagia.elegir(elegido);
    if (pelea.sesion !== null) {
      const motivo = pelea.sesion.retocar({
        kind: 'hechizos',
        hechizos: catalogoDeMagia(catalogo),
      });
      vista.aviso =
        motivo === null ? 'Cambiado: vale ya en esta pelea.' : `No entra en esta pelea: ${motivo}`;
    }
    repintar(pagina);
    pedirFotograma();
  },
  sinGuardar: () => hechizosSinGuardar(catalogo),
  quienLoUsa: (id) => quienUsaElHechizo(pagina, id),
  poder: () => montaje.heroes.izquierda?.poder ?? 1,
  avisar: (texto) => {
    vista.aviso = texto;
    pedirFotograma();
  },
});

const montaje: EstadoDelMontaje = {
  puestos: { izquierda: [], derecha: [] },
  heroes: { izquierda: null, derecha: null },
  iaDelBando: { ...IA_POR_DEFECTO },
  siguienteClave: 1,
  combate: COMBATE_COMPLETO,
  semillaPedida: null,
  avisoDeSemilla: '',
  parametrosQueNoValen: [],
  climaDeLaArena: DESPEJADO,
  enlaceCopiado: null,
};

const vista: EstadoDeLaVista = {
  piezaElegida: null,
  filtro: 'todas',
  elegida: null,
  animDeFicha: new Map(),
  abiertas: [],
  listaPlegada: false,
  renombrando: new Set(),
  escena: 'montaje',
  escenaDeVuelta: 'montaje',
  aviso: 'Cargando las hojas…',
  figuras: [],
  pintado: new WeakMap(),
  enPantalla: new Set(),
  rechazado: null,
  pendiente: null,
};

const pelea: EstadoDeLaPelea = {
  sesion: null,
  fichaDeLaRueda: false,
  colocarElMarco: false,
  paneles: null,
};

const editorDeMuralla: EstadoDelEditorDeMuralla = {
  muralla: murallaVacia('piedra'),
  herramienta: 'muro',
  nombreDeForma: '',
  formasGuardadas: [],
  murallasSinGuardado: null,
  murallaPlegada: leerDelNavegador(CLAVE_DE_PLEGADO, QUE_PLEGADO) === '1',
};

/** La URL con que se abrió la página: lo que pide se lee al cargar (`leerLaURL`), en este sitio. */
const parametros = new URLSearchParams(location.search);
leerLaURL(montaje, parametros);

const vigiaDeFiguras = vigiaDeLasFiguras(vista, pedirFotograma);

/**
 * Lo que dicen el título y el botón del editor: los de `index.html` al cambiar
 * cifras, y los de mirar una ficha desde la rueda.
 */
const textosDelEditor = {
  titulo: elTituloDelEditor.textContent,
  cerrar: botonCerrarEditor.textContent,
} as const;

// El primer oyente de la página tras los del editor de magia: el aviso al cerrar con algo sin
// guardar. Recibe solo el catálogo, porque la página aún no está entera.
instalarElAvisoAlCerrar(catalogo);

// ---------------------------------------------------------------- batalla

const batalla = new EscenaBatalla(() => {
  if (pelea.sesion === null) throw new Error('la escena de batalla se ha usado sin batalla');
  return pelea.sesion;
});

/**
 * Los gestos de la batalla, los de la partida (`batalla/gestos.ts`): los botones del
 * panel, las teclas y el puntero sobre el tablero, con la misma puerta de arriba.
 */
const gestos = new GestosDeBatalla({
  sesion: () => pelea.sesion,
  escena: batalla,
  jugadaEnCurso: () => jugadaEnCurso(pagina),
  pedirFotograma,
});

// ---------------------------------------------------------------- lienzo y rueda

const principal = ajustarLienzo(canvas, pedirFotograma);
cargarArte(pedirFotograma, { manifiesto: false, mapa: false, hojas: false });

/**
 * La rueda del golpe (`batalla/rueda/dialogo.ts`, la misma de la partida): la arena pone
 * alrededor de la figura de los dos que se cruzan su ficha y su vista previa
 * (`caraDeLaArena`).
 */
const rueda = new DialogoDeLaRueda(elRueda, {
  sesion: () => pelea.sesion,
  escena: batalla,
  cara: () => (pelea.sesion === null ? null : caraDeLaArena(pelea.sesion)),
  pedirFotograma,
  alPulsarMientrasCuenta: () => {
    jugadaEnCurso(pagina);
  },
});

/**
 * La página entera (`arena/pagina.ts`): lo que leen las piezas de `arena/`. Se monta aquí, con la
 * rueda ya hecha, porque la lleva; lo que la nombra más arriba (un cierre: el bucle de dibujo, un
 * gesto) solo la lee al llamarse, cuando este fichero ya se ha evaluado entero.
 */
const pagina: PaginaDeLaArena = {
  ...elementos,
  pedirFotograma,
  catalogo,
  montaje,
  vista,
  pelea,
  editorDeMuralla,
  editorDeMagia,
  parametros,
  vigiaDeFiguras,
  textosDelEditor,
  batalla,
  gestos,
  principal,
  rueda,
};

// ---------------------------------------------------------------- los oyentes, en su orden

// El puntero sobre el tablero, el clic, los cambios (las teclas del campo del nombre, en la
// captura; el foco y cada `change`), el teclado y el cierre del editor de la batalla: el orden
// en que se registraban cuando eran sentencias de este fichero.
instalarElPuntero(pagina);
instalarElClic(pagina);
instalarLosCambios(pagina);
instalarElTeclado(pagina);
instalarElCierreDelEditor(pagina);

// Lo último: lo de disco, el enlace, lo recordado y la vista que pide la dirección.
abrirLaArena(pagina);
