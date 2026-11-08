/**
 * La pasada «escritorio» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): la partida en escritorio: la base, la ruta de dos días, la guardia, la batalla y el final.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import { dondeHablarCon } from '../../../../src/client/partida/base/escena.js';
import { explicacionDeFin } from '../../../../src/client/partida/mapa/panel.js';
import { camaraDeLaBase, camaraQuieta } from '../../../../src/client/render/base/camara.js';
import { cajaDeFiguraEn } from '../../../../src/client/render/figuras/caja.js';
import { pasosAPintar } from '../../../../src/client/render/mapa/ruta.js';
import type { Tablero } from '../../../../src/client/render/proyeccion.js';
import type { Session } from '../../../../src/client/sesion/partida.js';
import { rotuloDeDia } from '../../../../src/client/views/notas.js';
import { queEs } from '../../../../src/core/battle/types.js';
import { nombreDeTipoDeHeroe } from '../../../../src/core/hero/tipos-de-heroe.js';
import { baseOf, heroesOf } from '../../../../src/core/state/consultas.js';
import type { Plano } from '../../../../src/shared/arte.js';
import {
  type Disposicion,
  disposicionDe,
  FONDO_DE_LA_FRANJA,
} from '../../../../src/shared/base.js';
import {
  elSuelo,
  entrarEnLaMorada,
  esperarLaBase,
  laPuerta,
  pulsarEnLaBase,
  pulsarEnLaMorada,
  salirDeLaMorada,
} from '../base.js';
import {
  buscarEscritorio,
  RUEDA_DEL_ESCRITORIO,
  reclutaDeNivel1,
  rutaDeDosColores,
} from '../escenas.js';
import { caja, captura, comprobar, esperarCola, exigir, log, type Problemas } from '../pagina.js';
import {
  abrir,
  cajaDeEscritorio,
  estadoDelArranque,
  guardiaALaVista,
  pasarDia,
  pasarElTurnoDelEspejo,
  patrullaALaVista,
  turnoDeBatalla,
} from '../partida.js';
import { type Mapa, pixelesDelLienzo } from '../pixeles.js';

/** El medio del cuerpo de una figura de pie en `en`. */
const laFigura =
  (en: Plano) =>
  (t: Tablero): { x: number; y: number } => {
    const c = cajaDeFiguraEn(t, en);
    return { x: c.x, y: c.suelo - c.alto / 2 };
  };

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

export async function jugarEscritorio(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
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
    // ni uno (`motivoParaNoReclutar`): sin `title`, que en el móvil no se ve. Es un
    // rechazo: `motivoDelRechazo`, en su color (R2 de la reorganización).
    const escrito = page.locator('#side .ficha-de-la-morada .motivo');
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
