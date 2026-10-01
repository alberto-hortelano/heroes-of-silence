/**
 * El arte del mapa nuevo (red de nodos): las piezas y los estilos candidatos.
 *
 * Antes de producir las piezas una a una, el usuario elige estilo: por cada
 * estilo se pide UNA lámina de muestra con las nueve piezas, para compararlas
 * lado a lado (`pnpm taller encolar --muestras-mapa`). El estilo elegido pasará
 * a ser la referencia de estilo de las piezas sueltas.
 */
import type { Encargo } from './encargo.js';

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
  {
    id: 'oro',
    describe: 'el recurso oro: un montón de monedas y lingotes de oro en un arcón abierto',
  },
  {
    id: 'piedra',
    describe: 'el recurso piedra: bloques de piedra tallada apilados junto a una pequeña cantera',
  },
  { id: 'madera', describe: 'el recurso madera: troncos cortados y apilados, atados con cuerdas' },
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
    id: 'pixel',
    nombre: 'Pixel art (el de map-atlas.png)',
    referencia: 'assets/rpg/map-atlas.png',
    describe:
      'pixel art detallado y nítido, colores saturados, contorno oscuro, como las piezas de la imagen de estilo',
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

/** La lámina de muestra de un estilo: las nueve piezas en una rejilla de 3×3. */
export function encargoDeMuestra(estilo: (typeof ESTILOS_DE_MAPA)[number]): Encargo {
  const lista = PIEZAS_DE_MAPA.map((p, i) => `${i + 1}. ${p.describe}.`).join('\n');
  return {
    id: `mapa-muestra-${estilo.id}`,
    tipo: 'imagen',
    descripcion: [
      `Lámina de muestra de las piezas del mapa de aventura de un juego de estrategia por turnos, en estilo: ${estilo.describe}.`,
      'Nueve piezas sueltas en una rejilla de 3 por 3, en este orden de lectura, separadas con holgura:',
      lista,
      'Todas con la MISMA cámara: ortográfica, elevada 25 grados sobre la horizontal, mirando de frente y algo a la derecha, como se ven las figuras del juego; nunca cenital ni de perfil. Misma escala relativa entre piezas: la montaña y la ciudad son las mayores, los recursos los menores. La luz viene de arriba a la izquierda.',
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

/** Todas las piezas del mapa, con las variantes de la montaña. */
export function encargosDePiezas(): Encargo[] {
  return PIEZAS_DE_MAPA.flatMap((p) =>
    p.id === 'montana'
      ? Array.from({ length: VARIANTES_DE_MONTANA }, (_, i) => encargoDePieza(p.id, i + 1))
      : [encargoDePieza(p.id)],
  );
}
