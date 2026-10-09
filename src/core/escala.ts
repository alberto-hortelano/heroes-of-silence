/**
 * La escala del mapa (#226): cuánto mide una región y, de ahí, cuánto anda un
 * héroe al día. Son un solo hecho: si el mapa crece y la marcha no, la partida
 * se alarga; por eso la marcha se deriva del área y no se escribe aparte.
 */

/**
 * Casillas de mapa por pareja de regiones de fuera: la cuenta que une el lado
 * y las regiones (`ladoDelMapa`, `regionesDelMapa`, en `map/generate.ts`).
 *
 * Era 144, y con la frontera de una casilla y el suelo libre bastaba. Con
 * fronteras de 2-3 casillas, obstáculos que bloquean y los objetos de siempre,
 * las regiones de 144 se quedaban en 25-35 casillas pisables y el generador no
 * encontraba sitio: en 30 semillas de 36×36, 29 sin mapa. La palanca que eligió
 * el usuario es **dar más área**, no bajar `REGION_MINIMA` ni adelgazar la
 * frontera. Medido (03-10-2026, 30 semillas por celda): con 200 fallaban 1-8
 * de 30; con 300, 0 de 100 en 24, 28, 32, 36, 40 y 48.
 *
 * **450 desde #226** (decisión del usuario, 09-10-2026: «mismos elementos en
 * un mapa con más espacio para que los espacios entre caminos sean más grandes
 * y quepan mejor las cosas»): el área ×1,5 con las mismas regiones, minas,
 * ciudades y objetos; el mapa por defecto pasa de 34×34 a 42×42. La marcha
 * sube con la raíz (`marchaALaEscala`) para que la partida dure lo mismo.
 */
export const AREA_POR_REGION = 450;

/**
 * El área por región con que se calibró todo hasta #226: 300. Con ella la
 * marcha de fheroes2 (`SPEED_TO_MOVE_POINTS`, citada tal cual) dio la duración
 * elegida al fijar las regiones (#195), y se midieron los techos de rectitud
 * (#169, `tools/qa/rectitud.ts`). Con más área, la marcha y los largos de esas
 * medidas suben en proporción lineal, √(AREA_POR_REGION / AREA_DE_REFERENCIA).
 */
export const AREA_DE_REFERENCIA = 300;

/** ⌊√n⌋ de un entero ≥ 0, por bisección: `core` no usa `Math.sqrt` (`CLAUDE.md`, coma flotante). */
export function raizEntera(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`la raíz entera es de un entero ≥ 0, y se pidió la de ${n}`);
  let bajo = 0;
  let alto = n + 1;
  // Invariante: bajo² ≤ n < alto².
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2);
    if (medio * medio <= n) bajo = medio;
    else alto = medio;
  }
  return bajo;
}

/**
 * Los puntos de marcha de fheroes2 a la escala de este mapa: ×√(AREA_POR_REGION
 * / AREA_DE_REFERENCIA), redondeado hacia abajo (1000 → 1224 con 450). Lineal y
 * no por el área: lo que se anda es una distancia, y el lado del mapa crece con
 * la raíz del área. **Regla nuestra** (#226).
 */
export function marchaALaEscala(puntos: number): number {
  if (!Number.isSafeInteger(puntos) || puntos < 0)
    throw new Error(`los puntos de marcha son un entero ≥ 0, y son ${puntos}`);
  // Exacto en enteros: la división va al final, sobre el cuadrado ya escalado.
  return raizEntera(Math.floor((puntos * puntos * AREA_POR_REGION) / AREA_DE_REFERENCIA));
}

/**
 * Un radio de vista de fheroes2 (`getFogDiscoveryDistance`: héroe 4, castillo 5)
 * a la escala de este mapa: ×√(AREA_POR_REGION / AREA_DE_REFERENCIA), **al
 * entero más cercano** (4 → 5 y 5 → 6 con 450). **Regla nuestra** (#229).
 *
 * Es la misma distancia que la marcha, y por la misma razón: si el mapa crece y
 * la vista no, se ve menos de la partida. Con 4 y 5 en el 42×42 de #226, en
 * 1-400 ninguna semilla tenía a la vez una ruta de dos colores y una guardia a
 * salvo a la que se llegue hoy (en 34×34 eran 9): el héroe andaba más lejos de lo
 * que veía. Al más cercano y no hacia abajo como la marcha: ⌊4 × 1,22⌋ = 4 no
 * escalaría nada, y el radio es una casilla entera, no unos puntos de marcha.
 */
export function radioALaEscala(radio: number): number {
  if (!Number.isSafeInteger(radio) || radio < 0)
    throw new Error(`un radio de vista es un entero ≥ 0, y es ${radio}`);
  // ⌊√x + ½⌋ = ⌊(⌊√(4x)⌋ + 1) / 2⌋, con x = radio² · A / B: todo en enteros.
  const cuatroX = Math.floor((4 * radio * radio * AREA_POR_REGION) / AREA_DE_REFERENCIA);
  return Math.floor((raizEntera(cuatroX) + 1) / 2);
}
