/**
 * Las reglas del escenógrafo: de un mapa del juego, una escena para pintar.
 *
 * Nada aquí es un objeto suelto por casilla. Cada franja de barrera se viste
 * como una FORMACIÓN —un bosque son cientos de árboles apretados, más altos
 * hacia dentro; una cordillera, cientos de picos que crecen hacia el centro;
 * una muralla, un lienzo seguido de puerta a barrera, con torres espaciadas
 * (`muralla.ts`)— y el suelo se cubre de detalle para que no quede desnudo. Las
 * alturas (`relieve.ts`) ponen mesetas, barrancos y caras de roca.
 *
 * Es puro salvo por leer los índices de los módulos y las medidas de las piezas
 * del disco; la escena es un JSON que pinta `pintor.ts`.
 *
 * Aquí está solo `componer`, entero. Lo que lee está en `colocar/` (fase C de la
 * reorganización, 07-11-2026): la forma de la escena (`escena.ts`) y la de una
 * pieza (`sprite.ts`), sus tablas y ayudantes (`tablas.ts`) y, por temas, cada uno
 * con sus guardias del informe, lo que se pisa (`pisable.ts`), las sendas y las
 * murallas (`sendas-y-murallas.ts`), los pasos y los puentes
 * (`pasos-y-puentes.ts`), las laderas, las rampas, las demás piezas del relieve
 * (`relieve.ts`) y las luces.
 */
import { APOYOS_DE_MURALLA } from '@core/map/murallas.js';
import { LADO_DEL_RECINTO, recintoDeLaCiudad } from '@core/map/recinto.js';
import { vecindad } from '@core/map/regiones.js';
import type { Suelo, TerrainKind } from '@core/map/terrain.js';
import { type MapObject, MEJORAS_DEL_PUESTO, type MejoraDelPuesto } from '@core/map/tipos.js';
import { analizar, type Franja, type MapaDeEscena } from './analizar.js';
import {
  caraDeOtroMaterial,
  cimaDeOtroMaterial,
  espaldaConReborde,
  espaldasSinReborde,
  materialDeLaCima,
  paredesTapadasPorLaMasa,
  sueloDeLaMeseta,
  sueloQueSePinta,
} from './bordes.js';
import { carasCortadas, carasLisas, perfilesDelCatalogo, pintadaDeCara } from './caras.js';
import {
  type Catalogo,
  type Modulo,
  type ModuloDeBajada,
  type ModuloDeDiagonal,
  type ModuloDeLadera,
  PIEZAS_DE_LA_FORMA,
  type Pieza,
  type PiezaDeRampa,
} from './catalogo.js';
import {
  type Bajada,
  bajadasDe,
  type Celda,
  caidas,
  cantosDe,
  celdas as celdasDe,
  celdasDeLaRampa,
  claveDeCelda,
  enSuRampa,
  esVisto,
  FILA_DEL_FILO,
  rampaDe,
  rampasDeFrente,
  rampasDesviadas,
  rebordesDe,
  sendasPorLosTendidos,
  TRAMO_DE_PIEZA_DE_RAMPA,
  tendidoDeBajada,
} from './celdas.js';
import type { Escena, RecintoDeEscena } from './colocar/escena.js';
import {
  colocarLadera,
  hojaDeLadera,
  type JuegoDeLadera,
  juegoDeLadera,
  laderasEnfrentadas,
  modulosDeLadera,
  piezasDeLadera,
} from './colocar/laderas.js';
import { luces } from './colocar/luces.js';
import {
  celdasBajoLosPuentes,
  formaDeLosPasos,
  pasosAtravesados,
  pasosTapados,
  puentesTapados,
  sendasPorObjeto,
} from './colocar/pasos-y-puentes.js';
import {
  bosqueSinArbol,
  cubiertaComoLaBarrera,
  cubiertaDeOtroNivel,
  sobreLoPisable,
  topeDeLoPisable,
} from './colocar/pisable.js';
import {
  DENTRO_DEL_COSTADO,
  hojaDeRampa,
  nodosSinRampa,
  piezasDeRampa,
  rampasSinSusPiezas,
  spriteDeRampa,
  tramosDeLasRampas,
} from './colocar/rampas.js';
import {
  acantiladosLisos,
  bajadasSinPieza,
  bajadasSobreNodo,
  bajadasTapadas,
  CERCA_DE_LA_BARRERA_JUNTO_A_UN_RECINTO,
  CERCA_DEL_AGUA,
  caminoDeBajada,
  celdasMalCubiertas,
  claveDeBajada,
  ESCONDIDO_DETRAS,
  esNodoHorneado,
  hojaDeBajada,
  hojaDeDiagonal,
  JUNTO_A_LA_RAMPA,
  LEJOS_DE_LA_BARRERA,
  llegaA,
  loQueTapa,
  marcadorDeBajada,
  marcadorDeDiagonal,
  puntosDeCelda,
  type Rechazo,
  type Reserva,
  SALE_DE_SU_TRAMO,
  SENDA_CORTADA,
  sendaBajoElRelieve,
  seSolapan,
  spriteDeBajada,
  spriteDeDiagonal,
  tapaElPunto,
  tonoDelPedregalSuelto,
  tramosBajoElRelieve,
  vaciaPorque,
} from './colocar/relieve.js';
import {
  ALTO_DEL_PIE_DE_CASA,
  alrededorDeMurallas,
  casillasDeLaHuella,
  celdasBajoLosRecintos,
  dondeNoVaUnPuesto,
  envolturaDelRecinto,
  formaDeLaSenda,
  formasDeLasParedes,
  formasDeLosTableros,
  hastaElPieDeSusTorres,
  type Medible,
  type ModuloConSrc,
  moduloNorteSur,
  modulosDelRecinto,
  type PiezaDeTirada,
  type PiezasDeLaLinea,
  reservaDe,
  reservaDelPuesto,
  reservaDelRecinto,
  sendaParaLaMuralla,
  sobreLaSenda,
  spriteDelRecinto,
  TORRES_DEL_MURO,
  testerosDeLaEscena,
} from './colocar/sendas-y-murallas.js';
import type { Sprite } from './colocar/sprite.js';
import {
  ALTO_DE_CASA,
  ALTO_DE_LA_CIMA,
  ALTO_DE_LO_ALTO,
  ALTO_DE_PARCELA,
  ALTO_DEL_HITO,
  ALTO_DEL_REBORDE_MENOR,
  ALTO_EN_LO_ANCHO,
  ALTO_MINIMO_DE_MASA,
  ANCHO_DE_TRAMO,
  ANCHO_DEL_HITO,
  APARTE,
  type Aparte,
  ARBOLES_DE_LA_CUBIERTA,
  BOSQUE,
  bajoLaCopa,
  bajoLaCumbre,
  CANTO_DE_LA_ESPALDA,
  CORRIMIENTOS_DE_TORRE,
  CUBIERTA,
  type CumbrePuesta,
  cajaDe,
  detrasDe,
  ENCOGER_HASTA,
  ENCOGER_LA_PARCELA,
  ESBELTEZ_DE_LO_PISABLE,
  esDeLoAlto,
  esMesa,
  FUERA_DE_LO_QUE_SE_PISA,
  HOJA_DE_CASAS,
  HOJA_DE_LA_TIERRA,
  HOJAS_QUE_SE_ESPARCEN,
  HOLGURA_DE_LA_TIRADA,
  hojaDeCubierta,
  hojaDeMasa,
  hojaDePico,
  LADO_DEL_LUGAR,
  luzDeCumbre,
  MARCADOR,
  MATA_MAS_BAJA,
  MONSTRUO,
  materialDeCara,
  ordenadoEn,
  PARTE_DEL_RELLENO,
  PEÑASCOS_DEL_CLARO,
  PUERTA_NORTE_SUR,
  PX_POR_CASILLA_DE_CASA,
  picosDeLaCima,
  radioDeLaReserva,
  ruidoSuave,
  ruidosDelMacizo,
  SEMIANCHO_DE_PARED,
  SEPARACION_EN_LA_CIMA,
  SITIOS_DE_RELLENO,
  SITIOS_DEL_REBORDE,
  SUELO_DE_LA_ROCA,
  soloPorSuNombre,
  TONO_DE_HITO,
  TORRE_MAS_BAJA,
  TRAMOS_NORTE_SUR,
  tonoDe,
  tumbado,
  VECINO_IGUAL,
} from './colocar/tablas.js';
import { azarDe, esparcir } from './esparcir.js';
import { ejeDe, type Paso } from './esqueleto.js';
import { pisablesTapadas } from './figuras.js';
import { cajaDelHeroeEn, PIES, pieDeFigura } from './figuras-del-mapa.js';
import {
  ATREZO,
  type Casa,
  casillasConCamino,
  type Labranza,
  labranzaDe,
  type Parcela,
  type PiezaDeAtrezo,
} from './labranza.js';
import { altoMaximoDe, MAS_CUMBRES, macizoDe, materialDeLosMacizos } from './macizo.js';
import {
  ALTO_DE_TORRE,
  ALTO_DEL_TRAMO_NORTE_SUR,
  ARRIMO,
  type PuertaDeMuralla,
  puntasContraSuApoyo,
  seApilan,
  type TramoPintado,
  torresDe,
  torresObligadas,
  trazaDeMuralla,
} from './muralla.js';
import { murallaSinLeer, murallaSobreLaSenda } from './muralla-sin-leer.js';
import { ejeDelPaso, esHito, pasosALaVista, piezaDeNodo, varianteDeId } from './nodos.js';
import {
  type Caja,
  type ConImagen,
  cajaDeSprite,
  Obstaculos,
  pasilloDe,
  seTocan,
} from './pasillo.js';
import { claveDe, ordenDeVolumenes } from './pintar.js';
import {
  ejesDeLosPuentes,
  type Puente,
  puenteDe,
  puenteDeLaCiudad,
  sendasDeEstriboEnAgua,
  tramosHastaLosEstribos,
  vadosDeLosEstribos,
} from './puentes.js';
import {
  alrededorDeLaObra,
  envolturaDeLasObras,
  envolturaDelPuesto,
  esObra,
  MEDIDAS_DEL_PUESTO,
  obraDelPuesto,
  PIEZA_DEL_PUESTO,
  puestosQueTapan,
  puestosSobreElHeroe,
  puestosTapados,
  sitiosDeLosPuestos,
} from './puestos.js';
import {
  ANCHO_DEL_PUEBLO,
  type ArcoPintado,
  anilloMalOrdenado,
  anilloSobreLaSenda,
  arcosTapados,
  type CaraDelContorno,
  type Cara as CaraDelRecinto,
  type Contorno,
  callesDeLasPuertas,
  casasRepetidasJuntas,
  casillasDelRecinto,
  contornoDelRecinto,
  enElRecinto,
  enLaPlaza,
  huecosDelAnillo,
  MEDIA_CALLE,
  type PiezaPintada,
  pasoPorElArco,
  pisaElAnillo,
  puentesSobreElAnillo,
  puertasDelNucleo,
  puertasSinSuCamino,
  type Recinto,
  type Rect,
  recintoDe,
  sendasFueraDeLaPuerta,
  sendasSinRoces,
  tendidosDeLasPuertas,
} from './recinto.js';
import {
  ALTO_DE_NIVEL,
  bordeDeLadera,
  CARA_DE_SUELO,
  type Cara,
  type CaraDeEscena,
  desnivelesSinBarrera,
  type Ladera,
  nivelFueraDeSuRegion,
  relieve,
} from './relieve.js';
import {
  ANCHO_DE_SENDA,
  apartarDeLoQueTapa,
  SEMIANCHO_DE_LA_HUELLA,
  type Senda,
  sendas,
} from './sendas.js';
import { FONDO_DEL_ADARVE, tiradaNorteSur } from './tirada.js';

/**
 * La escena de `map`, con la semilla de la partida y las piezas de `catalogo`:
 * la misma en el cliente, el espectador y el taller.
 *
 * **No se parte** (fase C de la reorganización, 07-11-2026). Son unas 3 400
 * líneas con cinco `let` (`azar`, `basesSobreReserva`, `indiceDeReservas`,
 * `sinLasReservas`, `sinFormacion`) y más de treinta colecciones que llenan sus
 * pasos, y **el orden de sus tiradas es el contrato**: cada paso saca del azar lo
 * que le toca en su turno, y `conCorriente` cambia de corriente a trechos (lo alto
 * de los acantilados, #205; las cordilleras, #218; la labranza), así que mover un
 * paso cambia todos los mapas, y ningún test lo fija: miran propiedades, y un
 * reorden pasa en verde. Lo que no depende de su estado ya está fuera, en
 * `colocar/`. Para partirlo un día:
 *
 * 1. fijar la huella de la escena como test, como `test/fixtures/paneles.txt` fija
 *    los paneles: la sección «escena» de `tools/qa/huella.ts`, `componer` en las
 *    semillas 1-40 y en los mundos `prueba` y `ejemplo`, con su informe;
 * 2. hacer de `azar` un objeto `Corriente` explícito, que cada paso reciba (y
 *    `conCorriente` le cambie), en vez del `let` que se reasigna;
 * 3. sacar un paso por commit a una función sobre un contexto con las colecciones,
 *    con la huella idéntica en cada uno.
 */
export function componer(map: MapaDeEscena, semilla: number, catalogo: Catalogo): Escena {
  const filtrados = new Map<string, readonly Modulo[]>();
  /**
   * Los módulos de una hoja, de menor a mayor, o null si la hoja aún no está
   * hecha; de la cubierta, sin los que son árboles (`ARBOLES_DE_LA_CUBIERTA`)
   * y, en lo que se pisa, sin los que no van ahí (`FUERA_DE_LO_QUE_SE_PISA`).
   * Con `alAzar`, solo los que salen al azar: sin los que van por su nombre
   * (`soloPorSuNombre`).
   */
  const modulosDe = (
    hoja: string,
    enLoQueSePisa = false,
    alAzar = false,
  ): readonly Modulo[] | null => {
    const ms = catalogo.hojas[hoja] ?? null;
    const arboles = ARBOLES_DE_LA_CUBIERTA.get(hoja);
    const fuera = enLoQueSePisa ? FUERA_DE_LO_QUE_SE_PISA.get(hoja) : undefined;
    const porNombre = alAzar && hoja === HOJA_DE_LA_TIERRA;
    if (ms === null || (arboles === undefined && fuera === undefined && !porNombre)) return ms;
    const clave = `${hoja}|${fuera === undefined ? '' : 'pisa'}|${porNombre ? 'azar' : ''}`;
    let sin = filtrados.get(clave);
    if (sin === undefined) {
      sin = ms.filter(
        (m) =>
          !arboles?.has(m.nombre) &&
          !fuera?.has(m.nombre) &&
          !(porNombre && soloPorSuNombre(hoja, m.nombre)),
      );
      filtrados.set(clave, sin);
    }
    return sin;
  };
  const pieza = (id: string): Pieza | null => catalogo.piezas[id] ?? null;
  const a = analizar(map);
  const { nivel } = relieve(a);
  /**
   * El suelo de la meseta de cada casilla (`sueloDeLaMeseta`, #216): la roca de
   * las paredes y de lo alto es la del lado alto, no la del suelo más cercano.
   */
  const meseta = sueloDeLaMeseta(a.W, a.H, a.region, a.suelo, nivel);
  /** La roca de cada casilla: en lo alto de un acantilado, la de su cara (`materialDeLaCima`, #212). */
  const materialDeLaCimaEn = materialDeLaCima(a.W, a.H, meseta, nivel, a.franjas);
  /** El suelo que se pinta en cada casilla (`sueloQueSePinta`, #217). */
  const pintado = sueloQueSePinta(a.region, a.suelo, meseta);
  // `let`: lo alto de los acantilados (#205) se viste con su propia corriente
  // (`azarDeLoAlto`) y se cambia mientras tanto. Con la misma, los picos de más
  // movían todo lo que se viste después: las cordilleras de 1-40 salían otras
  // y el guardia de #204 (s22 (9, 18)) contaba 8 cumbres dominantes.
  let azar = azarDe(semilla * 7919 + 1);
  /** `fn` con la corriente `otra` en lugar de `azar`, que vuelve a la de antes al acabar. */
  const conCorriente = <T>(otra: () => number, fn: () => T): T => {
    const principal = azar;
    azar = otra;
    try {
      return fn();
    } finally {
      azar = principal;
    }
  };
  const azarDeLoAlto = azarDe(semilla * 3571 + 7);
  /**
   * Las cordilleras, con la suya (#218): cuántos picos lleva una franja de
   * montaña depende de sus masas y sus claros, y con la corriente de siempre
   * cada retoque de una cordillera movía los bosques y la cubierta que se visten
   * después.
   */
  const azarDeLasCordilleras = azarDe(semilla * 6271 + 13);
  const { W, H } = a;
  const sprites: Sprite[] = [];
  const faltan = new Set<string>();
  let basesSobreReserva = 0;

  const estrechos = new Map<string, Modulo | undefined>();
  /**
   * El módulo más estrecho de una hoja (ancho entre alto), si la hoja está
   * hecha, de los que salen al azar; `enLoQueSePisa`, como `modulosDe`.
   */
  const masEstrecho = (hoja: string, enLoQueSePisa = false): Modulo | undefined => {
    const clave = `${hoja}|${enLoQueSePisa ? 'pisa' : ''}`;
    if (!estrechos.has(clave))
      estrechos.set(
        clave,
        [...(modulosDe(hoja, enLoQueSePisa, true) ?? [])].sort(
          (p, q) => p.nw / p.nh - q.nw / q.nh,
        )[0],
      );
    return estrechos.get(clave);
  };

  /**
   * Un sprite de una hoja: el módulo `nombre` (lanza si la hoja no lo tiene) o,
   * sin él, uno por su tamaño relativo `t` (0 pequeño, 1 grande).
   */
  const deHoja = (
    hoja: string,
    x: number,
    y: number,
    alto: number,
    t: number,
    clase: Sprite['clase'],
    color: string,
    sombra: boolean,
    nombre?: string,
    porAncho?: number,
    elAzar: () => number = azar,
    enLoQueSePisa = false,
  ): Sprite => {
    const ms = modulosDe(hoja, enLoQueSePisa);
    if (ms === null || ms.length === 0) {
      faltan.add(hoja);
      return {
        src: null,
        nw: 1,
        nh: 1,
        ax: 0.5,
        ay: 1,
        x,
        y,
        alto,
        clase,
        color,
        capa: clase === 'nube' ? 1 : 0,
        sombra,
      };
    }
    let m: Modulo | undefined;
    if (nombre !== undefined) {
      m = ms.find((k) => k.nombre === nombre);
      if (m === undefined)
        throw new Error(
          `la hoja «${hoja}» no tiene el módulo «${nombre}»${enLoQueSePisa ? ' entre los de lo que se pisa' : ''}`,
        );
    } else {
      // Alrededor del cuantil `t`, con algo de azar para que no se repitan; sin
      // los que solo van por su nombre (las parcelas de la labranza).
      const sorteo = modulosDe(hoja, enLoQueSePisa, true) as readonly Modulo[];
      if (sorteo.length === 0)
        throw new Error(
          `la hoja «${hoja}» no tiene módulos que salgan al azar: pide uno por su nombre`,
        );
      const centro = Math.round(t * (sorteo.length - 1));
      const k = Math.max(0, Math.min(sorteo.length - 1, centro + Math.round((elAzar() - 0.5) * 4)));
      m = sorteo[k] as Modulo;
    }
    const tono = tonoDe(hoja);
    return {
      ...(tono === undefined ? {} : { tono }),
      src: m.src,
      nw: m.nw,
      nh: m.nh,
      ax: m.ax,
      ay: m.ay,
      x,
      y,
      // Un tramo de muro se mide por lo largo que tiene que ser, no por lo alto.
      alto: porAncho === undefined ? alto : (porAncho * m.nh) / m.nw,
      clase,
      color,
      capa: clase === 'nube' ? 1 : 0,
      sombra,
    };
  };

  // 1 · Los objetos primero: reservan su sitio y nada se apoya encima.
  /**
   * El sprite de un objeto del mapa: su pieza por su ancla, o sin ella su
   * marcador. Lo comparten los objetos y los puentes.
   */
  const deObjeto = (
    o: MapObject,
    p: Pick<Pieza, 'src' | 'nw' | 'nh' | 'ax' | 'ay'> | null,
    x: number,
    y: number,
    alto: number,
    sombra = true,
  ): Sprite => ({
    ...(p === null
      ? { src: null, nw: 1, nh: 1, ax: 0.5, ay: 1 }
      : { src: p.src, nw: p.nw, nh: p.nh, ax: p.ax, ay: p.ay }),
    x,
    y,
    alto,
    clase: 'objeto',
    color: '#c9b27a',
    capa: 0,
    sombra,
    objeto: { id: o.id, kind: o.kind },
  });
  /**
   * El rectángulo del recinto de cada ciudad, el del núcleo (`recintoDeLaCiudad`,
   * con la ciudad en el medio, también la ciudad-puente): lo leen su puente, su
   * reserva, su huella, las paredes que no se ponen y su anillo.
   */
  const recintos = new Map(
    a.objetos.flatMap((o) =>
      o.kind === 'town' ? [[o.id, recintoDeLaCiudad(o.at, W, H)] as const] : [],
    ),
  );
  const puentes: Puente[] = [];
  for (const o of a.objetos) {
    // La ciudad-puente (#144) lleva su puente en la casilla del río que tiene
    // delante (`Analisis.ciudadesPuente`).
    const deLaCiudad = a.ciudadesPuente.get(o.id);
    const x = o.at.x + 0.5;
    const y = o.at.y + 0.5;
    if (a.puentes.has(o.id) || deLaCiudad !== undefined) {
      // El puente se apoya por el centro de su tablero, bajado al suelo: el
      // ancla de la pieza es ese centro (§17), y su escala, la casilla de la
      // guía. Sin sombra: la mancha de su pie, en el centro, oscurecía el arco.
      const pu =
        deLaCiudad === undefined
          ? puenteDe(o, a, nivel, map.caminos.tramos, catalogo)
          : puenteDeLaCiudad(
              o,
              deLaCiudad,
              (
                contornoDelRecinto(recintos.get(o.id) as Rect).caras.find(
                  (k) => k.cara === deLaCiudad.cara,
                ) as CaraDelContorno
              ).medio,
              W,
              nivel,
              catalogo,
            );
      puentes.push(pu);
      const p = pieza(pu.pieza);
      const [cx, cy] = pu.centro;
      if (p === null) faltan.add(pu.pieza);
      const s =
        p?.puente === undefined
          ? deObjeto(o, null, cx, cy, 1.7)
          : deObjeto(
              o,
              { ...p, ay: p.ay + p.puente.altura * p.puente.pxPorCasilla },
              cx,
              cy,
              (p.nh / p.puente.pxPorCasilla) * pu.escala,
              false,
            );
      if (deLaCiudad === undefined) {
        sprites.push({ ...s, puente: pu.id });
        continue;
      }
      // El de la ciudad no es su objeto: lo es la ciudad, su recinto. Acaba al
      // pie de la cara del río (`puenteDeLaCiudad`) y se pinta antes que ella:
      // con el río al sur, la puerta y sus torres van delante del tablero, que
      // entra por el arco; pintado después, el tablero tapaba la puerta.
      const { objeto: _ciudad, ...pieza_ } = s;
      const [e0, e1] = pu.extremos;
      const [ox, oy] = [x, y];
      const pie = Math.hypot(e0[0] - ox, e0[1] - oy) < Math.hypot(e1[0] - ox, e1[1] - oy) ? e0 : e1;
      sprites.push({ ...pieza_, puente: pu.id, clave: Math.min(claveDe(pieza_), pie[1] - 0.01) });
    }
    // La ciudad es un recinto (`recinto.ts`): su anillo y sus casas se ponen
    // con la senda pintada (paso 2b), y aquí solo reserva su rectángulo.
    if (o.kind === 'town') continue;
    const id =
      o.kind === 'village'
        ? 'pueblo'
        : o.kind === 'node'
          ? (() => {
              // El de agua ya salió arriba, con su puente.
              const paso = a.pasos.get(o.id);
              if (paso === undefined) throw new Error(`el nodo ${o.id} no está en el análisis`);
              return piezaDeNodo(o.id, o.at, W, map.terrain, paso.barrera, paso.eje);
            })()
          : o.kind === 'chest'
            ? 'cofre'
            : null;
    // Un lugar no lleva pieza ni se hornea: aquí solo aparta su sitio.
    if (o.kind === 'lugar') {
      sprites.push(deObjeto(o, null, x, y + 0.35, LADO_DEL_LUGAR));
      continue;
    }
    if (o.kind === 'monster') {
      sprites.push({
        ...MONSTRUO,
        x,
        y: y + 0.3,
        alto: 1.0,
        clase: 'objeto',
        color: '#b0553f',
        capa: 0,
        sombra: true,
        objeto: { id: o.id, kind: o.kind },
      });
      continue;
    }
    // Ancho en casillas: los de la composición de prueba, que se veían bien. El
    // hito, más estrecho: con su poste, a 1,7 medía 2,2 casillas de alto.
    const ancho = esHito(id)
      ? ANCHO_DEL_HITO
      : ({ village: ANCHO_DEL_PUEBLO, node: 1.7, chest: 0.6 }[o.kind as 'village'] ?? 0.5);
    // Los pueblos, cada uno con su variante de la hoja (por su id, siempre la
    // misma); sin la hoja, la pieza única de antes.
    const variantes = o.kind === 'village' ? modulosDe('pueblos') : null;
    const variante =
      variantes !== null && variantes.length > 0
        ? variantes[varianteDeId(o.id, variantes.length)]
        : undefined;
    const p = variante ?? (id === null ? null : pieza(id));
    const norteSur = id === 'nodo-puerta-hondo';
    const alto =
      p === null
        ? ancho
        : esHito(id)
          ? ALTO_DEL_HITO
          : norteSur
            ? PUERTA_NORTE_SUR.alto
            : (ancho * p.nh) / p.nw;
    // La puerta, por el medio: su ancla derivada es el pie más bajo, el de la
    // torre de un lado, y la puerta caía 0,4 casillas al lado de su nodo, con el
    // lienzo que llega a ella entrando por la torre (#183). La de norte a sur,
    // además, por el pie de su arco: el de su torre de delante queda una casilla
    // al sur, sobre el lienzo que sale de ella.
    const centrada =
      p !== null && id?.startsWith('nodo-puerta') === true
        ? { ...p, ax: p.nw / 2, ...(norteSur ? { ay: p.nh * PUERTA_NORTE_SUR.pieDelArco } : {}) }
        : p;
    const s0 = deObjeto(o, centrada, x, y + 0.35, alto);
    const s = esHito(id) ? { ...s0, deNodo: { id: o.id, cuando: 'neutral' as const } } : s0;
    const tono = id === null ? undefined : TONO_DE_HITO[id];
    sprites.push(tono === undefined || s.src === null ? s : { ...s, tono });
  }

  const rectsDeRecintos = [...recintos.values()];
  /** Las casillas de algún recinto: ni masa, ni un árbol en la reserva. */
  const bajoUnRecinto = new Uint8Array(W * H);
  for (const r of recintos.values())
    for (const [x, y] of casillasDelRecinto(r)) bajoUnRecinto[y * W + x] = 1;
  // Su reserva, salvo la de los puentes: la de un nodo cubre su casilla entera,
  // que lleva su camino hasta la puerta; la de una ciudad, su recinto, y quien
  // la ocupa es lo que pintará (`envolturaDelRecinto`). Entra en `obstaculos`
  // con lo demás.
  const reservas = new Map(
    a.objetos.flatMap((o) => {
      if (a.puentes.has(o.id)) return [];
      const rect = recintos.get(o.id);
      if (rect !== undefined) {
        const envoltura = envolturaDelRecinto(o.id, rect);
        return [[reservaDelRecinto(rect, envoltura), envoltura] as const];
      }
      const s = sprites.find((t) => t.objeto?.id === o.id);
      if (s === undefined) throw new Error(`el objeto ${o.id} no está en la escena`);
      return [[reservaDe({ at: o.at }, radioDeLaReserva(o), s), s] as const];
    }),
  );

  // 2 · Los caminos: se encadenan en sendas y cada senda abre su pasillo.
  const caminos = map.caminos.tramos.map(([p, q]): [number, number, number, number] => [
    p.x + 0.5,
    p.y + 0.5,
    q.x + 0.5,
    q.y + 0.5,
  ]);
  // El pasillo se mide sobre el trazo que se pinta, no sobre la casilla: la
  // senda ondula y entre dos casillas no hay centro que reservar. La senda llega
  // a los estribos de cada puente y no sigue por encima (#157).
  // Y acaba en cada ciudad o nodo que atraviesa: llega recta a su puerta (#210).
  const deUnNodo = new Set(a.red.nodos.map((n) => `${n.at.x + 0.5},${n.at.y + 0.5}`));
  /** Si la senda puede salir de un arco hasta `(x, y)`: lo que se pisa (ni barrera ni a `CERCA_DEL_AGUA` del agua), o el propio recinto. */
  const sePisaJuntoAlRecinto = (x: number, y: number) => {
    const casilla = (px: number, py: number) => {
      const i = Math.floor(py) * W + Math.floor(px);
      return px >= 0 && py >= 0 && px < W && py < H ? i : -1;
    };
    const i = casilla(x, y);
    if (i < 0) return false;
    if (bajoUnRecinto[i] !== 1 && a.franjaDe[i] !== -1) return false;
    // Ni junto al agua: la orilla pintada entra en lo que se pisa.
    for (const [dx, dy] of CERCA_DEL_AGUA) {
      const k = casilla(x + dx, y + dy);
      if (k >= 0 && a.terreno[k] === 'water' && bajoUnRecinto[k] !== 1) return false;
    }
    return true;
  };
  // La senda que pasa junto a una ciudad sin ir a ella, fuera de sus torres
  // (`sendasSinRoces`); la que va a ella entra de un acceso a su puerta.
  const contornos = new Map(
    [...recintos].map(([id, rect]) => [id, contornoDelRecinto(rect)] as const),
  );
  const sinPuertas = sendasSinRoces(
    sendas(tramosHastaLosEstribos(caminos, puentes), semilla, (x, y) => deUnNodo.has(`${x},${y}`)),
    [...contornos.values()],
    (x, y) => x >= 0 && y >= 0 && x <= W && y <= H,
  );
  /**
   * Por dónde se entra en cada recinto: su octógono y las puertas del núcleo
   * (`puertasDelNucleo`: donde llega un camino, y la del río de una
   * ciudad-puente, a la que llega el puente).
   */
  const puertasDe = new Map(
    a.objetos.flatMap((o) => {
      const rect = recintos.get(o.id);
      if (rect === undefined) return [];
      const contorno = contornos.get(o.id) as Contorno;
      return [[o.id, { id: o.id, rect, contorno, ...puertasDelNucleo(map, o.at) }] as const];
    }),
  );
  // Y entra en cada recinto por el arco de una puerta (`tendidosDeLasPuertas`),
  // antes que nada la mire: las bajadas, las paredes y lo que se aparta ven la
  // senda que se pintará.
  const tendidosDePuertas = tendidosDeLasPuertas(
    sinPuertas,
    [...puertasDe.values()],
    sePisaJuntoAlRecinto,
  );
  const suavizadas = sendasPorLosTendidos(sinPuertas, tendidosDePuertas);
  // El eje de cada nodo de paso, con camino o sin él: sin camino que abriera
  // hueco, los picos y los árboles de alrededor lo enterraban y el paso no se
  // distinguía de la cordillera (#173).
  const pasos = pasosALaVista(map, a.puentes);
  // Por dónde bajan las sendas (R5): una pieza encima de la pared cada una. La
  // que llega a un puente no: el puente es su paso.
  const nodosDePuente = new Set([
    ...a.objetos.filter((o) => a.puentes.has(o.id)).map((o) => `${o.at.x},${o.at.y}`),
    ...[...a.ciudadesPuente.values()].map(({ rio }) => `${rio.x},${rio.y}`),
  ]);
  /**
   * Dónde puede caer el pie de la rampa de una bajada (#214): nunca en el agua
   * (la de los puentes incluida). En diagonal, la rampa de caída 2 mide 1,65
   * casillas y pasaba de la ciudad de s37 (7,26) al agua de (6,27).
   */
  const pieAdmitido = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && a.terreno[y * W + x] !== 'water';
  const todasLasCeldas = celdasDe(nivel, W, H, meseta);
  const bajoLosPuentes = celdasBajoLosPuentes(todasLasCeldas, puentes);
  /**
   * Las paredes que no llevan pieza: las que cruza un puente y las de dentro de
   * un recinto (`celdasBajoLosRecintos`), cuyo suelo es la plaza de la ciudad.
   */
  const bajoLosRecintos = celdasBajoLosRecintos(todasLasCeldas, rectsDeRecintos);
  const sinPared = new Set([...bajoLosPuentes, ...bajoLosRecintos]);
  // Las rampas (#225): donde un camino baja de frente por un borde recto y hay
  // su arte, la pared se abre —el cuerpo en el hueco y un costado a cada lado—
  // en vez de llevar la bajada encima. Se deciden por el tramo del núcleo, antes
  // de toda pared.
  const rampas = rampasDeFrente(
    nivel,
    W,
    todasLasCeldas.filter((c) => esVisto(c.tipo) && !sinPared.has(claveDeCelda(c))),
    [
      ...map.caminos.tramos.filter(
        ([p, q]) => !nodosDePuente.has(`${p.x},${p.y}`) && !nodosDePuente.has(`${q.x},${q.y}`),
      ),
      ...tramosDeLasRampas(map, a),
    ],
    (forma, material, caida) =>
      piezasDeRampa(catalogo, hojaDeRampa({ forma, material, caida })) !== null,
    pieAdmitido,
  );
  // Las paredes del relieve por celdas (R4), sin las que cruza un puente (las
  // tapa su estribo, y debajo del tablero se ve el agua) ni las que abre una
  // rampa (sin cara pintada ni frontal: las sustituyen sus piezas).
  const rel = caidas(
    nivel,
    W,
    H,
    meseta,
    new Set([...sinPared, ...rampas.flatMap(celdasDeLaRampa)]),
  );
  /**
   * Las paredes que un puente solo toca en una punta de su filo (#222): las de
   * la junta por la que pasa todo puente de norte a sur o de este a oeste. Con
   * `caidas` sin ellas fuera salen su diagonal y, la caída al sur, su cara de
   * una celda; las que un barranco o una rampa quitan, no.
   */
  const juntoAlPuente = (() => {
    // Las de un recinto, tampoco: lo de dentro es su plaza (s13 (16, 36), la
    // junta de su ciudad-puente).
    const porDentro = new Set([
      ...celdasBajoLosPuentes(todasLasCeldas, puentes, true),
      ...bajoLosRecintos,
    ]);
    const junto = new Set([...bajoLosPuentes].filter((k) => !porDentro.has(k)));
    const con = caidas(
      nivel,
      W,
      H,
      meseta,
      new Set([...porDentro, ...rampas.flatMap(celdasDeLaRampa)]),
    );
    const diagonales = con.diagonales.filter((c) => junto.has(claveDeCelda(c)));
    const sur = con.vistas.filter(
      (c) =>
        c.tipo === 'S' &&
        junto.has(claveDeCelda(c)) &&
        con.caras.some(
          (k) =>
            k.y === c.vy - 1 && k.x0 <= c.vx - 0.5 && c.vx - 0.5 <= k.x1 && k.caida === c.caida,
        ),
    );
    const caras: Cara[] = sur.map((c) => ({
      y: c.vy - 1,
      x0: c.vx - 0.5,
      x1: c.vx - 0.5,
      caida: c.caida,
      material: c.material,
    }));
    return { diagonales, caras, vistas: [...diagonales, ...sur] };
  })();
  /** Las paredes que se ven y las caras que se pintan, con las de junto a un puente. */
  const vistas = [...rel.vistas, ...juntoAlPuente.vistas];
  const carasConPuentes = [...rel.caras, ...juntoAlPuente.caras];
  // Las paredes del relieve van antes que la senda (#206): nunca se apartan de
  // ella (R4/R5), así que es la senda la que se aparta de su pie. La pared solo
  // mira la reserva de los objetos y los tableros de los puentes.
  const deLaPared = new Obstaculos<Medible>([...formasDeLosTableros(puentes), ...reservas.keys()]);
  /**
   * Las reservas como índice de puntos (`reservaEn`). Se rehace al meter en
   * `reservas` las de los puestos (paso 2a): lo que se pone después las ve.
   */
  let indiceDeReservas = new Obstaculos<Medible>([...reservas.keys()]);
  /**
   * El sprite del objeto en cuya reserva cae `(x, y)`, el más cercano si son
   * varios, salvo la del objeto `salvo`: una pieza de un recinto cae en la suya.
   */
  const reservaEn = (x: number, y: number, salvo?: string): Sprite | undefined => {
    const f = indiceDeReservas.en(
      x,
      y,
      (f) => reservas.has(f) && (salvo === undefined || reservas.get(f)?.objeto?.id !== salvo),
    );
    return f === undefined ? undefined : reservas.get(f);
  };
  /** Mete `s` en la escena y cuenta si su base pisa una reserva que no es la suya. */
  const meter = (s: Sprite): true => {
    if (reservaEn(s.x, s.y, s.objeto?.id) !== undefined) basesSobreReserva++;
    sprites.push(s);
    return true;
  };
  /** `s` y, si es otro, el módulo más estrecho de su hoja en su sitio: lo que prueba `ponerPared`. */
  const yElMasEstrecho = (s: Sprite, hoja: string): [Sprite, ...Sprite[]] => {
    const e = masEstrecho(hoja);
    return e === undefined || e.src === s.src
      ? [s]
      : [s, { ...s, src: e.src, nw: e.nw, nh: e.nh, ax: e.ax, ay: e.ay }];
  };
  /**
   * La puerta de la pared: no tapa ningún tablero (`deLaPared`): se prueba cada
   * uno de `modulos` en su orden, encogido sin bajar de `minimo`. Dice si se
   * puso. Con `puntos` (su pie y lo que tapa por encima: el filo, el medio de
   * una ladera, las juntas de una diagonal) en la reserva de un objeto:
   *
   * - la frontal y la ladera (`'detras'`) van si no lo tapan a él (se pintan
   *   después y sus cajas se solapan) ni a su camino (la rampa de una bajada,
   *   un tramo de senda que esconderían), encogidas si hace falta;
   * - la diagonal (`'ordenada'`), que no se encoge, además pasa por detrás del
   *   objeto que taparía, como la muralla (`meterEnLaMuralla`): en su sitio,
   *   ordenada justo antes que él (`Sprite.clave`); y la frontal y la ladera
   *   que ni encogidas dejan de taparlo, si está a su pie (#222);
   * - el pedregal (`'fuera'`) no va: no se planta en la puerta.
   *
   * Saltarse la reserva entera partía el borde de la meseta en bloques sueltos
   * junto a las minas y las ciudades de su pie (#221, `carasCortadas`).
   *
   * Con el relieve por celdas (R4/R5) la pared ya no se aparta de la senda que
   * baja: ni se corre, ni se encoge, ni se quita por ella, y nunca se corta. La
   * bajada se pinta encima. El muro bajo junto a la senda (#172) era eso.
   */
  /** El módulo de la hoja de `b` en su rumbo, o undefined sin su arte. */
  const moduloDeBajada = (b: Bajada): ModuloDeBajada | undefined =>
    (modulosDe(hojaDeBajada(b)) ?? []).find(
      (k): k is ModuloDeBajada => k.bajada?.rumbo === b.rumbo,
    );
  /** La pieza de `b` con la clave `k`, o su marcador sin su arte. */
  const piezaDeBajada = (b: Bajada, k: number): Sprite => {
    const m = moduloDeBajada(b);
    return m === undefined ? marcadorDeBajada(b, k) : spriteDeBajada(m, hojaDeBajada(b), b, k);
  };
  /**
   * Si `(x, y)` cae en un recinto, con su borde: la bajada que arranca ahí no se
   * pone, que dentro no hay pared que bajar (`celdasBajoLosRecintos`).
   */
  const enUnRecinto = (x: number, y: number) => rectsDeRecintos.some((r) => enElRecinto(r, x, y));
  /** Las bajadas de las sendas `l`, con la de cada rampa por el medio de su hueco (`enSuRampa`). */
  const bajadasDe_ = (l: readonly Senda[]) =>
    bajadasDe(
      nivel,
      W,
      meseta,
      rel.celdas,
      map.caminos.tramos,
      l,
      (p, q) => nodosDePuente.has(`${p.x},${p.y}`) || nodosDePuente.has(`${q.x},${q.y}`),
      pieAdmitido,
    )
      .filter((b) => !enUnRecinto(...b.arriba))
      .map((b) => enSuRampa(b, rampas));
  /**
   * Las bajadas de los nodos entre dos niveles sin camino (#143), por su eje y
   * sin senda que seguir: la tierra la lleva la pieza (#227).
   */
  const bajadasDeLosNodos = () =>
    bajadasDe(nivel, W, meseta, rel.celdas, tramosDeLasRampas(map, a), [], undefined, pieAdmitido)
      .filter((b) => !enUnRecinto(...b.arriba))
      .map((b): Bajada => enSuRampa({ ...b, deUnNodo: true }, rampas));
  /** La silueta de cada módulo que tapa una cara: la de las paredes, para lo que pintan encima. */
  const perfilDe = perfilesDelCatalogo(catalogo);
  /**
   * Las rampas de las bajadas tal como saldrán (las de las sendas sin apartar,
   * que junto a una rampa no se apartan, y las de los nodos): la pared que pasa
   * por detrás de un objeto no las tapa (#221). Fuera de una reserva, la bajada
   * se pinta encima de su pared; dentro, va justo detrás del objeto (`llegaA`) y
   * la pared que se colara entre las dos la tapaba.
   */
  const bajadasPrevias = bajadasDe_(suavizadas);
  const rampasPrevias = [...bajadasPrevias, ...bajadasDeLosNodos()].map(caminoDeBajada);
  /**
   * Las sendas como irán por las rampas (`sendasPorLasRampas`), con sus
   * enlaces: lo que mira la pared que pasa por detrás de un objeto (#222). Con
   * las suavizadas, el enlace del pie de una rampa a su trazo quedaba bajo la
   * diagonal de al lado (s108 (4, 9)).
   */
  const porLasRampas = sendasPorLosTendidos(suavizadas, bajadasPrevias.map(tendidoDeBajada));
  /**
   * Las cajas de las paredes que la puerta no dejó entrar, con el porqué (un
   * puente que taparían): la razón declarada de las celdas que quedan vacías
   * ahí (`vaciaPorque`).
   */
  const rechazos: Rechazo[] = [];
  const idsDePuentes = new Set(puentes.map((p) => p.id));
  /**
   * Las paredes que pasaron por detrás de un objeto (#222) sin la regla de
   * siempre (la diagonal que no tapa el camino): se juzgan otra vez con la
   * senda pintada. `alQuitar` deshace lo que su sitio apuntó (las celdas con
   * ladera).
   */
  const detrasDeUnObjeto: { readonly s: Sprite; readonly alQuitar?: () => void }[] = [];
  const ponerPared = (
    modulos: readonly [Sprite, ...Sprite[]],
    minimo: number,
    puntos: readonly (readonly [number, number])[],
    reserva: Reserva = 'detras',
    alQuitar?: () => void,
  ): boolean => {
    const objetos = puntos.flatMap(([x, y]) => reservaEn(x, y) ?? []);
    if (objetos.length > 0 && reserva === 'fuera') return false;
    const encogido = (m: Sprite, alto: number): Sprite =>
      alto === m.alto
        ? m
        : { ...m, alto, ...(m.ancho === undefined ? {} : { ancho: (m.ancho * alto) / m.alto }) };
    /** Si `s` se pinta después de alguno de `objetos` y lo taparía (sus cajas se solapan). */
    const tapaUnObjeto = (s: Sprite): boolean => {
      const caja = cajaDeSprite(s);
      return objetos.some((o) => claveDe(s) >= claveDe(o) && seTocan(caja, cajaDeSprite(o)));
    };
    /**
     * Si todos los objetos que `s` taparía están al pie de su pared: en la fila
     * de debajo de la casilla alta de la que cuelga (`filaAlta`) o más al sur.
     */
    const alPie = (s: Sprite): boolean =>
      s.filaAlta !== undefined &&
      objetos.every(
        (o) => !seTocan(cajaDeSprite(s), cajaDeSprite(o)) || claveDe(o) > s.filaAlta! + 1,
      );
    /**
     * Si `s` taparía la rampa de una bajada o un tramo de senda
     * (`sendaBajoElRelieve`): junto al objeto, a su puerta llega el camino, y
     * la reserva lo dejaba a la vista.
     */
    const tapaElCamino = (s: Sprite, detrasDeObjetos = false): boolean => {
      const caja = cajaDeSprite(s);
      const cerca = ([x, y]: readonly [number, number], r: number) =>
        seTocan(caja, [x - r, y - r, x + r, y + r]);
      // Detrás de un objeto, la bajada va encima de la pared (se ordena
      // después de toda pared que tapa su camino, y antes que el objeto): su
      // rampa no se tapa, y la senda que baja por ella se ve.
      if (
        !detrasDeObjetos &&
        rampasPrevias.some((r) => r.some((p) => cerca(p, 0) && tapaElPunto(s, perfilDe, ...p)))
      )
        return true;
      // Con las paredes de al lado: dos que tapan media senda cada una la esconden.
      const sendas = (detrasDeObjetos ? porLasRampas : suavizadas).filter((l) =>
        l.some((p) => cerca(p, 0.3)),
      );
      if (sendas.length === 0) return false;
      const alrededor: Caja = [caja[0] - 1, caja[1] - 1, caja[2] + 1, caja[3] + 1];
      // Detrás de un objeto, con los objetos: lo que tapa una pared que un
      // objeto tapa encima no se esconde bajo el relieve (`loQueTapa`), así
      // que la diagonal que pasa por detrás de una mina no le esconde el camino
      // de su puerta (s37 (1, 26)). Pero lo que asoma no se le perdona: ni un
      // trozo de `ESCONDIDO_DETRAS`.
      const vecinas = sprites.filter(
        (t) =>
          (t.clase === 'pared' || (detrasDeObjetos && t.clase === 'objeto')) &&
          seTocan(cajaDeSprite(t), alrededor),
      );
      const minimo = detrasDeObjetos ? ESCONDIDO_DETRAS : SENDA_CORTADA;
      const enUnaRampa = (x: number, y: number) =>
        detrasDeObjetos &&
        rampasPrevias.some((r) =>
          r.some(([px, py]) => Math.hypot(px - x, py - y) <= ANCHO_DE_SENDA),
        );
      const escondido = (ps: readonly Sprite[]) =>
        tramosBajoElRelieve(ps, sendas, catalogo, minimo, enUnaRampa).reduce(
          (n, t) => n + t.largo,
          0,
        );
      return escondido([...vecinas, s]) > escondido(vecinas) + 1e-9;
    };
    for (const m0 of modulos) {
      let m = m0;
      let libre = deLaPared.altoLibre(m);
      // La que taparía el tablero de un puente al pintarse después, por
      // detrás de él (#222): el puente va encima y la pared sigue hasta su
      // estribo. Encogida no bajaba del mínimo y la cara acababa en seco a un
      // paso del tablero (s92 (12, 25), s30 (20, 20)).
      if (libre < minimo) {
        const caja = cajaDeSprite(m);
        const tableros = sprites.filter(
          (t) =>
            t.puente !== undefined &&
            idsDePuentes.has(t.puente) &&
            claveDe(t) <= claveDe(m) &&
            seTocan(caja, cajaDeSprite(t)),
        );
        if (tableros.length > 0) {
          const tras = ordenadoEn(m, Math.min(...tableros.map(claveDe)) - 0.02);
          const l = deLaPared.altoLibre(tras);
          if (l >= minimo) {
            m = tras;
            libre = l;
          }
        }
      }
      if (libre < minimo) continue;
      const s = encogido(m, libre);
      if (objetos.length === 0) return meter(s);
      // Encogida, sin bajar de `minimo`, hasta no tapar ni el objeto ni su
      // camino: la frontal que cuelga junto a una ciudad tapaba el pie de su
      // muralla.
      const libreDe = (tapa: (s: Sprite) => boolean): Sprite | undefined => {
        if (!tapa(s)) return s;
        if (tapa(encogido(m, minimo))) return undefined;
        let bajo = minimo;
        let alto = libre;
        for (let k = 0; k < 10; k++) {
          const medio = (bajo + alto) / 2;
          if (tapa(encogido(m, medio))) alto = medio;
          else bajo = medio;
        }
        return encogido(m, bajo);
      };
      const suelta = libreDe((t) => tapaUnObjeto(t) || tapaElCamino(t));
      if (suelta !== undefined) {
        sprites.push(suelta);
        return true;
      }
      // La diagonal, que no se encoge, pasa por detrás del objeto que taparía:
      // en su sitio, ordenada justo antes que él (como la muralla), si no tapa
      // su camino. Y desde #222 también la frontal o la ladera que ni encogida
      // dejaría de taparlo, si el objeto está a su pie (`alPie`; lo de lo alto,
      // detrás de la cara, lo tapa la cara), y la diagonal que solo tapaba un
      // camino que el objeto o una bajada pintan encima (`tapaElCamino(…,
      // true)`): esas se juzgan otra vez con la senda pintada
      // (`detrasDeUnObjeto`). Con la clave del pintor (`Sprite.clave`) siguen
      // en su sitio y sus juntas se leen por su pie. Sin esto la cara acababa
      // en seco a un lado de la mina, la ciudad o el nodo de abajo (s37 (1-3,
      // 25), s66 (4-6, 23)). Con dos centésimas: la bajada que llega al objeto
      // va a una (`llegaA`), encima de la pared.
      const antes = Math.min(...objetos.map(claveDe)) - 0.02;
      const detras = claveDe(s) < antes ? s : ordenadoEn(s, antes);
      if (reserva === 'ordenada' && !tapaElCamino(s)) {
        sprites.push(detras);
        return true;
      }
      if ((reserva === 'ordenada' || alPie(s)) && !tapaElCamino(detras, true)) {
        sprites.push(detras);
        detrasDeUnObjeto.push({ s: detras, ...(alQuitar === undefined ? {} : { alQuitar }) });
        return true;
      }
    }
    rechazos.push({
      caja: cajaDeSprite(modulos[0]),
      razon: objetos.length > 0 ? 'objeto' : 'puente',
    });
    return false;
  };
  // 4 · El relieve por celdas (R4): una pieza por pared, de junta a junta. Las
  // caídas al sur llevan las frontales de siempre, libres; las del este y el
  // oeste, su cadena de laderas; cada diagonal, su pieza; y donde una senda
  // cruza una caída hacia la cámara o de lado, la bajada encima (R5). Ninguna
  // pared se aparta de la senda: lo que baja lo pinta la bajada. Donde falta el
  // arte de un material o una caída va un marcador visible, no el sistema viejo.
  const azarDeLaderas = azarDe(semilla * 6007 + 11);
  const azarDelRelieve = azarDe(semilla * 4801 + 3);
  /** Las paredes E y O con ladera puesta, como `vx,vy,lado` de su celda. */
  const conLadera = new Set<string>();
  const celdaDeLadera = (l: Ladera, fila: number) =>
    `${l.lado === 'este' ? l.x + 1 : l.x},${fila + 0.5},${l.lado}`;
  const juegos = new Map<string, JuegoDeLadera | null>();
  /** El juego de una hoja de laderas, o null sin su arte. */
  const juegoDe = (hoja: string): JuegoDeLadera | null => {
    let j = juegos.get(hoja);
    if (j === undefined) {
      const ms = modulosDe(hoja);
      j = ms === null || ms.length === 0 ? null : juegoDeLadera(hoja, ms);
      juegos.set(hoja, j);
    }
    return j;
  };
  /** El sprite del módulo `m` desde la fila `y` de `l` (`colocarLadera`). */
  const spriteDeLadera = (m: ModuloDeLadera, hoja: string, l: Ladera, y: number): Sprite => {
    const tono = tonoDe(hoja);
    const sitio = colocarLadera(m, l, y);
    return {
      ...(tono === undefined ? {} : { tono }),
      src: m.src,
      nw: m.nw,
      nh: m.nh,
      ax: m.ax,
      ay: m.ay,
      x: sitio.x,
      y: sitio.y,
      alto: sitio.alto,
      clase: 'pared',
      color: '#4c463e',
      capa: 0,
      sombra: true,
      filaAlta: Math.floor(y),
    };
  };
  for (const l of rel.laderas) {
    const hoja = hojaDeLadera(l);
    const juego = juegoDe(hoja);
    if (juego === null) {
      // Sin el arte, una marca por fila, del filo al pie.
      for (let y = l.y0; y <= l.y1; y++) {
        const largo = 1 + l.caida * ALTO_DE_NIVEL;
        const s: Sprite = {
          ...deHoja(hoja, bordeDeLadera(l), y + largo, largo, 0, 'pared', '#4c463e', true),
          filaAlta: Math.floor(y),
        };
        if (
          ponerPared([s], s.alto, [
            [s.x, s.y],
            [s.x, y + 0.5],
          ])
        )
          conLadera.add(celdaDeLadera(l, y));
      }
      continue;
    }
    // Ni se corre ni se encoge: rompería la cadena. Si cae en la reserva de un
    // objeto o taparía un puente, no va.
    const ponerUna = (m: ModuloDeLadera, y: number): boolean => {
      const s = spriteDeLadera(m, hoja, l, y);
      if (
        !ponerPared(
          [s],
          s.alto,
          [
            [s.x, s.y],
            [s.x, y + m.ladera.largo / 2],
          ],
          'detras',
          () => {
            for (let k = 0; k < m.ladera.largo; k++) conLadera.delete(celdaDeLadera(l, y + k));
          },
        )
      )
        return false;
      for (let k = 0; k < m.ladera.largo; k++) conLadera.add(celdaDeLadera(l, y + k));
      return true;
    };
    // Lo que no entra se prueba fila a fila con los módulos de una, más
    // estrechos que un largo; si nada entra, quedan los peñascos del canto.
    for (const p of piezasDeLadera(l, l, juego, azarDeLaderas)) {
      if (ponerUna(p.modulo, p.y)) continue;
      for (let y = p.y; y < p.y + p.modulo.ladera.largo; y++)
        for (const m of juego.medios) if (m !== p.modulo && ponerUna(m, y)) break;
    }
  }

  // Las diagonales: una pieza por celda, por sus dos filos (`colocarDiagonal`).
  // Las que sustituye una rampa de muesca (§36) gastan su tirada igual: así las
  // demás sacan el mismo módulo con su arte y sin él, y la muesca no cambia el
  // resto del mapa (en s3 movía un módulo de (25, 25) y tapaba una senda).
  const deLasRampas = new Set(rampas.flatMap(celdasDeLaRampa));
  const conTirada = todasLasCeldas.filter(
    (c) =>
      esVisto(c.tipo) &&
      !sinPared.has(claveDeCelda(c)) &&
      c.tipo !== 'S' &&
      c.tipo !== 'E' &&
      c.tipo !== 'O',
  );
  /** La pieza de la diagonal `c`, con el módulo que saca `azar`. */
  function ponerDiagonal(c: Celda, azar: () => number): void {
    const hoja = hojaDeDiagonal(c);
    const papel = c.tipo.endsWith('convexa') ? 'convexa' : 'concava';
    const ms = (modulosDe(hoja) ?? []).filter(
      (m): m is ModuloDeDiagonal => m.diagonal?.papel === papel,
    );
    const m = ms[Math.floor(azar() * ms.length)];
    if (m === undefined) faltan.add(hoja);
    const s = m === undefined ? marcadorDeDiagonal(c) : spriteDeDiagonal(m, hoja, c);
    ponerPared([s], s.alto, puntosDeCelda(c), 'ordenada');
  }
  const porClave = new Map(rel.diagonales.map((c) => [claveDeCelda(c), c]));
  for (const t of conTirada) {
    const c = porClave.get(claveDeCelda(t));
    if (c === undefined) {
      if (deLasRampas.has(claveDeCelda(t))) azarDelRelieve();
      continue;
    }
    ponerDiagonal(c, azarDelRelieve);
  }

  // Las caídas al sur: las frontales de siempre, de junta a junta. Sus módulos
  // miden de 1 a 2 casillas de ancho; ninguno se sale de su tramo más de
  // `SALE_DE_SU_TRAMO`, que en un extremo está la diagonal que dobla la esquina.
  /** Los sitios de cada cara donde no cupo una frontal: ahí va su pedregal, después. */
  const sinFrontal = new Map<Cara, number[]>();
  // Con su propio azar: se ponen antes que las formaciones, y así no les
  // cambian las tiradas.
  const azarDeLasFrontales = azarDe(semilla * 3301 + 7);
  for (const c of rel.caras) ponerFrontales(c, azarDeLasFrontales);
  // Las paredes que un puente solo toca en la punta de su filo (#222,
  // `celdasBajoLosPuentes(…, true)`): llevan pieza, por detrás del puente
  // (`ponerPared`), con su propio azar: así el resto del mapa saca los mismos
  // módulos que antes. Las caídas al sur, cada una su cara de una celda; las
  // laderas, no (no ha salido ninguna que cierre un hueco).
  const azarJuntoAlPuente = azarDe(semilla * 7919 + 5);
  for (const c of juntoAlPuente.diagonales) ponerDiagonal(c, azarJuntoAlPuente);
  for (const c of juntoAlPuente.caras) ponerFrontales(c, azarJuntoAlPuente);

  /** Las frontales de la cara `c`, de junta a junta, con las tiradas de `azar`. */
  function ponerFrontales(c: Cara, azar: () => number): void {
    const azarDeLasFrontales = azar;
    const { pared: hoja } = materialDeCara(c.material);
    const filo = c.y + 1;
    const pie = filo + c.caida * ALTO_DE_NIVEL;
    const desde = c.x0;
    const hasta = c.x1 + 1;
    // Lo más bajo que se deja una pared: lo que mide la cara. Más baja, la cara
    // asomaría lisa por encima.
    const minimo = c.caida * ALTO_DE_NIVEL;
    const pared = (x: number, nombre?: string): Sprite => ({
      ...deHoja(
        hoja,
        x + (azarDeLasFrontales() - 0.5) * 0.1,
        pie + 0.05 + (azarDeLasFrontales() - 0.5) * 0.12,
        c.caida * ALTO_DE_NIVEL + 0.35 + azarDeLasFrontales() * 0.2,
        azarDeLasFrontales(),
        'pared',
        '#4c463e',
        true,
        nombre,
        undefined,
        azarDeLasFrontales,
      ),
      filaAlta: c.y,
    });
    /**
     * `s` dentro de su tramo: corrido hacia dentro; si no cabe, el módulo más
     * estrecho, y si tampoco, encogido sin bajar de `minimo`. En un tramo de una
     * casilla de caída 3 ni así cabe: va el más estrecho al mínimo, en el medio,
     * y lo que sobresale lo tapa la diagonal de al lado, que se pinta después.
     */
    const dentroDelTramo = (s: Sprite): Sprite => {
      const lo = desde - SALE_DE_SU_TRAMO;
      const hi = hasta + SALE_DE_SU_TRAMO;
      const modulos = yElMasEstrecho(s, hoja);
      for (const m of modulos) {
        const [x0, , x1] = cajaDeSprite(m);
        if (x1 - x0 > hi - lo) continue;
        const dx = x0 < lo ? lo - x0 : x1 > hi ? hi - x1 : 0;
        return dx === 0 ? m : { ...m, x: m.x + dx };
      }
      const e = modulos.at(-1) as Sprite;
      const alto = Math.max(minimo, Math.min(e.alto, ((hi - lo) * e.nh) / e.nw));
      const [x0, , x1] = cajaDeSprite(e, alto);
      return { ...e, alto, x: e.x + (lo + hi) / 2 - (x0 + x1) / 2 };
    };
    // Cada frontal, a un paso de la anterior, pero nunca más allá de lo que esa
    // cubrió: un módulo estrecho (los de nieve miden 0,65 de ancho por alto)
    // dejaba media celda sin pared. Al final, otra si el tramo no llegó a su junta.
    let cubierto = desde;
    let x = desde + 0.25;
    const ultima = hasta - 0.25 + 1e-9;
    while (x <= ultima || cubierto < hasta - 0.1) {
      const aqui = Math.min(x, hasta - 0.25);
      const s = dentroDelTramo(pared(aqui));
      if (
        ponerPared([s], minimo, [
          [s.x, s.y],
          [s.x, filo],
        ])
      )
        cubierto = Math.max(cubierto, cajaDeSprite(sprites.at(-1) as Sprite)[2]);
      else {
        cubierto = Math.max(cubierto, aqui + 0.3);
        // Donde no cabe ninguna pared, junto a un objeto, va un pedregal por la
        // cara, que se aparta de la senda: se pone con ella ya apartada.
        if (reservaEn(aqui, pie) === undefined)
          sinFrontal.set(c, [...(sinFrontal.get(c) ?? []), aqui]);
      }
      if (aqui >= hasta - 0.25) break;
      x = Math.min(x + 0.42 + azarDeLasFrontales() * 0.22, cubierto + 0.2);
    }
  }

  // Las rampas (#225): sus tres piezas en el hueco que abren. No pasan por la
  // puerta de la pared: el cuerpo es camino, y ninguna se encoge. Lo horneado
  // con el que se solapan (el hito de su nodo, la ciudad de su pie) va encima.
  for (const r of rampas) {
    const hoja = hojaDeRampa(r);
    const piezas = piezasDeRampa(catalogo, hoja);
    if (piezas === null) throw new Error(`la rampa de ${r.x},${r.y} no tiene su arte (${hoja})`);
    for (const p of PIEZAS_DE_LA_FORMA[r.forma]) {
      const m = piezas[p];
      if (m === undefined)
        throw new Error(`la rampa de ${r.x},${r.y} no tiene su pieza ${p} (${hoja})`);
      let s = spriteDeRampa(m, hoja, r);
      for (const n of sprites)
        if (esNodoHorneado(n) && claveDe(n) < claveDe(s) && seSolapan(s, n, perfilDe))
          s = ordenadoEn(s, claveDe(n) - 0.01);
      sprites.push(s);
    }
    // Y una frontal de su material sobre el extremo de fuera de cada costado, que
    // se pinta después y tapa la arista de su corte: donde el borde recto acaba
    // en una esquina (s2069 (15,5, 8)), no hay frontal vecina que la tape.
    // La muesca no la lleva: sus extremos dan a la cara de su fila, cuyas
    // frontales llegan a la junta y la tapan, o a otra esquina, y ahí el extremo
    // se funde a transparente. Con ella, la de junto a una ciudad (s2 (28, 26))
    // iba detrás de la ciudad, fuera del pie de toda cara.
    if (r.forma === 'muesca') continue;
    const { pared: hojaDePared } = materialDeCara(r.material);
    const e = masEstrecho(hojaDePared);
    if (e === undefined) continue;
    const [primera, ultima] = [
      PIEZAS_DE_LA_FORMA[r.forma][0],
      PIEZAS_DE_LA_FORMA[r.forma].at(-1) as PiezaDeRampa,
    ];
    const filo = r.y + FILA_DEL_FILO[primera];
    const pie = filo + r.caida * ALTO_DE_NIVEL;
    const tono = tonoDe(hojaDePared);
    for (const [borde, fuera] of [
      [r.x + TRAMO_DE_PIEZA_DE_RAMPA[primera][0], -1],
      [r.x + TRAMO_DE_PIEZA_DE_RAMPA[ultima][1], 1],
    ] as const) {
      const base: Sprite = {
        ...(tono === undefined ? {} : { tono }),
        src: e.src,
        nw: e.nw,
        nh: e.nh,
        ax: e.ax,
        ay: e.ay,
        x: borde,
        y: pie + 0.05,
        alto: r.caida * ALTO_DE_NIVEL + 0.4,
        clase: 'pared',
        color: '#4c463e',
        capa: 0,
        sombra: true,
        filaAlta: r.y,
      };
      // Su lado de dentro, `DENTRO_DEL_COSTADO` dentro del costado, donde aún
      // tiene su alto entero; el resto, por fuera.
      const [x0, , x1] = cajaDeSprite(base);
      const dentro = borde - fuera * DENTRO_DEL_COSTADO;
      const s = { ...base, x: base.x + (fuera > 0 ? dentro - x0 : dentro - x1) };
      // Junto a un objeto (la ciudad de s2069 (16, 8)) va detrás de él, como la diagonal.
      ponerPared(
        [s],
        s.alto,
        [
          [s.x, s.y],
          [s.x, filo],
        ],
        'ordenada',
      );
    }
  }

  // La senda se aparta de lo que la tapa (#206), menos junto a una bajada, que
  // la cruza por su rampa: ahí la tapa la bajada, que es camino.
  const queTapa = loQueTapa(sprites, catalogo);
  /**
   * Lo que dista `(x, y)` del centro de la casilla de acantilado, muro o
   * cordillera más cercana de alrededor, a lo largo de un eje (Chebyshev; 0,5
   * en su canto), o `LEJOS_DE_LA_BARRERA` si no hay.
   */
  const aLaBarrera = (x: number, y: number): number => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let d = LEJOS_DE_LA_BARRERA;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const bx = cx + dx;
        const by = cy + dy;
        if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
        const t = a.terreno[by * W + bx];
        if (t !== 'cliff' && t !== 'wall' && t !== 'mountain') continue;
        d = Math.min(d, Math.max(Math.abs(x - bx - 0.5), Math.abs(y - by - 0.5)));
      }
    return d;
  };
  // Lo que va por el arco de una puerta tampoco se aparta: es su paso.
  const juntoALaRampa = pasilloDe(
    [...bajadasDe_(suavizadas).map(rampaDe), ...tendidosDePuertas.map((t) => [t.p0, t.p1])],
    JUNTO_A_LA_RAMPA,
  );
  const conEdificio = new Set(
    a.objetos
      .filter((o) => o.kind === 'town' || o.kind === 'village')
      .map((o) => o.at.y * W + o.at.x),
  );
  /**
   * Si la senda que pasa por `(x, y)` pisaría el anillo de un recinto
   * (`pisaElAnillo`): la que pasa junto a una ciudad sin entrar se aparta de
   * sus torres como de una pared (s5 (30,36), tangente a la torre del oeste).
   */
  const anillos = [...puertasDe.values()];
  const pisaUnAnillo = (x: number, y: number) =>
    anillos.some(
      (r) =>
        Math.abs(x - r.contorno.centro[0]) < LADO_DEL_RECINTO &&
        Math.abs(y - r.contorno.centro[1]) < LADO_DEL_RECINTO &&
        pisaElAnillo(r, x, y, SEMIANCHO_DE_LA_HUELLA, true) !== undefined,
    );
  const apartar = (l: readonly Senda[]) =>
    apartarDeLoQueTapa(
      l,
      (x, y) => queTapa(x, y) === 'pared' || pisaUnAnillo(x, y),
      (x, y) => juntoALaRampa.en(x, y, () => true) !== undefined,
      (x, y, [x0, y0]) => {
        // Sin arrimarse a un acantilado, un muro ni una cordillera más de lo
        // que ya estaba: la roca de lo alto (`cimaDeRoca`, #205) se aparta de
        // la senda, y la corrida hacia su canto dejaba lisas 17 casillas más en
        // 1-40; la línea de la muralla solo deja cruzar por la puerta, y la
        // corrida hacia un lienzo lo pisaba (s439, #207); y en una cordillera
        // estrecha no cabía una cumbre (#204, s11 (20,11): 7 dominantes).
        // Junto a una ciudad, sí, hasta `CERCA_DE_LA_BARRERA_JUNTO_A_UN_RECINTO`: la
        // senda que baja entre una cordillera y la torre de una esquina no tenía
        // a dónde ir más que a la plaza (s5 (28, 35-36)).
        const tope = pisaUnAnillo(x0, y0)
          ? Math.min(aLaBarrera(x0, y0), CERCA_DE_LA_BARRERA_JUNTO_A_UN_RECINTO)
          : Math.min(aLaBarrera(x0, y0), LEJOS_DE_LA_BARRERA);
        if (aLaBarrera(x, y) < tope) return false;
        // Ni se mete en la plaza de una ciudad por la que no pasaba: entra por el
        // arco de una puerta, y la plaza, que no tapa el anillo, la dejaba pasar
        // por la muralla (s5, la senda de (28, 35) cruzaba la cara del oeste).
        if (anillos.some((r) => enLaPlaza(r.rect, x, y) && !enLaPlaza(r.rect, x0, y0)))
          return false;
        if (Math.floor(x) === Math.floor(x0) && Math.floor(y) === Math.floor(y0)) return true;
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const i = Math.floor(y) * W + Math.floor(x);
        // A otra casilla, solo si se pisa y no es la de un edificio.
        return a.franjaDe[i] === -1 && !conEdificio.has(i);
      },
    );
  const apartadas = apartar(suavizadas);
  const bajadasDeLasSendas = bajadasDe_(apartadas);
  // Y lo que se pinta pasa por la rampa de cada una, de su filo a su pie (#192).
  const trazos = sendasPorLosTendidos(apartadas, bajadasDeLasSendas.map(tendidoDeBajada));
  // El nodo entre dos niveles sin camino también es una rampa (#143): la pieza
  // va por su eje, sin senda que seguir (la tierra la lleva la pieza). Sin ella, el paso de la meseta al
  // llano no se veía (147 de 257 nodos entre niveles en 1-40).
  const bajadas = [...bajadasDeLasSendas, ...bajadasDeLosNodos()];
  // La pared que pasó por detrás de un objeto (#222) se juzga otra vez con la
  // senda que se pintará (`trazos`) y las bajadas, que van encima: si esconde
  // un trozo de `ESCONDIDO_DETRAS`, se quita, con su razón (`vaciaPorque`). En
  // la puerta se miraba la senda suavizada, y el enlace del pie de una rampa a
  // su trazo quedaba bajo la diagonal de al lado (s108 (4, 9)).
  {
    const piezas = bajadas.filter((b) => b.deUnaRampa !== true).map((b) => piezaDeBajada(b, 0));
    // Una a una, con las que ya pasaron: tres diagonales de una muesca que
    // esconden juntas la senda no se culpan una a otra (s129 (14-16, 37)).
    const sinJuzgar = new Set(detrasDeUnObjeto.map((d) => d.s));
    for (const { s, alQuitar } of detrasDeUnObjeto) {
      sinJuzgar.delete(s);
      const caja = cajaDeSprite(s);
      const cerca = (t: Caja, r: number) =>
        t[0] < caja[2] + r && t[2] > caja[0] - r && t[1] < caja[3] + r && t[3] > caja[1] - r;
      const cercanas = trazos.filter((l) => l.some(([x, y]) => cerca([x, y, x, y], 0.3)));
      if (cercanas.length === 0) continue;
      const vecinas = [...sprites, ...piezas].filter(
        (t) =>
          t !== s &&
          !sinJuzgar.has(t) &&
          (t.clase === 'pared' || t.clase === 'objeto') &&
          cerca(cajaDeSprite(t), 1),
      );
      const escondido = (ps: readonly Sprite[]) =>
        tramosBajoElRelieve(ps, cercanas, catalogo, ESCONDIDO_DETRAS).reduce(
          (n, t) => n + t.largo,
          0,
        );
      if (escondido([...vecinas, s]) <= escondido(vecinas) + 1e-9) continue;
      sprites.splice(sprites.indexOf(s), 1);
      rechazos.push({ caja, razon: 'objeto' });
      alQuitar?.();
    }
  }
  // Lo que necesitan la muralla (paso 3) y, antes, el sitio de los puestos, que
  // se mide contra la línea de cada una (`lineaDe`): sin azar, así que da lo
  // mismo calcularlo aquí.
  const sendaDeLaMuralla = sendaParaLaMuralla(trazos);
  /** Las puertas de muralla, con el sentido en que se cruzan (`ejeDelPaso`). */
  const puertasDeMuralla: PuertaDeMuralla[] = a.objetos.flatMap((o) => {
    if (o.kind !== 'node' || a.puentes.has(o.id) || a.pasos.get(o.id)?.barrera !== 'wall')
      return [];
    const [p, q] = ejeDelPaso(o.at, W, map.terrain)[0] ?? [];
    if (p === undefined || q === undefined) throw new Error(`la puerta ${o.id} no tiene paso`);
    return [{ id: o.id, at: [o.at.x, o.at.y], paso: [q[0] - p[0], q[1] - p[1]] }];
  });
  // Lo que cae bajo la huella de una ciudad, un pueblo o un nodo lo tapa el propio objeto.
  const bajoLaHuella = new Uint8Array(W * H);
  /** Las casillas que tapa cada ciudad y cada pueblo: su muralla une lo que llega a ella. */
  const huellas: (readonly [number, number])[][] = [];
  for (const o of a.objetos) {
    const huella = casillasDeLaHuella(o, o.at, recintos.get(o.id), W, H);
    for (const [x, y] of huella) bajoLaHuella[y * W + x] = 1;
    if (huella.length > 0 && o.kind !== 'node') huellas.push(huella);
    // Y el puente de la ciudad-puente, en su casilla del río y en la de
    // enfrente, donde apoya su estribo: puede ser el final de una barrera (en
    // 1-40, la montaña de s18, s26, s36 y s37), y la tapa él.
    const deLaCiudad = a.ciudadesPuente.get(o.id);
    if (deLaCiudad !== undefined)
      for (const p of [deLaCiudad.rio, deLaCiudad.enfrente]) bajoLaHuella[p.y * W + p.x] = 1;
  }
  /** Dónde se apoya cada muralla y de qué lado es cada casilla (`alrededorDeMurallas`). */
  const alrededorDeLaMuralla = alrededorDeMurallas(a, huellas, nivel);
  /**
   * La línea de cada franja de muro (`trazarLinea`), calculada una vez: la piden
   * su muralla y las vecinas, que miran sus juntas antes de poner sus torres.
   */
  const lineas = new Map<number, ReturnType<typeof trazarLinea>>();
  /** Las piezas de la línea de cada franja (`piezasDeLaLinea`), una vez, como la línea. */
  const piezasDeLasLineas = new Map<number, PiezasDeLaLinea>();
  const lineaDe = (f: Franja) => {
    let l = lineas.get(f.id);
    if (l === undefined) {
      l = trazarLinea(f);
      lineas.set(f.id, l);
    }
    return l;
  };

  // 2a · El puesto de cada nodo (puesto fronterizo, fase 4): su sitio, junto al
  // eje del paso, sin pisar senda, rampa ni tablero, sin tocar al héroe parado en
  // el nodo, otro objeto ni una pared, y en tierra (`sitiosDeLosPuestos`). Su
  // reserva entra con las de los objetos, para que nada de lo que se pone después
  // la tape, y sus tres obras, en la escena, con su condición (`Sprite.deNodo`).
  // El hito del neutral se queda donde estaba, en su nodo.
  const nodosConPuesto = a.objetos.filter((o) => o.kind === 'node');
  /** Las piezas de los recintos, que pone el 2b: el puesto mide contra sus torres. */
  const modulosDeLosRecintos = modulosDelRecinto(catalogo, faltan);
  const puentePorId = new Map(puentes.map((p) => [p.id, p]));
  /** La figura del héroe parado en cada nodo (en un puente, en su tablero): el puesto no la toca. */
  const heroeEnElNodo = new Map(
    nodosConPuesto.map(
      (o) =>
        [
          o.id,
          cajaDelHeroeEn(pieDeFigura(o.at, PIES.heroe, puentePorId.get(o.id)?.asiento)),
        ] as const,
    ),
  );
  const sinSitioParaElPuesto: string[] = [];
  {
    const piezasDeLasObras = Object.fromEntries(
      MEJORAS_DEL_PUESTO.map((m) => {
        const p = pieza(PIEZA_DEL_PUESTO[m]);
        if (p === null) faltan.add(PIEZA_DEL_PUESTO[m]);
        return [m, p];
      }),
    ) as Record<MejoraDelPuesto, Pieza | null>;
    const envoltura = envolturaDeLasObras(
      Object.fromEntries(
        MEJORAS_DEL_PUESTO.map((m) => [m, alrededorDeLaObra(m, piezasDeLasObras[m])]),
      ) as Record<MejoraDelPuesto, ReturnType<typeof alrededorDeLaObra>>,
    );
    const sitios = sitiosDeLosPuestos(
      nodosConPuesto.map((o) => {
        return {
          id: o.id,
          centro: puentePorId.get(o.id)?.asiento ?? [o.at.x + 0.5, o.at.y + 0.5],
          heroe: heroeEnElNodo.get(o.id) as Caja,
        };
      }),
      dondeNoVaUnPuesto({
        W,
        H,
        terreno: a.terreno,
        bajoUnRecinto,
        sendas: [...trazos, ...bajadas.map(rampaDe), ...puentes.map((p) => p.tablero)],
        ejes: [
          ...pasos.flatMap((p) => p.eje),
          ...nodosConPuesto
            .filter((o) => !a.puentes.has(o.id) && !pasos.some((p) => p.id === o.id))
            .flatMap((o) => ejeDelPaso(o.at, W, map.terrain)),
        ],
        ocupado: [
          ...reservas.values(),
          // El recinto, hasta el pie de sus torres del sur, que su envoltura no
          // cubre (H-F4-2): sus piezas se ponen después, en el 2b.
          ...[...recintos].map(([id, r]) =>
            hastaElPieDeSusTorres(envolturaDelRecinto(id, r), modulosDeLosRecintos.torres),
          ),
          ...sprites.filter((s) => s.objeto !== undefined || s.clase === 'pared'),
          ...a.franjas.filter((f) => f.barrera === 'wall').flatMap(murallaPorVenir),
          // La pieza de una bajada, en cualquier orden: su clave se decide después
          // (sube tras las paredes que pinta sobre su camino) y, medida con la de su
          // pie, una que acababa delante tapaba las tres obras (H-F4-3: s3 del
          // 64×64, node-33).
          ...bajadas
            .filter((b) => b.deUnaRampa !== true)
            .map((b) => ({
              ...piezaDeBajada(b, claveDeBajada(b, rel.vistas)),
              clave: Number.POSITIVE_INFINITY,
            })),
        ],
      }),
      envoltura,
    );
    sinSitioParaElPuesto.push(...sitios.sinSitio);
    const fondo = Math.max(...MEJORAS_DEL_PUESTO.map((m) => MEDIDAS_DEL_PUESTO[m].fondo));
    for (const { id, pie } of sitios.sitios) {
      const ocupa = envolturaDelPuesto(id, pie, envoltura);
      reservas.set(reservaDelPuesto(ocupa, fondo), ocupa);
      for (const m of MEJORAS_DEL_PUESTO)
        sprites.push(obraDelPuesto(id, m, piezasDeLasObras[m], pie));
    }
    indiceDeReservas = new Obstaculos<Medible>([...reservas.keys()]);
  }
  /**
   * Lo que no se tapa (#151): la senda; la rampa de cada bajada, más ancha que
   * la senda y con sus ribazos (R5); el tablero de cada puente, del que se
   * apartan también la pared (con la de la cara de detrás encima, el puente
   * quedaba tapado, #157); el eje de cada paso; las paredes del desnivel, que
   * la masa de delante no tapa (#216); y, como tope, lo que se pisa, que la
   * copa de la masa no tapa por los lados (`topeDeLoPisable`).
   */
  const caminosYPasos = [
    formaDeLaSenda(trazos),
    formaDeLaSenda(bajadas.map(rampaDe)),
    ...formasDeLosTableros(puentes),
    formaDeLosPasos(pasos),
  ];
  const paredes = formasDeLasParedes(sprites, perfilDe);
  const topes = [topeDeLoPisable(a.franjaDe, W)];
  const obstaculos = new Obstaculos<Medible>(
    [...caminosYPasos, ...reservas.keys(), ...paredes],
    topes,
  );
  /**
   * Lo mismo sin las reservas de los objetos: lo que mira el árbol que se
   * planta en una (`arbolEnLaReserva`), que en su lugar no tapa el objeto. Se
   * hace la primera vez que se pide.
   */
  let sinLasReservas: Obstaculos<Medible> | undefined;

  // 2b · Los recintos de las ciudades (`recinto.ts`): el anillo, con una puerta
  // en cada cara a la que llega un camino (la senda ya pasa por su arco), y las
  // casas, que dejan la calle a la senda que se pintará.
  /** Lo que puso cada recinto, por el id de su ciudad: lo que miran sus guardias. */
  const recintosPuestos = new Map<string, Recinto<ModuloConSrc>>();
  /** Los arcos de cada recinto con la clave con que se pintan, la de su sprite: lo que mira `arcosTapados`. */
  const arcosPintados = new Map<string, ArcoPintado[]>();
  /** Las torres, tramos y puertas de cada recinto con la clave y el `x` de su sprite: lo que mira `anilloMalOrdenado`. */
  const anillosPintados = new Map<string, PiezaPintada[]>();
  {
    const modulos = modulosDeLosRecintos;
    for (const r of puertasDe.values()) {
      const objeto = { id: r.id, kind: 'town' } as const;
      const calle = pasilloDe<ConImagen>(callesDeLasPuertas(r), MEDIA_CALLE);
      const recinto = recintoDe({
        id: r.id,
        rect: r.rect,
        semilla,
        puertas: r.puertas,
        modulos,
        // La casa, por su pie de su ancho: a `MEDIA_CALLE` de la calle de cada puerta
        // y fuera de la reserva de otro objeto. Lo de encima puede tapar la
        // calle de detrás: es una ciudad apiñada.
        entraLaCasa: (p) => {
          const ancho = (p.alto * p.nw) / p.nh;
          const izquierda = p.x - (p.ax * p.alto) / p.nh;
          return (
            !calle.pisa({
              nw: 1,
              nh: 1,
              ax: 0.5,
              ay: 1,
              x: izquierda + ancho / 2,
              y: p.y,
              alto: ALTO_DEL_PIE_DE_CASA,
              ancho,
            }) && reservaEn(p.x, p.y, r.id) === undefined
          );
        },
      });
      recintosPuestos.set(r.id, recinto);
      for (const p of [...recinto.torres, ...recinto.tramos, ...recinto.arcos, ...recinto.casas]) {
        const s = spriteDelRecinto(p, objeto);
        // El anillo cuyo pie cae en la reserva de otro objeto pasa por detrás
        // de él, como la muralla; las casas ya la dejaron (`entraLaCasa`).
        const otro = p.que === 'casa' ? undefined : reservaEn(s.x, s.y, r.id);
        const puesto = otro === undefined ? s : detrasDe(s, otro);
        if (otro === undefined) meter(s);
        else sprites.push(puesto);
        if (p.que !== 'casa')
          anillosPintados.set(r.id, [
            ...(anillosPintados.get(r.id) ?? []),
            { pieza: p, clave: claveDe(puesto), x: puesto.x },
          ]);
        if (p.que === 'puerta' && p.cara !== undefined)
          arcosPintados.set(r.id, [
            ...(arcosPintados.get(r.id) ?? []),
            { cara: p.cara, clave: claveDe(puesto) },
          ]);
      }
    }
  }
  /**
   * El sprite más estrecho de cada clase que se aparta: el que pregunta el
   * dardo. El de la cubierta, de las hojas que esparce: las de una regla (las
   * casas) van por su nombre y no salen de un dardo.
   */
  const moldes = new Map<Sprite['clase'], Pick<Sprite, 'nw' | 'nh' | 'ax' | 'ay'>>();
  for (const [clase, r] of Object.entries(APARTE) as [Sprite['clase'], Aparte | null][]) {
    if (r === null) continue;
    const hojas = clase === 'cubierta' ? HOJAS_QUE_SE_ESPARCEN : r.hojas;
    const ms = hojas.flatMap((h) => masEstrecho(h) ?? []);
    moldes.set(
      clase,
      ms.sort((p, q) => p.nw / p.nh - q.nw / q.nh)[0] ?? { nw: 1, nh: 1, ax: 0.5, ay: 1 },
    );
  }
  /**
   * Si `s` entra en su sitio: ni su pie sobre la reserva de un objeto ni,
   * encogido hasta su mínimo, sobre nada de lo que se aparta (`obstaculos`).
   * Es la pregunta de `poner` y la del dardo.
   */
  const entra = (s: Medible) => {
    const r = APARTE[s.clase];
    return r === null ? reservaEn(s.x, s.y) === undefined : !obstaculos.pisa(s, r.minimo(s.alto));
  };
  /**
   * El dardo de una clase en `(x, y)`: si entraría su sprite más estrecho con el
   * alto más bajo que vaya a tener. Así no se gasta un dardo donde `poner` no
   * podría poner nada, que dejaba el hueco pelado.
   */
  const entraria = (clase: Sprite['clase'], x: number, y: number, alto: number) => {
    const m = moldes.get(clase);
    if (m === undefined) return reservaEn(x, y) === undefined;
    return entra({ nw: m.nw, nh: m.nh, ax: m.ax, ay: m.ay, x, y, alto, clase });
  };
  /** `s` con el mayor alto, hasta el suyo, con el que no pisa nada de lo que se aparta. */
  const ajustado = (s: Sprite): Sprite => {
    const alto = obstaculos.altoLibre(s);
    return alto === s.alto ? s : { ...s, alto };
  };
  /**
   * La única puerta de lo que no es objeto ni nube a la escena; dice si entró.
   * Lo que se aparta del camino entra si `entra`, tan alto como quepa; si no,
   * se prueba el módulo más estrecho de su hoja, y si tampoco, no entra.
   *
   * Con `esbeltez`, el módulo que se ponga —el elegido o su reserva estrecha—
   * se encoge hasta no ser más esbelto que eso (`tumbado`): la cubierta de lo
   * que se pisa en un suelo `comoLaBarrera`. Va aquí y no en quien llama porque
   * la reserva estrecha es justo la pieza más esbelta de la hoja. Con `cumbre`,
   * la pieza es una cumbre (`Sprite.cumbre`). Con `enLoQueSePisa`, ni la elegida
   * ni la reserva son de `FUERA_DE_LO_QUE_SE_PISA`.
   */
  const poner = (
    hoja: string,
    x: number,
    y: number,
    alto: number,
    t: number,
    clase: Sprite['clase'],
    color: string,
    sombra: boolean,
    nombre?: string,
    porAncho?: number,
    tono?: string,
    esbeltez?: number,
    cumbre?: true,
    enLoQueSePisa = false,
  ): boolean => {
    const deLaHoja = deHoja(
      hoja,
      x,
      y,
      alto,
      t,
      clase,
      color,
      sombra,
      nombre,
      porAncho,
      azar,
      enLoQueSePisa,
    );
    const conTono = tono === undefined || deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono };
    const s = tumbado(cumbre === undefined ? conTono : { ...conTono, cumbre }, esbeltez);
    const r = APARTE[clase];
    if (r === null) return meter(s);
    if (!r.hojas.includes(hoja))
      throw new Error(`la hoja «${hoja}» no está entre las de la clase ${clase} (APARTE)`);
    if (entra(s)) return meter(ajustado(s));
    const e = masEstrecho(hoja, enLoQueSePisa);
    if (e === undefined || e.src === s.src) return false;
    const estrecho = tumbado(
      { ...s, src: e.src, nw: e.nw, nh: e.nh, ax: e.ax, ay: e.ay, alto: deLaHoja.alto },
      esbeltez,
    );
    return entra(estrecho) && meter(ajustado(estrecho));
  };
  /**
   * Una mata de la cubierta. Con `sePisa`, la de lo que se pisa de ese suelo:
   * rala si es `comoLaBarrera` y sin los módulos de `FUERA_DE_LO_QUE_SE_PISA`.
   */
  const mata = (hoja: string, x: number, y: number, alto: number, sePisa?: Suelo) =>
    poner(
      hoja,
      x,
      y,
      alto,
      azar(),
      'cubierta',
      MARCADOR.cubierta as string,
      false,
      undefined,
      undefined,
      undefined,
      sePisa !== undefined && CUBIERTA[sePisa].comoLaBarrera ? ESBELTEZ_DE_LO_PISABLE : undefined,
      undefined,
      sePisa !== undefined,
    );
  /**
   * Gasta las tiradas de `mata(hoja, …, sePisa)` sin poner nada: la `t` y, si la
   * hoja tiene módulos, la del módulo que sortea `deHoja` (sin nombre). Es la
   * mata que la labranza no pone (`labranza.ts`): con la corriente de siempre,
   * compartida por toda la cubierta, saltarse sus tiradas movía la cubierta de
   * los otros suelos y las nubes. Si `mata`, `poner` o `deHoja` tiran una vez
   * más, esto también: lo comprueba `sin-cambios.mts` de
   * `docs/agents/2026-10-20-labranza-en-campos/`.
   */
  const gastarLasTiradasDeMata = (hoja: string, sePisa?: Suelo): void => {
    azar();
    if ((modulosDe(hoja, sePisa !== undefined)?.length ?? 0) > 0) azar();
  };
  const altoDeMata = (s: Suelo) => CUBIERTA[s].alto * (MATA_MAS_BAJA + azar() * 0.6);

  /** Los módulos de `hoja` que van en una cordillera: sin las mesas (`esMesa`, #212). */
  const modulosDeCordillera = (hoja: string): readonly Modulo[] =>
    (modulosDe(hoja) ?? []).filter((m) => !esMesa(hoja, m));
  const { cresta: ruidoDeCresta, grupos: ruidoDeLosGrupos } = ruidosDelMacizo(semilla);
  const esbeltos = new Map<string, readonly Modulo[]>();
  /** Los módulos de pico ya elegidos, por su sitio: lo que mira `repiteVecino`. */
  const picosElegidos = new Map<string, { x: number; y: number; nombre: string }[]>();
  const celdaDePico = (x: number, y: number) => `${Math.floor(x / 2)},${Math.floor(y / 2)}`;
  /** Si a menos de `VECINO_IGUAL` de `(x, y)` ya se eligió `nombre` de la misma hoja. */
  const repiteVecino = (hoja: string, nombre: string, x: number, y: number): boolean => {
    const cx = Math.floor(x / 2);
    const cy = Math.floor(y / 2);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const p of picosElegidos.get(`${cx + dx},${cy + dy}`) ?? [])
          if (p.nombre === `${hoja}/${nombre}` && Math.hypot(p.x - x, p.y - y) < VECINO_IGUAL)
            return true;
    return false;
  };
  const apuntarPico = (hoja: string, m: Modulo, x: number, y: number): Modulo => {
    const k = celdaDePico(x, y);
    picosElegidos.set(k, [
      ...(picosElegidos.get(k) ?? []),
      { x, y, nombre: `${hoja}/${m.nombre}` },
    ]);
    return m;
  };
  /**
   * El material de cada casilla de cordillera: uno por macizo
   * (`materialDeLosMacizos`), por el suelo de su meseta, como su pared (#216).
   */
  const materialDeMacizo = materialDeLosMacizos(
    a.franjas.filter((f) => f.barrera === 'mountain').flatMap((f) => f.casillas),
    W,
    H,
    meseta,
  );
  /**
   * Un módulo de `hoja` por su silueta: con `cumbre` 0, de los más chatos
   * (ancho entre alto); con 1, de los más esbeltos, con algo de azar para que
   * no se repitan. El orden del catálogo es el de las imágenes y no dice nada
   * del tamaño: elegir por él (`t`) no elegía nada.
   *
   * Y que llegue a `alto` sin ampliarse más de `AMPLIACION_MAXIMA`: en el
   * volcán los más esbeltos son los más pequeños (130-175 px), y la cumbre se
   * quedaba con la imagen más pequeña estirada al alto mayor. Si el elegido no
   * llega, el más cercano en silueta que sí, primero hacia los menos esbeltos;
   * si ninguno, el más grande, y quien lo pone baja el alto a su tope.
   */
  const siluetaDe = (
    hoja: string,
    cumbre: number,
    alto: number,
    x: number,
    y: number,
  ): Modulo | undefined => {
    let ms = esbeltos.get(hoja);
    if (ms === undefined) {
      ms = [...modulosDeCordillera(hoja)].sort((p, q) => q.nw / q.nh - p.nw / p.nh);
      esbeltos.set(hoja, ms);
    }
    if (ms.length === 0) return undefined;
    const centro = Math.round(cumbre * (ms.length - 1));
    const k = Math.max(0, Math.min(ms.length - 1, centro + Math.round((azar() - 0.5) * 4)));
    let primero: Modulo | undefined;
    for (let d = 0; d < ms.length; d++)
      for (const j of d === 0 ? [k] : [k - d, k + d]) {
        const m = ms[j];
        if (m === undefined || altoMaximoDe(m) < alto) continue;
        // El que ya lleva un vecino se salta si hay otro que llegue: en 1-40
        // el 43 % de los picos tenía su mismo módulo a menos de 1,2 casillas
        // (#204), y la cordillera se leía como un sello repetido.
        if (!repiteVecino(hoja, m.nombre, x, y)) return apuntarPico(hoja, m, x, y);
        primero ??= m;
      }
    return apuntarPico(hoja, primero ?? ms.reduce((p, q) => (q.nh > p.nh ? q : p)), x, y);
  };
  /**
   * Cómo crece una masa: el bosque por la hondura de `analizar`, más alto hacia
   * dentro; la montaña por su macizo (`macizo.ts`), de la falda a las cumbres.
   * `modulo` da la hoja, el alto (por `factor`, el azar de cada uno) y el módulo.
   */
  const formaDeMasa = (
    f: Franja,
  ): {
    radio: (x: number, y: number) => number;
    altoMasBajo: (x: number, y: number) => number;
    modulo: (
      i: number,
      x: number,
      y: number,
      factor: number,
      delDardo: boolean,
    ) => { hoja: string; alto: number; t: number; nombre?: string; tono?: string };
    /** Las cumbres de la franja (`Macizo.cumbres`) con su módulo; el bosque no tiene. */
    cumbres: readonly CumbrePuesta[];
    /** Si `(x, y)` cae en un claro de la falda (#218): sin dardos; el bosque no tiene. */
    claro: (x: number, y: number) => boolean;
  } => {
    if (f.barrera === 'forest') {
      const hondura = (x: number, y: number) => a.hondura[Math.floor(y) * W + Math.floor(x)] ?? 1;
      return {
        radio: (x, y) => BOSQUE.radio(hondura(x, y)),
        altoMasBajo: () => BOSQUE.alto(1) * 0.75,
        modulo: (i, _x, _y, factor, delDardo) => {
          const h = a.hondura[i] ?? 1;
          return {
            hoja: hojaDeMasa('forest', a.suelo[i] as Suelo, azar, h),
            alto: BOSQUE.alto(h) * factor,
            t: delDardo ? Math.min(1, (h - 1) / 3) * 0.7 + azar() * 0.3 : azar() * 0.5,
          };
        },
        cumbres: [],
        claro: () => false,
      };
    }
    // De la franja y no de la casilla del pico: un pico que desborda la franja
    // cae en una casilla de fuera, que no es de ningún macizo.
    const material = materialDeMacizo.get(f.casillas[0] as number);
    if (material === undefined) throw new Error(`la franja ${f.id} de cordillera no tiene macizo`);
    // La cumbre es roca maciza, no aguja: `picos-afilados` mide 2 casillas de
    // ancho a 3 de alto, y una cumbre de 3 × 3 es una mole.
    const hojaDeCumbre = material === 'roca' ? 'picos-roca' : hojaDePico(material, () => 0, 1);
    const macizo = macizoDe(
      f.casillas,
      W,
      H,
      ruidoDeCresta,
      (x, y, alto) => {
        // Con el módulo más ancho de los que llegan: si ese cabe, cabe el que salga.
        // Con las mesas, aunque no salgan (`modulosDeCordillera`): con ellas fuera
        // cabían más cumbres en la arena, cada una con su tirada, y la corriente
        // de azar de todo lo que se viste después cambiaba (#212).
        const ms = modulosDe(hojaDeCumbre) ?? [];
        const llegan = ms.filter((m) => altoMaximoDe(m) >= alto);
        const m = (llegan.length > 0 ? llegan : ms).reduce<Modulo | undefined>(
          (p, q) => (p === undefined || q.nw / q.nh > p.nw / p.nh ? q : p),
          undefined,
        );
        if (m === undefined) return true;
        // Una cumbre, como al ponerla: lo que se pisa no cambia cuántas hay ni dónde.
        const s = {
          nw: m.nw,
          nh: m.nh,
          ax: m.ax,
          ay: m.ay,
          x,
          y,
          alto,
          clase: 'masa' as const,
          cumbre: true as const,
        };
        return reservaEn(x, y) === undefined && obstaculos.altoLibre(s) >= alto - 1e-9;
      },
      ruidoDeLosGrupos,
    );
    return {
      radio: macizo.radio,
      claro: macizo.claro,
      altoMasBajo: (x, y) => macizo.alto(x, y) * 0.75,
      modulo: (_i, x, y, factor) => {
        const cumbre = macizo.cumbre(x, y);
        const hoja = hojaDePico(material, azar, cumbre);
        const alto = macizo.alto(x, y) * factor;
        const m = siluetaDe(hoja, cumbre, alto, x, y);
        const luz = luzDeCumbre(cumbre);
        const tono = [tonoDe(hoja), luz].filter((t) => t !== undefined).join(' ');
        return {
          hoja,
          // Sin módulo (la hoja aún no está hecha) va el marcador, que no se amplía.
          alto: m === undefined ? alto : Math.min(alto, altoMaximoDe(m)),
          t: cumbre,
          ...(m === undefined ? {} : { nombre: m.nombre }),
          ...(luz === undefined ? {} : { tono }),
        };
      },
      cumbres: macizo.cumbres.map((c) => {
        const hoja = hojaDeCumbre;
        const m = moduloDeCumbre(hoja, c.alto, c.x, c.y);
        const luz = luzDeCumbre(1);
        return {
          x: c.x,
          y: c.y,
          hoja,
          alto: m === undefined ? c.alto : Math.min(c.alto, altoMaximoDe(m)),
          tono: [tonoDe(hoja), luz].filter((t) => t !== undefined).join(' '),
          ...(m === undefined ? {} : { nombre: m.nombre, ancho: m.nw / m.nh }),
        };
      }),
    };
  };
  /**
   * El módulo de una cumbre: uno de los que llegan a su alto sin ampliarse más
   * de `AMPLIACION_MAXIMA`, al azar y sin repetir el de una cumbre vecina; si
   * ninguno llega, el más alto, que quien lo pone baja a su tope.
   */
  const moduloDeCumbre = (hoja: string, alto: number, x: number, y: number) => {
    const ms = modulosDeCordillera(hoja);
    if (ms.length === 0) return undefined;
    const llegan = ms.filter((m) => altoMaximoDe(m) >= alto && !repiteVecino(hoja, m.nombre, x, y));
    const m =
      llegan.length > 0
        ? (llegan[Math.floor(azar() * llegan.length)] as Modulo)
        : ms.reduce((p, q) => (q.nh > p.nh ? q : p));
    return apuntarPico(hoja, m, x, y);
  };

  // 3 · Las formaciones, franja a franja.
  /** Los tramos y torres de muralla que entraron en la escena: lo que mira el guardia. */
  const pintados: TramoPintado[] = [];
  /** Las torres que entraron, por su casilla: el guardia mide su rectángulo contra la senda. */
  const torresPintadas = new Map<string, Sprite>();
  let sinFormacion = 0;
  const cubiertas = new Uint8Array(W * H);
  for (const f of a.franjas) {
    const puestos = vestirFranja(f);
    for (const i of f.casillas) if (puestos.has(i)) cubiertas[i] = 1;
  }
  for (let i = 0; i < W * H; i++) if (bajoLaHuella[i]) cubiertas[i] = 1;
  // Y la casilla de barrera por la que sale recta la senda del arco de una
  // ciudad (`tendidosDeLasPuertas`): solo cuando ni la salida más corta acaba
  // en lo que se pisa, la puerta diagonal cuyo camino llega por un acceso de
  // lado con la casilla de la esquina de barrera. Es el umbral de la ciudad:
  // sin la salida recta, la senda pasa por el pie de la torre del vértice.
  for (const t of tendidosDePuertas)
    for (let k = 0; k <= 10; k++) {
      const x = Math.floor(t.p0[0] + ((t.p1[0] - t.p0[0]) * k) / 10);
      const y = Math.floor(t.p0[1] + ((t.p1[1] - t.p0[1]) * k) / 10);
      if (x >= 0 && y >= 0 && x < W && y < H) cubiertas[y * W + x] = 1;
    }
  // Y lo que tapa una pared del desnivel por el centro: la masa no la cubre
  // (#216), así que la casilla de montaña al pie de la diagonal que dobla junto
  // a un nodo se queda sin pico, pero no a la vista (s166 (26, 33), y las tres
  // que ya había en 1-200: s36, s91 y s105, #222).
  const tapaLaPared = loQueTapa(sprites, catalogo);
  for (const f of a.franjas)
    for (const i of f.casillas)
      if (!cubiertas[i] && tapaLaPared((i % W) + 0.5, Math.floor(i / W) + 0.5) !== null)
        cubiertas[i] = 1;
  for (const f of a.franjas)
    for (const i of f.casillas)
      if (!cubiertas[i]) {
        sinFormacion++;
      }

  function vestirFranja(f: Franja): Set<number> {
    const dentro = new Set(f.casillas);
    const puestos = new Set<number>();
    const caja = cajaDe(f.casillas, W);

    if (f.barrera === 'mountain')
      conCorriente(azarDeLasCordilleras, () => vestirMasa(f, dentro, puestos));
    else if (f.barrera === 'forest') vestirMasa(f, dentro, puestos);
    else if (f.barrera === 'wall') {
      vestirMuralla(f);
      for (const i of f.casillas) puestos.add(i);
      // El resto de la franja: escombro al pie de la muralla, nunca la cubierta
      // del suelo vecino, que en tierra eran huertos y carros sobre el muro (s57).
      rellenoDeRocas(f, dentro, 0.42, 0.32, 1);
    } else if (f.barrera === 'cliff') {
      // El acantilado es el borde de una meseta (#143): la cara la pinta el
      // pintor y arriba van roca y peñascos. Ya no hay mesas sueltas.
      const desde = sprites.length;
      rellenoDeRocas(f, dentro, 0.34, 0.6, 0.3);
      conCorriente(azarDeLoAlto, () => {
        rocaEnLoAlto(desde);
        cimaDeRoca(f, sprites.slice(desde));
      });
      for (const i of f.casillas) puestos.add(i);
    } else if (f.barrera === 'water') {
      // El agua la pinta el pintor como superficie; aquí, la orilla.
      for (const i of f.casillas) puestos.add(i);
      const puntos = esparcir(
        [caja[0] - 0.3, caja[1] - 0.3, caja[2] + 0.3, caja[3] + 0.3],
        () => 0.28,
        (x, y) => {
          const cx = Math.floor(x);
          const cy = Math.floor(y);
          // En la raya entre agua y tierra, a ambos lados.
          const enAgua = dentro.has(cy * W + cx);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (dentro.has(ny * W + nx) !== enAgua) {
              const borde = dx !== 0 ? (dx > 0 ? cx + 1 : cx) : dy > 0 ? cy + 1 : cy;
              const d = dx !== 0 ? Math.abs(x - borde) : Math.abs(y - borde);
              if (d < 0.22) return entraria('orilla', x, y, 0.3);
            }
          }
          return false;
        },
        azar,
      );
      for (const p of puntos)
        poner('orilla', p.x, p.y, 0.3 + azar() * 0.12, azar(), 'orilla', '#5a5030', false);
    }
    return puestos;
  }

  /**
   * Una masa de bosque o de montaña: puntos densos con el pie en la franja. La
   * copa pasa del borde, que así no es recto, pero no tapa por los lados más de
   * `MARGEN_SOBRE_LO_PISABLE` de lo que se pisa (`topeDeLoPisable`). Apunta en
   * `puestos` las casillas que cubre.
   */
  function vestirMasa(f: Franja, dentro: ReadonlySet<number>, puestos: Set<number>): void {
    const caja = cajaDe(f.casillas, W);
    const casillaDe = (x: number, y: number) => Math.floor(y) * W + Math.floor(x);
    const marcar = (x: number, y: number) => puestos.add(casillaDe(x, y));
    const desdeLaMasa = sprites.length;
    const forma = formaDeMasa(f);
    // Las cumbres antes que nada (#204): son la pieza grande de la franja, y
    // los dardos no caen sobre ellas.
    const cumbres: CumbrePuesta[] = [];
    for (const c of forma.cumbres)
      if (
        poner(
          c.hoja,
          c.x,
          c.y,
          c.alto,
          1,
          'masa',
          MARCADOR[f.barrera] as string,
          true,
          c.nombre,
          undefined,
          c.tono,
          undefined,
          true,
        )
      ) {
        cumbres.push(c);
        // Las casillas que tapa su cuerpo están vestidas aunque no lleven dardo.
        for (const i of f.casillas)
          if (bajoLaCumbre(c, (i % W) + 0.5, Math.floor(i / W) + 0.5)) puestos.add(i);
      }
    // Los dardos, hasta 0,35 por debajo de la franja, pero no del mapa: un pie
    // fuera del mapa dejaba su copa sobre la última fila sin que fuera de
    // ninguna (13-10-2026).
    const puntos = esparcir(
      [caja[0] - 0.2, caja[1] - 0.2, caja[2] + 0.2, Math.min(caja[3] + 0.35, H)],
      forma.radio,
      (x, y) => {
        // El pie, siempre dentro de la franja. Había un «un poco fuera, si la
        // casilla de al lado es de la franja», pero `round(x − ½)` es `floor(x)`
        // y repetía esta misma pregunta: lo que desbordaba era el ancho de la
        // copa, y eso lo para el tope de lo que se pisa (`topeDeLoPisable`).
        const i = casillaDe(Math.min(Math.max(x, 0), W - 0.01), Math.min(Math.max(y, 0), H - 0.01));
        return (
          dentro.has(i) &&
          !cumbres.some((c) => bajoLaCumbre(c, x, y)) &&
          !forma.claro(x, y) &&
          entraria('masa', x, y, forma.altoMasBajo(x, y))
        );
      },
      azar,
    );
    for (const p of puntos) {
      const i = casillaDe(
        Math.min(Math.max(p.x, 0), W - 0.01),
        Math.min(Math.max(p.y, 0), H - 0.01),
      );
      // Un pico al sur de un paso lo taparía entero: `poner` lo encoge hasta
      // que su rectángulo sale del pasillo.
      const m = forma.modulo(i, p.x, p.y, 0.85 + azar() * 0.3, true);
      if (
        poner(
          m.hoja,
          p.x,
          p.y,
          m.alto,
          m.t,
          'masa',
          MARCADOR[f.barrera] as string,
          true,
          m.nombre,
          undefined,
          m.tono,
        )
      )
        marcar(p.x, p.y);
    }
    // La casilla en la que no cayó ningún dardo se rellena: si no, una casilla
    // que bloquea se leería como un claro que se pisa. Se prueba cerca del
    // centro y, si ahí no entra, por el resto de la casilla, de más cerca a más
    // lejos: una casilla suelta con caminos por tres lados queda mordida en
    // las esquinas por los tramos en diagonal.
    for (const i of f.casillas) {
      if (puestos.has(i)) continue;
      // En un recinto, nada: lo de dentro es la plaza de la ciudad (criterio 8b),
      // y su anillo y sus casas la tapan.
      if (bajoUnRecinto[i] === 1) {
        puestos.add(i);
        continue;
      }
      const cx = i % W;
      const cy = Math.floor(i / W);
      const m = forma.modulo(i, cx + 0.5, cy + 0.65, 0.75 + azar() * 0.25, false);
      const sitios = [
        [cx + 0.3 + azar() * 0.4, cy + 0.45 + azar() * 0.4] as const,
        ...SITIOS_DE_RELLENO.map(([dx, dy]) => [cx + dx, cy + dy] as const),
      ];
      for (const [x, y] of sitios)
        if (
          entraria('masa', x, y, m.alto) &&
          poner(
            m.hoja,
            x,
            y,
            m.alto,
            m.t,
            'masa',
            MARCADOR[f.barrera] as string,
            true,
            m.nombre,
            undefined,
            m.tono,
          )
        ) {
          marcar(x, y);
          break;
        }
      if (!puestos.has(i) && f.barrera === 'forest' && arbolEnLaReserva(m, cx, cy)) puestos.add(i);
      // Un claro de la falda (#218): su pico bajo y, alrededor, pedregal de la
      // roca de su meseta. Es montaña y no se pisa: el suelo asoma, no se abre.
      if (forma.claro(cx + 0.5, cy + 0.5))
        for (let k = 0; k < PEÑASCOS_DEL_CLARO; k++) {
          const x = cx + 0.15 + azar() * 0.7;
          const y = cy + 0.2 + azar() * 0.7;
          if (peñascoDeLoAlto(meseta[i] as Suelo, x, y, 0.5)) marcar(x, y);
        }
      // Si en el claro no entró nada en los sitios del relleno (una casilla
      // suelta entre un acantilado y la senda, s2 (3, 22)), los dardos que el
      // claro había quitado: una casilla de montaña nunca se queda sin nada.
      if (!puestos.has(i))
        for (const p of esparcir(
          [cx, cy, cx + 1, cy + 1],
          forma.radio,
          (x, y) =>
            !cumbres.some((c) => bajoLaCumbre(c, x, y)) &&
            entraria('masa', x, y, forma.altoMasBajo(x, y)),
          azar,
        )) {
          const d = forma.modulo(i, p.x, p.y, 0.85 + azar() * 0.3, true);
          if (
            poner(
              d.hoja,
              p.x,
              p.y,
              d.alto,
              d.t,
              'masa',
              MARCADOR[f.barrera] as string,
              true,
              d.nombre,
              undefined,
              d.tono,
            )
          ) {
            marcar(p.x, p.y);
            break;
          }
        }
    }
    if (f.barrera === 'mountain' && cumbres.length === 0) unoQueDomine(desdeLaMasa);
  }

  /**
   * El árbol de una casilla de bosque en la que no entró ninguno porque cae en
   * la reserva de un objeto: en 1-40, 93 casillas, todas junto a una ciudad y
   * la mitad la de su sur, donde la reserva no deja ni un pie (QA, 14-10-2026).
   * Sin un árbol, la casilla solo se distinguía de lo que se pisa por el
   * sotobosque: s1 (14, 24) y (28, 35), s13 (17, 22) y s27 (25, 18) se leían
   * como un parche de tierra junto al camino.
   *
   * Como la pared que pasa por la reserva (#221): va si no tapa el objeto ni su
   * camino. No lo tapa porque su caja no toca la de ningún objeto (ni delante
   * ni detrás, que escondido no se lee); de su camino lo aparta lo de siempre
   * (`sinLasReservas`: la senda, las rampas, los pasos, los tableros y lo que se
   * pisa). Un módulo, por los sitios del relleno, y se queda con el sitio donde
   * sale más alto sin bajar de `ALTO_MINIMO_DE_MASA`: con el primero que
   * entraba salían pinos de 0,34 a 0,41, al norte de la casilla, que no se
   * veían. Va por `sprites.push`, como la pared: su pie está en la reserva a
   * propósito, y `basesSobreReserva` es lo que cae ahí sin mirar el objeto.
   */
  function arbolEnLaReserva(
    m: { hoja: string; alto: number; t: number; nombre?: string; tono?: string },
    cx: number,
    cy: number,
  ): boolean {
    sinLasReservas ??= new Obstaculos<Medible>([...caminosYPasos, ...paredes], topes);
    const indice = sinLasReservas;
    // Con las obras de los puestos: su reserva es de las que aquí no se miran.
    const objetos = sprites.filter((o) => (o.objeto !== undefined || esObra(o)) && o.src !== null);
    const tapaUnObjeto = (s: Sprite) => {
      const c = cajaDeSprite(s);
      return objetos.some((o) => seTocan(c, cajaDeSprite(o)));
    };
    const conAlto = (s: Sprite, alto: number): Sprite => (alto === s.alto ? s : { ...s, alto });
    const deLaHoja = deHoja(m.hoja, cx, cy, m.alto, m.t, 'masa', MARCADOR.forest as string, true);
    const modulo =
      m.tono === undefined || deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono: m.tono };
    let mejor: Sprite | undefined;
    for (const [dx, dy] of SITIOS_DE_RELLENO) {
      const x = cx + dx;
      const y = cy + dy;
      if (reservaEn(x, y) === undefined) continue;
      const s = { ...modulo, x, y };
      if (indice.pisa(s, ALTO_MINIMO_DE_MASA)) continue;
      if (tapaUnObjeto(conAlto(s, ALTO_MINIMO_DE_MASA))) continue;
      // El mayor alto que no pisa nada ni tapa un objeto: la caja crece con el
      // alto, así que la bisección vale.
      let bajo = ALTO_MINIMO_DE_MASA;
      let alto = indice.altoLibre(s);
      if (tapaUnObjeto(conAlto(s, alto)))
        for (let k = 0; k < 10; k++) {
          const medio = (bajo + alto) / 2;
          if (tapaUnObjeto(conAlto(s, medio))) alto = medio;
          else bajo = medio;
        }
      else bajo = alto;
      if (mejor === undefined || bajo > mejor.alto)
        mejor = { ...conAlto(s, bajo), enLaReserva: true };
    }
    if (mejor === undefined) return false;
    sprites.push(mejor);
    return true;
  }

  /**
   * Mete un tramo o una torre de muralla en la escena; dice si entró. Nunca se
   * salta por una reserva, que dejaba el hueco por el que se leía que la muralla
   * se rodeaba (s33 (2-4, 23-24), s27 (9-10, 11-12)):
   *
   * - Lo que llega a una puerta es parte de ella: ni pregunta por su reserva,
   *   que es para que nada se plante en el paso, ni cuenta como base sobre ella.
   *   Lo que sale hacia el sur iría delante y la tapaba entera (s2 (23,22)): se
   *   pinta donde va pero se ordena justo antes que la puerta, que queda encima
   *   y el lienzo sale de debajo de ella.
   * - Si su pie cae en la reserva de otro objeto (o en la de un puesto), pasa
   *   por detrás de él igual.
   */
  function meterEnLaMuralla(s: Sprite, puerta: PuertaDeMuralla | undefined, antes = 0): boolean {
    const delante =
      puerta === undefined
        ? entraria('muro', s.x, s.y, s.alto)
          ? undefined
          : reservaEn(s.x, s.y)
        : sprites.find((o) => o.objeto?.id === puerta.id);
    if (puerta !== undefined && delante === undefined)
      throw new Error(`la puerta ${puerta.id} no está en la escena`);
    if (delante === undefined) return entraria('muro', s.x, s.y, s.alto) && meter(s);
    sprites.push(detrasDe(s, delante, antes));
    return true;
  }

  /**
   * El tramo de muralla de norte a sur (§29), de lado: se le ve el adarve y la
   * cara del este, donde el `profundidad` de la hoja era una tira de almenas de
   * 0,55 casillas vista desde su extremo. Dos piezas, por el sitio. Sin ellas,
   * el de la hoja.
   */
  function tramoNorteSur(sitio: string, x: number, pie: number, color: string): Sprite {
    const id = TRAMOS_NORTE_SUR[varianteDeId(sitio, TRAMOS_NORTE_SUR.length)] as string;
    const p = pieza(id);
    if (p === null) {
      faltan.add(id);
      return deHoja(
        'muro',
        x,
        pie,
        1.05,
        0.5,
        'muro',
        color,
        true,
        'profundidad',
        ANCHO_DE_TRAMO.profundidad,
      );
    }
    // Por el medio: el adarve se corre algo al este según se aleja, y con el
    // ancla derivada (el pie del extremo cercano) toda la tirada quedaba al este.
    return {
      src: p.src,
      nw: p.nw,
      nh: p.nh,
      ax: p.nw / 2,
      ay: p.ay,
      x,
      y: pie,
      alto: ALTO_DEL_TRAMO_NORTE_SUR,
      clase: 'muro',
      color,
      capa: 0,
      sombra: true,
    };
  }

  /**
   * Una tirada de muralla de norte a sur: los pasos de norte a sur seguidos en
   * una columna (`pasos`, de norte a sur), en piezas del mismo módulo a un paso
   * de su tirada unas de otras (`tiradaNorteSur`), que es lo que tapa el testero
   * de cada una con la de delante. Una por paso, en la misma columna y a una
   * casilla, la de atrás enseñaba su testero en la junta (s41 (20, 25-27)). La
   * tirada cubre lo que cubrían ellas, salvo `HOLGURA_DE_LA_TIRADA` en cada
   * punta, que es una torre o una puerta; de un solo paso, la pieza de siempre.
   * Cada pieza va con el paso más cercano (`paso`); si va detrás de la puerta de
   * la punta norte lo decide quien la pone (`detrasDeLaPuerta`). Sin arte, null.
   */
  function tiradaDelMapa(
    pasos: readonly Paso[],
    sitio: string,
    color: string,
  ): PiezaDeTirada[] | null {
    const id = TRAMOS_NORTE_SUR[varianteDeId(sitio, TRAMOS_NORTE_SUR.length)] as string;
    const p = pieza(id);
    if (p === null) return null;
    const m = moduloNorteSur(p);
    const alto = ALTO_DEL_TRAMO_NORTE_SUR;
    const fondo = alto * FONDO_DEL_ADARVE;
    /** El pie de la pieza de siempre de un paso: el del medio, como la torre, `+ 0.75`. */
    const pieDe = (q: Paso) => (q.a[1] + q.b[1]) / 2 + 0.75;
    const primero = pasos[0] as Paso;
    const pie0 = pieDe(primero);
    const sur = pieDe(pasos.at(-1) as Paso);
    const piezas = tiradaNorteSur(
      m,
      alto,
      primero.a[0] + 0.5,
      pie0 - fondo,
      sur,
      pasos.length === 1 ? 0 : HOLGURA_DE_LA_TIRADA,
    );
    return piezas.map((q) => ({
      tramo: {
        src: m.src,
        nw: m.nw,
        nh: m.nh,
        ax: m.ax,
        ay: m.ay,
        x: q.x,
        y: q.y,
        alto,
        clase: 'muro',
        color,
        capa: 0,
        sombra: true,
      },
      paso: Math.min(pasos.length - 1, Math.max(0, Math.round(q.y - pie0))),
    }));
  }

  /**
   * Si la pieza `tramo` de una tirada de norte a sur va detrás de la puerta de su
   * punta norte (`puertaNorte`): su adarve pasa del pie de la puerta.
   */
  function detrasDeLaPuerta(tramo: Sprite, puertaNorte: PuertaDeMuralla | undefined): boolean {
    if (puertaNorte === undefined) return false;
    const laPuerta = sprites.find((o) => o.objeto?.id === puertaNorte.id);
    return (
      laPuerta !== undefined && tramo.y - ALTO_DEL_TRAMO_NORTE_SUR * FONDO_DEL_ADARVE < laPuerta.y
    );
  }

  /** La línea de una franja de muro (`trazaDeMuralla`), con sus puertas y cómo entra su torre. */
  function trazarLinea(f: Franja) {
    const dentro = new Set(f.casillas);
    const color = MARCADOR.wall as string;
    // Por coordenadas y dentro del mapa: con el índice, la vecina de la izquierda
    // de una puerta en la columna 0 era la última casilla de la fila de arriba, y
    // la puerta (0,17) de s443 se tomaba por puerta de la franja del borde
    // contrario. Su línea arrancaba de ella, no llegaba a nada y se quedaba en una
    // torre suelta.
    const suyas = puertasDeMuralla.filter((p) =>
      [-1, 0, 1].some((dy) =>
        [-1, 0, 1].some((dx) => {
          const x = p.at[0] + dx;
          const y = p.at[1] + dy;
          return x >= 0 && y >= 0 && x < W && y < H && dentro.has(y * W + x);
        }),
      ),
    );
    // Una franja pequeña es ruina salvo que lleve puerta: la muralla larga que
    // se parte deja el muro alrededor de su puerta (#208), en trozos de cinco o
    // seis casillas que `analizar` cuenta como mancha, y la puerta iba entre
    // dos ruinas.
    const hoja = f.uso === 'obstaculo' && suyas.length === 0 ? 'ruina' : 'muro';
    /** La torre de la casilla `[x, y]`, la que se pinta y la que se mide contra la senda. */
    const torreEn = ([x, y]: readonly [number, number]) =>
      deHoja(
        hoja,
        x + 0.5,
        y + 0.75,
        ALTO_DE_TORRE,
        0.5,
        'muro',
        color,
        true,
        TORRES_DEL_MURO[(x + y) % 2],
      );
    // La torre de una casilla tal como entra: entera si no tapa la senda; si no,
    // encogida hasta no taparla, como mucho a `TORRE_MAS_BAJA`, y si ni así
    // cabe, corrida dentro de su casilla (`CORRIMIENTOS_DE_TORRE`) al primer
    // sitio donde quepa. Con la senda de 0,32 (#191), la torre suelta de s27
    // (21,32) tapaba su borde aun encogida. Sin sitio, undefined.
    const encogida = (t: Sprite) => {
      const libre = sendaDeLaMuralla.altoLibre(t);
      return libre === t.alto ? t : { ...t, alto: Math.max(libre, TORRE_MAS_BAJA * t.alto) };
    };
    const torreQueCabe = (c: readonly [number, number]): Sprite | undefined => {
      const alta = torreEn(c);
      return CORRIMIENTOS_DE_TORRE.map(([dx, dy]) =>
        encogida({ ...alta, x: alta.x + dx, y: alta.y + dy }),
      ).find((t) => !sendaDeLaMuralla.pisa(t));
    };
    const e = trazaDeMuralla(
      f.casillas.map((i) => [i % W, Math.floor(i / W)] as const),
      suyas,
      alrededorDeLaMuralla,
      (c) => !sendaDeLaMuralla.pisa(torreEn(c)),
      (c) => torreQueCabe(c) !== undefined,
    );
    return { hoja, suyas, torreEn, encogida, torreQueCabe, e };
  }

  /**
   * Las torres de las puntas de una muralla que tocan su apoyo —montaña,
   * acantilado, agua o el borde—, arrimadas a él (#232): el lienzo acaba en el
   * centro de su casilla y sin ella quedaba media casilla de hueco hasta la
   * montaña, que en una franja de una de ancho son picos bajos (s36 (21,20)). Va
   * también junto a la puerta, que es donde acaba un brazo de una casilla.
   * `arrimada` da la torre de `c`, corrida si es una de ellas.
   */
  function arrimadasDe(f: Franja) {
    const { suyas, torreEn, e } = lineaDe(f);
    const contra = puntasContraSuApoyo(e.pasos, suyas, (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      return (APOYOS_DE_MURALLA as readonly TerrainKind[]).includes(
        a.terreno[y * W + x] as TerrainKind,
      );
    });
    const arrimada = (c: readonly [number, number]): Sprite => {
      const t = torreEn(c);
      const d = contra.get(`${c}`);
      return d === undefined ? t : { ...t, x: t.x + d[0] * ARRIMO, y: t.y + d[1] * ARRIMO };
    };
    return { contra, arrimada };
  }

  /**
   * La torre de muralla de la casilla `c` de la línea de `f`, como entra: arrimada
   * a su apoyo si es una punta que se apoya y, si así pisa la senda, la que cabe
   * (`torreQueCabe`) o, si ninguna, encogida en su sitio.
   */
  function torreDeLaCasilla(f: Franja, c: readonly [number, number]): Sprite {
    const { torreEn, encogida, torreQueCabe } = lineaDe(f);
    const enSuApoyo = arrimadasDe(f).arrimada(c);
    return !sendaDeLaMuralla.pisa(enSuApoyo)
      ? enSuApoyo
      : (torreQueCabe(c) ?? encogida(torreEn(c)));
  }

  /**
   * Lo que levantará la muralla de `f` (paso 3), de las piezas de su línea
   * (`piezasDeLaLinea`, las mismas que pone `vestirMuralla`), para que el sitio de
   * un puesto (paso 2a) no quede detrás de ella: el tramo suelto de cada paso, las
   * piezas de cada tirada de norte a sur, sus torres (`torresDeLaLinea`, sin las que
   * quitarán las de otras murallas) y las de las puntas que se apoyan. Puede ser
   * algo más de lo que lleve (el tramo suelto de un paso que va en su tirada, una
   * torre que otra muralla quitará), nunca menos.
   */
  function murallaPorVenir(f: Franja): Sprite[] {
    const { sueltos, tiradas } = piezasDeLaLinea(f);
    const { contra, arrimada } = arrimadasDe(f);
    return [
      ...sueltos.values(),
      // Las piezas de una tirada no caen donde el tramo suelto de su paso: van a un
      // paso de su tirada unas de otras (`tiradaNorteSur`), y la del sur de una
      // tirada que acaba en el borde baja más que él. Sin ellas, el puesto de una
      // puerta en la última fila quedaba detrás de la tirada (s18 (28,41), con las
      // ciudades en su región).
      ...[...tiradas.values()].flatMap((t) => t?.map((q) => q.tramo) ?? []),
      ...torresDeLaLinea(f).map((c) => torreDeLaCasilla(f, c)),
      ...[...contra.keys()].map((k) => arrimada(k.split(',').map(Number) as [number, number])),
    ];
  }

  /** Las torres de la línea de `f` (`torresDe`), sin las que se apilarían con `otras`. */
  function torresDeLaLinea(
    f: Franja,
    otras: readonly (readonly [number, number])[] = [],
  ): ReturnType<typeof torresDe> {
    const { suyas, torreEn, e } = lineaDe(f);
    return torresDe(
      e,
      suyas.map((p) => p.at),
      (c) => !sendaDeLaMuralla.pisa(torreEn(c)),
      ([x, y]) => alrededorDeLaMuralla.bajoCiudad(x, y).length > 0,
      otras,
    );
  }

  /**
   * Las piezas de los pasos de la línea de `f`: el tramo suelto de cada paso
   * (`tramoDelPaso`) y, de cada tirada de norte a sur (`tiradasDeLaFranja`), sus
   * piezas (`tiradaDelMapa`; `null` sin arte, y entonces van los sueltos). **Lo que
   * levanta `vestirMuralla` y lo que mide el puesto (`murallaPorVenir`)**, hecho una
   * vez: eran dos cuentas, y la del puesto ya se había quedado atrás (QA de la fase
   * 4: la tirada de s18).
   */
  function piezasDeLaLinea(f: Franja): PiezasDeLaLinea {
    const hechas = piezasDeLasLineas.get(f.id);
    if (hechas !== undefined) return hechas;
    const { hoja, e } = lineaDe(f);
    const color = MARCADOR.wall as string;
    const tiradas = new Map(
      tiradasDeLaFranja(f).map(
        (t) => [t, tiradaDelMapa(t, `${f.id}:${(t[0] as Paso).a}`, color)] as const,
      ),
    );
    const piezas: PiezasDeLaLinea = {
      sueltos: new Map(e.pasos.map((p) => [p, tramoDelPaso(f, p, hoja)])),
      tiradas,
    };
    piezasDeLasLineas.set(f.id, piezas);
    return piezas;
  }

  /**
   * Los pasos de norte a sur de la línea de `f`, en tiradas: los seguidos en una
   * columna, sin una puerta en la junta (la puerta, que va delante, ya es una
   * punta). Los leen la muralla (`vestirMuralla`) y lo que levantará
   * (`murallaPorVenir`).
   */
  function tiradasDeLaFranja(f: Franja): Paso[][] {
    const { hoja, suyas, e } = lineaDe(f);
    const deFondo = (p: Paso) => hoja === 'muro' && ejeDe(p) === 'profundidad';
    const yNorte = (p: Paso) => Math.min(p.a[1], p.b[1]);
    const tiradas: Paso[][] = [];
    for (const p of e.pasos
      .filter(deFondo)
      .sort((p, q) => p.a[0] - q.a[0] || yNorte(p) - yNorte(q))) {
      const t = tiradas.at(-1);
      const ultimo = t?.at(-1);
      const junta = yNorte(p);
      if (
        t !== undefined &&
        ultimo !== undefined &&
        ultimo.a[0] === p.a[0] &&
        yNorte(ultimo) + 1 === junta &&
        !suyas.some((q) => q.at[0] === p.a[0] && q.at[1] === junta)
      )
        t.push(p);
      else tiradas.push([p]);
    }
    return tiradas;
  }

  /**
   * El tramo de muralla de un paso de su línea, suelto (sin la tirada de norte a
   * sur, `tiradaDelMapa`). El recto se apoya por el medio del paso. El diagonal
   * lleva el ancla en su punta baja (la que deriva el taller): puesto en el medio,
   * el lienzo quedaba medio paso corrido hacia arriba y no llegaba a la casilla de
   * abajo, que se leía sin muro (s57 (8,7)). Se apoya en la de abajo, `b`.
   */
  function tramoDelPaso(f: Franja, p: Paso, hoja: string): Sprite {
    const eje = ejeDe(p);
    const color = MARCADOR.wall as string;
    const diagonal = eje === 'diagonal-baja' || eje === 'diagonal-sube';
    const x = diagonal ? p.b[0] + 0.5 : (p.a[0] + p.b[0]) / 2 + 0.5;
    const pie = diagonal ? p.b[1] + 0.75 : (p.a[1] + p.b[1]) / 2 + 0.75;
    return hoja === 'muro' && eje === 'profundidad'
      ? tramoNorteSur(`${f.id}:${p.a}`, x, pie, color)
      : deHoja(hoja, x, pie, 1.05, 0.5, 'muro', color, true, eje, ANCHO_DE_TRAMO[eje]);
  }

  /**
   * Una muralla por franja de muro (#183): un lienzo seguido por su línea
   * (`trazaDeMuralla`), que pasa por cada puerta y llega a la barrera vecina, y
   * torres separadas (`torresDe`). Lo que entra se apunta en `pintados`, que es
   * lo que cuenta el guardia (`murallaSinLeer`).
   */
  function vestirMuralla(f: Franja): void {
    const { suyas, e } = lineaDe(f);
    const { sueltos, tiradas } = piezasDeLaLinea(f);
    // Las torres obligadas de las otras murallas (`torresObligadas`), que irán
    // seguro: la punta o la casilla sola de esta que se apile con una se queda
    // sin la suya (s18 (12,23), una ruina de una casilla junto a la esquina de
    // la muralla vecina).
    const otras = a.franjas
      .filter((g) => g.barrera === 'wall' && g.id !== f.id)
      .flatMap((g) => {
        const otra = lineaDe(g);
        const enPuerta = otra.suyas.map((p) => p.at);
        return torresObligadas(otra.e.pasos).filter(
          ([x, y]) =>
            alrededorDeLaMuralla.bajoCiudad(x, y).length === 0 &&
            !enPuerta.some((p) => Math.max(Math.abs(p[0] - x), Math.abs(p[1] - y)) <= 1),
        );
      });
    const puertaDe = (p: Paso) =>
      suyas.find((q) => [p.a, p.b].some(([x, y]) => x === q.at[0] && y === q.at[1]));
    const tiradaDe = new Map([...tiradas.keys()].flatMap((t) => t.map((p) => [p, t] as const)));
    const vestidas = new Set<readonly Paso[]>();
    for (const p of e.pasos) {
      const puerta = puertaDe(p);
      const tirada = tiradaDe.get(p);
      if (tirada !== undefined) {
        // La tirada entera, en el sitio del primero de sus pasos que llega.
        if (vestidas.has(tirada)) continue;
        vestidas.add(tirada);
        const primero = tirada[0] as Paso;
        const norte = Math.min(primero.a[1], primero.b[1]);
        const puertaNorte = suyas.find((q) => q.at[0] === primero.a[0] && q.at[1] === norte);
        const piezas = tiradas.get(tirada) ?? null;
        if (piezas !== null) {
          const entraron = tirada.map(() => true);
          // Las de detrás de la puerta, en su orden: de delante atrás, cada una
          // un poco antes que la anterior.
          let detras = 0;
          for (const { tramo, paso } of piezas) {
            const ok = detrasDeLaPuerta(tramo, puertaNorte)
              ? meterEnLaMuralla(tramo, puertaNorte, 0.001 * detras++)
              : meterEnLaMuralla(tramo, puertaDe(tirada[paso] as Paso));
            if (!ok) entraron[paso] = false;
          }
          tirada.forEach((q, i) => {
            if (entraron[i]) pintados.push({ franja: f.id, a: q.a, b: q.b });
          });
          continue;
        }
      }
      const tramo = sueltos.get(p) as Sprite;
      if (meterEnLaMuralla(tramo, puerta)) pintados.push({ franja: f.id, a: p.a, b: p.b });
    }
    const { contra, arrimada } = arrimadasDe(f);
    const yaPuestas = (): (readonly [number, number])[] => [
      ...[...torresPintadas.keys()].map((k) => k.split(',').map(Number) as [number, number]),
      ...otras,
    ];
    const torres = torresDeLaLinea(f, yaPuestas());
    for (const c of torres) {
      // La que no cabe y va igual es la de una casilla sin tramos o la de una
      // esquina (`torresDe`): entra como quepa (`torreQueCabe`) y, si no cabe de
      // ninguna manera (solo una casilla sin tramos: la línea no dobla donde la
      // torre no entra), encogida donde está.
      const torre = torreDeLaCasilla(f, c);
      if (meterEnLaMuralla(torre, undefined)) {
        pintados.push({ franja: f.id, a: c, b: c });
        torresPintadas.set(`${c}`, torre);
      }
    }
    // Las puntas que `torresDe` deja sin torre (junto a la puerta) la llevan si
    // cabe entera y no se apila con otra.
    for (const k of contra.keys()) {
      const c = k.split(',').map(Number) as [number, number];
      if (torres.some((t) => `${t}` === k) || yaPuestas().some((t) => seApilan(t, c))) continue;
      const torre = arrimada(c);
      if (sendaDeLaMuralla.pisa(torre)) continue;
      if (meterEnLaMuralla(torre, undefined)) {
        pintados.push({ franja: f.id, a: c, b: c });
        torresPintadas.set(k, torre);
      }
    }
  }

  /**
   * El suelo de una franja que no es masa (el pie de la muralla, lo alto de un
   * acantilado): sobre todo la cubierta de su suelo, y una parte `roca` de
   * peñascos y picos bajos de su material. Antes era todo escombro y la franja
   * se leía como un pedregal.
   *
   * El suelo es el que se pinta (`pintado`, el de su meseta), no el más cercano
   * de cualquier nivel (`Analisis.suelo`, #220): con ese, lo alto llevaba la
   * cubierta de la región baja de al lado —nieve y abetos nevados sobre la
   * lava de s13 (16-24, 4-7), hierba sobre la nieve de s80 (18, 12-13)—, 494
   * piezas en 1-40 (`cubiertaDeOtroNivel`).
   */
  function rellenoDeRocas(
    f: Franja,
    dentro: Set<number>,
    radio: number,
    alto: number,
    roca: number,
  ): void {
    const caja = cajaDe(f.casillas, W);
    // El dardo pregunta por una mata, que es lo que sale casi siempre; la roca
    // se aparta con el mismo pasillo.
    const puntos = esparcir(
      caja,
      () => radio,
      (x, y) => {
        const i = Math.floor(y) * W + Math.floor(x);
        return (
          dentro.has(i) &&
          entraria('cubierta', x, y, CUBIERTA[pintado[i] as Suelo].alto * MATA_MAS_BAJA)
        );
      },
      azar,
    );
    for (const p of puntos) {
      const i = Math.floor(p.y) * W + Math.floor(p.x);
      const s = pintado[i] as Suelo;
      const tirada = azar();
      const deRoca = f.barrera === 'cliff' ? sueloDeLaRoca(i) : s;
      if (tirada < roca * 0.5 && f.barrera === 'cliff') picoDeLoAlto(deRoca, p.x, p.y, alto);
      else if (tirada < roca) peñascoDeLoAlto(deRoca, p.x, p.y, alto);
      else mata(hojaDeCubierta(s, azar()), p.x, p.y, altoDeMata(s));
    }
  }

  /**
   * Una cordillera sin cumbre —no cupo ninguna: una senda, un paso o una rampa
   * cerca— se queda con picos de alto parecido, una alfombra de pinchos que el
   * guardia de #204 cuenta (s9 (20,24): 8 de 14 dominaban al cambiar el azar con
   * #143). Si pasan de `MAS_CUMBRES` los que llegan a 0,8 del mayor, el más alto
   * que pueda sube hasta dejarlos atrás, sin ampliarse de más
   * (`altoMaximoDe`) ni pisar nada (`altoLibre`). Sin azar: no mueve lo que se
   * viste después.
   *
   * El que sube hace de cumbre (`Sprite.cumbre`) y, como ella, no mira lo que
   * se pisa: con el tope de lo pisable, en una banda junto a la hierba ninguno
   * podía ensancharse, y s38 (24, 34) se quedaba con 8 picos iguales (el guardia
   * de #204 pide 6 como mucho).
   */
  function unoQueDomine(desde: number): void {
    const picos = sprites
      .map((s, k) => ({ s, k }))
      .slice(desde)
      .filter(({ s }) => s.clase === 'masa' && s.src?.startsWith('modulos/picos-') === true);
    if (picos.length < 4) return;
    const mayor = Math.max(...picos.map(({ s }) => s.alto));
    if (picos.filter(({ s }) => s.alto >= 0.8 * mayor).length <= MAS_CUMBRES) return;
    const hace = mayor / 0.8 + 0.01;
    for (const { s, k } of [...picos].sort((p, q) => q.s.alto - p.s.alto || p.k - q.k)) {
      const cumbre = { ...s, alto: Math.min(altoMaximoDe(s), hace), cumbre: true as const };
      const alto = obstaculos.altoLibre(cumbre);
      if (alto < hace) continue;
      sprites[k] = { ...cumbre, alto };
      return;
    }
  }

  /**
   * El suelo cuya roca es la de la casilla `i` (`materialDeLaCimaEn`): lo que
   * leen las hojas de picos y el tono del pedregal. En lo alto de un acantilado
   * es el de su cara, no el de su suelo (#212).
   */
  function sueloDeLaRoca(i: number): Suelo {
    const propio = pintado[i] as Suelo;
    const material = materialDeLaCimaEn[i] as string;
    if (CARA_DE_SUELO[propio] === material) return propio;
    const otro = SUELO_DE_LA_ROCA[material];
    if (otro === undefined)
      throw new Error(
        `no hay suelo para la roca «${material}»: añádelo a SUELO_DE_LA_ROCA (colocar/tablas.ts)`,
      );
    return otro;
  }

  /** Un pico bajo de la roca del suelo `s` en lo alto de un acantilado. */
  function picoDeLoAlto(s: Suelo, x: number, y: number, alto: number): boolean {
    return poner(
      hojaDeMasa('mountain', s, azar),
      x,
      y,
      alto * (0.9 + azar() * 0.6),
      azar() * 0.4,
      'roca',
      MARCADOR.cliff as string,
      true,
    );
  }

  /** Peñascos caídos del pedregal del suelo `s`. */
  function peñascoDeLoAlto(s: Suelo, x: number, y: number, alto: number): boolean {
    return poner(
      'rocas-caidas',
      x,
      y,
      alto * 0.6 * (0.8 + azar() * 0.5),
      azar() * 0.6,
      'roca',
      MARCADOR.cliff as string,
      true,
      undefined,
      undefined,
      materialDeCara(CARA_DE_SUELO[s]).pedregal,
    );
  }

  /**
   * En lo alto de un acantilado de un suelo cuya cubierta es de la roca de la
   * barrera (la arena, la lava), esa cubierta es la misma que abajo: los
   * bloques y los huesos de la arena que se pisa (#205, s34). Ahí, de lo que
   * puso `rellenoDeRocas` desde `desde`, cada mata se cambia por roca en su
   * sitio (mitad picos, mitad peñascos): con una de cada cuatro que quedaba,
   * los huesos seguían salpicando la meseta. Se cambian
   * después, y no en la tirada del relleno, para que el relleno gaste la misma
   * corriente de azar que antes.
   */
  function rocaEnLoAlto(desde: number): void {
    const cambiadas: Sprite[] = [];
    for (let k = sprites.length - 1; k >= desde; k--) {
      const m = sprites[k] as Sprite;
      const s = pintado[Math.floor(m.y) * W + Math.floor(m.x)] as Suelo;
      if (m.clase !== 'cubierta' || !CUBIERTA[s].comoLaBarrera) continue;
      sprites.splice(k, 1);
      cambiadas.push(m);
    }
    for (const m of cambiadas) {
      const s = sueloDeLaRoca(Math.floor(m.y) * W + Math.floor(m.x));
      if (azar() < 0.5) picoDeLoAlto(s, m.x, m.y, 0.6);
      else peñascoDeLoAlto(s, m.x, m.y, 0.6);
    }
  }

  /**
   * Lo alto de un acantilado no se lee como suelo (#205): cada casilla lleva al
   * menos un pico de la roca de su cara (`sueloDeLaRoca`, #212) de `ALTO_DE_LO_ALTO` o más, y la de una
   * meseta ancha, más (`picosDeLaCima`). Con solo el relleno, una meseta de 2-3 de ancho salía con la cubierta y unas piedras,
   * como la nieve pisable de al lado (s443 (14-16, 9-11)), y la de arena, con
   * los mismos bloques bajos y huesos que la arena que se pisa (s34 (17-22,
   * 5-7)). Se prueba por la casilla de más cerca a más lejos del centro de su
   * mitad baja y solo donde cabe sin encogerse por debajo del umbral: la senda,
   * los pasos y las reservas mandan (`entra`, `altoLibre`).
   */
  function cimaDeRoca(f: Franja, puestos: readonly Sprite[]): void {
    const cuantos = new Map<number, number>();
    for (const s of puestos.filter(esDeLoAlto)) {
      const k = Math.floor(s.y) * W + Math.floor(s.x);
      cuantos.set(k, (cuantos.get(k) ?? 0) + 1);
    }
    for (const i of f.casillas) {
      const cx = i % W;
      const cy = Math.floor(i / W);
      const vecinas = (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).filter(([dx, dy]) => {
        const x = cx + dx;
        const y = cy + dy;
        return x >= 0 && y >= 0 && x < W && y < H && a.terreno[y * W + x] === 'cliff';
      }).length;
      const faltan = picosDeLaCima(vecinas) - (cuantos.get(i) ?? 0);
      if (faltan <= 0) continue;
      const hoja = hojaDeMasa('mountain', sueloDeLaRoca(i), azar);
      const alto = ALTO_DE_LA_CIMA * (vecinas === 4 ? ALTO_EN_LO_ANCHO : 1);
      // Junto a una senda, el módulo elegido puede no caber por ancho y el más
      // estrecho de la hoja sí.
      const estrecho = masEstrecho(hoja);
      const puestosAqui: Sprite[] = [];
      for (const [dx, dy] of SITIOS_DE_RELLENO) {
        if (puestosAqui.length >= faltan) break;
        const x = cx + dx;
        const y = cy + dy;
        // Varios en una casilla, apartados: si no, se apilan en el mismo sitio.
        if (puestosAqui.some((p) => Math.hypot(p.x - x, p.y - y) < SEPARACION_EN_LA_CIMA)) continue;
        const pico = deHoja(
          hoja,
          x,
          y,
          alto * (1 + azar() * 0.35),
          0.3 + azar() * 0.5,
          'roca',
          MARCADOR.cliff as string,
          true,
        );
        const cabe = [
          pico,
          ...(estrecho === undefined || estrecho.src === pico.src
            ? []
            : [
                {
                  ...pico,
                  src: estrecho.src,
                  nw: estrecho.nw,
                  nh: estrecho.nh,
                  ax: estrecho.ax,
                  ay: estrecho.ay,
                },
              ]),
        ].find((p) => entra(p) && obstaculos.altoLibre(p) >= ALTO_DE_LO_ALTO);
        if (cabe === undefined) continue;
        meter(ajustado(cabe));
        puestosAqui.push(cabe);
      }
    }
  }

  /**
   * El pedregal de cada cara, por su índice en `sprites`: los peñascos (donde
   * no entró una pared) y las rocas de su pie. Su tono se decide con todo puesto
   * (`tonoDelPedregalSuelto`).
   */
  const pedregalDeCara: number[] = [];
  /**
   * El pedregal es pared y la pared no se aparta de la senda (`APARTE`): no lo
   * pregunta a `obstaculos`, sino a un pasillo con el margen de su pared.
   */
  const pasilloDelPedregal = pasilloDe(trazos, SEMIANCHO_DE_PARED);
  /**
   * Peñascos de `rocas-caidas` de `desde` hacia `filo`, cada uno en la `x` que
   * se le pida a su altura, entonados con `tono`, fuera de toda senda y por la
   * puerta de la pared:
   * donde una frontal no cupo (la reserva de un objeto), y en el canto de un
   * barranco o de una ladera que no entró. Hacen de la pared: cuelgan de la
   * fila de encima de su filo (`Sprite.filaAlta`).
   */
  const peñascos = (desde: number, filo: number, xEn: (y: number) => number, tono: string) => {
    for (let y = desde + 0.05; y > filo + 0.15; y -= 0.26 + azar() * 0.12) {
      const deLaHoja: Sprite = {
        ...deHoja(
          'rocas-caidas',
          xEn(y),
          y,
          0.3 + azar() * 0.18,
          azar() * 0.6,
          'pared',
          '#5a5248',
          true,
        ),
        filaAlta: Math.ceil(filo) - 1,
      };
      const roca = deLaHoja.src === null ? deLaHoja : { ...deLaHoja, tono };
      // Como pedregal que es, apartado de toda senda con el margen de su pared,
      // no solo de la que baja: 4 pisaban una senda al pie (#150, N3).
      const libre = pasilloDelPedregal.altoLibre(roca);
      if (libre < ENCOGER_HASTA * roca.alto) continue;
      if (
        ponerPared(
          yElMasEstrecho(libre === roca.alto ? roca : { ...roca, alto: libre }, 'rocas-caidas'),
          ENCOGER_HASTA * roca.alto,
          [[roca.x, y]],
          'fuera',
        ) &&
        roca.src !== null
      )
        pedregalDeCara.push(sprites.length - 1);
    }
  };
  // El pedregal de cada cara, con la senda ya apartada: los peñascos donde no
  // cupo la frontal (sin ellos quedaba una losa lisa; cada peñasco mira la
  // reserva en su propio pie) y las rocas de su pie.
  for (const c of carasConPuentes) {
    const { pedregal: tonoDelPedregal } = materialDeCara(c.material);
    const filo = c.y + 1;
    const pie = filo + c.caida * ALTO_DE_NIVEL;
    const desde = c.x0;
    const hasta = c.x1 + 1;
    for (const aqui of sinFrontal.get(c) ?? [])
      peñascos(
        pie,
        filo,
        () => Math.min(hasta - 0.05, Math.max(desde + 0.05, aqui + (azar() - 0.5) * 0.3)),
        tonoDelPedregal,
      );
    for (let x = desde; x <= hasta - 0.01; x += 0.35 + azar() * 0.3) {
      const px = x + azar() * 0.2;
      const py = pie + 0.1 + azar() * 0.2;
      if (!entraria('roca', px, py, 0.28)) continue;
      const antes = sprites.length;
      poner(
        'rocas-caidas',
        px,
        py,
        0.28 + azar() * 0.25,
        azar() * 0.7,
        'roca',
        '#5a5248',
        true,
        undefined,
        undefined,
        tonoDelPedregal,
      );
      for (let i = antes; i < sprites.length; i++) pedregalDeCara.push(i);
    }
  }

  // Las bajadas (R5): encima de la pared, en el rumbo de la senda. La de una
  // rampa no: la lleva su cuerpo (#225).
  for (const b of bajadas) {
    if (b.deUnaRampa === true) continue;
    if (moduloDeBajada(b) === undefined) faltan.add(hojaDeBajada(b));
    // Después de toda pared que pinta sobre su camino: la que cruza y la de la
    // fila de delante por la que baja (una bajada al sureste pasa por el talud
    // de la ladera de debajo). Con la clave del pie, esa ladera la tapaba.
    const camino = caminoDeBajada(b);
    let clave = claveDeBajada(b, rel.vistas);
    for (const p of sprites)
      if (
        p.clase === 'pared' &&
        claveDe(p) >= clave &&
        camino.some(([x, y]) => tapaElPunto(p, perfilDe, x, y))
      )
        clave = claveDe(p) + 0.01;
    const pieza = (k: number) => piezaDeBajada(b, k);
    // Y antes de lo horneado de un nodo con el que se solapa: la bajada que
    // llega a una ciudad por su puerta pintaba su camino sobre la muralla (s9,
    // el lote de §23; con marcador no se veía). El nodo tapa el final de la rampa.
    let s = pieza(clave);
    for (const n of sprites)
      if (esNodoHorneado(n) && claveDe(n) < claveDe(s) && llegaA(b, n) && seSolapan(s, n, perfilDe))
        s = pieza(claveDe(n) - 0.01);
    // La bajada es el camino: no la para la reserva del objeto al que lleva, ni
    // cuenta como base sobre ella (`meter`), que su pie es la senda que llega.
    sprites.push(s);
  }

  // Las caídas al este y al oeste sin ladera (un barranco de una casilla, o la
  // reserva de un objeto): el canto lo oscurece el pintor; aquí, peñascos.
  const sinLadera = [
    ...rel.barrancos.map((c) => ({ x: c.vx, y: c.vy, este: c.tipo === 'E', material: c.material })),
    ...rel.laderas.flatMap((l) =>
      Array.from({ length: l.y1 - l.y0 + 1 }, (_, k) => l.y0 + k)
        .filter((y) => !conLadera.has(celdaDeLadera(l, y)))
        .map((y) => ({
          x: bordeDeLadera(l),
          y: y + 0.5,
          este: l.lado === 'este',
          material: l.material,
        })),
    ),
  ];
  for (const c of sinLadera)
    for (let k = 0; k < 2; k++) {
      const px = c.x + (c.este ? 0.05 : -0.05);
      const py = c.y - 0.2 + k * 0.45 + azar() * 0.2;
      if (!entraria('roca', px, py, 0.35)) continue;
      poner(
        'rocas-caidas',
        px,
        py,
        0.35 + azar() * 0.2,
        azar() * 0.8,
        'roca',
        '#5a5248',
        true,
        undefined,
        undefined,
        materialDeCara(c.material).pedregal,
      );
    }

  // La espalda de un acantilado más alto que lo de su norte: la cámara no la ve
  // y el pintor no pinta el reborde, así que desde ese lado la barrera era un
  // llano más (auditoría 2 de 07-10, B). Una hilera de peñascos por el canto de
  // arriba la cierra; el que no entra se prueba más bajo, y si tampoco, se
  // queda fuera (una senda o una reserva al lado).
  const rebordes = rebordesDe(nivel, W, H);
  /**
   * Las casillas de reborde sin peñasco porque no cabía ninguno: una senda que
   * corre por el canto, o la reserva de un objeto. La razón declarada de
   * `espaldasSinReborde`.
   */
  const espaldasOcupadas = new Set<number>();
  /**
   * Una hilera de peñascos por el canto norte de la casilla alta `(x, y)`, con
   * la corriente `elAzar` y el pie a `hondo` del canto. Si no entra ninguno,
   * se prueban sitios fijos más pequeños por todo el canto (sin azar: no mueve
   * la corriente), y si tampoco, la casilla queda en `espaldasOcupadas`.
   */
  const hileraDelReborde = (x: number, y: number, elAzar: () => number, hondo: number) => {
    const tono = materialDeCara(materialDeLaCimaEn[y * W + x] as string).pedregal;
    const peñasco = (px: number, py: number, alto: number, t: number) =>
      poner('rocas-caidas', px, py, alto, t, 'roca', '#5a5248', true, undefined, undefined, tono);
    let puestos = 0;
    for (let k = 0; k < 3; k++) {
      const px = x + 0.18 + k * 0.32 + (elAzar() - 0.5) * 0.12;
      const py = y + hondo + elAzar() * 0.24;
      const queria = 0.4 + elAzar() * 0.2;
      const alto = [queria, queria * 0.6].find((h) => entraria('roca', px, py, h));
      if (alto === undefined) continue;
      if (peñasco(px, py, alto, elAzar() * 0.8)) puestos++;
    }
    if (puestos > 0) return;
    for (const [dx, dy] of SITIOS_DEL_REBORDE)
      if (entraria('roca', x + dx, y + dy, ALTO_DEL_REBORDE_MENOR))
        if (peñasco(x + dx, y + dy, ALTO_DEL_REBORDE_MENOR, 0.3)) return;
    espaldasOcupadas.add(y * W + x);
  };
  /**
   * El canto de la espalda (#219): peñascos de la roca de lo alto, seguidos, con
   * el pie justo dentro del filo (`CANTO_DE_LA_ESPALDA`), que suben por encima
   * de la orilla y de la franja oscura del canto (`cantoDeLasEspaldas`). Con la
   * hilera de tres peñascos sueltos, de pie a 0,08-0,32 del filo, la espalda no
   * se leía como el filo seguido de una meseta: la elevación acababa de repente
   * (s24 (0-9, 20-21), s13 (14-24, 4-7)). El que no entra se prueba más bajo;
   * si no entra ninguno, los sitios fijos de la hilera, y si tampoco, la casilla
   * queda ocupada.
   */
  const cantoDeLaEspalda = (x: number, y: number, elAzar: () => number) => {
    const tono = materialDeCara(materialDeLaCimaEn[y * W + x] as string).pedregal;
    const peñasco = (px: number, py: number, alto: number, t: number) =>
      poner('rocas-caidas', px, py, alto, t, 'roca', '#5a5248', true, undefined, undefined, tono);
    const C = CANTO_DE_LA_ESPALDA;
    // El módulo de cada peñasco (`deHoja`) también sale de `elAzar`: con la
    // corriente de siempre, el canto movía toda la cubierta que va después.
    conCorriente(elAzar, () => {
      let puestos = 0;
      for (let k = 0; k < C.porCasilla; k++) {
        const px = x + (k + 0.5) / C.porCasilla + (elAzar() - 0.5) * C.vaiven;
        const py = y + C.hondo + elAzar() * C.vaiven;
        const queria = C.alto + elAzar() * C.masAlto;
        const t = elAzar() * 0.8;
        const alto = [queria, queria * 0.75, queria * 0.5].find((h) => entraria('roca', px, py, h));
        if (alto !== undefined && peñasco(px, py, alto, t)) puestos++;
      }
      if (puestos > 0) return;
      for (const [dx, dy] of SITIOS_DEL_REBORDE)
        if (entraria('roca', x + dx, y + dy, ALTO_DEL_REBORDE_MENOR))
          if (peñasco(x + dx, y + dy, ALTO_DEL_REBORDE_MENOR, 0.3)) return;
      espaldasOcupadas.add(y * W + x);
    });
  };
  for (const [x, y] of rebordes)
    if (a.terreno[y * W + x] === 'cliff') hileraDelReborde(x, y, azar, 0.18);
  // Y la espalda de una meseta que se pisa (#212): con el nivel por región
  // (#143) el borde de una meseta es casi siempre lo que se pisa contra el agua
  // encajada o un llano más bajo, y por el norte no llevaba nada. La elevación
  // acababa de repente donde la ladera doblaba hacia la cámara de espaldas (s2
  // (11-13, 4-5): el canal se cortaba en seco contra su orilla sur). Con su
  // propia corriente de azar, para no mover lo que se viste después.
  const azarDeLasEspaldas = azarDe(semilla * 2273 + 19);
  for (const [x, y] of rebordes)
    if (espaldaConReborde(a.terreno, W, x, y, bajoLaHuella))
      cantoDeLaEspalda(x, y, azarDeLasEspaldas);
  // Y el canto de la espalda de un acantilado, encima de su hilera de siempre,
  // con su propia corriente: la hilera tira de la de siempre y no se mueve.
  const azarDelCanto = azarDe(semilla * 4271 + 23);
  for (const [x, y] of rebordes)
    if (a.terreno[y * W + x] === 'cliff') cantoDeLaEspalda(x, y, azarDelCanto);

  /**
   * El módulo `nombre` de `hoja` como cubierta, entero, con el pie en `(x, y)` y
   * `alto`. Con `plano`, la pieza va al suelo o a los volúmenes sea cual sea su
   * alto (`Sprite.plano`).
   */
  const piezaEntera = (
    hoja: string,
    nombre: string,
    x: number,
    y: number,
    alto: number,
    plano?: boolean,
  ): Sprite => {
    const color = MARCADOR.cubierta as string;
    const d = deHoja(hoja, x, y, alto, 0, 'cubierta', color, false, nombre, undefined, azar, true);
    return plano === undefined ? d : { ...d, plano };
  };
  /**
   * La pieza, si no pisa nada de lo que se aparta (`obstaculos`; pisar es
   * monótono en el alto, así que es «entra sin encogerse»); si no, no va. Una
   * casa encogida hasta el mínimo de la cubierta se leía como un juguete, y su
   * reserva estrecha (`poner`) era otro módulo.
   */
  const ponerEntera = (s: Sprite): boolean => !obstaculos.pisa(s) && meter(s);
  /**
   * La parcela `p` a la escala `escala`, centrada en su sitio: el pie, donde
   * deja el centro de la imagen en él (sin la hoja, el marcador, con el ancla en
   * medio de su base).
   */
  const parcelaEn = (p: Parcela, escala: number): Sprite => {
    const m = (modulosDe(HOJA_DE_LA_TIERRA, true) ?? []).find((k) => k.nombre === p.nombre);
    const [ox, oy, nh] = m === undefined ? [0, 0.5, 1] : [m.ax - m.nw / 2, m.ay - m.nh / 2, m.nh];
    const alto = ALTO_DE_PARCELA * escala;
    const k = alto / nh;
    return piezaEntera(HOJA_DE_LA_TIERRA, p.nombre, p.x + ox * k, p.y + oy * k, alto, true);
  };
  /**
   * La escala con la que entra la parcela `p` (`EntradaDeLabranza.escalaQueEntra`):
   * la suya o, si no, encogida (`ENCOGER_LA_PARCELA`), sin pisar lo que se
   * aparta ni meterse bajo la copa de un bosque (`bajoLaCopa`); o null.
   */
  const escalaDeLaParcela = (bajoLaCopa: (s: Sprite) => boolean) => (p: Parcela) => {
    for (const f of ENCOGER_LA_PARCELA) {
      const s = parcelaEn(p, p.escala * f);
      if (!obstaculos.pisa(s) && !bajoLaCopa(s)) return p.escala * f;
    }
    return null;
  };
  /**
   * La casa o el atrezo `p` de la labranza, en su sitio. La casa, del módulo
   * del cuantil `t` de su tamaño y con el alto de su imagen.
   */
  const piezaDeLaLabranza = (p: Casa | PiezaDeAtrezo): Sprite => {
    if ('cual' in p)
      return piezaEntera(HOJA_DE_LA_TIERRA, ATREZO[p.cual], p.x, p.y, CUBIERTA.dirt.alto);
    const casas = modulosDe(HOJA_DE_CASAS) ?? [];
    const m = casas[Math.floor(p.t * casas.length)];
    return m === undefined
      ? piezaEntera(HOJA_DE_CASAS, '', p.x, p.y, ALTO_DE_CASA, false)
      : piezaEntera(HOJA_DE_CASAS, m.nombre, p.x, p.y, m.nh / PX_POR_CASILLA_DE_CASA, false);
  };
  /**
   * Si la casa o el atrezo `p` entra (`EntradaDeLabranza.entraLaPieza`): entero,
   * sin pisar lo que se aparta ni meterse bajo la copa de un bosque (`bajoLaCopa`).
   */
  const entraLaPieza = (bajoLaCopa: (s: Sprite) => boolean) => (p: Casa | PiezaDeAtrezo) => {
    const s = piezaDeLaLabranza(p);
    return !obstaculos.pisa(s) && !bajoLaCopa(s);
  };
  /** Las parcelas, el atrezo y las casas de la labranza (`labranzaDe`), por su nombre. */
  const ponerLaLabranza = (l: Labranza): void => {
    // Las parcelas ya entran con su escala, y las casas y el atrezo en su
    // sitio: la regla se lo ha preguntado.
    for (const p of l.parcelas) meter(parcelaEn(p, p.escala));
    for (const p of [...l.atrezo, ...l.casas]) ponerEntera(piezaDeLaLabranza(p));
  };

  // 5 · La cubierta, en manchas y no en motas: la referencia tiene formas
  // grandes y calmadas (una hoja de campos, un claro de prado), y una cubierta
  // igual de densa en todas partes hacía vibrar el mapa entero. Un ruido suave
  // decide dónde hay mancha (densa, de matas o campos) y dónde claro (pocas
  // matas sobre la textura).
  const ruido = ruidoSuave(semilla, 3.2);
  const cercaDePueblo = new Uint8Array(W * H);
  for (const o of a.objetos) {
    if (o.kind !== 'town' && o.kind !== 'village') continue;
    const { at } = o;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = at.x + dx;
        const y = at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && dx * dx + dy * dy <= 10)
          cercaDePueblo[y * W + x] = 1;
      }
  }
  // Junto a un bosque, de frontera o de obstáculo, el suelo va en mancha de
  // matas: tupido pero bajo, nunca árboles. Antes el bosque «seguía» sobre lo
  // que se pisa a radio √5 (`lindeDeBosque`, del primer escenógrafo), con pinos y
  // frondosos de la misma hoja y el mismo alto que la masa: el pasillo de una
  // casilla de s1 (2,23) y el bosque de (1,23) se veían iguales (marcas del
  // 14-10-2026). En claro, el suelo desnudo de s1 subía del 20,6 al 30,7 %; en
  // mancha de matas, 23,2/23,7/28,1 % en s1/3/7 (decisión del usuario, 14-10-2026).
  /** Las casillas de bosque: su orilla va en mancha, y el pintor les pone sotobosque (`Escena.bosque`). */
  const bosque = a.franjas.filter((f) => f.barrera === 'forest').flatMap((f) => f.casillas);
  const orillaDelBosque = new Uint8Array(W * H);
  const { desde: vecinasDesde, vecinas } = vecindad(W, H);
  for (const k of bosque) {
    orillaDelBosque[k] = 1;
    for (let j = vecinasDesde[k] as number; j < (vecinasDesde[k + 1] as number); j++)
      orillaDelBosque[vecinas[j] as number] = 1;
  }
  const enMancha = (x: number, y: number) => {
    const i = Math.floor(y) * W + Math.floor(x);
    return orillaDelBosque[i] === 1 || cercaDePueblo[i] === 1 || ruido(x, y) > 0.56;
  };
  const pisable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = Math.floor(y) * W + Math.floor(x);
    return (
      a.franjaDe[i] === -1 &&
      entraria('cubierta', x, y, CUBIERTA[pintado[i] as Suelo].alto * MATA_MAS_BAJA)
    );
  };
  const puntos = esparcir(
    [0, 0, W, H],
    (x, y) => {
      const c = CUBIERTA[pintado[Math.floor(y) * W + Math.floor(x)] as Suelo];
      // Fuera de la mancha, el suelo se deja en claro; en la mancha, sembrado. Un
      // suelo `comoLaBarrera` no tiene manchas: sembrado, se leía como su barrera.
      return c.comoLaBarrera || !enMancha(x, y) ? c.radio * c.claro : c.radio * 0.85;
    },
    pisable,
    azar,
    30,
  );
  // Sin árboles (decisión del usuario, 14-10-2026): «árbol = no se pasa». Un
  // pino de 0,58 junto al bosque se leía como bosque igual que uno de 0,8, y un
  // bosquecillo decorativo en medio del prado, como una mancha de obstáculo. Lo
  // que se pisa lleva matas, hierba, flores y piedras; la mancha es más densa,
  // no más alta. `APARTE.cubierta` ya no admite las hojas de árbol: `poner`
  // lanza con una.
  //
  // La tierra es labranza en campos (`labranza.ts`, 20-10-2026): parcelas por
  // casilla, atrezo y casas, que pone su regla con su propia corriente. Sus
  // puntos del esparcido gastan aun así las tiradas de una mata —la de la hoja,
  // la del alto y las de `mata` (`gastarLasTiradasDeMata`)— y solo en el
  // barbecho y los caminos de tierra ponen alguna.
  const camino = casillasConCamino(map.caminos, W, H);
  const enLaLabranza = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++)
    if (a.franjaDe[i] === -1 && pintado[i] === 'dirt' && camino[i] !== 1) enLaLabranza[i] = 1;
  const copa = bajoLaCopa(sprites);
  const labranza = labranzaDe({
    W,
    H,
    enLaLabranza,
    camino,
    cercaDePueblo,
    objetos: a.objetos.map((o) => ({ kind: o.kind, x: o.at.x, y: o.at.y })),
    escalaQueEntra: escalaDeLaParcela(copa),
    entraLaPieza: entraLaPieza(copa),
    semilla,
  });
  const azarDelRelleno = azarDe(semilla * 5381 + 31);
  for (const p of puntos) {
    const i = Math.floor(p.y) * W + Math.floor(p.x);
    const s = pintado[i] as Suelo;
    if (s !== 'dirt') {
      mata(hojaDeCubierta(s, azar()), p.x, p.y, altoDeMata(s), s);
      continue;
    }
    const hoja = hojaDeCubierta(s, azar());
    const alto = altoDeMata(s);
    const relleno =
      (labranza.deRelleno[i] === 1 || camino[i] === 1) && azarDelRelleno() < PARTE_DEL_RELLENO;
    if (relleno) mata(hoja, p.x, p.y, alto, s);
    else gastarLasTiradasDeMata(hoja, s);
  }
  conCorriente(azarDe(semilla * 6043 + 37), () => ponerLaLabranza(labranza));

  // 6 · Nubes en el borde del mapa, como en la referencia.
  for (let k = 0; k < (2 * (W + H)) / 3; k++) {
    const lado = k % 4;
    const t = azar();
    const [x, y] =
      lado === 0
        ? [t * W, -0.3]
        : lado === 1
          ? [W + 0.3, t * H]
          : lado === 2
            ? [t * W, H + 1.2]
            : [-0.3, t * H];
    sprites.push(deHoja('nubes', x, y, 2.2 + azar() * 1.6, azar(), 'nube', '#b8b8b8', false));
  }

  for (const i of pedregalDeCara) {
    const s = sprites[i] as Sprite;
    // El del pie de una cara del borde de abajo cae fuera: el suelo de la última fila.
    // El suelo que se PINTA (`sueloQueSePinta`, #217), no el más cercano de
    // `analizar`: en una casilla de barrera los dos difieren, y con el de
    // `analizar` salía un peñasco de nieve sobre la ciénaga (s6 (3,30) y s14
    // (33-34,30) en 42×42, #226).
    const tono = tonoDelPedregalSuelto(
      s,
      sprites,
      (x, y) =>
        pintado[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] as Suelo,
    );
    if (tono !== undefined && tono !== s.tono) sprites[i] = { ...s, tono };
  }
  // La cara se pinta solo bajo la silueta de su pared, con todo puesto (#159).
  const carasDeEscena = carasConPuentes.map(
    (c): CaraDeEscena => ({ ...c, pintada: pintadaDeCara(c, sprites, perfilDe) }),
  );
  sprites.sort((p, q) => p.capa - q.capa || ordenDeVolumenes(p, q));
  /** Qué sprite es una ladera: cualquier módulo de laderas del catálogo, no solo los que se usaron. */
  const deLadera = modulosDeLadera(catalogo);
  const agua = a.franjas.filter((f) => f.barrera === 'water').flatMap((f) => f.casillas);
  // Las charcas: el agua que toca una sola región (la del río y la de una
  // frontera tocan dos o más). `Franja.uso` no basta: un lago de obstáculo
  // pegado al borde del mapa es de `borde`.
  const charcas = a.franjas
    .filter((f) => {
      if (f.barrera !== 'water') return false;
      const regiones = new Set<number>();
      for (const i of f.casillas) {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
            const r = a.red.regionDe[(y + dy) * W + x + dx] as number;
            if (r >= 0) regiones.add(r);
          }
      }
      return regiones.size <= 1;
    })
    .flatMap((f) => f.casillas);
  const enElAgua = new Set(agua);
  const esAgua = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && enElAgua.has(y * W + x);
  const vados = vadosDeLosEstribos(trazos, puentes, esAgua);
  const muralla = murallaSinLeer(
    a.franjas
      .filter((f) => f.barrera === 'wall')
      .map((f) => ({
        id: f.id,
        casillas: f.casillas.map((i) => [i % W, Math.floor(i / W)] as const),
      })),
    puertasDeMuralla,
    (x, y) => x >= 0 && y >= 0 && x < W && y < H && a.terreno[y * W + x] === 'wall',
    pintados,
    alrededorDeLaMuralla,
    huellas,
  );
  const loPisable = sobreLoPisable(sprites, a.franjaDe, W);
  const recintosDeEscena: RecintoDeEscena[] = [...puertasDe.values()].map(
    ({ id, rect, contorno, puertas, rio }) => ({
      id,
      rect,
      contorno,
      puertas,
      porElArco: contorno.caras
        .filter((k) => k.cara !== rio && puertas.includes(k.cara))
        .map((k) => pasoPorElArco(k, sePisaJuntoAlRecinto)),
    }),
  );
  const puestos = [...recintosPuestos.values()];
  return {
    semilla,
    W,
    H,
    suelo: pintado,
    nivel: Array.from(nivel),
    agua,
    charcas,
    bosque,
    relieve: {
      caras: carasDeEscena,
      cantos: cantosDe(nivel, W, H),
      rebordes,
      celdas: vistas,
      bajadas,
      rampas,
    },
    altoDeNivel: ALTO_DE_NIVEL,
    caminos,
    sendas: trazos,
    puentes,
    vados,
    luces: luces(a, nivel, azarDe(semilla * 31 + 5), recintos),
    sprites,
    recintos: recintosDeEscena,
    informe: {
      puestosSinSitio:
        sinSitioParaElPuesto.length + puestosSobreElHeroe(sprites, heroeEnElNodo).length,
      puestosTapados: puestosTapados(sprites).length,
      puestosQueTapan: puestosQueTapan(sprites).length,
      murallasPartidas: muralla.fugas.length + muralla.puertasSueltas.length + muralla.huecos,
      murallaIncoherente:
        muralla.espolones.length + muralla.esquinasAbiertas.length + muralla.puntasSinTorre.length,
      muralla,
      torresApiladas: muralla.torresApiladas.length,
      murallaSobreSenda: murallaSobreLaSenda(
        pintados,
        puertasDeMuralla.map((p) => p.at),
        (c) => {
          const s = torresPintadas.get(`${c}`);
          return s !== undefined && sendaDeLaMuralla.pisa(s);
        },
        (x, y) => sendaDeLaMuralla.en(x, y, () => true) !== undefined,
      ).length,
      basesSobreReserva,
      recintoSobreSenda: puestos.reduce(
        (n, r) =>
          n +
          anilloSobreLaSenda(r, [...trazos, ...ejesDeLosPuentes(puentes)], SEMIANCHO_DE_LA_HUELLA)
            .length,
        0,
      ),
      anilloAbierto: puestos.reduce((n, r) => n + huecosDelAnillo(r).length, 0),
      puenteSobreElAnillo: puentesSobreElAnillo([...contornos.values()], puentes).length,
      sendaFueraDeLaPuerta: sendasFueraDeLaPuerta(trazos, [...puertasDe.values()]).length,
      puertaSinCamino: puertasSinSuCamino(
        a.objetos.flatMap((o) => {
          const r = recintosPuestos.get(o.id);
          if (r === undefined) return [];
          return [
            {
              id: o.id,
              contorno: r.contorno,
              pintadas: r.arcos.map((p) => p.cara as CaraDelRecinto),
              delNucleo: puertasDelNucleo(map, o.at),
            },
          ];
        }),
        trazos,
        puentes,
      ).length,
      casasRepetidasJuntas: puestos.reduce((n, r) => n + casasRepetidasJuntas(r.casas).length, 0),
      arcosTapados: [...recintosPuestos].reduce(
        (n, [id, r]) => n + arcosTapados(r.contorno, arcosPintados.get(id) ?? [], r.casas).length,
        0,
      ),
      testerosAMediaTirada: testerosDeLaEscena(sprites, catalogo).length,
      anilloMalOrdenado: [...recintosPuestos].reduce(
        (n, [id, r]) => n + anilloMalOrdenado(r.contorno, anillosPintados.get(id) ?? []).length,
        0,
      ),
      casillasDeBarreraSinFormacion: sinFormacion,
      spritesSobreSenda: sobreLaSenda(sprites, trazos).length,
      // Recontadas desde lo puesto, con cualquier módulo del catálogo y no solo
      // los de las hojas que se usaron.
      celdasMalCubiertas: celdasMalCubiertas(
        sprites,
        { vistas, barrancos: rel.barrancos },
        catalogo,
        (c) => vaciaPorque(c, rechazos),
      ).length,
      bajadasSinPieza: bajadasSinPieza(sprites, bajadas, catalogo).length,
      bajadasTapadas: bajadasTapadas(sprites, bajadas, catalogo).length,
      bajadasSobreNodo: bajadasSobreNodo(sprites, bajadas, catalogo).length,
      rampasDesviadas: rampasDesviadas(bajadas, trazos).length,
      rampasSinSusPiezas: rampasSinSusPiezas(sprites, rampas, catalogo).length,
      nodosSinRampa: nodosSinRampa(map, a, nivel, bajadas).length,
      sendaBajoElRelieve: sendaBajoElRelieve(sprites, trazos, catalogo).length,
      laderasEnfrentadas: laderasEnfrentadas(sprites, deLadera).length,
      carasLisas: carasLisas(carasDeEscena, sprites, perfilDe).length,
      carasCortadas: carasCortadas(
        carasDeEscena,
        sprites,
        a.objetos.flatMap((o) =>
          o.kind === 'town' || o.kind === 'village' || o.kind === 'node'
            ? [[o.at.x, o.at.y] as const]
            : [],
        ),
        W,
      ).length,
      puentesTapados: puentesTapados(sprites, puentes).length,
      pasosTapados: pasosTapados(sprites, pasos).length,
      pasosAtravesados: pasosAtravesados(sprites, pasos).length,
      sendasPorObjeto: sendasPorObjeto(caminos, a.objetos, a.terreno, W, H).length,
      sendasDeEstriboEnAgua: sendasDeEstriboEnAgua(trazos, puentes, vados, esAgua).length,
      nivelFueraDeSuRegion: nivelFueraDeSuRegion(a, nivel),
      desnivelesSinBarrera: desnivelesSinBarrera(a, nivel),
      pisablesTapadas: pisablesTapadas(sprites, a.terreno, W, H, perfilDe).length,
      cubiertaComoLaBarrera: ((c) => c.altas.length + c.regionesDensas.length)(
        cubiertaComoLaBarrera(sprites, a.suelo, a.region, W),
      ),
      cubiertaDeOtroNivel: cubiertaDeOtroNivel(sprites, pintado, W).length,
      arbolesSobreLoPisable: loPisable.arboles.length,
      masaSobreLoPisable: loPisable.masas.length,
      pasillosTapados: loPisable.pasillos.length,
      cumbresSobreLoPisable: loPisable.cumbres.length,
      // Las de un recinto, no: lo de dentro es la plaza (criterio 8b).
      bosqueSinArbol: bosqueSinArbol(
        sprites,
        bosque.filter((i) => bajoUnRecinto[i] !== 1),
        W,
        tapaLaPared,
      ).length,
      espaldasSinReborde: espaldasSinReborde(
        sprites,
        rebordes,
        a.terreno,
        W,
        (i) => bajoLaHuella[i] === 1 || espaldasOcupadas.has(i),
      ).length,
      cimaDeOtroMaterial: cimaDeOtroMaterial(sprites, a.terreno, W, materialDeLaCimaEn).length,
      paredesTapadas: paredesTapadasPorLaMasa(sprites, perfilDe).length,
      caraDeOtroMaterial: caraDeOtroMaterial(rel.celdas, W, H, a.terreno, a.region, nivel).length,
      mesasEnLaCordillera: sprites.filter(
        (s) =>
          s.clase === 'masa' &&
          s.src?.startsWith('modulos/picos-arenisca/') === true &&
          esMesa('picos-arenisca', s),
      ).length,
      acantiladosLisos: acantiladosLisos(sprites, a.terreno, W, (i) => bajoLaHuella[i] === 1)
        .length,
      modulosQueFaltan: [...faltan].sort(),
    },
  };
}
