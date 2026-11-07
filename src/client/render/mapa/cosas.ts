/**
 * Las cosas del juego que se pintan entre los volúmenes del mapa (`Cosa`): los objetos
 * (el cofre, el rombo de un lugar, el monstruo), la marca del dueño de lo horneado, el
 * puesto de un paso tomado, los héroes y los grupos de asaltantes; cuáles caen en la
 * vista, con su clave de profundidad (`cosasDe`), y el cuerpo de cada una
 * (`pintarCosa`). Era parte de `render/mapa/mapa.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { figuraDelHeroe } from '@core/hero/tipos-de-heroe.js';
import { cruzaSuBarrera } from '@core/map/map.js';
import type { MapObject } from '@core/map/tipos.js';
import { inicialDelNombre } from '@core/mundo/formato.js';
import type { Point, VistaAsaltante } from '@core/types.js';
import { hojaDeUnidad } from '@core/unidad/catalogo.js';
import { temaDelLienzo } from '../../comun/temas.js';
import { FIGURA_DEL_HEROE, PIES } from '../escenario/figuras-del-mapa.js';
import { seHornea } from '../escenario/horneado.js';
import { claveDe } from '../escenario/pintar.js';
import type { NodoQueSeSabe, Obra } from '../escenario/puestos.js';
import { claveDeFigura, type Escenario, pisada } from '../escenario/superficie.js';
import type { Direccion } from '../figuras/direccion.js';
import { type Figura, pintarFiguraConSombra } from '../figuras/figura.js';
import { PRISA_EN_EL_MAPA } from '../figuras/marcha.js';
import { MIRADA_DE_PRESENTACION } from '../figuras/personajes.js';
import { pintarSombra } from '../figuras/sombra.js';
import { playerColor } from '../palette.js';
import {
  figuraDeGrupoNeutral,
  olvidarLosQueNoSePintan,
  type PosicionDeAsaltante,
  pintarAsaltante,
  posicionDeAsaltante,
} from './asaltantes.js';
import { casillaAPixel, type Margen, mundoAPixel, ventanaDeCasillas } from './camara.js';
import { pintarPieza } from './cofre.js';
import type { HeroeEnElMapa, VistaMapa } from './mapa.js';

/** El marcador del cofre sin su pieza: un ladrillo del color de la madera vieja. */
export const COLOR_DEL_COFRE = '#a8762c';

/**
 * El rombo de un lugar de un mundo (F1a del mapa vivo), sin arte nuevo (P5): la
 * pieza del exterior va con el arte bajo demanda (F2), que la hornea en la escena.
 */
export const COLOR_DEL_LUGAR = '#d8b25a';

/**
 * Cuántas casillas fuera de la cámara se sigue pintando una figura: lo más ancho
 * que lleva —la chapa, el estandarte— asoma desde la casilla de al lado.
 */
const MARGEN_DE_COSA: Margen = { lados: 2, arriba: 2, abajo: 2 };

/**
 * Dónde se ordena el rombo de un lugar: por detrás de quien está en él. Con el pie
 * de lo suelto tapaba al héroe y solo se veía su chapa (H4 del QA de la F1a); el
 * lugar, como un pueblo, es el sitio donde está. No va en `PIES`: no es una figura,
 * y la de pies más altos de `PIES` es la que mide `pisablesTapadas`.
 */
const PIE_DEL_LUGAR = PIES.heroe - 0.02;

/** Algo del juego que se pinta entre los volúmenes, con su clave de profundidad. */
export type Cosa =
  | { readonly tipo: 'objeto'; readonly clave: number; readonly objeto: MapObject }
  | {
      readonly tipo: 'horneado';
      readonly clave: number;
      readonly objeto: MapObject;
      /** De donde cuelga su marca (`Escenario.asientoDeObjeto`). */
      readonly asiento: readonly [number, number];
    }
  | {
      /** El puesto de un paso tomado: su obra, con la bandera del dueño en lo alto. */
      readonly tipo: 'puesto';
      readonly clave: number;
      readonly nodo: Extract<MapObject, { kind: 'node' }>;
      /** La pieza de su obra, de la escena (`Escenario.puestoDeNodo`): la pinta con los volúmenes. */
      readonly obra: Obra;
    }
  | {
      readonly tipo: 'heroe';
      readonly clave: number;
      readonly heroe: HeroeEnElMapa;
      /** Donde pisa, en casillas (`pisada`): en un puente, su tablero. */
      readonly pie: { readonly x: number; readonly y: number };
      /** Hacia dónde anda, si anda (`VistaMapa.andando`). */
      readonly anda: Direccion | null;
    }
  | {
      readonly tipo: 'asaltante';
      readonly clave: number;
      readonly asaltante: VistaAsaltante;
      readonly en: PosicionDeAsaltante;
    };

/**
 * Las figuras del juego que caen en la vista, de atrás adelante. Se rehace a cada
 * fotograma —son unas decenas— porque los asaltantes andan y su clave con ellos.
 */
export function cosasDe(
  v: VistaMapa,
  esc: Escenario,
  nodos: ReadonlyMap<string, NodoQueSeSabe>,
): Cosa[] {
  const { escena, camara } = v;
  const { x0, y0, x1, y1 } = ventanaDeCasillas(camara, v.ancho, v.alto, MARGEN_DE_COSA);
  const enVista = (p: Point) => p.x >= x0 && p.y >= y0 && p.x < x1 && p.y < y1;
  const lista: Cosa[] = [];
  // Objetos, héroes y grupos llegan ya filtrados por la niebla
  // (`objetosConocidos`, `heroesALaVista`, `asaltantesALaVista`): lo que se ve
  // está siempre explorado, así que aquí solo se recortan a la cámara.
  for (const o of v.objetos) {
    if (!enVista(o.at) || !presente(o)) continue;
    if (seHornea(o.kind)) {
      // Su volumen lo pinta la escena; aquí va lo que cambia, justo después de él
      // (`claveDeLaMarca`), salvo el óvalo de una ciudad, que es suelo de su plaza.
      const clave = esc.claveDeLaMarca.get(o.id);
      if (clave === undefined)
        throw new Error(`${o.kind} ${o.id} se hornea y la escena no lo pinta`);
      const asiento = esc.asientoDeObjeto.get(o.id);
      if (asiento === undefined) throw new Error(`${o.kind} ${o.id} se hornea y no tiene asiento`);
      lista.push({ tipo: 'horneado', clave, objeto: o, asiento });
      // Un paso tomado es un puesto (puesto fronterizo): su obra es un volumen de
      // la escena (`volumenesALaVista`), y aquí va solo su bandera, que se planta
      // encima de todo. Sin sitio (lo cuenta `informe.puestosSinSitio`), nada.
      if (o.kind === 'node' && o.owner !== null) {
        const obra = esc.puestoDeNodo.get(o.id)?.[o.mejora];
        if (obra !== undefined) lista.push({ tipo: 'puesto', clave: claveDe(obra), nodo: o, obra });
      }
    } else {
      const pies =
        o.kind === 'monster' ? PIES.grupo : o.kind === 'lugar' ? PIE_DEL_LUGAR : PIES.suelto;
      lista.push({ tipo: 'objeto', clave: claveDeFigura(esc, o.at.x, o.at.y + pies), objeto: o });
    }
  }
  for (const h of v.heroes) {
    const a = v.andando?.heroe === h.id ? v.andando : undefined;
    if (a === undefined) {
      if (!enVista(h.at)) continue;
      const pie = pisada(esc, h.at, PIES.heroe, nodos);
      lista.push({ tipo: 'heroe', clave: pie.clave, heroe: h, pie, anda: null });
      continue;
    }
    // El que anda, donde pisa por su traza, y con la clave de la casilla que tiene
    // más cerca: pasa por detrás de lo que tapa a quien está en ella.
    if (!enVista(a.cerca)) continue;
    const { clave } = pisada(esc, a.cerca, PIES.heroe, nodos);
    lista.push({ tipo: 'heroe', clave, heroe: h, pie: { x: a.x, y: a.y }, anda: a.mira });
  }
  const pintados = new Set<string>();
  for (const r of v.asaltantes) {
    if (!enVista(r.at)) continue;
    pintados.add(r.id);
    const en = posicionDeAsaltante(escena, r, v.tiempo);
    const clave = claveDeFigura(esc, en.x, en.y + PIES.grupo);
    lista.push({ tipo: 'asaltante', clave, asaltante: r, en });
  }
  olvidarLosQueNoSePintan(escena, pintados);
  return lista.sort((a, b) => a.clave - b.clave);
}

function presente(o: MapObject): boolean {
  if (o.kind === 'monster') return !o.defeated;
  if (o.kind === 'chest') return !o.taken;
  return true;
}

/** El cuerpo de una cosa, en su sitio del orden de profundidad: un árbol lo puede tapar. */
export function pintarCosa(ctx: CanvasRenderingContext2D, v: VistaMapa, c: Cosa): void {
  switch (c.tipo) {
    case 'objeto':
      pintarObjeto(ctx, v, c.objeto);
      return;
    case 'horneado':
      pintarDueñoDeLoHorneado(ctx, v, c.objeto, c.asiento);
      return;
    case 'puesto':
      // Su obra se pinta con los volúmenes; aquí solo va su bandera, encima.
      return;
    case 'heroe':
      pintarHeroe(ctx, v, c.heroe, c.pie, c.anda);
      return;
    case 'asaltante':
      pintarAsaltante(ctx, v, c.asaltante, c.en);
      return;
  }
}

function pintarObjeto(ctx: CanvasRenderingContext2D, v: VistaMapa, o: MapObject): void {
  const { camara } = v;
  const tile = camara.tile;
  const c = casillaAPixel(camara, o.at);
  switch (o.kind) {
    case 'chest': {
      // Su pieza suelta (#147): antes salía de una celda del
      // atlas viejo, que se cargaba entero y se escalaba en cada fotograma.
      pintarSombra(ctx, c.x, c.y + tile * 0.22, tile * 0.4);
      if (pintarPieza(ctx, 'cofre', c.x, c.y + tile * 0.3, tile * 0.6)) return;
      ctx.fillStyle = COLOR_DEL_COFRE;
      ctx.fillRect(c.x - tile * 0.22, c.y - tile * 0.12, tile * 0.44, tile * 0.3);
      return;
    }
    case 'lugar': {
      // Un rombo en un poste, con la inicial del lugar: se ve de lejos y no se
      // confunde con un cofre ni con un pueblo.
      const r = tile * 0.26;
      const cy = c.y - tile * 0.32;
      pintarSombra(ctx, c.x, c.y + tile * 0.22, tile * 0.3);
      ctx.save();
      ctx.strokeStyle = 'rgba(30, 22, 12, 0.85)';
      ctx.lineWidth = Math.max(2, tile * 0.05);
      ctx.beginPath();
      ctx.moveTo(c.x, cy + r);
      ctx.lineTo(c.x, c.y + tile * 0.22);
      ctx.stroke();
      ctx.fillStyle = COLOR_DEL_LUGAR;
      ctx.beginPath();
      ctx.moveTo(c.x, cy - r);
      ctx.lineTo(c.x + r, cy);
      ctx.lineTo(c.x, cy + r);
      ctx.lineTo(c.x - r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const tema = temaDelLienzo();
      ctx.fillStyle = 'rgba(30, 22, 12, 0.95)';
      ctx.font = `bold ${Math.max(9, Math.round(r * 1.1))}px ${tema.letraUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(inicialDelNombre(o.name), c.x, cy + 1);
      ctx.restore();
      return;
    }
    case 'monster':
      pintarFiguraConSombra(
        ctx,
        figuraDeGrupoNeutral(tile, c, {
          id: o.id,
          body: hojaDeUnidad(o.creature),
          cuantos: o.count,
          tiempo: v.tiempo,
          andando: false,
          mira: 'SO',
        }),
      );
      return;
    case 'town':
    case 'node':
    case 'village':
      throw new Error(
        `${o.kind} ${o.id} se hornea en la escena: lo suyo es pintarDueñoDeLoHorneado`,
      );
  }
}

/**
 * El óvalo del dueño bajo la ciudad y el nodo (el del nodo, justo después de
 * su volumen; el de la ciudad, en el suelo de su plaza, `claveDeLaMarca`): se
 * lee de lejos qué es de quién, y el nodo sin dueño, gris, dice qué falta por
 * tomar. El pueblo de dentro de una región no lleva: es de quien tenga su
 * región. El del muro (pueblos en un nodo, fase 3) sí, como un nodo: se toma.
 */
function pintarDueñoDeLoHorneado(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  o: MapObject,
  asiento: readonly [number, number],
): void {
  const tile = v.camara.tile;
  const a = mundoAPixel(v.camara, ...asiento);
  switch (o.kind) {
    case 'town':
      base(ctx, a, tile * 0.62, playerColor(o.owner));
      return;
    case 'node':
      // Radio de 0,4: su óvalo baja `OVALO_BAJO_EL_ASIENTO` del asiento.
      base(ctx, a, tile * 0.4, playerColor(o.owner));
      return;
    case 'village':
      // El pueblo del muro se toma como un paso: lleva su óvalo. El de dentro, no.
      if (cruzaSuBarrera(o)) base(ctx, a, tile * 0.4, playerColor(o.owner));
      return;
    case 'chest':
    case 'monster':
    case 'lugar':
      throw new Error(`${o.kind} ${o.id} no se hornea en la escena: lo pinta pintarObjeto`);
  }
}

/** Un óvalo del color del dueño bajo lo que se posee: se lee de lejos. */
function base(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = `${color}40`;
  ctx.strokeStyle = `${color}cc`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + r * 0.45, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** El alto de la figura de un héroe, en casillas (`pintarHeroe`). */
export const ALTO_DEL_HEROE = FIGURA_DEL_HEROE.alto;

function pintarHeroe(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  h: HeroeEnElMapa,
  pie: { readonly x: number; readonly y: number },
  anda: Direccion | null,
): void {
  const tile = v.camara.tile;
  const c = mundoAPixel(v.camara, pie.x, pie.y);
  const suelo = c.y;
  const color = playerColor(h.owner);
  const { aro, seleccionado } = FIGURA_DEL_HEROE;
  // El aro del dueño, y el del seleccionado por fuera, en dorado y discontinuo.
  ctx.save();
  ctx.lineWidth = Math.max(2, tile * 0.045);
  ctx.strokeStyle = color;
  ctx.fillStyle = `${color}33`;
  ctx.beginPath();
  ctx.ellipse(c.x, suelo, tile * aro.rx, tile * aro.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (h.id === v.seleccionado) {
    ctx.strokeStyle = '#f5d973';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(c.x, suelo, tile * seleccionado.rx, tile * seleccionado.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  const figura: Figura = {
    // El héroe a pie, con la hoja de su tipo: la misma con que pisa el tablero y
    // la base (`figuraDelHeroe`). Con `HERO_BODY` era el Y Bot («la imagen es el
    // y_bot», 19-10-2026).
    id: h.id,
    body: figuraDelHeroe(h),
    // Andando, con su marcha y de cara a donde va; quieto, de frente.
    clip: anda === null ? 'idle' : 'walk',
    // Las piernas, a la prisa de la marcha del mapa: los pies no patinan.
    tiempo: anda === null ? v.tiempo : v.tiempo * PRISA_EN_EL_MAPA,
    x: c.x,
    suelo,
    alto: tile * ALTO_DEL_HEROE,
    mira: anda ?? MIRADA_DE_PRESENTACION,
    color,
    rotulo: h.name.charAt(0).toUpperCase(),
  };
  pintarFiguraConSombra(ctx, figura);
}
