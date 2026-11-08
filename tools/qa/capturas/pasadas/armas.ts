/**
 * La pasada «armas» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): el selector de arma del tirador.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import type { Browser } from 'playwright';
import { SesionDeArena } from '../../../../src/client/sesion/sesion-de-arena.js';
import { dichoDeLasCifras } from '../../../../src/core/battle/carga.js';
import { isAlive } from '../../../../src/core/battle/consultas.js';
import { armasDe } from '../../../../src/core/battle/damage.js';
import type { BattleStack } from '../../../../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../../../../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../../../../src/core/equipo/atado.js';
import { unidad, unidadDelJuego } from '../../../../src/core/unidad/catalogo.js';
import type { Unidad } from '../../../../src/core/unidad/formato.js';
import {
  abrirLaArena,
  asentada,
  cifrasSinCortar,
  conLosCatalogosDevueltos,
  delBorrador,
  delCatalogo,
  esperarBarra,
  mismaPelea,
} from '../arena.js';
import { TOPE_DE_SEMILLAS } from '../escenas.js';
import {
  captura,
  contestarEnElEspejo,
  desplegarTalCual,
  esperarCola,
  log,
  type Problemas,
  responderLaRueda,
  vigilarConsola,
} from '../pagina.js';
import { pixelDeUnidad } from '../pixeles.js';

// ------------------------------------------------------------- cada arma para lo suyo

/**
 * La pelea de las armas en el espejo (13-10-2026): el arquero élfico de la persona
 * —su arma de cuerpo a cuerpo, arco y jubón— contra el orco con dos armas de la IA,
 * que viene a por él.
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
  /Contraataque con Espada y Lanza de jinete \(cuerpo a cuerpo\)(, si sobrevive)?: /;

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
  espejo.despliegue.listoTalCual();
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

/**
 * Con qué pega cuerpo a cuerpo el arquero élfico: el arma de su hueco `arma` en el
 * catálogo, no su arco. Era la Daga hasta que el usuario le puso la Espada desde la
 * arena (02-11-2026, `0f715185`), y la pasada la tenía escrita a mano.
 */
function armaDelArquero(): string {
  const arma = unidad('elfo-arquero').equipo.arma;
  if (arma === undefined)
    throw new Error('armas: el arquero élfico no lleva arma de cuerpo a cuerpo');
  return EQUIPO_DEL_JUEGO.pieza(arma).nombre;
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
 * tres armas; y en la pelea, con el orco pegado, el arquero pega con su arma de cuerpo
 * a cuerpo (`armaDelArquero`), no con el arco —la barra dice con cuál antes del clic, y
 * lo que pasa es lo del espejo—.
 */
export async function armasEnLaArena(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
  await conLosCatalogosDevueltos('armas', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    vigilarConsola(page, 'armas', problemas);
    const semilla = buscarArmas();
    log(`armas: semilla ${semilla}, buscada en el espejo`);
    await abrirLaArena(page, url, `?seed=${semilla}`);

    // La ficha del jinete élfico: espada y lanza (lo mejor de las dos) y arco, cada
    // golpe con lo suyo y su agilidad entera sobre el caballo de guerra; la carga,
    // con la fuerza del caballo más la de la lanza (26-10-2026). Las cifras son las
    // del núcleo (`armasDe`), como la del golpe del arquero, abajo: escritas a mano
    // («Daño 10–50», «20–100») se quedaron atrás cuando el usuario retocó el
    // catálogo desde la arena (02-11-2026, `0f715185`).
    await page.locator('[data-unidad-catalogo="elfo-jinete"] [data-lado="izquierda"]').click();
    await page.locator('#bando-izquierda button.ver[data-unidad="elfo-jinete"]').click();
    const filas = page.locator('#ficha .armas-de-la-ficha [data-arma-de-la-ficha]');
    await filas.first().waitFor({ timeout: 2000 });
    const dichas = (await filas.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    const [cuerpo, distancia, carga] = armasDe(unidadDelJuego('elfo-jinete'));
    if (cuerpo?.uso !== 'arma' || distancia?.uso !== 'distancia' || carga?.montada !== true)
      throw new Error('armas: el jinete élfico ya no pega, dispara y carga montado');
    const cifras = (a: { attack: number; damage: readonly number[] }): string =>
      `Ataque ${a.attack} · Daño ${a.damage[0]}–${a.damage[1]}`;
    const esperadas = [
      `Cuerpo a cuerpo ⓘ Espada y Lanza de jinete · ${cifras(cuerpo)}`,
      `A distancia ⓘ Arco · ${cifras(distancia)}`,
      `Carga ⓘ Espada y Lanza de jinete · ${cifras(carga)} · +5 %/casilla (3 a 5), montada`,
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
    // A pie también carga (#260): la lanza se usa, con lo que cobra todo el que pega.
    // Lo que cobra se dice sin «a pie» desde la montura (26-10-2026, `fa0a6e9c`): solo
    // la montada lo dice («, montada»).
    if (
      !dichaLanza.startsWith('Carga ⓘ Espada y Lanza de jinete · Ataque ') ||
      !dichaLanza.endsWith(` · ${dichoDeLasCifras(false)}`)
    ) {
      throw new Error(`armas: la ficha del orco con lanza dice «${dichaLanza}»`);
    }
    const espejo = espejoDeLasArmas(semilla);
    await page.locator('[data-arena="luchar"]').click();
    await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 2000 });
    await esperarCola(espejo.battle, espejo.battle.log);
    // La pelea abre en el despliegue de los bandos «Yo»: se acepta tal cual.
    await desplegarTalCual(page, espejo, 'armas: empezar la pelea', 'despliegue-03-arena');
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
        const conQue = `Cuenta: con ${armaDelArquero()} (cuerpo a cuerpo)`;
        await page.mouse.move(px.x - 6, px.y);
        await page.mouse.move(px.x, px.y);
        await esperarBarra(page, conQue, `armas: apuntar ${j.tipo}`, { exacta: false });
        // Y con qué le devuelven el golpe: el arma de cuerpo a cuerpo del orco.
        const barra = await page.locator('#status').innerText();
        if (!CONTRAATAQUE_DEL_ORCO.test(barra)) {
          throw new Error(`armas: la barra no nombra el arma del contraataque: «${barra}»`);
        }
        log('armas: la barra nombra el arma del contraataque (Espada y Lanza de jinete)');
        await captura(page, 'arena-17-pega-cuerpo-a-cuerpo');
        await page.mouse.click(px.x, px.y);
        espejo.playBattleAction(px.accion);
        // El golpe pasa por la rueda (el juego la lleva siempre).
        await responderLaRueda(page, espejo);
        // Lo que hace, con las cifras del arma: el daño cae en su horquilla.
        const hecho = espejo.battle.log
          .slice(antes)
          .find((e) => e.kind === 'attack' && e.stack !== j.contra.id);
        const arquero = espejo.battle.stacks.find((x) => x.side !== j.contra.side) as BattleStack;
        const fila = armasDe(arquero.unit).find((a) => a.uso === 'arma');
        if (hecho === undefined || fila === undefined)
          throw new Error(`armas: el ${j.tipo} no se ve en el parte`);
        if (fila.arma !== armaDelArquero())
          throw new Error(`armas: el ${j.tipo} va con ${fila.arma}, no con ${armaDelArquero()}`);
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
