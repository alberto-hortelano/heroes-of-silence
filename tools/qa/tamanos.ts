/**
 * Tamaños de mapa: ¿cuánto dura una partida, y cómo se llega a la base rival?
 *
 Es la medida con la que se elige `REGIONES_POR_BANDO` (`map/generate.ts`,
 * #195): el número de regiones es el dato del mapa y el lado sale de él
 * (`ladoDelMapa`). Antes medía lados y elegía `LADO_DEL_MAPA`. La regla es la
 * de siempre: **el menor número con mediana ≥ 8 días, p90 ≤ 20 y 0 partidas sin
 * terminar en 1 000 semillas**; las cifras, en `docs/historia.md`.
 *
 * Por número de regiones, juega `semillas` partidas de la IA contra sí misma y cuenta:
 *
 *  - la duración —mediana, p90 y máximo— y las que no terminan;
 *  - quién gana: cuántas el jugador 0;
 *  - los **asaltos a la base** rival por día de partida, y por cada uno con
 *    cuántos individuos y cuánta fuerza llega el héroe, y si lo pierde: es la
 *    medida del criterio «si vas directo llegas con poca gente»;
 *  - las **emboscadas**, y de ellas las de los días 1 y 2, y los héroes caídos
 *    en los tres primeros días: el efecto de que los asaltantes nazcan también
 *    junto a casa.
 *
 * El asalto se ve desde fuera, sin tocar el núcleo: la batalla la ve el
 * `takeover` de `playAiTurn` —que no la toma, así que la IA la juega igual que
 * sin él, sin una tirada de más— y la toma de una base vacía se lee de la
 * crónica al acabar el turno.
 *
 * Uso: npx tsx tools/qa/tamanos.ts [regiones por bando=3,4,5,6] [semillas=1000] [dias=300] [desde=1]
 *
 * `desde` es la primera semilla: con 1001 se juega otra tanda de mil, que es
 * como se comprobó que una mediana justo en el umbral no era suerte.
 */
import { fuerzaDe } from '../../src/core/ai/fuerza.js';
import { autoResolve } from '../../src/core/ai/tactics.js';
import { playAiTurn } from '../../src/core/ai/turn.js';
import { ladoDelMapa } from '../../src/core/map/generate.js';
import { pointKey } from '../../src/core/map/map.js';
import { createRng } from '../../src/core/rng.js';
import {
  baseOf,
  type GameContext,
  type GameState,
  lugarDelRival,
  settleBattle,
} from '../../src/core/state/game.js';
import { newGame } from '../../src/core/state/setup.js';
import { duracion, mediana } from './estadistica.js';

const REGIONES = (process.argv[2] ?? '3,4,5,6').split(',').map(Number);
const SEMILLAS = Number(process.argv[3] ?? 1000);
const DIAS = Number(process.argv[4] ?? 300);
const DESDE = Number(process.argv[5] ?? 1);

/** Un héroe que llega a la base rival: con qué, y si la toma. */
interface Llegada {
  readonly individuos: number;
  readonly fuerza: number;
  readonly perdida: boolean;
}

/** La base de cada jugador por casilla, para saber si una batalla es contra ella. */
function basesRivales(state: GameState): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of state.players) {
    const t = baseOf(state, p.id);
    if (t !== null) out.set(pointKey(t.at), p.id);
  }
  return out;
}

/**
 * Cierra la batalla pendiente como la IA de reglas cuando nadie más la lleva:
 * `resolvePendingBattle` con los dos jugadores en manos de la IA, que se rinde
 * cuando le conviene.
 */
function cerrarComoLaIA(s: GameState, c: GameContext): void {
  const p = s.pendingBattle;
  if (p === null) return;
  autoResolve(p.battle, c.rng, new Set());
  settleBattle(s, c);
}

for (const regionesPorBando of REGIONES) {
  const lado = ladoDelMapa(regionesPorBando);
  const dias: number[] = [];
  let sinTerminar = 0;
  let ganaJ0 = 0;
  let diasJugados = 0;
  let emboscadas = 0;
  let emboscadasPronto = 0;
  let caidosPronto = 0;
  const llegadas: Llegada[] = [];
  const t0 = performance.now();

  for (let semilla = DESDE; semilla < DESDE + SEMILLAS; semilla++) {
    // Los dos jugadores, «de la persona» solo para que el turno pase cada batalla
    // que nace por `mirar` (`ConduccionDelTurno.batallas`), que la cierra como la
    // IA (`cerrarComoLaIA`): esto no cambia ni una partida.
    const state = newGame({
      seed: semilla,
      maxDays: DIAS,
      regionesPorBando,
      controllers: { 0: 'human', 1: 'human' },
    });
    const ctx = { rng: createRng(semilla) };
    const bases = basesRivales(state);
    const mirar = async (s: GameState, c: GameContext): Promise<void> => {
      apuntar(s);
      cerrarComoLaIA(s, c);
    };
    const apuntar = (s: GameState): void => {
      const p = s.pendingBattle;
      if (p === null || p.attacker.kind !== 'hero') return;
      const heroId = p.attacker.heroId;
      const hero = s.heroes.find((h) => h.id === heroId);
      if (hero === undefined) return;
      // Contra una base es contra lo que esté en su casilla: su guarnición o
      // el héroe que la defiende. Un monstruo o un grupo nunca está en una.
      const dueño = bases.get(pointKey(lugarDelRival(s, p.foe)));
      if (dueño === undefined || dueño === hero.owner) return;
      const individuos = hero.army.length;
      const fuerza = fuerzaDe(hero, s.characters);
      // El desenlace no se sabe aún: se apunta al leer el `battle_ended`.
      mirado.actual = { individuos, fuerza };
    };
    // En un objeto y no en un `let`: `tsc` no ve que el `takeover` lo escribe
    // durante el `await` y lo estrecharía a `null` para siempre.
    const mirado: { actual: { individuos: number; fuerza: number } | null } = { actual: null };
    let dia = 1;

    while (state.finished === null) {
      const desde = state.log.length;
      await playAiTurn(state, ctx, { batallas: { human: mirar } });
      // Lo que pasó en el turno, en orden: el `battle_ended` que cierra un
      // asalto mirado, y la toma de una base que no costó batalla.
      for (let i = desde; i < state.log.length; i++) {
        const e = state.log[i]!;
        if (e.kind === 'day_start') dia = e.day;
        if (e.kind === 'battle_ended' && mirado.actual !== null) {
          llegadas.push({ ...mirado.actual, perdida: e.winner !== 'attacker' });
          mirado.actual = null;
        }
        if (e.kind === 'town_captured' && e.actor !== null && e.at !== null) {
          const dueño = bases.get(pointKey(e.at));
          const conBatalla = state.log[i - 1]?.kind === 'battle_ended';
          if (dueño !== undefined && dueño !== e.actor && !conBatalla) {
            const at = e.at;
            const hero = state.heroes.find(
              (h) => h.owner === e.actor && h.at.x === at.x && h.at.y === at.y,
            );
            if (hero !== undefined) {
              llegadas.push({
                individuos: hero.army.length,
                fuerza: fuerzaDe(hero, state.characters),
                perdida: false,
              });
            }
          }
        }
        if (e.kind === 'battle_started' && e.attacker.kind === 'raider') {
          emboscadas++;
          if (dia <= 2) emboscadasPronto++;
        }
        if (e.kind === 'hero_defeated' && dia <= 3) caidosPronto++;
      }
    }
    if (state.finished.winner === null) sinTerminar++;
    if (state.finished.winner === 0) ganaJ0++;
    dias.push(state.day);
    diasJugados += state.day;
  }

  const ms = performance.now() - t0;
  const conDecimales = (x: number, n = 2): string => x.toFixed(n).replace('.', ',');
  console.log(
    [
      `| ${regionesPorBando} (${lado}×${lado})`,
      duracion(dias),
      `${sinTerminar}/${SEMILLAS}`,
      `${ganaJ0}`,
      conDecimales(llegadas.length / diasJugados, 3),
      `${mediana(llegadas.map((l) => l.individuos))}`,
      `${Math.round(mediana(llegadas.map((l) => l.fuerza)))}`,
      `${llegadas.filter((l) => l.perdida).length}/${llegadas.length}`,
      conDecimales(emboscadas / SEMILLAS),
      `${emboscadasPronto}`,
      `${caidosPronto}`,
      `${conDecimales(ms / 1000, 1)} s |`,
    ].join(' | '),
  );
}
