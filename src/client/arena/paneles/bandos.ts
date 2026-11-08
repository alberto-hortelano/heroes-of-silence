/**
 * Los bandos del montaje de la arena (`renderBando`): cada lado con sus puestos
 * (`Puesto`: su tarjeta con la miniatura, el resumen de sus cifras, `resumenDeCifras`,
 * y «Lleva escalera») y su héroe; el enlace de la pelea (`renderEnlace`) y el lienzo
 * de una figura (`figuraEnLienzo`), que usa también la ficha. Parte del marcado de la
 * arena (`arena/paneles/`, puro y sin DOM: ver `lista.ts`); era `arena/paneles.ts`
 * hasta la fase C de la reorganización (07-11-2026).
 */
import type { HeroeDeArena } from '@core/arena/heroe.js';
import { LADOS, type Lado } from '@core/arena/lados.js';
import { armaduraDe } from '@core/battle/armas.js';
import type { EquipoAtado } from '@core/equipo/atado.js';
import { type CreatureTrait, NOMBRE_DE_RASGO, SPEED_TO_HEXES, type UnitInfo } from '@core/types.js';
import { type Unidad, unidadDeCombate } from '@core/unidad/formato.js';
import { DESHABILITADO, type Html, html, MARCADO, NADA, unir } from '../../comun/html.js';

/**
 * Un puesto del montaje: la unidad del catálogo que sale, por su id (la de una
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

/** Lo que la tarjeta de un puesto enseña: lo da `montaje.ts`, que sabe de dónde sale cada cifra. */
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

/** Los rasgos dichos con palabras, o nada. */
export function rasgosDichos(traits: readonly CreatureTrait[] | undefined): string {
  return (traits ?? []).map((t) => NOMBRE_DE_RASGO[t]).join(', ');
}

/**
 * Una línea con las cifras con las que pelea una unidad, su equipo sumado
 * (`unidadDeCombate`), para la tarjeta del bando: también los rasgos, que antes
 * no salían y un guerrero que vuela se veía igual que uno normal (M9 de QA). Y lo
 * que lleva puesto, que es de donde salen.
 */
export function resumenDeCifras(u: Unidad, piezas: EquipoAtado): string {
  const lleva = piezas.piezasPuestas(u.equipo).map((p) => p.nombre);
  return `${resumenDeUnidad(unidadDeCombate(u, piezas))}${lleva.length === 0 ? '' : ` · lleva ${lleva.join(', ')}`}`;
}

/**
 * Lo mismo para las cifras del motor: ataque, defensa, daño, PV, armadura,
 * casillas y rasgos. Sin tiros ni casillas que ocupa: en la arena no hay munición y toda
 * unidad ocupa una (13-10-2026).
 */
function resumenDeUnidad(u: UnitInfo): string {
  const rasgos = (u.traits ?? []).length === 0 ? '' : ` · ${rasgosDichos(u.traits)}`;
  // La armadura (#262), solo si la lleva: sin ella la línea es la de siempre.
  const armadura = armaduraDe(u) === 0 ? '' : ` · ${armaduraDe(u)} armadura`;
  return `A ${u.attack} · D ${u.defense} · ${u.damage[0]}–${u.damage[1]} daño · ${u.hp} PV${armadura} · ${SPEED_TO_HEXES[u.speed]} casillas${rasgos}`;
}

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

/** Lo que mide el lienzo de una figura en cada sitio: el puesto, la rueda y la ficha. */
const TAMAÑO_DE_FIGURA = {
  puesto: [72, 88],
  rueda: [80, 96],
  ficha: [200, 230],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * El lienzo de una figura (`canvas.figura`): lo anima `figuras.ts` y lo tiñe del
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
 * El enlace de la pelea, si se copió y sigue siendo el del montaje: en un campo
 * para copiarlo a mano cuando el portapapeles no deja (`enlace.ts` lo intenta).
 */
export function renderEnlace(enlace: string | null): Html {
  if (enlace === null) return NADA;
  return html`<div class="enlace-de-pelea"><h3>Enlace de la pelea</h3>
    <input type="text" readonly data-enlace-de-pelea value="${enlace}" aria-label="Enlace de la pelea"></div>`;
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
