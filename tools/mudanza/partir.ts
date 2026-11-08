/**
 * `partir <fichero> <mapa.json>`: reparte declaraciones de nivel superior de un
 * fichero entre ficheros nuevos (o que ya existen), sin fachadas: cada importador
 * pasa a importar de donde está ahora cada cosa.
 *
 * El mapa dice qué va adónde, y la cabecera de cada fichero nuevo:
 *
 *     {
 *       "src/core/map/geometria.ts": {
 *         "cabecera": "/**\n * La geometría de la rejilla del mapa…\n *\/",
 *         "declaraciones": ["chebyshev", "SEPARACION_DE_CIUDADES"]
 *       }
 *     }
 *
 * El trabajo lo hace el refactor «Move to file» del servicio de lenguaje
 * (`getEditsForRefactor` con `{ targetFile }`): las importaciones del fichero nuevo,
 * las que el viejo necesita de él, el `export` de lo que el nuevo usa del viejo y
 * cada importador del proyecto. Lo que se le corrige después, a la vista:
 *
 * - **el texto de lo movido es el de antes, letra a letra**: el refactor reimprime
 *   cada declaración (junta líneas, despega el comentario de su declaración con una
 *   línea en blanco); aquí se sustituye por su texto original con su comentario (el
 *   pegado a ella, sin línea en blanco entre los dos), y solo se le añade el
 *   `export` si el refactor lo puso;
 * - **el estilo de las importaciones nuevas es el de cada fichero**: el refactor
 *   escribe las de los importadores con `@core/…` cuando es más corto, y el núcleo
 *   importa siempre en relativo; los demás, como importaban el origen.
 *
 * **Rechaza sin tocar nada** (todo pasa en memoria, `proyecto.ts`):
 *
 * - separar un `let` (o `var`) de módulo de alguna de sus asignaciones: lo
 *   importado no se asigna;
 * - mover lo que usa una sentencia de efecto que se queda (o una `export default` o
 *   una lista `export { … }`): cambiaría cuándo se ejecuta;
 * - partir un módulo que alguien importa con `import * as` (o reexporta con
 *   `export *`, o importa con `import()`, `typeof import()` o `vi.mock`) y usa lo
 *   que se mueve: esas no las reescribe el refactor;
 * - dejar un ciclo de importación **de valor** en que entre un fichero de destino
 *   (Tarjan sobre lo que no es `import type`, `grafo.ts`);
 * - dejar un error de compilación en lo tocado o en quien importaba el origen, o
 *   perder un comentario.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { RAIZ } from '../comun/raiz.js';
import { especificadorNuevo } from './cadenas.js';
import { apuntarRutas, biomeSobre, escribirMudanza, testsQueLosLeen } from './escribir.js';
import { ciclosDeValor } from './grafo.js';
import { absoluta, delRepo, FORMATO, PREFERENCIAS, Proyecto } from './proyecto.js';

/** Lo que el mapa dice de un destino. */
interface Destino {
  readonly cabecera?: string;
  readonly declaraciones: readonly string[];
}

/** Los nombres que declara una sentencia de nivel superior; vacío si no declara nada. */
function nombresDe(s: ts.Statement): string[] {
  if (ts.isVariableStatement(s)) {
    const out: string[] = [];
    const recoger = (n: ts.BindingName): void => {
      if (ts.isIdentifier(n)) out.push(n.text);
      else for (const e of n.elements) if (!ts.isOmittedExpression(e)) recoger(e.name);
    };
    for (const d of s.declarationList.declarations) recoger(d.name);
    return out;
  }
  if (
    (ts.isFunctionDeclaration(s) ||
      ts.isClassDeclaration(s) ||
      ts.isInterfaceDeclaration(s) ||
      ts.isTypeAliasDeclaration(s) ||
      ts.isEnumDeclaration(s) ||
      ts.isModuleDeclaration(s)) &&
    s.name !== undefined &&
    ts.isIdentifier(s.name)
  ) {
    return [s.name.text];
  }
  return [];
}

/** ¿Es fontanería de módulos (importar, reexportar)? No se mueve ni cuenta como efecto. */
const esFontaneria = (s: ts.Statement): boolean =>
  ts.isImportDeclaration(s) ||
  ts.isImportEqualsDeclaration(s) ||
  (ts.isExportDeclaration(s) && s.moduleSpecifier !== undefined);

const tieneExport = (s: ts.Statement): boolean =>
  ts.canHaveModifiers(s) &&
  (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const lineaDe = (sf: ts.SourceFile, pos: number): number =>
  sf.getLineAndCharacterOfPosition(pos).line + 1;

/**
 * El comentario pegado a una sentencia —el bloque de comentarios que va justo
 * antes, sin una línea en blanco entre ellos ni entre el último y la sentencia—:
 * dónde empieza (sin comentario, donde la sentencia) y sus trozos. Un comentario
 * separado por una línea en blanco (el título de una sección) no es suyo.
 */
function comentarioPegado(
  sf: ts.SourceFile,
  s: ts.Statement,
): { readonly desde: number; readonly trozos: readonly string[] } {
  const texto = sf.text;
  const rangos = ts.getLeadingCommentRanges(texto, s.pos) ?? [];
  let desde = s.getStart(sf);
  const trozos: string[] = [];
  for (let i = rangos.length - 1; i >= 0; i--) {
    const r = rangos[i] as ts.CommentRange;
    const entre = texto.slice(r.end, desde);
    if ((entre.match(/\n/g) ?? []).length > 1) break;
    desde = r.pos;
    trozos.unshift(texto.slice(r.pos, r.end));
  }
  return { desde, trozos };
}

/**
 * Dónde empieza, en el destino, lo que el refactor imprimió del comentario pegado
 * de la sentencia original: los comentarios de delante que son trozos de aquel
 * (el refactor los reimprime tal cual, a veces con una línea en blanco antes de la
 * sentencia). Lo que no lo es —un comentario que ya estaba al final del destino—
 * se queda.
 */
function inicioDeLoImpreso(dsf: ts.SourceFile, s: ts.Statement, trozos: readonly string[]): number {
  const texto = dsf.text;
  const suyos = new Set(trozos);
  const rangos = ts.getLeadingCommentRanges(texto, s.pos) ?? [];
  let desde = s.getStart(dsf);
  for (let i = rangos.length - 1; i >= 0; i--) {
    const r = rangos[i] as ts.CommentRange;
    if (!suyos.has(texto.slice(r.pos, r.end))) break;
    desde = r.pos;
  }
  return desde;
}

/**
 * Todos los comentarios de un texto: lo que la mudanza no puede perder. Por el árbol
 * y no con el escáner suelto, que no sabe si un `}` cierra un bloque o un `${…}` de
 * una plantilla ni si una `/` abre una expresión regular: cada comentario es trivia
 * delante de algún token, y `getChildren` los recorre todos (también el `}` de un
 * bloque, delante del que van los comentarios del final del bloque).
 */
function comentariosDe(texto: string): string[] {
  const sf = ts.createSourceFile('x.ts', texto, ts.ScriptTarget.Latest, true);
  const vistos = new Set<number>();
  const out: string[] = [];
  const recoger = (rangos: readonly ts.CommentRange[] | undefined): void => {
    for (const r of rangos ?? []) {
      if (vistos.has(r.pos)) continue;
      vistos.add(r.pos);
      out.push(texto.slice(r.pos, r.end));
    }
  };
  const visitar = (n: ts.Node): void => {
    recoger(ts.getLeadingCommentRanges(texto, n.pos));
    recoger(ts.getTrailingCommentRanges(texto, n.end));
    for (const h of n.getChildren(sf)) visitar(h);
  };
  visitar(sf);
  return out;
}

/** El texto de una sentencia con su comentario, tal cual estaba. */
interface Original {
  readonly nombres: readonly string[];
  readonly texto: string;
  /** Lo que hay del principio del comentario al de la sentencia: donde va el `export` si hace falta. */
  readonly antesDeLaSentencia: number;
  /** Los comentarios pegados, uno a uno: lo que el refactor reimprime delante en el destino. */
  readonly trozos: readonly string[];
  /** Si iba separada de lo de antes por una línea en blanco: en el destino, también. */
  readonly separada: boolean;
  readonly exportada: boolean;
  readonly destino: string;
}

class Rechazo extends Error {}

function leerMapa(ruta: string): Map<string, Destino> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(absoluta(ruta), 'utf8'));
  } catch (err) {
    throw new Error(`el mapa ${ruta} no se lee: ${err instanceof Error ? err.message : err}`);
  }
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    throw new Error(
      `el mapa ${ruta} es un objeto: { "<fichero nuevo>": { "cabecera", "declaraciones" } }`,
    );
  }
  const mapa = new Map<string, Destino>();
  for (const [f, d] of Object.entries(crudo)) {
    const dd = d as Partial<Destino>;
    if (
      !Array.isArray(dd.declaraciones) ||
      dd.declaraciones.length === 0 ||
      !dd.declaraciones.every((x) => typeof x === 'string')
    ) {
      throw new Error(`${f}: «declaraciones» es una lista de nombres, y no vacía`);
    }
    if (dd.cabecera !== undefined && typeof dd.cabecera !== 'string') {
      throw new Error(`${f}: «cabecera» es un texto (el comentario que abre el fichero)`);
    }
    const otras = Object.keys(dd).filter((k) => k !== 'cabecera' && k !== 'declaraciones');
    if (otras.length > 0) throw new Error(`${f}: no sé qué es «${otras.join('», «')}»`);
    mapa.set(absoluta(f), dd as Destino);
  }
  return mapa;
}

/** El estilo con que un fichero importa del núcleo: el núcleo, en relativo; el resto, como ya lo hacía. */
function estiloDe(f: string, texto: string): 'alias' | 'relativo' {
  if (f.startsWith(join(RAIZ, 'src/core/'))) return 'relativo';
  return /from '@core\//.test(texto) ? 'alias' : 'relativo';
}

/**
 * Reescribe en `f` los especificadores que resuelven a `objetivos` (o, sin ellos, a
 * cualquier fichero del núcleo) con su estilo: el refactor escribe los de los
 * importadores con `@core/…` si es más corto, y el núcleo importa en relativo.
 */
function conSuEstilo(
  p: Proyecto,
  f: string,
  estilo: 'alias' | 'relativo',
  objetivos: ReadonlySet<string> | null,
): void {
  const sf = ts.createSourceFile(f, p.texto(f), ts.ScriptTarget.Latest, true);
  const cache = ts.createModuleResolutionCache(RAIZ, (x) => x, p.opciones);
  const cambios: ts.TextChange[] = [];
  const core = join(RAIZ, 'src/core/');
  for (const s of sf.statements) {
    const espec =
      ts.isImportDeclaration(s) || (ts.isExportDeclaration(s) && s.moduleSpecifier !== undefined)
        ? s.moduleSpecifier
        : undefined;
    if (espec === undefined || !ts.isStringLiteral(espec)) continue;
    const objetivo = p.resolver(espec.text, f, cache);
    if (objetivo === null || !objetivo.startsWith(core)) continue;
    if (objetivos !== null && !objetivos.has(objetivo)) continue;
    const comoSiFuera = estilo === 'alias' ? `@core/x.js` : './x.js';
    const nuevo = especificadorNuevo(comoSiFuera, objetivo, objetivo, f);
    if (nuevo !== espec.text) {
      cambios.push({
        span: { start: espec.getStart(sf), length: espec.end - espec.getStart(sf) },
        newText: `'${nuevo}'`,
      });
    }
  }
  if (cambios.length > 0) p.aplicar([{ fileName: f, textChanges: cambios }]);
}

export function partir(todos: readonly string[]): void {
  const enSeco = todos.includes('--en-seco');
  const [fichero, rutaDelMapa, ...sobra] = todos.filter((a) => a !== '--en-seco');
  if (fichero === undefined || rutaDelMapa === undefined || sobra.length > 0) {
    throw new Error('partir pide dos cosas: partir <fichero> <mapa.json>');
  }
  const mapa = leerMapa(rutaDelMapa);
  console.log('mudanza: cargando el proyecto…');
  const p = new Proyecto();
  const origen = absoluta(fichero);
  if (!p.esDelProyecto(origen)) {
    throw new Error(
      `${delRepo(origen)} no es un fichero del proyecto (los .ts de src, tools y test)`,
    );
  }
  for (const [d, dest] of mapa) {
    if (d === origen) throw new Error(`${delRepo(d)} es el origen: no se parte hacia sí mismo`);
    if (!/\.ts$/.test(d) || !/^(src|tools|test)\//.test(delRepo(d))) {
      throw new Error(`${delRepo(d)}: un destino es un .ts de src/, tools/ o test/`);
    }
    if (!p.existe(d) && dest.cabecera === undefined) {
      throw new Error(
        `${delRepo(d)} es nuevo y el mapa no le da «cabecera»: un fichero nuevo dice qué es`,
      );
    }
    if (p.existe(d) && dest.cabecera !== undefined) {
      throw new Error(`${delRepo(d)} ya existe y tiene su cabecera: quita la del mapa`);
    }
  }

  const programa = p.programa();
  const checker = programa.getTypeChecker();
  const sf = p.fuente(origen);
  const textoOriginal = sf.text;

  // 1. Qué sentencias van adónde.
  const porNombre = new Map<string, ts.Statement[]>();
  for (const s of sf.statements) {
    for (const n of nombresDe(s)) porNombre.set(n, [...(porNombre.get(n) ?? []), s]);
  }
  const destinoDe = new Map<string, string>();
  for (const [d, dest] of mapa) {
    for (const n of dest.declaraciones) {
      if (!porNombre.has(n)) {
        throw new Error(`«${n}» no es una declaración de nivel superior de ${delRepo(origen)}`);
      }
      const otro = destinoDe.get(n);
      if (otro !== undefined)
        throw new Error(`«${n}» va a dos sitios: ${delRepo(otro)} y ${delRepo(d)}`);
      destinoDe.set(n, d);
    }
  }
  const destinoDeSentencia = new Map<ts.Statement, string>();
  for (const [n, d] of destinoDe) {
    for (const s of porNombre.get(n) ?? []) {
      destinoDeSentencia.set(s, d);
      for (const m of nombresDe(s)) {
        if (destinoDe.get(m) !== d) {
          throw new Error(
            `«${n}» y «${m}» se declaran en la misma sentencia (línea ${lineaDe(sf, s.getStart(sf))}): van al mismo sitio o no se mueven`,
          );
        }
      }
    }
  }
  const simboloDe = (s: ts.Statement): ts.Symbol[] => {
    const out: ts.Symbol[] = [];
    const de = (n: ts.Node | undefined) => {
      const sym = n === undefined ? undefined : checker.getSymbolAtLocation(n);
      if (sym !== undefined) out.push(sym);
    };
    if (ts.isVariableStatement(s)) {
      const recoger = (n: ts.BindingName): void => {
        if (ts.isIdentifier(n)) de(n);
        else for (const e of n.elements) if (!ts.isOmittedExpression(e)) recoger(e.name);
      };
      for (const d of s.declarationList.declarations) recoger(d.name);
    } else de((s as ts.DeclarationStatement).name);
    return out;
  };
  const movidos = new Set<ts.Symbol>();
  for (const s of destinoDeSentencia.keys()) for (const sym of simboloDe(s)) movidos.add(sym);
  /** La sentencia de nivel superior que contiene `n`. */
  const sentenciaDe = (n: ts.Node): ts.Statement => {
    let x: ts.Node = n;
    while (x.parent !== sf) x = x.parent;
    return x as ts.Statement;
  };

  const rechazos: string[] = [];

  // 2. Un `let` de módulo no se separa de sus asignaciones.
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s) || (s.declarationList.flags & ts.NodeFlags.Const) !== 0)
      continue;
    if ((s.declarationList.flags & ts.NodeFlags.Using) !== 0) continue;
    const suyos = new Set(simboloDe(s));
    const sitio = destinoDeSentencia.get(s) ?? origen;
    const visitar = (n: ts.Node): void => {
      const escribe = (id: ts.Expression): void => {
        if (!ts.isIdentifier(id)) return;
        const sym = checker.getSymbolAtLocation(id);
        if (sym === undefined || !suyos.has(sym)) return;
        const donde = sentenciaDe(id);
        const otro = destinoDeSentencia.get(donde) ?? origen;
        if (otro !== sitio) {
          rechazos.push(
            `separa el \`let ${id.text}\` (línea ${lineaDe(sf, s.getStart(sf))}, va a ${delRepo(sitio)}) de su asignación de la línea ${lineaDe(sf, id.getStart(sf))} (va a ${delRepo(otro)}): lo importado no se asigna`,
          );
        }
      };
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        const izq = n.left;
        if (ts.isIdentifier(izq)) escribe(izq);
        else if (ts.isObjectLiteralExpression(izq) || ts.isArrayLiteralExpression(izq)) {
          const hojas = (e: ts.Node): void => {
            if (ts.isIdentifier(e)) escribe(e);
            else if (ts.isShorthandPropertyAssignment(e)) escribe(e.name);
            else ts.forEachChild(e, hojas);
          };
          hojas(izq);
        }
      }
      if (
        (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
      ) {
        escribe(n.operand);
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }

  // 3. Lo que usa una sentencia de efecto (o una exportación suelta) que se queda.
  for (const s of sf.statements) {
    if (esFontaneria(s) || nombresDe(s).length > 0) continue;
    const usa = new Set<string>();
    const visitar = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        const sym = checker.getSymbolAtLocation(n);
        const real =
          sym !== undefined && ts.isExportSpecifier(n.parent)
            ? checker.getExportSpecifierLocalTargetSymbol(n.parent)
            : sym;
        if (real !== undefined && movidos.has(real)) usa.add(n.text);
      }
      ts.forEachChild(n, visitar);
    };
    visitar(s);
    if (usa.size > 0) {
      const que =
        ts.isExportDeclaration(s) || ts.isExportAssignment(s)
          ? 'la exportación'
          : 'la sentencia de efecto';
      rechazos.push(
        `${que} de la línea ${lineaDe(sf, s.getStart(sf))} (\`${s.getText(sf).split('\n')[0]?.slice(0, 60)}\`) usa ${[...usa].map((u) => `«${u}»`).join(', ')}: moverlo cambiaría cuándo se ejecuta o qué exporta el origen`,
      );
    }
  }

  // 4. Quien importa el origen de una manera que el refactor no reescribe.
  const nombresMovidos = new Set(destinoDe.keys());
  const dependientes = new Set<string>();
  const cache = ts.createModuleResolutionCache(RAIZ, (x) => x, p.opciones);
  const base = delRepo(origen).replace(/\.ts$/, '').split('/').pop() as string;
  for (const f of p.delProyecto()) {
    if (f === origen) continue;
    const texto = p.texto(f);
    if (!texto.includes(base)) continue;
    const fsf = programa.getSourceFile(f);
    if (fsf === undefined) continue;
    const resuelveAlOrigen = (e: ts.Node | undefined): boolean =>
      e !== undefined &&
      (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) &&
      p.resolver(e.text, f, cache) === origen;
    const visitar = (n: ts.Node): void => {
      const linea = () => `${delRepo(f)}:${lineaDe(fsf, n.getStart(fsf))}`;
      if (ts.isImportDeclaration(n) && resuelveAlOrigen(n.moduleSpecifier)) {
        dependientes.add(f);
        const nb = n.importClause?.namedBindings;
        if (nb !== undefined && ts.isNamespaceImport(nb)) {
          const ns = checker.getSymbolAtLocation(nb.name);
          const usos = (m: ts.Node): void => {
            if (ts.isIdentifier(m) && m !== nb.name && checker.getSymbolAtLocation(m) === ns) {
              const padre = m.parent;
              const nombre =
                ts.isPropertyAccessExpression(padre) && padre.expression === m
                  ? padre.name.text
                  : ts.isQualifiedName(padre) && padre.left === m
                    ? padre.right.text
                    : null;
              if (nombre === null) {
                rechazos.push(
                  `${delRepo(f)}:${lineaDe(fsf, m.getStart(fsf))} usa \`import * as ${nb.name.text}\` del origen entero: no sé qué toma`,
                );
              } else if (nombresMovidos.has(nombre)) {
                rechazos.push(
                  `${delRepo(f)}:${lineaDe(fsf, m.getStart(fsf))} lee \`${nb.name.text}.${nombre}\` por \`import * as\`: el refactor no lo reescribe`,
                );
              }
            }
            ts.forEachChild(m, usos);
          };
          usos(fsf);
        }
      } else if (ts.isExportDeclaration(n) && resuelveAlOrigen(n.moduleSpecifier)) {
        dependientes.add(f);
        if (n.exportClause === undefined || ts.isNamespaceExport(n.exportClause)) {
          rechazos.push(`${linea()}: \`export *\` del origen: lo movido dejaría de reexportarse`);
        }
      } else if (
        ts.isImportTypeNode(n) &&
        ts.isLiteralTypeNode(n.argument) &&
        resuelveAlOrigen(n.argument.literal)
      ) {
        dependientes.add(f);
        const q = n.qualifier;
        const primero =
          q === undefined
            ? null
            : ts.isIdentifier(q)
              ? q.text
              : ts.isQualifiedName(q)
                ? ts.isIdentifier(q.left)
                  ? q.left.text
                  : null
                : null;
        if (primero !== null && nombresMovidos.has(primero)) {
          rechazos.push(
            `${linea()}: \`import('…').${primero}\` en un tipo: el refactor no lo reescribe`,
          );
        }
      } else if (
        ts.isCallExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword &&
        resuelveAlOrigen(n.arguments[0])
      ) {
        dependientes.add(f);
        const texto = n.parent.getText(fsf) + (n.parent.parent?.getText(fsf) ?? '');
        if ([...nombresMovidos].some((m) => new RegExp(`\\b${m}\\b`).test(texto))) {
          rechazos.push(
            `${linea()}: \`import()\` del origen que usa lo movido: el refactor no lo reescribe`,
          );
        }
      } else if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === 'vi' &&
        resuelveAlOrigen(n.arguments[0])
      ) {
        dependientes.add(f);
        const texto = n.getText(fsf);
        const toca = [...nombresMovidos].filter((m) => new RegExp(`\\b${m}\\b`).test(texto));
        if (toca.length > 0) {
          rechazos.push(
            `${linea()}: \`vi.${n.expression.name.text}\` del origen con ${toca.map((m) => `«${m}»`).join(', ')}: el mock ya no los cubriría`,
          );
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(fsf);
  }

  if (rechazos.length > 0) {
    throw new Rechazo(
      `no se parte ${delRepo(origen)} (no se ha tocado nada):\n- ${rechazos.join('\n- ')}`,
    );
  }

  // 5. El texto de lo que se mueve, con su comentario, tal cual.
  const originales: Original[] = [];
  for (const s of sf.statements) {
    const d = destinoDeSentencia.get(s);
    if (d === undefined) continue;
    const { desde, trozos } = comentarioPegado(sf, s);
    originales.push({
      nombres: nombresDe(s),
      texto: textoOriginal.slice(desde, s.end),
      antesDeLaSentencia: s.getStart(sf) - desde,
      trozos,
      separada: /\n\s*\n$/.test(textoOriginal.slice(0, desde)),
      exportada: tieneExport(s),
      destino: d,
    });
  }
  const destinosNuevos = new Set([...mapa.keys()].filter((d) => !p.existe(d)));
  // Los comentarios de antes: los del origen, los de los destinos que ya existían y
  // las cabeceras de los nuevos. Después tienen que estar los mismos, ni uno menos
  // ni uno repetido.
  const comentariosAntes = [
    ...comentariosDe(textoOriginal),
    ...[...mapa].flatMap(([d, dest]) =>
      destinosNuevos.has(d) ? comentariosDe(dest.cabecera ?? '') : comentariosDe(p.texto(d)),
    ),
  ];
  const estiloDelOrigen = estiloDe(origen, textoOriginal);
  const tocados = new Set<string>([origen]);
  const estilos = new Map<string, 'alias' | 'relativo'>();

  // 6. El refactor, por tramos seguidos del mismo destino, en el orden del origen.
  const tramos: { readonly destino: string; readonly nombres: readonly string[] }[] = [];
  for (const s of sf.statements) {
    const d = destinoDeSentencia.get(s);
    if (d === undefined) continue;
    const ultimo = tramos.at(-1);
    const anterior = sf.statements[sf.statements.indexOf(s) - 1];
    if (
      ultimo !== undefined &&
      ultimo.destino === d &&
      anterior !== undefined &&
      destinoDeSentencia.get(anterior) === d
    ) {
      tramos[tramos.length - 1] = {
        destino: d,
        nombres: [...ultimo.nombres, nombresDe(s)[0] as string],
      };
    } else tramos.push({ destino: d, nombres: [nombresDe(s)[0] as string] });
  }
  for (const tramo of tramos) {
    const ahora = ts.createSourceFile(origen, p.texto(origen), ts.ScriptTarget.Latest, true);
    const sentencias = ahora.statements.filter((s) =>
      nombresDe(s).some((n) => tramo.nombres.includes(n)),
    );
    const primera = sentencias[0];
    const ultima = sentencias.at(-1);
    if (primera === undefined || ultima === undefined) {
      throw new Error(
        `no encuentro ${tramo.nombres.join(', ')} en ${delRepo(origen)} a media mudanza`,
      );
    }
    const r = p.servicio.getEditsForRefactor(
      origen,
      FORMATO,
      { pos: primera.getStart(ahora), end: ultima.end },
      'Move to file',
      'Move to file',
      PREFERENCIAS,
      { targetFile: tramo.destino },
    );
    if (r === undefined) {
      throw new Error(
        `el servicio no sabe mover ${tramo.nombres.join(', ')} a ${delRepo(tramo.destino)}`,
      );
    }
    for (const fc of r.edits) {
      const f = fc.fileName;
      if (!estilos.has(f) && f !== tramo.destino) estilos.set(f, estiloDe(f, p.leer(f) ?? ''));
      tocados.add(f);
    }
    p.aplicar(r.edits);
  }

  // 7. Lo movido, con su texto de antes; la cabecera de lo nuevo; el estilo de las importaciones.
  for (const d of mapa.keys()) {
    const dsf = ts.createSourceFile(d, p.texto(d), ts.ScriptTarget.Latest, true);
    const cambios: ts.TextChange[] = [];
    const vistos = new Map<string, number>();
    for (const s of dsf.statements) {
      const n = nombresDe(s)[0];
      if (n === undefined) continue;
      const deEste = originales.filter((o) => o.destino === d && o.nombres[0] === n);
      if (deEste.length === 0) continue;
      const k = vistos.get(n) ?? 0;
      vistos.set(n, k + 1);
      const o = deEste[k];
      if (o === undefined) throw new Error(`${delRepo(d)} trae más «${n}» de los que se movieron`);
      const conExport = !o.exportada && tieneExport(s);
      const texto = conExport
        ? `${o.texto.slice(0, o.antesDeLaSentencia)}export ${o.texto.slice(o.antesDeLaSentencia)}`
        : o.texto;
      const desde = inicioDeLoImpreso(dsf, s, o.trozos);
      // El refactor junta lo movido sin líneas en blanco; se le devuelve la que tenía.
      const antes = dsf.text.slice(0, desde);
      const falta = o.separada && antes !== '' && !/\n\s*\n$/.test(antes) ? '\n' : '';
      cambios.push({ span: { start: desde, length: s.end - desde }, newText: falta + texto });
    }
    p.aplicar([{ fileName: d, textChanges: cambios }]);
    const cabecera = mapa.get(d)?.cabecera;
    if (destinosNuevos.has(d) && cabecera !== undefined) {
      const resto = p.texto(d).replace(/^\s+/, '');
      p.escribir(d, `${cabecera.trimEnd()}\n${resto.startsWith('import') ? '' : '\n'}${resto}`);
    }
  }
  const destinos = new Set(mapa.keys());
  for (const f of tocados) {
    if (destinos.has(f)) continue;
    conSuEstilo(p, f, estilos.get(f) ?? estiloDe(f, p.texto(f)), destinos);
  }
  for (const d of destinos) {
    conSuEstilo(p, d, d.startsWith(join(RAIZ, 'src/core/')) ? 'relativo' : estiloDelOrigen, null);
  }

  // 7b. Lo que el refactor importó como tipo y se usa como valor. Con
  // `preferTypeOnlyAutoImports` mira el primer uso: una clase que lo movido nombra
  // primero en una anotación y luego en un `new` o un `instanceof` le salía en un
  // `import type` (H5, `capturas.ts`: `Session`, `SesionDeArena`, `EscenaTropa`…). Se
  // saca de él a un `import` de valor del mismo módulo; biome junta los dos después.
  for (const f of new Set([...tocados, ...destinos])) {
    const fsf = p.fuente(f);
    const comoValor = new Set<string>();
    for (const d of p.servicio.getSemanticDiagnostics(resolve(f))) {
      if (d.code !== 1361 || d.start === undefined) continue;
      const m = /^\s*[\w$]+/.exec(fsf.text.slice(d.start));
      if (m) comoValor.add(m[0].trim());
    }
    if (comoValor.size === 0) continue;
    const cambios: ts.TextChange[] = [];
    for (const s of fsf.statements) {
      if (!ts.isImportDeclaration(s) || s.importClause === undefined) continue;
      const ic = s.importClause;
      const desde = { start: s.getStart(fsf), length: s.end - s.getStart(fsf) };
      // `import type X from 'm'` (un `default`): fuera el `type`.
      if (ic.isTypeOnly && ic.name !== undefined && comoValor.has(ic.name.text)) {
        cambios.push({
          span: desde,
          newText: s.getText(fsf).replace(/^import\s+type\s+/, 'import '),
        });
        continue;
      }
      // `import { type X } from 'm'`: fuera el `type` de ese nombre.
      if (!ic.isTypeOnly && ic.namedBindings !== undefined && ts.isNamedImports(ic.namedBindings)) {
        for (const e of ic.namedBindings.elements) {
          if (!e.isTypeOnly || !comoValor.has(e.name.text)) continue;
          const t = e.getText(fsf);
          cambios.push({
            span: { start: e.getStart(fsf), length: t.length },
            newText: t.replace(/^type\s+/, ''),
          });
        }
        continue;
      }
      if (!ic.isTypeOnly) continue;
      const nb = ic.namedBindings;
      if (nb === undefined || !ts.isNamedImports(nb)) continue;
      const sacar = nb.elements.filter((e) => comoValor.has(e.name.text));
      if (sacar.length === 0) continue;
      const quedan = nb.elements.filter((e) => !comoValor.has(e.name.text));
      const modulo = s.moduleSpecifier.getText(fsf);
      const valor = `import { ${sacar.map((e) => e.getText(fsf)).join(', ')} } from ${modulo};`;
      const tipo =
        quedan.length === 0
          ? ''
          : `import type { ${quedan.map((e) => e.getText(fsf)).join(', ')} } from ${modulo};\n`;
      cambios.push({ span: desde, newText: `${tipo}${valor}` });
    }
    p.aplicar([{ fileName: f, textChanges: cambios }]);
  }

  // 8. Las comprobaciones, en memoria.
  const problemas: string[] = [];
  const quedan = ts.createSourceFile(origen, p.texto(origen), ts.ScriptTarget.Latest, true);
  for (const s of quedan.statements) {
    for (const n of nombresDe(s)) if (destinoDe.has(n)) problemas.push(`«${n}» sigue en el origen`);
  }
  for (const d of destinos) {
    const dsf = ts.createSourceFile(d, p.texto(d), ts.ScriptTarget.Latest, true);
    const hay = new Set(dsf.statements.flatMap(nombresDe));
    for (const [n, dd] of destinoDe)
      if (dd === d && !hay.has(n)) problemas.push(`«${n}» no llegó a ${delRepo(d)}`);
  }
  const comentariosDespues = [p.texto(origen), ...[...destinos].map((d) => p.texto(d))].flatMap(
    comentariosDe,
  );
  const cuenta = (xs: readonly string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const despues = cuenta(comentariosDespues);
  const antes = cuenta(comentariosAntes);
  for (const c of new Set([...antes.keys(), ...despues.keys()])) {
    const k = antes.get(c) ?? 0;
    const j = despues.get(c) ?? 0;
    const que = c.split('\n')[0]?.slice(0, 80);
    if (j < k) problemas.push(`se pierde un comentario: ${que}`);
    else if (j > k) problemas.push(`se repite un comentario: ${que}`);
  }
  for (const c of ciclosDeValor(p)) {
    if (c.some((f) => destinos.has(f))) {
      problemas.push(`queda un ciclo de importación de valor: ${c.map(delRepo).join(' → ')}`);
    }
  }
  const aMirar = new Set([...tocados, ...destinos, ...dependientes]);
  for (const f of aMirar) problemas.push(...p.errores(f));
  if (problemas.length > 0) {
    throw new Rechazo(
      `no se parte ${delRepo(origen)} (no se ha tocado nada):\n- ${problemas.join('\n- ')}`,
    );
  }

  // 9. Al disco (con `--en-seco`, no: se dice lo que se escribiría).
  if (enSeco) {
    for (const [d, dest] of mapa) {
      console.log(`${delRepo(origen)} → ${delRepo(d)}: ${dest.declaraciones.join(', ')}`);
    }
    const escritos = [...p.loCambiado().escritos.keys()].map(delRepo).sort();
    console.log(`\nen seco, no se ha tocado nada; se escribirían ${escritos.length} ficheros:`);
    for (const f of escritos) console.log(`  ${f}`);
    return;
  }
  const escritos = escribirMudanza(p, []);
  biomeSobre(escritos);
  apuntarRutas(
    [...destinoDe].map(([n, d]) => ({
      tipo: 'simbolo',
      viejo: delRepo(origen),
      nuevo: delRepo(d),
      simbolo: n,
    })),
  );
  for (const [d, dest] of mapa) {
    console.log(
      `${delRepo(origen)} → ${delRepo(d)}${destinosNuevos.has(d) ? ' (nuevo)' : ''}: ${dest.declaraciones.join(', ')}`,
    );
  }
  console.log(`\n${escritos.length} ficheros escritos:`);
  for (const f of escritos.map(delRepo).sort()) console.log(`  ${f}`);
  const guardias = guardiasQueLosNombran([...destinoDe.keys()]);
  if (guardias.length > 0) {
    console.log(`\nLíneas de los guardias que nombran lo movido, sin tocar (${guardias.length}):`);
    for (const g of guardias) console.log(`  ${g}`);
  }
  const nuevos = [...destinosNuevos].map(delRepo);
  if (nuevos.length > 0) console.log(`\nFicheros nuevos, sin añadir a git: ${nuevos.join(', ')}`);
  const tests = testsQueLosLeen([origen, ...destinos]);
  console.log(
    `\nComprueba: pnpm typecheck; npx tsx tools/mudanza/cli.ts comprobar HEAD${tests.length === 0 ? '' : `; los tests que los leen: pnpm vitest run ${tests.join(' ')}`}`,
  );
}

/**
 * Las líneas de `test/invariantes*.test.ts` que nombran algo de lo movido: un
 * guardia que dice en qué fichero vive una puerta deja de mirar donde está.
 */
function guardiasQueLosNombran(nombres: readonly string[]): string[] {
  const out: string[] = [];
  const nombra = nombres.map((n) => new RegExp(`\\b${n}\\b`));
  for (const f of readdirSync(join(RAIZ, 'test')).filter((x) =>
    /^invariantes.*\.test\.ts$/.test(x),
  )) {
    const lineas = readFileSync(join(RAIZ, 'test', f), 'utf8').split('\n');
    for (const [i, l] of lineas.entries()) {
      // Las de comentario no vigilan nada.
      if (/^\s*(\/\/|\/?\*)/.test(l)) continue;
      if (nombra.some((re) => re.test(l)))
        out.push(`test/${f}:${i + 1}: ${l.trim().slice(0, 140)}`);
    }
  }
  return out;
}

export { Rechazo };
