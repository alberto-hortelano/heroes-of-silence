/**
 * Las piezas en imagen de los temas de la interfaz (13-10-2026): la lista
 * cerrada de lo que se pinta con Codex para que cada tema se parezca a su lámina
 * (`assets/art/temas/<tema>.png`), y todo lo que se deriva de ella.
 *
 * Una pieza es un marco en 9 trozos, una tira que se estira, un adorno o una
 * textura. Cada una tiene:
 * - su **sitio** en `forma.css`, dueña de todas sus reglas, con un **respaldo**
 *   que se ve mientras no hay imagen («el juego se juega sin arte»);
 * - lo que haría falta para **encargarla** a Codex: la lámina como estilo, el
 *   trozo de la lámina donde ya está puesta (`POR_TEMA`) y, si se estira o tiene
 *   un formato, la guía de su corte (`assets/temas/_guias/`). Los encargos de la
 *   cola del taller (`encargosDeTemas`, `pnpm taller encolar --temas`) se
 *   quedaron en la rama `claude/army-game-theme-ui-28d2ad`: al traer los temas
 *   a main (19-10-2026) chocaban con lo que la cola cambió desde entonces, y no
 *   se genera arte nuevo (backlog);
 * - sus **fichas** en `src/client/piezas-de-tema.css` (`cssDePiezas`), que **no
 *   lleva reglas**: las medidas de esta tabla siempre, y por tema la imagen
 *   (`--pieza-<pieza>`) y su marca (`--con-pieza-<pieza>`, vacía) **solo si está
 *   en disco**: ni un `url()` que dé 404, que `pnpm capturas` cuenta como error y
 *   el juego pinta como un hueco.
 *
 * El corte de 9 trozos se escribe una vez, aquí: lo lee el prompt (que se lo pide
 * a Codex) y lo escribe la hoja generada (`--corte-<pieza>`). Lo que depende de
 * la pantalla (el ancho de la banda, lo que sale del borde) es de `forma.css`,
 * que lo cambia en el móvil.
 *
 * La hoja se rehace desde lo que hay en disco con `escribirPiezasDeTema`; lo
 * vigila `test/piezas-de-tema.test.ts`.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FACTION_IDS, type FactionId } from '../../../src/core/types.js';
import type { Rect } from './paleta.js';

const RAIZ = resolve(import.meta.dirname, '../../..');

/** La hoja que se genera, relativa a la raíz del repo. */
export const HOJA_DE_PIEZAS = 'src/client/piezas-de-tema.css';
/** Donde caen las piezas finales (van al build) y sus guías de corte (no van). */
export const CARPETA_DE_PIEZAS = 'assets/temas';

/**
 * Las piezas, en el orden en que se piden: los marcos primero (lo que más cambia
 * la pantalla), las texturas al final.
 * El orden da el número del id del encargo, y la cola toma por orden de id.
 */
export const PIEZAS = [
  'marco-mapa',
  'marco-panel',
  'marco-minimapa',
  'barra-seccion',
  'cartela',
  'remate',
  'sello',
  'textura-panel',
  'textura-marco',
] as const;
export type Pieza = (typeof PIEZAS)[number];

/**
 * El corte de 9 trozos de una pieza: lo que mide cada corte desde su borde, en
 * fracción del lado, si el centro se pinta (`relleno`) y la forma de su guía (un
 * marco que rodea un rectángulo o una tira que se estira a lo ancho).
 */
export interface Corte {
  readonly arriba: number;
  readonly derecha: number;
  readonly abajo: number;
  readonly izquierda: number;
  readonly relleno: boolean;
  readonly forma: 'marco' | 'tira';
}

/** Las guías de formato y corte, en `assets/temas/_guias/`, a los tamaños que da Codex. */
export const GUIAS = {
  marco: { ancho: 1024, alto: 1024 },
  barra: { ancho: 1536, alto: 1024 },
  cartela: { ancho: 1536, alto: 1024 },
} as const;
export type Guia = keyof typeof GUIAS;

interface DefDePieza {
  /** Una pieza de interfaz (un marco, una tira, un adorno) o una textura que se repite. */
  readonly tipo: 'interfaz' | 'textura';
  readonly fondo: 'opaco' | 'transparente';
  /** Opaca: el tamaño exacto. Transparente: el máximo (se recorta al dibujo y cabe dentro). */
  readonly tamano?: { readonly ancho: number; readonly alto: number };
  /** El corte de 9 trozos: va al prompt y a la hoja (`--corte-<pieza>`). Su forma la dice la guía. */
  readonly corte?: Omit<Corte, 'forma'>;
  readonly guia?: Guia;
  /**
   * Lo que mide en pantalla cada remate de una tira (`--remates-<pieza>`): el
   * ancho de la banda del 9-slice en sus puntas y, en la barra, el relleno que
   * deja el rótulo entre ellos. Puesto a ojo sobre la pieza de prueba, no
   * derivado: corte × proporción × alto daría 46 px en la barra (3,6 em = 43) y
   * 19 en la cartela (2,4 em = 26), y cambiarlo cambia lo que se ve con la pieza.
   */
  readonly remates?: string;
  /** Lo que es, para el prompt. */
  readonly que: string;
}

const MARCO = { arriba: 0.125, derecha: 0.125, abajo: 0.125, izquierda: 0.125, relleno: false };

export const DEFINICIONES: Readonly<Record<Pieza, DefDePieza>> = {
  'marco-mapa': {
    tipo: 'interfaz',
    fondo: 'opaco',
    tamano: { ancho: 512, alto: 512 },
    corte: MARCO,
    guia: 'marco',
    que: 'El MARCO que rodea el mapa de aventura: una moldura gruesa y cuadrada.',
  },
  'marco-panel': {
    tipo: 'interfaz',
    fondo: 'opaco',
    tamano: { ancho: 512, alto: 512 },
    corte: MARCO,
    guia: 'marco',
    que: 'El MARCO del panel lateral (el del héroe, el equipo y la tropa): más fino que el del mapa, con las esquinas rematadas.',
  },
  'marco-minimapa': {
    tipo: 'interfaz',
    fondo: 'opaco',
    tamano: { ancho: 256, alto: 256 },
    corte: MARCO,
    guia: 'marco',
    que: 'El MARCO pequeño del minimapa («Tierras exploradas»): una moldura fina y cuadrada.',
  },
  'barra-seccion': {
    tipo: 'interfaz',
    fondo: 'transparente',
    tamano: { ancho: 768, alto: 64 },
    corte: { arriba: 0, derecha: 0.14, abajo: 0, izquierda: 0.14, relleno: true },
    guia: 'barra',
    remates: '3.6em',
    que: 'La BARRA DE SECCIÓN sobre la que el juego escribe el título de cada sección del panel («HECHIZOS», «EQUIPO», «TROPA»): una tira horizontal y baja, unas once veces más ancha que alta, con un remate en cada punta y el centro liso para el texto.',
  },
  cartela: {
    tipo: 'interfaz',
    fondo: 'transparente',
    tamano: { ancho: 768, alto: 128 },
    corte: { arriba: 0, derecha: 0.15, abajo: 0, izquierda: 0.15, relleno: true },
    guia: 'cartela',
    remates: '2.4em',
    que: 'La CARTELA VACÍA que cuelga sobre el borde de arriba del mapa: una cinta o placa horizontal, unas seis veces más ancha que alta, con sus remates en las puntas y el centro liso donde el juego escribe el lema.',
  },
  remate: {
    tipo: 'interfaz',
    fondo: 'transparente',
    tamano: { ancho: 512, alto: 256 },
    que: 'El REMATE que corona el centro del borde de arriba del mapa: un adorno suelto, más ancho que alto, que se ve entero y pequeño (unos 36 px de alto en pantalla), así que con la silueta clara y sin detalle menudo.',
  },
  sello: {
    tipo: 'interfaz',
    fondo: 'transparente',
    tamano: { ancho: 256, alto: 256 },
    que: 'El SELLO o medallón redondo que abre la barra de abajo, a la izquierda del aviso: se ve a 36 px, así que con la silueta clara.',
  },
  'textura-panel': {
    tipo: 'textura',
    fondo: 'opaco',
    que: 'La TEXTURA del fondo del panel lateral, sobre la que se escribe: tiene que ser tranquila y de poco contraste, porque el juego la mezcla con el color del panel y encima va texto.',
  },
  'textura-marco': {
    tipo: 'textura',
    fondo: 'opaco',
    que: 'La TEXTURA del material del marco, que cubre las barras de arriba y de abajo y el hueco alrededor del mapa: tranquila y de poco contraste, porque el juego la mezcla con el color de su ficha.',
  },
};

/** El material y el acabado de cada lámina: va delante de cada encargo del tema. */
export const MATERIAL: Readonly<Record<FactionId, string>> = {
  templarios:
    'Tema TEMPLARIOS: piedra gótica gris oscura tallada con tracería y pináculos, madera oscura, pergamino claro y el rojo de la cruz paté de los templarios, con remates de latón viejo.',
  'no-muertos':
    'Tema NO MUERTOS: hierro negro forjado con calaveras, telarañas y velas de llama verde-cian, acentos cian y hueso, y estandartes morados con la cruz invertida.',
  imperio:
    'Tema IMPERIO: mármol claro con capiteles y molduras doradas, colgaduras moradas con flecos de oro, laureas, águilas y grifos dorados, al estilo de Roma.',
  elfos:
    'Tema ELFOS: plata clara con hiedra viva, filigrana fina, hojas y cristales cian tallados, verde azulado y pergamino claro, con un aire de luna y bosque.',
  orkos:
    'Tema ORKOS: hierro oscuro remachado y oxidado, colmillos y cuernos de hueso, cadenas, cráneos con cuernos y estandartes rojos de la Horda con goterones de sangre.',
};

/** Una pieza en la lámina de su tema: lo que enseña, para el prompt, y dónde está. */
export interface EnLaLamina {
  readonly descripcion: string;
  /** El trozo de la lámina (1315×1196) con la pieza puesta: viaja con el encargo como referencia. */
  readonly en: Rect;
}
const lamina = (
  [x, y, w, h]: readonly [number, number, number, number],
  descripcion: string,
): EnLaLamina => ({ descripcion, en: { x, y, w, h } });

/**
 * Las piezas de cada tema, como las enseña su lámina. Una pieza que un tema no
 * lleva no está: la cartela solo la llevan los temas con lema (`--lema`), como en
 * las láminas de los elfos y los orkos, que no tienen.
 */
export const POR_TEMA: Readonly<Record<FactionId, Partial<Record<Pieza, EnLaLamina>>>> = {
  templarios: {
    'marco-mapa': lamina(
      [95, 880, 300, 235],
      'Piedra gótica gris oscura con molduras, arquillos de tracería en la banda y una cruz paté roja en cada esquina, como el marco del mapa de la lámina.',
    ),
    'marco-panel': lamina(
      [945, 330, 340, 255],
      'Moldura de piedra gris más fina, con un pequeño remate de tracería y una cruz paté roja en cada esquina.',
    ),
    'marco-minimapa': lamina(
      [948, 100, 250, 236],
      'Moldura fina de piedra gris con una cruz paté roja pequeña en cada esquina.',
    ),
    'barra-seccion': lamina(
      [950, 588, 330, 36],
      'Tira de pergamino claro con un filo de piedra fino abajo y una cruz paté roja pequeña en cada punta.',
    ),
    cartela: lamina(
      [225, 58, 490, 48],
      'Cinta de tela roja oscura con los bordes dorados y las puntas plegadas en cola de golondrina, sin letras.',
    ),
    remate: lamina(
      [455, 48, 98, 96],
      'Un escudo heráldico de plata con la cruz paté roja, entre dos volutas de piedra tallada.',
    ),
    sello: lamina([20, 1096, 86, 96], 'Un sello de lacre rojo con la cruz paté en relieve.'),
    'textura-panel': lamina(
      [1100, 408, 90, 32],
      'Pergamino claro, color crema, con fibras suaves y manchas muy tenues.',
    ),
    'textura-marco': lamina(
      [590, 1058, 280, 46],
      'Piedra gris oscura labrada, lisa y algo gastada.',
    ),
  },
  'no-muertos': {
    'marco-mapa': lamina(
      [0, 880, 300, 240],
      'Hierro negro forjado con remaches, calaveras pequeñas en las esquinas, telarañas finas y alguna vela de llama verde-cian en las esquinas.',
    ),
    'marco-panel': lamina(
      [990, 360, 290, 250],
      'Hierro negro más fino, con una calavera pequeña en cada esquina.',
    ),
    'marco-minimapa': lamina(
      [1000, 100, 270, 270],
      'Hierro negro fino con una calavera diminuta en cada esquina.',
    ),
    'barra-seccion': lamina(
      [995, 604, 280, 26],
      'Tira de hierro negro, lisa, con un filo cian tenue y un pequeño remate de hueso en cada punta.',
    ),
    cartela: lamina(
      [80, 95, 870, 40],
      'Placa de hierro negro con un ribete cian y una calavera pequeña en cada punta, sin runas ni letras.',
    ),
    remate: lamina(
      [490, 60, 70, 95],
      'Una calavera de hueso viejo con los ojos de brillo cian, sobre hierro negro con púas.',
    ),
    sello: lamina([15, 1120, 70, 76], 'Un medallón de hierro negro con una calavera en relieve.'),
    'textura-panel': lamina(
      [1075, 425, 110, 30],
      'Piedra negra verdosa, lisa, con vetas muy tenues.',
    ),
    'textura-marco': lamina(
      [330, 1110, 300, 40],
      'Hierro negro forjado, liso y con marcas de martillo muy tenues.',
    ),
  },
  imperio: {
    'marco-mapa': lamina(
      [0, 880, 300, 260],
      'Columnas de mármol claro con capitel dorado en las esquinas y una moldura dorada en la banda, como el marco del mapa de la lámina.',
    ),
    'marco-panel': lamina(
      [940, 400, 345, 240],
      'Moldura oscura con un filo dorado y una roseta dorada en cada esquina.',
    ),
    'marco-minimapa': lamina(
      [940, 75, 270, 300],
      'Moldura dorada fina con una roseta en cada esquina.',
    ),
    'barra-seccion': lamina(
      [940, 632, 345, 30],
      'Tira oscura con un filo dorado arriba y abajo y una voluta dorada en cada punta.',
    ),
    cartela: lamina(
      [300, 102, 360, 40],
      'Placa oscura con un marco dorado y un remate de voluta en cada punta, sin letras.',
    ),
    remate: lamina(
      [380, 48, 200, 70],
      'Un águila dorada con las alas abiertas, sobre una pequeña ménsula dorada.',
    ),
    sello: lamina([8, 1145, 46, 46], 'Un medallón de oro con una laurea en relieve.'),
    'textura-panel': lamina(
      [1105, 450, 90, 30],
      'Mármol verde muy oscuro, casi negro, con vetas muy tenues.',
    ),
    'textura-marco': lamina([10, 720, 55, 160], 'Mármol claro con vetas suaves.'),
  },
  elfos: {
    'marco-mapa': lamina(
      [0, 860, 300, 280],
      'Plata clara con hiedra enredada en la banda, filigrana fina y un cristal cian tallado en cada esquina, como el marco del mapa de la lámina.',
    ),
    'marco-panel': lamina(
      [990, 340, 310, 280],
      'Plata clara más fina, con hojas de hiedra y un cristal cian pequeño en cada esquina.',
    ),
    'marco-minimapa': lamina(
      [995, 70, 280, 280],
      'Plata clara fina con una hoja de hiedra en cada esquina.',
    ),
    'barra-seccion': lamina(
      [1015, 617, 275, 26],
      'Tira verde azulada con un filo de plata y una hoja de hiedra en cada punta.',
    ),
    remate: lamina(
      [490, 45, 80, 70],
      'Un cristal cian tallado en punta, entre dos hojas de plata y hiedra.',
    ),
    sello: lamina(
      [20, 1140, 50, 56],
      'Un medallón de plata con una hoja en relieve y un pequeño cristal cian.',
    ),
    'textura-panel': lamina(
      [1110, 425, 110, 28],
      'Pergamino claro, casi blanco, con fibras muy suaves.',
    ),
    'textura-marco': lamina([600, 1100, 260, 30], 'Piedra blanca con vetas de plata, lisa.'),
  },
  orkos: {
    'marco-mapa': lamina(
      [0, 860, 300, 280],
      'Hierro oscuro remachado y oxidado, con colmillos curvos de hueso en las esquinas y tramos de cadena, como el marco del mapa de la lámina.',
    ),
    'marco-panel': lamina(
      [960, 350, 330, 260],
      'Hierro oscuro remachado más fino, con un colmillo pequeño en cada esquina.',
    ),
    'marco-minimapa': lamina(
      [985, 85, 290, 270],
      'Hierro oscuro fino con remaches y un pequeño colmillo en cada esquina.',
    ),
    'barra-seccion': lamina(
      [1012, 615, 270, 32],
      'Tira de hierro oscuro con goterones de sangre roja colgando del filo de abajo y un remache en cada punta.',
    ),
    remate: lamina(
      [410, 55, 230, 90],
      'Un cráneo de bestia con cuernos curvos, pintado de rojo, entre dos colmillos.',
    ),
    sello: lamina([15, 1130, 60, 66], 'Un cráneo pequeño sobre un disco de hierro remachado.'),
    'textura-panel': lamina(
      [1105, 425, 100, 28],
      'Cuero oscuro curtido, liso, con marcas muy tenues.',
    ),
    'textura-marco': lamina([330, 1105, 280, 30], 'Hierro oscuro oxidado, liso.'),
  },
};

/**
 * El gris al que se lleva una textura de tema. `forma.css` la mezcla con el color
 * de su ficha en `soft-light`, y `soft-light` deja el color de abajo tal cual con
 * un gris de 128 encima: aclara donde la textura pasa de ahí y oscurece donde no
 * llega. Codex las pinta del tono de su material (el mármol claro del imperio, a
 * 214 de media; el hierro de los no muertos, a 28), y así mezcladas movían la ficha
 * medida en la lámina: con las texturas puestas (17-10-2026) el margen del imperio
 * pasó de luz 29 a 61, pardo sobre una lámina casi negra, el de los elfos de 110 a
 * 156 y el de los no muertos de 19 a 6 (afinado del 18-10-2026, punto 4).
 */
export const GRIS_DE_LA_MEZCLA = 128;

/**
 * Una textura de tema lista para mezclarse: en gris (el color es de la ficha) y
 * con la media en `GRIS_DE_LA_MEZCLA`, sin tocar su contraste (el dibujo de la
 * veta queda igual). Es el post-proceso del taller, no una segunda generación: el
 * crudo de Codex es el mismo.
 */
export async function texturaNeutra(png: Buffer): Promise<{ png: Buffer; media: number }> {
  const gris = await sharp(png).greyscale().png().toBuffer();
  const media = (await sharp(gris).stats()).channels[0]?.mean;
  if (media === undefined) throw new Error('la textura no tiene ni un canal que medir');
  return {
    png: await sharp(gris)
      .linear(1, GRIS_DE_LA_MEZCLA - media)
      .png()
      .toBuffer(),
    media,
  };
}

/** Las piezas que lleva un tema, en el orden de `PIEZAS`. */
export function piezasDe(tema: FactionId): Pieza[] {
  return PIEZAS.filter((p) => POR_TEMA[tema][p] !== undefined);
}

/** La ruta de una pieza final, relativa a la raíz y sin extensión (la del encargo). */
export const salidaDe = (tema: FactionId, pieza: Pieza): string =>
  `${CARPETA_DE_PIEZAS}/${tema}/${pieza}`;
export const guiaDe = (g: Guia): string => `${CARPETA_DE_PIEZAS}/_guias/${g}.png`;
export const laminaDe = (tema: FactionId): string => `assets/art/temas/${tema}.png`;

/** Las piezas de la lista que están en disco, como `.webp` en su sitio. */
export function piezasEnDisco(raiz = RAIZ): { tema: FactionId; pieza: Pieza }[] {
  return FACTION_IDS.flatMap((tema) =>
    piezasDe(tema)
      .filter((pieza) => existsSync(join(raiz, `${salidaDe(tema, pieza)}.webp`)))
      .map((pieza) => ({ tema, pieza })),
  );
}

/** Los marcos en 9 trozos: su corte no se escribe, se mide en la pieza (`corteDeMarco`). */
export const MARCOS = [
  'marco-mapa',
  'marco-panel',
  'marco-minimapa',
] as const satisfies readonly Pieza[];
const esMarco = (p: Pieza): p is (typeof MARCOS)[number] =>
  (MARCOS as readonly Pieza[]).includes(p);

/** Lo que mide la banda de un marco desde cada lado, en píxeles de su imagen. */
export interface CorteMedido {
  readonly arriba: number;
  readonly derecha: number;
  readonly abajo: number;
  readonly izquierda: number;
}

/**
 * Lo que una banda de marco puede medir, en fracción del lado: menos es que no
 * se ha encontrado (el centro no es liso), más, que se ha comido el hueco.
 */
const BANDA_POSIBLE = { min: 0.02, max: 0.3 } as const;
/** Lo que un píxel se aparta del hueco (suma de RGBA) para ser banda. */
const APARTE_DEL_HUECO = 30;

/**
 * La banda real de un marco generado, lado a lado. Se pidió el 12,5 % de cada lado
 * (`DEFINICIONES`), pero Codex no lo respeta: del 4,7 % (el panel de los no muertos)
 * al 16,8 % (el pie del marco del imperio), y el de abajo casi siempre más grueso.
 * Cortado al 12,5 %, el marco de los elfos (el 7,8 % arriba) metía una franja del
 * hueco gris dentro de la moldura, y el del imperio partía su columna. El hueco es
 * el color mediano del cuadrado central (o transparente); por cada distancia al
 * borde se toma la mediana de lo que se aparta de él a lo largo del 40 % central
 * del lado, y la banda acaba en el último punto que se aparta más de
 * `APARTE_DEL_HUECO`: así un hueco entre dos molduras (la doble del panel del
 * imperio) cuenta como banda. Lanza si la banda no parece una banda.
 */
export async function corteDeMarco(ruta: string): Promise<CorteMedido> {
  const { data, info } = await sharp(ruta)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (W !== H) throw new Error(`${ruta}: un marco es cuadrado, y este mide ${W}×${H}`);
  const px = (x: number, y: number): readonly number[] => {
    const i = (y * W + x) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
  };
  const mediana = (xs: number[]): number => xs.sort((a, b) => a - b)[xs.length >> 1] ?? 0;
  const canales: number[][] = [[], [], [], []];
  for (let y = W >> 2; y < (3 * W) >> 2; y += 3)
    for (let x = W >> 2; x < (3 * W) >> 2; x += 3) {
      const q = px(x, y);
      for (let c = 0; c < 4; c++) canales[c]?.push(q[c] ?? 0);
    }
  const hueco = canales.map(mediana);
  const transparente = (hueco[3] ?? 255) < 128;
  const aparte = (q: readonly number[]): number =>
    transparente
      ? (q[3] ?? 0) < 128
        ? 0
        : 255
      : q.reduce((s, v, c) => s + Math.abs(v - (hueco[c] ?? 0)), 0);
  const lados = {
    arriba: (d: number, k: number) => px(k, d),
    derecha: (d: number, k: number) => px(W - 1 - d, k),
    abajo: (d: number, k: number) => px(k, H - 1 - d),
    izquierda: (d: number, k: number) => px(d, k),
  } as const;
  const corte = Object.fromEntries(
    Object.entries(lados).map(([lado, en]) => {
      let fin = 0;
      for (let d = 0; d < W >> 1; d++) {
        const xs: number[] = [];
        for (let k = Math.floor(W * 0.3); k < Math.floor(W * 0.7); k++) xs.push(aparte(en(d, k)));
        if (mediana(xs) > APARTE_DEL_HUECO) fin = d + 1;
      }
      if (fin < W * BANDA_POSIBLE.min || fin > W * BANDA_POSIBLE.max)
        throw new Error(
          `${ruta}: la banda de ${lado} mide ${fin} px de ${W}, fuera de lo que es un marco (${BANDA_POSIBLE.min * 100}-${BANDA_POSIBLE.max * 100} %): ¿el centro no es liso?`,
        );
      return [lado, fin];
    }),
  ) as unknown as CorteMedido;
  return corte;
}

/** Una pieza en disco, con el corte medido si es un marco. */
export interface PiezaEnDisco {
  readonly tema: FactionId;
  readonly pieza: Pieza;
  readonly corte?: CorteMedido;
  /** Del remate, ancho entre alto: su caja en pantalla mide lo que su imagen. */
  readonly proporcion?: number;
}

/** Las piezas en disco, con el corte de cada marco medido en su imagen y la proporción del remate. */
export async function piezasMedidasEnDisco(raiz = RAIZ): Promise<PiezaEnDisco[]> {
  return await Promise.all(
    piezasEnDisco(raiz).map(async (x) => {
      const ruta = join(raiz, `${salidaDe(x.tema, x.pieza)}.webp`);
      if (esMarco(x.pieza)) return { ...x, corte: await corteDeMarco(ruta) };
      if (x.pieza === 'remate') {
        const { width = 0, height = 0 } = await sharp(ruta).metadata();
        if (width === 0 || height === 0) throw new Error(`${ruta}: el remate no tiene tamaño`);
        return { ...x, proporcion: width / height };
      }
      return x;
    }),
  );
}

/**
 * Lo que hay en `assets/temas/` y no es de la lista: una pieza con otro nombre
 * no tendría ficha y no se vería nunca, sin que nadie lo notara.
 */
export function sobrantesEnDisco(raiz = RAIZ): string[] {
  const dir = join(raiz, CARPETA_DE_PIEZAS);
  if (!existsSync(dir)) return [];
  const sobran: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === '_guias') continue;
    const tema = FACTION_IDS.find((t) => t === entrada.name);
    if (!entrada.isDirectory() || tema === undefined) {
      sobran.push(entrada.name);
      continue;
    }
    for (const f of readdirSync(join(dir, tema))) {
      const m = /^(.+?)(\.procedencia\.json|\.webp)$/.exec(f);
      if (m === null || !piezasDe(tema).includes(m[1] as Pieza)) sobran.push(`${tema}/${f}`);
    }
  }
  return sobran;
}

/**
 * `border-image-slice` de un corte: «12.5%» si los cuatro son iguales, y si no
 * arriba y abajo, derecha e izquierda; `fill` si se rellena. Uno que no es
 * simétrico no lo pide ninguna pieza: lanza antes de escribir algo que no es.
 */
export function sliceDe(c: Omit<Corte, 'forma'>): string {
  if (c.arriba !== c.abajo || c.derecha !== c.izquierda)
    throw new Error(`un corte de 9 trozos va simétrico: ${JSON.stringify(c)}`);
  const p = (f: number): string => `${Math.round(f * 1000) / 10}%`;
  const texto = c.arriba === c.derecha ? p(c.arriba) : `${p(c.arriba)} ${p(c.derecha)}`;
  return c.relleno ? `${texto} fill` : texto;
}

/**
 * La hoja `piezas-de-tema.css`, que solo lleva fichas: las medidas de la tabla en
 * un bloque para todos los temas (el corte de las tiras y lo que miden sus
 * remates), y por tema, de cada pieza presente, su imagen (`--pieza-<pieza>`) y su
 * marca (`--con-pieza-<pieza>`, vacía); de un marco, además, su corte medido
 * (`--corte-<pieza>`, en píxeles de la imagen) y lo que mide cada lado de su banda
 * frente a la de los costados (`--banda-<pieza>-<lado>`: 1,19 es un pie un 19 % más
 * grueso), para que en pantalla guarde la proporción de la pieza. Las reglas que
 * las leen son de `forma.css`.
 */
export function cssDePiezas(presentes: readonly PiezaEnDisco[]): string {
  const cabecera = [
    '/*',
    ' * GENERADO por `pnpm taller piezas-de-tema` (`tools/taller/temas/piezas.ts`):',
    ' * no se edita a mano. Solo fichas, ninguna regla (las reglas son de',
    ' * `forma.css`): las medidas de la tabla y, por tema, la imagen de cada pieza',
    ' * de `assets/temas/<tema>/` que está en disco (`--pieza-<pieza>`) y su marca',
    ' * (`--con-pieza-<pieza>`, vacía); de un marco, su corte medido en la imagen',
    ' * (`corteDeMarco`) y la proporción de cada lado de su banda. Ninguna por la que',
    ' * falta: así no hay un `url()` que dé 404. Lo compara con el disco',
    ' * `test/piezas-de-tema.test.ts`.',
    ' */',
  ].join('\n');
  const bloque = (selector: string, fichas: readonly string[]): string =>
    `${selector} {\n${fichas.map((f) => `  ${f};`).join('\n')}\n}`;
  const medidas = PIEZAS.filter((p) => !esMarco(p)).flatMap((p) => {
    const d = DEFINICIONES[p];
    return [
      ...(d.corte === undefined ? [] : [`--corte-${p}: ${sliceDe(d.corte)}`]),
      ...(d.remates === undefined ? [] : [`--remates-${p}: ${d.remates}`]),
    ];
  });
  const frente = (v: number, lado: number): string => String(Math.round((1000 * v) / lado) / 1000);
  const porTema = FACTION_IDS.flatMap((tema) => {
    const suyas = presentes.filter((x) => x.tema === tema);
    if (suyas.length === 0) return [];
    return [
      bloque(
        `:root[data-tema='${tema}']`,
        suyas.flatMap(({ pieza, corte, proporcion }) => {
          const fichas = [
            `--pieza-${pieza}: url('/temas/${tema}/${pieza}.webp')`,
            `--con-pieza-${pieza}:`,
          ];
          // El remate y la cartela miden lo que en la lámina: el alto de su
          // rectángulo de `POR_TEMA`, en píxeles de la lámina.
          const enLaLamina = POR_TEMA[tema][pieza]?.en.h;
          if (pieza === 'remate') {
            if (proporcion === undefined)
              throw new Error(`${tema}/remate: va con su proporción medida`);
            return [
              ...fichas,
              `--remate-en-la-lamina: ${enLaLamina}`,
              `--proporcion-remate: ${Math.round(proporcion * 1000) / 1000}`,
            ];
          }
          if (pieza === 'cartela') return [...fichas, `--cartela-en-la-lamina: ${enLaLamina}`];
          if (!esMarco(pieza)) return fichas;
          if (corte === undefined)
            throw new Error(`${tema}/${pieza}: un marco va con su corte medido`);
          const { arriba, derecha, abajo, izquierda } = corte;
          const costado = (derecha + izquierda) / 2;
          return [
            ...fichas,
            `--corte-${pieza}: ${arriba} ${derecha} ${abajo} ${izquierda}`,
            `--banda-${pieza}-arriba: ${frente(arriba, costado)}`,
            `--banda-${pieza}-derecha: ${frente(derecha, costado)}`,
            `--banda-${pieza}-abajo: ${frente(abajo, costado)}`,
            `--banda-${pieza}-izquierda: ${frente(izquierda, costado)}`,
          ];
        }),
      ),
    ];
  });
  return `${[cabecera, bloque(':root[data-tema]', medidas), ...porTema].join('\n\n')}\n`;
}

/** Reescribe la hoja con lo que hay en disco. */
export async function escribirPiezasDeTema(raiz = RAIZ): Promise<{ ruta: string; piezas: number }> {
  const presentes = await piezasMedidasEnDisco(raiz);
  writeFileSync(join(raiz, HOJA_DE_PIEZAS), cssDePiezas(presentes));
  return { ruta: HOJA_DE_PIEZAS, piezas: presentes.length };
}

/** El SVG de una guía: gris medio de fondo, la pieza en gris claro y sus cortes marcados. */
function svgDeGuia(g: Guia): string {
  const { ancho: W, alto: H } = GUIAS[g];
  const fondo = '#7a7a7a';
  const pieza = '#c8c8c8';
  const zona = '#e6e6e6';
  const linea = '#3a3a3a';
  const hueco = '#2a2a2a';
  const partes: string[] = [`<rect width="${W}" height="${H}" fill="${fondo}"/>`];
  const raya = (x1: number, y1: number, x2: number, y2: number): string =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${linea}" stroke-width="4" stroke-dasharray="18 12"/>`;
  // La pieza que lleva esta guía: de ella salen su proporción y su corte.
  const def = DEFINICIONES[PIEZAS.find((p) => DEFINICIONES[p].guia === g) as Pieza];
  if (g === 'marco') {
    // El marco ocupa la imagen entera; las esquinas, en claro; el centro, que no se ve, oscuro.
    const b = W * MARCO.arriba;
    partes.push(`<rect width="${W}" height="${H}" fill="${pieza}"/>`);
    for (const [x, y] of [
      [0, 0],
      [W - b, 0],
      [0, H - b],
      [W - b, H - b],
    ] as const)
      partes.push(`<rect x="${x}" y="${y}" width="${b}" height="${b}" fill="${zona}"/>`);
    partes.push(
      `<rect x="${b}" y="${b}" width="${W - 2 * b}" height="${H - 2 * b}" fill="${hueco}"/>`,
    );
    partes.push(
      raya(b, 0, b, H),
      raya(W - b, 0, W - b, H),
      raya(0, b, W, b),
      raya(0, H - b, W, H - b),
    );
  } else {
    // La tira centrada, de la proporción de su pieza; los remates de las puntas, en claro.
    const t = def.tamano as { ancho: number; alto: number };
    const c = def.corte as Omit<Corte, 'forma'>;
    const w = W * 0.9;
    const h = (w * t.alto) / t.ancho;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    partes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${pieza}"/>`);
    partes.push(
      `<rect x="${x}" y="${y}" width="${w * c.izquierda}" height="${h}" fill="${zona}"/>`,
    );
    partes.push(
      `<rect x="${x + w * (1 - c.derecha)}" y="${y}" width="${w * c.derecha}" height="${h}" fill="${zona}"/>`,
    );
    partes.push(raya(x + w * c.izquierda, y - 40, x + w * c.izquierda, y + h + 40));
    partes.push(raya(x + w * (1 - c.derecha), y - 40, x + w * (1 - c.derecha), y + h + 40));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${partes.join('')}</svg>`;
}

/**
 * Escribe las guías de corte de las piezas (`assets/temas/_guias/`): salen de
 * esta tabla y se reescriben igual. Los trozos de las láminas no se escriben: el
 * taller los recorta al vuelo al encargar (`recorte` de la referencia).
 */
export async function escribirGuiasDeTemas(raiz = RAIZ): Promise<string[]> {
  mkdirSync(join(raiz, CARPETA_DE_PIEZAS, '_guias'), { recursive: true });
  for (const g of Object.keys(GUIAS) as Guia[]) {
    await sharp(Buffer.from(svgDeGuia(g)))
      .png()
      .toFile(join(raiz, guiaDe(g)));
  }
  return (Object.keys(GUIAS) as Guia[]).map(guiaDe);
}
