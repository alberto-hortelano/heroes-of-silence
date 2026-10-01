/**
 * Las unidades que pinta el taller, con ids PROVISIONALES: las facciones nuevas
 * todavía no están en el catálogo del juego (llegan en la fase 4). El mapeo de
 * cada id a su unidad de `NuevaJugabilidad.md` está en `docs/art/unidades.md`.
 *
 * De cada unidad salen dos encargos, en este orden:
 *  1. `<id>-identidad`: una lámina con el aspecto, ya a la cámara del juego. Sus
 *     referencias: el maniquí (pose), el concepto de `assets/art/` si lo hay
 *     (identidad: solo el aspecto, porque está dibujado de frente y a la altura
 *     de los ojos) y el atlas de Liora (estilo y escala).
 *  2. `<id>-atlas`: la hoja de reposo, marcha y ataque, con la referencia de
 *     pose de su perfil como primera imagen y la lámina del paso 1 como segunda.
 */
import type { Perfil } from '../art/poses.js';
import type { Encargo } from './encargo.js';

export interface Unidad {
  readonly id: string;
  readonly faccion: 'templarios' | 'no-muertos';
  /** El nombre en `NuevaJugabilidad.md`. */
  readonly nombre: string;
  readonly perfil: Perfil;
  /** La lámina de concepto de `assets/art/`, si la hay. */
  readonly concepto?: string;
  /** Altura en la celda; por defecto la de un adulto (160). */
  readonly altura?: number;
  /** El aspecto. La cámara, la pose y el fondo los pone el taller. */
  readonly aspecto: string;
}

const PINTURA =
  'Estilo: miniatura de fantasía pintada, materiales gastados y legibles, paleta sobria, silueta clara; el acabado de la imagen de estilo.';

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

export const ESTILO = 'assets/characters/liora/atlas.png';

export function unidad(id: string): Unidad {
  const u = UNIDADES.find((x) => x.id === id);
  if (u === undefined) {
    throw new Error(`no hay unidad «${id}». Hay: ${UNIDADES.map((x) => x.id).join(', ')}`);
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
      ...(u.concepto === undefined ? [] : [{ ruta: u.concepto, papel: 'identidad' as const }]),
      { ruta: ESTILO, papel: 'estilo' },
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
      { ruta: ESTILO, papel: 'estilo' },
    ],
    salida: rutaAtlas(u),
    fondo: 'transparente',
    ...(u.altura === undefined ? {} : { alturaObjetivo: u.altura }),
  };
}
