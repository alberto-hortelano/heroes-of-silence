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
 * cae el hechizo llegan hechos de `ControlDeBatalla` (`sesion/batalla/control.ts`), la
 * pieza que comparten la sesión de la partida y la de la arena; dónde está cada figura
 * en este instante, del animador.
 *
 * Era `render/batalla.ts` hasta la fase C de la reorganización (07-11-2026). Aquí queda
 * el tablero (`drawBatalla`, con lo que pinta: `VistaBatalla`); lo que pinta en él vive
 * al lado, en `render/batalla/`: los bandos, las casillas, los disparos y las granadas,
 * la muralla (lo que tapa y cómo se pinta), las figuras, el fondo y los efectos. La caja
 * de una figura de pie, en `render/figuras/caja.ts`.
 */
import type { ExplosionDeLaGranada, LineaDelDisparo } from '@core/battle/a-distancia.js';
import { hexKey, indiceDe } from '@core/battle/board.js';
import { type CasillaDeCarga, isAlive, stackHexes } from '@core/battle/consultas.js';
import { hayMuralla, nivelDe, puertaAbierta } from '@core/battle/muralla.js';
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import type { ClimaDelSitio } from '@core/state/clima.js';
import type { Hex } from '@core/types.js';
import type { Efecto, EstadoFigura } from '../../batalla/anim.js';
import { temaDelLienzo } from '../../comun/temas.js';
import {
  campoDeEscena,
  pintarAireDelClima,
  pintarSueloDelClima,
  sinElVelo,
} from '../clima/clima.js';
import { centroHex, type Tablero } from '../proyeccion.js';
import { caraDe, pedirElArteDe } from './arte-de-la-muralla.js';
import { type CasillaPintada, type EstiloDeCasilla, hexesDe } from './casillas.js';
import { pintarDisparos, pintarGranadas } from './disparos.js';
import { pintarEfecto } from './efectos.js';
import {
  pintarCadaver,
  pintarCorona,
  pintarNombre,
  pintarSilueta,
  pintarSobreLaCabeza,
  pintarUnidad,
  tapadasPorLaMuralla,
} from './figura.js';
import { horizonteDelCampo, pintarFondo } from './fondo.js';
import {
  claveDePortada,
  columnasTranslucidas,
  type Punto,
  piezasEnOrden,
  siluetaDeColumna,
  siluetaDePortada,
} from './muralla.js';
import {
  ACABADO_DEL_MURO,
  type ArteDelMuro,
  type ATrasluz,
  aTrasluz,
  pintarColumna,
  pintarEscalera,
  pintarPortada,
  pintarPortadaATrasluz,
  pintarUmbrales,
  siluetaDeEscalera,
} from './muralla-pintada.js';

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
  /**
   * El clima del sitio de la batalla y el reloj con que se anima: el cielo de
   * detrás, el velo y la niebla bajo las casillas, y la lluvia y el rayo encima
   * de las figuras y debajo de las barras.
   */
  readonly clima: { readonly sitio: ClimaDelSitio; readonly ahora: number };
  /**
   * La recta que se tantea con el puntero antes de apuntar (la unidad activa, tuya,
   * que puede apuntar: `lineaDelDisparo` a la casilla señalada), o `null`. Las de los
   * disparos ya apuntados las saca el tablero de cada stack (`BattleStack.apuntado`),
   * para los dos bandos y en el espectador.
   */
  readonly tanteo: LineaDelDisparo | null;
  /**
   * Lo apuntado de cada tirador que se pinta, al ritmo de lo que se cuenta
   * (`BattleAnimator.apuntados`): la marca se queda hasta el impacto de su disparo,
   * aunque el estado ya lo haya disparado.
   */
  readonly apuntados: ReadonlyMap<string, Hex>;
  /**
   * La granada en el aire de cada uno que la lanzó, al ritmo de lo que se cuenta
   * (`BattleAnimator.granadas`): la diana se queda hasta que explota.
   */
  readonly granadas: ReadonlyMap<string, Hex>;
  /**
   * La explosión que se tantea con el puntero antes de lanzar (la unidad activa, tuya,
   * con granada: `explosionDe` en la casilla señalada), o `null`.
   */
  readonly granadaTanteada: ExplosionDeLaGranada | null;
}

export function drawBatalla(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const { battle, tablero } = v;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const horizonte = horizonteDelCampo(v.tablero);
  pintarFondo(ctx, { ancho: v.ancho, alto: v.alto, horizonte, clima: v.clima.sitio });
  // El clima de abajo, detrás de las casillas y de las figuras, que se siguen
  // leyendo enteras: la luz y la bruma, que no se mueven, van horneadas en el
  // fondo (`pintarFondo`); por fotograma, solo los bancos de niebla.
  const climaDelCampo = sinElVelo(
    campoDeEscena(v.clima.sitio, { ancho: v.ancho, alto: v.alto, cielo: horizonte }),
  );
  const marcoDelClima = { ancho: v.ancho, alto: v.alto, ahora: v.clima.ahora };
  pintarSueloDelClima(ctx, climaDelCampo, marcoDelClima);

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
  // Los disparos apuntados de los dos bandos (se ven para los dos: se puede
  // apartar o tapar con un aliado) y el que se tantea, en el suelo.
  pintarDisparos(ctx, v);
  // Y las granadas: en el aire, de los dos bandos, y la que se tantea.
  pintarGranadas(ctx, v);
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
  // Cómo se pinta su muralla, una vez: la columna y la portada lo reciben. Con
  // su arte, si ha llegado (se pide con la primera batalla que la lleva); sin
  // él, el marcador de siempre (`ACABADO_DEL_MURO`).
  const { material } = battle.muralla;
  if (hayMuralla(battle.muralla)) pedirElArteDe(material);
  const acabado = ACABADO_DEL_MURO[material];
  const arteDelMuro: ArteDelMuro = {
    material,
    cara: caraDe(material),
    muros: new Set(battle.muralla.muros.map(hexKey)),
  };
  // Las portadas y las escaleras ya pintadas, que se dejan ver a trasluz por lo
  // que se pinta después delante de ellas (`aTrasluz`).
  const yaPintadas: ATrasluz[] = [];
  for (const p of piezasEnOrden(battle, yaPedida)) {
    switch (p.kind) {
      case 'columna': {
        const { k, camino } = casillas[indiceDe(p.hex)] as CasillaPintada;
        ctx.save();
        if (translucidas.has(k)) ctx.globalAlpha = ALFA_DE_LA_TRANSLUCIDA;
        pintarColumna(
          ctx,
          tablero,
          p.hex,
          camino,
          estiloDe(k),
          v.escalables.has(k),
          acabado,
          arteDelMuro,
        );
        ctx.restore();
        if (!translucidas.has(k)) aTrasluz(ctx, siluetaDeColumna(tablero, p.hex), yaPintadas);
        break;
      }
      case 'portada': {
        const k = claveDePortada(p.puerta);
        const abierta = puertaAbierta(battle.puertas, p.puerta);
        const pintar = (elegible: boolean): void =>
          pintarPortada(ctx, tablero, p.puerta, abierta, elegible, acabado, material);
        ctx.save();
        if (translucidas.has(k)) ctx.globalAlpha = ALFA_DE_LA_TRANSLUCIDA;
        pintar(v.puertasPorElegir.has(k));
        ctx.restore();
        const silueta = siluetaDePortada(tablero, p.puerta);
        if (!translucidas.has(k)) aTrasluz(ctx, silueta, yaPintadas);
        yaPintadas.push({
          silueta,
          pintar: () => pintarPortadaATrasluz(ctx, tablero, p.puerta, () => pintar(false)),
        });
        break;
      }
      case 'escalera':
        pintarEscalera(ctx, tablero, p.pie, p.muro);
        yaPintadas.push({
          silueta: siluetaDeEscalera(tablero, p.pie, p.muro),
          pintar: () => pintarEscalera(ctx, tablero, p.pie, p.muro),
        });
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
  // La lluvia y el rayo, encima de las figuras y debajo de las barras, los
  // nombres y las cifras, que tienen que leerse con cualquier tiempo.
  pintarAireDelClima(ctx, climaDelCampo, marcoDelClima);
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
    if (s.origen.kind === 'heroe') pintarCorona(ctx, v, f);
  }

  // 4 · Lo que vuela por encima: proyectiles, hechizos y cifras.
  for (const e of v.efectos) pintarEfecto(ctx, tablero, e);
  ctx.restore();
}

/** Lo que se deja ver de una columna translúcida. */
const ALFA_DE_LA_TRANSLUCIDA = 0.3;

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
  ctx.font = `bold ${Math.max(9, Math.round(t.paso * 0.22))}px ${temaDelLienzo().letraUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { target, at, hexes, porciento } of cargas) {
    const c = centroHex(t, at);
    const texto = angulo?.objetivo === target ? `+${porciento} %` : `»${hexes}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a1a0acc';
    ctx.strokeText(texto, c.x, c.y);
    ctx.fillStyle = '#ffd9a0';
    ctx.fillText(texto, c.x, c.y);
  }
  ctx.restore();
}
