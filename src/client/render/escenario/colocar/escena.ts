/**
 * La escena: lo que devuelve `componer` (`colocar.ts`) y pinta `pintar.ts`. El
 * suelo y el nivel de cada casilla, el agua, el relieve (caras, celdas, bajadas y
 * rampas), las sendas y los puentes, las luces, los recintos de las ciudades, las
 * piezas (`sprite.ts`) y el informe de los guardias, que tienen que dar 0.
 *
 * Es un JSON: se compone una vez por partida (y en el taller) y se pinta las veces
 * que haga falta.
 */
import type { Suelo } from '@core/map/terrain.js';
import type { Bajada, Celda, Rampa } from '../celdas.js';
import type { Puente } from '../puentes.js';
import type { Cara as CaraDelRecinto, Contorno, PasoPorElArco, Rect } from '../recinto.js';
import type { CaraDeEscena } from '../relieve.js';
import type { Senda } from '../sendas.js';
import type { Sprite } from './sprite.js';

/** El recinto de una ciudad en la escena: su rectángulo, su octógono y las caras con puerta (`recintoDe`). */
export interface RecintoDeEscena {
  readonly id: string;
  readonly rect: Rect;
  readonly contorno: Contorno;
  readonly puertas: readonly CaraDelRecinto[];
  /** El paso por el arco de cada puerta, sin la del río (`pasoPorElArco`): el de la senda, el de la marcha y el de la ruta. */
  readonly porElArco: readonly PasoPorElArco[];
}

export interface Luz {
  readonly x: number;
  readonly y: number;
  /** Radio en casillas. */
  readonly r: number;
  readonly clase: 'fuego' | 'brasa' | 'niebla';
}

export interface Escena {
  readonly semilla: number;
  readonly W: number;
  readonly H: number;
  /** El suelo que se pinta en cada casilla: en una barrera, el de su meseta (`sueloQueSePinta`, #217). */
  readonly suelo: readonly Suelo[];
  readonly nivel: readonly number[];
  readonly agua: readonly number[];
  /**
   * El agua de las charcas (#144, río continuo, paso 2): la de los lagos de
   * obstáculo, agua que toca una sola región. El pintor
   * la enturbia (`COLOR_DE_LA_CHARCA`) para que no compita con el río a la vista:
   * agua clara, la del río y las fronteras; turbia, la que está suelta.
   */
  readonly charcas: readonly number[];
  /**
   * Las casillas de bosque, de frontera y de obstáculo: lo que el pintor tiñe
   * de sotobosque (`sotobosqueDe`), la huella de lo que no se pisa.
   */
  readonly bosque: readonly number[];
  readonly relieve: {
    /** Las caídas al sur con lo que se pinta de ellas (`pintada`): donde no hay pared, no se pinta. */
    readonly caras: readonly CaraDeEscena[];
    /** Las casillas de las caídas al este y al oeste (`cantosDe`). El pintor ya no las lee: la sombra del desnivel es `sombraAlPie` (#211). */
    readonly cantos: readonly (readonly [number, number, 'este' | 'oeste'])[];
    /** Las casillas más altas que la de su norte: el reborde de lo que cae de espaldas (`rebordesDe`). */
    readonly rebordes: readonly (readonly [number, number])[];
    /**
     * Las paredes que se ven, una por celda de vértice y grupo de umbrales
     * (`celdas.ts`, R4), sin las que cruza un puente ni las que abre una rampa.
     * Lo que mide el informe (`celdasMalCubiertas`) y lo que guarda una marca.
     */
    readonly celdas: readonly Celda[];
    /**
     * Por dónde bajan las sendas hacia la cámara o de lado: una pieza encima de
     * la pared cada una (R5), o la rampa que la abre (`deUnaRampa`, #225).
     */
    readonly bajadas: readonly Bajada[];
    /** Las rampas que abren la pared (#225, `rampasDeFrente`): cuerpo y dos costados cada una. */
    readonly rampas: readonly Rampa[];
  };
  readonly altoDeNivel: number;
  readonly caminos: readonly (readonly [number, number, number, number])[];
  /** Los caminos encadenados y suavizados: lo que se pinta. Acaban en los estribos de los puentes. */
  readonly sendas: readonly Senda[];
  /** Los puentes, uno por nodo de agua (`puentes.ts`): su sprite lleva su `id`. */
  readonly puentes: readonly Puente[];
  /**
   * Los trozos de senda junto a un estribo donde no se pinta el agua
   * (`vadosDeLosEstribos`): la senda llega al puente por tierra.
   */
  readonly vados: readonly Senda[];
  /**
   * La luz y el aire, encima de todo menos las nubes: el resplandor cálido de
   * ciudades y pueblos, las brasas de la lava y la niebla baja del agua y la
   * ciénaga.
   */
  readonly luces: readonly Luz[];
  readonly sprites: readonly Sprite[];
  /**
   * El recinto de cada ciudad (`recinto.ts`): su rectángulo y sus aberturas.
   * El pintor pone su plaza (`pintarPlazas`) y la superficie cubre sus
   * casillas: quien está dentro va delante de todo el recinto.
   */
  readonly recintos: readonly RecintoDeEscena[];
  readonly informe: {
    /**
     * Los nodos que se quedaron sin sitio para su puesto y los puestos cuya obra
     * toca al héroe parado en su nodo (`puestosSobreElHeroe`): tiene que ser 0.
     * Lo que la obra no pisa (la senda, el eje de un paso, el tablero de un
     * puente) lo cuentan `spritesSobreSenda`, `pasosTapados`, `pasosAtravesados`
     * y `puentesTapados`, que miran las obras como lo demás.
     */
    readonly puestosSinSitio: number;
    /**
     * Los puestos cuya obra tapa algo que el pintor pone después
     * (`puestosTapados`, en el orden de `separar`): tiene que ser 0.
     */
    readonly puestosTapados: number;
    /**
     * Los puestos cuya obra tapa lo horneado de otro objeto que el pintor pone
     * antes (`puestosQueTapan`: las piezas de un recinto, un pueblo, otro nodo):
     * tiene que ser 0.
     */
    readonly puestosQueTapan: number;
    /**
     * Lo que de la muralla no cierra, sobre lo pintado (`murallaSinLeer`):
     * franjas por las que se rodea, puertas sin muralla a un lado y trozos de
     * más de una línea partida.
     */
    readonly murallasPartidas: number;
    /**
     * Lo que de la muralla no se lee como una muralla (#197): puntas de una
     * franja de frontera que no llegan a nada (espolones), juntas de dos ejes
     * sin torre y puntas de norte a sur sin torre (raíles). Tiene que ser 0.
     */
    readonly murallaIncoherente: number;
    readonly muralla: {
      readonly fugas: readonly (readonly [number, number])[];
      readonly puertasSueltas: readonly string[];
      readonly huecos: number;
      readonly espolones: readonly (readonly [number, number])[];
      readonly esquinasAbiertas: readonly (readonly [number, number])[];
      readonly puntasSinTorre: readonly (readonly [number, number])[];
      readonly torresApiladas: readonly (readonly [number, number])[];
    };
    /**
     * Torres de muralla pintadas a una casilla o menos de otra, o en la misma
     * columna a dos o menos (`apiladas`, `seApilan`): se leen como una torre
     * gorda o una chimenea, no como dos esquinas. Tiene que ser 0 en 1-40.
     */
    readonly torresApiladas: number;
    /**
     * Torres y tramos de muralla sobre la senda (`murallaSobreLaSenda`): una
     * torre que la tapa o un tramo que la cruza fuera de su puerta. Tiene que
     * ser 0 (#193).
     */
    readonly murallaSobreSenda: number;
    readonly basesSobreReserva: number;
    /**
     * Sendas pintadas y tableros de puente que pasan por la base del anillo de
     * un recinto, una torre o una cara sin puerta (`anilloSobreLaSenda`): se
     * entra por el arco de una puerta. Tiene que ser 0.
     */
    readonly recintoSobreSenda: number;
    /**
     * Puntos del octógono de un recinto que no cubre la base de ninguna torre,
     * tramo o puerta (`huecosDelAnillo`): el anillo va cerrado. Tiene que ser 0.
     */
    readonly anilloAbierto: number;
    /**
     * Puentes cuya pisada entra en el octógono de un recinto
     * (`puentesSobreElAnillo`): el de una ciudad-puente acaba al pie de la cara
     * del río. Tiene que ser 0.
     */
    readonly puenteSobreElAnillo: number;
    /**
     * Cruces de una senda pintada con el octógono de un recinto lejos del arco
     * de una puerta (`sendasFueraDeLaPuerta`): ninguna abertura más ancha que su
     * puerta. Tiene que ser 0.
     */
    readonly sendaFueraDeLaPuerta: number;
    /**
     * Puertas de un recinto que no casan con los caminos del núcleo
     * (`puertasSinSuCamino`): pintada sin camino que llegue a ella, del núcleo
     * y sin pintar, sin senda por su arco o la del río sin su puente. Tiene que
     * ser 0.
     */
    readonly puertaSinCamino: number;
    /**
     * Casas de un recinto con la misma casa al lado o detrás, solapadas
     * (`casasRepetidasJuntas`): tiene que ser 0.
     */
    readonly casasRepetidasJuntas: number;
    /**
     * Casas de un recinto que se pintan después del arco de una puerta y tapan
     * su vano (`arcosTapados`): el camino acababa contra un tejado. Tiene que
     * ser 0.
     */
    readonly arcosTapados: number;
    /**
     * Tramos de muralla de norte a sur (`muro-ns-*`, de la muralla del mapa y
     * del recinto de una ciudad) que enseñan su testero a media tirada
     * (`testerosAMediaTirada`): el muro se leía partido por el medio. Tiene que
     * ser 0.
     */
    readonly testerosAMediaTirada: number;
    /**
     * Torres de un recinto y piezas de una de sus dos caras (tramos y puertas)
     * que el pintor pone al revés de la geometría: se pinta después la que
     * está más lejos de la cámara donde se solapan (`anilloMalOrdenado`; la
     * torre del vértice de arriba de la puerta del noreste de s16 tapaba el
     * pilar del torreón). Tiene que ser 0.
     */
    readonly anilloMalOrdenado: number;
    /**
     * Casillas de barrera que no tapa su formación, un objeto ni una pared
     * del desnivel por su centro (#222): tiene que ser 0.
     */
    readonly casillasDeBarreraSinFormacion: number;
    /**
     * Sprites de una clase que se aparta del camino (`APARTE`) cuyo rectángulo
     * pisa su pasillo (`pasillo.ts`): tiene que ser 0.
     */
    readonly spritesSobreSenda: number;
    /**
     * Paredes vistas sin exactamente su pieza en su sitio —una frontal, una
     * ladera o una diagonal (o su marcador) con sus juntas en las de su celda—,
     * salvo las vacías por una razón declarada: la reserva de un objeto o un
     * barranco (`celdasMalCubiertas`): tiene que ser 0.
     */
    readonly celdasMalCubiertas: number;
    /**
     * Bajadas sin su pieza (o su marcador) con su `arriba` donde la senda cruza
     * el filo (`bajadasSinPieza`): tiene que ser 0.
     */
    readonly bajadasSinPieza: number;
    /**
     * Bajadas cuyo camino tapa algo que se pinta después, contado desde el orden
     * del pintor (`bajadasTapadas`), como los puentes: tiene que ser 0.
     */
    readonly bajadasTapadas: number;
    /**
     * Bajadas que se pintan encima de lo horneado (ciudad, pueblo, nodo)
     * de la casilla a la que bajan, con el que se solapan, desde el orden del
     * pintor (`bajadasSobreNodo`): tiene que ser 0.
     */
    readonly bajadasSobreNodo: number;
    /**
     * Bajadas cuya rampa se aparta de la senda pintada (`rampasDesviadas`): la
     * senda pasa por ella y sigue desde su pie (#192). Tiene que ser 0.
     */
    readonly rampasDesviadas: number;
    /**
     * Rampas sin su cuerpo y sus dos costados en su sitio, o con una frontal
     * sobre el hueco (`rampasSinSusPiezas`, #225): tiene que ser 0.
     */
    readonly rampasSinSusPiezas: number;
    /**
     * Nodos entre dos niveles sin camino ni la rampa de su bajada, salvo los
     * que bajan al norte, de espaldas a la cámara (`nodosSinRampa`, #143):
     * tiene que ser 0.
     */
    readonly nodosSinRampa: number;
    /**
     * Tramos de senda pintada de al menos `SENDA_CORTADA` casillas bajo la
     * silueta de una frontal, una ladera o una diagonal (`sendaBajoElRelieve`,
     * #189): la senda desaparece bajo el relieve. No es 0: el trazado del
     * núcleo lo evita donde puede (`recargosDelTrazado`, vestir.ts), pero un
     * pasillo de una casilla al pie de un desnivel no deja otro sitio.
     */
    readonly sendaBajoElRelieve: number;
    /**
     * Casillas altas de la espalda de una meseta (más altas que la de su norte,
     * que se pisan o son de acantilado y no caen bajo un objeto) sin una roca,
     * pared o masa en su mitad norte (`espaldasSinReborde`, #212): el borde que
     * no dice nada y la elevación que acaba de repente. Tiene que ser 0.
     */
    readonly espaldasSinReborde: number;
    /**
     * Picos de lo alto de un acantilado de otra roca que la de su cara
     * (`cimaDeOtroMaterial`, #212): gris sobre arenisca. Tiene que ser 0.
     */
    readonly cimaDeOtroMaterial: number;
    /**
     * Paredes del desnivel (frontal, ladera, diagonal) con algo de su silueta
     * bajo una masa que se pinta después (`paredesTapadasPorLaMasa`, #216): la
     * pared que asomaba a trozos entre los picos de la cordillera. Tiene que
     * ser 0.
     */
    readonly paredesTapadas: number;
    /**
     * Paredes del desnivel de otra roca que su meseta (`caraDeOtroMaterial`,
     * #216): la meseta de arena que acababa en una pared gris, la del suelo de
     * abajo (806 de 2 506 en 1-40). Tiene que ser 0.
     */
    readonly caraDeOtroMaterial: number;
    /**
     * Mesas de arenisca (`esMesa`) en una cordillera (#212): la montaña de arena
     * que se leía como un acantilado. Tiene que ser 0.
     */
    readonly mesasEnLaCordillera: number;
    /**
     * Trozos de cara de acantilado que se pintan y no tapa la silueta de
     * ninguna pared, de al menos 0,3 de ancho y de alto (`carasLisas`): tiene
     * que ser 0.
     */
    readonly carasLisas: number;
    /**
     * Tiradas de frontal de no más de `CABO_SUELTO` casillas con una punta que
     * acaba en el llano junto a un objeto (`carasCortadas`, #221): el bloque
     * suelto de columnas a los lados de una ciudad o una mina al pie de la
     * meseta. En 1-200, 72 → 18; en 1-40, 13 → 4 (#221); en 42×42, 23 → 4 y
     * 2 → 0 (#222, 09-10-2026). Quedan las esquinas cuya diagonal taparía el
     * camino que sale de su pie (`test/caras-cortadas.test.ts`, `QUEDAN`).
     */
    readonly carasCortadas: number;
    /**
     * Casillas bajas a las que bajan laderas de los dos lados en la misma fila,
     * con los pies montados (`laderasEnfrentadas`): tiene que ser 0.
     */
    readonly laderasEnfrentadas: number;
    /**
     * Lo que se aparta del camino y la pared que se pintan encima del tablero de
     * un puente, contados desde el orden del pintor (`puentesTapados`) y no
     * desde la puerta (`vaDelante`): tiene que ser 0.
     */
    readonly puentesTapados: number;
    /**
     * Nodos de paso de montaña, bosque o muro cuyo eje pisa el rectángulo de un
     * volumen de los que se apartan (`pasosTapados`): tiene que ser 0.
     */
    readonly pasosTapados: number;
    /**
     * Nodos de paso de montaña o de bosque cuya propia pieza, la que no es un
     * hito, pisa su eje (`pasosAtravesados`, #203): tiene que ser 0.
     */
    readonly pasosAtravesados: number;
    /**
     * Pueblos a los que la senda pintada no llega por un solo tramo
     * desde su puerta, la casilla de debajo (`sendasPorObjeto`, #188): tiene
     * que ser 0 en el procedimental. Un plan del agente puede cruzarlos.
     */
    readonly sendasPorObjeto: number;
    /**
     * Sendas que salen de un estribo y pasan por agua pintada en sus primeras
     * casillas, sin vado que la quite (`sendasDeEstriboEnAgua`): tiene que ser 0.
     */
    readonly sendasDeEstriboEnAgua: number;
    /**
     * Casillas que se pisan a otro nivel que el de su región
     * (`nivelFueraDeSuRegion`, #143): tiene que ser 0.
     */
    readonly nivelFueraDeSuRegion: number;
    /**
     * Casillas vecinas que se pisan a distinto nivel sin barrera en medio ni
     * ser la rampa de un nodo (`desnivelesSinBarrera`, #143): tiene que ser 0.
     */
    readonly desnivelesSinBarrera: number;
    /**
     * Casillas que se pisan cuya figura tapan en más de un cuarto las piezas
     * del relieve que se pintan después de ella, contado desde el orden del
     * pintor con la clave que le da `delanteDeLasParedes` (`pisablesTapadas`,
     * #185): tiene que ser 0.
     */
    readonly pisablesTapadas: number;
    /**
     * Piezas de la cubierta de lo que se pisa en la lava, la arena, la ciénaga
     * o lo áspero más altas que lo que les deja su esbeltez, más regiones de
     * esos suelos con la cubierta más densa que `HUELLA_DE_LO_PISABLE`
     * (`cubiertaComoLaBarrera`, #184): tiene que ser 0.
     */
    readonly cubiertaComoLaBarrera: number;
    /**
     * Piezas de cubierta que no son del suelo que se pinta donde tienen el pie
     * (`cubiertaDeOtroNivel`, #220): la cubierta de la región baja en lo alto de
     * un acantilado o en un nodo que va al alto. Tiene que ser 0.
     */
    readonly cubiertaDeOtroNivel: number;
    /**
     * Árboles con el pie en una casilla que se pisa (`sobreLoPisable`):
     * «árbol = no se pasa» (14-10-2026). Tiene que ser 0.
     */
    readonly arbolesSobreLoPisable: number;
    /**
     * Masas de bosque o de montaña, sin las cumbres, cuya copa entra más de
     * `MARGEN_SOBRE_LO_PISABLE` por los lados en una casilla que se pisa de la
     * fila de su pie (`sobreLoPisable`). Tiene que ser 0.
     */
    readonly masaSobreLoPisable: number;
    /**
     * Masas de bosque o de montaña, sin las cumbres, cuya copa tapa más de
     * `TAPADO_DEL_PASILLO` de una casilla estrecha que se pisa al norte de su
     * fila (`pasillosEstrechos`, `sobreLoPisable`). Tiene que ser 0.
     */
    readonly pasillosTapados: number;
    /**
     * Las cumbres (`Sprite.cumbre`) que tapan lo que se pisa por los lados o un
     * pasillo estrecho: no se encogen ni se quitan por eso (`topeDeLoPisable`
     * no las mira). Es una medida, no un guardia.
     */
    readonly cumbresSobreLoPisable: number;
    /**
     * Casillas de bosque sin un árbol con el pie en ellas que no tapa la imagen
     * de un objeto (`bosqueSinArbol`): se leían como un claro que se pisa.
     * Tiene que ser 0.
     */
    readonly bosqueSinArbol: number;
    /**
     * Casillas de acantilado sin roca ni masa de `ALTO_DE_LO_ALTO` o más con el
     * pie en ellas (`acantiladosLisos`, #205): lo alto que se lee como suelo.
     */
    readonly acantiladosLisos: number;
    readonly modulosQueFaltan: readonly string[];
  };
}
