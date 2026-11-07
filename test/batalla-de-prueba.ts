/**
 * Montar batallas a mano en los tests de las reglas: un héroe de prueba y un bando
 * (`mando`, `bando`, `heroeDeBatalla`, `ladoDeBatalla`); unidades con cifras hechas
 * a mano (`aMano`, `catalogoDeCifras`, `bandoDe`, `bandoAMano`); el turno, las
 * puertas y la muralla puestos a mano (`forzarTurno`, `abrirPuertas`, `muralla`);
 * las manos de prueba y la rueda (`conManosDePrueba`, `todoA`, `golpeConLaRueda`,
 * `NORMAL`); y jugarla sin mirar (`agresiva`, `aCiegas`, `avanzarHasta`,
 * `dadoCargado`). Escritos una vez; antes cada test llevaba su copia. Solo el
 * núcleo (lo de `test/helpers.ts` llegó en la fase T de la reorganización,
 * 06-11-2026).
 */
import { completarCruce } from '../src/core/ai/rueda.js';
import {
  activeStack,
  applyAction,
  type BattleSide,
  createBattle,
  enemiesOf,
  type HeroeDelBando,
  legalActions,
  stackById,
  stackHexes,
} from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import {
  type MaterialDeMuralla,
  type MurallaDeBatalla,
  type PuertaDeMuralla,
  validarMuralla,
} from '../src/core/battle/muralla.js';
import type {
  BattleAction,
  BattleEvent,
  BattleHero,
  BattleState,
} from '../src/core/battle/types.js';
import { HERO_BODY } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO, type ReglasDelCombate } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/equipo/atado.js';
import type { Pieza } from '../src/core/equipo/pieza.js';
import { EQUIPO_BASE } from '../src/core/hero/cuerpo-del-heroe.js';
import { EXPERIENCIA_INICIAL_DE_HEROE, umbral } from '../src/core/hero/experiencia.js';
import { cuerposDelHeroe } from '../src/core/hero/hero.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import type { Rng } from '../src/core/rng.js';
import {
  type Army,
  type Hex,
  type NivelesDeLaRueda,
  type Stack,
  TIPOS_DEL_ANILLO,
  type TipoDeGolpe,
  type UnitInfo,
} from '../src/core/types.js';
import {
  type CatalogoDeUnidades,
  unidad,
  unidadDelJuego,
  unidadDelJuegoSiExiste,
} from '../src/core/unidad/catalogo.js';
import { cuerpoDeCombate, nivelesDeLaEspada, type Unidad } from '../src/core/unidad/formato.js';
import { NO_MUERTO, TROPA } from './comun.js';
import { catalogoCon } from './pelea-de-arena.js';

/** El mando de un héroe de prueba: poder 3, Prisa y Lentitud. */
export function mando(over: Partial<BattleHero> = {}): BattleHero {
  return {
    name: 'Prueba',
    retreat: { blocked: 'en la prueba no se huye' },
    spellPower: 3,
    knowledge: 5,
    mana: 50,
    castThisRound: false,
    spells: ['haste', 'slow'],
    ...over,
  };
}

/**
 * Un bando: su tropa y, si se pide, su héroe —con el cuerpo de un héroe recién
 * hecho, sin ataque ni defensa— y su moral.
 */
export function bando(
  army: readonly Stack[],
  o: { readonly heroe?: BattleHero; readonly moral?: number } = {},
): BattleSide {
  const h = o.heroe;
  return {
    army,
    hero:
      h === undefined
        ? null
        : {
            mando: h,
            figura: HERO_BODY,
            ...cuerposDelHeroe({
              name: h.name,
              attack: 0,
              defense: 0,
              experience: EXPERIENCIA_INICIAL_DE_HEROE,
              equipo: EQUIPO_BASE,
            }),
          },
    moraleBonus: o.moral ?? 0,
  };
}

/** Unas cifras hechas a mano, con el id que las nombra y, si se dice, la hoja con que se pintan. */
export interface CifrasAMano {
  readonly id: string;
  readonly unit: UnitInfo;
  /** La hoja de su cuerpo (`body`); sin ella, su id. */
  readonly hoja?: string;
}

/**
 * Un catálogo de la pelea (`BattleSide.catalogo`) que da a cada id **sus cifras
 * hechas a mano, tal cual** (la misma referencia): la vía de los tests para pelear
 * con unas cifras que no salen de un cuerpo y su equipo —un daño fijo, una defensa
 * propia, un rasgo que ninguna unidad lleva—.
 *
 * Hasta el 06-11-2026 esas cifras entraban como un personaje del RPG
 * (`BattleSide.members`); retirados los personajes, el motor solo saca las de la
 * tropa de un catálogo (`resolveUnit` → `cifrasDeUnidad`, que viste el cuerpo de la
 * unidad con su catálogo de equipo). Este da a cada id una unidad de relleno con
 * ese id por nombre y un equipo cuyo `conEquipo` devuelve las cifras pedidas: así
 * entran al montar la batalla, y cuentan para la moral, la escalera, el libro y el
 * orden de la primera ronda como las de cualquier tropa. Lo que cambia frente al
 * personaje es el origen (`catalogo`, con su precio: la rendición los cuenta).
 */
export function catalogoDeCifras(cifras: readonly CifrasAMano[]): CatalogoDeUnidades {
  const porId = new Map<string, CifrasAMano>();
  for (const c of cifras) {
    if (porId.has(c.id)) throw new Error(`dos cifras a mano con el id «${c.id}»`);
    porId.set(c.id, c);
  }
  const de = (id: string): CifrasAMano => {
    const c = porId.get(id);
    if (c === undefined) throw new Error(`no hay cifras a mano con el id «${id}»`);
    return c;
  };
  return {
    unidad: (id): Unidad => {
      const { unit, hoja } = de(id);
      return {
        id,
        name: id,
        faction: 'templarios',
        leadership: 1,
        cuerpo: { hoja: hoja ?? id },
        equipo: {},
        traits: [],
        habilidades: [],
        attack: unit.attack,
        fuerza: unit.fuerza,
        agilidad: unit.agilidad,
        hp: unit.hp,
      };
    },
    // El cuerpo de relleno se llama como su id: lo vestido son las cifras de ese id.
    equipo: {
      ...EQUIPO_DEL_JUEGO,
      conEquipo: <U extends UnitInfo>(cuerpo: U): U => de(cuerpo.name).unit as U,
    },
  };
}

/**
 * Un bando de unidades con cifras propias, como las de la arena: cada una entra
 * con su `unit` tal cual (`catalogoDeCifras`), una por stack.
 */
export function bandoDe(unidades: readonly CifrasAMano[]): BattleSide {
  return {
    army: unidades.map((u) => ({ creature: u.id, count: 1 })),
    hero: null,
    catalogo: catalogoDeCifras(unidades),
  };
}

/**
 * **Una unidad hecha a mano** para un rasgo del motor que ninguna unidad del
 * catálogo lleva —vuelo, doble golpe, dos casillas, munición, drenaje, miedo,
 * salpicar…—: las cifras de `base` (del catálogo, novato) con `cambios`. El motor
 * sigue jugando esos rasgos (los puede poner la arena en sus unidades), así que se
 * prueban con unidades que dicen lo que tienen, no con una del catálogo que hoy no
 * los trae. Entran en la batalla con `bandoAMano` o, ya montada, `conCifrasAMano`.
 */
export function aMano(base: string, cambios: Partial<UnitInfo>): UnitInfo {
  return { ...unidadDelJuego(base), ...cambios };
}

/**
 * Pone a mano las cifras `unit` a los stacks `ids` de `b` ya montada (con sus PV
 * de arriba). Devuelve `b`.
 */
export function conCifrasAMano(b: BattleState, ids: string | readonly string[], unit: UnitInfo) {
  for (const id of typeof ids === 'string' ? [ids] : ids) {
    const s = b.stacks.find((x) => x.id === id);
    if (s === undefined) throw new Error(`no hay ningún stack ${id}`);
    const w = s as { unit: UnitInfo; topHp: number };
    w.unit = unit;
    w.topHp = unit.hp;
  }
  return b;
}

/**
 * Un bando de individuos hechos a mano: cada uno entra con sus cifras tal cual,
 * uno por stack (`catalogoDeCifras`), porque el catálogo no los tiene. Se pintan
 * con la hoja de `TROPA`. Es la vía del motor para lo que se decide al montar la
 * batalla (la escalera de quien vuela, el despliegue).
 */
export function bandoAMano(
  units: readonly UnitInfo[],
  hero: BattleSide['hero'] = null,
): BattleSide {
  const cifras = units.map((unit, i) => ({ id: `a-mano-${i}`, unit, hoja: TROPA }));
  return {
    army: cifras.map(({ id }) => ({ creature: id, count: 1 })),
    hero,
    catalogo: catalogoDeCifras(cifras),
  };
}

/**
 * Una muralla de batalla con esos muros y puertas, de piedra salvo que se diga
 * (`validarMuralla`): la de los tests que no miran el material. Los de
 * `validarMuralla` le pasan el objeto crudo.
 */
export function muralla(
  muros: readonly Hex[],
  puertas: readonly PuertaDeMuralla[] = [],
  material: MaterialDeMuralla = 'piedra',
): MurallaDeBatalla {
  return validarMuralla({ muros, puertas, material });
}

/**
 * Política agresiva para tests: golpea, si no se acerca todo lo que puede, y si
 * no cierra el turno. Basta para que cualquier batalla converja. No apunta: el disparo
 * diferido (25-10-2026) va sin tests hasta que el usuario lo valide.
 */
export function agresiva(state: BattleState): BattleAction {
  const acciones = legalActions(state);
  const s = activeStack(state);
  if (s === null) throw new Error('sin stack activo');

  const ataque = acciones.find((a) => a.type === 'attack');
  if (ataque !== undefined) return ataque;

  const enemigos = enemiesOf(state, s);
  const movimientos = acciones.filter(
    (a): a is Extract<BattleAction, { type: 'move' }> => a.type === 'move',
  );
  if (movimientos.length > 0 && enemigos.length > 0) {
    const distancia = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.flatMap((e) => stackHexes(e).map((eh) => hexDistance(h, eh))));
    return movimientos.reduce((mejor, m) => (distancia(m.to) < distancia(mejor.to) ? m : mejor));
  }

  return acciones.find((a) => a.type === 'end_turn') ?? acciones[0]!;
}

/**
 * Un dado cargado: cada `int` sale en su mínimo o en su máximo (`chance`, siempre
 * `false`: la batalla ya no lo tira desde que se fue la suerte, 02-11-2026). Es para ver una punta de
 * una horquilla sin buscarla entre semillas: con PV y daño a la escala de las
 * cifras, una tirada tiene decenas o cientos de valores y cuarenta semillas no
 * ven sus puntas. Lo demás (`next`, `pick`) lanza: un test que lo necesite no
 * está midiendo lo que cree.
 */
export function dadoCargado(punta: 'minimo' | 'maximo'): Rng {
  const noVale = (que: string) => (): never => {
    throw new Error(`el dado cargado solo tira enteros; se le ha pedido ${que}`);
  };
  return {
    next: noVale('next()'),
    int: (min, max) => (punta === 'minimo' ? min : max),
    chance: () => false,
    pick: noVale('pick()'),
  };
}

/**
 * Juega con `politica` hasta que se cumpla `hasta` —el id del stack activo, o
 * una pregunta sobre la batalla— o se acabe la batalla o los turnos, con la rueda
 * a ciegas (`aCiegas`). Dice si llegó.
 */
export function avanzarHasta(
  state: BattleState,
  rng: Rng,
  hasta: string | ((state: BattleState) => boolean),
  politica: (state: BattleState) => BattleAction = agresiva,
  maxTurnos = 200,
): boolean {
  const llego = typeof hasta === 'string' ? (s: BattleState) => s.turno?.stack === hasta : hasta;
  for (let n = 0; state.finished === null && n < maxTurnos; n++) {
    if (llego(state)) return true;
    aCiegas(state, politica(state), rng);
  }
  return state.finished === null && llego(state);
}

/**
 * Una batalla de dos, cara a cara: un `TROPA` (`attacker-0`, en (5,4)) pegado a un
 * `NO_MUERTO` (`defender-0`, en (6,4)), con el turno del atacante: el golpe de la
 * rueda se da sin andar. Para la petición de la respuesta y el contrato.
 */
export function batallaConDos(rng: Rng, combate: ReglasDelCombate = COMBATE_COMPLETO): BattleState {
  const b = createBattle(
    { army: [{ creature: TROPA, count: 1 }], hero: null },
    { army: [{ creature: NO_MUERTO, count: 1 }], hero: null },
    rng,
    combate,
  );
  stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
  forzarTurno(b, 'attacker-0');
  return b;
}

/**
 * Le da el turno a `stack` a mano, como si lo hubiera abierto `advance`: un
 * ordinal nuevo —el siguiente al de ahora— y lo gastado que diga el test.
 */
export function forzarTurno(state: BattleState, stack: string, gastado = 0): void {
  state.turno = { n: (state.turno?.n ?? 0) + 1, stack, gastado };
}

/**
 * Deja abiertas todas las puertas de la muralla de `state` (o solo las que
 * tienen el lado `a` en `cuales`), sin pasar por `abrir_puerta`: para montar el
 * caso de un test, como `forzarTurno`. Lanza si alguna no es una puerta.
 */
export function abrirPuertas(state: BattleState, cuales?: readonly Hex[]): void {
  for (const h of cuales ?? state.puertas.map((p) => p.a)) {
    const p = state.puertas.find((q) => q.a.col === h.col && q.a.row === h.row);
    if (p === undefined) throw new Error(`ninguna puerta tiene su lado a en (${h.col},${h.row})`);
    p.abierta = true;
  }
}

/** Una rueda con todos los tipos del anillo en el nivel `n`. */
export function todoA(n: number): NivelesDeLaRueda {
  return Object.fromEntries(TIPOS_DEL_ANILLO.map((t) => [t, n])) as NivelesDeLaRueda;
}

/**
 * Un arma de prueba que no suma nada y lleva los niveles de la Espada (`data/equipo.json`):
 * con ella, una criatura del catálogo golpea en la rueda sin que cambien su ataque
 * ni su daño. En la arena nadie golpea sin arma (`armaDeCuerpoBlocker`); estas
 * pruebas de la rueda montan criaturas del juego para que las cifras se cuenten a
 * mano.
 */
export const MANOS_DE_PRUEBA: Pieza = {
  id: 'manos_de_prueba',
  nombre: 'Manos de prueba',
  hueco: 'arma',
  seConsigue: [],
  ataque: 0,
  defensa: 0,
  peso: 0,
  rueda: nivelesDeLaEspada(),
  precio: 0,
};

/**
 * Cada stack de `b` con las manos de prueba en el hueco del arma, por
 * `conEquipo`, el único escritor de `UnitInfo.armas` (con su nombre: la batalla no
 * lleva catálogo): golpea en la rueda con los niveles de la Espada (u otros,
 * `niveles`). Uno sin arma, sin cambiar sus cifras; uno del catálogo (desde el
 * 19-10-2026 todos llevan arma), su cuerpo con su equipo de serie y las manos en
 * lugar del arma. Devuelve `b`.
 */
export function conManosDePrueba(
  b: BattleState,
  niveles: NivelesDeLaRueda = nivelesDeLaEspada(),
): BattleState {
  const manos: Pieza = { ...MANOS_DE_PRUEBA, rueda: niveles };
  const eq = catalogoCon(manos);
  for (const s of b.stacks) {
    // Sin arma, con las cifras que traía (las de una unidad hecha a mano): vestirla
    // vuelve a derivar defensa, daño y velocidad de su fuerza y su agilidad. Una
    // hecha a mano con arma (`bandoDe`, `bandoAMano`: su id no es del catálogo del
    // juego), tal cual.
    const delJuego =
      s.origen.kind === 'catalogo' && unidadDelJuegoSiExiste(s.origen.unidad) !== null;
    const unit =
      s.unit.equipo?.arma === undefined
        ? conLasCifrasDe(eq.conEquipo(s.unit, { arma: manos.id }), s.unit)
        : delJuego
          ? eq.conEquipo(cuerpoDeCombate(unidad(s.body)), {
              ...unidad(s.body).equipo,
              arma: manos.id,
            })
          : s.unit;
    (s as { unit: UnitInfo; topHp: number }).unit = unit;
    (s as { topHp: number }).topHp = unit.hp;
  }
  return b;
}

/**
 * `vestida` con la defensa, el daño y la velocidad de `antes`, también en su golpe
 * de cuerpo a cuerpo: vestir vuelve a derivarlas de la fuerza y la agilidad
 * (`cifrasDelCuerpo`), y una unidad con las cifras puestas a mano las perdería.
 */
export function conLasCifrasDe(vestida: UnitInfo, antes: UnitInfo): UnitInfo {
  const arma = vestida.armas?.arma;
  return {
    ...vestida,
    defense: antes.defense,
    damage: antes.damage,
    speed: antes.speed,
    ...(arma === undefined || vestida.armas === undefined
      ? {}
      : { armas: { ...vestida.armas, arma: { ...arma, damage: antes.damage } } }),
  };
}

/** Un golpe del registro de la batalla (`attack`). */
export type Ataque = Extract<BattleEvent, { kind: 'attack' }>;

/** Los golpes del registro de `b`, desde el hecho `desde`: los de quien pega y los del contraataque. */
export function ataquesDe(b: BattleState, desde = 0): Ataque[] {
  return b.log.slice(desde).filter((e): e is Ataque => e.kind === 'attack');
}

/**
 * El golpe de una vez a `defender-0` con la rueda: el tipo de quien pega
 * (`golpe`), el de quien recibe (`respuesta`) y lo demás de la acción (`extra`,
 * como su `from`).
 */
export function golpeConLaRueda(
  golpe: TipoDeGolpe,
  respuesta: TipoDeGolpe,
  extra: Partial<BattleAction> = {},
): BattleAction {
  return { type: 'attack', target: 'defender-0', golpe, respuesta, ...extra } as BattleAction;
}

/**
 * Las dos elecciones de un golpe que no mira la rueda: Normal contra Normal cae
 * en el medio de la horquilla y no gasta tirada. Desde el 19-10-2026 todo golpe
 * cuerpo a cuerpo pasa por la rueda: sin elecciones, el `attack` se planta.
 */
export const NORMAL = { golpe: 'normal', respuesta: 'normal' } as const;

/**
 * Aplica `accion` con lo que le falte de la rueda elegido a ciegas por la IA
 * (`completarCruce`), como `autoResolve`: para los tests que juegan la IA sin
 * mirar el golpe.
 */
export function aCiegas(b: BattleState, accion: BattleAction, rng: Rng): void {
  applyAction(b, completarCruce(b, accion, rng).accion, rng);
}

/**
 * Un héroe de batalla con su cuerpo y, si se pide, con monedero para rendirse
 * (`heroe-en-batalla.test.ts`); donde solo importa dónde pisa, sin él
 * (`despliegue.test.ts`).
 */
export function heroeDeBatalla(purse: number | null = null): HeroeDelBando {
  return {
    figura: HERO_BODY,
    ...cuerposDelHeroe({
      name: 'Prueba',
      attack: 2,
      defense: 2,
      experience: umbral(5),
      equipo: {},
    }),
    mando: {
      name: 'Prueba',
      retreat: purse === null ? { blocked: 'no tienes base a la que volver' } : { purse },
      spellPower: 1,
      knowledge: 1,
      mana: 0,
      castThisRound: false,
      spells: [],
    },
  };
}

/** Un bando de individuos, uno por stack, como los manda la partida; `aMano`, si lo despliega la persona. */
export function ladoDeBatalla(army: Army, hero: HeroeDelBando | null, aMano = false): BattleSide {
  return {
    army: troopsAsStacks(army),
    hero,
    ...(aMano ? { despliegaAMano: true as const } : {}),
  };
}
