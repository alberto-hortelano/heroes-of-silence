/**
 * Los nombres de las 8 direcciones de una unidad, en el orden de sprite-forge:
 * gira al maniquí `rotation.y = 2π·d/8` y la 0 mira a la cámara. Cada nombre
 * dice hacia dónde mira la figura en pantalla.
 */
export const NOMBRES_DE_DIRECCION = [
  'frente',
  'frente-derecha',
  'derecha',
  'espalda-derecha',
  'espalda',
  'espalda-izquierda',
  'izquierda',
  'frente-izquierda',
] as const;
