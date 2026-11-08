/**
 * Las páginas para mirar las unidades: todos los ejércitos y el visor de 8
 * direcciones.
 */

import { vistaEjercitos } from '../vista.js';
import { vista8d } from '../vista-8d.js';
import type { Orden } from './orden.js';

/** Las vistas de las unidades. */
export const ORDENES_DE_LAS_VISTAS: Readonly<Record<string, Orden>> = {
  'vista-ejercitos': {
    uso: `pnpm taller vista-ejercitos
    una página con todos los ejércitos, para elegir o comparar`,
    correr: async () => {
      console.log(`→ ${await vistaEjercitos()}`);
    },
  },
  'vista-8d': {
    uso: `pnpm taller vista-8d [unidad|juego]
    el visor de 8 direcciones de las unidades y las poses`,
    correr: async (resto) => {
      // Un solo visor con todas: el argumento solo elige con cuál se abre.
      console.log(`→ ${await vista8d(resto[0])}`);
    },
  },
};
