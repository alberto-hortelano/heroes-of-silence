/**
 * Lo que sobra tras una batalla de la persona (`SobrantesEnPantalla`, 08-11-2026,
 * «Levantar zombi»): si lo levantado de un cadáver deja su ejército (o su guarnición)
 * por encima del límite, «Continuar» no cierra la batalla hasta que elige qué deja,
 * **justo lo que sobra** (P6). Qué sobra, qué cabe y por qué no vale lo elegido lo
 * dice el núcleo (`sobrantesTrasLaBatalla`, `dejarBlocker`); aquí, lo que se cambia
 * hasta «Seguir» y los nombres. Viene propuesto lo que dejaría la IA
 * (`loQueDejaLaIA`). Lo pinta `partida/guarnicion.ts` en `<dialog id="sobrantes">`.
 */
import type { Side } from '@core/battle/types.js';
import { nombreDelSitio } from '@core/state/sitios.js';
import {
  type Dejados,
  dejarBlocker,
  loQueDejaLaIA,
  loQueVuelve,
  type Sobrante,
  sobrantesTrasLaBatalla,
} from '@core/state/sobrantes.js';
import { unidadDelJuego } from '@core/unidad/catalogo.js';
import { comoFrase } from '../batalla/control.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Una fila del diálogo: un tipo de lo que vuelve y cuántos deja. */
interface FilaDeLoQueSobra {
  readonly creature: string;
  readonly nombre: string;
  readonly vuelven: number;
  readonly deja: number;
  /** Lo que propone la IA, para enseñarlo si se cambia. */
  readonly propuesta: number;
}

/** El diálogo de lo que sobra (`Session.sobrantes`). */
export interface VistaDeLoQueSobra {
  /** Quién vuelve: el nombre del héroe o «la guarnición de …». */
  readonly quien: string;
  readonly filas: readonly FilaDeLoQueSobra[];
  readonly tope: number;
  readonly cupo: number;
  /** Por qué no se puede seguir con lo elegido (`dejarBlocker`), o `null`. */
  readonly motivo: string | null;
}

/** Lo que la pieza lee de la sesión. */
interface DueñoDeLoQueSobra
  extends Pick<DueñoDeLasPiezas, 'estado' | 'viewer' | 'tocar' | 'barra'> {
  /** Cierra la batalla con lo dejado (`CierreDeLaBatalla.cerrar`). */
  cerrar(dejados: Dejados): void;
}

export class SobrantesEnPantalla {
  /** El bando de la persona que deja algo y cuántos de cada tipo, o `null` si no se elige nada. */
  private eligiendo: {
    readonly side: Side;
    readonly propuesta: Readonly<Record<string, number>>;
    readonly dejar: Map<string, number>;
  } | null = null;

  constructor(private readonly dueño: DueñoDeLoQueSobra) {}

  /** El sobrante de la persona en la batalla pendiente, ya terminada, o `null`. */
  private suyo(): Sobrante | null {
    const viewer = this.dueño.viewer();
    return sobrantesTrasLaBatalla(this.dueño.estado()).find((s) => s.dueño === viewer) ?? null;
  }

  /**
   * Si a la persona le sobra algo al cerrar la batalla, abre el diálogo con lo que
   * propone la IA y devuelve `true`: la batalla no se cierra hasta «Seguir». Si no,
   * `false`, y se cierra como siempre.
   */
  abrir(): boolean {
    if (this.eligiendo !== null) return true;
    const s = this.suyo();
    const pending = this.dueño.estado().pendingBattle;
    if (s === null || pending === null) return false;
    const propuesta = loQueDejaLaIA(loQueVuelve(this.dueño.estado(), pending, s.side), s);
    this.eligiendo = { side: s.side, propuesta, dejar: new Map(Object.entries(propuesta)) };
    this.dueño.barra('No cabe todo lo que vuelve de la batalla: elige qué dejas.');
    this.dueño.tocar();
    return true;
  }

  /** El diálogo, o `null` si no se elige nada. */
  get vista(): VistaDeLoQueSobra | null {
    const e = this.eligiendo;
    if (e === null) return null;
    const s = this.suyo();
    if (s === null) return null;
    const dejar = Object.fromEntries(e.dejar);
    return {
      quien:
        s.quien.kind === 'heroe'
          ? s.quien.heroe.name
          : `la guarnición de ${nombreDelSitio(s.quien.sitio)}`,
      filas: s.tropa.map((g) => ({
        creature: g.creature,
        nombre: unidadDelJuego(g.creature).name,
        vuelven: g.count,
        deja: e.dejar.get(g.creature) ?? 0,
        propuesta: e.propuesta[g.creature] ?? 0,
      })),
      tope: s.tope,
      cupo: s.cupo,
      motivo: dejarBlocker(s, dejar),
    };
  }

  /** Deja uno más (o uno menos) de `creature`, sin pasar de lo que vuelve ni bajar de 0. */
  cambiar(creature: string, cambio: 1 | -1): void {
    const e = this.eligiendo;
    const fila = this.vista?.filas.find((f) => f.creature === creature);
    if (e === null || fila === undefined) return;
    const n = fila.deja + cambio;
    if (n < 0 || n > fila.vuelven) return;
    e.dejar.set(creature, n);
    this.dueño.barra('');
    this.dueño.tocar();
  }

  /** «Como propone la IA»: vuelve a lo propuesto. */
  loDeLaIA(): void {
    const e = this.eligiendo;
    if (e === null) return;
    this.eligiendo = { ...e, dejar: new Map(Object.entries(e.propuesta)) };
    this.dueño.tocar();
  }

  /** «Seguir»: con lo elegido, si vale, se cierra la batalla; si no, la barra dice por qué. */
  confirmar(): void {
    const e = this.eligiendo;
    const v = this.vista;
    if (e === null || v === null) return;
    if (v.motivo !== null) {
      this.dueño.barra(comoFrase(v.motivo));
      return;
    }
    this.eligiendo = null;
    this.dueño.cerrar({ [e.side]: Object.fromEntries(e.dejar) });
    this.dueño.tocar();
  }
}
