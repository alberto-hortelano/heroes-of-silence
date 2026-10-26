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
 * No entra en `pnpm verify`: tarda decenas de segundos (ver `implementacion.md`).
 */

import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { type Browser, chromium, type Page } from 'playwright';
import WebSocket from 'ws';
import { DURACION, duracionDeLaJugada, IMPACTO } from '../../src/client/anim.js';
import { LA_LLEVA_EL_HEROE } from '../../src/client/arena/paneles.js';
import { EscenaAventura } from '../../src/client/escenas/aventura.js';
import { EscenaAyuntamiento } from '../../src/client/escenas/ayuntamiento.js';
import { cargaContra, EscenaBatalla, rotuloDeAngulo } from '../../src/client/escenas/batalla.js';
import { dondeHablarCon } from '../../src/client/escenas/castillo.js';
import { cajasDeLaMorada, EscenaMorada } from '../../src/client/escenas/morada.js';
import { EscenaTropa } from '../../src/client/escenas/tropa.js';
import { msPorCasilla } from '../../src/client/marcha.js';
import type { VistaDeLaMorada } from '../../src/client/morada/vista.js';
import { camaraDeLaBase, camaraQuieta } from '../../src/client/render/base/camara.js';
import { dondePulsarElSitio } from '../../src/client/render/base/recortes.js';
import {
  ARO_DE_LA_RUEDA,
  type CajaDeFigura,
  COLOR_BANDO,
  cabezaDe,
  cajaDeFigura,
  cajaDeFiguraEn,
  galonesDe,
} from '../../src/client/render/batalla.js';
import { casillaAPixel, centrarEn, type Encuadre } from '../../src/client/render/camara-mapa.js';
import { pasoDeLaHoja } from '../../src/client/render/de-pie.js';
import { ALTO_DEL_GRUPO, pasosAPintar } from '../../src/client/render/mapa.js';
import { dondeEsperaEnLaMorada } from '../../src/client/render/morada/fila.js';
import { registrarUnidad } from '../../src/client/render/personajes.js';
import {
  centroDeStack,
  centroHex,
  enPantalla,
  pasoDeLaBase,
  type Tablero,
  tableroPara,
} from '../../src/client/render/proyeccion.js';
import { encuadrarLaTropa } from '../../src/client/render/tropa/arco.js';
import { cajasDeLaTropa } from '../../src/client/render/tropa/pintar.js';
import {
  anguloDe as anguloEnLaRueda,
  medidasDeLaRueda,
  sitioEnLaRueda as sitioEnLaRuedaDe,
  teclaDe as teclaEnLaRueda,
} from '../../src/client/rueda/rueda.js';
import { type ControlDeBatalla, SesionDeArena, Session } from '../../src/client/session.js';
import { nombreEnElCampo } from '../../src/client/views/distintivo.js';
import { AVISO_DE_ESPERA, explicacionDeFin, rotuloDeDia } from '../../src/client/views/panels.js';
import { textoDePrevision } from '../../src/client/views/prevision.js';
import { chooseBattleAction } from '../../src/core/ai/tactics.js';
import {
  type FuenteDeArena,
  type HeroeDeArena,
  heroePorDefecto,
  LADOS,
  ladoDe,
  VERSION_DEL_ENLACE,
} from '../../src/core/arena.js';
import { isAlive, mismoTurno, stackById, stackHexes } from '../../src/core/battle/battle.js';
import { hexDistance, hexEquals, quedanCasillas } from '../../src/core/battle/board.js';
import { armasDe, stackHp, trasElGolpe } from '../../src/core/battle/damage.js';
import { poder } from '../../src/core/battle/poderes.js';
import {
  NOMBRE_DEL_PUNTO,
  nombreEnLaRueda,
  RUEDA_DE_REFERENCIA,
  type TipoDeGolpe,
} from '../../src/core/battle/rueda.js';
import { allSpells } from '../../src/core/battle/spells.js';
import {
  type BattleAction,
  type BattleEvent,
  type BattleStack,
  type BattleState,
  queEs,
} from '../../src/core/battle/types.js';
import { UNIDADES, unidad } from '../../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../../src/core/combate.js';
import {
  ECONOMIA,
  figuraDelHeroe,
  nombreDeTipoDeHeroe,
  RUTA_DEL_CATALOGO_DE_EQUIPO,
  tipoDeHeroePorDefecto,
  tiposDeHeroe,
} from '../../src/core/data.js';
import { ESCALA_DE_CIFRAS } from '../../src/core/escala.js';
import { EQUIPO_DEL_JUEGO } from '../../src/core/hero/equipo.js';
import { troopSummary } from '../../src/core/hero/troop.js';
import { nivelDeUnidad } from '../../src/core/nivel.js';
import { parseSeed } from '../../src/core/rng.js';
import { pasosDeLaPatrulla } from '../../src/core/state/asaltantes.js';
import { baseOf, heroesOf, visibleNow } from '../../src/core/state/game.js';
import { faccionesDeLaSemilla } from '../../src/core/state/setup.js';
import type { SitioId } from '../../src/core/town/sitios.js';
import { describirCoste, FACTION_IDS, type FactionId, type Point } from '../../src/core/types.js';
import {
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  type Unidad,
  unidadDeCombate,
} from '../../src/core/unidad.js';
import type {
  AgentHelloMsg,
  AgentResponseMsg,
  ServerToAgentMsg,
} from '../../src/server/protocol.js';
import { COMPRESION_SUELO } from '../../src/shared/arte.js';
import {
  type Disposicion,
  disposicionDe,
  FONDO_DE_LA_FRANJA,
  type Plano,
} from '../../src/shared/base.js';
import { hojasDelTaller, leerCatalogo } from '../arena/borrador.js';
import { cifrasCortadas } from './cifras-de-la-ficha.js';
import {
  buscarDerrota,
  buscarEmboscada,
  buscarEscritorio,
  buscarMovil,
  buscarSinArte,
  buscarVeteranos,
  type Caja,
  destinoTactil,
  encuadreDe,
  guardiaEnElMarco,
  type PlanDeAngulo,
  planDeAngulo,
  RUEDA_DE_LA_PATRULLA,
  RUEDA_DEL_ESCRITORIO,
  reclutaDeNivel1,
  rutaDeDosColores,
  TOPE_DE_SEMILLAS,
  tocable,
  VETERANOS,
} from './escenas-de-capturas.js';
import { entornoDelArnes, semillaDelEspectador } from './partida-del-arnes.js';
import { decidir } from './politica.js';
import { arrancarServidor, type ServidorDePartida } from './servidor.js';
import { urlDePartida } from './url-de-partida.js';
import { arrancarVite, chromiumInstalado, esperarElSuelo, matarGrupo } from './vite-propio.js';

/**
 * Las capturas juegan con la complejidad de siempre (7 / 7): la rueda de la
 * batalla es la de referencia, la de 7, con su geometría, sus teclas y sus nombres
 * (complejidad del combate, 22-10-2026).
 */
const RUEDA = RUEDA_DE_REFERENCIA;
const MEDIDAS_DE_LA_RUEDA = medidasDeLaRueda(RUEDA);
const TIPOS_DE_GOLPE = RUEDA.golpes;
const anguloDe = (t: TipoDeGolpe): number => anguloEnLaRueda(t, RUEDA);
const sitioEnLaRueda = (t: TipoDeGolpe) => sitioEnLaRuedaDe(t, RUEDA);
const teclaDe = (t: TipoDeGolpe): string => teclaEnLaRueda(t, RUEDA);

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
 *
 * **Y otra vez con los mapas densos (03-10-2026)**: fronteras gruesas,
 * obstáculos que bloquean y el lado de 34 se llevaron las cinco. Se buscaron con
 * el espejo, igual que entonces, en las 300 primeras: la 238 tiene una guardia a
 * tres pasos y una ruta de dos días a la vista; la 21 pierde la suya; en la 208
 * la guardia deja veterano y al día siguiente hay otra; y la 3 tiene una ruta a
 * (11,0) que pisa, a la vista, la región de un grupo que embosca. El móvil
 * comparte la 238: en las 300 primeras ninguna guardia alcanzable cae a dos
 * casillas del héroe, y la de la 238 está a (1,3).
 *
 * **Y una vez más con la vuelta de simplify (03-10-2026)**: el vestido del mapa
 * consume el `rng` de otra manera y cambió el mapa de todas. Buscadas con el
 * espejo en las 1 500 primeras —y hasta la 4 000 para los veteranos— y
 * probadas cada una con su pasada: la 993 tiene una ruta de dos días a la vista
 * y, tras entrar al castillo, una guardia a (4,−1); la 534 pierde la suya; en la
 * 1 454 la guardia deja veterano y la del día siguiente cae a (6,1); la 3 sigue
 * dando emboscada, ahora con la ruta a (11,5); y el móvil pasa a la 810, con la
 * guardia a (0,2) del castillo. Es la búsqueda que el issue de las semillas de
 * capturas propone automatizar.
 *
 * **Y con la vuelta 1 de QA (03-10-2026)**: los caminos en árbol y la frontera
 * forzada movieron otra vez el mapa y el camino de todas. Prefiltradas con el
 * espejo (una `Session` por semilla, sin navegador) y probadas cada una con su
 * pasada: la 50 tiene la ruta de dos días y la guardia tras el castillo; la 97
 * pierde la suya; en la 2 199 —de las 5 000 primeras solo seis dejaban veterano
 * con otra guardia al día siguiente, y solo esta cae dentro del marco— la
 * guardia está a seis pasos y la del día 2 a ocho; la 3 da la emboscada con la
 * ruta a (8,8); y el móvil sigue en la 810.
 *
 * **Con «menos caminos» (06-10-2026)** la emboscada y los veteranos se
 * quedaron sin escena, y dejaron de fijarse a mano: las buscan sus pasadas
 * (`buscarEmboscada`, `buscarVeteranos`), y con ellas la que pierde
 * (`buscarDerrota`). Las que siguieron aquí (la 50 y la 810) aguantaron ese
 * cambio, y cayeron con el siguiente: las entradas de nodo en eje (#161) le
 * quitaron a la 50 su ruta de dos días y a la 810 su guardia a la vista (QA de
 * #161, H1). Desde entonces las buscan también sus pasadas, cada una con lo que
 * de verdad necesita: `buscarEscritorio`, `buscarMovil` (móvil y táctil, con la
 * caja del móvil medida en una página) y `buscarSinArte`.
 *
 * **Y con #131 (08-10-2026) no queda ninguna escrita**: la del espectador (la 50
 * del servidor con el plan 7 de la política) la busca `semillaDelEspectador`
 * jugando su partida en el proceso, y la de la arena (la 6), `buscarArena` con
 * la pauta de la pasada. Las guardias ya no se buscan «a la vista desde el
 * héroe» alejando la vista a ojo: `guardiaALaVista` lleva la cámara hasta la
 * que toca arrastrando el mapa (`Mapa.mirar`). La semilla 1 con que se mide el
 * lienzo no es una escena: la caja no depende de la partida (`abrir` lo exige).
 */
// Las semillas de la emboscada avisada, de los veteranos y de la batalla que se
// pierde ya no se escriben aquí: las buscan sus pasadas en el espejo
// (`escenas-de-capturas.ts`). Eran la 3 con destino (8,8), la 2 199 y la 97;
// «menos caminos» (06-10-2026) rompió las dos primeras a la vez, como cada
// cambio del generador antes, y la 97 había caído ya dos veces.
// Por defecto, una carpeta ignorada por git y de este checkout (dos worktrees no
// se pisan); un ciclo que quiera guardarlas le pasa la suya.
const DESTINO = resolve(process.argv[2] ?? '.cache/capturas');

function log(msg: string): void {
  console.log(`\x1b[36m[capturas]\x1b[0m ${msg}`);
}

// ------------------------------------------------------------------ navegador

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
    // Sin imágenes, el suelo del mapa dice que se pinta sin ellas: también es la prueba.
    if (esperados !== undefined && m.text().startsWith('el suelo del mapa se pinta sin')) return;
    problemas.lista.push(`[${nombre}] consola: ${m.text()} (${m.location().url})`);
  });
  page.on('pageerror', (e) => problemas.lista.push(`[${nombre}] excepción: ${e.message}`));
}

async function captura(page: Page, nombre: string): Promise<void> {
  const ruta = join(DESTINO, `${nombre}.png`);
  await page.screenshot({ path: ruta });
  log(`captura ${nombre}.png`);
}

/** La densidad de la pantalla de la página: con ella encuadran las escenas de pie (`pasoDeLaHoja`). */
async function densidadDe(page: Page): Promise<number> {
  return page.evaluate(() => window.devicePixelRatio || 1);
}

async function caja(page: Page): Promise<Caja> {
  // Con las fuentes ya cargadas: la barra de arriba del móvil mide otra cosa
  // con la de respaldo, y la caja medida en la s1 salía 3,4 px más arriba que
  // la de la semilla buscada (#229, con la máquina cargada).
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const b = await page.locator('#canvas').boundingBox();
  if (b === null) throw new Error('el lienzo no está en la página');
  return b;
}

/** El medio de la puerta de un edificio: siempre pintado (`dondePulsarElSitio`). */
const laPuerta =
  (d: Disposicion, sitio: SitioId) =>
  (t: Tablero): { x: number; y: number } =>
    dondePulsarElSitio(t, d.sitios[sitio]);

/** El medio del cuerpo de una figura de pie en `en`. */
const laFigura =
  (en: Plano) =>
  (t: Tablero): { x: number; y: number } => {
    const c = cajaDeFiguraEn(t, en);
    return { x: c.x, y: c.suelo - c.alto / 2 };
  };

/** Un punto del suelo de la base. */
const elSuelo =
  (p: Plano) =>
  (t: Tablero): { x: number; y: number } =>
    enPantalla(t, p);

/**
 * Pulsa lo que diga `donde` con quien camina en `foco`: la cámara sigue a la
 * figura y, quieta, está en `camaraQuieta`, así que el píxel sale de dónde está
 * ella con la misma cuenta que el juego.
 */
async function pulsarEnLaBase(
  page: Page,
  d: Disposicion,
  foco: Plano,
  donde: (t: Tablero) => { x: number; y: number },
): Promise<void> {
  const bb = await caja(page);
  const lienzo = { ancho: bb.width, alto: bb.height };
  const q = donde(camaraDeLaBase(lienzo, camaraQuieta(d, lienzo, foco.x)));
  const antes = await page.locator('#canvas').getAttribute('data-base');
  await page.mouse.click(bb.x + q.x, bb.y + q.y);
  // El fotograma que echa a andar: sin esperarlo, un «quieto» de antes del clic
  // daría por llegada una marcha que no ha empezado. `data-base` lo escribe cada
  // fotograma, y una marcha dura varios: se mira en cada uno.
  await page.waitForFunction((m) => document.getElementById('canvas')?.dataset.base !== m, antes, {
    polling: 'raf',
    timeout: 5000,
  });
}

/**
 * Anda por el suelo de la base, desde `foco`, hasta tener `x` a la vista con un
 * paso de margen, y devuelve dónde se queda quien camina.
 */
async function acercarseA(page: Page, d: Disposicion, foco: Plano, x: number): Promise<Plano> {
  const bb = await caja(page);
  const medio = bb.width / camaraDeLaBase({ ancho: bb.width, alto: bb.height }, 0).paso / 2 - 1;
  let en = foco;
  for (let i = 0; i < 8 && Math.abs(x - en.x) > medio; i++) {
    const destino = {
      x: en.x + Math.sign(x - en.x) * Math.min(Math.abs(x - en.x), medio),
      y: FONDO_DE_LA_FRANJA - 0.3,
    };
    await pulsarEnLaBase(page, d, en, elSuelo(destino));
    await esperarLaBase(page, 'quieto');
    en = destino;
  }
  return en;
}

/**
 * Espera a que la base diga `marca` en `canvas[data-base]`: lo abierto al llegar.
 * Los paneles se pintan en el mismo fotograma que la escribe (`main.ts`).
 */
async function esperarLaBase(page: Page, marca: string): Promise<void> {
  await page.locator(`#canvas[data-base="${marca}"]`).waitFor({ state: 'attached', timeout: 8000 });
}

/** Comprueba que la página y el espejo juegan la misma partida. */
async function comprobar(page: Page, espejo: Session, paso: string): Promise<void> {
  const oro = await page.locator('#resources .oro').innerText();
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
  // Con separador de miles (`conMiles`): las cifras, sin él.
  if (oro.replace(/\s/g, '') !== String(espejo.oro) || dia.trim() !== esperadoDia) {
    throw new Error(
      `tras «${paso}» la página y el espejo se han separado: la página dice ${dia} y ${oro} de oro; ` +
        `el espejo, ${esperadoDia} y ${espejo.oro}`,
    );
  }
}

/** Espera a que la batalla acabe de contarse: lo que tarda la cola de lo que se acaba de jugar. */
async function esperarCola(battle: BattleState, nuevos: readonly BattleEvent[]): Promise<void> {
  await sleep(250 + duracionDeLaJugada(battle, nuevos));
}

/**
 * La rueda del golpe en la batalla del juego (F5): mientras el espejo espera una
 * elección de la persona —su golpe, o su respuesta cuando la golpean—, espera a
 * que la página abra la rueda en esa fase (tras contar la marcha), pulsa la tecla
 * de `tipo` y lo replica en el espejo; y espera a que la página cuente el cruce,
 * para no leer la rueda de antes como la siguiente.
 */
async function responderLaRueda(
  page: Page,
  espejo: Session | SesionDeArena,
  tipo: TipoDeGolpe = 'normal',
) {
  for (let i = 0; i < 20 && espejo.ruedaPendiente !== null; i++) {
    const { fase } = espejo.ruedaPendiente;
    await page
      .locator(`#rueda[open] .rueda[data-fase="${fase}"]`)
      .waitFor({ timeout: 20000 })
      .catch(async () => {
        throw new Error(
          `la página no abre la rueda en la fase «${fase}» (barra: «${await page.locator('#status').innerText()}»)`,
        );
      });
    await page.keyboard.press(teclaDe(tipo));
    espejo.elegirEnLaRueda(tipo);
    // Su desenlace, también cuando el espejo ya pide otra respuesta: con dos
    // seguidas (dos golpes del rival a la tropa), esperar solo a la «respuesta»
    // encontraba aún abierta la de antes, la tecla se perdía y la página se
    // quedaba pidiendo la segunda mientras el espejo seguía (escritorio, en la
    // fusión del héroe en la base con la complejidad, 22-10-2026).
    await page.locator('#rueda .rueda[data-fase="desenlace"]').waitFor({ timeout: 20000 });
  }
}

/**
 * Lo mismo que `responderLaRueda` sin página: las búsquedas de semilla juegan
 * solo el espejo, y la persona elige lo mismo que elegirá en la pasada. La
 * respuesta se le pide siempre que la golpean cuerpo a cuerpo (F5), así que una
 * pauta que no la contesta se queda sin turno propio.
 */
function contestarEnElEspejo(espejo: SesionDeArena, tipo: TipoDeGolpe = 'normal'): void {
  for (let i = 0; i < 20 && espejo.ruedaPendiente !== null; i++) espejo.elegirEnLaRueda(tipo);
}

/**
 * «Fin de turno» del espejo, ya pulsado en la página. Si el rival ataca a la
 * persona por el camino (#116, F5), la defensa la juega ella: se resuelve sola en
 * la página y en el espejo (`defenderseSola`) y el turno del rival sigue, las veces
 * que haga falta. Antes la pasada decía que no jugaba defensas y paraba, y desde
 * que el juego pelea con los ejércitos de la arena el rival ataca la base de la
 * pasada de escritorio el día 3 (19-10-2026).
 */
async function pasarElTurnoDelEspejo(page: Page, espejo: Session, donde: string): Promise<void> {
  // La señal de la defensa se arma antes de que el turno empiece: el rival puede
  // atacar en la primera jugada, y `alCambiarSinGesto` llega una sola vez.
  let avisar = (): void => {};
  espejo.alCambiarSinGesto = () => avisar();
  const siDefiende = (): Promise<'defensa'> =>
    new Promise((r) => {
      avisar = () => r('defensa');
    });
  let defensa = siDefiende();
  const turno = espejo.endTurn().then(() => 'pasado' as const);
  for (let n = 0; n < 20; n++) {
    if ((await Promise.race([turno, defensa])) === 'pasado') return;
    defensa = siDefiende();
    await defenderseSola(page, espejo, donde);
  }
  throw new Error(`${donde}: el rival atacó a la persona 20 veces en un turno`);
}

/**
 * Una defensa (#116) resuelta sola, en la página y en el espejo: se contesta la
 * rueda si el rival golpeó primero —con ella abierta, «Resolver sola» sale apagado
 * (H3 de QA, 19-10-2026)—, se espera a que la página cuente lo jugado y se pulsa.
 */
async function defenderseSola(page: Page, espejo: Session, donde: string): Promise<void> {
  const battle = espejo.battle;
  if (battle === null) throw new Error(`${donde}: el espejo defiende sin batalla`);
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 20_000 });
  await responderLaRueda(page, espejo);
  await esperarCola(battle, battle.log);
  const resolver = page.locator('#actions [data-action="auto-battle"]:enabled');
  await resolver.waitFor({ timeout: 20_000 }).catch(async () => {
    throw new Error(
      `${donde}: «Resolver sola» no se enciende en la defensa (barra: «${await page.locator('#status').innerText()}»)`,
    );
  });
  await resolver.click();
  espejo.autoResolveBattle();
  if (espejo.battle !== null)
    throw new Error(`${donde}: «Resolver sola» no cierra la defensa: ${espejo.status}`);
  log(`${donde}: el rival atacó a la persona; la defensa se resolvió sola`);
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
  //
  // Con héroes que aún pueden andar, «Fin de turno» no pasa: pregunta en la
  // barra (#17) y el botón deja su sitio a «Seguir jugando» / «Terminar el
  // turno». El guion pasa el día a propósito, así que contesta que sí. Antes
  // esperaba un «Fin de turno» que la pregunta había quitado y moría (#213).
  const antes = await page.locator('#day').innerText();
  const confirmar = page.getByRole('button', { name: 'Terminar el turno' });
  for (let intento = 0; ; intento++) {
    if (await confirmar.isVisible()) await confirmar.click();
    else await page.getByRole('button', { name: 'Fin de turno' }).click();
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
  await pasarElTurnoDelEspejo(page, espejo, `«Fin de turno» en ${antes}`);
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

/**
 * Lo que se deja libre en los bordes del lienzo al arrastrar el mapa: el
 * arrastre empieza y acaba lejos de ellos, y abajo lejos de los botones de la
 * cámara, que se llevarían el `pointerdown`.
 */
const HOLGURA_DEL_ARRASTRE = { lados: 40, arriba: 40, abajo: 120 } as const;
/**
 * Por debajo de esto no se arrastra: el cliente lee un gesto de 8 px o menos
 * (`UMBRAL_ARRASTRE`) como un CLIC, y un clic en el mapa mueve al héroe.
 */
const ARRASTRE_MINIMO = 20;

/**
 * El mapa de aventura de la página en píxeles. La cámara la lleva la MISMA
 * escena del cliente (`EscenaAventura`) sobre el espejo, con los gestos que se
 * le hacen a la página —rueda, arrastre, «Centrar héroe»—: sigue al héroe
 * cuando se mueve, se queda donde la dejó un arrastre, acota en los bordes.
 * Antes la cuenta suponía la cámara siempre en el héroe, y por eso las guardias
 * lejanas se buscaban alejando la vista a ojo (#131).
 */
class Mapa {
  private readonly escena: EscenaAventura;
  constructor(
    readonly page: Page,
    private readonly espejo: Session,
  ) {
    this.escena = new EscenaAventura(() => espejo);
  }

  /** Píxeles por casilla de la cámara de ahora. */
  get tile(): number {
    return this.escena.camaraActual.tile;
  }

  /**
   * La caja del lienzo y el encuadre, con la cámara de la escena puesta al día:
   * la recentra en el héroe si se ha movido, como hace la página en cada fotograma.
   */
  async encuadre(): Promise<{ b: Caja; e: Encuadre }> {
    const b = await caja(this.page);
    // `encuadreDe` compone el escenario de la partida, y con él hecho la escena
    // tiene el tope de alejar que tiene la página; sin él tomaría el de
    // legibilidad mientras «se compone».
    const e = encuadreDe(b, this.espejo);
    this.escena.encuadrar(b.width, b.height);
    return { b, e };
  }

  /** Dónde cae en la página el centro de una casilla, con la cámara de ahora. */
  async pixel(p: Point): Promise<{ x: number; y: number }> {
    const { b } = await this.encuadre();
    const c = casillaAPixel(this.escena.camaraActual, p);
    return { x: b.x + c.x, y: b.y + c.y };
  }

  /**
   * Un paso de rueda sobre el centro del lienzo, en la página y en la escena:
   * el zoom lo calcula la MISMA función que el cliente, topes incluidos.
   */
  async rueda(direccion: 1 | -1): Promise<void> {
    const { b, e } = await this.encuadre();
    await this.page.mouse.move(b.x + e.ancho / 2, b.y + e.alto / 2);
    await this.page.mouse.wheel(0, direccion === 1 ? -200 : 200);
    this.escena.zoom(direccion);
    await sleep(100);
  }

  /**
   * Arrastra el mapa `dx, dy` píxeles enteros, de un punto del lienzo a otro.
   * El movimiento va de un solo paso: el primer `pointermove` ya pasa el umbral
   * y la escena no llega a señalar la casilla de debajo.
   */
  async arrastrar(dx: number, dy: number): Promise<void> {
    if (Math.abs(dx) + Math.abs(dy) < ARRASTRE_MINIMO) {
      throw new Error(`un arrastre de (${dx},${dy}) px lo leería el cliente como un clic`);
    }
    const { b } = await this.encuadre();
    const h = HOLGURA_DEL_ARRASTRE;
    const izquierda = Math.ceil(b.x + h.lados);
    const derecha = Math.floor(b.x + b.width - h.lados);
    const arriba = Math.ceil(b.y + h.arriba);
    const abajo = Math.floor(b.y + b.height - h.abajo);
    if (Math.abs(dx) > derecha - izquierda || Math.abs(dy) > abajo - arriba) {
      throw new Error(
        `un arrastre de (${dx},${dy}) px no cabe en el lienzo de ${b.width}×${b.height}`,
      );
    }
    const x0 = dx > 0 ? izquierda : derecha;
    const y0 = dy > 0 ? arriba : abajo;
    await this.page.mouse.move(x0, y0);
    await this.page.mouse.down();
    await this.page.mouse.move(x0 + dx, y0 + dy);
    await this.page.mouse.up();
    this.escena.bajar(x0 - b.x, y0 - b.y);
    this.escena.mover(x0 + dx - b.x, y0 + dy - b.y);
    if (this.escena.soltar())
      throw new Error(`la escena leyó como clic el arrastre de (${dx},${dy}) px`);
    await sleep(100);
  }

  /**
   * Lleva la cámara a `p` arrastrando el mapa, como lo haría la persona: en
   * tramos que quepan en el lienzo, hasta que `p` quede en el centro o la
   * cámara no pueda ir más allá del borde del mapa.
   */
  async mirar(p: Point): Promise<void> {
    const h = HOLGURA_DEL_ARRASTRE;
    for (let tramo = 0; tramo < 8; tramo++) {
      const { b, e } = await this.encuadre();
      const camara = this.escena.camaraActual;
      const destino = centrarEn(camara, p, e);
      const dx = Math.round((camara.x - destino.x) * camara.tile);
      const dy = Math.round((camara.y - destino.y) * camara.tile);
      if (Math.abs(dx) + Math.abs(dy) < ARRASTRE_MINIMO) return;
      const anchoUtil = Math.floor(b.width - 2 * h.lados) - 1;
      const altoUtil = Math.floor(b.height - h.arriba - h.abajo) - 1;
      const paso = (v: number, tope: number) => Math.max(-tope, Math.min(tope, v));
      await this.arrastrar(paso(dx, anchoUtil), paso(dy, altoUtil));
    }
    throw new Error(`la cámara no llega a (${p.x},${p.y}) en ocho arrastres`);
  }

  /** «Centrar héroe», en la página y en la escena. */
  async centrarHeroe(): Promise<void> {
    await this.page.getByRole('button', { name: 'Centrar héroe' }).click();
    this.escena.centrar();
    await sleep(200);
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
 * Una escena de batalla sobre el espejo, ya en hora y encuadrada en el lienzo de
 * la página: la MISMA clase que lee los clics allí. Es la única forma que tiene
 * este guion de convertir un píxel en una acción, así que lo que aplica el
 * espejo es por construcción lo que manda la página.
 */
function escenaDelEspejo(espejo: ControlDeBatalla, ancho: number, alto: number): EscenaBatalla {
  const escena = new EscenaBatalla(() => espejo);
  escena.sincronizar(Number.MAX_SAFE_INTEGER);
  escena.encuadrar(ancho, alto);
  return escena;
}

/**
 * Dónde pulsar una unidad: un punto de su cuerpo que el cliente lea como ESA
 * unidad. Lo decide una escena de batalla sobre el espejo —la misma clase que en
 * la página—, porque el centro de un hex al que se puede ir gana a la figura que
 * lo tapa, y el medio del cuerpo puede caer justo ahí.
 */
async function pixelDeUnidad(
  page: Page,
  espejo: ControlDeBatalla,
  s: BattleStack,
): Promise<{ x: number; y: number; accion: BattleAction | undefined }> {
  const b0 = await caja(page);
  const t0 = tableroPara(b0.width, b0.height);
  const b = await alcanzar(page, centroHex(t0, s.hex).x);
  const t = tableroPara(b.width, b.height);
  const c = cajaDeFigura(t, centroDeStack(stackHexes(s)));
  const escena = escenaDelEspejo(espejo, b.width, b.height);
  for (const alto of [0.5, 0.35, 0.65, 0.8, 0.2]) {
    // En un píxel entero de la página: el ratón llega entero al navegador, y
    // con la caja en media fila (el móvil, `y` 45,78) el espejo leía otro punto.
    // Junto a la bisectriz de dos casillas, ese medio píxel cambiaba desde dónde
    // se golpea: la página se plantaba en (4,3) y el espejo en (3,3).
    const px = Math.round(b.x + c.x);
    const py = Math.round(b.y + c.suelo - c.alto * alto);
    const [x, y] = [px - b.x, py - b.y];
    if (escena.objetivoEn(x, y)?.id === s.id) {
      // La acción que el cliente mandará al pulsar AHÍ: con el ángulo, el píxel
      // decide desde qué casilla se golpea, así que el espejo tiene que saberlo.
      return { x: px, y: py, accion: escena.accionContraEn(x, y) };
    }
  }
  throw new Error(`no hay un punto del cuerpo de ${s.id} que el clic lea como suyo`);
}

/**
 * Mueve la unidad activa en dos tramos con dos clics, pasa el ratón por el
 * enemigo hasta que la barra dice desde dónde golpearía, saca la captura y
 * pulsa. Cada paso se replica en el espejo y se comprueba contra él: el turno
 * sigue abierto tras cada tramo y el golpe sale de la casilla resaltada.
 */
async function moverDosTramosYAtacar(
  page: Page,
  espejo: Session,
  plan: PlanDeAngulo,
): Promise<readonly BattleEvent[]> {
  const battle = espejo.battle as BattleState;
  const activo = espejo.turnoPropio?.stack.id;
  const turnoDelPlan = battle.turno;
  for (const [i, tramo] of plan.tramos.entries()) {
    if (tramo.type !== 'move') throw new Error('un tramo del plan no es un move');
    const antes = battle.log.length;
    const b0 = await caja(page);
    const c = centroHex(tableroPara(b0.width, b0.height), tramo.to);
    const b = await alcanzar(page, c.x);
    await page.mouse.click(b.x + c.x, b.y + c.y);
    espejo.playBattleAction(tramo);
    await esperarCola(battle, battle.log.slice(antes));
    await sleep(150);
    // El mismo turno, por su ordinal: la misma unidad activa en un turno nuevo
    // (la de la ronda siguiente) no es el tramo siguiente.
    if (!mismoTurno(turnoDelPlan, battle.turno)) {
      throw new Error(`tras el tramo ${i + 1} el turno de ${activo} debía seguir abierto`);
    }
    // Y la PÁGINA tiene que decir lo mismo que el espejo: el espejo se mueve
    // siempre, y si el clic no hubiera movido en la página las dos partidas se
    // separarían sin que nada lo dijera hasta mucho después.
    const esperadas = quedanCasillas(espejo.battleStepsLeft() ?? 0)[1];
    const fila = page.locator('.row', { hasText: /Le queda/ }).first();
    await fila
      .filter({ hasText: esperadas })
      .waitFor({ timeout: 2000 })
      .catch(async () => {
        throw new Error(
          `tras el tramo ${i + 1} la página dice «${await fila.innerText()}» y el espejo «${esperadas}» (barra: «${await page.locator('#status').innerText()}»)`,
        );
      });
  }
  const quedan = await page
    .locator('.row', { hasText: /Le queda/ })
    .first()
    .innerText();
  log(`dos tramos: ${activo} sigue activo — «${quedan.replace(/\s+/g, ' ')}»`);

  const objetivo = battle.stacks.find((x) => x.id === plan.objetivo) as BattleStack;
  const b0 = await caja(page);
  const b = await alcanzar(page, centroHex(tableroPara(b0.width, b0.height), objetivo.hex).x);
  const t = tableroPara(b.width, b.height);
  const k = cajaDeFigura(t, centroDeStack(stackHexes(objetivo)));
  const px = k.x + plan.lado * k.ancho;
  const py = k.suelo - k.alto * plan.alto;
  const turno = espejo.turnoPropio;
  if (turno === null) throw new Error('el turno de la persona se ha cerrado antes de atacar');
  const accion = escenaDelEspejo(espejo, b.width, b.height).accionContraEn(px, py);
  if (accion === undefined || accion.type !== 'attack' || accion.target !== objetivo.id) {
    throw new Error(`el píxel elegido no da un golpe contra ${objetivo.id}`);
  }
  const desde = accion.from ?? turno.stack.hex;
  // El ratón se mueve en dos pasos para que el navegador mande `pointermove`
  // dentro del lienzo, que es lo que pinta el ángulo y escribe la barra.
  await page.mouse.move(b.x + px - 8, b.y + py);
  await page.mouse.move(b.x + px, b.y + py);
  // La frase exacta, de la misma función que la escribe en la página.
  // Con la previsión del golpe, de la misma cuenta del núcleo (`Session.prevision`).
  const prevista = espejo.prevision(accion);
  if (prevista === null) throw new Error('el golpe del ángulo no tiene previsión');
  const rotulo = rotuloDeAngulo(
    desde,
    cargaContra(espejo.battleCharges(), { objetivo: objetivo.id, elegida: desde }),
    textoDePrevision(prevista, (id) =>
      nombreEnElCampo(battle, battle.stacks.find((x) => x.id === id) as BattleStack),
    ),
  );
  await page
    .waitForFunction((r) => document.getElementById('status')?.textContent?.trim() === r, rotulo, {
      timeout: 2000,
    })
    .catch(async () => {
      throw new Error(
        `la barra debía decir «${rotulo}» y dice «${await page.locator('#status').innerText()}»`,
      );
    });
  await captura(page, 'desktop-08b-batalla-angulo');
  log(`ángulo: la barra dice «${await page.locator('#status').innerText()}»`);
  const antes = battle.log.length;
  await page.mouse.click(b.x + px, b.y + py);
  espejo.playBattleAction(accion);
  await responderLaRueda(page, espejo);
  const nuevos = battle.log.slice(antes);
  const golpeDesde = nuevos.find((e) => e.kind === 'move' && e.stack === activo);
  const llego = golpeDesde?.kind === 'move' ? golpeDesde.to : turno.stack.hex;
  if (!hexEquals(llego, desde)) {
    throw new Error(`el golpe debía salir de (${desde.col},${desde.row}) y salió de otra casilla`);
  }
  return nuevos;
}

/**
 * Juega un turno de la persona en la batalla con un clic, y lo replica en el
 * espejo. Con `anguloPendiente`, en cuanto hay ocasión juega «mover dos tramos y
 * atacar desde un ángulo» en vez del clic de siempre, y devuelve si lo ha hecho:
 * quien llama lleva la cuenta, no una variable del módulo.
 */
async function turnoDeBatalla(
  page: Page,
  espejo: Session,
  n: number,
  rendirse = false,
  anguloPendiente = false,
): Promise<boolean> {
  const battle = espejo.battle;
  if (battle === null) throw new Error('no hay batalla en el espejo');
  // Si la batalla esperaba la respuesta de la persona (la golpearon al empezar).
  await responderLaRueda(page, espejo);
  if (battle.finished !== null) return false;
  const antes = battle.log.length;
  const acciones = espejo.battleLegalActions();

  // Las cuatro primeras, a propósito: terminar sin moverse, lo que toque, un hechizo y lo que toque.
  // La quinta, rendirse si se ofrece y la pasada lo pide (fase 1b): es la única
  // acción que cierra la batalla y manda al héroe a casa, y la cuarta ya mira el
  // aviso de espera. Solo la pide la de escritorio: la del móvil juega la suya.
  const hechizo = espejo.spellOptions().find((o) => o.castable);
  // La rendición cierra la batalla, así que espera a que se haya jugado el
  // ángulo si la pasada lo pide: los dos tienen que salir en la misma batalla.
  const tocaRendirse = rendirse && n >= 4 && !anguloPendiente;
  if (tocaRendirse && acciones.some((a) => a.type === 'surrender')) {
    await page.getByRole('button', { name: /Rendirse/ }).click();
    espejo.playBattleAction({ type: 'surrender' });
    await esperarCola(battle, battle.log.slice(antes));
    await sleep(300);
    await captura(page, 'desktop-07-rendicion');
    log(`rendición: ${espejo.status}`);
    return false;
  }
  const b0 = await caja(page);
  const plan = anguloPendiente && n >= 3 ? planDeAngulo(espejo, b0.width, b0.height) : null;
  if (plan !== null) {
    const nuevos = await moverDosTramosYAtacar(page, espejo, plan);
    if (n === 3 && nuevos.some((e) => e.kind in DURACION || e.kind === 'move')) {
      await avisoQueSeRetira(page, battle, nuevos);
      return true;
    }
    await esperarCola(battle, nuevos);
    return true;
  }
  if (n === 0) {
    // La primera jugada cierra el turno sin moverse: «Terminar turno» es lo que
    // queda desde que se retiraron «Esperar» y «Defender» (26-10-2026).
    await page.getByRole('button', { name: 'Terminar turno' }).click();
    espejo.playBattleAction({ type: 'end_turn' });
  } else if (n === 2 && hechizo !== undefined) {
    const objetivoId = hechizo.targets[0] as string;
    await page.getByRole('button', { name: new RegExp(hechizo.name) }).click();
    espejo.hechizos.selectSpell(hechizo.id);
    await sleep(200);
    await captura(page, 'desktop-06-batalla-apuntando-hechizo');
    const objetivo = battle.stacks.find((s) => s.id === objetivoId) as BattleStack;
    const px = await pixelDeUnidad(page, espejo, objetivo);
    const cast = acciones.find(
      (a) => a.type === 'cast' && a.spell === hechizo.id && a.target === objetivoId,
    ) as BattleAction;
    // La previsión del hechizo en la batalla del JUEGO, no solo en la arena (QA
    // del banco, vuelta 1): el puntero sobre el objetivo, la barra dice lo que
    // dice el núcleo para el espejo, y el clic hace eso.
    await page.mouse.move(px.x - 6, px.y);
    await page.mouse.move(px.x, px.y);
    const prevista = espejo.prevision(cast);
    if (prevista === null || prevista.kind !== 'hechizo') {
      throw new Error(`el hechizo ${hechizo.id} del juego no tiene previsión`);
    }
    const nombre = (id: string): string =>
      nombreEnElCampo(battle, battle.stacks.find((x) => x.id === id) as BattleStack);
    const dicha = textoDePrevision(prevista, nombre);
    await page
      .waitForFunction((r) => document.getElementById('status')?.textContent?.trim() === r, dicha, {
        timeout: 3000,
      })
      .catch(async () => {
        throw new Error(
          `la previsión de ${hechizo.id} en el juego debía decir «${dicha}» y la barra dice «${await page.locator('#status').innerText()}»`,
        );
      });
    await captura(page, 'desktop-06b-batalla-prevision-hechizo');
    await page.mouse.click(px.x, px.y);
    const desde = battle.log.length;
    espejo.playBattleAction(cast);
    const lanzado = battle.log.slice(desde).find((e) => e.kind === 'cast');
    if (
      prevista.danio !== null &&
      (lanzado?.kind !== 'cast' || lanzado.damage !== prevista.danio)
    ) {
      throw new Error(
        `${hechizo.id} hizo ${JSON.stringify(lanzado)} y la previsión decía ${prevista.danio}`,
      );
    }
    log(`juego: previsión de ${hechizo.id} — «${dicha}»`);
  } else {
    const ia = chooseBattleAction(battle);
    const objetivo =
      ia.type === 'attack'
        ? battle.stacks.find((s) => s.id === ia.target)
        : ia.type === 'aim'
          ? battle.stacks.find((s) => isAlive(s) && hexEquals(s.hex, ia.at))
          : undefined;
    if (objetivo !== undefined) {
      // La acción que el cliente emitirá al pulsar ese objetivo EN ESE PÍXEL: el
      // espejo tiene que aplicar ESA, no la que eligió la IA.
      const px = await pixelDeUnidad(page, espejo, objetivo);
      if (px.accion === undefined) throw new Error(`el clic sobre ${objetivo.id} no da acción`);
      await page.mouse.click(px.x, px.y);
      espejo.playBattleAction(px.accion);
    } else if (ia.type === 'move') {
      const b0 = await caja(page);
      const c = centroHex(tableroPara(b0.width, b0.height), ia.to);
      const b = await alcanzar(page, c.x);
      await page.mouse.click(b.x + c.x, b.y + c.y);
      espejo.playBattleAction(ia);
    } else if (ia.type === 'surrender') {
      // La IA puede elegir rendirse (fase 1b): se pulsa SU botón.
      await page.getByRole('button', { name: /Rendirse/ }).click();
      espejo.playBattleAction(ia);
    } else {
      // Lo demás —cerrar el turno, y el hechizo, que aquí no se le sigue: lanzar
      // a clics ya lo ejerce la jugada 2 en el escritorio, y en el marco estrecho
      // del móvil el objetivo puede quedar fuera— se juega con «Terminar turno»,
      // en la página Y en el espejo: si no, las dos partidas se separan sin que
      // nada lo diga hasta el aviso de espera.
      await page.getByRole('button', { name: 'Terminar turno' }).click();
      espejo.playBattleAction({ type: 'end_turn' });
    }
  }
  await responderLaRueda(page, espejo);
  const nuevos = battle.log.slice(antes);
  if (n === 3 && nuevos.some((e) => e.kind in DURACION || e.kind === 'move')) {
    await avisoQueSeRetira(page, battle, nuevos);
    return false;
  }
  await esperarCola(battle, nuevos);
  return false;
}

/**
 * Pulsa el lienzo mientras la jugada se cuenta: la barra tiene que decir que se
 * espere, y en cuanto la cola se vacía tiene que dejar de decirlo. Antes el
 * aviso se quedaba hasta el siguiente gesto.
 *
 * Los botones no se pulsan: mientras se cuenta salen apagados (#165), y lo que
 * se comprueba es eso, que «Resolver sola» está apagado durante la jugada y
 * encendido al acabar. Antes salía encendido y el clic pedía un segundo.
 */
async function avisoQueSeRetira(
  page: Page,
  battle: BattleState,
  nuevos: readonly BattleEvent[],
): Promise<void> {
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
  const resolver = page.locator('#actions [data-action="auto-battle"]');
  if (!(await resolver.isDisabled())) {
    throw new Error('durante la jugada «Resolver sola» debía estar apagado y está encendido');
  }
  await captura(page, 'desktop-batalla-contando-la-jugada');
  await esperarCola(battle, nuevos);
  await sleep(100);
  const despues = await page.locator('#status').innerText();
  if (despues === AVISO_DE_ESPERA) {
    throw new Error('la jugada ha terminado y la barra sigue diciendo que se espere');
  }
  if (await resolver.isDisabled()) {
    throw new Error('la jugada ha terminado y «Resolver sola» sigue apagado');
  }
  log(
    `aviso de espera: «${durante}» durante la jugada, «${despues}» al acabar; «Resolver sola» apagado y luego encendido`,
  );
}

// --------------------------------------------------------------------- partidas

/**
 * Espera a que los iconos de los recursos sustituyan a sus muestras de color: la
 * barra crece entonces (1,4 px en escritorio, 3,4 en el móvil) y el lienzo baja
 * otro tanto. Midiendo antes, con la máquina cargada (carga ~40, 09-10-2026), la
 * caja era la de la barra sin iconos y la partida de la pasada, abierta tras
 * pintar el suelo, ya no cuadraba.
 */
async function conLosIconosDeLaBarra(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#resources .swatch').length === 0 &&
      [...document.querySelectorAll<HTMLImageElement>('#resources img')].every((i) => i.complete),
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * La caja del lienzo de escritorio, medida en una página de verdad: lo que una
 * búsqueda en el espejo llama «a la vista» depende de ella, y la partida no la
 * cambia (`abrir` lo comprueba con `esperada`). Se mide una vez por corrida.
 */
let cajaMedida: Promise<Caja> | null = null;
function cajaDeEscritorio(browser: Browser, url: string, problemas: Problemas): Promise<Caja> {
  cajaMedida ??= (async () => {
    const { page } = await abrir(browser, url, problemas, {
      nombre: 'medir el lienzo',
      semilla: 1,
      sinSuelo: true,
    });
    await conLosIconosDeLaBarra(page);
    const b = await caja(page);
    await page.close();
    log(
      `lienzo de escritorio: ${b.width}×${b.height} en (${b.x},${b.y}), con el que se buscan las escenas`,
    );
    return b;
  })();
  return cajaMedida;
}

/** Lo mismo con el marco del móvil (390×844): con él se busca la semilla del móvil y del dedo. */
let cajaMovilMedida: Promise<Caja> | null = null;
function cajaDeMovil(browser: Browser, url: string, problemas: Problemas): Promise<Caja> {
  cajaMovilMedida ??= (async () => {
    const { page } = await abrir(browser, url, problemas, {
      nombre: 'medir el lienzo del móvil',
      semilla: 1,
      movil: true,
      sinSuelo: true,
    });
    await conLosIconosDeLaBarra(page);
    const b = await caja(page);
    await page.close();
    log(
      `lienzo del móvil: ${b.width}×${b.height} en (${b.x},${b.y}), con el que se busca su semilla`,
    );
    return b;
  })();
  return cajaMovilMedida;
}

/** La semilla del móvil y del dedo, buscada una vez por corrida: las dos pasadas la comparten. */
let semillaMovilBuscada: Promise<number> | null = null;
function semillaDelMovil(browser: Browser, url: string, problemas: Problemas): Promise<number> {
  semillaMovilBuscada ??= (async () => {
    const semilla = buscarMovil(await cajaDeMovil(browser, url, problemas));
    log(`móvil y táctil: semilla ${semilla}, buscada en el espejo`);
    return semilla;
  })();
  return semillaMovilBuscada;
}

interface Pasada {
  readonly nombre: string;
  readonly semilla: number;
  readonly movil?: boolean;
  /** Imágenes que se le niegan al navegador; su 404 es la prueba, no un fallo. */
  readonly sinImagenes?: RegExp;
  /** La caja con la que se buscó la escena en el espejo: si la página da otra, lo buscado no vale. */
  readonly esperada?: Caja;
  /** Solo mide la página y no saca capturas: no espera a que se pinte el suelo. */
  readonly sinSuelo?: boolean;
}

/**
 * La partida empieza en la base, con el héroe dentro: sale al mapa con el gesto
 * de quien juega —«Volver al mapa» con el ratón o tocándolo (la pasada táctil), o
 * Escape— y espera a estar en él. El espejo no abre la base: salir no toca la
 * partida.
 */
async function salirDeLaBase(
  page: Page,
  quien: string,
  gesto: 'clic' | 'toque' | 'escape' = 'clic',
): Promise<void> {
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 }).catch(async () => {
    const escena = await page.locator('#app').getAttribute('data-escena');
    throw new Error(`${quien}: la partida no empezó en la base (está en «${escena}»)`);
  });
  const volver = page.locator('[data-action="close-town"]');
  if (gesto === 'toque') await volver.tap();
  else if (gesto === 'clic') await volver.click();
  else await page.keyboard.press('Escape');
  await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 10_000 });
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
  await page.goto(`${url}${urlDePartida(p.semilla)}`, { waitUntil: 'networkidle' });
  await salirDeLaBase(page, p.nombre);
  if (p.sinSuelo !== true) await esperarElSuelo(page, p.nombre, 60_000, log);
  await sleep(450);
  if (p.esperada !== undefined) {
    const b = await caja(page);
    const e = p.esperada;
    if (b.x !== e.x || b.y !== e.y || b.width !== e.width || b.height !== e.height) {
      throw new Error(
        `${p.nombre}: la escena se buscó con el lienzo en ${e.width}×${e.height} (${e.x},${e.y}) ` +
          `y la semilla ${p.semilla} lo abre en ${b.width}×${b.height} (${b.x},${b.y})`,
      );
    }
  }
  return { page, espejo, mapa: new Mapa(page, espejo) };
}

/** Lo que dice la página de su arranque: qué se ve, qué tema lleva, qué pide la URL y qué tiene el foco. */
async function estadoDelArranque(page: Page): Promise<{
  readonly menu: boolean;
  readonly app: boolean;
  readonly escena: string | null;
  readonly escenario: string | null;
  readonly tema: string | null;
  readonly search: string;
  readonly foco: string | null;
}> {
  return page.evaluate(() => {
    const app = document.getElementById('app') as HTMLElement;
    const inicio = document.getElementById('inicio') as HTMLElement;
    const foco = document.activeElement;
    return {
      menu: !inicio.hidden,
      app: !app.hidden,
      escena: app.dataset.escena ?? null,
      escenario: app.dataset.escenario ?? null,
      tema: document.documentElement.dataset.tema ?? null,
      // Sin el `clima=despejado,dia` que pone el arnés (`conElClimaDespejado`): lo
      // que se mira es lo que escribe la página.
      search: ((): string => {
        const p = new URLSearchParams(location.search);
        p.delete('clima');
        const q = p.toString();
        return q === '' ? '' : `?${q}`;
      })(),
      foco:
        foco?.getAttribute('data-inicio') ??
        (foco instanceof HTMLInputElement ? `${foco.name}:${foco.value}` : null),
    };
  });
}

/** Lanza diciendo el paso y lo que había si `vale` no se cumple. */
function exigir<T>(cosa: T, vale: (x: T) => boolean, paso: string): void {
  if (!vale(cosa))
    throw new Error(`arranque: ${paso}; la página está así: ${JSON.stringify(cosa)}`);
}

/**
 * En `pnpm dev` (y aquí se corre `vite` en modo desarrollo), «Empezar» lleva a «El
 * mundo» (`desarrollo/mundo.ts`, F1a del mapa vivo), que generaría uno con el motor
 * de narrativa: estas pasadas juegan el procedimental, por su botón, «Jugar sin
 * historia». La pantalla **se exige**: si «Empezar» fuera derecho a la partida, el
 * flujo de `pnpm dev` habría cambiado sin que nadie lo dijera, y aceptar las dos
 * lo callaba. Con `nombre`, se captura antes la pantalla.
 */
async function sinHistoria(page: Page, nombre: string | null, tocar = false): Promise<void> {
  await page
    .waitForSelector('[data-mundo="eleccion"]', { timeout: 30_000 })
    .catch((err: unknown) => {
      throw new Error(
        `arranque: «Empezar» en pnpm dev no lleva a «El mundo» (desarrollo/mundo.ts): ${err instanceof Error ? err.message : err}`,
      );
    });
  if (nombre !== null) await captura(page, nombre);
  const boton = page.locator('[data-mundo="sin-historia"]');
  if (tocar) {
    await boton.scrollIntoViewIfNeeded();
    const caja = await boton.boundingBox();
    if (caja === null) throw new Error('«Jugar sin historia» no se ve');
    await page.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2);
  } else await boton.click();
}

/**
 * Si la query `search` pide exactamente `esperado`, sin mirar el orden: el héroe
 * se escribe al elegirlo, detrás de la complejidad del combate, que va desde el
 * principio (fusión del héroe en la base con la complejidad, 22-10-2026).
 */
function mismaQuery(search: string, esperado: Readonly<Record<string, string>>): boolean {
  const q = new URLSearchParams(search);
  const claves = [...new Set(q.keys())];
  return (
    claves.length === Object.keys(esperado).length &&
    Object.entries(esperado).every(([k, v]) => q.getAll(k).length === 1 && q.get(k) === v)
  );
}

/**
 * La pantalla de inicio (19-10-2026): `/` sin nada pide qué jugar y no monta la
 * partida hasta elegir (ni escena ni suelo); «Cargar partida» no hace nada, ni
 * con el teclado; «Nuevo juego» lleva a la elección, que viste la página con la
 * facción marcada (el clic o las flechas; pasar el ratón o el foco, no) y vuelve
 * al neutro con Escape; «Empezar» escribe `?seed=N&faccion=<id>` y abre la base de
 * esa facción ante el ayuntamiento (22-10-2026), con un candidato a héroe por tipo
 * y el oro entero; pulsar uno en el lienzo cambia la ficha (su retrato, su precio);
 * recargar a media elección vuelve a preguntar igual; «Contratar» lo cobra, vuelve
 * a la base con él dentro, pintado con la hoja de su tipo (no el Y Bot), y deja
 * `&heroe=<tipo>` en la URL; al salir, el mapa con el tema; recargar entra sin menú
 * y sin elegir en la misma partida. Y la rápida (con su héroe por defecto en la
 * URL), una facción que no existe y un héroe que no es de la facción.
 */
async function arranque(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  // Las tres páginas de la pasada en un contexto: lo que cambia entre ellas es la
  // URL, no el navegador.
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contexto.newPage();
  vigilarConsola(page, 'arranque', problemas);
  await page.goto(`${url}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#inicio:not([hidden]) [data-inicio="nuevo"]');
  await sleep(300);
  exigir(
    await estadoDelArranque(page),
    (e) =>
      e.menu &&
      !e.app &&
      e.escenario === null &&
      e.tema === null &&
      e.search === '' &&
      e.foco === 'nuevo',
    'en «/» tiene que verse solo el menú, sin partida montada, sin tema, sin nada en la URL y con el foco en «Nuevo juego»',
  );
  await captura(page, 'inicio-01-menu');

  // «Cargar partida»: el teclado llega, Intro y el clic no hacen nada.
  await page.keyboard.press('Tab');
  exigir(await estadoDelArranque(page), (e) => e.foco === 'cargar', 'Tab lleva a «Cargar partida»');
  await page.keyboard.press('Enter');
  // Playwright no pulsa lo que lleva `aria-disabled`: se le obliga, como el ratón.
  await page.locator('[data-inicio="cargar"]').click({ force: true });
  await sleep(300);
  exigir(
    await estadoDelArranque(page),
    (e) => e.menu && e.search === '' && e.foco === 'cargar',
    '«Cargar partida» no hace nada',
  );
  const motivo = await page.locator('#sin-partidas').innerText();
  if (!/no hay partidas guardadas/i.test(motivo))
    throw new Error(`arranque: «Cargar partida» no dice por qué: «${motivo}»`);

  // «Nuevo juego», con el teclado: la elección, con la marcada vestida; Escape
  // vuelve al neutro.
  await page.mouse.move(5, 5);
  await page.locator('[data-inicio="nuevo"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-inicio="eleccion"]');
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0] && e.foco === `faccion:${FACTION_IDS[0]}`,
    `la elección empieza con ${FACTION_IDS[0]} marcada, enfocada y vestida`,
  );
  const opciones = await page.locator('.opcion-de-faccion').count();
  if (opciones !== FACTION_IDS.length)
    throw new Error(`arranque: la elección trae ${opciones} facciones y son ${FACTION_IDS.length}`);
  await captura(page, 'inicio-02-eleccion');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-inicio="nuevo"]');
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === null,
    'Escape vuelve al menú y al neutro',
  );
  // Pasar el ratón o el foco por una facción no la viste (20-10-2026: «que no
  // cambie de tema en hover sino en click»); marcarla con el clic, sí.
  await page.locator('[data-inicio="nuevo"]').click();
  await page.waitForSelector('[data-inicio="eleccion"]');
  await page.locator('[data-faccion="elfos"]').hover();
  await sleep(200);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0],
    `pasar el ratón por los elfos no los viste: sigue ${FACTION_IDS[0]}, la marcada`,
  );
  await page.locator('[data-faccion="orkos"] input').focus();
  await sleep(200);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0],
    `el foco en los orkos no los viste: sigue ${FACTION_IDS[0]}, la marcada`,
  );
  await page.locator('[data-faccion="orkos"]').click();
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === 'orkos',
    'el clic en los orkos los viste',
  );
  await page.locator('[data-faccion="imperio"]').hover();
  await sleep(200);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === 'orkos',
    'marcados los orkos, pasar por el imperio no lo viste',
  );
  await page.locator('[data-faccion="orkos"] input').focus();
  await page.keyboard.press('ArrowDown');
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema !== 'orkos' && e.tema !== null,
    'las flechas marcan la siguiente y la visten',
  );
  await page.locator('[data-faccion="orkos"]').click();
  await captura(page, 'inicio-02b-eleccion-orkos');

  // «Empezar»: la URL dice semilla y facción, sin héroe, y la partida abre en la
  // base de los orkos, ante el ayuntamiento, con un candidato por tipo, el de por
  // defecto elegido y el oro entero (22-10-2026: el héroe se elige y se paga en la
  // base). Lo que pide la página se apunta desde aquí: la hoja del tipo elegido
  // tiene que llegar, y el Y Bot de espada y escudo (el de `HERO_BODY`, con que se
  // pintaba el héroe) no.
  const TIPO = 'chaman_goblin';
  const tiposOrkos = tiposDeHeroe('orkos');
  const hojaDelTipo = figuraDelHeroe({ faction: 'orkos', tipo: TIPO });
  const pedidas: string[] = [];
  page.on('request', (r) => pedidas.push(new URL(r.url()).pathname));
  await page.locator('[data-inicio="empezar"]').click();
  await sinHistoria(page, 'inicio-02d-el-mundo');
  await page.waitForSelector('#app[data-escena="ayuntamiento"]', { timeout: 30_000 });
  const pedida = new URL(page.url()).searchParams;
  const semilla = parseSeed(pedida.get('seed'));
  if (semilla === null || pedida.get('faccion') !== 'orkos' || pedida.has('heroe'))
    throw new Error(
      `arranque: «Empezar» no deja en la URL la semilla y la facción sin héroe: ${page.url()}`,
    );
  exigir(
    await estadoDelArranque(page),
    (e) => !e.menu && e.app && e.tema === 'orkos',
    'la partida, con el tema de los orkos y sin menú',
  );
  let espejo = new Session(semilla, 'orkos', null);
  espejo.abrirSuBase();
  if (espejo.scene !== 'ayuntamiento')
    throw new Error(`arranque: el espejo abre en «${espejo.scene}» y no ante el ayuntamiento`);
  await esperarElElegidoDelAyuntamiento(page, espejo, 'arranque: abrir la partida');
  await comprobar(page, espejo, 'arranque: ante el ayuntamiento, sin pagar aún');
  const candidatos = await page.locator('#side [data-action="ayuntamiento-elegir"]').count();
  if (candidatos !== tiposOrkos.length)
    throw new Error(
      `arranque: el ayuntamiento de los orkos ofrece ${candidatos} héroes y son ${tiposOrkos.length}`,
    );
  const ficha = (await page.locator('#side .ficha-del-ayuntamiento').innerText()).replace(
    /\s+/g,
    ' ',
  );
  if (!ficha.includes(describirCoste(ECONOMIA.precioDelHeroe)))
    throw new Error(`arranque: la ficha del candidato no dice su precio: «${ficha}»`);
  await captura(page, 'inicio-03-ayuntamiento-orkos');

  // El chamán, pulsado en el lienzo: su ficha y su retrato, el de su hoja.
  await pulsarEnElAyuntamiento(page, espejo, TIPO, 'arranque');
  const retrato = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>(
      '.ficha-del-ayuntamiento .retrato-de-heroe',
    );
    await img?.decode().catch(() => undefined);
    return img === null ? null : { src: new URL(img.src).pathname, ancho: img.naturalWidth };
  });
  if (retrato?.src !== `/unidades/${hojaDelTipo}/identidad.webp` || retrato.ancho === 0)
    throw new Error(
      `arranque: el retrato del ${TIPO} no es el de su hoja, o no carga: ${JSON.stringify(retrato)}`,
    );
  await captura(page, 'inicio-03b-ayuntamiento-chaman');

  // Recargar a media elección vuelve a preguntar, igual: la misma URL, el mismo
  // oro y el de por defecto elegido otra vez.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app[data-escena="ayuntamiento"]', { timeout: 30_000 });
  espejo = new Session(semilla, 'orkos', null);
  espejo.abrirSuBase();
  await esperarElElegidoDelAyuntamiento(page, espejo, 'arranque: recargar a media elección');
  await comprobar(page, espejo, 'arranque: recargar a media elección');
  exigir(
    await estadoDelArranque(page),
    (e) => mismaQuery(e.search, { seed: `${semilla}`, faccion: 'orkos', tropa: '7', rueda: '7' }),
    'recargar a media elección no escribe ningún héroe en la URL',
  );
  await pulsarEnElAyuntamiento(page, espejo, TIPO, 'arranque, tras recargar');

  // «Contratar»: cobra, vuelve a la base con él dentro y la URL lo lleva.
  await page.locator(`#side [data-action="hire-hero"][data-tipo="${TIPO}"]`).click();
  espejo.hireHero(TIPO);
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 10_000 });
  await comprobar(page, espejo, 'arranque: contratar al chamán');
  exigir(
    await estadoDelArranque(page),
    (e) =>
      mismaQuery(e.search, {
        seed: `${semilla}`,
        faccion: 'orkos',
        heroe: TIPO,
        tropa: '7',
        rueda: '7',
      }),
    'elegido el héroe, la URL lo lleva',
  );
  const heroe = espejo.myHeroes()[0];
  if (heroe === undefined || espejo.jugador.faction !== 'orkos' || heroe.tipo !== TIPO)
    throw new Error(`arranque: el espejo no juega con los orkos y un ${TIPO}`);
  const suBase = baseOf(espejo.state, espejo.jugador.id);
  if (heroe.at.x !== suBase?.at.x || heroe.at.y !== suBase.at.y)
    throw new Error('arranque: el héroe del espejo no está dentro de su base');
  // Quien camina por la base es él (lo pinta el lienzo: se lee del espejo).
  const caminante = espejo.vistaDeLaBase()?.caminante;
  if (caminante?.id !== heroe.id || caminante.cuerpo !== hojaDelTipo)
    throw new Error(
      `arranque: por la base camina ${caminante?.id} con ${caminante?.cuerpo}, y no ${heroe.id} con ${hojaDelTipo}`,
    );
  await esperarLaBase(page, 'quieto');
  const delTipo = new RegExp(`^/unidades/${hojaDelTipo}/d[0-7]/atlas\\.webp$`);
  // La hoja se pide detrás del arte de la base (tramos y recortes): se le da tiempo.
  for (let t = 0; t < 40 && !pedidas.some((p) => delTipo.test(p)); t++) await sleep(200);
  if (!pedidas.some((p) => delTipo.test(p)))
    throw new Error(
      `arranque: la base no pidió ninguna dirección de ${hojaDelTipo}: el héroe no se pinta con su hoja`,
    );
  // Con tema, las barras de sección son de una línea y lo que no cabe sale con
  // «…»: «Tropa de Grommash Dientenegro» no cabía (QA del arranque, H3).
  const cortados = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#side h3')]
      .filter((h) => h.scrollWidth > h.clientWidth)
      .map((h) => h.textContent?.trim() ?? ''),
  );
  if (cortados.length > 0)
    throw new Error(`arranque: en el panel de la base salen cortados «${cortados.join('», «')}»`);
  await captura(page, 'inicio-04-base-orkos');
  log(`arranque: semilla ${semilla}, orkos, ${heroe.name} elegido ante el ayuntamiento y pagado`);
  espejo.closeTown();

  // Salir de la base con Escape: el mapa, con el tema, y la partida es la del espejo.
  await salirDeLaBase(page, 'arranque', 'escape');
  await esperarElSuelo(page, 'arranque', 60_000, log);
  await comprobar(page, espejo, 'arranque: al salir de la base');
  exigir(await estadoDelArranque(page), (e) => e.tema === 'orkos', 'el mapa sigue con su tema');
  await sleep(450);
  // Ni en la base ni en el mapa se pinta nadie con el Y Bot de espada y escudo, el
  // de `HERO_BODY`: es lo que tenía el héroe («la imagen es el y_bot»).
  const ybot = pedidas.filter((p) => p.startsWith('/unidades/_poses/espada-escudo-8d/'));
  if (ybot.length > 0)
    throw new Error(`arranque: la base o el mapa pintan el Y Bot del héroe: ${ybot.join(', ')}`);
  await captura(page, 'inicio-05-mapa-orkos');
  log(`arranque: el ${TIPO} se pinta con ${hojaDelTipo} en la base y el mapa, sin el Y Bot`);

  // La URL reproduce la partida: recargar entra sin menú, en su base, con la misma semilla.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
  exigir(
    await estadoDelArranque(page),
    (e) =>
      // Con la complejidad del combate (22-10-2026), «Nuevo juego» escribe también
      // el tope y la rueda: los de siempre si no se tocan.
      !e.menu &&
      e.tema === 'orkos' &&
      mismaQuery(e.search, {
        seed: `${semilla}`,
        faccion: 'orkos',
        heroe: TIPO,
        tropa: '7',
        rueda: '7',
      }),
    'recargar entra sin menú en la misma partida',
  );
  const rotulo = (await page.locator('#seed').innerText()).trim();
  if (rotulo !== `semilla ${semilla}`)
    throw new Error(`arranque: tras recargar la barra dice «${rotulo}»`);
  // El suelo del mapa se pinta mientras se está en la base (`calentarElMapa`):
  // al salir ya está, sin el rato de sucedáneo y esbozo.
  await esperarElSuelo(page, 'arranque, sin salir de la base', 60_000, log);
  exigir(
    await estadoDelArranque(page),
    (e) => e.escena === 'town',
    'el suelo del mapa se pinta sin salir de la base',
  );
  await salirDeLaBase(page, 'arranque, tras recargar');
  exigir(
    await estadoDelArranque(page),
    (e) => e.escenario === 'pintado',
    'al salir de la base, el suelo ya está pintado',
  );
  await page.close();

  // «Partida rápida»: semilla al azar y la facción que saque, sin elegir; también en la base.
  const rapida = await contexto.newPage();
  vigilarConsola(rapida, 'arranque, partida rápida', problemas);
  await rapida.goto(`${url}/`, { waitUntil: 'networkidle' });
  await rapida.locator('[data-inicio="rapida"]').click();
  await rapida.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
  const deLaRapida = new URL(rapida.url()).searchParams;
  const sRapida = parseSeed(deLaRapida.get('seed'));
  if (sRapida === null) throw new Error(`arranque: la rápida no deja semilla: ${rapida.url()}`);
  const suya: FactionId = faccionesDeLaSemilla(sRapida)[0];
  exigir(
    await estadoDelArranque(rapida),
    (e) =>
      e.tema === suya &&
      deLaRapida.get('faccion') === suya &&
      deLaRapida.get('heroe') === tipoDeHeroePorDefecto(suya),
    `la rápida juega con la de la semilla ${sRapida} (${suya}) y su héroe por defecto, y lo deja en la URL`,
  );
  await captura(rapida, 'inicio-06-partida-rapida');
  log(`arranque: partida rápida, semilla ${sRapida} con ${suya}`);
  await rapida.close();

  // Una facción que no existe no se juega: la página dice por qué y cómo salir.
  // Sin vigilar la consola: el error es lo que se prueba.
  const mala = await contexto.newPage();
  await mala.goto(`${url}/?faccion=xyz`, { waitUntil: 'networkidle' });
  await mala.waitForSelector('#no-arranca', { timeout: 15_000 });
  const dicho = (await mala.locator('#no-arranca').innerText()).replace(/\s+/g, ' ');
  if (!/"xyz" no es una facción/.test(dicho) || !/quita "\?faccion=…"/.test(dicho))
    throw new Error(`arranque: ?faccion=xyz no dice por qué ni cómo salir: «${dicho}»`);
  log('arranque: ?faccion=xyz se rechaza diciéndolo');
  // Un héroe que no es de la facción, igual.
  await mala.goto(`${url}/?seed=7&faccion=templarios&heroe=lich`, { waitUntil: 'networkidle' });
  await mala.waitForSelector('#no-arranca', { timeout: 15_000 });
  const dichoDelHeroe = (await mala.locator('#no-arranca').innerText()).replace(/\s+/g, ' ');
  if (
    !/"lich" no es un tipo de héroe de templarios/.test(dichoDelHeroe) ||
    !/quita "\?heroe=…"/.test(dichoDelHeroe)
  )
    throw new Error(
      `arranque: ?heroe=lich con los templarios no dice por qué ni cómo salir: «${dichoDelHeroe}»`,
    );
  log('arranque: ?heroe=lich con los templarios se rechaza diciéndolo');
  await contexto.close();
  await eleccionConElDedo(browser, url, problemas);
}

/**
 * La elección en un teléfono pequeño (375×667), con el dedo: no cabe, así que
 * hay que bajar hasta «Empezar» deslizando, con toques de verdad por CDP. El
 * `tap()` de Playwright no vale para esto: desplaza la página por programa hasta
 * el botón, y así escondía que no había forma de llegar (QA, H1). Deslizar no
 * viste ninguna facción: el dedo no tiene vista previa. Luego el héroe, ante el
 * ayuntamiento (22-10-2026), con el dedo también: tocar una figura del lienzo trae
 * su ficha con «Contratar» a la vista (QA H2); se vuelve arriba deslizando sobre el
 * panel, se baja hasta el botón del último candidato, se toca, y su «Contratar»
 * llega solo.
 */
async function eleccionConElDedo(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const contexto = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await contexto.newPage();
  vigilarConsola(page, 'arranque, con el dedo', problemas);
  await page.goto(`${url}/`, { waitUntil: 'networkidle' });
  const centro = async (selector: string): Promise<{ x: number; y: number }> => {
    const b = await page.locator(selector).boundingBox();
    if (b === null) throw new Error(`arranque, con el dedo: no se ve ${selector}`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const abajo = (selector: string): Promise<{ readonly bajo: number; readonly alto: number }> =>
    page.evaluate(
      (sel) => ({
        bajo: (document.querySelector(sel) as HTMLElement).getBoundingClientRect().bottom,
        alto: innerHeight,
      }),
      selector,
    );
  const cdp = await contexto.newCDPSession(page);
  /**
   * Dónde se puede apoyar el dedo para desplazar lo que contiene a `selector`: la
   * franja de abajo arriba que se ve de lo que se desplaza (su primer antepasado
   * con `overflow-y` que desplaza, o la página), sin el lienzo (`touch-action:
   * none`) ni lo que tiene encima. En la partida es `#stage`, entre el lienzo y la
   * barra de abajo: con una «y» fija el dedo caía en `#statusbar`, que no desplaza
   * nada (QA H1, 22-10-2026).
   */
  const franjaPara = (
    selector: string,
  ): Promise<{ readonly x: number; readonly arriba: number; readonly abajo: number } | null> =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      let quien = el.parentElement;
      while (
        quien !== null &&
        !(
          /(auto|scroll)/.test(getComputedStyle(quien).overflowY) &&
          quien.scrollHeight > quien.clientHeight
        )
      )
        quien = quien.parentElement;
      const r = quien?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
      const x = Math.round(innerWidth / 2);
      // Sin funciones con nombre aquí dentro: tsx les pone `__name`, que en la
      // página no existe.
      let abajo: number | null = null;
      let arriba = 0;
      const tope = Math.ceil(Math.max(r.top, 0));
      for (let y = Math.floor(Math.min(r.bottom, innerHeight)) - 2; y > tope; y -= 2) {
        const bajo = document.elementFromPoint(x, y);
        const vale =
          bajo !== null &&
          (quien === null || quien.contains(bajo)) &&
          bajo.closest('canvas') === null &&
          getComputedStyle(bajo).touchAction !== 'none';
        if (vale) {
          abajo ??= y;
          arriba = y;
        } else if (abajo !== null) break;
      }
      return abajo === null ? null : { x, arriba, abajo };
    }, selector);
  /** Un dedo de `y0` a `y1` en `x`, a toques de CDP. */
  const deslizar = async (x: number, y0: number, y1: number): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: y0 }],
    });
    const paso = y1 < y0 ? -20 : 20;
    for (let y = y0 + paso; paso < 0 ? y >= y1 : y <= y1; y += paso) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y }],
      });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
  };
  /** Desliza hacia arriba, como un dedo, hasta que `selector` se vea entero. */
  const bajarHasta = async (selector: string): Promise<void> => {
    for (let vez = 0; vez < 4; vez++) {
      const { bajo, alto } = await abajo(selector);
      if (bajo <= alto) return;
      const f = await franjaPara(selector);
      if (f === null)
        throw new Error(
          `arranque, con el dedo: a 375×667 no hay dónde apoyar el dedo para bajar hasta ${selector}`,
        );
      await deslizar(f.x, f.abajo, Math.max(5, f.abajo - 380));
    }
    const despues = await abajo(selector);
    if (despues.bajo > despues.alto)
      throw new Error(
        `arranque, con el dedo: a 375×667 no se llega a ${selector} deslizando: sigue en ${Math.round(despues.bajo)} de ${despues.alto}`,
      );
  };
  /** Desliza hacia abajo, como un dedo, hasta que `#stage` vuelva arriba (el lienzo entero). */
  const volverArriba = async (): Promise<void> => {
    const arriba = () => page.evaluate(() => document.getElementById('stage')!.scrollTop);
    // Con el lienzo bajando a la vista, la franja del panel se estrecha y cada
    // pasada sube menos: hasta diez.
    for (let vez = 0; vez < 10 && (await arriba()) > 0; vez++) {
      const f = await franjaPara('#side');
      if (f === null)
        throw new Error('arranque, con el dedo: a 375×667 no hay dónde apoyar el dedo para subir');
      await deslizar(f.x, f.arriba, 660);
    }
    const queda = await arriba();
    if (queda > 0)
      throw new Error(`arranque, con el dedo: deslizando no se vuelve arriba (#stage en ${queda})`);
  };
  const nuevo = await centro('[data-inicio="nuevo"]');
  await page.touchscreen.tap(nuevo.x, nuevo.y);
  await page.waitForSelector('[data-inicio="eleccion"]');
  await sleep(300);
  const EMPEZAR = '[data-inicio="empezar"]';
  const antes = await abajo(EMPEZAR);
  if (antes.bajo <= antes.alto)
    throw new Error(
      `arranque, con el dedo: a 375×667 «Empezar» ya se ve sin bajar (${Math.round(antes.bajo)} de ${antes.alto}): así no se prueba que se llegue deslizando`,
    );
  await bajarHasta(EMPEZAR);
  exigir(
    await estadoDelArranque(page),
    (e) => e.tema === FACTION_IDS[0],
    `deslizar no viste ninguna facción: sigue la de ${FACTION_IDS[0]}, la marcada`,
  );
  await captura(page, 'inicio-07-eleccion-movil');
  const empezar = await centro(EMPEZAR);
  await page.touchscreen.tap(empezar.x, empezar.y);
  await sinHistoria(page, null, true);
  await page.waitForSelector('#app[data-escena="ayuntamiento"]', { timeout: 30_000 });
  await sleep(300);
  // Tocar una figura del lienzo trae su ficha con «Contratar» a la vista, sin
  // deslizar (QA H2, 22-10-2026: el panel asoma una franja bajo el lienzo y no
  // se veía pasar nada).
  const semilla = parseSeed(new URL(page.url()).searchParams.get('seed'));
  if (semilla === null)
    throw new Error(`arranque, con el dedo: «Empezar» no deja semilla: ${page.url()}`);
  const espejo = new Session(semilla, FACTION_IDS[0], null);
  espejo.abrirSuBase();
  const tipos = tiposDeHeroe(FACTION_IDS[0]).map((t) => t.id);
  const contratarA = (tipo: string) => `#side [data-action="hire-hero"][data-tipo="${tipo}"]`;
  const seVe = async (selector: string): Promise<boolean> => {
    const { bajo, alto } = await abajo(selector);
    return bajo <= alto;
  };
  if (await seVe(contratarA(tipos[0]!)))
    throw new Error(
      'arranque, con el dedo: a 375×667 «Contratar» ya se ve al entrar: así no se prueba que tocar una figura lo traiga',
    );
  await pulsarEnElAyuntamiento(page, espejo, tipos[1]!, 'arranque, con el dedo', true);
  for (let vez = 0; vez < 20 && !(await seVe(contratarA(tipos[1]!))); vez++) await sleep(100);
  if (!(await seVe(contratarA(tipos[1]!))))
    throw new Error(
      `arranque, con el dedo: tocar la figura de ${tipos[1]} en el lienzo no trae su «Contratar» a la vista`,
    );
  await captura(page, 'inicio-08-ayuntamiento-movil-toque');
  // De vuelta arriba deslizando sobre el panel, y el último candidato, tocado en
  // el panel: hay que bajar hasta él, y su ficha llega sola.
  await volverArriba();
  const ultimo = tipos.at(-1)!;
  const DEL_ULTIMO = `#side [data-action="ayuntamiento-elegir"][data-tipo="${ultimo}"]`;
  await bajarHasta(DEL_ULTIMO);
  const elUltimo = await centro(DEL_ULTIMO);
  await page.touchscreen.tap(elUltimo.x, elUltimo.y);
  await page.waitForSelector(`#canvas[data-ayuntamiento="${ultimo}"]`, { timeout: 8000 });
  const CONTRATAR = contratarA(ultimo);
  for (let vez = 0; vez < 20 && !(await seVe(CONTRATAR)); vez++) await sleep(100);
  if (!(await seVe(CONTRATAR)))
    throw new Error(
      `arranque, con el dedo: tocar el botón de ${ultimo} no trae su «Contratar» a la vista`,
    );
  await captura(page, 'inicio-09-ayuntamiento-movil');
  const contratar = await centro(CONTRATAR);
  await page.touchscreen.tap(contratar.x, contratar.y);
  await page.waitForSelector('#app[data-escena="town"]', { timeout: 10_000 });
  exigir(
    await estadoDelArranque(page),
    (e) => {
      const q = new URLSearchParams(e.search);
      return (
        e.tema === FACTION_IDS[0] &&
        q.get('faccion') === FACTION_IDS[0] &&
        q.get('heroe') === ultimo
      );
    },
    `«Contratar», tocado tras deslizar, deja la base de ${FACTION_IDS[0]} con un ${ultimo}`,
  );
  log(
    `arranque: con el dedo, a 375×667 se baja hasta «Empezar», tocar una figura trae su «Contratar», se sube y se baja por el panel y abre la base con un ${ultimo}`,
  );
  await contexto.close();
}

async function jugarEscritorio(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const b0 = await cajaDeEscritorio(browser, url, problemas);
  const semilla = buscarEscritorio(b0);
  log(`escritorio: semilla ${semilla}, buscada en el espejo`);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'escritorio',
    semilla,
    esperada: b0,
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

  // Zoom con la rueda y arrastre; luego «Centrar héroe» devuelve la vista. Los
  // pasos son los que cuenta `buscarEscritorio` para la guardia de después.
  for (let i = 0; i < RUEDA_DEL_ESCRITORIO; i++) await mapa.rueda(1);
  await mapa.arrastrar(-220, -120);
  await sleep(100);
  await captura(page, 'desktop-03-mapa-zoom-y-arrastre');
  await mapa.centrarHeroe();

  // Al castillo: el héroe entra y se abre la pantalla.
  const castillo = baseOf(espejo.state, espejo.jugador.id);
  if (castillo === null) throw new Error('el jugador no tiene castillo');
  await mapa.pulsar(castillo.at);
  if (espejo.scene !== 'town')
    throw new Error(`el espejo no ha entrado al castillo: ${espejo.status}`);
  await esperarLaBase(page, 'quieto');
  await captura(page, 'desktop-04-castillo');

  // La base es una escena: se camina a la morada de nivel 1 y, al llegar, se
  // entra en ella (otra escena): la figura de la recluta, pulsada en el lienzo,
  // enseña su ficha y «+1» y «Todo». «Todo» pide lo que cabe, no lo que hay.
  const town = espejo.activeTown!;
  const d = disposicionDe(town.faction);
  const recluta = reclutaDeNivel1(town.faction);
  await pulsarEnLaBase(page, d, d.entrada, laPuerta(d, 'lvl1'));
  await entrarEnLaMorada(page, espejo, 'lvl1', 'escritorio');
  await pulsarEnLaMorada(page, espejo, recluta, 'escritorio');
  const deLaRecluta = `#side button[data-action="recruit"][data-creature="${recluta}"]`;
  const todo = page.locator(`${deLaRecluta}[data-todo="si"]`);
  const plan = espejo.recruitPlan(recluta);
  await todo.hover();
  await sleep(150);
  await captura(page, 'desktop-05-morada-todo-es-lo-que-cabe');
  // Con el ejército lleno no cabe ninguno: el botón sale deshabilitado y no se
  // pulsa (pasa con los mapas de 42×42 de main, semilla 27: la base se escribió
  // contra los de 34×34, donde el héroe de la semilla buscada tenía sitio).
  if ((plan?.maximo ?? 0) > 0) {
    await todo.click();
    espejo.recruitAll(recluta);
  } else if (await todo.isEnabled()) {
    throw new Error('«Todo» sin nada que quepa debía salir deshabilitado');
  }
  log(
    `«todo» con ${plan?.disponibles} disponibles y ${plan?.caben} que caben: recluta ${plan?.maximo}`,
  );
  await sleep(200);
  await comprobar(page, espejo, 'reclutar todo');
  if ((await page.locator('#app').getAttribute('data-escena')) !== 'morada') {
    throw new Error('tras reclutar, la página ha salido de la morada');
  }

  // «+1» con el ejército ya en sus seis (fase 1b): no recluta, y la barra dice
  // por qué con la frase del núcleo. El espejo dice lo mismo, y el oro no se mueve.
  const uno = page.locator(`${deLaRecluta}[data-todo="no"]`);
  if ((espejo.selectedHero?.army.length ?? 0) >= 6) {
    // La morada apaga «+1» con la frase del núcleo escrita debajo cuando no cabe
    // ni uno (`motivoParaNoReclutar`): sin `title`, que en el móvil no se ve.
    const escrito = page.locator('#side .ficha-de-la-morada .motivo-apagado');
    const motivo = (await escrito.count()) === 1 ? (await escrito.innerText()).trim() : null;
    const delNucleo = espejo.motivoParaNoReclutar(recluta);
    if (
      (await uno.isEnabled()) ||
      motivo === null ||
      motivo !== delNucleo ||
      !motivo.includes('ya lleva 6 de 6 individuos')
    ) {
      throw new Error(
        `el séptimo debía salir apagado con la frase del núcleo («${delNucleo}») escrita debajo; dice «${motivo}»`,
      );
    }
    log(`el séptimo se rechaza: «${motivo}»`);
    await captura(page, 'desktop-05b-morada-el-septimo-no-cabe');
    await comprobar(page, espejo, 'reclutar el séptimo');

    // Y licenciando uno, el séptimo cabe: se vuelve a la base («Volver a la
    // base»), se pulsa el «−1» de la tropa del héroe y se entra otra vez en la
    // morada desde la lista de edificios, a por el «+1». Es el gesto para cambiar
    // tropa, y deja el ejército como estaba —el licenciado es el último, y el
    // recluta entra al final—, así que el resto de la pasada no se entera.
    await salirDeLaMorada(page, espejo, 'boton', 'escritorio');
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
      await page.locator('#side [data-action="ir-a-sitio"][data-sitio="lvl1"]').click();
      await entrarEnLaMorada(page, espejo, 'lvl1', 'escritorio');
      await pulsarEnLaMorada(page, espejo, recluta, 'escritorio');
      await uno.click();
      espejo.recruit(recluta, 1);
      await sleep(200);
      if (espejo.selectedHero?.army.length !== antes) {
        throw new Error(`tras licenciar, el séptimo debía caber: ${espejo.status}`);
      }
      log(`y el «+1» vuelve a reclutar: ${antes} de ${antes}`);
    }
    await comprobar(page, espejo, 'licenciar y volver a reclutar');
  }
  // De vuelta a la base con Escape, quieto en la puerta de la morada.
  if (espejo.vistaDeLaMorada() !== null)
    await salirDeLaMorada(page, espejo, 'escape', 'escritorio');

  // El ayuntamiento abre «Ampliar»: lo construible con su coste o su motivo.
  await pulsarEnLaBase(page, d, d.sitios.lvl1.puerta, laPuerta(d, 'hall'));
  await esperarLaBase(page, 'ampliar');
  const construir = await page.locator('#side button[data-action="build"]').count();
  if (construir === 0) throw new Error('«Ampliar» no ofrece nada que construir');
  await captura(page, 'desktop-05d-castillo-ampliar');
  log(`«Ampliar» ofrece ${construir} edificios`);

  // Un estado intermedio: con el castillo levantado (lo que se construye el día
  // 1 con lo de partida), su fachada aparece en su sitio junto al ayuntamiento y
  // la morada. Lo siguiente de la pasada se juega ya con él.
  const castilloSePuede = page.locator('#side button[data-action="build"][data-building="castle"]');
  if ((await castilloSePuede.count()) !== 1 || !(await castilloSePuede.isEnabled())) {
    throw new Error('«Ampliar» no deja construir el castillo el día 1');
  }
  await castilloSePuede.click();
  espejo.build('castle');
  if (!espejo.activeTown?.buildings.includes('castle')) {
    throw new Error(`el espejo no ha construido el castillo: ${espejo.status}`);
  }
  await sleep(300);
  await comprobar(page, espejo, 'construir el castillo');
  await captura(page, 'desktop-05g-castillo-construido');
  log(`construido el castillo: ${espejo.activeTown.buildings.join(', ')}`);

  // Un vecino: se camina a su lado y se abre la conversación con su nombre. El
  // escenario mide unos 58 pasos y el lienzo enseña 12: primero se anda hasta
  // tenerlo a la vista (con la vista de la vuelta 2, el vecino estaba siempre en
  // ella y se pulsaba de una vez; en la vuelta 3 caía fuera del lienzo).
  const [idVecino, vecino] = Object.entries(d.vecinos)[0]!;
  const cerca = await acercarseA(page, d, d.sitios.hall.puerta, vecino.en.x);
  await pulsarEnLaBase(page, d, cerca, laFigura(vecino.en));
  await esperarLaBase(page, `pnj:vecino-${idVecino}`);
  const dialogo = page.locator('#conversacion[open]');
  await dialogo.waitFor({ state: 'visible', timeout: 5000 });
  const dicho = (await dialogo.innerText()).trim();
  if (!dicho.includes('«')) throw new Error(`la conversación no dice nada: «${dicho}»`);
  await captura(page, 'desktop-05e-castillo-conversacion');
  log(`conversación con ${idVecino}: «${dicho.replace(/\s+/g, ' ')}»`);
  await page.locator('#conversacion button[data-action="cerrar-conversacion"]').click();
  await esperarLaBase(page, 'quieto');

  // El escenario es más ancho que el lienzo: se anda hasta el extremo derecho y
  // la vista lo sigue hasta su tope (criterio 3').
  {
    const bb = await caja(page);
    const lienzo = { ancho: bb.width, alto: bb.height };
    let en = dondeHablarCon(d, vecino.en);
    for (
      let i = 0;
      // A todo el alto (20-10-2026) la vista mide unos 10 pasos y no 12,6: de
      // punta a punta, hasta seis tramos.
      i < 10 && camaraQuieta(d, lienzo, en.x) < camaraQuieta(d, lienzo, d.ancho);
      i++
    ) {
      const vista = bb.width / camaraDeLaBase(lienzo, 0).paso;
      const destino = {
        x: Math.min(d.ancho, camaraQuieta(d, lienzo, en.x) + vista - 0.3),
        y: FONDO_DE_LA_FRANJA - 0.3,
      };
      await pulsarEnLaBase(page, d, en, elSuelo(destino));
      await esperarLaBase(page, 'quieto');
      en = { x: Math.min(d.ancho - 0.4, destino.x), y: destino.y };
    }
    const tope = camaraQuieta(d, lienzo, d.ancho);
    if (camaraQuieta(d, lienzo, en.x) !== tope) {
      throw new Error(`la vista de la base no ha llegado a su extremo derecho (x=${en.x})`);
    }
    log(`la vista de la base llega a su extremo derecho: cámara en ${tope.toFixed(2)} pasos`);
    await captura(page, 'desktop-05f-castillo-extremo');
  }
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  espejo.closeTown();
  await sleep(200);

  // Una batalla de varios individuos por bando, jugada a clics: la de una
  // guardia a salvo, sin grupo que embosque por el camino (#229).
  const monstruo = await guardiaALaVista(mapa, espejo);
  await mapa.pulsar(monstruo);
  if (espejo.battle === null)
    throw new Error(`el espejo no ha entrado en batalla: ${espejo.status}`);
  await esperarCola(espejo.battle, espejo.battle.log);
  await captura(page, 'desktop-07-batalla-inicio');
  // Hasta 40 jugadas: las de antes eran 12, pero el ángulo necesita que la tropa
  // se acerque —un campesino anda 2— y la rendición espera a que salga.
  let anguloPendiente = true;
  for (let n = 0; n < 40 && espejo.battle?.finished === null; n++) {
    if (await turnoDeBatalla(page, espejo, n, true, anguloPendiente)) anguloPendiente = false;
    if (n === 3) await captura(page, 'desktop-08-batalla-en-curso');
  }
  // El turno en tramos y el ángulo (02-10-2026) se recorren una vez por pasada
  // de escritorio: si la batalla no dio ocasión, se dice en vez de dar verde.
  if (anguloPendiente) {
    throw new Error('la batalla de escritorio no dio ocasión de mover dos tramos y atacar');
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
          .map(queEs);
  const oroAntes = espejo.oro;
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
    const base = baseOf(espejo.state, espejo.jugador.id);
    if (heroe === undefined || base === null) {
      throw new Error('tras rendirse no queda héroe o base en el espejo');
    }
    const enBase = heroe.at.x === base.at.x && heroe.at.y === base.at.y;
    const tropa = heroe.army.slice(0, supervivientes.length).map((t) => t.creature);
    if (!enBase || tropa.join() !== supervivientes.join()) {
      throw new Error(
        `tras rendirse el héroe debía estar en (${base.at.x},${base.at.y}) con ${supervivientes.join(',')} y está en (${heroe.at.x},${heroe.at.y}) con ${heroe.army.map((t) => t.creature).join(',')}`,
      );
    }
    if (espejo.oro !== oroAntes - rendicion.gold) {
      throw new Error(
        `la rendición costaba ${rendicion.gold} y el oro pasó de ${oroAntes} a ${espejo.oro}`,
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
      await esperarCola(espejo.battle, espejo.battle.log);
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
    // Con un héroe que aún puede andar, Espacio no pasa: pregunta, y el Espacio
    // no confirma la pregunta (#17). Lo que se mira aquí es que dos Espacios no
    // pasen dos días, así que se duerme antes a quien podría andar, en la página
    // y en el espejo (con el mapa de #215, el de s99 aún anda tras su batalla).
    for (const heroe of espejo.quienesPuedenAndar()) {
      await page.locator(`button[data-action="sleep-hero"][data-hero="${heroe.id}"]`).click();
      espejo.alternarSueño(heroe.id);
    }
    await page.locator('#canvas').focus();
    await page.keyboard.press(' ');
    await page.keyboard.press(' ');
    await pasarElTurnoDelEspejo(page, espejo, 'el Espacio que pasa el turno');
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
  // «Partida nueva» vuelve al menú de inicio, sin nada en la URL (19-10-2026). El
  // de la barra de abajo: el primer `restart` de la página es el «Abandonar la
  // partida» del diálogo «Menú», cerrado (e390cc30), y el clic esperaba 30 s.
  await page.locator('#actions [data-action="restart"]').click();
  await page.waitForSelector('#inicio:not([hidden]) [data-inicio="nuevo"]', { timeout: 15_000 });
  exigir(
    await estadoDelArranque(page),
    (e) => e.menu && !e.app && e.search === '' && e.tema === null,
    '«Partida nueva» vuelve al menú de inicio',
  );
  log('fin: «Partida nueva» vuelve al menú de inicio');
  await page.close();
}

/**
 * Los veteranos del héroe, en el panel: cada uno con «Veterano · rango N · nivel n · …»
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
  if (!filas.some((g) => g.rango >= 2)) {
    throw new Error(
      `${paso}: ningún individuo de ${heroe.name} pasa del rango 1 (${filas.length} con experiencia): no hay veterano que enseñar`,
    );
  }
  const panel = (await page.locator('#side').innerText()).replace(/\s+/g, ' ');
  for (const g of filas) {
    const nivel = nivelDeUnidad(g.unit);
    const esperado =
      g.rango >= 2 ? `Veterano · rango ${g.rango} · nivel ${nivel}` : `Rango 1 · nivel ${nivel}`;
    if (!panel.includes(esperado)) {
      throw new Error(
        `${paso}: el espejo tiene un ${g.unit.name} de rango ${g.rango} y el panel no dice «${esperado}»`,
      );
    }
  }
  log(
    `${paso}: ${filas.length} veterano(s) en el panel — ${filas
      .map((g) => `${g.unit.name} rango ${g.rango}, ${g.veterania?.experiencia} exp`)
      .join('; ')}`,
  );
}

/**
 * Un veterano en el campo: «· rango N» en su fila de «En el campo», con el rango
 * que dice el espejo. Los galones del lienzo no se miran por píxel: van en la
 * captura, y su cuenta la prueba `galonesDe` en los tests.
 */
async function veteranoEnElCampo(page: Page, espejo: Session): Promise<void> {
  const battle = espejo.battle;
  if (battle === null) throw new Error('no hay batalla en el espejo');
  const vet = battle.stacks.find((s) => s.count > 0 && galonesDe(s) > 0);
  if (vet === undefined) throw new Error('ningún veterano de rango ≥ 2 pisa este tablero');
  // Con su distintivo, como lo nombra el panel (#198: dos arqueros, s2 con #224).
  const esperado = `${nombreEnElCampo(battle, vet)} · rango ${galonesDe(vet) + 1}`;
  const panel = (await page.locator('#side').innerText()).replace(/\s+/g, ' ');
  if (!panel.includes(esperado)) throw new Error(`en «En el campo» falta «${esperado}»`);
  log(`batalla con veterano: «${esperado}» en el campo, ${galonesDe(vet)} galón(es) en la figura`);
}

/**
 * La tropa que crece, vista (ciclo «la tropa crece»): una guardia resuelta deja
 * un veterano, el panel lo cuenta con su nivel y lo que le falta, y en la
 * batalla del día siguiente pisa el tablero con galones y «· rango N».
 *
 * Pasada propia y no dentro de la de escritorio: allí la primera batalla se
 * juega a clics cerrando turnos para enseñar la rendición, y nadie de la
 * tropa llega a pegar. La semilla la busca el espejo antes de abrir la página
 * (`buscarVeteranos`): la batalla más cercana a la vista —guardia, o el grupo
 * que embosca por el camino— deja un veterano y al día siguiente hay otra.
 */
async function veteranos(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const b = await cajaDeEscritorio(browser, url, problemas);
  const semilla = await buscarVeteranos(b);
  log(`veteranos: semilla ${semilla}, buscada en el espejo`);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'veteranos',
    semilla,
    esperada: b,
  });
  await mapa.pulsar(await guardiaALaVista(mapa, espejo, VETERANOS));
  if (espejo.battle === null) throw new Error(`no hubo batalla: ${espejo.status}`);
  await esperarCola(espejo.battle, espejo.battle.log);
  await page.getByRole('button', { name: 'Resolver sola' }).click();
  espejo.autoResolveBattle();
  await sleep(400);
  await comprobar(page, espejo, 'resolver la primera batalla de los veteranos');
  await veteranosEnElPanel(page, espejo, 'tras la primera batalla');
  const cronica = await page.locator('#side').innerText();
  if (!cronica.includes('sube a veterano de rango')) {
    throw new Error('la crónica de la página no cuenta el ascenso de la tropa');
  }
  await captura(page, 'veteranos-01-panel');
  await pasarDia(page, espejo);
  await comprobar(page, espejo, 'pasar al día 2 con los veteranos');
  await mapa.pulsar(await guardiaALaVista(mapa, espejo, VETERANOS));
  if (espejo.battle === null) throw new Error(`no hubo segunda batalla: ${espejo.status}`);
  await esperarCola(espejo.battle, espejo.battle.log);
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
  const empieza = desenlace === 'ganada' ? '¡Victoria!' : 'Derrota';
  if (!barra.startsWith(empieza)) {
    throw new Error(`fin de partida (${desenlace}): la barra dice «${barra}», sin el desenlace`);
  }
  // Un clic en el mapa tras el final no tapa el desenlace (#162): pasaba por
  // `bloqueoDeTurno` y escribía «la partida ya ha terminado» en su lugar.
  const marco = await page.locator('#canvas').boundingBox();
  if (marco === null) throw new Error('el lienzo no está en la página');
  await page.mouse.click(marco.x + marco.width / 2, marco.y + marco.height / 2);
  await sleep(200);
  const trasElClic = (await page.locator('#status').innerText()).trim();
  if (trasElClic !== barra) {
    throw new Error(`fin de partida: tras un clic la barra dice «${trasElClic}» y no «${barra}»`);
  }
  log(
    `fin: ${desenlace} por ${real}, con ${heroesOf(espejo.state, vencido.id).length} héroe(s) del vencido en el mapa; el lateral dice «${dice}»`,
  );
}

async function jugarMovil(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const semilla = await semillaDelMovil(browser, url, problemas);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'móvil',
    semilla,
    movil: true,
    esperada: await cajaDeMovil(browser, url, problemas),
  });
  await captura(page, 'movil-01-mapa');
  const suBase = baseOf(espejo.state, espejo.jugador.id);
  if (suBase === null) throw new Error('móvil: el jugador no tiene base');
  await mapa.pulsar(suBase.at);
  await esperarLaBase(page, 'quieto');
  // En el móvil la base es una ventana que sigue a quien camina: se le manda al
  // extremo izquierdo de lo que se ve, y la vista va con él.
  {
    const d = disposicionDe(espejo.activeTown!.faction);
    const bb = await caja(page);
    const lienzo = { ancho: bb.width, alto: bb.height };
    const antes = camaraQuieta(d, lienzo, d.entrada.x);
    const destino = { x: antes + 0.5, y: FONDO_DE_LA_FRANJA - 0.9 };
    // Que eche a andar de verdad (lo espera `pulsarEnLaBase`): un clic fuera del
    // lienzo dejaba «quieto» y la captura salía con la figura en la entrada (la
    // primera redacción de esto).
    await pulsarEnLaBase(page, d, d.entrada, elSuelo(destino));
    await esperarLaBase(page, 'quieto');
    const despues = camaraQuieta(d, lienzo, destino.x);
    if (antes === despues) {
      throw new Error('móvil: la vista de la base no tenía hacia dónde seguir a quien camina');
    }
    log(
      `móvil: la vista sigue a quien camina, de x=${antes.toFixed(2)} a x=${despues.toFixed(2)} pasos`,
    );
  }
  await captura(page, 'movil-02-castillo');
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  espejo.closeTown();
  await sleep(200);
  await comprobar(page, espejo, 'móvil: volver del castillo');
  await mapa.pulsar(await guardiaALaVista(mapa, espejo));
  if (espejo.battle === null)
    throw new Error(`móvil: el espejo no ha entrado en batalla: ${espejo.status}`);
  await esperarCola(espejo.battle, espejo.battle.log);
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
  const { b, e } = await mapa.encuadre();
  const explorado = espejo.explorado;
  if (explorado === null) throw new Error('ruta: el espejo lo ve todo y no hay niebla que mirar');
  const destino = rutaDeDosColores(b, e, mapa.tile, espejo);
  if (destino === null) {
    throw new Error('ruta: no hay a la vista un destino explorado con tramo de hoy y de otro día');
  }
  const elegido = { destino };
  const ruta = espejo.previewPath(elegido.destino);
  const pintados = pasosAPintar(ruta, explorado);
  const dorado = pintados.find((p) => p.hoy && p.marca === 'paso') ?? pintados.find((p) => p.hoy)!;
  const gris =
    pintados.find((p) => !p.hoy && p.marca !== 'destino') ?? pintados.find((p) => !p.hoy)!;
  const oculto = ruta.find((r) => !explorado.has(r.at));
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
    await captura(page, 'desktop-01b-ruta-sin-pintar');
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
  const semilla = await semillaDelMovil(browser, url, problemas);
  const medida = await cajaDeMovil(browser, url, problemas);
  const espejo = new Session(semilla);
  await page.goto(`${url}${urlDePartida(semilla)}`, { waitUntil: 'networkidle' });
  await salirDeLaBase(page, 'táctil', 'toque');
  await esperarElSuelo(page, 'táctil', 60_000, log);
  await sleep(450);
  const mapa = new Mapa(page, espejo);

  // El destino más lejano que se alcance hoy y se vea entero en el lienzo, con
  // tres pasos o más: hace falta uno intermedio, lejos del héroe y del destino.
  // Explorado: un toque en la niebla no enseña ruta (`destinoTactil`).
  const { b, e } = await mapa.encuadre();
  if (
    b.x !== medida.x ||
    b.y !== medida.y ||
    b.width !== medida.width ||
    b.height !== medida.height
  ) {
    throw new Error(
      `táctil: la semilla se buscó con el lienzo del móvil en ${medida.width}×${medida.height} (${medida.x},${medida.y}) ` +
        `y el contexto táctil lo abre en ${b.width}×${b.height} (${b.x},${b.y})`,
    );
  }
  const destino = destinoTactil(b, e, espejo);
  if (destino === null) {
    throw new Error('táctil: no hay a la vista un destino de hoy a tres pasos o más');
  }
  // Los pasos intermedios, y de ellos el que más cambia. Uno solo —el del
  // medio— podía caer bajo un árbol o una peña que se pinta encima de la ruta:
  // con los bordes de #169 la semilla 19 lo tenía así, y la pasada daba rojo
  // con la ruta pintada. Lo que esto vigila es que el `pointerleave` del toque
  // no la borre, y entonces no cambia ninguno.
  // Lejos del héroe y del destino (Chebyshev ≥ 2): la figura que respira al
  // lado movería píxeles sin ruta ninguna.
  const ruta = espejo.previewPath(destino);
  const heroe = espejo.selectedHero?.at ?? destino;
  const lejos = (p: Point, q: Point) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) >= 2;
  const lejosDeLosDos = ruta.filter((paso) => lejos(paso.at, heroe) && lejos(paso.at, destino));
  const intermedios =
    lejosDeLosDos.length > 0
      ? lejosDeLosDos
      : [ruta[Math.floor((ruta.length - 1) / 2)] as (typeof ruta)[number]];
  const enLienzo = await Promise.all(intermedios.map((paso) => mapa.pixel(paso.at)));
  const antes = await Promise.all(
    enLienzo.map((p) => pixelesDelLienzo(page, p.x - b.x, p.y - b.y)),
  );
  const px = await mapa.pixel(destino);
  await page.touchscreen.tap(px.x, px.y);
  await sleep(300);
  const despues = await Promise.all(
    enLienzo.map((p) => pixelesDelLienzo(page, p.x - b.x, p.y - b.y)),
  );
  const cambios = antes.map((a, k) =>
    a.reduce((t, v, i) => t + Math.abs(v - (despues[k]?.[i] ?? 0)), 0),
  );
  const cambio = Math.max(0, ...cambios);
  const elQueMas = intermedios[cambios.indexOf(cambio)]?.at;
  const dice = await page.locator('#status').innerText();
  log(
    `táctil: primer toque → «${dice}»; de ${intermedios.length} pasos intermedios, el que más cambia ` +
      `(${elQueMas?.x},${elQueMas?.y}) cambia ${cambio}`,
  );
  if (!dice.includes('Toca otra vez')) throw new Error(`táctil: el primer toque dice «${dice}»`);
  if (cambio < 2000) {
    throw new Error(
      `táctil: tras el primer toque la ruta no se ha pintado (ningún paso intermedio cambia más de ${cambio})`,
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
  await page.goto(`${url}${urlDePartida(semilla)}`, { waitUntil: 'networkidle' });
  await salirDeLaBase(page, 'táctil, otra vez', 'toque');
  await sleep(450);
  const otra = new Session(semilla);
  const enOtra = new Mapa(page, otra);
  const monstruo = await guardiaALaVista(enOtra, otra);
  const enMonstruo = await enOtra.pixel(monstruo);
  await page.touchscreen.tap(enMonstruo.x, enMonstruo.y);
  await sleep(200);
  await page.touchscreen.tap(enMonstruo.x, enMonstruo.y);
  otra.clickTile(monstruo);
  if (otra.battle === null) {
    throw new Error(`táctil: el espejo no ha entrado en batalla: ${otra.status}`);
  }
  await esperarCola(otra.battle, otra.battle.log);
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
  // Buscar, desplazar y mirar en UNA evaluación: los paneles se rehacen cuando
  // cambia la batalla, y con un localizador el botón resuelto en un paso podía
  // ser otro nodo en el siguiente («Element is not attached to the DOM», dos
  // veces en `pnpm capturas`). Dentro de un `evaluate` no se rehace nada.
  const tapado = await page.evaluate(() => {
    const el = document.querySelector('[data-action="battle-spell"]');
    if (el === null) return 'no hay botón de hechizos';
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
 * La guardia más cercana a la que el héroe llega HOY, por la ruta que enseña el
 * cliente, con la cámara llevada hasta ella arrastrando el mapa: queda en el
 * centro del lienzo, o tan cerca como deje el borde del mapa. Era una casilla
 * escrita a mano —(5,2) en la semilla 2—, y el mapa de nodos la convirtió en
 * cordillera; luego, la más cercana que se viera con la cámara en el héroe, y
 * cada pasada alejaba la vista a ojo para que cupiera (#131).
 */
async function guardiaALaVista(
  mapa: Mapa,
  espejo: Session,
  opciones: { readonly aunqueEmbosquen?: boolean } = {},
): Promise<Point> {
  const { b, e } = await mapa.encuadre();
  const guardia = guardiaEnElMarco(b, e, mapa.tile, espejo, opciones);
  if (guardia === null)
    throw new Error('no hay ninguna guardia a la que se llegue hoy y se pueda tocar');
  return await mirarGuardia(mapa, guardia);
}

/** Lleva la cámara hasta `guardia` y comprueba que se puede tocar. */
async function mirarGuardia(mapa: Mapa, guardia: Point): Promise<Point> {
  await mapa.mirar(guardia);
  const px = await mapa.pixel(guardia);
  if (!tocable(await caja(mapa.page), px)) {
    throw new Error(
      `la guardia de (${guardia.x},${guardia.y}) cae en (${px.x},${px.y}) con la cámara ya en ella: no se puede tocar`,
    );
  }
  return guardia;
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
  for (let i = 0; i < -RUEDA_DE_LA_PATRULLA; i++) await mapa.rueda(-1);
  const b = await caja(page);
  const dentro = (p: { x: number; y: number }) => tocable(b, p);
  const explorada = (p: Point) => espejo.explorado?.has(p) ?? true;
  /**
   * El centro de la casilla y el sitio de la chapa. Una figura puede quedar
   * detrás de un árbol y el centro de su casilla no cambiar; la chapa de cuántos
   * son va siempre encima, así que es lo que dice que el grupo se ha movido
   * aunque su figura no se vea.
   */
  const muestraDeCasilla = async (p: Point): Promise<number[]> => {
    const px = await mapa.pixel(p);
    const t = mapa.tile;
    return [
      ...(await pixelesDelLienzo(page, px.x - b.x, px.y - b.y)),
      ...(await pixelesDelLienzo(page, px.x - b.x + t * 0.3, px.y - b.y + t * 0.32)),
    ];
  };
  for (let intento = 0; intento < 4 && espejo.state.finished === null; intento++) {
    // Lo que se ve de cada grupo hoy, y el lienzo alrededor: lo más que anda
    // mañana (`pasosDeLaPatrulla`: 2 o 3 en el 42×42, #229).
    const alcance = pasosDeLaPatrulla(espejo.state.day + 1);
    const antes = new Map<string, number[]>();
    const posiciones = new Map(espejo.state.raiders.map((r) => [r.id, { ...r.at }]));
    // Solo cuenta un grupo que se ve hoy y mañana: uno en lo explorado pero
    // fuera de la vista no se pinta (s2 con los mapas de #224, raider-5).
    const vistosAyer = new Set(espejo.asaltantesALaVista().map((r) => r.id));
    for (const r of espejo.state.raiders) {
      if (!explorada(r.at) || !dentro(await mapa.pixel(r.at))) continue;
      for (let dy = -alcance; dy <= alcance; dy++) {
        for (let dx = -alcance; dx <= alcance; dx++) {
          const p = { x: r.at.x + dx, y: r.at.y + dy };
          const clave = `${p.x},${p.y}`;
          if (antes.has(clave)) continue;
          antes.set(clave, await muestraDeCasilla(p));
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
      const tapado = espejo.state.raiders.find((r) => mirando.has(r.at) && !explorada(r.at));
      if (tapado !== undefined) {
        throw new Error(
          `${prefijo}: ${tapado.id} en (${tapado.at.x},${tapado.at.y}) está a la vista y la niebla lo tapa (H1)`,
        );
      }
      // Los que ve la persona, con la regla del núcleo (basta su región, #130).
      const aLaVista = espejo.asaltantesALaVista();
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
    const vistosHoy = new Set(espejo.asaltantesALaVista().map((r) => r.id));
    const movido = espejo.state.raiders.find((r) => {
      const ayer = posiciones.get(r.id);
      return (
        ayer !== undefined &&
        vistosAyer.has(r.id) &&
        vistosHoy.has(r.id) &&
        (ayer.x !== r.at.x || ayer.y !== r.at.y) &&
        antes.has(`${ayer.x},${ayer.y}`) &&
        antes.has(`${r.at.x},${r.at.y}`)
      );
    });
    if (movido === undefined) {
      // Los de lo explorado pueden quedarse quietos un día (s99, con el mapa de
      // #215: el único a la vista no se mueve y los demás andan en la niebla):
      // se descubre el mapa, una vez, como cuando no se ve ninguno.
      if (!espejo.revealAll && espejo.state.finished === null) {
        await page.getByRole('button', { name: 'Ver mapa entero' }).click();
        espejo.revealAll = true;
        // Lo descubierto carga sus figuras hoja a hoja: la muestra de antes se
        // toma con ellas ya puestas (con 200 ms, la casilla de ayer salía vacía).
        await sleep(1000);
        log(`${prefijo}: ningún asaltante a la vista se movió en un día; se descubre el mapa`);
      }
      continue;
    }
    const ayer = posiciones.get(movido.id) as Point;
    await sleep(250);
    await captura(page, `${prefijo}-asaltante-andando`);
    // Que llegue: la patrulla dura sus casillas al paso de su figura
    // (`msPorCasilla`), y no un plazo fijo.
    const cuerpo = movido.troops[0]?.creature;
    if (cuerpo === undefined) throw new Error(`${prefijo}: ${movido.id} no tiene tropa`);
    const patrulla =
      Math.hypot(movido.at.x - ayer.x, movido.at.y - ayer.y) *
      msPorCasilla(cuerpo, 'walk', ALTO_DEL_GRUPO);
    await sleep(patrulla + 300);
    await captura(page, `${prefijo}-asaltante-llegado`);
    const cambio = async (p: Point): Promise<number> => {
      const ahora = await muestraDeCasilla(p);
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
  const b0 = await cajaDeEscritorio(browser, url, problemas);
  const escena = buscarEmboscada(b0);
  const adonde = escena.destino;
  log(
    `emboscada: semilla ${escena.semilla} y destino (${adonde.x},${adonde.y}), buscados en el espejo`,
  );
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'emboscada avisada',
    semilla: escena.semilla,
    esperada: b0,
  });
  const ruta = espejo.previewPath(adonde);
  const salta = ruta.find((p) => p.emboscada !== undefined);
  // La búsqueda ya lo exigió en otro espejo; si aquí no sale, espejo y búsqueda
  // no juegan la misma partida.
  if (salta === undefined || salta.emboscada === undefined) {
    throw new Error(
      `semilla ${escena.semilla}: la búsqueda dio una emboscada en la ruta a (${adonde.x},${adonde.y}) y el espejo no la ve`,
    );
  }
  const grupo = salta.emboscada;
  const explorado = espejo.explorado;
  if (explorado === null || !explorado.has(grupo.at)) {
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
  const destino = await mapa.pixel(adonde);
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
  await mapa.pulsar(adonde);
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
  // Era una semilla fija —la 273, la 534, la 97…— que caía cada vez que el
  // héroe o el mapa cambiaban; la busca el espejo (`buscarDerrota`).
  const b = await cajaDeEscritorio(browser, url, problemas);
  const { semilla, guardia: suya } = buscarDerrota(b);
  log(`batalla perdida: semilla ${semilla}, guardia (${suya.x},${suya.y}), buscadas en el espejo`);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'batalla perdida',
    semilla,
    esperada: b,
  });
  const guardia = { at: await mirarGuardia(mapa, suya) };
  await mapa.pulsar(guardia.at);
  if (espejo.battle === null) {
    throw new Error(`semilla ${semilla}: no hubo batalla: ${espejo.status}`);
  }
  await esperarCola(espejo.battle, espejo.battle.log);
  await captura(page, 'desktop-13-batalla-que-se-pierde');
  await page.getByRole('button', { name: 'Resolver sola' }).click();
  espejo.autoResolveBattle();
  await sleep(400);
  await comprobar(page, espejo, 'resolver la batalla perdida');
  const final = [...espejo.state.log].reverse().find((e) => e.kind === 'battle_ended');
  const perdida = final?.kind === 'battle_ended' && final.winner === 'defender';
  log(`batalla de la semilla ${semilla}: ${perdida ? 'PERDIDA' : 'ganada'}`);
  if (!perdida) throw new Error('la batalla que debía perderse se ha ganado: cambia de guardia');
  // El héroe derrotado vuelve a la base: en el castillo, sin tropa y sin
  // movimiento, y la crónica lo cuenta en ese orden.
  const vuelto = espejo.myHeroes()[0];
  const base = baseOf(espejo.state, espejo.jugador.id);
  if (vuelto === undefined || base === null) {
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
  const b = await cajaDeEscritorio(browser, url, problemas);
  const semilla = await buscarSinArte(b);
  log(`sin arte: semilla ${semilla}, buscada en el espejo`);
  const { page, espejo, mapa } = await abrir(browser, url, problemas, {
    nombre: 'sin arte',
    semilla,
    esperada: b,
    // Solo las imágenes: los JSON de las hojas se importan como módulo y viven
    // en la misma carpeta; negarlos no es «sin arte», es romper la página. Con
    // los mapas densos entran también las piezas de `assets/mapa/` y las
    // texturas de terreno: sin ellas, montañas, nodos, ciudades, pueblos y
    // recursos caen a su marcador y el suelo a su pigmento. Y las hojas de las
    // unidades (`assets/unidades/`): desde que el juego recluta las de la arena
    // (19-10-2026) la tropa se pintaba con su arte, y la escena de la tropa no
    // enseñaba ningún marcador.
    sinImagenes: /\/(rpg|characters|mapa|unidades|generated\/terrain)\/.*\.(png|webp)$/,
  });
  await captura(page, 'sin-arte-01-mapa');
  // La escena de la tropa sin arte: cada figura, su marcador con la inicial.
  await page.keyboard.press('t');
  await page.waitForSelector('#app[data-escena="tropa"]', { timeout: 5000 });
  await sleep(300);
  await captura(page, 'sin-arte-03-tropa');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 5000 });
  await page.mouse.move(5, 5);
  await sleep(300);
  // Sin arte la figura no respira y el lienzo no se repinta solo: el
  // deslizamiento de la patrulla es lo que tiene que pedir los fotogramas.
  await patrullaALaVista(page, espejo, mapa, 'sin-arte-02');
  await mapa.pulsar(await guardiaALaVista(mapa, espejo));
  if (espejo.battle !== null) {
    await esperarCola(espejo.battle, espejo.battle.log);
    await captura(page, 'sin-arte-02-batalla');
  }
  await page.close();
}

// ------------------------------------------------------------------ la tropa en escena

/**
 * Una muestra de la luz del lienzo, uno de cada 16 píxeles de dispositivo: con
 * ella se mira si el mapa de después de la tropa es el de antes (la misma cámara),
 * sin exigir que las figuras que respiran estén en el mismo fotograma.
 */
async function huellaDelLienzo(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    const l = document.getElementById('canvas') as HTMLCanvasElement;
    const c = l.getContext('2d');
    if (c === null) throw new Error('el lienzo no tiene contexto 2D');
    const d = c.getImageData(0, 0, l.width, l.height).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4 * 16) {
      out.push(((d[i] ?? 0) * 2 + (d[i + 1] ?? 0) * 7 + (d[i + 2] ?? 0)) / 10);
    }
    return out;
  });
}

/** La parte de las muestras que cambia de luz más de 40: con la cámara movida, casi todas. */
function cuantoCambia(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > 40) n++;
  return n / a.length;
}

/**
 * Pulsa (o toca) en el lienzo el medio del cuerpo de la figura de caja `c`, y
 * devuelve el píxel pulsado en el lienzo: lo que pulsa luego el espejo. El ratón
 * llega moviéndose, como una persona, para que la escena vea la señalada.
 */
async function pulsarLaFigura(
  page: Page,
  b: Caja,
  c: CajaDeFigura,
  toque = false,
): Promise<{ x: number; y: number }> {
  const x = Math.round(b.x + c.x);
  const y = Math.round(b.y + c.suelo - c.alto * 0.5);
  if (toque) await page.touchscreen.tap(x, y);
  else {
    await page.mouse.move(x - 4, y);
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
  }
  return { x: x - b.x, y: y - b.y };
}

/**
 * Pulsa en el lienzo a la figura `i` de la escena de la tropa, y lo mismo en el
 * espejo con la MISMA clase que lee el clic en la página (`EscenaTropa`), así que
 * a quién elige el espejo es por construcción a quién elige la página.
 */
async function pulsarEnLaTropa(page: Page, espejo: Session, i: number): Promise<void> {
  const b = await caja(page);
  const escena = new EscenaTropa(() => espejo);
  escena.encuadrar(b.width, b.height, await densidadDe(page));
  const vista = espejo.vistaDeLaTropa();
  if (vista === null) throw new Error('tropa: el espejo no está en la escena de la tropa');
  const e = escena.encuadre(vista);
  const en = e.en[i];
  if (en === undefined) throw new Error(`tropa: no hay figura ${i} en la escena`);
  const p = await pulsarLaFigura(page, b, cajasDeLaTropa(e.camara)(en));
  escena.pulsar(p.x, p.y);
}

/** Espera a que el lienzo diga que la elegida es la del espejo (`canvas[data-tropa]`). */
async function esperarLaElegida(page: Page, espejo: Session, paso: string): Promise<void> {
  const vista = espejo.vistaDeLaTropa();
  const id = vista?.figuras[vista.elegida]?.id;
  if (id === undefined) throw new Error(`tropa: tras «${paso}» el espejo no tiene elegida`);
  await page.waitForSelector(`#canvas[data-tropa="${id}"]`, { timeout: 3000 }).catch(async () => {
    const tiene = await page.locator('#canvas').getAttribute('data-tropa');
    throw new Error(`tropa: tras «${paso}» la página elige «${tiene}» y el espejo «${id}»`);
  });
  const titulo = (await page.locator('#side .ficha-de-la-tropa h2').innerText()).trim();
  if (titulo.toUpperCase() !== vista!.ficha.nombre.toUpperCase()) {
    throw new Error(
      `tropa: tras «${paso}» la ficha de la página es «${titulo}» y la del espejo «${vista!.ficha.nombre}»`,
    );
  }
}

/** La barra de la página dice lo mismo que la del espejo; si no, lanza con `quien` delante. */
async function mismaBarra(
  page: Page,
  espejo: Session,
  paso: string,
  quien = 'tropa',
): Promise<void> {
  const dice = (await page.locator('#status').innerText()).trim();
  if (dice !== espejo.status) {
    throw new Error(
      `${quien}: tras «${paso}» la barra dice «${dice}» y la del espejo «${espejo.status}»`,
    );
  }
}

/**
 * La cota del encuadre de una escena de pie (E1 del ciclo de corrección de la
 * tropa; C2 de la morada), con las cajas de la misma cuenta que pinta la página y
 * el lienzo medido en ella: nadie más grande que su hoja a la densidad de la página
 * (`pasoDeLaHoja`; decisión del usuario del 20-10-2026: agrandadas pixelaban) ni fuera
 * del lienzo, y en una fila (`enFila`, de izquierda a derecha) ninguna pisa a la
 * de al lado. `dice` es lo que va al registro tras el número de figuras.
 */
function cotaDelEncuadre(
  b: Caja,
  densidad: number,
  quien: string,
  cajas: readonly CajaDeFigura[],
  dice: (alto: number, tope: number) => string,
  enFila = false,
): void {
  const tope = cajaDeFiguraEn(
    { paso: pasoDeLaHoja(densidad), origenX: 0, origenY: 0, compresion: COMPRESION_SUELO },
    { x: 0, y: 0 },
  ).alto;
  const grandes = cajas.filter((c) => c.alto > tope + 1e-6).length;
  const fuera = cajas.filter(
    (c) =>
      c.x - c.ancho / 2 < 0 ||
      c.x + c.ancho / 2 > b.width ||
      c.suelo - c.alto < 0 ||
      c.suelo > b.height,
  ).length;
  const pisadas = enFila
    ? cajas.filter((c, i) => i > 0 && c.x - cajas[i - 1]!.x < c.ancho).length
    : 0;
  log(
    `${quien}: ${dice(Math.round(Math.max(...cajas.map((c) => c.alto))), Math.round(tope))} en ${Math.round(b.width)}×${Math.round(b.height)}`,
  );
  if (grandes > 0 || fuera > 0 || pisadas > 0) {
    throw new Error(
      `${quien}: ${grandes} figuras más grandes que su hoja, ${fuera} fuera del lienzo y ${pisadas} pisando a la de al lado`,
    );
  }
}

/** La cota del arco de la tropa: con `tropa` de los suyos y el héroe, en el lienzo de la página. */
async function cotaDeLaTropa(page: Page, quien: string, tropa: number): Promise<void> {
  const b = await caja(page);
  const densidad = await densidadDe(page);
  const e = encuadrarLaTropa({ ancho: b.width, alto: b.height, densidad }, tropa);
  cotaDelEncuadre(
    b,
    densidad,
    quien,
    e.en.map((p) => cajasDeLaTropa(e.camara)(p)),
    (alto, tope) =>
      `${tropa + 1} figuras, el de delante mide ${alto} px (tope de la hoja, ${tope}),`,
  );
}

/**
 * La tropa del héroe en escena (19-10-2026): con la T se abre, pulsar a uno lo
 * elige (el aro en el lienzo y su ficha en el panel), se le quita el gambesón al
 * héroe y se le pone, con doble clic, a un novato que no es el primero de su tipo
 * —con el espejo a la par: el oro, la barra y a quién se elige, que no salta—, el
 * panel abre arriba aunque el del mapa estuviera bajado, y «Volver al mapa» deja
 * el mapa con la cámara de antes y su panel donde estaba (la
 * vista movida con la rueda y un arrastre, para que volver a la de siempre no
 * pase por igual). Y la escena a 1280×720, a 1024×768 y en el móvil, con la cota del
 * encuadre (`cotaDelEncuadre`) en cada uno.
 */
async function tropaEnEscena(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const semilla = 7;
  const { page, espejo, mapa } = await abrir(browser, url, problemas, { nombre: 'tropa', semilla });
  const heroe = espejo.selectedHero;
  if (heroe === null || heroe.army.length < 2) {
    throw new Error(`tropa: la semilla ${semilla} no abre con un héroe con tropa`);
  }
  await mapa.rueda(1);
  await mapa.arrastrar(-160, -90);
  await page.mouse.move(5, 5);
  await sleep(300);
  const cajaAntes = await caja(page);
  const huellaAntes = await huellaDelLienzo(page);
  // El panel del mapa, bajado del todo: la tropa abre arriba igual y, al volver,
  // el mapa lo encuentra donde lo dejó (QA, H3).
  const lateralDelMapa = await page.evaluate(() => {
    const l = document.getElementById('lateral') as HTMLElement;
    l.scrollTop = l.scrollHeight;
    return l.scrollTop;
  });
  if (lateralDelMapa <= 0) {
    throw new Error(
      'tropa: el panel del mapa no se desplaza y no se puede ver si la tropa abre arriba',
    );
  }

  await page.keyboard.press('t');
  espejo.abrirLaTropa();
  await page.waitForSelector('#app[data-escena="tropa"]', { timeout: 5000 });
  await esperarLaElegida(page, espejo, 'abrir con la T');
  await mismaBarra(page, espejo, 'abrir con la T');
  const lateralDeLaTropa = await page.evaluate(
    () => (document.getElementById('lateral') as HTMLElement).scrollTop,
  );
  if (lateralDeLaTropa !== 0) {
    throw new Error(
      `tropa: el panel de la tropa abre bajado ${lateralDeLaTropa} px (el del mapa estaba en ${lateralDelMapa}): la lista de a quién elegir no se ve`,
    );
  }
  await sleep(400);
  await cotaDeLaTropa(page, 'tropa', heroe.army.length);
  await captura(page, 'tropa-01-escena');

  // Pulsar en el lienzo al segundo de la tropa.
  await pulsarEnLaTropa(page, espejo, 2);
  await esperarLaElegida(page, espejo, 'pulsar al segundo de la tropa');
  await captura(page, 'tropa-02-elegida');

  // Al héroe, por su botón del panel, y quitarle el gambesón.
  await page.locator('#side [data-action="tropa-elegir"][data-quien="heroe"]').click();
  espejo.elegirEnLaTropa({ heroe: true });
  await esperarLaElegida(page, espejo, 'elegir al héroe en el panel');
  await page.locator('#side [data-action="tropa-quitar"][data-slot="armadura"]').click();
  espejo.quitarALaElegida('armadura');
  await sleep(200);
  await mismaBarra(page, espejo, 'quitarle el gambesón al héroe');
  await comprobar(page, espejo, 'quitarle el gambesón al héroe');
  if (!heroe.mochila.includes('gambeson')) {
    throw new Error(`tropa: el gambesón no ha vuelto a la mochila del espejo: ${espejo.status}`);
  }
  const armadura = page.locator('#side .ficha-de-la-tropa .row', { hasText: 'Armadura' });
  const dice = (await armadura.innerText()).replace(/\s+/g, ' ').trim();
  if (!dice.endsWith(String(espejo.vistaDeLaTropa()!.ficha.armadura))) {
    throw new Error(
      `tropa: sin el gambesón la ficha dice «${dice}» y el espejo ${espejo.vistaDeLaTropa()!.ficha.armadura}`,
    );
  }
  await captura(page, 'tropa-03-sin-gambeson');

  // Ponérselo a un novato que no es el primero de su tipo, pulsado en el lienzo:
  // lo lleva ÉL y la elección no salta al primero (QA, H2). Con doble clic en
  // «Poner»: juega una vez y la barra no dice que algo falló (QA, H6).
  const otro = heroe.army.findIndex(
    (t, i) =>
      t.veterania === undefined &&
      t.member === undefined &&
      heroe.army.slice(0, i).some((u) => u.creature === t.creature && u.veterania === undefined),
  );
  if (otro < 0) {
    throw new Error(
      `tropa: la semilla ${semilla} no lleva dos novatos del mismo tipo para ver a quién se le pone`,
    );
  }
  await pulsarEnLaTropa(page, espejo, otro + 1);
  await esperarLaElegida(page, espejo, `pulsar al ${otro + 1}.º de la tropa`);
  const poner = page.locator('#side [data-action="tropa-poner"][data-item="gambeson"]');
  if (!(await poner.isEnabled())) {
    throw new Error(
      `tropa: «Poner» el gambesón sale apagado: ${espejo.vistaDeLaTropa()!.ficha.mochila[0]?.poner}`,
    );
  }
  await poner.dblclick();
  espejo.ponerALaElegida('gambeson');
  espejo.ponerALaElegida('gambeson');
  await sleep(200);
  await mismaBarra(page, espejo, `ponerle el gambesón al ${otro + 1}.º con doble clic`);
  await esperarLaElegida(page, espejo, `ponerle el gambesón al ${otro + 1}.º`);
  if (heroe.army[otro]?.veterania?.equipo?.armadura !== 'gambeson') {
    throw new Error(
      `tropa: el gambesón no lo lleva el ${otro + 1}.º de la tropa: ${espejo.status}`,
    );
  }
  if (!espejo.status.endsWith('lleva ahora Gambesón.')) {
    throw new Error(`tropa: tras el doble clic en «Poner» la barra dice «${espejo.status}»`);
  }
  await comprobar(page, espejo, `ponerle el gambesón al ${otro + 1}.º`);
  await captura(page, 'tropa-04-gambeson-puesto');
  log(`tropa: ${espejo.status} (el ${otro + 1}.º de la tropa, con doble clic)`);

  // «Volver al mapa»: el mismo héroe y la misma cámara.
  await page.locator('[data-action="cerrar-tropa"]').click();
  espejo.cerrarLaTropa();
  await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 5000 });
  await page.mouse.move(5, 5);
  await sleep(500);
  const cajaDespues = await caja(page);
  if (
    cajaDespues.width !== cajaAntes.width ||
    cajaDespues.height !== cajaAntes.height ||
    cajaDespues.x !== cajaAntes.x ||
    cajaDespues.y !== cajaAntes.y
  ) {
    throw new Error(
      `tropa: el lienzo del mapa era ${JSON.stringify(cajaAntes)} y al volver es ${JSON.stringify(cajaDespues)}`,
    );
  }
  const cambio = cuantoCambia(huellaAntes, await huellaDelLienzo(page));
  log(`tropa: al volver al mapa cambia el ${(cambio * 100).toFixed(1)} % del lienzo`);
  if (cambio > 0.05) {
    await captura(page, 'tropa-05-mapa-movido');
    throw new Error(
      `tropa: al volver al mapa cambia el ${(cambio * 100).toFixed(1)} % del lienzo: la cámara no es la de antes`,
    );
  }
  await comprobar(page, espejo, 'volver al mapa');
  // Como lo dejó: bajado lo mismo, o hasta el fondo si el panel ha encogido (el
  // gambesón ya no está en la mochila del héroe).
  const alVolver = await page.evaluate(() => {
    const l = document.getElementById('lateral') as HTMLElement;
    return { en: l.scrollTop, fondo: l.scrollHeight - l.clientHeight };
  });
  const esperado = Math.min(lateralDelMapa, alVolver.fondo);
  log(
    `tropa: el panel del mapa, bajado ${lateralDelMapa} px; en la tropa, 0; al volver, ${alVolver.en} (fondo ${alVolver.fondo})`,
  );
  if (Math.abs(alVolver.en - esperado) > 2) {
    throw new Error(
      `tropa: el panel del mapa estaba bajado ${lateralDelMapa} px y al volver está en ${alVolver.en} (su fondo, ${alVolver.fondo})`,
    );
  }
  const elegido = await page.locator('#side h2').first().innerText();
  if (elegido.trim().toUpperCase() !== heroe.name.toUpperCase()) {
    throw new Error(`tropa: al volver al mapa el panel enseña a «${elegido}» y no a ${heroe.name}`);
  }
  await captura(page, 'tropa-05-de-vuelta-en-el-mapa');
  await page.close();

  // A 1280×720, a 1024×768 y en el móvil: abrir con el botón «Tropa» (tocándolo en el
  // móvil), y la cota del encuadre en cada uno.
  for (const v of [
    { nombre: 'tropa-1280', viewport: { width: 1280, height: 720 }, movil: false },
    { nombre: 'tropa-1024', viewport: { width: 1024, height: 768 }, movil: false },
    { nombre: 'tropa-movil', viewport: { width: 390, height: 844 }, movil: true },
  ]) {
    const contexto = await browser.newContext(
      v.movil
        ? { viewport: v.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { viewport: v.viewport },
    );
    const p = await contexto.newPage();
    vigilarConsola(p, v.nombre, problemas);
    await p.goto(`${url}${urlDePartida(semilla)}`, { waitUntil: 'networkidle' });
    await salirDeLaBase(p, v.nombre, v.movil ? 'toque' : 'clic');
    const boton = p.locator('#side [data-action="abrir-tropa"]');
    if (v.movil) await boton.tap();
    else await boton.click();
    await p.waitForSelector(`#app[data-escena="tropa"]`, { timeout: 5000 });
    await p.waitForSelector(`#canvas[data-tropa="${heroe.id}"]`, { timeout: 3000 });
    await sleep(600);
    await cotaDeLaTropa(p, v.nombre, heroe.army.length);
    await captura(p, `${v.nombre}-escena`);
    await contexto.close();
  }
}

// ------------------------------------------------------------------ la morada en escena

/**
 * La escena de la morada del espejo en el lienzo de la página: la MISMA clase que
 * lee el clic en la página (`EscenaMorada`). En Node no pinta: su fondo, la base,
 * no hace falta para encuadrar.
 */
async function escenaDeLaMorada(
  page: Page,
  espejo: Session,
): Promise<{ b: Caja; densidad: number; vista: VistaDeLaMorada; escena: EscenaMorada }> {
  const vista = espejo.vistaDeLaMorada();
  if (vista === null) throw new Error('morada: el espejo no está en la escena de la morada');
  const b = await caja(page);
  const escena = new EscenaMorada(
    () => espejo,
    () => null,
  );
  const densidad = await densidadDe(page);
  escena.encuadrar(b.width, b.height, densidad);
  return { b, densidad, vista, escena };
}

/**
 * Espera a que la página entre en la morada de `sitio` (`canvas[data-morada]`,
 * `<edificio>:<unidad>`), la abre en el espejo y comprueba que la página la abre
 * con el lateral arriba y la misma elegida y la misma barra que él.
 */
async function entrarEnLaMorada(
  page: Page,
  espejo: Session,
  sitio: SitioId,
  quien: string,
): Promise<void> {
  espejo.abrirLaMorada(sitio);
  const vista = espejo.vistaDeLaMorada()!;
  await esperarLaElegidaDeLaMorada(page, espejo, `${quien}: entrar en ${vista.nombre}`);
  const escena = await page.locator('#app').getAttribute('data-escena');
  if (escena !== 'morada')
    throw new Error(`${quien}: la página está en «${escena}» y no en la morada`);
  const lateral = await page.evaluate(
    () => (document.getElementById('lateral') as HTMLElement).scrollTop,
  );
  if (lateral !== 0) {
    throw new Error(`${quien}: el panel de la morada abre bajado ${lateral} px: la lista no se ve`);
  }
  await mismaBarra(page, espejo, 'entrar', quien);
  // El fondo y la fila, ya con lo que haya de arte.
  await sleep(500);
}

/** Espera a que el lienzo diga que la elegida es la del espejo, y su ficha en el panel. */
async function esperarLaElegidaDeLaMorada(
  page: Page,
  espejo: Session,
  paso: string,
): Promise<void> {
  const vista = espejo.vistaDeLaMorada()!;
  const marca = `${vista.edificio}:${vista.figuras[vista.elegida]!.id}`;
  await page
    .waitForSelector(`#canvas[data-morada="${marca}"]`, { timeout: 8000 })
    .catch(async () => {
      const tiene = await page.locator('#canvas').getAttribute('data-morada');
      throw new Error(`${paso}: la página está en «${tiene}» y el espejo en «${marca}»`);
    });
  const titulo = (await page.locator('#side .ficha-de-la-morada h3').first().innerText()).trim();
  if (titulo.toUpperCase() !== vista.ficha.nombre.toUpperCase()) {
    throw new Error(
      `${paso}: la ficha de la página es «${titulo}» y la del espejo «${vista.ficha.nombre}»`,
    );
  }
}

/**
 * Pulsa (o toca) en el lienzo la figura de `unidad` y la elige en el espejo con la
 * misma escena que lee el clic en la página (`EscenaMorada`), en el píxel pulsado.
 */
async function pulsarEnLaMorada(
  page: Page,
  espejo: Session,
  unidad: string,
  quien: string,
  toque = false,
): Promise<void> {
  const { b, vista, escena } = await escenaDeLaMorada(page, espejo);
  const i = vista.figuras.findIndex((f) => f.id === unidad);
  if (i < 0) throw new Error(`${quien}: ${unidad} no se recluta en ${vista.nombre}`);
  const e = escena.encuadre(vista);
  const p = await pulsarLaFigura(page, b, cajasDeLaMorada(e.camara)(e.en[i]!), toque);
  escena.pulsar(p.x, p.y);
  if (espejo.vistaDeLaMorada()!.figuras[espejo.vistaDeLaMorada()!.elegida]!.id !== unidad) {
    throw new Error(`${quien}: pulsar la figura de ${unidad} no la elige en el espejo`);
  }
  await esperarLaElegidaDeLaMorada(page, espejo, `${quien}: pulsar la figura de ${unidad}`);
}

// ------------------------------------------------------------------ el ayuntamiento en escena

/**
 * Espera a que el lienzo diga que el elegido del ayuntamiento es el del espejo
 * (`canvas[data-ayuntamiento]`, su tipo), y su ficha en el panel.
 */
async function esperarElElegidoDelAyuntamiento(
  page: Page,
  espejo: Session,
  paso: string,
): Promise<void> {
  const vista = espejo.vistaDelAyuntamiento();
  if (vista === null) throw new Error(`${paso}: el espejo no está ante el ayuntamiento`);
  const marca = vista.figuras[vista.elegida]!.id;
  await page
    .waitForSelector(`#canvas[data-ayuntamiento="${marca}"]`, { timeout: 8000 })
    .catch(async () => {
      const tiene = await page.locator('#canvas').getAttribute('data-ayuntamiento');
      throw new Error(`${paso}: la página está en «${tiene}» y el espejo en «${marca}»`);
    });
  const tipo = (
    await page.locator('#side .ficha-del-ayuntamiento .tipo-de-heroe').innerText()
  ).trim();
  if (tipo.toUpperCase() !== vista.ficha.nombreDelTipo.toUpperCase()) {
    throw new Error(
      `${paso}: la ficha de la página es de «${tipo}» y la del espejo de «${vista.ficha.nombreDelTipo}»`,
    );
  }
}

/**
 * Pulsa en el lienzo la figura del tipo `tipo` y la elige en el espejo con
 * la misma escena que lee el clic en la página (`EscenaAyuntamiento`), en el píxel
 * pulsado. En Node no pinta: su fondo, la base, no hace falta para encuadrar.
 */
async function pulsarEnElAyuntamiento(
  page: Page,
  espejo: Session,
  tipo: string,
  quien: string,
  toque = false,
): Promise<void> {
  const vista = espejo.vistaDelAyuntamiento();
  if (vista === null) throw new Error(`${quien}: el espejo no está ante el ayuntamiento`);
  const b = await caja(page);
  const escena = new EscenaAyuntamiento(
    () => espejo,
    () => null,
  );
  escena.encuadrar(b.width, b.height, await densidadDe(page));
  const i = vista.figuras.findIndex((f) => f.id === tipo);
  if (i < 0) throw new Error(`${quien}: ${tipo} no se contrata en ${vista.nombre}`);
  const e = escena.encuadre(vista);
  const p = await pulsarLaFigura(page, b, cajasDeLaMorada(e.camara)(e.en[i]!), toque);
  escena.pulsar(p.x, p.y);
  const ahora = espejo.vistaDelAyuntamiento()!;
  if (ahora.figuras[ahora.elegida]!.id !== tipo) {
    throw new Error(`${quien}: pulsar la figura de ${tipo} no la elige en el espejo`);
  }
  await esperarElElegidoDelAyuntamiento(page, espejo, `${quien}: pulsar la figura de ${tipo}`);
}

/**
 * Vuelve de la morada a la base con «Volver a la base» (clic o toque) o con
 * Escape, en la página y en el espejo, y comprueba que una sola pulsación deja
 * la base —no el mapa— con quien anduvo quieto.
 */
async function salirDeLaMorada(
  page: Page,
  espejo: Session,
  gesto: 'boton' | 'toque' | 'escape',
  quien: string,
): Promise<void> {
  const volver = page.locator('[data-action="cerrar-morada"]');
  if (gesto === 'escape') await page.keyboard.press('Escape');
  else if (gesto === 'toque') await volver.tap();
  else await volver.click();
  espejo.cerrarLaMorada();
  await esperarLaBase(page, 'quieto');
  // Un fotograma más: un Escape que cerrara también la base se vería ahora.
  await sleep(300);
  const escena = await page.locator('#app').getAttribute('data-escena');
  if (escena !== 'town' || (await page.locator('#canvas').getAttribute('data-morada')) !== null) {
    throw new Error(`${quien}: al salir de la morada con ${gesto} la página está en «${escena}»`);
  }
}

/**
 * La cota de la fila de la morada (C2, C12): enteras, sin pisarse y no más grandes
 * que su hoja, y quien anduvo, delante de la fila, no tapa a ninguna (su cabeza
 * queda por debajo de los pies de todas). Dice cuánto se acercó la cámara a la de la base.
 */
async function cotaDeLaFila(page: Page, espejo: Session, quien: string): Promise<void> {
  const { b, densidad, vista, escena } = await escenaDeLaMorada(page, espejo);
  const e = escena.encuadre(vista);
  const cajas = e.en.map(cajasDeLaMorada(e.camara));
  const d = disposicionDe(vista.faccion);
  // Quien anduvo espera delante de la fila (`dondeEsperaEnLaMorada`): su cabeza,
  // por debajo de los pies de todos los reclutas.
  const suya = cajaDeFiguraEn(e.camara, dondeEsperaEnLaMorada(d, vista.sitio));
  const tapados = cajas.filter((c) => suya.suelo - suya.alto < c.suelo).length;
  if (tapados > 0) {
    throw new Error(`${quien}: quien anduvo tapa a ${tapados} reclutas, delante de la fila`);
  }
  const base = pasoDeLaBase(b.height);
  cotaDelEncuadre(
    b,
    densidad,
    quien,
    cajas,
    (alto, tope) =>
      `${vista.nombre} con ${e.en.length} figuras de ${alto} px (tope de la hoja, ${tope}), con la base acercada ×${(e.camara.paso / base).toFixed(2)} (${Math.round(base)} → ${Math.round(e.camara.paso)} px por paso),`,
    true,
  );
}

/**
 * Reclutar dentro de la morada (20-10-2026), en el escritorio y en el móvil: los
 * templarios (su edificio, abierto si su versión abierta está en el índice) y los
 * orkos (su marcador, con las cuatro figuras de su pueblo delante).
 * Se entra pulsando el edificio en la base (en el móvil, tocándolo en la lista),
 * se elige la segunda figura en el lienzo y se sale: en el escritorio con un solo
 * Escape, que deja la base y no el mapa; en el móvil, tocando «Volver a la base».
 */
async function moradaEnEscena(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const semilla = 12;
  for (const faccion of ['templarios', 'orkos'] as const) {
    for (const movil of [false, true]) {
      const nombre = `morada-${faccion}${movil ? '-movil' : ''}`;
      const contexto = await browser.newContext(
        movil
          ? {
              viewport: { width: 390, height: 844 },
              deviceScaleFactor: 2,
              isMobile: true,
              hasTouch: true,
            }
          : { viewport: { width: 1440, height: 900 } },
      );
      const page = await contexto.newPage();
      vigilarConsola(page, nombre, problemas);
      const espejo = new Session(semilla, faccion);
      espejo.abrirSuBase();
      await page.goto(`${url}${urlDePartida(semilla, faccion)}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
      await esperarLaBase(page, 'quieto');
      const d = disposicionDe(faccion);
      if (movil) {
        await page.locator('#side [data-action="ir-a-sitio"][data-sitio="lvl1"]').tap();
      } else {
        await pulsarEnLaBase(page, d, d.entrada, laPuerta(d, 'lvl1'));
      }
      await entrarEnLaMorada(page, espejo, 'lvl1', nombre);
      const vista = espejo.vistaDeLaMorada()!;
      const esperadas = faccion === 'orkos' ? 4 : 2;
      if (vista.figuras.length !== esperadas) {
        throw new Error(
          `${nombre}: ${vista.nombre} tiene ${vista.figuras.length} unidades y no ${esperadas}`,
        );
      }
      await cotaDeLaFila(page, espejo, nombre);
      await captura(page, `${nombre}-01-entrar`);
      await pulsarEnLaMorada(page, espejo, vista.figuras[1]!.id, nombre, movil);
      await captura(page, `${nombre}-02-la-segunda`);
      // El panel de la elegida: sus cifras, su reclutamiento y, si no se puede, por qué.
      const f = espejo.vistaDeLaMorada()!.ficha;
      const ficha = (await page.locator('#side .ficha-de-la-morada').innerText()).replace(
        /\s+/g,
        ' ',
      );
      for (const texto of [`Índice ${f.indice} · nivel ${f.nivel}`, `${f.precio} cada uno`]) {
        if (!ficha.includes(texto))
          throw new Error(`${nombre}: la ficha no dice «${texto}»: ${ficha}`);
      }
      if (f.motivo !== null && !ficha.includes(f.motivo)) {
        throw new Error(`${nombre}: la ficha no escribe por qué no se recluta («${f.motivo}»)`);
      }
      log(`${nombre}: ${f.nombre}, ${f.motivo === null ? `caben ${f.plan?.maximo}` : f.motivo}`);
      await salirDeLaMorada(page, espejo, movil ? 'toque' : 'escape', nombre);
      await captura(page, `${nombre}-03-de-vuelta-en-la-base`);
      await contexto.close();
    }
  }
}

// ------------------------------------------------------------------ la base a varios anchos

/**
 * La base a todo el alto (C16 de la vuelta 2 de la morada, 20-10-2026: «al hacer
 * la pantalla más estrecha se encoge la parte donde se ve la base; eso no pasa en
 * el mapa»): a 1440, 1100 y 800 de ancho, el lienzo de la base, el de la morada y
 * el del mapa miden lo mismo de alto (a 800 la barra de arriba ocupa dos líneas y
 * los tres pierden lo mismo), y el adulto, 0,95 pasos de la base de ese alto
 * (`pasoDeLaBase`, que no lee el ancho); en el móvil, el marco de 380 del
 * combate. Deja la base y la morada de cada ancho en captura.
 */
async function baseAVariosAnchos(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const semilla = 12;
  for (const ancho of [1440, 1100, 800, 390]) {
    const movil = ancho < 760;
    const nombre = `base-anchos-${ancho}`;
    const contexto = await browser.newContext(
      movil
        ? {
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
          }
        : { viewport: { width: ancho, height: 900 } },
    );
    const page = await contexto.newPage();
    vigilarConsola(page, nombre, problemas);
    const espejo = new Session(semilla, 'templarios');
    espejo.abrirSuBase();
    await page.goto(`${url}${urlDePartida(semilla, 'templarios')}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app[data-escena="town"]', { timeout: 30_000 });
    await esperarLaBase(page, 'quieto');
    // El arte de la base, ya llegado: la captura es para mirarla.
    await sleep(800);
    const enLaBase = await caja(page);
    const marco = await page.locator('.map-wrap').boundingBox();
    if (marco === null) throw new Error(`${nombre}: no hay marco del lienzo`);
    const paso = pasoDeLaBase(enLaBase.height);
    log(
      `${nombre}: la base en ${Math.round(enLaBase.width)}×${Math.round(enLaBase.height)} (marco de ${Math.round(marco.height)} de alto), el adulto de ${Math.round(0.95 * paso)} px`,
    );
    await captura(page, `${nombre}-01-base`);
    const lista = page.locator('#side [data-action="ir-a-sitio"][data-sitio="lvl1"]');
    if (movil) await lista.tap();
    else await lista.click();
    await entrarEnLaMorada(page, espejo, 'lvl1', nombre);
    const enLaMorada = await caja(page);
    if (Math.abs(enLaMorada.height - enLaBase.height) > 0.5) {
      throw new Error(
        `${nombre}: la morada mide ${enLaMorada.height} de alto y la base ${enLaBase.height}`,
      );
    }
    await cotaDeLaFila(page, espejo, nombre);
    await sleep(500);
    await captura(page, `${nombre}-02-morada`);
    await salirDeLaMorada(page, espejo, movil ? 'toque' : 'escape', nombre);
    // La base, al alto del mapa, también en el móvil (QA I2 de la vuelta 2).
    const volver = page.locator('[data-action="close-town"]');
    if (movil) await volver.tap();
    else await volver.click();
    await page.waitForSelector('#app[data-escena="adventure"]', { timeout: 10_000 });
    const enElMapa = await caja(page);
    if (Math.abs(enElMapa.height - enLaBase.height) > 0.5) {
      throw new Error(
        `${nombre}: la base mide ${enLaBase.height} de alto y el mapa ${enElMapa.height}`,
      );
    }
    await contexto.close();
  }
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
 *
 * Con los mapas densos (03-10-2026) la partida del agente —el plan de la semilla
 * 3 en 34×34— es más larga y trae **once** finales en vez de cinco: medido en dos
 * pasadas, **21,17 y 21,16 s**, con 76 y 65 fotogramas atrasados. 28 s es esa
 * medida con el mismo 30 % de holgura. El telón sigue comprimiendo —once finales
 * de 2,5 s enteros serían unos 27 s más— y eso es lo que el plazo vigila.
 *
 * Y con la marcha que no patina (03-10-2026) un tramo dura sus casillas al paso
 * de quien anda —~1,3 s por casilla andando, donde antes eran 520 ms el tramo
 * entero—, así que el espectador va mucho más atrasado: medido en dos pasadas,
 * **79,8 y 79,7 s**, con 76 y 78 fotogramas atrasados y ocho finales después.
 * 104 s es esa medida con el mismo 30 % de holgura. El ritmo máximo del telón
 * (×12) no se tocó: es una decisión de cómo se ve, y queda para el usuario.
 *
 * Al verlo, el usuario pidió la marcha «un poco más rápido» (`PRISA_DE_LA_MARCHA`,
 * ~0,9 s por casilla andando), y el atraso bajó con ella: medido en dos pasadas,
 * **60,6 y 63,0 s**, con 74 y 77 fotogramas atrasados y ocho finales después.
 * 82 s es la mayor con el mismo 30 % de holgura.
 *
 * Con el proyectil en la suelta (#136) el disparo de quien tiene `suelta` en su
 * hoja —arco y ballesta— dura 1 020 ms y no 620; el de quien no la tiene, como
 * el liche, sigue en 620. Medido en dos pasadas: **62,0 y 63,8 s**, con 79 y 74
 * fotogramas atrasados y ocho finales después. Dentro de lo de antes: el telón
 * acelera lo atrasado, y 82 s sigue siendo la mayor medida con su holgura.
 */
const PLAZO_DEL_GAME_OVER_MS = 82_000;

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
    // Era la 50 del servidor con el plan 7 de la política, fijas: «no necesita
    // nada del mapa». Sí necesita: un ascenso, batallas del agente, y no tantas
    // que el espectador no llegue al final en su plazo —con el plan 18 no
    // llegaba—. La busca `partida-del-arnes.ts` jugando la partida entera.
    const buscada = await semillaDelEspectador();
    const semilla = buscada.semilla;
    log(`espectador: semilla ${semilla}, ${buscada.como}`);
    servidor = await arrancarServidor(
      entornoDelArnes(semilla),
      // Con un veterano de rango 5 en la base del agente, como `pnpm qa`: el
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
            // Por debajo de HEROES_WAIT_AGENT_MS (30 s): mientras se espera, el
            // servidor no juega por el agente y el mapa sigue siendo el del día 1.
            await esperarElSuelo(page, 'espectador', 25_000, log);
            await sleep(300);
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
          const data = decidir(msg.kind, msg.payload, semilla);
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

// ------------------------------------------------------------------------ arena

/** El ataque que se le pone a mano al guerrero, distinto del de por defecto. */
const ATAQUE_EDITADO = 9;
/**
 * El ataque con que pelea el guerrero con escudo si su cuerpo tiene `ataque`: el
 * de su cuerpo con su equipo encima, que lo suma `unidadDeCombate`. La tarjeta y
 * el stack enseñan este; la ficha, el del cuerpo.
 */
function ataqueEnLaPelea(ataque: number): number {
  // La página pelea con el catálogo de equipo del disco, el del juego (`conLosCatalogosDevueltos`).
  return unidadDeCombate(delCatalogo('templario-escudo', { attack: ataque }), EQUIPO_DEL_JUEGO)
    .attack;
}

/**
 * La unidad `id` del catálogo (`data/unidades.json`), con los cambios que se le
 * pidan: la misma fuente de cifras que la página, así que el espejo pelea lo
 * mismo que ella.
 */
function delCatalogo(id: string, cambios: Partial<Unidad> = {}): Unidad {
  return { ...unidad(id), ...cambios };
}

/** Una unidad del catálogo como fuente del montaje del espejo. */
function delBorrador(unidad: Unidad): FuenteDeArena {
  return { unidad };
}

/**
 * La pelea de la pasada en el espejo: el guerrero con escudo —con el ataque
 * cambiado— solo en el bando de la persona, y enfrente el orco y el goblin
 * arquero, en IA. Quién mueve es del bando entero: el monje que iba en IA junto
 * al guerrero ya no cabe en el bando de la persona. Ya empezada, como la página, que mira el tablero de salida y
 * DESPUÉS deja jugar a la IA.
 */
function espejoDeLaArena(semilla: number): SesionDeArena {
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: {
        unidades: [delBorrador(delCatalogo('templario-escudo', { attack: ATAQUE_EDITADO }))],
        heroe: null,
        ia: false,
      },
      derecha: {
        unidades: [
          delBorrador(delCatalogo('orko-dos-armas')),
          delBorrador(delCatalogo('goblin-arquero')),
        ],
        heroe: null,
        ia: true,
      },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  espejo.empezar();
  return espejo;
}

/**
 * Lo que la persona hace en su turno de la pelea de la arena: golpear al primer
 * enemigo al que llega, la primera vez que puede; si aún no ha golpeado ni
 * andado, un tramo hacia el enemigo más cercano; y si no, «Terminar turno».
 * La juegan la pasada y la búsqueda de su semilla, que tienen que hacer lo mismo.
 */
type JugadaDeLaPauta =
  | { readonly tipo: 'golpe'; readonly contra: BattleStack }
  | { readonly tipo: 'tramo'; readonly mover: BattleAction & { type: 'move' } }
  | { readonly tipo: 'terminar' };

function jugadaDeLaPauta(espejo: SesionDeArena, tramos: number, golpes: number): JugadaDeLaPauta {
  const turno = espejo.turnoPropio;
  if (turno === null)
    throw new Error('arena: el espejo devuelve el control sin que le toque a la persona');
  const acciones = espejo.battleLegalActions();
  const enemigos = espejo.battle.stacks.filter((x) => isAlive(x) && x.side !== turno.side);
  const contra = enemigos.find((e) =>
    acciones.some(
      (a) =>
        (a.type === 'attack' && a.target === e.id) || (a.type === 'aim' && hexEquals(a.at, e.hex)),
    ),
  );
  if (golpes === 0 && contra !== undefined) return { tipo: 'golpe', contra };
  if (golpes === 0 && tramos === 0 && acciones.some((a) => a.type === 'move')) {
    // El hex al que se puede ir más cerca del enemigo más cercano.
    const cerca = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.map((e) => hexDistance(h, e.hex)));
    const mover = acciones
      .flatMap((a) => (a.type === 'move' ? [a] : []))
      .sort((a, b) => cerca(a.to) - cerca(b.to))[0] as BattleAction & { type: 'move' };
    return { tipo: 'tramo', mover };
  }
  return { tipo: 'terminar' };
}

/**
 * Juega en la página y en el espejo un paso de la pauta que no es golpear (el
 * golpe depende del píxel que se pulsa, y cada pasada lo hace a su manera): el
 * tramo, con un clic en su casilla, o «Terminar turno». Lo comparten las pasadas
 * de la rueda.
 */
async function ejecutarPauta(
  page: Page,
  espejo: SesionDeArena,
  j: Exclude<JugadaDeLaPauta, { tipo: 'golpe' }>,
): Promise<void> {
  if (j.tipo === 'tramo') {
    const b0 = await caja(page);
    const c = centroHex(tableroPara(b0.width, b0.height), j.mover.to);
    const b = await alcanzar(page, c.x);
    await page.mouse.click(b.x + c.x, b.y + c.y);
    espejo.playBattleAction(j.mover);
  } else {
    await page.getByRole('button', { name: 'Terminar turno' }).click();
    espejo.playBattleAction({ type: 'end_turn' });
  }
}

/**
 * La semilla de la pelea de la arena: la primera en la que, jugando la pauta, el
 * guerrero anda al menos un tramo antes de alcanzar a nadie y llega a golpear
 * antes de que la pelea acabe, que es lo que la pasada exige. Se decide entero
 * antes del primer golpe —el único paso que depende de dónde se pulsa—, así
 * que el espejo solo no necesita la página.
 *
 * Era la 5, y la 6 desde que la velocidad pasó a ser por unidad (02-10-2026):
 * con el orko berserker a 5 casillas, en la 5 el guerrero caía antes de golpear.
 * Se buscó entonces a mano con esta misma pauta; ahora la busca esto (#131).
 */
function buscarArena(): number {
  for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS; semilla++) {
    const espejo = espejoDeLaArena(semilla);
    let tramos = 0;
    for (let jugadas = 0; jugadas < 400 && espejo.battle.finished === null; jugadas++) {
      contestarEnElEspejo(espejo);
      if (espejo.battle.finished !== null) break;
      const jugada = jugadaDeLaPauta(espejo, tramos, 0);
      if (jugada.tipo === 'golpe') {
        if (tramos > 0) return semilla;
        break;
      }
      if (jugada.tipo === 'tramo') {
        espejo.playBattleAction(jugada.mover);
        tramos++;
      } else espejo.playBattleAction({ type: 'end_turn' });
    }
  }
  throw new Error(
    `arena: en las semillas 1–${TOPE_DE_SEMILLAS} el guerrero nunca anda un tramo y luego golpea antes de que acabe la pelea`,
  );
}

/** Lo que el panel «En el campo» tiene que decir, sacado del espejo. */
function campoDelEspejo(s: SesionDeArena): string[] {
  return s.battle.stacks
    .filter((x) => isAlive(x))
    .map((x) => `${x.topHp} PV · ${s.laLlevaLaIA(x.id) ? 'IA' : 'tú'}`);
}

async function campoDeLaPagina(page: Page): Promise<string[]> {
  // `div.stack`: los botones del libro también son `.stack` y llevan su coste en `.count`.
  return (await page.locator('#side div.stack .count').allInnerTexts()).map((t) =>
    t.replace(/\s+/g, ' ').trim(),
  );
}

/** Comprueba, con el tablero ya quieto, que la página y el espejo pelean la misma batalla. */
async function mismaPelea(page: Page, espejo: SesionDeArena, paso: string): Promise<void> {
  const esperado = campoDelEspejo(espejo);
  const plazo = Date.now() + 8_000;
  let visto: string[] = [];
  while (Date.now() < plazo) {
    visto = await campoDeLaPagina(page);
    if (JSON.stringify(visto) === JSON.stringify(esperado)) return;
    await sleep(120);
  }
  throw new Error(
    `arena: tras «${paso}» la página y el espejo se han separado: la página dice ${JSON.stringify(visto)} y el espejo ${JSON.stringify(esperado)}`,
  );
}

/**
 * La arena (`/arena/`), con clics de verdad: monta dos bandos, cambia el ataque
 * de una unidad en su ficha, deja una en «Yo», pelea —un tramo con un clic en el
 * tablero, un golpe con un clic en el enemigo— y deja que la IA acabe; vuelve al
 * montaje, guarda y mira que el archivo lleva la cifra cambiada.
 *
 * El borrador que hubiera se aparta antes —la página arrancaría con él y el
 * espejo no lo sabría— y se deja como estaba al salir, pase lo que pase: la
 * prueba no puede dejar en el repo un archivo que nadie ha pedido.
 */
async function arena(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  await conLosCatalogosDevueltos('arena', (ruta) => jugarArena(browser, url, problemas, ruta));
}

/**
 * Juega `fn` y deja los catálogos de unidades y de equipo como estaban al salir,
 * pase lo que pase: «Guardar» escribe en los dos, y la prueba no puede dejar en el
 * repo lo que nadie ha pedido. **No se apartan** (simplify de F1, 18-10-2026): los
 * importa el núcleo y de ellos leen la página y el espejo; sin ellos no carga
 * nada.
 */
async function conLosCatalogosDevueltos(
  quien: string,
  fn: (ruta: string) => Promise<void>,
): Promise<void> {
  const ruta = join(process.cwd(), RUTA_DEL_CATALOGO_DE_UNIDADES);
  const deEquipo = join(process.cwd(), RUTA_DEL_CATALOGO_DE_EQUIPO);
  const catalogo = readFileSync(ruta, 'utf8');
  const equipo = readFileSync(deEquipo, 'utf8');
  try {
    await fn(ruta);
  } finally {
    writeFileSync(ruta, catalogo);
    writeFileSync(deEquipo, equipo);
    log(`${quien}: catálogos de unidades y de equipo devueltos como estaban`);
  }
}

// ------------------------------------------------- poderes y edición en combate

/**
 * La vida del monje en la pasada de los poderes: con la de salida el orco lo
 * tumba de un golpe (lo prefiere: es lo más frágil) y no llega a curar a nadie.
 * 30 en la escala de fheroes2, a la de las cifras como todo.
 */
const VIDA_DEL_MONJE = 30 * ESCALA_DE_CIFRAS;

/**
 * La pelea de los poderes en el espejo: el monje templario (Curar y Bendecir),
 * el guerrero con escudo y el héroe por defecto a la izquierda, de la persona;
 * el orco a la derecha, de la IA. Ya empezada, como la página.
 */
function espejoDeLosPoderes(semilla: number): SesionDeArena {
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: {
        unidades: [
          delBorrador(delCatalogo('templario-monje', { hp: VIDA_DEL_MONJE })),
          delBorrador(delCatalogo('templario-escudo')),
        ],
        heroe: heroePorDefecto('izquierda'),
        ia: false,
      },
      derecha: {
        unidades: [delBorrador(delCatalogo('orko-dos-armas'))],
        heroe: null,
        ia: true,
      },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  espejo.empezar();
  return espejo;
}

/**
 * Lo que la persona hace en su turno de la pelea de los poderes: con el monje,
 * la primera vez Bendecir sobre el guerrero (con más de un aliado posible, se
 * apunta), y después Curar en cuanto se pueda; con lo demás, «Terminar turno».
 */
type PasoDeLosPoderes =
  | { readonly tipo: 'bendecir'; readonly sobre: BattleStack }
  | { readonly tipo: 'curar'; readonly accion: BattleAction }
  | { readonly tipo: 'terminar' };

function pasoDeLosPoderes(espejo: SesionDeArena, bendecido: boolean): PasoDeLosPoderes {
  const turno = espejo.turnoPropio;
  if (turno === null) throw new Error('poderes: el espejo devuelve el control sin turno propio');
  if (turno.stack.body !== 'templario-monje') return { tipo: 'terminar' };
  const legales = espejo.battleLegalActions();
  if (!bendecido) {
    const escudo = espejo.battle.stacks.find((x) => x.body === 'templario-escudo' && isAlive(x));
    if (escudo !== undefined) return { tipo: 'bendecir', sobre: escudo };
  }
  const curas = legales.filter((a) => a.type === 'power' && a.poder === 'curar');
  // Con un solo herido el botón cura ya; con dos habría que apuntar.
  if (bendecido && curas.length === 1) return { tipo: 'curar', accion: curas[0] as BattleAction };
  return { tipo: 'terminar' };
}

/**
 * La semilla de la pelea de los poderes: la primera en la que, jugando la pauta,
 * el monje bendice al guerrero, cura luego a un solo herido y la pelea sigue con
 * un turno de la persona después, para editar en plena pelea.
 */
function buscarPoderes(): number {
  for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS; semilla++) {
    const espejo = espejoDeLosPoderes(semilla);
    let bendecido = false;
    for (let jugadas = 0; jugadas < 300 && espejo.battle.finished === null; jugadas++) {
      contestarEnElEspejo(espejo);
      if (espejo.battle.finished !== null) break;
      const paso = pasoDeLosPoderes(espejo, bendecido);
      if (paso.tipo === 'curar') {
        espejo.playBattleAction(paso.accion);
        contestarEnElEspejo(espejo);
        if (espejo.turnoPropio !== null) return semilla;
        break;
      }
      if (paso.tipo === 'bendecir') {
        espejo.playBattleAction({ type: 'power', poder: 'bendecir', target: paso.sobre.id });
        bendecido = true;
      } else espejo.playBattleAction({ type: 'end_turn' });
    }
  }
  throw new Error(
    `poderes: en las semillas 1–${TOPE_DE_SEMILLAS} el monje no bendice y cura antes de que acabe la pelea`,
  );
}

/** Espera a que el parte de guerra del panel diga `linea`. */
async function parteDice(page: Page, linea: string): Promise<void> {
  await page
    .locator('#side .log', { hasText: linea })
    .waitFor({ timeout: 4000 })
    .catch(async () => {
      throw new Error(
        `poderes: el parte no dice «${linea}»: «${await page.locator('#side .log').innerText()}»`,
      );
    });
}

/**
 * Los poderes del monje y la edición en plena pelea, con clics de verdad
 * (docs/agents/2026-10-11-poderes-y-edicion-en-combate/): Curar sale apagado
 * mientras nadie tiene herida; Bendecir se apunta sobre el guerrero, con su
 * previsión en la barra; Curar cura al herido; «Editar» en la fila del orco abre
 * su ficha en un diálogo, un daño imposible no entra y lo dice, un ataque +5 sí
 * entra; el héroe, con más Conocimiento, tiene más maná; cerrar devuelve la
 * misma ronda y la misma activa, y lo que se juega después es lo del espejo, que
 * recibe los mismos cambios.
 */
async function poderesEnLaArena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  await conLosCatalogosDevueltos('poderes', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    vigilarConsola(page, 'poderes', problemas);
    const semilla = buscarPoderes();
    log(`poderes: semilla ${semilla}, buscada en el espejo`);
    await abrirLaArena(page, url, `?seed=${semilla}`);
    await page.locator('[data-unidad-catalogo="templario-monje"] [data-lado="izquierda"]').click();
    await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
    await page.locator('[data-arena="poner-heroe"][data-lado="izquierda"]').click();
    await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
    // La ficha del monje en el montaje ya dice lo que hacen sus poderes, en la
    // nota de su etiqueta (13-10-2026: toda aclaración es un tooltip).
    await page.locator('#bando-izquierda button.nombre[data-unidad="templario-monje"]').click();
    await page
      .locator(
        `#ficha [data-poder-de-la-ficha="curar"] .nota[aria-label*="cura ${poder('curar').lanzador.cantidad} PV"]`,
      )
      .waitFor({ timeout: 2000 });
    const vida = page.locator('#ficha [data-campo="hp"]');
    await vida.fill(String(VIDA_DEL_MONJE));
    await vida.press('Tab');
    await page
      .locator('#bando-izquierda .puesto', { hasText: `${VIDA_DEL_MONJE} PV` })
      .waitFor({ timeout: 2000 });

    const espejo = espejoDeLosPoderes(semilla);
    const nombre = (id: string): string => {
      const st = espejo.battle.stacks.find((x) => x.id === id);
      return st === undefined ? id : nombreEnElCampo(espejo.battle, st);
    };
    await page.locator('[data-arena="luchar"]').click();
    await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });
    await esperarCola(espejo.battle, espejo.battle.log);
    await mismaPelea(page, espejo, 'empezar la pelea de los poderes');

    let bendecido = false;
    let curado = false;
    for (let jugadas = 0; !curado; jugadas++) {
      if (jugadas > 300 || espejo.battle.finished !== null) {
        throw new Error('poderes: la pelea se acaba sin que el monje bendiga y cure');
      }
      const antes = espejo.battle.log.length;
      // La golpearon al cerrar su turno: primero, su respuesta en la rueda.
      await responderLaRueda(page, espejo);
      if (espejo.battle.finished !== null) {
        throw new Error('poderes: la pelea se acaba sin que el monje bendiga y cure');
      }
      const paso = pasoDeLosPoderes(espejo, bendecido);
      if (paso.tipo === 'bendecir') {
        // Curar, apagado y diciendo por qué: aún no hay heridos.
        const curar = page.locator('#side [data-action="battle-poder"][data-poder="curar"]');
        const motivo = espejo.motivoDePoder('curar');
        if (motivo === null || (await curar.getAttribute('title')) !== motivo) {
          throw new Error(
            `poderes: «Curar» debía salir apagado con «${motivo}» y dice «${await curar.getAttribute('title')}»`,
          );
        }
        await captura(page, 'poderes-01-turno-del-monje');
        await page.locator('#side [data-action="battle-poder"][data-poder="bendecir"]').click();
        await esperarBarra(
          page,
          'Elige el aliado sobre el que usarlo: pulsa en uno de los marcados, o Escape para cancelar.',
          'poderes: Bendecir espera un aliado',
          { exacta: true },
        );
        espejo.poderes.apuntar('bendecir');
        const accion: BattleAction = { type: 'power', poder: 'bendecir', target: paso.sobre.id };
        const prevista = espejo.prevision(accion);
        if (prevista === null) throw new Error('poderes: Bendecir sin previsión en el espejo');
        const px = await pixelDeUnidad(page, espejo, paso.sobre);
        await page.mouse.move(px.x - 6, px.y);
        await page.mouse.move(px.x, px.y);
        await esperarBarra(
          page,
          textoDePrevision(prevista, nombre),
          'poderes: la previsión de Bendecir',
          { exacta: true },
        );
        await captura(page, 'poderes-02-bendecir-apuntando');
        await page.mouse.click(px.x, px.y);
        espejo.playBattleAction(accion);
        bendecido = true;
        await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
        await parteDice(page, `usa Bendecir sobre ${nombre(paso.sobre.id)}`);
      } else if (paso.tipo === 'curar') {
        await page.locator('#side [data-action="battle-poder"][data-poder="curar"]').click();
        espejo.playBattleAction(paso.accion);
        curado = true;
      } else {
        await page.getByRole('button', { name: 'Terminar turno' }).click();
        espejo.playBattleAction({ type: 'end_turn' });
      }
      await responderLaRueda(page, espejo);
      await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
      await mismaPelea(page, espejo, `la jugada ${jugadas} de los poderes`);
    }
    const cura = espejo.battle.log.find((e) => e.kind === 'power' && e.cura !== undefined);
    if (cura?.kind !== 'power') throw new Error('poderes: el espejo no cuenta la cura');
    await parteDice(page, `usa Curar sobre ${nombre(cura.target)}: cura ${cura.cura} PV`);
    await captura(page, 'poderes-03-curado');
    log(`poderes: bendice y cura ${cura.cura} PV a ${nombre(cura.target)}`);

    // «Editar» en la fila del orco: su ficha, en el diálogo.
    const ronda = espejo.battle.round;
    const turno = espejo.battle.turno?.n;
    const activa = await page.locator('#side h2').first().innerText();
    const orco = espejo.battle.stacks.find((x) => x.body === 'orko-dos-armas') as BattleStack;
    await page
      .locator(`#side div.stack [data-arena="editar-en-combate"][data-stack="${orco.id}"]`)
      .click();
    const dialogo = page.locator('#editor-en-combate');
    await dialogo
      .locator('[data-clave-de-ficha="unidad:orko-dos-armas"]')
      .waitFor({ timeout: 2000 });
    await cifrasSinCortar(page, '#editor-en-combate', 'poderes: la ficha en combate');
    // Una agilidad fuera de 2 a 7 no entra y se dice en el diálogo.
    const agilidad = dialogo.locator('[data-campo="agilidad"]');
    await agilidad.fill('99');
    await agilidad.press('Tab');
    await dialogo
      .locator('#aviso-del-editor', { hasText: 'No se cambia:' })
      .waitFor({ timeout: 2000 })
      .catch(async () => {
        throw new Error(
          `poderes: la agilidad imposible no se dice: «${await dialogo.locator('#aviso-del-editor').innerText()}»`,
        );
      });
    await captura(page, 'poderes-04-editor-rechaza');
    const ataque = orco.unit.attack + 5;
    const campo = dialogo.locator('[data-campo="attack"]');
    await campo.fill(String(ataque));
    await campo.press('Tab');
    await dialogo
      .locator('#aviso-del-editor', { hasText: 'Cambiado: vale ya en esta pelea.' })
      .waitFor({ timeout: 2000 });
    const motivoDelOrco = espejo.retocar({
      kind: 'tipo',
      fuente: { unidad: delCatalogo('orko-dos-armas', { attack: ataque }) },
    });
    if (motivoDelOrco !== null)
      throw new Error(`poderes: el espejo no retoca el orco: ${motivoDelOrco}`);
    await captura(page, 'poderes-05-editor');
    await page.locator('[data-arena="cerrar-editor"]').click();
    if (await dialogo.isVisible()) throw new Error('poderes: el diálogo no se cierra');

    // El héroe: con dos de Conocimiento más, diez de maná máximo más por punto.
    const heroe = espejo.battle.stacks.find((x) => x.origen.kind === 'heroe') as BattleStack;
    await page
      .locator(`#side div.stack [data-arena="editar-en-combate"][data-stack="${heroe.id}"]`)
      .click();
    const datos = heroePorDefecto('izquierda');
    const conocimiento = dialogo.locator('[data-heroe-campo="conocimiento"]');
    await conocimiento.fill(String(datos.conocimiento + 2));
    await conocimiento.press('Tab');
    await dialogo
      .locator('#aviso-del-editor', { hasText: 'Cambiado: vale ya en esta pelea.' })
      .waitFor({ timeout: 2000 });
    const motivoDelHeroe = espejo.retocar({
      kind: 'heroe',
      lado: 'izquierda',
      datos: { ...datos, conocimiento: datos.conocimiento + 2 },
    });
    if (motivoDelHeroe !== null)
      throw new Error(`poderes: el espejo no retoca el héroe: ${motivoDelHeroe}`);
    // Escape cierra el diálogo y no suelta nada de la pelea.
    await page.keyboard.press('Escape');
    if (await dialogo.isVisible()) throw new Error('poderes: Escape no cierra el diálogo');

    const mando = espejo.heroeEnJuego;
    if (mando !== null) {
      const texto = `${mando.mando.mana} / ${mando.manaMaximo}`;
      await page
        .locator('#side .row', { hasText: `Maná de ${mando.mando.name}` })
        .filter({ hasText: texto })
        .waitFor({ timeout: 2000 })
        .catch(async () => {
          throw new Error(
            `poderes: el maná del héroe debía decir ${texto}: «${await page.locator('#side').innerText()}»`,
          );
        });
    }
    if (espejo.battle.round !== ronda || espejo.battle.turno?.n !== turno) {
      throw new Error('poderes: retocar ha movido la ronda o el turno del espejo');
    }
    const activaDespues = await page.locator('#side h2').first().innerText();
    if (activaDespues !== activa) {
      throw new Error(`poderes: tras editar la activa era «${activa}» y ahora «${activaDespues}»`);
    }
    await captura(page, 'poderes-06-tras-editar');

    // Y lo que se juega después es lo mismo en la página y en el espejo: el orco
    // pega con el ataque nuevo en los dos.
    for (let i = 0; i < 4 && espejo.battle.finished === null; i++) {
      const antes = espejo.battle.log.length;
      // Si el orco la golpea, su respuesta en la rueda antes de cerrar el turno.
      await responderLaRueda(page, espejo);
      if (espejo.battle.finished !== null) break;
      await page.getByRole('button', { name: 'Terminar turno' }).click();
      espejo.playBattleAction({ type: 'end_turn' });
      await responderLaRueda(page, espejo);
      await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
      if (espejo.battle.finished === null)
        await mismaPelea(page, espejo, `el turno ${i} tras editar`);
    }
    log(
      `poderes: orco con ataque ${ataque} y héroe con ${datos.conocimiento + 2} de Conocimiento, en la misma pelea`,
    );
    await page.close();
  });
}

/**
 * Con todas las unidades en IA la pelea tiene que VERSE: el tablero cuenta jugada
 * a jugada lo que la IA resuelve de golpe. Antes la sesión jugaba ya al montarse,
 * el animador daba todo por contado y a los 100 ms el panel ya decía quién había
 * ganado (H1 de QA). Aquí se exige que el resultado tarde al menos la mitad de lo
 * que dura contar las jugadas del espejo, y que mientras tanto se lea «Contando
 * la jugada…».
 */
async function todoIA(
  page: Page,
  semilla: number,
  izquierda: Unidad,
  derecha: Unidad,
): Promise<void> {
  // Tras recargar, el guerrero ya está a la izquierda en «Yo»: se pasa a la IA.
  await page.locator('#bando-izquierda [data-arena="manda"][data-ia="si"]').click();
  await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: { unidades: [delBorrador(izquierda)], heroe: null, ia: true },
      derecha: { unidades: [delBorrador(derecha)], heroe: null, ia: true },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  espejo.empezar();
  const fin = espejo.battle.finished;
  if (fin === null) throw new Error('arena: con todo en IA el espejo no termina la pelea');
  const cuenta = duracionDeLaJugada(espejo.battle, espejo.battle.log);
  const ganador = LADOS[ladoDe(fin.winner)].adjetivo;
  const inicio = Date.now();
  await page.locator('[data-arena="luchar"]').click();
  await page
    .locator('#side', { hasText: 'Contando la jugada…' })
    .waitFor({ timeout: 1500 })
    .catch(async () => {
      throw new Error(
        `arena: con todo en IA la pelea no se cuenta: el panel dice «${await page.locator('#side').innerText()}»`,
      );
    });
  await captura(page, 'arena-04-todo-ia');
  await page
    .locator('#side h2', { hasText: `Gana el bando ${ganador}` })
    .waitFor({ timeout: cuenta + 10_000 });
  const tardo = Date.now() - inicio;
  if (tardo < cuenta / 2) {
    throw new Error(
      `arena: con todo en IA el resultado sale a los ${tardo} ms, y contar las jugadas lleva ${cuenta} ms: no se ha visto pelear`,
    );
  }
  log(
    `arena: todo en IA, la pelea se cuenta en ${tardo} ms (${cuenta} ms de jugadas) y gana el bando ${ganador}`,
  );
}

async function jugarArena(
  browser: Browser,
  url: string,
  problemas: Problemas,
  ruta: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'arena', problemas);
  const ATAQUE_EN_LA_PELEA = ataqueEnLaPelea(ATAQUE_EDITADO);
  const semillaDeLaPelea = buscarArena();
  log(`arena: semilla ${semillaDeLaPelea}, buscada en el espejo`);
  await abrirLaArena(page, url, `?seed=${semillaDeLaPelea}`);

  // Con clics en el catálogo: el guerrero a la izquierda, que nace en «Yo», y dos
  // a la derecha, que nace en «IA».
  const añadir = async (hoja: string, lado: 'izquierda' | 'derecha'): Promise<void> => {
    await page.locator(`[data-unidad-catalogo="${hoja}"] [data-lado="${lado}"]`).click();
  };
  await añadir('templario-escudo', 'izquierda');
  await añadir('orko-dos-armas', 'derecha');
  await añadir('goblin-arquero', 'derecha');

  // El ataque del guerrero, por su ficha —abierta pulsando su FIGURA, que también
  // elige la unidad—: el cambio entra al salir del campo.
  await page.locator('#bando-izquierda button.ver[data-unidad="templario-escudo"]').click();
  const campo = page.locator('#ficha [data-campo="attack"]');
  await campo.fill(String(ATAQUE_EDITADO));
  await campo.press('Tab');
  const tarjeta = page.locator('#bando-izquierda .puesto').first();
  await tarjeta
    .filter({ hasText: `A ${ATAQUE_EN_LA_PELEA} ·` })
    .waitFor({ timeout: 2000 })
    .catch(async () => {
      throw new Error(
        `arena: la tarjeta no enseña el ataque cambiado: «${await tarjeta.innerText()}»`,
      );
    });
  await sleep(300);
  await cifrasSinCortar(page, '#ficha', 'arena, montaje');
  await captura(page, 'arena-01-montaje');

  // Las 8 direcciones, dirección a dirección: el templario y el orco con las
  // suyas (desde el 05-10-2026 todas las unidades del taller tienen arte propio,
  // y el Y Bot ya no sale aquí), y de cada uno SOLO las que se pintan; y ni
  // un `atlas.webp` de una dirección, que se borró. Se gira la ficha dos veces
  // —de frente-derecha (d1) a espalda-derecha (d3)— y se pide la muerte, que
  // deja el cadáver.
  await page.locator('#ficha [data-arena="girar"]').click();
  await page.locator('#ficha [data-arena="girar"]').click();
  await page.locator('#ficha [data-clip="death"]').click();
  await sleep(1200);
  const pedidas = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => new URL(e.name).pathname)
      .filter((p) => p.startsWith('/unidades/')),
  );
  const orco = hojasDelTaller(process.cwd()).find((h) => h.id === 'orko-dos-armas');
  // El orco está en el bando derecho, quieto y mirando al suroeste (d7).
  const faltan = [
    '/unidades/templario-escudo/d1/atlas.webp',
    '/unidades/templario-escudo/d3/atlas.webp',
    `/unidades/${orco?.id}/d7/atlas.webp`,
  ].filter((u) => !pedidas.includes(u));
  if (faltan.length > 0)
    throw new Error(`arena: no se cargaron las hojas que se pintan: ${faltan.join(', ')}`);
  // Y las que no se pintan, no: la espalda-izquierda del templario y del orco (d5).
  const sobran = [
    '/unidades/templario-escudo/d5/atlas.webp',
    `/unidades/${orco?.id}/d5/atlas.webp`,
  ].filter((u) => pedidas.includes(u));
  if (sobran.length > 0)
    throw new Error(`arena: se cargaron hojas que no se pintan: ${sobran.join(', ')}`);
  const viejas = pedidas.filter((p) => /^\/unidades\/[^/]+\/atlas\.webp$/.test(p));
  if (viejas.length > 0)
    throw new Error(`arena: se pidió arte de una dirección: ${viejas.join(', ')}`);
  await captura(page, 'arena-01b-ficha-girada-cadaver');

  // El espejo: las mismas unidades —las de por defecto de cada hoja, con el
  // ataque cambiado— y la misma semilla.
  const espejo = espejoDeLaArena(semillaDeLaPelea);
  const mio = espejo.battle.stacks.find(
    (x) => x.side === 'attacker' && x.slot === 0,
  ) as BattleStack;
  if (mio.unit.attack !== ATAQUE_EN_LA_PELEA)
    throw new Error('arena: el espejo no lleva el ataque cambiado');

  await page.locator('[data-arena="luchar"]').click();
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });
  const semilla = await page.locator('#seed').innerText();
  if (semilla.trim() !== `semilla ${semillaDeLaPelea}`) {
    throw new Error(
      `arena: la barra debía decir «semilla ${semillaDeLaPelea}» y dice «${semilla}»`,
    );
  }
  await esperarCola(espejo.battle, espejo.battle.log);
  await mismaPelea(page, espejo, 'empezar la pelea');

  let tramos = 0;
  let golpes = 0;
  let jugadas = 0;
  while (espejo.battle.finished === null) {
    if (++jugadas > 400) throw new Error('arena: la pelea no termina en 400 jugadas de la persona');
    const antes = espejo.battle.log.length;
    // La golpearon al empezar o al cerrar su turno: primero, su respuesta.
    await responderLaRueda(page, espejo);
    if (espejo.battle.finished !== null) break;
    const jugada = jugadaDeLaPauta(espejo, tramos, golpes);
    if (jugada.tipo === 'golpe') {
      const { contra } = jugada;
      // El golpe: un clic en el cuerpo del enemigo. La acción es la que la
      // escena del espejo lee en ESE píxel, que es la que manda la página.
      const px = await pixelDeUnidad(page, espejo, contra);
      if (px.accion === undefined)
        throw new Error(`arena: el clic sobre ${contra.id} no da acción`);
      await page.mouse.move(px.x - 6, px.y);
      await page.mouse.move(px.x, px.y);
      await sleep(150);
      if (golpes === 0) await captura(page, 'arena-02-apuntando');
      await page.mouse.click(px.x, px.y);
      espejo.playBattleAction(px.accion);
      golpes++;
    } else if (jugada.tipo === 'tramo') {
      const { mover } = jugada;
      const b0 = await caja(page);
      const c = centroHex(tableroPara(b0.width, b0.height), mover.to);
      const b = await alcanzar(page, c.x);
      await page.mouse.click(b.x + c.x, b.y + c.y);
      espejo.playBattleAction(mover);
      tramos++;
    } else {
      // Lo demás lo cierra la persona con «Terminar turno» y deja hacer a la IA.
      await page.getByRole('button', { name: 'Terminar turno' }).click();
      espejo.playBattleAction({ type: 'end_turn' });
    }
    // Su golpe, o la respuesta si la IA la golpea antes de devolverle el turno.
    await responderLaRueda(page, espejo);
    await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
    // Acabada, el panel ya no enseña el campo sino el resultado: lo mira abajo.
    if (espejo.battle.finished === null) await mismaPelea(page, espejo, `la jugada ${jugadas}`);
  }
  if (tramos === 0 || golpes === 0) {
    throw new Error(
      `arena: la persona debía mover un tramo y golpear; movió ${tramos} y golpeó ${golpes}`,
    );
  }
  const ganador = LADOS[ladoDe(espejo.battle.finished.winner)].adjetivo;
  await page
    .locator('#side h2', { hasText: `Gana el bando ${ganador}` })
    .waitFor({ timeout: 10_000 })
    .catch(async () => {
      throw new Error(
        `arena: el panel debía decir que gana el bando ${ganador} y dice «${await page.locator('#side').innerText()}»`,
      );
    });
  await captura(page, 'arena-03-final');
  log(
    `arena: ${tramos} tramo, ${golpes} golpe; gana el bando ${ganador} en la ronda ${espejo.battle.round}`,
  );

  // De vuelta al montaje, con todo conservado, y a guardar.
  await page.locator('[data-arena="otra-vez"]').click();
  await tarjeta.filter({ hasText: `A ${ATAQUE_EN_LA_PELEA} ·` }).waitFor({ timeout: 2000 });
  await page.locator('[data-arena="guardar"]').click();
  await page
    .waitForFunction(
      (r) =>
        document.getElementById('status')?.textContent?.startsWith(`Guardado en ${r}`) === true,
      RUTA_DEL_CATALOGO_DE_UNIDADES,
      { timeout: 4000 },
    )
    .catch(async () => {
      throw new Error(
        `arena: la barra no dice que se ha guardado: «${await page.locator('#status').innerText()}»`,
      );
    });
  const guardado = leerCatalogo(process.cwd()).unidades;
  const escudo = guardado.find((u) => u.id === 'templario-escudo');
  if (escudo?.attack !== ATAQUE_EDITADO || !existsSync(ruta)) {
    throw new Error(
      `arena: ${RUTA_DEL_CATALOGO_DE_UNIDADES} no lleva el ataque cambiado: ${JSON.stringify(escudo)}`,
    );
  }
  if (guardado.length !== UNIDADES.length) {
    throw new Error(
      `arena: se guarda el catálogo entero (${UNIDADES.length} unidades) y el archivo lleva ${guardado.length}`,
    );
  }
  log(
    `arena: guardado ${RUTA_DEL_CATALOGO_DE_UNIDADES} con el ataque ${escudo.attack} del guerrero`,
  );

  // Al volver a abrir, lo guardado se carga: el guerrero entra con su ataque.
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .waitForFunction(
      (r) =>
        document
          .getElementById('status')
          ?.textContent?.startsWith(`Cargado ${r.ruta}: ${r.n} unidades.`) === true,
      { ruta: RUTA_DEL_CATALOGO_DE_UNIDADES, n: UNIDADES.length },
      { timeout: 4000 },
    )
    .catch(async () => {
      throw new Error(
        `arena: al reabrir no dice que ha cargado el catálogo: «${await page.locator('#status').innerText()}»`,
      );
    });
  await añadir('templario-escudo', 'izquierda');
  await tarjeta
    .filter({ hasText: `A ${ATAQUE_EN_LA_PELEA} ·` })
    .waitFor({ timeout: 2000 })
    .catch(async () => {
      throw new Error(
        `arena: al reabrir, el guerrero no trae el ataque guardado: «${await tarjeta.innerText()}»`,
      );
    });
  log('arena: al reabrir, el catálogo se carga y el guerrero trae su ataque');

  await todoIA(
    page,
    semillaDeLaPelea,
    delCatalogo('templario-escudo', { attack: ATAQUE_EDITADO }),
    delCatalogo('orko-dos-armas'),
  );
  await page.close();
  await bancoDeCombate(browser, url, problemas);
  await enlaceDeLaPelea(browser, url, problemas);
}

// ------------------------------------------------------------- banco de combate

/**
 * El héroe de la pelea del banco tal como lo deja la página: el nombre y el libro
 * de uno recién puesto (todos los hechizos) y el poder y el conocimiento que el
 * guion escribe en su ficha.
 */
const HEROE_DEL_BANCO: HeroeDeArena = {
  nombre: 'Héroe izquierdo',
  figura: null,
  ataque: 2,
  defensa: 2,
  poder: 3,
  conocimiento: 3,
  hechizos: allSpells().map((s) => s.id),
};

/**
 * El espejo de la pelea del banco: el hermano de carga y el héroe, contra un
 * esqueleto guerrero y uno arquero (del catálogo). Hasta el 13-10-2026 eran
 * la caballería, el esqueleto y el arquero del catálogo del juego, que ya no
 * entran en la arena.
 */
function espejoDelBanco(semilla: number): SesionDeArena {
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: {
        unidades: [delBorrador(delCatalogo('templario-hermano-de-carga'))],
        heroe: HEROE_DEL_BANCO,
        ia: false,
      },
      derecha: {
        unidades: [
          delBorrador(delCatalogo('esqueleto-guerrero')),
          delBorrador(delCatalogo('esqueleto-arquero')),
        ],
        heroe: null,
        ia: true,
      },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  espejo.empezar();
  return espejo;
}

/** La Flecha mágica de la persona sobre el primer enemigo al que se le puede lanzar. */
function flechaDelEspejo(espejo: SesionDeArena): (BattleAction & { type: 'cast' }) | undefined {
  return espejo
    .battleLegalActions()
    .find(
      (a): a is BattleAction & { type: 'cast' } => a.type === 'cast' && a.spell === 'magic_arrow',
    );
}

/**
 * La semilla de la pelea del banco: la primera en la que la persona, en su primer
 * turno, puede lanzar la Flecha mágica y, jugando la pauta, llega a golpear.
 */
function buscarBanco(): number {
  for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS; semilla++) {
    const espejo = espejoDelBanco(semilla);
    const flecha = flechaDelEspejo(espejo);
    if (flecha === undefined) continue;
    espejo.playBattleAction(flecha);
    let tramos = 0;
    for (let jugadas = 0; jugadas < 200 && espejo.battle.finished === null; jugadas++) {
      contestarEnElEspejo(espejo);
      if (espejo.battle.finished !== null) break;
      const jugada = jugadaDeLaPauta(espejo, tramos, 0);
      if (jugada.tipo === 'golpe') return semilla;
      if (jugada.tipo === 'tramo') {
        espejo.playBattleAction(jugada.mover);
        tramos++;
      } else espejo.playBattleAction({ type: 'end_turn' });
    }
  }
  throw new Error(`banco: en las semillas 1–${TOPE_DE_SEMILLAS} el héroe no lanza o nadie golpea`);
}

/**
 * Espera a que la barra diga `texto`: exactamente (`exacta`, sin los blancos de
 * los lados) o en alguna parte. `que` dice la pasada y lo que se esperaba, para
 * el error.
 */
async function esperarBarra(
  page: Page,
  texto: string,
  que: string,
  { exacta }: { readonly exacta: boolean },
): Promise<void> {
  await page
    .waitForFunction(
      ([t, e]) => {
        const barra = document.getElementById('status')?.textContent?.trim() ?? '';
        return e ? barra === t : barra.includes(t as string);
      },
      [texto, exacta] as const,
      { timeout: 3000 },
    )
    .catch(async () => {
      throw new Error(
        `${que}: la barra debía decir «${texto}» y dice «${await page.locator('#status').innerText()}»`,
      );
    });
}

/** La arena con `query` (`?seed=…`), con la lista de unidades ya pintada. */
async function abrirLaArena(page: Page, url: string, query: string): Promise<void> {
  await page.goto(`${url}/arena/${query}`, { waitUntil: 'networkidle' });
  await page.locator('[data-unidad-catalogo]').first().waitFor({ timeout: 5000 });
}

/**
 * Que la lista de la arena bajo `raiz` no ofrezca un catálogo del juego aparte
 * (13-10-2026): ni un botón u opción que lo nombre. Mira lo que la página
 * genera hoy: buscar el `data-faccion="catalogo"` de antes pasaba siempre, porque
 * nadie lo escribe ya.
 */
async function sinElCatalogoDelJuego(page: Page, raiz: string, paso: string): Promise<void> {
  const nombrado = await page
    .locator(`${raiz} :is(button, option)`, { hasText: /cat[aá]logo del juego/i })
    .count();
  const ids = await page
    .locator(`${raiz} [data-unidad-catalogo], ${raiz} [data-arena-nueva] option`)
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-unidad-catalogo') ?? e.getAttribute('value') ?? ''),
    );
  if (!ids.some((id) => id !== '')) {
    throw new Error(
      `${paso}: la lista de la arena no tiene unidades, y no hay catálogo que buscar`,
    );
  }
  // Las criaturas de `data/creatures.json` ya no existen (19-10-2026): el
  // catálogo del juego es el de la arena, y solo queda que nada lo nombre aparte.
  if (nombrado > 0) {
    throw new Error(
      `${paso}: la lista de la arena aún ofrece un «catálogo del juego» aparte (${nombrado} botones u opciones que lo nombran)`,
    );
  }
}

/**
 * Hasta que la página ha pintado lo último que se le pidió: las fuentes cargadas
 * y dos fotogramas (el del repintado pendiente y el siguiente, ya con él).
 */
/**
 * Las cifras de las fichas visibles bajo `raiz`, sin cortar (`cifrasCortadas`:
 * ninguna casilla corta su número ni deja de caber cinco cifras, ninguna
 * cabecera se parte, todo a la derecha). Lanza con todo lo que encuentra.
 */
async function cifrasSinCortar(page: Page, raiz: string, paso: string): Promise<void> {
  const fallos = await page.evaluate(cifrasCortadas, raiz);
  if (fallos.length > 0)
    throw new Error(`${paso}: las cifras de la ficha no se leen:\n  ${fallos.join('\n  ')}`);
}

async function asentada(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    ),
  );
}

/**
 * El banco de combate en la arena, con clics de verdad (#ciclo 2026-10-09): un
 * jinete (el hermano de carga; hasta el 13-10-2026, la caballería del catálogo)
 * y un HÉROE con libro a la izquierda, sin el catálogo del juego en la lista ni
 * munición en la ficha y el panel, sin interruptores de reglas, la Flecha
 * mágica lanzada con un clic tras leer su previsión en la barra, y el primer
 * golpe con su previsión, las dos de la misma cuenta del núcleo que el espejo.
 */
async function bancoDeCombate(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'banco', problemas);
  const semilla = buscarBanco();
  log(`banco: semilla ${semilla}, buscada en el espejo`);
  await abrirLaArena(page, url, `?seed=${semilla}`);
  // Sin interruptores (19-10-2026): la arena pelea con las reglas del juego.
  const interruptores = await page
    .locator('#catalogo [data-arena="regla"], #catalogo [data-arena="modo"]')
    .count();
  if (interruptores > 0) {
    throw new Error(`banco: el montaje aún enseña ${interruptores} interruptores de reglas`);
  }
  await sinElCatalogoDelJuego(page, '#catalogo', 'banco');
  await page
    .locator('[data-unidad-catalogo="templario-hermano-de-carga"] [data-lado="izquierda"]')
    .click();
  await page.locator('[data-unidad-catalogo="esqueleto-guerrero"] [data-lado="derecha"]').click();
  await page.locator('[data-unidad-catalogo="esqueleto-arquero"] [data-lado="derecha"]').click();
  // La ficha del arquero: dispara por su arco, sin munición ni tamaño que escribir.
  const fichaDelArquero = await page.locator('#ficha').innerText();
  if (/Disparos|Hexes|Munición/.test(fichaDelArquero)) {
    throw new Error(
      `banco: la ficha del arquero aún habla de munición o tamaño: «${fichaDelArquero}»`,
    );
  }
  if (!/A distancia/.test(fichaDelArquero)) {
    throw new Error('banco: la ficha del arquero no dice su arma a distancia');
  }
  await page.locator('[data-arena="poner-heroe"][data-lado="izquierda"]').click();
  for (const [campo, valor] of [
    ['poder', HEROE_DEL_BANCO.poder],
    ['conocimiento', HEROE_DEL_BANCO.conocimiento],
  ] as const) {
    const c = page.locator(`#ficha [data-heroe-campo="${campo}"]`);
    await c.fill(String(valor));
    await c.press('Tab');
  }
  await page
    .locator(`#ficha [data-mana-de-la-ficha="${HEROE_DEL_BANCO.conocimiento * 10}"]`)
    .waitFor({ timeout: 2000 });
  const tarjetas = await bandosDichos(page);
  if (/tiros|hexes/i.test(tarjetas)) {
    throw new Error(`banco: las tarjetas de los bandos hablan de tiros o casillas: «${tarjetas}»`);
  }
  await sleep(300);
  await captura(page, 'arena-05-banco-montaje');

  const espejo = espejoDelBanco(semilla);
  await page.locator('[data-arena="luchar"]').click();
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });
  if (!page.url().includes(`seed=${semilla}`)) {
    throw new Error(`banco: la URL de la pelea no lleva la semilla: ${page.url()}`);
  }
  await esperarCola(espejo.battle, espejo.battle.log);
  await mismaPelea(page, espejo, 'empezar la pelea del banco');
  // El panel de la pelea no tiene fila de munición (13-10-2026).
  if ((await page.locator('#side').innerText()).includes('Munición')) {
    throw new Error('banco: el panel de la pelea enseña «Munición»');
  }

  // La Flecha mágica: el botón del libro, el puntero sobre el objetivo hasta que
  // la barra dice su previsión, y el clic.
  const flecha = flechaDelEspejo(espejo);
  if (flecha === undefined || flecha.target === undefined) {
    throw new Error('banco: el espejo no deja lanzar la Flecha mágica');
  }
  await page.locator('#side [data-action="battle-spell"][data-spell="magic_arrow"]').click();
  espejo.hechizos.selectSpell('magic_arrow');
  const objetivo = espejo.battle.stacks.find((x) => x.id === flecha.target) as BattleStack;
  const px = await pixelDeUnidad(page, espejo, objetivo);
  await page.mouse.move(px.x - 6, px.y);
  await page.mouse.move(px.x, px.y);
  const nombre = (id: string): string =>
    nombreEnElCampo(espejo.battle, espejo.battle.stacks.find((x) => x.id === id) as BattleStack);
  const prevista = espejo.prevision(flecha);
  if (prevista === null) throw new Error('banco: la Flecha mágica no tiene previsión');
  await esperarBarra(
    page,
    textoDePrevision(prevista, nombre),
    'banco: la previsión de la Flecha mágica',
    {
      exacta: true,
    },
  );
  await captura(page, 'arena-06-prevision-hechizo');
  const antes = espejo.battle.log.length;
  await page.mouse.click(px.x, px.y);
  espejo.playBattleAction(flecha);
  const lanzada = espejo.battle.log.slice(antes).find((e) => e.kind === 'cast');
  if (
    lanzada?.kind !== 'cast' ||
    prevista.kind !== 'hechizo' ||
    lanzada.damage !== prevista.danio
  ) {
    throw new Error(
      `banco: la Flecha mágica hizo ${JSON.stringify(lanzada)} y se preveía ${prevista.kind === 'hechizo' ? prevista.danio : '?'}`,
    );
  }
  await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
  await mismaPelea(page, espejo, 'lanzar la Flecha mágica');
  log(
    `banco: Flecha mágica lanzada con un clic: ${lanzada.damage} de daño, como decía la previsión`,
  );

  // Hasta el primer golpe, con la pauta de la arena; el golpe, con su previsión.
  let tramos = 0;
  for (let jugadas = 0; espejo.battle.finished === null; jugadas++) {
    if (jugadas > 200) throw new Error('banco: nadie golpea en 200 jugadas');
    const desde = espejo.battle.log.length;
    await responderLaRueda(page, espejo);
    if (espejo.battle.finished !== null) break;
    const jugada = jugadaDeLaPauta(espejo, tramos, 0);
    if (jugada.tipo === 'golpe') {
      const g = await pixelDeUnidad(page, espejo, jugada.contra);
      if (g.accion === undefined)
        throw new Error(`banco: el clic sobre ${jugada.contra.id} no da acción`);
      await page.mouse.move(g.x - 6, g.y);
      await page.mouse.move(g.x, g.y);
      const p = espejo.prevision(g.accion);
      if (p === null) throw new Error('banco: el golpe no tiene previsión');
      const texto = textoDePrevision(p, nombre);
      const aqui = (espejo.turnoPropio as { stack: BattleStack }).stack.hex;
      const desdeDonde = g.accion.type === 'attack' ? (g.accion.from ?? aqui) : aqui;
      // «A distancia» (el selector de arma, 26-10-2026): la barra dice la casilla y a
      // quién daría hoy, que puede ser otro que el señalado.
      const esperado =
        g.accion.type === 'aim'
          ? `Apuntarías a (${g.accion.at.col},${g.accion.at.row}).`
          : rotuloDeAngulo(
              desdeDonde,
              cargaContra(espejo.battleCharges(), {
                objetivo: jugada.contra.id,
                elegida: desdeDonde,
              }),
              texto,
            );
      await esperarBarra(page, esperado, 'banco: la previsión del golpe', {
        exacta: g.accion.type !== 'aim',
      });
      await captura(page, 'arena-07-prevision-golpe');
      log(`banco: previsión del golpe — «${esperado}»`);
      await page.mouse.click(g.x, g.y);
      espejo.playBattleAction(g.accion);
      await esperarCola(espejo.battle, espejo.battle.log.slice(desde));
      break;
    }
    if (jugada.tipo === 'tramo') {
      const b0 = await caja(page);
      const c = centroHex(tableroPara(b0.width, b0.height), jugada.mover.to);
      const b = await alcanzar(page, c.x);
      await page.mouse.click(b.x + c.x, b.y + c.y);
      espejo.playBattleAction(jugada.mover);
      tramos++;
    } else {
      await page.getByRole('button', { name: 'Terminar turno' }).click();
      espejo.playBattleAction({ type: 'end_turn' });
    }
    await responderLaRueda(page, espejo);
    await esperarCola(espejo.battle, espejo.battle.log.slice(desde));
    if (espejo.battle.finished === null)
      await mismaPelea(page, espejo, `la jugada ${jugadas} del banco`);
  }
  await page.close();
}

// ------------------------------------------------------------- el enlace de la pelea

/** Lo que dice el montaje de los dos bandos, para comparar dos páginas. */
async function bandosDichos(page: Page): Promise<string> {
  const izquierda = await page.locator('#bando-izquierda').innerText();
  const derecha = await page.locator('#bando-derecha').innerText();
  return `${izquierda}\n---\n${derecha}`;
}

/**
 * El enlace de la pelea (H6 de QA del banco): se monta con clics una pelea con
 * todo lo que lleva el enlace —dos hojas con una cifra sin guardar, un arquero,
 * un héroe con su hoja de figura y sus cifras en cada lado, todo en IA—, se
 * copia el enlace, y abierto en otra página monta lo
 * mismo y se queda en el montaje sin luchar. Un enlace de hoy con una criatura
 * del catálogo (que ya no está en la arena, 13-10-2026), uno de la versión 8 y un
 * `?reglas=` (un interruptor retirado el 19-10-2026) se rechazan diciéndolo.
 *
 * Ya no mira «una unidad de antes no vale y se dice entera en «Avisos al leer»»
 * (`loQueNoValeAlLeer`, retirada el 19-10-2026): `data/unidades.json` es el catálogo
 * del juego, el núcleo lo carga al importarse y una unidad que no vale tumba la
 * página antes de que la arena pueda decirlo (ver «Correcciones de QA (vuelta 1)»
 * en la tarea del combate en el juego).
 */
async function enlaceDeLaPelea(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'enlace', problemas);
  await abrirLaArena(page, url, `?seed=11`);
  const campo = async (selector: string, valor: string): Promise<void> => {
    const c = page.locator(`#ficha ${selector}`);
    await c.fill(valor);
    await c.press('Tab');
  };
  await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
  await campo('[data-campo="attack"]', '11');
  await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
  // Hasta el 13-10-2026, el piquero y el arquero del catálogo con su prueba.
  await page.locator('[data-unidad-catalogo="imperio-piquero"] [data-lado="izquierda"]').click();
  await campo('[data-campo="attack"]', '8');
  await page.locator('[data-unidad-catalogo="elfo-arquero"] [data-lado="derecha"]').click();
  for (const lado of ['izquierda', 'derecha'] as const) {
    await page.locator(`[data-arena="poner-heroe"][data-lado="${lado}"]`).click();
    await campo('[data-heroe-campo="poder"]', lado === 'izquierda' ? '3' : '2');
    const figuras = page.locator('#ficha [data-heroe-campo="figura"] option');
    const figura = await figuras.nth(lado === 'izquierda' ? 1 : 2).getAttribute('value');
    if (figura === null || figura === '')
      throw new Error('enlace: no hay hojas de héroe que elegir');
    await page.locator('#ficha [data-heroe-campo="figura"]').selectOption(figura);
    await cifrasSinCortar(page, '#ficha', `enlace: la ficha del héroe ${lado}`);
    // Sin el Rayo: ejerce el libro del enlace.
    await page.locator('#ficha [data-heroe-hechizo="lightning_bolt"]').uncheck();
    await page.locator(`[data-arena="manda"][data-lado="${lado}"][data-ia="si"]`).click();
  }
  const montado = await bandosDichos(page);
  if (!/6 hechizos/.test(montado)) {
    throw new Error(`enlace: los héroes no llevan el libro sin el Rayo: «${montado}»`);
  }
  if (!/IA/.test(montado) || /catálogo/i.test(montado)) {
    throw new Error(`enlace: el montaje no es el de solo la arena: «${montado}»`);
  }
  await page.locator('[data-arena="enlace"]').click();
  const campoDelEnlace = page.locator('[data-enlace-de-pelea]');
  await campoDelEnlace.waitFor({ timeout: 2000 });
  const enlace = await campoDelEnlace.inputValue();
  if (!enlace.includes('seed=11') || /[?&](reglas|golpe|contacto)=/.test(enlace)) {
    throw new Error(`enlace: el enlace no lleva la semilla, o lleva un interruptor: ${enlace}`);
  }
  log(`enlace: ${enlace.length} caracteres; barra: «${await page.locator('#status').innerText()}»`);
  await sleep(300);
  await captura(page, 'arena-08-enlace-copiado');
  await page.close();

  const otra = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(otra, 'enlace', problemas);
  await otra.goto(enlace, { waitUntil: 'networkidle' });
  await otra.locator('#bando-izquierda .puesto').first().waitFor({ timeout: 5000 });
  const barra = await otra.locator('#status').innerText();
  if (!barra.startsWith('Montada la pelea del enlace (semilla 11)')) {
    throw new Error(`enlace: al abrirlo la barra dice «${barra}»`);
  }
  await sleep(500);
  if ((await otra.locator('#app').getAttribute('data-escena')) !== 'montaje') {
    throw new Error('enlace: abrirlo ha empezado a luchar solo');
  }
  const montadoOtra = await bandosDichos(otra);
  if (montadoOtra !== montado) {
    throw new Error(
      `enlace: el montaje abierto no es el copiado:\n${montado}\n=====\n${montadoOtra}`,
    );
  }
  await captura(otra, 'arena-09-enlace-abierto');
  log('enlace: abierto, monta lo mismo que se copió y no empieza a pelear solo');

  /** El enlace copiado con su montaje cambiado a mano. */
  const conMontaje = (cambiar: (m: Record<string, any>) => void): string => {
    const u = new URL(enlace);
    const m = JSON.parse(u.searchParams.get('montaje') as string) as Record<string, any>;
    cambiar(m);
    u.searchParams.set('montaje', JSON.stringify(m));
    return u.href;
  };
  // Roto: uno de hoy (versión 8) con una criatura del catálogo. No se monta nada, y se dice.
  await otra.goto(
    conMontaje((m) => m.izquierda.puestos.push({ criatura: 'pikeman', escalera: false })),
    { waitUntil: 'networkidle' },
  );
  await otra
    .locator('#status', { hasText: '«criatura» no es un campo del enlace' })
    .waitFor({ timeout: 5000 });
  if ((await otra.locator('#bando-izquierda .puesto, #bando-derecha .puesto').count()) !== 0) {
    throw new Error('enlace: un enlace roto ha montado algo');
  }
  // De otra versión: uno de la anterior no monta nada y dice que se vuelva a
  // copiar (14-10-2026, el usuario: «no queremos mantener compatibilidad hacia
  // atrás»). La anterior, de la de hoy: subirla no deja esta pasada atrás.
  const anterior = VERSION_DEL_ENLACE - 1;
  await otra.goto(
    conMontaje((m) => {
      m.v = anterior;
    }),
    { waitUntil: 'networkidle' },
  );
  await otra
    .locator('#status', {
      hasText: `este enlace es de una versión anterior de la arena (la ${anterior}; la de hoy es la ${VERSION_DEL_ENLACE}): vuelve a copiarlo`,
    })
    .waitFor({ timeout: 5000 });
  if ((await otra.locator('#bando-izquierda .puesto, #bando-derecha .puesto').count()) !== 0) {
    throw new Error(`enlace: uno de la versión ${anterior} ha montado algo`);
  }
  await captura(otra, 'arena-09b-enlace-de-la-anterior');
  log(`enlace: uno de la versión ${anterior} no se monta y dice que se vuelva a copiar`);
  // Un interruptor retirado (19-10-2026) se rechaza diciéndolo, no se ignora.
  await otra.goto(`${url}/arena/?seed=5&reglas=tirador`, { waitUntil: 'networkidle' });
  await otra
    .locator('#status', { hasText: 'la arena pelea con las reglas del juego' })
    .waitFor({ timeout: 5000 });
  log('enlace: el enlace roto y el interruptor retirado se rechazan diciéndolo');
  await otra.close();
}

// --------------------------------------------------------------- edición

/**
 * Los tamaños en los que cada ficha abierta tiene que verse sin desplazarse por
 * dentro ni recortarse, en tres columnas como mucho y las demás debajo (ciclo
 * 2026-10-12, fichas sin tope). Que se vean enteras a la vista ya no se pide: la
 * vista se desplaza como una página.
 */
const PANTALLAS_DE_EDICION = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/** Como mucho tres columnas: lo pidió el usuario a cambio de la letra más grande. */
const COLUMNAS_DE_EDICION = 3;

/**
 * Lo que no vale en la vista de edición, medido en la página: una ficha con
 * desplazamiento propio (su `overflow` o su contenido más alto o más ancho que
 * ella), algo dentro de ella que se sale de su caja, un campo que se desplaza
 * por dentro, el nombre que no se lee entero (H5), una región de dentro de la
 * vista con desplazamiento propio (la vista se desplaza entera, como una
 * página: H2, H3), o la vista o la página desplazándose en horizontal. Devuelve
 * los fallos, en cuántas columnas y filas van las fichas y si la vista se
 * desplaza en vertical (`desplaza`).
 */
async function medirLaEdicion(page: Page): Promise<{
  fallos: string[];
  columnas: number;
  filas: number;
  n: number;
  desplaza: boolean;
}> {
  return page.evaluate(() => {
    const fallos: string[] = [];
    const raiz = document.documentElement;
    const vista = document.querySelector('#edicion') as HTMLElement;
    vista.scrollTop = 0;
    if (vista.scrollWidth > vista.clientWidth + 1)
      fallos.push(
        `la vista se desplaza en horizontal (${vista.scrollWidth} > ${vista.clientWidth})`,
      );
    for (const d of vista.querySelectorAll<HTMLElement>('*')) {
      if (d.tagName === 'SELECT' || d.tagName === 'OPTION') continue;
      const ds = getComputedStyle(d);
      if (
        ['auto', 'scroll'].includes(ds.overflowY) &&
        d.scrollHeight > d.clientHeight + 1 &&
        d.closest('.ficha-abierta') === null
      )
        fallos.push(`${d.className || d.tagName} se desplaza por su cuenta dentro de la vista`);
    }
    if (raiz.scrollWidth > raiz.clientWidth + 1)
      fallos.push(
        `la página se desplaza en horizontal (${raiz.scrollWidth} > ${raiz.clientWidth})`,
      );
    const fichas = [...document.querySelectorAll<HTMLElement>('#edicion .ficha-abierta')];
    const izquierdas = new Set<number>();
    const arribas = new Set<number>();
    for (const f of fichas) {
      const quien = f.getAttribute('data-clave-de-ficha');
      const cs = getComputedStyle(f);
      for (const eje of ['overflowX', 'overflowY'] as const) {
        if (cs[eje] === 'auto' || cs[eje] === 'scroll' || cs[eje] === 'hidden')
          fallos.push(`${quien}: ${eje} es ${cs[eje]}`);
      }
      if (f.scrollHeight > f.clientHeight + 1)
        fallos.push(`${quien}: más alta por dentro (${f.scrollHeight} > ${f.clientHeight})`);
      if (f.scrollWidth > f.clientWidth + 1)
        fallos.push(`${quien}: más ancha por dentro (${f.scrollWidth} > ${f.clientWidth})`);
      const caja = f.getBoundingClientRect();
      izquierdas.add(Math.round(caja.left));
      arribas.add(Math.round(caja.top));
      for (const n of f.querySelectorAll<HTMLInputElement>('input[type="text"]')) {
        if (n.scrollWidth > n.clientWidth + 1)
          fallos.push(`${quien}: «${n.value}» no se lee entero en su campo`);
      }
      for (const d of f.querySelectorAll<HTMLElement>('*')) {
        if (d.tagName === 'OPTION') continue;
        const r = d.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const nombre = `${d.tagName.toLowerCase()}${d.className === '' ? '' : `.${String(d.className).replace(/ /g, '.')}`}`;
        if (r.left < caja.left - 1 || r.right > caja.right + 1 || r.bottom > caja.bottom + 1)
          fallos.push(
            `${quien}: ${nombre} se sale de la ficha (${Math.round(r.left)}-${Math.round(r.right)} en ${Math.round(caja.left)}-${Math.round(caja.right)})`,
          );
        const ds = getComputedStyle(d);
        // Sin funciones con nombre aquí dentro: tsx les pone `__name`, que en la página no existe.
        const desplaza = ['auto', 'scroll'];
        if (
          d.tagName !== 'SELECT' &&
          ((desplaza.includes(ds.overflowY) && d.scrollHeight > d.clientHeight + 1) ||
            (desplaza.includes(ds.overflowX) && d.scrollWidth > d.clientWidth + 1))
        )
          fallos.push(`${quien}: ${nombre} se desplaza por dentro`);
      }
    }
    return {
      fallos,
      columnas: izquierdas.size,
      filas: arribas.size,
      n: fichas.length,
      desplaza: vista.scrollHeight > vista.clientHeight + 1,
    };
  });
}

/**
 * Mide la edición en los tres tamaños de escritorio: cada ficha sin desplazarse
 * por dentro ni recortarse, en `COLUMNAS_DE_EDICION` columnas como mucho (con
 * menos, una por ficha) y las demás en filas debajo. La lista sigue desplegada:
 * abrir una ficha no la pliega (12-10-2026).
 */
async function edicionEntera(page: Page, paso: string): Promise<void> {
  if (
    (await page.locator('#edicion [data-arena="plegar-lista"][aria-expanded="false"]').count()) > 0
  )
    throw new Error(`edición, ${paso}: la lista se ha plegado sola`);
  const dichas: string[] = [];
  for (const v of PANTALLAS_DE_EDICION) {
    await page.setViewportSize(v);
    await asentada(page);
    const m = await medirLaEdicion(page);
    m.fallos.push(...(await page.evaluate(cifrasCortadas, '#edicion')));
    const donde = `${v.width}×${v.height}`;
    if (m.fallos.length > 0)
      throw new Error(`edición, ${paso} a ${donde}:\n  ${m.fallos.join('\n  ')}`);
    const columnas = Math.min(m.n, COLUMNAS_DE_EDICION);
    const filas = Math.ceil(m.n / COLUMNAS_DE_EDICION);
    if (m.columnas !== columnas || m.filas !== filas)
      throw new Error(
        `edición, ${paso} a ${donde}: ${m.n} fichas en ${m.columnas} columnas y ${m.filas} filas, no en ${columnas} y ${filas}`,
      );
    dichas.push(`${v.width} ${m.columnas}×${m.filas}${m.desplaza ? ', se desplaza' : ''}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await asentada(page);
  log(`edición: ${paso}, ${dichas.join('; ')}`);
}

/**
 * La vista de edición de la arena (ciclos 2026-10-11, página de edición, y
 * 2026-10-12, fichas sin tope): se entra desde el montaje y se abren seis fichas
 * de hojas (hasta el 13-10-2026, dos eran criaturas del catálogo) sin tope y sin que la lista se
 * pliegue; con 1 a 6, como mucho tres columnas y las demás debajo, sin
 * desplazarse ni recortarse ninguna, y a 390 de ancho una columna; girar una no
 * gira otra, un campo cambia SU ficha, lo ilegal no entra, y al volver el
 * montaje sigue como estaba con la cifra nueva. «✎» cambia el nombre (Intro lo
 * guarda, Escape no) y un rasgo se pone y se quita por su etiqueta, hasta el
 * montaje. Al ir y volver otra vez, las mismas abiertas.
 */
async function edicionDeLaArena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'edicion', problemas);
  await abrirLaArena(page, url, `?seed=7`);
  // El montaje que tiene que seguir igual: dos unidades y una muralla de ejemplo.
  await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
  await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
  await page.locator('[data-arena="cargar-forma"]').first().click();
  const murosAntes = await page.locator('#muralla .hex.muro').count();
  if (murosAntes === 0) throw new Error('edición: la forma de ejemplo no ha puesto muros');
  const bandosAntes = await bandosDichos(page);
  const urlAntes = page.url();

  await page.locator('[data-arena="ir-a-edicion"]').click();
  await page.locator('#app[data-escena="edicion"]').waitFor({ timeout: 2000 });
  if (await page.locator('#montaje').isVisible()) throw new Error('edición: se ve el montaje');
  if (await page.locator('[data-arena="luchar"]').isVisible())
    throw new Error('edición: «Luchar» se ve en la edición');

  /** La lista plegada con su botón (la captura) se despliega para elegir. */
  const desplegar = async (): Promise<void> => {
    const plegada = page.locator('#edicion [data-arena="plegar-lista"][aria-expanded="false"]');
    if ((await plegada.count()) === 1) await plegada.click();
  };
  // Abrir una trae su ficha a la vista sin plegar la lista (M3 de QA): su
  // cabecera, entera en la vista y por encima de la barra de estado. Antes la
  // primera caía en y=853 de 900, bajo la barra, y desde la cuarta, pantallas
  // más abajo.
  const abrir = async (que: string, paso: string): Promise<void> => {
    await page.locator(`#edicion [data-arena="abrir-ficha"]${que}`).click();
    const [, id] = /^\[data-unidad="([^"]+)"\]$/.exec(que) ?? [];
    if (id === undefined) throw new Error(`edición: «${que}» no dice qué ficha se abre`);
    const clave = `unidad:${id}`;
    await asentada(page);
    const donde = await page.evaluate((c) => {
      const t = document
        .querySelector(`#edicion article[data-clave-de-ficha="${c}"] .titulo-de-ficha`)
        ?.getBoundingClientRect();
      const v = (document.querySelector('#edicion') as HTMLElement).getBoundingClientRect();
      const barra = (document.querySelector('#statusbar') as HTMLElement).getBoundingClientRect();
      if (t === undefined) return `${c} no tiene título`;
      const abajo = Math.min(v.bottom, barra.top);
      return t.top >= v.top - 1 && t.bottom <= abajo + 1
        ? null
        : `la cabecera de ${c} va de ${Math.round(t.top)} a ${Math.round(t.bottom)}, fuera de la vista (${Math.round(v.top)}-${Math.round(abajo)})`;
    }, clave);
    if (donde !== null) throw new Error(`edición, ${paso}: ${donde}`);
    await edicionEntera(page, paso);
  };
  await abrir('[data-unidad="templario-escudo"]', '1 abierta');
  const otraVez = page.locator(
    '#edicion [data-arena="abrir-ficha"][data-unidad="templario-escudo"]',
  );
  if (!(await otraVez.isDisabled()) || (await otraVez.innerText()) !== 'Abierta')
    throw new Error('edición: la ficha abierta se puede abrir otra vez');
  // El monje es la más alta (poderes y habilidades), y el caballero de la muerte
  // lleva el nombre largo que no se leía entero (H5).
  await abrir('[data-unidad="templario-monje"]', '2 abiertas');
  await abrir('[data-unidad="caballero-de-la-muerte"]', '3 abiertas');
  // Por su facción, como se elige en la lista: sin el catálogo del juego (13-10-2026).
  await sinElCatalogoDelJuego(page, '#edicion', 'edición');
  await page.locator('#edicion [data-arena="filtro"][data-faccion="elfos"]').click();
  await abrir('[data-unidad="elfo-arquero"]', '4 abiertas');
  // Sin tope: la quinta y la sexta entran, debajo de las tres primeras.
  await page.locator('#edicion [data-arena="filtro"][data-faccion="no-muertos"]').click();
  await abrir('[data-unidad="esqueleto-guerrero"]', '5 abiertas');
  await page.locator('#edicion [data-arena="filtro"][data-faccion="todas"]').click();
  await abrir('[data-unidad="zombi"]', '6 abiertas');
  await esperarBarra(page, 'Zombie: ficha abierta.', 'edición: la sexta', { exacta: true });
  if ((await page.locator('#edicion .ficha-abierta').count()) !== 6)
    throw new Error('edición: no hay seis fichas abiertas');
  if (!(await medirLaEdicion(page)).desplaza)
    throw new Error('edición: con seis abiertas a 1440×900 la vista no se desplaza');

  // La captura, con la lista plegada por su botón: las fichas, desde arriba.
  await page.locator('#edicion [data-arena="plegar-lista"]').click();
  await asentada(page);
  await captura(page, 'arena-10-edicion-6');
  await desplegar();

  // A 390 de ancho: una debajo de otra y sin desplazarse en horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  await asentada(page);
  const movil = await medirLaEdicion(page);
  movil.fallos.push(...(await page.evaluate(cifrasCortadas, '#edicion')));
  if (movil.fallos.length > 0)
    throw new Error(`edición a 390×844:\n  ${movil.fallos.join('\n  ')}`);
  if (movil.columnas !== 1) throw new Error(`edición a 390×844: en ${movil.columnas} columnas`);
  await page.locator('#edicion .fichas-abiertas').evaluate((e) => e.scrollIntoView());
  await captura(page, 'arena-11-edicion-movil');
  await page.setViewportSize({ width: 1440, height: 900 });
  await asentada(page);
  log('edición: a 390×844, una columna y sin desplazarse en horizontal');

  // Girar la ficha del templario carga su siguiente dirección (d2; ver «Las 8
  // direcciones» en `jugarArena`), y la del monje no: cada ficha gira la suya.
  // Se espera a la respuesta de esa hoja, que es la señal de que se ha pintado.
  const pedidas = (): Promise<string[]> =>
    page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname),
    );
  const ficha = (id: string): string => `#edicion article[data-clave-de-ficha="unidad:${id}"]`;
  const d2 = (id: string): string => `/unidades/${id}/d2/atlas.webp`;
  const girar = async (id: string): Promise<void> => {
    if ((await pedidas()).includes(d2(id)))
      throw new Error(`edición: ${d2(id)} ya estaba pedida antes de girar: no prueba nada`);
    await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === d2(id), { timeout: 5000 }),
      page.locator(`${ficha(id)} [data-arena="girar"]`).click(),
    ]).catch((err: unknown) => {
      throw new Error(`edición: girar la ficha de ${id} no la ha girado: ${String(err)}`);
    });
  };
  await girar('templario-escudo');
  if ((await pedidas()).includes(d2('templario-monje')))
    throw new Error('edición: girar la ficha del templario ha girado también la del monje');
  await girar('templario-monje');
  log('edición: girar una ficha gira la suya y no la de al lado');

  // Un campo cambia SU ficha, el foco sigue en la misma ficha tras repintar, y
  // la vista no vuelve arriba: un cambio repinta solo su ficha. La lista va
  // desplegada encima, así que escribir en el campo ya desplaza la vista hasta
  // él: se mide desde ahí.
  const lista = page.locator('#edicion');
  const monjeAntes = await page
    .locator(`${ficha('templario-monje')} [data-campo="attack"]`)
    .inputValue();
  const ataque = page.locator(`${ficha('templario-escudo')} [data-campo="attack"]`);
  const ataqueAntes = await ataque.inputValue();
  const nuevo = String(Number(ataqueAntes) + 3);
  await ataque.fill(nuevo);
  const bajada = await lista.evaluate((e) => e.scrollTop);
  if (bajada === 0) throw new Error('edición: la vista no se desplaza: no se puede probar');
  await ataque.press('Tab');
  // Un cambio que entra deja la barra vacía; uno rechazado diría «No se cambia: …».
  await esperarBarra(page, '', 'edición: cambiar el ataque del templario', { exacta: true });
  await asentada(page);
  const foco = await page.evaluate(() => {
    const a = document.activeElement;
    return `${a?.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha')} ${a?.getAttribute('data-campo')}`;
  });
  if (foco !== 'unidad:templario-escudo defense')
    throw new Error(`edición: tras cambiar el ataque, el foco está en «${foco}»`);
  const trasElCambio = await lista.evaluate((e) => e.scrollTop);
  if (trasElCambio !== bajada)
    throw new Error(`edición: un cambio ha movido la vista de ${bajada} a ${trasElCambio}`);
  if (
    (await page.locator(`${ficha('templario-escudo')} [data-campo="attack"]`).inputValue()) !==
    nuevo
  )
    throw new Error('edición: el ataque del templario no se ha quedado en el nuevo');
  if (
    (await page.locator(`${ficha('templario-monje')} [data-campo="attack"]`).inputValue()) !==
    monjeAntes
  )
    throw new Error('edición: cambiar el templario ha cambiado el monje');
  // Lo ilegal no entra, y se dice.
  const vida = page.locator(`${ficha('templario-monje')} [data-campo="hp"]`);
  const vidaAntes = await vida.inputValue();
  await vida.fill('0');
  await vida.press('Tab');
  await esperarBarra(page, 'No se cambia:', 'edición: una vida de 0', { exacta: false });
  await asentada(page);
  if ((await vida.inputValue()) !== vidaAntes)
    throw new Error('edición: una vida de 0 se ha quedado en la ficha');
  log('edición: un campo cambia su ficha (y solo ella se repinta) y lo ilegal no entra');

  // De vuelta: el montaje como estaba, con el ataque nuevo.
  await page.locator('[data-arena="volver-de-edicion"]').click();
  await page.locator('#app[data-escena="montaje"]').waitFor({ timeout: 2000 });
  if ((await page.locator('#muralla .hex.muro').count()) !== murosAntes)
    throw new Error('edición: al volver, la muralla es otra');
  if (page.url() !== urlAntes) throw new Error(`edición: al volver, la URL es otra: ${page.url()}`);
  const bandosDespues = await bandosDichos(page);
  // El templario va el primero: su «A n ·» es el primero de los bandos. La tarjeta
  // dice el ataque con el que pelea, el de su cuerpo (el campo) más el de su espada.
  const conLaEspada = (a: string): number => ataqueEnLaPelea(Number(a));
  const bandosConElAtaque = bandosAntes.replace(
    `A ${conLaEspada(ataqueAntes)} ·`,
    `A ${conLaEspada(nuevo)} ·`,
  );
  if (bandosDespues !== bandosConElAtaque)
    throw new Error(
      `edición: al volver, los bandos son otros:\n${bandosAntes}\n=====\n${bandosDespues}`,
    );
  await page.locator('#bando-izquierda button.ver[data-unidad="templario-escudo"]').click();
  if ((await page.locator('#ficha [data-campo="attack"]').inputValue()) !== nuevo)
    throw new Error('edición: la ficha del montaje no enseña el ataque cambiado');
  log('edición: de vuelta, el montaje sigue como estaba y lleva el ataque nuevo');

  // Otra vez a la edición: las mismas, en su orden; y cerrar una deja las demás.
  await page.locator('[data-arena="ir-a-edicion"]').click();
  const orden = (): Promise<(string | null)[]> =>
    page
      .locator('#edicion .ficha-abierta')
      .evaluateAll((xs) => xs.map((x) => x.getAttribute('data-clave-de-ficha')));
  const abiertas = await orden();
  const esperadas = [
    'unidad:templario-escudo',
    'unidad:templario-monje',
    'unidad:caballero-de-la-muerte',
    'unidad:elfo-arquero',
    'unidad:esqueleto-guerrero',
    'unidad:zombi',
  ];
  if (abiertas.join() !== esperadas.join())
    throw new Error(`edición: al volver a entrar están abiertas ${abiertas.join(', ')}`);
  await page.locator(`${ficha('templario-monje')} [data-arena="cerrar-ficha"]`).click();
  const quedan = await orden();
  if (quedan.join() !== esperadas.filter((x) => x !== 'unidad:templario-monje').join())
    throw new Error(`edición: al cerrar el monje quedan ${quedan.join(', ')}`);
  if (
    (await page.locator('#edicion [data-arena="plegar-lista"][aria-expanded="false"]').count()) > 0
  )
    throw new Error('edición: cerrar una ficha ha plegado la lista');
  log('edición: al volver, las mismas abiertas; cerrar una deja las demás y la lista como estaba');

  // El nombre, por su «✎» en el título: Intro lo guarda —en la ficha y en el
  // montaje—, Escape deja el de antes. Entre las cifras ya no hay campo de nombre.
  const escudo = ficha('templario-escudo');
  if ((await page.locator(`${escudo} .cifras [data-campo="name"]`).count()) > 0)
    throw new Error('edición: el nombre sigue entre las cifras');
  const nombreAntes = await page.locator(`${escudo} .titulo-de-ficha .nombre`).innerText();
  await page.locator(`${escudo} [data-arena="renombrar"]`).click();
  const campoDelNombre = page.locator(`${escudo} input.renombrar`);
  const listo = await campoDelNombre.evaluate(
    (e: HTMLInputElement) =>
      document.activeElement === e && e.selectionStart === 0 && e.selectionEnd === e.value.length,
  );
  if (!listo) throw new Error('edición: «✎» no deja el nombre enfocado y seleccionado');
  /** El título vuelve a ser el nombre, y es `texto`. */
  const tituloEs = async (texto: string, tras: string): Promise<void> => {
    const titulo = page.locator(`${escudo} .titulo-de-ficha .nombre`);
    await page
      .waitForFunction(
        ([sel, t]) => document.querySelector(sel as string)?.textContent === t,
        [`${escudo} .titulo-de-ficha .nombre`, texto] as const,
        { timeout: 2000 },
      )
      .catch(async () => {
        const hay = (await titulo.count()) === 0 ? 'el campo, aún' : await titulo.innerText();
        throw new Error(`edición: tras ${tras}, el título dice «${hay}», no «${texto}»`);
      });
  };
  await campoDelNombre.fill('Escudo de prueba');
  await campoDelNombre.press('Enter');
  await tituloEs('Escudo de prueba', 'Intro');
  await page.locator(`${escudo} [data-arena="renombrar"]`).click();
  await page.locator(`${escudo} input.renombrar`).fill('No se queda');
  await page.locator(`${escudo} input.renombrar`).press('Escape');
  await tituloEs('Escudo de prueba', 'Escape');
  // Un rasgo por su desplegable y su etiqueta: se pone «vuela» y se quita «no-muerto»
  // del esqueleto del catálogo (su prueba).
  await page.locator(`${escudo} select[data-arena-rasgo]`).selectOption('flying');
  await page
    .locator(`${escudo} [data-arena="quitar-rasgo"][data-rasgo="flying"]`)
    .waitFor({ timeout: 2000 });
  if ((await page.locator(`${escudo} select[data-arena-rasgo] option[value="flying"]`).count()) > 0)
    throw new Error('edición: «vuela» sigue en el desplegable tras ponerlo');
  // Quitar con el teclado (M2 de QA): el foco sigue en la ficha, en el × de la
  // etiqueta siguiente y, sin ninguna detrás, en su «Añadir». Antes caía al `body`.
  const focoEn = (): Promise<string> =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (a === null || a === document.body) return 'body';
      const f = a.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha');
      const que =
        a.getAttribute('data-arena') ??
        (a.hasAttribute('data-arena-rasgo') ? 'añadir-rasgo' : null) ??
        (a.hasAttribute('data-arena-habilidad') ? 'añadir-habilidad' : a.tagName);
      return `${f} ${que} ${a.getAttribute('data-rasgo') ?? a.getAttribute('data-habilidad') ?? ''}`.trim();
    });
  const conElTeclado = async (sel: string, esperado: string, que: string): Promise<void> => {
    await page.locator(sel).focus();
    await page.keyboard.press('Enter');
    await asentada(page);
    const ahora = await focoEn();
    if (ahora !== esperado)
      throw new Error(
        `edición: tras quitar ${que} con Intro el foco está en «${ahora}», no en «${esperado}»`,
      );
  };
  await page.locator(`${escudo} select[data-arena-rasgo]`).selectOption('no_retaliation');
  await conElTeclado(
    `${escudo} [data-arena="quitar-rasgo"][data-rasgo="flying"]`,
    'unidad:templario-escudo quitar-rasgo no_retaliation',
    '«vuela» (con otro detrás)',
  );
  await conElTeclado(
    `${escudo} [data-arena="quitar-rasgo"][data-rasgo="no_retaliation"]`,
    'unidad:templario-escudo añadir-rasgo',
    'el último rasgo',
  );
  const habilidad = await page
    .locator(`${escudo} select[data-arena-habilidad] option`)
    .last()
    .getAttribute('value');
  if (habilidad === null || habilidad === '')
    throw new Error('edición: no hay habilidad que poner');
  await page.locator(`${escudo} select[data-arena-habilidad]`).selectOption(habilidad);
  await conElTeclado(
    `${escudo} [data-arena="quitar-habilidad"][data-habilidad="${habilidad}"]`,
    'unidad:templario-escudo añadir-habilidad',
    `la habilidad «${habilidad}», la última de su grupo`,
  );
  // Y otra vez «vuela», que el montaje enseña más abajo.
  await page.locator(`${escudo} select[data-arena-rasgo]`).selectOption('flying');
  await page
    .locator(`${escudo} [data-arena="quitar-rasgo"][data-rasgo="flying"]`)
    .waitFor({ timeout: 2000 });
  log(
    'edición: quitar un rasgo o una habilidad con Intro deja el foco en la siguiente o en «Añadir»',
  );
  // Con el ratón, el foco no se lleva a ningún sitio (como `pintar`).
  const esqueleto = '#edicion article[data-clave-de-ficha="unidad:esqueleto-guerrero"]';
  await page.locator(`${esqueleto} [data-arena="quitar-rasgo"][data-rasgo="undead"]`).click();
  await page
    .locator(`${esqueleto} [data-arena="quitar-rasgo"]`)
    .first()
    .waitFor({ state: 'detached', timeout: 2000 })
    .catch(() => {
      throw new Error('edición: el esqueleto sigue con su rasgo tras quitarlo');
    });
  if ((await focoEn()) !== 'body')
    throw new Error(`edición: quitar con el ratón ha llevado el foco a «${await focoEn()}»`);
  await page.locator('[data-arena="volver-de-edicion"]').click();
  // El bando lleva el nombre y «vuela» en el resumen (y la escalera dice que no la usa).
  const conNombre = await bandosDichos(page);
  const resumenConVuela = new RegExp(
    `Escudo de prueba\\n[\\s\\S]*?A ${conLaEspada(nuevo)} · [^\\n]* casillas · vuela · lleva [^\\n]*\\n`,
  );
  if (!conNombre.includes('Escudo de prueba') || !resumenConVuela.test(conNombre))
    throw new Error(`edición: el montaje no lleva el nombre y el rasgo:\n${conNombre}`);
  // Y se quita por su etiqueta, también en la ficha del montaje.
  await page.locator('#ficha [data-arena="quitar-rasgo"][data-rasgo="flying"]').click();
  if ((await bandosDichos(page)) !== bandosConElAtaque.replace(nombreAntes, 'Escudo de prueba'))
    throw new Error('edición: quitar «vuela» en el montaje no lo quita del bando');
  await page.locator('[data-arena="ir-a-edicion"]').click();
  log(
    'edición: «✎» + Intro cambia el nombre (Escape no) y un rasgo se pone y se quita por su etiqueta, hasta el montaje',
  );

  // Y al recargar la página, las mismas (`localStorage`, de comodidad).
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-unidad-catalogo]').first().waitFor({ timeout: 5000 });
  await page.locator('[data-arena="ir-a-edicion"]').click();
  const recargadas = await orden();
  if (recargadas.join() !== quedan.join())
    throw new Error(`edición: al recargar están abiertas ${recargadas.join(', ')}`);
  log('edición: al recargar, las mismas abiertas');

  // Cerrar con el teclado (H4): el foco pasa al × de la de al lado —la
  // siguiente, o la anterior si era la última— y, sin ninguna, al «Abrir» de la
  // que se cerró. Se llega al primer × con el tabulador, como quien no usa ratón.
  const enfocado = (): Promise<string> =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (a === null || a === document.body) return 'body';
      const ficha = a.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha');
      return `${a.getAttribute('data-arena')} ${ficha ?? a.getAttribute('data-unidad')}`;
    });
  await page.locator(`${ficha('templario-escudo')} [data-arena-habilidad]`).focus();
  await page.keyboard.press('Tab');
  if ((await enfocado()) !== 'cerrar-ficha unidad:caballero-de-la-muerte')
    throw new Error(
      `edición: el tabulador no llega al × de la ficha siguiente: ${await enfocado()}`,
    );
  const tras = [
    'cerrar-ficha unidad:elfo-arquero',
    'cerrar-ficha unidad:esqueleto-guerrero',
    'cerrar-ficha unidad:zombi',
    'cerrar-ficha unidad:templario-escudo',
    'abrir-ficha templario-escudo',
  ];
  for (const esperado of tras) {
    await page.keyboard.press('Enter');
    await asentada(page);
    const ahora = await enfocado();
    if (ahora !== esperado)
      throw new Error(
        `edición: tras cerrar con Intro el foco está en «${ahora}», no en «${esperado}»`,
      );
  }
  log('edición: cerrar con el teclado deja el foco en la de al lado y, sin ninguna, en su «Abrir»');
  await page.close();
}

// ------------------------------------------------------------------------ editor de equipo

/**
 * El editor de equipo de la arena, con clics de verdad: abrir la vista (cuatro
 * secciones por tipo, solo las de la arena), crear una pieza sobre la Espada y
 * ver que cambiar la Espada la cambia, ver la rueda de la Maza, crear una pieza,
 * guardarla y verla en la ficha de una unidad. Las reglas (lo que se rechaza, las
 * bases, el enlace, a media pelea) las prueban `test/arena-equipo.test.ts` y
 * `test/equipo-bases.test.ts`.
 */
async function equipoDeLaArena(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'equipo', problemas);
  await abrirLaArena(page, url, '?seed=7');
  await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
  await page.locator('[data-arena="ir-a-equipo"]').first().click();
  await page.locator('#app[data-escena="equipo"]').waitFor({ timeout: 2000 });
  // Por tipos (18-10-2026), y el catálogo entero: una sola clase de piezas.
  const secciones = await page
    .locator('[data-seccion-de-equipo]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-seccion-de-equipo')));
  if (
    JSON.stringify(secciones) !==
    JSON.stringify(['cuerpo', 'distancia', 'armadura', 'escudo', 'montura'])
  )
    throw new Error(`equipo: las secciones son ${JSON.stringify(secciones)}`);
  const enLaLista = await page.locator('#equipo [data-arena="elegir-pieza"]').count();
  if (enLaLista !== EQUIPO_DEL_JUEGO.piezas.size)
    throw new Error(
      `equipo: el editor enseña ${enLaLista} piezas y el catálogo tiene ${EQUIPO_DEL_JUEGO.piezas.size}`,
    );
  log('equipo: cinco secciones por tipo, con el catálogo entero');
  // La Espada: sin PV y con un precio, en oro.
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="espada"]').click();
  const fichaDeLaEspada = page.locator('#equipo [data-pieza-elegida="espada"]');
  await fichaDeLaEspada.waitFor({ timeout: 2000 });
  if (
    (await fichaDeLaEspada.locator('[data-arena-pieza-campo="pv"]').count()) > 0 ||
    (await fichaDeLaEspada.locator('[data-arena-pieza-campo^="precio-"]').count()) !== 1
  )
    throw new Error('equipo: la ficha de la Espada tiene PV o más de un precio');
  // La lleva también el héroe (H3 del QA 2): es de su equipo base, el de todo héroe
  // del juego y de la arena desde que son uno (19-10-2026).
  const llevanLaEspada = await fichaDeLaEspada.locator('[data-la-llevan]').innerText();
  if (!llevanLaEspada.includes(LA_LLEVA_EL_HEROE))
    throw new Error(`equipo: «La llevan» de la Espada no cuenta al héroe: «${llevanLaEspada}»`);
  // «Nueva sobre esta»: la nueva dice su cadena.
  await page.locator('#equipo [data-arena="crear-pieza-sobre"]').click();
  const sobre = page.locator('#equipo [data-pieza-elegida="espada-2"]');
  await sobre.waitFor({ timeout: 2000 });
  const cadena = (await sobre.locator('[data-cadena-de-bases]').innerText()).trim();
  if (cadena !== 'Espada → Espada 2') throw new Error(`equipo: la cadena dice «${cadena}»`);
  // Subir el daño de la Espada cambia la que está sobre ella.
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="espada"]').click();
  const danio = page.locator(
    '#equipo [data-pieza-elegida="espada"] [data-arena-pieza-campo="danio-max"]',
  );
  await danio.fill('45');
  await danio.press('Tab');
  await asentada(page);
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="espada-2"]').click();
  const final = (await sobre.locator('[data-final="danio-max"]').innerText()).trim();
  if (final !== '45')
    throw new Error(`equipo: la de encima de la Espada suma «${final}» de daño máximo, no 45`);
  await sobre.scrollIntoViewIfNeeded();
  await asentada(page);
  await captura(page, 'arena-12-equipo-sobre-la-espada');
  log('equipo: «Nueva sobre esta» de la Espada, y subir la Espada la cambia');
  // La rueda de la Maza, por niveles absolutos (vuelta 2): Fuerte en el 5 → ×1,83.
  await page.locator('#equipo [data-arena="elegir-pieza"][data-pieza="maza"]').click();
  /** La fila de un tipo en la rueda de la Maza. */
  const deLaMaza = (tipo: string) =>
    page.locator(`#equipo [data-pieza-elegida="maza"] .barra-de-la-rueda[data-tipo="${tipo}"]`);
  const fuerte = deLaMaza('fuerte').locator('[data-final="rueda-fuerte"]');
  await fuerte.waitFor({ timeout: 2000 });
  if ((await fuerte.innerText()).trim() !== 'Daño ×1,83')
    throw new Error(`equipo: la rueda de la Maza dice «${await fuerte.innerText()}»`);
  if ((await page.locator('#equipo [data-tipo="normal"].barra-de-la-rueda').count()) > 0)
    throw new Error('equipo: la rueda de la Maza tiene fila de Normal');
  await page.locator('#equipo [data-rueda-de-la-pieza]').scrollIntoViewIfNeeded();
  await asentada(page);
  await cifrasSinCortar(page, '#equipo .equipo-ficha', 'equipo, ficha de la Maza');
  await captura(page, 'arena-12-equipo-rueda-de-la-maza');
  log('equipo: la Maza enseña su rueda por niveles (Fuerte 5, ×1,83), sin Normal');
  // La Finta de la Maza, en el 1 (resta 3 a 7): «+» sube un nivel, la barra
  // crece a la derecha y resta menos; «−» la deja como estaba.
  const finta = deLaMaza('finta');
  const fintaDice = async () =>
    `${await finta.locator('.barra').getAttribute('data-nivel')} ${(await finta.locator('.final').innerText()).trim()}`;
  if ((await fintaDice()) !== '1 resta 3 a 7 casillas')
    throw new Error(`equipo: la Finta de la Maza empieza en «${await fintaDice()}»`);
  await finta.locator('[data-sentido="1"]').click();
  await asentada(page);
  if ((await fintaDice()) !== '2 resta 2 a 6 casillas')
    throw new Error(`equipo: tras «+», la Finta de la Maza dice «${await fintaDice()}»`);
  const sector = await page
    .locator('#equipo [data-pieza-elegida="maza"] .rueda-de-la-pieza [data-sector="finta"]')
    .getAttribute('data-nivel');
  if (sector !== '2') throw new Error(`equipo: el sector de la Finta sigue en el nivel ${sector}`);
  await captura(page, 'arena-12-equipo-finta-mas');
  await finta.locator('[data-sentido="-1"]').click();
  await asentada(page);
  if ((await fintaDice()) !== '1 resta 3 a 7 casillas')
    throw new Error(`equipo: tras «−», la Finta de la Maza dice «${await fintaDice()}»`);
  log('equipo: «+» en la Finta sube un nivel y resta menos (2 a 6), y «−» la devuelve');
  // Un arma a distancia nueva no lleva «Disparos»: llevarla ya es disparar (13-10-2026).
  await page.locator('[data-arena="crear-pieza"][data-hueco="distancia"]').click();
  await page
    .locator('#equipo [data-pieza-elegida] [data-arena-pieza-campo="nombre"]')
    .waitFor({ timeout: 2000 });
  const fichaDeLaPieza = await page.locator('#equipo [data-pieza-elegida]').innerText();
  if (
    /Disparos/.test(fichaDeLaPieza) ||
    (await page.locator('#equipo [data-arena-pieza-campo="disparos"]').count()) > 0
  ) {
    throw new Error('equipo: el arma a distancia nueva aún tiene el campo «Disparos»');
  }
  log('equipo: un arma a distancia nueva, sin campo «Disparos»');
  await page.locator('[data-arena="crear-pieza"][data-hueco="arma"]').click();
  const nombre = page.locator('#equipo [data-pieza-elegida] [data-arena-pieza-campo="nombre"]');
  await nombre.fill('Hoja de pruebas');
  await nombre.press('Tab');
  await asentada(page);
  await captura(page, 'arena-12-equipo');
  await page.locator('[data-arena="guardar"]').click();
  await esperarBarra(page, 'Guardado', 'equipo: guardar', { exacta: false });
  const enDisco = leerCatalogo(process.cwd()).piezas.map((p) => p.nombre);
  if (!enDisco.includes('Hoja de pruebas'))
    throw new Error(`equipo: guardar no deja la pieza en disco (${enDisco.join(', ')})`);
  log('equipo: pieza creada, nombrada y guardada');
  await page.locator('[data-arena="volver-de-equipo"]').click();
  await page.locator('#bando-izquierda [data-arena="editar"]').first().click();
  const opcion = page.locator('#ficha [data-arena-pieza="arma"] option', {
    hasText: 'Hoja de pruebas',
  });
  await page
    .locator('#ficha [data-arena-pieza="arma"]')
    .selectOption((await opcion.getAttribute('value')) ?? '');
  await page
    .locator('#bando-izquierda .puesto .cost')
    .first()
    .filter({ hasText: 'lleva Hoja de pruebas' })
    .waitFor({ timeout: 2000 });
  log('equipo: la ficha de la unidad la ofrece y la tarjeta la lleva');
  // Lo que el núcleo rechazaría no se ofrece (H3 del QA 2): la × del arma de
  // cuerpo a cuerpo.
  const ficha = page.locator('#ficha');
  if (
    (await ficha.locator('[data-arena="quitar-pieza"][data-hueco="arma"]').count()) > 0 ||
    (await ficha.locator('[data-no-se-quita="arma"]').count()) !== 1
  )
    throw new Error('equipo: la ficha de la unidad ofrece lo que el núcleo rechaza');
  // El héroe dice con qué arma pelea.
  await page.locator('[data-arena="poner-heroe"][data-lado="izquierda"]').click();
  const armaDelHeroe = (
    await ficha.locator('[data-armas-del-heroe] [data-arma-de-la-ficha="arma"]').innerText()
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (!armaDelHeroe.includes('Espada ·'))
    throw new Error(`equipo: la ficha del héroe dice «${armaDelHeroe}» de su arma`);
  await ficha.locator('[data-armas-del-heroe]').scrollIntoViewIfNeeded();
  await asentada(page);
  await captura(page, 'arena-12-equipo-ficha-del-heroe');
  log(`equipo: la ficha no ofrece lo que se rechaza y el héroe dice su arma (${armaDelHeroe})`);
  await page.close();
}

// ------------------------------------------------------------- cada arma para lo suyo

/**
 * La pelea de las armas en el espejo (13-10-2026): el arquero élfico de la persona
 * —daga, arco y jubón— contra el orco con dos armas de la IA, que viene a por él.
 */
/**
 * El orco de la pasada con una lanza de jinete en «Arma de carga»: tiene armas por
 * uso, y la barra del golpe del arquero tiene que nombrar el arma con que le
 * devuelve el golpe: el mandoble (H3 del QA, 13-10-2026). Desde que en la arena
 * carga todo el que pega cuerpo a cuerpo (#260), la lanza se usa al cargar a pie, y
 * su ficha lo dice; la página se la pone igual, así que pelean lo mismo.
 */
function orcoConLanza(): Unidad {
  const orco = delCatalogo('orko-dos-armas');
  // Desde el 25-10-2026 la lanza es un arma más: va de segunda, con la espada.
  return { ...orco, equipo: { ...orco.equipo, segunda: 'lanza' } };
}

/** Lo que dice la barra del golpe del arquero sobre el contraataque del orco (`orcoConLanza`). */
const CONTRAATAQUE_DEL_ORCO =
  /Contraataque con Espada y Lanza \(cuerpo a cuerpo\)(, si sobrevive)?: /;

function espejoDeLasArmas(semilla: number): SesionDeArena {
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: { unidades: [delBorrador(delCatalogo('elfo-arquero'))], heroe: null, ia: false },
      derecha: { unidades: [delBorrador(orcoConLanza())], heroe: null, ia: true },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  espejo.empezar();
  return espejo;
}

/**
 * Lo que hace el arquero en su turno: esperar («Terminar turno») hasta que el orco
 * esté pegado y golpearle sin moverse. La juegan la pasada y la búsqueda de su
 * semilla. (El disparo con el arco se dejó de mirar con el disparo diferido, que
 * va sin comprobaciones hasta que el usuario lo valide: 25-10-2026.)
 */
function jugadaDeLasArmas(
  espejo: SesionDeArena,
): { readonly tipo: 'golpe'; readonly contra: BattleStack } | { readonly tipo: 'terminar' } {
  const turno = espejo.turnoPropio;
  if (turno === null)
    throw new Error('armas: el espejo devuelve el control sin que le toque a la persona');
  const acciones = espejo.battleLegalActions();
  const contra = espejo.battle.stacks.find((x) => isAlive(x) && x.side !== turno.side);
  if (contra === undefined) return { tipo: 'terminar' };
  const pegado = acciones.some(
    (a) => a.type === 'attack' && a.target === contra.id && a.from === undefined,
  );
  return pegado ? { tipo: 'golpe', contra } : { tipo: 'terminar' };
}

/** La semilla en que el arquero golpea pegado antes de que acabe la pelea. */
function buscarArmas(): number {
  for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS; semilla++) {
    const espejo = espejoDeLasArmas(semilla);
    for (let jugadas = 0; jugadas < 200 && espejo.battle.finished === null; jugadas++) {
      contestarEnElEspejo(espejo);
      if (espejo.battle.finished !== null) break;
      const j = jugadaDeLasArmas(espejo);
      if (j.tipo === 'golpe') return semilla;
      espejo.playBattleAction({ type: 'end_turn' });
    }
  }
  throw new Error(`armas: en las semillas 1–${TOPE_DE_SEMILLAS} el arquero nunca golpea pegado`);
}

/**
 * Cada arma para lo suyo, con clics de verdad: el editor de equipo enseña los
 * huecos nuevos con el arco y la lanza en el suyo; la ficha del jinete élfico, sus
 * tres armas; y en la pelea, con el orco pegado, el arquero pega con la daga —la
 * barra dice con cuál antes del clic, y lo que pasa es lo del espejo—.
 */
async function armasEnLaArena(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  await conLosCatalogosDevueltos('armas', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    vigilarConsola(page, 'armas', problemas);
    const semilla = buscarArmas();
    log(`armas: semilla ${semilla}, buscada en el espejo`);
    await abrirLaArena(page, url, `?seed=${semilla}`);

    // La ficha del jinete élfico: espada y lanza (lo mejor de las dos) y arco, cada
    // golpe con lo suyo y su agilidad entera sobre el caballo de guerra; la carga,
    // con la fuerza del caballo más la de la lanza (26-10-2026).
    await page.locator('[data-unidad-catalogo="elfo-jinete"] [data-lado="izquierda"]').click();
    await page.locator('#bando-izquierda button.ver[data-unidad="elfo-jinete"]').click();
    const filas = page.locator('#ficha .armas-de-la-ficha [data-arma-de-la-ficha]');
    await filas.first().waitFor({ timeout: 2000 });
    const dichas = (await filas.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    const esperadas = [
      'Cuerpo a cuerpo ⓘ Espada y Lanza · Ataque 7 · Daño 28–140',
      'A distancia ⓘ Arco · Ataque 6 · Daño 26–130',
      'Carga ⓘ Espada y Lanza · Ataque 7 · Daño 62–310 · +5 %/casilla (3 a 5), montada',
    ];
    if (JSON.stringify(dichas) !== JSON.stringify(esperadas)) {
      throw new Error(`armas: la ficha del jinete élfico dice ${JSON.stringify(dichas)}`);
    }
    await page.locator('#ficha .armas-de-la-ficha').scrollIntoViewIfNeeded();
    await asentada(page);
    await cifrasSinCortar(page, '#ficha', 'armas, ficha del jinete');
    await captura(page, 'arena-14-armas-del-jinete');
    log('armas: la ficha del jinete élfico enseña sus tres armas');

    // El editor de equipo, por tipos (18-10-2026): el cuerpo a cuerpo con la daga
    // y la lanza (un arma más desde el 25-10-2026), y a distancia con el arco.
    await page.locator('[data-arena="ir-a-equipo"]').first().click();
    await page.locator('#app[data-escena="equipo"]').waitFor({ timeout: 2000 });
    const cabeceras = await page.locator('.cabecera-hueco > span').allInnerTexts();
    const tipos = cabeceras.map((t) => t.replace('ⓘ', '').trim().toLowerCase());
    for (const t of ['cuerpo a cuerpo', 'a distancia']) {
      if (!tipos.includes(t))
        throw new Error(`armas: el editor no enseña «${t}»: ${tipos.join(', ')}`);
    }
    for (const [seccion, pieza] of [
      ['distancia', 'Arco'],
      ['cuerpo', 'Lanza'],
      ['cuerpo', 'Daga'],
    ] as const) {
      const ofrecidas = await page
        .locator(`#equipo [data-seccion-de-equipo="${seccion}"]`)
        .innerText();
      if (!ofrecidas.includes(pieza))
        throw new Error(`armas: el editor no lista ${pieza} en «${seccion}»`);
    }
    await asentada(page);
    await captura(page, 'arena-15-equipo-con-armas');
    log('equipo: el editor enseña el cuerpo a cuerpo (daga y lanza) y a distancia (arco)');
    await page.locator('[data-arena="volver-de-equipo"]').click();

    // La pelea: fuera el jinete, y el arquero contra el orco.
    await page.locator('#bando-izquierda [data-arena="quitar"]').first().click();
    await page.locator('[data-unidad-catalogo="elfo-arquero"] [data-lado="izquierda"]').click();
    await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
    // La lanza al orco, como en el espejo (`orcoConLanza`), desde su ficha.
    await page.locator('#bando-derecha button.ver[data-unidad="orko-dos-armas"]').click();
    await page.locator('#ficha select[data-arena-pieza="segunda"]').selectOption('lanza');
    // La fila ya existe antes de elegir (la carga, con el arma de cuerpo a cuerpo):
    // se espera a que la repinte con la lanza. Leída al momento, con la máquina
    // cargada, decía aún «Mandoble» (19-10-2026).
    const filaDeLaLanza = page.locator('#ficha [data-arma-de-la-ficha="carga"]', {
      hasText: 'Espada y Lanza',
    });
    await filaDeLaLanza.waitFor({ timeout: 5000 });
    const dichaLanza = (await filaDeLaLanza.innerText()).replace(/\s+/g, ' ').trim();
    // A pie también carga (#260): la lanza se usa, con lo que cobra a pie.
    if (
      !dichaLanza.startsWith('Carga ⓘ Espada y Lanza · Ataque ') ||
      !dichaLanza.endsWith(' · +5 %/casilla (3 a 5), a pie')
    ) {
      throw new Error(`armas: la ficha del orco con lanza dice «${dichaLanza}»`);
    }
    const espejo = espejoDeLasArmas(semilla);
    await page.locator('[data-arena="luchar"]').click();
    await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });
    await esperarCola(espejo.battle, espejo.battle.log);
    await mismaPelea(page, espejo, 'armas: empezar la pelea');
    let golpeado = false;
    for (let jugadas = 0; !golpeado; jugadas++) {
      if (jugadas > 200 || espejo.battle.finished !== null) {
        throw new Error('armas: la pelea acaba sin que el arquero golpee pegado');
      }
      const antes = espejo.battle.log.length;
      // El orco la golpeó al cerrar su turno: primero, su respuesta en la rueda.
      await responderLaRueda(page, espejo);
      if (espejo.battle.finished !== null) {
        throw new Error('armas: la pelea acaba sin que el arquero golpee pegado');
      }
      const j = jugadaDeLasArmas(espejo);
      if (j.tipo === 'terminar') {
        await page.getByRole('button', { name: 'Terminar turno' }).click();
        espejo.playBattleAction({ type: 'end_turn' });
      } else {
        // Antes del clic, la barra dice con qué arma: la previsión del núcleo.
        const px = await pixelDeUnidad(page, espejo, j.contra);
        if (px.accion?.type !== 'attack') {
          throw new Error(
            `armas: el clic sobre el orco haría ${px.accion?.type ?? 'nada'}, no attack`,
          );
        }
        const conQue = 'Cuenta: con Daga (cuerpo a cuerpo)';
        await page.mouse.move(px.x - 6, px.y);
        await page.mouse.move(px.x, px.y);
        await esperarBarra(page, conQue, `armas: apuntar ${j.tipo}`, { exacta: false });
        // Y con qué le devuelven el golpe: el arma de cuerpo a cuerpo del orco.
        const barra = await page.locator('#status').innerText();
        if (!CONTRAATAQUE_DEL_ORCO.test(barra)) {
          throw new Error(`armas: la barra no nombra el arma del contraataque: «${barra}»`);
        }
        log('armas: la barra nombra el arma del contraataque (Mandoble)');
        await captura(page, 'arena-17-pega-con-la-daga');
        await page.mouse.click(px.x, px.y);
        espejo.playBattleAction(px.accion);
        // El golpe con la daga pasa por la rueda (el juego la lleva siempre).
        await responderLaRueda(page, espejo);
        // Lo que hace, con las cifras del arma: el daño cae en su horquilla.
        const hecho = espejo.battle.log
          .slice(antes)
          .find((e) => e.kind === 'attack' && e.stack !== j.contra.id);
        const arquero = espejo.battle.stacks.find((x) => x.side !== j.contra.side) as BattleStack;
        const fila = armasDe(arquero.unit).find((a) => a.uso === 'arma');
        if (hecho === undefined || fila === undefined)
          throw new Error(`armas: el ${j.tipo} no se ve en el parte`);
        if (fila.arma !== 'Daga')
          throw new Error(`armas: el ${j.tipo} va con ${fila.arma}, no con Daga`);
        log(
          `armas: ${j.tipo} con ${fila.arma} (${fila.attack}, ${fila.damage.join('–')}): ${'damage' in hecho ? hecho.damage : '?'} de daño`,
        );
        golpeado = true;
      }
      await responderLaRueda(page, espejo);
      await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
      if (espejo.battle.finished === null)
        await mismaPelea(page, espejo, `armas: la jugada ${jugadas}`);
    }
    await page.close();
  });
}

// ------------------------------------------------------------- la rueda del golpe

/**
 * Lo que elige la persona en la rueda de la pasada: Fuerte al golpear (con el
 * ratón) y Defensivo al responder (con su tecla, `teclaDe`: la 4 desde el anillo
 * de #263).
 */
const ELECCION_DE_LA_RUEDA = { golpe: 'fuerte', respuesta: 'defensivo' } as const;

/**
 * La pelea de la rueda en el espejo: el guerrero con escudo de la persona contra
 * el orco de la IA, con la rueda. Ya empezada, como la página.
 */
function espejoDeLaRueda(semilla: number): SesionDeArena {
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: {
        unidades: [delBorrador(delCatalogo('templario-escudo'))],
        heroe: null,
        ia: false,
      },
      // El orco de la lista, como el que pulsa la página: sin la lanza de
      // `orcoConLanza`, que desde que todos cargan en la arena (#260) se usa al
      // cargar y separaba el espejo de la página.
      derecha: {
        unidades: [delBorrador(delCatalogo('orko-dos-armas'))],
        heroe: null,
        ia: true,
      },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  espejo.empezar();
  return espejo;
}

/**
 * Lo que hace la persona en la pelea de la rueda: si la rueda espera, elige lo de
 * su fase (`ELECCION_DE_LA_RUEDA`); si no, la pauta de la arena (golpear en cuanto
 * puede, un tramo hacia el enemigo la primera vez, y si no «Terminar turno»).
 */
type JugadaDeLaRueda =
  | { readonly tipo: 'elegir'; readonly fase: 'golpe' | 'respuesta'; readonly golpe: TipoDeGolpe }
  | JugadaDeLaPauta;

function jugadaDeLaRueda(espejo: SesionDeArena, tramos: number): JugadaDeLaRueda {
  const p = espejo.ruedaPendiente;
  if (p !== null) return { tipo: 'elegir', fase: p.fase, golpe: ELECCION_DE_LA_RUEDA[p.fase] };
  return jugadaDeLaPauta(espejo, tramos, 0);
}

/**
 * La jugada `j` en el espejo, la misma en la búsqueda de la semilla y en la
 * pasada. `golpe`, la acción con que golpea la página (la del píxel que pulsa,
 * `pixelDeUnidad`); sin ella, la primera de la lista legal contra ese enemigo.
 */
function enElEspejo(espejo: SesionDeArena, j: JugadaDeLaRueda, golpe?: BattleAction): void {
  switch (j.tipo) {
    case 'elegir':
      espejo.elegirEnLaRueda(j.golpe);
      return;
    case 'golpe': {
      const accion =
        golpe ??
        espejo.battleLegalActions().find((a) => a.type === 'attack' && a.target === j.contra.id);
      if (accion === undefined) throw new Error('rueda: la pauta golpea a quien no alcanza');
      espejo.playBattleAction(accion);
      return;
    }
    case 'tramo':
      espejo.playBattleAction(j.mover);
      return;
    case 'terminar':
      espejo.playBattleAction({ type: 'end_turn' });
      return;
  }
}

/**
 * La semilla de la pelea de la rueda: la primera en la que, jugando la pauta, la
 * rueda pide a la persona el golpe Y la respuesta antes de que acabe la pelea. El
 * golpe del espejo es el primero de la lista legal contra ese enemigo; en la
 * página sale del píxel que se pulsa (`pixelDeUnidad`), así que la pasada lo vuelve
 * a mirar y lo dice si no llega.
 */
function buscarRueda(): number {
  for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS; semilla++) {
    const espejo = espejoDeLaRueda(semilla);
    const vistas = new Set<string>();
    let tramos = 0;
    for (let n = 0; n < 300 && espejo.battle.finished === null; n++) {
      const j = jugadaDeLaRueda(espejo, tramos);
      if (j.tipo === 'elegir') {
        vistas.add(j.fase);
        if (vistas.size === 2) return semilla;
      }
      enElEspejo(espejo, j);
      if (j.tipo === 'tramo') tramos++;
    }
  }
  throw new Error(
    `rueda: en las semillas 1–${TOPE_DE_SEMILLAS} la rueda no pide a la persona el golpe y la respuesta`,
  );
}

/**
 * La rueda del golpe con clics de verdad (docs/agents/2026-10-13-rueda-del-golpe/),
 * a escritorio y a móvil (sin interruptor desde el 19-10-2026: siempre hay rueda); un
 * clic en el enemigo abre la rueda en su fase de golpe, Escape la cierra sin dar
 * el golpe, y elegir Fuerte da el desenlace —giro, marcadores, arco, medidor y
 * rótulo— con el punto que dice el espejo; cuando el orco golpea, la rueda se abre
 * para responder, sin nada del golpe a la vista, y se elige con su tecla. Cada
 * fase, con su captura.
 */
async function ruedaEnLaArena(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  await conLosCatalogosDevueltos('rueda-del-golpe', async () => {
    const semilla = buscarRueda();
    log(`rueda: semilla ${semilla}, buscada en el espejo`);
    await jugarLaRueda(browser, url, problemas, semilla, { width: 1440, height: 900 }, '');
    await jugarLaRueda(browser, url, problemas, semilla, { width: 390, height: 844 }, '-movil');
    await yoContraYoEnLaRueda(browser, url, problemas);
    await todoEnIAConLaRueda(browser, url, problemas);
  });
}

async function jugarLaRueda(
  browser: Browser,
  url: string,
  problemas: Problemas,
  semilla: number,
  viewport: { readonly width: number; readonly height: number },
  sufijo: string,
): Promise<void> {
  const page = await browser.newPage({ viewport });
  vigilarConsola(page, `rueda${sufijo}`, problemas);
  await abrirLaArena(page, url, `?seed=${semilla}`);
  await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
  await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
  if (sufijo === '') await captura(page, 'rueda-01-montaje');
  await page.locator('[data-arena="luchar"]').click();
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });
  const espejo = espejoDeLaRueda(semilla);
  await esperarCola(espejo.battle, espejo.battle.log);
  await mismaPelea(page, espejo, 'empezar la pelea de la rueda');

  const vistas = new Set<string>();
  let cancelado = false;
  let tramos = 0;
  // Dónde estaba cada uno al empezar la jugada anterior: la casilla de la que
  // salió quien está plantado cuando se abre la rueda.
  let salidas = casillasDe(espejo.battle);
  // Si esta jugada pulsó el tablero durante el desenlace (`clicEnElDesenlace`).
  let avisoEnElDesenlace = false;
  for (let n = 0; vistas.size < 2; n++) {
    if (espejo.battle.finished !== null || n > 300) {
      throw new Error(
        `rueda${sufijo}: la pelea acaba sin que la rueda pida las dos fases (vistas: ${[...vistas].join(', ') || 'ninguna'})`,
      );
    }
    const antes = espejo.battle.log.length;
    const j = jugadaDeLaRueda(espejo, tramos);
    if (j.tipo === 'elegir') {
      const rueda = page.locator(`#rueda[open] .rueda[data-fase="${j.fase}"]`);
      await rueda.waitFor({ timeout: 10_000 }).catch(async () => {
        throw new Error(
          `rueda${sufijo}: la rueda debía abrirse en la fase ${j.fase}; la barra dice «${await page.locator('#status').innerText()}»`,
        );
      });
      // Primero se anda, luego la rueda: en cuanto se abre, quien pega ya está
      // quieto en su casilla.
      log(
        `rueda${sufijo}: ${j.fase}, ${await plantadoAlAbrir(page, espejo, salidas, `rueda${sufijo}`)}`,
      );
      await sleep(300);
      if (j.fase === 'golpe' && !cancelado) {
        // Escape antes de elegir: el golpe no se da, y quien pega se queda donde
        // llegó con su turno; se vuelve a pulsar desde ahí.
        const plantado = espejo.battle.golpeEnCurso;
        if (plantado === null)
          throw new Error(`rueda${sufijo}: la rueda se abre sin nadie plantado`);
        await page.keyboard.press('Escape');
        await page
          .locator('#rueda[open]')
          .waitFor({ state: 'detached', timeout: 2000 })
          .catch(() => {
            throw new Error(`rueda${sufijo}: Escape no cierra la rueda en la fase del golpe`);
          });
        espejo.cancelarGolpe();
        cancelado = true;
        // «Golpe cancelado.», o con la carga que se pierde si venía cargando (R6).
        await esperarBarra(page, espejo.status, `rueda${sufijo}, Escape`, { exacta: true });
        log(
          `rueda${sufijo}: ${await sigueTrasSoltar(page, espejo, plantado.stack, `rueda${sufijo}`)}`,
        );
        salidas = casillasDe(espejo.battle);
        continue;
      }
      if (j.fase === 'respuesta') {
        // A ciegas: ni un sector marcado como elegido mientras se responde.
        const marcados = await page.locator('#rueda [data-elegido="golpe"]').count();
        if (marcados > 0) throw new Error(`rueda${sufijo}: la respuesta deja ver el golpe`);
      }
      await captura(page, `rueda-0${j.fase === 'golpe' ? 2 : 4}-${j.fase}${sufijo}`);
      if (j.fase === 'golpe') {
        const en = await centroDelSector(page, j.golpe);
        await page.mouse.click(en.x, en.y);
      } else await page.keyboard.press(teclaDe(j.golpe));
      enElEspejo(espejo, j);
      const cruce = espejo.battle.log.slice(antes).find((e) => e.kind === 'cruce');
      if (cruce?.kind !== 'cruce')
        throw new Error(`rueda${sufijo}: elegir no dio el golpe en el espejo`);
      if (j.fase === 'respuesta' && sufijo === '') {
        await clicEnElDesenlace(page, `rueda${sufijo}`);
        avisoEnElDesenlace = true;
      }
      await page.locator('#rueda[data-tramo~="rotulo"]').waitFor({ timeout: 8000 });
      await sleep(450);
      const rotulo = (await page.locator('#rueda .rotulo').innerText()).toLowerCase();
      if (!rotulo.includes(NOMBRE_DEL_PUNTO[cruce.punto])) {
        throw new Error(
          `rueda${sufijo}: el rótulo dice «${rotulo}» y el cruce cayó en el ${NOMBRE_DEL_PUNTO[cruce.punto]}`,
        );
      }
      await captura(page, `rueda-0${j.fase === 'golpe' ? 3 : 5}-desenlace-${j.fase}${sufijo}`);
      vistas.add(j.fase);
      log(
        `rueda${sufijo}: ${j.fase}, ${cruce.golpe} contra ${cruce.respuesta}: ${NOMBRE_DEL_PUNTO[cruce.punto]}`,
      );
    } else if (j.tipo === 'golpe') {
      // El clic en el enemigo no golpea: abre la rueda. La acción la lee la escena
      // del espejo en el mismo píxel.
      const px = await pixelDeUnidad(page, espejo, j.contra);
      if (px.accion === undefined)
        throw new Error(`rueda${sufijo}: el clic sobre ${j.contra.id} no da acción`);
      // Ahora se anda antes de la rueda, y la casilla en que se planta se ve: la
      // página tiene que golpear desde la misma que el espejo. Lo dice la barra al
      // pasar por encima.
      if (px.accion.type === 'attack' && px.accion.from !== undefined) {
        await page.mouse.move(px.x, px.y);
        const { col, row } = px.accion.from;
        await esperarBarra(
          page,
          `Golpearías desde (${col},${row})`,
          `rueda${sufijo}, sobre ${j.contra.id}`,
          {
            exacta: false,
          },
        );
      }
      await page.mouse.click(px.x, px.y);
      enElEspejo(espejo, j, px.accion);
      continue;
    } else {
      await ejecutarPauta(page, espejo, j);
      if (j.tipo === 'tramo') tramos++;
    }
    await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
    if (avisoEnElDesenlace) {
      avisoEnElDesenlace = false;
      await sleep(100);
      if ((await page.locator('#status').innerText()) === AVISO_DE_ESPERA)
        throw new Error(
          `rueda${sufijo}: el desenlace ha terminado y la barra sigue diciendo que se espere`,
        );
    }
    if (espejo.battle.finished === null)
      await mismaPelea(page, espejo, `la jugada ${n} de la rueda`);
    salidas = casillasDe(espejo.battle);
  }
  // El parte cuenta el último cruce como el espejo.
  const ultimo = espejo.battle.log.filter((e) => e.kind === 'cruce').at(-1);
  if (ultimo?.kind === 'cruce') {
    await page
      .locator('#side .log .cruce', { hasText: NOMBRE_DEL_PUNTO[ultimo.punto] })
      .last()
      .waitFor({ timeout: 4000 });
  }
  await page.close();
}

/**
 * Un clic en el tablero mientras la rueda cuenta su desenlace: el diálogo es modal
 * y el clic cae en él, y la barra tiene que decir que se espere, como en una
 * marcha. Antes se perdía sin decir nada (H4 de QA, 19-10-2026: el disparo pulsado
 * justo tras elegir la respuesta). Quien llama mira luego que el aviso se retira.
 */
async function clicEnElDesenlace(page: Page, quien: string): Promise<void> {
  await page.locator('#rueda[open] .rueda[data-fase="desenlace"]').waitFor({ timeout: 8000 });
  const marco = await page.locator('#lienzo').boundingBox();
  if (marco === null) throw new Error(`${quien}: el marco del lienzo no está en la página`);
  await page.mouse.click(marco.x + 14, marco.y + 14);
  await page
    .waitForFunction(
      (aviso) => document.getElementById('status')?.textContent === aviso,
      AVISO_DE_ESPERA,
      { timeout: 1000 },
    )
    .catch(async () => {
      throw new Error(
        `${quien}: un clic durante el desenlace debía decir «${AVISO_DE_ESPERA}» y la barra dice «${await page.locator('#status').innerText()}»`,
      );
    });
  log(`${quien}: un clic durante el desenlace dice «${AVISO_DE_ESPERA}»`);
}

/** La casilla de cada unidad, copiada: dónde estaba antes de la jugada que sigue. */
function casillasDe(b: BattleState): ReadonlyMap<string, BattleStack['hex']> {
  return new Map(b.stacks.map((x) => [x.id, { ...x.hex }]));
}

/** Lo que mide la barra de vida de `s` quieta en su casilla, según el estado: la entera por su fracción. */
async function barraQueDebe(page: Page, s: BattleStack): Promise<number> {
  const b = await caja(page);
  const t = tableroPara(b.width, b.height);
  const { anchoBarra } = cabezaDe(
    { tablero: t },
    {
      en: centroDeStack(stackHexes(s)),
      elevacion: 0,
    },
  );
  return (anchoBarra * stackHp(s)) / (s.unit.hp * s.initialCount);
}

/**
 * Con la rueda recién abierta, quien pega está plantado (`golpeEnCurso` del
 * espejo) y ya quieto en su casilla: su barra de vida mide ahí lo que debe, y en
 * la casilla de la que salió (`salidas`), si anduvo, no hay barra. Primero se
 * anda, luego la rueda (decisión del usuario, 13-10-2026). Devuelve qué se vio.
 */
async function plantadoAlAbrir(
  page: Page,
  espejo: SesionDeArena,
  salidas: ReadonlyMap<string, BattleStack['hex']>,
  quien: string,
): Promise<string> {
  const g = espejo.battle.golpeEnCurso;
  if (g === null) throw new Error(`${quien}: la rueda se abre sin nadie plantado en el espejo`);
  const s = stackById(espejo.battle, g.stack);
  const donde = `(${s.hex.col},${s.hex.row})`;
  const ahi = await vidaPintada(page, s);
  const debe = await barraQueDebe(page, s);
  if (Math.abs(ahi - debe) > 1.5) {
    throw new Error(
      `${quien}: al abrirse la rueda, ${s.id} no está quieto en ${donde}: su barra mide ahí ${ahi.toFixed(1)} px y debe ${debe.toFixed(1)}`,
    );
  }
  const salida = salidas.get(s.id);
  if (salida === undefined || hexEquals(salida, s.hex))
    return `${s.id} golpea desde ${donde}, sin andar`;
  const alli = await vidaPintada(page, { ...s, hex: salida });
  if (alli > 1.5) {
    throw new Error(
      `${quien}: al abrirse la rueda, ${s.id} se ve aún en su salida (${salida.col},${salida.row}): ${alli.toFixed(1)} px de barra`,
    );
  }
  return `${s.id} anduvo de (${salida.col},${salida.row}) a ${donde} y la rueda se abrió con él ya allí${g.carga > 0 ? `, cargando ${g.carga}` : ''}`;
}

/**
 * Tras Escape con la unidad ya plantada: sigue donde llegó y con su turno —la
 * barra de arriba dice «Te toca» y la página y el espejo, la misma activa—, y no
 * vuelve atrás (su barra, ahí, un rato después). Devuelve qué se vio.
 */
async function sigueTrasSoltar(
  page: Page,
  espejo: SesionDeArena,
  id: string,
  quien: string,
): Promise<string> {
  const s = stackById(espejo.battle, id);
  const turno = await page.locator('#turn').innerText();
  if (turno !== 'Te toca') {
    throw new Error(`${quien}: tras Escape, la barra dice «${turno}» y ${id} aún tiene su turno`);
  }
  if (espejo.turnoPropio?.stack.id !== id) {
    throw new Error(`${quien}: tras Escape, el turno de ${id} se ha cerrado en el espejo`);
  }
  await sleep(600);
  const ahi = await vidaPintada(page, s);
  const debe = await barraQueDebe(page, s);
  if (Math.abs(ahi - debe) > 1.5) {
    throw new Error(
      `${quien}: tras Escape, ${id} no sigue quieto en (${s.hex.col},${s.hex.row}): su barra mide ahí ${ahi.toFixed(1)} px y debe ${debe.toFixed(1)}`,
    );
  }
  return `Escape deja a ${id} en (${s.hex.col},${s.hex.row}), con su turno`;
}

/** Los colores de la barra de vida (`pintarVida`, `render/batalla.ts`): sana, a medias, roja. */
const COLORES_DE_LA_VIDA: readonly (readonly [number, number, number])[] = [
  [0x9f, 0xc4, 0x9a],
  [0xe0, 0xc0, 0x60],
  [0xe3, 0x73, 0x5a],
];

/**
 * Lo que mide la barra de vida de `s` pintada en el lienzo, en píxeles del
 * lienzo: los de su fila del medio con uno de los colores de la vida. La barra
 * va donde la pone `cabezaDe`, con la figura quieta en su casilla.
 */
async function vidaPintada(page: Page, s: BattleStack): Promise<number> {
  const b = await caja(page);
  const t = tableroPara(b.width, b.height);
  const cabeza = cabezaDe({ tablero: t }, { en: centroDeStack(stackHexes(s)), elevacion: 0 });
  return await page.evaluate(
    ({ x, y, ancho, colores }) => {
      const lienzo = document.getElementById('canvas') as HTMLCanvasElement;
      const k = lienzo.width / lienzo.getBoundingClientRect().width;
      const ctx = lienzo.getContext('2d');
      if (ctx === null) throw new Error('el lienzo de la batalla no tiene contexto 2d');
      const fila = ctx.getImageData(
        Math.round((x - ancho / 2 - 3) * k),
        Math.round((y + 2) * k),
        Math.round((ancho + 6) * k),
        1,
      ).data;
      let n = 0;
      for (let i = 0; i < fila.length; i += 4) {
        const [r, g, b] = [fila[i] ?? 0, fila[i + 1] ?? 0, fila[i + 2] ?? 0];
        if (
          colores.some(
            ([R, G, B]) => Math.abs(r - R) < 14 && Math.abs(g - G) < 14 && Math.abs(b - B) < 14,
          )
        )
          n++;
      }
      return n / k;
    },
    { x: cabeza.x, y: cabeza.y, ancho: cabeza.anchoBarra, colores: COLORES_DE_LA_VIDA },
  );
}

/** Una muestra de la barra de vida en un fotograma: cuándo, si la rueda contaba un cruce y lo que medía. */
interface MuestraDeLaBarra {
  readonly t: number;
  readonly abierta: boolean;
  readonly ancho: number;
}

/**
 * La barra de `s` (quieta en su casilla) medida en cada fotograma de la página,
 * como `vidaPintada`, desde ya hasta `masAlla` ms después de que la rueda deje de
 * contar su cruce (o `tope` ms en total). `t` es el reloj del fotograma, el mismo
 * que lleva el animador. Dentro de la página, sin funciones con nombre: tsx les
 * pone `__name`, que allí no existe.
 */
async function muestrasDeLaBarra(
  page: Page,
  s: BattleStack,
  masAlla: number,
  tope = 15_000,
): Promise<MuestraDeLaBarra[]> {
  const b = await caja(page);
  const t = tableroPara(b.width, b.height);
  const cabeza = cabezaDe({ tablero: t }, { en: centroDeStack(stackHexes(s)), elevacion: 0 });
  return await page.evaluate(
    async ({ x, y, ancho, colores, masAlla, tope }) => {
      const lienzo = document.getElementById('canvas') as HTMLCanvasElement;
      // Por selector y no por id: el literal del modo es una puerta (`invariantes.test.ts`).
      const rueda = document.querySelector('dialog#rueda') as HTMLDialogElement;
      const ctx = lienzo.getContext('2d');
      if (ctx === null) throw new Error('el lienzo de la batalla no tiene contexto 2d');
      const muestras: { t: number; abierta: boolean; ancho: number }[] = [];
      const desde = performance.now();
      let vista = false;
      let cerrada: number | null = null;
      for (;;) {
        const t = await new Promise<number>((r) => requestAnimationFrame(r));
        const k = lienzo.width / lienzo.getBoundingClientRect().width;
        const fila = ctx.getImageData(
          Math.round((x - ancho / 2 - 3) * k),
          Math.round((y + 2) * k),
          Math.round((ancho + 6) * k),
          1,
        ).data;
        let n = 0;
        for (let i = 0; i < fila.length; i += 4) {
          const [r, g, b] = [fila[i] ?? 0, fila[i + 1] ?? 0, fila[i + 2] ?? 0];
          if (
            colores.some(
              ([R, G, B]) => Math.abs(r - R) < 14 && Math.abs(g - G) < 14 && Math.abs(b - B) < 14,
            )
          )
            n++;
        }
        const abierta = rueda.open && rueda.dataset.tramo !== undefined;
        muestras.push({ t, abierta, ancho: n / k });
        if (abierta) {
          vista = true;
          cerrada = null;
        } else if (vista && cerrada === null) cerrada = t;
        if ((cerrada !== null && t - cerrada > masAlla) || t - desde > tope) break;
      }
      return muestras;
    },
    {
      x: cabeza.x,
      y: cabeza.y,
      ancho: cabeza.anchoBarra,
      colores: COLORES_DE_LA_VIDA,
      masAlla,
      tope,
    },
  );
}

/**
 * Lo que un cruce del registro le hace a la barra de su objetivo: la vida de
 * antes, la de después de cada golpe de quien pega (los de `golpesDe`, antes de
 * cualquier contraataque) y cuánto tarda, desde que la rueda deja de contarlo,
 * el impacto del primero y el del último (`duracionDeLaJugada` hasta su paso, y
 * `IMPACTO` de él). La vida de antes sale del registro: la de salida (`vidaDeSalida`)
 * menos lo que dicen los golpes anteriores, con la cuenta del núcleo (`trasElGolpe`).
 */
function golpesDelCruce(
  battle: BattleState,
  i: number,
  vidaDeSalida: (id: string) => { count: number; topHp: number },
): {
  readonly cruce: Extract<BattleEvent, { kind: 'cruce' }>;
  readonly pvAntes: number;
  readonly pvTras: readonly number[];
  readonly alPrimero: number;
  readonly alUltimo: number;
} {
  const cruce = battle.log[i];
  if (cruce?.kind !== 'cruce') throw new Error(`el hecho ${i} del registro no es un cruce`);
  const objetivo = stackById(battle, cruce.target);
  let vida = vidaDeSalida(cruce.target);
  const recibe = (damage: number) => {
    vida = trasElGolpe({ ...vida, unit: objetivo.unit }, damage);
  };
  for (const e of battle.log.slice(0, i)) {
    if ((e.kind === 'attack' || e.kind === 'shoot') && e.target === cruce.target) recibe(e.damage);
    if (e.kind === 'cast' && e.target === cruce.target) recibe(e.damage ?? 0);
  }
  const pvAntes = stackHp({ ...objetivo, ...vida });
  const pvTras: number[] = [];
  const pasos: number[] = [];
  for (let k = i + 1; k < battle.log.length; k++) {
    const e = battle.log[k] as BattleEvent;
    if (e.kind === 'cruce' || e.kind === 'round_start') break;
    if (e.kind === 'attack' && e.retaliation) break;
    if (e.kind === 'attack' && e.stack === cruce.stack && e.target === cruce.target) {
      recibe(e.damage);
      pvTras.push(stackHp({ ...objetivo, ...vida }));
      pasos.push(k);
    }
  }
  const primero = pasos[0];
  const ultimo = pasos.at(-1);
  if (primero === undefined || ultimo === undefined) {
    throw new Error(`el cruce ${i} del registro no tiene golpe detrás`);
  }
  const hasta = (k: number): number =>
    duracionDeLaJugada(battle, battle.log.slice(i + 1, k + 1)) - DURACION.attack * (1 - IMPACTO);
  return { cruce, pvAntes, pvTras, alPrimero: hasta(primero), alUltimo: hasta(ultimo) };
}

/**
 * Lo que se vio de la barra de `quien` (`muestrasDeLaBarra`) contra lo que debía
 * (H6 de la QA de la rueda): con la rueda girando, `antes` px; nada baja hasta el
 * impacto del primer golpe (`alPrimero` ms desde que la rueda deja de contar), y
 * luego pasa por la vida de cada golpe (`escalones`, en px), uno a uno. La rueda
 * se cerró entre la última muestra que la vio y la siguiente; según el orden de
 * los fotogramas, la muestra puede leer el de antes: se cuenta el hueco mayor.
 */
function barraAlRitmo(
  muestras: readonly MuestraDeLaBarra[],
  quien: string,
  antes: number,
  alPrimero: number,
  escalones: readonly number[],
): string {
  let ultima = -1;
  for (const [k, m] of muestras.entries()) if (m.abierta) ultima = k;
  const vista = muestras[ultima];
  const siguiente = muestras[ultima + 1];
  if (vista === undefined || siguiente === undefined) {
    throw new Error(`${quien}: la rueda no se vio contar el cruce, o no se cerró`);
  }
  for (const m of muestras.slice(0, ultima + 1)) {
    if (m.abierta && Math.abs(m.ancho - antes) > 1.5) {
      throw new Error(
        `${quien}: con la rueda girando la barra mide ${m.ancho.toFixed(1)} px y antes del golpe ${antes.toFixed(1)}: enseña el golpe antes de contarlo`,
      );
    }
  }
  const hueco = Math.max(siguiente.t - vista.t, vista.t - (muestras[ultima - 1]?.t ?? vista.t));
  const impacto = vista.t - hueco + alPrimero;
  const baja = muestras.find((m) => m.ancho < antes - 1.5);
  if (baja === undefined) throw new Error(`${quien}: la barra no baja con el golpe`);
  if (baja.t < impacto - 2) {
    throw new Error(
      `${quien}: la barra baja ${(impacto - baja.t).toFixed(0)} ms antes del impacto del golpe (a ${(baja.t - vista.t).toFixed(0)} ms de cerrarse la rueda; el impacto llega a ${alPrimero.toFixed(0)})`,
    );
  }
  // Golpe a golpe: cada escalón que se distingue del anterior se ve.
  let previo = antes;
  for (const [n, px] of escalones.entries()) {
    if (Math.abs(previo - px) >= 3 && !muestras.some((m) => Math.abs(m.ancho - px) <= 1.5)) {
      throw new Error(
        `${quien}: la barra no pasa por ${px.toFixed(1)} px tras el golpe ${n + 1}: no baja golpe a golpe (vistas: ${[...new Set(muestras.map((m) => m.ancho.toFixed(1)))].join(', ')})`,
      );
    }
    previo = px;
  }
  return `antes ${antes.toFixed(1)} px, quieta mientras gira, baja a ${(baja.t - vista.t).toFixed(0)} ms de cerrarse la rueda (impacto a ${alPrimero.toFixed(0)}), ${escalones.length} golpe(s)`;
}

/**
 * Un punto que recibe el botón del sector `tipo`: el centro de su rótulo. El
 * botón mide el plato entero, recortado a su sector (#258), así que el centro de
 * su caja es el de la rueda, que es de Normal.
 */
async function centroDelSector(page: Page, tipo: TipoDeGolpe): Promise<{ x: number; y: number }> {
  const c = await page
    .locator(`#rueda .sector-de-rueda[data-sector="${tipo}"] .rotulo-del-sector`)
    .boundingBox();
  if (c === null) throw new Error(`rueda: el rótulo del sector ${tipo} no se ve`);
  return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
}

/** El relleno con que se pinta el sector `tipo` en el disco de la rueda. */
async function rellenoDelSector(page: Page, tipo: TipoDeGolpe): Promise<string> {
  return await page
    .locator(`#rueda .disco .sector[data-sector="${tipo}"]`)
    .evaluate((el) => getComputedStyle(el).fill);
}

/** Cómo se pinta el botón del sector `tipo`: fondo, color del texto y escala del icono. */
async function aspectoDelBoton(page: Page, tipo: TipoDeGolpe): Promise<string> {
  return await page.locator(`#rueda [data-golpe="${tipo}"]`).evaluate((el) => {
    const b = getComputedStyle(el);
    const icono = el.querySelector('.icono');
    return `${b.backgroundColor} ${b.color} ${icono === null ? '' : getComputedStyle(icono).transform}`;
  });
}

/** ¿Está abierta la nota del sector `tipo`? La abre su `::after`. */
async function notaAbierta(page: Page, tipo: TipoDeGolpe): Promise<boolean> {
  return await page
    .locator(`#rueda .sector-de-rueda[data-sector="${tipo}"] > .nota`)
    .evaluate((el) => {
      const d = getComputedStyle(el, '::after');
      return d.content !== 'none' && d.content !== 'normal' && d.display !== 'none';
    });
}

/**
 * Yo contra Yo con el ratón (H1 y H2 de la QA de la rueda, 13-10-2026), a
 * escritorio. Quien pega pasa el ratón por Fuerte —que se enciende y abre su
 * nota: así se ve que el `:hover` funciona— y lo pulsa sin moverlo. La respuesta
 * sale con el puntero en el mismo píxel, encima del sector de Fuerte: no puede
 * encenderse ni abrir su nota (`data-quieta`) hasta que el ratón se mueve, y al
 * moverlo sí; ni una tecla la despierta (H1b, vuelta 2: →, Tab y Shift con el
 * ratón aún encima). Luego se responde con la tecla 2 y la barra de vida del
 * objetivo, medida en cada fotograma, no baja mientras gira la rueda ni antes
 * del impacto del golpe, y baja golpe a golpe hasta la del estado (H6: la vida
 * la retiene el animador, `EstadoFigura.pv`).
 */
async function yoContraYoEnLaRueda(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const semilla = 1;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'rueda-yo-contra-yo', problemas);
  // Hasta que alguien golpea: la rueda se abre en la fase del golpe.
  const { espejo, objetivo: contra } = await hastaLaRuedaYoContraYo(
    page,
    url,
    semilla,
    'rueda-yo-contra-yo',
    1,
  );
  await sleep(300);

  // H1: el ratón por Fuerte lo enciende y abre su nota…
  const enFuerte = await centroDelSector(page, 'fuerte');
  await page.mouse.move(enFuerte.x - 12, enFuerte.y - 8);
  await page.mouse.move(enFuerte.x, enFuerte.y, { steps: 3 });
  await sleep(150);
  const encendido = await rellenoDelSector(page, 'fuerte');
  if (
    !(await notaAbierta(page, 'fuerte')) ||
    encendido === (await rellenoDelSector(page, 'rapido'))
  ) {
    throw new Error(
      'rueda-yo-contra-yo: con el ratón encima, Fuerte no se enciende ni abre su nota',
    );
  }
  // H2, antes: la vida del objetivo con la rueda abierta (aún no hay golpe).
  const vidaAntes = await vidaPintada(page, contra);
  // …y se pulsa sin mover el ratón.
  await page.mouse.down();
  await page.mouse.up();
  espejo.elegirEnLaRueda('fuerte');
  await page.locator('#rueda[open] .rueda[data-fase="respuesta"]').waitFor({ timeout: 5000 });
  await sleep(300);
  const bajoElRaton = await page
    .locator('#rueda [data-golpe="fuerte"]')
    .evaluate((el) => el.matches(':hover'));
  if (!bajoElRaton) {
    throw new Error('rueda-yo-contra-yo: la respuesta no sale con el ratón encima de Fuerte');
  }
  // Lo que se ve, no el atributo: el sector apagado y su nota cerrada.
  const seVe = [
    (await rellenoDelSector(page, 'fuerte')) === encendido ? 'el sector encendido' : '',
    (await notaAbierta(page, 'fuerte')) ? 'su nota abierta' : '',
    (await aspectoDelBoton(page, 'fuerte')) !== (await aspectoDelBoton(page, 'rapido'))
      ? 'su botón distinto de los demás'
      : '',
  ].filter((x) => x !== '');
  if (seVe.length > 0) {
    throw new Error(
      `rueda-yo-contra-yo: la respuesta deja ver lo que pulsó quien pega: ${seVe.join(' y ')} de Fuerte`,
    );
  }
  await captura(page, 'rueda-06-yo-contra-yo-respuesta');
  // H1b: quien responde con el teclado no la despierta. El foco enciende su
  // sector (el primero del anillo, con →); Fuerte, bajo el ratón quieto, no. Se
  // compara con uno que no es ninguno de los dos (el orden del anillo cambió con
  // #263: el primero era Rápido y ahora es Ofensivo).
  const conElFoco = TIPOS_DE_GOLPE[0] as TipoDeGolpe;
  const otro = TIPOS_DE_GOLPE.find((t) => t !== conElFoco && t !== 'fuerte' && t !== 'normal');
  if (otro === undefined) throw new Error('rueda-yo-contra-yo: la rueda no tiene otro sector');
  for (const tecla of ['ArrowRight', 'Tab', 'Shift']) {
    await page.keyboard.press(tecla);
    await sleep(150);
    const seVeConTecla = [
      (await rellenoDelSector(page, 'fuerte')) === encendido ? 'el sector encendido' : '',
      (await notaAbierta(page, 'fuerte')) ? 'su nota abierta' : '',
      (await aspectoDelBoton(page, 'fuerte')) !== (await aspectoDelBoton(page, otro))
        ? 'su botón distinto de los demás'
        : '',
    ].filter((x) => x !== '');
    if (seVeConTecla.length > 0) {
      throw new Error(
        `rueda-yo-contra-yo: tras pulsar ${tecla}, la respuesta deja ver lo que pulsó quien pega: ${seVeConTecla.join(' y ')} de Fuerte`,
      );
    }
    // El teclado sí enciende lo suyo: con →, el foco en el primero lo enciende en el disco.
    if (tecla === 'ArrowRight') {
      if ((await rellenoDelSector(page, conElFoco)) !== encendido) {
        throw new Error(`rueda-yo-contra-yo: con → el foco no enciende ${conElFoco} en el disco`);
      }
      await captura(page, 'rueda-07-yo-contra-yo-teclado');
    }
  }
  // Moverlo de verdad la despierta: el mismo `:hover` vuelve a encender.
  await page.mouse.move(enFuerte.x + 3, enFuerte.y + 2);
  // Hasta 1 s: el relleno cambia con una transición de 140 ms y, con la máquina
  // cargada, a los 150 ms aún iba por la mitad (14-10-2026, carga 18).
  for (let i = 0; i < 10 && (await rellenoDelSector(page, 'fuerte')) !== encendido; i++) {
    await sleep(100);
  }
  if ((await rellenoDelSector(page, 'fuerte')) !== encendido) {
    const diag = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x as number, y as number);
        const b = document.querySelector('#rueda [data-golpe="fuerte"]');
        return `en el punto ${el?.outerHTML.slice(0, 120)}; quieta ${document.getElementById('rueda')?.hasAttribute('data-quieta')}; hover ${b?.matches(':hover')}; foco ${document.activeElement?.outerHTML.slice(0, 80)}`;
      },
      [enFuerte.x + 3, enFuerte.y + 2],
    );
    throw new Error(
      `rueda-yo-contra-yo: movido el ratón, Fuerte no se enciende (${await rellenoDelSector(page, 'fuerte')} / ${encendido}; ${diag})`,
    );
  }
  log('rueda-yo-contra-yo: la respuesta sale quieta bajo el ratón y despierta al moverlo');

  // H2 y H6: mientras gira, la vida de antes; nada baja antes del impacto; luego,
  // golpe a golpe. Se mide en cada fotograma desde que se pulsa la tecla.
  const antes = espejo.battle.log.length;
  const total = contra.unit.hp * contra.initialCount;
  const hpAntes = stackHp(contra);
  // Las teclas de antes dejaron el foco en un sector: la tecla 2 elige igual.
  await page.keyboard.press(teclaDe('defensivo'));
  espejo.elegirEnLaRueda('defensivo');
  const tocado = stackById(espejo.battle, contra.id);
  // La vida de salida, de la misma pelea sin jugar: el registro pone lo demás.
  const salida = espejoYoContraYo(semilla, 1).battle;
  const golpes = golpesDelCruce(espejo.battle, antes, (id) => {
    const x = stackById(salida, id);
    return { count: x.count, topHp: x.topHp };
  });
  if (golpes.pvAntes !== hpAntes) {
    throw new Error(
      `rueda-yo-contra-yo: el registro da ${golpes.pvAntes} PV antes y eran ${hpAntes}`,
    );
  }
  const anchoEntero = vidaAntes / (hpAntes / total);
  const muestras = await muestrasDeLaBarra(page, contra, golpes.alUltimo + 500);
  log(
    `rueda-yo-contra-yo: barra de ${contra.id}: ${barraAlRitmo(
      muestras,
      'rueda-yo-contra-yo',
      vidaAntes,
      golpes.alPrimero,
      golpes.pvTras.map((pv) => (anchoEntero * pv) / total),
    )}`,
  );
  await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
  // Contado todo, la del estado: la barra entera mide lo de antes entre su fracción.
  const despues = await vidaPintada(page, tocado);
  const debe = (anchoEntero * stackHp(tocado)) / total;
  log(
    `rueda-yo-contra-yo: barra de ${contra.id} ${despues.toFixed(1)} px contado el golpe (${hpAntes} → ${stackHp(tocado)} PV; debe ${debe.toFixed(1)})`,
  );
  if (Math.abs(despues - debe) > 1.5) {
    throw new Error(
      `rueda-yo-contra-yo: contado el golpe (${hpAntes} → ${stackHp(tocado)} PV), la barra mide ${despues.toFixed(1)} px y el estado dice ${debe.toFixed(1)}`,
    );
  }
  await page.close();
}

/**
 * La pelea de `todoEnIAConLaRueda` en el espejo, ya jugada entera: el guerrero con
 * escudo contra el orco con dos armas, los dos en IA. El orco es el de la lista,
 * como el que pulsa la página: sin la lanza de `orcoConLanza`, que desde que todos
 * cargan en la arena (#260) se usa al cargar y separaba el espejo de la página.
 */
function espejoTodoEnIA(semilla: number): {
  readonly espejo: SesionDeArena;
  readonly salida: ReadonlyMap<string, { hex: BattleStack['hex']; count: number; topHp: number }>;
} {
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: {
        unidades: [delBorrador(delCatalogo('templario-escudo'))],
        heroe: null,
        ia: true,
      },
      derecha: {
        unidades: [delBorrador(delCatalogo('orko-dos-armas'))],
        heroe: null,
        ia: true,
      },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  const salida = new Map(
    espejo.battle.stacks.map((x) => [x.id, { hex: x.hex, count: x.count, topHp: x.topHp }]),
  );
  espejo.empezar();
  if (espejo.battle.finished === null) throw new Error('rueda-todo-ia: el espejo no termina');
  return { espejo, salida };
}

/**
 * La semilla de `todoEnIAConLaRueda`: la primera con dos cruces o más, que es lo
 * que mira. Era la 4, fija; con el combate de la arena en el juego (19-10-2026) la
 * 4 acaba en un solo cruce.
 */
function buscarTodoEnIA(): ReturnType<typeof espejoTodoEnIA> & { readonly semilla: number } {
  for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS; semilla++) {
    const pelea = espejoTodoEnIA(semilla);
    if (pelea.espejo.battle.log.filter((e) => e.kind === 'cruce').length >= 2) {
      return { semilla, ...pelea };
    }
  }
  throw new Error(
    `rueda-todo-ia: en las semillas 1–${TOPE_DE_SEMILLAS} ninguna pelea tiene dos cruces`,
  );
}

/**
 * Con todo en IA y la rueda (H6 de la vuelta 2 de QA, 13-10-2026): la sesión juega
 * la pelea entera de una vez y el estado trae el final. Antes, fuera de la rueda,
 * la barra enseñaba la vida del final desde el primer fotograma (el guerrero
 * vacío en la s4) y saltaba arriba y abajo en cada cruce. Aquí, en los primeros
 * cruces de su pelea (Guerrero con escudo contra Orko con dos armas, `buscarTodoEnIA`), la barra del
 * objetivo medida en cada fotograma es la que dice el registro hasta ese golpe
 * mientras gira la rueda, no baja antes del impacto y baja golpe a golpe; y al
 * acabar, la de cada superviviente es la del estado.
 */
async function todoEnIAConLaRueda(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const { semilla, espejo, salida } = buscarTodoEnIA();
  log(`rueda-todo-ia: semilla ${semilla}, buscada en el espejo`);
  const registro = espejo.battle.log;
  const cruces = registro.flatMap((e, i) => (e.kind === 'cruce' ? [i] : []));

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, 'rueda-todo-ia', problemas);
  await abrirLaArena(page, url, `?seed=${semilla}`);
  await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
  await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
  await page.locator('[data-arena="manda"][data-lado="izquierda"][data-ia="si"]').click();
  await page.locator('[data-arena="manda"][data-lado="derecha"][data-ia="si"]').click();
  await page.locator('[data-arena="luchar"]').click();
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });

  const vidaDeSalida = (id: string) => {
    const x = salida.get(id);
    if (x === undefined) throw new Error(`rueda-todo-ia: ${id} no estaba al empezar`);
    return { count: x.count, topHp: x.topHp };
  };
  // Dónde se ve cada uno al empezar el cruce `i`: su último tramo antes de él.
  const dondeEsta = (id: string, i: number) => {
    let hex = (salida.get(id) as { hex: BattleStack['hex'] }).hex;
    for (const e of registro.slice(0, i)) {
      if ((e.kind === 'move' || e.kind === 'climbed') && e.stack === id) hex = e.to;
    }
    return hex;
  };
  const vistos = Math.min(3, cruces.length);
  for (const [n, i] of cruces.slice(0, vistos).entries()) {
    const g = golpesDelCruce(espejo.battle, i, vidaDeSalida);
    const objetivo = stackById(espejo.battle, g.cruce.target);
    const quieto = { ...objetivo, hex: dondeEsta(objetivo.id, i) };
    await page.locator('#rueda[open][data-tramo]').waitFor({ timeout: 30_000 });
    // El cruce que se ve es el que toca: el golpe y la respuesta del registro.
    const elegidos = await page
      .locator('#rueda [data-elegido]')
      .evaluateAll((els) =>
        els.map((el) => `${el.getAttribute('data-sector')}:${el.getAttribute('data-elegido')}`),
      );
    const esperados =
      g.cruce.golpe === g.cruce.respuesta
        ? [`${g.cruce.golpe}:los-dos`]
        : [`${g.cruce.golpe}:golpe`, `${g.cruce.respuesta}:respuesta`];
    if (esperados.some((x) => !elegidos.includes(x))) {
      throw new Error(
        `rueda-todo-ia: la rueda ${n + 1} enseña ${elegidos.join(', ')} y el cruce ${n + 1} del registro es ${esperados.join(', ')}: se ha perdido uno`,
      );
    }
    const total = objetivo.unit.hp * objetivo.initialCount;
    const b = await caja(page);
    const entero = cabezaDe(
      { tablero: tableroPara(b.width, b.height) },
      {
        en: centroDeStack(stackHexes(quieto)),
        elevacion: 0,
      },
    ).anchoBarra;
    const muestras = await muestrasDeLaBarra(page, quieto, g.alUltimo + 400);
    log(
      `rueda-todo-ia: cruce ${n + 1}, ${objetivo.id} (${g.pvAntes} → ${g.pvTras.join(' → ')} PV): ${barraAlRitmo(
        muestras,
        `rueda-todo-ia, cruce ${n + 1}`,
        (entero * g.pvAntes) / total,
        g.alPrimero,
        g.pvTras.map((pv) => (entero * pv) / total),
      )}`,
    );
    if (n === 0) await captura(page, 'rueda-08-todo-ia');
  }
  // Al acabar, la barra de cada superviviente es la del estado.
  await esperarCola(espejo.battle, registro);
  for (const x of espejo.battle.stacks.filter((y) => y.count > 0)) {
    const b = await caja(page);
    const entero = cabezaDe(
      { tablero: tableroPara(b.width, b.height) },
      {
        en: centroDeStack(stackHexes(x)),
        elevacion: 0,
      },
    ).anchoBarra;
    const debe = (entero * stackHp(x)) / (x.unit.hp * x.initialCount);
    const mide = await vidaPintada(page, x);
    if (Math.abs(mide - debe) > 1.5) {
      throw new Error(
        `rueda-todo-ia: al acabar, la barra de ${x.id} mide ${mide.toFixed(1)} px y el estado dice ${debe.toFixed(1)}`,
      );
    }
  }
  log(
    `rueda-todo-ia: ${vistos} cruces medidos fotograma a fotograma; al acabar, las barras del estado`,
  );
  await page.close();
}

// ------------------------------------------- la rueda: sectores y contrincantes

/**
 * Lo que da `elementFromPoint` en el plano de la rueda, a `r` y `grados` (las
 * medidas de `MEDIDAS_DE_LA_RUEDA`): el `data-golpe` del botón que recibe ese
 * punto, o `null` si no es de ninguno.
 */
async function golpeEnElPunto(page: Page, r: number, grados: number): Promise<string | null> {
  const plato = await page.locator('#rueda .plato').boundingBox();
  if (plato === null) throw new Error('rueda: el plato no se ve');
  const k = plato.width / MEDIDAS_DE_LA_RUEDA.lado;
  const a = (grados * Math.PI) / 180;
  const x = plato.x + plato.width / 2 + r * k * Math.cos(a);
  const y = plato.y + plato.height / 2 + r * k * Math.sin(a);
  return await page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px as number, py as number)
        ?.closest('[data-golpe]')
        ?.getAttribute('data-golpe') ?? null,
    [x, y],
  );
}

/**
 * #258: toda la corona de cada sector responde, y solo ella. En los siete, el
 * borde de fuera (r 97) y los dos picos de fuera y de dentro (a 1,5° de la
 * junta) dan su sector, y Normal a r 39; fuera de la corona (r 103), en la junta
 * entre dos y en el hueco entre la corona y Normal (r 43), ninguno.
 */
async function sectoresEnteros(page: Page, quien: string, conRaton: boolean): Promise<string> {
  const m = MEDIDAS_DE_LA_RUEDA;
  const fallos: string[] = [];
  let medidos = 0;
  const debe = async (r: number, g: number, esperado: string | null, donde: string) => {
    medidos++;
    const visto = await golpeEnElPunto(page, r, g);
    if (visto !== esperado) fallos.push(`${donde}: ${String(visto)} (debía ${String(esperado)})`);
  };
  for (const t of TIPOS_DE_GOLPE) {
    // El «ⓘ» del sector (R1 de QA de #258): con ratón no es un hueco, el clic va
    // a su sector; tocando, es la nota, y tocarlo la abre.
    const { nota: n } = sitioEnLaRueda(t);
    await debe(
      Math.hypot(n.x, n.y),
      (Math.atan2(n.y, n.x) * 180) / Math.PI,
      conRaton ? t : null,
      `${t}, sobre su «ⓘ»`,
    );
    if (t === 'normal') {
      for (const g of [0, 90, 180, 270]) {
        await debe(m.radioDelCentro - 2, g, 'normal', `Normal a r ${m.radioDelCentro - 2}, ${g}°`);
        await debe(m.dentro - 2, g, null, `entre Normal y la corona, ${g}°`);
      }
      continue;
    }
    const c = anguloDe(t);
    const pico = m.medioSector - 1.5;
    await debe(m.fuera - 3, c, t, `${t}, borde de fuera`);
    for (const lado of [-1, 1]) {
      await debe(
        m.fuera - 3,
        c + lado * pico,
        t,
        `${t}, pico de fuera ${lado < 0 ? 'izquierdo' : 'derecho'}`,
      );
      await debe(
        m.dentro + 3,
        c + lado * pico,
        t,
        `${t}, pico de dentro ${lado < 0 ? 'izquierdo' : 'derecho'}`,
      );
    }
    await debe(m.fuera + 3, c, null, `${t}, fuera de la corona`);
    await debe((m.dentro + m.fuera) / 2, c + 30, null, `junta tras ${t}`);
  }
  if (fallos.length > 0) {
    throw new Error(`${quien}: la rueda no responde donde se ve: ${fallos.join('; ')}`);
  }
  return `${medidos} puntos de la rueda dan el sector que se ve`;
}

/**
 * Cuántos de 18 puntos de la mitad de delante (la que no tapa la figura) del aro
 * de la rueda alrededor de los pies de `s` (`ARO_DE_LA_RUEDA` veces el de su
 * bando) son del color de su bando.
 */
async function aroDeLaRueda(page: Page, s: BattleStack): Promise<number> {
  const b = await caja(page);
  const t = tableroPara(b.width, b.height);
  const c = cajaDeFigura(t, centroDeStack(stackHexes(s)));
  const rx = t.paso * 0.36 * ARO_DE_LA_RUEDA;
  const ry = rx * t.compresion * 0.95;
  const color = COLOR_BANDO[s.side];
  return await page.evaluate(
    ({ x, y, rx, ry, color }) => {
      const lienzo = document.getElementById('canvas') as HTMLCanvasElement;
      const k = lienzo.width / lienzo.getBoundingClientRect().width;
      const ctx = lienzo.getContext('2d');
      if (ctx === null) throw new Error('el lienzo de la batalla no tiene contexto 2d');
      const R = Number.parseInt(color.slice(1, 3), 16);
      const G = Number.parseInt(color.slice(3, 5), 16);
      const B = Number.parseInt(color.slice(5, 7), 16);
      let n = 0;
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI) / 17;
        const d = ctx.getImageData(
          Math.round((x + rx * Math.cos(a)) * k) - 1,
          Math.round((y + ry * Math.sin(a)) * k) - 1,
          3,
          3,
        ).data;
        for (let j = 0; j < d.length; j += 4) {
          if (
            Math.abs((d[j] ?? 0) - R) < 24 &&
            Math.abs((d[j + 1] ?? 0) - G) < 24 &&
            Math.abs((d[j + 2] ?? 0) - B) < 24
          ) {
            n++;
            break;
          }
        }
      }
      return n;
    },
    { x: c.x, y: c.suelo, rx, ry, color },
  );
}

/**
 * Si cada lienzo de las figuras de la cabecera cambia alguna vez en 3 s: se
 * animan. Mirados cada 150 ms contra el primero: un reposo lento puede enseñar
 * el mismo fotograma en dos instantes sueltos.
 */
async function figurasDeLaCabeceraAnimadas(page: Page): Promise<boolean[]> {
  const fotos = async () =>
    await page.$$eval('#rueda .cabecera-de-rueda canvas.figura', (ls) =>
      ls.map((l) => (l as HTMLCanvasElement).toDataURL()),
    );
  const primera = await fotos();
  const cambia = primera.map(() => false);
  for (let i = 0; i < 20 && cambia.some((c) => !c); i++) {
    await sleep(150);
    for (const [j, f] of (await fotos()).entries()) if (f !== primera[j]) cambia[j] = true;
  }
  return cambia;
}

/**
 * La pelea de Yo contra Yo con la rueda: `n` guerreros con escudo contra `n`
 * orkos, los dos bandos «Yo». Con uno, la de «Yo contra Yo»; con tres iguales por
 * bando, la de los contrincantes, en la que la cabecera enseña la figura (#261).
 */
function espejoYoContraYo(semilla: number, n: number): SesionDeArena {
  const varios = (id: string) => Array.from({ length: n }, () => delBorrador(delCatalogo(id)));
  const espejo = new SesionDeArena(
    {
      combate: COMBATE_COMPLETO,
      izquierda: { unidades: varios('templario-escudo'), heroe: null, ia: false },
      derecha: { unidades: varios('orko-dos-armas'), heroe: null, ia: false },
      equipo: EQUIPO_DEL_JUEGO,
    },
    semilla,
  );
  espejo.empezar();
  return espejo;
}

/** La rueda de Yo contra Yo, abierta en la fase del golpe. */
interface RuedaYoContraYo {
  readonly espejo: SesionDeArena;
  readonly atacante: BattleStack;
  readonly objetivo: BattleStack;
  /** Lo que deben decir las figuras de la cabecera, en orden: «hoja/lado». */
  readonly debenSer: readonly string[];
}

/**
 * Monta los `n` contra `n` en la página (`espejoYoContraYo`), los dos bandos «Yo»,
 * y juega la pauta (un tramo hacia el enemigo y, si no alcanza, terminar) hasta
 * que alguien golpea: la rueda se abre en la fase del golpe. Devuelve el espejo y
 * el golpe.
 */
async function hastaLaRuedaYoContraYo(
  page: Page,
  url: string,
  semilla: number,
  quien: string,
  n: number,
): Promise<RuedaYoContraYo> {
  await abrirLaArena(page, url, `?seed=${semilla}`);
  for (let i = 0; i < n; i++) {
    await page.locator('[data-unidad-catalogo="templario-escudo"] [data-lado="izquierda"]').click();
    await page.locator('[data-unidad-catalogo="orko-dos-armas"] [data-lado="derecha"]').click();
  }
  await page.locator('[data-arena="manda"][data-lado="derecha"][data-ia="no"]').click();
  await page.locator('[data-arena="luchar"]').click();
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });
  const espejo = espejoYoContraYo(semilla, n);
  await mismaPelea(page, espejo, `${quien}: empezar`);
  for (let jugada = 0; ; jugada++) {
    if (espejo.battle.finished !== null || jugada > 80)
      throw new Error(`${quien}: nadie llega a golpear`);
    const antes = espejo.battle.log.length;
    const turno = espejo.turnoPropio;
    const j = jugadaDeLaPauta(espejo, espejo.battle.turno?.gastado === 0 ? 0 : 1, 0);
    if (j.tipo === 'golpe') {
      const px = await pixelDeUnidad(page, espejo, j.contra);
      if (px.accion === undefined)
        throw new Error(`${quien}: el clic sobre ${j.contra.id} no da acción`);
      await page.mouse.click(px.x, px.y);
      espejo.playBattleAction(px.accion);
      await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
      await page.locator('#rueda[open] .rueda[data-fase="golpe"]').waitFor({ timeout: 10_000 });
      if (turno === null) throw new Error(`${quien}: golpea alguien sin turno`);
      // Por su bando del núcleo (`data-bando`): el diálogo es el de la partida desde
      // F5, y la partida no tiene izquierda ni derecha.
      const debenSer = [turno.stack, j.contra].map((x) => `${x.body}/${x.side}`);
      return { espejo, atacante: turno.stack, objetivo: j.contra, debenSer };
    }
    await ejecutarPauta(page, espejo, j);
    await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
    await mismaPelea(page, espejo, `${quien}: la jugada ${jugada}`);
  }
}

/** ¿Se ve la vista previa del contrincante `id`? */
async function previaAbierta(page: Page, id: string): Promise<boolean> {
  return await page
    .locator(`#rueda [data-contrincante="${id}"] > .vista-previa`)
    .evaluate((el) => getComputedStyle(el).display !== 'none');
}

/**
 * La rueda con los dos contrincantes (#261) y todo el sector respondiendo (#258),
 * a escritorio, con clics de verdad en un tres contra tres. Los dos lienzos de la
 * cabecera se animan; el ratón por la figura de quien pega abre su vista previa
 * (con su vida) sin despertar los sectores; el clic abre su ficha de solo lectura
 * encima de la rueda, y Escape la cierra con la rueda en la misma fase. Los dos
 * llevan su aro en el tablero. Luego, la corona entera: `elementFromPoint` en los
 * bordes y picos de cada sector, y el clic real en la esquina de fuera de Fuerte,
 * que la enciende y la elige; la respuesta con su tecla, y el cruce sale en el parte.
 */
async function contrincantesEnElEscritorio(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const quien = 'rueda-contrincantes';
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  vigilarConsola(page, quien, problemas);
  const { espejo, atacante, objetivo, debenSer } = await hastaLaRuedaYoContraYo(
    page,
    url,
    1,
    quien,
    3,
  );
  await sleep(300);
  // Los dos, en orden: quien pega y quien recibe, con la figura de su hoja y su bando.
  const figuras = await page.$$eval('#rueda .cabecera-de-rueda canvas.figura', (ls) =>
    ls.map((l) => `${l.getAttribute('data-figura')}/${l.getAttribute('data-bando')}`),
  );
  if (JSON.stringify(figuras) !== JSON.stringify(debenSer)) {
    throw new Error(
      `${quien}: la cabecera enseña ${figuras.join(', ')} y debía ${debenSer.join(', ')}`,
    );
  }
  await captura(page, 'rueda-20-contrincantes');
  const animadas = await figurasDeLaCabeceraAnimadas(page);
  if (animadas.length !== 2 || animadas.some((a) => !a)) {
    throw new Error(`${quien}: las figuras de la cabecera no se animan (${animadas.join(', ')})`);
  }
  // El aro de la rueda en el tablero, de los dos; y de ningún otro de sus bandos.
  for (const x of [atacante, objetivo]) {
    const n = await aroDeLaRueda(page, x);
    if (n < 6)
      throw new Error(`${quien}: ${x.id} no lleva el aro de la rueda en el tablero (${n} de 18)`);
  }
  const otro = espejo.battle.stacks.find(
    (x) => isAlive(x) && x.side === objetivo.side && x.id !== objetivo.id,
  );
  if (otro !== undefined && (await aroDeLaRueda(page, otro)) >= 6) {
    throw new Error(`${quien}: ${otro.id}, que no se cruza, lleva el aro de la rueda`);
  }
  // La vista previa al pasar el ratón, sin despertar los sectores.
  const icono = page.locator(`#rueda [data-contrincante="${atacante.id}"] > button`);
  const b = await icono.boundingBox();
  if (b === null) throw new Error(`${quien}: la figura de quien pega no se ve`);
  await page.mouse.move(b.x + b.width / 2 - 6, b.y + b.height / 2 - 4);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
  await sleep(150);
  if (!(await previaAbierta(page, atacante.id))) {
    throw new Error(`${quien}: con el ratón en la figura, su vista previa no se abre`);
  }
  const previa = await page
    .locator(`#rueda [data-contrincante="${atacante.id}"] > .vista-previa`)
    .innerText();
  if (!previa.includes('PV') || !previa.includes('Contraataque')) {
    throw new Error(`${quien}: la vista previa no dice la vida ni el contraataque: «${previa}»`);
  }
  if ((await page.locator('#rueda[data-quieta]').count()) === 0) {
    throw new Error(`${quien}: pasar por la figura despierta los sectores de la rueda`);
  }
  await captura(page, 'rueda-21-vista-previa');
  // El clic: la ficha, de solo lectura, encima; Escape vuelve a la rueda.
  await page.mouse.down();
  await page.mouse.up();
  await page
    .locator('#editor-en-combate[open] fieldset.solo-lectura[disabled]')
    .waitFor({ timeout: 3000 });
  const titulo = await page.locator('#titulo-del-editor').innerText();
  if (!titulo.startsWith('Ficha de')) throw new Error(`${quien}: la ficha se titula «${titulo}»`);
  await captura(page, 'rueda-22-ficha');
  await page.keyboard.press('Escape');
  await page
    .locator('#editor-en-combate:not([open])')
    .waitFor({ state: 'attached', timeout: 3000 });
  if ((await page.locator('#rueda[open] .rueda[data-fase="golpe"]').count()) !== 1) {
    throw new Error(`${quien}: al cerrar la ficha la rueda no sigue en la fase del golpe`);
  }
  // El título vuelve con el evento `close`, que llega en una tarea aparte.
  await page
    .waitForFunction(
      (t) => document.getElementById('titulo-del-editor')?.textContent !== t,
      titulo,
      { timeout: 2000 },
    )
    .catch(() => {
      throw new Error(`${quien}: cerrada la ficha, el editor sigue titulado «${titulo}»`);
    });
  // #258: la corona entera responde, y solo ella.
  log(`${quien}: ${await sectoresEnteros(page, quien, true)}`);
  // El clic real en la esquina de fuera de Fuerte: la enciende y la elige.
  const plato = await page.locator('#rueda .plato').boundingBox();
  if (plato === null) throw new Error(`${quien}: el plato no se ve`);
  const k = plato.width / MEDIDAS_DE_LA_RUEDA.lado;
  // Antes, el ratón sobre el «ⓘ» de Fuerte: enciende su sector y abre su nota (R1).
  const info = sitioEnLaRueda('fuerte').nota;
  await page.mouse.move(
    plato.x + plato.width / 2 + info.x * k - 8,
    plato.y + plato.height / 2 + info.y * k,
  );
  await page.mouse.move(
    plato.x + plato.width / 2 + info.x * k,
    plato.y + plato.height / 2 + info.y * k,
    {
      steps: 3,
    },
  );
  await sleep(150);
  if ((await rellenoDelSector(page, 'fuerte')) === (await rellenoDelSector(page, 'rapido'))) {
    throw new Error(`${quien}: con el ratón en el «ⓘ» de Fuerte, su sector no se enciende`);
  }
  const notaAbierta = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('#rueda .sector-de-rueda[data-sector="fuerte"] > .nota') as Element,
        '::after',
      ).content,
  );
  if (notaAbierta === 'none' || notaAbierta === '') {
    throw new Error(`${quien}: con el ratón en el «ⓘ» de Fuerte, su nota no se abre`);
  }
  const g = ((anguloDe('fuerte') + MEDIDAS_DE_LA_RUEDA.medioSector - 2.5) * Math.PI) / 180;
  const r = MEDIDAS_DE_LA_RUEDA.fuera - 4;
  const esquina = {
    x: plato.x + plato.width / 2 + r * k * Math.cos(g),
    y: plato.y + plato.height / 2 + r * k * Math.sin(g),
  };
  await page.mouse.move(esquina.x - 10, esquina.y - 10);
  await page.mouse.move(esquina.x, esquina.y, { steps: 3 });
  await sleep(150);
  if ((await rellenoDelSector(page, 'fuerte')) === (await rellenoDelSector(page, 'rapido'))) {
    throw new Error(`${quien}: con el ratón en la esquina de fuera de Fuerte, no se enciende`);
  }
  await captura(page, 'rueda-23-esquina-de-fuerte');
  const antes = espejo.battle.log.length;
  await page.mouse.down();
  await page.mouse.up();
  espejo.elegirEnLaRueda('fuerte');
  await page.locator('#rueda[open] .rueda[data-fase="respuesta"]').waitFor({ timeout: 5000 });
  // La respuesta: su cabecera también lleva a los dos, en el mismo orden.
  const enLaRespuesta = await page.$$eval('#rueda .cabecera-de-rueda canvas.figura', (ls) =>
    ls.map((l) => `${l.getAttribute('data-figura')}/${l.getAttribute('data-bando')}`),
  );
  if (JSON.stringify(enLaRespuesta) !== JSON.stringify(debenSer)) {
    throw new Error(`${quien}: la cabecera de la respuesta enseña ${enLaRespuesta.join(', ')}`);
  }
  await page.keyboard.press(teclaDe('normal'));
  espejo.elegirEnLaRueda('normal');
  const cruce = espejo.battle.log.slice(antes).find((e) => e.kind === 'cruce');
  if (cruce?.kind !== 'cruce' || cruce.golpe !== 'fuerte') {
    throw new Error(`${quien}: el clic en la esquina de Fuerte no da el golpe Fuerte`);
  }
  await page.locator('#rueda[data-tramo~="rotulo"]').waitFor({ timeout: 8000 });
  const enElDesenlace = await page.locator('#rueda .cabecera-de-rueda canvas.figura').count();
  if (enElDesenlace !== 2)
    throw new Error(`${quien}: el desenlace enseña ${enElDesenlace} figuras`);
  await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
  await page
    .locator('#rueda[open]')
    .waitFor({ state: 'detached', timeout: 100 })
    .catch(() => undefined);
  const parte = await page.locator('#side').innerText();
  const dicho = `${nombreEnLaRueda('fuerte', RUEDA)} contra ${nombreEnLaRueda('normal', RUEDA)}`;
  if (!parte.includes(dicho)) {
    throw new Error(`${quien}: el parte no cuenta el cruce de Fuerte contra Normal`);
  }
  log(
    `${quien}: iconos animados, vista previa, ficha de solo lectura y vuelta, aros; Fuerte por su esquina`,
  );
  await page.close();
}

/**
 * La misma rueda en un móvil de verdad (toque, sin ratón): la cabecera con los
 * dos en dos líneas como mucho, y tocar una figura abre su ficha sin vista previa
 * (decisión del usuario, 14-10-2026); «Volver a la rueda» vuelve a la misma fase y
 * se elige tocando un sector por el borde de fuera.
 */
async function contrincantesEnElMovil(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  const quien = 'rueda-contrincantes-movil';
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await contexto.newPage();
  vigilarConsola(page, quien, problemas);
  const { espejo, objetivo } = await hastaLaRuedaYoContraYo(page, url, 1, quien, 3);
  await sleep(300);
  if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
    throw new Error(`${quien}: el móvil emulado dice que tiene ratón: la prueba no prueba nada`);
  }
  // Dos líneas como mucho: las cajas de los dos y de «ataca a», por su alto.
  const filas = await page.$$eval('#rueda .cabecera-de-rueda :is(.contrincante, .ataca)', (els) => {
    const medios = els.map((e) => {
      const r = e.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const distintas: number[] = [];
    for (const m of medios) if (!distintas.some((d) => Math.abs(d - m) < 12)) distintas.push(m);
    return distintas.length;
  });
  if (filas > 2) throw new Error(`${quien}: la cabecera de la rueda ocupa ${filas} líneas`);
  await captura(page, 'rueda-24-contrincantes-movil');
  await page.locator(`#rueda [data-contrincante="${objetivo.id}"] > button`).tap();
  await page
    .locator('#editor-en-combate[open] fieldset.solo-lectura[disabled]')
    .waitFor({ timeout: 3000 });
  if (await previaAbierta(page, objetivo.id)) {
    throw new Error(`${quien}: tocar la figura abre también la vista previa`);
  }
  await captura(page, 'rueda-25-ficha-movil');
  await page.getByRole('button', { name: 'Volver a la rueda' }).tap();
  await page.locator('#rueda[open] .rueda[data-fase="golpe"]').waitFor({ timeout: 3000 });
  if ((await page.locator('#editor-en-combate[open]').count()) > 0) {
    throw new Error(`${quien}: «Volver a la rueda» no cierra la ficha`);
  }
  log(`${quien}: ${await sectoresEnteros(page, quien, false)}`);
  // Elegir tocando Ofensivo cerca de su borde de fuera.
  const plato = await page.locator('#rueda .plato').boundingBox();
  if (plato === null) throw new Error(`${quien}: el plato no se ve`);
  const k = plato.width / MEDIDAS_DE_LA_RUEDA.lado;
  const g = ((anguloDe('ofensivo') - MEDIDAS_DE_LA_RUEDA.medioSector + 3) * Math.PI) / 180;
  const r = MEDIDAS_DE_LA_RUEDA.fuera - 5;
  const antes = espejo.battle.log.length;
  await page.touchscreen.tap(
    plato.x + plato.width / 2 + r * k * Math.cos(g),
    plato.y + plato.height / 2 + r * k * Math.sin(g),
  );
  espejo.elegirEnLaRueda('ofensivo');
  await page.locator('#rueda[open] .rueda[data-fase="respuesta"]').waitFor({ timeout: 5000 });
  await page.keyboard.press(teclaDe('normal'));
  espejo.elegirEnLaRueda('normal');
  const cruce = espejo.battle.log.slice(antes).find((e) => e.kind === 'cruce');
  if (cruce?.kind !== 'cruce' || cruce.golpe !== 'ofensivo') {
    throw new Error(`${quien}: tocar el borde de Ofensivo no da el golpe Ofensivo`);
  }
  await esperarCola(espejo.battle, espejo.battle.log.slice(antes));
  await mismaPelea(page, espejo, `${quien}: tras el cruce`);
  log(`${quien}: dos líneas, ficha al tocar sin vista previa, y Ofensivo por su borde`);
  await contexto.close();
}

/** Los dos contrincantes de la rueda (#261) y sus sectores enteros (#258), a escritorio y a móvil. */
async function contrincantesDeLaRueda(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  await conLosCatalogosDevueltos('rueda-contrincantes', async () => {
    await contrincantesEnElEscritorio(browser, url, problemas);
    await contrincantesEnElMovil(browser, url, problemas);
  });
}

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
 * ya pelea en despejado sin él. El clima lo mira `tools/qa/clima.ts`.
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
