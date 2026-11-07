/**
 * Una batalla del cliente en la que la persona ATACA a un monstruo con turno
 * propio, para los tests de la escena de batalla y del ángulo.
 *
 * Antes era una semilla y una casilla escritas a mano —la 2 en (12,3), luego la
 * 35 en (8,9)— y cada cambio del generador las rompía: el mapa de 28 y los
 * asaltantes se llevaron la primera, y las fronteras gruesas y los obstáculos de
 * «mapas densos» la segunda. Ahora se **busca**: la primera semilla con un
 * monstruo que pelea cuerpo a cuerpo y al que el héroe llega el día 1 sin que
 * lo embosquen por el camino.
 * Lo que los tests miran es la batalla, no el mapa, así que da igual cuál salga.
 *
 * Y la batalla de la arena en el cliente (de `test/helpers.ts`, fase T de la
 * reorganización, 06-11-2026): la sesión con unidades del borrador
 * (`sesionDeArena`, `empezarTalCual`), la escena de batalla (`escenaDeBatalla`),
 * la rueda jugada hasta que pide algo (`hastaLaRueda`, `unoDeLaRueda`) y lo que se
 * pinta del desenlace de un cruce y de «En el campo».
 */
import { type FotoDeEfectos, fotoDeEfectos } from '../src/client/anim.js';
import { EscenaBatalla } from '../src/client/escenas/batalla.js';
import { marcadoDe } from '../src/client/html.js';
import { type CaraDeLosContrincantes, renderDesenlace } from '../src/client/rueda/rueda.js';
import { type ControlDeBatalla, SesionDeArena, Session } from '../src/client/session.js';
import { hexDistance } from '../src/core/battle/board.js';
import { formaDeLaBatalla, golpeNeutro } from '../src/core/battle/formas-de-la-rueda.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import type { HechoDelCruce } from '../src/core/battle/rueda.js';
import type { BattleState, MurallaDeBatalla } from '../src/core/battle/types.js';
import type { ReglasDelCombate } from '../src/core/combate.js';
import { objectAt } from '../src/core/map/map.js';
import type { Point, TipoDeGolpe } from '../src/core/types.js';
import { delBorrador, MONTAJE, type PuestoDeLaPelea } from './pelea-de-arena.js';

/** Cómo se abre la sesión: la complejidad del combate y «Solo la rueda del héroe». */
interface ComoSeJuega {
  readonly combate?: ReglasDelCombate;
  readonly soloRuedaDelHeroe?: boolean;
}

let hallada: { readonly semilla: number; readonly at: Point } | null = null;

function abrir(semilla: number, at: Point, como: ComoSeJuega = {}): Session | null {
  const s = new Session(semilla, undefined, undefined, como.combate, como.soloRuedaDelHeroe);
  s.clickTile(at);
  // Los tests de la escena miran la batalla ya empezada: «Listo» tal cual.
  s.despliegue.listoTalCual();
  if (s.battle === null || s.turnoPropio === null) return null;
  return s.state.pendingBattle?.attacker.kind === 'hero' ? s : null;
}

/**
 * Una sesión nueva, recién entrada en la batalla: cada llamada da la suya. Con
 * `como`, la misma batalla con otra rueda o con «Solo la rueda del héroe» (el mapa
 * no depende de la complejidad; con otro tope de tropa, el monstruo sería otro, y
 * la búsqueda es con el de siempre).
 */
export function sesionContraMonstruo(como: ComoSeJuega = {}): Session {
  if (hallada === null) {
    for (const { semilla, at } of sesionesContraMonstruo()) {
      hallada = { semilla, at };
      break;
    }
  }
  if (hallada !== null) {
    const s = abrir(hallada.semilla, hallada.at, como);
    if (s === null)
      throw new Error('la batalla hallada no se repite: la sesión no es determinista');
    return s;
  }
  throw new Error('ninguna de 200 semillas abre el día 1 una batalla contra un monstruo');
}

/**
 * La misma batalla, recién abierta y aún en el despliegue de la persona (fase de
 * despliegue, 02-11-2026): para los tests que miran el despliegue.
 */
export function sesionContraMonstruoAlDesplegar(): Session {
  sesionContraMonstruo();
  if (hallada === null) throw new Error('sin batalla hallada');
  const s = new Session(hallada.semilla);
  s.clickTile(hallada.at);
  if (s.battle === null) throw new Error('la batalla hallada no se repite');
  return s;
}

/**
 * La sesión de esa batalla antes de abrirla, en el mapa, con la casilla del
 * monstruo: para los tests que tocan algo del héroe (su formación) y luego atacan.
 */
export function sesionAntesDelMonstruo(): { readonly s: Session; readonly at: Point } {
  sesionContraMonstruo();
  if (hallada === null) throw new Error('sin batalla hallada');
  return { s: new Session(hallada.semilla), at: hallada.at };
}

/**
 * Todas las batallas de ese tipo, en orden de semilla: para el test que busca
 * una situación concreta dentro de la batalla y no la encuentra en la primera.
 */
export function* sesionesContraMonstruo(): Generator<{
  readonly semilla: number;
  readonly at: Point;
  readonly s: Session;
}> {
  for (let semilla = 1; semilla <= 200; semilla++) {
    // Con la sesión de la semilla se descarta lo que no se alcanza hoy o pasa
    // por una emboscada; solo se abre una sesión nueva para lo que queda.
    const vista = new Session(semilla);
    for (const o of vista.state.map.objects) {
      if (o.kind !== 'monster') continue;
      const ruta = vista.previewPath(o.at);
      if (ruta.length === 0 || !ruta.every((paso) => paso.hoy && !paso.peligro)) continue;
      const s = abrir(semilla, o.at);
      if (s !== null) yield { semilla, at: o.at, s };
    }
  }
}

/**
 * Una casilla a la que el héroe seleccionado llega HOY, a dos pasos o más, sin
 * objeto y —salvo que se pida lo contrario— sin emboscada en la ruta: donde
 * mandar un toque o un ratón. Era la (6,6) escrita a mano, y con obstáculos que
 * bloquean puede ser un bosque. El test que comprueba que una ruta sin
 * emboscada no avisa la pide con `sinPeligro = false`: si no, la búsqueda ya
 * habría quitado lo que el test quiere ver.
 */
export function destinoDeHoy(s: Session, sinPeligro = true): Point {
  const h = s.selectedHero;
  if (h === null) throw new Error('la sesión no tiene héroe seleccionado');
  for (let d = 2; d <= 6; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const p = { x: h.at.x + dx, y: h.at.y + dy };
        if (objectAt(s.state.map, p) !== undefined) continue;
        const ruta = s.previewPath(p);
        if (ruta.length >= 2 && ruta.every((paso) => paso.hoy && (!sinPeligro || !paso.peligro)))
          return p;
      }
    }
  }
  throw new Error(`nada a menos de 6 casillas de (${h.at.x},${h.at.y}) se alcanza hoy sin peligro`);
}

/** El primer cruce de la rueda del registro de `b`; lanza si no hay ninguno. */
function primerCruce(b: BattleState): HechoDelCruce {
  const e = b.log.find((x) => x.kind === 'cruce');
  if (e?.kind !== 'cruce') throw new Error('sin cruce en el registro');
  return e;
}

/**
 * El desenlace del primer cruce de `b`, pintado sin animador (`renderDesenlace`):
 * con `cara` y con lo que llevaba colgado cada uno antes del cruce, `efectos`
 * (por defecto, lo de ahora: `fotoDeEfectos`, la del animador).
 */
export function desenlaceDe(
  b: BattleState,
  cara: CaraDeLosContrincantes | null = null,
  efectos: FotoDeEfectos = fotoDeEfectos(b),
): string {
  return marcadoDe(renderDesenlace(b, { evento: primerCruce(b), efectos }, null, cara));
}

/** Lo que pone «En el campo» en el marcado de un lateral (de su título al del parte). */
export function enElCampo(m: string): string {
  return m.slice(m.indexOf('<h3>En el campo</h3>'), m.indexOf('<h3>Parte de guerra</h3>'));
}

/**
 * Empieza la pelea de la arena y acepta el despliegue de los bandos «Yo» tal como
 * sale (la regla de hoy): los tests que miran la pelea la quieren ya empezada,
 * como antes de la fase de despliegue (02-11-2026). La que mira el despliegue
 * llama a `empezar` y coloca.
 */
export function empezarTalCual(s: SesionDeArena): void {
  s.empezar();
  s.despliegue.listoTalCual();
}

/** La escena de batalla de la sesión, encuadrada y con su primera lectura hecha, que no anima. */
export function escenaDeBatalla(sesion: () => ControlDeBatalla): EscenaBatalla {
  const escena = new EscenaBatalla(sesion);
  escena.encuadrar(1086, 778);
  escena.sincronizar(0);
  return escena;
}

/**
 * Una sesión de la arena con unidades del borrador, sin héroes, sin empezar. Quién
 * mueve va en cada puesto por comodidad, pero la sesión mueve cada bando entero:
 * un bando con puestos de los dos es un error del test. En `o`, la muralla del
 * tablero.
 */
export function sesionDeArena(
  izquierda: readonly (PuestoDeLaPelea & { readonly ia: boolean })[],
  derecha: readonly (PuestoDeLaPelea & { readonly ia: boolean })[],
  semilla: number,
  o: { readonly muralla?: MurallaDeBatalla; readonly combate?: ReglasDelCombate } = {},
): SesionDeArena {
  const lado = (puestos: readonly (PuestoDeLaPelea & { readonly ia: boolean })[]) => {
    const ia = puestos.every((p) => p.ia);
    if (puestos.some((p) => p.ia !== ia)) throw new Error('la sesión mueve cada bando entero');
    return {
      unidades: puestos.map(({ unidad, escalera }) => delBorrador(unidad, escalera === true)),
      heroe: null,
      ia,
    };
  };
  return new SesionDeArena(
    {
      izquierda: lado(izquierda),
      derecha: lado(derecha),
      ...MONTAJE,
      combate: o.combate ?? MONTAJE.combate,
      muralla: o.muralla ?? SIN_MURALLA,
    },
    semilla,
  );
}

/**
 * Un tipo que vale en la rueda de `battle`, para los bucles que la contestan por
 * contestarla: Normal si la lleva (lo de siempre en estas pruebas); en la de 3, el
 * primero de su anillo. Con `'normal'` a mano, un bucle con la rueda de 3 se
 * quedaba contestando un tipo que no es suyo.
 */
export function unoDeLaRueda(battle: { readonly rueda: BattleState['rueda'] }): TipoDeGolpe {
  const forma = formaDeLaBatalla(battle);
  return golpeNeutro(forma) ?? (forma.golpes[0] as TipoDeGolpe);
}

/**
 * Juega la sesión hasta que la rueda le pide algo a la persona (`fase`, si se
 * dice; la otra se contesta con `unoDeLaRueda` y se sigue): si `golpea`, golpea en cuanto
 * puede y si no se acerca al enemigo más cercano; si no, se defiende. Siempre
 * igual con la misma semilla. Lo usan las pruebas de la rueda.
 */
export function hastaLaRueda(
  s: SesionDeArena,
  golpea: boolean,
  fase?: 'golpe' | 'respuesta',
): void {
  for (let i = 0; i < 300 && s.battle.finished === null; i++) {
    const pendiente = s.ruedaPendiente;
    if (pendiente !== null && (fase === undefined || pendiente.fase === fase)) return;
    if (pendiente !== null) {
      s.elegirEnLaRueda(unoDeLaRueda(s.battle));
      continue;
    }
    const turno = s.turnoPropio;
    if (turno === null) throw new Error('la sesión devuelve el control sin turno ni rueda');
    const legales = s.battleLegalActions();
    const ataque = legales.find((a) => a.type === 'attack');
    const enemigos = s.battle.stacks.filter((x) => x.side !== turno.side && x.count > 0);
    const cerca = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.map((e) => hexDistance(h, e.hex)));
    const acercarse = legales
      .flatMap((a) => (a.type === 'move' ? [a] : []))
      .sort((a, b) => cerca(a.to) - cerca(b.to))[0];
    if (golpea && ataque !== undefined) s.playBattleAction(ataque);
    else if (golpea && acercarse !== undefined && turno.battle.turno?.gastado === 0)
      s.playBattleAction(acercarse);
    else s.playBattleAction({ type: 'end_turn' });
  }
  throw new Error('la rueda no pide nada');
}
