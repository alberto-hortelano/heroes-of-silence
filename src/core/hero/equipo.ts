/**
 * El equipo: cuatro huecos por individuo y por héroe —arma, armadura, accesorio
 * y escudo— con una pieza de `data/equipo.json` en cada uno, o nada.
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
import { allCreatures, CALIDADES_DE_BOTIN, EQUIPO, type Pieza } from '../data.js';
import { ESCALA_DE_CIFRAS } from '../escala.js';
import type { Equipo, Hueco, Troop, UnitInfo, Veterania } from '../types.js';
import { esHueco, HUECOS, huecoDesconocido, SPEED_TIERS } from '../types.js';
import type { Hero } from './hero.js';

/** Las piezas que se pueden llevar, por su id. */
export type CatalogoDePiezas = ReadonlyMap<string, Pieza>;

/** El catálogo del juego: `data/equipo.json` por id. El único que ve el juego. */
export const PIEZAS_DEL_CATALOGO: CatalogoDePiezas = new Map(EQUIPO.map((p) => [p.id, p]));

/**
 * Las lecturas de las piezas atadas a UN catálogo (`equipoCon`). El juego usa las
 * sueltas de este módulo, que leen siempre el suyo (`PIEZAS_DEL_CATALOGO`); la
 * arena pelea con el del juego con su borrador encima (`catalogoDeLaArena`) y
 * solo entra por aquí: así no hay lectura que se olvide de su catálogo y
 * resuelva en silencio con la pieza del juego. Que la arena no importe las
 * sueltas lo vigila `test/invariantes.test.ts`.
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
    ponerPieza: (equipo, id, portador) => poner(piezas, equipo, id, portador),
  };
}

/** Las lecturas atadas al catálogo del juego: lo que leen las sueltas, para quien pide un `EquipoAtado`. */
export const EQUIPO_DEL_JUEGO: EquipoAtado = equipoCon(PIEZAS_DEL_CATALOGO);

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

/** El nombre de cada calidad, para pintarlo. */
export const NOMBRE_DE_CALIDAD: Readonly<Record<Pieza['calidad'], string>> = {
  comun: 'común',
  armeria: 'de armería',
  especial: 'especial',
  arena: 'de la arena',
};

/**
 * El nombre de cada hueco, para pintarlo: lo leen el panel del héroe y la ficha
 * de la arena. Aquí y no en el cliente porque son dos pantallas y un mismo hueco.
 */
export const NOMBRE_DE_HUECO: Readonly<Record<Hueco, string>> = {
  arma: 'Arma',
  armadura: 'Armadura',
  accesorio: 'Accesorio',
  escudo: 'Escudo',
};

/**
 * Si la armería vende `p`: solo lo de calidad de armería. **La regla de lo que se
 * vende, en un sitio**: la leen `buyBlocker`, para rechazar, y `PIEZAS_DE_ARMERIA`,
 * para enseñar y para el equipo base. Escrita en los dos podían discrepar.
 */
export function seVende(p: Pieza): boolean {
  return p.calidad === 'armeria';
}

/**
 * Lo que vende la armería: una pieza por hueco, en el orden del catálogo. Se
 * deriva de la calidad (`seVende`) y no se escribe en ningún sitio.
 */
export const PIEZAS_DE_ARMERIA: readonly Pieza[] = EQUIPO.filter(seVende);

/**
 * Lo que puede caer como botín: las piezas de `CALIDADES_DE_BOTIN`, en el orden
 * del catálogo, que es el del sorteo: lo de la arena no está, y el sorteo de cada
 * semilla ve la misma lista que antes de que lo hubiera.
 */
export const PIEZAS_DE_BOTIN: readonly Pieza[] = EQUIPO.filter((p) =>
  CALIDADES_DE_BOTIN.includes(p.calidad),
);

/**
 * Lo que el juego conoce: todo menos lo de la arena. Es lo que se le describe al
 * agente (`CATALOGO_DE_EQUIPO_EN_PROSA`): una pieza que no puede caerle ni
 * comprar no es parte de su juego.
 */
export const PIEZAS_DEL_JUEGO: readonly Pieza[] = EQUIPO.filter((p) => p.calidad !== 'arena');

/**
 * El equipo con el que nace todo héroe: la pieza de armería de cada hueco
 * (decisión del usuario, 02-10-2026: «los héroes ya lo llevan» es el equipo de
 * mejor calidad que se compra en la armería). **Derivado de la calidad de las
 * piezas**: escrito aquí al lado sería una segunda lista que se quedaría atrás el
 * día que cambie la espada. Que haya exactamente una por hueco —ni un hueco
 * vacío ni dos candidatas— lo garantiza `validarEquipo` al cargar, y por eso
 * aquí no se vuelve a comprobar.
 */
export const EQUIPO_BASE: Equipo = Object.freeze(
  Object.fromEntries(PIEZAS_DE_ARMERIA.map((p) => [p.hueco, p.id])),
);

/** Las piezas puestas, en el orden de los huecos. */
export function piezasPuestas(equipo: Equipo | undefined): Pieza[] {
  return puestasDe(PIEZAS_DEL_CATALOGO, equipo);
}

function puestasDe(piezas: CatalogoDePiezas, equipo: Equipo | undefined): Pieza[] {
  return idsPuestos(equipo).map((id) => piezaDe(piezas, id));
}

/** Lo que suman las piezas de un equipo, hueco a hueco. */
export interface SumaDeEquipo {
  readonly ataque: number;
  readonly defensa: number;
  readonly pv: number;
  readonly velocidad: number;
  readonly danio: readonly [number, number];
  readonly disparos: number;
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

function sumaDe(piezas: CatalogoDePiezas, equipo: Equipo | undefined): SumaDeEquipo {
  let ataque = 0;
  let defensa = 0;
  let pv = 0;
  let velocidad = 0;
  let min = 0;
  let max = 0;
  let disparos = 0;
  for (const p of puestasDe(piezas, equipo)) {
    ataque += p.ataque;
    defensa += p.defensa;
    pv += p.pv;
    velocidad += p.velocidad;
    min += p.danio?.[0] ?? 0;
    max += p.danio?.[1] ?? 0;
    disparos += p.disparos ?? 0;
  }
  return { ataque, defensa, pv, velocidad, danio: [min, max], disparos };
}

/**
 * Las cifras de `unit` con el equipo sumado (`sumaDeEquipo`). La llaman
 * `cifrasDelIndividuo` y `heroUnit`, y un test exige que las puertas de la tropa
 * den lo mismo.
 *
 * Sin piezas devuelve **la misma referencia**, no una copia: un novato sigue
 * pisando el tablero con la `Creature` del catálogo, que es lo que deja al
 * espectador rehacer sus cifras y al banco quedarse igual para quien no lleva
 * nada. La velocidad sube o baja escalones de `SPEED_TIERS` y se queda entre el
 * primero y el último. El daño suma `[+mín, +máx]` y los disparos se suman a los
 * que tenga; `shots` solo aparece si da más de 0 (un arco hace tirador a quien no
 * lo era), para que lo cuerpo a cuerpo siga sin el campo.
 *
 * Con piezas, deja en `sinEquipo` las cifras de antes de ponérselas —las del
 * cuerpo, si `unit` ya llevaba equipo—: el nivel se mide sin equipo
 * (`nivelDeUnidad`) y este es el único sitio que sabe qué suma la pieza. Es el
 * **único escritor** de `sinEquipo` (`test/invariantes.test.ts`). Por eso el
 * equipo va siempre lo último, después de la veteranía o el rango: lo que se
 * sume después de `conEquipo` no llegaría a `sinEquipo`, y el nivel no lo vería.
 * Y deja en `equipo` lo puesto: cambiar una pieza a media pelea (la arena) lo
 * vuelve a sumar a `sinEquipo` desde el propio stack.
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
  const { ataque, defensa, pv, velocidad, danio, disparos } = sumaDe(piezas, equipo);
  // Lo que ya llevaba y lo de ahora, juntos: la misma pieza en un hueco dos veces
  // se sumaría dos veces y el registro diría una.
  const yaPuesto = HUECOS.find((h) => unit.equipo?.[h] !== undefined && equipo?.[h] !== undefined);
  if (yaPuesto !== undefined) {
    throw new Error(
      `${unit.name} ya lleva algo en ${NOMBRE_DE_HUECO[yaPuesto]}: no se suma otra pieza encima`,
    );
  }
  const escalon = Math.max(
    0,
    Math.min(SPEED_TIERS.length - 1, SPEED_TIERS.indexOf(unit.speed) + velocidad),
  );
  // Daño y disparos, solo si alguna pieza los suma: sin ellos el objeto sale con
  // los mismos campos que antes de que las piezas pudieran sumarlos (el banco).
  return {
    ...unit,
    attack: unit.attack + ataque,
    defense: unit.defense + defensa,
    ...(danio[1] > 0
      ? { damage: [unit.damage[0] + danio[0], unit.damage[1] + danio[1]] as const }
      : {}),
    hp: unit.hp + pv,
    speed: SPEED_TIERS[escalon] as UnitInfo['speed'],
    ...(disparos > 0 ? { shots: (unit.shots ?? 0) + disparos } : {}),
    sinEquipo: unit.sinEquipo ?? unit,
    equipo: { ...unit.equipo, ...equipo },
  };
}

/**
 * Si `a` y `b` tienen las mismas cifras en todo lo que el equipo suma: ataque,
 * defensa, daño, PV, velocidad y disparos. Junto a `conEquipo` porque es quien
 * sabe qué campos toca: si mañana suma otro, esta comparación tiene que verlo.
 * La lee la conversión de la arena (`migrarUnidadDeArena`) para comprobar al
 * revés que un cuerpo con su equipo pelea como las cifras de antes.
 */
export function mismasCifras(a: UnitInfo, b: UnitInfo): boolean {
  return (
    a.attack === b.attack &&
    a.defense === b.defense &&
    a.damage[0] === b.damage[0] &&
    a.damage[1] === b.damage[1] &&
    a.hp === b.hp &&
    a.speed === b.speed &&
    (a.shots ?? 0) === (b.shots ?? 0)
  );
}

/**
 * Lo que vale una pieza para la IA: la suma de sus cifras, con la velocidad a
 * tres porque un escalón pesa más que un punto. **Heurística de la IA e
 * inventada**, no una regla del juego: la persona y el agente eligen ellos.
 *
 * En PV: un punto de ataque o de defensa pesa como `ESCALA_DE_CIFRAS` PV, lo que
 * pesaba un PV en la escala de fheroes2. Sin redondear: lo que no es múltiplo de
 * la escala también cuenta.
 */
export function valorDePieza(p: Pieza): number {
  return ESCALA_DE_CIFRAS * (p.ataque + p.defensa + 3 * p.velocidad) + p.pv;
}

/**
 * La regla de las manos y del escudo dicha para quien juega: la leen la prosa del
 * agente y la ficha de la arena. Junto a `manosBlocker`, que es quien la aplica
 * (el escudo que no resta lo rechaza el cargador del catálogo, `validarEquipo`).
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
 * su hueco y que las manos cuadren (`manosBlocker`). Lo lee la arena al validar
 * una unidad: un equipo escrito a mano en el borrador no pasa por `ponerPieza`.
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
  return poner(PIEZAS_DEL_CATALOGO, equipo, id, portador);
}

function poner(
  piezas: CatalogoDePiezas,
  equipo: Equipo | undefined,
  id: string,
  portador?: string,
): { readonly equipo: Equipo; readonly quitada: string | null } {
  const p = piezaDe(piezas, id);
  const motivo = manosDe(piezas, equipo, id);
  if (motivo !== null) {
    const a = portador === undefined ? '' : ` a ${portador}`;
    throw new Error(`no se puede poner ${p.nombre}${a}: ${motivo}`);
  }
  const quitada = equipo?.[p.hueco] ?? null;
  return { equipo: { ...equipo, [p.hueco]: id }, quitada };
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

/** Las cifras que una pieza puede sumar, en el orden en que se dicen. */
export const CIFRAS_DE_PIEZA = [
  'ataque',
  'defensa',
  'danio',
  'pv',
  'disparos',
  'velocidad',
] as const;
export type CifraDePieza = (typeof CIFRAS_DE_PIEZA)[number];

/**
 * El nombre de cada cifra, el mismo en la tabla de la ficha de la arena (sus
 * rótulos) y en lo que suma una pieza: «+2 Ataque» en la pieza y «Ataque» en la
 * fila a la que suma (13-10-2026, el usuario: «estandariza la forma de mostrar
 * los modificadores del equipo, que no sea un texto libre»).
 */
export const NOMBRE_DE_CIFRA: Readonly<Record<CifraDePieza, string>> = {
  ataque: 'Ataque',
  defensa: 'Defensa',
  danio: 'Daño',
  pv: 'PV',
  disparos: 'Disparos',
  velocidad: 'Velocidad',
};

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
    danio: p.danio?.[1] ?? 0,
    pv: p.pv,
    disparos: p.disparos ?? 0,
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
    const especie = allCreatures().find((c) => c.id === especieId);
    if (especie === undefined) return { motivo: `no existe ninguna criatura "${especieId}"` };
    const indice = hero.army.findIndex(
      (t) => t.creature === especie.id && t.member === undefined && t.veterania === undefined,
    );
    if (indice < 0) {
      // La pista de «veteran» solo si hay a quién nombrar con ella: sin ninguno
      // de ese tipo, sugerir un id es mandar a buscar a alguien que no está.
      const conId = hero.army.some((t) => t.creature === especie.id && t.veterania !== undefined);
      return {
        motivo: conId
          ? `${hero.name} no lleva ninguna unidad de ${especie.name} sin id: a uno que ya lo tiene —el que va en su propia fila— se le nombra con "veteran"`
          : `${hero.name} no lleva ninguna unidad de ${especie.name} en su tropa`,
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
