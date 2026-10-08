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
 * El cofre del mapa (#147), una pieza suelta como los recursos: hasta ahora salía
 * de la celda 8 del atlas viejo. CERRADO a propósito: el recurso oro ya es un
 * arcón abierto rebosante de monedas y lingotes, y dos arcones abiertos en el
 * mismo mapa no se distinguen de un vistazo.
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
