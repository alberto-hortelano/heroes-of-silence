/**
 * La pieza que pinta el clima: niebla, lluvia, tormenta y noche. **Un solo
 * pintor** para el mapa, la batalla y toda escena lateral (la base, la morada y
 * las del «mapa vivo»): lo que cambia entre ellas es solo qué clima hay bajo
 * cada píxel, el **campo** (`CampoDelClima`). En una escena es uno solo, de su
 * sitio (`campoDeEscena`); en el mapa, el de cada región, con su frente
 * (`campoDelMapa`, de las máscaras del mundo). Cada campo de la receta se pinta
 * igual en los dos.
 *
 * **Cómo se enchufa una escena lateral**: con el `ClimaDelSitio` de su sitio,
 * `campoDeEscena` (con sus fuegos, si de noche se encienden), y dos llamadas:
 * `pintarSueloDelClima` entre lo que es del sitio (los edificios, el suelo) y
 * las figuras, y `pintarAireDelClima` (la lluvia y el rayo) al final, encima de
 * todo menos lo que tiene que leerse. Así lo hacen la base (`pintarBase`) y la
 * batalla (`drawBatalla`, que además hornea en su fondo lo que no se mueve:
 * `hornearElVelo` y `sinElVelo`).
 *
 * No toca el DOM ni recibe clics: pinta en el lienzo que le dan. No lee la
 * sesión (`invariantes.test.ts`): le dan el clima del sitio. No mira
 * `prefers-reduced-motion`: es para leer una página, no para un juego (el
 * usuario, 22-10-2026); la lluvia y el rayo van siempre.
 *
 * **Por qué así** (lo caro es componer una capa del tamaño del lienzo, y el mapa
 * tiene un presupuesto de píxeles: `PIXELES_DEL_MAPA`):
 *
 * - lo que aclara (la bruma y los bancos de niebla) va en una capa a un cuarto
 *   del lienzo (`ESCALA_DEL_AIRE`), compuesta una vez **sin suavizado**: ampliar
 *   con el bilineal costaba de 7 a 10 ms por fotograma en 1,5 M píxeles sin GPU,
 *   y con el vecino más cercano, 1 ms (medido el 22-10-2026); es blando y los
 *   bloques de 4 px no se notan;
 * - lo que oscurece (la luz de la lluvia, la tormenta y la noche) se multiplica
 *   (`multiply`): en una escena, un `fillRect` sin capa; en el mapa, por
 *   regiones y con el hueco de cada fuego, en su capa a un cuarto;
 * - lo fino (las gotas y el rayo) va directo y a resolución plena: las gotas,
 *   líneas de un píxel de dispositivo (las de 1,2 px suavizadas costaban 6,5 ms
 *   para 1 200 gotas; las de 1 px, 1 ms), y en el mapa cada una pregunta si
 *   llueve donde cae.
 *
 * Nada de `Math.random` (`invariantes.test.ts`): las gotas salen de un hash de
 * su número y del reloj, y el rayo, de un hash de su sitio y de su ciclo.
 */
import type { MapaDeRed } from '@core/map/regiones.js';
import { hashDeTexto } from '@core/rng.js';
import type { ClimaDeLaPartida, ClimaDelSitio } from '@core/state/clima.js';
import { type CamaraMapa, mundoAPixel } from '../camara-mapa.js';
import { CacheDeLienzos } from '../copias.js';
import { mezclar } from '../escenario/fronteras.js';
import { type Lienzo, lienzoCon } from '../escenario/pintar.js';
import { animarHasta } from '../figura.js';
import { casillaDelRayo, mascarasDelMapa, regionEnElFrente } from './mascaras.js';
import {
  alzaDe,
  COLOR_DE_LOS_BANCOS,
  css,
  EFECTOS,
  type Lluvia,
  luzDe,
  multiplicar,
  NOCHE,
  type Rgb,
  type Rgba,
} from './recetas.js';
import { bancosDeNiebla } from './texturas.js';

/** A qué fracción del lienzo se pinta lo blando del clima antes de ampliarlo. */
const ESCALA_DEL_AIRE = 1 / 4;
/** Cuánto dura el destello de un rayo, en ms: breve, y no ciega. */
const DURACION_DEL_RAYO = 160;
/** El grueso de una gota, en px CSS: en píxeles de dispositivo, el entero más cercano (como poco, uno). */
const GROSOR_DE_LA_GOTA = 1;
/** Cuántas gotas como mucho por fotograma: en una pantalla enorme, la lluvia no crece sin tope. */
const TOPE_DE_GOTAS = 2400;
/** Cuánto ilumina el destello de un rayo en el mapa, en casillas: unas seis. */
const RADIO_DEL_RAYO_EN_EL_MAPA = 6;

/** Un fuego que se enciende de noche, en píxeles CSS del lienzo y con su radio. */
export interface LuzDeNoche {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Una máscara del mundo (`mascaras.ts`) y dónde cae en el lienzo, en px CSS. */
export interface Colocada {
  readonly lienzo: Lienzo;
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/** Un sitio donde caen rayos: uno cada `cada` ms, en el punto que diga `donde` para cada ciclo. */
export interface FocoDeRayo {
  readonly id: string;
  readonly cada: readonly [number, number];
  readonly donde: (ciclo: number) => {
    readonly x: number;
    readonly y: number;
    readonly arriba: number;
    readonly radio: number;
  } | null;
}

/**
 * La luz del mapa: la máscara del mundo colocada y los huecos que le abren los
 * fuegos de noche (todos los de las regiones de noche, no solo los que se ven),
 * en px CSS desde el origen del mundo: no se mueven al arrastrar.
 */
export interface LuzDelMundo {
  readonly mascara: Colocada;
  /** Lo que suma la noche (`lighter`) donde es de noche, o `null`. */
  readonly alza: Colocada | null;
  readonly huecos: readonly LuzDeNoche[];
}

/**
 * Qué clima hay bajo cada píxel, campo a campo de la receta: un valor para todo
 * el lienzo (una escena) o una máscara del mundo colocada (el mapa).
 */
export interface CampoDelClima {
  /** Lo que oscurece, multiplicando (`multiply`). */
  readonly luz: Rgb | LuzDelMundo | null;
  /** Lo que suma la noche en una escena tras la luz (`lighter`), o `null`; en el mapa va en la luz del mundo. */
  readonly alza: Rgb | null;
  /** Lo que aclara, encima. */
  readonly bruma: Rgba | Colocada | null;
  /**
   * Los bancos de niebla: su opacidad, dónde cae el origen del mundo y cuánto
   * mide una baldosa (en el mapa van con el mundo al arrastrar; en una escena,
   * con el lienzo), y el tinte de la luz que ya se pintó debajo (`sinElVelo`).
   */
  readonly bancos: {
    readonly alfa: number | Colocada;
    readonly origen: { readonly x: number; readonly y: number };
    readonly lado: number;
    readonly tinte: Rgb | null;
  } | null;
  /**
   * Cada lluvia, dónde cae (en px CSS; sin `dentro`, en todo el lienzo) y dónde
   * cae el origen del mundo en el lienzo (px CSS): las gotas van con el mundo, y
   * al mover la cámara se corren con el suelo en vez de seguir a la pantalla.
   */
  readonly lluvias: readonly {
    readonly lluvia: Lluvia;
    readonly dentro: ((x: number, y: number) => boolean) | null;
    readonly origen: { readonly x: number; readonly y: number };
  }[];
  readonly rayos: readonly FocoDeRayo[];
  /** Los fuegos que se encienden, ya solo los de donde es de noche. */
  readonly luces: readonly LuzDeNoche[];
}

/** El lienzo donde se pinta: su tamaño en px CSS y el reloj de la página (ms). */
export interface MarcoDelClima {
  readonly ancho: number;
  readonly alto: number;
  readonly ahora: number;
}

const esMascara = <T>(v: T | Colocada): v is Colocada =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'lienzo' in v;

const esLuzDelMundo = (v: Rgb | LuzDelMundo): v is LuzDelMundo => 'mascara' in v;

/** Un número de [0, 1) de un entero: las gotas y los rayos, sin `Math.random`. */
const azar = (n: number): number => mezclar(n, 0x2545f491) / 4294967296;

// ------------------------------------------------------------- las capas

interface Capa {
  readonly lienzo: Lienzo;
  readonly c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

const capas: (Capa | null)[] = [null, null, null];

/** Una de las capas que se reutilizan, a un cuarto del lienzo y vacía. */
function capa(i: 0 | 1 | 2, ancho: number, alto: number): Capa {
  const w = Math.max(1, Math.ceil(ancho * ESCALA_DEL_AIRE));
  const h = Math.max(1, Math.ceil(alto * ESCALA_DEL_AIRE));
  let hecha = capas[i] ?? null;
  if (hecha === null) {
    hecha = lienzoCon(w, h);
    capas[i] = hecha;
  }
  if (hecha.lienzo.width !== w || hecha.lienzo.height !== h) {
    hecha.lienzo.width = w;
    hecha.lienzo.height = h;
  }
  hecha.c.setTransform(1, 0, 0, 1, 0, 0);
  hecha.c.globalCompositeOperation = 'source-over';
  hecha.c.globalAlpha = 1;
  hecha.c.clearRect(0, 0, w, h);
  return hecha;
}

/**
 * La capa, ya hecha, sobre el lienzo con `op`: sin suavizado (ver la cabecera).
 * Con `solo`, solo esa caja (px CSS: el mundo en el mapa), que es lo que cuesta:
 * fuera del mapa no hay clima que componer, y al tope de alejar es un tercio del
 * lienzo.
 */
function componer(
  ctx: CanvasRenderingContext2D,
  capa: Lienzo,
  m: MarcoDelClima,
  op: GlobalCompositeOperation,
  solo?: Colocada,
): void {
  const x0 = Math.max(0, Math.floor(solo?.x ?? 0));
  const y0 = Math.max(0, Math.floor(solo?.y ?? 0));
  const x1 = Math.min(m.ancho, Math.ceil(solo === undefined ? m.ancho : solo.x + solo.ancho));
  const y1 = Math.min(m.alto, Math.ceil(solo === undefined ? m.alto : solo.y + solo.alto));
  if (x1 <= x0 || y1 <= y0) return;
  const k = capa.width / Math.max(1, m.ancho);
  const q = capa.height / Math.max(1, m.alto);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = op;
  ctx.drawImage(capa, x0 * k, y0 * q, (x1 - x0) * k, (y1 - y0) * q, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

/** Un color en toda la capa o una máscara del mundo en su sitio, a la escala de la capa. */
function enLaCapa(c: Capa['c'], v: Rgb | Rgba | Colocada, w: number, h: number): void {
  if (esMascara(v)) {
    const k = ESCALA_DEL_AIRE;
    // Con suavizado: la capa es pequeña, y así el frente no sale en escalones de
    // un píxel de máscara al acercar.
    c.imageSmoothingEnabled = true;
    c.drawImage(v.lienzo, v.x * k, v.y * k, v.ancho * k, v.alto * k);
  } else {
    c.fillStyle = css(v);
    c.fillRect(0, 0, w, h);
  }
}

// -------------------------------------------------------------- los sprites

/** Las baldosas de niebla y los fuegos, a su tamaño: pocos megas, y se rehacen al cambiar de zoom. */
const sprites = new CacheDeLienzos<string, Lienzo>(24 * 1024 * 1024);

function sprite(clave: string, lado: number, pintar: (c: Capa['c']) => void): Lienzo {
  const hecho = sprites.get(clave);
  if (hecho !== undefined) return hecho;
  const { lienzo, c } = lienzoCon(lado, lado);
  pintar(c);
  sprites.set(clave, lienzo);
  return lienzo;
}

/**
 * Los bancos de niebla, de su color, a `lado` px por baldosa: el patrón se pinta
 * luego sin escala, que es lo barato (un patrón que escala muestrea con
 * suavizado cada píxel de la capa).
 */
function bancosDe(lado: number): Lienzo {
  const px = Math.min(1024, Math.max(16, Math.round(lado)));
  return sprite(`bancos|${px}`, px, (c) => {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(bancosDeNiebla(), 0, 0, px, px);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = css(COLOR_DE_LOS_BANCOS);
    c.fillRect(0, 0, px, px);
  });
}

/**
 * Un degradado radial de `radio` px (de dispositivo, para el resplandor), pintado
 * una vez: el hueco de un fuego en la luz (blanco, que en `multiply` no oscurece)
 * o su resplandor cálido, más fuerte en el farol de una escena, que no lleva hueco.
 */
function fuegoDe(cual: 'hueco' | 'luz' | 'farol', r: number): Lienzo {
  const radio = Math.max(2, Math.round(r));
  return sprite(`${cual}|${radio}`, 2 * radio, (c) => {
    const g = c.createRadialGradient(radio, radio, 0, radio, radio, radio);
    if (cual === 'hueco') {
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      // El farol, sin hueco debajo, aclara él solo lo que la noche oscureció.
      const [rr, gg, b, a] = NOCHE.fuego;
      const fuerza = cual === 'farol' ? 1.5 : 1;
      g.addColorStop(0, `rgba(${rr},${gg},${b},${a * fuerza})`);
      g.addColorStop(0.35, `rgba(${rr},${gg},${b},${a * 0.35 * fuerza})`);
      g.addColorStop(1, `rgba(${rr},${gg},${b},0)`);
    }
    c.fillStyle = g;
    c.fillRect(0, 0, 2 * radio, 2 * radio);
  });
}

const patrones = new WeakMap<Lienzo, CanvasPattern>();

/**
 * El patrón de una baldosa, hecho una vez: `createPattern` copia el lienzo
 * entero cada vez que se llama, y por fotograma eran más de un millón de píxeles.
 */
function patronDe(c: Capa['c'], tex: Lienzo): CanvasPattern {
  const hecho = patrones.get(tex);
  if (hecho !== undefined) return hecho;
  const patron = c.createPattern(tex, 'repeat');
  if (patron === null) throw new Error('este navegador no hace patrones con la niebla del clima');
  patrones.set(tex, patron);
  return patron;
}

// ------------------------------------------------------------- la niebla

/**
 * Dos planos de bancos de niebla que van a la deriva, despacio y en sentidos
 * distintos, en la capa `c` (ya a su escala), con la opacidad `alfa`.
 */
function pintarBancos(
  c: Capa['c'],
  w: number,
  h: number,
  b: NonNullable<CampoDelClima['bancos']>,
  alfa: number,
  ahora: number,
): void {
  const k = ESCALA_DEL_AIRE;
  const planos = [
    { escala: 1, dx: 0.0045, dy: 0.0012, alfa: 0.75 },
    { escala: 1.7, dx: -0.0028, dy: 0.0021, alfa: 0.55 },
  ];
  for (const p of planos) {
    const tex = bancosDe(b.lado * k * p.escala);
    const patron = patronDe(c, tex);
    // La deriva, en baldosas por ms: la misma en el mapa y en una escena. En
    // píxeles enteros: con medio píxel, el patrón se vuelve a muestrear.
    const ox = Math.round(b.origen.x * k + ahora * p.dx * tex.width * 0.06);
    const oy = Math.round(b.origen.y * k + ahora * p.dy * tex.width * 0.06);
    patron.setTransform(new DOMMatrix().translateSelf(ox, oy));
    c.globalAlpha = alfa * p.alfa;
    c.fillStyle = patron;
    c.fillRect(0, 0, w, h);
  }
  c.globalAlpha = 1;
  if (b.tinte !== null) {
    // La luz ya está pintada debajo (la batalla la hornea en su fondo): los
    // bancos, del color que tendrían con ella encima.
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = css(multiplicar(COLOR_DE_LOS_BANCOS, b.tinte));
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }
}

/** Lo que aclara —los bancos y la bruma—, en una capa compuesta encima. */
function pintarLoQueAclara(
  ctx: CanvasRenderingContext2D,
  campo: CampoDelClima,
  m: MarcoDelClima,
  ahora: number,
): void {
  const { bancos, bruma } = campo;
  if (bancos === null && bruma !== null && !esMascara(bruma)) {
    // Una bruma lisa y nada más: un `fillRect`, sin capa.
    ctx.save();
    ctx.fillStyle = css(bruma);
    ctx.fillRect(0, 0, m.ancho, m.alto);
    ctx.restore();
    return;
  }
  if (bancos === null && bruma === null) return;
  const { lienzo, c } = capa(0, m.ancho, m.alto);
  if (bancos !== null) {
    if (esMascara(bancos.alfa)) {
      // Por regiones: los bancos en otra capa, recortados por su máscara.
      const t = capa(1, m.ancho, m.alto);
      pintarBancos(t.c, t.lienzo.width, t.lienzo.height, bancos, 1, ahora);
      t.c.globalCompositeOperation = 'destination-in';
      enLaCapa(t.c, bancos.alfa, t.lienzo.width, t.lienzo.height);
      c.drawImage(t.lienzo, 0, 0);
    } else {
      pintarBancos(c, lienzo.width, lienzo.height, bancos, bancos.alfa, ahora);
    }
  }
  if (bruma !== null) enLaCapa(c, bruma, lienzo.width, lienzo.height);
  // En el mapa, solo sobre el mundo: fuera no hay ni bruma ni bancos.
  const mundo = esMascara(bruma)
    ? bruma
    : bancos !== null && esMascara(bancos.alfa)
      ? bancos.alfa
      : undefined;
  componer(ctx, lienzo, m, 'source-over', mundo);
}

// --------------------------------------------------------------- la luz

/**
 * Lo que oscurece: la luz multiplicada y, de noche, los fuegos con su resplandor
 * cálido (`lighter`).
 *
 * En una escena, la luz es lisa: un `fillRect` y, encima, cada fuego con el
 * resplandor fuerte (`farol`). En el mapa va por regiones y los fuegos además le
 * abren un hueco, que es lo que hace que la ciudad se vea entera
 * (`pintarLaLuzDelMundo`). En la base, la capa con sus huecos costaba 8,8 ms por
 * fotograma en 2560×1440 (componerla con `multiply` desde un cuarto), y el
 * `fillRect`, lo que la tormenta: 2,6 ms (medido el 22-10-2026, `tools/qa/clima.ts`).
 */
function pintarLaLuz(ctx: CanvasRenderingContext2D, campo: CampoDelClima, m: MarcoDelClima): void {
  const { luz, luces } = campo;
  if (luz === null) return;
  if (esLuzDelMundo(luz)) {
    pintarLaLuzDelMundo(ctx, luz, m);
  } else {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = css(luz);
    ctx.fillRect(0, 0, m.ancho, m.alto);
    if (campo.alza !== null) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = css(campo.alza);
      ctx.fillRect(0, 0, m.ancho, m.alto);
    }
    ctx.restore();
  }
  pintarBrillos(ctx, luces, esLuzDelMundo(luz) ? 'luz' : 'farol');
}

/**
 * El resplandor de cada fuego, en `lighter` y **en píxeles de dispositivo**: el
 * degradado ya a su tamaño, copiado sin escalar a un píxel entero. Copiado por la
 * escala del lienzo (la densidad del mapa no es 1) eran 1,2 ms por fotograma con
 * los siete fuegos de la base del jugador (medido el 22-10-2026, vuelta de QA 1).
 */
function pintarBrillos(
  ctx: CanvasRenderingContext2D,
  luces: readonly LuzDeNoche[],
  cual: 'luz' | 'farol',
): void {
  if (luces.length === 0) return;
  const t = ctx.getTransform();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of luces) {
    const brillo = fuegoDe(cual, l.r * t.a);
    ctx.drawImage(
      brillo,
      Math.round(t.a * l.x + t.e - brillo.width / 2),
      Math.round(t.d * l.y + t.f - brillo.height / 2),
    );
  }
  ctx.restore();
}

/** Cuánto más que lo que se ve cubre la luz guardada del mapa, por cada lado: un cuarto de la pantalla. */
const MARGEN_DE_LA_LUZ = 0.25;
/** Lo más grande que se guarda la luz del mapa, en píxeles de dispositivo (64 MB). */
const TOPE_DE_LA_LUZ = 16_000_000;

/**
 * La luz del mapa ya hecha, a resolución de dispositivo y pegada al mundo: la
 * máscara ampliada y los huecos de los fuegos, de lo que se ve más un margen. Al
 * arrastrar no cambia —el mundo solo se desplaza—, así que cada fotograma es una
 * copia **sin escalar** a un píxel entero, que es el camino rápido del
 * rasterizador. Se rehace al cambiar el clima, el zoom o la densidad, o al salir
 * lo que se ve de lo que cubre.
 */
let luzGuardada: {
  readonly lienzo: Lienzo;
  readonly c: Capa['c'];
  /** Lo que suma la noche, igual de grande, o `null` sin noche a la vista. */
  readonly alza: Capa | null;
  readonly mascara: Lienzo;
  readonly huecos: readonly LuzDeNoche[];
  /** El mundo a esta escala, en px de dispositivo: cambia con el zoom y la densidad. */
  readonly mundo: { readonly w: number; readonly h: number };
  /** Lo que cubre, en px de dispositivo desde el origen del mundo. */
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
} | null = null;
/** El mundo a la escala del fotograma de antes: con el zoom en marcha, no se guarda. */
let mundoDeAntes: { readonly w: number; readonly h: number } | null = null;

/**
 * La luz del mapa con sus fuegos, por regiones. Lo caro era componer la capa a un
 * cuarto ampliándola a todo el lienzo: 5,3 ms por fotograma con la noche en
 * 2560×1440 al tope de alejar (2,85 M píxeles), de 8,6 que costaba todo el clima
 * (medido en la página el 22-10-2026, vuelta de QA 1). Guardada a resolución de
 * dispositivo y copiada sin escalar, y solo lo que cae sobre el mundo, es una
 * fracción. Mientras cambia el zoom no se guarda (se rehará en cuanto pare): se
 * compone como antes, desde la capa a un cuarto.
 */
function pintarLaLuzDelMundo(
  ctx: CanvasRenderingContext2D,
  luz: LuzDelMundo,
  m: MarcoDelClima,
): void {
  const t = ctx.getTransform();
  const mk = luz.mascara;
  const mundo = { w: Math.round(mk.ancho * t.a), h: Math.round(mk.alto * t.d) };
  // El origen del mundo en el lienzo, en px de dispositivo enteros: la máscara es
  // blanda y medio píxel no se ve.
  const ox = Math.round(t.a * mk.x + t.e);
  const oy = Math.round(t.d * mk.y + t.f);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  // Lo que se ve del mundo, desde su origen.
  const vx0 = Math.max(0, -ox);
  const vy0 = Math.max(0, -oy);
  const vx1 = Math.min(mundo.w, W - ox);
  const vy1 = Math.min(mundo.h, H - oy);
  if (vx1 <= vx0 || vy1 <= vy0) return;
  const quieto = mundoDeAntes !== null && mundoDeAntes.w === mundo.w && mundoDeAntes.h === mundo.h;
  mundoDeAntes = mundo;
  const mx = Math.ceil(W * MARGEN_DE_LA_LUZ);
  const my = Math.ceil(H * MARGEN_DE_LA_LUZ);
  const x0 = Math.max(0, vx0 - mx);
  const y0 = Math.max(0, vy0 - my);
  const w = Math.min(mundo.w, vx1 + mx) - x0;
  const h = Math.min(mundo.h, vy1 + my) - y0;
  if (!quieto || w * h > TOPE_DE_LA_LUZ) {
    luzSinGuardar(ctx, luz, m);
    return;
  }
  let g = luzGuardada;
  const vale =
    g !== null &&
    g.mascara === mk.lienzo &&
    (g.alza !== null) === (luz.alza !== null) &&
    g.huecos === luz.huecos &&
    g.mundo.w === mundo.w &&
    g.mundo.h === mundo.h &&
    vx0 >= g.x0 &&
    vy0 >= g.y0 &&
    vx1 <= g.x0 + g.w &&
    vy1 <= g.y0 + g.h;
  if (!vale) {
    // Los lienzos se reutilizan: rehacerla no pide memoria nueva.
    const lienzo = g === null ? lienzoCon(w, h) : { lienzo: g.lienzo, c: g.c };
    const alza = luz.alza === null ? null : (g?.alza ?? lienzoCon(w, h));
    g = { ...lienzo, alza, mascara: mk.lienzo, huecos: luz.huecos, mundo, x0, y0, w, h };
    luzGuardada = g;
    hacerLaLuz(g, luz, t.a);
  }
  if (g === null) return;
  // Entera, sin escalar y sin recortar la fuente: el lienzo recorta lo que no se
  // ve gratis, y copiar un trozo (`drawImage` con nueve argumentos) costaba el
  // doble por píxel (2,2 ms frente a 1,0 por 1,1 M píxeles, 22-10-2026).
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(g.lienzo, ox + g.x0, oy + g.y0);
  if (g.alza !== null) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(g.alza.lienzo, ox + g.x0, oy + g.y0);
  }
  ctx.restore();
}

/**
 * Pinta la luz guardada (y lo que suma la noche, si lo hay): cada máscara a un
 * cuarto con suavizado (barato) y de ahí ampliada sin suavizado, como se
 * componía cada fotograma, y los huecos de los fuegos a su tamaño: blancos en la
 * luz (no oscurece) y fuera de lo que suma (no azulea).
 */
function hacerLaLuz(g: NonNullable<typeof luzGuardada>, luz: LuzDelMundo, d: number): void {
  ampliarEn(g, g.mascara, g.lienzo, g.c, 'source-over', d);
  if (g.alza !== null && luz.alza !== null) {
    ampliarEn(g, luz.alza.lienzo, g.alza.lienzo, g.alza.c, 'destination-out', d);
  }
}

/** Una máscara del mundo ampliada en `lienzo` (lo que cubre `g`), con los huecos de los fuegos en `op`. */
function ampliarEn(
  g: NonNullable<typeof luzGuardada>,
  mascara: Lienzo,
  lienzo: Lienzo,
  c: Capa['c'],
  op: GlobalCompositeOperation,
  d: number,
): void {
  if (lienzo.width !== g.w || lienzo.height !== g.h) {
    lienzo.width = g.w;
    lienzo.height = g.h;
  }
  const k = ESCALA_DEL_AIRE;
  const cuarto = capa(2, g.w, g.h);
  cuarto.c.imageSmoothingEnabled = true;
  cuarto.c.drawImage(mascara, -g.x0 * k, -g.y0 * k, g.mundo.w * k, g.mundo.h * k);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'copy';
  c.imageSmoothingEnabled = false;
  const { width: cw, height: ch } = cuarto.lienzo;
  c.drawImage(cuarto.lienzo, 0, 0, cw, ch, 0, 0, cw / k, ch / k);
  c.globalCompositeOperation = op;
  for (const l of g.huecos) {
    const hueco = fuegoDe('hueco', l.r * d);
    c.drawImage(
      hueco,
      Math.round(l.x * d - g.x0 - hueco.width / 2),
      Math.round(l.y * d - g.y0 - hueco.height / 2),
    );
  }
  c.globalCompositeOperation = 'source-over';
}

/** La luz del mapa sin guardarla (con el zoom en marcha): la capa a un cuarto, compuesta sobre el mundo. */
function luzSinGuardar(ctx: CanvasRenderingContext2D, luz: LuzDelMundo, m: MarcoDelClima): void {
  const k = ESCALA_DEL_AIRE;
  const { lienzo, c } = capa(2, m.ancho, m.alto);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, lienzo.width, lienzo.height);
  enLaCapa(c, luz.mascara, lienzo.width, lienzo.height);
  const mk = luz.mascara;
  for (const l of luz.huecos) {
    const hueco = fuegoDe('hueco', l.r * k);
    c.drawImage(
      hueco,
      Math.round((mk.x + l.x) * k - hueco.width / 2),
      Math.round((mk.y + l.y) * k - hueco.height / 2),
    );
  }
  componer(ctx, lienzo, m, 'multiply', mk);
  if (luz.alza === null) return;
  const z = capa(1, m.ancho, m.alto);
  enLaCapa(z.c, luz.alza, z.lienzo.width, z.lienzo.height);
  z.c.globalCompositeOperation = 'destination-out';
  for (const l of luz.huecos) {
    const hueco = fuegoDe('hueco', l.r * k);
    z.c.drawImage(
      hueco,
      Math.round((mk.x + l.x) * k - hueco.width / 2),
      Math.round((mk.y + l.y) * k - hueco.height / 2),
    );
  }
  componer(ctx, z.lienzo, m, 'lighter', mk);
}

// ------------------------------------------------------------ la lluvia

/**
 * Las gotas de una lluvia, en dos planos (lejos: cortas, tenues y lentas; cerca:
 * más largas), directo en `ctx` y **en píxeles de dispositivo**, alineadas a
 * ellos, que es el camino rápido del rasterizador: del grueso de un píxel CSS
 * (`GROSOR_DE_LA_GOTA`), en píxeles enteros, y del largo que manda el plano por
 * la densidad. De un píxel de dispositivo, con dpr 3 eran un tercio de píxel y no
 * se veían (H7 del QA del clima, 22-10-2026). `dentro` dice si una gota cae donde
 * llueve (en px CSS).
 */
function pintarLluvia(
  ctx: CanvasRenderingContext2D,
  { lluvia, dentro, origen }: CampoDelClima['lluvias'][number],
  m: MarcoDelClima,
  ahora: number,
  semilla: number,
): void {
  const { a, d, e, f } = ctx.getTransform();
  const W = m.ancho * a;
  const H = m.alto * d;
  const n = Math.min(TOPE_DE_GOTAS, Math.round((lluvia.densidad * m.ancho * m.alto) / 10_000));
  const planos = [
    { parte: 0.6, largo: 10, velocidad: 0.62, alfa: 0.55 },
    { parte: 0.4, largo: 18, velocidad: 0.95, alfa: 1 },
  ];
  const grueso = Math.max(1, Math.round(GROSOR_DE_LA_GOTA * d));
  // Una línea de grueso impar va por el medio de un píxel; de grueso par, por su borde.
  const medio = grueso % 2 === 1 ? 0.5 : 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineCap = 'butt';
  ctx.lineWidth = grueso;
  let i0 = 0;
  for (const p of planos) {
    const cuantas = Math.round(n * p.parte);
    const largo = p.largo * d;
    const dx = lluvia.viento * largo;
    const vuelta = H + largo;
    ctx.beginPath();
    for (let q = 0; q < cuantas; q++) {
      const i = semilla + i0 + q;
      const y =
        (((azar(i * 2 + 1) * vuelta + ahora * p.velocidad * d + origen.y * d) % vuelta) + vuelta) %
        vuelta;
      const x = (((azar(i * 2) * W + y * lluvia.viento + origen.x * a) % W) + W) % W;
      const y0 = Math.round(y - largo);
      if (dentro !== null && !dentro(x / a, y / d)) continue;
      const x0 = Math.round(x + e) + medio;
      ctx.moveTo(x0, y0 + f);
      ctx.lineTo(x0 + dx, y0 + f + largo);
    }
    ctx.strokeStyle = css(lluvia.color, lluvia.color[3] * p.alfa);
    ctx.stroke();
    i0 += cuantas;
  }
  ctx.restore();
}

// --------------------------------------------------------------- el rayo

/**
 * Si cae un rayo ahora en el foco `id`, y con qué fuerza (0 a 1) y qué ciclo:
 * uno cada `cada` ms (entre sus dos cifras, del hash del foco), con un destello
 * de `DURACION_DEL_RAYO` de dos golpes.
 */
function rayoAhora(
  id: string,
  ahora: number,
  cada: readonly [number, number],
): { fuerza: number; ciclo: number } | null {
  const base = hashDeTexto(id);
  const periodo = cada[0] + azar(base) * (cada[1] - cada[0]);
  const desfase = azar(base + 1) * periodo;
  const ciclo = Math.floor((ahora + desfase) / periodo);
  const dentroDelCiclo = ahora + desfase - ciclo * periodo;
  const cae = azar(base + ciclo * 7 + 3) * (periodo - DURACION_DEL_RAYO);
  const t = dentroDelCiclo - cae;
  if (t < 0 || t > DURACION_DEL_RAYO) return null;
  // Dos golpes: el fuerte, un respiro y el que se apaga.
  const fuerza = t < 55 ? 1 : t < 85 ? 0.25 : 0.75 * (1 - (t - 85) / (DURACION_DEL_RAYO - 85));
  return { fuerza, ciclo };
}

/**
 * El destello (un círculo de luz de `radio`, no la pantalla entera) y el trazo
 * del rayo, que baja quebrado desde `arriba` hasta `(x, y)`.
 */
function pintarRayo(
  ctx: CanvasRenderingContext2D,
  donde: NonNullable<ReturnType<FocoDeRayo['donde']>>,
  fuerza: number,
  semilla: number,
): void {
  const { x, y, arriba, radio } = donde;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radio);
  g.addColorStop(0, `rgba(190,205,255,${0.42 * fuerza})`);
  g.addColorStop(0.4, `rgba(150,170,230,${0.18 * fuerza})`);
  g.addColorStop(1, 'rgba(120,140,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - radio, y - radio, 2 * radio, 2 * radio);
  // El trazo: tramos quebrados con un hash del ciclo, y una rama.
  const tramos = 9;
  const puntos: { x: number; y: number }[] = [];
  let px = x + (azar(semilla) - 0.5) * radio * 0.5;
  for (let k = 0; k <= tramos; k++) {
    const f = k / tramos;
    const py = arriba + (y - arriba) * f;
    if (k > 0) px += (azar(semilla + k * 13) - 0.5) * radio * 0.18;
    // Que acabe en su sitio: el último tramo se cierra sobre (x, y).
    puntos.push({ x: k === tramos ? x : px + (x - px) * f * f, y: py });
  }
  const trazar = (ancho: number, color: string): void => {
    ctx.beginPath();
    for (const [k, p] of puntos.entries()) {
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    const r = puntos[Math.floor(tramos / 2)] as { x: number; y: number };
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + (azar(semilla + 99) - 0.5) * radio * 0.5, r.y + (y - arriba) * 0.22);
    ctx.lineWidth = ancho;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  ctx.lineJoin = 'round';
  trazar(6, `rgba(150,170,255,${0.22 * fuerza})`);
  trazar(2, `rgba(235,240,255,${0.9 * fuerza})`);
  ctx.restore();
}

// ------------------------------------------------------------- el pintor

const seMueve = (campo: CampoDelClima): boolean =>
  campo.bancos !== null || campo.lluvias.length > 0 || campo.rayos.length > 0;

/**
 * Lo de abajo del clima: lo que aclara (bruma y bancos) y lo que oscurece (la
 * luz, con sus fuegos). En la batalla va detrás de las casillas y las figuras;
 * en la base, entre los edificios y las figuras; en el mapa, tras los volúmenes.
 */
export function pintarSueloDelClima(
  ctx: CanvasRenderingContext2D,
  campo: CampoDelClima,
  m: MarcoDelClima,
): void {
  pintarLoQueAclara(ctx, campo, m, m.ahora);
  pintarLaLuz(ctx, campo, m);
  if (campo.bancos !== null) animarHasta(m.ahora + 100);
}

/**
 * Lo de arriba del clima: la lluvia y el rayo. Encima de las figuras y debajo
 * de lo que tiene que leerse (en la batalla, las barras, los nombres y las
 * cifras; en el mapa, los identificadores y la niebla de guerra).
 */
export function pintarAireDelClima(
  ctx: CanvasRenderingContext2D,
  campo: CampoDelClima,
  m: MarcoDelClima,
): void {
  for (const [j, l] of campo.lluvias.entries()) pintarLluvia(ctx, l, m, m.ahora, j * 9973);
  for (const foco of campo.rayos) {
    const rayo = rayoAhora(foco.id, m.ahora, foco.cada);
    if (rayo === null) continue;
    const donde = foco.donde(rayo.ciclo);
    if (donde !== null) pintarRayo(ctx, donde, rayo.fuerza, rayo.ciclo * 31 + hashDeTexto(foco.id));
  }
  if (seMueve(campo)) animarHasta(m.ahora + 100);
}

// -------------------------------------------------------- una escena entera

/** Lo que necesita el campo de una escena sin regiones, además de su sitio. */
export interface Escena {
  readonly ancho: number;
  readonly alto: number;
  /** Hasta dónde baja el rayo, en px desde arriba: el horizonte de la batalla. Sin él, un tercio del alto. */
  readonly cielo?: number;
  /** Los fuegos que se encienden si es de noche (las puertas de la base). */
  readonly luces?: readonly LuzDeNoche[];
  /**
   * Dónde cae en el lienzo el origen del escenario (px CSS), si la cámara se
   * mueve (la base y los lugares, con su scroll): la lluvia y los bancos de
   * niebla van con él. Sin él, quietos en la pantalla (la batalla).
   */
  readonly origen?: { readonly x: number; readonly y: number };
}

/** El campo de una escena: el clima de su sitio en todo el lienzo. */
export function campoDeEscena(sitio: ClimaDelSitio, e: Escena): CampoDelClima {
  const r = EFECTOS[sitio.tiempo];
  const cielo = e.cielo ?? e.alto / 3;
  const origen = e.origen ?? { x: 0, y: 0 };
  return {
    luz: luzDe(sitio),
    alza: alzaDe(sitio),
    bruma: r.bruma,
    bancos:
      r.bancos === null
        ? null
        : {
            alfa: r.bancos,
            origen,
            lado: Math.max(e.ancho, e.alto) * 0.9,
            tinte: null,
          },
    lluvias: r.lluvia === null ? [] : [{ lluvia: r.lluvia, dentro: null, origen }],
    rayos:
      r.rayos === null
        ? []
        : [
            {
              id: 'escena',
              cada: r.rayos.cada,
              donde: (ciclo) => ({
                x: e.ancho * (0.15 + 0.7 * azar(ciclo * 5 + 1)),
                y: Math.max(12, cielo * (0.45 + 0.4 * azar(ciclo * 5 + 2))),
                arriba: 0,
                radio: Math.min(e.ancho, e.alto) * 0.32,
              }),
            },
          ],
    luces: sitio.noche ? (e.luces ?? []) : [],
  };
}

/**
 * Lo que no se mueve del campo de una escena —la luz y la bruma lisas— pintado
 * de una vez: la batalla lo hornea en su fondo, que guarda por clima.
 */
export function hornearElVelo(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  campo: CampoDelClima,
  ancho: number,
  alto: number,
): void {
  ctx.save();
  if (campo.bruma !== null && !esMascara(campo.bruma)) {
    ctx.fillStyle = css(campo.bruma);
    ctx.fillRect(0, 0, ancho, alto);
  }
  if (campo.luz !== null && !esLuzDelMundo(campo.luz)) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = css(campo.luz);
    ctx.fillRect(0, 0, ancho, alto);
  }
  if (campo.alza !== null) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = css(campo.alza);
    ctx.fillRect(0, 0, ancho, alto);
  }
  ctx.restore();
}

/**
 * El campo sin lo que ya horneó `hornearElVelo`: lo que queda por fotograma. Los
 * bancos se tiñen con la luz que ya tienen debajo (de noche, la niebla también
 * es oscura). Solo para una escena sin fuegos: la luz con fuegos no se hornea.
 */
export function sinElVelo(campo: CampoDelClima): CampoDelClima {
  const luz = campo.luz !== null && !esLuzDelMundo(campo.luz) ? campo.luz : null;
  return {
    ...campo,
    luz: null,
    alza: null,
    bruma: null,
    bancos: campo.bancos === null ? null : { ...campo.bancos, tinte: luz },
  };
}

// ----------------------------------------------------------------- el mapa

/** Lo que necesita el clima del mapa: el clima de cada región y dónde mira la cámara. */
export interface ClimaDelMapa {
  readonly mapa: MapaDeRed;
  readonly semilla: number;
  readonly clima: ClimaDeLaPartida;
  readonly camara: CamaraMapa;
  readonly ancho: number;
  readonly alto: number;
  /** Los fuegos de ciudades y pueblos, en casillas del mundo (`Escena.luces` de clase `fuego`). */
  readonly fuegos: readonly { readonly x: number; readonly y: number; readonly r: number }[];
}

let huecosHechos: {
  readonly fuegos: ClimaDelMapa['fuegos'];
  /** Qué regiones son de noche: el espectador trae un clima nuevo con cada fotograma del cable. */
  readonly noches: string;
  readonly t: number;
  readonly huecos: readonly LuzDeNoche[];
} | null = null;

/**
 * Los fuegos de ciudades y pueblos que caen en una región de noche (por el
 * frente), en px CSS desde el origen del mundo y con su radio a este zoom. Se
 * hacen al cambiar el clima o el zoom, y la misma lista mientras no cambian: es
 * lo que mira la luz guardada para saber si sigue valiendo.
 */
function huecosDeNoche(m: ClimaDelMapa, t: number): readonly LuzDeNoche[] {
  const regiones = m.clima.regiones;
  const noches = regiones.map((r) => (r.noche ? 1 : 0)).join('');
  const h = huecosHechos;
  if (h !== null && h.fuegos === m.fuegos && h.noches === noches && h.t === t) return h.huecos;
  const huecos: LuzDeNoche[] = [];
  if (regiones.some((r) => r.noche)) {
    const enFrente = regionEnElFrente(m.mapa, m.semilla);
    for (const f of m.fuegos) {
      if (regiones[enFrente(f.x, f.y)]?.noche === true)
        huecos.push({ x: f.x * t, y: f.y * t, r: f.r * 1.7 * t });
    }
  }
  huecosHechos = { fuegos: m.fuegos, noches, t, huecos };
  return huecos;
}

/**
 * El campo del mapa, por región: las máscaras del mundo (`mascarasDelMapa`)
 * colocadas donde las pone la cámara; o `null` con todo despejado y de día.
 */
function campoDelMapa(m: ClimaDelMapa): CampoDelClima | null {
  const mk = mascarasDelMapa(m.mapa, m.semilla, m.clima);
  if (mk === null) return null;
  const { camara, mapa } = m;
  const t = camara.tile;
  const o = mundoAPixel(camara, 0, 0);
  const colocada = (lienzo: Lienzo): Colocada => ({
    lienzo,
    x: o.x,
    y: o.y,
    ancho: mapa.width * t,
    alto: mapa.height * t,
  });
  const regiones = m.clima.regiones;
  const k = mk.px / t;
  // Los fuegos de las regiones de noche: los huecos, todos y desde el origen del
  // mundo (la luz guardada los lleva aunque no se vean aún); el resplandor, solo
  // los que se ven, en px del lienzo.
  const huecos = huecosDeNoche(m, t);
  const margen = 3 * t;
  const luces: LuzDeNoche[] = [];
  for (const f of huecos) {
    const x = o.x + f.x;
    const y = o.y + f.y;
    if (x < -margen || y < -margen || x > m.ancho + margen || y > m.alto + margen) continue;
    luces.push({ x, y, r: f.r });
  }
  const radio = RADIO_DEL_RAYO_EN_EL_MAPA * t;
  const rayos: FocoDeRayo[] = [];
  for (const [r, sitio] of regiones.entries()) {
    const receta = EFECTOS[sitio.tiempo].rayos;
    const reg = mapa.regions[r];
    if (receta === null || reg === undefined) continue;
    rayos.push({
      id: `${m.semilla}|${reg.id}`,
      cada: receta.cada,
      donde: (ciclo) => {
        const c = casillaDelRayo(mapa, m.semilla, r, ciclo);
        if (c === null) return null;
        const p = mundoAPixel(camara, c.x + 0.5, c.y + 0.5);
        if (p.x < -radio || p.y < -radio || p.x > m.ancho + radio || p.y > m.alto + radio)
          return null;
        return { x: p.x, y: p.y, arriba: p.y - 7 * t, radio };
      },
    });
  }
  return {
    luz:
      mk.luz === null
        ? null
        : { mascara: colocada(mk.luz), alza: mk.alza === null ? null : colocada(mk.alza), huecos },
    alza: null,
    bruma: mk.bruma === null ? null : colocada(mk.bruma),
    bancos:
      mk.bancos === null
        ? null
        : { alfa: colocada(mk.bancos), origen: o, lado: 9 * t, tinte: null },
    lluvias: mk.lluvias.map(({ lluvia, dentro }) => ({
      lluvia,
      origen: o,
      dentro:
        dentro === null
          ? null
          : (x: number, y: number): boolean => {
              const px = Math.floor((x - o.x) * k);
              const py = Math.floor((y - o.y) * k);
              return (
                px >= 0 &&
                py >= 0 &&
                px < mk.ancho &&
                py < mk.alto &&
                dentro[py * mk.ancho + px] === 1
              );
            },
    })),
    rayos,
    luces,
  };
}

/**
 * El clima del mapa: va **dentro de `drawMapa`**, tras los volúmenes y antes de
 * los identificadores y de la niebla de guerra, así que no tapa ni destapa nada
 * de ella. Las dos pasadas seguidas: en el mapa no hay figuras que separen.
 */
export function pintarClimaDelMapa(
  ctx: CanvasRenderingContext2D,
  m: ClimaDelMapa,
  ahora: number,
): void {
  const campo = campoDelMapa(m);
  if (campo === null) return;
  const marco = { ancho: m.ancho, alto: m.alto, ahora };
  pintarSueloDelClima(ctx, campo, marco);
  pintarAireDelClima(ctx, campo, marco);
}
