/**
 * La mudanza: mover código de sitio sin cambiarlo, sobre el servicio de lenguaje de
 * TypeScript. Es la herramienta de la reorganización del 06-11-2026
 * (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/`) y se borra al
 * acabarla; lo que hizo queda en `rutas.tsv` de esa carpeta.
 *
 *     npx tsx tools/mudanza/cli.ts mover <viejo> <nuevo> [<viejo> <nuevo>…] [--en-seco]
 *     npx tsx tools/mudanza/cli.ts partir <fichero> <mapa.json> [--en-seco]
 *     npx tsx tools/mudanza/cli.ts comprobar <ref>
 *
 * `--en-seco` hace todo en memoria y dice lo que escribiría, sin tocar nada.
 *
 * - `mover` (`mover.ts`): ficheros enteros, con `git mv`, reescribiendo lo que los
 *   importa y lo que ellos importan, y las rutas en cadenas que sabe leer; lista
 *   las que no.
 * - `partir` (`partir.ts`): declaraciones de nivel superior de un fichero a otros,
 *   según un mapa; rechaza sin tocar nada lo que cambiaría el programa.
 * - `comprobar` (`comprobar.ts`): que lo cambiado desde `<ref>` es solo una mudanza.
 *
 * Tras `mover` y `partir`: Biome sobre lo tocado y una línea por movimiento en
 * `rutas.tsv`. Lo que no hacen: correr `pnpm typecheck`, los tests ni la huella;
 * eso es de quien muda, y lo dicen al acabar.
 */
import { comprobar } from './comprobar.js';
import { mover } from './mover.js';
import { partir, Rechazo } from './partir.js';

const [orden, ...args] = process.argv.slice(2);
try {
  if (orden === 'mover') mover(args);
  else if (orden === 'partir') partir(args);
  else if (orden === 'comprobar') comprobar(args);
  else {
    throw new Error(
      `no hay ninguna orden «${orden ?? ''}»: las hay mover <viejo> <nuevo>…, partir <fichero> <mapa.json> y comprobar <ref>`,
    );
  }
} catch (err) {
  // Un rechazo o una orden mal escrita no son un fallo de la herramienta: se dicen
  // sin la pila. Lo que no es un `Error` de los suyos (un `TypeError`…), con ella.
  const suyo = err instanceof Rechazo || (err instanceof Error && err.constructor === Error);
  console.error(suyo ? err.message : err);
  process.exitCode = 1;
}
