/**
 * Vestir una red fina (`vestirRed`): suelos y niveles, fronteras gruesas
 * (`map/vestir/`), ciudades y pueblos, objetos, monstruos y asaltantes,
 * obstáculos y caminos, hasta el plan del procedimental, o en qué fase y por
 * qué ese vestido no vale. La red que se viste (`RedFina`) la traza
 * `procedimental.ts`, que prueba vestidos sobre ella. Las opciones del
 * generador (`ProceduralOptions`) también viven aquí, en el módulo más bajo que
 * las lee (el vestido, las facciones y los monstruos), y no junto a
 * `generateMapPlan`, que las recibe: así la carpeta no tiene ningún nudo, ni de
 * tipos.
 *
 * Era parte de `map/generate.ts` hasta la fase N de la reorganización
 * (07-11-2026).
 */
import { ASALTANTES } from '../../hero/grupos.js';
import { LIDERAZGO } from '../../hero/liderazgo.js';
import { type Rng, sortearPorPesos } from '../../rng.js';
import {
  FACTION_IDS,
  type FactionId,
  type PlayerId,
  type Point,
  type RaiderPlaneado,
} from '../../types.js';
import { unidadesDelJuego } from '../../unidad/catalogo.js';
import { nivelDeUnidad } from '../../unidad/nivel.js';
import { aPunto, chebyshev, espejoDe, parejaDe, VECINAS } from '../geometria.js';
import { createEmptyMap } from '../map.js';
import { murallasDeLaRejilla } from '../murallas.js';
import { type PasoTorcido, problemasDeNiveles, tramosTorcidos } from '../niveles.js';
import { puertaDe } from '../puertas.js';
import {
  cabeElRecinto,
  type MapaDelRecinto,
  ORDEN_DE_LAS_CARAS,
  PUERTAS_DE_LA_CIUDAD,
  pasosDelRecinto,
  problemasDeRecintos,
  puertasPosibles,
  SEPARACION_DE_CIUDADES,
} from '../recinto.js';
import type { TramoDeCamino } from '../red-de-caminos.js';
import { estructura, juntoANodo, problemasDeRed, vecindad } from '../regiones.js';
import {
  ladosDelRio,
  type MapaDelRio,
  nivelesDelRio,
  orillaDeLaCiudad,
  regionesDelRio,
  rioEntero,
  type TrazadoDelRio,
} from '../rio.js';
import type { Barrera, Nivel, Suelo } from '../terrain.js';
import { territorio } from '../territorio.js';
import type { Estructura, GameMap, MapRegion } from '../tipos.js';
import {
  ABIERTA,
  BARRERAS_DEL_MAPA,
  barreraDe,
  esDelRio,
  ponerTipo,
  type Tipos,
} from '../vestir/base.js';
import {
  abrirEsquinasTorcidas,
  type EntradaDeCaminos,
  esquinasDeAgua,
  sinAguaEnLasEsquinas,
  trazarCaminos,
} from '../vestir/caminos.js';
import { casillasMinimasDe, engordarFronteras, TIPOS_POR_MAPA } from '../vestir/fronteras.js';
import { acantiladoSinCaida, CAIDA_LARGA, caidasLargas } from '../vestir/lineas.js';
import { ponerObstaculos } from '../vestir/obstaculos.js';
import { mesasDelRelieve, nivelesDeLoEngordado } from '../vestir/relieve.js';
import { buildMap, idDePueblo } from './construir.js';
import { NIVEL_POR_SUELO } from './datos.js';
import { NOMBRES_DE_CIUDAD, NOMBRES_DE_PUEBLO, nombre } from './nombres.js';
import type { PlanConTramos, PlannedTown, PlannedWall } from './plan.js';
import {
  azarDelPoblamiento,
  ciudadesDeRegion,
  parejasConCiudad,
  pueblosEnElMuro,
  regionesDeFuera,
  saltosALaRegion,
} from './poblar.js';

export interface ProceduralOptions {
  /**
   * Regiones por bando (#195): el lado sale de ellas (`ladoDelMapa`). Por
   * defecto, `REGIONES_POR_BANDO`. No se pide junto con un lado: serían dos
   * datos para un hecho.
   */
  readonly regionesPorBando?: number;
  /** Un lado a mano (un rectángulo, un test): las regiones salen de su área (`regionesDelMapa`). */
  readonly width?: number;
  readonly height?: number;
  readonly factions?: readonly [FactionId, FactionId];
  readonly monsterCount?: number;
  /**
   * Se le dice cada vestido que no vale, con su fase y su motivo: lo leen las
   * medidas (`tools/qa/medidas/rios.ts`), que cuentan los vestidos tirados. No cambia
   * nada del mapa.
   */
  readonly alTirarUnVestido?: (fase: string, motivo: string) => void;
  /**
   * Se le da el río del plan que sale (`trazarRio`): lo lee el guardia de su
   * continuidad (`test/rio.test.ts`) y la medida (`tools/qa/medidas/rios.ts`), que
   * comprueban sobre el mapa hecho que sigue entero. No cambia nada del mapa.
   */
  readonly alTrazarElRio?: (rio: TrazadoDelRio) => void;
}

/** En qué paso del vestido se rindió un intento, para que el error final lo diga. */
export const FASES_DEL_VESTIDO = ['fronteras', 'objetos', 'obstáculos'] as const;
export type FaseDelVestido = (typeof FASES_DEL_VESTIDO)[number];

/** Un vestido que no vale: en qué fase y por qué. */
interface VestidoFallido {
  readonly fase: FaseDelVestido;
  readonly motivo: string;
}

/**
 * Una red fina ya validada y equilibrada: lo que el vestido necesita para
 * vestirla, tantas veces como haga falta, sin volver a trazarla.
 */
export interface RedFina {
  readonly W: number;
  readonly H: number;
  readonly semillas: readonly Point[];
  readonly etiqueta: Int32Array;
  readonly muro: Uint8Array;
  /** Los nodos, por índice plano; los primeros son los cruces del río (las ciudades-puente). */
  readonly nodos: readonly number[];
  readonly regions: readonly MapRegion[];
  /** El mapa provisional con sus nodos como objetos. */
  readonly conNodos: GameMap;
  readonly red: Estructura;
  /** Las dos bases, como índice de nodo. */
  readonly b0: number;
  readonly b1: number;
  readonly neutrales: readonly number[];
  /** Saltos desde cada base, para la facción de cada ciudad neutral. */
  readonly d0: ReadonlyMap<number, number>;
  readonly d1: ReadonlyMap<number, number>;
  /**
   * Las regiones de fuera del jugador 0 (pares, sin la de casa) que pueden llevar
   * una ciudad en su mitad, con su espejo: las que están a los mismos saltos de
   * cada base (paso 7 de `intentarRed`). De ellas elige el vestido.
   */
  readonly conCiudadPosible: readonly number[];
  /** Los nodos que llevan camino desde cada región (`crucesConCamino`). */
  readonly conCamino: readonly (readonly number[])[];
  /** El río (`trazarRio`), que la red ya tiene por muro y el vestido escribe como agua. */
  readonly rio: TrazadoDelRio;
  /** La orilla de cada casilla (`orillas`), −1 en el río. */
  readonly banco: Int32Array;
}

/** Lo que se dice de una senda torcida (`pasoTorcido`) cuando el vestido no vale por ella. */
const COMO_VA_TORCIDA: Record<PasoTorcido, string> = {
  silla: 'pasa por una silla del relieve',
  diagonal: 'cambia de nivel en diagonal',
  costado: 'baja por la esquina de una meseta, sin pared a un lado',
};

/** Cuántas veces se abren esquinas torcidas y se vuelve a trazar (#224); con dos ya no quedan. */
const VUELTAS_DE_ESQUINAS = 3;

/** El terreno de cada pareja de regiones que no es la de casa. */
const SUELOS: readonly Suelo[] = ['grass', 'rough', 'snow', 'swamp', 'sand', 'lava'];

/** Una región más pequeña que esto no tiene sitio para lo que se le reparte. */
const REGION_MINIMA = 10;

/** Si alguna región de `regionDe` tiene menos casillas que `REGION_MINIMA`: la regla, una vez. */
export function hayRegionRaquitica(regionDe: Int32Array, regiones: number): boolean {
  const tamaño = new Int32Array(regiones);
  for (const r of regionDe) if (r >= 0) tamaño[r]! += 1;
  return tamaño.some((t) => t < REGION_MINIMA);
}

/**
 * Lo que se ve delante de cada entrada de cada nodo, marcado con un 1.
 * `juntoANodo` ya veta la entrada; esto veta:
 *
 * - La casilla siguiente en cada eje, `n + 2d` en las ocho direcciones. Las
 *   ocho, y no solo las del eje que eligió el vestido, porque el eje corto y el
 *   nodo sin eje no protegen esa casilla con el pasillo, y así no hace falta
 *   saber cuál fue.
 * - La de debajo de las dos entradas diagonales del sur, `n + (±1, 2)`. La
 *   cámara mira desde el sur, así que lo que está ahí se pinta delante de la
 *   entrada y la tapa: en un puente diagonal es el estribo de abajo, y un pueblo
 *   ahí se comía la rampa (#166 H10: s49 node-12; 34 de 1 015 puentes en las
 *   semillas 1-400, todos en este desfase). Y su reflejo, `n + (±1, −2)`, que
 *   no tapa nada: `colocarPar` pone cada cosa y su espejo (giro de 180°), y un
 *   veto que no es simétrico le niega el espejo más a menudo. Medido en 1-400:
 *   con solo el del sur, lo sembrado con espejo exacto baja del 91,4 al 89,8 %
 *   y el jugador 0 gana 115 de las 200 partidas del banco (eran 93); con los
 *   dos, 91,8 % y 91.
 */
const DELANTE_DE_NODO: readonly (readonly [number, number])[] = [
  ...[-2, 0, 2].flatMap((dy) =>
    [-2, 0, 2].filter((dx) => dx !== 0 || dy !== 0).map((dx) => [dx, dy] as const),
  ),
  [-1, 2],
  [1, 2],
  [-1, -2],
  [1, -2],
];

function delanteDeNodo(W: number, H: number, nodos: readonly number[]): Uint8Array {
  const marca = new Uint8Array(W * H);
  for (const n of nodos) {
    const x = n % W;
    const y = Math.floor(n / W);
    for (const [dx, dy] of DELANTE_DE_NODO) {
      if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) marca[(y + dy) * W + x + dx] = 1;
    }
  }
  return marca;
}

/**
 * Las unidades que pueden ser un monstruo del mapa: las de nivel 2 o menos de
 * cualquier facción (`nivelDeUnidad`, con el equipo puesto), en el orden del
 * catálogo. Con caballeros y nigromantes eran seis criaturas escritas a mano, de
 * las moradas 1 a 3; derivadas, una unidad nueva del catálogo entra sola.
 */
const MONSTRUOS_POSIBLES: readonly string[] = unidadesDelJuego()
  .filter((u) => nivelDeUnidad(u) <= 2)
  .map((u) => u.id);

/**
 * Viste una red fina (`vestir/`): suelos, fronteras gruesas, objetos,
 * obstáculos y caminos. Todo lo que hace convierte casillas pisables en barrera,
 * y eso nunca abre un paso. Devuelve el plan, o en qué fase y por qué este
 * vestido no vale —la red sigue valiendo, y `generateMapPlan` la vuelve a vestir—.
 */
export function vestirRed(
  rng: Rng,
  fina: RedFina,
  opts: ProceduralOptions,
  guardarPuertas = true,
): PlanConTramos | VestidoFallido {
  const { W, H, semillas, etiqueta, muro, regions, conNodos, red, b0, b1 } = fina;
  const { neutrales, d0, d1 } = fina;
  // Los nodos de la red fina. La ciudad-puente se muda a su orilla en cuanto
  // está la frontera gruesa (abajo, «la ciudad-puente, en tierra»), y desde
  // ahí `nodos` y `ciudades` la tienen en su casilla nueva.
  let nodos: readonly number[] = fina.nodos;
  // Sin facciones pedidas, las dos primeras de las cinco, sin tirada: el sorteo lo
  // hace la partida (`newGame`) con su propia corriente, para que pedir dos
  // facciones no mueva ni una casilla del mapa de una semilla.
  const [f0, f1] = opts.factions ?? [FACTION_IDS[0], FACTION_IDS[1]];
  const N = W * H;
  const punto = (i: number): Point => aPunto(i, W);
  const indice = (p: Point): number => p.y * W + p.x;
  const fallo = (fase: FaseDelVestido, motivo: string): VestidoFallido => ({ fase, motivo });

  // 8. Un suelo por pareja de regiones, en espejo; las de casa, de tierra. Va
  //    antes que las fronteras porque la barrera de cada una sale de sus suelos.
  //    Y su nivel de altura (#143), también por pareja: va antes que las
  //    fronteras porque el acantilado solo separa dos niveles distintos y dos
  //    niveles distintos solo los separa un acantilado, una montaña o el agua.
  //    Las de casa, al llano.
  const suelos: Suelo[] = [];
  const sorteados: Nivel[] = [];
  for (let k = 0; k < semillas.length; k += 2) {
    const suelo: Suelo = k === 0 ? 'dirt' : rng.pick(SUELOS);
    const nivel: Nivel = k === 0 ? 1 : sortearNivel(rng, suelo);
    suelos[k] = suelo;
    suelos[parejaDe(k)] = suelo;
    sorteados[k] = nivel;
    sorteados[parejaDe(k)] = nivel;
  }
  // Y con el río, sin tirada (`nivelesDelRio`): el agua va plana al llano, la
  // ciénaga que lo toca sube a él y ninguna pareja lo encaja entre dos mesetas.
  const { mascara } = fina.rio;
  const delRio = regionesDelRio(W, H, mascara, etiqueta);
  const niveles = nivelesDelRio(sorteados, delRio.tocan, delRio.cruzan);

  // 9. Las fronteras, gruesas y de su tipo. El mapa grueso se vuelve a validar
  //    entero: lo que se puede haber roto es una región partida o raquítica.
  let ciudades = [b0, b1, ...neutrales].map((k) => nodos[k] as number);
  const grueso = engordarFronteras({
    W,
    H,
    etiqueta,
    muro,
    nodos,
    ciudades,
    conCamino: fina.conCamino.flat().map((k) => nodos[k] as number),
    semillas,
    suelos,
    niveles,
    rng,
    rio: mascara,
    lados: ladosDelRio(W, H, mascara),
  });
  if (typeof grueso === 'string') return fallo('fronteras', grueso);
  const { tipos, pasillo } = grueso;
  // La frontera, antes de los obstáculos: la cuenta de las barreras
  // garantizadas (paso 8 del engorde) es sobre ella, y al final se repite.
  const nodosDeLaRed = new Set(nodos);
  const deFrontera: number[] = [];
  const fronteraAntes: (Barrera | null)[] = [];
  for (let i = 0; i < N; i++) {
    const b = barreraDe(tipos, i);
    if (b === null || nodosDeLaRed.has(i)) continue;
    deFrontera.push(i);
    fronteraAntes.push(b);
  }
  const regionsGruesas = regions.map((r, k) => ({
    ...r,
    at: grueso.semillas[k] as Point,
    nivel: niveles[k] as Nivel,
  }));
  // Las bases, ya con su dueño: así `territorio` dice de quién es cada región
  // el primer día, con la misma regla que la partida.
  const dueñoDeBase = new Map<string, PlayerId>([
    [red.nodos[b0]?.id as string, 0],
    [red.nodos[b1]?.id as string, 1],
  ]);
  const mapaGrueso: GameMap = {
    ...createEmptyMap(W, H, 'grass'),
    regions: regionsGruesas,
    objects: conNodos.objects.map((o) => ({ ...o, owner: dueñoDeBase.get(o.id) ?? null })),
  };
  for (let i = 0; i < N; i++) {
    const b = barreraDe(tipos, i);
    if (b !== null) mapaGrueso.terrain[i] = b;
  }
  const problemas = problemasDeRed(mapaGrueso);
  if (problemas.length > 0) return fallo('fronteras', problemas[0] as string);
  const alEmpezar = territorio({ map: mapaGrueso, players: [] });
  const redGruesa = alEmpezar.red;
  const regionGruesa = redGruesa.regionDe;
  if (hayRegionRaquitica(regionGruesa, semillas.length)) {
    return fallo('fronteras', `alguna región se queda en menos de ${REGION_MINIMA} casillas`);
  }

  // El recinto de cada ciudad (`recinto.ts`), otra vez sobre la frontera
  // gruesa: la orilla de una ciudad-puente sale de sus regiones, y el engorde
  // le puede cambiar el lado que la red fina le dio. Lo de dentro no se usa
  // para nada: ni objetos, ni obstáculos.
  const enCiudad = [b0, b1, ...neutrales];
  const centros = enCiudad.map((k) =>
    enSuOrilla(mapaGrueso, red.nodos[k]?.at as Point, regionGruesa),
  );
  const enUnRecinto = new Uint8Array(N);
  for (const [k, c] of centros.entries()) {
    const donde = `el recinto de la ciudad de (${c.x},${c.y})`;
    if (!cabeElRecinto(c, W, H)) return fallo('objetos', `${donde} no cabe en el mapa`);
    const otra = centros.slice(k + 1).find((d) => chebyshev(c, d) < SEPARACION_DE_CIUDADES);
    if (otra !== undefined) return fallo('objetos', `${donde} toca el de (${otra.x},${otra.y})`);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) enUnRecinto[(c.y + dy) * W + c.x + dx] = 1;
  }
  const deCiudad = new Set(ciudades);
  const nodoDentro = nodos.find((n) => enUnRecinto[n] === 1 && !deCiudad.has(n));
  if (nodoDentro !== undefined)
    return fallo(
      'objetos',
      `el nodo de (${nodoDentro % W},${Math.floor(nodoDentro / W)}) cae en el recinto de una ciudad`,
    );

  // La ciudad-puente, en tierra (fase 2): la ciudad pasa al medio de su
  // recinto, en su orilla, y la casilla del río en que estaba se queda abierta:
  // es su puente, tierra de la región de enfrente (`rioAnteLaCiudad`) y el
  // acceso de su puerta del río. La red no cambia —la ciudad sigue entre sus
  // tres regiones—, así que la red gruesa se queda como está (con la ciudad en
  // el río) y lo que se viste desde aquí la tiene en su casilla nueva.
  /** Los puentes de las ciudades-puente: el índice de su casilla y la región de enfrente. */
  const puentesDeCiudad = new Map<number, number>();
  for (const [k, c] of centros.entries()) {
    const n = enCiudad[k] as number;
    const enElRio = nodos[n] as number;
    if (indice(c) === enElRio) continue;
    // La región de enfrente: la de lo que se pisa alrededor del puente fuera
    // del recinto. Una sola, o el puente uniría dos.
    const deEnfrente = new Set<number>();
    const ex = enElRio % W;
    const ey = (enElRio - ex) / W;
    for (const [dx, dy] of VECINAS) {
      const x = ex + dx;
      const y = ey + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) <= 1) continue;
      const r = regionGruesa[y * W + x] as number;
      if (r >= 0) deEnfrente.add(r);
    }
    if (deEnfrente.size !== 1)
      return fallo(
        'objetos',
        `el puente de la ciudad de (${c.x},${c.y}) toca ${deEnfrente.size} regiones al otro lado del río: tiene que dar a una`,
      );
    puentesDeCiudad.set(enElRio, [...deEnfrente][0] as number);
  }
  nodos = nodos.map((n, k) => {
    const j = enCiudad.indexOf(k);
    return j === -1 ? n : indice(centros[j] as Point);
  });
  ciudades = enCiudad.map((k) => nodos[k] as number);
  /** Las casillas del río que se pisan: los puentes de las ciudades-puente. */
  const abiertas: ReadonlySet<number> = new Set(puentesDeCiudad.keys());
  /**
   * Las ciudades en mitad de su región (fase 2, `ciudadesDeRegion`), con su
   * casilla y su región: las pone el vestido tras la frontera gruesa, así que
   * hasta entonces la lista está vacía. No son nodos: nada de la red las ve.
   */
  const deRegion: { readonly casilla: number; readonly region: number }[] = [];
  /**
   * La región de cada casilla para lo que se viste desde aquí: la de la red
   * gruesa con el puente de cada ciudad-puente en la de enfrente. Se rehace al
   * pedirla, porque `abrirEsquinasTorcidas` abre casillas a su región.
   */
  const regionDelVestido = (): Int32Array => {
    const r = Int32Array.from(regionGruesa);
    for (const [i, reg] of puentesDeCiudad) r[i] = reg;
    return r;
  };
  /**
   * Lo que se lee del vestido como un mapa (`MapaDelRecinto`): el terreno de
   * `tipos` con el puente de cada ciudad-puente pisable, y dónde están las
   * ciudades y los nodos. Es lo que dice por qué puertas puede entrar un camino
   * en cada ciudad (`puertasPosibles`), con la regla de la partida.
   */
  const mapaDelVestido = (): MapaDelRecinto => ({
    width: W,
    height: H,
    terrain: Array.from({ length: N }, (_, i) =>
      abiertas.has(i) ? ('grass' as const) : (barreraDe(tipos, i) ?? ('grass' as const)),
    ),
    objects: [
      ...nodos.map((n, k) => ({
        kind: enCiudad.includes(k) ? ('town' as const) : ('node' as const),
        at: punto(n),
      })),
      ...deRegion.map((c) => ({ kind: 'town' as const, at: punto(c.casilla) })),
    ],
  });
  /**
   * Las puertas por las que puede entrar un camino en cada ciudad, con las tablas
   * del paso: primero las de los nodos (en el orden de `ciudades`) y después las
   * de mitad de una región (`deRegion`).
   */
  const puertasDelVestido = () => {
    const m = mapaDelVestido();
    const puertas = [...ciudades, ...deRegion.map((c) => c.casilla)].map((c) => ({
      at: punto(c),
      puertas: puertasPosibles(m, punto(c)),
    }));
    return { puertas, pasos: pasosDelRecinto(W, H, puertas) };
  };
  // Cada región de cada ciudad, con una puerta por la que entrar, y ninguna
  // más: el recinto no cambia la red. La que llega a la ciudad por un pasillo
  // de una casilla de este a oeste (el engorde abre en cruz la entrada de cada
  // nodo) la toca solo por la cara del este o la del oeste, que no llevan
  // puerta: se le abre a la región un acceso de una diagonal pegado al pasillo
  // (`abrirUnAcceso`). Si no se puede, o una región llega a un acceso sin
  // tocar el anillo (la ganaría), el vestido no vale.
  {
    /** Las regiones de cada ciudad a las que se llega por sus puertas, ascendentes. */
    const porSusPuertas = (): number[][] => {
      const { puertas } = puertasDelVestido();
      const regionV = regionDelVestido();
      return puertas.map(({ puertas: suyas }) =>
        [...new Set(suyas.flatMap((p) => p.accesos.map((a) => regionV[indice(a)] as number)))]
          .filter((r) => r >= 0)
          .sort((a, b) => a - b),
      );
    };
    const especial = (i: number): number | null =>
      nodos.includes(i) ? -2 : (puentesDeCiudad.get(i) ?? null);
    let llegan = porSusPuertas();
    for (const [j, c] of ciudades.entries()) {
      const planeadas = redGruesa.nodos[enCiudad[j] as number]?.regiones ?? [];
      const faltan = planeadas.filter((r) => !(llegan[j] ?? []).includes(r));
      if (faltan.some((r) => abrirUnAcceso(punto(c), r, tipos, regionGruesa, W, H, especial)))
        llegan = porSusPuertas();
      const deLaRed = planeadas.join();
      const porPuertas = (llegan[j] ?? []).join();
      if (deLaRed !== porPuertas)
        return fallo(
          'objetos',
          `la ciudad de (${c % W},${Math.floor(c / W)}) toca las regiones ${deLaRed} y por sus puertas se llega a ${porPuertas}`,
        );
    }
  }
  // Ni nada en sus accesos ni en el puente: son su entrada.
  const enUnAcceso = new Uint8Array(N);
  /**
   * El 5 × 5 de la ciudad de la casilla `c`, dentro del mapa: su recinto (el 3 × 3;
   * el de las del muro ya está marcado desde arriba) y sus accesos, el anillo de
   * fuera. Para las del muro y para las de mitad de una región.
   */
  const marcarElRecinto = (c: number): void => {
    const cx = c % W;
    const cy = (c - cx) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) enUnRecinto[y * W + x] = 1;
        else enUnAcceso[y * W + x] = 1;
      }
  };
  for (const c of ciudades) marcarElRecinto(c);
  for (const i of abiertas) enUnAcceso[i] = 1;

  const ocupadas = new Set<number>([...nodos, ...abiertas]);
  // Lo pegado a un nodo no se usa, para que nada tape la entrada a la región.
  const junto = juntoANodo(mapaGrueso);
  // Ni lo que se ve delante de una entrada (`n + 2d` y, bajo las diagonales
  // del sur, `n + (±1, 2)`, con su reflejo): un pueblo ahí se planta delante del
  // puente o del paso (#166 H10, s57 node-16 y s49 node-12). Va aparte de `juntoANodo`, que también acota la patrulla de los
  // asaltantes, y esto es solo de dónde se siembra.
  const delante = delanteDeNodo(W, H, nodos);
  // Las ciudades de mitad de una región (ciudades en su región, fase 2,
  // 05-11-2026: «la mayoría de las ciudades deberían estar en mitad de una
  // región»), antes que todo objeto: van en lo más hondo de su región, y lo
  // que se siembra después se aparta de su recinto y sus accesos.
  // Su corriente (`azarDelPoblamiento`) sigue después con los pueblos en un nodo.
  const azarDelPoblado = azarDelPoblamiento(semillas);
  {
    const puestas = ciudadesDeRegion({
      W,
      H,
      regionDe: regionGruesa,
      libre: (i, delRecinto) =>
        tipos[i] === ABIERTA &&
        enUnRecinto[i] === 0 &&
        enUnAcceso[i] === 0 &&
        (!delRecinto || (junto[i] === 0 && pasillo[i] === 0 && delante[i] === 0)),
      otras: ciudades.map(punto),
      parejas: fina.conCiudadPosible,
      cuantas: parejasConCiudad(semillas.length),
      azar: azarDelPoblado,
    });
    if (typeof puestas === 'string') return fallo('objetos', puestas);
    for (const c of puestas) {
      deRegion.push(c);
      ocupadas.add(c.casilla);
      marcarElRecinto(c.casilla);
    }
  }
  // Las casillas que valen de cada región, una vez: abiertas, sin pegarse a un
  // nodo, fuera del pasillo de entrada y de su eje. Lo ocupado se descuenta al
  // pedirlas.
  const sinUsar = (i: number): boolean =>
    junto[i] === 0 &&
    pasillo[i] === 0 &&
    delante[i] === 0 &&
    enUnRecinto[i] === 0 &&
    enUnAcceso[i] === 0;
  const candidatas: number[][] = semillas.map(() => []);
  for (let i = 0; i < N; i++) {
    const r = regionGruesa[i] as number;
    if (r !== -1 && sinUsar(i)) candidatas[r]?.push(i);
  }
  // La puerta de cada pueblo (#188, `trazarCaminos`): la casilla de debajo
  // (`puertas.ts`), por donde llega su camino. Se guarda al colocarlo: nada más
  // cae en ella, ni un obstáculo; sin eso había objetos con puerta en la última
  // fila. Y un pueblo no se pone delante de la puerta de otro (en la fila que la
  // cruza: la puerta y sus dos vecinas de través), ni otro delante de la suya:
  // uno justo debajo de otro le tapaba la puerta y el camino lo rodeaba por
  // detrás (s3, (26,3), entre dos minas). Guardar también las vecinas de la
  // puerta dejaba sin sitio a los obstáculos de un 24×24 (56 de 100 sin mapa).
  const anteLaPuerta = new Set<number>();
  const conPuertaPuestos = new Set<number>();
  /** Lo que queda delante de una puerta guardada: ahí no va otro objeto con puerta. */
  const delanteDeLasPuestas = new Set<number>();
  const usada = (i: number): boolean => ocupadas.has(i) || anteLaPuerta.has(i);
  /** La puerta del pueblo en `i` (`puertaDe`, la casilla de debajo), o −1 si cae fuera del mapa. */
  const puertaEn = (i: number): number => {
    const p = puertaDe({ at: punto(i), barrera: null }, W, H);
    return p === null ? -1 : p.y * W + p.x;
  };
  /** La fila de la puerta `p`: ella y sus dos vecinas de través, dentro del mapa. */
  const filaDeLaPuerta = (p: number): number[] => {
    const x = p % W;
    return [x > 0 ? p - 1 : -1, p, x < W - 1 ? p + 1 : -1].filter((j) => j >= 0);
  };
  /**
   * Si la puerta del pueblo en `i` sirve: dentro y no en el borde, de su
   * región, libre, sin otro objeto con puerta delante y con algo más que los
   * costados del pueblo por donde llegar a ella.
   */
  const puertaLibre = (i: number): boolean => {
    const p = puertaEn(i);
    if (p < 0) return false;
    // Ni la puerta en el borde del mapa (#189): en la última fila solo se
    // llegaba a ella por la misma fila, y en la primera o la última columna,
    // por la columna; el camino corría pegado al borde, medio bajo las nubes
    // (10,7 casillas de camino por mapa en el borde en 1-100; 5,4, la puerta
    // de un objeto).
    const x = p % W;
    const y = (p - x) / W;
    if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return false;
    if (regionGruesa[p] !== regionGruesa[i] || usada(p)) return false;
    const fila = filaDeLaPuerta(p);
    if (fila.some((j) => conPuertaPuestos.has(j))) return false;
    // Lo de más allá de la puerta: la casilla de debajo de ella.
    return [...fila, p + W].some((j) => j !== p && regionGruesa[j] === regionGruesa[i]);
  };
  /** Si `i` puede llevar un pueblo con su puerta libre, y no delante de la puerta de otro. */
  const tienePuerta = (i: number): boolean => !delanteDeLasPuestas.has(i) && puertaLibre(i);
  // La puerta se guarda también cuando el pueblo se puso sin ella libre de
  // verdad (`libresConPuerta` sin sitio): si es de su región, nada cae en ella.
  // Sin eso, con las fronteras onduladas de #229 un objeto se puso en la
  // puerta de otro puesto así, y el camino entraba al de arriba en diagonal
  // (42×42 s45 (29,37), entre dos minas).
  const guardarPuerta = (i: number): void => {
    const p = puertaEn(i);
    if (p >= 0 && regionGruesa[p] === regionGruesa[i]) {
      anteLaPuerta.add(p);
      for (const j of filaDeLaPuerta(p)) delanteDeLasPuestas.add(j);
    }
    conPuertaPuestos.add(i);
  };
  const libres = (r: number, conPuerta = false): number[] =>
    (candidatas[r] ?? []).filter((i) => !usada(i) && (!conPuerta || tienePuerta(i)));
  // Lo libre de la región `r`; con `conPuerta`, lo que además tiene su puerta
  // libre, y si no queda nada así, lo libre sin más: en un mapa apretado no
  // siempre queda, y el camino entra entonces por donde se alcance (lo cobra
  // `trazarCaminos`).
  const libresConPuerta = (r: number, conPuerta: boolean): number[] => {
    if (!conPuerta) return libres(r);
    const l = libres(r, true);
    return l.length > 0 ? l : libres(r);
  };
  // Coloca algo en la región `r` y su espejo en la pareja de `r`: la misma
  // casilla reflejada si está libre y es de esa región, si no otra al azar.
  // Con `conPuerta` (un pueblo), con su puerta libre, y se queda guardada. El
  // espejo lleva la misma puerta, no reflejada: el sprite no se espeja.
  const colocarPar = (r: number, conPuerta = false): [Point, Point] | null => {
    const lista = libresConPuerta(r, conPuerta);
    if (lista.length === 0) return null;
    const a = rng.pick(lista);
    if (conPuerta) guardarPuerta(a);
    ocupadas.add(a);
    const im = espejoDe(a, N);
    let b: number;
    if (
      regionGruesa[im] === parejaDe(r) &&
      !usada(im) &&
      sinUsar(im) &&
      (!conPuerta || tienePuerta(im))
    ) {
      b = im;
    } else {
      const otra = libresConPuerta(parejaDe(r), conPuerta);
      if (otra.length === 0) return null;
      b = rng.pick(otra);
    }
    if (conPuerta) guardarPuerta(b);
    ocupadas.add(b);
    return [punto(a), punto(b)];
  };

  // Cada nodo, pegado a las regiones que le llevan camino (`crucesConCamino`, que
  // reparte sobre la red fina): el engorde de las fronteras puede apartarlo de
  // una, y la búsqueda de esa región no llegaría a él (`centroDeRegion` lanza).
  // Al 64×64 s8 le pasó con la ciudad de (7,8) y la región 4. Las ciudades, no:
  // con el recinto (`recinto.ts`) a una ciudad se llega por los accesos de sus
  // puertas, a dos casillas, y eso lo miran el trazado (`centroOMotivo`) y la
  // red del mapa hecho, al final.
  {
    const { desde, vecinas } = vecindad(W, H);
    for (const [r, ks] of fina.conCamino.entries()) {
      for (const k of ks) {
        if (enCiudad.includes(k)) continue;
        const n = nodos[k] as number;
        let toca = false;
        for (let v = desde[n]!; v < desde[n + 1]! && !toca; v++)
          toca = regionGruesa[vecinas[v]!] === r;
        if (!toca) {
          const p = punto(n);
          return fallo(
            'fronteras',
            `el nodo de (${p.x},${p.y}) no toca la región ${r}, que le lleva camino: el engorde lo apartó de ella`,
          );
        }
      }
    }
  }

  // Las regiones de fuera del jugador 0: las pares sin la de casa (las impares
  // son su espejo, que pone `colocarPar`).
  const fuera = regionesDeFuera(semillas.length);

  // Un pueblo en cada región que no es la de casa: dentro de ella o, en una de
  // cada `POBLAMIENTO.pueblosEnUnNodo` parejas, en su paso con camino (pueblos en
  // un nodo, fase 3, `pueblosEnElMuro`). El del muro no es de `villages`: sigue
  // siendo un nodo para todo el vestido (caminos, pasillos, lo de delante) y en el
  // plan va a los pueblos, sobre su muro, que `buildMap` abre. **Su sitio de dentro
  // se sortea igual** y se queda vacío (`sitiosSinPueblo`), guardado como el de un
  // pueblo: así mudar el pueblo no gasta otras tiradas ni libera casillas, y
  // monstruos, cofres, asaltantes y obstáculos caen donde caían; solo cambian el
  // pueblo y los caminos de su región.
  const pasosConPueblo = pueblosEnElMuro({
    W,
    H,
    N,
    fuera,
    nodos,
    conCamino: fina.conCamino,
    barreraDeNodo: grueso.barreraDeNodo,
    ciudades: new Set(enCiudad),
    casillasDeCiudades: [...ciudades, ...deRegion.map((c) => c.casilla)].map((c) => ({
      at: punto(c),
    })),
    azar: azarDelPoblado,
  });
  const villages: { name: string; at: Point }[] = [];
  const pueblosDelMuro: { name: string; k: number }[] = [];
  const sitiosSinPueblo: Point[] = [];
  /** El nombre del pueblo siguiente, en el orden en que se ponen. */
  const nombreDelPueblo = (): string =>
    nombre(NOMBRES_DE_PUEBLO, villages.length + pueblosDelMuro.length);
  for (const r of fuera) {
    const par = colocarPar(r, true);
    if (par === null) return fallo('objetos', 'no hay sitio para los pueblos');
    const delMuro = pasosConPueblo.get(r);
    if (delMuro !== undefined) {
      for (const k of delMuro) pueblosDelMuro.push({ name: nombreDelPueblo(), k });
      sitiosSinPueblo.push(...par);
      continue;
    }
    villages.push({ name: nombreDelPueblo(), at: par[0] });
    villages.push({ name: nombreDelPueblo(), at: par[1] });
  }
  const enUnPueblo = new Set(pueblosDelMuro.map((p) => p.k));

  const monstruosPosibles = MONSTRUOS_POSIBLES;
  const monsters: { at: Point; creature: string; count: number }[] = [];
  const parejasDeMonstruos = Math.floor((opts.monsterCount ?? 8) / 2);
  for (let i = 0; i < parejasDeMonstruos; i++) {
    const especie = rng.pick(monstruosPosibles);
    // El techo de los datos (`maxPorBando`) y no el tope de la partida: el mapa no
    // depende de él (misma semilla, mismo mapa); la partida lo recorta (`loNeutralAlTope`).
    const count = rng.int(3, LIDERAZGO.maxPorBando);
    const par = colocarPar(fuera[i % fuera.length] as number);
    if (par === null) return fallo('objetos', 'no hay sitio para los monstruos');
    monsters.push(
      { at: par[0], creature: especie, count },
      { at: par[1], creature: especie, count },
    );
  }

  const chests: { at: Point; gold: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const gold = rng.int(500, 2000);
    const par = colocarPar(fuera[(i + 1) % fuera.length] as number);
    if (par === null) return fallo('objetos', 'no hay sitio para los cofres');
    chests.push({ at: par[0], gold }, { at: par[1], gold });
  }

  // Un grupo de asaltantes en cada región de fuera, en espejo y con la misma
  // tropa: lo que se siembra en un lado se siembra en el otro, igual que los
  // pueblos. Las dos de casa (las semillas 0 y 1, de las que salen las bases) se
  // quedan sin, y las que TOCAN una base sí llevan, que es la corrección del
  // usuario al plan («No, también en casa»). Va después de todo lo demás para no mover ninguna otra casilla.
  // Una región llena se queda sin grupo en vez de tirar el intento: un mapa de
  // nodos bueno no se descarta por no caber un asaltante. Y una con dueño
  // también, con su pareja para no romper el espejo: la de fuera cuyo único
  // nodo es una base es de ese jugador desde el primer día, y un asaltante solo
  // vive en una región sin dueño (`problemasDeAsaltantes`). La red fina la da en
  // 24×24 (semillas 469 y 3481, #178), y el plan salía inválido.
  const raiders: RaiderPlaneado[] = [];
  for (let k = 2; k < semillas.length; k += 2) {
    const dueños = [alEmpezar.dueñoDeRegion[k], alEmpezar.dueñoDeRegion[parejaDe(k)]];
    if (dueños.some((d) => d !== null)) continue;
    const troops = rng.pick(ASALTANTES.composiciones);
    const par = colocarPar(k);
    if (par === null) continue;
    raiders.push({ at: par[0], troops }, { at: par[1], troops });
  }

  // 10. Los obstáculos, con todo lo demás ya puesto: no caen sobre nada, no
  //     tocan la frontera y no dejan nada sin alcanzar desde los nodos.
  const vetadas = new Uint8Array(N);
  for (const i of ocupadas) vetadas[i] = 1;
  for (const r of regionsGruesas) vetadas[indice(r.at)] = 1;
  for (let i = 0; i < N; i++)
    if (junto[i] === 1 || pasillo[i] === 1 || enUnRecinto[i] === 1 || enUnAcceso[i] === 1)
      vetadas[i] = 1;
  const monstruos = new Uint8Array(N);
  for (const m of monsters) monstruos[indice(m.at)] = 1;
  // Los pueblos, por índice: los leen los obstáculos y el trazado. Los obstáculos,
  // también con el sitio de dentro de los que se mudaron al muro, que no cruzan,
  // como antes de mudarse.
  const pueblos = villages.map((o) => indice(o.at));
  const conPuertaParaLosObstaculos = [...pueblos, ...sitiosSinPueblo.map(indice)];
  // Los nodos de cada región, con cada ciudad en su casilla: el índice de un
  // nodo de la red gruesa es el de `nodos`.
  const nodosDeRegion = redGruesa.regiones.map((reg) => reg.nodos.map((n) => nodos[n] as number));
  // Y para los obstáculos, de una ciudad no su casilla sino los accesos de sus
  // puertas en la región, que es por donde se entra en ella: lo de dentro del
  // recinto no se pisa, así que no cuenta para ninguna región.
  const regionSinRecintos = regionDelVestido();
  for (let i = 0; i < N; i++) if (enUnRecinto[i] === 1) regionSinRecintos[i] = -1;
  const accesosDeRegion: number[][] = semillas.map(() => []);
  for (const { puertas } of puertasDelVestido().puertas)
    for (const p of puertas)
      for (const a of p.accesos)
        accesosDeRegion[regionSinRecintos[indice(a)] as number]?.push(indice(a));
  const nodosParaLosObstaculos = nodosDeRegion.map((ns, r) => [
    ...ns.filter((n) => !ciudades.includes(n)),
    ...(accesosDeRegion[r] ?? []),
  ]);
  // La puerta de cada pueblo no lleva obstáculo, salvo en la
  // segunda tanda de `trazarYVestir`: en un 24×24 la casilla de cada puerta le
  // quita a una región apretada justo lo que le faltaba. Un obstáculo en la
  // puerta deja entrar por otro lado, que lo cobra el trazado.
  if (guardarPuertas) for (const i of anteLaPuerta) vetadas[i] = 1;
  // Lo que era frontera: la esquina torcida que se abre después es de ella,
  // nunca un obstáculo (cambiaría la densidad de la región).
  const antesDeLosObstaculos = Int8Array.from(tipos);
  const caben = ponerObstaculos({
    W,
    H,
    tipos,
    regionDe: regionSinRecintos,
    regiones: semillas.length,
    suelos,
    nodosDeRegion: nodosParaLosObstaculos,
    vetadas,
    monstruos,
    puertas: conPuertaParaLosObstaculos,
    rng,
  });
  if (!caben) {
    return fallo('obstáculos', 'alguna región no llega a la densidad mínima de obstáculos');
  }

  const ciudadesEnNodo = new Set([b0, b1, ...neutrales]);

  // 11. Los caminos: radiales desde el centro de cada región a sus pueblos y
  //     los nodos que le tocan en el reparto de la red.
  const objetivos = fina.conCamino.map((ks) => ks.map((k) => nodos[k] as number));
  for (const i of pueblos) objetivos[regionGruesa[i] as number]?.push(i);
  // Y cada ciudad, de cada región que llega a ella por una puerta de su
  // recinto (fase 2): hay puerta donde llega un camino (decisión del usuario,
  // 21-10-2026), y sin camino la región se quedaría sin la ciudad. La regla de
  // un cruce con camino por pareja (`crucesConCamino`) queda para los nodos.
  // La puerta del río no lo pide: el puente es su camino.
  {
    // La de mitad de una región no: es su centro (`centros`), de donde salen
    // sus radios.
    const regionV = regionDelVestido();
    const esCentro = new Set(deRegion.map((c) => c.casilla));
    for (const { at, puertas } of puertasDelVestido().puertas) {
      if (esCentro.has(indice(at))) continue;
      for (const p of puertas) {
        if (p.delRio) continue;
        for (const a of p.accesos) {
          const lista = objetivos[regionV[indice(a)] as number];
          if (lista !== undefined && !lista.includes(indice(at))) lista.push(indice(at));
        }
      }
    }
  }
  // El nivel de cada casilla como lo pintará la escena, con los nodos que
  // llevarán camino al bajo (`crucesConCamino`): la búsqueda no pasa por una
  // silla ni baja en diagonal si tiene otro sitio (#224).
  const esNodoDeLaRed = new Uint8Array(N);
  for (const n of nodos) esNodoDeLaRed[n] = 1;
  const alBajoAlTrazar = new Set([
    ...ciudades,
    ...fina.conCamino.flat().map((k) => nodos[k] as number),
  ]);
  const nivelAlTrazar = () =>
    nivelesDeLoEngordado(
      W,
      H,
      tipos,
      regionGruesa,
      esNodoDeLaRed,
      niveles,
      nodos,
      grueso.barreraDeNodo,
      alBajoAlTrazar,
      new Set(ciudades),
    );
  // A las ciudades se llega por las puertas de su recinto (`recinto.ts`), las
  // que pueden llevar un camino: el trazado las mira con la regla del héroe.
  const entradaDeCaminos = (nivel: ArrayLike<number>): EntradaDeCaminos => ({
    W,
    H,
    tipos,
    regionDe: regionDelVestido(),
    regiones: semillas.length,
    suelos,
    nodosDeRegion,
    objetivos,
    puertas: pueblos,
    monstruos,
    ocupadas,
    nivel,
    puentes: puentesDeLaRed,
    vados,
    recintos: puertasDelVestido().pasos,
    abiertas,
    centros: new Map(deRegion.map((c) => [c.region, c.casilla])),
  });
  const trazar = (nivel: ArrayLike<number>) => trazarCaminos(entradaDeCaminos(nivel));
  const puentesDeLaRed = new Set(
    nodos.filter((_n, k) => !ciudadesEnNodo.has(k) && grueso.barreraDeNodo[k] === 'water'),
  );
  // Los vados del río: los puentes de sus ciudades-puente. Junto a ellos la
  // senda puede cortar la esquina del río, para llegar al puente desde la
  // orilla de enfrente en diagonal si de frente no hay tierra. Era el vado de
  // la ciudad en el río, a la que llegaban en diagonal las dos regiones de su
  // orilla (sin él, 0,1 ciudades-puente por mapa en 1-40 y el triple de
  // vestidos tirados); con la ciudad en tierra, esas entran por sus puertas.
  const vados = abiertas;
  let nivelDelTrazado = nivelAlTrazar();
  const primero = trazar(nivelDelTrazado);
  // Una región que el recinto de una ciudad deja partida no tiene por dónde
  // trazar (`trazarCaminos` dice por qué): ese vestido no vale.
  if (typeof primero === 'string') return fallo('objetos', primero);
  let trazado: [number, number][] = primero;
  // Lo que la búsqueda no pudo evitar —la región que toca un nodo o una ciudad
  // solo por un vértice— se endereza abriendo esa esquina a la región, y se
  // vuelve a trazar (`abrirEsquinasTorcidas`).
  // Lo que entra en un recinto o cruza el puente de una ciudad-puente no se
  // mira torcido: lo pinta la muralla, o es el puente.
  const conRecinto = (i: number): boolean => enUnRecinto[i] === 1 || abiertas.has(i);
  for (let vuelta = 0; vuelta < VUELTAS_DE_ESQUINAS; vuelta++) {
    const abiertasAhora = abrirEsquinasTorcidas({
      W,
      H,
      tipos,
      regionDe: regionGruesa,
      nodos: new Set(nodos),
      nivel: nivelDelTrazado,
      niveles,
      puentes: puentesDeLaRed,
      deFrontera: (i) => antesDeLosObstaculos[i] !== ABIERTA,
      barreraDeNodo: new Map(
        nodos.flatMap((n, k) =>
          ciudadesEnNodo.has(k) ? [] : [[n, grueso.barreraDeNodo[k] as Barrera] as const],
        ),
      ),
      ciudades,
      admiteUnaMas: (r) => {
        // La densidad de obstáculos de la región, como la mide quien la audita:
        // lo que puso `ponerObstaculos` sobre lo que se pisa más eso.
        let obstaculos = 0;
        let pisables = 0;
        for (let i = 0; i < N; i++) {
          if (regionGruesa[i] !== r) continue;
          if (tipos[i] === ABIERTA) pisables++;
          else if (antesDeLosObstaculos[i] === ABIERTA) obstaculos++;
        }
        return (
          obstaculos * 100 >= BARRERAS_DEL_MAPA.densidadPorCiento.min * (pisables + obstaculos + 1)
        );
      },
      tramos: trazado.filter(([p, q]) => !conRecinto(p) && !conRecinto(q)),
    });
    if (abiertasAhora === 0) break;
    nivelDelTrazado = nivelAlTrazar();
    const otro = trazar(nivelDelTrazado);
    if (typeof otro === 'string') return fallo('objetos', otro);
    trazado = otro;
  }
  const tramos = trazado.map(([p, q]): TramoDeCamino => [punto(p), punto(q)]);

  // Ninguna senda dobla en diagonal la esquina de un recinto por fuera: se
  // pintaría sobre la torre de su vértice. La búsqueda lo cobra como un veto;
  // si queda, es que no había otro camino, y el vestido no vale.
  for (const [p, q] of trazado) {
    if (enUnRecinto[p] === 1 || enUnRecinto[q] === 1) continue;
    const px = p % W;
    const qx = q % W;
    if (px === qx || p - px === q - qx) continue;
    if (enUnRecinto[p - px + qx] === 1 || enUnRecinto[q - qx + px] === 1)
      return fallo(
        'obstáculos',
        `la senda de (${px},${Math.floor(p / W)}) a (${qx},${Math.floor(q / W)}) dobla en diagonal la esquina de un recinto`,
      );
  }
  // Y ninguna senda corta en diagonal la esquina de una casilla de agua, salvo
  // la que llega a un puente (#210): esas esquinas pasan a montaña.
  sinAguaEnLasEsquinas(W, H, tipos, trazado, puentesDeLaRed, nodosDeLaRed);
  // La esquina del río no se pasa a montaña (`ponerTipo`): si una senda aún la
  // corta, el vestido no vale. La búsqueda lo cobra como un veto, así que solo
  // queda donde no había otro camino. Junto a un vado, sí.
  const [esquinaDelRio] = esquinasDeAgua(W, (i) => esDelRio(tipos, i), trazado, vados);
  if (esquinaDelRio !== undefined)
    return fallo(
      'obstáculos',
      `una senda corta en diagonal la esquina del río en (${esquinaDelRio % W},${Math.floor(esquinaDelRio / W)})`,
    );
  // Lo que queda torcido es de una región que toca el nodo solo por un vértice
  // y no se puede abrir, o la esquina de agua que acaba de pasar a montaña y
  // sube (s110 (16,1)). Una silla, o un paso al que se baja en diagonal o por
  // la esquina de la meseta: el vestido no vale (#224). La bajada a una ciudad
  // sí, salvo por una silla: donde se juntan tres regiones o más, solo una le
  // llega en cruz, porque dos casillas de regiones distintas no se tocan ni por
  // un vértice (`soloPorUnVertice`, en `niveles.ts`). Los puentes, fuera: el
  // puente es su paso.
  // Por el recinto de una ciudad y el puente de una ciudad-puente, igual: lo de
  // dentro lo tapa la muralla y no se mira, y lo que llega a una puerta solo
  // no puede ser una silla.
  for (const { tramo, como } of tramosTorcidos(W, H, nivelAlTrazar(), trazado)) {
    const [p, q] = tramo;
    if (puentesDeLaRed.has(p) || puentesDeLaRed.has(q)) continue;
    if (conRecinto(p) && conRecinto(q)) continue;
    if (como !== 'silla' && (conRecinto(p) || conRecinto(q))) continue;
    const [a, b] = [punto(p), punto(q)];
    return fallo(
      'obstáculos',
      `la senda de (${a.x},${a.y}) a (${b.x},${b.y}) ${COMO_VA_TORCIDA[como]} y no hay esquina que abrir`,
    );
  }
  // Si con eso el agua de la frontera se queda sin las casillas de una barrera
  // garantizada, el vestido no vale: el mapa perdería una de sus
  // `TIPOS_POR_MAPA` (s164: el agua de 15 a 14).
  // El agua que pasa a montaña junto a un nodo puede ganarle a la barrera que
  // guarda, que se eligió por lo que más se veía alrededor (`queCruzaElNodo`):
  // con los empates que deja el acantilado en línea (#215) pasaba (s52 node-9).
  const vecindadDelMapa = vecindad(W, H);
  const vecinasDe = (n: number): number[] => [
    ...vecindadDelMapa.vecinas.subarray(vecindadDelMapa.desde[n], vecindadDelMapa.desde[n + 1]),
  ];
  for (const [k, n] of nodos.entries()) {
    const suya = grueso.barreraDeNodo[k] as Barrera;
    if (ciudadesEnNodo.has(k) || suya === 'mountain') continue;
    const veces = (b: Barrera) =>
      vecinasDe(n).filter((j) => !nodosDeLaRed.has(j) && barreraDe(tipos, j) === b).length;
    if (veces('mountain') > veces(suya))
      return fallo(
        'obstáculos',
        `el agua de las esquinas deja el nodo de (${n % W},${Math.floor(n / W)}) con más montaña alrededor que ${suya}, la barrera que cruza`,
      );
  }
  // Un puente se cruza de una orilla a la de enfrente (#161): con dos casillas
  // que se pisan a sus lados, en recta o en diagonal. Las esquinas de agua y
  // los obstáculos le podían quitar la segunda, y con las fronteras onduladas
  // de #229 la senda llegaba al puente en diagonal entre dos aguas y se pintaba
  // sobre el agua (42×42 s37 (16,14); antes, 0 en 1-80).
  const seCruza = (n: number, dx: number, dy: number): boolean => {
    const x = (n % W) + dx;
    const y = Math.floor(n / W) + dy;
    return x >= 0 && y >= 0 && x < W && y < H && barreraDe(tipos, y * W + x) === null;
  };
  for (const [k, n] of nodos.entries()) {
    if (grueso.barreraDeNodo[k] !== 'water' || ciudadesEnNodo.has(k)) continue;
    const ejes = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ] as const;
    if (!ejes.some(([dx, dy]) => seCruza(n, dx, dy) && seCruza(n, -dx, -dy)))
      return fallo(
        'obstáculos',
        `el puente de (${n % W},${Math.floor(n / W)}) se queda sin dos orillas enfrentadas`,
      );
  }
  // Y el agua que pasó a montaña puede dejar un trozo de río que ya no toca lo
  // más bajo, que sube con su orilla: el acantilado de al lado se quedaría sin
  // caída (#215, s148 (12,2)).
  const conCaminoAhora = new Set(nodos.filter((n) => trazado.some(([p, q]) => p === n || q === n)));
  const sinCaida = acantiladoSinCaida({
    W,
    H,
    tipos,
    regionDe: regionGruesa,
    nodos,
    barreraDeNodo: grueso.barreraDeNodo,
    niveles,
    alBajo: new Set([...ciudades, ...conCaminoAhora]),
    ciudades: new Set(ciudades),
  });
  if (sinCaida !== null) return fallo('obstáculos', sinCaida);
  // Y ninguna caída al sur de `CAIDA_LARGA` casillas seguidas (#231). El
  // engorde las parte (`quebrarCaidas`), pero no junto a un nodo, y el agua de
  // las esquinas que pasa a montaña sube y puede unir dos trozos (s232 (28-38,
  // 22)): ese vestido no vale. Son unos pocos mapas de cada mil.
  const nivelAlFinal = nivelesDeLoEngordado(
    W,
    H,
    tipos,
    regionGruesa,
    esNodoDeLaRed,
    niveles,
    nodos,
    grueso.barreraDeNodo,
    new Set([...ciudades, ...conCaminoAhora]),
    new Set(ciudades),
  );
  const [larga] = caidasLargas(W, H, nivelAlFinal);
  if (larga !== undefined)
    return fallo(
      'obstáculos',
      `la caída al sur de (${larga.desde}-${larga.desde + larga.largo - 1}, ${larga.y}) va recta ${larga.largo} casillas, y desde ${CAIDA_LARGA} se lee como un muro`,
    );
  // Ni una mesa: un trozo de barrera por encima de todo lo que toca (#216; s33
  // con #232). Un nodo se pisa salvo el puente, que es agua.
  const esPuente = new Set(puentesDeLaRed);
  const [mesa] = mesasDelRelieve(
    W,
    H,
    nivelAlFinal,
    (i) => (tipos[i] === ABIERTA || esNodoDeLaRed[i] === 1) && !esPuente.has(i),
  );
  if (mesa !== undefined)
    return fallo(
      'obstáculos',
      `la barrera de (${mesa % W},${Math.floor(mesa / W)}) queda por encima de todo lo que toca: una mesa`,
    );
  // Y cada nodo entra por un eje que sigue por tierra en cruz (#161): el
  // engorde lo protege para el eje que ve la red fina, pero una esquina torcida
  // que se abre a su región le puede dar otro y dejar la entrada que queda en
  // un bolsillo unido solo en diagonal (s37 (17,15) con #232, otro vestido).
  // Ese vestido no vale. El nodo sin dos vecinas opuestas de regiones
  // distintas (el ~1 %, casi todos junto al borde) se viste como siempre.
  const regionEn = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const i = y * W + x;
    return tipos[i] === ABIERTA && esNodoDeLaRed[i] === 0 ? (regionGruesa[i] as number) : -1;
  };
  for (const [k, n] of nodos.entries()) {
    if (ciudadesEnNodo.has(k)) continue;
    const x = n % W;
    const y = Math.floor(n / W);
    const sigue = (ex: number, ey: number): boolean =>
      [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ].some(
        ([dx, dy]) =>
          !(ex + dx! === x && ey + dy! === y) && regionEn(ex + dx!, ey + dy!) === regionEn(ex, ey),
      );
    const ejes = (
      [
        [0, 1],
        [1, 0],
        [1, -1],
        [1, 1],
      ] as const
    ).filter(([dx, dy]) => {
      const a = regionEn(x + dx, y + dy);
      const b = regionEn(x - dx, y - dy);
      return a >= 0 && b >= 0 && a !== b;
    });
    if (ejes.length > 0 && !ejes.some(([dx, dy]) => sigue(x + dx, y + dy) && sigue(x - dx, y - dy)))
      return fallo(
        'obstáculos',
        `el nodo de (${x},${y}) no tiene un eje cuyas dos entradas sigan por tierra en cruz`,
      );
  }
  // Y cada muralla, el cierre de un paso (#232): el engorde la deja entre sus
  // dos apoyos, pero una esquina torcida que se abre a su región puede llevarse
  // el apoyo de un lado (s178 (4,28)). Ese vestido no vale.
  const [malaMuralla] = murallasDeLaRejilla(
    W,
    H,
    (i) => barreraDe(tipos, i) ?? 'grass',
    nodos,
    nodos.filter((_n, k) => !ciudadesEnNodo.has(k) && grueso.barreraDeNodo[k] === 'wall'),
    ciudades,
  ).filter((m) => m.sinApoyo.length > 0);
  if (malaMuralla !== undefined)
    return fallo('obstáculos', `una muralla no cierra su paso: ${malaMuralla.sinApoyo[0]}`);
  // Las barreras garantizadas, otra vez, sobre la frontera de después: las
  // esquinas de agua pasan agua a montaña y las esquinas torcidas abren
  // frontera a su región. Con las fronteras onduladas de #229, un acantilado
  // se quedaba en 13-14 casillas (42×42 s115 y s864) y el mapa con tres.
  const { casillasMinimasPorTipo } = BARRERAS_DEL_MAPA;
  // `tipos` es el de `grueso`, que los obstáculos y las esquinas cambian en su
  // sitio: lo de antes se apuntó al sacar la frontera.
  const cuenta = (leer: (k: number) => Barrera | null): Map<Barrera, number> => {
    const m = new Map<Barrera, number>();
    for (let k = 0; k < deFrontera.length; k++) {
      const b = leer(k);
      if (b !== null) m.set(b, (m.get(b) ?? 0) + 1);
    }
    return m;
  };
  const llenas = (m: Map<Barrera, number>): Barrera[] =>
    [...m].filter(([b, n]) => n >= casillasMinimasDe(b)).map(([b]) => b);
  const antes = llenas(cuenta((k) => fronteraAntes[k] ?? null));
  const despues = cuenta((k) => barreraDe(tipos, deFrontera[k] as number));
  if (llenas(despues).length < Math.min(antes.length, TIPOS_POR_MAPA)) {
    const cortas = antes
      .filter((b) => (despues.get(b) ?? 0) < casillasMinimasDe(b))
      .map((b) => `${b} en ${despues.get(b) ?? 0}`);
    return fallo(
      'obstáculos',
      `las esquinas que se abren o se cierran dejan la frontera con ${llenas(despues).length} barreras de ${casillasMinimasPorTipo} casillas, y cada mapa lleva ${TIPOS_POR_MAPA}; se quedan cortas ${cortas.join(', ')}`,
    );
  }

  // Y el río, entero (`rioEntero`): nada lo escribe salvo como agua
  // (`ponerTipo`), así que partido es un fallo del generador, no del vestido.
  const roto = rioEntero(fina.rio, (i) => barreraDe(tipos, i) === 'water');
  if (roto !== null) throw new Error(`el generador ha partido el río: ${roto}`);

  // Los muros, por tramos de fila del mismo tipo: frontera y obstáculos juntos.
  // Las casillas de nodo van dentro del tramo y `buildMap` las abre: es la
  // regla declarada, y así el muro se lee entero. Bajo un nodo va la barrera
  // que cruza (`barreraDeNodo`), que `buildMap` guarda al abrirlo; la de su
  // muro fino podía ser de otra pareja. Bajo una ciudad, la de siempre.
  const bajoElNodo = new Map(
    nodos.flatMap((n, k) =>
      ciudadesEnNodo.has(k) ? [] : [[n, grueso.barreraDeNodo[k] as Barrera] as const],
    ),
  );
  // El puente de una ciudad-puente, sin muro: es tierra de la orilla de
  // enfrente, y su suelo lo pinta `buildMap` con el de su región.
  const muroEn = (i: number): Barrera | null =>
    abiertas.has(i) ? null : (bajoElNodo.get(i) ?? barreraDe(tipos, i));
  const walls: PlannedWall[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const terrain = muroEn(y * W + x);
      if (terrain === null) continue;
      let fin = x;
      while (fin + 1 < W && muroEn(y * W + fin + 1) === terrain) fin++;
      walls.push({ terrain, from: { x, y }, to: { x: fin, y } });
      x = fin;
    }
  }

  // Cada ciudad neutral, de la facción del bando que la tiene más cerca.
  const en = (k: number): Point => punto(nodos[k] as number);
  const towns: PlannedTown[] = [
    { id: 'town-0', name: 'Valdeluz', faction: f0, at: en(b0), owner: 0 },
    { id: 'town-1', name: 'Cripta Gris', faction: f1, at: en(b1), owner: 1 },
    ...neutrales.map((c, i) => ({
      id: `town-${i + 2}`,
      name: nombre(NOMBRES_DE_CIUDAD, i),
      faction: (d0.get(c) ?? 99) <= (d1.get(c) ?? 99) ? f0 : f1,
      at: en(c),
      owner: null,
    })),
    // Las de mitad de una región, sin dueño: son de quien tenga su región. Con
    // la facción del bando que tiene su región más cerca (los saltos a su nodo
    // más cercano), como las del muro.
    ...deRegion.map(({ casilla, region }, i) => ({
      id: `town-${neutrales.length + i + 2}`,
      name: nombre(NOMBRES_DE_CIUDAD, neutrales.length + i),
      faction: saltosALaRegion(red, d0, region) <= saltosALaRegion(red, d1, region) ? f0 : f1,
      at: punto(casilla),
      owner: null,
    })),
  ];

  const plan: PlanConTramos = {
    width: W,
    height: H,
    baseTerrain: 'grass',
    patches: [],
    // Con su suelo entero, que `buildMap` pinta casilla a casilla.
    regions: regionsGruesas.map((r, k) => ({ ...r, terrain: suelos[k] as Suelo })),
    walls,
    nodes: nodos.flatMap((_, k) => (ciudadesEnNodo.has(k) || enUnPueblo.has(k) ? [] : [en(k)])),
    towns,
    // Los del muro, en la casilla de su nodo, sobre la barrera que cruza
    // (`bajoElNodo`): `buildMap` la abre y la guarda en el pueblo.
    villages: [...villages, ...pueblosDelMuro.map(({ name, k }) => ({ name, at: en(k) }))],
    monsters,
    chests,
    raiders,
    tramos,
  };
  // Y lo que la puerta de los planes dirá de los recintos, sobre el mapa hecho:
  // la orilla de una ciudad-puente sale de sus regiones de verdad, que las
  // esquinas abiertas y los obstáculos aún podían mover. Lo que rechace se tira
  // aquí, como otro vestido, y no llega a `validadoPorLaPuerta`, que lanzaría.
  const { map: hecho } = buildMap(plan);
  const [deRed] = problemasDeRed(hecho);
  if (deRed !== undefined) return fallo('objetos', deRed);
  // Con la ciudad-puente en tierra, su puente es tierra de la orilla de
  // enfrente, y la barrera de su orilla que lo toca (la de la T, bajo la puerta
  // del río) toca también esa región, que puede ir a otro nivel.
  const [deNiveles] = problemasDeNiveles(hecho);
  if (deNiveles !== undefined) return fallo('objetos', deNiveles);
  const redHecha = estructura(hecho);
  const [recinto] = problemasDeRecintos(
    hecho,
    redHecha,
    towns,
    raiders.map((r) => ({ quien: 'el grupo de asaltantes', at: r.at })),
  );
  if (recinto !== undefined) return fallo('objetos', recinto);
  // Y la red del mapa hecho es la que se planeó: cada ciudad, entre las
  // regiones de su cruce, ahora por las puertas de su recinto.
  for (const [j, k] of enCiudad.entries()) {
    const planeadas = (redGruesa.nodos[k]?.regiones ?? []).join();
    const id = towns[j]?.id as string;
    const hechas = (redHecha.nodos[redHecha.nodoPorId.get(id) as number]?.regiones ?? []).join();
    if (planeadas !== hechas)
      return fallo(
        'objetos',
        `la ciudad ${id} toca en el mapa hecho las regiones ${hechas}, y la red planeaba ${planeadas}`,
      );
  }
  // Y cada pueblo del muro, un nodo entre las regiones del suyo en la red.
  for (const [j, { k }] of pueblosDelMuro.entries()) {
    const id = idDePueblo(villages.length + j);
    const planeadas = (redGruesa.nodos[k]?.regiones ?? []).join();
    const n = redHecha.nodoPorId.get(id);
    const hechas =
      n === undefined ? 'ninguna (no es un nodo)' : (redHecha.nodos[n]?.regiones ?? []).join();
    if (planeadas !== hechas)
      return fallo(
        'objetos',
        `el pueblo ${id} iba en el nodo de las regiones ${planeadas} y en el mapa hecho toca ${hechas}`,
      );
  }
  // Y cada ciudad de mitad de una región, dentro de la suya: ni nodo ni de otra.
  for (const [j, { region }] of deRegion.entries()) {
    const id = towns[enCiudad.length + j]?.id as string;
    const hecha = redHecha.sitiosDeRegion.get(id);
    if (hecha !== region)
      return fallo(
        'objetos',
        `la ciudad ${id} iba en mitad de la región ${region} y en el mapa hecho ${hecha === undefined ? 'es un nodo' : `está en la ${hecha}`}`,
      );
  }
  return plan;
}

/**
 * Dónde va la ciudad del cruce `at`: ahí, salvo la ciudad-puente (#144), que en
 * la red está en el río y va en su orilla (`orillaDeLaCiudad`), en el medio de
 * su recinto, a dos casillas del río: `at + 2·(orilla − at)`. Su casilla del río
 * se queda como su puente (`rioAnteLaCiudad`).
 */
export function enSuOrilla(map: MapaDelRio, at: Point, regionDe: Int32Array): Point {
  const orilla = orillaDeLaCiudad(map, at, regionDe)?.orilla;
  return orilla === undefined ? at : { x: 2 * orilla.x - at.x, y: 2 * orilla.y - at.y };
}

/**
 * Abre a la región `r` un acceso de una puerta de la ciudad de `at`: la primera
 * casilla de barrera de los accesos de sus caras (`PUERTAS_DE_LA_CIUDAD`, en su
 * orden) que toca la región y nada más que la región —ni otra región, ni una
 * casilla de su muralla de otra región, ni el río, ni un nodo— y no está en el
 * borde. Es la que tapa el pasillo de una casilla por el que la región llega a
 * la ciudad de este a oeste: abierta, la región llega por la diagonal de ese
 * lado. No une nada (todo lo que se pisa alrededor es de `r`) y lo demás del
 * vestido lo miran después las comprobaciones de siempre (caídas, mesas, la
 * red). Devuelve si abrió alguna.
 */
function abrirUnAcceso(
  at: Point,
  r: number,
  tipos: Tipos,
  regionDe: Int32Array,
  W: number,
  H: number,
  /** Lo que `tipos` no dice: −2 en un nodo, la región del puente de una ciudad-puente, `null` en lo demás. */
  especial: (i: number) => number | null,
): boolean {
  for (const cara of ORDEN_DE_LAS_CARAS) {
    for (const [dx, dy] of PUERTAS_DE_LA_CIUDAD[cara].accesos) {
      const x = at.x + dx;
      const y = at.y + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const k = y * W + x;
      if (tipos[k] === ABIERTA || esDelRio(tipos, k)) continue;
      let toca = false;
      let otra = false;
      for (const [vx, vy] of VECINAS) {
        const j = (y + vy) * W + x + vx;
        const suya = especial(j);
        if (suya === null && tipos[j] !== ABIERTA) continue;
        const reg = suya ?? (regionDe[j] as number);
        if (reg === r) toca = true;
        else otra = true;
      }
      if (!toca || otra) continue;
      ponerTipo(tipos, k, ABIERTA);
      regionDe[k] = r;
      return true;
    }
  }
  return false;
}

/** El nivel de una pareja de regiones de suelo `suelo`, por los pesos de `data/relieve.json`. */
function sortearNivel(rng: Rng, suelo: Suelo): Nivel {
  return sortearPorPesos(rng, NIVEL_POR_SUELO[suelo], (p) => p.peso).nivel;
}
