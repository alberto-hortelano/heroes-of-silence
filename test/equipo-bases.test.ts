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
  basesPosibles,
  cadenaDeBases,
  conBase,
  equiparEnArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezaNueva,
  piezaSobre,
  piezasDelMontaje,
  quitarEnArena,
  retocarEnBatalla,
  VERSION_DEL_ENLACE,
} from '../src/core/arena.js';
import type { BattleStack } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_ESCRITO, type Pieza, type PiezaConBase, validarPieza } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import { type Unidad, unidadDeCombate } from '../src/core/unidad.js';
import {
  catalogoCon,
  delBorrador,
  elCatalogoCon,
  MONTAJE,
  motivoDelCambio,
  unidadDeArena,
} from './helpers.js';
import { catalogoDe, montar } from './pelea-de-arena.js';

const ESPADA = pieza('espada');
/** La Espada cambiada en el catálogo: +3 de ataque. */
const ESPADA_MAS: Pieza = { ...ESPADA, ataque: ESPADA.ataque + 3 };

/** El guerrero con escudo, con la Espada bendita en la mano. */
const conBendita = (): Unidad =>
  equiparEnArena(unidadDeArena('templario-escudo'), 'espada_bendita', EQUIPO_DEL_JUEGO);

describe('una pieza sobre otra', () => {
  it('suma su base más sus extras, en cadena, y la ficha dice la cadena', () => {
    expect(cadenaDeBases(EQUIPO_DEL_JUEGO, 'espada_bendita').map((p) => p.nombre)).toEqual([
      'Espada',
      'Espada de herrería',
      'Espada bendita',
    ]);
    expect(cadenaDeBases(EQUIPO_DEL_JUEGO, 'espada').map((p) => p.id)).toEqual(['espada']);
    const bendita = EQUIPO_DEL_JUEGO.pieza('espada_bendita');
    expect(bendita).toMatchObject({ hueco: 'arma', ataque: ESPADA.ataque + 2 });
    expect(EQUIPO_DEL_JUEGO.escritas.get('espada_bendita')).toMatchObject({
      base: 'espada_de_herreria',
    });
    // «Nueva sobre esta»: base la elegida y sin extras, así que suma lo mismo.
    const sobre = piezaSobre(bendita, EQUIPO_DEL_JUEGO) as PiezaConBase;
    expect(sobre).toEqual({
      id: 'espada_bendita-2',
      nombre: 'Espada bendita 2',
      base: 'espada_bendita',
      seConsigue: [],
      extras: {},
    });
    const eq = catalogoCon(sobre);
    // Suma lo mismo; de dónde se consigue es suyo, y la nueva ni se vende ni cae.
    expect({
      ...eq.pieza(sobre.id),
      id: bendita.id,
      nombre: bendita.nombre,
      seConsigue: bendita.seConsigue,
    }).toEqual(bendita);
    expect(eq.pieza(sobre.id).seConsigue).toEqual([]);
    // Duplicar la de herrería copia cómo está escrita: con su base.
    expect(
      piezaNueva(EQUIPO_DEL_JUEGO.pieza('espada_de_herreria'), EQUIPO_DEL_JUEGO),
    ).toMatchObject({
      base: 'espada',
      extras: { ataque: 1, fuerza: 1, oro: 150 },
    });
  });

  it('el vínculo es vivo: cambiar la Espada cambia la de herrería, la bendita y a quien las lleva', () => {
    const eq = catalogoCon(ESPADA_MAS);
    expect(eq.pieza('espada_de_herreria').ataque).toBe(
      EQUIPO_DEL_JUEGO.pieza('espada_de_herreria').ataque + 3,
    );
    expect(eq.pieza('espada_bendita').ataque).toBe(
      EQUIPO_DEL_JUEGO.pieza('espada_bendita').ataque + 3,
    );
    // La de herrería sigue escrita igual, aunque sume otra cosa.
    expect(eq.escritas.get('espada_de_herreria')).toEqual(
      EQUIPO_DEL_JUEGO.escritas.get('espada_de_herreria'),
    );
    const u = conBendita();
    expect(unidadDeCombate(u, eq).attack).toBe(unidadDeCombate(u, EQUIPO_DEL_JUEGO).attack + 3);
    // Y la regla del cambio la juzga con quien lleva la bendita: la Espada a dos
    // manos deja al del escudo sin poder llevar la bendita.
    expect(motivoDelCambio(EQUIPO_DEL_JUEGO, elCatalogoCon({ ...ESPADA, manos: 2 }), [u])).toBe(
      `la lleva «${u.name}»: Espada bendita es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo`,
    );
    expect(motivoDelCambio(EQUIPO_DEL_JUEGO, elCatalogoCon(ESPADA_MAS), [u])).toBeNull();
  });

  it('a media pelea, cambiar la Espada cambia al que lleva la bendita, y el parte lo dice', () => {
    const b = montar(
      {
        izquierda: { unidades: [delBorrador(conBendita())], heroe: null },
        derecha: { unidades: [delBorrador(unidadDeArena('goblin-arquero'))], heroe: null },
        ...MONTAJE,
      },
      createRng(4),
    );
    const s = b.stacks.find((x) => x.body === 'templario-escudo') as BattleStack;
    const antes = s.unit.attack;
    const desde = b.log.length;
    const conMas = catalogoCon(ESPADA_MAS);
    expect(
      retocarEnBatalla(b, { kind: 'piezas', equipo: conMas }, catalogoDe(b, EQUIPO_DEL_JUEGO)),
    ).toBeNull();
    const ahora = b.stacks.find((x) => x.id === s.id) as BattleStack;
    expect(ahora.unit.attack).toBe(antes + 3);
    const bendita = EQUIPO_DEL_JUEGO.pieza('espada_bendita').ataque;
    expect(b.log.slice(desde)).toContainEqual({
      kind: 'retoque',
      nombre: 'Espada bendita',
      stacks: [s.id],
      cambios: [`ataque ${bendita} → ${bendita + 3}`, 'por su base, «Espada»'],
    });
    // Volver a la Espada de antes deja la bendita como estaba, y dice por qué base.
    expect(
      retocarEnBatalla(b, { kind: 'piezas', equipo: EQUIPO_DEL_JUEGO }, catalogoDe(b, conMas)),
    ).toBeNull();
    expect(b.log.at(-1)).toMatchObject({
      nombre: 'Espada bendita',
      cambios: [`ataque ${bendita + 3} → ${bendita}`, 'por su base, «Espada»'],
    });
    // La pelea no lleva catálogo: cada golpe dice el nombre de su arma.
    expect(b).not.toHaveProperty('piezasDeArena');
    expect(ahora.unit.armas?.arma.piezas).toEqual([
      { id: 'espada_bendita', nombre: 'Espada bendita' },
    ]);
  });

  it('cambiar de base conserva lo que suma; «ninguna» la deja entera con lo mismo', () => {
    const escrita = EQUIPO_DEL_JUEGO.escritas.get('espada_bendita') as PiezaConBase;
    const final = EQUIPO_DEL_JUEGO.pieza('espada_bendita');
    const sobreLaEspada = conBase(escrita, 'espada', EQUIPO_DEL_JUEGO) as PiezaConBase;
    expect(sobreLaEspada).toEqual({
      id: 'espada_bendita',
      nombre: 'Espada bendita',
      base: 'espada',
      seConsigue: ['botin'],
      // La rueda, en niveles: la bendita (4/4/3/4/4/3) sobre la Espada (todo a 3).
      extras: {
        ataque: 2,
        fuerza: 1,
        rueda: { ofensivo: 1, fuerte: 1, defensivo: 1, rapido: 1 },
        oro: 450,
      },
    });
    expect(catalogoCon(sobreLaEspada).pieza('espada_bendita')).toEqual(final);
    const entera = conBase(escrita, null, EQUIPO_DEL_JUEGO);
    expect(entera).toEqual(final);
    // Y volver a la de herrería la deja como estaba.
    const vuelta = conBase(sobreLaEspada, 'espada_de_herreria', catalogoCon(sobreLaEspada));
    expect(vuelta).toEqual(escrita);
  });

  it('no vale, con su motivo: base que no existe, de otro hueco, ni dar la vuelta', () => {
    const sobre = (base: string): PiezaConBase => ({
      id: 'sable',
      nombre: 'Sable',
      base,
      seConsigue: [],
      extras: { ataque: 1 },
    });
    expect(() => catalogoCon(sobre('nada'))).toThrow('«Sable» toma de base «nada», que no existe');
    // La Espada sobre la bendita: Espada → bendita → herrería → Espada.
    const vuelta = {
      id: 'espada',
      nombre: 'Espada',
      base: 'espada_bendita',
      seConsigue: [],
      extras: {},
    };
    expect(() => catalogoCon(vuelta)).toThrow('sus bases dan la vuelta');
    expect(() => validarPieza({ ...sobre('sable') })).toThrow('no puede ser su propia base');
    // El desplegable de la ficha y `conBase` dicen lo mismo de otro hueco y de la vuelta.
    const herreria = EQUIPO_DEL_JUEGO.escritas.get('espada_de_herreria') as PiezaConBase;
    expect(() => conBase(herreria, 'arco', EQUIPO_DEL_JUEGO)).toThrow(
      '«Arco» va en Arma a distancia y «Espada de herrería» en Arma: la base es del mismo hueco',
    );
    expect(() => conBase(ESPADA, 'espada_bendita', EQUIPO_DEL_JUEGO)).toThrow(
      '«Espada»: sus bases dan la vuelta («Espada» → «Espada bendita» → «Espada de herrería» → «Espada»)',
    );
    expect(basesPosibles(EQUIPO_DEL_JUEGO, 'espada').map((p) => p.id)).not.toContain(
      'espada_bendita',
    );
    expect(basesPosibles(EQUIPO_DEL_JUEGO, 'espada_bendita').map((p) => p.id)).toEqual(
      expect.arrayContaining(['espada', 'espada_de_herreria', 'maza']),
    );
    // Con base, el hueco y las manos son los de la base: no se escriben.
    expect(() => validarPieza({ ...sobre('espada'), hueco: 'arma' })).toThrow(
      '«Sable» tiene base y escribe «hueco»',
    );
    // Y la resuelta tiene que valer: un extra de defensa en un arma.
    expect(() => catalogoCon({ ...sobre('espada'), extras: { defensa: 1 } })).toThrow(
      '«Sable» (sobre «Espada») va en el hueco arma, que no suma defensa',
    );
  });

  it('no se borra la base de otra pieza', () => {
    const a = piezaNueva('arma', EQUIPO_DEL_JUEGO);
    const b = { id: 'arma-3', nombre: 'Arma 3', base: a.id, seConsigue: [], extras: { ataque: 1 } };
    expect(motivoDelCambio(catalogoCon(a, b), elCatalogoCon(b), [])).toBe(
      `«${a.nombre}» es la base de «Arma 3»: cámbiale la base o bórrala antes`,
    );
    expect(motivoDelCambio(catalogoCon(a, b), elCatalogoCon(a), [])).toBeNull();
    // Ni la Espada, de la que cuelga la de herrería del catálogo.
    expect(
      motivoDelCambio(
        EQUIPO_DEL_JUEGO,
        EQUIPO_ESCRITO.filter((p) => p.id !== 'espada'),
        [],
      ),
    ).toBe('«Espada» es la base de «Espada de herrería»: cámbiale la base o bórrala antes');
  });

  it('la rota tumba el catálogo diciendo cuál, y las que están sobre ella dicen por qué', () => {
    const nueva = piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza;
    const rota = { ...nueva, rueda: { ...nueva.rueda, fuerte: 7 } } as Pieza;
    const sobreLaRota = {
      id: 'arma-3',
      nombre: 'Arma 3',
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
    expect(VERSION_DEL_ENLACE).toBe(17);
    const u = conBendita();
    // El guerrero lleva la bendita, la brigantina y el escudo; con sus bases van la
    // de herrería y la Espada, tal como están en el catálogo con que pelea.
    const conLaMia = elCatalogoCon(ESPADA_MAS, { ...pieza('arco'), ataque: 9 });
    const llevadas = piezasDelMontaje([u], false, conLaMia);
    expect(llevadas.map((p) => p.id).sort()).toEqual(
      ['brigantina', 'escudo', 'espada', 'espada_bendita', 'espada_de_herreria'].sort(),
    );
    expect(llevadas.find((p) => p.id === 'espada')).toEqual(validarPieza(ESPADA_MAS));
    expect(() => piezasDelMontaje([u], false, [])).toThrow(
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
      piezas: piezasDelMontaje([u, arquero], false, conLaMia),
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
    const sobre = { id: 'arma-3', nombre: 'Arma 3', base: nueva.id, seConsigue: [], extras: {} };
    const eqDos = catalogoCon(nueva, sobre);
    const lleva = equiparEnArena(quitarEnArena(u, 'arma'), 'arma-3', eqDos);
    const o = JSON.parse(
      montajeALaURL({
        ...ENLACE,
        unidades: [lleva, arquero],
        piezas: piezasDelMontaje([lleva, arquero], false, [...eqDos.escritas.values()]),
        izquierda: lado(lleva.id, false),
      }),
    );
    expect(o.piezas.map((p: { id: string }) => p.id)).toContain(nueva.id);
    expect(() =>
      montajeDeLaURL(
        JSON.stringify({ ...o, piezas: o.piezas.filter((p: { id: string }) => p.id !== nueva.id) }),
      ),
    ).toThrow(`«Arma 3» toma de base «${nueva.id}», que no existe`);
    // Un enlace de la versión de antes se rechaza: hay que volver a copiarlo.
    const antes = VERSION_DEL_ENLACE - 1;
    expect(() => montajeDeLaURL(JSON.stringify({ ...o, v: antes }))).toThrow(
      `este enlace es de una versión anterior de la arena (la ${antes}; la de hoy es la ${VERSION_DEL_ENLACE}): vuelve a copiarlo`,
    );
  });
});
