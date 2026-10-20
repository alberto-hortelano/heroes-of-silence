/**
 * La labranza en campos (2026-10-20): la cubierta del suelo `dirt` del mapa.
 *
 * Antes cada punto del esparcido sacaba al azar uno de los 16 módulos de
 * `cubierta-dirt` —trigo, coles, surcos, cerca, almiar, carreta, piedras y
 * matas— y un cuarto salía de la pradera: parcelas sueltas de cultivos
 * distintos con carretas y almiares mezclados, un confeti en el que minas,
 * recursos y figuras se perdían (diagnóstico en la semilla 15,
 * `docs/agents/2026-10-20-labranza-en-campos/`). Ahora la labranza son CAMPOS:
 *
 * - las casillas se agrupan en campos de unas 3-6 casillas (un Voronoi sobre
 *   una rejilla de `PASO_DEL_CAMPO` con su punto movido al azar; un camino
 *   parte el campo, que es lo conexo de cada celda);
 * - cada campo es de un cultivo (`PARCELAS`) o queda en barbecho
 *   (`PARTE_EN_BARBECHO`, y los de una o dos casillas), con una parcela por
 *   casilla, centrada y sin el corrimiento del esparcido: las vecinas de un
 *   campo forman una manta; en la linde, más pequeña y corrida hacia dentro,
 *   para que entre dos campos se vea la tierra;
 * - cerca, almiar y carreta (`ATREZO`) dejan de salir al azar: pocos y donde
 *   tienen sentido;
 * - y unas pocas casas sueltas, recortadas de los pueblos
 *   (`tools/taller/casas.ts`), metidas en la labranza junto a un campo: lejos
 *   de los caminos, de los pueblos y de los objetos, y nunca dos a la vista.
 *
 * Una parcela que no entra en la escena (`escalaQueEntra`) saca su casilla de
 * los campos, que se reparten otra vez; una casa o un atrezo que no entra
 * (`entraLaPieza`) va al siguiente sitio.
 *
 * Es puro y determinista, con su propia corriente de azar: la regla no sabe de
 * sprites ni de la escena; `componer` la pone con `poner`, que guarda el
 * pasillo de la senda y las reservas de los objetos.
 */
import type { MapObject, RedDeCaminos } from '@core/map/map.js';
import { VECINAS } from '@core/map/regiones.js';
import { azarDe, barajar } from './esparcir.js';

/** Los cultivos, por la hoja `cubierta-dirt`. */
export type Cultivo = 'trigo' | 'coles' | 'surcos';

/**
 * Los módulos de `cubierta-dirt` de cada cultivo, mirados uno a uno el
 * 20-10-2026 (`modulos-dirt.png` de la tarea): 1-4 trigo (el 3 con gavillas),
 * 5-6 coles, 7-8 surcos de tierra. Un arte nuevo de la hoja hay que volver a
 * mirarlo: `test/pisable-junto-al-bosque.test.ts` guarda su huella.
 */
export const PARCELAS: Readonly<Record<Cultivo, readonly string[]>> = {
  trigo: ['1', '2', '3', '4'],
  coles: ['5', '6'],
  surcos: ['7', '8'],
};

/** El atrezo de la labranza, por su módulo de `cubierta-dirt`. El resto (12-16), piedras y matas. */
export const ATREZO = { cerca: '9', almiar: '10', carreta: '11' } as const;
export type Atrezo = keyof typeof ATREZO;

/**
 * Los módulos de `cubierta-dirt` que no salen al azar del esparcido ni como
 * reserva estrecha de otro: las parcelas y el atrezo, que pone esta regla por
 * su nombre. El almiar era el módulo más estrecho de la hoja, y por eso salía
 * junto a todas las sendas, donde no cabía otro.
 */
export const MODULOS_DE_LA_LABRANZA: ReadonlySet<string> = new Set([
  ...Object.values(PARCELAS).flat(),
  ...Object.values(ATREZO),
]);

/** El lado de la rejilla de los campos, en casillas: un campo mide de media su cuadrado. */
const PASO_DEL_CAMPO = 2;

/** Lo más grande que sale un campo, en casillas: el trozo de más se queda en barbecho. */
export const CAMPO_MAS_GRANDE = 7;

/** Un campo de este tamaño o menos queda en barbecho: una parcela sola es confeti. */
const CAMPO_EN_BARBECHO = 2;

/** De los campos que podrían cultivarse, los que quedan en barbecho. */
const PARTE_EN_BARBECHO = 0.4;

/** Cuánto pesa cada cultivo al sortear el de un campo. */
const PESO_DEL_CULTIVO: Readonly<Record<Cultivo, number>> = {
  trigo: 0.5,
  coles: 0.25,
  surcos: 0.25,
};

/** Los cultivos, en el orden en que se sortean. */
const CULTIVOS = Object.keys(PESO_DEL_CULTIVO) as readonly Cultivo[];

/** Las casillas de un campo que llevan la otra variante de su cultivo. */
const OTRA_VARIANTE = 0.2;

/**
 * La escala de la parcela de una casilla con una vecina en cruz de otro campo
 * (o de fuera): corrida hacia dentro por ese lado, deja ver la tierra de la linde.
 */
export const ESCALA_EN_LA_LINDE = 0.82;

/** Uno de atrezo como mucho por tantos campos cultivados. */
export const CAMPOS_POR_ATREZO = 4;

/**
 * El atrezo, a esta distancia de Chebyshev o más uno de otro: dos carretas
 * juntas se leían como un objeto del juego (s15, segunda prueba).
 */
export const ENTRE_ATREZO = 3;

/**
 * Cuántas tiradas se dan por cada atrezo que se busca (y por uno más): la que
 * cae en una lista sin sitio se pierde, y sin tope el bucle no acabaría.
 */
const TIRADAS_POR_ATREZO = 3;

/** El orden en que se sortea el atrezo: no es el de `ATREZO`. */
const ATREZO_AL_AZAR: readonly Atrezo[] = ['almiar', 'carreta', 'cerca'];

/** Una casa como mucho por tantos campos cultivados. */
export const CAMPOS_POR_CASA = 6;

/**
 * Las casas, a esta distancia de Chebyshev o más unas de otras: dos más cerca
 * se leían como un pueblo (el objeto del juego, que mide 1,9 casillas).
 */
export const ENTRE_CASAS = 4;

/**
 * Las casas, a esta distancia de Chebyshev o más de toda casilla con camino:
 * van metidas en la labranza, donde no pasa nadie. Junto al camino un héroe se
 * paraba en la casilla de la casa y se le veía de pie encima de ella (QA, H1;
 * decisión del usuario, 20-10-2026: «la 3»).
 */
export const CASA_LEJOS_DEL_CAMINO = 2;

/**
 * Los objetos del mapa de los que se apartan las casas, el almiar y la carreta:
 * pegada a una mina, una casa se leía como su caseta (QA, H3: s15 (30, 34), al
 * norte de la mina de (30, 35)). Los monstruos no: son figuras, no edificios.
 */
export const APARTAN_LA_LABRANZA: ReadonlySet<MapObject['kind']> = new Set([
  'mine',
  'town',
  'village',
  'resource',
  'chest',
  'node',
]);

/** Una casa, un almiar o una carreta, a esta distancia de Chebyshev o más de un objeto (`APARTAN_LA_LABRANZA`). */
export const LEJOS_DE_UN_OBJETO = 3;

/**
 * Lo que el almiar se corre del centro de su casilla hacia su campo de trigo:
 * en el medio, con la parcela de la linde encogida y corrida hacia dentro,
 * quedaba media casilla de tierra entre los dos y se leía solo en el barbecho
 * (QA, H5: s19 (6, 11)).
 */
const ARRIMO_DEL_ALMIAR = 0.3;

/** Una parcela: su casilla, el centro de su imagen (en casillas) y su módulo. */
export interface Parcela {
  readonly i: number;
  readonly x: number;
  readonly y: number;
  readonly nombre: string;
  /** 1 dentro del campo; `ESCALA_EN_LA_LINDE` en la linde. */
  readonly escala: number;
  /**
   * La de la junta entre la casilla `i` y la de debajo, del mismo campo, en el
   * lado que comparten; si no, la de la casilla, en su centro.
   */
  readonly junta: boolean;
}

/** Un atrezo: su casilla, su pie (en casillas) y cuál (su módulo, `ATREZO[cual]`). */
export interface PiezaDeAtrezo {
  readonly i: number;
  readonly x: number;
  readonly y: number;
  readonly cual: Atrezo;
}

/** Una casa: su casilla, su pie y `t` (0-1), con el que se elige su módulo. */
export interface Casa {
  readonly i: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface EntradaDeLabranza {
  readonly W: number;
  readonly H: number;
  /** 1 en las casillas de la labranza: `dirt` que se pisa y sin camino. */
  readonly enLaLabranza: Uint8Array;
  /** 1 en las casillas por las que pasa un camino. */
  readonly camino: Uint8Array;
  /** 1 cerca de una ciudad o un pueblo: ahí una casa se fundiría con él. */
  readonly cercaDePueblo: Uint8Array;
  /** Los objetos del mapa, en la casilla donde se pintan; solo cuentan los de `APARTAN_LA_LABRANZA`. */
  readonly objetos: readonly ObjetoDelMapa[];
  /**
   * La escala con la que entra la parcela `p` en la escena (la suya o menos), o
   * null si no entra: la senda, la reserva de un objeto, la copa de un bosque.
   * Sin ella, todas entran enteras.
   */
  readonly escalaQueEntra?: (p: Parcela) => number | null;
  /**
   * Si una casa o un atrezo entra en la escena en su sitio: sin pisar lo que se
   * aparta ni quedar bajo la copa de un bosque. Si no, va al siguiente sitio.
   * Sin ella, todos entran.
   */
  readonly entraLaPieza?: (p: Casa | PiezaDeAtrezo) => boolean;
  readonly semilla: number;
}

/**
 * La máscara `camino` de la entrada, de un mapa de `W` × `H`: 1 en toda casilla
 * con camino de la red, las de sus tramos y las sueltas (como `RedDeCaminos.indices`;
 * la escena recibe solo esas dos caras, `MapaDeEscena.caminos`).
 * Con solo los tramos, la casilla suelta de un plan del agente (un camino de una
 * casilla, que no tiene trazo) quedaba como labranza, y una parcela o una casa
 * podía caer encima (QA, re-verificación 1). El procedimental no deja sueltas:
 * 0 de 100 mapas.
 */
export function casillasConCamino(
  red: Pick<RedDeCaminos, 'tramos' | 'sueltas'>,
  W: number,
  H: number,
): Uint8Array {
  const camino = new Uint8Array(W * H);
  for (const p of [...red.tramos.flat(), ...red.sueltas]) camino[p.y * W + p.x] = 1;
  return camino;
}

/** Un objeto del mapa, por su clase y su casilla. */
export interface ObjetoDelMapa {
  readonly kind: MapObject['kind'];
  readonly x: number;
  readonly y: number;
}

export interface Labranza {
  /** El campo de cada casilla de la labranza (-1 fuera). */
  readonly campo: Int32Array;
  /** El cultivo de cada campo, o null si queda en barbecho. */
  readonly cultivos: readonly (Cultivo | null)[];
  readonly parcelas: readonly Parcela[];
  readonly atrezo: readonly PiezaDeAtrezo[];
  readonly casas: readonly Casa[];
  /** 1 en las casillas de la labranza sin parcela, atrezo ni casa: barbecho, linde suelta. */
  readonly deRelleno: Uint8Array;
}

/**
 * Las cuatro vecinas en cruz, en este orden: el de los campos que se unen y el
 * de la linde dependen de él (`EN_CRUZ` de `vestir.ts` va en otro).
 */
const CRUZ = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** Los lados por los que la junta entre dos casillas puede dar a otro campo. */
const LADOS_DE_LA_JUNTA = [
  [-1, 0],
  [1, 0],
] as const;

/**
 * Una parcela de la casilla con su centro en `(cx, cy)` que da a otro campo por
 * `lados`: en la linde, a `ESCALA_EN_LA_LINDE` y corrida hacia dentro (lejos de
 * cada lado; con dos opuestos, en el medio); sin lados, entera y en su sitio.
 */
function haciaDentro(
  cx: number,
  cy: number,
  lados: readonly (readonly [number, number])[],
): { readonly x: number; readonly y: number; readonly escala: number } {
  const escala = lados.length === 0 ? 1 : ESCALA_EN_LA_LINDE;
  const corre = (1 - escala) / 2;
  let x = cx;
  let y = cy;
  for (const [dx, dy] of lados) {
    x -= dx * corre;
    y -= dy * corre;
  }
  return { x, y, escala };
}

/** Lo que sale de repartir la labranza en campos, antes del atrezo y las casas. */
interface Reparto {
  /** La corriente, por donde va: la siguen el atrezo y las casas. */
  readonly azar: () => number;
  readonly campo: Int32Array;
  readonly cultivos: readonly (Cultivo | null)[];
  readonly parcelas: readonly Parcela[];
  /** Las casillas con parcela en el borde sur de su campo, donde puede ir una cerca. */
  readonly cercas: number[];
  /** 1 en las casillas con parcela. */
  readonly ocupadas: Uint8Array;
}

/**
 * Los campos, sus cultivos y sus parcelas, en las casillas de la labranza que
 * no están en `sinParcela`. Empieza la corriente cada vez: con el mismo
 * `sinParcela`, el mismo reparto.
 */
function repartir(e: EntradaDeLabranza, sinParcela: Uint8Array): Reparto {
  const { W, H, enLaLabranza } = e;
  // Constantes propias, distintas de las de `componer` (7919 + 1, 3571 + 7…).
  const azar = azarDe(e.semilla * 4441 + 29);
  const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  // 1 · La celda de Voronoi de cada casilla: su punto, uno por celda de la rejilla.
  const GW = Math.ceil(W / PASO_DEL_CAMPO);
  const GH = Math.ceil(H / PASO_DEL_CAMPO);
  const puntos: (readonly [number, number])[] = [];
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++)
      puntos.push([(gx + azar()) * PASO_DEL_CAMPO, (gy + azar()) * PASO_DEL_CAMPO]);
  const celda = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (enLaLabranza[y * W + x] !== 1 || sinParcela[y * W + x] === 1) continue;
      const gx = Math.floor(x / PASO_DEL_CAMPO);
      const gy = Math.floor(y / PASO_DEL_CAMPO);
      let mejor = -1;
      let d = Number.POSITIVE_INFINITY;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          const cy = gy + dy;
          if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
          const k = cy * GW + cx;
          const [px, py] = puntos[k] as readonly [number, number];
          const dd = (x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py);
          if (dd < d) {
            d = dd;
            mejor = k;
          }
        }
      celda[y * W + x] = mejor;
    }

  // 2 · Los campos: lo conexo en cruz de cada celda (un camino lo parte), hasta
  // `CAMPO_MAS_GRANDE` casillas; lo que sobra de un trozo, otro campo.
  const campo = new Int32Array(W * H).fill(-1);
  const casillasDe: number[][] = [];
  for (let inicio = 0; inicio < W * H; inicio++) {
    if (celda[inicio] === -1 || campo[inicio] !== -1) continue;
    const c = celda[inicio] as number;
    const id = casillasDe.length;
    const suyas: number[] = [inicio];
    campo[inicio] = id;
    for (let k = 0; k < suyas.length && suyas.length < CAMPO_MAS_GRANDE; k++) {
      const i = suyas[k] as number;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of CRUZ) {
        const nx = x + dx;
        const ny = y + dy;
        if (!dentro(nx, ny) || suyas.length >= CAMPO_MAS_GRANDE) continue;
        const j = ny * W + nx;
        if (celda[j] !== c || campo[j] !== -1) continue;
        campo[j] = id;
        suyas.push(j);
      }
    }
    casillasDe.push(suyas);
  }
  // Un camino o un bosque parten las celdas en trozos de una o dos casillas, que
  // quedaban en barbecho: en la s15 eran 114 de 163 campos. Cada trozo así se une
  // al campo vecino más pequeño con el que no pase de `CAMPO_MAS_GRANDE`.
  for (const [id, suyas] of casillasDe.entries()) {
    if (suyas.length === 0 || suyas.length > CAMPO_EN_BARBECHO) continue;
    let mejor = -1;
    for (const i of suyas) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of CRUZ) {
        if (!dentro(x + dx, y + dy)) continue;
        const otro = campo[(y + dy) * W + x + dx] as number;
        if (otro === -1 || otro === id) continue;
        const n = (casillasDe[otro] as number[]).length;
        if (n + suyas.length > CAMPO_MAS_GRANDE) continue;
        if (mejor === -1 || n < (casillasDe[mejor] as number[]).length) mejor = otro;
      }
    }
    if (mejor === -1) continue;
    for (const i of suyas) campo[i] = mejor;
    (casillasDe[mejor] as number[]).push(...suyas);
    casillasDe[id] = [];
  }
  // Sin los vacíos: el campo de cada casilla, contado otra vez desde 0.
  const nuevos = new Map<number, number>();
  for (const [id, suyas] of casillasDe.entries()) if (suyas.length > 0) nuevos.set(id, nuevos.size);
  for (let i = 0; i < W * H; i++)
    if (campo[i] !== -1) campo[i] = nuevos.get(campo[i] as number) as number;
  const campos = casillasDe.filter((c) => c.length > 0);

  // 3 · El cultivo de cada campo y la variante de cada casilla. Dos campos
  // vecinos no quedan los dos en barbecho —salía un erial de quince casillas en
  // medio de la labranza de la s15— ni, si se puede, con el mismo cultivo, que
  // se leían como uno solo.
  const vecinos = campos.map(() => new Set<number>());
  for (let i = 0; i < W * H; i++) {
    const f = campo[i] as number;
    if (f === -1) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of CRUZ) {
      if (!dentro(x + dx, y + dy)) continue;
      const g = campo[(y + dy) * W + x + dx] as number;
      if (g !== -1 && g !== f) (vecinos[f] as Set<number>).add(g);
    }
  }
  const cultivos: (Cultivo | null)[] = [];
  /** El módulo de la parcela de cada casilla cultivada; undefined, sin parcela. */
  const nombreDe: (string | undefined)[] = new Array(W * H);
  for (const [f, suyas] of campos.entries()) {
    const antes = [...(vecinos[f] as Set<number>)].filter((g) => g < f).map((g) => cultivos[g]);
    // Las tiradas, siempre: lo que decide un campo no cambia las de los demás.
    const barbecho = azar() < PARTE_EN_BARBECHO && !antes.includes(null);
    const libres = CULTIVOS.filter((c) => !antes.includes(c));
    const entre = libres.length > 0 ? libres : CULTIVOS;
    let tirada = azar() * entre.reduce((t, c) => t + PESO_DEL_CULTIVO[c], 0);
    let cultivo = entre[0] as Cultivo;
    for (const c of entre) {
      cultivo = c;
      if (tirada < PESO_DEL_CULTIVO[c]) break;
      tirada -= PESO_DEL_CULTIVO[c];
    }
    const variantes = PARCELAS[cultivo];
    const principal = variantes[Math.floor(azar() * variantes.length)] as string;
    const otra = variantes[Math.floor(azar() * variantes.length)] as string;
    const cultivado = !barbecho && suyas.length > CAMPO_EN_BARBECHO;
    cultivos.push(cultivado ? cultivo : null);
    for (const i of suyas) {
      const variante = azar() < OTRA_VARIANTE ? otra : principal;
      if (cultivado) nombreDe[i] = variante;
    }
  }
  // 4 · Las parcelas: en la linde, más pequeñas y corridas hacia dentro. Y las
  // casillas en el borde sur de su campo, donde puede ir una cerca.
  const parcelas: Parcela[] = [];
  const cercas: number[] = [];
  const ocupadas = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const nombre = nombreDe[i];
    if (nombre === undefined) continue;
    ocupadas[i] = 1;
    const x = i % W;
    const y = (i - x) / W;
    const mismo = (dx: number, dy: number) =>
      dentro(x + dx, y + dy) && campo[(y + dy) * W + x + dx] === campo[i];
    parcelas.push({
      i,
      ...haciaDentro(
        x + 0.5,
        y + 0.5,
        CRUZ.filter(([dx, dy]) => !mismo(dx, dy)),
      ),
      nombre,
      junta: false,
    });
    if (!mismo(0, 1)) {
      cercas.push(i);
      continue;
    }
    // Y la junta con la de debajo, si es del mismo campo: el rombo de una
    // parcela mide la mitad de alto que de ancho, y una por casilla dejaba una
    // franja de tierra entre cada fila del campo; era un damero (s15, primera
    // prueba). Con la junta, las filas se solapan y el campo es una manta.
    const lados = LADOS_DE_LA_JUNTA.filter(([dx]) => !mismo(dx, 0) || !mismo(dx, 1));
    parcelas.push({ i, ...haciaDentro(x + 0.5, y + 1, lados), nombre, junta: true });
  }
  return { azar, campo, cultivos, parcelas, cercas, ocupadas };
}

/** La labranza de un mapa: campos, cultivos, parcelas, atrezo y casas. */
export function labranzaDe(e: EntradaDeLabranza): Labranza {
  const { W, H, enLaLabranza, camino, cercaDePueblo } = e;
  const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const entra = e.escalaQueEntra ?? ((p: Parcela) => p.escala);
  const entraLaPieza = e.entraLaPieza ?? (() => true);

  // Una casilla cuya parcela no entra (la senda, una reserva, la copa de un
  // bosque) sale de los campos y se reparte otra vez. Quitar la parcela y
  // dejar el campo dejaba un almiar junto a un trigo que no estaba y manchas de
  // una sola casilla (QA, H5: 12 de 57 en la s15). Sin ella, el campo se parte
  // como lo parte un camino: el trozo de 1-2 se une al vecino o queda en
  // barbecho, y sus vecinas quedan en la linde. Acaba: cada vuelta saca de los
  // campos una casilla más por lo menos. La junta que no entra solo no va.
  const sinParcela = new Uint8Array(W * H);
  let reparto = repartir(e, sinParcela);
  for (;;) {
    const puestas: Parcela[] = [];
    let fuera = 0;
    for (const p of reparto.parcelas) {
      const escala = entra(p);
      if (escala !== null && escala > p.escala)
        throw new Error(
          `la parcela de la casilla ${p.i} no crece al entrar: ${escala} es más que su escala ${p.escala}`,
        );
      if (escala !== null) puestas.push(escala === p.escala ? p : { ...p, escala });
      else if (!p.junta) {
        sinParcela[p.i] = 1;
        fuera++;
      }
    }
    if (fuera === 0) {
      reparto = { ...reparto, parcelas: puestas };
      break;
    }
    reparto = repartir(e, sinParcela);
  }
  const { azar, campo, cultivos, parcelas, cercas } = reparto;
  /** 1 en las casillas con parcela, casa o atrezo que no es una cerca. */
  const ocupadas = reparto.ocupadas.slice();
  const cultivoEn = (x: number, y: number): Cultivo | null =>
    dentro(x, y) && campo[y * W + x] !== -1
      ? (cultivos[campo[y * W + x] as number] as Cultivo | null)
      : null;
  /** 1 a menos de `LEJOS_DE_UN_OBJETO` de un objeto que aparta la labranza. */
  const cercaDeObjeto = new Uint8Array(W * H);
  const r = LEJOS_DE_UN_OBJETO - 1;
  for (const o of e.objetos) {
    if (!APARTAN_LA_LABRANZA.has(o.kind)) continue;
    for (let y = Math.max(0, o.y - r); y <= Math.min(H - 1, o.y + r); y++)
      for (let x = Math.max(0, o.x - r); x <= Math.min(W - 1, o.x + r); x++)
        cercaDeObjeto[y * W + x] = 1;
  }
  /** Si hay una casilla con camino a menos de `d` (Chebyshev) de `(x, y)`. */
  const caminoAMenosDe = (x: number, y: number, d: number) => {
    for (let v = y - d + 1; v <= y + d - 1; v++)
      for (let u = x - d + 1; u <= x + d - 1; u++)
        if (dentro(u, v) && camino[v * W + u] === 1) return true;
    return false;
  };

  const cultivados = cultivos.filter((c) => c !== null).length;
  const vecinaDe = (
    x: number,
    y: number,
    que: (x: number, y: number) => boolean,
    vecinas: readonly (readonly [number, number])[] = CRUZ,
  ) => vecinas.some(([dx, dy]) => que(x + dx, y + dy));
  /**
   * Las casillas de la labranza sin parcela vecinas en cruz de un campo
   * cultivado que además `pide`, barajadas.
   */
  const juntoAUnCampo = (pide: (x: number, y: number) => boolean): number[] => {
    const sitios: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (enLaLabranza[i] !== 1 || ocupadas[i] === 1) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (vecinaDe(x, y, (a, b) => cultivoEn(a, b) !== null) && pide(x, y)) sitios.push(i);
    }
    return barajar(sitios, azar);
  };
  const enCamino = (x: number, y: number) => dentro(x, y) && camino[y * W + x] === 1;

  // 5 · Las casas: metidas en la labranza, junto a un campo, lejos de los
  // caminos, de los pueblos, de los objetos y de otra casa. Antes iban junto a
  // un camino o al borde de la labranza, y en el camino se para el héroe (H1).
  // Y donde entran (`entraLaPieza`): lejos de todo eso, los rincones que quedan
  // son a menudo la fila al norte de un bosque, y los pinos de delante tapaban
  // la casa entera (QA, RV1-H1: 37 de 236 casas en 1-100, al 74-100 %; la única
  // de s2 y la de s6, invisibles). La casa que no entra prueba el siguiente
  // sitio, con su mismo `t` (el mismo módulo).
  const casas: Casa[] = [];
  let t: number | undefined;
  for (const i of juntoAUnCampo(
    (x, y) =>
      cercaDePueblo[y * W + x] !== 1 &&
      cercaDeObjeto[y * W + x] !== 1 &&
      !caminoAMenosDe(x, y, CASA_LEJOS_DEL_CAMINO),
  )) {
    if (casas.length >= Math.floor(cultivados / CAMPOS_POR_CASA)) break;
    const x = i % W;
    const y = (i - x) / W;
    if (casas.some((c) => chebyshev(c.i, i, W) < ENTRE_CASAS)) continue;
    t ??= azar();
    const casa: Casa = { i, x: x + 0.5, y: y + 0.8, t };
    if (!entraLaPieza(casa)) continue;
    casas.push(casa);
    t = undefined;
    ocupadas[i] = 1;
  }

  // 6 · El atrezo: el almiar junto al trigo, la carreta junto a un camino o un
  // pueblo, la cerca en el borde sur de una parcela de la linde.
  const atrezo: PiezaDeAtrezo[] = [];
  const tope = Math.floor(cultivados / CAMPOS_POR_ATREZO);
  // Las listas, en este orden: cada una baraja con la corriente.
  const esTrigo = (x: number, y: number) => cultivoEn(x, y) === 'trigo';
  const sitios: Record<Atrezo, number[]> = {
    almiar: juntoAUnCampo((x, y) => cercaDeObjeto[y * W + x] !== 1 && vecinaDe(x, y, esTrigo)),
    carreta: juntoAUnCampo(
      (x, y) =>
        cercaDeObjeto[y * W + x] !== 1 &&
        (cercaDePueblo[y * W + x] === 1 || vecinaDe(x, y, enCamino, VECINAS)),
    ),
    cerca: barajar(cercas, azar),
  };
  /**
   * El atrezo `cual` en la casilla `i`: la cerca, en el borde sur de su
   * casilla, delante de su parcela; el almiar, arrimado a su trigo (el primero
   * en cruz); la carreta, en el medio.
   */
  const atrezoEn = (cual: Atrezo, i: number): PiezaDeAtrezo => {
    const x = i % W;
    const y = (i - x) / W;
    const [dx, dy] =
      cual === 'almiar'
        ? (CRUZ.find(([u, v]) => esTrigo(x + u, y + v)) as [number, number])
        : [0, 0];
    return {
      i,
      x: x + 0.5 + dx * ARRIMO_DEL_ALMIAR,
      y: cual === 'cerca' ? y + 0.95 : y + 0.75 + dy * ARRIMO_DEL_ALMIAR,
      cual,
    };
  };
  for (let k = 0; atrezo.length < tope && k < TIRADAS_POR_ATREZO * (tope + 1); k++) {
    const cual = ATREZO_AL_AZAR[Math.floor(azar() * ATREZO_AL_AZAR.length)] as Atrezo;
    const lista = sitios[cual];
    // Como la casa, donde entra: bajo los pinos de delante, 24 de 166 almiares
    // y carretas de 1-100 quedaban tapados en más de la mitad (RV1-H1).
    const n = lista.findIndex(
      (j) =>
        (cual === 'cerca' || ocupadas[j] !== 1) &&
        atrezo.every((p) => chebyshev(p.i, j, W) >= ENTRE_ATREZO) &&
        entraLaPieza(atrezoEn(cual, j)),
    );
    if (n === -1) continue;
    const i = lista.splice(n, 1)[0] as number;
    atrezo.push(atrezoEn(cual, i));
    if (cual !== 'cerca') ocupadas[i] = 1;
  }

  const deRelleno = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (enLaLabranza[i] === 1 && ocupadas[i] !== 1) deRelleno[i] = 1;
  return { campo, cultivos, parcelas, atrezo, casas, deRelleno };
}

/** La distancia de Chebyshev entre las casillas `i` y `j` de un mapa de ancho `W`. */
const chebyshev = (i: number, j: number, W: number): number =>
  Math.max(Math.abs((i % W) - (j % W)), Math.abs(Math.floor(i / W) - Math.floor(j / W)));
