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
import { objectAt, pointKey } from '../src/core/map/map.js';
import type { Army, Point } from '../src/core/types.js';

let hallada: { readonly semilla: number; readonly at: Point } | null = null;
let emboscada: { readonly semilla: number; readonly destino: Point } | null = null;

function abrir(semilla: number, at: Point): Session | null {
  const s = new Session(semilla);
  s.clickTile(at);
  if (s.battle === null || s.turnoPropio === null) return null;
  return s.state.pendingBattle?.attacker.kind === 'hero' ? s : null;
}

/** Una sesión nueva, recién entrada en la batalla: cada llamada da la suya. */
export function sesionContraMonstruo(): Session {
  if (hallada !== null) {
    const s = abrir(hallada.semilla, hallada.at);
    if (s === null)
      throw new Error('la batalla hallada no se repite: la sesión no es determinista');
    return s;
  }
  for (const { semilla, at, s } of sesionesContraMonstruo()) {
    hallada = { semilla, at };
    return s;
  }
  throw new Error('ninguna de 200 semillas abre el día 1 una batalla contra un monstruo');
}

/**
 * La misma batalla, con el héroe de la persona llevando `ejercito` en vez del
 * suyo: para los tests que necesitan una tropa concreta (el monje de los poderes).
 * Lanza si con ese ejército no se abre la batalla.
 */
export function sesionContraMonstruoCon(ejercito: Army): Session {
  sesionContraMonstruo();
  if (hallada === null) throw new Error('sin batalla hallada');
  const s = new Session(hallada.semilla);
  const h = s.selectedHero;
  if (h === null) throw new Error('la sesión no tiene héroe seleccionado');
  h.army = ejercito;
  s.clickTile(hallada.at);
  if (s.battle === null) throw new Error('con ese ejército no se abre la batalla');
  return s;
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

/**
 * Una sesión y un destino cuya ruta pisa, a la vista, la región de un grupo de
 * asaltantes que embosca: la primera semilla que lo da. Era la semilla 1 y la
 * (2,10), escritas a mano.
 */
export function rutaConEmboscada(): { readonly s: Session; readonly destino: Point } {
  if (emboscada !== null) return { s: new Session(emboscada.semilla), destino: emboscada.destino };
  for (let semilla = 1; semilla <= 200; semilla++) {
    const s = new Session(semilla);
    const { width: W, height: H } = s.state.map;
    const ocupadas = new Set([
      ...s.state.map.objects.map((o) => pointKey(o.at)),
      ...s.state.raiders.map((r) => pointKey(r.at)),
    ]);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = { x, y };
        if (ocupadas.has(pointKey(p))) continue;
        const ruta = s.previewPath(p);
        const donde = ruta.findIndex((paso) => paso.emboscada !== undefined);
        // Que salte antes del final y hoy: la marcha se para ahí y hay batalla.
        if (donde >= 1 && ruta[donde]!.hoy) {
          emboscada = { semilla, destino: p };
          return { s, destino: p };
        }
      }
    }
  }
  throw new Error('ninguna de 200 semillas da una ruta con emboscada a la vista');
}
