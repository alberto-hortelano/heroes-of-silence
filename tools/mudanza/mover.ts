/**
 * `mover <viejo> <nuevo> [<viejo> <nuevo>…]`: lleva ficheros enteros a otro sitio y
 * reescribe en todo el repo lo que los nombra y se puede resolver.
 *
 * Lo resuelve el servicio de lenguaje (`getEditsForFileRename`): cada `import`,
 * `export … from`, `import()` y `typeof import()` que apunta al fichero, y los del
 * propio fichero, que desde su sitio nuevo apuntan a otra profundidad. Lo que el
 * servicio no ve lo reescribe `cadenas.ts` (los `vi.mock`, los `new URL(…,
 * import.meta.url)` y los `resolve(import.meta.dirname, …)`), y lo que nadie puede
 * resolver se lista (`menciones`). Todo se hace en memoria y se escribe al final:
 * los `git mv` y luego el texto de cada fichero tocado. Con `--en-seco`, nada: dice
 * lo que haría.
 */
import { extname } from 'node:path';
import { decirMenciones, menciones, reescribirCadenas } from './cadenas.js';
import { apuntarRutas, biomeSobre, escribirMudanza, testsQueLosLeen } from './escribir.js';
import { absoluta, delRepo, FORMATO, PREFERENCIAS, Proyecto } from './proyecto.js';

export function mover(todos: readonly string[]): void {
  const enSeco = todos.includes('--en-seco');
  const args = todos.filter((a) => a !== '--en-seco');
  if (args.length === 0 || args.length % 2 !== 0) {
    throw new Error('mover pide pares: mover <viejo> <nuevo> [<viejo> <nuevo>…]');
  }
  const pares: (readonly [string, string])[] = [];
  for (let i = 0; i < args.length; i += 2) {
    pares.push([absoluta(args[i] as string), absoluta(args[i + 1] as string)]);
  }
  console.log('mudanza: cargando el proyecto…');
  const p = new Proyecto();
  const viejos = new Set<string>();
  const nuevos = new Set<string>();
  for (const [viejo, nuevo] of pares) {
    if (!p.esDelProyecto(viejo)) {
      throw new Error(
        `${delRepo(viejo)} no es un fichero del proyecto (los .ts de src, tools y test)`,
      );
    }
    if (extname(nuevo) !== '.ts')
      throw new Error(`${delRepo(nuevo)}: el sitio nuevo de un .ts es un .ts`);
    // Ni encadenar (a → b y b → c) ni cambiar dos de sitio: el disco en memoria movería
    // b encima de sí mismo. Se hace en dos órdenes.
    if (p.existe(nuevo)) throw new Error(`${delRepo(nuevo)} ya existe`);
    if (viejos.has(viejo)) throw new Error(`${delRepo(viejo)} va dos veces`);
    if (nuevos.has(nuevo)) throw new Error(`dos ficheros van a ${delRepo(nuevo)}`);
    if (!delRepo(nuevo).match(/^(src|tools|test)\//)) {
      throw new Error(`${delRepo(nuevo)}: el sitio nuevo tiene que ser de src/, tools/ o test/`);
    }
    viejos.add(viejo);
    nuevos.add(nuevo);
  }
  // Lo que el servicio no ve, sobre el texto de antes y con la mudanza entera.
  const cadenas = reescribirCadenas(p, new Map(pares));
  for (const [viejo, nuevo] of pares) {
    p.aplicar(p.servicio.getEditsForFileRename(viejo, nuevo, FORMATO, PREFERENCIAS));
    p.renombrar(viejo, nuevo);
  }
  const quedan = menciones(p, [...viejos]);
  const escritos = enSeco ? [...p.loCambiado().escritos.keys()] : escribirMudanza(p, pares);
  if (!enSeco) {
    biomeSobre(escritos);
    apuntarRutas(
      pares.map(([viejo, nuevo]) => ({
        tipo: 'fichero',
        viejo: delRepo(viejo),
        nuevo: delRepo(nuevo),
        simbolo: '',
      })),
    );
  }

  const verbo = enSeco ? 'se movería' : 'movido';
  for (const [viejo, nuevo] of pares)
    console.log(`${verbo}: ${delRepo(viejo)} → ${delRepo(nuevo)}`);
  console.log(
    `\n${escritos.length} ficheros ${enSeco ? 'se escribirían (en seco: no se ha tocado nada)' : 'escritos'}:`,
  );
  for (const f of escritos.map(delRepo).sort()) console.log(`  ${f}`);
  if (cadenas.length > 0) {
    console.log(`\nRutas en cadenas reescritas (${cadenas.length}):`);
    for (const c of cadenas)
      console.log(`  ${c.fichero}:${c.linea}: '${c.antes}' → '${c.despues}'`);
  }
  decirMenciones(quedan);
  if (enSeco) return;
  const tests = testsQueLosLeen([...nuevos]);
  console.log(
    `\nComprueba: pnpm typecheck; npx tsx tools/mudanza/cli.ts comprobar HEAD${tests.length === 0 ? '' : `; los tests que los leen: pnpm vitest run ${tests.join(' ')}`}`,
  );
}
