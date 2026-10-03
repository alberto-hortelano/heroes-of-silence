/**
 * Las reglas del escenógrafo: de un mapa del juego, una escena para pintar.
 *
 * Nada aquí es un objeto suelto por casilla. Cada franja de barrera se viste
 * como una FORMACIÓN —un bosque son cientos de árboles apretados, más altos
 * hacia dentro; una cordillera, cientos de picos que crecen hacia el centro;
 * una muralla, una sola línea de tramos con torres en las juntas— y el suelo se
 * cubre de detalle para que no quede desnudo. Las alturas (`relieve.ts`) ponen
 * mesetas, barrancos y caras de roca.
 *
 * Es puro salvo por leer los índices de los módulos y las medidas de las piezas
 * del disco; la escena es un JSON que pinta `pintor.ts`.
 */
import type { GameMap, MapObject } from '../../../src/core/map/map.js';
import type { Barrera, Suelo } from '../../../src/core/map/terrain.js';
import { nodoDePaso } from '../mapa-denso.js';
import { type Analisis, analizar, type Franja } from './analizar.js';
import type { Catalogo, Modulo, Pieza } from './catalogo.js';
import { azarDe, esparcir } from './esparcir.js';
import { ejeDe, esqueleto } from './esqueleto.js';
import { barreraDeNodo } from './nodos.js';
import { ALTO_DE_NIVEL, type Relieve, relieve } from './relieve.js';
import { type Senda, sendas } from './sendas.js';

/** Un sprite de la escena: una imagen apoyada por su ancla en `(x, y)`, en casillas. */
export interface Sprite {
  /** Ruta relativa a `assets/mapa/`, o null si el arte aún no existe (se pinta un marcador). */
  readonly src: string | null;
  /** Tamaño nativo y ancla de la imagen, en sus píxeles. */
  readonly nw: number;
  readonly nh: number;
  readonly ax: number;
  readonly ay: number;
  readonly x: number;
  readonly y: number;
  /** Alto en pantalla, en casillas. */
  readonly alto: number;
  /** Qué es: para medir y para el marcador. */
  readonly clase: 'masa' | 'muro' | 'pared' | 'cubierta' | 'roca' | 'orilla' | 'objeto' | 'nube';
  readonly color: string;
  /** Se pinta en su orden por la y (0) o encima de todo (1, las nubes). */
  readonly capa: 0 | 1;
  /** Sombra difusa al pie. */
  readonly sombra: boolean;
  /** Un filtro de canvas para entonar el módulo con el resto (`brightness(0.8)`). */
  readonly tono?: string;
  /**
   * El objeto del mapa que pinta, si pinta uno. Lo que cambia en la partida (un
   * monstruo vencido, un recurso o un cofre recogidos) no se hornea en la escena:
   * quien la pinte lo deja fuera con `pintarEscena({ objeto })` y lo pinta él.
   */
  readonly objeto?: { readonly id: string; readonly kind: MapObject['kind'] };
  /** Si la imagen es una hoja, el trozo que se pinta: `[sx, sy, sw, sh]`. */
  readonly recorte?: readonly [number, number, number, number];
}

export interface Luz {
  readonly x: number;
  readonly y: number;
  /** Radio en casillas. */
  readonly r: number;
  readonly clase: 'fuego' | 'brasa' | 'niebla';
}

export interface Escena {
  readonly semilla: number;
  readonly W: number;
  readonly H: number;
  readonly suelo: readonly Suelo[];
  readonly nivel: readonly number[];
  readonly agua: readonly number[];
  readonly relieve: Pick<Relieve, 'caras' | 'cantos' | 'rebordes'>;
  readonly altoDeNivel: number;
  readonly caminos: readonly (readonly [number, number, number, number])[];
  /** Los caminos encadenados y suavizados: lo que se pinta. */
  readonly sendas: readonly Senda[];
  /**
   * La luz y el aire, encima de todo menos las nubes: el resplandor cálido de
   * ciudades y pueblos, las brasas de la lava y la niebla baja del agua y la
   * ciénaga.
   */
  readonly luces: readonly Luz[];
  readonly sprites: readonly Sprite[];
  readonly informe: {
    readonly murallasPartidas: number;
    readonly basesSobreReserva: number;
    readonly casillasDeBarreraSinFormacion: number;
    readonly modulosQueFaltan: readonly string[];
  };
}

// ------------------------------------------------------------------ las reglas

/** Qué hoja viste cada barrera, según el suelo de al lado. */
function hojaDeMasa(b: Barrera, s: Suelo, azar: () => number, hondura = 1): string {
  if (b === 'forest') {
    if (s === 'snow') return 'abetos-nevados';
    if (s === 'swamp') return 'muertos';
    if (s === 'grass' || s === 'dirt') return azar() < 0.65 ? 'pinos' : 'frondosos';
    return 'pinos';
  }
  if (s === 'snow') return 'picos-nevados';
  if (s === 'lava') return 'picos-volcan';
  if (s === 'sand') return 'picos-arenisca';
  // En el centro de una cordillera, agujas; en las faldas, los achaparrados.
  return hondura >= 2 && azar() < 0.75 ? 'picos-afilados' : 'picos-roca';
}

/** Tamaño de cada formación: radio entre módulos y alto, en casillas, según la hondura. */
const FORMA = {
  forest: {
    radio: (h: number) => 0.3 + Math.min(h, 3) * 0.02,
    alto: (h: number) => 0.85 + Math.min(h, 3) * 0.22,
  },
  mountain: {
    radio: (h: number) => 0.42 + Math.min(h, 4) * 0.1,
    alto: (h: number) => 1.1 + Math.min(h, 4) * 0.5,
  },
} as const;

/**
 * La cubierta de cada suelo se mezcla con la de su vecino natural: la roca lleva
 * matas de pradera entre las piedras y la lava, roca suelta. Con una sola hoja,
 * los suelos duros quedaban pelados.
 */
const MEZCLA: Readonly<Record<Suelo, readonly (readonly [Suelo, number])[]>> = {
  grass: [['grass', 1]],
  dirt: [
    ['dirt', 0.75],
    ['grass', 0.25],
  ],
  sand: [['sand', 1]],
  snow: [['snow', 1]],
  swamp: [
    ['swamp', 0.8],
    ['grass', 0.2],
  ],
  lava: [
    ['lava', 0.7],
    ['rough', 0.3],
  ],
  rough: [
    ['rough', 0.55],
    ['grass', 0.45],
  ],
};

function hojaDeCubierta(s: Suelo, tirada: number): string {
  let acumulado = 0;
  for (const [otro, peso] of MEZCLA[s]) {
    acumulado += peso;
    if (tirada < acumulado) return `cubierta-${otro}`;
  }
  return `cubierta-${s}`;
}

/** Densidad de la cubierta del suelo: radio entre detalles y alto, en casillas. */
const CUBIERTA: Readonly<Record<Suelo, { radio: number; alto: number }>> = {
  grass: { radio: 0.24, alto: 0.42 },
  dirt: { radio: 0.3, alto: 0.5 },
  sand: { radio: 0.28, alto: 0.4 },
  snow: { radio: 0.26, alto: 0.44 },
  swamp: { radio: 0.24, alto: 0.42 },
  lava: { radio: 0.27, alto: 0.4 },
  rough: { radio: 0.25, alto: 0.38 },
};

/** Hojas de piedra clara que se pintan más oscuras para no salpicar. */
const PALIDAS = new Set(['rocas-caidas', 'cubierta-rough', 'cubierta-sand']);
/** Y las de arenisca, que salen de un rojo que grita al lado del resto. */
const CHILLONAS = new Set(['picos-arenisca']);

/**
 * Lo ancho que se pinta cada tramo de muro, en casillas, para que cubra su paso
 * con un poco de solape: el horizontal, una casilla; el diagonal, √2; el que va
 * hacia el fondo es estrecho y se mide por lo que sube en pantalla.
 */
const ANCHO_DE_TRAMO: Readonly<Record<string, number>> = {
  horizontal: 1.25,
  'diagonal-baja': 1.5,
  'diagonal-sube': 1.5,
  profundidad: 0.55,
};

const MARCADOR: Readonly<Record<string, string>> = {
  forest: '#1f3a22',
  mountain: '#6e6a74',
  wall: '#6d6656',
  cliff: '#7a5a3a',
  water: '#2a4a6a',
  cubierta: '#4f5a35',
};

/** Reservas: donde nada que no sea el objeto puede apoyarse (sub-rejilla de 4 por casilla). */
class Reservas {
  private readonly celdas: Uint8Array;
  constructor(
    private readonly W: number,
    private readonly H: number,
  ) {
    this.celdas = new Uint8Array(W * 4 * H * 4);
  }
  reservar(x: number, y: number, r: number): void {
    for (let sy = Math.floor((y - r) * 4); sy <= Math.ceil((y + r) * 4); sy++)
      for (let sx = Math.floor((x - r) * 4); sx <= Math.ceil((x + r) * 4); sx++) {
        if (sx < 0 || sy < 0 || sx >= this.W * 4 || sy >= this.H * 4) continue;
        if (Math.hypot((sx + 0.5) / 4 - x, (sy + 0.5) / 4 - y) <= r)
          this.celdas[sy * this.W * 4 + sx] = 1;
      }
  }
  tomada(x: number, y: number): boolean {
    const sx = Math.floor(x * 4);
    const sy = Math.floor(y * 4);
    if (sx < 0 || sy < 0 || sx >= this.W * 4 || sy >= this.H * 4) return false;
    return this.celdas[sy * this.W * 4 + sx] === 1;
  }
}

/** El monstruo que guarda el mapa: el primer fotograma de reposo de una tropa. */
const MONSTRUO = {
  src: '../unidades/orko-hacha-escudo/atlas.webp',
  nw: 256,
  nh: 256,
  ax: 128,
  ay: 228,
  recorte: [0, 0, 256, 256] as const,
};

export function componer(map: GameMap, semilla: number, catalogo: Catalogo): Escena {
  /** Los módulos de una hoja, de menor a mayor, o null si la hoja aún no está hecha. */
  const modulosDe = (hoja: string): readonly Modulo[] | null => catalogo.hojas[hoja] ?? null;
  const pieza = (id: string): Pieza | null => catalogo.piezas[id] ?? null;
  const a = analizar(map);
  const rel = relieve(a, semilla);
  const azar = azarDe(semilla * 7919 + 1);
  const { W, H } = a;
  const sprites: Sprite[] = [];
  const faltan = new Set<string>();
  const reservas = new Reservas(W, H);
  let basesSobreReserva = 0;

  /** Un sprite de una hoja: elige el módulo por tamaño relativo `t` (0 pequeño, 1 grande). */
  const deHoja = (
    hoja: string,
    x: number,
    y: number,
    alto: number,
    t: number,
    clase: Sprite['clase'],
    color: string,
    sombra: boolean,
    nombre?: string,
    porAncho?: number,
  ): Sprite => {
    if (clase !== 'objeto' && clase !== 'nube' && reservas.tomada(x, y)) basesSobreReserva++;
    const ms = modulosDe(hoja);
    if (ms === null || ms.length === 0) {
      faltan.add(hoja);
      return {
        src: null,
        nw: 1,
        nh: 1,
        ax: 0.5,
        ay: 1,
        x,
        y,
        alto,
        clase,
        color,
        capa: clase === 'nube' ? 1 : 0,
        sombra,
      };
    }
    let m: Modulo | undefined;
    if (nombre !== undefined) m = ms.find((k) => k.nombre === nombre);
    if (m === undefined) {
      // Alrededor del cuantil `t`, con algo de azar para que no se repitan.
      const centro = Math.round(t * (ms.length - 1));
      const k = Math.max(0, Math.min(ms.length - 1, centro + Math.round((azar() - 0.5) * 4)));
      m = ms[k] as Modulo;
    }
    // Las piedras claras (rocas caídas, cubierta de roca y de nieve) salpicaban
    // el mapa de motas blancas: se entonan para que no compitan con las formas.
    const tono = PALIDAS.has(hoja)
      ? { tono: 'brightness(0.78) saturate(0.9)' }
      : CHILLONAS.has(hoja)
        ? { tono: 'brightness(0.8) saturate(0.72)' }
        : {};
    return {
      ...tono,
      src: m.src,
      nw: m.nw,
      nh: m.nh,
      ax: m.ax,
      ay: m.ay,
      x,
      y,
      // Un tramo de muro se mide por lo largo que tiene que ser, no por lo alto.
      alto: porAncho === undefined ? alto : (porAncho * m.nh) / m.nw,
      clase,
      color,
      capa: clase === 'nube' ? 1 : 0,
      sombra,
    };
  };

  // 1 · Los objetos primero: reservan su sitio y nada se apoya encima.
  const RADIO_DE_OBJETO: Readonly<Record<string, number>> = {
    town: 1.5,
    village: 1.1,
    node: 0.95,
    resource: 0.5,
    mine: 0.6,
    chest: 0.4,
    monster: 0.45,
  };
  for (const o of a.objetos) {
    const x = o.at.x + 0.5;
    const y = o.at.y + 0.5;
    reservas.reservar(x, y, RADIO_DE_OBJETO[o.kind] ?? 0.5);
    const id =
      o.kind === 'town'
        ? 'ciudad'
        : o.kind === 'village'
          ? 'pueblo'
          : o.kind === 'node'
            ? (() => {
                const { barrera, eje } = barreraDeNodo(o.at, W, a.terreno);
                return nodoDePaso(barrera, eje);
              })()
            : o.kind === 'resource'
              ? // Mercurio, azufre, cristal y gemas no tienen pieza: van como tesoro.
                (({ gold: 'oro', ore: 'piedra', wood: 'madera' } as Record<string, string>)[
                  o.resource
                ] ?? 'oro')
              : o.kind === 'mine'
                ? 'atlas/mina'
                : o.kind === 'chest'
                  ? 'atlas/cofre'
                  : null;
    if (o.kind === 'monster') {
      sprites.push({
        ...MONSTRUO,
        x,
        y: y + 0.3,
        alto: 1.0,
        clase: 'objeto',
        color: '#b0553f',
        capa: 0,
        sombra: true,
        objeto: { id: o.id, kind: o.kind },
      });
      continue;
    }
    // Ancho en casillas: los de la composición de prueba, que se veían bien.
    const ancho =
      { town: 2.4, village: 1.9, node: 1.7, resource: 0.95, mine: 1.2, chest: 0.6 }[
        o.kind as 'town'
      ] ?? 0.5;
    // Ciudades y pueblos, cada uno con su variante de la hoja (por su id, siempre
    // la misma); sin la hoja, la pieza única de antes.
    const variantes =
      o.kind === 'town'
        ? modulosDe('ciudades')
        : o.kind === 'village'
          ? modulosDe('pueblos')
          : null;
    const variante =
      variantes !== null && variantes.length > 0
        ? variantes[
            [...o.id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7) %
              variantes.length
          ]
        : undefined;
    const p = variante ?? (id === null ? null : pieza(id));
    sprites.push(
      p === null
        ? {
            src: null,
            nw: 1,
            nh: 1,
            ax: 0.5,
            ay: 1,
            x,
            y: y + 0.35,
            alto: ancho,
            clase: 'objeto',
            color: '#c9b27a',
            capa: 0,
            sombra: true,
            objeto: { id: o.id, kind: o.kind },
          }
        : {
            ...p,
            x,
            y: y + 0.35,
            alto: (ancho * p.nh) / p.nw,
            clase: 'objeto',
            color: '#c9b27a',
            capa: 0,
            sombra: true,
            objeto: { id: o.id, kind: o.kind },
          },
    );
  }

  // 2 · Los caminos: reservan su franja.
  const caminos: [number, number, number, number][] = [];
  for (const i of a.caminos) {
    const x = i % W;
    const y = (i - x) / W;
    reservas.reservar(x + 0.5, y + 0.5, 0.38);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const k = (y + dy) * W + x + dx;
      if (!a.caminos.has(k) || x + dx < 0 || x + dx >= W || y + dy >= H) continue;
      if (
        dx !== 0 &&
        dy !== 0 &&
        (a.caminos.has(y * W + x + dx) || a.caminos.has((y + dy) * W + x))
      )
        continue;
      caminos.push([x + 0.5, y + 0.5, x + dx + 0.5, y + dy + 0.5]);
    }
  }
  // Los nodos y los objetos llevan su camino hasta la puerta: se reserva la casilla entera.
  for (const o of a.objetos)
    if (o.kind === 'node') reservas.reservar(o.at.x + 0.5, o.at.y + 0.5, 0.75);

  // 3 · Las formaciones, franja a franja.
  let murallasPartidas = 0;
  let sinFormacion = 0;
  const cubiertas = new Uint8Array(W * H);
  for (const f of a.franjas) {
    const puestos = vestirFranja(f);
    for (const i of f.casillas) if (puestos.has(i)) cubiertas[i] = 1;
  }
  // Lo que cae bajo la huella de una ciudad, un pueblo o un nodo lo tapa el propio objeto.
  for (const o of a.objetos) {
    const r =
      o.kind === 'town' || o.kind === 'village' || o.kind === 'node' ? RADIO_DE_OBJETO[o.kind] : 0;
    if (r === undefined || r === 0) continue;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = o.at.x + dx;
        const y = o.at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(dx, dy) < r) cubiertas[y * W + x] = 1;
      }
  }
  for (const f of a.franjas)
    for (const i of f.casillas)
      if (!cubiertas[i]) {
        sinFormacion++;
      }

  function vestirFranja(f: Franja): Set<number> {
    const dentro = new Set(f.casillas);
    const puestos = new Set<number>();
    const caja = cajaDe(f.casillas, W);
    const casillaDe = (x: number, y: number) => Math.floor(y) * W + Math.floor(x);
    const marcar = (x: number, y: number) => puestos.add(casillaDe(x, y));

    if (f.barrera === 'forest' || f.barrera === 'mountain') {
      // Masa: puntos densos, desbordando un poco la franja para que el borde no sea recto.
      const forma = FORMA[f.barrera];
      const puntos = esparcir(
        [caja[0] - 0.2, caja[1] - 0.2, caja[2] + 0.2, caja[3] + 0.35],
        (x, y) => forma.radio(a.hondura[casillaDe(x, y)] ?? 1),
        (x, y) => {
          const i = casillaDe(
            Math.min(Math.max(x, 0), W - 0.01),
            Math.min(Math.max(y, 0), H - 0.01),
          );
          if (reservas.tomada(x, y)) return false;
          if (dentro.has(i)) return true;
          // Un poco fuera, solo si la casilla de al lado es de la franja.
          const cx = Math.round(x - 0.5);
          const cy = Math.round(y - 0.5);
          return dentro.has(cy * W + cx) && Math.hypot(x - (cx + 0.5), y - (cy + 0.5)) < 0.75;
        },
        azar,
      );
      for (const p of puntos) {
        const i = casillaDe(
          Math.min(Math.max(p.x, 0), W - 0.01),
          Math.min(Math.max(p.y, 0), H - 0.01),
        );
        const h = a.hondura[i] ?? 1;
        const hoja = hojaDeMasa(f.barrera, a.suelo[i] as Suelo, azar, h);
        // Justo al sur de un paso va bajo: un pico entero taparía el camino que cruza.
        // Solo los caminos, no los objetos: cerca de una ciudad la cordillera se
        // quedaba en nada. Un pico es más ancho que su casilla: se mira a los lados.
        const tapa = [0.4, 0.8].some((dy) =>
          [-0.35, 0, 0.35].some((dx) => {
            const cx = Math.floor(p.x + dx);
            const cy = Math.floor(p.y - dy);
            return (
              cx >= 0 &&
              cy >= 0 &&
              cx < W &&
              a.caminos.has(cy * W + cx) &&
              Math.hypot(p.x + dx - cx - 0.5, p.y - dy - cy - 0.5) < 0.45
            );
          }),
        );
        const alto = forma.alto(h) * (0.85 + azar() * 0.3) * (tapa ? 0.55 : 1);
        const t = Math.min(1, (h - 1) / 3) * 0.7 + azar() * 0.3;
        sprites.push(deHoja(hoja, p.x, p.y, alto, t, 'masa', MARCADOR[f.barrera] as string, true));
        marcar(p.x, p.y);
      }
      // La casilla en la que no cayó ningún dardo se rellena desde su centro:
      // si no, una casilla que bloquea se leería como un claro que se pisa.
      for (const i of f.casillas) {
        if (puestos.has(i)) continue;
        const x = (i % W) + 0.3 + azar() * 0.4;
        const y = Math.floor(i / W) + 0.45 + azar() * 0.4;
        if (reservas.tomada(x, y)) continue;
        const h = a.hondura[i] ?? 1;
        const hoja = hojaDeMasa(f.barrera, a.suelo[i] as Suelo, azar, h);
        const alto = forma.alto(h) * (0.75 + azar() * 0.25);
        sprites.push(
          deHoja(hoja, x, y, alto, azar() * 0.5, 'masa', MARCADOR[f.barrera] as string, true),
        );
        marcar(x, y);
      }
    } else if (f.barrera === 'wall') {
      // Una sola línea por franja, con torres en las juntas y cada pocos pasos.
      const hoja = f.uso === 'obstaculo' ? 'ruina' : 'muro';
      const e = esqueleto(f.casillas.map((i) => [i % W, Math.floor(i / W)] as const));
      if (componentesDePasos(e.casillas, e.pasos) > 1) murallasPartidas++;
      for (const p of e.pasos) {
        const mx = (p.a[0] + p.b[0]) / 2 + 0.5;
        const my = (p.a[1] + p.b[1]) / 2 + 0.5;
        if (reservas.tomada(mx, my + 0.25)) continue;
        sprites.push(
          deHoja(
            hoja,
            mx,
            my + 0.25,
            1.05,
            0.5,
            'muro',
            MARCADOR.wall as string,
            true,
            ejeDe(p),
            ANCHO_DE_TRAMO[ejeDe(p)],
          ),
        );
      }
      const juntas = new Set(e.juntas.map(([x, y]) => `${x},${y}`));
      let n = 0;
      for (const [x, y] of e.casillas) {
        n++;
        if ((juntas.has(`${x},${y}`) || n % 3 === 0) && !reservas.tomada(x + 0.5, y + 0.75)) {
          const torre = (x + y) % 2 === 0 ? 'torre-redonda' : 'torre-cuadrada';
          sprites.push(
            deHoja(hoja, x + 0.5, y + 0.75, 1.4, 0.5, 'muro', MARCADOR.wall as string, true, torre),
          );
        }
      }
      for (const i of f.casillas) puestos.add(i);
      // El resto de la franja: escombro y matas al pie de la muralla.
      rellenoDeRocas(f, dentro, 0.34, 0.32, 0.25);
    } else if (f.barrera === 'cliff') {
      // El acantilado es relieve: la cara la pinta el pintor. Arriba, roca y peñascos.
      // Una mesa (mancha) lleva cubierta encima; la franja de frontera, algo más de roca.
      rellenoDeRocas(f, dentro, 0.34, 0.6, f.uso === 'obstaculo' ? 0.1 : 0.3);
      for (const i of f.casillas) puestos.add(i);
    } else if (f.barrera === 'water') {
      // El agua la pinta el pintor como superficie; aquí, la orilla.
      for (const i of f.casillas) puestos.add(i);
      const puntos = esparcir(
        [caja[0] - 0.3, caja[1] - 0.3, caja[2] + 0.3, caja[3] + 0.3],
        () => 0.28,
        (x, y) => {
          if (reservas.tomada(x, y)) return false;
          const cx = Math.floor(x);
          const cy = Math.floor(y);
          // En la raya entre agua y tierra, a ambos lados.
          const enAgua = dentro.has(cy * W + cx);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (dentro.has(ny * W + nx) !== enAgua) {
              const borde = dx !== 0 ? (dx > 0 ? cx + 1 : cx) : dy > 0 ? cy + 1 : cy;
              const d = dx !== 0 ? Math.abs(x - borde) : Math.abs(y - borde);
              if (d < 0.22) return true;
            }
          }
          return false;
        },
        azar,
      );
      for (const p of puntos)
        sprites.push(
          deHoja('orilla', p.x, p.y, 0.3 + azar() * 0.12, azar(), 'orilla', '#5a5030', false),
        );
    }
    return puestos;
  }

  /**
   * El suelo de una franja que no es masa (el pie de la muralla, lo alto de un
   * acantilado): sobre todo la cubierta de su suelo, y una parte `roca` de
   * peñascos y picos bajos de su material. Antes era todo escombro y la franja
   * se leía como un pedregal.
   */
  function rellenoDeRocas(
    f: Franja,
    dentro: Set<number>,
    radio: number,
    alto: number,
    roca: number,
  ): void {
    const caja = cajaDe(f.casillas, W);
    const puntos = esparcir(
      caja,
      () => radio,
      (x, y) => dentro.has(Math.floor(y) * W + Math.floor(x)) && !reservas.tomada(x, y),
      azar,
    );
    for (const p of puntos) {
      const i = Math.floor(p.y) * W + Math.floor(p.x);
      const s = a.suelo[i] as Suelo;
      const tirada = azar();
      if (tirada < roca * 0.5 && f.barrera === 'cliff')
        sprites.push(
          deHoja(
            hojaDeMasa('mountain', s, azar),
            p.x,
            p.y,
            alto * (0.9 + azar() * 0.6),
            azar() * 0.4,
            'roca',
            MARCADOR.cliff as string,
            true,
          ),
        );
      else if (tirada < roca)
        sprites.push(
          deHoja(
            'rocas-caidas',
            p.x,
            p.y,
            alto * 0.6 * (0.8 + azar() * 0.5),
            azar() * 0.6,
            'roca',
            MARCADOR.cliff as string,
            true,
          ),
        );
      else
        sprites.push(
          deHoja(
            hojaDeCubierta(s, azar()),
            p.x,
            p.y,
            CUBIERTA[s].alto * (0.7 + azar() * 0.6),
            azar(),
            'cubierta',
            MARCADOR.cubierta as string,
            false,
          ),
        );
    }
  }

  // 4 · El relieve: una pared de acantilado a lo largo de cada caída, hecha de
  // trozos que se solapan, y rocas caídas al pie. La textura de la cara (la pinta
  // el pintor) queda detrás como fondo, por si un trozo deja hueco.
  const PARED_DE_CARA: Readonly<Record<string, string>> = {
    'cara-roca': 'paredes-roca',
    'cara-arenisca': 'paredes-arenisca',
    'cara-basalto': 'paredes-basalto',
    'cara-nevada': 'paredes-nevadas',
  };
  for (const c of rel.caras) {
    const pie = c.y + 1 + c.caida * ALTO_DE_NIVEL;
    const hoja = PARED_DE_CARA[c.material] ?? 'paredes-roca';
    // Una frontera en diagonal da caras en escalera, una por fila. Si la cara de
    // la fila de al lado sigue justo donde esta acaba, el pie de la pared se
    // inclina hacia ella en la última casilla y la escalera se lee como ladera.
    const sigue = (x: number) =>
      rel.caras.find(
        (o) => Math.abs(o.y - c.y) === 1 && o.x0 <= x && x <= o.x1 && o.material === c.material,
      );
    const derecha = sigue(c.x1 + 1);
    const izquierda = sigue(c.x0 - 1);
    const pieEn = (x: number) => {
      if (derecha !== undefined && x > c.x1) return pie + (derecha.y - c.y) * (x - c.x1);
      if (izquierda !== undefined && x < c.x0 + 1)
        return pie + (izquierda.y - c.y) * (c.x0 + 1 - x);
      return pie;
    };
    const desde = izquierda === undefined ? c.x0 + 0.2 : c.x0 + 0.5;
    const hasta = derecha === undefined ? c.x1 + 0.85 : c.x1 + 1.5;
    for (let x = desde; x <= hasta; x += 0.42 + azar() * 0.22) {
      const py = pieEn(x) + 0.05 + (azar() - 0.5) * 0.12;
      const px = x + (azar() - 0.5) * 0.1;
      // Donde un camino baja por la caída no hay pared: allí hay rampa.
      if (reservas.tomada(px, py) || reservas.tomada(px, py - 0.9)) continue;
      sprites.push({
        ...deHoja(
          hoja,
          px,
          py,
          c.caida * ALTO_DE_NIVEL + 0.35 + azar() * 0.2,
          azar(),
          'pared',
          '#4c463e',
          true,
        ),
        // La roca gris de la hoja salió casi beige: se oscurece al pintarla.
        ...(hoja === 'paredes-roca'
          ? { tono: 'brightness(0.72) saturate(0.85)' }
          : hoja === 'paredes-arenisca'
            ? { tono: 'brightness(0.8) saturate(0.72)' }
            : {}),
      });
    }
    for (let x = c.x0; x <= c.x1 + 0.99; x += 0.35 + azar() * 0.3) {
      const px = x + azar() * 0.2;
      const py = pie + 0.1 + azar() * 0.2;
      if (reservas.tomada(px, py)) continue;
      sprites.push(
        deHoja('rocas-caidas', px, py, 0.28 + azar() * 0.25, azar() * 0.7, 'roca', '#5a5248', true),
      );
    }
  }
  // Las caídas al este y al oeste: el canto lo oscurece el pintor; aquí, peñascos.
  for (const [x, y, lado] of rel.cantos) {
    for (let k = 0; k < 2; k++) {
      const px = lado === 'este' ? x + 1.05 : x - 0.05;
      const py = y + 0.3 + k * 0.45 + azar() * 0.2;
      if (reservas.tomada(px, py)) continue;
      sprites.push(
        deHoja('rocas-caidas', px, py, 0.35 + azar() * 0.2, azar() * 0.8, 'roca', '#5a5248', true),
      );
    }
  }

  // 5 · La cubierta, en manchas y no en motas: la referencia tiene formas
  // grandes y calmadas (un bosquecillo, una hoja de campos, un claro de prado),
  // y una cubierta igual de densa en todas partes hacía vibrar el mapa entero.
  // Un ruido suave decide dónde hay mancha (densa, con arbolillos o campos) y
  // dónde claro (pocas matas sobre la textura).
  const ruido = ruidoSuave(semilla, 3.2);
  const cercaDePueblo = new Uint8Array(W * H);
  for (const o of a.objetos) {
    if (o.kind !== 'town' && o.kind !== 'village') continue;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = o.at.x + dx;
        const y = o.at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= 10)
          cercaDePueblo[y * W + x] = 1;
      }
  }
  // Junto a un bosque de frontera el bosque sigue, más claro, sobre el suelo que
  // se pisa: así la masa ocupa la región como en la referencia y no es una tira.
  const lindeDeBosque = new Uint8Array(W * H);
  for (const f of a.franjas) {
    if (f.barrera !== 'forest') continue;
    for (const k of f.casillas) {
      const fx = k % W;
      const fy = (k - fx) / W;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = fx + dx;
          const y = fy + dy;
          if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= 5)
            lindeDeBosque[y * W + x] = 1;
        }
    }
  }
  const enMancha = (x: number, y: number) => {
    const i = Math.floor(y) * W + Math.floor(x);
    return cercaDePueblo[i] === 1 || lindeDeBosque[i] === 1 || ruido(x, y) > 0.56;
  };
  const pisable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = Math.floor(y) * W + Math.floor(x);
    return a.franjaDe[i] === -1 && !reservas.tomada(x, y);
  };
  const puntos = esparcir(
    [0, 0, W, H],
    (x, y) => {
      const r = CUBIERTA[a.suelo[Math.floor(y) * W + Math.floor(x)] as Suelo]?.radio ?? 0.35;
      // Fuera de la mancha, el prado se deja en claro; lo demás sigue sembrado.
      const s = a.suelo[Math.floor(y) * W + Math.floor(x)];
      const claro = s === 'grass' ? 2.1 : s === 'lava' ? 1.8 : s === 'rough' ? 1.6 : 1.3;
      return enMancha(x, y) ? r * 0.85 : r * claro;
    },
    pisable,
    azar,
    30,
  );
  for (const p of puntos) {
    const i = Math.floor(p.y) * W + Math.floor(p.x);
    const s = a.suelo[i] as Suelo;
    const c = CUBIERTA[s];
    const mancha = enMancha(p.x, p.y);
    // En la mancha de prado, ciénaga o nieve, arbolillos: así salen los bosquecillos.
    const arbol =
      mancha &&
      cercaDePueblo[i] !== 1 &&
      // Un árbol justo al sur de un camino o un objeto lo taparía: ahí, solo mata baja.
      !reservas.tomada(p.x, p.y - 0.45) &&
      !reservas.tomada(p.x, p.y - 0.8) &&
      azar() < (lindeDeBosque[i] === 1 ? 0.75 : 0.55)
        ? (
            {
              grass: azar() < 0.55 ? 'pinos' : 'frondosos',
              swamp: 'muertos',
              snow: 'abetos-nevados',
              rough: 'pinos',
              ...(lindeDeBosque[i] === 1 ? { dirt: azar() < 0.6 ? 'pinos' : 'frondosos' } : {}),
            } as Partial<Record<Suelo, string>>
          )[s]
        : undefined;
    if (arbol !== undefined) {
      sprites.push(
        deHoja(
          arbol,
          p.x,
          p.y,
          0.55 + azar() * 0.35,
          azar() * 0.5,
          'cubierta',
          MARCADOR.forest as string,
          true,
        ),
      );
      continue;
    }
    sprites.push(
      deHoja(
        hojaDeCubierta(s, azar()),
        p.x,
        p.y,
        c.alto * (0.7 + azar() * 0.6),
        azar(),
        'cubierta',
        MARCADOR.cubierta as string,
        false,
      ),
    );
  }

  // 6 · Nubes en el borde del mapa, como en la referencia.
  for (let k = 0; k < (2 * (W + H)) / 3; k++) {
    const lado = k % 4;
    const t = azar();
    const [x, y] =
      lado === 0
        ? [t * W, -0.3]
        : lado === 1
          ? [W + 0.3, t * H]
          : lado === 2
            ? [t * W, H + 1.2]
            : [-0.3, t * H];
    sprites.push(deHoja('nubes', x, y, 2.2 + azar() * 1.6, azar(), 'nube', '#b8b8b8', false));
  }

  sprites.sort((p, q) => p.capa - q.capa || p.y - q.y || p.x - q.x);
  return {
    semilla,
    W,
    H,
    suelo: a.suelo,
    nivel: Array.from(rel.nivel),
    agua: a.franjas.filter((f) => f.barrera === 'water').flatMap((f) => f.casillas),
    relieve: { caras: rel.caras, cantos: rel.cantos, rebordes: rel.rebordes },
    altoDeNivel: ALTO_DE_NIVEL,
    caminos,
    sendas: sendas(caminos, semilla),
    luces: luces(a, rel.nivel, azarDe(semilla * 31 + 5)),
    sprites,
    informe: {
      murallasPartidas,
      basesSobreReserva,
      casillasDeBarreraSinFormacion: sinFormacion,
      modulosQueFaltan: [...faltan].sort(),
    },
  };
}

/** Ruido de valor suave, de 0 a 1, con celdas de `escala` casillas: dónde hay mancha. */
export function ruidoSuave(semilla: number, escala: number): (x: number, y: number) => number {
  const valor = (ix: number, iy: number) => {
    let h =
      (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(semilla, 2147483647)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const suave = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const u = x / escala;
    const v = y / escala;
    const ix = Math.floor(u);
    const iy = Math.floor(v);
    const fx = suave(u - ix);
    const fy = suave(v - iy);
    const a = valor(ix, iy) + (valor(ix + 1, iy) - valor(ix, iy)) * fx;
    const b = valor(ix, iy + 1) + (valor(ix + 1, iy + 1) - valor(ix, iy + 1)) * fx;
    return a + (b - a) * fy;
  };
}

function cajaDe(casillas: readonly number[], W: number): [number, number, number, number] {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = 0;
  let y1 = 0;
  for (const i of casillas) {
    const x = i % W;
    const y = (i - x) / W;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1);
    y1 = Math.max(y1, y + 1);
  }
  return [x0, y0, x1, y1];
}

/** Cuántas líneas separadas forman los pasos de un esqueleto. */
export function componentesDePasos(
  casillas: readonly (readonly [number, number])[],
  pasos: readonly { a: readonly [number, number]; b: readonly [number, number] }[],
): number {
  const padre = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    while (padre.get(r) !== r) r = padre.get(r) as string;
    return r;
  };
  for (const [x, y] of casillas) padre.set(`${x},${y}`, `${x},${y}`);
  for (const p of pasos) {
    const ra = raiz(`${p.a[0]},${p.a[1]}`);
    const rb = raiz(`${p.b[0]},${p.b[1]}`);
    if (ra !== rb) padre.set(ra, rb);
  }
  return new Set([...padre.keys()].map(raiz)).size;
}

export type { Analisis };

/**
 * Dónde hay luz y dónde niebla. Las ciudades y pueblos llevan su resplandor; la
 * lava, una brasa de cada tantas casillas; el agua y lo más bajo, jirones de
 * niebla. Todo con su propio azar, así que no mueve nada de lo colocado.
 */
export function luces(a: Analisis, nivel: ArrayLike<number>, azar: () => number): Luz[] {
  const fuera: Luz[] = [];
  for (const o of a.objetos) {
    if (o.kind === 'town') fuera.push({ x: o.at.x + 0.5, y: o.at.y + 0.3, r: 1.6, clase: 'fuego' });
    if (o.kind === 'village')
      fuera.push({ x: o.at.x + 0.5, y: o.at.y + 0.4, r: 1.1, clase: 'fuego' });
  }
  for (let i = 0; i < a.W * a.H; i++) {
    const x = i % a.W;
    const y = (i - x) / a.W;
    const suelo = a.suelo[i];
    const agua = a.franjaDe[i] !== -1 && a.franjas[a.franjaDe[i] as number]?.barrera === 'water';
    // Brasa solo en lava rodeada de lava: en la linde quemaba la nieve de al lado.
    const enLava =
      suelo === 'lava' &&
      [-1, 0, 1].every((dy) =>
        [-1, 0, 1].every((dx) => (a.suelo[i + dy * a.W + dx] ?? 'lava') === 'lava'),
      );
    if (enLava && azar() < 0.15)
      fuera.push({ x: x + azar(), y: y + azar(), r: 0.5 + azar() * 0.6, clase: 'brasa' });
    if ((agua || ((nivel[i] as number) <= 0 && suelo === 'swamp')) && azar() < 0.18)
      fuera.push({ x: x + azar(), y: y + azar(), r: 1.2 + azar() * 1.4, clase: 'niebla' });
  }
  return fuera;
}
