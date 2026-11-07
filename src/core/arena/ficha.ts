/**
 * La ficha de un tipo de la arena en palabras (`fichaEnPalabras`, la del héroe), qué
 * cambia de una a otra, el nivel que enseña y de qué tipo es cada stack
 * (`TipoDeArena`).
 *
 * Era parte de `core/arena.ts`, repartido en `arena/` en la fase N de la
 * reorganización (07-11-2026); lo que hace la arena y por qué, en `montaje.ts`.
 */
import type { BattleStack, FichaEnPalabras } from '../battle/types.js';
import type { EquipoAtado } from '../equipo/atado.js';
import { HECHIZOS_DEL_JUEGO, ordenDelLibro } from '../magia/catalogo.js';
import {
  type CreatureTrait,
  type Equipo,
  HUECOS,
  type Hueco,
  NOMBRE_DE_FACCION,
  NOMBRE_DE_RASGO,
  type UnitInfo,
} from '../types.js';
import { validarUnidad } from '../unidad/formato.js';
import { indiceDePoder, nivelDelIndice } from '../unidad/nivel.js';
import { type HeroeDeArena, validarHeroeDeArena } from './heroe.js';
import { type FuenteDeArena, type Lado, ladoDe } from './lados.js';

// ------------------------------------------------------------- la ficha en palabras

/**
 * Lo que enseña la ficha del nivel de unas cifras: «Índice 340 · nivel 3». Lo
 * calcula el núcleo (`indiceDePoder`, con el equipo puesto) y la ficha solo lo pinta: el
 * nivel no es un campo que se escribe.
 */
export function lecturaDelNivel(u: UnitInfo): string {
  const indice = indiceDePoder(u);
  return `Índice ${indice} · nivel ${nivelDelIndice(indice)}`;
}

/** De qué unidad del catálogo de la pelea sale un stack de la tropa (`tipoDelStack`). */
export interface TipoDeArena {
  readonly kind: 'unidad';
  readonly id: string;
}

/**
 * De qué sale un stack de una pelea de la arena: una unidad del catálogo (su
 * origen, `OrigenDelStack.unidad`), o el héroe de un lado. Es lo que se edita al
 * pulsar «Editar» en su fila, y lo que cambia `retocarEnBatalla`.
 */
export function tipoDelStack(
  s: BattleStack,
): TipoDeArena | { readonly kind: 'heroe'; readonly lado: Lado } {
  switch (s.origen.kind) {
    case 'heroe':
      return { kind: 'heroe', lado: ladoDe(s.side) };
    case 'catalogo':
      return { kind: 'unidad', id: s.origen.unidad };
  }
}

/** La clave de una ficha en `BattleState.fichasDeArena`: un tipo del montaje o el héroe de un lado. */
export function claveDeFicha(
  t: TipoDeArena | { readonly kind: 'heroe'; readonly lado: Lado },
): string {
  return t.kind === 'heroe' ? `heroe:${t.lado}` : `${t.kind}:${t.id}`;
}

export function tipoDeLaFuente(f: FuenteDeArena): TipoDeArena {
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
export function fichaEnPalabras(f: FuenteDeArena, eq: EquipoAtado): FichaEnPalabras {
  const rasgos = (ts: readonly CreatureTrait[] | undefined) =>
    (ts ?? []).map((t) => NOMBRE_DE_RASGO[t]);
  const u = validarUnidad(f.unidad, eq);
  return {
    nombre: u.name,
    facción: NOMBRE_DE_FACCION[u.faction],
    liderazgo: `${u.leadership}`,
    ataque: `${u.attack}`,
    fuerza: `${u.fuerza}`,
    agilidad: `${u.agilidad}`,
    vida: `${u.hp}`,
    rasgos: rasgos(u.traits),
    habilidades: [...u.habilidades],
    // Un hueco, una lista de cero o una pieza: el parte dice «escudo: − Escudo».
    ...huecosEnPalabras(u.equipo, eq),
  };
}

/**
 * Lo que lleva cada hueco, por el nombre de su pieza: una lista de cero o una
 * («escudo: − Escudo» en el parte). Lo leen la ficha de una unidad y el cambio de
 * una pieza a media pelea, que renombrada la pone al día.
 */
export function huecosEnPalabras(
  equipo: Equipo,
  eq: EquipoAtado,
): Record<Hueco, readonly string[]> {
  const dicho: Partial<Record<Hueco, readonly string[]>> = {};
  for (const h of HUECOS) {
    const id = equipo[h];
    dicho[h] = id === undefined ? [] : [eq.pieza(id).nombre];
  }
  return dicho as Record<Hueco, readonly string[]>;
}

/**
 * La ficha de un héroe en palabras: las cifras que se escriben en ella, no las de
 * su cuerpo, que llevan el equipo base (N2 de QA: «ataque 2 → 9» salía «5 → 12»),
 * y el libro por los nombres que enseña la página («Prisa», no `haste`).
 */
export function fichaDelHeroe(datos: HeroeDeArena, eq: EquipoAtado): FichaEnPalabras {
  const h = validarHeroeDeArena(datos);
  return {
    nombre: h.nombre,
    ataque: `${h.ataque}`,
    defensa: `${h.defensa}`,
    poder: `${h.poder}`,
    conocimiento: `${h.conocimiento}`,
    // El cuerpo de todo héroe y lo puesto: sin ellos, cambiarlos a media pelea no
    // cambiaba nada (la ficha salía igual y el retoque no se aplicaba).
    fuerza: `${h.cuerpo.fuerza.base}`,
    agilidad: `${h.cuerpo.agilidad}`,
    vida: `${h.cuerpo.pv.base}`,
    hechizos: h.hechizos
      .map((id) => HECHIZOS_DEL_JUEGO.get(id) ?? null)
      .flatMap((x) => (x === null ? [] : [x]))
      .sort(ordenDelLibro)
      .map((x) => x.nombre),
    ...huecosEnPalabras(h.equipo, eq),
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
