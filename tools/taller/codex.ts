/**
 * Pedirle una imagen a ChatGPT por la suscripción, con Codex CLI. Nunca fal.ai
 * ni una API de pago: esto no tiene clave que filtrar ni gasto que apuntar.
 *
 * Tres cosas que no son obvias y costaron una prueba cada una:
 *  - `-i` es variádico: `-i a.png -i b.png "prompt"` se come el prompt como
 *    imagen. El prompt va por **stdin**, que además evita el `</dev/null`.
 *  - El PNG no sale en el `--json`: aparece en
 *    `~/.codex/generated_images/<thread_id>/`, y el `thread_id` llega en el
 *    primer evento, `thread.started`.
 *  - Corregir es `exec resume <thread_id>`: el mismo hilo conserva la
 *    identidad del personaje, que una petición nueva no garantiza.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { z } from 'zod';

export const CODEX = process.env.CODEX_BIN ?? '/usr/lib/chatgpt/resources/codex';
/** Donde Codex deja las imágenes que genera, una carpeta por hilo. */
export const IMAGENES = join(homedir(), '.codex/generated_images');
/** Una imagen tarda ~1,5 min; un atlas puede tardar bastante más. */
const LIMITE_MS = Number(process.env.TALLER_LIMITE_MS ?? 20 * 60_000);

/**
 * Un fallo que Codex explica en su propio JSON. Si es el límite de uso de la
 * suscripción, `sinCuota` es verdad: el trabajador para la cola en vez de ir
 * marcando como fallidos todos los encargos que le quedan.
 */
export class FalloDeCodex extends Error {
  readonly sinCuota: boolean;
  constructor(mensaje: string) {
    super(`Codex: ${mensaje}`);
    this.sinCuota = /usage limit|rate limit|límite de uso/i.test(mensaje);
  }
}

export interface Generacion {
  readonly hilo: string;
  /** Ruta absoluta del PNG crudo (en `~/.codex`, fuera del repo). */
  readonly crudo: string;
  /** Lo último que dijo el agente: sirve de motivo cuando no hay imagen. */
  readonly mensaje: string;
  /** Lo que costó, en dólares, si se pagó aparte (fal.ai); por la suscripción, nada. */
  readonly coste?: number;
}

/** Los eventos JSONL de Codex que importan aquí. */
export function leerEventos(salida: string): {
  hilo: string | null;
  mensaje: string;
  error: string | null;
} {
  let hilo: string | null = null;
  let mensaje = '';
  let error: string | null = null;
  for (const linea of salida.split('\n')) {
    if (!linea.startsWith('{')) continue;
    let ev: {
      type?: string;
      thread_id?: string;
      message?: string;
      item?: { type?: string; text?: string };
    };
    try {
      ev = JSON.parse(linea);
    } catch {
      continue;
    }
    if (ev.type === 'thread.started' && typeof ev.thread_id === 'string') hilo = ev.thread_id;
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
      mensaje = ev.item.text.trim();
    }
    // El motivo de un fallo viaja en el JSON, no en stderr: allí solo queda
    // «Reading prompt from stdin...», que es lo que se enseñaba antes.
    if (ev.type === 'error' && typeof ev.message === 'string') error = ev.message;
  }
  return { hilo, mensaje, error };
}

/**
 * Lanza Codex con `args` en `cwd`, el prompt por stdin, y devuelve su salida JSONL.
 * En su propio grupo (`detached`), para poder matarlo a él y solo a él si pasa de
 * `LIMITE_MS`. Un fallo que Codex explica en su JSON lanza `FalloDeCodex` (que dice
 * si es la cuota); otro código de salida, con las últimas líneas de stderr.
 */
function correrCodex(args: readonly string[], prompt: string, cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hijo = spawn(CODEX, args, { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const reloj = setTimeout(() => {
      if (hijo.pid !== undefined) process.kill(-hijo.pid, 'SIGTERM');
      reject(new Error(`Codex no terminó en ${LIMITE_MS / 60_000} min`));
    }, LIMITE_MS);
    hijo.stdout.on('data', (d) => {
      out += d;
    });
    hijo.stderr.on('data', (d) => {
      err += d;
    });
    hijo.on('error', (e) => {
      clearTimeout(reloj);
      reject(new Error(`no se pudo lanzar Codex (${CODEX}): ${e.message}`));
    });
    hijo.on('close', (codigo) => {
      clearTimeout(reloj);
      const { error } = leerEventos(out);
      if (error !== null) reject(new FalloDeCodex(error));
      else if (codigo === 0) resolve(out);
      else
        reject(
          new Error(`Codex salió con ${codigo}: ${err.trim().split('\n').slice(-3).join(' | ')}`),
        );
    });
    hijo.stdin.end(prompt);
  });
}

export async function generar(
  prompt: string,
  imagenes: readonly string[],
  reanudar?: string,
): Promise<Generacion> {
  // Un directorio vacío como cwd: Codex mira a su alrededor antes de dibujar, y
  // en el repo no tiene nada que leer.
  const cwd = await mkdtemp(join(tmpdir(), 'taller-codex-'));
  const inicio = Date.now();
  try {
    // Las imágenes, al final: `-i` es variádico y se comería lo que viniera detrás.
    const comunes = ['--skip-git-repo-check', '--json', ...imagenes.flatMap((i) => ['-i', i])];
    const args = reanudar
      ? ['exec', 'resume', reanudar, '-', ...comunes]
      : ['exec', '-s', 'read-only', ...comunes];
    const salida = await correrCodex(args, prompt, cwd);

    const { hilo, mensaje } = leerEventos(salida);
    const id = hilo ?? reanudar;
    if (id === undefined || id === null)
      throw new Error('Codex no anunció el hilo (thread.started)');
    const dir = join(IMAGENES, id);
    let nuevas: { ruta: string; t: number }[] = [];
    try {
      const ficheros = (await readdir(dir)).filter((f) => f.endsWith('.png'));
      const fechas = await Promise.all(
        ficheros.map(async (f) => ({ ruta: join(dir, f), t: (await stat(join(dir, f))).mtimeMs })),
      );
      nuevas = fechas.filter((f) => f.t >= inicio - 1000).sort((a, b) => b.t - a.t);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const crudo = nuevas[0];
    if (crudo === undefined) {
      throw new Error(`Codex terminó sin generar imagen. Dijo: «${mensaje.slice(0, 300)}»`);
    }
    return { hilo: id, crudo: crudo.ruta, mensaje };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/** Cuántos juicios de Codex van a la vez: más, y la suscripción empieza a cortar. */
export const JUICIOS_A_LA_VEZ = 3;
let juiciosEnCurso = 0;
const enEspera: (() => void)[] = [];

async function turnoDeJuicio(): Promise<() => void> {
  if (juiciosEnCurso >= JUICIOS_A_LA_VEZ) await new Promise<void>((r) => enEspera.push(r));
  juiciosEnCurso++;
  return () => {
    juiciosEnCurso--;
    enEspera.shift()?.();
  };
}

/**
 * Un juicio de ChatGPT por la suscripción: mira `imagenes`, lee `prompt` y
 * contesta SOLO el JSON de `esquema` (`--output-schema`, derivado del zod con
 * `esquemaParaCodex`), sin herramientas (`-s read-only`) y sin guardar el hilo
 * (`--ephemeral`). Lo que vuelve se valida con el mismo esquema y se escribe en
 * `salida`; si no lo cumple, lanza diciendo qué falta. Como mucho
 * `JUICIOS_A_LA_VEZ` a la vez en el proceso: el resto espera turno.
 */
export async function juzgarConCodex<T>(
  prompt: string,
  imagenes: readonly string[],
  esquema: z.ZodType<T>,
  salida: string,
): Promise<T> {
  // A demanda: el trabajador importa este módulo para pintar y no necesita los esquemas.
  const { esquemaParaCodex, validarCon } = await import('./revision/esquemas.js');
  const soltar = await turnoDeJuicio();
  const cwd = await mkdtemp(join(tmpdir(), 'taller-juicio-'));
  try {
    const rutaEsquema = join(cwd, 'esquema.json');
    const rutaRespuesta = join(cwd, 'respuesta.json');
    await writeFile(rutaEsquema, JSON.stringify(esquemaParaCodex(esquema)));
    const args = [
      'exec',
      '-s',
      'read-only',
      '--ephemeral',
      '--skip-git-repo-check',
      '--json',
      '-c',
      'model_reasoning_effort="high"',
      '--output-schema',
      rutaEsquema,
      '-o',
      rutaRespuesta,
      // Las imágenes, al final y el prompt por stdin (`-`): `-i` es variádico.
      ...imagenes.flatMap((i) => ['-i', i]),
      '-',
    ];
    const salidaDeCodex = await correrCodex(args, prompt, cwd);
    let texto: string;
    try {
      texto = await readFile(rutaRespuesta, 'utf8');
    } catch {
      throw new Error(
        `Codex terminó sin escribir su juicio. Dijo: «${leerEventos(salidaDeCodex).mensaje.slice(0, 300)}»`,
      );
    }
    const juicio = validarCon(esquema, texto, `el juicio de Codex para ${salida}`);
    await mkdir(dirname(salida), { recursive: true });
    await writeFile(salida, `${JSON.stringify(juicio, null, 1)}\n`);
    return juicio;
  } finally {
    soltar();
    await rm(cwd, { recursive: true, force: true });
  }
}
