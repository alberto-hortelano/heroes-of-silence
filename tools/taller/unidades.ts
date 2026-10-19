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
import type { FactionId } from '../../src/core/types.js';
import type { PerfilDeUnidad } from '../../src/core/unidad.js';
import {
  type ClipDeFigura,
  HOJAS_DE_FIGURA,
  hojasDeFigura,
  NOMBRES_DE_DIRECCION,
} from '../../src/shared/arte.js';
import {
  type Atrezo,
  type ClipsDeManiqui,
  type CuerpoACuerpo,
  carpetaDeManiqui,
  carpetaDePoses,
  clipDeDisparoDe,
  cuerpoACuerpoDe,
  ESPADA_CORTA,
  JUEGOS_DE_ARMAS,
  type JuegoEn8d,
  type Perfil,
  type Tramo,
  UNA_MANO,
} from '../art/poses.js';
import type { RitmoDeUnidad } from './derivar.js';
import type { Encargo } from './encargo.js';

export interface Unidad {
  readonly id: string;
  /** Las cinco facciones se declaran en `src/core/arena.ts`, que es quien las valida al guardar. */
  readonly faccion: FactionId;
  /** El nombre en `NuevaJugabilidad.md`. */
  readonly nombre: string;
  /**
   * La hoja de pose: uno de los perfiles de `poses.ts` (sprite-forge), o
   * `montado-lanza`, la del jinete que renderiza `tools/art/montura.ts`.
   */
  readonly perfil: Perfil | 'montado-lanza';
  /**
   * Con qué pelea en la arena (`KIT_DEL_PERFIL`), si no es el perfil de su hoja de
   * pose: el jinete élfico posa con la lanza y lleva además arco y espada
   * (`montado-arco`, 13-10-2026). Solo con qué pelea: la pose y el arte no cambian.
   */
  readonly perfilEnLaArena?: PerfilDeUnidad;
  /**
   * El personaje del que es esta hoja, si el taller pinta el mismo con varios
   * equipos («Guerrero con escudo» y «Guerrero con arma a dos manos»): todas sus
   * hojas comparten cuerpo y velocidad en la arena (`VELOCIDAD_DEL_CUERPO`,
   * `tools/arena/velocidades.ts`), y lo distinto lo pone el equipo (decisión del
   * usuario, 12-10-2026). Sin él, el personaje es la propia hoja. Los jinetes no
   * entran: el caballo o la hiena son otro cuerpo.
   */
  readonly personaje?: string;
  /**
   * La lámina de referencia de `assets/art/`: fija el aspecto Y el estilo que
   * tienen que seguir la identidad y la animación (decisión del usuario). Los
   * héroes no la tienen: su aspecto sale de la descripción y su estilo, de la
   * lámina de su facción (`ESTILO_DE_FACCION`).
   */
  readonly concepto?: string;
  /** El aspecto. La cámara, la pose y el fondo los pone el taller. */
  readonly aspecto: string;
  /**
   * El atrezo de SU maniquí, si el de su juego de armas no se parece a lo que
   * lleva: los clips son los del juego y el atrezo, este (decisión del
   * usuario, 04-10-2026: el Y Bot no es sagrado). Se renderiza con
   * `pnpm taller maniqui <id>` en `_poses/unidades/<id>-8d/`, y sus hojas se
   * pintan sobre él. El juego de `JUEGO_DEL_YBOT` sigue siendo el respaldo del
   * cliente mientras no hay arte propio.
   */
  readonly maniqui?: Atrezo;
  /**
   * Los clips de su maniquí que no son los de su juego: otro reposo o solo un
   * trozo de un clip (`ClipsDeManiqui`). Solo con `maniqui`.
   */
  readonly clipsDelManiqui?: ClipsDeManiqui;
  /**
   * Los fps de los clips que no van al reloj de todos (`RELOJ`, en
   * `derivar.ts`), o `tiempoReal` para que vayan a la velocidad de su clip de
   * Mixamo: van a su `atlas.json` al derivarlo (`ritmoDeUnidad`).
   */
  readonly ritmo?: RitmoDeUnidad;
  /**
   * Su altura frente a la de un adulto humano, que es 1: el goblin, «la mitad
   * de un humano» en sus láminas, y el troll, «más del doble que un orko». Las
   * hojas se empaquetan con el reposo a esa altura (`alturaDelReposo`), y como
   * el cliente escala por la celda, se ve así en el tablero. Sin talla, 1.
   */
  readonly talla?: number;
}

/** El arma de mano de espada y escudo, para cambiarle lo que haga falta. */
const ESPADA_Y_ESCUDO = JUEGOS_DE_ARMAS['espada-escudo'].atrezo;
/**
 * Un arma de fuego al hombro: la ballesta sin arco, cuerda ni virote. Con su
 * arma de cuerpo a cuerpo, que es la del ataque: el arma de fuego es la del
 * disparo (decisión del usuario, 04-10-2026).
 */
const armaDeFuego = (
  delante: number,
  atras: number,
  grosor: number,
  cuerpoACuerpo: CuerpoACuerpo,
): Atrezo => ({
  ballesta: { delante, atras, palas: 0, combadura: 0, grosor },
  separacionManos: 0.24,
  bajaEnReposo: 0.5,
  cuerpoACuerpo,
});
/** El artillero golpea con el botafuego: un palo de un metro, sin punta. */
const BOTAFUEGO: CuerpoACuerpo = {
  describe: 'el botafuego (una vara de madera de un metro con la mecha en la punta)',
  atrezo: {
    espada: { largo: 1.0, guarda: 0, puño: 0.3, agarre: 0, grosor: 0.018 },
    ...UNA_MANO,
    adelanteMinimo: 0.5,
  },
};
/** El ingeniero, con su martillo: el de la maza, más corto y con menos cabeza. */
const MARTILLO: CuerpoACuerpo = {
  describe: 'su martillo pequeño de una mano en la derecha',
  atrezo: {
    espada: { largo: 0.36, guarda: 0, puño: 0.14, agarre: 0, grosor: 0.022, cabeza: 0.06 },
    ...UNA_MANO,
  },
};

/**
 * Cómo se mueve cada clase de personaje (decisión del usuario, 10-10-2026: cada
 * uno con sus clips de Mixamo, no el mismo reposo para todos, y a tiempo real).
 * Se esparcen en la unidad (`...PESADO`) con su `clipsDelManiqui` y su ritmo;
 * el ataque lo pone el juego de armas salvo que la unidad diga otro. Los reposos
 * largos van en un trozo de 1,5 s de ida y vuelta a 5 fps, como el del vampiro;
 * las muertes, desde que empiezan a caer (la de Mixamo pasa su primer segundo de
 * pie agitando el brazo).
 */
interface Temperamento {
  readonly clipsDelManiqui: ClipsDeManiqui;
  readonly ritmo: RitmoDeUnidad;
}
const temperamento = (
  reposo: string,
  acciones: NonNullable<ClipsDeManiqui['acciones']>,
  tramoDelReposo?: Tramo,
): Temperamento => ({
  clipsDelManiqui: {
    reposo,
    acciones,
    tramos: {
      ...(tramoDelReposo === undefined ? {} : { idle: tramoDelReposo }),
      death: acciones.death === 'death2' ? [1.0, 3.4] : [1.0, 2.0],
    },
    ...(tramoDelReposo === undefined ? {} : { vaiven: ['idle'] as const }),
  },
  ritmo: { tiempoReal: true, ...(tramoDelReposo === undefined ? {} : { fps: { idle: 5 } }) },
});
/** Infantería de espada y escudo en guardia: el arranque de la guardia de `idle`. */
const EN_GUARDIA = temperamento(
  'idle',
  { walk: 'walk', charge: 'run', hurt: 'impact3', death: 'death' },
  [0, 1.5],
);
/** Lanzas y alabardas en formación: la guardia quieta y la carrera erguida. */
const EN_FORMACION = temperamento('idle4', {
  walk: 'walk',
  charge: 'run2',
  hurt: 'impact3',
  death: 'death',
});
/** Armaduras pesadas y brutos: guardia quieta, paso firme, el golpe le dobla y cae de rodillas. */
const PESADO = temperamento('idle4', {
  walk: 'walk2',
  charge: 'run2',
  hurt: 'impact2',
  death: 'death2',
});
/** Ligeros y vigilantes: mira a los lados, corre agachado. */
const AGIL = temperamento(
  'idle_look_around',
  { walk: 'walk', charge: 'run', hurt: 'impact3', death: 'death' },
  [0, 1.5],
);
/** Magos, sanadores, tiradores y gente sin guardia: de pie y relajado, el paso de calle. */
const SOSEGADO = temperamento(
  'idle_neutral',
  { walk: 'walking', charge: 'run2', hurt: 'impact2', death: 'death2' },
  [0, 1.5],
);
/** Como `SOSEGADO`, pero respirando hondo: sacerdotes y druidas. */
const EN_CALMA = temperamento(
  'idle_breathing',
  { walk: 'walking', charge: 'run2', hurt: 'impact2', death: 'death2' },
  [0, 1.5],
);
/** Encorvados y renqueantes: zombis, penitentes, el chamán goblin. */
const RENQUEANTE = temperamento(
  'wounded_idle',
  { walk: 'walk2', charge: 'run2', hurt: 'impact2', death: 'death2' },
  [0, 1.5],
);
/** El mismo temperamento con otro ataque. */
const conAtaque = (t: Temperamento, attack: string): Temperamento => ({
  ...t,
  clipsDelManiqui: { ...t.clipsDelManiqui, acciones: { ...t.clipsDelManiqui.acciones, attack } },
});

/** El mismo temperamento con otro golpe. */
const conGolpe = (t: Temperamento, hurt: string): Temperamento => ({
  ...t,
  clipsDelManiqui: { ...t.clipsDelManiqui, acciones: { ...t.clipsDelManiqui.acciones, hurt } },
});
/**
 * El golpe de `impact2` en vez del de su temperamento: así se renderizaron sus
 * maniquíes y se pintaron sus hojas el 10-10-2026 (un fallo del render dejaba
 * el `impact2` de una unidad en las siguientes; ya arreglado).
 */
const conImpact2 = (t: Temperamento): Temperamento => conGolpe(t, 'impact2');

export const PINTURA =
  'Estilo: el de la lámina de referencia de la unidad —ilustración pintada de fantasía medieval oscura, materiales gastados y creíbles, paleta sobria, silueta clara—; nada de acabado de juguete, de dibujo animado ni de render 3D.';

export const UNIDADES: readonly Unidad[] = [
  {
    id: 'templario-escudo',
    ...EN_GUARDIA,
    maniqui: JUEGOS_DE_ARMAS['espada-escudo'].atrezo,
    faccion: 'templarios',
    nombre: 'Guerrero con escudo',
    perfil: 'espada-escudo',
    personaje: 'templario-guerrero',
    concepto: 'assets/art/templarios/guerrero-con-escudo.png',
    aspecto:
      'Un templario de infantería: armadura de placas sobre cota de malla, sobrevesta blanca con cruz roja, yelmo cerrado de cubo, escudo de cometa con cruz roja en el brazo izquierdo y espada de una mano en la derecha.',
  },
  {
    id: 'templario-mandoble',
    ...PESADO,
    maniqui: JUEGOS_DE_ARMAS['dos-manos'].atrezo,
    faccion: 'templarios',
    nombre: 'Guerrero con arma a dos manos',
    perfil: 'dos-manos',
    personaje: 'templario-guerrero',
    concepto: 'assets/art/templarios/guerrero-con-arma-a-dos-manos.png',
    aspecto:
      'Un templario pesado: armadura de placas, sobrevesta blanca con cruz roja, capa corta roja, yelmo abierto de casquete y mandoble largo empuñado con las dos manos. Sin escudo.',
  },
  {
    id: 'templario-monje',
    ...SOSEGADO,
    maniqui: JUEGOS_DE_ARMAS['baston'].atrezo,
    faccion: 'templarios',
    nombre: 'Monje',
    perfil: 'baston',
    concepto: 'assets/art/templarios/monje.png',
    aspecto:
      'Un monje sanador: hábito de lana cruda con escapulario y cruz roja, tonsura, bolsa de vendas y hierbas al cinto, bastón alto de madera rematado en cruz en la mano derecha.',
  },
  {
    id: 'templario-escudero',
    ...AGIL,
    maniqui: JUEGOS_DE_ARMAS['lanza'].atrezo,
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
    ...RENQUEANTE,
    maniqui: JUEGOS_DE_ARMAS['mayal'].atrezo,
    faccion: 'templarios',
    nombre: 'Penitente',
    perfil: 'dos-manos',
    concepto: 'assets/art/templarios/penitente.png',
    aspecto:
      'Un penitente flagelante sin armadura: capirote de tela áspera que le tapa la cara, torso desnudo y marcado, faldón de arpillera con tiras rojas, pies descalzos, mayal de bola de pinchos.',
  },
  {
    id: 'esqueleto-guerrero',
    ...conImpact2(EN_GUARDIA),
    faccion: 'no-muertos',
    nombre: 'Esqueleto guerrero',
    perfil: 'espada-escudo',
    personaje: 'esqueleto',
    concepto: 'assets/art/no-muertos/esqueleto-guerrero.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.8, guarda: 0.16, puño: 0.16, agarre: 0.08 },
      rodela: 0.27,
    },
    aspecto:
      'Un esqueleto guerrero: huesos amarillentos, cota de malla oxidada y yelmo abollado, escudo redondo de madera en el brazo izquierdo y espada mellada en la derecha.',
  },
  {
    id: 'esqueleto-arquero',
    ...AGIL,
    maniqui: JUEGOS_DE_ARMAS['arco'].atrezo,
    faccion: 'no-muertos',
    nombre: 'Esqueleto arquero',
    perfil: 'arco',
    personaje: 'esqueleto',
    concepto: 'assets/art/no-muertos/esqueleto-arquero.png',
    aspecto:
      'Un esqueleto arquero: huesos amarillentos, capucha y harapos oscuros, carcaj a la espalda y arco largo en la mano izquierda.',
  },
  {
    id: 'zombi',
    ...conAtaque(RENQUEANTE, 'heavy'),
    faccion: 'no-muertos',
    nombre: 'Zombie',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/zombie.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 1.0, guarda: 0.2, puño: 0.2, agarre: 0.08 },
      escudo: false,
    },
    aspecto:
      'Un zombi: cadáver demacrado de piel gris cenicienta con la carne podrida, pelo ralo y largo, boca abierta, túnica oscura y harapos hechos jirones manchados de sangre, cuerda por cinturón, encorvado y arrastrando los pies, espada larga oxidada y manchada de sangre en la mano derecha, la izquierda en garra.',
  },
  {
    id: 'espectro',
    ...SOSEGADO,
    faccion: 'no-muertos',
    nombre: 'Espectro',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/espectro.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 1.0, guarda: 0.2, puño: 0.2, agarre: 0.08 },
      escudo: false,
    },
    aspecto:
      'Un espectro: figura encapuchada con armadura fantasmal y túnica de jirones verde grisáceo que se deshace hacia los pies, rostro oculto en sombra, espada larga en la mano derecha. Pintado OPACO, sin transparencias: lo fantasmal lo dan los colores pálidos y los jirones.',
  },
  {
    id: 'caballero-de-la-muerte',
    ...PESADO,
    maniqui: JUEGOS_DE_ARMAS['dos-manos'].atrezo,
    faccion: 'no-muertos',
    nombre: 'Caballero de la muerte',
    perfil: 'dos-manos',
    concepto: 'assets/art/no-muertos/caballero-de-la-muerte.png',
    aspecto:
      'Un caballero de la muerte, contrapunto oscuro del templario: armadura de placas negra y abollada con remaches de hierro, sobrevesta negra hecha jirones con una cruz rota desteñida, yelmo cerrado con cuernos cortos y un brillo verde frío tras la visera, gran espadón mellado empuñado a dos manos.',
  },
  {
    id: 'jinete-de-plaga',
    faccion: 'no-muertos',
    nombre: 'Jinete de plaga (a caballo)',
    perfil: 'montado-lanza',
    concepto: 'assets/art/no-muertos/jinete-de-plaga.png',
    aspecto:
      'Un jinete de plaga A CABALLO, como el del concepto: caballo negro con testera de hierro y gualdrapa negra hecha jirones con cruces blancas de serpiente; el jinete con máscara de médico de la peste de pico largo, capucha y túnica negra raída sobre armadura, lanza larga con un estandarte negro desgarrado con la misma cruz. Sin escudo. Jinete y caballo son UNA sola figura.',
  },
  {
    id: 'imperio-alabardero',
    ...conImpact2(EN_FORMACION),
    faccion: 'imperio',
    nombre: 'Alabardero',
    perfil: 'dos-manos',
    concepto: 'assets/art/imperio/alabardero.png',
    maniqui: {
      espada: {
        largo: 1.6,
        guarda: 0,
        puño: 0.6,
        agarre: 0,
        grosor: 0.02,
        moharra: 0.25,
        remate: 'hacha',
      },
      ...UNA_MANO,
      adelanteMinimo: 0.6,
    },
    aspecto:
      'Un alabardero lansquenete: morrión de acero, peto, mangas y calzas acuchilladas a franjas amarillas y negras con forros rojos, alabarda empuñada a dos manos y espada corta al cinto.',
  },
  {
    id: 'imperio-piquero',
    ...conImpact2(EN_FORMACION),
    faccion: 'imperio',
    nombre: 'Piquero',
    perfil: 'dos-manos',
    concepto: 'assets/art/imperio/piquero.png',
    maniqui: {
      espada: { largo: 1.9, guarda: 0, puño: 0.6, agarre: 0, grosor: 0.02, moharra: 0.2 },
      ...UNA_MANO,
      adelanteMinimo: 0.6,
    },
    aspecto:
      'Un piquero lansquenete: morrión, peto de acero, ropa acuchillada a franjas amarillas y negras, pica larga (una vez y media su altura) empuñada a dos manos, inclinada y nunca más larga que eso.',
  },
  {
    id: 'imperio-ballestero',
    ...SOSEGADO,
    maniqui: JUEGOS_DE_ARMAS['ballesta'].atrezo,
    faccion: 'imperio',
    nombre: 'Ballestero',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/ballestero.png',
    aspecto:
      'Un ballestero: capacete, jubón acolchado amarillo y negro con mangas rojas, gran pavés con el águila imperial a la espalda, ballesta de acero empuñada con las dos manos y carcaj de virotes al cinto.',
  },
  {
    id: 'imperio-coracero',
    ...conAtaque(PESADO, 'heavy'),
    faccion: 'imperio',
    nombre: 'Coracero',
    perfil: 'espada-escudo',
    concepto: 'assets/art/imperio/coracero.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.95, guarda: 0.22, puño: 0.2, agarre: 0.085 },
      escudo: false,
    },
    aspecto:
      'Un coracero: armadura de placas pesada y oscura casi completa, banda roja cruzada al pecho, borgoñota cerrada, espada de lazo de una mano. Sin escudo. Muy duro y lento.',
  },
  {
    id: 'imperio-arcabucero',
    ...SOSEGADO,
    faccion: 'imperio',
    nombre: 'Arcabucero',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/arcabucero.png',
    maniqui: armaDeFuego(0.75, 0.25, 0.022, ESPADA_CORTA),
    aspecto:
      'Un arcabucero: sombrero de ala ancha con pluma roja, jubón acuchillado amarillo y negro, bandolera de cargas, banda roja a la cintura, arcabuz de mecha empuñado con las dos manos y la horquilla colgada.',
  },
  {
    id: 'imperio-rodelero',
    ...conImpact2(EN_GUARDIA),
    faccion: 'imperio',
    nombre: 'Rodelero',
    perfil: 'espada-escudo',
    concepto: 'assets/art/imperio/rodelero.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.9, guarda: 0.12, puño: 0.14, agarre: 0.07, grosor: 0.014 },
      rodela: 0.25,
    },
    aspecto:
      'Un rodelero: morrión con pluma roja, peto de acero, ropa acuchillada roja y negra, rodela de acero redonda en el brazo izquierdo y espada ropera en la derecha.',
  },
  {
    id: 'imperio-artillero-culebrina',
    ...SOSEGADO,
    faccion: 'imperio',
    nombre: 'Artillero con culebrina',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/artillero-con-culebrina.png',
    maniqui: armaDeFuego(0.85, 0.2, 0.038, BOTAFUEGO),
    aspecto:
      'Un artillero: gorra de lana, mandil de cuero tiznado sobre ropa amarilla y negra, guantes gruesos, culebrina de mano (cañón largo y ligero de bronce con culata de madera) empuñada con las dos manos, bolsa de pólvora y botafuego al cinto. Sin cureña.',
  },
  {
    id: 'imperio-pistolero-montado',
    faccion: 'imperio',
    nombre: 'Pistolero montado',
    // La hoja de una dirección es la del jinete con lanza: el aspecto dice que no la lleva.
    perfil: 'montado-lanza',
    concepto: 'assets/art/imperio/pistolero-montado.png',
    aspecto:
      'Un pistolero montado (reitre) A CABALLO, como el del concepto: media armadura ennegrecida, morrión abierto, banda roja, mangas acuchilladas amarillas y negras, pistola de rueda en la mano derecha y espada al cinto. SIN lanza y SIN escudo. El caballo, castaño oscuro, lleva gualdrapa amarilla y negra. Jinete y caballo son UNA sola figura.',
  },
  {
    id: 'imperio-granadero',
    ...conImpact2(AGIL),
    maniqui: JUEGOS_DE_ARMAS['granada'].atrezo,
    faccion: 'imperio',
    nombre: 'Granadero',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/granadero.png',
    aspecto:
      'Un granadero: gorro alto de tela a franjas amarillas y negras con cinta roja, coleto de cuero sobre ropa acuchillada amarilla y negra, banda roja a la cintura, bandolera y bolsa de granadas de hierro, una granada redonda con la mecha encendida en la mano derecha, mecha lenta enrollada en la muñeca izquierda y un sable al cinto, con el que pelea cuerpo a cuerpo.',
  },
  {
    id: 'elfo-arquero',
    ...conImpact2(AGIL),
    maniqui: JUEGOS_DE_ARMAS['arco'].atrezo,
    faccion: 'elfos',
    nombre: 'Arquero',
    perfil: 'arco',
    concepto: 'assets/art/elfos/arquero.png',
    aspecto:
      'Una arquera elfa: pelo plateado trenzado, armadura ligera de cuero con escamas de hoja, capa verde musgo hecha jirones, carcaj a la espalda y arco largo élfico de madera clara.',
  },
  {
    id: 'elfo-explorador',
    ...conImpact2(conAtaque(AGIL, 'medium')),
    faccion: 'elfos',
    nombre: 'Explorador',
    perfil: 'espada-escudo',
    concepto: 'assets/art/elfos/explorador.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.45, guarda: 0.06, puño: 0.12, agarre: 0.06, grosor: 0.014 },
      escudo: false,
      daga: { largo: 0.4 },
    },
    aspecto:
      'Un explorador elfo: capucha y capa de camuflaje hecha de hojas secas, máscara de tela, ropa de cuero oscuro, dos cuchillos curvos, uno en cada mano, arco corto a la espalda. Agazapado.',
  },
  {
    id: 'elfo-guardia-del-bosque',
    ...conImpact2(EN_FORMACION),
    faccion: 'elfos',
    nombre: 'Guardia del bosque',
    perfil: 'espada-escudo',
    concepto: 'assets/art/elfos/guardia-del-bosque.png',
    maniqui: {
      espada: { largo: 1.6, guarda: 0, puño: 0.6, agarre: 0, grosor: 0.02, moharra: 0.25 },
      ...UNA_MANO,
      escudo: true,
      adelanteMinimo: 0.6,
    },
    aspecto:
      'Un guardia del bosque elfo: armadura de escamas en forma de hoja verde oliva, yelmo alto con alas de hoja, capa verde, escudo oval de madera tallada en el brazo izquierdo y lanza larga élfica en la derecha.',
  },
  {
    id: 'elfo-jinete',
    faccion: 'elfos',
    nombre: 'Jinete (a caballo)',
    perfil: 'montado-lanza',
    perfilEnLaArena: 'montado-arco',
    concepto: 'assets/art/elfos/jinete.png',
    aspecto:
      'Un jinete elfo A CABALLO, como el del concepto: caballo gris moteado esbelto con brida de hojas y gualdrapa verde musgo; el jinete con armadura ligera de escamas de hoja, capa verde al viento, lanza larga de hoja élfica para la carga, arco curvo y carcaj a la espalda y espada curva al cinto. Sin escudo. Jinete y caballo son UNA sola figura.',
  },
  {
    id: 'elfo-sacerdotisa',
    ...EN_CALMA,
    faccion: 'elfos',
    nombre: 'Sacerdotisa',
    perfil: 'baston',
    concepto: 'assets/art/elfos/sacerdotisa.png',
    maniqui: {
      espada: { largo: 1.15, guarda: 0, puño: 0.5, agarre: 0, grosor: 0.022, remate: 'esfera' },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
    aspecto:
      'Una sacerdotisa elfa de protección, curación y ocultación: túnicas blancas y verde musgo con manto de escamas de hoja plateadas, capucha, pelo plateado largo, bastón esbelto de madera clara rematado en una media luna de hojas de plata y una bruma suave en la mano libre.',
  },
  {
    id: 'elfo-asesino',
    ...conImpact2(conAtaque(AGIL, 'medium')),
    faccion: 'elfos',
    nombre: 'Asesino',
    perfil: 'espada-escudo',
    concepto: 'assets/art/elfos/asesino.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.3, guarda: 0.08, puño: 0.1, agarre: 0.05, grosor: 0.012 },
      escudo: false,
      daga: { largo: 0.28 },
    },
    aspecto:
      'Un asesino elfo: armadura de cuero oscuro ceñida y capa de jirones de hoja, capucha y máscara de tela sobre la cara, solo los ojos ámbar a la vista, una daga curva con brillo verde de veneno en cada mano, frascos al cinto, botas blandas. Agazapado.',
  },
  {
    id: 'orko-hacha-escudo',
    ...conAtaque(PESADO, 'heavy'),
    faccion: 'orkos',
    nombre: 'Orko con hacha y escudo',
    perfil: 'espada-escudo',
    personaje: 'orko',
    concepto: 'assets/art/orkos/orko-con-hacha-y-escudo.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.75, guarda: 0, puño: 0.45, agarre: 0.05, grosor: 0.024, remate: 'hacha' },
      rodela: 0.3,
    },
    aspecto:
      'Un orko de piel verde oliva: colmillos, pelo negro recogido, armadura de cuero y placas oxidadas con pieles, faldón de cuero, escudo redondo de madera reforzado en la izquierda y hacha de una mano en la derecha.',
  },
  {
    id: 'orko-dos-armas',
    ...conImpact2(conAtaque(AGIL, 'slash4')),
    faccion: 'orkos',
    nombre: 'Orko con dos armas',
    perfil: 'dos-manos',
    personaje: 'orko',
    concepto: 'assets/art/orkos/orko-con-dos-armas.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.6, guarda: 0.04, puño: 0.14, agarre: 0.06, grosor: 0.03 },
      escudo: false,
      daga: { largo: 0.55 },
    },
    aspecto:
      'Un orko de piel verde, torso casi desnudo con pinturas de guerra rojas, hombrera de pinchos, faldón de pieles, una cuchilla tosca en cada mano. Sin defensa, rugiendo.',
  },
  {
    id: 'goblin-lancero',
    ...conImpact2(AGIL),
    faccion: 'orkos',
    nombre: 'Goblin lancero',
    perfil: 'espada-escudo',
    personaje: 'goblin',
    concepto: 'assets/art/orkos/goblin-lancero.png',
    maniqui: {
      ...JUEGOS_DE_ARMAS.lanza.atrezo,
      espada: { largo: 1.6, guarda: 0, puño: 0.6, agarre: 0, grosor: 0.018, moharra: 0.2 },
      escudo: true,
      rodela: 0.18,
    },
    talla: 0.7,
    aspecto:
      'Un goblin lancero: pequeño y flaco, piel verde amarillenta, orejas largas, casco de hierro abollado, harapos, escudo redondo pequeño en la izquierda y lanza larga en la derecha.',
  },
  {
    id: 'goblin-arquero',
    ...conImpact2(AGIL),
    maniqui: JUEGOS_DE_ARMAS['arco'].atrezo,
    faccion: 'orkos',
    nombre: 'Goblin arquero',
    perfil: 'arco',
    personaje: 'goblin',
    concepto: 'assets/art/orkos/goblin-arquero.png',
    talla: 0.7,
    aspecto:
      'Un goblin arquero: pequeño, piel verde amarillenta, capucha y pañuelo rojos tapándole la boca, harapos de cuero, carcaj de flechas a la espalda, arco corto tosco.',
  },
  {
    id: 'troll-maza',
    ...conAtaque(PESADO, 'heavy'),
    faccion: 'orkos',
    nombre: 'Troll con maza',
    perfil: 'dos-manos',
    concepto: 'assets/art/orkos/troll-con-maza.png',
    maniqui: {
      ...JUEGOS_DE_ARMAS['dos-manos'].atrezo,
      espada: { largo: 1.0, guarda: 0, puño: 0.4, agarre: 0, grosor: 0.05, cabeza: 0.13 },
    },
    talla: 1.45,
    aspecto:
      'Un troll: gigante de piel gris azulada con musgo, cabeza pequeña, colmillos, grilletes rotos con cadenas en las muñecas, taparrabos, maza de madera con clavos de hierro empuñada a dos manos.',
  },
  {
    id: 'goblin-jinete-de-hiena',
    faccion: 'orkos',
    nombre: 'Jinete de hiena (goblin)',
    perfil: 'montado-lanza',
    concepto: 'assets/art/orkos/jinete-de-hiena.png',
    talla: 0.7,
    aspecto:
      'Un jinete goblin A LOMOS DE UNA HIENA, como el del concepto: hiena grande de lomo caído, crin hirsuta y pelaje moteado sarnoso, arnés de cuero con tachuelas y silla pequeña, las fauces abiertas; el goblin pequeño y flaco, piel verde amarillenta, orejas largas, casco abollado, cuero raído, lanza corta y escudo redondo pequeño. Jinete y hiena son UNA sola figura, mucho más baja que un caballo.',
  },
  {
    id: 'orko-armadura-pesada',
    ...PESADO,
    faccion: 'orkos',
    nombre: 'Orko con armadura pesada',
    perfil: 'dos-manos',
    personaje: 'orko',
    concepto: 'assets/art/orkos/orko-armadura-pesada.png',
    maniqui: {
      ...JUEGOS_DE_ARMAS['dos-manos'].atrezo,
      espada: { largo: 1.1, guarda: 0, puño: 0.55, agarre: 0.05, grosor: 0.026, remate: 'hacha' },
    },
    aspecto:
      'Un orko con armadura pesada: piel verde oliva, yelmo cerrado de hierro con mirilla y cuernos cortos, placas de hierro ennegrecido remachadas sobre malla y cuero, hombreras enormes con pinchos, botas de hierro, gran hacha de doble filo empuñada a dos manos. Sin escudo. Pesado e inamovible.',
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
    ...conImpact2(conAtaque(EN_GUARDIA, 'precise')),
    maniqui: JUEGOS_DE_ARMAS['espada-escudo'].atrezo,
    faccion: 'templarios',
    nombre: 'Caballero (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un caballero templario veterano, líder de primera línea: armadura de placas completa y cuidada con filos dorados, sobrevesta blanca impecable con gran cruz roja, capa blanca corta, yelmo abierto con nasal que deja ver un rostro curtido de barba gris, escudo de cometa con cruz roja y espada larga de una mano.',
  },
  {
    id: 'heroe-templario-abad',
    ...conAtaque(EN_CALMA, 'power_up'),
    maniqui: JUEGOS_DE_ARMAS['baston'].atrezo,
    faccion: 'templarios',
    nombre: 'Monje (Abad), héroe',
    perfil: 'baston',
    aspecto:
      'Un abad templario, sanador y protector: hábito blanco de buen paño con estola roja bordada y cruz roja al pecho, cota de malla asomando por las mangas, cabeza tonsurada y barba blanca, báculo de abad de madera oscura rematado en cruz de latón con un incensario colgando.',
  },
  {
    id: 'heroe-templario-inquisidor',
    ...conImpact2(AGIL),
    maniqui: JUEGOS_DE_ARMAS['maza'].atrezo,
    faccion: 'templarios',
    nombre: 'Inquisidor (héroe)',
    perfil: 'espada-escudo',
    aspecto:
      'Un inquisidor, cazador de magos y no muertos: sombrero de ala ancha negro, abrigo largo de cuero negro sobre coraza ligera, sobrevesta corta blanca con cruz roja, sello y rosario al cinto, maza de pinchos de una mano en la derecha y un pequeño libro sagrado encadenado en la izquierda. Sin escudo.',
  },
  {
    id: 'heroe-templario-gran-maestre',
    ...PESADO,
    maniqui: JUEGOS_DE_ARMAS['dos-manos'].atrezo,
    faccion: 'templarios',
    nombre: 'Gran Maestre (héroe)',
    perfil: 'dos-manos',
    aspecto:
      'El Gran Maestre de la orden: armadura de placas ornamentada con grabados dorados, sobrevesta blanca larga con cruz roja grande, manto blanco con forro rojo, corona de hierro sobre el yelmo abierto, rostro severo de barba blanca, gran espadón ceremonial empuñado a dos manos.',
  },
  {
    id: 'heroe-nigromante',
    ...SOSEGADO,
    faccion: 'no-muertos',
    nombre: 'Nigromante (héroe)',
    perfil: 'baston',
    concepto: 'assets/art/no-muertos/nigromante.png',
    maniqui: {
      espada: { largo: 1.15, guarda: 0, puño: 0.5, agarre: 0, grosor: 0.024, remate: 'esfera' },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
    aspecto:
      'Un nigromante: túnica larga negra y morada raída, capucha echada hacia atrás, rostro pálido y demacrado, collar de huesos de dedos, bastón de madera negra rematado en un cráneo con un tenue brillo verde en las cuencas.',
  },
  {
    id: 'heroe-vampiro',
    faccion: 'no-muertos',
    nombre: 'Vampiro (héroe)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/no-muertos/vampiro.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.95, guarda: 0.12, puño: 0.14, agarre: 0.07, grosor: 0.012 },
      escudo: false,
    },
    clipsDelManiqui: {
      // Un noble, no un soldado en guardia: de pie y relajado, con la ropera
      // colgando (elegido por el usuario entre los ocho reposos, 10-10-2026).
      // La guardia de `idle` saca la espada al costado y menea la cabeza; la de
      // `idle (4)` solo respira y, pintada, era una estatua. De `idle_neutral`,
      // su primer balanceo del peso (un ~20 % de la silueta cambia), de ida y
      // vuelta: el clip dura 8,8 s y entero en siete columnas saltaría.
      reposo: 'idle_neutral',
      // El golpe de `impact2`, con el que se renderizó y pintó (`conImpact2`).
      acciones: { hurt: 'impact2' },
      tramos: {
        idle: [0, 1.5],
        // La muerte de Mixamo pasa su primer segundo de pie, agitando el brazo
        // de la espada; cae entre 1,3 y 1,8 s y a los 2 s ya es cadáver.
        death: [1.0, 2.0],
      },
      vaiven: ['idle'],
    },
    // Cada clip a la velocidad de Mixamo (decisión del usuario, 10-10-2026), salvo el balanceo de ida y vuelta, a 5 fps: una vuelta
    // de 1,4 s. A tiempo real eran 2,3 fps y a los 8 de todos se leía con prisa
    // (elegido por el usuario entre 8, 6, 5 y 4).
    ritmo: { tiempoReal: true, fps: { idle: 5 } },
    aspecto:
      'Un señor vampiro: noble de piel muy pálida y pelo negro largo, jubón de terciopelo granate con bordados negros, coraza ligera negra, capa negra de cuello alto con forro rojo, ropera fina de una mano en la derecha y la mano izquierda libre con garras. Sin escudo.',
  },
  {
    id: 'heroe-lich',
    ...conAtaque(SOSEGADO, 'power_up'),
    faccion: 'no-muertos',
    nombre: 'Lich (héroe)',
    perfil: 'baston',
    concepto: 'assets/art/no-muertos/lich.png',
    maniqui: {
      espada: { largo: 1.15, guarda: 0, puño: 0.5, agarre: 0, grosor: 0.024, remate: 'esfera' },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
    aspecto:
      'Un lich: esqueleto de mago con corona de hierro oxidada, túnica ceremonial negra y verde podrida con hilos de oro deshilachados, manos huesudas con anillos, filacteria colgada al cuello, bastón alto de hueso rematado en una gema verde.',
  },
  {
    id: 'heroe-imperio-duelista',
    ...conImpact2(conAtaque(AGIL, 'precise')),
    faccion: 'imperio',
    nombre: 'Duelista (héroe; sustituye al Noble)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/imperio/duelista.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 1.0, guarda: 0.12, puño: 0.14, agarre: 0.07, grosor: 0.012 },
      escudo: false,
      daga: { largo: 0.3 },
    },
    aspecto:
      'Un duelista imperial, maestro de esgrima delgado y rápido: sombrero de ala con plumas roja y amarilla, gola de acero, jubón negro acuchillado de amarillo y rojo, media capa al hombro con el águila, botas altas, ropera de lazo en la mano derecha y daga de parada en la izquierda. Sin escudo.',
  },
  {
    id: 'heroe-imperio-mago',
    ...SOSEGADO,
    faccion: 'imperio',
    nombre: 'Mago de batalla (héroe)',
    perfil: 'baston',
    concepto: 'assets/art/imperio/mago-de-batalla.png',
    maniqui: {
      espada: { largo: 1.15, guarda: 0, puño: 0.5, agarre: 0, grosor: 0.024, remate: 'esfera' },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
    aspecto:
      'Un mago de batalla imperial: túnica larga azul oscuro con ribetes dorados sobre coraza ligera, birrete, barba recortada, libro atado al cinto, bastón de metal rematado en una esfera con llamas.',
  },
  {
    id: 'heroe-imperio-capitan-mercenario',
    ...conImpact2(conAtaque(AGIL, 'heavy')),
    faccion: 'imperio',
    nombre: 'Capitán mercenario (héroe)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/imperio/capitan-mercenario.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.7, guarda: 0.22, puño: 0.15, agarre: 0.08, grosor: 0.03 },
      escudo: false,
    },
    aspecto:
      'Un capitán mercenario lansquenete: sombrero enorme con plumas rojas y amarillas, ropa acuchillada llamativa, peto de acero abollado, bigote, espada katzbalger en la derecha y una bolsa de monedas al cinto. Sin escudo.',
  },
  {
    id: 'heroe-imperio-ingeniero',
    ...SOSEGADO,
    faccion: 'imperio',
    nombre: 'Ingeniero (héroe)',
    perfil: 'ballesta',
    concepto: 'assets/art/imperio/ingeniero.png',
    maniqui: armaDeFuego(0.9, 0.3, 0.018, MARTILLO),
    aspecto:
      'Un ingeniero imperial: gafas de latón sobre la frente, mandil de cuero con herramientas, jubón amarillo y negro, rollo de planos a la espalda, martillo pequeño al cinto y un rifle largo de llave de rueda, para tirar de lejos, empuñado con las dos manos.',
  },
  {
    id: 'heroe-elfo-danzante-de-espadas',
    ...conImpact2(conAtaque(AGIL, 'slash4')),
    faccion: 'elfos',
    nombre: 'Danzante de espadas (héroe)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/elfos/danzante-de-espadas.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.8, guarda: 0.1, puño: 0.14, agarre: 0.07, grosor: 0.014 },
      escudo: false,
      daga: { largo: 0.7 },
    },
    aspecto:
      'Un danzante de espadas elfo: pelo blanco largo recogido, armadura ligera de escamas de hoja dorada, faldones de tela verde que vuelan, una espada élfica curva en cada mano. Ágil y elegante.',
  },
  {
    id: 'heroe-elfo-druida',
    ...conAtaque(EN_CALMA, 'casting2'),
    faccion: 'elfos',
    nombre: 'Druida (héroe)',
    perfil: 'baston',
    concepto: 'assets/art/elfos/druida.png',
    maniqui: {
      espada: { largo: 1.15, guarda: 0, puño: 0.5, agarre: 0, grosor: 0.026 },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
    aspecto:
      'Una druida elfa: túnica de hojas y musgo, corona de astas pequeñas y flores, pelo largo cobrizo, bastón retorcido de madera viva con brotes verdes y una luz verde en la punta.',
  },
  {
    id: 'heroe-elfo-cantora',
    ...conAtaque(SOSEGADO, 'casting2'),
    faccion: 'elfos',
    nombre: 'Cantora (héroe)',
    perfil: 'baston',
    concepto: 'assets/art/elfos/cantora.png',
    // El arpa va en la izquierda: el libro del maniquí es su sitio; en la
    // derecha, una daga corta para el cuerpo a cuerpo.
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.25, guarda: 0.06, puño: 0.1, agarre: 0.05, grosor: 0.012 },
      escudo: false,
      libro: true,
    },
    aspecto:
      'Una cantora elfa: vestido largo verde y plata, diadema de hojas de plata, pelo rubio muy largo, arpa pequeña de madera clara sujeta en el brazo izquierdo y la mano derecha alzada.',
  },
  {
    id: 'heroe-orko-kaudillo',
    ...PESADO,
    faccion: 'orkos',
    nombre: 'Kaudillo (héroe)',
    perfil: 'dos-manos',
    concepto: 'assets/art/orkos/kaudillo.png',
    maniqui: {
      ...JUEGOS_DE_ARMAS['dos-manos'].atrezo,
      espada: { largo: 1.0, guarda: 0, puño: 0.5, agarre: 0.05, grosor: 0.026, remate: 'hacha' },
    },
    aspecto:
      'Un kaudillo orko enorme: armadura de placas de chatarra con pinchos y cráneos, capa de piel de lobo, cuernos en el casco, cicatrices, gran cuchilla de carnicero empuñada a dos manos.',
  },
  {
    id: 'heroe-goblin-jefe',
    ...conImpact2(AGIL),
    faccion: 'orkos',
    nombre: 'Jefe goblin (héroe)',
    perfil: 'espada-escudo',
    concepto: 'assets/art/orkos/jefe-goblin.png',
    maniqui: {
      ...ESPADA_Y_ESCUDO,
      espada: { largo: 0.3, guarda: 0.06, puño: 0.1, agarre: 0.05, grosor: 0.012 },
      escudo: false,
    },
    talla: 0.7,
    aspecto:
      'Un jefe goblin: pequeño y astuto, corona torcida de latón, capa roja raída demasiado grande, muchos amuletos, daga envenenada en la derecha y una trampa de cepo colgando del cinto.',
  },
  {
    id: 'heroe-goblin-chaman',
    ...RENQUEANTE,
    faccion: 'orkos',
    nombre: 'Chamán goblin (héroe)',
    perfil: 'baston',
    concepto: 'assets/art/orkos/chaman-goblin.png',
    maniqui: {
      espada: { largo: 1.0, guarda: 0, puño: 0.45, agarre: 0, grosor: 0.024, remate: 'esfera' },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
    talla: 0.7,
    aspecto:
      'Un chamán goblin: pequeño y encorvado, piel verde amarillenta, orejas enormes, ojos desquiciados, tocado de plumas con un cráneo de animal, collares de huesos y dientes, pinturas blancas, pieles, bastón nudoso rematado por una calavera agrietada con una llama inestable, chamuscones en la ropa.',
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
 * Las tropas de élite de cada ejército: las de «Elite» en `NuevaJugabilidad.md`
 * y, las que su ficha no nombra, las que produce una ciudad en su tabla de
 * edificios (Armería → rodeleros, Fundición → culebrinas). El resto de `UNIDADES` es
 * tropa y `HEROES`, héroes. Lo lee el visor de 8 direcciones para agruparlas.
 */
export const ELITE: ReadonlySet<string> = new Set([
  'templario-monje',
  'templario-hermano-de-carga',
  'templario-penitente',
  'caballero-de-la-muerte',
  'espectro',
  'jinete-de-plaga',
  'imperio-coracero',
  'imperio-arcabucero',
  'imperio-rodelero',
  'imperio-artillero-culebrina',
  'imperio-pistolero-montado',
  'imperio-granadero',
  'elfo-jinete',
  'elfo-sacerdotisa',
  'elfo-asesino',
  'troll-maza',
  'goblin-jinete-de-hiena',
  'orko-armadura-pesada',
]);

export type RangoDeUnidad = 'heroe' | 'elite' | 'tropa';

/** Héroe, élite o tropa: el héroe por estar en `HEROES`, la élite por `ELITE`. */
export function rangoDe(u: Unidad): RangoDeUnidad {
  if (HEROES.includes(u)) return 'heroe';
  return ELITE.has(u.id) ? 'elite' : 'tropa';
}

/**
 * El juego de armas del Y Bot de cada unidad, **por lo que lleva en la mano** y
 * no por su perfil de poses (decisión del usuario, vuelta 1 de QA de las 8
 * direcciones): con el perfil, el piquero salía con mandoble y el goblin lancero
 * con espada y escudo, porque el perfil se eligió para pintar una hoja de una
 * dirección y no para decir qué arma lleva. La regla con la que se rellenó, fila
 * a fila contra el `aspecto` de cada unidad:
 *  - pica, alabarda, lanza o jabalina → `lanza`;
 *  - bastón o báculo de monje, mago, chamán, druida, nigromante o liche → `baston`;
 *  - mandoble, hacha o cuchilla empuñada a dos manos → `dos-manos`;
 *  - maza → `maza`; mayal → `mayal`;
 *  - a caballo con lanza → `montado-lanza`; con pistola → `montado-pistola`; con arco → `montado-arco`;
 *  - granada de mano → `granada`;
 *  - arco en la mano → `arco` (el explorador elfo no: pelea con sus dos
 *    cuchillos y el arco lo lleva a la espalda);
 *  - ballesta, arcabuz, culebrina de mano o el rifle del ingeniero → `ballesta`, como ya hacía la
 *    ballesta de una dirección con el arcabuz;
 *  - el resto —espada, hacha de una mano, dos armas, cuchillos, sin armas— →
 *    `espada-escudo`.
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
  'esqueleto-arquero': 'arco',
  zombi: 'espada-escudo',
  'caballero-de-la-muerte': 'dos-manos',
  espectro: 'espada-escudo',
  'jinete-de-plaga': 'montado-lanza',
  'imperio-alabardero': 'lanza',
  'imperio-piquero': 'lanza',
  'imperio-ballestero': 'ballesta',
  'imperio-coracero': 'espada-escudo',
  'imperio-arcabucero': 'ballesta',
  'imperio-rodelero': 'espada-escudo',
  'imperio-artillero-culebrina': 'ballesta',
  'imperio-pistolero-montado': 'montado-pistola',
  'imperio-granadero': 'granada',
  'elfo-arquero': 'arco',
  'elfo-explorador': 'espada-escudo',
  'elfo-guardia-del-bosque': 'lanza',
  'elfo-jinete': 'montado-arco',
  'elfo-sacerdotisa': 'baston',
  'elfo-asesino': 'espada-escudo',
  'orko-hacha-escudo': 'espada-escudo',
  'orko-dos-armas': 'espada-escudo',
  'goblin-lancero': 'lanza',
  'goblin-arquero': 'arco',
  'troll-maza': 'maza',
  'goblin-jinete-de-hiena': 'montado-lanza',
  'orko-armadura-pesada': 'dos-manos',
  'heroe-templario-caballero': 'espada-escudo',
  'heroe-templario-abad': 'baston',
  'heroe-templario-inquisidor': 'maza',
  'heroe-templario-gran-maestre': 'dos-manos',
  'heroe-nigromante': 'baston',
  'heroe-vampiro': 'espada-escudo',
  'heroe-lich': 'baston',
  'heroe-imperio-duelista': 'espada-escudo',
  'heroe-imperio-mago': 'baston',
  'heroe-imperio-capitan-mercenario': 'espada-escudo',
  'heroe-imperio-ingeniero': 'ballesta',
  'heroe-elfo-danzante-de-espadas': 'espada-escudo',
  'heroe-elfo-druida': 'baston',
  'heroe-elfo-cantora': 'espada-escudo',
  'heroe-orko-kaudillo': 'dos-manos',
  'heroe-goblin-jefe': 'espada-escudo',
  'heroe-goblin-chaman': 'baston',
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
 * El perfil de arma con que la arena viste una unidad (`KIT_DEL_PERFIL`): el que
 * declara (`perfilEnLaArena`) o, si no, el de su hoja de pose.
 */
export function perfilDeUnidad(u: Unidad): PerfilDeUnidad {
  return u.perfilEnLaArena ?? u.perfil;
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
  // El Imperio (04-10-2026).
  'imperio-alabardero',
  'imperio-piquero',
  'imperio-ballestero',
  'imperio-coracero',
  'imperio-arcabucero',
  'imperio-rodelero',
  'imperio-artillero-culebrina',
  'imperio-granadero',
  // Como el hermano de carga, de `montura.ts --8d --pistola`.
  'imperio-pistolero-montado',
  'heroe-imperio-duelista',
  'heroe-imperio-mago',
  'heroe-imperio-capitan-mercenario',
  'heroe-imperio-ingeniero',
  // Los Elfos (05-10-2026).
  'elfo-arquero',
  'elfo-explorador',
  'elfo-guardia-del-bosque',
  'elfo-sacerdotisa',
  'elfo-asesino',
  'heroe-elfo-danzante-de-espadas',
  'heroe-elfo-druida',
  'heroe-elfo-cantora',
  // Como el hermano de carga, de `montura.ts --8d --arco`.
  'elfo-jinete',
  'orko-hacha-escudo',
  'orko-dos-armas',
  'goblin-lancero',
  'goblin-arquero',
  'troll-maza',
  'goblin-jinete-de-hiena',
  'orko-armadura-pesada',
  'heroe-orko-kaudillo',
  'heroe-goblin-jefe',
  'heroe-goblin-chaman',
  'esqueleto-guerrero',
  'esqueleto-arquero',
  'zombi',
  'caballero-de-la-muerte',
  'espectro',
  'jinete-de-plaga',
  'heroe-nigromante',
  'heroe-vampiro',
  'heroe-lich',
] as const;

export const EN_OCHO_DIRECCIONES: Readonly<Record<string, JuegoEn8d>> = Object.fromEntries(
  IDS_EN_OCHO_DIRECCIONES.map((id) => [id, juegoDelYBot(unidad(id))]),
);

/** Los juegos de armas con poses del Y Bot en 8 direcciones (`JuegoEn8d`). */
export const JUEGOS_EN_8D: readonly JuegoEn8d[] = [
  ...(Object.keys(JUEGOS_DE_ARMAS) as (keyof typeof JUEGOS_DE_ARMAS)[]),
  'montado-lanza',
  'montado-pistola',
  'montado-arco',
];

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * Cuánto arte propio tiene una unidad en las ocho direcciones —`dN/atlas.json`
 * y `dN/atlas.webp` en cada una—: entero, ninguno o a medias, y entonces con el
 * motivo escrito. Una figura no mezcla las luces de dos artes, así que con siete
 * se pintaría entera con el Y Bot, y eso tiene que decirse y no pasar en
 * silencio. A medias es lo normal **mientras el taller genera** una unidad
 * dirección a dirección (#140): por eso esto no lanza y decide quien lo lee.
 */
export type ArteEnOchoDirecciones =
  | { readonly hecho: 'entero' }
  | { readonly hecho: 'ninguno' }
  | { readonly hecho: 'a-medias'; readonly motivo: string };

export function arteEnOchoDirecciones(raiz: string, id: string): ArteEnOchoDirecciones {
  const faltan = NOMBRES_DE_DIRECCION.map((_, d) => d).filter(
    (d) =>
      !['atlas.json', 'atlas.webp'].every((f) =>
        existsSync(join(raiz, 'assets/unidades', id, `d${d}`, f)),
      ),
  );
  if (faltan.length === 0) return { hecho: 'entero' };
  if (faltan.length === NOMBRES_DE_DIRECCION.length) return { hecho: 'ninguno' };
  return {
    hecho: 'a-medias',
    motivo: `${id} tiene ${NOMBRES_DE_DIRECCION.length - faltan.length} de sus ${NOMBRES_DE_DIRECCION.length} direcciones (le faltan ${faltan.map((d) => `d${d}`).join(', ')}): o se terminan o se quitan, porque con menos se pintaría entera con el Y Bot sin decirlo`,
  };
}

/**
 * ¿Tiene la unidad su arte propio en las ocho direcciones? `true` con las ocho
 * y `false` sin ninguna; con algunas **lanza** con el motivo. Lo lee el visor
 * del taller (`vista-8d.ts`), que enseña lo hecho y no tiene dónde decir «a
 * medias»; la arena lo lista como incompleta (`hojasDelTaller`).
 */
export function tieneSusOchoDirecciones(raiz: string, id: string): boolean {
  const arte = arteEnOchoDirecciones(raiz, id);
  if (arte.hecho === 'a-medias') throw new Error(arte.motivo);
  return arte.hecho === 'entero';
}

/** Las poses de 8 direcciones de una unidad: las de su juego de armas. */
function dirPoses8d(u: Unidad): string {
  const juego = EN_OCHO_DIRECCIONES[u.id];
  if (juego === undefined)
    throw new Error(`${u.id} no está en 8 direcciones (EN_OCHO_DIRECCIONES)`);
  return relative(RAIZ, u.maniqui === undefined ? carpetaDePoses(juego) : carpetaDeManiqui(u.id));
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

/**
 * Las hojas de una unidad por dirección, con su pose y el giro aprobado como
 * identidad: la A y la B, 16, y la C del disparo si su juego dispara, 24. Quien
 * no dispara genera exactamente lo mismo que antes de existir la C.
 */
export function encargosDeOchoDirecciones(u: Unidad): Encargo[] {
  encargoDeGiro(u);
  const juego = EN_OCHO_DIRECCIONES[u.id] as JuegoEn8d;
  const cuerpoACuerpo = cuerpoACuerpoDe(juego, u.maniqui);
  const hojas = hojasDeFigura(clipDeDisparoDe(juego) !== null);
  return Array.from({ length: NOMBRES_DE_DIRECCION.length }, (_, d) =>
    hojas.map(
      (hoja): Encargo => ({
        id: `${u.id}-d${d}-${hoja}`,
        tipo: 'atlas',
        descripcion: [
          u.aspecto,
          `En la lámina de giro (imagen 2), la figura ${d + 1} en orden de lectura es la que mira hacia «${NOMBRES_DE_DIRECCION[d]}», como esta hoja: así se ve el personaje desde este lado.`,
          // Quien dispara lleva su arma de tiro en todas sus hojas menos en el
          // ataque: ahí pelea de cerca y el pintor tiene que saber con qué.
          ...((HOJAS_DE_FIGURA[hoja] as readonly ClipDeFigura[]).includes('attack') &&
          cuerpoACuerpo !== null
            ? [
                `El ATAQUE de esta hoja es cuerpo a cuerpo con ${cuerpoACuerpo}: no dispara, y el arma de tiro no se ve mientras golpea.`,
              ]
            : []),
          PINTURA,
        ].join('\n'),
        referencias: [
          // La pose como mapa de profundidad (decisión del usuario, 10-10-2026,
          // tras las pruebas del vampiro): el volumen del maniquí y no su color.
          // Solo el maniquí propio tiene profundidad; los montados (la montura
          // no la renderiza) siguen con la pose en color.
          u.maniqui === undefined
            ? { ruta: `${dirPoses8d(u)}/d${d}-${hoja}.png`, papel: 'pose' }
            : { ruta: `${dirPoses8d(u)}/d${d}-${hoja}.profundidad.png`, papel: 'pose-profundidad' },
          { ruta: `${rutaGiro(u)}.webp`, papel: 'identidad' },
          ...(u.concepto === undefined ? [] : [{ ruta: u.concepto, papel: 'estilo' as const }]),
        ],
        salida: `assets/unidades/${u.id}/d${d}/hoja-${hoja}`,
        fondo: 'transparente',
        celda: 384,
        ...(u.talla === undefined ? {} : { talla: u.talla }),
        ocho: { direccion: d, hoja },
      }),
    ),
  ).flat();
}
