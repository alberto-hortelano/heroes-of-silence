/**
 * El ayuntamiento de la base en escena (`AyuntamientoEnPantalla`): a qué candidato se mira,
 * lo que se ve (`sesion/vistas/ayuntamiento.ts`), guardado mientras no cambie nada que se
 * vea, y contratar (`hire_hero`), que es también elegir y pagar el héroe de salida. Entrar,
 * salir y contratar mueven la escena, la barra y el héroe elegido de la sesión. Era parte
 * de `Session` (`sesion/partida.ts`) hasta R6 de la reorganización (07-11-2026); la sesión
 * delega en ella.
 */
import { applyAdventureAction } from '@core/state/game.js';
import { candidatosAHeroe } from '@core/state/heroes.js';
import { dueñoDeLaCiudad } from '@core/state/sitios.js';
import type { Town } from '@core/town/town.js';
import type { Hero } from '@core/types.js';
import {
  AYUDA_DE_LA_BASE,
  AYUDA_DE_LA_SALIDA,
  AYUDA_DEL_AYUNTAMIENTO,
} from '../../comun/dichos.js';
import { componerVistaDelAyuntamiento, type VistaDelAyuntamiento } from '../vistas/ayuntamiento.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Lo que la pieza del ayuntamiento lee de la sesión. */
interface DueñoDelAyuntamiento
  extends Pick<
    DueñoDeLasPiezas,
    | 'estado'
    | 'ctx'
    | 'viewer'
    | 'version'
    | 'tocar'
    | 'barra'
    | 'escena'
    | 'irA'
    | 'run'
    | 'turnoAjeno'
    | 'seleccionarHeroe'
    | 'idDeLaBaseAbierta'
    | 'baseAbierta'
  > {
  /** Si la persona tiene aún por elegir su héroe de salida (`Session.heroeDeSalidaPendiente`). */
  heroeDeSalidaPendiente(): boolean;
  /** El héroe propio que está en la base abierta (`Session.heroeEnLaBase`), o `null`. */
  heroeEnLaBase(): Hero | null;
}

export class AyuntamientoEnPantalla {
  /** El tipo elegido en el ayuntamiento (`null`: el primero). Lo sustituye cada entrada. */
  private elegido: string | null = null;
  private cache: {
    readonly version: number;
    readonly vista: VistaDelAyuntamiento;
  } | null = null;

  constructor(private readonly dueño: DueñoDelAyuntamiento) {}

  /**
   * Entra en la escena del ayuntamiento de la base abierta, con el primer
   * candidato elegido: el héroe de salida si está pendiente, o uno que contratar
   * («Contratar héroe» del panel de la base, D3). Lanza, diciéndolo, fuera de la
   * base o si no se puede componer (sin ayuntamiento), sin cambiar nada. La base
   * sigue abierta debajo, como con la morada.
   */
  abrir(): void {
    const town = this.dueño.baseAbierta();
    if (this.dueño.escena() !== 'town' || town === null) {
      throw new Error('no se puede entrar en el ayuntamiento: no hay ninguna base abierta');
    }
    // Se compone antes de cambiar nada (si lanza, se sigue en la base) y se guarda
    // con la versión de después: entrar no la compone otra vez.
    const vista = this.componer(town, null);
    this.elegido = null;
    this.dueño.irA('ayuntamiento');
    this.dueño.barra(
      this.dueño.heroeDeSalidaPendiente() ? AYUDA_DE_LA_SALIDA : AYUDA_DEL_AYUNTAMIENTO,
    );
    this.cache = { version: this.dueño.version(), vista };
  }

  /**
   * Vuelve del ayuntamiento a la base, que sigue abierta: también con el de
   * salida pendiente (no se encierra a nadie; lo demás sale apagado con su motivo).
   */
  cerrar(): void {
    if (this.dueño.escena() !== 'ayuntamiento') {
      throw new Error('no se puede salir del ayuntamiento: no se está en él');
    }
    this.dueño.irA('town');
    this.dueño.barra(AYUDA_DE_LA_BASE);
  }

  /** Elegir un candidato (un clic en su figura o en su botón del panel). Uno que no lo es lanza. */
  elegir(tipo: string): void {
    const town = this.dueño.baseAbierta();
    if (this.dueño.escena() !== 'ayuntamiento' || town === null) {
      throw new Error('no se puede elegir en el ayuntamiento: no se está en él');
    }
    // Compuesta primero: un tipo que no vale lanza sin dejarlo elegido.
    const vista = this.componer(town, tipo);
    this.elegido = tipo;
    this.dueño.tocar();
    this.cache = { version: this.dueño.version(), vista };
  }

  /**
   * Lo que se ve en la escena del ayuntamiento (`sesion/vistas/ayuntamiento.ts`), o `null`
   * fuera de ella. Se rehace cuando cambia algo que se ve (`version`: el oro, el
   * turno, a quién se mira).
   */
  vista(): VistaDelAyuntamiento | null {
    const town = this.dueño.baseAbierta();
    if (this.dueño.escena() !== 'ayuntamiento' || town === null) return null;
    const c = this.cache;
    if (c !== null && c.version === this.dueño.version()) return c.vista;
    const vista = this.componer(town, this.elegido);
    this.cache = { version: this.dueño.version(), vista };
    return vista;
  }

  /**
   * Contrata en la base abierta un héroe del tipo `tipo` (sin él, el de por
   * defecto), o elige y paga el de salida si está pendiente: la misma acción
   * (`hire_hero`), la misma regla. Si sale bien, vuelve del ayuntamiento a la base
   * con el héroe nuevo elegido, que es quien camina en ella.
   */
  contratar(tipo?: string): void {
    if (this.dueño.idDeLaBaseAbierta() === null) return;
    // Solo espera al turno: con el de salida pendiente, contratar es elegirlo.
    const bien = this.dueño.run(
      () =>
        applyAdventureAction(
          this.dueño.estado(),
          {
            type: 'hire_hero',
            town: this.dueño.idDeLaBaseAbierta() as string,
            ...(tipo === undefined ? {} : { tipo }),
          },
          this.dueño.ctx(),
          this.dueño.viewer(),
        ),
      this.dueño.turnoAjeno(),
    );
    if (!bien) return;
    if (this.dueño.escena() === 'ayuntamiento') this.cerrar();
    const nuevo = this.dueño.heroeEnLaBase();
    if (nuevo !== null) {
      this.dueño.seleccionarHeroe(nuevo.id);
      this.dueño.barra(`${nuevo.name} se une a ti.`);
    }
  }

  /**
   * La vista con `elegido`; lanza si no vale. Contratar solo espera al turno: lo
   * demás de no poder jugar (el de salida pendiente) es justo lo que se elige aquí.
   */
  private componer(town: Town, elegido: string | null): VistaDelAyuntamiento {
    return componerVistaDelAyuntamiento(
      town,
      dueñoDeLaCiudad(this.dueño.estado(), town),
      candidatosAHeroe(this.dueño.estado(), this.dueño.viewer(), town.id),
      elegido,
      this.dueño.turnoAjeno(),
    );
  }
}
