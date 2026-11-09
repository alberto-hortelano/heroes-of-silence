/**
 * El cierre de una batalla del mapa (`settleBattle`): lo que la batalla devuelve a
 * los dos héroes, la experiencia y los rangos de quien pegó, lo que gana quien gana
 * (`applyVictory`), lo que le pasa a quien pierde (`heroeVencido`: vuelve a su
 * base, `volverABase`, o cae), lo que le queda a quien resiste y el botín.
 *
 * Vivía en `game.ts` hasta la fase N de la reorganización (07-11-2026), que lo
 * repartió por lo que hace.
 */
import { resumenDeBatalla } from '../battle/resumen.js';
import type { BattleStack, Side } from '../battle/types.js';
import { PIEZAS_DE_BOTIN } from '../equipo/pieza.js';
import { rangoDeHeroe, rangoDeTropa } from '../hero/rango.js';
import { licenciar } from '../hero/troop.js';
import type { MapObject } from '../map/tipos.js';
import { claveDeEncuentro, claveDeOpcion, daPremio, esPremio } from '../mundo/formato.js';
import { mundoDe } from '../mundo/reglas.js';
import { createRng } from '../rng.js';
import type { Town } from '../town/town.js';
import type { Army, Hero, PlayerId, Point, Troop, Veterania } from '../types.js';
import { dejarAsaltante } from './asaltantes.js';
import {
  encuentroDe,
  lugarDelRival,
  protagonista,
  restoreHeroFromBattle,
  sitioQueSeDefiende,
} from './batallas.js';
import { baseOf, battleOwners, casillaDeVuelta, heroById, playerById } from './consultas.js';
import { anotarLosSitios, emit, fotoDeLosSitios } from './cronica.js';
import { aLaMochila, devolverLoPuesto, hojaNueva } from './equipar.js';
import type { BattleFoe } from './events.js';
import { aplicarEfectos, cobroDe, opcionDeLaBatalla } from './lugares.js';
import { entregarElSitio } from './marcha.js';
import { delSitio, idDelSitio, laGuarnicion, ponerLaGuarnicion, sitioPorId } from './sitios.js';
import {
  type Dejados,
  dejarBlocker,
  type QuienVuelve,
  sobrantesTrasLaBatalla,
  tropasQueVuelven,
} from './sobrantes.js';
import type { Enfrentamiento, GameContext, GameState, PendingBattle } from './tipos.js';
import { checkDefeat } from './turnos.js';
import { revealAround } from './vision.js';

/** Si la batalla es una emboscada: la abrió un grupo, y el emboscado es un héroe. */
function esEmboscada<T extends Enfrentamiento>(
  p: T,
): p is Extract<T, { readonly attacker: { readonly kind: 'raider' } }> {
  return p.attacker.kind === 'raider';
}

/**
 * Reparte las consecuencias de una batalla ya terminada. `dejados`, lo que la
 * persona eligió dejar de un bando que vuelve con más de lo que le cabe
 * (`sobrantesTrasLaBatalla`, 08-11-2026); un bando que se pasa y no viene en él
 * deja lo de la regla de la IA (`loQueDejaLaIA`). Lo que no vale lanza con la
 * frase de `dejarBlocker`, antes de tocar nada.
 */
export function settleBattle(state: GameState, _ctx: GameContext, dejados: Dejados = {}): void {
  const pending = state.pendingBattle;
  if (pending === null) throw new Error('no hay batalla pendiente');
  if (pending.battle.finished === null) throw new Error('la batalla no ha terminado');
  // Lo que vuelve de cada bando, contado una vez (`tropaQueVuelve`), y lo que
  // sobra con el liderazgo de antes de cobrar la experiencia: lo mismo que vio la
  // persona en el diálogo.
  const vuelven = tropasQueVuelven(state);
  const sobran = sobrantesTrasLaBatalla(state, vuelven);
  for (const side of Object.keys(dejados) as Side[]) {
    if (!sobran.some((x) => x.side === side)) {
      throw new Error(`no se puede cerrar la batalla: al ${side} no le sobra nada que dejar`);
    }
  }
  // Lo que sobra se deja aquí, antes de tocar nada y antes de cobrar la
  // experiencia (que solo cobra quien se queda): lo elegido o, si no, lo que
  // propone la IA, juzgado con la misma frase (`dejarBlocker`). Su equipo va a la
  // mochila del héroe o, de una guarnición, se pierde (P7): `dejarAtras`, después.
  const quedan: Record<Side, Army> = {
    attacker: vuelven.attacker.army,
    defender: vuelven.defender.army,
  };
  const dejan: Dejado[] = [];
  for (const s of sobran) {
    const dejar = dejados[s.side] ?? s.propuesta;
    const motivo = dejarBlocker(s, dejar);
    if (motivo !== null) throw new Error(`no se puede cerrar la batalla: ${motivo}`);
    for (const [creature, count] of Object.entries(dejar)) {
      if (count <= 0) continue;
      const r = licenciar(quedan[s.side], creature, count);
      quedan[s.side] = r.queda;
      dejan.push({ quien: s.quien, dueño: s.dueño, creature, count, seVan: r.seVan });
    }
  }

  const finished = pending.battle.finished;
  const winner = finished.winner;
  // Quién la protagoniza, leído ahora, con los dos bandos en pie.
  const actor = protagonista(state, pending);
  // De quién es cada sitio y quién lo ocupa, antes de las consecuencias.
  const sitiosAntes = fotoDeLosSitios(state);
  // La casilla, LEÍDA AQUÍ: con los dos bandos todavía en pie. Después hay
  // héroes que salen del mapa y castillos que cambian de bandera, y preguntar
  // entonces sería preguntar por alguien que ya no está. Es el mismo patrón que
  // el `const dueño = hero.owner` de más abajo, y por eso el dato no hace falta
  // guardarlo en `PendingBattle`.
  const at = lugarDelRival(state, pending.foe);
  // El botín, decidido AQUÍ por la misma razón: si el que pierde es una ciudad
  // neutral, un instante después de capturarla ya es de quien gana.
  const botin = botinDe(state, pending, winner);
  // Los que se quedan vuelven con su experiencia: la que traían más la que han
  // ganado, en el mismo individuo. Solo los de un bando con dueño —la tropa de un
  // héroe o la guarnición de un castillo de alguien—: un monstruo, un asaltante o
  // una guarnición neutral no tienen campaña que recordar. Primero el defensor:
  // es el orden en que se abren las hojas nuevas (`hojaNueva`), y el banco lo fija.
  const ascensos: Ascenso[] = [];
  const conSuExperiencia = (side: Side): Army => {
    const v = vuelven[side];
    const cobro: Cobro = { state, dueño: v.dueño, ascensos };
    return quedan[side].map((t) => {
      const s = v.stackDe.get(t);
      if (s === undefined) throw new Error(`${t.creature} vuelve de la batalla sin su stack`);
      return conVeterania(cobro, t, s);
    });
  };
  const supervivientesDelDefensor = conSuExperiencia('defender');
  const supervivientesDelAtacante = conSuExperiencia('attacker');
  // Lo que la batalla les mutó —el maná, y la tropa que queda en pie— vuelve a
  // los DOS héroes aquí, una vez y por la misma función, gane quien gane. Antes
  // se devolvía en tres sitios según quién perdiera, y el defensor que perdía
  // se restauraba dentro de `applyVictory`, que no es su asunto.
  if (!esEmboscada(pending)) {
    const atacante = heroById(state, pending.attacker.heroId);
    restoreHeroFromBattle(atacante, pending.battle.heroes.attacker, supervivientesDelAtacante);
  }
  if (pending.foe.kind === 'hero') {
    const defensor = heroById(state, pending.foe.heroId);
    restoreHeroFromBattle(defensor, pending.battle.heroes.defender, supervivientesDelDefensor);
  }
  // Lo que cuesta la rendición, si la hubo. La paga siempre el que pierde.
  const precio = finished.surrender?.gold ?? null;

  // El cierre de la batalla se registra ANTES de sus consecuencias: capturar
  // el último pueblo del rival termina la partida, y "game_over" tiene que ser
  // el último evento del registro, no quedar sepultado bajo el de la batalla.
  emit(state, {
    kind: 'battle_ended',
    winner,
    foe: pending.foe,
    owners: { attacker: vuelven.attacker.dueño, defender: vuelven.defender.dueño },
    ...resumenDeBatalla(pending.battle),
    actor,
    at,
  });
  state.pendingBattle = null;

  // La experiencia, AQUÍ: después de contar que terminó y antes de sus
  // consecuencias, que es cuando los dos héroes siguen en el mapa —un héroe
  // vencido sin base sale de él dos líneas más abajo—. Los dos cobran, gane o
  // pierda cada uno: se gana por el daño hecho, no por ganar (la regla es del
  // usuario, no de fheroes2).
  for (const st of pending.battle.stacks) {
    if (st.origen.kind !== 'heroe') continue;
    const quien = st.side === 'attacker' ? pending.attacker : pending.foe;
    if (quien.kind !== 'hero') continue;
    ganarExperiencia(state, heroById(state, quien.heroId), st.ganado.experiencia, at);
  }
  for (const a of ascensos) {
    emit(state, {
      kind: 'troop_rank_up',
      creature: a.creature,
      rank: a.rank,
      veterano: a.veterano,
      actor: a.dueño,
      at,
    });
  }

  for (const d of dejan) dejarAtras(state, d, at);

  if (esEmboscada(pending)) {
    const emboscado = heroById(state, pending.foe.heroId);
    if (winner === 'attacker') {
      dejarAsaltante(state, pending.attacker.raiderId, supervivientesDelAtacante);
      heroeVencido(state, emboscado, precio, at);
    } else {
      // Sin héroe no se rinde: perder es caer entero.
      dejarAsaltante(state, pending.attacker.raiderId, []);
    }
  } else {
    const hero = heroById(state, pending.attacker.heroId);
    if (winner === 'attacker') {
      applyVictory(state, hero, pending.foe, precio, at);
    } else {
      heroeVencido(state, hero, precio, at);
      applyDefenderSurvivors(state, pending, supervivientesDelDefensor);
    }
  }
  // Después de las consecuencias —el grupo disperso, la ciudad ya suya— y antes
  // de mirar si alguien ha perdido la partida: `game_over` es el último hecho.
  if (botin !== null) repartirBotin(state, heroById(state, botin.heroId), botin.from, at);

  // Lo que la batalla cambió en los sitios (el ocupante echado, el pueblo que
  // vuelve a dar), antes de mirar si alguien ha perdido: `game_over` es el último.
  anotarLosSitios(state, sitiosAntes);
  checkDefeat(state);
}

/** Lo que deja un bando al cerrar: a quién, de quién, de qué tipo y quiénes se van. */
interface Dejado {
  readonly quien: QuienVuelve;
  readonly dueño: PlayerId;
  readonly creature: string;
  readonly count: number;
  readonly seVan: readonly Troop[];
}

/**
 * Deja atrás lo que no cupo y lo cuenta (`left_behind`): lo que llevaban puesto va
 * a la mochila del héroe, como al licenciar; el de una guarnición, que no tiene
 * mochila, se pierde, y el hecho lo dice (P7, «Se pierde»): `devolverLoPuesto`.
 */
function dejarAtras(state: GameState, d: Dejado, at: Point): void {
  const heroe = d.quien.kind === 'heroe' ? d.quien.heroe : null;
  const piezas = devolverLoPuesto(heroe, d.seVan);
  emit(state, {
    kind: 'left_behind',
    hero: heroe === null ? null : heroe.id,
    site: d.quien.kind === 'sitio' ? idDelSitio(d.quien.sitio) : null,
    creature: d.creature,
    count: d.count,
    lost: heroe === null ? [...piezas] : [],
    actor: d.dueño,
    at,
  });
}

/**
 * Quién cobra botín de esta batalla, o `null`: **el héroe que gana a un bando
 * neutral que no es un monstruo** —un grupo de asaltantes, atacado o
 * emboscando, o la guarnición neutral de una ciudad—. Una ciudad rival
 * guarnecida no da: no es una guarnición de nadie, es la del rival. Se pregunta
 * antes de aplicar nada, porque la guarnición se pierde al ganarle.
 */
function botinDe(
  state: GameState,
  pending: PendingBattle,
  winner: Side,
): { readonly heroId: string; readonly from: 'raider' | 'town' } | null {
  const [ganador, perdedor] =
    winner === 'attacker' ? [pending.attacker, pending.foe] : [pending.foe, pending.attacker];
  if (ganador.kind !== 'hero') return null;
  if (perdedor.kind === 'raider') return { heroId: ganador.heroId, from: 'raider' };
  if (perdedor.kind === 'garrison') {
    const sitio = sitioPorId(state, perdedor.site);
    if (sitio.kind === 'ciudad' && laGuarnicion(state, sitio)?.dueño === null) {
      return { heroId: ganador.heroId, from: 'town' };
    }
  }
  return null;
}

/**
 * Lo que le pasa a un héroe que pierde una batalla. **El único camino**: antes
 * eran dos ramas de borrado —el atacante en `settleBattle` y el defensor en
 * `applyVictory`—, y la vuelta a la base habría tenido que escribirse en las
 * dos.
 *
 * En este orden, y el orden importa:
 *
 * 1. **Si se rindió, paga** `precio`, el que fijó el motor al rendirse. No le
 *    puede faltar y no se vuelve a mirar: `surrenderBlocker` no ofrece la
 *    rendición sin el oro, y el oro no cambia en plena batalla.
 * 2. **Si su base sigue siendo suya, vuelve a ella** (`volverABase`).
 * 3. **Si no, desaparece**, como hasta la fase 1b. Un rendido no llega aquí:
 *    sin base no se ofrece la rendición.
 *
 * El castillo en el que defendía, si lo había, ya lo ha capturado
 * `applyVictory`: si era su base, aquí ya no le queda.
 *
 * Una derrota en combate cuenta `hero_defeated` —el héroe cayó— y, si vuelve,
 * **después** `hero_returned`. Una rendición solo `hero_returned`: no cayó.
 */
function heroeVencido(state: GameState, hero: Hero, precio: number | null, at: Point): void {
  // El dueño se lee al principio: si el héroe sale del mapa, un instante
  // después el evento que lo cuenta no tendría a quién atribuirse — que es
  // justo por qué el 10,9 % de la crónica era inatribuible.
  const dueño = hero.owner;
  const rendido = precio !== null;
  if (rendido) {
    const jugador = playerById(state, dueño);
    jugador.oro -= precio;
  }

  const base = baseOf(state, dueño);
  if (base === null) {
    // Sin base, desaparece como siempre. Primero sale del mapa y DESPUÉS se
    // cuenta: el sello se calcula tras la mutación (`emit`), así que su dueño
    // ya no mira la casilla en la que acaba de caer, y la noticia le llega por
    // `actor`. La rendición exige base, así que aquí solo llega quien cayó.
    state.heroes = state.heroes.filter((h) => h.id !== hero.id);
    emit(state, { kind: 'hero_defeated', hero: hero.id, actor: dueño, at });
    return;
  }
  // Con base, cae y vuelve: dos hechos, en ese orden. El primero se sella con
  // el héroe todavía en el campo de batalla; el segundo, donde reaparece.
  if (!rendido) emit(state, { kind: 'hero_defeated', hero: hero.id, actor: dueño, at });
  volverABase(state, hero, base, precio);
}

/**
 * El héroe vencido reaparece en su base: en la casilla del castillo o, si la
 * ocupa otro héroe, en la primera casilla libre más cercana (`casillaDeVuelta`).
 *
 * Con el ejército vacío, salvo si se rindió (entonces con la tropa que salvó,
 * que ya trae puesta), y sin movimiento hasta mañana. Mira alrededor. La
 * guarnición no la recoge aquí: se recoge con `recoger_tropa` (04-11-2026), y lo
 * hace la IA al empezar su turno porque el héroe queda marcado (`Hero.vueltoACasa`).
 */
function volverABase(state: GameState, hero: Hero, base: Town, precio: number | null): void {
  if (precio === null) hero.army = [];
  hero.at = casillaDeVuelta(state, hero, base);
  hero.movePoints = 0;
  // Volver a casa es llegar a ella: la IA recoge al empezar su turno (`playAiTurn`)
  // lo que le quepa de la guarnición, como al que acaba una marcha en su sitio.
  hero.vueltoACasa = true;
  revealAround(state, hero);
  const comun = { kind: 'hero_returned', hero: hero.id, town: base.id } as const;
  const origen = { actor: hero.owner, at: hero.at };
  emit(
    state,
    precio === null
      ? { ...comun, surrendered: false, ...origen }
      : { ...comun, surrendered: true, gold: precio, ...origen },
  );
}

/** Un individuo que cruza un rango en esta batalla: un `troop_rank_up` por rango. */
interface Ascenso {
  readonly creature: string;
  readonly rank: number;
  readonly veterano: string;
  readonly dueño: PlayerId;
}

/** Con qué se cobra la experiencia de un bando al cerrar: lo mismo para todos sus stacks. */
interface Cobro {
  readonly state: GameState;
  /** El dueño del bando; `null` —monstruo, asaltante, guarnición neutral— no acumula. */
  readonly dueño: PlayerId | null;
  /** Donde se apuntan los ascensos, que se emiten después. */
  readonly ascensos: Ascenso[];
}

/**
 * El superviviente con su hoja de servicios al día: la que traía más lo que el
 * motor le apuntó en `ganado`, y un `Ascenso` por cada nivel que cruza.
 *
 * Un novato que no ha ganado nada vuelve como entró, sin `veterania`: así el
 * ejército de quien no pelea no cambia de forma y el contador de veteranos solo
 * avanza para quien de verdad lo es. Sin dueño —monstruo, asaltante, guarnición
 * neutral— no acumula nada. `base`, el individuo como lo cuenta `tropaQueVuelve`:
 * con su salida y la hoja que traía.
 */
function conVeterania({ state, dueño, ascensos }: Cobro, base: Troop, s: BattleStack): Troop {
  if (dueño === null) return base;
  const previa = s.origen.kind === 'heroe' ? null : s.origen.veterania;
  if (previa === null && s.ganado.experiencia === 0) return base;
  // Aquí no se mira `count`: un bando con dueño se monta siempre con
  // `troopsAsStacks`, que da stacks de 1, y un veterano en un stack de N lo
  // rechaza `createBattle` al entrar. Es la única comprobación, en la puerta.
  // Parte de la hoja que traía o de una en blanco (`hojaNueva`, la misma que se
  // abre al equipar): una sola regla de cómo nace una hoja. Y se copia entera:
  // lo que esta cuenta no toca —el equipo— tiene que volver con él.
  // Reconstruirla campo a campo lo perdía en la primera batalla sin que nada se
  // pusiera rojo.
  const hoja = previa ?? hojaNueva(state);
  const veterania: Veterania = {
    ...hoja,
    experiencia: hoja.experiencia + s.ganado.experiencia,
    batallas: hoja.batallas + 1,
    bajas: hoja.bajas + s.ganado.bajas,
    heroes: [...hoja.heroes, ...s.ganado.heroes],
  };
  const antes = rangoDeTropa(previa);
  const despues = rangoDeTropa(veterania);
  for (let n = antes + 1; n <= despues; n++) {
    ascensos.push({ creature: base.creature, rank: n, veterano: veterania.id, dueño });
  }
  return { ...base, veterania };
}

/**
 * Le da la experiencia al héroe y le cobra los rangos que salgan, uno a uno:
 * **un `rank_up` por rango ganado** y no uno por batalla. Es el sitio en el
 * que el día que subir de rango REPARTA algo —habilidades— se reparte.
 *
 * El héroe no tiene tope (decisión del usuario: el 5 es solo de la tropa), así
 * que `rangoDe` va sin él y sigue la misma tabla Fibonacci de la tropa. Y
 * empieza donde la tropa acaba, en el 5 con su experiencia (`RANGO_INICIAL_DE_HEROE`):
 * una sola escala, así que su primer ascenso es al 6 y cuesta 128 000 (base × 8). Lo que
 * le da cada rango está en datos: su cuerpo (`data/heroe.json`) y su liderazgo
 * (`data/liderazgo.json`); su nivel, el de ese cuerpo (`nivelDeUnidad`).
 */
function ganarExperiencia(state: GameState, hero: Hero, exp: number, at: Point): void {
  if (exp <= 0) return;
  const antes = rangoDeHeroe(hero);
  hero.experience += exp;
  for (let rank = antes + 1; rank <= rangoDeHeroe(hero); rank++) {
    emit(state, { kind: 'rank_up', hero: hero.id, rank, actor: hero.owner, at });
  }
}

function applyVictory(
  state: GameState,
  hero: Hero,
  foe: BattleFoe,
  precio: number | null,
  at: Point,
): void {
  switch (foe.kind) {
    case 'monster': {
      const obj = state.map.objects.find((o) => o.id === foe.objectId) as
        | Extract<MapObject, { kind: 'monster' }>
        | undefined;
      if (obj !== undefined) {
        obj.defeated = true;
        obj.count = 0;
      }
      break;
    }
    case 'hero': {
      const derrotado = heroById(state, foe.heroId);
      // Si defendía en un castillo suyo, el castillo es del que gana: lo decide
      // lo que hay en la casilla, no a dónde vuelve el héroe. Hasta aquí era un
      // caso especial de la base dentro de `heroeVencido`, y un héroe que perdía
      // defendiendo otro castillo suyo no lo entregaba. Primero la captura y
      // después el héroe pregunta si le queda base: si era esa, ya no.
      // Lo mismo si defendía un paso o un pueblo suyo: lo que no eligió para
      // defenderlo se pierde con el sitio (D1).
      // `at` es la casilla del vencido (`lugarDelRival`): su sitio, el que defendía.
      // El que ocupaba un sitio ajeno no entrega nada: perder lo echa (y el sitio
      // vuelve a dar a su dueño, `anotarLosSitios`).
      const enJuego = sitioQueSeDefiende(state, foe);
      if (enJuego?.suyo === true) entregarElSitio(state, enJuego.sitio, hero.owner);
      heroeVencido(state, derrotado, precio, at);
      break;
    }
    case 'raider':
      // Un grupo sin héroe no se rinde: perder es caer entero.
      dejarAsaltante(state, foe.raiderId, []);
      break;
    case 'garrison':
      // La guarnición cae entera (`entregarElSitio`). Quien gana no entra: se queda
      // en la casilla de antes, como en toda batalla.
      entregarElSitio(state, sitioPorId(state, foe.site), hero.owner);
      break;
    case 'lugar': {
      // Lo que da ganar: lo que da la opción que la abrió (oro, pieza, tropa: la tropa
      // se comprobó al elegirla, y tras ganar el ejército no es mayor) y su `alGanar`
      // (estado, marca, oro o una pieza: la validación no deja más).
      const { lugar, encuentro } = encuentroDe(state, foe);
      // Ganado una vez, no se vuelve a cobrar (`yaCobrado`, `core/mundo/reglas.ts`).
      const mundo = mundoDe(state);
      mundo.vencidos[claveDeEncuentro(lugar.id, foe.encuentro)] ??= cobroDe(hero);
      // Lo que da la opción que la abrió se da ahora, entero, y se cobra ahora (M1
      // de la vuelta 2): antes se daba al elegirla y, al perder, la opción quedaba
      // cobrada y el encuentro no se volvía a pelear.
      const opcion = opcionDeLaBatalla(lugar, foe);
      if (daPremio(opcion)) {
        mundo.cobradas[claveDeOpcion({ lugar: lugar.id, ...foe.opcion })] ??= cobroDe(hero);
      }
      const premios = (opcion.hace ?? []).filter(esPremio);
      aplicarEfectos(state, hero.owner, hero, lugar, [...premios, ...encuentro.alGanar], null);
      break;
    }
  }
}

/**
 * Una pieza de botín a la mochila de `hero`, sorteada entre lo común y lo
 * especial (`PIEZAS_DE_BOTIN`), y el hecho que lo cuenta. **La única puerta del
 * botín**, y la llama un solo sitio: el cierre de la batalla, con lo que decide
 * `botinDe`.
 *
 * La tirada sale de **una corriente propia** y no de `ctx.rng`: una semilla
 * derivada de la de la partida y del número de reparto (`siguienteBotin`). Así
 * el botín no se come ni una tirada de batalla —el resto de la partida se juega
 * igual con él que sin él, y eso es lo que deja comprobar en el volcado del
 * banco que solo añade líneas— y sigue siendo reproducible: misma semilla, mismo
 * orden de repartos, mismas piezas.
 */
function repartirBotin(state: GameState, hero: Hero, from: 'raider' | 'town', at: Point): void {
  const n = state.siguienteBotin++;
  // Dos mezclas enteras (`imul`, que el núcleo permite) para que la semilla del
  // reparto n de una partida no sea la del reparto n+1 de la de al lado.
  const semilla =
    (Math.imul(state.seed ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca6b)) >>> 0;
  const pieza = createRng(semilla).pick(PIEZAS_DE_BOTIN);
  aLaMochila(hero, pieza.id);
  emit(state, { kind: 'loot_found', hero: hero.id, item: pieza.id, from, actor: hero.owner, at });
}

function applyDefenderSurvivors(state: GameState, pending: PendingBattle, army: Army): void {
  // Se copia a una constante local: dentro de los callbacks de `find` el
  // estrechamiento sobre `pending.foe` se pierde.
  const foe = pending.foe;
  switch (foe.kind) {
    case 'monster': {
      const monstruo = state.map.objects.find(
        (o) => o.kind === 'monster' && o.id === foe.objectId,
      ) as Extract<MapObject, { kind: 'monster' }> | undefined;
      if (monstruo !== undefined) {
        monstruo.count = army.length;
        monstruo.defeated = army.length === 0;
      }
      break;
    }
    case 'hero': {
      // Su maná, su tropa y su experiencia ya los devolvió `settleBattle`, a
      // los dos héroes por igual: aquí no queda nada que hacer.
      break;
    }
    case 'raider':
      // Repele al héroe y sigue patrullando con lo que le quede.
      dejarAsaltante(state, foe.raiderId, army);
      break;
    case 'garrison': {
      // La guarnición sigue guardando con lo que le quede, del mismo dueño (el suyo,
      // no el del sitio: P1; `null`, la neutral).
      const sitio = sitioPorId(state, foe.site);
      const g = laGuarnicion(state, sitio);
      if (g === null) throw new Error(`la guarnición ${delSitio(sitio)} resiste sin tropa`);
      ponerLaGuarnicion(state, sitio, g.dueño, army);
      break;
    }
    case 'lugar': {
      // El encuentro no queda en el mapa: si se vuelve, es entero. Lo que cambia
      // es el mundo (`alPerder`: estado o marca), y lo protagoniza quien perdió,
      // que quizá ya no esté en el mapa (sin base cae del todo): por su dueño.
      const { lugar, encuentro } = encuentroDe(state, foe);
      const dueño = battleOwners(state, pending).attacker;
      if (dueño === null)
        throw new Error(`la batalla de ${lugar.nombre} sin dueño que la perdiera`);
      aplicarEfectos(state, dueño, null, lugar, encuentro.alPerder, null);
      break;
    }
  }
}
