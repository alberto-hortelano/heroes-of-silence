/**
 * La pasada «arena» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la pelea de la arena, toda en IA, el banco de combate y el enlace de la pelea.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import { duracionDeLaJugada } from '../../../../src/client/batalla/anim.js';
import { cargaContra, rotuloDeAngulo } from '../../../../src/client/batalla/escena.js';
import { textoDePrevision } from '../../../../src/client/batalla/prevision.js';
import { nombreEnElCampo } from '../../../../src/client/render/batalla/distintivo.js';
import { centroHex, tableroPara } from '../../../../src/client/render/proyeccion.js';
import { SesionDeArena } from '../../../../src/client/sesion/sesion-de-arena.js';
import { VERSION_DEL_ENLACE } from '../../../../src/core/arena/enlace.js';
import type { HeroeDeArena } from '../../../../src/core/arena/heroe.js';
import { LADOS, ladoDe } from '../../../../src/core/arena/lados.js';
import { armaduraDe } from '../../../../src/core/battle/armas.js';
import { hexEquals } from '../../../../src/core/battle/board.js';
import type { CasillaDeCarga } from '../../../../src/core/battle/consultas.js';
import type { BattleAction, BattleStack } from '../../../../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../../../../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../../../../src/core/equipo/atado.js';
import { EQUIPO_BASE, HEROE } from '../../../../src/core/hero/cuerpo-del-heroe.js';
import { hechizosDelGremio } from '../../../../src/core/magia/catalogo.js';
import { FACTION_IDS } from '../../../../src/core/types.js';
import { UNIDADES } from '../../../../src/core/unidad/catalogo.js';
import { RUTA_DEL_CATALOGO_DE_UNIDADES, type Unidad } from '../../../../src/core/unidad/formato.js';
import { hojasDelTaller, leerCatalogo } from '../../../arena/borrador.js';
import { primeraSemillaCon } from '../../../comun/semillas.js';
import {
  abrirLaArena,
  ataqueEnLaPelea,
  bandosDichos,
  cifrasSinCortar,
  conLosCatalogosDevueltos,
  delBorrador,
  delCatalogo,
  esperarBarra,
  jugadaDeLaPauta,
  mismaPelea,
  sinElCatalogoDelJuego,
} from '../arena.js';
import { TOPE_DE_SEMILLAS } from '../escenas.js';
import {
  caja,
  captura,
  contestarEnElEspejo,
  desplegarTalCual,
  esperarCola,
  log,
  type Problemas,
  responderLaRueda,
  vigilarConsola,
} from '../pagina.js';
import { alcanzar, pixelDeUnidad } from '../pixeles.js';

// ------------------------------------------------------------------------ arena

/** El ataque que se le pone a mano al guerrero, distinto del de por defecto. */
const ATAQUE_EDITADO = 9;

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
  espejo.despliegue.listoTalCual();
  return espejo;
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
  return primeraSemillaCon(
    'una pelea de la arena en que el guerrero anda un tramo y luego golpea antes de que acabe',
    (semilla) => {
      const espejo = espejoDeLaArena(semilla);
      let tramos = 0;
      for (let jugadas = 0; jugadas < 400 && espejo.battle.finished === null; jugadas++) {
        contestarEnElEspejo(espejo);
        if (espejo.battle.finished !== null) break;
        const jugada = jugadaDeLaPauta(espejo, tramos, 0);
        if (jugada.tipo === 'golpe') {
          if (tramos > 0) return true;
          break;
        }
        if (jugada.tipo === 'tramo') {
          espejo.playBattleAction(jugada.mover);
          tramos++;
        } else espejo.playBattleAction({ type: 'end_turn' });
      }
      return undefined;
    },
    1,
    TOPE_DE_SEMILLAS,
  ).semilla;
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
export async function arena(browser: Browser, url: string, problemas: Problemas): Promise<void> {
  await conLosCatalogosDevueltos('arena', (ruta) => jugarArena(browser, url, problemas, ruta));
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
  espejo.despliegue.listoTalCual();
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
  // El orco solo se pinta a la vista (`animarFiguras` salta la figura que no se ve):
  // en 1440×900, con el editor de la muralla abierto, a los bandos y la ficha les
  // queda una franja de ~70 px —la barra lleva los selectores de la complejidad del
  // combate desde el 22-10-2026 y el editor crece con sus formas— y su tarjeta queda
  // bajo «+ Héroe». Se trae a la vista, como haría quien la mira.
  await page
    .locator('#bando-derecha button.ver[data-unidad="orko-dos-armas"]')
    .scrollIntoViewIfNeeded();
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
  // La pelea abre en el despliegue de los bandos «Yo»: se acepta tal cual.
  await desplegarTalCual(page, espejo, 'empezar la pelea', 'despliegue-03-arena');
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
  cuerpo: HEROE.combate,
  equipo: EQUIPO_BASE,
  figura: null,
  ataque: 2,
  defensa: 2,
  poder: 3,
  conocimiento: 3,
  hechizos: hechizosDelGremio(5, FACTION_IDS).map((s) => s.id),
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
  espejo.despliegue.listoTalCual();
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
 * turno, puede lanzar la Flecha mágica y, jugando la pauta, llega a golpear con una
 * carga a quien lleva armadura (el esqueleto arquero, con su jubón): la previsión más
 * larga de un golpe, la que la barra cortaba a 1024 px (#264).
 */
function buscarBanco(): number {
  return primeraSemillaCon(
    'una pelea del banco en que el héroe lanza la Flecha mágica en su primer turno y golpea cargando a quien lleva armadura',
    (semilla) => {
      const espejo = espejoDelBanco(semilla);
      const flecha = flechaDelEspejo(espejo);
      if (flecha === undefined) return undefined;
      espejo.playBattleAction(flecha);
      let tramos = 0;
      for (let jugadas = 0; jugadas < 200 && espejo.battle.finished === null; jugadas++) {
        contestarEnElEspejo(espejo);
        if (espejo.battle.finished !== null) break;
        const jugada = jugadaDeLaPauta(espejo, tramos, 0);
        if (jugada.tipo === 'golpe') return cargaDelBanco(espejo, jugada.contra) ?? undefined;
        if (jugada.tipo === 'tramo') {
          espejo.playBattleAction(jugada.mover);
          tramos++;
        } else espejo.playBattleAction({ type: 'end_turn' });
      }
      return undefined;
    },
    1,
    TOPE_DE_SEMILLAS,
  ).semilla;
}

/**
 * La carga con que el banco golpea a `contra`, si `contra` lleva armadura y se le
 * puede cargar; si no, `null`.
 */
function cargaDelBanco(espejo: SesionDeArena, contra: BattleStack): CasillaDeCarga | null {
  if (armaduraDe(contra.unit) === 0) return null;
  return espejo.battleCharges().find((c) => c.target === contra.id) ?? null;
}

/** La barra que se espera con el puntero sobre `contra` en `g`: el ángulo, la carga y la previsión. */
function barraDelGolpe(
  espejo: SesionDeArena,
  contra: BattleStack,
  accion: BattleAction,
  nombre: (id: string) => string,
): string {
  const p = espejo.prevision(accion);
  if (p === null) throw new Error('banco: el golpe no tiene previsión');
  const texto = textoDePrevision(p, nombre);
  const aqui = (espejo.turnoPropio as { stack: BattleStack }).stack.hex;
  const desdeDonde = accion.type === 'attack' ? (accion.from ?? aqui) : aqui;
  // «A distancia» (el selector de arma, 26-10-2026): la barra dice la casilla y a
  // quién daría hoy, que puede ser otro que el señalado.
  return accion.type === 'aim'
    ? `Apuntarías a (${accion.at.col},${accion.at.row}).`
    : rotuloDeAngulo(
        desdeDonde,
        cargaContra(espejo.battleCharges(), { objetivo: contra.id, elegida: desdeDonde }),
        texto,
      );
}

/** Los anchos de escritorio en que la previsión de la carga se lee entera (#264, 11-11-2026). */
const ANCHOS_DE_LA_BARRA = [
  { width: 1024, height: 768 },
  { width: 1100, height: 800 },
  { width: 1440, height: 900 },
] as const;

/**
 * La previsión de la carga contra quien lleva armadura, a 1024, 1100 y 1440 px
 * (#264): con el puntero sobre el enemigo, la barra la dice ENTERA (`exacta`: el
 * corte por frases, `ponerEnLaBarra`, no casaría), `#status` no desborda, y el
 * lienzo mide lo mismo que con el puntero fuera de toda unidad (B1: si la barra
 * creciera, el lienzo encogería bajo el cursor). Acaba a 1440, donde sigue la pasada.
 */
async function laCargaALosTresAnchos(
  page: Page,
  espejo: SesionDeArena,
  contra: BattleStack,
  carga: CasillaDeCarga,
  nombre: (id: string) => string,
): Promise<void> {
  const esLaCarga = (a: BattleAction | undefined): boolean =>
    a?.type === 'attack' && a.from !== undefined && hexEquals(a.from, carga.at);
  for (const tamano of ANCHOS_DE_LA_BARRA) {
    const que = `banco a ${tamano.width} px`;
    await page.setViewportSize(tamano);
    await sleep(300);
    const b = await caja(page);
    // Fuera de toda unidad: la esquina de arriba del lienzo.
    await page.mouse.move(b.x + 4, b.y + 4);
    await sleep(150);
    const alto = (await caja(page)).height;
    const g = await pixelDeUnidad(page, espejo, contra, esLaCarga);
    if (g.accion === undefined) throw new Error(`${que}: el clic sobre ${contra.id} no da acción`);
    await page.mouse.move(g.x - 6, g.y);
    await page.mouse.move(g.x, g.y);
    const esperado = barraDelGolpe(espejo, contra, g.accion, nombre);
    await esperarBarra(page, esperado, `${que}: la previsión de la carga`, { exacta: true });
    const barra = await page.evaluate(() => {
      const el = document.getElementById('status') as HTMLElement;
      return { scroll: el.scrollHeight, visible: el.clientHeight };
    });
    if (barra.scroll > barra.visible) {
      throw new Error(
        `${que}: la barra desborda (${barra.scroll} px de texto en ${barra.visible} px): «${esperado}»`,
      );
    }
    const altoConLaCarga = (await caja(page)).height;
    if (altoConLaCarga !== alto) {
      throw new Error(
        `${que}: el lienzo cambia de alto al pasar el ratón por el enemigo (${alto} → ${altoConLaCarga} px)`,
      );
    }
    if (tamano.width === 1024) await captura(page, 'arena-07-prevision-carga-1024');
    log(
      `${que}: la carga contra la armadura se lee entera (${barra.visible} px de barra, lienzo quieto)`,
    );
  }
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
  // La pelea abre en el despliegue de los bandos «Yo»: se acepta tal cual.
  await desplegarTalCual(page, espejo, 'empezar la pelea del banco', 'despliegue-03-arena');
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
    lanzada.damage !== prevista.impactos[0]?.danio
  ) {
    throw new Error(
      `banco: la Flecha mágica hizo ${JSON.stringify(lanzada)} y se preveía ${prevista.kind === 'hechizo' ? prevista.impactos[0]?.danio : '?'}`,
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
      const carga = cargaDelBanco(espejo, jugada.contra);
      if (carga === null) {
        throw new Error(
          `banco: el primer golpe, a ${jugada.contra.id}, no es una carga contra armadura`,
        );
      }
      await laCargaALosTresAnchos(page, espejo, jugada.contra, carga, nombre);
      const g = await pixelDeUnidad(page, espejo, jugada.contra);
      if (g.accion === undefined)
        throw new Error(`banco: el clic sobre ${jugada.contra.id} no da acción`);
      await page.mouse.move(g.x - 6, g.y);
      await page.mouse.move(g.x, g.y);
      const esperado = barraDelGolpe(espejo, jugada.contra, g.accion, nombre);
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
  if (!montado.includes(`${hechizosDelGremio(5, FACTION_IDS).length - 1} hechizos`)) {
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
