/**
 * La orden de los temas de la interfaz: la hoja de fichas de sus piezas
 * (`src/client/piezas-de-tema.css`) y, si se pide, las guías de su corte.
 */
import { escribirGuiasDeTemas, escribirPiezasDeTema } from '../temas/piezas.js';
import type { Orden } from './orden.js';

/** Los temas de la interfaz. */
export const ORDENES_DE_LOS_TEMAS: Readonly<Record<string, Orden>> = {
  'piezas-de-tema': {
    uso: `pnpm taller piezas-de-tema [--guias]
    rehace \`src/client/piezas-de-tema.css\` con las piezas de tema que hay en disco
    (\`temas/piezas.ts\`); con \`--guias\`, también las guías de su corte (\`assets/temas/_guias/\`)`,
    correr: async (resto) => {
      // La hoja de fichas de las piezas de tema, desde lo que hay en disco. La cabecera
      // de la hoja nombra esta orden, que no existió hasta el 06-11-2026: 21189b8a
      // trajo las funciones y no la orden.
      const sobran = resto.filter((r) => r !== '--guias');
      if (sobran.length > 0)
        throw new Error(
          `uso: pnpm taller piezas-de-tema [--guias] (no se entiende ${sobran.join(' ')})`,
        );
      if (resto.includes('--guias'))
        for (const g of await escribirGuiasDeTemas()) console.log(`→ ${g}`);
      const { ruta, piezas } = await escribirPiezasDeTema();
      console.log(`→ ${ruta}: ${piezas} piezas en disco`);
    },
  },
};
