/**
 * La ruta del héroe en el mapa: sus pasos con su marca (`pasosAPintar`: el destino, la
 * parada de hoy y el aviso de una emboscada) y la línea que los une por su traza
 * (`pintarLineaDeLaRuta`, por `puntosDeLaTraza`, la misma que anda el héroe en su
 * marcha: por el arco de la puerta de un recinto), dorada lo de hoy, gris a trazos lo
 * de otro día y roja desde donde lo emboscarían; solo sobre lo explorado. Era parte de
 * `render/mapa/mapa.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import type { CasillasLeidas } from '@core/map/casillas.js';
import type { Point, VistaAsaltante } from '@core/types.js';
import { temaDelLienzo } from '../../comun/temas.js';
import { trazaPorLosArcos } from '../escenario/recinto/sendas.js';
import { type Escenario, pieEn } from '../escenario/superficie.js';
import { type CamaraMapa, mundoAPixel } from './camara.js';
import type { VistaMapa } from './mapa.js';

/** Un punto de la traza de un camino (`puntosDeLaTraza`), en casillas, y de qué casilla es. */
export interface PuntoDeLaTrazaEnElMapa {
  readonly x: number;
  readonly y: number;
  readonly paso: number;
}

/**
 * Los puntos por los que pasa quien anda las `casillas` (`trazaPorLosArcos`, la
 * única regla: por el arco de la puerta de un recinto), en casillas, con el pie de
 * cada casilla a `pies` (`pieEn`: en un puente, su tablero). La línea de la ruta
 * los pinta con 0,5, por el centro de cada casilla; el héroe que anda, a sus pies
 * (`PIES.heroe`). Sin escena todavía, el pie de cada casilla y nada más.
 */
export function puntosDeLaTraza(
  esc: Escenario | null,
  casillas: readonly Point[],
  pies: number,
): PuntoDeLaTrazaEnElMapa[] {
  if (esc === null) return casillas.map((c, paso) => ({ x: c.x + 0.5, y: c.y + pies, paso }));
  return trazaPorLosArcos(esc.escena.recintos, casillas).map(({ en, paso }) => {
    const [x, y] = en ?? pieEn(esc, casillas[paso] as Point, pies);
    return { x, y, paso };
  });
}

/**
 * Un paso de la ruta que se enseña: dorado si llega hoy, gris si otro día, y
 * rojo desde donde un grupo a la vista emboscaría al héroe (`peligro`).
 */
export interface PasoDeRuta {
  readonly at: Point;
  readonly hoy: boolean;
  readonly peligro?: boolean;
  /** En el primer paso con peligro: el grupo que embosca ahí. */
  readonly emboscada?: VistaAsaltante;
  /**
   * En el primer paso de otro día, si es una barrera que se cruza infiltrado: la
   * frase del núcleo de por qué hoy se para antes (`barreraDeMañana`).
   */
  readonly barrera?: string;
}

/** El tramo de una ruta donde un grupo a la vista emboscaría al héroe. */
export const COLOR_EMBOSCADA = '#d8332a';

/** Cómo se pinta un paso: el destino y la parada de hoy van más grandes. */
export interface PasoPintado extends PasoDeRuta {
  readonly marca: 'destino' | 'parada' | 'paso';
}

/**
 * Los pasos de la ruta que se pintan, con su marca: solo los de casillas
 * exploradas.
 *
 * La ruta la calcula el núcleo con el mapa entero, y pintada sobre la niebla
 * **dibujaba la red sin explorar**: el trazo esquivaba cordilleras que el
 * jugador no ha visto y se paraba en pasos que no conoce (M5 de la QA de la
 * 2a). Lo de dentro de la niebla no se pinta, tampoco el destino; el destino
 * explorado sí. Con `explorado` a `null` —verlo todo, o el espectador— se pinta
 * entera.
 *
 * La marca se decide **sobre la ruta entera y después se filtra**, y el orden
 * importa: al revés, el último paso explorado salía con el círculo grande del
 * destino, señalando como llegada una casilla que no lo es.
 */
export function pasosAPintar(
  ruta: readonly PasoDeRuta[],
  explorado: CasillasLeidas | null,
): readonly PasoPintado[] {
  const marcados = ruta.map((paso, i): PasoPintado => {
    // El último de hoy es donde se parará el héroe: se marca aparte.
    const marca =
      i === ruta.length - 1
        ? 'destino'
        : paso.hoy && (ruta[i + 1]?.hoy ?? false) === false
          ? 'parada'
          : 'paso';
    return { ...paso, marca };
  });
  if (explorado === null) return marcados;
  return marcados.filter((paso) => explorado.has(paso.at));
}

export function pintarRuta(
  ctx: CanvasRenderingContext2D,
  camara: CamaraMapa,
  esc: Escenario,
  pasos: readonly PasoPintado[],
): void {
  if (pasos.length === 0) return;
  ctx.save();
  for (const paso of pasos) {
    // En la casilla de un puente, sobre su tablero: donde se pintará el héroe.
    const [px, py] = pieEn(esc, paso.at, 0.5);
    const c = mundoAPixel(camara, px, py);
    // El tramo de la emboscada en rojo, hoy u otro día: ahí se para la marcha y
    // empieza una batalla, que es lo que la persona tiene que ver antes de pulsar.
    ctx.fillStyle = COLOR_DEL_TRAMO[estiloDelPaso(paso)];
    ctx.strokeStyle = CONTORNO_DE_LA_RUTA;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, paso.marca === 'paso' ? 3.5 : 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (paso.emboscada !== undefined) {
      // La casilla donde salta: un aviso que se lee sin color —un «!» en un
      // rombo—, porque el rojo solo no lo distingue quien no ve el rojo.
      ctx.fillStyle = COLOR_EMBOSCADA;
      ctx.strokeStyle = '#fff4e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 13);
      ctx.lineTo(c.x + 10, c.y);
      ctx.lineTo(c.x, c.y + 13);
      ctx.lineTo(c.x - 10, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff4e0';
      ctx.font = `bold 14px ${temaDelLienzo().letraUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', c.x, c.y + 1);
    }
    if (paso.marca === 'parada') {
      ctx.strokeStyle = COLOR_DEL_TRAMO.hoy;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Cómo va cada tramo de la ruta, por el paso al que llega: lo que se anda hoy,
 * lo de otro día y, desde donde un grupo a la vista emboscaría, el peligro.
 */
type EstiloDelTramo = 'hoy' | 'otroDia' | 'peligro';

function estiloDelPaso(paso: PasoDeRuta): EstiloDelTramo {
  return paso.peligro === true ? 'peligro' : paso.hoy ? 'hoy' : 'otroDia';
}

/** Los colores de la ruta, los mismos en sus puntos y en su línea: «dorado hoy, gris otro día». */
const COLOR_DEL_TRAMO: Readonly<Record<EstiloDelTramo, string>> = {
  hoy: '#f6db78',
  otroDia: '#9aa1a8',
  peligro: COLOR_EMBOSCADA,
};

/** El contorno oscuro de los puntos y de la línea: la despega de cualquier suelo. */
const CONTORNO_DE_LA_RUTA = '#1b1608';

/**
 * Un tramo de la ruta, de un punto de su traza al siguiente (`puntosDeLaTraza`), en
 * casillas: el primero sale del héroe. `visible` si se pinta: con las casillas de
 * sus dos puntas exploradas, la misma regla que los puntos (`pasosAPintar`), para
 * no dibujar la red sin explorar.
 */
interface TramoDeLaRuta {
  readonly desde: { readonly x: number; readonly y: number };
  readonly hasta: { readonly x: number; readonly y: number };
  readonly estilo: EstiloDelTramo;
  readonly visible: boolean;
}

/**
 * Los tramos de la ruta en su orden, desde `origen` (la casilla del héroe; sin
 * él, desde el primer paso), por su traza: de casilla en casilla y, al cruzar la
 * puerta de un recinto, por su arco. Cada uno con el estilo del paso de la casilla
 * a la que llega: el que sale de la parada de hoy ya es de otro día.
 */
function tramosDeLaRuta(
  esc: Escenario,
  ruta: readonly PasoDeRuta[],
  origen: Point | null,
  explorado: CasillasLeidas | null,
): readonly TramoDeLaRuta[] {
  const casillas = [...(origen === null ? [] : [origen]), ...ruta.map((p) => p.at)];
  const primero = origen === null ? 0 : 1;
  const puntos = puntosDeLaTraza(esc, casillas, 0.5);
  const tramos: TramoDeLaRuta[] = [];
  for (let j = 1; j < puntos.length; j++) {
    const a = puntos[j - 1] as PuntoDeLaTrazaEnElMapa;
    const b = puntos[j] as PuntoDeLaTrazaEnElMapa;
    const de = casillas[a.paso] as Point;
    const va = casillas[b.paso] as Point;
    tramos.push({
      desde: a,
      hasta: b,
      estilo: estiloDelPaso(ruta[Math.max(0, b.paso - primero)] as PasoDeRuta),
      visible: explorado === null || (explorado.has(de) && explorado.has(va)),
    });
  }
  return tramos;
}

/**
 * La línea que une los pasos de la ruta, suavizada: por el medio de cada tramo y
 * doblando en cada punto con una curva cuyo control es el punto (pasa junto al
 * punto del paso, nunca fuera de su casilla). Cada tramo lleva su mitad de las dos
 * curvas de sus puntas (la cuadrática partida por la mitad), así que el color
 * cambia justo en la casilla donde cambia el día o empieza el peligro y la línea
 * sigue sin quiebros. Lo de otro día, a trazos.
 *
 * Mientras el héroe anda (`VistaMapa.marchaDeLaRuta`), desde donde va: lo que le
 * queda.
 *
 * Va en el suelo (`drawMapa`, paso 1b): bajo los volúmenes, las figuras, sus
 * identificadores y la niebla; el tramo con una punta sin explorar no se pinta.
 */
export function pintarLineaDeLaRuta(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  esc: Escenario,
): void {
  if (v.ruta.length === 0) return;
  const marcha = v.marchaDeLaRuta;
  const heroe = v.heroes.find((h) => h.id === v.seleccionado);
  const todos = tramosDeLaRuta(esc, v.ruta, marcha?.origen ?? heroe?.at ?? null, v.explorado);
  let tramos = todos;
  if (marcha !== undefined) {
    const t = todos[marcha.tramo];
    if (t === undefined) return;
    const desde = {
      x: t.desde.x + (t.hasta.x - t.desde.x) * marcha.t,
      y: t.desde.y + (t.hasta.y - t.desde.y) * marcha.t,
    };
    tramos = [{ ...t, desde }, ...todos.slice(marcha.tramo + 1)];
  }
  if (!tramos.some((t) => t.visible)) return;
  // Los vértices de la cadena, en píxeles: los puntos de su traza (en un puente,
  // su tablero). P[k] y P[k + 1] son las puntas del tramo k.
  const camara = v.camara;
  const enPixeles = (p: { readonly x: number; readonly y: number }) =>
    mundoAPixel(camara, p.x, p.y);
  const P = [enPixeles(tramos[0]!.desde), ...tramos.map((t) => enPixeles(t.hasta))];
  const medio = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const M = tramos.map((_, k) => medio(P[k]!, P[k + 1]!));
  const ultimo = P.length - 1;

  /** El tramo k como trazo: de la mitad de la curva de su arranque a la de su llegada. */
  const trazar = (k: number, empieza: boolean): void => {
    const a = P[k]!;
    const b = P[k + 1]!;
    const m = M[k]!;
    if (k === 0) {
      if (empieza) ctx.moveTo(a.x, a.y);
      ctx.lineTo(m.x, m.y);
    } else {
      // La mitad de la curva M[k-1] → (a) → M[k] que es de este tramo.
      const ini = { x: (M[k - 1]!.x + 2 * a.x + m.x) / 4, y: (M[k - 1]!.y + 2 * a.y + m.y) / 4 };
      if (empieza) ctx.moveTo(ini.x, ini.y);
      ctx.quadraticCurveTo((a.x + m.x) / 2, (a.y + m.y) / 2, m.x, m.y);
    }
    if (k + 1 === ultimo) {
      ctx.lineTo(b.x, b.y);
    } else {
      const sig = M[k + 1]!;
      const fin = { x: (m.x + 2 * b.x + sig.x) / 4, y: (m.y + 2 * b.y + sig.y) / 4 };
      ctx.quadraticCurveTo((m.x + b.x) / 2, (m.y + b.y) / 2, fin.x, fin.y);
    }
  };

  // Los tramos seguidos, visibles y del mismo estilo van en un solo trazo: los
  // trazos de lo de otro día no se reinician en cada casilla.
  const grupos: { estilo: EstiloDelTramo; desde: number; hasta: number }[] = [];
  tramos.forEach((t, k) => {
    if (!t.visible) return;
    const g = grupos.at(-1);
    if (g !== undefined && g.hasta === k - 1 && g.estilo === t.estilo) g.hasta = k;
    else grupos.push({ estilo: t.estilo, desde: k, hasta: k });
  });

  const ancho = Math.max(2.5, camara.tile * 0.07);
  const contorno = ancho + Math.max(2, ancho * 0.6);
  // Lo de otro día, a trazos con su contorno cada uno: el mismo patrón en las dos
  // pasadas (el remate redondo alarga cada trazo medio grueso por punta, así que
  // quedan centrados), y el hueco deja ver el suelo entre los contornos.
  const aTrazos = [ancho * 1.6, ancho * 1.8 + contorno];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Primero el contorno de todo y después el color, para que en el cambio de
  // estilo el contorno de un tramo no muerda la punta del de al lado.
  for (const pasada of ['contorno', 'color'] as const) {
    for (const g of grupos) {
      const grueso = pasada === 'contorno' ? contorno : ancho;
      ctx.beginPath();
      for (let k = g.desde; k <= g.hasta; k++) trazar(k, k === g.desde);
      ctx.setLineDash(g.estilo === 'otroDia' ? aTrazos : []);
      ctx.strokeStyle = pasada === 'contorno' ? CONTORNO_DE_LA_RUTA : COLOR_DEL_TRAMO[g.estilo];
      ctx.globalAlpha = pasada === 'contorno' ? 0.75 : 0.95;
      ctx.lineWidth = grueso;
      ctx.stroke();
    }
  }
  ctx.restore();
}
