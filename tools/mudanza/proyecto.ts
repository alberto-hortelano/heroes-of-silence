/**
 * El proyecto de TypeScript del repo, con el servicio de lenguaje encima y un disco
 * de mentira delante: lo que la mudanza cambia se queda en memoria hasta que todo
 * se ha comprobado, y solo entonces se escribe. Así una mudanza que se rechaza no
 * deja nada a medias (`partir` rechaza «sin tocar nada») y la que sale bien se
 * escribe de una vez.
 *
 * El servicio es el de `node_modules/typescript` con el `tsconfig.json` del repo
 * (`src`, `tools`, `test` y `vite.config.ts`; `moduleResolution: bundler`, el alias
 * `@core/*`, `verbatimModuleSyntax`): el mismo que juzga `pnpm typecheck`, así que lo
 * que resuelve una importación aquí es lo que resuelve allí.
 *
 * Herramienta de la reorganización del 06-11-2026: se borra al acabarla.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { RAIZ } from '../comun/raiz.js';

/** La ruta del repo (con `/`) de una absoluta: lo que se escribe en los mensajes y en `rutas.tsv`. */
export const delRepo = (absoluta: string): string => relative(RAIZ, absoluta).split('\\').join('/');

/** La absoluta de una ruta del repo (o de una ya absoluta). */
export const absoluta = (ruta: string): string => resolve(RAIZ, ruta);

/**
 * Las preferencias con que el servicio escribe importaciones: con `.js` detrás (las
 * del repo lo llevan: `moduleResolution: bundler` sobre ESM), `import type` cuando
 * solo es un tipo (`verbatimModuleSyntax` no deja otra) y relativas, que es como
 * importa casi todo el repo; el alias `@core/*` de quien ya lo usa se conserva
 * (`getEditsForFileRename` mira cómo era la vieja).
 */
export const PREFERENCIAS: ts.UserPreferences = {
  importModuleSpecifierEnding: 'js',
  importModuleSpecifierPreference: 'relative',
  preferTypeOnlyAutoImports: true,
  quotePreference: 'single',
  allowTextChangesInNewFiles: true,
  provideRefactorNotApplicableReason: true,
};

/** El formato de lo que escribe el servicio: lo de después lo deja como el repo `biome`. */
export const FORMATO: ts.FormatCodeSettings = {
  ...ts.getDefaultFormatCodeSettings('\n'),
  indentSize: 2,
  tabSize: 2,
  convertTabsToSpaces: true,
  semicolons: ts.SemicolonPreference.Insert,
};

/**
 * `resolve` con memoria: el servicio pregunta por los mismos caminos decenas de miles
 * de veces (la resolución de módulos recorre `node_modules`), y normalizarlos cada
 * vez era la mitad de lo que tardaba un `mover` (12 s por fichero, medido con
 * `--cpu-prof` el 06-11-2026).
 */
const normalizados = new Map<string, string>();
function norm(f: string): string {
  let a = normalizados.get(f);
  if (a === undefined) {
    a = resolve(f);
    normalizados.set(f, a);
  }
  return a;
}

/** Las carpetas que compila `tsconfig.json`: un `.ts` nuevo en ellas entra en el programa. */
const CARPETAS_DEL_PROYECTO = ['src', 'tools', 'test'] as const;

/** Lo que cambió en el disco de mentira respecto al de verdad. */
interface Cambio {
  /** El texto nuevo, o `null` si el fichero ya no está (se movió de aquí). */
  readonly texto: string | null;
}

export class Proyecto {
  readonly opciones: ts.CompilerOptions;
  /** Los ficheros del proyecto (absolutos), como los da el `tsconfig.json`; cambian con la mudanza. */
  private readonly ficheros: Set<string>;
  private readonly cambios = new Map<string, Cambio>();
  private readonly versiones = new Map<string, number>();
  /** Las carpetas que solo existen en memoria (las de un fichero nuevo o movido): las pregunta la resolución. */
  private readonly carpetas = new Set<string>();
  readonly servicio: ts.LanguageService;

  constructor() {
    const config = ts.getParsedCommandLineOfConfigFile(join(RAIZ, 'tsconfig.json'), undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(
          `tsconfig.json no se lee: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`,
        );
      },
    });
    if (config === undefined) throw new Error('tsconfig.json no se lee');
    if (config.errors.length > 0) {
      throw new Error(
        `tsconfig.json tiene problemas: ${config.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`,
      );
    }
    this.opciones = config.options;
    this.ficheros = new Set(config.fileNames.map((f) => resolve(f)));
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [...this.ficheros],
      getScriptVersion: (f) => String(this.versiones.get(norm(f)) ?? 0),
      getScriptSnapshot: (f) => {
        const t = this.leer(f);
        return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
      },
      getCurrentDirectory: () => RAIZ,
      getCompilationSettings: () => this.opciones,
      getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
      fileExists: (f) => this.existe(f),
      readFile: (f) => this.leer(f),
      readDirectory: (...a) => ts.sys.readDirectory(...a),
      directoryExists: (d) => this.carpetas.has(norm(d)) || ts.sys.directoryExists(d),
      getDirectories: (d) => ts.sys.getDirectories(d),
      realpath: (p) => ts.sys.realpath?.(p) ?? p,
      useCaseSensitiveFileNames: () => true,
    };
    this.servicio = ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  /** El texto de `f` tal como lo ve la mudanza ahora (con lo cambiado en memoria), o `undefined`. */
  leer(f: string): string | undefined {
    const a = norm(f);
    const c = this.cambios.get(a);
    if (c !== undefined) return c.texto ?? undefined;
    return existsSync(a) ? readFileSync(a, 'utf8') : undefined;
  }

  /** El texto de `f`, que tiene que estar. */
  texto(f: string): string {
    const t = this.leer(f);
    if (t === undefined) throw new Error(`${delRepo(resolve(f))} no existe`);
    return t;
  }

  existe(f: string): boolean {
    const a = norm(f);
    const c = this.cambios.get(a);
    return c !== undefined ? c.texto !== null : existsSync(a);
  }

  /** ¿Es `f` un fichero del proyecto (de los que compila `tsconfig.json`)? */
  esDelProyecto(f: string): boolean {
    return this.ficheros.has(norm(f));
  }

  /** Los ficheros del proyecto, ahora. */
  delProyecto(): readonly string[] {
    return [...this.ficheros];
  }

  escribir(f: string, texto: string): void {
    const a = norm(f);
    this.cambios.set(a, { texto });
    for (let d = dirname(a); d.length > RAIZ.length; d = dirname(d)) this.carpetas.add(d);
    this.versiones.set(a, (this.versiones.get(a) ?? 0) + 1);
    if (/\.ts$/.test(a) && CARPETAS_DEL_PROYECTO.some((c) => a.startsWith(`${RAIZ}/${c}/`))) {
      this.ficheros.add(a);
    }
  }

  /** Mueve `de` a `a` en el disco de mentira (el texto, el que tenga ahora). */
  renombrar(de: string, a: string): void {
    const viejo = norm(de);
    const nuevo = norm(a);
    const texto = this.texto(viejo);
    const eraDelProyecto = this.ficheros.delete(viejo);
    this.cambios.set(viejo, { texto: null });
    this.versiones.set(viejo, (this.versiones.get(viejo) ?? 0) + 1);
    this.escribir(nuevo, texto);
    if (eraDelProyecto) this.ficheros.add(nuevo);
  }

  /** Aplica las ediciones de texto del servicio; devuelve los ficheros que tocó. */
  aplicar(cambios: readonly ts.FileTextChanges[]): string[] {
    const tocados: string[] = [];
    for (const fc of cambios) {
      const f = norm(fc.fileName);
      const base = fc.isNewFile === true ? (this.leer(f) ?? '') : this.texto(f);
      this.escribir(f, aplicarEnTexto(base, fc.textChanges));
      tocados.push(f);
    }
    return tocados;
  }

  /** Lo que cambió respecto al disco: los ficheros con texto nuevo y los que ya no están. */
  loCambiado(): {
    readonly escritos: ReadonlyMap<string, string>;
    readonly quitados: readonly string[];
  } {
    const escritos = new Map<string, string>();
    const quitados: string[] = [];
    for (const [f, c] of this.cambios) {
      if (c.texto === null) quitados.push(f);
      else if (!existsSync(f) || readFileSync(f, 'utf8') !== c.texto) escritos.set(f, c.texto);
    }
    return { escritos, quitados };
  }

  /** El `SourceFile` de `f` en el programa de ahora. */
  fuente(f: string): ts.SourceFile {
    const sf = this.programa().getSourceFile(resolve(f));
    if (sf === undefined) throw new Error(`${delRepo(resolve(f))} no está en el programa`);
    return sf;
  }

  programa(): ts.Program {
    const p = this.servicio.getProgram();
    if (p === undefined) throw new Error('el servicio de lenguaje no tiene programa');
    return p;
  }

  /** El fichero al que resuelve `especificador` desde `desde`, o `null` (un paquete, algo que no existe). */
  resolver(especificador: string, desde: string, cache?: ts.ModuleResolutionCache): string | null {
    const r = ts.resolveModuleName(
      especificador,
      resolve(desde),
      this.opciones,
      {
        fileExists: (f) => this.existe(f),
        readFile: (f) => this.leer(f),
        directoryExists: (d) => ts.sys.directoryExists(d),
        realpath: (p) => ts.sys.realpath?.(p) ?? p,
        getCurrentDirectory: () => RAIZ,
      },
      cache,
    );
    const f = r.resolvedModule?.resolvedFileName;
    if (f === undefined || f.includes('/node_modules/')) return null;
    return resolve(f);
  }

  /** Los errores de compilación de `f` ahora, ya dichos en una línea cada uno. */
  errores(f: string): string[] {
    const a = resolve(f);
    const diag = [
      ...this.servicio.getSyntacticDiagnostics(a),
      ...this.servicio.getSemanticDiagnostics(a),
    ];
    return diag.map((d) => {
      const donde =
        d.file !== undefined && d.start !== undefined
          ? `${delRepo(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}`
          : delRepo(a);
      return `${donde}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
    });
  }
}

/** Aplica ediciones de texto (de un mismo fichero, sin solaparse) de la última a la primera. */
export function aplicarEnTexto(texto: string, cambios: readonly ts.TextChange[]): string {
  // De la última a la primera, y dos que se insertan en el mismo sitio, la de detrás
  // antes: así quedan en el orden en que vienen.
  const orden = cambios
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.span.start - a.c.span.start || b.i - a.i)
    .map(({ c }) => c);
  let t = texto;
  let tope = Number.POSITIVE_INFINITY;
  for (const c of orden) {
    const fin = c.span.start + c.span.length;
    if (fin > tope) throw new Error('dos ediciones del servicio se solapan: no sé aplicarlas');
    t = t.slice(0, c.span.start) + c.newText + t.slice(fin);
    tope = c.span.start;
  }
  return t;
}

/** El directorio de una ruta: lo que lee `import.meta.dirname` de un fichero. */
export const carpetaDe = (f: string): string => dirname(resolve(f));
