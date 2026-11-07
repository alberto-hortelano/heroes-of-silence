/**
 * La petición del turno de aventura (`serializeAdventureTurn`) y las que nacen de
 * él: el ascenso de un veterano a héroe (`serializeHeroFromTroop`) y las voces de la
 * base (`serializeTownVoices`).
 *
 * Era parte de `serialize.ts`, que se partió en la fase N de la reorganización
 * (07-11-2026) en `vistas.ts`, `mapa-conocido.ts`, `aventura.ts`, `batalla.ts` y
 * `peticion-de-mapa.ts`.
 */
import { formaDeLaBatalla } from '../battle/formas-de-la-rueda.js';
import { cifrasDeUnidad, unidadDelJuego } from '../catalogo.js';
import { vecinosDeLaBase, vozDe } from '../gente/voces.js';
import type { VeteranoEnBase } from '../hero/ascenso.js';
import { PIEZAS_DE_ARMERIA } from '../hero/equipo.js';
import {
  RANGO_MAXIMO_DE_TROPA,
  rangoDeHeroe,
  rangoDeTropa,
  siguienteUmbral,
} from '../hero/experiencia.js';
import { fuerzaDe } from '../hero/fuerza.js';
import { type Hero, heroUnit, maxMana, maxMovePoints } from '../hero/hero.js';
import { infiltracionBlocker } from '../hero/infiltracion.js';
import { tiposDeHeroe } from '../hero/tipos-de-heroe.js';
import { armyLeadership, GARRISON_LEADERSHIP, heroLeadership } from '../hero/troop.js';
import { sitioEnUnNodo } from '../map/regiones.js';
import { nivelDeUnidad } from '../nivel.js';
import { climaDeLaPartida, pedidoVigente } from '../state/clima.js';
import {
  hayHuecoDeHeroe,
  heroeEnLaBase,
  heroesOf,
  playerById,
  townsOf,
  week,
} from '../state/consultas.js';
import { cronicaPara } from '../state/events.js';
import {
  baseOf,
  heroesALaVista,
  ordenDelDia,
  veteranosEnSuBase,
  visibleNow,
} from '../state/game.js';
import { type RentaDelDia, rentaDelDia } from '../state/renta.js';
import {
  casillaDelSitio,
  ciudadQueMandaBlocker,
  dueñoDelSitio,
  guarnicionDeLaCiudad,
  ocupadoBlocker,
  type Sitio,
  sitioDeLaCiudad,
  sitioPorId,
} from '../state/sitios.js';
import { type GameState, MAX_HEROES_PER_PLAYER } from '../state/tipos.js';
import { building } from '../town/buildings.js';
import { construidoEn } from '../town/sitios.js';
import {
  availableBuildings,
  dwellings,
  mageGuildLevel,
  type Town,
  tieneArmeria,
  townSpells,
} from '../town/town.js';
import type { PlayerId } from '../types.js';
import { serializeKnownMap } from './mapa-conocido.js';
import { armyView, equipoView } from './vistas.js';
import { ruedaAlAgente, SLOT_DE_HUECO } from './vocabulario.js';

/**
 * Si un héroe se infiltra (`infiltrates`) y, si no, por qué
 * (`infiltrationBlocker`, `infiltracionBlocker`): sin el motivo, el agente no
 * sabría a quién licenciar o qué tipo contratar para cruzar barreras.
 */
function infiltracionVista(
  h: Hero,
): { infiltrates: true } | { infiltrates: false; infiltrationBlocker: string } {
  const motivo = infiltracionBlocker(h);
  return motivo === null
    ? { infiltrates: true }
    : { infiltrates: false, infiltrationBlocker: motivo };
}

/**
 * La renta del día como la lee el agente (`you.income`): el total y de dónde
 * sale, cada ciudad suya con lo que da su ayuntamiento y cada pueblo suyo con lo
 * suyo (0 y `connected: false` el que está cortado de la base; `rentaDelDia`, un
 * hecho en un sitio).
 */
function incomeView(r: RentaDelDia) {
  return {
    total: r.total,
    // `occupied`: por qué no da nada aunque esté unida (`ocupadoBlocker`), o `null`.
    towns: r.ciudades.map((c) => ({
      id: c.id,
      gold: c.oro,
      connected: c.unida,
      occupied: c.ocupada,
    })),
    villages: r.pueblos.map((p) => ({
      id: p.id,
      name: p.nombre,
      gold: p.oro,
      connected: p.unido,
      occupied: p.ocupada,
    })),
  };
}

/**
 * La línea que dice al agente que hay veteranos de rango máximo en su base a
 * los que **no** se pregunta porque el tope de héroes está lleno, o nada si no
 * los hay. Antes eso iba solo a la consola del director (M4 de QA): el agente
 * tenía que deducirlo de un `rank: 5` en la guarnición, su cuenta de héroes y
 * la prosa. Se deriva de las dos mismas preguntas que hace el director para no
 * preguntar —`veteranosEnSuBase` y `hayHuecoDeHeroe`—, así que no puede decir
 * otra cosa que lo que pasó. Va solo cuando aplica, como `story`.
 */
function veteranosEsperando(
  state: GameState,
  playerId: PlayerId,
): { readonly veteransWaiting?: string } {
  if (hayHuecoDeHeroe(state, playerId)) return {};
  const n = veteranosEnSuBase(state, playerId).length;
  if (n === 0) return {};
  const quien =
    n === 1
      ? `1 veterano de rango ${RANGO_MAXIMO_DE_TROPA} espera`
      : `${n} veteranos de rango ${RANGO_MAXIMO_DE_TROPA} esperan`;
  return {
    veteransWaiting: `${quien} en tu base para hacerse héroe, pero ya tienes ${MAX_HEROES_PER_PLAYER} de ${MAX_HEROES_PER_PLAYER} héroes: no se te preguntará hasta que haya sitio.`,
  };
}

/** El clima de hoy de las regiones que `playerId` ha explorado (`world.weather`). */
function climaALaVista(state: GameState, playerId: PlayerId) {
  const fog = playerById(state, playerId).fog;
  const clima = climaDeLaPartida(state);
  return state.map.regions.flatMap((reg, k) => {
    if (!fog.has(reg.at)) return [];
    const hoy = clima.regiones[k];
    if (hoy === undefined) return [];
    const pedido = pedidoVigente(state, reg.id);
    return [
      {
        region: reg.name,
        at: reg.at,
        weather: hoy.tiempo,
        night: hoy.noche,
        ...(pedido === undefined ? {} : { until: pedido.hasta }),
      },
    ];
  });
}

/** Cómo se llama cada clase de sitio en el contrato: la del objeto del mapa. */
const KIND_DEL_SITIO: Readonly<Record<Sitio['kind'], 'node' | 'village' | 'town'>> = {
  paso: 'node',
  pueblo: 'village',
  ciudad: 'town',
};

/**
 * Las guarniciones de `playerId` en pasos, pueblos y ciudades que no son suyas
 * (la que se quedó en un sitio que cambió de dueño, P1: se recoge, no se deja), en
 * el orden en que se dejaron: dónde, qué sitio y su tropa, agrupada como un
 * ejército (`armyView`). La de cada ciudad suya va en `towns[].garrison`. La ajena
 * no viaja: no se ve hasta pisarla.
 */
function guarnicionesView(state: GameState, playerId: PlayerId) {
  const out = [];
  for (const [id, g] of Object.entries(state.guarniciones)) {
    if (g.dueño !== playerId) continue;
    const sitio = sitioPorId(state, id);
    if (sitio.kind === 'ciudad' && dueñoDelSitio(state, sitio) === playerId) continue;
    out.push({
      site: id,
      kind: KIND_DEL_SITIO[sitio.kind],
      at: casillaDelSitio(sitio),
      army: armyView(g.tropa),
    });
  }
  return out;
}

export function serializeAdventureTurn(state: GameState, playerId: PlayerId) {
  const player = playerById(state, playerId);

  // `visibleNow` otra vez —`knownObjects` levanta el suyo—, y aquí se usa para
  // lo que no es el mapa: qué héroes enemigos se están viendo AHORA.
  const mirando = visibleNow(state, playerId);
  // Una cuenta para `you.income` y el `income` de cada ciudad: lo que da de verdad.
  const renta = rentaDelDia(state, playerId);

  return {
    kind: 'adventure_turn',
    you: {
      player: playerId,
      faction: player.faction,
      day: state.day,
      week: week(state),
      // El de hoy, sin los eliminados: con él sabe si cierra el día (y vuelve a
      // jugar enseguida) o lo abre (y el rival juega dos seguidos).
      turnOrder: ordenDelDia(state.players, state.day).filter(
        (id) => !playerById(state, id).defeated,
      ),
      // El oro, el único recurso, y lo que cobrará al empezar su
      // próximo turno con de dónde sale: la cuenta del núcleo (`rentaDelDia`),
      // la misma que suma `startTurn`.
      gold: player.oro,
      income: incomeView(renta),
      // La complejidad del combate de la partida: cuántos individuos por bando,
      // héroe incluido (y lo neutral, recortado a eso), y la rueda de toda batalla.
      combat: {
        troopCap: state.combate.tope,
        wheel: ruedaAlAgente(formaDeLaBatalla(state.combate)),
      },
      // Lo que guarda cada paso y cada pueblo suyo (`GameState.guarniciones`), y lo
      // suyo que se quedó en un sitio que ya no es suyo, también en una ciudad; la
      // de cada ciudad suya va en `towns[].garrison`. Va con su línea en
      // RESPONSE_FORMAT (GUARNICIONES).
      garrisons: guarnicionesView(state, playerId),
    },
    // El clima de hoy (presentación: `state/clima.ts`), solo de las regiones
    // cuya casilla de referencia se ha explorado, como el resto del mapa; con
    // `until` lo que pidió el narrador y hasta cuándo dura.
    world: { weather: climaALaVista(state, playerId) },
    // A dónde vuelve un héroe derrotado o rendido, o `null` si ya no tiene base:
    // decide si rendirse existe y qué cuesta perder un héroe.
    yourBase: baseOf(state, playerId)?.id ?? null,
    ...veteranosEsperando(state, playerId),
    heroes: heroesOf(state, playerId).map((h) => ({
      id: h.id,
      name: h.name,
      // El tipo y la historia si nació de la tropa. Van con su línea en
      // `RESPONSE_FORMAT`, como todo campo de aquí.
      type: h.tipo,
      ...(h.origen === undefined ? {} : { story: h.origen.historia }),
      // Si cruza barreras (`hero/infiltracion.ts`), y si no, por qué: sin el
      // motivo el agente no sabría a quién licenciar para que se infiltre.
      ...infiltracionVista(h),
      at: h.at,
      // El rango con su experiencia y el umbral del siguiente, como una fila de
      // veterano de `army`: la escala es una sola (el héroe empieza en el 5,
      // donde la tropa acaba), así que las dos se leen igual. Y su nivel, el de
      // su cuerpo con su equipo (`nivelDeUnidad`), que es con el que pega y recibe
      // los golpes. Va con su línea en `RESPONSE_FORMAT`: un dato que el contrato no
      // nombra no lo mira nadie.
      rank: rangoDeHeroe(h),
      level: nivelDeUnidad(heroUnit(h)),
      experience: h.experience,
      nextRankAt: siguienteUmbral(h.experience),
      movePoints: h.movePoints,
      maxMovePoints: maxMovePoints(h),
      attack: h.attack,
      defense: h.defense,
      spellPower: h.spellPower,
      knowledge: h.knowledge,
      mana: `${h.mana}/${maxMana(h)}`,
      // Sin esto el agente decide adónde caminar sin saber qué sabe su héroe: la
      // batalla le ofrece los `cast` legales, pero para entonces ya ha elegido.
      spells: h.spells,
      army: armyView(h.army),
      // Lo que ocupa su ejército y su tope. El tope crece con el rango y un
      // `recruit` que se pase se rechaza: sin las dos cifras delante, el agente
      // solo se enteraría al leer el veredicto.
      leadership: { used: armyLeadership(h.army), max: heroLeadership(h) },
      // Su fuerza, la misma medida que la de los asaltantes de `knownMap`: sin
      // las dos cifras el agente no puede saber si un grupo lo emboscará.
      strength: fuerzaDe(h),
      // Lo que lleva puesto y lo que lleva en la mochila, por id: el catálogo
      // con las cifras va en `RESPONSE_FORMAT`, no en cada turno.
      equipment: equipoView(h.equipo),
      backpack: [...h.mochila],
    })),
    towns: townsOf(state, playerId).map((t) => {
      const guarnicion = guarnicionDeLaCiudad(state, t);
      // Lo que se le ofrece sale de las reglas que lo juzgan (vuelta 1 de QA de la
      // tarea 2, H3): la ocupada ni construye ni recluta (`ciudadQueMandaBlocker`,
      // la misma pregunta que `build` y `recruit`), así que sus listas van vacías,
      // y su `income` es lo que da hoy (`rentaDelDia`: 0 ocupada o cortada).
      const manda = ciudadQueMandaBlocker(state, t, playerId);
      return {
        id: t.id,
        name: t.name,
        at: t.at,
        income: renta.ciudades.find((c) => c.id === t.id)?.oro ?? 0,
        mageGuild: mageGuildLevel(t),
        // Ids, como `buildings` y `recruitable`: el detalle lo da la tool
        // `spell_list` y no hace falta repetirlo en cada turno.
        teaches: townSpells(t).map((s) => s.id),
        builtToday: t.builtToday,
        buildings: t.buildings,
        canBuildNow: (manda === null ? availableBuildings(t, player.oro) : []).map((id) => ({
          id,
          name: building(id).name,
          cost: building(id).cost,
        })),
        recruitable: (manda === null ? dwellings(t) : []).map(({ creature: id }) => ({
          creature: id,
          available: t.available[id] ?? 0,
          cost: unidadDelJuego(id).oro,
          leadership: unidadDelJuego(id).leadership,
        })),
        garrison: armyView(guarnicion),
        garrisonLeadership: {
          used: armyLeadership(guarnicion),
          max: GARRISON_LEADERSHIP,
        },
        // Si está en el muro (se toma como un paso) o dentro de su región (es de
        // quien la tenga), y por qué no recluta, ni construye, ni da oro, si está
        // ocupada (`ocupadoBlocker`), o `null`.
        node: sitioEnUnNodo(state.map, t.id),
        occupied: ocupadoBlocker(state, sitioDeLaCiudad(t), playerId),
        // Solo si la tiene: lo que vende y a qué precio. Una lista vacía en cada
        // pueblo sin armería engordaría el turno para no decir nada.
        ...(tieneArmeria(t)
          ? {
              armory: PIEZAS_DE_ARMERIA.map((p) => ({
                item: p.id,
                slot: SLOT_DE_HUECO[p.hueco],
                cost: p.precio,
              })),
            }
          : {}),
      };
    }),
    // Solo lo que este jugador ha OBSERVADO, y tal como lo observó. El agente no
    // ve por las paredes, y tampoco ve el futuro de una casilla que dejó atrás:
    // `lastSeen` dice de qué día es cada dato, y si es de ayer puede haber
    // dejado de ser verdad.
    //
    // Es **la misma llamada** que responde la tool `map`, y esa es toda la
    // garantía de que las dos devuelven lo mismo (#85). Aquí había un
    // `{width, height, objects}` escrito a mano: el agente elegía el destino de
    // cada `move_hero` sin saber por dónde se anda, mientras `MAPA_DESCRIPCION`
    // le prometía que la tool traía «lo mismo que viaja en knownMap». Lo que lo
    // vuelve a separar no es olvidarse de un campo, es escribir un segundo
    // serializador.
    knownMap: serializeKnownMap(state, playerId),
    // Un héroe enemigo se ve o no se ve: no hay recuerdo que mandar, porque una
    // posición de anteayer es ruido y no intel. Antes bastaba con haber pisado
    // esa casilla alguna vez, así que el agente seguía al rival por medio mapa
    // sin tener a nadie cerca.
    // La regla es `heroesALaVista`, la misma que pinta el lienzo de quien juega.
    enemyHeroes: heroesALaVista(state, playerId, mirando)
      .filter((h) => h.owner !== playerId)
      .map((h) => ({
        id: h.id,
        owner: h.owner,
        at: h.at,
        army: armyView(h.army),
      })),
    // La crónica pasa por la niebla, igual que el mapa desde #35: antes iba el
    // log ENTERO y el agente le seguía los pasos al rival leyendo su diario. La
    // regla completa —a quién le consta, cuántos caben y el sello que se queda
    // en casa— la escribe `cronicaPara`, y el porqué con su medida está en la
    // cabecera de `events.ts`. Aquí solo se dice el tamaño de la ventana.
    recentEvents: cronicaPara(state, playerId, 25),
  };
}

/**
 * La petición `hero_from_troop`: el veterano que se hace héroe, lo que fue y lo
 * que puede elegir.
 *
 * La hoja de servicios viaja entera —batallas, bajas y los nombres de los
 * héroes que derribó— porque es la materia con la que el narrador escribe la
 * historia: «el héroe lo crea la IA en base al personaje». `heroTypes` son los
 * de la facción del JUGADOR, que es la del héroe que nace, y `heroes` el tope,
 * para que la petición no prometa un sitio que no hay (con el tope lleno no se
 * pide: `Director`).
 */
export function serializeHeroFromTroop(state: GameState, playerId: PlayerId, v: VeteranoEnBase) {
  const player = playerById(state, playerId);
  return {
    kind: 'hero_from_troop',
    you: { player: playerId, faction: player.faction },
    veteran: {
      id: v.veterania.id,
      creature: v.creature,
      creatureName: unidadDelJuego(v.creature).name,
      rank: rangoDeTropa(v.veterania),
      level: nivelDeUnidad(cifrasDeUnidad(v.creature, v.veterania)),
      experience: v.veterania.experiencia,
      battles: v.veterania.batallas,
      kills: v.veterania.bajas,
      heroesDefeated: v.veterania.heroes,
      // Dónde está ahora: en la guarnición o en la tropa de qué héroe.
      in: v.heroe === null ? 'garrison' : { hero: v.heroe },
    },
    town: { id: v.base.id, name: v.base.name },
    heroTypes: tiposDeHeroe(player.faction).map((t) => ({
      id: t.id,
      name: t.nombre,
      description: t.descripcion,
    })),
    heroes: { count: heroesOf(state, playerId).length, max: MAX_HEROES_PER_PLAYER },
  };
}

/**
 * La petición `town_voices`: las bases de `playerId` cuyas voces hay que rehacer,
 * con su gente y lo que dice ahora.
 *
 * Lleva lo que da de qué hablar —qué hay construido, quién está dentro, cuánta
 * guarnición la guarda— y la crónica corta (10 hechos, por la niebla como
 * todo): el narrador escribe para esta semana, no un informe. La instrucción
 * «presentación, nunca reglas» va en la prosa del formato (`RESPONSE_FORMAT`).
 */
export function serializeTownVoices(state: GameState, playerId: PlayerId, towns: readonly Town[]) {
  const player = playerById(state, playerId);
  const semana = week(state);
  return {
    kind: 'town_voices',
    you: { player: playerId, faction: player.faction },
    day: state.day,
    week: semana,
    towns: towns.map((t) => {
      const heroe = heroeEnLaBase(state, playerId, t);
      return {
        id: t.id,
        name: t.name,
        buildings: t.buildings.map((id) => building(id).name),
        hero: heroe === null ? null : { name: heroe.name, type: heroe.tipo },
        garrison: armyView(guarnicionDeLaCiudad(state, t)),
        npcs: vecinosDeLaBase(t).map((v) => ({
          id: v.id,
          name: v.nombre,
          role: v.papel,
          building: v.sitio === null ? null : building(construidoEn(t, v.sitio) as string).name,
          current: vozDe(t, v.id, semana, state.day),
        })),
      };
    }),
    recentEvents: cronicaPara(state, playerId, 10),
  };
}
