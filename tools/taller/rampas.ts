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
  SOMBRA,
} from './paredes-puentes.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * La geometría de la rampa en el mundo de la guía, en casillas desde el borde
 * oeste del hueco (`x`) y desde el filo (`y`), a alto `z`:
 *
 * - `CRESTA`: lo que la pared asoma por encima del filo, como las frontales;
 * - `ALA`: donde la cara deja de ser frontal (a 0,4 del hueco) y baja en
 *   diagonal hasta el pie de la rampa, en el borde del hueco a `PIE` del filo;
 * - `BOCA`: la cuesta en el filo, del hombro al otro hombro; cortada en lo alto
 *   `CORTE` casillas hacia dentro de la meseta.
 */
const CRESTA = 0.4;
const ALA = 0.4;
const PIE = 0.5;
const BOCA = [0.15, 0.85] as const;
const CORTE = 0.3;

const TIERRA = '#a09684';
const ESTRIA = '#867c6c';
const CAMINO = '#d4cfc4';
const HOMBRO = '#8e8e8e';
/** El ala izquierda mira al suroeste, de cara a la luz; la derecha, al sureste, en sombra. */
const ALA_EN_LUZ = '#c6c6c6';

/** Dibuja la rampa entera: los dos costados y el cuerpo, de atrás adelante. */
function dibujarRampa(g: Guia, niveles: Niveles): void {
  const H = niveles * NIVEL;
  const [izq] = TRAMO_DE_PIEZA_DE_RAMPA['costado-izq'];
  const [, der] = TRAMO_DE_PIEZA_DE_RAMPA['costado-der'];
  const azar = azarDe(`rampa-${niveles}`);
  const alaIzq = -ALA;
  const alaDer = 1 + ALA;
  // La cresta de cada costado, por encima del filo.
  g.poligono(
    [
      [izq, -CRESTA, H],
      [alaIzq, -CRESTA, H],
      [alaIzq, 0, H],
      [izq, 0, H],
    ],
    ARRIBA,
  );
  g.poligono(
    [
      [alaDer, -CRESTA, H],
      [der, -CRESTA, H],
      [der, 0, H],
      [alaDer, 0, H],
    ],
    ARRIBA,
  );
  // Los hombros: de la cresta a la cuesta, bajando hasta su pie.
  g.poligono(
    [
      [alaIzq, -CRESTA, H],
      [BOCA[0], -CORTE, H],
      [0, PIE, 0],
      [alaIzq, 0, H],
    ],
    HOMBRO,
  );
  g.poligono(
    [
      [BOCA[1], -CORTE, H],
      [alaDer, -CRESTA, H],
      [alaDer, 0, H],
      [1, PIE, 0],
    ],
    HOMBRO,
  );
  // La cara frontal de cada costado, y el ala que baja en diagonal hasta el pie.
  g.poligono(
    [
      [izq, 0, H],
      [alaIzq, 0, H],
      [alaIzq, 0, 0],
      [izq, 0, 0],
    ],
    FRENTE,
  );
  g.poligono(
    [
      [alaDer, 0, H],
      [der, 0, H],
      [der, 0, 0],
      [alaDer, 0, 0],
    ],
    FRENTE,
  );
  g.poligono(
    [
      [alaIzq, 0, H],
      [0, PIE, 0],
      [alaIzq, 0, 0],
    ],
    ALA_EN_LUZ,
  );
  g.poligono(
    [
      [alaDer, 0, H],
      [alaDer, 0, 0],
      [1, PIE, 0],
    ],
    SOMBRA,
  );
  // La cuesta, de la boca al pie, con un abanico de tierra que se derrama.
  const en = (t: number, b: number): P3 => {
    const x0 = BOCA[0] + (0 - BOCA[0]) * t;
    const x1 = BOCA[1] + (1 - BOCA[1]) * t;
    return [x0 + (x1 - x0) * b, -CORTE + (PIE + CORTE) * t, H * (1 - t)];
  };
  g.poligono(
    [
      en(0, 0),
      en(0, 1),
      en(1, 1),
      [0.92, PIE + 0.1, 0],
      [0.5, PIE + 0.16, 0],
      [0.08, PIE + 0.1, 0],
      en(1, 0),
    ],
    TIERRA,
  );
  // Las estrías: regueros de la cuesta, a lo largo de la pendiente.
  for (const b of [0.18, 0.33, 0.67, 0.82]) {
    const w = 0.012 + azar() * 0.01;
    g.poligono(
      [en(0.08, b - w), en(0.08, b + w), en(0.97, b + w * 1.6), en(0.97, b - w * 1.6)],
      ESTRIA,
    );
  }
  // La senda, por el medio de la cuesta.
  g.poligono([en(0, 0.43), en(0, 0.57), en(1, 0.6), en(1, 0.4)], CAMINO);
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
      `Una RAMPA ABIERTA EN UN RISCO para el mapa de aventura de un juego de estrategia, como las rampas de los acantilados de StarCraft o Warcraft III: el borde recto de una meseta de ${MATERIAL[material]} que cae ${caida} hacia la cámara, y en su centro un camino de tierra que BAJA DE FRENTE hacia la cámara por un HUECO que corta la pared.`,
      'LA PARED A LOS DOS LADOS ES LA MISMA PARED FRONTAL DE LA IMAGEN 2, con su misma roca, su mismo color, sus mismas formas, su remate de arriba y su musgo: sigue fuera de la imagen por la izquierda y por la derecha en esas mismas piezas, así que sus dos extremos están CORTADOS LIMPIOS en vertical, sin rematar ni redondearse, con la pared a su alto entero hasta el corte.',
      'POR ENCIMA DEL FILO, la cresta es la de la imagen 2: las CABEZAS de la misma roca de la pared, con musgo, matas y hierba entre ellas, que asoman sobre la meseta; NUNCA una franja de tierra, un suelo llano ni un camino encima de la pared. Al PIE de la pared, como en la imagen 2: bloques caídos y derrubio de tamaños distintos, irregular, que se mete en el suelo; NUNCA un borde recto ni una línea horizontal limpia, y ninguna piedra suelta separada del resto.',
      'Junto al hueco, a cada lado, la pared NO acaba de golpe: dobla hacia la cámara y su cara BAJA EN DIAGONAL, de su alto entero junto al filo hasta CERO al pie de la rampa, como un triángulo de roca (el ala): la de la izquierda mira a la luz y la de la derecha queda en sombra. Encima de cada ala, un hombro de roca rota y tierra baja de la cresta a la cuesta.',
      `La CUESTA es tierra pisada en pendiente, MÁS CLARA QUE LA ROCA, del color de la tierra de la imagen 3: con ESTRÍAS (regueros y surcos a lo largo de la pendiente, piedrecillas arrastradas hacia abajo) y un camino claro y gastado por el medio; en lo alto se mete en la meseta y abajo se derrama en un abanico sobre el suelo llano. Es un paso natural: sin escalones, sin peldaños, sin barandillas, sin muretes ni bordillos. Donde las alas y la cuesta tocan el suelo, una sombra de contacto oscura y estrecha.`,
      `ENCIMA DEL FILO solo la cresta de la pared, como en la imagen 2; la meseta (${MESETA[material]}) la pone el juego y por detrás de la cresta la imagen es transparente.`,
      'LA SILUETA ES LA DE LA GUÍA (imagen 4), CALCADA: mismo sitio, mismo alto, mismo ancho, mismas proporciones y el hueco en el mismo sitio, sin girar ni torcer nada. En la guía: lo gris medio de los lados es la cara frontal; el triángulo claro de la izquierda y el oscuro de la derecha, las alas; lo gris de encima de las alas, los hombros; lo pardo, la cuesta con sus estrías más oscuras y el camino claro; lo claro de arriba, la cresta.',
      'La luz viene de arriba a la izquierda; las sombras caen hacia la derecha y hacia abajo.',
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
    const x0 = Math.max(0, Math.round(a[0]));
    const x1 = Math.min(info.width, Math.round(b[0]));
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
