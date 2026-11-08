/**
 * **La documentación dice lo que hay** (fase Doc de la reorganización, 08-11-2026).
 *
 * `CLAUDE.md` llegó a 306 KB: cada puerta nueva traía su párrafo entero a la tabla, y el
 * adelgazamiento del 04-10 volvió a ese tamaño en un mes. Desde la fase Doc es el índice (una
 * línea por puerta y por regla) y el detalle vive en `docs/areas/`. Esto vigila que siga así y
 * que lo que cita exista:
 *
 * - `CLAUDE.md` no pasa de `TOPE_DE_CLAUDE` y ninguna fila de «Puertas únicas» de
 *   `FILA_MAXIMA` caracteres: lo que no cabe en una línea es detalle, y va al doc de su área.
 * - Toda ruta que citan entre comillas invertidas `CLAUDE.md`, `README.md`, `docs/areas/*`,
 *   `docs/calidad.md` y `docs/art/{taller,unidades}.md` existe. Una mudanza que se olvida de una
 *   deja a quien lee buscando un fichero que no está (la fase Doc encontró 131: entre ellas
 *   `tomarElNodo`, citado en `state/game.ts` cuando ya vivía en `state/marcha.ts`).
 *   No se miran `docs/historia.md`, `docs/banco.md` ni `docs/agents/`, que guardan las rutas de
 *   su día a propósito, ni las citas a `docs/agents/<tarea>/`: de esas carpetas no se commitean
 *   ni el plan ni la implementación de cada tarea.
 * - Todo símbolo que cita `CLAUDE.md` existe como palabra en `src/`, `tools/` o `test/`.
 * - La tabla «Áreas» nombra justo los docs de `docs/areas/`, y cada uno empieza diciendo qué
 *   carpetas se leen con él.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { comentariosDe, leer, rutasDelRepo } from './codigo-del-repo.js';
import { RAIZ } from './comun.js';

/** Bytes: el plan fijó ≈40 KB y un tope de 50. */
const TOPE_DE_CLAUDE = 50_000;
/** Caracteres de una fila de «Puertas únicas», con sus barras. */
const FILA_MAXIMA = 200;

const AREAS = 'docs/areas';
const DOCS_CON_RUTAS = [
  'CLAUDE.md',
  'README.md',
  ...readdirSync(join(RAIZ, AREAS))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `${AREAS}/${f}`),
  'docs/calidad.md',
  'docs/art/taller.md',
  'docs/art/unidades.md',
];

/**
 * Lo que parece una ruta y no lo es, o lo es de algo que no está en el repo a propósito.
 * Cada entrada, con su porqué: una lista que crece sin él deja de vigilar.
 */
const NO_SON_RUTAS_DEL_REPO: Readonly<Record<string, string>> = {
  'HHH/HlH/lll': 'un rincón del relieve dibujado en tres filas (escenario.md)',
  'claude/army-game-theme-ui-28d2ad': 'una rama de git (interfaz.md)',
  'pendiente/': 'una carpeta de la cola del taller, `tools/taller/cola/`, fuera de git',
  'fallido/': 'una carpeta de la cola del taller, `tools/taller/cola/`, fuera de git',
  'salto.json': 'lo que escribe la revisión de animaciones junto a cada clip, fuera de git',
  // Lo que se fue, citado como lo que se fue.
  'data/creatures.json': 'retirado con caballeros y nigromantes (19-10-2026)',
  'data/poderes.json': 'retirado con el editor de magia (06-11-2026)',
  'render/tropa/': 'el semicírculo de la tropa, retirado el 02-11-2026',
  'tools/qa/ramales.ts': 'retirado con las minas (21-10-2026)',
  'tools/gen/': 'fal.ai, retirado en la reorganización (06-11-2026)',
};

/** Palabras de `CLAUDE.md` con forma de símbolo que no lo son del código: órdenes del sistema. */
const NO_SON_SIMBOLOS = new Set(['pkill', 'killall', 'setsid', 'run_in_background']);

const EXTENSION = /\.(?:ts|tsx|js|mjs|json|jsonl|md|css|html|webp|png|svg|tsv|yml|yaml|py|txt|sh)$/;

/** Lo citado entre comillas invertidas en `texto`, con su línea. */
function citas(texto: string): { cita: string; linea: number }[] {
  const out: { cita: string; linea: number }[] = [];
  texto.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/`([^`]+)`/g)) out.push({ cita: m[1] as string, linea: i + 1 });
  });
  return out;
}

/**
 * Si una cita es una ruta del repo: con una barra o una extensión de fichero, y sin huecos de
 * plantilla (`<id>`, `{a,b}`, `*`, `${f}`, `dN`), espacios, URLs ni rutas de fuera
 * (`.cache/`, `~/`, `/tmp`).
 */
function esRuta(c: string): boolean {
  if (/[\s<>{}*$=?:|()…,;]/.test(c)) return false;
  if (/^(?:\.cache|~|\/|-|\.[a-z]+$)/.test(c)) return false;
  if (/(?:^|\/)dN(?:\/|$)/.test(c)) return false;
  if (c.startsWith('docs/agents/')) return false;
  return c.includes('/') || EXTENSION.test(c);
}

let indice: { ficheros: Set<string>; carpetas: Set<string>; nombres: Set<string> } | null = null;
function delRepo() {
  if (indice) return indice;
  const ficheros = new Set(rutasDelRepo());
  const carpetas = new Set<string>();
  for (const f of ficheros) for (let d = dirname(f); d !== '.'; d = dirname(d)) carpetas.add(d);
  indice = { ficheros, carpetas, nombres: new Set([...ficheros].map((f) => basename(f))) };
  return indice;
}

/**
 * Si existe: tal cual desde la raíz o como el final de una ruta del repo (`state/sitios.ts`,
 * relativa a `src/core/`), una carpeta, un fichero sin su extensión
 * (`assets/mapa/puesto-caseta`), o, sin barra, el nombre de un fichero.
 */
function existeEnElRepo(cita: string): boolean {
  const { ficheros, carpetas, nombres } = delRepo();
  const c = cita.replace(/^\.\//, '').replace(/\/$/, '');
  const casa = (r: string) => r === c || r.endsWith(`/${c}`);
  if (!c.includes('/')) return nombres.has(c) || [...carpetas].some(casa);
  for (const f of ficheros) if (casa(f) || f.startsWith(`${c}.`)) return true;
  for (const d of carpetas) if (casa(d)) return true;
  return false;
}

/** Las citas de `cs` que git ignora (los borradores de la arena, las marcas): existen fuera de él. */
function ignoradas(cs: string[]): Set<string> {
  if (cs.length === 0) return new Set();
  let salida = '';
  try {
    salida = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: RAIZ,
      input: cs.join('\n'),
    }).toString('utf8');
  } catch (e) {
    // `check-ignore` sale 1 si ninguna está ignorada: no es un fallo.
    salida = (e as { stdout?: Buffer }).stdout?.toString('utf8') ?? '';
  }
  return new Set(salida.split('\n').filter((l) => l !== ''));
}

/** Las rutas citadas en `doc` que no existen, «doc:línea ruta». */
function rutasQueNoExisten(doc: string, texto: string = leer(doc)): string[] {
  const sospechosas = citas(texto).filter(
    ({ cita }) => esRuta(cita) && !(cita in NO_SON_RUTAS_DEL_REPO) && !existeEnElRepo(cita),
  );
  const fuera = ignoradas(sospechosas.map((s) => s.cita));
  return sospechosas.filter((s) => !fuera.has(s.cita)).map((s) => `${doc}:${s.linea} ${s.cita}`);
}

let palabras: Set<string> | null = null;
/** Cada palabra del código de `src/`, `tools/` y `test/`: un símbolo citado es una de ellas. */
function palabrasDelCodigo(): Set<string> {
  if (palabras) return palabras;
  palabras = new Set();
  for (const f of delRepo().ficheros) {
    if (!/^(?:src|tools|test)\/.*\.(?:ts|js|mjs)$/.test(f) && f !== 'vite.config.ts') continue;
    for (const p of readFileSync(join(RAIZ, f), 'utf8').match(/[\p{L}_$][\p{L}\p{N}_$]*/gu) ?? [])
      palabras.add(p);
  }
  return palabras;
}

/**
 * Los símbolos citados en `texto` que no están en el código, «línea símbolo». Una cita es un
 * símbolo si tiene su forma (`tomarElNodo`, `Session.formacion`, `createRng(seed)`): cada parte
 * de lo de antes del paréntesis tiene que ser una palabra del código.
 */
function simbolosQueNoExisten(texto: string): string[] {
  const forma = /^([\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*)(?:\(.*\))?$/u;
  const codigo = palabrasDelCodigo();
  const out: string[] = [];
  for (const { cita, linea } of citas(texto)) {
    const m = forma.exec(cita);
    if (!m || NO_SON_SIMBOLOS.has(cita)) continue;
    const partes = (m[1] as string).split('.');
    if (partes.some((p) => !codigo.has(p))) out.push(`${linea} ${cita}`);
  }
  return out;
}

/**
 * Las rutas que se miran en un comentario del código: las que empiezan por `src/`, `tools/` o
 * `test/`, y el nombre de un test (`x.test.ts`). Las relativas (`state/game.ts`, desde
 * `src/core/` o `src/client/`, o desde la carpeta del fichero) no: en un comentario se citan
 * con media ruta, y la mitad que falta casa con cualquier fichero que acabe igual, o con
 * ninguno porque es la de otra rama, un fichero de salida o un trozo de fórmula (`k/8`). Con
 * las relativas, este guardia nacía con 350 sospechosas de las que eran de verdad una treintena.
 */
const RUTA_DE_COMENTARIO = /^(?:(?:src|tools|test)\/|[\w-]+\.test\.ts$)/;

/** Lo que en un comentario parece una ruta mirada y no lo es. Cada entrada, con su porqué. */
const NO_SON_RUTAS_EN_COMENTARIOS: Readonly<Record<string, string>> = {
  'tools/list': 'el método del protocolo MCP que lista las herramientas (puente-mcp.test.ts)',
};

/**
 * Los ficheros que se fueron y se citan como lo que fueron (`Vivía en …`, `Era parte de …`,
 * `Rescatado de …`): la mudanza dicha en la cabecera de lo que la recibió. Valen solo en una
 * línea que lo dice, `COMO_LO_QUE_FUE`, ella o la de antes: «lo vigila `invariantes.test.ts`»
 * no vale (es lo que encontró el QA de la reorganización, H2, en 74 líneas).
 */
const LO_QUE_FUE: Readonly<Record<string, string>> = {
  'invariantes.test.ts': 'partido en los cinco `invariantes-*.test.ts` en la fase T (06-11-2026)',
  'test/helpers.ts': 'repartido por los ayudantes de `test/` en la fase T (06-11-2026)',
  'tools/qa/capturas.ts': 'partido en `tools/qa/capturas/` (H5, 08-11-2026)',
  'tools/art/poses.ts': 'partido en `tools/art/poses/` (H4, 08-11-2026)',
  'test/ia-fuerza.test.ts': 'retirado el 03-11-2026',
  'src/client/session.ts': 'la sesión, hoy `src/client/sesion/` (fase C, 07-11-2026)',
  'src/shared/rpg-art.ts': 'de la rama `archivo/gpt-rpg`, de donde se rescató',
  'tools/art/ybot-ranged-poses.mjs': 'de la rama `archivo/gpt-rpg`, de donde se rescató',
};
const COMO_LO_QUE_FUE =
  /(?<!\p{L})(?:[Vv]iv[íi]an?|[Vv]en[íi]an?|[Ee]ran?|[Aa]ntes|cuando|[Rr]escatad[oa]|retir[óa]|se fue|lleg[óo]|desde la fase)(?!\p{L})|\(De `|de `test\/helpers/u;

/** Los ficheros de código cuyos comentarios se miran: los `.ts` de `src/`, `tools/` y `test/` y las hojas del cliente. */
function codigoComentado(): string[] {
  return [...delRepo().ficheros].filter((f) => /^(?:src|tools|test)\/.*\.(?:ts|css)$/.test(f));
}

/**
 * Las rutas citadas en un texto que no existen, «línea ruta»: entre comillas invertidas, con la
 * forma de `RUTA_DE_COMENTARIO`. `lineas[i]` es la línea `i + 1`.
 */
function rutasQueNoExistenEn(lineas: readonly string[]): string[] {
  const sospechosas: { cita: string; linea: number }[] = [];
  lineas.forEach((l, i) => {
    for (const m of l.matchAll(/`([^`\0]+)`/g)) {
      const cita = m[1] as string;
      if (!RUTA_DE_COMENTARIO.test(cita) || !esRuta(cita) || existeEnElRepo(cita)) continue;
      if (cita in NO_SON_RUTAS_EN_COMENTARIOS) continue;
      if (cita in LO_QUE_FUE && COMO_LO_QUE_FUE.test(`${lineas[i - 1] ?? ''} ${l}`)) continue;
      sospechosas.push({ cita, linea: i + 1 });
    }
  });
  const fuera = ignoradas(sospechosas.map((s) => s.cita));
  return sospechosas.filter((s) => !fuera.has(s.cita)).map((s) => `${s.linea} ${s.cita}`);
}

/** Los `_comment` de un JSON, a cualquier altura, como texto. */
function comentariosDelJson(o: unknown): string[] {
  if (Array.isArray(o)) return o.flatMap(comentariosDelJson);
  if (o === null || typeof o !== 'object') return [];
  return Object.entries(o).flatMap(([k, v]) =>
    k === '_comment' ? [Array.isArray(v) ? v.join(' ') : String(v)] : comentariosDelJson(v),
  );
}

/** Las filas de las tablas de «Puertas únicas» (sin cabeceras ni separadores). */
function filasDePuertas(texto: string): string[] {
  const desde = texto.indexOf('\n## Puertas únicas');
  if (desde < 0) throw new Error('`CLAUDE.md` ya no tiene la sección «Puertas únicas»');
  const hasta = texto.indexOf('\n## ', desde + 1);
  return texto
    .slice(desde, hasta < 0 ? undefined : hasta)
    .split('\n')
    .filter((l) => l.startsWith('|') && !l.startsWith('| Qué |') && !l.startsWith('|---'));
}

describe('la documentación dice lo que hay', () => {
  const claude = leer('CLAUDE.md');

  it(`CLAUDE.md no pasa de ${TOPE_DE_CLAUDE} bytes: es el índice, el detalle va a docs/areas/`, () => {
    expect(Buffer.byteLength(claude, 'utf8')).toBeLessThanOrEqual(TOPE_DE_CLAUDE);
  });

  it(`ninguna fila de «Puertas únicas» pasa de ${FILA_MAXIMA} caracteres`, () => {
    const filas = filasDePuertas(claude);
    expect(filas.length).toBeGreaterThan(50);
    expect(filas.filter((f) => [...f].length > FILA_MAXIMA)).toEqual([]);
  });

  it('toda ruta citada en CLAUDE.md, README.md, docs/areas/, docs/calidad.md y docs/art/ existe', () => {
    expect(DOCS_CON_RUTAS.flatMap((d) => rutasQueNoExisten(d))).toEqual([]);
    // Y la lista blanca no guarda nada que ya exista o que ningún doc cite.
    const citado = new Set(DOCS_CON_RUTAS.flatMap((d) => citas(leer(d)).map((c) => c.cita)));
    for (const c of Object.keys(NO_SON_RUTAS_DEL_REPO)) {
      expect(citado.has(c), `«${c}» ya no lo cita ningún doc: fuera de la lista`).toBe(true);
      expect(existeEnElRepo(c), `«${c}» ya existe: fuera de la lista`).toBe(false);
    }
  });

  it('toda ruta `src/…`, `tools/…`, `test/…` o `x.test.ts` citada en un comentario del código o en un `_comment` de data/ existe', () => {
    const delCodigo = codigoComentado().flatMap((r) =>
      rutasQueNoExistenEn(comentariosDe(r)).map((m) => `${r}:${m}`),
    );
    const deLosDatos = [...delRepo().ficheros]
      .filter((f) => /^data\/.*\.json$/.test(f))
      .flatMap((f) =>
        rutasQueNoExistenEn(comentariosDelJson(JSON.parse(leer(f)))).map((m) => `${f} ${m}`),
      );
    expect([...delCodigo, ...deLosDatos]).toEqual([]);
    // Y las dos listas no guardan nada que ya exista.
    for (const c of [...Object.keys(NO_SON_RUTAS_EN_COMENTARIOS), ...Object.keys(LO_QUE_FUE)]) {
      expect(existeEnElRepo(c), `«${c}» ya existe: fuera de la lista`).toBe(false);
    }
  });

  it('todo símbolo que cita CLAUDE.md está en src/, tools/ o test/', () => {
    expect(simbolosQueNoExisten(claude)).toEqual([]);
  });

  it('la tabla «Áreas» de CLAUDE.md nombra justo los docs de docs/areas/, y cada uno dice qué se lee con él', () => {
    const desde = claude.indexOf('\n## Áreas: qué leer antes de tocar');
    expect(desde).toBeGreaterThan(0);
    const tabla = claude.slice(desde, claude.indexOf('\n## ', desde + 1));
    const nombrados = new Set(
      [...tabla.matchAll(/`docs\/areas\/([\w-]+\.md)`/g)].map((m) => m[1] as string),
    );
    const enDisco = readdirSync(join(RAIZ, AREAS)).filter((f) => f.endsWith('.md'));
    expect([...nombrados].sort()).toEqual([...enDisco].sort());
    for (const f of enDisco) {
      const [titulo, , primera] = leer(`${AREAS}/${f}`).split('\n');
      expect(titulo, f).toMatch(/^# /);
      expect(primera, f).toMatch(/^Se lee antes de tocar: `/);
    }
  });
});
