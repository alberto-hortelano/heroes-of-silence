/**
 * Las órdenes de la base caminable: recortar, encoger y medir sus tramos, y la
 * página de revisión (`vista-base`).
 */
import { disposicionDe } from '../../../src/shared/base.js';
import { ARTE_DE_LA_BASE } from '../base.js';
import { encogerElTramo } from '../encoger-base.js';
import { medirLaBase, recortarLaBase } from '../recorte-base.js';
import { vistaBase } from '../vista-base.js';
import { faccionDe, type Orden } from './orden.js';

/** La base caminable. */
export const ORDENES_DE_LA_BASE: Readonly<Record<string, Orden>> = {
  'recortar-base': {
    uso: `pnpm taller recortar-base templarios
    deriva los tramos (lo de encima del pie), el suelo, cada recorte y cada versión abierta, y
    rehace el índice (\`recorte-base.ts\`)`,
    correr: async (resto) => {
      const faccion = faccionDe(resto[0], 'pnpm taller recortar-base templarios');
      const { indice, avisos } = await recortarLaBase(faccion);
      for (const [id, e] of Object.entries(indice.edificios))
        console.log(`${id}: tramo ${e.tramo}, en (${e.en.join(', ')}), ${e.ancho}×${e.alto}`);
      console.log(
        `placas: ${indice.tramos.map((t, i) => `T${i + 1} ${t === null ? 'falta' : 'sí'}`).join(' · ')}`,
      );
      for (const a of avisos) console.log(`aviso: ${a}`);
    },
  },
  'encoger-base': {
    uso: `pnpm taller encoger-base <facción> [tramo]
    encoge sobre la placa lo que Codex pintó grande, con la puerta y el pie quietos
    (\`encoger-base.ts\`, los factores en \`ARTE_DE_LA_BASE[f].encoger\`)`,
    correr: async (resto) => {
      const uso = 'pnpm taller encoger-base <facción> [tramo]';
      const faccion = faccionDe(resto[0], uso);
      const tramos =
        resto[1] === undefined
          ? Object.keys(ARTE_DE_LA_BASE[faccion].encoger).map(Number)
          : [Number(resto[1])];
      for (const n of tramos) console.log(`→ ${await encogerElTramo(faccion, n)}`);
    },
  },
  'medir-base': {
    uso: `pnpm taller medir-base templarios [tramo]
    propone las regiones de un tramo, para \`data/bases/templarios.json\``,
    correr: async (resto) => {
      const faccion = faccionDe(resto[0], 'pnpm taller medir-base templarios [tramo]');
      const tramos =
        resto[1] === undefined
          ? Array.from({ length: disposicionDe(faccion).tramos }, (_, i) => i + 1)
          : [Number(resto[1])];
      for (const n of tramos) {
        try {
          for (const l of await medirLaBase(faccion, n)) console.log(`T${n} ${l}`);
        } catch (err) {
          console.log(`T${n}: ${err instanceof Error ? err.message : err}`);
        }
      }
    },
  },
  'vista-base': {
    uso: `pnpm taller vista-base templarios [carpeta-de-salida [prefijo]]
    la revisión: tramos, máscaras, compuesta, costuras y eslabones`,
    correr: async (resto) => {
      const uso = 'pnpm taller vista-base templarios [carpeta-de-salida [prefijo]]';
      console.log(await vistaBase(faccionDe(resto[0], uso), resto[1], resto[2]));
    },
  },
};
