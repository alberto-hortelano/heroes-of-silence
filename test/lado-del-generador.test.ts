/**
 * El rango de lado que declara el generador procedimental (#102).
 *
 * Va en su propio fichero y no en `regiones.test.ts` por tiempo. En la orden
 * lenta y con la máquina cargada (08-10-2026), la pasada salía 1 con un
 * «Timeout calling "onTaskUpdate"» de vitest y todos los tests en verde en las
 * tres en que `regiones.test.ts` pasó de 60 s (67, 68 y 80 s), y nunca en las
 * nueve en que no (44-59 s, cuatro de ellas sin este cambio). Con estos tests
 * dentro pasaba de 60 s más a menudo. Aparte se alivia, pero no se arregla:
 * `regiones.test.ts` ya roza el minuto sin ellos.
 */
import { describe, expect, it } from 'vitest';
import { mapPlanSchema } from '../src/core/contract/agent.js';
import {
  generateMapPlan,
  LADO_DEL_MAPA,
  LADO_MAXIMO_DEL_GENERADOR,
  LADO_MAXIMO_DEL_PLAN,
  LADO_MINIMO_DEL_GENERADOR,
  LADO_MINIMO_DEL_PLAN,
  validateMapPlan,
} from '../src/core/map/generate.js';
import { createRng } from '../src/core/rng.js';
import { itLento, rango, segunPrisa } from './lento.js';

/**
 * Lo que falla al generar un plan de ese tamaño con esa semilla, con su
 * tamaño y su semilla delante: nada si sale y `validateMapPlan` no le pone
 * pegas. Lo que lanza también es un fallo, y se dice con su mensaje.
 */
function loQueFallaAlGenerar(width: number, height: number, semilla: number): string[] {
  const donde = `${width}×${height} s${semilla}`;
  try {
    const problemas = validateMapPlan(generateMapPlan(createRng(semilla), { width, height }));
    return problemas.map((p) => `${donde}: ${p}`);
  } catch (e) {
    return [`${donde}: ${(e as Error).message}`];
  }
}

describe('el lado que sabe hacer el generador (#102)', () => {
  it('el generador hace un plan válido en todo el rango que declara (#102)', async () => {
    // El rango era el del plan, 8-128, y el generador no sabía hacer nada por
    // debajo de 24: el respaldo, que es el camino que no puede fallar, lanzaba
    // con un lado que el contrato daba por bueno. En el bucle rápido, las dos
    // puntas, el lado del juego y los dos rectángulos extremos; en la lenta,
    // cada lado del rango con tres semillas.
    const min = LADO_MINIMO_DEL_GENERADOR;
    const max = LADO_MAXIMO_DEL_GENERADOR;
    const lados = segunPrisa([min, LADO_DEL_MAPA, max], rango(min, max));
    const medidas: (readonly [number, number])[] = [
      ...lados.map((l) => [l, l] as const),
      [min, max],
      [max, min],
    ];
    // Un mapa grande cuesta ~1 s desde #224 (los vestidos con una silla se
    // repiten): se suelta el hilo entre uno y otro para que el trabajador de
    // vitest conteste («Timeout calling onTaskUpdate»).
    const malos: string[] = [];
    for (const [width, height] of medidas)
      for (const s of segunPrisa([1], rango(1, 3))) {
        await new Promise((r) => setTimeout(r, 0));
        malos.push(...loQueFallaAlGenerar(width, height, s));
      }
    expect(malos).toEqual([]);
  }, 180_000);

  itLento(
    `el lado mínimo del generador sale en las 200 semillas: es lo que lo define (#102)`,
    () => {
      const lado = LADO_MINIMO_DEL_GENERADOR;
      expect(rango(1, 200).flatMap((s) => loQueFallaAlGenerar(lado, lado, s))).toEqual([]);
    },
  );

  it('fuera de su rango, el generador lo dice antes de intentarlo; el plan a mano sigue en el suyo', () => {
    const fuera = [
      [LADO_MINIMO_DEL_GENERADOR - 1, LADO_DEL_MAPA],
      [LADO_DEL_MAPA, LADO_MAXIMO_DEL_GENERADOR + 1],
      [8, 8],
    ] as const;
    for (const [width, height] of fuera) {
      expect(() => generateMapPlan(createRng(1), { width, height })).toThrow(
        `el generador procedimental no hace mapas de ${width}×${height}: cada lado va de ${LADO_MINIMO_DEL_GENERADOR} a ${LADO_MAXIMO_DEL_GENERADOR} (un plan escrito a mano puede ir de ${LADO_MINIMO_DEL_PLAN} a ${LADO_MAXIMO_DEL_PLAN})`,
      );
    }
    // El rango del plan es otro hecho y el generador no lo estrecha: el esquema
    // del agente sigue aceptando un lado que el generador no sabe hacer.
    const plan = generateMapPlan(createRng(1));
    expect(mapPlanSchema.shape.width.safeParse(LADO_MINIMO_DEL_PLAN).success).toBe(true);
    expect(mapPlanSchema.shape.width.safeParse(LADO_MINIMO_DEL_PLAN - 1).success).toBe(false);
    expect(mapPlanSchema.shape.height.safeParse(LADO_MAXIMO_DEL_PLAN + 1).success).toBe(false);
    expect(validateMapPlan({ ...plan, width: LADO_MINIMO_DEL_PLAN - 1 })).toContain(
      `el mapa es demasiado pequeño (mínimo ${LADO_MINIMO_DEL_PLAN}×${LADO_MINIMO_DEL_PLAN})`,
    );
  });
});
