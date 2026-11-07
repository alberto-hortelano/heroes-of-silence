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
import {
  type CasillaDelAlcance,
  type ExplosionDeLaGranada,
  explosionDe,
  type LineaDelDisparo,
  lineaDelDisparo,
} from '@core/battle/a-distancia.js';
import { isShooter } from '@core/battle/armas.js';
import {
  allHexes,
  desplazamientoDeFila,
  hexEquals,
  hexKey,
  indiceDe,
  neighbours,
} from '@core/battle/board.js';
import { activeStack, type CasillaDeCarga, isAlive, stackHexes } from '@core/battle/consultas.js';
import { esMuro, hayMuralla, nivelDe, puertaAbierta } from '@core/battle/muralla.js';
import {
  type BattleStack,
  type BattleState,
  type EstadoDePuerta,
  type MaterialDeMuralla,
  type MurallaDeBatalla,
  type PuertaDeMuralla,
  rangoDeVeterania,
  type Side,
} from '@core/battle/types.js';
import { createRng, hashDeTexto } from '@core/rng.js';
import { type ClimaDelSitio, DESPEJADO } from '@core/state/clima.js';
import type { Hex, PlayerId } from '@core/types.js';
import { ALTO_DE_FIGURA, ALTO_DE_FILA, COMPRESION_SUELO, type Plano } from '../../shared/arte.js';
import { ALTO_DE_MURALLA, ESCALERA, PORTADA } from '../../shared/muralla-de-batalla.js';
import type { Efecto, EstadoFigura } from '../anim.js';
import { temaDelLienzo } from '../temas.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import { aroDeFigura, type PiesDeLaFigura } from './aro.js';
import {
  type CaraConArte,
  caraDe,
  pedirElArteDe,
  pintarCaraConArte,
  pintarEscaleraConArte,
  pintarPortadaConArte,
  pintarRemateConArte,
  rellenoDeLaTapa,
} from './arte-de-la-muralla.js';
import { asset } from './assets.js';
import { type CharacterClip, clipEnCurso } from './character.js';
import {
  campoDeEscena,
  hornearElVelo,
  pintarAireDelClima,
  pintarSueloDelClima,
  sinElVelo,
} from './clima/clima.js';
import { cieloDe, EFECTOS, luzDeLasFiguras, type Receta } from './clima/recetas.js';
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
import { centroHex, enPantalla, planoDeHex, type Tablero, verticesHex } from './proyeccion.js';

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

/** Una recta del disparo diferido que se pinta, de qué bando y si se tantea. */
/**
 * El color de cada cuarto de la tirada del disparo diferido (`cuartoDelDisparo`),
 * del 0, la mínima, al 4, la máxima: el calor del cruce de la rueda
 * (`--info-calor-*` de `style.css`), que el lienzo no lee de la hoja.
 */
const CALOR_DEL_DISPARO: readonly string[] = [
  '#86aed0',
  '#9fc49a',
  '#cbb780',
  '#e8975f',
  '#f2593a',
];

interface LineaPintada {
  readonly l: LineaDelDisparo;
  readonly side: Side;
  readonly tanteo: boolean;
}

/**
 * Las rectas de lo apuntado (`BattleStack.apuntado`) en `battle`, recordadas por la
 * batalla y lo largo de su registro: solo cambian con una jugada, y se pintan en
 * cada fotograma.
 */
function lineasApuntadas(
  battle: BattleState,
  apuntados: ReadonlyMap<string, Hex>,
): readonly LineaPintada[] {
  const clave = [...apuntados].map(([id, h]) => `${id}@${h.col},${h.row}`).join('|');
  const r = rectasApuntadas;
  if (r !== null && r.battle === battle && r.largo === battle.log.length && r.clave === clave) {
    return r.lineas;
  }
  const lineas = battle.stacks.flatMap((s): LineaPintada[] => {
    const at = apuntados.get(s.id);
    return !isAlive(s) || at === undefined
      ? []
      : [{ l: lineaDelDisparo(battle, s, at), side: s.side, tanteo: false }];
  });
  rectasApuntadas = { battle, largo: battle.log.length, clave, lineas };
  return lineas;
}
let rectasApuntadas: {
  readonly battle: BattleState;
  readonly largo: number;
  readonly clave: string;
  readonly lineas: readonly LineaPintada[];
} | null = null;

/**
 * Los disparos diferidos en el suelo (25-10-2026): de cada tirador con algo
 * apuntado (`BattleStack.apuntado`), cada casilla en que daría teñida por el daño
 * que haría ahí (01-11-2026, petición del usuario: «un gradiente de color de más a
 * menos daño»), la recta de hoy hasta donde llega
 * (`lineaDelDisparo`, la regla del núcleo), en el color de su bando y a trazos, la
 * casilla apuntada con su diana y, si da a alguien, su casilla en rojo. El que se
 * tantea con el puntero (`VistaBatalla.tanteo`), igual y más tenue. Lo que no
 * llega va en gris: tras el alcanzado, hasta el borde (la recta sigue tras la
 * casilla apuntada, 01-11-2026); tras un muro o una puerta, hasta la casilla.
 */
function pintarDisparos(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const { battle, tablero } = v;
  const lineas: LineaPintada[] = [...lineasApuntadas(battle, v.apuntados)];
  const activa = activeStack(battle);
  if (v.tanteo !== null && activa !== null) {
    lineas.push({ l: v.tanteo, side: activa.side, tanteo: true });
  }
  if (lineas.length === 0) return;
  const casillas = hexesDe(tablero);
  const grueso = gruesoDelTiro(tablero);
  ctx.save();
  for (const { l, side, tanteo } of lineas) {
    const color = colorDelBando(v, side);
    ctx.globalAlpha = tanteo ? 0.55 : 0.9;
    // Todas las casillas en que daría, del frío de la tirada mínima al rojo de la
    // máxima (`LineaDelDisparo.alcance`): al salir el disparo ya se habrán movido.
    teñirElAlcance(ctx, casillas, l.alcance, tanteo);
    const desde = centroHex(tablero, l.desde);
    const hasta = centroHex(tablero, l.at);
    // Todo va por la recta exacta de los dos centros (la del núcleo): una casilla se
    // marca en ella por el pie de su centro, no por su centro, que puede quedar a un lado.
    const ux = hasta.x - desde.x;
    const uy = hasta.y - desde.y;
    const sobreLaRecta = (h: Hex): { x: number; y: number } => {
      const c = centroHex(tablero, h);
      const t = ((c.x - desde.x) * ux + (c.y - desde.y) * uy) / (ux * ux + uy * uy);
      return { x: desde.x + t * ux, y: desde.y + t * uy };
    };
    const ultima = l.casillas.at(-1);
    const corte = ultima === undefined ? desde : sobreLaRecta(ultima);
    // Hasta dónde seguiría sin nadie: el borde, o la casilla si algo para la recta antes.
    const final = l.alcance.at(-1)?.hex;
    const pasaLaCasilla = l.alcance.some((c) => hexEquals(c.hex, l.at));
    const fin = final !== undefined && pasaLaCasilla ? sobreLaRecta(final) : hasta;
    ctx.lineCap = 'round';
    // Hasta donde llega, del color del bando sobre un filo oscuro (sobre el suelo
    // claro, sola, se perdía); de ahí a donde acabaría, en gris.
    ctx.beginPath();
    ctx.moveTo(desde.x, desde.y);
    ctx.lineTo(corte.x, corte.y);
    ctx.lineWidth = grueso + 2;
    ctx.strokeStyle = '#0000008c';
    ctx.stroke();
    ctx.setLineDash([grueso * 3, grueso * 2]);
    ctx.lineWidth = grueso;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (ultima === undefined || l.alcanzado !== null || l.parada !== null) {
      ctx.strokeStyle = '#d8d0c088';
      ctx.lineWidth = grueso * 0.7;
      ctx.beginPath();
      ctx.moveTo(corte.x, corte.y);
      ctx.lineTo(fin.x, fin.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // La diana en la casilla apuntada.
    pintarDiana(ctx, tablero, hasta, color, grueso);
    // A quién da hoy, en rojo.
    if (l.alcanzado !== null) marcarAlcanzado(ctx, casillas, l.alcanzado.hex, grueso);
  }
  ctx.restore();
}

/** El grueso de las líneas de un disparo o una granada en el suelo. */
function gruesoDelTiro(tablero: Tablero): number {
  return Math.max(2.5, tablero.paso * 0.045);
}

/**
 * Tiñe cada casilla del alcance de un disparo o una granada por la tirada que daría
 * ahí, del frío del cuarto 0 al rojo del 4 (`CALOR_DEL_DISPARO`); más tenue si se tantea.
 */
function teñirElAlcance(
  ctx: CanvasRenderingContext2D,
  casillas: readonly CasillaPintada[],
  alcance: readonly CasillaDelAlcance[],
  tanteo: boolean,
): void {
  for (const { hex, cuarto } of alcance) {
    ctx.fillStyle = `${CALOR_DEL_DISPARO[cuarto] as string}${tanteo ? '55' : '80'}`;
    ctx.fill((casillas[indiceDe(hex)] as CasillaPintada).camino);
  }
}

/**
 * La diana de la casilla a la que se apunta o se lanza, centrada en `c`. Con
 * `contorno`, el color va sobre un trazo claro y este sobre un filo oscuro: la de la
 * granada cae en el centro de su explosión, teñido del rojo del cuarto 4, y la del
 * bando rojo se perdía en él (H2 del QA de las granadas, 02-11-2026). La del disparo
 * no lo lleva: su casilla no siempre va teñida y se leía bien.
 */
function pintarDiana(
  ctx: CanvasRenderingContext2D,
  tablero: Tablero,
  c: { readonly x: number; readonly y: number },
  color: string,
  grueso: number,
  contorno = false,
): void {
  const r = tablero.paso * 0.28;
  const diana = new Path2D();
  diana.ellipse(c.x, c.y, r, r * tablero.compresion, 0, 0, Math.PI * 2);
  diana.moveTo(c.x - r * 1.3, c.y);
  diana.lineTo(c.x + r * 1.3, c.y);
  diana.moveTo(c.x, c.y - r * 1.3 * tablero.compresion);
  diana.lineTo(c.x, c.y + r * 1.3 * tablero.compresion);
  if (contorno) {
    ctx.lineCap = 'round';
    ctx.lineWidth = grueso + 4;
    ctx.strokeStyle = FILO_OSCURO;
    ctx.stroke(diana);
    ctx.lineWidth = grueso + 2;
    ctx.strokeStyle = TRAZO_CLARO;
    ctx.stroke(diana);
  }
  ctx.lineWidth = grueso;
  ctx.strokeStyle = color;
  ctx.stroke(diana);
}

/** Bajo el color de la diana y del borde de una granada: el filo y el trazo claro. */
const FILO_OSCURO = '#000000b3';
const TRAZO_CLARO = '#f3ead6';

/**
 * El borde de fuera de un grupo de casillas (la explosión de una granada): los lados
 * de cada una que no comparte con otra del grupo, como pares de vértices. Dos
 * vecinas comparten sus dos vértices, calculados desde centros distintos: se casan
 * por su posición redondeada a la centésima de píxel.
 */
export function bordeDeLasCasillas(
  tablero: Tablero,
  hexes: readonly Hex[],
): readonly (readonly [Plano, Plano])[] {
  const clave = (p: Plano): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  const lados = new Map<string, { lado: readonly [Plano, Plano]; veces: number }>();
  for (const h of hexes) {
    const v = verticesHex(tablero, h);
    for (const [i, a] of v.entries()) {
      const b = v[(i + 1) % v.length] as Plano;
      const k = [clave(a), clave(b)].sort().join('|');
      const hecho = lados.get(k);
      if (hecho === undefined) lados.set(k, { lado: [a, b], veces: 1 });
      else hecho.veces++;
    }
  }
  return [...lados.values()].flatMap(({ lado, veces }) => (veces === 1 ? [lado] : []));
}

/** La casilla de a quién daría hoy, en rojo. */
function marcarAlcanzado(
  ctx: CanvasRenderingContext2D,
  casillas: readonly CasillaPintada[],
  hex: Hex,
  grueso: number,
): void {
  ctx.lineWidth = grueso * 1.3;
  ctx.strokeStyle = '#ff5a3c';
  ctx.stroke((casillas[indiceDe(hex)] as CasillaPintada).camino);
}

/**
 * Las granadas en el suelo (02-11-2026): de cada una en el aire (`BattleStack.granada`,
 * al ritmo de la cola) y de la que se tantea, cada casilla que alcanza su explosión
 * (`explosionDe`, la regla del núcleo) teñida por la tirada que daría ahí, como el
 * disparo, con su borde de fuera continuo del color de su bando, y la diana con su
 * contorno en la casilla; en la que se tantea, en rojo quien está hoy en ellas. Para
 * los dos bandos y el espectador.
 */
function pintarGranadas(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const { battle, tablero } = v;
  const pendientes: { e: ExplosionDeLaGranada; side: Side; tanteo: boolean }[] = [];
  for (const s of battle.stacks) {
    const at = v.granadas.get(s.id);
    if (at !== undefined && isAlive(s)) {
      pendientes.push({ e: explosionDe(battle, at), side: s.side, tanteo: false });
    }
  }
  const activa = activeStack(battle);
  if (v.granadaTanteada !== null && activa !== null) {
    pendientes.push({ e: v.granadaTanteada, side: activa.side, tanteo: true });
  }
  if (pendientes.length === 0) return;
  const casillas = hexesDe(tablero);
  const grueso = gruesoDelTiro(tablero);
  ctx.save();
  // Primero el teñido de todas y después los bordes y las dianas: pintando cada una
  // entera, el teñido de la segunda tapaba la diana y el borde de la primera cuando
  // se solapaban (H5 del QA de las granadas, 02-11-2026).
  for (const { e, tanteo } of pendientes) {
    ctx.globalAlpha = tanteo ? 0.55 : 0.9;
    teñirElAlcance(ctx, casillas, e.casillas, tanteo);
  }
  for (const { e, side, tanteo } of pendientes) {
    const color = colorDelBando(v, side);
    ctx.globalAlpha = tanteo ? 0.55 : 0.9;
    // El borde de la explosión, entero y continuo, del color de su bando sobre un
    // filo oscuro: a trazos, casilla a casilla, se confundía con la recta teñida de
    // un disparo que pasaba al lado (H2 del QA de las granadas, 02-11-2026).
    const borde = new Path2D();
    for (const [a, b] of bordeDeLasCasillas(
      tablero,
      e.casillas.map((c) => c.hex),
    )) {
      borde.moveTo(a.x, a.y);
      borde.lineTo(b.x, b.y);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = grueso + 2;
    ctx.strokeStyle = FILO_OSCURO;
    ctx.stroke(borde);
    ctx.lineWidth = grueso;
    ctx.strokeStyle = color;
    ctx.stroke(borde);
    pintarDiana(ctx, tablero, centroHex(tablero, e.at), color, grueso, true);
    // A quién da hoy (solo en la que se tantea: las del aire, al explotar).
    if (tanteo)
      for (const { stack } of e.alcanzados) marcarAlcanzado(ctx, casillas, stack.hex, grueso);
  }
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
    // En lo alto de una columna que linda por delante con una puerta, tras su
    // portada: el adarve sigue por lo alto de ella (`portadaDelAdarve`).
    const portada = f.elevacion >= 1 ? portadaDelAdarve(battle.muralla, f.en) : null;
    if (f.caida !== null && f.elevacion > 0) {
      piezas.push(
        portada === null
          ? { y: f.en.y, orden: 2, p: { kind: 'caido', id: s.id } }
          : { y: portada, orden: 5, p: { kind: 'caido', id: s.id } },
      );
    }
    if (f.visible) {
      piezas.push(
        portada === null
          ? { y: f.en.y, orden: 3, p: { kind: 'figura', id: s.id } }
          : { y: portada, orden: 6, p: { kind: 'figura', id: s.id } },
      );
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

/**
 * La fila (en el plano) de la portada que tiene delante, pegada, la columna en
 * cuya tapa está `en`, o `null`. La portada con su arte lleva sus almenas a lo
 * ancho de lo alto, justo donde su adarve sigue al de la columna de detrás: con
 * la «Base derecha» de las ciudades, la columna de detrás de la puerta tenía los
 * pies y el aro de quien estaba en ella tapados por esas almenas, que se leían
 * como las de su propia columna (QA del arte de la muralla, 06-11-2026). Quien
 * está ahí se pinta tras la portada: de pie sobre el adarve. Una columna de
 * delante sí lo tapa (es profundidad), y no lleva almenas en la arista que
 * comparte con la suya (`daFuera`).
 */
function portadaDelAdarve(m: MurallaDeBatalla, en: Plano): number | null {
  if (m.puertas.length === 0) return null;
  const row = Math.round(en.y / ALTO_DE_FILA);
  const h = { col: Math.round(en.x - desplazamientoDeFila(row) * 0.5) + 0, row };
  if (!esMuro(m, h)) return null;
  const y = planoDeHex(h).y;
  const vecinas = neighbours(h);
  let fila: number | null = null;
  for (const p of m.puertas) {
    const py = planoDeHex(p.a).y;
    if (py <= y || !vecinas.some((v) => hexEquals(v, p.a) || hexEquals(v, p.b))) continue;
    fila = fila === null ? py : Math.max(fila, py);
  }
  return fila;
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

/** Cómo se pinta una casilla: relleno, ancho y color del borde. */
interface EstiloDeCasilla {
  readonly relleno: string;
  readonly ancho: number;
  readonly trazo: string;
}

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

/** Los colores de una columna o una portada: la cara de la luz (este), la de la sombra y lo alto. */
interface ColoresDelMuro {
  readonly luz: string;
  readonly sombra: string;
  readonly arriba: string;
  readonly junta: string;
  readonly borde: string;
}

/** Cómo se pinta un muro de un material: sus colores y sus juntas (`pintarSillares`). */
interface AcabadoDelMuro {
  readonly colores: ColoresDelMuro;
  /** Hiladas de sillares a tresbolillo, o estacas de una empalizada. */
  readonly juntas: 'hiladas' | 'estacas';
}

/**
 * Cada material, con su acabado (fase 2 del puesto fronterizo, 04-11-2026): la
 * piedra de las ciudades y la arena, en hiladas de sillares, y la madera de la
 * empalizada de los pueblos, en estacas. Se resuelve una vez por batalla
 * (`drawBatalla`) y lo reciben la columna, la portada y sus juntas.
 */
const ACABADO_DEL_MURO: Readonly<Record<MaterialDeMuralla, AcabadoDelMuro>> = {
  piedra: {
    colores: {
      luz: '#9b958a',
      sombra: '#706b62',
      arriba: '#aaa498',
      junta: '#55514a',
      borde: '#2f2c28',
    },
    juntas: 'hiladas',
  },
  madera: {
    colores: {
      luz: '#8a6236',
      sombra: '#5e4123',
      arriba: '#9c7444',
      junta: '#3e2a15',
      borde: '#24170b',
    },
    juntas: 'estacas',
  },
};

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
          [HOJA.oscura, 0.2],
          [HOJA.madera, 0.13],
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
 * El arte de la muralla de una batalla, resuelto una vez por fotograma
 * (`drawBatalla`): el material, su cara pintada si ha llegado y qué casillas son
 * muro (el remate va solo en las caras que dan fuera de la muralla).
 */
interface ArteDelMuro {
  readonly material: MaterialDeMuralla;
  readonly cara: CaraConArte | null;
  readonly muros: ReadonlySet<string>;
}

/**
 * Las aristas de una columna con su arte, por los vértices de su hex (punta
 * arriba y en el sentido de las agujas: 0 arriba, 2 abajo a la derecha, 3 abajo,
 * 4 abajo a la izquierda), de izquierda a derecha como se ven, y la casilla
 * vecina al otro lado (columnas y filas en el plano, `planoDeHex`): las dos de
 * delante con su cara, la del suroeste a la luz y la del sureste a la sombra
 * (la luz viene de la izquierda, `ARTE.luz`), y las dos de atrás, con solo su
 * remate. Las del este y el oeste van de canto a esta cámara.
 */
const ARISTAS_DE_LA_COLUMNA = [
  { de: 5, a: 0, dx: -0.5, dy: -1, delante: false, sombra: false },
  { de: 0, a: 1, dx: 0.5, dy: -1, delante: false, sombra: false },
  { de: 4, a: 3, dx: -0.5, dy: 1, delante: true, sombra: false },
  { de: 3, a: 2, dx: 0.5, dy: 1, delante: true, sombra: true },
] as const;

/** ¿Da fuera de la muralla la arista de `h` hacia (`dx`, `dy` filas)? Si al otro lado no hay muro. */
function daFuera(m: ReadonlySet<string>, h: Hex, dx: number, dy: number): boolean {
  const row = h.row + dy;
  const x = planoDeHex(h).x + dx;
  const col = Math.round(x - desplazamientoDeFila(row) * 0.5);
  return !m.has(hexKey({ col, row }));
}

/**
 * Un muro, como columna: el hex subido `alturaDeColumna` es lo alto, donde se
 * pisa —y donde se pinta la marca de la casilla (`estilo`): movible, atacable,
 * la de la activa—, y las dos caras de delante. Las de los lados del hexágono
 * van de canto a esta cámara y no se ven. Lo alto es el `camino` de su casilla
 * en el suelo (`hexesDe`), trasladado. `escalable`, si la activa puede poner su
 * escalera o subir ahí.
 *
 * Con su arte (`arte.cara`), cada cara lleva una rodaja del lienzo de muro
 * pintado, la tapa su adarve y cada arista que da fuera su remate (las de atrás
 * antes de la tapa, las de delante encima); sin él, el marcador: las caras de
 * un color con sus hiladas o sus estacas (`pintarSillares`).
 */
function pintarColumna(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  h: Hex,
  camino: Path2D,
  estilo: EstiloDeCasilla,
  escalable: boolean,
  acabado: AcabadoDelMuro,
  arte: ArteDelMuro,
): void {
  const alto = alturaDeColumna(t);
  const { colores } = acabado;
  const v = verticesHex(t, h);
  const arriba = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - alto });
  const { cara } = arte;
  const rodaja = (de: number) => hashDeTexto(`${hexKey(h)}|${de}`);
  ctx.save();
  ctx.lineJoin = 'round';
  if (cara !== null) {
    for (const e of ARISTAS_DE_LA_COLUMNA) {
      const a = v[e.de] as { x: number; y: number };
      const b = v[e.a] as { x: number; y: number };
      if (e.delante) {
        pintarCaraConArte(ctx, t, cara, a, b, alto, rodaja(e.de), e.sombra);
        ctx.strokeStyle = 'rgba(20, 16, 12, 0.45)';
        ctx.lineWidth = Math.max(1, t.paso * 0.012);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x, a.y - alto);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, b.y - alto);
        ctx.stroke();
      } else if (daFuera(arte.muros, h, e.dx, e.dy)) {
        pintarRemateConArte(ctx, t, cara, arriba(a), arriba(b), rodaja(e.de), true, false);
      }
    }
  } else {
    for (const [i, j, color] of [
      [3, 4, colores.sombra],
      [2, 3, colores.luz],
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
      pintarSillares(ctx, t, a, b, alto, acabado);
    }
  }
  ctx.translate(0, -alto);
  const tapa = camino;
  ctx.fillStyle = (cara !== null ? rellenoDeLaTapa(ctx, t, arte.material) : null) ?? colores.arriba;
  ctx.fill(tapa);
  ctx.lineWidth = Math.max(2, t.paso * (cara !== null ? 0.03 : 0.045));
  ctx.strokeStyle = colores.borde;
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
  // El remate de las caras de delante que dan fuera, encima de lo alto: el
  // lienzo ya está subido, así que la arista de lo alto es la del hex.
  if (cara !== null) {
    for (const e of ARISTAS_DE_LA_COLUMNA) {
      if (!e.delante || !daFuera(arte.muros, h, e.dx, e.dy)) continue;
      const a = v[e.de] as { x: number; y: number };
      const b = v[e.a] as { x: number; y: number };
      pintarRemateConArte(ctx, t, cara, a, b, rodaja(e.de), false, e.sombra);
    }
  }
  ctx.restore();
}

/**
 * Las hiladas de una cara de piedra de `a` a `b` (sus pies) y `alto` de alto: una
 * cada `HILADA` pasos, con las juntas verticales a tresbolillo, y el borde. En
 * madera, estacas: las juntas solo en vertical, una cada `ESTACA` pasos.
 */
function pintarSillares(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
  alto: number,
  { colores, juntas }: AcabadoDelMuro,
): void {
  ctx.strokeStyle = colores.junta;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.beginPath();
  if (juntas === 'estacas') {
    const estacas = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (t.paso * ESTACA)));
    for (let i = 1; i < estacas; i++) {
      const u = i / estacas;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - alto);
    }
  } else {
    const hiladas = Math.max(2, Math.round(alto / (t.paso * HILADA)));
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
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y - alto);
  ctx.lineTo(a.x, a.y - alto);
  ctx.closePath();
  ctx.strokeStyle = colores.borde;
  ctx.lineWidth = Math.max(1.5, t.paso * 0.03);
  ctx.stroke();
}

/** Lo que mide una hilada de sillares, en pasos. */
const HILADA = 0.28;

/** Lo que mide de ancho una estaca de la empalizada, en pasos. */
const ESTACA = 0.14;

/**
 * El hueco del arco de la portada de `p`, en el lienzo: de una jamba a la otra
 * por la clave y, `cerrado`, también por el suelo.
 */
function huecoDePortada(t: Tablero, p: PuertaDeMuralla, cerrado = true): Path2D {
  const c = pieDePortada(t, p);
  const izq = c.x - PORTADA.hueco * t.paso;
  const der = c.x + PORTADA.hueco * t.paso;
  const clave = c.y - PORTADA.arco * t.paso;
  const arranque = clave + PORTADA.flecha * t.paso;
  const hueco = new Path2D();
  hueco.moveTo(izq, c.y);
  hueco.lineTo(izq, arranque);
  hueco.ellipse(c.x, arranque, der - c.x, arranque - clave, 0, Math.PI, 0);
  hueco.lineTo(der, c.y);
  if (cerrado) hueco.closePath();
  return hueco;
}

/**
 * La portada de `p` a trasluz por lo que la tapa (`aTrasluz`): la misma, tenue, y
 * el contorno claro de su arco encima, que es lo que dice «aquí hay una puerta»
 * cuando la piedra de detrás se confunde con la de delante: cerrada, con la
 * madera de sus hojas dentro; abierta, vacío.
 */
function pintarPortadaATrasluz(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  p: PuertaDeMuralla,
  pintar: () => void,
): void {
  pintar();
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1.5, t.paso * 0.022);
  ctx.strokeStyle = CONTORNO_A_TRASLUZ;
  ctx.stroke(huecoDePortada(t, p, false));
  ctx.restore();
}

/** El trazo claro de lo que se ve a trasluz: el arco de una puerta tapada. */
const CONTORNO_A_TRASLUZ = '#f0dcb4';

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
 *
 * Con su arte (`pintarPortadaConArte`), la fachada pintada de su `material`,
 * abierta (con el paso recortado: se ve a quien pasa) o cerrada (las hojas
 * tapan el arco); sin él, el marcador de abajo.
 */
function pintarPortada(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  p: PuertaDeMuralla,
  abierta: boolean,
  elegible: boolean,
  acabado: AcabadoDelMuro,
  material: MaterialDeMuralla,
): void {
  const alto = alturaDeColumna(t);
  const { colores } = acabado;
  const c = pieDePortada(t, p);
  const x0 = c.x - PORTADA.mitad * t.paso;
  const x1 = c.x + PORTADA.mitad * t.paso;
  const izq = c.x - PORTADA.hueco * t.paso;
  const clave = c.y - PORTADA.arco * t.paso;
  const hueco = huecoDePortada(t, p);
  const arriba = c.y - alto;
  const fondo = PORTADA.fondo * t.paso * t.compresion;
  if (pintarPortadaConArte(ctx, t, material, c, abierta)) {
    if (elegible) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd24a';
      ctx.stroke(hueco);
      ctx.strokeRect(x0, arriba - fondo, x1 - x0, alto + fondo);
      ctx.restore();
    }
    return;
  }
  ctx.save();
  ctx.lineJoin = 'round';
  // La fachada, menos el hueco: piedra con hiladas, como las columnas.
  const fachada = new Path2D();
  fachada.rect(x0, arriba, x1 - x0, alto);
  fachada.addPath(hueco);
  ctx.save();
  ctx.clip(fachada, 'evenodd');
  ctx.fillStyle = colores.luz;
  ctx.fillRect(x0, arriba, x1 - x0, alto);
  // La jamba de la izquierda, en sombra: da volumen sin pintar caras de lado.
  ctx.fillStyle = colores.sombra;
  ctx.fillRect(x0, arriba, izq - x0, alto);
  pintarSillares(ctx, t, { x: x0, y: c.y }, { x: x1, y: c.y }, alto, acabado);
  ctx.restore();
  if (abierta) pintarHojasAbiertas(ctx, t, p);
  else pintarHojasCerradas(ctx, t, c.x, clave, c.y);
  // La rosca del arco, en madera oscura como la puerta: se lee como un paso.
  ctx.lineWidth = Math.max(2.5, t.paso * 0.05);
  ctx.strokeStyle = HOJA.oscura;
  ctx.stroke(hueco);
  // La tapa: el fondo de la fachada visto desde arriba. Ahí no se pisa.
  ctx.beginPath();
  ctx.rect(x0, arriba - fondo, x1 - x0, fondo);
  ctx.fillStyle = colores.arriba;
  ctx.fill();
  ctx.lineWidth = Math.max(2, t.paso * 0.045);
  ctx.strokeStyle = colores.borde;
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
 * Las dos hojas abiertas de la puerta `p`, abatidas contra las jambas, en el
 * lienzo: lo que pinta `pintarHojasAbiertas` en el marcador sin arte.
 */
function formaDeLasHojasAbiertas(t: Tablero, p: PuertaDeMuralla): Path2D {
  const c = pieDePortada(t, p);
  const clave = c.y - PORTADA.arco * t.paso;
  const forma = new Path2D();
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

/** Una portada o una escalera ya pintada: lo que tapa y cómo se vuelve a pintar a trasluz. */
interface ATrasluz {
  readonly silueta: readonly Punto[];
  readonly pintar: () => void;
}

/** Lo que se deja ver una portada o una escalera tapada, a través de lo que la tapa. */
const ALFA_A_TRASLUZ = 0.42;

/**
 * Las portadas y las escaleras de `yaPintadas` que tapa la pieza de la muralla
 * recién pintada (su `silueta`, una columna o una portada), otra vez encima de
 * ella, tenues y solo donde la tapa: se ven a trasluz, como la silueta de una
 * figura tapada. Así se lee la puerta entera, abierta o cerrada, detrás de la
 * columna que tiene delante (con la «Base derecha» de las ciudades, toda), y la
 * escalera que se apoya detrás de una columna de la fila de delante. Va con la
 * pieza que tapa, antes que quien está en lo alto de ella: le pasa por debajo.
 * Sustituye a las hojas tapadas (el tablón o las hojas en contorno naranja, ampliación
 * 3, criterio 25), que con el arte se leían como un rectángulo suelto sobre las
 * almenas (QA del arte de la muralla, 06-11-2026).
 */
function aTrasluz(
  ctx: CanvasRenderingContext2D,
  silueta: readonly Punto[],
  yaPintadas: readonly ATrasluz[],
): void {
  const tapadas = yaPintadas.filter((p) => convexosSeTocan(p.silueta, silueta));
  if (tapadas.length === 0) return;
  const [primero, ...resto] = silueta;
  const recorte = new Path2D();
  recorte.moveTo((primero as Punto).x, (primero as Punto).y);
  for (const q of resto) recorte.lineTo(q.x, q.y);
  recorte.closePath();
  ctx.save();
  ctx.clip(recorte);
  ctx.globalAlpha = ALFA_A_TRASLUZ;
  for (const p of tapadas) p.pintar();
  ctx.restore();
}

/** La madera de las hojas de la puerta y sus herrajes. */
const HOJA = {
  madera: '#7a4a22',
  /** La madera oscura: la rosca del arco y el tablón del umbral de la puerta cerrada. */
  oscura: '#2a160a',
  tabla: '#4a2a12',
  hierro: '#26231f',
  canto: '#5a3418',
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
 * a cada lado del hueco, del suelo al arranque del arco (`formaDeLasHojasAbiertas`). El
 * medio, libre.
 */
function pintarHojasAbiertas(ctx: CanvasRenderingContext2D, t: Tablero, p: PuertaDeMuralla): void {
  const forma = formaDeLasHojasAbiertas(t, p);
  ctx.save();
  ctx.fillStyle = HOJA.canto;
  ctx.fill(forma);
  ctx.strokeStyle = HOJA.hierro;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.stroke(forma);
  ctx.restore();
}

/** De dónde a dónde va la escalera de `pie` a `muro` en el lienzo: del suelo a pasado lo alto. */
function tramoDeLaEscalera(t: Tablero, pie: Hex, muro: Hex): { abajo: Punto; arriba: Punto } {
  const p = centroHex(t, pie);
  const m = centroHex(t, muro);
  return {
    abajo: { x: p.x + (m.x - p.x) * 0.48, y: p.y + (m.y - p.y) * 0.48 },
    arriba: {
      x: m.x + (p.x - m.x) * 0.3,
      y: m.y + (p.y - m.y) * 0.3 - alturaDeColumna(t) * 1.15,
    },
  };
}

/**
 * Lo que tapa en pantalla la escalera de `pie` a `muro`: la tira de su tramo, del
 * ancho de sus largueros por fuera con algo de holgura. La lee el trasluz
 * (`aTrasluz`): la columna de delante que la tapa la deja ver.
 */
function siluetaDeEscalera(t: Tablero, pie: Hex, muro: Hex): Punto[] {
  const { abajo, arriba } = tramoDeLaEscalera(t, pie, muro);
  const largo = Math.max(1, Math.hypot(arriba.x - abajo.x, arriba.y - abajo.y));
  const media = (ESCALERA.ancho / 2 + 0.06) * t.paso;
  const nx = (-(arriba.y - abajo.y) / largo) * media;
  const ny = ((arriba.x - abajo.x) / largo) * media;
  return [
    { x: abajo.x + nx, y: abajo.y + ny },
    { x: arriba.x + nx, y: arriba.y + ny },
    { x: arriba.x - nx, y: arriba.y - ny },
    { x: abajo.x - nx, y: abajo.y - ny },
  ];
}

/**
 * La escalera puesta: con su arte, la pintada (`pintarEscaleraConArte`); sin él, dos largueros de madera del pie (en el suelo,
 * junto a la base de la columna) hasta pasado el borde de lo alto, y sus
 * peldaños. Se queda puesta toda la batalla. Sale ancha y gruesa a propósito:
 * de 0,09 pasos y apoyada a un tercio del pie, la tapaba la figura que esperaba
 * en él y no se leía (QA, M2).
 */
function pintarEscalera(ctx: CanvasRenderingContext2D, t: Tablero, pie: Hex, muro: Hex): void {
  const { abajo, arriba } = tramoDeLaEscalera(t, pie, muro);
  // Con su arte, la escalera pintada tendida del pie a lo alto; sin él, el marcador.
  if (pintarEscaleraConArte(ctx, t, abajo, arriba)) return;
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
export function cajaDeFiguraEn(t: Tablero, en: Plano): CajaDeFigura {
  const p = enPantalla(t, en);
  const alto = t.paso * ALTO_DE_FIGURA;
  return { x: p.x, suelo: p.y, alto, ancho: alto * 0.42 };
}

/**
 * El aro dorado a los pies de una figura de pie: el de quien señala el ratón en
 * la base y el de la elegida en la escena de la tropa (`grueso` dice cuál pesa más).
 * Centrado en sus pies y del tamaño que los abarque (`aroDeFigura`, con `pies` de
 * `piesDeFigura`; sin ellos, el de siempre). Va encima de la sombra y debajo de
 * la figura (`pintarFiguraConSombra` con él en medio): la sombra es del suelo y el
 * aro se lee encima.
 */
export function pintarAroDeFigura(
  ctx: CanvasRenderingContext2D,
  c: CajaDeFigura,
  pies: PiesDeLaFigura | null,
  grueso = 2,
): void {
  const aro = aroDeFigura(c, pies);
  ctx.save();
  ctx.strokeStyle = '#f5d973';
  ctx.lineWidth = grueso;
  ctx.beginPath();
  ctx.ellipse(aro.x, aro.y, aro.rx, aro.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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

/** Lo que mira el fondo del campo: el tamaño del lienzo y dónde cae su horizonte, en píxeles. */
export interface LienzoDelCampo {
  readonly ancho: number;
  readonly alto: number;
  readonly horizonte: number;
  /**
   * El clima del sitio: el cielo de detrás (`cieloDe`) y, horneadas, su luz y su
   * bruma (`hornearElVelo`). Sin él, el atardecer despejado (la tropa).
   */
  readonly clima?: ClimaDelSitio;
}

/**
 * El horizonte del campo en una batalla: un poco por encima de la fila de atrás
 * del tablero, a la cabeza de quien está en ella. Así el tablero entero pisa
 * suelo y no flota sobre el cielo.
 */
function horizonteDelCampo(t: Tablero): number {
  return t.origenY - t.paso * 0.9;
}

/**
 * El campo de batalla detrás de todo, con su horizonte en `v.horizonte`. Lo
 * pintan la batalla (`horizonteDelCampo`) y la escena de la tropa, que se alza en
 * el mismo campo y pone el suyo detrás del héroe.
 */
export function pintarFondo(ctx: CanvasRenderingContext2D, v: LienzoDelCampo): void {
  const campo = asset('rpg', 'campo');
  const dpr = densidadDe(ctx);
  const clima = v.clima ?? DESPEJADO;
  const clave = `${v.ancho}|${v.alto}|${dpr}|${v.horizonte}|${clima.tiempo}|${clima.noche}`;
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
    hornearElVelo(c, campoDeEscena(clima, v), v.ancho, v.alto);
    if (clima.noche && campo !== null) pintarAstros(c, v, campo, EFECTOS[clima.tiempo].astros, dpr);
    fondo = { clave, campo, lienzo };
  }
  ctx.drawImage(fondo.lienzo, 0, 0, v.ancho, v.alto);
}

function componerFondo(
  ctx: CanvasRenderingContext2D,
  v: LienzoDelCampo,
  campo: HTMLImageElement | null,
): void {
  if (campo !== null) {
    pintarCielo(ctx, v);
    // El horizonte del fondo (el 47 % de su alto, donde acaba el empedrado) va
    // en `v.horizonte`. Y la escala nunca deja el fondo más estrecho que el
    // lienzo ni corto por abajo.
    const r = dondeVaElCampo(v, campo);
    ctx.drawImage(campo, r.x, r.y, r.w, r.h);
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
 * Dónde va la imagen del campo: el horizonte del fondo (el 47 % de su alto,
 * donde acaba el empedrado) en `v.horizonte`, y la escala que nunca deja el
 * fondo más estrecho que el lienzo ni corto por abajo.
 */
function dondeVaElCampo(
  v: LienzoDelCampo,
  campo: HTMLImageElement,
): { x: number; y: number; w: number; h: number } {
  const HORIZONTE = 0.47;
  const W = campo.naturalWidth;
  const H = campo.naturalHeight;
  const escala = Math.max(v.ancho / W, (v.alto - v.horizonte) / ((1 - HORIZONTE) * H));
  const w = W * escala;
  const h = H * escala;
  return { x: (v.ancho - w) / 2, y: v.horizonte - HORIZONTE * h, w, h };
}

/**
 * El cielo de detrás del campo. `campo.webp` lo trae TRANSPARENTE —un tercio de
 * sus píxeles, igual que el `clearing.png` del que sale—, y sobre el negro de
 * antes quedaba un hueco negro encima de los árboles. Es un atardecer de otoño,
 * del azul pizarra arriba al ocre de la bruma en la línea de los árboles, que es
 * la luz que ya tiene el empedrado, con el despejado; con otro tiempo o de
 * noche, el de su clima (`cieloDe`).
 */
function pintarCielo(ctx: CanvasRenderingContext2D, v: LienzoDelCampo): void {
  const linea = Math.max(1, v.horizonte);
  const cielo = ctx.createLinearGradient(0, 0, 0, linea);
  // El de despejado es el atardecer de siempre; con tormenta no se ve el sol.
  const [arriba, medio, abajo] = cieloDe(v.clima ?? DESPEJADO);
  cielo.addColorStop(0, arriba);
  cielo.addColorStop(0.55, medio);
  cielo.addColorStop(1, abajo);
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, v.ancho, v.alto);
  const nubes = EFECTOS[(v.clima ?? DESPEJADO).tiempo].nubes;
  if (nubes !== null) pintarNubesBajas(ctx, v, nubes);
}

/**
 * Las nubes bajas de la lluvia y la tormenta: bancos de óvalos difuminados a lo
 * largo del horizonte, más densos abajo, con su propia corriente de azar (son
 * las mismas cada vez). Van bajo la luz del clima, que las oscurece con el cielo.
 */
function pintarNubesBajas(
  ctx: CanvasRenderingContext2D,
  v: LienzoDelCampo,
  nubes: NonNullable<Receta['nubes']>,
): void {
  const linea = Math.max(1, v.horizonte);
  const rng = createRng(hashDeTexto(`nubes|${nubes.cuantas}`));
  const n = Math.round(10 + 22 * nubes.cuantas);
  const [r, g, b] = nubes.color;
  for (let i = 0; i < n; i++) {
    const x = rng.next() * v.ancho;
    // Más abajo cuanto más avanzan: las del fondo, sobre la línea de los árboles.
    const y = linea * (0.25 + 0.75 * (i / n) * (0.6 + 0.4 * rng.next()));
    const rx = v.ancho * (0.08 + 0.12 * rng.next());
    const ry = linea * (0.1 + 0.12 * rng.next());
    const a = 0.45 + 0.4 * rng.next();
    const d = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    d.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    d.addColorStop(0.6, `rgba(${r},${g},${b},${a * 0.6})`);
    d.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.fillStyle = d;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
}

/**
 * La luna y las estrellas de la noche, encima de la luz del clima (no la
 * oscurecen: brillan) y detrás de los árboles: se pintan aparte y se recortan
 * por la silueta del campo. Con niebla, solo la luna, velada.
 */
function pintarAstros(
  ctx: CanvasRenderingContext2D,
  v: LienzoDelCampo,
  campo: HTMLImageElement,
  astros: Receta['astros'],
  dpr: number,
): void {
  if (astros === null) return;
  const linea = Math.max(1, v.horizonte);
  const capa = document.createElement('canvas');
  capa.width = Math.max(1, Math.ceil(v.ancho * dpr));
  capa.height = Math.max(1, Math.ceil(v.alto * dpr));
  const c = capa.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para el cielo de la batalla');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rng = createRng(hashDeTexto('estrellas'));
  if (astros === 'luna-y-estrellas') {
    for (let i = 0; i < 140; i++) {
      const x = rng.next() * v.ancho;
      // Más y más claras arriba, que el horizonte tiene aún algo de luz.
      const alto = rng.next() * rng.next();
      const y = linea * 0.95 * alto;
      const brillo = (0.35 + 0.6 * rng.next()) * (1 - alto * 0.6);
      const lado = rng.next() < 0.12 ? 1.8 : 1.1;
      c.fillStyle = `rgba(225,232,255,${brillo})`;
      c.fillRect(x, y, lado, lado);
    }
  }
  const radio = Math.max(6, Math.min(v.ancho * 0.015, linea * 0.12));
  const lx = v.ancho * 0.78;
  const ly = linea * 0.3;
  const velada = astros === 'luna';
  const halo = c.createRadialGradient(lx, ly, radio * 0.8, lx, ly, radio * (velada ? 7 : 4.5));
  halo.addColorStop(0, `rgba(200,214,255,${velada ? 0.3 : 0.22})`);
  halo.addColorStop(1, 'rgba(200,214,255,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, v.ancho, linea * 1.2);
  c.fillStyle = velada ? 'rgba(226,232,246,0.55)' : '#eef1fa';
  c.beginPath();
  c.arc(lx, ly, radio, 0, Math.PI * 2);
  c.fill();
  // Detrás de los árboles: fuera lo que tapa el campo.
  const r = dondeVaElCampo(v, campo);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(campo, r.x, r.y, r.w, r.h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(capa, 0, 0);
  ctx.restore();
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
function pintarCadaver(
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

function pintarUnidad(
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
function pintarNombre(
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
      ctx.font = `bold ${Math.max(14, Math.round(t.paso * 0.28))}px ${temaDelLienzo().letraTitulo}`;
      ctx.textAlign = 'center';
      const y = p.y - alto - e.t * t.paso * 0.45;
      ctx.strokeText(`−${e.cifra}`, p.x, y);
      ctx.fillText(`−${e.cifra}`, p.x, y);
      break;
    }
    case 'parado': {
      // Lo que la armadura paró entero (#262): el mismo vuelo que la cifra, en el
      // tono frío del metal, para que no se lea como un «−0».
      const p = enPantalla(tableroA(t, e.alto), e.en);
      ctx.globalAlpha = Math.min(1, (1 - e.t) * 3);
      ctx.fillStyle = '#d6e2ee';
      ctx.strokeStyle = '#10202e';
      ctx.lineWidth = 3;
      // Con la letra de la interfaz y no la de título: de esa, el lienzo solo
      // pide las cifras (`cargarLetraDeTitulo`), y estas letras saldrían con el
      // respaldo hasta que otra cosa la bajara.
      ctx.font = `bold ${Math.max(13, Math.round(t.paso * 0.24))}px ${temaDelLienzo().letraUi}`;
      ctx.textAlign = 'center';
      const y = p.y - alto - e.t * t.paso * 0.45;
      ctx.strokeText('parado', p.x, y);
      ctx.fillText('parado', p.x, y);
      break;
    }
  }
  ctx.restore();
}
