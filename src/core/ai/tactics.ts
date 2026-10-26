/**
 * IA táctica de respaldo.
 *
 * Es la que juega cuando no hay un agente conectado, y la que resuelve las
 * batallas automáticas del mapa. Deliberadamente simple y determinista: su
 * trabajo es que el juego sea jugable sin IA externa, no ser brillante.
 */

import { armaduraDe, trasLaArmadura } from '../battle/armas.js';
import {
  activeStack,
  applyAction,
  canReachMelee,
  cargaDesde,
  cerradasPara,
  distanciaACaminar,
  distanciaAndando,
  enemiesOf,
  escalaDesde,
  firmaDelTurno,
  isEngaged,
  legalActionsAndCosts,
  lineaDelDisparo,
  MAX_JUGADAS,
  type Movibles,
  medirCargas,
  opcionesDeDanio,
  opcionesDelDisparo,
  pasosQueQuedan,
  seHaMovido,
  splashTargets,
  stackById,
  stackHexes,
  stackSpeed,
  sumaDelBando,
} from '../battle/battle.js';
import { hexDistance, hexKey, neighbours, type Paso } from '../battle/board.js';
import { CARGA, CARGA_MINIMA, cargaEfectiva, cargaMontada } from '../battle/carga.js';
import {
  type DamageOptions,
  expectedDamage,
  fraccionQueLlega,
  stackHp,
  valorDeEfectoDeDanio,
} from '../battle/damage.js';
import { roundsLeftOf, type StackEffect } from '../battle/effects.js';
import {
  claveDeAbiertas,
  enLoAlto,
  esMuro,
  mismaPuerta,
  type PuertaDeMuralla,
} from '../battle/muralla.js';
import { esDeCura, poder } from '../battle/poderes.js';
import { curaDe, delHeroe, efectoDe, type Lanzador, type Spell, spell } from '../battle/spells.js';
import type { BattleAction, BattleHero, BattleStack, BattleState, Side } from '../battle/types.js';
import { otroBando } from '../battle/types.js';
import { hasTrait, isShooter } from '../data.js';
import { ESCALA_DE_CIFRAS } from '../escala.js';
import type { Rng } from '../rng.js';
import type { Hex } from '../types.js';
import { completarCruce } from './rueda.js';

/** Lo que pega un stack por sí solo, con el extra del tirador que aún dispara. */
function amenazaPropia(s: BattleStack): number {
  const info = s.unit;
  const damage = ((info.damage[0] + info.damage[1]) / 2) * s.count;
  const shooterBonus = isShooter(s.unit) ? 1.6 : 1;
  return damage * shooterBonus;
}

/**
 * Cuánto "vale" destruir a este stack: daño que hace por lo que aguanta.
 *
 * El héroe (`origen: heroe`) vale **lo que su bando entero**, no lo que pega su
 * cuerpo: matarlo gana la batalla, así que quitarlo de en medio quita de golpe
 * todo lo que pegan los suyos. Con su amenaza propia —la de un individuo con
 * 2-4 de daño— la IA lo trataba como al último campesino.
 *
 * Es para ELEGIR A QUIÉN PEGAR, con golpes y con hechizos (`rindeContra`).
 * Desde #92 también decide a quién va la Flecha: con los PV, iba a quien más
 * PV perdía, y al héroe solo de rebote. Medido con `enfrentamiento.ts --magia`
 * contra la IA de `1e19e6d`, 74,25 % ± 0,72 en 5 000 parejas: es casi todo lo
 * que gana aquel ciclo.
 */
function threat(state: BattleState, s: BattleStack): number {
  switch (s.origen.kind) {
    case 'heroe':
      return sumaDelBando(state, s.side, amenazaPropia);
    case 'catalogo':
    case 'personaje':
      return amenazaPropia(s);
  }
}

/**
 * El objetivo más apetecible para `s`: mucha amenaza y poca vida restante, por la
 * parte de su golpe que llega tras la armadura (`fraccionQueLlega`, con las
 * opciones del disparo o del golpe, `opciones`).
 *
 * La armadura (la arena, #262) entra como factor y no cambiando la cuenta: sin
 * ella el factor es 1 exacto y el juego elige lo mismo que antes (el banco no se
 * mueve). Sin él, el jinete con barda (80 PV, 22 de armadura) era el blanco más
 * rentable y un goblin le disparaba en 40 de 40 semillas, para 0 de daño, con un
 * monje sin armadura a tiro (QA de #262, Q1).
 */
function bestTarget(
  state: BattleState,
  s: BattleStack,
  candidates: BattleStack[],
  opciones: (e: BattleStack) => DamageOptions,
): BattleStack | null {
  const valor = (e: BattleStack): number => {
    const base = threat(state, e) / Math.max(1, stackHp(e));
    // Las opciones solo se piden contra armadura: la IA del juego no paga nada.
    return armaduraDe(e.unit) === 0 ? base : base * fraccionQueLlega(s, e, opciones(e));
  };
  const [primero, ...resto] = candidates;
  if (primero === undefined) return null;
  // `>`: con un empate se queda el primero, como el `reduce` de antes.
  let mejor = primero;
  let valorMejor = valor(primero);
  for (const e of resto) {
    const v = valor(e);
    if (v > valorMejor) {
      mejor = e;
      valorMejor = v;
    }
  }
  return mejor;
}

/**
 * A quién ir a buscar: la amenaza que un golpe de `s` le quitaría de verdad,
 * `threat × min(vida, daño esperado) / vida`.
 *
 * Es `bestTarget` (amenaza por PV) multiplicado por los PV que el golpe quita,
 * con dos cosas que aquel no ve: la defensa del objetivo y el doble golpe, que
 * entran por `expectedDamage` —la misma fórmula del motor, sin tirada—, y el
 * tope de la vida que le queda, sin el cual el campesino solo valía como si
 * matara a cincuenta. Sin el tope (medido) juega peor que la IA de antes:
 * 49,80 % ± 0,29 en 3 000 parejas.
 *
 * **Y no mira la represalia**, que es lo que pedía #79 y se midió: restarle la
 * amenaza que la represalia esperada le quita a `s` juega PEOR cuanto más pesa
 * —×0,5 da 49,78 ± 0,25, ×1 49,93 ± 0,21 aquí y 49,68 ± 0,23 si además elige
 * así a quién pegar estando ya pegado, ×2 49,27 ± 0,33—. El golpe que no doy no
 * me ahorra la represalia: ese enemigo me pega a mí en su turno, primero.
 *
 * Solo elige a quién ACERCARSE: a quien ya se alcanza se le sigue eligiendo con
 * `bestTarget`, que con el mismo valor da 49,97 ± 0,15 contra este (empate).
 */
function aQuienIr(
  state: BattleState,
  s: BattleStack,
  enemigos: readonly BattleStack[],
): BattleStack | null {
  const golpes = hasTrait(s.unit, 'double_attack') ? 2 : 1;
  let mejor: BattleStack | null = null;
  let valorMejor = Number.NEGATIVE_INFINITY;
  for (const e of enemigos) {
    const vida = Math.max(1, stackHp(e));
    const valor =
      (threat(state, e) *
        Math.min(vida, golpes * expectedDamage(s, e, opcionesDeDanio(state, s, e)))) /
      vida;
    if (valor > valorMejor) {
      mejor = e;
      valorMejor = valor;
    }
  }
  return mejor;
}

/**
 * Lo que le cuesta a `s` andar de `from` a pegarse a `target` (`distanciaACaminar`):
 * sin muralla, `hexDistance` al hex más cercano del objetivo, la de siempre; con
 * ella, el rodeo por el hueco o la puerta, e `Infinity` si no hay por dónde.
 */
function distanceTo(state: BattleState, s: BattleStack, from: Hex, target: BattleStack): number {
  return distanciaACaminar(state, s, target)(from);
}

/**
 * Cuánto tiene que rendir un hechizo, en PV equivalentes por punto de maná,
 * para que valga la pena lanzarlo.
 *
 * No es un número inventado: se calibra contra dos comportamientos observables,
 * en la escala de fheroes2. Con 4, la Flecha mágica del héroe inicial (≈20 de
 * daño por 3 de maná) se dispara, y una Prisa sobre tres campesinos (≈1,5 de
 * valor por 3 de maná) no. Los PV van a `ESCALA_DE_CIFRAS`, y el 4 con ellos.
 * Subirlo hace tacaña a la IA; bajarlo la deja gastando el maná en buffos que
 * no cambian nada.
 *
 * Se mide en PV y no en amenaza (`Rinde`) a propósito: es el precio del maná,
 * que no se recupera al salir de la batalla. Con la amenaza como vara, el 4
 * deja de significar nada —medido, la IA casi no lanza: 30,03 % en el banco de
 * `--magia` contra `28eb73b`—. Sin umbral da más (81,6 %), pero ese banco
 * empieza cada batalla con el maná lleno y no puede ver lo que cuesta llegar a
 * la siguiente sin él: quitarlo es una pregunta de partida, no de este banco
 * (#92).
 */
const VALOR_MINIMO_POR_MANA = 4 * ESCALA_DE_CIFRAS;

/**
 * Lo que vale una ronda FUTURA de Prisa o Lentitud, como fracción del mejor
 * golpe de la unidad. En la ronda en curso no hace falta: se sabe dónde está
 * cada uno y se cuenta qué golpe gana o quita. De las rondas siguientes no se
 * sabe nada, y esto es un proxy grueso: lo que se gana no es el daño de la
 * unidad, es llegar antes.
 *
 * Hoy no lo lee ninguna partida: el efecto dura el Poder del lanzador y nada
 * sube el Poder de 1, así que todo temporal se lanza para la ronda en curso.
 * En la arena lo lee también lo que vale acercarse frente a usar un poder
 * (`sinElPoder`).
 */
const FRACCION_TEMPO = 0.5;

/**
 * Lo que rinde un golpe o un hechizo, en dos monedas.
 *
 * - `pv`: los PV que quita (o que ahorra), que es la vara del umbral de maná
 *   (`VALOR_MINIMO_POR_MANA`): la que dice si un lanzamiento vale lo que cuesta.
 * - `amenaza`: la amenaza que esos PV le quitan al bando rival, la de
 *   `aQuienIr` (`threat × PV / vida`), que es la que dice CUÁL lanzar.
 */
interface Rinde {
  readonly pv: number;
  readonly amenaza: number;
}

const NADA: Rinde = { pv: 0, amenaza: 0 };

/** Lo que rinde quitarle `pv` a `e`, con el tope de la vida que le queda. */
function rindeContra(state: BattleState, e: BattleStack, pv: number): Rinde {
  const vida = Math.max(1, stackHp(e));
  const quita = Math.min(stackHp(e), pv);
  return { pv: quita, amenaza: (threat(state, e) * quita) / vida };
}

function escalar(r: Rinde, k: number): Rinde {
  return { pv: r.pv * k, amenaza: r.amenaza * k };
}

/**
 * El mejor golpe que `a` puede dar con `pasos` de movimiento: el que más
 * amenaza quita entre los enemigos a su alcance.
 *
 * El alcance es `hexDistance` hasta la casilla de al lado, sin BFS (y con muralla, la distancia andando, `distanceTo`): en recta se
 * llega antes que rodeando, así que sobreestima un poco, y al comparar dos velocidades de la misma unidad el error se va casi
 * entero en la resta. Un tirador con flechas y sin nadie pegado alcanza a
 * todos: la velocidad no le cambia el golpe, que es lo que tiene que salir de
 * aquí para que la IA no le eche una Prisa a un arquero.
 */
function mejorGolpe(state: BattleState, a: BattleStack, pasos: number): Rinde {
  const tira = isShooter(a.unit) && !isEngaged(state, a);
  const golpes = hasTrait(a.unit, 'double_attack') ? 2 : 1;
  let mejor = NADA;
  for (const e of enemiesOf(state, a)) {
    if (!tira && distanceTo(state, a, a.hex, e) > pasos + 1) continue;
    const r = rindeContra(state, e, golpes * expectedDamage(a, e, opcionesDeDanio(state, a, e)));
    if (r.amenaza > mejor.amenaza) mejor = r;
  }
  return mejor;
}

/**
 * Los pasos que le quedan a `a` en la ronda en curso: los de su turno si es el
 * activo, su velocidad entera si aún no ha actuado, y `null` si ya actuó. Es
 * lo que decide si un temporal le sirve HOY.
 */
function pasosDeEstaRonda(state: BattleState, a: BattleStack): number | null {
  if (state.turno?.stack === a.id) return pasosQueQuedan(state, a);
  return a.acted ? null : stackSpeed(a);
}

/**
 * Cuántas rondas le quedan a la batalla, estimado: las que tarda en caer el
 * bando que antes cae, a lo que pega el otro cada ronda (Σ daño medio, sin
 * defensa ni alcance). Al menos la ronda en curso.
 *
 * Es el tope de lo que compra un temporal: una Prisa de cinco rondas en una
 * batalla que se acaba en dos compra dos. #92 sospechaba que la heurística
 * suponía batallas más largas de lo que duran (3,3 rondas de media en
 * partida); lo que hacía era no contarlas.
 */
function rondasQueQuedan(state: BattleState, side: Side): number {
  const vida = (b: Side): number => sumaDelBando(state, b, (o) => stackHp(o));
  const pega = (b: Side): number => Math.max(1, sumaDelBando(state, b, amenazaPropia));
  const rival = otroBando(side);
  return Math.max(1, Math.ceil(Math.min(vida(side) / pega(rival), vida(rival) / pega(side))));
}

/**
 * Lo que rinde un temporal (Prisa, Lentitud, Bendición, Maldición) sobre este
 * objetivo, contado ronda a ronda por las que de verdad compra: la en curso si
 * el objetivo aún tiene que actuar, y las siguientes hasta su duración o hasta
 * el final estimado de la batalla, lo que llegue antes, sin las que ya cubre
 * el mismo origen (que REFRESCA, no apila: `effects.ts`).
 *
 * En la ronda en curso se sabe dónde está cada uno, así que se cuenta el golpe
 * que el efecto da o quita: la Prisa vale el mejor golpe con dos pasos más
 * menos el de ahora, la Lentitud el del enemigo con dos menos —en PV y
 * amenaza NUESTROS, que es lo que ahorra—, y la suerte su `CHANCE_PER_POINT`
 * de golpe doble (o mitad) sobre el mejor golpe que se alcanza.
 */
function rindeTemporal(
  state: BattleState,
  sp: Spell,
  efecto: StackEffect,
  objetivo: BattleStack,
  quedan = rondasQueQuedan(state, objetivo.side),
  gastaSuTurno: BattleStack | null = null,
): Rinde {
  const amount = sp.amount ?? 0;
  const yaCubre = roundsLeftOf(objetivo, efecto);
  // Quien se lo echa con su turno (un poder sobre sí mismo) ya no golpea hoy: el
  // efecto no le compra la ronda en curso. Contarla daba al monje que se bendecía
  // el golpe que la propia Bendición le quitaba.
  const pasos = objetivo === gastaSuTurno ? null : pasosDeEstaRonda(state, objetivo);

  let hoy = NADA;
  if (pasos !== null && yaCubre === 0) {
    if (sp.kind === 'speed') {
      const antes = mejorGolpe(state, objetivo, pasos);
      const despues = mejorGolpe(state, objetivo, Math.max(1, pasos + amount));
      hoy = {
        pv: Math.abs(despues.pv - antes.pv),
        amenaza: Math.abs(despues.amenaza - antes.amenaza),
      };
    } else {
      hoy = escalar(mejorGolpe(state, objetivo, pasos), valorDeEfectoDeDanio(efecto));
    }
  }

  // Las siguientes: un efecto de N rondas cubre la en curso y N − 1 más, y la
  // batalla no da más que las que le quedan.
  const tope = quedan - 1;
  const cubre = (n: number): number => Math.max(0, Math.min(n - 1, tope));
  const despues = cubre(efecto.roundsLeft) - cubre(yaCubre);
  if (despues <= 0) return hoy;
  // Sin saber dónde estará nadie: el mejor golpe sin mirar el alcance. Al
  // tirador la velocidad no le compra nada, igual que en la ronda en curso.
  const golpe = mejorGolpe(state, objetivo, Number.POSITIVE_INFINITY);
  const tira = isShooter(objetivo.unit);
  const porRonda =
    sp.kind === 'speed'
      ? escalar(golpe, tira ? 0 : FRACCION_TEMPO)
      : escalar(golpe, valorDeEfectoDeDanio(efecto));
  return { pv: hoy.pv + despues * porRonda.pv, amenaza: hoy.amenaza + despues * porRonda.amenaza };
}

/**
 * Lo que rinde lanzar este hechizo sobre este objetivo, para poder comparar un
 * buffo con un daño en la misma escala. Lo lance el héroe (`spellRinde`) o una
 * unidad con su poder (`mejorPoder`): es el mismo hechizo con otro lanzador, y
 * se valora igual. `quedan`, las rondas que le quedan a la batalla para su bando
 * (`rondasQueQuedan`), si quien llama ya las tiene; `gastaSuTurno`, la unidad que
 * lo usa con su turno (el poder), que no se cuenta el golpe de hoy.
 *
 * #92: los temporales valían una fracción de la amenaza del objetivo, sin
 * mirar si aún actuaba ni a quién alcanzaba. Con la tropa de individuos esa
 * amenaza es el daño de UNO —2 a 10—, y la Prisa no pasaba de 3 PV contra los
 * 12 del umbral: en 30 partidas se ofrecieron 4 516 Prisas y 3 476 Lentitudes
 * y no pasó ninguna.
 */
function rindeDe(
  state: BattleState,
  sp: Spell,
  l: Lanzador,
  objetivo: BattleStack,
  quedan?: number,
  gastaSuTurno: BattleStack | null = null,
): Rinde {
  switch (sp.kind) {
    case 'damage':
      // El tope es la vida que queda: sin él, un Rayo sobre tres campesinos
      // puntuaba como si matara a cincuenta.
      // Lo que llega tras la armadura (la arena; en el juego, `cantidad` tal cual).
      return rindeContra(state, objetivo, trasLaArmadura(l.cantidad, objetivo).danio);
    case 'speed':
    case 'luck': {
      // `efectoDe` es la misma función que el motor consulta para saber qué
      // colgaría, así que la duración no se recalcula aquí. Solo devuelve
      // `null` fuera de estas dos ramas: no rinde y no lanza, porque esto es
      // una heurística, no una regla.
      const efecto = efectoDe(sp, l);
      return efecto === null
        ? NADA
        : rindeTemporal(state, sp, efecto, objetivo, quedan, gastaSuTurno);
    }
    case 'heal': {
      // Sale ≈0 salvo con un stack tocado, y está bien: la Curación no se lanza
      // por lanzarla. No necesita caso especial para quedar fuera del umbral.
      const pv = curaDe(sp, l, objetivo);
      return { pv, amenaza: (threat(state, objetivo) * pv) / Math.max(1, stackHp(objetivo)) };
    }
  }
}

/** Lo que rinde que el héroe lance `sp` sobre `objetivo` (`rindeDe` con su poder). */
function spellRinde(
  state: BattleState,
  caster: BattleHero,
  sp: Spell,
  objetivo: BattleStack,
): Rinde {
  return rindeDe(state, sp, delHeroe(sp, caster), objetivo);
}

/**
 * El mejor poder de la lista legal, o `null` si ninguno rinde más que lo que la
 * unidad haría sin él (`sinElPoder`): a diferencia del hechizo, el poder SÍ gasta
 * el turno, así que compite con pegar y con acercarse. Gana el poder con más PV; a
 * igualdad de PV, la amenaza. Sin acciones `poder` —todo el juego— no se calcula
 * nada.
 *
 * Un temporal que el objetivo aún lleva no se refresca con el turno (H1 de QA,
 * vuelta 1): `rindeTemporal` le da las rondas que alarga, y eso es justo para el
 * hechizo, que no cuesta el turno, pero con el poder era bendecirse cada turno
 * en vez de andar —monje contra monje llegaba al tope de 100 rondas en 40 de 40—.
 */
function mejorPoder(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
): BattleAction | null {
  // Casi nadie tiene poderes: entonces, ni se mira la lista.
  if ((s.unit.poderes?.length ?? 0) === 0) return null;
  const mas = (a: Rinde, b: Rinde): boolean =>
    a.pv > b.pv || (a.pv === b.pv && a.amenaza > b.amenaza);
  let mejor: BattleAction | null = null;
  let suRinde = NADA;
  // Todos sus objetivos son de su bando: las rondas que le quedan, una vez.
  let quedan: number | undefined;
  for (const a of acciones) {
    if (a.type !== 'power') continue;
    const p = poder(a.poder);
    const objetivo = stackById(state, a.target);
    const efecto = efectoDe(p.hechizo, p.lanzador);
    if (efecto !== null && roundsLeftOf(objetivo, efecto) > 0) continue;
    if (esDeCura(p) && !(enPeligro(state, objetivo) && vaGanando(state, s.side))) continue;
    quedan ??= rondasQueQuedan(state, s.side);
    const r = rindeDe(state, p.hechizo, p.lanzador, objetivo, quedan, s);
    if (mas(r, suRinde)) {
      mejor = a;
      suRinde = r;
    }
  }
  if (mejor === null) return null;
  return mas(suRinde, sinElPoder(state, s)) ? mejor : null;
}

/**
 * ¿Puede caer `aliado` antes de que vuelva a tocarle a quien lo cura? Lo que
 * le pegarían los enemigos que le llegan en su próximo turno (su velocidad, o el
 * tiro de quien aún dispara), sumado, contra la vida que le queda.
 *
 * Es la vara de la cura con el turno: curar 4 PV a quien no corre peligro solo
 * aplaza la pelea, y con la cura por encima de lo que pega un monje (1-3), monje
 * contra monje se curaban por turnos sin acabar nunca. Curar de urgencia sí
 * compensa: lo que salva es la unidad entera, no sus PV.
 */
function enPeligro(state: BattleState, aliado: BattleStack): boolean {
  let pegan = 0;
  for (const e of enemiesOf(state, aliado)) {
    const tira = isShooter(e.unit) && !isEngaged(state, e);
    if (!tira && distanceTo(state, e, e.hex, aliado) > stackSpeed(e) + 1) continue;
    const golpes = hasTrait(e.unit, 'double_attack') ? 2 : 1;
    pegan += golpes * expectedDamage(e, aliado, opcionesDeDanio(state, e, aliado));
  }
  return aliado.topHp <= pegan;
}

/**
 * ¿Cae antes el otro bando que `side`, a lo que pega cada uno por ronda? La misma
 * carrera que `rondasQueQuedan`, mirada por quién la gana; un empate cuenta como
 * ir ganando.
 *
 * La otra mitad de la vara de la cura: quien pierde la carrera y cura solo alarga
 * la pelea. Con la urgencia sola (`enPeligro`), dos monjes contra dos se curaban
 * por turnos —cada bando salvaba a su herido con una jugada y pegaba con la
 * otra— y en 40 semillas la mediana era de 19 rondas, con 5 sin poderes.
 */
function vaGanando(state: BattleState, side: Side): boolean {
  const vida = (b: Side): number => sumaDelBando(state, b, (o) => stackHp(o));
  const pega = (b: Side): number => Math.max(1, sumaDelBando(state, b, amenazaPropia));
  const rival = otroBando(side);
  return vida(side) * pega(side) >= vida(rival) * pega(rival);
}

/**
 * Lo que rinde el turno de `s` sin usar un poder: el mejor golpe que tiene a mano,
 * o, si acercarse le pone delante uno mejor, acercarse. Acercarse se cuenta como
 * una ronda de tempo, `FRACCION_TEMPO` del mejor golpe sin mirar el alcance —el
 * mismo proxy que una ronda futura de Prisa—: sin él, quien no tenía a nadie a
 * mano comparaba el poder con un 0 y siempre lo usaba.
 */
function sinElPoder(state: BattleState, s: BattleStack): Rinde {
  const aMano = mejorGolpe(state, s, pasosQueQuedan(state, s));
  const acercarse = escalar(mejorGolpe(state, s, Number.POSITIVE_INFINITY), FRACCION_TEMPO);
  return acercarse.pv > aMano.pv ? acercarse : aMano;
}

/**
 * El mejor lanzamiento de la lista de acciones legales, o `null` si ninguno
 * rinde lo bastante.
 *
 * Es una decisión INDEPENDIENTE y previa a la de combate, no una alternativa:
 * `cast` no consume el turno del stack (`battle.ts`, caso `'cast'`), así que
 * lanzar no compite con atacar — solo cuesta maná y la tirada de la ronda.
 * Modelarlo como disyuntiva haría que la IA dejara de pegar para lanzar.
 *
 * Qué lanzamiento pasa lo dicen los PV (`VALOR_MINIMO_POR_MANA`); cuál de los
 * que pasan, la amenaza que quita.
 *
 * Reutiliza las acciones que ya trae el llamante: ni una llamada más a
 * `legalActions`, que es lo caro.
 */
function bestCast(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
): BattleAction | null {
  const hero = state.heroes[s.side];
  if (hero === null) return null;

  let mejor: BattleAction | null = null;
  let mejorValor = 0;
  for (const a of acciones) {
    if (a.type !== 'cast' || a.target === undefined) continue;
    const sp = spell(a.spell);
    const rinde = spellRinde(state, hero, sp, stackById(state, a.target));
    if (rinde.pv < VALOR_MINIMO_POR_MANA * sp.cost) continue;
    if (rinde.amenaza > mejorValor) {
      mejorValor = rinde.amenaza;
      mejor = a;
    }
  }
  return mejor;
}

/** Un ataque que sale de moverse primero: `from` ya está, no es opcional. */
type CargaContra = Extract<BattleAction, { type: 'attack' }> & { from: Hex };

/**
 * Desde qué casilla golpear, cuando hay varias desde las que se alcanza al
 * mismo objetivo.
 *
 * Orden total de tres niveles, y los tres deciden algo:
 *
 * 1. **Máxima carga cobrada.** Es lo único que distingue una casilla de otra:
 *    `computeDamage` no mira el hex más que por la carga, y el daño crece
 *    estrictamente con ella —multiplica por `1 + carga × su tanto por ciento`,
 *    que es el mismo para todas las casillas de una unidad—, así que
 *    ordenar por la carga cobrada es ordenar por daño esperado sin calcularlo.
 *    La dicen `cargaDesde` y `cargaEfectiva`, las mismas que la cobran: en
 *    línea recta, a 3 casillas o más, con el objetivo en la recta y con el
 *    tope de 5 (02-10-2026). Carga todo el que pega cuerpo a cuerpo (#260) y se
 *    mide la recta de cada casilla.
 * 2. **Coste mínimo**, que es lo que queda cuando la carga empata.
 * 3. **El primero en el orden de enumeración**, que hoy es el que decide de
 *    verdad: 722 de 1194 decisiones con varias casillas empatan también a
 *    coste mínimo. Sale solo de comparar con `>` y `<` estrictos.
 *
 * El coste se LEE; no se deduce de que `cargas[0]` sea la casilla más barata.
 * Hoy lo es en 1698 de 1698 casos porque `reachable` es un BFS y la lista legal
 * conserva su orden, pero eso es un accidente del recorrido y no un contrato:
 * el día que el BFS cambie de forma, esto elige lo mismo.
 *
 * **Y se lee del recorrido que ya se hizo**, el de `legalActionsAndCosts`, en
 * vez de lanzar uno nuevo. Cuando esto pedía su propio `movableFrom`, ese
 * segundo recorrido lo pagaban las 1258 de 1258 decisiones SIN `charge`
 * —+17,6 % en 300 batallas—. Las casillas ocupadas, que hacen falta para
 * medir la recta, se piden una vez por decisión y no una por casilla.
 */
function mejorCarga(
  state: BattleState,
  s: BattleStack,
  objetivo: BattleStack,
  cargas: readonly CargaContra[],
  costes: ReadonlyMap<string, Paso>,
): BattleAction {
  // Lo que no cambia de una casilla candidata a otra (las ocupadas, lo que cuesta
  // salir de cada casilla) se cuenta una vez: `medirCargas`.
  const medir = medirCargas(state, s);

  let mejor = cargas[0] as CargaContra;
  let cargaMejor = -1;
  let mejorCoste = Number.POSITIVE_INFINITY;
  for (const a of cargas) {
    const paso = costes.get(hexKey(a.from));
    // Inalcanzable salvo que la lista legal y su propio mapa discrepen: los
    // `from` salen de las claves de ese mapa. Si algún día discrepan, se dice;
    // no se elige una casilla a ciegas.
    if (paso === undefined) {
      throw new Error(`${s.id} no alcanza (${a.from.col},${a.from.row}): la lista legal miente`);
    }
    const medida = medir(a.from, objetivo);
    // Lo que pagará: la carrera por la recta, que puede costar más que el camino
    // barato del recorrido.
    const coste = medida?.carrera.steps ?? paso.steps;
    const carga = medida === null ? 0 : cargaEfectiva(medida.recta, CARGA);
    if (carga > cargaMejor || (carga === cargaMejor && coste < mejorCoste)) {
      mejor = a;
      cargaMejor = carga;
      mejorCoste = coste;
    }
  }
  return mejor;
}

/**
 * Un tramo que deja al objetivo en recta para cargarle en el SIGUIENTE tramo del
 * mismo turno: la casilla a la que ir ahora, o `null` si no hace falta o no la
 * hay.
 *
 * La carga se calcula por tramo y desde donde está la unidad al empezarlo
 * (decisión del usuario, 02-10-2026: «se puede mover un tramo y se vuelve a
 * calcular»), así que un paso de lado alinea rectas que desde aquí no hay. Con
 * la regla en recta la IA casi no cargaba —0 de 203 golpes del banco—, porque
 * esperaba a que la geometría se la diera hecha.
 *
 * Tres condiciones, y las tres deciden algo:
 *
 * - **Desde aquí no hay carga contra él.** Si la hay, `mejorCarga` la cobra ya
 *   y el paso de lado solo gastaría presupuesto.
 * - **En lo que queda caben el paso Y la recta entera**, así que el golpe es de
 *   este turno: la unidad no se queda plantada delante del enemigo a esperar al
 *   siguiente. Una candidata que sí lo hacía —colocarse un turno para cargar al
 *   otro— se midió en el ciclo de los tramos y dio 49,39 % ± 0,18.
 * - **La casilla no toca a ningún enemigo**: pegada a otro, el tramo siguiente
 *   le golpearía a ese (la rama de quien ya se alcanza va antes) y la carga se
 *   perdería.
 *
 * La recta la decide `cargaDesde` sobre la unidad PUESTA en esa casilla, la
 * misma regla que cobra el golpe: aquí solo se enumeran casillas. Entre dos
 * buenas gana la que más carga y, a igualdad, la primera de la lista legal.
 * Sin el rasgo no se recorre nada, que es el 100 % de las decisiones de una
 * partida de hoy sin caballería.
 *
 * Medido con `enfrentamiento.ts --carga` contra la IA de antes: **50,08 % ±
 * 0,07** en 5 000 parejas, el intervalo entero por encima del 50 —por poco: lo
 * que decide son 12 parejas—. En el banco las cargas cobradas pasan de 0 a 64
 * de 222 golpes con el rasgo. Contar la carga al elegir a quién pegar, que era
 * la otra candidata, dio 50,05 ± 0,08 y no entró.
 */
function pasoParaCargar(
  state: BattleState,
  s: BattleStack,
  objetivo: BattleStack,
  enemigos: readonly BattleStack[],
  golpes: readonly CargaContra[],
  acciones: readonly BattleAction[],
  costes: ReadonlyMap<string, Paso>,
): Hex | null {
  // Solo quien carga montado (montura de guerra y lanza, `cargaMontada`) se coloca
  // para cargar: que la IA busque la recta también a pie (#260) queda para después
  // de medir cuántas cargas hace sin ello. A pie carga si la recta le sale de camino.
  if (!cargaMontada(s.unit)) return null;
  const bloqueadas = cerradasPara(state, s);
  if (golpes.some((a) => cargaDesde(state, s, a.from, objetivo, bloqueadas) > 0)) return null;

  const pasos = pasosQueQuedan(state, s);
  const tocaEnemigo = (h: Hex): boolean =>
    enemigos.some((e) => stackHexes(e).some((x) => hexDistance(x, h) <= 1));
  // Las casillas desde las que se le golpea: libres y pegadas a alguna suya.
  const desdes = stackHexes(objetivo)
    .flatMap((h) => neighbours(h))
    .filter((h) => !bloqueadas.has(hexKey(h)));

  let mejor: Hex | null = null;
  let cargaMejor = 0;
  for (const a of acciones) {
    if (a.type !== 'move') continue;
    const paso = costes.get(hexKey(a.to));
    // Inalcanzable salvo que la lista legal y su propio mapa discrepen, como en
    // `mejorCarga`: los `move` salen de las claves de ese mapa.
    if (paso === undefined) {
      throw new Error(`${s.id} no alcanza (${a.to.col},${a.to.row}): la lista legal miente`);
    }
    const resto = pasos - paso.steps;
    if (resto < CARGA_MINIMA || tocaEnemigo(a.to)) continue;
    const puesta = { ...s, hex: a.to };
    for (const desde of desdes) {
      if (hexDistance(a.to, desde) > resto) continue;
      const carga = cargaEfectiva(cargaDesde(state, puesta, desde, objetivo, bloqueadas), CARGA);
      if (carga > cargaMejor) {
        mejor = a.to;
        cargaMejor = carga;
      }
    }
  }
  return mejor;
}

/**
 * Lo que pesa un bando en la batalla: Σ amenaza × PV de lo que tiene en pie.
 *
 * El producto y no la suma, porque es lo que decide un desgaste: un bando que
 * pega el doble y aguanta el doble vale cuatro veces más, no dos. Cuenta al
 * héroe por lo que pega su cuerpo —aquí no se elige a quién pegar, se mide—.
 */
function pesoDelBando(state: BattleState, side: Side): number {
  return sumaDelBando(state, side, (o) => amenazaPropia(o) * stackHp(o));
}

/**
 * Por debajo de esta fracción del peso rival, la IA da la batalla por perdida.
 * Un número redondo y declarado, no calibrado: la regla tenía que ser sencilla
 * (plan de la fase 1b) y el precio de rendirse lo pone el usuario.
 */
const RENDIRSE_POR_DEBAJO_DE = 1 / 3;

/**
 * ¿Rendirse? Sí cuando se ofrece —hay base, no se la defiende y llega el
 * oro—, cuando queda tropa propia viva que salvar —rendirse solo con el héroe
 * es pagar por nada: vuelve igual si cae— y cuando el bando pesa menos de un
 * tercio que el rival.
 */
function convieneRendirse(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
): boolean {
  if (!acciones.some((a) => a.type === 'surrender')) return false;
  const tropaQueSalvar = state.stacks.some(
    (o) => o.side === s.side && o.count > 0 && o.origen.kind !== 'heroe',
  );
  if (!tropaQueSalvar) return false;
  const rival = otroBando(s.side);
  return pesoDelBando(state, s.side) < pesoDelBando(state, rival) * RENDIRSE_POR_DEBAJO_DE;
}

/**
 * Ningún bando vetado: la IA juega para sí misma en los dos, que es lo que hace
 * el banco y lo que hacían todos los llamantes antes de existir el veto.
 */
const NINGUNO: ReadonlySet<Side> = new Set();

/**
 * Elige la acción del stack activo:
 * dispara si puede, remata lo que alcanza, si no se acerca al objetivo más
 * jugoso —o cede la iniciativa antes de meterse en el alcance de quien aún no
 * ha movido—, y si no puede hacer nada útil se defiende.
 */
export function chooseBattleAction(
  state: BattleState,
  noSeRinden: ReadonlySet<Side> = NINGUNO,
): BattleAction {
  return chooseBattleActionAndCosts(state, noSeRinden).action;
}

/**
 * Lo mismo, y además **de qué stack** es la decisión y el recorrido con el que
 * se tomó. Es el mismo par que `legalActions`/`legalActionsAndCosts`, un piso
 * más arriba.
 *
 * Existe porque ese recorrido ya está hecho y `moveTo` lo repetía: era el
 * TERCER BFS del mismo turno del mismo stack —`legalActions` el primero,
 * `mejorCarga` lo lee del primero, y `moveTo` el segundo—, 970 de las 3 170
 * llamadas al BFS del tablero de 300 batallas.
 *
 * De qué turno es viaja al lado de los costes y no se supone: `applyAction` no
 * puede comprobar que un mapa de costes sea de ahora mirando sus claves —las de
 * otro stack cercano, o las del mismo antes de su último tramo, se le parecen—,
 * así que se le dice cuándo se calculó (`Movibles`) y él lo compara.
 */
export function chooseBattleActionAndCosts(
  state: BattleState,
  noSeRinden: ReadonlySet<Side> = NINGUNO,
): { action: BattleAction; movibles: Movibles } {
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null) throw new Error('no hay stack activo');

  const { actions, costs } = legalActionsAndCosts(state);
  return {
    action: decideAccion(state, s, actions, costs, noSeRinden),
    movibles: {
      firma: firmaDelTurno(turno),
      puertas: claveDeAbiertas(state.puertas),
      costs,
    },
  };
}

function decideAccion(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
  costes: ReadonlyMap<string, Paso>,
  noSeRinden: ReadonlySet<Side>,
): BattleAction {
  // Tras un tramo se vuelve a decidir con lo que queda, en vez de cerrar el
  // turno sin mirar: si el paso adelante ha dejado a alguien al alcance, se le
  // pega. Medido con `enfrentamiento.ts` contra la IA que cerraba siempre: 51,08 %
  // ± 0,25 en 5 000 parejas. Lo que tras moverse no es legal —apuntar, puertas,
  // escaleras— no sale de aquí porque se elige de la lista legal, que ya no lo
  // trae: aquí no se vuelve a escribir qué se puede hacer tras un tramo.
  const enemigos = enemiesOf(state, s);
  if (enemigos.length === 0) return colaTerminal(acciones);

  // Rendirse va antes que todo, incluido el hechizo: si la batalla está
  // perdida, gastar maná en ella es tirarlo. Pero solo por un bando que sea
  // SUYO: rendirse cuesta oro, y la IA que resuelve la defensa de una persona o
  // del agente no puede gastárselo por ellos (H-1 de la fase 1b: le cobraba el
  // oro a la persona sin preguntarle ni decírselo). Pelear por otro, sí: eso es
  // lo que ha hecho siempre.
  if (!noSeRinden.has(s.side) && convieneRendirse(state, s, acciones)) {
    return { type: 'surrender' };
  }

  // El hechizo va primero porque no gasta el turno: si se lanza, se volverá a
  // pedir acción para este mismo stack y entonces peleará. En esa segunda
  // vuelta `castThisRound` ya está puesto y `legalActions` no ofrece ni un
  // `cast`, así que esto no puede dar vueltas.
  const conjuro = bestCast(state, s, acciones);
  if (conjuro !== null) return conjuro;

  // La puerta, al principio del turno de quien defiende: tampoco gasta el turno,
  // y cada puerta se cambia una vez por turno (`puertaBlocker`), así que esto
  // tampoco da vueltas. Sin puertas, la lista no trae ninguna jugada de puerta.
  const puerta = puertaDelDefensor(state, s, acciones);
  if (puerta !== null) return puerta;

  // A quién tira limpio hoy (`aTiroLimpio`), una vez: lo leen el tirador de la
  // muralla y el disparo de abajo.
  const aTiro = aTiroLimpio(state, s, acciones, enemigos);

  // Con muralla, el tirador que defiende sube a ella antes que nada.
  const alMuro = tiradorAlMuro(state, s, acciones, costes, aTiro);
  if (alMuro !== null) return alMuro;

  // Un poder (arena: curar, bendecir), si rinde más que el golpe que tiene a mano.
  const conPoder = mejorPoder(state, s, acciones);
  if (conPoder !== null) return conPoder;

  // Un tirador apunta al mejor objetivo con la recta limpia: el disparo diferido
  // (25-10-2026) da al primero de la recta, aunque sea suyo, así que solo vale el
  // enemigo que es ese primero (`aTiroLimpio`). Apunta a su casilla, que es donde
  // más daño hace si no se mueve. Tras moverse la lista no trae ningún `aim`.
  if (aTiro.length > 0) {
    // El liche salpica todo lo pegado al alcanzado, aliados incluidos. Eso es
    // legal —y `legalActions` lo sigue ofreciendo, porque filtrarlo sería
    // mentirle al agente—, pero suicida: aquí se elige con cabeza.
    let candidatos = aTiro;
    if (hasTrait(s.unit, 'splash_shot')) {
      // A quién alcanza la salpicadura lo dice el motor, no una copia de la
      // regla aquí: si mañana cambia el radio, la IA no se queda jugando con la
      // forma vieja.
      const aliadosSalpicados = (objetivo: BattleStack): number =>
        splashTargets(state, s, objetivo).filter((o) => o.side === s.side).length;

      // Se puntúa una vez por enemigo y se elige el mínimo. Sin `rng`: esto no
      // se sortea.
      const coste = candidatos.map((e) => ({ enemigo: e, aliados: aliadosSalpicados(e) }));
      const minimo = Math.min(...coste.map((c) => c.aliados));
      candidatos = coste.filter((c) => c.aliados === minimo).map((c) => c.enemigo);
    }

    const objetivo = bestTarget(state, s, candidatos, (e) =>
      opcionesDelDisparo(state, s, e, e.hex),
    );
    if (objetivo !== null) return { type: 'aim', at: objetivo.hex };
  }

  // Golpear a quien ya se alcanza, priorizando el objetivo más valioso.
  const alcanzables = enemigos.filter((e) => canReachMelee(state, s, e));
  const cercano = bestTarget(state, s, alcanzables, (e) => opcionesDeDanio(state, s, e));
  if (cercano !== null) {
    const ataque = acciones.find(
      (a) => a.type === 'attack' && a.target === cercano.id && a.from === undefined,
    );
    if (ataque !== undefined) return ataque;
  }

  // Acercarse y golpear en el mismo turno, si llega. Solo a por quien se puede
  // llegar andando: el que está detrás de un muro cerrado no es un objetivo, y
  // sin nadie así la unidad se defiende (abajo). Sin muralla llega a todos.
  const aMano = enemigos.filter((e) => distanceTo(state, s, s.hex, e) < Number.POSITIVE_INFINITY);
  // Sin nadie a quien llegar andando, el atacante asalta la muralla.
  if (aMano.length === 0) {
    const asalto = asaltoALaMuralla(state, s, acciones);
    if (asalto !== null) return asalto;
  }
  const objetivo = aQuienIr(state, s, aMano);
  if (objetivo !== null) {
    const cargas = acciones.filter(
      (a): a is CargaContra =>
        a.type === 'attack' && a.target === objetivo.id && a.from !== undefined,
    );
    // Si desde aquí no se le carga pero tras un paso de lado sí, se da ese paso:
    // el tramo siguiente vuelve aquí y `mejorCarga` cobra la recta nueva.
    const tramo = pasoParaCargar(state, s, objetivo, enemigos, cargas, acciones, costes);
    if (tramo !== null) return { type: 'move', to: tramo };
    if (cargas.length > 0) return mejorCarga(state, s, objetivo, cargas, costes);

    // Si no llega, avanzar lo máximo posible hacia él. Los hexes ya están en
    // la mano: los `move` de `acciones` SON `movableHexes(state, s)`, en
    // contenido y en orden, porque `legalActions` los saca de esa misma
    // llamada y los empuja tal cual. Relanzar el BFS aquí era el 20,6 % de los
    // recorridos de tablero de una batalla —1461 de 7090— y un 11 % del banco:
    // #48 izó el BFS DENTRO de `legalActions` y dejó al gemelo un piso arriba.
    //
    // La distancia andando (`distanceTo`): sin ella, con muralla, la unidad se
    // quedaba pegada al muro mirando al enemigo de enfrente. El recorrido es el
    // mismo que acaba de filtrar `aMano`: se guarda por muralla.
    const distancia = distanciaACaminar(state, s, objetivo);
    const mejor = mejorMovimiento(acciones, distancia, distancia(s.hex));
    // Esperar al final de la ronda antes de dar el paso (#81) se retiró con la
    // jugada el 26-10-2026: el paso se da.
    if (mejor !== null) return { type: 'move', to: mejor };
  }

  // Aquí el stack no alcanza a nadie ni puede acercarse: cierra el turno.
  return colaTerminal(acciones);
}

/**
 * Los enemigos a los que `s` puede apuntar (la lista trae su `aim`) con la recta
 * limpia: el primero que encontraría hoy el disparo es él (`lineaDelDisparo`, la
 * regla del núcleo). Sin `aim` en la lista (no es tirador, se ha movido, tiene a
 * alguien encima), ninguno.
 */
function aTiroLimpio(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
  enemigos: readonly BattleStack[],
): BattleStack[] {
  if (!acciones.some((a) => a.type === 'aim')) return [];
  return enemigos.filter((e) => lineaDelDisparo(state, s, e.hex).alcanzado?.id === e.id);
}

/**
 * El `move` de `acciones` que deja más abajo en `medida`, si baja de `tope`: el
 * PRIMERO de los mejores, como siempre, y cada medida una sola vez (el `reduce`
 * de antes recalculaba la del mejor en cada comparación). `null` si ninguno
 * baja de `tope`.
 */
function mejorMovimiento(
  acciones: readonly BattleAction[],
  medida: (h: Hex) => number,
  tope = Number.POSITIVE_INFINITY,
): Hex | null {
  let mejor: Hex | null = null;
  let valor = tope;
  for (const a of acciones) {
    if (a.type !== 'move') continue;
    const d = medida(a.to);
    if (d < valor) {
      mejor = a.to;
      valor = d;
    }
  }
  return mejor;
}

/**
 * El tirador que defiende una muralla, a ella: si no está arriba y llega a un
 * muro libre este turno, sube por el tramo más corto; disparará en el siguiente,
 * que tras moverse no se dispara. Si ya está arriba y acaba de subir, se queda:
 * sin cerrar el turno, la regla de «acercarse y golpear» lo bajaría a por el
 * que tiene al pie. Arriba y sin moverse, dispara por la rama de siempre.
 *
 * `null` si no es un tirador con flechas del defensor, o si no hay muro al que
 * llegar (sin muralla, nunca lo hay): entonces juega como siempre. `aTiro`, a
 * quién tira limpio hoy (`aTiroLimpio`).
 */
function tiradorAlMuro(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
  costes: ReadonlyMap<string, Paso>,
  aTiro: readonly BattleStack[],
): BattleAction | null {
  if (s.side !== 'defender' || !isShooter(s.unit)) return null;
  if (enLoAlto(state, s)) {
    return seHaMovido(state, s) && !isEngaged(state, s) ? { type: 'end_turn' } : null;
  }
  const alMuro = (h: Hex): number =>
    esMuro(state.muralla, h)
      ? (costes.get(hexKey(h))?.steps ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  const mejor = mejorMovimiento(acciones, alMuro);
  if (mejor !== null) return { type: 'move', to: mejor };
  // Ningún muro a mano este turno: hacia el más cercano, si desde aquí no tira a
  // nadie. Desde que de lo alto solo se baja hacia dentro, con una muralla que
  // cierra nadie de fuera es «a mano», y el arquero lento se quedaba
  // quieto en su esquina (la batalla del test de la línea recta, entera
  // cerrando el turno hasta el tope de rondas).
  if (aTiro.length > 0) return null;
  const cerradas = cerradasPara(state, s);
  const libres = state.muralla.muros.filter((m) => !cerradas.has(hexKey(m)));
  if (libres.length === 0) return null;
  const distancia = distanciaAndando(state, s, libres);
  const hacia = mejorMovimiento(acciones, distancia, distancia(s.hex));
  return hacia === null ? null : { type: 'move', to: hacia };
}

/**
 * Quien defiende, con sus puertas (criterio 24 de la muralla alta): **cierra**
 * la que un atacante puede pisar este turno —la lista ya no ofrece cerrar la
 * que tiene a alguien dentro—, y **abre** la que la unidad activa quiere cruzar
 * —con ella abierta queda más cerca de algún enemigo— si ningún atacante puede
 * pisarla este turno. `null` si nada de eso, o si la lista no trae puertas.
 */
function puertaDelDefensor(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
): BattleAction | null {
  for (const a of acciones) {
    if (a.type !== 'abrir_puerta' && a.type !== 'cerrar_puerta') continue;
    const abierta = conLaPuertaAbierta(state, a.puerta);
    const llegan = enemigoEnLaPuerta(abierta, s, a.puerta);
    if (a.type === 'cerrar_puerta' && llegan) return a;
    if (a.type === 'abrir_puerta' && !llegan && quiereCruzar(state, abierta, s)) return a;
  }
  return null;
}

/** `state` con la puerta `puerta` abierta, sin tocarlo: para preguntar qué pasaría. */
function conLaPuertaAbierta(state: BattleState, puerta: PuertaDeMuralla): BattleState {
  return {
    ...state,
    puertas: state.puertas.map((p) => (mismaPuerta(p, puerta) ? { ...p, abierta: true } : p)),
  };
}

/**
 * ¿Puede algún enemigo de `s` llegar a la puerta `puerta` —a cualquiera de sus
 * dos casillas— en su próximo turno, con las puertas de `state`?
 */
function enemigoEnLaPuerta(state: BattleState, s: BattleStack, puerta: PuertaDeMuralla): boolean {
  return enemiesOf(state, s).some(
    (e) => distanciaAndando(state, e, [puerta.a, puerta.b])(e.hex) <= stackSpeed(e),
  );
}

/**
 * ¿Quedaría `s` más cerca de algún enemigo —andando, a pegarse a él— con la
 * puerta abierta (`abierta`) que como está? El tirador con flechas no sale: lo
 * suyo es la muralla. El volador no necesita puerta.
 */
function quiereCruzar(state: BattleState, abierta: BattleState, s: BattleStack): boolean {
  if (hasTrait(s.unit, 'flying') || isShooter(s.unit)) return false;
  const masCerca = (st: BattleState): number =>
    Math.min(...enemiesOf(st, s).map((e) => distanciaACaminar(st, s, e)(s.hex)));
  return masCerca(abierta) < masCerca(state);
}

/**
 * El atacante que no llega andando a nadie, contra la muralla: sube si puede
 * (escalera puesta o rasgo `escalar`), pone su escalera si la lleva, y si no
 * está al pie de un muro libre por el que pueda subir, va hacia el más cercano.
 * `null` si nada de eso sirve —ni escalera, ni rasgo, ni escalera puesta de
 * otro, o no es quien escala—: entonces se defiende, como siempre.
 */
function asaltoALaMuralla(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
): BattleAction | null {
  const escala =
    acciones.find((a) => a.type === 'subir') ?? acciones.find((a) => a.type === 'poner_escalera');
  if (escala !== undefined) return escala;

  const pies = piesDeSubida(state, s);
  if (pies.length === 0) return null;
  // Sin guardar: los pies dependen de dónde está cada unidad ahora.
  const distancia = distanciaAndando(state, s, pies);
  const mejor = mejorMovimiento(acciones, distancia, distancia(s.hex));
  return mejor === null ? null : { type: 'move', to: mejor };
}

/**
 * Las casillas libres del suelo desde las que `s` podría subir a un muro libre
 * —o poner en él su escalera— en cuanto llegue: lo pregunta a la regla de la
 * escala (`escalaDesde`) como si ya estuviera allí y quieto.
 */
function piesDeSubida(state: BattleState, s: BattleStack): Hex[] {
  const cerradas = cerradasPara(state, s);
  const out: Hex[] = [];
  const vistas = new Set<string>();
  for (const muro of state.muralla.muros) {
    if (cerradas.has(hexKey(muro))) continue;
    for (const pie of neighbours(muro)) {
      const k = hexKey(pie);
      if (vistas.has(k) || cerradas.has(k)) continue;
      const sube = escalaDesde(state, s, 'subir', pie, muro, false) === null;
      if (!sube && escalaDesde(state, s, 'poner_escalera', pie, muro, false) !== null) continue;
      vistas.add(k);
      out.push(pie);
    }
  }
  return out;
}

/**
 * Lo que se hace cuando no hay nada mejor: cerrar el turno, que va siempre en la
 * lista (defenderse, que iba antes, se retiró el 26-10-2026).
 */
function colaTerminal(acciones: readonly BattleAction[]): BattleAction {
  const cola = acciones.find((a) => a.type === 'end_turn');
  if (cola === undefined) throw new Error('la lista legal no trae "end_turn"');
  return cola;
}

export interface BattleOutcome {
  readonly winner: Side;
  readonly state: BattleState;
  readonly rounds: number;
}

/**
 * Juega la batalla entera con la IA táctica en ambos bandos. Por los de
 * `noSeRinden` pelea igual, pero no se rinde: son de alguien que no es ella.
 */
export function autoResolve(
  state: BattleState,
  rng: Rng,
  noSeRinden: ReadonlySet<Side> = NINGUNO,
  maxTurnos = MAX_JUGADAS,
): BattleOutcome {
  let n = 0;
  while (state.finished === null && n < maxTurnos) {
    // El recorrido con el que se decidió viaja hasta el motor: `moveTo` lo
    // repetía entero para cobrar la carga.
    const { action, movibles } = chooseBattleActionAndCosts(state, noSeRinden);
    // Con la rueda, los dos eligen a ciegas, y aquí los dos son de la IA: no
    // falta nunca nada. Lo que no es un golpe, la misma acción.
    applyAction(state, completarCruce(state, action, rng).accion, rng, movibles);
    n++;
  }
  if (state.finished === null) {
    // Empate por agotamiento: gana quien conserve más vida. No se deja colgada.
    const vida = (side: Side): number =>
      state.stacks.filter((s) => s.side === side).reduce((t, s) => t + stackHp(s), 0);
    const winner: Side = vida('attacker') >= vida('defender') ? 'attacker' : 'defender';
    state.finished = { winner };
    state.log.push({ kind: 'finished', winner });
  }
  return { winner: state.finished.winner, state, rounds: state.round };
}
