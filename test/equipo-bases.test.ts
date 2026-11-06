/**
 * Las bases de las piezas (18-10-2026: «una espada de herrería debería
 * poder ser una espada normal con extras, y una bendita una espada de herrería con
 * extras»): una pieza escrita sobre otra de su hueco suma lo de la base más sus
 * extras, en cadena, y el vínculo es vivo —cambiar la Espada cambia la de
 * herrería, la bendita y a quien las lleve, también a media pelea—. La suma la
 * hace solo `resolverBases` (privada de `data.ts`, lo vigila `invariantes.test.ts`).
 *
 * Escritos desde los criterios del plan (`docs/agents/2026-10-18-equipo-por-tipos-y-bases/`):
 * cada regla con su caso rechazado, con su frase.
 */

import { describe, expect, it } from 'vitest';
import {
  equiparEnArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezaNueva,
  piezasDelMontaje,
  quitarEnArena,
  VERSION_DEL_ENLACE,
} from '../src/core/arena.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { type Pieza, validarPieza } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import type { Unidad } from '../src/core/unidad.js';
import { catalogoCon, elCatalogoCon, unidadDeArena } from './helpers.js';

const ESPADA = pieza('espada');
/** La Espada cambiada en el catálogo: +3 de ataque. */
const ESPADA_MAS: Pieza = { ...ESPADA, ataque: ESPADA.ataque + 3 };

/** El guerrero con escudo, con la Espada bendita en la mano. */
const conBendita = (): Unidad =>
  equiparEnArena(unidadDeArena('templario-escudo'), 'espada_bendita', EQUIPO_DEL_JUEGO);

describe('una pieza sobre otra', () => {
  it('la rota tumba el catálogo diciendo cuál, y las que están sobre ella dicen por qué', () => {
    const nueva = piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza;
    const rota = { ...nueva, rueda: { ...nueva.rueda, fuerte: 7 } } as Pieza;
    const sobreLaRota = {
      id: 'sobre-la-rota',
      nombre: 'Sobre la rota',
      base: rota.id,
      seConsigue: [],
      extras: {},
    };
    expect(() => catalogoCon(rota, sobreLaRota)).toThrow('el nivel de Fuerte es 7: va de 0 a 6');
    // La rueda de la rota no se juzga sola: la que está sobre ella también cae.
    const sobreUnaMal = {
      id: 'arma-4',
      nombre: 'Arma 4',
      base: 'espada',
      seConsigue: [],
      extras: { rueda: { fuerte: 9 } },
    };
    expect(() =>
      catalogoCon(sobreUnaMal, {
        id: 'arma-5',
        nombre: 'Arma 5',
        base: 'arma-4',
        seConsigue: [],
        extras: {},
      }),
    ).toThrow('«Arma 5»: su base «Arma 4» no vale');
  });

  it('el enlace lleva todas las piezas de lo que lleva, con sus bases, y se reabre igual', () => {
    expect(VERSION_DEL_ENLACE).toBe(21);
    const u = conBendita();
    // El guerrero lleva la bendita, la brigantina y el escudo; con sus bases van la
    // de herrería y la Espada, tal como están en el catálogo con que pelea.
    const conLaMia = elCatalogoCon(ESPADA_MAS, { ...pieza('arco'), ataque: 9 });
    const llevadas = piezasDelMontaje([u], [], conLaMia);
    expect(llevadas.map((p) => p.id).sort()).toEqual(
      ['brigantina', 'escudo', 'espada', 'espada_bendita', 'espada_de_herreria'].sort(),
    );
    expect(llevadas.find((p) => p.id === 'espada')).toEqual(validarPieza(ESPADA_MAS));
    expect(() => piezasDelMontaje([u], [], [])).toThrow(
      'lo montado lleva la pieza «espada_bendita» y no está',
    );
    const lado = (unidad: string, ia: boolean) => ({
      ia,
      puestos: [{ unidad, escalera: false }],
      heroe: null,
    });
    const arquero = unidadDeArena('goblin-arquero');
    const ENLACE: MontajeDelEnlace = {
      unidades: [u, arquero],
      piezas: piezasDelMontaje([u, arquero], [], conLaMia),
      hechizos: [],
      izquierda: lado(u.id, false),
      derecha: lado('goblin-arquero', true),
      muralla: null,
      combate: COMBATE_COMPLETO,
    };
    const leido = montajeDeLaURL(montajeALaURL(ENLACE));
    expect(leido).toEqual(ENLACE);
    // Abierto, sus piezas entran en el catálogo de quien lo abre (`conPiezas`): la
    // bendita suma con la Espada del enlace.
    const eq = catalogoCon(...leido.piezas);
    expect(eq.pieza('espada_bendita').ataque).toBe(
      EQUIPO_DEL_JUEGO.pieza('espada_bendita').ataque + 3,
    );
    // Una del enlace sobre otra nueva que no trae, no.
    const nueva = piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza;
    const sobre = {
      id: 'sobre-la-nueva',
      nombre: 'Sobre la nueva',
      base: nueva.id,
      seConsigue: [],
      extras: {},
    };
    const eqDos = catalogoCon(nueva, sobre);
    const lleva = equiparEnArena(quitarEnArena(u, 'arma'), 'sobre-la-nueva', eqDos);
    const o = JSON.parse(
      montajeALaURL({
        ...ENLACE,
        unidades: [lleva, arquero],
        piezas: piezasDelMontaje([lleva, arquero], [], [...eqDos.escritas.values()]),
        izquierda: lado(lleva.id, false),
      }),
    );
    expect(o.piezas.map((p: { id: string }) => p.id)).toContain(nueva.id);
    expect(() =>
      montajeDeLaURL(
        JSON.stringify({ ...o, piezas: o.piezas.filter((p: { id: string }) => p.id !== nueva.id) }),
      ),
    ).toThrow(`«Sobre la nueva» toma de base «${nueva.id}», que no existe`);
    // Un enlace de la versión de antes se rechaza: hay que volver a copiarlo.
    const antes = VERSION_DEL_ENLACE - 1;
    expect(() => montajeDeLaURL(JSON.stringify({ ...o, v: antes }))).toThrow(
      `este enlace es de una versión anterior de la arena (la ${antes}; la de hoy es la ${VERSION_DEL_ENLACE}): vuelve a copiarlo`,
    );
  });
});
