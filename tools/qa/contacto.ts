/**
 * Medida de salir del contacto (#259): la IA contra la IA en la arena, con la
 * regla (`?contacto=paga`) y sin ella, sobre los mismos montajes.
 *
 *     npx tsx tools/qa/contacto.ts [semillas=100]
 *
 * Por semilla, un montaje al azar de su propia corriente: de 3 unidades al máximo
 * por bando (`LIDERAZGO.maxPorBando`), de las hojas de las cinco facciones con sus
 * cifras por defecto, sin héroes ni muralla. Se pelea entero con `autoResolve` en los dos modos, y se
 * cuenta cuánto tarda y cuántas peleas acaban «agotadas» (`causaDelFinal`: sin
 * vencido, por el tope de rondas o de jugadas), que son las que no terminan.
 * Los dos modos se alternan en cada semilla, para que la carga de la máquina
 * (compartida) caiga igual en los dos.
 */
import { resolve } from 'node:path';
import { autoResolve } from '../../src/core/ai/tactics.js';
import { batallaDeArena, type FuenteDeArena, unidadPorDefecto } from '../../src/core/arena.js';
import { causaDelFinal, MAX_ROUNDS } from '../../src/core/battle/battle.js';
import type { ModoDelContacto } from '../../src/core/battle/contacto.js';
import { SIN_MURALLA } from '../../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO } from '../../src/core/battle/reglas.js';
import { LIDERAZGO } from '../../src/core/data.js';
import { createRng } from '../../src/core/rng.js';
import { hojasDeArena } from '../arena/borrador.js';

interface Cuenta {
  ms: number;
  agotadas: number;
  rondas: number;
  ganaIzquierda: number;
}

function medir(semillas: number): Record<ModoDelContacto, Cuenta> {
  const hojas = hojasDeArena(resolve(import.meta.dirname, '../..')).filter((h) => !h.heroe);
  const cuentas: Record<ModoDelContacto, Cuenta> = {
    libre: { ms: 0, agotadas: 0, rondas: 0, ganaIzquierda: 0 },
    paga: { ms: 0, agotadas: 0, rondas: 0, ganaIzquierda: 0 },
  };
  for (let semilla = 1; semilla <= semillas; semilla++) {
    // El montaje, de su corriente: el mismo para los dos modos.
    const azar = createRng(semilla * 7919);
    const bando = (): FuenteDeArena[] =>
      Array.from({ length: azar.int(3, LIDERAZGO.maxPorBando) }, () => ({
        unidad: unidadPorDefecto(hojas[azar.int(0, hojas.length - 1)]!),
        escalera: false,
      }));
    const izquierda = bando();
    const derecha = bando();
    const modos: ModoDelContacto[] = semilla % 2 === 0 ? ['libre', 'paga'] : ['paga', 'libre'];
    for (const contacto of modos) {
      const rng = createRng(semilla);
      const b = batallaDeArena(
        {
          izquierda: { unidades: izquierda, heroe: null },
          derecha: { unidades: derecha, heroe: null },
          reglas: REGLAS_DEL_JUEGO,
          muralla: SIN_MURALLA,
          piezas: [],
          contacto,
        },
        rng,
      );
      const t0 = performance.now();
      autoResolve(b, rng);
      const c = cuentas[contacto];
      c.ms += performance.now() - t0;
      if (causaDelFinal(b) === 'agotada') c.agotadas++;
      c.rondas += b.round;
      if (b.finished?.winner === 'attacker') c.ganaIzquierda++;
    }
  }
  return cuentas;
}

const semillas = Number(process.argv[2] ?? 100);
if (!Number.isInteger(semillas) || semillas < 1) {
  throw new Error(`«${process.argv[2]}» no es un número de semillas: pon un entero de 1 o más`);
}
const cuentas = medir(semillas);
console.log(`${semillas} peleas de la arena, IA contra IA (tope ${MAX_ROUNDS} rondas)`);
for (const [modo, c] of Object.entries(cuentas)) {
  console.log(
    `  ${modo.padEnd(5)}  ${c.ms.toFixed(0).padStart(6)} ms (${(c.ms / semillas).toFixed(1)} ms/pelea)` +
      `  agotadas ${c.agotadas}  rondas de media ${(c.rondas / semillas).toFixed(1)}` +
      `  gana la izquierda ${c.ganaIzquierda}`,
  );
}
