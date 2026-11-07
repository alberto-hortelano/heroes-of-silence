/**
 * Los nombres del generador procedimental —de las regiones, las ciudades y los
 * pueblos, nunca dos iguales— y la huella de sus semillas (`huellaDeSemillas`),
 * de la que salen sus corrientes de azar propias: la ondulación de las
 * fronteras y el poblamiento.
 *
 * Eran parte de `map/generate.ts` hasta la fase N de la reorganización
 * (07-11-2026).
 */
import type { Point } from '../../types.js';

const NOMBRES_DE_REGION = [
  'Llanos del Cierzo',
  'Valle Hondo',
  'Robledal',
  'Páramo Gris',
  'Vega del Molino',
  'Hoya de los Cuervos',
  'Campos de Ceniza',
  'Sierra Baja',
  'Navas del Rey',
  'Pinar Viejo',
  'Cañada Real',
  'Tierra Quemada',
  'Marjal',
  'Altozano',
  'Hondonada',
  'Encinar',
];
export const NOMBRES_DE_CIUDAD = [
  'Torreblanca',
  'Puenteroto',
  'Alcázar Hondo',
  'Peñagrís',
  'Castroviejo',
  'Fuenteseca',
  'Monteluz',
  'Valdefrío',
];
export const NOMBRES_DE_PUEBLO = [
  'Aldea del Pozo',
  'Villarrasa',
  'Las Ventas',
  'Molinos',
  'Cabañas',
  'El Soto',
  'Quintana',
  'Hontanar',
];
/** Un nombre de la lista, y si se acaba, el mismo con número: nunca dos iguales. */
export const nombre = (lista: readonly string[], i: number): string =>
  i < lista.length
    ? (lista[i] as string)
    : `${lista[i % lista.length]} ${Math.floor(i / lista.length) + 1}`;

/** El nombre de la región `k` del generador: las dos de casa, por su ciudad. */
export function nombreDeRegion(k: number): string {
  if (k === 0) return 'Tierras de Valdeluz';
  if (k === 1) return 'Tierras de Cripta Gris';
  return nombre(NOMBRES_DE_REGION, k - 2);
}

/** Un entero de 32 bits sacado de las semillas de región: la corriente de la ondulación. */
export function huellaDeSemillas(semillas: readonly Point[]): number {
  let h = 0x2545f491;
  for (const s of semillas) h = Math.imul(h ^ (s.x * 4096 + s.y), 0x9e3779b1) >>> 0;
  return h;
}
