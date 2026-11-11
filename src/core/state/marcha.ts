/**
 * La marcha de un héroe por el mapa: a dónde llega y por dónde, con lo hostil de la
 * partida como final de trayecto (`alcanceDelHeroe` y `caminoHasta`, **las dos
 * únicas llamadas al Dijkstra del mapa**; lo vigila `invariantes-partida.test.ts`),
 * lo que se anda hoy (`pasosDeHoy`), por qué no se llega (`porQueNoLlega`) y la
 * marcha misma (`moveHero`), con lo que pasa al pisar cada casilla (`collectAt`).
 *
 * Y la toma de un sitio del muro: `tomarElNodo`, **el único escritor del `owner`
 * de un objeto del mapa**, sin exportar. La llaman la marcha y la entrega del sitio
 * de quien pierde una batalla en él (`entregarElSitio`, que por eso vive aquí y no
 * en `cierre.ts`, donde se lee).
 *
 * Vivía en `game.ts` hasta la fase N de la reorganización (07-11-2026), que lo
 * repartió por lo que hace.
 */
import { infiltracionBlocker, precioDeLaBarrera } from '../hero/infiltracion.js';
import type { CasillasLeidas } from '../map/casillas.js';
import { pointKey } from '../map/geometria.js';
import {
  barreraEn,
  costeEnElAlcance,
  findPath,
  objectAt,
  type PathStep,
  pathFromReachable,
  type Reachable,
  reachableFrom,
} from '../map/map.js';
import { muroBlocker } from '../map/recinto.js';
import { type Barrera, NOMBRE_DE_BARRERA } from '../map/terrain.js';
import type { GameMap } from '../map/tipos.js';
import { enumerar } from '../texto.js';
import type { Hero, PlayerId, Point } from '../types.js';
import {
  asaltantesALaVista,
  casillasPeligrosas,
  dejarAsaltante,
  dispersados,
  emboscador,
  vigiaDeLaMarcha,
} from './asaltantes.js';
import { abrirBatalla, emboscar } from './batallas.js';
import { currentPlayer, heroById, playerById } from './consultas.js';
import { emit } from './cronica.js';
import type { BattleFoe } from './events.js';
import {
  dueñoDelSitio,
  enUnNodo,
  guarnicionHostil,
  heroeAjenoEn,
  idDelSitio,
  nombreDelSitio,
  objetoDelSitio,
  quitarLaGuarnicion,
  type Sitio,
  sitioEn,
} from './sitios.js';
import type { GameContext, GameState } from './tipos.js';
import { checkDefeat } from './turnos.js';
import {
  heroesALaVista,
  revealAround,
  revealAroundNode,
  revealAroundTown,
  vioCaerlo,
  visibleNow,
  visibleNowAt,
} from './vision.js';

/**
 * Las casillas que un héroe de `player` puede **alcanzar pero no cruzar**: lo
 * que `enemyAt` da por batalla y el mapa no sabe —un héroe ajeno, un castillo
 * ajeno con guarnición y un paso o un pueblo con guarnición ajena—. Los
 * monstruos ya los bloquea el mapa.
 *
 * Existe para que nadie se meta en una batalla que no eligió a mitad de un
 * paso estrecho: con los pasos de la red, un héroe plantado junto a uno es una
 * batalla para todo el que lo cruce, y la semilla 54 del barrido no terminaba
 * —248 derrotas chocando en el mismo paso—. Antes el Dijkstra los cruzaba y
 * solo la IA se defendía, con
 * una segunda pasada por la cadena de predecesores de cada candidato
 * descartando lo que pasara por encima de uno: 147 de los 209 ms de
 * `chooseHeroDestination`, y la persona y el agente sin la misma defensa.
 */
export function casillasHostiles(state: GameState, player: PlayerId): Point[] {
  // Una casilla, una vez: el héroe rival en su ciudad es también la guarnición de
  // ella (desde que la de la ciudad vive en `GameState.guarniciones`), y repetida
  // `porQueNoLlega` lo nombraba dos veces.
  const vistas = new Set<string>();
  const out: Point[] = [];
  const poner = (at: Point): void => {
    const k = pointKey(at);
    if (vistas.has(k)) return;
    vistas.add(k);
    out.push(at);
  };
  for (const h of state.heroes) if (h.owner !== player) poner(h.at);
  for (const at of guarnicionesAjenas(state, player)) poner(at);
  // Un grupo de asaltantes es hostil para todos: se alcanza —atacarlo es
  // pedirlo de destino— y no se cruza.
  for (const r of state.raiders) poner(r.at);
  return out;
}

/**
 * Las casillas de las ciudades, pasos y pueblos con guarnición hostil para
 * `player` (`guarnicionHostil`, la regla que leen también `enemyAt`, `queLoCierra`
 * y la IA), en el orden de los objetos del mapa.
 */
function guarnicionesAjenas(state: GameState, player: PlayerId): Point[] {
  const out: Point[] = [];
  for (const o of state.map.objects) {
    if (o.kind !== 'node' && o.kind !== 'village' && o.kind !== 'town') continue;
    if (guarnicionHostil(state, o.id, player) !== null) out.push(o.at);
  }
  return out;
}

/**
 * Todo lo que alcanza un héroe desde donde está, con lo hostil de la partida
 * (`casillasHostiles`) como final de trayecto. Es el alcance de la IA y de
 * quien quiera mirar a dónde llega un héroe.
 *
 * Con `evitarEmboscadas`, es el alcance **prudente** de la IA: las regiones
 * donde a este héroe lo emboscarían (`casillasPeligrosas`) no se pisan. Solo
 * endurece —se llega a menos sitios, nunca a más—, así que lo hostil sigue sin
 * cruzarse. Es una opción y no una segunda función porque es
 * el mismo Dijkstra con una marca más, y el Dijkstra del mapa solo se lanza
 * desde aquí (`test/invariantes-partida.test.ts`).
 */
export function alcanceDelHeroe(
  state: GameState,
  hero: Hero,
  opciones: { readonly evitarEmboscadas?: boolean } = {},
): Reachable {
  const peligro =
    opciones.evitarEmboscadas === true
      ? casillasPeligrosas(state, hero, playerById(state, hero.owner).asaltantesVistos)
      : null;
  return alcanceConPrecio(state, hero, peligro, precioDeLaBarrera(hero));
}

/** `alcanceDelHeroe` con el precio de la barrera ya sabido: `porQueNoLlega` lo pide una vez. */
function alcanceConPrecio(
  state: GameState,
  hero: Hero,
  peligro: Uint8Array | null,
  barrera: number | null,
): Reachable {
  return reachableFrom(state.map, hero.at, casillasHostiles(state, hero.owner), peligro, barrera);
}

/**
 * El camino de un héroe hasta `to`, con lo hostil como final de trayecto: el
 * mismo que va a andar `move_hero`. Lo pide la pantalla para enseñar la ruta.
 */
export function caminoHasta(state: GameState, hero: Hero, to: Point): PathStep[] | null {
  return caminoEsquivando(
    state,
    hero,
    to,
    casillasHostiles(state, hero.owner),
    precioDeLaBarrera(hero),
  );
}

/**
 * El Dijkstra del héroe con una lista de hostiles **elegida a mano**. No se
 * exporta, y es a propósito: fuera de aquí la lista es siempre la de la partida
 * (`caminoHasta`), y con esta abierta cualquiera podría pasarle `[]` y cruzar
 * por encima de una guarnición. Solo la usa, además, `porQueNoLlega`, que
 * necesita preguntar «¿y si este no estuviera?» para saber a quién culpar, y
 * «¿y si se infiltrara?» (`barrera`, el precio de la barrera, que se pide una vez).
 */
function caminoEsquivando(
  state: GameState,
  hero: Hero,
  to: Point,
  hostiles: readonly Point[],
  barrera: number | null,
): PathStep[] | null {
  return findPath(state.map, hero.at, to, hostiles, barrera);
}

/**
 * Cuántos pasos de `camino` se pagan hoy con los puntos que le quedan a `hero`:
 * el héroe anda eso y lo demás es de otro día. El coste del camino es acumulado
 * y creciente, así que lo de hoy es siempre un prefijo. Lo leen la marcha
 * (`moveHero`) y la ruta que se pinta, y tienen que decir lo mismo.
 */
export function pasosDeHoy(camino: readonly PathStep[], hero: Hero): number {
  const primeroQueNo = camino.findIndex((paso) => paso.cost > hero.movePoints);
  return primeroQueNo === -1 ? camino.length : primeroQueNo;
}

/** «(6,5) es montaña y cuesta el día entero de marcha»: la casilla de barrera `at`, dicha. */
function laBarrera(at: Point, barrera: Barrera): string {
  return `(${at.x},${at.y}) es ${NOMBRE_DE_BARRERA[barrera]} y cuesta el día entero de marcha`;
}

/**
 * Si la marcha de hoy por `camino` (`hoy`, de `pasosDeHoy`) se para ante una
 * barrera —el primer paso de otro día es una casilla de barrera, que quien se
 * infiltra paga con el día entero (`hero/infiltracion.ts`)—, por qué, dicho para
 * la persona: «(6,5) es montaña y cuesta el día entero de marcha: se entra
 * mañana». Si no, `null`. La lee la ruta que se pinta (`Session.previewPath`):
 * pararse en el borde con casi todo el movimiento no se entendía (H2 de la vuelta
 * 1 de QA, 05-11-2026). Mañana se entra siempre: el día empieza con su precio.
 */
export function barreraDeMañana(
  map: GameMap,
  camino: readonly PathStep[],
  hoy: number,
): string | null {
  const paso = camino[hoy];
  const barrera = paso === undefined ? null : barreraEn(map, paso.at);
  return paso === undefined || barrera === null
    ? null
    : `${laBarrera(paso.at, barrera)}: se entra mañana`;
}

/**
 * ¿Puede `hero` dar hoy al menos un paso? Es la pregunta de «te quedan héroes
 * con movimiento» al pasar el turno (#17), y no es `movePoints > 0`: con 40
 * puntos y la casilla más barata a 100, el héroe no anda, y avisar por él era
 * pedir a la persona que mirase a uno que no puede hacer nada. Se responde con
 * el mismo alcance que la marcha (`alcanceDelHeroe`), así que lo hostil cuenta
 * como destino de un paso —atacarlo es moverse—, igual que en `move_hero`.
 */
export function puedeAndarHoy(state: GameState, hero: Hero): boolean {
  if (hero.movePoints <= 0) return false;
  const alcance = alcanceDelHeroe(state, hero);
  // La primera descubierta es el origen, que cuesta 0 y no es un paso.
  return alcance.descubiertas.some(
    (i, n) => n > 0 && (alcance.costes[i] ?? Number.POSITIVE_INFINITY) <= hero.movePoints,
  );
}

/**
 * Por qué `hero` no llega a `to`, en una frase para la persona, o el agente.
 *
 * Decía siempre «no hay camino hasta (x,y)», y con «lo hostil se alcanza pero
 * no se cruza» eso es falso a la vista: el camino existe, lo cierra una ciudad
 * guarnecida o un héroe rival plantado en el paso (M2 de la QA de la 2a).
 * Ahora se nombra quién. Se pregunta en tres pasos, y solo cuando ya se sabe
 * que no hay camino, así que el coste lo paga el rechazo y no la marcha:
 *
 *  1. Sin nada hostil, ¿se llega? Si no, el mapa no da paso y no hay a quién
 *     culpar, salvo que lo abriera infiltrarse: entonces se dice por qué este
 *     grupo no se infiltra (`infiltracionBlocker`).
 *  2. Lo hostil que el héroe **alcanza**: lo que tiene delante.
 *  3. De eso, lo que basta quitar para pasar. Si nada basta solo —dos héroes
 *     guardando los dos pasos de una región—, son todos los de delante.
 *
 * **Pasa por la niebla de quien mueve** (`hero.owner`, que es siempre quien lo
 * lee: la persona al señalar y al pulsar, el agente en el rechazo de su
 * `move_hero`; #336, 11-11-2026). Nombraba con `state.heroes` y `state.raiders`
 * enteros: «lo cierran el héroe rival Aldo de Valdeluz en (11,2)…» con Aldo en el
 * negro, y señalar sin pulsar lo habría hecho radar. El motivo verdadero no
 * cambia —se calcula con todo lo hostil, como el Dijkstra—; cambia cómo se dice:
 * lo que no se mira ahora es «algo que no ves», sin qué, sin dónde y sin cuántos
 * (el número también delata). Callarlo como «no hay camino» a secas mentiría:
 * el camino existe.
 */
export function porQueNoLlega(state: GameState, hero: Hero, to: Point): string {
  // La muralla de una ciudad no se pisa: se dice, con sus puertas, si se ha
  // explorado. Bajo el negro, nombrarla diría qué ciudad hay ahí y por dónde se
  // entra; el Dijkstra sin hostiles tampoco la pisa, así que sale «no hay camino».
  // Basta mirar la casilla: la ciudad se explora con su recinto entero
  // (`zonaDeNiebla`).
  const muro = playerById(state, hero.owner).fog.has(to)
    ? muroBlocker(state.map, to, (at) => {
        const ciudad = state.towns.find((t) => pointKey(t.at) === pointKey(at));
        return ciudad === undefined ? `la ciudad de (${at.x},${at.y})` : ciudad.name;
      })
    : null;
  if (muro !== null) return muro;
  const frase = `no hay camino hasta (${to.x},${to.y})`;
  const barrera = precioDeLaBarrera(hero);
  if (caminoEsquivando(state, hero, to, [], barrera) === null) {
    // Una barrera la cruza solo quien se infiltra: si infiltrándose llegaría, se
    // dice por qué este grupo no (con su marcha del día de precio, la que pagaría).
    const motivo = barrera === null ? infiltracionBlocker(hero) : null;
    if (motivo === null || caminoEsquivando(state, hero, to, [], hero.marchaDelDia) === null) {
      return frase;
    }
    return `${frase} sin cruzar una barrera: solo la cruza un grupo que se infiltra, y ${motivo}`;
  }
  const hostiles = casillasHostiles(state, hero.owner);
  const alcance = alcanceConPrecio(state, hero, null, barrera);
  const delante = hostiles.filter((h) => costeEnElAlcance(alcance, h) !== null);
  const bastan = delante.filter(
    (h) =>
      caminoEsquivando(
        state,
        hero,
        to,
        hostiles.filter((o) => pointKey(o) !== pointKey(h)),
        barrera,
      ) !== null,
  );
  const cierran = bastan.length > 0 ? bastan : delante;
  if (cierran.length === 0) return frase;
  const mirando = visibleNow(state, hero.owner);
  const dichos = cierran.map((at) => queLoCierra(state, hero, at, mirando));
  const vistos = dichos.filter((d): d is string => d !== null);
  if (vistos.length === 0) return `${frase}: lo cierra algo que no ves`;
  // Lo oculto, una vez y sin número, detrás de lo que se ve.
  const conLoOculto = vistos.length < dichos.length;
  return `${frase}: ${vistos.length === 1 && !conLoOculto ? 'lo cierra' : 'lo cierran'} ${enumerar(vistos)}${conLoOculto ? ' y algo más que no ves' : ''}`;
}

/**
 * Qué hostil hay en esa casilla, con nombre: el héroe va antes, como en `enemyAt`.
 * `null` si quien mueve no lo está mirando (`mirando`, su `visibleNow`): el héroe
 * y el grupo, por la regla de qué se ve (`heroesALaVista`, `asaltantesALaVista`);
 * la guarnición, también solo si se mira ahora, porque «con guarnición» es el
 * estado de hoy y no un recuerdo.
 */
function queLoCierra(
  state: GameState,
  hero: Hero,
  at: Point,
  mirando: CasillasLeidas,
): string | null {
  const donde = `en (${at.x},${at.y})`;
  const aqui = (p: Point): boolean => pointKey(p) === pointKey(at);
  if (state.heroes.some((h) => h.owner !== hero.owner && aqui(h.at))) {
    const rival = heroesALaVista(state, hero.owner, mirando).find(
      (h) => h.owner !== hero.owner && aqui(h.at),
    );
    return rival === undefined ? null : `el héroe rival ${rival.name} ${donde}`;
  }
  const sitio = sitioEn(state, at);
  if (sitio !== null && guarnicionHostil(state, sitio, hero.owner) !== null) {
    if (!mirando.has(at)) return null;
    return sitio.kind === 'ciudad'
      ? `la ciudad ${sitio.town.name}, con guarnición, ${donde}`
      : `${nombreDelSitio(sitio)}, con guarnición`;
  }
  if (state.raiders.some((r) => aqui(r.at))) {
    return asaltantesALaVista(state, mirando).some((r) => aqui(r.at))
      ? `un grupo de asaltantes ${donde}`
      : null;
  }
  throw new Error(
    `(${at.x},${at.y}) se tiene por hostil y no hay en ella ni héroe, ni ciudad, ni guarnición, ni asaltantes`,
  );
}

/**
 * El camino del héroe: del recorrido que trae el llamante, o de uno nuevo.
 *
 * La pista **no es un atajo que se salte una regla**: es el mismo Dijkstra que
 * lanzaría esta puerta, ya hecho. `reachableFrom` tiene un solo constructor en
 * `core`, así que desconfiar de sus costes sería `core` desconfiando de `core`;
 * lo que el llamante sí puede equivocar es **de qué origen** viene el alcance
 * —reutilizar el de antes de moverse—, y eso es lo único que se comprueba.
 *
 * Existe porque la IA ya recorre el mapa desde el héroe para decidir a dónde
 * va, y nueve líneas después esta puerta lo recorría otra vez desde el mismo
 * sitio hasta el mismo destino: 868 de las 1 028 llamadas a `findPath` de 40
 * partidas, el 6,5 % del banco.
 */
function caminoDelHeroe(
  state: GameState,
  hero: Hero,
  to: Point,
  alcance: Reachable | undefined,
): PathStep[] | null {
  if (alcance === undefined) return caminoHasta(state, hero, to);
  if (costeEnElAlcance(alcance, hero.at) !== 0) {
    throw new Error(
      `el alcance que traes no sale de donde está ${hero.name}: (${hero.at.x},${hero.at.y})`,
    );
  }
  return pathFromReachable(state.map, alcance, hero.at, to);
}

export function moveHero(
  state: GameState,
  heroId: string,
  to: Point,
  ctx: GameContext,
  alcance?: Reachable,
): void {
  const hero = heroById(state, heroId);
  const player = currentPlayer(state);
  if (hero.owner !== player.id) throw new Error('ese héroe no es tuyo');

  const camino = caminoDelHeroe(state, hero, to, alcance);
  if (camino === null) throw new Error(porQueNoLlega(state, hero, to));
  if (camino.length === 0) return;
  // El héroe anda lo que le dé el día y la marcha entra aunque no llegue: se
  // lanza solo si no da ni un paso, antes de tocar nada.
  const hoy = pasosDeHoy(camino, hero);
  if (hoy === 0) {
    // Qué cuesta el primero y qué queda: con una barrera delante (quien se
    // infiltra la paga con el día entero) no se adivinaría por qué no anda. Sin
    // «no quedan puntos», que con 1436 de 1616 se leía contradictorio (H2 de la
    // vuelta 1 de QA).
    const { at, cost } = camino[0] as PathStep;
    const barrera = barreraEn(state.map, at);
    throw new Error(
      `${hero.name} hoy no da ni un paso: ${
        barrera === null
          ? `el primero, a (${at.x},${at.y}), cuesta ${cost} y le quedan ${hero.movePoints}`
          : `${laBarrera(at, barrera)} (${cost}), y le quedan ${hero.movePoints}; se entra mañana`
      }`,
    );
  }

  // Si por el camino se ve un grupo que la emboscaría y que la ruta no avisaba,
  // la marcha se para donde lo ve (#130; la regla, en `vigiaDeLaMarcha`). Casi
  // siempre no hay —la IA no pisa las regiones de los que ha visto—, y entonces el bucle no paga
  // nada. De un solo paso no hay «más adelante», y mirarlo mediría la fuerza
  // del héroe antes que la batalla, que es quien tiene que lanzar si su
  // ejército no vale.
  const seVe = (at: Point): boolean => visibleNowAt(state, player.id, at);
  const vigia = camino.length > 1 ? vigiaDeLaMarcha(state, hero, camino, seVe) : null;

  for (let i = 0; i < hoy; i++) {
    const paso = camino[i] as (typeof camino)[number];
    const coste = paso.cost - (camino[i - 1]?.cost ?? 0);

    // Un enemigo en la casilla destino desencadena batalla y detiene la marcha.
    const enemigo = enemyAt(state, paso.at, player.id);
    if (enemigo !== null) {
      hero.movePoints -= coste;
      abrirBatalla(state, { attacker: { kind: 'hero', heroId: hero.id }, foe: enemigo }, ctx);
      return;
    }

    hero.movePoints -= coste;
    hero.at = paso.at;
    revealAround(state, hero);
    emit(state, {
      kind: 'hero_moved',
      hero: hero.id,
      to: paso.at,
      spent: coste,
      actor: hero.owner,
      at: paso.at,
    });
    const antesDeRecoger = state.log.length;
    collectAt(state, hero, paso.at);
    // Desde que el castillo no bloquea, se puede tomar la base del rival a
    // MITAD de camino, y eso acaba la partida: seguir andando escribiría
    // `hero_moved` debajo del `game_over`, que `emit` ya no deja escribir.
    if (state.finished !== null) return;
    // Pisar la región de un grupo que le saca el margen es la emboscada: el
    // grupo ataca, el héroe defiende y la marcha se para aquí. Después de
    // `collectAt` porque esa casilla ya es suya —ha llegado—, y un nodo tomado
    // de camino pudo dispersar al grupo antes de que lo viera.
    const asaltante = emboscador(state, hero);
    if (asaltante !== null) {
      emboscar(state, asaltante, hero, camino.length - 1 - i, ctx);
      return;
    }
    if (vigia === null || i === camino.length - 1) continue;
    // Ver por el camino al que la emboscaría para la marcha aquí, con lo andado
    // ya andado y gastado: la ruta no lo avisaba al salir, y quien la pidió
    // tiene ocasión de cambiar de idea (#130). Lo que recoge el paso —un cofre, un
    // nodo que dispersa grupos— puede cambiar quién la emboscaría, y siempre deja
    // un hecho en la crónica. También en el último paso de hoy: la parada gana al
    // `march_cut`, porque dice por qué conviene no seguir y no solo que se acabó
    // el día.
    const visto = vigia(i + 1, state.log.length > antesDeRecoger);
    if (visto !== null) {
      emit(state, {
        kind: 'march_halted',
        hero: hero.id,
        raider: visto.id,
        troops: visto.troops,
        actor: hero.owner,
        at: hero.at,
      });
      return;
    }
  }
  // Llegó al final de lo de hoy sin batalla, ni parada, ni final: si el camino
  // seguía, se dice aquí, que es donde se sabe por qué paró.
  if (hoy < camino.length) {
    emit(state, {
      kind: 'march_cut',
      hero: hero.id,
      faltan: camino.length - hoy,
      actor: hero.owner,
      at: hero.at,
    });
  }
}

/**
 * Qué hay de hostil en esa casilla, si algo.
 *
 * **El héroe va antes que el sitio**: si atacan una ciudad, un paso o un pueblo
 * con el héroe del dueño dentro, la batalla es contra él, y defiende con quien
 * elija de su ejército y de la guarnición (`defensaDeLaIA` al nacer la batalla,
 * `elegirLaDefensa` si la rehace la persona; D1 del puesto fronterizo, 04-11-2026).
 * Si pierde, `applyVictory` entrega el sitio y lo que no eligió se pierde con él.
 * Sustituye a la regla de antes («con el héroe dentro defiende solo él con su
 * tropa», I2 de la 2a), que dejaba fuera a la guarnición.
 *
 * Sin héroe, la guarnición entera de la ciudad, el paso o el pueblo, si no es de
 * quien llega (`garrison`, D2; también la neutral de una ciudad neutral, y la que
 * ocupa un sitio que ya es de quien llega: P1 de la tarea 2). Un héroe enemigo en
 * un sitio de quien llega es el que lo ocupa: pelear con él es recuperarlo.
 */
function enemyAt(state: GameState, at: Point, player: PlayerId): BattleFoe | null {
  const obj = objectAt(state.map, at);
  if (obj !== undefined && obj.kind === 'monster' && !obj.defeated) {
    return { kind: 'monster', objectId: obj.id };
  }

  const asaltante = state.raiders.find((r) => pointKey(r.at) === pointKey(at));
  if (asaltante !== undefined) return { kind: 'raider', raiderId: asaltante.id };

  const heroeEnemigo = heroeAjenoEn(state, at, player);
  if (heroeEnemigo !== undefined) return { kind: 'hero', heroId: heroeEnemigo.id };

  const sitio = sitioEn(state, at);
  if (sitio !== null && guarnicionHostil(state, sitio, player) !== null) {
    return { kind: 'garrison', site: idDelSitio(sitio) };
  }
  return null;
}

/**
 * Lo que pasa al pisar una casilla: se recoge el cofre y se toma el sitio del muro
 * (el paso, y la ciudad o el pueblo en el muro) que no es suyo y no tiene
 * guarnición hostil (con ella, la casilla es hostil y antes hay batalla).
 *
 * Corre en **cada casilla del camino**, no solo en la última, y es lo que hace
 * que un nodo se tome cruzándolo. La tropa de casa ya no se recoge al pasar
 * (04-11-2026): se recoge parando, con `recoger_tropa`. Una ciudad o un pueblo de
 * dentro de una región no se toman (es de quien tenga su región): el héroe de otro
 * bando que se queda en su casilla lo ocupa (`ocupanteDe`), sin quedárselo.
 */
function collectAt(state: GameState, hero: Hero, at: Point): void {
  const player = playerById(state, hero.owner);
  const obj = objectAt(state.map, at);

  if (obj !== undefined) {
    switch (obj.kind) {
      case 'chest':
        if (!obj.taken) {
          obj.taken = true;
          player.oro += obj.gold;
          emit(state, {
            kind: 'gold_gained',
            amount: obj.gold,
            actor: player.id,
            at,
          });
        }
        break;
      default:
        break;
    }
  }

  const sitio = sitioEn(state, at);
  if (sitio !== null && enUnNodo(state, sitio) && dueñoDelSitio(state, sitio) !== player.id) {
    tomarElNodo(state, sitio, player.id);
    if (sitio.kind === 'ciudad') checkDefeat(state);
  }
}

/**
 * El sitio que pierde quien lo guardaba pasa a `ganador`, con lo que se quedó en
 * él: el del muro (el paso, la base, la ciudad-puente, el pueblo en un nodo), por
 * `tomarElNodo`, que borra su guarnición; el de dentro de una región, que no es de
 * nadie por sí mismo, se queda sin guarnición (`quitarLaGuarnicion`) y es de quien
 * tenga su región. Lo llaman las dos batallas que se pierden en un sitio: la del
 * héroe que lo defendía y la de la guarnición sola.
 */
export function entregarElSitio(state: GameState, sitio: Sitio, ganador: PlayerId): void {
  if (enUnNodo(state, sitio)) tomarElNodo(state, sitio, ganador);
  else quitarLaGuarnicion(state, idDelSitio(sitio));
}

/**
 * Cambia de dueño un sitio del muro: un paso, una ciudad o un pueblo en un nodo.
 * **El único escritor del `owner` de un objeto del mapa** (lo vigila
 * `test/invariantes-partida.test.ts`): es la regla de «un hecho, un sitio», y desde la
 * tarea 2 (05-11-2026) la ciudad tiene una sola cara —su objeto— como el paso:
 * `Town.owner` se fue, y con él las dos copias que divergían en la primera captura
 * (#47: la IA veía enemigo su propio castillo y se pasaba la partida entrando en
 * casa). Un sitio de dentro de una región no se toma: lanza.
 *
 * De quién era se lee ANTES de escribir el dueño nuevo: después ya no hay a quién
 * preguntárselo, y es el dato con el que su dueño de ayer se entera.
 *
 * El sitio tomado pierde la guarnición que tuviera (`quitarLaGuarnicion`): la del
 * dueño de antes, vencida o la que no eligió para defenderlo (D1), o la neutral.
 * Así la guarnición de un sitio del muro es siempre de su dueño. La ciudad mira
 * alrededor con su dueño nuevo.
 */
function tomarElNodo(state: GameState, sitio: Sitio, player: PlayerId): void {
  if (!enUnNodo(state, sitio)) {
    throw new Error(
      `${nombreDelSitio(sitio)} está dentro de una región: no se toma, es de quien tenga la región`,
    );
  }
  const objeto = objetoDelSitio(state, sitio);
  const anterior = objeto.owner;
  objeto.owner = player;
  quitarLaGuarnicion(state, objeto.id);
  // Quien lo toma ya mira desde él, y quien lo pierde vio caer su bandera (la
  // niebla por regiones de main, 02-11-2026), antes de contarlo.
  if (sitio.kind === 'ciudad') revealAroundTown(state, sitio.town);
  else if (objeto.kind === 'node') revealAroundNode(state, objeto);
  vioCaerlo(state, anterior, objeto);
  if (sitio.kind === 'ciudad') {
    emit(state, {
      kind: 'town_captured',
      town: sitio.town.id,
      from: anterior,
      actor: player,
      at: sitio.town.at,
    });
  } else {
    emit(state, {
      kind: 'node_captured',
      node: objeto.id,
      from: anterior,
      actor: player,
      at: objeto.at,
    });
  }
  // Un nodo que cambia de dueño puede cerrar una región, y los grupos que la
  // patrullaban se van. Antes de la nota de abajo y sin ser una derrota.
  dispersarAsaltantes(state);
  // Sin `checkDefeat` aquí, y es a propósito: la captura es UNA parte de lo que
  // pasa, y quien la llama comprueba la derrota al acabar lo suyo. Tomar la base
  // con su héroe dentro es capturar **y después** derrotar al héroe; si la
  // derrota se mirase aquí, `game_over` saldría antes que `hero_defeated`, y
  // eso `emit` ya no lo deja escribir.
}

/**
 * Los grupos cuya región acaba de tener dueño se van. Lo llama `tomarElNodo`, el
 * único sitio donde una región puede ganar dueño:
 * el dueño de una región es una consecuencia de sus nodos.
 */
function dispersarAsaltantes(state: GameState): void {
  for (const { raider, dueño } of dispersados(state)) {
    dejarAsaltante(state, raider.id, []);
    emit(state, { kind: 'raider_dispersed', raider: raider.id, actor: dueño, at: raider.at });
  }
}
