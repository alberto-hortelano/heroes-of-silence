/**
 * La experiencia y los rangos: **una tabla para la tropa y para el héroe**.
 *
 * **Es una regla nuestra, no la del original.** La pidió el usuario
 * (`NuevaJugabilidad.md`, «Experiencia»): se gana por daño —`PV quitados ×
 * índice de poder del que los recibe` (`indiceDePoder`; 100-199 un nivel 1,
 * 300-399 un nivel 3), gane o pierda la batalla— y lo que cuesta cada rango
 * crece en Fibonacci. **Sin coma flotante**: el índice es el nivel en
 * centésimas, y en vez de dividir el producto entre 100 los umbrales van en la
 * misma escala (`base` 16 000), así que todo es un producto de enteros.
 *
 * **Rango y nivel son dos cosas** (decisión del usuario, 12-10-2026): la
 * experiencia da RANGOS (1-5 la tropa; el héroe, del 5 sin tope) y cada rango
 * suma cifras (`cifrasVeteranas`); el NIVEL es la primera cifra del índice de
 * poder de esas cifras (`nivelDeUnidad`, `core/nivel.ts`) y no se escribe aquí. Sustituye a la tabla de 40 filas de fheroes2
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
import { conEquipo } from './equipo.js';

/**
 * Lo que cuesta llegar a cada rango: `UMBRALES[n − 1]` es el del rango `n`.
 *
 * Se calcula una vez, siguiendo la recurrencia de Fibonacci más allá de la
 * lista del JSON, **hasta que deja de caber en un entero seguro**: más allá un
 * `+` ya no es exacto, y un umbral que redondea es un rango que llega un punto
 * antes en una máquina que en otra. Con base 16 000 son unos 70 rangos; ningún
 * héroe pasa del 11 en mil partidas (medido con tools/qa/veterania.ts 1000,
 * 12-10-2026).
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

/** La experiencia con la que se alcanza el rango `n` (el 1 es gratis). */
export function umbral(rango: number): number {
  if (!Number.isSafeInteger(rango) || rango < 1) {
    throw new Error(`no hay rango ${rango}: los rangos van del 1 en adelante`);
  }
  const u = UMBRALES[rango - 1];
  if (u === undefined) {
    throw new Error(`el rango ${rango} pide más experiencia de la que cabe en un entero`);
  }
  return u;
}

/**
 * El rango que da esa experiencia, sin pasar de `tope`. Sin tope —un héroe—
 * sube mientras la tabla dé.
 */
export function rangoDe(experiencia: number, tope = UMBRALES.length): number {
  if (!Number.isSafeInteger(experiencia) || experiencia < 0) {
    throw new Error(`la experiencia es un entero ≥ 0, no ${experiencia}`);
  }
  let rango = 1;
  while (rango < tope && experiencia >= (UMBRALES[rango] ?? Infinity)) rango++;
  return rango;
}

/** El tope de la tropa. El héroe no tiene (decisión del usuario, 02-10-2026). */
export const RANGO_MAXIMO_DE_TROPA: number = EXPERIENCIA.rangoMaximoDeTropa;

/**
 * **Una sola escala de rangos**: la tropa va del 1 al 5 y todo héroe EMPIEZA en
 * el 5 —el inicial, el contratado y el veterano que se haga héroe (ciclo B)—, y
 * sube por la misma tabla (6, 7, 8…). Decisión del usuario tras medir el ciclo A:
 * «si la tropa pasa a héroe con nivel 5, la base de héroe debería ser 5» (hoy ese
 * «nivel» se llama rango: el nivel es el de sus cifras).
 *
 * **Derivado del tope de la tropa y no escrito aparte**: es la misma frontera
 * vista desde los dos lados, y un `rangoInicialDeHeroe: 5` en el JSON al lado de
 * `rangoMaximoDeTropa: 5` serían dos cifras que alguien movería por separado.
 */
export const RANGO_INICIAL_DE_HEROE: number = RANGO_MAXIMO_DE_TROPA;

/**
 * El rango de un héroe. **Derivado de su experiencia y no guardado**: un
 * `Hero.level` al lado de `Hero.experience` era el mismo hecho escrito dos
 * veces, y hacía falta un bucle en `ganarExperiencia` que los resincronizara y
 * una pareja de constantes —rango y experiencia iniciales— que tenían que
 * cuadrar en cada sitio que crea un héroe. Ahora nace con su experiencia y el
 * rango sale de ella, igual que el de la tropa sale de su hoja. Su **nivel** es
 * el de su cuerpo (`nivelDeUnidad(heroUnit(hero))`).
 */
export function rangoDeHeroe(hero: { readonly experience: number }): number {
  return rangoDe(hero.experience);
}

/** La experiencia con la que nace un héroe: la que da su rango inicial. */
export const EXPERIENCIA_INICIAL_DE_HEROE: number = umbral(RANGO_INICIAL_DE_HEROE);

/**
 * Los rangos que un héroe lleva por encima del inicial: lo que multiplica cada
 * `porRango` de su cuerpo (`heroUnit`) y de su liderazgo (`heroLeadership`).
 *
 * Es la reindexación entera en una función: uno de rango 5 tiene lo que antes
 * tenía uno de nivel 1. Las dos lectoras pasan por aquí porque, escrita a mano
 * en cada una, un `rango − 1` olvidado le regalaría cuatro rangos al héroe sin
 * que nada se pusiera rojo. **Lanza por debajo del inicial**: un héroe de rango
 * 1 no existe, y uno que lo fuera es un héroe construido a mano con la escala
 * vieja.
 */
export function subidasDeRango(rango: number): number {
  if (!Number.isSafeInteger(rango) || rango < RANGO_INICIAL_DE_HEROE) {
    throw new Error(
      `un héroe de rango ${rango} no existe: todo héroe empieza en el ${RANGO_INICIAL_DE_HEROE}, la escala es la de la tropa`,
    );
  }
  return rango - RANGO_INICIAL_DE_HEROE;
}

/**
 * El rango de un individuo: 1 si es un novato. Acepta los dos vacíos porque los
 * dos existen: el campo opcional de `Troop` (`undefined`) y el origen del stack
 * de batalla (`null`, que sí viaja por JSON).
 */
export function rangoDeTropa(veterania: Pick<Veterania, 'experiencia'> | null | undefined): number {
  return veterania == null ? 1 : rangoDe(veterania.experiencia, RANGO_MAXIMO_DE_TROPA);
}

/**
 * La experiencia que le falta para el rango siguiente, como umbral absoluto
 * (lo que se pinta como «450 / 600»); `null` si ya está en el tope.
 */
export function siguienteUmbral(experiencia: number, tope = UMBRALES.length): number | null {
  const rango = rangoDe(experiencia, tope);
  if (rango >= tope) return null;
  return UMBRALES[rango] ?? null;
}

/**
 * Las cifras de un individuo de ese rango: las de su base con `porRango` sumado
 * por cada rango por encima del 1. Su nivel no se toca: sale de estas cifras.
 *
 * **En el rango 1 devuelve la MISMA referencia**, no una copia: el stack de un
 * novato sigue llevando la `Creature` del catálogo, y eso es lo que deja al
 * espectador rehacer sus cifras del catálogo y al volcado del banco quedarse
 * igual para quien no ha ganado nada.
 *
 * Es la ÚNICA regla de cifras por rango: la llaman `troopUnit` —que es lo que
 * leen la IA, el agente y el panel— y `resolveUnit` —lo que pisa el tablero—, y
 * un test exige que den lo mismo. Si cada una sumara por su cuenta, el día que
 * cambie `porRango` divergirían sin que nada se pusiera rojo.
 */
export function cifrasVeteranas<U extends UnitInfo>(unit: U, rango: number): U {
  if (rango <= 1) return unit;
  const subidas = rango - 1;
  return {
    ...unit,
    attack: unit.attack + EXPERIENCIA.porRango.ataque * subidas,
    defense: unit.defense + EXPERIENCIA.porRango.defensa * subidas,
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
 * suyos— y, en el rango 1, **la misma referencia** del catálogo.
 *
 * `veterania` pide la experiencia y el equipo porque es lo único que decide
 * las cifras: por el cable del espectador viaja eso y no la hoja entera.
 */
export function cifrasDeCatalogo(
  creatureId: string,
  veterania: Pick<Veterania, 'experiencia' | 'equipo'> | null | undefined,
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
  const cifras = cifrasDelIndividuo(base, veterania);
  CIFRAS_POR_HOJA.set(veterania, cifras);
  return cifras;
}

/**
 * Las cifras de un individuo sobre las de su cuerpo —el catálogo o el perfil de
 * su personaje—: su veteranía y lo que lleva puesto. **La única regla de
 * «cuerpo + hoja»**: la llaman `cifrasDeCatalogo` y las dos ramas del personaje,
 * `troopUnit` y `resolveUnit`. Con el equipo eran tres sitios donde sumar las
 * piezas, y el que se olvidara de una dejaría a la IA viendo unas cifras y al
 * tablero jugando otras.
 *
 * Sin hoja, o con una de rango 1 y sin piezas, devuelve **la misma referencia**.
 */
export function cifrasDelIndividuo<U extends UnitInfo>(
  unit: U,
  hoja: Pick<Veterania, 'experiencia' | 'equipo'> | null | undefined,
): U {
  return conEquipo(cifrasVeteranas(unit, rangoDeTropa(hoja)), hoja?.equipo);
}

/**
 * Las cifras ya calculadas de cada hoja de veterano. Débil para que una hoja
 * que ya no lleva nadie —el veterano murió, o volvió con otra— no se quede en
 * memoria. No es estado de la partida: es una función pura recordada.
 */
const CIFRAS_POR_HOJA = new WeakMap<object, Creature>();
