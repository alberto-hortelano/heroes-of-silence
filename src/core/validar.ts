/**
 * Las piezas con que se valida un JSON a mano en el núcleo: un entero con su
 * mínimo, un texto no vacío, una lista y lo repetido. Cada una lanza diciendo
 * de quién y qué campo (`quien`, `campo`), para la persona que editó el fichero.
 *
 * Sin dependencias: las usan la arena (`arena.ts`, `arena-murallas.ts`) y los
 * poderes (`battle/poderes.ts`), que antes llevaban cada uno su copia.
 */

/** Un número entero de `minimo` en adelante. */
export function entero(valor: unknown, campo: string, quien: string, minimo: number): number {
  // `NaN` es lo que da un campo vacío en la página, y `JSON.stringify(NaN)` diría
  // «null», que nadie ha escrito (M2 de QA).
  if (typeof valor === 'number' && Number.isNaN(valor)) {
    throw new Error(`${quien}: ${campo} no tiene valor, el campo está vacío`);
  }
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) {
    throw new Error(
      `${quien}: ${campo} tiene que ser un número entero, y es ${typeof valor === 'number' ? valor : JSON.stringify(valor)}`,
    );
  }
  if (valor < minimo) {
    throw new Error(`${quien}: ${campo} tiene que ser ${minimo} o más, y es ${valor}`);
  }
  return valor;
}

/** Un texto con algo dentro. */
export function texto(valor: unknown, campo: string, quien: string): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new Error(`${quien}: ${campo} tiene que ser un texto no vacío`);
  }
  return valor;
}

/** Una lista, sin mirar lo de dentro. */
export function lista(valor: unknown, campo: string, quien: string): readonly unknown[] {
  if (!Array.isArray(valor)) throw new Error(`${quien}: ${campo} tiene que ser una lista`);
  return valor;
}

/** El primer elemento que sale dos veces en `lista`, o `undefined` si ninguno. */
export function repetidoEn<T>(lista: readonly T[]): T | undefined {
  return lista.find((x, i) => lista.indexOf(x) !== i);
}
