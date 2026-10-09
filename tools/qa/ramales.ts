/**
 * Los ramales de las minas (#230): por qué puerta salen, cuánto miden y cuántos
 * dan la vuelta a la mina para llegar a un radio que pasa a su lado.
 *
 * El ramal es lo que va de la mina, por los tramos del mapa, hasta la primera
 * casilla donde la senda se abre (tres tramos o más), acaba (uno) o toca otra
 * hoja (un nodo, una ciudad, otra mina o un pueblo). Sus **pasos** son los tramos
 * recorridos y su **exceso**, los pasos de más sobre la distancia de Chebyshev
 * de la mina a ese final: un ramal derecho tiene 0 o 1 (la puerta, y la L de
 * la puerta a una vecina de su fila), y una **U** es el que rodea la mina: un
 * exceso de 2 o más acabando a dos casillas de ella o menos (s26000 (23,4) antes
 * de #230: sale por debajo, va a la derecha y sube al radio que pasa al este).
 *
 * Uso: `npx tsx tools/qa/ramales.ts [desde] [hasta]` (por defecto 1-200).
 */
import { resolve } from 'node:path';
import type { GameMap } from '../../src/core/map/map.js';
import { newGame } from '../../src/core/state/setup.js';

export interface Ramal {
  readonly mina: string;
  readonly x: number;
  readonly y: number;
  /** El primer paso: `s` (la puerta de debajo), `e` (la de la derecha) u otro rumbo. */
  readonly sale: string;
  readonly pasos: number;
  readonly exceso: number;
  readonly enU: boolean;
  /**
   * Si da la vuelta a la mina: pisa tres o más de sus ocho vecinas (sale por
   * una puerta y dobla su esquina, como el de s26000 antes de #230).
   */
  readonly vuelta: boolean;
}

const RUMBO: Record<string, string> = {
  '0,1': 's',
  '1,0': 'e',
  '-1,0': 'o',
  '0,-1': 'n',
  '1,1': 'se',
  '-1,1': 'so',
  '1,-1': 'ne',
  '-1,-1': 'no',
};

/** Los ramales de las minas de `map`, uno por mina con camino. */
export function ramalesDeMinas(map: GameMap): Ramal[] {
  const W = map.width;
  const vecinas = new Map<number, number[]>();
  const une = (a: number, b: number) => {
    vecinas.set(a, [...(vecinas.get(a) ?? []), b]);
  };
  for (const [p, q] of map.caminos.tramos) {
    une(p.y * W + p.x, q.y * W + q.x);
    une(q.y * W + q.x, p.y * W + p.x);
  }
  const hojas = new Set(
    map.objects
      .filter((o) => ['node', 'town', 'mine', 'village'].includes(o.kind))
      .map((o) => o.at.y * W + o.at.x),
  );
  const ramales: Ramal[] = [];
  for (const o of map.objects) {
    if (o.kind !== 'mine') continue;
    const m = o.at.y * W + o.at.x;
    const salen = vecinas.get(m) ?? [];
    if (salen.length === 0) continue;
    if (salen.length > 1) throw new Error(`la mina ${o.id} tiene ${salen.length} tramos`);
    let antes = m;
    let ahora = salen[0] as number;
    let pasos = 1;
    const junto = (c: number) =>
      Math.max(Math.abs((c % W) - o.at.x), Math.abs((c - (c % W)) / W - o.at.y)) === 1;
    let pisadas = junto(ahora) ? 1 : 0;
    while (!hojas.has(ahora) && (vecinas.get(ahora) ?? []).length === 2) {
      const sigue = (vecinas.get(ahora) as number[]).find((v) => v !== antes) as number;
      antes = ahora;
      ahora = sigue;
      pasos++;
      if (junto(ahora)) pisadas++;
    }
    const x = ahora % W;
    const y = (ahora - x) / W;
    const lejos = Math.max(Math.abs(x - o.at.x), Math.abs(y - o.at.y));
    const p = salen[0] as number;
    const px = p % W;
    const sale = RUMBO[`${px - o.at.x},${(p - px) / W - o.at.y}`] ?? '?';
    ramales.push({
      mina: o.id,
      x: o.at.x,
      y: o.at.y,
      sale,
      pasos,
      exceso: pasos - lejos,
      enU: pasos - lejos >= 2 && lejos <= 2,
      vuelta: pisadas >= 3,
    });
  }
  return ramales;
}

function medir(desde: number, hasta: number): void {
  const todos: (Ramal & { semilla: number })[] = [];
  for (let s = desde; s <= hasta; s++) {
    const { map } = newGame({ seed: s });
    for (const r of ramalesDeMinas(map)) todos.push({ ...r, semilla: s });
  }
  const n = todos.length;
  const porPuerta = new Map<string, number>();
  for (const r of todos) porPuerta.set(r.sale, (porPuerta.get(r.sale) ?? 0) + 1);
  const media = todos.reduce((t, r) => t + r.pasos, 0) / n;
  const enU = todos.filter((r) => r.enU);
  const conExceso = todos.filter((r) => r.exceso >= 2);
  console.log(`semillas ${desde}-${hasta}: ${n} ramales de mina`);
  console.log(`  largo medio ${media.toFixed(2)} pasos`);
  console.log(
    `  salen por: ${[...porPuerta]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  );
  console.log(`  en U (exceso ≥ 2 y acaban a ≤ 2 de la mina): ${enU.length}`);
  console.log(`  con exceso ≥ 2 sobre la distancia: ${conExceso.length}`);
  const vuelta = todos.filter((r) => r.vuelta);
  console.log(`  dan la vuelta (pisan ≥ 3 vecinas de la mina): ${vuelta.length}`);
  for (const r of vuelta.slice(0, 12))
    console.log(
      `    vuelta s${r.semilla} ${r.mina} (${r.x},${r.y}) sale ${r.sale}, ${r.pasos} pasos`,
    );
  for (const r of enU.slice(0, 30))
    console.log(
      `    U s${r.semilla} ${r.mina} (${r.x},${r.y}) sale ${r.sale}, ${r.pasos} pasos, exceso ${r.exceso}`,
    );
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) medir(Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 200));
