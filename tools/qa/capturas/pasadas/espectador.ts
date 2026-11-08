/**
 * La pasada «espectador» de `pnpm capturas` (la tabla `PASADAS`, en `../main.ts`): el espectador mirando la partida del servidor.
 * Aquí va lo suyo, lo que no comparte con ninguna otra pasada. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'playwright';
import WebSocket from 'ws';
import type {
  AgentHelloMsg,
  AgentResponseMsg,
  ServerToAgentMsg,
} from '../../../../src/server/protocol.js';
import { mensajeDe } from '../../../../src/shared/errores.js';
import { esperarElSuelo } from '../../../comun/navegador.js';
import { entornoDelArnes, semillaDelEspectador } from '../../agente/partida-del-arnes.js';
import { decidir } from '../../agente/politica.js';
import { arrancarServidor, type ServidorDePartida } from '../../agente/servidor.js';
import { captura, log, type Problemas, vigilarConsola } from '../pagina.js';

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
export async function espectador(
  browser: Browser,
  url: string,
  problemas: Problemas,
): Promise<void> {
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
      { entrada: 'tools/qa/agente/partida-con-veterano.ts' },
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
                heroeSinVer = mensajeDe(err);
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
