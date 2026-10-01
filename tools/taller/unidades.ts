/**
 * Las unidades que pinta el taller, con ids PROVISIONALES: las facciones nuevas
 * todavía no están en el catálogo del juego (llegan en la fase 4). El mapeo de
 * cada id a su unidad de `NuevaJugabilidad.md` está en `docs/art/unidades.md`.
 *
 * De cada unidad salen dos encargos, en este orden:
 *  1. `<id>-identidad`: una lámina con el aspecto, ya a la cámara del juego. Sus
 *     referencias: el maniquí (pose) y la lámina de `assets/art/` (identidad:
 *     aspecto y acabado, nunca cámara, porque está de frente y a la altura de
 *     los ojos).
 *  2. `<id>-atlas`: la hoja de reposo, marcha y ataque: la referencia de pose de
 *     su perfil, la lámina del paso 1 como identidad y la de `assets/art/` como
 *     estilo. Las láminas de `assets/art/` existen para que la animación siga
 *     ese estilo (decisión del usuario, 01-10-2026); el atlas de Liora ya no es
 *     referencia de nada.
 */
import type { Perfil } from '../art/poses.js';
import type { Encargo } from './encargo.js';

export interface Unidad {
  readonly id: string;
  readonly faccion: 'templarios' | 'no-muertos';
  /** El nombre en `NuevaJugabilidad.md`. */
  readonly nombre: string;
  readonly perfil: Perfil;
  /**
   * La lámina de referencia de `assets/art/`: fija el aspecto Y el estilo que
   * tienen que seguir la identidad y la animación (decisión del usuario). Los
   * héroes no la tienen: su aspecto sale de la descripción y su estilo, de la
   * lámina de su facción (`ESTILO_DE_FACCION`).
   */
  readonly concepto?: string;
  /** Altura en la celda; por defecto la de un adulto (160). */
  readonly altura?: number;
  /** El aspecto. La cámara, la pose y el fondo los pone el taller. */
  readonly aspecto: string;
}

const PINTURA =
  'Estilo: el de la lámina de referencia de la unidad —ilustración pintada de fantasía medieval oscura, materiales gastados y creíbles, paleta sobria, silueta clara—; nada de acabado de juguete, de dibujo animado ni de render 3D.';

export const UNIDADES: readonly Unidad[] = [
  {
    id: 'templario-escudo',
    faccion: 'templarios',
    nombre: 'Guerrero con escudo',
    perfil: 'espada-escudo',
    concepto: 'assets/art/templarios/guerrero-con-escudo.png',
    aspecto:
      'Un templario de infantería: armadura de placas sobre cota de malla, sobrevesta blanca con cruz roja, yelmo cerrado de cubo, escudo de cometa con cruz roja en el brazo izquierdo y espada de una mano en la derecha.',
  },
  {
    id: 'templario-mandoble',
    faccion: 'templarios',
    nombre: 'Guerrero con arma a dos manos',
    perfil: 'dos-manos',
    concepto: 'assets/art/templarios/guerrero-con-arma-a-dos-manos.png',
    aspecto:
      'Un templario pesado: armadura de placas, sobrevesta blanca con cruz roja, capa corta roja, yelmo abierto de casquete y mandoble largo empuñado con las dos manos. Sin escudo.',
  },
  {
    id: 'templario-monje',
    faccion: 'templarios',
    nombre: 'Monje',
    perfil: 'baston',
    concepto: 'assets/art/templarios/monje.png',
    aspecto:
      'Un monje sanador: hábito de lana cruda con escapulario y cruz roja, tonsura, bolsa de vendas y hierbas al cinto, bastón alto de madera rematado en cruz en la mano derecha.',
  },
  {
    id: 'templario-escudero',
    faccion: 'templarios',
    nombre: 'Escudero',
    perfil: 'espada-escudo',
    concepto: 'assets/art/templarios/escudero.png',
    altura: 150,
    aspecto:
      'Un escudero joven y ligero: capacete de ala, jubón acolchado con sobrevesta corta y cruz roja pequeña, mochila con cuerda y equipo de repuesto a la espalda, lanza en la mano derecha. Sin escudo.',
  },
  {
    id: 'templario-hermano-de-carga',
    faccion: 'templarios',
    nombre: 'Hermano de carga (antes Caballero montado)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/templarios/caballero-montado.png',
    altura: 166,
    aspecto:
      'Un hermano de carga, A PIE y sin caballo: la armadura de placas completa del jinete del concepto, sobrevesta blanca con cruz roja, yelmo con penacho rojo, lanza de carga en la mano derecha y escudo de cometa en la izquierda. Corpulento, en actitud de embestir.',
  },
  {
    id: 'templario-penitente',
    faccion: 'templarios',
    nombre: 'Penitente',
    perfil: 'dos-manos',
    concepto: 'assets/art/templarios/penitente.png',
    aspecto:
      'Un penitente flagelante sin armadura: capirote de tela áspera que le tapa la cara, torso desnudo y marcado, faldón de arpillera con tiras rojas, pies descalzos, mayal de bola de pinchos.',
  },
  {
    id: 'esqueleto-guerrero',
    faccion: 'no-muertos',
    nombre: 'Esqueleto guerrero',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/esqueleto-guerrero.png',
    aspecto:
      'Un esqueleto guerrero: huesos amarillentos, cota de malla oxidada y yelmo abollado, escudo redondo de madera en el brazo izquierdo y espada mellada en la derecha.',
  },
  {
    id: 'esqueleto-arquero',
    faccion: 'no-muertos',
    nombre: 'Esqueleto arquero',
    perfil: 'arco',
    concepto: 'assets/art/no-muertos/esqueleto-arquero.png',
    aspecto:
      'Un esqueleto arquero: huesos amarillentos, capucha y harapos oscuros, carcaj a la espalda y arco largo en la mano izquierda.',
  },
  {
    id: 'zombi',
    faccion: 'no-muertos',
    nombre: 'Zombie',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/zombie.png',
    altura: 158,
    aspecto:
      'Un zombi campesino: piel gris verdosa, camisa y calzas de labriego hechas jirones, encorvado, una horca de labranza en la mano derecha.',
  },
  {
    id: 'necrofago',
    faccion: 'no-muertos',
    nombre: 'Necrófago (Ghoul)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/necrofago.png',
    altura: 140,
    aspecto:
      'Un necrófago: humanoide flaco y encorvado sobre DOS piernas, piel cenicienta tirante sobre las costillas, garras largas, taparrabos de harapos, boca de dientes afilados. Sin armas.',
  },
  {
    id: 'espectro',
    faccion: 'no-muertos',
    nombre: 'Espectro',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/espectro.png',
    aspecto:
      'Un espectro: figura encapuchada con armadura fantasmal y túnica de jirones verde grisáceo que se deshace hacia los pies, rostro oculto en sombra, espada larga en la mano derecha. Pintado OPACO, sin transparencias: lo fantasmal lo dan los colores pálidos y los jirones.',
  },
  {
    id: 'golem-de-huesos',
    faccion: 'no-muertos',
    nombre: 'Gólem de huesos',
    perfil: 'dos-manos',
    concepto: 'assets/art/no-muertos/golem-de-huesos.png',
    altura: 200,
    aspecto:
      'Un gólem de huesos: coloso de huesos atados con cadenas y bandas de hierro, costillar con un resplandor verde, cráneo astado como cabeza, puños enormes de huesos. Sin armas.',
  },
];

/**
 * Los cuatro héroes de cada facción. Sin lámina propia en `assets/art/`: su
 * aspecto lo da la descripción y su acabado, la lámina de referencia de la
 * tropa más representativa de su facción. Un poco más altos que la tropa.
 */
export const HEROES: readonly Unidad[] = [
  {
    id: 'heroe-templario-caballero',
    faccion: 'templarios',
    nombre: 'Caballero (héroe)',
    perfil: 'espada-escudo',
    altura: 168,
    aspecto:
      'Un caballero templario veterano, líder de primera línea: armadura de placas completa y cuidada con filos dorados, sobrevesta blanca impecable con gran cruz roja, capa blanca corta, yelmo abierto con nasal que deja ver un rostro curtido de barba gris, escudo de cometa con cruz roja y espada larga de una mano.',
  },
  {
    id: 'heroe-templario-abad',
    faccion: 'templarios',
    nombre: 'Monje (Abad), héroe',
    perfil: 'baston',
    altura: 166,
    aspecto:
      'Un abad templario, sanador y protector: hábito blanco de buen paño con estola roja bordada y cruz roja al pecho, cota de malla asomando por las mangas, cabeza tonsurada y barba blanca, báculo de abad de madera oscura rematado en cruz de latón con un incensario colgando.',
  },
  {
    id: 'heroe-templario-inquisidor',
    faccion: 'templarios',
    nombre: 'Inquisidor (héroe)',
    perfil: 'espada-escudo',
    altura: 166,
    aspecto:
      'Un inquisidor, cazador de magos y no muertos: sombrero de ala ancha negro, abrigo largo de cuero negro sobre coraza ligera, sobrevesta corta blanca con cruz roja, sello y rosario al cinto, maza de pinchos de una mano en la derecha y un pequeño libro sagrado encadenado en la izquierda. Sin escudo.',
  },
  {
    id: 'heroe-templario-gran-maestre',
    faccion: 'templarios',
    nombre: 'Gran Maestre (héroe)',
    perfil: 'dos-manos',
    altura: 172,
    aspecto:
      'El Gran Maestre de la orden: armadura de placas ornamentada con grabados dorados, sobrevesta blanca larga con cruz roja grande, manto blanco con forro rojo, corona de hierro sobre el yelmo abierto, rostro severo de barba blanca, gran espadón ceremonial empuñado a dos manos.',
  },
  {
    id: 'heroe-nigromante',
    faccion: 'no-muertos',
    nombre: 'Nigromante (héroe)',
    perfil: 'baston',
    altura: 166,
    aspecto:
      'Un nigromante: túnica larga negra y morada raída, capucha echada hacia atrás, rostro pálido y demacrado, collar de huesos de dedos, bastón de madera negra rematado en un cráneo con un tenue brillo verde en las cuencas.',
  },
  {
    id: 'heroe-vampiro',
    faccion: 'no-muertos',
    nombre: 'Vampiro (héroe)',
    perfil: 'espada-escudo',
    altura: 166,
    aspecto:
      'Un señor vampiro: noble de piel muy pálida y pelo negro largo, jubón de terciopelo granate con bordados negros, coraza ligera negra, capa negra de cuello alto con forro rojo, ropera fina de una mano en la derecha y la mano izquierda libre con garras. Sin escudo.',
  },
  {
    id: 'heroe-lich',
    faccion: 'no-muertos',
    nombre: 'Lich (héroe)',
    perfil: 'baston',
    altura: 168,
    aspecto:
      'Un lich: esqueleto de mago con corona de hierro oxidada, túnica ceremonial negra y verde podrida con hilos de oro deshilachados, manos huesudas con anillos, filacteria colgada al cuello, bastón alto de hueso rematado en una gema verde.',
  },
  {
    id: 'heroe-caballero-de-la-muerte',
    faccion: 'no-muertos',
    nombre: 'Caballero de la muerte (héroe)',
    perfil: 'dos-manos',
    altura: 172,
    aspecto:
      'Un caballero de la muerte, contrapunto oscuro del templario: armadura de placas negra y abollada con remaches de hierro, sobrevesta negra hecha jirones con una cruz rota desteñida, yelmo cerrado con cuernos cortos y un brillo verde frío tras la visera, gran espadón mellado empuñado a dos manos.',
  },
];

/** La lámina de `assets/art/` que da el acabado a un héroe de cada facción. */
export const ESTILO_DE_FACCION: Readonly<Record<Unidad['faccion'], string>> = {
  templarios: 'assets/art/templarios/guerrero-con-escudo.png',
  'no-muertos': 'assets/art/no-muertos/esqueleto-guerrero.png',
};

export function unidad(id: string): Unidad {
  const todas = [...UNIDADES, ...HEROES];
  const u = todas.find((x) => x.id === id);
  if (u === undefined) {
    throw new Error(`no hay unidad «${id}». Hay: ${todas.map((x) => x.id).join(', ')}`);
  }
  return u;
}

export const rutaIdentidad = (u: Unidad): string => `assets/unidades/${u.id}/identidad`;
export const rutaAtlas = (u: Unidad): string => `assets/unidades/${u.id}/atlas`;
export const rutaPoses = (u: Unidad): string => `assets/unidades/_poses/${u.perfil}.png`;

export function encargoDeIdentidad(u: Unidad): Encargo {
  return {
    id: `${u.id}-identidad`,
    tipo: 'identidad',
    descripcion: `${u.aspecto}\n${PINTURA}`,
    referencias: [
      { ruta: rutaPoses(u), papel: 'pose' },
      u.concepto === undefined
        ? { ruta: ESTILO_DE_FACCION[u.faccion], papel: 'estilo' }
        : { ruta: u.concepto, papel: 'identidad' },
    ],
    salida: rutaIdentidad(u),
    fondo: 'transparente',
  };
}

export function encargoDeAtlas(u: Unidad): Encargo {
  return {
    id: `${u.id}-atlas`,
    tipo: 'atlas',
    descripcion: `${u.aspecto}\n${PINTURA}`,
    referencias: [
      { ruta: rutaPoses(u), papel: 'pose' },
      { ruta: `${rutaIdentidad(u)}.webp`, papel: 'identidad' },
      { ruta: u.concepto ?? ESTILO_DE_FACCION[u.faccion], papel: 'estilo' },
    ],
    salida: rutaAtlas(u),
    fondo: 'transparente',
    ...(u.altura === undefined ? {} : { alturaObjetivo: u.altura }),
  };
}
