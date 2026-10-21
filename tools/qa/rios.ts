/**
 * Los ríos de un mapa, medidos sobre el mapa hecho y no desde el generador
 * (#144, río continuo): así la medida vale también para un mapa del agente o
 * para el de antes.
 *
 *   npx tsx tools/qa/rios.ts [desde] [hasta] [--lista]
 *
 * Las definiciones, las del plan de `docs/agents/2026-10-14-rios-entre-regiones/`:
 *
 * - **Casilla de río**: agua, un nodo de agua (un puente) o el puente de una
 *   ciudad-puente, la casilla del río a dos de ella que se pisa
 *   (`rioAnteLaCiudad`; la ciudad, en tierra, desde la ciudad amurallada).
 * - **Río**: una componente **4-conexa** de casillas de río que toca el marco
 *   del mapa (con el trazado del generador, la que lleva sus casillas: el agua
 *   de una ciénaga puede salir al marco). El puente y la ciudad-puente cuentan
 *   como agua: se cruzan por encima y el río sigue debajo.
 * - **Río entero** (solo con el trazado del generador, `alTrazarElRio`): cada
 *   río del trazado es una sola componente de casillas de río, con boca.
 * - **Largo** de un río: su diámetro geodésico en cruz, por doble barrido.
 * - **Lago** de un río: el de su trazado; sin él, el agua del río de ancho ≥ 4
 *   en las dos tiradas, en grupos de ≥ 9.
 * - **Ancho** de una casilla de agua del río lejos de nodos (Chebyshev ≥ 2) y
 *   de lagos (ni pegada a ellos): en ocho vecinas, la menor de sus cuatro
 *   tiradas por el río (un río que baja en escalera mide uno en la diagonal que
 *   lo atraviesa). **Bajo la cara**: lo primero que no es río subiendo por su
 *   columna está más alto que ella; ahí va a dos, y se mide por lo hondo de su
 *   columna. **De una bajo la cara**: con lo alto justo al norte y nada de agua
 *   justo al sur.
 * - **Agua de frontera fuera del río**: franjas de agua (`franjasDeBarrera`)
 *   que tocan dos regiones o más y no son de ningún río. Las de una sola región
 *   son **lagos de obstáculo**.
 * - **Escalón**: un río con su agua a más de un nivel (`nivelesDelRelieve`).
 *   **Agua encajada**: agua de un río con las dos vecinas de un eje (que no son
 *   río) por encima de ella: un cañón.
 */
import { resolve } from 'node:path';
import { buildMap, generateMapPlan } from '../../src/core/map/generate.js';
import type { GameMap } from '../../src/core/map/map.js';
import { rioAnteLaCiudad } from '../../src/core/map/recinto.js';
import { estructura, franjasDeBarrera, nivelesDelRelieve } from '../../src/core/map/regiones.js';
import { rioEntero, type TrazadoDelRio } from '../../src/core/map/rio.js';
import type { TerrainKind } from '../../src/core/map/terrain.js';
import { createRng } from '../../src/core/rng.js';

export interface RiosDelMapa {
  /** Los largos de cada río, en el orden de su primera casilla. */
  readonly largos: readonly number[];
  /** Cuántas casillas de río hay en ríos (con boca). */
  readonly casillasDeRio: number;
  /** Con el trazado: por qué un río del trazado no está entero en el mapa, o `null`. */
  readonly roto: string | null;
  readonly puentes: number;
  readonly ciudadesPuente: number;
  /** Las ciudades que no son base. */
  readonly neutrales: number;
  /** Por ancho, de 1 a ≥ 4: el agua del río lejos de nodos y lagos que no está bajo la cara. */
  readonly anchos: readonly [number, number, number, number];
  /** Lo mismo bajo la cara, por lo hondo de su columna. */
  readonly anchosBajoLaCara: readonly [number, number, number, number];
  /** «x,y» del agua del río de una casilla bajo la cara de lo alto. */
  readonly deUnaBajoLaCara: readonly string[];
  readonly aguaFueraDelRio: number;
  readonly franjasFueraDelRio: number;
  readonly lagosDeObstaculo: number;
  readonly casillasDeLagosDeObstaculo: number;
  /** Un punto de cada río con su agua a más de un nivel, y sus niveles. */
  readonly riosConEscalon: readonly string[];
  /** «x,y» de cada casilla de agua encajada de un río. */
  readonly aguaEncajada: readonly string[];
}

const punto = (i: number, W: number): string => `(${i % W},${Math.floor(i / W)})`;

export function riosDelMapa(map: GameMap, trazado?: TrazadoDelRio): RiosDelMapa {
  const W = map.width;
  const H = map.height;
  const N = W * H;
  const terreno = map.terrain as readonly TerrainKind[];
  const { regionDe } = estructura(map);
  const esNodo = new Uint8Array(N);
  const esDelRio = new Uint8Array(N);
  let puentes = 0;
  let ciudadesPuente = 0;
  let ciudades = 0;
  for (let i = 0; i < N; i++) if (terreno[i] === 'water') esDelRio[i] = 1;
  for (const o of map.objects) {
    const i = o.at.y * W + o.at.x;
    if (o.kind === 'town') {
      ciudades++;
      esNodo[i] = 1;
      const puente = rioAnteLaCiudad(map, o.at);
      if (puente !== null) {
        esDelRio[puente.acceso.y * W + puente.acceso.x] = 1;
        ciudadesPuente++;
      }
    }
    if (o.kind === 'node') {
      esNodo[i] = 1;
      if (o.barrera === 'water') {
        esDelRio[i] = 1;
        puentes++;
      }
    }
  }
  const enMarco = (i: number): boolean => {
    const x = i % W;
    const y = (i - x) / W;
    return x === 0 || y === 0 || x === W - 1 || y === H - 1;
  };
  const enCruz = (i: number): number[] => {
    const x = i % W;
    const y = (i - x) / W;
    const fuera: number[] = [];
    if (x > 0) fuera.push(i - 1);
    if (x < W - 1) fuera.push(i + 1);
    if (y > 0) fuera.push(i - W);
    if (y < H - 1) fuera.push(i + W);
    return fuera;
  };
  const enOcho = (i: number, r = 1): number[] => {
    const x = i % W;
    const y = (i - x) / W;
    const fuera: number[] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if ((dx !== 0 || dy !== 0) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H)
          fuera.push((y + dy) * W + x + dx);
    return fuera;
  };

  // Los ríos: componentes en cruz de casillas de río que tocan el marco.
  const comp = new Int32Array(N).fill(-1);
  const rios: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (esDelRio[i] === 0 || comp[i] !== -1) continue;
    const g = [i];
    comp[i] = i;
    for (let q = 0; q < g.length; q++)
      for (const j of enCruz(g[q] as number))
        if (esDelRio[j] === 1 && comp[j] === -1) {
          comp[j] = i;
          g.push(j);
        }
    // Con el trazado, los ríos son los suyos: el agua de una ciénaga que sale
    // al marco no es un río.
    if (trazado === undefined ? g.some(enMarco) : g.some((j) => trazado.mascara[j] === 1))
      rios.push(g);
  }
  const deRio = new Uint8Array(N);
  for (const g of rios) for (const i of g) deRio[i] = 1;

  /** La casilla más lejos de `desde` por el río en cruz, y a cuánto. */
  const lejano = (desde: number): [number, number] => {
    const dist = new Map<number, number>([[desde, 0]]);
    const cola = [desde];
    let ultimo = desde;
    for (let q = 0; q < cola.length; q++) {
      const a = cola[q] as number;
      ultimo = a;
      for (const j of enCruz(a))
        if (deRio[j] === 1 && !dist.has(j)) {
          dist.set(j, (dist.get(a) as number) + 1);
          cola.push(j);
        }
    }
    return [ultimo, dist.get(ultimo) as number];
  };
  const largos = rios.map((g) => lejano(lejano(g[0] as number)[0])[1]);

  // Los lagos del río.
  const tiradaEnRecta = (i: number, dx: number, dy: number): number => {
    let n = 1;
    for (const s of [-1, 1]) {
      let x = (i % W) + s * dx;
      let y = Math.floor(i / W) + s * dy;
      while (x >= 0 && y >= 0 && x < W && y < H && deRio[y * W + x] === 1) {
        n++;
        x += s * dx;
        y += s * dy;
      }
    }
    return n;
  };
  const lago = new Uint8Array(N);
  if (trazado !== undefined) lago.set(trazado.lago);
  else {
    const ancha = (i: number): boolean =>
      deRio[i] === 1 && tiradaEnRecta(i, 1, 0) >= 4 && tiradaEnRecta(i, 0, 1) >= 4;
    const visto = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (visto[i] === 1 || !ancha(i)) continue;
      const g = [i];
      visto[i] = 1;
      for (let q = 0; q < g.length; q++)
        for (const j of enOcho(g[q] as number))
          if (visto[j] === 0 && ancha(j)) {
            visto[j] = 1;
            g.push(j);
          }
      if (g.length >= 9) for (const j of g) lago[j] = 1;
    }
  }

  // El nivel de cada casilla (el del agua, plano por franja).
  const niveles = map.regions.map((r) => r.nivel ?? 1);
  const nivel = nivelesDelRelieve(W, H, terreno, regionDe, niveles, []);

  // El ancho.
  const nodos: number[] = [];
  for (let i = 0; i < N; i++) if (esNodo[i] === 1) nodos.push(i);
  const lejosDeNodos = (i: number): boolean =>
    nodos.every(
      (n) =>
        Math.max(Math.abs((n % W) - (i % W)), Math.abs(Math.floor(n / W) - Math.floor(i / W))) >= 2,
    );
  const anchos: [number, number, number, number] = [0, 0, 0, 0];
  const anchosBajoLaCara: [number, number, number, number] = [0, 0, 0, 0];
  const deUnaBajoLaCara: string[] = [];
  for (let i = 0; i < N; i++) {
    if (deRio[i] === 0 || terreno[i] !== 'water' || lago[i] === 1) continue;
    if (enOcho(i).some((j) => lago[j] === 1) || !lejosDeNodos(i)) continue;
    let norte = i - W;
    while (norte >= 0 && deRio[norte] === 1) norte -= W;
    const bajoLaCara = norte >= 0 && (nivel[norte] as number) > (nivel[i] as number);
    if (
      i >= W &&
      deRio[i - W] === 0 &&
      (nivel[i - W] as number) > (nivel[i] as number) &&
      (i + W >= N || deRio[i + W] === 0)
    )
      deUnaBajoLaCara.push(`${i % W},${Math.floor(i / W)}`);
    if (bajoLaCara) anchosBajoLaCara[Math.min(4, tiradaEnRecta(i, 0, 1)) - 1]! += 1;
    else {
      const ancho = Math.min(
        tiradaEnRecta(i, 1, 0),
        tiradaEnRecta(i, 0, 1),
        tiradaEnRecta(i, 1, 1),
        tiradaEnRecta(i, 1, -1),
      );
      anchos[Math.min(4, ancho) - 1]! += 1;
    }
  }

  // Lo que no es del río: agua de frontera y lagos de obstáculo.
  let aguaFueraDelRio = 0;
  let franjasFueraDelRio = 0;
  let lagosDeObstaculo = 0;
  let casillasDeLagosDeObstaculo = 0;
  for (const f of franjasDeBarrera(W, H, terreno, regionDe)) {
    if (f.barrera !== 'water' || f.casillas.some((c) => deRio[c] === 1)) continue;
    if (f.regiones.size >= 2) {
      franjasFueraDelRio++;
      aguaFueraDelRio += f.casillas.length;
    } else {
      lagosDeObstaculo++;
      casillasDeLagosDeObstaculo += f.casillas.length;
    }
  }

  // Escalones y agua encajada.
  const riosConEscalon: string[] = [];
  for (const g of rios) {
    const suyos = new Set(g.filter((i) => terreno[i] === 'water').map((i) => nivel[i] as number));
    if (suyos.size > 1)
      riosConEscalon.push(`${punto(g[0] as number, W)} a ${[...suyos].join(' y ')}`);
  }
  const aguaEncajada: string[] = [];
  for (let i = 0; i < N; i++) {
    if (deRio[i] === 0 || terreno[i] !== 'water') continue;
    const x = i % W;
    const y = (i - x) / W;
    const encima = (j: number): boolean =>
      esDelRio[j] === 0 && esNodo[j] === 0 && (nivel[j] as number) > (nivel[i] as number);
    if (
      (x > 0 && x < W - 1 && encima(i - 1) && encima(i + 1)) ||
      (y > 0 && y < H - 1 && encima(i - W) && encima(i + W))
    )
      aguaEncajada.push(`${x},${y}`);
  }

  return {
    largos,
    casillasDeRio: rios.reduce((s, g) => s + g.length, 0),
    roto: trazado === undefined ? null : rioEntero(trazado, (i) => esDelRio[i] === 1),
    puentes,
    ciudadesPuente,
    neutrales: ciudades - 2,
    anchos,
    anchosBajoLaCara,
    deUnaBajoLaCara,
    aguaFueraDelRio,
    franjasFueraDelRio,
    lagosDeObstaculo,
    casillasDeLagosDeObstaculo,
    riosConEscalon,
    aguaEncajada,
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
  type Suma = {
    mapas: number;
    conRio: number;
    enteros: number;
    rotos: string[];
    largos: number[];
    rios: number;
    casillas: number;
    puentes: number;
    ciudadesPuente: number;
    neutrales: number;
  };
  const nueva = (): Suma => ({
    mapas: 0,
    conRio: 0,
    enteros: 0,
    rotos: [],
    largos: [],
    rios: 0,
    casillas: 0,
    puentes: 0,
    ciudadesPuente: 0,
    neutrales: 0,
  });
  const porForma = new Map<string, Suma>();
  const total = nueva();
  const anchos = [0, 0, 0, 0];
  const anchosBajoLaCara = [0, 0, 0, 0];
  const deUnaBajoLaCara: string[] = [];
  const escalones: string[] = [];
  const encajada: string[] = [];
  let aguaFuera = 0;
  let franjasFuera = 0;
  let lagos = 0;
  let casillasDeLagos = 0;
  const tiempos: number[] = [];
  const tirados = new Map<string, number>();
  for (let s = desde; s <= hasta; s++) {
    let trazado: TrazadoDelRio | undefined;
    const t0 = performance.now();
    const plan = generateMapPlan(createRng(s), {
      alTirarUnVestido: (fase) => tirados.set(fase, (tirados.get(fase) ?? 0) + 1),
      alTrazarElRio: (t) => {
        trazado = t;
      },
    });
    tiempos.push(performance.now() - t0);
    const r = riosDelMapa(buildMap(plan).map, trazado);
    const forma = trazado?.forma ?? 'sin trazado';
    const suma = porForma.get(forma) ?? nueva();
    porForma.set(forma, suma);
    for (const x of [suma, total]) {
      x.mapas++;
      if (r.largos.length > 0) x.conRio++;
      if (trazado !== undefined && r.roto === null) x.enteros++;
      if (r.roto !== null) x.rotos.push(`s${s}: ${r.roto}`);
      if (r.largos.length > 0) x.largos.push(Math.max(...r.largos));
      x.rios += r.largos.length;
      x.casillas += r.casillasDeRio;
      x.puentes += r.puentes;
      x.ciudadesPuente += r.ciudadesPuente;
      x.neutrales += r.neutrales;
    }
    for (let k = 0; k < 4; k++) {
      anchos[k]! += r.anchos[k]!;
      anchosBajoLaCara[k]! += r.anchosBajoLaCara[k]!;
    }
    for (const p of r.deUnaBajoLaCara) deUnaBajoLaCara.push(`s${s} (${p})`);
    for (const p of r.riosConEscalon) escalones.push(`s${s} ${p}`);
    for (const p of r.aguaEncajada) encajada.push(`s${s} (${p})`);
    aguaFuera += r.aguaFueraDelRio;
    franjasFuera += r.franjasFueraDelRio;
    lagos += r.lagosDeObstaculo;
    casillasDeLagos += r.casillasDeLagosDeObstaculo;
    if (lista)
      console.log(
        `s${s} ${forma}: ríos ${r.largos.length} (largos ${r.largos.join('/') || '-'}), ${r.casillasDeRio} casillas, puentes ${r.puentes}, ciudades-puente ${r.ciudadesPuente}, neutrales ${r.neutrales}${r.roto === null ? '' : `, ROTO: ${r.roto}`}`,
      );
  }
  const por = (x: Suma, n: number): string => (n / Math.max(1, x.mapas)).toFixed(1);
  const fila = (nombre: string, x: Suma): string =>
    `${nombre}: ${x.mapas} mapas, con río ${x.conRio}, ríos enteros ${x.enteros} de ${x.mapas}; ` +
    `ríos ${por(x, x.rios)} por mapa; largo del más largo, mediana ${mediana(x.largos)}; casillas de río ${por(x, x.casillas)}, ` +
    `puentes ${por(x, x.puentes)}, ciudades-puente ${por(x, x.ciudadesPuente)}, neutrales ${por(x, x.neutrales)} por mapa`;
  console.log(`semillas ${desde}-${hasta}`);
  console.log(fila('todas', total));
  for (const [f, x] of [...porForma].sort()) console.log(fila(`  ${f}`, x));
  for (const r of total.rotos) console.log(`  roto: ${r}`);
  const pct = (xs: readonly number[]): string => {
    const t = xs.reduce((a, b) => a + b, 0);
    return `${t} casillas; ancho 1 / 2 / 3 / ≥ 4: ${xs.map((v) => `${((100 * v) / Math.max(1, t)).toFixed(0)} %`).join(' / ')}`;
  };
  console.log(`agua del río lejos de nodos y lagos: ${pct(anchos)}`);
  console.log(`  bajo la cara de lo alto, por lo hondo de su columna: ${pct(anchosBajoLaCara)}`);
  console.log(
    `  de una casilla bajo la cara: ${deUnaBajoLaCara.length}${deUnaBajoLaCara.length > 0 ? ` (${deUnaBajoLaCara.slice(0, 10).join(', ')}${deUnaBajoLaCara.length > 10 ? '…' : ''})` : ''}`,
  );
  console.log(`agua de frontera fuera del río: ${aguaFuera} casillas en ${franjasFuera} franjas`);
  console.log(`lagos de obstáculo: ${lagos} (${casillasDeLagos} casillas)`);
  console.log(
    `ríos con escalón: ${escalones.length}${escalones.length > 0 ? ` (${escalones.slice(0, 6).join('; ')})` : ''}`,
  );
  console.log(
    `agua encajada en un río: ${encajada.length}${encajada.length > 0 ? ` (${encajada.slice(0, 10).join(', ')})` : ''}`,
  );
  console.log(
    `generar: mediana ${mediana(tiempos).toFixed(0)} ms; vestidos tirados ${[...tirados].map(([f, k]) => `${f} ${k}`).join(', ') || 'ninguno'}`,
  );
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) principal();
