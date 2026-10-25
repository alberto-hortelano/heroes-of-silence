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
import { cuerpoConSusCifras } from '../cuerpo.js';
import { EXPERIENCIA } from '../data.js';
import type { Equipo, UnitInfo, Veterania } from '../types.js';
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
 * **En el rango 1 devuelve la MISMA referencia**, no una copia.
 *
 * Es la ÚNICA regla de cifras por rango: la llaman `cifrasDeUnidad` y
 * `cifrasDelIndividuo` —que es lo que leen la IA, el agente, el panel y el
 * tablero—, y un test exige que las puertas de la tropa den lo mismo. Si cada una sumara por su cuenta, el día que
 * cambie `porRango` divergirían sin que nada se pusiera rojo.
 */
export function cifrasVeteranas<U extends UnitInfo>(unit: U, rango: number): U {
  if (rango <= 1) return unit;
  // El rango sube las primitivas del cuerpo y lo derivado se vuelve a sacar de
  // ellas (`cifrasDelCuerpo`); con el equipo ya puesto, lo que sumó el equipo se
  // perdería sin decirlo. Por eso el rango va antes que el equipo, siempre.
  if (unit.equipo !== undefined && Object.keys(unit.equipo).length > 0) {
    throw new Error(
      `${unit.name}: las cifras del rango se suman al cuerpo antes que el equipo, y ya lleva puesto algo`,
    );
  }
  const subidas = rango - 1;
  const por = EXPERIENCIA.porRango;
  return cuerpoConSusCifras({
    ...unit,
    attack: unit.attack + por.ataque * subidas,
    fuerza: unit.fuerza + por.fuerza * subidas,
    agilidad: unit.agilidad + por.agilidad * subidas,
  });
}

/**
 * Las cifras de un personaje sobre las de su perfil: su veteranía y lo que lleva
 * puesto. **La regla de «perfil + hoja»**: la llaman las dos ramas del personaje,
 * `troopUnit` y `resolveUnit`. La de una unidad del catálogo es `cifrasDeUnidad`
 * (`core/catalogo.ts`), que suma lo de serie y lo suyo de una vez.
 *
 * Sin hoja, o con una de rango 1 y sin piezas, devuelve **la misma referencia**.
 */
export function cifrasDelIndividuo<U extends UnitInfo>(
  unit: U,
  hoja: Pick<Veterania, 'experiencia' | 'equipo'> | null | undefined,
  deSerie?: Equipo,
): U {
  const equipo = deSerie === undefined ? hoja?.equipo : { ...deSerie, ...hoja?.equipo };
  return conEquipo(cifrasVeteranas(unit, rangoDeTropa(hoja)), equipo);
}
