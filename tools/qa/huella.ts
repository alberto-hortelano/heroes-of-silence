/**
 * La huella de identidad: un sha256 por sección de **lo que el juego hace**, para
 * demostrar que mover código no lo cambió.
 *
 * Existe por la reorganización del 06-11-2026
 * (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/`): decenas de commits
 * que solo mueven código de sitio, cada uno con la promesa de no cambiar nada. El
 * banco (`pnpm banco`) ya caza que una partida se juegue distinta, pero no ve el
 * mapa que nadie pisa, la escena que pinta el cliente, lo que se le dice al agente
 * ni lo que hace la sesión de la persona; y `tsc` no ve nada de eso. La huella se
 * toma antes de empezar y se compara tras cada paso: si una sección sale distinta,
 * el paso cambió algo que no dijo.
 *
 *     npx tsx tools/qa/huella.ts                          # todas las secciones
 *     npx tsx tools/qa/huella.ts --solo escena,sesion     # solo esas
 *     npx tsx tools/qa/huella.ts --guardar <fichero.json> # y la deja escrita
 *     npx tsx tools/qa/huella.ts --comparar <fichero.json>
 *     npx tsx tools/qa/huella.ts --detalle <sección> <clave>
 *     npx tsx tools/qa/huella.ts --claves <sección>       # las claves de sus piezas
 *
 * Imprime una línea por sección: su nombre, cuántas piezas midió, su sha256 y lo que
 * tardó. Con `--comparar` sale 1 si alguna sección no coincide con la del fichero,
 * nombrándola con las primeras piezas que difieren (el fichero guarda el sha de cada
 * pieza, no solo el de la sección: «escena distinta» no dice nada, «escena: s7 y
 * prueba» dice dónde mirar). `--detalle` imprime el texto entero de una pieza (el
 * mapa, la escena, el mensaje al agente, el estado de la sesión…) para hacer `diff`
 * entre el antes y el después; es lo que hay que mirar cuando la huella cambia.
 *
 * Las secciones, todas deterministas (toda tirada sale de `createRng(semilla)`, aquí
 * y en el juego):
 *
 * - **mapas**: lo que da el generador —el mapa, las ciudades, los asaltantes y las
 *   guarniciones de la partida recién creada— en las semillas 1-200 del tamaño por
 *   defecto y en las 1-30 del lado mínimo, 26 (`LADO_MINIMO_DEL_GENERADOR`).
 * - **partidas**: las 200 partidas de `pnpm banco 200`, con su mismo volcado
 *   (`volcadoDeLaPartida`): el sha de la sección **es** el que imprime el banco.
 * - **peleas**: las tandas de `arena-ia.ts` (`tandas-de-la-arena.ts`), 100 semillas
 *   por variante, la IA contra la IA: el registro entero de cada pelea.
 * - **agente**: todo lo que se le manda al agente (cada petición con su formato de
 *   respuesta, cada veredicto) en la partida del arnés de `pnpm qa` (el `Director`
 *   con la política de `politica.ts`, sin servidor ni puertos), semillas 1-20 hasta
 *   el final: el turno de aventura, los de batalla, las respuestas de la rueda, el
 *   mapa que se le pide, las voces y el ascenso pasan por `contract/serialize.ts`.
 * - **escena**: lo que compone el escenógrafo del cliente (`componer`) en las
 *   semillas 1-40 y en los mundos `prueba` y `ejemplo` de `assets/mundos/`, con el
 *   catálogo del disco como lo carga el juego.
 * - **sesion**: la `Session` de la persona en las semillas 1-5, treinta fines de
 *   turno seguidos resolviendo sola cada aviso y cada batalla («Resolver sola»): de
 *   cada paso, la barra (`status`), la versión, la escena y el sha del estado.
 *
 * Una sección vale el sha256 de sus piezas en orden, cada una seguida de un salto de
 * línea; cada pieza, el texto que sale de `estable` (un `JSON.stringify` que escribe
 * `Map`, `Set` y los arrays tipados en vez de perderlos; el orden de las claves y de
 * las entradas es el de inserción, a propósito: moviendo código no cambia, y si
 * cambia, algo se construye distinto). El estado del juego guarda su `Rng`, que es
 * un cierre: su estado no se ve, y se ve lo que sale de él.
 *
 * El mundo `ejemplo` no se deja jugar desde el 02-11-2026 (sus asaltantes pasan del
 * techo de 310), así que su pieza es el motivo por el que no, no su escena. Y la
 * sesión, que no mueve a su héroe, pierde la base hacia el día 12-15: los pasos de
 * después repiten el último, y está bien que lo hagan.
 *
 * Medido el 06-11-2026 en esta máquina, con poca carga: mapas, 230 piezas en 11,5 s;
 * partidas, 200 en 13,7 s (lo que tarda `pnpm banco 200`); peleas, 800 en 2,1 s;
 * agente, 7 208 mensajes en 2,6 s; escena, 42 en 16,7 s; sesión, 155 pasos en 0,4 s;
 * entera, 47 s. Para un paso que solo toca el cliente, `--solo escena,sesion` (17 s);
 * para el servidor o el contrato, `--solo agente` (3 s). El tiempo no entra en la
 * huella.
 *
 * `node:crypto` aquí vale: esto es `tools/`, no `core`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WebSocket } from 'ws';
import {
  type CatalogoEnBruto,
  catalogoValidado,
  RUTA_DEL_CATALOGO,
} from '../../src/client/render/escenario/catalogo.js';
import { componer } from '../../src/client/render/escenario/colocar.js';
import { Session } from '../../src/client/sesion/partida.js';
import { autoResolve } from '../../src/core/ai/tactics.js';
import { causaDelFinal } from '../../src/core/battle/consultas.js';
import { LADO_DEL_MAPA, LADO_MINIMO_DEL_GENERADOR } from '../../src/core/map/generar/plan.js';
import { partidaDelMundo } from '../../src/core/mundo/partida.js';
import { newGame } from '../../src/core/state/setup.js';
import type { GameState } from '../../src/core/state/tipos.js';
import { AgentLink } from '../../src/server/agent-link.js';
import { Director } from '../../src/server/director.js';
import { pedirMapaAlAgente } from '../../src/server/mapa-del-agente.js';
import type { ServerToAgentMsg } from '../../src/server/protocol.js';
import { leerMundoDeDisco } from '../mundo/disco.js';
import { contestaElArnes, DIAS_DEL_ARNES, sinTorcidos } from './partida-del-arnes.js';
import { DIAS_POR_DEFECTO, partidaDeSemilla, volcadoDeLaPartida } from './partidas.js';
import { montajeDeLaSemilla, peleaSinJugar, TANDAS } from './tandas-de-la-arena.js';
import { prepararPartidaDelArnes } from './veterano-en-la-base.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Lo que mide cada sección (las cifras, escritas una vez: la cabecera las cuenta). */
const SEMILLAS_DE_MAPAS = 200;
const SEMILLAS_DE_MAPAS_PEQUEÑOS = 30;
const SEMILLAS_DE_PARTIDAS = 200;
const SEMILLAS_DE_PELEAS = 100;
const SEMILLAS_DEL_AGENTE = 20;
const SEMILLAS_DE_ESCENA = 40;
const MUNDOS_DE_ESCENA = ['prueba', 'ejemplo'] as const;
const SEMILLAS_DE_SESION = 5;
const FINES_DE_TURNO = 30;

/**
 * Una pieza de una sección: su clave (para nombrarla al comparar y para pedirla con
 * `--detalle`) y su texto, que es lo que se hashea. `detalle`, si lo hay, es lo que
 * imprime `--detalle` en su lugar: la sesión hashea el sha del estado y no el estado,
 * pero lo que hay que mirar cuando cambia es el estado entero.
 */
interface Pieza {
  readonly clave: string;
  readonly texto: string;
  readonly detalle?: () => string;
}

interface Seccion {
  readonly nombre: string;
  readonly piezas: () => AsyncIterable<Pieza> | Iterable<Pieza>;
}

/**
 * Un `JSON.stringify` que no pierde nada de lo que guarda el juego: un `Map` sale
 * con sus entradas, un `Set` con sus valores y un array tipado con sus números (el
 * de serie los da por `{}` o por un objeto de índices), y un número que JSON no
 * sabe escribir, por su nombre (el de serie lo da por `null`). Las funciones se
 * pierden como siempre: el `Rng` del estado es un cierre.
 */
function estable(x: unknown): string {
  return JSON.stringify(x, (_clave, v: unknown) => {
    if (v instanceof Map) return { '«Map»': [...v.entries()] };
    if (v instanceof Set) return { '«Set»': [...v] };
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      return { [`«${v.constructor.name}»`]: Array.from(v as unknown as ArrayLike<number>) };
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return `«${v}»`;
    if (typeof v === 'bigint') return `«${v}n»`;
    return v;
  });
}

const sha256 = (texto: string): string => createHash('sha256').update(texto).digest('hex');

// ------------------------------------------------------------------ secciones

/** Lo que da el generador: el mapa y lo que `buildMap` pone en él, recién creada la partida. */
function delGenerador(state: GameState): string {
  return estable({
    mapa: state.map,
    ciudades: state.towns,
    asaltantes: state.raiders,
    guarniciones: state.guarniciones,
  });
}

function* mapas(): Generator<Pieza> {
  for (let s = 1; s <= SEMILLAS_DE_MAPAS; s++) {
    yield { clave: `s${s}`, texto: delGenerador(newGame({ seed: s })) };
  }
  const lado = LADO_MINIMO_DEL_GENERADOR;
  for (let s = 1; s <= SEMILLAS_DE_MAPAS_PEQUEÑOS; s++) {
    yield {
      clave: `s${s}-${lado}`,
      texto: delGenerador(newGame({ seed: s, width: lado, height: lado })),
    };
  }
}

async function* partidas(): AsyncGenerator<Pieza> {
  for (let s = 1; s <= SEMILLAS_DE_PARTIDAS; s++) {
    const { state, fin } = await partidaDeSemilla(s, DIAS_POR_DEFECTO);
    yield { clave: `s${s}`, texto: volcadoDeLaPartida(s, state, fin).join('\n') };
  }
}

/** «armadura: jinete contra floja» → «armadura-jinete-contra-floja»: una clave que se escribe sin comillas. */
const enUnaPalabra = (x: string): string => x.replace(/:/g, '').replace(/\s+/g, '-');

function* peleas(): Generator<Pieza> {
  for (const t of TANDAS) {
    for (let s = 1; s <= SEMILLAS_DE_PELEAS; s++) {
      const montaje = montajeDeLaSemilla(t, s);
      for (const v of t.variantes) {
        const { batalla, rng } = peleaSinJugar(t, v, montaje, s);
        autoResolve(batalla, rng);
        yield {
          clave: `${enUnaPalabra(t.nombre)}/${enUnaPalabra(v.nombre)}/s${s}`,
          texto: estable({
            rondas: batalla.round,
            final: batalla.finished,
            causa: causaDelFinal(batalla),
            registro: batalla.log,
          }),
        };
      }
    }
  }
}

/**
 * El socket de mentira del arnés (`partida-del-arnes.ts`), pero que **guarda todo**
 * lo que el servidor le manda: cada petición con su formato de respuesta y cada
 * veredicto, no solo las peticiones. Contesta lo mismo que contesta el arnés
 * (`contestaElArnes`, torcidos incluidos), así que juega la misma partida. Lo único
 * que no se guarda es el aviso `partida`: lleva un `randomUUID` y la huella saldría
 * distinta en cada pasada.
 */
class SocketQueLoGuarda extends EventEmitter {
  readonly mensajes: ServerToAgentMsg[] = [];
  private readonly torcidos = sinTorcidos();
  constructor(private readonly semilla: number) {
    super();
  }
  send(raw: string): void {
    const msg = JSON.parse(raw) as ServerToAgentMsg;
    if (msg.type === 'partida') return;
    this.mensajes.push(msg);
    if (msg.type !== 'request') return;
    const respuesta = contestaElArnes(msg.kind, msg.payload, this.semilla, this.torcidos);
    // En la vuelta siguiente del bucle de eventos, como el arnés: el enlace aún no
    // ha apuntado la petición como pendiente cuando la manda.
    setImmediate(() =>
      this.emit(
        'message',
        JSON.stringify({ type: 'response', requestId: msg.requestId, data: respuesta }),
      ),
    );
  }
  close(): void {
    this.emit('close');
  }
}

/**
 * La partida del arnés de `semilla`, entera (hasta `DIAS_DEL_ARNES`), con todo lo que
 * se le mandó al agente. Es la de `jugarPartidaDelArnes` sin su tope de turnos y sin
 * la complejidad del entorno (`combateDelEntorno`): la huella no depende de qué
 * variables tenga puestas quien la toma.
 */
async function mensajesAlAgente(semilla: number): Promise<readonly ServerToAgentMsg[]> {
  const socket = new SocketQueLoGuarda(semilla);
  const link = new AgentLink();
  link.attach(socket as unknown as WebSocket);
  const { plan, motivo } = await pedirMapaAlAgente(link, {
    width: LADO_DEL_MAPA,
    height: LADO_DEL_MAPA,
    players: [0, 1],
  });
  if (plan === null) throw new Error(`semilla ${semilla}: se rechaza el plan del arnés: ${motivo}`);
  const director = new Director(link, {
    seed: semilla,
    plan,
    agentPlayers: [1],
    maxDays: DIAS_DEL_ARNES,
    preparar: prepararPartidaDelArnes,
  });
  while (director.desenlace === null) await director.playTurn();
  return socket.mensajes;
}

async function* agente(): AsyncGenerator<Pieza> {
  for (let s = 1; s <= SEMILLAS_DEL_AGENTE; s++) {
    for (const [i, m] of (await mensajesAlAgente(s)).entries()) {
      const que = m.type === 'request' ? m.kind : m.type;
      yield { clave: `s${s}#${i}:${que}`, texto: estable(m) };
    }
  }
}

/** El catálogo de la escena del repo (`assets/mapa/escena.json`), comprobado como lo carga el juego. */
function catalogoDelDisco() {
  return catalogoValidado(
    JSON.parse(readFileSync(join(RAIZ, RUTA_DEL_CATALOGO), 'utf8')) as CatalogoEnBruto,
  );
}

async function* escena(): AsyncGenerator<Pieza> {
  const catalogo = catalogoDelDisco();
  for (let s = 1; s <= SEMILLAS_DE_ESCENA; s++) {
    yield { clave: `s${s}`, texto: estable(componer(newGame({ seed: s }).map, s, catalogo)) };
  }
  for (const id of MUNDOS_DE_ESCENA) {
    // Un mundo que el juego no deja jugar no tiene escena: lo que se guarda es por
    // qué, que también tiene que seguir igual. Es el caso de `ejemplo` desde el
    // 02-11-2026 (sus asaltantes pasan del techo de 310: `pnpm mundo validar
    // ejemplo` sale 1), y lo es a la vista, no tragado: si un paso lo arregla o lo
    // rompe de otra manera, la pieza cambia.
    let leido: Awaited<ReturnType<typeof leerMundoDeDisco>>;
    try {
      leido = await leerMundoDeDisco(id);
    } catch (err) {
      yield { clave: id, texto: estable({ noSeJuega: err instanceof Error ? err.message : err }) };
      continue;
    }
    const { mundo } = leido;
    yield {
      clave: id,
      texto: estable(componer(partidaDelMundo(mundo).map, mundo.mundo.semilla, catalogo)),
    };
  }
}

/** Una vuelta del bucle de eventos: lo que el turno del rival tenga pendiente avanza. */
const unaVuelta = (): Promise<void> => new Promise((ok) => setImmediate(ok));

/**
 * Cuántas vueltas sin que pase nada se esperan antes de dar el fin de turno por
 * atascado: el turno del rival no espera a nada más que a la persona, así que con
 * una basta; las demás son margen.
 */
const VUELTAS_SIN_NADA = 50;

/**
 * Pasa el turno y espera a que vuelva a ser de la persona, resolviendo sola cada
 * cosa que el turno del rival le ponga delante, como el botón «Resolver sola»: el
 * aviso de un ataque (`resolverElAtaqueSola`), la pantalla de la defensa con la
 * propuesta de la IA (`dejarLaDefensaDeLaIA`) y la batalla abierta
 * (`autoResolveBattle`). Lanza si el turno se queda esperando algo que no es eso.
 */
async function finDeTurno(s: Session): Promise<void> {
  let acabado = false;
  let fallo: unknown = null;
  s.endTurn().then(
    () => {
      acabado = true;
    },
    (err: unknown) => {
      fallo = err;
      acabado = true;
    },
  );
  let quieto = 0;
  while (!acabado) {
    await unaVuelta();
    if (acabado) break;
    const antes = s.version;
    if (s.avisoDelAtaque !== null) s.resolverElAtaqueSola();
    else if (s.defensa !== null) s.dejarLaDefensaDeLaIA();
    else if (s.state.pendingBattle !== null && s.scene === 'battle') s.autoResolveBattle();
    quieto = s.version === antes ? quieto + 1 : 0;
    if (quieto > VUELTAS_SIN_NADA) {
      throw new Error(
        `el fin de turno del día ${s.state.day} no acaba y no espera nada que se resuelva solo: escena «${s.scene}», barra «${s.status}»`,
      );
    }
  }
  if (fallo !== null) throw fallo;
}

async function* sesion(): AsyncGenerator<Pieza> {
  for (let semilla = 1; semilla <= SEMILLAS_DE_SESION; semilla++) {
    const s = new Session(semilla);
    const paso = (n: number): Pieza => {
      const estado = estable(s.state);
      const foto = { status: s.status, version: s.version, scene: s.scene };
      return {
        clave: `s${semilla}#${n}`,
        texto: estable({ ...foto, estado: sha256(estado) }),
        detalle: () => estable({ ...foto, estado: JSON.parse(estado) }),
      };
    };
    yield paso(0);
    for (let n = 1; n <= FINES_DE_TURNO; n++) {
      await finDeTurno(s);
      yield paso(n);
    }
  }
}

const SECCIONES: readonly Seccion[] = [
  { nombre: 'mapas', piezas: mapas },
  { nombre: 'partidas', piezas: partidas },
  { nombre: 'peleas', piezas: peleas },
  { nombre: 'agente', piezas: agente },
  { nombre: 'escena', piezas: escena },
  { nombre: 'sesion', piezas: sesion },
];

// ---------------------------------------------------------------- la orden

/** La huella de una sección: su sha, cuántas piezas y el sha de cada una, por clave. */
interface HuellaDeSeccion {
  readonly sha: string;
  readonly piezas: number;
  readonly porPieza: Readonly<Record<string, string>>;
}

interface HuellaGuardada {
  readonly version: 1;
  /** El commit sobre el que se tomó y si había cambios sin commitear: para saber de qué es. */
  readonly commit: string;
  readonly secciones: Readonly<Record<string, HuellaDeSeccion>>;
}

const VERSION = 1;

interface Orden {
  readonly solo: readonly Seccion[];
  readonly guardar: string | null;
  readonly comparar: string | null;
  readonly detalle: { readonly seccion: Seccion; readonly clave: string } | null;
  readonly claves: Seccion | null;
}

function seccionLlamada(nombre: string): Seccion {
  const s = SECCIONES.find((x) => x.nombre === nombre);
  if (s === undefined) {
    throw new Error(
      `no hay ninguna sección «${nombre}»: las hay ${SECCIONES.map((x) => x.nombre).join(', ')}`,
    );
  }
  return s;
}

function leerOrden(args: readonly string[]): Orden {
  let solo: readonly Seccion[] = SECCIONES;
  let guardar: string | null = null;
  let comparar: string | null = null;
  let detalle: Orden['detalle'] = null;
  let claves: Seccion | null = null;
  const valor = (i: number, que: string): string => {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${args[i]} necesita ${que}`);
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--solo') {
      solo = valor(i, 'las secciones, separadas por comas').split(',').map(seccionLlamada);
      i++;
    } else if (a === '--guardar') {
      guardar = valor(i, 'un fichero');
      i++;
    } else if (a === '--comparar') {
      comparar = valor(i, 'un fichero');
      i++;
    } else if (a === '--claves') {
      claves = seccionLlamada(valor(i, 'una sección'));
      i++;
    } else if (a === '--detalle') {
      detalle = {
        seccion: seccionLlamada(valor(i, 'una sección')),
        clave: valor(i + 1, 'una clave'),
      };
      i += 2;
    } else {
      throw new Error(
        `no entiendo «${a}»: uso, huella.ts [--solo s1,s2] [--guardar f.json] [--comparar f.json] [--detalle <sección> <clave>] [--claves <sección>]`,
      );
    }
  }
  if ((detalle !== null || claves !== null) && (guardar !== null || comparar !== null)) {
    throw new Error('--detalle y --claves imprimen y nada más: van sin --guardar ni --comparar');
  }
  if (detalle !== null && claves !== null) throw new Error('--detalle o --claves, no los dos');
  return { solo, guardar, comparar, detalle, claves };
}

function leerGuardada(fichero: string): HuellaGuardada {
  if (!existsSync(fichero)) throw new Error(`no existe la huella guardada ${fichero}`);
  const h = JSON.parse(readFileSync(fichero, 'utf8')) as HuellaGuardada;
  if (h.version !== VERSION) {
    throw new Error(
      `la huella de ${fichero} es de la versión ${h.version} y esta orden escribe la ${VERSION}: tómala otra vez`,
    );
  }
  return h;
}

/** El commit de la huella: `HEAD`, con «+cambios» si el árbol no está limpio. */
function commitDeAhora(): string {
  const git = (...a: string[]) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8' }).trim();
  return `${git('rev-parse', 'HEAD')}${git('status', '--porcelain') === '' ? '' : '+cambios'}`;
}

/**
 * Calla la consola mientras corre una sección: el director escribe cada nota y el
 * escenógrafo avisa de lo que no encuentra, y eso no es la huella. `console.error`
 * sigue saliendo: un fallo de verdad se ve.
 */
async function callando<T>(fn: () => Promise<T>): Promise<T> {
  const antes = { log: console.log, info: console.info, warn: console.warn, debug: console.debug };
  const nada = () => {};
  Object.assign(console, { log: nada, info: nada, warn: nada, debug: nada });
  try {
    return await fn();
  } finally {
    Object.assign(console, antes);
  }
}

async function medirSeccion(s: Seccion): Promise<HuellaDeSeccion & { readonly ms: number }> {
  const t0 = performance.now();
  const total = createHash('sha256');
  const porPieza: Record<string, string> = {};
  let piezas = 0;
  await callando(async () => {
    for await (const p of s.piezas()) {
      if (Object.hasOwn(porPieza, p.clave)) {
        throw new Error(`la sección ${s.nombre} da dos piezas con la clave «${p.clave}»`);
      }
      total.update(p.texto);
      total.update('\n');
      porPieza[p.clave] = sha256(p.texto);
      piezas++;
    }
  });
  return { sha: total.digest('hex'), piezas, porPieza, ms: performance.now() - t0 };
}

/** Lo que difiere entre dos huellas de una sección, en una línea; `null` si nada. */
function diferencias(
  nombre: string,
  antes: HuellaDeSeccion,
  ahora: HuellaDeSeccion,
): string | null {
  if (antes.sha === ahora.sha) return null;
  const distintas: string[] = [];
  const faltan: string[] = [];
  for (const [clave, sha] of Object.entries(antes.porPieza)) {
    const nuevo = ahora.porPieza[clave];
    if (nuevo === undefined) faltan.push(clave);
    else if (nuevo !== sha) distintas.push(clave);
  }
  const nuevas = Object.keys(ahora.porPieza).filter((c) => !Object.hasOwn(antes.porPieza, c));
  const lista = (xs: readonly string[]) =>
    xs.length <= 8 ? xs.join(', ') : `${xs.slice(0, 8).join(', ')}… (${xs.length})`;
  const partes = [
    distintas.length > 0 ? `${distintas.length} distintas: ${lista(distintas)}` : '',
    faltan.length > 0 ? `${faltan.length} que ya no salen: ${lista(faltan)}` : '',
    nuevas.length > 0 ? `${nuevas.length} nuevas: ${lista(nuevas)}` : '',
  ].filter((x) => x !== '');
  // Mismas piezas y mismos sha de cada una con otro sha de la sección: solo puede
  // ser el orden.
  if (partes.length === 0) partes.push('las mismas piezas en otro orden');
  return `${nombre}: ${partes.join('; ')}`;
}

async function main(): Promise<void> {
  const orden = leerOrden(process.argv.slice(2));

  if (orden.claves !== null) {
    const s = orden.claves;
    await callando(async () => {
      for await (const p of s.piezas()) process.stdout.write(`${p.clave}\n`);
    });
    return;
  }

  if (orden.detalle !== null) {
    const { seccion, clave } = orden.detalle;
    const pieza = await callando(async () => {
      for await (const p of seccion.piezas()) if (p.clave === clave) return p;
      return null;
    });
    if (pieza === null)
      throw new Error(`la sección ${seccion.nombre} no tiene la pieza «${clave}»`);
    process.stdout.write(`${pieza.detalle?.() ?? pieza.texto}\n`);
    return;
  }

  const guardada = orden.comparar === null ? null : leerGuardada(orden.comparar);
  if (guardada !== null) console.log(`comparando con ${orden.comparar} (${guardada.commit})`);
  const secciones: Record<string, HuellaDeSeccion> = {};
  const distintas: string[] = [];
  const t0 = performance.now();
  for (const s of orden.solo) {
    const h = await medirSeccion(s);
    secciones[s.nombre] = { sha: h.sha, piezas: h.piezas, porPieza: h.porPieza };
    const antes = guardada?.secciones[s.nombre];
    const veredicto =
      guardada === null
        ? ''
        : antes === undefined
          ? '  (no está en la guardada)'
          : antes.sha === h.sha
            ? '  igual'
            : '  DISTINTA';
    console.log(
      `${s.nombre.padEnd(9)} ${String(h.piezas).padStart(5)}  ${h.sha}  ${(h.ms / 1000).toFixed(1).padStart(6)} s${veredicto}`,
    );
    if (antes !== undefined) {
      const d = diferencias(s.nombre, antes, h);
      if (d !== null) distintas.push(d);
    }
  }
  console.log(`total: ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  // Guardar encima de la que se compara solo si salió igual: si no, la línea de base
  // se perdería justo cuando hace falta para ver qué cambió.
  const pisaLaBase =
    orden.guardar !== null &&
    orden.comparar !== null &&
    resolve(orden.guardar) === resolve(orden.comparar) &&
    distintas.length > 0;
  if (orden.guardar !== null && pisaLaBase) {
    console.error(`no se guarda en ${orden.guardar}: es la que se compara y ha salido distinta`);
  } else if (orden.guardar !== null) {
    const h: HuellaGuardada = { version: VERSION, commit: commitDeAhora(), secciones };
    writeFileSync(orden.guardar, `${JSON.stringify(h, null, 1)}\n`);
    console.log(`guardada en ${orden.guardar}`);
  }
  if (distintas.length > 0) {
    process.exitCode = 1;
    console.error('');
    console.error(`LA HUELLA HA CAMBIADO en ${distintas.length} secciones:`);
    for (const d of distintas) console.error(`  ${d}`);
    console.error(
      '  Para ver qué: --detalle <sección> <clave> aquí y en el commit de la guardada,',
    );
    console.error('  y diff de las dos salidas.');
  }
}

await main();
