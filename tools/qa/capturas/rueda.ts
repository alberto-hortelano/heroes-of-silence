/**
 * La rueda del golpe en la arena, lo que comparten las pasadas «rueda-del-golpe» y
 * «rueda-contrincantes»: Yo contra Yo hasta que se abre la rueda, la pauta del espejo
 * jugada en la página, el relleno de un sector y su nota abierta. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */
import type { Page } from 'playwright';
import { centroHex, tableroPara } from '../../../src/client/render/proyeccion.js';
import { SesionDeArena } from '../../../src/client/sesion/sesion-de-arena.js';
import type { BattleStack } from '../../../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../../../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../../../src/core/equipo/atado.js';
import type { TipoDeGolpe } from '../../../src/core/types.js';
import {
  abrirLaArena,
  delBorrador,
  delCatalogo,
  type JugadaDeLaPauta,
  jugadaDeLaPauta,
  mismaPelea,
} from './arena.js';
import { caja, desplegarTalCual, esperarCola, RUEDA } from './pagina.js';
import { alcanzar, pixelDeUnidad } from './pixeles.js';

export const TIPOS_DE_GOLPE = RUEDA.golpes;

/**
 * Juega en la página y en el espejo un paso de la pauta que no es golpear (el
 * golpe depende del píxel que se pulsa, y cada pasada lo hace a su manera): el
 * tramo, con un clic en su casilla, o «Terminar turno». Lo comparten las pasadas
 * de la rueda.
 */
export async function ejecutarPauta(
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

/** El relleno con que se pinta el sector `tipo` en el disco de la rueda. */
export async function rellenoDelSector(page: Page, tipo: TipoDeGolpe): Promise<string> {
  return await page
    .locator(`#rueda .disco .sector[data-sector="${tipo}"]`)
    .evaluate((el) => getComputedStyle(el).fill);
}

/** ¿Está abierta la nota del sector `tipo`? La abre su `::after`. */
export async function notaAbierta(page: Page, tipo: TipoDeGolpe): Promise<boolean> {
  return await page
    .locator(`#rueda .sector-de-rueda[data-sector="${tipo}"] > .nota`)
    .evaluate((el) => {
      const d = getComputedStyle(el, '::after');
      return d.content !== 'none' && d.content !== 'normal' && d.display !== 'none';
    });
}

/**
 * La pelea de Yo contra Yo con la rueda: `n` guerreros con escudo contra `n`
 * orkos, los dos bandos «Yo». Con uno, la de «Yo contra Yo»; con tres iguales por
 * bando, la de los contrincantes, en la que la cabecera enseña la figura (#261).
 */
export function espejoYoContraYo(semilla: number, n: number): SesionDeArena {
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
  espejo.despliegue.listoTalCual();
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
export async function hastaLaRuedaYoContraYo(
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
  // La pelea abre en el despliegue de los bandos «Yo»: se acepta tal cual.
  await desplegarTalCual(page, espejo, `${quien}: empezar`, 'despliegue-03-arena');
  await esperarCola(espejo.battle, espejo.battle.log);
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
