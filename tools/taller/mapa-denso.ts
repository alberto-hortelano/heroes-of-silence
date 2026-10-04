/**
 * El arte de los mapas densos (§8 de `docs/art/peticiones.md`, issue #134): las
 * texturas del suelo, las piezas de borde de cada barrera, los nodos de paso y
 * los obstáculos de dentro de una región.
 *
 * Se produce como el arte del mapa del 01-10: primero dos láminas de muestra de
 * 3×3 para que el usuario apruebe el aspecto (`--muestras-densas`), y después
 * cada pieza suelta copiando la suya de la lámina (`--piezas-densas`). La
 * referencia de cómo tiene que verse el mapa entero es `REFERENCIA_DE_MAPAS`.
 *
 * Las barreras salen sobre suelos muy distintos y la pieza va con el suelo
 * (decisión del usuario, 03-10-2026): el bosque es verde en el prado, nevado en
 * la nieve y de árboles muertos en el pantano; el acantilado, rojo en la arena,
 * de basalto en la lava y gris en la roca.
 */

import { NODOS } from '../../src/client/render/escenario/nodos.js';
import { type Barrera, SUELOS_PISABLES, type Suelo } from '../../src/core/map/terrain.js';
import type { Encargo } from './encargo.js';

/** El mapa de referencia que eligió el usuario: así tiene que verse el conjunto. */
export const REFERENCIA_DE_MAPAS = 'assets/art/mapas/Imagen de ChatGPT 3 oct 2026, 10_05_01.png';

/**
 * Lo que hace distinta a la referencia, dicho con palabras. La primera tanda
 * (03-10-2026) la llevaba como segunda referencia, detrás de la muestra pintada
 * del 01-10, y mandó la muestra: salió limpia, clara y saturada, y el usuario
 * dijo que no encajaba. Ahora la referencia va sola y su estilo se describe.
 */
export const ESTILO_DEL_MAPA =
  'Estilo de la imagen de estilo, que manda sobre cualquier otra idea: fantasía medieval OSCURA y sombría, pintura digital muy detallada como una maqueta en miniatura, con muchísimo detalle menudo (piedras, matas, grietas, raíces). Paleta APAGADA y poco saturada: verdes oliva y musgo oscuros, grises pizarra, pardos terrosos, rojos óxido; nada de colores vivos ni de aspecto de juego para móvil. Sombras profundas y oclusión marcada entre los detalles, luz tenue y algo fría, con contraste dramático.';

/** El material de cada suelo y de qué parte de la referencia sale. Sin nombrar el agua. */
export const TEXTURAS: Readonly<Record<Suelo, { material: string; region: string }>> = {
  grass: {
    material: 'prado de hierba corta y densa, verde oliva apagado, con matas y algún trébol',
    region: 'las praderas verdes del centro',
  },
  dirt: {
    material: 'tierra parda apisonada con gravilla fina y arcilla seca',
    region: 'la tierra de los caminos y de alrededor de la ciudad del centro',
  },
  sand: {
    material: 'arena fina rojiza y ocre con ondas suaves del viento',
    region: 'el desierto rojo de la derecha',
  },
  snow: {
    material: 'nieve con una costra fina y sombras pálidas azuladas',
    region: 'la región nevada de arriba',
  },
  swamp: {
    material: 'turba oscura y empapada de ciénaga, con parches de musgo y juncos podridos',
    region: 'el suelo de la ciénaga de la izquierda, entre los árboles muertos',
  },
  lava: {
    material: 'basalto negro agrietado con grietas de brasa anaranjada',
    region: 'la tierra volcánica de arriba a la derecha',
  },
  rough: {
    material: 'suelo rocoso y quebrado, guijarros grises sueltos y matas secas',
    region: 'las tierras rocosas de abajo',
  },
};

/** La textura de un suelo, vista a 90° y repetible (`textura.ts` fabrica la costura). */
export function encargoDeTextura(suelo: Suelo): Encargo {
  const t = TEXTURAS[suelo];
  return {
    id: `suelo-${suelo}`,
    tipo: 'textura',
    descripcion: `La textura del suelo de un mapa de aventura de fantasía medieval oscura: ${t.material}. De la imagen de estilo copia SOLO el material y el acabado pintado del suelo de ${t.region}, no sus objetos, su relieve ni su perspectiva. Oscura y apagada como ese suelo, de grano fino y con mucho detalle menudo: vista desde arriba, una casilla del mapa ocupa la cuarta parte de la imagen. ${ESTILO_DEL_MAPA}`,
    referencias: [{ ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' }],
    salida: `assets/mapa/suelos/${suelo}`,
    fondo: 'opaco',
  };
}

export function encargosDeTexturas(): Encargo[] {
  return SUELOS_PISABLES.map(encargoDeTextura);
}

/** Lo que pinta cada lámina de muestra, en orden de lectura. */
export const LAMINAS = {
  a: [
    'un tramo de BOSQUE DENSO de pinos y abetos verdes oscuros, una masa de copas apretada que se lee como un muro, no como árboles sueltos',
    'el mismo tramo de bosque denso, NEVADO: abetos cargados de nieve',
    'el mismo tramo de bosque denso, de CIÉNAGA: árboles muertos retorcidos y sin hojas, con raíces al aire',
    'un tramo de ACANTILADO de arenisca roja: una cara vertical de roca estriada con su sombra al pie, del lado bajo',
    'un tramo de ACANTILADO de basalto negro con grietas de brasa: una cara vertical con su sombra al pie',
    'un tramo de ACANTILADO de roca gris con musgo: una cara vertical con su sombra al pie',
    'un tramo de MURALLA de piedra con almenas y un torreón pequeño',
    'una RUINA: un lienzo de muralla derruido, con sillares caídos y hierba entre las piedras',
    'una ORILLA: el borde de un río visto sin el agua, piedras redondeadas, barro y juncos, larga y baja',
  ],
  b: [
    'un PUENTE de piedra de un solo arco que cruza un río (el río no se pinta), con un poste de madera VACÍO para la bandera de su dueño en un extremo',
    'una PUERTA fortificada en un tramo de muralla: un arco con rastrillo entre dos torres, con un poste de madera VACÍO para la bandera',
    'un PASO DE MONTAÑA: un desfiladero estrecho entre dos peñascos con un hito de piedra y un poste de madera VACÍO para la bandera',
    'un PASO DE BOSQUE: un claro con un camino que entra entre árboles altos, con un hito de piedra y un poste de madera VACÍO para la bandera',
    'un PASO DE ACANTILADO: una rampa de piedra tallada que sube por un desnivel, con un poste de madera VACÍO para la bandera arriba',
    'un tramo de MONTAÑA VOLCÁNICA: picos de basalto negro con ríos de lava incandescente bajando por las laderas',
    'un PICO suelto de roca gris con algo de nieve, más pequeño que una cordillera: remata el final de un tramo de montaña',
    'un grupo de ROCAS grandes y peñascos grises, bajo y compacto',
    'una COLADA de lava solidificada: una lengua de basalto negro con grietas incandescentes, baja',
  ],
} as const;
export type Lamina = keyof typeof LAMINAS;

/** La lámina de muestra: nueve piezas en 3×3, como la que eligió el estilo el 01-10. */
export function encargoDeLamina(lamina: Lamina): Encargo {
  const lista = LAMINAS[lamina].map((d, i) => `${i + 1}. ${d}.`).join('\n');
  return {
    id: `mapa-denso-lamina-${lamina}`,
    tipo: 'imagen',
    descripcion: [
      'Lámina de muestra de piezas sueltas del mapa de aventura de un juego de estrategia por turnos. La imagen de estilo es un mapa entero: de ahí salen los bosques, acantilados, muros, puentes y puertas, y cada pieza tiene que poder recortarse de él sin que se note; no copies su encuadre.',
      ESTILO_DEL_MAPA,
      'Nueve piezas sueltas en una rejilla de 3 por 3, en este orden de lectura, separadas con holgura:',
      lista,
      'Todas con la MISMA cámara: ortográfica, elevada 25 grados sobre la horizontal, mirando de frente y algo a la derecha, como en la imagen de estilo; nunca cenital ni de perfil. Misma escala relativa: un tramo de borde mide de largo lo que tres casas y de alto lo que una. La luz viene de arriba a la izquierda. Sin estandartes ni banderas: los postes van vacíos.',
    ].join('\n'),
    referencias: [{ ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' }],
    salida: `assets/mapa/muestras/denso-${lamina}`,
    fondo: 'transparente',
  };
}

/** Para qué sirve una pieza: cerrar una frontera, ser un obstáculo dentro de una región o un nodo. */
export type Uso = 'borde' | 'obstaculo';

/**
 * Una familia de piezas: de qué pieza de qué lámina sale, qué barrera viste,
 * sobre qué suelos y cuántas variantes tiene. Una variante con nombre
 * (`ancho`, `hondo`) es una orientación del tramo; con número, otra silueta.
 */
export interface Familia {
  readonly id: string;
  readonly lamina: Lamina;
  /** La pieza de la lámina, de 1 a 9. */
  readonly n: number;
  readonly barrera: Barrera;
  /** El suelo al lado del cual va (borde) o dentro del cual va (obstáculo). */
  readonly suelos: readonly Suelo[];
  readonly usos: readonly Uso[];
  readonly variantes: readonly string[];
  /** Una versión pequeña de la pieza de la lámina, de una casilla: los obstáculos. */
  readonly pequena?: string;
  /** Remata los extremos de un tramo: no se elige para el relleno. */
  readonly remate?: true;
}

const TRES = ['1', '2', '3'] as const;
const DOS = ['1', '2'] as const;
const TRAMOS = ['ancho-1', 'ancho-2', 'hondo-1'] as const;

export const FAMILIAS: readonly Familia[] = [
  // Bordes: tramos de 2-3 casillas, que se alternan y solapan como las montañas.
  {
    id: 'bosque-verde',
    lamina: 'a',
    n: 1,
    barrera: 'forest',
    suelos: ['grass', 'dirt'],
    usos: ['borde'],
    variantes: TRES,
  },
  {
    id: 'bosque-nevado',
    lamina: 'a',
    n: 2,
    barrera: 'forest',
    suelos: ['snow'],
    usos: ['borde'],
    variantes: TRES,
  },
  {
    id: 'bosque-pantano',
    lamina: 'a',
    n: 3,
    barrera: 'forest',
    suelos: ['swamp'],
    usos: ['borde'],
    variantes: TRES,
  },
  {
    id: 'acantilado-arena',
    lamina: 'a',
    n: 4,
    barrera: 'cliff',
    suelos: ['sand'],
    usos: ['borde'],
    variantes: TRAMOS,
  },
  {
    id: 'acantilado-lava',
    lamina: 'a',
    n: 5,
    barrera: 'cliff',
    suelos: ['lava'],
    usos: ['borde'],
    variantes: TRAMOS,
  },
  {
    id: 'acantilado-roca',
    lamina: 'a',
    n: 6,
    barrera: 'cliff',
    suelos: ['grass', 'snow', 'rough'],
    usos: ['borde'],
    variantes: TRAMOS,
  },
  {
    id: 'muro',
    lamina: 'a',
    n: 7,
    barrera: 'wall',
    suelos: ['dirt', 'rough'],
    usos: ['borde'],
    variantes: ['ancho-1', 'ancho-2', 'hondo-1', 'hondo-2'],
  },
  {
    id: 'ruina',
    lamina: 'a',
    n: 8,
    barrera: 'wall',
    suelos: ['grass', 'dirt', 'sand', 'rough'],
    usos: ['obstaculo'],
    variantes: TRES,
  },
  {
    id: 'orilla',
    lamina: 'a',
    n: 9,
    barrera: 'water',
    suelos: ['grass', 'dirt', 'sand', 'swamp'],
    usos: ['borde', 'obstaculo'],
    variantes: TRES,
  },
  {
    id: 'montana-volcan',
    lamina: 'b',
    n: 6,
    barrera: 'mountain',
    suelos: ['lava'],
    usos: ['borde'],
    variantes: DOS,
  },
  {
    id: 'pico',
    lamina: 'b',
    n: 7,
    barrera: 'mountain',
    suelos: ['sand', 'snow', 'rough'],
    usos: ['borde'],
    variantes: TRES,
    remate: true,
  },
  // Obstáculos: de una casilla, para componer las manchas de 3-6.
  {
    id: 'rocas',
    lamina: 'b',
    n: 8,
    barrera: 'mountain',
    suelos: ['sand', 'rough'],
    usos: ['obstaculo'],
    variantes: DOS,
  },
  {
    id: 'rocas-nevadas',
    lamina: 'b',
    n: 8,
    barrera: 'mountain',
    suelos: ['snow'],
    usos: ['obstaculo'],
    variantes: DOS,
    pequena: 'cubiertas de nieve',
  },
  {
    id: 'cono-volcanico',
    lamina: 'b',
    n: 6,
    barrera: 'mountain',
    suelos: ['lava'],
    usos: ['obstaculo'],
    variantes: DOS,
    pequena: 'un solo cono volcánico bajo con una grieta de lava',
  },
  {
    id: 'colada',
    lamina: 'b',
    n: 9,
    barrera: 'cliff',
    suelos: ['lava'],
    usos: ['obstaculo'],
    variantes: DOS,
  },
  {
    id: 'farallon',
    lamina: 'a',
    n: 4,
    barrera: 'cliff',
    suelos: ['sand'],
    usos: ['obstaculo'],
    variantes: DOS,
    pequena: 'un farallón suelto de arenisca roja, una peña alta y estrecha',
  },
  {
    id: 'pena',
    lamina: 'a',
    n: 6,
    barrera: 'cliff',
    suelos: ['rough'],
    usos: ['obstaculo'],
    variantes: DOS,
    pequena: 'una peña suelta de roca gris con una cara cortada a pico',
  },
  {
    id: 'bosquecillo',
    lamina: 'a',
    n: 1,
    barrera: 'forest',
    suelos: ['grass', 'dirt'],
    usos: ['obstaculo'],
    variantes: DOS,
    pequena: 'un bosquecillo de tres o cuatro árboles apretados',
  },
  {
    id: 'pinos-nevados',
    lamina: 'a',
    n: 2,
    barrera: 'forest',
    suelos: ['snow'],
    usos: ['obstaculo'],
    variantes: DOS,
    pequena: 'tres o cuatro abetos nevados apretados',
  },
  {
    id: 'arboles-muertos',
    lamina: 'a',
    n: 3,
    barrera: 'forest',
    suelos: ['swamp'],
    usos: ['obstaculo'],
    variantes: DOS,
    pequena: 'dos o tres árboles muertos retorcidos',
  },
];

/**
 * Las piezas que ya existen y siguen valiendo (petición 3): la cordillera de
 * roca con nieve. Cuentan para que cada pareja de barrera y suelo tenga pieza.
 */
export const FAMILIAS_EXISTENTES: readonly Omit<Familia, 'lamina' | 'n'>[] = [
  {
    id: 'montana',
    barrera: 'mountain',
    suelos: ['sand', 'snow', 'rough'],
    usos: ['borde'],
    variantes: TRES,
  },
];

/** El id de cada pieza de una familia, en el orden de sus variantes. */
export function idsDe(f: { id: string; variantes: readonly string[] }): string[] {
  return f.variantes.map((v) => (v === '' ? f.id : `${f.id}-${v}`));
}

/** Cómo se orienta un tramo: la frontera corre a lo ancho de la pantalla o hacia el fondo. */
const ORIENTACION = {
  ancho:
    'El tramo corre de izquierda a derecha, con su cara hacia la cámara: es una frontera horizontal del mapa.',
  hondo:
    'El tramo corre hacia el fondo, alejándose de la cámara en escorzo: es una frontera vertical del mapa, vista desde su extremo cercano.',
} as const;

/** En un nodo, el eje es el de la frontera que cruza, no el del paso, que va de través. */
const ORIENTACION_DE_NODO = {
  ancho:
    'La frontera que cruza corre de izquierda a derecha: el río o la muralla van a lo ancho de la imagen y el paso los atraviesa de delante hacia el fondo. Pinta solo un trozo corto de esa frontera a cada lado.',
  hondo:
    'La frontera que cruza corre hacia el fondo, alejándose de la cámara: el río o la muralla se ven en escorzo y el paso los atraviesa de izquierda a derecha. Pinta solo un trozo corto de esa frontera a cada lado.',
} as const;

function queDibujar(
  lamina: Lamina,
  n: number,
  variante: string,
  pequena?: string,
  nodo = false,
): string {
  const pieza = LAMINAS[lamina][n - 1];
  if (pieza === undefined) throw new Error(`la lámina ${lamina} no tiene pieza ${n}`);
  if (pequena !== undefined) {
    return `Dibuja una versión PEQUEÑA de la pieza ${n} de la imagen de estilo (${pieza}): ${pequena}, del tamaño de UNA sola casilla del mapa, como un árbol grande al lado de un soldado. Mismos materiales y colores; ${variante === '1' ? 'compacta' : 'otra silueta que la primera, para que varias juntas no se repitan'}.`;
  }
  const orientacion = variante.replace(/-\d+$/, '');
  const textos = nodo ? ORIENTACION_DE_NODO : ORIENTACION;
  const giro = orientacion in textos ? ` ${textos[orientacion as keyof typeof textos]}` : '';
  const primera = variante === '' || variante === '1' || /^(ancho|hondo)(-1)?$/.test(variante);
  return primera
    ? `Dibuja SOLO la pieza ${n} de la imagen de estilo (${pieza}), con su mismo diseño, materiales y colores.${giro}`
    : `Dibuja SOLO una variante nueva de la pieza ${n} de la imagen de estilo (${pieza}): mismos materiales, colores y escala, pero otra silueta, para que varias seguidas formen un tramo sin repetirse.${giro}`;
}

function encargoDeLaPieza(id: string, descripcion: string, lamina: Lamina, nodo: boolean): Encargo {
  return {
    id: `mapa-${id}`,
    tipo: 'imagen',
    descripcion: [
      `Una pieza suelta del mapa de aventura de un juego de estrategia por turnos. ${descripcion}`,
      ESTILO_DEL_MAPA,
      `Un único objeto, centrado y entero. Cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, la misma de la imagen de estilo; nunca cenital ni de perfil. La luz viene de arriba a la izquierda. Sin estandartes ni banderas${nodo ? ': el poste va VACÍO, la bandera del dueño la pone el juego' : ''}.`,
    ].join('\n'),
    referencias: [{ ruta: `assets/mapa/muestras/denso-${lamina}.webp`, papel: 'estilo' }],
    salida: `assets/mapa/${id}`,
    fondo: 'transparente',
  };
}

/** Todas las piezas sueltas: bordes, obstáculos y nodos. */
export function encargosDePiezasDensas(): Encargo[] {
  const piezas = FAMILIAS.flatMap((f) =>
    f.variantes.map((v, i) =>
      encargoDeLaPieza(
        idsDe(f)[i] as string,
        queDibujar(f.lamina, f.n, v, f.pequena),
        f.lamina,
        false,
      ),
    ),
  );
  const nodos = NODOS.flatMap((nd) =>
    nd.variantes.map((v, i) =>
      encargoDeLaPieza(
        idsDe(nd)[i] as string,
        queDibujar('b', nd.n, v, undefined, true),
        'b',
        true,
      ),
    ),
  );
  return [...piezas, ...nodos];
}

/** Todos los ids de pieza, los nuevos y los que ya existían, por familia. */
export function familiasConIds(): { familia: Omit<Familia, 'lamina' | 'n'>; ids: string[] }[] {
  return [...FAMILIAS, ...FAMILIAS_EXISTENTES].map((f) => ({ familia: f, ids: idsDe(f) }));
}

/** Las familias hechas para esa barrera junto a (o dentro de) ese suelo, sin respaldo. */
export function familiasPara(barrera: Barrera, suelo: Suelo, uso: Uso) {
  return familiasConIds().filter(
    ({ familia: f }) => f.barrera === barrera && f.suelos.includes(suelo) && f.usos.includes(uso),
  );
}

/**
 * La pieza de una casilla de barrera: la familia que viste esa barrera junto a
 * (o dentro de) ese suelo para ese uso, y la variante por el azar de la casilla.
 * Para un tramo con orientación, la del eje de la frontera. `null` si no hay.
 *
 * Es la regla que se propone a la sesión de reglas para `render/mapa.ts`, y la
 * que usa la composición de prueba.
 */
export function piezaDeCasilla(
  barrera: Barrera,
  suelo: Suelo,
  uso: Uso,
  azar: number,
  eje: 'ancho' | 'hondo' = 'ancho',
): string | null {
  // Una frontera tiene dos suelos y la casilla puede tener más cerca el que no
  // la eligió (montaña al lado del prado): entonces vale cualquier pieza de esa
  // barrera, antes que dejar el hueco.
  const propias = familiasPara(barrera, suelo, uso);
  const todas =
    propias.length > 0
      ? propias
      : familiasConIds().filter(({ familia: f }) => f.barrera === barrera && f.usos.includes(uso));
  // Un remate (el pico) cierra los extremos del tramo: no rellena si hay otra.
  const relleno = todas.filter(({ familia: f }) => f.remate !== true);
  const familias = relleno.length > 0 ? relleno : todas;
  if (familias.length === 0) return null;
  const { ids } = familias[azar % familias.length] as { ids: string[] };
  const conEje = ids.filter((i) => i.includes(`-${eje}`));
  const lista = conEje.length > 0 ? conEje : ids;
  return lista[Math.floor(azar / familias.length) % lista.length] as string;
}
