/**
 * Los rangos de la experiencia: **una tabla para la tropa y para el héroe**, de
 * `data/experiencia.json` (`EXPERIENCIA`, que se valida al cargar). Lo que cuesta
 * cada rango crece en Fibonacci (`UMBRALES`), en enteros; el rango de un individuo
 * (`rangoDeTropa`, del 1 al `RANGO_MAXIMO_DE_TROPA`) y el de un héroe
 * (`rangoDeHeroe`, del `RANGO_INICIAL_DE_HEROE` en adelante, sin tope) se derivan
 * de su experiencia. Qué es la experiencia, cómo se gana y lo que suma cada rango,
 * en `experiencia.ts`.
 *
 * Es una hoja: no importa del núcleo más que `types.ts` y `validar.ts`, porque la
 * lee la forma de la batalla (`battle/types.ts`, el rango de un stack), que al
 * cargarse no tiene por qué arrastrar el cuerpo ni el equipo de una unidad (lo
 * que importa `experiencia.ts` para sumar el rango a sus cifras). Era parte de
 * `hero/experiencia.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import experienciaJson from '../../../data/experiencia.json' with { type: 'json' };
import type { Veterania } from '../types.js';
import { enteroBlocker, enteroDesde, problemasDeObjeto } from '../validar.js';

/**
 * Las reglas de la experiencia, de `data/experiencia.json`. **Regla nuestra y
 * no del original**, y así lo dice su `_comment`: sustituye a la tabla de
 * fheroes2. Los umbrales los resuelve este módulo (`UMBRALES`) y las cifras de cada
 * rango, `hero/experiencia.ts` (`cifrasVeteranas`); esto solo las lee y las valida.
 */
interface ReglasDeExperiencia {
  /** Lo que cuesta el primer rango: subir del n al n+1 cuesta `base × incrementos[n−1]`. */
  readonly base: number;
  /** Los primeros incrementos, Fibonacci; más allá se siguen por la recurrencia. */
  readonly incrementos: readonly number[];
  /** El tope de la tropa. El héroe no tiene. */
  readonly rangoMaximoDeTropa: number;
  /**
   * Lo que suma cada rango por encima del 1 al ataque, la fuerza y la agilidad del
   * cuerpo (25-10-2026: la defensa ya no se escribe, sale de la agilidad).
   */
  readonly porRango: {
    readonly ataque: number;
    readonly fuerza: number;
    readonly agilidad: number;
  };
}

/**
 * Valida unas reglas de experiencia y las devuelve tipadas. **Lanza con todos los
 * problemas a la vez**, escritos para quien edita el JSON. Exportada con el JSON
 * de argumento para que un test pueda darle uno roto y verla morder.
 *
 * Las habilidades por rango de cada criatura (inertes) se fueron con
 * `data/creatures.json` (19-10-2026): las unidades del catálogo llevan las suyas
 * (`Unidad.habilidades`), y un campo `habilidades` aquí se rechaza.
 */
export function validarExperiencia(
  json: unknown,
  fichero = 'data/experiencia.json',
): ReglasDeExperiencia {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  if (!enteroDesde(j.base, 1)) problemas.push(`base tiene que ser un entero ≥ 1 y es ${j.base}`);
  const rangoMax = j.rangoMaximoDeTropa;
  if (!enteroDesde(rangoMax, 2)) {
    problemas.push(`rangoMaximoDeTropa tiene que ser un entero ≥ 2 y es ${rangoMax}`);
  }
  const inc = j.incrementos;
  if (!Array.isArray(inc) || inc.length < 2 || !inc.every((x) => enteroDesde(x, 1))) {
    problemas.push(
      `incrementos tiene que ser una lista de al menos dos enteros ≥ 1 —los dos primeros siembran la recurrencia— y es ${JSON.stringify(inc)}`,
    );
  } else {
    const n = inc as number[];
    for (let k = 2; k < n.length; k++) {
      const [a, b, c] = [n[k - 2] as number, n[k - 1] as number, n[k] as number];
      if (c !== a + b) {
        problemas.push(
          `incrementos no es Fibonacci: el ${k + 1}.º es ${c} y tendría que ser ${b} + ${a} = ${a + b}`,
        );
        break;
      }
    }
  }
  const CAMPOS_POR_RANGO = ['ataque', 'fuerza', 'agilidad'] as const;
  problemas.push(...problemasDeObjeto(j.porRango, CAMPOS_POR_RANGO).map((p) => `porRango: ${p}`));
  const por = (j.porRango ?? {}) as Record<string, unknown>;
  for (const campo of CAMPOS_POR_RANGO) {
    const motivo = enteroBlocker(por[campo], 0);
    if (motivo !== null) problemas.push(`porRango.${campo} ${motivo}`);
  }
  const ajeno = Object.keys(j).find(
    (k) => !['_comment', 'base', 'incrementos', 'rangoMaximoDeTropa', 'porRango'].includes(k),
  );
  if (ajeno !== undefined) problemas.push(`«${ajeno}» no es un campo de la experiencia`);
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    base: j.base as number,
    incrementos: [...(inc as number[])],
    rangoMaximoDeTropa: rangoMax as number,
    porRango: {
      ataque: por.ataque as number,
      fuerza: por.fuerza as number,
      agilidad: por.agilidad as number,
    },
  };
}

export const EXPERIENCIA: ReglasDeExperiencia = validarExperiencia(experienciaJson);

/**
 * Lo que cuesta llegar a cada rango: `UMBRALES[n − 1]` es el del rango `n`.
 *
 * Se calcula una vez, siguiendo la recurrencia de Fibonacci más allá de la
 * lista del JSON, **hasta que deja de caber en un entero seguro**: más allá un
 * `+` ya no es exacto, y un umbral que redondea es un rango que llega un punto
 * antes en una máquina que en otra. Con base 16 000 son unos 70 rangos; ningún
 * héroe pasa del 11 en mil partidas (medido con tools/qa/medidas/veterania.ts 1000,
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
