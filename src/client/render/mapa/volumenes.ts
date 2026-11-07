/**
 * Lo que tiene altura en el mapa: los volúmenes de la escena que asoman en la vista
 * (`volumenesALaVista`, con la pieza de cada nodo que dice lo que se sabe de él),
 * fundidos por profundidad con las cosas del juego (`fundirPorProfundidad`,
 * `pintarLoQueTieneAltura`) y recortados al mapa salvo por arriba (`recortadoArriba`);
 * el marcador de la obra de un puesto sin su imagen y lo que tapa a cada grupo de
 * asaltantes. Era parte de `render/mapa/mapa.ts` hasta la fase C de la reorganización
 * (07-11-2026).
 */
import type { CasillasLeidas } from '@core/map/casillas.js';
import { imagenDeEscena } from '../assets.js';
import { empezarFotogramaDeCopias } from '../copias.js';
import { type NodoQueSeSabe, type Sprite, seVeConSuNodo } from '../escenario/colocar/sprite.js';
import { cajaDeSprite } from '../escenario/pasillo.js';
import {
  imagenCargada,
  type OpcionesDePintura,
  pintarSombraAlPie,
  pintarSprite,
  type Volumen,
} from '../escenario/pintar.js';
import { cajaDeLaObra, esObra, type Obra } from '../escenario/puestos.js';
import { copiaDeVolumen, type Escenario, type VolumenDelMapa } from '../escenario/superficie.js';
import { animarHasta, colocarFigura, type FiguraColocada } from '../figuras/figura.js';
import { densidadDe } from '../lienzo.js';
import { type AsaltanteTapado, figuraDelAsaltante } from './asaltantes.js';
import { casillaAPixel, MARGEN_DE_VOLUMEN, mundoAPixel, ventanaDeCasillas } from './camara.js';
import { type Cosa, pintarCosa } from './cosas.js';
import { aplicar, cajaDeLaCelda, type Matriz } from './figura-tapada.js';
import type { VistaMapa } from './mapa.js';
import { pintarMarcadorDelPuesto } from './marcador-del-puesto.js';

/**
 * Lo que se sabe de cada nodo, por su id: el dueño y la mejora que se vieron por
 * última vez. Elige la pieza que se pinta en él, el hito o la obra de su puesto
 * (`seVeConSuNodo`), y de ellas lo que cuenta para quien está en una barrera
 * (`pisada`).
 */
export function nodosQueSeSaben(v: VistaMapa): ReadonlyMap<string, NodoQueSeSabe> {
  return new Map(v.objetos.flatMap((o) => (o.kind === 'node' ? [[o.id, o] as const] : [])));
}

/**
 * Los volúmenes de la escena que asoman en la vista, en su orden: se recorren
 * solo las filas visibles.
 *
 * Los volúmenes se pintan también sobre lo que no se ha explorado: la niebla
 * los tapa después, y lo que asoma por encima de lo explorado es la copa de una
 * formación cuya raíz sigue en la niebla (aceptado por el usuario). Lo horneado
 * no: una ciudad asomando diría dónde hay una ciudad.
 */
export function volumenesALaVista(
  v: VistaMapa,
  esc: Escenario,
  nodos: ReadonlyMap<string, NodoQueSeSabe>,
): VolumenDelMapa[] {
  const { camara, explorado } = v;
  const { x0, y0, x1, y1 } = ventanaDeCasillas(camara, v.ancho, v.alto, MARGEN_DE_VOLUMEN);
  const fuera: VolumenDelMapa[] = [];
  for (let fila = Math.max(0, y0); fila < Math.min(esc.porFila.length, y1); fila++)
    for (const vol of esc.porFila[fila] as readonly VolumenDelMapa[]) {
      // Con la base por encima de la vista no asoma: crece hacia arriba.
      if (vol.s.x < x0 || vol.s.x >= x1 || vol.s.y < camara.y) continue;
      if (vol.niebla !== null && explorado !== null && !explorado.hasIndex(vol.niebla)) continue;
      const deNodo = vol.s.deNodo;
      if (deNodo !== undefined && !seVeConSuNodo(deNodo, nodos.get(deNodo.id))) continue;
      fuera.push(vol);
    }
  return fuera;
}

/**
 * Los volúmenes y las figuras fundidos por su clave. Los volúmenes se pintan en
 * píxeles de dispositivo con el origen del mapa en un píxel entero, que es lo que
 * pide su copia reducida (`OpcionesDePintura.reducida`); las figuras, en los de
 * la pantalla.
 */
export function pintarLoQueTieneAltura(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  volumenes: readonly VolumenDelMapa[],
  cosas: readonly Cosa[],
): AsaltanteTapado[] {
  const enPantalla = ctx.getTransform();
  const dpr = densidadDe(ctx);
  const origen = mundoAPixel(v.camara, 0, 0);
  const ox = Math.round(enPantalla.e + origen.x * dpr);
  const oy = Math.round(enPantalla.f + origen.y * dpr);
  // Lo que no cupo en este fotograma (`copiaReducidaSiCabe`) sale en los
  // siguientes: el lienzo tiene que seguir pidiéndolos aunque nada respire.
  let aplazado = false;
  empezarFotogramaDeCopias();
  const opciones: OpcionesDePintura = {
    tile: v.camara.tile * dpr,
    imagen: imagenDeEscena,
    reducida: (s, ancho, alto) => {
      const r = copiaDeVolumen(s, ancho, alto);
      if (r === null) aplazado = true;
      return r;
    },
  };
  // Lo que tiene altura no sale del mapa por los lados ni por abajo: una muralla
  // de la columna 0 asomaba ~50 px sobre el margen negro (H3 de la vuelta 1 de
  // QA). Por arriba sí: el borde de arriba es el fondo del mapa, y lo que se
  // levanta en la fila 0 sube por encima como sube sobre cualquier otra fila,
  // igual que en el taller, que pinta la escena con margen. Recortarlo cortaba
  // las copas de la fila 0 en una línea recta.
  // Salvo lo que sube desde una casilla sin explorar (`recortadoArriba`): por
  // encima del mapa no hay niebla que lo tape (#152).
  const anchoDelMapa = Math.round(v.escena.map.width * opciones.tile);
  const altoDelMapa = Math.round(v.escena.map.height * opciones.tile);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(ox, oy - ARRIBA_SIN_RECORTE, anchoDelMapa, ARRIBA_SIN_RECORTE + altoDelMapa);
  ctx.clip();
  // Las sombras de lo que se elige por su nodo (el hito y la obra del puesto) no
  // están horneadas en el suelo (`seHorneaSuSombra`): van aquí, bajo todo lo que
  // tiene altura, como las horneadas, y solo las de lo que se ve. La obra sin su
  // imagen no: su marcador pinta la suya.
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  for (const vol of volumenes)
    if (vol.s.deNodo !== undefined && vol.s.sombra && (!esObra(vol.s) || conSuImagen(vol.s)))
      pintarSombraAlPie(ctx, vol.s, opciones.tile);
  ctx.setTransform(enPantalla);
  const pintarVolumen = (c: CanvasRenderingContext2D, vol: VolumenDelMapa) => {
    const recortado = recortadoArriba(vol, v.explorado);
    if (recortado) {
      c.save();
      c.beginPath();
      c.rect(0, 0, anchoDelMapa, altoDelMapa);
      c.clip();
    }
    // La obra de un puesto sin su imagen —aún no ha llegado, o no la hay— es su
    // marcador dibujado, no el triángulo de lo que no tiene arte: se decide en
    // cada fotograma, y la bandera mira lo mismo (`puntaDeLaObra`).
    if (esObra(vol.s) && !conSuImagen(vol.s)) pintarMarcadorDeLaObra(c, vol.s, opciones.tile);
    else pintarSprite(c, vol.s, opciones);
    if (recortado) c.restore();
  };
  // Cada grupo de asaltantes, con lo que se pinta después de él encima de su
  // celda: lo que lo tapa y lo que va delante (`pintarLoTapadoDeLosAsaltantes`).
  const tapados: {
    readonly id: string;
    readonly figura: FiguraColocada;
    readonly caja: Caja4;
    readonly tapan: VolumenDelMapa[];
    readonly delante: Cosa[];
  }[] = [];
  const queSeTocan = (a: Caja4, b: Caja4) =>
    a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  let enElMapa = false;
  fundirPorProfundidad(
    volumenes,
    cosas,
    (vol) => {
      if (!enElMapa) {
        ctx.setTransform(1, 0, 0, 1, ox, oy);
        // Las copias de los volúmenes miden lo que se pinta y se copian 1:1;
        // solo se escala la de otro tamaño que se ve uno o pocos fotogramas
        // mientras se hace la suya (`copiaReducidaSiCabe`), y esa, en bilineal:
        // en alta calidad, los ~1 000 volúmenes que cambian de tamaño a cada
        // paso de rueda hacían tareas de 100-127 ms en 2560×1440 (2026-10-05).
        ctx.imageSmoothingQuality = 'low';
      }
      enElMapa = true;
      pintarVolumen(ctx, vol);
      if (tapados.length === 0) return;
      const [x0, y0, x1, y1] = cajaDeSprite(vol.s);
      const T = opciones.tile;
      const caja: Caja4 = [ox + x0 * T, oy + y0 * T, ox + x1 * T, oy + y1 * T];
      for (const t of tapados) if (queSeTocan(t.caja, caja)) t.tapan.push(vol);
    },
    (cosa) => {
      if (enElMapa) {
        ctx.setTransform(enPantalla);
        ctx.imageSmoothingQuality = 'high';
      }
      enElMapa = false;
      pintarCosa(ctx, v, cosa);
      if (tapados.length > 0) {
        const caja = cajaDeCosa(v, cosa, enPantalla);
        if (caja !== null)
          for (const t of tapados) if (queSeTocan(t.caja, caja)) t.delante.push(cosa);
      }
      if (cosa.tipo !== 'asaltante') return;
      const figura = colocarFigura(figuraDelAsaltante(v, cosa.asaltante, cosa.en));
      const caja = cajaDeLaCelda(figura, enPantalla);
      if (caja !== null)
        tapados.push({ id: cosa.asaltante.id, figura, caja, tapan: [], delante: [] });
    },
  );
  ctx.restore();
  if (aplazado) animarHasta(performance.now() + 100);
  // Lo que se vuelve a pintar en la máscara de lo tapado, con sus mismas reglas:
  // los volúmenes dentro del mapa y con su origen (`ox, oy`), las figuras en los
  // píxeles de la pantalla.
  const enElOrigen: Matriz = { a: 1, b: 0, c: 0, d: 1, e: ox, f: oy };
  const sinMover: Matriz = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  return tapados.flatMap((t): AsaltanteTapado[] =>
    t.tapan.length === 0
      ? []
      : [
          {
            figura: t.figura,
            enPantalla,
            // Se guarda lo compuesto si lo que lo tapa no ha de cambiar sin que lo
            // diga la clave: sin copias por hacer (`aplazado`) ni figuras delante,
            // que se animan a su aire (es raro: un héroe o un monstruo delante).
            guardar:
              aplazado || t.delante.length > 0
                ? null
                : {
                    id: t.id,
                    clave: `${opciones.tile}|${t.tapan.map((vol) => claveDelVolumen(vol, v.explorado)).join(',')}`,
                    origen: [ox, oy],
                  },
            pintarLoQueTapa: (m, poner) => {
              poner(sinMover);
              m.beginPath();
              m.rect(ox, oy - ARRIBA_SIN_RECORTE, anchoDelMapa, ARRIBA_SIN_RECORTE + altoDelMapa);
              m.clip();
              poner(enElOrigen);
              m.imageSmoothingQuality = 'low';
              for (const vol of t.tapan) pintarVolumen(m, vol);
            },
            pintarLoDeDelante:
              t.delante.length === 0
                ? null
                : (m, poner) => {
                    poner(enPantalla);
                    m.imageSmoothingQuality = 'high';
                    for (const c of t.delante) pintarCosa(m, v, c);
                  },
          },
        ],
  );
}

/** Un número por volumen de la escena, para la clave de lo tapado. */
const idsDeVolumen = new WeakMap<VolumenDelMapa, number>();

let ultimoVolumen = 0;

/**
 * Lo que dice cómo se pinta un volumen, sin dónde: cuál es, si se recorta por
 * arriba y si ya tiene su imagen (sin ella, su marcador).
 */
function claveDelVolumen(vol: VolumenDelMapa, explorado: CasillasLeidas | null): string {
  let id = idsDeVolumen.get(vol);
  if (id === undefined) {
    id = ++ultimoVolumen;
    idsDeVolumen.set(vol, id);
  }
  return `${id}${recortadoArriba(vol, explorado) ? 'r' : ''}${conSuImagen(vol.s) ? '' : 'm'}`;
}

/** Una caja en píxeles del lienzo: `[x0, y0, x1, y1]`. */
type Caja4 = readonly [number, number, number, number];

/**
 * Lo que ocupa a lo sumo una figura en píxeles del lienzo, desde donde apoya: de
 * una casilla a cada lado, dos y media por encima y media por debajo (la chapa y
 * el aro). Solo para saber si va delante de un grupo; `null` lo que no es una
 * figura: la marca del dueño de lo horneado es suelo de su plaza y la bandera
 * del puesto va con lo que dice quién está, encima de todo.
 */
function cajaDeCosa(v: VistaMapa, c: Cosa, enPantalla: Matriz): Caja4 | null {
  const en =
    c.tipo === 'objeto'
      ? casillaAPixel(v.camara, c.objeto.at)
      : c.tipo === 'heroe'
        ? mundoAPixel(v.camara, c.pie.x, c.pie.y)
        : c.tipo === 'asaltante'
          ? mundoAPixel(v.camara, c.en.x + 0.5, c.en.y + 0.5)
          : null;
  if (en === null) return null;
  const tile = v.camara.tile;
  const [x0, y0] = aplicar(enPantalla, en.x - tile, en.y - tile * 2.5);
  const [x1, y1] = aplicar(enPantalla, en.x + tile, en.y + tile * 0.6);
  return [x0, y0, x1, y1];
}

/** Cuánto, en píxeles de dispositivo, puede subir sobre el borde de arriba lo que tiene altura: sin tope. */
const ARRIBA_SIN_RECORTE = 1e6;

/**
 * Si un volumen se recorta en el borde de arriba del mapa: sube por encima y su
 * casilla no se ha explorado. La niebla solo cubre el mapa y su marco de una
 * casilla, así que sin el recorte los picos de la fila 0 sin explorar flotaban
 * sobre el fondo, en 4K al tope de alejar (#152). Desde una casilla explorada se
 * sigue viendo lo que asoma; sin niebla (el espectador), no se recorta nada.
 */
export function recortadoArriba(vol: VolumenDelMapa, explorado: CasillasLeidas | null): boolean {
  return (
    vol.asomaPorArriba !== null && explorado !== null && !explorado.hasIndex(vol.asomaPorArriba)
  );
}

/**
 * Funde dos listas ya ordenadas por `clave`: los volúmenes de la escena y las
 * figuras del juego. A igual clave va antes el volumen, y la figura se apoya
 * delante. Es la regla que decide si un héroe queda detrás de un árbol.
 */
export function fundirPorProfundidad<V extends Volumen, C extends { readonly clave: number }>(
  volumenes: readonly V[],
  cosas: readonly C[],
  alVolumen: (v: V) => void,
  aLaCosa: (c: C) => void,
): void {
  let i = 0;
  for (const vol of volumenes) {
    while (i < cosas.length && (cosas[i] as C).clave < vol.clave) aLaCosa(cosas[i++] as C);
    alVolumen(vol);
  }
  while (i < cosas.length) aLaCosa(cosas[i++] as C);
}

/** Si la obra de un puesto tiene su imagen lista para este fotograma. */
export const conSuImagen = (s: Sprite): boolean =>
  s.src !== null && imagenCargada(imagenDeEscena(s.src));

/**
 * El marcador de la obra de un puesto, en su sitio y a su escala: cabe en lo que
 * se ve de su obra (`cajaDeLaObra`). En píxeles de dispositivo, con `T` por
 * casilla, como los volúmenes.
 */
function pintarMarcadorDeLaObra(ctx: CanvasRenderingContext2D, s: Obra, T: number): void {
  const [x0, y0, x1] = cajaDeLaObra(s);
  pintarMarcadorDelPuesto(ctx, s.x * T, s.y * T, T, s.deNodo.cuando, {
    ancho: x1 - x0,
    alto: s.y - y0,
  });
}
