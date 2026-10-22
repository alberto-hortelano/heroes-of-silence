/**
 * Matar un proceso lanzado en su propio grupo (`detached`) y solo ese: la máquina
 * es compartida, y nada se mata por nombre (`CLAUDE.md`). Lo comparten los arneses
 * de navegador (`vite-propio.ts`: su vite) y el motor de mundos
 * (`tools/mundo/motor.ts`: el `claude` que escribe la historia). Sin dependencias
 * más allá de Node, para que el servidor de desarrollo lo cargue sin Playwright.
 */
import type { ChildProcess } from 'node:child_process';

/** Lo que se espera a que el grupo salga tras `SIGTERM` antes de `SIGKILL` (el motor, medido: ~7 s). */
export const GRACIA_AL_MATAR_MS = 15_000;

/**
 * `SIGTERM` al grupo entero de `p` (el guion de `process.kill`) y, si a los
 * `gracia` ms no ha salido, `SIGKILL`: un proceso colgado no se queda en la
 * máquina. Un grupo que ya no está se dice por `log`, no se calla, pero no es un
 * fallo de quien mata.
 */
export function matarGrupo(
  p: ChildProcess | null,
  log: (msg: string) => void,
  gracia = GRACIA_AL_MATAR_MS,
): void {
  if (p?.pid === undefined || p.exitCode !== null) return;
  const pid = p.pid;
  const senal = (s: NodeJS.Signals): void => {
    try {
      process.kill(-pid, s);
    } catch (err) {
      log(`el grupo ${pid} ya había terminado (${s}): ${err instanceof Error ? err.message : err}`);
    }
  };
  senal('SIGTERM');
  setTimeout(() => {
    if (p.exitCode === null && p.signalCode === null) senal('SIGKILL');
  }, gracia).unref();
}
