/**
 * Lo que el taller está haciendo con una figura del banco de NPC, **leído de la cola en
 * disco** (`tools/taller/cola/`): sus encargos se llaman `npc-<id>-…`, y si alguno está
 * pendiente o en curso, el taller la está pintando; si no, y alguno falló, se quedó a
 * medias. Nada de esto se escribe: se deriva, como si está pintada (`estadoDeFigura`).
 *
 * Aparte de `tools/taller/npcs.ts` porque lo lee `/__npcs` (`banco.ts`, que carga vite al
 * arrancar `pnpm dev` y el build): aquel trae el estilo de cada facción y, con él, el
 * taller entero. Esto solo trae la cola.
 *
 * **El reintento** (QA del banco de NPC, H2, 22-10-2026: «se encadena sola» y «llegan
 * después»): un encargo de una figura que falla se vuelve a encolar solo hasta
 * `REINTENTOS_DE_NPC` veces, contadas en su ficha (`Ficha.fallos`), no en la memoria de un
 * trabajador; lo hacen el trabajador al fallar (`trabajador.ts`) y `pnpm npcs trabajar`
 * al arrancar (`rescatar`, `tools/taller/npcs.ts`). Pasado el tope queda fallido, y el
 * estado lo dice con la orden que lo arregla.
 */
import { type Cola, colaDelTaller, type Ficha } from '../taller/cola.js';

/** Los encargos de NPC llevan este prefijo: `pnpm npcs trabajar` toma solo esos. */
export const PREFIJO_DE_NPC = 'npc-';
export const esEncargoDeNpc = (id: string): boolean => id.startsWith(PREFIJO_DE_NPC);
/** El principio del id de todo encargo de la figura `id`: `npc-<id>-…`. */
export const prefijoDeLaFigura = (id: string): string => `${PREFIJO_DE_NPC}${id}-`;

/**
 * Cuántas veces se vuelve a pedir solo un encargo de una figura que falla: tres intentos
 * en todo. Pocos, porque cada uno es una imagen de Codex; los fallos de verdad (un
 * recorte que se come la figura, una figura que toca el borde de su celda) salen al azar
 * de lo que pinta, y otra tirada suele pasar.
 */
export const REINTENTOS_DE_NPC = 2;

/** Cuántas veces se ha reintentado ya un encargo: los fallos que lleva su ficha. */
export const reintentosGastados = (ficha: Ficha): number => ficha.fallos?.length ?? 0;
/** Si a un encargo fallido le queda algún reintento automático. */
export const quedanReintentos = (ficha: Ficha): boolean =>
  reintentosGastados(ficha) < REINTENTOS_DE_NPC;

/**
 * Si a `id`, que acaba de fallar en `cola`, le queda un reintento, lo vuelve a encolar
 * llevando la cuenta (`Cola.reintentar`) y devuelve cuál es (1 o 2); si no, `null` y
 * queda fallido. Solo para los encargos de NPC: el resto del taller no se reintenta solo.
 */
export async function reintentarSiQueda(cola: Cola, id: string): Promise<number | null> {
  if (!esEncargoDeNpc(id)) return null;
  const ficha = await cola.leer('fallido', id);
  if (!quedanReintentos(ficha)) return null;
  await cola.reintentar(id);
  return reintentosGastados(ficha) + 1;
}

/** Lo que hace el taller con una figura que aún no está pintada. */
export type EnElTaller =
  /** Algo suyo está pendiente o en curso. */
  | { readonly que: 'pintando' }
  /** Nada suyo vivo y un encargo fallido: `reintentos`, los que ya gastó. */
  | {
      readonly que: 'fallo';
      readonly encargo: string;
      readonly motivo: string;
      readonly reintentos: number;
    }
  /** Nada suyo en la cola: pedida en otro clon, o la cola se borró. */
  | { readonly que: 'nada' };

/**
 * Una foto de la cola de `raiz` **ahora** (síncrona, como el arte que mira `/__npcs`), y
 * lo que hace el taller con cada figura en ella. Se lee la cola una vez y se pregunta
 * por cada figura.
 */
export function fotoDelTaller(raiz: string): (id: string) => EnElTaller {
  const cola = colaDelTaller(raiz);
  const vivos = [...cola.idsAhora('pendiente'), ...cola.idsAhora('en-curso')];
  const fallidos = cola.idsAhora('fallido');
  return (id) => {
    const suyo = (i: string): boolean => i.startsWith(prefijoDeLaFigura(id));
    if (vivos.some(suyo)) return { que: 'pintando' };
    for (const encargo of fallidos.filter(suyo)) {
      const ficha = cola.leerAhora('fallido', encargo);
      if (ficha === undefined) continue; // un trabajador lo acaba de reintentar
      return {
        que: 'fallo',
        encargo,
        motivo: ficha.resultado?.motivo ?? 'sin motivo apuntado',
        reintentos: reintentosGastados(ficha),
      };
    }
    return { que: 'nada' };
  };
}

/** Lo que se dice de una figura sin pintar según el taller: si se espera o hay que intervenir. */
export function fraseDelTaller(id: string, e: EnElTaller): string {
  switch (e.que) {
    case 'pintando':
      return 'el taller la está pintando';
    case 'fallo': {
      const quedan = REINTENTOS_DE_NPC - e.reintentos;
      return `se quedó a medias: falló ${e.encargo} (${e.motivo}); ${
        quedan > 0
          ? `se reintenta sola al arrancar \`pnpm npcs trabajar\` (le quedan ${quedan} reintentos), o ya con \`pnpm npcs encolar ${id}\``
          : `agotó sus ${REINTENTOS_DE_NPC} reintentos: se reintenta con \`pnpm npcs encolar ${id}\``
      }`;
    }
    case 'nada':
      return `no hay nada suyo en la cola del taller (pedida en otro clon, o la cola se borró): se encola con \`pnpm npcs encolar ${id}\``;
  }
}
