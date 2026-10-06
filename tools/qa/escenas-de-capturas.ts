/**
 * Las escenas que `capturas.ts` necesita encontrar en una partida, buscadas en
 * el ESPEJO —una `Session` por semilla, sin navegador— en vez de escritas a mano.
 *
 * Por qué existe: la semilla y el destino de la emboscada avisada y la semilla de
 * los veteranos se fijaban a mano, y cada cambio del generador de mapas las
 * rompía —cinco veces seguidas, la última con «menos caminos» (06-10-2026),
 * donde la ruta de la 3 a (8,8) dejó de pisar ninguna emboscada—. Ahora cada
 * pasada pide su escena con la condición que de verdad necesita, y si ninguna
 * semilla dentro del tope la cumple, falla diciendo qué buscaba.
 *
 * Todo es puro salvo la caja del lienzo, que la mide la página: lo que «se ve»
 * depende de ella, y es la misma cuenta que hace `Mapa` en el guion.
 */
import { focoDe } from '../../src/client/escenas/aventura.js';
import { galonesDe } from '../../src/client/render/batalla.js';
import {
  casillaAPixel,
  centrarEn,
  type Encuadre,
  TILE_INICIAL,
  zoom,
} from '../../src/client/render/camara-mapa.js';
import { escenarioDe, topeDeAlejar } from '../../src/client/render/escenario/superficie.js';
import { Session } from '../../src/client/session.js';
import { troopSummary } from '../../src/core/hero/troop.js';
import { casillasPeligrosas } from '../../src/core/state/asaltantes.js';
import type { Point } from '../../src/core/types.js';

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Lo que se deja libre en cada borde del lienzo al buscar dónde tocar. */
const MARGEN_DEL_LIENZO = 30;
/**
 * Abajo se deja más: ahí van los botones de la cámara, y un toque que cae en el
 * «+» hace zoom en vez de ir a donde se quería (semilla 238, destino (7,10)).
 */
const MARGEN_DE_LOS_BOTONES = 110;

/** Si un píxel de la página cae en el lienzo lejos de sus bordes y de los botones. */
export function tocable(b: Caja, p: { x: number; y: number }): boolean {
  return (
    p.x > b.x + MARGEN_DEL_LIENZO &&
    p.x < b.x + b.width - MARGEN_DEL_LIENZO &&
    p.y > b.y + MARGEN_DEL_LIENZO &&
    p.y < b.y + b.height - MARGEN_DE_LOS_BOTONES
  );
}

/** El encuadre del cliente para esta caja y esta partida, con su tope de alejar. */
export function encuadreDe(b: Caja, espejo: Session): Encuadre {
  const { map, seed } = espejo.state;
  return {
    ancho: b.width,
    alto: b.height,
    mapaAncho: map.width,
    mapaAlto: map.height,
    // El tope de alejar, con la misma cuenta que el cliente.
    tileMinimo: topeDeAlejar(escenarioDe(map, seed), b.width, b.height),
  };
}

/** Dónde cae en la página el centro de una casilla, con la cámara centrada en el héroe. */
export function pixelDeCasilla(
  b: Caja,
  e: Encuadre,
  tile: number,
  espejo: Session,
  p: Point,
): { x: number; y: number } {
  const camara = centrarEn({ tile, x: 0, y: 0 }, focoDe(espejo), e);
  const c = casillaAPixel(camara, p);
  return { x: b.x + c.x, y: b.y + c.y };
}

/**
 * La guardia más cercana a la que el héroe llega HOY y que se VE en el lienzo,
 * por la ruta que enseña el cliente, o `null`. Una ruta que pisa la región de un
 * grupo que embosca no llega a la guardia: la marcha se para en la emboscada y
 * la batalla es otra. Por eso se descartan, salvo con `aunqueEmbosquen`, para
 * quien solo quiere UNA batalla y le da igual contra quién (los veteranos).
 */
export function guardiaEnElMarco(
  b: Caja,
  e: Encuadre,
  tile: number,
  espejo: Session,
  { aunqueEmbosquen = false }: { readonly aunqueEmbosquen?: boolean } = {},
): Point | null {
  const candidatas: { at: Point; pasos: number }[] = [];
  const heroe = espejo.selectedHero;
  const peligro =
    heroe === null || aunqueEmbosquen ? null : casillasPeligrosas(espejo.state, heroe);
  const W = espejo.state.map.width;
  for (const o of espejo.state.map.objects) {
    if (o.kind !== 'monster' || o.defeated) continue;
    const ruta = espejo.previewPath(o.at);
    if (ruta.length === 0 || !ruta.every((paso) => paso.hoy)) continue;
    if (ruta.some((paso) => peligro?.[paso.at.y * W + paso.at.x] === 1)) continue;
    candidatas.push({ at: o.at, pasos: ruta.length });
  }
  candidatas.sort((x, y) => x.pasos - y.pasos);
  for (const c of candidatas) {
    if (tocable(b, pixelDeCasilla(b, e, tile, espejo, c.at))) return c.at;
  }
  return null;
}

/**
 * Cuántas semillas se prueban como mucho. Medido el 06-10-2026 con el lienzo de
 * escritorio (1080×777): la emboscada sale en la 3, los veteranos en la 5 y la
 * derrota en la 14, en menos de un segundo cada una. Cada semilla cuesta ~75 ms
 * —casi todo, el escenario que da el tope de alejar—, así que no encontrar nada
 * cuesta ~15 s: el margen para que el próximo cambio del mapa no lo agote sin
 * que un fallo de verdad se haga esperar.
 */
export const TOPE_DE_SEMILLAS = 200;

export interface EscenaDeEmboscada {
  readonly semilla: number;
  readonly destino: Point;
  readonly grupo: string;
}

/**
 * Una ruta del día 1 que pisa, A LA VISTA, la región de un grupo que embosca:
 * el grupo está pintado sin descubrir el mapa, el grupo, el destino y la
 * casilla donde salta caen dentro del lienzo, y al pulsar el destino la batalla es contra ese
 * grupo. Gana la ruta más corta de la primera semilla que la tenga.
 */
export function buscarEmboscada(b: Caja, desde = 1): EscenaDeEmboscada {
  for (let semilla = desde; semilla < desde + TOPE_DE_SEMILLAS; semilla++) {
    const espejo = new Session(semilla);
    const e = encuadreDe(b, espejo);
    const explorado = espejo.explorado;
    const { width: W, height: H } = espejo.state.map;
    const candidatas: (EscenaDeEmboscada & { pasos: number })[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const destino = { x, y };
        if (!tocable(b, pixelDeCasilla(b, e, TILE_INICIAL, espejo, destino))) continue;
        const ruta = espejo.previewPath(destino);
        const salta = ruta.find((p) => p.emboscada !== undefined);
        if (salta?.emboscada === undefined) continue;
        const { at } = salta.emboscada;
        if (explorado !== null && !explorado.has(`${at.x},${at.y}`)) continue;
        if (!tocable(b, pixelDeCasilla(b, e, TILE_INICIAL, espejo, salta.at))) continue;
        // Y el grupo en el marco: explorado no basta, la captura tiene que enseñarlo
        // (en la 1 sin esto, el grupo caía en (1,14), debajo del lienzo).
        if (!tocable(b, pixelDeCasilla(b, e, TILE_INICIAL, espejo, at))) continue;
        candidatas.push({ semilla, destino, pasos: ruta.length, grupo: salta.emboscada.id });
      }
    }
    candidatas.sort((p, q) => p.pasos - q.pasos);
    // El aviso tiene que ser verdad: se pulsa en otro espejo y se mira quién ataca.
    for (const c of candidatas) {
      const prueba = new Session(semilla);
      prueba.clickTile(c.destino);
      const atacante = prueba.state.pendingBattle?.attacker;
      if (atacante?.kind === 'raider' && atacante.raiderId === c.grupo) {
        return { semilla, destino: c.destino, grupo: c.grupo };
      }
    }
  }
  throw new Error(
    `emboscada: en las semillas ${desde}–${desde + TOPE_DE_SEMILLAS - 1} ninguna ruta del día 1 ` +
      'pisa, dentro del lienzo, la región de un grupo que embosca y está a la vista, con la batalla contra ese grupo al pulsar',
  );
}

/** Las batallas de los veteranos: la guardia o quien embosque por el camino. */
export const VETERANOS = { aunqueEmbosquen: true } as const;

/** Lo que el héroe de los veteranos ve tras un paso de rueda hacia fuera, como en la pasada. */
export function tileDeLosVeteranos(e: Encuadre): number {
  return zoom({ tile: TILE_INICIAL, x: 0, y: 0 }, -1, e).tile;
}

/**
 * Una partida donde la batalla más cercana a la vista que se alcanza hoy
 * —la guardia, o el grupo que embosca por el camino—, resuelta sola, deja a
 * alguien de la tropa en nivel 2 o más, y el día 2 hay otra a la vista y a la
 * que se llega, en cuyo tablero pisa un veterano con galones. Es lo que la
 * pasada `veteranos` enseña, jugado en el espejo de antemano.
 *
 * La emboscada cuenta como primera batalla porque sin ella la escena era una
 * rareza: el 06-10-2026, en 16 de las 200 primeras semillas había una guardia a
 * la que se llegaba hoy sin pisar la región de un grupo, y de esas ninguna
 * llegaba al final (la de 2 199 se había sacado de entre 5 000). Contando la
 * emboscada, 9 de las 100 primeras; la primera, la 5.
 */
export async function buscarVeteranos(b: Caja, desde = 1): Promise<number> {
  for (let semilla = desde; semilla < desde + TOPE_DE_SEMILLAS; semilla++) {
    const espejo = new Session(semilla);
    const e = encuadreDe(b, espejo);
    const tile = tileDeLosVeteranos(e);
    const primera = guardiaEnElMarco(b, e, tile, espejo, VETERANOS);
    if (primera === null) continue;
    espejo.clickTile(primera);
    if (espejo.battle === null) continue;
    espejo.autoResolveBattle();
    const heroe = espejo.myHeroes()[0];
    if (heroe === undefined) continue;
    if (!troopSummary(heroe.army, espejo.state.characters).some((g) => g.nivel >= 2)) continue;
    await espejo.endTurn();
    if (espejo.state.finished !== null) continue;
    const segunda = guardiaEnElMarco(b, e, tile, espejo, VETERANOS);
    if (segunda === null) continue;
    espejo.clickTile(segunda);
    const battle = espejo.battle;
    if (battle === null) continue;
    if (battle.stacks.some((s) => s.count > 0 && galonesDe(s) > 0)) return semilla;
  }
  throw new Error(
    `veteranos: en las semillas ${desde}–${desde + TOPE_DE_SEMILLAS - 1} ninguna guardia a la vista ` +
      'del día 1 deja un veterano de nivel 2 con otra guardia a la vista el día 2 en cuyo tablero pise',
  );
}

/**
 * Una partida cuya guardia más cercana a la vista que se alcanza hoy, resuelta
 * sola, gana: la batalla que se pierde y la vuelta a la base. Con el zoom de
 * salida, como la pasada `batallaPerdida`.
 */
export function buscarDerrota(b: Caja, desde = 1): number {
  for (let semilla = desde; semilla < desde + TOPE_DE_SEMILLAS; semilla++) {
    const espejo = new Session(semilla);
    const guardia = guardiaEnElMarco(b, encuadreDe(b, espejo), TILE_INICIAL, espejo);
    if (guardia === null) continue;
    espejo.clickTile(guardia);
    if (espejo.battle === null) continue;
    espejo.autoResolveBattle();
    const final = [...espejo.state.log].reverse().find((e) => e.kind === 'battle_ended');
    if (final?.kind === 'battle_ended' && final.winner === 'defender') return semilla;
  }
  throw new Error(
    `batalla perdida: en las semillas ${desde}–${desde + TOPE_DE_SEMILLAS - 1} ninguna guardia a la vista ` +
      'a la que se llegue hoy gana al héroe resuelta sola',
  );
}
