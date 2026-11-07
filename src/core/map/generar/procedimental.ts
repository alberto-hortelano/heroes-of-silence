/**
 * El generador procedimental de mapas (`generateMapPlan`): el respaldo cuando no
 * hay agente y el ejemplo de referencia de qué forma debe tener un plan. Traza
 * una red fina (`intentarRed`: semillas en espejo, el río, el reparto ondulado
 * por orillas, los nodos, el perfil de saltos y qué nodos llevan camino,
 * `crucesConCamino`), la viste (`vestir-la-red.ts`) tantas veces como haga falta
 * (`trazarYVestir`) y entrega el plan solo si pasa por la misma puerta que el
 * del agente (`validar.ts`).
 *
 * Es lo que quedó de `map/generate.ts` —validar y construir un plan, y el
 * procedimental— al repartirlo por `map/generar/` (fase N de la reorganización,
 * 07-11-2026).
 */
import { createRng, type Rng } from '../../rng.js';
import type { Point } from '../../types.js';
import { aPunto, chebyshev, parejaDe, VECINAS } from '../geometria.js';
import { createEmptyMap } from '../map.js';
import { cabeElRecinto, SEPARACION_DE_CIUDADES } from '../recinto.js';
import { estructura, problemasDeRed, regionesQueToca, vecindad } from '../regiones.js';
import { FORMAS_DEL_RIO, type FormaDelRio, orillas, sortearForma, trazarRio } from '../rio.js';
import type { Estructura, GameMap } from '../tipos.js';
import { conEjePleno } from '../vestir/fronteras.js';
import { huellaDeSemillas, nombreDeRegion } from './nombres.js';
import {
  LADO_DEL_MAPA,
  LADO_MAXIMO_DEL_GENERADOR,
  LADO_MAXIMO_DEL_PLAN,
  LADO_MINIMO_DEL_GENERADOR,
  LADO_MINIMO_DEL_PLAN,
  ladoDelMapa,
  type PlanConTramos,
  regionesDelMapa,
} from './plan.js';
import { parejasConCiudad, regionesDeFuera, saltosALaRegion } from './poblar.js';
import { validateMapPlan } from './validar.js';
import {
  enSuOrilla,
  FASES_DEL_VESTIDO,
  type FaseDelVestido,
  hayRegionRaquitica,
  type ProceduralOptions,
  type RedFina,
  vestirRed,
} from './vestir-la-red.js';

/**
 * Redes finas que se trazan antes de rendirse diciéndolo. Mide solo la red: el
 * vestido tiene sus propios intentos sobre cada una. Se exporta para que el
 * test del mensaje de error no lleve la cifra escrita.
 */
export const INTENTOS_DE_RED = 30;
/**
 * Vestidos que se prueban sobre una misma red fina ya validada antes de tirarla.
 * Un vestido que falla —unos suelos que no admiten cuatro barreras, un engorde
 * que parte una región, unos obstáculos que no caben— no dice nada malo de la
 * red, y tirarla con él era pagar otra vez el Voronoi, los nodos y el perfil.
 */
const INTENTOS_DE_VESTIDO = 10;
/**
 * Mapa de nodos de dos jugadores. Es el respaldo cuando no hay agente y el
 * ejemplo de referencia de qué forma debe tener un plan.
 *
 * **Voronoi con semillas en espejo**, que es la opción B del plan y la que se
 * midió: cada semilla es una región, las fronteras entre celdas se trazan como
 * un muro fino de una casilla, y cada pareja de regiones vecinas tiene un paso
 * en mitad de su frontera. Los cruces de Voronoi son de grado 3 por naturaleza,
 * que es donde van las ciudades neutrales, y el grafo de regiones no es un
 * árbol —con muros rectos de BSP sí lo era, y había un solo camino de la base a
 * cada ciudad—.
 *
 * **Esa red fina se valida y solo después se viste** (`vestir/`, mapas densos,
 * 03-10-2026): la frontera engorda a 2-3 casillas con su barrera según los
 * suelos, cada región lleva su suelo entero, obstáculos que bloquean y caminos.
 * Vestir solo convierte casillas pisables en barrera, que nunca abre un paso, y
 * el grafo de regiones y nodos que validó el perfil es el mismo. El nodo queda
 * en un estrechamiento de una casilla, y es la única excepción al grosor.
 *
 * El espejo de las **semillas** es exacto y el de los **muros** no: un muro de
 * una casilla no se puede reflejar sin abrir huecos (se midió: 75 % de fugas);
 * el engorde y los obstáculos van en espejo cuando el reflejo vale.
 * Así que el equilibrio no se pide por simetría sino por **perfil**: las dos
 * bases tienen que tener sus dos ciudades más cercanas a los mismos saltos, y
 * la más cercana a dos como mucho. Si una red no lo cumple se traza otra con
 * el mismo `rng`, y tras `INTENTOS_DE_RED` se lanza diciendo en qué fase se
 * agotaron los intentos.
 *
 * **Un vestido que falla no tira la red**: se vuelve a vestir la misma hasta
 * `INTENTOS_DE_VESTIDO` veces. Medido (03-10-2026, 200 semillas por lado de 24
 * a 48): ninguna semilla necesita más de 14 redes (24×24; 5 o menos de 28 en
 * adelante), y de las redes equilibradas, entre el 49 y el 81 % se visten a la
 * primera y entre el 86 y el 96 % en diez intentos. Unas pocas (1-12 de 200) no
 * se visten ni en cien —los suelos sorteados no son lo que falla, es la forma
 * de la red—, y para esas es mejor otra red que insistir. Con 20 y 10, 0 planes
 * sin salir en ningún lado. Con el engorde casilla a casilla de #169
 * (07-10-2026) el vestido falla más en 24×24, y con 20 redes no salían 18 de
 * 2 000; con 30, 1 (eran 9 antes de #169). En 34×34 y 48×48, 0 con las dos.
 * Medido otra vez el 07-10-2026 con el veto de bajo las diagonales (#166 H10):
 * 2 de 2 000 en 24×24 (la 395 y la 1 062; sin el veto, 0), 0 de 2 000 en
 * 34×34, que es el lado del juego, y 0 de 200 en 48×48.
 *
 * La red de cada intento la lee `estructura` y la valida `problemasDeRed`, las
 * mismas que leen y validan cualquier plan: el generador no lleva una segunda
 * implementación de qué es una región. Y los **dos caminos disjuntos** de cada
 * base a sus ciudades cercanas —lo de «aislar es posible pero no trivial»— no
 * se comprueban aquí: había un bucle que lo hacía y en 1 050 planes no rechazó
 * ninguno, porque el dual de Voronoi ya lo da. Lo vigila, y muerde, la
 * auditoría de `test/regiones.test.ts`. El plan que sale pasa además entero por
 * `validateMapPlan` (`validadoPorLaPuerta`): el procedimental no entrega nada
 * que la puerta del agente rechace.
 */
export function generateMapPlan(rng: Rng, opts: ProceduralOptions = {}): PlanConTramos {
  if (
    opts.regionesPorBando !== undefined &&
    (opts.width !== undefined || opts.height !== undefined)
  ) {
    throw new Error(
      `al generador se le pide el mapa por regiones (${opts.regionesPorBando} por bando) o por lado (${opts.width ?? '?'}×${opts.height ?? '?'}), no por las dos cosas: el lado sale de las regiones`,
    );
  }
  const porRegiones =
    opts.regionesPorBando === undefined ? LADO_DEL_MAPA : ladoDelMapa(opts.regionesPorBando);
  const width = opts.width ?? porRegiones;
  const height = opts.height ?? porRegiones;
  const sabe = (lado: number): boolean =>
    lado >= LADO_MINIMO_DEL_GENERADOR && lado <= LADO_MAXIMO_DEL_GENERADOR;
  // Antes de gastar un solo intento: fuera de su rango el generador se agotaba
  // tras 300 vestidos (o no acababa) y lo decía en términos de redes, como si
  // fuera mala suerte de la semilla.
  if (!sabe(width) || !sabe(height)) {
    throw new Error(
      `el generador procedimental no hace mapas de ${width}×${height}: cada lado va de ${LADO_MINIMO_DEL_GENERADOR} a ${LADO_MAXIMO_DEL_GENERADOR} (un plan escrito a mano puede ir de ${LADO_MINIMO_DEL_PLAN} a ${LADO_MAXIMO_DEL_PLAN})`,
    );
  }
  return trazarYVestir(rng, width, height, opts);
}

/**
 * Los intentos de `generateMapPlan`, sin mirar si el lado está en su rango. Se
 * exporta solo para el test del mensaje de agotamiento: dentro del rango no se
 * agota con ninguna semilla medida, así que la única forma de verlo es pedirle
 * lo que no sabe hacer.
 */
export function trazarYVestir(
  rng: Rng,
  width: number,
  height: number,
  opts: ProceduralOptions = {},
): PlanConTramos {
  let redesMalas = 0;
  const fallos: Record<FaseDelVestido, { veces: number; ultimo: string }> = {
    fronteras: { veces: 0, ultimo: '' },
    objetos: { veces: 0, ultimo: '' },
    obstáculos: { veces: 0, ultimo: '' },
  };
  // Primero con la puerta de cada pueblo guardada de obstáculos;
  // si con eso no sale, otra tanda sin guardarla (`vestirRed`). Solo la usan
  // las semillas que con la primera se quedaban sin mapa (24×24: s150 y s171
  // de 1-200, #188), así que las que salían no cambian.
  // La forma del río, una vez por mapa: así salen con los pesos de
  // `data/rios.json`. Sorteada en cada red, ganaba la que menos falla al
  // trazarse (la frontera, 24 de 40 mapas en vez de 13). Si con ella no sale
  // mapa, las demás, en su orden: en un 24×24 la esquina no deja a veces dos
  // ciudades neutrales en ninguna red (8 de 41 semillas de 1-120), y un mapa
  // con otro río es mejor que ninguno.
  const sorteada = sortearForma(rng);
  for (const forma of [sorteada, ...FORMAS_DEL_RIO.filter((f) => f !== sorteada)]) {
    for (const guardarPuertas of [true, false]) {
      for (let intento = 0; intento < INTENTOS_DE_RED; intento++) {
        const red = intentarRed(rng, width, height, forma);
        if (red === null) {
          redesMalas++;
          continue;
        }
        for (let vestido = 0; vestido < INTENTOS_DE_VESTIDO; vestido++) {
          const plan = vestirRed(rng, red, opts, guardarPuertas);
          if (!('fase' in plan)) {
            opts.alTrazarElRio?.(red.rio);
            return validadoPorLaPuerta(plan);
          }
          fallos[plan.fase].veces++;
          fallos[plan.fase].ultimo = plan.motivo;
          opts.alTirarUnVestido?.(plan.fase, plan.motivo);
        }
      }
    }
  }
  const vestidos = FASES_DEL_VESTIDO.filter((fase) => fallos[fase].veces > 0).map(
    (fase) => `${fallos[fase].veces} en ${fase} (la última: ${fallos[fase].ultimo})`,
  );
  throw new Error(
    `no sale un mapa de nodos de ${width}×${height} en ${INTENTOS_DE_RED} redes, dos veces, con cada forma de río (${FORMAS_DEL_RIO.join(', ')}): ` +
      `${redesMalas} no salieron equilibradas` +
      (vestidos.length > 0
        ? `, y las otras no se dejaron vestir en ${INTENTOS_DE_VESTIDO} intentos cada una: ${vestidos.join('; ')}`
        : ''),
  );
}

/**
 * El plan del generador pasa por la misma puerta que el del agente
 * (`validateMapPlan`) antes de entregarse. Lo que rechace es un fallo del
 * generador, no un mapa raro que se arregle con otro intento, y por eso lanza en
 * vez de reintentar: un reintento callado taparía el fallo y cambiaría la
 * partida de esa semilla sin que nadie lo viera. Sin esta puerta, 24×24 sembraba
 * un asaltante en una región con dueño (#178) y solo lo veía quien validase el
 * plan a mano. Cuesta ~1 ms por plan, frente a 11-16 de generarlo.
 */
function validadoPorLaPuerta(plan: PlanConTramos): PlanConTramos {
  const problemas = validateMapPlan(plan);
  if (problemas.length > 0) {
    throw new Error(
      `el generador ha hecho un plan de ${plan.width}×${plan.height} que validateMapPlan rechaza, y eso es un fallo del generador: ${problemas.join('; ')}`,
    );
  }
  return plan;
}

/** Distancia mínima (Chebyshev) entre dos semillas: por debajo, las regiones salen raquíticas. */
const SEPARACION_DE_SEMILLAS = 6;

/**
 * La ondulación de las fronteras (#229): cada casilla se mide a las semillas
 * desde un punto movido por un ruido, no desde su centro. Sin ella, la frontera
 * entre dos regiones es el bisector de sus semillas, una recta, y crece con el
 * mapa: en el 42×42 de #226, 75 tramos de barrera ≥ 10, 10 filas de caras ≥ 10
 * y 8 mapas con un tramo ≥ 12 en 1-1000, el último justo en el techo de
 * `tools/qa/rectitud.ts`.
 *
 * El ruido es de valores en una rejilla de `paso` casillas, interpolado en
 * bilineal, con valores enteros en `[-amplitud, amplitud]` dieciseisavos de
 * casilla: todo en enteros, sin coma flotante. **Fino y no suave**: el tramo
 * recto lo hace sobre todo el engorde, que reparte un muro recto entre sus dos
 * lados a trechos de `TRECHO_DEL_LADO` y absorbe un vaivén de una casilla cada
 * seis; el muro tiene que quebrarse cada dos o tres. Medido en 1-1000
 * (09-10-2026), tramos ≥ 10 / caras ≥ 10 / mapas con tramo ≥ 12: sin
 * ondulación 75 / 10 / 8; paso 6 y amplitud 40, 83 / 7 / 9 (peor: una onda
 * larga deja tramos llanos en sus crestas); **paso 2 y 24, con `sinPuas`, 64 /
 * 5 / 2** (con otras corrientes de ruido, 57-68 / 3-5 / 3-7: las cifras bailan
 * con el azar). Más amplitud quiebra más (28: 35-55 / 4-6 / 1-4) pero tira más
 * vestidos —de 3,6 por mapa sin ondulación a 6,7 con 24 y ~9 con 28— y los
 * tira más con un llano junto a una meseta: con 28 la ciénaga, siempre abajo,
 * bajaba del 13 al 11 % de las regiones (`desniveles.test.ts`); con 32, 11 de
 * 200 semillas de 64×64 sin mapa.
 */
export const ONDULACION = { paso: 2, amplitud: 24 } as const;
/** Dieciseisavos: la unidad de `ONDULACION.amplitud`. */
const PARTES_DE_CASILLA = 16;

/**
 * Las púas de una casilla de la ondulación, fuera (paso 2b de `intentarRed`).
 * Una pasada, sobre una copia. Lo marcado en `fuera` (el río) ni cambia ni
 * cuenta como vecina: no es de ninguna región.
 */
export function sinPuas(etiqueta: Int32Array, W: number, H: number, fuera?: Uint8Array): void {
  const antes = Int32Array.from(etiqueta);
  const cuenta = new Map<number, number>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (fuera?.[i] === 1) continue;
      const propia = antes[i] as number;
      cuenta.clear();
      let iguales = 0;
      let vecinas = 0;
      for (const [dx, dy] of VECINAS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || fuera?.[ny * W + nx] === 1) continue;
        const e = antes[ny * W + nx] as number;
        vecinas++;
        if (e === propia) iguales++;
        cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
      }
      // Dos de ocho: en el borde del mapa, la misma proporción de las que tiene.
      if (iguales * 4 > vecinas) continue;
      let mejor = propia;
      let veces = -1;
      for (const [e, n] of cuenta)
        if (n > veces || (n === veces && e < mejor)) [mejor, veces] = [e, n];
      etiqueta[i] = mejor;
    }
  }
}

/** Cuántas vueltas se dan a los trozos sueltos de una celda (`trozosSueltosALaVecina`). */
const VUELTAS_DE_TROZOS_SUELTOS = 4;

/**
 * Lo que el río deja suelto de una celda: con el reparto por orilla, la celda
 * de una semilla puede quedar en dos trozos (el río la corta sin separar su
 * orilla), y el que no tiene la semilla sería una casilla abierta sin región.
 * Cada casilla de un trozo así pasa a la etiqueta que más se repite entre sus
 * vecinas unidas ya a su semilla; por vueltas, del borde del trozo hacia
 * dentro. Lo que quede suelto lo rechaza la red (`estructura`).
 */
function trozosSueltosALaVecina(
  etiqueta: Int32Array,
  W: number,
  H: number,
  rio: Uint8Array,
  semillas: readonly Point[],
): void {
  const N = W * H;
  const { desde, vecinas } = vecindad(W, H);
  for (let vuelta = 0; vuelta < VUELTAS_DE_TROZOS_SUELTOS; vuelta++) {
    const conSemilla = new Uint8Array(N);
    for (const [k, s] of semillas.entries()) {
      const origen = s.y * W + s.x;
      if (rio[origen] === 1 || etiqueta[origen] !== k) continue;
      conSemilla[origen] = 1;
      const cola = [origen];
      for (let q = 0; q < cola.length; q++) {
        const a = cola[q] as number;
        for (let v = desde[a]!; v < desde[a + 1]!; v++) {
          const j = vecinas[v]!;
          if (conSemilla[j] === 1 || rio[j] === 1 || etiqueta[j] !== k) continue;
          conSemilla[j] = 1;
          cola.push(j);
        }
      }
    }
    const cambios: [number, number][] = [];
    const cuenta = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      if (rio[i] === 1 || conSemilla[i] === 1) continue;
      cuenta.clear();
      for (let v = desde[i]!; v < desde[i + 1]!; v++) {
        const j = vecinas[v]!;
        if (conSemilla[j] === 1)
          cuenta.set(etiqueta[j] as number, (cuenta.get(etiqueta[j] as number) ?? 0) + 1);
      }
      let mejor = -1;
      let veces = 0;
      for (const [e, n] of cuenta)
        if (n > veces || (n === veces && e < mejor)) [mejor, veces] = [e, n];
      if (mejor !== -1) cambios.push([i, mejor]);
    }
    if (cambios.length === 0) return;
    for (const [i, e] of cambios) etiqueta[i] = e;
  }
}

/**
 * La etiqueta de cada casilla del río: la mayor de las de lo que toca de sus
 * orillas, y por dentro de un lago, la de la casilla del río más cercana que ya
 * la tenga. El río no es de ninguna región; esto solo da a cada casilla de muro
 * una celda, como las demás.
 */
function etiquetaDelRio(etiqueta: Int32Array, W: number, H: number, rio: Uint8Array): void {
  const N = W * H;
  const { desde, vecinas } = vecindad(W, H);
  const hecha = new Uint8Array(N);
  const cola: number[] = [];
  for (let i = 0; i < N; i++) {
    if (rio[i] === 0) continue;
    let mayor = -1;
    for (let v = desde[i]!; v < desde[i + 1]!; v++) {
      const j = vecinas[v]!;
      if (rio[j] === 0) mayor = Math.max(mayor, etiqueta[j] as number);
    }
    if (mayor === -1) continue;
    etiqueta[i] = mayor;
    hecha[i] = 1;
    cola.push(i);
  }
  for (let q = 0; q < cola.length; q++) {
    const a = cola[q] as number;
    for (let v = desde[a]!; v < desde[a + 1]!; v++) {
      const j = vecinas[v]!;
      if (rio[j] === 0 || hecha[j] === 1) continue;
      etiqueta[j] = etiqueta[a] as number;
      hecha[j] = 1;
      cola.push(j);
    }
  }
}

/**
 * El desplazamiento de cada casilla (`ONDULACION`), en unidades de
 * `1 / (PARTES_DE_CASILLA · paso²)` de casilla: `dx` y `dy` por índice.
 *
 * **Antisimétrico en el espejo** de las semillas: el de `p` es `n(p) − n(p′)`,
 * con `p′` su reflejo, así que el de `p′` es el contrario y el punto movido de
 * `p′` es el reflejo del de `p`. Las semillas van en espejo y, así, también las
 * celdas (salvo los empates): el ruido no le da a un bando regiones más grandes.
 */
export function ondulacion(rng: Rng, W: number, H: number): { dx: Int32Array; dy: Int32Array } {
  const { paso, amplitud } = ONDULACION;
  const nx = Math.floor((W - 1) / paso) + 2;
  const ny = Math.floor((H - 1) / paso) + 2;
  const valores = (): Int32Array => {
    const v = new Int32Array(nx * ny);
    for (let i = 0; i < v.length; i++) v[i] = rng.int(-amplitud, amplitud);
    return v;
  };
  const vx = valores();
  const vy = valores();
  const ruido = (v: Int32Array, x: number, y: number): number => {
    const gx = Math.floor(x / paso);
    const gy = Math.floor(y / paso);
    const fx = x - gx * paso;
    const fy = y - gy * paso;
    const en = (i: number, j: number): number => v[j * nx + i] as number;
    return (
      en(gx, gy) * (paso - fx) * (paso - fy) +
      en(gx + 1, gy) * fx * (paso - fy) +
      en(gx, gy + 1) * (paso - fx) * fy +
      en(gx + 1, gy + 1) * fx * fy
    );
  };
  const dx = new Int32Array(W * H);
  const dy = new Int32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const mx = W - 1 - x;
      const my = H - 1 - y;
      dx[i] = ruido(vx, x, y) - ruido(vx, mx, my);
      dy[i] = ruido(vy, x, y) - ruido(vy, mx, my);
    }
  }
  return { dx, dy };
}
/** Un intento de red fina: la red si sale válida y equilibrada, `null` si no. */
function intentarRed(rng: Rng, W: number, H: number, forma: FormaDelRio): RedFina | null {
  const espejo = (p: Point): Point => ({ x: W - 1 - p.x, y: H - 1 - p.y });
  const punto = (i: number): Point => aPunto(i, W);

  // 1. Semillas: las dos de casa en las esquinas y el resto por parejas en espejo.
  //    Las semillas 2k y 2k+1 son siempre espejo la una de la otra.
  const semillas: Point[] = [
    { x: 3, y: 3 },
    { x: W - 4, y: H - 4 },
  ];
  const pares = regionesDelMapa(W, H) - 1;
  for (let guarda = 0; semillas.length < 2 + pares * 2 && guarda < 1000; guarda++) {
    const p = { x: rng.int(1, W - 2), y: rng.int(1, H - 2) };
    const m = espejo(p);
    if (chebyshev(p, m) < SEPARACION_DE_SEMILLAS) continue;
    if (
      semillas.some(
        (s) => chebyshev(s, p) < SEPARACION_DE_SEMILLAS || chebyshev(s, m) < SEPARACION_DE_SEMILLAS,
      )
    )
      continue;
    semillas.push(p, m);
  }
  // Dentro del rango del generador siempre caben todas (medido, 08-10-2026: 0
  // redes cortas en 3-15 regiones, #195); lo vigila `regiones-del-mapa.test.ts`
  // contando las regiones del plan. Fuera de él (el 12×12 del mensaje de
  // agotamiento) salen las que quepan.

  // 1b. El río (#144, río continuo; `rio.ts`), antes que las regiones: una
  //     línea de agua de una casilla entre las semillas, y las regiones se
  //     reparten por orilla. Así nada lo parte, y donde toca tres regiones es
  //     porque una frontera llega a él, no porque lo crucen.
  const rio = trazarRio(rng, W, H, semillas, forma);
  if (rio === null) return null;
  const { mascara } = rio;
  const banco = orillas(W, H, mascara);

  // 2. Cada casilla, de la semilla más cercana a su punto movido por la
  //    ondulación (empate: la de índice menor) **que ve sin cruzar el río**: la
  //    recta de la casilla a la semilla no pisa el río. Si no ve ninguna, la más
  //    cercana de su orilla. Con solo la orilla, el río que nace en un lago
  //    (que no parte el mapa) corría por dentro de una región, y río y lago
  //    eran un obstáculo suyo del 21 % (s31). En enteros, a escala `u`.
  const etiqueta = new Int32Array(W * H);
  // Con su propia corriente, sacada de las semillas: no gasta tiradas de `rng`,
  // así que una semilla de partida conserva su reparto (las mismas semillas de
  // región) y solo se le ondulan las fronteras.
  const onda = ondulacion(createRng(huellaDeSemillas(semillas)), W, H);
  const u = PARTES_DE_CASILLA * ONDULACION.paso * ONDULACION.paso;
  const bancoDeSemilla = semillas.map((s) => banco[s.y * W + s.x] as number);
  /** Si la recta (Bresenham, 8-conexa) de (x, y) a la semilla `s` no pisa el río: uno 4-conexo no se cruza sin pisarlo. */
  const ve = (x: number, y: number, s: Point): boolean => {
    const dx = Math.abs(s.x - x);
    const dy = -Math.abs(s.y - y);
    const sx = x < s.x ? 1 : -1;
    const sy = y < s.y ? 1 : -1;
    let err = dx + dy;
    let cx = x;
    let cy = y;
    for (;;) {
      if (mascara[cy * W + cx] === 1) return false;
      if (cx === s.x && cy === s.y) return true;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        cx += sx;
      }
      if (e2 <= dx) {
        err += dx;
        cy += sy;
      }
    }
  };
  const porDistancia: { k: number; d: number }[] = semillas.map((_, k) => ({ k, d: 0 }));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mascara[i] === 1) continue;
      const px = x * u + (onda.dx[i] as number);
      const py = y * u + (onda.dy[i] as number);
      for (const c of porDistancia) {
        const s = semillas[c.k] as Point;
        c.d = (s.x * u - px) * (s.x * u - px) + (s.y * u - py) * (s.y * u - py);
      }
      porDistancia.sort((a, b) => a.d - b.d || a.k - b.k);
      const deSuOrilla = porDistancia.filter((c) => bancoDeSemilla[c.k] === banco[i]);
      // Una orilla sin semilla sería tierra de nadie.
      if (deSuOrilla.length === 0) return null;
      const vista = deSuOrilla.find((c) => ve(x, y, semillas[c.k] as Point));
      etiqueta[i] = (vista ?? deSuOrilla[0])!.k;
    }
  }

  // 2b. Sin púas: la casilla que solo comparte etiqueta con dos vecinas o menos
  //     de sus ocho (un cuarto de las que tenga) toma la que más se repite alrededor (empate: la menor). La
  //     ondulación es fina y deja dedos de una casilla que el engorde parte. El
  //     río no cuenta: no es de nadie, y del otro lado es otra orilla.
  sinPuas(etiqueta, W, H, mascara);
  // 2c. Lo que el río deja suelto de una celda (un trozo de su orilla sin su
  //     semilla), a la vecina con la que más se toca de las que llegan a la suya.
  trozosSueltosALaVecina(etiqueta, W, H, mascara, semillas);
  // 2d. La etiqueta de cada casilla del río: la mayor de las de su orilla que
  //     toca (y por dentro de un lago, la de la que tenga más cerca). No es de
  //     ninguna región; la leen quienes miran el muro fino por su celda.
  etiquetaDelRio(etiqueta, W, H, mascara);

  // 3. Muro: el río, y la casilla con alguna vecina de etiqueta menor de su
  //    orilla. Así dos casillas abiertas de regiones distintas no pueden ser
  //    vecinas —la de etiqueta mayor sería muro, o las separa el río, que es
  //    4-conexo—, que es justo lo que hace falta en 8-vecindad.
  const muro = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (mascara[i] === 1) {
      muro[i] = 1;
      continue;
    }
    const { x, y } = punto(i);
    for (const [dx, dy] of VECINAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (mascara[j] === 0 && (etiqueta[j] as number) < (etiqueta[i] as number)) {
        muro[i] = 1;
        break;
      }
    }
  }
  // Con la ondulación, la casilla de una semilla puede caer en la celda de otra
  // (su punto movido queda más cerca de la vecina): dos semillas en una región.
  for (const [k, s] of semillas.entries()) {
    if (muro[s.y * W + s.x] === 1 || etiqueta[s.y * W + s.x] !== k) return null;
  }

  // 4. El mapa provisional, todavía sin nodos, y su red: la lee `estructura`,
  //    la misma que leerá la partida, y no una copia del generador. Una
  //    etiqueta partida en dos trozos deja uno sin semilla, que sale de la red
  //    como casilla abierta sin región.
  //    La red fina aún no tiene relieve: el nivel lo sortea `vestirRed` con los
  //    suelos, y hasta entonces van todas al llano. `estructura` no lo lee.
  const regions = semillas.map((s, k) => ({
    id: `region-${k}`,
    name: nombreDeRegion(k),
    at: s,
    nivel: 1 as const,
  }));
  const sinNodos: GameMap = { ...createEmptyMap(W, H, 'grass'), regions };
  for (let i = 0; i < W * H; i++)
    if (muro[i] === 1) sinNodos.terrain[i] = mascara[i] === 1 ? 'water' : 'mountain';
  const regionDe = estructura(sinNodos).regionDe;
  for (let i = 0; i < W * H; i++) if (muro[i] === 0 && regionDe[i] === -1) return null;
  if (hayRegionRaquitica(regionDe, semillas.length)) return null;

  // 5. Candidatas a nodo: casillas de muro que tocan dos regiones abiertas.
  //    En el río, solo donde va recto (agua delante y detrás, tierra a los
  //    lados): un **puente**, con una región distinta a cada lado, o una
  //    **ciudad-puente**, donde toca tres (la frontera de su orilla llega a él).
  //    En un codo el río no se cruza: sus dos orillas no se miran.
  //    El cruce de tres regiones en tierra no lleva nada (ciudades en su
  //    región, fase 2, 05-11-2026): ahí iba una ciudad, y las ciudades que no
  //    son bases ni del río van ahora en mitad de su región (`vestirRed`). Sus
  //    tres regiones se unen por los pasos de cada pareja, que ya no se saltan
  //    junto a ella.
  const cruces: number[] = [];
  const porPareja = new Map<string, number[]>();
  const delRio = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && mascara[y * W + x] === 1;
  const deTravesDelRio = (i: number): [number, number] | null => {
    const { x, y } = punto(i);
    const ns = delRio(x, y - 1) && delRio(x, y + 1) && !delRio(x - 1, y) && !delRio(x + 1, y);
    const eo = delRio(x - 1, y) && delRio(x + 1, y) && !delRio(x, y - 1) && !delRio(x, y + 1);
    if (!ns && !eo) return null;
    const [a, b] = ns ? [i - 1, i + 1] : [i - W, i + W];
    if (a < 0 || b >= W * H) return null;
    return [regionDe[a] as number, regionDe[b] as number];
  };
  for (let i = 0; i < W * H; i++) {
    if (muro[i] === 0) continue;
    const r = regionesQueToca(W, H, regionDe, punto(i));
    let clave = r.length === 2 ? `${r[0]}-${r[1]}` : null;
    if (mascara[i] === 1) {
      const lados = deTravesDelRio(i);
      if (lados === null) continue;
      if (r.length >= 3) {
        cruces.push(i);
        continue;
      }
      const [a, b] = lados;
      if (a < 0 || b < 0 || a === b) continue;
      clave = `${Math.min(a, b)}-${Math.max(a, b)}`;
    }
    if (clave !== null) {
      const lista = porPareja.get(clave) ?? [];
      lista.push(i);
      porPareja.set(clave, lista);
    }
  }
  const nodos: number[] = [];
  const cerca = (i: number, d: number): boolean =>
    nodos.some((n) => chebyshev(punto(n), punto(i)) <= d);
  // Las ciudades-puente, en los cruces del río y separadas: dos casillas de un
  // mismo cruce son la misma ciudad. Van primero, así que sus índices de nodo
  // son 0..n−1 y en el orden de sus casillas.
  for (const c of cruces) {
    if (cerca(c, 2)) continue;
    nodos.push(c);
  }
  const ciudades = nodos.length;
  // Un paso por pareja de regiones vecinas, en el medio de su frontera, salvo
  // que caiga a dos casillas o menos de otro nodo, igual que las ciudades. Dos
  // nodos vecinos no valen (`problemasDeRed`), y a dos casillas comparten
  // vecinas: el camino que llega a uno quedaría unido, en el dibujo, al otro.
  // La regla es del generador y no de `problemasDeRed`: los caminos del agente
  // los escribe él, y un plan con dos nodos a dos casillas es jugable.
  //
  // Del medio, el más cercano que tenga **eje pleno** (`conEjePleno`, dos
  // casillas de su región a cada lado) y no caiga junto a otro nodo: el medio a
  // secas caía a veces en un escalón del muro, sin dos vecinas opuestas, y el
  // vestido lo dejaba en esquina (119 de 12 309 nodos en 1-1000; así, 17 de 12 342).
  // Qué parejas llevan paso no cambia: si el medio cae junto a otro nodo, la
  // pareja se queda sin él, como antes. Buscar un paso lejos de ese nodo daba
  // ~1,4 pasos más por mapa (12 309 → 13 683 en 1-1000), y la densidad de
  // pasos no es cosa de #169 (decisión del coordinador). Si ninguno tiene eje,
  // el medio.
  //
  // En el río, el puente cruza de frente (`deFrente`): dos casillas de su
  // región a cada lado, en la recta que atraviesa el río, y si no hay ninguna
  // así, la pareja va sin puente. Con el eje pleno a secas valía una diagonal,
  // y el engorde de la frontera de una orilla se comía la entrada de enfrente
  // (s10 (27,11)).
  const libreEn = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < W && y < H && muro[y * W + x] === 0
      ? (etiqueta[y * W + x] as number)
      : -1;
  const deFrente = (c: number): boolean => {
    const { x, y } = punto(c);
    const [dx, dy] = delRio(x - 1, y) ? [0, 1] : [1, 0];
    const a = libreEn(x - dx, y - dy);
    const b = libreEn(x + dx, y + dy);
    return (
      a >= 0 &&
      b >= 0 &&
      a !== b &&
      libreEn(x - 2 * dx, y - 2 * dy) === a &&
      libreEn(x + 2 * dx, y + 2 * dy) === b
    );
  };
  for (const lista of porPareja.values()) {
    const medio = Math.floor(lista.length / 2);
    if (cerca(lista[medio] as number, 2)) continue;
    const elige = (vale: (c: number) => boolean): number => {
      let elegido = -1;
      for (const [k, c] of lista.entries()) {
        if (elegido !== -1 && Math.abs(k - medio) >= Math.abs(elegido - medio)) continue;
        if (cerca(c, 2) || !vale(c)) continue;
        elegido = k;
      }
      return elegido;
    };
    // Sobre el río, de frente o nada: la pareja se queda sin puente, como la
    // que tiene el medio junto a otro nodo.
    if (mascara[lista[0] as number] === 1) {
      const elegido = elige(deFrente);
      if (elegido !== -1) nodos.push(lista[elegido] as number);
      continue;
    }
    const elegido = elige((c) => conEjePleno(W, H, c, etiqueta, muro));
    const n = lista[elegido === -1 ? medio : elegido] as number;
    if (cerca(n, 2)) continue;
    nodos.push(n);
  }

  // 6. La red con sus nodos se valida con la misma comprobación que cualquier
  //    plan (`problemasDeRed`): región sin nodo, región inalcanzable. Lo que
  //    devuelve `estructura` usa como índice de nodo el de `nodos`.
  const conNodos: GameMap = {
    ...sinNodos,
    // El muro fino es todo de montaña: es lo que cruza cada nodo hasta que el
    // vestido le da a la frontera su barrera (`barreraDeNodo`).
    objects: nodos.map((n, k) => ({
      kind: 'node',
      id: `n${k}`,
      at: punto(n),
      owner: null,
      barrera: mascara[n] === 1 ? 'water' : 'mountain',
      mejora: 'ninguna',
    })),
  };
  if (problemasDeRed(conNodos).length > 0) return null;
  const red = estructura(conNodos);

  // Las bases: el nodo de la región de casa más cercano a su esquina.
  // Ni una en el río (#144, QA del río continuo, H2): la base sobre el río era
  // una ciudad-puente con su casa a los dos lados, pintada en la casilla donde
  // empieza su héroe (s7, s30), y pulsar al héroe lo metía en su castillo.
  const base = (casa: number, esquina: Point): number | null => {
    let mejor: number | null = null;
    let mejorD = -1;
    for (const n of red.regiones[casa]?.nodos ?? []) {
      const p = red.nodos[n]?.at as Point;
      if (mascara[p.y * W + p.x] === 1) continue;
      // Ni en el borde: su recinto (`recinto.ts`) no cabría.
      if (!cabeElRecinto(p, W, H)) continue;
      const d = (p.x - esquina.x) * (p.x - esquina.x) + (p.y - esquina.y) * (p.y - esquina.y);
      if (mejorD === -1 || d < mejorD) {
        mejorD = d;
        mejor = n;
      }
    }
    return mejor;
  };
  const b0 = base(0, { x: 2, y: 2 });
  const b1 = base(1, { x: W - 3, y: H - 3 });
  if (b0 === null || b1 === null || b0 === b1) return null;
  // Los cruces del río son las ciudades-puente, neutrales: los primeros nodos
  // (las bases no van en el río). Hubo un límite —solo las dos más cercanas a cada
  // base— puesto cuando la derrota la decidía otra regla; con «perder la base
  // elimina» se volvió a medir sin él (1 000 semillas, 01-10-2026) y sobraba. Las
  // demás ciudades neutrales van en mitad de su región y las pone el vestido
  // (`ciudadesDeRegion`); aquí solo se eligen sus regiones (paso 7).
  const neutrales = Array.from({ length: ciudades }, (_, k) => k);

  // 6b. El recinto de cada ciudad (`recinto.ts`): cabe en el mapa, no toca el
  //     de otra y no tiene un nodo dentro ni delante. Una red que no lo da se tira entera,
  //     sin pagar el vestido: quitar la ciudad de un cruce cambiaría la red, y
  //     el cruce sin ciudad no es un paso. La ciudad-puente lleva el suyo en su
  //     orilla (`centroDeLaCiudad`), a dos casillas del río, y es ahí donde un
  //     nodo podía quedar entre sus casas (s98, s105).
  const enCiudad = [b0, b1, ...neutrales];
  const centros = enCiudad.map((k) =>
    enSuOrilla(conNodos, red.nodos[k]?.at as Point, red.regionDe),
  );
  if (centros.some((c) => !cabeElRecinto(c, W, H))) return null;
  for (const [k, c] of centros.entries()) {
    if (centros.slice(k + 1).some((d) => chebyshev(c, d) < SEPARACION_DE_CIUDADES)) return null;
    // Ni a dos, en la entrada de un paso (`delanteDeNodo`): con los pasos que
    // ya no se saltan junto a una ciudad de cruce (ciudades en su región, fase
    // 2), el de una pareja caía a veces a dos de la orilla de una ciudad-puente
    // y el recinto le tapaba la entrada (s11 (24,14), s25 (36,14) y (5,27)).
    if (nodos.some((n) => chebyshev(punto(n), c) <= 2 && n !== nodos[enCiudad[k] as number]))
      return null;
  }

  // 7. Equilibrio por perfil (ciudades en su región, fase 2, 05-11-2026): las
  //    parejas de regiones de fuera que pueden llevar ciudad son las que cada
  //    base ve igual: la una a los mismos saltos de la suya que su espejo de la
  //    otra, y al revés (los saltos a una región, los de su nodo más cercano). Con las
  //    ciudades en los cruces se pedían las dos ciudades más cercanas de cada
  //    base a los mismos saltos; ahora la ciudad es de la región, y la región
  //    es lo que se mide. Si no hay las que pide `data/poblamiento.json`, la red
  //    no vale y se traza otra, sin pagar el vestido.
  const d0 = saltosDesde(red, b0);
  const d1 = saltosDesde(red, b1);
  // Y cada base llega a cada una por dos caminos: quitando cualquier otro nodo,
  // sigue llegando a la región (s146 de 1-200 tenía una región de fuera a la que
  // solo se llegaba por un nodo, y su ciudad caía con él). Los saltos sin un nodo
  // no dependen de la región: una vez por base y nodo.
  const sinElNodo = new Map<number, Map<number, number>>();
  const saltosSin = (b: number, n: number): Map<number, number> => {
    const clave = b * red.nodos.length + n;
    let d = sinElNodo.get(clave);
    if (d === undefined) {
      d = saltosDesde(red, b, n);
      sinElNodo.set(clave, d);
    }
    return d;
  };
  const porDosCaminos = (b: number, r: number): boolean =>
    red.nodos.every((_, n) => {
      if (n === b) return true;
      const d = saltosSin(b, n);
      return (red.regiones[r]?.nodos ?? []).some((m) => m !== n && d.has(m));
    });
  const conCiudadPosible = regionesDeFuera(semillas.length).filter(
    (k) =>
      saltosALaRegion(red, d0, k) === saltosALaRegion(red, d1, parejaDe(k)) &&
      saltosALaRegion(red, d0, parejaDe(k)) === saltosALaRegion(red, d1, k) &&
      [k, parejaDe(k)].every((r) => porDosCaminos(b0, r) && porDosCaminos(b1, r)),
  );
  if (conCiudadPosible.length < parejasConCiudad(semillas.length)) return null;

  // Qué nodo lleva camino entre cada pareja de vecinas: si no hay reparto, la
  // red no vale y se traza otra, sin pagar el vestido.
  const conCamino = crucesConCamino(red, [
    { nodo: b0, casa: 0 },
    { nodo: b1, casa: 1 },
    ...neutrales.map((nodo) => ({ nodo })),
  ]);
  if (conCamino === null) return null;
  return {
    W,
    H,
    semillas,
    etiqueta,
    muro,
    nodos,
    regions,
    conNodos,
    red,
    b0,
    b1,
    neutrales,
    d0,
    d1,
    conCiudadPosible,
    conCamino,
    rio,
    banco,
  };
}

/**
 * Qué nodos llevan camino desde cada región, por índice de nodo: **exactamente
 * un cruce con camino por pareja de regiones vecinas** (decisión del usuario,
 * variante B de #149). Un nodo es cruce de la pareja (a, b) si le llega camino
 * desde las dos; los demás nodos que comparten se cruzan igual, sin camino.
 *
 * Cada pareja prefiere una ciudad a un paso —una ciudad del muro (la base, o la
 * ciudad-puente, en un cruce del río) puede tocar tres regiones, y con camino
 * desde las tres es el cruce de tres parejas con tres radios— y,
 * entre iguales, el nodo más cerca (Chebyshev) de las semillas de las dos;
 * desempata el índice. Pero una ciudad con camino desde a, b y c ya es el cruce
 * de las tres parejas y ninguna puede tener otro, así que se reparte con vuelta
 * atrás: las parejas con menos nodos comunes primero y, en cada una, el primer
 * nodo que no le dé a otra pareja un segundo cruce.
 *
 * Las ciudades con `casa` (las bases) llevan camino desde ella; toda otra
 * ciudad que no sea cruce de nada lleva un radio desde su región más cercana,
 * que no la hace cruce de nada. `null` si no hay reparto: la red se descarta
 * antes de vestirla.
 */
export function crucesConCamino(
  red: Estructura,
  ciudades: readonly { readonly nodo: number; readonly casa?: number }[],
): number[][] | null {
  const cuesta = (n: number, regiones: readonly number[]): number =>
    regiones.reduce(
      (t, r) => t + chebyshev(red.nodos[n]?.at as Point, red.regiones[r]?.at as Point),
      0,
    );
  const pareja = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const esCiudad = new Set(ciudades.map((c) => c.nodo));

  /** Desde qué regiones llega el camino a cada nodo. */
  const llegaDesde = new Map<number, ReadonlySet<number>>();
  for (const { nodo, casa } of ciudades) {
    if (casa === undefined) continue;
    if (!(red.nodos[nodo]?.regiones ?? []).includes(casa)) {
      throw new Error(`la base del nodo ${nodo} no toca su región de casa, la ${casa}`);
    }
    llegaDesde.set(nodo, new Set([casa]));
  }
  /** Las parejas que ya tienen su cruce. */
  const servida = new Set<string>();
  /** Las parejas de las que `n` pasaría a ser cruce si le llegara camino desde `a` y `b`. */
  const parejasNuevas = (n: number, a: number, b: number): string[] => {
    const ya = llegaDesde.get(n) ?? new Set<number>();
    const desde = [...new Set([...ya, a, b])].sort((x, y) => x - y);
    const nuevas: string[] = [];
    for (const [i, x] of desde.entries()) {
      for (const y of desde.slice(i + 1)) if (!(ya.has(x) && ya.has(y))) nuevas.push(pareja(x, y));
    }
    return nuevas;
  };

  const comunes = new Map<string, { a: number; b: number; nodos: number[] }>();
  for (const [n, nodo] of red.nodos.entries()) {
    for (const [i, a] of nodo.regiones.entries()) {
      for (const b of nodo.regiones.slice(i + 1)) {
        const p = comunes.get(pareja(a, b)) ?? { a: Math.min(a, b), b: Math.max(a, b), nodos: [] };
        p.nodos.push(n);
        comunes.set(pareja(a, b), p);
      }
    }
  }
  const parejas = [...comunes.values()];
  for (const p of parejas) {
    p.nodos.sort(
      (x, y) =>
        Number(esCiudad.has(y)) - Number(esCiudad.has(x)) ||
        cuesta(x, [p.a, p.b]) - cuesta(y, [p.a, p.b]) ||
        x - y,
    );
  }
  parejas.sort((p, q) => p.nodos.length - q.nodos.length || p.a - q.a || p.b - q.b);

  const repartir = (k: number): boolean => {
    const p = parejas[k];
    if (p === undefined) return true;
    if (servida.has(pareja(p.a, p.b))) return repartir(k + 1);
    for (const n of p.nodos) {
      const nuevas = parejasNuevas(n, p.a, p.b);
      if (nuevas.some((q) => servida.has(q))) continue;
      const antes = llegaDesde.get(n);
      llegaDesde.set(n, new Set([...(antes ?? []), p.a, p.b]));
      for (const q of nuevas) servida.add(q);
      if (repartir(k + 1)) return true;
      for (const q of nuevas) servida.delete(q);
      if (antes === undefined) llegaDesde.delete(n);
      else llegaDesde.set(n, antes);
    }
    return false;
  };
  if (!repartir(0)) return null;

  for (const { nodo } of ciudades) {
    if (llegaDesde.has(nodo)) continue;
    const regiones = red.nodos[nodo]?.regiones ?? [];
    const mejor = [...regiones].sort((x, y) => cuesta(nodo, [x]) - cuesta(nodo, [y]) || x - y)[0];
    if (mejor === undefined) throw new Error(`la ciudad del nodo ${nodo} no toca ninguna región`);
    llegaDesde.set(nodo, new Set([mejor]));
  }
  const lleva: number[][] = red.regiones.map(() => []);
  for (const [n, desde] of [...llegaDesde].sort((x, y) => x[0] - y[0])) {
    for (const r of desde) lleva[r]?.push(n);
  }
  return lleva;
}

/** Saltos de nodo a nodo pasando por regiones, desde `desde`; sin cruzar el nodo `sin`, si se da. */
function saltosDesde(red: Estructura, desde: number, sin = -1): Map<number, number> {
  const dist = new Map<number, number>([[desde, 0]]);
  const cola = [desde];
  const regionVista = new Set<number>();
  for (let q = 0; q < cola.length; q++) {
    const n = cola[q] as number;
    for (const r of red.nodos[n]?.regiones ?? []) {
      if (regionVista.has(r)) continue;
      regionVista.add(r);
      for (const m of red.regiones[r]?.nodos ?? []) {
        if (m === sin || dist.has(m)) continue;
        dist.set(m, (dist.get(n) as number) + 1);
        cola.push(m);
      }
    }
  }
  return dist;
}
