/**
 * El servidor de la partida, arrancado por un arnés y parado por él.
 *
 * Lo comparten `verify-agent.ts` (`pnpm qa`) y `capturas.ts`. Cada uno lo
 * arrancaba a su manera —uno con `npx tsx`, el otro con `tsx`; uno esperaba solo
 * el canal del agente, el otro los dos— y las dos copias ya se habían separado.
 *
 * Tres cosas que no son adorno:
 *
 *  - **Puertos `0`**: los elige el sistema, así que convive con un `pnpm partida`
 *    abierto (#61). El puerto de verdad se lee de lo que el servidor anuncia
 *    desde `listening`, que es cuando ya escucha.
 *  - **`tsx` y no `npx tsx`**: el envoltorio mete un proceso de más que retiene
 *    las tuberías (ver `CLAUDE.md`, «`pnpm qa` bajó de 5,4 s a 3,1 s»).
 *  - **Su propio grupo de procesos** (`detached`), y se mata por el grupo: así
 *    cae entero y no se lleva nada que no haya arrancado este arnés.
 */
import { spawn } from 'node:child_process';

/** Cuánto se le da al servidor para anunciar sus dos canales antes de darlo por muerto. */
const PLAZO_DE_ARRANQUE_MS = 15_000;

const RE_AGENTE = /canal del agente en ws:\/\/localhost:(\d+)/;
const RE_ESPECTADORES = /canal de espectadores en ws:\/\/localhost:(\d+)/;

export interface ServidorDePartida {
  /** El puerto del canal del agente, el que le tocó de verdad. */
  readonly agente: number;
  /** El del canal de espectadores. */
  readonly espectador: number;
  /** Para un arnés que lo para antes de salir. Si ya había muerto, no hace nada. */
  parar(): void;
}

interface OpcionesDeArranque {
  /** Cada trozo que escribe el servidor, por si el arnés quiere enseñarlo. */
  readonly eco?: (trozo: string, deError: boolean) => void;
  /** El servidor ha muerto con un código distinto de cero DESPUÉS de arrancar. */
  readonly alMorir?: (codigo: number) => void;
}

/**
 * Arranca el servidor con `envExtra` encima del entorno y los dos puertos a `0`,
 * y espera a que anuncie sus dos canales. Lanza, con lo que dijo el servidor, si
 * no lo hace en el plazo o si muere antes.
 */
export async function arrancarServidor(
  envExtra: Readonly<Record<string, string>>,
  opciones: OpcionesDeArranque = {},
): Promise<ServidorDePartida> {
  const proceso = spawn('node_modules/.bin/tsx', ['src/server/ws-server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, ...envExtra, HEROES_AGENT_PORT: '0', HEROES_SPECTATOR_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let vivo = true;
  let arrancado = false;
  let salida = '';

  const parar = (): void => {
    // Señalar un pid ya recogido puede alcanzar a otro proceso que haya heredado
    // ese número: por eso se mira antes si sigue vivo.
    if (!vivo || proceso.pid === undefined) return;
    vivo = false;
    try {
      process.kill(-proceso.pid, 'SIGTERM');
    } catch (err) {
      // ESRCH es que ya se había muerto solo. Cualquier otra cosa hay que verla:
      // significa que el puerto se queda cogido.
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
        console.error(`\x1b[31m[servidor] no se ha podido parar: ${String(err)}\x1b[0m`);
      }
    }
  };

  const puertos = await new Promise<{ agente: number; espectador: number }>((ok, mal) => {
    const plazo = setTimeout(() => {
      parar();
      mal(
        new Error(
          `el servidor no abrió sus dos canales en ${PLAZO_DE_ARRANQUE_MS / 1000} s. Lo que dijo:\n${salida.slice(-2000)}`,
        ),
      );
    }, PLAZO_DE_ARRANQUE_MS);
    const leer =
      (deError: boolean) =>
      (trozo: Buffer): void => {
        const texto = trozo.toString();
        opciones.eco?.(texto, deError);
        salida += texto;
        if (arrancado) return;
        // Sobre lo ACUMULADO y no sobre este trozo: una línea puede partirse entre
        // dos, y entonces la expresión no casaría en ninguno.
        const a = RE_AGENTE.exec(salida)?.[1];
        const e = RE_ESPECTADORES.exec(salida)?.[1];
        if (a === undefined || e === undefined) return;
        arrancado = true;
        clearTimeout(plazo);
        ok({ agente: Number(a), espectador: Number(e) });
      };
    proceso.stdout.on('data', leer(false));
    proceso.stderr.on('data', leer(true));
    proceso.on('exit', (codigo) => {
      const pedido = !vivo;
      vivo = false;
      if (!arrancado) {
        clearTimeout(plazo);
        mal(
          new Error(`el servidor salió con ${codigo} antes de arrancar. Lo que dijo:\n${salida}`),
        );
        return;
      }
      if (!pedido && codigo !== 0 && codigo !== null) opciones.alMorir?.(codigo);
    });
  });

  return { ...puertos, parar };
}
