/**
 * El mundo que pide la URL (`?mundo=<id>`, F1a del mapa vivo): se lee de
 * `/mundos/<id>/` (la carpeta pública `assets/`, que en `pnpm dev` se sirve
 * entera) y se valida con la misma función que `pnpm mundo validar`
 * (`leerMundo`). Lo carga `entrada.ts` antes que `main.ts`, que lo lee ya hecho
 * (`mundoPedido`): así `main.ts` no espera nada al cargarse y un mundo roto lo
 * pinta `arranque.ts`, entero, como un catálogo roto.
 */
import type { MundoLeido } from '@core/mundo/formato.js';
import { esIdDeMundo } from '@core/mundo/formato.js';
import { leerMundo } from '@core/mundo/validar.js';
import { unaVezEnLaURL } from '@core/validar.js';

/** Lo que trae un mundo y no puede ir con él en la URL: lo fija el mundo. */
const LO_QUE_FIJA_EL_MUNDO = ['seed', 'faccion', 'heroe'] as const;

/**
 * El id del mundo que pide la URL, o `null` si no pide ninguno. Lanza diciéndolo
 * si viene junto a lo que el mundo ya trae (la semilla, la facción y el héroe),
 * repetido o con una forma que no es la de un id.
 */
export function mundoDeLaUrl(search: string): string | null {
  const q = new URLSearchParams(search);
  const id = unaVezEnLaURL(q.getAll('mundo'), 'mundo');
  if (id === null || id.trim() === '') return null;
  const juntos = LO_QUE_FIJA_EL_MUNDO.filter((p) => q.getAll(p).some((v) => v.trim() !== ''));
  if (juntos.length > 0) {
    throw new Error(
      `«?mundo=» no va con ${juntos.map((p) => `«?${p}=»`).join(' ni ')}: el mundo trae su semilla, su facción y su héroe. Quita ${juntos.length === 1 ? 'ese parámetro' : 'esos parámetros'} de la barra de direcciones`,
    );
  }
  if (!esIdDeMundo(id)) {
    throw new Error(`"${id}" no es el id de un mundo: minúsculas, cifras y «-», de 1 a 48`);
  }
  return id;
}

/** Un fichero del mundo, o lanza diciendo cuál falta: vite responde la página a lo que no existe. */
async function pedir(id: string, fichero: string): Promise<unknown> {
  const r = await fetch(`/mundos/${id}/${fichero}.json`);
  const esJson = (r.headers.get('content-type') ?? '').includes('json');
  if (!r.ok || !esJson) {
    throw new Error(
      `el mundo "${id}" no se puede cargar: no está ${fichero}.json en assets/mundos/${id}/${fichero === 'historia' ? ' (la escribe el motor)' : ''}`,
    );
  }
  return r.json();
}

let pedido: MundoLeido | null = null;

/** Carga y valida el mundo que pide la URL, si pide alguno. Lanza con todos sus problemas. */
export async function cargarElMundoPedido(search: string): Promise<void> {
  const id = mundoDeLaUrl(search);
  if (id === null) return;
  const [mundo, plan, historia] = await Promise.all(
    ['mundo', 'plan', 'historia'].map((f) => pedir(id, f)),
  );
  pedido = leerMundo({ mundo, plan, historia }, id);
}

/** El mundo cargado por `cargarElMundoPedido`, o `null` si la URL no pedía ninguno. */
export function mundoPedido(): MundoLeido | null {
  return pedido;
}
