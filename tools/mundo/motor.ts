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
import { idDeMundoBlocker } from '../../src/core/mundo/formato.js';
import { type PedidoDelMenu, pedidoBlocker } from '../../src/core/mundo/partida.js';
import { parseSeed } from '../../src/core/rng.js';
import { parseFaccion } from '../../src/core/types.js';
import { ordenDelMotor } from '../../src/server/entorno.js';
import { matarGrupo } from '../qa/grupo.js';
import {
  borrarMundoGenerado,
  borrarSinHistoria,
  escribirLectura,
  escribirMundoNuevo,
  esGenerado,
  hayMundo,
  RAIZ,
  validarEnDisco,
} from './disco.js';

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
  /** Si esta generación creó la carpeta del mundo: solo entonces la borra al fallar. */
  creada: boolean;
  /**
   * Hasta que `generar` acaba de verdad, también cancelada: el pintor del mapa no se
   * para a medias (es una página de Playwright dentro de este proceso), y mientras
   * pinta no se lanza otra (M6 de la vuelta 2: había dos pintores a la vez).
   */
  viva: boolean;
}

const generaciones = new Map<string, Generacion>();

/** La que está en marcha, o cancelada y aún sin acabar, si alguna. */
function enMarcha(): Generacion | undefined {
  return [...generaciones.values()].find((g) => g.viva);
}

/** Lo que puede llevar un pedido del menú: lo demás se rechaza diciéndolo. */
const CLAVES_DEL_PEDIDO = ['faccion', 'regionesPorBando', 'heroe', 'id', 'semilla'] as const;

/** Lee y comprueba lo que manda el menú: lanza con una frase si no vale. */
export function leerPedido(crudo: unknown): PedidoDelMenu {
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    throw new Error(
      `el pedido tiene que ser un objeto con ${CLAVES_DEL_PEDIDO.map((k) => `«${k}»`).join(', ')}; es ${JSON.stringify(crudo)}`,
    );
  }
  const o = crudo as Record<string, unknown>;
  // Una clave de más no se ignora en silencio: quien la manda cree que cuenta (M5).
  const sobran = Object.keys(o).filter(
    (k) => !(CLAVES_DEL_PEDIDO as readonly string[]).includes(k),
  );
  if (sobran.length > 0) {
    throw new Error(
      `el pedido no lleva ${sobran.map((k) => `«${k}»`).join(', ')}: lleva ${CLAVES_DEL_PEDIDO.map((k) => `«${k}»`).join(', ')}`,
    );
  }
  // La facción y la semilla, con las mismas reglas que la URL (`parseFaccion`, `parseSeed`).
  const faccion = parseFaccion(typeof o.faccion === 'string' ? o.faccion : null);
  if (faccion === null)
    throw new Error(`«faccion» no es una facción: ${JSON.stringify(o.faccion)}`);
  if (o.heroe !== undefined && typeof o.heroe !== 'string')
    throw new Error('«heroe» tiene que ser un texto');
  if (o.id !== undefined) {
    if (typeof o.id !== 'string') throw new Error('«id» tiene que ser un texto');
    const malId = idDeMundoBlocker(o.id);
    if (malId !== null) throw new Error(`«id»: ${malId}`);
  }
  if (o.semilla !== undefined && typeof o.semilla !== 'number') {
    throw new Error('«semilla» tiene que ser un número');
  }
  // El tamaño y el héroe, antes de gastar el motor: si el héroe no es de la
  // facción, el `mundo.json` no valdría y el motor no lo puede tocar (`pedidoBlocker`).
  const pedido = {
    faccion,
    heroe: o.heroe as string | undefined,
    regionesPorBando: o.regionesPorBando as number,
  };
  const motivo = pedidoBlocker(pedido);
  if (motivo !== null) throw new Error(motivo);
  return {
    ...pedido,
    id: o.id as string | undefined,
    semilla: o.semilla === undefined ? undefined : (parseSeed(String(o.semilla)) ?? undefined),
  };
}

/** El progreso de una generación, o `null` si no la hay. */
export function progresoDe(id: string): Progreso | null {
  return generaciones.get(id)?.progreso ?? null;
}

/**
 * Empieza una generación y devuelve su id; la sigue `progresoDe`. Lanza `Conflicto`
 * (el plugin responde 409) si ya hay otra en marcha —o cancelada que aún pinta— o si
 * ya hay un mundo con ese id, antes de lanzar nada (M5 de la vuelta 2: antes daba 200
 * y fallaba después).
 */
export function empezar(pedido: PedidoDelMenu): string {
  const otra = enMarcha();
  if (otra !== undefined) {
    throw new Conflicto(
      otra.cancelado
        ? `el mundo "${otra.progreso.id}" se está cancelando: acaba de pintar el mapa y se borra; espera un momento`
        : `ya se está generando el mundo "${otra.progreso.id}": espera o cancélalo`,
    );
  }
  const semilla = pedido.semilla ?? randomInt(1, 1_000_000);
  const hoy = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const id = pedido.id ?? `gen-${hoy}-${semilla}`;
  if (hayMundo(id)) {
    throw new Conflicto(`ya hay un mundo "${id}": pide otro id u otra semilla, o bórralo a mano`);
  }
  const ahora = Date.now();
  const g: Generacion = {
    progreso: { id, fase: 'congelar', lineas: [], empezo: ahora, ultima: ahora, validaciones: 0 },
    proceso: null,
    cancelado: false,
    creada: false,
    viva: true,
  };
  generaciones.set(id, g);
  void generar(g, {
    ...pedido,
    semilla,
    heroe: pedido.heroe ?? tipoDeHeroePorDefecto(pedido.faccion),
  });
  return id;
}

/** Un pedido que choca con lo que hay: otra generación en marcha, o un mundo con ese id. */
export class Conflicto extends Error {}

/**
 * Cancela una generación: mata el grupo del motor y, al acabar, borra su mundo
 * (`generar`). Mientras pinta el mapa no se puede parar: acaba de pintar, se borra y
 * hasta entonces no se lanza otra (`Generacion.viva`).
 */
export function cancelar(id: string): boolean {
  const g = generaciones.get(id);
  if (g === undefined || terminada(g.progreso.fase)) return false;
  g.cancelado = true;
  const pintando = g.progreso.fase === 'pintar';
  matarGrupo(g.proceso, avisar);
  poner(g, {
    fase: 'fallido',
    motivo: pintando
      ? 'cancelado desde el menú: acaba de pintar el mapa y se borra'
      : 'cancelado desde el menú',
  });
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
    g.creada = true;
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
  } finally {
    // Cancelada, no deja nada: quien cancela no quiere ese mundo, tenga historia o no
    // (M7 de la vuelta 2). Fallida, deja la historia que no vale para mirarla, y sin
    // historia no deja una carpeta que no se juega. Solo un `gen-*` creado aquí: un
    // id puesto a mano (`ejemplo`) no se borra nunca. Al cancelar se llega aquí cuando
    // el motor ya ha cerrado (`lanzarMotor` espera a su `close`) o el pintor ha
    // acabado, así que no se borra con nadie aún escribiendo.
    if (g.creada && esGenerado(id) && (g.cancelado || g.progreso.fase === 'fallido')) {
      try {
        if (g.cancelado) {
          await borrarMundoGenerado(id);
          linea(g, `el mundo "${id}" se ha cancelado: se borra`);
        } else if (await borrarSinHistoria(id)) {
          linea(g, `el mundo "${id}" no tenía historia: se borra`);
        }
      } catch (err) {
        avisar(
          `no se pudo borrar el mundo a medias "${id}": ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    g.viva = false;
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

/**
 * Lo que hace una herramienta del motor, dicho para la persona, o `null` si no se
 * cuenta. Solo lo que tiene permiso (`argumentosDelMotor`): lo demás se le deniega,
 * no es noticia, y su orden llevaba rutas absolutas de esta máquina (H11 del QA de
 * la F1a). Ni rutas ni órdenes: qué hace.
 */
function queHace(
  id: string,
  nombre: string | undefined,
  input: Record<string, unknown> | undefined,
): string | null {
  const ruta = String(input?.file_path ?? '');
  const fichero = ruta.split('/').pop() ?? '';
  const suHistoria = ruta.endsWith(`assets/mundos/${id}/historia.json`);
  switch (nombre) {
    case 'Read':
      if (fichero === 'lectura.json') return 'lee el mapa por regiones';
      if (fichero === 'mapa.png') return 'mira el mapa';
      if (fichero === 'SKILL.md') return 'lee sus instrucciones';
      if (suHistoria) return 'relee su historia';
      if (fichero === 'historia.json') return 'lee una historia de ejemplo';
      return 'lee un fichero del repositorio';
    case 'Glob':
    case 'Grep':
      return 'busca en el repositorio';
    case 'Write':
      return suHistoria ? 'escribe la historia' : null;
    case 'Edit':
      return suHistoria ? 'corrige la historia' : null;
    case 'Bash':
      return String(input?.command ?? '').trim() === `pnpm mundo validar ${id}`
        ? 'valida la historia'
        : null;
    default:
      return null;
  }
}

/**
 * Una ruta absoluta de esta máquina (`/home/…`, `~/.claude/…`) que empieza tras un
 * blanco, unas comillas o un paréntesis: lo de dentro de una URL (`https://x/y`) no,
 * porque va tras «:». Hasta el primer blanco o cierre.
 */
const RUTA_ABSOLUTA = /(^|[\s"'`(«])(~?\/[^\s"'`)»,;]+)/g;

/**
 * Un texto del motor sin las rutas de esta máquina: las del repositorio, relativas
 * a él; las de fuera (`/home/al/.claude/skills`, M4 de la vuelta 2), solo su último
 * nombre, que dice qué mira sin decir dónde vive.
 */
export function sinRutas(texto: string): string {
  return texto
    .replaceAll(`${RAIZ}/`, '')
    .replaceAll(RAIZ, '.')
    .replace(RUTA_ABSOLUTA, (_, antes: string, ruta: string) => {
      const sinPunto = /[.:]+$/.exec(ruta)?.[0] ?? '';
      const limpia = ruta.slice(0, ruta.length - sinPunto.length).replace(/\/+$/, '');
      return `${antes}${limpia.split('/').pop() || '…'}${sinPunto}`;
    });
}

/**
 * Una línea del `stream-json` del motor del mundo `id`, dicha corta: lo que dice y
 * lo que hace (`queHace`), o `null` si no hay nada que contar.
 */
export function lineaDelMotor(crudo: string, id: string): string | null {
  let e: { type?: string; subtype?: string; message?: { content?: unknown }; result?: unknown };
  try {
    e = JSON.parse(crudo);
  } catch {
    return crudo.trim() === '' ? null : sinRutas(crudo);
  }
  if (e.type === 'system' && e.subtype === 'init') return 'el motor ha arrancado';
  if (e.type === 'result') {
    return typeof e.result === 'string'
      ? `el motor acaba: ${sinRutas(e.result)}`
      : 'el motor acaba';
  }
  if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) return null;
  const partes: string[] = [];
  for (const c of e.message.content as {
    type?: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  }[]) {
    if (c.type === 'text' && typeof c.text === 'string') partes.push(sinRutas(c.text));
    if (c.type === 'tool_use') {
      const que = queHace(id, c.name, c.input);
      if (que !== null) partes.push(que);
    }
  }
  return partes.length === 0 ? null : partes.join(' · ');
}

/** Si una línea del motor es su llamada a `pnpm mundo validar <id>`. */
export function esSuValidacion(crudo: string, id: string): boolean {
  if (!crudo.includes('"tool_use"')) return false;
  try {
    const e = JSON.parse(crudo) as { message?: { content?: unknown } };
    const contenido = Array.isArray(e.message?.content) ? e.message.content : [];
    return contenido.some(
      (c: { type?: string; name?: string; input?: { command?: unknown } }) =>
        c.type === 'tool_use' &&
        c.name === 'Bash' &&
        String(c.input?.command ?? '').trim() === `pnpm mundo validar ${id}`,
    );
  } catch {
    return false;
  }
}

/**
 * Lo que respondió el validador a una llamada del motor, si la línea es eso: los
 * problemas (las líneas «<fichero>.json: …» que escribe `pnpm mundo validar`), vacío
 * si dijo que vale, o `null` si la línea no es una respuesta del validador.
 */
export function respuestaDelValidador(crudo: string): readonly string[] | null {
  if (!crudo.includes('"tool_result"')) return null;
  let e: { type?: string; message?: { content?: unknown } };
  try {
    e = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (e.type !== 'user' || !Array.isArray(e.message?.content)) return null;
  for (const c of e.message.content as { type?: string; content?: unknown }[]) {
    if (c.type !== 'tool_result') continue;
    const texto = Array.isArray(c.content)
      ? c.content.map((x: { text?: unknown }) => String(x.text ?? '')).join('\n')
      : String(c.content ?? '');
    if (/el mundo "[^"]+" vale/.test(texto)) return [];
    const problemas = texto
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(mundo|plan|historia)\.json: /.test(l));
    if (problemas.length > 0) return problemas.map(sinRutas);
  }
  return null;
}

async function lanzarMotor(
  g: Generacion,
  id: string,
): Promise<{ codigo: number | null; porTope: boolean; error: string }> {
  const orden = ordenDelMotor();
  // Sin la orden: con `HEROES_MOTOR` puede ser una ruta de esta máquina.
  linea(g, 'lanza el motor de narrativa');
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
      // Una validación es una llamada a la herramienta, no el texto que la nombra.
      if (esSuValidacion(l, id)) poner(g, { validaciones: g.progreso.validaciones + 1 });
      const respuesta = respuestaDelValidador(l);
      if (respuesta !== null) {
        const n = respuesta.length;
        poner(g, {
          ultimoProblema:
            n === 0
              ? undefined
              : `${n} ${n === 1 ? 'problema' : 'problemas'}; el primero, ${respuesta[0]}`,
        });
        linea(g, n === 0 ? 'la historia vale' : `la historia aún no vale (${n})`);
      }
      const dicha = lineaDelMotor(l, id);
      if (dicha !== null) linea(g, dicha);
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
