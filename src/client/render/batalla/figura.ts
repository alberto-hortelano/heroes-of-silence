/**
 * Cada figura en el tablero de batalla: dónde está en pantalla (`cajaDeFigura`, que lee
 * también el clic), su cuerpo en pie o caído, con su aro (`pintarUnidad`,
 * `pintarCadaver`), lo que lleva encima de la cabeza —la barra de vida, los galones, el
 * nombre y la corona— y su silueta donde la tapa la muralla (`tapadasPorLaMuralla`,
 * `pintarSilueta`). Era parte de `render/batalla.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { isShooter } from '@core/battle/armas.js';
import { hexKey } from '@core/battle/board.js';
import { hayMuralla } from '@core/battle/muralla.js';
import { type BattleStack, type BattleState, rangoDeVeterania } from '@core/battle/types.js';
import type { Plano } from '../../../shared/arte.js';
import type { EstadoFigura } from '../../batalla/anim.js';
import { temaDelLienzo } from '../../comun/temas.js';
import { luzDeLasFiguras } from '../clima/recetas.js';
import { type CajaDeFigura, cajaDeFiguraEn } from '../figuras/caja.js';
import { type CharacterClip, clipEnCurso } from '../figuras/character.js';
import {
  colocarFigura,
  type Figura,
  pintarFigura,
  pintarFiguraConSombra,
  pintarSombraDeFigura,
  precargarDisparo,
} from '../figuras/figura.js';
import { arteDe, hojaDe } from '../figuras/personajes.js';
import { COLOR_DE_COMANDANTE, MARCA_DE_COMANDANTE } from '../palette.js';
import type { Tablero } from '../proyeccion.js';
import { colorDelBando } from './bandos.js';
import { nombreEnElCampo } from './distintivo.js';
import {
  claveDePortada,
  convexosSeTocan,
  type Punto,
  piezasEnOrden,
  siluetaDeColumna,
  siluetaDePortada,
  tableroA,
} from './muralla.js';
import type { VistaBatalla } from './tablero.js';

/**
 * Dónde está la figura en pantalla: el centro de sus pies, el suelo y su altura.
 * La usan el dibujo y el clic: quien pulsa apunta al cuerpo, que está ENCIMA de
 * su hex, y con solo el hex un clic en la cabeza de un esqueleto caía en el de
 * la fila de atrás.
 */
export function cajaDeFigura(t: Tablero, en: Plano, elevacion = 0): CajaDeFigura {
  // En lo alto de una columna los pies van en su tapa: subidos lo que ella mide.
  const c = cajaDeFiguraEn(tableroA(t, elevacion), en);
  return { ...c, suelo: c.suelo + t.paso * 0.24 * t.compresion };
}

/**
 * El clip que se pinta: el que dice el animador, salvo el daño cuyo clip ya ha
 * acabado en el reloj de su atlas, que vuelve al reposo. El animador apunta solo
 * el instante del impacto; cuánto dura el daño lo sabe la hoja, no él.
 */
export function clipQueSePinta(
  body: string,
  f: Pick<EstadoFigura, 'clip' | 'tiempo' | 'mira'>,
): CharacterClip {
  if (f.clip === 'hurt' && !clipEnCurso(hojaDe(arteDe(body), f.mira), 'hurt', f.tiempo)) {
    return 'idle';
  }
  return f.clip;
}

/** La figura de una unidad en este instante, como la pintan el cadáver y la unidad en pie. */
function figuraDe(
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
  caja: { readonly suelo: number; readonly alto: number },
  x: number,
): Figura {
  return {
    id: s.id,
    body: s.body,
    clip: clipQueSePinta(s.body, f),
    tiempo: f.tiempo,
    x,
    suelo: caja.suelo,
    alto: caja.alto,
    mira: f.mira,
    color: colorDelBando(v, s.side),
    // Sin arte, el marcador del que cae se funde con su aro: no hay cadáver que
    // dejar. Con arte la figura no se funde nunca (`Figura.alfaSinArte`).
    alfaSinArte: f.alfaDelAro,
    // El destello del golpe, que se apaga en el primer 60 % de lo que dura.
    destello: f.golpe > 0 && f.golpe < 0.6 ? 1 - f.golpe / 0.6 : 0,
    rotulo: s.unit.name.slice(0, 3),
    // La luz del clima, en parte (`luzDeLasFiguras`): de noche no van con la de
    // la tarde. El aro, las casillas y las barras, sin teñir.
    luz: luzDeLasFiguras(v.clima.sitio),
  };
}

/** El cadáver: el fotograma de la muerte que toca, y al final el `cadaver`, con su sombra. */
export function pintarCadaver(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
): void {
  const caja = cajaDeFigura(v.tablero, f.en, f.elevacion);
  pintarFiguraConSombra(ctx, {
    ...figuraDe(v, s, f, caja, caja.x),
    clip: 'death',
    tiempo: f.caida ?? 0,
    destello: 0,
    // Sin arte no hay cadáver: el marcador ya se fundió al caer.
    alfaSinArte: 0,
  });
}

/**
 * Lo que mide el aro de quien se cruza en la rueda, por el de los pies: fuera del
 * de su bando, del dorado de la activa y del de defender (×1,25), y dentro del
 * del hechizo (×1,45).
 */
export const ARO_DE_LA_RUEDA = 1.3;

export function pintarUnidad(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
  activa: boolean,
): void {
  const paso = v.tablero.paso;
  const caja = cajaDeFigura(v.tablero, f.en, f.elevacion);
  // El retroceso del golpe: un temblor que se apaga.
  const x = caja.x + (f.golpe > 0 ? Math.sin(f.golpe * 22) * paso * 0.06 * (1 - f.golpe) : 0);
  const { suelo } = caja;
  const color = colorDelBando(v, s.side);
  // Quien dispara tiene su disparo en otra hoja: se pide antes del primer tiro.
  if (isShooter(s.unit)) precargarDisparo(s.body, f.mira);
  const figura = colocarFigura(figuraDe(v, s, f, caja, x));

  // La sombra va debajo del aro: es del suelo, y el aro se lee encima.
  pintarSombraDeFigura(ctx, figura);
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro;
  // Aro del bando a los pies; dorado y más grueso si es la que actúa.
  const rx = paso * 0.36;
  const ry = rx * v.tablero.compresion * 0.95;
  ctx.lineWidth = activa ? 3 : 2;
  ctx.strokeStyle = activa ? '#fbe3a0' : color;
  ctx.beginPath();
  ctx.ellipse(x, suelo, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (v.enLaRueda !== null && (v.enLaRueda.atacante === s.id || v.enLaRueda.objetivo === s.id)) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, suelo, rx * ARO_DE_LA_RUEDA, ry * ARO_DE_LA_RUEDA, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (v.objetivosHechizo.has(s.id)) {
    ctx.strokeStyle = '#7fd4d8';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(x, suelo, rx * 1.45, ry * 1.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  pintarFigura(ctx, figura);
}

/**
 * Lo que va encima de la cabeza: dónde, y de qué ancho es la barra. Exportada
 * para `pnpm capturas`, que mira en el lienzo la barra de vida que se pinta.
 */
export function cabezaDe(
  v: Pick<VistaBatalla, 'tablero'>,
  f: Pick<EstadoFigura, 'en' | 'elevacion'>,
) {
  const caja = cajaDeFigura(v.tablero, f.en, f.elevacion);
  return {
    x: caja.x,
    y: caja.suelo - caja.alto - v.tablero.paso * 0.08,
    anchoBarra: v.tablero.paso * 0.6,
  };
}

/**
 * Lo que va encima de cada figura: la barra de vida y los tiros. Exportada para
 * que un test pueda mirar qué se escribe sin un navegador: no toca imágenes ni
 * `Path2D`.
 */
export function pintarSobreLaCabeza(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
): void {
  pintarVida(ctx, v, s, f);
  pintarGalones(ctx, v, s, f);
}

/**
 * Cuántos galones lleva la figura: uno por rango por encima del 1,
 * así que un novato no lleva ninguno y uno de nivel 5, cuatro. Se lee del
 * origen —la hoja con la que entró—, la misma de la que salen sus cifras.
 */
export function galonesDe(s: BattleStack): number {
  return rangoDeVeterania(s.origen) - 1;
}

/**
 * Los galones, encima de la barra y centrados: uves invertidas en fila, una por rango de
 * veteranía por encima del 1. Encima y no a un lado porque a la izquierda caía
 * la corona del comandante vecino y a la derecha van los tiros del tirador. Con
 * trazos y no con un glifo, porque un `︽` depende de la fuente que tenga quien
 * mire y sin ella se pinta un cuadrado.
 */
function pintarGalones(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
): void {
  const n = galonesDe(s);
  if (n <= 0) return;
  const { x, y } = cabezaDe(v, f);
  const ancho = Math.max(8, Math.round(v.tablero.paso * 0.13));
  const alto = Math.round(ancho * 0.55);
  const hueco = 3;
  const total = n * ancho + (n - 1) * hueco;
  const abajo = y - 4;
  const tema = temaDelLienzo();
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const izq = x - total / 2 + i * (ancho + hueco);
    ctx.beginPath();
    ctx.moveTo(izq, abajo);
    ctx.lineTo(izq + ancho / 2, abajo - alto);
    ctx.lineTo(izq + ancho, abajo);
    // El contorno lleva su transparencia encima de la del aro: el tema da el
    // color opaco.
    ctx.globalAlpha = f.alfaDelAro * 0.9;
    ctx.lineWidth = 5;
    ctx.strokeStyle = tema.vidaFondo;
    ctx.stroke();
    ctx.globalAlpha = f.alfaDelAro;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = tema.galon;
    ctx.stroke();
  }
  ctx.restore();
}

/** Un rectángulo en píxeles del lienzo: lo que ocupa algo pintado. */
export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/**
 * Dónde va la corona del comandante: centrada sobre su cabeza y **por encima
 * del hueco del nombre**, se pinte el nombre o no.
 *
 * Antes iba a la izquierda de la barra, a 14 px, y la chapa del nombre —que sale
 * en la unidad activa y en la señalada, justo cuando más se mira— le caía encima
 * (H-8 de la QA de la fase 1b). Ahora no comparten sitio y además se pinta en la
 * última pasada; el test lo comprueba con las dos cajas, no con un píxel.
 */
export function cajaDeCorona(v: VistaBatalla, f: EstadoFigura): Caja {
  const { x } = cabezaDe(v, f);
  const nombre = cajaDeNombre(v, f, 0);
  const tam = Math.max(22, Math.round(v.tablero.paso * 0.4));
  return { x: x - tam / 2, y: nombre.y - 2 - tam, ancho: tam, alto: tam };
}

/**
 * La corona del comandante. Va la última, por encima de todas las figuras y de
 * los nombres: es la pieza que decide la batalla y se tiene que ver siempre, con
 * arte y sin él. Exportada para el mismo test que `pintarSobreLaCabeza`.
 */
export function pintarCorona(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  f: EstadoFigura,
): void {
  const c = cajaDeCorona(v, f);
  const tema = temaDelLienzo();
  ctx.save();
  // La letra del tema: si no trae el glifo, el navegador lo saca de otra del
  // sistema, como con cualquier carácter que le falte a una fuente.
  ctx.font = `bold ${c.alto}px ${tema.letraUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  // El contorno, del oscuro de la barra de vida (opaco en el tema) a 0,9.
  ctx.globalAlpha = f.alfaDelAro * 0.9;
  ctx.strokeStyle = tema.vidaFondo;
  const cx = c.x + c.ancho / 2;
  const cy = c.y + c.alto / 2;
  ctx.strokeText(MARCA_DE_COMANDANTE, cx, cy);
  ctx.globalAlpha = f.alfaDelAro;
  ctx.fillStyle = COLOR_DE_COMANDANTE;
  ctx.fillText(MARCA_DE_COMANDANTE, cx, cy);
  ctx.restore();
}

/**
 * La barra de vida y, si dispara, cuántos tiros le quedan.
 *
 * Sin chapa de nombre: con nueve individuos por bando las «Cam», «Esq» y «Mom»
 * se amontonaban unas sobre otras y tapaban a las figuras. El nombre está en el
 * panel, sale al pasar el ratón y en la unidad que actúa (`pintarNombre`).
 */
function pintarVida(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
): void {
  const { x, y, anchoBarra } = cabezaDe(v, f);
  // La vida que se ve (`EstadoFigura.pv`), no la del estado: con la cola llena,
  // la del estado es la de después de todo lo que aún no se ha enseñado.
  const vida = Math.max(0, Math.min(1, f.pv / Math.max(1, s.unit.hp * s.initialCount)));
  const tema = temaDelLienzo();
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro * 0.85;
  ctx.fillStyle = tema.vidaFondo;
  ctx.fillRect(x - anchoBarra / 2 - 1, y - 1, anchoBarra + 2, 6);
  ctx.globalAlpha = f.alfaDelAro;
  ctx.fillStyle = vida > 0.5 ? '#9fc49a' : vida > 0.25 ? '#e0c060' : '#e3735a';
  ctx.fillRect(x - anchoBarra / 2, y, anchoBarra * vida, 4);
  ctx.restore();
}

/** El nombre entero, sobre la barra: solo de la señalada y de la que actúa. */
export function pintarNombre(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
): void {
  const tema = temaDelLienzo();
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro;
  ctx.font = `${cuerpoDelNombre(v)}px ${tema.letraUi}`;
  // Con la letra de los homónimos («Piquero B»): es la misma que dice el parte,
  // y pasar el ratón por la figura es como se casa una línea con su unidad (#198).
  const nombre = nombreEnElCampo(v.battle, s);
  const caja = cajaDeNombre(v, f, ctx.measureText(nombre).width);
  ctx.globalAlpha = f.alfaDelAro * 0.9;
  ctx.fillStyle = tema.chapaFondo;
  ctx.fillRect(caja.x, caja.y, caja.ancho, caja.alto);
  ctx.globalAlpha = f.alfaDelAro;
  ctx.fillStyle = tema.chapaTinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(nombre, caja.x + caja.ancho / 2, caja.y + 2);
  ctx.restore();
}

function cuerpoDelNombre(v: VistaBatalla): number {
  return Math.max(10, Math.round(v.tablero.paso * 0.16));
}

/** La chapa del nombre, sobre la barra; `anchoTexto` lo mide quien tiene la fuente. */
export function cajaDeNombre(v: VistaBatalla, f: EstadoFigura, anchoTexto: number): Caja {
  const { x, y } = cabezaDe(v, f);
  const cuerpo = cuerpoDelNombre(v);
  const ancho = anchoTexto + 8;
  return { x: x - ancho / 2, y: y - cuerpo - 6, ancho, alto: cuerpo + 4 };
}

/**
 * Las figuras en pie que alguna columna o portada pintada después tapa, entera o
 * en parte, con las que la tapan (su clave y su silueta): el orden es el de
 * `piezasEnOrden`, y «tapa» es que la silueta de la pieza pisa la caja de la
 * figura (`cajaDeFigura`). Las lee la silueta (`pintarSilueta`).
 */
export function tapadasPorLaMuralla(
  t: Tablero,
  battle: Pick<BattleState, 'muralla' | 'escaleras' | 'stacks'>,
  figura: (s: BattleStack) => Pick<EstadoFigura, 'en' | 'caida' | 'elevacion' | 'visible'>,
): Map<string, Tapa[]> {
  const tapadas = new Map<string, Tapa[]>();
  if (!hayMuralla(battle.muralla)) return tapadas;
  const porId = new Map(battle.stacks.map((s) => [s.id, s]));
  const delante: Tapa[] = [];
  // De delante atrás: cada figura mira las columnas que ya han salido, que son
  // las que se pintan después de ella.
  for (const p of piezasEnOrden(battle, figura).reverse()) {
    if (p.kind === 'columna') {
      delante.push({ clave: hexKey(p.hex), silueta: siluetaDeColumna(t, p.hex) });
      continue;
    }
    if (p.kind === 'portada') {
      delante.push({ clave: claveDePortada(p.puerta), silueta: siluetaDePortada(t, p.puerta) });
      continue;
    }
    if (p.kind !== 'figura' || delante.length === 0) continue;
    const s = porId.get(p.id) as BattleStack;
    const f = figura(s);
    const c = cajaDeFigura(t, f.en, f.elevacion);
    const caja: Punto[] = [
      { x: c.x - c.ancho / 2, y: c.suelo - c.alto },
      { x: c.x + c.ancho / 2, y: c.suelo - c.alto },
      { x: c.x + c.ancho / 2, y: c.suelo },
      { x: c.x - c.ancho / 2, y: c.suelo },
    ];
    const cubren = delante.filter((d) => convexosSeTocan(caja, d.silueta));
    if (cubren.length > 0) tapadas.set(s.id, cubren);
  }
  return tapadas;
}

/** Una columna o portada que tapa a una figura: su clave y lo que ocupa en el lienzo. */
export interface Tapa {
  readonly clave: string;
  readonly silueta: readonly Punto[];
}

/** Lo grueso del contorno de la silueta, en píxeles del lienzo. */
const GROSOR_DE_LA_SILUETA = 2;

/** Lo que se rellena por dentro de la silueta, para que se lea como un cuerpo. */
const RELLENO_DE_LA_SILUETA = 0.22;

/** Dos lienzos de trabajo para la silueta, del tamaño del de la batalla: se reutilizan. */
let lienzosDeSilueta: {
  figura: HTMLCanvasElement;
  contorno: HTMLCanvasElement;
} | null = null;

function lienzosPara(ancho: number, alto: number) {
  if (
    lienzosDeSilueta === null ||
    lienzosDeSilueta.figura.width !== ancho ||
    lienzosDeSilueta.figura.height !== alto
  ) {
    const nuevo = (): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = ancho;
      c.height = alto;
      return c;
    };
    lienzosDeSilueta = { figura: nuevo(), contorno: nuevo() };
  }
  return lienzosDeSilueta;
}

function contexto(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('este navegador no tiene canvas 2D para pintar siluetas');
  return ctx;
}

/**
 * La silueta de una figura tapada (ampliación 2, (b)): el contorno del color de
 * su bando y un relleno tenue, pintados encima de las columnas que la tapan y
 * solo donde la tapan (el recorte es la silueta de esas columnas). Se saca de la
 * propia figura: se pinta aparte, se tiñe entera (`source-in`), se corre
 * `GROSOR_DE_LA_SILUETA` en ocho sentidos y se le quita el cuerpo
 * (`destination-out`): queda el borde, con o sin arte.
 */
export function pintarSilueta(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
  cubren: readonly Tapa[],
): void {
  const caja = cajaDeFigura(v.tablero, f.en, f.elevacion);
  const figura = colocarFigura(figuraDe(v, s, f, caja, caja.x));
  const transformacion = ctx.getTransform();
  const escala = Math.max(1e-6, Math.hypot(transformacion.a, transformacion.b));
  const grosor = GROSOR_DE_LA_SILUETA * escala;
  // Lo que puede ocupar la figura, en píxeles del dispositivo: su hoja si tiene
  // arte (un cuadrado de `lado`), y si no, su caja con holgura.
  const enCss =
    figura.p === null
      ? {
          x: caja.x - caja.ancho,
          y: caja.suelo - caja.alto * 1.2,
          ancho: caja.ancho * 2,
          alto: caja.alto * 1.4,
        }
      : {
          x: caja.x + figura.p.dx,
          y: caja.suelo + figura.p.dy,
          ancho: figura.p.lado,
          alto: figura.p.lado,
        };
  const a = transformacion.transformPoint({ x: enCss.x, y: enCss.y });
  const b = transformacion.transformPoint({
    x: enCss.x + enCss.ancho,
    y: enCss.y + enCss.alto,
  });
  const margen = Math.ceil(grosor) + 1;
  const rx = Math.max(0, Math.floor(Math.min(a.x, b.x)) - margen);
  const ry = Math.max(0, Math.floor(Math.min(a.y, b.y)) - margen);
  const rw = Math.min(ctx.canvas.width, Math.ceil(Math.max(a.x, b.x)) + margen) - rx;
  const rh = Math.min(ctx.canvas.height, Math.ceil(Math.max(a.y, b.y)) + margen) - ry;
  if (rw <= 0 || rh <= 0) return;
  const lienzos = lienzosPara(ctx.canvas.width, ctx.canvas.height);
  const fig = contexto(lienzos.figura);
  const borde = contexto(lienzos.contorno);
  for (const c of [fig, borde]) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(rx, ry, rw, rh);
  }
  // La figura, teñida entera del color de su bando: sin destello ni fundido.
  fig.setTransform(transformacion);
  pintarFigura(fig, {
    ...figura,
    f: { ...figura.f, destello: 0, alfaSinArte: 1 },
  });
  fig.setTransform(1, 0, 0, 1, 0, 0);
  fig.globalCompositeOperation = 'source-in';
  fig.fillStyle = colorDelBando(v, s.side);
  fig.fillRect(rx, ry, rw, rh);
  fig.globalCompositeOperation = 'source-over';
  // El borde: la figura corrida en ocho sentidos, menos la figura.
  for (let i = 0; i < 8; i++) {
    const dx = Math.round(Math.cos((i * Math.PI) / 4) * grosor);
    const dy = Math.round(Math.sin((i * Math.PI) / 4) * grosor);
    borde.drawImage(lienzos.figura, rx, ry, rw, rh, rx + dx, ry + dy, rw, rh);
  }
  borde.globalCompositeOperation = 'destination-out';
  borde.drawImage(lienzos.figura, rx, ry, rw, rh, rx, ry, rw, rh);
  borde.globalCompositeOperation = 'source-over';
  borde.globalAlpha = RELLENO_DE_LA_SILUETA;
  borde.drawImage(lienzos.figura, rx, ry, rw, rh, rx, ry, rw, rh);
  borde.globalAlpha = 1;
  // Encima de lo que la tapa, y solo ahí.
  const recorte = new Path2D();
  for (const { silueta } of cubren) {
    const [primero, ...resto] = silueta;
    recorte.moveTo((primero as Punto).x, (primero as Punto).y);
    for (const p of resto) recorte.lineTo(p.x, p.y);
    recorte.closePath();
  }
  ctx.save();
  ctx.clip(recorte);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(lienzos.contorno, rx, ry, rw, rh, rx, ry, rw, rh);
  ctx.restore();
}
