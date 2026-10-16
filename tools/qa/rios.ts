/**
 * Los ríos de un mapa, medidos sobre el mapa hecho y no desde el generador
 * (#144): así la medida vale también para un mapa del agente.
 *
 *   npx tsx tools/qa/rios.ts [desde] [hasta] [--lista]
 *
 * Las definiciones, las del plan de `docs/agents/2026-10-14-rios-entre-regiones/`:
 *
 * - **Agua de frontera**: las franjas de agua (`franjasDeBarrera`) que tocan dos
 *   regiones o más, o un puente. Lo que toca una sola región es un **lago de
 *   obstáculo** (`ponerObstaculos`: no toca la frontera).
 * - **Brazo de una ciudad**: una franja de agua de frontera con una casilla a
 *   Chebyshev ≤ 2 de la ciudad que toca una de sus regiones (las de lo que se
 *   pisa a ≤ 2 de ella). La ciudad del cruce corta el agua como un vado. Los
 *   brazos se cuentan por las regiones que separan: dos franjas de una misma
 *   pareja (partida por la base, que es un nodo de pareja) son uno.
 * - **Sistema**: el agua de frontera, los puentes y las ciudades con dos brazos
 *   o más, 8-conexo; la ciudad une sus brazos y el puente el agua a ≤ 2 (su
 *   pasillo, en diagonal, corta a veces el agua de un lado).
 * - **Río**: un sistema que une dos parejas de regiones o más: con una ciudad
 *   de dos brazos, o que toca tres regiones (pasa por un cruce de celdas sin
 *   ciudad; el plan suponía que todo cruce la tiene, y no: la red pone las
 *   ciudades donde se tocan tres regiones abiertas). **Boca**: agua en el marco
 *   del mapa. **De borde a borde**: con agua en el marco en dos sitios a ≥ 10
 *   casillas.
 * - **Charca suelta**: un sistema sin ciudad de río que toca tres regiones o
 *   más y no tiene boca: la charca de un cruce que no es de ningún río.
 * - **Ancho local** de una casilla de agua: la menor de sus dos tiradas de agua
 *   (o puente), la horizontal y la vertical. **Lago atravesado**: el agua de un
 *   río de ancho local ≥ 4, en grupos 8-conexos de ≥ 9 casillas.
 * - **Largo** de un río: su diámetro geodésico (8-conexo; los saltos de la
 *   ciudad y del puente cuentan su Chebyshev), por doble barrido.
 * - **Agua encajada**: una casilla de agua con las dos vecinas de un eje (que no
 *   son agua ni nodo) por encima de ella, con el nivel de `nivelesDelRelieve`.
 * - **Remiendo**: una franja de montaña de una o dos casillas pegada al agua de
 *   un río y rodeada solo de agua, nodos o lo que se pisa: lo que deja
 *   `sinAguaEnLasEsquinas`.
 */
import { resolve } from 'node:path';
import { buildMap, generateMapPlan } from '../../src/core/map/generate.js';
import type { GameMap } from '../../src/core/map/map.js';
import { estructura, franjasDeBarrera, nivelesDelRelieve } from '../../src/core/map/regiones.js';
import { isWalkable, type TerrainKind } from '../../src/core/map/terrain.js';
import { createRng } from '../../src/core/rng.js';

export interface RiosDelMapa {
  readonly rios: number;
  readonly riosConBoca: number;
  readonly riosDeBordeABorde: number;
  /** Los largos de cada río, en el orden de su primera casilla. */
  readonly largos: readonly number[];
  readonly lagosAtravesados: number;
  readonly ciudadesConDosBrazos: number;
  readonly ciudadesConTresBrazos: readonly string[];
  /** Los ríos con agua a más de un nivel: uno de sus puntos y sus niveles. */
  readonly riosConEscalon: readonly string[];
  /** Las ciudades con dos brazos o más cuyo sistema no tiene boca. */
  readonly ciudadesDeRioSinBoca: readonly string[];
  readonly charcasSueltas: number;
  /** Una casilla de cada charca suelta y las regiones que toca. */
  readonly dondeCharcas: readonly string[];
  readonly lagosDeObstaculo: number;
  readonly casillasDeLagosDeObstaculo: number;
  /** Casillas de agua de frontera por ancho local: 1, 2, 3, ≥ 4. */
  readonly anchos: readonly [number, number, number, number];
  readonly aguaEncajada: number;
  readonly remiendos: number;
  readonly casillasDeAguaDeFrontera: number;
}

const punto = (i: number, W: number): string => `(${i % W},${Math.floor(i / W)})`;

export function riosDelMapa(map: GameMap): RiosDelMapa {
  const W = map.width;
  const H = map.height;
  const N = W * H;
  const terreno = map.terrain as readonly TerrainKind[];
  const { regionDe } = estructura(map);
  const esNodo = new Uint8Array(N);
  const puentes: number[] = [];
  const ciudades: number[] = [];
  for (const o of map.objects) {
    const i = o.at.y * W + o.at.x;
    if (o.kind === 'town') {
      esNodo[i] = 1;
      ciudades.push(i);
    }
    if (o.kind === 'node') {
      esNodo[i] = 1;
      if (o.barrera === 'water') puentes.push(i);
    }
  }
  const vecinasDe = (i: number, r: number): number[] => {
    const x = i % W;
    const y = (i - x) / W;
    const fuera: number[] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) fuera.push(ny * W + nx);
      }
    return fuera;
  };
  const franjas = franjasDeBarrera(W, H, terreno, regionDe);
  const franjaDe = new Int32Array(N).fill(-1);
  const deFrontera: boolean[] = [];
  let lagosDeObstaculo = 0;
  let casillasDeLagosDeObstaculo = 0;
  for (const [f, franja] of franjas.entries()) {
    for (const c of franja.casillas) franjaDe[c] = f;
    if (franja.barrera !== 'water') {
      deFrontera.push(false);
      continue;
    }
    const conPuente = franja.casillas.some((c) => vecinasDe(c, 1).some((j) => puentes.includes(j)));
    const frontera = franja.regiones.size >= 2 || conPuente;
    deFrontera.push(frontera);
    if (!frontera) {
      lagosDeObstaculo++;
      casillasDeLagosDeObstaculo += franja.casillas.length;
    }
  }
  const esAguaDeFrontera = (i: number): boolean =>
    franjaDe[i] !== -1 && deFrontera[franjaDe[i] as number] === true;

  // Los brazos de cada ciudad: las franjas de agua que llegan a ella (`brazos`,
  // lo que une) y las parejas de sus regiones que separan (`parejasDeAgua`, lo
  // que se cuenta: la base, que es un nodo de pareja, parte el agua de esa
  // pareja en dos franjas y no por eso tiene dos brazos).
  const brazos = new Map<number, Set<number>>();
  const parejasDeAgua = new Map<number, Set<string>>();
  for (const c of ciudades) {
    const suyas = new Set<number>();
    for (const j of vecinasDe(c, 2))
      if (isWalkable(terreno[j] as TerrainKind) && (regionDe[j] as number) >= 0)
        suyas.add(regionDe[j] as number);
    const de = new Set<number>();
    const parejas = new Set<string>();
    for (const j of vecinasDe(c, 2)) {
      if (!esAguaDeFrontera(j)) continue;
      const f = franjaDe[j] as number;
      const toca = [...(franjas[f]?.regiones ?? [])].sort((a, b) => a - b);
      if (!toca.some((r) => suyas.has(r))) continue;
      de.add(f);
      // La pareja que separa: las regiones de la ciudad que toca, o todas las
      // suyas si solo toca una (el brazo de un cruce vecino).
      const deLaCiudad = toca.filter((r) => suyas.has(r));
      parejas.add((deLaCiudad.length >= 2 ? deLaCiudad : toca).join('-'));
    }
    brazos.set(c, de);
    parejasDeAgua.set(c, parejas);
  }
  const deRio = ciudades.filter((c) => (brazos.get(c)?.size ?? 0) >= 2);

  // Los sistemas: unión de lo de frontera, los puentes y las ciudades de río.
  // Una ciudad que no es de río no une nada; la de río, solo sus brazos.
  const esPuente = new Set(puentes);
  const esDeRio = new Set(deRio);
  const enSistema = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (esAguaDeFrontera(i)) enSistema[i] = 1;
  for (const p of puentes) enSistema[p] = 1;
  for (const c of deRio) enSistema[c] = 1;
  const cheb = (a: number, b: number): number =>
    Math.max(Math.abs((a % W) - (b % W)), Math.abs(Math.floor(a / W) - Math.floor(b / W)));
  const vecinosEnSistema = (i: number): number[] => {
    if (esDeRio.has(i)) {
      const suyas = brazos.get(i) as Set<number>;
      return vecinasDe(i, 2).filter((j) => suyas.has(franjaDe[j] as number));
    }
    // El puente une lo que tiene a dos o menos: su pasillo corta a veces el
    // agua a un lado (la entrada en diagonal), y el agua sigue al otro.
    if (esPuente.has(i)) return vecinasDe(i, 2).filter((j) => esAguaDeFrontera(j));
    return [
      ...vecinasDe(i, 1).filter((j) => enSistema[j] === 1 && !esDeRio.has(j)),
      ...deRio.filter(
        (c) => (brazos.get(c) as Set<number>).has(franjaDe[i] as number) && cheb(c, i) <= 2,
      ),
      ...puentes.filter((p) => cheb(p, i) <= 2),
    ];
  };
  const grupos: number[][] = [];
  {
    const visto = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (enSistema[i] === 0 || visto[i] === 1) continue;
      const g = [i];
      visto[i] = 1;
      for (let q = 0; q < g.length; q++)
        for (const j of vecinosEnSistema(g[q] as number))
          if (visto[j] === 0) {
            visto[j] = 1;
            g.push(j);
          }
      grupos.push(g);
    }
  }
  /** La casilla del sistema más lejos de `desde` y a cuánto, cada salto por su Chebyshev. */
  const lejano = (desde: number, dentro: Set<number>): [number, number] => {
    const dist = new Map<number, number>([[desde, 0]]);
    // Los saltos miden 1 o 2: una cola por distancia basta.
    const colas: number[][] = [[desde]];
    let ultimo = desde;
    let lejos = 0;
    for (let d = 0; d < colas.length; d++) {
      for (const i of colas[d] ?? []) {
        if (dist.get(i) !== d) continue;
        if (d >= lejos) [ultimo, lejos] = [i, d];
        for (const j of vecinosEnSistema(i)) {
          if (!dentro.has(j)) continue;
          const nd = d + cheb(i, j);
          if ((dist.get(j) ?? Number.MAX_SAFE_INTEGER) <= nd) continue;
          dist.set(j, nd);
          const cola = colas[nd] ?? [];
          cola.push(j);
          colas[nd] = cola;
        }
      }
    }
    return [ultimo, lejos];
  };
  const enMarco = (i: number): boolean => {
    const x = i % W;
    const y = (i - x) / W;
    return x === 0 || y === 0 || x === W - 1 || y === H - 1;
  };

  // El ancho local de cada casilla de agua de frontera.
  const esAgua = (i: number): boolean => esAguaDeFrontera(i) || esPuente.has(i);
  const ancho = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (!esAguaDeFrontera(i)) continue;
    const x = i % W;
    const y = (i - x) / W;
    let h = 1;
    for (let k = x - 1; k >= 0 && esAgua(y * W + k); k--) h++;
    for (let k = x + 1; k < W && esAgua(y * W + k); k++) h++;
    let v = 1;
    for (let k = y - 1; k >= 0 && esAgua(k * W + x); k--) v++;
    for (let k = y + 1; k < H && esAgua(k * W + x); k++) v++;
    ancho[i] = Math.min(h, v);
  }
  const anchos: [number, number, number, number] = [0, 0, 0, 0];
  let casillasDeAguaDeFrontera = 0;
  for (let i = 0; i < N; i++) {
    if (!esAguaDeFrontera(i)) continue;
    casillasDeAguaDeFrontera++;
    anchos[Math.min(4, ancho[i] as number) - 1]! += 1;
  }

  let rios = 0;
  let riosConBoca = 0;
  let riosDeBordeABorde = 0;
  let lagosAtravesados = 0;
  let charcasSueltas = 0;
  const dondeCharcas: string[] = [];
  const largos: number[] = [];
  // El nivel de cada casilla (el del agua, plano por franja: `nivelesDelRelieve`).
  const niveles = map.regions.map((r) => r.nivel ?? 1);
  const nivel = nivelesDelRelieve(W, H, terreno, regionDe, niveles, []);
  const riosConEscalon: string[] = [];
  const ciudadesDeRioSinBoca: string[] = [];
  const aguaDeRio = new Uint8Array(N);
  for (const g of grupos) {
    const dentro = new Set(g);
    const susCiudades = g.filter((i) => esDeRio.has(i));
    const toca = new Set<number>();
    for (const i of g)
      if (franjaDe[i] !== -1) for (const r of franjas[franjaDe[i]!]!.regiones) toca.add(r);
    const marco = g.filter(enMarco);
    // Sin ciudad de río, el agua une dos parejas si toca tres regiones: un
    // cruce sin ciudad (el de las celdas, no el de la red). Con boca, es un
    // río que pasa por él; sin boca, una charca de cruce suelta.
    if (susCiudades.length === 0) {
      if (toca.size < 3) continue;
      if (marco.length === 0) {
        charcasSueltas++;
        dondeCharcas.push(`${punto(g[0] as number, W)} [${[...toca].join(',')}]`);
        continue;
      }
    }
    rios++;
    for (const i of g) aguaDeRio[i] = 1;
    // Plano (#210): toda su agua a un nivel, sin escalones ni cascadas.
    const suyos = new Set(g.filter((i) => terreno[i] === 'water').map((i) => nivel[i] as number));
    if (suyos.size > 1)
      riosConEscalon.push(`${punto(g[0] as number, W)} a ${[...suyos].join(' y ')}`);
    if (marco.length > 0) riosConBoca++;
    else for (const c of susCiudades) ciudadesDeRioSinBoca.push(punto(c, W));
    if (marco.some((a) => marco.some((b) => cheb(a, b) >= 10))) riosDeBordeABorde++;
    const [a] = lejano(g[0] as number, dentro);
    largos.push(lejano(a, dentro)[1]);
    // Los lagos atravesados de este río.
    const ancha = new Set(g.filter((i) => (ancho[i] as number) >= 4));
    const vistos = new Set<number>();
    for (const i of ancha) {
      if (vistos.has(i)) continue;
      const cola = [i];
      vistos.add(i);
      for (let q = 0; q < cola.length; q++)
        for (const j of vecinasDe(cola[q] as number, 1))
          if (ancha.has(j) && !vistos.has(j)) {
            vistos.add(j);
            cola.push(j);
          }
      if (cola.length >= 9) lagosAtravesados++;
    }
  }

  // El agua encajada.
  let aguaEncajada = 0;
  for (let i = 0; i < N; i++) {
    if (!esAguaDeFrontera(i)) continue;
    const x = i % W;
    const y = (i - x) / W;
    const encima = (j: number): boolean =>
      terreno[j] !== 'water' && esNodo[j] === 0 && (nivel[j] as number) > (nivel[i] as number);
    if (
      (x > 0 && x < W - 1 && encima(i - 1) && encima(i + 1)) ||
      (y > 0 && y < H - 1 && encima(i - W) && encima(i + W))
    )
      aguaEncajada++;
  }

  // Los remiendos de montaña sobre un río.
  let remiendos = 0;
  for (const franja of franjas) {
    if (franja.barrera !== 'mountain' || franja.casillas.length > 2) continue;
    // Una isla de montaña en el agua: lo que la rodea que no se pisa es agua o un nodo.
    const enFranja = new Set(franja.casillas);
    const alrededor = franja.casillas
      .flatMap((c) => vecinasDe(c, 1))
      .filter((j) => !enFranja.has(j));
    const enElAgua = alrededor.every(
      (j) => isWalkable(terreno[j] as TerrainKind) || terreno[j] === 'water' || esNodo[j] === 1,
    );
    if (enElAgua && alrededor.some((j) => aguaDeRio[j] === 1)) remiendos++;
  }

  return {
    rios,
    riosConBoca,
    riosDeBordeABorde,
    largos,
    lagosAtravesados,
    ciudadesConDosBrazos: deRio.length,
    ciudadesConTresBrazos: ciudades
      .filter((c) => (parejasDeAgua.get(c)?.size ?? 0) >= 3)
      .map((c) => punto(c, W)),
    ciudadesDeRioSinBoca,
    riosConEscalon,
    charcasSueltas,
    dondeCharcas,
    lagosDeObstaculo,
    casillasDeLagosDeObstaculo,
    anchos,
    aguaEncajada,
    remiendos,
    casillasDeAguaDeFrontera,
  };
}

const mediana = (xs: readonly number[]): number => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length === 0 ? 0 : (o[o.length >> 1] as number);
};

function principal(): void {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const desde = Number(args[0] ?? 1);
  const hasta = Number(args[1] ?? 40);
  const lista = process.argv.includes('--lista');
  const suma = {
    mapasConRio: 0,
    mapasConRioConBoca: 0,
    mapasDeBordeABorde: 0,
    mapasConLago: 0,
    rios: 0,
    riosConBoca: 0,
    tresBrazos: 0,
    sinBoca: 0,
    escalones: 0,
    charcas: 0,
    lagosDeObstaculo: 0,
    casillasDeLagos: 0,
    encajada: 0,
    remiendos: 0,
    aguaDeFrontera: 0,
  };
  const anchos = [0, 0, 0, 0];
  const masLargos: number[] = [];
  const tiempos: number[] = [];
  const tirados = new Map<string, number>();
  for (let s = desde; s <= hasta; s++) {
    const t0 = performance.now();
    const plan = generateMapPlan(createRng(s), {
      alTirarUnVestido: (fase) => tirados.set(fase, (tirados.get(fase) ?? 0) + 1),
    });
    tiempos.push(performance.now() - t0);
    const r = riosDelMapa(buildMap(plan).map);
    if (r.rios > 0) suma.mapasConRio++;
    if (r.riosConBoca > 0) suma.mapasConRioConBoca++;
    if (r.riosDeBordeABorde > 0) suma.mapasDeBordeABorde++;
    if (r.lagosAtravesados > 0) suma.mapasConLago++;
    suma.rios += r.rios;
    suma.riosConBoca += r.riosConBoca;
    suma.tresBrazos += r.ciudadesConTresBrazos.length;
    suma.sinBoca += r.ciudadesDeRioSinBoca.length;
    suma.escalones += r.riosConEscalon.length;
    suma.charcas += r.charcasSueltas;
    suma.lagosDeObstaculo += r.lagosDeObstaculo;
    suma.casillasDeLagos += r.casillasDeLagosDeObstaculo;
    suma.encajada += r.aguaEncajada;
    suma.remiendos += r.remiendos;
    suma.aguaDeFrontera += r.casillasDeAguaDeFrontera;
    for (let k = 0; k < 4; k++) anchos[k]! += r.anchos[k]!;
    if (r.largos.length > 0) masLargos.push(Math.max(...r.largos));
    if (lista)
      console.log(
        `s${s}: ríos ${r.rios} (con boca ${r.riosConBoca}, de borde a borde ${r.riosDeBordeABorde}), largos ${r.largos.join('/') || '-'}, lagos atravesados ${r.lagosAtravesados}, charcas ${r.charcasSueltas}${r.dondeCharcas.length > 0 ? ` en ${r.dondeCharcas.join(' ')}` : ''}` +
          (r.ciudadesConTresBrazos.length > 0
            ? `, 3 brazos en ${r.ciudadesConTresBrazos.join(' ')}`
            : '') +
          (r.ciudadesDeRioSinBoca.length > 0
            ? `, sin boca en ${r.ciudadesDeRioSinBoca.join(' ')}`
            : ''),
      );
  }
  const n = hasta - desde + 1;
  const pct = (k: number): string =>
    `${((100 * (anchos[k] as number)) / Math.max(1, suma.aguaDeFrontera)).toFixed(0)} %`;
  console.log(`semillas ${desde}-${hasta}`);
  console.log(
    `mapas con río: ${suma.mapasConRio} de ${n} (con boca ${suma.mapasConRioConBoca}, de borde a borde ${suma.mapasDeBordeABorde})`,
  );
  console.log(
    `ríos: ${suma.rios}, con boca ${suma.riosConBoca}; ciudades de río sin boca ${suma.sinBoca}`,
  );
  console.log(`mapas con un lago atravesado: ${suma.mapasConLago}`);
  console.log(`ciudades con 3 brazos de agua: ${suma.tresBrazos}`);
  console.log(`ríos con el agua a más de un nivel: ${suma.escalones}`);
  console.log(`charcas sueltas: ${suma.charcas}`);
  console.log(
    `mediana del largo del río más largo de cada mapa: ${mediana(masLargos)} (en ${masLargos.length} mapas)`,
  );
  console.log(`lagos de obstáculo: ${suma.lagosDeObstaculo} (${suma.casillasDeLagos} casillas)`);
  console.log(
    `agua de frontera: ${suma.aguaDeFrontera} casillas; ancho 1 ${pct(0)}, 2 ${pct(1)}, 3 ${pct(2)}, ≥ 4 ${pct(3)}`,
  );
  console.log(
    `agua encajada: ${suma.encajada}; remiendos de montaña sobre un río: ${suma.remiendos} (${(suma.remiendos / n).toFixed(2)} por mapa)`,
  );
  console.log(
    `generar: mediana ${mediana(tiempos).toFixed(0)} ms; vestidos tirados ${[...tirados].map(([f, k]) => `${f} ${k}`).join(', ') || 'ninguno'}`,
  );
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) principal();
