/**
 * El equipo: cinco huecos por individuo, unidad y héroe —el arma de cuerpo a
 * cuerpo, la de disparar, la de carga, la armadura y el escudo (`HUECOS`)— con una
 * pieza de `data/equipo.json` en cada uno, o nada: cada arma para lo suyo, y cada
 * golpe con las cifras de la suya (`UnitInfo.armas`). **Una sola clase de piezas**
 * (18-10-2026): las mismas en el juego y en la arena, que las edita y las guarda.
 *
 * Lo pide `NuevaJugabilidad.md` («Las tropas también ganan experiencia y equipo.
 * Cuando mueren se pierde pero dura toda la campaña»), y las cifras son
 * **inventadas y provisionales**: HoMM2 no tiene equipo de tropa.
 *
 * Dónde vive cada cosa:
 *
 * - el de un individuo, en su hoja (`Veterania.equipo`): dura lo que dura él;
 * - el de un héroe, en `Hero.equipo`, y lo que no lleva puesto en su mochila
 *   (`Hero.mochila`), sin tope;
 * - las cifras se suman en las puertas de siempre —`cifrasDelIndividuo` para la
 *   tropa y `heroUnit` para el héroe—, con `conEquipo`, que es la única suma.
 *
 * Este módulo es puro y no importa el estado: las acciones que equipan, compran
 * y reparten botín viven en `game.ts`, que es el único que escribe la crónica.
 */

import { CARGA, CARGA_MINIMA } from '../battle/carga.js';
import {
  DICHO_DE_DONDE,
  EQUIPO,
  EQUIPO_ESCRITO,
  HEROE,
  leerEquipo,
  leerPiezas,
  type Pieza,
  type PiezaEscrita,
  SOLO_EN_KITS,
} from '../data.js';
import type {
  ArmasDeLaUnidad,
  CifraDePieza,
  Equipo,
  GolpeConArma,
  Hueco,
  HuecoDeArmaPorUso,
  Troop,
  UnitInfo,
  UsoDeArma,
  Veterania,
} from '../types.js';
import {
  CIFRAS_DE_PIEZA,
  esArmaPorUso,
  esHueco,
  HUECOS,
  huecoDesconocido,
  NOMBRE_DE_CIFRA,
  NOMBRE_DE_HUECO,
  SPEED_TIERS,
  TIPOS_DEL_ANILLO,
} from '../types.js';
import type { Hero } from './hero.js';

/** Las piezas que se pueden llevar, por su id. */
export type CatalogoDePiezas = ReadonlyMap<string, Pieza>;

/** El catálogo del juego: `data/equipo.json` por id, tal como se cargó. El único que ve el juego. */
export const PIEZAS_DEL_CATALOGO: CatalogoDePiezas = new Map(EQUIPO.map((p) => [p.id, p]));

/**
 * Las lecturas de las piezas atadas a UN catálogo (`equipoCon`). El juego usa las
 * sueltas de este módulo, que leen siempre el suyo (`PIEZAS_DEL_CATALOGO`, el
 * fichero tal como se cargó); la arena edita el catálogo en memoria antes de
 * guardarlo y pelea con él (`catalogoDeEquipo`), y solo entra por aquí: así no hay
 * lectura que se olvide de su catálogo y resuelva en silencio con la pieza que se
 * cargó. Que la arena no importe las sueltas lo vigila `test/invariantes.test.ts`.
 */
export interface EquipoAtado {
  readonly piezas: CatalogoDePiezas;
  readonly pieza: (id: string) => Pieza;
  readonly piezaSiExiste: (id: string) => Pieza | null;
  readonly piezasPuestas: (equipo: Equipo | undefined) => Pieza[];
  readonly sumaDeEquipo: (equipo: Equipo | undefined) => SumaDeEquipo;
  readonly conEquipo: <U extends UnitInfo>(unit: U, equipo: Equipo | undefined) => U;
  readonly manosBlocker: (equipo: Equipo | undefined, id: string) => string | null;
  readonly equipoBlocker: (equipo: Equipo) => string | null;
  readonly ponerPieza: (
    equipo: Equipo | undefined,
    id: string,
    portador?: string,
  ) => { readonly equipo: Equipo; readonly quitada: string | null };
}

/**
 * Un catálogo de equipo con cómo está escrita cada pieza (`escritas`: entera o
 * sobre su base), por id, además de sus lecturas resueltas. La ficha de la arena,
 * el cambio de base y lo que se guarda leen las escritas; todo lo que pelea, las
 * resueltas.
 */
export type CatalogoDeEquipo = EquipoAtado & {
  readonly escritas: ReadonlyMap<string, PiezaEscrita>;
};

/** Las lecturas de las piezas con el catálogo `piezas` (`EquipoAtado`). */
export function equipoCon(piezas: CatalogoDePiezas): EquipoAtado {
  return {
    piezas,
    pieza: (id) => piezaDe(piezas, id),
    piezaSiExiste: (id) => piezas.get(id) ?? null,
    piezasPuestas: (equipo) => puestasDe(piezas, equipo),
    sumaDeEquipo: (equipo) => sumaDe(piezas, equipo),
    conEquipo: (unit, equipo) => vestir(piezas, unit, equipo),
    manosBlocker: (equipo, id) => manosDe(piezas, equipo, id),
    equipoBlocker: (equipo) => equipoBlockerDe(piezas, equipo),
    ponerPieza: (equipo, id, portador) => {
      return poner(piezas, equipo, piezaDe(piezas, id), portador);
    },
  };
}

/**
 * Un catálogo de equipo entero (`escritas`, todas las piezas, como se escriben en
 * `data/equipo.json`), comprobado con la regla del catálogo (`leerPiezas`: cada
 * pieza, sin repetir, resuelta con sus bases, y alguna de botín) y atado
 * (`equipoCon`); lanza con lo que no vale. Es el catálogo que edita la arena y con
 * el que pelea; el del juego es `EQUIPO_DEL_JUEGO`. **Se hace una vez por lista** y
 * viaja hecho a quien lo necesita (el montaje, el retoque, el cambio de una pieza).
 */
export function catalogoDeEquipo(escritas: readonly unknown[]): CatalogoDeEquipo {
  return atado(leerPiezas(escritas));
}

/**
 * El catálogo de equipo de un fichero (`{ piezas: [...] }`, `leerEquipo`), hecho:
 * lo que lee y escribe la arena en disco (`tools/arena/borrador.ts`), con una sola
 * validación.
 */
export function catalogoDelFichero(json: unknown, fichero?: string): CatalogoDeEquipo {
  return atado(leerEquipo(json, fichero));
}

/** Unas piezas ya leídas (`leerPiezas`), atadas (`equipoCon`) y con sus escritas. */
function atado(leido: {
  readonly escritas: readonly PiezaEscrita[];
  readonly piezas: readonly Pieza[];
}): CatalogoDeEquipo {
  return {
    ...equipoCon(new Map(leido.piezas.map((p) => [p.id, p]))),
    escritas: new Map(leido.escritas.map((p) => [p.id, p])),
  };
}

/** El catálogo del juego (`data/equipo.json` tal como se cargó), atado y con sus escritas. */
export const EQUIPO_DEL_JUEGO: CatalogoDeEquipo = atado({
  escritas: EQUIPO_ESCRITO,
  piezas: EQUIPO,
});

/** La pieza `id`. Lanza si no existe: un id inventado en un estado es un bug, no un vacío. */
export function pieza(id: string): Pieza {
  return piezaDe(PIEZAS_DEL_CATALOGO, id);
}

function piezaDe(piezas: CatalogoDePiezas, id: string): Pieza {
  const p = piezas.get(id);
  if (p === undefined) throw new Error(`pieza de equipo desconocida: "${id}"`);
  return p;
}

/**
 * Como `pieza`, pero `null` en vez de lanzar. La usan los que tienen que dar un
 * motivo escrito a un id que viene de fuera —el agente puede mandar cualquier
 * texto—, igual que `buildingIfExists`.
 */
export function piezaSiExiste(id: string): Pieza | null {
  return PIEZAS_DEL_CATALOGO.get(id) ?? null;
}

/** Lo que dice de un uso de arma `DICHO_DEL_USO`. */
interface DichoDeUnUso {
  readonly rotulo: string;
  readonly golpe: string;
  readonly cuando: string;
}

/**
 * Cada uso de un arma dicho para quien juega, en la forma en que se pinta: el
 * `rotulo` de su fila en «Armas» (la ficha y el panel de la pelea), el `golpe`
 * con que lo dice la previsión («con Daga (cuerpo a cuerpo)», también la del
 * contraataque), `cuando` se usa, la nota de su fila y la del hueco en el editor
 * de equipo. Toda arma puesta se usa: el cuerpo a cuerpo siempre, la de carga al
 * cargar (carga todo el que pega cuerpo a cuerpo) y la de distancia, que ya es
 * disparar. Las cifras de la carga salen de `data/carga.json`
 * (`CARGA`), no se escriben aquí. La regla la aplican `usoDelGolpe` y `armasDe`
 * (`battle/damage.ts`); esto la cuenta.
 */
export const DICHO_DEL_USO: Readonly<Record<UsoDeArma, DichoDeUnUso>> = {
  arma: {
    rotulo: 'Cuerpo a cuerpo',
    golpe: 'cuerpo a cuerpo',
    cuando:
      'Se usa al pegar cuerpo a cuerpo y al devolver un golpe; también al cargar, si no lleva arma de carga. Sin arma, pega con el cuerpo.',
  },
  distancia: {
    rotulo: 'A distancia',
    golpe: 'a distancia',
    cuando:
      'Se usa al disparar: llevarla ya es disparar, sin munición (dos tiros por disparo con Dos disparos).',
  },
  lanza: {
    rotulo: 'Carga',
    golpe: 'en la carga',
    cuando: `Se usa al cargar: el golpe tras correr en línea recta ${CARGA_MINIMA} casillas o más hacia el objetivo. Carga todo el que pega cuerpo a cuerpo, +${CARGA.aPie.porcentaje} % de daño por casilla hasta ${CARGA.aPie.tope}; con el rasgo Carga (el jinete), +${CARGA.jinete.porcentaje} % hasta ${CARGA.jinete.tope}.`,
  },
};

/** Con qué se da un golpe sin arma (`GolpeConArma.arma` a `null`), dicho para quien juega. */
export const SIN_ARMA = 'sin arma, con el cuerpo';

/**
 * Si la armería vende `p` (`Pieza.seConsigue`). **La regla de lo que se vende, en
 * un sitio**: la leen `buyBlocker`, para rechazar, y `PIEZAS_DE_ARMERIA`, para
 * enseñar. Escrita en los dos podían discrepar.
 */
export function seVende(p: Pieza): boolean {
  return p.seConsigue.includes('armeria');
}

/** Si `p` cae como botín (`Pieza.seConsigue`): la lee `PIEZAS_DE_BOTIN`. */
export function caeComoBotin(p: Pieza): boolean {
  return p.seConsigue.includes('botin');
}

/**
 * De dónde se consigue `p`, dicho para quien juega con la tabla del núcleo
 * (`DICHO_DE_DONDE`, `SOLO_EN_KITS`): «se vende en la armería», «cae como botín»,
 * las dos cosas o que solo la llevan las unidades que nacen con ella. Lo leen la
 * prosa del agente y el motivo de `buyBlocker`.
 */
export function deDondeSale(p: Pick<Pieza, 'seConsigue'>): string {
  if (p.seConsigue.length === 0) return SOLO_EN_KITS;
  return p.seConsigue.map((d) => DICHO_DE_DONDE[d]).join(' y ');
}

/** Lo que vende la armería, en el orden del catálogo (`seVende`). */
export const PIEZAS_DE_ARMERIA: readonly Pieza[] = EQUIPO.filter(seVende);

/**
 * Lo que puede caer como botín (`caeComoBotin`), en el orden del catálogo, que es
 * el del sorteo. Que haya alguna lo garantiza el cargador (`leerEquipo`).
 */
export const PIEZAS_DE_BOTIN: readonly Pieza[] = EQUIPO.filter(caeComoBotin);

/**
 * Por qué el equipo base del héroe (`data/heroe.json`) no vale con las piezas de
 * `eq`, o `null`: que cada pieza exista, vaya en su hueco y las manos casen
 * (`equipoBlocker`). La lee solo `leerCatalogos` (`core/unidad.ts`), lo que la
 * carga del juego, «Guardar» y el editor de equipo exigen a los catálogos juntos.
 */
export function equipoBaseBlocker(eq: EquipoAtado): string | null {
  const motivo = eq.equipoBlocker(HEROE.equipoBase);
  return motivo === null ? null : `el equipo base del héroe (data/heroe.json): ${motivo}`;
}

/**
 * El equipo con el que nace todo héroe (decisión del usuario, 18-10-2026: la
 * Espada y el gambesón), de `data/heroe.json`, donde se comprueba su forma; que
 * sus piezas valgan con el catálogo lo comprueba la carga de los catálogos
 * (`leerCatalogos`, desde `core/catalogo.ts`). Lo lleva también el héroe de la arena.
 */
export const EQUIPO_BASE: Equipo = Object.freeze({ ...HEROE.equipoBase });

/** Las piezas puestas, en el orden de los huecos. */
export function piezasPuestas(equipo: Equipo | undefined): Pieza[] {
  return puestasDe(PIEZAS_DEL_CATALOGO, equipo);
}

function puestasDe(piezas: CatalogoDePiezas, equipo: Equipo | undefined): Pieza[] {
  return idsPuestos(equipo).map((id) => piezaDe(piezas, id));
}

/** Lo que suman las piezas de un equipo, hueco a hueco. */
export interface SumaDeEquipo {
  /**
   * Ataque y daño, los del golpe de cuerpo a cuerpo: lo que no es arma y el arma.
   * Los de un arma por uso (`esArmaPorUso`) no están: son de su golpe
   * (`UnitInfo.armas`).
   */
  readonly ataque: number;
  readonly defensa: number;
  /** Los puntos de armadura (`Pieza.armadura`). Ninguna pieza da PV. */
  readonly armadura: number;
  readonly velocidad: number;
  readonly danio: readonly [number, number];
}

/**
 * Lo que suma `equipo`. **La única suma de las piezas**: la aplica `conEquipo` a
 * unas cifras y la lee el panel del héroe para enseñar «2 (+3)», en vez de volver
 * a sumar las piezas por su cuenta —que es como el panel enseñaba 2 / 2 a un
 * héroe que peleaba con 5 / 5—.
 */
export function sumaDeEquipo(equipo: Equipo | undefined): SumaDeEquipo {
  return sumaDe(PIEZAS_DEL_CATALOGO, equipo);
}

/**
 * La suma, **clasificada por la clave del hueco en `equipo`**, no por el hueco
 * que dice la pieza: con un equipo válido es lo mismo. El ataque y el daño de un
 * arma por uso (`esArmaPorUso`) no suman aquí, que son los de su golpe
 * (`armasPorUso`); lo demás de cualquier pieza —defensa, armadura, velocidad—,
 * siempre.
 */
function sumaDe(piezas: CatalogoDePiezas, equipo: Equipo | undefined): SumaDeEquipo {
  let ataque = 0;
  let defensa = 0;
  let armadura = 0;
  let velocidad = 0;
  let min = 0;
  let max = 0;
  for (const hueco of HUECOS) {
    const id = equipo?.[hueco];
    if (id === undefined) continue;
    const p = piezaDe(piezas, id);
    defensa += p.defensa;
    armadura += p.armadura ?? 0;
    velocidad += p.velocidad;
    if (esArmaPorUso(hueco)) continue;
    ataque += p.ataque;
    min += p.danio?.[0] ?? 0;
    max += p.danio?.[1] ?? 0;
  }
  return { ataque, defensa, armadura, velocidad, danio: [min, max] };
}

/**
 * Las cifras de `unit` con el equipo sumado (`sumaDeEquipo`). La llaman
 * `cifrasDelIndividuo` y `heroUnit`, y un test exige que las puertas de la tropa
 * den lo mismo.
 *
 * Sin piezas devuelve **la misma referencia**, no una copia. La velocidad sube
 * o baja escalones de `SPEED_TIERS` y se queda entre el primero y el último. El
 * daño suma `[+mín, +máx]`. Un arma en `distancia` hace tirador a quien la lleva
 * (`isShooter`, que mira `equipo`), sin munición que contar.
 *
 * Deja en `equipo` lo puesto: es de donde se deriva qué suma el equipo
 * (`modificadoresDePieza`). Las cifras sin él no se guardan (19-10-2026: fuera
 * `sinEquipo`): quien necesite el cuerpo desnudo lo saca de su origen.
 */
export function conEquipo<U extends UnitInfo>(unit: U, equipo: Equipo | undefined): U {
  return vestir(PIEZAS_DEL_CATALOGO, unit, equipo);
}

function vestir<U extends UnitInfo>(
  piezas: CatalogoDePiezas,
  unit: U,
  equipo: Equipo | undefined,
): U {
  if (idsPuestos(equipo).length === 0) return unit;
  // Lo que ya llevaba y lo de ahora, juntos: la misma pieza en un hueco dos veces
  // se sumaría dos veces y el registro diría una.
  const yaPuesto = HUECOS.find((h) => unit.equipo?.[h] !== undefined && equipo?.[h] !== undefined);
  if (yaPuesto !== undefined) {
    throw new Error(
      `${unit.name} ya lleva algo en ${NOMBRE_DE_HUECO[yaPuesto]}: no se suma otra pieza encima`,
    );
  }
  const todo: Equipo = { ...unit.equipo, ...equipo };
  const { ataque, defensa, armadura, velocidad, danio } = sumaDe(piezas, equipo);
  const puntosDeArmadura = (unit.puntosDeArmadura ?? 0) + armadura;
  const escalon = Math.max(
    0,
    Math.min(SPEED_TIERS.length - 1, SPEED_TIERS.indexOf(unit.speed) + velocidad),
  );
  // El daño, solo si alguna pieza lo suma: sin él el objeto sale con los mismos
  // campos que antes de que las piezas pudieran sumarlo (el banco).
  const vestida: U = {
    ...unit,
    attack: unit.attack + ataque,
    defense: unit.defense + defensa,
    ...(danio[1] > 0
      ? { damage: [unit.damage[0] + danio[0], unit.damage[1] + danio[1]] as const }
      : {}),
    // La armadura, solo si la hay: como el daño, sin piezas que la den la unidad
    // sale con los mismos campos.
    ...(puntosDeArmadura > 0 ? { puntosDeArmadura } : {}),
    speed: SPEED_TIERS[escalon] as UnitInfo['speed'],
    equipo: todo,
  };
  const armas = armasPorUso(piezas, vestida, todo);
  return armas === null ? vestida : { ...vestida, armas };
}

/**
 * Con qué arma y qué cifras da `vestida` cada golpe, si lleva un arma por uso
 * (`esArmaPorUso`) o un arma de cuerpo a cuerpo, que dice su rueda
 * (`Pieza.rueda`), o `null`. El de cuerpo a cuerpo es el de
 * arriba; el de cada arma por uso, el de arriba con esa arma en lugar de la de
 * cuerpo a cuerpo (su ataque y su daño no suben arriba, `sumaDe`). Cada golpe
 * lleva la rueda de su arma: así el motor no busca la pieza. El único escritor de
 * `UnitInfo.armas`.
 */
function armasPorUso(
  piezas: CatalogoDePiezas,
  vestida: UnitInfo,
  todo: Equipo,
): ArmasDeLaUnidad | null {
  const delCuerpo = todo.arma === undefined ? null : piezaDe(piezas, todo.arma);
  const porUso = HUECOS.filter(
    (h): h is HuecoDeArmaPorUso => esArmaPorUso(h) && todo[h] !== undefined,
  );
  // Sin arma ni arma por uso, sin `armas`: todo golpe va con las cifras de arriba.
  // Antes de reservar nada, que por aquí pasan cada individuo y cada héroe
  // (`cifrasDelIndividuo`, `heroUnit`).
  if (porUso.length === 0 && delCuerpo?.rueda === undefined) return null;
  const armas: { -readonly [U in keyof ArmasDeLaUnidad]: ArmasDeLaUnidad[U] } = {
    arma: conRuedaDe(
      { arma: armaDe(delCuerpo), attack: vestida.attack, damage: vestida.damage },
      delCuerpo,
    ),
  };
  for (const hueco of porUso) {
    const id = todo[hueco] as string;
    const p = piezaDe(piezas, id);
    armas[hueco] = conRuedaDe(
      {
        arma: armaDe(p),
        attack: vestida.attack - (delCuerpo?.ataque ?? 0) + p.ataque,
        damage: [
          vestida.damage[0] - (delCuerpo?.danio?.[0] ?? 0) + (p.danio?.[0] ?? 0),
          vestida.damage[1] - (delCuerpo?.danio?.[1] ?? 0) + (p.danio?.[1] ?? 0),
        ],
      },
      p,
    );
  }
  return armas;
}

/** El arma de un golpe (`GolpeConArma.arma`): la pieza por su id y su nombre, o `null`. */
function armaDe(p: Pieza | null): GolpeConArma['arma'] {
  return p === null ? null : { id: p.id, nombre: p.nombre };
}

/** El golpe `g` con la rueda de su arma `p`, solo si la lleva. */
function conRuedaDe(g: GolpeConArma, p: Pieza | null): GolpeConArma {
  return p?.rueda === undefined ? g : { ...g, rueda: p.rueda };
}

/**
 * Si `a` y `b` tienen las mismas cifras en todo lo que el equipo suma y la vida:
 * ataque, defensa, daño, PV, armadura y velocidad, y las de cada arma (`armas`). Junto a `conEquipo` porque es quien
 * sabe qué campos toca: si mañana suma otro, esta comparación tiene que verlo.
 * La lee el cambio de una pieza a media pelea de la arena (`retocarEnBatalla`):
 * solo cambia las cifras, y lo escribe en el parte, de quien de verdad cambia.
 */
export function mismasCifras(a: UnitInfo, b: UnitInfo): boolean {
  return (
    a.attack === b.attack &&
    a.defense === b.defense &&
    a.damage[0] === b.damage[0] &&
    a.damage[1] === b.damage[1] &&
    a.hp === b.hp &&
    (a.puntosDeArmadura ?? 0) === (b.puntosDeArmadura ?? 0) &&
    a.speed === b.speed &&
    mismasArmas(a.armas, b.armas)
  );
}

function mismasArmas(a: ArmasDeLaUnidad | undefined, b: ArmasDeLaUnidad | undefined): boolean {
  const golpe = (x: GolpeConArma | undefined, y: GolpeConArma | undefined): boolean =>
    x === undefined || y === undefined
      ? x === y
      : x.arma?.id === y.arma?.id &&
        x.arma?.nombre === y.arma?.nombre &&
        x.attack === y.attack &&
        x.damage[0] === y.damage[0] &&
        x.damage[1] === y.damage[1] &&
        // La rueda también, tipo a tipo: sin ella, el retoque de la rueda de la
        // Maza a media pelea no llegaba a quien la lleva.
        TIPOS_DEL_ANILLO.every((t) => x.rueda?.[t] === y.rueda?.[t]);
  if (a === undefined || b === undefined) return a === b;
  return golpe(a.arma, b.arma) && golpe(a.distancia, b.distancia) && golpe(a.lanza, b.lanza);
}

/**
 * La regla de las manos y del escudo dicha para quien juega: la leen la prosa del
 * agente y la ficha de la arena. Junto a `manosBlocker`, que es quien la aplica
 * (el escudo que no resta lo rechaza el cargador del catálogo, `leerEquipo`).
 */
export const REGLA_DEL_ESCUDO = 'un arma a dos manos no admite escudo, y el escudo resta velocidad';

/**
 * Si `p` es un arma a dos manos. Junto a `manosBlocker`, que aplica la regla: es
 * la lectura de `manos` para quien solo la enseña o la escribe (la vista y el
 * enlace de la arena), sin una segunda comparación con el número.
 */
export function aDosManos(p: Pick<Pieza, 'manos'>): boolean {
  return p.manos === 2;
}

/**
 * Por qué no se puede poner la pieza `id` sobre `equipo`, o `null` si sí: **un
 * arma a dos manos no admite escudo** (decisión del usuario, 12-10-2026). Las dos
 * direcciones: un escudo sobre un mandoble y un mandoble sobre un escudo. La pieza
 * que ocupa el hueco de `id` no cuenta, porque se quita al ponerla. **La única
 * lectura de `manos`**: la leen `equipBlocker` (el juego y el agente), la arena
 * y `equipoBlocker`, y `ponerPieza` lanza con ella como última puerta.
 */
export function manosBlocker(equipo: Equipo | undefined, id: string): string | null {
  return manosDe(PIEZAS_DEL_CATALOGO, equipo, id);
}

function manosDe(piezas: CatalogoDePiezas, equipo: Equipo | undefined, id: string): string | null {
  const p = piezaDe(piezas, id);
  const resto = { ...equipo, [p.hueco]: undefined };
  const arma = resto.arma === undefined ? null : piezaDe(piezas, resto.arma);
  const escudo = resto.escudo === undefined ? null : piezaDe(piezas, resto.escudo);
  if (p.hueco === 'escudo' && arma !== null && aDosManos(arma)) {
    return `${p.nombre} no se puede llevar con ${arma.nombre}: es un arma a dos manos y no deja mano para el escudo`;
  }
  if (aDosManos(p) && escudo !== null) {
    return `${p.nombre} es un arma a dos manos y no se puede llevar con ${escudo.nombre}: quita antes el escudo`;
  }
  return null;
}

/**
 * Por qué un equipo entero no vale, o `null`: que cada pieza exista, que vaya en
 * su hueco y que las manos cuadren (`manosBlocker`). Lo leen la arena al validar
 * una unidad (un equipo escrito a mano en el catálogo no pasa por `ponerPieza`) y
 * el equipo base del héroe (`equipoBaseBlocker`).
 */
export function equipoBlocker(equipo: Equipo): string | null {
  return equipoBlockerDe(PIEZAS_DEL_CATALOGO, equipo);
}

function equipoBlockerDe(piezas: CatalogoDePiezas, equipo: Equipo): string | null {
  for (const [hueco, id] of Object.entries(equipo)) {
    if (!esHueco(hueco)) return huecoDesconocido(hueco, HUECOS);
    if (id === undefined) continue;
    const p = piezas.get(id) ?? null;
    if (p === null) return `no existe ninguna pieza "${id}"`;
    if (p.hueco !== hueco) {
      return `${p.nombre} va en ${NOMBRE_DE_HUECO[p.hueco]}, no en ${NOMBRE_DE_HUECO[hueco]}`;
    }
  }
  if (equipo.arma !== undefined) return manosDe(piezas, equipo, equipo.arma);
  return null;
}

/**
 * El equipo con `id` puesto en su hueco, y lo que ocupaba ese hueco (o `null`).
 * Lanza si las manos no cuadran (`manosBlocker`), diciendo a quién si se da
 * `portador`. El juego ya lo preguntó (`equipBlocker`) y aquí está la última
 * puerta; la arena no pregunta antes: esta es su pregunta.
 */
export function ponerPieza(
  equipo: Equipo | undefined,
  id: string,
  portador?: string,
): { readonly equipo: Equipo; readonly quitada: string | null } {
  return poner(PIEZAS_DEL_CATALOGO, equipo, pieza(id), portador);
}

function poner(
  piezas: CatalogoDePiezas,
  equipo: Equipo | undefined,
  p: Pieza,
  portador?: string,
): { readonly equipo: Equipo; readonly quitada: string | null } {
  const motivo = manosDe(piezas, equipo, p.id);
  if (motivo !== null) {
    const a = portador === undefined ? '' : ` a ${portador}`;
    throw new Error(`no se puede poner ${p.nombre}${a}: ${motivo}`);
  }
  const quitada = equipo?.[p.hueco] ?? null;
  return { equipo: { ...equipo, [p.hueco]: p.id }, quitada };
}

/** El equipo sin lo que hubiera en `hueco`, y lo que había (o `null`). */
export function quitarPieza(
  equipo: Equipo | undefined,
  hueco: Hueco,
): { readonly equipo: Equipo; readonly quitada: string | null } {
  const quitada = equipo?.[hueco] ?? null;
  const { [hueco]: _fuera, ...resto } = equipo ?? {};
  return { equipo: resto, quitada };
}

/**
 * Lo que se dice al quitar de un hueco vacío, con el hueco por su nombre
 * (`NOMBRE_DE_HUECO`), no por su clave: «Aldo no lleva nada en Escudo» y no «en
 * el hueco escudo», que al agente, que lo pidió como `shield`, no le decía nada.
 * La leen `unequipBlocker` y la arena (`quitarEnArena`).
 */
export function nadaEnElHueco(quien: string, hueco: Hueco): string {
  return `${quien} no lleva nada en ${NOMBRE_DE_HUECO[hueco]}`;
}

/**
 * Los ids de lo que lleva puesto, en el orden de los huecos: lo que vuelve a una
 * mochila, y quién lleva una pieza. Sin catálogo: solo lee los huecos.
 */
export function idsPuestos(equipo: Equipo | undefined): string[] {
  return HUECOS.flatMap((h) => equipo?.[h] ?? []);
}

/** La mochila sin UNA copia de `id` (la primera). Lanza si no está. */
export function sacarDeLaMochila(mochila: readonly string[], id: string): string[] {
  const i = mochila.indexOf(id);
  if (i < 0) throw new Error(`la mochila no lleva "${id}"`);
  return [...mochila.slice(0, i), ...mochila.slice(i + 1)];
}

/**
 * Una cosa que suma una pieza: una cifra con su valor (el daño, con su máximo en
 * `hasta`) o una marca que no es cifra (`dosManos`: no admite escudo).
 */
export type ModificadorDePieza =
  | {
      readonly kind: 'cifra';
      readonly cifra: CifraDePieza;
      readonly valor: number;
      readonly hasta?: number;
    }
  | { readonly kind: 'marca'; readonly marca: 'dosManos' };

/**
 * Lo que suma una pieza, como lista: las cifras distintas de cero en el orden de
 * `CIFRAS_DE_PIEZA` y, detrás, sus marcas. **La única lectura** de qué se enseña
 * de una pieza: la pintan igual la ficha de la arena, el editor de equipo, los
 * paneles del juego y la prosa del agente (`textoDeModificador`).
 */
export function modificadoresDePieza(p: Pieza): ModificadorDePieza[] {
  const valor: Readonly<Record<CifraDePieza, number>> = {
    ataque: p.ataque,
    defensa: p.defensa,
    armadura: p.armadura ?? 0,
    danio: p.danio?.[1] ?? 0,
    velocidad: p.velocidad,
  };
  const cifras: ModificadorDePieza[] = CIFRAS_DE_PIEZA.flatMap((cifra) => {
    if (valor[cifra] === 0) return [];
    if (cifra === 'danio' && p.danio !== undefined) {
      return [{ kind: 'cifra' as const, cifra, valor: p.danio[0], hasta: p.danio[1] }];
    }
    return [{ kind: 'cifra' as const, cifra, valor: valor[cifra] }];
  });
  return aDosManos(p) ? [...cifras, { kind: 'marca', marca: 'dosManos' }] : cifras;
}

/** Un número con su signo siempre: «+2», «−1» (el menos tipográfico), «+0». */
export function conSigno(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/**
 * Un modificador en texto: «+2 Ataque», «−1 Velocidad», «+30–60 Daño», «a dos
 * manos». **El único sitio que formatea** lo que suma una pieza: el marcado lo
 * envuelve, un `<option>` y el agente lo leen tal cual.
 */
export function textoDeModificador(m: ModificadorDePieza): string {
  if (m.kind === 'marca') return 'a dos manos';
  const cuanto =
    m.hasta === undefined || m.hasta === m.valor
      ? conSigno(m.valor)
      : `${conSigno(m.valor)}–${m.hasta}`;
  return `${cuanto} ${NOMBRE_DE_CIFRA[m.cifra]}`;
}

/**
 * Lo que suma una pieza, en texto plano: los modificadores separados por comas
 * («+5 Ataque, +30–60 Daño, a dos manos»), o vacío si no suma nada. Para donde no
 * cabe marcado (un `<option>`, la prosa del agente).
 */
export function cifrasDePieza(p: Pieza): string {
  return modificadoresDePieza(p).map(textoDeModificador).join(', ');
}

// ---------------------------------------------------------------- a quién

/** A quién de un héroe se le pone o se le quita una pieza: a él, o a un individuo de su tropa. */
export type Portador = { readonly heroe: true } | { readonly indice: number };

/** Cómo se nombra a quién: nada es el héroe; `veteran`, un id de hoja; `creature`, un novato de ese tipo. */
export interface DestinoPedido {
  readonly veteran?: string | undefined;
  readonly creature?: string | undefined;
}

/**
 * A quién de `hero` va la pieza que se pide así, o por qué no hay nadie. **La
 * única lectura de `veteran` y `creature`**: la leen las acciones `equip` y
 * `unequip`, sus dos *blockers*, la IA —que comprueba que lo que pide le llega a
 * quien ella eligió— y el panel. Antes eran cuatro `findIndex` repartidos.
 *
 * Sin `veteran` ni `creature`, el héroe. Con `veteran`, el individuo de su tropa
 * con esa hoja. Con `creature`, **el primer novato sin hoja de ese tipo**: un
 * novato sin hoja es fungible —cuál de tres piqueros recibe la espada no
 * importa— y uno con hoja ya tiene nombre (su id) y se nombra con `veteran`. Un
 * personaje no entra por `creature`: es uno y tiene nombre.
 */
export function destinoDeEquipo(
  hero: Pick<Hero, 'name' | 'army'>,
  pedido: DestinoPedido,
): Portador | { readonly motivo: string } {
  const { veteran, creature: especieId } = pedido;
  if (veteran !== undefined && especieId !== undefined) {
    return { motivo: 'di a quién se la pones con "veteran" o con "creature", no con los dos' };
  }
  if (veteran !== undefined) {
    const indice = hero.army.findIndex((t) => t.veterania?.id === veteran);
    if (indice < 0) {
      return { motivo: `${hero.name} no lleva a nadie con el id "${veteran}" en su tropa` };
    }
    return { indice };
  }
  if (especieId !== undefined) {
    // Sin el catálogo de unidades: lo importa a este módulo, y desde aquí sería un
    // ciclo que se cuelga al cargar. La unidad se nombra por su id, que es lo que
    // escribió quien pregunta.
    const indice = hero.army.findIndex(
      (t) => t.creature === especieId && t.member === undefined && t.veterania === undefined,
    );
    if (indice < 0) {
      // La pista de «veteran» solo si hay a quién nombrar con ella: sin ninguno
      // de ese tipo, sugerir un id es mandar a buscar a alguien que no está.
      const conId = hero.army.some((t) => t.creature === especieId && t.veterania !== undefined);
      return {
        motivo: conId
          ? `${hero.name} no lleva ninguna unidad «${especieId}» sin id: a uno que ya lo tiene —el que va en su propia fila— se le nombra con "veteran"`
          : `${hero.name} no lleva ninguna unidad «${especieId}» en su tropa`,
      };
    }
    return { indice };
  }
  return { heroe: true };
}

/** Lo que lleva puesto el portador `quien` de `hero`. */
export function equipoDe(hero: Pick<Hero, 'equipo' | 'army'>, quien: Portador): Equipo {
  if ('heroe' in quien) return hero.equipo;
  return individuo(hero, quien).veterania?.equipo ?? {};
}

/**
 * Los campos de `hero` con `equipo` puesto en el portador `quien`, sin tocar el
 * héroe: quien llama los escribe (`vestir`, en `game.ts`), porque el estado guarda la
 * referencia del héroe. El equipo de un individuo vive en su hoja, así que a un
 * novato sin ella **se le abre** con `abrirHoja` —la da el estado, que lleva el
 * contador de ids—: deja de ser fungible al llevar algo.
 */
export function conEquipoDe(
  hero: Pick<Hero, 'equipo' | 'army'>,
  quien: Portador,
  equipo: Equipo,
  abrirHoja?: () => Veterania,
): Pick<Hero, 'equipo' | 'army'> {
  if ('heroe' in quien) return { equipo, army: hero.army };
  const t = individuo(hero, quien);
  let hoja = t.veterania;
  if (hoja === undefined) {
    if (abrirHoja === undefined) {
      throw new Error(
        `el ${t.creature} ${quien.indice} de la tropa no tiene hoja y nadie ha dicho cómo abrírsela`,
      );
    }
    hoja = abrirHoja();
  }
  const army = [...hero.army];
  army[quien.indice] = { ...t, veterania: { ...hoja, equipo } };
  return { equipo: hero.equipo, army };
}

function individuo(hero: Pick<Hero, 'army'>, quien: { readonly indice: number }): Troop {
  const t = hero.army[quien.indice];
  if (t === undefined) {
    throw new Error(`la tropa no tiene a nadie en el puesto ${quien.indice}`);
  }
  return t;
}
