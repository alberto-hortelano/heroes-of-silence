/**
 * Las herramientas de desarrollo del mapa de aventura, juntas: el modo «marcar
 * fallo» (`marcas.ts`) y la vista de regiones (`regiones.ts`). Es lo único que
 * `main.ts` trae con su `import()` detrás de `HERRAMIENTAS_DE_DESARROLLO`, y
 * para él son un solo `Desarrollo`.
 */
import { type DependenciasDeMarcas, montar as montarMarcas } from './marcas.js';
import { montar as montarRegiones } from './regiones.js';
import type { Desarrollo } from './tipos.js';

export function montar(d: DependenciasDeMarcas): Desarrollo {
  // El orden de los botones y de la pintura: la vista debajo, las aspas encima.
  const marcas = montarMarcas(d);
  const regiones = montarRegiones(d);
  return {
    // Solo «marcar» se queda el clic: con la vista de regiones el héroe se sigue moviendo.
    get activo() {
      return marcas.activo;
    },
    dibujar(ctx) {
      regiones.dibujar(ctx);
      marcas.dibujar(ctx);
    },
    tecla(ev) {
      return marcas.tecla(ev) || regiones.tecla(ev);
    },
    clic(px, py) {
      marcas.clic(px, py);
    },
  };
}
