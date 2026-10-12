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
  CASILLAS_MAX,
  CASILLAS_MIN,
  CIFRA_MAXIMA_DE_HEROE,
  FACCIONES_DE_ARENA,
  fichaDeHeroeDeArena,
  finalDeArena,
  HABILIDADES_DE_LA_ARENA,
  type HeroeDeArena,
  type HojaDeArena,
  LADOS,
  type Lado,
  ladoDe,
  NOMBRE_DE_FACCION_DE_ARENA,
  NOMBRE_DE_RASGO,
  nombreDeHabilidad,
  type UnidadDeArena,
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
  isAlive,
  MAX_ROUNDS,
} from '@core/battle/battle.js';
import { FORMA_DEL_TABLERO, filasDelTablero } from '@core/battle/board.js';
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
  REGLAS_DEL_JUEGO,
  type ReglasDeBatalla,
  reglasEncendidas,
} from '@core/battle/reglas.js';
import { allSpells, delHeroe, efectoDe } from '@core/battle/spells.js';
import type {
  BattleAction,
  BattleStack,
  BattleState,
  TipoDeEscala,
  TipoDePuerta,
} from '@core/battle/types.js';
import { isShooter } from '@core/data.js';
import {
  CREATURE_TRAITS,
  type CreatureTrait,
  conComa,
  SPEED_TO_HEXES,
  type UnitInfo,
} from '@core/types.js';
import { type Html, html, NADA, srcDeImagen, unir } from '../html.js';
import type { SesionDeArena } from '../session.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import {
  accionesDeLaUnidad,
  cifraDeEfecto,
  enRondas,
  listaDelCampo,
  renderBattleLog,
  renderSpells,
} from '../views/panels.js';
import { curaOEfecto, textoDePrevision } from '../views/prevision.js';
import { abrirFichaBlocker, claveDeFicha, estaAbierta, type FichaEditable } from './edicion.js';

/**
 * De dónde sale un puesto del montaje: una hoja de las cinco facciones (sus
 * cifras, las del borrador) o una criatura del catálogo del juego.
 */
export type FuenteDePuesto =
  | { readonly kind: 'hoja'; readonly hoja: string }
  | { readonly kind: 'catalogo'; readonly id: string };

/** Un puesto del montaje: de dónde sale. `clave` distingue dos iguales; quién lo mueve es del bando. */
export interface Puesto {
  readonly clave: number;
  readonly fuente: FuenteDePuesto;
  /** Lleva escalera para subir a la muralla: es del montaje, no de la unidad. */
  readonly escalera: boolean;
}

/** Lo que tiene la ficha delante: una hoja, una criatura del catálogo o el héroe de un lado. */
export type Elegida =
  | { readonly kind: 'hoja'; readonly id: string }
  | { readonly kind: 'catalogo'; readonly id: string }
  | { readonly kind: 'heroe'; readonly lado: Lado };

/** Lo que la tarjeta de un puesto enseña: lo da `main.ts`, que sabe de dónde salen las cifras. */
export interface DatosDePuesto {
  readonly nombre: string;
  readonly resumen: string;
  /** El id del arte de su miniatura. */
  readonly figura: string;
  /** «catálogo», «catálogo · prueba» o «borrador». */
  readonly sello: string;
  /**
   * Por qué no usaría una escalera en su lado (`escaleraDeArenaBlocker`), o
   * `null` si la usaría: lo dice la casilla «Lleva escalera».
   */
  readonly noEscala: string | null;
}

/** ¿Es esta la elegida? */
function esLaElegida(e: Elegida | null, f: FuenteDePuesto): boolean {
  if (e === null) return false;
  return f.kind === 'hoja'
    ? e.kind === 'hoja' && e.id === f.hoja
    : e.kind === 'catalogo' && e.id === f.id;
}

const DESHABILITADO: Html = html`disabled`;
const MARCADO: Html = html`checked`;

const rutaDeIdentidad = (id: string): string => `/unidades/${id}/identidad.webp`;

/** Los rasgos dichos con palabras, o nada. */
function rasgosDichos(traits: readonly CreatureTrait[] | undefined): string {
  return (traits ?? []).map((t) => NOMBRE_DE_RASGO[t]).join(', ');
}

/**
 * Una línea con las cifras de una unidad, para la tarjeta del bando: también los
 * hexes y los rasgos, que antes no salían y un guerrero que vuela y ocupa dos
 * se veía igual que uno normal (M9 de QA).
 */
export function resumenDeCifras(u: UnidadDeArena): string {
  const tiro = u.shots === undefined ? '' : ` · ${u.shots} tiros`;
  const grande = (u.hexes ?? 1) > 1 ? ` · ${u.hexes} hexes` : '';
  const rasgos = u.traits.length === 0 ? '' : ` · ${rasgosDichos(u.traits)}`;
  return `A ${u.attack} · D ${u.defense} · ${u.damage[0]}–${u.damage[1]} daño · ${u.hp} PV · ${u.casillas} casillas${tiro}${grande}${rasgos}`;
}

/** Lo mismo para las cifras del motor: las de una criatura del catálogo. */
export function resumenDeUnidad(u: UnitInfo): string {
  const tiro = u.shots === undefined ? '' : ` · ${u.shots} tiros`;
  const grande = (u.hexes ?? 1) > 1 ? ` · ${u.hexes} hexes` : '';
  const rasgos = (u.traits ?? []).length === 0 ? '' : ` · ${rasgosDichos(u.traits)}`;
  return `A ${u.attack} · D ${u.defense} · ${u.damage[0]}–${u.damage[1]} daño · ${u.hp} PV · ${SPEED_TO_HEXES[u.speed]} casillas${tiro}${grande}${rasgos}`;
}

// ---------------------------------------------------------------- catálogo

/** Qué enseña la lista: todas las hojas, las de una facción o el catálogo del juego. */
export type FiltroDeArena = HojaDeArena['faccion'] | 'todas' | 'catalogo';

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
  const quien = f.kind === 'hoja' ? html`data-hoja="${f.id}"` : html`data-criatura="${f.id}"`;
  if (modo.kind === 'edicion') {
    const motivo = abrirFichaBlocker(modo.abiertas, f, incompleta);
    const abierta = estaAbierta(modo.abiertas, claveDeFicha(f));
    return html`<button data-arena="abrir-ficha" ${quien} title="${motivo ?? 'Abre su ficha junto a las demás'}" ${motivo === null ? NADA : DESHABILITADO}>${abierta ? 'Abierta' : 'Abrir'}</button>`;
  }
  const accion = f.kind === 'hoja' ? 'añadir' : 'añadir-catalogo';
  const montable = incompleta === null ? NADA : DESHABILITADO;
  return html`
          <button data-arena="${accion}" data-lado="izquierda" ${quien} title="Añadir al bando izquierdo" ${montable}>+ izq.</button>
          <button data-arena="${accion}" data-lado="derecha" ${quien} title="Añadir al bando derecho" ${montable}>+ der.</button>`;
}

export function renderCatalogo(
  hojas: readonly HojaDeArena[],
  filtro: FiltroDeArena,
  criaturas: readonly {
    readonly id: string;
    readonly name: string;
    readonly resumen: string;
  }[] = [],
  modo: ModoDelCatalogo = { kind: 'montaje' },
): Html {
  const cabecera = cabeceraDeLaLista(modo);
  if (modo.kind === 'edicion' && modo.plegada) return cabecera;
  const botones = unir(
    (['todas', ...FACCIONES_DE_ARENA, 'catalogo'] as const).map((f) => {
      const nombre =
        f === 'todas'
          ? 'Todas'
          : f === 'catalogo'
            ? 'Catálogo del juego'
            : NOMBRE_DE_FACCION_DE_ARENA[f];
      return html`<button data-arena="filtro" data-faccion="${f}" class="${f === filtro ? 'primary' : ''}">${nombre}</button>`;
    }),
  );
  if (filtro === 'catalogo') {
    const tarjetas = unir(
      criaturas.map(
        (c) => html`<div class="hoja del-catalogo" data-criatura-catalogo="${c.id}">
        <span class="sello">catálogo</span>
        <span class="nombre">${c.name}</span>
        <span class="cost">${c.resumen}</span>
        <span class="botones">${botonesDeTarjeta(modo, { kind: 'catalogo', id: c.id }, null)}</span>
      </div>`,
      ),
    );
    return html`${cabecera}
    <div class="filtros">${botones}</div>
    <p class="cost">Las criaturas de data/creatures.json, con sus cifras y sus rasgos de verdad.</p>
    <div class="catalogo">${tarjetas}</div>`;
  }
  const visibles = hojas.filter((h) => filtro === 'todas' || h.faccion === filtro);
  const tarjetas = unir(
    visibles.map((h) => {
      // Una incompleta (#140) se ve con su motivo y sin botones que la monten.
      return html`<div class="hoja${h.incompleta === null ? '' : ' incompleta'}" data-hoja-catalogo="${h.id}">
        <img${srcDeImagen(rutaDeIdentidad(h.id))} alt="${h.nombre}" loading="lazy" width="64" height="64">
        <span class="nombre">${h.nombre}</span>
        <span class="cost">${NOMBRE_DE_FACCION_DE_ARENA[h.faccion]}</span>
        ${h.incompleta === null ? NADA : html`<span class="cost" data-incompleta title="${h.incompleta}">Incompleta: ${h.incompleta}</span>`}
        <span class="botones">${botonesDeTarjeta(modo, { kind: 'hoja', id: h.id }, h.incompleta)}</span>
      </div>`;
    }),
  );
  return html`${cabecera}
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
            const quien =
              p.fuente.kind === 'hoja'
                ? html`data-arena="editar" data-hoja="${p.fuente.hoja}"`
                : html`data-arena="editar-catalogo" data-criatura="${p.fuente.id}"`;
            return html`<div class="puesto${esLaElegida(elegida, p.fuente) ? ' elegida' : ''}" data-puesto="${p.clave}">
              <button class="ver" ${quien} title="Ver y editar sus cifras">
                <canvas class="figura" data-figura="${d.figura}" data-lado="${lado}" width="72" height="88"></canvas>
              </button>
              <div class="datos">
                <button class="nombre" ${quien} title="Editar sus cifras">${d.nombre}</button>
                <span class="sello">${d.sello}</span>
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
      <canvas class="figura" data-figura="${h.figura ?? FIGURA_GENERICA}" data-lado="${lado}" width="72" height="88"></canvas>
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
 * usaría —dos casillas, vuela— le sale deshabilitada y sin marcar, con el motivo
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
  /**
   * Si su título es el campo del nombre (tras pulsar «✎ Editar»): lo pone
   * `main.ts` por la clave de la ficha, y sin él el nombre se lee y no se escribe.
   */
  readonly renombrando?: boolean;
}

/** La ficha del montaje, con las reglas que tiene puestas. */
export function enElMontaje(reglas: ReglasDeBatalla = REGLAS_DEL_JUEGO): ComoDeLaFicha {
  return { enCombate: false, reglas };
}

/**
 * Lo que dice la ficha al pie en el editor de la batalla: a quién alcanza el
 * cambio y qué pasa con lo gastado (`retocarEnBatalla`).
 */
export const CAMBIO_EN_COMBATE =
  'En plena pelea: el cambio vale ya para todas las de este tipo en el campo, de los dos bandos, y para la pelea siguiente. Lo gastado sigue gastado: la herida, los disparos y el maná que ya se fueron se restan de las cifras nuevas (subir la vida no cura). La velocidad nueva cuenta en el orden desde la ronda siguiente y la moral no cambia. Las casillas que ocupa y la figura del héroe solo se cambian en el montaje.';

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
      <span class="subtitulo">${subtitulo}</span>
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
        <canvas class="figura grande" data-figura="${o.figura}" data-ficha-clip="si" width="200" height="230"></canvas>
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
function etiquetaConQuitar(texto: string, quitar: Html): Html {
  return html`<span class="etiqueta">${texto} <button ${quitar} title="Quitar" aria-label="Quitar ${texto}">×</button></span>`;
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
  return html`<h3>Rasgos del motor</h3>
      <div class="etiquetas rasgos-puestos">${etiquetas}</div>
      ${añadir}`;
}

/** El pie de una ficha: a quién alcanza el cambio. En el montaje, `enElMontaje` si dice algo. */
function pieDeLaFicha(como: ComoDeLaFicha, enElMontaje: string | null): Html {
  const texto = como.enCombate ? CAMBIO_EN_COMBATE : enElMontaje;
  return texto === null ? NADA : html`<p class="cost">${texto}</p>`;
}

/** Un campo numérico de la ficha. `data-campo` es lo que lee `main.ts` al cambiarlo. */
function numero(campo: string, rotulo: string, valor: number, minimo: number): Html {
  return html`<label class="campo"><span class="label">${rotulo}</span>
    <input type="number" data-campo="${campo}" value="${valor}" min="${minimo}" step="1"></label>`;
}

/**
 * La ficha de la unidad elegida. `dispara`: si su figura trae el clip del
 * disparo (`ArteDeFigura.dispara`); solo entonces lleva su botón, porque a
 * quien no lo trae no hay disparo que enseñarle.
 */
export function renderFicha(
  u: UnidadDeArena | null,
  hoja: HojaDeArena | null,
  dispara: boolean,
  como: ComoDeLaFicha = enElMontaje(),
): Html {
  if (u === null || hoja === null) {
    return html`<h3>Ficha</h3><p class="cost">Pulsa el nombre de una unidad de un bando para ver y cambiar sus cifras.</p>`;
  }
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
              html`<div class="poder" data-poder-de-la-ficha="${p.id}">${etiqueta(h)} <span class="cost">${queHaceElPoder(p, como.reglas)}.</span></div>`,
          ),
        );
  const puestas =
    inertes.length === 0 ? html`<span class="cost">Ninguna.</span>` : unir(inertes.map(etiqueta));
  const libres = unir(
    HABILIDADES_DE_LA_ARENA.filter((h) => !u.habilidades.includes(h)).map(
      (h) => html`<option value="${h}">${nombreDeHabilidad(h)}</option>`,
    ),
  );
  return html`<div class="ficha" data-clave-de-ficha="${claveDeFicha({ kind: 'hoja', id: u.id })}">
      ${tituloDeFicha(u.name, `Ficha · ${NOMBRE_DE_FACCION_DE_ARENA[u.faction]}`, como, html`data-campo="name"`)}
      ${cabezaDeFicha({
        figura: u.id,
        como,
        clips: html`<button data-arena="clip" data-clip="idle">Reposo</button>
          <button data-arena="clip" data-clip="walk">Marcha</button>
          <button data-arena="clip" data-clip="charge">Carga</button>
          <button data-arena="clip" data-clip="attack">Ataque</button>
          ${dispara ? html`<button data-arena="clip" data-clip="shoot">Disparo</button>` : NADA}
          <button data-arena="clip" data-clip="hurt">Daño</button>
          <button data-arena="clip" data-clip="death">Muerte</button>`,
        cifras: html`${numero('attack', 'Ataque', u.attack, 0)}
      ${numero('defense', 'Defensa', u.defense, 0)}
      ${numero('damage-min', 'Daño mínimo', u.damage[0], 1)}
      ${numero('damage-max', 'Daño máximo', u.damage[1], 1)}
      ${numero('hp', 'Vida', u.hp, 1)}
      ${numero('casillas', `Velocidad (casillas, ${CASILLAS_MIN} a ${CASILLAS_MAX})`, u.casillas, CASILLAS_MIN)}
      ${numero('shots', 'Disparos (0 = cuerpo a cuerpo)', u.shots ?? 0, 0)}
      ${numero('hexes', 'Hexes (1 o 2)', u.hexes ?? 1, 1)}
      ${numero('level', 'Nivel', u.level, 1)}
      ${numero('leadership', 'Liderazgo', u.leadership, 1)}
      ${numero('gold', 'Coste (oro)', u.cost.gold, 0)}`,
      })}
      ${rasgosDeLaFicha(u.traits)}
      <h3>Poderes · actúan en la pelea</h3>
      <p class="cost">Se usan en su turno en vez de golpear, al principio, sin haberse movido: el turno entero.</p>
      <div class="etiquetas poderes">${poderes}</div>
      <h3>Habilidades · sin efecto todavía</h3>
      <p class="cost">Se guardan con la unidad, pero solo Curar y Bendecir tienen motor: en la pelea, de lo demás, solo cuentan los rasgos.</p>
      <div class="etiquetas">${puestas}</div>
      <label class="campo"><span class="label">Añadir</span>
        <select data-arena-habilidad="si"><option value="">— elige —</option>${libres}</select></label>
      ${pieDeLaFicha(como, 'El cambio vale para todas las unidades de este tipo, en la batalla siguiente.')}
    </div>`;
}

/**
 * La ficha de una criatura del catálogo del juego. Se puede cambiar, y se dice
 * que es una prueba: nada de esto se escribe en `data/creatures.json` ni en el
 * borrador, y vale para todas las de su tipo en la pelea siguiente.
 */
export function renderFichaDeCatalogo(
  id: string,
  u: UnitInfo,
  probada: boolean,
  como: ComoDeLaFicha = enElMontaje(),
): Html {
  const campo = (c: string, rotulo: string, valor: number, minimo: number): Html =>
    html`<label class="campo"><span class="label">${rotulo}</span>
    <input type="number" data-catalogo-campo="${c}" value="${valor}" min="${minimo}" step="1"></label>`;
  const deshacer = probada
    ? html`<button data-arena="deshacer-prueba" data-criatura="${id}">Volver a las del catálogo</button>`
    : NADA;
  const cuando = como.enCombate ? 'ya, en esta pelea y la siguiente' : 'en la pelea siguiente';
  // El nombre del catálogo no se cambia (no hay campo para eso): su título va sin «✎».
  return html`<div class="ficha" data-clave-de-ficha="${claveDeFicha({ kind: 'catalogo', id })}">
      ${tituloDeFicha(u.name, 'Ficha · catálogo del juego', como, null)}
      ${cabezaDeFicha({
        figura: id,
        como,
        clips: NADA,
        siempre: deshacer,
        cifras: html`${campo('attack', 'Ataque', u.attack, 0)}
      ${campo('defense', 'Defensa', u.defense, 0)}
      ${campo('damage-min', 'Daño mínimo', u.damage[0], 1)}
      ${campo('damage-max', 'Daño máximo', u.damage[1], 1)}
      ${campo('hp', 'Vida', u.hp, 1)}
      ${campo('casillas', `Velocidad (casillas, ${CASILLAS_MIN} a ${CASILLAS_MAX})`, SPEED_TO_HEXES[u.speed], CASILLAS_MIN)}
      ${campo('shots', 'Disparos (0 = cuerpo a cuerpo)', u.shots ?? 0, 0)}`,
      })}
      <p class="aviso-prueba">${u.name}: ${probada ? 'con cambios de prueba' : 'las cifras del catálogo'}. Lo que cambies aquí es una prueba: no se guarda en data/creatures.json ni en el borrador, y vale para todas las de su tipo ${cuando}.</p>
      ${rasgosDeLaFicha(u.traits ?? [])}
      ${pieDeLaFicha(como, null)}
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
  const ficha = fichaDeHeroeDeArena(h, reglas);
  const c = ficha.cuerpo;
  const figuras = unir([
    html`<option value="" ${h.figura === null ? html`selected` : NADA}>Genérica del juego</option>`,
    ...hojasDeHeroe.map(
      (x) =>
        html`<option value="${x.id}" ${h.figura === x.id ? html`selected` : NADA}>${x.nombre}</option>`,
    ),
  ]);
  const cifra = (campo: string, rotulo: string, valor: number, minimo: number): Html =>
    html`<label class="campo"><span class="label">${rotulo}</span>
    <input type="number" data-heroe-campo="${campo}" value="${valor}" min="${minimo}" max="${CIFRA_MAXIMA_DE_HEROE}" step="1"></label>`;
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
      ${tituloDeFicha(h.nombre, `Ficha · héroe del bando ${LADOS[lado].adjetivo}`, como, html`data-heroe-campo="nombre"`)}
      ${cabezaDeFicha({
        figura: h.figura ?? FIGURA_GENERICA,
        como,
        clips: NADA,
        cifras: html`<label class="campo figura-del-heroe"><span class="label">Figura</span>
        <select data-heroe-campo="figura">${figuras}</select></label>
      ${cifra('ataque', 'Ataque', h.ataque, 0)}
      ${cifra('defensa', 'Defensa', h.defensa, 0)}
      ${cifra('poder', 'Poder', h.poder, 1)}
      ${cifra('conocimiento', 'Conocimiento', h.conocimiento, 0)}`,
      })}
      <h3>Libro de hechizos</h3>
      <div class="rasgos">${libro}</div>
      <h3>En la pelea</h3>
      <div class="efectivos">
        <div class="row"><span class="label">Cuerpo (con el equipo base)</span><span>A ${c.attack} · D ${c.defense} · ${c.damage[0]}–${c.damage[1]} daño · ${c.hp} PV · ${SPEED_TO_HEXES[c.speed]} casillas</span></div>
        <div class="row"><span class="label">A la tropa</span><span>${reglas.heroe === 'fheroes2' ? `+${h.ataque} de ataque y +${h.defensa} de defensa (fheroes2)` : 'nada: su ataque y su defensa son de su cuerpo'}</span></div>
        <div class="row"><span class="label">Maná</span><span>${ficha.mana} (10 × Conocimiento)</span></div>
        <div class="row"><span class="label">Duración de lo que lanza</span><span>${enRondas(ficha.duracion)} (su Poder)</span></div>
        ${rinde}
      </div>
      ${pieDeLaFicha(como, null)}
    </div>`;
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
>;

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
  const enLoAlto = activa === null ? 0 : s.defensaEnLoAlto(activa);
  const ficha =
    activa === null
      ? NADA
      : html`<h2>${nombreEnElCampo(b, activa)} ${botonDeEditar(activa, nombreEnElCampo(b, activa))}</h2>
        <div class="row"><span class="label">Bando</span><span>${LADOS[ladoDe(activa.side)].rotulo}</span></div>
        <div class="row"><span class="label">La mueve</span><span>${s.laLlevaLaIA(activa.id) ? 'la IA' : 'tú'}</span></div>
        <div class="row"><span class="label">Vida</span><span>${isAlive(activa) ? activa.topHp : 0} / ${activa.unit.hp}</span></div>
        <div class="row"><span class="label">Ataque / Defensa</span><span>${ataqueYDefensa(b, activa, enLoAlto)}</span></div>
        <div class="row"><span class="label">Daño</span><span>${activa.unit.damage[0]}–${activa.unit.damage[1]}</span></div>
        <div class="row"><span class="label">Velocidad</span><span>${SPEED_TO_HEXES[activa.unit.speed]} casillas</span></div>
        ${(activa.unit.hexes ?? 1) > 1 ? html`<div class="row"><span class="label">Hexes</span><span>${activa.unit.hexes ?? 1}</span></div>` : NADA}
        ${rasgos === '' ? NADA : html`<div class="row"><span class="label">Rasgos</span><span>${rasgos}</span></div>`}
        ${isShooter(activa.unit) ? html`<div class="row"><span class="label">Munición</span><span>${activa.shotsLeft}</span></div>` : NADA}`;
  const heroe = s.heroeEnJuego;
  const acciones =
    mia && activa !== null
      ? accionesDeLaUnidad({
          activa,
          legales: s.battleLegalActions(),
          pasos: s.battleStepsLeft(),
          rendicion: NADA,
          poderes: botonesDePoder(s, activa),
          hechizos:
            heroe === null ? NADA : renderSpells(s.hechizos.selectedSpell, s.spellOptions()),
          // La puerta, solo a quien defiende: es quien la abre y la cierra. La
          // escala, solo a quien puede llegar a escalar: al defensor, a la
          // grande y a la voladora les saldrían siempre deshabilitados.
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
