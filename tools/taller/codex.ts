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
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const CODEX = process.env.CODEX_BIN ?? '/usr/lib/chatgpt/resources/codex';
const IMAGENES = join(homedir(), '.codex/generated_images');
/** Una imagen tarda ~1,5 min; un atlas puede tardar bastante más. */
const LIMITE_MS = Number(process.env.TALLER_LIMITE_MS ?? 20 * 60_000);

export interface Generacion {
  readonly hilo: string;
  /** Ruta absoluta del PNG crudo (en `~/.codex`, fuera del repo). */
  readonly crudo: string;
  /** Lo último que dijo el agente: sirve de motivo cuando no hay imagen. */
  readonly mensaje: string;
}

/** Los eventos JSONL de Codex que importan aquí. */
export function leerEventos(salida: string): { hilo: string | null; mensaje: string } {
  let hilo: string | null = null;
  let mensaje = '';
  for (const linea of salida.split('\n')) {
    if (!linea.startsWith('{')) continue;
    let ev: { type?: string; thread_id?: string; item?: { type?: string; text?: string } };
    try {
      ev = JSON.parse(linea);
    } catch {
      continue;
    }
    if (ev.type === 'thread.started' && typeof ev.thread_id === 'string') hilo = ev.thread_id;
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
      mensaje = ev.item.text.trim();
    }
  }
  return { hilo, mensaje };
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
    const salida = await new Promise<string>((resolve, reject) => {
      // `detached`: su propio grupo, para poder matarlo a él y solo a él.
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
        if (codigo === 0) resolve(out);
        else
          reject(
            new Error(`Codex salió con ${codigo}: ${err.trim().split('\n').slice(-3).join(' | ')}`),
          );
      });
      hijo.stdin.end(prompt);
    });

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
