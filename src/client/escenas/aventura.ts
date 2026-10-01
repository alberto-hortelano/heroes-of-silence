/**
 * La escena del mapa: cámara, ratón y dedo. Lo que se pinta lo decide
 * `render/mapa.ts`; lo que se hace al pulsar, `session.ts`.
 *
 * Guarda solo estado de píxel —dónde mira la cámara, qué casilla está señalada,
 * si se está arrastrando—, igual que hacía `main.ts` antes de partirse.
 */
import { individuosDe } from '@core/hero/troop.js';
import { inBounds, objectAt, pointKey } from '@core/map/map.js';
import type { Point } from '@core/types.js';
import {
  acotar,
  arrastrar,
  type CamaraMapa,
  centrarEn,
  type Encuadre,
  pixelACasilla,
  TILE_INICIAL,
  zoom,
} from '../render/camara-mapa.js';
import { drawMapa, type PasoDeRuta } from '../render/mapa.js';
import { casillaDelMinimapa, drawMinimapa } from '../render/minimapa.js';
import type { Session } from '../session.js';

/** Cuántos píxeles hay que mover el puntero para que un clic pase a arrastre. */
const UMBRAL_ARRASTRE = 8;

/**
 * Dónde mira la cámara cuando nadie la ha movido: el héroe elegido, y si no hay,
 * el primer castillo. Exportada porque el guion de capturas tiene que saber a
 * dónde mira la página para pulsar donde toca.
 */
export function focoDe(s: Session): Point {
  return s.selectedHero?.at ?? s.myTowns()[0]?.at ?? { x: 0, y: 0 };
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
  private encuadre: Encuadre = { ancho: 1, alto: 1, mapaAncho: 1, mapaAlto: 1 };

  constructor(private readonly sesion: () => Session) {}

  /** Se está arrastrando el mapa: hay que repintar a cada fotograma. */
  get arrastrando(): boolean {
    return this.arrastre?.movido === true;
  }

  /** Vuelve a centrar en el héroe seleccionado (botón «Centrar héroe»). */
  centrar(): void {
    this.seguido = '';
  }

  zoom(direccion: 1 | -1, ancla?: { x: number; y: number }): void {
    this.camara = zoom(this.camara, direccion, this.encuadre, ancla);
  }

  /** Olvida la ruta: tras un movimiento o al cambiar de héroe ya no vale. */
  olvidarRuta(): void {
    this.ruta = [];
    this.claveRuta = null;
    this.tocada = null;
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
    this.encuadre = { ancho, alto, mapaAncho: s.state.map.width, mapaAlto: s.state.map.height };
    const foco = focoDe(s);
    const clave = `${s.selectedHeroId ?? ''}@${pointKey(foco)}`;
    if (clave !== this.seguido && this.arrastre === null) {
      this.seguido = clave;
      this.camara = centrarEn(this.camara, foco, this.encuadre);
    } else {
      this.camara = acotar(this.camara, this.encuadre);
    }
  }

  dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, ahora: number): void {
    const s = this.sesion();
    const state = s.state;
    this.encuadrar(ancho, alto);
    drawMapa(ctx, {
      escena: state,
      camara: this.camara,
      ancho,
      alto,
      explorado: s.explorado,
      visibles: s.revealAll ? null : s.visibles(),
      ruta: this.ruta,
      seleccionado: s.selectedHeroId,
      hover: this.hover,
      semilla: state.seed,
      tiempo: ahora,
      version: s.version,
    });
  }

  dibujarMinimapa(lienzo: HTMLCanvasElement): void {
    const c = lienzo.getContext('2d');
    if (c === null) return;
    const s = this.sesion();
    drawMinimapa(c, lienzo.width, lienzo.height, {
      escena: s.state,
      explorado: s.explorado,
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
    this.señalar(pixelACasilla(this.camara, px, py));
  }

  private señalar(casilla: Point): void {
    const s = this.sesion();
    this.hover = casilla;
    const heroe = s.selectedHero;
    const clave = `${pointKey(casilla)}|${heroe?.id ?? ''}|${heroe?.movePoints ?? 0}|${s.isPlayersTurn}`;
    if (clave === this.claveRuta) return;
    this.claveRuta = clave;
    this.ruta = s.previewPath(casilla);
    s.status = describirCasilla(s, casilla, this.ruta);
  }

  /**
   * Suelta el puntero. Si no hubo arrastre es un clic: mueve al héroe, o abre
   * el castillo, o selecciona —lo decide `clickTile`—. Con el dedo, el primer
   * toque en una casilla solo enseña la ruta y el segundo la anda.
   */
  soltar(px: number, py: number, tactil: boolean): void {
    const a = this.arrastre;
    this.arrastre = null;
    if (a?.movido === true) return;
    const casilla = pixelACasilla(this.camara, px, py);
    const s = this.sesion();
    if (tactil && this.tocada !== pointKey(casilla)) {
      this.señalar(casilla);
      this.tocada = pointKey(casilla);
      if (this.ruta.length > 0) s.status = `${s.status} · Toca otra vez para ir.`;
      return;
    }
    s.clickTile(casilla);
    this.olvidarRuta();
  }

  /**
   * El puntero sale del lienzo: se olvida lo que era de pasar por encima.
   *
   * La ruta del primer toque NO, y es lo que estaba roto en pantalla táctil: tras
   * un `pointerup` de dedo el navegador manda siempre un `pointerleave` —el dedo
   * «sale» al levantarse—, y esto vaciaba la ruta que `soltar()` acababa de
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
  const explorada = s.explorado?.has(pointKey(p)) ?? true;
  const objeto = objectAt(map, p);
  const heroe = s.state.heroes.find((h) => h.at.x === p.x && h.at.y === p.y);
  const asaltante = s.state.raiders.find((r) => r.at.x === p.x && r.at.y === p.y);
  let que = '';
  // Lo desconocido se dice, pero la ruta también: el héroe puede ir a explorarlo.
  if (!explorada) que = 'Tierras desconocidas';
  else if (heroe !== undefined)
    que = heroe.owner === s.viewer ? heroe.name : `${heroe.name}, héroe enemigo`;
  else if (asaltante !== undefined)
    que = `${individuosDe(asaltante.troops)} asaltantes: emboscan a quien pise su región si le sacan ventaja`;
  else if (objeto?.kind === 'town') {
    const t = s.state.towns.find((x) => x.id === objeto.id);
    const dueño =
      objeto.owner === null ? 'neutral' : objeto.owner === s.viewer ? 'tuyo' : 'enemigo';
    que = `${t?.name ?? 'Castillo'} (${dueño})`;
  } else if (objeto?.kind === 'node') {
    que = `Paso ${objeto.owner === s.viewer ? 'tuyo' : objeto.owner === null ? 'sin dueño' : 'enemigo'}`;
  } else if (objeto?.kind === 'mine') {
    que = 'Mina: produce para quien tenga la región';
  } else if (objeto?.kind === 'village') {
    que = `${objeto.name}: es de quien tenga la región`;
  } else if (objeto?.kind === 'monster' && !objeto.defeated)
    que = `${objeto.count} monstruos de guardia`;
  else if (objeto?.kind === 'chest' && !objeto.taken) que = 'Un cofre';
  else if (objeto?.kind === 'resource' && !objeto.taken) que = 'Recursos sueltos';
  if (ruta.length === 0) return que === '' ? '' : `${que}.`;
  const hoy = ruta.filter((r) => r.hoy).length;
  const llegada =
    hoy === ruta.length
      ? `llegas hoy (${ruta.length} ${ruta.length === 1 ? 'paso' : 'pasos'})`
      : hoy === 0
        ? 'hoy no te queda movimiento para dar ni un paso'
        : `hoy llegas a ${hoy} de ${ruta.length} pasos: dorado hoy, gris otro día`;
  // La emboscada va DELANTE: es lo que cambia la decisión, y una barra larga se
  // corta por el final en pantallas estrechas.
  const emboscada = ruta.find((r) => r.emboscada !== undefined)?.emboscada;
  const aviso =
    emboscada === undefined
      ? ''
      : `Cuidado: el camino cruza la región de ${individuosDe(emboscada.troops)} asaltantes, que te emboscarían (en rojo) · `;
  return que === '' ? `${aviso}Ruta: ${llegada}.` : `${aviso}${que} · ${llegada}.`;
}
