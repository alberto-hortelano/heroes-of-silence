/**
 * Los héroes que entran y la tropa que se va: contratar (`hireHero`, **la única
 * puerta de un héroe pagado**, también la del de salida; su regla,
 * `contratarBlocker`, y los candidatos del ayuntamiento), el veterano que se hace
 * héroe (`ascenderVeterano`) y por qué no se licencia tropa (`dismissBlocker`).
 *
 * Vivía en `game.ts` hasta la fase N de la reorganización (07-11-2026), que lo
 * repartió por lo que hace.
 */
import { idsPuestos } from '../equipo/vestir.js';
import { problemaDeTipo, type VeteranoEnBase, veteranosEn } from '../hero/ascenso.js';
import { empezarElDia, heroeRecienHecho } from '../hero/hero.js';
import { EXPERIENCIA_INICIAL_DE_HEROE, RANGO_MAXIMO_DE_TROPA } from '../hero/rango.js';
import { tipoDeHeroePorDefecto, tipoSeInfiltra, tiposDeHeroe } from '../hero/tipos-de-heroe.js';
import { pointKey } from '../map/geometria.js';
import { ECONOMIA } from '../town/economia.js';
import { oroBlocker, type Town } from '../town/town.js';
import type { Army, Hero, PlayerId } from '../types.js';
import { unidadDelJuegoSiExiste } from '../unidad/catalogo.js';
import {
  baseOf,
  casillaDeVuelta,
  hayHuecoDeHeroe,
  heroById,
  heroeEnElPueblo,
  playerById,
  townById,
} from './consultas.js';
import { emit } from './cronica.js';
import { aLaMochila } from './equipar.js';
import {
  ciudadQueMandaBlocker,
  guarnicionDe,
  ponerLaGuarnicion,
  sitioDeLaCiudad,
} from './sitios.js';
import { type GameState, MAX_HEROES_PER_PLAYER, type Player } from './tipos.js';
import { revealAround } from './vision.js';

/**
 * Por qué ese héroe no puede licenciar `count` × `creature` ahora, o `null`.
 * La frase es para la persona: la lanza la acción, y de ahí la leen la barra
 * de la partida (`sesion/partida.ts` enseña el error del núcleo, no redacta) y el
 * agente en su veredicto.
 *
 * En **cualquier casilla** del mapa (09-11-2026, decisión del usuario: «un boton
 * para descartar tropas independiente de esta pantalla»). Hasta entonces solo en
 * un castillo propio, porque licenciar en mitad del camino sería tirar tropa para
 * pasar una emboscada más ligero; esa razón la anuló el usuario. Lo que sigue
 * mandando —su turno y ninguna batalla pendiente o en curso— lo pone
 * `applyAdventureAction` para toda acción de aventura, no esta función.
 */
export function dismissBlocker(hero: Hero, creatureId: string, count: number): string | null {
  if (!Number.isSafeInteger(count) || count < 1) {
    return `son individuos: se licencian de 1 en adelante, no ${count}`;
  }
  // La frase dice el NOMBRE de la criatura y no su id: «"peasant"» era una
  // palabra en inglés en la barra del castillo. Un id que no está en el catálogo
  // —el agente puede mandar cualquier texto— se nombra tal cual, diciendo que no
  // existe, en vez de reventar en `unidadDelJuego` con un error que no es el motivo.
  const especie = unidadDelJuegoSiExiste(creatureId);
  if (especie === null) {
    return `no existe ninguna unidad "${creatureId}", así que ${hero.name} no lleva ninguna`;
  }
  const lleva = hero.army.filter((t) => t.creature === creatureId).length;
  if (lleva === 0) return `${hero.name} no lleva individuos de tipo ${especie.name}`;
  if (count > lleva) {
    return `${hero.name} lleva ${lleva} × ${especie.name} y no puede licenciar ${count}`;
  }
  return null;
}

/**
 * Por qué `quien` no puede contratar en `townId` un héroe del tipo `tipo` (sin él,
 * el de por defecto de la facción del pueblo), o `null` si puede. **La única
 * regla de contratar**, también la del héroe de salida: la leen `hireHero` (que
 * lanza con ella), la IA (`planHires`) y los candidatos de la pantalla
 * (`candidatosAHeroe`). No mira
 * el turno: eso es de `turnBlocker`.
 *
 * Con el de salida pendiente, solo en su base y con el oro; sin él, lo de
 * siempre: el tope de héroes y que no haya nadie dentro.
 */
export function contratarBlocker(
  state: GameState,
  quien: PlayerId,
  townId: string,
  tipo?: string,
): string | null {
  const town = townById(state, townId);
  const player = playerById(state, quien);
  // Ocupada, no se contrata (pregunta 4 de la tarea 2): lo dice su frase.
  const manda = ciudadQueMandaBlocker(state, town, player.id);
  if (manda !== null) return manda;
  if (player.heroeDeSalida !== null) {
    if (player.base !== town.id) {
      return `tu héroe de salida se elige en tu base, ${baseDe(state, player)}`;
    }
  } else {
    if (!hayHuecoDeHeroe(state, player.id)) {
      return `ya tienes el máximo de héroes (${MAX_HEROES_PER_PLAYER})`;
    }
    if (state.heroes.some((h) => pointKey(h.at) === pointKey(town.at))) {
      return `ya hay un héroe en ${town.name}`;
    }
  }
  if (tipo !== undefined) {
    const tipoMalo = problemaDeTipo(town.faction, tipo);
    if (tipoMalo !== null) return tipoMalo;
  }
  return oroBlocker(ECONOMIA.precioDelHeroe, player.oro);
}

/** El nombre de la base de `player`, o «ninguna» (para las frases). */
function baseDe(state: GameState, player: Player): string {
  return player.base === null ? 'que no tienes' : townById(state, player.base).name;
}

/**
 * Por qué `quien` no puede hacer nada más que elegir su héroe de salida, o `null`
 * si no lo tiene pendiente. La mira `applyAdventureAction` para toda acción salvo
 * `hire_hero`, y la enseña la pantalla en lo que apaga (reclutar, construir,
 * pasar el turno). Solo mira el de salida: sin héroes a media partida se juega.
 */
export function salidaPendienteBlocker(state: GameState, quien: PlayerId): string | null {
  const player = playerById(state, quien);
  if (player.heroeDeSalida === null) return null;
  return `antes de nada, elige a tu héroe de salida ante el ayuntamiento de ${baseDe(state, player)}`;
}

/**
 * Contrata en `townId` un héroe del tipo `tipo` para `quien`, pagando el precio de
 * todo héroe (`ECONOMIA.precioDelHeroe`). **La única puerta por la que entra un
 * héroe pagado**: la de salida y la de después.
 *
 * Con el de salida pendiente lo asienta: el que hizo `newGame` (nombre, cifras y
 * tropa de su tirada), con el tipo elegido, en su base, **sin hecho en la
 * crónica** (el de salida nunca lo tuvo). Sin él, uno nuevo, 1/1 y sin tropa.
 * Ninguno recoge la guarnición: la tropa entre héroe y sitio la mueven solo
 * `dejar_tropa`, `recoger_tropa` y la defensa (la recogida automática se retiró
 * el 04-11-2026).
 *
 * Sin esto, perder al único héroe deja al jugador inerte para siempre: conserva
 * el castillo, así que no está derrotado, pero no puede volver a mover una sola
 * pieza. La partida se quedaba encallada hasta el límite de días.
 */
export function hireHero(state: GameState, quien: PlayerId, townId: string, tipo?: string): void {
  const motivo = contratarBlocker(state, quien, townId, tipo);
  if (motivo !== null) throw new Error(`no se puede contratar un héroe: ${motivo}`);
  const town = townById(state, townId);
  const player = playerById(state, quien);
  player.oro -= ECONOMIA.precioDelHeroe;

  const pendiente = player.heroeDeSalida;
  if (pendiente !== null) {
    const hero: Hero = { ...pendiente, tipo: tipo ?? pendiente.tipo };
    empezarElDia(hero);
    // En el orden de los jugadores, como cuando nacían todos juntos: quien lee
    // `state.heroes` (la IA, los paneles) ve lo mismo eligiendo que sin elegir.
    const puesto = state.players.findIndex((p) => p.id === player.id);
    const detras = state.heroes.findIndex(
      (h) => state.players.findIndex((p) => p.id === h.owner) > puesto,
    );
    state.heroes.splice(detras === -1 ? state.heroes.length : detras, 0, hero);
    player.heroeDeSalida = null;
    revealAround(state, hero);
    return;
  }

  // La `c` (de «contratado») lo separa del inicial, `hero-<jugador>`, y del
  // ascendido, `hero-veterano-<n>`: los tres viven en el mismo espacio de ids.
  const id = `hero-${player.id}-c${state.siguienteHeroe++}`;
  const hero = heroeRecienHecho({
    id,
    owner: player.id,
    name: nombreDelContratado(town),
    faction: town.faction,
    at: town.at,
    experience: EXPERIENCIA_INICIAL_DE_HEROE,
    tipo: tipo ?? tipoDeHeroePorDefecto(town.faction),
  });
  empezarElDia(hero);

  state.heroes.push(hero);
  emit(state, {
    kind: 'hero_hired',
    hero: id,
    town: town.id,
    actor: player.id,
    at: town.at,
  });

  revealAround(state, hero);
}

/** El nombre de un héroe contratado en `town`: lo leen `hireHero` y los candidatos. */
function nombreDelContratado(town: Town): string {
  return `Capitán de ${town.name}`;
}

/** Un tipo de héroe que se puede contratar en un pueblo: lo que enseña su ficha. */
export interface CandidatoAHeroe {
  /** El id de su tipo (`data/tipos-de-heroe.json`), el que lleva `hire_hero`. */
  readonly tipo: string;
  /** El nombre de su tipo y lo que dice de él el cuaderno. */
  readonly nombreDelTipo: string;
  readonly descripcion: string;
  readonly precio: number;
  /**
   * Si el tipo se infiltra (`tipoSeInfiltra`, `data/infiltradores.json`): con toda
   * su tropa con el rasgo, cruza barreras a un día por casilla (`hero/infiltracion.ts`).
   */
  readonly seInfiltra: boolean;
  /** Por qué no se puede contratar (`contratarBlocker`; el turno no), o `null`. */
  readonly motivo: string | null;
}

/** La elección de héroe en un pueblo: lo que no depende del tipo, una vez, y los candidatos. */
export interface EleccionDeHeroe {
  /** El nombre que llevará, sea cual sea el tipo: el del de salida o el del contratado. */
  readonly nombre: string;
  /**
   * La tropa con que sale el de salida, la misma con cualquier tipo; `null`: es
   * una contratación, y el contratado sale sin ninguna.
   */
  readonly tropa: Army | null;
  readonly candidatos: readonly CandidatoAHeroe[];
}

/**
 * Los héroes que `quien` puede contratar en `townId`: **uno por tipo** de la
 * facción del pueblo, en el orden del cuaderno (el de por defecto, el primero),
 * sin sorteo. La única lista de candidatos: la leen la escena del ayuntamiento y
 * su panel. Todos cuestan lo mismo y salen con lo mismo; lo que cambia es la
 * figura, el texto y si se infiltra (la única regla que da un tipo, 05-11-2026).
 * No mira el turno: eso lo pone
 * quien enseña la lista (la sesión sabe además del turno del rival en curso).
 */
export function candidatosAHeroe(
  state: GameState,
  quien: PlayerId,
  townId: string,
): EleccionDeHeroe {
  const town = townById(state, townId);
  const pendiente = playerById(state, quien).heroeDeSalida;
  return {
    nombre: pendiente?.name ?? nombreDelContratado(town),
    tropa: pendiente?.army ?? null,
    candidatos: tiposDeHeroe(town.faction).map((t) => ({
      tipo: t.id,
      nombreDelTipo: t.nombre,
      descripcion: t.descripcion,
      precio: ECONOMIA.precioDelHeroe,
      seInfiltra: tipoSeInfiltra(town.faction, t.id),
      motivo: contratarBlocker(state, quien, townId, t.id),
    })),
  };
}

/**
 * Los veteranos de rango máximo que `player` tiene en su base ahora mismo: en la
 * guarnición y en la tropa de su héroe que está allí (`veteranosEn`). Sin base,
 * ninguno: no hay dónde hacerse héroe.
 */
export function veteranosEnSuBase(state: GameState, player: PlayerId): VeteranoEnBase[] {
  const base = baseOf(state, player);
  return base === null
    ? []
    : veteranosEn(base, guarnicionDe(state, sitioDeLaCiudad(base)), heroeEnElPueblo(state, base));
}

/**
 * **La regla del ascenso**, una vez: el veterano `veteranoId` de `player` que puede
 * hacerse héroe de tipo `heroType`, o por qué no, en su orden: la base, el nivel, el
 * hueco de héroe y el tipo que pidió el narrador (`problemaDeTipo`). Con **la única
 * búsqueda del veterano**: da la frase a `ascensoBlocker` y el veterano a
 * `ascenderVeterano`, que no lo busca otra vez (hasta la fase N de la reorganización,
 * 07-11-2026, la acción repetía las dos mitades).
 *
 * «No está en tu base» cubre también al que ya se hizo héroe: al ascender sale
 * de la tropa, así que un segundo intento con el mismo id no lo encuentra. Es lo
 * que hace que un individuo no dé dos héroes, sin un registro aparte que
 * mantener al día.
 */
function juzgarAscenso(
  state: GameState,
  player: PlayerId,
  veteranoId: string,
  heroType: string,
): VeteranoEnBase | { readonly motivo: string } {
  if (baseOf(state, player) === null) {
    return { motivo: 'no tienes base: un veterano solo se hace héroe en ella' };
  }
  const v = veteranosEnSuBase(state, player).find((x) => x.veterania.id === veteranoId);
  if (v === undefined) {
    return {
      motivo: `el veterano "${veteranoId}" no está en tu base con rango ${RANGO_MAXIMO_DE_TROPA}: solo se hace héroe quien llega al tope y está allí`,
    };
  }
  if (!hayHuecoDeHeroe(state, player)) {
    return {
      motivo: `ya tienes ${MAX_HEROES_PER_PLAYER} de ${MAX_HEROES_PER_PLAYER} héroes: el veterano espera en la base hasta que haya sitio`,
    };
  }
  const tipoMalo = problemaDeTipo(playerById(state, player).faction, heroType);
  return tipoMalo === null ? v : { motivo: tipoMalo };
}

/**
 * Por qué el veterano `veteranoId` de `player` no puede hacerse héroe de tipo
 * `heroType`, o `null` si puede: la regla del ascenso (`juzgarAscenso`). Su frase
 * es la que el director le devuelve al narrador cuando `ascenderVeterano` lanza con
 * ella, así que está escrita para que la lea él.
 */
export function ascensoBlocker(
  state: GameState,
  player: PlayerId,
  veteranoId: string,
  heroType: string,
): string | null {
  const juicio = juzgarAscenso(state, player, veteranoId, heroType);
  return 'motivo' in juicio ? juicio.motivo : null;
}

/**
 * El veterano `veteranoId` de `player` se hace héroe con lo que eligió el
 * narrador: **nace en la base** —en su casilla o, si la ocupa otro héroe, en la
 * primera libre de al lado (`casillaDeVuelta`)—, con la experiencia del
 * individuo (la del tope o más, así que héroe de ese nivel o más: una sola
 * escala), las cifras del contratado, el ejército vacío y **sin movimiento** el
 * día en que nace. El individuo sale de donde estaba: la guarnición o la tropa
 * del héroe que lo llevaba.
 *
 * **Nadie recoge la guarnición** (04-11-2026): recogía el de la casilla del
 * castillo porque con el héroe dentro la ciudad la defendía «solo él con su
 * tropa», y la guarnición se quedaba fuera de la batalla. Desde que el héroe que
 * defiende su sitio elige con quién de su ejército y de la guarnición
 * (`defensaDeLaIA`, `elegirLaDefensa`), la guarnición pelea aunque no la lleve.
 *
 * El id es `hero-<id del veterano>`, único porque el del veterano lo es y porque
 * el individuo sale de la tropa al ascender; el de `hireHero` es
 * `hero-<jugador>-c<n>`, con su propio contador (`siguienteHeroe`).
 *
 * Lanza con la frase de `ascensoBlocker` (`juzgarAscenso`) si no puede.
 */
export function ascenderVeterano(
  state: GameState,
  player: PlayerId,
  veteranoId: string,
  eleccion: { readonly name: string; readonly story: string; readonly heroType: string },
): Hero {
  const v = juzgarAscenso(state, player, veteranoId, eleccion.heroType);
  if ('motivo' in v) throw new Error(`no se puede hacer héroe: ${v.motivo}`);

  const fuera = (army: Army): Army => army.filter((t) => t.veterania?.id !== veteranoId);
  if (v.heroe === null) {
    const sitio = sitioDeLaCiudad(v.base);
    ponerLaGuarnicion(state, sitio, player, fuera(guarnicionDe(state, sitio)));
  } else {
    const portador = heroById(state, v.heroe);
    portador.army = fuera(portador.army);
  }

  const hero = heroeRecienHecho({
    id: `hero-${veteranoId}`,
    owner: player,
    name: eleccion.name,
    faction: playerById(state, player).faction,
    at: v.base.at,
    experience: v.veterania.experiencia,
    tipo: eleccion.heroType,
    origen: { creature: v.creature, historia: eleccion.story },
  });
  // Nace con su equipo base, como todo héroe (`heroeRecienHecho`), y lo que
  // llevaba puesto de tropa se lo lleva en la mochila: es suyo, y el usuario lo
  // pidió así en vez de que sustituyera al base.
  aLaMochila(hero, ...idsPuestos(v.veterania.equipo));
  hero.at = casillaDeVuelta(state, hero, v.base);
  state.heroes.push(hero);
  emit(state, {
    kind: 'hero_promoted',
    hero: hero.id,
    town: v.base.id,
    creature: v.creature,
    name: hero.name,
    actor: player,
    at: hero.at,
  });
  revealAround(state, hero);
  return hero;
}
