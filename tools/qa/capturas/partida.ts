/**
 * La partida en la página: abrirla en escritorio o en el móvil (`abrir`, `Pasada`, las
 * cajas medidas y la semilla del móvil), salir de la base de arranque, pasar el día y el turno
 * del rival en el espejo, jugar un turno de batalla de dos tramos y ataque, y buscar una
 * guardia o una patrulla a la vista. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import { DURACION } from '../../../src/client/batalla/anim.js';
import { cargaContra, rotuloDeAngulo } from '../../../src/client/batalla/escena.js';
import { textoDePrevision } from '../../../src/client/batalla/prevision.js';
import { nombreEnElCampo } from '../../../src/client/render/batalla/distintivo.js';
import { cajaDeFigura } from '../../../src/client/render/batalla/figura.js';
import { msPorCasilla } from '../../../src/client/render/figuras/marcha.js';
import { ALTO_DEL_GRUPO } from '../../../src/client/render/mapa/asaltantes.js';
import { centroDeStack, centroHex, tableroPara } from '../../../src/client/render/proyeccion.js';
import { Session } from '../../../src/client/sesion/partida.js';
import { AVISO_DE_ESPERA } from '../../../src/client/views/cifras.js';
import { rotuloDeDia } from '../../../src/client/views/notas.js';
import { chooseBattleAction } from '../../../src/core/ai/tactics.js';
import { hexEquals, quedanCasillas } from '../../../src/core/battle/board.js';
import { isAlive, mismoTurno, stackHexes } from '../../../src/core/battle/consultas.js';
import type {
  BattleAction,
  BattleEvent,
  BattleStack,
  BattleState,
} from '../../../src/core/battle/types.js';
import { regionDeCasilla } from '../../../src/core/map/regiones.js';
import { pasosDeLaPatrulla } from '../../../src/core/state/asaltantes.js';
import { visibleNow } from '../../../src/core/state/vision.js';
import type { Point } from '../../../src/core/types.js';
import { esperarElSuelo } from '../../comun/navegador.js';
import { urlDePartida } from '../navegador/url-de-partida.js';
import {
  buscarMovil,
  type Caja,
  guardiaEnElMarco,
  type PlanDeAngulo,
  planDeAngulo,
  RUEDA_DE_LA_PATRULLA,
  tocable,
} from './escenas.js';
import {
  caja,
  captura,
  comprobar,
  conLosIconosDeLaBarra,
  desplegarTalCual,
  esperarCola,
  log,
  type Problemas,
  responderLaRueda,
  vigilarConsola,
} from './pagina.js';
import {
  aceptarElAviso,
  alcanzar,
  escenaDelEspejo,
  Mapa,
  pixelDeUnidad,
  pixelesDelLienzo,
} from './pixeles.js';

/**
 * «Fin de turno» del espejo, ya pulsado en la página. Si el rival ataca a la
 * persona por el camino (#116, F5), la defensa la juega ella: se resuelve sola en
 * la página y en el espejo (`defenderseSola`) y el turno del rival sigue, las veces
 * que haga falta. Antes la pasada decía que no jugaba defensas y paraba, y desde
 * que el juego pelea con los ejércitos de la arena el rival ataca la base de la
 * pasada de escritorio el día 3 (19-10-2026).
 */
export async function pasarElTurnoDelEspejo(
  page: Page,
  espejo: Session,
  donde: string,
): Promise<void> {
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
  // Antes de la batalla, el aviso en el mapa centrado en el ataque: «Defender».
  await aceptarElAviso(page, espejo, donde);
  await page.locator('#app[data-escena="battle"]').waitFor({ timeout: 20_000 });
  // Con el héroe en un sitio suyo con guarnición, antes se elige con quién defiende
  // (puesto fronterizo, 04-11-2026): se fotografía la pantalla y se deja lo que
  // propone la IA, en la página y en el espejo.
  if (espejo.defensa !== null) {
    await page.locator('#defensa[open]').waitFor({ timeout: 20_000 });
    await captura(page, 'defensa-elegida');
    await page.locator('#defensa [data-action="defensa-de-la-ia"]').click();
    espejo.dejarLaDefensaDeLaIA();
    await page
      .locator('#defensa[open]')
      .waitFor({ state: 'detached', timeout: 10_000 })
      .catch(async () => {
        if (await page.locator('#defensa[open]').count()) {
          throw new Error(`${donde}: la pantalla de la defensa no se cierra`);
        }
      });
    log(`${donde}: atacado en su sitio, defiende con lo que propone la IA`);
  }
  // La batalla ya montada, también si la defensa la rehizo.
  const enCurso = espejo.battle;
  if (enCurso === null) throw new Error(`${donde}: la defensa se quedó sin batalla`);
  // La defensa abre en el despliegue, sin ver al rival: «Listo» y, como antes, la
  // IA mueve si la iniciativa es suya. La primera vez se captura.
  await desplegarTalCual(page, espejo, donde, 'despliegue-02-defensor');
  await responderLaRueda(page, espejo);
  await esperarCola(enCurso, enCurso.log);
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
export async function pasarDia(page: Page, espejo: Session): Promise<void> {
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
export async function turnoDeBatalla(
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
    const danioPrevisto = prevista.impactos[0]?.danio ?? null;
    if (danioPrevisto !== null && (lanzado?.kind !== 'cast' || lanzado.damage !== danioPrevisto)) {
      throw new Error(
        `${hechizo.id} hizo ${JSON.stringify(lanzado)} y la previsión decía ${danioPrevisto}`,
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
  // En el móvil el marco puede no estar a la vista: el último gesto fue un botón del
  // panel («Terminar turno»), que va debajo del tablero, y pulsarlo desplazó `#stage`
  // hasta él (el marco quedaba a −469 px y el clic caía fuera de la página). Se trae
  // a la vista, como quien sube a tocar el tablero.
  await page.locator('#lienzo').scrollIntoViewIfNeeded();
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

/**
 * La caja del lienzo de escritorio, medida en una página de verdad: lo que una
 * búsqueda en el espejo llama «a la vista» depende de ella, y la partida no la
 * cambia (`abrir` lo comprueba con `esperada`). Se mide una vez por corrida.
 */
let cajaMedida: Promise<Caja> | null = null;
export function cajaDeEscritorio(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<Caja> {
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
export function cajaDeMovil(browser: Browser, url: string, problemas: Problemas): Promise<Caja> {
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
export function semillaDelMovil(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<number> {
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
export async function salirDeLaBase(
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
export async function abrir(
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
export async function estadoDelArranque(page: Page): Promise<{
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
export async function guardiaALaVista(
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
export async function mirarGuardia(mapa: Mapa, guardia: Point): Promise<Point> {
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
 *
 * **Desde la niebla de eventos** (02-11-2026) un grupo se ve solo en el radio de
 * los héroes, castillos y nodos de quien juega y sobre lo explorado, no por su
 * región (#130). Los que caen ahí suelen patrullar la región donde está el héroe,
 * y un grupo con un héroe en su región que no se cree capaz con él se aparta a su
 * casilla más lejana y se queda en ella día tras día (`pasoDePatrulla`): en la s22
 * de la pasada de escritorio, ninguno a la vista se movía en cuatro días. Por eso,
 * tras un día sin que se mueva ninguno, de los que la persona ve (descubierto el
 * mapa, todos), si ninguno de los que patrullan una región sin héroe cae en la
 * pantalla, la cámara va a uno (`Mapa.mirar`), como la arrastraría quien juega
 * para mirarlo. El primer día no se mueve: la pasada sin arte busca su semilla
 * con la cámara en el héroe (`buscarSinArte`).
 */
export async function patrullaALaVista(
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
  let quieto = false;
  for (let intento = 0; intento < 4 && espejo.state.finished === null; intento++) {
    // Lo que se ve de cada grupo hoy, y el lienzo alrededor: lo más que anda
    // mañana (`pasosDeLaPatrulla`: 2 o 3 en el 42×42, #229).
    const alcance = pasosDeLaPatrulla(espejo.state.day + 1);
    const libres = espejo
      .asaltantesALaVista()
      .filter(
        (r) =>
          !espejo.state.heroes.some(
            (h) =>
              regionDeCasilla(espejo.state.map, h.at) === regionDeCasilla(espejo.state.map, r.at),
          ),
      );
    if (quieto && libres.length > 0) {
      const enPantalla = await Promise.all(libres.map(async (r) => dentro(await mapa.pixel(r.at))));
      if (!enPantalla.some(Boolean)) {
        const r = libres[0]!;
        await mapa.mirar(r.at);
        await sleep(600);
        log(
          `${prefijo}: la cámara va a ${r.id} en (${r.at.x},${r.at.y}), que patrulla una región sin héroe`,
        );
      }
    }
    const antes = new Map<string, number[]>();
    const posiciones = new Map(espejo.state.raiders.map((r) => [r.id, { ...r.at }]));
    // Solo cuenta un grupo que se ve hoy y mañana: uno en lo explorado pero
    // fuera de la vista no se pinta (s2 con los mapas de #224, raider-5).
    const vistosAyer = new Set(espejo.asaltantesALaVista().map((r) => r.id));
    // Solo los que la persona ve: con la niebla de eventos (02-11-2026) uno de lo
    // explorado fuera del radio no se pinta, y mirarlo gastaba un día en balde
    // (s22: el día 2 había 49 muestras y ninguno a la vista).
    for (const r of espejo.state.raiders) {
      if (!vistosAyer.has(r.id) || !explorada(r.at) || !dentro(await mapa.pixel(r.at))) continue;
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
      // Ninguno a la vista en la pantalla: se descubre el mapa con el botón
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
      // Los que ve la persona, con la regla del núcleo (su casilla en el radio
      // sobre lo explorado, 02-11-2026).
      const aLaVista = espejo.asaltantesALaVista();
      await page.getByRole('button', { name: 'Ver mapa entero' }).click();
      espejo.revealAll = true;
      await sleep(200);
      log(
        `${prefijo}: ningún asaltante a la vista en la pantalla (${aLaVista.length} a la vista de la persona, ` +
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
      quieto = true;
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
