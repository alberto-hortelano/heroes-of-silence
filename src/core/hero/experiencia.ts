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
 * poder de esas cifras (`nivelDeUnidad`, `unidad/nivel.ts`) y no se escribe aquí. Sustituye a la tabla de 40 filas de fheroes2
 * (`GetExperienceFromLevel`) y a sus +500 por héroe y por asedio, que siguen en
 * el historial de git con su lección: aquella tabla se citó mal una vez, y por
 * eso esta no cita a nadie.
 *
 * Las cifras viven en `data/experiencia.json`, que lee y valida al cargar
 * `rango.ts`, con la tabla de los rangos (`UMBRALES`, `rangoDeTropa`,
 * `rangoDeHeroe`: estaban aquí hasta la fase N de la reorganización, 07-11-2026);
 * aquí queda lo que suma cada rango a unas cifras (`cifrasVeteranas`). Solo hay
 * cuentas enteras: sumas y productos de enteros, nada de `**` ni
 * de `Math.pow`, que es lo que vigila `test/invariantes.test.ts` para que el
 * banco valga fuera de esta máquina.
 */
import { conEquipo } from '../equipo/vestir.js';
import type { UnitInfo, Veterania } from '../types.js';
import { cuerpoConSusCifras } from '../unidad/cuerpo.js';
import { EXPERIENCIA, rangoDeTropa } from './rango.js';

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
 * Las cifras de un individuo sobre las de un cuerpo dado: su veteranía y lo que
 * lleva puesto. Lo llama el retoque de la arena (`aplicarAlTipo`), que pone las
 * cifras nuevas de un tipo a cada stack con su hoja encima. La de una unidad del
 * catálogo es `cifrasDeUnidad` (`unidad/catalogo.ts`), que suma lo de serie y lo
 * suyo de una vez.
 *
 * Sin hoja, o con una de rango 1 y sin piezas, devuelve **la misma referencia**.
 */
export function cifrasDelIndividuo<U extends UnitInfo>(
  unit: U,
  hoja: Pick<Veterania, 'experiencia' | 'equipo'> | null | undefined,
): U {
  return conEquipo(cifrasVeteranas(unit, rangoDeTropa(hoja)), hoja?.equipo);
}
