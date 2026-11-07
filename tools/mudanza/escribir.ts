/**
 * Lo que la mudanza hace en el disco de verdad, cuando ya está todo comprobado en
 * memoria: los `git mv`, los ficheros con su texto nuevo, Biome sobre lo tocado y la
 * línea de cada movimiento en `rutas.tsv`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { delRepo, type Proyecto, RAIZ } from './proyecto.js';

/**
 * Dónde queda apuntado qué fichero o símbolo fue a dónde: lo leen quienes lean
 * `docs/historia.md`, `docs/agents` y las memorias, que conservan las rutas viejas.
 */
export const RUTAS_TSV = join(
  RAIZ,
  'docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv',
);

/** Una línea de `rutas.tsv`: `fichero` (con el símbolo vacío) o `simbolo`. */
export interface Ruta {
  readonly tipo: 'fichero' | 'simbolo';
  readonly viejo: string;
  readonly nuevo: string;
  readonly simbolo: string;
}

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();

function seguidoPorGit(ruta: string): boolean {
  return (
    spawnSync('git', ['ls-files', '--error-unmatch', ruta], { cwd: RAIZ, stdio: 'ignore' })
      .status === 0
  );
}

/**
 * Escribe la mudanza: primero los movimientos (`git mv` si git lo sigue; si no, un
 * `rename`), después el texto de cada fichero cambiado en memoria. Si un `git mv`
 * falla, deshace los anteriores y lanza sin haber escrito ningún texto. Devuelve los
 * ficheros escritos (para Biome).
 */
export function escribirMudanza(
  p: Proyecto,
  movimientos: readonly (readonly [string, string])[],
): string[] {
  const hechos: (readonly [string, string, boolean])[] = [];
  try {
    for (const [viejo, nuevo] of movimientos) {
      if (existsSync(nuevo)) throw new Error(`${delRepo(nuevo)} ya existe en el disco`);
      mkdirSync(dirname(nuevo), { recursive: true });
      const conGit = seguidoPorGit(viejo);
      if (conGit) git('mv', viejo, nuevo);
      else renameSync(viejo, nuevo);
      hechos.push([viejo, nuevo, conGit]);
    }
  } catch (err) {
    for (const [viejo, nuevo, conGit] of hechos.reverse()) {
      if (conGit) git('mv', nuevo, viejo);
      else renameSync(nuevo, viejo);
    }
    throw err;
  }
  const { escritos } = p.loCambiado();
  for (const [f, texto] of escritos) {
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, texto);
  }
  return [...escritos.keys()];
}

/**
 * `biome check --write` solo sobre los ficheros tocados: ordena sus importaciones y
 * les da el formato del repo. Lo que Biome no sabe arreglar se dice, no se deshace.
 */
export function biomeSobre(ficheros: readonly string[]): void {
  const ts = ficheros.filter((f) => f.endsWith('.ts')).map(delRepo);
  if (ts.length === 0) return;
  const r = spawnSync(join(RAIZ, 'node_modules/.bin/biome'), ['check', '--write', ...ts], {
    cwd: RAIZ,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(`biome check --write sale ${r.status} sobre lo tocado:\n${r.stdout}${r.stderr}`);
    process.exitCode = 1;
  }
}

/** Añade las rutas a `rutas.tsv`, con su cabecera si el fichero es nuevo. */
export function apuntarRutas(rutas: readonly Ruta[]): void {
  if (rutas.length === 0) return;
  if (!existsSync(RUTAS_TSV)) writeFileSync(RUTAS_TSV, 'tipo\tviejo\tnuevo\tsímbolo\n');
  appendFileSync(
    RUTAS_TSV,
    rutas.map((r) => `${r.tipo}\t${r.viejo}\t${r.nuevo}\t${r.simbolo}\n`).join(''),
  );
}

/** Los tests que leen (por su texto) alguno de `ficheros`: los que hay que correr tras la mudanza. */
export function testsQueLosLeen(ficheros: readonly string[]): string[] {
  const out = new Set<string>();
  for (const f of ficheros) {
    const base = delRepo(f).replace(/\.ts$/, '').split('/').slice(-2).join('/');
    let salida = '';
    try {
      salida = git('grep', '-l', '-F', '-e', base, '--', 'test');
    } catch (err) {
      if ((err as { status?: number }).status !== 1) throw err;
    }
    for (const t of salida.split('\n')) if (t.endsWith('.test.ts')) out.add(t);
  }
  return [...out].sort();
}
