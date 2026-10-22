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
import { type Progreso, terminada } from '../../src/client/desarrollo/progreso.js';
import { tipoDeHeroePorDefecto } from '../../src/core/data.js';
import { TAMAÑOS_DE_UN_MUNDO } from '../../src/core/mundo/formato.js';
import type { PedidoDelMenu } from '../../src/core/mundo/partida.js';
import { parseSeed } from '../../src/core/rng.js';
import { parseFaccion } from '../../src/core/types.js';
import { ordenDelMotor } from '../../src/server/entorno.js';
import { matarGrupo } from '../qa/grupo.js';
import { escribirLectura, escribirMundoNuevo, RAIZ, validarEnDisco } from './disco.js';

/**
 * La regla de un id de mundo, para la ruta del servidor de desarrollo: `vite.config.ts`
 * no importa el núcleo al arrancar (`arranque.test.ts`), así que la lee de aquí, que
 * carga a demanda.
 */
export { idDeMundoBlocker } from '../../src/core/mundo/formato.js';

/** Lo más que se espera al motor: un mundo se genera una vez y despacio, pero no sin fin. */
export const TOPE_DEL_MOTOR_MS = 15 * 60_000;
/** Cuántas líneas de progreso se guardan (las últimas). */
const LINEAS = 40;

interface Generacion {
  progreso: Progreso;
  proceso: ChildProcess | null;
  cancelado: boolean;
}

const generaciones = new Map<string, Generacion>();

/** La que está en marcha, si alguna. */
function enMarcha(): Generacion | undefined {
  return [...generaciones.values()].find((g) => !terminada(g.progreso.fase));
}

/** Lee y comprueba lo que manda el menú: lanza con una frase si no vale. */
export function leerPedido(crudo: unknown): PedidoDelMenu {
  const o = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<string, unknown>;
  // La facción y la semilla, con las mismas reglas que la URL (`parseFaccion`, `parseSeed`).
  const faccion = parseFaccion(typeof o.faccion === 'string' ? o.faccion : null);
  if (faccion === null)
    throw new Error(`«faccion» no es una facción: ${JSON.stringify(o.faccion)}`);
  const regiones = o.regionesPorBando;
  const tamaños = TAMAÑOS_DE_UN_MUNDO.map((t) => t.regiones);
  if (!tamaños.some((t) => t === regiones)) {
    throw new Error(
      `«regionesPorBando» tiene que ser ${tamaños.join(', ')}; es ${JSON.stringify(regiones)}`,
    );
  }
  if (o.heroe !== undefined && typeof o.heroe !== 'string')
    throw new Error('«heroe» tiene que ser un texto');
  if (o.id !== undefined && typeof o.id !== 'string')
    throw new Error('«id» tiene que ser un texto');
  if (o.semilla !== undefined && typeof o.semilla !== 'number') {
    throw new Error('«semilla» tiene que ser un número');
  }
  return {
    faccion,
    heroe: o.heroe as string | undefined,
    regionesPorBando: regiones as number,
    id: o.id as string | undefined,
    semilla: o.semilla === undefined ? undefined : (parseSeed(String(o.semilla)) ?? undefined),
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
  if (g === undefined || terminada(g.progreso.fase)) return false;
  g.cancelado = true;
  matarGrupo(g.proceso, avisar);
  poner(g, { fase: 'fallido', motivo: 'cancelado desde el menú' });
  return true;
}

/** Lo que se dice al matar el grupo del motor (el `claude` y lo que lance, `matarGrupo`). */
const avisar = (msg: string): void => console.warn(`[mundos] ${msg}`);

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
    matarGrupo(p, avisar);
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
