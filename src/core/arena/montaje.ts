/**
 * La arena: unidades con cifras inventadas que se prueban peleando, fuera de una
 * partida (`/arena/`, decisión del usuario del 02-10-2026).
 *
 * Las hojas de las cinco facciones (`assets/unidades/`) tienen arte, y sus cifras
 * viven en el catálogo de unidades (`data/unidades.json`, `unidad/catalogo.ts`), que
 * es el del juego desde el 19-10-2026 (sustituyó a `data/creatures.json`): la
 * persona las ajusta aquí y la página las guarda en él.
 *
 * **El juego no se entera.** Una unidad de arena entra en la batalla por el
 * catálogo de la pelea (`BattleSide.catalogo`, `catalogoDelMontaje`): el motor
 * saca de él sus cifras una vez y no vuelve a preguntar, así que ni el catálogo
 * ni ninguna partida cambian por tener una arena. El `body` del stack es solo el
 * id de su CUERPO —una hoja (`cuerpo.hoja`)—, que es lo que el cliente pinta. Las
 * criaturas del catálogo no entran en la arena (13-10-2026: «solo cuentan los 5 que
 * hay en la arena»).
 *
 * **Cuerpo y equipo**: una unidad son las cifras de su cuerpo más lo que lleva
 * puesto (`unidadDeCombate` → `conEquipo`). Todas nacieron del mismo cuerpo común
 * y lo que distingue un perfil de arma es su equipo (`KIT_DEL_PERFIL`); por eso el
 * nivel se mide con el equipo puesto (18-10-2026), y un templario con mandoble y
 * arnés es de más nivel que uno con espada. El porqué del cuerpo común, en la
 * entrada «Nueva unidad» de `docs/historia.md`.
 *
 * **El formato de la unidad y su regla no viven aquí** sino en `unidad/formato.ts`,
 * sin batalla, para que el catálogo del juego los lea sin traerse este montador
 * (simplify de F1, 18-10-2026). En `arena/` está lo que la arena hace con ellas:
 * los lados (`lados.ts`), la unidad nueva, las piezas, el héroe, la ficha, el
 * montaje (aquí: sus lados, el catálogo con que pelea, la batalla que sale de él,
 * `batallaDeArena`, y cómo acabó, `finalDeArena`), el retoque, el enlace y las
 * murallas. Era un solo `core/arena.ts` (y `arena-murallas.ts`) hasta la fase N de
 * la reorganización (07-11-2026).
 */
import { quienNoEscala } from '../battle/asalto.js';
import { type CausaDelFinal, causaDelFinal } from '../battle/consultas.js';
import { despliegueBlocker } from '../battle/despliegue.js';
import { type BattleSide, createBattle } from '../battle/montaje.js';
import { SIN_MURALLA } from '../battle/muralla.js';
import type {
  BattleState,
  FichaEnPalabras,
  MurallaDeBatalla,
  Side,
  StackDeBatalla,
} from '../battle/types.js';
import type { ReglasDelCombate } from '../combate.js';
import type { CatalogoDeEquipo, EquipoAtado } from '../equipo/atado.js';
import { type CatalogoDeHechizos, HECHIZOS_DEL_JUEGO } from '../magia/catalogo.js';
import { unidadesQueLevanta } from '../magia/formato.js';
import type { Rng } from '../rng.js';
import type { UnitInfo } from '../types.js';
import { CATALOGO_DEL_JUEGO, type CatalogoDeUnidades } from '../unidad/catalogo.js';
import { type Unidad, unidadDeCombate, validarUnidad } from '../unidad/formato.js';
import { claveDeFicha, fichaDelHeroe, fichaEnPalabras, tipoDeLaFuente } from './ficha.js';
import { type HeroeDeArena, heroeDeArena } from './heroe.js';
import { type FuenteDeArena, LADOS, type Lado, ladoDe } from './lados.js';

// ------------------------------------------------------------- el montaje

/** Lo que lleva un lado del montaje: sus unidades y, si lo lleva, su héroe. */
export interface LadoDeArena {
  readonly unidades: readonly FuenteDeArena[];
  readonly heroe: HeroeDeArena | null;
}

/**
 * Los dos lados, el catálogo de equipo y la muralla del tablero, si la hay: es
 * del tablero, y sus puertas las abre y las cierra la derecha, que defiende
 * (`battle/muralla.ts`). Las reglas son las del juego, las mismas para los dos.
 */
export interface MontajeDeArena {
  readonly izquierda: LadoDeArena;
  readonly derecha: LadoDeArena;
  readonly muralla?: MurallaDeBatalla;
  /**
   * La complejidad de la pelea (`core/combate.ts`): el tope por bando y la rueda,
   * con sus dos selectores en la página (la de siempre, `COMBATE_COMPLETO`, si
   * nadie los toca). Obligatoria, como en el enlace: nadie la pone por defecto.
   */
  readonly combate: ReglasDelCombate;
  /**
   * El catálogo de equipo con que pelea, hecho (`catalogoDeEquipo`): el que edita
   * la página, con lo que no se ha guardado, o el del juego (`EQUIPO_DEL_JUEGO`).
   * Del montaje y no de cada fuente: dos unidades de la misma pelea con dos espadas
   * distintas no tendrían sentido. La batalla no lo guarda: cada golpe lleva el
   * nombre y las cifras de su arma (`UnitInfo.armas`), y quien cambia una pieza a
   * media pelea le da el suyo (`retocarEnBatalla`).
   */
  readonly equipo: CatalogoDeEquipo;
  /**
   * Los hechizos con que pelea (el editor de magia, 06-11-2026): los de la página,
   * con lo que no se ha guardado, o los del juego si no se dice. De ellos sale el
   * libro de la batalla (`BattleState.libro`): los de los héroes y los poderes de
   * las unidades.
   */
  readonly hechizos?: CatalogoDeHechizos;
  /**
   * Las unidades del catálogo de la página, con lo que no se ha guardado (09-11-2026,
   * N1 de QA de «Levantar zombi»): de ellas sale lo que levanta un hechizo y no pelea
   * desde el principio (el zombi, el esqueleto), con las cifras que enseña su ficha.
   * Sin ellas, las del catálogo del juego. No viaja en el enlace: al abrirlo, la
   * página ya tiene las suyas.
   */
  readonly unidadesDeLaPagina?: ReadonlyMap<string, Unidad>;
}

/**
 * Un catálogo de unidades con las piezas y los hechizos como los edita la arena:
 * las unidades de la pelea (`unidades`, por id) y lo que levantan sus hechizos.
 * Lo hace siempre `catalogoDeLaPelea`; tras un retoque, `catalogoTrasElRetoque`.
 */
export type CatalogoDeLaArena = CatalogoDeUnidades & {
  readonly equipo: CatalogoDeEquipo;
  readonly hechizos?: CatalogoDeHechizos;
  readonly unidades: ReadonlyMap<string, Unidad>;
  /** Las de la página (`MontajeDeArena.unidadesDeLaPagina`), de donde sale lo que se levanta sin pelear. */
  readonly deLaPagina?: ReadonlyMap<string, Unidad>;
};

/**
 * El catálogo de una pelea de la arena: las unidades de su montaje, comprobadas,
 * y sus piezas (`MontajeDeArena.equipo`). Es lo que la página no ha guardado: de
 * él salen las cifras de cada stack (`BattleSide.catalogo`) y su cuerpo sin
 * equipo (`cuerpoDe`), en el montaje y en cada retoque.
 */
export function catalogoDelMontaje(montaje: MontajeDeArena): CatalogoDeLaArena {
  const eq = montaje.equipo;
  // Se vuelven a mirar porque la batalla es la última puerta y un objeto a mano
  // (un test, el arnés) no pasó por ninguna otra.
  return catalogoDeLaPelea(
    [...montaje.izquierda.unidades, ...montaje.derecha.unidades].map((f) =>
      validarUnidad(f.unidad, eq),
    ),
    eq,
    montaje.hechizos,
    montaje.unidadesDeLaPagina,
  );
}

/**
 * Un catálogo con estas unidades, estas piezas y estos hechizos (los del juego si no
 * se dicen). Un id, una unidad: la misma puede salir en varios puestos, pero dos
 * distintas con el mismo id lanzan diciéndolo (un stack dice qué unidad es por su
 * id, `OrigenDelStack.unidad`, y el retoque de un tipo cambia todos los suyos).
 *
 * Lo que levanta un hechizo (`unidadesQueLevanta`: el zombi, el esqueleto) puede no
 * pelear desde el principio (08-11-2026, «Levantar zombi»), y entonces sale de las
 * unidades de la página (`deLaPagina`, comprobadas con estas piezas), con lo que no
 * se ha guardado, y si no las hay, del catálogo del juego (N1 de QA, 09-11-2026:
 * antes iba siempre al del juego y el zombi levantado no tenía las cifras de su
 * ficha). Si pelea, sale con las suyas. **Solo eso**: otro id que no pelea lanza,
 * como antes (desde /simplify, 09-11-2026).
 */
export function catalogoDeLaPelea(
  unidades: readonly Unidad[],
  equipo: CatalogoDeEquipo,
  hechizos?: CatalogoDeHechizos,
  deLaPagina?: ReadonlyMap<string, Unidad>,
): CatalogoDeLaArena {
  const porId = new Map<string, Unidad>();
  for (const u of unidades) {
    const otra = porId.get(u.id);
    if (otra !== undefined && JSON.stringify(otra) !== JSON.stringify(u)) {
      throw new Error(
        `hay dos unidades distintas con el id «${u.id}» en la pelea: una unidad, unas cifras`,
      );
    }
    porId.set(u.id, u);
  }
  const seLevantan = new Set(
    [...(hechizos ?? HECHIZOS_DEL_JUEGO).values()].flatMap((h) => unidadesQueLevanta(h)),
  );
  return {
    equipo,
    ...(hechizos === undefined ? {} : { hechizos }),
    ...(deLaPagina === undefined ? {} : { deLaPagina }),
    unidades: porId,
    unidad: (id) => {
      const u = porId.get(id);
      if (u !== undefined) return u;
      if (seLevantan.has(id)) {
        const suya = deLaPagina?.get(id);
        // El del juego lanza con un id que no existe, nombrándolo.
        return suya === undefined ? CATALOGO_DEL_JUEGO.unidad(id) : validarUnidad(suya, equipo);
      }
      throw new Error(`«${id}» no es ninguna unidad de esta pelea`);
    },
  };
}

/** Las cifras con las que pelea una unidad del montaje, comprobadas. */
export function unidadDeLaFuente(fuente: FuenteDeArena, eq: EquipoAtado): UnitInfo {
  return unidadDeCombate(validarUnidad(fuente.unidad, eq), eq);
}

/**
 * Por qué un bando de `unidades` (y su héroe, si `conHeroe`: cuenta como uno más)
 * no cabe en el tope de la pelea `tope`, o `null`: **la única regla del tope en la
 * arena**, la que leen el montaje, el enlace y el selector de la página al bajarlo.
 */
export function topeDelBandoBlocker(
  quien: string,
  unidades: number,
  conHeroe: boolean,
  tope: number,
): string | null {
  const cuantos = unidades + (conHeroe ? 1 : 0);
  if (cuantos <= tope) return null;
  return `${quien} lleva ${cuantos} unidades${conHeroe ? ', contando a su héroe,' : ''} y caben ${tope}: quita ${cuantos - tope}`;
}

function bandoDeArena(
  lado: LadoDeArena,
  nombre: string,
  catalogo: CatalogoDeUnidades,
  tope: number,
): BattleSide {
  const { unidades, heroe } = lado;
  if (unidades.length === 0 && heroe === null) {
    throw new Error(`el bando ${nombre} está vacío: pon al menos una unidad`);
  }
  // `createBattle` también lo comprueba, pero diciendo «el atacante»: en la arena
  // no hay atacante, hay izquierda y derecha.
  const noCabe = topeDelBandoBlocker(`el bando ${nombre}`, unidades.length, heroe !== null, tope);
  if (noCabe !== null) throw new Error(noCabe);
  // Cada unidad, un individuo de su unidad del catálogo de la pelea: el arte
  // de su hoja (`body`) y las cifras con su equipo, como en el juego.
  const army: StackDeBatalla[] = unidades.map((f) => ({
    creature: f.unidad.id,
    count: 1,
    ...(f.escalera === true ? { escalera: true } : {}),
  }));
  return { army, hero: heroe === null ? null : heroeDeArena(heroe, catalogo.equipo), catalogo };
}

const SIN_LADOS: ReadonlySet<Lado> = new Set();

/**
 * Los dos bandos de `montaje` como los pelea `createBattle`: cada unidad del
 * catálogo de la pelea y el héroe, en el orden del montaje. Los monta
 * `batallaDeArena`, y la medida de la IA contra la IA (`tools/qa/medidas/arena-ia.ts`) los
 * pide para pelearlos tras una muralla del mapa con el atacante al asalto
 * (`alAsalto`: el héroe con escalera, que la arena no da).
 */
export function bandosDeArena(montaje: MontajeDeArena): {
  readonly izquierda: BattleSide;
  readonly derecha: BattleSide;
} {
  const catalogo = catalogoDelMontaje(montaje);
  const { tope } = montaje.combate;
  return {
    izquierda: bandoDeArena(montaje.izquierda, LADOS.izquierda.adjetivo, catalogo, tope),
    derecha: bandoDeArena(montaje.derecha, LADOS.derecha.adjetivo, catalogo, tope),
  };
}

/**
 * Una batalla de arena: la izquierda ataca y la derecha defiende, con las reglas
 * del juego (`createBattle`, la única puerta: la arena no tiene interruptores
 * desde el 19-10-2026). Los stacks de la tropa salen en el orden de cada lista (`slot` =
 * su puesto) y el héroe, si lo hay, el último (`<bando>-heroe`): es lo que deja a
 * quien llama saber qué puesto del montaje es cada stack. La muralla, si la
 * hay, es del tablero (`battle/muralla.ts`). Los lados de `aMano` (los que
 * lleva la persona, «Yo») despliegan en pantalla, como en el juego: la batalla
 * nace en su despliegue (`BattleSide.despliegaAMano`); sin ninguno, ya en la ronda 1.
 */
export function batallaDeArena(
  montaje: MontajeDeArena,
  rng: Rng,
  aMano: ReadonlySet<Lado> = SIN_LADOS,
): BattleState {
  const eq = montaje.equipo;
  const bandos = bandosDeArena(montaje);
  const lado = (l: Lado): BattleSide =>
    aMano.has(l) ? { ...bandos[l], despliegaAMano: true } : bandos[l];
  const batalla = createBattle(
    lado('izquierda'),
    lado('derecha'),
    rng,
    montaje.combate,
    montaje.muralla ?? SIN_MURALLA,
    montaje.hechizos ?? HECHIZOS_DEL_JUEGO,
  );
  // La ficha de cada tipo y de cada héroe, con la que el retoque compara.
  const fichas: Record<string, FichaEnPalabras> = {};
  for (const lado of ['izquierda', 'derecha'] as const) {
    for (const f of montaje[lado].unidades) {
      fichas[claveDeFicha(tipoDeLaFuente(f))] = fichaEnPalabras(f, eq);
    }
    const heroe = montaje[lado].heroe;
    if (heroe !== null) fichas[claveDeFicha({ kind: 'heroe', lado })] = fichaDelHeroe(heroe, eq);
  }
  return { ...batalla, fichasDeArena: fichas };
}

/**
 * Por qué este montaje no cabe con su muralla en sus columnas de salida, o
 * `null` si cabe: la regla de `despliegue`, preguntada antes de pelear para que
 * el editor lo diga mientras se dibuja. El héroe ocupa un hueco más, detrás de
 * su tropa. No mira nada más que el sitio: un bando vacío o una unidad mala los
 * dice `batallaDeArena`.
 */
export function despliegueDeArenaBlocker(montaje: MontajeDeArena): string | null {
  const muralla = montaje.muralla ?? SIN_MURALLA;
  const eq = montaje.equipo;
  const unidades = (lado: LadoDeArena): UnitInfo[] => [
    ...lado.unidades.map((f) => unidadDeLaFuente(f, eq)),
    ...(lado.heroe === null ? [] : [heroeDeArena(lado.heroe, eq).cuerpo]),
  ];
  return (
    despliegueBlocker(unidades(montaje.izquierda), 'attacker', muralla) ??
    despliegueBlocker(unidades(montaje.derecha), 'defender', muralla)
  );
}

/**
 * Por qué esta unidad, en este lado, no usaría una escalera, o `null` si sí: la
 * regla de `quienNoEscala`, preguntada en el montaje. Sin ella la casilla «Lleva
 * escalera» se marcaba en una voladora y
 * `createBattle` la tiraba sin decir nada (QA de la muralla alta, M1).
 */
export function escaleraDeArenaBlocker(
  fuente: FuenteDeArena,
  lado: Lado,
  eq: EquipoAtado,
): string | null {
  return quienNoEscala(LADOS[lado].bando, unidadDeLaFuente(fuente, eq));
}

/**
 * Cómo acabó una pelea, dicho por el lado del montaje, y por qué, con la regla
 * del motor que la cerró (`causaDelFinal`): la misma que la batalla del juego.
 * `empate` solo pesa en `agotada`: los dos lados siguen en pie, el motor la
 * cerró sin que nadie ganara (`finishByExhaustion`) y gana quien tiene más
 * unidades en pie y, a igualdad, quien defiende —la derecha—. Sin decirlo,
 * «gana el derecho» tras cien rondas en que nadie se hizo daño parecía que la
 * derecha era más fuerte (H4 de QA); y leyendo «quedan unidades en los dos
 * lados» como «por tiempo», la muerte de un héroe en la ronda 1 se contaba como
 * cien rondas sin vencedor (H1 de QA del banco).
 */
export function finalDeArena(battle: BattleState): {
  readonly ganador: Lado;
  readonly causa: CausaDelFinal;
  readonly empate: boolean;
} | null {
  const causa = causaDelFinal(battle);
  if (battle.finished === null || causa === null) return null;
  const enPie = (bando: Side): number =>
    battle.stacks.filter((s) => s.side === bando && s.count > 0).reduce((n, s) => n + s.count, 0);
  return {
    ganador: ladoDe(battle.finished.winner),
    causa,
    empate: enPie(LADOS.izquierda.bando) === enPie(LADOS.derecha.bando),
  };
}
