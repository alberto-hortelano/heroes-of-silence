/**
 * La pasada «rueda-del-golpe» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la rueda del golpe en la arena.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import { DURACION, duracionDeLaJugada, IMPACTO } from '../../../../src/client/batalla/anim.js';
import { cabezaDe } from '../../../../src/client/render/batalla/figura.js';
import { centroDeStack, tableroPara } from '../../../../src/client/render/proyeccion.js';
import { SesionDeArena } from '../../../../src/client/sesion/sesion-de-arena.js';
import { AVISO_DE_ESPERA } from '../../../../src/client/views/cifras.js';
import { hexEquals } from '../../../../src/core/battle/board.js';
import { stackById, stackHexes } from '../../../../src/core/battle/consultas.js';
import { stackHp, trasElGolpe } from '../../../../src/core/battle/damage.js';
import { NOMBRE_DEL_PUNTO } from '../../../../src/core/battle/rueda.js';
import type {
  BattleAction,
  BattleEvent,
  BattleStack,
  BattleState,
} from '../../../../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../../../../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../../../../src/core/equipo/atado.js';
import type { TipoDeGolpe } from '../../../../src/core/types.js';
import { primeraSemillaCon } from '../../../comun/semillas.js';
import {
  abrirLaArena,
  conLosCatalogosDevueltos,
  delBorrador,
  delCatalogo,
  esperarBarra,
  type JugadaDeLaPauta,
  jugadaDeLaPauta,
  mismaPelea,
} from '../arena.js';
import { TOPE_DE_SEMILLAS } from '../escenas.js';
import {
  caja,
  captura,
  desplegarTalCual,
  esperarCola,
  log,
  type Problemas,
  teclaDe,
  vigilarConsola,
} from '../pagina.js';
import { pixelDeUnidad } from '../pixeles.js';
import {
  ejecutarPauta,
  espejoYoContraYo,
  hastaLaRuedaYoContraYo,
  notaAbierta,
  rellenoDelSector,
  TIPOS_DE_GOLPE,
} from '../rueda.js';

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
  espejo.despliegue.listoTalCual();
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
  return primeraSemillaCon(
    'una pelea en que la rueda pide a la persona el golpe y la respuesta',
    (semilla) => {
      const espejo = espejoDeLaRueda(semilla);
      const vistas = new Set<string>();
      let tramos = 0;
      for (let n = 0; n < 300 && espejo.battle.finished === null; n++) {
        const j = jugadaDeLaRueda(espejo, tramos);
        if (j.tipo === 'elegir') {
          vistas.add(j.fase);
          if (vistas.size === 2) return true;
        }
        enElEspejo(espejo, j);
        if (j.tipo === 'tramo') tramos++;
      }
      return undefined;
    },
    1,
    TOPE_DE_SEMILLAS,
  ).semilla;
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
export async function ruedaEnLaArena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
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
  // La pelea abre en el despliegue de los bandos «Yo»: se acepta tal cual.
  await desplegarTalCual(page, espejo, 'empezar la pelea de la rueda', 'despliegue-03-arena');
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
        // llegó (o en su salida, si cargaba) con su turno; se vuelve a pulsar desde ahí.
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
        // «Golpe cancelado.».
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
 * la casilla de la que salió (`salidas`), si anduvo, no hay barra. Sin carga,
 * primero se anda y luego la rueda (decisión del usuario, 13-10-2026); con carga,
 * la rueda antes de correr (31-10-2026): quieto en su salida. Devuelve qué se vio.
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
  if (g.carga !== null) {
    if (salida !== undefined && !hexEquals(salida, s.hex)) {
      throw new Error(
        `${quien}: al abrirse la rueda de una carga, ${s.id} ya corrió de (${salida.col},${salida.row}) a ${donde}`,
      );
    }
    const llegada = g.carga.carrera.at;
    return `${s.id} carga ${g.carga.recta} desde ${donde} hasta (${llegada.col},${llegada.row}) y la rueda se abrió antes de correr`;
  }
  if (salida === undefined || hexEquals(salida, s.hex))
    return `${s.id} golpea desde ${donde}, sin andar`;
  const alli = await vidaPintada(page, { ...s, hex: salida });
  if (alli > 1.5) {
    throw new Error(
      `${quien}: al abrirse la rueda, ${s.id} se ve aún en su salida (${salida.col},${salida.row}): ${alli.toFixed(1)} px de barra`,
    );
  }
  return `${s.id} anduvo de (${salida.col},${salida.row}) a ${donde} y la rueda se abrió con él ya allí`;
}

/**
 * Tras Escape con la unidad ya plantada: sigue donde llegó (en su salida, si
 * cargaba) y con su turno —la
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

/** Los colores de la barra de vida (`pintarVida`, `render/batalla/figura.ts`): sana, a medias, roja. */
const COLORES_DE_LA_VIDA: readonly (readonly [number, number, number])[] = [
  [0x9f, 0xc4, 0x9a],
  [0xe0, 0xc0, 0x60],
  [0xe3, 0x73, 0x5a],
];

/**
 * Lo que mide la barra de vida de `s` pintada en el lienzo, en píxeles del
 * lienzo: los de su fila del medio con uno de los colores de la vida, y los de sus
 * dos puntas por lo que cubren. La barra va donde la pone `cabezaDe`, con la
 * figura quieta en su casilla.
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
      // Los píxeles enteros del color de la vida, y los dos de las puntas por lo que
      // cubren: la barra empieza y acaba a medio píxel, y esos dos, a media luz, no
      // casan con el color (la medida salía hasta 2 px corta: 26,0 de 27,8).
      let n = 0;
      let primero = -1;
      let ultimo = -1;
      for (let i = 0; i < fila.length; i += 4) {
        const [r, g, b] = [fila[i] ?? 0, fila[i + 1] ?? 0, fila[i + 2] ?? 0];
        if (
          colores.some(
            ([R, G, B]) => Math.abs(r - R) < 14 && Math.abs(g - G) < 14 && Math.abs(b - B) < 14,
          )
        ) {
          n++;
          if (primero < 0) primero = i;
          ultimo = i;
        }
      }
      let medido = n;
      if (n > 0) {
        // Lo que cubre una punta, entre el color de la barra (su primer píxel entero) y
        // lo de debajo (el fondo de la barra, dos píxeles tras su final).
        const u = Math.min(ultimo + 8, fila.length - 4);
        const dr = (fila[primero] ?? 0) - (fila[u] ?? 0);
        const dg = (fila[primero + 1] ?? 0) - (fila[u + 1] ?? 0);
        const db = (fila[primero + 2] ?? 0) - (fila[u + 2] ?? 0);
        const norma = dr * dr + dg * dg + db * db;
        for (const e of [primero - 4, ultimo + 4]) {
          if (norma === 0 || e < 0 || e >= fila.length) continue;
          const d =
            ((fila[e] ?? 0) - (fila[u] ?? 0)) * dr +
            ((fila[e + 1] ?? 0) - (fila[u + 1] ?? 0)) * dg +
            ((fila[e + 2] ?? 0) - (fila[u + 2] ?? 0)) * db;
          medido += Math.max(0, Math.min(1, d / norma));
        }
      }
      return medido / k;
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
      // Por selector y no por id: de cuando el literal `'rueda'` era la puerta del modo del
      // golpe, que se fue con los interruptores el 19-10-2026.
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
        // Como `vidaPintada`: los enteros y las dos puntas por lo que cubren.
        let n = 0;
        let primero = -1;
        let ultimo = -1;
        for (let i = 0; i < fila.length; i += 4) {
          const [r, g, b] = [fila[i] ?? 0, fila[i + 1] ?? 0, fila[i + 2] ?? 0];
          if (
            colores.some(
              ([R, G, B]) => Math.abs(r - R) < 14 && Math.abs(g - G) < 14 && Math.abs(b - B) < 14,
            )
          ) {
            n++;
            if (primero < 0) primero = i;
            ultimo = i;
          }
        }
        let medido = n;
        if (n > 0) {
          const u = Math.min(ultimo + 8, fila.length - 4);
          const dr = (fila[primero] ?? 0) - (fila[u] ?? 0);
          const dg = (fila[primero + 1] ?? 0) - (fila[u + 1] ?? 0);
          const db = (fila[primero + 2] ?? 0) - (fila[u + 2] ?? 0);
          const norma = dr * dr + dg * dg + db * db;
          for (const e of [primero - 4, ultimo + 4]) {
            if (norma === 0 || e < 0 || e >= fila.length) continue;
            const d =
              ((fila[e] ?? 0) - (fila[u] ?? 0)) * dr +
              ((fila[e + 1] ?? 0) - (fila[u + 1] ?? 0)) * dg +
              ((fila[e + 2] ?? 0) - (fila[u + 2] ?? 0)) * db;
            medido += Math.max(0, Math.min(1, d / norma));
          }
        }
        const abierta = rueda.open && rueda.dataset.tramo !== undefined;
        muestras.push({ t, abierta, ancho: medido / k });
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

/** Cómo se pinta el botón del sector `tipo`: fondo, color del texto y escala del icono. */
async function aspectoDelBoton(page: Page, tipo: TipoDeGolpe): Promise<string> {
  return await page.locator(`#rueda [data-golpe="${tipo}"]`).evaluate((el) => {
    const b = getComputedStyle(el);
    const icono = el.querySelector('.icono');
    return `${b.backgroundColor} ${b.color} ${icono === null ? '' : getComputedStyle(icono).transform}`;
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
  espejo.despliegue.listoTalCual();
  if (espejo.battle.finished === null) throw new Error('rueda-todo-ia: el espejo no termina');
  return { espejo, salida };
}

/**
 * La semilla de `todoEnIAConLaRueda`: la primera con dos cruces o más, que es lo
 * que mira. Era la 4, fija; con el combate de la arena en el juego (19-10-2026) la
 * 4 acaba en un solo cruce.
 */
function buscarTodoEnIA(): ReturnType<typeof espejoTodoEnIA> & { readonly semilla: number } {
  const { semilla, caso } = primeraSemillaCon(
    'una pelea toda en IA con dos cruces',
    (s) => {
      const pelea = espejoTodoEnIA(s);
      return pelea.espejo.battle.log.filter((e) => e.kind === 'cruce').length >= 2
        ? pelea
        : undefined;
    },
    1,
    TOPE_DE_SEMILLAS,
  );
  return { semilla, ...caso };
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
