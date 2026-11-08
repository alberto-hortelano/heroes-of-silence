/**
 * El equipo del héroe de la arena (04-11-2026, petición del usuario: «no se les
 * puede cambiar el equipo y no pueden tener armadura»): empieza en el equipo base
 * de todo héroe y se cambia en su ficha con la regla del equipo de una unidad;
 * pelea con él, también si se cambia a media pelea, viaja en el enlace y nadie
 * borra una pieza que lleva puesta.
 */
import { describe, expect, it } from 'vitest';
import { type MontajeDelEnlace, montajeALaURL, montajeDeLaURL } from '../src/core/arena/enlace.js';
import { type HeroeDeArena, heroeDeArena, heroePorDefecto } from '../src/core/arena/heroe.js';
import {
  batallaDeArena,
  catalogoDelMontaje,
  type MontajeDeArena,
} from '../src/core/arena/montaje.js';
import {
  cambioDePiezas,
  equiparEnArena,
  opcionesDelHueco,
  piezasDelMontaje,
  quitarBlocker,
  quitarEnArena,
} from '../src/core/arena/piezas.js';
import { retocarEnBatalla } from '../src/core/arena/retoque.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/equipo/atado.js';
import { EQUIPO_ESCRITO } from '../src/core/equipo/pieza.js';
import { EQUIPO_BASE, HEROE } from '../src/core/hero/cuerpo-del-heroe.js';
import { hechizosDelGremio } from '../src/core/magia/catalogo.js';
import { createRng } from '../src/core/rng.js';
import { UNIDADES, unidad } from '../src/core/unidad/catalogo.js';
import { delBorrador } from './pelea-de-arena.js';

const eq = EQUIPO_DEL_JUEGO;
const izquierdo = (): HeroeDeArena => heroePorDefecto('izquierda');

describe('el equipo del héroe de la arena', () => {
  it('empieza en el equipo base de todo héroe, se le pone una coraza y pelea con ella', () => {
    expect(izquierdo().equipo).toEqual(EQUIPO_BASE);
    const conCoraza = equiparEnArena(izquierdo(), 'barda', eq);
    expect(conCoraza.equipo.armadura).toBe('barda');
    expect(armaduraDe(heroeDeArena(conCoraza, eq).cuerpo)).toBe(eq.pieza('barda').armadura);
    expect(armaduraDe(heroeDeArena(izquierdo(), eq).cuerpo)).toBe(eq.pieza('gambeson').armadura);
    // Y se le quita, como a una unidad.
    expect(quitarEnArena(conCoraza, 'armadura').equipo.armadura).toBeUndefined();
  });

  it('con la regla de una unidad: el arma no se quita y un escudo no va con un arma a dos manos', () => {
    expect(quitarBlocker(izquierdo(), 'arma', eq)).not.toBeNull();
    expect(quitarBlocker(izquierdo(), 'armadura', eq)).toBeNull();
    const conMandoble = equiparEnArena(izquierdo(), 'mandoble', eq);
    const escudo = opcionesDelHueco(conMandoble, 'escudo', eq).find((o) => o.pieza.id === 'escudo');
    expect(escudo?.motivo).toContain('dos manos');
    expect(() => equiparEnArena(conMandoble, 'escudo', eq)).toThrow('dos manos');
    // Sin arma, el héroe no se monta.
    const sinArma = { ...izquierdo(), equipo: { armadura: 'gambeson' } };
    expect(() => heroeDeArena(sinArma, eq)).toThrow(izquierdo().nombre);
  });

  it('nadie borra una pieza que lleva un héroe de un bando', () => {
    const aCaballo = equiparEnArena(izquierdo(), 'caballo_de_silla', eq);
    const sin = EQUIPO_ESCRITO.filter((p) => p.id !== 'caballo_de_silla');
    expect(cambioDePiezas(eq, sin, UNIDADES)).not.toHaveProperty('motivo');
    expect(cambioDePiezas(eq, sin, UNIDADES, [aCaballo])).toEqual({
      motivo: `la lleva «${aCaballo.nombre}»: quítasela antes de borrar «Caballo de silla»`,
    });
  });

  it('viaja en el enlace, y un héroe que no vale en él no se monta', () => {
    const h = equiparEnArena(izquierdo(), 'barda', eq);
    const m: MontajeDelEnlace = {
      unidades: [],
      piezas: piezasDelMontaje([], [h.equipo], EQUIPO_ESCRITO),
      hechizos: hechizosDelGremio(5),
      izquierda: { ia: false, puestos: [], heroe: h },
      derecha: { ia: true, puestos: [], heroe: null },
      muralla: null,
      combate: COMBATE_COMPLETO,
    };
    expect(m.piezas.map((p) => p.id)).toContain('barda');
    expect(montajeDeLaURL(montajeALaURL(m)).izquierda.heroe?.equipo).toEqual(h.equipo);
    const crudo = JSON.parse(montajeALaURL(m));
    // Sin arma (y sin la Espada entre las piezas, que si no sobraría).
    crudo.izquierda.heroe.equipo = { armadura: 'barda' };
    crudo.piezas = crudo.piezas.filter((p: { id: string }) => p.id !== 'espada');
    expect(() => montajeDeLaURL(JSON.stringify(crudo))).toThrow(
      'el héroe del bando izquierdo del enlace no vale',
    );
  });
});

describe('a media pelea, lo del héroe le llega', () => {
  const montaje: MontajeDeArena = {
    izquierda: { unidades: [delBorrador(unidad('zombi'))], heroe: izquierdo() },
    derecha: { unidades: [delBorrador(unidad('zombi'))], heroe: heroePorDefecto('derecha') },
    combate: COMBATE_COMPLETO,
    equipo: eq,
  };
  const suHeroe = (b: BattleState): BattleStack => {
    const s = b.stacks.find((x) => x.origen.kind === 'heroe' && x.side === 'attacker');
    if (s === undefined) throw new Error('sin héroe izquierdo');
    return s;
  };

  it('el equipo: la coraza, puesta y en el parte', () => {
    const b = batallaDeArena(montaje, createRng(1));
    const datos = equiparEnArena(izquierdo(), 'barda', eq);
    expect(
      retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos }, catalogoDelMontaje(montaje)),
    ).toBeNull();
    expect(armaduraDe(suHeroe(b).unit)).toBe(eq.pieza('barda').armadura);
    expect(b.log.at(-1)).toMatchObject({ kind: 'retoque', nombre: datos.nombre });
  });

  it('el cuerpo de todo héroe: antes la ficha salía igual y no cambiaba nada', () => {
    const b = batallaDeArena(montaje, createRng(1));
    const datos = { ...izquierdo(), cuerpo: { ...HEROE.combate, pv: { base: 100, porRango: 60 } } };
    expect(
      retocarEnBatalla(b, { kind: 'heroe', lado: 'izquierda', datos }, catalogoDelMontaje(montaje)),
    ).toBeNull();
    expect(suHeroe(b).unit.hp).toBe(100);
    expect(b.log.at(-1)).toMatchObject({
      kind: 'retoque',
      cambios: [`vida ${HEROE.combate.pv.base} → 100`],
    });
  });
});
