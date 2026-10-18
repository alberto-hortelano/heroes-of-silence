/**
 * La arena: unidades con cifras inventadas que se prueban peleando, fuera de una
 * partida (`/arena/`, decisión del usuario del 02-10-2026).
 *
 * Las hojas de las cinco facciones (`assets/unidades/`) tienen arte y **no tienen
 * cifras en ningún sitio**: el catálogo del juego (`data/creatures.json`) solo
 * conoce a caballeros y nigromantes. Sus cifras viven en el catálogo de unidades
 * (`data/unidades.json`, `core/catalogo.ts`): la persona las ajusta aquí y la
 * página las guarda en él.
 *
 * **El juego no se entera.** Una unidad de arena entra en la batalla por la vía
 * de los personajes de `createBattle` (`members`): el motor toma
 * `profile.unit` tal cual y no vuelve a llamar a `creature()`, así que ni el
 * catálogo ni ninguna partida cambian por tener una arena. El `body` del stack
 * es solo el id de su CUERPO —una hoja (`cuerpo.hoja`)—, que es lo que el
 * cliente pinta. Las criaturas del catálogo no entran en la arena (13-10-2026: «solo
 * cuentan los 5 que hay en la arena»).
 *
 * **Cuerpo y equipo**: una unidad son las cifras de su cuerpo más lo que lleva
 * puesto (`unidadDeCombate` → `conEquipo`). Todas nacieron del mismo cuerpo común
 * y lo que distingue un perfil de arma es su equipo (`KIT_DEL_PERFIL`); por eso el
 * nivel se mide con el equipo puesto (18-10-2026), y un templario con mandoble y
 * arnés es de más nivel que uno con espada. El porqué del cuerpo común, en la
 * entrada «Nueva unidad» de `docs/historia.md`.
 *
 * **El formato de la unidad y su regla no viven aquí** sino en `core/unidad.ts`,
 * sin batalla, para que el catálogo del juego los lea sin traerse este montador
 * (simplify de F1, 18-10-2026). Aquí está lo que la arena hace con ellas: el
 * montaje, la ficha, las piezas, el retoque y el enlace.
 */
import {
  type BattleMember,
  type BattleSide,
  type CausaDelFinal,
  causaDelFinal,
  crearBatallaConReglas,
  despliegueBlocker,
  type HeroeDelBando,
  mandoDe,
  quienNoEscala,
} from './battle/battle.js';
import type { StackEffect } from './battle/effects.js';
import { MODOS_DE_LA_ARENA, type ModosDeArena } from './battle/modos.js';
import { type MurallaDeBatalla, SIN_MURALLA, validarMuralla } from './battle/muralla.js';
import { esDeCura, poder, poderDeHabilidad } from './battle/poderes.js';
import { REGLAS_DEL_JUEGO, type ReglasDeBatalla } from './battle/reglas.js';
import { ruedaDelArmaEnPalabras } from './battle/rueda.js';
import {
  allSpells,
  delHeroe,
  duracionDeLoQueLanza,
  efectoDe,
  ordenDelLibro,
  spell,
  spellAmount,
} from './battle/spells.js';
import type {
  BattleStack,
  BattleState,
  FichaEnPalabras,
  Side,
  TipoDeArena,
} from './battle/types.js';
import {
  baseBlocker,
  conElFichero,
  diferenciaDe,
  esPiezaConBase,
  LIDERAZGO,
  type Pieza,
  type PiezaConBase,
  type PiezaEscrita,
  piezaCanonica,
  piezaConBaseCanonica,
  problemasDePieza,
  problemasDePiezaConBase,
  resolverBases,
} from './data.js';
import {
  aDosManos,
  EQUIPO_BASE,
  type EquipoAtado,
  equipoCon,
  idsPuestos,
  mismasCifras,
  nadaEnElHueco,
  PIEZAS_DEL_CATALOGO,
  quitarPieza,
} from './hero/equipo.js';
import { cifrasDelIndividuo, EXPERIENCIA_INICIAL_DE_HEROE } from './hero/experiencia.js';
import { CIFRAS_DEL_HEROE_INICIAL, cuerpoDelHeroe, HERO_BODY, maxMana } from './hero/hero.js';
import { indiceDePoder, medidaBlocker, nivelDelIndice } from './nivel.js';
import type { Rng } from './rng.js';
import {
  type CifraDelHueco,
  type CreatureTrait,
  camposDelHueco,
  describirCoste,
  type EquipoDeArena,
  HUECOS_DE_LA_ARENA,
  type HuecoDeArena,
  NOMBRE_DE_HUECO,
  type Stack,
  type UnitInfo,
} from './types.js';
import {
  armaDeCuerpoBlocker,
  CUERPO_COMUN,
  casillasValidas,
  cuerpoDeCombate,
  ESPADA_DE_LA_ARENA,
  equipoDeArenaBlocker,
  esDeLaArena,
  FACCIONES_DE_ARENA,
  type FaccionDeArena,
  KIT_DEL_PERFIL,
  NOMBRE_DE_FACCION_DE_ARENA,
  nivelesDeLaEspada,
  PERFILES_DE_ARENA,
  type PerfilDeArena,
  type UnidadDeArena,
  unidadDeCombate,
  validarUnidadDeArena,
} from './unidad.js';
import {
  deLaLista,
  type ElementoSinValidar,
  entero,
  esIdDeArena,
  esIdDePieza,
  lista,
  revisarLista,
  sinRepetir,
  texto,
  todasValidas,
} from './validar.js';

/**
 * Los dos lados del montaje y lo que el motor sabe de ellos: la izquierda ataca
 * y la derecha defiende. Una tabla, porque «izquierdo», «izquierda» y
 * `attacker` se escribían a mano en siete sitios.
 */
export type Lado = 'izquierda' | 'derecha';
export const LADOS: Readonly<
  Record<Lado, { readonly bando: Side; readonly adjetivo: string; readonly rotulo: string }>
> = {
  izquierda: { bando: 'attacker', adjetivo: 'izquierdo', rotulo: 'Izquierda' },
  derecha: { bando: 'defender', adjetivo: 'derecho', rotulo: 'Derecha' },
};

/** El lado del montaje de un bando del motor. */
export function ladoDe(bando: Side): Lado {
  return bando === LADOS.izquierda.bando ? 'izquierda' : 'derecha';
}

/**
 * Una hoja tal como la sirve el servidor de desarrollo: quién es, si es un
 * héroe y con qué arte se pinta, para pintarla sin otra petición. Una
 * declaración, que leen el servidor (`tools/arena/borrador.ts`) y la página.
 * Es un tipo de cable sin regla de juego: el motor no lo lee.
 */
export interface HojaDeArena {
  readonly id: string;
  readonly nombre: string;
  readonly faccion: FaccionDeArena;
  readonly perfil: PerfilDeArena;
  /**
   * El personaje del que es una hoja: el taller pinta a veces el mismo con varios
   * equipos («Guerrero con escudo» y «con arma a dos manos»), y todas sus hojas
   * comparten cuerpo y velocidad (`tools/arena/velocidades.ts`). Sin personaje
   * declarado, el de la propia hoja.
   */
  readonly personaje: string;
  readonly heroe: boolean;
  /**
   * Las casillas del CUERPO de su personaje: sin el equipo, que las cambia (el
   * escudo resta una). Con su perfil por defecto pelea con `casillas` más la
   * velocidad de su equipo.
   */
  readonly casillas: number;
  /**
   * El juego de armas de su Y Bot (`espada-escudo`, `baston`…): con él se pinta
   * si no tiene sus ocho direcciones.
   */
  readonly juego: string;
  /**
   * Los ocho `dN/atlas.json` de su arte propio, en el orden de las direcciones,
   * o `null` si no los tiene todos. Los comprueba `comoDireccion8d` al
   * registrarla para pintarla.
   */
  readonly direcciones: readonly unknown[] | null;
  /**
   * Por qué no se puede montar, o `null` si se puede: una unidad con su arte
   * propio a medias (el taller la está generando, #140). Se lista con el motivo
   * y no se pinta: con el Y Bot sería otra figura sin decirlo.
   */
  readonly incompleta: string | null;
}

/**
 * Las direcciones de una figura: las ocho, o ninguna. Es
 * `NOMBRES_DE_DIRECCION.length` (`src/shared/arte.ts`), escrito aquí porque
 * `core` no importa de `shared`: si cambia allí, cambia aquí, y el test de la
 * arena que manda siete lo vigila.
 */
const DIRECCIONES_DE_FIGURA = 8;

/**
 * La lista de hojas que llega por la red, comprobada: es la puerta por la que
 * entran el perfil y la facción, así que después nadie tiene que volver a
 * preguntar si existen.
 */
export function validarHojasDeArena(valor: unknown): readonly HojaDeArena[] {
  if (!Array.isArray(valor)) throw new Error('la lista de hojas de la arena no es una lista');
  return valor.map((v: unknown): HojaDeArena => {
    if (typeof v !== 'object' || v === null)
      throw new Error('una hoja de la arena no es un objeto');
    const h = v as Record<string, unknown>;
    const id = texto(h.id, 'el id', 'una hoja de la arena');
    const quien = `la hoja "${id}"`;
    if (typeof h.heroe !== 'boolean') throw new Error(`${quien}: no dice si es un héroe`);
    return {
      id,
      nombre: texto(h.nombre, 'el nombre', quien),
      faccion: deLaLista(h.faccion, FACCIONES_DE_ARENA, 'la facción', quien),
      perfil: deLaLista(h.perfil, PERFILES_DE_ARENA, 'el perfil', quien),
      personaje: texto(h.personaje, 'el personaje', quien),
      heroe: h.heroe,
      casillas: casillasValidas(h.casillas, quien),
      juego: texto(h.juego, 'el juego de armas', quien),
      direcciones: direccionesValidas(h.direcciones, quien),
      incompleta: incompletaValida(h.incompleta, h.direcciones, quien),
    };
  });
}

function incompletaValida(valor: unknown, direcciones: unknown, quien: string): string | null {
  if (valor === null) return null;
  const motivo = texto(valor, 'por qué está incompleta', quien);
  if (direcciones !== null)
    throw new Error(`${quien}: dice que está incompleta y trae sus direcciones`);
  return motivo;
}

function direccionesValidas(valor: unknown, quien: string): readonly unknown[] | null {
  if (valor === null) return null;
  if (!Array.isArray(valor) || valor.length !== DIRECCIONES_DE_FIGURA) {
    throw new Error(
      `${quien}: trae ${Array.isArray(valor) ? valor.length : 'algo que no es una lista de'} direcciones, y son ${DIRECCIONES_DE_FIGURA} o ninguna`,
    );
  }
  return valor;
}

/** Los rasgos con los que nace un cuerpo: los suyos y `undead` si es de los no muertos. */
function rasgosDelCuerpo(
  faccion: FaccionDeArena,
  suyos: readonly CreatureTrait[],
): readonly CreatureTrait[] {
  return faccion === 'no-muertos' && !suyos.includes('undead') ? [...suyos, 'undead'] : suyos;
}

/**
 * Los ids que una unidad nueva no puede tomar, por separado para que nadie se
 * deje un grupo. **También los del catálogo que no validan** (H1 de QA): se
 * conservan tal cual al guardar, pero mandar una válida con su id es arreglarla
 * (`claveSinValidar`, `tools/arena/borrador.ts`), así que una nueva con ese id la
 * sustituía sin aviso.
 */
export interface IdsOcupados {
  /** Las unidades del catálogo que valen, las nuevas incluidas. */
  readonly validas: readonly string[];
  /** Las del catálogo que no validan y se conservan al guardar. */
  readonly sinValidar: readonly string[];
  /** Las hojas del taller: cada una es la unidad con su id. */
  readonly hojas: readonly string[];
}

/**
 * Una unidad NUEVA (decisión del usuario, 12-10-2026: «que el editor de
 * personajes permita crear uno desde cero»): el cuerpo común con la Espada de la
 * arena y nada más (sin arma no se combate: `armaDeCuerpoBlocker`), con el
 * arte de la hoja y un id propio y único: `<hoja>-<n>`, con el primer `n` ≥ 2 que
 * no esté en `ocupados`. Su nivel no se escribe: nace donde caiga su índice
 * (`indiceDePoder`, con la Espada puesta), el 2.
 *
 * De su hoja toma la facción, las casillas del cuerpo de su personaje y los
 * rasgos de su perfil (`charge`, el del caballo; los no muertos, `undead`: un
 * esqueleto vivo, con moral, era raro, M7 de QA); ni el equipo, ni los poderes,
 * ni lo que el perfil cobra. **Es la única unidad que no sale del catálogo**
 * (`data/unidades.json`): todas las demás se leen de él (simplify de F1,
 * 18-10-2026). Desde una criatura del catálogo del juego ya no se crea
 * (13-10-2026: en la arena solo están las cinco facciones de las hojas). Lo que
 * no se monta (una hoja a medias) lo dice la página antes de llamarla.
 */
export function unidadNueva(
  hoja: Pick<HojaDeArena, 'id' | 'nombre' | 'faccion' | 'perfil' | 'casillas'>,
  ocupados: IdsOcupados,
  eq: EquipoAtado,
): UnidadDeArena {
  const todos = new Set([...ocupados.validas, ...ocupados.sinValidar, ...ocupados.hojas]);
  let n = 2;
  while (todos.has(`${hoja.id}-${n}`)) n++;
  return validarUnidadDeArena(
    {
      id: `${hoja.id}-${n}`,
      name: `${hoja.nombre} ${n}`,
      faction: hoja.faccion,
      cuerpo: { hoja: hoja.id },
      ...CUERPO_COMUN,
      casillas: hoja.casillas,
      traits: rasgosDelCuerpo(hoja.faccion, KIT_DEL_PERFIL[hoja.perfil].traits),
      habilidades: [],
      // Sin arma no se combate (18-10-2026): nace con la Espada, la versátil.
      equipo: { arma: ESPADA_DE_LA_ARENA },
    },
    eq,
  );
}

/**
 * La unidad con la pieza `id` de `eq` (las de la arena: `catalogoDeLaArena`)
 * puesta en su hueco: lo que hubiera ahí se quita. Lanza con el motivo de
 * `ponerPieza` (`manosBlocker`: un arma a dos manos no admite escudo) diciendo a
 * quién.
 */
export function equiparEnArena(u: UnidadDeArena, id: string, eq: EquipoAtado): UnidadDeArena {
  return { ...u, equipo: eq.ponerPieza(u.equipo, id, u.name).equipo };
}

/** La unidad sin lo que lleve en `hueco`; si no lleva nada ahí, se dice. */
export function quitarEnArena(u: UnidadDeArena, hueco: HuecoDeArena): UnidadDeArena {
  const { equipo, quitada } = quitarPieza(u.equipo, hueco);
  if (quitada === null) throw new Error(nadaEnElHueco(u.name, hueco));
  return { ...u, equipo };
}

// ------------------------------------------------------------- las piezas de la arena

/**
 * Las piezas con que pelea la arena: las lecturas atadas a su catálogo, resuelto
 * (`EquipoAtado`), y cómo está escrita cada una (`escritas`: entera o sobre su
 * base), por id. La ficha, el cambio de base y lo que se guarda leen las escritas;
 * todo lo que pelea, las resueltas.
 */
export type CatalogoDeLaArena = EquipoAtado & {
  readonly escritas: ReadonlyMap<string, PiezaEscrita>;
};

/**
 * Las piezas con que pelea la arena: las del juego (`data/equipo.json`) con las
 * de su borrador encima (`data/borradores/equipo.json`): una con el id de una del
 * fichero la sustituye —su cambio vale solo aquí— y una con un id nuevo se añade
 * detrás. **El juego no lo ve**: ni el botín, ni la armería, ni el agente, que
 * leen `EQUIPO` y sus listas. Comprueba cada pieza (`validarPiezaDeArena`), que
 * ninguna vaya dos veces, y las resuelve con sus bases (`resolverBases`, la única
 * suma de una base, que juzga cada resuelta con la regla de una pieza); lanza con
 * la primera que no vale. Da las lecturas de las piezas atadas a ese catálogo
 * (`equipoCon`): la arena no lee una pieza por otro camino.
 *
 * Las fronteras (el montaje, la batalla, el retoque, el enlace, el disco) llevan
 * la lista del borrador, escrita; el catálogo se hace aquí, donde se resuelve.
 */
export function catalogoDeLaArena(delBorrador: readonly PiezaEscrita[]): CatalogoDeLaArena {
  const vistas = new Set<string>();
  const validadas = delBorrador.map((crudo) => {
    const p = validarPiezaDeArena(crudo);
    if (vistas.has(p.id)) throw new Error(`la pieza «${p.nombre}» («${p.id}») va dos veces`);
    vistas.add(p.id);
    return p;
  });
  const r = resolverBases(validadas);
  const [mal] = r.problemas.values();
  if (mal !== undefined) throw new Error(mal);
  return { ...equipoCon(r.piezas), escritas: r.escritas };
}

/**
 * Lo que la arena cambia o añade de un catálogo: las piezas, escritas, que no son
 * la del fichero tal cual (`selloDePieza`), en su orden. La inversa de
 * `catalogoDeLaArena`: es lo que se guarda en el borrador, en la batalla y en el
 * enlace.
 */
export function piezasDeLaArena(eq: CatalogoDeLaArena): readonly PiezaEscrita[] {
  return [...eq.escritas.values()].filter((p) => !esDeSerie(p));
}

/** De dónde sale una pieza: tal cual del fichero, cambiada en la arena o nueva. */
export type SelloDePieza = 'del juego' | 'cambiada' | 'nueva';

/**
 * El sello de `p` (escrita como la escribe `validarPiezaDeArena`), comparada con
 * la del fichero de su id **como está escrita**: la Espada de herrería del
 * fichero sigue «del juego» aunque cambie la Espada (su vínculo es vivo), y pasa a
 * «cambiada» si se le cambian los extras o la base. Lo leen el catálogo de la
 * arena, el cambio de una pieza, el parte de la pelea («vuelve a la de serie») y
 * la vista «Editar equipo».
 */
export function selloDePieza(p: PiezaEscrita): SelloDePieza {
  const delFichero = ESCRITAS_DEL_FICHERO.get(p.id);
  if (delFichero === undefined) return 'nueva';
  return mismaPieza(delFichero, p) ? 'del juego' : 'cambiada';
}

/**
 * Si `p` es la del fichero tal cual está escrita: «de serie» (`selloDePieza`). **La
 * única pregunta**: la leen lo que se guarda (`piezasDeLaArena`, `conPieza`) y el
 * parte de un retoque («vuelve a la de serie»).
 */
export function esDeSerie(p: PiezaEscrita): boolean {
  return selloDePieza(p) === 'del juego';
}

/**
 * La primera base de la cadena de `id` en `eq` (sin contarla a ella, de la más
 * cercana a la más lejana) cuya escrita cumple `cumple`, ya resuelta; `null` si
 * ninguna. La leen el sello en pantalla (`baseCambiada`) y el parte de un retoque
 * (qué base se tocó).
 */
function primeraBaseQue(
  eq: CatalogoDeLaArena,
  id: string,
  cumple: (escrita: PiezaEscrita) => boolean,
): Pieza | null {
  const propia = eq.escritas.get(id);
  for (let e = propia; e !== undefined && esPiezaConBase(e); ) {
    const base = eq.escritas.get(e.base);
    if (base === undefined) return null;
    if (cumple(base)) return eq.pieza(base.id);
    e = base;
  }
  return null;
}

/**
 * La base de la cadena de `id` que no es de serie (`esDeSerie`), la más cercana, o
 * `null` si todas lo son: con ella, una pieza escrita como en el fichero suma otra
 * cosa (su vínculo es vivo). Lo dice el sello de la vista «Editar equipo» (QA 2 del
 * 18-10-2026: la herrería seguía «de serie» con la Espada cambiada).
 */
export function baseCambiada(eq: CatalogoDeLaArena, id: string): Pieza | null {
  return primeraBaseQue(eq, id, (e) => !esDeSerie(e));
}

/**
 * Si la pieza `id` de `eq` y todas sus bases son de serie (`esDeSerie`): entonces
 * suma lo mismo que en el fichero. Lo pregunta el parte de un retoque.
 */
function deSerieConSusBases(eq: CatalogoDeLaArena, id: string): boolean {
  const propia = eq.escritas.get(id);
  return propia !== undefined && esDeSerie(propia) && baseCambiada(eq, id) === null;
}

/**
 * Las piezas del fichero como están escritas (`EQUIPO_ESCRITO`, ya en la forma
 * canónica que escribe también `validarPiezaDeArena`), por id: así `mismaPieza`
 * compara dos formas iguales sin volver a validar.
 */
const ESCRITAS_DEL_FICHERO: ReadonlyMap<string, PiezaEscrita> = conElFichero([]);

/**
 * Una pieza de la arena, comprobada y escrita siempre igual; lanza diciendo qué
 * no cuadra. Entera, la regla de una pieza es la del catálogo del juego
 * (`problemasDePieza`: los campos que existen, las cifras de su hueco, el escudo
 * que resta, el daño, las manos solo en un arma, la rueda, el precio en oro); sobre
 * otra, la de su forma (`problemasDePiezaConBase`), y lo que dé resuelta lo juzga
 * el catálogo (`catalogoDeLaArena`). Encima, la de la arena:
 *
 * - el id, en minúsculas, cifras, `-` y `_` (`esIdDePieza`);
 * - **en la arena solo se cambian las piezas de la arena** (18-10-2026): una con
 *   el id de una del juego de otra calidad no vale —de la calidad salen el botín,
 *   la armería y el equipo base, y la arena no las enseña—;
 * - una entera con el id de una del fichero es esa pieza cambiada (su hueco no se
 *   cambia: lo dice el catálogo, `resolverBases`, que lo mira también en la que
 *   tiene base); una nueva entera es de calidad `arena`, que el juego no reparte.
 *
 * Sale en la forma canónica (`piezaCanonica`, `piezaConBaseCanonica`), la que
 * compara `mismaPieza`. Todo lo que entra a la arena pasa por aquí.
 */
export function validarPiezaDeArena(valor: unknown): PiezaEscrita {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error('una pieza de la arena tiene que ser un objeto');
  }
  const p = valor as Record<string, unknown>;
  const quien = typeof p.nombre === 'string' && p.nombre !== '' ? `«${p.nombre}»` : 'la pieza';
  const conBase = 'base' in p;
  const problemas = conBase ? problemasDePiezaConBase(p, quien) : problemasDePieza(p, quien);
  if (problemas.length > 0) throw new Error(problemas.join('; '));
  const id = p.id as string;
  if (!esIdDePieza(id)) {
    throw new Error(`${quien}: el id «${id}» va en minúsculas, con cifras, guiones y _`);
  }
  const delFichero = PIEZAS_DEL_CATALOGO.get(id);
  if (delFichero !== undefined && delFichero.calidad !== 'arena') {
    throw new Error(
      `${quien} es una pieza del juego de calidad «${delFichero.calidad}»: en la arena solo se cambian las piezas de la arena`,
    );
  }
  if (conBase) return piezaConBaseCanonica(p as unknown as PiezaConBase);
  const bruta = p as unknown as Pieza;
  if (bruta.calidad !== 'arena') {
    throw new Error(
      `${quien} es una pieza de la arena y su calidad es «arena», que el juego no reparte, no «${bruta.calidad}»`,
    );
  }
  return piezaCanonica(bruta);
}

/**
 * Si dos piezas son la misma, cifra a cifra (o extra a extra). Las dos en la forma
 * canónica (`validarPiezaDeArena`, el fichero, la suma de una base): con dos
 * formas normalizadas basta comparar el texto.
 */
export function mismaPieza(a: PiezaEscrita, b: PiezaEscrita): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Una pieza en palabras, campo a campo como en su ficha: lo que el parte dice
 * que cambió de ella a media pelea («ataque 2 → 5»; `cambiosDeLaFicha`).
 */
export function piezaEnPalabras(p: Pieza): FichaEnPalabras {
  return {
    nombre: p.nombre,
    ataque: `${p.ataque}`,
    defensa: `${p.defensa}`,
    armadura: `${p.armadura ?? 0}`,
    daño: `${p.danio?.[0] ?? 0}-${p.danio?.[1] ?? 0}`,
    velocidad: `${p.velocidad}`,
    manos: aDosManos(p) ? '2' : '1',
    rueda: p.rueda === undefined ? 'nada' : ruedaDelArmaEnPalabras(p.rueda),
    precio: describirCoste(p.precio),
  };
}

/**
 * `p` en el hueco `hueco`, con lo que el hueco exige y nada de lo que no admite
 * (`camposDelHueco`): un escudo resta velocidad (al menos −1), solo un arma de
 * cuerpo a cuerpo se lleva a dos manos, solo ella y la lanza llevan rueda (y la
 * llevan: si no la traía, la de la Espada, `nivelesDeLaEspada`), y las
 * cifras que el hueco no suma se quedan en 0 —un arma que pasa a escudo deja su
 * ataque y su daño—. Lo que el escudo exigía se va con él: un escudo que pasa a
 * otro hueco deja de restar (velocidad 0), que si no un arma recién cambiada
 * restaba sin que nadie lo hubiera pedido. Lo demás se queda como estaba. Lo leen
 * la pieza nueva en blanco (`piezaNueva`) y el cambio de hueco de la ficha.
 */
export function enElHueco(p: Pieza, hueco: HuecoDeArena): Pieza {
  const { manos, rueda, danio, armadura, ...resto } = p;
  const campos = camposDelHueco(hueco);
  const admite = (c: CifraDelHueco): boolean => campos.cifras.includes(c);
  const velocidad = !admite('velocidad')
    ? 0
    : hueco === 'escudo'
      ? Math.min(p.velocidad, -1)
      : p.hueco === 'escudo'
        ? Math.max(p.velocidad, 0)
        : p.velocidad;
  return {
    ...resto,
    hueco,
    ataque: admite('ataque') ? p.ataque : 0,
    defensa: admite('defensa') ? p.defensa : 0,
    ...(admite('armadura') && armadura !== undefined ? { armadura } : {}),
    velocidad,
    ...(admite('danio') && danio !== undefined ? { danio } : {}),
    ...(campos.conManos && manos !== undefined ? { manos } : {}),
    // Un arma de cuerpo a cuerpo dice su rueda: la que trae o, si no traía, la de
    // la Espada («todo a 3, como la Espada»).
    ...(campos.conRueda ? { rueda: rueda ?? nivelesDeLaEspada() } : {}),
  };
}

/**
 * Una pieza NUEVA, siempre de la arena: en blanco en un hueco —nada que sumar, con
 * lo que el hueco exige (`enElHueco`); una a distancia ya dispara por ir en su
 * hueco— o como copia de otra («Duplicar»: tal como está escrita, con su base si
 * la tiene). Sobre otra («Nueva sobre esta»), `piezaSobre`. Su id y su nombre,
 * `idYNombreNuevos`.
 */
export function piezaNueva(
  desde: HuecoDeArena | Pieza,
  eq: CatalogoDeLaArena,
  sinValidar: readonly string[] = [],
): PiezaEscrita {
  const { id, nombre } = idYNombreNuevos(desde, eq, sinValidar);
  if (typeof desde === 'string') {
    const enBlanco: Pieza = {
      id,
      nombre,
      hueco: desde,
      calidad: 'arena',
      ataque: 0,
      defensa: 0,
      pv: 0,
      velocidad: 0,
      precio: { gold: 0 },
    };
    return validarPiezaDeArena(enElHueco(enBlanco, desde));
  }
  if (desde.calidad !== 'arena') {
    throw new Error(
      `«${desde.nombre}» es una pieza del juego: en la arena solo se parte de una pieza de la arena`,
    );
  }
  return validarPiezaDeArena({ ...escritaDe(eq, desde.id), id, nombre });
}

/**
 * Una pieza NUEVA **sobre** `base` («Nueva sobre esta»): la base, la elegida, y
 * sin extras, así que suma lo mismo hasta que se le pongan. Lo que no puede ser
 * base lo dice `baseBlocker`. Su id y su nombre, `idYNombreNuevos`.
 */
export function piezaSobre(
  base: Pieza,
  eq: CatalogoDeLaArena,
  sinValidar: readonly string[] = [],
): PiezaEscrita {
  const nueva = { ...idYNombreNuevos(base, eq, sinValidar), base: base.id, extras: {} };
  const mal = baseBlocker(nueva, base.id, eq.escritas);
  if (mal !== null) throw new Error(mal);
  return validarPiezaDeArena(nueva);
}

/**
 * El id y el nombre de una pieza nueva que parte de `desde`: `<raíz>-<n>` y
 * `<raíz> <n>` con el primer `n` ≥ 2 libre entre las piezas de `eq` (las del juego
 * y las de la arena) y `sinValidar` (las del borrador que no valen y se
 * conservan, que una nueva no debe pisar); la raíz es el hueco o la pieza de
 * partida sin su `-<n>`. Ni el id ni el nombre de otra: dos piezas con el mismo
 * nombre no se distinguen en el desplegable de la unidad ni en su tarjeta.
 */
function idYNombreNuevos(
  desde: HuecoDeArena | Pieza,
  eq: CatalogoDeLaArena,
  sinValidar: readonly string[],
): { readonly id: string; readonly nombre: string } {
  const raizDelId = typeof desde === 'string' ? desde : desde.id.replace(/-\d+$/, '');
  const raiz =
    typeof desde === 'string' ? NOMBRE_DE_HUECO[desde] : desde.nombre.replace(/ \d+$/, '');
  const nombres = new Set([...eq.piezas.values()].map((p) => nombreComparable(p.nombre)));
  let n = 2;
  while (
    eq.piezas.has(`${raizDelId}-${n}`) ||
    sinValidar.includes(`${raizDelId}-${n}`) ||
    nombres.has(nombreComparable(`${raiz} ${n}`))
  ) {
    n++;
  }
  return { id: `${raizDelId}-${n}`, nombre: `${raiz} ${n}` };
}

/**
 * La pieza `escrita` sobre la base `base` (el id de otra pieza de la arena del
 * mismo hueco), o entera con `null`, **con las mismas cifras finales**: sus extras
 * pasan a ser lo que le falta a la base para llegar a lo que suma ahora
 * (`diferenciaDe`). Cambiar de base y volver deja la pieza como estaba. Las manos
 * son las de la base. Lanza con lo que diga `baseBlocker` (con su hueco: cambiar
 * de base no cambia de hueco). Lo pide el desplegable «Base» de su ficha.
 */
export function conBase(
  escrita: PiezaEscrita,
  base: string | null,
  eq: CatalogoDeLaArena,
): PiezaEscrita {
  const final = eq.pieza(escrita.id);
  if (base === null) return validarPiezaDeArena({ ...final, nombre: escrita.nombre });
  const mal = baseBlocker(escrita, base, eq.escritas, final.hueco);
  if (mal !== null) throw new Error(mal);
  return validarPiezaDeArena({
    id: escrita.id,
    nombre: escrita.nombre,
    base,
    extras: diferenciaDe(final, eq.pieza(base)),
  });
}

/**
 * Cómo está escrita la pieza `id` de `eq`: entera o sobre su base. Lanza si no
 * está. La leen la ficha, lo que se duplica y lo que se cambia.
 */
export function escritaDe(eq: CatalogoDeLaArena, id: string): PiezaEscrita {
  const e = eq.escritas.get(id);
  if (e === undefined) throw new Error(`no hay ninguna pieza «${id}»`);
  return e;
}

/** La base de la pieza `id` de `eq`, resuelta, o `null` si está entera. */
export function baseDe(eq: CatalogoDeLaArena, id: string): Pieza | null {
  const e = escritaDe(eq, id);
  return esPiezaConBase(e) ? eq.pieza(e.base) : null;
}

/**
 * De qué sale la pieza `id`: su cadena de bases resueltas, de la raíz a ella
 * («Espada → Espada de herrería → Espada bendita»), o solo ella si está entera
 * (`baseDe`, en cadena). Lo enseña su ficha.
 */
export function cadenaDeBases(eq: CatalogoDeLaArena, id: string): readonly Pieza[] {
  const cadena: Pieza[] = [eq.pieza(id)];
  for (let b = baseDe(eq, id); b !== null; b = baseDe(eq, b.id)) cadena.unshift(b);
  return cadena;
}

/**
 * Las piezas que `id` puede tomar de base (`baseBlocker`, con su hueco): las de la
 * arena de su hueco, sin ella ni las que están sobre ella. Las ofrece el
 * desplegable «Base» de su ficha; `conBase` dice por qué no a las demás.
 */
export function basesPosibles(eq: CatalogoDeLaArena, id: string): readonly Pieza[] {
  const p = eq.pieza(id);
  const escrita = escritaDe(eq, id);
  return [...eq.piezas.values()].filter(
    (b) => baseBlocker(escrita, b.id, eq.escritas, p.hueco) === null,
  );
}

/**
 * Las piezas de la arena con `p` puesta: sustituye a la de su id o se añade al
 * final. Si `p` es la del fichero tal cual, la quita: ya no está cambiada.
 */
export function conPieza(
  delBorrador: readonly PiezaEscrita[],
  p: PiezaEscrita,
): readonly PiezaEscrita[] {
  const nueva = validarPiezaDeArena(p);
  if (esDeSerie(nueva)) return delBorrador.filter((x) => x.id !== nueva.id);
  const i = delBorrador.findIndex((x) => x.id === nueva.id);
  return i < 0
    ? [...delBorrador, nueva]
    : [...delBorrador.slice(0, i), nueva, ...delBorrador.slice(i + 1)];
}

/**
 * Las piezas de la arena sin la de id `id`: una nueva se borra, y una del fichero
 * cambiada vuelve a la de serie. Lanza si no está.
 */
export function sinPieza(
  delBorrador: readonly PiezaEscrita[],
  id: string,
): readonly PiezaEscrita[] {
  if (!delBorrador.some((x) => x.id === id)) {
    throw new Error(`la pieza «${id}» no está cambiada ni es nueva: no hay nada que quitar`);
  }
  return delBorrador.filter((x) => x.id !== id);
}

/**
 * Por qué `cuerpo` no puede llevar `equipo` con las piezas de `eq`, o `null` si
 * puede: que existan, sus huecos y las manos (`equipoBlocker`), que lleve un arma
 * de cuerpo a cuerpo de la arena (`armaDeCuerpoBlocker`) y que con ellas puestas
 * el índice lo sepa medir (`medidaBlocker`). **La pregunta «¿sigue
 * valiendo quien la lleva?», con su única redacción**: la leen el cambio de una
 * pieza en el borrador (`cambioDePiezaBlocker`) y a media pelea
 * (`retocarEnBatalla`, `kind: 'piezas'`). Sin `piezaDelJuegoBlocker`: el héroe
 * lleva el equipo base del juego, y cambiar una pieza no hace del juego a una de
 * la arena (`validarPiezaDeArena`).
 */
function equipoQueNoVale(cuerpo: UnitInfo, equipo: EquipoDeArena, eq: EquipoAtado): string | null {
  const motivo =
    eq.equipoBlocker(equipo) ??
    armaDeCuerpoBlocker(equipo, eq) ??
    medidaBlocker(eq.conEquipo(cuerpo, equipo));
  return motivo === null ? null : `la lleva «${cuerpo.name}»: ${motivo}`;
}

/**
 * Por qué la unidad `u` no puede llevar `equipo`, o `null`: lo que diría
 * `validarUnidadDeArena` del equipo (`equipoDeArenaBlocker`) y que con él puesto
 * el índice la sepa medir (`medidaBlocker`). Lo leen las dos preguntas de la ficha.
 */
function unidadQueNoLleva(u: UnidadDeArena, equipo: EquipoDeArena, eq: EquipoAtado): string | null {
  return (
    equipoDeArenaBlocker(equipo, eq) ?? medidaBlocker(eq.conEquipo(cuerpoDeCombate(u), equipo))
  );
}

/** Lo que se le puede poner a una unidad en un hueco (`opcionesDelHueco`). */
export interface OpcionDelHueco {
  readonly pieza: Pieza;
  /** Por qué no se le puede poner, o `null` si se puede. */
  readonly motivo: string | null;
}

/**
 * Las piezas de la arena del hueco `hueco` que no lleva `u`, en el orden de `eq`,
 * cada una con lo que diría el núcleo al ponérsela (`unidadQueNoLleva`: un escudo
 * con un arma a dos manos, una que el índice no sabe medir): `null` si entra. Las
 * del juego no salen (`esDeLaArena`), y un hueco sin piezas de la arena —el
 * accesorio— no ofrece nada. **La pregunta «¿qué le pongo?»**: la lee la ficha
 * de la unidad, que no ofrece lo que el núcleo rechazaría.
 */
export function opcionesDelHueco(
  u: UnidadDeArena,
  hueco: HuecoDeArena,
  eq: EquipoAtado,
): readonly OpcionDelHueco[] {
  return [...eq.piezas.values()]
    .filter((p) => p.hueco === hueco && p.id !== u.equipo[hueco] && esDeLaArena(p))
    .map((p) => ({
      pieza: p,
      motivo: unidadQueNoLleva(u, { ...u.equipo, [hueco]: p.id }, eq),
    }));
}

/**
 * Por qué no se le puede quitar a `u` lo que lleva en `hueco`, o `null` si se
 * puede: que lleve algo (`nadaEnElHueco`) y que sin ello siga valiendo
 * (`unidadQueNoLleva`: sin arma de cuerpo a cuerpo no se combate). La lee la
 * ficha, que no ofrece la × que el núcleo rechazaría.
 */
export function quitarBlocker(
  u: UnidadDeArena,
  hueco: HuecoDeArena,
  eq: EquipoAtado,
): string | null {
  if (u.equipo[hueco] === undefined) return nadaEnElHueco(u.name, hueco);
  const { [hueco]: _quitada, ...sin } = u.equipo;
  return unidadQueNoLleva(u, sin, eq);
}

/**
 * Por qué no se pasa de las piezas de la arena `antes` a `despues`, o `null` si
 * se puede: que no se borre la base de otra (`baseQueSeBorra`), que cada pieza
 * valga resuelta (`catalogoDeLaArena`: un cambio en la base se juzga con todas las
 * que dependen de ella) y que **ninguna unidad de `unidades` (el catálogo) deje de
 * valer** por una pieza que lleva y cambia o desaparece —un arma que pasa a dos
 * manos con un escudo puesto, una nueva que se borra, la Espada bendita que cambia
 * porque cambió la Espada—, diciendo quién la lleva. La leen la vista «Editar
 * equipo» y sus pruebas. En plena pelea se pregunta además a la batalla
 * (`retocarEnBatalla`).
 */
export function cambioDePiezaBlocker(
  antes: readonly PiezaEscrita[],
  despues: readonly PiezaEscrita[],
  unidades: readonly UnidadDeArena[],
): string | null {
  const base = baseQueSeBorra(antes, despues);
  if (base !== null) return base;
  const leidos = oElMotivo(() => ({
    viejo: catalogoDeLaArena(antes),
    nuevo: catalogoDeLaArena(despues),
  }));
  if ('motivo' in leidos) return leidos.motivo;
  const { viejo, nuevo } = leidos.valor;
  const repetido = nombreRepetido(viejo, nuevo);
  if (repetido !== null) return repetido;
  for (const u of unidades) {
    for (const id of idsPuestos(u.equipo)) {
      const a = viejo.piezaSiExiste(id);
      const d = nuevo.piezaSiExiste(id);
      if (a !== null && d !== null && mismaPieza(a, d)) continue;
      if (d === null) {
        return `la lleva «${u.name}»: quítasela antes de borrar ${a === null ? `«${id}»` : `«${a.nombre}»`}`;
      }
      const motivo = equipoQueNoVale(cuerpoDeCombate(u), u.equipo, nuevo);
      if (motivo !== null) return motivo;
    }
  }
  return null;
}

/**
 * Por qué de `antes` a `despues` se borra la base de otra pieza que sigue
 * (18-10-2026: «Espada es la base de «Espada de herrería»»), o `null`. Solo se
 * borra una nueva: una del fichero que sale del borrador vuelve a la de serie.
 */
function baseQueSeBorra(
  antes: readonly PiezaEscrita[],
  despues: readonly PiezaEscrita[],
): string | null {
  const quedan = conElFichero(despues);
  // De cada base, la primera que está sobre ella.
  const sobre = new Map<string, PiezaEscrita>();
  for (const x of quedan.values()) {
    if (esPiezaConBase(x) && !sobre.has(x.base)) sobre.set(x.base, x);
  }
  for (const p of antes) {
    const sobreElla = quedan.has(p.id) ? undefined : sobre.get(p.id);
    if (sobreElla !== undefined) {
      return `«${p.nombre}» es la base de «${sobreElla.nombre}»: cámbiale la base o bórrala antes`;
    }
  }
  return null;
}

/** Un nombre de pieza como se distingue a la vista: sin mayúsculas ni espacios de más. */
function nombreComparable(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Por qué `nuevo` tiene una pieza que se llama como otra, o `null`: solo mira las
 * que cambian o aparecen de `viejo` a `nuevo`. Un borrador escrito a mano con dos
 * nombres iguales se sigue leyendo; lo que no se puede es hacer otra.
 */
function nombreRepetido(viejo: EquipoAtado, nuevo: EquipoAtado): string | null {
  for (const p of nuevo.piezas.values()) {
    const antes = viejo.piezaSiExiste(p.id);
    if (antes !== null && mismaPieza(antes, p)) continue;
    const otra = [...nuevo.piezas.values()].find(
      (x) => x.id !== p.id && nombreComparable(x.nombre) === nombreComparable(p.nombre),
    );
    if (otra !== undefined) {
      return `ya hay una pieza que se llama «${otra.nombre}» (${NOMBRE_DE_HUECO[otra.hueco]}): ponle otro nombre, que en la ficha de una unidad no se distinguirían`;
    }
  }
  return null;
}

/**
 * Las piezas que escribe «Guardar» con un enlace abierto: las del
 * borrador y, de la capa del enlace (`piezasDelEnlace`), solo las **nuevas** que
 * el borrador no tiene —las llevan unidades del enlace que entran en el borrador
 * de unidades, que sin ellas no validarían—. Una pieza del fichero que el enlace
 * trae cambiada, o tal cual, no sustituye ni borra la tuya: el enlace pelea con
 * las suyas sin tocar las de quien lo abre, y las unidades guardadas pelearán con
 * las tuyas. Una nueva del enlace sobre una base que el enlace trae cambiada se
 * guarda sobre la tuya: el vínculo es vivo, y pelea con la base que tengas.
 */
export function piezasQueSeGuardan(
  delBorrador: readonly PiezaEscrita[],
  delEnlace: readonly PiezaEscrita[],
): readonly PiezaEscrita[] {
  const nuevas = delEnlace.filter(
    (p) => selloDePieza(p) === 'nueva' && !delBorrador.some((x) => x.id === p.id),
  );
  return [...delBorrador, ...nuevas];
}

/**
 * Los ids de las piezas que lleva lo montado: las de sus unidades y, con héroe,
 * su equipo base. Lo leen el enlace (qué piezas viajan) y la página al abrirlo.
 */
export function idsLlevados(
  unidades: readonly UnidadDeArena[],
  conHeroe: boolean,
): ReadonlySet<string> {
  return new Set([
    ...unidades.flatMap((u) => idsPuestos(u.equipo)),
    ...(conHeroe ? idsPuestos(EQUIPO_DEL_HEROE_EN_LA_ARENA) : []),
  ]);
}

/**
 * `ids` con las bases de cada uno, en cadena (`escrita` dice cómo está escrita
 * cada pieza), en orden: las de `ids` primero, cada una seguida de lo que le falta.
 */
function conSusBases(
  ids: Iterable<string>,
  escrita: (id: string) => PiezaEscrita | undefined,
): ReadonlySet<string> {
  const out = new Set<string>();
  const poner = (id: string): void => {
    if (out.has(id)) return;
    out.add(id);
    const e = escrita(id);
    if (e !== undefined && esPiezaConBase(e)) poner(e.base);
  };
  for (const id of ids) poner(id);
  return out;
}

/**
 * Las piezas de la arena que lleva lo montado: las de `delBorrador` puestas en
 * alguna unidad o, con héroe, en su equipo base (`idsLlevados`), **con sus bases**
 * en cadena: la Espada bendita lleva la Espada de herrería y la Espada si están
 * cambiadas. Es lo que va en el enlace de la pelea para que se abra igual en otra
 * máquina.
 */
export function piezasDelMontaje(
  unidades: readonly UnidadDeArena[],
  conHeroe: boolean,
  delBorrador: readonly PiezaEscrita[],
): readonly PiezaEscrita[] {
  const escritas = conElFichero(delBorrador);
  const llevadas = conSusBases(idsLlevados(unidades, conHeroe), (id) => escritas.get(id));
  return delBorrador.filter((p) => llevadas.has(p.id));
}

/**
 * Las piezas con que pelea un enlace, para encima de las de la arena que lo abre
 * (`conPieza`, una a una): de cada pieza de la arena que lleva lo montado, con sus
 * bases, la del enlace si la trae y, si no, la del fichero tal cual —que, puesta
 * con `conPieza`, deshace el cambio de esta arena—. Así pelea con las del juego
 * más las suyas, sin tocar el borrador: lo que no lleva se queda como estaba. El
 * equipo base del héroe es del juego, que la arena no cambia: no va en la capa.
 */
export function piezasDelEnlace(m: MontajeDelEnlace): readonly PiezaEscrita[] {
  const conHeroe = m.izquierda.heroe !== null || m.derecha.heroe !== null;
  const delEnlace = new Map(m.piezas.map((p) => [p.id, p]));
  const escritas = conElFichero(m.piezas);
  return [...conSusBases(idsLlevados(m.unidades, conHeroe), (id) => escritas.get(id))].flatMap(
    (id) => {
      const suya = delEnlace.get(id);
      if (suya !== undefined) return [suya];
      const delFichero = ESCRITAS_DEL_FICHERO.get(id);
      if (delFichero === undefined)
        throw new Error(`el enlace lleva la pieza «${id}» y no la trae`);
      return PIEZAS_DEL_CATALOGO.get(id)?.calidad === 'arena' ? [delFichero] : [];
    },
  );
}

/**
 * Lo que dice el `_comment` del borrador de equipo: qué es, de dónde sale y que
 * el juego no lo lee.
 */
export const COMENTARIO_DEL_BORRADOR_DE_EQUIPO =
  'BORRADOR de la arena (/arena/, pnpm arena, vista «Editar equipo»): piezas de equipo INVENTADAS y provisionales. Lo escribe la página al pulsar «Guardar» y lo valida validarPiezaDeArena (src/core/arena.ts); una pieza que no valida se conserva tal cual. El juego NO lo lee: ni el botín, ni la armería, ni el equipo base, ni el agente (leen data/equipo.json). Solo piezas de la arena (calidad «arena»): una con el id de una de data/equipo.json es esa pieza cambiada y vale solo en la arena (su hueco no se cambia); una con otro id es nueva. Una pieza se escribe entera, con los campos de data/equipo.json (precio solo en oro, sin PV, cada hueco con sus cifras), o sobre otra de su hueco, {id, nombre, base, extras}: sus cifras son las de la base más los extras, en cadena, y si cambia la base cambia ella. Pasar una pieza al juego es copiarla a data/equipo.json a mano.';

/** La clave del borrador de equipo: el id de cada pieza. */
const CLAVE_DE_PIEZA = {
  campo: 'id',
  clave: (p: PiezaEscrita) => p.id,
  quien: (id: string) => `la pieza «${id}»`,
  donde: 'el borrador',
} as const;

function listaDelBorradorDeEquipo(valor: unknown): readonly unknown[] {
  if (typeof valor !== 'object' || valor === null || !('piezas' in valor)) {
    throw new Error('el borrador de equipo tiene que ser { piezas: [...] }');
  }
  return lista((valor as { piezas: unknown }).piezas, 'piezas', 'el borrador de equipo');
}

/**
 * El borrador de equipo leído pieza a pieza: las que valen y las que no, con su
 * motivo. Solo el formato de hoy (`validarPiezaDeArena`): una pieza de antes —un
 * arco en `arma`, unos `disparos`, PV en una de la arena, una del juego de otra
 * calidad, un precio en madera— no vale, y se conserva tal cual al guardar como
 * cualquier otra que no vale. Las que valen se resuelven con sus bases
 * (`resolverBases`): la que no resuelve —su base no existe, da la vuelta, o
 * resuelta no vale— pasa a las que no valen con su motivo, y con ella las que
 * están sobre ella; el resto se lee.
 */
export function revisarBorradorDeEquipo(valor: unknown): BorradorDeEquipoRevisado {
  const crudas = listaDelBorradorDeEquipo(valor);
  const leidas = revisarLista(crudas, validarPiezaDeArena, CLAVE_DE_PIEZA);
  // Las que no se leyeron, para que lo que va sobre ellas diga por qué no vale.
  const rotas = new Map(
    leidas.invalidas.flatMap((i) => {
      if (i.clave === null) return [];
      const nombre = (i.crudo as { nombre?: unknown } | null)?.nombre;
      const suyo = typeof nombre === 'string' ? nombre : i.clave;
      return [[i.clave, { nombre: suyo, motivo: i.motivo }] as const];
    }),
  );
  const { problemas } = resolverBases(leidas.validas, rotas);
  const crudaDe = (id: string): unknown =>
    crudas.find((c) => typeof c === 'object' && c !== null && (c as { id?: unknown }).id === id);
  const sinResolver = leidas.validas.flatMap((p) => {
    const motivo = problemas.get(p.id);
    return motivo === undefined ? [] : [{ clave: p.id, motivo, crudo: crudaDe(p.id) }];
  });
  return {
    validas: leidas.validas.filter((p) => !problemas.has(p.id)),
    // En el orden del borrador: la que no resuelve sale donde está escrita.
    invalidas: [...leidas.invalidas, ...sinResolver].sort(
      (a, b) => crudas.indexOf(a.crudo) - crudas.indexOf(b.crudo),
    ),
  };
}

/** El borrador de equipo leído: las piezas que valen y las que no, con su motivo. */
export interface BorradorDeEquipoRevisado {
  readonly validas: readonly PiezaEscrita[];
  readonly invalidas: readonly ElementoSinValidar[];
}

/** El borrador de equipo que se va a ESCRIBIR, entero válido y sin dos veces un id. */
export function validarBorradorDeEquipo(valor: unknown): readonly PiezaEscrita[] {
  return todasValidas(revisarBorradorDeEquipo(valor));
}

/**
 * Lo que enseña la ficha del nivel de unas cifras: «Índice 340 · nivel 3». Lo
 * calcula el núcleo (`indiceDePoder`, con el equipo puesto) y la ficha solo lo pinta: el
 * nivel no es un campo que se escribe.
 */
export function lecturaDelNivel(u: UnitInfo): string {
  const indice = indiceDePoder(u);
  return `Índice ${indice} · nivel ${nivelDelIndice(indice)}`;
}

// ------------------------------------------------------------- la fuente

/**
 * De dónde sale una unidad del montaje: del catálogo de unidades (las cinco
 * facciones). Las criaturas del juego ya no entran en la arena (13-10-2026, el
 * usuario: «solo cuentan los 5 que hay en la arena»). `escalera` es si sale con
 * escalera para la muralla: es del montaje, no de la unidad (la misma hoja puede
 * ir con ella o sin ella).
 */
export interface FuenteDeArena {
  readonly unidad: UnidadDeArena;
  readonly escalera?: boolean;
}

// ------------------------------------------------------------- el héroe

/**
 * El héroe de un bando de la arena: sus cuatro cifras, su libro y su figura.
 * Pisa el tablero como en el juego (`heroUnit`, nivel inicial y equipo base) y
 * lanza con su maná (10 × Conocimiento), sin huida posible.
 */
export interface HeroeDeArena {
  readonly nombre: string;
  /** El id de una hoja de héroe para su figura, o `null` para la genérica del juego. */
  readonly figura: string | null;
  readonly ataque: number;
  readonly defensa: number;
  readonly poder: number;
  readonly conocimiento: number;
  /** Los ids de `data/spells.json` de su libro, sin repetir. */
  readonly hechizos: readonly string[];
}

/** Lo más alto que admite una cifra del héroe: más arriba ninguna fórmula cambia ya. */
export const CIFRA_MAXIMA_DE_HEROE = 99;

/**
 * El héroe que se pone en un lado: las cifras del héroe inicial de la partida
 * (`CIFRAS_DEL_HEROE_INICIAL`), la figura genérica y todo el libro. Aquí y no en
 * la página para que un test monte la misma pelea que monta quien pulsa.
 */
export function heroePorDefecto(lado: Lado): HeroeDeArena {
  return {
    nombre: `Héroe ${LADOS[lado].adjetivo}`,
    figura: null,
    ataque: CIFRAS_DEL_HEROE_INICIAL.attack,
    defensa: CIFRAS_DEL_HEROE_INICIAL.defense,
    poder: CIFRAS_DEL_HEROE_INICIAL.spellPower,
    conocimiento: CIFRAS_DEL_HEROE_INICIAL.knowledge,
    hechizos: allSpells().map((x) => x.id),
  };
}

/** Comprueba un héroe de la arena y lanza diciendo qué no cuadra. */
export function validarHeroeDeArena(h: HeroeDeArena): HeroeDeArena {
  const quien = 'el héroe';
  const nombre = texto(h.nombre, 'el nombre', quien);
  if (h.figura !== null && !esIdDeArena(h.figura)) {
    throw new Error(`${quien}: la figura «${h.figura}» no es el id de una hoja`);
  }
  const cifra = (v: number, campo: string, minimo: number): number => {
    const n = entero(v, campo, quien, minimo);
    if (n > CIFRA_MAXIMA_DE_HEROE) {
      throw new Error(`${quien}: ${campo} va hasta ${CIFRA_MAXIMA_DE_HEROE}, y es ${n}`);
    }
    return n;
  };
  const hechizos = lista(h.hechizos, 'los hechizos', quien).map((id) => {
    if (typeof id !== 'string') throw new Error(`${quien}: un hechizo no es un id`);
    return spell(id).id;
  });
  sinRepetir(hechizos, 'el hechizo', quien);
  return {
    nombre,
    figura: h.figura,
    ataque: cifra(h.ataque, 'el ataque', 0),
    defensa: cifra(h.defensa, 'la defensa', 0),
    poder: cifra(h.poder, 'el poder', 1),
    conocimiento: cifra(h.conocimiento, 'el conocimiento', 0),
    hechizos,
  };
}

/**
 * El equipo del héroe de la arena: el equipo base del juego con la Espada de la
 * arena en lugar de la de armería (decisión del usuario, 18-10-2026): en la rueda
 * se golpea con un arma de la arena, la que dice sus niveles.
 */
export const EQUIPO_DEL_HEROE_EN_LA_ARENA: EquipoDeArena = {
  ...EQUIPO_BASE,
  arma: ESPADA_DE_LA_ARENA,
};

/** Si la pieza `id` es del equipo del héroe de la arena (`EQUIPO_DEL_HEROE_EN_LA_ARENA`): la lleva todo héroe. */
export function laLlevaElHeroe(id: string): boolean {
  return idsPuestos(EQUIPO_DEL_HEROE_EN_LA_ARENA).includes(id);
}

/**
 * El héroe tal como entra en la batalla. **Uno nuevo en cada llamada**: el motor
 * gasta su maná y marca su hechizo de la ronda sobre este objeto, y una segunda
 * pelea con el mismo empezaría con el maná de la primera.
 *
 * Su equipo (`EQUIPO_DEL_HEROE_EN_LA_ARENA`) se lee de `eq`, como el de la tropa
 * (el cuerpo de `heroUnit`, vestido con él): la Espada de la arena, que la arena
 * puede haber cambiado, y lo demás del equipo base del juego.
 */
export function heroeDeArena(datos: HeroeDeArena, eq: EquipoAtado): HeroeDelBando {
  const h = validarHeroeDeArena(datos);
  return {
    cuerpo: eq.conEquipo(
      cuerpoDelHeroe({
        name: h.nombre,
        attack: h.ataque,
        defense: h.defensa,
        experience: EXPERIENCIA_INICIAL_DE_HEROE,
      }),
      EQUIPO_DEL_HEROE_EN_LA_ARENA,
    ),
    mando: mandoDe(
      {
        name: h.nombre,
        attack: h.ataque,
        defense: h.defensa,
        spellPower: h.poder,
        knowledge: h.conocimiento,
        mana: maxMana({ knowledge: h.conocimiento }),
        spells: h.hechizos,
      },
      { blocked: 'en la arena no hay huida' },
    ),
    ...(h.figura === null ? {} : { figura: h.figura }),
  };
}

/**
 * Lo que la ficha del héroe enseña, ya con las reglas del motor: su cuerpo en el
 * tablero, el maná, cuántas rondas dura lo que lanza y lo que rinde cada hechizo
 * con su poder (`spellAmount`, `efectoDe`, las mismas que lanzan).
 */
export function fichaDeHeroeDeArena(
  datos: HeroeDeArena,
  reglas: ReglasDeBatalla,
  eq: EquipoAtado,
): {
  readonly cuerpo: UnitInfo;
  readonly mana: number;
  /** Las rondas que dura lo que lanza (`duracionDeLoQueLanza`). */
  readonly duracion: number;
  readonly hechizos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly coste: number;
    readonly rinde: number | null;
    readonly efecto: StackEffect | null;
  }[];
} {
  const { cuerpo, mando } = heroeDeArena(datos, eq);
  return {
    cuerpo,
    mana: mando.mana,
    duracion: duracionDeLoQueLanza(mando),
    hechizos: mando.spells
      .map(spell)
      .sort(ordenDelLibro)
      .map((s) => ({
        id: s.id,
        nombre: s.name,
        coste: s.cost,
        rinde: s.kind === 'damage' || s.kind === 'heal' ? spellAmount(s, mando) : null,
        efecto: efectoDe(s, delHeroe(s, mando), reglas),
      })),
  };
}

// ------------------------------------------------------------- el montaje

/** Lo que lleva un lado del montaje: sus unidades y, si lo lleva, su héroe. */
export interface LadoDeArena {
  readonly unidades: readonly FuenteDeArena[];
  readonly heroe: HeroeDeArena | null;
}

/**
 * Los dos lados, las reglas de la pelea —las mismas para los dos (decisión del
 * usuario)— y la muralla del tablero, si la hay: es del tablero, y sus puertas
 * las abre y las cierra la derecha, que defiende (`battle/muralla.ts`).
 */
export interface MontajeDeArena {
  readonly izquierda: LadoDeArena;
  readonly derecha: LadoDeArena;
  readonly reglas: ReglasDeBatalla;
  readonly muralla?: MurallaDeBatalla;
  /**
   * Los modos de la arena que cambian sobre los de siempre (`MODOS_DE_LA_ARENA`,
   * `battle/modos.ts`): la rueda del golpe y salir del contacto, que van en el
   * enlace aparte (`?golpe=`, `?contacto=`) como las reglas, y la carga a pie,
   * que la arena juega siempre y solo apaga la prueba que la compara con el juego.
   */
  readonly modos?: Partial<ModosDeArena>;
  /**
   * Las piezas de la arena con que pelea (las del borrador: van encima de las del
   * juego, `catalogoDeLaArena`). Del montaje y no de cada fuente: dos unidades de
   * la misma pelea con dos espadas distintas no tendrían sentido, y cambiar una
   * pieza a media pelea la cambia para todos a la vez (`retocarEnBatalla`).
   */
  readonly piezas: readonly PiezaEscrita[];
}

/**
 * El stack de una unidad del montaje. `member` es su id de personaje, uno por
 * puesto: dos monjes en el mismo bando son dos individuos, y el motor rechaza un
 * personaje que aparece dos veces. Lo que entra por personaje se apunta en
 * `members`.
 */
function stackDeLaFuente(
  fuente: FuenteDeArena,
  member: string,
  members: Map<string, BattleMember>,
  eq: EquipoAtado,
): Stack {
  const escalera = fuente.escalera === true;
  // Las cifras llegan de la página ya validadas; se vuelven a mirar porque la
  // batalla es la última puerta y un objeto a mano (un test, el arnés) no pasó
  // por ninguna otra.
  const u = validarUnidadDeArena(fuente.unidad, eq);
  const unit = unidadDeCombate(u, eq);
  // Con los PV de su armadura: con `u.hp`, los del cuerpo, entraba herida.
  members.set(member, { profile: { unit, morale: 0, luck: 0 }, hp: unit.hp, escalera });
  // El `body` es su cuerpo: el arte de su hoja, no su id (dos unidades nuevas
  // del mismo cuerpo se pintan igual).
  return { creature: u.cuerpo.hoja, member, count: 1 };
}

/** Las cifras con las que pelea una unidad del montaje, comprobadas. */
function unidadDeLaFuente(fuente: FuenteDeArena, eq: EquipoAtado): UnitInfo {
  return unidadDeCombate(validarUnidadDeArena(fuente.unidad, eq), eq);
}

function bandoDeArena(lado: LadoDeArena, nombre: string, eq: EquipoAtado): BattleSide {
  const { unidades, heroe } = lado;
  if (unidades.length === 0 && heroe === null) {
    throw new Error(`el bando ${nombre} está vacío: pon al menos una unidad`);
  }
  // `createBattle` también lo comprueba, pero diciendo «el atacante»: en la arena
  // no hay atacante, hay izquierda y derecha. El héroe cuenta como uno más.
  const cuantos = unidades.length + (heroe === null ? 0 : 1);
  if (cuantos > LIDERAZGO.maxPorBando) {
    throw new Error(
      `el bando ${nombre} lleva ${cuantos} unidades${heroe === null ? '' : ', contando a su héroe,'} y caben ${LIDERAZGO.maxPorBando}: quita ${cuantos - LIDERAZGO.maxPorBando}`,
    );
  }
  const members = new Map<string, BattleMember>();
  const army: Stack[] = unidades.map((fuente, i) =>
    stackDeLaFuente(fuente, `arena-${i}`, members, eq),
  );
  return {
    army,
    hero: heroe === null ? null : heroeDeArena(heroe, eq),
    ...(members.size === 0 ? {} : { members }),
  };
}

/**
 * Una batalla de arena: la izquierda ataca y la derecha defiende, con las reglas
 * del montaje. Los stacks de la tropa salen en el orden de cada lista (`slot` =
 * su puesto) y el héroe, si lo hay, el último (`<bando>-heroe`): es lo que deja a
 * quien llama saber qué puesto del montaje es cada stack. La muralla, si la
 * hay, es del tablero (`battle/muralla.ts`). Los modos, los de la arena
 * (`MODOS_DE_LA_ARENA`: carga todo el que pega cuerpo a cuerpo, y el jinete más,
 * #260) con lo que cambie el montaje.
 */
export function batallaDeArena(montaje: MontajeDeArena, rng: Rng): BattleState {
  const eq = catalogoDeLaArena(montaje.piezas);
  const batalla = crearBatallaConReglas(
    bandoDeArena(montaje.izquierda, LADOS.izquierda.adjetivo, eq),
    bandoDeArena(montaje.derecha, LADOS.derecha.adjetivo, eq),
    rng,
    montaje.reglas,
    {
      muralla: montaje.muralla ?? SIN_MURALLA,
      modos: { ...MODOS_DE_LA_ARENA, ...montaje.modos },
    },
  );
  // De qué tipo sale cada puesto, en el orden de su `slot` (`tipoDelStack`).
  const tipos = (l: LadoDeArena): readonly TipoDeArena[] => l.unidades.map(tipoDeLaFuente);
  // Y la ficha de cada tipo y de cada héroe, con la que el retoque compara.
  const fichas: Record<string, FichaEnPalabras> = {};
  for (const lado of ['izquierda', 'derecha'] as const) {
    for (const f of montaje[lado].unidades) {
      fichas[claveDeFicha(tipoDeLaFuente(f))] = fichaEnPalabras(f, eq);
    }
    const heroe = montaje[lado].heroe;
    if (heroe !== null) fichas[claveDeFicha({ kind: 'heroe', lado })] = fichaDelHeroe(heroe);
  }
  return {
    ...batalla,
    tiposDeArena: {
      [LADOS.izquierda.bando]: tipos(montaje.izquierda),
      [LADOS.derecha.bando]: tipos(montaje.derecha),
    } as Record<Side, readonly TipoDeArena[]>,
    fichasDeArena: fichas,
    piezasDeArena: piezasDeLaArena(eq),
  };
}

/**
 * De qué sale un stack de una pelea de la arena: una unidad del catálogo (lo que
 * anotó `batallaDeArena`), o el héroe de un lado. Es lo que se
 * edita al pulsar «Editar» en su fila, y lo que cambia `retocarEnBatalla`. Lanza
 * con un stack que no sale del montaje: no es una pelea de la arena.
 */
export function tipoDelStack(
  state: BattleState,
  s: BattleStack,
): TipoDeArena | { readonly kind: 'heroe'; readonly lado: Lado } {
  if (s.origen.kind === 'heroe') return { kind: 'heroe', lado: ladoDe(s.side) };
  const tipo = state.tiposDeArena?.[s.side][s.slot];
  if (tipo === undefined) {
    throw new Error(`${s.id} no sale de ningún puesto del montaje: no es una pelea de la arena`);
  }
  return tipo;
}

// ------------------------------------------------------------- la ficha en palabras

/** Qué hace cada rasgo del motor, dicho en corto: la casilla de la ficha y el parte. */
export const NOMBRE_DE_RASGO: Readonly<Record<CreatureTrait, string>> = {
  undead: 'no-muerto',
  flying: 'vuela',
  no_retaliation: 'sin contraataque',
  double_attack: 'ataque doble',
  double_shot: 'disparo doble',
  life_drain: 'drena vida',
  splash_shot: 'disparo con salpicadura',
  charge: 'carga',
  curse_on_hit: 'maldice al golpear',
  bane_undead: 'azote de no-muertos',
  fear: 'terror',
  escalar: 'escala murallas',
};

/**
 * Cómo se dice una habilidad: la que da un poder de cura, con lo que cura en vez
 * de la X del cuaderno («Curar (4 PV)»; M3 de QA: el chip decía «Curar (X)»); la
 * de otro poder, por su nombre; las demás, tal cual. El valor guardado sigue
 * siendo el nombre del cuaderno.
 */
export function nombreDeHabilidad(h: string): string {
  const id = poderDeHabilidad(h);
  if (id === null) return h;
  const p = poder(id);
  return esDeCura(p) ? `${p.nombre} (${p.lanzador.cantidad} PV)` : p.nombre;
}

/** La clave de una ficha en `BattleState.fichasDeArena`: un tipo del montaje o el héroe de un lado. */
function claveDeFicha(t: TipoDeArena | { readonly kind: 'heroe'; readonly lado: Lado }): string {
  return t.kind === 'heroe' ? `heroe:${t.lado}` : `${t.kind}:${t.id}`;
}

function tipoDeLaFuente(f: FuenteDeArena): TipoDeArena {
  return { kind: 'unidad', id: f.unidad.id };
}

/**
 * La ficha de una fuente en palabras, campo a campo y en el orden de la ficha:
 * lo que escribe la persona. La de una unidad lleva su equipo hueco a hueco
 * («escudo: − Escudo») y también lo que no pelea
 * (liderazgo, coste, habilidades sin motor), porque también se edita a media
 * pelea y el parte tiene que decirlo (N1 de QA). Lanza con lo que no valida, como
 * el montaje. El nivel no va: no lo escribe nadie, sale de las
 * cifras (`lecturaDelNivel`), y el parte diría dos veces el mismo cambio.
 */
function fichaEnPalabras(f: FuenteDeArena, eq: EquipoAtado): FichaEnPalabras {
  const rasgos = (ts: readonly CreatureTrait[] | undefined) =>
    (ts ?? []).map((t) => NOMBRE_DE_RASGO[t]);
  const u = validarUnidadDeArena(f.unidad, eq);
  return {
    nombre: u.name,
    facción: NOMBRE_DE_FACCION_DE_ARENA[u.faction],
    liderazgo: `${u.leadership}`,
    ataque: `${u.attack}`,
    defensa: `${u.defense}`,
    daño: u.damage.join('-'),
    vida: `${u.hp}`,
    casillas: `${u.casillas}`,
    rasgos: rasgos(u.traits),
    habilidades: u.habilidades.map(nombreDeHabilidad),
    // Un hueco, una lista de cero o una pieza: el parte dice «escudo: − Escudo».
    ...huecosEnPalabras(u.equipo, eq),
    'coste (oro)': `${u.cost.gold}`,
  };
}

/**
 * Lo que lleva cada hueco, por el nombre de su pieza: una lista de cero o una
 * («escudo: − Escudo» en el parte). Lo leen la ficha de una unidad y el cambio de
 * una pieza a media pelea, que renombrada la pone al día.
 */
function huecosEnPalabras(
  equipo: EquipoDeArena,
  eq: EquipoAtado,
): Record<HuecoDeArena, readonly string[]> {
  const dicho: Partial<Record<HuecoDeArena, readonly string[]>> = {};
  for (const h of HUECOS_DE_LA_ARENA) {
    const id = equipo[h];
    dicho[h] = id === undefined ? [] : [eq.pieza(id).nombre];
  }
  return dicho as Record<HuecoDeArena, readonly string[]>;
}

/**
 * La ficha de un héroe en palabras: las cifras que se escriben en ella, no las de
 * su cuerpo, que llevan el equipo base (N2 de QA: «ataque 2 → 9» salía «5 → 12»),
 * y el libro por los nombres que enseña la página («Prisa», no `haste`).
 */
function fichaDelHeroe(datos: HeroeDeArena): FichaEnPalabras {
  const h = validarHeroeDeArena(datos);
  return {
    nombre: h.nombre,
    ataque: `${h.ataque}`,
    defensa: `${h.defensa}`,
    poder: `${h.poder}`,
    conocimiento: `${h.conocimiento}`,
    hechizos: h.hechizos
      .map(spell)
      .sort(ordenDelLibro)
      .map((x) => x.name),
  };
}

/**
 * Qué cambia de una ficha a otra, una entrada por campo y en palabras: una cifra,
 * «ataque 3 → 10»; una lista, solo lo que entra y lo que sale, «hechizos: −
 * Prisa» (N2 de QA: salía la lista entera, dos veces y con los ids). Vacío si no
 * cambia nada: ese retoque no escribe nada (N1 de QA).
 */
export function cambiosDeLaFicha(antes: FichaEnPalabras, despues: FichaEnPalabras): string[] {
  const c: string[] = [];
  for (const campo of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    const a = antes[campo] ?? '';
    const b = despues[campo] ?? '';
    if (typeof a === 'string' && typeof b === 'string') {
      if (a !== b) c.push(`${campo} ${a} → ${b}`);
      continue;
    }
    const xs = typeof a === 'string' ? [] : a;
    const ys = typeof b === 'string' ? [] : b;
    const entra = ys.filter((y) => !xs.includes(y)).map((y) => `+ ${y}`);
    const sale = xs.filter((x) => !ys.includes(x)).map((x) => `− ${x}`);
    if (entra.length + sale.length > 0) c.push(`${campo}: ${[...entra, ...sale].join(', ')}`);
  }
  return c;
}

// ------------------------------------------------------------- retocar en la pelea

/**
 * Un cambio de cifras a media pelea (decisión del usuario, 11-10-2026: «que
 * pueda modificar los personajes durante el combate»): las de un TIPO —una unidad
 * del catálogo, como en la ficha del montaje— o las del héroe de un lado.
 */
export type RetoqueDeArena =
  | { readonly kind: 'tipo'; readonly fuente: FuenteDeArena }
  | { readonly kind: 'heroe'; readonly lado: Lado; readonly datos: HeroeDeArena }
  /**
   * Las piezas de la arena enteras, como quedan tras el cambio (las del borrador:
   * `piezasDeLaArena`). Cambiar una, crearla, borrarla y volver a la del juego son
   * lo mismo: otra lista. «Editar equipo» también vale a media pelea.
   */
  | { readonly kind: 'piezas'; readonly piezas: readonly PiezaEscrita[] };

/**
 * Aplica el retoque a la batalla en curso y devuelve `null`, o devuelve por qué
 * no entra sin haber tocado nada. La ÚNICA redacción: la sesión de la arena la
 * enseña en el editor y, si no entra, no cambia el borrador.
 *
 * Un tipo cambia en TODOS sus stacks, vivos o muertos y de los dos bandos —es lo
 * que hace la ficha del montaje con la pelea siguiente—, y nunca el héroe aunque
 * su figura sea la misma hoja. Cada stack se sustituye entero en `state.stacks`
 * con las cifras nuevas, sin tocar nunca el objeto de `unit`, que puede ser el del
 * catálogo. **Lo gastado sigue gastado**: la herida y el maná que ya se fueron se restan de las cifras nuevas (`topHp = máx(1, PV nuevos −
 * herida)`): subir la vida no cura, y bajarla no mata. La moral no se recalcula y
 * la velocidad nueva cuenta en la cola desde la ronda siguiente, como la Prisa a
 * media ronda. Lo que no se cambia a media pelea es la figura del héroe: eso, en
 * el montaje (toda unidad de la arena ocupa una casilla, 13-10-2026). Lo que entra deja un `retoque` en el
 * registro.
 *
 * Una pieza (`kind: 'piezas'`) cambia a la vez todos los stacks que la llevan, de
 * los dos bandos y el héroe incluido, con la misma cuenta de lo gastado
 * (`retocarLasPiezas`). Las cifras de los tipos y del héroe se leen siempre con
 * las piezas de la pelea (`BattleState.piezasDeArena`).
 */
export function retocarEnBatalla(state: BattleState, r: RetoqueDeArena): string | null {
  if (state.finished !== null) {
    return 'la batalla ya ha terminado; el cambio vale para la pelea siguiente';
  }
  const eq = catalogoDeLaArena(state.piezasDeArena ?? []);
  // Las cifras nuevas salen de la misma validación que el montaje: lo que no
  // valida es el motivo.
  switch (r.kind) {
    case 'tipo': {
      const nuevo = oElMotivo(() => ({
        unit: unidadDeLaFuente(r.fuente, eq),
        ficha: fichaEnPalabras(r.fuente, eq),
      }));
      return 'motivo' in nuevo
        ? nuevo.motivo
        : retocarElTipo(state, r.fuente, nuevo.valor.unit, nuevo.valor.ficha);
    }
    case 'heroe': {
      const nuevo = oElMotivo(() => ({
        heroe: heroeDeArena(r.datos, eq),
        ficha: fichaDelHeroe(r.datos),
      }));
      return 'motivo' in nuevo
        ? nuevo.motivo
        : retocarElHeroe(state, r.lado, nuevo.valor.heroe, nuevo.valor.ficha);
    }
    case 'piezas':
      return retocarLasPiezas(state, eq, r.piezas);
  }
}

/** Lo que da `f`, o el mensaje con el que lanza. */
function oElMotivo<T>(f: () => T): { readonly valor: T } | { readonly motivo: string } {
  try {
    return { valor: f() };
  } catch (err) {
    return { motivo: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * La ficha de antes de `clave`, que puso el montaje. Sin ella la batalla no la
 * montó `batallaDeArena`: el parte no sabría qué cambió, y se dice.
 */
function fichaDeAntes(state: BattleState, clave: string): FichaEnPalabras {
  const ficha = state.fichasDeArena?.[clave];
  if (ficha === undefined) {
    throw new Error(`la pelea no trae la ficha de ${clave}: no la montó la arena`);
  }
  return ficha;
}

function retocarElTipo(
  state: BattleState,
  fuente: FuenteDeArena,
  unit: UnitInfo,
  ficha: FichaEnPalabras,
): string | null {
  const tipo = tipoDeLaFuente(fuente);
  const suyos = stacksDeLaFicha(state, claveDeFicha(tipo));
  if (suyos.length === 0) return `${unit.name} no está en esta pelea`;
  const clave = claveDeFicha(tipo);
  const cambios = cambiosDeLaFicha(fichaDeAntes(state, clave), ficha);
  // La ficha manda: si no cambia, tampoco cambia ninguna cifra de la pelea, y
  // no se escribe nada (N1 de QA: «ataque 3 → 3» dejaba una línea y «Cambiado»).
  if (cambios.length === 0) return null;
  aplicarAlTipo(state, suyos, unit);
  (state.fichasDeArena as Record<string, FichaEnPalabras>)[clave] = ficha;
  state.log.push({ kind: 'retoque', nombre: unit.name, stacks: suyos.map((s) => s.id), cambios });
  return null;
}

/**
 * Los stacks de una ficha (`claveDeFicha`): los de un tipo, vivos o muertos y de
 * los dos bandos, o el cuerpo del héroe de un lado.
 */
function stacksDeLaFicha(state: BattleState, clave: string): BattleStack[] {
  return state.stacks.filter((s) => claveDeFicha(tipoDelStack(state, s)) === clave);
}

/**
 * Pone las cifras `unit` a cada stack de `suyos`, con lo gastado restado
 * (`conCifrasNuevas`) y la veteranía de cada uno encima. **El único bucle** de un
 * retoque: lo usan cambiar un tipo y cambiar una pieza, y por eso un mismo cambio
 * deja la misma herida por los dos caminos.
 */
function aplicarAlTipo(state: BattleState, suyos: readonly BattleStack[], unit: UnitInfo): void {
  for (const s of suyos) {
    const veterania = s.origen.kind === 'heroe' ? null : s.origen.veterania;
    conCifrasNuevas(state, s, cifrasDelIndividuo(unit, veterania));
  }
}

/**
 * Cambia las piezas de la pelea a `nuevas` (las del borrador, `kind: 'piezas'`),
 * en dos tiempos y sin tocar nada si no entra: primero cada stack que lleva algo
 * se vuelve a sumar con las piezas nuevas desde el propio stack —su cuerpo,
 * `UnitInfo.sinEquipo`, más lo que lleva, `UnitInfo.equipo`—, con la regla de
 * siempre (`equipoQueNoVale`); el primero que no vale es el motivo. Después, a
 * los que cambian de cifras, las nuevas con la misma cuenta de lo gastado que
 * cambiar el tipo a mano (`conCifrasNuevas`).
 *
 * El parte lleva un `retoque` por pieza que cambia las cifras de alguien, con
 * todos los stacks que la llevan y lo que cambió de ella («ataque 2 → 5»). Las
 * fichas se ponen al día (el nombre de la pieza) sin escribir su diferencia: lo
 * que cambió es la pieza, no la unidad.
 */
function retocarLasPiezas(
  state: BattleState,
  antes: CatalogoDeLaArena,
  nuevas: readonly PiezaEscrita[],
): string | null {
  const leido = oElMotivo(() => catalogoDeLaArena(nuevas));
  if ('motivo' in leido) return leido.motivo;
  const despues = leido.valor;
  const cambian: {
    readonly s: BattleStack;
    readonly unit: UnitInfo;
    readonly lleva: EquipoDeArena;
  }[] = [];
  for (const s of state.stacks) {
    const cuerpo = s.unit.sinEquipo;
    const lleva = s.unit.equipo;
    if (cuerpo === undefined || lleva === undefined) continue;
    const motivo = equipoQueNoVale(cuerpo, lleva, despues);
    if (motivo !== null) return motivo;
    const unit = despues.conEquipo(cuerpo, lleva);
    if (!mismasCifras(s.unit, unit)) cambian.push({ s, unit, lleva });
  }
  for (const { s, unit } of cambian) conCifrasNuevas(state, s, unit);
  // Un retoque por pieza que cambia a alguien, con quien la lleva.
  for (const id of new Set([...antes.piezas.keys(), ...despues.piezas.keys()])) {
    const a = antes.piezaSiExiste(id);
    const d = despues.piezaSiExiste(id);
    if (a === null || d === null || mismaPieza(a, d)) continue;
    const suyos = cambian.filter((c) => idsPuestos(c.lleva).includes(id));
    if (suyos.length === 0) continue;
    const cambios = cambiosDeLaFicha(piezaEnPalabras(a), piezaEnPalabras(d));
    // Vuelve a la de serie la que lo es con todas sus bases; la que sigue escrita
    // igual cambió por su base (el vínculo es vivo), y se dice cuál.
    const escritaAntes = antes.escritas.get(id);
    const escrita = escritaDe(despues, id);
    if (deSerieConSusBases(despues, id)) cambios.push('vuelve a la de serie');
    else if (
      escritaAntes !== undefined &&
      esPiezaConBase(escrita) &&
      mismaPieza(escrita, escritaAntes)
    ) {
      // La base que se tocó, no la de al lado (QA 3 del 18-10-2026): cambiar la
      // Espada se dice «por su base, «Espada»» también en la bendita.
      const tocada =
        primeraBaseQue(despues, id, (e) => {
          const a = antes.escritas.get(e.id);
          return a === undefined || !mismaPieza(a, e);
        }) ?? despues.pieza(escrita.base);
      cambios.push(`por su base, «${tocada.nombre}»`);
    }
    state.log.push({
      kind: 'retoque',
      nombre: d.nombre,
      stacks: suyos.map((c) => c.s.id),
      cambios,
    });
  }
  state.piezasDeArena = piezasDeLaArena(despues);
  // Las fichas de las unidades nombran sus piezas: renombrada una, al día.
  const fichas = state.fichasDeArena as Record<string, FichaEnPalabras> | undefined;
  for (const s of state.stacks) {
    const lleva = s.unit.equipo;
    if (fichas === undefined || lleva === undefined || s.origen.kind === 'heroe') continue;
    const clave = claveDeFicha(tipoDelStack(state, s));
    const ficha = fichas[clave];
    if (ficha !== undefined) fichas[clave] = { ...ficha, ...huecosEnPalabras(lleva, despues) };
  }
  return null;
}

function retocarElHeroe(
  state: BattleState,
  lado: Lado,
  nuevo: HeroeDelBando,
  ficha: FichaEnPalabras,
): string | null {
  const bando = LADOS[lado].bando;
  const antes = state.heroes[bando];
  const cuerpo = state.stacks.find((s) => s.side === bando && s.origen.kind === 'heroe');
  if (antes === null || cuerpo === undefined) {
    return `el bando ${LADOS[lado].adjetivo} no lleva héroe en esta pelea`;
  }
  if ((nuevo.figura ?? HERO_BODY) !== cuerpo.body) {
    return 'la figura del héroe no se cambia a media pelea: eso, en el montaje';
  }
  const clave = claveDeFicha({ kind: 'heroe', lado });
  const cambios = cambiosDeLaFicha(fichaDeAntes(state, clave), ficha);
  if (cambios.length === 0) return null;
  conCifrasNuevas(state, cuerpo, nuevo.cuerpo);
  // El maná, como la herida: lo que el Conocimiento nuevo no deja restar se debe.
  const gastado = maxMana(antes) - antes.mana + (antes.manaGastadoDeMas ?? 0);
  const mana = Math.max(0, nuevo.mando.mana - gastado);
  const deMas = gastado - (nuevo.mando.mana - mana);
  state.heroes[bando] = {
    ...nuevo.mando,
    mana,
    castThisRound: antes.castThisRound,
    ...(deMas === 0 ? {} : { manaGastadoDeMas: deMas }),
  };
  (state.fichasDeArena as Record<string, FichaEnPalabras>)[clave] = ficha;
  state.log.push({ kind: 'retoque', nombre: nuevo.mando.name, stacks: [cuerpo.id], cambios });
  return null;
}

/**
 * Sustituye `s` en la batalla por el mismo stack con las cifras `unit`, con lo
 * gastado restado (`retocarEnBatalla`). Un stack nuevo, no el viejo retocado:
 * `unit` es de solo lectura, y nadie guarda un stack de una jugada a otra (se
 * buscan por id).
 *
 * Lo gastado es lo que se ve (`hp − topHp`) más lo que se debía de un retoque
 * anterior (`gastadoDeMas`); lo que las cifras nuevas no dejan restar —la vida no
 * baja de 1— se vuelve a deber. Calculado solo desde las cifras de ese momento,
 * bajar la vida por debajo de la herida y volver a subirla curaba (N3 de QA). Curar
 * mientras se debe cura la herida de verdad: lo curado sube `topHp` y la deuda se
 * queda. Sin munición: en la arena no se cuentan tiros (13-10-2026).
 */
function conCifrasNuevas(state: BattleState, s: BattleStack, unit: UnitInfo): void {
  const i = state.stacks.indexOf(s);
  if (i < 0) throw new Error(`${s.id} no está en esta batalla`);
  const { gastadoDeMas: debe, ...resto } = s;
  if (s.count === 0) {
    state.stacks[i] = { ...s, unit };
    return;
  }
  const herida = s.unit.hp - s.topHp + (debe ?? 0);
  const topHp = Math.max(1, unit.hp - herida);
  const deMas = herida - (unit.hp - topHp);
  state.stacks[i] = {
    ...resto,
    unit,
    topHp,
    ...(deMas === 0 ? {} : { gastadoDeMas: deMas }),
  };
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
  const eq = catalogoDeLaArena(montaje.piezas);
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
 * escalera» se marcaba en un troll de dos casillas o en una voladora y
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

// ------------------------------------------------------------- el enlace de la pelea

/**
 * Un puesto del montaje tal como va en el enlace: una unidad del catálogo (sus
 * cifras van en `MontajeDelEnlace.unidades`) y si lleva escalera.
 */
export interface PuestoDelEnlace {
  readonly unidad: string;
  readonly escalera: boolean;
}

/** Un lado del enlace: quién lo mueve, entero —la persona o la IA—, sus puestos y su héroe. */
export interface LadoDelEnlace {
  readonly ia: boolean;
  readonly puestos: readonly PuestoDelEnlace[];
  readonly heroe: HeroeDeArena | null;
}

/** Quién mueve cada bando si nada lo dice: la izquierda, la persona; la derecha, la IA. */
export const IA_POR_DEFECTO: Readonly<Record<Lado, boolean>> = { izquierda: false, derecha: true };

/**
 * El montaje entero que viaja en la URL de la arena (`?montaje=`), con la
 * semilla y las reglas en sus propios parámetros: abrir el enlace monta la misma
 * pelea (H6 de QA, decisión del usuario del 09-10-2026). Las cifras van por
 * TIPO, como las lleva la página: dos monjes son un monje en `unidades`.
 */
export interface MontajeDelEnlace {
  /** Las cifras de cada unidad montada, guardadas o no, en el orden en que salen. */
  readonly unidades: readonly UnidadDeArena[];
  /**
   * Las piezas de la arena que lleva lo montado (`piezasDelMontaje`), para que el
   * enlace se abra igual en otra máquina: con ellas encima de las del juego pelea
   * la pelea del enlace.
   */
  readonly piezas: readonly PiezaEscrita[];
  readonly izquierda: LadoDelEnlace;
  readonly derecha: LadoDelEnlace;
  /** La muralla del tablero, o `null` sin ella. */
  readonly muralla: MurallaDeBatalla | null;
}

/**
 * El único valor de un parámetro de la URL (`URLSearchParams.getAll`), o `null`
 * si no está. Repetido se rechaza diciéndolo, como lo que no es una semilla o una
 * regla: quedarse con el primero en silencio repetía otra pelea que la que dice
 * la URL (`?reglas=tirador&reglas=bendicion` encendía solo el tirador, H4 de QA
 * del banco).
 */
export function unaVezEnLaURL(valores: readonly string[], nombre: string): string | null {
  if (valores.length > 1) {
    throw new Error(
      `«${nombre}» va ${valores.length} veces en la URL (${valores.map((v) => `«${v}»`).join(', ')}): pon uno solo${nombre === 'reglas' ? ', con las reglas separadas por comas (reglas=tirador,bendicion)' : ''}`,
    );
  }
  return valores[0] ?? null;
}

/**
 * La versión del formato. **Se lee solo la de hoy** (14-10-2026, el usuario: «no
 * queremos mantener compatibilidad hacia atrás, estamos en pleno desarrollo»): un
 * enlace de otra se rechaza diciendo que se vuelva a copiar, sin convertir nada.
 * Cambiar el formato es subirla.
 */
export const VERSION_DEL_ENLACE = 11;

const CAMPOS_DEL_ENLACE = ['v', 'unidades', 'piezas', 'izquierda', 'derecha', 'muralla'];
const CAMPOS_DEL_LADO = ['ia', 'puestos', 'heroe'];
const CAMPOS_DEL_PUESTO = ['unidad', 'escalera'];
const CAMPOS_DEL_HEROE = [
  'nombre',
  'figura',
  'ataque',
  'defensa',
  'poder',
  'conocimiento',
  'hechizos',
];

/** Un objeto con solo esos campos, o se lanza diciendo cuál sobra o falta. */
function objetoCon(
  valor: unknown,
  campos: readonly string[],
  quien: string,
): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${quien} tiene que ser un objeto`);
  }
  const o = valor as Record<string, unknown>;
  const ajeno = Object.keys(o).find((k) => !campos.includes(k));
  if (ajeno !== undefined) throw new Error(`${quien}: «${ajeno}» no es un campo del enlace`);
  const falta = campos.find((k) => !(k in o));
  if (falta !== undefined) throw new Error(`${quien}: falta «${falta}»`);
  return o;
}

function siONo(valor: unknown, quien: string, campo = 'ia'): boolean {
  if (typeof valor !== 'boolean')
    throw new Error(`${quien}: «${campo}» tiene que ser true o false`);
  return valor;
}

/**
 * Lee el montaje de `?montaje=` y lo comprueba entero antes de devolver nada:
 * un enlace mal formado, de otra versión o con una unidad o un hechizo que no
 * existen lanza diciendo qué, y la página no monta nada a medias. Que las hojas
 * tengan arte lo mira la página, que es quien las tiene.
 *
 * Las unidades se leen con las piezas con que pelearán: las del juego con las
 * del enlace encima. Una unidad que con ellas no vale no se monta, y se dice por qué.
 */
export function montajeDeLaURL(textoDelEnlace: string): MontajeDelEnlace {
  let crudo: unknown;
  try {
    crudo = JSON.parse(textoDelEnlace);
  } catch (err) {
    throw new Error(
      `el montaje del enlace no se puede leer (${err instanceof Error ? err.message : String(err)}): puede que se cortara al copiarlo`,
    );
  }
  const v =
    typeof crudo === 'object' && crudo !== null && 'v' in crudo
      ? (crudo as { v: unknown }).v
      : null;
  if (v !== VERSION_DEL_ENLACE) {
    throw new Error(
      typeof v === 'number' && Number.isInteger(v) && v >= 1 && v < VERSION_DEL_ENLACE
        ? `este enlace es de una versión anterior de la arena (la ${v}; la de hoy es la ${VERSION_DEL_ENLACE}): vuelve a copiarlo`
        : `el montaje del enlace es de la versión ${JSON.stringify(v)} y esta arena lee la ${VERSION_DEL_ENLACE}`,
    );
  }
  const o = objetoCon(crudo, CAMPOS_DEL_ENLACE, 'el montaje del enlace');
  // Las piezas del enlace, una a una con la regla de la arena; con ellas pelea.
  const piezas = lista(o.piezas, 'las piezas', 'el montaje del enlace').map((crudo) => {
    try {
      return validarPiezaDeArena(crudo);
    } catch (err) {
      throw new Error(
        `una pieza del enlace no vale: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
  sinRepetir(
    piezas.map((p) => p.id),
    'la pieza',
    'el montaje del enlace',
  );
  const conLasPiezas = catalogoDeLaArena(piezas);
  // La primera unidad que no vale tumba el enlace.
  const unidades = lista(o.unidades, 'las unidades', 'el montaje del enlace').map((c) =>
    validarUnidadDeArena(c, conLasPiezas),
  );
  sinRepetir(
    unidades.map((u) => u.id),
    'la unidad',
    'el montaje del enlace',
  );
  const izquierda = ladoDelEnlace(o.izquierda, 'izquierda');
  const derecha = ladoDelEnlace(o.derecha, 'derecha');
  let muralla: MurallaDeBatalla | null = null;
  if (o.muralla !== null) {
    try {
      muralla = validarMuralla(o.muralla);
    } catch (err) {
      throw new Error(
        `la muralla del enlace no vale: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  // Cada cifra del enlace es de un puesto montado, y cada hoja montada trae las
  // suyas: lo que sobra o falta no es un enlace que haya escrito la página.
  const puestos = [...izquierda.puestos, ...derecha.puestos];
  for (const p of puestos) {
    if (!unidades.some((u) => u.id === p.unidad)) {
      throw new Error(`el montaje del enlace pone «${p.unidad}» y no trae sus cifras`);
    }
  }
  for (const u of unidades) {
    if (!puestos.some((p) => p.unidad === u.id)) {
      throw new Error(`el montaje del enlace trae las cifras de «${u.id}» y no la monta`);
    }
  }
  // Cada pieza del enlace la lleva alguien: lo que sobra no lo escribió la página.
  const llevadas = piezasDelMontaje(
    unidades,
    izquierda.heroe !== null || derecha.heroe !== null,
    piezas,
  );
  for (const p of piezas) {
    if (!llevadas.includes(p)) {
      throw new Error(`el montaje del enlace trae la pieza «${p.nombre}» y no la lleva nadie`);
    }
  }
  const montaje = { unidades, piezas, izquierda, derecha, muralla };
  // Que quepa en sus columnas de salida y que nadie lleve una escalera que no
  // usaría, con las mismas preguntas que el montaje de la página: un enlace no
  // monta lo que la página no dejaría montar.
  const delEnlace = montajeDeArenaDelEnlace(montaje, REGLAS_DEL_JUEGO, piezas);
  const despliegue = despliegueDeArenaBlocker(delEnlace);
  if (despliegue !== null) throw new Error(`el montaje del enlace no cabe: ${despliegue}`);
  for (const lado of ['izquierda', 'derecha'] as const) {
    delEnlace[lado].unidades.forEach((fuente, i) => {
      if (fuente.escalera !== true) return;
      const motivo = escaleraDeArenaBlocker(fuente, lado, conLasPiezas);
      if (motivo !== null) {
        throw new Error(
          `el bando ${LADOS[lado].adjetivo} del enlace, puesto ${i + 1}, lleva escalera y ${motivo}`,
        );
      }
    });
  }
  return montaje;
}

/**
 * El montaje con el que pelea un enlace ya leído, con estas reglas y estas
 * piezas: las fuentes de cada puesto (la unidad con sus cifras) y la muralla. Las
 * piezas las da quien lo abre (las del enlace). Lo que mueve la IA no es del
 * montaje: lo lee la página del enlace.
 */
export function montajeDeArenaDelEnlace(
  m: MontajeDelEnlace,
  reglas: ReglasDeBatalla,
  piezas: readonly PiezaEscrita[],
): MontajeDeArena {
  const lado = (l: LadoDelEnlace): LadoDeArena => ({
    unidades: l.puestos.map((p): FuenteDeArena => {
      const unidad = m.unidades.find((u) => u.id === p.unidad);
      if (unidad === undefined) {
        throw new Error(`el montaje del enlace pone «${p.unidad}» y no trae sus cifras`);
      }
      return { unidad, escalera: p.escalera };
    }),
    heroe: l.heroe,
  });
  return {
    izquierda: lado(m.izquierda),
    derecha: lado(m.derecha),
    reglas,
    ...(m.muralla === null ? {} : { muralla: m.muralla }),
    piezas,
  };
}

/** Un lado del enlace, comprobado. */
function ladoDelEnlace(valor: unknown, lado: Lado): LadoDelEnlace {
  const quien = `el bando ${LADOS[lado].adjetivo} del enlace`;
  const delHeroe = `el héroe del bando ${LADOS[lado].adjetivo} del enlace`;
  const o = objetoCon(valor, CAMPOS_DEL_LADO, quien);
  const puestos = lista(o.puestos, 'los puestos', quien).map((crudo, i): PuestoDelEnlace => {
    const q = `${quien}, puesto ${i + 1}`;
    const p = objetoCon(crudo, CAMPOS_DEL_PUESTO, q);
    return {
      unidad: texto(p.unidad, 'la unidad', q),
      escalera: siONo(p.escalera, q, 'escalera'),
    };
  });
  let heroe: HeroeDeArena | null = null;
  if (o.heroe !== null) {
    const h = objetoCon(o.heroe, CAMPOS_DEL_HEROE, delHeroe);
    if (h.figura !== null && typeof h.figura !== 'string') {
      throw new Error(`${delHeroe}: la figura tiene que ser el id de una hoja o null`);
    }
    heroe = validarHeroeDeArena(h as unknown as HeroeDeArena);
  }
  const cuantos = puestos.length + (heroe === null ? 0 : 1);
  if (cuantos > LIDERAZGO.maxPorBando) {
    throw new Error(`${quien} lleva ${cuantos} y caben ${LIDERAZGO.maxPorBando}`);
  }
  return { ia: siONo(o.ia, quien), puestos, heroe };
}

/**
 * El texto de `?montaje=`, la inversa exacta de `montajeDeLaURL`. Se escribe lo
 * que se LEE de él: así un montaje que no se podría abrir no llega a un enlace, y
 * el texto sale con el orden de campos de los validadores, el mismo cada vez.
 */
export function montajeALaURL(m: MontajeDelEnlace): string {
  return textoDelMontaje(montajeDeLaURL(textoDelMontaje(m)));
}

function textoDelMontaje(m: MontajeDelEnlace): string {
  const lado = (l: LadoDelEnlace) => ({
    ia: l.ia,
    puestos: l.puestos.map((p) => ({ unidad: p.unidad, escalera: p.escalera })),
    heroe: l.heroe,
  });
  return JSON.stringify({
    v: VERSION_DEL_ENLACE,
    unidades: m.unidades,
    piezas: m.piezas,
    izquierda: lado(m.izquierda),
    derecha: lado(m.derecha),
    muralla: m.muralla,
  });
}
