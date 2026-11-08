/**
 * El arte del mapa nuevo (red de nodos): las piezas y los estilos candidatos.
 *
 * Antes de producir las piezas una a una, el usuario elige estilo: por cada
 * estilo se pide UNA lámina de muestra con todas las piezas, para compararlas
 * lado a lado (`pnpm taller encolar --muestras-mapa`). El estilo elegido pasará
 * a ser la referencia de estilo de las piezas sueltas.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MEDIDAS_DEL_PUESTO, PIEZA_DEL_PUESTO } from '../../src/client/render/escenario/puestos.js';
import { MEJORAS_DEL_PUESTO, type MejoraDelPuesto } from '../../src/core/map/tipos.js';
import { aRaster } from '../comun/imagen.js';
import { textoJson } from '../comun/json.js';
import { RAIZ } from '../comun/raiz.js';
import { derivarPieza } from './derivar.js';
import type { Encargo } from './encargo.js';
import { ESTILO_DEL_MAPA, REFERENCIA_DE_MAPAS } from './mapa-denso.js';
import { encargosDelMuroNorteSur } from './muros.js';
import {
  ARRIBA,
  DIR_GUIAS,
  encajar,
  escribirGuia,
  FRENTE,
  Guia,
  type P2,
  type P3,
  SOMBRA,
} from './paredes-puentes.js';

/** Lo que tiene que existir en el mapa nuevo, según `NuevaJugabilidad.md`. */
export const PIEZAS_DE_MAPA = [
  {
    id: 'montana',
    describe:
      'un tramo de cordillera infranqueable: picos rocosos altos y escarpados, sin paso posible, que pueda repetirse en cadena para cerrar el mapa',
  },
  {
    id: 'nodo-hito',
    describe:
      'un nodo de la red sin fortificar: un hito de piedra tallada con un poste vacío para la bandera de su dueño',
  },
  {
    id: 'nodo-empalizada',
    describe:
      'el mismo nodo con una fortificación ligera: el hito rodeado por una empalizada de troncos con una puerta',
  },
  {
    id: 'nodo-torre',
    describe:
      'el mismo nodo con una fortificación de piedra: una torre de vigía cuadrada con almenas y el hito al pie',
  },
  {
    id: 'ciudad',
    describe:
      'una ciudad que es punto fuerte de la red: murallas de piedra con torres y puerta, y dentro tejados y una torre mayor',
  },
  {
    id: 'pueblo',
    describe:
      'un pueblo abierto, sin murallas: cuatro o cinco casas de labriegos, un pozo y huertos',
  },
] as const;

export const ESTILOS_DE_MAPA = [
  {
    id: 'pintado',
    nombre: 'Pintado oscuro (el de assets/art)',
    referencia: 'assets/art/templarios/guerrero-con-escudo.png',
    describe:
      'ilustración pintada de fantasía medieval oscura, materiales gastados y creíbles, paleta sobria y terrosa, como la imagen de estilo',
  },
  {
    id: 'maqueta',
    nombre: 'Maqueta realista tipo Warhammer',
    describe:
      'miniaturas de wargame fotografiadas: escenografía de resina pintada a mano con mucho detalle, lavados y pincel seco, cada pieza sobre su peana de terreno con hierba estática y piedrecitas, luz de estudio suave, aspecto realista de maqueta física',
  },
  {
    id: 'cartografo',
    nombre: 'Cartógrafo: tinta y acuarela',
    describe:
      'ilustración de mapa antiguo dibujado a mano: trazo de tinta sepia fino y acuarela suave sobre tono pergamino, sombreado a plumilla, encanto de atlas medieval',
  },
  {
    id: 'low-poly',
    nombre: 'Low-poly estilizado',
    describe:
      'modelos low-poly estilizados: formas facetadas limpias, colores planos armoniosos con degradado suave, iluminación suave, muy legibles a tamaño pequeño, como un juego de estrategia moderno',
  },
] as const;

/** La lámina de muestra de un estilo: todas las piezas en una rejilla de tres columnas. */
export function encargoDeMuestra(estilo: (typeof ESTILOS_DE_MAPA)[number]): Encargo {
  const lista = PIEZAS_DE_MAPA.map((p, i) => `${i + 1}. ${p.describe}.`).join('\n');
  return {
    id: `mapa-muestra-${estilo.id}`,
    tipo: 'imagen',
    descripcion: [
      `Lámina de muestra de las piezas del mapa de aventura de un juego de estrategia por turnos, en estilo: ${estilo.describe}.`,
      `${PIEZAS_DE_MAPA.length} piezas sueltas en una rejilla de tres columnas, en este orden de lectura, separadas con holgura:`,
      lista,
      'Todas con la MISMA cámara: ortográfica, elevada 25 grados sobre la horizontal, mirando de frente y algo a la derecha, como se ven las figuras del juego; nunca cenital ni de perfil. Misma escala relativa entre piezas: la montaña y la ciudad son las mayores, el pueblo el menor. La luz viene de arriba a la izquierda.',
    ].join('\n'),
    referencias: 'referencia' in estilo ? [{ ruta: estilo.referencia, papel: 'estilo' }] : [],
    salida: `assets/mapa/muestras/${estilo.id}`,
    fondo: 'transparente',
  };
}

/** El estilo elegido por el usuario (01-10-2026): su lámina de muestra es la referencia de las piezas. */
export const MUESTRA_ELEGIDA = 'assets/mapa/muestras/pintado.webp';

/** Variantes de la montaña: una cordillera hecha con una sola pieza repetida canta. */
export const VARIANTES_DE_MONTANA = 3;

/**
 * Una pieza suelta del mapa, copiando su diseño de la lámina elegida. La
 * montaña admite variantes (`variante` 1…3): misma familia, siluetas distintas.
 */
export function encargoDePieza(id: string, variante?: number): Encargo {
  const n = PIEZAS_DE_MAPA.findIndex((p) => p.id === id);
  const pieza = PIEZAS_DE_MAPA[n];
  if (pieza === undefined) {
    throw new Error(
      `no hay pieza de mapa «${id}». Hay: ${PIEZAS_DE_MAPA.map((p) => p.id).join(', ')}`,
    );
  }
  const sufijo = variante === undefined ? '' : `-${variante}`;
  const copia =
    variante === undefined || variante === 1
      ? `Dibuja SOLO la pieza ${n + 1} de la imagen de estilo (${pieza.describe}), con su mismo diseño, materiales y colores.`
      : `Dibuja SOLO una variante nueva de la pieza ${n + 1} de la imagen de estilo (${pieza.describe}): misma roca, misma nieve y misma escala, pero con otra silueta de picos, para que varias seguidas formen una cordillera sin repetirse.`;
  return {
    id: `mapa-${id}${sufijo}`,
    tipo: 'imagen',
    descripcion: [
      `Una pieza suelta del mapa de aventura de un juego de estrategia por turnos. ${copia}`,
      'Un único objeto, centrado y entero. Cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, la misma de la imagen de estilo; nunca cenital ni de perfil. La luz viene de arriba a la izquierda. Sin estandartes ni banderas: la bandera del dueño la pone el juego.',
    ].join('\n'),
    referencias: [{ ruta: MUESTRA_ELEGIDA, papel: 'estilo' }],
    salida: `assets/mapa/${id}${sufijo}`,
    fondo: 'transparente',
  };
}

/**
 * Todas las piezas del mapa, con las variantes de la montaña. Menos el hito de la
 * lámina, retirado por su cruz (#176): lo sustituyen los de `HITOS_DE_NODO`.
 */
export function encargosDePiezas(): Encargo[] {
  return PIEZAS_DE_MAPA.filter((p) => p.id !== 'nodo-hito').flatMap((p) =>
    p.id === 'montana'
      ? Array.from({ length: VARIANTES_DE_MONTANA }, (_, i) => encargoDePieza(p.id, i + 1))
      : [encargoDePieza(p.id)],
  );
}

/*
 * Las celdas del atlas viejo (`assets/rpg/map-atlas.png`) se pintaron una a una
 * en `assets/mapa/atlas/` con el atlas de identidad y la lámina de estilo; su
 * prompt y sus referencias, con sha256, están en cada `.procedencia.json`. El
 * atlas se retiró con su compositor cuando el cofre, lo último que el mapa
 * sacaba de él, pasó a pieza suelta (#147); el estilo «pixel», que lo tenía de
 * referencia y no se eligió, se fue con él.
 */

/**
 * Los hitos del nodo sin pieza de paso (el acantilado y el que no cruza nada),
 * tres para que un llano con varios no repita la misma piedra (#176). El de la
 * lámina llevaba una cruz tallada y, solo y repetido en mitad de un llano, se
 * leía como una lápida: ninguno lleva cruz ni símbolo. Tampoco poste alto: la
 * bandera la planta el juego con su propio mástil, y el poste con brazo se leía
 * como una horca (#168).
 */
export const HITOS_DE_NODO = [
  {
    id: 'nodo-hito-miliar',
    describe:
      'un miliario romano: una columna cilíndrica corta y gruesa de piedra, de tapa PLANA, desgastada y con líquenes, sobre un pedestal cuadrado bajo, con unas pocas piedras sueltas al pie. Nada de tapa redondeada ni de losa: no es una lápida',
  },
  {
    id: 'nodo-hito-mojon',
    describe:
      'un mojón de piedras: un montón cónico de piedras sueltas de campo apiladas a mano, del que asoma un poste de madera corto y grueso, apenas un palmo más alto que las piedras, atado con una cuerda',
  },
  {
    id: 'nodo-hito-tablilla',
    describe:
      'un poste de camino: un poste de madera grueso clavado entre cuatro o cinco piedras que lo calzan, con UNA tablilla de madera en punta de flecha clavada en su remate que sale hacia UN SOLO lado, la derecha; el poste NO asoma por encima de la tablilla y al otro lado no hay nada. Lisa, sin letras ni dibujos. Nada de travesaño que cruce el poste: no es una cruz',
  },
] as const;

/** Un hito suelto, con la piedra y la madera de la lámina elegida. */
export function encargoDeHito(id: string): Encargo {
  const hito = HITOS_DE_NODO.find((h) => h.id === id);
  if (hito === undefined)
    throw new Error(`no hay hito «${id}». Hay: ${HITOS_DE_NODO.map((h) => h.id).join(', ')}`);
  return {
    id: `mapa-${hito.id}`,
    tipo: 'imagen',
    descripcion: [
      `Una pieza suelta del mapa de aventura de un juego de estrategia por turnos, el hito que marca un cruce de la red de caminos: ${hito.describe}.`,
      'Píntalo con la piedra clara y gastada y la madera oscura de las piezas de la imagen de estilo, su mismo acabado y su misma paleta. Pequeño y modesto: una figura humana le llegaría por encima de la cintura.',
      'NADA de cruces, runas, letras, inscripciones ni símbolos tallados o pintados: no es una tumba ni una lápida. Sin estandartes, banderas ni mástil: la bandera del dueño la pone el juego.',
      'Un único objeto, centrado y entero. Cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, la misma de la imagen de estilo; nunca cenital ni de perfil. La luz viene de arriba a la izquierda.',
    ].join('\n'),
    referencias: [{ ruta: MUESTRA_ELEGIDA, papel: 'estilo' }],
    salida: `assets/mapa/${hito.id}`,
    fondo: 'transparente',
  };
}

export function encargosDeHitos(): Encargo[] {
  return HITOS_DE_NODO.map((h) => encargoDeHito(h.id));
}

/**
 * Las tablillas que no apuntan al este (§29): el juego orienta la flecha por el
 * eje del paso (`hitoDelNodo`, `nodos.ts`) y nunca espeja una pieza, porque la
 * luz viene de la izquierda y una tablilla espejada la tendría de la derecha.
 * Cada una se pinta aparte, con su luz, y la del este va de MATERIAL: su madera y
 * su piedra, no su forma, que arrastraría la flecha a la derecha.
 */
export const TABLILLAS_POR_RUMBO = [
  {
    rumbo: 'oeste',
    describe:
      'la tablilla sale del poste hacia la IZQUIERDA y su punta de flecha apunta a la IZQUIERDA; a la derecha del poste no hay nada. Se ve de frente, plana, como un cartel que señala a la izquierda',
  },
  {
    rumbo: 'norte',
    describe:
      'la tablilla sale del poste hacia el FONDO, alejándose de la cámara en línea recta, perpendicular a la imagen: se ve en escorzo, con su canto de cara y su cara del lado derecho algo visible, y la punta de flecha arriba, más lejos y más pequeña que el poste. No señala a la izquierda ni a la derecha: señala hacia dentro de la imagen',
  },
  {
    rumbo: 'noreste',
    describe:
      'la tablilla sale del poste en DIAGONAL hacia el fondo y la DERECHA, girada 45 grados: se aleja de la cámara hacia arriba a la derecha, en escorzo, con su cara algo de frente y la punta de flecha arriba a la derecha',
  },
  {
    rumbo: 'noroeste',
    describe:
      'la tablilla sale del poste en DIAGONAL hacia el fondo y la IZQUIERDA, girada 45 grados: se aleja de la cámara hacia arriba a la izquierda, en escorzo, con su cara algo de frente y la punta de flecha arriba a la izquierda',
  },
] as const;

export function encargoDeTablilla(rumbo: string): Encargo {
  const t = TABLILLAS_POR_RUMBO.find((x) => x.rumbo === rumbo);
  if (t === undefined)
    throw new Error(
      `no hay tablilla hacia «${rumbo}». Hay: ${TABLILLAS_POR_RUMBO.map((x) => x.rumbo).join(', ')}`,
    );
  return {
    id: `mapa-nodo-hito-tablilla-${t.rumbo}`,
    tipo: 'imagen',
    descripcion: [
      'Una pieza suelta del mapa de aventura de un juego de estrategia por turnos, el hito que marca un cruce de la red de caminos: un poste de camino de madera gruesa clavado entre cuatro o cinco piedras que lo calzan, con UNA tablilla de madera en punta de flecha clavada en su remate; el poste NO asoma por encima de la tablilla. Lisa, sin letras ni dibujos. Nada de travesaño que cruce el poste: no es una cruz.',
      `Hacia dónde apunta, que es lo que importa: ${t.describe}.`,
      'La madera y las piedras son las de la imagen de material (el mismo poste, la misma tablilla, el mismo musgo), pero con la flecha hacia donde se dice aquí, no hacia donde apunta allí. Pequeño y modesto: una figura humana le llegaría por encima de la cintura.',
      'NADA de cruces, runas, letras, inscripciones ni símbolos. Sin estandartes, banderas ni mástil: la bandera del dueño la pone el juego.',
      'Un único objeto, centrado y entero. Cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, la misma de la imagen de estilo; nunca cenital ni de perfil. La luz viene de arriba a la izquierda.',
    ].join('\n'),
    referencias: [
      { ruta: MUESTRA_ELEGIDA, papel: 'estilo' },
      { ruta: 'assets/mapa/nodo-hito-tablilla.webp', papel: 'material' },
    ],
    salida: `assets/mapa/nodo-hito-tablilla-${t.rumbo}`,
    fondo: 'transparente',
  };
}

export function encargosDeTablillas(): Encargo[] {
  return TABLILLAS_POR_RUMBO.map((t) => encargoDeTablilla(t.rumbo));
}

/**
 * La puerta de la muralla que corre de norte a sur (§29). La `hondo` de la
 * hoja `muro` era la del este-oeste girada a medias por una corrección de
 * Codex, con el arco mirando al sureste: se pide de lado. Los tramos de norte a
 * sur (`muro-ns-*`) se piden con su guía (`muros.ts`).
 */
export const MURALLA_NORTE_SUR = [
  {
    id: 'nodo-puerta-hondo',
    describe:
      'la puerta fortificada de una muralla que corre de NORTE a SUR: la muralla arranca abajo en la imagen, cerca de la cámara, y se aleja en línea recta hacia ARRIBA, hacia el fondo; en su medio, una casa de la puerta con dos torres almenadas, una delante y otra detrás, y entre ellas el arco con su rastrillo abierto en la cara del lado DERECHO (el este), visto de lado y en escorzo, por el que un camino cruza la muralla de izquierda a derecha. El arco NO mira a la cámara: mira a la derecha. Un trozo corto de muralla sale de la casa de la puerta hacia abajo y otro hacia arriba, con cortes limpios para empalmar. Unas antorchas junto al arco. La muralla va VERTICAL en la imagen, sin inclinarse: su extremo cercano queda justo debajo del lejano y la torre de atrás justo encima de la de delante, como un tramo que corre recto hacia el fondo y no en diagonal. La pieza es más alta que ancha',
  },
] as const;

export function encargoDeMurallaNS(id: string): Encargo {
  const m = MURALLA_NORTE_SUR.find((x) => x.id === id);
  if (m === undefined)
    throw new Error(
      `no hay pieza de muralla norte-sur «${id}». Hay: ${MURALLA_NORTE_SUR.map((x) => x.id).join(', ')}`,
    );
  return {
    id: `mapa-${m.id}`,
    tipo: 'imagen',
    descripcion: [
      `Una pieza suelta del mapa de aventura de un juego de estrategia por turnos: ${m.describe}.`,
      'La piedra gris con musgo, las almenas, el rastrillo y las antorchas son los de la puerta de la imagen 2, que es la misma puerta en una muralla que corre de izquierda a derecha: aquí la muralla corre hacia el fondo y la puerta se abre a la derecha.',
      'Sin peana ni trozo de suelo debajo: el muro solo, para posarlo sobre el terreno. Sin estandartes ni banderas.',
      'Un único objeto, centrado y entero. Cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, la misma de la imagen de estilo; nunca cenital ni de perfil. La luz viene de arriba a la izquierda.',
    ].join('\n'),
    referencias: [
      { ruta: MUESTRA_ELEGIDA, papel: 'estilo' },
      { ruta: 'assets/mapa/nodo-puerta-ancho.webp', papel: 'identidad' },
    ],
    salida: `assets/mapa/${m.id}`,
    fondo: 'transparente',
  };
}

export function encargosDeMurallaNS(): Encargo[] {
  return [...encargosDelMuroNorteSur(), ...MURALLA_NORTE_SUR.map((m) => encargoDeMurallaNS(m.id))];
}

/**
 * El cofre del mapa (#147), una pieza suelta: hasta ahora salía de la celda 8
 * del atlas viejo. CERRADO a propósito, para que se lea como cofre y no como un
 * montón de oro (el que había era un arcón abierto rebosante de monedas).
 */
export function encargoDeCofre(): Encargo {
  return {
    id: 'mapa-cofre',
    tipo: 'imagen',
    descripcion: [
      'Una pieza suelta del mapa de aventura de un juego de estrategia por turnos: un cofre del tesoro CERRADO, de los que se recogen por el camino. Un arcón pequeño de madera oscura y gastada, de tapa abombada, con flejes y cantoneras de hierro ennegrecido, remaches y una cerradura de hierro con un candado colgando, apoyado sobre el suelo.',
      'La tapa está cerrada del todo: NO se ven monedas, lingotes, joyas ni nada dentro o alrededor del cofre. Ni sacos, ni copas, ni oro suelto al pie.',
      'Píntalo con la madera oscura y el hierro de las piezas de la imagen de estilo, su mismo acabado y su misma paleta. Pequeño: a una figura humana le llegaría por la rodilla.',
      'Un único objeto, centrado y entero. Cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, la misma de la imagen de estilo; nunca cenital ni de perfil. La luz viene de arriba a la izquierda. Sin estandartes ni banderas.',
    ].join('\n'),
    referencias: [{ ruta: MUESTRA_ELEGIDA, papel: 'estilo' }],
    salida: 'assets/mapa/cofre',
    fondo: 'transparente',
  };
}

// ------------------------------------------------------- los puestos (fase 4)

/**
 * Las tres obras del puesto fronterizo (05-11-2026): la caseta de un paso tomado,
 * la torreta de madera de la empalizada y la torre de la muralla. Cada una se
 * pide con su **guía de geometría** (`guiaDelPuesto`): un volumen gris con la
 * proyección del mapa (el suelo tal cual, lo alto hacia arriba) y a las medidas
 * de su obra (`MEDIDAS_DEL_PUESTO`, `render/escenario/puestos.ts`), con la losa
 * de una casilla debajo como vara de medir. Por la suscripción (`codex exec`),
 * 0 €. La pieza pintada se registra sobre su guía (`puestoDerivado`): de ahí
 * sale cuántos píxeles suyos mide una casilla, que es su escala en el mapa.
 *
 *   pnpm taller encolar --puestos [--solo=caseta,torreta,torre] [--rehacer]
 */
export const PUESTOS: Readonly<
  Record<MejoraDelPuesto, { describe: string; material: string; deMaterial: string }>
> = {
  ninguna: {
    describe:
      'una CASETA de guardia de un paso de montaña: una cabaña pequeña, baja y más ancha que honda, de paredes de troncos y tablones oscuros sobre un zócalo de piedras de campo, con un tejado a dos aguas de tablas o de paja vieja que asoma por delante y por detrás, una puerta baja de tablones en la cara de delante y un ventanuco. Al lado, pegados a la pared, un par de barriles o un montón de leña. Humilde y gastada: la levanta quien toma el paso',
    material: 'assets/mapa/modulos/casas/3.webp',
    deMaterial: 'la madera oscura, la piedra de campo y la paja de la casa de la imagen 2',
  },
  empalizada: {
    describe:
      'una TORRETA DE VIGÍA DE MADERA: cuatro postes de troncos gruesos, algo abiertos hacia el suelo y arriostrados con dos cruces de madera atadas, que sostienen en lo alto una garita de tablones con barandilla y un tejadillo a cuatro aguas de tablas; una escalera de mano de troncos sube por delante hasta la garita. Al pie, las piedras que calzan los postes. Toda de madera, sin una piedra en la garita',
    material: 'assets/mapa/nodo-empalizada.webp',
    deMaterial:
      'la madera de troncos de la empalizada de la imagen 2 (no su forma: aquí no hay cerca)',
  },
  muralla: {
    describe:
      'una TORRE DE PIEDRA cuadrada de vigía: un torreón de sillares grises con musgo en las juntas, algo más ancho al pie (un talud), con una saetera alta en la cara de delante y una puerta pequeña de madera con herrajes al pie, rematado por un adarve con almenas en sus cuatro lados. Sólida y sobria, sin tejado: el remate es la hilera de almenas',
    material: 'assets/mapa/modulos/muro.webp',
    deMaterial: 'la piedra gris con musgo, los sillares y las almenas de la muralla de la imagen 2',
  },
};

/** El nombre corto de cada obra, el de su pieza sin `puesto-`: `caseta`, `torreta`, `torre`. */
const cortoDe = (m: MejoraDelPuesto): string => PIEZA_DEL_PUESTO[m].replace(/^puesto-/, '');

/** El gris de la losa de la vara de medir y el oscuro de una puerta o una saetera. */
const LOSA = '#8a8a8a';
const VANO = '#3c3c3c';

/**
 * Un prisma de la obra visto de frente: la cara de delante a la luz, una tira de
 * la de la derecha en penumbra y la tapa. No es el prisma de las guías de los
 * puentes ni el del recinto, que enseñan cada cara por su normal y aquí no
 * enseñarían la tira: con él, las guías de las tres piezas ya pintadas cambiarían.
 */
function prismaDeFrente(g: Guia, [x0, x1]: P2, [y0, y1]: P2, [z0, z1]: P2): void {
  g.poligono(
    [
      [x1, y1, z0],
      [x1 + 0.04, y1 - 0.04, z0],
      [x1 + 0.04, y0 - 0.04, z1],
      [x1, y0, z1],
    ],
    SOMBRA,
  );
  g.poligono(
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    FRENTE,
  );
  g.poligono(
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    ARRIBA,
  );
}

/** Un vano oscuro en la cara de delante (`y1`): una puerta o una saetera, de `x0` a `x1` y de `z0` a `z1`. */
function vano(g: Guia, y1: number, [x0, x1]: P2, [z0, z1]: P2): void {
  g.poligono(
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    VANO,
  );
}

/** Las medidas de la planta de una obra: de `x0` a `x1` y de `y0` (atrás) a `y1` = 0 (delante). */
interface Planta {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly alto: number;
}

/**
 * Cómo se dibuja cada obra con el pie de su cara de delante en el origen (`y` = 0
 * es el borde de delante de su planta; hacia el norte, `y` negativa).
 */
const DIBUJO_DE_LA_OBRA: Readonly<Record<MejoraDelPuesto, (g: Guia, p: Planta) => void>> = {
  // Las paredes hasta la mitad del alto; el tejado, a dos aguas con la cumbrera
  // de norte a sur: el hastial mira a la cámara, como en las casas del mapa.
  ninguna: (g, { x0, x1, y0, y1, alto }) => {
    const pared = alto * 0.5;
    prismaDeFrente(g, [x0, x1], [y0, y1], [0, pared]);
    const v = 0.04;
    g.poligono(
      [
        [x1 + v, y1 + v, pared],
        [0, y1 + v, alto],
        [0, y0 - v, alto],
        [x1 + v, y0 - v, pared],
      ],
      SOMBRA,
    );
    g.poligono(
      [
        [x0 - v, y1 + v, pared],
        [0, y1 + v, alto],
        [0, y0 - v, alto],
        [x0 - v, y0 - v, pared],
      ],
      ARRIBA,
    );
    g.poligono(
      [
        [x0, y1, pared],
        [x1, y1, pared],
        [0, y1, alto - v],
      ],
      FRENTE,
    );
    vano(g, y1, [-0.06, 0.06], [0, pared * 0.8]);
  },
  // Cuatro patas, la garita en lo alto y su tejadillo a cuatro aguas.
  empalizada: (g, { x0, x1, y0, y1, alto }) => {
    const garita = alto * 0.6;
    const techo = alto * 0.82;
    const p = 0.035;
    for (const [px, py] of [
      [x0 + p, y0 + p],
      [x1 - p, y0 + p],
      [x0 + p, y1 - p],
      [x1 - p, y1 - p],
    ] as const)
      prismaDeFrente(g, [px - p, px + p], [py - p, py + p], [0, garita]);
    const m = 0.04;
    prismaDeFrente(g, [x0 - m, x1 + m], [y0 - m, y1 + m], [garita, techo]);
    const [a0, a1, b0, b1] = [x0 - 2 * m, x1 + 2 * m, y0 - 2 * m, y1 + 2 * m];
    const cima: P3 = [0, (y0 + y1) / 2, alto];
    g.poligono([[a0, b0, techo], [a1, b0, techo], cima], ARRIBA);
    g.poligono([[a1, b0, techo], [a1, b1, techo], cima], SOMBRA);
    g.poligono([[a0, b0, techo], [a0, b1, techo], cima], ARRIBA);
    g.poligono([[a0, b1, techo], [a1, b1, techo], cima], FRENTE);
  },
  // El cuerpo, el adarve un poco más ancho y cuatro almenas en la cara de
  // delante y en la de detrás.
  muralla: (g, { x0, x1, y0, y1, alto }) => {
    const adarve = alto - 0.1;
    prismaDeFrente(g, [x0, x1], [y0, y1], [0, adarve]);
    const a = 0.025;
    prismaDeFrente(g, [x0 - a, x1 + a], [y0 - a, y1 + a], [adarve - 0.06, adarve]);
    const n = 4;
    const w = (x1 - x0 + 2 * a) / (2 * n - 1);
    for (const fila of [
      [y0 - a, y0 - a + 0.06],
      [y1 + a - 0.06, y1 + a],
    ] as const)
      for (let k = 0; k < n; k++) {
        const x = x0 - a + 2 * k * w;
        prismaDeFrente(g, [x, x + w], fila, [adarve, alto]);
      }
    vano(g, y1, [-0.02, 0.02], [alto * 0.45, alto * 0.65]);
  },
};

/** La planta de la obra `mejora`, de sus medidas. */
function plantaDe(mejora: MejoraDelPuesto): Planta {
  const { ancho, fondo, alto } = MEDIDAS_DEL_PUESTO[mejora];
  return { x0: -ancho / 2, x1: ancho / 2, y0: -fondo, y1: 0, alto };
}

/**
 * Dibuja la obra `mejora` y, debajo, la losa de una casilla en el suelo, en el
 * gris del fondo con su borde: la vara de medir, que no se pinta.
 */
function dibujarPuesto(g: Guia, mejora: MejoraDelPuesto): void {
  g.poligono(
    [
      [-0.5, -0.7, 0],
      [0.5, -0.7, 0],
      [0.5, 0.3, 0],
      [-0.5, 0.3, 0],
    ],
    LOSA,
  );
  DIBUJO_DE_LA_OBRA[mejora](g, plantaDe(mejora));
}

/** El lienzo de la guía de un puesto y lo que ocupa de él lo dibujado. */
const LIENZO_DEL_PUESTO = 1024;
const LLENO_DEL_PUESTO = 0.78;

/** La guía de una obra, centrada en su lienzo con la losa: la casilla mide `t` píxeles. */
export function guiaDelPuesto(mejora: MejoraDelPuesto): Guia {
  return encajar(LIENZO_DEL_PUESTO, LIENZO_DEL_PUESTO, LLENO_DEL_PUESTO, (g) =>
    dibujarPuesto(g, mejora),
  );
}

/**
 * La caja de la obra sola en su guía (sin la losa), en píxeles: lo que se
 * registra contra lo opaco de la pieza pintada.
 */
function cajaDeLaObraEnLaGuia(g: Guia, mejora: MejoraDelPuesto): [number, number, number, number] {
  const m = new Guia(g.ancho, g.alto, g.t, g.ox, g.oy);
  DIBUJO_DE_LA_OBRA[mejora](m, plantaDe(mejora));
  return [m.caja.x0, m.caja.y0, m.caja.x1, m.caja.y1].map((v) => Number(v.toFixed(1))) as [
    number,
    number,
    number,
    number,
  ];
}

const nombreDeLaGuia = (m: MejoraDelPuesto) => PIEZA_DEL_PUESTO[m];

/**
 * Escribe las tres guías en `assets/mapa/guias/`, con su casilla, las medidas
 * de su obra y la caja de la obra sola (`cajaDeLaObraEnLaGuia`) en el `.json`.
 */
export async function escribirGuiasDePuestos(): Promise<string[]> {
  const escritas: string[] = [];
  for (const m of MEJORAS_DEL_PUESTO) {
    const g = guiaDelPuesto(m);
    escritas.push(
      await escribirGuia(nombreDeLaGuia(m), g, {
        casilla: g.t,
        obra: MEDIDAS_DEL_PUESTO[m],
        caja: cajaDeLaObraEnLaGuia(g, m),
      }),
    );
  }
  return escritas;
}

/** Lo que se guarda de la guía de un puesto (`escribirGuiasDePuestos`). */
interface GeometriaDelPuesto {
  readonly casilla: number;
  readonly caja: readonly [number, number, number, number];
}

/**
 * El JSON de una obra pintada: el de cualquier pieza (`derivarPieza`) y cuántos
 * píxeles suyos mide una casilla (`pxPorCasilla`), registrado sobre su guía por
 * las cajas, como los puentes (`derivarPuente`): la caja de lo opaco de la pieza
 * frente a la de la obra en la guía. Por el alto: a lo ancho, el alero de la
 * caseta de Codex vuela más que el de la guía. Lo lee el escenógrafo
 * (`Pieza.puesto`) y lo comprueba `test/arte-hojas.test.ts`.
 */
export async function puestoDerivado(rutaImagen: string): Promise<Record<string, unknown>> {
  const nombre = basename(rutaImagen).replace(/\.webp$/, '');
  const mejora = MEJORAS_DEL_PUESTO.find((m) => PIEZA_DEL_PUESTO[m] === nombre);
  if (mejora === undefined)
    throw new Error(
      `${nombre}: no es la pieza de ninguna obra del puesto (${Object.values(PIEZA_DEL_PUESTO).join(', ')})`,
    );
  const rutaGuia = join(DIR_GUIAS, `${nombreDeLaGuia(mejora)}.json`);
  const geo = JSON.parse(await readFile(join(RAIZ, rutaGuia), 'utf8')) as GeometriaDelPuesto;
  const { data, width, height } = await aRaster(rutaImagen);
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((data[(y * width + x) * 4 + 3] as number) >= 128) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (y1 < 0) throw new Error(`${rutaImagen} no tiene nada opaco`);
  const [gx0, gy0, gx1, gy1] = geo.caja;
  const sx = (x1 - x0) / (gx1 - gx0);
  const sy = (y1 - y0) / (gy1 - gy0);
  return {
    ...(await derivarPieza(rutaImagen)),
    pxPorCasilla: Math.round(geo.casilla * sy),
    escalaGuia: [Number(sx.toFixed(3)), Number(sy.toFixed(3))],
    guia: rutaGuia.replace(/\.json$/, '.png'),
  };
}

export async function escribirPuestoDerivado(rutaImagen: string): Promise<void> {
  await writeFile(
    rutaImagen.replace(/\.webp$/, '.json'),
    textoJson(await puestoDerivado(rutaImagen), 2),
  );
}

/** El encargo de una obra, con el estilo del mapa, su material y su guía. */
export function encargoDePuesto(corto: string): Encargo {
  const mejora = MEJORAS_DEL_PUESTO.find((m) => cortoDe(m) === corto);
  if (mejora === undefined)
    throw new Error(`no hay puesto «${corto}». Hay: ${MEJORAS_DEL_PUESTO.map(cortoDe).join(', ')}`);
  const p = PUESTOS[mejora];
  return {
    id: `mapa-puesto-${corto}`,
    tipo: 'imagen',
    descripcion: [
      `Una pieza suelta del mapa de aventura de un juego de estrategia por turnos: ${p.describe}.`,
      `LA SILUETA, LAS PROPORCIONES Y LA POSICIÓN SON LAS DE LA GUÍA (imagen 3): el volumen gris es la obra, cópialo con su forma y su tamaño relativo, sin girarla ni torcerla; la losa gris de debajo es una casilla del mapa, solo la vara de medir: NO la pintes, ni ningún suelo. En la guía lo gris claro es lo de arriba, lo gris medio la cara de delante a la luz y lo oscuro lo que queda en penumbra a la derecha.`,
      `Los materiales y la paleta: ${p.deMaterial}.`,
      'Sin suelo, sin peana, sin hierba ni piedras alrededor más allá de las que pide la pieza, sin estandartes ni banderas ni mástil: la bandera del dueño la pone el juego. Un único objeto, centrado y entero. Cámara ortográfica elevada 25 grados, la del juego, que es la de la guía; nunca cenital ni de perfil. La luz viene de arriba a la izquierda.',
      ESTILO_DEL_MAPA,
    ].join('\n'),
    referencias: [
      { ruta: REFERENCIA_DE_MAPAS, papel: 'estilo' },
      { ruta: p.material, papel: 'material' },
      { ruta: `${DIR_GUIAS}/${nombreDeLaGuia(mejora)}.png`, papel: 'guia' },
    ],
    salida: `assets/mapa/${PIEZA_DEL_PUESTO[mejora]}`,
    fondo: 'transparente',
  };
}

export function encargosDePuestos(): Encargo[] {
  return MEJORAS_DEL_PUESTO.map((m) => encargoDePuesto(cortoDe(m)));
}
