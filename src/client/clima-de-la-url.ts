/**
 * `?clima=` en las tres páginas (la partida, la arena y el espectador): fuerza el
 * clima para mirarlo (`parseClima`). La partida no arranca con uno que no vale,
 * como con `?seed=` (`leerElClimaDeLaURL`, que lanza); la arena y el espectador
 * siguen sin él y lo dicen en la barra (`climaDeLaURL`), con la misma frase.
 */
import { type ClimaForzado, parseClima } from '@core/state/clima.js';
import { unaVezEnLaURL } from '@core/validar.js';

/** Lo que pide `?clima=`, `null` si nada, o lanza con lo que no se entiende (también si va repetido). */
export function leerElClimaDeLaURL(params: URLSearchParams): ClimaForzado | null {
  return parseClima(unaVezEnLaURL(params.getAll('clima'), 'clima'));
}

/** La frase que dice por qué no vale lo de `?clima=` y cómo salir. */
export function avisoDelClima(err: unknown): string {
  return `${err instanceof Error ? err.message : String(err)} — quita "?clima=…" de la barra de direcciones. `;
}

/** `?clima=` en una página que sigue sin él si no vale: lo forzado, o nada y el aviso. */
export function climaDeLaURL(params: URLSearchParams): {
  readonly forzado: ClimaForzado | null;
  readonly aviso: string;
} {
  try {
    return { forzado: leerElClimaDeLaURL(params), aviso: '' };
  } catch (err) {
    return { forzado: null, aviso: avisoDelClima(err) };
  }
}
