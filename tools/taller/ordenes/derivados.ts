/**
 * Las órdenes que derivan de lo que ya está en disco: el JSON de una hoja, las
 * anclas del Y Bot, las guías de geometría, las juntas del relieve, los puentes, los
 * puestos, los muros, la muralla de batalla, el recinto, las casas y el catálogo de
 * la escena. Ninguna llama a Codex.
 */
import { dirname, join, relative, resolve } from 'node:path';
import { RAIZ } from '../../comun/raiz.js';
import { escribirGuiasDeBajadas } from '../bajadas.js';
import { escribirCasas, vistaDeLasCasas } from '../casas.js';
import { escribirDerivado } from '../derivar.js';
import { escribirGuiasDeDiagonales } from '../diagonales.js';
import { escribirCatalogo } from '../escenario/catalogo-disco.js';
import { derivacionDeLaCarpeta } from '../juntar.js';
import { escribirGuiasDeLaderas } from '../laderas.js';
import { escribirPuestoDerivado } from '../mapa.js';
import { escribirIndiceDeLaMuralla } from '../muralla-de-batalla.js';
import { escribirGuiaDelMuro, escribirMurosDerivados } from '../muros.js';
import { escribirGuias, escribirPuenteDerivado } from '../paredes-puentes.js';
import { escribirAtlasDePoses, RUTA_DEL_ATLAS_8D } from '../poses-8d.js';
import { escribirGuiasDeRampas } from '../rampas.js';
import { escribirGuiaDelRecinto, escribirRecintoDerivado } from '../recinto.js';
import { escribirRelieveDerivado } from '../relieve.js';
import type { Orden } from './orden.js';

/** Lo que se deriva de lo que ya está en disco: JSON, guías y catálogos. */
export const ORDENES_DE_DERIVAR: Readonly<Record<string, Orden>> = {
  derivar: {
    uso: `pnpm taller derivar <hoja.webp>…
    reescribe el JSON de una hoja`,
    correr: async (resto) => {
      for (const r of resto) {
        // Con la derivación de su carpeta (`derivacionDeLaCarpeta`): la suelta y el
        // ritmo de su unidad, o las hojas de las acciones de una figura del banco de
        // NPC. `derivarAtlas` lanza si la hoja no tiene la fila del disparo que la
        // unidad dispara, o al revés.
        const d = await escribirDerivado(r, await derivacionDeLaCarpeta(dirname(r)).derivar());
        console.log(
          `${r}: altura ${d.altura}, fotogramas ${Object.values(d.clips)
            .map((c) => c.frames)
            .join('/')}`,
        );
      }
    },
  },
  'derivar-poses': {
    uso: `pnpm taller derivar-poses
    reescribe \`_poses/atlas-8d.json\`, las anclas del Y Bot`,
    correr: async () => {
      const { juegos } = await escribirAtlasDePoses();
      console.log(`→ ${relative(RAIZ, RUTA_DEL_ATLAS_8D)}: ${Object.keys(juegos).join(', ')}`);
    },
  },
  guias: {
    uso: `pnpm taller guias
    escribe las guías de geometría (\`guias.ts\`) de los puentes, las laderas, las diagonales, las
    bajadas, las rampas, el recinto y el muro de norte a sur`,
    correr: async () => {
      for (const g of [
        ...(await escribirGuias()),
        ...(await escribirGuiasDeLaderas()),
        ...(await escribirGuiasDeDiagonales()),
        ...(await escribirGuiasDeBajadas()),
        ...(await escribirGuiasDeRampas()),
        await escribirGuiaDelRecinto(),
        await escribirGuiaDelMuro(),
      ])
        console.log(`→ ${g}`);
    },
  },
  'derivar-relieve': {
    uso: `pnpm taller derivar-relieve [hoja…]
    apunta las juntas de cada módulo del relieve desde su guía: laderas (§20), diagonales y
    bajadas (§23); corta las rampas (§35)`,
    correr: async (resto) => {
      // Las juntas de cada módulo del relieve, desde su guía: laderas (§20),
      // diagonales y bajadas (§23). Sin hojas, todas las que hay en disco.
      for (const f of await escribirRelieveDerivado(resto.length === 0 ? undefined : resto))
        console.log(`→ ${f}`);
    },
  },
  'derivar-puentes': {
    uso: `pnpm taller derivar-puentes <puente.webp>…
    rehace su ancla (centro del tablero) y su casilla`,
    correr: async (resto) => {
      // El ancla y la casilla de cada puente pintado, otra vez desde su guía.
      for (const f of resto) {
        await escribirPuenteDerivado(resolve(f));
        console.log(`→ ${f.replace(/\.webp$/, '.json')}`);
      }
    },
  },
  'derivar-puestos': {
    uso: `pnpm taller derivar-puestos <puesto.webp>…
    rehace la casilla de una obra del puesto, desde su guía`,
    correr: async (resto) => {
      // La casilla de cada obra del puesto pintada, otra vez desde su guía.
      for (const f of resto) {
        await escribirPuestoDerivado(resolve(f));
        console.log(`→ ${f.replace(/\.webp$/, '.json')}`);
      }
    },
  },
  'derivar-muros': {
    uso: `pnpm taller derivar-muros
    el paso de la tirada de los tramos de norte a sur (\`muros.ts\`)`,
    correr: async () => {
      // El paso con que una pieza de norte a sur va detrás de otra sin enseñar su testero.
      for (const f of await escribirMurosDerivados()) console.log(`→ ${f}`);
    },
  },
  'derivar-muralla-batalla': {
    uso: `pnpm taller derivar-muralla-batalla
    rehace el índice de cajas de las piezas de la muralla de batalla (\`assets/batalla/muralla/indice.json\`)`,
    correr: async () => {
      // Las cajas de cada pieza de la muralla del tablero de batalla, otra vez.
      console.log(`→ ${await escribirIndiceDeLaMuralla()}`);
    },
  },
  'derivar-recinto': {
    uso: `pnpm taller derivar-recinto
    apunta el pie de las dos puntas de cada módulo del recinto desde su guía`,
    correr: async () => {
      // El pie de las dos puntas de cada puerta y tramo del recinto, desde su guía.
      console.log(`→ ${await escribirRecintoDerivado()}`);
    },
  },
  'derivar-casas': {
    uso: `pnpm taller derivar-casas [--vista]
    recorta las casas sueltas de la labranza de la hoja de pueblos (\`casas.ts\`); con --vista,
    cada casa teñida y numerada`,
    correr: async (resto) => {
      // Las casas sueltas de la labranza, de la hoja de pueblos: con --vista, las
      // casas teñidas y numeradas; sin él, las recorta (`CASAS_DE_LOS_PUEBLOS`).
      console.log(
        `→ ${
          resto.includes('--vista')
            ? await vistaDeLasCasas(join(RAIZ, '.cache/taller/casas-de-los-pueblos.png'))
            : await escribirCasas()
        }`,
      );
    },
  },
  'catalogo-escena': {
    uso: `pnpm taller catalogo-escena
    rehace assets/mapa/escena.json, el catálogo que lee el juego`,
    correr: async () => {
      const c = await escribirCatalogo();
      console.log(
        `→ assets/mapa/escena.json: ${Object.keys(c.hojas).length} hojas, ${Object.keys(c.piezas).length} piezas`,
      );
    },
  },
};
