/**
 * Las BAJADAS del relieve (R5, `docs/art/peticiones.md` §23): un paso de tierra
 * pisada que baja una caída, la pieza que va ENCIMA de la pared donde una senda
 * la cruza.
 *
 * Antes la bajada era un agujero: un tajo en la cara y una pared que se corría,
 * se encogía o se quitaba (`rampas`, `ponerPared`), con un pedregal de relleno.
 * Ahora la pared no se toca y la bajada se pinta encima, en el rumbo de la senda
 * (decisión del usuario, 07-10-2026): de cara a la cámara (`s`), en diagonal
 * (`se`, `so`) o de lado (`e`, `o`). Las que bajan al norte van de espaldas y no
 * llevan pieza.
 *
 * **Contrato de junta.** `arriba` es donde el camino cruza el filo; `abajo`, el
 * pie de la pared bajo ese punto: a `c · ALTO_DE_NIVEL` por debajo y, en E y O,
 * apartado el talud de la ladera; en SE y SO, la mitad. De esos dos puntos salen
 * su sitio y su escala. La rampa no baja por la pared sino por donde va la
 * senda pintada (`LARGO`), y acaba en ella.
 *
 *   pnpm taller encolar --relieve [--solo=bajadas-roca-1]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import type { RumboDeBajada } from '../../src/client/render/escenario/catalogo.js';
import {
  DIRECCION_DE_BAJADA,
  largoDeBajada,
  taludDeBajada,
} from '../../src/client/render/escenario/celdas.js';
import { mascaraDeGuia, registrarPieza } from './derivar.js';
import type { Encargo } from './encargo.js';
import { azarDe, bloque, MATERIAL, MESETA, mata, type Niveles } from './laderas.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';
import {
  ARRIBA,
  DIR_GUIAS,
  FRENTE,
  Guia,
  type Material,
  NIVEL,
  type P2,
  type P3,
  SOMBRA,
} from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Los rumbos de la hoja, en su orden de lectura: cuatro en la primera fila y el oeste debajo. */
export const RUMBOS: readonly RumboDeBajada[] = ['s', 'se', 'so', 'e', 'o'];

/** La media anchura de la rampa en el filo y al pie, y la de la senda que lleva. */
const RAMPA = { arriba: 0.19, abajo: 0.3 } as const;
const SENDA = { arriba: 0.08, abajo: 0.12 } as const;
/** Lo ancho de los ribazos de roca a cada lado de la rampa, en el filo y al pie. */
const RIBAZO = { arriba: 0.26, abajo: 0.06 } as const;

/** La tierra pisada de la rampa y la senda que la recorre, en la guía. */
const TIERRA = '#a09684';
const CAMINO = '#d4cfc4';
const DERRUBIO_DE_RIBAZO = '#8e8e8e';

/**
 * Una bajada con `arriba` en el origen de la guía, sobre el filo a alto `H`. Se
 * dibuja en coordenadas de pantalla del juego (`en`): lo de lo alto, en su
 * casilla; lo del suelo, en la suya; la guía las lleva al mundo por su altura.
 */
function dibujarBajada(g: Guia, rumbo: RumboDeBajada, niveles: Niveles): void {
  const H = niveles * NIVEL;
  const [dx, dy] = DIRECCION_DE_BAJADA[rumbo];
  // El través de la rampa en pantalla: a la izquierda de la senda que baja.
  const [nx, ny]: P2 = [-dy, dx];
  const L = largoDeBajada(rumbo, niveles);
  const azar = azarDe(`bajada-${rumbo}-${niveles}`);
  /** Un punto del juego (`gx`, `gy`, en casillas desde `arriba`) a alto `z`, en el mundo de la guía. */
  const en = (gx: number, gy: number, z: number): P3 => [gx, gy - (H - z), z];
  /** Un punto a `t` rampa abajo (0 en el filo, 1 al pie) y `b` de través, a alto `z`. */
  const at = (t: number, b: number, z: number): P3 =>
    en(dx * L * t + nx * b, dy * L * t + ny * b, z);
  const altoEn = (t: number) => H * (1 - t);
  const onda = (amplitud: number) => {
    const k = 2 + azar() * 3;
    const fase = azar() * 2 * Math.PI;
    return (t: number) => amplitud * Math.sin(Math.PI * t) * Math.sin(k * Math.PI * t + fase);
  };
  const N = 16;
  const ts = Array.from({ length: N + 1 }, (_, i) => i / N);
  const ancho = (t: number) => RAMPA.arriba + (RAMPA.abajo - RAMPA.arriba) * t;
  /**
   * El ribazo de un lado: roca rota que flanquea la rampa, alta y ancha arriba,
   * donde sigue la pared, y que se deshace en derrubio al pie. El de fuera de
   * arriba está abierto: allí sigue la pared del juego.
   */
  const ribazo = (s: 1 | -1) => {
    const borde = onda(0.035);
    const dentro = (t: number) => at(t, s * (ancho(t) + borde(t)), altoEn(t));
    const fuera = (t: number) => {
      const w = RIBAZO.arriba + (RIBAZO.abajo - RIBAZO.arriba) * t ** 0.8;
      return at(t * 0.92, s * (ancho(t) + borde(t) + w), altoEn(t) + 0.12 * H * (1 - t));
    };
    const roto = (t: number): P3 => {
      const [ax, ay, az] = dentro(t);
      const [bx, by, bz] = fuera(t);
      return [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2 + 0.04];
    };
    const luz = s * nx > 0 || (nx === 0 && s * ny < 0);
    g.poligono([...ts.map(dentro), ...[...ts].reverse().map(roto)], DERRUBIO_DE_RIBAZO);
    g.poligono([...ts.map(roto), ...[...ts].reverse().map(fuera)], luz ? FRENTE : SOMBRA);
    // El labio, por lo alto del ribazo, solo en la mitad de arriba.
    const arribaDe = ts.filter((t) => t <= 0.25);
    g.poligono(
      [
        ...arribaDe.map(fuera),
        ...[...arribaDe].reverse().map((t) => {
          const [x, y, z] = fuera(t);
          return [x - s * nx * 0.05, y - s * ny * 0.05, z] as P3;
        }),
      ],
      ARRIBA,
    );
  };
  // Primero el ribazo de detrás: el que queda más al norte en pantalla.
  const detras: 1 | -1 = ny > 0 ? -1 : 1;
  if (ny !== 0) ribazo(detras);
  else {
    ribazo(-1);
    ribazo(1);
  }
  // La rampa, del hueco entre los ribazos en el filo a un abanico al pie.
  const lado = (s: 1 | -1) => {
    const o = onda(0.03);
    return ts.map((t) => at(t, s * (ancho(t) + o(t)), altoEn(t)));
  };
  const abanico = Array.from({ length: 9 }, (_, i) => {
    const b = RAMPA.abajo * (1 - (2 * i) / 8);
    const mas = 0.14 * Math.cos((Math.PI * (b / RAMPA.abajo)) / 2) ** 0.6 + (azar() - 0.5) * 0.04;
    return at(1 + mas / L, b * 1.1, 0);
  });
  g.poligono([...lado(1), ...abanico, ...[...lado(-1)].reverse()], TIERRA);
  // La senda, con una curva suave, del filo al abanico.
  const curva = onda(0.04);
  const senda = (s: 1 | -1) =>
    ts.map((t) =>
      at(
        t * 1.08,
        curva(t) + s * (SENDA.arriba + (SENDA.abajo - SENDA.arriba) * t),
        Math.max(0, altoEn(t * 1.08)),
      ),
    );
  g.poligono([...senda(1), ...[...senda(-1)].reverse()], CAMINO);
  if (ny !== 0) ribazo(-detras as 1 | -1);
  // Matas en lo alto de los ribazos y bloques sueltos al pie.
  for (const s of [-1, 1] as const) {
    const [x, y, z] = at(0.04, s * (ancho(0) + RIBAZO.arriba * 0.7), H);
    mata(g, x, y, z, 0.035 + azar() * 0.02, azar);
    for (let k = 0; k < 2; k++) {
      const t = 0.55 + 0.4 * azar();
      const [bx, by, bz] = at(t, s * (ancho(t) + 0.05 + azar() * 0.07), altoEn(t));
      const r = 0.03 + azar() * 0.03;
      bloque(g, bx, by, r, r * 0.8, bz, azar, s < 0);
    }
  }
}

/** La geometría que cuenta de cada pieza de la guía, en píxeles de la guía. */
export interface GeometriaDeBajada {
  readonly nombre: RumboDeBajada;
  readonly niveles: Niveles;
  readonly arriba: P2;
  readonly abajo: P2;
  readonly caja: readonly [number, number, number, number];
}

/** Las filas de la hoja: cuatro y una. */
const FILAS: readonly (readonly RumboDeBajada[])[] = [RUMBOS.slice(0, 4), RUMBOS.slice(4)];
const LIENZO: readonly [number, number] = [1536, 1024];

/** La guía de una hoja de bajadas, con las piezas en filas y el pie de cada fila en la misma línea. */
export function guiaDeBajadas(niveles: Niveles): {
  guia: Guia;
  piezas: GeometriaDeBajada[];
  casilla: number;
} {
  const [ancho, alto] = LIENZO;
  const H = niveles * NIVEL;
  const medida = (r: RumboDeBajada) => {
    const m = new Guia(ancho, alto, 1, 0, 0);
    dibujarBajada(m, r, niveles);
    return { r, ...m.caja };
  };
  const filas = FILAS.map((f) => f.map(medida));
  const HUECO = 0.45;
  const anchos = filas.map(
    (f) => f.reduce((a, m) => a + (m.x1 - m.x0), 0) + HUECO * (f.length + 1),
  );
  const altos = filas.map((f) => Math.max(...f.map((m) => m.y1 - m.y0)));
  const t = Math.floor(
    Math.min(
      ancho / Math.max(...anchos),
      alto / (altos.reduce((a, b) => a + b, 0) + HUECO * (filas.length + 1)),
    ),
  );
  const g = new Guia(ancho, alto, t, 0, 0);
  const piezas: GeometriaDeBajada[] = [];
  let techo = (alto - t * (altos.reduce((a, b) => a + b, 0) + HUECO * (filas.length - 1))) / 2;
  filas.forEach((fila, f) => {
    const suelo = techo + (altos[f] as number) * t;
    const libre = (ancho - t * fila.reduce((a, m) => a + (m.x1 - m.x0), 0)) / (fila.length + 1);
    let x = libre;
    for (const m of fila) {
      g.ox = x - m.x0 * t;
      g.oy = suelo - m.y1 * t;
      const sola = new Guia(ancho, alto, t, g.ox, g.oy);
      dibujarBajada(sola, m.r, niveles);
      dibujarBajada(g, m.r, niveles);
      const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
      // `arriba`, en el filo; `abajo`, el pie de la pared bajo él (`abajoDe`):
      // en el mundo de la guía, el filo a alto `H` y el pie en el suelo.
      piezas.push({
        nombre: m.r,
        niveles,
        arriba: r(g.p([0, 0, H])),
        abajo: r(g.p([taludDeBajada(m.r, niveles), 0, 0])),
        caja: [
          Math.round(sola.caja.x0),
          Math.round(sola.caja.y0),
          Math.round(sola.caja.x1),
          Math.round(sola.caja.y1),
        ],
      });
      x += (m.x1 - m.x0) * t + libre;
    }
    techo = suelo + HUECO * t;
  });
  return { guia: g, piezas, casilla: t };
}

// ------------------------------------------------------------- los encargos

const DICHO: Readonly<Record<RumboDeBajada, string>> = {
  s: 'S: baja DE FRENTE hacia la cámara, de arriba abajo de la imagen. Arriba, el filo de la meseta; los ribazos de roca, altos junto al filo, se deshacen en derrubio al pie.',
  se: 'SE: baja en DIAGONAL hacia abajo a la DERECHA, como marca la guía.',
  so: 'SO: baja en DIAGONAL hacia abajo a la IZQUIERDA, como marca la guía.',
  e: 'E: cruza DE LADO una ladera que cae a la derecha. En la imagen va casi HORIZONTAL, de izquierda a derecha, como la guía: arranca a la izquierda en el filo, entre los dos ribazos más altos, y baja tendida hacia la derecha, donde se abre en el suelo llano.',
  o: 'O: cruza DE LADO una ladera que cae a la izquierda. En la imagen va casi HORIZONTAL, de derecha a izquierda, como la guía: arranca a la derecha en el filo, entre los dos ribazos más altos, y baja tendida hacia la izquierda, donde se abre en el suelo llano.',
};

export const NIVELES_DE_BAJADA: readonly Niveles[] = [1, 2];

/** La hoja de bajadas de un material y una caída: `bajadas-roca-1`. */
export const hojaDeBajadas = (material: Material, niveles: Niveles) =>
  `bajadas-${material}-${niveles}`;

export function encargoDeBajadas(material: Material, niveles: Niveles): Encargo {
  const caida = niveles === 1 ? 'UN nivel' : niveles === 2 ? 'DOS niveles' : 'TRES niveles';
  const orden = FILAS.flatMap((fila, f) =>
    fila.map((r, c) => `fila ${f + 1}, columna ${c + 1}: ${DICHO[r]}`),
  ).join('\n');
  return {
    id: `modulos-${hojaDeBajadas(material, niveles)}`,
    tipo: 'modulos',
    descripcion: [
      `Una hoja de ${RUMBOS.length} módulos de BAJADA POR UN RISCO para el mapa de aventura de un juego de estrategia: en cada uno, un camino de tierra pisada baja ${caida} por el borde de una meseta de ${MATERIAL[material]}, en un rumbo distinto.`,
      'Cada módulo es una RAMPA de tierra pisada, con un camino claro y gastado en medio, entre DOS RIBAZOS de roca rota que la flanquean: altos y anchos junto al filo de la meseta, donde siguen la pared del risco, y más bajos rampa abajo, hasta deshacerse en derrubio donde la rampa se derrama en el suelo llano. Es un paso natural abierto en el risco, NO una escalera: sin escalones tallados, sin peldaños, sin barandillas ni muros, y sin ningún corte recto.',
      `El camino de la rampa es del color de los caminos del juego (tierra parda clara y polvorienta, como la tierra de los estribos del puente de la imagen 4) y sus bordes se deshacen en terrones, matas y piedras sueltas. Arriba, la meseta (${MESETA[material]}) la pone el juego: encima del filo solo el labio de los hombros y unas matas.`,
      'LA SILUETA DE CADA MÓDULO ES LA DE LA GUÍA (imagen 5), CALCADA: mismo sitio, mismo alto, mismo ancho y el MISMO RUMBO de la rampa, sin girarla ni torcerla. Lo pardo es la rampa y la franja clara, el camino; lo gris oscuro y medio, los ribazos de roca; las líneas claras, el labio roto de su filo; los polígonos claros, bloques.',
      'La roca de los ribazos: losas y estratos ROTOS y bloques angulosos de tamaños distintos, como los peñascos de la imagen 2; nunca columnas, prismas ni sillares, y el labio de su filo es roca rota con musgo, nunca un bordillo de piedras puestas en hilera.',
      orden,
      'La luz viene de arriba a la izquierda; las sombras de los hombros y de los bloques caen hacia la derecha y hacia abajo.',
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      { ruta: 'assets/mapa/modulos/rocas-caidas.webp', papel: 'identidad' },
      { ruta: `assets/mapa/modulos/paredes-${material}.webp`, papel: 'material' },
      // El estribo de tierra del puente salió bien fundido con el suelo (§18).
      { ruta: 'assets/mapa/puente-piedra-eo.webp', papel: 'material' },
      { ruta: `${DIR_GUIAS}/bajadas-${niveles}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/modulos/${hojaDeBajadas(material, niveles)}`,
    fondo: 'transparente',
    cuantos: RUMBOS.length,
    nombres: [...RUMBOS],
  };
}

/** Escribe la guía de cada hoja de bajadas y su geometría (`bajadas-<niveles>.json`). */
export async function escribirGuiasDeBajadas(): Promise<string[]> {
  const escritas: string[] = [];
  for (const n of NIVELES_DE_BAJADA) {
    const { guia, piezas, casilla } = guiaDeBajadas(n);
    const nombre = `bajadas-${n}`;
    const png = await sharp(Buffer.from(guia.svg())).png().toBuffer();
    await writeFile(join(RAIZ, DIR_GUIAS, `${nombre}.png`), png);
    await writeFile(
      join(RAIZ, DIR_GUIAS, `${nombre}.json`),
      `${JSON.stringify({ ancho: guia.ancho, alto: guia.alto, casilla, piezas }, null, 1)}\n`,
    );
    escritas.push(`${DIR_GUIAS}/${nombre}.png`);
  }
  return escritas;
}

/**
 * Apunta en el índice de una hoja de bajadas las juntas de cada módulo
 * (`JuntasDeBajada`): `arriba` y `abajo` en píxeles del módulo
 * (`registrarPieza`), y su rumbo.
 */
export async function escribirBajadasDerivadas(hoja: string): Promise<string> {
  const m = /^bajadas-[a-z]+-([123])$/.exec(hoja);
  if (m === null)
    throw new Error(`«${hoja}» no es una hoja de bajadas (bajadas-<material>-<1|2|3>)`);
  const dir = join(RAIZ, 'assets/mapa/modulos');
  const guia = join(RAIZ, DIR_GUIAS, `bajadas-${m[1]}`);
  const geometrias = (
    JSON.parse(await readFile(`${guia}.json`, 'utf8')) as { piezas: GeometriaDeBajada[] }
  ).piezas;
  const mascara = await mascaraDeGuia(`${guia}.png`);
  const ruta = join(dir, `${hoja}.json`);
  const indice = JSON.parse(await readFile(ruta, 'utf8')) as {
    modulos: { imagen: string; bajada?: unknown }[];
  };
  for (const mod of indice.modulos) {
    const nombre = mod.imagen.replace(/\.webp$/, '');
    const g = geometrias.find((p) => p.nombre === nombre);
    if (g === undefined) throw new Error(`${hoja}: la guía no tiene la pieza «${nombre}»`);
    const enElModulo = await registrarPieza(join(dir, hoja, mod.imagen), mascara, g);
    mod.bajada = { arriba: enElModulo(g.arriba), abajo: enElModulo(g.abajo), rumbo: g.nombre };
  }
  await writeFile(ruta, `${JSON.stringify(indice, null, 2)}\n`);
  return ruta.replace(`${RAIZ}/`, '');
}
