/**
 * Los ficheros JSON del repo que escriben las herramientas: el texto de cada uno
 * (`textoJson`, con su sangría) y, para los catálogos de la arena
 * (`tools/arena/borrador.ts`) y el banco de NPC (`tools/npcs/banco.ts`), leerlos sin
 * pisar lo ilegible, conservar su `_comment` y escribirlos de golpe.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * El texto de un fichero JSON: `valor` con la sangría de su fichero y un salto de
 * línea al final. **Cada fichero conserva la suya** (1 los índices y juicios que solo
 * lee una máquina, 2 los que se leen o se editan a mano): reescribir uno que no
 * cambió no puede mover ni un byte, o cada derivado saldría distinto en `git status`.
 */
export function textoJson(valor: unknown, sangria: 1 | 2): string {
  return `${JSON.stringify(valor, null, sangria)}\n`;
}

/**
 * El JSON de `ruta` (relativa a `raiz`), o `undefined` si el archivo no existe.
 * Lanza si no es JSON: ahí no hay nada que leer, y guardar encima lo borraría.
 */
export function jsonDe(raiz: string, ruta: string): unknown {
  const donde = join(raiz, ruta);
  if (!existsSync(donde)) return undefined;
  try {
    return JSON.parse(readFileSync(donde, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`${ruta} no es JSON: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * El `_comment` de un archivo leído, si trae uno, y si no `porDefecto`. **Escribir
 * conserva el comentario del disco**: es el que se edita a mano (lo que dice qué es
 * el fichero y por qué cada cifra), y la herramienta no lo pisa con el suyo.
 */
export function comentarioDe(json: unknown, porDefecto: string): string {
  const c = (json as { _comment?: unknown } | undefined)?._comment;
  return typeof c === 'string' && c.trim() !== '' ? c : porDefecto;
}

/** Lo que se va a escribir en un fichero: dónde (absoluto) y qué. */
export interface AEscribir {
  readonly ruta: string;
  readonly contenido: unknown;
}

/**
 * Un temporal por archivo y luego los `rename`: un guardado a medias dejaría un
 * JSON roto, y con dos archivos, todos los temporales se escriben antes de que
 * ninguno pise al suyo.
 */
export function escribirAtomico(listos: readonly AEscribir[]): void {
  const temporales = listos.map(({ ruta, contenido }) => {
    mkdirSync(dirname(ruta), { recursive: true });
    const temporal = `${ruta}.${process.pid}.tmp`;
    writeFileSync(temporal, textoJson(contenido, 2));
    return { temporal, ruta };
  });
  for (const { temporal, ruta } of temporales) renameSync(temporal, ruta);
}
