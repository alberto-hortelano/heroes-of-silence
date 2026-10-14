/**
 * La batalla a 25°: el tablero (filas de 12 y 11) proyectado sobre el suelo y las figuras
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
import { type CasillaDeCarga, isAlive, stackHexes } from '@core/battle/battle.js';
import { allHexes, hexKey, indiceDe } from '@core/battle/board.js';
import { CHARGE_BONUS_PER_HEX } from '@core/battle/damage.js';
import {
  type EstadoDePuerta,
  hayMuralla,
  type MurallaDeBatalla,
  nivelDe,
  type PuertaDeMuralla,
  puertaAbierta,
} from '@core/battle/muralla.js';
import {
  type BattleStack,
  type BattleState,
  rangoDeVeterania,
  type Side,
} from '@core/battle/types.js';
import { hexSize, isShooter, tirosQueQuedan } from '@core/data.js';
import type { Hex, PlayerId } from '@core/types.js';
import { COMPRESION_SUELO } from '../../shared/arte.js';
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
  planoDeHex,
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
  /**
   * Los muros contra los que la activa —tuya— puede poner su escalera o subir
   * (`poner_escalera`, `subir`): se marcan en lo alto de su columna, que es
   * donde se pulsa.
   */
  readonly escalables: ReadonlySet<string>;
  /**
   * Las puertas que la activa —tuya— puede abrir o cerrar con el botón que
   * espera la elección (`puertaPorElegir`): se marca su portada, que es donde se
   * pulsa.
   */
  readonly puertasPorElegir: ReadonlySet<string>;
  /** Unidades sobre las que cae el hechizo elegido. */
  readonly objetivosHechizo: ReadonlySet<string>;
  readonly hoverHex: Hex | null;
  readonly hoverStack: string | null;
  /**
   * Dónde está el puntero en el lienzo, o `null` (el espectador no tiene). Lo
   * lee la columna que se vuelve translúcida: la que el puntero pisa delante de
   * `hoverHex` (`columnasTranslucidas`).
   */
  readonly puntero: Punto | null;
  /** Dónde y cómo está cada figura ahora: lo dice el animador. */
  readonly figura: (s: BattleStack) => EstadoFigura;
  /**
   * Quién actúa en el tablero (aro, nombre y casilla resaltada): lo dice el
   * animador (`BattleAnimator.activo`), que con algo por contar no es el turno
   * del estado sino el de lo que se cuenta.
   */
  readonly activo: string | null;
  /**
   * Los dos que se cruzan en la rueda del golpe mientras está abierta (solo la
   * arena, `EscenaBatalla.enLaRueda`): cada uno lleva un aro de más del color de
   * su bando, que une la figura de la cabecera de la rueda con la del tablero
   * (#261). `null` sin rueda, y siempre en el espectador.
   */
  readonly enLaRueda: { readonly atacante: string; readonly objetivo: string } | null;
  readonly efectos: readonly Efecto[];
  /** Los bandos sin dueño, que se tiñen de gris (`bandosSinDueño`); en la arena, ninguno. */
  readonly sinDueño: ReadonlySet<Side>;
}

/**
 * Los 104 hexes ya trazados, para el tablero de este tamaño. Cada uno eran seis
 * senos y cosenos por fotograma para dibujar siempre lo mismo; ahora se trazan
 * al cambiar el tamaño del lienzo y nada más.
 */
let geometria: { clave: string; hexes: CasillaPintada[] } | null = null;

/** Una casilla del tablero ya trazada, por su índice (`indiceDe`). */
interface CasillaPintada {
  readonly hex: Hex;
  readonly k: string;
  readonly camino: Path2D;
}

function hexesDe(t: Tablero): CasillaPintada[] {
  const clave = `${t.paso}|${t.origenX}|${t.origenY}|${t.compresion}`;
  if (geometria !== null && geometria.clave === clave) return geometria.hexes;
  // En el orden de `allHexes`, que es el de `indiceDe`: la lista se lee por índice.
  const hexes: CasillaPintada[] = allHexes().map((hex) => {
    const camino = new Path2D();
    for (const [i, p] of verticesHex(t, hex).entries()) {
      if (i === 0) camino.moveTo(p.x, p.y);
      else camino.lineTo(p.x, p.y);
    }
    camino.closePath();
    return { hex, k: hexKey(hex), camino };
  });
  geometria = { clave, hexes };
  return hexes;
}

export function drawBatalla(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const { battle, tablero } = v;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  pintarFondo(ctx, v);

  const movibles = new Set(v.movibles.map(hexKey));
  // La figura de cada uno, una vez por fotograma: de ella salen también la
  // casilla y la vida que se ven, que con algo por contar no son las del estado.
  const todas = battle.stacks
    .map((s) => ({ s, f: v.figura(s) }))
    .sort((a, b) => a.f.en.y - b.f.en.y);
  const porId = new Map(todas.map((x) => [x.s.id, x]));
  // Quien actúa, si se le ve en pie: el que cae en la cola aún se ve.
  const enTurno = v.activo === null ? undefined : porId.get(v.activo);
  const activo = enTurno?.f.visible ? enTurno.s : null;
  const hexDeActivo = new Set<string>();
  // Su casilla, la de la figura: mientras anda, ninguna.
  const casillaDelActivo = enTurno?.f.casilla ?? null;
  if (activo !== null && casillaDelActivo !== null) {
    for (const h of stackHexes({ ...activo, hex: casillaDelActivo })) hexDeActivo.add(hexKey(h));
  }
  const hexAtacables = new Set<string>();
  for (const s of battle.stacks) {
    if (!isAlive(s) || !v.atacables.has(s.id)) continue;
    for (const h of stackHexes(s)) hexAtacables.add(hexKey(h));
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

  // 1 · Los hexes, aplastados sobre el suelo. Los de muro van en lo alto de
  // su columna (abajo, con las figuras): pintados aquí, la columna los tapaba.
  const señalado = v.hoverHex === null ? null : hexKey(v.hoverHex);
  const estiloDe = (k: string): EstiloDeCasilla => {
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
      return {
        relleno: fuerte ? '#ffd24acc' : '#ffe08a80',
        ancho: fuerte ? 3 : 2,
        trazo: fuerte ? '#fff4c2' : '#ffe9a8',
      };
    }
    return {
      relleno: deActivo
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
                  : '#00000014',
      ancho: deActivo || cargable ? 2.5 : 1.2,
      trazo: deActivo
        ? '#fbe3a0'
        : cargable
          ? '#ffc070'
          : atacable
            ? '#f39980cc'
            : carga
              ? '#f2c084cc'
              : movible
                ? '#b6e3e9aa'
                : '#f2e6c05c',
    };
  };
  for (const { hex, k, camino } of hexesDe(tablero)) {
    if (nivelDe(battle.muralla, hex) === 1) continue;
    const e = estiloDe(k);
    ctx.fillStyle = e.relleno;
    ctx.fill(camino);
    ctx.lineWidth = e.ancho;
    ctx.strokeStyle = e.trazo;
    ctx.stroke(camino);
  }
  // Y el número de la carga en cada casilla que carga: cuántas casillas cobra.
  if (v.cargas.length > 0) pintarCargas(ctx, tablero, v.cargas, v.angulo);
  // La puerta, en el suelo: su lado, de madera si está cerrada y de piedra si
  // está abierta, encima de las casillas y debajo de todo lo que pisa.
  if (battle.puertas.length > 0) pintarUmbrales(ctx, tablero, battle.puertas);

  // 2 · Los cadáveres del suelo, debajo de todo lo que sigue en pie: se quedan
  // en su casilla hasta el final de la batalla, sin aro, sin barra y sin nombre.
  for (const { s, f } of todas) {
    if (f.caida !== null && f.elevacion === 0) pintarCadaver(ctx, v, s, f);
  }

  // 3 · Lo que se levanta del suelo, de atrás adelante (`piezasEnOrden`).
  const figuras = todas.filter(({ f }) => f.visible);
  const casillas = hexesDe(tablero);
  // La figura de cada uno, la ya pedida al animador: una vez por fotograma.
  const yaPedida = (s: BattleStack): EstadoFigura => (porId.get(s.id) as { f: EstadoFigura }).f;
  const translucidas = columnasTranslucidas(
    tablero,
    battle.muralla,
    v.hoverHex,
    v.angulo?.elegida ?? null,
    v.puntero,
  );
  for (const p of piezasEnOrden(battle, yaPedida)) {
    switch (p.kind) {
      case 'columna': {
        const { k, camino } = casillas[indiceDe(p.hex)] as CasillaPintada;
        ctx.save();
        if (translucidas.has(k)) ctx.globalAlpha = ALFA_DE_LA_TRANSLUCIDA;
        pintarColumna(ctx, tablero, p.hex, camino, estiloDe(k), v.escalables.has(k));
        ctx.restore();
        break;
      }
      case 'portada': {
        const k = claveDePortada(p.puerta);
        ctx.save();
        if (translucidas.has(k)) ctx.globalAlpha = ALFA_DE_LA_TRANSLUCIDA;
        pintarPortada(
          ctx,
          tablero,
          p.puerta,
          puertaAbierta(battle.puertas, p.puerta),
          v.puertasPorElegir.has(k),
        );
        ctx.restore();
        break;
      }
      case 'escalera':
        pintarEscalera(ctx, tablero, p.pie, p.muro);
        break;
      case 'caido': {
        const { s, f } = porId.get(p.id) as { s: BattleStack; f: EstadoFigura };
        pintarCadaver(ctx, v, s, f);
        break;
      }
      case 'figura': {
        const { s, f } = porId.get(p.id) as { s: BattleStack; f: EstadoFigura };
        pintarUnidad(ctx, v, s, f, s.id === activo?.id);
        break;
      }
    }
  }
  // Quien queda detrás de una columna o una portada, entero o en parte, se ve
  // en silueta encima de ella (ampliación 2, (b)): con las columnas cuatro
  // veces más altas, la figura de detrás desaparecía y solo asomaba su barra.
  for (const [id, cubren] of tapadasPorLaMuralla(tablero, battle, yaPedida)) {
    const { s, f } = porId.get(id) as { s: BattleStack; f: EstadoFigura };
    pintarSilueta(ctx, v, s, f, cubren);
  }
  // Y las hojas de una puerta que tapan las columnas de delante, igual: en una
  // línea de norte a sur la puerta queda justo detrás de la columna de la fila
  // siguiente, y abierta o cerrada se veía lo mismo (ampliación 3, criterio 25).
  for (const p of battle.puertas) pintarHojasTapadas(ctx, tablero, battle.muralla, p);
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

/** Lo que se pinta en la pasada ordenada por profundidad (`piezasEnOrden`). */
export type PiezaDelTablero =
  | { readonly kind: 'columna'; readonly hex: Hex }
  | { readonly kind: 'escalera'; readonly pie: Hex; readonly muro: Hex }
  | { readonly kind: 'caido'; readonly id: string }
  | { readonly kind: 'figura'; readonly id: string }
  | { readonly kind: 'portada'; readonly puerta: PuertaDeMuralla };

/**
 * Las columnas de la muralla, las portadas de sus puertas, las escaleras, los
 * caídos en lo alto y las figuras en pie, de atrás adelante: lo de delante tapa
 * lo de detrás. Una figura que pasa detrás de una columna queda tapada por ella,
 * y quien está en lo alto se pinta encima de la suya.
 *
 * A la misma fila: la columna, su escalera, el caído, la figura y, la última, la
 * portada: quien está en una de las dos casillas de la puerta pasa por debajo
 * del arco y el dintel se pinta encima de él (el usuario: «tapar con z index al
 * que pase por debajo, por ejemplo por la puerta»). Los caídos del suelo van antes, en la
 * pasada de las casillas; las barras y los nombres, después de todo esto.
 */
export function piezasEnOrden(
  battle: Pick<BattleState, 'muralla' | 'escaleras' | 'stacks'>,
  figura: (s: BattleStack) => Pick<EstadoFigura, 'en' | 'caida' | 'elevacion' | 'visible'>,
): PiezaDelTablero[] {
  const piezas: {
    readonly y: number;
    readonly orden: number;
    readonly p: PiezaDelTablero;
  }[] = [];
  for (const hex of battle.muralla.muros) {
    piezas.push({
      y: planoDeHex(hex).y,
      orden: 0,
      p: { kind: 'columna', hex },
    });
  }
  for (const e of battle.escaleras) {
    // A la fila de la más adelantada de sus dos casillas, y detrás de su columna:
    // con la fila del pie, la que se apoyaba desde detrás de su muro quedaba
    // tapada por la propia columna (QA de la muralla alta, M2).
    piezas.push({
      y: Math.max(planoDeHex(e.pie).y, planoDeHex(e.muro).y),
      orden: 1,
      p: { kind: 'escalera', pie: e.pie, muro: e.muro },
    });
  }
  for (const s of battle.stacks) {
    const f = figura(s);
    if (f.caida !== null && f.elevacion > 0) {
      piezas.push({ y: f.en.y, orden: 2, p: { kind: 'caido', id: s.id } });
    }
    if (f.visible) {
      piezas.push({ y: f.en.y, orden: 3, p: { kind: 'figura', id: s.id } });
    }
  }
  for (const puerta of battle.muralla.puertas) {
    piezas.push({
      y: planoDeHex(puerta.a).y,
      orden: 4,
      p: { kind: 'portada', puerta },
    });
  }
  piezas.sort((a, b) => a.y - b.y || a.orden - b.orden);
  return piezas.map((x) => x.p);
}

/** Un punto del lienzo, en píxeles. */
export interface Punto {
  readonly x: number;
  readonly y: number;
}

/**
 * Lo que tapa en pantalla la columna de `h`: el hex de su pie y el de su tapa, y
 * lo de en medio. Como sube en vertical, es un hexágono convexo: la punta y los
 * dos vértices de arriba de la tapa, y los tres de abajo del pie.
 */
export function siluetaDeColumna(t: Tablero, h: Hex): Punto[] {
  const v = verticesHex(t, h) as Punto[];
  const alto = alturaDeColumna(t);
  const arriba = (p: Punto): Punto => ({ x: p.x, y: p.y - alto });
  return [arriba(v[0]!), arriba(v[1]!), v[2]!, v[3]!, v[4]!, arriba(v[5]!)];
}

/**
 * La portada de una puerta, en pasos: una fachada de cara a la cámara levantada
 * sobre el lado de sus dos casillas, centrada en él, con el arco tan ancho que
 * quien está en cualquiera de las dos pasa entero por debajo (su figura mide
 * unos 0,8 de ancho y su centro cae a 0,5 del lado). Las jambas acaban antes de
 * la figura de la casilla siguiente (a 1,5 del lado, desde 1,1).
 */
const PORTADA = {
  /** Del lado a la cara de fuera de cada jamba. */
  mitad: 1.03,
  /** Del lado al borde del hueco. */
  hueco: 0.88,
  /** Lo alto del hueco, del suelo a la clave del arco: pasa la figura de una casilla (0,95). */
  arco: 1.2,
  /** Lo que baja el arco de la clave a sus arranques. */
  flecha: 0.22,
  /** El fondo de la fachada visto desde arriba: la tapa. */
  fondo: 0.3,
} as const;

/** El pie del lado de la puerta, en el lienzo: el punto del suelo entre sus dos centros. */
function pieDePortada(t: Tablero, p: PuertaDeMuralla): Punto {
  const a = centroHex(t, p.a);
  const b = centroHex(t, p.b);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Lo que tapa en pantalla la portada de `p`: la fachada del suelo a su tapa. Se
 * cuenta entera, con su arco: por él se ve poco, y una figura de detrás no queda
 * a la vista por el hueco.
 */
export function siluetaDePortada(t: Tablero, p: PuertaDeMuralla): Punto[] {
  const c = pieDePortada(t, p);
  const x0 = c.x - PORTADA.mitad * t.paso;
  const x1 = c.x + PORTADA.mitad * t.paso;
  const arriba = c.y - alturaDeColumna(t) - PORTADA.fondo * t.paso * t.compresion;
  return [
    { x: x0, y: arriba },
    { x: x1, y: arriba },
    { x: x1, y: c.y },
    { x: x0, y: c.y },
  ];
}

/** La clave de una portada en los conjuntos del lienzo (translúcidas, por elegir). */
export function claveDePortada(p: PuertaDeMuralla): string {
  return `puerta ${hexKey(p.a)}|${hexKey(p.b)}`;
}

/**
 * Lo alto de la muralla que tapa lo de detrás: cada columna (por su hex, clave
 * `hexKey`) y cada portada (`claveDePortada`), con su fila y su silueta.
 */
interface PiezaAlta {
  readonly clave: string;
  readonly y: number;
  readonly silueta: Punto[];
}

function piezasAltas(t: Tablero, m: MurallaDeBatalla): PiezaAlta[] {
  return [
    ...m.muros.map((h) => ({
      clave: hexKey(h),
      y: planoDeHex(h).y,
      silueta: siluetaDeColumna(t, h),
    })),
    ...m.puertas.map((p) => ({
      clave: claveDePortada(p),
      y: planoDeHex(p.a).y,
      silueta: siluetaDePortada(t, p),
    })),
  ];
}

/** ¿Cae `p` dentro del polígono convexo `poli` (en cualquier sentido de giro)? */
function dentroDelConvexo(p: Punto, poli: readonly Punto[]): boolean {
  let signo = 0;
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i] as Punto;
    const b = poli[(i + 1) % poli.length] as Punto;
    const cruz = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cruz === 0) continue;
    if (signo === 0) signo = Math.sign(cruz);
    else if (Math.sign(cruz) !== signo) return false;
  }
  return true;
}

/**
 * Las columnas y portadas que se pintan delante de la casilla del suelo
 * `casilla` y le tapan algo: su centro, un punto a 0,6 de cada vértice o
 * cualquiera de `puntos` (el puntero). Delante es más abajo en el plano
 * (`piezasEnOrden`): las de su fila o de detrás no le caen encima. Por su clave:
 * `hexKey` la columna, `claveDePortada` la portada.
 */
export function columnasQueTapan(
  t: Tablero,
  m: MurallaDeBatalla,
  casilla: Hex,
  puntos: readonly Punto[] = [],
): string[] {
  const y = planoDeHex(casilla).y;
  const c = centroHex(t, casilla);
  const muestras = [
    c,
    ...verticesHex(t, casilla).map((v) => ({
      x: c.x + (v.x - c.x) * 0.6,
      y: c.y + (v.y - c.y) * 0.6,
    })),
    ...puntos,
  ];
  return piezasAltas(t, m)
    .filter((p) => p.y > y && muestras.some((q) => dentroDelConvexo(q, p.silueta)))
    .map((p) => p.clave);
}

/**
 * La puerta cuya portada —entera, del pie a lo alto— cae bajo `p`, o `null`. Si
 * caen dos, la de delante, que es la que se ve. Es el clic que elige puerta
 * (`puertaPorElegir`), como lo alto de una columna elige el muro de la escala.
 */
export function portadaBajo(t: Tablero, m: MurallaDeBatalla, p: Punto): PuertaDeMuralla | null {
  let mejor: PuertaDeMuralla | null = null;
  for (const q of m.puertas) {
    if (!dentroDelConvexo(p, siluetaDePortada(t, q))) continue;
    if (mejor === null || planoDeHex(q.a).y > planoDeHex(mejor.a).y) mejor = q;
  }
  return mejor;
}

/** Lo que se deja ver de una columna translúcida. */
const ALFA_DE_LA_TRANSLUCIDA = 0.3;

/**
 * Las columnas y portadas que se pintan translúcidas (ampliación 2, (a)): las
 * que tapan la casilla del suelo bajo el puntero (`hoverHex`, con el propio
 * puntero) y la casilla elegida del ángulo de un golpe. La casilla bajo el
 * puntero ya es la del suelo cuando el puntero pisa la cara de una columna
 * (`hexBajo` mira solo su tapa), así que lo que se ve a través es lo que pulsa
 * el clic. Un muro bajo el puntero —su tapa— no vuelve a nadie translúcido: es
 * lo que se señala.
 */
export function columnasTranslucidas(
  t: Tablero,
  m: MurallaDeBatalla,
  hoverHex: Hex | null,
  elegida: Hex | null,
  puntero: Punto | null,
): ReadonlySet<string> {
  const fuera = new Set<string>();
  if (!hayMuralla(m)) return fuera;
  const mirar = (h: Hex | null, puntos: readonly Punto[]): void => {
    if (h === null || nivelDe(m, h) === 1) return;
    for (const c of columnasQueTapan(t, m, h, puntos)) fuera.add(c);
  };
  mirar(hoverHex, puntero === null ? [] : [puntero]);
  mirar(elegida, []);
  return fuera;
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
    const c = cajaDeFigura(t, s, f.en, f.elevacion);
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

/**
 * ¿Se solapan dos polígonos convexos? Separación por ejes: si en la normal de
 * algún lado sus sombras no se pisan, no se tocan. Tocarse en un borde no cuenta.
 */
function convexosSeTocan(a: readonly Punto[], b: readonly Punto[]): boolean {
  for (const poli of [a, b]) {
    for (let i = 0; i < poli.length; i++) {
      const p = poli[i] as Punto;
      const q = poli[(i + 1) % poli.length] as Punto;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const sombra = (ps: readonly Punto[]): [number, number] => {
        let min = Infinity;
        let max = -Infinity;
        for (const r of ps) {
          const d = r.x * nx + r.y * ny;
          min = Math.min(min, d);
          max = Math.max(max, d);
        }
        return [min, max];
      };
      const [amin, amax] = sombra(a);
      const [bmin, bmax] = sombra(b);
      if (amax <= bmin || bmax <= amin) return false;
    }
  }
  return true;
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
function pintarSilueta(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
  cubren: readonly Tapa[],
): void {
  const caja = cajaDeFigura(v.tablero, s, f.en, f.elevacion);
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

/** Cómo se pinta una casilla: relleno, ancho y color del borde. */
interface EstiloDeCasilla {
  readonly relleno: string;
  readonly ancho: number;
  readonly trazo: string;
}

/**
 * Lo que mide una columna de la muralla, en pasos: la figura que está arriba se
 * pinta así de alta. Era 0,42 —algo menos de media figura, para que la de detrás
 * asomara la cabeza— y el usuario, al probarlo, la quiso «unas 4 veces más»
 * alta: la muralla tapa de verdad a quien pasa detrás (`piezasEnOrden`) y lo que
 * no cabe encima de la fila de atrás lo pide el lienzo (`alzadoDeLaMuralla`).
 */
export const ALTO_DE_MURALLA = 4 * 0.42;

/**
 * Los pasos que el tablero pide de más encima de su fila de atrás para que lo
 * alto de la muralla —la columna, la portada y la figura de encima— no se salga
 * del lienzo (`tableroPara`, `altoConAlzado`). Cada pieza pide lo que su
 * columna sube por encima de la fila de atrás, con la cámara más baja, que es
 * donde las filas están más juntas. Sin muralla, 0: el encuadre de siempre.
 */
export function alzadoDeLaMuralla(m: MurallaDeBatalla): number {
  let alzado = 0;
  const alto = ALTO_DE_MURALLA + PORTADA.fondo * COMPRESION_SUELO;
  for (const h of m.muros) {
    alzado = Math.max(alzado, ALTO_DE_MURALLA - planoDeHex(h).y * COMPRESION_SUELO);
  }
  for (const p of m.puertas) {
    alzado = Math.max(alzado, alto - planoDeHex(p.a).y * COMPRESION_SUELO);
  }
  return alzado;
}

/** Lo que sube en pantalla quien está en lo alto (elevación 1), en píxeles. */
export function alturaDeColumna(t: Tablero): number {
  return t.paso * ALTO_DE_MURALLA;
}

/**
 * El tablero de lo que está a `elevacion` (0 en el suelo, 1 en lo alto de un
 * muro, y lo de en medio al subir): el mismo, subido `alturaDeColumna`. LA
 * forma de subir en pantalla: la leen la figura (`cajaDeFigura`), los efectos y
 * el clic sobre las columnas (`escenas/batalla.ts`).
 */
export function tableroA(t: Tablero, elevacion: number): Tablero {
  return elevacion === 0 ? t : { ...t, origenY: t.origenY - elevacion * alturaDeColumna(t) };
}

/** Piedra de la columna: la cara de la luz (este), la de la sombra y lo alto. */
const PIEDRA = {
  luz: '#9b958a',
  sombra: '#706b62',
  arriba: '#aaa498',
  junta: '#55514a',
  borde: '#2f2c28',
} as const;

/**
 * El lado de cada puerta en el suelo, entre sus dos casillas: cerrada, un
 * tablón oscuro de madera de vértice a vértice; abierta, el umbral de piedra
 * clara. Las dos casillas se pintan como cualquier suelo (se pisan las dos); esto
 * dice por dónde va la puerta aunque la tape su portada.
 */
function pintarUmbrales(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  puertas: readonly EstadoDePuerta[],
): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of puertas) {
    // El lado este de `a`: sus vértices 1 (arriba a la derecha) y 2 (abajo a la derecha).
    const v = verticesHex(t, p.a);
    const arriba = v[1] as Punto;
    const abajo = v[2] as Punto;
    for (const [color, grueso] of p.abierta
      ? ([
          ['#4a443b', 0.16],
          ['#b9ad96', 0.1],
        ] as const)
      : ([
          ['#2a160a', 0.2],
          ['#7a4a22', 0.13],
        ] as const)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, t.paso * grueso);
      ctx.beginPath();
      ctx.moveTo(arriba.x, arriba.y);
      ctx.lineTo(abajo.x, abajo.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Un muro, como columna: el hex subido `alturaDeColumna` es lo alto, donde se
 * pisa —y donde se pinta la marca de la casilla (`estilo`): movible, atacable,
 * la de la activa—, y las dos caras de delante, de piedra con hiladas. Las de
 * los lados del hexágono van de canto a esta cámara y no se ven. Lo alto es el
 * `camino` de su casilla en el suelo (`hexesDe`), trasladado.
 * `escalable`, si la activa puede poner su escalera o subir ahí.
 */
function pintarColumna(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  h: Hex,
  camino: Path2D,
  estilo: EstiloDeCasilla,
  escalable: boolean,
): void {
  const alto = alturaDeColumna(t);
  // Punta arriba y en el sentido de las agujas: 0 arriba, 2 abajo a la derecha,
  // 3 abajo, 4 abajo a la izquierda.
  const v = verticesHex(t, h);
  ctx.save();
  ctx.lineJoin = 'round';
  for (const [i, j, color] of [
    [3, 4, PIEDRA.sombra],
    [2, 3, PIEDRA.luz],
  ] as const) {
    const a = v[i] as { x: number; y: number };
    const b = v[j] as { x: number; y: number };
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y - alto);
    ctx.lineTo(a.x, a.y - alto);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    pintarSillares(ctx, t, a, b, alto);
  }
  ctx.translate(0, -alto);
  const tapa = camino;
  ctx.fillStyle = PIEDRA.arriba;
  ctx.fill(tapa);
  ctx.lineWidth = Math.max(2, t.paso * 0.045);
  ctx.strokeStyle = PIEDRA.borde;
  ctx.stroke(tapa);
  // La marca de la casilla, encima de la piedra: lo que el suelo diría de ella.
  ctx.fillStyle = estilo.relleno;
  ctx.fill(tapa);
  ctx.lineWidth = estilo.ancho;
  ctx.strokeStyle = estilo.trazo;
  ctx.stroke(tapa);
  if (escalable) {
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd24a';
    ctx.stroke(tapa);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * Las hiladas de una cara de piedra de `a` a `b` (sus pies) y `alto` de alto: una
 * cada `HILADA` pasos, con las juntas verticales a tresbolillo, y el borde.
 */
function pintarSillares(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
  alto: number,
): void {
  const hiladas = Math.max(2, Math.round(alto / (t.paso * HILADA)));
  ctx.strokeStyle = PIEDRA.junta;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.beginPath();
  for (let i = 1; i < hiladas; i++) {
    const f = i / hiladas;
    ctx.moveTo(a.x, a.y - alto * f);
    ctx.lineTo(b.x, b.y - alto * f);
  }
  for (let i = 0; i < hiladas; i++) {
    const g = i % 2 === 0 ? 0.5 : 0.25;
    for (const u of g === 0.5 ? [0.5] : [0.25, 0.75]) {
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      ctx.moveTo(x, y - (alto * i) / hiladas);
      ctx.lineTo(x, y - (alto * (i + 1)) / hiladas);
    }
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y - alto);
  ctx.lineTo(a.x, a.y - alto);
  ctx.closePath();
  ctx.strokeStyle = PIEDRA.borde;
  ctx.lineWidth = Math.max(1.5, t.paso * 0.03);
  ctx.stroke();
}

/** Lo que mide una hilada de sillares, en pasos. */
const HILADA = 0.28;

/**
 * La portada de una puerta: una fachada de piedra de cara a la cámara, tan alta
 * como la muralla, levantada sobre el lado de sus dos casillas (`PORTADA`), con
 * un arco ancho abajo por el que pasa quien está en cualquiera de las dos.
 * **Cerrada**, en medio del arco, sobre el lado, las dos hojas juntas: un
 * tablero de madera con herrajes, de canto a esta cámara, que se lee como
 * «aquí no se pasa». **Abierta**, el medio queda libre y las hojas, abatidas,
 * asoman contra las jambas. Se pinta después de quien está en su fila
 * (`piezasEnOrden`): jambas y dintel le pasan por delante. Por arriba no se
 * anda. `elegible`, si el botón de la puerta espera que se elija esta: se marca
 * el arco.
 */
function pintarPortada(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  p: PuertaDeMuralla,
  abierta: boolean,
  elegible: boolean,
): void {
  const alto = alturaDeColumna(t);
  const c = pieDePortada(t, p);
  const x0 = c.x - PORTADA.mitad * t.paso;
  const x1 = c.x + PORTADA.mitad * t.paso;
  const izq = c.x - PORTADA.hueco * t.paso;
  const der = c.x + PORTADA.hueco * t.paso;
  const clave = c.y - PORTADA.arco * t.paso;
  const arranque = clave + PORTADA.flecha * t.paso;
  const hueco = new Path2D();
  hueco.moveTo(izq, c.y);
  hueco.lineTo(izq, arranque);
  hueco.ellipse(c.x, arranque, der - c.x, arranque - clave, 0, Math.PI, 0);
  hueco.lineTo(der, c.y);
  hueco.closePath();
  const arriba = c.y - alto;
  const fondo = PORTADA.fondo * t.paso * t.compresion;
  ctx.save();
  ctx.lineJoin = 'round';
  // La fachada, menos el hueco: piedra con hiladas, como las columnas.
  const fachada = new Path2D();
  fachada.rect(x0, arriba, x1 - x0, alto);
  fachada.addPath(hueco);
  ctx.save();
  ctx.clip(fachada, 'evenodd');
  ctx.fillStyle = PIEDRA.luz;
  ctx.fillRect(x0, arriba, x1 - x0, alto);
  // La jamba de la izquierda, en sombra: da volumen sin pintar caras de lado.
  ctx.fillStyle = PIEDRA.sombra;
  ctx.fillRect(x0, arriba, izq - x0, alto);
  pintarSillares(ctx, t, { x: x0, y: c.y }, { x: x1, y: c.y }, alto);
  ctx.restore();
  if (abierta) pintarHojasAbiertas(ctx, t, p);
  else pintarHojasCerradas(ctx, t, c.x, clave, c.y);
  // La rosca del arco, en madera oscura como la puerta: se lee como un paso.
  ctx.lineWidth = Math.max(2.5, t.paso * 0.05);
  ctx.strokeStyle = '#2a160a';
  ctx.stroke(hueco);
  // La tapa: el fondo de la fachada visto desde arriba. Ahí no se pisa.
  ctx.beginPath();
  ctx.rect(x0, arriba - fondo, x1 - x0, fondo);
  ctx.fillStyle = PIEDRA.arriba;
  ctx.fill();
  ctx.lineWidth = Math.max(2, t.paso * 0.045);
  ctx.strokeStyle = PIEDRA.borde;
  ctx.stroke();
  ctx.strokeRect(x0, arriba, x1 - x0, alto);
  if (elegible) {
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd24a';
    ctx.stroke(hueco);
    ctx.strokeRect(x0, arriba - fondo, x1 - x0, alto + fondo);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * El contorno de las hojas de la puerta `p` —el tablero cerrado en medio del
 * arco, o las dos hojas abiertas contra las jambas— en el lienzo: lo que pintan
 * `pintarHojasCerradas` y `pintarHojasAbiertas`, como un trazo.
 */
function formaDeLasHojas(t: Tablero, p: PuertaDeMuralla, abierta: boolean): Path2D {
  const c = pieDePortada(t, p);
  const clave = c.y - PORTADA.arco * t.paso;
  const forma = new Path2D();
  if (!abierta) {
    const ancho = ANCHO_DE_LAS_HOJAS * t.paso;
    const arriba = clave + t.paso * 0.04;
    forma.rect(c.x - ancho / 2, arriba, ancho, c.y - arriba);
    return forma;
  }
  const arranque = clave + PORTADA.flecha * t.paso;
  const grueso = t.paso * 0.1;
  const izq = c.x - PORTADA.hueco * t.paso;
  const der = c.x + PORTADA.hueco * t.paso;
  for (const [x0, x1] of [
    [izq, izq + grueso],
    [der - grueso, der],
  ] as const) {
    forma.moveTo(x0, c.y);
    forma.lineTo(x0, arranque);
    forma.lineTo(x1, arranque + grueso * 0.6);
    forma.lineTo(x1, c.y);
    forma.closePath();
  }
  return forma;
}

/**
 * Las hojas de la puerta `p` por encima de las columnas que se pintan delante
 * de su portada y las tapan, en contorno, como la silueta de una figura: solo
 * donde esas columnas tapan. Sin ninguna delante, nada.
 */
function pintarHojasTapadas(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  m: MurallaDeBatalla,
  p: EstadoDePuerta,
): void {
  const y = planoDeHex(p.a).y;
  const portada = siluetaDePortada(t, p);
  const delante = m.muros.filter(
    (h) => planoDeHex(h).y > y && convexosSeTocan(portada, siluetaDeColumna(t, h)),
  );
  if (delante.length === 0) return;
  const recorte = new Path2D();
  for (const h of delante) {
    const [primero, ...resto] = siluetaDeColumna(t, h);
    recorte.moveTo((primero as Punto).x, (primero as Punto).y);
    for (const q of resto) recorte.lineTo(q.x, q.y);
    recorte.closePath();
  }
  const forma = formaDeLasHojas(t, p, p.abierta);
  ctx.save();
  ctx.clip(recorte);
  ctx.fillStyle = HOJA.tapada;
  ctx.fill(forma);
  ctx.lineWidth = Math.max(2, t.paso * 0.03);
  ctx.strokeStyle = HOJA.contorno;
  ctx.stroke(forma);
  ctx.restore();
}

/** La madera de las hojas de la puerta y sus herrajes. */
const HOJA = {
  madera: '#7a4a22',
  tabla: '#4a2a12',
  hierro: '#26231f',
  canto: '#5a3418',
  /** Las hojas tapadas por una columna (`pintarHojasTapadas`): relleno y trazo. */
  tapada: 'rgba(122, 74, 34, 0.45)',
  contorno: '#e8b070',
} as const;

/** Lo ancho del tablero de las hojas cerradas, en pasos: más que su grueso, para que se lea. */
const ANCHO_DE_LAS_HOJAS = 0.26;

/**
 * Las dos hojas cerradas, en medio del arco y sobre el lado de la puerta: un
 * tablero de madera del suelo a la clave, con su junta, sus tablas y dos bandas
 * de hierro con clavos.
 */
function pintarHojasCerradas(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  medio: number,
  clave: number,
  suelo: number,
): void {
  const ancho = ANCHO_DE_LAS_HOJAS * t.paso;
  const x0 = medio - ancho / 2;
  const arriba = clave + t.paso * 0.04;
  ctx.save();
  ctx.fillStyle = HOJA.madera;
  ctx.fillRect(x0, arriba, ancho, suelo - arriba);
  ctx.strokeStyle = HOJA.tabla;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.beginPath();
  for (const f of [0.25, 0.75]) {
    ctx.moveTo(x0 + ancho * f, arriba);
    ctx.lineTo(x0 + ancho * f, suelo);
  }
  ctx.stroke();
  ctx.strokeStyle = HOJA.hierro;
  ctx.lineWidth = Math.max(2, t.paso * 0.04);
  ctx.beginPath();
  ctx.moveTo(medio, arriba);
  ctx.lineTo(medio, suelo);
  for (const f of [0.25, 0.7]) {
    const y = arriba + (suelo - arriba) * f;
    ctx.moveTo(x0 - t.paso * 0.03, y);
    ctx.lineTo(x0 + ancho + t.paso * 0.03, y);
  }
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, t.paso * 0.025);
  ctx.strokeRect(x0, arriba, ancho, suelo - arriba);
  ctx.restore();
}

/**
 * Las dos hojas abiertas: abatidas contra las jambas, una tira de madera oscura
 * a cada lado del hueco, del suelo al arranque del arco (`formaDeLasHojas`). El
 * medio, libre.
 */
function pintarHojasAbiertas(ctx: CanvasRenderingContext2D, t: Tablero, p: PuertaDeMuralla): void {
  const forma = formaDeLasHojas(t, p, true);
  ctx.save();
  ctx.fillStyle = HOJA.canto;
  ctx.fill(forma);
  ctx.strokeStyle = HOJA.hierro;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.stroke(forma);
  ctx.restore();
}

/**
 * La escalera puesta, sin arte: dos largueros de madera del pie (en el suelo,
 * junto a la base de la columna) hasta pasado el borde de lo alto, y sus
 * peldaños. Se queda puesta toda la batalla. Sale ancha y gruesa a propósito:
 * de 0,09 pasos y apoyada a un tercio del pie, la tapaba la figura que esperaba
 * en él y no se leía (QA, M2).
 */
function pintarEscalera(ctx: CanvasRenderingContext2D, t: Tablero, pie: Hex, muro: Hex): void {
  const p = centroHex(t, pie);
  const m = centroHex(t, muro);
  const abajo = { x: p.x + (m.x - p.x) * 0.48, y: p.y + (m.y - p.y) * 0.48 };
  const arriba = {
    x: m.x + (p.x - m.x) * 0.3,
    y: m.y + (p.y - m.y) * 0.3 - alturaDeColumna(t) * 1.15,
  };
  const dx = arriba.x - abajo.x;
  const dy = arriba.y - abajo.y;
  const largo = Math.max(1, Math.hypot(dx, dy));
  const ancho = t.paso * 0.15;
  const nx = (-dy / largo) * ancho;
  const ny = (dx / largo) * ancho;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, grueso] of [
    ['#2a160a', Math.max(4, t.paso * 0.075)],
    ['#d39a52', Math.max(2, t.paso * 0.042)],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = grueso;
    ctx.beginPath();
    for (const lado of [-1, 1]) {
      ctx.moveTo(abajo.x + nx * lado, abajo.y + ny * lado);
      ctx.lineTo(arriba.x + nx * lado, arriba.y + ny * lado);
    }
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      const x = abajo.x + dx * f;
      const y = abajo.y + dy * f;
      ctx.moveTo(x - nx, y - ny);
      ctx.lineTo(x + nx, y + ny);
    }
    ctx.stroke();
  }
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
export function cajaDeFigura(t: Tablero, s: BattleStack, en: Plano, elevacion = 0): CajaDeFigura {
  // En lo alto de una columna los pies van en su tapa: subidos lo que ella mide.
  const c = cajaDeFiguraEn(tableroA(t, elevacion), en, hexSize(s.unit) > 1);
  return { ...c, suelo: c.suelo + t.paso * 0.24 * t.compresion };
}

/** Una figura en pantalla: el centro de sus pies, el suelo, su alto y su ancho, en píxeles. */
export interface CajaDeFigura {
  readonly x: number;
  readonly suelo: number;
  readonly alto: number;
  readonly ancho: number;
}

/**
 * La caja de una figura de pie con los pies en `en`, sin el desplazamiento
 * dentro de su hex que lleva la del combate (`cajaDeFigura`): la de la base
 * caminable, que no tiene hexes, y la que hay debajo de la del combate. Así un
 * adulto mide lo mismo en los dos.
 */
export function cajaDeFiguraEn(t: Tablero, en: Plano, grande = false): CajaDeFigura {
  const p = enPantalla(t, en);
  const alto = t.paso * ALTO_DE_FIGURA[grande ? 'grande' : 'normal'];
  return { x: p.x, suelo: p.y, alto, ancho: alto * (grande ? 0.9 : 0.42) };
}

/** Lo que se cuenta por debajo del suelo como pulsar la figura, en píxeles: la sombra de los pies. */
const BAJO_LOS_PIES = 4;

/** Si un píxel cae en el cuerpo de una figura: lo leen el clic de la batalla y el de la base. */
export function dentroDeLaFigura(c: CajaDeFigura, px: number, py: number): boolean {
  return (
    Math.abs(px - c.x) <= c.ancho / 2 && py <= c.suelo + BAJO_LOS_PIES && py >= c.suelo - c.alto
  );
}

/**
 * El fondo compuesto una vez por tamaño de lienzo: el campo escalado y su
 * velo. Escalar la imagen entera del campo con suavizado era, con el mapa ya
 * cacheado, lo más caro de un fotograma de batalla, y no cambia mientras el
 * lienzo no cambie de tamaño.
 */
let fondo: {
  clave: string;
  campo: HTMLImageElement | null;
  lienzo: HTMLCanvasElement;
} | null = null;

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
  const caja = cajaDeFigura(v.tablero, s, f.en, f.elevacion);
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

function pintarUnidad(
  ctx: CanvasRenderingContext2D,
  v: VistaBatalla,
  s: BattleStack,
  f: EstadoFigura,
  activa: boolean,
): void {
  const paso = v.tablero.paso;
  const grande = hexSize(s.unit) > 1;
  const caja = cajaDeFigura(v.tablero, s, f.en, f.elevacion);
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
  if (v.enLaRueda !== null && (v.enLaRueda.atacante === s.id || v.enLaRueda.objetivo === s.id)) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, suelo, rx * ARO_DE_LA_RUEDA, ry * ARO_DE_LA_RUEDA, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
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

/**
 * Lo que va encima de la cabeza: dónde, y de qué ancho es la barra. Exportada
 * para `pnpm capturas`, que mira en el lienzo la barra de vida que se pinta.
 */
export function cabezaDe(
  v: Pick<VistaBatalla, 'tablero'>,
  s: BattleStack,
  f: Pick<EstadoFigura, 'en' | 'elevacion'>,
) {
  const caja = cajaDeFigura(v.tablero, s, f.en, f.elevacion);
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
  // La vida que se ve (`EstadoFigura.pv`), no la del estado: con la cola llena,
  // la del estado es la de después de todo lo que aún no se ha enseñado.
  const vida = Math.max(0, Math.min(1, f.pv / Math.max(1, s.unit.hp * s.initialCount)));
  ctx.save();
  ctx.globalAlpha = f.alfaDelAro;
  ctx.fillStyle = 'rgba(12,10,6,0.85)';
  ctx.fillRect(x - anchoBarra / 2 - 1, y - 1, anchoBarra + 2, 6);
  ctx.fillStyle = vida > 0.5 ? '#9fc49a' : vida > 0.25 ? '#e0c060' : '#e3735a';
  ctx.fillRect(x - anchoBarra / 2, y, anchoBarra * vida, 4);
  // Los tiros que quedan, solo de quien los cuenta (la criatura del catálogo): el
  // arma a distancia de la arena no lleva munición.
  const tiros = tirosQueQuedan(s);
  if (tiros !== null && tiros > 0) {
    ctx.fillStyle = '#9fc49a';
    ctx.font = `bold ${Math.max(9, Math.round(v.tablero.paso * 0.14))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`↑${tiros}`, x + anchoBarra / 2 + 3, y + 2);
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
      const a = enPantalla(tableroA(t, e.altoDesde), e.desde);
      const b = enPantalla(tableroA(t, e.altoHasta), e.hasta);
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
      const p = enPantalla(tableroA(t, e.alto), e.en);
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
      const p = enPantalla(tableroA(t, e.alto), e.en);
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
