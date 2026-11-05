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
 */
import { Session } from '../src/client/session.js';
import type { ReglasDelCombate } from '../src/core/combate.js';
import { objectAt } from '../src/core/map/map.js';
import type { Point } from '../src/core/types.js';

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
