/**
 * La medida de la experiencia: cuánta tropa sube, cuánta llega al 5 y cuánta de
 * esa pisa su base viva, que es lo que necesita el ciclo B (la tropa veterana
 * que se hace héroe). No es un test: mide, como el banco y el barrido.
 *
 *     npx tsx tools/qa/veterania.ts [semillas=200] [dias=300]
 *
 * Lo que publica, por partida salvo que diga otra cosa:
 *
 *  - **individuos que llegan a cada rango** (2, 3, 4 y 5), contados por los
 *    `troop_rank_up` de la crónica: uno por rango cruzado;
 *  - **partidas con algún 5** y **veteranos de 5 que pisan su base** vivos —su
 *    héroe en la casilla de la base, o en la guarnición de la base—, distintos
 *    por `Veterania.id`;
 *  - **subidas de héroe** (`rank_up`) y el rango de los héroes vivos al final, y
 *    el nivel de su cuerpo sin equipo (`nivelDeUnidad`), que es otra cosa;
 *  - la **duración** (mediana / p90 / máximo) y el **ganador** (jugador 0, el
 *    caballero) y las que no terminan.
 *
 * Juega con `partidaDeSemilla` —la misma partida que el banco y el barrido— y
 * mira la base al acabar cada turno (`alAcabarTurno`), porque al final el héroe
 * puede haber caído.
 */
import {
  RANGO_MAXIMO_DE_TROPA,
  rangoDeHeroe,
  rangoDeTropa,
} from '../../src/core/hero/experiencia.js';
import { heroUnit } from '../../src/core/hero/hero.js';
import { nivelDeUnidad } from '../../src/core/nivel.js';
import { baseOf, type GameState } from '../../src/core/state/game.js';
import type { Army } from '../../src/core/types.js';
import { duracion } from './estadistica.js';
import { DIAS_POR_DEFECTO, partidaDeSemilla, SEMILLAS_DEL_BANCO } from './partidas.js';

const SEMILLAS = Number(process.argv[2] ?? SEMILLAS_DEL_BANCO);
const DIAS = Number(process.argv[3] ?? DIAS_POR_DEFECTO);

const cruces = new Array<number>(RANGO_MAXIMO_DE_TROPA + 1).fill(0);
const rangosDeHeroe = new Map<number, number>();
/** El nivel de su cuerpo sin equipo (`nivelDeUnidad`), que no es su rango. */
const nivelesDeCuerpo = new Map<number, number>();
const dias: number[] = [];
let conAlgun5 = 0;
let subidasDeHeroe = 0;
let cincoEnBase = 0;
let partidasConCincoEnBase = 0;
let ganaJ0 = 0;
let sinTerminar = 0;

/** Los veteranos de rango máximo que están ahora mismo en la base de su dueño. */
function cincosEnBase(state: GameState, vistos: Set<string>): void {
  const mirar = (army: Army): void => {
    for (const t of army) {
      if (t.veterania !== undefined && rangoDeTropa(t.veterania) >= RANGO_MAXIMO_DE_TROPA) {
        vistos.add(t.veterania.id);
      }
    }
  };
  for (const p of state.players) {
    const base = baseOf(state, p.id);
    if (base === null) continue;
    mirar(base.garrison);
    for (const h of state.heroes) {
      if (h.owner === p.id && h.at.x === base.at.x && h.at.y === base.at.y) mirar(h.army);
    }
  }
}

for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const enBase = new Set<string>();
  const { state, fin } = await partidaDeSemilla(semilla, DIAS, (st) => cincosEnBase(st, enBase));
  let llegaA5 = false;
  for (const e of state.log) {
    if (e.kind === 'troop_rank_up') {
      cruces[e.rank] = (cruces[e.rank] ?? 0) + 1;
      if (e.rank === RANGO_MAXIMO_DE_TROPA) llegaA5 = true;
    }
    if (e.kind === 'rank_up') subidasDeHeroe++;
  }
  if (llegaA5) conAlgun5++;
  cincoEnBase += enBase.size;
  if (enBase.size > 0) partidasConCincoEnBase++;
  for (const h of state.heroes) {
    const rango = rangoDeHeroe(h);
    rangosDeHeroe.set(rango, (rangosDeHeroe.get(rango) ?? 0) + 1);
    const nivel = nivelDeUnidad(heroUnit(h));
    nivelesDeCuerpo.set(nivel, (nivelesDeCuerpo.get(nivel) ?? 0) + 1);
  }
  dias.push(state.day);
  if (fin.winner === 0) ganaJ0++;
  if (fin.winner === null) sinTerminar++;
}

const porPartida = (n: number): string => (n / SEMILLAS).toFixed(2);
const rangos = [...rangosDeHeroe.entries()].sort((a, b) => a[0] - b[0]);
console.log(`${SEMILLAS} partidas, tope ${DIAS} días`);
console.log(
  `individuos que llegan a cada rango, por partida: ${[2, 3, 4, 5]
    .map((n) => `${n} → ${porPartida(cruces[n] ?? 0)}`)
    .join(' · ')}`,
);
console.log(`partidas con algún individuo de rango 5: ${conAlgun5}/${SEMILLAS}`);
console.log(
  `veteranos de rango 5 que pisan su base vivos: ${cincoEnBase} (${porPartida(cincoEnBase)} por partida, en ${partidasConCincoEnBase}/${SEMILLAS} partidas)`,
);
console.log(
  `subidas de rango de héroe: ${subidasDeHeroe} (${porPartida(subidasDeHeroe)} por partida)`,
);
console.log(`rango de los héroes vivos al final: ${rangos.map(([n, c]) => `${n}:${c}`).join(' ')}`);
console.log(
  `nivel (de su cuerpo sin equipo) de los héroes vivos al final: ${[...nivelesDeCuerpo.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, c]) => `${n}:${c}`)
    .join(' ')}`,
);
console.log(`duración (días, mediana / p90 / máximo): ${duracion(dias)}`);
console.log(`gana el jugador 0 (caballero): ${ganaJ0}/${SEMILLAS} · sin terminar: ${sinTerminar}`);
