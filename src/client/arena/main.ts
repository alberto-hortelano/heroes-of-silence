/**
 * La arena (`/arena/`, `pnpm arena`): se montan dos bandos con las hojas de las
 * cinco facciones, se cambian sus cifras, se elige quién mueve cada unidad y se
 * pelea con el mismo tablero y los mismos controles que la partida.
 *
 * Aquí solo se conecta: las reglas las aplica `SesionDeArena` (en
 * `sesion/sesion-de-arena.ts`, de la única puerta del cliente al núcleo, `sesion/`), el
 * ratón del tablero lo traduce `EscenaBatalla` —la misma de la partida— y el marcado
 * sale de `paneles/`.
 * Las cifras se guardan en el catálogo de unidades del repo a través del servidor de
 * desarrollo (`vite.config.ts`); sin él la página lo dice y sigue sirviendo para
 * pelear.
 */

import { IA_POR_DEFECTO } from '@core/arena/enlace.js';
import {
  type HeroeDeArena,
  heroeDeArena,
  heroePorDefecto,
  laLlevaElHeroe,
  validarHeroeDeArena,
} from '@core/arena/heroe.js';
import { LADOS, type Lado } from '@core/arena/lados.js';
import { topeDelBandoBlocker } from '@core/arena/montaje.js';
import { esFormaDeEjemplo } from '@core/arena/murallas.js';
import {
  cambioDePiezas,
  conBase,
  conPiezas,
  enElHueco,
  equiparEnArena,
  escritaDe,
  piezaNueva,
  piezaSobre,
  quitarEnArena,
} from '@core/arena/piezas.js';
import type { RetoqueDeArena } from '@core/arena/retoque.js';
import { murallaVacia } from '@core/battle/muralla.js';
import { COMBATE_COMPLETO, type ReglasDelCombate } from '@core/combate.js';
import { type CatalogoDeEquipo, EQUIPO_DEL_JUEGO } from '@core/equipo/atado.js';
import {
  conLosExtras,
  DONDE_SE_CONSIGUE,
  type ExtrasDePieza,
  esPiezaConBase,
  extrasDe,
  type Pieza,
  type PiezaEscrita,
  validarPieza,
} from '@core/equipo/pieza.js';
import { idsPuestos } from '@core/equipo/vestir.js';
import { type CuerpoDeTodoHeroe, combateDelHeroe, HEROE } from '@core/hero/cuerpo-del-heroe.js';
import { todosLosHechizos } from '@core/magia/catalogo.js';
import { DESPEJADO } from '@core/state/clima.js';
import {
  CIFRAS_DE_PIEZA,
  type CreatureTrait,
  esHueco,
  esHuecoDePieza,
  esTipoDelAnillo,
  type HuecoDePieza,
} from '@core/types.js';
import { type Unidad, validarUnidad } from '@core/unidad/formato.js';
import { unaVezEnLaURL } from '@core/validar.js';
import { FIGURA } from '../../shared/arte.js';
import { EscenaBatalla } from '../batalla/escena.js';
import { GestosDeBatalla } from '../batalla/gestos.js';
import { DialogoDeLaRueda } from '../batalla/rueda/dialogo.js';
import { bucleDeDibujo } from '../comun/bucle.js';
import { mensajeDe } from '../comun/errores.js';
import { html, pintar } from '../comun/html.js';
import { semillaSorteada } from '../comun/semilla.js';
import { cargarArte } from '../render/assets.js';
import { COLOR_BANDO } from '../render/batalla/bandos.js';
import type { CharacterClip } from '../render/figuras/character.js';
import type { Direccion } from '../render/figuras/direccion.js';
import {
  claveDelDibujo,
  colocarFigura,
  type Figura,
  hayFigurasAnimadas,
  pintarFigura,
  pintarSombraDeFigura,
} from '../render/figuras/figura.js';
import {
  arteDe,
  DIRECCION_DE_HOJA,
  hojaDe,
  INDICE_DE_HOJA,
  MIRADA_DE_PRESENTACION,
} from '../render/figuras/personajes.js';
import { ajustarLienzo } from '../render/lienzo.js';
import { COLOR_NEUTRO } from '../render/palette.js';
import { type LadoDeSesion, SesionDeArena } from '../sesion/sesion-de-arena.js';
import { pintarSiguiendoElFinal } from '../views/al-final.js';
import { AVISO_DE_ESPERA } from '../views/cifras.js';
import { leerElCombate, selectoresDelCombate } from '../views/combate.js';
import {
  arrancar,
  catalogoDeMagia,
  cuerpoSinGuardar,
  guardar,
  hechizosQueValen,
  hechizosSinGuardar,
  instalarElAvisoAlCerrar,
  listaDeUnidades,
  nombreDeFigura,
  piezasSinGuardar,
  porQueNoSeMonta,
  tarjetasDeLaLista,
  unidadDe,
} from './catalogo.js';
import {
  abiertasATexto,
  abrirFicha,
  cerrarFicha,
  claveDeFicha,
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
  arrancarMurallas,
  borrarForma,
  formaPorNombre,
  guardarForma,
  pintarMuralla,
  repintarMuralla,
  tocarHex,
} from './editor-de-muralla.js';
import {
  aLaBarraDeLaArena,
  copiarEnlace,
  enlaceVigente,
  leerLaURL,
  montarDelEnlace,
} from './enlace.js';
import {
  abrirEditor,
  campoDelNombre,
  claveDelElemento,
  fichaAbierta,
  fichaDelElemento,
  fichaElegida,
  instalarElCierreDelEditor,
  laFichaDe,
  nombreDeFicha,
  pintarEditor,
} from './fichas.js';
import { montarEditorDeMagia } from './magia.js';
import {
  añadir,
  crearUnidad,
  describir,
  fuenteDeArena,
  heroesDeLaPagina,
  ocupados,
  puestoPorClave,
  quienUsaElHechizo,
} from './montaje.js';
import {
  type AnimDeFicha,
  type Escena,
  type EstadoDeLaPelea,
  type EstadoDeLaVista,
  type EstadoDelCatalogo,
  type EstadoDelEditorDeMuralla,
  type EstadoDelMontaje,
  elementosDeLaArena,
  type PaginaDeLaArena,
} from './pagina.js';
import { type Elegida, renderBando, renderEnlace } from './paneles/bandos.js';
import { caraDeLaArena, renderPanelDeBatalla, rotuloDelTurno } from './paneles/batalla.js';
import { LA_LLEVA_EL_HEROE, renderEquipo, sinGuardarEnPalabras } from './paneles/equipo.js';
import { focoTrasQuitar } from './paneles/ficha.js';
import { renderCatalogo } from './paneles/lista.js';
import type { HerramientaDeMuralla } from './paneles/muralla.js';

const elementos = elementosDeLaArena();
const {
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
  elCombate,
  elMontaje,
  elEdicion,
  elEquipo,
  elMagia,
  botonVolverDeEquipo,
  editor,
  elRueda,
  elFichaDelEditor,
  elTituloDelEditor,
  botonCerrarEditor,
  elBando,
  botonVolverDeMagia,
} = elementos;

/**
 * El bucle de dibujo (`comun/bucle.ts`), con la red de la arena: un fallo al pintar se
 * escribe en la barra y no se pide otro fotograma hasta el siguiente gesto. Va aquí arriba
 * porque lo recogen desde el principio los gestos y la rueda; lo que pinta, `render`, en
 * «dibujo».
 */
const pedirFotograma = bucleDeDibujo({
  pintar: render,
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
    repintar();
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
/** Lo que se queda quieto el último fotograma antes de repetir un clip que no va en bucle. */
const PAUSA_DE_LA_FICHA_MS = 700;
const ANIM_DE_PARTIDA: AnimDeFicha = {
  clip: 'idle',
  inicio: 0,
  mira: INDICE_DE_HOJA[MIRADA_DE_PRESENTACION],
};
function animDe(clave: string): AnimDeFicha {
  return vista.animDeFicha.get(clave) ?? ANIM_DE_PARTIDA;
}

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
function irA(e: Escena): void {
  if ((e === 'equipo' || e === 'magia') && vista.escena !== 'equipo' && vista.escena !== 'magia') {
    vista.escenaDeVuelta = vista.escena;
  }
  vista.escena = e;
  app.dataset.escena = e;
  elDay.textContent = ROTULO_DE_ESCENA[e];
  elTurn.textContent = '';
  botonVolverDeEquipo.textContent = VUELTA_DE_EQUIPO[vista.escenaDeVuelta];
  botonVolverDeMagia.textContent = VUELTA_DE_EQUIPO[vista.escenaDeVuelta];
  vistaALaBarra();
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
function vistaALaBarra(): void {
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
function avisoAlEntrar(v: VistaEnLaURL): string {
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
function vistaDeLaURL(): {
  readonly vista: VistaEnLaURL | null;
  readonly pieza: string | null;
  readonly aviso: string;
} {
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

const pelea: EstadoDeLaPelea = {
  sesion: null,
  fichaDeLaRueda: false,
  colocarElMarco: false,
  paneles: null,
};

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

const editorDeMuralla: EstadoDelEditorDeMuralla = {
  muralla: murallaVacia('piedra'),
  herramienta: 'muro',
  nombreDeForma: '',
  formasGuardadas: [],
  murallasSinGuardado: null,
  murallaPlegada: leerDelNavegador(CLAVE_DE_PLEGADO, QUE_PLEGADO) === '1',
};

/** Las fichas abiertas de la edición, en su orden. */
const CLAVE_DE_ABIERTAS = 'arena.fichas-abiertas';
const QUE_ABIERTAS = 'las fichas abiertas';

function recordarAbiertas(): void {
  guardarEnElNavegador(CLAVE_DE_ABIERTAS, abiertasATexto(vista.abiertas), QUE_ABIERTAS);
}

/** Si la lista de la edición va plegada: lo único que la cambia es su botón. */
const CLAVE_DE_LISTA = 'arena.edicion.lista-plegada';
const QUE_LISTA = 'si la lista de la edición va plegada';

/** La URL con que se abrió la página: lo que pide se lee al cargar (`leerLaURL`), en este sitio. */
const parametros = new URLSearchParams(location.search);
leerLaURL(montaje, parametros);

// ---------------------------------------------------------------- arranque

// ---------------------------------------------------------------- muralla

// ---------------------------------------------------------------- montaje

function repintarMontaje(): void {
  pintarVista(elMontaje, () => {
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
function pintarVista(raiz: Element, pintarla: () => void): void {
  pintarla();
  recogerFiguras(raiz);
  pedirFotograma();
}

/** La vista de edición: la lista con «Abrir» y las fichas abiertas. */
function repintarEdicion(): void {
  pintarVista(elEdicion, () => {
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
function repintarEquipo(): void {
  pintarVista(elEquipo, () => {
    pintar(
      elEquipo,
      renderEquipo({
        piezas: catalogo.equipo,
        elegida: vista.piezaElegida,
        llevan: quienesLaLlevan,
        rechazo: vista.aviso === vista.rechazado ? vista.aviso : null,
        enCombate: pelea.sesion !== null,
        sinGuardar: sinGuardarEnPalabras(
          piezasSinGuardar(catalogo).length,
          catalogo.unidadesSinGuardar.size,
          cuerpoSinGuardar(catalogo),
        ),
      }),
    );
    vistaALaBarra();
  });
}

/**
 * Quiénes llevan la pieza `id`: las unidades del catálogo, por su nombre, todo
 * héroe si es de su equipo base (`laLlevaElHeroe`: la Espada y el gambesón) y los
 * héroes de los bandos que la llevan puesta.
 */
function quienesLaLlevan(id: string): string[] {
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
 * Pone la pieza `nueva` en lugar de la de id `id` —o la borra, con `null`—, o dice
 * por qué no y no toca nada. Entra si lo deja la regla del cambio
 * (`cambioDePiezas`: el catálogo que queda vale, y ninguna unidad del catálogo ni
 * el equipo base del héroe dejan de valer) y, en
 * plena pelea, la de la batalla (`retocarEnBatalla`, `kind: 'piezas'`), como un
 * cambio de unidad en plena pelea (`cambiarUnidad`).
 */
function cambiarPiezas(id: string, nueva: PiezaEscrita | null, texto: string): boolean {
  const escritas = [...catalogo.equipo.escritas.values()];
  const cambio = cambioDePiezas(
    catalogo.equipo,
    nueva === null ? escritas.filter((p) => p.id !== id) : conPiezas(escritas, [nueva]),
    [...catalogo.unidadesDelCatalogo.values()],
    heroesDeLaPagina(montaje),
  );
  if ('motivo' in cambio) {
    noSeCambia(`${cambio.motivo}.`);
    return false;
  }
  const enLaPelea = retocarLaPelea({ kind: 'piezas', equipo: cambio.equipo });
  if (enLaPelea !== null) {
    noSeCambia(enLaPelea);
    return false;
  }
  catalogo.equipo = cambio.equipo;
  avisoTrasCambio(texto);
  return true;
}

/**
 * La pieza `p` (como está escrita) con el campo `campo` de su ficha cambiado a
 * `valor`, sin validar: lo valida el núcleo. Las cifras se cambian en unos extras
 * (`conCifraDePieza`): con base, los suyos, lo que suma encima de la base; entera,
 * lo que suma (`extrasDe`, y de vuelta `conLosExtras`). La base la cambia
 * `conBase`, que conserva lo que suma.
 */
function conCampoDePieza(
  p: PiezaEscrita,
  campo: string,
  valor: string,
  eq: CatalogoDeEquipo,
): unknown {
  // Vacío es `NaN`, y el núcleo lo dice («tiene que ser un entero ≥ 0 y no es un número»).
  const n = valor.trim() === '' ? Number.NaN : Number(valor);
  switch (campo) {
    case 'nombre':
      return { ...p, nombre: valor.trim() };
    case 'base':
      return conBase(p, valor === '' ? null : valor, eq);
    case 'se-consigue-armeria':
    case 'se-consigue-botin': {
      // Una casilla por sitio: marcada, se consigue ahí; el resto, como estaba.
      const donde = campo === 'se-consigue-armeria' ? 'armeria' : 'botin';
      const antes = p.seConsigue;
      const ahora = valor === 'true' ? [...antes, donde] : antes.filter((d) => d !== donde);
      return { ...p, seConsigue: DONDE_SE_CONSIGUE.filter((d) => ahora.includes(d)) };
    }
    case 'hueco':
    case 'manos':
    case 'lanza':
    case 'guerra':
    case 'tiro':
    case 'recarga':
    case 'cargas':
      if (esPiezaConBase(p)) {
        throw new Error(
          `«${p.nombre}» está sobre otra: su hueco, sus manos, si es una lanza o de guerra y lo que tira son los de su base`,
        );
      }
      // Lo que tira (02-11-2026): con él, lo que exige (`enElHueco` pone su agilidad,
      // su recarga o sus cargas); sin él, un arco o una ballesta, sin nada de eso.
      if (campo === 'tiro') {
        const { tiro: _t, recarga: _r, cargas: _c, agilidad: _a, ...sin } = p;
        return valor === 'fuego' || valor === 'granada'
          ? enElHueco({ ...sin, tiro: valor }, p.hueco)
          : sin;
      }
      if (campo === 'recarga') return { ...p, recarga: n };
      if (campo === 'cargas') return { ...p, cargas: n };
      if (campo === 'manos') return { ...p, manos: n };
      if (campo === 'lanza') {
        const { lanza: _antes, ...sin } = p;
        return valor === 'true' ? { ...sin, lanza: true } : sin;
      }
      if (campo === 'guerra') {
        const { guerra: _antes, ...sin } = p;
        return valor === 'true' ? { ...sin, guerra: true } : sin;
      }
      // Lo que el hueco exige va con él (`enElHueco`): una pasada a escudo deja lo
      // que el escudo no suma, y un arma lleva su rueda sin pedirlo aparte.
      if (!esHuecoDePieza(valor)) throw new Error(`«${valor}» no es el hueco de una pieza`);
      return enElHueco(p, valor);
  }
  if (esPiezaConBase(p)) return { ...p, extras: conCifraDePieza(p.extras, campo, n) };
  return conLosExtras(p, conCifraDePieza(extrasDe(p), campo, n));
}

/**
 * Unos extras con la cifra `campo` de la ficha de una pieza a `n`: el precio en
 * oro, una cifra o el nivel de un tipo de la rueda
 * (`rueda-<tipo>`; con base, lo que sube el de la base).
 */
function conCifraDePieza(x: ExtrasDePieza, campo: string, n: number): ExtrasDePieza {
  if (campo.startsWith('rueda-')) {
    const tipo = campo.slice('rueda-'.length);
    if (!esTipoDelAnillo(tipo)) {
      throw new Error(`la ficha de la pieza no tiene una fila de la rueda «${tipo}»`);
    }
    return { ...x, rueda: { ...x.rueda, [tipo]: n } };
  }
  if (campo === 'precio-gold') return { ...x, oro: n };
  // Las cifras, las de la lista (`CIFRAS_DE_PIEZA`): escritas a mano aquí se quedó
  // fuera la agilidad de la montura (26-10-2026).
  if ((CIFRAS_DE_PIEZA as readonly string[]).includes(campo)) return { ...x, [campo]: n };
  throw new Error(`la ficha de la pieza no tiene un campo «${campo}»`);
}

/** Un campo de la ficha de la pieza: la pieza cambiada, si vale y no rompe a nadie. */
function cambiarCampoDePieza(
  el: Element,
  // Una casilla de marcar dice si está marcada; las demás, lo escrito.
  valor: string = (el as { type?: unknown }).type === 'checkbox'
    ? String(marcadoDe(el))
    : valorDe(el),
): void {
  const id = el.closest('[data-pieza-elegida]')?.getAttribute('data-pieza-elegida');
  const campo = el.getAttribute('data-arena-pieza-campo');
  if (id === null || id === undefined || campo === null) {
    throw new Error('un campo de pieza fuera de la ficha de una pieza');
  }
  try {
    const eq = catalogo.equipo;
    const nueva = validarPieza(conCampoDePieza(escritaDe(eq, id), campo, valor, eq));
    cambiarPiezas(
      id,
      nueva,
      `«${nueva.nombre}» cambiada: «Guardar» la escribe en data/equipo.json.`,
    );
  } catch (err) {
    noSeCambia(`${mensajeDe(err)}.`);
  }
}

/** La pieza de la ficha de equipo: la elegida, o lanza si no hay ninguna (el botón no estaría). */
function piezaDeLaFicha(): Pieza {
  if (vista.piezaElegida === null) throw new Error('no hay ninguna pieza elegida en la ficha');
  return catalogo.equipo.pieza(vista.piezaElegida);
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
    vista.escena === 'edicion' && f.kind !== 'heroe'
      ? elEdicion.querySelector(`article[data-clave-de-ficha="${CSS.escape(clave)}"]`)
      : null;
  if (marco === null || f.kind === 'heroe') repintar();
  else pintarVista(elEdicion, () => pintar(marco, interiorDeFichaAbierta(fichaAbierta(pagina, f))));
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
    vista.figuras.push({
      lienzo,
      ctx,
      id,
      clave: lienzo.getAttribute('data-ficha-clip') === 'si' ? claveDelElemento(lienzo) : null,
      lado: lado === 'izquierda' || lado === 'derecha' ? lado : null,
      rotulo: nombreDeFigura(catalogo, id).slice(0, 3),
    });
    vigiaDeFiguras?.observe(lienzo);
  }
}

/** Ninguna figura que animar (se ha cerrado lo que las tenía). */
function soltarFiguras(): void {
  vista.figuras = [];
  vigiaDeFiguras?.disconnect();
  vista.enPantalla.clear();
}
const vigiaDeFiguras =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((cambios) => {
        for (const c of cambios) {
          if (c.isIntersecting) vista.enPantalla.add(c.target);
          else vista.enPantalla.delete(c.target);
        }
        pedirFotograma();
      });

/**
 * En plena pelea, un cambio entra antes en la batalla (`SesionDeArena.retocar`):
 * devuelve por qué no entra, y entonces no se escribe nada —ni el catálogo ni el
 * héroe—; `null` si ha entrado o si no hay pelea que retocar.
 */
function retocarLaPelea(r: RetoqueDeArena): string | null {
  return pelea.sesion === null ? null : pelea.sesion.retocar(r);
}

/**
 * El aviso de un cambio que no entra. Se guarda también aparte (`rechazado`):
 * el editor lo pinta en el color del rechazo mientras siga siendo el aviso.
 */
function noSeCambia(motivo: string): void {
  // Con la mayúscula siempre: la sesión ya da el motivo como frase y lo que lanza
  // el validador empieza en minúscula (M3 de QA: salían de las dos maneras).
  vista.aviso = `No se cambia: ${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}`;
  vista.rechazado = vista.aviso;
  // En plena pelea la barra de abajo es la de la sesión: se quedaba con el
  // «Cambiado: vale ya en esta pelea.» del cambio anterior, justo lo contrario
  // de lo que decía el editor (H5 de QA del ciclo 2).
  if (pelea.sesion !== null) pelea.sesion.status = vista.aviso;
}
/** La barra de la vista de equipo a media pelea, hasta el primer cambio. */
const EQUIPO_EN_PLENA_PELEA =
  'En plena pelea: lo que cambies vale ya para todos los que la llevan, de los dos bandos. La IA espera a que vuelvas.';

/**
 * El aviso de un cambio que ha entrado: lo que dice el cambio y, en plena pelea,
 * lo que dice la sesión al retocar (`retocar`: si ha soltado algo).
 */
function avisoTrasCambio(texto: string): void {
  vista.aviso = [texto, pelea.sesion === null ? '' : pelea.sesion.status]
    .filter((t) => t !== '')
    .join(' ');
}

/**
 * Lo que dicen el título y el botón del editor: los de `index.html` al cambiar
 * cifras, y los de mirar una ficha desde la rueda.
 */
const textosDelEditor = {
  titulo: elTituloDelEditor.textContent,
  cerrar: botonCerrarEditor.textContent,
} as const;

/** Repinta lo que se ve: el montaje o la edición, o en la batalla el editor y el panel. */
function repintar(): void {
  if (vista.escena === 'edicion') repintarEdicion();
  else if (vista.escena === 'equipo') repintarEquipo();
  else if (vista.escena === 'magia') editorDeMagia.repintar();
  else if (vista.escena === 'montaje') repintarMontaje();
  else {
    if (editor.open) pintarEditor(pagina);
    pedirFotograma();
  }
}
function pedirRepintado(clave: string | null = null): void {
  const antes = vista.pendiente;
  if (clave === null || antes === 'todo') vista.pendiente = 'todo';
  else if (antes === null) vista.pendiente = new Set([clave]);
  else antes.add(clave);
  if (antes === null) setTimeout(repintarLoPendiente, 0);
}

/**
 * Repinta lo pedido, si queda algo. Un clic no espera a la tarea siguiente —no
 * mueve el foco, y quien lo mira (`pnpm capturas` también) espera verlo ya—: lo
 * pide y lo repinta en el acto, junto con lo que hubiera pendiente.
 */
function repintarLoPendiente(): void {
  const que = vista.pendiente;
  vista.pendiente = null;
  if (que === 'todo') repintar();
  else for (const k of que ?? []) repintarFicha(k);
}

/** Cambia el héroe de un lado, comprobado. */
function cambiarHeroe(lado: Lado, cambio: (h: HeroeDeArena) => HeroeDeArena): boolean {
  const h = montaje.heroes[lado];
  if (h === null) return true;
  try {
    const nuevo = validarHeroeDeArena(cambio(h));
    // Lo que lleva, con la regla de su ficha (sin arma de cuerpo a cuerpo no se
    // combate): fuera de la pelea no lo mira nadie más.
    heroeDeArena(nuevo, catalogo.equipo);
    const motivo = retocarLaPelea({ kind: 'heroe', lado, datos: nuevo });
    if (motivo !== null) {
      noSeCambia(motivo);
      return false;
    }
    montaje.heroes[lado] = nuevo;
    avisoTrasCambio('');
    return true;
  } catch (err) {
    noSeCambia(`${mensajeDe(err)}.`);
    return false;
  }
}

/**
 * Una cifra del cuerpo de todo héroe (`hp`, los PV; `fuerza` o `agilidad`: la de un héroe
 * recién hecho): se comprueba con la regla de data/heroe.json y entra en los dos
 * héroes, también a media pelea; si uno la rechaza, el cuerpo de la página no cambia.
 */
function cambiarCuerpoDeTodoHeroe(campo: 'hp' | 'fuerza' | 'agilidad', v: string): void {
  const n = v.trim() === '' ? Number.NaN : Number(v);
  const c = catalogo.cuerpoDeTodoHeroe;
  let nuevo: CuerpoDeTodoHeroe;
  try {
    nuevo = combateDelHeroe(
      campo === 'agilidad'
        ? { ...c, agilidad: n }
        : campo === 'hp'
          ? { ...c, pv: { ...c.pv, base: n } }
          : { ...c, fuerza: { ...c.fuerza, base: n } },
      'el cuerpo de todo héroe',
    );
  } catch (err) {
    noSeCambia(`${mensajeDe(err)}.`);
    return;
  }
  for (const lado of ['izquierda', 'derecha'] as const) {
    if (!cambiarHeroe(lado, (h) => ({ ...h, cuerpo: nuevo }))) return;
  }
  catalogo.cuerpoDeTodoHeroe = nuevo;
}

/** Aplica un cambio a la unidad de un tipo, validado: lo que no cuadra se dice y no entra. */
function cambiarUnidad(id: string, cambio: (u: Unidad) => unknown): void {
  try {
    const nueva = validarUnidad(cambio(unidadDe(catalogo, id)), catalogo.equipo);
    const motivo = retocarLaPelea({ kind: 'tipo', fuente: { unidad: nueva } });
    if (motivo !== null) {
      noSeCambia(motivo);
      return;
    }
    catalogo.unidadesDelCatalogo.set(id, nueva);
    catalogo.unidadesSinGuardar.add(id);
    avisoTrasCambio('');
  } catch (err) {
    noSeCambia(`${mensajeDe(err)}.`);
  }
}

/** El nuevo valor de un campo de la ficha, en la unidad. Lo que es número lo valida el núcleo. */
function conCampo(u: Unidad, campo: string, valor: string): unknown {
  // Vacío es `NaN`, y el núcleo lo dice como «está vacío».
  const n = valor.trim() === '' ? Number.NaN : Number(valor);
  switch (campo) {
    case 'name':
      return { ...u, name: valor };

    case 'attack':
    case 'fuerza':
    case 'agilidad':
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

instalarElAvisoAlCerrar(catalogo);

// ---------------------------------------------------------------- el enlace de la pelea

// ---------------------------------------------------------------- batalla

const batalla = new EscenaBatalla(() => {
  if (pelea.sesion === null) throw new Error('la escena de batalla se ha usado sin batalla');
  return pelea.sesion;
});

function luchar(): void {
  const lado = (l: Lado): LadoDeSesion => ({
    unidades: montaje.puestos[l].map((p) => fuenteDeArena(catalogo, p)),
    heroe: montaje.heroes[l],
    ia: montaje.iaDelBando[l],
  });
  // Una pelea nueva sortea su semilla, salvo que la URL fije una; y la URL la
  // lleva siempre, como en la partida: un resultado raro se repite copiando la
  // barra de direcciones (M6 de QA).
  const semilla = montaje.semillaPedida ?? semillaSorteada();
  let nueva: SesionDeArena;
  try {
    nueva = new SesionDeArena(
      {
        izquierda: lado('izquierda'),
        derecha: lado('derecha'),
        muralla: editorDeMuralla.muralla,
        equipo: catalogo.equipo,
        combate: montaje.combate,
        hechizos: catalogoDeMagia(catalogo),
      },
      semilla,
      montaje.climaDeLaArena,
    );
  } catch (err) {
    vista.aviso = `No se puede luchar: ${mensajeDe(err)}.`;
    return;
  }
  aLaBarraDeLaArena((url) => url.searchParams.set('seed', String(semilla)));
  pelea.sesion = nueva;
  elSeed.textContent = `semilla ${semilla}`;
  irA('battle');
  principal.remedir();
  pelea.paneles = null;
  // El animador mira el tablero de salida ANTES de que la IA juegue: así cuenta
  // lo que juega, también con todas las unidades en IA (H1 de QA).
  batalla.sincronizar(performance.now());
  nueva.empezar();
}

function volverAlMontaje(): void {
  if (editor.open) editor.close();
  rueda.cerrar();
  pelea.sesion = null;
  irA('montaje');
  vista.aviso = 'De vuelta al montaje: todo sigue como estaba.';
  repintarMontaje();
}

function alargarLienzo(): void {
  const visible = elLienzo.clientHeight;
  const pide = (): number =>
    pelea.sesion === null ? visible : batalla.altoDelLienzo(elLienzo.clientWidth, visible);
  // Dos veces: con el marco desplazable, la barra le quita ancho, y el alto que
  // pide el tablero sale de ese ancho.
  app.toggleAttribute('data-muralla', pide() > visible + 0.5);
  const alto = pide();
  const css = alto > visible + 0.5 ? `${Math.ceil(alto)}px` : '';
  if (canvas.style.height === css) return;
  const alargado = canvas.style.height === '';
  canvas.style.height = css;
  principal.remedir();
  if (alargado && css !== '') pelea.colocarElMarco = true;
}

/** Tras pintar con el lienzo alargado: el final del tablero, al pie del marco. */
function colocarMarco(): void {
  if (!pelea.colocarElMarco) return;
  pelea.colocarElMarco = false;
  elLienzo.scrollTop = Math.max(0, batalla.pieDelTablero() - elLienzo.clientHeight);
}

/** La puerta de los gestos mientras se cuenta la jugada, como en la partida. */
function jugadaEnCurso(): boolean {
  if (pelea.sesion === null) return true;
  if (!batalla.rechazarSiOcupada(performance.now())) return false;
  pedirFotograma();
  return true;
}

/**
 * Los gestos de la batalla, los de la partida (`batalla/gestos.ts`): los botones del
 * panel, las teclas y el puntero sobre el tablero, con la misma puerta de arriba.
 */
const gestos = new GestosDeBatalla({
  sesion: () => pelea.sesion,
  escena: batalla,
  jugadaEnCurso,
  pedirFotograma,
});

// ---------------------------------------------------------------- dibujo

const principal = ajustarLienzo(canvas, pedirFotograma);
cargarArte(pedirFotograma, { manifiesto: false, mapa: false, hojas: false });

/** Un fotograma del bucle (`pedirFotograma`): lo pinta y dice si se pide otro. */
function render(ahora: number): boolean {
  // En la vista de equipo, también a media pelea, la barra es la de la página.
  if (pelea.sesion === null || vista.escena === 'equipo' || vista.escena === 'magia') {
    if (elStatus.textContent !== vista.aviso) elStatus.textContent = vista.aviso;
    return animarFiguras(ahora);
  }
  dibujarBatalla(ahora, pelea.sesion);
  // Las figuras de los dos de la rueda (su cabecera, `DialogoDeLaRueda.animar`).
  const enLaRueda = rueda.animar(ahora);
  return enLaRueda || hayFigurasAnimadas() || batalla.ocupada;
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
 * la edición o el equipo (`recogerFiguras`; las de la rueda las anima ella,
 * `DialogoDeLaRueda.animar`). Devuelve si hay que seguir: sin ninguna —al arrancar, con
 * los bandos vacíos y sin ficha— no hay nada que repintar, y el bucle se para
 * hasta el siguiente gesto o la siguiente imagen.
 */
function animarFiguras(ahora: number): boolean {
  for (const [i, { lienzo, ctx, id, clave: deFicha, lado, rotulo }] of vista.figuras.entries()) {
    if (vigiaDeFiguras !== null && !vista.enPantalla.has(lienzo)) continue;
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
    if (vista.pintado.get(lienzo) === clave) continue;
    vista.pintado.set(lienzo, clave);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    pintarSombraDeFigura(ctx, colocada);
    pintarFigura(ctx, colocada);
  }
  // Con alguna figura con arte en pantalla, respira: el bucle sigue. Sin arte,
  // la imagen que llegue avisa y repinta.
  const aLaVista = vigiaDeFiguras === null ? vista.figuras.length : vista.enPantalla.size;
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
  if (
    pelea.paneles === null ||
    pelea.paneles.version !== version ||
    pelea.paneles.ocupada !== ocupada
  ) {
    pelea.paneles = { version, ocupada };
    // El parte se lee de arriba abajo y lo último queda al fondo: sigue ahí, o
    // al acabar no se veía lo que acababa de pasar (M11 de QA), salvo que la
    // persona haya subido a leer (#198).
    pintarSiguiendoElFinal(elSide, renderPanelDeBatalla(s, ocupada));
    // La barra de arriba, igual que el panel: mientras se cuenta no adelanta ni
    // la ronda ni el final.
    elDay.textContent = ocupada
      ? 'Batalla'
      : s.battle.despliegue !== null
        ? 'Batalla · despliegue'
        : `Batalla · ronda ${s.battle.round}`;
    elTurn.textContent = rotuloDelTurno(s, ocupada);
  }
  // «La batalla ha terminado» espera a que el tablero llegue al final; el aviso de
  // espera no: un clic durante el último desenlace de la rueda se perdía sin decir
  // nada (H4 de QA, 19-10-2026), y el aviso no adelanta el final.
  const estado =
    ocupada && s.battle.finished !== null && s.status !== AVISO_DE_ESPERA ? '' : s.status;
  if (elStatus.textContent !== estado) elStatus.textContent = estado;
  rueda.pintar();
}

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
    jugadaEnCurso();
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

// ---------------------------------------------------------------- gestos

function enLienzo(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

canvas.addEventListener('pointermove', (ev) => {
  if (pelea.sesion === null) return;
  const p = enLienzo(ev);
  gestos.mover(p.x, p.y);
  pedirFotograma();
});

canvas.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0 || pelea.sesion === null) return;
  const p = enLienzo(ev);
  gestos.soltar(p.x, p.y);
  pedirFotograma();
});

canvas.addEventListener('pointerleave', () => {
  gestos.salir();
  pedirFotograma();
});

document.addEventListener('click', (ev) => {
  // Los botones de la batalla, los de la partida (`GestosDeBatalla.clic`): el libro, el
  // arma, los poderes, la muralla, el despliegue y «Terminar turno», con la regla del
  // doble clic (M12 de QA: el segundo no es otra jugada).
  const conAccion = (ev.target as Element).closest('[data-action]');
  if (
    conAccion !== null &&
    gestos.clic(conAccion.getAttribute('data-action'), conAccion, ev.detail)
  ) {
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
        vista.filtro = el.getAttribute('data-faccion') as typeof vista.filtro;
        break;
      case 'añadir': {
        const lado = el.getAttribute('data-lado') as Lado;
        añadir(pagina, lado, unidad as string);
        break;
      }
      case 'editar':
        vista.elegida = { kind: 'unidad', id: unidad as string };
        vista.aviso = '';
        break;
      case 'crear-unidad': {
        const select = el.closest('[data-nueva-unidad]')?.querySelector('[data-arena-nueva]');
        if (select === null || select === undefined) {
          throw new Error('el botón «Crear» no está junto a su selector de cuerpo');
        }
        const id = crearUnidad(pagina, valorDe(select));
        if (id !== null && vista.escena === 'edicion') {
          const f: FichaEditable = { kind: 'unidad', id };
          const r = abrirFicha(vista.abiertas, f, nombreDeFicha(catalogo, f));
          if (r.abiertas !== vista.abiertas) abiertaTrasElGesto = claveDeFicha(f);
          vista.abiertas = r.abiertas;
          recordarAbiertas();
        }
        break;
      }
      case 'quitar-pieza': {
        const hueco = el.getAttribute('data-hueco') ?? '';
        if (!esHueco(hueco)) throw new Error(`el × del equipo trae «${hueco}», que no es un hueco`);
        const f = laFichaDe(el, 'quitar una pieza');
        if (f.kind === 'heroe') cambiarHeroe(f.lado, (h) => quitarEnArena(h, hueco));
        else cambiarUnidad(f.id, (u) => quitarEnArena(u, hueco));
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'editar-en-combate':
      case 'ficha-en-la-rueda': {
        if (pelea.sesion === null) return;
        const id = el.getAttribute('data-stack');
        const st = pelea.sesion.battle.stacks.find((x) => x.id === id);
        if (st === undefined) {
          const boton = que === 'editar-en-combate' ? 'el botón «Editar»' : 'la figura de la rueda';
          throw new Error(`${boton} trae «${String(id)}», que no está en la pelea`);
        }
        // Lo que se edita es el TIPO: la unidad de la que sale, o el héroe de su
        // lado (`tipoDelStack`, por su origen). Desde la rueda, solo se mira.
        abrirEditor(pagina, pelea.sesion, st, que === 'ficha-en-la-rueda');
        return;
      }
      case 'cerrar-editor':
        editor.close();
        return;
      case 'poner-heroe': {
        const lado = el.getAttribute('data-lado') as Lado;
        if (ocupados(montaje, lado) >= montaje.combate.tope) {
          vista.aviso = `El bando ${LADOS[lado].adjetivo} ya lleva ${montaje.combate.tope}: no cabe el héroe.`;
          break;
        }
        montaje.heroes[lado] = heroePorDefecto(lado, catalogo.cuerpoDeTodoHeroe);
        vista.elegida = { kind: 'heroe', lado };
        vista.aviso = `El bando ${LADOS[lado].adjetivo} lleva héroe: cambia sus cifras y su libro en la ficha.`;
        break;
      }
      case 'editar-heroe':
        vista.elegida = { kind: 'heroe', lado: el.getAttribute('data-lado') as Lado };
        vista.aviso = '';
        break;
      case 'quitar-heroe': {
        const lado = el.getAttribute('data-lado') as Lado;
        montaje.heroes[lado] = null;
        if (vista.elegida?.kind === 'heroe' && vista.elegida.lado === lado) vista.elegida = null;
        break;
      }
      case 'manda':
        montaje.iaDelBando[el.getAttribute('data-lado') as Lado] =
          el.getAttribute('data-ia') === 'si';
        break;
      case 'duplicar': {
        const { lado, p } = puestoPorClave(montaje, clave);
        añadir(pagina, lado, p.unidad, p.escalera);
        break;
      }
      case 'escalera': {
        const { lado, i, p } = puestoPorClave(montaje, clave);
        montaje.puestos[lado][i] = { ...p, escalera: !p.escalera };
        break;
      }
      case 'quitar': {
        const { lado, i } = puestoPorClave(montaje, clave);
        montaje.puestos[lado].splice(i, 1);
        break;
      }
      case 'clip': {
        const k = claveDeFicha(laFichaDe(el, 'el botón del clip'));
        vista.animDeFicha.set(k, {
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
        vista.animDeFicha.set(k, { ...a, mira: (a.mira + 1) % DIRECCION_DE_HOJA.length });
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
        vista.listaPlegada = listaPlegadaTras('entrar', vista.listaPlegada, vista.abiertas.length);
        vista.aviso = avisoAlEntrar('edicion');
        break;
      case 'ir-a-magia':
        if (vista.escena === 'magia') break;
        irA('magia');
        vista.aviso = avisoAlEntrar('magia');
        break;
      case 'volver-de-magia': {
        const vuelta =
          vista.escenaDeVuelta === 'battle' && pelea.sesion === null
            ? 'montaje'
            : vista.escenaDeVuelta;
        irA(vuelta);
        if (vuelta === 'battle') {
          pelea.paneles = null;
          principal.remedir();
        }
        vista.aviso = 'De vuelta, con los hechizos que hayas cambiado.';
        break;
      }
      case 'quitar-poder': {
        const id = el.getAttribute('data-poder') as string;
        const f = laFichaDe(el, 'quitar un poder');
        if (f.kind !== 'unidad') throw new Error('solo las unidades llevan poderes que quitar');
        cambiarUnidad(f.id, (u) => {
          const quedan = (u.hechizos ?? []).filter((x) => x !== id);
          const { hechizos: _fuera, ...sin } = u;
          return quedan.length === 0 ? sin : { ...sin, hechizos: quedan };
        });
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'volver-de-edicion':
        irA('montaje');
        vista.aviso = 'De vuelta al montaje, con las cifras que hayas cambiado.';
        break;
      case 'ir-a-equipo':
        if (vista.escena === 'equipo') break;
        irA('equipo');
        vista.piezaElegida ??= catalogo.equipo.piezas.keys().next().value ?? null;
        vista.aviso = avisoAlEntrar('equipo');
        break;
      case 'volver-de-equipo': {
        const vuelta =
          vista.escenaDeVuelta === 'battle' && pelea.sesion === null
            ? 'montaje'
            : vista.escenaDeVuelta;
        irA(vuelta);
        if (vuelta === 'battle') {
          // El panel se rehace con las cifras nuevas; la barra, la de la sesión.
          pelea.paneles = null;
          principal.remedir();
        }
        vista.aviso = 'De vuelta, con las piezas que hayas cambiado.';
        break;
      }
      case 'elegir-pieza':
        vista.piezaElegida = el.getAttribute('data-pieza');
        piezaTrasElGesto = vista.piezaElegida;
        // En plena pelea la barra sigue recordando qué pasa al cambiar (M4 de QA:
        // al elegir la primera pieza se quedaba en blanco).
        vista.aviso = pelea.sesion === null ? '' : EQUIPO_EN_PLENA_PELEA;
        break;
      case 'crear-pieza':
      case 'crear-pieza-sobre': {
        // En blanco en el hueco de su botón, copia de la de la ficha («Duplicar»)
        // o sobre ella («Nueva sobre esta»).
        const hueco = el.getAttribute('data-hueco');
        const sobre = que === 'crear-pieza-sobre';
        let desde: HuecoDePieza | Pieza;
        if (hueco === null) desde = piezaDeLaFicha();
        else if (esHuecoDePieza(hueco)) desde = hueco;
        else throw new Error(`«+ Nueva pieza» trae «${hueco}», que no es un hueco`);
        const p =
          sobre && typeof desde !== 'string'
            ? piezaSobre(desde, catalogo.equipo)
            : piezaNueva(desde, catalogo.equipo);
        const dicho =
          typeof desde === 'string'
            ? `Nueva pieza «${p.nombre}»: cambia sus cifras en la ficha, y di si se vende o cae como botín.`
            : sobre
              ? `«${p.nombre}», sobre «${desde.nombre}»: suma lo mismo hasta que le pongas extras, y si cambia «${desde.nombre}», cambia con ella.`
              : `«${p.nombre}», copia de «${desde.nombre}»: es nueva.`;
        if (cambiarPiezas(p.id, p, dicho)) {
          vista.piezaElegida = p.id;
          piezaTrasElGesto = p.id;
        }
        break;
      }
      case 'paso-de-rueda': {
        // Un paso de la barra de un tipo de la rueda: «+» sube un nivel (mejor,
        // también en la Finta) y «−» lo baja. Parte de lo que dice su casilla y
        // entra como si se hubiera tecleado: si se sale de 0 a 6, lo dice el núcleo.
        const tipo = el.getAttribute('data-tipo');
        const sentido = el.getAttribute('data-sentido');
        if (!esTipoDelAnillo(tipo) || (sentido !== '1' && sentido !== '-1')) {
          throw new Error(`el paso de la rueda trae «${tipo}» y «${sentido}»`);
        }
        const casilla = el
          .closest('.barra-de-la-rueda')
          ?.querySelector(`[data-arena-pieza-campo="rueda-${tipo}"]`);
        if (casilla === null || casilla === undefined) {
          throw new Error(`el paso de ${tipo} no tiene su casilla al lado`);
        }
        const ahora = Number(valorDe(casilla));
        const paso = sentido === '1' ? 1 : -1;
        cambiarCampoDePieza(casilla, String((Number.isFinite(ahora) ? ahora : 0) + paso));
        break;
      }
      case 'retirar-pieza': {
        const p = piezaDeLaFicha();
        const dicho = `Borrada la pieza «${p.nombre}»: «Guardar» la quita de data/equipo.json.`;
        if (cambiarPiezas(p.id, null, dicho)) vista.piezaElegida = null;
        break;
      }
      case 'abrir-ficha': {
        if (unidad === null) throw new Error('el botón «Abrir» no dice de qué unidad es');
        const f: FichaEditable = { kind: 'unidad', id: unidadDe(catalogo, unidad).id };
        const incompleta = porQueNoSeMonta(catalogo, unidadDe(catalogo, f.id));
        const r = abrirFicha(vista.abiertas, f, nombreDeFicha(catalogo, f), incompleta);
        if (r.abiertas !== vista.abiertas) {
          vista.listaPlegada = listaPlegadaTras('abrir', vista.listaPlegada, r.abiertas.length);
          abiertaTrasElGesto = claveDeFicha(f);
        }
        vista.abiertas = r.abiertas;
        vista.aviso = r.aviso;
        recordarAbiertas();
        break;
      }
      case 'cerrar-ficha': {
        const f = laFichaDe(el, 'el × de una ficha');
        if (f.kind === 'heroe') throw new Error('la ficha del héroe no se abre en la edición');
        const k = claveDeFicha(f);
        // Con el teclado, el foco sigue en la ficha de al lado o en su «Abrir»;
        // con el ratón no se mueve (como `pintar`: el Espacio no pulsa nada solo).
        if (el.matches(':focus-visible')) focoTrasElGesto = focoTrasCerrar(vista.abiertas, k);
        vista.abiertas = cerrarFicha(vista.abiertas, k);
        vista.listaPlegada = listaPlegadaTras('cerrar', vista.listaPlegada, vista.abiertas.length);
        // Reabrirla empieza de cero: de pie y mirando a la cámara.
        vista.animDeFicha.delete(k);
        vista.aviso = `${nombreDeFicha(catalogo, f)}: ficha cerrada.`;
        recordarAbiertas();
        break;
      }
      case 'plegar-lista':
        vista.listaPlegada = listaPlegadaTras(
          'alternar',
          vista.listaPlegada,
          vista.abiertas.length,
        );
        guardarEnElNavegador(CLAVE_DE_LISTA, vista.listaPlegada ? '1' : '0', QUE_LISTA);
        break;
      case 'renombrar': {
        const k = claveDeFicha(laFichaDe(el, 'el botón de cambiar el nombre'));
        vista.renombrando.add(k);
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
        void copiarEnlace(pagina).then(repintarMontaje, (err: unknown) => {
          vista.aviso = `No se ha podido escribir el enlace de la pelea: ${mensajeDe(err)}.`;
          repintarMontaje();
        });
        return;
      case 'hex-muralla':
        tocarHex(pagina, {
          col: Number(el.getAttribute('data-col')),
          row: Number(el.getAttribute('data-row')),
        });
        repintarMuralla(pagina);
        return;
      case 'herramienta-muralla':
        editorDeMuralla.herramienta = el.getAttribute('data-herramienta') as HerramientaDeMuralla;
        repintarMuralla(pagina);
        return;
      case 'plegar-muralla':
        editorDeMuralla.murallaPlegada = !editorDeMuralla.murallaPlegada;
        guardarEnElNavegador(
          CLAVE_DE_PLEGADO,
          editorDeMuralla.murallaPlegada ? '1' : '0',
          QUE_PLEGADO,
        );
        repintarMuralla(pagina);
        return;
      case 'vaciar-muralla':
        editorDeMuralla.muralla = murallaVacia('piedra');
        vista.aviso = 'Muralla vacía: la pelea será a campo abierto.';
        repintarMuralla(pagina);
        return;
      case 'cargar-forma': {
        const f = formaPorNombre(editorDeMuralla, el.getAttribute('data-nombre') as string);
        editorDeMuralla.muralla = f.muralla;
        // Una de ejemplo no se guarda con su nombre: se deja el campo para otro.
        editorDeMuralla.nombreDeForma = esFormaDeEjemplo(f.nombre) ? '' : f.nombre;
        vista.aviso = `Cargada la forma «${f.nombre}».`;
        repintarMuralla(pagina);
        return;
      }
      case 'guardar-forma':
        void guardarForma(pagina).then(
          () => repintarMuralla(pagina),
          (err: unknown) => {
            vista.aviso = `No se ha guardado la muralla: ${mensajeDe(err)}.`;
            repintarMuralla(pagina);
          },
        );
        return;
      case 'borrar-forma': {
        const nombre = el.getAttribute('data-nombre') as string;
        void borrarForma(pagina, nombre).then(
          () => repintarMuralla(pagina),
          (err: unknown) => {
            vista.aviso = `No se ha borrado la forma «${nombre}»: ${mensajeDe(err)}.`;
            repintarMuralla(pagina);
          },
        );
        return;
      }
      case 'guardar':
        // También desde la edición: repinta la vista en la que se está.
        void guardar(pagina).then(
          () => pedirRepintado(),
          (err: unknown) => {
            vista.aviso = `No se ha guardado: ${mensajeDe(err)}.`;
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
    vista.aviso = mensajeDe(err);
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
  return vista.escena === 'edicion'
    ? elEdicion
    : vista.escena === 'montaje'
      ? elFicha
      : elFichaDelEditor;
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
    if (sigue || !vista.renombrando.delete(clave)) return;
    pedirRepintado(clave);
  }, 0);
});

document.addEventListener('change', (ev) => {
  const el = ev.target as Element;
  // La complejidad de la pelea: no es de ninguna unidad.
  const delCombate = leerElCombate(el, montaje.combate);
  if (delCombate !== null) {
    cambiarElCombate(delCombate);
    return;
  }
  // Un campo de la ficha de una pieza (vista de equipo): no es de ninguna unidad.
  if (el.getAttribute('data-arena-pieza-campo') !== null) {
    cambiarCampoDePieza(el);
    pedirRepintado();
    return;
  }
  // El nombre de la forma no es de ninguna unidad: se apunta y nada más.
  if (el.getAttribute('data-muralla-nombre') !== null) {
    editorDeMuralla.nombreDeForma = valorDe(el);
    return;
  }
  // Escribe en la ficha que contiene el campo, no en `elegida`: en la edición hay
  // hasta cuatro. Lo que no está en una ficha no es de ninguna unidad.
  const ficha = fichaDelElemento(el);
  if (ficha !== null) cambiarEnFicha(ficha, el);
});

/**
 * Cambia la complejidad de la pelea. Un tope que deja fuera a alguien no entra: lo
 * dice la regla del núcleo (`topeDelBandoBlocker`, la del montaje y el enlace), y
 * el selector vuelve a lo de antes (un montaje que no cabe no se puede ni enlazar).
 */
function cambiarElCombate(nuevo: ReglasDelCombate): void {
  const noCabe = (['izquierda', 'derecha'] as const)
    .map((l) =>
      topeDelBandoBlocker(
        `El bando ${LADOS[l].adjetivo}`,
        montaje.puestos[l].length,
        montaje.heroes[l] !== null,
        nuevo.tope,
      ),
    )
    .find((motivo) => motivo !== null);
  if (noCabe !== undefined && noCabe !== null) {
    vista.aviso = `${noCabe} antes de bajar el tope a ${nuevo.tope}.`;
  } else {
    montaje.combate = nuevo;
    vista.aviso = `La pelea será con ${montaje.combate.tope} por bando y la rueda de ${montaje.combate.rueda}.`;
  }
  pedirRepintado();
}

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
 * desplegable o quitar una etiqueta): su tipo en el catálogo. Lo que no vale lo
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

/** Un campo de la ficha de una unidad: su tipo en el catálogo. */
function cambiarDeLaUnidad(id: string, el: Element): void {
  const campo = el.getAttribute('data-campo');
  const hueco = el.getAttribute('data-arena-pieza');
  if (campo !== null) {
    cambiarUnidad(id, (u) => conCampo(u, campo, valorDe(el)));
  } else if (hueco !== null) {
    // Ponerle una pieza en ese hueco (un arma va también en la segunda): lo que no
    // se puede (un escudo con un arma a dos manos) lo dice el núcleo
    // (`manosBlocker`) y sale en la barra.
    if (!esHueco(hueco)) throw new Error(`«${hueco}» no es un hueco`);
    const puesta = valorDe(el);
    if (puesta !== '') cambiarUnidad(id, (u) => equiparEnArena(u, puesta, catalogo.equipo, hueco));
  } else if (el.getAttribute('data-arena-rasgo') !== null) {
    añadirRasgo({ kind: 'unidad', id }, el);
  } else if (el.getAttribute('data-arena-habilidad') !== null) {
    const h = valorDe(el);
    if (h !== '') cambiarUnidad(id, (u) => ({ ...u, habilidades: [...u.habilidades, h] }));
  } else if (el.getAttribute('data-arena-poder') !== null) {
    const h = valorDe(el);
    if (h !== '') cambiarUnidad(id, (u) => ({ ...u, hechizos: [...(u.hechizos ?? []), h] }));
  }
}

/** Un campo de la ficha del héroe. */
function cambiarDelHeroe(lado: Lado, el: Element): void {
  const campo = el.getAttribute('data-heroe-campo');
  const hechizo = el.getAttribute('data-heroe-hechizo');
  const hueco = el.getAttribute('data-arena-pieza');
  if (hueco !== null) {
    // Ponerle una pieza, como a una unidad: lo que no se puede lo dice el núcleo.
    if (!esHueco(hueco)) throw new Error(`«${hueco}» no es un hueco`);
    const puesta = valorDe(el);
    if (puesta !== '') cambiarHeroe(lado, (h) => equiparEnArena(h, puesta, catalogo.equipo, hueco));
  } else if (campo === 'hp' || campo === 'fuerza' || campo === 'agilidad') {
    cambiarCuerpoDeTodoHeroe(campo, valorDe(el));
  } else if (campo !== null) {
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
        ? hechizosQueValen(catalogo)
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
  if (vista.escena !== 'battle') return;
  // Las teclas de la batalla, las de la partida (`GestosDeBatalla.tecla`): Escape suelta
  // lo que espera el clic, las flechas mueven al elegido del despliegue, la Q alterna el
  // arma y Espacio cierra el turno de tu unidad activa.
  gestos.tecla(ev);
});

instalarElCierreDelEditor(pagina);

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
    const pedida = vistaDeLaURL();
    const queHacer =
      pedida.vista === null
        ? 'Añade unidades a los dos bandos y pulsa Luchar.'
        : avisoAlEntrar(pedida.vista);
    vista.aviso = delEnlace?.montado
      ? `${delEnlace.aviso}${vista.aviso}${catalogo.avisoDeIncompletas}${avisoDeMurallas}${deAbiertas}`
      : `${montaje.avisoDeSemilla}${delEnlace?.aviso ?? ''}${vista.aviso}${catalogo.avisoDeIncompletas}${avisoDeMurallas} ${queHacer}${deAbiertas}`;
    vista.aviso = `${pedida.aviso}${vista.aviso}`;
    // Recargar deja la vista donde estaba: la edición con sus fichas (recordadas
    // arriba) o el equipo con su pieza.
    if (pedida.vista === 'equipo') {
      vista.piezaElegida = pedida.pieza ?? catalogo.equipo.piezas.keys().next().value ?? null;
    }
    irA(pedida.vista ?? 'montaje');
    repintar();
  },
  (err: unknown) => {
    console.error('[arena] no ha arrancado', err);
    vista.aviso = `La arena no ha podido arrancar: ${mensajeDe(err)}`;
    elStatus.textContent = vista.aviso;
  },
);
