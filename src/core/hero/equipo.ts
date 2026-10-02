/**
 * El equipo: tres huecos por individuo y por héroe —arma, armadura y accesorio—
 * con una pieza de `data/equipo.json` en cada uno, o nada.
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
import { allCreatures, EQUIPO, type Pieza } from '../data.js';
import type { Equipo, Hueco, Troop, UnitInfo, Veterania } from '../types.js';
import { HUECOS, SPEED_TIERS } from '../types.js';
import type { Hero } from './hero.js';

const porId = new Map(EQUIPO.map((p) => [p.id, p]));

/** La pieza `id`. Lanza si no existe: un id inventado en un estado es un bug, no un vacío. */
export function pieza(id: string): Pieza {
  const p = porId.get(id);
  if (p === undefined) throw new Error(`pieza de equipo desconocida: "${id}"`);
  return p;
}

/**
 * Como `pieza`, pero `null` en vez de lanzar. La usan los que tienen que dar un
 * motivo escrito a un id que viene de fuera —el agente puede mandar cualquier
 * texto—, igual que `buildingIfExists`.
 */
export function piezaSiExiste(id: string): Pieza | null {
  return porId.get(id) ?? null;
}

/** El nombre de cada calidad, para pintarlo. */
export const NOMBRE_DE_CALIDAD: Readonly<Record<Pieza['calidad'], string>> = {
  comun: 'común',
  armeria: 'de armería',
  especial: 'especial',
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
 * Lo que puede caer como botín: todo lo que no se vende —lo común y lo
 * especial—, en el orden del catálogo, que es el del sorteo.
 */
export const PIEZAS_DE_BOTIN: readonly Pieza[] = EQUIPO.filter((p) => !seVende(p));

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
  if (equipo === undefined) return [];
  const out: Pieza[] = [];
  for (const hueco of HUECOS) {
    const id = equipo[hueco];
    if (id !== undefined) out.push(pieza(id));
  }
  return out;
}

/** Lo que suman las piezas de un equipo, hueco a hueco. */
export interface SumaDeEquipo {
  readonly ataque: number;
  readonly defensa: number;
  readonly pv: number;
  readonly velocidad: number;
}

/**
 * Lo que suma `equipo`. **La única suma de las piezas**: la aplica `conEquipo` a
 * unas cifras y la lee el panel del héroe para enseñar «2 (+3)», en vez de volver
 * a sumar las piezas por su cuenta —que es como el panel enseñaba 2 / 2 a un
 * héroe que peleaba con 5 / 5—.
 */
export function sumaDeEquipo(equipo: Equipo | undefined): SumaDeEquipo {
  let ataque = 0;
  let defensa = 0;
  let pv = 0;
  let velocidad = 0;
  for (const p of piezasPuestas(equipo)) {
    ataque += p.ataque;
    defensa += p.defensa;
    pv += p.pv;
    velocidad += p.velocidad;
  }
  return { ataque, defensa, pv, velocidad };
}

/**
 * Las cifras de `unit` con el equipo sumado (`sumaDeEquipo`). La llaman
 * `cifrasDelIndividuo` y `heroUnit`, y un test exige que las puertas de la tropa
 * den lo mismo.
 *
 * Sin piezas devuelve **la misma referencia**, no una copia: un novato sigue
 * pisando el tablero con la `Creature` del catálogo, que es lo que deja al
 * espectador rehacer sus cifras y al banco quedarse igual para quien no lleva
 * nada. La velocidad sube escalones de `SPEED_TIERS` y se queda en el último.
 */
export function conEquipo<U extends UnitInfo>(unit: U, equipo: Equipo | undefined): U {
  if (piezasPuestas(equipo).length === 0) return unit;
  const { ataque, defensa, pv, velocidad } = sumaDeEquipo(equipo);
  const escalon = Math.min(SPEED_TIERS.length - 1, SPEED_TIERS.indexOf(unit.speed) + velocidad);
  return {
    ...unit,
    attack: unit.attack + ataque,
    defense: unit.defense + defensa,
    hp: unit.hp + pv,
    speed: SPEED_TIERS[escalon] as UnitInfo['speed'],
  };
}

/**
 * Lo que vale una pieza para la IA: la suma de sus cifras, con la velocidad a
 * tres porque un escalón pesa más que un punto. **Heurística de la IA e
 * inventada**, no una regla del juego: la persona y el agente eligen ellos.
 */
export function valorDePieza(p: Pieza): number {
  return p.ataque + p.defensa + p.pv + 3 * p.velocidad;
}

/** El equipo con `id` puesto en su hueco, y lo que ocupaba ese hueco (o `null`). */
export function ponerPieza(
  equipo: Equipo | undefined,
  id: string,
): { readonly equipo: Equipo; readonly quitada: string | null } {
  const p = pieza(id);
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

/** Los ids de lo que lleva puesto, en el orden de los huecos: lo que vuelve a una mochila. */
export function idsPuestos(equipo: Equipo | undefined): string[] {
  return piezasPuestas(equipo).map((p) => p.id);
}

/** La mochila sin UNA copia de `id` (la primera). Lanza si no está. */
export function sacarDeLaMochila(mochila: readonly string[], id: string): string[] {
  const i = mochila.indexOf(id);
  if (i < 0) throw new Error(`la mochila no lleva "${id}"`);
  return [...mochila.slice(0, i), ...mochila.slice(i + 1)];
}

/** Lo que suma una pieza, en palabras: «+2 ataque, +1 PV». Lo leen el panel y la prosa del agente. */
export function cifrasDePieza(p: Pieza): string {
  return [
    p.ataque > 0 ? `+${p.ataque} ataque` : null,
    p.defensa > 0 ? `+${p.defensa} defensa` : null,
    p.pv > 0 ? `+${p.pv} PV` : null,
    p.velocidad > 0 ? `+${p.velocidad} velocidad` : null,
  ]
    .filter((c) => c !== null)
    .join(', ');
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
