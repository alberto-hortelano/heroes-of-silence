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
import { heroePorDefecto } from '@core/arena/heroe.js';
import { LADOS, type Lado } from '@core/arena/lados.js';
import { esFormaDeEjemplo } from '@core/arena/murallas.js';
import { piezaNueva, piezaSobre, quitarEnArena } from '@core/arena/piezas.js';
import { murallaVacia } from '@core/battle/muralla.js';
import { COMBATE_COMPLETO } from '@core/combate.js';
import { EQUIPO_DEL_JUEGO } from '@core/equipo/atado.js';
import type { Pieza } from '@core/equipo/pieza.js';
import { HEROE } from '@core/hero/cuerpo-del-heroe.js';
import { todosLosHechizos } from '@core/magia/catalogo.js';
import { DESPEJADO } from '@core/state/clima.js';
import {
  type CreatureTrait,
  esHueco,
  esHuecoDePieza,
  esTipoDelAnillo,
  type HuecoDePieza,
} from '@core/types.js';
import { EscenaBatalla } from '../batalla/escena.js';
import { GestosDeBatalla } from '../batalla/gestos.js';
import { DialogoDeLaRueda } from '../batalla/rueda/dialogo.js';
import { bucleDeDibujo } from '../comun/bucle.js';
import { mensajeDe } from '../comun/errores.js';
import { cargarArte } from '../render/assets.js';
import type { CharacterClip } from '../render/figuras/character.js';
import { DIRECCION_DE_HOJA } from '../render/figuras/personajes.js';
import { ajustarLienzo } from '../render/lienzo.js';
import {
  cambiarCampoDePieza,
  cambiarHeroe,
  cambiarPiezas,
  cambiarRasgos,
  cambiarUnidad,
  instalarLosCambios,
  valorDe,
} from './cambios.js';
import {
  arrancar,
  catalogoDeMagia,
  guardar,
  hechizosSinGuardar,
  instalarElAvisoAlCerrar,
  porQueNoSeMonta,
  unidadDe,
} from './catalogo.js';
import { dibujarFotograma } from './dibujo.js';
import {
  abrirFicha,
  cerrarFicha,
  claveDeFicha,
  type FichaEditable,
  type FocoTrasCerrar,
  focoTrasCerrar,
  leerAbiertas,
  listaPlegadaTras,
} from './edicion.js';
import {
  arrancarMurallas,
  borrarForma,
  formaPorNombre,
  guardarForma,
  repintarMuralla,
  tocarHex,
} from './editor-de-muralla.js';
import { copiarEnlace, leerLaURL, montarDelEnlace } from './enlace.js';
import {
  abrirEditor,
  campoDelNombre,
  instalarElCierreDelEditor,
  laFichaDe,
  nombreDeFicha,
} from './fichas.js';
import { animDe, vigiaDeLasFiguras } from './figuras.js';
import { montarEditorDeMagia } from './magia.js';
import { añadir, crearUnidad, ocupados, puestoPorClave, quienUsaElHechizo } from './montaje.js';
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
import { focoTrasQuitar } from './paneles/ficha.js';
import type { HerramientaDeMuralla } from './paneles/muralla.js';
import { jugadaEnCurso, luchar, volverAlMontaje } from './pelea.js';
import {
  avisoAlEntrar,
  CLAVE_DE_ABIERTAS,
  CLAVE_DE_LISTA,
  CLAVE_DE_PLEGADO,
  EQUIPO_EN_PLENA_PELEA,
  guardarEnElNavegador,
  irA,
  leerDelNavegador,
  pedirRepintado,
  QUE_ABIERTAS,
  QUE_LISTA,
  QUE_PLEGADO,
  recordarAbiertas,
  repintar,
  repintarLoPendiente,
  repintarMontaje,
  vistaDeLaURL,
} from './vista.js';

const elementos = elementosDeLaArena();
const {
  canvas,
  elStatus,
  elBarraDeEstado,
  elFicha,
  elEdicion,
  elEquipo,
  elMagia,
  editor,
  elRueda,
  elFichaDelEditor,
  elTituloDelEditor,
  botonCerrarEditor,
} = elementos;

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

// ---------------------------------------------------------------- arranque

// ---------------------------------------------------------------- muralla

// ---------------------------------------------------------------- montaje

/** La pieza de la ficha de equipo: la elegida, o lanza si no hay ninguna (el botón no estaría). */
function piezaDeLaFicha(): Pieza {
  if (vista.piezaElegida === null) throw new Error('no hay ninguna pieza elegida en la ficha');
  return catalogo.equipo.pieza(vista.piezaElegida);
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

const vigiaDeFiguras = vigiaDeLasFiguras(vista, pedirFotograma);

/**
 * Lo que dicen el título y el botón del editor: los de `index.html` al cambiar
 * cifras, y los de mirar una ficha desde la rueda.
 */
const textosDelEditor = {
  titulo: elTituloDelEditor.textContent,
  cerrar: botonCerrarEditor.textContent,
} as const;

instalarElAvisoAlCerrar(catalogo);

// ---------------------------------------------------------------- el enlace de la pelea

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

// ---------------------------------------------------------------- dibujo

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
          recordarAbiertas(vista);
        }
        break;
      }
      case 'quitar-pieza': {
        const hueco = el.getAttribute('data-hueco') ?? '';
        if (!esHueco(hueco)) throw new Error(`el × del equipo trae «${hueco}», que no es un hueco`);
        const f = laFichaDe(el, 'quitar una pieza');
        if (f.kind === 'heroe') cambiarHeroe(pagina, f.lado, (h) => quitarEnArena(h, hueco));
        else cambiarUnidad(pagina, f.id, (u) => quitarEnArena(u, hueco));
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
          ...animDe(vista, k),
          clip: el.getAttribute('data-clip') as CharacterClip,
          inicio: performance.now(),
        });
        pedirFotograma();
        return;
      }
      case 'girar': {
        const k = claveDeFicha(laFichaDe(el, 'el botón de girar'));
        const a = animDe(vista, k);
        vista.animDeFicha.set(k, { ...a, mira: (a.mira + 1) % DIRECCION_DE_HOJA.length });
        pedirFotograma();
        return;
      }
      case 'quitar-habilidad': {
        const h = el.getAttribute('data-habilidad') as string;
        const f = laFichaDe(el, 'quitar una habilidad');
        if (f.kind !== 'unidad') throw new Error('solo las unidades llevan habilidades que quitar');
        quitadaConElTeclado = quitadaDe(el, 'habilidad', h, claveDeFicha(f));
        cambiarUnidad(pagina, f.id, (u) => ({
          ...u,
          habilidades: u.habilidades.filter((x) => x !== h),
        }));
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'ir-a-edicion':
        irA(pagina, 'edicion');
        vista.listaPlegada = listaPlegadaTras('entrar', vista.listaPlegada, vista.abiertas.length);
        vista.aviso = avisoAlEntrar(pagina, 'edicion');
        break;
      case 'ir-a-magia':
        if (vista.escena === 'magia') break;
        irA(pagina, 'magia');
        vista.aviso = avisoAlEntrar(pagina, 'magia');
        break;
      case 'volver-de-magia': {
        const vuelta =
          vista.escenaDeVuelta === 'battle' && pelea.sesion === null
            ? 'montaje'
            : vista.escenaDeVuelta;
        irA(pagina, vuelta);
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
        cambiarUnidad(pagina, f.id, (u) => {
          const quedan = (u.hechizos ?? []).filter((x) => x !== id);
          const { hechizos: _fuera, ...sin } = u;
          return quedan.length === 0 ? sin : { ...sin, hechizos: quedan };
        });
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'volver-de-edicion':
        irA(pagina, 'montaje');
        vista.aviso = 'De vuelta al montaje, con las cifras que hayas cambiado.';
        break;
      case 'ir-a-equipo':
        if (vista.escena === 'equipo') break;
        irA(pagina, 'equipo');
        vista.piezaElegida ??= catalogo.equipo.piezas.keys().next().value ?? null;
        vista.aviso = avisoAlEntrar(pagina, 'equipo');
        break;
      case 'volver-de-equipo': {
        const vuelta =
          vista.escenaDeVuelta === 'battle' && pelea.sesion === null
            ? 'montaje'
            : vista.escenaDeVuelta;
        irA(pagina, vuelta);
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
        if (cambiarPiezas(pagina, p.id, p, dicho)) {
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
        cambiarCampoDePieza(pagina, casilla, String((Number.isFinite(ahora) ? ahora : 0) + paso));
        break;
      }
      case 'retirar-pieza': {
        const p = piezaDeLaFicha();
        const dicho = `Borrada la pieza «${p.nombre}»: «Guardar» la quita de data/equipo.json.`;
        if (cambiarPiezas(pagina, p.id, null, dicho)) vista.piezaElegida = null;
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
        recordarAbiertas(vista);
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
        recordarAbiertas(vista);
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
        cambiarRasgos(pagina, f, (ts) => ts.filter((x) => x !== t));
        soloLaFicha = claveDeFicha(f);
        break;
      }
      case 'luchar':
        luchar(pagina);
        break;
      case 'enlace':
        void copiarEnlace(pagina).then(
          () => repintarMontaje(pagina),
          (err: unknown) => {
            vista.aviso = `No se ha podido escribir el enlace de la pelea: ${mensajeDe(err)}.`;
            repintarMontaje(pagina);
          },
        );
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
          () => pedirRepintado(pagina),
          (err: unknown) => {
            vista.aviso = `No se ha guardado: ${mensajeDe(err)}.`;
            pedirRepintado(pagina);
          },
        );
        return;
      case 'otra-vez':
        volverAlMontaje(pagina);
        return;
      default:
        return;
    }
  } catch (err) {
    vista.aviso = mensajeDe(err);
    soloLaFicha = null;
  }
  pedirRepintado(pagina, soloLaFicha);
  repintarLoPendiente(pagina);
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

instalarLosCambios(pagina);

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
