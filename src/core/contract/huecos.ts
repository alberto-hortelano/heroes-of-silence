/**
 * Los huecos de equipo en el contrato del agente: **en inglés**, como el resto de
 * sus claves (decisión del usuario, 12-10-2026: «los cuatro huecos van en inglés
 * en el contrato del agente ya»). Por dentro —el núcleo, la crónica, el cable del
 * espectador— siguen en español (`HUECOS`), y **esta es la única traducción**:
 * la leen las claves de `equipment`, el `slot` de la armería, la prosa del
 * contrato y la entrada de `unequip.slot` (`accionDelAgente`, en el director).
 * `test/invariantes.test.ts` vigila que los cuatro literales ingleses no se
 * escriban en ningún otro sitio.
 */
import type { AdventureAction } from '../state/game.js';
import { HUECOS, type Hueco, huecoDesconocido } from '../types.js';

/** Cómo se llama cada hueco en el contrato. */
export const SLOT_DE_HUECO: Readonly<Record<Hueco, 'weapon' | 'armor' | 'accessory' | 'shield'>> = {
  arma: 'weapon',
  armadura: 'armor',
  accesorio: 'accessory',
  escudo: 'shield',
};

/** Los cuatro, en el orden de `HUECOS`: lo que se le ofrece al agente. */
export const SLOTS: readonly string[] = HUECOS.map((h) => SLOT_DE_HUECO[h]);

/**
 * El hueco de un `slot` del agente, o excepción con los que valen. Lanza y no
 * devuelve `null`: quien la llama (`accionDelAgente`) está dentro del `try` del
 * director, que descarta esa acción con este motivo y sigue con las demás.
 */
export function huecoDelSlot(slot: string): Hueco {
  const hueco = HUECOS.find((h) => SLOT_DE_HUECO[h] === slot);
  if (hueco === undefined) {
    throw new Error(huecoDesconocido(slot, SLOTS));
  }
  return hueco;
}

/**
 * Una acción de aventura tal como la escribe el agente: la del núcleo, salvo el
 * `slot` de `unequip`, que llega en inglés y como texto. Texto y no un `z.enum`
 * en el esquema: un hueco mal escrito descarta ESA acción con su motivo
 * (`huecoDelSlot`, dentro del `try` del director), no el turno entero.
 */
export type AccionDelAgente =
  | Exclude<AdventureAction, { readonly type: 'unequip' }>
  | (Omit<Extract<AdventureAction, { readonly type: 'unequip' }>, 'slot'> & {
      readonly slot: string;
    });

/**
 * La acción del agente tal como la juega el núcleo: hoy solo cambia el `slot` de
 * `unequip`, del inglés del contrato al hueco de dentro. Lo demás pasa tal cual.
 */
export function accionDelAgente(a: AccionDelAgente): AdventureAction {
  return a.type === 'unequip' ? { ...a, slot: huecoDelSlot(a.slot) } : a;
}
