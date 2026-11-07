/**
 * Los caminos del vestido: radiales dentro de cada región (#149), de su centro
 * (`centroDeRegion`) a sus nodos y pueblos, con el coste del héroe (`Busqueda`)
 * y colgados del árbol de la región (`ArbolDeCaminos`), que se guardan como
 * tramos (`trazarCaminos`, #153); y lo que tras trazarlos se corrige en la
 * rejilla: las esquinas de agua que corta una senda (`sinAguaEnLasEsquinas`,
 * #210) y las esquinas por las que se entra torcido en un nodo
 * (`abrirEsquinasTorcidas`, #224).
 *
 * Era parte de `map/vestir.ts` hasta la fase N de la reorganización
 * (07-11-2026).
 */
import { Frontera } from '../frontera.js';
import { espejoDe, parejaDe } from '../geometria.js';
import { aPunto } from '../map.js';
import { franjasDeBarrera, type PasoTorcido, pasoTorcido } from '../niveles.js';
import { rodeosParaEntrar } from '../puertas.js';
import { CIUDAD, FUERA, type PasosDelRecinto, PUERTA } from '../recinto.js';
import { vecindad } from '../regiones.js';
import {
  admiteLosNiveles,
  BARRERAS,
  type Barrera,
  costeDeEntrada,
  type Nivel,
  type Suelo,
  type TerrainKind,
} from '../terrain.js';
import {
  ABIERTA,
  barreraDe,
  esDelRio,
  indiceDe,
  ponerTipo,
  RIO_DE_LOS_TIPOS,
  separadasDeCerca,
  type Tipos,
} from './base.js';

export interface EntradaDeCaminos {
  readonly W: number;
  readonly H: number;
  readonly tipos: Tipos;
  readonly regionDe: Int32Array;
  readonly regiones: number;
  /** El suelo de cada región: el camino se busca con lo que cuesta andarlo. */
  readonly suelos: readonly Suelo[];
  /** Los nodos de cada región, por índice plano: se llega a ellos, no se cruzan. */
  readonly nodosDeRegion: readonly (readonly number[])[];
  /**
   * Adónde lleva camino cada región, por índice plano: los nodos que le tocan
   * en el reparto de la red (`crucesConCamino`) y sus pueblos.
   */
  readonly objetivos: readonly (readonly number[])[];
  /**
   * Los objetos con puerta —los pueblos—, por índice plano. Son hojas: se llega
   * a ellos y no se cruzan, y se entra por su puerta, la de debajo (#188,
   * `puertas.ts`).
   */
  readonly puertas: readonly number[];
  /**
   * Los recintos de las ciudades (`recinto.ts`), con sus puertas **posibles**:
   * el camino de una región llega a su ciudad de un acceso a una puerta suya y
   * de la puerta a la ciudad, y sale igual, como el héroe (`pasoPermitido`).
   * Lo demás del recinto no se traza. Las ciudades van en `nodosDeRegion`.
   */
  readonly recintos?: PasosDelRecinto;
  /**
   * Lo que se pisa aunque `tipos` diga barrera: el puente de cada ciudad-puente,
   * una casilla del río que es tierra de la orilla de enfrente
   * (`rioAnteLaCiudad`). Su región la dice `regionDe`.
   */
  readonly abiertas?: ReadonlySet<number>;
  readonly monstruos: Uint8Array;
  /** Lo ya puesto —nodos, inicios, objetos, asaltantes—: el centro no cae encima. */
  readonly ocupadas: ReadonlySet<number>;
  /**
   * El nivel de cada casilla como lo pintará la escena (`nivelesDelRelieve`,
   * por `nivelesDeLoEngordado`): la búsqueda no pasa por una silla ni cambia de
   * nivel en diagonal si tiene otro sitio (#224).
   */
  readonly nivel: ArrayLike<number>;
  /**
   * Los nodos de agua que no son ciudad: puentes. Su tramo no se mira torcido,
   * como el agua de las esquinas de #210: el puente es su paso, con su pieza
   * por eje y su vado, y la escena no le pone bajada.
   */
  readonly puentes: ReadonlySet<number>;
  /**
   * Las ciudades-puente: junto a ellas (sus ocho vecinas) la senda puede cortar
   * en diagonal una esquina del río, que es su vado. En ningún otro sitio.
   */
  readonly vados?: ReadonlySet<number>;
  /**
   * El centro fijo de una región, por su índice: la casilla de su ciudad cuando
   * va en mitad de ella (ciudades en su región, fase 2, 05-11-2026). Sus radios
   * salen de la ciudad por sus puertas, y la ciudad no es objetivo de su región.
   * Las regiones que no están aquí buscan el suyo (`centroDeRegion`).
   */
  readonly centros?: ReadonlyMap<number, number>;
}

/**
 * Cuántos pasos rectos de más cuesta trazar un camino por una casilla al pie de
 * una barrera que le queda al norte (#189). La escena pinta el relieve con la
 * cámara al sur: lo alto cuelga sobre la casilla de debajo —0,6 casillas por
 * nivel, más las diagonales de sus esquinas— y la senda que va pegada a ese pie
 * desaparece bajo la pared, que nunca se corta ni se aparta (CLAUDE.md, «el
 * relieve por celdas»). El núcleo no sabe qué quedará alto —el nivel de cada
 * región lo sortea la escena—, pero sí lo seguro: un **acantilado** va siempre
 * por encima de lo que pisa a su lado, salvo el cañón entre dos regiones al
 * mismo nivel, y tapaba la senda en el 55 % de las casillas de camino que tenían
 * uno al N, NO o NE (semillas 1-40, 08-10-2026). Una **montaña o un bosque**
 * toman el nivel de su lado alto (#180): tapan solo al lado bajo, un 15 %, y
 * cuestan uno. Al norte y no a los lados ni al sur: cobrar las ocho vecinas
 * medía peor (18,2 casillas tapadas por mapa frente a 17,0). Es un coste, no
 * una prohibición: un pasillo de una casilla al pie de un acantilado sigue
 * siendo el camino si no hay otro.
 */
const AL_PIE_DEL_ACANTILADO = 3;
/** Los pasos rectos de más de una silla entre dos casillas de una región (`cobroDelTorcido`). */
const SILLA = 2;
const AL_PIE_DE_LO_ALTO = 1;
/**
 * Y por una casilla del borde del mapa, que la escena pinta medio bajo las
 * nubes: un camino pegado a él parecía salirse del mapa (auditoría, defecto 7).
 * El grueso de esos caminos no venía de aquí sino de las puertas en el borde
 * (`colocarPar`, `generar/vestir-la-red.ts`); esto aparta el resto donde hay sitio.
 */
const POR_EL_BORDE = 2;

/**
 * Los pasos rectos de más que cuesta cada casilla de `casillas` al trazar
 * (`AL_PIE_DEL_ACANTILADO`, `AL_PIE_DE_LO_ALTO`, `POR_EL_BORDE`), sumados.
 */
function recargosDelTrazado(e: EntradaDeCaminos, casillas: readonly number[]): Uint8Array {
  const { W, H, tipos } = e;
  const recargo = new Uint8Array(W * H);
  const acantilado = BARRERAS.indexOf('cliff');
  const montana = BARRERAS.indexOf('mountain');
  const bosque = BARRERAS.indexOf('forest');
  for (const i of casillas) {
    const x = i % W;
    const y = (i - x) / W;
    let n = x === 0 || y === 0 || x === W - 1 || y === H - 1 ? POR_EL_BORDE : 0;
    let alto = 0;
    for (let dx = -1; y > 0 && dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= W) continue;
      const t = tipos[i - W + dx] as number;
      if (t === acantilado) alto = AL_PIE_DEL_ACANTILADO;
      else if (t === montana || t === bosque) alto = Math.max(alto, AL_PIE_DE_LO_ALTO);
    }
    n += alto;
    recargo[i] = n;
  }
  return recargo;
}

/** Los pasos torcidos, en el orden de la caché de `Busqueda.torcidoEn`. */
const TORCIDOS: readonly PasoTorcido[] = ['silla', 'diagonal', 'costado'];

/** Sin ciudades: todo fuera de un recinto. */
const SIN_RECINTOS = (N: number): PasosDelRecinto => ({
  rol: new Uint8Array(N),
  ciudadDe: new Int32Array(N).fill(-1),
  puertaDelAcceso: new Int32Array(N).fill(-1),
  delRecinto: [],
});

/**
 * El Dijkstra de una región con el coste del héroe: lo de `red` a mitad de
 * precio y un paso recto de más por arrimarse a ella viniendo de fuera.
 * Reutiliza `coste` y `previo` de una búsqueda a otra.
 *
 * **Un objeto con puerta se entra por delante** (#188, «como en el HoMM»): la
 * cámara mira desde el sur y la puerta del sprite está en su pie, así que se
 * llega desde la fila de debajo (`puertas.ts`). Entrar de lado cuesta `rodeo` y por detrás el
 * doble, más que cualquier camino sin monstruos: se entra por la mejor fila
 * que se alcance, que es un coste y no una prohibición, porque una ciudad es un
 * nodo y la región que solo la toca por detrás tiene que llegar por ahí. Salir
 * de un objeto con puerta, cuando es el origen (`centroDeRegion` busca desde
 * cada objetivo), cuesta lo mismo: el centro se elige con la cuenta con la que
 * luego se traza.
 */
class Busqueda {
  readonly coste: Int32Array;
  readonly previo: Int32Array;
  /** Las casillas de la región, en orden de índice. */
  readonly casillas: readonly number[];
  /** Los nodos de la región: se llega a ellos, no se cruzan. */
  private readonly nodo: Uint8Array;
  /** Los nodos y los objetos con puerta: las hojas del árbol (`ArbolDeCaminos`). */
  readonly hoja: Uint8Array;
  /** Los objetos con puerta, con un 1: se entran por delante. */
  private readonly puerta: Uint8Array;
  /** Los objetivos de la región (`EntradaDeCaminos.objetivos`): acaban todos en la red. */
  private readonly objetivo: Uint8Array;
  /**
   * Las vecinas de un objeto con puerta por las que se entraría de lado o por
   * detrás (`rodeosParaEntrar` de tres o más). Un radio que pasa por ellas rodea
   * el objeto por detrás o se le pega de lado, y la senda pintada se mete bajo
   * el sprite.
   */
  private readonly espalda: Uint8Array;
  /** Lo que cuesta de más trazar por cada casilla (`recargosDelTrazado`): el pie de lo alto y el borde. */
  private readonly recargo: Uint8Array;
  private readonly recto: number;
  private readonly diagonal: number;
  /** Más que cualquier camino sin monstruos dentro del mapa: lo que cuesta entrar de lado. */
  private readonly rodeo: number;
  private readonly pisarMonstruo: number;
  /** De cada estribo de un puente del río, la casilla desde la que se le llega (−1 si no es estribo). */
  private readonly antesDelEstribo: Int32Array;
  /** Si una casilla es de una ciudad-puente o una de sus ocho vecinas: el vado del río. */
  private readonly junto: (k: number) => boolean;
  /** Los recintos de las ciudades (`EntradaDeCaminos.recintos`). */
  private readonly rec: PasosDelRecinto;
  /** Las puertas de un recinto por las que entra esta región: las que tienen un acceso suyo. */
  private readonly suya: Uint8Array;
  /** Lo que se pisa de la región, con un 1: abierto (o el puente de una ciudad-puente) y fuera de todo recinto. */
  private readonly celda: Uint8Array;
  /**
   * `pasoTorcido` de cada arista de `vecindad`, por su posición: −1 sin mirar,
   * 0 recto, y 1 + su índice en `TORCIDOS`. El relieve no cambia mientras vive
   * la búsqueda y cada objetivo de la región la repite entera: con la ciudad
   * de objetivo en cada región que llega a ella (la ciudad amurallada, vuelta
   * 3, fase 2), mirarlo cada vez era el 5 % de generar un mapa.
   */
  private readonly torcidos: Int8Array;

  constructor(
    private readonly e: EntradaDeCaminos,
    r: number,
  ) {
    const N = e.W * e.H;
    this.rec = e.recintos ?? SIN_RECINTOS(N);
    const { rol, puertaDelAcceso } = this.rec;
    this.celda = new Uint8Array(N);
    for (let i = 0; i < N; i++)
      if (e.regionDe[i] === r && e.tipos[i] === ABIERTA && rol[i] === FUERA) this.celda[i] = 1;
    for (const i of e.abiertas ?? [])
      if (e.regionDe[i] === r && rol[i] === FUERA) this.celda[i] = 1;
    this.suya = new Uint8Array(N);
    this.torcidos = new Int8Array(vecindad(e.W, e.H).vecinas.length).fill(-1);
    this.coste = new Int32Array(N);
    this.previo = new Int32Array(N);
    this.nodo = new Uint8Array(N);
    this.hoja = new Uint8Array(N);
    this.puerta = new Uint8Array(N);
    this.objetivo = new Uint8Array(N);
    for (const o of e.objetivos[r] ?? []) this.objetivo[o] = 1;
    for (const n of e.nodosDeRegion[r] ?? []) {
      this.nodo[n] = 1;
      this.hoja[n] = 1;
    }
    this.espalda = new Uint8Array(N);
    // El puente del río se entra de frente: a la casilla de cada estribo se
    // llega desde la siguiente en su eje. Si no, la senda dobla en L junto al
    // estribo, con el río en la esquina de dentro, y la escena, que redondea
    // la L, la pintaba sobre el agua (s8 (37,16)).
    this.antesDelEstribo = new Int32Array(N).fill(-1);
    const rio = RIO_DE_LOS_TIPOS.get(e.tipos)?.rio;
    for (const n of e.puentes) {
      if (rio === undefined || rio[n] !== 1) continue;
      const x = n % e.W;
      const paso = x > 0 && x < e.W - 1 && rio[n - 1] === 1 && rio[n + 1] === 1 ? e.W : 1;
      for (const s of [-1, 1]) {
        const estribo = n + s * paso;
        const antes = n + 2 * s * paso;
        if (antes >= 0 && antes < N && Math.abs((antes % e.W) - x) <= 2)
          this.antesDelEstribo[estribo] = antes;
      }
    }
    const { desde, vecinas } = vecindad(e.W, e.H);
    for (const p of e.puertas) {
      this.hoja[p] = 1;
      this.puerta[p] = 1;
      for (let k = desde[p]!; k < desde[p + 1]!; k++) {
        const v = vecinas[k]!;
        if (this.rodeosEntre(p, v) >= 3) this.espalda[v] = 1;
      }
    }
    const casillas: number[] = [];
    for (let i = 0; i < N; i++) {
      if (this.celda[i] === 1) casillas.push(i);
      // La puerta de un acceso de la región es suya; toda puerta, una hoja: se
      // llega a ella para seguir a la ciudad, y nunca hace de esquina.
      const pu = puertaDelAcceso[i] as number;
      if (pu >= 0 && this.celda[i] === 1) this.suya[pu] = 1;
      if (rol[i] === PUERTA) this.hoja[i] = 1;
    }
    this.casillas = casillas;
    this.recargo = recargosDelTrazado(e, casillas);
    const suelo = e.suelos[r] as Suelo;
    this.recto = costeDeEntrada(suelo, false, false);
    this.diagonal = costeDeEntrada(suelo, false, true);
    this.rodeo = N * this.diagonal;
    // Más que cualquier camino sin monstruos: se rodean si se puede. Pero
    // menos que entrar en un objeto de lado (`porDonde`).
    this.pisarMonstruo = 2 * this.rodeo;
    this.junto = juntoAUnPuente(e.W, e.vados ?? new Set());
  }

  /** Los rodeos de pasar entre el objeto con puerta `d` y su vecina `v` (`rodeosParaEntrar`). */
  private rodeosEntre(d: number, v: number): number {
    const W = this.e.W;
    return rodeosParaEntrar((v % W) - (d % W), (v - (v % W)) / W - (d - (d % W)) / W);
  }

  /**
   * Si el trazado de la región pasa de `a` a su vecina `j`. Fuera de los
   * recintos, a lo que se pisa de la región y a sus nodos (que se llegan y no
   * se cruzan). En un recinto, como el héroe (`pasoPermitido`) y solo por las
   * puertas de la región: de un acceso a su puerta, de la puerta a su ciudad
   * (si se llegó desde fuera) o a sus accesos (si se viene de la ciudad), y de
   * la ciudad a sus puertas.
   */
  private entra(a: number, j: number, deLaCiudad: boolean): boolean {
    const { rol, ciudadDe, puertaDelAcceso } = this.rec;
    const ra = rol[a];
    const rj = rol[j];
    if (ra === PUERTA)
      return deLaCiudad
        ? rj === FUERA && puertaDelAcceso[j] === a && this.celda[j] === 1
        : rj === CIUDAD && ciudadDe[a] === j;
    if (ra === CIUDAD) return rj === PUERTA && ciudadDe[j] === a && this.suya[j] === 1;
    if (rj === PUERTA) return puertaDelAcceso[a] === j && this.suya[j] === 1;
    if (rj !== FUERA) return false;
    return this.celda[j] === 1 || this.nodo[j] === 1;
  }

  /**
   * Lo que cuesta de más un paso torcido por el relieve (`pasoTorcido`, #224).
   * Cambiar de nivel en diagonal —solo se puede entre un nodo o una ciudad y
   * su región— cuesta más que cualquier entrada en cruz, también que entrar
   * en una ciudad por detrás (`porDonde`, cuatro rodeos): la rampa va de
   * frente o no va. Por un costado de la línea, menos que en diagonal y más
   * que de frente. Una silla junto a un nodo, igual que la diagonal: es su
   * entrada, y tiene otra o el vestido la endereza (`sinSillas`). Una silla
   * entre dos casillas de la región, `SILLA` rectos, como la esquina de agua
   * de #210: más que la vuelta por la L de una esquina, sin echar el camino al
   * borde por un vértice.
   */
  private torcidoEn(k: number, a: number, j: number): PasoTorcido | null {
    let t = this.torcidos[k] as number;
    if (t < 0) {
      const como = pasoTorcido(this.e.W, this.e.H, this.e.nivel, a, j);
      t = como === null ? 0 : 1 + TORCIDOS.indexOf(como);
      this.torcidos[k] = t;
    }
    return t === 0 ? null : (TORCIDOS[t - 1] as PasoTorcido);
  }

  private cobroDelTorcido(torcido: PasoTorcido, conNodo: boolean): number {
    if (torcido === 'costado') return 2 * this.rodeo;
    if (torcido === 'diagonal' || conNodo) return 5 * this.rodeo;
    return SILLA * this.recto;
  }

  /**
   * Desde `origen`. Con el `arbol` de la región, lo trazado (`red`) cuesta la
   * mitad y arrimarse (`pegada`: las casillas 8-vecinas de la red), un paso
   * recto más. Con `hasta`, se para al sacarlo: lo que se lee después es su
   * `previo`, que ya no cambia.
   */
  buscar(origen: number, arbol?: ArbolDeCaminos, hasta?: number): void {
    const red = arbol?.red;
    const pegada = arbol?.pegada;
    const { W, H, tipos, monstruos } = this.e;
    const { desde, vecinas } = vecindad(W, H);
    const { coste, previo, nodo, hoja, puerta, espalda, celda } = this;
    const { rol, ciudadDe } = this.rec;
    // Lo que cuesta pasar entre el objeto con puerta `d` y su vecina `v`: por
    // su puerta (la de debajo), nada;
    // por las diagonales de delante, un rodeo; de lado, tres; por detrás,
    // cuatro (`rodeosParaEntrar`). Pisar un monstruo (dos) va en medio: se
    // llega a la puerta por encima del guardia antes que por el costado, que es
    // como guarda un monstruo lo bueno.
    const porDonde = (d: number, v: number): number => this.rodeosEntre(d, v) * this.rodeo;
    // Cuántos rectos cuesta una hoja en la esquina de un paso en diagonal: un
    // nodo de la red, dos; un objeto con puerta, cuatro, y aunque todavía no
    // esté en la red, porque siempre acaba en ella (es objetivo de su región) y
    // la Y saldría al colgar después su ramal. Cuatro y no dos porque la L de
    // al lado suele pasar por el costado de otra (`espalda`, dos rectos más:
    // dos objetos con puerta vecinos, s195 (11,15)). El nodo que es objetivo y
    // aún no está en la red, también dos, por lo mismo: con las fronteras
    // onduladas de #229 un radio pasó en diagonal junto a un nodo que se colgó
    // después (42×42 s15 (1,21)-(2,22)).
    const { objetivo } = this;
    const yEnLaEsquina = (k: number): number =>
      puerta[k] !== 0 ? 4 : hoja[k] === 1 && (red?.[k] === 1 || objetivo[k] === 1) ? 2 : 0;
    const AGUA = indiceDe('water');
    const rio = RIO_DE_LOS_TIPOS.get(tipos)?.rio;
    coste.fill(-1);
    previo.fill(-1);
    const frontera = new Frontera(W * H);
    coste[origen] = 0;
    frontera.push(origen, 0);
    for (let sale = frontera.pop(); sale !== undefined; sale = frontera.pop()) {
      const a = sale.key;
      const hastaAqui = sale.cost;
      if (hastaAqui > (coste[a] as number)) continue;
      if (a === hasta) return;
      // Un nodo es final de tramo: se llega, no se cruza (llevaría a otra
      // región). Un pueblo se rodea (#188): el radio que sigue de
      // largo pasa por delante, porque el ramal ya es red a mitad de precio.
      // Antes de #153 eso daba radios paralelos y ciclos por adyacencia
      // (historia.md, «Caminos»); con tramos, no. Los obstáculos no parten
      // una región por un pueblo (`ponerObstaculos`), pero un monstruo al lado
      // de uno sí (s28, (13,3)): se cruza antes el monstruo, que es una figura
      // que se va, que el pueblo, que se queda; y el pueblo solo si no hay otra.
      if (nodo[a] === 1 && a !== origen) continue;
      // Más que la peor cuenta de puertas: salir de una por detrás y entrar en
      // otra por detrás, ocho rodeos.
      const cruza = puerta[a] !== 0 && a !== origen ? 10 * this.rodeo : 0;
      const x = a % W;
      const y = (a - x) / W;
      const enLaRed = red?.[a] === 1;
      // En el recinto de una ciudad (`recinto.ts`): de la puerta a la que se
      // llegó desde fuera solo se sigue a la ciudad, y a la que se llegó desde
      // la ciudad (o de la que se sale), a sus accesos. El camino entra por una
      // puerta y llega a la ciudad; no la usa de atajo entre dos accesos.
      const deLaCiudad = rol[a] === PUERTA && (a === origen || previo[a] === ciudadDe[a]);
      const fuera = rol[a] === FUERA;
      for (let k = desde[a]!; k < desde[a + 1]!; k++) {
        const j = vecinas[k]!;
        if (fuera && rol[j] === FUERA) {
          if (celda[j] === 0 && nodo[j] === 0) continue;
        } else if (!this.entra(a, j, deLaCiudad)) continue;
        const enDiagonal = j % W !== x && (j - (j % W)) / W !== y;
        let paso =
          monstruos[j] === 1 ? this.pisarMonstruo : enDiagonal ? this.diagonal : this.recto;
        if (red?.[j] === 1) paso = Math.floor(paso / 2);
        else {
          if (!enLaRed && pegada?.[j] === 1) paso += this.recto;
          paso += (this.recargo[j] as number) * this.recto;
        }
        paso += cruza;
        if (puerta[j] !== 0) paso += porDonde(j, a);
        // El estribo de un puente del río, de frente (`antesDelEstribo`), en
        // los dos sentidos: también se busca desde los objetivos.
        const { antesDelEstribo } = this;
        if (
          (antesDelEstribo[j] !== -1 && a !== antesDelEstribo[j] && !this.e.puentes.has(a)) ||
          (antesDelEstribo[a] !== -1 && j !== antesDelEstribo[a] && !this.e.puentes.has(j))
        )
          paso += 2 * this.recto;
        // Rodear por detrás o pegarse de lado cuesta dos rectos: por delante,
        // con el ramal ya trazado a mitad de precio, sale más barato.
        else if (espalda[j] === 1) paso += 2 * this.recto;
        if (a === origen && puerta[a] !== 0) paso += porDonde(a, j);
        // Pasar en diagonal junto a una hoja de la red —un nodo o un objeto con
        // puerta— sale en Y, y no se puede colgar en L de ella (`ArbolDeCaminos`). Se cobra y
        // no se prohíbe: a veces es el único paso (semilla 60), y sin él el
        // objetivo se queda sin camino. Cobra **dos** pasos rectos, más que la L
        // por la otra esquina: esa L son dos rectos y su segundo se arrima a la
        // red —toca el nodo—, así que paga uno más (tres rectos). Con uno solo,
        // diagonal y recto (~2,4) salía más barato que la L (3) y la Y se
        // quedaba (34×34, semillas 4310 y 4525, #179).
        // Cortar en diagonal la esquina de una casilla de agua pinta la senda
        // sobre el agua: la huella (0,32 de ancho) pasa por el vértice común y
        // entra en las dos esquinas (#210; 631 tramos así en 1-40, 117 con las
        // dos esquinas de agua). Cuesta dos rectos, como la Y: más que la L por
        // la esquina de tierra. Con un rodeo el camino se iba al borde del mapa
        // por no tocar un vértice de agua (3,25 tramos por el borde por mapa en
        // 1-20, techo 3). Lo que queda lo arregla `sinAguaEnLasEsquinas`.
        // A un nodo no se cobra: al puente se llega como sea (con su vado), y
        // la entrada en diagonal de los demás no tiene otra.
        if (enDiagonal && nodo[j] === 0 && nodo[a] === 0) {
          const jx = j % W;
          if (tipos[y * W + jx] === AGUA || tipos[j - jx + x] === AGUA) paso += 2 * this.recto;
        }
        // Y la esquina del río no se corta (#144, río continuo), tampoco al
        // entrar en un nodo (al puente se llega de frente): no hay pasada que
        // la pase a montaña (`ponerTipo`). Más que cualquier otro camino, como
        // un veto; si aun así no hay otro, el vestido no vale. Junto a una
        // ciudad-puente, sí: es su vado (`EntradaDeCaminos.vados`).
        if (enDiagonal && rio !== undefined) {
          const jx = j % W;
          const k1 = y * W + jx;
          const k2 = j - jx + x;
          if ((rio[k1] === 1 && !this.junto(k1)) || (rio[k2] === 1 && !this.junto(k2)))
            paso += 5 * this.rodeo;
        }
        // Ni el paso por un recinto (lo pinta su muralla) ni el del puente de
        // una ciudad-puente: son su entrada, como el puente de un nodo.
        const torcido =
          this.e.puentes.has(a) ||
          this.e.puentes.has(j) ||
          rol[a] !== FUERA ||
          rol[j] !== FUERA ||
          this.e.abiertas?.has(a) === true ||
          this.e.abiertas?.has(j) === true
            ? null
            : this.torcidoEn(k, a, j);
        if (torcido !== null) paso += this.cobroDelTorcido(torcido, nodo[a] === 1 || nodo[j] === 1);
        if (enDiagonal && red !== undefined) {
          const jx = j % W;
          const k1 = y * W + jx;
          const k2 = j - jx + x;
          const enY = Math.max(yEnLaEsquina(k1), yEnLaEsquina(k2));
          // La L va por la otra esquina, que puede estar al pie de lo alto o en
          // el borde y costar su recargo: la Y cobra también el mayor, o salía
          // más barata que esa L (s1 (32,5), en el borde; #189).
          if (enY > 0) {
            const recargo = Math.max(this.recargo[k1] as number, this.recargo[k2] as number);
            paso += (enY + recargo) * this.recto;
          }
          // La cuarta diagonal de una casilla dibuja un aspa: dos sendas rectas
          // que se cruzan, y se lee como trazado a regla (s2, (1,31): el centro
          // de la región en medio de tres objetos y un nodo, uno en cada
          // diagonal; 37 en 31 mapas de 1-1000, auditoría 3 §7). Seis pasos
          // rectos: más que la vuelta por la casilla de al lado, que la parte
          // en T, aunque esa casilla sea el costado de un objeto (`espalda`, dos
          // más) y la T pase por otro; con dos, como la Y, salían 5 aspas en
          // 1-1000 entre objetos con puerta (#188, s376 y s850).
          if (arbol?.cerrariaUnAspa(a, j) === true) paso += 6 * this.recto;
        }
        // Ni dobla en diagonal la esquina de un recinto por fuera, con su
        // muralla en la esquina del paso: la senda pintada pasaba por la torre
        // de ese vértice (s36 (19,37)-(18,38), junto a la de la cara del
        // sureste de town-5). Más que cualquier otro camino, como la esquina
        // del río; si aun así no hay otro, el vestido no vale.
        if (enDiagonal && fuera && rol[j] === FUERA) {
          const jx = j % W;
          if (rol[y * W + jx] !== FUERA || rol[j - jx + x] !== FUERA) paso += 5 * this.rodeo;
        }
        const c = hastaAqui + paso;
        if (coste[j] !== -1 && (coste[j] as number) <= c) continue;
        coste[j] = c;
        previo[j] = a;
        frontera.push(j, c);
      }
    }
  }
}

/**
 * El centro de la región `r`: la casilla abierta y libre —sin monstruo ni nada
 * de `ocupadas`— que menos le cuesta al héroe sumando lo que hay hasta cada uno
 * de sus objetivos. Desempata el índice menor. Es un hecho derivado: el plan
 * guarda en `regions[].at` la semilla del Voronoi, que puede tener un monstruo
 * encima. `-1` si la región no lleva camino a nada.
 */
export function centroDeRegion(
  e: EntradaDeCaminos,
  r: number,
  b: Busqueda = new Busqueda(e, r),
): number {
  const centro = centroOMotivo(e, r, b);
  if (typeof centro === 'string') throw new Error(centro);
  return centro;
}

/**
 * `centroDeRegion`, o por qué no lo hay: un objetivo al que no se llega desde
 * otro, o ninguna casilla libre desde la que se llegue a todos. Con los recintos
 * de las ciudades (`recinto.ts`) pasa: la muralla no se pisa, y una región que
 * solo se unía por las casillas del 3 × 3 se queda partida (26×26, s108 y
 * s162). Es un vestido que no vale, y no un fallo de programa.
 */
function centroOMotivo(e: EntradaDeCaminos, r: number, b: Busqueda): number | string {
  const objetivos = e.objetivos[r] ?? [];
  const donde = (i: number) => `(${i % e.W},${Math.floor(i / e.W)})`;
  // La ciudad de mitad de la región es su centro: de ella salen los radios, por
  // sus puertas. Lo que no se alcanza desde ella deja la región sin caminos.
  const fijo = e.centros?.get(r);
  if (fijo !== undefined) {
    b.buscar(fijo);
    const suelto = objetivos.find((o) => (b.coste[o] as number) < 0);
    if (suelto !== undefined)
      return `en la región ${r} no se llega de su ciudad, en ${donde(fijo)}, a ${donde(suelto)}`;
    return fijo;
  }
  if (objetivos.length === 0) return -1;
  const suma = new Map<number, number>(b.casillas.map((i) => [i, 0]));
  for (const [k, o] of objetivos.entries()) {
    b.buscar(o);
    if (k === 0) {
      const suelto = objetivos.find((p) => (b.coste[p] as number) < 0);
      if (suelto !== undefined)
        return `en la región ${r} no se llega de ${donde(o)} a ${donde(suelto)}`;
    }
    for (const [i, t] of suma) {
      const v = b.coste[i] as number;
      if (v < 0) suma.delete(i);
      else suma.set(i, t + v);
    }
  }
  let mejor = -1;
  for (const [i, t] of suma) {
    if (e.monstruos[i] === 1 || e.ocupadas.has(i)) continue;
    if (mejor === -1 || t < (suma.get(mejor) as number)) mejor = i;
  }
  if (mejor === -1)
    return `la región ${r} no tiene una casilla libre desde la que se llegue a todos sus objetivos: no hay dónde poner el centro de sus caminos`;
  return mejor;
}

/**
 * La red de caminos del mapa: **radial dentro de cada región** (decisión del
 * usuario, #149). Qué nodos lleva cada región lo decide antes la red
 * (`crucesConCamino`, en `generar/procedimental.ts`); aquí solo se trazan los radios.
 *
 * Por región:
 *
 * 1. Su centro (`centroDeRegion`).
 * 2. Los objetivos, del más cercano al centro al más lejano (desempata el
 *    índice). Para cada uno, un Dijkstra **desde el centro** en el que lo ya
 *    trazado cuesta la mitad —los radios comparten el tronco y se abren donde
 *    hace falta— y arrimarse a la red viniendo de fuera cuesta un paso recto
 *    más: si no, un radio nuevo corre pegado a uno viejo, y dos trazos
 *    paralelos a una casilla se leen como una calzada ancha (entre sus
 *    pasillos de senda queda una franja de 0,2 sin cubierta). Medido el
 *    07-10-2026 en las semillas 1-10, sin ese paso hay un 42 % más de trazos
 *    que se rozan sin tramo entre ellos (33,5 → 47,5 por mapa), el doble de
 *    calzadas anchas y de bloques 2×2, y más horquillas (#155).
 * 3. Se recorre el tramo hacia atrás hasta tocar la red, y sus casillas se
 *    cuelgan del árbol de la región (`ArbolDeCaminos`), que endereza en L las
 *    horquillas en diagonal al colgarlas.
 *
 * Devuelve los **tramos**, que son lo que se guarda y se pinta (#153): con
 * casillas, el pintor unía por adyacencia dos radios vecinos y dibujaba bucles
 * que nadie había trazado, y aquí había que comprobar lo dibujado y vestir otra
 * vez el mapa cuando un radio rozaba un nodo ajeno. Con tramos no hay nada que
 * comprobar.
 *
 * Un nodo es final de tramo, así que no hay tramo de paso a paso: cada nodo con
 * camino es una hoja de la red de su región. **Una ciudad o un pueblo
 * también, y se entra por su puerta** (#188): desde la fila de delante si se
 * alcanza (`Busqueda`); el radio que sigue de largo pasa por delante y el
 * objeto cuelga de él con un ramal de una casilla. El coste es el del héroe, así que
 * un camino va por donde se anda. **Rodea a los monstruos si puede, y si no,
 * pasa por encima**: un guardia que corta la región en dos deja cada mitad
 * alcanzable desde su nodo, pero el radio que va de una a la otra tiene que
 * pasar por él.
 *
 * Es un Dijkstra sobre la rejilla provisional del generador, no el del mapa: el
 * invariante que guarda que nadie llame a `findPath` fuera de `game.ts` es por
 * lo hostil de una partida, que aquí no existe todavía. Comparte con aquel la
 * `Frontera`, y con ella el desempate por orden de descubrimiento. No tira del
 * `rng`: cambiar los caminos no mueve nada más del mapa.
 *
 * Lanza si un objetivo no se alcanza ni pasando por monstruos: la red ya está
 * validada y los obstáculos no parten la región, así que sería un fallo de
 * programa, no un mapa raro.
 */
/** Si la casilla `k` es la de un puente o una de sus ocho vecinas: su río. */
const juntoAUnPuente =
  (W: number, puentes: ReadonlySet<number>) =>
  (k: number): boolean => {
    const kx = k % W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (kx + dx >= 0 && kx + dx < W && puentes.has(k + dy * W + dx)) return true;
    return false;
  };

/**
 * Las esquinas de agua que cortan en diagonal los tramos de `tramos`, por índice
 * plano. Ninguna si el trazado es bueno (#210): la huella de la senda (0,32 de
 * ancho) pasa por el vértice común y se pinta sobre el agua de las dos esquinas.
 * Sin las del puente (`puentes`): el tramo que llega a él y el agua pegada a su
 * casilla, que es su río; ahí la senda llega por tierra a los estribos y la
 * escena pinta el vado (`Escena.vados`). Pasar ese agua a otra barrera dejaba
 * el puente rodeado de montaña (67 nodos de agua con más montaña que agua
 * alrededor en 1-200).
 */
export function esquinasDeAgua(
  W: number,
  esAgua: (i: number) => boolean,
  tramos: readonly (readonly [number, number])[],
  puentes: ReadonlySet<number>,
): number[] {
  const fuera: number[] = [];
  const junto = juntoAUnPuente(W, puentes);
  for (const [p, q] of tramos) {
    const px = p % W;
    const qx = q % W;
    if (px === qx || p - px === q - qx || puentes.has(p) || puentes.has(q)) continue;
    for (const k of [p - px + qx, q - qx + px]) if (esAgua(k) && !junto(k)) fuera.push(k);
  }
  return fuera;
}

/**
 * Pasa a montaña cada esquina de agua que una senda corta en diagonal (#210),
 * y su reflejo si también es agua: el mapa va en espejo. La búsqueda ya cobra
 * ese paso (`Busqueda`), así que lo que queda es sobre todo la entrada en
 * diagonal de un nodo o una ciudad entre dos barreras, o una región unida por
 * un vértice. Las dos
 * esquinas son barrera, así que nada se abre ni se parte; la montaña admite
 * cualquier pareja de niveles. Un nodo no se toca: su casilla la abre
 * `buildMap`.
 *
 * El reflejo no se pasa si parte el agua: si en su anillo de ocho vecinas el
 * agua (o un puente) va en dos trozos o más, esa casilla es todo el río por
 * ahí (el río de una casilla, #144, paso 2b) y ninguna senda la corta. Pasada a
 * montaña cortaba el río y dejaba dos regiones a dos pasos con una montaña de
 * una casilla en medio (s1 (19,24), el reflejo de la esquina de (22,17)). El
 * mapa deja de ir en espejo en esa casilla, que es menos que perder el río.
 */
export function sinAguaEnLasEsquinas(
  W: number,
  H: number,
  tipos: Tipos,
  tramos: readonly (readonly [number, number])[],
  puentes: ReadonlySet<number>,
  nodos: ReadonlySet<number>,
): void {
  const AGUA = indiceDe('water');
  const MONTAÑA = indiceDe('mountain');
  const N = W * H;
  const junto = juntoAUnPuente(W, puentes);
  const conAgua = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const j = y * W + x;
    return (tipos[j] === AGUA && !nodos.has(j)) || puentes.has(j);
  };
  const parteElAgua = (c: number): boolean => {
    const x = c % W;
    const y = (c - x) / W;
    const anillo = ANILLO.map(([dx, dy]) => conAgua(x + dx, y + dy));
    let cambios = 0;
    for (let v = 0; v < 8; v++) if (anillo[v] !== anillo[(v + 1) % 8]) cambios++;
    return cambios > 2;
  };
  for (const k of esquinasDeAgua(W, (i) => tipos[i] === AGUA && !nodos.has(i), tramos, puentes))
    for (const c of [k, espejoDe(k, N)]) {
      // El río no: la búsqueda no lo corta (`Busqueda`), y lo que quede lo
      // rechaza el generador.
      if (tipos[c] !== AGUA || nodos.has(c) || junto(c) || esDelRio(tipos, c)) continue;
      if (c !== k && parteElAgua(c)) continue;
      ponerTipo(tipos, c, MONTAÑA);
    }
}

/** Las ocho vecinas de una casilla en orden, dando la vuelta: su anillo. */
const ANILLO = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
] as const;

/**
 * Abre a su región la esquina de cada tramo que entra torcido en un nodo o una
 * ciudad (#224, `pasoTorcido`): en diagonal y cambiando de nivel, o por una
 * silla. La búsqueda ya los cobra (`cobroDelTorcido`), así que lo que queda es
 * la región que toca el nodo solo por un vértice. Abierta la esquina, la región
 * llega al nodo en cruz y la rampa baja de frente; quien llama vuelve a trazar.
 *
 * Una esquina se abre a la región `r` de la punta que no es nodo si es barrera,
 * no es nodo, todo lo que se pisa en sus ocho vecinas (sin los nodos) es de
 * `r` —si no, uniría dos regiones por un vértice— y abierta no queda por encima
 * de sus dos vecinas de un eje (`sinEspiga`, la regla de #210). Y en espejo: la
 * esquina reflejada, a la región reflejada, con la misma regla, o ninguna de
 * las dos. De las dos esquinas, la que deja la rampa de frente, con sus dos
 * costados (`pasoTorcido` del tramo nuevo), y si no, la otra.
 *
 * Es la forma con menos daño: no cambia la barrera de nada más, no toca las
 * otras regiones y la casilla abierta es de la meseta que ya llegaba al nodo.
 * Devuelve cuántas casillas abrió.
 */
export function abrirEsquinasTorcidas(e: {
  readonly W: number;
  readonly H: number;
  readonly tipos: Tipos;
  readonly regionDe: Int32Array;
  readonly nodos: ReadonlySet<number>;
  readonly nivel: ArrayLike<number>;
  /** El nivel de cada región: lo que se abre no deja una franja con niveles que no admite. */
  readonly niveles: readonly Nivel[];
  /** La barrera de cada nodo que no es ciudad: el de agua es puente, agua en la escena. */
  readonly puentes: ReadonlySet<number>;
  /** Las casillas que eran barrera de frontera antes de los obstáculos: un obstáculo no se abre. */
  readonly deFrontera: (i: number) => boolean;
  /** La barrera que cruza cada nodo que no es ciudad (`queCruzaElNodo`): tiene que seguir siendo la que más se ve. */
  readonly barreraDeNodo: ReadonlyMap<number, Barrera>;
  readonly ciudades: readonly number[];
  /** Si la región `r` admite una casilla más sin bajar de la densidad mínima de obstáculos. */
  readonly admiteUnaMas: (r: number) => boolean;
  readonly tramos: readonly (readonly [number, number])[];
}): number {
  const { W, H, tipos, regionDe, nodos } = e;
  const CORTADO = indiceDe('cliff');
  const N = W * H;
  const nivel = Int8Array.from(e.nivel);
  const { desde, vecinas } = vecindad(W, H);
  const abrible = (k: number, r: number): boolean => {
    if (tipos[k] === ABIERTA || nodos.has(k) || r < 0 || esquinaDeRegion(k, r) === k) return false;
    if (esDelRio(tipos, k)) return false;
    if (!e.deFrontera(k) || !e.admiteUnaMas(r) || !guardaLosNodos(k) || muerdeUnaPuerta(k))
      return false;
    if (separaDosRegiones(k, r) || parteLoQueNoEsRegion(k)) return false;
    for (let v = desde[k]!; v < desde[k + 1]!; v++) {
      const j = vecinas[v]!;
      if (tipos[j] === ABIERTA && !nodos.has(j) && regionDe[j] !== r) return false;
    }
    // Abierta va al nivel de `r`: no por encima de sus dos vecinas de un eje.
    const n = nivel[esquinaDeRegion(k, r)] as number;
    const x = k % W;
    if (x > 0 && x < W - 1 && (nivel[k - 1] as number) < n && (nivel[k + 1] as number) < n)
      return false;
    return !(k >= W && k < N - W && (nivel[k - W] as number) < n && (nivel[k + W] as number) < n);
  };
  // Cada nodo de al lado sigue viendo más de su barrera que de otra
  // (`queCruzaElNodo`, #145): la esquina que se abre es una menos de la suya.
  const guardaLosNodos = (k: number): boolean => {
    const quitada = barreraDe(tipos, k);
    for (let v = desde[k]!; v < desde[k + 1]!; v++) {
      const n = vecinas[v]!;
      const suya = e.barreraDeNodo.get(n);
      if (suya === undefined) continue;
      const veces = new Map<Barrera, number>();
      for (let w = desde[n]!; w < desde[n + 1]!; w++) {
        const j = vecinas[w]!;
        const b = j === k || nodos.has(j) ? null : barreraDe(tipos, j);
        if (b !== null) veces.set(b, (veces.get(b) ?? 0) + 1);
      }
      if (quitada !== suya) continue;
      for (const [b, c] of veces) if (b !== suya && c > (veces.get(suya) ?? 0)) return false;
    }
    return true;
  };
  // Lejos de los nodos, dos regiones a dos pasos solo con su línea en medio
  // (`engordarFronteras`, paso 7d, `separadasDeCerca`): la línea que se abre
  // puede ser la que separaba dos casillas de otro sitio.
  const cercaDeNodo = new Uint8Array(N);
  for (const n of nodos) {
    const nx = n % W;
    const ny = (n - nx) / W;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (nx + dx >= 0 && ny + dy >= 0 && nx + dx < W && ny + dy < H)
          cercaDeNodo[(ny + dy) * W + nx + dx] = 1;
  }
  const AGUA = indiceDe('water');
  const nivelDe = (i: number): number => e.niveles[regionDe[i] as number] as number;
  const separaDosRegiones = (k: number, r: number): boolean => {
    const kx = k % W;
    const ky = (k - kx) / W;
    // Lo que separa sin `k`: una línea que no es ella ni un nodo.
    const sinK = (m: number): boolean => m !== k && !nodos.has(m);
    // La propia `k`, abierta y lejos de un nodo (el reflejo puede estarlo).
    if (cercaDeNodo[k] === 0)
      for (let jy = ky - 2; jy <= ky + 2; jy++)
        for (let jx = kx - 2; jx <= kx + 2; jx++) {
          if (jx < 0 || jy < 0 || jx >= W || jy >= H) continue;
          const j = jy * W + jx;
          if (tipos[j] !== ABIERTA || nodos.has(j) || cercaDeNodo[j] === 1 || regionDe[j] === r)
            continue;
          const nivelR = e.niveles[r] as number;
          if (!separadasDeCerca(W, H, tipos, nivel, k, j, nivelR, nivelDe(j), sinK)) return true;
        }
    if (tipos[k] !== CORTADO && tipos[k] !== AGUA) return false;
    const libre = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const j = y * W + x;
      return tipos[j] === ABIERTA && !nodos.has(j) && cercaDeNodo[j] === 0;
    };
    for (let iy = ky - 1; iy <= ky + 1; iy++)
      for (let ix = kx - 1; ix <= kx + 1; ix++) {
        if (!libre(ix, iy)) continue;
        const i = iy * W + ix;
        for (let jy = iy - 2; jy <= iy + 2; jy++)
          for (let jx = ix - 2; jx <= ix + 2; jx++) {
            if (!libre(jx, jy) || regionDe[jy * W + jx] === regionDe[i]) continue;
            const j = jy * W + jx;
            if (Math.max(Math.abs(jx - ix), Math.abs(jy - iy)) !== 2) continue;
            const pasaPorK =
              kx >= Math.max(ix, jx) - 1 &&
              kx <= Math.min(ix, jx) + 1 &&
              ky >= Math.max(iy, jy) - 1 &&
              ky <= Math.min(iy, jy) + 1;
            if (
              pasaPorK &&
              !separadasDeCerca(W, H, tipos, nivel, i, j, nivelDe(i), nivelDe(j), sinK)
            )
              return true;
          }
      }
    return false;
  };
  // Ni parte en dos lo que no es región (barreras y nodos, 8-conexo): un trozo
  // de frontera que se queda tocando una sola región pasa a contar como
  // obstáculo suyo y le sube la densidad (#132).
  const fueraDeRegion = (j: number): boolean => tipos[j] !== ABIERTA || nodos.has(j);
  const parteLoQueNoEsRegion = (k: number): boolean => {
    const lados: number[] = [];
    for (let v = desde[k]!; v < desde[k + 1]!; v++)
      if (fueraDeRegion(vecinas[v]!)) lados.push(vecinas[v]!);
    if (lados.length <= 1) return false;
    const visto = new Uint8Array(N);
    visto[k] = 1;
    visto[lados[0] as number] = 1;
    const cola = [lados[0] as number];
    let faltan = lados.length - 1;
    const esLado = new Set(lados.slice(1));
    for (let q = 0; q < cola.length && faltan > 0; q++) {
      const j = cola[q] as number;
      for (let v = desde[j]!; v < desde[j + 1]!; v++) {
        const m = vecinas[v]!;
        if (visto[m] === 1 || !fueraDeRegion(m)) continue;
        visto[m] = 1;
        if (esLado.has(m)) faltan--;
        cola.push(m);
      }
    }
    return faltan > 0;
  };
  // Ni deja la muesca de #222 (`puertasSinMuesca`): la puerta de una ciudad
  // entre dos acantilados, con acantilado encima y lo que se pisa debajo.
  const muerdeUnaPuerta = (k: number): boolean => {
    const pisa = (j: number): boolean => j === k || tipos[j] === ABIERTA;
    for (const t of e.ciudades) {
      const x = t % W;
      const y = (t - x) / W;
      if (y + 2 >= H) continue;
      for (const s of [-1, 1]) {
        if (x + s < 0 || x + s >= W) continue;
        const lado = t + W + s;
        if (k !== t + W && k !== lado + W) continue;
        if (pisa(t + W) && tipos[lado] === CORTADO && tipos[t + s] === CORTADO && pisa(lado + W))
          return true;
      }
    }
    return false;
  };
  // El nivel de la región `r` lo da cualquiera de sus casillas pegadas a `k`.
  const esquinaDeRegion = (k: number, r: number): number => {
    for (let v = desde[k]!; v < desde[k + 1]!; v++) {
      const j = vecinas[v]!;
      if (tipos[j] === ABIERTA && !nodos.has(j) && regionDe[j] === r) return j;
    }
    return k;
  };
  // Las franjas de barrera, como las ve la validación (`problemasDeNiveles`):
  // abrir una casilla puede dar a una franja una región más o partirla, y cada
  // trozo tiene que admitir los niveles de lo que toca.
  const terreno: TerrainKind[] = Array.from({ length: N }, (_, i) =>
    e.puentes.has(i) ? 'water' : nodos.has(i) ? 'grass' : (barreraDe(tipos, i) ?? 'grass'),
  );
  const region = Int32Array.from(regionDe, (r, i) => (nodos.has(i) ? -1 : r));
  const admiten = (abrir: readonly (readonly [number, number])[]): boolean => {
    const t = terreno.slice();
    const reg = Int32Array.from(region);
    for (const [c, rc] of abrir) {
      t[c] = 'grass';
      reg[c] = rc;
    }
    return franjasDeBarrera(W, H, t, reg).every(
      (f) =>
        f.regiones.size === 0 ||
        admiteLosNiveles(
          f.barrera,
          [...f.regiones].map((r) => e.niveles[r] as Nivel),
        ),
    );
  };
  let abiertas = 0;
  for (const [p, q] of e.tramos) {
    if (e.puentes.has(p) || e.puentes.has(q)) continue;
    const como = pasoTorcido(W, H, nivel, p, q);
    if (como !== 'silla' && como !== 'diagonal') continue;
    const n = nodos.has(p) ? p : nodos.has(q) ? q : -1;
    if (n === -1) continue;
    const a = n === p ? q : p;
    const r = regionDe[a] as number;
    const ax = a % W;
    const nx = n % W;
    const esquinas = [a - ax + nx, n - nx + ax];
    // La que deja la rampa de frente, primero.
    const deFrente = (k: number): boolean => {
      const antes = nivel[k] as number;
      nivel[k] = nivel[a] as number;
      const torcida = pasoTorcido(W, H, nivel, k, n) !== null;
      nivel[k] = antes;
      return !torcida;
    };
    esquinas.sort((k1, k2) => Number(deFrente(k2)) - Number(deFrente(k1)));
    for (const k of esquinas) {
      const ke = espejoDe(k, N);
      // Y su reflejo, a la pareja de la región, si también se puede: como los
      // obstáculos y el agua de las esquinas (`sinAguaEnLasEsquinas`), el
      // espejo es lo que se pueda, y bajo el reflejo puede haber un obstáculo.
      // En el centro del mapa una esquina y su reflejo pueden tocarse: abiertas
      // a dos regiones, las unirían por un vértice.
      const re = parejaDe(r);
      if (!abrible(k, r)) continue;
      const cerca =
        Math.abs((k % W) - (ke % W)) <= 1 && Math.abs(Math.floor(k / W) - Math.floor(ke / W)) <= 1;
      const conReflejo = ke !== k && !(cerca && re !== r) && abrible(ke, re);
      const abrir: (readonly [number, number])[] = [[k, r]];
      if (conReflejo && admiten([...abrir, [ke, re]])) abrir.push([ke, re]);
      if (!admiten(abrir)) continue;
      for (const [c, rc] of abrir) {
        nivel[c] = nivel[esquinaDeRegion(c, rc)] as number;
        ponerTipo(tipos, c, ABIERTA);
        regionDe[c] = rc;
        terreno[c] = 'grass';
        region[c] = rc;
        abiertas++;
      }
      break;
    }
  }
  return abiertas;
}

export function trazarCaminos(e: EntradaDeCaminos): [number, number][] | string {
  const tramos: [number, number][] = [];
  for (let r = 0; r < e.regiones; r++) {
    const b = new Busqueda(e, r);
    const centro = centroOMotivo(e, r, b);
    if (typeof centro === 'string') return centro;
    if (centro === -1) continue;
    b.buscar(centro);
    const hastaElCentro = Int32Array.from(b.coste);
    const objetivos = [...(e.objetivos[r] ?? [])].sort(
      (x, y) => (hastaElCentro[x] as number) - (hastaElCentro[y] as number) || x - y,
    );
    const arbol = new ArbolDeCaminos(e.W, e.H, b.hoja, centro);
    for (const o of objetivos) {
      if (arbol.red[o] === 1) continue;
      b.buscar(centro, arbol, o);
      if (b.previo[o] === -1) {
        const p = aPunto(o, e.W);
        throw new Error(
          `el camino de la región ${r} no llega a (${p.x},${p.y}): la red y los obstáculos tenían que dejarlo alcanzable`,
        );
      }
      // El radio, del objetivo hacia atrás hasta tocar la red; se cuelga al
      // revés, desde la red, para que cada casilla entre ya unida al árbol.
      const radio: number[] = [];
      for (let c = o; arbol.red[c] !== 1; c = b.previo[c] as number) radio.push(c);
      for (let k = radio.length - 1; k >= 0; k--) {
        const c = radio[k] as number;
        arbol.colgar(c, b.previo[c] as number);
      }
    }
    tramos.push(...arbol.tramos());
  }
  return tramos;
}

/**
 * El árbol de caminos de una región mientras se traza: cada casilla de la red
 * con su padre, hacia el centro. Los tramos son `[padre, casilla]`.
 *
 * **Las horquillas salen en L y no en Y** (decisión del usuario, punto de
 * control de #153). El trazado bifurca a menudo en diagonal: de una casilla
 * salen un tramo recto y otro oblicuo cuya esquina es la casilla del recto.
 * Pintado tal cual, los dos trazos salen del mismo punto, se solapan con el
 * ancho de la senda y donde confluyen tres ramales se lee un cruce en X o una
 * estrella. El pintor de antes de #153 lo dibujaba en codo de 90° porque su
 * regla de adyacencia quitaba la diagonal con esquina de camino, y así se
 * quiere seguir viendo. Se resuelve donde nace, al colgar cada casilla, y sin
 * cambiar las casillas: solo cuál es su padre.
 *
 * - Una casilla que se cuelga en diagonal y tiene una esquina ya en la red se
 *   cuelga de la esquina. No hace falta buscar de qué lado queda: la casilla
 *   entra como hoja, así que todo lo que ya es red está del lado de su padre.
 * - Una casilla que entra en la esquina de una diagonal vieja la parte en dos
 *   rectos. Ahí sí hay que saber de qué lado de la diagonal ha quedado, y lo
 *   dice subir por los padres: si se llega al hijo de la diagonal, está debajo
 *   de él y se le da la vuelta al trozo de rama que los une.
 *
 * Una hoja —un nodo o un objeto con puerta (#188)— nunca hace de esquina:
 * colgar de ella le haría llegar dos tramos de la región, y una hoja se llega,
 * no se cruza. Por eso la búsqueda cobra de más el paso en diagonal junto a una
 * hoja de la red (`Busqueda`).
 * Aun así queda la Y **obligada**, cuando la otra esquina es barrera y el radio
 * no tiene por dónde más pasar: 4 de 223 mapas del test denso (60, 64, 177 y
 * 986). Prohibir ese paso deja el objetivo sin camino (semilla 60), y quitarla
 * de otro modo movería casillas. Una esquina de otra región tampoco se usa (no
 * está en `red`): unirla sería el segundo cruce de la pareja que la red no
 * eligió.
 */
export class ArbolDeCaminos {
  /** Las casillas de la red: el centro y las ya colgadas. */
  readonly red: Uint8Array;
  /** Las 8-vecinas de la red: arrimarse a ella cuesta un paso recto más. */
  readonly pegada: Uint8Array;
  private readonly padre: Int32Array;
  /** Las casillas colgadas, en el orden en que entraron. */
  private readonly colgadas: number[] = [];

  constructor(
    private readonly W: number,
    H: number,
    /** Los nodos de la región y los objetos con puerta: nunca hacen de esquina. */
    private readonly hoja: Uint8Array,
    centro: number,
  ) {
    this.red = new Uint8Array(W * H);
    this.pegada = new Uint8Array(W * H);
    this.padre = new Int32Array(W * H).fill(-1);
    this.marcar(centro);
  }

  /** Cuelga `c`, que no es red, de `p`, que sí lo es. */
  colgar(c: number, p: number): void {
    const { red, padre, W } = this;
    const hoja = this.hoja;
    if (red[c] === 1 || red[p] !== 1) {
      const [a, b] = [aPunto(c, W), aPunto(p, W)];
      throw new Error(
        `no se cuelga (${a.x},${a.y}) de (${b.x},${b.y}): se cuelga de la red una casilla que no es de ella`,
      );
    }
    const esquina = this.esquinas(p, c).find((k) => red[k] === 1 && hoja[k] !== 1);
    padre[c] = esquina ?? p;
    this.marcar(c);
    this.colgadas.push(c);
    if (hoja[c] === 1) return;
    // `c` como esquina de una diagonal vieja: sus dos vecinas rectas de cada
    // cuadrante, unidas entre sí por un tramo.
    const x = c % W;
    for (const [dx, dy] of CUADRANTES) {
      if (x + dx < 0 || x + dx >= W) continue;
      const u = c + dx;
      const v = c + dy * W;
      if (v < 0 || v >= red.length || red[u] !== 1 || red[v] !== 1) continue;
      if (padre[u] === v) this.partir(v, u, c);
      else if (padre[v] === u) this.partir(u, v, c);
    }
  }

  /**
   * ¿Colgar `j` de `a` en diagonal le daría a `a` sus cuatro diagonales? Solo
   * si `j` entraría de verdad en diagonal: con una esquina en la red (que no
   * sea hoja) se cuelga de ella (`colgar`) y no hay aspa. Una diagonal solo
   * nace al colgar una casilla sin esquina en la red —`partir` las cambia por
   * rectos, nunca al revés—, así que mirarlo al colgar basta.
   */
  cerrariaUnAspa(a: number, j: number): boolean {
    const { W, red, padre, hoja } = this;
    if (red[a] !== 1 || red[j] === 1) return false;
    const esquinas = this.esquinas(a, j);
    if (esquinas.length === 0 || esquinas.some((k) => red[k] === 1 && hoja[k] !== 1)) return false;
    const x = a % W;
    for (const [dx, dy] of CUADRANTES) {
      const k = a + dx + dy * W;
      if (k === j) continue;
      if (x + dx < 0 || x + dx >= W || k < 0 || k >= red.length) return false;
      if (padre[k] !== a && padre[a] !== k) return false;
    }
    return true;
  }

  /** Los tramos del árbol, `[padre, casilla]`, en el orden en que entraron. */
  tramos(): [number, number][] {
    return this.colgadas.map((c) => [this.padre[c] as number, c]);
  }

  /**
   * Cambia la diagonal `padre`→`hijo` por dos rectos a través de `esquina`, que
   * ya es red. Si la esquina no cuelga del hijo, el hijo se cuelga de ella; si
   * cuelga, se le da la vuelta a la rama de la esquina al hijo y la esquina se
   * cuelga del padre.
   */
  private partir(padreDeLaDiagonal: number, hijo: number, esquina: number): void {
    const { padre } = this;
    const rama = [esquina];
    for (let k = padre[esquina] as number; k !== -1 && k !== hijo; k = padre[k] as number) {
      rama.push(k);
    }
    const debajo = padre[rama[rama.length - 1] as number] === hijo;
    if (!debajo) {
      padre[hijo] = esquina;
      return;
    }
    rama.push(hijo);
    for (let k = rama.length - 1; k > 0; k--) padre[rama[k] as number] = rama[k - 1] as number;
    padre[esquina] = padreDeLaDiagonal;
  }

  /** Las dos esquinas del paso de `p` a `c`, o ninguna si es recto. */
  private esquinas(p: number, c: number): number[] {
    const W = this.W;
    const px = p % W;
    const cx = c % W;
    if (px === cx || p - px === c - cx) return [];
    return [p - px + cx, c - cx + px];
  }

  private marcar(c: number): void {
    this.red[c] = 1;
    const { desde, vecinas } = vecindad(this.W, this.red.length / this.W);
    for (let k = desde[c]!; k < desde[c + 1]!; k++) this.pegada[vecinas[k]!] = 1;
  }
}

/** Las vecinas rectas de cada cuadrante de una casilla: horizontal y vertical. */
const CUADRANTES = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
