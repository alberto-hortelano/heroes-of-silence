/**
 * Cuántas cargas hace la IA contra la IA en la arena (#260): a pie y a caballo.
 *
 *   npx tsx docs/agents/2026-10-14-carga-para-todos/medir-cargas.ts [semillas=100]
 *
 * Cada semilla monta dos bandos de cuatro unidades sorteadas entre las hojas de
 * tropa de las cinco facciones (sin héroes), con las reglas del juego, y los juega
 * la IA hasta el final; una vez con la carga a pie (la arena de hoy) y otra sin
 * ella (la de antes). Cuenta, por cada golpe cuerpo a cuerpo que no es
 * contraataque, si quien pega es jinete (`charge`) o va a pie y si cobró carga; y
 * las ocasiones: comienzos de turno con alguna carga a mano (`casillasDeCarga`).
 *
 * Vive fuera de `tools/` porque `invariantes.test.ts` no deja montar peleas de la
 * arena fuera de su página, la sesión y `pnpm capturas`; es una medida de la tarea.
 */
import { chooseBattleAction } from '../../../src/core/ai/tactics.js';
import { batallaDeArena } from '../../../src/core/arena.js';
import { activeStack, applyAction, casillasDeCarga } from '../../../src/core/battle/battle.js';
import { REGLAS_DEL_JUEGO } from '../../../src/core/battle/reglas.js';
import type { BattleState } from '../../../src/core/battle/types.js';
import { hasTrait } from '../../../src/core/data.js';
import { createRng } from '../../../src/core/rng.js';
import { delBorrador, hojasDeLaArena, unidadDeArena } from '../../../test/helpers.js';

const SEMILLAS = Number(process.argv[2] ?? 100);
if (!Number.isSafeInteger(SEMILLAS) || SEMILLAS < 1) {
  throw new Error(`las semillas son un entero ≥ 1, y es ${process.argv[2]}`);
}

const TROPA = hojasDeLaArena()
  .map((h) => h.id)
  .filter((id) => !id.startsWith('heroe-'));

interface Cuenta {
  golpes: number;
  cargas: number;
  ocasiones: number;
  turnos: number;
  casillas: number;
}
const vacia = (): Cuenta => ({ golpes: 0, cargas: 0, ocasiones: 0, turnos: 0, casillas: 0 });

function medir(cargaAPie: boolean): { aPie: Cuenta; jinete: Cuenta; jinetes: number } {
  const aPie = vacia();
  const jinete = vacia();
  let jinetes = 0;
  for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
    const sorteo = createRng(semilla * 7919);
    const bando = () =>
      Array.from({ length: 4 }, () =>
        delBorrador(unidadDeArena(TROPA[sorteo.int(0, TROPA.length - 1)] as string)),
      );
    const izquierda = bando();
    const derecha = bando();
    const rng = createRng(semilla);
    const b: BattleState = batallaDeArena(
      {
        izquierda: { unidades: izquierda, heroe: null },
        derecha: { unidades: derecha, heroe: null },
        reglas: REGLAS_DEL_JUEGO,
        piezas: [],
      },
      rng,
      cargaAPie,
    );
    jinetes += b.stacks.filter((s) => hasTrait(s.unit, 'charge')).length;
    let turnoVisto = -1;
    for (let n = 0; b.finished === null; n++) {
      if (n > 5000) throw new Error(`la semilla ${semilla} no acaba`);
      const s = activeStack(b);
      if (s !== null && b.turno !== null && b.turno.n !== turnoVisto && b.turno.gastado === 0) {
        turnoVisto = b.turno.n;
        const c = hasTrait(s.unit, 'charge') ? jinete : aPie;
        c.turnos++;
        if (casillasDeCarga(b, s).length > 0) c.ocasiones++;
      }
      applyAction(b, chooseBattleAction(b), rng);
    }
    for (const e of b.log) {
      if (e.kind !== 'attack' || e.retaliation) continue;
      const quien = b.stacks.find((s) => s.id === e.stack);
      if (quien === undefined) throw new Error(`${e.stack} no está en la pelea`);
      const c = hasTrait(quien.unit, 'charge') ? jinete : aPie;
      c.golpes++;
      if ((e.charge ?? 0) > 0) {
        c.cargas++;
        c.casillas += e.charge ?? 0;
      }
    }
  }
  return { aPie, jinete, jinetes };
}

const linea = (nombre: string, c: Cuenta): string =>
  `${nombre}: ${c.cargas} cargas en ${c.golpes} golpes (${((100 * c.cargas) / Math.max(1, c.golpes)).toFixed(1)} %), ` +
  `${c.cargas === 0 ? '-' : (c.casillas / c.cargas).toFixed(2)} casillas de media; ` +
  `ocasiones al empezar el turno: ${c.ocasiones} de ${c.turnos}`;

for (const cargaAPie of [true, false]) {
  const t0 = performance.now();
  const r = medir(cargaAPie);
  const ms = Math.round(performance.now() - t0);
  console.log(
    `— ${cargaAPie ? 'con' : 'sin'} carga a pie, ${SEMILLAS} semillas, ${r.jinetes} jinetes en total, ${ms} ms`,
  );
  console.log(`  ${linea('a pie ', r.aPie)}`);
  console.log(`  ${linea('jinete', r.jinete)}`);
}
