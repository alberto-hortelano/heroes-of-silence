/**
 * La escena de la base: un sitio por el que se camina.
 *
 * Quien camina es el héroe que está dentro o, si no hay, el alcaide. Un clic en
 * la franja lo lleva andando hasta allí en recta (fuera de ella, al punto más
 * cercano dentro: `alaFranja`), resbalando por el borde de atrás, que sigue los
 * umbrales pintados y no es convexo; un clic en un edificio lo lleva a su puerta y, al llegar, abre lo
 * suyo —el ayuntamiento y el castillo, «Ampliar»; una morada, su escena, donde se
 * recluta (`Session.abrirLaMorada`, `escenas/morada.ts`)—;
 * un clic en una persona lo lleva a su lado y abre la conversación. Un clic en
 * el suelo cierra lo abierto. Desde la lista de edificios del panel (`irA`) se
 * llega a una puerta sin cruzar la plaza: el escenario mide 58 pasos y a la vista
 * caben unos 12, así que un edificio lejano no se podía ni pulsar.
 *
 * Cada vez que se abre la base (`Session.aperturaDeLaBase`) se empieza en la
 * entrada y sin nada abierto, aunque sea la misma base de antes.
 *
 * Todo esto es estado del cliente y no del núcleo: dónde está la figura en la
 * base no es una regla, no viaja en el estado y no lo ve el agente. Las reglas
 * —construir, reclutar— van por los botones del panel a la sesión, como siempre.
 */
import { abreAmpliar, moradaEn, type SitioId } from '@core/town/sitios.js';
import type { FactionId } from '@core/types.js';
import {
  alaFranja,
  type Disposicion,
  disposicionDe,
  type Mirada,
  type Plano,
} from '../../shared/base.js';
import { porElCamino } from '../anim.js';
import { direccionHacia } from '../direccion.js';
import { msPorCasilla } from '../marcha.js';
import { abiertaDe, arteDeLaBase, conLaAbierta } from '../render/base/arte.js';
import { camaraDeLaBase, camaraQuieta, seguir } from '../render/base/camara.js';
import {
  componerBase,
  dondeEsta,
  type Elemento,
  type VistaDeLaBase,
} from '../render/base/escena.js';
import { type Golpe, queHayBajo } from '../render/base/golpe.js';
import { type PintadoDeLaBase, pintarBase, pintarElAireDeLaBase } from '../render/base/pintar.js';
import { luzDeLasFiguras } from '../render/clima/recetas.js';
import { animarHasta } from '../render/figura.js';
import { densidadDe } from '../render/lienzo.js';
import { dondeEsperaEnLaMorada } from '../render/morada/fila.js';
import { playerColor } from '../render/palette.js';
import { ALTO_DE_FIGURA, pasoDeLaBase, type Tablero } from '../render/proyeccion.js';
import { AYUDA_DE_LA_BASE, type Session } from '../session.js';
import type { ClimaDeLaFila } from './morada.js';

/**
 * Cuánto más deprisa se anda en la base que en una batalla. Con el paso del
 * combate, un escenario de 24 pasos se cruza en unos 8 s; pasear para todo
 * cansa (riesgo del plan). Medido contra el test de la entrada al ayuntamiento
 * y a la morada de al lado, en menos de 1,5 s.
 */
export const PRISA_EN_LA_BASE = 1.6;

/** Lo que queda abierto al llegar: la ampliación, lo de un edificio o una conversación. */
export type Abierto =
  | { readonly tipo: 'ampliar' }
  | { readonly tipo: 'sitio'; readonly sitio: SitioId }
  | { readonly tipo: 'pnj'; readonly id: string };

/**
 * Lo que se abre al llegar a la puerta de un sitio: «Ampliar» o lo suyo. En una
 * morada, lo suyo es su escena (`llegar`).
 */
function abiertoAlLlegar(sitio: SitioId): Abierto {
  return abreAmpliar(sitio) ? { tipo: 'ampliar' } : { tipo: 'sitio', sitio };
}

/** Lo que se aparta quien camina de la persona con la que va a hablar, en pasos. */
const AL_LADO = { x: -0.6, y: 0.1 } as const;

/**
 * Adónde va quien camina para hablar con quien está en `en`: a su lado, dentro
 * de lo que se pisa. Lo leen la escena y `pnpm capturas`.
 */
export function dondeHablarCon(d: Disposicion, en: Plano): Plano {
  return alaFranja(d, { x: en.x + AL_LADO.x, y: en.y + AL_LADO.y });
}

/** Una marcha en recta de `desde` a `hasta`: donde la recta se sale por detrás, `actualizar` la recorta. */
interface Marcha {
  readonly desde: Plano;
  readonly hasta: Plano;
  /** Hacia dónde mira mientras anda (`direccionHacia`, la regla de la batalla). */
  readonly mira: Mirada;
  readonly empieza: number;
  readonly dura: number;
  readonly alLlegar: Abierto | null;
  /** Hacia dónde mira al llegar: al edificio o a la persona. */
  readonly miraAlLlegar: Mirada | null;
}

/** La base abierta y su disposición. */
interface BaseAbierta {
  readonly vista: VistaDeLaBase;
  readonly d: Disposicion;
}

export class EscenaBase {
  private lienzo = { ancho: 1, alto: 1 };
  /**
   * De qué sesión, qué base y qué apertura es lo de abajo: otra base, u otra
   * vez la misma, empieza en su entrada y sin nada abierto. Con solo la base,
   * al volver otro día se encontraba a quien caminaba donde se dejó y el panel
   * de la morada de ayer puesto.
   */
  private de: { sesion: Session; townId: string; apertura: number } | null = null;
  private en: Plano = { x: 0, y: 0 };
  private mira: Mirada = 'N';
  private quietoDesde = 0;
  private marcha: Marcha | null = null;
  private abiertoAhora: Abierto | null = null;
  private señalado: Exclude<Golpe, { tipo: 'suelo' }> | null = null;
  /** El paso del borde izquierdo de la vista, y cuándo se movió por última vez. */
  private camaraX: number | null = null;
  private camaraEn: number | null = null;
  /** Píxeles de dispositivo por píxel CSS del último lienzo dibujado: la cámara cae en uno entero. */
  private densidad = 1;
  constructor(
    private readonly sesion: () => Session,
    /** De dónde sale la disposición de cada facción: la de `data/bases/`, o la que pase un test. */
    private readonly disposicion: (f: FactionId) => Disposicion = disposicionDe,
  ) {}

  /** Lo abierto: lo lee el panel (`renderSide`) y la conversación de `main.ts`. */
  get abierto(): Abierto | null {
    // Primero `base()`: una apertura nueva cierra lo de la anterior, también
    // antes de que se dibuje el primer fotograma.
    this.base();
    return this.abiertoAhora;
  }

  cerrar(): void {
    this.abiertoAhora = null;
  }

  /**
   * Lo que `main.ts` escribe en `canvas.dataset.base`: qué hay abierto o si se
   * anda. Es por donde esperan los tests del navegador y `pnpm capturas`: vale
   * `andando` también mientras la cámara no ha llegado a su sitio, así que al
   * leer `quieto` la vista ya es la de `camaraQuieta` y se puede pulsar donde
   * dice ella.
   */
  get marca(): string {
    if (this.marcha !== null || !this.camaraLlegada(this.base())) return 'andando';
    const a = this.abiertoAhora;
    if (a === null) return 'quieto';
    return a.tipo === 'ampliar'
      ? 'ampliar'
      : a.tipo === 'sitio'
        ? `sitio:${a.sitio}`
        : `pnj:${a.id}`;
  }

  encuadrar(ancho: number, alto: number): void {
    this.lienzo = { ancho, alto };
  }

  /** La base de ahora con su disposición, o `null` sin base abierta. Recoloca al cambiar de base. */
  private base(): BaseAbierta | null {
    const s = this.sesion();
    const vista = s.vistaDeLaBase();
    if (vista === null) return null;
    const d = this.disposicion(vista.faccion);
    const apertura = s.aperturaDeLaBase;
    if (
      this.de === null ||
      this.de.sesion !== s ||
      this.de.townId !== vista.townId ||
      this.de.apertura !== apertura
    ) {
      this.de = { sesion: s, townId: vista.townId, apertura };
      this.en = d.entrada;
      this.mira = 'N';
      this.marcha = null;
      this.abiertoAhora = null;
      this.señalado = null;
      this.camaraX = null;
      this.camaraEn = null;
    }
    return { vista, d };
  }

  private camaraLlegada(b: BaseAbierta | null): boolean {
    if (b === null || this.camaraX === null) return true;
    return this.camaraX === camaraQuieta(b.d, this.lienzo, this.en.x);
  }

  /**
   * La vista de ahora: la última dibujada o, antes del primer fotograma (o en
   * los tests, que no dibujan), la quieta sobre quien camina.
   */
  camara(): Tablero | null {
    const b = this.base();
    return b === null ? null : this.camaraDe(b);
  }

  private camaraDe(b: BaseAbierta): Tablero {
    return camaraDeLaBase(
      this.lienzo,
      this.camaraX ?? camaraQuieta(b.d, this.lienzo, this.en.x),
      pasoDeLaBase(this.lienzo.alto),
      this.densidad,
    );
  }

  /** Lleva la cámara hacia quien camina hasta `ahora`. */
  private moverCamara(b: BaseAbierta, ahora: number): void {
    const { d } = b;
    if (this.camaraX === null || this.camaraEn === null) {
      this.camaraX = camaraQuieta(d, this.lienzo, this.en.x);
    } else {
      this.camaraX = seguir(this.camaraX, this.en.x, d, this.lienzo, ahora - this.camaraEn);
    }
    this.camaraEn = ahora;
    if (!this.camaraLlegada(b)) animarHasta(ahora + 50);
  }

  /** Dónde está quien camina, en pasos (en la entrada, al abrir una base). */
  get posicion(): Plano {
    this.base();
    return this.en;
  }

  /** Lleva la marcha hasta `ahora`: mueve a quien camina y, al llegar, abre lo suyo. */
  actualizar(ahora: number, b: BaseAbierta | null = this.base()): void {
    const m = this.marcha;
    if (m === null) return;
    const t = m.dura === 0 ? 1 : (ahora - m.empieza) / m.dura;
    if (t < 1) {
      const en = porElCamino([m.desde, m.hasta], t);
      // Lo que se pisa no es convexo (el borde de atrás une los umbrales del
      // cuadro): la recta puede salirse por detrás, y la figura resbala por él.
      this.en = b === null ? en : alaFranja(b.d, en);
      this.mira = m.mira;
      return;
    }
    this.en = m.hasta;
    if (m.miraAlLlegar !== null) this.mira = m.miraAlLlegar;
    this.marcha = null;
    this.quietoDesde = ahora;
    this.llegar(m.alLlegar);
  }

  /**
   * Lo que pasa al llegar, andando o desde la lista (`irA`): la puerta de una
   * morada (`moradaEn`) cambia de escena —la sesión la abre y aquí no queda nada
   * abierto, así que al volver quien anduvo está quieto en su puerta—; lo demás
   * se abre en el panel.
   */
  private llegar(a: Abierto | null): void {
    const town = this.sesion().activeTown;
    if (a?.tipo === 'sitio' && town !== null && moradaEn(town, a.sitio).edificio !== null) {
      this.abiertoAhora = null;
      this.sesion().abrirLaMorada(a.sitio);
      return;
    }
    this.abiertoAhora = a;
  }

  private elementos(vista: VistaDeLaBase, d: Disposicion, ahora: number, gente = true): Elemento[] {
    const andando = this.marcha !== null;
    return componerBase(
      d,
      vista,
      {
        en: this.en,
        mira: this.mira,
        clip: andando ? 'walk' : 'idle',
        tiempo: andando ? ahora - (this.marcha?.empieza ?? 0) : ahora - this.quietoDesde,
      },
      ahora,
      { gente },
    );
  }

  dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, ahora: number): void {
    this.encuadrar(ancho, alto);
    this.densidad = densidadDe(ctx);
    const b = this.base();
    if (b === null) return;
    this.actualizar(ahora, b);
    this.moverCamara(b, ahora);
    pintarBase(ctx, {
      d: b.d,
      t: this.camaraDe(b),
      lienzo: this.lienzo,
      elementos: this.elementos(b.vista, b.d, ahora),
      arte: this.arte(b.vista),
      color: playerColor(b.vista.owner),
      señalado: this.señalado,
      clima: this.climaDe(ahora),
    });
  }

  /** El clima de la base abierta (el de la región de su ciudad), con el reloj. */
  private climaDe(ahora: number): PintadoDeLaBase['clima'] {
    const sitio = this.sesion().climaDeLaBase;
    return sitio === null ? null : { sitio, ahora };
  }

  /**
   * La base detrás de la morada de `edificio` (`escenas/morada.ts`), con la cámara
   * de la morada (`encuadrarLaMorada`): la plaza de siempre, ese edificio cambiado
   * por su versión abierta si la hay (`conLaAbierta`; si no, su exterior), quien
   * anduvo quieto en su puerta y nadie más. No toca la cámara de la base ni su
   * lienzo: al volver, la base está como se dejó. Devuelve el clima de la fila
   * de reclutas: la luz que les cae y lo que va delante (la lluvia y el rayo).
   */
  pintarLaMorada(
    ctx: CanvasRenderingContext2D,
    lienzo: { readonly ancho: number; readonly alto: number },
    camara: Tablero,
    edificio: string,
    ahora: number,
  ): ClimaDeLaFila | null {
    const b = this.base();
    if (b === null) return null;
    const v: PintadoDeLaBase = {
      d: b.d,
      t: camara,
      lienzo,
      elementos: this.elementos(b.vista, b.d, ahora, false),
      arte: conLaAbierta(this.arte(b.vista), edificio, abiertaDe(b.vista.faccion, edificio)),
      color: playerColor(b.vista.owner),
      señalado: null,
      clima: this.climaDe(ahora),
      sinAire: true,
    };
    pintarBase(ctx, v);
    return {
      luz: v.clima === null ? undefined : luzDeLasFiguras(v.clima.sitio),
      delante: () => pintarElAireDeLaBase(ctx, v),
    };
  }

  /** El arte de la base de `vista`, con los recortes de lo construido. */
  private arte(vista: VistaDeLaBase) {
    return arteDeLaBase(
      vista.faccion,
      vista.edificios.map((e) => e.edificio),
    );
  }

  /** Qué hay bajo un píxel del lienzo, con la vista de ahora. */
  private golpe(b: BaseAbierta, px: number, py: number, ahora: number): Golpe {
    return queHayBajo(
      b.d,
      this.elementos(b.vista, b.d, ahora),
      this.arte(b.vista),
      this.camaraDe(b),
      px,
      py,
    );
  }

  /** El ratón encima: resalta y dice en la barra qué es. Verdadero si se puede pulsar algo. */
  mover(px: number, py: number, ahora = 0): boolean {
    const s = this.sesion();
    const b = this.base();
    const g = b === null ? null : this.golpe(b, px, py, ahora);
    if (b === null || g === null || g.tipo === 'suelo') {
      this.señalado = null;
      if (b !== null) s.status = AYUDA_DE_LA_BASE;
      return false;
    }
    this.señalado = g;
    if (g.tipo === 'pnj') {
      const p = b.vista.gente.find((x) => x.id === g.id);
      s.status = p === undefined ? '' : `${p.nombre}, ${p.papel}: pulsa para hablar.`;
      return true;
    }
    const e = b.vista.edificios.find((x) => x.sitio === g.sitio);
    const nombre = e?.nombre ?? '';
    s.status = abreAmpliar(g.sitio)
      ? `${nombre}: pulsa para ampliar la base.`
      : `${nombre}: pulsa para entrar.`;
    return true;
  }

  salir(): void {
    this.señalado = null;
  }

  /** Un clic: echa a andar hacia lo pulsado y, al llegar, abre lo suyo. */
  pulsar(px: number, py: number, ahora: number): void {
    const b = this.base();
    if (b === null) return;
    this.actualizar(ahora, b);
    const g = this.golpe(b, px, py, ahora);
    const { d, vista } = b;
    // Lo que decía el ratón encima («pulsa para entrar») ya está pulsado.
    this.sesion().status = AYUDA_DE_LA_BASE;
    switch (g.tipo) {
      case 'suelo':
        // Fuera de la franja —la plaza de un sitio vacío, el cielo, el margen—
        // es suelo igual: se anda hasta el punto más cercano dentro.
        this.abiertoAhora = null;
        this.andar(d, vista, alaFranja(d, g.en), null, null, ahora);
        return;
      case 'sitio': {
        this.andar(d, vista, this.adondeVa(d, g.sitio), abiertoAlLlegar(g.sitio), 'N', ahora);
        return;
      }
      case 'pnj': {
        const persona = vista.gente.find((x) => x.id === g.id);
        if (persona === undefined) return;
        const { en } = dondeEsta(d, persona);
        const hasta = dondeHablarCon(d, en);
        this.andar(
          d,
          vista,
          hasta,
          { tipo: 'pnj', id: g.id },
          direccionHacia(hasta, en, 'E'),
          ahora,
        );
        return;
      }
    }
  }

  /**
   * Desde la lista de edificios: quien camina aparece en la puerta de `sitio`,
   * la cámara salta a ella y se abre lo suyo (o se entra en la morada), igual que
   * al llegar andando. Lanza si el sitio no tiene nada construido: la lista solo
   * ofrece lo construido.
   */
  irA(sitio: string, ahora: number): void {
    // Desde la morada (o la tropa) no se va a otro sitio de la base: la lista que
    // lo pide es la de la base, y un clic que llega tarde (el segundo de un doble
    // clic) no saca de donde ya se está (QA I3 de la vuelta 2).
    if (this.sesion().scene !== 'town') return;
    const b = this.base();
    if (b === null) throw new Error(`no se puede ir a "${sitio}": no hay ninguna base abierta`);
    const e = b.vista.edificios.find((x) => x.sitio === sitio);
    if (e === undefined) {
      throw new Error(`no se puede ir a "${sitio}": en esta base no hay nada construido ahí`);
    }
    this.marcha = null;
    this.en = alaFranja(b.d, this.adondeVa(b.d, e.sitio));
    this.mira = 'N';
    this.quietoDesde = ahora;
    this.camaraX = camaraQuieta(b.d, this.lienzo, this.en.x);
    this.camaraEn = ahora;
    this.sesion().status = AYUDA_DE_LA_BASE;
    this.llegar(abiertoAlLlegar(e.sitio));
  }

  /**
   * Adónde va quien camina al pulsar el sitio: a su puerta o, en una morada, a
   * esperar delante de la fila de los reclutas (`dondeEsperaEnLaMorada`).
   */
  private adondeVa(d: Disposicion, sitio: SitioId): Plano {
    const town = this.sesion().activeTown;
    return town !== null && moradaEn(town, sitio).edificio !== null
      ? dondeEsperaEnLaMorada(d, sitio)
      : d.sitios[sitio].puerta;
  }

  private andar(
    d: Disposicion,
    vista: VistaDeLaBase,
    hasta: Plano,
    alLlegar: Abierto | null,
    miraAlLlegar: Mirada | null,
    ahora: number,
  ): void {
    // Lo abierto se cierra al echar a andar y se abre al llegar: el panel de la
    // morada de antes no se queda puesto mientras se va a otra.
    this.abiertoAhora = null;
    // Se va en recta; donde la recta se sale por detrás, `actualizar` la recorta.
    const desde = this.en;
    const meta = alaFranja(d, hasta);
    // Como en una batalla (`anim.ts`): la zancada de la figura a su alto en pasos.
    const msPorPaso =
      msPorCasilla(vista.caminante.cuerpo, 'walk', ALTO_DE_FIGURA) / PRISA_EN_LA_BASE;
    const dura = Math.hypot(meta.x - desde.x, meta.y - desde.y) * msPorPaso;
    this.marcha = {
      desde,
      hasta: meta,
      mira: direccionHacia(desde, meta, this.mira),
      empieza: ahora,
      dura,
      alLlegar,
      miraAlLlegar,
    };
    animarHasta(ahora + dura);
    if (dura === 0) this.actualizar(ahora);
  }
}
