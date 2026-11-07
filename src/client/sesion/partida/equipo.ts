/**
 * El equipo de los héroes en pantalla (`EquipoEnPantalla`): la pieza de la mochila que la
 * persona ha elegido para ponérsela a alguien, y lo que se hace con el equipo desde el
 * panel del héroe y la armería —ponérsela, quitar lo de un hueco, comprar—, por la puerta
 * de la sesión. Era parte de `Session` (`sesion/partida.ts`) hasta R6 de la reorganización
 * (07-11-2026); la sesión delega en ella.
 */
import { applyAdventureAction } from '@core/state/game.js';
import { esHueco, HUECOS, huecoDesconocido } from '@core/types.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Lo que la pieza del equipo lee de la sesión. */
type DueñoDelEquipo = Pick<
  DueñoDeLasPiezas,
  'estado' | 'ctx' | 'viewer' | 'tocar' | 'run' | 'heroeSeleccionado' | 'idDeLaBaseAbierta'
>;

export class EquipoEnPantalla {
  /** La pieza elegida tal como se eligió, siga o no en la mochila (`elegida` lo mira). */
  private piezaElegida: string | null = null;

  constructor(private readonly dueño: DueñoDelEquipo) {}

  /**
   * La pieza de la mochila que la persona ha elegido para ponérsela a alguien,
   * o `null`. Es estado de vista, como el hechizo elegido: lo leen el panel del
   * héroe —que enseña «Equipar» donde se puede— y el clic que la pone.
   */
  get elegida(): string | null {
    // Se pregunta al leer y no se apunta al cambiar: la pieza puede dejar la
    // mochila por más caminos que un clic —el héroe muere, se la pone otro
    // panel, la licencia…— y cada uno tendría que acordarse de soltarla.
    const item = this.piezaElegida;
    if (item === null) return null;
    return this.dueño.heroeSeleccionado()?.mochila.includes(item) === true ? item : null;
  }

  /** Elegir una pieza de la mochila del héroe elegido; elegir la misma otra vez la suelta. */
  elegir(itemId: string): void {
    this.piezaElegida = this.elegida === itemId ? null : itemId;
    this.dueño.tocar();
  }

  /**
   * Suelta la pieza elegida, sin más: la sesión, al elegir otro héroe (la pieza es de la
   * mochila de UN héroe, y con otro delante el panel le ofrecía «Ponérsela» a quien no la
   * lleva y el clic acababa en un rechazo).
   */
  soltar(): void {
    this.piezaElegida = null;
  }

  /**
   * Comprar `itemId` en la armería del castillo abierto, para la mochila del
   * héroe que está dentro. El motivo de un rechazo lo escribe el núcleo
   * (`buyBlocker`) y sale en la barra.
   */
  comprar(itemId: string): void {
    if (this.dueño.idDeLaBaseAbierta() === null) return;
    this.dueño.run(() =>
      applyAdventureAction(
        this.dueño.estado(),
        { type: 'buy_item', town: this.dueño.idDeLaBaseAbierta() as string, item: itemId },
        this.dueño.ctx(),
        this.dueño.viewer(),
      ),
    );
  }

  /**
   * Ponerle la pieza elegida al héroe (`a` vacío), a un individuo con hoja
   * (`veteran`) o al primer novato sin equipar de un tipo (`creature`). Al
   * acabar, bien o mal, la pieza deja de estar elegida.
   */
  poner(heroId: string, a: { readonly veteran?: string; readonly creature?: string } = {}): void {
    const item = this.elegida;
    if (item === null) return;
    this.dueño.run(() =>
      applyAdventureAction(
        this.dueño.estado(),
        { type: 'equip', hero: heroId, item, ...a },
        this.dueño.ctx(),
        this.dueño.viewer(),
      ),
    );
    this.piezaElegida = null;
    this.dueño.tocar();
  }

  /**
   * Quitar la pieza del hueco `slot` al héroe o al individuo `veteran`, a la
   * mochila. El hueco llega del marcado como texto: esta es su puerta al núcleo,
   * y uno que no lo es sale en la barra con su motivo.
   */
  quitar(heroId: string, slot: string, veteran?: string): void {
    this.dueño.run(() => {
      if (!esHueco(slot)) throw new Error(huecoDesconocido(slot, HUECOS));
      applyAdventureAction(
        this.dueño.estado(),
        {
          type: 'unequip',
          hero: heroId,
          slot,
          ...(veteran === undefined ? {} : { veteran }),
        },
        this.dueño.ctx(),
        this.dueño.viewer(),
      );
    });
  }
}
