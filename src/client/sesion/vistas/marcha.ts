/**
 * Lo que se ve mientras el héroe anda su marcha por el mapa (06-11-2026, QA de la
 * marcha: «la llegada se ve antes de llegar»). El núcleo mueve al héroe de una vez
 * y lo descubre todo al instante; el mapa lo enseña andando (`Session.marchaEnCurso`),
 * y lo que se pinta mientras es **lo de antes de andar**, salvo la niebla, que va
 * con él: cada región se descubre cuando pisa la casilla que la descubre
 * (`regionesQueDescubre`, la regla del núcleo) y lo que se mira AHORA es el
 * cuadrado de sus pasos (`HERO_SCOUT_RADIUS`) con el de todo lo demás que ya
 * miraba. Así el héroe nunca anda bajo el negro de una región que aún no se ve, y
 * lo de más allá no se destapa antes de que llegue a ello. Los objetos, como se
 * sabían al salir (`Session.loConocidoEnLaMarcha`), y el movimiento del panel, el
 * de antes (`Session.movimientoALaVista`). Al llegar manda otra vez el estado.
 *
 * Es presentación: no escribe nada del estado, solo lee el mapa.
 */
import { Casillas, type CasillasLeidas } from '@core/map/casillas.js';
import type { Mirada } from '@core/map/map.js';
import { regionesQueDescubre, zonaDeNiebla } from '@core/map/niebla.js';
import type { MapaDeRed } from '@core/map/regiones.js';
import type { Point } from '@core/types.js';

/** Lo que se veía al salir: lo explorado y desde dónde se miraba sin el héroe que anda. */
export interface NieblaDeAntes {
  readonly explorado: CasillasLeidas;
  /** Las miradas de quien juega (`miradasDe`) sin la del héroe que anda. */
  readonly miradas: readonly Mirada[];
  /** Hasta dónde mira el héroe que anda (`HERO_SCOUT_RADIUS`). */
  readonly radio: number;
}

/** La niebla que se pinta con el héroe en la casilla `pisada` de su marcha. */
export interface NieblaDeLaMarcha {
  readonly pisada: number;
  readonly explorado: CasillasLeidas;
  readonly visibles: CasillasLeidas;
}

/**
 * La niebla con el héroe en `pasos[pisada]`: lo explorado al salir más las regiones
 * que descubren sus casillas hasta ella, y lo que se mira, el cuadrado de cada
 * mirada de antes y el suyo desde ella, sobre eso (`visibleNow`, con su casilla de
 * ahora). `anterior`, la de la casilla de antes: si lo explorado no crece, se
 * devuelve el mismo objeto, y quien guarda lo pintado por él (la máscara de la
 * niebla, el fondo del minimapa) no lo rehace.
 */
export function nieblaDeLaMarcha(
  map: MapaDeRed,
  antes: NieblaDeAntes,
  pasos: readonly Point[],
  pisada: number,
  anterior: NieblaDeLaMarcha | null,
): NieblaDeLaMarcha {
  const hasta = Math.max(0, Math.min(pisada, pasos.length - 1));
  const nuevo = Casillas.deIndices(map, antes.explorado.indices());
  for (let i = 0; i <= hasta; i++)
    for (const k of regionesQueDescubre(map, pasos[i] as Point))
      nuevo.marcarIndices(zonaDeNiebla(map, k));
  const explorado =
    anterior !== null && anterior.explorado.size === nuevo.size ? anterior.explorado : nuevo;
  const visibles = Casillas.vacias(map);
  for (const { centro, radio } of antes.miradas)
    visibles.marcarCuadradoDentroDe(centro, radio, explorado);
  visibles.marcarCuadradoDentroDe(pasos[hasta] as Point, antes.radio, explorado);
  return { pisada: hasta, explorado, visibles };
}
