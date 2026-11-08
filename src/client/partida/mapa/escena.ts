/**
 * La escena del mapa: cámara, ratón y dedo. Lo que se pinta lo decide
 * `render/mapa/mapa.ts`; lo que se hace al pulsar, `sesion/partida.ts`.
 *
 * Guarda solo estado de píxel —dónde mira la cámara, qué casilla está señalada,
 * si se está arrastrando—, igual que hacía `main.ts` antes de partirse.
 */

import { figuraDelHeroe } from '@core/hero/tipos-de-heroe.js';
import { individuosDe } from '@core/hero/troop.js';
import type { CasillasLeidas } from '@core/map/casillas.js';
import { inBounds, pointKey } from '@core/map/geometria.js';
import { heroById } from '@core/state/consultas.js';
import { REGLA_DEL_PUEBLO } from '@core/state/renta.js';
import type { Point } from '@core/types.js';
import { FIGURA_DEL_HEROE, PIES } from '../../render/escenario/figuras-del-mapa.js';
import { puenteEnElTerreno } from '../../render/escenario/puentes.js';
import { escenarioListo, topeDeAlejar } from '../../render/escenario/superficie.js';
import { animarHasta } from '../../render/figuras/figura.js';
import { enLaMarcha, msPorCasilla, PRISA_EN_EL_MAPA } from '../../render/figuras/marcha.js';
import { type Medida, pixelesDe } from '../../render/lienzo.js';
import {
  acotar,
  arrastrar,
  type CamaraMapa,
  centrarEn,
  type Encuadre,
  pixelACasilla,
  pixelAMundo,
  TILE_INICIAL,
  topeDe,
  zoom,
} from '../../render/mapa/camara.js';
import {
  drawMapa,
  type HeroeQueAnda,
  presupuestoConHolgura,
  type VistaMapa,
} from '../../render/mapa/mapa.js';
import { casillaDelMinimapa, drawMinimapa } from '../../render/mapa/minimapa.js';
import {
  type PasoDeRuta,
  type PuntoDeLaTrazaEnElMapa,
  pasosAPintar,
  puntosDeLaTraza,
} from '../../render/mapa/ruta.js';
import type { MarchaEnPantalla } from '../../sesion/partida/marcha.js';
import type { Session } from '../../sesion/partida.js';

/** Cuántos píxeles hay que mover el puntero para que un clic pase a arrastre. */
const UMBRAL_ARRASTRE = 8;

/**
 * Dónde mira la cámara cuando nadie la ha movido: el sitio del ataque mientras
 * su aviso está en pantalla (`Session.avisoDelAtaque`), si no el héroe elegido,
 * y si no hay, el primer castillo. Exportada porque el guion de capturas tiene
 * que saber a dónde mira la página para pulsar donde toca.
 */
export function focoDe(s: Session): Point {
  return s.avisoDelAtaque?.at ?? s.selectedHero?.at ?? s.myTowns()[0]?.at ?? { x: 0, y: 0 };
}

export class EscenaAventura {
  private camara: CamaraMapa = { tile: TILE_INICIAL, x: 0, y: 0 };
  /** A quién sigue la cámara y dónde estaba: si cambia, se recentra. */
  private seguido = '';
  private hover: Point | null = null;
  private ruta: readonly PasoDeRuta[] = [];
  /**
   * Lo que determina la ruta previsualizada: la casilla, quién la anda y cuánto
   * le queda. Un `pointermove` dispara mucho más rápido de lo que cambia la
   * casilla, y sin esta clave cada uno relanzaba el Dijkstra para el mismo camino.
   */
  private claveRuta: string | null = null;
  private arrastre: { x: number; y: number; camara: CamaraMapa; movido: boolean } | null = null;
  /** En pantalla táctil no hay «pasar por encima»: el primer toque enseña la ruta. */
  private tocada: string | null = null;
  /**
   * La última frase que esta escena escribió en la barra, para borrar solo la
   * suya al olvidar la ruta: lo que haya escrito después la sesión —el motivo
   * de un movimiento rechazado, el final— no es de la escena y se queda.
   */
  private fraseDeLaRuta: string | null = null;
  private encuadre: Encuadre = { ancho: 1, alto: 1, mapaAncho: 1, mapaAlto: 1 };
  /**
   * A dónde mirar en el próximo encuadre (`mirarA`): se aplica allí y no al
   * pedirlo porque hasta el primer fotograma no se sabe cuánto mide el lienzo.
   */
  private mirarPendiente: { x: number; y: number; tile: number } | null = null;
  /**
   * La marcha que se enseña (`Session.marchaEnCurso`), desde qué fotograma anda y a
   * cuántos ms por casilla (`msPorCasilla` de su figura, al alto con que se pinta).
   */
  private marchaVista: {
    readonly de: MarchaEnPantalla;
    readonly inicio: number;
    readonly ms: number;
  } | null = null;
  /** Por dónde iba el héroe que anda en el último fotograma, en casillas: lo sigue la cámara. */
  private puntoDeLaMarcha: Point | null = null;
  /**
   * La ruta que se enseñaba al mandar andar al héroe (`pulsar`): la de su marcha y,
   * si no llegaba hoy, lo que le quedaba. Mientras anda se pinta lo que le queda
   * desde donde va.
   */
  private rutaDeLaMarcha: readonly PasoDeRuta[] = [];
  /**
   * A dónde se mandó al héroe que no llegó (06-11-2026, QA de la marcha): lo que le
   * falta se sigue pintando —gris a trazos lo de otro día— sin pasar el ratón,
   * hasta que se pulse otra cosa o llegue. Solo con él elegido; la ruta la vuelve a
   * pedir a la sesión cuando cambia algo (`rutaQueQueda`).
   */
  private destino: { readonly heroe: string; readonly casilla: Point } | null = null;
  private rutaDelDestino: { readonly clave: string; readonly ruta: readonly PasoDeRuta[] } | null =
    null;

  constructor(private readonly sesion: () => Session) {}

  /** Se está arrastrando el mapa: hay que repintar a cada fotograma. */
  get arrastrando(): boolean {
    return this.arrastre?.movido === true;
  }

  /** Dónde mira la cámara: lo lee quien pinta encima del mapa (el aspa de una marca). */
  get camaraActual(): CamaraMapa {
    return this.camara;
  }

  /** Vuelve a centrar en el héroe seleccionado (botón «Centrar héroe»). */
  centrar(): void {
    this.seguido = '';
  }

  zoom(direccion: 1 | -1, ancla?: { x: number; y: number }): void {
    this.camara = zoom(this.camara, direccion, this.encuadre, ancla);
  }

  /**
   * Olvida la ruta: tras un movimiento, al cambiar de héroe o al pasar el turno
   * ya no vale. Y con ella la frase que la contaba: «hoy llegas a 7 de 20 pasos»
   * seguía en la barra al volver el turno, sin mover el puntero, con los puntos
   * ya repuestos (#123). Se borra aquí y no en `Session.endTurn` porque la
   * escribió la escena, y así vale para todos los que olvidan la ruta.
   */
  olvidarRuta(): void {
    this.ruta = [];
    this.claveRuta = null;
    this.tocada = null;
    const s = this.sesion();
    if (this.fraseDeLaRuta !== null && s.status === this.fraseDeLaRuta) s.status = '';
    this.fraseDeLaRuta = null;
  }

  /** La ruta que se está enseñando: la del puntero encima, o la del primer toque. */
  get rutaVisible(): readonly PasoDeRuta[] {
    return this.ruta;
  }

  /**
   * Pone la cámara al tamaño del lienzo: la centra en quien sigue si ha cambiado,
   * y si no la acota. Va aparte de `dibujar` para que se pueda probar el puntero
   * sin un lienzo.
   */
  encuadrar(ancho: number, alto: number): void {
    const s = this.sesion();
    // Mientras se compone la escena, el tope es el de legibilidad: la cámara se
    // reacota en cuanto llega.
    const esc = escenarioListo(s.state.map, s.state.seed);
    this.encuadre = {
      ancho,
      alto,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
      ...(esc === null ? {} : { tileMinimo: topeDeAlejar(esc, ancho, alto) }),
    };
    const foco = focoDe(s);
    // El aviso de un ataque recentra aunque mire donde ya está el héroe elegido:
    // la cámara pudo moverse a mano desde entonces.
    const aviso = s.avisoDelAtaque === null ? '' : 'ataque:';
    const clave = `${aviso}${s.selectedHeroId ?? ''}@${pointKey(foco)}`;
    const mirar = this.mirarPendiente;
    // Mientras el héroe anda, la cámara va con él (si no se está arrastrando), y
    // `seguido` no se toca: al llegar se centra en la casilla de llegada, como
    // hacía sin la marcha, y el salto es lo que le faltaba del último paso.
    const marcha = s.marchaEnCurso;
    if (mirar === null && marcha !== null) {
      const punto = this.puntoDeLaMarcha ?? (marcha.pasos[0] as Point);
      this.camara = this.arrastrando
        ? acotar(this.camara, this.encuadre)
        : centrarEn(this.camara, punto, this.encuadre);
      return;
    }
    if (mirar !== null) {
      // Quien pidió mirar allí manda sobre seguir al héroe: se da por seguido
      // para que el encuadre siguiente no lo recentre.
      this.mirarPendiente = null;
      this.seguido = clave;
      this.camara = acotar(
        {
          tile: mirar.tile,
          x: mirar.x - ancho / mirar.tile / 2,
          y: mirar.y - alto / mirar.tile / 2,
        },
        this.encuadre,
      );
    } else if (clave !== this.seguido && this.arrastre === null) {
      this.seguido = clave;
      this.camara = centrarEn(this.camara, foco, this.encuadre);
    } else {
      this.camara = acotar(this.camara, this.encuadre);
    }
  }

  private readonly presupuestoDelMapa = presupuestoConHolgura();

  /**
   * Los píxeles a los que se pinta el mapa en este fotograma (el `Presupuesto`
   * de `preparar`): con la cámara ya encuadrada en la caja de ahora.
   */
  readonly presupuesto = (medida: Medida, dpr: number): number | undefined => {
    this.encuadrar(medida.width, medida.height);
    return this.presupuestoDelMapa(
      this.camara.tile,
      topeDe(this.encuadre),
      pixelesDe(medida.width, medida.height, dpr),
    );
  };

  dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, ahora: number): void {
    const s = this.sesion();
    const state = s.state;
    const marcha = this.andando(ahora);
    this.encuadrar(ancho, alto);
    // Mientras anda, lo que le queda de su ruta; si no, la que se señala y, sin
    // ninguna, la que le falta hasta donde se le mandó.
    const ruta = marcha?.ruta ?? (this.ruta.length > 0 ? this.ruta : this.rutaQueQueda());
    drawMapa(ctx, {
      ...(marcha === null
        ? {}
        : { andando: marcha.andando, marchaDeLaRuta: marcha.marchaDeLaRuta }),
      escena: state,
      // Los grupos, los que se ven: el lienzo no decide qué grupo se ve, lo pinta.
      asaltantes: s.asaltantesALaVista(),
      // Héroes y objetos, igual: los que se ven y como se saben (#64).
      heroes: s.heroesALaVista(),
      objetos: s.objetosConocidos(),
      ocupados: s.ocupados(),
      camara: this.camara,
      ancho,
      alto,
      explorado: s.explorado,
      visibles: s.revealAll ? null : s.visibles(),
      ruta,
      seleccionado: s.selectedHeroId,
      hover: this.hover,
      ataque: s.avisoDelAtaque?.at ?? null,
      semilla: state.seed,
      tiempo: ahora,
      clima: s.clima,
    });
  }

  /**
   * Por dónde va a la hora `ahora` el héroe que anda (`Session.marchaEnCurso`), o
   * `null` si no anda nadie: por su traza (`puntosDeLaTraza`, por el arco de la
   * puerta de un recinto), con lo que le queda de su ruta. La marcha empieza a
   * contar en el primer fotograma que la pinta, y al llegar la acaba
   * (`acabarLaMarcha`): lo que abre la llegada —la batalla, la base, el lugar— se
   * abre entonces, con el héroe ya en su casilla. A cada fotograma le dice a la
   * sesión qué casilla pisa (`pisarEnLaMarcha`): la niebla va con él.
   */
  private andando(ahora: number): {
    readonly andando: HeroeQueAnda;
    readonly marchaDeLaRuta: NonNullable<VistaMapa['marchaDeLaRuta']>;
    readonly ruta: readonly PasoDeRuta[];
  } | null {
    const s = this.sesion();
    const m = s.marchaEnCurso;
    if (m === null) {
      this.marchaVista = null;
      this.puntoDeLaMarcha = null;
      return null;
    }
    let vista = this.marchaVista;
    if (vista?.de !== m) {
      const hero = heroById(s.state, m.heroe);
      const ms =
        msPorCasilla(figuraDelHeroe(hero), 'walk', FIGURA_DEL_HEROE.alto) / PRISA_EN_EL_MAPA;
      vista = { de: m, inicio: ahora, ms };
      this.marchaVista = vista;
    }
    // La ruta de la marcha y lo que le quedaba, y su traza: la misma que pinta la
    // línea (`VistaMapa.marchaDeLaRuta` cuenta en ella), andada hasta la última
    // casilla de la marcha.
    const ruta = rutaDeLaMarchaPara(m, this.rutaDeLaMarcha);
    const casillas = [m.pasos[0] as Point, ...ruta.map((p) => p.at)];
    const puntos = puntosDeLaTraza(escenarioListo(s.state.map, s.state.seed), casillas, PIES.heroe);
    const ultima = m.pasos.length - 1;
    let fin = puntos.length - 1;
    while (fin > 0 && (puntos[fin] as PuntoDeLaTrazaEnElMapa).paso > ultima) fin--;
    const en = enLaMarcha(puntos.slice(0, fin + 1), vista.ms, ahora - vista.inicio);
    if (en === null) {
      this.marchaVista = null;
      this.puntoDeLaMarcha = null;
      s.acabarLaMarcha();
      return null;
    }
    const a = puntos[en.tramo] as PuntoDeLaTrazaEnElMapa;
    const b = puntos[en.tramo + 1] as PuntoDeLaTrazaEnElMapa;
    const cerca = en.t < 0.5 ? a.paso : b.paso;
    s.pisarEnLaMarcha(cerca);
    // El lienzo sigue pidiendo fotogramas también sin arte, que no respira.
    animarHasta(performance.now() + 100);
    this.puntoDeLaMarcha = { x: en.x - 0.5, y: en.y - PIES.heroe };
    return {
      andando: {
        heroe: m.heroe,
        x: en.x,
        y: en.y,
        cerca: casillas[cerca] as Point,
        mira: en.mira,
      },
      // Los pasos de la ruta que ya ha dejado atrás: la casilla a la que va es la
      // `b.paso` de la traza, el paso `b.paso - 1` de la ruta.
      marchaDeLaRuta: {
        origen: casillas[0] as Point,
        tramo: en.tramo,
        t: en.t,
        pasados: Math.max(0, b.paso - 1),
      },
      ruta,
    };
  }

  /**
   * Lo que le falta al héroe elegido hasta donde se le mandó (`destino`), o nada:
   * la ruta de la sesión desde donde está, pedida otra vez solo cuando cambia algo
   * (dónde está, lo que le queda de marcha, la partida). Sin ruta —ya llegó, o no
   * hay camino—, se olvida el destino.
   */
  private rutaQueQueda(): readonly PasoDeRuta[] {
    const d = this.destino;
    const s = this.sesion();
    const heroe = s.selectedHero;
    if (d === null || heroe === null || heroe.id !== d.heroe) return [];
    const clave = `${pointKey(d.casilla)}|${pointKey(heroe.at)}|${heroe.movePoints}|${s.version}|${s.isPlayersTurn}`;
    if (this.rutaDelDestino?.clave !== clave) {
      this.rutaDelDestino = { clave, ruta: s.previewPath(d.casilla) };
    }
    const ruta = this.rutaDelDestino.ruta;
    // Fuera de su turno la sesión no da rutas: el destino espera al siguiente.
    if (ruta.length === 0 && s.isPlayersTurn) this.destino = null;
    return ruta;
  }

  dibujarMinimapa(lienzo: HTMLCanvasElement): void {
    const c = lienzo.getContext('2d');
    if (c === null) return;
    const s = this.sesion();
    drawMinimapa(c, lienzo.width, lienzo.height, {
      escena: s.state,
      explorado: s.explorado,
      heroes: s.heroesALaVista(),
      objetos: s.objetosConocidos(),
      version: s.version,
      camara: this.camara,
      anchoLienzo: this.encuadre.ancho,
      altoLienzo: this.encuadre.alto,
    });
  }

  /** Pulsar el minimapa lleva la vista allí. */
  pulsarMinimapa(px: number, py: number, ancho: number, alto: number): void {
    const p = casillaDelMinimapa(this.sesion().state, px, py, ancho, alto);
    this.camara = centrarEn(this.camara, p, this.encuadre);
  }

  bajar(px: number, py: number): void {
    this.arrastre = { x: px, y: py, camara: this.camara, movido: false };
  }

  /** El puntero se mueve: arrastra si está pulsado, si no previsualiza la ruta. */
  mover(px: number, py: number): void {
    const a = this.arrastre;
    if (a !== null) {
      const dx = px - a.x;
      const dy = py - a.y;
      if (!a.movido && Math.abs(dx) + Math.abs(dy) > UMBRAL_ARRASTRE) a.movido = true;
      if (a.movido) {
        this.camara = arrastrar(a.camara, dx, dy, this.encuadre);
        return;
      }
    }
    this.señalar(this.casillaBajo(px, py));
  }

  /**
   * La casilla que se señala con el puntero en un píxel: la de debajo, salvo si
   * cae en un puente explorado, que es la de su nodo (`puenteBajo`). El tablero
   * se ve alzado y, en los cruces quebrados, corrido, así que la casilla de
   * debajo era a menudo el agua de al lado: pulsar el puente decía «No hay
   * camino» (H2 del QA de #157). La tierra de otra casilla manda sobre el
   * puente aunque el tablero la tape: es la orilla, con quien espera en ella (H9).
   * Salvo la orilla donde se pinta una ciudad-puente (#144): la ciudad manda,
   * también si se pisa (decisión del usuario), y a esa casilla se va por su lado.
   */
  private casillaBajo(px: number, py: number): Point {
    const debajo = pixelACasilla(this.camara, px, py);
    const s = this.sesion();
    const esc = escenarioListo(s.state.map, s.state.seed);
    if (esc === null) return debajo;
    const { x, y } = pixelAMundo(this.camara, px, py);
    const { map } = s.state;
    // La orilla donde se pinta una ciudad-puente (#144), aunque se pise, o un puente.
    const puente = puenteEnElTerreno(esc.escena.puentes, map.terrain, map.width, x, y);
    if (puente === null) return debajo;
    const nodo = { x: Math.floor(puente.nodo[0]), y: Math.floor(puente.nodo[1]) };
    // Bajo la niebla no se pinta, y pulsar ahí no puede decir que hay un puente.
    return (s.explorado?.has(nodo) ?? true) ? nodo : debajo;
  }

  private señalar(casilla: Point): void {
    const s = this.sesion();
    this.hover = casilla;
    // Mientras el héroe anda no se señala ruta: la de la sesión saldría de su
    // casilla de llegada, y se pinta la de su marcha.
    if (s.marchaEnCurso !== null) return;
    // Con la partida terminada no hay ruta que enseñar (#158 c). La barra ya no
    // hay que guardarla aquí: es del desenlace por regla de `Session.status` (#162).
    if (s.desenlace !== null) {
      this.olvidarRuta();
      return;
    }
    const heroe = s.selectedHero;
    const clave = `${pointKey(casilla)}|${heroe?.id ?? ''}|${heroe?.movePoints ?? 0}|${s.isPlayersTurn}`;
    if (clave === this.claveRuta) return;
    this.claveRuta = clave;
    this.ruta = s.previewPath(casilla);
    s.status = describirCasilla(s, casilla, this.ruta);
    this.fraseDeLaRuta = s.status;
  }

  /**
   * Lleva la cámara a `(x, y)`, en casillas con decimales, a `tile` px por
   * casilla: lo que pide reproducir una marca de fallo (`?marca=`).
   */
  mirarA(punto: { readonly x: number; readonly y: number }, tile: number): void {
    this.mirarPendiente = { x: punto.x, y: punto.y, tile };
  }

  /**
   * El punto del mundo y la casilla bajo un píxel del lienzo: la que señala el
   * puntero (`casillaBajo`), con el nodo del puente si se pulsa su tablero.
   */
  puntoBajo(px: number, py: number): { mundo: { x: number; y: number }; casilla: Point } {
    return { mundo: pixelAMundo(this.camara, px, py), casilla: this.casillaBajo(px, py) };
  }

  /**
   * Suelta el puntero y dice si fue un clic: sin arrastre, quien lo recibe
   * decide qué hace con él (`pulsar`, o el modo «marcar fallo»). Arrastrar ya
   * movió la cámara y no es un clic.
   */
  soltar(): boolean {
    const a = this.arrastre;
    this.arrastre = null;
    return a?.movido !== true;
  }

  /**
   * Un clic en el mapa: mueve al héroe, o abre el castillo, o selecciona —lo
   * decide `clickTile`—. Con el dedo, el primer toque en una casilla solo
   * enseña la ruta y el segundo la anda.
   */
  pulsar(px: number, py: number, tactil: boolean): void {
    const casilla = this.casillaBajo(px, py);
    const s = this.sesion();
    if (tactil && this.tocada !== pointKey(casilla)) {
      this.señalar(casilla);
      this.tocada = pointKey(casilla);
      if (this.ruta.length > 0) s.status = `${s.status} · Toca otra vez para ir.`;
      this.fraseDeLaRuta = s.status;
      return;
    }
    // Un clic mientras anda solo lo hace llegar: lo que le falta se sigue pintando.
    if (s.marchaEnCurso !== null) {
      s.clickTile(casilla);
      this.olvidarRuta();
      return;
    }
    const heroe = s.selectedHero;
    const salida = heroe === null ? null : { ...heroe.at };
    const ruta = heroe === null ? [] : s.previewPath(casilla);
    s.clickTile(casilla);
    this.olvidarRuta();
    // Si el clic lo ha mandado andar, su ruta se pinta mientras anda y, si no llega,
    // lo que le falta, hasta que se pulse otra cosa.
    const anduvo = heroe !== null && salida !== null && !mismaCasilla(heroe.at, salida);
    this.rutaDeLaMarcha = anduvo ? ruta : [];
    this.destino = anduvo && !mismaCasilla(heroe.at, casilla) ? { heroe: heroe.id, casilla } : null;
    this.rutaDelDestino = null;
  }

  /**
   * El puntero sale del lienzo: se olvida lo que era de pasar por encima.
   *
   * La ruta del primer toque NO, y es lo que estaba roto en pantalla táctil: tras
   * un `pointerup` de dedo el navegador manda siempre un `pointerleave` —el dedo
   * «sale» al levantarse—, y esto vaciaba la ruta que `pulsar()` acababa de
   * calcular. La barra decía «Toca otra vez para ir» sobre un mapa sin camino.
   * Esa ruta la quita el segundo toque, otro toque en otra casilla o
   * `olvidarRuta()`, no levantar el dedo.
   */
  salir(): void {
    this.hover = null;
    if (this.arrastre?.movido !== true) this.arrastre = null;
    if (this.tocada !== null) return;
    this.ruta = [];
    this.claveRuta = null;
  }
}

/**
 * Qué dice la barra al señalar una casilla: qué hay y cuánto cuesta llegar.
 * Lo que se lee del estado son datos de la vista —qué objeto hay, de quién—; la
 * ruta ya viene calculada de la sesión.
 */
function describirCasilla(s: Session, p: Point, ruta: readonly PasoDeRuta[]): string {
  const { map } = s.state;
  if (!inBounds(map, p)) return '';
  const explorada = s.explorado?.has(p) ?? true;
  // Lo mismo que pinta el lienzo: el héroe que se ve ahora y el objeto como se
  // sabe (#64). Con el estado vivo, la barra decía «Castillo (enemigo)» de uno
  // que se recordaba tuyo, y nombraba al héroe rival que el mapa ya no pintaba.
  const objeto = s.objetosConocidos().find((o) => o.at.x === p.x && o.at.y === p.y);
  const heroe = s.heroesALaVista().find((h) => h.at.x === p.x && h.at.y === p.y);
  const asaltante = s.asaltantesALaVista().find((r) => r.at.x === p.x && r.at.y === p.y);
  let que = '';
  // Lo desconocido se dice, pero la ruta también: el héroe puede ir a explorarlo.
  // Nada se ve sobre ello, tampoco un grupo (la niebla de eventos, 02-11-2026).
  if (!explorada) que = 'Tierras desconocidas';
  else if (asaltante !== undefined)
    que = `${individuosDe(asaltante.troops)} asaltantes: emboscan a quien pise su región si le sacan ventaja`;
  else if (heroe !== undefined) {
    que = heroe.owner === s.viewer ? heroe.name : `${heroe.name}, héroe enemigo`;
    // El héroe propio en un lugar tapa su rombo: la barra dice dónde está y cómo se entra.
    if (heroe.owner === s.viewer && objeto?.kind === 'lugar')
      que = `${heroe.name}, en ${objeto.name}: pulsa para entrar`;
  } else if (objeto?.kind === 'town') {
    const t = s.state.towns.find((x) => x.id === objeto.id);
    const dueño =
      objeto.owner === null ? 'neutral' : objeto.owner === s.viewer ? 'tuyo' : 'enemigo';
    que = `${t?.name ?? 'Castillo'} (${dueño})`;
  } else if (objeto?.kind === 'node') {
    que = `Paso ${objeto.owner === s.viewer ? 'tuyo' : objeto.owner === null ? 'sin dueño' : 'enemigo'}`;
  } else if (objeto?.kind === 'village') {
    // La renta lista todo pueblo suyo, también el que no cobra (sin unir u ocupado).
    const paga = s.renta.pueblos.some((p) => p.id === objeto.id && p.oro > 0);
    que = `${objeto.name}: ${REGLA_DEL_PUEBLO} (${paga ? 'ya te paga' : 'a ti no te paga'})`;
  } else if (objeto?.kind === 'monster' && !objeto.defeated)
    que = `${objeto.count} monstruos de guardia`;
  else if (objeto?.kind === 'chest' && !objeto.taken) que = 'Un cofre';
  else if (objeto?.kind === 'lugar') {
    const estado = s.estadoDelLugar(objeto.id);
    que = `${objeto.name}${estado === null ? '' : ` (${estado})`}: acaba la marcha allí para entrar`;
  }
  if (ruta.length === 0) return que === '' ? '' : `${que}.`;
  const llegada = llegadaDeLaRuta(ruta, s.explorado);
  // La emboscada va DELANTE: es lo que cambia la decisión, y una barra larga se
  // corta por el final en pantallas estrechas.
  const emboscada = ruta.find((r) => r.emboscada !== undefined)?.emboscada;
  const aviso =
    emboscada === undefined
      ? ''
      : `Cuidado: el camino cruza la región de ${individuosDe(emboscada.troops)} asaltantes, que te emboscarían (en rojo) · `;
  return que === '' ? `${aviso}Ruta: ${llegada}.` : `${aviso}${que} · ${llegada}.`;
}

/**
 * Cuánto se anda hoy de la ruta, contado sobre **lo mismo que pinta el trazo**
 * (`pasosAPintar`, la misma llamada y no otra lectura de la niebla). Contada
 * sobre la ruta entera, la barra decía «hoy llegas a 7 de 20 pasos» con la mitad
 * en la niebla, y el número delataba el rodeo que el trazo ya callaba (#123).
 * Cuando parte de la ruta no se ve, no se dice «llegas hoy» ni el total: solo
 * lo que se ve, y que sigue más allá si el destino se ve.
 */
export function llegadaDeLaRuta(
  ruta: readonly PasoDeRuta[],
  explorado: CasillasLeidas | null,
): string {
  const vistos = pasosAPintar(ruta, explorado);
  // Si hoy se para ante una barrera que se ve, por qué (H2 de la vuelta 1 de QA
  // de la infiltración): con casi todo el movimiento y sin decirlo, no se entendía.
  const barrera = vistos.find((r) => r.barrera !== undefined)?.barrera;
  const conLaBarrera = (frase: string): string =>
    barrera === undefined ? frase : `${frase}; ${barrera}`;
  const hoy = vistos.filter((r) => r.hoy).length;
  // Ante una barrera le queda movimiento, solo que no el día entero: «no te queda
  // movimiento» se leía contradictorio.
  if (hoy === 0)
    return barrera === undefined
      ? 'hoy no te queda movimiento para dar ni un paso'
      : `hoy no das ni un paso: ${barrera}`;
  if (vistos.length === ruta.length) {
    return hoy === ruta.length
      ? `llegas hoy (${ruta.length} ${ruta.length === 1 ? 'paso' : 'pasos'})`
      : conLaBarrera(`hoy llegas a ${hoy} de ${ruta.length} pasos: dorado hoy, gris otro día`);
  }
  const queSeVen = conLaBarrera(
    `hoy andas ${hoy} de los ${vistos.length} ${vistos.length === 1 ? 'paso' : 'pasos'} que se ven`,
  );
  // Si el destino está en la niebla, la barra ya empieza por «Tierras
  // desconocidas» y la cola lo repetía (QA de #123, H3): solo se dice que sigue
  // por la niebla cuando el destino se ve y la niebla queda en medio. Frase
  // elegida por el usuario en el punto de control del plan.
  return vistos.at(-1)?.marca === 'destino'
    ? `${queSeVen}; sigue por tierras desconocidas`
    : queSeVen;
}

const mismaCasilla = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/**
 * La ruta de la marcha `m` que se pinta mientras anda: la que se enseñaba al
 * mandarlo (`ruta`), si empieza por las casillas que anduvo, con lo que le quedaba;
 * si no (la marcha no salió de un clic en el mapa), solo las que anda, de hoy.
 */
function rutaDeLaMarchaPara(
  m: MarchaEnPantalla,
  ruta: readonly PasoDeRuta[],
): readonly PasoDeRuta[] {
  const anda = m.pasos.slice(1);
  if (anda.every((p, i) => ruta[i] !== undefined && mismaCasilla(ruta[i].at, p))) return ruta;
  return anda.map((at) => ({ at, hoy: true }));
}
