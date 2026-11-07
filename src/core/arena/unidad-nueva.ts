/**
 * Una unidad nueva de la arena (`unidadNueva`): desde una hoja entera, con el cuerpo
 * común, la Espada por todo equipo y un id libre también entre las que no valen.
 *
 * Era parte de `core/arena.ts`, repartido en `arena/` en la fase N de la
 * reorganización (07-11-2026); lo que hace la arena y por qué, en `montaje.ts`.
 */
import type { EquipoAtado } from '../equipo/atado.js';
import type { CreatureTrait, FactionId } from '../types.js';
import { CUERPO_COMUN, ESPADA, type Hoja, type Unidad, validarUnidad } from '../unidad/formato.js';

/** Los rasgos con los que nace un cuerpo: `undead` si es de los no muertos, y ninguno más. */
function rasgosDelCuerpo(faccion: FactionId): readonly CreatureTrait[] {
  return faccion === 'no-muertos' ? ['undead'] : [];
}

/**
 * Los ids que una unidad nueva no puede tomar, por separado para que nadie se
 * deje un grupo. El catálogo no trae unidades que no validan: con una, el núcleo
 * no carga y la página lo dice (`client/arranque.ts`).
 */
export interface IdsOcupados {
  /** Las unidades del catálogo, las nuevas incluidas. */
  readonly validas: readonly string[];
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
 * De su hoja toma la facción, la agilidad del cuerpo de su personaje y, si es de
 * los no muertos, `undead` (un esqueleto vivo, con moral, era raro, M7 de QA); ni
 * el equipo, ni los poderes, ni lo que el perfil cobra. **Es la única unidad que no sale del catálogo**
 * (`data/unidades.json`): todas las demás se leen de él (simplify de F1,
 * 18-10-2026). Desde una criatura del catálogo del juego ya no se crea
 * (13-10-2026: en la arena solo están las cinco facciones de las hojas). Lo que
 * no se monta (una hoja a medias) lo dice la página antes de llamarla.
 */
export function unidadNueva(
  hoja: Pick<Hoja, 'id' | 'nombre' | 'faccion' | 'perfil' | 'agilidad'>,
  ocupados: IdsOcupados,
  eq: EquipoAtado,
): Unidad {
  const todos = new Set([...ocupados.validas, ...ocupados.hojas]);
  let n = 2;
  while (todos.has(`${hoja.id}-${n}`)) n++;
  return validarUnidad(
    {
      id: `${hoja.id}-${n}`,
      name: `${hoja.nombre} ${n}`,
      faction: hoja.faccion,
      cuerpo: { hoja: hoja.id },
      ...CUERPO_COMUN,
      agilidad: hoja.agilidad,
      traits: rasgosDelCuerpo(hoja.faccion),
      habilidades: [],
      // Sin arma no se combate (18-10-2026): nace con la Espada, la versátil.
      equipo: { arma: ESPADA },
    },
    eq,
  );
}
