/**
 * El clima que se pinta en la partida (`ClimaEnPantalla`): el de hoy de cada región, con lo
 * que fuerce `?clima=` encima, y el del sitio de la batalla, la base o el lugar abiertos,
 * cada uno guardado mientras no cambie lo que lo cambia. Es presentación: lo forzado no
 * toca la noche que leen las reglas. Era parte de `Session` (`sesion/partida.ts`) hasta R6
 * de la reorganización (07-11-2026); la sesión delega en ella.
 */
import { climaDeLaBatalla } from '@core/state/batallas.js';
import {
  type ClimaDeLaPartida,
  type ClimaDelSitio,
  type ClimaForzado,
  climaDeLaPartida,
  climaDelSitio,
  DESPEJADO,
  forzarClima,
  validarForzado,
} from '@core/state/clima.js';
import type { PendingBattle } from '@core/state/tipos.js';
import type { Point } from '@core/types.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Lo que la pieza del clima lee de la sesión. */
interface DueñoDelClima extends Pick<DueñoDeLasPiezas, 'estado' | 'tocar' | 'baseAbierta'> {
  /** La casilla del lugar abierto (`EnElLugar.casilla`), o `null` sin lugar abierto. */
  casillaDelLugar(): Point | null;
}

export class ClimaEnPantalla {
  private forzado: ClimaForzado | null = null;
  private climaHecho: { de: ClimaDeLaPartida; clima: ClimaDeLaPartida } | null = null;
  private climaDeLaPendiente: {
    pending: PendingBattle;
    clima: ClimaDeLaPartida;
    sitio: ClimaDelSitio;
  } | null = null;

  constructor(private readonly dueño: DueñoDelClima) {}

  /**
   * Fija lo que fuerza `?clima=` (`parseClima`): lo llama `main.ts` al abrir la
   * partida, y lanza ahí mismo con una región que este mapa no tiene, diciendo
   * cuáles hay (`validarForzado`). Fuerza lo que se pinta, no la noche que leen
   * las reglas.
   */
  fijar(forzado: ClimaForzado | null): void {
    validarForzado(forzado, this.dueño.estado().map);
    this.forzado = forzado;
    this.climaHecho = null;
    this.dueño.tocar();
  }

  /**
   * El clima de hoy de cada región, con lo forzado encima: lo pintan el mapa, la
   * batalla y la base, cada fotograma. El del núcleo (`climaDeLaPartida`) se
   * rehace solo si cambia algo que lo cambie (el día, lo pedido, el dueño de una
   * región), y lo forzado encima, solo si cambia él.
   */
  get clima(): ClimaDeLaPartida {
    const de = climaDeLaPartida(this.dueño.estado());
    if (this.climaHecho?.de !== de) {
      this.climaHecho = { de, clima: forzarClima(de, this.forzado, this.dueño.estado().map) };
    }
    return this.climaHecho.clima;
  }

  /** El clima de la batalla pendiente: el de la región donde se pelea (`ControlDeBatalla`). */
  get deLaBatalla(): ClimaDelSitio {
    const pending = this.dueño.estado().pendingBattle;
    if (pending === null) return DESPEJADO;
    const clima = this.clima;
    const hecho = this.climaDeLaPendiente;
    if (hecho?.pending === pending && hecho.clima === clima) return hecho.sitio;
    const sitio = climaDeLaBatalla(this.dueño.estado(), clima, pending);
    this.climaDeLaPendiente = { pending, clima, sitio };
    return sitio;
  }

  /** El clima de la base abierta (la región de su ciudad), o `null` sin base abierta. */
  get deLaBase(): ClimaDelSitio | null {
    const town = this.dueño.baseAbierta();
    return town === null ? null : climaDelSitio(this.clima, this.dueño.estado().map, town.at);
  }

  /** El clima del lugar abierto (la región de su casilla), o `null` sin lugar abierto. */
  get delLugar(): ClimaDelSitio | null {
    const at = this.dueño.casillaDelLugar();
    return at === null ? null : climaDelSitio(this.clima, this.dueño.estado().map, at);
  }
}
