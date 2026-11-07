/**
 * Lo que la arena pide y manda al servidor de desarrollo (`vite.config.ts`, `/__arena/…`): el
 * catálogo y las formas de muralla, con las mismas frases para decir por qué no se puede guardar.
 * Era parte de `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import type { EstadoDeLaVista } from './pagina.js';

/** Una forma de muralla que no vale: su nombre, si lo trae, y por qué. */
interface SinValidar {
  readonly nombre?: string | null;
  readonly motivo: string;
}

/**
 * Lo que contesta el GET de un fichero de la arena (`/__arena/unidades`, `/__arena/murallas`):
 * en el build, solo `guardado: false`; si no, su ruta y su lista (`unidades` o
 * `formas`), las formas que no valen con su motivo, o el archivo ilegible.
 */
export interface RespuestaDeBorrador {
  readonly guardado: boolean;
  readonly ruta?: string;
  readonly unidades?: unknown;
  readonly formas?: unknown;
  /** Las formas de muralla que no valen: el catálogo de unidades no se lee a medias. */
  readonly invalidas?: readonly SinValidar[];
  readonly ilegible?: string;
  /** El catálogo de equipo, que va con las unidades (`leerCatalogo`). */
  readonly piezas?: unknown;
  /** La versión en disco de lo leído (`versionDelCatalogo`): se devuelve al guardar. */
  readonly version?: unknown;
  /** El cuerpo de todo héroe de data/heroe.json, que va con las unidades (`leerCatalogo`). */
  readonly heroe?: unknown;
  /** Los hechizos de data/hechizos.json, que van con las unidades (`leerCatalogo`). */
  readonly hechizos?: unknown;
}

/**
 * Pide un fichero de la arena al servidor de desarrollo. Devuelve la respuesta y, si no se
 * podrá guardar —sin servidor o con el archivo ilegible—, por qué. Los dos
 * borradores lo dicen con las mismas frases.
 */
export async function leerDelServidor(
  url: string,
  que: string,
): Promise<{ readonly cuerpo: RespuestaDeBorrador; readonly sinGuardado: string | null }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se ha podido leer ${que} (${r.status})`);
  const cuerpo = (await r.json()) as RespuestaDeBorrador;
  const sinGuardado = !cuerpo.guardado
    ? 'esta página no la sirve el servidor de desarrollo. Ábrela con pnpm arena'
    : cuerpo.ilegible !== undefined
      ? `${cuerpo.ruta} no se puede leer (${cuerpo.ilegible}), y guardar lo pisaría. Arréglalo o bórralo a mano`
      : null;
  return { cuerpo, sinGuardado };
}

/** Lo que se dice si no sale: antes de mandar (`noSePuede`) o si el servidor lo rechaza (`noSeHa`). */
export interface FalloAlGuardar {
  readonly noSePuede: string;
  readonly noSeHa: string;
}

/**
 * Manda un fichero de la arena entero al servidor. Devuelve su respuesta si lo ha escrito;
 * si no, deja dicho por qué en `aviso` y devuelve `null`.
 */
export async function mandarAlServidor(
  vista: EstadoDeLaVista,
  url: string,
  cuerpo: unknown,
  sinGuardadoAhora: string | null,
  fallo: FalloAlGuardar,
): Promise<Record<string, unknown> | null> {
  if (sinGuardadoAhora !== null) {
    vista.aviso = `${fallo.noSePuede}: ${sinGuardadoAhora}.`;
    return null;
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const respuesta = (await r.json()) as Record<string, unknown>;
  if (!r.ok) {
    vista.aviso = `${fallo.noSeHa}: ${String(respuesta.error ?? r.status)}.`;
    return null;
  }
  return respuesta;
}
