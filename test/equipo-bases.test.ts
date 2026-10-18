/**
 * Las bases de las piezas de la arena (18-10-2026: «una espada de herrería debería
 * poder ser una espada normal con extras, y una bendita una espada de herrería con
 * extras»): una pieza escrita sobre otra de su hueco suma lo de la base más sus
 * extras, en cadena, y el vínculo es vivo —cambiar la Espada cambia la de
 * herrería, la bendita y a quien las lleve, también a media pelea—. La suma la
 * hace solo `resolverBases`.
 *
 * Escritos desde los criterios del plan (`docs/agents/2026-10-18-equipo-por-tipos-y-bases/`):
 * cada regla con su caso rechazado, con su frase.
 */
import { describe, expect, it } from 'vitest';
import {
  baseCambiada,
  basesPosibles,
  batallaDeArena,
  cadenaDeBases,
  cambioDePiezaBlocker,
  catalogoDeLaArena,
  conBase,
  equiparEnArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezaNueva,
  piezaSobre,
  piezasDelEnlace,
  piezasDelMontaje,
  quitarEnArena,
  retocarEnBatalla,
  revisarBorradorDeEquipo,
  selloDePieza,
  type UnidadDeArena,
  unidadDeCombate,
  VERSION_DEL_ENLACE,
  validarPiezaDeArena,
} from '../src/core/arena.js';
import type { BattleStack } from '../src/core/battle/types.js';
import { type Pieza, type PiezaConBase, resolverBases } from '../src/core/data.js';
import { pieza } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import { DEL_JUEGO, delBorrador, MONTAJE, unidadDeArena } from './helpers.js';

const ESPADA = pieza('espada');
/** La Espada cambiada en el borrador: +3 de ataque. */
const ESPADA_MAS: Pieza = { ...ESPADA, ataque: ESPADA.ataque + 3 };

/** El guerrero con escudo, con la Espada bendita en la mano. */
const conBendita = (): UnidadDeArena =>
  equiparEnArena(unidadDeArena('templario-escudo'), 'espada_bendita', DEL_JUEGO);

describe('una pieza sobre otra', () => {
  it('suma su base más sus extras, en cadena, y la ficha dice la cadena', () => {
    expect(cadenaDeBases(DEL_JUEGO, 'espada_bendita').map((p) => p.nombre)).toEqual([
      'Espada',
      'Espada de herrería',
      'Espada bendita',
    ]);
    expect(cadenaDeBases(DEL_JUEGO, 'espada').map((p) => p.id)).toEqual(['espada']);
    const bendita = DEL_JUEGO.pieza('espada_bendita');
    expect(bendita).toMatchObject({ hueco: 'arma', calidad: 'arena', ataque: ESPADA.ataque + 2 });
    expect(DEL_JUEGO.escritas.get('espada_bendita')).toMatchObject({ base: 'espada_de_herreria' });
    // «Nueva sobre esta»: base la elegida y sin extras, así que suma lo mismo.
    const sobre = piezaSobre(bendita, DEL_JUEGO) as PiezaConBase;
    expect(sobre).toEqual({
      id: 'espada_bendita-2',
      nombre: 'Espada bendita 2',
      base: 'espada_bendita',
      extras: {},
    });
    const eq = catalogoDeLaArena([sobre]);
    expect({ ...eq.pieza(sobre.id), id: bendita.id, nombre: bendita.nombre }).toEqual(bendita);
    expect(selloDePieza(sobre)).toBe('nueva');
    // Duplicar la de herrería copia cómo está escrita: con su base.
    expect(piezaNueva(DEL_JUEGO.pieza('espada_de_herreria'), DEL_JUEGO)).toMatchObject({
      base: 'espada',
      extras: { ataque: 1, danio: [5, 5], oro: 150 },
    });
  });

  it('el vínculo es vivo: cambiar la Espada cambia la de herrería, la bendita y a quien las lleva', () => {
    const eq = catalogoDeLaArena([ESPADA_MAS]);
    expect(eq.pieza('espada_de_herreria').ataque).toBe(
      DEL_JUEGO.pieza('espada_de_herreria').ataque + 3,
    );
    expect(eq.pieza('espada_bendita').ataque).toBe(DEL_JUEGO.pieza('espada_bendita').ataque + 3);
    // La de herrería sigue «de serie»: está escrita igual, aunque sume otra cosa.
    expect(selloDePieza(eq.escritas.get('espada_de_herreria') as PiezaConBase)).toBe('del juego');
    // Pero su base no es de serie, y la vista lo dice con cuál (QA 2 del 18-10-2026).
    expect(baseCambiada(eq, 'espada_bendita')?.id).toBe('espada');
    expect(baseCambiada(eq, 'espada_de_herreria')?.id).toBe('espada');
    expect(baseCambiada(DEL_JUEGO, 'espada_bendita')).toBeNull();
    expect(baseCambiada(eq, 'espada')).toBeNull();
    const u = conBendita();
    expect(unidadDeCombate(u, eq).attack).toBe(unidadDeCombate(u, DEL_JUEGO).attack + 3);
    // Y la regla del cambio la juzga con quien lleva la bendita: la Espada a dos
    // manos deja al del escudo sin poder llevar la bendita.
    expect(cambioDePiezaBlocker([], [{ ...ESPADA, manos: 2 }], [u])).toBe(
      `la lleva «${u.name}»: Espada bendita es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo`,
    );
    expect(cambioDePiezaBlocker([], [ESPADA_MAS], [u])).toBeNull();
  });

  it('a media pelea, cambiar la Espada cambia al que lleva la bendita, y el parte lo dice', () => {
    const b = batallaDeArena(
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
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [ESPADA_MAS] })).toBeNull();
    const ahora = b.stacks.find((x) => x.id === s.id) as BattleStack;
    expect(ahora.unit.attack).toBe(antes + 3);
    const bendita = DEL_JUEGO.pieza('espada_bendita').ataque;
    expect(b.log.slice(desde)).toContainEqual({
      kind: 'retoque',
      nombre: 'Espada bendita',
      stacks: [s.id],
      cambios: [`ataque ${bendita} → ${bendita + 3}`, 'por su base, «Espada»'],
    });
    // Volver a la Espada de serie deja la bendita como estaba, y lo dice.
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [] })).toBeNull();
    expect(b.log.at(-1)).toMatchObject({
      nombre: 'Espada bendita',
      cambios: [`ataque ${bendita + 3} → ${bendita}`, 'vuelve a la de serie'],
    });
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [ESPADA_MAS] })).toBeNull();
    expect(b.piezasDeArena).toEqual([validarPiezaDeArena(ESPADA_MAS)]);
  });

  it('cambiar de base conserva lo que suma; «ninguna» la deja entera con lo mismo', () => {
    const escrita = DEL_JUEGO.escritas.get('espada_bendita') as PiezaConBase;
    const final = DEL_JUEGO.pieza('espada_bendita');
    const sobreLaEspada = conBase(escrita, 'espada', DEL_JUEGO) as PiezaConBase;
    expect(sobreLaEspada).toEqual({
      id: 'espada_bendita',
      nombre: 'Espada bendita',
      base: 'espada',
      extras: { ataque: 2, danio: [5, 5], rueda: { normal: 10 }, oro: 450 },
    });
    expect(catalogoDeLaArena([sobreLaEspada]).pieza('espada_bendita')).toEqual(final);
    expect(selloDePieza(sobreLaEspada)).toBe('cambiada');
    const entera = conBase(escrita, null, DEL_JUEGO);
    expect(entera).toEqual(final);
    // Y volver a la de herrería la deja como estaba: de serie.
    const vuelta = conBase(sobreLaEspada, 'espada_de_herreria', catalogoDeLaArena([sobreLaEspada]));
    expect(vuelta).toEqual(escrita);
    expect(selloDePieza(vuelta)).toBe('del juego');
  });

  it('no vale, con su motivo: base que no existe, de otro hueco, de otra calidad, ni dar la vuelta', () => {
    const sobre = (base: string): PiezaConBase => ({
      id: 'sable',
      nombre: 'Sable',
      base,
      extras: { ataque: 1 },
    });
    expect(() => catalogoDeLaArena([sobre('nada')])).toThrow(
      '«Sable» toma de base «nada», que no existe',
    );
    expect(() => catalogoDeLaArena([sobre('garrote')])).toThrow(
      '«Sable» toma de base «Garrote», que no es de la arena: solo se parte de una pieza de la arena',
    );
    // La Espada sobre la bendita: Espada → bendita → herrería → Espada.
    const vuelta = { id: 'espada', nombre: 'Espada', base: 'espada_bendita', extras: {} };
    expect(() => catalogoDeLaArena([vuelta])).toThrow('sus bases dan la vuelta');
    expect(() => validarPiezaDeArena({ ...sobre('sable') })).toThrow('no puede ser su propia base');
    // Una del fichero no cambia de hueco tomando una base de otro.
    const deOtroHueco = {
      id: 'espada_de_herreria',
      nombre: 'Espada de herrería',
      base: 'arco',
      extras: {},
    };
    expect(() => catalogoDeLaArena([deOtroHueco])).toThrow(
      '«Espada de herrería» es una pieza de data/equipo.json y va en Arma: su hueco no se cambia en la arena',
    );
    // El desplegable de la ficha y `conBase` dicen lo mismo de otro hueco y de la vuelta.
    const herreria = DEL_JUEGO.escritas.get('espada_de_herreria') as PiezaConBase;
    expect(() => conBase(herreria, 'arco', DEL_JUEGO)).toThrow(
      '«Arco» va en Arma a distancia y «Espada de herrería» en Arma: la base es del mismo hueco',
    );
    expect(() => conBase(ESPADA, 'espada_bendita', DEL_JUEGO)).toThrow(
      '«Espada»: sus bases dan la vuelta («Espada» → «Espada bendita» → «Espada de herrería» → «Espada»)',
    );
    expect(basesPosibles(DEL_JUEGO, 'espada').map((p) => p.id)).not.toContain('espada_bendita');
    expect(basesPosibles(DEL_JUEGO, 'espada_bendita').map((p) => p.id)).toEqual(
      expect.arrayContaining(['espada', 'espada_de_herreria', 'maza']),
    );
    // Con base, el hueco y las manos son los de la base: no se escriben.
    expect(() => validarPiezaDeArena({ ...sobre('espada'), hueco: 'arma' })).toThrow(
      '«Sable» tiene base y escribe «hueco»',
    );
    // Y la resuelta tiene que valer: un extra de defensa en un arma.
    expect(() => catalogoDeLaArena([{ ...sobre('espada'), extras: { defensa: 1 } }])).toThrow(
      '«Sable» (sobre «Espada») va en el hueco arma, que no suma defensa',
    );
  });

  it('no se borra la base de otra pieza', () => {
    const a = piezaNueva('arma', DEL_JUEGO);
    const b = { id: 'arma-3', nombre: 'Arma 3', base: a.id, extras: { ataque: 1 } };
    expect(cambioDePiezaBlocker([a, b], [b], [])).toBe(
      `«${a.nombre}» es la base de «Arma 3»: cámbiale la base o bórrala antes`,
    );
    expect(cambioDePiezaBlocker([a, b], [a], [])).toBeNull();
  });

  it('el borrador deja sin valer solo la rota y las que están sobre ella', () => {
    const rota = { ...(piezaNueva('arma', DEL_JUEGO) as Pieza), rueda: { fuerte: -200 } };
    const sobreLaRota = { id: 'arma-3', nombre: 'Arma 3', base: rota.id, extras: {} };
    const sobreEsa = { id: 'arma-4', nombre: 'Arma 4', base: 'arma-3', extras: {} };
    const sana = { id: 'arma-5', nombre: 'Arma 5', base: 'espada', extras: { ataque: 1 } };
    const r = revisarBorradorDeEquipo({ piezas: [rota, sobreLaRota, sobreEsa, sana] });
    expect(r.validas.map((p) => p.id)).toEqual(['arma-5']);
    expect(r.invalidas.map((i) => i.clave)).toEqual([rota.id, 'arma-3', 'arma-4']);
    expect(r.invalidas[0]?.motivo).toContain('Fuerte haría el -75 % del daño');
    expect(r.invalidas[1]?.motivo).toContain(`su base «${rota.nombre}» no vale`);
    // Se conserva tal cual.
    expect(r.invalidas[1]?.crudo).toBe(sobreLaRota);
  });

  it('el enlace lleva las bases de lo que lleva, y se reabre igual', () => {
    expect(VERSION_DEL_ENLACE).toBe(10);
    const u = conBendita();
    // La bendita es del fichero: va la Espada cambiada, que es su base.
    expect(piezasDelMontaje([u], false, [ESPADA_MAS, { ...pieza('arco'), ataque: 9 }])).toEqual([
      ESPADA_MAS,
    ]);
    const lado = (unidad: string, ia: boolean) => ({
      ia,
      puestos: [{ unidad, escalera: false }],
      heroe: null,
    });
    const ENLACE: MontajeDelEnlace = {
      unidades: [u, unidadDeArena('goblin-arquero')],
      piezas: [validarPiezaDeArena(ESPADA_MAS)],
      izquierda: lado(u.id, false),
      derecha: lado('goblin-arquero', true),
      muralla: null,
    };
    const leido = montajeDeLaURL(montajeALaURL(ENLACE));
    expect(leido).toEqual(ENLACE);
    // Abierto, pelea con la Espada del enlace: la bendita suma con ella.
    const capa = piezasDelEnlace(leido);
    expect(capa.map((p) => p.id)).toEqual(
      expect.arrayContaining(['espada_bendita', 'espada_de_herreria', 'espada']),
    );
    const eq = catalogoDeLaArena(capa);
    expect(eq.pieza('espada_bendita').ataque).toBe(DEL_JUEGO.pieza('espada_bendita').ataque + 3);
    // Una del enlace sobre otra nueva que no trae, no.
    const nueva = piezaNueva('arma', DEL_JUEGO) as Pieza;
    const sobre = { id: 'arma-3', nombre: 'Arma 3', base: nueva.id, extras: {} };
    const eqDos = catalogoDeLaArena([nueva, sobre]);
    const lleva = equiparEnArena(quitarEnArena(u, 'arma'), 'arma-3', eqDos);
    const o = JSON.parse(
      montajeALaURL({
        ...ENLACE,
        unidades: [lleva, unidadDeArena('goblin-arquero')],
        piezas: [nueva, sobre],
        izquierda: lado(lleva.id, false),
      }),
    );
    expect(o.piezas.map((p: { id: string }) => p.id)).toEqual([nueva.id, 'arma-3']);
    expect(() =>
      montajeDeLaURL(
        JSON.stringify({ ...o, piezas: o.piezas.filter((p: { id: string }) => p.id === 'arma-3') }),
      ),
    ).toThrow(`«Arma 3» toma de base «${nueva.id}», que no existe`);
    // Un enlace de la versión de antes se rechaza: hay que volver a copiarlo.
    expect(() => montajeDeLaURL(JSON.stringify({ ...o, v: 9 }))).toThrow(
      'este enlace es de una versión anterior de la arena (la 9; la de hoy es la 10): vuelve a copiarlo',
    );
  });

  it('la suma es una: la pelea y el catálogo de la arena resuelven igual', () => {
    const encima = [ESPADA_MAS];
    expect([...resolverBases(encima).piezas.values()]).toEqual([
      ...catalogoDeLaArena(encima).piezas.values(),
    ]);
  });
});
