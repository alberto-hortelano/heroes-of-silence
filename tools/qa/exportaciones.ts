/**
 * Nada exportado sin lector: lo que un fichero de `src/`, `tools/` o `test/` exporta y
 * ningún otro fichero lee se dice aquí, con su fichero y su línea, y la orden sale 1.
 *
 *     npx tsx tools/qa/exportaciones.ts
 *
 * Lo lee el comprobador de tipos de TypeScript sobre el `tsconfig.json` del repo (el
 * programa que juzga `pnpm typecheck`), así que cuenta toda forma de leer que `tsc`
 * resuelve: `import { x }` (también con `@core/*`), `import * as m` y `m.x`, `import()`
 * y `(await import(…)).x` o su desestructuración, `typeof import(…)` (así declaran los
 * plugins de `tools/vite/` lo que cargan con `ssrLoadModule`), un `{ x }` abreviado…
 * Una costura de test (`marcadoDe`, `arteCargando`, `CATALOGO_VACIO`, `deltaE`…) tiene
 * lector: el test que la usa. `export default` (las configuraciones) no cuenta.
 *
 * Lo que `tsc` no ve —una ruta en una variable, un `import()` calculado— es la lista
 * blanca (`SE_LEEN_SIN_TSC`), cada entrada con su lector; una entrada que ya no se
 * exporta también sale 1, para que la lista no se quede vieja.
 *
 * Tarda unos 7 s (el programa entero con su comprobador): más que los 5 s que se dan a
 * un guardia de `invariantes-capas`, así que es una orden y la corre CI (`verify`, tras
 * `pnpm verify`). Nació en la fase D de la reorganización (08-11-2026), que quitó 670
 * `export` sin lector; un `export const SONDA = 1;` en cualquier fichero la pone roja.
 */
import { relative } from 'node:path';
import ts from 'typescript';
import { RAIZ } from '../comun/raiz.js';

/** Lo que se lee sin que `tsc` lo resuelva, por fichero (si cambia el lector, cambia esto). */
const SE_LEEN_SIN_TSC: Readonly<Record<string, readonly string[]>> = {
  // `tools/qa/navegador/temas-con-piezas.ts` los importa en la página que sirve vite
  // (`page.evaluate`, `import(ruta)` con la ruta en una variable) y los usa por nombre.
  'src/client/comun/temas.ts': ['ponerTema', 'letrasListas'],
  // `tools/qa/medidas/enfrentamiento.ts` carga la IA de batalla de otra versión
  // (`import(pathToFileURL(fichero))`, de un `git worktree`) y lee este nombre.
  'src/core/ai/tactics.ts': ['chooseBattleAction'],
};

const delRepo = (f: string): string => relative(RAIZ, f).split('\\').join('/');

/** El programa del `tsconfig.json` del repo. */
function programa(): ts.Program {
  const ruta = ts.findConfigFile(RAIZ, ts.sys.fileExists, 'tsconfig.json');
  if (ruta === undefined) throw new Error(`no hay tsconfig.json en ${RAIZ}`);
  const leido = ts.readConfigFile(ruta, ts.sys.readFile);
  if (leido.error) throw new Error(ts.flattenDiagnosticMessageText(leido.error.messageText, '\n'));
  const cfg = ts.parseJsonConfigFileContent(leido.config, ts.sys, RAIZ);
  return ts.createProgram({ rootNames: cfg.fileNames, options: cfg.options });
}

/** Cada exportación sin lector, «fichero:línea nombre», y lo que la lista blanca nombra de más. */
function problemas(): string[] {
  const prog = programa();
  const tc = prog.getTypeChecker();
  const ficheros = prog
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes('/node_modules/'));
  const resolver = (s: ts.Symbol): ts.Symbol =>
    s.flags & ts.SymbolFlags.Alias ? tc.getAliasedSymbol(s) : s;

  // Lo exportado, por el símbolo de su declaración (sin alias): así lo encuentra cualquier
  // lector, se llame como se llame donde lo importa.
  const exportados = new Map<ts.Symbol, { fichero: string; nombre: string; nodo: ts.Node }>();
  for (const sf of ficheros) {
    const modulo = tc.getSymbolAtLocation(sf);
    if (modulo === undefined) continue;
    for (const e of tc.getExportsOfModule(modulo)) {
      if (e.escapedName === 'default') continue;
      const real = resolver(e);
      const decl = real.declarations?.[0] ?? e.declarations?.[0];
      if (decl === undefined || decl.getSourceFile() !== sf) continue;
      exportados.set(real, { fichero: sf.fileName, nombre: e.name, nodo: decl });
    }
  }

  // Quién los lee desde otro fichero: todo identificador del repo, resuelto.
  const leidos = new Set<ts.Symbol>();
  const anotar = (s: ts.Symbol | undefined, desde: ts.SourceFile): void => {
    if (s === undefined) return;
    const real = resolver(s);
    const e = exportados.get(real);
    if (e !== undefined && e.fichero !== desde.fileName) leidos.add(real);
  };
  for (const sf of ficheros) {
    const visitar = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        anotar(tc.getSymbolAtLocation(n), sf);
        const p = n.parent;
        // `const { x } = await import(…)`: el identificador es la variable local; lo
        // exportado es la propiedad del tipo del patrón.
        if (
          ts.isBindingElement(p) &&
          ts.isObjectBindingPattern(p.parent) &&
          (p.propertyName === n || (p.propertyName === undefined && p.name === n))
        ) {
          anotar(tc.getTypeAtLocation(p.parent).getProperty(n.text), sf);
        }
        // `{ x }` abreviado en un objeto: el valor es el símbolo de fuera.
        if (ts.isShorthandPropertyAssignment(p)) {
          anotar(tc.getShorthandAssignmentValueSymbol(p), sf);
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }

  const vistos = new Set<string>();
  const sin: { fichero: string; linea: number; nombre: string }[] = [];
  for (const [s, e] of exportados) {
    const fichero = delRepo(e.fichero);
    vistos.add(`${fichero} ${e.nombre}`);
    if (leidos.has(s) || SE_LEEN_SIN_TSC[fichero]?.includes(e.nombre)) continue;
    const sf = e.nodo.getSourceFile();
    sin.push({
      fichero,
      linea: sf.getLineAndCharacterOfPosition(e.nodo.getStart(sf)).line + 1,
      nombre: e.nombre,
    });
  }
  sin.sort((a, b) => a.fichero.localeCompare(b.fichero) || a.linea - b.linea);
  const viejas = Object.entries(SE_LEEN_SIN_TSC).flatMap(([fichero, nombres]) =>
    nombres
      .filter((n) => !vistos.has(`${fichero} ${n}`))
      .map((n) => `la lista blanca nombra ${fichero} ${n}, que ya no se exporta: quítalo de ella`),
  );
  return [...sin.map((e) => `${e.fichero}:${e.linea} ${e.nombre}`), ...viejas];
}

const t0 = Date.now();
const encontrados = problemas();
for (const p of encontrados) console.log(p);
const s = ((Date.now() - t0) / 1000).toFixed(1);
if (encontrados.length > 0) {
  console.log(
    `${encontrados.length} ${encontrados.length === 1 ? 'problema' : 'problemas'} (${s} s): una exportación sin lector se deja de exportar (y si entonces no la usa nadie, se borra); una que se lee sin que tsc lo vea va a SE_LEEN_SIN_TSC con su lector`,
  );
  process.exitCode = 1;
} else console.log(`ninguna exportación sin lector (${s} s)`);
