/**
 * Los edificios de ciudad de cada facción (`NuevaJugabilidad.md`, «Una posible
 * asignación de edificios por facción»): cada uno desbloquea la producción de
 * élite de su facción. Se pintan sueltos, construidos, en el estilo pintado
 * oscuro y a la cámara del juego; la pantalla de ciudad pone el solar vacío.
 *
 * Dos referencias de estilo: la muestra del mapa elegida por el usuario (el
 * acabado) y una lámina de su facción en `assets/art/` (la paleta y los motivos).
 */
import type { Encargo } from './encargo.js';
import { MUESTRA_ELEGIDA } from './mapa.js';
import type { Unidad } from './unidades.js';
import { ESTILO_DE_FACCION } from './unidades.js';

export interface Edificio {
  readonly id: string;
  readonly faccion: Unidad['faccion'];
  readonly nombre: string;
  /** Qué produce, según el documento de diseño. */
  readonly produce: string;
  readonly describe: string;
}

export const EDIFICIOS: readonly Edificio[] = [
  {
    id: 'monasterio',
    faccion: 'templarios',
    nombre: 'Monasterio',
    produce: 'Monjes, Penitentes',
    describe:
      'un monasterio templario de piedra clara: iglesia con campanario, claustro con arcos, huerto de hierbas medicinales y una cruz roja sobre la puerta',
  },
  {
    id: 'establos',
    faccion: 'templarios',
    nombre: 'Establos',
    produce: 'Hermanos de carga',
    describe:
      'unos establos de la orden: nave larga de piedra y madera con tejado de pizarra, portones abiertos, abrevadero, sillas de montar y lanzas apoyadas, estandarte blanco con cruz roja',
  },
  {
    id: 'forja',
    faccion: 'templarios',
    nombre: 'Forja',
    produce: 'Guerreros a dos manos',
    describe:
      'una forja templaria: taller de piedra con chimenea humeante, yunque y fragua encendida bajo un porche, mandobles y yelmos colgados, cruz roja grabada en la piedra',
  },
  {
    id: 'taller',
    faccion: 'imperio',
    nombre: 'Taller',
    produce: 'Ballesteros, Arcabuceros',
    describe:
      'un taller de armas imperial: casa de entramado con contraventanas amarillas y negras, ballestas y arcabuces en un banco de trabajo bajo un toldo, barriles de pólvora, águila imperial sobre la puerta',
  },
  {
    id: 'armeria',
    faccion: 'imperio',
    nombre: 'Armería',
    produce: 'Coraceros, Rodeleros',
    describe:
      'una armería imperial: edificio de piedra robusto con rejas, armaduras completas expuestas en maniquíes, rodelas apiladas y estandarte amarillo y negro',
  },
  {
    id: 'fundicion',
    faccion: 'imperio',
    nombre: 'Fundición',
    produce: 'Culebrinas (requiere Taller)',
    describe:
      'una fundición de cañones: nave de ladrillo con dos chimeneas altas humeantes, horno con resplandor naranja, moldes y cañones de bronce recién fundidos en el patio',
  },
  {
    id: 'biblioteca',
    faccion: 'imperio',
    nombre: 'Biblioteca',
    produce: 'Magos',
    describe:
      'una biblioteca de magos imperial: torre redonda de piedra con cúpula de cobre verdoso, ventanales con vidrieras azules, telescopio en la azotea y libros apilados',
  },
  {
    id: 'arboleda',
    faccion: 'elfos',
    nombre: 'Arboleda',
    produce: 'Ents',
    describe:
      'una arboleda sagrada élfica: círculo de árboles antiguos con troncos retorcidos y musgo, piedras talladas con runas y un pequeño santuario de madera clara entre las raíces',
  },
  {
    id: 'cubil',
    faccion: 'elfos',
    nombre: 'Cubil',
    produce: 'Hostigadores',
    describe:
      'un cubil élfico: madriguera entre rocas cubiertas de helechos, una cabaña de ramas trenzadas con pieles de lobo y plumas de halcón colgadas, posaderos de cetrería',
  },
  {
    id: 'pabellon-de-caza',
    faccion: 'elfos',
    nombre: 'Pabellón de caza',
    produce: 'Exploradores, Corredores del bosque',
    describe:
      'un pabellón de caza élfico: plataforma de madera elegante sobre pilotes entre árboles, tejado curvo de hojas, arcos y carcajes colgados, astas de ciervo sobre la entrada',
  },
  {
    id: 'cueva',
    faccion: 'orkos',
    nombre: 'Cueva',
    produce: 'Trolls',
    describe:
      'la cueva de los trolls: boca enorme en una roca con cadenas gruesas clavadas, huesos grandes amontonados en la entrada y antorchas toscas',
  },
  {
    id: 'pocilga',
    faccion: 'orkos',
    nombre: 'Pocilga',
    produce: 'Orkos berserker',
    describe:
      'una pocilga orka: cercado de troncos afilados con barro, choza de pieles con cráneos de jabalí, abrevadero sucio y estandarte rojo tosco',
  },
  {
    id: 'totem',
    faccion: 'orkos',
    nombre: 'Tótem',
    produce: 'Goblins fanáticos',
    describe:
      'un tótem orko: poste alto de madera tallado con caras feroces y pintado de rojo, cráneos y huesos atados, barriles de pólvora a su pie y una hoguera',
  },
  {
    id: 'cripta',
    faccion: 'no-muertos',
    nombre: 'Cripta',
    produce: 'Necrófagos, Gólems de huesos',
    describe:
      'una cripta: entrada de piedra negra medio hundida en la tierra, escaleras que bajan a la oscuridad, columnas con calaveras talladas y huesos esparcidos',
  },
  {
    id: 'mausoleo',
    faccion: 'no-muertos',
    nombre: 'Mausoleo',
    produce: 'Espectros',
    describe:
      'un mausoleo gótico de mármol gris: columnas, ángeles de piedra rotos, puerta de hierro entreabierta con una luz verde pálida dentro y lápidas alrededor',
  },
  {
    id: 'torre-oscura',
    faccion: 'no-muertos',
    nombre: 'Torre oscura',
    produce: 'Lich',
    describe:
      'una torre oscura de nigromante: aguja alta y estrecha de piedra negra con ventanas que brillan en verde, cuervos alrededor de la cima y raíces muertas en la base',
  },
];

export function encargoDeEdificio(e: Edificio): Encargo {
  return {
    id: `edificio-${e.id}`,
    tipo: 'imagen',
    descripcion: [
      `Un edificio de la pantalla de ciudad de un juego de estrategia por turnos: ${e.describe}.`,
      'Un único edificio construido, entero y centrado, sobre un pequeño trozo de suelo propio. Cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, como la imagen 1; nunca cenital ni de perfil. La luz viene de arriba a la izquierda.',
      'Estilo de la imagen 1: ilustración pintada de fantasía medieval oscura, materiales gastados. La imagen 2 da la paleta y los motivos de su facción.',
    ].join('\n'),
    referencias: [
      { ruta: MUESTRA_ELEGIDA, papel: 'estilo' },
      { ruta: ESTILO_DE_FACCION[e.faccion], papel: 'estilo' },
    ],
    salida: `assets/edificios/${e.faccion}/${e.id}`,
    fondo: 'transparente',
  };
}

export const encargosDeEdificios = (): Encargo[] => EDIFICIOS.map(encargoDeEdificio);
