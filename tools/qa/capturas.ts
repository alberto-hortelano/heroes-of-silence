/**
 * Juega el cliente en un navegador de verdad, con clics de ratón sobre el
 * lienzo, y saca las capturas que se le enseñan al usuario.
 *
 *     pnpm capturas [carpeta]          # por defecto, la del ciclo del cliente nuevo
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
 * No entra en `pnpm verify`: tarda decenas de segundos (ver `implementacion.md`).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Browser, chromium, type Page } from 'playwright';
import WebSocket from 'ws';
import { DURACION } from '../../src/client/anim.js';
import { focoDe } from '../../src/client/escenas/aventura.js';
import { AVISO_DE_ESPERA, accionContra, EscenaBatalla } from '../../src/client/escenas/batalla.js';
import { cajaDeFigura } from '../../src/client/render/batalla.js';
import {
  casillaAPixel,
  centrarEn,
  type Encuadre,
  TILE_INICIAL,
  zoom,
} from '../../src/client/render/camara-mapa.js';
import { centroDeStack, centroHex, tableroPara } from '../../src/client/render/proyeccion.js';
import { botonDeRecluta, townLayout, townPlots } from '../../src/client/render/town.js';
import { Session } from '../../src/client/session.js';
import { rotuloDeDia } from '../../src/client/views/panels.js';
import { chooseBattleAction } from '../../src/core/ai/tactics.js';
import { stackHexes } from '../../src/core/battle/battle.js';
import type { BattleAction, BattleEvent, BattleStack } from '../../src/core/battle/types.js';
import type { Point } from '../../src/core/types.js';
import type {
  AgentHelloMsg,
  AgentResponseMsg,
  ServerToAgentMsg,
} from '../../src/server/protocol.js';
import { decidir } from './politica.js';
import { arrancarServidor, type ServidorDePartida } from './servidor.js';

const SEMILLA = 2;
const DESTINO = resolve(process.argv[2] ?? 'docs/agents/2026-10-01-cliente-nuevo/capturas');

/** Los códigos de color ANSI; escritos con `fromCharCode` porque Biome no deja un ESC literal en una regex. */
const COLORES_DE_TERMINAL = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function log(msg: string): void {
  console.log(`\x1b[36m[capturas]\x1b[0m ${msg}`);
}

// ------------------------------------------------------------------ navegador

/**
 * El Chromium que haya. Playwright pide una revisión concreta y la descarga si
 * falta; aquí no se descarga nada: si la suya no está, se usa la más reciente
 * de las que ya hay en su caché, y se dice cuál.
 */
function chromiumInstalado(): string | undefined {
  const propio = chromium.executablePath();
  if (existsSync(propio)) return undefined;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const candidatos = existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
        .map((d) => join(cache, d, 'chrome-linux64', 'chrome'))
        .filter((p) => existsSync(p))
    : [];
  const elegido = candidatos[0];
  if (elegido === undefined) {
    throw new Error(
      `no hay ningún Chromium de Playwright en ${cache}: instálalo con \`npx playwright install chromium\``,
    );
  }
  log(`Playwright pide ${propio}; uso el que hay: ${elegido}`);
  return elegido;
}

// ----------------------------------------------------------------------- vite

/**
 * Un puerto libre, preguntándoselo al sistema. `vite --port 0` NO es un puerto
 * efímero: vite toma el 0 por «no me lo han dicho» y abre el 5173 —se vio al
 * correrlo—, que choca con el vite de cualquier otro proyecto de la máquina.
 */
async function puertoLibre(): Promise<number> {
  return await new Promise((ok, mal) => {
    const srv = createServer();
    srv.once('error', mal);
    srv.listen(0, '127.0.0.1', () => {
      const dir = srv.address();
      srv.close(() =>
        typeof dir === 'object' && dir !== null ? ok(dir.port) : mal(new Error('sin puerto')),
      );
    });
  });
}

/** Vite en un puerto libre y en su propio grupo, para poder matarlo entero. */
async function arrancarVite(): Promise<{ proceso: ChildProcess; url: string }> {
  const puerto = await puertoLibre();
  const proceso = spawn('node_modules/.bin/vite', ['--port', String(puerto), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let salida = '';
  const url = await new Promise<string>((ok, mal) => {
    const plazo = setTimeout(
      () => mal(new Error(`vite no anunció su dirección en 15 s. Salida:\n${salida}`)),
      15_000,
    );
    const leer = (trozo: Buffer): void => {
      // Sin los códigos de color: vite pinta el puerto en negrita.
      salida += trozo.toString().replace(COLORES_DE_TERMINAL, '');
      const m = /Local:\s+(http:\/\/\S+)/.exec(salida);
      if (m?.[1] !== undefined) {
        clearTimeout(plazo);
        ok(m[1].replace(/\/$/, ''));
      }
    };
    proceso.stdout?.on('data', leer);
    proceso.stderr?.on('data', leer);
    proceso.on('exit', (code) => {
      clearTimeout(plazo);
      mal(new Error(`vite salió con ${code} antes de arrancar. Salida:\n${salida}`));
    });
  });
  return { proceso, url };
}

function matarGrupo(p: ChildProcess | null): void {
  if (p?.pid === undefined || p.exitCode !== null) return;
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch (err) {
    // El grupo ya no existe: se dice, no se calla, pero no es un fallo del guion.
    log(`el grupo ya había terminado: ${err instanceof Error ? err.message : err}`);
  }
}

// ------------------------------------------------------------------- la página

interface Problemas {
  readonly lista: string[];
}

/**
 * Todo error de consola es un problema, salvo los que el guion provoca a
 * propósito (`esperados`): en la pasada sin arte se le niegan las imágenes al
 * navegador, y ese 404 es la prueba, no un fallo. Se filtra por la URL, que
 * sale en la ubicación del mensaje, para no tapar ningún otro 404.
 */
function vigilarConsola(
  page: Page,
  nombre: string,
  problemas: Problemas,
  esperados?: RegExp,
): void {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (esperados?.test(m.location().url) === true) return;
    problemas.lista.push(`[${nombre}] consola: ${m.text()} (${m.location().url})`);
  });
  page.on('pageerror', (e) => problemas.lista.push(`[${nombre}] excepción: ${e.message}`));
}

async function captura(page: Page, nombre: string): Promise<void> {
  const ruta = join(DESTINO, `${nombre}.png`);
  await page.screenshot({ path: ruta });
  log(`captura ${nombre}.png`);
}

async function caja(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await page.locator('#canvas').boundingBox();
  if (b === null) throw new Error('el lienzo no está en la página');
  return b;
}

/** Comprueba que la página y el espejo juegan la misma partida. */
async function comprobar(page: Page, espejo: Session, paso: string): Promise<void> {
  const oro = await page.locator('#resources li[title="Oro"]').innerText();
  const dia = await page.locator('#day').innerText();
  const esperadoDia = rotuloDeDia(espejo.state.day);
  // En el mapa, además, el movimiento que le queda al héroe: es lo que se separa
  // si un clic cae en otra casilla que la que el espejo cree.
  if (espejo.scene === 'adventure' && espejo.selectedHero !== null) {
    const h = espejo.selectedHero;
    const fila = page.locator('#side .row', { hasText: 'Movimiento' });
    const mov = (await fila.count()) > 0 ? (await fila.innerText()).replace(/\s+/g, ' ') : '';
    if (!mov.includes(`${h.movePoints} /`)) {
      throw new Error(
        `tras «${paso}» el héroe de la página no está donde el del espejo: la página dice «${mov}» y el espejo ${h.movePoints} en (${h.at.x},${h.at.y})`,
      );
    }
  }
  if (oro.trim() !== String(espejo.resources.gold) || dia.trim() !== esperadoDia) {
    throw new Error(
      `tras «${paso}» la página y el espejo se han separado: la página dice ${dia} y ${oro} de oro; ` +
        `el espejo, ${esperadoDia} y ${espejo.resources.gold}`,
    );
  }
}

/** Espera a que la batalla acabe de contarse: lo que tarda la cola de lo que se acaba de jugar. */
async function esperarCola(nuevos: readonly BattleEvent[]): Promise<void> {
  let ms = 250;
  for (const e of nuevos) {
    if (e.kind in DURACION) ms += DURACION[e.kind as keyof typeof DURACION];
  }
  await sleep(ms);
}

/**
 * «Fin de turno» en la página y en el espejo, y espera a que la página enseñe el
 * día al que ha llegado el espejo con el turno ya devuelto.
 *
 * Esperar solo a «Tu turno» era una carrera: `waitForFunction` mira una vez en
 * el acto, antes del primer fotograma tras el clic, y la barra todavía decía el
 * «Tu turno» del día anterior. Se comparaba entonces el oro de ayer con el de
 * hoy. Pasaba una vez de cada tres desde que los paneles se rehacen al cambiar
 * la partida y no en cada fotograma; con el día en la condición no puede pasar.
 */
async function pasarDia(page: Page, espejo: Session): Promise<void> {
  await page.getByRole('button', { name: 'Fin de turno' }).click();
  await espejo.endTurn();
  const dia = rotuloDeDia(espejo.state.day);
  await page.waitForFunction((esperado) => {
    const turno = document.getElementById('turn')?.textContent ?? '';
    const hoy = document.getElementById('day')?.textContent ?? '';
    return turno.startsWith('Partida') || (turno === 'Tu turno' && hoy === esperado);
  }, dia);
}

// ------------------------------------------------------------ el mapa en píxeles

class Mapa {
  private tile = TILE_INICIAL;
  constructor(
    private readonly page: Page,
    private readonly espejo: Session,
  ) {}

  private async encuadre(): Promise<{ b: { x: number; y: number }; e: Encuadre }> {
    const b = await caja(this.page);
    const { width, height } = this.espejo.state.map;
    return { b, e: { ancho: b.width, alto: b.height, mapaAncho: width, mapaAlto: height } };
  }

  /** Dónde cae en la página el centro de una casilla, con la cámara centrada en el héroe. */
  async pixel(p: Point): Promise<{ x: number; y: number }> {
    const { b, e } = await this.encuadre();
    const camara = centrarEn({ tile: this.tile, x: 0, y: 0 }, focoDe(this.espejo), e);
    const c = casillaAPixel(camara, p);
    return { x: b.x + c.x, y: b.y + c.y };
  }

  /**
   * Un paso de rueda sobre el centro del lienzo, en la página y en la cuenta de
   * aquí: el zoom lo calcula la MISMA función que el cliente, topes incluidos.
   */
  async rueda(direccion: 1 | -1): Promise<void> {
    const { b, e } = await this.encuadre();
    await this.page.mouse.move(b.x + e.ancho / 2, b.y + e.alto / 2);
    await this.page.mouse.wheel(0, direccion === 1 ? -200 : 200);
    this.tile = zoom({ tile: this.tile, x: 0, y: 0 }, direccion, e).tile;
    await sleep(100);
  }

  async pulsar(p: Point): Promise<void> {
    const px = await this.pixel(p);
    await this.page.mouse.click(px.x, px.y);
    this.espejo.clickTile(p);
    await sleep(250);
  }
}

// --------------------------------------------------------- la batalla en píxeles

/**
 * Lleva el marco del lienzo hasta `xEnLienzo` si el tablero es más ancho que la
 * pantalla (el móvil), y devuelve la caja del lienzo después de desplazarlo.
 */
async function alcanzar(
  page: Page,
  xEnLienzo: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await page.evaluate((x) => {
    const l = document.getElementById('lienzo');
    if (l !== null && l.scrollWidth > l.clientWidth) {
      const visible = x - l.scrollLeft;
      if (visible < 30 || visible > l.clientWidth - 30) l.scrollLeft = x - l.clientWidth / 2;
    }
  }, xEnLienzo);
  return await caja(page);
}

/**
 * Dónde pulsar una unidad: un punto de su cuerpo que el cliente lea como ESA
 * unidad. Lo decide una escena de batalla sobre el espejo —la misma clase que en
 * la página—, porque el centro de un hex al que se puede ir gana a la figura que
 * lo tapa, y el medio del cuerpo puede caer justo ahí.
 */
async function pixelDeUnidad(
  page: Page,
  espejo: Session,
  s: BattleStack,
): Promise<{ x: number; y: number }> {
  const b0 = await caja(page);
  const t0 = tableroPara(b0.width, b0.height);
  const b = await alcanzar(page, centroHex(t0, s.hex).x);
  const c = cajaDeFigura(tableroPara(b.width, b.height), s, centroDeStack(stackHexes(s)));
  const escena = new EscenaBatalla(() => espejo);
  escena.sincronizar(Number.MAX_SAFE_INTEGER);
  escena.encuadrar(b.width, b.height);
  for (const alto of [0.5, 0.35, 0.65, 0.8, 0.2]) {
    const y = c.suelo - c.alto * alto;
    if (escena.objetivoEn(c.x, y)?.id === s.id) return { x: b.x + c.x, y: b.y + y };
  }
  throw new Error(`no hay un punto del cuerpo de ${s.id} que el clic lea como suyo`);
}

/** Juega un turno de la persona en la batalla con un clic, y lo replica en el espejo. */
async function turnoDeBatalla(page: Page, espejo: Session, n: number): Promise<void> {
  const battle = espejo.battle;
  if (battle === null) throw new Error('no hay batalla en el espejo');
  const antes = battle.log.length;
  const acciones = espejo.battleLegalActions();

  // Las cuatro primeras, a propósito: esperar, defender, un hechizo y lo que toque.
  const hechizo = espejo.spellOptions().find((o) => o.castable);
  if (n === 0 && acciones.some((a) => a.type === 'wait')) {
    await page.getByRole('button', { name: 'Esperar' }).click();
    espejo.playBattleAction({ type: 'wait' });
  } else if (n === 1) {
    await page.getByRole('button', { name: 'Defender' }).click();
    espejo.playBattleAction({ type: 'defend' });
  } else if (n === 2 && hechizo !== undefined) {
    const objetivoId = hechizo.targets[0] as string;
    await page.getByRole('button', { name: new RegExp(hechizo.name) }).click();
    espejo.selectSpell(hechizo.id);
    await sleep(200);
    await captura(page, 'desktop-06-batalla-apuntando-hechizo');
    const objetivo = battle.stacks.find((s) => s.id === objetivoId) as BattleStack;
    const px = await pixelDeUnidad(page, espejo, objetivo);
    await page.mouse.click(px.x, px.y);
    const cast = acciones.find(
      (a) => a.type === 'cast' && a.spell === hechizo.id && a.target === objetivoId,
    ) as BattleAction;
    espejo.playBattleAction(cast);
  } else {
    const ia = chooseBattleAction(battle);
    const objetivo =
      ia.type === 'attack' || ia.type === 'shoot'
        ? battle.stacks.find((s) => s.id === ia.target)
        : undefined;
    if (objetivo !== undefined) {
      // La acción que el cliente emitirá al pulsar ese objetivo: el espejo tiene
      // que aplicar ESA, no la que eligió la IA.
      const accion = accionContra(acciones, objetivo.id) as BattleAction;
      const px = await pixelDeUnidad(page, espejo, objetivo);
      await page.mouse.click(px.x, px.y);
      espejo.playBattleAction(accion);
    } else if (ia.type === 'move') {
      const b0 = await caja(page);
      const c = centroHex(tableroPara(b0.width, b0.height), ia.to);
      const b = await alcanzar(page, c.x);
      await page.mouse.click(b.x + c.x, b.y + c.y);
      espejo.playBattleAction(ia);
    } else {
      const boton = ia.type === 'wait' ? 'Esperar' : 'Defender';
      await page.getByRole('button', { name: boton }).click();
      espejo.playBattleAction(ia);
    }
  }
  const nuevos = battle.log.slice(antes);
  if (n === 3 && nuevos.some((e) => e.kind in DURACION)) {
    await avisoQueSeRetira(page, nuevos);
    return;
  }
  await esperarCola(nuevos);
}

/**
 * Pulsa el lienzo mientras la jugada se cuenta: la barra tiene que decir que se
 * espere, y en cuanto la cola se vacía tiene que dejar de decirlo. Antes el
 * aviso se quedaba hasta el siguiente gesto.
 */
async function avisoQueSeRetira(page: Page, nuevos: readonly BattleEvent[]): Promise<void> {
  const marco = await page.locator('#lienzo').boundingBox();
  if (marco === null) throw new Error('el marco del lienzo no está en la página');
  // Una esquina de arriba: cielo, ni hex ni figura.
  await page.mouse.click(marco.x + 14, marco.y + 14);
  // La barra se copia de la sesión en el siguiente fotograma, no en el clic.
  await page
    .waitForFunction(
      (aviso) => document.getElementById('status')?.textContent === aviso,
      AVISO_DE_ESPERA,
      { timeout: 300 },
    )
    .catch(() => undefined);
  const durante = await page.locator('#status').innerText();
  if (durante !== AVISO_DE_ESPERA) {
    throw new Error(
      `un clic durante la jugada debía decir «${AVISO_DE_ESPERA}» y dice «${durante}»`,
    );
  }
  await esperarCola(nuevos);
  await sleep(100);
  const despues = await page.locator('#status').innerText();
  if (despues === AVISO_DE_ESPERA) {
    throw new Error('la jugada ha terminado y la barra sigue diciendo que se espere');
  }
  log(`aviso de espera: «${durante}» durante la jugada, «${despues}» al acabar`);
}

// --------------------------------------------------------------------- partidas

interface Pasada {
  readonly nombre: string;
  readonly semilla: number;
  readonly movil?: boolean;
  /** Imágenes que se le niegan al navegador; su 404 es la prueba, no un fallo. */
  readonly sinImagenes?: RegExp;
}

/**
 * Abre una pasada: la página con su semilla, el espejo con la misma y el mapa en
 * píxeles. Las cuatro pasadas del cliente empiezan así, y escrito cuatro veces
 * ya había una que no vigilaba lo mismo que las otras.
 */
async function abrir(
  browser: Browser,
  url: string,
  problemas: Problemas,
  p: Pasada,
): Promise<{ page: Page; espejo: Session; mapa: Mapa }> {
  const page = await browser.newPage(
    p.movil === true
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }
      : { viewport: { width: 1440, height: 900 } },
  );
  vigilarConsola(page, p.nombre, problemas, p.sinImagenes);
  if (p.sinImagenes !== undefined) {
    await page.route(p.sinImagenes, (r) => r.fulfill({ status: 404, body: '' }));
  }
  const espejo = new Session(p.semilla);
  await page.goto(`${url}/?seed=${p.semilla}`, { waitUntil: 'networkidle' });
  await sleep(450);
  return { page, espejo, mapa: new Mapa(page, espejo) };
}

async function jugarEscritorio(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'escritorio',
    semilla: SEMILLA,
  });
  await comprobar(page, espejo, 'abrir la partida');
  await captura(page, 'desktop-01-mapa-dia-1');

  // Pulsar la casilla del propio héroe: decía «No hay camino hasta ahí.».
  const propio = espejo.selectedHero!;
  if (!espejo.myTowns().some((t) => t.at.x === propio.at.x && t.at.y === propio.at.y)) {
    await mapa.pulsar(propio.at);
    const dice = await page.locator('#status').innerText();
    if (dice !== espejo.status || dice.includes('No hay camino')) {
      throw new Error(`pulsar al propio héroe dice «${dice}»; el espejo, «${espejo.status}»`);
    }
    log(`pulsar al propio héroe: «${dice}»`);
    await comprobar(page, espejo, 'pulsar al propio héroe');
  }

  // La ruta: hacia la otra punta, que no se anda en un día.
  const lejos = { x: 12, y: 10 };
  const px = await mapa.pixel(lejos);
  await page.mouse.move(px.x, px.y);
  await sleep(200);
  await captura(page, 'desktop-02-mapa-ruta-dorada-y-gris');

  // Zoom con la rueda y arrastre; luego «Centrar héroe» devuelve la vista.
  await mapa.rueda(1);
  await mapa.rueda(1);
  const b = await caja(page);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 220, b.y + b.height / 2 - 120, { steps: 8 });
  await page.mouse.up();
  await sleep(200);
  await captura(page, 'desktop-03-mapa-zoom-y-arrastre');
  await page.getByRole('button', { name: 'Centrar héroe' }).click();
  await sleep(200);

  // Al castillo: el héroe entra y se abre la pantalla.
  const castillo = espejo.myTowns()[0];
  if (castillo === undefined) throw new Error('el jugador no tiene castillo');
  await mapa.pulsar(castillo.at);
  if (espejo.scene !== 'town')
    throw new Error(`el espejo no ha entrado al castillo: ${espejo.status}`);
  await sleep(300);
  await captura(page, 'desktop-04-castillo');

  // «Todo» en la morada de nivel 1: pide lo que cabe, no lo que hay.
  const town = espejo.activeTown!;
  const plot = townPlots(town.faction).find((p) => p.level === 1)!;
  const bb = await caja(page);
  const t = townLayout(bb.width, bb.height);
  const boton = botonDeRecluta(plot, true);
  const enPagina = {
    x: bb.x + t.x + (boton.x + boton.w / 2) * t.scale,
    y: bb.y + t.y + (boton.y + boton.h / 2) * t.scale,
  };
  const plan = espejo.recruitPlan(`${town.faction === 'knight' ? 'peasant' : 'skeleton'}`);
  await page.mouse.move(enPagina.x, enPagina.y);
  await sleep(150);
  await captura(page, 'desktop-05-castillo-todo-es-lo-que-cabe');
  await page.mouse.click(enPagina.x, enPagina.y);
  espejo.recruitAll(town.faction === 'knight' ? 'peasant' : 'skeleton');
  log(
    `«todo» con ${plan?.disponibles} disponibles y ${plan?.caben} que caben: recluta ${plan?.maximo}`,
  );
  await sleep(200);
  await comprobar(page, espejo, 'reclutar todo');
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  espejo.closeTown();
  await sleep(200);

  // Una batalla de varios individuos por bando, jugada a clics.
  const monstruo = { x: 5, y: 2 };
  await mapa.pulsar(monstruo);
  if (espejo.battle === null)
    throw new Error(`el espejo no ha entrado en batalla: ${espejo.status}`);
  await esperarCola(espejo.battle.log);
  await captura(page, 'desktop-07-batalla-inicio');
  for (let n = 0; n < 12 && espejo.battle?.finished === null; n++) {
    await turnoDeBatalla(page, espejo, n);
    if (n === 3) await captura(page, 'desktop-08-batalla-en-curso');
  }
  if (espejo.battle !== null && espejo.battle.finished === null) {
    await page.getByRole('button', { name: 'Resolver sola' }).click();
    espejo.autoResolveBattle();
    await sleep(300);
  } else if (espejo.battle !== null) {
    await sleep(800);
    await captura(page, 'desktop-09-batalla-terminada');
    await page.getByRole('button', { name: 'Continuar' }).click();
    espejo.finishBattle();
  }
  const ganada = espejo.myHeroes().length > 0;
  log(`primera batalla: ${ganada ? 'GANADA' : 'perdida'} (${espejo.status})`);
  await sleep(300);
  await comprobar(page, espejo, 'cerrar la primera batalla');
  await captura(page, `desktop-10-mapa-tras-batalla-${ganada ? 'ganada' : 'perdida'}`);

  // Una segunda batalla, resuelta sola: la de la otra guardia cercana.
  const otra = espejo.state.map.objects.find(
    (o) => o.kind === 'monster' && !o.defeated && o.at.x === 8 && o.at.y === 3,
  );
  if (otra !== undefined && espejo.selectedHero !== null) {
    await pasarDia(page, espejo);
    await comprobar(page, espejo, 'pasar al día 2');
    await mapa.pulsar(otra.at);
    if (espejo.battle !== null) {
      await esperarCola(espejo.battle.log);
      await page.getByRole('button', { name: 'Resolver sola' }).click();
      espejo.autoResolveBattle();
      await sleep(300);
      log(
        `segunda batalla: ${espejo.myHeroes().length > 0 ? 'GANADA' : 'perdida'} (${espejo.status})`,
      );
      await captura(page, 'desktop-11-mapa-tras-segunda-batalla');
    }
  }

  // Dos Espacios seguidos pasan UN día: el segundo cae en el cambio de día.
  // (`tsc` cree que la escena sigue siendo la del castillo de arriba: las
  // batallas de en medio la cambian por dentro de la sesión.)
  const escena: string = espejo.scene;
  if (espejo.state.finished === null && escena === 'adventure') {
    await page.locator('#canvas').focus();
    await page.keyboard.press(' ');
    await page.keyboard.press(' ');
    await espejo.endTurn();
    const dia = rotuloDeDia(espejo.state.day);
    await page.waitForFunction((esperado) => {
      const turno = document.getElementById('turn')?.textContent ?? '';
      const hoy = document.getElementById('day')?.textContent ?? '';
      return turno.startsWith('Partida') || (turno === 'Tu turno' && hoy === esperado);
    }, dia);
    await sleep(900);
    await comprobar(page, espejo, 'dos Espacios seguidos');
    log(
      `dos Espacios seguidos: la página está en «${await page.locator('#day').innerText()}», como el espejo`,
    );
  }

  // Pasar días hasta que la partida se acabe.
  for (let d = 0; d < 60 && espejo.state.finished === null; d++) {
    await pasarDia(page, espejo);
    await comprobar(page, espejo, `pasar al día ${espejo.state.day}`);
  }
  await sleep(300);
  const turno = await page.locator('#turn').innerText();
  log(
    `fin: día ${espejo.state.day}, la barra dice «${turno}», el espejo ${espejo.desenlace ?? 'sigue'}`,
  );
  await captura(page, 'desktop-12-fin-de-partida');
  await page.close();
}

async function jugarMovil(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'móvil',
    semilla: SEMILLA,
    movil: true,
  });
  await captura(page, 'movil-01-mapa');
  await mapa.pulsar(espejo.myTowns()[0]!.at);
  await sleep(300);
  await captura(page, 'movil-02-castillo');
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  espejo.closeTown();
  await sleep(200);
  await comprobar(page, espejo, 'móvil: volver del castillo');
  await mapa.pulsar({ x: 5, y: 2 });
  if (espejo.battle === null)
    throw new Error(`móvil: el espejo no ha entrado en batalla: ${espejo.status}`);
  await esperarCola(espejo.battle.log);
  await captura(page, 'movil-03-batalla');
  // El tablero es más ancho que la pantalla: se desplaza en horizontal.
  const desplazable = await page.evaluate(() => {
    const l = document.getElementById('lienzo');
    return l === null ? null : { ancho: l.scrollWidth, visible: l.clientWidth, x: l.scrollLeft };
  });
  log(
    `móvil: tablero de ${desplazable?.ancho} px en un marco de ${desplazable?.visible}, desplazado a ${desplazable?.x}`,
  );
  for (let n = 3; n < 6 && espejo.battle?.finished === null; n++) {
    await turnoDeBatalla(page, espejo, n);
  }
  await captura(page, 'movil-04-batalla-jugada');
  await page.close();
}

/**
 * La pasada con el dedo: un contexto táctil de verdad (`hasTouch`), donde un
 * toque manda `pointerdown`, `pointerup` y —siempre— `pointerleave`. Las otras
 * pasadas pulsan como ratón y por eso no vieron que la ruta del primer toque no
 * se pintaba nunca: el `pointerleave` la borraba.
 *
 * Comprueba en el lienzo que el primer toque dibuja la ruta (los píxeles de un
 * paso intermedio cambian) y que el segundo la anda; y en la batalla, que la
 * pista del borde dice dónde está el enemigo, que pulsarla lleva el marco allí
 * y que la barra de abajo no tapa los hechizos.
 */
async function jugarTactil(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await contexto.newPage();
  vigilarConsola(page, 'táctil', problemas);
  const espejo = new Session(SEMILLA);
  await page.goto(`${url}/?seed=${SEMILLA}`, { waitUntil: 'networkidle' });
  await sleep(450);
  const mapa = new Mapa(page, espejo);

  // El destino más lejano que se alcance hoy y se vea entero en el lienzo, con
  // tres pasos o más: hace falta uno intermedio, lejos del héroe y del destino.
  const b = await caja(page);
  const desde = espejo.selectedHero!.at;
  let destino: Point | null = null;
  let mejor = 2;
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const p = { x: desde.x + dx, y: desde.y + dy };
      const r = espejo.previewPath(p);
      if (r.length <= mejor || !r.every((paso) => paso.hoy)) continue;
      const enPagina = await mapa.pixel(p);
      const dentro =
        enPagina.x > b.x + 30 &&
        enPagina.x < b.x + b.width - 30 &&
        enPagina.y > b.y + 30 &&
        enPagina.y < b.y + b.height - 30;
      if (dentro) {
        destino = p;
        mejor = r.length;
      }
    }
  }
  if (destino === null) {
    throw new Error('táctil: no hay a la vista un destino de hoy a tres pasos o más');
  }
  const ruta = espejo.previewPath(destino);
  const medio = ruta[Math.floor((ruta.length - 1) / 2)] as (typeof ruta)[number];
  const enMedio = await mapa.pixel(medio.at);
  const antes = await pixelesDelLienzo(page, enMedio.x - b.x, enMedio.y - b.y);
  const px = await mapa.pixel(destino);
  await page.touchscreen.tap(px.x, px.y);
  await sleep(300);
  const despues = await pixelesDelLienzo(page, enMedio.x - b.x, enMedio.y - b.y);
  const cambio = antes.reduce((t, v, i) => t + Math.abs(v - (despues[i] ?? 0)), 0);
  const dice = await page.locator('#status').innerText();
  log(`táctil: primer toque → «${dice}»; el paso (${medio.at.x},${medio.at.y}) cambia ${cambio}`);
  if (!dice.includes('Toca otra vez')) throw new Error(`táctil: el primer toque dice «${dice}»`);
  if (cambio < 2000) {
    throw new Error(
      `táctil: tras el primer toque la ruta no se ha pintado (el paso intermedio cambia ${cambio})`,
    );
  }
  await captura(page, 'tactil-01-ruta-tras-el-primer-toque');
  await page.touchscreen.tap(px.x, px.y);
  espejo.clickTile(destino);
  await sleep(300);
  await comprobar(page, espejo, 'táctil: segundo toque');
  log(
    `táctil: el segundo toque anda hasta (${espejo.selectedHero?.at.x},${espejo.selectedHero?.at.y})`,
  );

  // A la batalla de la semilla, desde el principio otra vez (el héroe ya ha
  // andado), con dos toques: el primero enseña, el segundo va.
  await page.goto(`${url}/?seed=${SEMILLA}`, { waitUntil: 'networkidle' });
  await sleep(450);
  const otra = new Session(SEMILLA);
  const monstruo = { x: 5, y: 2 };
  const enMonstruo = await new Mapa(page, otra).pixel(monstruo);
  await page.touchscreen.tap(enMonstruo.x, enMonstruo.y);
  await sleep(200);
  await page.touchscreen.tap(enMonstruo.x, enMonstruo.y);
  otra.clickTile(monstruo);
  if (otra.battle === null) {
    throw new Error(`táctil: el espejo no ha entrado en batalla: ${otra.status}`);
  }
  await esperarCola(otra.battle.log);
  await sleep(300);

  const pista = page.locator('#hacia-enemigo');
  if (!(await pista.isVisible()))
    throw new Error('táctil: al empezar la batalla no hay pista del enemigo');
  const texto = await pista.innerText();
  log(`táctil: pista del borde «${texto}»`);
  await captura(page, 'tactil-02-batalla-pista-del-enemigo');

  // La barra de abajo es una fila aparte: el escenario acaba donde empieza ella.
  const solape = await page.evaluate(() => {
    const escenario = document.getElementById('stage')?.getBoundingClientRect();
    const barra = document.getElementById('statusbar')?.getBoundingClientRect();
    return escenario === undefined || barra === undefined ? null : escenario.bottom - barra.top;
  });
  if (solape === null || solape > 1) {
    throw new Error(`táctil: la barra de abajo se monta ${solape} px sobre el escenario`);
  }
  const hechizo = page.locator('[data-action="battle-spell"]').first();
  await hechizo.scrollIntoViewIfNeeded();
  const tapado = await hechizo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return encima === null || !el.contains(encima) ? (encima?.id ?? encima?.tagName ?? 'nada') : '';
  });
  if (tapado !== '') throw new Error(`táctil: el hechizo lo tapa «${tapado}»`);
  await captura(page, 'tactil-03-batalla-hechizos-a-la-vista');

  // Pulsar la pista lleva el marco hasta el enemigo.
  await pista.scrollIntoViewIfNeeded();
  const x0 = await page.evaluate(() => document.getElementById('lienzo')?.scrollLeft ?? 0);
  await pista.tap();
  await sleep(900);
  const x1 = await page.evaluate(() => document.getElementById('lienzo')?.scrollLeft ?? 0);
  log(`táctil: pulsar la pista desplaza el marco de ${x0} a ${x1}`);
  if (x1 <= x0) throw new Error('táctil: pulsar la pista no ha llevado el marco hacia el enemigo');
  if (await pista.isVisible()) {
    throw new Error(
      `táctil: con el marco en el enemigo la pista sigue diciendo «${await pista.innerText()}»`,
    );
  }
  await captura(page, 'tactil-04-batalla-marco-en-el-enemigo');
  await contexto.close();
}

/** Los píxeles RGBA de un cuadrado de 9×9 del lienzo, alrededor de un punto en CSS px. */
async function pixelesDelLienzo(page: Page, x: number, y: number): Promise<number[]> {
  return await page.evaluate(
    ([cx, cy]) => {
      const lienzo = document.getElementById('canvas') as HTMLCanvasElement;
      const c = lienzo.getContext('2d');
      if (c === null) throw new Error('el lienzo no tiene contexto 2D');
      const escala = lienzo.width / lienzo.getBoundingClientRect().width;
      const d = c.getImageData(Math.round(cx * escala) - 4, Math.round(cy * escala) - 4, 9, 9).data;
      return Array.from(d);
    },
    [x, y] as const,
  );
}

/**
 * Una batalla que se pierde: la semilla 7 tiene siete esqueletos pegados al
 * héroe y, resuelta sola, la pierde (lo dice el espejo, no se supone). Se
 * captura el tablero y el mapa de después, con el héroe caído en la crónica.
 */
async function batallaPerdida(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'batalla perdida',
    semilla: 7,
  });
  const heroe = espejo.selectedHero!;
  const guardia = espejo.state.map.objects
    .filter((o) => o.kind === 'monster')
    .sort(
      (a, b) =>
        Math.max(Math.abs(a.at.x - heroe.at.x), Math.abs(a.at.y - heroe.at.y)) -
        Math.max(Math.abs(b.at.x - heroe.at.x), Math.abs(b.at.y - heroe.at.y)),
    )[0]!;
  await mapa.pulsar(guardia.at);
  if (espejo.battle === null) throw new Error(`semilla 7: no hubo batalla: ${espejo.status}`);
  await esperarCola(espejo.battle.log);
  await captura(page, 'desktop-13-batalla-que-se-pierde');
  await page.getByRole('button', { name: 'Resolver sola' }).click();
  espejo.autoResolveBattle();
  await sleep(400);
  await comprobar(page, espejo, 'resolver la batalla perdida');
  const perdida = espejo.myHeroes().length === 0;
  log(`batalla de la semilla 7: ${perdida ? 'PERDIDA' : 'ganada'}`);
  if (!perdida) throw new Error('la batalla que debía perderse se ha ganado: cambia de guardia');
  await captura(page, 'desktop-14-mapa-tras-batalla-perdida');
  await page.close();
}

/** Lo mismo sin el arte de la rama: cada figura tiene que caer a su marcador. */
async function sinArte(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'sin arte',
    semilla: SEMILLA,
    // Solo las imágenes: los JSON de las hojas se importan como módulo y viven
    // en la misma carpeta; negarlos no es «sin arte», es romper la página.
    sinImagenes: /\/(rpg|characters)\/.*\.(png|webp)$/,
  });
  await captura(page, 'sin-arte-01-mapa');
  await mapa.pulsar({ x: 5, y: 2 });
  if (espejo.battle !== null) {
    await esperarCola(espejo.battle.log);
    await captura(page, 'sin-arte-02-batalla');
  }
  await page.close();
}

// ------------------------------------------------------------------ espectador

/**
 * El espectador, contra un servidor de verdad y con un agente que juega.
 *
 * Sin agente no sirve: la IA de reglas resuelve sus batallas dentro de `core` sin
 * dar un solo fotograma (#103) y la partida entera pasa en un suspiro. Así que
 * el guion se conecta él mismo al canal del agente —el mismo protocolo que el
 * puente MCP— y responde con la política de `pnpm qa`. Como el servidor espera a
 * cada respuesta, la partida se queda quieta mientras se captura: el mapa en la
 * primera petición de aventura y la batalla en la primera de batalla.
 */
async function espectador(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  let servidor: ServidorDePartida | null = null;
  let agente: WebSocket | null = null;
  try {
    servidor = await arrancarServidor({
      HEROES_SEED: String(SEMILLA),
      HEROES_MAX_DAYS: '12',
      HEROES_WAIT_AGENT_MS: '30000',
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    vigilarConsola(page, 'espectador', problemas);
    await page.goto(`${url}/espectador/?puerto=${servidor.espectador}`);

    const conectado = new WebSocket(`ws://localhost:${servidor.agente}`);
    agente = conectado;
    const enviar = (msg: AgentHelloMsg | AgentResponseMsg): void =>
      conectado.send(JSON.stringify(msg));
    let mapa = false;
    let batalla = false;
    let turnosDeBatalla = 0;
    const hecho = new Promise<void>((ok, mal) => {
      conectado.on('open', () => enviar({ type: 'hello', client: 'capturas' }));
      conectado.on('error', mal);
      conectado.on('message', (datos) => {
        void (async () => {
          const msg = JSON.parse(String(datos)) as ServerToAgentMsg;
          if (msg.type === 'game_over') return ok();
          if (msg.type !== 'request') return;
          if (msg.kind === 'adventure_turn' && !mapa) {
            mapa = true;
            await sleep(800);
            await captura(page, 'espectador-01-mapa');
          }
          // El fotograma sale por acción APLICADA: en la primera petición de
          // batalla el espectador aún enseña el mapa. Se captura en la segunda,
          // con una acción del agente ya en el tablero y contada por el animador.
          if (msg.kind === 'battle_turn') {
            turnosDeBatalla++;
            if (turnosDeBatalla === 2) {
              batalla = true;
              await sleep(800);
              await captura(page, 'espectador-02-batalla');
              return ok();
            }
          }
          enviar({
            type: 'response',
            requestId: msg.requestId,
            data: decidir(msg.kind, msg.payload),
          });
        })().catch(mal);
      });
    });
    // El plazo se desarma al acabar: un `sleep` suelto mantenía vivo el proceso
    // un minuto entero después de la última captura (se midió: 40 s de trabajo
    // y 98 s de reloj).
    let plazo: NodeJS.Timeout | undefined;
    await Promise.race([
      hecho,
      new Promise<never>((_, mal) => {
        plazo = setTimeout(
          () =>
            mal(
              new Error('en 60 s el agente no llegó a ninguna batalla que enseñar al espectador'),
            ),
          60_000,
        );
      }),
    ]).finally(() => clearTimeout(plazo));
    if (!batalla) throw new Error('la partida terminó sin una sola batalla del agente');
    await page.close();
  } finally {
    agente?.close();
    servidor?.parar();
  }
}

// ------------------------------------------------------------------------ main

async function main(): Promise<void> {
  mkdirSync(DESTINO, { recursive: true });
  const inicio = Date.now();
  const problemas: Problemas = { lista: [] };
  let vite: ChildProcess | null = null;
  let browser: Browser | null = null;
  const limpiar = (): void => matarGrupo(vite);
  process.on('SIGINT', () => {
    limpiar();
    process.exit(130);
  });
  try {
    const arrancado = await arrancarVite();
    vite = arrancado.proceso;
    log(`vite en ${arrancado.url} (grupo ${vite.pid})`);
    const ejecutable = chromiumInstalado();
    browser = await chromium.launch(ejecutable === undefined ? {} : { executablePath: ejecutable });
    await jugarEscritorio(browser, arrancado.url, problemas);
    await batallaPerdida(browser, arrancado.url, problemas);
    await jugarMovil(browser, arrancado.url, problemas);
    await jugarTactil(browser, arrancado.url, problemas);
    await sinArte(browser, arrancado.url, problemas);
    await espectador(browser, arrancado.url, problemas);
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
