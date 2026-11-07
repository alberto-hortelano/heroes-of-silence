/**
 * Lo que puede hacer la unidad activa: la lista legal (`legalActions` y, con el
 * recorrido que ya hizo, `legalActionsAndCosts`), que leen la IA, el agente y la
 * pantalla; por qué no puede golpear a una unidad (`ataqueBlocker`, que mira la lista)
 * y si le queda algo que hacer tras un tramo (`quedaAlgoQueHacer`, con la que el motor
 * cierra el turno).
 *
 * Vivía en `battle.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import type { Hex } from '../types.js';
import { disparoBlocker, granadaBlocker, lanzarBlocker } from './a-distancia.js';
import { escalasA, puertasA } from './asalto.js';
import { areAdjacent } from './board.js';
import {
  activeStack,
  canReachMelee,
  enemiesOf,
  faseBlocker,
  faseDelTurno,
  hechizoDeLaBatalla,
  impedimentoBlocker,
  movableFrom,
  rivalBlocker,
  stackById,
  surrenderBlocker,
} from './consultas.js';
import { impedidoPor } from './effects.js';
import {
  apuntadoBlocker,
  apuntadoDe,
  castBlocker,
  jugadasDeLanzar,
  lanzadorDeLaUnidad,
  previoDelPoder,
} from './lanzar.js';
import { nivelDe } from './muralla.js';
import type { BattleAction, BattleState, Paso } from './types.js';

/** Acciones legales del stack activo. La usan la IA y el validador del agente. */
export function legalActions(state: BattleState): BattleAction[] {
  return legalActionsAndCosts(state).actions;
}

/**
 * Lo mismo, y además el mapa de costes con el que se ha construido la lista.
 *
 * Existe porque ese coste ya se calcula aquí —es el BFS de `movableFrom`— y
 * hasta ahora se tiraba: la lista se quedaba con las claves, así que el
 * llamante que necesitara el coste tenía que recorrer el tablero otra vez. La
 * IA lo necesita para elegir desde qué casilla golpear (#50), y volver a
 * pedirlo era **el 100 % del sobrecoste de aquel cambio, pagado entero por
 * unidades sin `charge`** — las únicas que no pueden aprovecharlo, y hoy son
 * todas: 1258 de 1258 decisiones. Medido en 300 batallas: 150 ms con el
 * segundo recorrido, 128 ms sin él, que es exactamente la línea base.
 *
 * Devolver el mapa **no** relaja el contrato del que cuelga el desempate de la
 * IA: el coste se sigue **leyendo**, solo que del recorrido que ya se hizo en
 * vez de uno nuevo. Las claves del mapa son, en ese orden, los `move` de la
 * lista.
 */
export function legalActionsAndCosts(state: BattleState): {
  actions: BattleAction[];
  costs: Map<string, Paso>;
} {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return { actions: [], costs: new Map() };
  // Lo que se ofrece va por la fase del turno (`faseBlocker`). Con un golpe
  // plantado, solo ese golpe (`golpeEnCursoBlocker`): sin elegir, que lo elegido
  // es de la rueda.
  const fase = faseDelTurno(state);
  if (fase === 'plantado' && state.golpeEnCurso !== null) {
    return { actions: [{ type: 'attack', target: state.golpeEnCurso.target }], costs: new Map() };
  }
  // Tras la Finta, el tramo solo de andar: las casillas del recorrido de
  // siempre, que ya mide lo que le queda (`pasosQueQuedan`), y terminar.
  if (fase === 'trasLaFinta') {
    const costs = movableFrom(state, s);
    const andar: BattleAction[] = [...costs.values()].map((p) => ({ type: 'move', to: p.at }));
    return { actions: [...andar, { type: 'end_turn' }], costs };
  }

  // Tras moverse solo queda moverse más, golpear o terminar: ni puertas, ni
  // escaleras, ni apuntar (decisión del usuario). `end_turn` va al final para no
  // cambiar lo que encuentra un `find` de la IA.
  const movido = fase === 'movido';
  const out: BattleAction[] = movido ? [] : [...puertasA(state), ...escalasA(state, s)];

  const enemies = enemiesOf(state, s);

  // Apuntar: uno por casilla de enemigo vivo, que es lo que tiene sentido elegir;
  // vale cualquier otra casilla del tablero (`apuntarBlocker`), y la prosa del
  // agente lo dice. La recta y a quién da, al salir el disparo.
  if (disparoBlocker(state, s) === null) {
    for (const e of enemies) out.push({ type: 'aim', at: e.hex });
  }
  // Lanzar: uno por casilla de enemigo vivo a su alcance, con la regla de lanzar
  // (`lanzarBlocker`) y no una copia; vale cualquier otra casilla a su alcance, y la
  // prosa del agente lo dice.
  if (granadaBlocker(state, s) === null) {
    for (const e of enemies) {
      if (lanzarBlocker(state, e.hex) === null) out.push({ type: 'throw', at: e.hex });
    }
  }

  // Un solo BFS por llamada. Estaba dentro del bucle de ataques, así que con
  // cuatro enemigos el tablero se recorría cinco veces para dar la misma
  // respuesta: 1 + E. La lista no cambia ni de contenido ni de orden porque se
  // recorre la misma secuencia, solo que sin recalcularla.
  const costs = movableFrom(state, s);
  const alcanzables = [...costs.values()].map((p) => p.at);
  for (const h of alcanzables) out.push({ type: 'move', to: h });

  // Ataques: desde donde está, o moviéndose a un hex desde el que alcance.
  // Es `canReachMelee` desplegada a mano: con individuos este doble bucle se
  // corre ~100 veces por batalla sobre decenas de casillas, y copiar el stack
  // entero por sonda para preguntar lo que solo depende de su casilla era la
  // mitad de su coste.
  // Solo se golpea al mismo nivel (`canReachMelee`): la casilla de la que se
  // sale tiene que estar arriba si el enemigo lo está. El nivel de cada casilla,
  // una vez, fuera del bucle de enemigos.
  const niveles = alcanzables.map((h) => nivelDe(state.muralla, h));
  // Impedido de golpear (un hechizo): ni un golpe en la lista.
  const golpea = impedidoPor(s, 'golpear') === null;
  for (const e of golpea ? enemies : []) {
    if (canReachMelee(state, s, e)) out.push({ type: 'attack', target: e.id });
    const nivel = nivelDe(state.muralla, e.hex);
    // Con índice y no con `entries()`: este bucle es el más caliente de la IA,
    // y el iterador con desestructuración doblaba el coste de la función.
    for (let i = 0; i < alcanzables.length; i++) {
      if (niveles[i] !== nivel) continue;
      const h = alcanzables[i] as Hex;
      if (areAdjacent(h, e.hex)) out.push({ type: 'attack', target: e.id, from: h });
    }
  }

  // Rendirse lo ofrece la misma función que lo rechaza al aplicarlo, y con su
  // precio puesto: es la única acción que cuesta recursos fuera de la batalla.
  const rendicion = surrenderBlocker(state, s.side);
  if (rendicion.motivo === null) out.push({ type: 'surrender', gold: rendicion.coste });

  // Ni una regla de lanzamiento escrita aquí: la lista ofrece exactamente los
  // pares (hechizo, objetivo) que `castBlocker` deja pasar, que es la misma
  // función que después decide si el lanzamiento sale adelante.
  const hero = state.heroes[s.side];
  if (hero !== null) {
    for (const spellId of hero.spells) {
      if (castBlocker(state, s.side, spellId) !== null) continue;
      const h = hechizoDeLaBatalla(state, spellId);
      const vale = (target?: string, at?: Hex): boolean =>
        target === undefined && at === undefined
          ? true
          : castBlocker(state, s.side, spellId, target, at) === null;
      for (const j of jugadasDeLanzar(state, h, vale))
        out.push({ type: 'cast', spell: spellId, ...j });
    }
  }

  // Los poderes, solo con alguno: sin ellos ni se mira, y la lista
  // del juego no cambia ni de contenido ni de orden. Los pares que deja pasar
  // `poderBlocker` —sus mismas dos piezas—: lo que no depende del objetivo una
  // vez por poder, y luego cada objetivo.
  for (const id of s.unit.poderes ?? []) {
    const previo = previoDelPoder(state, id);
    if ('motivo' in previo) continue;
    const l = lanzadorDeLaUnidad(previo.s);
    const vale = (target?: string, at?: Hex): boolean =>
      apuntadoBlocker(
        state,
        previo.h,
        l,
        target === undefined && at === undefined ? null : apuntadoDe(target, at),
        true,
      ) === null;
    for (const j of jugadasDeLanzar(state, previo.h, vale))
      out.push({ type: 'power', poder: id, ...j });
  }

  out.push({ type: 'end_turn' });
  return { actions: out, costs };
}

/**
 * Por qué la unidad activa no puede golpear cuerpo a cuerpo a `targetId`
 * —moviéndose o no—, o `null` si puede. Es a `attack` lo que `castBlocker` a un
 * hechizo: la frase la escribe el núcleo, sin sujeto, y la pantalla la pinta tal
 * cual. **Solo el golpe** (26-10-2026): el tirador que podía apuntar daba `null`
 * aunque no alcanzara, porque el clic en el enemigo apuntaba; con el selector de
 * arma del cliente el clic de «Cuerpo a cuerpo» no apunta, y el de «A distancia»
 * lo juzga `apuntarBlocker`.
 */
export function ataqueBlocker(state: BattleState, targetId: string): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, 'attack');
  if (porLaFase !== null) return porLaFase;
  const target = stackById(state, targetId);
  const rival = rivalBlocker(s, target, 'atacar');
  if (rival !== null) return rival;
  const impedido = impedimentoBlocker(state, s, 'golpear');
  if (impedido !== null) return impedido;
  const { actions } = legalActionsAndCosts(state);
  if (actions.some((a) => a.type === 'attack' && a.target === targetId)) return null;
  return 'no alcanza a esa unidad cuerpo a cuerpo este turno';
}

/**
 * ¿Le queda algo a la unidad activa tras moverse? Lo dice la lista legal, que es
 * donde está escrito qué se puede hacer tras un tramo —moverse más o golpear—, y
 * no una segunda redacción de la misma regla aquí. `cast`, `surrender` y
 * `end_turn` no cuentan: ninguno es la unidad haciendo algo con su turno —el
 * hechizo es del héroe y no lo cierra, la rendición es del bando—, y contarlos
 * dejaría abierto un turno que ya no decide nada.
 */
export function quedaAlgoQueHacer(state: BattleState): boolean {
  return legalActionsAndCosts(state).actions.some((a) => a.type === 'move' || a.type === 'attack');
}
