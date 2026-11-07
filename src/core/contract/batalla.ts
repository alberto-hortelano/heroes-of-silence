/**
 * Las peticiones de batalla: el turno (`serializeBattleTurn`) y la respuesta a un
 * golpe en la rueda (`serializeBattleResponse`), con lo que se ve de cada stack,
 * de la muralla y del registro.
 *
 * Era parte de `serialize.ts`, que se partió en la fase N de la reorganización
 * (07-11-2026) en `vistas.ts`, `mapa-conocido.ts`, `aventura.ts`, `batalla.ts` y
 * `peticion-de-mapa.ts`.
 */
import { armaduraDe, isShooter, lanzaGranadas, ruedaDelGolpe } from '../battle/armas.js';
import {
  activeStack,
  casillasDeCarga,
  granadasQueQuedan,
  legalActionsAndCosts,
  pasosQueQuedan,
  previsionDeLaRueda,
  stackById,
  stackHexes,
  stackSpeed,
} from '../battle/battle.js';
import { tableroDelContrato } from '../battle/board.js';
import type { CifrasDeLaRueda } from '../battle/cifras-de-la-rueda.js';
import { stackHp } from '../battle/damage.js';
import { dichoDelEfecto } from '../battle/effects.js';
import { formaDeLaBatalla } from '../battle/formas-de-la-rueda.js';
import { alcanceDeLaGranada } from '../battle/granada.js';
import { hayMuralla } from '../battle/muralla.js';
import { efectoDeGolpe } from '../battle/rueda.js';
import {
  type BattleStack,
  type BattleState,
  type OrigenDelStack,
  type Paso,
  queEs,
  rangoDeVeterania,
  type Side,
} from '../battle/types.js';
import { agilidadDe } from '../unidad/cuerpo.js';
import {
  accionAlAgente,
  escaleraAlAgente,
  HIT_DE_GOLPE,
  type Hit,
  hechoAlAgente,
  puertaAlAgente,
  ruedaAlAgente,
} from './vocabulario.js';

/**
 * De quién son los ojos con los que se mira una batalla: **si el bando `side`
 * es de quien pregunta, o de otro** (#73).
 *
 * Es obligatorio y no opcional con defecto a propósito. Un defecto hace que el
 * próximo llamante se lleve los secretos por no escribir nada, que es
 * exactamente cómo se abrió esta: `consultas.ts` pasaba `'attacker'` cuando la
 * batalla no era tuya —el rival contra un monstruo neutral— y el atacante era
 * entonces siempre un jugador, así que lo que volvía era el héroe de una
 * persona con su maná y su libro. Medido 8/8, y la situación ocurría 111 veces
 * en 200 partidas. Desde los asaltantes el atacante puede ser un grupo neutral
 * que embosca, sin héroe; la vista ajena sigue siendo la que hace falta, porque
 * no sabe ni le importa quién es el atacante.
 */
export type VistaDeBatalla = 'propia' | 'ajena';

/**
 * Lo que el agente ve del origen de un stack. Solo el héroe se marca —tu héroe
 * o el rival en el tablero: si cae, su bando pierde—; una criatura se lee por
 * sus cifras. Con un `switch` exhaustivo para que un
 * origen nuevo obligue a decidir aquí si el agente tiene que saberlo.
 */
function marcaDelOrigen(origen: OrigenDelStack): { commander?: true; veteranRank?: number } {
  switch (origen.kind) {
    case 'heroe':
      return { commander: true };
    case 'catalogo': {
      // La veteranía se ve en el tablero —los galones de la figura—, así que
      // es pública como la moral: sus cifras ya van en `attack`/`defense`.
      // Desde el rango 2, que es lo que promete la prosa y lo que pintan los
      // galones: con 180 de los 200 del primer umbral todavía no es veterano.
      const rango = rangoDeVeterania(origen);
      return rango > 1 ? { veteranRank: rango } : {};
    }
  }
}

/**
 * La batalla vista desde `side`, con lo público separado de lo del bando.
 *
 * **Público**, porque es lo que se ve pasar en el tablero: la ronda, quién es
 * el bando mirado, qué stack tiene el turno, el tablero, los stacks enteros
 * —efectos, disparos y moral— y el registro, que cuenta hechizos ya
 * lanzados: eso lo has visto ocurrir.
 *
 * **Del bando**: `hero.mana` y `hero.spells`, que son lo que *podría* lanzar y
 * con cuánto. Con `vista: 'ajena'` esos dos no se emiten y el resto del héroe
 * —nombre y estadísticas— se queda: negarle la vista entera no era la decisión,
 * y sigue sin serlo.
 *
 * Y `legalActions` va **solo si la vista es propia y el stack activo es de
 * `side`**: es la del stack activo sea de quien sea, y sus entradas `cast`
 * enumeran el libro de ese héroe filtrado por su maná —la misma fuga por la
 * puerta de al lado—. La promesa del contrato, «elegir una nunca falla», solo
 * es cierta cuando te toca a ti; en `director.ts` esa condición no muerde nunca,
 * porque allí `side` es el bando del stack que decide. Cuando no va, va
 * `legalActionsOmitted` con el motivo: `not_your_battle` (vista ajena),
 * `nobody_active` (nadie tiene el turno) o `not_your_turn` (lo tiene el otro
 * bando). Exactamente uno de los dos campos viaja siempre.
 *
 * `oro` es el del jugador dueño de `side` y viaja como `yourGold` solo con la
 * vista propia: es del bando, como el maná. Lo pasa quien llama porque la
 * batalla no lo sabe —un castillo que se defiende sin héroe no lleva monedero—,
 * y hace falta para leer el precio de `surrender` (H-2 de la fase 1b). Con la
 * vista ajena se pasa `null` y no se emite.
 */
export function serializeBattleTurn(
  battle: BattleState,
  side: Side,
  vista: VistaDeBatalla,
  oro: number | null,
) {
  const hero = battle.heroes[side];
  const propia = vista === 'propia';
  if (propia && oro === null) {
    throw new Error(
      `la vista propia del ${side} necesita el oro de su dueño: sin él no se lee el precio de rendirse`,
    );
  }
  const activo = activeStack(battle);

  return {
    kind: 'battle_turn',
    round: battle.round,
    yourSide: side,
    ...(propia ? { yourGold: oro } : {}),
    activeStack: battle.turno?.stack ?? null,
    // El ordinal del turno: lo que dice si la siguiente petición sigue siendo el
    // MISMO turno de la misma unidad o uno nuevo (el de la ronda siguiente), que mirando
    // solo `activeStack` no se distingue.
    turnId: battle.turno?.n ?? null,
    // La rueda de esta batalla (la de la partida): sus tipos y cómo se cruzan.
    wheel: ruedaAlAgente(formaDeLaBatalla(battle)),
    board: tableroDelContrato(),
    walls: murallaVista(battle),
    stacks: stacksVistos(battle),
    hero:
      hero === null
        ? null
        : {
            name: hero.name,
            // Sus cifras de combate van en su stack, el de `commander: true`.
            spellPower: hero.spellPower,
            castThisRound: hero.castThisRound,
            // Los dos únicos campos del bando, juntos y en una línea que se lee:
            // con qué maná cuenta y qué sabe lanzar. De un héroe ajeno no salen.
            ...(propia ? { mana: hero.mana, spells: hero.spells } : {}),
          },
    // Todas las acciones legales del stack activo: elegir una nunca falla —
    // cuando te toca. Si el stack activo no es de `side`, esta lista es la de
    // OTRO y sus `cast` son su libro y su maná: no se manda.
    // Y lo que le queda de turno: con el movimiento en tramos, las casillas que
    // aún puede andar. Va con la lista porque es del mismo stack y solo se
    // manda cuando ese stack es tuyo.
    // Y las cargas que tiene a mano, si hay alguna —a qué enemigo y desde qué
    // casilla—: la carga se ENSEÑA con el movimiento posible, y sale de
    // `casillasDeCarga`, la misma regla que la cobra —sin recta sale vacía, así que
    // aquí no se pregunta—.
    //
    // Cuando no va, va el MOTIVO que se decidió aquí, como código (#107): quien
    // lo explica —`consultas.ts`— lo lee y no vuelve a derivarlo. Re-derivarlo
    // era reescribir esta condición menos un término, y el día que hubiera un
    // tercer motivo la nota habría afirmado con confianza uno de los dos viejos.
    ...(!propia
      ? { legalActionsOmitted: 'not_your_battle' as const }
      : activo === null
        ? { legalActionsOmitted: 'nobody_active' as const }
        : activo.side !== side
          ? { legalActionsOmitted: 'not_your_turn' as const }
          : delTurnoPropio(battle, activo)),
    log: registroVisto(battle),
  };
}

/**
 * Lo que solo va cuando el turno es tuyo: la lista legal (en los nombres del
 * contrato, `accionAlAgente`), lo que le queda de turno, sus cargas y, si puede
 * golpear cuerpo a cuerpo, lo que hace cada golpe de la rueda con su arma
 * (`hits`, `efectoDeGolpe` con `ruedaDelGolpe`: lo mismo que lee la persona en
 * las notas de la rueda).
 */
function delTurnoPropio(battle: BattleState, activo: BattleStack) {
  // Con el recorrido que ya hizo la lista legal: las cargas salen de él.
  const { actions: legales, costs } = legalActionsAndCosts(battle);
  const golpea = legales.some((a) => a.type === 'attack');
  return {
    legalActions: legales.map(accionAlAgente),
    stepsLeft: pasosQueQuedan(battle, activo),
    ...chargeFrom(battle, activo, costs),
    ...(golpea ? { hits: golpesAlAgente(battle, ruedaDelGolpe(activo.unit, 'arma')) } : {}),
  };
}

/**
 * Lo que hace cada golpe de la rueda de la batalla con estas cifras, en los
 * nombres del contrato: solo los de su rueda (`FormaDeLaRueda.golpes`).
 */
function golpesAlAgente(
  battle: BattleState,
  rueda: CifrasDeLaRueda,
): { hit: Hit; effect: string }[] {
  const forma = formaDeLaBatalla(battle);
  return forma.golpes.map((t) => ({
    hit: HIT_DE_GOLPE[t],
    effect: efectoDeGolpe(t, 'golpe', true, rueda, forma),
  }));
}

/** Los stacks vivos como los ve el agente (`stackView`), en el orden de la batalla. */
function stacksVistos(battle: BattleState) {
  return battle.stacks.filter((s) => s.count > 0).map(stackView);
}

/** Los últimos hechos de la batalla, con el cruce en los nombres del contrato (`hechoAlAgente`). */
function registroVisto(battle: BattleState) {
  return battle.log.slice(-30).map(hechoAlAgente);
}

/** Un stack como lo ve el agente: lo público, que se ve pasar en el tablero. */
function stackView(s: BattleStack) {
  const info = s.unit;
  return {
    id: s.id,
    side: s.side,
    creature: queEs(s),
    name: info.name,
    count: s.count,
    hp: stackHp(s),
    hex: s.hex,
    occupies: stackHexes(s),
    speed: stackSpeed(s),
    attack: info.attack,
    // La fuerza del cuerpo y la agilidad que le deja el peso: de ellas salen la
    // defensa, el daño y la velocidad de al lado (`cifrasDelCuerpo`).
    strength: info.fuerza,
    agility: agilidadDe(info),
    defense: info.defense,
    damage: info.damage,
    // Lo que se resta de cada golpe que recibe (`armaduraDe`), 0 sin armadura.
    armor: armaduraDe(info),
    shooter: isShooter(info),
    traits: info.traits ?? [],
    // Sus poderes (`power`), solo si tiene alguno: como `chargeFrom`, lo que no hay no viaja.
    ...((info.poderes?.length ?? 0) > 0 ? { powers: info.poderes } : {}),
    // La moral no tiene efectos temporales que aplicar, así que es la suya y ya.
    morale: s.morale,
    // Y aparte, cuánto le queda a cada cosa: sin esto el agente ve el número
    // cambiar de una ronda a otra sin saber por qué ni hasta cuándo.
    effects: s.effects.map((e) => ({
      kind: e.kind,
      // La cifra que suma; lo que no es una cifra (impide, escudo, disparador), 0.
      amount: 'amount' in e ? e.amount : 0,
      // Lo que hace, en palabras (`dichoDelEfecto`): lo único que dice qué impide un
      // hechizo o cuándo salta un disparador.
      summary: dichoDelEfecto(e),
      source: e.source,
      roundsLeft: e.roundsLeft,
    })),
    // El hechizo diferido que lanzó y dónde caerá, al empezar su siguiente turno.
    ...(s.hechizoEnElAire === null
      ? {}
      : { spellAt: { spell: s.hechizoEnElAire.hechizo, at: s.hechizoEnElAire.at } }),
    // La casilla a la que apuntó (el disparo diferido): sale al empezar su
    // siguiente turno. Solo si apuntó; se ve en los dos bandos.
    ...(s.apuntado === null ? {} : { aimedAt: s.apuntado }),
    // La escalera que aún lleva a cuestas (la muralla): solo si la lleva.
    ...(s.escalera ? { ladder: true as const } : {}),
    // El arma de fuego que recarga: los turnos que le faltan para volver a apuntar.
    ...(s.recargando > 0 ? { reloading: s.recargando } : {}),
    // Quien lleva granada: las que le quedan y su alcance; la que está en el aire,
    // en los dos bandos, como `aimedAt`.
    ...(lanzaGranadas(info)
      ? { grenades: granadasQueQuedan(s), grenadeRange: alcanceDeLaGranada(info) }
      : {}),
    ...(s.granada === null ? {} : { grenadeAt: s.granada }),
    ...marcaDelOrigen(s.origen),
  };
}

/**
 * La muralla de la batalla como la lee el agente (`walls`), o `null` sin ella: su
 * material, los muros, las puertas con si están abiertas y las escaleras puestas
 * con su pie y su muro (en los nombres con que él juega: `escaleraAlAgente`,
 * `puertaAlAgente`).
 * Todo es del tablero y se ve: viaja igual a los dos bandos.
 */
function murallaVista(battle: BattleState) {
  if (!hayMuralla(battle.muralla)) return null;
  return {
    material: battle.muralla.material,
    tiles: battle.muralla.muros,
    gates: battle.puertas.map((p) => ({ ...puertaAlAgente(p), open: p.abierta })),
    ladders: battle.escaleras.map(escaleraAlAgente),
  };
}

/**
 * La petición de la respuesta de la rueda (`battle_response`): `atacante` golpea
 * cuerpo a cuerpo a `objetivo`, del bando del agente, y ya está plantado
 * (`golpeEnCurso`): ante él, si anduvo, y lo que se enseña es lo de después de
 * andar; o en su salida si carga, que la carga se elige antes de correr
 * (31-10-2026): `chargeFrom` dice desde qué casilla golpeará y lo que cobra, y
 * `responses` ya lo cuenta desde allí.
 *
 * **Sin el golpe del atacante**, y por construcción: esta función recibe los dos
 * ids y nada más, así que no lo puede filtrar aunque quien la llame ya lo sepa
 * (la IA elige el suyo antes de preguntar). La previsión se cuenta con un
 * `attack` sin elecciones (`previsionDeLaRueda` no las lee). Lo vigila
 * `invariantes.test.ts`.
 *
 * `responses` lleva por cada tipo lo que daría su contraataque y lo que hace; si
 * no devolverá el golpe, `noCounterattack` con el motivo del núcleo y solo el
 * efecto de cada tipo en el cruce.
 */
export function serializeBattleResponse(
  battle: BattleState,
  ataque: { readonly atacante: string; readonly objetivo: string },
) {
  const objetivo = stackById(battle, ataque.objetivo);
  const atacante = stackById(battle, ataque.atacante);
  const p = previsionDeLaRueda(battle, { type: 'attack', target: objetivo.id }, 'respuesta');
  const contraataca = p.sinContraataque === null;
  return {
    kind: 'battle_response',
    round: battle.round,
    yourSide: objetivo.side,
    turnId: battle.turno?.n ?? null,
    attacker: atacante.id,
    target: objetivo.id,
    wheel: ruedaAlAgente(formaDeLaBatalla(battle)),
    ...(contraataca ? {} : { noCounterattack: p.sinContraataque }),
    // La carga plantada, por correr (`casillasDeCarga` en la fase `plantado`).
    ...chargeFrom(battle, atacante),
    responses: formaDeLaBatalla(battle).golpes.map((t) => {
      const response = HIT_DE_GOLPE[t];
      const effect = efectoDeGolpe(t, 'respuesta', contraataca, p.rueda, formaDeLaBatalla(battle));
      const sector = p.porTipo?.[t];
      return sector === undefined
        ? { response, effect }
        : { response, effect, counterDamage: sector.danio, strikes: sector.golpes };
    }),
    board: tableroDelContrato(),
    stacks: stacksVistos(battle),
    log: registroVisto(battle),
  };
}

/** Las cargas de `activo` para el cable —contra quién y desde dónde—, o nada si no tiene ninguna. */
function chargeFrom(
  battle: BattleState,
  activo: BattleStack,
  costes?: ReadonlyMap<string, Paso>,
): { chargeFrom?: { target: string; col: number; row: number; hexes: number }[] } {
  const cargas = casillasDeCarga(battle, activo, costes);
  if (cargas.length === 0) return {};
  return {
    chargeFrom: cargas.map((c) => ({
      target: c.target,
      col: c.at.col,
      row: c.at.row,
      hexes: c.hexes,
    })),
  };
}
