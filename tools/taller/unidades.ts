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
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { FaccionDeArena } from '../../src/core/arena.js';
import { NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import { carpetaDePoses, JUEGOS_DE_ARMAS, type JuegoEn8d, type Perfil } from '../art/poses.js';
import type { Encargo } from './encargo.js';

export interface Unidad {
  readonly id: string;
  /** Las cinco facciones se declaran en `src/core/arena.ts`, que es quien las valida al guardar. */
  readonly faccion: FaccionDeArena;
  /** El nombre en `NuevaJugabilidad.md`. */
  readonly nombre: string;
  /**
   * La hoja de pose: uno de los perfiles de `poses.ts` (sprite-forge), o
   * `montado-lanza`, la del jinete que renderiza `tools/art/montura.ts`.
   */
  readonly perfil: Perfil | 'montado-lanza';
  /**
   * La lámina de referencia de `assets/art/`: fija el aspecto Y el estilo que
   * tienen que seguir la identidad y la animación (decisión del usuario). Los
   * héroes no la tienen: su aspecto sale de la descripción y su estilo, de la
   * lámina de su facción (`ESTILO_DE_FACCION`).
   */
  readonly concepto?: string;
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
    aspecto:
      'Un escudero joven y ligero: capacete de ala, jubón acolchado con sobrevesta corta y cruz roja pequeña, mochila con cuerda y equipo de repuesto a la espalda, lanza en la mano derecha. Sin escudo.',
  },
  {
    id: 'templario-hermano-de-carga',
    faccion: 'templarios',
    nombre: 'Hermano de carga (montado; antes Caballero montado)',
    perfil: 'montado-lanza',
    concepto: 'assets/art/templarios/caballero-montado.png',
    aspecto:
      'Un hermano de carga templario A CABALLO, como el jinete del concepto: armadura de placas completa, sobrevesta blanca con cruz roja, yelmo cerrado con penacho rojo, escudo de cometa blanco con cruz roja en el brazo izquierdo y lanza de carga en la mano derecha para la carga y espada de una mano para el combate parado. El caballo, castaño, lleva gualdrapa blanca con cruces rojas. Jinete y caballo son UNA sola figura.',
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
    aspecto:
      'Un zombi campesino: piel gris verdosa, camisa y calzas de labriego hechas jirones, encorvado, una horca de labranza en la mano derecha.',
  },
  {
    id: 'necrofago',
    faccion: 'no-muertos',
    nombre: 'Necrófago (Ghoul)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/necrofago.png',
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
    aspecto:
      'Un gólem de huesos: coloso de huesos atados con cadenas y bandas de hierro, costillar con un resplandor verde, cráneo astado como cabeza, puños enormes de huesos. Sin armas.',
  },
  {
    id: 'imperio-alabardero',
    faccion: 'imperio',
    nombre: 'Alabardero',
    perfil: 'dos-manos',
    concepto: 'assets/art/imperio/alabardero.png',
    aspecto:
      'Un alabardero lansquenete: morrión de acero, peto, mangas y calzas acuchilladas a franjas amarillas y negras con forros rojos, alabarda empuñada a dos manos y espada corta al cinto.',
  },
  {
    id: 'imperio-piquero',
    faccion: 'imperio',
    nombre: 'Piquero',
    perfil: 'dos-manos',
    concepto: 'assets/art/imperio/piquero.png',
    aspecto:
      'Un piquero lansquenete: morrión, peto de acero, ropa acuchillada a franjas amarillas y negras, pica larga (una vez y media su altura) empuñada a dos manos, inclinada y nunca más larga que eso.',
  },
  {
    id: 'imperio-ballestero',
    faccion: 'imperio',
    nombre: 'Ballestero',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/ballestero.png',
    aspecto:
      'Un ballestero: capacete, jubón acolchado amarillo y negro con mangas rojas, gran pavés con el águila imperial a la espalda, ballesta de acero empuñada con las dos manos y carcaj de virotes al cinto.',
  },
  {
    id: 'imperio-coracero',
    faccion: 'imperio',
    nombre: 'Coracero',
    perfil: 'espada-escudo',
    concepto: 'assets/art/imperio/coracero.png',
    aspecto:
      'Un coracero: armadura de placas pesada y oscura casi completa, banda roja cruzada al pecho, borgoñota cerrada, espada de lazo de una mano. Sin escudo. Muy duro y lento.',
  },
  {
    id: 'imperio-arcabucero',
    faccion: 'imperio',
    nombre: 'Arcabucero',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/arcabucero.png',
    aspecto:
      'Un arcabucero: sombrero de ala ancha con pluma roja, jubón acuchillado amarillo y negro, bandolera de cargas, banda roja a la cintura, arcabuz de mecha empuñado con las dos manos y la horquilla colgada.',
  },
  {
    id: 'imperio-rodelero',
    faccion: 'imperio',
    nombre: 'Rodelero',
    perfil: 'espada-escudo',
    concepto: 'assets/art/imperio/rodelero.png',
    aspecto:
      'Un rodelero: morrión con pluma roja, peto de acero, ropa acuchillada roja y negra, rodela de acero redonda en el brazo izquierdo y espada ropera en la derecha.',
  },
  {
    id: 'imperio-artillero-culebrina',
    faccion: 'imperio',
    nombre: 'Artillero con culebrina',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/artillero-con-culebrina.png',
    aspecto:
      'Un artillero: gorra de lana, mandil de cuero tiznado sobre ropa amarilla y negra, guantes gruesos, culebrina de mano (cañón largo y ligero de bronce con culata de madera) empuñada con las dos manos, bolsa de pólvora y botafuego al cinto. Sin cureña.',
  },
  {
    id: 'elfo-arquero',
    faccion: 'elfos',
    nombre: 'Arquero',
    perfil: 'arco',
    concepto: 'assets/art/elfos/arquero.png',
    aspecto:
      'Una arquera elfa: pelo plateado trenzado, armadura ligera de cuero con escamas de hoja, capa verde musgo hecha jirones, carcaj a la espalda y arco largo élfico de madera clara.',
  },
  {
    id: 'elfo-explorador',
    faccion: 'elfos',
    nombre: 'Explorador',
    perfil: 'espada-escudo',
    concepto: 'assets/art/elfos/explorador.png',
    aspecto:
      'Un explorador elfo: capucha y capa de camuflaje hecha de hojas secas, máscara de tela, ropa de cuero oscuro, dos cuchillos curvos, uno en cada mano, arco corto a la espalda. Agazapado.',
  },
  {
    id: 'elfo-guardia-del-bosque',
    faccion: 'elfos',
    nombre: 'Guardia del bosque',
    perfil: 'espada-escudo',
    concepto: 'assets/art/elfos/guardia-del-bosque.png',
    aspecto:
      'Un guardia del bosque elfo: armadura de escamas en forma de hoja verde oliva, yelmo alto con alas de hoja, capa verde, escudo oval de madera tallada en el brazo izquierdo y lanza larga élfica en la derecha.',
  },
  {
    id: 'elfo-corredor-del-bosque',
    faccion: 'elfos',
    nombre: 'Corredores del bosque (antes Jinetes de ciervo)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/elfos/jinete-de-ciervo.png',
    aspecto:
      'Un corredor del bosque elfo, A PIE y sin montura: el jinete del concepto bajado del ciervo, ligero y veloz, armadura de cuero con hojas, capa verde al viento, pelo rubio largo, lanza corta en la derecha y escudo redondo pequeño en la izquierda.',
  },
  {
    id: 'elfo-ent',
    faccion: 'elfos',
    nombre: 'Ent o Guardián arbóreo',
    perfil: 'dos-manos',
    concepto: 'assets/art/elfos/ent-guardian-arboreo.png',
    aspecto:
      'Un ent, guardián arbóreo: gigante de corteza y raíces retorcidas, musgo y ramas en la cabeza, cuerpo de tronco nudoso, brazos largos con manos de raíz. Sin armas. Muy lento y muy duro.',
  },
  {
    id: 'elfo-hostigador',
    faccion: 'elfos',
    nombre: 'Hostigador elfo (antes Halcón o Lobo)',
    perfil: 'espada-escudo',
    aspecto:
      'Un hostigador elfo, tropa barata y rápida: capa de piel de lobo gris con la cabeza del lobo como capucha, plumas de halcón trenzadas en el pelo, ropa de cuero ligera, jabalina corta en la mano derecha y otras dos a la espalda.',
  },
  {
    id: 'orko-hacha-escudo',
    faccion: 'orkos',
    nombre: 'Orko con hacha y escudo',
    perfil: 'espada-escudo',
    concepto: 'assets/art/orkos/orko-con-hacha-y-escudo.png',
    aspecto:
      'Un orko de piel verde oliva: colmillos, pelo negro recogido, armadura de cuero y placas oxidadas con pieles, faldón de cuero, escudo redondo de madera reforzado en la izquierda y hacha de una mano en la derecha.',
  },
  {
    id: 'orko-dos-armas',
    faccion: 'orkos',
    nombre: 'Orko con dos armas',
    perfil: 'dos-manos',
    concepto: 'assets/art/orkos/orko-con-dos-armas.png',
    aspecto:
      'Un orko de piel verde, torso casi desnudo con pinturas de guerra rojas, hombrera de pinchos, faldón de pieles, una cuchilla tosca en cada mano. Sin defensa, rugiendo.',
  },
  {
    id: 'goblin-lancero',
    faccion: 'orkos',
    nombre: 'Goblin lancero',
    perfil: 'espada-escudo',
    concepto: 'assets/art/orkos/goblin-lancero.png',
    aspecto:
      'Un goblin lancero: pequeño y flaco, piel verde amarillenta, orejas largas, casco de hierro abollado, harapos, escudo redondo pequeño en la izquierda y lanza larga en la derecha.',
  },
  {
    id: 'goblin-arquero',
    faccion: 'orkos',
    nombre: 'Goblin arquero',
    perfil: 'arco',
    concepto: 'assets/art/orkos/goblin-arquero.png',
    aspecto:
      'Un goblin arquero: pequeño, piel verde amarillenta, capucha y pañuelo rojos tapándole la boca, harapos de cuero, carcaj de flechas a la espalda, arco corto tosco.',
  },
  {
    id: 'troll-maza',
    faccion: 'orkos',
    nombre: 'Troll con maza',
    perfil: 'dos-manos',
    concepto: 'assets/art/orkos/troll-con-maza.png',
    aspecto:
      'Un troll: gigante de piel gris azulada con musgo, cabeza pequeña, colmillos, grilletes rotos con cadenas en las muñecas, taparrabos, maza de madera con clavos de hierro empuñada a dos manos.',
  },
  {
    id: 'orko-berserker',
    faccion: 'orkos',
    nombre: 'Orko berserker (antes Jinete de jabalí)',
    perfil: 'dos-manos',
    concepto: 'assets/art/orkos/jinete-de-jabali.png',
    aspecto:
      'Un orko berserker, A PIE y sin montura: el jinete del concepto bajado del jabalí, armadura de cuero con trofeos de cráneo y pinturas rojas, sin escudo, hacha grande empuñada a dos manos, enloquecido.',
  },
  {
    id: 'goblin-fanatico',
    faccion: 'orkos',
    nombre: 'Goblin fanático',
    perfil: 'espada-escudo',
    concepto: 'assets/art/orkos/goblin-fanatico.png',
    aspecto:
      'Un goblin fanático: pequeño, sonrisa enloquecida, pañuelo rojo en la cabeza, harapos, dos barriles de pólvora atados a la espalda con la mecha encendida, una bomba en la mano derecha. Sin armas.',
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
    aspecto:
      'Un caballero templario veterano, líder de primera línea: armadura de placas completa y cuidada con filos dorados, sobrevesta blanca impecable con gran cruz roja, capa blanca corta, yelmo abierto con nasal que deja ver un rostro curtido de barba gris, escudo de cometa con cruz roja y espada larga de una mano.',
  },
  {
    id: 'heroe-templario-abad',
    faccion: 'templarios',
    nombre: 'Monje (Abad), héroe',
    perfil: 'baston',
    aspecto:
      'Un abad templario, sanador y protector: hábito blanco de buen paño con estola roja bordada y cruz roja al pecho, cota de malla asomando por las mangas, cabeza tonsurada y barba blanca, báculo de abad de madera oscura rematado en cruz de latón con un incensario colgando.',
  },
  {
    id: 'heroe-templario-inquisidor',
    faccion: 'templarios',
    nombre: 'Inquisidor (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un inquisidor, cazador de magos y no muertos: sombrero de ala ancha negro, abrigo largo de cuero negro sobre coraza ligera, sobrevesta corta blanca con cruz roja, sello y rosario al cinto, maza de pinchos de una mano en la derecha y un pequeño libro sagrado encadenado en la izquierda. Sin escudo.',
  },
  {
    id: 'heroe-templario-gran-maestre',
    faccion: 'templarios',
    nombre: 'Gran Maestre (héroe)',
    perfil: 'dos-manos',
    aspecto:
      'El Gran Maestre de la orden: armadura de placas ornamentada con grabados dorados, sobrevesta blanca larga con cruz roja grande, manto blanco con forro rojo, corona de hierro sobre el yelmo abierto, rostro severo de barba blanca, gran espadón ceremonial empuñado a dos manos.',
  },
  {
    id: 'heroe-nigromante',
    faccion: 'no-muertos',
    nombre: 'Nigromante (héroe)',
    perfil: 'baston',
    aspecto:
      'Un nigromante: túnica larga negra y morada raída, capucha echada hacia atrás, rostro pálido y demacrado, collar de huesos de dedos, bastón de madera negra rematado en un cráneo con un tenue brillo verde en las cuencas.',
  },
  {
    id: 'heroe-vampiro',
    faccion: 'no-muertos',
    nombre: 'Vampiro (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un señor vampiro: noble de piel muy pálida y pelo negro largo, jubón de terciopelo granate con bordados negros, coraza ligera negra, capa negra de cuello alto con forro rojo, ropera fina de una mano en la derecha y la mano izquierda libre con garras. Sin escudo.',
  },
  {
    id: 'heroe-lich',
    faccion: 'no-muertos',
    nombre: 'Lich (héroe)',
    perfil: 'baston',
    aspecto:
      'Un lich: esqueleto de mago con corona de hierro oxidada, túnica ceremonial negra y verde podrida con hilos de oro deshilachados, manos huesudas con anillos, filacteria colgada al cuello, bastón alto de hueso rematado en una gema verde.',
  },
  {
    id: 'heroe-caballero-de-la-muerte',
    faccion: 'no-muertos',
    nombre: 'Caballero de la muerte (héroe)',
    perfil: 'dos-manos',
    aspecto:
      'Un caballero de la muerte, contrapunto oscuro del templario: armadura de placas negra y abollada con remaches de hierro, sobrevesta negra hecha jirones con una cruz rota desteñida, yelmo cerrado con cuernos cortos y un brillo verde frío tras la visera, gran espadón mellado empuñado a dos manos.',
  },
  {
    id: 'heroe-imperio-noble',
    faccion: 'imperio',
    nombre: 'Noble (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un noble imperial: sombrero de ala con plumas, jubón de terciopelo negro y oro, gorguera, coraza ligera grabada, banda roja de mando, ropera en la derecha y bastón de mando en la izquierda.',
  },
  {
    id: 'heroe-imperio-mago',
    faccion: 'imperio',
    nombre: 'Mago de batalla (héroe)',
    perfil: 'baston',
    aspecto:
      'Un mago de batalla imperial: túnica larga azul oscuro con ribetes dorados sobre coraza ligera, birrete, barba recortada, libro atado al cinto, bastón de metal rematado en una esfera con llamas.',
  },
  {
    id: 'heroe-imperio-capitan-mercenario',
    faccion: 'imperio',
    nombre: 'Capitán mercenario (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un capitán mercenario lansquenete: sombrero enorme con plumas rojas y amarillas, ropa acuchillada llamativa, peto de acero abollado, bigote, espada katzbalger en la derecha y una bolsa de monedas al cinto. Sin escudo.',
  },
  {
    id: 'heroe-imperio-ingeniero',
    faccion: 'imperio',
    nombre: 'Ingeniero (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un ingeniero imperial: gafas de latón sobre la frente, mandil de cuero con herramientas, jubón amarillo y negro, rollo de planos a la espalda, martillo de guerra de una mano en la derecha.',
  },
  {
    id: 'heroe-elfo-danzante-de-espadas',
    faccion: 'elfos',
    nombre: 'Danzante de espadas (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un danzante de espadas elfo: pelo blanco largo recogido, armadura ligera de escamas de hoja dorada, faldones de tela verde que vuelan, una espada élfica curva en cada mano. Ágil y elegante.',
  },
  {
    id: 'heroe-elfo-druida',
    faccion: 'elfos',
    nombre: 'Druida (héroe)',
    perfil: 'baston',
    aspecto:
      'Una druida elfa: túnica de hojas y musgo, corona de astas pequeñas y flores, pelo largo cobrizo, bastón retorcido de madera viva con brotes verdes y una luz verde en la punta.',
  },
  {
    id: 'heroe-elfo-senor-de-las-bestias',
    faccion: 'elfos',
    nombre: 'Señor de las bestias (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un señor de las bestias elfo: capa de piel de oso, cuernos de ciervo en el yelmo de cuero, pinturas de guerra verdes, un halcón posado en el hombro, lanza de caza en la derecha.',
  },
  {
    id: 'heroe-elfo-cantora',
    faccion: 'elfos',
    nombre: 'Cantora (héroe)',
    perfil: 'baston',
    aspecto:
      'Una cantora elfa: vestido largo verde y plata, diadema de hojas de plata, pelo rubio muy largo, arpa pequeña de madera clara sujeta en el brazo izquierdo y la mano derecha alzada.',
  },
  {
    id: 'heroe-orko-kaudillo',
    faccion: 'orkos',
    nombre: 'Kaudillo (héroe)',
    perfil: 'dos-manos',
    aspecto:
      'Un kaudillo orko enorme: armadura de placas de chatarra con pinchos y cráneos, capa de piel de lobo, cuernos en el casco, cicatrices, gran cuchilla de carnicero empuñada a dos manos.',
  },
  {
    id: 'heroe-goblin-jefe',
    faccion: 'orkos',
    nombre: 'Jefe goblin (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un jefe goblin: pequeño y astuto, corona torcida de latón, capa roja raída demasiado grande, muchos amuletos, daga envenenada en la derecha y una trampa de cepo colgando del cinto.',
  },
  {
    id: 'heroe-orko-chaman',
    faccion: 'orkos',
    nombre: 'Chamán (héroe)',
    perfil: 'baston',
    aspecto:
      'Un chamán orko: tocado de plumas y cráneo de animal, collares de huesos y dientes, pinturas blancas, pieles, bastón nudoso con una calavera en llamas verdes.',
  },
  {
    id: 'heroe-orko-senor-de-la-guerra',
    faccion: 'orkos',
    nombre: 'Señor de la guerra a pie (héroe)',
    perfil: 'dos-manos',
    aspecto:
      'Un señor de la guerra orko, A PIE y sin montura: corpulento, armadura pesada de chatarra con trofeos, estandarte pequeño de guerra atado a la espalda, hacha a dos manos enorme. Carga brutal.',
  },
];

/** La lámina de `assets/art/` que da el acabado a un héroe de cada facción. */
export const ESTILO_DE_FACCION: Readonly<Record<Unidad['faccion'], string>> = {
  templarios: 'assets/art/templarios/guerrero-con-escudo.png',
  'no-muertos': 'assets/art/no-muertos/esqueleto-guerrero.png',
  imperio: 'assets/art/imperio/rodelero.png',
  elfos: 'assets/art/elfos/guardia-del-bosque.png',
  orkos: 'assets/art/orkos/orko-con-hacha-y-escudo.png',
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

/**
 * El juego de armas del Y Bot de cada unidad, **por lo que lleva en la mano** y
 * no por su perfil de poses (decisión del usuario, vuelta 1 de QA de las 8
 * direcciones): con el perfil, el piquero salía con mandoble y el goblin lancero
 * con espada y escudo, porque el perfil se eligió para pintar una hoja de una
 * dirección y no para decir qué arma lleva. La regla con la que se rellenó, fila
 * a fila contra el `aspecto` de cada unidad:
 *  - pica, alabarda, lanza o jabalina → `lanza` (también la horca del zombi);
 *  - bastón o báculo de monje, mago, chamán, druida, nigromante o liche → `baston`;
 *  - mandoble, hacha o cuchilla empuñada a dos manos → `dos-manos`;
 *  - maza (y el martillo de guerra del ingeniero) → `maza`; mayal → `mayal`;
 *  - a caballo con lanza → `montado-lanza`;
 *  - el resto —espada, hacha de una mano, dos armas, cuchillos, sin armas, y los
 *    arqueros, ballesteros, arcabuceros y el artillero, que no tienen render de
 *    arco en 8 direcciones— → `espada-escudo`.
 * Una fila por unidad, ni una más ni una menos: lo exige `taller.test.ts`, y
 * `juegoDelYBot` lanza con una unidad que no la tenga en vez de adivinarla.
 */
export const JUEGO_DEL_YBOT: Readonly<Record<string, JuegoEn8d>> = {
  'templario-escudo': 'espada-escudo',
  'templario-mandoble': 'dos-manos',
  'templario-monje': 'baston',
  'templario-escudero': 'lanza',
  'templario-hermano-de-carga': 'montado-lanza',
  'templario-penitente': 'mayal',
  'esqueleto-guerrero': 'espada-escudo',
  'esqueleto-arquero': 'espada-escudo',
  zombi: 'lanza',
  necrofago: 'espada-escudo',
  espectro: 'espada-escudo',
  'golem-de-huesos': 'espada-escudo',
  'imperio-alabardero': 'lanza',
  'imperio-piquero': 'lanza',
  'imperio-ballestero': 'espada-escudo',
  'imperio-coracero': 'espada-escudo',
  'imperio-arcabucero': 'espada-escudo',
  'imperio-rodelero': 'espada-escudo',
  'imperio-artillero-culebrina': 'espada-escudo',
  'elfo-arquero': 'espada-escudo',
  'elfo-explorador': 'espada-escudo',
  'elfo-guardia-del-bosque': 'lanza',
  'elfo-corredor-del-bosque': 'lanza',
  'elfo-ent': 'espada-escudo',
  'elfo-hostigador': 'lanza',
  'orko-hacha-escudo': 'espada-escudo',
  'orko-dos-armas': 'espada-escudo',
  'goblin-lancero': 'lanza',
  'goblin-arquero': 'espada-escudo',
  'troll-maza': 'maza',
  'orko-berserker': 'dos-manos',
  'goblin-fanatico': 'espada-escudo',
  'heroe-templario-caballero': 'espada-escudo',
  'heroe-templario-abad': 'baston',
  'heroe-templario-inquisidor': 'maza',
  'heroe-templario-gran-maestre': 'dos-manos',
  'heroe-nigromante': 'baston',
  'heroe-vampiro': 'espada-escudo',
  'heroe-lich': 'baston',
  'heroe-caballero-de-la-muerte': 'dos-manos',
  'heroe-imperio-noble': 'espada-escudo',
  'heroe-imperio-mago': 'baston',
  'heroe-imperio-capitan-mercenario': 'espada-escudo',
  'heroe-imperio-ingeniero': 'maza',
  'heroe-elfo-danzante-de-espadas': 'espada-escudo',
  'heroe-elfo-druida': 'baston',
  'heroe-elfo-senor-de-las-bestias': 'lanza',
  'heroe-elfo-cantora': 'espada-escudo',
  'heroe-orko-kaudillo': 'dos-manos',
  'heroe-goblin-jefe': 'espada-escudo',
  'heroe-orko-chaman': 'baston',
  'heroe-orko-senor-de-la-guerra': 'dos-manos',
};

/**
 * El juego de armas del Y Bot con el que se pinta una unidad: su fila de
 * `JUEGO_DEL_YBOT`. Sin fila lanza, porque la alternativa —caer en espada y
 * escudo— es justo el fallo que la tabla vino a quitar, dicho en silencio.
 */
export function juegoDelYBot(u: Unidad): JuegoEn8d {
  const juego = JUEGO_DEL_YBOT[u.id];
  if (juego === undefined)
    throw new Error(
      `${u.id} no tiene juego de armas del Y Bot: añade su fila a JUEGO_DEL_YBOT (tools/taller/unidades.ts) según el arma que lleva`,
    );
  return juego;
}

/**
 * Las unidades definitivas, en 8 direcciones con 6 acciones (`OCHO_DIRECCIONES`
 * en `tools/art/poses.ts`), y el juego de armas de cada una: sus poses son las de
 * ese juego (`JUEGOS_DE_ARMAS`). El juego no se escribe aquí otra vez: es el de
 * `JUEGO_DEL_YBOT`, porque el arte propio se pinta sobre las poses del mismo
 * juego con el que la unidad se pinta mientras no lo tiene.
 */
const IDS_EN_OCHO_DIRECCIONES = [
  'templario-escudo',
  'templario-mandoble',
  'templario-monje',
  'templario-escudero',
  'templario-penitente',
  'heroe-templario-caballero',
  'heroe-templario-abad',
  'heroe-templario-inquisidor',
  'heroe-templario-gran-maestre',
  // Su referencia sale de `tools/art/montura.ts --8d`, no de sprite-forge.
  'templario-hermano-de-carga',
] as const;

export const EN_OCHO_DIRECCIONES: Readonly<Record<string, JuegoEn8d>> = Object.fromEntries(
  IDS_EN_OCHO_DIRECCIONES.map((id) => [id, juegoDelYBot(unidad(id))]),
);

/** Los juegos de armas con poses del Y Bot en 8 direcciones (`JuegoEn8d`). */
export const JUEGOS_EN_8D: readonly JuegoEn8d[] = [
  ...(Object.keys(JUEGOS_DE_ARMAS) as (keyof typeof JUEGOS_DE_ARMAS)[]),
  'montado-lanza',
];

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * ¿Tiene la unidad su arte propio en las ocho direcciones —`dN/atlas.json` y
 * `dN/atlas.webp` en cada una—? `true` con las ocho y `false` sin ninguna. Con
 * algunas **lanza**, nombrando las que faltan: una figura no mezcla las luces de
 * dos artes, así que con siete se pintaría entera con el Y Bot, y eso tiene que
 * decirse y no pasar en silencio. Lo leen la arena (`tools/arena/borrador.ts`)
 * y el visor del taller (`vista-8d.ts`): una sola definición de «hecha».
 */
export function tieneSusOchoDirecciones(raiz: string, id: string): boolean {
  const faltan = NOMBRES_DE_DIRECCION.map((_, d) => d).filter(
    (d) =>
      !['atlas.json', 'atlas.webp'].every((f) =>
        existsSync(join(raiz, 'assets/unidades', id, `d${d}`, f)),
      ),
  );
  if (faltan.length === 0) return true;
  if (faltan.length === NOMBRES_DE_DIRECCION.length) return false;
  throw new Error(
    `${id} tiene ${NOMBRES_DE_DIRECCION.length - faltan.length} de sus ${NOMBRES_DE_DIRECCION.length} direcciones (le faltan ${faltan.map((d) => `d${d}`).join(', ')}): o se terminan o se quitan, porque con menos se pintaría entera con el Y Bot sin decirlo`,
  );
}

/** Las poses de 8 direcciones de una unidad: las de su juego de armas. */
function dirPoses8d(u: Unidad): string {
  const juego = EN_OCHO_DIRECCIONES[u.id];
  if (juego === undefined)
    throw new Error(`${u.id} no está en 8 direcciones (EN_OCHO_DIRECCIONES)`);
  return relative(RAIZ, carpetaDePoses(juego));
}

export const rutaGiro = (u: Unidad): string => `assets/unidades/${u.id}/giro`;

/**
 * La lámina de identidad por los ocho lados: el maniquí en el reposo de cada
 * dirección como pose, la identidad a 25° ya aprobada y la lámina de
 * `assets/art/`. Fija la espalda antes de pintar las hojas de espaldas.
 */
export function encargoDeGiro(u: Unidad): Encargo {
  return {
    id: `${u.id}-giro`,
    tipo: 'giro',
    descripcion: `${u.aspecto}\n${PINTURA}`,
    referencias: [
      { ruta: `${dirPoses8d(u)}/giro.png`, papel: 'pose' },
      { ruta: `${rutaIdentidad(u)}.webp`, papel: 'identidad' },
      ...(u.concepto === undefined ? [] : [{ ruta: u.concepto, papel: 'estilo' as const }]),
    ],
    salida: rutaGiro(u),
    fondo: 'transparente',
  };
}

/** Las 16 hojas: dos por dirección, con su pose y el giro aprobado como identidad. */
export function encargosDeOchoDirecciones(u: Unidad): Encargo[] {
  encargoDeGiro(u);
  return Array.from({ length: NOMBRES_DE_DIRECCION.length }, (_, d) =>
    (['a', 'b'] as const).map(
      (hoja): Encargo => ({
        id: `${u.id}-d${d}-${hoja}`,
        tipo: 'atlas',
        descripcion: [
          u.aspecto,
          `En la lámina de giro (imagen 2), la figura ${d + 1} en orden de lectura es la que mira hacia «${NOMBRES_DE_DIRECCION[d]}», como esta hoja: así se ve el personaje desde este lado.`,
          PINTURA,
        ].join('\n'),
        referencias: [
          { ruta: `${dirPoses8d(u)}/d${d}-${hoja}.png`, papel: 'pose' },
          { ruta: `${rutaGiro(u)}.webp`, papel: 'identidad' },
          ...(u.concepto === undefined ? [] : [{ ruta: u.concepto, papel: 'estilo' as const }]),
        ],
        salida: `assets/unidades/${u.id}/d${d}/hoja-${hoja}`,
        fondo: 'transparente',
        celda: 384,
        ocho: { direccion: d, hoja },
      }),
    ),
  ).flat();
}
