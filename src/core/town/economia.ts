/**
 * La economía, de `data/economia.json`: lo que cuestan y crecen las unidades y sus
 * moradas (por su índice y su nivel), el oro de salida, la renta de un pueblo y el
 * precio de un héroe.
 *
 * Su lector vivía en `data.ts`, con las demás tablas; desde la fase N de la
 * reorganización (07-11-2026) cada `data/*.json` lo lee el módulo de su dominio, que
 * lo valida al cargar.
 */
import economiaJson from '../../../data/economia.json' with { type: 'json' };
import { enteroDesde } from '../validar.js';

/**
 * Lo que cuestan y crecen las unidades y sus moradas, de `data/economia.json`.
 * **Inventado y provisional** (19-10-2026): nada se escribe por unidad, sale de
 * su índice de poder (`core/catalogo.ts`, `town/buildings.ts`).
 */
export interface ReglasDeLaEconomia {
  /** Una unidad cuesta `índice² / divisor` en oro, redondeado a la decena. */
  readonly oroPorIndice: { readonly divisor: number };
  /** Lo que suelta por semana una morada de cada unidad, por su nivel (1 a 6). */
  readonly crecimientoPorNivel: readonly number[];
  /** El coste en oro de una morada por el nivel de lo mejor que produce (1 a 6). */
  readonly costeDeLaMorada: readonly number[];
  /** El oro con que empieza cada jugador (`newGame`). **Inventado** (21-10-2026). */
  readonly oroDeSalida: number;
  /**
   * El oro que da cada día un pueblo a quien tenga su región unida a su base
   * (`rentaDelDia`). **Inventado** (21-10-2026, decisión del usuario).
   */
  readonly rentaDelPueblo: number;
  /**
   * Lo que cuesta todo héroe: el de salida, que se elige y se paga en la base al
   * empezar, y el que se contrata después (`hireHero`, `contratarBlocker`). Uno
   * para todos los tipos, que hoy no difieren en cifras. **Inventado** (22-10-2026,
   * decisión del usuario: el `HERO_HIRE_COST` de antes); nunca más que `oroDeSalida`.
   */
  readonly precioDelHeroe: number;
}

/** Los niveles que tienen fila en las tablas de la economía: del 1 al 6. */
export const NIVELES_DE_LA_ECONOMIA = 6;

/**
 * Valida la economía y la devuelve tipada; lanza con todos los problemas a la vez.
 * Exportada con el JSON de argumento para verla morder en un test.
 */
export function validarEconomia(json: unknown, fichero = 'data/economia.json'): ReglasDeLaEconomia {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  const divisor = (j.oroPorIndice as Record<string, unknown> | undefined)?.divisor;
  if (!enteroDesde(divisor, 1)) {
    problemas.push(`oroPorIndice.divisor tiene que ser un entero ≥ 1 y es ${divisor}`);
  }
  const crece = j.crecimientoPorNivel;
  if (
    !Array.isArray(crece) ||
    crece.length !== NIVELES_DE_LA_ECONOMIA ||
    !crece.every((x) => enteroDesde(x, 1))
  ) {
    problemas.push(
      `crecimientoPorNivel tiene que ser una lista de ${NIVELES_DE_LA_ECONOMIA} enteros ≥ 1, uno por nivel, y es ${JSON.stringify(crece)}`,
    );
  }
  const costes = j.costeDeLaMorada;
  if (
    !Array.isArray(costes) ||
    costes.length !== NIVELES_DE_LA_ECONOMIA ||
    !costes.every((x) => enteroDesde(x, 0))
  ) {
    problemas.push(
      `costeDeLaMorada tiene que ser una lista de ${NIVELES_DE_LA_ECONOMIA} enteros ≥ 0 de oro, uno por nivel (solo hay oro), y es ${JSON.stringify(costes)}`,
    );
  }
  const oroDeSalida = j.oroDeSalida;
  if (!enteroDesde(oroDeSalida, 0)) {
    problemas.push(`oroDeSalida tiene que ser un entero ≥ 0 de oro y es ${oroDeSalida}`);
  }
  const rentaDelPueblo = j.rentaDelPueblo;
  if (!enteroDesde(rentaDelPueblo, 0)) {
    problemas.push(`rentaDelPueblo tiene que ser un entero ≥ 0 de oro y es ${rentaDelPueblo}`);
  }
  const precioDelHeroe = j.precioDelHeroe;
  if (!enteroDesde(precioDelHeroe, 0)) {
    problemas.push(`precioDelHeroe tiene que ser un entero ≥ 0 de oro y es ${precioDelHeroe}`);
  } else if (enteroDesde(oroDeSalida, 0) && (precioDelHeroe as number) > (oroDeSalida as number)) {
    // Todo jugador paga su héroe de salida con el oro de salida: con un precio
    // mayor, la partida no podría ni empezar.
    problemas.push(
      `precioDelHeroe (${precioDelHeroe}) no puede pasar de oroDeSalida (${oroDeSalida}): el héroe de salida se paga con él`,
    );
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return {
    oroPorIndice: { divisor: divisor as number },
    crecimientoPorNivel: [...(crece as number[])],
    costeDeLaMorada: [...(costes as number[])],
    oroDeSalida: oroDeSalida as number,
    rentaDelPueblo: rentaDelPueblo as number,
    precioDelHeroe: precioDelHeroe as number,
  };
}

export const ECONOMIA: ReglasDeLaEconomia = validarEconomia(economiaJson);

/**
 * Lo que cuesta en oro una unidad de ese índice: `índice² / divisor`, redondeado
 * a la decena, en enteros. **Inventado** (`data/economia.json`).
 */
export function oroDelIndice(indice: number): number {
  const d = ECONOMIA.oroPorIndice.divisor;
  return Math.floor((indice * indice + 5 * d) / (10 * d)) * 10;
}

/** Lo que suelta por semana una morada de una unidad de ese nivel (1 a 6). */
export function crecimientoDelNivel(nivel: number): number {
  const tabla = ECONOMIA.crecimientoPorNivel;
  return tabla[Math.max(1, Math.min(tabla.length, nivel)) - 1] as number;
}
