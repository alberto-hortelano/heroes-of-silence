/**
 * La arena (`/arena/`, `pnpm arena`): se montan dos bandos con las hojas de las
 * cinco facciones, se cambian sus cifras, se elige quién mueve cada unidad y se
 * pelea con el mismo tablero y los mismos controles que la partida.
 *
 * Aquí solo se conecta: las reglas las aplica `SesionDeArena` (en `session.ts`,
 * la única puerta del cliente al núcleo), el ratón del tablero lo traduce
 * `EscenaBatalla` —la misma de la partida— y el marcado sale de `paneles.ts`.
 * Las cifras se guardan como borrador en el repo a través del servidor de
 * desarrollo (`vite.config.ts`); sin él la página lo dice y sigue sirviendo para
 * pelear.
 */

import {
  avisoDeLaCopia,
  CON_PIEZAS,
  cambioDePiezaBlocker,
  catalogoDeLaArena,
  conPieza,
  despliegueDeArenaBlocker,
  enElHueco,
  equiparEnArena,
  escaleraDeArenaBlocker,
  type FuenteDeArena,
  type HeroeDeArena,
  type HojaDeArena,
  heroePorDefecto,
  IA_POR_DEFECTO,
  LADOS,
  type Lado,
  type MontajeDeArena,
  type MontajeDelEnlace,
  mismaPieza,
  montajeALaURL,
  montajeDeLaURL,
  type PuestoDelEnlace,
  perfilDeLasHojas,
  piezaNueva,
  piezasDelEnlace,
  piezasDelMontaje,
  piezasQueSeGuardan,
  quitarEnArena,
  type RetoqueDeArena,
  type SelloDePieza,
  selloDePieza,
  tipoDelStack,
  type UnidadDeArena,
  unaVezEnLaURL,
  unidadNueva,
  unidadPorDefecto,
  validarHeroeDeArena,
  validarHojasDeArena,
  validarPiezaDeArena,
  validarUnidadDeArena,
} from '@core/arena.js';
import {
  esFormaDeEjemplo,
  FORMAS_DE_EJEMPLO,
  type FormaDeMuralla,
  validarFormaDeMuralla,
} from '@core/arena-murallas.js';
import { hexEquals, isInside } from '@core/battle/board.js';
import {
  conModo,
  INTERRUPTORES,
  MODOS_DE_LA_ARENA,
  type ModosConInterruptor,
  modoALaURL,
  modoDeLaURL,
} from '@core/battle/modos.js';
import {
  esMuro,
  hayMuralla,
  type MurallaDeBatalla,
  mismaPuerta,
  type PuertaDeMuralla,
  SIN_MURALLA,
  validarMuralla,
} from '@core/battle/muralla.js';
import type { PoderId } from '@core/battle/poderes.js';
import {
  conRegla,
  REGLAS_DEL_JUEGO,
  type ReglasDeBatalla,
  reglasALaURL,
  reglasDeLaURL,
} from '@core/battle/reglas.js';
import { contraataqueDelCruce, type HechoDelCruce } from '@core/battle/rueda.js';
import { allSpells } from '@core/battle/spells.js';
import type { BattleAction, BattleStack, TipoDeEscala, TipoDePuerta } from '@core/battle/types.js';
import { LIDERAZGO, type Pieza } from '@core/data.js';
import { type EquipoAtado, idsPuestos } from '@core/hero/equipo.js';
import { parseSeed } from '@core/rng.js';
import {
  type CreatureTrait,
  esHuecoDeArena,
  type Hex,
  type HuecoDeArena,
  RESOURCE_KINDS,
} from '@core/types.js';
import { FIGURA } from '../../shared/arte.js';
import type { Direccion } from '../direccion.js';
import { EscenaBatalla } from '../escenas/batalla.js';
import { type Html, html, NADA, pintar, unir } from '../html.js';
import { cargarArte } from '../render/assets.js';
import { COLOR_BANDO } from '../render/batalla.js';
import type { CharacterClip } from '../render/character.js';
import {
  claveDelDibujo,
  colocarFigura,
  type Figura,
  hayFigurasAnimadas,
  pintarFigura,
  pintarSombraDeFigura,
} from '../render/figura.js';
import { ajustarLienzo } from '../render/lienzo.js';
import { COLOR_NEUTRO } from '../render/palette.js';
import {
  arteDe,
  DIRECCION_DE_HOJA,
  hojaDe,
  INDICE_DE_HOJA,
  MIRADA_DE_PRESENTACION,
  registrarUnidad,
} from '../render/personajes.js';
import { semillaSorteada } from '../semilla.js';
import { type LadoDeSesion, type RuedaPendiente, SesionDeArena } from '../session.js';
import { pintarSiguiendoElFinal } from '../views/al-final.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import {
  abiertasATexto,
  abrirFicha,
  cerrarFicha,
  claveDeFicha,
  type FichaAbierta,
  type FichaEditable,
  type FocoTrasCerrar,
  fichaDeClave,
  focoTrasCerrar,
  interiorDeFichaAbierta,
  leerAbiertas,
  listaPlegadaTras,
  renderEdicion,
} from './edicion.js';
import {
  type AvisosDeLectura,
  avisoDelBorradorLeido,
  avisoDeNuevaUnidad,
  type ComoDeLaFicha,
  cuantosAvisos,
  type DatosDePuesto,
  type Elegida,
  enElMontaje,
  FIGURA_GENERICA,
  type FiltroDeArena,
  focoTrasQuitar,
  type Guardado,
  guardadoEnPalabras,
  type HerramientaDeMuralla,
  type ListaDeUnidades,
  modoDeSiempre,
  type Puesto,
  ROTULO_DE_LOS_AVISOS,
  renderAvisosDeLectura,
  renderBando,
  renderCatalogo,
  renderEnlace,
  renderEquipo,
  renderFicha,
  renderFichaDeHeroe,
  renderModo,
  renderMuralla,
  renderPanelDeBatalla,
  renderReglas,
  resumenDeCifras,
  resumenDeLaLectura,
  rotuloDelTurno,
  sinGuardarEnPalabras,
  type TarjetaDeUnidad,
} from './paneles.js';
import {
  ajustarLaRueda,
  renderDesenlace,
  renderEleccion,
  tipoDeLaTecla,
  tramosDelDesenlace,
} from './rueda.js';

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
const elMontaje = document.getElementById('montaje') as HTMLElement;
/** Los avisos de lo que se lee convertido, enteros, desplegados desde la barra (`renderAvisosDeLectura`). */
const elAvisosDeLectura = document.getElementById('avisos-de-lectura') as HTMLElement;
/** El botón de la barra que los despliega. */
const botonVerAvisos = document.getElementById('ver-avisos') as HTMLElement;
/** La vista de edición: hasta cuatro fichas abiertas a la vez (`edicion.ts`). */
const elEdicion = document.getElementById('edicion') as HTMLElement;
/** La vista «Editar equipo»: las piezas por hueco y la ficha de la elegida. */
const elEquipo = document.getElementById('equipo') as HTMLElement;
/** El «Volver» de la vista de equipo: dice adónde vuelve (`escenaDeVuelta`). */
const botonVolverDeEquipo = document.querySelector(
  '[data-arena="volver-de-equipo"]',
) as HTMLElement;
const botonLuchar = document.querySelector('[data-arena="luchar"]') as HTMLElement;
/** El editor de la batalla: la ficha de lo elegido, que cambia todo su tipo ya en la pelea. */
const editor = document.getElementById('editor-en-combate') as HTMLDialogElement;
/** La rueda del golpe (`rueda.ts`): modal sobre el lienzo, mientras se elige y se cuenta un cruce. */
const elRueda = document.getElementById('rueda') as HTMLDialogElement;
const elFichaDelEditor = document.getElementById('ficha-del-editor') as HTMLElement;
const elAvisoDelEditor = document.getElementById('aviso-del-editor') as HTMLElement;
const elTituloDelEditor = document.getElementById('titulo-del-editor') as HTMLElement;
const botonCerrarEditor = editor.querySelector('[data-arena="cerrar-editor"]') as HTMLElement;
const elBando: Record<Lado, HTMLElement> = {
  izquierda: document.getElementById('bando-izquierda') as HTMLElement,
  derecha: document.getElementById('bando-derecha') as HTMLElement,
};

// ---------------------------------------------------------------- estado

let hojas: readonly HojaDeArena[] = [];
/** Las mismas, por su id: se hace al cargarlas y lo leen todas las preguntas por una hoja. */
let hojasPorId: ReadonlyMap<string, HojaDeArena> = new Map();
/**
 * Las cifras por TIPO de unidad, por su id: cambiar el monje cambia todos los
 * monjes. Las de las hojas (id = la hoja) y las nuevas (`unidadNueva`). Lleva
 * también las del borrador cuya hoja no está —no se pueden montar—, para que
 * «Guardar» no las tire (H2 de QA).
 */
const borrador = new Map<string, UnidadDeArena>();
/**
 * Los ids de las unidades del borrador que no validan: se conservan al guardar y
 * una unidad nueva no los toma (`IdsOcupados`, H1 de QA del ciclo 2).
 */
let idsSinValidar: readonly string[] = [];
/**
 * Las piezas de la arena (vista «Editar equipo»): las del borrador de equipo que
 * cambian una del juego o son nuevas. Con ellas encima de las del juego se pelea
 * (`catalogo`); el juego no las ve.
 */
let piezasDelBorrador: readonly Pieza[] = [];
/**
 * Lo que traen los enlaces de la versión 6 abiertos, para lo que lleva lo que
 * montan (`piezasDelEnlace`): va encima del borrador sin tocarlo (`piezasEnUso`).
 * Cambiar una pieza la saca de aquí. «Guardar» escribe de aquí solo las nuevas
 * (`piezasQueSeGuardan`): una pieza tuya nunca la sustituye ni la borra un enlace.
 */
let capaDelEnlace: readonly Pieza[] = [];
/**
 * Las piezas de la arena tal como están en disco: con ellas se cuenta lo que
 * queda por guardar (`piezasSinGuardar`), pieza a pieza distinta, no por gestos.
 */
let piezasGuardadas: readonly Pieza[] = [];
/** Los ids de las piezas del borrador que no validan: se conservan y una nueva no los toma. */
let idsDePiezasSinValidar: readonly string[] = [];
/** La pieza de la ficha de la vista de equipo, por su id. */
let piezaElegida: string | null = null;

/** Las piezas de la arena con que se pelea ahora: el borrador con la capa del enlace encima. */
function piezasEnUso(
  delBorrador: readonly Pieza[] = piezasDelBorrador,
  capa: readonly Pieza[] = capaDelEnlace,
): readonly Pieza[] {
  return capa.reduce(conPieza, delBorrador);
}

/**
 * Las piezas que escribiría «Guardar» ahora: las del borrador más las nuevas de la
 * capa del enlace. Es lo que enseña y edita la vista «Editar equipo»: tu pieza,
 * aunque en esta pelea vaya la del enlace.
 */
function piezasAGuardar(): readonly Pieza[] {
  return piezasQueSeGuardan(piezasDelBorrador, capaDelEnlace);
}

/** Las piezas de la vista «Editar equipo» (`piezasAGuardar`) sobre las del juego. */
function catalogoAGuardar(): EquipoAtado {
  return catalogoDeLaArena(piezasAGuardar());
}

/** Los ids de las piezas que «Guardar» cambiaría en disco: lo que de verdad queda sin guardar. */
function piezasSinGuardar(): readonly string[] {
  return idsQueCambian(piezasGuardadas, piezasAGuardar());
}

/**
 * Las piezas con que pelea ahora la arena que no son las que escribiría
 * «Guardar»: las del enlace que se quedan solo en esta pelea, por sus nombres.
 */
function soloEnLaPelea(): readonly Pieza[] {
  const enUso = catalogo();
  return idsQueCambian(piezasAGuardar(), piezasEnUso()).map((id) => enUso.pieza(id));
}

let catalogoHecho: {
  readonly de: readonly Pieza[];
  readonly capa: readonly Pieza[];
  readonly eq: EquipoAtado;
} | null = null;
/**
 * Las piezas con que pelea la arena (`catalogoDeLaArena` de `piezasEnUso`), hecho
 * una vez por cada borrador y cada capa: lo piden cada tarjeta y cada ficha al
 * pintarse.
 */
function catalogo(): EquipoAtado {
  if (catalogoHecho?.de !== piezasDelBorrador || catalogoHecho.capa !== capaDelEnlace) {
    catalogoHecho = {
      de: piezasDelBorrador,
      capa: capaDelEnlace,
      eq: catalogoDeLaArena(piezasEnUso()),
    };
  }
  return catalogoHecho.eq;
}
const montaje: Record<Lado, Puesto[]> = { izquierda: [], derecha: [] };
/** El héroe de cada lado, si lleva. */
const heroes: Record<Lado, HeroeDeArena | null> = { izquierda: null, derecha: null };
/**
 * Quién mueve cada bando, entero: sus unidades y su héroe. Por defecto la
 * izquierda la persona y la derecha la IA; se cambia con Yo / IA en su cabecera.
 */
const iaDelBando: Record<Lado, boolean> = { ...IA_POR_DEFECTO };
let filtro: FiltroDeArena = 'todas';
/**
 * La ficha que enseñan el montaje y el editor de la batalla. Solo dice cuál se
 * pinta allí: un gesto DENTRO de una ficha escribe en la ficha que lo contiene
 * (`fichaDelElemento`), nunca en esta, que con varias abiertas en la edición
 * sería otra.
 */
let elegida: Elegida | null = null;
/** Lo que se queda quieto el último fotograma antes de repetir un clip que no va en bucle. */
const PAUSA_DE_LA_FICHA_MS = 700;
/**
 * La figura del retrato de cada ficha, por `claveDeFicha`: el clip, cuándo se
 * eligió (los que no van en bucle se repiten desde ahí) y hacia dónde mira, como
 * posición en `DIRECCION_DE_HOJA` («Girar» la pasa por las ocho en el orden de
 * las hojas). Por ficha y no una para todas: con cuatro abiertas, girar una no
 * gira las otras; y la misma ficha posa igual en el montaje y en la edición.
 */
interface AnimDeFicha {
  readonly clip: CharacterClip;
  readonly inicio: number;
  readonly mira: number;
}
const animDeFicha = new Map<string, AnimDeFicha>();
const ANIM_DE_PARTIDA: AnimDeFicha = {
  clip: 'idle',
  inicio: 0,
  mira: INDICE_DE_HOJA[MIRADA_DE_PRESENTACION],
};
function animDe(clave: string): AnimDeFicha {
  return animDeFicha.get(clave) ?? ANIM_DE_PARTIDA;
}
/**
 * Las fichas abiertas en la vista de edición, en su orden. Siguen al ir y volver
 * del montaje (estado del módulo) y, de comodidad, en `localStorage`.
 */
let abiertas: readonly FichaEditable[] = [];
/**
 * Si la lista de la edición va plegada a su cabecera (`listaPlegadaTras`): solo
 * la cambia su botón. Se recuerda en `localStorage` (`CLAVE_DE_LISTA`).
 */
let listaPlegada = false;
/**
 * Las fichas cuyo título es ahora el campo del nombre (por su clave): tras «✎
 * Editar», hasta que el campo pierde el foco (Intro lo guarda, Escape no).
 */
const renombrando = new Set<string>();

/**
 * Lo que se ve: el montaje, la vista de edición, la de equipo o la pelea. Se
 * cambia solo con `irA`.
 */
type Escena = 'montaje' | 'edicion' | 'equipo' | 'battle';
const ROTULO_DE_ESCENA: Readonly<Record<Escena, string>> = {
  montaje: 'Montaje',
  edicion: 'Edición',
  equipo: 'Equipo',
  battle: 'Batalla',
};
let escena: Escena = 'montaje';
/**
 * Adónde vuelve «Volver» de la vista de equipo: de donde se entró. Desde la pelea
 * la sesión sigue viva, y la IA no juega mientras tanto: solo juega tras una
 * jugada de la persona (`SesionDeArena.avanzarIA`), y aquí no se juega ninguna.
 */
let escenaDeVuelta: Exclude<Escena, 'equipo'> = 'montaje';
const VUELTA_DE_EQUIPO: Readonly<Record<Exclude<Escena, 'equipo'>, string>> = {
  montaje: 'Volver al montaje',
  edicion: 'Volver a la edición',
  battle: 'Volver a la pelea',
};

/** Cambia de escena: la variable, el `data-escena` que lee el CSS y el rótulo de la barra. */
function irA(e: Escena): void {
  if (e === 'equipo' && escena !== 'equipo') escenaDeVuelta = escena;
  escena = e;
  app.dataset.escena = e;
  elDay.textContent = ROTULO_DE_ESCENA[e];
  elTurn.textContent = '';
  botonVolverDeEquipo.textContent = VUELTA_DE_EQUIPO[escenaDeVuelta];
}
let siguienteClave = 1;
let sesion: SesionDeArena | null = null;
/** La barra mientras se monta; en la batalla manda la de la sesión. */
let aviso = 'Cargando las hojas…';
/**
 * Las unidades con el arte a medias, dichas en la barra mientras se monta: el
 * aviso que antes era la excepción que tumbaba la lista (#140).
 */
let avisoDeIncompletas = '';
/** Por qué no se puede guardar, o `null` si se puede. */
let sinGuardado: string | null = null;
/**
 * Si al arrancar no había borrador de unidades: dónde iría y lo que dijo la
 * barra. Con un enlace montado, «las unidades salen con cifras por defecto»
 * contradecía al enlace (M6 de QA): se dice otra cosa.
 */
let sinBorradorDeUnidades: { readonly ruta: string; readonly dicho: string } | null = null;
/**
 * Lo que se dijo al leer el borrador y el enlace, entero y con lo que se retira
 * primero (`pintarAvisosDeLectura`). La barra lleva el resumen.
 */
let avisosDeLectura: readonly AvisosDeLectura[] = [];
/** Si el recuadro de los avisos está desplegado: solo al arrancar, y luego con su botón. */
let avisosDesplegados = false;
/**
 * Lo que no se ha guardado, por id: unidades y piezas. Cerrar la página avisa, y
 * la vista de equipo lo cuenta (`sinGuardarEnPalabras`).
 */
const unidadesSinGuardar = new Set<string>();
const caben = LIDERAZGO.maxPorBando;

/**
 * La muralla que se dibuja y con la que se pelea. Se rehace entera en cada clic
 * (`validarMuralla`, la regla del núcleo), así que nunca hay una a medias.
 */
let muralla: MurallaDeBatalla = SIN_MURALLA;
let herramienta: HerramientaDeMuralla = 'muro';
/** El nombre con el que se guardaría: el de la forma cargada o el escrito. */
let nombreDeForma = '';
/** Las formas del borrador (`data/borradores/murallas.json`), en su orden. */
let formasGuardadas: readonly FormaDeMuralla[] = [];
/** Por qué no se pueden guardar ni borrar formas, o `null` si se puede. */
let murallasSinGuardado: string | null = null;

/**
 * Lo recordado en este navegador: comodidades de quien mira, no datos. Sin
 * `localStorage` —ventana privada, datos bloqueados— se lee `null` y se avisa en
 * consola, y lo que se cambie dura lo que la página.
 */
function leerDelNavegador(clave: string, que: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch (err) {
    console.warn(`[arena] no se puede leer ${que}:`, err);
    return null;
  }
}

function guardarEnElNavegador(clave: string, valor: string, que: string): void {
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
const CLAVE_DE_PLEGADO = 'arena.muralla.plegada';
const QUE_PLEGADO = 'si la muralla va plegada';
let murallaPlegada = leerDelNavegador(CLAVE_DE_PLEGADO, QUE_PLEGADO) === '1';

/** Las fichas abiertas de la edición, en su orden. */
const CLAVE_DE_ABIERTAS = 'arena.fichas-abiertas';
const QUE_ABIERTAS = 'las fichas abiertas';

function recordarAbiertas(): void {
  guardarEnElNavegador(CLAVE_DE_ABIERTAS, abiertasATexto(abiertas), QUE_ABIERTAS);
}

/** Si la lista de la edición va plegada: lo único que la cambia es su botón. */
const CLAVE_DE_LISTA = 'arena.edicion.lista-plegada';
const QUE_LISTA = 'si la lista de la edición va plegada';

/**
 * La semilla que pide la URL, o `null` para sortear una en cada pelea. La regla
 * es la de la partida (`parseSeed`): lo que no es una semilla se dice.
 */
const parametros = new URLSearchParams(location.search);
let semillaPedida: number | null = null;
let avisoDeSemilla = '';
/**
 * Los parámetros de la URL que no valen (`seed`, `reglas`, `golpe`, `contacto`):
 * un enlace de la pelea con alguno mal no se monta, y lo dice nombrándolos (C1
 * de QA de #259: culpaba «a la semilla o las reglas» de un `?contacto=` mal).
 */
const parametrosQueNoValen: string[] = [];
try {
  semillaPedida = parseSeed(unaVezEnLaURL(parametros.getAll('seed'), 'seed'));
} catch (err) {
  avisoDeSemilla = `${mensaje(err)} — quita "?seed=…" de la barra de direcciones para sortear la semilla. `;
  parametrosQueNoValen.push('seed');
}

/**
 * Las reglas de la pelea: las del juego, salvo que la URL encienda alguna de
 * fheroes2 (`?reglas=tirador,bendicion`). Van con la semilla en la URL, para que
 * una pelea se pueda repetir; lo que no es una regla se dice, como la semilla.
 */
let reglas: ReglasDeBatalla = REGLAS_DEL_JUEGO;
try {
  // Repetida (`reglas=tirador&reglas=bendicion`) se rechaza: quedarse con la
  // primera en silencio reproducía otra pelea (H4 de QA del banco).
  reglas = reglasDeLaURL(unaVezEnLaURL(parametros.getAll('reglas'), 'reglas'));
} catch (err) {
  avisoDeSemilla += `${mensaje(err)} — se pelea con las reglas del juego. `;
  parametrosQueNoValen.push('reglas');
}

/**
 * Los modos de la arena con interruptor (`battle/modos.ts`): cómo cae el golpe
 * cuerpo a cuerpo (al azar, salvo `?golpe=rueda`) y si salir del contacto cuesta
 * (libre, salvo `?contacto=paga`). Van con las reglas en la URL; lo que no es un
 * modo se dice, y se pelea con el de siempre.
 */
let modos: ModosConInterruptor = MODOS_DE_LA_ARENA;
for (const d of INTERRUPTORES) {
  try {
    modos = conModo(
      modos,
      d,
      modoDeLaURL(d, unaVezEnLaURL(parametros.getAll(d.parametro), d.parametro)),
    );
  } catch (err) {
    avisoDeSemilla += `${mensaje(err)} — ${modoDeSiempre(d)}. `;
    parametrosQueNoValen.push(d.parametro);
  }
}

/**
 * El enlace de la pelea que se copió por última vez (`?montaje=`, H6 de QA del
 * banco), para enseñarlo en su campo mientras siga siendo el del montaje: si
 * algo cambia después, ya no lo es y se deja de enseñar.
 */
let enlaceCopiado: string | null = null;

/**
 * Escribe en la barra la dirección de ahora con las reglas del montaje, para que
 * copiarla repita también las reglas; las comas de `?reglas=` van sin escapar, y
 * así se lee y se copia como se escribe (`?seed=7&reglas=tirador,bendicion`).
 * `cambiar` pone lo demás (la semilla).
 */
function reglasALaBarra(cambiar: (url: URL) => void = () => {}): void {
  const url = new URL(location.href);
  cambiar(url);
  const enURL = reglasALaURL(reglas);
  if (enURL === '') url.searchParams.delete('reglas');
  else url.searchParams.set('reglas', enURL);
  // Los modos, igual: el de siempre no se escribe.
  for (const d of INTERRUPTORES) {
    const enLaURL = modoALaURL(d, modos[d.clave]);
    if (enLaURL === '') url.searchParams.delete(d.parametro);
    else url.searchParams.set(d.parametro, enLaURL);
  }
  history.replaceState(null, '', `${url.pathname}${url.search.replace(/%2C/g, ',')}${url.hash}`);
}

/** De dónde sale un puesto al pelear: la unidad con sus cifras del borrador, y su escalera. */
function fuenteDeArena(p: Puesto): FuenteDeArena {
  return { unidad: unidadDe(p.unidad), escalera: p.escalera };
}

/** El montaje de ahora, como lo pelearía el núcleo: lo leen «Luchar» y el aviso de la muralla. */
function montajeDeArena(): MontajeDeArena {
  const lado = (l: Lado) => ({
    unidades: montaje[l].map(fuenteDeArena),
    heroe: heroes[l],
  });
  return {
    izquierda: lado('izquierda'),
    derecha: lado('derecha'),
    reglas,
    muralla,
    piezas: piezasEnUso(),
  };
}

/** Lo que la tarjeta de un puesto de `lado` enseña. */
function describir(p: Puesto, lado: Lado): DatosDePuesto {
  const u = unidadDe(p.unidad);
  return {
    nombre: u.name,
    resumen: resumenDeCifras(u, catalogo()),
    figura: u.cuerpo.hoja,
    noEscala: escaleraDeArenaBlocker(fuenteDeArena(p), lado, catalogo()),
  };
}

/** El nombre de quien se pinta en una miniatura: una hoja o el héroe genérico. */
function nombreDeFigura(id: string): string {
  if (id === FIGURA_GENERICA) return 'Héroe';
  return hojaPorId(id).nombre;
}

/** Las hojas de héroe completas, para elegir la figura del héroe. */
function hojasDeHeroe(): { id: string; nombre: string }[] {
  return hojas
    .filter((h) => h.heroe && h.incompleta === null)
    .map((h) => ({ id: h.id, nombre: h.nombre }));
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** La ficha que contiene el botón de un gesto de ficha: sin ella, el marcado está mal. */
function laFichaDe(el: Element, que: string): Elegida {
  const f = fichaDelElemento(el);
  if (f === null) throw new Error(`${que} no está dentro de ninguna ficha`);
  return f;
}

function hojaPorId(id: string): HojaDeArena {
  const h = hojasPorId.get(id);
  if (h === undefined) throw new Error(`no hay ninguna hoja «${id}» en assets/unidades/`);
  return h;
}

function unidadDe(id: string): UnidadDeArena {
  return borrador.get(id) ?? unidadPorDefecto(hojaPorId(id));
}

/**
 * Por qué la unidad `u` no se monta, o `null` si se monta: la hoja de su cuerpo
 * no está o está a medias en el taller (#140). Nunca se pinta con el Y Bot en su
 * lugar.
 */
function porQueNoSeMonta(u: UnidadDeArena): string | null {
  const hoja = u.cuerpo.hoja;
  const h = hojasPorId.get(hoja);
  if (h === undefined) return `su hoja «${hoja}» no está en assets/unidades/`;
  return h.incompleta;
}

/**
 * Lo que la lista enseña además de las hojas, en el montaje y en la edición: las
 * unidades nuevas del borrador (las que no son la de una hoja), con el retrato de
 * su hoja, y los cuerpos que ofrece «Nueva unidad» (las hojas con su arte entero).
 */
function listaDeUnidades(): ListaDeUnidades {
  const nuevas = [...borrador.values()]
    .filter((u) => !hojasPorId.has(u.id))
    .map(
      (u): TarjetaDeUnidad => ({
        id: u.id,
        nombre: u.name,
        faccion: u.faction,
        retrato: u.cuerpo.hoja,
        sello: 'nueva',
        incompleta: porQueNoSeMonta(u),
      }),
    );
  return {
    nuevas,
    cuerpos: hojas
      .filter((h) => h.incompleta === null)
      .map((h) => ({ id: h.id, nombre: h.nombre })),
  };
}

/**
 * Crea una unidad nueva con el cuerpo elegido (el id de su hoja), la mete en el
 * borrador y la deja elegida; en la edición, además, abre su ficha.
 */
function crearUnidad(valor: string): string | null {
  if (valor === '') {
    aviso = 'Elige primero un cuerpo para la unidad nueva.';
    return null;
  }
  const h = hojaPorId(valor);
  if (h.incompleta !== null) throw new Error(`${h.nombre} no se monta: ${h.incompleta}`);
  const u = unidadNueva(
    h,
    {
      validas: [...borrador.keys()],
      sinValidar: idsSinValidar,
      hojas: [...hojasPorId.keys()],
    },
    catalogo(),
  );
  borrador.set(u.id, u);
  unidadesSinGuardar.add(u.id);
  elegida = { kind: 'unidad', id: u.id };
  aviso = avisoDeNuevaUnidad(u, escena === 'edicion' ? 'edicion' : 'montaje', catalogo());
  return u.id;
}

// ---------------------------------------------------------------- arranque

/**
 * Lo que contesta el GET de un borrador (`/__arena/unidades`, `/__arena/murallas`):
 * en el build, solo `guardado: false`; si no, su ruta y su lista (`unidades` o
 * `formas`), las que no valen con su motivo, o el archivo ilegible.
 */
/** Lo de un borrador que no vale: su clave, si la trae, y por qué. */
interface SinValidar {
  readonly id?: string | null;
  readonly nombre?: string | null;
  readonly motivo: string;
}

interface RespuestaDeBorrador {
  readonly guardado: boolean;
  readonly ruta?: string;
  readonly unidades?: unknown;
  readonly formas?: unknown;
  readonly invalidas?: readonly SinValidar[];
  readonly ilegible?: string;
  /** Las piezas de la arena, que van con las unidades (`leerBorrador`). */
  readonly piezas?: unknown;
  readonly piezasInvalidas?: readonly SinValidar[];
  /** El archivo de piezas no se puede leer: las unidades se leen con las del juego. */
  readonly equipoIlegible?: string;
  /** Las unidades que se retiran al leerlas (su cuerpo era una criatura): «Guardar» las pierde. */
  readonly seRetiran?: readonly string[];
  /** Lo demás que hubo que decir al convertir lo de antes (`migrarUnidadDeArena`, `piezaDeAntes`). */
  readonly avisos?: readonly string[];
}

/**
 * Pide un borrador al servidor de desarrollo. Devuelve la respuesta y, si no se
 * podrá guardar —sin servidor o con el archivo ilegible—, por qué. Los dos
 * borradores lo dicen con las mismas frases.
 */
async function leerDelServidor(
  url: string,
  que: string,
): Promise<{ readonly cuerpo: RespuestaDeBorrador; readonly sinGuardado: string | null }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se ha podido leer ${que} (${r.status})`);
  const cuerpo = (await r.json()) as RespuestaDeBorrador;
  const sinGuardado = !cuerpo.guardado
    ? 'esta página no la sirve el servidor de desarrollo. Ábrela con pnpm arena'
    : cuerpo.ilegible !== undefined
      ? `${cuerpo.ruta} no se puede leer (${cuerpo.ilegible}), y guardar lo pisaría. Arréglalo o bórralo a mano`
      : null;
  return { cuerpo, sinGuardado };
}

/** Lo que se dice si no sale: antes de mandar (`noSePuede`) o si el servidor lo rechaza (`noSeHa`). */
interface FalloAlGuardar {
  readonly noSePuede: string;
  readonly noSeHa: string;
}

/**
 * Manda un borrador entero al servidor. Devuelve su respuesta si lo ha escrito;
 * si no, deja dicho por qué en `aviso` y devuelve `null`.
 */
async function mandarAlServidor(
  url: string,
  cuerpo: unknown,
  sinGuardadoAhora: string | null,
  fallo: FalloAlGuardar,
): Promise<Record<string, unknown> | null> {
  if (sinGuardadoAhora !== null) {
    aviso = `${fallo.noSePuede}: ${sinGuardadoAhora}.`;
    return null;
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const respuesta = (await r.json()) as Record<string, unknown>;
  if (!r.ok) {
    aviso = `${fallo.noSeHa}: ${String(respuesta.error ?? r.status)}.`;
    return null;
  }
  return respuesta;
}

/**
 * Las hojas y, si hay servidor de desarrollo, el borrador guardado. Las hojas se
 * validan al recibirlas, que es por donde entran su perfil y su facción. Del
 * borrador se cargan las unidades que valen; las que no, se dicen con su motivo
 * —y el servidor las vuelve a escribir tal cual al guardar—.
 */
async function arrancar(): Promise<void> {
  const r = await fetch('/__arena/hojas');
  if (!r.ok) throw new Error(`no se ha podido leer la lista de hojas (${r.status})`);
  hojas = validarHojasDeArena(await r.json());
  hojasPorId = new Map(hojas.map((h) => [h.id, h]));
  // Una hoja incompleta no se registra: `arteDe` la pintaría con el Y Bot por
  // defecto, que es justo lo que no puede pasar en silencio (#140).
  for (const h of hojas) if (h.incompleta === null) registrarUnidad(h.id, h);
  const incompletas = hojas.filter((h) => h.incompleta !== null);
  if (incompletas.length > 0) {
    avisoDeIncompletas = ` A medias en el taller (se listan y no se montan): ${incompletas
      .map((h) => h.incompleta)
      .join('; ')}.`;
    console.warn(`[arena]${avisoDeIncompletas}`);
  }
  const leido = await leerDelServidor('/__arena/unidades', 'el borrador');
  const cuerpo = leido.cuerpo;
  sinGuardado = leido.sinGuardado;
  if (!cuerpo.guardado) {
    aviso =
      'Sin el servidor de desarrollo (pnpm arena) no se carga ni se guarda el borrador: las cifras que cambies aquí se pierden al cerrar.';
    return;
  }
  if (cuerpo.ilegible !== undefined) {
    aviso = `No se puede leer ${cuerpo.ruta}: ${cuerpo.ilegible}. Se empieza con las cifras por defecto, y no se guarda hasta que se arregle.`;
    return;
  }
  // Las piezas antes que las unidades: una unidad puede llevar una nueva.
  const avisoDeEquipo = cargarPiezas(cuerpo);
  // Llegan ya convertidas al formato de hoy (cuerpo y equipo): las de antes las
  // convierte el servidor al leerlas, con el perfil de su hoja.
  const unidades = Array.isArray(cuerpo.unidades) ? cuerpo.unidades : [];
  const sinHoja: string[] = [];
  for (const crudo of unidades) {
    const u = validarUnidadDeArena(crudo, catalogo());
    borrador.set(u.id, u);
    const motivo = porQueNoSeMonta(u);
    if (motivo !== null) sinHoja.push(`${u.id} (${motivo})`);
  }
  const invalidas = cuerpo.invalidas ?? [];
  aviso = avisoDelBorradorLeido(cuerpo.ruta ?? 'el borrador', borrador.size, invalidas.length);
  sinBorradorDeUnidades =
    borrador.size + invalidas.length === 0
      ? { ruta: cuerpo.ruta ?? 'el borrador', dicho: aviso }
      : null;
  // Las que no tienen hoja se quedan en el borrador y se vuelven a guardar; solo
  // no se pueden montar.
  if (sinHoja.length > 0) aviso += ` No se pueden montar: ${sinHoja.join(', ')}.`;
  const lectura: AvisosDeLectura = {
    de: `Del borrador (${cuerpo.ruta ?? 'el borrador'}), convertido al formato de hoy: se guarda así al pulsar «Guardar».`,
    seRetiran: cuerpo.seRetiran ?? [],
    avisos: cuerpo.avisos ?? [],
  };
  const resumen = resumenDeLaLectura(lectura);
  if (resumen !== '') {
    aviso += resumen;
    avisosDeLectura = [...avisosDeLectura, lectura];
    for (const id of borrador.keys()) unidadesSinGuardar.add(id);
  }
  idsSinValidar = invalidas.flatMap((i) => (typeof i.id === 'string' ? [i.id] : []));
  if (invalidas.length > 0) {
    aviso += ` No valen y se conservan tal cual al guardar: ${invalidas
      .map((i) => `${i.id ?? '(sin id)'} (${i.motivo})`)
      .join('; ')}.`;
  }
  aviso += avisoDeEquipo;
}

/**
 * Las piezas de la arena guardadas (`data/borradores/equipo.json`), que llegan
 * con las unidades. Devuelve lo que hay que añadir a la barra: cuántas, las que no
 * valen (se conservan al guardar) o el archivo ilegible.
 */
function cargarPiezas(cuerpo: RespuestaDeBorrador): string {
  if (cuerpo.equipoIlegible !== undefined) {
    return ` No se pueden leer las piezas de la arena: ${cuerpo.equipoIlegible}; las unidades se leen con las del juego, y no se guarda hasta que se arregle.`;
  }
  piezasDelBorrador = (Array.isArray(cuerpo.piezas) ? cuerpo.piezas : []).map(validarPiezaDeArena);
  piezasGuardadas = piezasDelBorrador;
  const invalidas = cuerpo.piezasInvalidas ?? [];
  idsDePiezasSinValidar = invalidas.flatMap((i) => (typeof i.id === 'string' ? [i.id] : []));
  const n = piezasDelBorrador.length;
  const cargadas =
    n === 0
      ? ''
      : ` Piezas de la arena: ${n} ${n === 1 ? 'cambiada o nueva' : 'cambiadas o nuevas'}.`;
  return invalidas.length === 0
    ? cargadas
    : `${cargadas} Piezas que no valen y se conservan tal cual al guardar: ${invalidas
        .map((i) => `${i.id ?? '(sin id)'} (${i.motivo})`)
        .join('; ')}.`;
}

/**
 * Las formas de muralla guardadas, si hay servidor de desarrollo. Devuelve lo
 * que hay que añadir a la barra: las que no valen o el archivo ilegible. Las
 * que no valen se conservan al guardar, como las unidades.
 */
async function arrancarMurallas(): Promise<string> {
  const { cuerpo, sinGuardado: porQue } = await leerDelServidor(
    '/__arena/murallas',
    'las formas de muralla',
  );
  murallasSinGuardado = porQue;
  if (!cuerpo.guardado) return '';
  if (cuerpo.ilegible !== undefined) return ` No se puede leer ${cuerpo.ruta}: ${cuerpo.ilegible}.`;
  formasGuardadas = (Array.isArray(cuerpo.formas) ? cuerpo.formas : []).map(validarFormaDeMuralla);
  const invalidas = cuerpo.invalidas ?? [];
  return invalidas.length === 0
    ? ''
    : ` Formas de muralla que no valen y se conservan tal cual: ${invalidas
        .map((i) => `${i.nombre ?? '(sin nombre)'} (${i.motivo})`)
        .join('; ')}.`;
}

// ---------------------------------------------------------------- muralla

/**
 * Un clic en la rejilla: pone la pieza de la herramienta, o la quita si ya
 * estaba. El muro va en la casilla, y quita las puertas que la tocaban. La
 * puerta va entre la casilla y su vecina del este (las dos que resalta el
 * puntero) y quita el muro de las dos, que son suelo. La goma quita el muro de
 * la casilla y las puertas que la tocan.
 */
function tocarHex(hex: Hex): void {
  // El clic despeja la barra, salvo lo que sigue siendo verdad: si no se puede
  // guardar, se dice hasta que se pueda (QA, M4: el primer clic lo borraba).
  aviso =
    murallasSinGuardado === null
      ? ''
      : `No se pueden guardar ni borrar formas: ${murallasSinGuardado}.`;
  const toca = (p: PuertaDeMuralla, h: Hex): boolean => hexEquals(p.a, h) || hexEquals(p.b, h);
  if (herramienta === 'puerta') {
    const este = { col: hex.col + 1, row: hex.row };
    if (!isInside(este)) {
      aviso = `La puerta va entre una casilla y la de su este: (${hex.col},${hex.row}) es la última de su fila y no tiene.`;
      return;
    }
    const nueva = { a: hex, b: este };
    const estaba = muralla.puertas.some((p) => mismaPuerta(p, nueva));
    muralla = validarMuralla({
      muros: muralla.muros.filter((h) => !hexEquals(h, hex) && !hexEquals(h, este)),
      puertas: estaba
        ? muralla.puertas.filter((p) => !mismaPuerta(p, nueva))
        : [...muralla.puertas, nueva],
    });
    return;
  }
  const habia = esMuro(muralla, hex);
  const muros = muralla.muros.filter((h) => !hexEquals(h, hex));
  if (herramienta === 'muro' && !habia) muros.push(hex);
  const puertas =
    herramienta === 'muro' && habia
      ? muralla.puertas
      : muralla.puertas.filter((p) => !toca(p, hex));
  muralla = validarMuralla({ muros, puertas });
}

function formaPorNombre(nombre: string): FormaDeMuralla {
  const f = [...FORMAS_DE_EJEMPLO, ...formasGuardadas].find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay ninguna forma de muralla «${nombre}»`);
  return f;
}

/**
 * Manda la lista entera de formas al servidor —guardar es mandarla con una más
 * o con una cambiada; borrar, sin ella— y, si la acepta, es la nueva lista.
 */
async function escribirFormas(
  formas: readonly FormaDeMuralla[],
  fallo: FalloAlGuardar,
): Promise<boolean> {
  const hecho = await mandarAlServidor('/__arena/murallas', { formas }, murallasSinGuardado, fallo);
  if (hecho === null) return false;
  formasGuardadas = formas;
  return true;
}

async function guardarForma(): Promise<void> {
  // La regla del nombre y de la muralla es la del núcleo: aquí solo se le pasa.
  const forma = validarFormaDeMuralla({ nombre: nombreDeForma, muralla });
  const yaEstaba = formasGuardadas.some((f) => f.nombre === forma.nombre);
  const formas = yaEstaba
    ? formasGuardadas.map((f) => (f.nombre === forma.nombre ? forma : f))
    : [...formasGuardadas, forma];
  const fallo = {
    noSePuede: 'No se puede guardar la muralla',
    noSeHa: 'No se ha guardado la muralla',
  };
  if (await escribirFormas(formas, fallo)) {
    nombreDeForma = forma.nombre;
    aviso = `${yaEstaba ? 'Cambiada' : 'Guardada'} la forma «${forma.nombre}» en data/borradores/murallas.json.`;
  }
}

async function borrarForma(nombre: string): Promise<void> {
  const fallo = {
    noSePuede: `No se puede borrar la forma «${nombre}»`,
    noSeHa: `No se ha borrado la forma «${nombre}»`,
  };
  if (
    await escribirFormas(
      formasGuardadas.filter((f) => f.nombre !== nombre),
      fallo,
    )
  ) {
    aviso = `Borrada la forma «${nombre}».`;
  }
}

// ---------------------------------------------------------------- montaje

/** Los lienzos de las miniaturas, recogidos al repintar: son los mismos hasta el siguiente. */
let figuras: {
  lienzo: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  id: string;
  /** La ficha de la que es retrato (`claveDeFicha`), con su clip y su giro; `null` en una miniatura. */
  clave: string | null;
  /** El bando de la miniatura, que le da el color; `null` en la ficha. */
  lado: Lado | null;
  /** Las tres letras de su marcador sin arte, de `nombreDeFigura`. */
  rotulo: string;
}[] = [];

/**
 * Lo último que se pintó en cada miniatura: se repinta solo si cambia su
 * fotograma, su clip, su dirección o su hoja. Un reposo a 8 fps repintaba cada
 * miniatura sesenta veces por segundo para enseñar ocho fotogramas distintos.
 * Un lienzo nuevo —el montaje se rehace entero— no tiene entrada y se pinta.
 */
const pintado = new WeakMap<HTMLCanvasElement, string>();

/**
 * El editor de la muralla y lo que depende de él: si el montaje cabe con ella
 * (el aviso del editor y «Luchar», deshabilitado con el motivo). Las acciones de
 * la muralla repintan solo esto (`repintarMuralla`); el resto del montaje no
 * cambia con ellas.
 */
function pintarMuralla(): void {
  const despliegue = despliegueDeArenaBlocker(montajeDeArena());
  pintar(
    elMuralla,
    renderMuralla({
      muralla,
      herramienta,
      nombre: nombreDeForma,
      ejemplos: FORMAS_DE_EJEMPLO,
      guardadas: formasGuardadas,
      sinGuardado: murallasSinGuardado,
      despliegue,
      plegado: murallaPlegada,
    }),
  );
  botonLuchar.toggleAttribute('disabled', despliegue !== null);
  botonLuchar.title = despliegue === null ? '' : `No se puede luchar: ${despliegue}.`;
}

/**
 * Los avisos de lo leído (el borrador y el enlace): el recuadro sobre la barra,
 * desplegado o no, y el botón que lo despliega, que solo está si hay alguno.
 */
function pintarAvisosDeLectura(): void {
  const cuantos = cuantosAvisos(avisosDeLectura);
  pintar(elAvisosDeLectura, avisosDesplegados ? renderAvisosDeLectura(avisosDeLectura) : NADA);
  elAvisosDeLectura.hidden = !avisosDesplegados || cuantos === 0;
  botonVerAvisos.hidden = cuantos === 0;
  botonVerAvisos.textContent = `${ROTULO_DE_LOS_AVISOS} (${cuantos})`;
  botonVerAvisos.ariaExpanded = String(avisosDesplegados);
}

/** Solo el editor de la muralla, y la barra de estado en el siguiente fotograma. */
function repintarMuralla(): void {
  pintarMuralla();
  pedirFotograma();
}

function repintarMontaje(): void {
  pintarVista(elMontaje, () => {
    for (const lado of ['izquierda', 'derecha'] as const) {
      pintar(
        elBando[lado],
        renderBando(
          lado,
          montaje[lado],
          (p) => describir(p, lado),
          elegida,
          caben,
          heroes[lado],
          ocupados(lado),
          iaDelBando[lado],
        ),
      );
    }
    pintar(elFicha, fichaElegida());
    pintar(
      elCatalogo,
      html`${unir(INTERRUPTORES.map((d) => renderModo(d, modos[d.clave])))}${renderReglas(reglas)}${renderEnlace(enlaceVigente())}${renderCatalogo(
        hojas,
        filtro,
        { kind: 'montaje' },
        listaDeUnidades(),
      )}`,
    );
    pintarMuralla();
  });
}

/** Pinta una vista (el montaje o la edición) y recoge sus figuras para animarlas. */
function pintarVista(raiz: Element, pintarla: () => void): void {
  pintarla();
  recogerFiguras(raiz);
  pedirFotograma();
}

/** Una ficha abierta: su cabecera y la ficha de siempre (`fichaDe`) con las reglas del montaje. */
function fichaAbierta(f: FichaEditable): FichaAbierta {
  return {
    clave: claveDeFicha(f),
    titulo: nombreDeFicha(f),
    cuerpo: fichaDe(f, enElMontaje(reglas, catalogo())),
  };
}

/** La vista de edición: la lista con «Abrir» y las fichas abiertas. */
function repintarEdicion(): void {
  pintarVista(elEdicion, () => {
    const lista = renderCatalogo(
      hojas,
      filtro,
      { kind: 'edicion', abiertas, plegada: listaPlegada },
      listaDeUnidades(),
    );
    pintar(elEdicion, renderEdicion({ lista, fichas: abiertas.map(fichaAbierta) }));
  });
}

/** La vista «Editar equipo»: las piezas de la arena por hueco y la ficha de la elegida. */
function repintarEquipo(): void {
  pintarVista(elEquipo, () =>
    pintar(
      elEquipo,
      renderEquipo({
        piezas: catalogoAGuardar(),
        elegida: piezaElegida,
        llevan: quienesLaLlevan,
        enLaPelea: (id) => soloEnLaPelea().find((p) => p.id === id) ?? null,
        rechazo: aviso === rechazado ? aviso : null,
        enCombate: sesion !== null,
        sinGuardar: sinGuardarEnPalabras(piezasSinGuardar().length, unidadesSinGuardar.size),
      }),
    ),
  );
}

/** Los nombres de las unidades del borrador que llevan la pieza `id`. */
function quienesLaLlevan(id: string): string[] {
  return [...borrador.values()].filter((u) => idsPuestos(u.equipo).includes(id)).map((u) => u.name);
}

/**
 * Pone la pieza `nueva` en lugar de la de id `id` —o la quita, con `null`: una
 * nueva se borra y una cambiada vuelve a la del juego—, o dice por qué no y no
 * toca nada. Va al borrador y sale de la capa del enlace, si estaba. Entra si lo
 * deja la regla del cambio (`cambioDePiezaBlocker`: cada pieza vale y ninguna
 * unidad del borrador deja de valer) y, en plena pelea, la de la batalla
 * (`retocarEnBatalla`, `kind: 'piezas'`), como un cambio de unidad en plena pelea
 * (`cambiarUnidad`).
 */
function cambiarPiezas(id: string, nueva: Pieza | null, texto: string): boolean {
  const delBorrador =
    nueva === null
      ? piezasDelBorrador.filter((p) => p.id !== id)
      : conPieza(piezasDelBorrador, nueva);
  const capa = capaDelEnlace.filter((p) => p.id !== id);
  const despues = piezasEnUso(delBorrador, capa);
  const motivo = cambioDePiezaBlocker(piezasEnUso(), despues, [...borrador.values()]);
  if (motivo !== null) {
    noSeCambia(`${motivo}.`);
    return false;
  }
  const enLaPelea = retocarLaPelea({ kind: 'piezas', piezas: despues });
  if (enLaPelea !== null) {
    noSeCambia(enLaPelea);
    return false;
  }
  piezasDelBorrador = delBorrador;
  capaDelEnlace = capa;
  avisoTrasCambio(texto);
  return true;
}

/** La pieza `p` con el campo `campo` de su ficha cambiado a `valor`, sin validar: lo valida el núcleo. */
function conCampoDePieza(p: Pieza, campo: string, valor: string): unknown {
  // Vacío es `NaN`, y el núcleo lo dice («tiene que ser un entero ≥ 0 y no es un número»).
  const n = valor.trim() === '' ? Number.NaN : Number(valor);
  const recurso = campo.startsWith('precio-') ? campo.slice('precio-'.length) : null;
  if (recurso !== null) {
    if (!(RESOURCE_KINDS as readonly string[]).includes(recurso)) {
      throw new Error(`la ficha de la pieza no tiene un precio en «${recurso}»`);
    }
    return { ...p, precio: { ...p.precio, [recurso]: n } };
  }
  switch (campo) {
    case 'nombre':
      return { ...p, nombre: valor.trim() };
    case 'hueco':
      // Lo que el hueco exige va con él (`enElHueco`): una nueva pasada a escudo
      // resta velocidad sin pedirlo aparte.
      if (!esHuecoDeArena(valor)) throw new Error(`«${valor}» no es un hueco`);
      return enElHueco(p, valor);
    case 'manos':
      return { ...p, manos: n };
    case 'danio-min':
      return { ...p, danio: [n, p.danio?.[1] ?? 0] };
    case 'danio-max':
      return { ...p, danio: [p.danio?.[0] ?? 0, n] };
    case 'ataque':
    case 'defensa':
    case 'pv':
    case 'armadura':
    case 'velocidad':
      return { ...p, [campo]: n };
    default:
      throw new Error(`la ficha de la pieza no tiene un campo «${campo}»`);
  }
}

/** Un campo de la ficha de la pieza: la pieza cambiada, si vale y no rompe a nadie. */
function cambiarCampoDePieza(el: Element): void {
  const id = el.closest('[data-pieza-elegida]')?.getAttribute('data-pieza-elegida');
  const campo = el.getAttribute('data-arena-pieza-campo');
  if (id === null || id === undefined || campo === null) {
    throw new Error('un campo de pieza fuera de la ficha de una pieza');
  }
  try {
    const nueva = validarPiezaDeArena(
      conCampoDePieza(catalogoAGuardar().pieza(id), campo, valorDe(el)),
    );
    cambiarPiezas(id, nueva, DICHO_DEL_CAMBIO[selloDePieza(nueva)](nueva.nombre));
  } catch (err) {
    noSeCambia(`${mensaje(err)}.`);
  }
}

/** Lo que dice la barra tras cambiar un campo de una pieza, según cómo queda. */
const DICHO_DEL_CAMBIO: Readonly<Record<SelloDePieza, (nombre: string) => string>> = {
  'del juego': (n) => `«${n}» vuelve a ser la del juego.`,
  cambiada: (n) => `«${n}» cambiada para la arena: el juego sigue con la de data/equipo.json.`,
  nueva: (n) => `«${n}» cambiada.`,
};

/** La pieza de la ficha de equipo: la elegida, o lanza si no hay ninguna (el botón no estaría). */
function piezaDeLaFicha(): Pieza {
  if (piezaElegida === null) throw new Error('no hay ninguna pieza elegida en la ficha');
  return catalogoAGuardar().pieza(piezaElegida);
}

/**
 * Tras un cambio en una ficha: en la edición, solo esa ficha. La lista no
 * cambia con una cifra, y repintarla entera devolvía su desplazamiento arriba a
 * cada tabulador. En el montaje y en la pelea, lo de siempre: el resumen de los
 * bandos y el editor dependen de la cifra.
 */
function repintarFicha(clave: string): void {
  const f = fichaDeClave(clave);
  const marco =
    escena === 'edicion' && f.kind !== 'heroe'
      ? elEdicion.querySelector(`article[data-clave-de-ficha="${CSS.escape(clave)}"]`)
      : null;
  if (marco === null || f.kind === 'heroe') repintar();
  else pintarVista(elEdicion, () => pintar(marco, interiorDeFichaAbierta(fichaAbierta(f))));
}

/**
 * Lleva el foco adonde dice `focoTrasCerrar`, ya repintada la vista. El «Abrir»
 * de la que se cerró puede no estar en la lista (el filtro enseña otra
 * facción): entonces, el filtro elegido, que es lo primero de la lista.
 */
function enfocar(foco: FocoTrasCerrar): void {
  const quien =
    foco.kind === 'cerrar'
      ? `article[data-clave-de-ficha="${CSS.escape(foco.clave)}"] [data-arena="cerrar-ficha"]`
      : `[data-arena="abrir-ficha"][data-unidad="${CSS.escape(foco.ficha.id)}"]`;
  const destino =
    elEdicion.querySelector<HTMLElement>(quien) ??
    elEdicion.querySelector<HTMLElement>('[data-arena="filtro"].primary');
  if (destino === null)
    throw new Error(`tras cerrar la ficha no hay adónde llevar el foco (${quien})`);
  destino.focus();
}

/** El nombre de lo que enseña una ficha: el de su unidad, del borrador, con el que se le haya puesto. */
function nombreDeFicha(f: FichaEditable): string {
  return unidadDe(f.id).name;
}

/**
 * Los lienzos de las figuras de la vista que se ve, y de ellos solo se pintan
 * los que están en pantalla (`enPantalla`): con cuatro fichas y la lista, la
 * mitad quedan fuera al desplazar.
 */
function recogerFiguras(raiz: Element): void {
  soltarFiguras();
  for (const lienzo of raiz.querySelectorAll('canvas[data-figura]')) {
    const ctx = lienzo instanceof HTMLCanvasElement ? lienzo.getContext('2d') : null;
    if (ctx === null || !(lienzo instanceof HTMLCanvasElement)) continue;
    const id = lienzo.getAttribute('data-figura') as string;
    const lado = lienzo.getAttribute('data-lado');
    figuras.push({
      lienzo,
      ctx,
      id,
      clave: lienzo.getAttribute('data-ficha-clip') === 'si' ? claveDelElemento(lienzo) : null,
      lado: lado === 'izquierda' || lado === 'derecha' ? lado : null,
      rotulo: nombreDeFigura(id).slice(0, 3),
    });
    vigiaDeFiguras?.observe(lienzo);
  }
}

/** Ninguna figura que animar (se ha cerrado lo que las tenía). */
function soltarFiguras(): void {
  figuras = [];
  vigiaDeFiguras?.disconnect();
  enPantalla.clear();
}

/**
 * Qué lienzos de figura se ven ahora. Lo escribe un `IntersectionObserver`, que
 * avisa al entrar o salir uno de la pantalla (o de su región desplazable); sin
 * él —un navegador sin la API— se pintan todos, como antes.
 */
const enPantalla = new Set<Element>();
const vigiaDeFiguras =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((cambios) => {
        for (const c of cambios) {
          if (c.isIntersecting) enPantalla.add(c.target);
          else enPantalla.delete(c.target);
        }
        pedirFotograma();
      });

/** La clave de la ficha que contiene `el` (`data-clave-de-ficha`), o `null` si no está en ninguna. */
function claveDelElemento(el: Element): string | null {
  return el.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha') ?? null;
}

/**
 * La ficha que contiene `el`, o `null` si no está dentro de ninguna. Es a quién
 * va un gesto de ficha —un campo, un rasgo, quitar una habilidad, el clip, girar,
 * cerrar—: con cuatro abiertas, leer `elegida` escribía en la equivocada.
 */
function fichaDelElemento(el: Element): Elegida | null {
  const clave = claveDelElemento(el);
  return clave === null ? null : fichaDeClave(clave);
}

function puestoPorClave(clave: number): { lado: Lado; i: number; p: Puesto } {
  for (const lado of ['izquierda', 'derecha'] as const) {
    const i = montaje[lado].findIndex((p) => p.clave === clave);
    const p = montaje[lado][i];
    if (p !== undefined) return { lado, i, p };
  }
  throw new Error(`no hay ningún puesto ${clave} en el montaje`);
}

/**
 * La ficha de lo elegido: una unidad o el héroe de un lado. `enCombate`: la del editor de la batalla, sin figura animada (el bucle
 * de las miniaturas no corre en la batalla) y diciendo que el cambio vale ya.
 */
function fichaElegida(enCombate = false): Html {
  const como =
    enCombate && sesion !== null
      ? { enCombate, reglas: sesion.reglas, piezas: catalogo() }
      : enElMontaje(reglas, catalogo());
  return fichaDe(elegida, como);
}

/**
 * La ficha de `e` —la de siempre, la misma en el montaje, la batalla y la
 * edición—, o la vacía. Si se está renombrando (`renombrando`), con el campo del
 * nombre en su título.
 */
function fichaDe(e: Elegida | null, como0: ComoDeLaFicha): Html {
  if (e === null) return renderFicha(null, false, como0);
  const como = renombrando.has(claveDeFicha(e)) ? { ...como0, renombrando: true } : como0;
  switch (e.kind) {
    case 'unidad': {
      const u = unidadDe(e.id);
      return renderFicha(u, arteDe(u.cuerpo.hoja).dispara, como);
    }
    case 'heroe': {
      const h = heroes[e.lado];
      if (h === null) return renderFicha(null, false, como0);
      return renderFichaDeHeroe(e.lado, h, como, hojasDeHeroe());
    }
  }
}

/**
 * En plena pelea, un cambio entra antes en la batalla (`SesionDeArena.retocar`):
 * devuelve por qué no entra, y entonces no se escribe nada —ni el borrador ni el
 * héroe—; `null` si ha entrado o si no hay pelea que retocar.
 */
function retocarLaPelea(r: RetoqueDeArena): string | null {
  return sesion === null ? null : sesion.retocar(r);
}

/**
 * El aviso de un cambio que no entra. Se guarda también aparte (`rechazado`):
 * el editor lo pinta en el color del rechazo mientras siga siendo el aviso.
 */
function noSeCambia(motivo: string): void {
  // Con la mayúscula siempre: la sesión ya da el motivo como frase y lo que lanza
  // el validador empieza en minúscula (M3 de QA: salían de las dos maneras).
  aviso = `No se cambia: ${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}`;
  rechazado = aviso;
  // En plena pelea la barra de abajo es la de la sesión: se quedaba con el
  // «Cambiado: vale ya en esta pelea.» del cambio anterior, justo lo contrario
  // de lo que decía el editor (H5 de QA del ciclo 2).
  if (sesion !== null) sesion.status = aviso;
}
/** La barra de la vista de equipo a media pelea, hasta el primer cambio. */
const EQUIPO_EN_PLENA_PELEA =
  'En plena pelea: lo que cambies vale ya para todos los que la llevan, de los dos bandos. La IA espera a que vuelvas.';
/** El último aviso de un cambio rechazado (`noSeCambia`). */
let rechazado: string | null = null;

/**
 * El aviso de un cambio que ha entrado: lo que dice el cambio y, en plena pelea,
 * lo que dice la sesión al retocar (`retocar`: si ha soltado algo).
 */
function avisoTrasCambio(texto: string): void {
  aviso = [texto, sesion === null ? '' : sesion.status].filter((t) => t !== '').join(' ');
}

/**
 * El editor de la batalla, con la ficha de lo elegido y lo último que pasó al
 * cambiarla. Abierto desde la rueda (`fichaDeLaRueda`), la ficha va dentro de un
 * `<fieldset disabled>`: se mira y no se cambia.
 */
function pintarEditor(): void {
  const ficha = fichaElegida(true);
  pintar(
    elFichaDelEditor,
    fichaDeLaRueda ? html`<fieldset disabled class="solo-lectura">${ficha}</fieldset>` : ficha,
  );
  elAvisoDelEditor.textContent = aviso;
  elAvisoDelEditor.classList.toggle('rechazo', aviso === rechazado);
}

/**
 * Lo que dicen el título y el botón del editor: los de `index.html` al cambiar
 * cifras, y los de mirar una ficha desde la rueda.
 */
const TEXTOS_DEL_EDITOR = {
  titulo: elTituloDelEditor.textContent,
  cerrar: botonCerrarEditor.textContent,
} as const;

/**
 * Si el editor enseña una ficha abierta desde la rueda del golpe. Con la rueda
 * abierta no se cambia nada —la sesión tampoco lo deja, `retocar`—: la ficha es
 * de solo lectura, y al cerrarla se vuelve a la rueda en la misma fase, sin
 * cancelar la elección (#261).
 */
let fichaDeLaRueda = false;

/**
 * Abre el editor de la batalla con la ficha del tipo de `st` (`tipoDelStack`: la
 * unidad de la que sale, o el héroe de su lado): para cambiarla, o desde la rueda
 * (`soloLectura`), para mirarla. Encima de la rueda: `showModal` apila los dos en
 * el orden en que se abren, y Escape cierra solo el de arriba.
 */
function abrirEditor(s: SesionDeArena, st: BattleStack, soloLectura: boolean): void {
  elegida = tipoDelStack(s.battle, st);
  const nombre = nombreEnElCampo(s.battle, st);
  fichaDeLaRueda = soloLectura;
  elTituloDelEditor.textContent = soloLectura ? `Ficha de ${nombre}` : TEXTOS_DEL_EDITOR.titulo;
  botonCerrarEditor.textContent = soloLectura ? 'Volver a la rueda' : TEXTOS_DEL_EDITOR.cerrar;
  aviso = soloLectura
    ? 'Solo para mirar: con la rueda abierta no se cambian cifras. Para eso, «Editar» en el panel de la pelea.'
    : 'Lo que cambies aquí vale ya, para todas las de su tipo en el campo.';
  pintarEditor();
  if (!editor.open) editor.showModal();
}

/** Repinta lo que se ve: el montaje o la edición, o en la batalla el editor y el panel. */
function repintar(): void {
  if (escena === 'edicion') repintarEdicion();
  else if (escena === 'equipo') repintarEquipo();
  else if (escena === 'montaje') repintarMontaje();
  else {
    if (editor.open) pintarEditor();
    pedirFotograma();
  }
}

/**
 * Lo que queda por repintar: todo, unas fichas (por clave) o nada. Un gesto lo
 * pide y se repinta en la tarea siguiente, una vez por muchos que lleguen:
 * un cambio llega al salir del campo, ANTES de que el tabulador pase al
 * siguiente, y repintar en ese momento destruía el campo de destino y el foco
 * caía al `body`. En la tarea siguiente el foco ya está en él, y `pintar` lo
 * conserva.
 */
let pendiente: 'todo' | Set<string> | null = null;
function pedirRepintado(clave: string | null = null): void {
  const antes = pendiente;
  if (clave === null || antes === 'todo') pendiente = 'todo';
  else if (antes === null) pendiente = new Set([clave]);
  else antes.add(clave);
  if (antes === null) setTimeout(repintarLoPendiente, 0);
}

/**
 * Repinta lo pedido, si queda algo. Un clic no espera a la tarea siguiente —no
 * mueve el foco, y quien lo mira (`pnpm capturas` también) espera verlo ya—: lo
 * pide y lo repinta en el acto, junto con lo que hubiera pendiente.
 */
function repintarLoPendiente(): void {
  const que = pendiente;
  pendiente = null;
  if (que === 'todo') repintar();
  else for (const k of que ?? []) repintarFicha(k);
}

/** Los que lleva ya un lado: sus puestos y su héroe, que cuenta como uno más. */
function ocupados(lado: Lado): number {
  return montaje[lado].length + (heroes[lado] === null ? 0 : 1);
}

function añadir(lado: Lado, id: string, escalera = false): void {
  const adjetivo = LADOS[lado].adjetivo;
  if (ocupados(lado) >= caben) {
    aviso = `El bando ${adjetivo} ya lleva ${caben}: no cabe ninguna más.`;
    return;
  }
  const u = unidadDe(id);
  const motivo = porQueNoSeMonta(u);
  if (motivo !== null) {
    aviso = `${u.name} no se monta: ${motivo}.`;
    return;
  }
  // La unidad entra en el borrador al montarla: es lo que se probó y lo que se guarda.
  if (!borrador.has(u.id)) {
    borrador.set(u.id, u);
    unidadesSinGuardar.add(u.id);
  }
  elegida = { kind: 'unidad', id: u.id };
  montaje[lado].push({ clave: siguienteClave++, unidad: id, escalera });
  aviso = `${describir({ clave: 0, unidad: id, escalera }, lado).nombre} entra en el bando ${adjetivo}.`;
}

/** Cambia el héroe de un lado, comprobado. */
function cambiarHeroe(lado: Lado, cambio: (h: HeroeDeArena) => HeroeDeArena): void {
  const h = heroes[lado];
  if (h === null) return;
  try {
    const nuevo = validarHeroeDeArena(cambio(h));
    const motivo = retocarLaPelea({ kind: 'heroe', lado, datos: nuevo });
    if (motivo !== null) {
      noSeCambia(motivo);
      return;
    }
    heroes[lado] = nuevo;
    avisoTrasCambio('');
  } catch (err) {
    noSeCambia(`${mensaje(err)}.`);
  }
}

/** Aplica un cambio a la unidad de un tipo, validado: lo que no cuadra se dice y no entra. */
function cambiarUnidad(id: string, cambio: (u: UnidadDeArena) => unknown): void {
  try {
    const nueva = validarUnidadDeArena(cambio(unidadDe(id)), catalogo());
    const motivo = retocarLaPelea({ kind: 'tipo', fuente: { unidad: nueva } });
    if (motivo !== null) {
      noSeCambia(motivo);
      return;
    }
    borrador.set(id, nueva);
    unidadesSinGuardar.add(id);
    avisoTrasCambio('');
  } catch (err) {
    noSeCambia(`${mensaje(err)}.`);
  }
}

/** El nuevo valor de un campo de la ficha, en la unidad. Lo que es número lo valida el núcleo. */
function conCampo(u: UnidadDeArena, campo: string, valor: string): unknown {
  // Vacío es `NaN`, y el núcleo lo dice como «está vacío».
  const n = valor.trim() === '' ? Number.NaN : Number(valor);
  switch (campo) {
    case 'name':
      return { ...u, name: valor };

    case 'damage-min':
      return { ...u, damage: [n, u.damage[1]] };
    case 'damage-max':
      return { ...u, damage: [u.damage[0], n] };
    case 'gold':
      return { ...u, cost: { gold: n } };
    case 'casillas':
    case 'attack':
    case 'defense':
    case 'hp':
    case 'leadership':
      return { ...u, [campo]: n };
    default:
      throw new Error(`la ficha no tiene un campo «${campo}»`);
  }
}

/** El valor de un campo de formulario, sin nombrar su tipo del DOM. */
function valorDe(el: Element): string {
  const v = (el as Element & { value?: unknown }).value;
  if (typeof v !== 'string') throw new Error('ese elemento no es un campo con valor');
  return v;
}

function marcadoDe(el: Element): boolean {
  return (el as Element & { checked?: unknown }).checked === true;
}

/**
 * «Guardar»: las unidades y las piezas con que se pelea, en una sola operación
 * (`escribirBorrador`): si algo no vale no se escribe nada y se dice por qué.
 */
async function guardar(): Promise<void> {
  const orden = hojas.map((h) => h.id);
  // Las nuevas y las que no tienen hoja (`indexOf` −1) van al final, en el orden
  // en que llegaron.
  const puesto = (id: string): number => {
    const i = orden.indexOf(id);
    return i < 0 ? orden.length : i;
  };
  const unidades = [...borrador.values()].sort((a, b) => puesto(a.id) - puesto(b.id));
  const piezas = piezasAGuardar();
  // Las unidades del enlace se guardan con tus piezas, no con las suyas: si con
  // ellas alguna deja de valer, no se escribe nada y se dice quién.
  const conLasTuyas = cambioDePiezaBlocker(piezasEnUso(), piezas, unidades);
  if (conLasTuyas !== null) {
    aviso = `No se ha guardado: con tus piezas en vez de las del enlace, ${conLasTuyas}.`;
    return;
  }
  const hecho = await mandarAlServidor('/__arena/unidades', { unidades, piezas }, sinGuardado, {
    noSePuede: 'No se puede guardar',
    noSeHa: 'No se ha guardado',
  });
  if (hecho === null) return;
  unidadesSinGuardar.clear();
  // Las nuevas del enlace ya son del borrador; las demás de la capa siguen
  // peleando en esta pelea y no se han escrito.
  piezasDelBorrador = piezas;
  piezasGuardadas = piezas;
  const ajenas = soloEnLaPelea();
  aviso = `${guardadoEnPalabras(hecho as Guardado)}${
    ajenas.length === 0
      ? ''
      : ` No se guardan las del enlace ${nombresDe(ajenas)}: se quedan las de esta arena, y las unidades guardadas pelearán con ellas.`
  }`;
}

/** Nombres de piezas para la barra: «Espada», «Brigantina». */
function nombresDe(piezas: readonly Pieza[]): string {
  return piezas.map((p) => `«${p.nombre}»`).join(', ');
}

// Cerrar o recargar con cifras sin guardar las perdía sin decir nada (M5 de QA).
window.addEventListener('beforeunload', (ev) => {
  const algo = unidadesSinGuardar.size + piezasSinGuardar().length > 0;
  if (algo && sinGuardado === null) ev.preventDefault();
});

// ---------------------------------------------------------------- el enlace de la pelea

/**
 * El montaje de ahora tal como va en el enlace: los puestos y héroes de cada
 * lado y las cifras de cada unidad montada (guardadas o no).
 */
function montajeDelEnlace(): MontajeDelEnlace {
  const todos = [...montaje.izquierda, ...montaje.derecha];
  const unidadesMontadas = [...new Set(todos.map((p) => p.unidad))];
  const lado = (l: Lado) => ({
    ia: iaDelBando[l],
    puestos: montaje[l].map((p): PuestoDelEnlace => ({ unidad: p.unidad, escalera: p.escalera })),
    heroe: heroes[l],
  });
  const unidades = unidadesMontadas.map(unidadDe);
  const conHeroe = heroes.izquierda !== null || heroes.derecha !== null;
  return {
    unidades,
    piezas: piezasDelMontaje(unidades, conHeroe, piezasEnUso()),
    izquierda: lado('izquierda'),
    derecha: lado('derecha'),
    muralla: hayMuralla(muralla) ? muralla : null,
  };
}

/**
 * La dirección que monta la pelea de ahora: la semilla, las reglas y el montaje.
 * Las comas de `?reglas=` van sin escapar, como en la barra.
 */
function enlaceDe(semilla: number): string {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('seed', String(semilla));
  const enURL = reglasALaURL(reglas);
  if (enURL !== '') url.searchParams.set('reglas', enURL);
  for (const d of INTERRUPTORES) {
    const enLaURL = modoALaURL(d, modos[d.clave]);
    if (enLaURL !== '') url.searchParams.set(d.parametro, enLaURL);
  }
  url.searchParams.set('montaje', montajeALaURL(montajeDelEnlace()));
  return url.href.replace(/%2C/g, ',');
}

/** El enlace copiado, si sigue siendo el de este montaje; si no, `null`. */
function enlaceVigente(): string | null {
  if (enlaceCopiado === null || semillaPedida === null) return null;
  return enlaceDe(semillaPedida) === enlaceCopiado ? enlaceCopiado : null;
}

/**
 * «Copiar enlace de la pelea»: el montaje entero no cabe con comodidad en la
 * barra, así que se escribe al pedirlo (H6 de QA del banco, decisión del
 * usuario). Sin semilla fijada, se sortea una y se fija, en la barra también:
 * la pelea que se lucha aquí después es la del enlace.
 */
async function copiarEnlace(): Promise<void> {
  const semilla = semillaPedida ?? semillaSorteada();
  const enlace = enlaceDe(semilla);
  semillaPedida = semilla;
  reglasALaBarra((url) => url.searchParams.set('seed', String(semilla)));
  enlaceCopiado = enlace;
  try {
    await navigator.clipboard.writeText(enlace);
    aviso = `Enlace de la pelea copiado (semilla ${semilla}): abrirlo monta esta misma pelea.`;
  } catch (err) {
    aviso = `El enlace de la pelea (semilla ${semilla}) está en su campo, junto a las reglas: no se ha podido copiar solo (${mensaje(err)}).`;
  }
}

/**
 * Monta la pelea de `?montaje=` si la URL trae una. Se comprueba ENTERA antes de
 * tocar nada —el formato y lo que existe, en `montajeDeLaURL`; que cada hoja
 * tenga arte, aquí—: un enlace que no vale se dice y la página sigue con el
 * montaje vacío. Abrirla no lucha sola. Devuelve lo que dice la barra, o `null`
 * si la URL no trae montaje.
 */
function montarDelEnlace(): { readonly montado: boolean; readonly aviso: string } | null {
  const noSeMonta = (err: unknown) => ({
    montado: false,
    aviso: `El enlace de la pelea no se monta: ${mensaje(err)}. `,
  });
  let texto: string | null;
  try {
    texto = unaVezEnLaURL(parametros.getAll('montaje'), 'montaje');
  } catch (err) {
    return noSeMonta(err);
  }
  if (texto === null) return null;
  try {
    // Con la semilla, las reglas o un modo mal, el montaje pelearía otra pelea.
    if (parametrosQueNoValen.length > 0) {
      const cuales = parametrosQueNoValen.map((p) => `«?${p}=»`).join(', ');
      throw new Error(
        parametrosQueNoValen.length === 1
          ? `${cuales} del enlace no vale`
          : `${cuales} del enlace no valen`,
      );
    }
    // Con el perfil de cada hoja: un enlace de antes de la versión 5 trae las
    // cifras de su perfil y se convierte a cuerpo y equipo al leerlo.
    // Las unidades de un enlace de antes de la 6 se leen y pelean con las piezas
    // de esta arena; las de la 6, con las suyas.
    const m = montajeDeLaURL(texto, perfilDeLasHojas(hojas), piezasEnUso());
    for (const u of m.unidades) {
      const motivo = porQueNoSeMonta(u);
      if (motivo !== null) throw new Error(`${u.name} no se monta: ${motivo}`);
    }
    for (const l of ['izquierda', 'derecha'] as const) {
      const figura = m[l].heroe?.figura ?? null;
      if (figura !== null && !hojasDeHeroe().some((h) => h.id === figura)) {
        throw new Error(
          `la figura «${figura}» del héroe ${LADOS[l].adjetivo} no es una hoja de héroe`,
        );
      }
    }
    const { capa, dicho: piezasDichas } = capaAlAbrir(m);
    const distintas = m.unidades.filter(
      (u) => JSON.stringify(borrador.get(u.id) ?? null) !== JSON.stringify(u),
    );
    capaDelEnlace = capa;
    for (const u of m.unidades) borrador.set(u.id, u);
    for (const u of distintas) unidadesSinGuardar.add(u.id);
    for (const l of ['izquierda', 'derecha'] as const) {
      montaje[l] = m[l].puestos.map((p) => ({
        clave: siguienteClave++,
        unidad: p.unidad,
        escalera: p.escalera,
      }));
      heroes[l] = m[l].heroe;
      iaDelBando[l] = m[l].ia;
    }
    // La muralla del enlace sustituye a la dibujada; sin ella, el tablero va limpio.
    muralla = m.muralla ?? SIN_MURALLA;
    nombreDeForma = '';
    // La barra se queda con la semilla y las reglas: el montaje, si cambia, ya no
    // sería el del enlace.
    reglasALaBarra((url) => url.searchParams.delete('montaje'));
    const cifras =
      distintas.length === 0
        ? ''
        : ` Las cifras de ${distintas.map((u) => u.name).join(', ')} son las del enlace, sin guardar.`;
    // Lo que se quita del enlace, un bando de antes de la versión 3 que repartía,
    // una unidad de antes de la 5 que no cupo en cuerpo y equipo… (`montajeDeLaURL`):
    // entero en el recuadro de la barra, y en ella el resumen.
    const lectura: AvisosDeLectura = {
      de: 'Del enlace de la pelea:',
      seRetiran: [],
      avisos: m.avisos ?? [],
    };
    if (lectura.avisos.length > 0) avisosDeLectura = [lectura, ...avisosDeLectura];
    return {
      montado: true,
      aviso: `Montada la pelea del enlace${semillaPedida === null ? '' : ` (semilla ${semillaPedida})`}: pulsa Luchar.${cifras}${piezasDichas}${resumenDeLaLectura(lectura)} `,
    };
  } catch (err) {
    return noSeMonta(err);
  }
}

/**
 * La capa del enlace tras abrir `m`, sin tocar nada todavía, y lo que hay que
 * decir. Desde la versión 6 (`CON_PIEZAS`), lo que llevan sus unidades y sus
 * héroes pelea con las piezas del enlace o, si no las trae, con las del juego
 * (`piezasDelEnlace`): van en la capa, encima del borrador, que no cambia. Antes
 * de la 6 se pelea con las de aquí, y si alguna de las que lleva está cambiada la
 * barra avisa de que puede no coincidir con el enlace original.
 */
function capaAlAbrir(m: ReturnType<typeof montajeDeLaURL>): {
  readonly capa: readonly Pieza[];
  readonly dicho: string;
} {
  if (m.version < CON_PIEZAS) {
    const conHeroe = m.izquierda.heroe !== null || m.derecha.heroe !== null;
    const cambiadas = piezasDelMontaje(m.unidades, conHeroe, piezasEnUso());
    return {
      capa: capaDelEnlace,
      dicho:
        cambiadas.length === 0
          ? ''
          : ` Es un enlace de antes de las piezas editables (versión ${m.version}): pelea con las piezas de esta arena, y ${cambiadas.map((p) => `«${p.nombre}»`).join(', ')} ${cambiadas.length === 1 ? 'está cambiada' : 'están cambiadas'}; el resultado puede no coincidir con el del enlace original.`,
    };
  }
  const suyas = piezasDelEnlace(m);
  // La capa de un enlace anterior se queda para lo que este no lleva: sus
  // unidades siguen en el borrador.
  const capa = [...capaDelEnlace.filter((p) => !suyas.some((x) => x.id === p.id)), ...suyas];
  const despues = piezasEnUso(piezasDelBorrador, capa);
  const eq = catalogoDeLaArena(despues);
  const tocadas = idsQueCambian(piezasEnUso(), despues).map((id) => eq.pieza(id));
  if (tocadas.length === 0) return { capa, dicho: '' };
  const seGuardan = new Set(
    idsQueCambian(piezasDelBorrador, piezasQueSeGuardan(piezasDelBorrador, capa)),
  );
  const nuevas = tocadas.filter((p) => seGuardan.has(p.id));
  const tuyas = tocadas.filter((p) => !seGuardan.has(p.id));
  const guarda =
    tuyas.length === 0
      ? `«Guardar» escribe las nuevas (${nombresDe(nuevas)})`
      : nuevas.length === 0
        ? '«Guardar» no las escribe: se quedan las de esta arena'
        : `«Guardar» escribe las nuevas (${nombresDe(nuevas)}); de ${nombresDe(tuyas)} se quedan las de esta arena`;
  return {
    capa,
    dicho: ` En esta pelea van las piezas del enlace ${nombresDe(tocadas)}, sin tocar las tuyas; ${guarda}.`,
  };
}

/** Los ids de las piezas que cambian, aparecen o desaparecen de `antes` a `despues`. */
function idsQueCambian(antes: readonly Pieza[], despues: readonly Pieza[]): string[] {
  const de = (ps: readonly Pieza[], id: string): Pieza | null =>
    ps.find((p) => p.id === id) ?? null;
  const ids = new Set([...antes.map((p) => p.id), ...despues.map((p) => p.id)]);
  return [...ids].filter((id) => {
    const a = de(antes, id);
    const d = de(despues, id);
    return a === null || d === null ? a !== d : !mismaPieza(a, d);
  });
}

// ---------------------------------------------------------------- batalla

const batalla = new EscenaBatalla(() => {
  if (sesion === null) throw new Error('la escena de batalla se ha usado sin batalla');
  return sesion;
});

function luchar(): void {
  const lado = (l: Lado): LadoDeSesion => ({
    unidades: montaje[l].map(fuenteDeArena),
    heroe: heroes[l],
    ia: iaDelBando[l],
  });
  // Una pelea nueva sortea su semilla, salvo que la URL fije una; y la URL la
  // lleva siempre, como en la partida: un resultado raro se repite copiando la
  // barra de direcciones (M6 de QA). Con las reglas, que también la cambian.
  const semilla = semillaPedida ?? semillaSorteada();
  let nueva: SesionDeArena;
  try {
    nueva = new SesionDeArena(
      {
        izquierda: lado('izquierda'),
        derecha: lado('derecha'),
        reglas,
        muralla,
        piezas: piezasEnUso(),
        modos,
      },
      semilla,
    );
  } catch (err) {
    aviso = `No se puede luchar: ${mensaje(err)}.`;
    return;
  }
  reglasALaBarra((url) => url.searchParams.set('seed', String(semilla)));
  sesion = nueva;
  elSeed.textContent = `semilla ${semilla}`;
  irA('battle');
  principal.remedir();
  paneles = null;
  // El animador mira el tablero de salida ANTES de que la IA juegue: así cuenta
  // lo que juega, también con todas las unidades en IA (H1 de QA).
  batalla.sincronizar(performance.now());
  nueva.empezar();
}

function volverAlMontaje(): void {
  if (editor.open) editor.close();
  cerrarLaRueda();
  sesion = null;
  irA('montaje');
  aviso = 'De vuelta al montaje: todo sigue como estaba.';
  repintarMontaje();
}

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
let colocarElMarco = false;

function alargarLienzo(): void {
  const visible = elLienzo.clientHeight;
  const pide = (): number =>
    sesion === null ? visible : batalla.altoDelLienzo(elLienzo.clientWidth, visible);
  // Dos veces: con el marco desplazable, la barra le quita ancho, y el alto que
  // pide el tablero sale de ese ancho.
  app.toggleAttribute('data-muralla', pide() > visible + 0.5);
  const alto = pide();
  const css = alto > visible + 0.5 ? `${Math.ceil(alto)}px` : '';
  if (canvas.style.height === css) return;
  const alargado = canvas.style.height === '';
  canvas.style.height = css;
  principal.remedir();
  if (alargado && css !== '') colocarElMarco = true;
}

/** Tras pintar con el lienzo alargado: el final del tablero, al pie del marco. */
function colocarMarco(): void {
  if (!colocarElMarco) return;
  colocarElMarco = false;
  elLienzo.scrollTop = Math.max(0, batalla.pieDelTablero() - elLienzo.clientHeight);
}

/** La puerta de los gestos mientras se cuenta la jugada, como en la partida. */
function jugadaEnCurso(): boolean {
  if (sesion === null) return true;
  if (!batalla.rechazarSiOcupada(performance.now())) return false;
  pedirFotograma();
  return true;
}

// ---------------------------------------------------------------- dibujo

let fotogramaPedido = false;
function pedirFotograma(): void {
  if (fotogramaPedido) return;
  fotogramaPedido = true;
  requestAnimationFrame(render);
}

const principal = ajustarLienzo(canvas, pedirFotograma);
cargarArte(pedirFotograma, { manifiesto: false, mapa: false });

let paneles: { version: string; ocupada: boolean } | null = null;

function render(ahora: number): void {
  fotogramaPedido = false;
  let otraVez = false;
  try {
    // En la vista de equipo, también a media pelea, la barra es la de la página.
    if (sesion === null || escena === 'equipo') {
      if (elStatus.textContent !== aviso) elStatus.textContent = aviso;
      otraVez = animarFiguras(ahora);
    } else {
      dibujarBatalla(ahora, sesion);
      // Las figuras de los dos de la rueda (su cabecera, `recogerFiguras`).
      const enLaRueda = elRueda.open && animarFiguras(ahora);
      otraVez = enLaRueda || hayFigurasAnimadas() || batalla.ocupada;
    }
  } catch (err) {
    console.error('[arena] fallo al pintar', err);
    elStatus.textContent = `No se ha podido pintar la pantalla: ${mensaje(err)}`;
  } finally {
    if (otraVez) pedirFotograma();
  }
}

/** El instante dentro de un clip que no va en bucle, repetido con una pausa al final. */
function repeticion(
  ahora: number,
  inicio: number,
  c: { readonly frames: number; readonly fps: number },
): number {
  const dura = (c.frames / c.fps) * 1000;
  return (ahora - inicio) % (dura + PAUSA_DE_LA_FICHA_MS);
}

/**
 * Las figuras animadas de lo que se ve: las miniaturas y las fichas del montaje,
 * la edición o el equipo, o, en la batalla, las dos de la cabecera de la rueda
 * (`recogerFiguras`). Devuelve si hay que seguir: sin ninguna —al arrancar, con
 * los bandos vacíos y sin ficha— no hay nada que repintar, y el bucle se para
 * hasta el siguiente gesto o la siguiente imagen.
 */
function animarFiguras(ahora: number): boolean {
  for (const [i, { lienzo, ctx, id, clave: deFicha, lado, rotulo }] of figuras.entries()) {
    if (vigiaDeFiguras !== null && !enPantalla.has(lienzo)) continue;
    const arte = arteDe(id);
    // En la miniatura cada figura llena su marco: aquí se mira una, no se
    // comparan. `pintarFigura` escala contra un adulto, así que se le pide el
    // alto que deja a ESTA figura en el 80 % del marco. Se pinta como en el
    // tablero —teñida del color de su bando, o el marcador si no ha llegado—.
    const anim = deFicha === null ? null : animDe(deFicha);
    const clip: CharacterClip = anim === null ? 'idle' : anim.clip;
    // Los dos bandos se miran; la ficha, hacia donde la haya girado quien mira.
    const mira: Direccion =
      anim !== null
        ? (DIRECCION_DE_HOJA[anim.mira] as Direccion)
        : lado === 'derecha'
          ? 'SO'
          : MIRADA_DE_PRESENTACION;
    // El cadáver tendido es más ancho que alto y cae por debajo de los pies
    // —hacia la cámara, y en las hojas pintadas su fila va subida en la celda—:
    // con la muerte la figura se achica y el suelo sube hasta que quepa la celda
    // entera, o la ficha lo cortaba por abajo y por los lados.
    const llena = clip === 'death' ? 0.4 : 0.8;
    const alto = (lienzo.height * llena * FIGURA.alturaAdulto) / arte.alturaPropia;
    const atlas = hojaDe(arte, mira);
    const bajoLosPies =
      clip === 'death'
        ? ((atlas.cell - atlas.clips.death.anchor[1]) * alto) / FIGURA.alturaAdulto
        : 8;
    const figura: Figura = {
      // El compás va por miniatura y no por hoja: la misma unidad puede estar
      // en el catálogo y en los dos bandos, y no tiene por qué respirar igual.
      id: `miniatura-${i}-${id}`,
      body: id,
      clip,
      // Un clip que no va en bucle (ataque, disparo, daño, muerte) se repite en
      // la ficha: con el reloj de siempre se quedaba en su último fotograma.
      tiempo:
        anim !== null && !atlas.clips[clip].loop
          ? repeticion(ahora, anim.inicio, atlas.clips[clip])
          : ahora,
      x: lienzo.width / 2,
      suelo: lienzo.height - bajoLosPies,
      alto,
      mira,
      color: lado === null ? COLOR_NEUTRO : COLOR_BANDO[LADOS[lado].bando],
      rotulo,
    };
    const colocada = colocarFigura(figura);
    const clave = claveDelDibujo(colocada);
    if (pintado.get(lienzo) === clave) continue;
    pintado.set(lienzo, clave);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    pintarSombraDeFigura(ctx, colocada);
    pintarFigura(ctx, colocada);
  }
  // Con alguna figura con arte en pantalla, respira: el bucle sigue. Sin arte,
  // la imagen que llegue avisa y repinta.
  const aLaVista = vigiaDeFiguras === null ? figuras.length : enPantalla.size;
  return aLaVista > 0 && hayFigurasAnimadas();
}

function dibujarBatalla(ahora: number, s: SesionDeArena): void {
  alargarLienzo();
  const rect = principal.preparar();
  principal.ctx.clearRect(0, 0, rect.width, rect.height);
  batalla.sincronizar(ahora);
  batalla.dibujar(principal.ctx, rect.width, rect.height);
  colocarMarco();
  const ocupada = batalla.ocupada;
  const version = s.version;
  if (paneles === null || paneles.version !== version || paneles.ocupada !== ocupada) {
    paneles = { version, ocupada };
    // El parte se lee de arriba abajo y lo último queda al fondo: sigue ahí, o
    // al acabar no se veía lo que acababa de pasar (M11 de QA), salvo que la
    // persona haya subido a leer (#198).
    pintarSiguiendoElFinal(elSide, renderPanelDeBatalla(s, ocupada));
    // La barra de arriba, igual que el panel: mientras se cuenta no adelanta ni
    // la ronda ni el final.
    elDay.textContent = ocupada ? 'Batalla' : `Batalla · ronda ${s.battle.round}`;
    elTurn.textContent = rotuloDelTurno(s, ocupada);
  }
  // «La batalla ha terminado» espera a que el tablero llegue al final.
  const estado = ocupada && s.battle.finished !== null ? '' : s.status;
  if (elStatus.textContent !== estado) elStatus.textContent = estado;
  pintarLaRueda(s);
}

/**
 * Lo que la rueda lleva pintado: el cruce que se cuenta (su hecho del registro) o
 * la elección que espera la sesión (`ruedaPendiente`, el mismo objeto mientras
 * dura su fase). Se repinta solo al cambiar, por identidad: repintar en cada
 * fotograma reiniciaría las animaciones del desenlace.
 */
let ruedaPintada: HechoDelCruce | RuedaPendiente | null = null;

/**
 * La rueda del golpe, cada fotograma: mientras el animador cuenta un cruce, su
 * desenlace al ritmo del paso (`data-tramo`); si no se cuenta nada y la sesión
 * espera una elección, la rueda para elegir; si no, cerrada. Con algo en la
 * cola, la elección espera a que acabe: el tablero no puede ir por detrás. Así
 * la rueda se abre cuando quien pega ya ha llegado: la sesión lo planta ante su
 * objetivo (su `move`) antes de pedir la elección, y esta espera a la marcha
 * (decisión del usuario, 13-10-2026: primero se anda, luego se elige).
 */
function pintarLaRueda(s: SesionDeArena): void {
  const cruce = batalla.cruceEnCurso();
  const pendiente = cruce === null && !batalla.ocupada ? s.ruedaPendiente : null;
  let enfocar = false;
  if (cruce !== null) {
    if (ruedaPintada !== cruce.evento) {
      // El índice, solo al cambiar de cruce: el parte lo busca por él.
      const i = s.battle.log.indexOf(cruce.evento);
      if (i < 0) throw new Error('la rueda cuenta un cruce que no está en el registro');
      pintar(
        elRueda,
        renderDesenlace(s.battle, cruce.evento, contraataqueDelCruce(s.battle.log, i)),
      );
      ajustarLaRueda(elRueda);
      recogerFiguras(elRueda);
      ruedaPintada = cruce.evento;
    }
    const tramos = tramosDelDesenlace(cruce.t);
    if (elRueda.dataset.tramo !== tramos) elRueda.dataset.tramo = tramos;
  } else if (pendiente !== null) {
    if (ruedaPintada !== pendiente) {
      delete elRueda.dataset.tramo;
      pintar(elRueda, renderEleccion(s, pendiente));
      ajustarLaRueda(elRueda);
      recogerFiguras(elRueda);
      aquietarLaRueda();
      ruedaPintada = pendiente;
      enfocar = true;
    }
  } else {
    cerrarLaRueda();
    return;
  }
  if (!elRueda.open) elRueda.showModal();
  // El foco, en el diálogo y en ningún sector: uno enfocado parecería preelegido
  // (y abría su nota). Las flechas empiezan por el primero. El de la fase
  // anterior no se conserva: lleva otra `data-fase`.
  if (enfocar) elRueda.focus();
}

function cerrarLaRueda(): void {
  ruedaPintada = null;
  delete elRueda.dataset.tramo;
  despertarLaRueda();
  if (!elRueda.open) return;
  elRueda.close();
  // Las figuras que se animaban eran las de su cabecera: al volver al montaje,
  // `pintarVista` recoge las suyas.
  soltarFiguras();
}

/**
 * Dónde estaba el puntero la última vez que se movió, en la ventana, y dónde
 * estaba al pintarse la rueda de una fase nueva (`aquietarLaRueda`).
 *
 * La rueda de cada fase sale con el puntero donde lo dejó quien eligió antes, y
 * el `:hover` encendía el sector de debajo y abría su nota: con los dos bandos
 * «Yo», quien respondía veía qué había pulsado quien pegaba (H1 de QA,
 * 13-10-2026). Así que la rueda nace quieta (`data-quieta`: el CSS no enciende
 * nada por el `:hover`) hasta que el puntero se mueve DE VERDAD —un `pointermove`
 * en el mismo píxel no cuenta: el navegador puede mandarlo al cambiar lo de
 * debajo— o se pulsa.
 *
 * Una tecla NO la despierta: quien responde con el teclado no ha movido el
 * ratón, que sigue encima de lo que pulsó el otro, y despertarla encendía ese
 * sector y abría su nota junto al que tenía el foco (H1b, vuelta 2 de QA). El
 * teclado no necesita el `:hover`: el foco enciende su sector por
 * `:focus-visible`, que no mira `data-quieta`.
 */
let punteroEn: { readonly x: number; readonly y: number } | null = null;
let quietaEn: { readonly x: number; readonly y: number } | null = null;

window.addEventListener(
  'pointermove',
  (ev) => {
    punteroEn = { x: ev.clientX, y: ev.clientY };
  },
  { capture: true, passive: true },
);

function aquietarLaRueda(): void {
  elRueda.dataset.quieta = '';
  quietaEn = punteroEn;
}

function despertarLaRueda(): void {
  delete elRueda.dataset.quieta;
  quietaEn = null;
}

/**
 * Si el gesto cae en la cabecera de la rueda (las figuras de los dos, #261): ni
 * pasar por ella ni pulsarla despierta los sectores. Al ir a mirar quién es
 * quién, el puntero no ha pasado por la rueda.
 */
function enLaCabecera(ev: Event): boolean {
  return ev.target instanceof Element && ev.target.closest('.cabecera-de-rueda') !== null;
}

elRueda.addEventListener('pointermove', (ev) => {
  if (elRueda.dataset.quieta === undefined || enLaCabecera(ev)) return;
  if (quietaEn !== null && ev.clientX === quietaEn.x && ev.clientY === quietaEn.y) return;
  despertarLaRueda();
});
elRueda.addEventListener('pointerdown', (ev) => {
  if (!enLaCabecera(ev)) despertarLaRueda();
});

/**
 * Elige en la rueda: el clic en un sector, su tecla o Intro con el foco en él. La
 * sesión dice si no espera nada; mientras se cuenta un desenlace no se elige: la
 * rueda de la siguiente fase aún no se ve.
 */
function elegirEnLaRueda(tipo: string): void {
  if (sesion === null || batalla.ocupada) return;
  sesion.elegirEnLaRueda(tipo);
  pedirFotograma();
}

elRueda.addEventListener('click', (ev) => {
  const boton = (ev.target as Element).closest('[data-golpe]');
  if (boton === null || ev.detail > 1) return;
  elegirEnLaRueda(boton.getAttribute('data-golpe') ?? '');
});

/**
 * Las teclas de la rueda: del 1 al 7 elige el sector de su número
 * (`tipoDeLaTecla`, la misma tabla que pinta las etiquetas), las flechas pasan el
 * foco de uno a otro e Intro pulsa el que lo tiene (el botón, por sí mismo).
 */
elRueda.addEventListener('keydown', (ev) => {
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const tipo = tipoDeLaTecla(ev.key);
  if (tipo !== null) {
    ev.preventDefault();
    elegirEnLaRueda(tipo);
    return;
  }
  const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
  if (paso === undefined) return;
  ev.preventDefault();
  const botones = [...elRueda.querySelectorAll<HTMLElement>('button[data-golpe]')];
  if (botones.length === 0) return;
  const ahora = botones.indexOf(document.activeElement as HTMLElement);
  const siguiente = ahora < 0 ? 0 : (ahora + paso + botones.length) % botones.length;
  botones[siguiente]?.focus();
});

// Escape: cancela el golpe solo antes de elegirlo, y quien pega se queda donde
// llegó, con su turno (`soltarElGolpe`); si no, la sesión dice por qué no (la
// respuesta no se cancela: el golpe ya viene). El desenlace se cuenta entero: el
// diálogo no se cierra solo.
elRueda.addEventListener('cancel', (ev) => {
  ev.preventDefault();
  if (sesion === null || batalla.ocupada) return;
  if (sesion.cancelarGolpe()) cerrarLaRueda();
  pedirFotograma();
});

// ---------------------------------------------------------------- gestos

function enLienzo(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

canvas.addEventListener('pointermove', (ev) => {
  if (sesion === null) return;
  const p = enLienzo(ev);
  batalla.mover(p.x, p.y);
  pedirFotograma();
});

canvas.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0 || sesion === null) return;
  const p = enLienzo(ev);
  batalla.mover(p.x, p.y);
  if (!jugadaEnCurso()) batalla.pulsar(p.x, p.y);
  pedirFotograma();
});

canvas.addEventListener('pointerleave', () => {
  if (sesion !== null) batalla.salir();
  pedirFotograma();
});

/**
 * Lo común a los botones de escala, puerta y poder: con una sola jugada posible
 * (`posibles`), se juega ya; con varias, el siguiente clic en el tablero elige
 * (`esperar(true)` lo deja esperando y la barra dice `pide`), y pulsar el botón
 * otra vez lo cancela; con ninguna, el motivo del núcleo.
 */
function unaOElegir(
  s: SesionDeArena,
  posibles: readonly BattleAction[],
  o: {
    readonly esperando: boolean;
    readonly esperar: (si: boolean) => void;
    readonly motivo: () => string | null;
    readonly ninguna: string;
    readonly pide: string;
  },
): void {
  const unica = posibles.length === 1 ? posibles[0] : undefined;
  if (unica !== undefined) {
    o.esperar(false);
    s.playBattleAction(unica);
    return;
  }
  if (posibles.length === 0) {
    s.status = o.motivo() ?? o.ninguna;
    return;
  }
  const espera = !o.esperando;
  o.esperar(espera);
  s.status = espera ? o.pide : '';
}

/** «Poner escalera» o «Subir», contra un muro de su pie (`muroPorElegir`). */
function escala(s: SesionDeArena, tipo: TipoDeEscala): void {
  unaOElegir(
    s,
    s.battleLegalActions().filter((a) => a.type === tipo),
    {
      esperando: s.muroPorElegir === tipo,
      esperar: (si) => {
        s.muroPorElegir = si ? tipo : null;
      },
      motivo: () => s.motivoDeEscala(tipo),
      ninguna: 'No hay muro contra el que hacerlo.',
      pide: 'Elige el muro: pulsa en lo alto de una de las columnas marcadas.',
    },
  );
}

/** «Abrir puerta» o «Cerrar puerta», una de las de la muralla (`puertaPorElegir`). */
function puerta(s: SesionDeArena, tipo: TipoDePuerta): void {
  unaOElegir(
    s,
    s.battleLegalActions().filter((a) => a.type === tipo),
    {
      esperando: s.puertaPorElegir === tipo,
      esperar: (si) => {
        s.puertaPorElegir = si ? tipo : null;
      },
      motivo: () => s.motivoDePuerta(tipo),
      ninguna: 'No hay puerta que abrir o cerrar.',
      pide: 'Elige la puerta: pulsa en una de las portadas marcadas.',
    },
  );
}

/**
 * El botón de un poder, sobre un aliado (`apuntarPoder`). Elegir un poder suelta
 * el hechizo, y al revés: el clic apunta una sola cosa (`apuntado`).
 */
function usarPoder(s: SesionDeArena, id: PoderId): void {
  const apuntado = s.apuntado;
  unaOElegir(
    s,
    s.battleLegalActions().filter((a) => a.type === 'poder' && a.poder === id),
    {
      esperando: apuntado?.kind === 'poder' && apuntado.id === id,
      esperar: (si) => s.apuntarPoder(si ? id : null),
      motivo: () => s.motivoDePoder(id),
      ninguna: 'No hay ningún aliado sobre el que usarlo.',
      pide: 'Elige el aliado sobre el que usarlo: pulsa en uno de los marcados, o Escape para cancelar.',
    },
  );
}

/** Los botones de la batalla, los mismos de la partida (`accionesDeLaUnidad`). */
const JUGADA_DE_BOTON = {
  'battle-end-turn': 'end_turn',
  'battle-defend': 'defend',
  'battle-wait': 'wait',
} as const;

document.addEventListener('click', (ev) => {
  const conAccion = (ev.target as Element).closest('[data-action]');
  const accion = conAccion?.getAttribute('data-action');
  // El libro, como en la partida: elegir el hechizo no es una jugada, apuntar sí.
  if (
    accion === 'battle-spell' &&
    sesion !== null &&
    conAccion !== null &&
    conAccion !== undefined
  ) {
    if (!jugadaEnCurso())
      sesion.hechizos.selectSpell(conAccion.getAttribute('data-spell') as string);
    pedirFotograma();
    return;
  }
  if (accion === 'battle-poder') {
    if (ev.detail > 1 || sesion === null || jugadaEnCurso()) return;
    const id = (ev.target as Element).closest('[data-poder]')?.getAttribute('data-poder');
    if (id === null || id === undefined) throw new Error('el botón del poder no dice cuál es');
    usarPoder(sesion, id);
    pedirFotograma();
    return;
  }
  if (accion !== undefined && accion !== null && accion in JUGADA_DE_BOTON) {
    // Un doble clic no son dos jugadas: el segundo caía en el botón ya repintado
    // y cerraba el turno de la SIGUIENTE unidad tuya sin que nadie lo pidiera
    // (M12 de QA). `detail` cuenta los clics seguidos.
    if (ev.detail > 1 || sesion === null || jugadaEnCurso()) return;
    sesion.playBattleAction({ type: JUGADA_DE_BOTON[accion as keyof typeof JUGADA_DE_BOTON] });
    pedirFotograma();
    return;
  }
  if (accion === 'battle-escala') {
    if (ev.detail > 1 || sesion === null || jugadaEnCurso()) return;
    const tipo = (ev.target as Element).closest('[data-escala]')?.getAttribute('data-escala');
    if (tipo !== 'poner_escalera' && tipo !== 'subir') {
      throw new Error(`el botón de la escala trae «${String(tipo)}»`);
    }
    escala(sesion, tipo);
    pedirFotograma();
    return;
  }
  if (accion === 'battle-puerta') {
    if (ev.detail > 1 || sesion === null || jugadaEnCurso()) return;
    const tipo = (ev.target as Element).closest('[data-puerta]')?.getAttribute('data-puerta');
    if (tipo !== 'abrir_puerta' && tipo !== 'cerrar_puerta') {
      throw new Error(`el botón de la puerta trae «${String(tipo)}»`);
    }
    puerta(sesion, tipo);
    pedirFotograma();
    return;
  }
  const el = (ev.target as Element).closest('[data-arena]');
  if (el === null) return;
  const que = el.getAttribute('data-arena');
  const clave = Number(el.getAttribute('data-clave'));
  const unidad = el.getAttribute('data-unidad');
  // Un gesto dentro de una ficha repinta solo esa (en la edición; `repintarFicha`).
  let soloLaFicha: string | null = null;
  let focoTrasElGesto: FocoTrasCerrar | null = null;
  // La ficha cuyo campo del nombre se enfoca ya repintada («✎ Editar»).
  let renombrarTrasElGesto: string | null = null;
  // La etiqueta quitada con el teclado, para dejar el foco en su ficha (M2).
  let quitadaConElTeclado: Quitada | null = null;
  // La ficha recién abierta, que se trae a la vista (M3).
  let abiertaTrasElGesto: string | null = null;
  // La pieza recién elegida o creada, cuya ficha se trae a la vista (I2).
  let piezaTrasElGesto: string | null = null;
  try {
    switch (que) {
      case 'filtro':
        filtro = el.getAttribute('data-faccion') as typeof filtro;
        break;
      case 'añadir': {
        const lado = el.getAttribute('data-lado') as Lado;
        añadir(lado, unidad as string);
        break;
      }
      case 'editar':
        elegida = { kind: 'unidad', id: unidad as string };
        aviso = '';
        break;
      case 'crear-unidad': {
        const select = el.closest('[data-nueva-unidad]')?.querySelector('[data-arena-nueva]');
        if (select === null || select === undefined) {
          throw new Error('el botón «Crear» no está junto a su selector de cuerpo');
        }
        const id = crearUnidad(valorDe(select));
        if (id !== null && escena === 'edicion') {
          const f: FichaEditable = { kind: 'unidad', id };
          const r = abrirFicha(abiertas, f, nombreDeFicha(f));
          if (r.abiertas !== abiertas) abiertaTrasElGesto = claveDeFicha(f);
          abiertas = r.abiertas;
          recordarAbiertas();
        }
        break;
      }
      case 'quitar-pieza': {
        const hueco = el.getAttribute('data-hueco') ?? '';
        if (!esHuecoDeArena(hueco))
          throw new Error(`el × del equipo trae «${hueco}», que no es un hueco`);
        const f = laFichaDe(el, 'quitar una pieza');
        if (f.kind !== 'unidad') throw new Error('solo las unidades llevan equipo que quitar');
        cambiarUnidad(f.id, (u) => quitarEnArena(u, hueco));
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'editar-en-combate':
      case 'ficha-en-la-rueda': {
        if (sesion === null) return;
        const id = el.getAttribute('data-stack');
        const st = sesion.battle.stacks.find((x) => x.id === id);
        if (st === undefined) {
          const boton = que === 'editar-en-combate' ? 'el botón «Editar»' : 'la figura de la rueda';
          throw new Error(`${boton} trae «${String(id)}», que no está en la pelea`);
        }
        // Lo que se edita es el TIPO: la unidad de la que sale, o el héroe de su
        // lado (`tipoDelStack`, que anotó el montaje). Desde la rueda, solo se mira.
        abrirEditor(sesion, st, que === 'ficha-en-la-rueda');
        return;
      }
      case 'cerrar-editor':
        editor.close();
        return;
      case 'poner-heroe': {
        const lado = el.getAttribute('data-lado') as Lado;
        if (ocupados(lado) >= caben) {
          aviso = `El bando ${LADOS[lado].adjetivo} ya lleva ${caben}: no cabe el héroe.`;
          break;
        }
        heroes[lado] = heroePorDefecto(lado);
        elegida = { kind: 'heroe', lado };
        aviso = `El bando ${LADOS[lado].adjetivo} lleva héroe: cambia sus cifras y su libro en la ficha.`;
        break;
      }
      case 'editar-heroe':
        elegida = { kind: 'heroe', lado: el.getAttribute('data-lado') as Lado };
        aviso = '';
        break;
      case 'quitar-heroe': {
        const lado = el.getAttribute('data-lado') as Lado;
        heroes[lado] = null;
        if (elegida?.kind === 'heroe' && elegida.lado === lado) elegida = null;
        break;
      }
      case 'modo': {
        // El modo, por la misma lectura que la URL: uno que no es se dice.
        const parametro = el.getAttribute('data-parametro');
        const d = INTERRUPTORES.find((i) => i.parametro === parametro);
        if (d === undefined) throw new Error(`el botón de modo trae «${String(parametro)}»`);
        modos = conModo(modos, d, modoDeLaURL(d, el.getAttribute('data-modo')));
        reglasALaBarra();
        aviso = '';
        break;
      }
      case 'regla': {
        reglas = conRegla(
          reglas,
          el.getAttribute('data-regla') ?? '',
          el.getAttribute('data-version') ?? '',
        );
        // La URL la lleva ya, para que copiarla repita también el montaje de reglas.
        reglasALaBarra();
        aviso = '';
        break;
      }
      case 'manda':
        iaDelBando[el.getAttribute('data-lado') as Lado] = el.getAttribute('data-ia') === 'si';
        break;
      case 'duplicar': {
        const { lado, p } = puestoPorClave(clave);
        añadir(lado, p.unidad, p.escalera);
        break;
      }
      case 'escalera': {
        const { lado, i, p } = puestoPorClave(clave);
        montaje[lado][i] = { ...p, escalera: !p.escalera };
        break;
      }
      case 'quitar': {
        const { lado, i } = puestoPorClave(clave);
        montaje[lado].splice(i, 1);
        break;
      }
      case 'clip': {
        const k = claveDeFicha(laFichaDe(el, 'el botón del clip'));
        animDeFicha.set(k, {
          ...animDe(k),
          clip: el.getAttribute('data-clip') as CharacterClip,
          inicio: performance.now(),
        });
        pedirFotograma();
        return;
      }
      case 'girar': {
        const k = claveDeFicha(laFichaDe(el, 'el botón de girar'));
        const a = animDe(k);
        animDeFicha.set(k, { ...a, mira: (a.mira + 1) % DIRECCION_DE_HOJA.length });
        pedirFotograma();
        return;
      }
      case 'quitar-habilidad': {
        const h = el.getAttribute('data-habilidad') as string;
        const f = laFichaDe(el, 'quitar una habilidad');
        if (f.kind !== 'unidad') throw new Error('solo las unidades llevan habilidades que quitar');
        quitadaConElTeclado = quitadaDe(el, 'habilidad', h, claveDeFicha(f));
        cambiarUnidad(f.id, (u) => ({
          ...u,
          habilidades: u.habilidades.filter((x) => x !== h),
        }));
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'ir-a-edicion':
        irA('edicion');
        listaPlegada = listaPlegadaTras('entrar', listaPlegada, abiertas.length);
        aviso =
          abiertas.length === 0
            ? 'Abre las fichas que quieras desde la lista: se añaden debajo. Lo que cambies vale para el montaje.'
            : 'Lo que cambies aquí vale para el montaje; «Volver al montaje» lo enseña allí.';
        break;
      case 'volver-de-edicion':
        irA('montaje');
        aviso = 'De vuelta al montaje, con las cifras que hayas cambiado.';
        break;
      case 'ir-a-equipo':
        if (escena === 'equipo') break;
        irA('equipo');
        piezaElegida ??= [...catalogo().piezas.keys()][0] ?? null;
        aviso =
          sesion === null
            ? 'Elige una pieza para cambiarla, o crea una nueva en su hueco: vale para la arena, no para el juego.'
            : EQUIPO_EN_PLENA_PELEA;
        break;
      case 'volver-de-equipo': {
        const vuelta = escenaDeVuelta === 'battle' && sesion === null ? 'montaje' : escenaDeVuelta;
        irA(vuelta);
        if (vuelta === 'battle') {
          // El panel se rehace con las cifras nuevas; la barra, la de la sesión.
          paneles = null;
          principal.remedir();
        }
        aviso = 'De vuelta, con las piezas que hayas cambiado.';
        break;
      }
      case 'elegir-pieza':
        piezaElegida = el.getAttribute('data-pieza');
        piezaTrasElGesto = piezaElegida;
        // En plena pelea la barra sigue recordando qué pasa al cambiar (M4 de QA:
        // al elegir la primera pieza se quedaba en blanco).
        aviso = sesion === null ? '' : EQUIPO_EN_PLENA_PELEA;
        break;
      case 'crear-pieza': {
        // En blanco en el hueco de su botón, o copia de la de la ficha («Duplicar»).
        const hueco = el.getAttribute('data-hueco');
        let desde: HuecoDeArena | Pieza;
        if (hueco === null) desde = piezaDeLaFicha();
        else if (esHuecoDeArena(hueco)) desde = hueco;
        else throw new Error(`«+ Nueva pieza» trae «${hueco}», que no es un hueco`);
        const p = piezaNueva(desde, catalogo(), idsDePiezasSinValidar);
        const dicho =
          typeof desde === 'string'
            ? `Nueva pieza «${p.nombre}», de la arena: cambia sus cifras en la ficha.`
            : [
                `«${p.nombre}», copia de «${desde.nombre}»: es nueva, de la arena.`,
                avisoDeLaCopia(desde, p),
              ]
                .filter((t) => t !== null)
                .join(' ');
        if (cambiarPiezas(p.id, p, dicho)) {
          piezaElegida = p.id;
          piezaTrasElGesto = p.id;
        }
        break;
      }
      case 'retirar-pieza': {
        // Una nueva se borra; una cambiada vuelve a la del juego.
        const p = piezaDeLaFicha();
        const nueva = selloDePieza(p) === 'nueva';
        const dicho = nueva
          ? `Borrada la pieza «${p.nombre}».`
          : `«${p.nombre}» vuelve a la del juego (data/equipo.json).`;
        if (cambiarPiezas(p.id, null, dicho) && nueva) piezaElegida = null;
        break;
      }
      case 'abrir-ficha': {
        if (unidad === null) throw new Error('el botón «Abrir» no dice de qué unidad es');
        const f: FichaEditable = { kind: 'unidad', id: unidadDe(unidad).id };
        const incompleta = porQueNoSeMonta(unidadDe(f.id));
        const r = abrirFicha(abiertas, f, nombreDeFicha(f), incompleta);
        if (r.abiertas !== abiertas) {
          listaPlegada = listaPlegadaTras('abrir', listaPlegada, r.abiertas.length);
          abiertaTrasElGesto = claveDeFicha(f);
        }
        abiertas = r.abiertas;
        aviso = r.aviso;
        recordarAbiertas();
        break;
      }
      case 'cerrar-ficha': {
        const f = laFichaDe(el, 'el × de una ficha');
        if (f.kind === 'heroe') throw new Error('la ficha del héroe no se abre en la edición');
        const k = claveDeFicha(f);
        // Con el teclado, el foco sigue en la ficha de al lado o en su «Abrir»;
        // con el ratón no se mueve (como `pintar`: el Espacio no pulsa nada solo).
        if (el.matches(':focus-visible')) focoTrasElGesto = focoTrasCerrar(abiertas, k);
        abiertas = cerrarFicha(abiertas, k);
        listaPlegada = listaPlegadaTras('cerrar', listaPlegada, abiertas.length);
        // Reabrirla empieza de cero: de pie y mirando a la cámara.
        animDeFicha.delete(k);
        aviso = `${nombreDeFicha(f)}: ficha cerrada.`;
        recordarAbiertas();
        break;
      }
      case 'ver-avisos':
        avisosDesplegados = !avisosDesplegados;
        pintarAvisosDeLectura();
        return;
      case 'cerrar-avisos':
        avisosDesplegados = false;
        pintarAvisosDeLectura();
        // El botón que lo cerró ya no está: el foco, al que lo vuelve a abrir.
        botonVerAvisos.focus();
        return;
      case 'plegar-lista':
        listaPlegada = listaPlegadaTras('alternar', listaPlegada, abiertas.length);
        guardarEnElNavegador(CLAVE_DE_LISTA, listaPlegada ? '1' : '0', QUE_LISTA);
        break;
      case 'renombrar': {
        const k = claveDeFicha(laFichaDe(el, 'el botón de cambiar el nombre'));
        renombrando.add(k);
        soloLaFicha = k;
        renombrarTrasElGesto = k;
        break;
      }
      case 'quitar-rasgo': {
        const t = el.getAttribute('data-rasgo') as CreatureTrait;
        const f = laFichaDe(el, 'quitar un rasgo');
        quitadaConElTeclado = quitadaDe(el, 'rasgo', t, claveDeFicha(f));
        cambiarRasgos(f, (ts) => ts.filter((x) => x !== t));
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'luchar':
        luchar();
        break;
      case 'enlace':
        void copiarEnlace().then(repintarMontaje, (err: unknown) => {
          aviso = `No se ha podido escribir el enlace de la pelea: ${mensaje(err)}.`;
          repintarMontaje();
        });
        return;
      case 'hex-muralla':
        tocarHex({
          col: Number(el.getAttribute('data-col')),
          row: Number(el.getAttribute('data-row')),
        });
        repintarMuralla();
        return;
      case 'herramienta-muralla':
        herramienta = el.getAttribute('data-herramienta') as HerramientaDeMuralla;
        repintarMuralla();
        return;
      case 'plegar-muralla':
        murallaPlegada = !murallaPlegada;
        guardarEnElNavegador(CLAVE_DE_PLEGADO, murallaPlegada ? '1' : '0', QUE_PLEGADO);
        repintarMuralla();
        return;
      case 'vaciar-muralla':
        muralla = SIN_MURALLA;
        aviso = 'Muralla vacía: la pelea será a campo abierto.';
        repintarMuralla();
        return;
      case 'cargar-forma': {
        const f = formaPorNombre(el.getAttribute('data-nombre') as string);
        muralla = f.muralla;
        // Una de ejemplo no se guarda con su nombre: se deja el campo para otro.
        nombreDeForma = esFormaDeEjemplo(f.nombre) ? '' : f.nombre;
        aviso = `Cargada la forma «${f.nombre}».`;
        repintarMuralla();
        return;
      }
      case 'guardar-forma':
        void guardarForma().then(repintarMuralla, (err: unknown) => {
          aviso = `No se ha guardado la muralla: ${mensaje(err)}.`;
          repintarMuralla();
        });
        return;
      case 'borrar-forma': {
        const nombre = el.getAttribute('data-nombre') as string;
        void borrarForma(nombre).then(repintarMuralla, (err: unknown) => {
          aviso = `No se ha borrado la forma «${nombre}»: ${mensaje(err)}.`;
          repintarMuralla();
        });
        return;
      }
      case 'guardar':
        // También desde la edición: repinta la vista en la que se está.
        void guardar().then(
          () => pedirRepintado(),
          (err: unknown) => {
            aviso = `No se ha guardado: ${mensaje(err)}.`;
            pedirRepintado();
          },
        );
        return;
      case 'otra-vez':
        volverAlMontaje();
        return;
      default:
        return;
    }
  } catch (err) {
    aviso = mensaje(err);
    soloLaFicha = null;
  }
  pedirRepintado(soloLaFicha);
  repintarLoPendiente();
  if (focoTrasElGesto !== null) enfocar(focoTrasElGesto);
  if (renombrarTrasElGesto !== null) enfocarElNombre(renombrarTrasElGesto);
  if (quitadaConElTeclado !== null) enfocarTrasQuitar(quitadaConElTeclado);
  if (abiertaTrasElGesto !== null) traerALaVista(abiertaTrasElGesto);
  if (piezaTrasElGesto !== null) traerLaPiezaALaVista(piezaTrasElGesto);
});

/**
 * Una etiqueta (rasgo o habilidad) quitada con el teclado: de qué ficha, cuál y
 * la siguiente de su grupo (`focoTrasQuitar`), leída del marcado de antes de
 * repintar, que es el orden que se veía.
 */
interface Quitada {
  readonly clave: string;
  readonly que: 'rasgo' | 'habilidad';
  readonly quitada: string;
  readonly siguiente: string | null;
}

/**
 * La `Quitada` del × `el`, o `null` si se pulsó con el ratón: entonces el foco
 * no se mueve, como en `pintar` (un botón pulsado con el ratón no lo conserva).
 */
function quitadaDe(
  el: Element,
  que: Quitada['que'],
  quitada: string,
  clave: string,
): Quitada | null {
  if (!el.matches(':focus-visible')) return null;
  const grupo = el.closest('.etiquetas');
  if (grupo === null) throw new Error(`el × de «${quitada}» no está en ningún grupo de etiquetas`);
  const orden = [...grupo.querySelectorAll(`[data-arena="quitar-${que}"]`)].map(
    (b) => b.getAttribute(`data-${que}`) as string,
  );
  return { clave, que, quitada, siguiente: focoTrasQuitar(orden, quitada) };
}

/**
 * Ya repintada la ficha, el foco al × de la etiqueta siguiente o, si no queda,
 * al desplegable «Añadir» de su grupo. Si la etiqueta sigue ahí, el cambio no
 * entró («No se cambia: …») y `pintar` ya dejó el foco en su ×.
 */
function enfocarTrasQuitar(q: Quitada): void {
  const ficha = raizVisible().querySelector(`[data-clave-de-ficha="${CSS.escape(q.clave)}"]`);
  if (ficha === null) throw new Error(`tras quitar «${q.quitada}» no se ve la ficha «${q.clave}»`);
  const x = (v: string): string =>
    `[data-arena="quitar-${q.que}"][data-${q.que}="${CSS.escape(v)}"]`;
  if (ficha.querySelector(x(q.quitada)) !== null) return;
  const quien = q.siguiente === null ? `select[data-arena-${q.que}]` : x(q.siguiente);
  const destino = ficha.querySelector<HTMLElement>(quien);
  if (destino === null)
    throw new Error(`tras quitar «${q.quitada}» no hay adónde llevar el foco (${quien})`);
  destino.focus();
}

/**
 * Trae a la vista la ficha recién abierta (M3 de QA): con la lista desplegada
 * encima, caía bajo la barra de estado o varias pantallas más abajo y lo único
 * que respondía era «Abierta» en el botón. Su cabecera queda arriba de la vista
 * (`scroll-margin-top` en el CSS); si ya se ve entera, no se mueve. La lista no
 * se pliega.
 */
function traerALaVista(clave: string): void {
  const ficha = elEdicion.querySelector(`article[data-clave-de-ficha="${CSS.escape(clave)}"]`);
  if (ficha === null) throw new Error(`la ficha «${clave}» recién abierta no se ha pintado`);
  const caja = ficha.getBoundingClientRect();
  const vista = elEdicion.getBoundingClientRect();
  const barra = elBarraDeEstado.getBoundingClientRect().top;
  if (caja.top >= vista.top && caja.bottom <= Math.min(vista.bottom, barra)) return;
  ficha.scrollIntoView({ block: 'start' });
}

/**
 * Trae a la vista la ficha de la pieza recién elegida o creada (I2 de QA): en una
 * columna (390 px) quedaba debajo de toda la lista, ~800 px más abajo, y al
 * pulsar una pieza no se veía que pasara nada. En dos columnas va pegada arriba y
 * ya se ve: no se mueve.
 */
function traerLaPiezaALaVista(id: string): void {
  const ficha = elEquipo.querySelector(`[data-pieza-elegida="${CSS.escape(id)}"]`);
  if (ficha === null) throw new Error(`la ficha de la pieza «${id}» no se ha pintado`);
  // Si ya empieza en lo alto de la vista, no se mueve: la ficha entera es más alta
  // que un móvil, y en dos columnas, pegada arriba, saltaría a cada clic. Con solo
  // la cabecera asomando abajo, los campos seguían fuera de la vista.
  const arriba = ficha.getBoundingClientRect().top;
  const barra = elBarraDeEstado.getBoundingClientRect().top;
  if (arriba >= 0 && arriba <= barra * ALTO_DE_LA_FICHA_A_LA_VISTA) return;
  ficha.scrollIntoView({ block: 'start' });
}
/** Hasta qué fracción de la vista puede empezar la ficha de una pieza sin traerla arriba. */
const ALTO_DE_LA_FICHA_A_LA_VISTA = 0.4;

/** La raíz de lo que se ve: donde se busca un elemento de una ficha tras repintarla. */
function raizVisible(): HTMLElement {
  return escena === 'edicion' ? elEdicion : escena === 'montaje' ? elFicha : elFichaDelEditor;
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
function campoDelNombre(el: EventTarget | null): CampoDelNombre | null {
  return el instanceof Element && el.matches('input.renombrar') ? (el as CampoDelNombre) : null;
}

/** Enfoca el campo del nombre de la ficha `clave`, con el nombre seleccionado para escribir encima. */
function enfocarElNombre(clave: string): void {
  const campo = campoDelNombre(
    raizVisible().querySelector(`[data-clave-de-ficha="${CSS.escape(clave)}"] input.renombrar`),
  );
  if (campo === null) throw new Error(`la ficha «${clave}» no ha pintado el campo de su nombre`);
  campo.focus();
  campo.select();
}

/**
 * Las teclas del campo del nombre: Intro lo guarda y Escape deja el de antes; en
 * los dos casos el campo se suelta y el título vuelve. Guardar es soltar el foco:
 * el `change` que dispara es el mismo de cualquier campo (`cambiarEnFicha`). Va
 * antes que las teclas de la pelea y las corta: en el editor de la batalla,
 * Escape cerraba el diálogo entero.
 */
document.addEventListener(
  'keydown',
  (ev) => {
    const el = campoDelNombre(ev.target);
    if (el === null) return;
    if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    // Con el valor de antes, soltar el foco no dispara `change`: no se cambia nada.
    if (ev.key === 'Escape') el.value = el.defaultValue;
    el.blur();
  },
  { capture: true },
);

/**
 * El campo del nombre suelto: la ficha vuelve a su título. Se mira en la tarea
 * siguiente, no al soltarlo: un repintado de la ficha (otro gesto) sustituye el
 * campo y `pintar` le devuelve el foco al nuevo, y entonces se sigue renombrando.
 */
document.addEventListener('focusout', (ev) => {
  const el = campoDelNombre(ev.target);
  if (el === null) return;
  const clave = claveDelElemento(el);
  if (clave === null) return;
  setTimeout(() => {
    const ahora = campoDelNombre(document.activeElement);
    const sigue = ahora !== null && claveDelElemento(ahora) === clave;
    if (sigue || !renombrando.delete(clave)) return;
    pedirRepintado(clave);
  }, 0);
});

document.addEventListener('change', (ev) => {
  const el = ev.target as Element;
  // Un campo de la ficha de una pieza (vista de equipo): no es de ninguna unidad.
  if (el.getAttribute('data-arena-pieza-campo') !== null) {
    cambiarCampoDePieza(el);
    pedirRepintado();
    return;
  }
  // El nombre de la forma no es de ninguna unidad: se apunta y nada más.
  if (el.getAttribute('data-muralla-nombre') !== null) {
    nombreDeForma = valorDe(el);
    return;
  }
  // Escribe en la ficha que contiene el campo, no en `elegida`: en la edición hay
  // hasta cuatro. Lo que no está en una ficha no es de ninguna unidad.
  const ficha = fichaDelElemento(el);
  if (ficha !== null) cambiarEnFicha(ficha, el);
});

/** Un campo, un rasgo o una habilidad de la ficha `ficha`, y su repintado. */
function cambiarEnFicha(ficha: Elegida, el: Element): void {
  switch (ficha.kind) {
    case 'unidad':
      cambiarDeLaUnidad(ficha.id, el);
      break;
    case 'heroe':
      cambiarDelHeroe(ficha.lado, el);
      break;
    default: {
      const nunca: never = ficha;
      throw new Error(`una ficha de un tipo que no existe: ${JSON.stringify(nunca)}`);
    }
  }
  pedirRepintado(claveDeFicha(ficha));
}

/**
 * Los rasgos del motor de la ficha `f`, cambiados por `cambio` (añadir uno del
 * desplegable o quitar una etiqueta): su tipo en el borrador. Lo que no vale lo
 * dice el mismo validador de siempre (`cambiarUnidad`).
 */
function cambiarRasgos(
  f: Elegida,
  cambio: (ts: readonly CreatureTrait[]) => readonly CreatureTrait[],
): void {
  switch (f.kind) {
    case 'unidad':
      cambiarUnidad(f.id, (u) => ({ ...u, traits: cambio(u.traits) }));
      return;
    case 'heroe':
      throw new Error('la ficha del héroe no lleva rasgos del motor');
  }
}

/** El rasgo elegido en el desplegable «Añadir» de los rasgos, al final de los puestos. */
function añadirRasgo(f: Elegida, el: Element): void {
  const t = valorDe(el);
  if (t !== '') cambiarRasgos(f, (ts) => [...ts, t as CreatureTrait]);
}

/** Un campo de la ficha de una unidad: su tipo en el borrador. */
function cambiarDeLaUnidad(id: string, el: Element): void {
  const campo = el.getAttribute('data-campo');
  const hueco = el.getAttribute('data-arena-pieza');
  if (campo !== null) {
    cambiarUnidad(id, (u) => conCampo(u, campo, valorDe(el)));
  } else if (hueco !== null) {
    // Ponerle una pieza: lo que no se puede (un escudo con un arma a dos manos)
    // lo dice el núcleo (`manosBlocker`) y sale en la barra.
    const puesta = valorDe(el);
    if (puesta !== '') cambiarUnidad(id, (u) => equiparEnArena(u, puesta, catalogo()));
  } else if (el.getAttribute('data-arena-rasgo') !== null) {
    añadirRasgo({ kind: 'unidad', id }, el);
  } else if (el.getAttribute('data-arena-habilidad') !== null) {
    const h = valorDe(el);
    if (h !== '') cambiarUnidad(id, (u) => ({ ...u, habilidades: [...u.habilidades, h] }));
  }
}

/** Un campo de la ficha del héroe. */
function cambiarDelHeroe(lado: Lado, el: Element): void {
  const campo = el.getAttribute('data-heroe-campo');
  const hechizo = el.getAttribute('data-heroe-hechizo');
  if (campo !== null) {
    const v = valorDe(el);
    cambiarHeroe(lado, (h) => {
      switch (campo) {
        case 'nombre':
          return { ...h, nombre: v };
        case 'figura':
          return { ...h, figura: v === '' ? null : v };
        case 'ataque':
        case 'defensa':
        case 'poder':
        case 'conocimiento':
          return { ...h, [campo]: v.trim() === '' ? Number.NaN : Number(v) };
        default:
          throw new Error(`la ficha del héroe no tiene un campo «${campo}»`);
      }
    });
  } else if (hechizo !== null) {
    const puesto = marcadoDe(el);
    cambiarHeroe(lado, (h) => ({
      ...h,
      hechizos: puesto
        ? allSpells()
            .map((s) => s.id)
            .filter((id) => id === hechizo || h.hechizos.includes(id))
        : h.hechizos.filter((id) => id !== hechizo),
    }));
  }
}

document.addEventListener('keydown', (ev) => {
  // Con el editor abierto, las teclas son suyas: Escape lo cierra (el `<dialog>`)
  // sin soltar lo elegido, y un espacio en un campo no cierra el turno. Con la
  // rueda, igual: son suyas.
  if (editor.open || elRueda.open) return;
  // Fuera del tablero —la vista de equipo a media pelea— las teclas no juegan:
  // un espacio en un campo de pieza cerraba el turno de tu unidad.
  if (escena !== 'battle') return;
  // Escape suelta el hechizo elegido, como en la partida, o el poder que espera.
  if (ev.key === 'Escape' && sesion !== null && !jugadaEnCurso()) {
    sesion.hechizos.clearSpell();
    if (sesion.apuntado?.kind === 'poder') {
      sesion.apuntarPoder(null);
      sesion.status = '';
    }
    pedirFotograma();
    return;
  }
  // Espacio cierra el turno de tu unidad activa, como en la partida; con el foco
  // en un botón, Espacio pulsa ese botón.
  const enUnBoton = ev.target instanceof Element && ev.target.closest('button') !== null;
  if (ev.key !== ' ' || sesion === null || enUnBoton) return;
  ev.preventDefault();
  if (!ev.repeat && sesion.turnoPropio !== null && !jugadaEnCurso()) {
    sesion.playBattleAction({ type: 'end_turn' });
  }
  pedirFotograma();
});

// Cerrar el editor (su botón o Escape) vuelve a la batalla tal como estaba: no
// toca la sesión, solo repinta el panel con las cifras nuevas. Abierto desde la
// rueda, vuelve a ella (seguía abierta debajo, en su fase), y el editor recobra
// su título y su botón de cambiar cifras.
editor.addEventListener('close', () => {
  if (fichaDeLaRueda) {
    fichaDeLaRueda = false;
    elTituloDelEditor.textContent = TEXTOS_DEL_EDITOR.titulo;
    botonCerrarEditor.textContent = TEXTOS_DEL_EDITOR.cerrar;
  }
  pedirFotograma();
});

// Las dos lecturas no dependen una de otra: van a la vez.
Promise.all([arrancar(), arrancarMurallas()]).then(
  ([, avisoDeMurallas]) => {
    const delEnlace = montarDelEnlace();
    // Las fichas abiertas la última vez: solo las que aún se abren (la hoja está
    // y está entera).
    const recordadas = leerAbiertas(
      leerDelNavegador(CLAVE_DE_ABIERTAS, QUE_ABIERTAS),
      (f) =>
        (borrador.has(f.id) || hojasPorId.has(f.id)) && porQueNoSeMonta(unidadDe(f.id)) === null,
    );
    abiertas = recordadas.abiertas;
    listaPlegada = listaPlegadaTras(
      'entrar',
      leerDelNavegador(CLAVE_DE_LISTA, QUE_LISTA) === '1',
      abiertas.length,
    );
    const deAbiertas = recordadas.aviso === '' ? '' : ` ${recordadas.aviso}`;
    if (delEnlace?.montado && sinBorradorDeUnidades !== null) {
      const { ruta, dicho } = sinBorradorDeUnidades;
      if (!aviso.startsWith(dicho))
        throw new Error('la barra del borrador no empieza por su primera frase');
      aviso = `Sin borrador guardado todavía (${ruta}): «Guardar» lo crea.${aviso.slice(dicho.length)}`;
    }
    aviso = delEnlace?.montado
      ? `${delEnlace.aviso}${aviso}${avisoDeIncompletas}${avisoDeMurallas}${deAbiertas}`
      : `${avisoDeSemilla}${delEnlace?.aviso ?? ''}${aviso}${avisoDeIncompletas}${avisoDeMurallas} Añade unidades a los dos bandos y pulsa Luchar.${deAbiertas}`;
    // Lo leído con avisos se despliega solo, para que se lea antes de «Guardar».
    avisosDesplegados = cuantosAvisos(avisosDeLectura) > 0;
    pintarAvisosDeLectura();
    repintarMontaje();
  },
  (err: unknown) => {
    console.error('[arena] no ha arrancado', err);
    aviso = `La arena no ha podido arrancar: ${mensaje(err)}`;
    elStatus.textContent = aviso;
  },
);
