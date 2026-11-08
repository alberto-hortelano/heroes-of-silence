/**
 * El héroe de un bando de la arena: sus cifras, su libro y su equipo, cómo pisa el
 * tablero (`heroeDeArena`) y lo que enseña su ficha.
 *
 * Era parte de `core/arena.ts`, repartido en `arena/` en la fase N de la
 * reorganización (07-11-2026); lo que hace la arena y por qué, en `montaje.ts`.
 */
import { mandoDe } from '../battle/montaje.js';
import { duracionDeLoQueLanza } from '../battle/spells.js';
import { HERO_BODY, type HeroeDelBando } from '../battle/types.js';
import type { EquipoAtado } from '../equipo/atado.js';
import { idsPuestos } from '../equipo/vestir.js';
import {
  type CuerpoDeTodoHeroe,
  combateDelHeroe,
  EQUIPO_BASE,
  HEROE,
} from '../hero/cuerpo-del-heroe.js';
import { CIFRAS_DEL_HEROE_INICIAL, cuerpoDelHeroe, maxMana } from '../hero/hero.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../hero/rango.js';
import {
  type CatalogoDeHechizos,
  HECHIZOS_DEL_JUEGO,
  hechizo,
  hechizosDelGremio,
  ordenDelLibro,
} from '../magia/catalogo.js';
import { queHaceElHechizo } from '../magia/dicho.js';
import { esIdDeHechizo, GREMIO_MAXIMO } from '../magia/formato.js';
import { type Equipo, FACTION_IDS, type UnitInfo } from '../types.js';
import { equipoDeUnidadBlocker, equipoEscrito } from '../unidad/formato.js';
import { entero, esIdDeUnidad, lista, sinRepetir, texto } from '../validar.js';
import { LADOS, type Lado } from './lados.js';

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
  /** Los ids de los hechizos de su libro (`data/hechizos.json` o los de la arena), sin repetir. */
  readonly hechizos: readonly string[];
  /**
   * El cuerpo de todo héroe (`combate` de `data/heroe.json`: PV, fuerza y
   * agilidad, y lo que suben por rango), el mismo en los dos bandos: la página lo
   * cambia a la vez en los dos y «Guardar» lo escribe. Va en cada héroe para que la
   * batalla, el retoque y el enlace lo lleven sin otro camino.
   */
  readonly cuerpo: CuerpoDeTodoHeroe;
  /**
   * Lo que lleva puesto, un id de pieza por hueco (04-11-2026, petición del usuario:
   * «no se les puede cambiar el equipo»): empieza en el equipo base de todo héroe
   * (`EQUIPO_BASE`, la Espada y el gambesón) y se cambia en su ficha, como el de
   * una unidad, con la misma regla (`equipoDeUnidadBlocker`). Es de este héroe de
   * la arena: «Guardar» no lo escribe.
   */
  readonly equipo: Equipo;
}

/** Lo más alto que admite una cifra del héroe: más arriba ninguna fórmula cambia ya. */
export const CIFRA_MAXIMA_DE_HEROE = 99;

/**
 * El héroe que se pone en un lado: las cifras del héroe inicial de la partida
 * (`CIFRAS_DEL_HEROE_INICIAL`), la figura genérica y todo el libro. Aquí y no en
 * la página para que un test monte la misma pelea que monta quien pulsa.
 */
export function heroePorDefecto(
  lado: Lado,
  cuerpo: CuerpoDeTodoHeroe = HEROE.combate,
): HeroeDeArena {
  return {
    cuerpo,
    equipo: EQUIPO_BASE,
    nombre: `Héroe ${LADOS[lado].adjetivo}`,
    figura: null,
    ataque: CIFRAS_DEL_HEROE_INICIAL.attack,
    defensa: CIFRAS_DEL_HEROE_INICIAL.defense,
    poder: CIFRAS_DEL_HEROE_INICIAL.spellPower,
    conocimiento: CIFRAS_DEL_HEROE_INICIAL.knowledge,
    // Los que enseña el gremio (los de antes del editor de magia): los demás se
    // ponen en su libro desde la ficha. De todas las facciones (`FACTION_IDS`): el héroe
    // de la arena no tiene ninguna y su libro se edita a mano (08-11-2026).
    hechizos: hechizosDelGremio(GREMIO_MAXIMO, FACTION_IDS).map((x) => x.id),
  };
}

/** Comprueba un héroe de la arena y lanza diciendo qué no cuadra. */
export function validarHeroeDeArena(h: HeroeDeArena): HeroeDeArena {
  const quien = 'el héroe';
  const nombre = texto(h.nombre, 'el nombre', quien);
  if (h.figura !== null && !esIdDeUnidad(h.figura)) {
    throw new Error(`${quien}: la figura «${h.figura}» no es el id de una hoja`);
  }
  const cifra = (v: number, campo: string, minimo: number): number => {
    const n = entero(v, campo, quien, minimo);
    if (n > CIFRA_MAXIMA_DE_HEROE) {
      throw new Error(`${quien}: ${campo} va hasta ${CIFRA_MAXIMA_DE_HEROE}, y es ${n}`);
    }
    return n;
  };
  // Solo la forma del id: si existe lo dice el catálogo con que se pelea (la arena
  // tiene los suyos sin guardar; `createBattle` lanza con uno que no está).
  const hechizos = lista(h.hechizos, 'los hechizos', quien).map((id) => {
    if (typeof id !== 'string' || !esIdDeHechizo(id)) {
      throw new Error(`${quien}: ${JSON.stringify(id)} no es el id de un hechizo`);
    }
    return id;
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
    cuerpo: combateDelHeroe(h.cuerpo, `${quien}: su cuerpo`),
    equipo: equipoEscrito(h.equipo, quien),
  };
}

/** Si la pieza `id` es del equipo base del héroe (`EQUIPO_BASE`): la lleva todo héroe. */
export function laLlevaElHeroe(id: string): boolean {
  return idsPuestos(EQUIPO_BASE).includes(id);
}

/**
 * El héroe tal como entra en la batalla. **Uno nuevo en cada llamada**: el motor
 * gasta su maná y marca su hechizo de la ronda sobre este objeto, y una segunda
 * pelea con el mismo empezaría con el maná de la primera.
 *
 * Su equipo, el suyo (`HeroeDeArena.equipo`, que empieza en el base de todo héroe),
 * se lee de `eq`, como el de la tropa (el cuerpo de `heroUnit`, vestido con él): las
 * piezas que la arena puede haber cambiado.
 */
export function heroeDeArena(datos: HeroeDeArena, eq: EquipoAtado): HeroeDelBando {
  const h = validarHeroeDeArena(datos);
  const desnudo = cuerpoDelHeroeDeArena(h);
  // Con la regla del equipo de una unidad: piezas que existen, manos y un arma de
  // cuerpo a cuerpo, sin la que nadie pelea.
  const motivo = equipoDeUnidadBlocker(desnudo, h.equipo, eq);
  if (motivo !== null) throw new Error(`${h.nombre}: ${motivo}`);
  return {
    cuerpo: eq.conEquipo(desnudo, h.equipo),
    desnudo,
    mando: mandoDe(
      {
        name: h.nombre,
        spellPower: h.poder,
        knowledge: h.conocimiento,
        mana: maxMana({ knowledge: h.conocimiento }),
        spells: h.hechizos,
      },
      { blocked: 'en la arena no hay huida' },
    ),
    figura: h.figura ?? HERO_BODY,
  };
}

/** El cuerpo del héroe de la arena sin su equipo: lo que viste `heroeDeArena`. */
export function cuerpoDelHeroeDeArena(datos: HeroeDeArena): UnitInfo {
  const h = validarHeroeDeArena(datos);
  return cuerpoDelHeroe(
    {
      name: h.nombre,
      attack: h.ataque,
      defense: h.defensa,
      experience: EXPERIENCIA_INICIAL_DE_HEROE,
    },
    h.cuerpo,
  );
}

/**
 * Lo que la ficha del héroe enseña, ya con las reglas del motor: su cuerpo en el
 * tablero, el maná, cuántas rondas dura lo que lanza y lo que rinde cada hechizo
 * con su poder (`spellAmount`, `efectoDe`, las mismas que lanzan).
 */
export function fichaDeHeroeDeArena(
  datos: HeroeDeArena,
  eq: EquipoAtado,
  cat: CatalogoDeHechizos = HECHIZOS_DEL_JUEGO,
): {
  readonly cuerpo: UnitInfo;
  readonly mana: number;
  /** Las rondas que dura lo que lanza con «rondas: poder» (`duracionDeLoQueLanza`). */
  readonly duracion: number;
  readonly hechizos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly coste: number;
    /** Lo que hace con su poder (`queHaceElHechizo`). */
    readonly hace: string;
  }[];
} {
  const { cuerpo, mando } = heroeDeArena(datos, eq);
  return {
    cuerpo,
    mana: mando.mana,
    duracion: duracionDeLoQueLanza(mando),
    hechizos: mando.spells
      .map((id) => hechizo(id, cat))
      .sort(ordenDelLibro)
      .map((h) => ({
        id: h.id,
        nombre: h.nombre,
        coste: h.mana,
        hace: queHaceElHechizo(h, mando.spellPower),
      })),
  };
}
