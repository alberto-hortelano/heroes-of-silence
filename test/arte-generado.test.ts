/**
 * `assets/generated/`, lo que escribe `pnpm gen` (`tools/gen/cli.ts`): su
 * manifiesto y el disco dicen lo mismo. Las criaturas y sus poses (#139)
 * siguieron en disco y en el manifiesto meses después de que nadie las pidiera;
 * un fichero que el manifiesto no lista no lo carga nadie, y una entrada sin
 * fichero es una petición que da 404.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const GENERADO = join(import.meta.dirname, '..', 'assets', 'generated');

interface Manifiesto {
  readonly files: readonly { readonly group: string; readonly path: string }[];
}

describe('el arte de pnpm gen', () => {
  it('el manifiesto lista exactamente los ficheros que hay en assets/generated/', () => {
    const manifiesto = JSON.parse(
      readFileSync(join(GENERADO, 'manifest.json'), 'utf8'),
    ) as Manifiesto;
    const enDisco = (
      readdirSync(GENERADO, { recursive: true, withFileTypes: true }) as {
        isFile(): boolean;
        parentPath: string;
        name: string;
      }[]
    )
      .filter((e) => e.isFile())
      .map((e) => relative(GENERADO, join(e.parentPath, e.name)))
      .filter((r) => r !== 'manifest.json')
      .sort();
    expect(manifiesto.files.map((f) => f.path).sort()).toEqual(enDisco);
  });
});
