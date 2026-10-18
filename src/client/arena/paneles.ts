/**
 * El marcado de la arena (`/arena/`): puro, sin DOM, y por eso con tests —la
 * lección del espectador: un panel que vive en el módulo que toca `document` al
 * importarse no lo prueba nadie—.
 *
 * Todo sale por `html.ts`. Las cifras, el nombre que la persona escribe y las
 * habilidades del cuaderno van por huecos de texto o de atributo; las imágenes
 * por `srcDeImagen`.
 */
import {
  baseCambiada,
  baseDe,
  basesPosibles,
  CASILLAS_MAX,
  CASILLAS_MIN,
  type CatalogoDeLaArena,
  CIFRA_MAXIMA_DE_HEROE,
  cadenaDeBases,
  escritaDe,
  FACCIONES_DE_ARENA,
  fichaDeHeroeDeArena,
  finalDeArena,
  HABILIDADES_DE_LA_ARENA,
  type HeroeDeArena,
  type HojaDeArena,
  LADOS,
  type Lado,
  ladoDe,
  lecturaDelNivel,
  NOMBRE_DE_FACCION_DE_ARENA,
  NOMBRE_DE_RASGO,
  nombreDeHabilidad,
  type SelloDePieza,
  selloDePieza,
  type UnidadDeArena,
  unidadDeCombate,
} from '@core/arena.js';
import {
  type FormaDeMuralla,
  ladosDeLaForma,
  NOMBRE_MAXIMO_DE_FORMA,
  REGLA_DE_LA_MURALLA,
} from '@core/arena-murallas.js';
import {
  activeStack,
  ataqueYDefensaEnBatalla,
  bandoDeSalida,
  cargaDelStack,
  isAlive,
  MAX_ROUNDS,
  piezasDeLaPelea,
} from '@core/battle/battle.js';
import { FORMA_DEL_TABLERO, filasDelTablero } from '@core/battle/board.js';
import { dichoDeLasCifras } from '@core/battle/carga.js';
import { armaduraDe, armasDe } from '@core/battle/damage.js';
import {
  type ClaveConInterruptor,
  type Interruptor,
  MODOS_DE_LA_ARENA,
  type ModosDeArena,
} from '@core/battle/modos.js';
import {
  esMuro,
  ladoDeLaMuralla,
  type MurallaDeBatalla,
  type PiezaDeMuralla,
} from '@core/battle/muralla.js';
import { esDeCura, type Poder, poder, poderDeHabilidad } from '@core/battle/poderes.js';
import {
  DESCRIPCION_DE_REGLA,
  NOMBRES_DE_REGLA,
  type ReglasDeBatalla,
  reglasEncendidas,
} from '@core/battle/reglas.js';
import {
  filasDeLaRueda,
  NIVEL_MAXIMO,
  NOMBRE_DE_GOLPE,
  NORMAL_SIN_NIVEL,
  ruedaDelArmaEnPalabras,
  type TipoDelAnillo,
} from '@core/battle/rueda.js';
import { allSpells, delHeroe, efectoDe } from '@core/battle/spells.js';
import type {
  BattleAction,
  BattleStack,
  BattleState,
  TipoDeEscala,
  TipoDePuerta,
} from '@core/battle/types.js';
import {
  ARMADURA_MAXIMA_DE_PIEZA,
  type ExtrasDePieza,
  esPiezaConBase,
  extrasDe,
  type Pieza,
} from '@core/data.js';
import {
  aDosManos,
  cifrasDePieza,
  DICHO_DEL_USO,
  type EquipoAtado,
  type ModificadorDePieza,
  REGLA_DEL_ESCUDO,
  SIN_ARMA,
  textoDeModificador,
} from '@core/hero/equipo.js';
import {
  type CifraDelHueco,
  type CifraDePieza,
  CREATURE_TRAITS,
  type CreatureTrait,
  camposDelHueco,
  conComa,
  describirCoste,
  esArmaPorUso,
  HUECOS_DE_LA_ARENA,
  type HuecoDeArena,
  NOMBRE_DE_CIFRA,
  NOMBRE_DE_HUECO,
  SPEED_TO_HEXES,
  type UnitInfo,
  USO_DEL_HUECO,
  type UsoDeArma,
} from '@core/types.js';
import { type Html, html, NADA, srcDeImagen, unir } from '../html.js';
import type { SesionDeArena } from '../session.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import {
  accionesDeLaUnidad,
  cifraDeEfecto,
  efectoEnCurso,
  enRondas,
  listaDelCampo,
  modificadoresEnPantalla,
  nota,
  renderBattleLog,
  renderSpells,
} from '../views/panels.js';
import { curaOEfecto, textoDePrevision } from '../views/prevision.js';
import { ruedaDeLaPieza } from './disco.js';
import { abrirFichaBlocker, claveDeFicha, estaAbierta, type FichaEditable } from './edicion.js';

/**
 * Un puesto del montaje: la unidad del borrador que sale, por su id (la de una
 * hoja de las cinco facciones o una nueva; el catálogo del juego no entra en la
 * arena, 13-10-2026). `clave` distingue dos iguales; quién lo mueve es del bando.
 */
export interface Puesto {
  readonly clave: number;
  readonly unidad: string;
  /** Lleva escalera para subir a la muralla: es del montaje, no de la unidad. */
  readonly escalera: boolean;
}

/** Lo que tiene la ficha delante: una unidad o el héroe de un lado. */
export type Elegida =
  | { readonly kind: 'unidad'; readonly id: string }
  | { readonly kind: 'heroe'; readonly lado: Lado };

/** Lo que la tarjeta de un puesto enseña: lo da `main.ts`, que sabe de dónde salen las cifras. */
export interface DatosDePuesto {
  readonly nombre: string;
  readonly resumen: string;
  /** El id del arte de su miniatura. */
  readonly figura: string;
  /**
   * Por qué no usaría una escalera en su lado (`escaleraDeArenaBlocker`), o
   * `null` si la usaría: lo dice la casilla «Lleva escalera».
   */
  readonly noEscala: string | null;
}

/** ¿Es esta la elegida? */
function esLaElegida(e: Elegida | null, p: Puesto): boolean {
  return e !== null && e.kind === 'unidad' && e.id === p.unidad;
}

const DESHABILITADO: Html = html`disabled`;
const MARCADO: Html = html`checked`;

const rutaDeIdentidad = (id: string): string => `/unidades/${id}/identidad.webp`;

/** Los rasgos dichos con palabras, o nada. */
function rasgosDichos(traits: readonly CreatureTrait[] | undefined): string {
  return (traits ?? []).map((t) => NOMBRE_DE_RASGO[t]).join(', ');
}

/**
 * Una línea con las cifras con las que pelea una unidad, su equipo sumado
 * (`unidadDeCombate`), para la tarjeta del bando: también los rasgos, que antes
 * no salían y un guerrero que vuela se veía igual que uno normal (M9 de QA). Y lo
 * que lleva puesto, que es de donde salen.
 */
export function resumenDeCifras(u: UnidadDeArena, piezas: EquipoAtado): string {
  const lleva = piezas.piezasPuestas(u.equipo).map((p) => p.nombre);
  return `${resumenDeUnidad(unidadDeCombate(u, piezas))}${lleva.length === 0 ? '' : ` · lleva ${lleva.join(', ')}`}`;
}

/**
 * Lo mismo para las cifras del motor: ataque, defensa, daño, PV, armadura,
 * casillas y rasgos. Sin tiros ni casillas que ocupa: en la arena no hay munición y toda
 * unidad ocupa una (13-10-2026).
 */
export function resumenDeUnidad(u: UnitInfo): string {
  const rasgos = (u.traits ?? []).length === 0 ? '' : ` · ${rasgosDichos(u.traits)}`;
  // La armadura (#262), solo si la lleva: sin ella la línea es la de siempre.
  const armadura = armaduraDe(u) === 0 ? '' : ` · ${armaduraDe(u)} armadura`;
  return `A ${u.attack} · D ${u.defense} · ${u.damage[0]}–${u.damage[1]} daño · ${u.hp} PV${armadura} · ${SPEED_TO_HEXES[u.speed]} casillas${rasgos}`;
}

// ---------------------------------------------------------------- la lista

/** Qué enseña la lista: todas las hojas o las de una facción. */
export type FiltroDeArena = HojaDeArena['faccion'] | 'todas';

/**
 * Una unidad en la lista: la de una hoja o una nueva (`unidadNueva`). Su id, su
 * nombre, su facción y el retrato de identidad de su hoja (`retrato`). `sello`,
 * lo que la distingue en la lista («nueva»); `incompleta`, por qué no se monta
 * (#140).
 */
export interface TarjetaDeUnidad {
  readonly id: string;
  readonly nombre: string;
  readonly faccion: HojaDeArena['faccion'];
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
        <span class="cost">${NOMBRE_DE_FACCION_DE_ARENA[t.faccion]}</span>
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
  readonly nuevas?: readonly TarjetaDeUnidad[];
  readonly cuerpos?: readonly CuerpoDeLaNueva[];
}

/**
 * El selector de «Nueva unidad»: un desplegable con los cuerpos (el id de su
 * hoja) y el botón que la crea. Lo que se crea lo decide el núcleo
 * (`unidadNueva`); aquí solo se elige.
 */
function renderNuevaUnidad(cuerpos: readonly CuerpoDeLaNueva[]): Html {
  return html`<div class="nueva-unidad" data-nueva-unidad="si">
      <label class="campo"><span class="label">Nueva unidad</span>
        <select data-arena-nueva="si" title="Su cuerpo: con qué figura se pinta. Nace con las cifras mínimas y sin equipo; su nivel sale de sus cifras y sus rasgos">
          <option value="">— elige un cuerpo —</option>
          ${unir(cuerpos.map((h) => html`<option value="${h.id}">${h.nombre}</option>`))}
        </select></label>
      <button data-arena="crear-unidad" title="Crea una unidad nueva con ese cuerpo, las cifras mínimas y sin equipo">Crear</button>
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
 * La lista de unidades: las hojas y, detrás, las unidades nuevas (`nuevas`), por
 * facción. Con `cuerpos`, arriba el selector de «Nueva unidad». Sin el catálogo
 * del juego: en la arena solo están las cinco facciones (13-10-2026).
 */
export function renderCatalogo(
  hojas: readonly HojaDeArena[],
  filtro: FiltroDeArena,
  modo: ModoDelCatalogo = { kind: 'montaje' },
  extra: ListaDeUnidades = {},
): Html {
  const cabecera = cabeceraDeLaLista(modo);
  if (modo.kind === 'edicion' && modo.plegada) return cabecera;
  const nueva = extra.cuerpos === undefined ? NADA : renderNuevaUnidad(extra.cuerpos);
  const botones = unir(
    (['todas', ...FACCIONES_DE_ARENA] as const).map((f) => {
      const nombre = f === 'todas' ? 'Todas' : NOMBRE_DE_FACCION_DE_ARENA[f];
      return html`<button data-arena="filtro" data-faccion="${f}" class="${f === filtro ? 'primary' : ''}">${nombre}</button>`;
    }),
  );
  // Las hojas y, detrás, las nuevas.
  const todas: readonly TarjetaDeUnidad[] = [
    ...hojas.map((h) => ({
      id: h.id,
      nombre: h.nombre,
      faccion: h.faccion,
      retrato: h.id,
      incompleta: h.incompleta,
    })),
    ...(extra.nuevas ?? []),
  ];
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

// ---------------------------------------------------------------- bandos

export function renderBando(
  lado: Lado,
  puestos: readonly Puesto[],
  describir: (p: Puesto) => DatosDePuesto,
  elegida: Elegida | null,
  caben: number,
  heroe: HeroeDeArena | null,
  ocupados: number,
  ia: boolean,
): Html {
  const titulo = `Bando ${LADOS[lado].adjetivo}`;
  const lleno = ocupados >= caben;
  const fichas =
    puestos.length === 0
      ? html`<div class="stack empty">Sin unidades: añádelas desde la lista de la izquierda.</div>`
      : unir(
          puestos.map((p) => {
            const d = describir(p);
            const quien = html`data-arena="editar" data-unidad="${p.unidad}"`;
            return html`<div class="puesto${esLaElegida(elegida, p) ? ' elegida' : ''}" data-puesto="${p.clave}">
              <button class="ver" ${quien} title="Ver y editar sus cifras">
                ${figuraEnLienzo(d.figura, lado, 'puesto')}
              </button>
              <div class="datos">
                <button class="nombre" ${quien} title="Editar sus cifras">${d.nombre}</button>
                <span class="cost">${d.resumen}</span>
                <span class="botones">
                  <button data-arena="duplicar" data-clave="${p.clave}" ${lleno ? DESHABILITADO : NADA}>Duplicar</button>
                  <button data-arena="quitar" data-clave="${p.clave}">Quitar</button>
                </span>
                ${lado === 'izquierda' ? casillaDeEscalera(p, d.noEscala) : NADA}
              </div>
            </div>`;
          }),
        );
  // Quién lo mueve es del bando entero: sus unidades y su héroe.
  return html`<h3 class="cabecera-bando">${titulo} · ${ocupados} de ${caben}
      <span class="botones" title="Quién mueve el bando">
        <button data-arena="manda" data-lado="${lado}" data-ia="no" class="boton-de-cabecera${ia ? '' : ' primary'}">Yo</button>
        <button data-arena="manda" data-lado="${lado}" data-ia="si" class="boton-de-cabecera${ia ? ' primary' : ''}">IA</button>
      </span>
    </h3>
    ${renderHeroeDelBando(lado, heroe, elegida, lleno)}
    <div class="stack-list">${fichas}</div>`;
}

/** La tarjeta del héroe de un lado, o el botón para ponerle uno. */
function renderHeroeDelBando(
  lado: Lado,
  h: HeroeDeArena | null,
  elegida: Elegida | null,
  lleno: boolean,
): Html {
  if (h === null) {
    return html`<div class="stack-list heroe-del-bando"><button data-arena="poner-heroe" data-lado="${lado}" ${lleno ? DESHABILITADO : NADA} title="Un héroe con ataque, defensa, poder, conocimiento y libro de hechizos">+ Héroe</button></div>`;
  }
  const es = elegida?.kind === 'heroe' && elegida.lado === lado;
  return html`<div class="puesto heroe-del-bando${es ? ' elegida' : ''}" data-heroe-del-bando="${lado}">
    <button class="ver" data-arena="editar-heroe" data-lado="${lado}" title="Ver y editar el héroe">
      ${figuraEnLienzo(h.figura ?? FIGURA_GENERICA, lado, 'puesto')}
    </button>
    <div class="datos">
      <button class="nombre" data-arena="editar-heroe" data-lado="${lado}" title="Editar el héroe">${h.nombre}</button>
      <span class="sello">héroe</span>
      <span class="cost">A ${h.ataque} · D ${h.defensa} · Poder ${h.poder} · Conocimiento ${h.conocimiento} · ${h.hechizos.length} hechizos</span>
      <span class="botones">
        <button data-arena="quitar-heroe" data-lado="${lado}">Quitar</button>
      </span>
    </div>
  </div>`;
}

/**
 * El id de arte de la figura genérica del héroe: el `HERO_BODY` del juego,
 * escrito aquí porque el panel no importa `hero.ts` solo por una cadena. Lo
 * comprueba `test/arena.test.ts`.
 */
export const FIGURA_GENERICA = 'hero';

// ---------------------------------------------------------------- reglas

/**
 * Los interruptores de reglas: para cada una, la versión nuestra o la de
 * fheroes2, con lo que dice cada una. Por pelea y para los dos lados (decisión
 * del usuario); van en la URL con la semilla.
 */
export function renderReglas(reglas: ReglasDeBatalla): Html {
  const filas = unir(
    NOMBRES_DE_REGLA.map((n) => {
      const d = DESCRIPCION_DE_REGLA[n];
      const v = reglas[n];
      return html`<div class="regla" data-regla="${n}">
        <span class="nombre">${d.nombre}</span>
        <span class="botones">
          <button data-arena="regla" data-regla="${n}" data-version="nuestra" class="${v === 'nuestra' ? 'primary' : ''}" title="${d.nuestra}">Nuestra</button>
          <button data-arena="regla" data-regla="${n}" data-version="fheroes2" class="${v === 'fheroes2' ? 'primary' : ''}" title="${d.fheroes2}">fheroes2</button>
        </span>
        <span class="cost">${v === 'nuestra' ? d.nuestra : d.fheroes2}</span>
      </div>`;
    }),
  );
  const encendidas = reglasEncendidas(reglas).length;
  return html`<h3>Reglas · ${encendidas === 0 ? 'las del juego' : `${encendidas} de fheroes2`}</h3>
    <div class="reglas">${filas}</div>`;
}

/**
 * Cómo se enseña cada modo con interruptor en el montaje: el título de su
 * sección, el nombre de su fila y, por modo, el rótulo de su botón, lo que dice
 * el título cuando está puesto y su descripción (la del botón y la de la fila).
 * Qué modos hay y cómo van en la URL es del núcleo (`battle/modos.ts`).
 */
interface PresentacionDelModo<K extends ClaveConInterruptor> {
  readonly titulo: string;
  readonly fila: string;
  readonly modos: Readonly<
    Record<
      ModosDeArena[K],
      { readonly rotulo: string; readonly puesto: string; readonly descripcion: string }
    >
  >;
}

const PRESENTACION_DEL_MODO: {
  readonly [K in ClaveConInterruptor]: PresentacionDelModo<K>;
} = {
  golpe: {
    titulo: 'Golpe',
    fila: 'Cuerpo a cuerpo',
    modos: {
      azar: {
        rotulo: 'Azar',
        puesto: 'al azar',
        descripcion: 'la tirada de siempre, entre el mínimo y el máximo de la criatura',
      },
      rueda: {
        rotulo: 'Rueda',
        puesto: 'con la rueda',
        descripcion:
          'cada uno elige un golpe a ciegas en la rueda: el cruce fija el daño y la respuesta es el contraataque',
      },
    },
  },
  contacto: {
    titulo: 'Contacto',
    fila: 'Salir del contacto',
    modos: {
      libre: {
        rotulo: 'Libre',
        puesto: 'libre',
        descripcion: 'salir de una casilla cuesta 1, como siempre',
      },
      paga: {
        rotulo: 'Paga',
        puesto: 'salir cuesta',
        descripcion:
          'salir de una casilla cuesta 1 más por cada enemigo en contacto; si no le llega, no sale (el volador paga al despegar)',
      },
    },
  },
};

/** Lo que mide el lienzo de una figura en cada sitio: el puesto, la rueda y la ficha. */
const TAMAÑO_DE_FIGURA = {
  puesto: [72, 88],
  rueda: [80, 96],
  ficha: [200, 230],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * El lienzo de una figura (`canvas.figura`): lo anima `main.ts` y lo tiñe del
 * color de su bando por `data-lado`; sin lado, la ficha, que es la grande y
 * anima el clip que se elige (`data-ficha-clip`). Decorativo: el nombre va al
 * lado. La única forma del marcado: el puesto, el héroe del bando, la ficha y la
 * cabecera de la rueda.
 */
export function figuraEnLienzo(
  figura: string,
  lado: Lado | null,
  tamaño: keyof typeof TAMAÑO_DE_FIGURA,
): Html {
  const [ancho, alto] = TAMAÑO_DE_FIGURA[tamaño];
  const ficha = tamaño === 'ficha';
  return html`<canvas class="figura${ficha ? ' grande' : ''}" data-figura="${figura}"${lado === null ? NADA : html` data-lado="${lado}"`}${ficha ? html` data-ficha-clip="si"` : NADA} width="${String(ancho)}" height="${String(alto)}" aria-hidden="true"></canvas>`;
}

/**
 * Con qué se pelea si la URL trae un modo que no es: el de siempre, dicho («se
 * pelea con el golpe al azar»). Lo escribe la página detrás del rechazo.
 */
export function modoDeSiempre<K extends ClaveConInterruptor>(d: Interruptor<K>): string {
  const p: PresentacionDelModo<K> = PRESENTACION_DEL_MODO[d.clave];
  return `se pelea con ${p.titulo.toLowerCase()} ${p.modos[d.porDefecto].puesto}`;
}

/**
 * El interruptor de un modo de la arena (`battle/modos.ts`): la rueda del golpe
 * o salir del contacto. Por pelea y para los dos lados; va en la URL
 * (`?golpe=rueda`, `?contacto=paga`), aparte de las reglas.
 */
export function renderModo<K extends ClaveConInterruptor>(
  d: Interruptor<K>,
  modo: ModosDeArena[K],
): Html {
  const p: PresentacionDelModo<K> = PRESENTACION_DEL_MODO[d.clave];
  const boton = (m: ModosDeArena[K]): Html =>
    html`<button data-arena="modo" data-parametro="${d.parametro}" data-modo="${m}" class="${modo === m ? 'primary' : ''}" title="${p.modos[m].descripcion}">${p.modos[m].rotulo}</button>`;
  return html`<h3>${p.titulo} · ${p.modos[modo].puesto}</h3>
    <div class="reglas"><div class="regla" data-modo-del-montaje="${d.parametro}" data-modo="${modo}">
      <span class="nombre">${p.fila}</span>
      <span class="botones">${unir(d.modos.map(boton))}</span>
      <span class="cost">${p.modos[modo].descripcion}</span>
    </div></div>`;
}

/**
 * El enlace de la pelea, si se copió y sigue siendo el del montaje: en un campo
 * para copiarlo a mano cuando el portapapeles no deja (`main.ts` lo intenta).
 */
export function renderEnlace(enlace: string | null): Html {
  if (enlace === null) return NADA;
  return html`<div class="enlace-de-pelea"><h3>Enlace de la pelea</h3>
    <input type="text" readonly data-enlace-de-pelea value="${enlace}" aria-label="Enlace de la pelea"></div>`;
}

/**
 * «Poner escalera» y «Subir» para la unidad activa —tuya—: habilitados si hay
 * contra qué muro, y si no, con el motivo del núcleo en el `title` y debajo.
 * Al pulsarlos con más de un muro al pie, el clic en la columna elige cuál.
 */
function botonesDeEscala(s: VistaDeArena): Html {
  const boton = (tipo: TipoDeEscala, rotulo: string): Html =>
    botonDeElegir({
      accion: 'battle-escala',
      dato: html`data-escala="${tipo}"`,
      clase: 'escala',
      rotulo,
      motivo: s.motivoDeEscala(tipo),
      esperando: s.muroPorElegir === tipo,
    });
  return html`
         ${boton('poner_escalera', 'Poner escalera')}
         ${boton('subir', 'Subir')}`;
}

/**
 * El botón de algo que, con más de una jugada posible, se elige con un clic en el
 * tablero —escala, puerta, poder—: habilitado si se puede, y marcado mientras
 * espera ese clic (`esperando`); si no, deshabilitado con el motivo del núcleo en
 * el `title`. `ayuda`, el `title` cuando se puede. `dato`, el atributo que dice
 * cuál (`data-escala="subir"`), que lee `main.ts`.
 */
function botonDeElegir(o: {
  readonly accion: string;
  readonly dato: Html;
  readonly clase: string;
  readonly rotulo: string;
  readonly motivo: string | null;
  readonly esperando: boolean;
  readonly ayuda?: string;
}): Html {
  const clase = o.motivo === null && o.esperando ? `${o.clase} primary` : o.clase;
  const estado =
    o.motivo !== null
      ? html`disabled title="${o.motivo}"`
      : o.ayuda === undefined
        ? NADA
        : html`title="${o.ayuda}"`;
  return html`<button data-action="${o.accion}" ${o.dato} class="${clase}" ${estado}>${o.rotulo}</button>`;
}

/**
 * «Abrir puerta» y «Cerrar puerta» para la unidad activa —tuya— de quien
 * defiende: habilitados si hay alguna puerta que abrir (o cerrar) ahora, y si
 * no, con el motivo del núcleo en el `title` (tras moverse: «la puerta se abre o
 * se cierra al principio del turno»). Con más de una, el clic en la portada
 * elige cuál.
 */
function botonesDePuerta(s: VistaDeArena): Html {
  const boton = (tipo: TipoDePuerta, rotulo: string): Html =>
    botonDeElegir({
      accion: 'battle-puerta',
      dato: html`data-puerta="${tipo}"`,
      clase: 'puerta',
      rotulo,
      motivo: s.motivoDePuerta(tipo),
      esperando: s.puertaPorElegir === tipo,
    });
  return html`
         ${boton('abrir_puerta', 'Abrir puerta')}
         ${boton('cerrar_puerta', 'Cerrar puerta')}`;
}

/**
 * «Lleva escalera», solo a la izquierda: es el bando que ataca, el único que la
 * usa (al defensor no le hace falta: sube a la muralla andando). A quien no la
 * usaría —vuela— le sale deshabilitada y sin marcar, con el motivo
 * del núcleo (`escaleraDeArenaBlocker`); el puesto la conserva por si la ficha
 * cambia, y la batalla no se la da (`createBattle`).
 */
function casillaDeEscalera(p: Puesto, noLaUsa: string | null): Html {
  if (noLaUsa !== null) {
    const motivo = `No la usa: ${noLaUsa}.`;
    return html`<label class="escalera no-la-usa" title="${motivo}">
                  <input type="checkbox" data-arena="escalera" data-clave="${p.clave}" disabled> Lleva escalera
                  <span class="cost">${motivo}</span>
                </label>`;
  }
  return html`<label class="escalera" title="Puede apoyarla en un muro (un turno) y subir por ella (otro)">
                  <input type="checkbox" data-arena="escalera" data-clave="${p.clave}" ${p.escalera ? MARCADO : NADA}> Lleva escalera
                </label>`;
}

// ---------------------------------------------------------------- ficha

/**
 * Dónde se enseña una ficha: en el montaje, con su figura animada y valiendo para
 * la pelea siguiente; o en el editor de la batalla (`enCombate`), sin figura
 * —la del tablero ya se ve— y valiendo ya. `reglas`, las del montaje o las de la
 * pelea: con ellas se dice qué deja Bendecir.
 */
export interface ComoDeLaFicha {
  readonly enCombate: boolean;
  readonly reglas: ReglasDeBatalla;
  /** Las piezas de la arena (`catalogoDeLaArena`): con ellas se suma el equipo y se ofrece. */
  readonly piezas: EquipoAtado;
  /**
   * Si su título es el campo del nombre (tras pulsar «✎ Editar»): lo pone
   * `main.ts` por la clave de la ficha, y sin él el nombre se lee y no se escribe.
   */
  readonly renombrando?: boolean;
}

/** La ficha del montaje, con las reglas y las piezas que tiene puestas. */
export function enElMontaje(reglas: ReglasDeBatalla, piezas: EquipoAtado): ComoDeLaFicha {
  return { enCombate: false, reglas, piezas };
}

/**
 * Lo que dice la ficha al pie en el editor de la batalla: a quién alcanza el
 * cambio y qué pasa con lo gastado (`retocarEnBatalla`).
 */
export const CAMBIO_EN_COMBATE =
  'En plena pelea: el cambio vale ya para todas las de este tipo en el campo, de los dos bandos, y para la pelea siguiente. Lo gastado sigue gastado: la herida y el maná que ya se fueron se restan de las cifras nuevas (subir la vida no cura). La velocidad nueva cuenta en el orden desde la ronda siguiente y la moral no cambia. La figura del héroe solo se cambia en el montaje.';

/**
 * Lo que hace un poder, en una frase para la ficha y el botón. Que no se suma al
 * hechizo del héroe se dice porque los dos dejan un efecto del mismo origen, que
 * refresca y no se apila (`applyEffect`): se compara, no se da por hecho.
 */
export function queHaceElPoder(p: Poder, reglas: ReglasDeBatalla): string {
  const s = p.hechizo;
  const e = efectoDe(s, p.lanzador, reglas);
  const hace = curaOEfecto(esDeCura(p) ? p.lanzador.cantidad : null, e) ?? '';
  if (esDeCura(p)) return `${hace} a un aliado herido, incluida la propia unidad`;
  const elDelHeroe = efectoDe(s, delHeroe(s, { spellPower: 1 }), reglas);
  const unoSolo = e !== null && elDelHeroe !== null && elDelHeroe.source === e.source;
  return `${hace} a un aliado${unoSolo ? `; es la ${s.name} del héroe: las dos no se suman` : ''}`;
}

/**
 * El título de una ficha: el nombre de lo que enseña y, debajo, qué es. Si el
 * nombre se cambia (`campo`: el atributo con el que lo lee `main.ts`), lleva su
 * botón «✎ Editar» (`renombrar`), y renombrando (`como.renombrando`) el nombre
 * es ese campo. Es el único sitio donde se escribe el nombre: entre las cifras
 * no va (12-10-2026, el usuario: «quita el nombre de las características y pon
 * un botón de editar en el nombre de arriba»).
 */
function tituloDeFicha(
  nombre: string,
  subtitulo: string,
  como: ComoDeLaFicha,
  campo: Html | null,
  notaDelPie: string | null,
): Html {
  const nombreDicho =
    campo !== null && como.renombrando === true
      ? html`<input type="text" class="renombrar" ${campo} value="${nombre}" aria-label="Nombre" title="Intro lo guarda; Escape deja el de antes">`
      : html`<span class="nombre">${nombre}</span>${
          campo === null
            ? NADA
            : html`<button class="boton-de-cabecera" data-arena="renombrar" title="Cambiar el nombre" aria-label="Cambiar el nombre de ${nombre}">✎ Editar</button>`
        }`;
  return html`<header class="titulo-de-ficha">
      <div class="nombre-de-ficha">${nombreDicho}</div>
      <span class="subtitulo">${subtitulo}${notaDelPie === null ? NADA : html` ${nota(notaDelPie)}`}</span>
    </header>`;
}

/**
 * La parte de arriba de una ficha. En el montaje y en la edición, a la izquierda
 * la figura animada, a su lado sus clips en columna (`clips`, más «Girar» y
 * `siempre`) y a la derecha las cifras (`cifras`); si la columna es estrecha, las
 * cifras bajan (`arena.css`). En el editor de la batalla, sin figura —la del
 * tablero ya se ve—: las cifras a todo el ancho y, encima, `siempre` (volver a
 * las del catálogo), lo único de la columna que vale también allí.
 */
function cabezaDeFicha(o: {
  readonly figura: string;
  readonly como: ComoDeLaFicha;
  readonly clips: Html;
  readonly siempre?: Html;
  readonly cifras: Html;
}): Html {
  const siempre = o.siempre ?? NADA;
  if (o.como.enCombate) {
    return html`<div class="cabeza sin-retrato">
      ${siempre === NADA ? NADA : html`<div class="botones">${siempre}</div>`}
      <div class="cifras">${o.cifras}</div>
    </div>`;
  }
  return html`<div class="cabeza">
      <div class="retrato">
        ${figuraEnLienzo(o.figura, null, 'ficha')}
        <div class="clips">
          ${o.clips}
          <button data-arena="girar" title="Pasa la figura por sus ocho direcciones">Girar</button>
          ${siempre}
        </div>
      </div>
      <div class="cifras">${o.cifras}</div>
    </div>`;
}

/**
 * Una etiqueta con su ×: una habilidad o un rasgo puesto. `quitar`, los
 * atributos del botón que lo quita.
 */
function etiquetaConQuitar(texto: string, quitar: Html, detras: Html = NADA): Html {
  return html`<span class="etiqueta">${texto}${detras === NADA ? NADA : html` ${detras}`} <button ${quitar} title="Quitar" aria-label="Quitar ${texto}">×</button></span>`;
}

/**
 * Adónde va el foco al quitar con el teclado la etiqueta `quitado` (M2 de QA,
 * 12-10-2026): al × de la siguiente de su grupo (`enSuGrupo`, en el orden en que
 * se pintan), y si era la última, `null`: el desplegable «Añadir» de su ficha.
 * Sin esto el foco caía al `body`, porque el botón pulsado ya no existe tras
 * repintar. Lo mismo para rasgos y habilidades.
 */
export function focoTrasQuitar(enSuGrupo: readonly string[], quitado: string): string | null {
  const i = enSuGrupo.indexOf(quitado);
  if (i < 0) throw new Error(`no hay ninguna etiqueta «${quitado}» que quitar en su grupo`);
  return enSuGrupo[i + 1] ?? null;
}

/**
 * Los rasgos del motor de una ficha, como las habilidades: los puestos, en
 * etiquetas con su ×, y los demás de `CREATURE_TRAITS` en un desplegable para
 * añadir (12-10-2026: antes eran trece casillas, que ocupaban media ficha para
 * decir uno o dos). Lo que no se puede poner lo dice el validador al añadirlo.
 */
function rasgosDeLaFicha(puestos: readonly CreatureTrait[]): Html {
  const etiquetas =
    puestos.length === 0
      ? html`<span class="cost">Ninguno.</span>`
      : unir(
          puestos.map((t) =>
            etiquetaConQuitar(
              NOMBRE_DE_RASGO[t],
              html`data-arena="quitar-rasgo" data-rasgo="${t}"`,
            ),
          ),
        );
  const libres = CREATURE_TRAITS.filter((t) => !puestos.includes(t));
  const añadir =
    libres.length === 0
      ? NADA
      : html`<label class="campo"><span class="label">Añadir</span>
        <select data-arena-rasgo="si"><option value="">— elige —</option>${unir(
          libres.map((t) => html`<option value="${t}">${NOMBRE_DE_RASGO[t]}</option>`),
        )}</select></label>`;
  return html`<h3>Rasgos del motor ${nota(NOTA_DE_LOS_RASGOS)}</h3>
      <div class="etiquetas rasgos-puestos">${etiquetas}</div>
      ${añadir}`;
}

/** Lo que dice la nota de los rasgos del motor. */
const NOTA_DE_LOS_RASGOS =
  'Lo que el motor sabe hacer en la pelea (volar, doble golpe, no-muerto…). Lo que no se puede poner a esta unidad lo dice la barra al añadirlo.';

/**
 * Lo que decía el pie de una ficha —a quién alcanza el cambio—, que ahora es la
 * nota de su título (`tituloDeFicha`). En el montaje, `enElMontaje` si dice algo.
 */
function notaDelPie(como: ComoDeLaFicha, enElMontaje: string | null): string | null {
  return como.enCombate ? CAMBIO_EN_COMBATE : enElMontaje;
}

/**
 * El nivel de la ficha, que no se escribe: «Índice 340 · nivel 3», calculado por
 * el núcleo de las cifras sin equipo (`lecturaDelNivel`). Va encima de las cifras
 * y se repinta con la ficha, así que cambia al tocar cualquiera de ellas.
 */
function filaDelNivel(lectura: string): Html {
  return html`<div class="row nivel-de-la-ficha" data-nivel-de-la-ficha="si"><span class="label">Nivel</span><span>${lectura}</span></div>`;
}

/** «De 0 en adelante.», «De 2 a 7.»: el rango de una cifra, para su nota. */
function rangoDicho(minimo: number | null, maximo: number | null): string {
  if (minimo === null) return maximo === null ? 'Puede restar.' : `Hasta ${maximo}.`;
  return maximo === null ? `De ${minimo} en adelante.` : `De ${minimo} a ${maximo}.`;
}

/**
 * Una fila de la tabla de cifras: su rótulo corto, su nota (lo que antes iba
 * entre paréntesis en el rótulo, y su rango), la casilla que se escribe —o
 * ninguna, una cifra que solo se lee— y el valor final con el que pelea.
 */
interface FilaDeCifra {
  /** Lo que la distingue en el marcado (`data-cifra-de-la-ficha`, `data-final`). */
  readonly clave: string;
  readonly rotulo: string;
  /** Qué es, si hace falta decirlo; la nota añade el rango de la casilla. */
  readonly nota?: string;
  /**
   * La casilla que se escribe: el atributo con que la lee `main.ts`
   * (`data-campo="attack"`…), su valor y su rango. Sin ella, la cifra solo se lee.
   */
  readonly casilla?: {
    readonly atributo: Html;
    readonly valor: number;
    /** Sin él, la casilla no tiene tope por abajo (el extra de una pieza, que puede restar). */
    readonly minimo?: number;
    readonly maximo?: number;
  };
  /**
   * Con todos los modificadores: lo que pelea. Una cifra, o cómo queda dicho en
   * una línea cuando no es una (un tipo de la rueda con el arma: «Daño ×1,45»).
   */
  readonly final: number | string;
  /**
   * Sin casilla, lo que valdría sin modificadores (la armadura: 0, el cuerpo no
   * lleva): el final va en el otro tono si no es esto, como con la casilla (A5 de
   * QA de #262). Sin casilla ni esto, el final no se compara con nada.
   */
  readonly sinModificar?: number;
  /**
   * Si el final va en el otro tono, dicho a mano: cuando el final no es una cifra
   * que se pueda comparar con la casilla (la rueda: cambia si el arma suma algo).
   */
  readonly cambia?: boolean;
}

/**
 * Las cifras de una ficha en una tabla de una columna (13-10-2026, el usuario:
 * «las características en una sola columna con su valor y después otra casilla no
 * editable con el valor final, aplicados todos los modificadores»): una fila por
 * cifra con su rótulo y su nota, la casilla que se escribe y, a la derecha, el
 * final, que no se escribe (un `<output>`) y va en otro tono si no es el escrito.
 * `columna`, cómo se llama lo escrito («Cuerpo», «Catálogo», «Héroe»), con su
 * nota; `notaDelFinal`, de dónde sale el final; `marca`, un atributo de la tabla
 * (con su espacio delante) con que la encuentran las pruebas (la rueda de una
 * pieza). **La única tabla de
 * cifras**: la de una unidad, la de un héroe, la de una pieza y su rueda.
 */
function tablaDeCifras(
  columna: { readonly nombre: string; readonly nota: string },
  notaDelFinal: string,
  filas: readonly FilaDeCifra[],
  marca: Html = NADA,
): Html {
  const cuerpo = unir(
    filas.map((f) => {
      const c = f.casilla;
      const dicho = [
        f.nota ?? null,
        c === undefined
          ? 'Se deriva: no se escribe.'
          : rangoDicho(c.minimo ?? null, c.maximo ?? null),
      ]
        .filter((x) => x !== null)
        .join(' ');
      const escrita =
        c === undefined
          ? html`<span class="sin-casilla" aria-hidden="true">—</span>`
          : html`<input type="number" ${c.atributo} value="${c.valor}" ${c.minimo === undefined ? NADA : html`min="${c.minimo}"`} ${c.maximo === undefined ? NADA : html`max="${c.maximo}"`} step="1" aria-label="${f.rotulo}" aria-description="${dicho}">`;
      const escrito = c?.valor ?? f.sinModificar;
      const cambia = f.cambia ?? (escrito !== undefined && f.final !== escrito);
      return html`<tr data-cifra-de-la-ficha="${f.clave}">
        <th scope="row">${f.rotulo} ${nota(dicho, false)}</th>
        <td class="escrita">${escrita}</td>
        <td class="final"><output class="${cambia ? 'cambiada' : 'igual'}" data-final="${f.clave}" aria-label="${f.rotulo}, final">${f.final}</output></td>
      </tr>`;
    }),
  );
  return html`<table class="tabla-de-cifras"${marca}>
      <thead><tr><th scope="col"><span class="solo-lector">Cifra</span></th><th scope="col">${columna.nombre} ${nota(columna.nota)}</th><th scope="col">Final ${nota(notaDelFinal)}</th></tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>`;
}

/**
 * Las filas de las cifras de una unidad: las de `UnitInfo` que se escriben (la
 * velocidad, en casillas), cada una con lo que pelea (`final`). `atributo`, el
 * nombre del atributo con que la lee `main.ts` (`data-campo`): el valor es el
 * campo (`attack`, `damage-min`…). Sin disparos ni casillas que ocupa: en la
 * arena dispara quien lleva arma a distancia, sin munición, y toda unidad ocupa
 * una (13-10-2026).
 */
function filasDeUnidad(
  escrito: Pick<UnitInfo, 'attack' | 'defense' | 'damage' | 'hp'> & {
    readonly casillas: number;
  },
  final: UnitInfo,
  atributo: (campo: string) => Html,
): FilaDeCifra[] {
  const fila = (
    campo: string,
    rotulo: string,
    valor: number,
    fin: number,
    minimo: number,
    extra: { readonly nota?: string; readonly maximo?: number } = {},
  ): FilaDeCifra => ({
    clave: campo,
    rotulo,
    ...(extra.nota === undefined ? {} : { nota: extra.nota }),
    casilla: {
      atributo: atributo(campo),
      valor,
      minimo,
      ...(extra.maximo === undefined ? {} : { maximo: extra.maximo }),
    },
    final: fin,
  });
  return [
    fila('attack', NOMBRE_DE_CIFRA.ataque, escrito.attack, final.attack, 0),
    fila('defense', NOMBRE_DE_CIFRA.defensa, escrito.defense, final.defense, 0),
    filaDeArmadura(final),
    fila('damage-min', `${NOMBRE_DE_CIFRA.danio} mínimo`, escrito.damage[0], final.damage[0], 1, {
      nota: 'No más que el máximo.',
    }),
    fila('damage-max', `${NOMBRE_DE_CIFRA.danio} máximo`, escrito.damage[1], final.damage[1], 1, {
      nota: 'No menos que el mínimo.',
    }),
    fila('hp', NOMBRE_DE_CIFRA.pv, escrito.hp, final.hp, 1, { nota: 'La vida de cada uno.' }),
    fila(
      'casillas',
      NOMBRE_DE_CIFRA.velocidad,
      escrito.casillas,
      SPEED_TO_HEXES[final.speed],
      CASILLAS_MIN,
      { nota: 'En casillas por turno.', maximo: CASILLAS_MAX },
    ),
  ];
}

/**
 * La fila de la armadura (#262): sin casilla, porque el cuerpo no la tiene (la
 * dan las piezas de la arena), y con su final, lo que se resta de cada golpe.
 */
function filaDeArmadura(final: UnitInfo): FilaDeCifra {
  return {
    clave: 'armadura',
    rotulo: NOMBRE_DE_CIFRA.armadura,
    nota: 'La suma de la de sus piezas: se resta del daño de cada golpe, disparo o hechizo que recibe, y puede dejarlo en 0.',
    final: armaduraDe(final),
    // Toda la armadura es del equipo: el cuerpo no lleva.
    sinModificar: 0,
  };
}

/**
 * El equipo de la ficha: una fila por hueco (`HUECOS_DE_LA_ARENA`), con la pieza puesta, lo
 * que suma y su × o «—», y un desplegable con las piezas de ese hueco (las de la
 * arena: las del juego en su orden, cambiadas si lo están, y las nuevas detrás)
 * para ponerle otra. Sin reglas: lo que no se
 * puede poner —un escudo con un arma a dos manos— lo rechaza el núcleo
 * (`manosBlocker`) y sale en la barra.
 */
function equipoDeLaFicha(u: UnidadDeArena, piezas: EquipoAtado): Html {
  const filas = unir(
    HUECOS_DE_LA_ARENA.map((hueco) => {
      const id = u.equipo[hueco];
      const p = id === undefined ? null : piezas.pieza(id);
      const puesta =
        p === null
          ? html`<span class="cost">—</span>`
          : etiquetaConQuitar(
              p.nombre,
              html`data-arena="quitar-pieza" data-hueco="${hueco}"`,
              modificadoresEnPantalla(p),
            );
      const opciones = unir(
        [...piezas.piezas.values()]
          .filter((x) => x.hueco === hueco && x.id !== id)
          .map(
            (x) =>
              html`<option value="${x.id}">${x.nombre} · ${cifrasDePieza(x) || 'no suma nada'}</option>`,
          ),
      );
      return html`<div class="hueco" data-hueco-de-la-ficha="${hueco}">
        <span class="label">${NOMBRE_DE_HUECO[hueco]}</span> ${puesta}
        <label class="campo"><span class="label">Poner</span>
          <select data-arena-pieza="${hueco}"><option value="">— elige —</option>${opciones}</select></label>
      </div>`;
    }),
  );
  return html`<h3>Equipo ${nota(`Suma a las cifras del cuerpo y no cambia el nivel. Lo que no es arma suma a todo golpe; cada arma, solo al suyo (abajo, «Armas»): ${NOMBRE_DE_HUECO.arma} al cuerpo a cuerpo, ${NOMBRE_DE_HUECO.distancia} al disparo y ${NOMBRE_DE_HUECO.carga} a la carga. Regla: ${REGLA_DEL_ESCUDO}; las manos son las del arma de cuerpo a cuerpo.`)}</h3>
      <div class="equipo-de-la-ficha">${filas}</div>`;
}

/**
 * Las armas de una unidad, una fila por golpe (`armasDe`, del núcleo, con los
 * nombres de `piezas`): para qué, con cuál —o `SIN_ARMA`— y con qué ataque y daño
 * lo da, y en su nota cuándo se usa (`DICHO_DEL_USO`). Un arma puesta que no se
 * usa —una lanza sin el rasgo Carga— lo dice.
 * `ataqueEnLaPelea` da el ataque de ese golpe en la pelea (sus efectos y su
 * héroe), si lo hay; si no, el de sus cifras.
 */
function filasDeArmas(
  unidad: UnitInfo,
  piezas: EquipoAtado,
  cargaAPie: boolean,
  ataqueEnLaPelea?: (uso: UsoDeArma) => number,
): Html {
  return unir(
    armasDe(unidad, piezas, cargaAPie).map((a) => {
      const con = a.arma ?? SIN_ARMA;
      const ataque = ataqueEnLaPelea?.(a.uso) ?? a.attack;
      const cifras =
        a.sinUso !== null
          ? a.sinUso
          : `${NOMBRE_DE_CIFRA.ataque} ${conComa(ataque, 1)} · ${NOMBRE_DE_CIFRA.danio} ${a.damage[0]}–${a.damage[1]}`;
      // Lo que cobra la carga, en su propio trozo sin cortes: con las cifras en uno
      // solo, la fila pedía 398 px en un panel de 274.
      const cobra =
        a.carga === null || a.sinUso !== null
          ? NADA
          : html` <span class="cifras-del-arma">· ${dichoDeLasCifras(a.carga)}</span>`;
      const { rotulo, cuando } = DICHO_DEL_USO[a.uso];
      return html`<div class="row" data-arma-de-la-ficha="${a.uso}"><span class="label">${rotulo} ${nota(cuando)}</span><span class="golpe-del-arma"><span>${con} ·</span> <span class="cifras-del-arma">${cifras}</span>${cobra}</span></div>`;
    }),
  );
}

/** «Armas» en la ficha de una unidad del borrador: lo que pelea, golpe a golpe. */
function armasDeLaFicha(combate: UnitInfo, piezas: EquipoAtado): Html {
  return html`<h3>Armas ${nota('Cada golpe va con las cifras de su arma: el ataque y el daño del cuerpo, con lo que suma todo el equipo y, del arma, solo la de ese golpe. La columna «Final» de arriba es la del cuerpo a cuerpo.')}</h3>
      <div class="armas-de-la-ficha">${filasDeArmas(combate, piezas, MODOS_DE_LA_ARENA.cargaAPie)}</div>`;
}

/**
 * Lo que dice la barra al crear una unidad nueva (`unidadNueva`). El nivel se
 * **lee** del índice, el mismo de su ficha (`lecturaDelNivel` de lo que pelea):
 * decía «nivel 1» escrito a mano y la ficha de al lado, «Índice 217 · nivel 2»,
 * con un Paladín (R1 de la re-verificación de QA, 12-10-2026). En la edición no
 * hay bandos y su ficha ya está abierta.
 */
export function avisoDeNuevaUnidad(
  u: UnidadDeArena,
  escena: 'montaje' | 'edicion',
  piezas: EquipoAtado,
): string {
  const como = `Nueva unidad «${u.name}», sin equipo (${lecturaDelNivel(unidadDeCombate(u, piezas))})`;
  return escena === 'edicion'
    ? `${como}: su ficha está abierta.`
    : `${como}: añádela a un bando o cambia su ficha.`;
}

/**
 * La primera frase de la barra al leer el borrador de unidades: cuántas valen. Un
 * archivo con solo unidades que no valen **sí** es un borrador guardado: decía
 * «Sin borrador guardado todavía» y, en la misma barra, la lista de las que no
 * valen (R4 de la re-verificación de QA). Lo que no vale lo cuenta la página
 * después, con sus motivos.
 */
export function avisoDelBorradorLeido(ruta: string, validas: number, sinValidar: number): string {
  if (validas > 0) return `Cargado ${ruta}: ${validas} ${validas === 1 ? 'unidad' : 'unidades'}.`;
  if (sinValidar > 0) {
    return `Cargado ${ruta}: ninguna unidad vale, y ${sinValidar === 1 ? 'la que trae se conserva' : `las ${sinValidar} que trae se conservan`} tal cual al guardar; mientras, las unidades salen con cifras por defecto, inventadas.`;
  }
  return `Sin borrador guardado todavía (${ruta}): las unidades salen con cifras por defecto, inventadas.`;
}

/**
 * Lo que no vale de un borrador al leerlo: `de` lo nombra y `noValen` trae una
 * frase por unidad o pieza, con su motivo. Se conservan tal cual al guardar.
 */
export interface AvisosDeLectura {
  readonly de: string;
  readonly noValen: readonly string[];
}

/** Cuántas frases traen las lecturas: lo que dice el botón de la barra. */
export function cuantosAvisos(grupos: readonly AvisosDeLectura[]): number {
  return grupos.reduce((n, g) => n + g.noValen.length, 0);
}

/**
 * Lo que no vale de los borradores, entero, en un recuadro que se despliega desde
 * la barra (H1 de QA, 14-10-2026): en la barra, cortada a dos líneas, el motivo se
 * quedaba en la parte que no se ve. Se abre solo al arrancar si hay algo que decir
 * y se cierra con «Entendido»; la barra lleva el resumen (`resumenDeLaLectura`) y
 * el botón para volver a abrirlo.
 */
export function renderAvisosDeLectura(grupos: readonly AvisosDeLectura[]): Html {
  const conAlgo = grupos.filter((g) => g.noValen.length > 0);
  if (conAlgo.length === 0) return NADA;
  const total = cuantosAvisos(conAlgo);
  const bloques = unir(
    conAlgo.map(
      (g) => html`<div class="lectura">
        <p class="de">${g.de}</p>
        <p class="que">No valen, y «Guardar» las conserva tal cual:</p>
        <ul class="no-valen">${unir(g.noValen.map((f) => html`<li>${f}</li>`))}</ul>
      </div>`,
    ),
  );
  return html`<h3 class="cabecera-avisos">Al leer el borrador · ${total} ${total === 1 ? 'no vale' : 'no valen'}
      <button data-arena="cerrar-avisos" title="Cierra el recuadro: se vuelve a abrir con «${ROTULO_DE_LOS_AVISOS}», en la barra">Entendido</button></h3>
    ${bloques}`;
}

/** El botón de la barra que despliega lo que no vale de lo leído. */
export const ROTULO_DE_LOS_AVISOS = 'Avisos al leer';

/**
 * Lo que dice la barra de lo que no vale al leer: cuántos y dónde leerlos enteros
 * (`renderAvisosDeLectura`). Vacío si todo vale.
 */
export function resumenDeLaLectura(grupos: readonly AvisosDeLectura[]): string {
  const n = cuantosAvisos(grupos);
  if (n === 0) return '';
  return ` ${n === 1 ? 'Una no vale' : `${n} no valen`} y se ${n === 1 ? 'conserva' : 'conservan'} tal cual al guardar: ${n === 1 ? 'su motivo se lee entero' : 'sus motivos se leen enteros'} con «${ROTULO_DE_LOS_AVISOS}», en esta barra.`;
}

/**
 * La ficha de la unidad elegida. `dispara`: si su figura trae el clip del
 * disparo (`ArteDeFigura.dispara`); solo entonces lleva su botón, porque a
 * quien no lo trae no hay disparo que enseñarle. Las cifras que se escriben son
 * las del CUERPO, de las que sale el nivel; con el equipo encima se pelea, y la
 * columna «Final» de su tabla lo dice (`tablaDeCifras`).
 */
export function renderFicha(u: UnidadDeArena | null, dispara: boolean, como: ComoDeLaFicha): Html {
  if (u === null) {
    return html`<h3>Ficha</h3><p class="cost">Pulsa el nombre de una unidad de un bando para ver y cambiar sus cifras.</p>`;
  }
  // Con lo que pelea, una vez: el nivel lo mide sin el equipo (`sinEquipo`) y la
  // columna «Final» lo enseña con él.
  const combate = unidadDeCombate(u, como.piezas);
  // Las habilidades que dan un poder actúan en la pelea; las demás, todavía no.
  const etiqueta = (h: string): Html =>
    etiquetaConQuitar(
      nombreDeHabilidad(h),
      html`data-arena="quitar-habilidad" data-habilidad="${h}"`,
    );
  const conPoder: { readonly h: string; readonly p: Poder }[] = [];
  const inertes: string[] = [];
  for (const h of u.habilidades) {
    const id = poderDeHabilidad(h);
    if (id === null) inertes.push(h);
    else conPoder.push({ h, p: poder(id) });
  }
  const poderes =
    conPoder.length === 0
      ? html`<span class="cost">Ninguno.</span>`
      : unir(
          conPoder.map(
            ({ h, p }) =>
              html`<div class="poder" data-poder-de-la-ficha="${p.id}">${etiqueta(h)} ${nota(`${queHaceElPoder(p, como.reglas)}.`)}</div>`,
          ),
        );
  const puestas =
    inertes.length === 0 ? html`<span class="cost">Ninguna.</span>` : unir(inertes.map(etiqueta));
  const libres = unir(
    HABILIDADES_DE_LA_ARENA.filter((h) => !u.habilidades.includes(h)).map(
      (h) => html`<option value="${h}">${nombreDeHabilidad(h)}</option>`,
    ),
  );
  return html`<div class="ficha" data-clave-de-ficha="${claveDeFicha({ kind: 'unidad', id: u.id })}">
      ${tituloDeFicha(
        u.name,
        `Ficha · ${NOMBRE_DE_FACCION_DE_ARENA[u.faction]}`,
        como,
        html`data-campo="name"`,
        notaDelPie(
          como,
          'El cambio vale para todas las unidades de este tipo, en la batalla siguiente.',
        ),
      )}
      ${cabezaDeFicha({
        figura: u.cuerpo.hoja,
        como,
        clips: html`<button data-arena="clip" data-clip="idle">Reposo</button>
          <button data-arena="clip" data-clip="walk">Marcha</button>
          <button data-arena="clip" data-clip="charge">Carga</button>
          <button data-arena="clip" data-clip="attack">Ataque</button>
          ${dispara ? html`<button data-arena="clip" data-clip="shoot">Disparo</button>` : NADA}
          <button data-arena="clip" data-clip="hurt">Daño</button>
          <button data-arena="clip" data-clip="death">Muerte</button>`,
        cifras: html`${filaDelNivel(lecturaDelNivel(combate))}
      ${tablaDeCifras(
        {
          nombre: 'Cuerpo',
          nota: 'Las cifras del cuerpo, sin el equipo: de ellas sale el nivel.',
        },
        'Con lo que pelea: el cuerpo con el equipo puesto. En otro tono, la que el equipo cambia.',
        [
          ...filasDeUnidad(u, combate, (c) => html`data-campo="${c}"`),
          {
            clave: 'leadership',
            rotulo: 'Liderazgo',
            nota: 'Lo que cuenta cada uno en el liderazgo de su bando.',
            casilla: { atributo: html`data-campo="leadership"`, valor: u.leadership, minimo: 1 },
            final: u.leadership,
          },
          {
            clave: 'gold',
            rotulo: 'Coste',
            nota: 'En oro.',
            casilla: { atributo: html`data-campo="gold"`, valor: u.cost.gold, minimo: 0 },
            final: u.cost.gold,
          },
        ],
      )}`,
      })}
      ${equipoDeLaFicha(u, como.piezas)}
      ${armasDeLaFicha(combate, como.piezas)}
      ${rasgosDeLaFicha(u.traits)}
      <h3>Poderes · actúan en la pelea ${nota('Se usan en su turno en vez de golpear, al principio, sin haberse movido: el turno entero. Lo que hace cada uno, en la nota de su etiqueta.')}</h3>
      <div class="etiquetas poderes">${poderes}</div>
      <h3>Habilidades · sin efecto todavía ${nota('Se guardan con la unidad, pero solo Curar y Bendecir tienen motor: en la pelea, de lo demás, solo cuentan los rasgos.')}</h3>
      <div class="etiquetas">${puestas}</div>
      <label class="campo"><span class="label">Añadir</span>
        <select data-arena-habilidad="si"><option value="">— elige —</option>${libres}</select></label>
    </div>`;
}

/**
 * La ficha del héroe de un lado: su figura (una hoja de héroe o la genérica), sus
 * cuatro cifras, su libro y los valores con los que pelea, que salen del núcleo
 * (`fichaDeHeroeDeArena`) con las reglas del montaje.
 */
export function renderFichaDeHeroe(
  lado: Lado,
  h: HeroeDeArena,
  como: ComoDeLaFicha,
  hojasDeHeroe: readonly { readonly id: string; readonly nombre: string }[],
): Html {
  const { reglas } = como;
  const ficha = fichaDeHeroeDeArena(h, reglas, como.piezas);
  const c = ficha.cuerpo;
  const figuras = unir([
    html`<option value="" ${h.figura === null ? html`selected` : NADA}>Genérica del juego</option>`,
    ...hojasDeHeroe.map(
      (x) =>
        html`<option value="${x.id}" ${h.figura === x.id ? html`selected` : NADA}>${x.nombre}</option>`,
    ),
  ]);
  const escrita = (
    campo: string,
    rotulo: string,
    valor: number,
    minimo: number,
    final: number,
    queEs?: string,
  ): FilaDeCifra => ({
    clave: campo,
    rotulo,
    ...(queEs === undefined ? {} : { nota: queEs }),
    casilla: {
      atributo: html`data-heroe-campo="${campo}"`,
      valor,
      minimo,
      maximo: CIFRA_MAXIMA_DE_HEROE,
    },
    final,
  });
  const delCuerpo = (clave: string, rotulo: string, final: number): FilaDeCifra => ({
    clave,
    rotulo,
    nota: 'De su cuerpo en el tablero, con su rango y el equipo base.',
    final,
  });
  const libro = unir(
    allSpells().map(
      (s) =>
        html`<label class="rasgo"><input type="checkbox" data-heroe-hechizo="${s.id}" ${h.hechizos.includes(s.id) ? MARCADO : NADA}> ${s.name} (${s.cost})</label>`,
    ),
  );
  const rinde = unir(
    ficha.hechizos.map((x) => {
      const que =
        x.rinde !== null
          ? `${x.rinde} ${x.id === 'cure' ? 'PV de cura' : 'de daño'}`
          : x.efecto === null
            ? ''
            : `${cifraDeEfecto(x.efecto.kind, x.efecto.amount)}, ${enRondas(x.efecto.roundsLeft)}`;
      return html`<div class="row"><span class="label">${x.nombre} (${x.coste})</span><span>${que}</span></div>`;
    }),
  );
  return html`<div class="ficha" data-clave-de-ficha="${claveDeFicha({ kind: 'heroe', lado })}">
      ${tituloDeFicha(
        h.nombre,
        `Ficha · héroe del bando ${LADOS[lado].adjetivo}`,
        como,
        html`data-heroe-campo="nombre"`,
        notaDelPie(como, null),
      )}
      ${cabezaDeFicha({
        figura: h.figura ?? FIGURA_GENERICA,
        como,
        clips: NADA,
        cifras: html`<label class="campo figura-del-heroe"><span class="label">Figura</span>
        <select data-heroe-campo="figura">${figuras}</select></label>
      ${filaDelNivel(lecturaDelNivel(c))}
      ${tablaDeCifras(
        { nombre: 'Héroe', nota: 'Las cifras del héroe, las que se escriben.' },
        'Con lo que pelea: su cuerpo en el tablero suma a su ataque y su defensa los de su rango y su equipo base; las demás, de su cuerpo, no se escriben.',
        [
          escrita('ataque', NOMBRE_DE_CIFRA.ataque, h.ataque, 0, c.attack),
          escrita('defensa', NOMBRE_DE_CIFRA.defensa, h.defensa, 0, c.defense),
          filaDeArmadura(c),
          escrita(
            'poder',
            'Poder',
            h.poder,
            1,
            h.poder,
            'Lo que rinden sus hechizos y cuántas rondas dura lo que lanza.',
          ),
          escrita(
            'conocimiento',
            'Conocimiento',
            h.conocimiento,
            0,
            h.conocimiento,
            'Su maná: 10 por punto.',
          ),
          delCuerpo('damage-min', `${NOMBRE_DE_CIFRA.danio} mínimo`, c.damage[0]),
          delCuerpo('damage-max', `${NOMBRE_DE_CIFRA.danio} máximo`, c.damage[1]),
          delCuerpo('hp', NOMBRE_DE_CIFRA.pv, c.hp),
          delCuerpo('casillas', NOMBRE_DE_CIFRA.velocidad, SPEED_TO_HEXES[c.speed]),
        ],
      )}`,
      })}
      <h3>Libro de hechizos</h3>
      <div class="rasgos">${libro}</div>
      <h3>En la pelea</h3>
      <div class="efectivos">
        ${
          // Con nuestra regla el héroe no suma nada a su tropa: la fila no diría
          // nada que no sea una aclaración (H4 de QA, 13-10-2026), y se quita.
          reglas.heroe === 'fheroes2'
            ? html`<div class="row" data-a-la-tropa="si"><span class="label">A la tropa ${nota('Regla de fheroes2: el héroe suma su ataque y su defensa a toda su tropa.')}</span><span>+${h.ataque} de ataque y +${h.defensa} de defensa</span></div>`
            : NADA
        }
        <div class="row" data-mana-de-la-ficha="${ficha.mana}"><span class="label">Maná ${nota('10 × Conocimiento.')}</span><span>${ficha.mana}</span></div>
        <div class="row"><span class="label">Duración de lo que lanza ${nota('Tantas rondas como su Poder.')}</span><span>${enRondas(ficha.duracion)}</span></div>
        ${rinde}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- equipo

/** Lo que la vista «Editar equipo» enseña: lo da `main.ts`, que tiene las piezas y el borrador. */
export interface VistaDeEquipo {
  /** Las piezas de la arena (`catalogoDeLaArena`), en su orden, resueltas y escritas. */
  readonly piezas: CatalogoDeLaArena;
  /** La pieza de la ficha, por su id, o `null`. */
  readonly elegida: string | null;
  /** Los nombres de las unidades del borrador que llevan la pieza `id`. */
  readonly llevan: (id: string) => readonly string[];
  /**
   * La pieza de id `id` con que se pelea ahora si no es la que se enseña: la de un
   * enlace abierto, que «Guardar» no escribe; `null` si es la misma.
   */
  readonly enLaPelea: (id: string) => Pieza | null;
  /** El último rechazo, si sigue siendo el aviso: la ficha lo pinta en su color. */
  readonly rechazo: string | null;
  /** Si hay pelea en curso: el cambio vale ya en ella. */
  readonly enCombate: boolean;
  /** Lo que queda por guardar, en una frase, o vacío (`sinGuardarEnPalabras`). */
  readonly sinGuardar: string;
}

/**
 * Lo que queda por guardar dicho en una frase: «Sin guardar: 1 pieza y 2
 * unidades.», o vacío si nada. Lo leen la vista «Editar equipo» y la barra.
 */
export function sinGuardarEnPalabras(piezas: number, unidades: number): string {
  const partes = [
    piezas === 0 ? null : `${piezas} ${piezas === 1 ? 'pieza' : 'piezas'}`,
    unidades === 0 ? null : `${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}`,
  ].filter((x) => x !== null);
  return partes.length === 0 ? '' : `Sin guardar: ${partes.join(' y ')}.`;
}

/** Lo que dice el servidor al guardar (`escribirBorrador`): dónde, cuántas de cada, y lo conservado. */
export interface Guardado {
  readonly ruta?: string;
  readonly unidades?: number;
  readonly conservadas?: number;
  readonly rutaDePiezas?: string;
  readonly piezas?: number;
  readonly piezasConservadas?: number;
}

/**
 * Lo guardado dicho en una frase: «Guardado en …: 3 unidades. Y en …: 1 pieza.»,
 * con lo que no vale y se conserva tal cual. Junto a `sinGuardarEnPalabras`: son
 * las dos caras de «Guardar».
 */
export function guardadoEnPalabras(g: Guardado): string {
  const parte = (ruta: string | undefined, n: number, malas: number, una: string, varias: string) =>
    `en ${ruta}: ${n} ${n === 1 ? una : varias}${malas === 0 ? '' : `, y ${malas} que ${malas === 1 ? 'no vale, tal como estaba' : 'no valen, tal como estaban'}`}.`;
  const unidades = `Guardado ${parte(g.ruta, g.unidades ?? 0, g.conservadas ?? 0, 'unidad', 'unidades')}`;
  const piezas = g.piezas ?? 0;
  const piezasMalas = g.piezasConservadas ?? 0;
  return piezas + piezasMalas === 0
    ? unidades
    : `${unidades} Y ${parte(g.rutaDePiezas, piezas, piezasMalas, 'pieza', 'piezas')}`;
}

/**
 * Los huecos de cuerpo a cuerpo: los que golpean en la rueda (`camposDelHueco`,
 * `conRueda`), el arma y la lanza. Una nueva de cuerpo a cuerpo elige entre ellos.
 */
const HUECOS_DE_CUERPO_A_CUERPO: readonly HuecoDeArena[] = HUECOS_DE_LA_ARENA.filter(
  (h) => camposDelHueco(h).conRueda,
);

/**
 * Las secciones de «Editar equipo», por tipo (decisión del usuario, 18-10-2026:
 * «diferencia por tipo: armas, armadura, arma a distancia; de momento ignora
 * accesorios»): cada una con sus huecos y aquel en que nace una «+ Nueva pieza».
 * Cuerpo a cuerpo junta los huecos que golpean en la rueda (`HUECOS_DE_CUERPO_A_CUERPO`).
 */
const SECCIONES_DE_EQUIPO: readonly {
  readonly id: string;
  readonly nombre: string;
  readonly huecos: readonly HuecoDeArena[];
  readonly nace: HuecoDeArena;
  readonly nota: string;
}[] = [
  {
    id: 'cuerpo',
    nombre: 'Cuerpo a cuerpo',
    huecos: HUECOS_DE_CUERPO_A_CUERPO,
    nace: 'arma',
    nota: `${DICHO_DEL_USO.cuerpo.cuando} La lanza (${NOMBRE_DE_HUECO.carga}) va en su hueco: ${DICHO_DEL_USO.carga.cuando} Las dos cambian la rueda del golpe.`,
  },
  {
    id: 'distancia',
    nombre: 'A distancia',
    huecos: ['distancia'],
    nace: 'distancia',
    nota: DICHO_DEL_USO.distancia.cuando,
  },
  {
    id: 'armadura',
    nombre: 'Armadura',
    huecos: ['armadura'],
    nace: 'armadura',
    nota: 'Protege con armadura: puntos que se restan del daño de cada golpe, disparo o hechizo que recibe quien la lleva.',
  },
  {
    id: 'escudo',
    nombre: 'Escudo',
    huecos: ['escudo'],
    nace: 'escudo',
    nota: `Regla: ${REGLA_DEL_ESCUDO}.`,
  },
];

/**
 * La vista «Editar equipo»: a la izquierda las piezas de la arena por tipo
 * (`SECCIONES_DE_EQUIPO`), cada una con su sello (`selloDePieza`), su base y lo que
 * suma, y un «+ Nueva pieza» por tipo; a la derecha, la ficha de la elegida. Ni
 * accesorios ni piezas de otra calidad: la arena solo cambia las suyas. Sin
 * reglas: lo que no vale lo dice el núcleo (`validarPiezaDeArena`,
 * `cambioDePiezaBlocker`, `conBase`).
 */
export function renderEquipo(v: VistaDeEquipo): Html {
  const deLaArena = piezasDelEditor(v.piezas);
  const secciones = unir(
    SECCIONES_DE_EQUIPO.map((sec) => {
      const suyas = deLaArena.filter((p) => sec.huecos.includes(p.hueco));
      return html`<div class="hueco-de-equipo" data-seccion-de-equipo="${sec.id}">
        <h3 class="cabecera-hueco"><span>${sec.nombre} ${nota(sec.nota)}</span>
          <button class="boton-de-cabecera" data-arena="crear-pieza" data-hueco="${sec.nace}" title="Crea una pieza nueva de ${sec.nombre}, sin nada que sumar">+ Nueva pieza</button></h3>
        <div class="lista-de-piezas">${unir(suyas.map((p) => tarjetaDePieza(p, v)))}</div>
      </div>`;
    }),
  );
  const p = v.elegida === null ? null : v.piezas.piezaSiExiste(v.elegida);
  return html`<section class="equipo-lista">
      <h3>Piezas de equipo ${nota('Las de la arena (data/equipo.json) se cambian solo para ella; las nuevas son suyas. Una pieza puede ir sobre otra de su hueco: suma lo de su base más sus extras, y si cambia la base, cambia ella. Una unidad suma a sus cifras las de la pieza que lleva, y su nivel no cambia. «Guardar» las escribe en data/borradores/equipo.json, que el juego no lee.')}</h3>
      ${v.sinGuardar === '' ? NADA : html`<p class="aviso-sin-guardar" role="status" data-sin-guardar="si">${v.sinGuardar}</p>`}
      ${secciones}
    </section>
    <section class="equipo-ficha">${
      p === null || !seEditaEnElEditor(p)
        ? html`<h3>Pieza</h3><p class="cost">Elige una pieza de la lista para ver y cambiar sus cifras.</p>`
        : fichaDePieza(p, v)
    }</section>`;
}

/**
 * Si el editor de equipo enseña `p`: solo las de la arena, que son las que la
 * arena cambia (`validarPiezaDeArena`), y de un tipo de sus secciones (sin
 * accesorios). **La única pregunta**: la leen la lista, la ficha y la pieza que se
 * elige al entrar (`piezasDelEditor`, `main.ts`).
 */
function seEditaEnElEditor(p: Pieza): boolean {
  return p.calidad === 'arena' && SECCIONES_DE_EQUIPO.some((sec) => sec.huecos.includes(p.hueco));
}

/** Las piezas que enseña el editor de equipo (`seEditaEnElEditor`), en el orden del catálogo. */
export function piezasDelEditor(eq: CatalogoDeLaArena): readonly Pieza[] {
  return [...eq.piezas.values()].filter(seEditaEnElEditor);
}

/** Una pieza en la lista: su nombre, su sello, su base y lo que suma; pulsarla la abre en la ficha. */
function tarjetaDePieza(p: Pieza, v: VistaDeEquipo): Html {
  const elegida = p.id === v.elegida;
  const base = baseDe(v.piezas, p.id);
  const escrita = escritaDe(v.piezas, p.id);
  return html`<button class="pieza${elegida ? ' elegida' : ''}" data-arena="elegir-pieza" data-pieza="${p.id}" aria-pressed="${elegida ? 'true' : 'false'}">
      <span class="nombre">${p.nombre}</span>
      ${selloEnPantalla(selloDePieza(escrita), baseCambiada(v.piezas, p.id))}${v.enLaPelea(p.id) !== null ? html` <span class="sello sello-del-enlace" title="En esta pelea va la del enlace">en la pelea, la del enlace</span>` : NADA}
      ${base === null ? NADA : html`<span class="sobre-su-base" data-sobre="${base.id}">sobre ${base.nombre}</span>`}
      <span class="cost">${modificadoresEnPantalla(p)}</span>
      ${p.rueda === undefined ? NADA : html`<span class="cost rueda-del-arma">Rueda: ${ruedaDelArmaEnPalabras(p.rueda)}</span>`}
    </button>`;
}

/** Cómo se dice cada sello en pantalla: lo del fichero es la pieza «de serie». */
const SELLO_EN_PANTALLA: Readonly<Record<SelloDePieza, string>> = {
  'del juego': 'de serie',
  cambiada: 'cambiada',
  nueva: 'nueva',
};

/**
 * El sello de una pieza como se pinta, en la lista y en su ficha. La de serie cuya
 * base no lo es (`baseCambiada`) no suma lo del fichero: se dice «su base cambió»,
 * con cuál (QA 2 del 18-10-2026).
 */
function selloEnPantalla(sello: SelloDePieza, cambiada: Pieza | null): Html {
  if (sello === 'del juego' && cambiada !== null) {
    return html`<span class="sello sello-de-la-arena" data-su-base-cambio="${cambiada.id}" title="Escrita como en data/equipo.json, pero «${cambiada.nombre}», su base, está cambiada: suma otra cosa">su base cambió</span>`;
  }
  return html`<span class="sello${sello === 'del juego' ? '' : ' sello-de-la-arena'}">${SELLO_EN_PANTALLA[sello]}</span>`;
}

/** El gesto que deshace una pieza, según su sello: borrar una nueva o volver a la de serie. */
const RETIRAR: Readonly<
  Record<Exclude<SelloDePieza, 'del juego'>, { texto: string; titulo: string }>
> = {
  nueva: {
    texto: 'Borrar',
    titulo:
      'La borra de la arena; si una unidad la lleva, o es la base de otra pieza, el núcleo te dirá qué hacer antes',
  },
  cambiada: {
    texto: 'Volver a la de serie',
    titulo: 'Deja la pieza como está en data/equipo.json',
  },
};

/** Lo que dice la ficha de una pieza según de dónde sale. */
const DICHO_DEL_SELLO: Readonly<Record<SelloDePieza, string>> = {
  'del juego':
    'De serie (data/equipo.json): lo que cambies vale solo en la arena; el fichero sigue con la suya. Su hueco no se cambia.',
  cambiada:
    'Cambiada: en la arena pelea así; data/equipo.json sigue con la suya. Su hueco no se cambia.',
  nueva: 'Nueva, de la arena: el juego no la reparte (ni botín ni armería).',
};

/**
 * Lo que dice la ficha de una pieza cuando en esta pelea va la de un enlace
 * abierto: cuál va y que «Guardar» no la escribe.
 */
function avisoDelEnlace(delEnlace: Pieza | null): Html {
  if (delEnlace === null) return NADA;
  return html`<p class="aviso-del-enlace" data-aviso-del-enlace="si">En esta pelea va la del enlace (${modificadoresEnPantalla(delEnlace)}): «Guardar» no escribe lo del enlace y deja la de esta arena. Si cambias esta o su base, la pelea pasa a usarla.</p>`;
}

/**
 * La ficha de una pieza de la arena: lo que suma (`modificadoresEnPantalla`), quién la
 * lleva, su base con la cadena dicha (`cadenaDeBases`) y, en una tabla, solo las
 * cifras de su tipo (`camposDelHueco`) más el precio en oro: con base, la casilla es
 * el extra y el final lo que suma de verdad (como la tabla de cifras de una
 * unidad). Una de cuerpo a cuerpo lleva la tabla «Rueda del golpe»
 * (`filasDeLaRueda`). Botones: Duplicar, Nueva sobre esta, y Borrar (una nueva) o
 * Volver a la de serie (una cambiada). Cada campo lleva `data-arena-pieza-campo`,
 * que lee `main.ts`.
 */
function fichaDePieza(p: Pieza, v: VistaDeEquipo): Html {
  const eq = v.piezas;
  const escrita = escritaDe(eq, p.id);
  const sello = selloDePieza(escrita);
  const extras = esPiezaConBase(escrita) ? escrita.extras : null;
  const campos = camposDelHueco(p.hueco);
  const hueco =
    sello === 'nueva' && extras === null && campos.conRueda
      ? html`<label class="campo"><span class="label">Hueco${notaDelHueco(p.hueco)}</span>
          <select data-arena-pieza-campo="hueco">${unir(
            HUECOS_DE_CUERPO_A_CUERPO.map(
              (h) =>
                html`<option value="${h}" ${h === p.hueco ? html`selected` : NADA}>${NOMBRE_DE_HUECO[h]}</option>`,
            ),
          )}</select></label>`
      : html`<div class="row"><span class="label">Hueco${notaDelHueco(p.hueco)}</span><span>${NOMBRE_DE_HUECO[p.hueco]}</span></div>`;
  const cadena = cadenaDeBases(eq, p.id);
  const suBase = baseDe(eq, p.id);
  const base = html`<label class="campo"><span class="label">Base ${nota('Otra pieza de su hueco de la que parte: suma lo de la base más sus extras, y si cambia la base, cambia ella. Al cambiar de base se queda con lo que suma ahora.')}</span>
      <select data-arena-pieza-campo="base">
        <option value="" ${extras === null ? html`selected` : NADA}>ninguna (entera)</option>
        ${unir(
          basesPosibles(eq, p.id).map(
            (b) =>
              html`<option value="${b.id}" ${suBase?.id === b.id ? html`selected` : NADA}>${b.nombre}</option>`,
          ),
        )}
      </select></label>
      ${cadena.length > 1 ? html`<p class="cadena-de-bases" data-cadena-de-bases="si">${cadena.map((x) => x.nombre).join(' → ')}</p>` : NADA}`;
  const manos =
    campos.conManos && extras === null
      ? html`<label class="campo"><span class="label">Manos ${nota(`Regla: ${REGLA_DEL_ESCUDO}.`)}</span>
          <select data-arena-pieza-campo="manos">
            <option value="1" ${aDosManos(p) ? NADA : html`selected`}>Una mano</option>
            <option value="2" ${aDosManos(p) ? html`selected` : NADA}>Dos manos</option>
          </select></label>`
      : campos.conManos
        ? html`<div class="row"><span class="label">Manos ${nota('Las de su base.')}</span><span>${aDosManos(p) ? 'Dos manos' : 'Una mano'}</span></div>`
        : NADA;
  const llevan = v.llevan(p.id);
  const botones = html`<button data-arena="crear-pieza" title="Crea una pieza nueva igual que esta, con su base si la tiene">Duplicar</button>
      <button data-arena="crear-pieza-sobre" title="Crea una pieza nueva sobre esta: suma lo mismo y le pones extras; si esta cambia, cambia con ella">Nueva sobre esta</button>
      ${sello === 'del juego' ? NADA : html`<button data-arena="retirar-pieza" title="${RETIRAR[sello].titulo}">${RETIRAR[sello].texto}</button>`}`;
  return html`<div class="ficha ficha-de-pieza" data-pieza-elegida="${p.id}">
      <header class="titulo-de-ficha">
        <div class="nombre-de-ficha"><span class="nombre">${p.nombre}</span> ${selloEnPantalla(sello, baseCambiada(v.piezas, p.id))}</div>
        <span class="subtitulo">Pieza · ${NOMBRE_DE_HUECO[p.hueco]} ${nota(`${DICHO_DEL_SELLO[sello]}${v.enCombate ? ' En plena pelea: el cambio vale ya para todos los que la llevan (y las que están sobre ella), de los dos bandos, y lo gastado sigue gastado.' : ''}`)}</span>
      </header>
      ${v.rechazo === null ? NADA : html`<p class="aviso-de-pieza rechazo" role="status">${v.rechazo}</p>`}
      <div class="row resumen-de-pieza" data-resumen-de-pieza="si"><span class="label">Suma</span>${modificadoresEnPantalla(p, 'nada')}</div>
      <div class="row"><span class="label">Precio</span><span>${describirCoste(p.precio)}</span></div>
      <div class="row"><span class="label">La llevan</span><span>${llevan.length === 0 ? 'ninguna unidad del borrador' : llevan.join(', ')}</span></div>
      ${avisoDelEnlace(v.enLaPelea(p.id))}
      <div class="botones">${botones}</div>
      <div class="cifras">
        <label class="campo nombre-de-pieza"><span class="label">Nombre</span>
          <input type="text" data-arena-pieza-campo="nombre" value="${p.nombre}"></label>
        ${hueco}
        ${base}
        ${manos}
        ${tablaDeCifras(
          extras === null
            ? { nombre: 'Suma', nota: 'Lo que suma a quien la lleva.' }
            : {
                nombre: 'Extra',
                nota: 'Lo que suma encima de su base; puede restar.',
              },
          extras === null
            ? 'Lo que suma a quien la lleva.'
            : 'Lo de su base más el extra: lo que suma a quien la lleva.',
          filasDePieza(p, extras),
        )}
        ${campos.conRueda ? tablaDeLaRueda(p, extras) : NADA}
      </div>
    </div>`;
}

/**
 * Una casilla de la ficha de una pieza: su campo (`data-arena-pieza-campo`, que
 * lee `main.ts`), su rótulo, de qué parte de lo que suma sale (`de`, sobre unos
 * extras: los de su base o lo que suma entera, `extrasDe`), su rango sin base y su
 * nota.
 */
interface CasillaDePieza {
  readonly campo: string;
  readonly rotulo: string;
  readonly de: (x: ExtrasDePieza) => number;
  readonly limites: { readonly minimo?: number; readonly maximo?: number };
  readonly nota?: string;
}

/** Las casillas de cada cifra que puede sumar una pieza (`camposDelHueco`); la velocidad, según el hueco. */
const CASILLAS_DE_LA_CIFRA: Readonly<
  Record<CifraDelHueco, (hueco: HuecoDeArena) => readonly CasillaDePieza[]>
> = {
  ataque: () => [
    {
      campo: 'ataque',
      rotulo: NOMBRE_DE_CIFRA.ataque,
      de: (x) => x.ataque ?? 0,
      limites: { minimo: 0 },
    },
  ],
  defensa: () => [
    {
      campo: 'defensa',
      rotulo: NOMBRE_DE_CIFRA.defensa,
      de: (x) => x.defensa ?? 0,
      limites: { minimo: 0 },
    },
  ],
  armadura: () => [
    {
      campo: 'armadura',
      rotulo: NOMBRE_DE_CIFRA.armadura,
      de: (x) => x.armadura ?? 0,
      limites: { minimo: 0, maximo: ARMADURA_MAXIMA_DE_PIEZA },
      nota: `Puntos que se restan del daño de cada golpe, disparo o hechizo que recibe quien la lleva, con mínimo 0; hasta ${ARMADURA_MAXIMA_DE_PIEZA}.`,
    },
  ],
  danio: () => [
    {
      campo: 'danio-min',
      rotulo: `${NOMBRE_DE_CIFRA.danio} mínimo`,
      de: (x) => x.danio?.[0] ?? 0,
      limites: { minimo: 0 },
      nota: 'Lo que suma al daño mínimo de quien la lleva.',
    },
    {
      campo: 'danio-max',
      rotulo: `${NOMBRE_DE_CIFRA.danio} máximo`,
      de: (x) => x.danio?.[1] ?? 0,
      limites: { minimo: 0 },
      nota: 'Lo que suma al daño máximo de quien la lleva.',
    },
  ],
  velocidad: (hueco) => [
    {
      campo: 'velocidad',
      rotulo: NOMBRE_DE_CIFRA.velocidad,
      de: (x) => x.velocidad ?? 0,
      ...(hueco === 'escudo'
        ? { limites: { maximo: -1 }, nota: 'Un escudo siempre resta: −1 escalón o más.' }
        : { limites: {}, nota: 'En escalones de velocidad; puede restar.' }),
    },
  ],
};

/** La casilla del precio, la última de toda pieza: en la arena, solo en oro. */
const PRECIO_EN_ORO: CasillaDePieza = {
  campo: 'precio-gold',
  rotulo: 'Precio en oro',
  de: (x) => x.oro ?? 0,
  limites: { minimo: 0 },
  nota: 'En la arena el precio es solo en oro.',
};

/**
 * Las filas de la tabla de una pieza: solo las cifras de su tipo
 * (`camposDelHueco`, `CASILLAS_DE_LA_CIFRA`) y el precio en oro. Sin base, la
 * casilla es lo que suma; con base (`extras`), lo que suma de más, y el final, lo
 * que suma resuelta.
 */
function filasDePieza(p: Pieza, extras: ExtrasDePieza | null): FilaDeCifra[] {
  const final = extrasDe(p);
  const escrito = extras ?? final;
  const casillas = [
    ...camposDelHueco(p.hueco).cifras.flatMap((c) => CASILLAS_DE_LA_CIFRA[c](p.hueco)),
    PRECIO_EN_ORO,
  ];
  return casillas.map((c) => ({
    clave: c.campo,
    rotulo: c.rotulo,
    ...(c.nota === undefined ? {} : { nota: c.nota }),
    casilla: {
      atributo: html`data-arena-pieza-campo="${c.campo}"`,
      valor: c.de(escrito),
      // Un extra puede restar: lo que no vale lo dice la pieza resuelta.
      ...(extras === null ? c.limites : {}),
    },
    final: c.de(final),
  }));
}

/**
 * La barra de un nivel: siete muescas, del 0 al `NIVEL_MAXIMO`, llena desde la
 * izquierda hasta el nivel (0, vacía; 6, llena), en un SVG (el ancho es un
 * atributo: un `style` con un número no pasa por `html.ts`). La misma para toda
 * arma: el nivel es absoluto.
 */
function barraDelNivel(nivel: number): Html {
  const paso = 60 / NIVEL_MAXIMO;
  const muescas = unir(
    Array.from({ length: NIVEL_MAXIMO - 1 }, (_, i) => {
      const x = String(Math.round(paso * (i + 1) * 100) / 100);
      return html`<line class="muesca" x1="${x}" y1="0" x2="${x}" y2="10"/>`;
    }),
  );
  const ancho = String(Math.round(paso * nivel * 100) / 100);
  return html`<svg class="barra" data-nivel="${String(nivel)}" viewBox="0 0 60 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect class="pista" x="0" y="0" width="60" height="10"/>
      ${nivel <= 0 ? NADA : html`<rect class="relleno" x="0" y="1.5" width="${ancho}" height="7"/>`}
      ${muescas}
    </svg>`;
}

/**
 * La nota de la fila de un tipo: su nivel y, en Romper guardia y la Finta, lo que
 * da cada éxito (el nivel dice el del éxito máximo); en la Finta, además, que
 * subir es restar menos.
 */
function notaDelNivel(tipo: TipoDelAnillo, nivel: number, porExito: string | null): string {
  const exito =
    porExito === null
      ? ''
      : ` Del éxito mínimo al máximo: ${porExito}; el nivel dice el del máximo.`;
  const finta = tipo === 'finta' ? ' Subir es restar menos casillas.' : '';
  return `Nivel ${nivel} de ${NIVEL_MAXIMO}, el mismo en toda arma: 0 es lo peor y ${NIVEL_MAXIMO} lo mejor.${exito}${finta}`;
}

/**
 * «Rueda del golpe» de un arma de cuerpo a cuerpo (18-10-2026, vuelta 2: niveles
 * absolutos): un tipo del anillo por fila, una barra de 0 a 6 llena desde la
 * izquierda, con «−» (baja un nivel, peor) y «+» (sube, mejor; en la Finta, resta
 * menos casillas), sin pasar de 0 ni de 6, y lo que da su nivel al lado; Normal no
 * tiene fila (siempre ×1). Al lado, la rueda teñida por nivel, solo para leer
 * (`ruedaDeLaPieza`). La barra y el tinte son el nivel final (con su base); la
 * casilla, lo que se escribe: sin base, el nivel; con base, lo que lo sube o lo
 * baja sobre el de ella. Lo que da cada nivel, `filasDeLaRueda`, la misma cuenta
 * del golpe; si un nivel no vale, lo dice el núcleo.
 */
function tablaDeLaRueda(p: Pieza, extras: ExtrasDePieza | null): Html {
  if (p.rueda === undefined) {
    throw new Error(`«${p.nombre}» es un arma de cuerpo a cuerpo de la arena sin rueda`);
  }
  const filas = filasDeLaRueda(p.rueda);
  const barras = unir(
    filas.map((f) => {
      const nombre = NOMBRE_DE_GOLPE[f.tipo];
      const escrito = extras === null ? f.nivel : (extras.rueda?.[f.tipo] ?? 0);
      const limites = extras === null ? html`min="0" max="${String(NIVEL_MAXIMO)}"` : NADA;
      // El nivel no va en la fila sino en la barra y en lo que da: `pintar` busca
      // el botón pulsado con el teclado por los `data-*` de sus antepasados, y uno
      // que cambia a cada paso le perdía el foco (QA de la vuelta 2, H1).
      return html`<div class="barra-de-la-rueda" data-tipo="${f.tipo}">
        <span class="rotulo">${nombre} ${nota(notaDelNivel(f.tipo, f.nivel, f.porExito), false)}</span>
        <button class="paso" data-arena="paso-de-rueda" data-tipo="${f.tipo}" data-sentido="-1" aria-label="${nombre}: un nivel menos" ${f.nivel <= 0 ? DESHABILITADO : NADA}>−</button>
        ${barraDelNivel(f.nivel)}
        <button class="paso" data-arena="paso-de-rueda" data-tipo="${f.tipo}" data-sentido="1" aria-label="${nombre}: un nivel más" ${f.nivel >= NIVEL_MAXIMO ? DESHABILITADO : NADA}>+</button>
        <input type="number" step="1" ${limites} data-arena-pieza-campo="rueda-${f.tipo}" value="${escrito}" aria-label="${nombre}: ${extras === null ? `nivel, de 0 a ${NIVEL_MAXIMO}` : 'niveles que sube o baja sobre su base'}">
        <output class="final" data-final="rueda-${f.tipo}" data-nivel="${String(f.nivel)}">${f.final}</output>
      </div>`;
    }),
  );
  return html`<h4>Rueda del golpe ${nota(`El nivel del arma en cada tipo de la rueda (solo con «Golpe: rueda»), de 0 (izquierda, lo peor) a ${NIVEL_MAXIMO} (derecha, lo mejor), el mismo en toda arma. ${NORMAL_SIN_NIVEL}. La casilla es ${extras === null ? 'el nivel' : 'lo que sube o baja el de su base; la barra, el nivel con ella'}. Cada golpe va con su arma: la lanza en el primero de una carga; esta en los demás y en el contraataque.`)}</h4>
    <div class="rueda-del-arma" data-rueda-de-la-pieza="si">
      <div class="barras-de-la-rueda">${barras}</div>
      ${ruedaDeLaPieza(filas)}
    </div>`;
}

/**
 * La nota del hueco de una pieza: la regla del escudo en el escudo, y en un hueco
 * de arma cuándo se usa (`DICHO_DEL_USO`); en los demás, nada.
 */
function notaDelHueco(hueco: HuecoDeArena): Html {
  if (hueco === 'escudo') return html` ${nota(`Regla: ${REGLA_DEL_ESCUDO}.`)}`;
  if (hueco !== 'arma' && !esArmaPorUso(hueco)) return NADA;
  return html` ${nota(DICHO_DEL_USO[USO_DEL_HUECO[hueco]].cuando)}`;
}

// ---------------------------------------------------------------- batalla

/** Lo que el panel de la batalla lee de la sesión: la sesión misma, sin copiar su forma. */
export type VistaDeArena = Pick<
  SesionDeArena,
  | 'battle'
  | 'semilla'
  | 'laLlevaLaIA'
  | 'turnoPropio'
  | 'battleLegalActions'
  | 'battleStepsLeft'
  | 'sinSalida'
  | 'trasLaFinta'
  | 'spellOptions'
  | 'heroeEnJuego'
  | 'hechizos'
  | 'motivoDeEscala'
  | 'motivoDePuerta'
  | 'noEscalaNunca'
  | 'defensaEnLoAlto'
  | 'muroPorElegir'
  | 'puertaPorElegir'
  | 'motivoDePoder'
  | 'apuntado'
  | 'prevision'
  | 'ruedaPendiente'
>;

/**
 * Lo que dice la barra de arriba de quién mueve. Con la rueda esperando la
 * respuesta, toca responder aunque la unidad activa sea de la IA: decía «Mueve la
 * IA» mientras la cabecera de la rueda pedía la respuesta (H3 de QA, 13-10-2026).
 * Mientras se cuenta no adelanta el final.
 */
export function rotuloDelTurno(s: VistaDeArena, contandoAun: boolean): string {
  if (contandoAun) return 'Contando…';
  if (s.battle.finished !== null) return 'Terminada';
  if (s.ruedaPendiente?.fase === 'respuesta') return 'Te toca responder';
  return s.turnoPropio === null ? 'Mueve la IA' : 'Te toca';
}

/**
 * Un botón por poder de la unidad activa —tuya—: habilitado si hay algún aliado
 * sobre el que usarlo, y si no con el motivo del núcleo en el `title`. Con un
 * solo aliado posible se usa ya; con varios, el clic en el tablero elige (el
 * botón queda marcado mientras espera).
 */
function botonesDePoder(s: VistaDeArena, activa: BattleStack): Html {
  const apuntado = s.apuntado;
  const legales = s.battleLegalActions();
  return unir(
    (activa.unit.poderes ?? []).map((id) => {
      const p = poder(id);
      // Se puede si la lista legal lo trae; el motivo, al núcleo solo si no.
      const suyas = legales.filter((a) => a.type === 'poder' && a.poder === id);
      return html`
         ${botonDeElegir({
           accion: 'battle-poder',
           dato: html`data-poder="${id}"`,
           clase: 'poder',
           rotulo: p.nombre,
           motivo: suyas.length > 0 ? null : s.motivoDePoder(id),
           esperando: apuntado?.kind === 'poder' && apuntado.id === id,
           ayuda:
             suyas.length === 1
               ? previsionDelUnico(s, suyas[0])
               : queHaceElPoder(p, s.battle.reglas),
         })}`;
    }),
  );
}

/**
 * Con un solo aliado posible el clic en el botón ya juega, sin pasar por el
 * tablero ni por su previsión: la ayuda del botón es esa previsión, con a quién y
 * cuánto de verdad («Curar a Guerrero con escudo: cura 2 PV.», con el tope de la
 * herida; M1 de QA: decía «cura 4 PV» aunque la herida fuera menor). Lanza si la
 * sesión no la da: el botón solo sale en un turno propio, y una jugada de la
 * lista legal siempre tiene previsión.
 */
function previsionDelUnico(s: VistaDeArena, accion: BattleAction | undefined): string {
  if (accion === undefined) throw new Error('el poder no tiene jugada que prever');
  const p = s.prevision(accion);
  if (p === null) throw new Error('la jugada del poder no tiene previsión: no es un turno propio');
  const b = s.battle;
  return textoDePrevision(p, (id) => {
    const x = b.stacks.find((st) => st.id === id);
    return x === undefined ? id : nombreEnElCampo(b, x);
  });
}

/**
 * El botón «Editar» de una unidad del campo (o del héroe): abre su ficha en el
 * editor de la batalla. Lo que se cambia vale para todo su tipo, ya.
 */
function botonDeEditar(x: BattleStack, nombre: string): Html {
  return html`<button class="editar-en-combate" data-arena="editar-en-combate" data-stack="${x.id}" title="Cambiar las cifras de ${nombre}: todo su tipo, ya en esta pelea">Editar</button>`;
}

/**
 * Lo que suma el equipo a una `cifra` de `u`: lo de ahora menos lo de su cuerpo
 * (`UnitInfo.sinEquipo`, que escribe solo `conEquipo`), en la pastilla de toda
 * suma de equipo (`textoDeModificador`, como `modificadoresEnPantalla`), o nada
 * si no suma. La velocidad, en casillas, que es como se lee al lado. La armadura
 * no pasa por aquí: el cuerpo no la lleva, toda es del equipo, y su fila la dice
 * entera (`filasDelStack`).
 */
function delEquipo(u: UnitInfo, cifra: Exclude<CifraDePieza, 'armadura'>): Html {
  const cuerpo = u.sinEquipo;
  if (cuerpo === undefined) return NADA;
  let m: ModificadorDePieza;
  switch (cifra) {
    case 'ataque':
      m = { kind: 'cifra', cifra, valor: u.attack - cuerpo.attack };
      break;
    case 'defensa':
      m = { kind: 'cifra', cifra, valor: u.defense - cuerpo.defense };
      break;
    case 'pv':
      m = { kind: 'cifra', cifra, valor: u.hp - cuerpo.hp };
      break;
    case 'velocidad':
      m = { kind: 'cifra', cifra, valor: SPEED_TO_HEXES[u.speed] - SPEED_TO_HEXES[cuerpo.speed] };
      break;
    case 'danio':
      m = {
        kind: 'cifra',
        cifra,
        valor: u.damage[0] - cuerpo.damage[0],
        hasta: u.damage[1] - cuerpo.damage[1],
      };
      break;
  }
  if (m.valor === 0 && (m.hasta ?? 0) === 0) return NADA;
  return html` <span class="modificador" data-cifra="${cifra}">${textoDeModificador(m)}</span>`;
}

/**
 * Las cifras de un stack en la pelea, una fila cada una: vida, ataque y defensa
 * (los de la pelea al lado, `ataqueYDefensa`), daño y velocidad, cada una con lo
 * que le suma el equipo (`delEquipo`). Las leen el panel de la activa y la vista
 * previa de la rueda (`vistaPrevia`). `conArmas`: el daño, golpe a golpe con su
 * arma (`filasDeArmas`, el panel); si no, el del cuerpo a cuerpo, que es el de
 * la rueda, en una fila y sin notas (el bocadillo no se puede señalar).
 */
export function filasDelStack(
  s: Pick<VistaDeArena, 'battle' | 'defensaEnLoAlto'>,
  x: BattleStack,
  conArmas: boolean,
): Html {
  const b = s.battle;
  const u = x.unit;
  const danio =
    conArmas && u.equipo !== undefined
      ? filasDeArmas(
          u,
          piezasDeLaPelea(b),
          b.arena.cargaAPie,
          (uso) => ataqueYDefensaEnBatalla(b, x, uso).ataque,
        )
      : html`<div class="row"><span class="label">Daño</span><span>${u.damage[0]}–${u.damage[1]}${delEquipo(u, 'danio')}</span></div>`;
  return html`<div class="row"><span class="label">Vida</span><span>${isAlive(x) ? x.topHp : 0} / ${u.hp} PV${delEquipo(u, 'pv')}</span></div>
        <div class="row"><span class="label">Ataque / Defensa</span><span>${ataqueYDefensa(b, x, s.defensaEnLoAlto(x))}${delEquipo(u, 'ataque')}${delEquipo(u, 'defensa')}</span></div>
        ${armaduraDe(u) === 0 ? NADA : html`<div class="row"><span class="label">${NOMBRE_DE_CIFRA.armadura}</span><span>${armaduraDe(u)}</span></div>`}
        ${danio}
        <div class="row"><span class="label">Velocidad</span><span>${SPEED_TO_HEXES[u.speed]} casillas${delEquipo(u, 'velocidad')}</span></div>`;
}

/**
 * La vista previa de uno de los dos de la rueda (#261): su nombre, sus cifras
 * (`filasDelStack`), lo que lleva colgado con lo que le queda (`efectoEnCurso`)
 * y si ya devolvió un golpe esta ronda. Todo del estado de la batalla: lo que
 * eligió el otro en la rueda no está ahí, va a ciegas en la sesión.
 */
export function vistaPrevia(s: VistaDeArena, x: BattleStack): Html {
  const efectos =
    x.effects.length === 0
      ? html`<span class="sin-efectos">ninguno</span>`
      : unir(x.effects.map((e) => html`<span class="efecto-en-curso">${efectoEnCurso(e)}</span>`));
  return html`<strong class="nombre-de-la-previa">${nombreEnElCampo(s.battle, x)}</strong>
    ${filasDelStack(s, x, false)}
    <div class="row"><span class="label">Efectos</span><span class="efectos-en-curso">${efectos}</span></div>
    <div class="row"><span class="label">Contraataque</span><span data-contraataco="${x.retaliated ? 'si' : 'no'}">${x.retaliated ? 'ya devolvió un golpe esta ronda' : 'aún puede devolver uno esta ronda'}</span></div>`;
}

/**
 * El ataque y la defensa con que pelea ahora: los suyos y, si cambian —un
 * efecto, defender, su héroe con la regla de fheroes2, lo alto de un muro—, los
 * de la pelea al lado. Salen del núcleo (`ataqueYDefensaEnBatalla`), las mismas
 * que cuenta el golpe; `enLoAlto` (`bonoEnLoAlto`) solo dice de dónde sale parte
 * de la defensa, que ya va dentro.
 */
function ataqueYDefensa(
  b: BattleState,
  s: Parameters<typeof ataqueYDefensaEnBatalla>[1],
  enLoAlto: number,
): string {
  const base = `${s.unit.attack} / ${s.unit.defense}`;
  const { ataque, defensa } = ataqueYDefensaEnBatalla(b, s);
  const alto = enLoAlto > 0 ? `, +${enLoAlto} de defensa en lo alto` : '';
  return ataque === s.unit.attack && defensa === s.unit.defense
    ? base
    : `${base} (en la pelea, ${conComa(ataque, 1)} / ${conComa(defensa, 1)}${alto})`;
}

/**
 * Quién gana y por qué, dicho por el lado del montaje con la causa del motor
 * (`finalDeArena`). Si se acabaron las rondas se dice con la regla del motor: sin
 * eso, «gana el derecho» tras cien rondas sin un rasguño parecía que el derecho
 * era más fuerte (H4 de QA). Y la caída de un héroe se dice como tal: contada
 * como «por tiempo», un Rayo en la ronda 1 salía como cien rondas sin vencedor
 * (H1 de QA del banco).
 */
function rotuloDelGanador(battle: BattleState): string {
  const fin = finalDeArena(battle);
  if (fin === null) return '';
  const quien = `el bando ${LADOS[fin.ganador].adjetivo}`;
  const perdedor = LADOS[fin.ganador === 'izquierda' ? 'derecha' : 'izquierda'].adjetivo;
  const cuando = `en la ronda ${battle.round}`;
  switch (fin.causa) {
    case 'heroe':
      return `Gana ${quien} ${cuando}: cayó el héroe del bando ${perdedor}.`;
    case 'sin_tropa':
      return `Gana ${quien} ${cuando}: el bando ${perdedor} no tiene a nadie en pie.`;
    case 'rendicion':
      return `Gana ${quien} ${cuando}: el bando ${perdedor} se rindió.`;
    case 'agotada': {
      const porque = fin.empate
        ? 'con las mismas unidades en pie, gana quien defiende'
        : 'gana quien tiene más unidades en pie';
      const sinVencedor =
        battle.round >= MAX_ROUNDS
          ? `Sin vencedor en ${MAX_ROUNDS} rondas: por tiempo`
          : `Sin vencedor ${cuando}: nadie puede actuar`;
      return `${sinVencedor}, ${porque}. Gana ${quien}.`;
    }
  }
}

/**
 * El panel lateral de la batalla. Las acciones, su ayuda —la de la carga
 * incluida— y la lista del campo son las piezas de la partida
 * (`views/panels.ts`); lo de aquí es lo que solo tiene la arena: quién mueve
 * cada unidad y el resultado por lados.
 *
 * @param contandoAun si el tablero aún cuenta la última jugada: con la batalla
 *   ya resuelta en el estado, el resultado se calla hasta que el tablero llega a
 *   él, como en el espectador.
 */
export function renderPanelDeBatalla(s: VistaDeArena, contandoAun: boolean): Html {
  const b = s.battle;
  // Mientras el tablero cuenta, el estado ya va por delante de lo que se ve: el
  // parte, las vidas y la ficha de la activa contarían el final antes de que
  // llegue —con todo en IA, la pelea entera—. Se calla todo hasta que el tablero
  // alcanza al estado.
  if (contandoAun) {
    return html`<div class="row"><span class="label">Ronda</span><span>…</span></div>
      <p>Contando la jugada…</p>`;
  }
  if (b.finished !== null) {
    return html`<h2>${rotuloDelGanador(b)}</h2>
      <p>Ronda ${b.round}. Semilla ${s.semilla}.</p>
      <div class="stack-list"><button data-arena="otra-vez" class="primary">Otra vez</button></div>
      <h3>Parte de guerra</h3>${renderBattleLog(b, null)}`;
  }
  const activa = activeStack(b);
  const mia = s.turnoPropio !== null;
  const rasgos = activa === null ? '' : rasgosDichos(activa.unit.traits);
  const ficha =
    activa === null
      ? NADA
      : html`<h2>${nombreEnElCampo(b, activa)} ${botonDeEditar(activa, nombreEnElCampo(b, activa))}</h2>
        <div class="row"><span class="label">Bando</span><span>${LADOS[ladoDe(activa.side)].rotulo}</span></div>
        <div class="row"><span class="label">La mueve</span><span>${s.laLlevaLaIA(activa.id) ? 'la IA' : 'tú'}</span></div>
        ${filasDelStack(s, activa, true)}
        ${rasgos === '' ? NADA : html`<div class="row"><span class="label">Rasgos</span><span>${rasgos}</span></div>`}`;
  const heroe = s.heroeEnJuego;
  // Con la rueda en la respuesta, lo que se juega es eso (la activa es quien
  // pega, y puede ser de la IA): ni sus botones ni «Mueve la IA».
  const acciones =
    s.ruedaPendiente?.fase === 'respuesta'
      ? html`<p>Te toca responder en la rueda.</p>`
      : mia && activa !== null
        ? accionesDeLaUnidad({
            activa,
            carga: cargaDelStack(b, activa),
            legales: s.battleLegalActions(),
            pasos: s.battleStepsLeft(),
            sinSalida: s.sinSalida(),
            trasLaFinta: s.trasLaFinta(),
            rendicion: NADA,
            poderes: botonesDePoder(s, activa),
            hechizos:
              heroe === null ? NADA : renderSpells(s.hechizos.selectedSpell, s.spellOptions()),
            // La puerta, solo a quien defiende: es quien la abre y la cierra. La
            // escala, solo a quien puede llegar a escalar: al defensor y a la
            // voladora les saldrían siempre deshabilitados.
            muralla: html`${b.puertas.length > 0 && activa.side === 'defender' ? botonesDePuerta(s) : NADA}${
              b.muralla.muros.length > 0 && s.noEscalaNunca(activa) === null
                ? botonesDeEscala(s)
                : NADA
            }`,
          })
        : html`<p>Mueve la IA…</p>`;
  const mana =
    heroe === null
      ? NADA
      : html`<div class="row"><span class="label">Maná de ${heroe.mando.name}</span><span>${heroe.mando.mana} / ${heroe.manaMaximo}</span></div>`;
  const encendidas = reglasEncendidas(b.reglas);
  const reglas =
    encendidas.length === 0
      ? NADA
      : html`<div class="row"><span class="label">Reglas de fheroes2</span><span>${encendidas.map((r) => DESCRIPCION_DE_REGLA[r].nombre).join(', ')}</span></div>`;
  const campo = listaDelCampo(b, (x) => {
    const nombre = nombreEnElCampo(b, x);
    return {
      flecha: x.side === LADOS.izquierda.bando ? '▶' : '◀',
      nombre,
      cuenta: `${x.topHp} PV · ${s.laLlevaLaIA(x.id) ? 'IA' : 'tú'}`,
      boton: botonDeEditar(x, nombre),
    };
  });
  return html`${ficha}
    <div class="row"><span class="label">Ronda</span><span>${b.round}</span></div>
    ${mana}
    ${reglas}
    <div class="botones-de-la-pelea"><button data-arena="ir-a-equipo" title="Cambia una pieza de equipo: vale ya para todos los que la llevan, de los dos bandos">Editar equipo</button></div>
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${campo}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(b, null)}`;
}

// ---------------------------------------------------------------- muralla

/** Con qué pinta el clic en la rejilla de la muralla. */
export type HerramientaDeMuralla = PiezaDeMuralla | 'goma';

const NOMBRE_DE_HERRAMIENTA: Readonly<Record<HerramientaDeMuralla, string>> = {
  muro: 'Muro',
  puerta: 'Puerta',
  goma: 'Goma',
};

/** Lo que el editor de la muralla necesita: la que se dibuja y las formas a mano. */
export interface EditorDeMuralla {
  readonly muralla: MurallaDeBatalla;
  readonly herramienta: HerramientaDeMuralla;
  /** El nombre con el que se guardaría: el de la forma cargada o lo escrito. */
  readonly nombre: string;
  readonly ejemplos: readonly FormaDeMuralla[];
  readonly guardadas: readonly FormaDeMuralla[];
  /** Por qué no se puede guardar ni borrar, o `null` si se puede. */
  readonly sinGuardado: string | null;
  /** Por qué el montaje no cabe con esta muralla (`despliegueDeArenaBlocker`), o `null`. */
  readonly despliegue: string | null;
  /**
   * Plegado, el editor es una línea: a 1280×720 dejaba los bandos y la ficha en
   * ~250 px de alto (QA, M7). Lo que impide luchar se sigue diciendo.
   */
  readonly plegado: boolean;
}

/** «9 muros · 0 puertas», «1 muro y 1 puerta»: la tarjeta decía «9 muro · 0 puerta» (QA, M6). */
function piezas(m: MurallaDeBatalla, junta: string): string {
  const n = (k: number, palabra: string): string => `${k} ${palabra}${k === 1 ? '' : 's'}`;
  return `${n(m.muros.length, 'muro')}${junta}${n(m.puertas.length, 'puerta')}`;
}

/** La zona de salida en la que cae el hex, como clase de la rejilla. */
function claseDeSalida(col: number, row: number): string {
  const bando = bandoDeSalida({ col, row });
  if (bando === null) return '';
  return bando === 'attacker' ? ' salida-izq' : ' salida-der';
}

/**
 * El editor de la muralla: la rejilla de batalla (`FORMA_DEL_TABLERO`: filas de
 * 12 y 11, las impares media casilla a la derecha, como en el tablero) donde un clic pone
 * o quita la pieza de la herramienta, y las formas con nombre. Las columnas de
 * salida van sombreadas: se puede dibujar en ellas, y el despliegue esquiva la
 * muralla; si así no caben todos, se dice aquí mientras se dibuja.
 */
export function renderMuralla(e: EditorDeMuralla): Html {
  const despliegue =
    e.despliegue === null
      ? NADA
      : html`<p class="aviso-despliegue" role="alert">No se puede luchar: ${e.despliegue}.</p>`;
  const cabecera = html`<h3 class="cabecera-muralla"><span>Muralla · ${piezas(e.muralla, ' y ')}</span>
    <button class="boton-de-cabecera" data-arena="plegar-muralla" aria-expanded="${e.plegado ? 'false' : 'true'}">${e.plegado ? 'Desplegar' : 'Plegar'}</button></h3>`;
  if (e.plegado) return html`${cabecera}${despliegue}`;
  // Un botón deshabilitado sin decir por qué es un misterio (QA, M4): el motivo
  // va en su `title` y, mientras dure, en el propio editor, donde no lo borra
  // el siguiente clic como a la barra.
  const sinGuardar =
    e.sinGuardado === null ? NADA : html`disabled title="No se puede guardar: ${e.sinGuardado}."`;
  const filas = unir(
    filasDelTablero().map(({ row, desplazada, hexes: casillas }) => {
      const hexes = unir(
        casillas.map(({ col }) => {
          const muro = esMuro(e.muralla, { col, row });
          const fuera = !muro && ladoDeLaMuralla(e.muralla, { col, row }) === 'fuera';
          // La puerta va en el lado: se marca en las dos casillas, a cada una por su borde.
          const alEste = e.muralla.puertas.some((p) => p.a.col === col && p.a.row === row);
          const alOeste = e.muralla.puertas.some((p) => p.b.col === col && p.b.row === row);
          const que = [
            muro ? 'muro' : fuera ? 'vacío, fuera' : 'vacío',
            ...(alEste ? ['puerta al este'] : []),
            ...(alOeste ? ['puerta al oeste'] : []),
          ].join(', ');
          return html`<button class="hex${muro ? ' muro' : ''}${alEste ? ' puerta-este' : ''}${alOeste ? ' puerta-oeste' : ''}${fuera ? ' fuera' : ''}${claseDeSalida(col, row)}" data-arena="hex-muralla" data-col="${col}" data-row="${row}" title="(${col},${row}) ${que}" aria-label="hex ${col},${row}: ${que}"></button>`;
        }),
      );
      return html`<div class="fila${desplazada ? ' impar' : ''}">${hexes}</div>`;
    }),
  );
  const herramientas = unir(
    (Object.keys(NOMBRE_DE_HERRAMIENTA) as HerramientaDeMuralla[]).map(
      (h) =>
        html`<button data-arena="herramienta-muralla" data-herramienta="${h}" class="${h === e.herramienta ? 'primary' : ''}">${NOMBRE_DE_HERRAMIENTA[h]}</button>`,
    ),
  );
  const forma = (f: FormaDeMuralla, ejemplo: boolean): Html =>
    html`<div class="forma" data-forma="${f.nombre}">
      <span class="nombre">${f.nombre}</span>
      <span class="cost">${piezas(f.muralla, ' · ')}${ejemplo ? ' · ejemplo' : ''}</span>
      <span class="botones">
        <button data-arena="cargar-forma" data-nombre="${f.nombre}">Cargar</button>
        ${ejemplo ? NADA : html`<button data-arena="borrar-forma" data-nombre="${f.nombre}" ${sinGuardar}>Borrar</button>`}
      </span>
    </div>`;
  return html`${cabecera}
    <div class="muralla">
      <div class="rejilla herramienta-${e.herramienta}" data-rejilla-muralla>${filas}</div>
      <div class="mandos">
        <div class="botones">${herramientas}<button data-arena="vaciar-muralla">Vaciar</button></div>
        ${despliegue}
        <p class="cost">Un clic pone la pieza o la quita si ya está; la puerta, entre la casilla y la de su este, que se resaltan juntas. La rejilla es la de la batalla: ${FORMA_DEL_TABLERO}. ${REGLA_DE_LA_MURALLA} Sombreadas, las columnas de salida.</p>
        <p class="cost lados-de-la-forma">${ladosDeLaForma(e.muralla)}</p>
        <label class="campo"><span class="label">Nombre de la forma</span>
          <input type="text" data-muralla-nombre="si" value="${e.nombre}" maxlength="${NOMBRE_MAXIMO_DE_FORMA}"></label>
        <div class="botones"><button data-arena="guardar-forma" ${sinGuardar}>Guardar forma</button></div>
        ${e.sinGuardado === null ? NADA : html`<p class="aviso-guardado">No se pueden guardar ni borrar formas: ${e.sinGuardado}.</p>`}
        <div class="formas">${unir(e.ejemplos.map((f) => forma(f, true)))}${unir(e.guardadas.map((f) => forma(f, false)))}</div>
      </div>
    </div>`;
}
