/**
 * Las RAMPAS del relieve (#225, `docs/art/peticiones.md` §35): el camino que baja
 * de frente a la cámara por un borde recto ABRE la pared, en vez de pintarse
 * encima de ella como la bajada de §23.
 *
 * Como en los juegos de estrategia con acantilados (las rampas de StarCraft y de
 * Warcraft III, los tilesets de Slynyrd), la rampa son tres piezas: el CUERPO,
 * la cuesta en el hueco, y un COSTADO a cada lado, donde la cara de la pared deja
 * de ser frontal y baja en diagonal de su alto entero junto al filo a nada al pie
 * de la rampa (el ala), con un hombro de roca entre el ala y la cuesta.
 *
 * **Una imagen, tres piezas.** Las tres se piden en UNA imagen del conjunto
 * sobre esta guía y se cortan por ella (`escribirRampasDerivadas`): pedidas por
 * separado, las juntas entre el costado y el cuerpo no casarían. Los cortes caen
 * en el filo, en `TRAMO_DE_PIEZA_DE_RAMPA` (`celdas.ts`): los costados miden
 * casilla y media porque las paredes S del *dual grid* van de vértice a vértice.
 * Por fuera, cada costado sigue en la frontal de su material (`paredes-*`), que
 * se pinta después y tapa el corte.
 *
 *   pnpm taller encolar --rampas [--solo=rampa-roca-1,rampa-arenisca-1]
 *   pnpm taller derivar-relieve rampa-roca-1
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { PIEZAS_DE_RAMPA, type PiezaDeRampa } from '../../src/client/render/escenario/catalogo.js';
import { TRAMO_DE_PIEZA_DE_RAMPA } from '../../src/client/render/escenario/celdas.js';
import { mascaraDeGuia, registrarPieza } from './derivar.js';
import { ALFA_FIGURA } from './empaquetar.js';
import type { Encargo } from './encargo.js';
import { azarDe, MATERIAL, MESETA, type Niveles } from './laderas.js';
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
} from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * La geometría de la rampa en el mundo de la guía, en casillas desde el borde
 * oeste del hueco (`x`) y desde el filo (`y`), a alto `z`. Es la transición de
 * muro a cuesta de los acantilados de StarCraft y Warcraft III (*wall-to-slope*,
 * Slynyrd): no hay caras laterales que flanqueen el camino. En cada costado la
 * CARA FRONTAL, la misma que la de la frontal vecina, baja en diagonal: alto
 * entero en el extremo exterior y nada en el borde de la cuesta, al pie; y lo
 * de encima de esa diagonal es la meseta, que baja también hacia la cuesta.
 *
 * - `CRESTA`: lo que la pared asoma por encima del filo, como las frontales;
 * - `ENTERO`: lo que el costado sigue a su alto entero desde su extremo exterior
 *   antes de empezar a bajar;
 * - `ARRIBA_DE_LA_CUESTA` y `PIE`: la cuesta, de lo alto (metida en la meseta) a
 *   lo bajo, un poco por delante del filo; `DERRAME`, el abanico de tierra;
 * - `SOLAPE`: lo que la guía sigue la pared más allá del extremo exterior de
 *   cada costado, que se corta con la pieza (`escribirRampasDerivadas`) y queda
 *   debajo de la pieza vecina: así no se ve la arista del corte.
 */
const CRESTA = 0.4;
const ENTERO = 0.4;
const ARRIBA_DE_LA_CUESTA = -0.55;
const PIE = 0.05;
const DERRAME = 0.28;
export const SOLAPE = 0.15;

const TIERRA = '#a09684';
const ESTRIA = '#867c6c';
const CAMINO = '#d4cfc4';
/** La meseta que baja hacia la cuesta, por encima de la diagonal del costado. */
const MESETA_QUE_BAJA = '#c4c4c4';

/** Dibuja la rampa entera: los dos costados y el cuerpo, de atrás adelante. */
function dibujarRampa(g: Guia, niveles: Niveles): void {
  const H = niveles * NIVEL;
  const [izq] = TRAMO_DE_PIEZA_DE_RAMPA['costado-izq'];
  const [, der] = TRAMO_DE_PIEZA_DE_RAMPA['costado-der'];
  const azar = azarDe(`rampa-${niveles}`);
  const fuera = [izq - SOLAPE - 0.15, der + SOLAPE + 0.15] as const;
  /** Donde cada costado empieza a bajar. */
  const baja = [izq + ENTERO, der - ENTERO] as const;
  // La cresta: lo de encima del filo, a su alto entero, por fuera de la bajada.
  g.poligono(
    [
      [fuera[0], -CRESTA, H],
      [baja[0], -CRESTA, H],
      [baja[0], 0, H],
      [fuera[0], 0, H],
    ],
    ARRIBA,
  );
  g.poligono(
    [
      [baja[1], -CRESTA, H],
      [fuera[1], -CRESTA, H],
      [fuera[1], 0, H],
      [baja[1], 0, H],
    ],
    ARRIBA,
  );
  // La meseta que baja hacia la cuesta: de la cresta al pie del borde de la cuesta.
  g.poligono(
    [
      [baja[0], -CRESTA, H],
      [0, ARRIBA_DE_LA_CUESTA, H],
      [0, PIE, 0],
      [baja[0], 0, H],
    ],
    MESETA_QUE_BAJA,
  );
  g.poligono(
    [
      [1, ARRIBA_DE_LA_CUESTA, H],
      [baja[1], -CRESTA, H],
      [baja[1], 0, H],
      [1, PIE, 0],
    ],
    MESETA_QUE_BAJA,
  );
  // La cara frontal de cada costado: a su alto entero por fuera y bajando en
  // diagonal hasta nada en el borde de la cuesta. Mira a la cámara, como la frontal.
  g.poligono(
    [
      [fuera[0], 0, H],
      [baja[0], 0, H],
      [0, PIE, 0],
      [fuera[0], 0, 0],
    ],
    FRENTE,
  );
  g.poligono(
    [
      [baja[1], 0, H],
      [fuera[1], 0, H],
      [fuera[1], 0, 0],
      [1, PIE, 0],
    ],
    FRENTE,
  );
  // La cuesta, del hueco en la meseta al pie, y el abanico que se derrama.
  const en = (t: number, b: number): P3 => [
    b,
    ARRIBA_DE_LA_CUESTA + (PIE - ARRIBA_DE_LA_CUESTA) * t,
    H * (1 - t),
  ];
  g.poligono(
    [
      en(0, 0),
      en(0, 1),
      en(1, 1),
      [1.05, PIE + DERRAME * 0.6, 0],
      [0.5, PIE + DERRAME, 0],
      [-0.05, PIE + DERRAME * 0.6, 0],
      en(1, 0),
    ],
    TIERRA,
  );
  // Las estrías: regueros de la cuesta, a lo largo de la pendiente.
  for (const b of [0.2, 0.34, 0.66, 0.8]) {
    const w = 0.012 + azar() * 0.01;
    g.poligono(
      [en(0.08, b - w), en(0.08, b + w), en(0.97, b + w * 1.6), en(0.97, b - w * 1.6)],
      ESTRIA,
    );
  }
  // La senda, por el medio de la cuesta.
  g.poligono([en(0, 0.44), en(0, 0.56), en(1, 0.59), en(1, 0.41)], CAMINO);
}

/** La geometría que cuenta de la guía, en píxeles de la guía. */
export interface GeometriaDeRampa {
  readonly niveles: Niveles;
  /** El filo en cada corte de `TRAMO_DE_PIEZA_DE_RAMPA`, de oeste a este: −1,5, 0, 1 y 2,5. */
  readonly cortes: readonly P2[];
  readonly caja: readonly [number, number, number, number];
}

const LIENZO: readonly [number, number] = [1536, 1024];
/** Lo que ocupa la rampa del lienzo, como mucho en cada eje. */
const LLENO = 0.8;

/** La guía de una rampa de `niveles`, centrada en su lienzo. */
export function guiaDeRampa(niveles: Niveles): {
  guia: Guia;
  geometria: GeometriaDeRampa;
  casilla: number;
} {
  const [ancho, alto] = LIENZO;
  const m = new Guia(ancho, alto, 1, 0, 0);
  dibujarRampa(m, niveles);
  const w = m.caja.x1 - m.caja.x0;
  const h = m.caja.y1 - m.caja.y0;
  const t = Math.floor(Math.min((ancho * LLENO) / w, (alto * LLENO) / h));
  const g = new Guia(
    ancho,
    alto,
    t,
    ancho / 2 - ((m.caja.x0 + m.caja.x1) / 2) * t,
    alto / 2 - ((m.caja.y0 + m.caja.y1) / 2) * t,
  );
  dibujarRampa(g, niveles);
  const H = niveles * NIVEL;
  const r = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
  const xs = [
    TRAMO_DE_PIEZA_DE_RAMPA['costado-izq'][0],
    TRAMO_DE_PIEZA_DE_RAMPA.cuerpo[0],
    TRAMO_DE_PIEZA_DE_RAMPA.cuerpo[1],
    TRAMO_DE_PIEZA_DE_RAMPA['costado-der'][1],
  ];
  return {
    guia: g,
    casilla: t,
    geometria: {
      niveles,
      cortes: xs.map((x) => r(g.p([x, 0, H]))),
      caja: [
        Math.round(g.caja.x0),
        Math.round(g.caja.y0),
        Math.round(g.caja.x1),
        Math.round(g.caja.y1),
      ],
    },
  };
}

// ------------------------------------------------------------- los encargos

/** Las caídas y los materiales del piloto (#225): el resto, cuando el usuario lo vea. */
export const NIVELES_DE_RAMPA: readonly Niveles[] = [1];
export const MATERIALES_DE_RAMPA: readonly Material[] = ['roca', 'arenisca'];

/** La hoja de una rampa: `rampa-roca-1`. */
export const hojaDeRampa = (material: Material, niveles: Niveles) => `rampa-${material}-${niveles}`;

export function encargoDeRampa(material: Material, niveles: Niveles): Encargo {
  const caida = niveles === 1 ? 'UN nivel' : niveles === 2 ? 'DOS niveles' : 'TRES niveles';
  return {
    id: hojaDeRampa(material, niveles),
    tipo: 'imagen',
    descripcion: [
      `Una RAMPA para el mapa de aventura de un juego de estrategia: el borde recto de una meseta de ${MATERIAL[material]} que cae ${caida} hacia la cámara, y en su centro un camino de tierra que BAJA DE FRENTE hacia la cámara por una CUESTA. Es la transición de MURO A CUESTA de los acantilados de StarCraft y Warcraft III (wall-to-slope): el muro no se corta en un desfiladero, sino que a cada lado de la cuesta SE VA HUNDIENDO hasta desaparecer en ella.`,
      'LA PARED ES LA MISMA PARED FRONTAL DE LA IMAGEN 2, con su misma roca, el MISMO COLOR Y LA MISMA LUZ (ni más oscura ni más clara), el mismo TAMAÑO de columnas y bloques, su remate de arriba y su musgo: sigue fuera de la imagen por la izquierda y por la derecha en esas mismas piezas y tiene que casar con ellas sin que se note la junta. Sus dos extremos de fuera están a su alto entero y cortados limpios en vertical, como si continuara.',
      'A CADA LADO DE LA CUESTA, LA CARA FRONTAL DEL MURO (la que mira a la cámara, como en la imagen 2) BAJA EN DIAGONAL: tiene su alto entero en el extremo de fuera y se va haciendo más y más baja hacia el centro hasta quedar en NADA, a ras del suelo, en el borde de la cuesta al pie. Su perfil de arriba es una LÍNEA INCLINADA, como la de la guía: un triángulo o un trapecio de pared, con su cresta de roca y musgo siguiendo esa inclinación. Por encima de esa línea, el suelo de la meseta BAJA TAMBIÉN, en pendiente, hacia la cuesta, y se funde con ella.',
      'NO HAY CARAS LATERALES: nada de paredes verticales que flanqueen el camino ni que miren hacia él, nada de desfiladero, garganta ni corte en la roca. La cuesta y los dos costados son una sola pendiente que se abre de la meseta al llano. Junto a la cuesta la pared NUNCA sigue alta: allí no hay columnas altas, solo la punta baja del triángulo de pared, a ras del suelo, y encima la meseta en pendiente, de hierba y tierra.',
      `La CUESTA es tierra pisada en pendiente, MÁS CLARA QUE LA ROCA, del color de la tierra de la imagen 3: con ESTRÍAS (regueros y surcos a lo largo de la pendiente, piedrecillas arrastradas hacia abajo) y un camino claro y gastado por el medio; arriba se mete en la meseta y abajo se derrama en un abanico sobre el suelo llano. Es un paso natural: sin escalones, sin peldaños, sin barandillas, sin muretes ni bordillos. Al pie de la pared y de la cuesta, una sombra de contacto oscura y estrecha.`,
      `POR ENCIMA DEL FILO, en los extremos, la cresta es la de la imagen 2: las CABEZAS de la misma roca de la pared, con musgo, matas y hierba entre ellas; NUNCA una franja de tierra ni un suelo llano encima de la pared. La meseta (${MESETA[material]}) la pone el juego: por detrás de la cresta, la imagen es transparente. Al PIE de la pared, como en la imagen 2: bloques caídos y derrubio de tamaños distintos, irregular; NUNCA un borde recto ni una línea horizontal limpia, y ninguna piedra suelta separada del resto.`,
      'LA SILUETA ES LA DE LA GUÍA (imagen 4), CALCADA: mismo sitio, mismo alto, mismo ancho, mismas proporciones, sin girar ni torcer nada. En la guía: lo gris medio de abajo a los lados es la CARA FRONTAL, que baja en diagonal hacia el centro; lo gris claro de encima de esa diagonal, la meseta que baja hacia la cuesta; lo más claro de los extremos, la cresta; lo pardo del centro, la cuesta con sus estrías más oscuras y el camino claro.',
      'La luz viene de arriba a la izquierda, la misma que en la imagen 2; las sombras caen hacia la derecha y hacia abajo.',
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      // La pared con la que casa por los dos lados: la frontal de su material.
      { ruta: `assets/mapa/modulos/paredes-${material}.webp`, papel: 'identidad' },
      // La tierra de la cuesta, la de las bajadas de su material (§23).
      { ruta: `assets/mapa/modulos/bajadas-${material}-${niveles}.webp`, papel: 'material' },
      { ruta: `${DIR_GUIAS}/rampas-${niveles}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/modulos/${hojaDeRampa(material, niveles)}`,
    fondo: 'transparente',
  };
}

export function encargosDeRampas(): Encargo[] {
  return MATERIALES_DE_RAMPA.flatMap((m) => NIVELES_DE_RAMPA.map((n) => encargoDeRampa(m, n)));
}

/** Escribe la guía de cada caída de rampa y su geometría (`rampas-<niveles>.json`). */
export async function escribirGuiasDeRampas(): Promise<string[]> {
  const escritas: string[] = [];
  for (const n of NIVELES_DE_RAMPA) {
    const { guia, geometria, casilla } = guiaDeRampa(n);
    const nombre = `rampas-${n}`;
    await writeFile(
      join(RAIZ, DIR_GUIAS, `${nombre}.png`),
      await sharp(Buffer.from(guia.svg())).png().toBuffer(),
    );
    await writeFile(
      join(RAIZ, DIR_GUIAS, `${nombre}.json`),
      `${JSON.stringify({ ancho: guia.ancho, alto: guia.alto, casilla, ...geometria }, null, 1)}\n`,
    );
    escritas.push(`${DIR_GUIAS}/${nombre}.png`);
  }
  return escritas;
}

/** Las escalas que se prueban al registrar una rampa sobre su guía: el pintor la dibuja algo mayor o menor. */
const ESCALAS = Array.from({ length: 25 }, (_, k) => 0.8 + k * 0.025);

/**
 * Dónde cae la guía en la imagen entera de una rampa, con su escala: el pintor
 * calca la forma pero no el tamaño (el primer lote salió un 17 % mayor), y
 * `registrarPieza` solo traslada. Se prueba cada escala de `ESCALAS` —la imagen
 * reducida o ampliada, registrada por traslación— y se queda la que más solapa
 * las dos siluetas (intersección entre unión). Devuelve cómo llevar un punto de
 * la guía a la imagen, en una lista de uno.
 */
async function registrarConEscala(
  entera: string,
  guiaPng: string,
  caja: readonly [number, number, number, number],
  nombre: string,
): Promise<[(p: P2) => P2]> {
  const mascara = await mascaraDeGuia(guiaPng);
  const original = await sharp(await readFile(entera)).metadata();
  const ow = original.width as number;
  const oh = original.height as number;
  const tmp = join(RAIZ, '.cache', `registro-${nombre}.png`);
  await mkdir(dirname(tmp), { recursive: true });
  let mejor: { iou: number; k: number; f: (p: P2) => P2 } | null = null;
  for (const k of ESCALAS) {
    const w = Math.round(ow / k);
    const h = Math.round(oh / k);
    const { data } = await sharp(await readFile(entera))
      .resize(w, h)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(tmp);
    const f = await registrarPieza(tmp, mascara, { nombre, caja });
    const [ox, oy] = f([0, 0]);
    let dentro = 0;
    let ambos = 0;
    for (let gy = caja[1]; gy <= caja[3]; gy++)
      for (let gx = caja[0]; gx <= caja[2]; gx++) {
        if (mascara.dentro[gy * mascara.ancho + gx] !== 1) continue;
        dentro++;
        const x = gx + ox;
        const y = gy + oy;
        if (
          x >= 0 &&
          y >= 0 &&
          x < w &&
          y < h &&
          (data[(y * w + x) * 4 + 3] as number) >= ALFA_FIGURA
        )
          ambos++;
      }
    let opacos = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] as number) >= ALFA_FIGURA) opacos++;
    const iou = ambos / (dentro + opacos - ambos);
    if (mejor === null || iou > mejor.iou)
      mejor = {
        iou,
        k,
        f: (p: P2): P2 => {
          const [x, y] = f(p);
          return [x * k, y * k];
        },
      };
  }
  await rm(tmp, { force: true });
  if (mejor === null) throw new Error(`${nombre}: no se pudo registrar sobre la guía`);
  console.log(
    `  · ${nombre}: escala ${mejor.k.toFixed(3)}, solape ${(mejor.iou * 100).toFixed(1)} %`,
  );
  return [mejor.f];
}

/** El nombre del módulo de cada pieza: `s-cuerpo`, `s-costado-izq`… */
export const moduloDePieza = (p: PiezaDeRampa) => `s-${p}`;

/**
 * Corta la imagen entera de una rampa (`rampa-<material>-<caída>.webp`) en sus
 * tres piezas por la guía y escribe su índice (`rampa-….json`) con las juntas de
 * cada una (`JuntasDeRampa`): registra la imagen sobre la guía
 * (`registrarPieza`), lleva los cortes del filo a la imagen y corta en vertical
 * por ellos; cada pieza se recorta en alto a lo opaco.
 */
export async function escribirRampasDerivadas(hoja: string): Promise<string> {
  const m = /^rampa-[a-z]+-([123])$/.exec(hoja);
  if (m === null) throw new Error(`«${hoja}» no es una hoja de rampas (rampa-<material>-<1|2|3>)`);
  const dir = join(RAIZ, 'assets/mapa/modulos');
  const guia = join(RAIZ, DIR_GUIAS, `rampas-${m[1]}`);
  const g = JSON.parse(await readFile(`${guia}.json`, 'utf8')) as GeometriaDeRampa;
  const entera = join(dir, `${hoja}.webp`);
  const cortes = (await registrarConEscala(entera, `${guia}.png`, g.caja, hoja)).map((f) =>
    g.cortes.map(f),
  )[0] as P2[];
  const { data, info } = await sharp(await readFile(entera))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const salida = join(dir, hoja);
  await rm(salida, { recursive: true, force: true });
  await mkdir(salida, { recursive: true });
  const modulos = [];
  for (const [k, pieza] of PIEZAS_DE_RAMPA.entries()) {
    const a = cortes[k] as P2;
    const b = cortes[k + 1] as P2;
    // Los costados siguen `SOLAPE` por fuera de su tramo: esa franja queda debajo
    // de la pieza vecina, que se pinta después, y la arista del corte no se ve.
    const porCasilla = ((cortes[2] as P2)[0] - (cortes[1] as P2)[0]) / 1;
    const x0 = Math.max(0, Math.round(a[0] - (k === 0 ? SOLAPE * porCasilla : 0)));
    const x1 = Math.min(info.width, Math.round(b[0] + (k === 2 ? SOLAPE * porCasilla : 0)));
    // En alto, lo opaco de su franja.
    let y0 = info.height;
    let y1 = -1;
    for (let y = 0; y < info.height; y++)
      for (let x = x0; x < x1; x++)
        if ((data[(y * info.width + x) * 4 + 3] as number) >= ALFA_FIGURA) {
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    if (y1 < 0) throw new Error(`${hoja}: la pieza ${pieza} no tiene nada opaco`);
    const ancho = x1 - x0;
    const alto = y1 - y0 + 1;
    // La franja de `SOLAPE` de fuera de cada costado se funde a transparente:
    // donde no hay frontal vecina que la tape (una esquina, una ciudad), la pared
    // se deshace en vez de acabar en una arista vertical.
    const funde = Math.round(SOLAPE * porCasilla);
    if (k !== 1)
      for (let y = y0; y <= y1; y++)
        for (let d = 0; d < funde; d++) {
          const x = k === 0 ? x0 + d : x1 - 1 - d;
          const i = (y * info.width + x) * 4 + 3;
          data[i] = Math.round((data[i] as number) * (d / funde));
        }
    const bytes = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({ left: x0, top: y0, width: ancho, height: alto })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    const imagen = `${moduloDePieza(pieza)}.webp`;
    await writeFile(join(salida, imagen), bytes);
    const enLaPieza = (p: P2): P2 => [Math.round(p[0] - x0), Math.round(p[1] - y0)];
    modulos.push({
      imagen,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ancho,
      alto,
      ancla: [Math.round(ancho / 2), alto - 1],
      rampa: { filo: [enLaPieza(a), enLaPieza(b)], pieza, rumbo: 's' },
    });
  }
  const ruta = join(dir, `${hoja}.json`);
  await writeFile(ruta, `${JSON.stringify({ hoja: `${hoja}.webp`, modulos }, null, 2)}\n`);
  return ruta.replace(`${RAIZ}/`, '');
}
