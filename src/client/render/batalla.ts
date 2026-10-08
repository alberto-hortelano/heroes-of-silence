/**
 * La batalla a 25°: el tablero de 11×9 proyectado sobre el suelo y las figuras
 * ordenadas por profundidad.
 *
 * Toma las ideas de `aventura/tactical-scene.ts` de la rama `archivo/gpt-rpg`
 * —fondo pintado, hexes aplastados, unidades de pie con su sombra— sin traerse
 * el fichero, que montaba un botón del DOM por hex y posicionaba con
 * `style.left`. Aquí todo es lienzo, y lo pinta el `BattleState` del núcleo:
 * individuos, hasta 7 por bando (el héroe incluido).
 *
 * Solo pinta. Qué hexes se pueden pisar, a quién se puede atacar y sobre quién
 * cae el hechizo llegan hechos de `session.ts`; dónde está cada figura en este
 * instante, del animador.
 */
import { activeStack, type CasillaDeCarga, isAlive, stackHexes } from '@core/battle/battle.js';
import { BOARD_HEIGHT, BOARD_WIDTH, hexKey } from '@core/battle/board.js';
import { CHARGE_BONUS_PER_HEX, stackHp } from '@core/battle/damage.js';
import {
  type BattleStack,
  type BattleState,
  nivelDeVeterania,
  type Side,
} from '@core/battle/types.js';
import { hexSize, isShooter } from '@core/data.js';
import type { Hex, PlayerId } from '@core/types.js';
import type { Efecto, EstadoFigura } from '../anim.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import { asset } from './assets.js';
import { type CharacterClip, clipEnCurso } from './character.js';
import {
  colocarFigura,
  type Figura,
  pintarFigura,
  pintarFiguraConSombra,
  pintarSombraDeFigura,
  precargarDisparo,
} from './figura.js';
import { densidadDe } from './lienzo.js';
import { COLOR_DE_COMANDANTE, COLOR_SIN_DUEÑO, MARCA_DE_COMANDANTE } from './palette.js';
import { arteDe, hojaDe } from './personajes.js';
import {
  ALTO_DE_FIGURA,
  centroHex,
  enPantalla,
  type Plano,
  type Tablero,
  verticesHex,
} from './proyeccion.js';

/** Los colores de los dos bandos: tiñen el Y Bot y pintan el aro. */
export const COLOR_BANDO: Readonly<Record<Side, string>> = {
  attacker: '#d9774f',
  defender: '#5a8ad9',
};

/**
 * Los bandos sin dueño —un monstruo que defiende, un grupo de asaltantes que
 * embosca—, sacados de los dueños de la batalla (`battleOwners`). Lo hace aquí
 * una vez para la partida y el espectador, que tienen los dueños cada uno por su
 * lado.
 */
export function bandosSinDueño(dueños: Readonly<Record<Side, PlayerId | null>>): ReadonlySet<Side> {
  return new Set((['attacker', 'defender'] as const).filter((s) => dueños[s] === null));
}

/**
 * El color de un bando en el tablero: el gris de lo que no tiene dueño si es
 * neutral, como en el mapa —un monstruo es el mismo muñeco gris en los dos
 * sitios—, y si no el del bando.
 */
export function colorDelBando(v: Pick<VistaBatalla, 'sinDueño'>, side: Side): string {
  return v.sinDueño.has(side) ? COLOR_SIN_DUEÑO : COLOR_BANDO[side];
}

/** Las casillas desde las que se golpearía al enemigo señalado, y la elegida. */
export interface Angulo {
  /** El enemigo señalado: su carga, si la tiene, se rotula «+N %» en su casilla. */
  readonly objetivo: string;
  readonly candidatas: readonly Hex[];
  readonly elegida: Hex;
}

export interface VistaBatalla {
  readonly battle: BattleState;
  readonly tablero: Tablero;
  readonly ancho: number;
  readonly alto: number;
  /** Hexes a los que puede ir la unidad activa, si es tuya. */
  readonly movibles: readonly Hex[];
  /**
   * Las cargas a mano: el enemigo que se puede cargar se marca, y la casilla de
   * su recta lleva otro tono y su «»N», que es como se ENSEÑA la carga con el
   * movimiento posible (decisión del usuario). Sale entera de `casillasDeCarga`,
   * así que no trae ninguna casilla que no sea movible ni ninguna sin enemigo
   * detrás.
   */
  readonly cargas: readonly CasillaDeCarga[];
  /**
   * Con el puntero sobre un enemigo al que se puede golpear: las casillas desde
   * las que se le alcanza (suaves) y la que se usaría al hacer clic (fuerte).
   */
  readonly angulo: Angulo | null;
  /** Unidades a las que puede atacar o disparar la activa, si es tuya. */
  readonly atacables: ReadonlySet<string>;
  /** Unidades sobre las que cae el hechizo elegido. */
  readonly objetivosHechizo: ReadonlySet<string>;
  readonly hoverHex: Hex | null;
  readonly hoverStack: string | null;
  /** Dónde y cómo está cada figura ahora: lo dice el animador. */
  readonly figura: (s: BattleStack) => EstadoFigura;
  readonly efectos: readonly Efecto[];
  /** Los bandos sin dueño, que se tiñen de gris (`bandosSinDueño`); en la arena, ninguno. */
  readonly sinDueño: ReadonlySet<Side>;
}

/**
 * Los 99 hexes ya trazados, para el tablero de este tamaño. Cada uno eran seis
 * senos y cosenos por fotograma para dibujar siempre lo mismo; ahora se trazan
 * al cambiar el tamaño del lienzo y nada más.
 */
let geometria: { clave: string; hexes: { k: string; camino: Path2D }[] } | null = null;

function hexesDe(t: Tablero): { k: string; camino: Path2D }[] {
  const clave = `${t.paso}|${t.origenX}|${t.origenY}|${t.compresion}`;
  if (geometria !== null && geometria.clave === clave) return geometria.hexes;
  const hexes: { k: string; camino: Path2D }[] = [];
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const camino = new Path2D();
      for (const [i, p] of verticesHex(t, { col, row }).entries()) {
        if (i === 0) camino.moveTo(p.x, p.y);
        else camino.lineTo(p.x, p.y);
      }
      camino.closePath();
      hexes.push({ k: hexKey({ col, row }), camino });
    }
  }
  geometria = { clave, hexes };
  return hexes;
}

export function drawBatalla(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const { battle, tablero } = v;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  pintarFondo(ctx, v);

  const movibles = new Set(v.movibles.map(hexKey));
  const enTurno = activeStack(battle);
  const activo = enTurno !== null && isAlive(enTurno) ? enTurno : null;
  const hexDeActivo = new Set<string>();
  const hexAtacables = new Set<string>();
  for (const s of battle.stacks) {
    if (!isAlive(s)) continue;
    const marcas = s.id === activo?.id ? hexDeActivo : v.atacables.has(s.id) ? hexAtacables : null;
    if (marcas === null) continue;
    for (const h of stackHexes(s)) marcas.add(hexKey(h));
  }

  // Las casillas desde las que se cargaría y los enemigos a los que se cargaría.
  const deCarga = new Set(v.cargas.map((c) => hexKey(c.at)));
  const cargables = new Set(v.cargas.map((c) => c.target));
  const hexCargables = new Set<string>();
  for (const s of battle.stacks) {
    if (cargables.has(s.id)) for (const h of stackHexes(s)) hexCargables.add(hexKey(h));
  }

  const candidatas = new Set((v.angulo?.candidatas ?? []).map(hexKey));
  const elegida = v.angulo === null ? null : hexKey(v.angulo.elegida);

  // 1 · Los hexes, aplastados sobre el suelo.
  const señalado = v.hoverHex === null ? null : hexKey(v.hoverHex);
  for (const { k, camino } of hexesDe(tablero)) {
    const encima = señalado === k;
    const deActivo = hexDeActivo.has(k);
    const atacable = hexAtacables.has(k);
    const movible = movibles.has(k);
    const carga = movible && deCarga.has(k);
    const cargable = hexCargables.has(k);
    // El ángulo va por encima de todo lo demás: es lo que haría el clic. La
    // casilla en la que ya está la unidad también puede ser la elegida.
    if (k === elegida || candidatas.has(k)) {
      const fuerte = k === elegida;
      ctx.fillStyle = fuerte ? '#ffd24acc' : '#ffe08a80';
      ctx.fill(camino);
      ctx.lineWidth = fuerte ? 3 : 2;
      ctx.strokeStyle = fuerte ? '#fff4c2' : '#ffe9a8';
      ctx.stroke(camino);
      continue;
    }
    ctx.fillStyle = deActivo
      ? '#edca6066'
      : cargable
        ? encima
          ? '#e7884a99'
          : '#d9773a66'
        : atacable
          ? encima
            ? '#e2735888'
            : '#d6624955'
          : carga
            ? encima
              ? '#e7a04a88'
              : '#d98c3a55'
            : movible
              ? encima
                ? '#7cc8d466'
                : '#5caab73a'
              : encima
                ? '#ffffff22'
                : '#00000014';
    ctx.fill(camino);
    ctx.lineWidth = deActivo || cargable ? 2.5 : 1.2;
    ctx.strokeStyle = deActivo
      ? '#fbe3a0'
      : cargable
        ? '#ffc070'
        : atacable
          ? '#f39980cc'
          : carga
            ? '#f2c084cc'
            : movible
              ? '#b6e3e9aa'
              : '#f2e6c05c';
    ctx.stroke(camino);
  }
  // Y el número de la carga en cada casilla que carga: cuántas casillas cobra.
  if (v.cargas.length > 0) pintarCargas(ctx, tablero, v.cargas, v.angulo);

  // 2 · Los cadáveres, debajo de todo lo que sigue en pie: se quedan en su
  // casilla hasta el final de la batalla, sin aro, sin barra y sin nombre.
  const todas = battle.stacks
    .map((s) => ({ s, f: v.figura(s) }))
    .sort((a, b) => a.f.en.y - b.f.en.y);
  for (const { s, f } of todas) if (f.caida !== null) pintarCadaver(ctx, v, s, f);

  // 3 · Las figuras, de atrás adelante.
  const figuras = todas.filter(({ f }) => f.visible);
  for (const { s, f } of figuras) {
    pintarUnidad(ctx, v, s, f, s.id === activo?.id);
  }
  // Las barras van en una pasada aparte, por encima de TODAS las figuras: pintadas
  // con su unidad, la figura de la fila de delante tapaba la barra de la de
  // detrás. Y de atrás adelante, para que la de detrás no tape la de delante.
  for (const { s, f } of figuras) pintarSobreLaCabeza(ctx, v, s, f);
  // El nombre, de la señalada y de la que actúa, encima de todo lo demás.
  for (const { s, f } of figuras) {
    if (s.id === v.hoverStack || s.id === activo?.id) pintarNombre(ctx, v, s, f);
  }
  // Y la corona, la última de las tres: encima del nombre y no debajo (H-8).
  for (const { s, f } of figuras) {
    if (s.origen.kind === 'heroe') pintarCorona(ctx, v, s, f);
  }

  // 4 · Lo que vuela por encima: proyectiles, hechizos y cifras.
  for (const e of v.efectos) pintarEfecto(ctx, tablero, e);
  ctx.restore();
}

/**
 * El número de casillas de carga, en el centro de cada casilla desde la que se
 * cargaría: «»N». Con el puntero sobre el enemigo de esa carga, la casilla es una
 * candidata más del ángulo y dice lo que suma, «+N %», con la constante del daño.
 */
function pintarCargas(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  cargas: readonly CasillaDeCarga[],
  angulo: Angulo | null,
): void {
  ctx.save();
  ctx.font = `bold ${Math.max(9, Math.round(t.paso * 0.22))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { target, at, hexes } of cargas) {
    const c = centroHex(t, at);
    const texto =
      angulo?.objetivo === target
        ? `+${Math.round(hexes * CHARGE_BONUS_PER_HEX * 100)} %`
        : `»${hexes}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a1a0acc';
    ctx.strokeText(texto, c.x, c.y);
    ctx.fillStyle = '#ffd9a0';
    ctx.fillText(texto, c.x, c.y);
  }
  ctx.restore();
}

/**
 * Dónde está la figura en pantalla: el centro de sus pies, el suelo y su altura.
 * La usan el dibujo y el clic: quien pulsa apunta al cuerpo, que está ENCIMA de
 * su hex, y con solo el hex un clic en la cabeza de un esqueleto caía en el de
 * la fila de atrás.
 */
export function cajaDeFigura(
  t: Tablero,
  s: BattleStack,
  en: Plano,
): { x: number; suelo: number; alto: number; ancho: number } {
  const grande = hexSize(s.unit) > 1;
  const p = enPantalla(t, en);
  const alto = t.paso * ALTO_DE_FIGURA[grande ? 'grande' : 'normal'];
  return {
    x: p.x,
    suelo: p.y + t.paso * 0.24 * t.compresion,
    alto,
    ancho: alto * (grande ? 0.9 : 0.42),
  };
}

/**
 * El fondo compuesto una vez por tamaño de lienzo: el campo escalado y su
 * velo. Escalar la imagen entera del campo con suavizado era, con el mapa ya
 * cacheado, lo más caro de un fotograma de batalla, y no cambia mientras el
 * lienzo no cambie de tamaño.
 */
let fondo: { clave: string; campo: HTMLImageElement | null; lienzo: HTMLCanvasElement } | null =
  null;

function pintarFondo(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const campo = asset('rpg', 'campo');
  const dpr = densidadDe(ctx);
  const clave = `${v.ancho}|${v.alto}|${dpr}|${v.tablero.paso}|${v.tablero.origenY}|${v.tablero.compresion}`;
  if (fondo === null || fondo.clave !== clave || fondo.campo !== campo) {
    const lienzo = fondo?.lienzo ?? document.createElement('canvas');
    lienzo.width = Math.max(1, Math.ceil(v.ancho * dpr));
    lienzo.height = Math.max(1, Math.ceil(v.alto * dpr));
    const c = lienzo.getContext('2d');
    if (c === null)
      throw new Error('este navegador no tiene canvas 2D para el fondo de la batalla');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    componerFondo(c, v, campo);
    fondo = { clave, campo, lienzo };
  }
  ctx.drawImage(fondo.lienzo, 0, 0, v.ancho, v.alto);
}

function componerFondo(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  campo: HTMLImageElement | null,
): void {
  if (campo !== null) {
    pintarCielo(ctx, v);
    // El horizonte del fondo (el 47 % de su alto, donde acaba el empedrado) se
    // pone un poco por encima de la fila de atrás: así el tablero entero pisa
    // suelo y no flota sobre el cielo. Y la escala nunca deja el fondo más
    // estrecho que el lienzo ni corto por abajo.
    const HORIZONTE = 0.47;
    const W = campo.naturalWidth;
    const H = campo.naturalHeight;
    const arriba = v.tablero.origenY - v.tablero.paso * 0.9;
    const escala = Math.max(v.ancho / W, (v.alto - arriba) / ((1 - HORIZONTE) * H));
    const w = W * escala;
    const h = H * escala;
    ctx.drawImage(campo, (v.ancho - w) / 2, arriba - HORIZONTE * h, w, h);
    ctx.fillStyle = 'rgba(10,12,8,0.22)';
    ctx.fillRect(0, 0, v.ancho, v.alto);
    return;
  }
  const degradado = ctx.createLinearGradient(0, 0, 0, v.alto);
  degradado.addColorStop(0, '#1d221a');
  degradado.addColorStop(0.35, '#3a3a26');
  degradado.addColorStop(1, '#4d4630');
  ctx.fillStyle = degradado;
  ctx.fillRect(0, 0, v.ancho, v.alto);
}

/**
 * El cielo de detrás del campo. `campo.webp` lo trae TRANSPARENTE —un tercio de
 * sus píxeles, igual que el `clearing.png` del que sale—, y sobre el negro de
 * antes quedaba un hueco negro encima de los árboles. Es un atardecer de otoño,
 * del azul pizarra arriba al ocre de la bruma en la línea de los árboles, que es
 * la luz que ya tiene el empedrado.
 */
function pintarCielo(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const linea = Math.max(1, v.tablero.origenY - v.tablero.paso * 0.9);
  const cielo = ctx.createLinearGradient(0, 0, 0, linea);
  cielo.addColorStop(0, '#27303b');
  cielo.addColorStop(0.55, '#5b5e58');
  cielo.addColorStop(1, '#a58c5c');
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, v.ancho, v.alto);
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
  };
}

/** El cadáver: el fotograma de la muerte que toca, y al final el `cadaver`, con su sombra. */
function pintarCadaver(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
): void {
  const caja = cajaDeFigura(v.tablero, s, f.en);
  pintarFiguraConSombra(ctx, {
    ...figuraDe(v, s, f, caja, caja.x),
    clip: 'death',
    tiempo: f.caida ?? 0,
    destello: 0,
    // Sin arte no hay cadáver: el marcador ya se fundió al caer.
    alfaSinArte: 0,
  });
}

function pintarUnidad(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
  activa: boolean,
): void {
  const paso = v.tablero.paso;
  const grande = hexSize(s.unit) > 1;
  const caja = cajaDeFigura(v.tablero, s, f.en);
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
  const rx = paso * (grande ? 0.75 : 0.36);
  const ry = rx * v.tablero.compresion * 0.95;
  ctx.lineWidth = activa ? 3 : 2;
  ctx.strokeStyle = activa ? '#fbe3a0' : color;
  ctx.beginPath();
  ctx.ellipse(x, suelo, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (s.defending) {
    ctx.strokeStyle = '#9fc49a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, suelo, rx * 1.25, ry * 1.25, 0, Math.PI * 0.9, Math.PI * 2.1);
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

/** Lo que va encima de la cabeza: dónde, y de qué ancho es la barra. */
function cabezaDe(v: VistaBatalla, s: BattleStack, f: EstadoFigura) {
  const caja = cajaDeFigura(v.tablero, s, f.en);
  const grande = hexSize(s.unit) > 1;
  return {
    x: caja.x,
    y: caja.suelo - caja.alto - v.tablero.paso * 0.08,
    anchoBarra: v.tablero.paso * (grande ? 0.9 : 0.6),
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
 * Cuántos galones lleva la figura: uno por nivel de veteranía por encima del 1,
 * así que un novato no lleva ninguno y uno de nivel 5, cuatro. Se lee del
 * origen —la hoja con la que entró—, la misma de la que salen sus cifras.
 */
export function galonesDe(s: BattleStack): number {
  return nivelDeVeterania(s.origen) - 1;
}

/**
 * Los galones, encima de la barra y centrados: uves invertidas en fila, una por nivel de
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
  const { x, y } = cabezaDe(v, s, f);
  const ancho = Math.max(8, Math.round(v.tablero.paso * 0.13));
  const alto = Math.round(ancho * 0.55);
  const hueco = 3;
  const total = n * ancho + (n - 1) * hueco;
  const abajo = y - 4;
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const izq = x - total / 2 + i * (ancho + hueco);
    ctx.beginPath();
    ctx.moveTo(izq, abajo);
    ctx.lineTo(izq + ancho / 2, abajo - alto);
    ctx.lineTo(izq + ancho, abajo);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(12,10,6,0.9)';
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#e8c35a';
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
export function cajaDeCorona(v: VistaBatalla, s: BattleStack, f: EstadoFigura): Caja {
  const { x } = cabezaDe(v, s, f);
  const nombre = cajaDeNombre(v, s, f, 0);
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
  s: BattleStack,
  f: EstadoFigura,
): void {
  const c = cajaDeCorona(v, s, f);
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro;
  ctx.font = `bold ${c.alto}px system-ui, "DejaVu Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(12,10,6,0.9)';
  const cx = c.x + c.ancho / 2;
  const cy = c.y + c.alto / 2;
  ctx.strokeText(MARCA_DE_COMANDANTE, cx, cy);
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
  const { x, y, anchoBarra } = cabezaDe(v, s, f);
  const vida = Math.max(0, Math.min(1, stackHp(s) / Math.max(1, s.unit.hp * s.initialCount)));
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro;
  ctx.fillStyle = 'rgba(12,10,6,0.85)';
  ctx.fillRect(x - anchoBarra / 2 - 1, y - 1, anchoBarra + 2, 6);
  ctx.fillStyle = vida > 0.5 ? '#9fc49a' : vida > 0.25 ? '#e0c060' : '#e3735a';
  ctx.fillRect(x - anchoBarra / 2, y, anchoBarra * vida, 4);
  if (isShooter(s.unit) && s.shotsLeft > 0) {
    ctx.fillStyle = '#9fc49a';
    ctx.font = `bold ${Math.max(9, Math.round(v.tablero.paso * 0.14))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`↑${s.shotsLeft}`, x + anchoBarra / 2 + 3, y + 2);
  }
  ctx.restore();
}

/** El nombre entero, sobre la barra: solo de la señalada y de la que actúa. */
function pintarNombre(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
): void {
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro;
  ctx.font = `${cuerpoDelNombre(v)}px system-ui, sans-serif`;
  // Con la letra de los homónimos («Piquero B»): es la misma que dice el parte,
  // y pasar el ratón por la figura es como se casa una línea con su unidad (#198).
  const nombre = nombreEnElCampo(v.battle, s);
  const caja = cajaDeNombre(v, s, f, ctx.measureText(nombre).width);
  ctx.fillStyle = 'rgba(25,21,9,0.9)';
  ctx.fillRect(caja.x, caja.y, caja.ancho, caja.alto);
  ctx.fillStyle = '#fbe8b5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(nombre, caja.x + caja.ancho / 2, caja.y + 2);
  ctx.restore();
}

function cuerpoDelNombre(v: VistaBatalla): number {
  return Math.max(10, Math.round(v.tablero.paso * 0.16));
}

/** La chapa del nombre, sobre la barra; `anchoTexto` lo mide quien tiene la fuente. */
export function cajaDeNombre(
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
  anchoTexto: number,
): Caja {
  const { x, y } = cabezaDe(v, s, f);
  const cuerpo = cuerpoDelNombre(v);
  const ancho = anchoTexto + 8;
  return { x: x - ancho / 2, y: y - cuerpo - 6, ancho, alto: cuerpo + 4 };
}

function pintarEfecto(ctx: CanvasRenderingContext2D, t: Tablero, e: Efecto): void {
  const alto = t.paso * 0.9;
  ctx.save();
  switch (e.tipo) {
    case 'proyectil': {
      const a = enPantalla(t, e.desde);
      const b = enPantalla(t, e.hasta);
      const x = a.x + (b.x - a.x) * e.t;
      // Un arco: sube y baja sobre la línea recta entre los dos.
      const y = a.y - alto * 0.7 + (b.y - a.y) * e.t - Math.sin(e.t * Math.PI) * t.paso * 0.6;
      const dx = (b.x - a.x) * 0.04;
      const dy = (b.y - a.y) * 0.04;
      ctx.strokeStyle = '#fff1be';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x, y);
      ctx.stroke();
      break;
    }
    case 'hechizo': {
      const p = enPantalla(t, e.en);
      ctx.strokeStyle = '#b5d9ff';
      ctx.shadowColor = '#b5d9ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1 - e.t * 0.6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - alto * 0.5, 14 + e.t * 30, 8 + e.t * 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'danio': {
      const p = enPantalla(t, e.en);
      ctx.globalAlpha = Math.min(1, (1 - e.t) * 3);
      ctx.fillStyle = '#ffe1c2';
      ctx.strokeStyle = '#2a0e06';
      ctx.lineWidth = 3;
      ctx.font = `bold ${Math.max(14, Math.round(t.paso * 0.28))}px Georgia, serif`;
      ctx.textAlign = 'center';
      const y = p.y - alto - e.t * t.paso * 0.45;
      ctx.strokeText(`−${e.cifra}`, p.x, y);
      ctx.fillText(`−${e.cifra}`, p.x, y);
      break;
    }
  }
  ctx.restore();
}
