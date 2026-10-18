/**
 * Las piezas con que se valida un JSON a mano en el núcleo: un entero con su
 * mínimo, un texto no vacío, un objeto con sus campos, una lista y lo repetido.
 * Cada una lanza diciendo de quién y qué campo (`quien`, `campo`), para la
 * persona que editó el fichero.
 *
 * Sin dependencias: las usan la arena (`arena.ts`, `arena-murallas.ts`), los
 * poderes (`battle/poderes.ts`) y la rueda del golpe (`battle/rueda.ts`), que
 * antes llevaban cada uno su copia.
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

/**
 * El campo `porcentaje` de `o`: un tanto por ciento entero, 1 o más. **La única
 * clave y la única lectura** de un tanto por ciento suelto de los datos
 * (`data/carga.json`; los de `data/rueda.json` van uno por nivel y los valida
 * `validarRueda`): quien lo usa como factor lo divide entre 100.
 */
export function porcentaje(o: Readonly<Record<string, unknown>>, quien: string): number {
  return entero(o.porcentaje, 'el porcentaje', quien, 1);
}

/** Un texto con algo dentro. */
export function texto(valor: unknown, campo: string, quien: string): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new Error(`${quien}: ${campo} tiene que ser un texto no vacío`);
  }
  return valor;
}

/** Un objeto con solo los campos `campos` (no mira si están todos), o lanza diciendo cuál sobra. */
export function objetoCon(
  valor: unknown,
  campos: readonly string[],
  quien: string,
): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${quien}: tiene que ser un objeto`);
  }
  const o = valor as Record<string, unknown>;
  const ajeno = Object.keys(o).find((k) => !campos.includes(k));
  if (ajeno !== undefined) {
    throw new Error(`${quien}: «${ajeno}» no es un campo; valen ${campos.join(', ')}`);
  }
  return o;
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

/**
 * Si `id` tiene la forma de un id de la arena: minúsculas, cifras y guiones, la
 * de una carpeta de `assets/unidades/`. La leen el id de una unidad, el cuerpo de
 * una hoja y la figura de un héroe (`core/arena.ts`) y el registro de una hoja
 * para pintarla (`render/personajes.ts`). Aquí y no en `core/arena.ts` porque el
 * cliente fuera de la arena no importa de allí (`invariantes.test.ts`).
 */
export function esIdDeArena(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

/**
 * Si `id` tiene la forma del id de una pieza de equipo: como uno de la arena, y
 * además con `_`, que llevan las del juego (`espada_de_armeria`).
 */
export function esIdDePieza(id: string): boolean {
  return /^[a-z0-9_-]+$/.test(id);
}
