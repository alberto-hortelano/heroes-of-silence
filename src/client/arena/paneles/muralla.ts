/**
 * El editor de la muralla de la arena (`renderMuralla`): la rejilla de batalla donde
 * un clic pone o quita la pieza de la herramienta, las formas con nombre y las
 * columnas de salida. Parte del marcado de la arena (`arena/paneles/`, puro y sin DOM:
 * ver `lista.ts`); era `arena/paneles.ts` hasta la fase C de la reorganización
 * (07-11-2026).
 */
import {
  type FormaDeMuralla,
  ladosDeLaForma,
  NOMBRE_MAXIMO_DE_FORMA,
  REGLA_DE_LA_MURALLA,
} from '@core/arena/murallas.js';
import { bandoDeSalida, FORMA_DEL_TABLERO, filasDelTablero } from '@core/battle/board.js';
import { esMuro, ladoDeLaMuralla, type PiezaDeMuralla } from '@core/battle/muralla.js';
import type { MurallaDeBatalla } from '@core/battle/types.js';
import { type Html, html, NADA, unir } from '../../comun/html.js';

/** Con qué pinta el clic en la rejilla de la muralla. */
export type HerramientaDeMuralla = PiezaDeMuralla | 'goma';

const NOMBRE_DE_HERRAMIENTA: Readonly<Record<HerramientaDeMuralla, string>> = {
  muro: 'Muro',
  puerta: 'Puerta',
  goma: 'Goma',
};

/** Lo que el editor de la muralla necesita: la que se dibuja y las formas a mano. */
interface EditorDeMuralla {
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
