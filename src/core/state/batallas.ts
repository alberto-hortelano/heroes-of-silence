/**
 * Las batallas del mapa: los bandos de ahora (`battleSideForHero` y su vuelta,
 * `restoreHeroFromBattle`), montarlas tras la muralla de su sitio
 * (`montarLaBatalla`), abrirlas y dejarlas pendientes (`abrirBatalla`, `emboscar`),
 * contra qué y dónde (`lugarDelRival`, `sitioQueSeDefiende`), el aviso del ataque
 * (`elAtaque`), la defensa que elige quien defiende su sitio (`defensaPorElegir`,
 * `elegirLaDefensa`), la formación del héroe —la batalla contra nadie que enseña
 * dónde sale cada uno, `batallaDeLaFormacion`, y la acción `formar`— y el clima del
 * tablero. Las dos llamadas a `createBattle` de `state/` son de aquí: la batalla del
 * mapa y la de la formación (lo vigila `invariantes-partida.test.ts`). Lo que pasa
 * al acabar una, en `cierre.ts`.
 *
 * Vivía en `game.ts` hasta la fase N de la reorganización (07-11-2026), que lo
 * repartió por lo que hace.
 */
import { colocarBlocker } from '../battle/despliegue.js';
import { alAsalto, type BattleSide, createBattle, mandoDe } from '../battle/montaje.js';
import type { BattleHero, BattleStack, BattleState, Side } from '../battle/types.js';
import { type Portador, puestoBlocker } from '../equipo/portador.js';
import { gruposAlTope } from '../hero/grupos.js';
import { cuerposDelHeroe, moraleBonus } from '../hero/hero.js';
import { figuraDelHeroe } from '../hero/tipos-de-heroe.js';
import { ejercitoDe, individuosDe, troopsAsStacks, withTroops } from '../hero/troop.js';
import { pointKey } from '../map/geometria.js';
import { estructura, regionDelSitio, regionMasCercana } from '../map/regiones.js';
import type { GameMap } from '../map/tipos.js';
import { lugarDe } from '../mundo/formato.js';
import { mundoDe } from '../mundo/reglas.js';
import { createRng } from '../rng.js';
import { moraleFromBuildings } from '../town/town.js';
import type { Army, FactionId, Hero, Hex, PlayerId, Point, Raider } from '../types.js';
import { raiderById } from './asaltantes.js';
import { type ClimaDeLaPartida, type ClimaDelSitio, climaDeLaRegion } from './clima.js';
import { baseOf, battleOwners, heroById, heroeSuyo, playerById } from './consultas.js';
import { emit } from './cronica.js';
import type { Atacante, BattleFoe } from './events.js';
import {
  casillaDelSitio,
  castilloSuyoDelHeroe,
  defensaDeLaIA,
  delSitio,
  ejercitoDeLaDefensa,
  guarnicionDe,
  idDelSitio,
  type LaDefensa,
  type LineaDeDefensa,
  laDefensa,
  murallaDelSitio,
  nombreDelSitio,
  repartir,
  type Sitio,
  sitioDelHeroe,
  sitioEn,
  sitioPorId,
} from './sitios.js';
import type {
  AdventureAction,
  DefensaElegida,
  Enfrentamiento,
  GameContext,
  GameState,
  PendingBattle,
} from './tipos.js';

// ---------------------------------------------------------------- los bandos y dónde se pelea

/**
 * Si el héroe puede rendirse, y con cuánto oro; o por qué no. Rendirse es
 * volver a la base, así que sin base no hay rendición, y defendiéndola
 * tampoco: no hay a dónde huir.
 *
 * Se mira dónde está el héroe y **en qué bando**, no solo dónde está: un
 * atacante que sale de su castillo a por algo pegado a la muralla también está
 * en su base, y ese sí puede rendirse —vuelve con lo que salve—. Mirar solo
 * `hero.at` se probó y cambiaba 318 líneas del volcado del banco, la primera en
 * la semilla 5, justo por esas salidas.
 */
function retiradaDe(
  state: GameState,
  hero: Hero,
  side: Side,
): { readonly purse: number } | { readonly blocked: string } {
  const base = baseOf(state, hero.owner);
  if (base === null) return { blocked: 'no tienes base a la que volver' };
  if (side === 'defender' && pointKey(base.at) === pointKey(hero.at)) {
    return { blocked: 'defiendes tu base: no hay a dónde huir' };
  }
  return { purse: playerById(state, hero.owner).oro };
}

function battleSideForHero(state: GameState, hero: Hero, side: Side): BattleSide {
  const pueblo = castilloSuyoDelHeroe(state, hero);
  return {
    army: troopsAsStacks(hero.army),
    hero: {
      ...cuerposDelHeroe(hero),
      mando: mandoDe(hero, retiradaDe(state, hero, side)),
      figura: figuraDelHeroe(hero),
      ...(hero.salida === undefined ? {} : { salida: hero.salida }),
    },
    moraleBonus: moraleBonus(hero) + (pueblo === undefined ? 0 : moraleFromBuildings(pueblo)),
  };
}

/**
 * La vuelta de `battleSideForHero`: lo que la batalla mutó y el héroe del mapa
 * se lleva puesto.
 *
 * Vive pegada a la ida porque la inversa estaba escrita DOS veces —el atacante
 * en `settleBattle` y el defensor que sobrevive en `applyDefenderSurvivors`— y
 * la línea del maná hubo que añadirla a cada copia por separado. El camino del
 * defensor solo se ejecuta cuando el atacante pierde, así que el próximo campo
 * que la batalla mute se habría añadido a uno de los dos sitios y habría llegado
 * a partida en verde. Hoy la llama solo `settleBattle`, para los dos héroes.
 */
export function restoreHeroFromBattle(
  mapHero: Hero,
  battleHero: BattleHero | null,
  army: Army,
): void {
  mapHero.army = army;
  // `battleSideForHero` copia el héroe a un objeto aparte, así que lo que se
  // gastó en la batalla no ha tocado al del mapa: hay que traerlo. Sin esta
  // línea el héroe gastaba 12 lanzando y volvía con 20/20 — la magia sería
  // gratis y la recarga del gremio, un adorno.
  if (battleHero !== null) mapHero.mana = battleHero.mana;
}

/**
 * El bando que defiende. Con un héroe, su ejército, que en su sitio es el que
 * eligió de su tropa y de la guarnición antes de montar la batalla
 * (`montarLaBatalla`, `enemyAt`); sin héroe, la guarnición entera.
 */
function defenderSide(state: GameState, foe: BattleFoe): BattleSide {
  switch (foe.kind) {
    case 'monster': {
      const obj = state.map.objects.find((o) => o.id === foe.objectId);
      if (obj === undefined || obj.kind !== 'monster') throw new Error('monstruo no encontrado');
      return {
        // Un monstruo del mapa son `count` individuos: cada uno en su hex. La
        // misma conversión que la tropa de un héroe, no una propia.
        army: troopsAsStacks(withTroops([], obj.creature, obj.count)),
        hero: null,
      };
    }
    case 'hero': {
      const enemigo = heroById(state, foe.heroId);
      return battleSideForHero(state, enemigo, 'defender');
    }
    case 'raider':
      return ladoDeAsaltante(state, foe.raiderId);
    case 'garrison': {
      // La de una ciudad lleva la moral de sus edificios, como cuando era su propia
      // clase de batalla (`town`, hasta la tarea 2).
      const sitio = sitioPorId(state, foe.site);
      return {
        army: troopsAsStacks(guarnicionDe(state, sitio)),
        hero: null,
        ...(sitio.kind === 'ciudad' ? { moraleBonus: moraleFromBuildings(sitio.town) } : {}),
      };
    }
    case 'lugar':
      // La tropa del encuentro, como un grupo de asaltantes: sin héroe ni dueño, y
      // en el tope de tropa de la partida (`gruposAlTope`), como todo lo neutral.
      return {
        army: troopsAsStacks(
          ejercitoDe(gruposAlTope(encuentroDe(state, foe).encuentro.tropa, state.combate.tope)),
        ),
        hero: null,
      };
  }
}

/**
 * El bando de un grupo de asaltantes, ataque o defienda: su tropa y sin héroe.
 * El único sitio que lo construye, para que emboscar y ser atacado no puedan
 * desplegar al mismo grupo de dos maneras.
 */
function ladoDeAsaltante(state: GameState, id: string): BattleSide {
  return { army: troopsAsStacks(ejercitoDe(raiderById(state, id).troops)), hero: null };
}

/** El bando que ataca: el héroe con su tropa, o el grupo que embosca. */
function attackerSide(state: GameState, atacante: Atacante): BattleSide {
  switch (atacante.kind) {
    case 'hero':
      return battleSideForHero(state, heroById(state, atacante.heroId), 'attacker');
    case 'raider':
      return ladoDeAsaltante(state, atacante.raiderId);
  }
}

/** El encuentro de una batalla de un lugar, o lanza. */
export function encuentroDe(state: GameState, foe: Extract<BattleFoe, { kind: 'lugar' }>) {
  const lugar = lugarDe(mundoDe(state).historia, foe.lugar);
  const encuentro = lugar.encuentros[foe.encuentro];
  if (encuentro === undefined) {
    throw new Error(`«${lugar.nombre}» no tiene ningún encuentro "${foe.encuentro}"`);
  }
  return { lugar, encuentro };
}

/**
 * Dónde se libra una batalla: la casilla del DEFENSOR, que es a la que el
 * atacante intentó entrar.
 *
 * Estuvo guardada en `PendingBattle` como una cuarta copia de un hecho que el
 * estado ya tiene, con el argumento de que el evento que cuenta la muerte del
 * perdedor se escribe DESPUÉS de borrarlo del mapa. El argumento solo vale si
 * se deriva ENTONCES, y no hace falta: `settleBattle` la lee una vez al
 * principio, con los dos bandos todavía en pie, y la local sobrevive a todas
 * las mutaciones que vienen detrás.
 *
 * Que el campo desaparezca importa porque `PendingBattle` es estado
 * serializable y #10 lo va a guardar: un campo copiado es un campo que puede
 * volver del disco contradiciendo al mapa, que es la forma exacta de #47.
 */
export function lugarDelRival(state: GameState, foe: BattleFoe): Point {
  switch (foe.kind) {
    case 'monster': {
      const obj = state.map.objects.find((o) => o.id === foe.objectId);
      if (obj === undefined) throw new Error(`el monstruo ${foe.objectId} ya no está en el mapa`);
      return obj.at;
    }
    case 'hero':
      return heroById(state, foe.heroId).at;
    case 'raider':
      return raiderById(state, foe.raiderId).at;
    case 'garrison':
      return casillaDelSitio(sitioPorId(state, foe.site));
    case 'lugar':
      return encuentroDe(state, foe).lugar.at;
  }
}

// ---------------------------------------------------------------- abrir y montar

/**
 * El jugador que protagoniza una batalla: el dueño del héroe que ataca o, si
 * embosca un grupo, el del héroe emboscado. Se lee de `battleOwners`, que es
 * quien sabe de quién es cada bando, en vez de volver a mirar los héroes.
 * Siempre hay uno: toda batalla del mapa lleva un héroe dentro, y el tipo
 * (`Enfrentamiento`) no deja escribir un grupo contra otra cosa.
 */
export function protagonista(state: GameState, pending: Enfrentamiento): PlayerId {
  const dueños = battleOwners(state, pending);
  const quien = dueños.attacker ?? dueños.defender;
  if (quien === null)
    throw new Error('una batalla del mapa sin ningún jugador en ninguno de los dos bandos');
  return quien;
}

/** Prepara la batalla y la deja pendiente: la juega la IA o el jugador. */
export function abrirBatalla(state: GameState, quienes: Enfrentamiento, ctx: GameContext): void {
  const { attacker, foe } = quienes;
  const { defensa, ...lugar } = dejarPendiente(state, quienes, ctx);
  emit(state, { kind: 'battle_started', attacker, foe, ...lugar });
  contarLaDefensa(state, defensa);
}

/**
 * Un grupo embosca a un héroe que anda. `faltan` son los pasos del camino que
 * le quedaban: si no es 0, la marcha se ha cortado antes del destino y el hecho
 * lo lleva escrito, para que quien la cuenta —la nota del agente— no tenga que
 * deducirlo comparando casillas. Emboscado en el destino, llegó: sin `faltan`.
 */
export function emboscar(
  state: GameState,
  raider: Raider,
  hero: Hero,
  faltan: number,
  ctx: GameContext,
): void {
  const attacker = { kind: 'raider', raiderId: raider.id } as const;
  const foe = { kind: 'hero', heroId: hero.id } as const;
  const { defensa, ...lugar } = dejarPendiente(state, { attacker, foe }, ctx);
  emit(
    state,
    faltan > 0
      ? { kind: 'battle_started', attacker, foe, ...lugar, faltan }
      : { kind: 'battle_started', attacker, foe, ...lugar },
  );
  contarLaDefensa(state, defensa);
}

/**
 * Crea la batalla, la deja en `pendingBattle` y dice de quién es y dónde, que
 * es lo que lleva el `battle_started`.
 *
 * Si el defensor es un héroe en un sitio suyo con guarnición, antes de montarla
 * se elige con quién defiende (D1): la propuesta de la IA (`defensaDeLaIA`), que la
 * persona puede rehacer antes de la primera jugada (`elegirLaDefensa`). Montar la
 * batalla no tira (`createBattle` no usa el azar), así que rehacerla no mueve la
 * partida.
 */
function dejarPendiente(
  state: GameState,
  quienes: Enfrentamiento,
  ctx: GameContext,
): { actor: PlayerId; at: Point; defensa: DefensaElegida | null } {
  let defensa: DefensaElegida | null = null;
  if (quienes.foe.kind === 'hero') {
    const hero = heroById(state, quienes.foe.heroId);
    const enJuego = sitioQueSeDefiende(state, quienes.foe);
    const sitio = enJuego?.suyo === true ? enJuego.sitio : null;
    if (sitio !== null && guarnicionDe(state, sitio).length > 0) {
      repartir(state, hero, sitio, defensaDeLaIA(state, hero, sitio));
      defensa = { hero: hero.id, sitio: idDelSitio(sitio) };
    }
  }
  const pending: PendingBattle = {
    ...quienes,
    battle: montarLaBatalla(state, quienes, ctx),
    ...(defensa === null ? {} : { defensa }),
  };
  state.pendingBattle = pending;
  // La casilla se deriva aquí también, y no se toma del paso que abrió la
  // batalla: así el sitio que dice el `battle_started` y el que dice el
  // `battle_ended` no son dos respuestas que puedan dejar de coincidir.
  return {
    actor: protagonista(state, pending),
    at: lugarDelRival(state, quienes.foe),
    defensa,
  };
}

/**
 * Monta el tablero de una batalla del mapa con los bandos de ahora. **La única
 * llamada a `createBattle` de `state/`** (lo vigila `test/invariantes.test.ts`): la
 * hacen la batalla que nace y la defensa que se rehace.
 *
 * Con la muralla del sitio que se defiende (fases 2 y 3 del puesto fronterizo:
 * piedra en una ciudad, madera en un pueblo, la de su obra en un paso,
 * `murallaDelSitio`), y entonces **todo el bando
 * atacante lleva escalera**, el héroe incluido (D8, `alAsalto`): la muralla del
 * mapa cierra, y sin escaleras nadie que ande la cruzaría.
 */
function montarLaBatalla(state: GameState, quienes: Enfrentamiento, ctx: GameContext): BattleState {
  const muralla = murallaDelSitio(sitioQueSeDefiende(state, quienes.foe)?.sitio ?? null);
  // El bando de la persona despliega a mano, en pantalla (fase de despliegue,
  // 02-11-2026): su guarnición también. La IA, el agente y lo que no es de nadie
  // despliegan solos, y sin ningún bando de la persona la batalla nace ya en la
  // ronda 1, como antes: el banco y el agente no se enteran. Rehacer la defensa
  // la vuelve a montar y se despliega otra vez.
  const dueños = battleOwners(state, quienes);
  const aMano = (side: Side, lado: BattleSide): BattleSide => {
    const dueño = dueños[side];
    return dueño !== null && playerById(state, dueño).controller === 'human'
      ? { ...lado, despliegaAMano: true }
      : lado;
  };
  return createBattle(
    aMano('attacker', alAsalto(attackerSide(state, quienes.attacker), muralla)),
    aMano('defender', defenderSide(state, quienes.foe)),
    ctx.rng,
    state.combate,
    muralla,
  );
}

/**
 * El sitio en juego en una batalla contra `foe`.
 *
 * `sitio`: dónde se pelea tras una muralla —la guarnición de una ciudad, un paso o
 * un pueblo, o **el sitio de la casilla del héroe atacado, sea de quien sea** (P3
 * de la tarea 2: el que ocupa un pueblo ajeno también se defiende tras su
 * empalizada)—. `suyo`: si el héroe defiende un sitio suyo (`sitioDelHeroe`: el
 * sitio o la guarnición son de su bando), y entonces elige con quién de la
 * guarnición defiende y, si pierde, lo entrega. El que ocupa un sitio ajeno no
 * tiene nada que entregar: perder lo echa. La guarnición sola, suyo siempre.
 * Un monstruo, un grupo de asaltantes o un lugar no defienden sitio: `null`.
 *
 * **LA pregunta del sitio en juego** (simplify de la fase 2): la leen la defensa
 * que se elige (`dejarPendiente`), la muralla de la batalla (`montarLaBatalla`) y lo
 * que se entrega al perder (`applyVictory`), así que no puede haber una batalla tras
 * la muralla de un sitio que entrega otro.
 */
export function sitioQueSeDefiende(
  state: GameState,
  foe: BattleFoe,
): { readonly sitio: Sitio; readonly suyo: boolean } | null {
  switch (foe.kind) {
    case 'garrison':
      return { sitio: sitioPorId(state, foe.site), suyo: true };
    case 'hero': {
      const hero = heroById(state, foe.heroId);
      const sitio = sitioEn(state, hero.at);
      return sitio === null ? null : { sitio, suyo: sitioDelHeroe(state, hero) !== null };
    }
    case 'monster':
    case 'raider':
    case 'lugar':
      return null;
  }
}

// ---------------------------------------------------------------- el aviso del ataque

/**
 * Un ataque a quien defiende, dicho para el aviso que lo precede (arreglo 3 de la
 * tanda del 06-11-2026: «centrar el lugar del ataque en el mapa y mostrar un popup
 * que diga quién te ataca y muestre dónde»): dónde se pelea, quién ataca, a quién
 * y en qué sitio. Lo arma `elAtaque`; lo dice la sesión.
 */
export interface Ataque {
  /** Dónde se pelea: la casilla de lo atacado (`lugarDelRival`). */
  readonly at: Point;
  /** Quién ataca: un héroe con su facción, o un grupo de asaltantes que embosca. */
  readonly quien:
    | { readonly kind: 'heroe'; readonly nombre: string; readonly faccion: FactionId }
    | { readonly kind: 'asaltantes'; readonly individuos: number };
  /** A quién: un héroe, o la guarnición del sitio, sola. */
  readonly aQuien:
    | { readonly kind: 'heroe'; readonly nombre: string }
    | { readonly kind: 'guarnicion' };
  /** El sitio en juego (`sitioQueSeDefiende`), dicho, o `null` en campo abierto. */
  readonly sitio: { readonly nombre: string; readonly delSitio: string } | null;
  /**
   * La región donde se pelea, por su nombre (`MapRegion.name`): lo que nombra el
   * sitio del ataque en campo abierto (06-11-2026: «embosca a … en (11,5)» no se
   * leía como un lugar). `dentro` si la casilla es de la región; si no (una
   * barrera, un nodo), es la más cercana (`regionMasCercana`). `null` en un mapa
   * sin regiones.
   */
  readonly region: { readonly nombre: string; readonly dentro: boolean } | null;
}

/** La región de la casilla `p` por su nombre, o la más cercana (`Ataque.region`). */
function regionDelAtaque(map: GameMap, p: Point): Ataque['region'] {
  const i = p.y * map.width + p.x;
  const propia = estructura(map).regionDe[i] ?? -1;
  const k = propia >= 0 ? propia : (regionMasCercana(map)[i] ?? -1);
  const region = k < 0 ? undefined : map.regions[k];
  return region === undefined ? null : { nombre: region.name, dentro: propia >= 0 };
}

/**
 * El ataque de la batalla `pending`, o `null` si lo atacado no se defiende: un
 * monstruo, un grupo de asaltantes o un lugar, que solo ataca quien juega.
 */
export function elAtaque(state: GameState, pending: Enfrentamiento): Ataque | null {
  const { foe, attacker } = pending;
  let aQuien: Ataque['aQuien'];
  if (foe.kind === 'hero') aQuien = { kind: 'heroe', nombre: heroById(state, foe.heroId).name };
  else if (foe.kind === 'garrison') aQuien = { kind: 'guarnicion' };
  else return null;
  let quien: Ataque['quien'];
  if (attacker.kind === 'hero') {
    const h = heroById(state, attacker.heroId);
    quien = { kind: 'heroe', nombre: h.name, faccion: playerById(state, h.owner).faction };
  } else {
    quien = {
      kind: 'asaltantes',
      individuos: individuosDe(raiderById(state, attacker.raiderId).troops),
    };
  }
  const enJuego = sitioQueSeDefiende(state, foe);
  const at = lugarDelRival(state, foe);
  return {
    at,
    quien,
    aQuien,
    sitio:
      enJuego === null
        ? null
        : { nombre: nombreDelSitio(enJuego.sitio), delSitio: delSitio(enJuego.sitio) },
    region: regionDelAtaque(state.map, at),
  };
}

// ---------------------------------------------------------------- la defensa de un sitio

/**
 * El hecho de la defensa elegida, detrás del `battle_started` (o de lo que la
 * rehace). Solo la cuenta: que se pueda rehacer lo dice la batalla pendiente.
 */
function contarLaDefensa(state: GameState, defensa: DefensaElegida | null): void {
  if (defensa === null) return;
  const hero = heroById(state, defensa.hero);
  const sitio = sitioPorId(state, defensa.sitio);
  emit(state, {
    kind: 'defense_set',
    hero: hero.id,
    site: idDelSitio(sitio),
    fighting: hero.army.length,
    staying: guarnicionDe(state, sitio).length,
    actor: hero.owner,
    at: hero.at,
  });
}

/**
 * Si la batalla no ha empezado: nadie ha jugado nada todavía (el registro solo
 * trae el comienzo de la primera ronda) y el primer turno sigue abierto, **o aún se
 * despliega** (ronda 0, `BattleState.despliegue`: la batalla de la persona nace
 * desplegando desde la fase de despliegue de `main`, fusionada el 05-11-2026; sin
 * esto, quien defendía su sitio no llegaba a elegir con quién). Hasta entonces se
 * puede rehacer la defensa sin que haya dos batallas distintas; rehacerla vuelve a
 * montar la batalla, y lo que se hubiera colocado se coloca otra vez.
 */
function batallaSinEmpezar(battle: BattleState): boolean {
  const enElPrimerTurno = battle.round === 1 && (battle.turno === null || battle.turno.n === 1);
  const desplegando = battle.round === 0 && battle.despliegue !== null;
  return (
    battle.finished === null &&
    (enElPrimerTurno || desplegando) &&
    battle.golpeEnCurso === null &&
    battle.log.every((e) => e.kind === 'round_start')
  );
}

/** La defensa que `player` puede elegir ahora: quién la hace, dónde, y cómo queda (`laDefensa`). */
export type DefensaPorElegir = LaDefensa & { readonly hero: Hero; readonly sitio: Sitio };

/**
 * Por qué `player` no puede elegir ahora la defensa de su héroe atacado, o `null`:
 * tiene que haber una batalla pendiente en la que **defiende un héroe suyo en un
 * sitio suyo con guarnición** (la que guarda `PendingBattle.defensa`), y sin
 * empezar. No mira lo que se pide: eso lo añade `defensaBlocker`.
 */
function defensaPosible(
  state: GameState,
  player: PlayerId,
): { readonly hero: Hero; readonly sitio: Sitio } | { readonly motivo: string } {
  const pending = state.pendingBattle;
  if (pending === null) return { motivo: 'no hay ninguna batalla pendiente' };
  if (pending.foe.kind !== 'hero') return { motivo: 'en esta batalla no defiende ningún héroe' };
  const hero = heroById(state, pending.foe.heroId);
  if (hero.owner !== player) return { motivo: `${hero.name} no es de tu bando` };
  if (pending.defensa === undefined) {
    return {
      motivo: `${hero.name} no defiende un sitio suyo con guarnición: pelea con su ejército`,
    };
  }
  if (!batallaSinEmpezar(pending.battle)) {
    return { motivo: 'la batalla ya ha empezado: la defensa se elige antes de la primera jugada' };
  }
  return { hero, sitio: sitioPorId(state, pending.defensa.sitio) };
}

/**
 * La defensa que `player` puede elegir ahora, o `null` si no hay ninguna
 * (`defensaPosible`): de cada tipo entre el ejército y la guarnición, cuántos hay,
 * cuántos pelean ahora y cuántos con `pedida`, con el motivo del núcleo para no
 * subir o bajar uno y para no defender así (`laDefensa`). La lee la pantalla de la
 * defensa, que solo lo pinta.
 */
export function defensaPorElegir(
  state: GameState,
  player: PlayerId,
  pedida: readonly LineaDeDefensa[] = [],
): DefensaPorElegir | null {
  const posible = defensaPosible(state, player);
  if ('motivo' in posible) return null;
  const { hero, sitio } = posible;
  return { ...laDefensa(state, hero, sitio, pedida), hero, sitio };
}

/**
 * Por qué `player` no puede defender con `pedida`, o `null`: lo de
 * `defensaPosible` y lo que pide (`ejercitoDeLaDefensa`: los tipos, que los haya,
 * que quepan en su ejército y que lo de fuera quepa en la guarnición).
 */
export function defensaBlocker(
  state: GameState,
  player: PlayerId,
  pedida: readonly LineaDeDefensa[],
): string | null {
  const posible = defensaPosible(state, player);
  if ('motivo' in posible) return posible.motivo;
  const ejercito = ejercitoDeLaDefensa(state, posible.hero, posible.sitio, pedida);
  return 'motivo' in ejercito ? ejercito.motivo : null;
}

/**
 * La persona rehace la defensa de su héroe atacado en su sitio antes de la primera
 * jugada: reparte su ejército y la guarnición con lo que pide y **vuelve a montar
 * la batalla** con los bandos de ahora (`montarLaBatalla`; montar no tira, así que
 * la partida no se mueve). Fuera del turno, como `ascenderVeterano`: la defensa
 * nace en el turno del rival. Lanza con `defensaBlocker`.
 */
export function elegirLaDefensa(
  state: GameState,
  ctx: GameContext,
  player: PlayerId,
  pedida: readonly LineaDeDefensa[],
): void {
  const posible = defensaPosible(state, player);
  if ('motivo' in posible) throw new Error(`no se puede elegir la defensa: ${posible.motivo}`);
  const { hero, sitio } = posible;
  const ejercito = ejercitoDeLaDefensa(state, hero, sitio, pedida);
  if ('motivo' in ejercito) throw new Error(`no se puede elegir la defensa: ${ejercito.motivo}`);
  const pending = state.pendingBattle as PendingBattle;
  repartir(state, hero, sitio, ejercito);
  state.pendingBattle = { ...pending, battle: montarLaBatalla(state, pending, ctx) };
  contarLaDefensa(state, { hero: hero.id, sitio: idDelSitio(sitio) });
}

// ---------------------------------------------------------------- la formación del héroe

/**
 * Por qué no se puede hacer ese `formar`, o `null`. Se forma en cualquier sitio
 * fuera de batalla y sin gastar nada; el turno y el héroe de salida pendiente
 * los mira `applyAdventureAction`, como en `equip`. La casilla la juzga la regla
 * del despliegue (`colocarBlocker`) sobre la batalla de la formación: en el marco
 * del atacante y sin muralla, que es como se guarda; en un intercambio, también
 * si el otro cabe en la casilla que deja `quien`.
 */
export function formarBlocker(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'formar' }>,
): string | null {
  const juicio = juzgarFormar(state, player, action);
  return 'motivo' in juicio ? juicio.motivo : null;
}

/** Lo de `formarBlocker`, con la batalla de la formación que lo juzgó para que la acción la mueva. */
export function juzgarFormar(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'formar' }>,
):
  | { readonly hero: Hero; readonly batalla: BattleState; readonly stack: BattleStack }
  | { readonly motivo: string } {
  const hero = heroeSuyo(state, player, action.hero);
  if ('motivo' in hero) return hero;
  const { quien, at } = action;
  if (!('heroe' in quien)) {
    const sinNadie = puestoBlocker(hero, quien.indice);
    if (sinNadie !== null) return { motivo: sinNadie };
  }
  const batalla = batallaDeLaFormacion(state, hero.id);
  const stack = stackDelPortador(batalla, quien);
  const motivo = colocarBlocker(batalla, stack.id, at);
  return motivo === null ? { hero, batalla, stack } : { motivo };
}

/**
 * La batalla que enseña la formación de `heroId`: su bando de atacante,
 * desplegando a mano, contra nadie. Lo que la tropa enseña es lo que saldrá,
 * porque es el mismo `createBattle` con el mismo `asentar` y las mismas cifras de
 * cada uno (de ellas, su zona); y sobre ella juzga y mueve `formar` con las
 * reglas del despliegue (`colocarBlocker`, `aplicarDespliegue`). La tanda del
 * atacante queda abierta y no se tira nada (el `rng`, de la semilla, no se llega
 * a usar). La leen la vista de la tropa, `formar` y `formacionDe`.
 */
export function batallaDeLaFormacion(state: GameState, heroId: string): BattleState {
  const hero = heroById(state, heroId);
  return createBattle(
    { ...battleSideForHero(state, hero, 'attacker'), despliegaAMano: true },
    { army: [], hero: null },
    createRng(state.seed),
    state.combate,
  );
}

/**
 * El stack de `quien` en una batalla de la formación (`batallaDeLaFormacion`):
 * el héroe por su origen y cada uno de la tropa por su puesto (`slot`). Con
 * `portadorDelStack`, la única traducción entre el portador y su figura del
 * tablero; nadie escribe los ids a mano.
 */
export function stackDelPortador(batalla: BattleState, quien: Portador): BattleStack {
  const s = batalla.stacks.find((x) =>
    'heroe' in quien
      ? x.origen.kind === 'heroe'
      : x.origen.kind !== 'heroe' && x.slot === quien.indice,
  );
  if (s === undefined) {
    const dicho = 'heroe' in quien ? 'el héroe' : `el puesto ${quien.indice}`;
    throw new Error(`la formación no tiene a ${dicho}`);
  }
  return s;
}

/** El portador de un stack de una batalla de la formación: la inversa de `stackDelPortador`. */
export function portadorDelStack(s: Pick<BattleStack, 'origen' | 'slot'>): Portador {
  return s.origen.kind === 'heroe' ? { heroe: true } : { indice: s.slot };
}

/**
 * Dónde sale cada uno de `hero` en el marco del atacante: lo guardado
 * (`Hero.salida`, `Troop.salida`) donde valga, y los demás por la regla de hoy en
 * un hueco libre. La tropa, por su puesto.
 */
export function formacionDe(
  state: GameState,
  hero: Hero,
): { readonly heroe: Hex; readonly tropa: readonly Hex[] } {
  const b = batallaDeLaFormacion(state, hero.id);
  return {
    heroe: stackDelPortador(b, { heroe: true }).hex,
    tropa: hero.army.map((_, indice) => stackDelPortador(b, { indice }).hex),
  };
}
// ------------------------------------------------- el clima de una batalla del mapa
//
// Junto a `lugarDelRival`, que lee la partida y el mundo (el encuentro de un lugar).
// Estaban en `state/clima.ts` hasta la fase N de la reorganización (07-11-2026):
// allí, el clima, que la forma del estado nombra (`GameState.climaPedido`), importaba
// la partida (`game.ts`, que se repartió después y las dejó aquí, junto a
// `lugarDelRival`), que importa `mundo/reglas.ts`, que importa la forma del estado:
// un nudo de tipos entre `state/` y `mundo/`.

/**
 * La región del clima donde se pelea una batalla del mapa: la del sitio de lo
 * atacado (`lugarDelRival`, la casilla del defensor). Es lo que viaja al
 * espectador (`VistaBatalla.region`), que saca de ahí el clima de su tablero.
 */
export function regionDeLaBatalla(state: GameState, pending: PendingBattle): number {
  return regionDelSitio(state.map, lugarDelRival(state, pending.foe));
}

/** El clima que hereda una batalla del mapa: el de la región donde se pelea, con `clima` (lo forzado encima, si lo hay). */
export function climaDeLaBatalla(
  state: GameState,
  clima: ClimaDeLaPartida,
  pending: PendingBattle,
): ClimaDelSitio {
  return climaDeLaRegion(clima, regionDeLaBatalla(state, pending));
}
