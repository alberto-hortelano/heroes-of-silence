/**
 * Las rutas que van en cadenas, que el servicio de lenguaje no ve: lo que la
 * mudanza reescribe sola y lo que solo puede listar.
 *
 * **Reescribe** las que sabe leer, relativas al fichero que las escribe:
 *
 * - el especificador de `vi.mock`, `vi.doMock`, `vi.unmock`, `vi.doUnmock`,
 *   `vi.importActual` y `vi.importMock` (se resuelve como una importación);
 * - `new URL('<ruta>', import.meta.url)` (el `Worker` del pintor del suelo, las
 *   raíces de `tools/datos`, los ficheros de los tests);
 * - `resolve(import.meta.dirname, '<ruta>'…)` y `join(…)` (o con `__dirname`): el
 *   `RAIZ` de medio `tools/`, que a otra profundidad apunta a otro sitio en
 *   ejecución sin que `tsc` diga nada.
 *
 * Cambian si se mueve quien la escribe o aquello a lo que apunta; una carpeta no se
 * mueve nunca (la mudanza mueve ficheros).
 *
 * **Lista sin tocar** cualquier otra mención de la ruta vieja (los guardias de
 * `test/invariantes.test.ts`, los `*.html`, `package.json`, `.mcp.json`, el
 * `ssrLoadModule` de `vite.config.ts`, los `spawn` de `tools/`, la documentación):
 * ahí la ruta es un dato, y cambiarla a ciegas cambiaría lo que vigila un guardia o
 * lo que dice un documento de historia.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { RAIZ } from '../comun/raiz.js';
import { delRepo, type Proyecto } from './proyecto.js';

/** Una cadena reescrita: dónde, de qué a qué. Lo dice la mudanza al acabar. */
export interface CadenaReescrita {
  readonly fichero: string;
  readonly linea: number;
  readonly antes: string;
  readonly despues: string;
}

/** Los `vi.<…>` cuyo primer argumento es el especificador de un módulo. */
const DE_VI = new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock']);

/** `import.meta.dirname`, o `__dirname`: lo que da la carpeta del fichero. */
function esLaCarpeta(n: ts.Node): boolean {
  if (ts.isIdentifier(n)) return n.text === '__dirname';
  return (
    ts.isPropertyAccessExpression(n) &&
    n.name.text === 'dirname' &&
    ts.isMetaProperty(n.expression) &&
    n.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

/** `import.meta.url`. */
function esLaUrl(n: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(n) &&
    n.name.text === 'url' &&
    ts.isMetaProperty(n.expression) &&
    n.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

const esCadena = (
  n: ts.Node | undefined,
): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  n !== undefined && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));

/** `resolve`/`join` sueltos o de `path`/`posix`. */
function esResolverOUnir(n: ts.Expression): boolean {
  const nombre = ts.isIdentifier(n)
    ? n.text
    : ts.isPropertyAccessExpression(n)
      ? n.name.text
      : null;
  return nombre === 'resolve' || nombre === 'join';
}

/** Una ruta relativa a escribir en una cadena: con `./` si no empieza por `../`, y nunca vacía. */
function relativaParaCadena(
  desde: string,
  hasta: string,
  conPunto: boolean,
  conBarra: boolean,
): string {
  let r = relative(desde, hasta).split('\\').join('/');
  if (r === '') r = '.';
  if (conPunto && !r.startsWith('.')) r = `./${r}`;
  if (conBarra && !r.endsWith('/')) r = `${r}/`;
  return r;
}

/**
 * El especificador nuevo de un módulo que estaba en `objetivo` y ahora está en
 * `nuevoObjetivo`, escrito desde `nuevoFichero` con el estilo del viejo: relativo o
 * con el alias `@core/`, y con la extensión que llevaba (`.js` por un `.ts`).
 */
export function especificadorNuevo(
  viejo: string,
  objetivo: string,
  nuevoObjetivo: string,
  nuevoFichero: string,
): string {
  const ext = extname(viejo);
  const conExtension = (sinExt: string): string => {
    if (ext === '') return sinExt;
    if (ext === '.js' && nuevoObjetivo.endsWith('.ts')) return `${sinExt}.js`;
    return `${sinExt}${extname(nuevoObjetivo)}`;
  };
  const sinExt = nuevoObjetivo.replace(/\.(ts|js|json)$/, '');
  const core = join(RAIZ, 'src/core');
  if (viejo.startsWith('@core/') && nuevoObjetivo.startsWith(`${core}/`)) {
    return conExtension(`@core/${relative(core, sinExt).split('\\').join('/')}`);
  }
  // Un JSON lleva su extensión siempre; un `.ts`, la de cómo se escribió.
  const destino = extname(objetivo) === '.json' ? nuevoObjetivo : sinExt;
  const r = relativaParaCadena(dirname(nuevoFichero), destino, true, false);
  return extname(objetivo) === '.json' ? r : conExtension(r);
}

/**
 * Las ediciones de las cadenas de ruta de todo el proyecto para la mudanza `mapa`
 * (absoluta vieja → absoluta nueva), sobre el texto de **antes** de mover nada: se
 * aplican antes que las del servicio, que no las tocan. Devuelve lo que reescribe,
 * para decirlo.
 */
export function reescribirCadenas(
  p: Proyecto,
  mapa: ReadonlyMap<string, string>,
): CadenaReescrita[] {
  const hechas: CadenaReescrita[] = [];
  for (const f of p.delProyecto()) {
    const texto = p.texto(f);
    if (!/vi\.|import\.meta|__dirname/.test(texto)) continue;
    const nuevoF = mapa.get(f) ?? f;
    const sf = ts.createSourceFile(f, texto, ts.ScriptTarget.Latest, true);
    const cambios: ts.TextChange[] = [];
    const cambiar = (desde: number, hasta: number, antes: string, despues: string): void => {
      if (antes === despues) return;
      cambios.push({ span: { start: desde, length: hasta - desde }, newText: `'${despues}'` });
      hechas.push({
        fichero: delRepo(nuevoF),
        linea: sf.getLineAndCharacterOfPosition(desde).line + 1,
        antes,
        despues,
      });
    };
    const visitar = (n: ts.Node): void => {
      // vi.mock('…') y familia: un especificador, como el de una importación.
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === 'vi' &&
        DE_VI.has(n.expression.name.text) &&
        esCadena(n.arguments[0])
      ) {
        const lit = n.arguments[0];
        const objetivo = p.resolver(lit.text, f);
        if (objetivo !== null) {
          const nuevoObjetivo = mapa.get(objetivo) ?? objetivo;
          if (nuevoObjetivo !== objetivo || nuevoF !== f) {
            cambiar(
              lit.getStart(sf),
              lit.end,
              lit.text,
              especificadorNuevo(lit.text, objetivo, nuevoObjetivo, nuevoF),
            );
          }
        }
      }
      // new URL('…', import.meta.url)
      if (
        ts.isNewExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'URL' &&
        n.arguments !== undefined &&
        esCadena(n.arguments[0]) &&
        n.arguments[1] !== undefined &&
        esLaUrl(n.arguments[1])
      ) {
        const lit = n.arguments[0];
        if (!lit.text.startsWith('/') && !/^[a-z]+:/i.test(lit.text)) {
          const objetivo = resolve(dirname(f), lit.text);
          const nuevoObjetivo = mapa.get(objetivo) ?? objetivo;
          if (nuevoObjetivo !== objetivo || nuevoF !== f) {
            const despues = relativaParaCadena(
              dirname(nuevoF),
              nuevoObjetivo,
              lit.text.startsWith('./'),
              lit.text.endsWith('/'),
            );
            cambiar(lit.getStart(sf), lit.end, lit.text, despues);
          }
        }
      }
      // resolve(import.meta.dirname, '…', '…') y join(…)
      if (
        ts.isCallExpression(n) &&
        esResolverOUnir(n.expression) &&
        n.arguments[0] !== undefined &&
        esLaCarpeta(n.arguments[0])
      ) {
        const lits: (ts.StringLiteral | ts.NoSubstitutionTemplateLiteral)[] = [];
        for (const a of n.arguments.slice(1)) {
          if (!esCadena(a)) break;
          lits.push(a);
        }
        const primera = lits[0];
        const ultima = lits.at(-1);
        if (primera !== undefined && ultima !== undefined) {
          const textos = lits.map((l) => l.text);
          const objetivo = resolve(dirname(f), ...textos);
          const nuevoObjetivo = mapa.get(objetivo) ?? objetivo;
          if (nuevoObjetivo !== objetivo || nuevoF !== f) {
            const despues = relativaParaCadena(
              dirname(nuevoF),
              nuevoObjetivo,
              textos[0]?.startsWith('./') === true,
              ultima.text.endsWith('/'),
            );
            cambiar(primera.getStart(sf), ultima.end, textos.join("', '"), despues);
          }
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
    if (cambios.length > 0) {
      p.aplicar([{ fileName: f, textChanges: cambios }]);
    }
  }
  return hechas;
}

/** Una mención de una ruta que la mudanza no reescribe. */
export interface Mencion {
  readonly fichero: string;
  readonly linea: number;
  readonly texto: string;
}

/**
 * Cómo se busca la ruta vieja de un fichero: por su carpeta y su nombre sin
 * extensión (`map/recinto`), seguido de nada, de `.ts` o de `.js`. Caza
 * `src/core/map/recinto.ts`, `core/map/recinto.js` y `'…/map/recinto'`, y no
 * `map/recinto-de-la-ciudad.ts` ni `escenario/recinto.ts`.
 */
function buscadorDe(viejo: string): { readonly fijo: string; readonly re: RegExp } {
  const r = delRepo(viejo).replace(/\.ts$/, '');
  const partes = r.split('/');
  const fijo = partes.slice(-2).join('/');
  const escapar = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { fijo, re: new RegExp(`(?<![\\w.-])${escapar(fijo)}(?![\\w-]|\\.(?!ts\\b|js\\b))`) };
}

/**
 * Las menciones de la ruta vieja de cada fichero movido que quedan tras la mudanza:
 * en los ficheros del proyecto, en su texto ya mudado (aún en memoria); en el resto
 * del repo, en el disco (`git grep`, también lo que no se ha añadido).
 */
export function menciones(p: Proyecto, viejos: readonly string[]): Mencion[] {
  const out: Mencion[] = [];
  const delProyecto = new Set(p.delProyecto());
  // Lo que se movió ya no está en su sitio viejo, pero el disco aún no lo sabe.
  const quitados = new Set(p.loCambiado().quitados);
  for (const viejo of viejos) {
    const { fijo, re } = buscadorDe(viejo);
    for (const f of delProyecto) {
      const texto = p.texto(f);
      if (!texto.includes(fijo)) continue;
      for (const [i, l] of texto.split('\n').entries()) {
        if (re.test(l)) out.push({ fichero: delRepo(f), linea: i + 1, texto: l.trim() });
      }
    }
    let salida = '';
    try {
      salida = execFileSync('git', ['grep', '-n', '-I', '--untracked', '-F', '-e', fijo], {
        cwd: RAIZ,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
    } catch (err) {
      // `git grep` sale 1 cuando no encuentra nada: eso no es un fallo.
      if ((err as { status?: number }).status !== 1) throw err;
    }
    for (const l of salida.split('\n')) {
      const m = /^([^:]+):(\d+):(.*)$/.exec(l);
      if (m === null) continue;
      const [, fichero = '', linea = '0', texto = ''] = m;
      const a = resolve(RAIZ, fichero);
      if (delProyecto.has(a) || quitados.has(a)) continue;
      if (re.test(texto)) out.push({ fichero, linea: Number(linea), texto: texto.trim() });
    }
    out.push(...comoLoCargaVite(p, viejo, delProyecto));
  }
  return out;
}

/**
 * Lo que vite carga por una ruta suya, que no lleva la carpeta del repo: desde la
 * raíz del cliente (`'/temas.ts'`, en el código) o desde la página
 * (`<script src="./entrada.ts">` en un `index.html`). Solo para los ficheros de
 * `src/client/`, que es la raíz de vite.
 */
function comoLoCargaVite(p: Proyecto, viejo: string, delProyecto: ReadonlySet<string>): Mencion[] {
  const cliente = join(RAIZ, 'src/client');
  if (!viejo.startsWith(`${cliente}/`)) return [];
  const desdeLaRaiz = `/${relative(cliente, viejo).split('\\').join('/')}`;
  const entreComillas = (l: string, r: string) =>
    l.includes(`'${r}'`) || l.includes(`"${r}"`) || l.includes(`\`${r}`);
  const out: Mencion[] = [];
  for (const f of delProyecto) {
    const texto = p.texto(f);
    if (!texto.includes(desdeLaRaiz)) continue;
    for (const [i, l] of texto.split('\n').entries()) {
      if (entreComillas(l, desdeLaRaiz))
        out.push({ fichero: delRepo(f), linea: i + 1, texto: l.trim() });
    }
  }
  const paginas = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src/client'],
    { cwd: RAIZ, encoding: 'utf8' },
  )
    .split('\n')
    .filter((x) => x.endsWith('.html'));
  for (const pagina of paginas) {
    const a = join(RAIZ, pagina);
    let desdeLaPagina = relative(dirname(a), viejo).split('\\').join('/');
    if (!desdeLaPagina.startsWith('.')) desdeLaPagina = `./${desdeLaPagina}`;
    for (const [i, l] of readFileSync(a, 'utf8').split('\n').entries()) {
      if (entreComillas(l, desdeLaPagina) || entreComillas(l, desdeLaRaiz)) {
        out.push({ fichero: pagina, linea: i + 1, texto: l.trim() });
      }
    }
  }
  return out;
}

/**
 * Dónde está una mención, para decirla: lo que se ejecuta o vigila (código y
 * configuración), la documentación viva y la historia, que se queda con sus rutas
 * (para eso está `rutas.tsv`).
 */
export function clase(fichero: string): 'codigo' | 'documentacion' | 'historia' | 'arte' {
  if (fichero.startsWith('docs/agents/') || fichero === 'docs/historia.md') return 'historia';
  // Los JSON del arte dicen qué orden los derivó (`"derivadoPor"`, `"renderer"`).
  if (fichero.startsWith('assets/')) return 'arte';
  // Los de `data/` lo dicen en su `_comment`: es documentación.
  if (fichero.endsWith('.md') || fichero.startsWith('data/')) return 'documentacion';
  return 'codigo';
}

/** Lo que dice la mudanza de las menciones que se quedan: las de la historia y el arte, solo cuántas. */
export function decirMenciones(lista: readonly Mencion[]): void {
  const por = new Map<ReturnType<typeof clase>, Mencion[]>();
  for (const m of lista) por.set(clase(m.fichero), [...(por.get(clase(m.fichero)) ?? []), m]);
  for (const [que, titulo] of [
    ['codigo', 'en código y configuración (guardias, html, package.json, spawns…)'],
    ['documentacion', 'en la documentación viva (CLAUDE.md, README, docs/, data/)'],
  ] as const) {
    const ms = por.get(que) ?? [];
    if (ms.length === 0) continue;
    console.log(`\nMenciones de la ruta vieja ${titulo}, sin tocar (${ms.length}):`);
    for (const m of ms) console.log(`  ${m.fichero}:${m.linea}: ${m.texto.slice(0, 160)}`);
  }
  const enElArte = por.get('arte') ?? [];
  if (enElArte.length > 0) {
    const ficheros = [...new Set(enElArte.map((m) => m.fichero))];
    console.log(
      `\n${enElArte.length} menciones en ${ficheros.length} ficheros de assets/ (las rutas de «derivadoPor»…), sin tocar: ${ficheros.slice(0, 5).join(', ')}${ficheros.length > 5 ? '…' : ''}`,
    );
  }
  const enLaHistoria = por.get('historia') ?? [];
  if (enLaHistoria.length > 0) {
    console.log(
      `\n${enLaHistoria.length} menciones en docs/agents/ y docs/historia.md: se quedan con la ruta vieja (rutas.tsv dice la nueva).`,
    );
  }
}
