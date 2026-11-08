/**
 * Quien camina por un escenario lateral —la base de una ciudad (`partida/base/escena.ts`) y un
 * lugar de un mundo (`partida/lugar/escena.ts`)— y la cámara que lo sigue: dónde está y hacia
 * dónde mira, la marcha en recta que lo lleva a un sitio y la vista del lienzo, con el paso de
 * la base (`render/base/camara.ts`). Hasta R5 de la reorganización (07-11-2026) cada escena
 * llevaba su copia de todo esto; lo que hace cada una al llegar sigue siendo suyo (`andar`
 * recibe `alLlegar`).
 *
 * Avanzar la marcha (`avanzar`) y llevar la cámara (`seguirConLaCamara`) son dos pasos porque
 * las dos escenas no los dan igual: la base lleva la cámara solo al dibujar, y en un clic solo
 * avanza la marcha; el lugar da los dos a la vez, al dibujar y en cada clic. Se nota con una
 * marcha de duración 0, que llega en el acto: en la base, sin mover la cámara; en el lugar,
 * con ella. Cada escena da los pasos en su orden.
 *
 * Es estado del cliente y no del núcleo: dónde está la figura no es una regla, no viaja en el
 * estado y no lo ve el agente.
 */
import { ALTO_DE_FIGURA, type Mirada, type Plano } from '../../shared/arte.js';
import { alaFranja, type Disposicion } from '../../shared/base.js';
import { porElCamino } from '../batalla/anim.js';
import { camaraDeLaBase, camaraQuieta, type Lienzo, seguir } from '../render/base/camara.js';
import type { EstadoDelCaminante } from '../render/base/escena.js';
import { direccionHacia } from '../render/figuras/direccion.js';
import { animarHasta } from '../render/figuras/figura.js';
import { msPorCasilla } from '../render/figuras/marcha.js';
import { pasoDeLaBase, type Tablero } from '../render/proyeccion.js';

/** Una marcha en recta de `desde` a `hasta`: donde la recta se sale por detrás, `avanzar` la recorta. */
interface Marcha {
  readonly desde: Plano;
  readonly hasta: Plano;
  /** Hacia dónde mira mientras anda (`direccionHacia`, la regla de la batalla). */
  readonly mira: Mirada;
  readonly empieza: number;
  readonly dura: number;
  /** Hacia dónde mira al llegar (al edificio, a la persona), o `null` para seguir como iba. */
  readonly miraAlLlegar: Mirada | null;
  /** Lo que hace la escena al llegar (abrir lo de un sitio, hablar), o `null` si nada. */
  readonly alLlegar: (() => void) | null;
}

/** Lo que distingue el paso de una escena: cuánto se anda y a qué ritmo va el clip de andar. */
interface PasoDelCaminante {
  /**
   * Cuánto más deprisa se anda que en una batalla, donde la zancada de la figura a su alto
   * casa con lo que avanza (`msPorCasilla`, como `anim.ts`).
   */
  readonly prisa: number;
  /** A cuántas veces su ritmo va el clip de andar mientras anda (1, el de su hoja). */
  readonly ritmoDelClip: number;
}

export class Caminante {
  private medida: Lienzo = { ancho: 1, alto: 1 };
  /** Píxeles de dispositivo por píxel CSS del último lienzo dibujado: la cámara cae en uno entero. */
  private densidad = 1;
  private donde: Plano = { x: 0, y: 0 };
  private hacia: Mirada = 'N';
  private quietoDesde = 0;
  private marcha: Marcha | null = null;
  /** El paso del borde izquierdo de la vista, y cuándo se movió por última vez. */
  private camaraX: number | null = null;
  private camaraEn: number | null = null;

  constructor(private readonly paso: PasoDelCaminante) {}

  /** Dónde está, en pasos del escenario. */
  get en(): Plano {
    return this.donde;
  }

  /** Si anda una marcha (aunque la cámara aún no haya llegado: `camaraLlegada`). */
  get andando(): boolean {
    return this.marcha !== null;
  }

  /** El lienzo en que se mira, en píxeles CSS: el de la cámara, y el de lo que se pinta con ella. */
  get lienzo(): Lienzo {
    return this.medida;
  }

  /** Mide el lienzo; al dibujar, también su densidad. */
  encuadrar(ancho: number, alto: number, densidad = this.densidad): void {
    this.medida = { ancho, alto };
    this.densidad = densidad;
  }

  /** Al abrir el escenario: en `en`, mirando a `mira`, sin marcha y con la cámara por poner. */
  empezarEn(en: Plano, mira: Mirada): void {
    this.donde = en;
    this.hacia = mira;
    this.marcha = null;
    this.camaraX = null;
    this.camaraEn = null;
  }

  /** Dónde está y qué hace, para pintarlo (`componerBase`): andando o quieto, con su reloj. */
  estado(ahora: number): EstadoDelCaminante {
    const m = this.marcha;
    return {
      en: this.donde,
      mira: this.hacia,
      clip: m !== null ? 'walk' : 'idle',
      tiempo: m !== null ? (ahora - m.empieza) * this.paso.ritmoDelClip : ahora - this.quietoDesde,
    };
  }

  /**
   * Echa a andar en recta hacia `hasta` (dentro de lo que se pisa de `d`, `alaFranja`) a la
   * zancada de `cuerpo` a su alto en pasos, con la prisa de la escena; al llegar mira hacia
   * `miraAlLlegar`, si lo hay, y hace `alLlegar`. Devuelve lo que dura: con 0 llegará en el
   * primer `avanzar`, y la escena lo da ya en su orden.
   */
  andar(
    d: Disposicion,
    cuerpo: string,
    hasta: Plano,
    ahora: number,
    miraAlLlegar: Mirada | null,
    alLlegar: (() => void) | null,
  ): number {
    const desde = this.donde;
    const meta = alaFranja(d, hasta);
    const msPorPaso = msPorCasilla(cuerpo, 'walk', ALTO_DE_FIGURA) / this.paso.prisa;
    const dura = Math.hypot(meta.x - desde.x, meta.y - desde.y) * msPorPaso;
    this.marcha = {
      desde,
      hasta: meta,
      mira: direccionHacia(desde, meta, this.hacia),
      empieza: ahora,
      dura,
      miraAlLlegar,
      alLlegar,
    };
    animarHasta(ahora + dura);
    return dura;
  }

  /**
   * Lleva la marcha hasta `ahora`: va por la recta, recortada a lo que se pisa de `d`, que no
   * es convexo (el borde de atrás une los umbrales del cuadro): la recta puede salirse por
   * detrás, y la figura resbala por él. Al llegar, quieto, mira hacia donde toque y la escena
   * hace lo suyo. La cámara no se toca. Sin marcha, nada.
   */
  avanzar(ahora: number, d: Disposicion | null): void {
    const m = this.marcha;
    if (m === null) return;
    const t = m.dura === 0 ? 1 : (ahora - m.empieza) / m.dura;
    if (t < 1) {
      const en = porElCamino([m.desde, m.hasta], t);
      this.donde = d === null ? en : alaFranja(d, en);
      this.hacia = m.mira;
      return;
    }
    this.donde = m.hasta;
    if (m.miraAlLlegar !== null) this.hacia = m.miraAlLlegar;
    this.marcha = null;
    this.quietoDesde = ahora;
    m.alLlegar?.();
  }

  /**
   * Pone a quien camina en `en`, quieto y mirando a `mira`, con la cámara ya sobre él, sin
   * marcha ni cámara que lo siga: desde la lista de edificios, la base lleva a una puerta sin
   * cruzar la plaza (`EscenaBase.irA`). Lo que esperaba la marcha de antes ya no llega.
   */
  plantarEn(d: Disposicion, en: Plano, mira: Mirada, ahora: number): void {
    this.marcha = null;
    this.donde = en;
    this.hacia = mira;
    this.quietoDesde = ahora;
    this.camaraX = camaraQuieta(d, this.medida, en.x);
    this.camaraEn = ahora;
  }

  /** Lleva la cámara hacia quien camina hasta `ahora`; mientras no llega, un fotograma más. */
  seguirConLaCamara(d: Disposicion, ahora: number): void {
    if (this.camaraX === null || this.camaraEn === null) {
      this.camaraX = camaraQuieta(d, this.medida, this.donde.x);
    } else {
      this.camaraX = seguir(this.camaraX, this.donde.x, d, this.medida, ahora - this.camaraEn);
    }
    this.camaraEn = ahora;
    if (!this.camaraLlegada(d)) animarHasta(ahora + 50);
  }

  /** Si la cámara ya está quieta sobre quien camina (o aún no se ha puesto). */
  camaraLlegada(d: Disposicion): boolean {
    return this.camaraX === null || this.camaraX === camaraQuieta(d, this.medida, this.donde.x);
  }

  /**
   * La vista de ahora: la última a la que se llevó la cámara o, antes del primer fotograma (o
   * en los tests, que no dibujan), la quieta sobre quien camina.
   */
  camara(d: Disposicion): Tablero {
    return camaraDeLaBase(
      this.medida,
      this.camaraX ?? camaraQuieta(d, this.medida, this.donde.x),
      pasoDeLaBase(this.medida.alto),
      this.densidad,
    );
  }
}
