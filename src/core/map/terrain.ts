/**
 * Terrenos del mapa de aventura y lo que cuesta cruzarlos.
 *
 * Los costes están en puntos de movimiento del héroe, que se reparten cada día
 * según la criatura más lenta del ejército (1000 a 1500). Un héroe medio cruza
 * unas doce casillas de hierba al día.
 */
export const TERRAIN_KINDS = [
  'grass',
  'dirt',
  'sand',
  'snow',
  'swamp',
  'lava',
  'rough',
  'water',
  'mountain',
  'forest',
  'cliff',
  'wall',
] as const;

export type TerrainKind = (typeof TERRAIN_KINDS)[number];

/**
 * Lo que cuesta entrar en cada suelo. Solo suelos: una barrera no se pisa y no
 * tiene precio, y desde que el tipo lo dice (`Suelo`) la tabla ya no lleva las
 * entradas muertas que exigía un `Record` del tipo entero.
 */
export const TERRAIN_COST: Readonly<Record<Suelo, number>> = {
  grass: 100,
  dirt: 100,
  lava: 100,
  rough: 125,
  snow: 175,
  swamp: 175,
  sand: 200,
};

/** Un camino abarata el paso, se pinte sobre el terreno que se pinte. */
export const ROAD_COST = 75;

/** Cruzar en diagonal cuesta un 40 % más, como en la serie. */
export const DIAGONAL_FACTOR = 1.4;

/**
 * Lo que cuesta **entrar** en una casilla: la regla, escrita una vez.
 *
 * Vive aquí y no en `map.ts` porque aquí viven sus tres constantes, y desde este
 * ciclo tiene un segundo lector: la prosa que el contrato le manda al agente
 * (`RESPONSE_FORMAT.adventure_turn`), que antes **derivaba las cifras y copiaba
 * la fórmula** — el camino que sustituye al terreno y la diagonal que multiplica
 * y redondea, escritos a mano al lado de los números buenos. Justo lo que el
 * docstring de `stepCost` decía que no podía pasar: «el día que cambie el factor
 * diagonal habría que acordarse de los dos».
 *
 * Que el agente lea números salidos de esta función y no de la tabla es la
 * diferencia entre anunciarle lo que se le va a cobrar y anunciarle una cifra
 * que se parece.
 */
export function costeDeEntrada(terreno: Suelo, camino: boolean, diagonal: boolean): number {
  const base = camino ? ROAD_COST : TERRAIN_COST[terreno];
  return Math.round(diagonal ? base * DIAGONAL_FACTOR : base);
}

/**
 * **Las barreras**: lo que no se pisa. Con ellas se cierran las regiones del mapa
 * de nodos (`regiones.ts`) y se levantan los obstáculos de dentro de una región.
 *
 * Son cinco y **distintas en el motor**, no solo al pintarlas (decisión del
 * usuario, 03-10-2026): hoy las cinco bloquean igual, pero la habilidad de
 * infiltración podrá cruzar unas y otras no, y para eso cada casilla tiene que
 * recordar qué accidente es. El agua es el río o el lago —no hay barcos—, la
 * montaña la cordillera, `forest` el bosque denso, `cliff` el acantilado o el
 * desnivel y `wall` el muro o la ruina.
 *
 * La leen el esquema del agente, la paleta, la validación del plan y la prosa:
 * la lista se escribe aquí y en ningún otro sitio.
 */
export const BARRERAS = ['mountain', 'water', 'forest', 'cliff', 'wall'] as const;

export type Barrera = (typeof BARRERAS)[number];

/** Lo que se pisa: todo terreno que no es barrera. El suelo de una región es uno de estos. */
export type Suelo = Exclude<TerrainKind, Barrera>;

export function esBarrera(t: TerrainKind): t is Barrera {
  return (BARRERAS as readonly TerrainKind[]).includes(t);
}

/** Lo que se pisa: todo lo que no es barrera, derivado y no escrito aparte. */
export function isWalkable(t: TerrainKind): t is Suelo {
  return !esBarrera(t);
}

/** Los suelos, en el orden de `TERRAIN_KINDS`: lo que puede ser el suelo de una región. */
export const SUELOS_PISABLES: readonly Suelo[] = TERRAIN_KINDS.filter(isWalkable);
