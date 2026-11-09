/**
 * Si se puede lanzar un hechizo y sobre qué, antes de lanzarlo: quién lo lanza
 * (`Lanzador`: el héroe, con su cuerpo y su poder, `lanzadorDelHeroe`, o la unidad, con
 * poder 0, `lanzadorDeLaUnidad`), qué se apunta y si vale (`apuntadoBlocker`: el
 * bando, la herida y la distancia de la entrega), a quién alcanza (`afectadosDe`), sus
 * efectos resueltos con su poder y lo común de lo que cuelga (`resueltosDe`,
 * `contextoDe`), la regla del hechizo del héroe (`castBlocker`) y la del poder de una
 * unidad (`poderBlocker`), y las jugadas que se ofrecen (`jugadasDeLanzar`). Lo leen
 * el motor, la lista legal, la previsión y la pantalla; la única aplicación de un
 * hechizo (`lanzarHechizo`) es del motor (`battle.ts`).
 *
 * Vivía en `battle.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import { HECHIZOS_DEL_JUEGO } from '../magia/catalogo.js';
import { areaDe, type Duracion, type Hechizo } from '../magia/formato.js';
import { conPlural } from '../texto.js';
import type { Hex, PoderId } from '../types.js';
import { lineaDelDisparo } from './a-distancia.js';
import { hexDistance, hexEquals, isInside } from './board.js';
import {
  activeStack,
  cadaverEn,
  faseBlocker,
  hechizoDeLaBatalla,
  impedimentoBlocker,
  isAlive,
  SIN_HEROE,
  seHaMovido,
  stackById,
  vivoEn,
} from './consultas.js';
import {
  type Apuntado,
  casillasDelArea,
  curaDelHechizo,
  type Lanzador,
  loAlcanza,
  objetivoBlocker as objetivoDelHechizoBlocker,
  queLevanta,
  queSeApunta,
  resolverDisparador,
  resolverEfecto,
  soloCura,
} from './spells.js';
import type {
  BattleStack,
  BattleState,
  DisparadorResuelto,
  EfectoResuelto,
  Side,
} from './types.js';

/**
 * Quien lanza los hechizos del héroe de `side`: su cuerpo en el tablero (desde
 * él miden el contacto, el alcance y la recta: P1 del plan del editor de magia),
 * su bando y su poder mágico; `null` sin héroe o sin cuerpo.
 */
export function lanzadorDelHeroe(state: BattleState, side: Side): Lanzador | null {
  const hero = state.heroes[side];
  if (hero === null) return null;
  const cuerpo = state.stacks.find((x) => x.side === side && x.origen.kind === 'heroe');
  if (cuerpo === undefined) return null;
  return { stack: cuerpo, bando: side, poder: hero.spellPower };
}

/** Una unidad que usa un hechizo como poder: sin poder mágico (P7). */
export function lanzadorDeLaUnidad(s: BattleStack): Lanzador {
  return { stack: s, bando: s.side, poder: 0 };
}

/** Lo que se apunta en una jugada: la unidad, la casilla o nada. */
export function apuntadoDe(target: string | undefined, at: Hex | undefined): Apuntado {
  if (target !== undefined) return { target };
  if (at !== undefined) return { at };
  return null;
}

/**
 * Por qué `h`, lanzado por `l`, no vale sobre `apuntado`, o `null`: lo que se elige
 * (una unidad, una casilla o nada), el bando del objetivo y la distancia de la
 * entrega. Sin `apuntado`, la pregunta del botón: ¿hay sobre qué lanzarlo? Con
 * `exigeHerida` (el poder que solo cura), a quien no le falta vida no vale.
 */
export function apuntadoBlocker(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado | undefined,
  exigeHerida: boolean,
): string | null {
  switch (queSeApunta(h)) {
    case 'nada':
      if (apuntado != null)
        return `«${h.nombre}» no se apunta: va ${h.entrega.tipo === 'sobreSi' ? 'sobre quien lo lanza' : 'a todo el tablero'}`;
      return null;
    case 'cadaver':
      return cadaverBlocker(state, h, l, apuntado);
    case 'unidad': {
      if (apuntado === undefined) {
        return state.stacks.some((t) => unidadBlocker(h, l, t, exigeHerida) === null)
          ? null
          : exigeHerida && soloCura(h)
            ? 'nadie de su bando tiene ninguna herida'
            : 'no hay ningún objetivo válido';
      }
      if (apuntado === null || !('target' in apuntado))
        return `«${h.nombre}» se lanza a una unidad`;
      const target = state.stacks.find((t) => t.id === apuntado.target);
      if (target === undefined) return `no hay ninguna unidad "${apuntado.target}"`;
      return unidadBlocker(h, l, target, exigeHerida);
    }
    case 'casilla': {
      if (apuntado === undefined) return null;
      if (apuntado === null || !('at' in apuntado)) return `«${h.nombre}» se lanza a una casilla`;
      const at = apuntado.at;
      if (!isInside(at)) return `(${at.col},${at.row}) no es una casilla del tablero`;
      if (h.entrega.tipo === 'proyectil' && hexEquals(at, l.stack.hex)) {
        return `«${h.nombre}» no se lanza a la casilla de quien lo lanza: no habría recta`;
      }
      return distanciaBlocker(h, l, at);
    }
  }
}

/**
 * Por qué `h`, que apunta a un cadáver (`objetivo: cadaver`), no vale lanzado por `l`
 * sobre `apuntado`, o `null`. En este orden: lo que se elige (una casilla), que no
 * haya nadie vivo en ella, que haya un cadáver sin gastar, que no sea el del héroe,
 * que de él salga algo (`queLevanta`) y la distancia. Sin `apuntado`, la pregunta
 * del botón: ¿hay algún cadáver que se pueda levantar desde aquí? Si los hay pero
 * ninguno a su alcance, se dice eso y no que no haya (H2 de QA, 09-11-2026: con el
 * único cadáver a 5 casillas y alcance 4, el botón decía «no hay ningún cadáver»).
 */
function cadaverBlocker(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado | undefined,
): string | null {
  if (apuntado === undefined) {
    const levantables = casillasConCadaver(state).filter(
      (at) => cadaverEnLaCasillaBlocker(state, h, at) === null,
    );
    if (levantables.length === 0) return 'no hay ningún cadáver que levantar';
    if (levantables.some((at) => distanciaBlocker(h, l, at) === null)) return null;
    // Lo que deja fuera por distancia es el contacto o un tope: la entrega libre llega a todo.
    const tope = alcanceDe(h);
    return tope === undefined
      ? `ningún cadáver que se pueda levantar está en contacto con ${l.stack.unit.name}`
      : `ningún cadáver que se pueda levantar está a su alcance (${conPlural(tope, 'casilla')})`;
  }
  if (apuntado === null || !('at' in apuntado)) return `«${h.nombre}» se lanza a un cadáver`;
  return cadaverEnLaCasillaBlocker(state, h, apuntado.at) ?? distanciaBlocker(h, l, apuntado.at);
}

/**
 * Por qué el cadáver de `at` no vale para `h`, sin mirar la distancia, o `null`: la
 * casilla, nadie vivo encima, un cadáver sin gastar, que no sea el del héroe y que
 * de él salga algo. La mitad de `cadaverBlocker` que no depende de quién lo lanza.
 */
function cadaverEnLaCasillaBlocker(state: BattleState, h: Hechizo, at: Hex): string | null {
  const donde = `(${at.col},${at.row})`;
  if (!isInside(at)) return `${donde} no es una casilla del tablero`;
  const vivo = vivoEn(state, at);
  if (vivo !== null) return `en ${donde} hay una unidad viva (${vivo.unit.name})`;
  const cadaver = cadaverEn(state, at);
  if (cadaver === null) {
    return state.stacks.some((x) => !isAlive(x) && hexEquals(x.hex, at))
      ? `el cadáver de ${donde} ya se levantó`
      : `en ${donde} no hay ningún cadáver`;
  }
  if (cadaver.origen.kind === 'heroe') return 'el cuerpo del héroe no se levanta';
  if (queLevanta(h, cadaver) === null) {
    return `«${h.nombre}» no levanta nada del cadáver de ${cadaver.unit.name}`;
  }
  return null;
}

/** Las casillas con algún muerto, sin repetir, en el orden de `stacks`. */
function casillasConCadaver(state: BattleState): readonly Hex[] {
  const vistas = new Set<string>();
  const out: Hex[] = [];
  for (const s of state.stacks) {
    const clave = `${s.hex.col},${s.hex.row}`;
    if (isAlive(s) || vistas.has(clave)) continue;
    vistas.add(clave);
    out.push(s.hex);
  }
  return out;
}

/** Por qué `t` no vale como la unidad elegida, o `null`: bando, vida, distancia y herida. */
function unidadBlocker(
  h: Hechizo,
  l: Lanzador,
  t: BattleStack,
  exigeHerida: boolean,
): string | null {
  const objetivo = objetivoDelHechizoBlocker(h, l.bando, t);
  if (objetivo !== null) return objetivo;
  const lejos = distanciaBlocker(h, l, t.hex);
  if (lejos !== null) return lejos;
  if (exigeHerida && soloCura(h) && curaDelHechizo(h, l.poder, t) <= 0) {
    return `${t.unit.name} no tiene ninguna herida`;
  }
  return null;
}

/** Hasta cuántas casillas llega la entrega de `h`, o `undefined` si no tiene tope (o es en contacto). */
function alcanceDe(h: Hechizo): number | undefined {
  const e = h.entrega;
  return e.tipo === 'alcance' ? e.casillas : e.tipo === 'proyectil' ? e.casillas : undefined;
}

/** Por qué `at` está fuera del alcance de la entrega de `h` desde `l`, o `null`. */
function distanciaBlocker(h: Hechizo, l: Lanzador, at: Hex): string | null {
  const d = hexDistance(l.stack.hex, at);
  if (h.entrega.tipo === 'contacto' && d > 1) {
    return `«${h.nombre}» se lanza en contacto, y eso está a ${d} casillas de ${l.stack.unit.name}`;
  }
  const tope = alcanceDe(h);
  if (tope !== undefined && d > tope) {
    return `«${h.nombre}» llega a ${conPlural(tope, 'casilla')}, y eso está a ${d}`;
  }
  return null;
}

/** El punto de impacto y los vivos que alcanza `h` lanzado por `l` sobre `apuntado`, ahora. */
export function afectadosDe(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado,
): readonly BattleStack[] {
  // Un cadáver no alcanza a nadie vivo: lo que hace es levantar (`levantar`, `battle.ts`).
  if (queSeApunta(h) === 'cadaver') return [];
  const afecta = h.afecta ?? 'todos';
  const area = areaDe(h);
  const vivosEn = (casillas: readonly Hex[], sin: BattleStack | null): BattleStack[] =>
    casillas.flatMap((c) => {
      const t = vivoEn(state, c);
      return t !== null && t !== sin && loAlcanza(afecta, l.bando, t.side) ? [t] : [];
    });
  const alrededor = (centro: Hex): BattleStack[] =>
    vivosEn(casillasDelArea(centro, typeof area === 'number' ? area : 0), null);
  switch (h.entrega.tipo) {
    case 'tablero':
      return state.stacks.filter((t) => isAlive(t) && loAlcanza(afecta, l.bando, t.side));
    case 'sobreSi':
      return area === 0 ? [l.stack] : alrededor(l.stack.hex);
    case 'proyectil': {
      if (apuntado === null || !('at' in apuntado)) return [];
      const linea = lineaDelDisparo(state, l.stack, apuntado.at);
      const tope = h.entrega.casillas;
      const dentro = (c: Hex): boolean => tope === undefined || hexDistance(l.stack.hex, c) <= tope;
      if (area === 'recta') return vivosEn(linea.alcance.map((c) => c.hex).filter(dentro), l.stack);
      const quien = linea.alcanzado;
      if (quien === null || !dentro(quien.hex)) return [];
      if (area === 0) return loAlcanza(afecta, l.bando, quien.side) ? [quien] : [];
      return alrededor(quien.hex);
    }
    default: {
      if (apuntado === null) return [];
      if ('at' in apuntado) return alrededor(apuntado.at);
      const t = stackById(state, apuntado.target);
      return area === 0 ? [t] : alrededor(t.hex);
    }
  }
}

/** Lo común de lo que cuelga un hechizo, sin el afectado. */
export interface ContextoDelHechizo {
  readonly source: string;
  readonly bando: Side;
  /** El stack que lo lanzó: cobra la experiencia del daño y cierra «turnoDe: lanzador». */
  readonly lanzador: BattleStack | null;
  readonly lanzadorId: string;
  /** Quien lleva el disparador que lo lanzó, si es un disparador. */
  readonly portador?: string;
  readonly poder: number;
  readonly duracion: Duracion | null;
  readonly seAcabaSiMuere?: string;
}

/** Los efectos de `h` resueltos con el poder de `l`, y las cargas de sus disparadores. */
export function resueltosDe(
  h: Hechizo,
  l: Lanzador,
): {
  readonly efectos: readonly (EfectoResuelto | DisparadorResuelto)[];
  readonly cargas: (d: DisparadorResuelto) => number | null;
} {
  const conCargas = new Map<DisparadorResuelto, number | null>();
  const efectos = h.efectos.flatMap((e): (EfectoResuelto | DisparadorResuelto)[] => {
    // `levantar` no se aplica a nadie: lo hace `levantar` (`battle.ts`).
    if (e.tipo === 'levantar') return [];
    if (e.tipo !== 'disparador') return [resolverEfecto(e, l.poder)];
    const d = resolverDisparador(e, l.poder, l.stack.id);
    conCargas.set(d, e.cargas ?? null);
    return [d];
  });
  return { efectos, cargas: (d) => conCargas.get(d) ?? null };
}

/** El contexto de `h` lanzado por `l`. */
export function contextoDe(h: Hechizo, l: Lanzador): ContextoDelHechizo {
  return {
    source: h.id,
    bando: l.bando,
    lanzador: l.stack,
    lanzadorId: l.stack.id,
    poder: l.poder,
    duracion: h.duracion ?? null,
    ...(h.seAcabaSiMuere === 'lanzador' ? { seAcabaSiMuere: l.stack.id } : {}),
  };
}

/**
 * Motivo por el que el héroe de `side` no puede lanzar `spellId` —sobre la unidad
 * `targetId` o la casilla `at` si se apunta a algo—, o `null` si sí puede. Mismo
 * patrón que `buildBlocker` en `town.ts`: la frase la escribe el núcleo y la
 * pantalla la enseña tal cual. Es la ÚNICA redacción de estas reglas: la consultan
 * el lanzamiento y `legalActions` al ofrecer.
 *
 * Sin objetivo la pregunta es «¿puede lanzarlo?» (un hechizo sobre sí o al tablero
 * no se apunta: es la respuesta entera); con objetivo, «¿sobre eso?».
 */
export function castBlocker(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId?: string,
  at?: Hex,
): string | null {
  const hero = state.heroes[side];
  if (hero === null) return SIN_HEROE;
  const porLaFase = faseBlocker(state, 'cast');
  if (porLaFase !== null) return porLaFase;
  if (hero.castThisRound) return 'el héroe ya lanzó un hechizo esta ronda';
  // El id se comprueba contra el libro ANTES de buscarlo en el catálogo: con un
  // id inventado, "no lo conoce" es más cierto y más útil que reventar.
  if (!hero.spells.includes(spellId)) return `el héroe no conoce "${spellId}"`;
  const h = hechizoDeLaBatalla(state, spellId);
  if (hero.mana < h.mana) return `maná insuficiente: cuesta ${h.mana} y quedan ${hero.mana}`;
  const l = lanzadorDelHeroe(state, side);
  if (l === null) return 'el héroe no está en el tablero';
  const impedido = impedimentoBlocker(state, l.stack, 'lanzar');
  if (impedido !== null) return impedido;
  const pregunta = targetId === undefined && at === undefined;
  return apuntadoBlocker(state, h, l, pregunta ? undefined : apuntadoDe(targetId, at), false);
}

// ---------------------------------------------------------------- poderes

/**
 * Por qué la unidad activa no puede usar el poder `poderId` (un hechizo de su
 * `UnitInfo.poderes`) —sobre `targetId` o `at` si se apunta—, o `null` si puede. La
 * ÚNICA redacción de estas reglas, como `castBlocker` para el héroe: la leen
 * `applyAction`, `legalActions` (y con ella la IA), la previsión y los botones.
 *
 * Reglas nuestras: al principio del turno, sin haberse movido, como disparar, y
 * usarlo es el turno entero; sin maná (P7). Un poder que solo cura no vale sobre
 * quien no tiene herida. Sin objetivo la pregunta es «¿puede usarlo?».
 */
export function poderBlocker(
  state: BattleState,
  poderId: PoderId,
  targetId?: string,
  at?: Hex,
): string | null {
  const previo = previoDelPoder(state, poderId);
  if ('motivo' in previo) return previo.motivo;
  const { s, h } = previo;
  const pregunta = targetId === undefined && at === undefined;
  return apuntadoBlocker(
    state,
    h,
    lanzadorDeLaUnidad(s),
    pregunta ? undefined : apuntadoDe(targetId, at),
    true,
  );
}

/**
 * Lo que no depende del objetivo, una vez: que le toque a alguien, que la activa
 * lo sepa, que no se haya movido y que nada se lo impida. Lo leen `poderBlocker` y
 * `legalActions`.
 */
export function previoDelPoder(
  state: BattleState,
  poderId: PoderId,
): { readonly motivo: string } | { readonly s: BattleStack; readonly h: Hechizo } {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return { motivo: 'no le toca a ninguna unidad' };
  const porLaFase = faseBlocker(state, 'power');
  if (porLaFase !== null) return { motivo: porLaFase };
  // Un id inventado se dice, no revienta: llega de fuera (un test, el arnés).
  const h = state.libro[poderId] ?? HECHIZOS_DEL_JUEGO.get(poderId);
  if (h === undefined || !(s.unit.poderes ?? []).includes(poderId)) {
    return { motivo: `${s.unit.name} no sabe «${h?.nombre ?? poderId}»` };
  }
  if (seHaMovido(state, s)) {
    return { motivo: `ya se ha movido este turno: «${h.nombre}» se usa al principio del turno` };
  }
  const impedido = impedimentoBlocker(state, s, 'lanzar');
  if (impedido !== null) return { motivo: impedido };
  return { s, h };
}

/**
 * Las jugadas de lanzar `h` que se ofrecen (`legalActions`): sin apuntar, a cada
 * unidad que vale, a la casilla de cada vivo que vale (vale cualquier casilla a
 * su alcance, y la prosa del agente lo dice) o, a un cadáver, a cada casilla con
 * uno que se pueda levantar. `vale` es el `*Blocker` de quien lo
 * lanza con el objetivo.
 */
export function jugadasDeLanzar(
  state: BattleState,
  h: Hechizo,
  vale: (target?: string, at?: Hex) => boolean,
): readonly { target?: string; at?: Hex }[] {
  switch (queSeApunta(h)) {
    case 'nada':
      return vale() ? [{}] : [];
    case 'unidad':
      return state.stacks.flatMap((t) => (vale(t.id) ? [{ target: t.id }] : []));
    case 'casilla':
      return state.stacks.flatMap((t) =>
        isAlive(t) && vale(undefined, t.hex) ? [{ at: t.hex }] : [],
      );
    case 'cadaver':
      return casillasConCadaver(state).flatMap((at) => (vale(undefined, at) ? [{ at }] : []));
  }
}
