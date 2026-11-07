/**
 * Las tandas de peleas de la IA contra la IA en la arena, con las reglas del juego:
 * cómo se monta cada semilla y con qué variantes se pelea. Las comparten la medida
 * (`arena-ia.ts`, que cuenta lo que pasa en ellas) y la huella de identidad
 * (`huella.ts`, que hashea su registro): `arena-ia.ts` corre al importarse, y con
 * las tandas copiadas en las dos, el día que una cambiara la huella vigilaría peleas
 * que ya nadie mide.
 *
 * Cinco tandas, cada una con sus montajes de su propia corriente de azar; las
 * cuatro primeras sin muralla:
 *
 * - **mezcla**: de 3 a `LIDERAZGO.maxPorBando` hojas de tropa por bando.
 * - **armadura**: tres contra tres de todas las hojas (mezcla) y un jinete contra
 *   tres de arco, ballesta o bastón, con la barda y sin ella
 *   cuenta los golpes que la armadura paró enteros.
 * - **con héroes**: tres contra tres de todas las hojas, con un héroe por bando
 *   sin libro (que pega con la Espada).
 * - **murallas del mapa** (puesto fronterizo, fase 2, 04-11-2026): las dos formas de
 *   `data/sitios.json` (la de la ciudad, de piedra, y la del pueblo, de madera), un
 *   héroe por lado sin libro, el atacante con seis de tropa y el defensor con cinco,
 *   con el atacante al asalto como lo pone el juego (`alAsalto`: una escalera a cada
 *   uno, el héroe incluido).
 *
 * Aquí no se juega ni se cuenta nada: se monta. Jugar es `autoResolve` sobre lo que
 * devuelve `peleaSinJugar`, y eso es de quien la mide.
 */

import { resolve } from 'node:path';
import { heroePorDefecto } from '../../src/core/arena/heroe.js';
import type { Lado } from '../../src/core/arena/lados.js';
import {
  bandosDeArena,
  batallaDeArena,
  type MontajeDeArena,
} from '../../src/core/arena/montaje.js';
import { quitarEnArena } from '../../src/core/arena/piezas.js';
import { alAsalto, createBattle } from '../../src/core/battle/battle.js';
import { type MurallaDeBatalla, SIN_MURALLA } from '../../src/core/battle/muralla.js';
import type { BattleState } from '../../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../../src/core/hero/equipo.js';
import { LIDERAZGO } from '../../src/core/hero/liderazgo.js';
import { createRng, type Rng } from '../../src/core/rng.js';
import { MURALLAS_DEL_MAPA } from '../../src/core/state/sitios.js';
import { unidad } from '../../src/core/unidad/catalogo.js';
import type { Hoja, Unidad } from '../../src/core/unidad/formato.js';
import { hojasDelTaller } from '../arena/borrador.js';

/** Un montaje de la medida: las unidades de cada bando. */
export type Montaje = readonly [readonly Unidad[], readonly Unidad[]];

/** Una variante: lo que se le cambia a cada unidad y, si la hay, tras qué muralla del mapa. */
export interface Variante {
  readonly nombre: string;
  readonly cambia: (u: Unidad) => Unidad;
  /** La muralla del mapa (`MURALLAS_DEL_MAPA`), con el atacante al asalto (`alAsalto`). */
  readonly muralla?: MurallaDeBatalla;
}

/** Una tanda: cómo se monta cada semilla, con qué variantes se pelea y si con héroes. */
export interface Tanda {
  readonly nombre: string;
  readonly montar: (rng: Rng) => Montaje;
  readonly variantes: readonly Variante[];
  readonly conHeroes?: boolean;
}

const HOJAS = hojasDelTaller(resolve(import.meta.dirname, '../..'));
// Solo la tropa: los héroes no tienen unidad en el catálogo, que es de donde salen las cifras.
const TROPA = HOJAS.filter((h) => !h.heroe);
const JINETES = TROPA.filter((h) => h.perfil.startsWith('montado-'));
const FLOJAS = TROPA.filter((h) => ['arco', 'ballesta', 'baston'].includes(h.perfil));

export const TANDAS: readonly Tanda[] = (() => {
  const elegir = (rng: Rng, de: readonly Hoja[], n: number): Unidad[] =>
    // Las cifras, del catálogo: la misma fuente que la arena y el juego.
    Array.from({ length: n }, () => unidad(rng.pick(de).id));
  const igual = (u: Unidad): Unidad => u;
  const sinBarda = (u: Unidad): Unidad =>
    u.equipo.armadura === 'barda' ? quitarEnArena(u, 'armadura') : u;
  const conArmadura: readonly Variante[] = [
    { nombre: 'con barda', cambia: igual },
    { nombre: 'sin barda', cambia: sinBarda },
  ];
  const elJuego: readonly Variante[] = [{ nombre: 'el juego', cambia: igual }];
  return [
    {
      nombre: 'mezcla',
      montar: (rng) => {
        const n = () => rng.int(3, LIDERAZGO.maxPorBando);
        return [elegir(rng, TROPA, n()), elegir(rng, TROPA, n())];
      },
      variantes: elJuego,
    },
    {
      nombre: 'armadura: mezcla',
      montar: (rng) => [elegir(rng, TROPA, 3), elegir(rng, TROPA, 3)],
      variantes: conArmadura,
    },
    {
      nombre: 'armadura: jinete contra floja',
      montar: (rng) => [elegir(rng, JINETES, 1), elegir(rng, FLOJAS, 3)],
      variantes: conArmadura,
    },
    {
      nombre: 'con héroes',
      montar: (rng) => [elegir(rng, TROPA, 3), elegir(rng, TROPA, 3)],
      variantes: elJuego,
      conHeroes: true,
    },
    {
      nombre: 'murallas del mapa',
      montar: (rng) => [elegir(rng, TROPA, 6), elegir(rng, TROPA, 5)],
      // Una variante por sitio con muralla, con el nombre de su material.
      variantes: Object.values(MURALLAS_DEL_MAPA).map((muralla) => ({
        nombre: muralla.material,
        cambia: igual,
        muralla,
      })),
      conHeroes: true,
    },
  ];
})();

/** El montaje de `semilla` en la tanda `t`, de su corriente: el mismo para todas sus variantes. */
export function montajeDeLaSemilla(t: Tanda, semilla: number): Montaje {
  return t.montar(createRng(semilla * 7919));
}

/**
 * La pelea de la variante `v` sobre `montaje`, montada y sin jugar, con el `Rng`
 * con que se juega: sin muralla, la pelea de la arena; tras la del mapa, sus bandos
 * al asalto, como `montarLaBatalla` (la arena no da escalera al héroe).
 */
export function peleaSinJugar(
  t: Tanda,
  v: Variante,
  [izquierda, derecha]: Montaje,
  semilla: number,
): { readonly batalla: BattleState; readonly rng: Rng } {
  const lado = (us: readonly Unidad[], cual: Lado) => ({
    unidades: us.map((u) => ({ unidad: v.cambia(u) })),
    // Sin libro: con el de serie, sus hechizos acaban la pelea en la primera
    // ronda y nadie llega a golpear.
    heroe: t.conHeroes === true ? { ...heroePorDefecto(cual), hechizos: [] } : null,
  });
  const rng = createRng(semilla);
  const montaje: MontajeDeArena = {
    combate: COMBATE_COMPLETO,
    izquierda: lado(izquierda, 'izquierda'),
    derecha: lado(derecha, 'derecha'),
    muralla: SIN_MURALLA,
    equipo: EQUIPO_DEL_JUEGO,
  };
  const batalla =
    v.muralla === undefined
      ? batallaDeArena(montaje, rng)
      : (() => {
          const { izquierda: atacante, derecha: defensor } = bandosDeArena(montaje);
          return createBattle(
            alAsalto(atacante, v.muralla),
            defensor,
            rng,
            montaje.combate,
            v.muralla,
          );
        })();
  return { batalla, rng };
}
