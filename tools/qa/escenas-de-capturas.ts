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
import { masCercana, opcionesDeGolpe } from '../../src/client/escenas/angulo.js';
import { focoDe, llegadaDeLaRuta } from '../../src/client/escenas/aventura.js';
import { cajaDeFigura, galonesDe } from '../../src/client/render/batalla.js';
import {
  casillaAPixel,
  centrarEn,
  type Encuadre,
  TILE_INICIAL,
  zoom,
} from '../../src/client/render/camara-mapa.js';
import { escenarioDe, topeDeAlejar } from '../../src/client/render/escenario/superficie.js';
import { pasosAPintar } from '../../src/client/render/mapa.js';
import { centroDeStack, tableroPara } from '../../src/client/render/proyeccion.js';
import { Session } from '../../src/client/session.js';
import { chooseBattleAction } from '../../src/core/ai/tactics.js';
import {
  activeStack,
  applyAction,
  isAlive,
  legalActions,
  mismoTurno,
  stackHexes,
} from '../../src/core/battle/battle.js';
import type { BattleAction, BattleStack, BattleState } from '../../src/core/battle/types.js';
import { troopSummary } from '../../src/core/hero/troop.js';
import { createRng } from '../../src/core/rng.js';
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

/** Dónde cae en la página el centro de `p` con la cámara centrada en `foco` (y acotada). */
export function pixelMirando(
  b: Caja,
  e: Encuadre,
  tile: number,
  foco: Point,
  p: Point,
): { x: number; y: number } {
  const c = casillaAPixel(centrarEn({ tile, x: 0, y: 0 }, foco, e), p);
  return { x: b.x + c.x, y: b.y + c.y };
}

/** Dónde cae en la página el centro de una casilla, con la cámara centrada en el héroe. */
export function pixelDeCasilla(
  b: Caja,
  e: Encuadre,
  tile: number,
  espejo: Session,
  p: Point,
): { x: number; y: number } {
  return pixelMirando(b, e, tile, focoDe(espejo), p);
}

/**
 * La guardia más cercana a la que el héroe llega HOY, por la ruta que enseña el
 * cliente, y que se puede tocar en el lienzo con la cámara centrada en ella
 * (`Mapa.mirar` la lleva allí arrastrando el mapa), o `null`. Lo único que la
 * deja fuera del marco es la cámara acotada: una guardia en el borde del mapa
 * no llega al centro, y puede quedar bajo los botones.
 *
 * Antes se pedía que se viera con la cámara en el HÉROE, y cada pasada
 * alejaba la vista a ojo —un paso de rueda los veteranos, dos el dedo— para
 * que cupiera; con los mapas densos las guardias quedaban a ocho pasos o más
 * y la búsqueda descartaba semillas por el zoom, no por la partida (#131).
 *
 * Una ruta que pisa la región de un grupo que embosca no llega a la guardia: la
 * marcha se para en la emboscada y la batalla es otra. Por eso se descartan,
 * salvo con `aunqueEmbosquen`, para quien solo quiere UNA batalla y le da igual
 * contra quién (los veteranos).
 */
export function guardiaEnElMarco(
  b: Caja,
  e: Encuadre,
  tile: number,
  espejo: Session,
  opciones: { readonly aunqueEmbosquen?: boolean } = {},
): Point | null {
  return guardiasEnElMarco(b, e, tile, espejo, opciones)[0] ?? null;
}

/** Las guardias de `guardiaEnElMarco`, todas, de la más cercana a la más lejana. */
export function guardiasEnElMarco(
  b: Caja,
  e: Encuadre,
  tile: number,
  espejo: Session,
  { aunqueEmbosquen = false }: { readonly aunqueEmbosquen?: boolean } = {},
): Point[] {
  const candidatas: { at: Point; pasos: number }[] = [];
  const heroe = espejo.selectedHero;
  const peligro =
    heroe === null || aunqueEmbosquen
      ? null
      : // Todos los grupos y no los que vio su dueño (#164): la captura tiene
        // que esquivar la emboscada que ocurriría, no la que el jugador teme.
        casillasPeligrosas(
          espejo.state,
          heroe,
          new Map(espejo.state.raiders.map((g) => [g.id, { day: espejo.state.day, grupo: g }])),
        );
  const W = espejo.state.map.width;
  for (const o of espejo.state.map.objects) {
    if (o.kind !== 'monster' || o.defeated) continue;
    const ruta = espejo.previewPath(o.at);
    if (ruta.length === 0 || !ruta.every((paso) => paso.hoy)) continue;
    if (ruta.some((paso) => peligro?.[paso.at.y * W + paso.at.x] === 1)) continue;
    candidatas.push({ at: o.at, pasos: ruta.length });
  }
  candidatas.sort((x, y) => x.pasos - y.pasos);
  return candidatas
    .filter((c) => tocable(b, pixelMirando(b, e, tile, c.at, c.at)))
    .map((c) => c.at);
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
        if (explorado !== null && !explorado.has(at)) continue;
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
    const primera = guardiaEnElMarco(b, e, TILE_INICIAL, espejo, VETERANOS);
    if (primera === null) continue;
    espejo.clickTile(primera);
    if (espejo.battle === null) continue;
    espejo.autoResolveBattle();
    const heroe = espejo.myHeroes()[0];
    if (heroe === undefined) continue;
    if (!troopSummary(heroe.army, espejo.state.characters).some((g) => g.nivel >= 2)) continue;
    await espejo.endTurn();
    if (espejo.state.finished !== null) continue;
    const segunda = guardiaEnElMarco(b, e, TILE_INICIAL, espejo, VETERANOS);
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
 * Dónde empieza `buscarDerrota`. Con el mapa de 34×34 era la 301 (de 201 a
 * 1 000 perdían la 315, 410 y 665; 08-10-2026). Con el de 42×42 (#226) la
 * primera es la 78, y de 301 a 500 no pierde ninguna; en cada tanda de 200 de
 * 1 a 2 600 hay al menos una (78, 220, 583, 728, 934…; 09-10-2026). Es un punto
 * de partida, no una semilla escrita.
 */
export const DESDE_LA_DERROTA = 1;

/** La partida y la guardia de la batalla que se pierde (`buscarDerrota`). */
export interface EscenaDeDerrota {
  readonly semilla: number;
  readonly guardia: Point;
}

/**
 * Una guardia a la vista que se alcanza hoy y que, resuelta sola, gana al
 * héroe: la batalla que se pierde y la vuelta a la base. Con el zoom de salida,
 * como la pasada `batallaPerdida`.
 *
 * Prueba TODAS las guardias del marco, no solo la más cercana, y empieza en
 * `DESDE_LA_DERROTA`. El nivel de cada región (#143, c6ca1c6) dejó las semillas
 * 1–200 sin derrota: solo 24 tienen una guardia a la que se llega hoy sin
 * cruzar una emboscada (26 guardias), y el héroe gana todas, también licenciada
 * toda su tropa; las que pierde están más lejos, detrás de asaltantes
 * (08-10-2026, #213).
 */
export function buscarDerrota(b: Caja, desde = DESDE_LA_DERROTA): EscenaDeDerrota {
  for (let semilla = desde; semilla < desde + TOPE_DE_SEMILLAS; semilla++) {
    const espejo = new Session(semilla);
    for (const guardia of guardiasEnElMarco(b, encuadreDe(b, espejo), TILE_INICIAL, espejo)) {
      // Una sesión por guardia: la batalla gasta la de antes.
      const prueba = new Session(semilla);
      prueba.clickTile(guardia);
      if (prueba.battle === null) continue;
      prueba.autoResolveBattle();
      const final = [...prueba.state.log].reverse().find((e) => e.kind === 'battle_ended');
      if (final?.kind === 'battle_ended' && final.winner === 'defender') {
        return { semilla, guardia };
      }
    }
  }
  throw new Error(
    `batalla perdida: en las semillas ${desde}–${desde + TOPE_DE_SEMILLAS - 1} ninguna guardia a la vista ` +
      'a la que se llegue hoy gana al héroe resuelta sola',
  );
}

/** El tile tras `pasos` de rueda (positivos acercan), con los topes del cliente. */
export function tileTrasRueda(e: Encuadre, pasos: number): number {
  let tile = TILE_INICIAL;
  for (let i = 0; i < Math.abs(pasos); i++)
    tile = zoom({ tile, x: 0, y: 0 }, pasos > 0 ? 1 : -1, e).tile;
  return tile;
}

/**
 * El destino explorado cuya ruta pintada tiene tramo de hoy y tramo de otro día,
 * se ve entera (la barra dice «dorado hoy, gris otro día») y cae dentro del
 * lienzo, con el héroe centrado: el más largo de pintar. Es lo
 * que enseña `rutaDoradaYGris`; vive aquí para que la búsqueda de la semilla y
 * la pasada pregunten lo mismo.
 */
export function rutaDeDosColores(
  b: Caja,
  e: Encuadre,
  tile: number,
  espejo: Session,
): Point | null {
  const explorado = espejo.explorado;
  if (explorado === null) return null;
  const dentro = (p: { x: number; y: number }) =>
    p.x > b.x + 30 && p.x < b.x + b.width - 30 && p.y > b.y + 30 && p.y < b.y + b.height - 30;
  let elegido: { destino: Point; pintados: number } | null = null;
  for (const destino of explorado) {
    const ruta = espejo.previewPath(destino);
    const pintados = pasosAPintar(ruta, explorado);
    if (!pintados.some((p) => p.hoy) || !pintados.some((p) => !p.hoy)) continue;
    // Y que la barra lo diga con sus colores: con parte de la ruta en la niebla
    // dice solo lo que se ve (#123), y la pasada mira esa frase (s14 en la
    // búsqueda de #161 elegía una ruta que seguía por tierras desconocidas).
    if (!llegadaDeLaRuta(ruta, explorado).includes('dorado hoy, gris otro día')) continue;
    if (elegido !== null && pintados.length <= elegido.pintados) continue;
    if (!dentro(pixelDeCasilla(b, e, tile, espejo, destino))) continue;
    elegido = { destino, pintados: pintados.length };
  }
  return elegido?.destino ?? null;
}

/** Lo que la pasada de escritorio recluta en el castillo: lo de nivel 1 de su facción. */
export const reclutaDeNivel1 = (faction: string): string =>
  faction === 'knight' ? 'peasant' : 'skeleton';

/**
 * La batalla de escritorio vale aunque la ruta a la guardia cruce un grupo que
 * embosca: lo que se mira es una batalla de varios por bando jugada a clics, y
 * la de un grupo lo es. Desde el mapa de 42×42 (#226), con la misma vista
 * (radio 4 y 5) y más marcha, ninguna de 1-400 tenía a la vez la ruta de dos
 * colores y una guardia a salvo a la que se llegue hoy (eran 9 de 400 en 34×34);
 * aunque embosquen, 23 de 400 (la primera, la 41).
 */
export const EMBOSCADA_DEL_ESCRITORIO = { aunqueEmbosquen: true } as const;

/** Los pasos de rueda que da la pasada de escritorio antes de su batalla (zoom y arrastre). */
export const RUEDA_DEL_ESCRITORIO = 2;

/**
 * La partida de la pasada de escritorio, jugada en el espejo hasta su primera
 * batalla: con el héroe recién nacido, una ruta de dos colores a la vista; al
 * entrar en su castillo y reclutar todo lo de nivel 1, una guardia a la que se
 * llega hoy y se ve con el zoom de la pasada, y su batalla. Era la semilla 50,
 * fija, y #161 le quitó la ruta de dos días (QA de #161, H1).
 *
 * Lo que no se mira aquí es la batalla en sí —que dé ocasión de mover dos
 * tramos y atacar desde un ángulo—: depende de los clics de la pasada, y si no
 * la da, la pasada lo dice.
 */
export function buscarEscritorio(b: Caja, desde = 1): number {
  for (let semilla = desde; semilla < desde + TOPE_DE_SEMILLAS; semilla++) {
    const espejo = new Session(semilla);
    const e = encuadreDe(b, espejo);
    if (rutaDeDosColores(b, e, TILE_INICIAL, espejo) === null) continue;
    const castillo = espejo.myTowns()[0];
    if (castillo === undefined) continue;
    espejo.clickTile(castillo.at);
    if (espejo.scene !== 'town' || espejo.activeTown === null) continue;
    espejo.recruitAll(reclutaDeNivel1(espejo.activeTown.faction));
    espejo.closeTown();
    const guardia = guardiaEnElMarco(
      b,
      e,
      tileTrasRueda(e, RUEDA_DEL_ESCRITORIO),
      espejo,
      EMBOSCADA_DEL_ESCRITORIO,
    );
    if (guardia === null) continue;
    espejo.clickTile(guardia);
    if (espejo.battle !== null && hayAnguloEnLaBatalla(espejo, b)) return semilla;
  }
  throw new Error(
    `escritorio: en las semillas ${desde}–${desde + TOPE_DE_SEMILLAS - 1} ninguna tiene a la vez una ruta ` +
      'de dos colores a la vista y, tras entrar al castillo, una guardia a la vista a la que se llegue hoy y cuya batalla dé ocasión de mover dos tramos y atacar',
  );
}

/**
 * El destino de la pasada táctil: el más lejano a ±5 casillas que se alcance
 * hoy, explorado, a tres pasos o más y tocable en el lienzo; o `null`.
 */
export function destinoTactil(b: Caja, e: Encuadre, espejo: Session): Point | null {
  const heroe = espejo.selectedHero;
  if (heroe === null) return null;
  let destino: Point | null = null;
  let mejor = 2;
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const p = { x: heroe.at.x + dx, y: heroe.at.y + dy };
      const r = espejo.previewPath(p);
      if (r.length <= mejor || !r.every((paso) => paso.hoy)) continue;
      if (espejo.explorado !== null && !espejo.explorado.has(p)) continue;
      if (tocable(b, pixelDeCasilla(b, e, TILE_INICIAL, espejo, p))) {
        destino = p;
        mejor = r.length;
      }
    }
  }
  return destino;
}

/**
 * La semilla de las pasadas del móvil y del dedo, que comparten el marco
 * estrecho (`b`, medido en la página del móvil):
 *  - móvil: tras entrar al castillo y salir, una guardia a la vista con el zoom
 *    de salida, y su batalla;
 *  - táctil: un destino de hoy a tres pasos o más, y —en otra partida de la misma
 *    semilla— una guardia a la vista y su batalla.
 * Era la 810, fija (QA de #161, H1).
 */
export function buscarMovil(b: Caja, desde = 1): number {
  for (let semilla = desde; semilla < desde + TOPE_DE_SEMILLAS; semilla++) {
    const tactil = new Session(semilla);
    const e = encuadreDe(b, tactil);
    if (destinoTactil(b, e, tactil) === null) continue;
    const otra = new Session(semilla);
    const lejos = guardiaEnElMarco(b, e, TILE_INICIAL, otra);
    if (lejos === null) continue;
    otra.clickTile(lejos);
    if (otra.battle === null) continue;
    const movil = new Session(semilla);
    const castillo = movil.myTowns()[0];
    if (castillo === undefined) continue;
    movil.clickTile(castillo.at);
    if (movil.scene !== 'town') continue;
    movil.closeTown();
    const guardia = guardiaEnElMarco(b, e, TILE_INICIAL, movil);
    if (guardia === null) continue;
    movil.clickTile(guardia);
    if (movil.battle !== null) return semilla;
  }
  throw new Error(
    `móvil: en las semillas ${desde}–${desde + TOPE_DE_SEMILLAS - 1} ninguna tiene, en el marco del móvil, ` +
      'un destino de hoy a tres pasos y una guardia a la vista a la que se llegue hoy (de salida, alejada y tras el castillo)',
  );
}

/** Los pasos de rueda hacia fuera con que `patrullaALaVista` abre la vista. */
export const RUEDA_DE_LA_PATRULLA = -4;

/**
 * Los grupos de asaltantes que la patrulla puede mirar: en lo explorado y
 * tocables en el lienzo. La misma pregunta que hace `patrullaALaVista`.
 */
export function asaltantesEnElMarco(
  b: Caja,
  e: Encuadre,
  tile: number,
  espejo: Session,
): readonly Point[] {
  const explorada = (p: Point) => espejo.explorado?.has(p) ?? true;
  return espejo.state.raiders
    .map((r) => r.at)
    .filter((at) => explorada(at) && tocable(b, pixelDeCasilla(b, e, tile, espejo, at)));
}

/**
 * La pasada sin arte, en el espejo: la patrulla de `patrullaALaVista` —con la
 * vista abierta, se pasan días hasta que un grupo a la vista se mueve dentro de
 * lo que se miró, descubriendo el mapa si no hay ninguno— y después una guardia
 * a la vista a la que se llegue, y su batalla. Era la semilla 50 (QA de #161, H1).
 */
export async function buscarSinArte(b: Caja, desde = 1): Promise<number> {
  for (let semilla = desde; semilla < desde + TOPE_DE_SEMILLAS; semilla++) {
    const espejo = new Session(semilla);
    const e = encuadreDe(b, espejo);
    const tile = tileTrasRueda(e, RUEDA_DE_LA_PATRULLA);
    let movido = false;
    for (let intento = 0; intento < 4 && espejo.state.finished === null && !movido; intento++) {
      const vistos = asaltantesEnElMarco(b, e, tile, espejo);
      if (vistos.length === 0) {
        if (espejo.revealAll) break;
        espejo.revealAll = true;
        intento--;
        continue;
      }
      const mirado = new Set<string>();
      for (const at of vistos)
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) mirado.add(`${at.x + dx},${at.y + dy}`);
      const ayer = new Map(espejo.state.raiders.map((r) => [r.id, { ...r.at }]));
      await espejo.endTurn();
      movido = espejo.state.raiders.some((r) => {
        const a = ayer.get(r.id);
        return (
          a !== undefined &&
          (a.x !== r.at.x || a.y !== r.at.y) &&
          mirado.has(`${a.x},${a.y}`) &&
          mirado.has(`${r.at.x},${r.at.y}`)
        );
      });
    }
    if (!movido || espejo.state.finished !== null) continue;
    const guardia = guardiaEnElMarco(b, e, tile, espejo);
    if (guardia === null) continue;
    espejo.clickTile(guardia);
    if (espejo.battle !== null && hayAnguloEnLaBatalla(espejo, b)) return semilla;
  }
  throw new Error(
    `sin arte: en las semillas ${desde}–${desde + TOPE_DE_SEMILLAS - 1} ninguna tiene un grupo a la vista que ` +
      'se mueva en cuatro días y después una guardia a la vista a la que se llegue',
  );
}

/**
 * Un plan para «mover dos tramos y atacar desde un ángulo elegido»: dos `move`
 * de la unidad activa que dejen el turno abierto, y un enemigo con un píxel de
 * su cuerpo cuya casilla más cercana NO sea la primera opción de la lista —si
 * lo fuera, el clic no demostraría nada que no hiciera ya el cliente de antes—.
 *
 * Se busca en copias del estado con el motor puro: la sesión del espejo no se
 * toca hasta que hay plan.
 */
export interface PlanDeAngulo {
  readonly tramos: readonly [BattleAction, BattleAction];
  readonly objetivo: string;
  /** Altura y lado del píxel dentro de la caja de la figura. */
  readonly alto: number;
  readonly lado: number;
}

export function planDeAngulo(espejo: Session, ancho: number, alto: number): PlanDeAngulo | null {
  const turno = espejo.turnoPropio;
  if (turno === null || espejo.battleLegalActions().some((a) => a.type === 'shoot')) return null;
  const t = tableroPara(ancho, alto);
  const copia = (b: BattleState): BattleState => structuredClone(b);
  const moves = (b: BattleState): BattleAction[] =>
    legalActions(b).filter((a) => a.type === 'move');
  const ahora = turno.battle.turno;
  for (const m1 of moves(turno.battle)) {
    const b1 = copia(turno.battle);
    applyAction(b1, m1, createRng(1));
    // Abierto de verdad: el MISMO turno, por su ordinal. Que la unidad siga
    // activa no basta —la moral extra le abre otro turno—, y con solo eso el
    // plan se colaba con un turno nuevo. Y por identidad no se puede: `b1` es
    // una copia.
    if (!mismoTurno(ahora, b1.turno)) continue;
    for (const m2 of moves(b1)) {
      const b2 = copia(b1);
      applyAction(b2, m2, createRng(1));
      if (!mismoTurno(ahora, b2.turno)) continue;
      const yo = activeStack(b2) as BattleStack;
      const acciones = legalActions(b2);
      for (const e of b2.stacks) {
        if (!isAlive(e) || e.side === yo.side) continue;
        const opciones = opcionesDeGolpe(acciones, e.id, yo.hex);
        if (opciones.length < 2) continue;
        const c = cajaDeFigura(t, e, centroDeStack(stackHexes(e)));
        for (const lado of [0.45, -0.45, 0.3, -0.3]) {
          for (const h of [0.05, 0.3, 0.5]) {
            const elegida = masCercana(opciones, t, c.x + lado * c.ancho, c.suelo - c.alto * h);
            if (elegida !== undefined && elegida !== opciones[0]) {
              return { tramos: [m1, m2], objetivo: e.id, alto: h, lado };
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Si la batalla del escritorio, jugada en el espejo como la juega
 * `turnoDeBatalla` —esperar, defender, el primer hechizo y después lo que elija
 * la IA—, da ocasión de mover dos tramos y atacar desde un ángulo
 * (`planDeAngulo`) en sus 40 jugadas. Es una aproximación: el clic sobre un
 * enemigo puede golpear desde otra casilla que la IA, y entonces la batalla de
 * la página se separa de esta; si no da ocasión, la pasada lo dice igual.
 * Antes la búsqueda no lo miraba y una semilla sin ocasión (la 7 con las minas
 * por región, #195: dos arqueros que disparan) llegaba al navegador.
 */
export function hayAnguloEnLaBatalla(espejo: Session, b: Caja): boolean {
  const battle = espejo.battle;
  if (battle === null) return false;
  for (let n = 0; n < 40 && battle.finished === null; n++) {
    if (n >= 3 && planDeAngulo(espejo, b.width, b.height) !== null) return true;
    const acciones = espejo.battleLegalActions();
    if (acciones.length === 0) return false;
    const hechizo = espejo.spellOptions().find((o) => o.castable);
    if (n === 0 && acciones.some((a) => a.type === 'wait')) {
      espejo.playBattleAction({ type: 'wait' });
    } else if (n === 1 && acciones.some((a) => a.type === 'defend')) {
      espejo.playBattleAction({ type: 'defend' });
    } else if (n === 2 && hechizo !== undefined) {
      const cast = acciones.find(
        (a) => a.type === 'cast' && a.spell === hechizo.id && a.target === hechizo.targets[0],
      );
      if (cast === undefined) return false;
      espejo.playBattleAction(cast);
    } else {
      const ia = chooseBattleAction(battle);
      espejo.playBattleAction(ia.type === 'cast' ? { type: 'defend' } : ia);
    }
  }
  return false;
}
