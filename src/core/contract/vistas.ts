/**
 * Lo que ve el agente de las cosas: un ejército, su equipo, quién ocupa un sitio,
 * la ficha de una unidad (`creature_stats`) y la lista de hechizos (`spell_list`),
 * y el catálogo de equipo en prosa. Lo comparten las peticiones y las consultas.
 *
 * Se manda un resumen, no el estado entero: lo justo para decidir, con ids
 * estables para que pueda pedir detalles con las tools de consulta. Volcar el
 * mundo completo en cada turno llenaría su contexto de ruido.
 *
 * Era parte de `serialize.ts`, que se partió en la fase N de la reorganización
 * (07-11-2026) en `vistas.ts`, `mapa-conocido.ts`, `aventura.ts`, `batalla.ts` y
 * `peticion-de-mapa.ts`.
 */
import { armaduraDe, cargasDe, golpeDe, recargaDe } from '../battle/armas.js';
import { alcanceDeLaGranada } from '../battle/granada.js';
import { cifrasDePieza } from '../equipo/dicho.js';
import { deDondeSale, EQUIPO, seVende } from '../equipo/pieza.js';
import { troopSummary } from '../hero/troop.js';
import { todosLosHechizos } from '../magia/catalogo.js';
import { queHaceElHechizo } from '../magia/dicho.js';
import type { Hechizo } from '../magia/formato.js';
import type { Ocupante } from '../state/events.js';
import { type Army, describirCoste, type Equipo, HUECOS } from '../types.js';
import type { UnidadDelJuego } from '../unidad/catalogo.js';
import { marchaDe } from '../unidad/cuerpo.js';
import { indiceDePoder, nivelDeUnidad } from '../unidad/nivel.js';
import { SLOT_DE_HUECO, type Slot } from './vocabulario.js';

/**
 * El ejército tal como lo lee el agente: agrupado por criatura, con cuántos
 * individuos lleva de cada una. Agrupa `troopSummary`, que es el único sitio
 * que lo hace.
 *
 * Ya no lleva `slot`: con la tropa de individuos no hay huecos que numerar.
 * Un veterano va en su fila con `rank`, su `level` (el de sus cifras con su
 * equipo, `nivelDeUnidad`), `experience` y `nextRankAt` (la experiencia a la que sube de
 * rango; `null` en el tope).
 */
export function armyView(army: Army): {
  creature: string;
  count: number;
  speed: string;
  rank?: number;
  level?: number;
  experience?: number;
  nextRankAt?: number | null;
  id?: string;
  equipment?: Record<string, string | null>;
}[] {
  return troopSummary(army).map((g) => ({
    creature: g.creature,
    count: g.count,
    speed: g.unit.speed,
    // Solo en la fila de un veterano, que va sola (`troopSummary`): una fila de
    // novatos no tiene experiencia que contar, y un `rank: 1` en cada una
    // engordaría todos los turnos para no decir nada.
    //
    // Con su `id`, que es lo que el agente escribe en `equip.veteran` y
    // `unequip.veteran`, y su `equipment` con la misma forma que el del héroe
    // —los seis huecos, en inglés, `null` el vacío—: un novato equipado tiene hoja
    // (experiencia 0) y por eso va en su fila con las dos cosas.
    ...(g.veterania === undefined
      ? {}
      : {
          id: g.veterania.id,
          rank: g.rango,
          level: nivelDeUnidad(g.unit),
          experience: g.veterania.experiencia,
          nextRankAt: g.siguiente,
          equipment: equipoView(g.veterania.equipo),
        }),
  }));
}

/**
 * Lo que lleva puesto alguien, por hueco, con `null` en el vacío: los seis
 * huecos siempre, con su nombre del contrato (`SLOT_DE_HUECO`). **Una sola
 * forma** para el héroe y para la fila de un individuo.
 */
export function equipoView(equipo: Equipo | undefined): Readonly<Record<Slot, string | null>> {
  return Object.fromEntries(HUECOS.map((h) => [SLOT_DE_HUECO[h], equipo?.[h] ?? null])) as Record<
    Slot,
    string | null
  >;
}

/**
 * El catálogo de equipo en prosa, **derivado de `EQUIPO`** y no escrito a mano,
 * con las cifras ya resueltas como los costes del terreno y de dónde sale cada
 * pieza (`deDondeSale`): el agente no tiene otra forma de saber lo que vale una
 * pieza, y una cifra que se le anuncia y no cuadra no la descubre nadie. Lo
 * interpola `RESPONSE_FORMAT.adventure_turn`.
 */
export const CATALOGO_DE_EQUIPO_EN_PROSA: string = EQUIPO.map((p) => {
  const venta = seVende(p) ? ` por ${describirCoste(p.precio)}` : '';
  return `    ${p.id} (${SLOT_DE_HUECO[p.hueco]}): ${cifrasDePieza(p)} · ${deDondeSale(p)}${venta}`;
}).join('\n');

/**
 * Quién ocupaba un sitio cuando se vio, para el cable: `null`, nadie; un héroe, con
 * su id y su dueño; una guarnición, con su dueño (`null`, la neutral).
 */
export function ocupanteView(ocupante: Ocupante | null) {
  if (ocupante === null) return null;
  return ocupante.kind === 'heroe'
    ? { hero: ocupante.heroId, owner: ocupante.dueño }
    : { garrison: ocupante.dueño };
}

/**
 * La ficha de una unidad del catálogo tal como la lee el agente
 * (`creature_stats`): sus cifras con su equipo de serie puesto, su `dwelling` (el
 * edificio que la produce, `null` si ninguno), lo que lleva (`equipment`, por
 * hueco del contrato, y `armor`, los puntos que resta de cada golpe) y lo que se
 * deriva de las cifras, su `level` y su `powerIndex` (`unidad/nivel.ts`). Las armas
 * por uso y la rueda de cada una no viajan: el agente las lee de las piezas
 * (`equipment` y el catálogo de equipo de su prosa).
 */
export function fichaDeCriatura(c: UnidadDelJuego) {
  // Campo a campo, no «todo menos lo que no viaja»: quitar `armas` o la armadura
  // por desestructuración era nombrarlas fuera de su escritor (`conEquipo`), y un
  // campo nuevo de `UnitInfo` llegaría al agente sin que nadie lo decidiera.
  return {
    id: c.id,
    name: c.name,
    faction: c.faction,
    attack: c.attack,
    // La fuerza y la agilidad del cuerpo (25-10-2026); defensa, daño y velocidad,
    // derivadas de ellas y del equipo de serie (`cifrasDelCuerpo`), y lo que pesa.
    strength: c.fuerza,
    agility: c.agilidad,
    weight: c.peso ?? 0,
    defense: c.defense,
    damage: c.damage,
    hp: c.hp,
    speed: c.speed,
    // Lo que cuenta en la marcha del mapa (26-10-2026): con montura, la de ella.
    mapSpeed: marchaDe(c),
    // Montado de guerra y con lanza, la horquilla del golpe de carga (la fuerza de
    // la montura más la de la lanza, por la agilidad del jinete).
    ...chargeDamageDe(c),
    // Lo que tira su arma a distancia si no es un arco ni una ballesta (02-11-2026).
    ...tiroDe(c),
    ...(c.traits === undefined ? {} : { traits: c.traits }),
    leadership: c.leadership,
    cost: c.oro,
    growth: c.growth,
    dwelling: c.edificio,
    equipment: equipoView(c.equipo),
    armor: armaduraDe(c),
    level: nivelDeUnidad(c),
    powerIndex: indiceDePoder(c),
  };
}

/**
 * De la ficha, lo que tira a distancia: un arma de fuego con su recarga
 * (`reload`: solo la lleva un arma de fuego, y lo dice) o una granada con sus cargas
 * por batalla y su alcance (`grenadeCharges`, `grenadeRange`); nada con un arco, una
 * ballesta o sin arma a distancia.
 */
function tiroDe(c: UnidadDelJuego): {
  reload?: number;
  grenadeCharges?: number;
  grenadeRange?: number;
} {
  if (recargaDe(c) > 0) return { reload: recargaDe(c) };
  if (cargasDe(c) > 0) return { grenadeCharges: cargasDe(c), grenadeRange: alcanceDeLaGranada(c) };
  return {};
}

/** `chargeDamage` de la ficha, solo si carga montada (`GolpeConArma.carga`). */
function chargeDamageDe(c: UnidadDelJuego): { chargeDamage?: readonly [number, number] } {
  const { carga } = golpeDe(c, 'arma');
  return carga === undefined ? {} : { chargeDamage: carga };
}

/** A qué se lanza un hechizo, en el contrato. */
function objetivoAlAgente(h: Hechizo): 'ally' | 'enemy' | 'any' | 'tile' | 'self' | 'all' {
  if (h.entrega.tipo === 'sobreSi') return 'self';
  if (h.entrega.tipo === 'tablero') return 'all';
  switch (h.objetivo) {
    case 'aliado':
      return 'ally';
    case 'enemigo':
      return 'enemy';
    case 'casilla':
      return 'tile';
    default:
      return 'any';
  }
}

/**
 * Los hechizos del juego como los lee el agente (`spell_list`, 06-11-2026): el id, el
 * nombre, el nivel del gremio que lo enseña (`null`: ninguno), el maná, la
 * descripción de quien lo escribió, lo que hace en una frase (`queHaceElHechizo`) y
 * a qué se lanza (`target`: con "tile", `cast` lleva `at`; con "self" o "all", nada).
 */
export function hechizosAlAgente() {
  return todosLosHechizos().map((h) => ({
    id: h.id,
    name: h.nombre,
    level: h.gremio,
    cost: h.mana,
    description: h.descripcion,
    summary: queHaceElHechizo(h),
    target: objetivoAlAgente(h),
  }));
}
