/**
 * La escena de un lugar de un mundo (F1a del mapa vivo): un escenario lateral
 * por el que se anda, como la base, con su gente y sus cosas en fila.
 *
 * Sin arte nuevo (P5): el fondo es la plaza de los primeros tramos de la base de
 * la facción del lugar (`disposicionDelLugar`) sin edificios —o su marcador, sin
 * arte—, y la gente se pinta con la hoja de su cuerpo; una cosa, con un marcador
 * propio (un mojón con su inicial). Un clic en el suelo lleva a quien camina; en
 * alguien o algo, lo lleva a su lado y abre la conversación (`EnElLugar.hablar`),
 * que pinta el `<dialog id="conversacion">` de `main.ts`.
 *
 * Quien camina y la cámara que lo sigue son los de la base (`partida/caminante.ts`; hasta
 * R5 de la reorganización, 07-11-2026, una copia de los de `partida/base/escena.ts`), con
 * más prisa (`PRISA_EN_UN_LUGAR`). La franja, el pintor y el golpe son los de la base
 * (`render/base/`), y dónde se para quien va a hablar con alguien, a su lado
 * (`dondeHablarEnElLugar`).
 */
import { inicialDelNombre } from '@core/mundo/formato.js';
import type { Mirada, Plano } from '../../../shared/arte.js';
import {
  alaFranja,
  bordeDeAtras,
  type Disposicion,
  disposicionDelLugar,
  MARGEN_DE_LA_FRANJA,
} from '../../../shared/base.js';
import { AYUDA_DEL_LUGAR } from '../../comun/dichos.js';
import { temaDelLienzo } from '../../comun/temas.js';
import { arteDeLaBase } from '../../render/base/arte.js';
import type { Elemento } from '../../render/base/escena.js';
import { queHayBajo } from '../../render/base/golpe.js';
import {
  type PintadoDeLaBase,
  pintarBase,
  pintarElSueloDeLaBase,
  pintarLasFiguras,
} from '../../render/base/pintar.js';
import { densidadDe } from '../../render/lienzo.js';
import { playerColor } from '../../render/palette.js';
import { enPantalla, type Tablero } from '../../render/proyeccion.js';
import type { PuntoALaVista, VistaDelLugar } from '../../sesion/partida/lugar.js';
import type { Session } from '../../sesion/partida.js';
import { PRISA_EN_LA_BASE, pulsaParaHablar } from '../base/escena.js';
import { Caminante } from '../caminante.js';

/** Cuánto por delante del borde de atrás está cada punto, en pasos: en la franja, no pegado al fondo. */
const DELANTE_DEL_FONDO = 0.7;
/** Lo que se meten los puntos de los extremos (`x` 0 y 1) desde el margen de la franja, en pasos. */
const DENTRO_DEL_MARGEN = 0.6;
/**
 * Cuánto más deprisa se anda en un lugar que en la base. Sus puntos están
 * repartidos por dos tramos de plaza, más lejos que dos puertas de la base, y a
 * paso de base cada «Hablar» del panel hacía esperar ~6 s (de la garita a Corvo, H6
 * del QA de la F1a): con esto, ~3 s. El clip de andar se acelera lo mismo sobre
 * el de la base (`ritmoDelClip`): las piernas van con el paso que se ve en la base, no
 * patinan más.
 */
const PRISA_EN_UN_LUGAR = 3;

/**
 * Lo que se aparta quien va a hablar con alguien en un lugar, en pasos, de lado y
 * casi a su altura. En la base quien habla está en su puerta y basta 0,6
 * (`dondeHablarCon`); aquí, con 0,6, el héroe quedaba encima de la figura.
 */
const AL_LADO_EN_UN_LUGAR = 1;

/**
 * Adónde va quien camina para hablar con el punto que está en `en`, y hacia dónde
 * mira al llegar: a su izquierda, mirando al este, salvo que el borde no le deje
 * sitio; entonces a su derecha, mirando al oeste.
 */
function dondeHablarEnElLugar(d: Disposicion, en: Plano): { en: Plano; mira: Mirada } {
  const y = en.y + 0.05;
  const izq = alaFranja(d, { x: en.x - AL_LADO_EN_UN_LUGAR, y });
  if (en.x - izq.x >= AL_LADO_EN_UN_LUGAR * 0.9) return { en: izq, mira: 'E' };
  return { en: alaFranja(d, { x: en.x + AL_LADO_EN_UN_LUGAR, y }), mira: 'O' };
}

/** El mojón de una cosa, en pasos de pantalla: ancho y alto. */
const MOJON = { ancho: 0.42, alto: 0.62 } as const;

/** Dónde está un punto en el escenario: su `x` de 0 a 1 entre los márgenes, un poco por delante del fondo. */
function dondeEstaElPunto(d: Disposicion, x: number): Plano {
  const margen = MARGEN_DE_LA_FRANJA + DENTRO_DEL_MARGEN;
  const px = margen + x * (d.ancho - 2 * margen);
  return alaFranja(d, { x: px, y: bordeDeAtras(d, px) + DELANTE_DEL_FONDO });
}

/** El punto con el que se habla al llegar y hacia dónde se le mira. */
interface HablarAlLlegar {
  readonly punto: string;
  readonly mira: Mirada;
}

/** Lo que hay bajo un píxel: un punto o el suelo. */
type Golpe =
  | { readonly tipo: 'punto'; readonly id: string }
  | { readonly tipo: 'suelo'; readonly en: Plano };

/** Un punto con su sitio en el escenario. */
interface PuntoEnSuSitio {
  readonly p: PuntoALaVista;
  readonly en: Plano;
}

/** El lugar abierto: su vista, su disposición y sus puntos en su sitio, de atrás adelante (por su pie). */
interface Abierto {
  readonly vista: VistaDelLugar;
  readonly d: Disposicion;
  readonly puntos: readonly PuntoEnSuSitio[];
}

export class EscenaLugar {
  /** Quien camina y la cámara que lo sigue (`partida/caminante.ts`), los mismos de la base. */
  private readonly caminante = new Caminante({
    prisa: PRISA_EN_UN_LUGAR,
    ritmoDelClip: PRISA_EN_UN_LUGAR / PRISA_EN_LA_BASE,
  });
  private de: { sesion: Session; apertura: number } | null = null;
  /**
   * Lo abierto, memorizado por la versión de la sesión (sube con todo lo que se
   * ve) y la apertura: cada fotograma lo pedía, y era la vista entera del núcleo.
   */
  private memo: { sesion: Session; version: number; apertura: number; abierto: Abierto } | null =
    null;
  /** El sitio de cada punto en esta apertura: no cambia mientras se está en el lugar. */
  private sitios = new Map<string, Plano>();
  private señalado: string | null = null;

  constructor(private readonly sesion: () => Session) {}

  /** El lugar abierto; recoloca a la izquierda en cada apertura. */
  private abierto(): Abierto | null {
    const s = this.sesion();
    const m = this.memo;
    if (
      m !== null &&
      m.sesion === s &&
      m.version === s.version &&
      m.apertura === s.lugar.apertura
    ) {
      return m.abierto;
    }
    const vista = s.lugar.vista();
    if (vista === null) {
      this.memo = null;
      return null;
    }
    const d = disposicionDelLugar(vista.fondo);
    if (this.de === null || this.de.sesion !== s || this.de.apertura !== vista.apertura) {
      this.de = { sesion: s, apertura: vista.apertura };
      this.sitios = new Map();
      this.caminante.empezarEn(d.entrada, 'E');
      this.señalado = null;
    }
    const puntos = vista.puntos
      .map((p) => ({ p, en: this.sitioDe(d, p) }))
      .sort((a, b) => a.en.y - b.en.y);
    const abierto = { vista, d, puntos };
    this.memo = { sesion: s, version: s.version, apertura: vista.apertura, abierto };
    return abierto;
  }

  private sitioDe(d: Disposicion, p: PuntoALaVista): Plano {
    const hecho = this.sitios.get(p.id);
    if (hecho !== undefined) return hecho;
    const en = dondeEstaElPunto(d, p.x);
    this.sitios.set(p.id, en);
    return en;
  }

  /**
   * Lo que `main.ts` escribe en `canvas.dataset.lugar` para `pnpm capturas` y los
   * tests del navegador: `andando`, `hablando:<punto>` o `quieto`.
   */
  get marca(): string {
    const a = this.abierto();
    if (a === null) return '';
    if (this.caminante.andando || !this.caminante.camaraLlegada(a.d)) return 'andando';
    const hablando = this.sesion().lugar.hablando;
    return hablando === null ? 'quieto' : `hablando:${hablando}`;
  }

  /**
   * Lleva la marcha hasta `ahora` y, al llegar a un punto, se habla con él; y la cámara
   * con ella: aquí van juntas al dibujar y en cada clic.
   */
  private actualizar(ahora: number, d: Disposicion): void {
    this.caminante.avanzar(ahora, d);
    this.caminante.seguirConLaCamara(d, ahora);
  }

  /**
   * Las figuras en el orden en que se pintan (por su pie): la gente ya viene en
   * orden (`Abierto.puntos`), y quien camina se mete en su sitio.
   */
  private elementos(a: Abierto, ahora: number): Elemento[] {
    const gente: Elemento[] = a.puntos.flatMap(({ p, en }): Elemento[] =>
      p.cuerpo === null
        ? []
        : [
            {
              tipo: 'figura',
              id: p.id,
              cuerpo: p.cuerpo,
              nombre: p.nombre,
              en,
              mira: 'O',
              clip: 'idle',
              tiempo: ahora,
              pnj: true,
              pie: en.y,
            },
          ],
    );
    const quien = this.caminante.estado(ahora);
    const caminante: Elemento = {
      tipo: 'figura',
      id: a.vista.caminante.id,
      cuerpo: a.vista.caminante.cuerpo,
      nombre: a.vista.caminante.nombre,
      en: quien.en,
      mira: quien.mira,
      clip: quien.clip,
      tiempo: quien.tiempo,
      pnj: false,
      pie: quien.en.y,
    };
    // Detrás de quien tenga el pie más abajo, como el `sort` estable de antes.
    const i = gente.findIndex((e) => e.pie > caminante.pie);
    gente.splice(i < 0 ? gente.length : i, 0, caminante);
    return gente;
  }

  dibujar(
    ctx: CanvasRenderingContext2D,
    ancho: number,
    alto: number,
    _densidad: number,
    ahora: number,
  ): void {
    this.caminante.encuadrar(ancho, alto, densidadDe(ctx));
    const a = this.abierto();
    if (a === null) return;
    this.actualizar(ahora, a.d);
    const t = this.caminante.camara(a.d);
    // Las cosas, debajo de las figuras: son del suelo.
    const elementos = this.elementos(a, ahora);
    // El clima de la región del lugar, como el de la base: lo de abajo (luz y
    // niebla) sobre el fondo y los mojones, y el aire (la lluvia, el rayo) con las
    // figuras, encima de todo.
    const sitio = this.sesion().climaDelLugar;
    const clima = sitio === null ? null : { sitio, ahora };
    const fondo: PintadoDeLaBase = {
      d: a.d,
      t,
      lienzo: this.caminante.lienzo,
      elementos: [],
      arte: arteDeLaBase(a.vista.fondo, []),
      color: playerColor(a.vista.owner),
      señalado: null,
      clima: null,
    };
    pintarBase(ctx, fondo);
    for (const { p, en } of a.puntos) {
      if (p.cuerpo === null) pintarMojon(ctx, t, en, p, this.señalado === p.id);
    }
    pintarElSueloDeLaBase(ctx, { ...fondo, clima });
    pintarLasFiguras(ctx, {
      d: a.d,
      t,
      lienzo: this.caminante.lienzo,
      elementos,
      arte: null,
      color: playerColor(a.vista.owner),
      señalado: this.señalado === null ? null : { tipo: 'pnj', id: this.señalado },
      clima,
    });
  }

  /**
   * Qué hay bajo un píxel: la gente, como en la base (`queHayBajo`, de delante a
   * atrás; quien camina no es un golpe), y si no, una cosa por su mojón, que va
   * pintado debajo de las figuras.
   */
  private golpe(a: Abierto, px: number, py: number, ahora = performance.now()): Golpe {
    const t = this.caminante.camara(a.d);
    const g = queHayBajo(a.d, this.elementos(a, ahora), null, t, px, py);
    if (g.tipo === 'pnj') return { tipo: 'punto', id: g.id };
    for (let i = a.puntos.length - 1; i >= 0; i--) {
      const { p, en } = a.puntos[i] as PuntoEnSuSitio;
      if (p.cuerpo === null && enElMojon(t, en, px, py)) return { tipo: 'punto', id: p.id };
    }
    if (g.tipo === 'sitio')
      throw new Error(`un lugar no tiene edificios, y el clic dio en ${g.sitio}`);
    return g;
  }

  /** El ratón encima: resalta y dice en la barra qué es. Verdadero si se puede pulsar algo. */
  mover(px: number, py: number): boolean {
    const s = this.sesion();
    const a = this.abierto();
    const g = a === null ? null : this.golpe(a, px, py);
    if (a === null || g === null || g.tipo === 'suelo') {
      this.señalado = null;
      if (a !== null && s.lugar.hablando === null) s.status = AYUDA_DEL_LUGAR;
      return false;
    }
    this.señalado = g.id;
    const p = a.vista.puntos.find((x) => x.id === g.id);
    if (p !== undefined) {
      s.status =
        p.papel === null ? `${p.nombre}: pulsa para mirar.` : pulsaParaHablar(p.nombre, p.papel);
    }
    return true;
  }

  salir(): void {
    this.señalado = null;
  }

  /** Un clic: echa a andar hacia lo pulsado y, al llegar a un punto, habla con él. */
  pulsar(px: number, py: number, ahora = performance.now()): void {
    const a = this.abierto();
    if (a === null) return;
    this.actualizar(ahora, a.d);
    const g = this.golpe(a, px, py, ahora);
    const s = this.sesion();
    if (g.tipo === 'suelo') {
      s.lugar.dejarDeHablar();
      this.andar(a.d, a.vista, alaFranja(a.d, g.en), null, ahora);
      return;
    }
    const p = a.puntos.find((x) => x.p.id === g.id);
    if (p !== undefined) this.irAlPunto(a, p, ahora);
  }

  /** Desde la lista del panel: quien camina va al punto y, al llegar, habla con él. */
  irA(punto: string, ahora: number): void {
    const a = this.abierto();
    const p = a?.puntos.find((x) => x.p.id === punto);
    if (a === null || p === undefined) return;
    this.irAlPunto(a, p, ahora);
  }

  /** Quien camina va al lado del punto (`dondeHablarEnElLugar`) y, al llegar, habla con él. */
  private irAlPunto(a: Abierto, { p, en }: PuntoEnSuSitio, ahora: number): void {
    this.sesion().lugar.dejarDeHablar();
    const sitio = dondeHablarEnElLugar(a.d, en);
    this.andar(a.d, a.vista, sitio.en, { punto: p.id, mira: sitio.mira }, ahora);
  }

  private andar(
    d: Disposicion,
    vista: VistaDelLugar,
    hasta: Plano,
    alLlegar: HablarAlLlegar | null,
    ahora: number,
  ): void {
    const dura = this.caminante.andar(
      d,
      vista.caminante.cuerpo,
      hasta,
      ahora,
      alLlegar === null ? null : alLlegar.mira,
      alLlegar === null ? null : () => this.sesion().lugar.hablar(alLlegar.punto),
    );
    // Sin camino que andar se llega ya, y se habla; la cámara, con él.
    if (dura === 0) this.actualizar(ahora, d);
  }
}

/** La caja del mojón de una cosa, en píxeles del lienzo. */
function cajaDelMojon(
  t: Tablero,
  en: Plano,
): { x: number; y: number; ancho: number; alto: number } {
  const p = enPantalla(t, en);
  const ancho = MOJON.ancho * t.paso;
  const alto = MOJON.alto * t.paso;
  return { x: p.x - ancho / 2, y: p.y - alto, ancho, alto };
}

function enElMojon(t: Tablero, en: Plano, px: number, py: number): boolean {
  const c = cajaDelMojon(t, en);
  return px >= c.x - 4 && px <= c.x + c.ancho + 4 && py >= c.y - 4 && py <= c.y + c.alto + 6;
}

/**
 * Una cosa sin arte (P5): un mojón de piedra con su inicial y, debajo, su nombre.
 * Con el ratón encima, el borde dorado de lo señalado en la base.
 */
function pintarMojon(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  en: Plano,
  p: PuntoALaVista,
  señalado: boolean,
): void {
  const c = cajaDelMojon(t, en);
  const tema = temaDelLienzo();
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x + c.ancho / 2, c.y + c.alto, c.ancho * 0.7, c.ancho * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6f6656';
  ctx.strokeStyle = señalado ? '#f5d973' : 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = señalado ? 3 : 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + c.alto);
  ctx.lineTo(c.x + c.ancho * 0.12, c.y + c.ancho * 0.3);
  ctx.quadraticCurveTo(
    c.x + c.ancho / 2,
    c.y - c.ancho * 0.15,
    c.x + c.ancho * 0.88,
    c.y + c.ancho * 0.3,
  );
  ctx.lineTo(c.x + c.ancho, c.y + c.alto);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tema.rotulo;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(11, Math.round(c.ancho * 0.5))}px ${tema.letraUi}`;
  ctx.fillText(inicialDelNombre(p.nombre), c.x + c.ancho / 2, c.y + c.alto * 0.55);
  ctx.font = `${Math.max(11, Math.round(t.paso * 0.14))}px ${tema.letraUi}`;
  ctx.textBaseline = 'top';
  // Con su contorno oscuro: sobre el empedrado claro, el rótulo solo no se leía.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.strokeText(p.nombre, c.x + c.ancho / 2, c.y + c.alto + 4);
  ctx.fillText(p.nombre, c.x + c.ancho / 2, c.y + c.alto + 4);
  ctx.restore();
}
