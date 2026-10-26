/**
 * La tabla de cifras del catálogo, sacada del núcleo: por unidad, lo que pelea con
 * su equipo de serie (fuerza, agilidad efectiva y lo que le quita el peso, PV,
 * peso, defensa, armadura, daño cuerpo a cuerpo, disparo, carga, casillas, nivel y
 * precio), y una fila con el héroe recién hecho. En Markdown, para pegarla tal cual
 * (`docs/agents/2026-10-26-escala-baja/cifras.md`).
 *
 * Con `--medianas`, además, la mediana del poder bruto del catálogo y la de su
 * cuadrado: las dos varas con que se re-escalan el umbral del nivel 2
 * (`data/poder.json`) y `DIVISOR_DEL_PODER` (`src/core/ai/fuerza.ts`) cuando cambia
 * la escala de las cifras (25-10-2026, 26-10-2026).
 *
 * Uso: npx tsx tools/qa/cifras-del-catalogo.ts [--medianas]
 */
import { unitPower } from '../../src/core/ai/fuerza.js';
import { armaduraDe } from '../../src/core/battle/armas.js';
import { armasDe } from '../../src/core/battle/damage.js';
import { costeDeUnaUnidad, unidadesDelJuego } from '../../src/core/catalogo.js';
import { agilidadDe, restaDelPesoDe } from '../../src/core/cuerpo.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../../src/core/hero/experiencia.js';
import { heroeRecienHecho, heroUnit } from '../../src/core/hero/hero.js';
import { indiceDePoder, nivelDelIndice, poderBruto } from '../../src/core/nivel.js';
import { SPEED_TO_HEXES, type UnitInfo } from '../../src/core/types.js';

const horquilla = ([a, b]: readonly [number, number]): string => `${a}–${b}`;

function fila(id: string, u: UnitInfo, precio: string): string {
  const armas = armasDe(u);
  const cuerpo = armas.find((a) => a.uso === 'arma' && a.carga === null);
  const disparo = armas.find((a) => a.uso === 'distancia');
  const carga = armas.find((a) => a.carga !== null);
  const resta = restaDelPesoDe(u);
  const indice = indiceDePoder(u);
  return [
    id,
    u.fuerza,
    `${agilidadDe(u)}${resta > 0 ? ` (−${resta})` : ''}`,
    u.hp,
    `${u.peso ?? 0}${u.montura === undefined ? '' : ` + ${u.montura.peso} de ${u.montura.nombre} (F ${u.montura.fuerza})`}`,
    u.defense,
    armaduraDe(u),
    cuerpo === undefined ? '—' : horquilla(cuerpo.damage),
    disparo === undefined ? '—' : horquilla(disparo.damage),
    carga === undefined ? '—' : `${horquilla(carga.damage)}${carga.montada ? ' montada' : ''}`,
    SPEED_TO_HEXES[u.speed],
    `${nivelDelIndice(indice)} (${indice})`,
    precio,
  ].join(' | ');
}

const filas = unidadesDelJuego().map((u) => fila(u.id, u, String(costeDeUnaUnidad(u))));
const heroe = heroUnit(
  heroeRecienHecho({
    id: 'h',
    owner: 0,
    name: 'Héroe recién hecho',
    faction: 'templarios',
    at: { x: 0, y: 0 },
    experience: EXPERIENCIA_INICIAL_DE_HEROE,
    tipo: 'x',
  }),
);
filas.push(fila('héroe recién hecho (1/1, Espada y gambesón)', heroe, '—'));

console.log(
  '| unidad | F | agilidad efectiva (−peso) | PV | peso | defensa | armadura | cuerpo a cuerpo | disparo | carga | casillas | nivel (índice) | precio |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const f of filas) console.log(`| ${f} |`);

if (process.argv.includes('--medianas')) {
  const mediana = (xs: number[]): number => {
    const o = [...xs].sort((a, b) => a - b);
    const m = Math.floor(o.length / 2);
    return o.length % 2 === 1 ? (o[m] as number) : ((o[m - 1] as number) + (o[m] as number)) / 2;
  };
  const poderes = unidadesDelJuego().map(poderBruto);
  const indices = unidadesDelJuego().map(indiceDePoder);
  const precios = unidadesDelJuego().map(costeDeUnaUnidad);
  console.log('');
  console.log(`poder bruto: mediana ${mediana(poderes)}`);
  console.log(`poder bruto²: mediana ${mediana(poderes.map((p) => p * p))}`);
  console.log(
    `índice: ${Math.min(...indices)}–${Math.max(...indices)}, mediana ${mediana(indices)}`,
  );
  console.log(
    `precio: ${Math.min(...precios)}–${Math.max(...precios)}, mediana ${mediana(precios)}`,
  );
  console.log(
    `fuerza de la IA (unitPower): mediana ${mediana(unidadesDelJuego().map(unitPower)).toFixed(1)}`,
  );
}
