/**
 * El grafo de importaciones **de valor** del proyecto y sus ciclos (Tarjan).
 *
 * De valor es todo lo que se queda en el JavaScript: con `verbatimModuleSyntax`,
 * `import type …` y `export type … from` se borran, pero `import { type A } from`
 * se queda como `import {} from` y evalúa el módulo igual. Un ciclo de valor es el
 * que puede dar un TDZ en ejecución («Cannot access X before initialization»)
 * según quién se cargue antes, y `tsc` no lo ve. Los `import()` no cuentan: se
 * cargan cuando se llaman, no al evaluar el módulo.
 */
import ts from 'typescript';
import { type Proyecto, RAIZ } from './proyecto.js';

/** Los módulos del proyecto que `f` importa por valor, resueltos (absolutos). */
export function importacionesDeValor(
  p: Proyecto,
  f: string,
  cache: ts.ModuleResolutionCache,
): string[] {
  const sf = ts.createSourceFile(f, p.texto(f), ts.ScriptTarget.Latest, false);
  const out: string[] = [];
  for (const s of sf.statements) {
    let espec: ts.Expression | undefined;
    if (ts.isImportDeclaration(s)) {
      if (s.importClause?.isTypeOnly === true) continue;
      espec = s.moduleSpecifier;
    } else if (ts.isExportDeclaration(s)) {
      if (s.isTypeOnly || s.moduleSpecifier === undefined) continue;
      espec = s.moduleSpecifier;
    }
    if (espec === undefined || !ts.isStringLiteral(espec)) continue;
    const r = p.resolver(espec.text, f, cache);
    if (r !== null && p.esDelProyecto(r)) out.push(r);
  }
  return out;
}

/** Los ciclos de valor del proyecto: cada componente fuerte de dos ficheros o más. */
export function ciclosDeValor(p: Proyecto): string[][] {
  const cache = ts.createModuleResolutionCache(RAIZ, (x) => x, p.opciones);
  const ficheros = p.delProyecto();
  const aristas = new Map<string, string[]>();
  for (const f of ficheros) aristas.set(f, importacionesDeValor(p, f, cache));
  // Tarjan, iterativo: con la recursión, un camino de cientos de módulos agota la pila.
  let indice = 0;
  const indices = new Map<string, number>();
  const bajos = new Map<string, number>();
  const enPila = new Set<string>();
  const pila: string[] = [];
  const componentes: string[][] = [];
  for (const raiz of ficheros) {
    if (indices.has(raiz)) continue;
    const trabajo: { v: string; i: number }[] = [{ v: raiz, i: 0 }];
    indices.set(raiz, indice);
    bajos.set(raiz, indice);
    indice++;
    pila.push(raiz);
    enPila.add(raiz);
    while (trabajo.length > 0) {
      const marco = trabajo[trabajo.length - 1] as { v: string; i: number };
      const vecinos = aristas.get(marco.v) ?? [];
      if (marco.i < vecinos.length) {
        const w = vecinos[marco.i] as string;
        marco.i++;
        if (!indices.has(w)) {
          indices.set(w, indice);
          bajos.set(w, indice);
          indice++;
          pila.push(w);
          enPila.add(w);
          trabajo.push({ v: w, i: 0 });
        } else if (enPila.has(w)) {
          bajos.set(marco.v, Math.min(bajos.get(marco.v) as number, indices.get(w) as number));
        }
        continue;
      }
      trabajo.pop();
      const padre = trabajo[trabajo.length - 1];
      if (padre !== undefined) {
        bajos.set(padre.v, Math.min(bajos.get(padre.v) as number, bajos.get(marco.v) as number));
      }
      if (bajos.get(marco.v) === indices.get(marco.v)) {
        const comp: string[] = [];
        let w: string;
        do {
          w = pila.pop() as string;
          enPila.delete(w);
          comp.push(w);
        } while (w !== marco.v);
        if (comp.length > 1) componentes.push(comp.sort());
      }
    }
  }
  return componentes;
}
