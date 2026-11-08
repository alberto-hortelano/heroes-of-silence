/**
 * `comprobar <ref>`: demuestra que lo que cambió desde `<ref>` (lo commiteado, lo
 * añadido y lo que aún no se ha añadido) es **solo una mudanza**.
 *
 * Se juzga por sentencias de nivel superior de `src/`, `tools/`, `test/` y
 * `vite.config.ts`: las mismas antes y después, contadas como un multiconjunto, sin
 * importar en qué fichero estén. Cada una, normalizada: reimpresa por el compilador
 * sin comentarios (así no cuentan el formato ni los saltos de línea que Biome
 * mueve), sin el `export` delante (mover a otro fichero exporta lo que antes era
 * local), sin comas finales ni blancos junto a un paréntesis, un corchete o una
 * llave, y con las rutas de las cadenas cambiadas por `«ruta»`
 * (el `RAIZ` de un fichero que cambia de profundidad, la ruta que vigila un
 * guardia). La fontanería —`import`, `export … from`, `export { … }`— no cuenta:
 * es lo que una mudanza reescribe.
 *
 * Lo que dice:
 *
 * - **lo que falta o sobra** (una sentencia que estaba y ya no, o al revés): eso
 *   no es mudanza, y sale 1;
 * - lo que **cambió de fichero**, por carpeta (en `src/` es la mudanza; en `test/`
 *   y `tools/`, que en las fases del núcleo y el cliente no se reparten, se mira);
 * - las **rutas** que cambiaron dentro de una sentencia, una por una.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { RAIZ } from '../comun/raiz.js';
import { absoluta } from './proyecto.js';

const CARPETAS = ['src', 'tools', 'test', 'vite.config.ts'] as const;

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });

/** Una sentencia de nivel superior con su sitio, normalizada de dos maneras. */
interface Sentencia {
  readonly fichero: string;
  readonly linea: number;
  /** Normalizada del todo: la clave del multiconjunto. */
  readonly clave: string;
  /** Normalizada salvo las rutas: si difiere con la misma clave, cambió una ruta. */
  readonly conRutas: string;
  /** La primera línea, para decirla. */
  readonly muestra: string;
}

/**
 * ¿Es una ruta lo que va en esta cadena? Relativa (`./`, `../`, `.`, `..`), con el
 * alias del núcleo, de una carpeta del repo (`src/…`, `assets/…`) o con la
 * extensión de un fichero del repo. «km/h» o «mediana / p90» no lo son.
 */
function esRuta(x: string): boolean {
  if (x === '.' || x === '..') return true;
  if (!/^[\w@./-]+$/.test(x)) return false;
  return (
    /^\.{1,2}\//.test(x) ||
    x.startsWith('@core/') ||
    /^(src|tools|test|data|assets|docs|node_modules)\//.test(x) ||
    /\.(ts|js|json|html|css|md|tsv|webp|png|jsonl)$/.test(x)
  );
}

const IMPRESORA = ts.createPrinter({ removeComments: true });

/** Las comillas y lo que hay dentro: una cadena del texto ya impreso. */
const CADENA = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

function normalizar(texto: string): { readonly clave: string; readonly conRutas: string } {
  // Sin el blanco de dentro de un paréntesis, un corchete o una llave: el compilador
  // imprime en varias líneas la lista o el objeto que el fuente tenía en varias, y
  // Biome parte en varias la que, con el `export` que le pone la mudanza, pasa de
  // 100 columnas (`SITIOS_DE_RELLENO`, fase C3c: `[0.125, …]` salía `[ 0.125, …]`).
  const conRutas = texto
    .replace(/^export\s+(default\s+)?/, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*([)\]}>])/g, '$1')
    .replace(/([[({])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .trim();
  const clave = conRutas.replace(CADENA, (todo, comilla: string, dentro: string) =>
    esRuta(dentro) ? `${comilla}«ruta»${comilla}` : todo,
  );
  return { clave, conRutas };
}

/** ¿Es fontanería de módulos? Una mudanza la reescribe, así que no cuenta. */
const esFontaneria = (s: ts.Statement): boolean =>
  ts.isImportDeclaration(s) || ts.isImportEqualsDeclaration(s) || ts.isExportDeclaration(s);

function sentenciasDe(fichero: string, texto: string): Sentencia[] {
  const sf = ts.createSourceFile(fichero, texto, ts.ScriptTarget.Latest, true);
  const out: Sentencia[] = [];
  for (const s of sf.statements) {
    if (esFontaneria(s)) continue;
    const { clave, conRutas } = normalizar(IMPRESORA.printNode(ts.EmitHint.Unspecified, s, sf));
    out.push({
      fichero,
      linea: sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1,
      clave,
      conRutas,
      muestra: s.getText(sf).split('\n')[0]?.slice(0, 100) ?? '',
    });
  }
  return out;
}

const esDeLasCarpetas = (f: string): boolean =>
  f.endsWith('.ts') && CARPETAS.some((c) => f === c || f.startsWith(`${c}/`));

/** Los ficheros `.ts` de las carpetas en `ref`, con su texto (una sola llamada a `git cat-file`). */
function enLaRef(ref: string): Map<string, string> {
  const nombres = git('ls-tree', '-r', '--name-only', ref, '--', ...CARPETAS)
    .split('\n')
    .filter(esDeLasCarpetas);
  const salida = execFileSync('git', ['cat-file', '--batch'], {
    cwd: RAIZ,
    input: nombres.map((n) => `${ref}:${n}`).join('\n'),
    maxBuffer: 1024 * 1024 * 1024,
  });
  const out = new Map<string, string>();
  let i = 0;
  for (const n of nombres) {
    const fin = salida.indexOf(10, i);
    const cabecera = salida.subarray(i, fin).toString('utf8');
    const tam = Number(cabecera.split(' ')[2]);
    if (!Number.isInteger(tam)) throw new Error(`git cat-file no da ${n}: ${cabecera}`);
    out.set(n, salida.subarray(fin + 1, fin + 1 + tam).toString('utf8'));
    i = fin + 1 + tam + 1;
  }
  return out;
}

/** Los `.ts` de las carpetas ahora: lo seguido por git y lo nuevo sin añadir, del disco. */
function ahora(): Map<string, string> {
  const nombres = git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...CARPETAS)
    .split('\n')
    .filter(esDeLasCarpetas)
    .filter((n) => existsSync(absoluta(n)));
  return new Map([...new Set(nombres)].map((n) => [n, readFileSync(absoluta(n), 'utf8')]));
}

const carpetaDe = (f: string): string => (f.includes('/') ? (f.split('/')[0] as string) : f);

export function comprobar(args: readonly string[]): void {
  const [ref, ...sobra] = args;
  if (ref === undefined || sobra.length > 0)
    throw new Error('comprobar pide una ref: comprobar <ref>');
  git('rev-parse', '--verify', `${ref}^{commit}`);
  const antes = enLaRef(ref);
  const despues = ahora();
  const cambiados = [...new Set([...antes.keys(), ...despues.keys()])].filter(
    (f) => antes.get(f) !== despues.get(f),
  );
  // Solo se comparan los ficheros que cambiaron: lo que no se tocó es igual por definición.
  const de = (m: Map<string, string>) =>
    cambiados.flatMap((f) => {
      const t = m.get(f);
      return t === undefined ? [] : sentenciasDe(f, t);
    });
  const viejas = de(antes);
  const nuevas = de(despues);
  const porClave = (xs: readonly Sentencia[]) => {
    const m = new Map<string, Sentencia[]>();
    for (const x of xs) m.set(x.clave, [...(m.get(x.clave) ?? []), x]);
    return m;
  };
  const v = porClave(viejas);
  const n = porClave(nuevas);
  const faltan: Sentencia[] = [];
  const sobran: Sentencia[] = [];
  const movidas = new Map<string, number>();
  const rutas: string[] = [];
  for (const clave of new Set([...v.keys(), ...n.keys()])) {
    const a = [...(v.get(clave) ?? [])];
    const b = [...(n.get(clave) ?? [])];
    // Primero las que siguen en su fichero; luego, las que cambiaron de sitio.
    const emparejadas: [Sentencia, Sentencia][] = [];
    for (const x of [...a]) {
      const k = b.findIndex((y) => y.fichero === x.fichero);
      if (k === -1) continue;
      emparejadas.push([x, b[k] as Sentencia]);
      b.splice(k, 1);
      a.splice(a.indexOf(x), 1);
    }
    while (a.length > 0 && b.length > 0) {
      const x = a.shift() as Sentencia;
      const y = b.shift() as Sentencia;
      emparejadas.push([x, y]);
      const c = carpetaDe(y.fichero);
      movidas.set(c, (movidas.get(c) ?? 0) + 1);
    }
    faltan.push(...a);
    sobran.push(...b);
    for (const [x, y] of emparejadas) {
      if (x.conRutas === y.conRutas) continue;
      const cadenas = (t: string) => [...t.matchAll(CADENA)].map((m) => m[2] ?? '').filter(esRuta);
      const va = cadenas(x.conRutas);
      const vb = cadenas(y.conRutas);
      const cambios = va.flatMap((r, i) =>
        vb[i] !== undefined && vb[i] !== r ? [`'${r}' → '${vb[i]}'`] : [],
      );
      rutas.push(`${y.fichero}:${y.linea}: ${cambios.join(', ')}`);
    }
  }

  console.log(
    `comprobar ${ref}: ${cambiados.length} ficheros cambiados; ${viejas.length} sentencias de nivel superior en ellos antes, ${nuevas.length} ahora`,
  );
  for (const c of ['src', 'tools', 'test', 'vite.config.ts']) {
    const k = movidas.get(c) ?? 0;
    if (k > 0) console.log(`  cambian de fichero, a ${c}: ${k}`);
  }
  if (rutas.length > 0) {
    console.log(`\nRutas cambiadas dentro de una sentencia (${rutas.length}):`);
    for (const r of rutas) console.log(`  ${r}`);
  }
  if (faltan.length === 0 && sobran.length === 0) {
    console.log(
      '\nes una mudanza: las mismas sentencias, solo cambian de sitio, importaciones y rutas',
    );
    return;
  }
  process.exitCode = 1;
  const decir = (titulo: string, xs: readonly Sentencia[]) => {
    if (xs.length === 0) return;
    console.error(`\n${titulo} (${xs.length}):`);
    for (const x of xs) console.error(`  ${x.fichero}:${x.linea}: ${x.muestra}`);
  };
  decir(`NO ES SOLO UNA MUDANZA. Estaban en ${ref} y ya no`, faltan);
  decir('Están ahora y no estaban', sobran);
}
