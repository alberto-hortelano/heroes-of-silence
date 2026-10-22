/**
 * Generar un mundo desde el menú de `pnpm dev` (F1a del mapa vivo, C3): congela el
 * plan procedimental que se pide, lo lee para el motor (con el PNG del taller) y
 * lanza Claude Code sin pantalla (`claude -p`, con la suscripción) con la skill
 * `motor-de-mundos`, que escribe `historia.json` y la valida con `pnpm mundo
 * validar` hasta que no tenga problemas. Al salir el motor, se valida otra vez con
 * la misma función que la página: sin reintento (el patrón de `map_generate`: el
 * motor ya itera con `validar`).
 *
 * Una generación cada vez. El proceso del motor va en **su propio grupo**
 * (`detached`) y se cancela matando ese grupo, nunca por nombre: la máquina es
 * compartida (`CLAUDE.md`). Lo carga el plugin `mundos()` de `vite.config.ts`
 * (`ssrLoadModule`), que solo existe en `pnpm dev`.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { tipoDeHeroePorDefecto } from '../../src/core/data.js';
import { esFaccion, type FactionId } from '../../src/core/types.js';
import { ordenDelMotor } from '../../src/server/entorno.js';
import { escribirLectura, escribirMundoNuevo, RAIZ, validarEnDisco } from './disco.js';

/** Lo más que se espera al motor: un mundo se genera una vez y despacio, pero no sin fin. */
export const TOPE_DEL_MOTOR_MS = 15 * 60_000;
/** Cuántas líneas de progreso se guardan (las últimas). */
const LINEAS = 40;
/** Las regiones por bando que admite el menú: pequeño, mediano y grande. */
export const TAMAÑOS = [4, 5, 7] as const;

export type Fase = 'congelar' | 'pintar' | 'motor' | 'validar' | 'listo' | 'fallido';

/** Lo que pregunta la pantalla de espera. */
export interface Progreso {
  readonly id: string;
  readonly fase: Fase;
  readonly lineas: readonly string[];
  readonly empezo: number;
  /** Cuándo llegó la última línea del motor (ms de época). */
  readonly ultima: number;
  /** Cuántas veces ha validado el motor. */
  readonly validaciones: number;
  /** Lo que no valió, si falló al validar. */
  readonly problemas?: readonly string[];
  /** Por qué falló, para la persona. */
  readonly motivo?: string;
}

/** Lo que pide el menú. */
export interface PedidoDelMenu {
  readonly faccion: FactionId;
  readonly heroe?: string | undefined;
  readonly regionesPorBando: number;
  /** El id del mundo; sin él, `gen-<AAAAMMDD>-<semilla>`. */
  readonly id?: string | undefined;
  readonly semilla?: number | undefined;
}

interface Generacion {
  progreso: Progreso;
  proceso: ChildProcess | null;
  cancelado: boolean;
}

const generaciones = new Map<string, Generacion>();

/** La que está en marcha, si alguna. */
function enMarcha(): Generacion | undefined {
  return [...generaciones.values()].find(
    (g) => g.progreso.fase !== 'listo' && g.progreso.fase !== 'fallido',
  );
}

/** Lee y comprueba lo que manda el menú: lanza con una frase si no vale. */
export function leerPedido(crudo: unknown): PedidoDelMenu {
  const o = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<string, unknown>;
  if (typeof o.faccion !== 'string' || !esFaccion(o.faccion)) {
    throw new Error(`«faccion» no es una facción: ${JSON.stringify(o.faccion)}`);
  }
  const regiones = o.regionesPorBando;
  if (!TAMAÑOS.some((t) => t === regiones)) {
    throw new Error(
      `«regionesPorBando» tiene que ser ${TAMAÑOS.join(', ')}; es ${JSON.stringify(regiones)}`,
    );
  }
  if (o.heroe !== undefined && typeof o.heroe !== 'string')
    throw new Error('«heroe» tiene que ser un texto');
  if (o.id !== undefined && typeof o.id !== 'string')
    throw new Error('«id» tiene que ser un texto');
  if (
    o.semilla !== undefined &&
    (typeof o.semilla !== 'number' || !Number.isSafeInteger(o.semilla))
  ) {
    throw new Error('«semilla» tiene que ser un entero');
  }
  return {
    faccion: o.faccion,
    heroe: o.heroe as string | undefined,
    regionesPorBando: regiones as number,
    id: o.id as string | undefined,
    semilla: o.semilla as number | undefined,
  };
}

/** El progreso de una generación, o `null` si no la hay. */
export function progresoDe(id: string): Progreso | null {
  return generaciones.get(id)?.progreso ?? null;
}

/**
 * Empieza una generación y devuelve su id; la sigue `progresoDe`. Lanza si ya hay
 * otra en marcha (el plugin responde 409) o si el pedido no vale.
 */
export function empezar(pedido: PedidoDelMenu): string {
  const otra = enMarcha();
  if (otra !== undefined) {
    throw new EnMarcha(`ya se está generando el mundo "${otra.progreso.id}": espera o cancélalo`);
  }
  const semilla = pedido.semilla ?? randomInt(1, 1_000_000);
  const hoy = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const id = pedido.id ?? `gen-${hoy}-${semilla}`;
  const ahora = Date.now();
  const g: Generacion = {
    progreso: { id, fase: 'congelar', lineas: [], empezo: ahora, ultima: ahora, validaciones: 0 },
    proceso: null,
    cancelado: false,
  };
  generaciones.set(id, g);
  void generar(g, {
    ...pedido,
    semilla,
    heroe: pedido.heroe ?? tipoDeHeroePorDefecto(pedido.faccion),
  });
  return id;
}

/** La generación en marcha que se pide sin que haya hueco. */
export class EnMarcha extends Error {}

/** Cancela una generación: mata el grupo del motor. */
export function cancelar(id: string): boolean {
  const g = generaciones.get(id);
  if (g === undefined || g.progreso.fase === 'listo' || g.progreso.fase === 'fallido') return false;
  g.cancelado = true;
  matarGrupo(g.proceso);
  poner(g, { fase: 'fallido', motivo: 'cancelado desde el menú' });
  return true;
}

/** Lo que se espera a que el motor salga tras `SIGTERM` antes de `SIGKILL` (medido: ~7 s). */
const GRACIA_AL_MATAR_MS = 15_000;

function matarGrupo(p: ChildProcess | null): void {
  if (p === null || p.pid === undefined || p.exitCode !== null) return;
  const pid = p.pid;
  const senal = (s: NodeJS.Signals): void => {
    try {
      // El guion: el grupo entero (el `claude` y lo que lance), y solo ese.
      process.kill(-pid, s);
    } catch (err) {
      // Ya no existe el grupo: salió entre la pregunta y la señal. Se dice, no se calla.
      console.warn(
        `[mundos] el grupo ${pid} ya no estaba (${s}): ${err instanceof Error ? err.message : err}`,
      );
    }
  };
  senal('SIGTERM');
  // Si no ha salido, a la fuerza: un motor colgado no se queda en la máquina.
  setTimeout(() => {
    if (p.exitCode === null && p.signalCode === null) senal('SIGKILL');
  }, GRACIA_AL_MATAR_MS).unref();
}

function poner(g: Generacion, cambio: Partial<Progreso>): void {
  g.progreso = { ...g.progreso, ...cambio };
}

function linea(g: Generacion, texto: string): void {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t === '') return;
  poner(g, {
    lineas: [...g.progreso.lineas, t.length > 160 ? `${t.slice(0, 157)}…` : t].slice(-LINEAS),
    ultima: Date.now(),
  });
}

async function generar(
  g: Generacion,
  pedido: PedidoDelMenu & { semilla: number; heroe: string },
): Promise<void> {
  const id = g.progreso.id;
  try {
    await escribirMundoNuevo({
      id,
      semilla: pedido.semilla,
      faccion: pedido.faccion,
      heroe: pedido.heroe,
      regionesPorBando: pedido.regionesPorBando,
    });
    linea(
      g,
      `plan del mapa congelado (semilla ${pedido.semilla}, ${pedido.regionesPorBando} regiones por bando)`,
    );
    if (g.cancelado) return;
    poner(g, { fase: 'pintar' });
    await escribirLectura(id, true);
    linea(g, 'mapa leído y pintado para el motor');
    if (g.cancelado) return;
    poner(g, { fase: 'motor' });
    const salida = await lanzarMotor(g, id);
    if (g.cancelado) return;
    poner(g, { fase: 'validar' });
    const problemas = await validarEnDisco(id);
    if (problemas.length === 0) {
      linea(g, `el mundo "${id}" vale`);
      poner(g, { fase: 'listo' });
      return;
    }
    poner(g, {
      fase: 'fallido',
      problemas,
      motivo:
        salida.codigo === 0
          ? 'el motor acabó, pero su historia no vale'
          : `el motor salió con código ${salida.codigo}${salida.porTope ? ' (pasó el tope de tiempo)' : ''}${salida.error === '' ? '' : `: ${salida.error}`}`,
    });
  } catch (err) {
    if (!g.cancelado)
      poner(g, { fase: 'fallido', motivo: err instanceof Error ? err.message : String(err) });
  }
}

/** Los argumentos de `claude -p` para un mundo: la skill, sus permisos y nada más. */
export function argumentosDelMotor(id: string): string[] {
  const historia = `assets/mundos/${id}/historia.json`;
  return [
    '-p',
    `/motor-de-mundos ${id}`,
    '--output-format',
    'stream-json',
    '--verbose',
    // Lo que no está en la lista se rechaza sin preguntar a nadie: no hay quien
    // conteste en un proceso sin pantalla.
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--allowedTools',
    `Read Glob Grep Write(${historia}) Edit(${historia}) Bash(pnpm mundo validar ${id})`,
    // Sin el MCP «heroes» de `.mcp.json` (el del agente que juega) y sin el hook
    // `Stop` del repo, que correría `pnpm verify` al acabar.
    '--strict-mcp-config',
    '--settings',
    '{"disableAllHooks":true}',
    '--no-session-persistence',
  ];
}

/** Una línea del `stream-json` del motor, dicha corta: qué herramienta usa o qué dice. */
export function lineaDelMotor(crudo: string): string | null {
  let e: { type?: string; subtype?: string; message?: { content?: unknown }; result?: unknown };
  try {
    e = JSON.parse(crudo);
  } catch {
    return crudo.trim() === '' ? null : crudo;
  }
  if (e.type === 'system' && e.subtype === 'init') return 'el motor ha arrancado';
  if (e.type === 'result') {
    return typeof e.result === 'string' ? `el motor acaba: ${e.result}` : 'el motor acaba';
  }
  if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) return null;
  const partes: string[] = [];
  for (const c of e.message.content as {
    type?: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  }[]) {
    if (c.type === 'text' && typeof c.text === 'string') partes.push(c.text);
    if (c.type === 'tool_use') {
      const que = c.input?.file_path ?? c.input?.command ?? c.input?.pattern ?? '';
      partes.push(`${c.name ?? 'herramienta'} ${String(que).replace(`${RAIZ}/`, '')}`);
    }
  }
  return partes.length === 0 ? null : partes.join(' · ');
}

async function lanzarMotor(
  g: Generacion,
  id: string,
): Promise<{ codigo: number | null; porTope: boolean; error: string }> {
  const orden = ordenDelMotor();
  linea(g, `lanzando ${orden} -p /motor-de-mundos ${id}`);
  const p = spawn(orden, argumentosDelMotor(id), {
    cwd: RAIZ,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  g.proceso = p;
  let porTope = false;
  const tope = setTimeout(() => {
    porTope = true;
    linea(g, 'el motor pasa del tope de tiempo: se corta');
    matarGrupo(p);
  }, TOPE_DEL_MOTOR_MS);
  let resto = '';
  let error = '';
  p.stdout?.setEncoding('utf8');
  p.stdout?.on('data', (trozo: string) => {
    resto += trozo;
    const lineas = resto.split('\n');
    resto = lineas.pop() ?? '';
    for (const l of lineas) {
      const dicha = lineaDelMotor(l);
      if (dicha === null) continue;
      // Una validación es una llamada a la herramienta, no el texto que la nombra.
      if (l.includes('"tool_use"') && l.includes(`pnpm mundo validar ${id}`)) {
        poner(g, { validaciones: g.progreso.validaciones + 1 });
      }
      linea(g, dicha);
    }
  });
  p.stderr?.setEncoding('utf8');
  p.stderr?.on('data', (trozo: string) => {
    error = `${error}${trozo}`.slice(-400);
  });
  return new Promise((resolver) => {
    p.on('error', (err) => {
      clearTimeout(tope);
      resolver({ codigo: null, porTope, error: `no se pudo lanzar «${orden}»: ${err.message}` });
    });
    p.on('close', (codigo) => {
      clearTimeout(tope);
      resolver({ codigo, porTope, error: error.trim() });
    });
  });
}
