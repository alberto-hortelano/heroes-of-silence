/**
 * Juega el cliente en un navegador de verdad, con clics de ratón sobre el
 * lienzo, y saca las capturas que se le enseñan al usuario.
 *
 *     pnpm capturas [carpeta]          # por defecto, .cache/capturas (ignorada por git)
 *     CAPTURAS_SOLO=emboscada,veteranos pnpm capturas   # solo esas pasadas
 *
 * Existe porque la extensión del navegador no servía para esto: los eventos
 * sintéticos sobre el canvas no llegaban, daba tiempos de espera y capturas en
 * mosaico. Aquí todo es Playwright y ratón real (`page.mouse`).
 *
 * **Cómo sabe dónde pulsar.** El lienzo no tiene DOM por casilla, así que el
 * guion lleva un ESPEJO: una `Session` con la misma semilla, a la que se le
 * aplica cada gesto que se hace en la página. La sesión es determinista —toda
 * tirada pasa por `createRng`—, así que espejo y página juegan la misma partida,
 * y las coordenadas salen de las mismas funciones puras que usa el cliente
 * (`camara-mapa`, `proyeccion`, `town`). Después de cada paso se compara el día
 * y el oro que enseña la barra con los del espejo: si se separan, el guion lo
 * dice y sale 1, en vez de seguir pulsando a ciegas.
 *
 * Arranca su propio vite en un puerto que elige el sistema, en su propio grupo
 * de procesos, y lo mata al salir aunque algo falle. Recoge la consola: un error
 * o una excepción en la página es un fallo y sale 1.
 *
 * No entra en `pnpm verify`: tarda minutos.
 */

import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { type Browser, chromium, type Page } from 'playwright';
import { registrarUnidad } from '../../../src/client/render/figuras/personajes.js';
import { hojasDelTaller } from '../../arena/borrador.js';
import { arrancarVite, chromiumInstalado } from '../../comun/navegador.js';
import { matarGrupo } from '../../comun/procesos.js';
import { conLosCatalogosDevueltos } from './arena.js';
import { DESTINO, log, type Problemas } from './pagina.js';
import { arena } from './pasadas/arena.js';
import { armasEnLaArena } from './pasadas/armas.js';
import { arranque } from './pasadas/arranque.js';
import { baseAVariosAnchos } from './pasadas/base-anchos.js';
import { contrincantesDeLaRueda } from './pasadas/contrincantes.js';
import { edicionDeLaArena } from './pasadas/edicion.js';
import { emboscadaAvisada } from './pasadas/emboscada.js';
import { equipoDeLaArena } from './pasadas/equipo.js';
import { jugarEscritorio } from './pasadas/escritorio.js';
import { espectador } from './pasadas/espectador.js';
import { montajeAVariosAnchos } from './pasadas/montaje-anchos.js';
import { moradaEnEscena } from './pasadas/morada.js';
import { jugarMovil } from './pasadas/movil.js';
import { batallaPerdida } from './pasadas/perdida.js';
import { poderesEnLaArena } from './pasadas/poderes.js';
import { ruedaEnLaArena } from './pasadas/rueda.js';
import { sinArte } from './pasadas/sin-arte.js';
import { jugarTactil } from './pasadas/tactil.js';
import { tropaEnEscena } from './pasadas/tropa.js';
import { veteranos } from './pasadas/veteranos.js';

// ------------------------------------------------------------------------ main

type Paso = (browser: Browser, url: string, problemas: Problemas) => Promise<void>;

/** Las pasadas, en el orden en que se juegan. Los nombres son los de `CAPTURAS_SOLO`. */
const PASADAS: readonly (readonly [string, Paso])[] = [
  ['arranque', arranque],
  ['escritorio', jugarEscritorio],
  ['emboscada', emboscadaAvisada],
  ['perdida', batallaPerdida],
  ['veteranos', veteranos],
  ['movil', jugarMovil],
  ['tactil', jugarTactil],
  ['sin-arte', sinArte],
  ['tropa', tropaEnEscena],
  ['morada', moradaEnEscena],
  ['base-anchos', baseAVariosAnchos],
  ['espectador', espectador],
  ['arena', arena],
  ['montaje-anchos', montajeAVariosAnchos],
  ['edicion', (b, u, p) => conLosCatalogosDevueltos('edicion', () => edicionDeLaArena(b, u, p))],
  ['equipo', (b, u, p) => conLosCatalogosDevueltos('equipo', () => equipoDeLaArena(b, u, p))],
  ['poderes', poderesEnLaArena],
  ['rueda-del-golpe', ruedaEnLaArena],
  ['armas', armasEnLaArena],
  ['rueda-contrincantes', contrincantesDeLaRueda],
];

/**
 * `CAPTURAS_SOLO=emboscada,veteranos pnpm capturas` juega solo esas pasadas:
 * para arreglar una sin esperar los tres minutos de todas. Un nombre que no es
 * de ninguna pasada se rechaza diciéndolo; vacía o sin poner, se juegan todas.
 * La pasada de cierre es siempre la entera.
 */
function pasadasPedidas(): readonly (readonly [string, Paso])[] {
  const solo = (process.env.CAPTURAS_SOLO ?? '').trim();
  if (solo === '') return PASADAS;
  const pedidas = solo.split(',').map((n) => n.trim());
  const desconocidas = pedidas.filter((n) => !PASADAS.some(([nombre]) => nombre === n));
  if (desconocidas.length > 0) {
    throw new Error(
      `CAPTURAS_SOLO: no hay ninguna pasada «${desconocidas.join('», «')}»; las hay ${PASADAS.map(([n]) => n).join(', ')}`,
    );
  }
  return PASADAS.filter(([nombre]) => pedidas.includes(nombre));
}

/**
 * Las figuras del espejo, registradas como en la página (`registrarLasHojas`: las
 * hojas completas del taller). El espejo mide lo que dura cada jugada con el reloj
 * de su figura (`duracionDeLaJugada`), y sin registrarla una figura anda y dispara
 * con el reloj del Y Bot por defecto, que no es el que pinta la página: lo destapó
 * el aviso de `clipDelDisparo` en la arena (04-10-2026) y, desde que el juego
 * recluta las unidades de la arena (19-10-2026), el aviso de espera del móvil: el
 * arquero elfo andaba 4 casillas con su arte y el espejo contaba las del Y Bot, la
 * cola de la página iba un segundo por detrás y el guion leía la barra antes de
 * tiempo. Una vez para todas las pasadas: la partida también las pinta.
 */
function registrarLasHojasDelEspejo(): void {
  for (const h of hojasDelTaller(process.cwd())) {
    if (h.incompleta === null) registrarUnidad(h.id, h);
  }
}

/**
 * El clima, despejado en toda página de esta orden: el de la semilla anima el
 * lienzo (la lluvia, la niebla a la deriva, un rayo) y las medidas de píxeles de
 * aquí —la barra de vida, la huella del lienzo, los colores del aro— se
 * escribieron sin él. Se decide **una vez**, aquí: toda página que se abra por
 * este navegador va a la partida o al espectador con `clima=despejado,dia` (si
 * no pide otro: `despejado` solo fija el tiempo, y la noche de la semilla seguía
 * oscureciendo sus regiones), también el menú de inicio, que lo conserva al empezar
 * (`estadoDelArranque` no lo cuenta como algo que escribió la página). La arena
 * ya pelea en despejado sin él. El clima lo mira `tools/qa/navegador/clima.ts`.
 */
function conElClimaDespejado(browser: Browser): Browser {
  const despejada = (destino: string): string => {
    const u = new URL(destino);
    const esDelJuego = u.pathname === '/' || u.pathname.startsWith('/espectador');
    if (esDelJuego && !u.searchParams.has('clima')) u.searchParams.set('clima', 'despejado,dia');
    return u.toString();
  };
  const conLaPagina = (page: Page): Page => {
    const ir = page.goto.bind(page);
    page.goto = (destino, opciones) => ir(despejada(destino), opciones);
    return page;
  };
  const nuevaPagina = browser.newPage.bind(browser);
  browser.newPage = async (opciones) => conLaPagina(await nuevaPagina(opciones));
  const nuevoContexto = browser.newContext.bind(browser);
  browser.newContext = async (opciones) => {
    const contexto = await nuevoContexto(opciones);
    const nueva = contexto.newPage.bind(contexto);
    contexto.newPage = async () => conLaPagina(await nueva());
    return contexto;
  };
  return browser;
}

async function main(): Promise<void> {
  // Antes de arrancar nada: un nombre mal escrito no merece un vite.
  const pasadas = pasadasPedidas();
  registrarLasHojasDelEspejo();
  mkdirSync(DESTINO, { recursive: true });
  const inicio = Date.now();
  const problemas: Problemas = { lista: [] };
  let vite: ChildProcess | null = null;
  let browser: Browser | null = null;
  const limpiar = (): void => matarGrupo(vite, log);
  process.on('SIGINT', () => {
    limpiar();
    process.exit(130);
  });
  try {
    const arrancado = await arrancarVite();
    vite = arrancado.proceso;
    log(`vite en ${arrancado.url} (grupo ${vite.pid})`);
    const ejecutable = chromiumInstalado(log);
    browser = conElClimaDespejado(
      await chromium.launch(ejecutable === undefined ? {} : { executablePath: ejecutable }),
    );
    for (const [nombre, pasada] of pasadas) {
      log(`pasada «${nombre}»`);
      await pasada(browser, arrancado.url, problemas);
    }
  } finally {
    await browser?.close();
    limpiar();
  }
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  if (problemas.lista.length > 0) {
    console.error(`\x1b[31m[capturas] ${problemas.lista.length} problema(s) en la página:\x1b[0m`);
    for (const p of problemas.lista) console.error(`  - ${p}`);
    console.error(`[capturas] ${segundos} s`);
    process.exit(1);
  }
  log(`sin errores en consola; capturas en ${DESTINO}; ${segundos} s`);
}

main().catch((err) => {
  console.error(`\x1b[31m[capturas] ${err instanceof Error ? err.stack : err}\x1b[0m`);
  process.exit(1);
});
