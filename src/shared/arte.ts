/**
 * El contrato visual que comparten el mapa, la batalla y —en la fase 6— el
 * taller de imágenes: la cámara a 25° y una sola luz.
 *
 * Rescatado de `src/shared/rpg-art.ts` de la rama `archivo/gpt-rpg`, y
 * recortado a lo que se pinta hoy. Los prompts de generación se quedaron allí
 * porque no tenían llamante (vuelven con el taller), y `characterMotion`
 * obligaba a traerse `creation-poses.json` para nada.
 *
 * Vive en `shared` y no en `core` porque no es una regla del juego: el motor no
 * sabe a qué ángulo se mira el tablero, y no tiene por qué.
 */
export const ARTE = {
  /** Proyección ortográfica, 25° hacia abajo: las figuras de Y Bot se renderizaron así. */
  camara: { elevacionGrados: 25 },
  luz: {
    // Coordenadas de pantalla: x a la derecha, y hacia abajo.
    direccionSombra: { x: 1, y: 0.6 },
    longitudPorAltura: 0.42,
    opacidad: 0.18,
  },
} as const;

/** Cuánto se aplasta el suelo visto a 25°: `sin 25°`. */
export const COMPRESION_SUELO = Math.sin((ARTE.camara.elevacionGrados * Math.PI) / 180);

/**
 * La sombra de una figura de `altura` píxeles. No admite la orientación del
 * sprite a propósito: si la tuviera, la sombra de un defensor espejado se
 * invertiría y la luz vendría de dos sitios.
 */
export function sombraDeFigura(altura: number): { x: number; y: number; opacidad: number } {
  const { luz } = ARTE;
  const largo = altura * luz.longitudPorAltura;
  const modulo = Math.hypot(luz.direccionSombra.x, luz.direccionSombra.y);
  return {
    x: (largo * luz.direccionSombra.x) / modulo,
    y: (largo * luz.direccionSombra.y) / modulo,
    opacidad: luz.opacidad,
  };
}
