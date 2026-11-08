/**
 * Lo que comparten los tests sin ser de un área: la raíz del repositorio, el
 * contexto de una partida (`ctx`), las unidades por el papel que hacen en una
 * prueba, y una carpeta temporal que se borra sola.
 *
 * Un solo sitio para cada cosa (fase T de la reorganización de la arquitectura,
 * 06-11-2026): cada test llevaba su copia de la raíz (25) y del contexto (13), y
 * una copia de la raíz con otra forma —con barra al final, o percent-encoded—
 * rompía en silencio a quien la recortaba. Sin el cliente y sin el taller: un
 * test del núcleo lo importa sin arrastrar nada.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRng } from '../src/core/rng.js';
import type { GameContext } from '../src/core/state/tipos.js';
import type { FactionId } from '../src/core/types.js';

/**
 * La raíz del repositorio, **sin barra al final** (`taller-huesos` corta
 * `RAIZ.length + 1` para quedarse con lo relativo) y decodificada.
 *
 * `new URL(...).pathname` devuelve la ruta PERCENT-ENCODED: en un checkout que
 * viva en una ruta con espacios o paréntesis daba `…/ruta%20con%20(…)/repo` y
 * los guardias morían con ENOENT al cargar el módulo, antes de que ninguno
 * llegara a comprobar nada. `import.meta.dirname` ya viene decodificado.
 */
export const RAIZ = resolve(import.meta.dirname, '..');

/** El contexto de una partida con el azar de `semilla`: lo que piden `applyAdventureAction` y los turnos. */
export const ctx = (semilla: number): GameContext => ({ rng: createRng(semilla) });

/**
 * Una carpeta temporal nueva (`<tmp>/<prefijo>XXXXXX`) que se borra al acabar el
 * test que la pide, pase o falle: dos de las que se creaban a mano no se borraban
 * nunca (`taller-ajustes`, la hoja de cinco filas de `taller`). Se pide dentro de
 * un `it`.
 *
 * `onTestFinished` es el global de vitest (`globals: true`) y no se importa: este
 * módulo lo cargan también órdenes que corren fuera de vitest
 * (`tools/qa/ancla-paneles.ts`, por `escenas-paneles.ts`), y un `import … from
 * 'vitest'` lanza al cargarse fuera de él («Vitest failed to access its internal
 * state»). Así estuvo rota esa orden desde el 22-10-2026, cuando `helpers.ts`
 * empezó a importarlo.
 */
export function carpetaTemporal(prefijo: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ------------------------------------------------------------ fixtures por papel

/**
 * **Unidades del catálogo por el papel que hacen en una prueba** (19-10-2026, F3
 * de `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/`). El catálogo es
 * el de `data/unidades.json`, que la arena edita: un test que escribe un id
 * suelto no dice por qué lo quiere, y el día que la arena cambie esa unidad no
 * se sabe qué defendía. Aquí cada papel lleva el motivo, y lo que un test espera
 * de las cifras se lee de la unidad (`unidadDelJuego`), no se escribe.
 *
 * Las dos facciones del montaje de prueba son las dos primeras de `FACTION_IDS`,
 * las que pone el generador cuando nadie pide otras.
 */
export const FACCION_A = 'templarios' satisfies FactionId;
export const FACCION_B = 'no-muertos' satisfies FactionId;

/** La tropa de a pie de la facción A, la de su pueblo (espada, brigantina y escudo). */
export const TROPA = 'templario-escudo';
/**
 * La tropa pesada de la facción A, a dos manos (mandoble y gambesón), con 4 casillas.
 * Era el del mandoble y el arnés hasta la escala baja (26-10-2026), cuando el arnés
 * empezó a quitarle una de agilidad y los tests que la usan como «la que anda 4 y
 * pega fuerte» dejaron de valer.
 */
export const PESADA = 'templario-penitente';
/** Jinete con `charge` de la facción A (lanza, espada y barda). */
export const JINETE = 'templario-hermano-de-carga';
/** Unidad con poderes (Curar) de la facción A. */
export const SANADOR = 'templario-monje';
/** El no-muerto más barato (1 de liderazgo), de la facción B. */
export const NO_MUERTO = 'esqueleto-guerrero';
/** Tirador de la facción B: dispara con su arco, sin munición que contar. */
export const TIRADOR_NO_MUERTO = 'esqueleto-arquero';
/** La tropa más barata del catálogo, 1 de liderazgo (orkos). */
export const TROPA_BARATA = 'goblin-lancero';
/** Tirador sin rasgos (elfos): dispara con su arco, sin munición que contar. */
export const TIRADOR = 'elfo-arquero';
