/**
 * La pasada «poderes» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): los poderes de unidad en la arena.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import type { Browser, Page } from 'playwright';
import { nombreEnElCampo } from '../../../../src/client/render/batalla/distintivo.js';
import { SesionDeArena } from '../../../../src/client/sesion/sesion-de-arena.js';
import { heroePorDefecto } from '../../../../src/core/arena/heroe.js';
import type { BattleAction, BattleStack } from '../../../../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../../../../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../../../../src/core/equipo/atado.js';
import { ESCALA_DE_CIFRAS } from '../../../../src/core/escala.js';
import {
  abrirLaArena,
  cifrasSinCortar,
  conLosCatalogosDevueltos,
  delBorrador,
  delCatalogo,
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

// ------------------------------------------------- poderes y edición en combate

/**
 * La vida del monje en la pasada de los poderes: con la de salida el orco lo
 * tumba de un golpe (lo prefiere: es lo más frágil) y no llega a curar a nadie.
 * 30 en la escala de fheroes2, a la de las cifras como todo.
 */
const VIDA_DEL_MONJE = 30 * ESCALA_DE_CIFRAS;

/**
 * La pelea de los poderes en el espejo: el monje templario (Curar),
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
  espejo.despliegue.listoTalCual();
  return espejo;
}

/**
 * Lo que la persona hace en su turno de la pelea de los poderes: con el monje,
 * el primer turno mirar que Curar sale apagado (nadie tiene herida) y terminar, y
 * después Curar en cuanto haya un solo herido; con lo demás, «Terminar turno».
 * (Bendecir, que se apuntaba con varios aliados posibles, se fue con la suerte,
 * 02-11-2026.)
 */
type PasoDeLosPoderes =
  | { readonly tipo: 'primero' }
  | { readonly tipo: 'curar'; readonly accion: BattleAction }
  | { readonly tipo: 'terminar' };

function pasoDeLosPoderes(espejo: SesionDeArena, visto: boolean): PasoDeLosPoderes {
  const turno = espejo.turnoPropio;
  if (turno === null) throw new Error('poderes: el espejo devuelve el control sin turno propio');
  if (turno.stack.body !== 'templario-monje') return { tipo: 'terminar' };
  if (!visto) return { tipo: 'primero' };
  const curas = espejo
    .battleLegalActions()
    .filter((a) => a.type === 'power' && a.poder === 'curar');
  // Con un solo herido el botón cura ya; con dos habría que apuntar.
  if (curas.length === 1) return { tipo: 'curar', accion: curas[0] as BattleAction };
  return { tipo: 'terminar' };
}

/**
 * La semilla de la pelea de los poderes: la primera en la que, jugando la pauta,
 * el monje cura a un solo herido tras su primer turno y la pelea sigue con un
 * turno de la persona después, para editar en plena pelea.
 */
function buscarPoderes(): number {
  for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS; semilla++) {
    const espejo = espejoDeLosPoderes(semilla);
    let visto = false;
    for (let jugadas = 0; jugadas < 300 && espejo.battle.finished === null; jugadas++) {
      contestarEnElEspejo(espejo);
      if (espejo.battle.finished !== null) break;
      const paso = pasoDeLosPoderes(espejo, visto);
      if (paso.tipo === 'curar') {
        espejo.playBattleAction(paso.accion);
        contestarEnElEspejo(espejo);
        if (espejo.turnoPropio !== null) return semilla;
        break;
      }
      if (paso.tipo === 'primero') visto = true;
      espejo.playBattleAction({ type: 'end_turn' });
    }
  }
  throw new Error(
    `poderes: en las semillas 1–${TOPE_DE_SEMILLAS} el monje no cura antes de que acabe la pelea`,
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
 * mientras nadie tiene herida; Curar cura al herido; «Editar» en la fila del orco abre
 * su ficha en un diálogo, un daño imposible no entra y lo dice, un ataque +5 sí
 * entra; el héroe, con más Conocimiento, tiene más maná; cerrar devuelve la
 * misma ronda y la misma activa, y lo que se juega después es lo del espejo, que
 * recibe los mismos cambios.
 */
export async function poderesEnLaArena(
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
      .locator(`#ficha [data-poder-de-la-ficha="curar"] .nota[aria-label*="cura 12 PV"]`)
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
    // La pelea abre en el despliegue de los bandos «Yo»: se acepta tal cual.
    await desplegarTalCual(page, espejo, 'empezar la pelea de los poderes', 'despliegue-03-arena');
    await esperarCola(espejo.battle, espejo.battle.log);
    await mismaPelea(page, espejo, 'empezar la pelea de los poderes');

    let visto = false;
    let curado = false;
    for (let jugadas = 0; !curado; jugadas++) {
      if (jugadas > 300 || espejo.battle.finished !== null) {
        throw new Error('poderes: la pelea se acaba sin que el monje cure');
      }
      const antes = espejo.battle.log.length;
      // La golpearon al cerrar su turno: primero, su respuesta en la rueda.
      await responderLaRueda(page, espejo);
      if (espejo.battle.finished !== null) {
        throw new Error('poderes: la pelea se acaba sin que el monje cure');
      }
      const paso = pasoDeLosPoderes(espejo, visto);
      if (paso.tipo === 'primero') {
        // Curar, apagado y diciendo por qué: aún no hay heridos.
        const curar = page.locator('#side [data-action="battle-poder"][data-poder="curar"]');
        const motivo = espejo.motivoDePoder('curar');
        if (motivo === null || (await curar.getAttribute('title')) !== motivo) {
          throw new Error(
            `poderes: «Curar» debía salir apagado con «${motivo}» y dice «${await curar.getAttribute('title')}»`,
          );
        }
        await captura(page, 'poderes-01-turno-del-monje');
        await page.getByRole('button', { name: 'Terminar turno' }).click();
        espejo.playBattleAction({ type: 'end_turn' });
        visto = true;
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
    await parteDice(page, `usa Curar sobre ${nombre(cura.target ?? '')}: cura ${cura.cura} PV`);
    await captura(page, 'poderes-03-curado');
    log(`poderes: cura ${cura.cura} PV a ${nombre(cura.target ?? '')}`);

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
