/**
 * La página de la arena, para las piezas que la montan (R8 de la reorganización, 07-11-2026): los
 * elementos que se buscan al cargarla (`elementosDeLaArena`), lo que cambia mientras vive —el
 * catálogo, el montaje, lo que se ve, la pelea y el editor de la muralla, un objeto por estado— y
 * la página entera (`PaginaDeLaArena`). `main.ts` lo construye todo en el orden de siempre y cada
 * pieza de `arena/` recibe lo que lee de ello.
 */
import type { HeroeDeArena } from '@core/arena/heroe.js';
import type { Lado } from '@core/arena/lados.js';
import type { FormaDeMuralla } from '@core/arena/murallas.js';
import type { MurallaDeBatalla } from '@core/battle/types.js';
import type { ReglasDelCombate } from '@core/combate.js';
import type { CatalogoDeEquipo } from '@core/equipo/atado.js';
import type { CuerpoDeTodoHeroe } from '@core/hero/cuerpo-del-heroe.js';
import type { Hechizo } from '@core/magia/formato.js';
import type { ClimaDelSitio } from '@core/state/clima.js';
import type { Hoja, Unidad } from '@core/unidad/formato.js';
import type { EscenaBatalla } from '../batalla/escena.js';
import type { GestosDeBatalla } from '../batalla/gestos.js';
import type { DialogoDeLaRueda } from '../batalla/rueda/dialogo.js';
import type { CharacterClip } from '../render/figuras/character.js';
import type { ajustarLienzo } from '../render/lienzo.js';
import type { SesionDeArena } from '../sesion/sesion-de-arena.js';
import type { FichaEditable } from './edicion.js';
import type { montarEditorDeMagia } from './magia.js';
import type { Elegida, Puesto } from './paneles/bandos.js';
import type { FiltroDeArena } from './paneles/lista.js';
import type { HerramientaDeMuralla } from './paneles/muralla.js';

/** Los elementos de la página (`index.html`) que se buscan al cargarla. */
interface ElementosDeLaArena {
  readonly app: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly elLienzo: HTMLElement;
  readonly elDay: HTMLElement;
  readonly elTurn: HTMLElement;
  readonly elSeed: HTMLElement;
  readonly elStatus: HTMLElement;
  readonly elBarraDeEstado: HTMLElement;
  readonly elSide: HTMLElement;
  readonly elFicha: HTMLElement;
  readonly elCatalogo: HTMLElement;
  readonly elMuralla: HTMLElement;
  /** Los selectores de la complejidad de la pelea: tope por bando y rueda. */
  readonly elCombate: HTMLElement;
  readonly elMontaje: HTMLElement;
  /** La vista de edición: hasta cuatro fichas abiertas a la vez (`edicion.ts`). */
  readonly elEdicion: HTMLElement;
  /** La vista «Editar equipo»: las piezas por hueco y la ficha de la elegida. */
  readonly elEquipo: HTMLElement;
  /** La vista «Editar magia» (`magia.ts`): los hechizos por entrega y la ficha del elegido. */
  readonly elMagia: HTMLElement;
  /** El «Volver» de la vista de equipo: dice adónde vuelve (`escenaDeVuelta`). */
  readonly botonVolverDeEquipo: HTMLElement;
  readonly botonLuchar: HTMLElement;
  /** El editor de la batalla: la ficha de lo elegido, que cambia todo su tipo ya en la pelea. */
  readonly editor: HTMLDialogElement;
  /** La rueda del golpe (`rueda.ts`): modal sobre el lienzo, mientras se elige y se cuenta un cruce. */
  readonly elRueda: HTMLDialogElement;
  readonly elFichaDelEditor: HTMLElement;
  readonly elAvisoDelEditor: HTMLElement;
  readonly elTituloDelEditor: HTMLElement;
  readonly botonCerrarEditor: HTMLElement;
  readonly elBando: Record<Lado, HTMLElement>;
  /** El «Volver» de la vista de magia, como el de equipo. */
  readonly botonVolverDeMagia: HTMLElement;
}

/**
 * Busca los elementos de la página, uno a uno y en el orden de siempre; el «Volver» de la magia,
 * el último (hasta R8 se buscaba más abajo, tras montar el editor de magia, que no lo toca).
 */
export function elementosDeLaArena(): ElementosDeLaArena {
  const app = document.getElementById('app') as HTMLElement;
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const elLienzo = document.getElementById('lienzo') as HTMLElement;
  const elDay = document.getElementById('day') as HTMLElement;
  const elTurn = document.getElementById('turn') as HTMLElement;
  const elSeed = document.getElementById('seed') as HTMLElement;
  const elStatus = document.getElementById('status') as HTMLElement;
  const elBarraDeEstado = document.getElementById('statusbar') as HTMLElement;
  const elSide = document.getElementById('side') as HTMLElement;
  const elFicha = document.getElementById('ficha') as HTMLElement;
  const elCatalogo = document.getElementById('catalogo') as HTMLElement;
  const elMuralla = document.getElementById('muralla') as HTMLElement;
  const elCombate = document.getElementById('combate-de-la-arena') as HTMLElement;
  const elMontaje = document.getElementById('montaje') as HTMLElement;
  const elEdicion = document.getElementById('edicion') as HTMLElement;
  const elEquipo = document.getElementById('equipo') as HTMLElement;
  const elMagia = document.getElementById('magia') as HTMLElement;
  const botonVolverDeEquipo = document.querySelector(
    '[data-arena="volver-de-equipo"]',
  ) as HTMLElement;
  const botonLuchar = document.querySelector('[data-arena="luchar"]') as HTMLElement;
  const editor = document.getElementById('editor-en-combate') as HTMLDialogElement;
  const elRueda = document.getElementById('rueda') as HTMLDialogElement;
  const elFichaDelEditor = document.getElementById('ficha-del-editor') as HTMLElement;
  const elAvisoDelEditor = document.getElementById('aviso-del-editor') as HTMLElement;
  const elTituloDelEditor = document.getElementById('titulo-del-editor') as HTMLElement;
  const botonCerrarEditor = editor.querySelector('[data-arena="cerrar-editor"]') as HTMLElement;
  const elBando: Record<Lado, HTMLElement> = {
    izquierda: document.getElementById('bando-izquierda') as HTMLElement,
    derecha: document.getElementById('bando-derecha') as HTMLElement,
  };
  const botonVolverDeMagia = document.querySelector(
    '[data-arena="volver-de-magia"]',
  ) as HTMLElement;
  return {
    app,
    canvas,
    elLienzo,
    elDay,
    elTurn,
    elSeed,
    elStatus,
    elBarraDeEstado,
    elSide,
    elFicha,
    elCatalogo,
    elMuralla,
    elCombate,
    elMontaje,
    elEdicion,
    elEquipo,
    elMagia,
    botonVolverDeEquipo,
    botonLuchar,
    editor,
    elRueda,
    elFichaDelEditor,
    elAvisoDelEditor,
    elTituloDelEditor,
    botonCerrarEditor,
    elBando,
    botonVolverDeMagia,
  };
}

/**
 * El catálogo de la página y su guardado: las hojas, las unidades, el equipo, los hechizos y el
 * cuerpo de todo héroe tal como se editan aquí, lo que hay en disco (para contar lo que queda por
 * guardar) y si se puede guardar. Eran trece `let` y `const` de módulo hasta R8 de la
 * reorganización (07-11-2026): en un objeto, para que lo lean y lo escriban las partes de la
 * página desde sus ficheros (el `let` de un módulo no se asigna desde otro).
 */
export interface EstadoDelCatalogo {
  hojas: readonly Hoja[];
  /** Las mismas, por su id: se hace al cargarlas y lo leen todas las preguntas por una hoja. */
  hojasPorId: ReadonlyMap<string, Hoja>;
  /**
   * Las cifras por TIPO de unidad, por su id: cambiar el monje cambia todos los
   * monjes. Las de las hojas (id = la hoja) y las nuevas (`unidadNueva`). Lleva
   * también las del catálogo cuya hoja no está —no se pueden montar—, para que
   * «Guardar» no las tire (H2 de QA).
   */
  readonly unidadesDelCatalogo: Map<string, Unidad>;
  /**
   * El catálogo de equipo de la página, hecho (`catalogoDeEquipo`): el de
   * `data/equipo.json` tal como lo sirve el servidor de desarrollo (sin él, el que
   * se cargó con la página) con lo que se haya cambiado aquí y lo que traigan los
   * enlaces abiertos, que entra como cualquier cambio sin guardar (`conPiezas`).
   * **Uno solo**: con él se pelea, es el que enseña «Editar equipo» y el que escribe
   * «Guardar», lo que lee el juego.
   */
  equipo: CatalogoDeEquipo;
  /**
   * El catálogo de equipo tal como está en disco: con él se cuenta lo que queda por
   * guardar (`piezasSinGuardar`), pieza a pieza distinta, no por gestos.
   */
  equipoGuardado: CatalogoDeEquipo;
  /**
   * Los hechizos de la página (el editor de magia, 06-11-2026): los de
   * `data/hechizos.json` tal como los sirve el servidor (sin él, los del núcleo), con
   * lo que se haya cambiado aquí y lo que traigan los enlaces abiertos. Los que no
   * valen se quedan en la lista (para arreglarlos) y no se pelea con ellos.
   */
  hechizosDeLaPagina: readonly Hechizo[];
  /** Los de disco: con ellos se cuenta lo que queda por guardar. */
  hechizosGuardados: readonly Hechizo[];
  /**
   * El cuerpo de todo héroe (`combate` de data/heroe.json): el de los dos héroes y el
   * de quien se ponga, que la ficha de cualquiera de ellos cambia en los dos
   * (`cambiarCuerpoDeTodoHeroe`) y «Guardar» escribe. `cuerpoGuardado`, el del disco
   * (o el del núcleo, sin servidor): lo distinto está sin guardar.
   */
  cuerpoDeTodoHeroe: CuerpoDeTodoHeroe;
  cuerpoGuardado: CuerpoDeTodoHeroe;
  /**
   * Las unidades con el arte a medias, dichas en la barra mientras se monta: el
   * aviso que antes era la excepción que tumbaba la lista (#140).
   */
  avisoDeIncompletas: string;
  /** Por qué no se puede guardar, o `null` si se puede. */
  sinGuardado: string | null;
  /**
   * La versión en disco del catálogo que leyó esta página (`versionDelCatalogo`), que
   * «Guardar» devuelve: el servidor rechaza el guardado si otra pestaña escribió
   * entre medias. Tras guardar, la que dejó escrita esta.
   */
  versionLeida: unknown;
  /**
   * Lo que no se ha guardado, por id: unidades y piezas. Cerrar la página avisa, y
   * la vista de equipo lo cuenta (`sinGuardarEnPalabras`).
   */
  readonly unidadesSinGuardar: Set<string>;
}

/**
 * La pelea que se monta y su enlace: los puestos y el héroe de cada lado, quién mueve cada bando,
 * la complejidad, la semilla y el clima que pide la URL (con lo que no vale de ella) y el último
 * enlace copiado. Eran diez `let` y `const` de módulo hasta R8 de la reorganización (07-11-2026).
 */
export interface EstadoDelMontaje {
  /** Los puestos de cada lado, en su orden. */
  readonly puestos: Record<Lado, Puesto[]>;
  /** El héroe de cada lado, si lleva. */
  readonly heroes: Record<Lado, HeroeDeArena | null>;
  /**
   * Quién mueve cada bando, entero: sus unidades y su héroe. Por defecto la
   * izquierda la persona y la derecha la IA; se cambia con Yo / IA en su cabecera.
   */
  readonly iaDelBando: Record<Lado, boolean>;
  siguienteClave: number;
  /**
   * La complejidad de la pelea que se monta (22-10-2026): el tope por bando y la
   * rueda, con sus dos selectores encima del montaje (`selectoresDelCombate`). Viaja
   * en el enlace (versión 14).
   */
  combate: ReglasDelCombate;
  /**
   * La semilla que pide la URL, o `null` para sortear una en cada pelea. La regla
   * es la de la partida (`parseSeed`): lo que no es una semilla se dice.
   */
  semillaPedida: number | null;
  /** Lo que dice la barra al abrir de lo que no vale en la URL (semilla, clima, retirados). */
  avisoDeSemilla: string;
  /**
   * Los parámetros de la URL que no valen (`seed` mal, o uno de los retirados:
   * `reglas`, `golpe`, `contacto`): un enlace de la pelea con alguno no se monta, y
   * lo dice nombrándolos (C1 de QA de #259).
   */
  readonly parametrosQueNoValen: string[];
  /**
   * El clima de las peleas (`?clima=`, como en la partida): la arena no tiene
   * días ni regiones, así que es el despejado salvo que se pida otro, y una región
   * se rechaza diciéndolo. Es presentación: un clima que no vale se dice y la
   * pelea se monta igual, con el despejado.
   */
  climaDeLaArena: ClimaDelSitio;
  /**
   * El enlace de la pelea que se copió por última vez (`?montaje=`, H6 de QA del
   * banco), para enseñarlo en su campo mientras siga siendo el del montaje: si
   * algo cambia después, ya no lo es y se deja de enseñar.
   */
  enlaceCopiado: string | null;
}

/** Una figura animada de lo que se ve (`recogerFiguras`): una miniatura o el retrato de una ficha. */
interface FiguraDeFicha {
  lienzo: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  id: string;
  /** La ficha de la que es retrato (`claveDeFicha`), con su clip y su giro; `null` en una miniatura. */
  clave: string | null;
  /** El bando de la miniatura, que le da el color; `null` en la ficha. */
  lado: Lado | null;
  /** Las tres letras de su marcador sin arte, de `nombreDeFigura`. */
  rotulo: string;
}

/**
 * Lo que se ve: la escena y de dónde se vino, la lista (su filtro, plegada o no), la ficha
 * elegida y las abiertas, la pieza elegida, lo que dice la barra mientras se monta, lo que queda
 * por repintar y las figuras animadas de lo que se ve. Eran quince `let` y `const` de módulo
 * hasta R8 de la reorganización (07-11-2026).
 */
export interface EstadoDeLaVista {
  /** La pieza de la ficha de la vista de equipo, por su id. */
  piezaElegida: string | null;
  filtro: FiltroDeArena;
  /**
   * La ficha que enseñan el montaje y el editor de la batalla. Solo dice cuál se
   * pinta allí: un gesto DENTRO de una ficha escribe en la ficha que lo contiene
   * (`fichaDelElemento`), nunca en esta, que con varias abiertas en la edición
   * sería otra.
   */
  elegida: Elegida | null;
  /** La figura del retrato de cada ficha (`AnimDeFicha`), por `claveDeFicha`. */
  readonly animDeFicha: Map<string, AnimDeFicha>;
  /**
   * Las fichas abiertas en la vista de edición, en su orden. Siguen al ir y volver
   * del montaje (estado del módulo) y, de comodidad, en `localStorage`.
   */
  abiertas: readonly FichaEditable[];
  /**
   * Si la lista de la edición va plegada a su cabecera (`listaPlegadaTras`): solo
   * la cambia su botón. Se recuerda en `localStorage` (`CLAVE_DE_LISTA`).
   */
  listaPlegada: boolean;
  /**
   * Las fichas cuyo título es ahora el campo del nombre (por su clave): tras «✎
   * Editar», hasta que el campo pierde el foco (Intro lo guarda, Escape no).
   */
  readonly renombrando: Set<string>;
  /** La escena que se ve (`Escena`): solo la cambia `irA`. */
  escena: Escena;
  /**
   * Adónde vuelve «Volver» de la vista de equipo: de donde se entró. Desde la pelea
   * la sesión sigue viva, y la IA no juega mientras tanto: solo juega tras una
   * jugada de la persona (`SesionDeBatalla.seguirLaIA`), y aquí no se juega ninguna.
   */
  escenaDeVuelta: Exclude<Escena, 'equipo' | 'magia'>;
  /** La barra mientras se monta; en la batalla manda la de la sesión. */
  aviso: string;
  /** Los lienzos de las miniaturas, recogidos al repintar: son los mismos hasta el siguiente. */
  figuras: FiguraDeFicha[];
  /**
   * Lo último que se pintó en cada miniatura: se repinta solo si cambia su
   * fotograma, su clip, su dirección o su hoja. Un reposo a 8 fps repintaba cada
   * miniatura sesenta veces por segundo para enseñar ocho fotogramas distintos.
   * Un lienzo nuevo —el montaje se rehace entero— no tiene entrada y se pinta.
   */
  readonly pintado: WeakMap<HTMLCanvasElement, string>;
  /**
   * Qué lienzos de figura se ven ahora. Lo escribe un `IntersectionObserver`, que
   * avisa al entrar o salir uno de la pantalla (o de su región desplazable); sin
   * él —un navegador sin la API— se pintan todos, como antes.
   */
  readonly enPantalla: Set<Element>;
  /** El último aviso de un cambio rechazado (`noSeCambia`). */
  rechazado: string | null;
  /**
   * Lo que queda por repintar: todo, unas fichas (por clave) o nada. Un gesto lo
   * pide y se repinta en la tarea siguiente, una vez por muchos que lleguen:
   * un cambio llega al salir del campo, ANTES de que el tabulador pase al
   * siguiente, y repintar en ese momento destruía el campo de destino y el foco
   * caía al `body`. En la tarea siguiente el foco ya está en él, y `pintar` lo
   * conserva.
   */
  pendiente: 'todo' | Set<string> | null;
}

/**
 * La figura del retrato de cada ficha, por `claveDeFicha`: el clip, cuándo se
 * eligió (los que no van en bucle se repiten desde ahí) y hacia dónde mira, como
 * posición en `DIRECCION_DE_HOJA` («Girar» la pasa por las ocho en el orden de
 * las hojas). Por ficha y no una para todas: con cuatro abiertas, girar una no
 * gira las otras; y la misma ficha posa igual en el montaje y en la edición.
 */
export interface AnimDeFicha {
  readonly clip: CharacterClip;
  readonly inicio: number;
  readonly mira: number;
}

/**
 * Lo que se ve: el montaje, la vista de edición, la de equipo o la pelea. Se
 * cambia solo con `irA`.
 */
export type Escena = 'montaje' | 'edicion' | 'equipo' | 'magia' | 'battle';

/**
 * La pelea: su sesión, mientras la hay, y lo que la página recuerda de ella entre fotogramas (los
 * paneles pintados, si toca colocar el marco) y si el editor de la batalla se abrió desde la
 * rueda. Eran cuatro `let` de módulo hasta R8 de la reorganización (07-11-2026).
 */
export interface EstadoDeLaPelea {
  /** La pelea de «Luchar», hasta «Otra vez»; `null` en el montaje. */
  sesion: SesionDeArena | null;
  /**
   * Si el editor enseña una ficha abierta desde la rueda del golpe. Con la rueda
   * abierta no se cambia nada —la sesión tampoco lo deja, `retocar`—: la ficha es
   * de solo lectura, y al cerrarla se vuelve a la rueda en la misma fase, sin
   * cancelar la elección (#261).
   */
  fichaDeLaRueda: boolean;
  /**
   * Con muralla, el lienzo se alarga lo que piden lo alto de sus columnas y quien
   * está encima (`altoDelLienzo`) y el marco se desplaza en vertical: el tablero
   * baja en vez de encogerse (el usuario: «si se sale de la pantalla podemos mover
   * la zona de casillas más abajo y agrandar la pantalla»). Al alargarse, el marco
   * se coloca con el final del tablero abajo (`pieDelTablero`), tras el primer
   * fotograma con el tamaño nuevo: con el marco abajo del todo, la cabeza de quien
   * está en una columna de la fila de atrás quedaba fuera de la vista, y arriba
   * del todo, la última fila. Sin muralla, el lienzo es el marco.
   */
  colocarElMarco: boolean;
  /** Con qué versión de la sesión, y contando o no, se pintaron el panel y la barra de arriba. */
  paneles: { version: string; ocupada: boolean } | null;
}

/**
 * El editor de la muralla: la que se dibuja, con qué herramienta, el nombre con que se guardaría,
 * las formas guardadas y si se pueden guardar, y si va plegado (lo recordado en este navegador,
 * que se lee aquí, al cargar). Eran seis `let` de módulo hasta R8 de la reorganización
 * (07-11-2026).
 */
export interface EstadoDelEditorDeMuralla {
  /**
   * La muralla que se dibuja y con la que se pelea. Se rehace entera en cada clic
   * (`validarMuralla`, la regla del núcleo), así que nunca hay una a medias.
   */
  muralla: MurallaDeBatalla;
  herramienta: HerramientaDeMuralla;
  /** El nombre con el que se guardaría: el de la forma cargada o el escrito. */
  nombreDeForma: string;
  /** Las formas del borrador (`data/borradores/murallas.json`), en su orden. */
  formasGuardadas: readonly FormaDeMuralla[];
  /** Por qué no se pueden guardar ni borrar formas, o `null` si se puede. */
  murallasSinGuardado: string | null;
  /** Si va plegado (`CLAVE_DE_PLEGADO`). */
  murallaPlegada: boolean;
}

/**
 * La página de la arena, entera: lo que `main.ts` monta al cargarla —los elementos, el bucle de
 * dibujo, los cinco estados, el editor de magia, la URL leída, la escena de la batalla con sus
 * gestos, el lienzo y la rueda del golpe— y lo que cambia mientras vive. Las piezas de `arena/` la
 * reciben, o el estado que leen, y ninguna registra nada ni hace nada al importarse: `main.ts` las
 * instala en el orden de siempre, que es comportamiento (dos oyentes del mismo evento en el mismo
 * nodo corren en el orden en que se registraron).
 */
export interface PaginaDeLaArena extends ElementosDeLaArena {
  /** Pide un fotograma (el bucle de dibujo de `main.ts`, `comun/bucle.ts`). */
  readonly pedirFotograma: () => void;
  readonly catalogo: EstadoDelCatalogo;
  readonly montaje: EstadoDelMontaje;
  readonly vista: EstadoDeLaVista;
  readonly pelea: EstadoDeLaPelea;
  readonly editorDeMuralla: EstadoDelEditorDeMuralla;
  /** El editor de magia (`magia.ts`), montado en `elMagia`. */
  readonly editorDeMagia: ReturnType<typeof montarEditorDeMagia>;
  /** La URL con que se abrió la página, leída una vez: `?seed=`, `?clima=`, `?montaje=`, `?vista=`… */
  readonly parametros: URLSearchParams;
  /** Quién dice qué lienzos de figura se ven (`vista.enPantalla`); `null` sin la API. */
  readonly vigiaDeFiguras: IntersectionObserver | null;
  /**
   * Lo que dicen el título y el botón del editor: los de `index.html` al cambiar
   * cifras, y los de mirar una ficha desde la rueda.
   */
  readonly textosDelEditor: { readonly titulo: string | null; readonly cerrar: string | null };
  /** El tablero de la pelea, el mismo de la partida (`batalla/escena.ts`). */
  readonly batalla: EscenaBatalla;
  /** Los gestos de la batalla, los de la partida (`batalla/gestos.ts`). */
  readonly gestos: GestosDeBatalla;
  /** El lienzo a la medida de su caja (`ajustarLienzo`). */
  readonly principal: ReturnType<typeof ajustarLienzo>;
  /** La rueda del golpe, la misma de la partida (`batalla/rueda/dialogo.ts`). */
  readonly rueda: DialogoDeLaRueda;
}
