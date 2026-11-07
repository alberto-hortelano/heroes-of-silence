/**
 * La morada de la base en escena (`MoradaEnPantalla`): en cuál se está, a quién se mira y
 * lo que se ve (`sesion/vistas/morada.ts`), guardado mientras no cambie nada que se vea.
 * Entrar, salir y elegir mueven la escena y la barra de la sesión. Era parte de `Session`
 * (`sesion/partida.ts`) hasta R6 de la reorganización (07-11-2026); la sesión delega en
 * ella. Reclutar no es suyo, es de la base (`Session.recruit`): la vista lee lo que se
 * puede reclutar por el dueño (`reclutamiento`).
 */
import { dueñoDeLaCiudad } from '@core/state/sitios.js';
import type { SitioId } from '@core/town/sitios.js';
import type { Town } from '@core/town/town.js';
import { AYUDA_DE_LA_BASE, AYUDA_DE_LA_MORADA } from '../../comun/dichos.js';
import {
  componerVistaDeLaMorada,
  type ReclutamientoDe,
  type VistaDeLaMorada,
} from '../vistas/morada.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** La morada de la base abierta en que se está y a quién se mira (`null`: la primera que produce). */
interface MoradaAbierta {
  readonly sitio: SitioId;
  readonly elegida: string | null;
}

/** Lo que la pieza de la morada lee de la sesión. */
interface DueñoDeLaMorada
  extends Pick<
    DueñoDeLasPiezas,
    'estado' | 'version' | 'tocar' | 'barra' | 'escena' | 'irA' | 'baseAbierta'
  > {
  /**
   * Lo que se puede reclutar de una unidad en la base abierta: lo que hay, cabe y se paga,
   * y por qué no ni uno (`Session.recruitPlan` y `Session.motivoParaNoReclutar`).
   */
  readonly reclutamiento: ReclutamientoDe;
}

export class MoradaEnPantalla {
  /**
   * Dónde se está y a quién se mira en la morada (`elegida`: `null`, la primera).
   * Vale solo con la escena en `'morada'`, que es la que manda: no se suelta al
   * salir, se sustituye al entrar.
   */
  private abierta: MoradaAbierta = { sitio: 'lvl1', elegida: null };
  private cache: {
    readonly version: number;
    readonly abierta: MoradaAbierta;
    readonly vista: VistaDeLaMorada;
  } | null = null;

  constructor(private readonly dueño: DueñoDeLaMorada) {}

  /**
   * Entra en la morada levantada en `sitio` de la base abierta, con su primera
   * unidad elegida. Lo llama la base al llegar a su puerta (`EscenaBase`). Lanza,
   * diciéndolo, fuera de la base o si en ese sitio no hay una morada construida
   * (lo dice la vista, `componerVistaDeLaMorada`, que se compone antes de cambiar
   * de escena). La base sigue abierta debajo (`openTownId` no cambia), así que
   * reclutar va por las acciones de siempre y volver la encuentra como estaba.
   */
  abrir(sitio: SitioId): void {
    const town = this.dueño.baseAbierta();
    if (this.dueño.escena() !== 'town' || town === null) {
      throw new Error('no se puede entrar en la morada: no hay ninguna base abierta');
    }
    this.enLaMorada(town, { sitio, elegida: null });
    this.dueño.irA('morada');
    this.dueño.barra(AYUDA_DE_LA_MORADA);
  }

  /** Vuelve de la morada a la base, que sigue abierta. */
  cerrar(): void {
    if (this.dueño.escena() !== 'morada') {
      throw new Error('no se puede salir de la morada: no se está en ninguna');
    }
    this.dueño.irA('town');
    this.dueño.barra(AYUDA_DE_LA_BASE);
  }

  /**
   * Elegir una unidad de la morada (un clic en su figura o en su botón del
   * panel). Una que no es de esta morada lanza (la vista lo dice).
   */
  elegir(id: string): void {
    const m = this.abierta;
    const town = this.dueño.baseAbierta();
    if (this.dueño.escena() !== 'morada' || town === null) {
      throw new Error('no se puede elegir en la morada: no se está en ninguna');
    }
    this.dueño.tocar();
    this.enLaMorada(town, { sitio: m.sitio, elegida: id });
  }

  /**
   * Lo que se ve en la escena de la morada (`sesion/vistas/morada.ts`), o `null` fuera de
   * ella. Se rehace cuando cambia algo que se ve (`version`: reclutar, el oro) o
   * a quién se mira, no en cada fotograma.
   */
  vista(): VistaDeLaMorada | null {
    const town = this.dueño.baseAbierta();
    if (this.dueño.escena() !== 'morada' || town === null) return null;
    const c = this.cache;
    if (c === null || c.version !== this.dueño.version() || c.abierta !== this.abierta) {
      this.enLaMorada(town, this.abierta);
    }
    return this.cache!.vista;
  }

  /** Compone la vista de `m` (lanza si no vale) y solo entonces la deja abierta. */
  private enLaMorada(town: Town, m: MoradaAbierta): void {
    const vista = componerVistaDeLaMorada(
      town,
      dueñoDeLaCiudad(this.dueño.estado(), town),
      m.sitio,
      m.elegida,
      this.dueño.reclutamiento,
    );
    this.abierta = m;
    this.cache = { version: this.dueño.version(), abierta: m, vista };
  }
}
