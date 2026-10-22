/**
 * La dirección de una partida que abre **con el héroe de salida ya elegido**
 * (`?seed=N[&faccion=<id>]&heroe=<el de por defecto>`), la que piden las pasadas
 * del navegador que no prueban la elección (22-10-2026). Sin `?heroe=`, la página
 * abre ante el ayuntamiento, eligiéndolo (`docs/agents/2026-10-22-heroe-en-la-base/`),
 * y una pasada que espera la base con el héroe dentro esperaría en vano.
 *
 * Es la partida de `new Session(seed, faccion)`: el héroe del tipo de por defecto,
 * pagado: el de `heroePorDefectoDeLaSemilla`, el mismo de la partida rápida.
 */
import { heroePorDefectoDeLaSemilla } from '../../src/core/state/setup.js';
import type { FactionId } from '../../src/core/types.js';

export function urlDePartida(seed: number, faccion?: FactionId): string {
  const q = new URLSearchParams({ seed: String(seed) });
  if (faccion !== undefined) q.set('faccion', faccion);
  q.set('heroe', heroePorDefectoDeLaSemilla(seed, faccion));
  return `/?${q.toString()}`;
}
