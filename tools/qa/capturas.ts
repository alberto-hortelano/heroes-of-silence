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
import { cajaDeFigura, galonesDe } from '../../src/client/render/batalla.js';
import {
  casillaAPixel,
  centrarEn,
  type Encuadre,
  TILE_INICIAL,
  zoom,
} from '../../src/client/render/camara-mapa.js';
import { pasosAPintar } from '../../src/client/render/mapa.js';
import { centroDeStack, centroHex, tableroPara } from '../../src/client/render/proyeccion.js';
import { botonDeRecluta, townLayout, townPlots } from '../../src/client/render/town.js';
import { Session } from '../../src/client/session.js';
import { explicacionDeFin, rotuloDeDia } from '../../src/client/views/panels.js';
import { chooseBattleAction } from '../../src/core/ai/tactics.js';
import { stackHexes } from '../../src/core/battle/battle.js';
import type { BattleAction, BattleEvent, BattleStack } from '../../src/core/battle/types.js';
import { nombreDeTipoDeHeroe } from '../../src/core/data.js';
import { troopSummary } from '../../src/core/hero/troop.js';
import { casillasPeligrosas } from '../../src/core/state/asaltantes.js';
import { baseOf, heroesOf, visibleNow } from '../../src/core/state/game.js';
import type { Point } from '../../src/core/types.js';
import type {
  AgentHelloMsg,
  AgentResponseMsg,
  ServerToAgentMsg,
} from '../../src/server/protocol.js';
import { decidir } from './politica.js';
import { arrancarServidor, type ServidorDePartida } from './servidor.js';

/**
 * Las semillas cambiaron todas con el mapa de 28 y los asaltantes (ciclo «el
 * camino cuesta»): con un grupo en cada región sin dueño, la guardia que se
 * alcanza hoy SIN pisar la región de un grupo que embosque es rara —3 de las 60
 * primeras semillas—, y cada pasada necesita una. Se buscaron con el espejo,
 * como `guardiaALaVista`: la 282 tiene una a tres casillas y, además, una ruta
 * de dos días a la vista (`rutaDoradaYGris`), que de las candidatas solo tenían
 * cuatro.
 *
 * Se volvieron a probar las de siempre (2, 29 y 4) cuando la IA dejó de entrar
 * en emboscadas: no cambia nada, porque lo que las descarta es la ruta de la
 * PERSONA, no la de la IA. En las tres, la única guardia a la que se llega hoy
 * está detrás de una región que embosca al héroe de salida.
 */
const SEMILLA = 282;
/**
 * La del móvil y la del dedo: en un marco de 364 px de ancho la guardia que se
 * alcanza hoy tiene que caer DENTRO, y en el del dedo —en vertical, con la
 * cámara pegada al borde de arriba— a dos casillas como mucho. De las 1 500
 * primeras semillas solo seis la tienen; la 668, a (2,−1) del héroe.
 */
const SEMILLA_MOVIL = 668;
/** La partida cuya guardia más cercana gana: la batalla que se pierde y la vuelta a la base. */
const SEMILLA_QUE_PIERDE = 273;
/** La de los veteranos: la guardia más cercana deja uno y al día siguiente hay otra. */
const SEMILLA_VETERANOS = 177;
/**
 * La de la emboscada avisada (H2 del ciclo «el camino cuesta»): el día 1, el
 * grupo de 6 piqueros de la región de casa se ve desde Valdeluz, y la ruta a
 * (2,10) pisa su región en (1,9). Es la escena que encontró QA: antes la barra
 * decía «llegas hoy (3 pasos)» y el grupo no estaba ni pintado (H1).
 */
const SEMILLA_EMBOSCADA = 1;
const DESTINO_EMBOSCADA: Point = { x: 2, y: 10 };
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
  // El clic se repite hasta que la página lo ACEPTA, que es cuando cambia el
  // día o se acaba la partida. La puerta de «Fin de turno» ignora a propósito
  // lo que llega durante la pausa del cambio de día o con algo animándose
  // (`fin-de-turno.ts`), y un clic ignorado no deja rastro: el guion se quedaba
  // esperando un día que la página no iba a pasar. Con el mapa de nodos la
  // partida dura un día más dentro de este bucle y el segundo clic, que llega
  // pegado al primero, caía en la pausa.
  const antes = await page.locator('#day').innerText();
  for (let intento = 0; ; intento++) {
    await page.getByRole('button', { name: 'Fin de turno' }).click();
    const entro = await page
      .waitForFunction(
        (diaDeAntes) => {
          const turno = document.getElementById('turn')?.textContent ?? '';
          const hoy = document.getElementById('day')?.textContent ?? '';
          return hoy !== diaDeAntes || turno !== 'Tu turno';
        },
        antes,
        { timeout: 1500 },
      )
      .then(
        () => true,
        () => false,
      );
    if (entro) break;
    if (intento >= 5) throw new Error(`la página no acepta «Fin de turno» en ${antes}`);
  }
  await espejo.endTurn();
  const dia = rotuloDeDia(espejo.state.day);
  // Si el espejo ya sabe que la partida se acabó, se espera a que la página lo
  // diga, y SOLO eso. Con el día en la condición quedaba la misma carrera de
  // arriba cuando el final llega el MISMO día del clic —el rival te toma la
  // base en su turno—: la barra todavía decía el «Tu turno» de antes del clic,
  // con el día que tocaba, y la captura del final salía a mitad del turno del
  // rival. Pasó al llegar el mapa de nodos, donde la partida acaba antes.
  const acabada = espejo.state.finished !== null;
  await page.waitForFunction(
    ([esperado, soloElFinal]) => {
      const turno = document.getElementById('turn')?.textContent ?? '';
      const hoy = document.getElementById('day')?.textContent ?? '';
      if (soloElFinal) return turno.startsWith('Partida');
      return turno.startsWith('Partida') || (turno === 'Tu turno' && hoy === esperado);
    },
    [dia, acabada] as const,
  );
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
async function turnoDeBatalla(
  page: Page,
  espejo: Session,
  n: number,
  rendirse = false,
): Promise<void> {
  const battle = espejo.battle;
  if (battle === null) throw new Error('no hay batalla en el espejo');
  const antes = battle.log.length;
  const acciones = espejo.battleLegalActions();

  // Las cuatro primeras, a propósito: esperar, defender, un hechizo y lo que toque.
  // La quinta, rendirse si se ofrece y la pasada lo pide (fase 1b): es la única
  // acción que cierra la batalla y manda al héroe a casa, y la cuarta ya mira el
  // aviso de espera. Solo la pide la de escritorio: la del móvil juega la suya.
  const hechizo = espejo.spellOptions().find((o) => o.castable);
  if (rendirse && n === 4 && acciones.some((a) => a.type === 'surrender')) {
    await page.getByRole('button', { name: /Rendirse/ }).click();
    espejo.playBattleAction({ type: 'surrender' });
    await esperarCola(battle.log.slice(antes));
    await sleep(300);
    await captura(page, 'desktop-07-rendicion');
    log(`rendición: ${espejo.status}`);
    return;
  }
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
    } else if (ia.type === 'cast') {
      // La IA también lanza, y aquí no se le sigue: se defiende, en la página Y
      // en el espejo. Antes caía al «Defender» de abajo con el espejo lanzando,
      // y las dos partidas se separaban sin que nada lo dijera hasta el aviso de
      // espera —no salió hasta que el mapa de nodos trajo otra batalla al
      // móvil—. Lanzar a clics ya lo ejerce la jugada 2 en el escritorio; en el
      // marco estrecho del móvil el objetivo puede quedar fuera.
      await page.getByRole('button', { name: 'Defender' }).click();
      espejo.playBattleAction({ type: 'defend' });
    } else if (ia.type === 'surrender') {
      // La IA puede elegir rendirse (fase 1b): se pulsa SU botón, no «Defender».
      await page.getByRole('button', { name: /Rendirse/ }).click();
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

  // El tipo del héroe en la cabecera de su panel: el inicial lleva el de por
  // defecto de su facción (la tropa que se hace héroe solo pasa con narrador).
  const cabecera = (await page.locator('#side .eyebrow').first().innerText()).trim();
  const tipo = nombreDeTipoDeHeroe(espejo.selectedHero!.faction, espejo.selectedHero!.tipo);
  if (!cabecera.toUpperCase().includes(tipo.toUpperCase())) {
    throw new Error(`la cabecera del héroe dice «${cabecera}» y no nombra su tipo, «${tipo}»`);
  }
  log(`el panel del héroe enseña su tipo: «${cabecera}»`);

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

  await rutaDoradaYGris(page, espejo, mapa);
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

  // «+1» con el ejército ya en sus seis (fase 1b): no recluta, y la barra dice
  // por qué con la frase del núcleo. El espejo dice lo mismo, y el oro no se mueve.
  const recluta = town.faction === 'knight' ? 'peasant' : 'skeleton';
  if ((espejo.selectedHero?.army.length ?? 0) >= 6) {
    const uno = botonDeRecluta(plot, false);
    await page.mouse.click(
      bb.x + t.x + (uno.x + uno.w / 2) * t.scale,
      bb.y + t.y + (uno.y + uno.h / 2) * t.scale,
    );
    espejo.recruit(recluta, 1);
    await sleep(250);
    const dice = await page.locator('#status').innerText();
    if (!dice.includes('ya lleva 6 de 6 individuos') || dice !== espejo.status) {
      throw new Error(`reclutar el séptimo debía rechazarse diciéndolo; la barra dice «${dice}»`);
    }
    log(`el séptimo se rechaza: «${dice}»`);
    await captura(page, 'desktop-05b-castillo-el-septimo-no-cabe');
    await comprobar(page, espejo, 'reclutar el séptimo');

    // Y licenciando uno, el séptimo cabe: el «−1» de la tropa del héroe, pulsado
    // en la página, y el «+1» otra vez. Es el gesto para cambiar tropa, y deja el
    // ejército como estaba —el licenciado es el último, y el recluta entra al
    // final—, así que el resto de la pasada no se entera.
    const heroe = espejo.selectedHero!;
    const antes = heroe.army.length;
    const menos = page.locator(`#side button[data-action="dismiss"][data-creature="${recluta}"]`);
    if ((await menos.count()) !== 1) {
      throw new Error(`la tropa del héroe no ofrece licenciar ${recluta} en el castillo`);
    }
    await menos.click();
    espejo.dismiss(heroe.id, recluta, 1);
    await sleep(200);
    if (espejo.selectedHero?.army.length !== antes - 1 || espejo.status !== '') {
      throw new Error(`licenciar uno no ha hecho sitio: ${espejo.status}`);
    }
    const tropa = await page.locator('#side h3', { hasText: 'Tropa de' }).count();
    if (tropa !== 1) throw new Error('el castillo no enseña la tropa del héroe tras licenciar');
    await captura(page, 'desktop-05c-castillo-licenciado-uno');
    log(`licenciado un ${recluta}: la tropa pasa de ${antes} a ${antes - 1}`);
    if ((espejo.activeTown?.available[recluta] ?? 0) > 0) {
      await page.mouse.click(
        bb.x + t.x + (uno.x + uno.w / 2) * t.scale,
        bb.y + t.y + (uno.y + uno.h / 2) * t.scale,
      );
      espejo.recruit(recluta, 1);
      await sleep(200);
      if (espejo.selectedHero?.army.length !== antes) {
        throw new Error(`tras licenciar, el séptimo debía caber: ${espejo.status}`);
      }
      log(`y el «+1» vuelve a reclutar: ${antes} de ${antes}`);
    }
    await comprobar(page, espejo, 'licenciar y volver a reclutar');
  }
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  espejo.closeTown();
  await sleep(200);

  // Una batalla de varios individuos por bando, jugada a clics.
  const monstruo = await guardiaALaVista(page, mapa, espejo);
  await mapa.pulsar(monstruo);
  if (espejo.battle === null)
    throw new Error(`el espejo no ha entrado en batalla: ${espejo.status}`);
  await esperarCola(espejo.battle.log);
  await captura(page, 'desktop-07-batalla-inicio');
  for (let n = 0; n < 12 && espejo.battle?.finished === null; n++) {
    await turnoDeBatalla(page, espejo, n, true);
    if (n === 3) await captura(page, 'desktop-08-batalla-en-curso');
  }
  // Lo que hay que comprobar después de una rendición, leído ANTES de cerrarla:
  // con quién se rindió y cuánto le costó.
  const primera = espejo.battle;
  // Quien se rinde es el que pierde: si ganó el otro, la rendición es mía.
  const rendicion =
    primera?.finished?.winner !== espejo.miBando ? primera?.finished?.surrender : undefined;
  const supervivientes =
    primera === null
      ? []
      : primera.stacks
          .filter((s) => s.side === espejo.miBando && s.origen.kind !== 'heroe' && s.count > 0)
          .map((s) => s.body);
  const oroAntes = espejo.resources.gold;
  const bando = espejo.miBando;
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
  // Ganada o no lo dice la batalla, no si el héroe sigue en el mapa: desde la
  // fase 1b el que pierde vuelve a su base.
  const cierre = [...espejo.state.log].reverse().find((e) => e.kind === 'battle_ended');
  const ganada = cierre?.kind === 'battle_ended' && cierre.winner === bando;
  log(`primera batalla: ${ganada ? 'GANADA' : 'perdida'} (${espejo.status})`);
  await sleep(300);
  await comprobar(page, espejo, 'cerrar la primera batalla');
  if (rendicion !== undefined) {
    const heroe = espejo.myHeroes()[0];
    const base = espejo.myTowns()[0];
    if (heroe === undefined || base === undefined) {
      throw new Error('tras rendirse no queda héroe o base en el espejo');
    }
    const enBase = heroe.at.x === base.at.x && heroe.at.y === base.at.y;
    const tropa = heroe.army.slice(0, supervivientes.length).map((t) => t.creature);
    if (!enBase || tropa.join() !== supervivientes.join()) {
      throw new Error(
        `tras rendirse el héroe debía estar en (${base.at.x},${base.at.y}) con ${supervivientes.join(',')} y está en (${heroe.at.x},${heroe.at.y}) con ${heroe.army.map((t) => t.creature).join(',')}`,
      );
    }
    if (espejo.resources.gold !== oroAntes - rendicion.gold) {
      throw new Error(
        `la rendición costaba ${rendicion.gold} y el oro pasó de ${oroAntes} a ${espejo.resources.gold}`,
      );
    }
    log(
      `tras rendirse: el héroe está en su base con ${supervivientes.length} supervivientes y ${rendicion.gold} de oro menos`,
    );
  }
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

  // La patrulla de los asaltantes, vista pasar de un día a otro.
  if (espejo.state.finished === null) await patrullaALaVista(page, espejo, mapa, 'desktop-15');

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
  await finContadoPorSuCausa(page, espejo);
  await captura(page, 'desktop-12-fin-de-partida');
  await page.close();
}

/**
 * Los veteranos del héroe, en el panel: cada uno con «Veterano · nivel N · …»
 * —o «Nivel 1 · …» quien ya tiene experiencia y no llega al primer umbral—
 * tal y como lo deriva el espejo (`troopSummary`). Lanza si no hay ninguno de
 * nivel 2 o más: la pasada existe para enseñarlos, y una batalla ganada que no
 * deja a nadie arriba querría decir que la experiencia no llega al cliente.
 */
async function veteranosEnElPanel(page: Page, espejo: Session, paso: string): Promise<void> {
  const heroe = espejo.myHeroes()[0];
  if (heroe === undefined) throw new Error(`${paso}: no queda héroe en el espejo`);
  const filas = troopSummary(heroe.army, espejo.state.characters).filter(
    (g) => g.veterania !== undefined,
  );
  if (!filas.some((g) => g.nivel >= 2)) {
    throw new Error(
      `${paso}: ningún individuo de ${heroe.name} pasa del nivel 1 (${filas.length} con experiencia): no hay veterano que enseñar`,
    );
  }
  const panel = (await page.locator('#side').innerText()).replace(/\s+/g, ' ');
  for (const g of filas) {
    const esperado = g.nivel >= 2 ? `Veterano · nivel ${g.nivel}` : 'Nivel 1 ·';
    if (!panel.includes(esperado)) {
      throw new Error(
        `${paso}: el espejo tiene un ${g.unit.name} de nivel ${g.nivel} y el panel no dice «${esperado}»`,
      );
    }
  }
  log(
    `${paso}: ${filas.length} veterano(s) en el panel — ${filas
      .map((g) => `${g.unit.name} nivel ${g.nivel}, ${g.veterania?.experiencia} exp`)
      .join('; ')}`,
  );
}

/**
 * Un veterano en el campo: «· nivel N» en su fila de «En el campo», con el nivel
 * que dice el espejo. Los galones del lienzo no se miran por píxel: van en la
 * captura, y su cuenta la prueba `galonesDe` en los tests.
 */
async function veteranoEnElCampo(page: Page, espejo: Session): Promise<void> {
  const battle = espejo.battle;
  if (battle === null) throw new Error('no hay batalla en el espejo');
  const vet = battle.stacks.find((s) => s.count > 0 && galonesDe(s) > 0);
  if (vet === undefined) throw new Error('ningún veterano de nivel ≥ 2 pisa este tablero');
  const esperado = `${vet.unit.name} · nivel ${galonesDe(vet) + 1}`;
  const panel = (await page.locator('#side').innerText()).replace(/\s+/g, ' ');
  if (!panel.includes(esperado)) throw new Error(`en «En el campo» falta «${esperado}»`);
  log(`batalla con veterano: «${esperado}» en el campo, ${galonesDe(vet)} galón(es) en la figura`);
}

/**
 * La tropa que crece, vista (ciclo «la tropa crece»): una guardia resuelta deja
 * un veterano, el panel lo cuenta con su nivel y lo que le falta, y en la
 * batalla del día siguiente pisa el tablero con galones y «· nivel N».
 *
 * Pasada propia y no dentro de la de escritorio: allí la primera batalla se
 * juega a clics esperando y defendiendo para enseñar la rendición, y nadie de la
 * tropa llega a pegar. La semilla se buscó con el espejo: en la 177 la guardia
 * más cercana deja un veterano y al día siguiente hay otra a la que se llega.
 */
async function veteranos(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'veteranos',
    semilla: SEMILLA_VETERANOS,
  });
  await mapa.pulsar(await guardiaALaVista(page, mapa, espejo));
  if (espejo.battle === null) throw new Error(`no hubo batalla: ${espejo.status}`);
  await esperarCola(espejo.battle.log);
  await page.getByRole('button', { name: 'Resolver sola' }).click();
  espejo.autoResolveBattle();
  await sleep(400);
  await comprobar(page, espejo, 'resolver la guardia de los veteranos');
  await veteranosEnElPanel(page, espejo, 'tras la primera guardia');
  const cronica = await page.locator('#side').innerText();
  if (!cronica.includes('sube a veterano de nivel')) {
    throw new Error('la crónica de la página no cuenta el ascenso de la tropa');
  }
  await captura(page, 'veteranos-01-panel');
  await pasarDia(page, espejo);
  await comprobar(page, espejo, 'pasar al día 2 con los veteranos');
  await mapa.pulsar(await guardiaALaVista(page, mapa, espejo));
  if (espejo.battle === null) throw new Error(`no hubo segunda batalla: ${espejo.status}`);
  await esperarCola(espejo.battle.log);
  await veteranoEnElCampo(page, espejo);
  await captura(page, 'veteranos-02-batalla-galones');
  await page.close();
}

/**
 * El fin de partida, contado por su causa de verdad (I1 de la QA de la 2a).
 *
 * Decía «no te quedan castillos ni héroes» con el héroe del derrotado todavía
 * en el mapa, y esta pasada daba verde porque no leía el texto. Ahora la causa
 * se mira **en el estado** —el derrotado no tiene base, o no tiene nada—, se
 * exige que el hecho la diga igual, y la página tiene que contar esa y no otra.
 */
async function finContadoPorSuCausa(page: Page, espejo: Session): Promise<void> {
  const desenlace = espejo.desenlace;
  if (desenlace === null) {
    throw new Error(`la partida no ha terminado en 60 días: el fin no se ha podido comprobar`);
  }
  if (desenlace !== 'ganada' && desenlace !== 'perdida') {
    throw new Error(
      `la partida ha acabado «${desenlace}», y esta pasada solo sabe mirar ganadas y perdidas`,
    );
  }
  const winner = espejo.state.finished!.winner!;
  const vencido = espejo.state.players.find((p) => p.id !== winner)!;
  const sinBase = vencido.base !== null && baseOf(espejo.state, vencido.id) === null;
  const real = sinBase ? 'lost_base' : 'nothing_left';
  if (espejo.causaDelFinal !== real) {
    throw new Error(
      `el jugador ${vencido.id} ${sinBase ? 'ha perdido su base' : 'conserva su base'} y el hecho dice «${espejo.causaDelFinal}»`,
    );
  }
  const dice = (await page.locator('#side .fin p:not(.eyebrow)').innerText()).trim();
  // La frase se exige por lo que tiene que decir de la causa, no solo igual a
  // la del cliente: compararla con `explicacionDeFin` a secas sería comparar el
  // cliente consigo mismo, y la frase vieja habría pasado.
  const esperada = explicacionDeFin(desenlace, real);
  const exige =
    real === 'lost_base'
      ? desenlace === 'perdida'
        ? 'tu base'
        : 'la base rival'
      : 'sin héroes y sin ciudades';
  if (dice !== esperada || !dice.includes(exige)) {
    throw new Error(
      `fin de partida (${desenlace}, ${real}): la página dice «${dice}», y con esa causa tiene que decir «${exige}»`,
    );
  }
  const barra = (await page.locator('#status').innerText()).trim();
  if (barra !== espejo.status) {
    throw new Error(`fin de partida: la barra dice «${barra}» y el espejo «${espejo.status}»`);
  }
  log(
    `fin: ${desenlace} por ${real}, con ${heroesOf(espejo.state, vencido.id).length} héroe(s) del vencido en el mapa; el lateral dice «${dice}»`,
  );
}

async function jugarMovil(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'móvil',
    semilla: SEMILLA_MOVIL,
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
  await mapa.pulsar(await guardiaALaVista(page, mapa, espejo));
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
 * Pasa el ratón por un destino cuya ruta tiene tramo de hoy y tramo de otro
 * día **pintados**, y comprueba en el lienzo que se pintan (M4 de la QA de la
 * 2a).
 *
 * Antes se apuntaba a la base del rival a ciegas: en el mapa de nodos cayó fuera
 * del lienzo, la captura salía igual que la `01` y la pasada daba verde. Ahora
 * el destino se elige con el espejo —que la ruta pintada, ya sin lo que cae en
 * la niebla (M5), tenga los dos colores y quepa en pantalla—, y además se mira
 * que un paso de la ruta que cae en la niebla **no** cambia: es la otra mitad
 * de M5, vista en el lienzo y no solo en el test.
 */
async function rutaDoradaYGris(page: Page, espejo: Session, mapa: Mapa): Promise<void> {
  const b = await caja(page);
  const explorado = espejo.explorado;
  if (explorado === null) throw new Error('ruta: el espejo lo ve todo y no hay niebla que mirar');
  const dentro = (p: { x: number; y: number }) =>
    p.x > b.x + 30 && p.x < b.x + b.width - 30 && p.y > b.y + 30 && p.y < b.y + b.height - 30;
  let elegido: { destino: Point; pintados: number } | null = null;
  for (const clave of explorado) {
    const [x, y] = clave.split(',').map(Number) as [number, number];
    const destino = { x, y };
    const pintados = pasosAPintar(espejo.previewPath(destino), explorado);
    if (!pintados.some((p) => p.hoy) || !pintados.some((p) => !p.hoy)) continue;
    if (elegido !== null && pintados.length <= elegido.pintados) continue;
    if (!dentro(await mapa.pixel(destino))) continue;
    elegido = { destino, pintados: pintados.length };
  }
  if (elegido === null) {
    throw new Error('ruta: no hay a la vista un destino explorado con tramo de hoy y de otro día');
  }
  const ruta = espejo.previewPath(elegido.destino);
  const pintados = pasosAPintar(ruta, explorado);
  const dorado = pintados.find((p) => p.hoy && p.marca === 'paso') ?? pintados.find((p) => p.hoy)!;
  const gris =
    pintados.find((p) => !p.hoy && p.marca !== 'destino') ?? pintados.find((p) => !p.hoy)!;
  const oculto = ruta.find((r) => !explorado.has(`${r.at.x},${r.at.y}`));
  const sitios = [dorado.at, gris.at, ...(oculto === undefined ? [] : [oculto.at])];
  const enPagina = await Promise.all(sitios.map((p) => mapa.pixel(p)));
  const antes = await Promise.all(
    enPagina.map((p) => pixelesDelLienzo(page, p.x - b.x, p.y - b.y)),
  );
  const px = await mapa.pixel(elegido.destino);
  await page.mouse.move(px.x, px.y);
  await sleep(250);
  const despues = await Promise.all(
    enPagina.map((p) => pixelesDelLienzo(page, p.x - b.x, p.y - b.y)),
  );
  const cambio = antes.map((a, i) =>
    a.reduce((t, v, j) => t + Math.abs(v - (despues[i]?.[j] ?? 0)), 0),
  );
  const dice = await page.locator('#status').innerText();
  log(
    `ruta a (${elegido.destino.x},${elegido.destino.y}): ${pintados.length} de ${ruta.length} pasos pintados; ` +
      `dorado (${dorado.at.x},${dorado.at.y}) cambia ${cambio[0]}, gris (${gris.at.x},${gris.at.y}) ${cambio[1]}` +
      (oculto === undefined ? '' : `, en la niebla (${oculto.at.x},${oculto.at.y}) ${cambio[2]}`) +
      ` — «${dice}»`,
  );
  if (!dice.includes('dorado hoy, gris otro día')) throw new Error(`ruta: la barra dice «${dice}»`);
  if ((cambio[0] ?? 0) < 2000 || (cambio[1] ?? 0) < 2000) {
    throw new Error(
      `ruta: el paso dorado cambia ${cambio[0]} y el gris ${cambio[1]}: no se ha pintado`,
    );
  }
  if (oculto !== undefined && (cambio[2] ?? 0) > 200) {
    throw new Error(
      `ruta: el paso de la niebla (${oculto.at.x},${oculto.at.y}) cambia ${cambio[2]}: se pinta sobre lo desconocido`,
    );
  }
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
  const espejo = new Session(SEMILLA_MOVIL);
  await page.goto(`${url}/?seed=${SEMILLA_MOVIL}`, { waitUntil: 'networkidle' });
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
  await page.goto(`${url}/?seed=${SEMILLA_MOVIL}`, { waitUntil: 'networkidle' });
  await sleep(450);
  const otra = new Session(SEMILLA_MOVIL);
  const enOtra = new Mapa(page, otra);
  const monstruo = await guardiaALaVista(page, enOtra, otra);
  const enMonstruo = await enOtra.pixel(monstruo);
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
 * Una batalla que se pierde: con la semilla 6 la guardia más cercana al héroe,
 * resuelta sola, se lo gana —lo dice el espejo, no se supone—. Desde la fase 1b
 * el héroe derrotado no desaparece: cae y vuelve a su base, con el ejército
 * vacío y sin movimiento. Se captura el tablero y el mapa de después, con el
 * héroe de vuelta en su castillo y la caída y la vuelta en la crónica.
 *
 * Era la semilla 7, con siete esqueletos; con monstruos de 3 a 7 y el héroe en
 * el tablero esa batalla se gana. Se buscó una que se pierda peleando y no
 * rindiéndose: la IA de reglas se rinde cuando pierde de largo.
 */
/**
 * La guardia más cercana a la que el héroe llega HOY y que se VE en el lienzo,
 * por la ruta que enseña el cliente. Era una casilla escrita a mano —(5,2) en la
 * semilla 2—, y el mapa de nodos la convirtió en cordillera: el guion se quedaba
 * sin batalla. Lo de «se ve» es del móvil: allí el marco es estrecho, la más
 * cercana caía fuera y el toque iba a otra parte mientras el espejo peleaba.
 */
async function guardiaALaVista(page: Page, mapa: Mapa, espejo: Session): Promise<Point> {
  const b = await caja(page);
  const candidatas: { at: Point; pasos: number }[] = [];
  // Una ruta que pisa la región de un grupo que embosca no llega a la guardia:
  // la marcha se para en la emboscada y la batalla es otra.
  const heroe = espejo.selectedHero;
  const peligro = heroe === null ? null : casillasPeligrosas(espejo.state, heroe);
  const W = espejo.state.map.width;
  for (const o of espejo.state.map.objects) {
    if (o.kind !== 'monster' || o.defeated) continue;
    const ruta = espejo.previewPath(o.at);
    if (ruta.length === 0 || !ruta.every((paso) => paso.hoy)) continue;
    if (ruta.some((paso) => peligro?.[paso.at.y * W + paso.at.x] === 1)) continue;
    candidatas.push({ at: o.at, pasos: ruta.length });
  }
  candidatas.sort((x, y) => x.pasos - y.pasos);
  for (const c of candidatas) {
    const px = await mapa.pixel(c.at);
    // Abajo, 110 px de margen y no 30: ahí van los botones de la cámara, y un
    // toque que cae en el «+» hace zoom en vez de ir a la guardia.
    const dentro =
      px.x > b.x + 30 &&
      px.x < b.x + b.width - 30 &&
      px.y > b.y + 30 &&
      px.y < b.y + b.height - 110;
    if (dentro) return c.at;
  }
  throw new Error('no hay a la vista ninguna guardia a la que se llegue hoy');
}

/**
 * Un grupo de asaltantes que se mueve de un día a otro, **visto en el lienzo**:
 * se pasa el día hasta que alguno de los que están a la vista cambie de
 * casilla en el espejo, y entonces se mira en la página que la figura se ha
 * ido de la casilla de ayer y ha llegado a la de hoy —los píxeles de las dos
 * cambian—. Dos capturas: a mitad del deslizamiento y al llegar.
 *
 * Lo que se compara es el lienzo de antes de pasar el día con el de después,
 * casilla a casilla alrededor de cada grupo visible: la casilla de destino no
 * se sabe hasta que el espejo juega el día.
 */
async function patrullaALaVista(
  page: Page,
  espejo: Session,
  mapa: Mapa,
  prefijo: string,
): Promise<void> {
  // Con la vista abierta: la pasada de escritorio llega aquí con el zoom de
  // antes puesto, y de cerca no cabe nada más que el héroe. La rueda la cuenta
  // `Mapa`, con los topes del cliente.
  for (let i = 0; i < 4; i++) await mapa.rueda(-1);
  const b = await caja(page);
  const dentro = (p: { x: number; y: number }) =>
    p.x > b.x + 30 && p.x < b.x + b.width - 30 && p.y > b.y + 30 && p.y < b.y + b.height - 110;
  const explorada = (p: Point) => espejo.explorado?.has(`${p.x},${p.y}`) ?? true;
  for (let intento = 0; intento < 4 && espejo.state.finished === null; intento++) {
    // Lo que se ve de cada grupo hoy, y el lienzo alrededor: dos casillas son
    // lo más que anda en un día (`pasosPorDia`).
    const antes = new Map<string, number[]>();
    const posiciones = new Map(espejo.state.raiders.map((r) => [r.id, { ...r.at }]));
    for (const r of espejo.state.raiders) {
      if (!explorada(r.at) || !dentro(await mapa.pixel(r.at))) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const p = { x: r.at.x + dx, y: r.at.y + dy };
          const clave = `${p.x},${p.y}`;
          if (antes.has(clave)) continue;
          const px = await mapa.pixel(p);
          antes.set(clave, await pixelesDelLienzo(page, px.x - b.x, px.y - b.y));
        }
      }
    }
    if (antes.size === 0) {
      // Ninguno en lo explorado de la pantalla: se descubre el mapa con el botón
      // de siempre —el de depurar— en vez de buscar otra semilla. Una vez, y se
      // dice; si ni así hay ninguno, es rojo.
      //
      // Esto era el síntoma de H1 —un grupo que el castillo ve y el lienzo no
      // pinta—, y por eso antes de descubrir se exige que NO sea eso: si alguno
      // está a la vista de la persona (`visibleNow`) y fuera de lo explorado, es
      // rojo. Lo que queda es la geografía de la semilla: la 282 se eligió por
      // tener una guardia a la que se llega sin pisar la región de un grupo, y
      // ninguno cae a la vista de su castillo ni de su héroe —tampoco para el
      // agente—. Que un grupo cercano se pinta sin descubrir nada lo comprueba
      // `emboscadaAvisada`.
      if (espejo.revealAll) throw new Error(`${prefijo}: no hay ningún asaltante a la vista`);
      const mirando = visibleNow(espejo.state, espejo.viewer);
      const tapado = espejo.state.raiders.find(
        (r) => mirando.has(`${r.at.x},${r.at.y}`) && !explorada(r.at),
      );
      if (tapado !== undefined) {
        throw new Error(
          `${prefijo}: ${tapado.id} en (${tapado.at.x},${tapado.at.y}) está a la vista y la niebla lo tapa (H1)`,
        );
      }
      const aLaVista = espejo.state.raiders.filter((r) => mirando.has(`${r.at.x},${r.at.y}`));
      await page.getByRole('button', { name: 'Ver mapa entero' }).click();
      espejo.revealAll = true;
      await sleep(200);
      log(
        `${prefijo}: ningún asaltante en lo explorado de la pantalla (${aLaVista.length} a la vista de la persona, ` +
          `ninguno tapado por la niebla); se descubre el mapa`,
      );
      intento--;
      continue;
    }
    await pasarDia(page, espejo);
    const movido = espejo.state.raiders.find((r) => {
      const ayer = posiciones.get(r.id);
      return (
        ayer !== undefined &&
        (ayer.x !== r.at.x || ayer.y !== r.at.y) &&
        antes.has(`${ayer.x},${ayer.y}`) &&
        antes.has(`${r.at.x},${r.at.y}`)
      );
    });
    if (movido === undefined) continue;
    const ayer = posiciones.get(movido.id) as Point;
    await sleep(250);
    await captura(page, `${prefijo}-asaltante-andando`);
    // Que llegue: el deslizamiento dura `DURACION_DE_PATRULLA` (900 ms).
    await sleep(1200);
    await captura(page, `${prefijo}-asaltante-llegado`);
    const cambio = async (p: Point): Promise<number> => {
      const px = await mapa.pixel(p);
      const ahora = await pixelesDelLienzo(page, px.x - b.x, px.y - b.y);
      const viejo = antes.get(`${p.x},${p.y}`) ?? [];
      return ahora.reduce((t, v, i) => t + Math.abs(v - (viejo[i] ?? 0)), 0);
    };
    const enAyer = await cambio(ayer);
    const enHoy = await cambio(movido.at);
    log(
      `${prefijo}: ${movido.id} pasa de (${ayer.x},${ayer.y}) a (${movido.at.x},${movido.at.y}); ` +
        `el lienzo cambia ${enAyer} en la casilla de ayer y ${enHoy} en la de hoy`,
    );
    if (enAyer < 2000 || enHoy < 2000) {
      throw new Error(
        `${prefijo}: el espejo mueve ${movido.id} y el lienzo no lo enseña (cambia ${enAyer} y ${enHoy})`,
      );
    }
    await comprobar(page, espejo, `${prefijo}: la patrulla`);
    return;
  }
  throw new Error(`${prefijo}: en cuatro días ningún asaltante a la vista se ha movido`);
}

/**
 * La ruta que pisa la región de un grupo que embosca: el grupo se ve sin «Ver
 * mapa entero» (H1), la ruta se pinta en rojo desde la casilla donde salta, la
 * barra lo dice delante (H2) y, al pulsar, la batalla es contra ese grupo —el
 * aviso es verdad—.
 */
async function emboscadaAvisada(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'emboscada avisada',
    semilla: SEMILLA_EMBOSCADA,
  });
  const ruta = espejo.previewPath(DESTINO_EMBOSCADA);
  const salta = ruta.find((p) => p.emboscada !== undefined);
  if (salta === undefined || salta.emboscada === undefined) {
    throw new Error(
      `semilla ${SEMILLA_EMBOSCADA}: la ruta a (${DESTINO_EMBOSCADA.x},${DESTINO_EMBOSCADA.y}) ya no pisa ninguna emboscada a la vista`,
    );
  }
  const grupo = salta.emboscada;
  const explorado = espejo.explorado;
  if (explorado === null || !explorado.has(`${grupo.at.x},${grupo.at.y}`)) {
    throw new Error(`emboscada: ${grupo.id} embosca y no está pintado: la niebla lo tapa (H1)`);
  }
  const b = await caja(page);
  const enSalto = await mapa.pixel(salta.at);
  const rojos = (px: number[]): number => {
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if ((px[i] ?? 0) > 170 && (px[i + 1] ?? 0) < 90 && (px[i + 2] ?? 0) < 90) n++;
    }
    return n;
  };
  const antes = rojos(await pixelesDelLienzo(page, enSalto.x - b.x, enSalto.y - b.y));
  const destino = await mapa.pixel(DESTINO_EMBOSCADA);
  await page.mouse.move(destino.x, destino.y);
  await sleep(250);
  const despues = rojos(await pixelesDelLienzo(page, enSalto.x - b.x, enSalto.y - b.y));
  const dice = await page.locator('#status').innerText();
  log(
    `emboscada: ${grupo.id} en (${grupo.at.x},${grupo.at.y}) pintado sin descubrir el mapa; ` +
      `la ruta salta en (${salta.at.x},${salta.at.y}) con ${antes} → ${despues} píxeles rojos — «${dice}»`,
  );
  await captura(page, 'emboscada-01-ruta-avisada');
  if (!dice.startsWith('Cuidado: el camino cruza la región de')) {
    throw new Error(`emboscada: la barra no avisa: «${dice}»`);
  }
  if (despues - antes < 10) {
    throw new Error(
      `emboscada: la casilla donde salta no se pinta en rojo (${antes} → ${despues})`,
    );
  }
  await mapa.pulsar(DESTINO_EMBOSCADA);
  const atacante = espejo.state.pendingBattle?.attacker;
  if (atacante?.kind !== 'raider' || atacante.raiderId !== grupo.id) {
    throw new Error(`emboscada: al pulsar no hay batalla con ${grupo.id}: ${espejo.status}`);
  }
  await sleep(400);
  await captura(page, 'emboscada-02-batalla');
  log(`emboscada: al pulsar, batalla con ${grupo.id} atacando, como avisaba la ruta`);
  await page.close();
}

async function batallaPerdida(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'batalla perdida',
    // La 4 y no la 6: con el mapa de nodos la guardia más cercana de la 6 cae
    // y la de la 4 (cinco arqueros) gana. Se busca igual que las demás.
    semilla: SEMILLA_QUE_PIERDE,
  });
  const guardia = { at: await guardiaALaVista(page, mapa, espejo) };
  await mapa.pulsar(guardia.at);
  if (espejo.battle === null) {
    throw new Error(`semilla ${SEMILLA_QUE_PIERDE}: no hubo batalla: ${espejo.status}`);
  }
  await esperarCola(espejo.battle.log);
  await captura(page, 'desktop-13-batalla-que-se-pierde');
  await page.getByRole('button', { name: 'Resolver sola' }).click();
  espejo.autoResolveBattle();
  await sleep(400);
  await comprobar(page, espejo, 'resolver la batalla perdida');
  const final = [...espejo.state.log].reverse().find((e) => e.kind === 'battle_ended');
  const perdida = final?.kind === 'battle_ended' && final.winner === 'defender';
  log(`batalla de la semilla ${SEMILLA_QUE_PIERDE}: ${perdida ? 'PERDIDA' : 'ganada'}`);
  if (!perdida) throw new Error('la batalla que debía perderse se ha ganado: cambia de guardia');
  // El héroe derrotado vuelve a la base: en el castillo, sin tropa y sin
  // movimiento, y la crónica lo cuenta en ese orden.
  const vuelto = espejo.myHeroes()[0];
  const base = espejo.myTowns()[0];
  if (vuelto === undefined || base === undefined) {
    throw new Error('el héroe derrotado no ha vuelto a la base: no está en el mapa');
  }
  if (vuelto.at.x !== base.at.x || vuelto.at.y !== base.at.y || vuelto.movePoints !== 0) {
    throw new Error(
      `el héroe derrotado debía estar en (${base.at.x},${base.at.y}) sin movimiento y está en (${vuelto.at.x},${vuelto.at.y}) con ${vuelto.movePoints}`,
    );
  }
  const suyos = espejo.state.log
    .filter(
      (e) => (e.kind === 'hero_defeated' || e.kind === 'hero_returned') && e.hero === vuelto.id,
    )
    .map((e) => e.kind);
  if (suyos.join() !== 'hero_defeated,hero_returned') {
    throw new Error(`la crónica del héroe derrotado dice ${suyos.join(', ')}`);
  }
  const cronica = await page.locator('#side').innerText();
  if (!cronica.includes('vuelve a la base')) {
    throw new Error('la crónica de la página no cuenta que el héroe vuelve a la base');
  }
  log(`héroe derrotado: de vuelta en (${base.at.x},${base.at.y}), sin tropa y sin movimiento`);
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
  // Sin arte la figura no respira y el lienzo no se repinta solo: el
  // deslizamiento de la patrulla es lo que tiene que pedir los fotogramas.
  await patrullaALaVista(page, espejo, mapa, 'sin-arte-02');
  await mapa.pulsar(await guardiaALaVista(page, mapa, espejo));
  if (espejo.battle !== null) {
    await esperarCola(espejo.battle.log);
    await captura(page, 'sin-arte-02-batalla');
  }
  await page.close();
}

// ------------------------------------------------------------------ espectador

/**
 * Lo que el espectador enseña en un instante, leído de la página: el panel, la
 * barra y lo que `main.ts` apunta en `#app` de lo que acaba de pintar en el
 * lienzo (`caidosEnPie`, `animando`).
 */
interface MiradaAlEspectador {
  /** El «Fin: gana …» del panel, y además a la vista: no tapado ni fuera de pantalla. */
  readonly finALaVista: boolean;
  readonly escena: string;
  /** Unidades muertas que el lienzo sigue pintando en pie; `null` sin batalla. */
  readonly caidosEnPie: number | null;
  readonly animando: boolean;
  /** La barra de arriba: «Gana el jugador N» o «Terminada sin ganador» al acabar. */
  readonly turno: string;
  /** Fotogramas del cable que esperan detrás del que se ve. */
  readonly atrasados: number;
}

async function mirarAlEspectador(page: Page): Promise<MiradaAlEspectador> {
  return await page.evaluate(() => {
    const app = document.getElementById('app') as HTMLElement;
    const el = document.querySelector('#side .desenlace');
    let finALaVista = false;
    // Que el texto exista no basta: el parte vive en una caja con scroll y la
    // línea estaba en el DOM sin verse. Se pregunta a la pantalla: ¿lo que hay
    // pintado en el centro del desenlace ES el desenlace?
    if (el !== null && /Fin: gana el/.test(el.textContent ?? '')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.bottom <= window.innerHeight && r.top >= 0) {
        const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        finALaVista = encima !== null && el.contains(encima);
      }
    }
    const caidos = app.dataset.caidosEnPie;
    return {
      finALaVista,
      escena: app.dataset.escena ?? '',
      caidosEnPie: caidos === undefined ? null : Number(caidos),
      animando: app.dataset.animando === 'true',
      turno: document.getElementById('turn')?.textContent ?? '',
      atrasados: Number(app.dataset.atrasados ?? '0'),
    };
  });
}

/**
 * Del «Fin» de una batalla al mapa, como mucho: el final se retiene
 * `FINAL_VISIBLE_MS` (2,5 s) y lo que se acumuló detrás se cuenta acelerado.
 */
const PLAZO_DEL_FIN_AL_MAPA_MS = 8_000;
/**
 * Del `game_over` del servidor a que el espectador enseñe quién ganó. Antes eran
 * **22 s** con un agente rápido (H-7 de la QA de la fase 1b); con el telón que
 * cuenta acelerado se medían ~9 s, y el plazo fue un 12 fijo.
 *
 * Con los asaltantes la partida del agente trae más batallas y aquello se fue a
 * 22,6 s: cuatro finales retenidos 2,5 s **enteros** aunque el espectador fuera
 * 45 fotogramas atrasado. Durante un ciclo el plazo se derivó de esa cuenta; ya
 * no hace falta, porque el telón **comprime** los finales al ritmo del atraso
 * (`retencionDelFinal`), y vuelve a ser un número fijo. Medido en dos pasadas:
 * **16,1 y 16,2 s**, con 50 y 42 fotogramas atrasados y cinco finales de unos
 * 0,2 s cada uno. 21 s es esa medida con un 30 % de holgura, el mismo margen que
 * tenía el 12 sobre los 9. Un telón que no comprima —cinco finales de 2,5 s
 * enteros, unos 11 s más— no cabe.
 */
const PLAZO_DEL_GAME_OVER_MS = 21_000;

/**
 * El espectador, contra un servidor de verdad y con un agente que juega.
 *
 * Sin agente no sirve: la IA de reglas resuelve sus batallas dentro de `core` sin
 * dar un solo fotograma (#103) y la partida entera pasa en un suspiro. Así que
 * el guion se conecta él mismo al canal del agente —el mismo protocolo que el
 * puente MCP— y responde con la política de `pnpm qa`, **al instante**: es el
 * agente rápido con el que el espectador se quedaba 22 s detrás (H-7). Solo se
 * para dos veces, para capturar el mapa y la batalla.
 *
 * Y lo mira **hasta el final de la partida**, no hasta el primer «Fin»: antes
 * daba verde en cuanto el texto aparecía, sobre una captura con muertos de pie, y
 * nunca comprobaba que el espectador llegara al mapa ni al fin. Ahora, a la vez
 * que juega, un vigía lee la página cada 50 ms y exige tres cosas:
 *
 *  - cuando el panel dice «Fin», el lienzo **ya está en el final**: ninguna
 *    figura muerta en pie y el animador quieto;
 *  - de cada «Fin» al mapa (o al fin de la partida), `PLAZO_DEL_FIN_AL_MAPA_MS`;
 *  - y del `game_over` del servidor a «Gana el jugador …», `PLAZO_DEL_GAME_OVER_MS`.
 */
async function espectador(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  let servidor: ServidorDePartida | null = null;
  let agente: WebSocket | null = null;
  let vigilando = false;
  let vigia: Promise<void> = Promise.resolve();
  try {
    servidor = await arrancarServidor(
      {
        HEROES_SEED: String(SEMILLA),
        HEROES_MAX_DAYS: '12',
        HEROES_WAIT_AGENT_MS: '30000',
      },
      // Con un veterano de nivel 5 en la base del agente, como `pnpm qa`: el
      // héroe que nace de la tropa es lo que el espectador tiene que enseñar
      // con su tipo y su historia, y la partida sola casi nunca lo da.
      { entrada: 'tools/qa/partida-con-veterano.ts' },
    );
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    vigilarConsola(page, 'espectador', problemas);
    await page.goto(`${url}/espectador/?puerto=${servidor.espectador}`);

    const fallos: string[] = [];
    let finesVistos = 0;
    let finalCapturado = false;
    /** Desde cuándo se ve el «Fin» que todavía no ha pasado al mapa. */
    let finDesde: number | null = null;
    let finDeLaPartidaVisto: number | null = null;
    vigilando = true;
    vigia = (async () => {
      let anterior = false;
      while (vigilando) {
        const m = await mirarAlEspectador(page);
        const ahora = Date.now();
        if (
          /^(Gana el jugador|Terminada sin ganador)/.test(m.turno) &&
          finDeLaPartidaVisto === null
        ) {
          finDeLaPartidaVisto = ahora;
        }
        // Sin lo apuntado, el vigía estaría ciego y daría verde: es justo lo que
        // pasaría con el telón de antes, que no apuntaba nada.
        if (m.escena === 'battle' && m.caidosEnPie === null) {
          fallos.push(
            'el espectador pinta una batalla sin apuntar en #app lo que pinta ' +
              '(data-caidos-en-pie): este paso no puede comprobar el tablero',
          );
        }
        if (m.finALaVista) {
          if (!anterior) {
            finesVistos++;
            finDesde = ahora;
          }
          if ((m.caidosEnPie ?? 0) > 0 || m.animando) {
            if (fallos.length === 0) await captura(page, 'espectador-fallo-fin-adelantado');
            fallos.push(
              `el panel dice «Fin» (batalla ${finesVistos}) con el tablero aún contando: ` +
                `${m.caidosEnPie} muerta(s) en pie, animador ${m.animando ? 'ocupado' : 'quieto'}`,
            );
          } else if (!finalCapturado) {
            finalCapturado = true;
            await captura(page, 'espectador-03-final');
            log('espectador: el «Fin» de la batalla sale con el tablero en su final');
          }
        } else if (finDesde !== null) {
          // Se fue el «Fin»: al mapa, a otra batalla o al fin de la partida.
          log(
            `espectador: del «Fin» de la batalla ${finesVistos} a ${m.escena === 'adventure' ? 'el mapa' : 'lo siguiente'}, ${ahora - finDesde} ms`,
          );
          finDesde = null;
        }
        if (finDesde !== null && ahora - finDesde > PLAZO_DEL_FIN_AL_MAPA_MS) {
          fallos.push(
            `el «Fin» de la batalla ${finesVistos} sigue en pantalla a los ` +
              `${PLAZO_DEL_FIN_AL_MAPA_MS} ms: el espectador no pasa al mapa`,
          );
          finDesde = null;
        }
        anterior = m.finALaVista;
        await sleep(50);
      }
    })();

    const conectado = new WebSocket(`ws://localhost:${servidor.agente}`);
    agente = conectado;
    const enviar = (msg: AgentHelloMsg | AgentResponseMsg): void =>
      conectado.send(JSON.stringify(msg));
    let mapa = false;
    let turnosDeBatalla = 0;
    /** El héroe nacido de la tropa, como lo pinta el panel; `null` si no se vio. */
    let heroeNacido: string | null = null;
    /** Lo que se esperaba ver en el panel, en cuanto llega el `hero_from_troop`. */
    let heroeEsperado: string | null = null;
    /** La espera del panel con el nacido, que se lanza al ascender y se cobra al final. */
    let verElHeroe: Promise<void> = Promise.resolve();
    /** Por qué no se vio, si la espera venció o la captura falló. */
    let heroeSinVer: string | null = null;
    const gameOver = new Promise<number>((ok, mal) => {
      conectado.on('open', () => enviar({ type: 'hello', client: 'capturas' }));
      conectado.on('error', mal);
      conectado.on('message', (datos) => {
        void (async () => {
          const msg = JSON.parse(String(datos)) as ServerToAgentMsg;
          if (msg.type === 'game_over') return ok(Date.now());
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
              await sleep(800);
              await captura(page, 'espectador-02-batalla');
            }
          }
          const data = decidir(msg.kind, msg.payload);
          enviar({ type: 'response', requestId: msg.requestId, data });
          // El ascenso: el panel tiene que enseñar al nacido con su nombre, su
          // tipo y su historia. El espectador va detrás del servidor, así que
          // hay que esperar a verlo; pero **no aquí**: este manejador es el que
          // contesta al servidor, y esperar dentro dejaba la partida parada
          // hasta que el panel se pusiera al día. Se lanza y se cobra al final.
          if (msg.kind === 'hero_from_troop') {
            const { name, story } = data as { name: string; story: string };
            const tipos = (msg.payload as { heroTypes: { id: string; name: string }[] }).heroTypes;
            const tipo = tipos[0]!.name;
            heroeEsperado = `«${name} · ${tipo}» con «${story}»`;
            verElHeroe = page
              .waitForFunction(
                ([n, h]) => {
                  const t = document.getElementById('side')?.textContent ?? '';
                  return t.includes(n) && t.includes(h);
                },
                [`${name} · ${tipo}`, story] as const,
                { timeout: 10_000 },
              )
              .then(async () => {
                heroeNacido = `${name} · ${tipo} — «${story}»`;
                await captura(page, 'espectador-00-heroe-nacido');
              })
              .catch((err: unknown) => {
                heroeSinVer = err instanceof Error ? err.message : String(err);
              });
          }
        })().catch(mal);
      });
    });

    // El plazo se desarma al acabar: un `sleep` suelto mantenía vivo el proceso
    // un minuto entero después de la última captura (se midió: 40 s de trabajo
    // y 98 s de reloj).
    let plazo: NodeJS.Timeout | undefined;
    const servidorAcabó = await Promise.race([
      gameOver,
      new Promise<never>((_, mal) => {
        plazo = setTimeout(
          () => mal(new Error('en 60 s la partida del agente no terminó')),
          60_000,
        );
      }),
    ]).finally(() => clearTimeout(plazo));

    // Y ahora se espera al espectador, que va detrás: lo que se mide es cuánto.
    const atrasados = (await mirarAlEspectador(page)).atrasados;
    log(`espectador: al llegar el game_over le quedan ${atrasados} fotogramas por poner`);
    const finesAlLlegar = finesVistos;
    while (finDeLaPartidaVisto === null && Date.now() - servidorAcabó < PLAZO_DEL_GAME_OVER_MS) {
      await sleep(50);
    }
    vigilando = false;
    await vigia;
    const visto: number | null = finDeLaPartidaVisto;
    if (visto === null) {
      fallos.push(
        `el espectador no enseña el fin de la partida a los ${PLAZO_DEL_GAME_OVER_MS} ms del ` +
          `\`game_over\` del servidor (${atrasados} fotogramas atrasados, ` +
          `${finesVistos - finesAlLlegar} finales de batalla después)`,
      );
    } else {
      log(
        `espectador: enseña el fin de la partida ${visto - servidorAcabó} ms después del game_over ` +
          `(plazo ${PLAZO_DEL_GAME_OVER_MS} ms; ${atrasados} fotogramas atrasados, ${finesVistos - finesAlLlegar} finales después)`,
      );
      await captura(page, 'espectador-04-fin-de-partida');
    }
    await verElHeroe;
    if (heroeNacido === null) {
      fallos.push(
        heroeEsperado === null
          ? 'no llegó ningún "hero_from_troop": el veterano de la base no se ofreció al narrador'
          : `el panel del espectador no enseña al héroe nacido de la tropa: esperaba ${heroeEsperado}` +
              (heroeSinVer === null ? '' : ` (${heroeSinVer})`),
      );
    } else log(`espectador: el héroe nacido de la tropa se ve en el panel: ${heroeNacido}`);
    if (turnosDeBatalla < 2) fallos.push('la partida terminó sin una batalla del agente que mirar');
    if (finesVistos === 0) fallos.push('ninguna batalla del agente enseñó su «Fin» al espectador');
    else
      log(
        `espectador: ${finesVistos} final(es) de batalla vistos, ${turnosDeBatalla} turnos de batalla`,
      );
    if (fallos.length > 0) {
      throw new Error(`el espectador falla:\n  - ${[...new Set(fallos)].join('\n  - ')}`);
    }
    await page.close();
  } finally {
    vigilando = false;
    // Si el vigía reventó, el camino normal ya lo habría lanzado al esperarlo;
    // aquí se llega con otro error en vuelo, y ese es el que se cuenta.
    await vigia.catch((err: unknown) =>
      log(`el vigía del espectador también falló: ${String(err)}`),
    );
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
    await emboscadaAvisada(browser, arrancado.url, problemas);
    await batallaPerdida(browser, arrancado.url, problemas);
    await veteranos(browser, arrancado.url, problemas);
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
