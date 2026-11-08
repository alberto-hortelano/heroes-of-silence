/**
 * `pnpm taller`: el trabajador de la cola de imágenes y las órdenes del taller.
 *
 *   pnpm taller                 trabaja hasta vaciar la cola
 *   pnpm taller ayuda           cómo se escribe cada orden y qué hace
 *   pnpm taller <orden> …       una de la tabla `ORDENES`, de la que salen la ayuda y
 *                               la lista del «orden desconocida»
 *
 * Por cada encargo (`proceso.ts`): lanza Codex con las referencias en su orden, recorta el
 * halo, empaqueta (si es un atlas), valida con sharp, escribe la imagen, su
 * JSON derivado y el registro de procedencia —referencias con su sha256, hilo
 * de Codex, prompt entero y sha256 del crudo y del resultado—. Un fallo no para
 * la cola: el encargo va a `fallido/` con el motivo y se sigue con el siguiente.
 *
 * Varios trabajadores pueden correr a la vez sobre la misma cola: tomar un
 * encargo es un `rename` atómico (ver `cola.ts`).
 */
import { ORDENES_DE_LA_BASE } from './ordenes/base.js';
import { ORDENES_DE_LA_COLA } from './ordenes/cola.js';
import { ORDENES_DE_DERIVAR } from './ordenes/derivados.js';
import { ORDENES_DE_ENCOLAR } from './ordenes/encolar.js';
import { ORDENES_DEL_MANIQUI } from './ordenes/maniqui.js';
import { ORDENES_DEL_MAPA } from './ordenes/mapa.js';
import type { Orden } from './ordenes/orden.js';
import { ORDENES_DE_LA_REVISION } from './ordenes/revision.js';
import { ORDENES_DE_LOS_TEMAS } from './ordenes/temas.js';
import { ORDENES_DE_LAS_VISTAS } from './ordenes/vistas.js';

/**
 * Todas las órdenes, en el orden de la ayuda. De aquí salen la ayuda y la lista del
 * «orden desconocida»: hasta el 08-11-2026 eran un `switch` y una lista escrita
 * aparte en el error, que olvidaba cinco (encoger-base, recorte, guias,
 * derivar-puentes y derivar-recinto).
 */
const ORDENES: Readonly<Record<string, Orden>> = {
  ...ORDENES_DE_LA_COLA,
  ...ORDENES_DE_ENCOLAR,
  ...ORDENES_DE_DERIVAR,
  ...ORDENES_DE_LOS_TEMAS,
  ...ORDENES_DEL_MANIQUI,
  ...ORDENES_DE_LA_REVISION,
  ...ORDENES_DE_LA_BASE,
  ...ORDENES_DEL_MAPA,
  ...ORDENES_DE_LAS_VISTAS,
  ayuda: {
    uso: `pnpm taller ayuda
    esta lista`,
    correr: () => {
      console.log(
        Object.values(ORDENES)
          .map((o) => o.uso)
          .join('\n'),
      );
    },
  },
};

const [orden = 'trabajar', ...resto] = process.argv.slice(2);
// `Object.hasOwn`: «constructor» o «toString» no son órdenes aunque el objeto los herede.
const laOrden = Object.hasOwn(ORDENES, orden) ? ORDENES[orden] : undefined;
if (laOrden === undefined)
  throw new Error(
    `orden desconocida «${orden}»: hay ${Object.keys(ORDENES).join(', ')} («pnpm taller ayuda» dice cómo se escribe cada una)`,
  );
await laOrden.correr(resto);
