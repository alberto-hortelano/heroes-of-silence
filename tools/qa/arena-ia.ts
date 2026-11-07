/**
 * La IA contra la IA en la arena, con las reglas del juego (la rueda del golpe,
 * salir del contacto, la carga a pie y la armadura, #259, #260, #262, siempre
 * desde el 19-10-2026): cuántas peleas no terminan, cuánto duran y qué pasa en
 * ellas, sobre `autoResolve` (el bucle de la IA, el mismo de la página) y
 * `causaDelFinal` («agotada» = la que no termina: sin vencido, por el tope de
 * rondas o de jugadas).
 *
 *     npx tsx tools/qa/arena-ia.ts [semillas=100]
 *
 * Las tandas (cómo se monta cada semilla y con qué variantes se pelea) viven en
 * `tandas-de-la-arena.ts`, que comparte con la huella de identidad (`huella.ts`):
 * mezcla, armadura (mezcla y jinete contra floja, con la barda y sin ella), con
 * héroes y las murallas del mapa. Tras las murallas cuenta además las escaleras
 * puestas, las subidas y las puertas abiertas o cerradas.
 *
 * Cuenta en todas las cargas a pie y las montadas (`cargaMontada`), los golpes parados y los cruces
 * de la rueda. Las variantes de reglas (contacto libre, sin carga a pie, golpe al
 * azar) se fueron con los interruptores. Las variantes se alternan por semilla,
 * para que la carga de la máquina (compartida) caiga igual en todas.
 */

import { autoResolve } from '../../src/core/ai/tactics.js';
import { cargaMontada } from '../../src/core/battle/carga.js';
import { causaDelFinal } from '../../src/core/battle/consultas.js';
import { MAX_ROUNDS } from '../../src/core/battle/types.js';
import {
  montajeDeLaSemilla,
  peleaSinJugar,
  TANDAS,
  type Tanda,
  type Variante,
} from './tandas-de-la-arena.js';

interface Cuenta {
  ms: number;
  agotadas: number[];
  rondas: number[];
  ganaIzquierda: number;
  golpes: number;
  parados: number;
  cargasAPie: number;
  cargasDeJinete: number;
  cruces: number;
  escaleras: number;
  subidas: number;
  puertas: number;
}

/** Juega la tanda `t` en `semillas` semillas, la IA contra la IA, y cuenta cada variante. */
function medir(t: Tanda, semillas: number): Cuenta[] {
  const cuentas: Cuenta[] = t.variantes.map(() => ({
    ms: 0,
    agotadas: [],
    rondas: [],
    ganaIzquierda: 0,
    golpes: 0,
    parados: 0,
    cargasAPie: 0,
    cargasDeJinete: 0,
    cruces: 0,
    escaleras: 0,
    subidas: 0,
    puertas: 0,
  }));
  for (let semilla = 1; semilla <= semillas; semilla++) {
    // El montaje, de su corriente: el mismo para todas las variantes.
    const montaje = montajeDeLaSemilla(t, semilla);
    const orden = t.variantes.map((_, i) => i);
    if (semilla % 2 === 0) orden.reverse();
    for (const i of orden) {
      const v = t.variantes[i] as Variante;
      const c = cuentas[i] as Cuenta;
      const { batalla: b, rng } = peleaSinJugar(t, v, montaje, semilla);
      const t0 = performance.now();
      autoResolve(b, rng);
      c.ms += performance.now() - t0;
      if (causaDelFinal(b) === 'agotada') c.agotadas.push(semilla);
      c.rondas.push(b.round);
      if (b.finished?.winner === 'attacker') c.ganaIzquierda++;
      for (const e of b.log) {
        if (e.kind === 'cruce') c.cruces++;
        if (e.kind === 'ladder_placed') c.escaleras++;
        if (e.kind === 'climbed') c.subidas++;
        if (e.kind === 'gate_opened' || e.kind === 'gate_closed') c.puertas++;
        if (e.kind !== 'attack' && e.kind !== 'shoot') continue;
        c.golpes++;
        if (e.damage === 0 && (e.parado ?? 0) > 0) c.parados++;
        if (e.kind !== 'attack' || e.retaliation || (e.charge ?? 0) === 0) continue;
        const quien = b.stacks.find((x) => x.id === e.stack);
        if (quien !== undefined && cargaMontada(quien.unit)) c.cargasDeJinete++;
        else c.cargasAPie++;
      }
    }
  }
  return cuentas;
}

const semillas = Number(process.argv[2] ?? 100);
if (!Number.isInteger(semillas) || semillas < 1) {
  throw new Error(`«${process.argv[2]}» no es un número de semillas: pon un entero de 1 o más`);
}
console.log(`${semillas} peleas por variante, la IA contra la IA (tope ${MAX_ROUNDS} rondas)`);
for (const t of TANDAS) {
  const cuentas = medir(t, semillas);
  console.log(t.nombre);
  for (const [i, c] of cuentas.entries()) {
    const v = t.variantes[i] as Variante;
    const rondas = [...c.rondas].sort((a, b) => a - b);
    const sinTerminar =
      c.agotadas.length === 0 ? '0' : `${c.agotadas.length} (s${c.agotadas.join(', s')})`;
    console.log(
      `  ${v.nombre.padEnd(16)} sin terminar ${sinTerminar}` +
        `; rondas ${rondas[Math.floor(rondas.length / 2)]} / ${rondas.at(-1)} (mediana / máx.)` +
        `; gana la izquierda ${c.ganaIzquierda}; ${(c.ms / semillas).toFixed(1)} ms/pelea` +
        `; cargas a pie ${c.cargasAPie}, montadas ${c.cargasDeJinete}` +
        `; golpes parados del todo ${c.parados} de ${c.golpes}; cruces de la rueda ${c.cruces}` +
        (v.muralla === undefined
          ? ''
          : `; escaleras puestas ${c.escaleras}, subidas ${c.subidas}, puertas abiertas o cerradas ${c.puertas}`),
    );
  }
}
