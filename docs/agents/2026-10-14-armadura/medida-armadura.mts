/**
 * La armadura de la arena (#262): ¿cuántas peleas de la IA contra la IA no
 * terminan, con la barda y sin ella?
 *
 * La barda da 22 de armadura (`data/equipo.json`), y con el mínimo en 0 un golpe
 * flojo contra ella no quita nada: el riesgo es un jinete casi invulnerable frente
 * a la infantería floja, y una pelea que solo acaba por el tope de rondas
 * (`MAX_ROUNDS`, causa `agotada`). Se juegan dos tandas por semilla, las dos con la
 * IA en los dos bandos, sin héroes, con las reglas del juego y el golpe de azar:
 *
 * - **mezcla**: tres hojas al azar contra tres hojas al azar, de todas;
 * - **jinete contra floja**: un jinete (perfil `montado-*`) contra tres de arco,
 *   ballesta o bastón, que pegan con la daga o el bastón.
 *
 * y cada una otra vez **sin la barda** (la misma pelea con el hueco de armadura
 * vacío en quien la lleva) y **como antes** (sin ella y con lo que sumaba antes de
 * #262, +5 de defensa y +220 PV, en el cuerpo). Cuenta las agotadas, las rondas y los golpes que la
 * armadura paró enteros.
 *
 *   npx tsx docs/agents/2026-10-14-armadura/medida-armadura.mts [semillas]   (100 por defecto)
 */
import { resolve } from 'node:path';
import { chooseBattleAction } from '../../../src/core/ai/tactics.js';
import {
  batallaDeArena,
  type HojaDeArena,
  quitarEnArena,
  type UnidadDeArena,
  unidadPorDefecto,
} from '../../../src/core/arena.js';
import { applyAction, causaDelFinal } from '../../../src/core/battle/battle.js';
import { REGLAS_DEL_JUEGO } from '../../../src/core/battle/reglas.js';
import type { BattleState } from '../../../src/core/battle/types.js';
import { createRng, type Rng } from '../../../src/core/rng.js';
import { hojasDeArena } from '../../../tools/arena/borrador.js';

const SEMILLAS = Number(process.argv[2] ?? 100);
if (!Number.isInteger(SEMILLAS) || SEMILLAS < 1) {
  throw new Error(`las semillas son un entero ≥ 1, y es «${process.argv[2]}»`);
}

const HOJAS = hojasDeArena(resolve(import.meta.dirname, '../../..'));
const JINETES = HOJAS.filter((h) => h.perfil.startsWith('montado-'));
const FLOJAS = HOJAS.filter((h) => ['arco', 'ballesta', 'baston'].includes(h.perfil));

function elegir(rng: Rng, de: readonly HojaDeArena[], n: number): UnidadDeArena[] {
  return Array.from({ length: n }, () => unidadPorDefecto(rng.pick(de)));
}

/** La misma unidad sin su barda, si la lleva. */
function sinBarda(u: UnidadDeArena): UnidadDeArena {
  return u.equipo.armadura === 'barda' ? quitarEnArena(u, 'armadura') : u;
}

/**
 * Como peleaba antes de #262: sin barda, y lo que la barda sumaba (+5 de defensa,
 * +220 PV) en el cuerpo. Para comparar, no para jugar.
 */
function comoAntes(u: UnidadDeArena): UnidadDeArena {
  if (u.equipo.armadura !== 'barda') return u;
  const sin = quitarEnArena(u, 'armadura');
  return { ...sin, defense: sin.defense + 5, hp: sin.hp + 220 };
}

const VARIANTES = [
  ['con barda', (u: UnidadDeArena) => u],
  ['sin barda', sinBarda],
  ['como antes', comoAntes],
] as const;

interface Resultado {
  readonly agotada: boolean;
  /** Ganó el bando izquierdo: en «jinete contra floja», el jinete. */
  readonly izquierda: boolean;
  readonly rondas: number;
  readonly golpes: number;
  readonly parados: number;
}

function pelear(
  izq: readonly UnidadDeArena[],
  der: readonly UnidadDeArena[],
  s: number,
): Resultado {
  const rng = createRng(s);
  const lado = (us: readonly UnidadDeArena[]) => ({
    unidades: us.map((unidad) => ({ unidad })),
    heroe: null,
  });
  const b: BattleState = batallaDeArena(
    { izquierda: lado(izq), derecha: lado(der), reglas: REGLAS_DEL_JUEGO, piezas: [] },
    rng,
  );
  for (let n = 0; b.finished === null; n++) {
    if (n > 20_000) throw new Error(`semilla ${s}: la IA no cierra la batalla`);
    applyAction(b, chooseBattleAction(b), rng);
  }
  let golpes = 0;
  let parados = 0;
  for (const e of b.log) {
    if (e.kind !== 'attack' && e.kind !== 'shoot') continue;
    golpes++;
    if (e.damage === 0 && (e.armadura ?? 0) > 0) parados++;
  }
  return {
    agotada: causaDelFinal(b) === 'agotada',
    izquierda: b.finished?.winner === 'attacker',
    rondas: b.round,
    golpes,
    parados,
  };
}

function tanda(
  nombre: string,
  montar: (rng: Rng) => readonly [UnidadDeArena[], UnidadDeArena[]],
): void {
  for (const [variante, cambia] of VARIANTES) {
    const rs: Resultado[] = [];
    for (let s = 1; s <= SEMILLAS; s++) {
      const [izq, der] = montar(createRng(10_000 + s));
      rs.push(pelear(izq.map(cambia), der.map(cambia), s));
    }
    const agotadas = rs.filter((r) => r.agotada).length;
    const cuales = rs.flatMap((r, i) => (r.agotada ? [i + 1] : []));
    const rondas = rs.map((r) => r.rondas).sort((a, b) => a - b);
    const mediana = rondas[Math.floor(rondas.length / 2)];
    const golpes = rs.reduce((n, r) => n + r.golpes, 0);
    const parados = rs.reduce((n, r) => n + r.parados, 0);
    const gana = rs.filter((r) => r.izquierda).length;
    console.log(
      `${nombre.padEnd(22)} ${variante.padEnd(10)}: ` +
        `${agotadas}/${SEMILLAS} sin terminar${cuales.length === 0 ? '' : ` (s${cuales.join(', s')})`}; gana la izquierda ${gana}; rondas ${mediana} / ${rondas.at(-1)} (mediana / máx.); ` +
        `golpes parados del todo ${parados} de ${golpes} (${((100 * parados) / Math.max(1, golpes)).toFixed(1)} %)`,
    );
  }
}

tanda('mezcla (3 contra 3)', (rng) => [elegir(rng, HOJAS, 3), elegir(rng, HOJAS, 3)]);
tanda('jinete contra floja', (rng) => [elegir(rng, JINETES, 1), elegir(rng, FLOJAS, 3)]);
