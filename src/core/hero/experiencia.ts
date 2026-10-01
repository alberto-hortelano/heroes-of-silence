/**
 * La experiencia y los niveles: **una tabla para la tropa y para el héroe**.
 *
 * **Es una regla nuestra, no la del original.** La pidió el usuario
 * (`NuevaJugabilidad.md`, «Experiencia»): se gana por daño —`PV quitados ×
 * nivel del que los recibe`, gane o pierda la batalla— y lo que cuesta cada
 * nivel crece en Fibonacci. Sustituye a la tabla de 40 filas de fheroes2
 * (`GetExperienceFromLevel`) y a sus +500 por héroe y por asedio, que siguen en
 * el historial de git con su lección: aquella tabla se citó mal una vez, y por
 * eso esta no cita a nadie.
 *
 * Las cifras viven en `data/experiencia.json` y las valida `data.ts` al cargar.
 * Aquí solo hay cuentas enteras: sumas y productos de enteros, nada de `**` ni
 * de `Math.pow`, que es lo que vigila `test/invariantes.test.ts` para que el
 * banco valga fuera de esta máquina.
 */
import { creature, EXPERIENCIA } from '../data.js';
import type { Creature, UnitInfo, Veterania } from '../types.js';

/**
 * Lo que cuesta llegar a cada nivel: `UMBRALES[n − 1]` es el del nivel `n`.
 *
 * Se calcula una vez, siguiendo la recurrencia de Fibonacci más allá de la
 * lista del JSON, **hasta que deja de caber en un entero seguro**: más allá un
 * `+` ya no es exacto, y un umbral que redondea es un nivel que llega un punto
 * antes en una máquina que en otra. Con base 20 son unos 75 niveles; ningún
 * héroe pasa del 15 en mil partidas (medido con tools/qa/veterania.ts 1000).
 */
const UMBRALES: readonly number[] = (() => {
  const { base } = EXPERIENCIA;
  const incrementos = [...EXPERIENCIA.incrementos];
  const out = [0];
  for (let k = 0; ; k++) {
    if (k >= incrementos.length) {
      incrementos.push((incrementos[k - 1] as number) + (incrementos[k - 2] as number));
    }
    const siguiente = (out[k] as number) + base * (incrementos[k] as number);
    if (!Number.isSafeInteger(siguiente)) return out;
    out.push(siguiente);
  }
})();

/** La experiencia con la que se alcanza el nivel `n` (el 1 es gratis). */
export function umbral(nivel: number): number {
  if (!Number.isSafeInteger(nivel) || nivel < 1) {
    throw new Error(`no hay nivel ${nivel}: los niveles van del 1 en adelante`);
  }
  const u = UMBRALES[nivel - 1];
  if (u === undefined) {
    throw new Error(`el nivel ${nivel} pide más experiencia de la que cabe en un entero`);
  }
  return u;
}

/**
 * El nivel que da esa experiencia, sin pasar de `tope`. Sin tope —un héroe—
 * sube mientras la tabla dé.
 */
export function nivelDe(experiencia: number, tope = UMBRALES.length): number {
  if (!Number.isSafeInteger(experiencia) || experiencia < 0) {
    throw new Error(`la experiencia es un entero ≥ 0, no ${experiencia}`);
  }
  let nivel = 1;
  while (nivel < tope && experiencia >= (UMBRALES[nivel] ?? Infinity)) nivel++;
  return nivel;
}

/** El tope de la tropa. El héroe no tiene (decisión del usuario, 02-10-2026). */
export const NIVEL_MAXIMO_DE_TROPA: number = EXPERIENCIA.nivelMaximoDeTropa;

/**
 * **Una sola escala de niveles**: la tropa va del 1 al 5 y todo héroe EMPIEZA en
 * el 5 —el inicial, el contratado y el veterano que se haga héroe (ciclo B)—, y
 * sube por la misma tabla (6, 7, 8…). Decisión del usuario tras medir el ciclo A:
 * «si la tropa pasa a héroe con nivel 5, la base de héroe debería ser 5».
 *
 * **Derivado del tope de la tropa y no escrito aparte**: es la misma frontera
 * vista desde los dos lados, y un `nivelInicialDeHeroe: 5` en el JSON al lado de
 * `nivelMaximoDeTropa: 5` serían dos cifras que alguien movería por separado.
 * Con base 20 un héroe que estrenaba nivel 2 con 20 de experiencia necesita
 * ahora 160 para el 6: lo que cambia es cuánto cuesta subir, no lo que es.
 */
export const NIVEL_INICIAL_DE_HEROE: number = NIVEL_MAXIMO_DE_TROPA;

/**
 * El nivel de un héroe. **Derivado de su experiencia y no guardado**: un
 * `Hero.level` al lado de `Hero.experience` era el mismo hecho escrito dos
 * veces, y hacía falta un bucle en `ganarExperiencia` que los resincronizara y
 * una pareja de constantes —nivel y experiencia iniciales— que tenían que
 * cuadrar en cada sitio que crea un héroe. Ahora nace con su experiencia y el
 * nivel sale de ella, igual que el de la tropa sale de su hoja.
 */
export function nivelDeHeroe(hero: { readonly experience: number }): number {
  return nivelDe(hero.experience);
}

/** La experiencia con la que nace un héroe: la que da su nivel inicial. */
export const EXPERIENCIA_INICIAL_DE_HEROE: number = umbral(NIVEL_INICIAL_DE_HEROE);

/**
 * Los niveles que un héroe lleva por encima del inicial: lo que multiplica cada
 * `porNivel` de su cuerpo (`heroUnit`) y de su liderazgo (`heroLeadership`).
 *
 * Es la reindexación entera en una función: uno de nivel 5 tiene lo que antes
 * tenía uno de nivel 1. Las dos lectoras pasan por aquí porque, escrita a mano
 * en cada una, un `level − 1` olvidado le regalaría cuatro niveles al héroe sin
 * que nada se pusiera rojo. **Lanza por debajo del inicial**: un héroe de nivel
 * 1 ya no existe, y uno que lo fuera es un héroe construido a mano con la
 * escala vieja.
 */
export function subidasDeHeroe(level: number): number {
  if (!Number.isSafeInteger(level) || level < NIVEL_INICIAL_DE_HEROE) {
    throw new Error(
      `un héroe de nivel ${level} no existe: todo héroe empieza en el ${NIVEL_INICIAL_DE_HEROE}, la escala es la de la tropa`,
    );
  }
  return level - NIVEL_INICIAL_DE_HEROE;
}

/**
 * El nivel de veteranía de un individuo: 1 si es un novato. Acepta los dos
 * vacíos porque los dos existen: el campo opcional de `Troop` (`undefined`) y
 * el origen del stack de batalla (`null`, que sí viaja por JSON).
 */
export function nivelDeTropa(veterania: Pick<Veterania, 'experiencia'> | null | undefined): number {
  return veterania == null ? 1 : nivelDe(veterania.experiencia, NIVEL_MAXIMO_DE_TROPA);
}

/**
 * La experiencia que le falta para el nivel siguiente, como umbral absoluto
 * (lo que se pinta como «45 / 60»); `null` si ya está en el tope.
 */
export function siguienteUmbral(experiencia: number, tope = UMBRALES.length): number | null {
  const nivel = nivelDe(experiencia, tope);
  if (nivel >= tope) return null;
  return UMBRALES[nivel] ?? null;
}

/**
 * Las cifras de un individuo de ese nivel de veteranía: las de su base con
 * `porNivel` sumado por cada nivel por encima del 1.
 *
 * **En el nivel 1 devuelve la MISMA referencia**, no una copia: el stack de un
 * novato sigue llevando la `Creature` del catálogo, y eso es lo que deja al
 * espectador rehacer sus cifras del catálogo y al volcado del banco quedarse
 * igual para quien no ha ganado nada.
 *
 * Es la ÚNICA regla de cifras por nivel: la llaman `troopUnit` —que es lo que
 * leen la IA, el agente y el panel— y `resolveUnit` —lo que pisa el tablero—, y
 * un test exige que den lo mismo. Si cada una sumara por su cuenta, el día que
 * cambie `porNivel` divergirían sin que nada se pusiera rojo.
 */
export function cifrasVeteranas<U extends UnitInfo>(unit: U, nivel: number): U {
  if (nivel <= 1) return unit;
  const subidas = nivel - 1;
  return {
    ...unit,
    attack: unit.attack + EXPERIENCIA.porNivel.ataque * subidas,
    defense: unit.defense + EXPERIENCIA.porNivel.defensa * subidas,
    // Quien le pega a un veterano cobra más: recibe con su nivel más lo vivido.
    nivel: unit.nivel + subidas,
  };
}

/**
 * Las cifras de un individuo del catálogo: las de su criatura con su veteranía
 * sumada. **Es la única regla de «cifras = catálogo + veteranía»**, y tiene tres
 * lectores que antes la escribían cada uno: `troopUnit` —la IA, el agente y el
 * panel—, `resolveUnit` —lo que pisa el tablero— y la inversa del cable del
 * espectador (`espectador/adaptar.ts`), que rehace las cifras que el cable no
 * manda.
 *
 * Devuelve la `Creature` —el precio, la morada y el liderazgo siguen siendo los
 * suyos— y, en el nivel 1, **la misma referencia** del catálogo.
 *
 * `veterania` pide solo la experiencia porque es lo único que decide las
 * cifras: por el cable del espectador viaja eso y no la hoja entera.
 */
export function cifrasDeCatalogo(
  creatureId: string,
  veterania: Pick<Veterania, 'experiencia'> | null | undefined,
): Creature {
  const base = creature(creatureId);
  if (veterania == null) return base;
  // Las cifras de un veterano se guardan por SU hoja: la hoja es inmutable
  // —`settleBattle` escribe una nueva al volver de cada batalla— y es de un
  // solo individuo, así que mientras sea el mismo objeto sus cifras son las
  // mismas. Sin esto, `armyPower` fabricaba una copia por veterano en cada
  // pregunta de la IA. La criatura va en la entrada por si alguien diera la
  // misma hoja a dos criaturas: entonces se recalcula, no se presta.
  const guardadas = CIFRAS_POR_HOJA.get(veterania);
  if (guardadas !== undefined && guardadas.id === creatureId) return guardadas;
  const cifras = cifrasVeteranas(base, nivelDeTropa(veterania));
  CIFRAS_POR_HOJA.set(veterania, cifras);
  return cifras;
}

/**
 * Las cifras ya calculadas de cada hoja de veterano. Débil para que una hoja
 * que ya no lleva nadie —el veterano murió, o volvió con otra— no se quede en
 * memoria. No es estado de la partida: es una función pura recordada.
 */
const CIFRAS_POR_HOJA = new WeakMap<object, Creature>();
