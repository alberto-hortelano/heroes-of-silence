/**
 * El mundo que pide la URL (`?mundo=<id>`, F1a del mapa vivo): se lee de
 * `/mundos/<id>/` (la carpeta pública `assets/`, que en `pnpm dev` se sirve
 * entera) y se valida con la misma función que `pnpm mundo validar`
 * (`leerMundo`). Lo carga `entrada.ts` antes que `main.ts`, que lo lee ya hecho
 * (`mundoPedido`): así `main.ts` no espera nada al cargarse y un mundo roto lo
 * pinta `arranque.ts`, entero, como un catálogo roto.
 */
import { type MundoLeido, noEsJson, parseMundo } from '@core/mundo/formato.js';
import { leerMundo } from '@core/mundo/validar.js';
import { unaVezEnLaURL } from '@core/validar.js';
import { pide } from '../semilla.js';

/** Lo que trae un mundo y no puede ir con él en la URL: lo fija el mundo. */
const LO_QUE_FIJA_EL_MUNDO = ['seed', 'faccion', 'heroe'] as const;

/**
 * El id del mundo que pide la URL, o `null` si no pide ninguno. Lanza diciéndolo
 * si viene junto a lo que el mundo ya trae (la semilla, la facción y el héroe),
 * repetido o con una forma que no es la de un id.
 */
export function mundoDeLaUrl(search: string): string | null {
  const pedido = unaVezEnLaURL(new URLSearchParams(search).getAll('mundo'), 'mundo');
  if (!pide(search, 'mundo')) return null;
  const juntos = LO_QUE_FIJA_EL_MUNDO.filter((p) => pide(search, p));
  if (juntos.length > 0) {
    throw new Error(
      `«?mundo=» no va con ${juntos.map((p) => `«?${p}=»`).join(' ni ')}: el mundo trae su semilla, su facción y su héroe. Quita ${juntos.length === 1 ? 'ese parámetro' : 'esos parámetros'} de la barra de direcciones`,
    );
  }
  return parseMundo(pedido);
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
  const texto = await r.text();
  try {
    return JSON.parse(texto);
  } catch (err) {
    throw new Error(`el mundo "${id}" no se puede cargar: ${noEsJson(fichero, err)}`);
  }
}

let pedido: MundoLeido | null = null;

/**
 * Carga y valida el mundo que pide la URL, si pide alguno. Lanza con todos sus problemas.
 * La biblia no se pide: el juego no la lee; la exigen `pnpm mundo validar` y el servidor que genera.
 */
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
