/**
 * El editor de equipo de la arena: el catálogo de equipo del juego
 * (`data/equipo.json`) se cambia, se crean piezas nuevas, se guarda con las
 * unidades y pelea —también a media pelea— (una sola clase de piezas desde el
 * 18-10-2026, `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/`), por
 * tipos (`docs/agents/2026-10-18-equipo-por-tipos-y-bases/`); las bases, en
 * `test/equipo-bases.test.ts`.
 *
 * Escritos desde los criterios del plan (`docs/agents/2026-10-12-editor-de-equipo/`):
 * cada regla con su caso que se rechaza, que es donde vive el fail-loud. Reglas,
 * no resultados de combate: las cifras salen de las piezas, no del JSON.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  enElMontaje,
  guardadoEnPalabras,
  renderEquipo,
  renderFicha,
  sinGuardarEnPalabras,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import {
  conPiezas,
  enElHueco,
  equiparEnArena,
  type HeroeDeArena,
  heroePorDefecto,
  idsLlevados,
  type MontajeDeArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeArenaDelEnlace,
  montajeDeLaURL,
  piezaNueva,
  piezasDelMontaje,
  quitarBlocker,
  quitarEnArena,
  retocarEnBatalla,
  unidadNueva,
  VERSION_DEL_ENLACE,
} from '../src/core/arena.js';
import { armaduraDe, isShooter } from '../src/core/battle/armas.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import {
  COMENTARIO_DEL_CATALOGO_DE_EQUIPO,
  EQUIPO,
  EQUIPO_ESCRITO,
  type Pieza,
  type PiezaEscrita,
  RUTA_DEL_CATALOGO_DE_EQUIPO,
  validarPieza,
} from '../src/core/data.js';
import { catalogoDeEquipo, EQUIPO_BASE, EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import { HUECOS, type Hueco, huecosDeLaPieza } from '../src/core/types.js';
import {
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  type Unidad,
  unidadDeCombate,
  validarUnidad,
} from '../src/core/unidad.js';
import { escribirCatalogo, leerCatalogo } from '../tools/arena/borrador.js';
import {
  carpetaDeLaArena,
  catalogoCon,
  catalogoEntero,
  delBorrador,
  elCatalogoCon,
  hojaDeLaArena,
  hojasDeLaArena,
  MONTAJE,
  motivoDelCambio,
  todoA,
  unidadDeArena,
} from './helpers.js';
import { catalogoDe, montar } from './pelea-de-arena.js';

const ESPADA = pieza('espada');
const ARCO = pieza('arco');
/** La espada cambiada en la arena: más ataque que la del fichero. */
const ESPADA_MAS: Pieza = { ...ESPADA, ataque: ESPADA.ataque + 7 };
/**
 * El catálogo del juego con `mala` en lugar de la de su id, sin mirarla: lo que
 * llegaría de una página que se la saltó, para ver morder a quien la juzga.
 */
const conMala = (mala: Record<string, unknown> & { id: string }): readonly PiezaEscrita[] =>
  EQUIPO_ESCRITO.map((p) => (p.id === mala.id ? (mala as unknown as PiezaEscrita) : p));
const MAGO: HeroeDeArena = { ...heroePorDefecto('izquierda'), nombre: 'Maga de pruebas' };

/** El guerrero con escudo (espada, brigantina y escudo: su perfil) y el arquero goblin (arco). */
const guerrero = (): Unidad => unidadDeArena('templario-escudo');
const arquero = (): Unidad => unidadDeArena('goblin-arquero');
/** Una unidad nueva de otro tipo que también lleva la espada. */
function otroConEspada(): Unidad {
  const ocupados = { validas: [], hojas: hojasDeLaArena().map((h) => h.id) };
  const u = unidadNueva(hojaDeLaArena('templario-escudo'), ocupados, EQUIPO_DEL_JUEGO);
  return equiparEnArena(u, 'espada', EQUIPO_DEL_JUEGO);
}

describe('el catálogo de equipo en la arena', () => {
  it('se cambia y se le añade, entero: lo que no es suyo de antes se rechaza', () => {
    const nueva = piezaNueva('arma', EQUIPO_DEL_JUEGO);
    const eq = catalogoCon(ESPADA_MAS, nueva);
    expect(eq.pieza('espada').ataque).toBe(ESPADA_MAS.ataque);
    // La nueva, detrás; las demás, en su orden.
    expect([...eq.piezas.keys()]).toEqual([...EQUIPO.map((p) => p.id), nueva.id]);
    // El juego sigue con lo que cargó hasta que «Guardar» lo escriba.
    expect(EQUIPO_DEL_JUEGO.pieza('espada')).toBe(ESPADA);
    expect(Object.values(EQUIPO_BASE)).not.toContain(nueva.id);
    // Una nueva ni se vende ni cae como botín hasta que se diga.
    expect(nueva).toMatchObject({ seConsigue: [] });
    expect(() => catalogoDeEquipo([...EQUIPO_ESCRITO, ESPADA_MAS])).toThrow(
      '"espada" está dos veces en el catálogo',
    );
  });

  it('un arma de cuerpo a cuerpo nueva nace con la rueda de la Espada; la de otro hueco, sin rueda', () => {
    const deLaEspada = ESPADA.rueda;
    expect(deLaEspada).toBeDefined();
    expect((piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza).rueda).toEqual(deLaEspada);
    for (const h of ['distancia', 'armadura', 'escudo'] as const) {
      expect(piezaNueva(h, EQUIPO_DEL_JUEGO), h).not.toHaveProperty('rueda');
    }
    // Pasar un arco a cuerpo a cuerpo le da la rueda de una nueva; y al revés, la pierde.
    const arco = piezaNueva('distancia', EQUIPO_DEL_JUEGO) as Pieza;
    expect(enElHueco(arco, 'arma').rueda).toEqual(deLaEspada);
    expect(enElHueco(pieza('maza'), 'distancia')).not.toHaveProperty('rueda');
    // Un 0 es un nivel: la forma canónica lo escribe, y va y vuelve.
    const enCero = validarPieza({
      ...arco,
      hueco: 'arma',
      rueda: { ...todoA(3), fuerte: 0 },
    });
    expect((enCero as Pieza).rueda).toEqual({ ...todoA(3), fuerte: 0 });
    expect(validarPieza(JSON.parse(JSON.stringify(enCero)))).toEqual(enCero);
  });

  it('una montura nueva nace con lo que la deja valer, y pasar a otro hueco le quita lo suyo (26-10-2026)', () => {
    // La fuerza del cuerpo común y la agilidad más baja: sin ellas no valdría.
    const nueva = piezaNueva('montura', EQUIPO_DEL_JUEGO) as Pieza;
    expect(nueva).toMatchObject({ hueco: 'montura', fuerza: 7, agilidad: 2 });
    expect(nueva).not.toHaveProperty('guerra');
    const caballo = pieza('caballo_de_guerra');
    expect(enElHueco(caballo, 'montura')).toEqual(caballo);
    const comoArma = enElHueco(caballo, 'arma');
    expect(comoArma).not.toHaveProperty('agilidad');
    expect(comoArma).not.toHaveProperty('guerra');
  });

  it('un arma a distancia nueva, sin disparos, ya hace tirador a quien la lleva (13-10-2026)', () => {
    // Sin munición: llevarla es disparar. Antes nacía con los 12 del arco (H1 del QA
    // de las armas por uso), que con 0 no se usaba nunca.
    const nueva = piezaNueva('distancia', EQUIPO_DEL_JUEGO);
    expect(nueva).not.toHaveProperty('disparos');
    expect(EQUIPO_DEL_JUEGO.pieza('arco')).not.toHaveProperty('disparos');
    const eq = catalogoCon(nueva);
    const conElla = unidadDeCombate(equiparEnArena(guerrero(), nueva.id, eq), eq);
    expect(isShooter(conElla)).toBe(true);
    expect(isShooter(unidadDeCombate(guerrero(), EQUIPO_DEL_JUEGO))).toBe(false);
  });

  it('cambiar el hueco rehace lo que el hueco exige: lo que no suma, a 0; las manos son de un arma; el peso se queda', () => {
    const arma = { ...(piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza), manos: 2 as const };
    const escudo = validarPieza(enElHueco(arma, 'escudo')) as Pieza;
    expect(escudo).toMatchObject({ hueco: 'escudo', peso: 0 });
    expect(escudo.manos).toBeUndefined();
    // Toda pieza pesa, en cualquier hueco: el peso va con ella.
    expect(enElHueco({ ...arma, peso: 7 }, 'escudo').peso).toBe(7);
    // Lo que el hueco nuevo no suma se queda en 0 (18-10-2026): un arma que pasa a
    // escudo deja su ataque y su fuerza, y a armadura, también su rueda.
    const maza = pieza('maza');
    expect(enElHueco(maza, 'escudo')).toMatchObject({ ataque: 0, peso: maza.peso });
    expect(enElHueco(maza, 'escudo')).not.toHaveProperty('fuerza');
    expect(enElHueco(maza, 'armadura')).not.toHaveProperty('rueda');
    // La lanza es un arma marcada (25-10-2026), no un hueco: fuera del arma, deja de serlo.
    expect(enElHueco(pieza('lanza'), 'arma')).toMatchObject({ lanza: true });
    expect(enElHueco(pieza('lanza'), 'escudo')).not.toHaveProperty('lanza');
  });

  it('poner unas encima sustituye a la de su id o va detrás, y cada una se valida', () => {
    const cambiadas = conPiezas(EQUIPO_ESCRITO, [ESPADA_MAS]);
    expect(cambiadas).toHaveLength(EQUIPO_ESCRITO.length);
    expect(cambiadas.find((p) => p.id === 'espada')).toEqual(validarPieza(ESPADA_MAS));
    const nueva = piezaNueva('escudo', EQUIPO_DEL_JUEGO);
    expect(conPiezas(cambiadas, [nueva]).at(-1)).toEqual(nueva);
    expect(() => conPiezas(EQUIPO_ESCRITO, [{ ...ESPADA, ataque: -1 }])).toThrow(
      'ataque tiene que ser un entero ≥ 0',
    );
  });
});

describe('la arena pelea con sus piezas', () => {
  it('una pieza nueva se pone como cualquier otra, con la misma regla de las manos', () => {
    const nueva = { ...(piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza), manos: 2 as const };
    const eq = catalogoCon(nueva);
    const u = guerrero();
    expect(() => equiparEnArena(u, nueva.id, eq)).toThrow(
      `${nueva.nombre} es un arma a dos manos y no se puede llevar con Escudo`,
    );
    const sinEscudo = quitarEnArena(u, 'escudo');
    expect(equiparEnArena(sinEscudo, nueva.id, eq).equipo.arma).toBe(nueva.id);
    // Con las piezas del juego, no existe.
    expect(() => equiparEnArena(sinEscudo, nueva.id, EQUIPO_DEL_JUEGO)).toThrow(
      `pieza de equipo desconocida: "${nueva.id}"`,
    );
  });
});

describe('cambiar una pieza no deja sin valer a nadie del catálogo', () => {
  it('borrar una que alguien lleva, no; ni una del equipo base del héroe; y lo que no vale de la pieza, tampoco', () => {
    const nueva = piezaNueva('escudo', EQUIPO_DEL_JUEGO);
    const conElla = equiparEnArena(arquero(), nueva.id, catalogoCon(nueva));
    const sin = EQUIPO_ESCRITO;
    expect(motivoDelCambio(catalogoCon(nueva), sin, [conElla])).toBe(
      `la lleva «${conElla.name}»: quítasela antes de borrar «${nueva.nombre}»`,
    );
    expect(motivoDelCambio(catalogoCon(nueva), sin, [arquero()])).toBeNull();
    expect(
      motivoDelCambio(EQUIPO_DEL_JUEGO, conMala({ ...pieza('escudo'), velocidad: -1 }), []),
    ).toMatch(/dice velocidad: ninguna pieza resta movimiento/);
    // Ni deja el catálogo sin nada que caiga como botín, que el juego no cargaría.
    expect(
      motivoDelCambio(
        EQUIPO_DEL_JUEGO,
        EQUIPO_ESCRITO.map((p) => ({ ...p, seConsigue: [] })),
        [],
      ),
    ).toMatch(/no hay ninguna pieza que caiga como botín/);
    // El gambesón lo lleva todo héroe (`data/heroe.json`): sin él, el juego no carga.
    expect(
      motivoDelCambio(
        EQUIPO_DEL_JUEGO,
        sin.filter((p) => p.id !== 'gambeson'),
        [],
      ),
    ).toBe('el equipo base del héroe (data/heroe.json): no existe ninguna pieza "gambeson"');
  });
});

// ------------------------------------------------------------------ el enlace

describe('el enlace de la pelea lleva las piezas de lo montado', () => {
  const nueva = { ...(piezaNueva(ESPADA, EQUIPO_DEL_JUEGO) as Pieza), ataque: ESPADA.ataque + 3 };
  const eq = catalogoCon(nueva);
  const conNueva = equiparEnArena(guerrero(), nueva.id, eq);
  const lado = (unidad: string, ia: boolean) => ({
    ia,
    puestos: [{ unidad, escalera: false }],
    heroe: null,
  });
  const ENLACE: MontajeDelEnlace = {
    unidades: [conNueva, arquero()],
    piezas: piezasDelMontaje([conNueva, arquero()], [], [...eq.escritas.values()]),
    hechizos: [],
    izquierda: lado(conNueva.id, false),
    derecha: lado('goblin-arquero', true),
    muralla: null,
    combate: COMBATE_COMPLETO,
  };

  it('va y vuelve con todas las piezas que lleva, y monta con ellas en el catálogo de quien lo abre', () => {
    expect(VERSION_DEL_ENLACE).toBe(21);
    // Lo que llevan el guerrero (la nueva, la brigantina, el escudo) y el arquero
    // (daga, arco, jubón): todas, no solo las cambiadas.
    expect(ENLACE.piezas.map((p) => p.id).sort()).toEqual(
      [nueva.id, 'brigantina', 'escudo', 'daga', 'arco', 'jubon_de_arquero'].sort(),
    );
    const leido = montajeDeLaURL(montajeALaURL(ENLACE));
    expect(leido).toEqual(ENLACE);
    const montado = montajeDeArenaDelEnlace(leido, catalogoCon(...leido.piezas));
    expect(montar(montado, createRng(3)).stacks[0]?.unit.attack).toBe(
      unidadDeCombate(conNueva, eq).attack,
    );
    // El héroe: su equipo base, la Espada y el gambesón, viaja con él.
    expect(idsLlevados([], [EQUIPO_BASE])).toEqual(new Set(Object.values(EQUIPO_BASE)));
    expect(piezasDelMontaje([], [EQUIPO_BASE], elCatalogoCon(ESPADA_MAS)).map((p) => p.id)).toEqual(
      ['espada', 'gambeson'],
    );
    expect(piezasDelMontaje([], [], elCatalogoCon(ESPADA_MAS))).toEqual([]);
  });

  it('abierto en una arena con piezas cambiadas, sus piezas entran en ella: el enlace aplica, no se superpone', () => {
    // El arquero lleva el arco del fichero: el enlace lo trae tal cual y deshace el
    // arco cambiado de esta arena (un cambio sin guardar más, que «Guardar»
    // escribe); la espada, que nadie lleva en el enlace, se queda como está aquí.
    const aqui = elCatalogoCon(ESPADA_MAS, { ...ARCO, ataque: ARCO.ataque + 1 });
    const abierta = conPiezas(aqui, montajeDeLaURL(montajeALaURL(ENLACE)).piezas);
    const eqAqui = catalogoDeEquipo(abierta);
    expect(eqAqui.pieza('arco')).toEqual(ARCO);
    expect(eqAqui.pieza('espada').ataque).toBe(ESPADA_MAS.ataque);
    expect(eqAqui.pieza(nueva.id)).toEqual(nueva);
    // Lo que se escribe es esa lista: una sola, la de la página.
    expect(abierta.find((p) => p.id === 'arco')).toEqual(ARCO);
  });
});

// ------------------------------------------------------------------ en disco

describe('«Guardar»: piezas y unidades, una sola operación', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });
  /** Una carpeta con el catálogo de equipo del repo, como la del servidor. */
  const carpeta = (): string => {
    dir = carpetaDeLaArena('arena-equipo-');
    return dir;
  };
  const enDisco = (d: string): { _comment: string; piezas: unknown[] } =>
    JSON.parse(readFileSync(join(d, RUTA_DEL_CATALOGO_DE_EQUIPO), 'utf8'));

  it('escribe los dos en data/, el de equipo entero y con su comentario, y los lee', () => {
    const d = carpeta();
    const nueva = piezaNueva('escudo', EQUIPO_DEL_JUEGO);
    const piezas = elCatalogoCon(nueva, ESPADA_MAS);
    // El catálogo entero: con menos, una morada se queda sin unidades y el juego
    // no arrancaría (`moradasBlocker`).
    const unidades = catalogoEntero(guerrero());
    expect(escribirCatalogo(d, { unidades, piezas })).toMatchObject({
      unidades: unidades.length,
      piezas: piezas.length,
    });
    const leido = leerCatalogo(d);
    expect(leido.unidades).toEqual(unidades);
    expect(leido.piezas).toEqual(piezas);
    expect(enDisco(d)._comment).toBe(COMENTARIO_DEL_CATALOGO_DE_EQUIPO);
    expect(enDisco(d).piezas).toEqual(piezas);
    // El comentario que hay en disco se conserva: es el que se edita a mano.
    writeFileSync(
      join(d, RUTA_DEL_CATALOGO_DE_EQUIPO),
      JSON.stringify({ _comment: 'escrito a mano', piezas }),
    );
    writeFileSync(
      join(d, RUTA_DEL_CATALOGO_DE_UNIDADES),
      JSON.stringify({ _comment: 'el de unidades, a mano', unidades: [guerrero()] }),
    );
    escribirCatalogo(d, { unidades, piezas });
    expect(enDisco(d)._comment).toBe('escrito a mano');
    expect(JSON.parse(readFileSync(join(d, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8'))._comment).toBe(
      'el de unidades, a mano',
    );
  });

  it('con la regla con que lo carga el juego: si algo no vale no escribe ninguno, y se dice', () => {
    const d = carpeta();
    escribirCatalogo(d, { unidades: catalogoEntero(guerrero()), piezas: EQUIPO_ESCRITO });
    const antes = {
      unidades: readFileSync(join(d, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8'),
      equipo: readFileSync(join(d, RUTA_DEL_CATALOGO_DE_EQUIPO), 'utf8'),
    };
    // Una unidad con una pieza que no viene.
    const nueva = piezaNueva('escudo', EQUIPO_DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoCon(nueva));
    expect(() =>
      escribirCatalogo(d, { unidades: catalogoEntero(con), piezas: EQUIPO_ESCRITO }),
    ).toThrow(`data/unidades.json: la unidad «${con.name}»: no existe ninguna pieza "${nueva.id}"`);
    // Una pieza mala, una con PV o una calidad de antes.
    expect(() =>
      escribirCatalogo(d, {
        unidades: catalogoEntero(guerrero()),
        piezas: conMala({ ...ESPADA, ataque: -1 }),
      }),
    ).toThrow('data/equipo.json: "espada": ataque tiene que ser un entero ≥ 0');
    expect(() =>
      escribirCatalogo(d, {
        unidades: catalogoEntero(guerrero()),
        piezas: [...EQUIPO_ESCRITO.filter((p) => p.id !== 'barda'), { ...pieza('barda'), pv: 1 }],
      }),
    ).toThrow('suma PV: ninguna pieza da PV');
    // Sin el gambesón, el héroe nacería sin su equipo base.
    expect(() =>
      escribirCatalogo(d, {
        unidades: [],
        piezas: EQUIPO_ESCRITO.filter((p) => p.id !== 'gambeson'),
      }),
    ).toThrow('el equipo base del héroe (data/heroe.json): no existe ninguna pieza "gambeson"');
    // Sin nada que caiga como botín.
    expect(() =>
      escribirCatalogo(d, {
        unidades: [],
        piezas: EQUIPO_ESCRITO.map((p) => ({ ...p, seConsigue: ['armeria'] })),
      }),
    ).toThrow('no hay ninguna pieza que caiga como botín');
    expect(readFileSync(join(d, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')).toBe(antes.unidades);
    expect(readFileSync(join(d, RUTA_DEL_CATALOGO_DE_EQUIPO), 'utf8')).toBe(antes.equipo);
  });

  it('una unidad con una pieza nueva entra si la pieza va con ella: ya no son dos ficheros', () => {
    const d = carpeta();
    const nueva = piezaNueva('escudo', EQUIPO_DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoCon(nueva));
    const unidades = catalogoEntero(guerrero(), con);
    expect(escribirCatalogo(d, { unidades, piezas: elCatalogoCon(nueva) })).toMatchObject({
      unidades: unidades.length,
    });
    expect(leerCatalogo(d).unidades).toEqual(unidades);
  });

  it('tras abrir un enlace, sus piezas son cambios sin guardar: «Guardar» las escribe, también sobre una tuya', () => {
    const d = carpeta();
    // Tu brigantina, cambiada y guardada.
    const tuya = { ...pieza('brigantina'), armadura: (pieza('brigantina').armadura ?? 0) + 2 };
    escribirCatalogo(d, { unidades: catalogoEntero(), piezas: elCatalogoCon(tuya) });
    // El enlace lleva al guerrero con la brigantina del fichero y al arquero con una nueva.
    const nueva = piezaNueva('escudo', EQUIPO_DEL_JUEGO);
    const conNueva = equiparEnArena(arquero(), nueva.id, catalogoCon(nueva));
    const lado = (unidad: string) => ({
      ia: false,
      puestos: [{ unidad, escalera: false }],
      heroe: null,
    });
    const enlace = montajeDeLaURL(
      montajeALaURL({
        unidades: [guerrero(), conNueva],
        piezas: piezasDelMontaje([guerrero(), conNueva], [], elCatalogoCon(nueva)),
        hechizos: [],
        izquierda: lado(guerrero().id),
        derecha: lado(conNueva.id),
        muralla: null,
        combate: COMBATE_COMPLETO,
      }),
    );
    // Abrirlo es ponerlas en el catálogo, lo mismo que editarlas a mano…
    const abierto = conPiezas(leerCatalogo(d).piezas, enlace.piezas);
    expect(catalogoDeEquipo(abierto).pieza('brigantina').armadura).toBe(
      pieza('brigantina').armadura,
    );
    // …y «Guardar» escribe esa lista, la única de la página.
    escribirCatalogo(d, { unidades: catalogoEntero(guerrero(), conNueva), piezas: abierto });
    const guardadas = leerCatalogo(d).piezas;
    expect(guardadas.find((p) => p.id === 'brigantina')).toEqual(pieza('brigantina'));
    expect(guardadas.at(-1)).toEqual(nueva);
  });

  it('un data/equipo.json que no vale no se lee a medias: el juego tampoco lo cargaría', () => {
    const d = carpeta();
    writeFileSync(join(d, RUTA_DEL_CATALOGO_DE_EQUIPO), '{ roto');
    expect(() => leerCatalogo(d)).toThrow('data/equipo.json no es JSON');
    writeFileSync(
      join(d, RUTA_DEL_CATALOGO_DE_EQUIPO),
      JSON.stringify({ piezas: [...EQUIPO_ESCRITO, { ...pieza('maza') }] }),
    );
    expect(() => leerCatalogo(d)).toThrow('data/equipo.json: "maza" está dos veces en el catálogo');
  });
});

// ------------------------------------------------------------------ a media pelea

describe('cambiar una pieza a media pelea', () => {
  /** Guerrero (espada) y arquero (arco) a la izquierda con héroe; otro con espada a la derecha. */
  function pelea(): BattleState {
    const montaje: MontajeDeArena = {
      izquierda: { unidades: [delBorrador(guerrero()), delBorrador(arquero())], heroe: MAGO },
      derecha: { unidades: [delBorrador(otroConEspada())], heroe: null },
      ...MONTAJE,
    };
    return montar(montaje, createRng(5));
  }
  const de = (b: BattleState, id: string): BattleStack =>
    b.stacks.find((s) => s.id === id) as BattleStack;
  const conEspada = (b: BattleState): BattleStack[] =>
    b.stacks.filter((s) => s.origen.kind !== 'heroe' && s.body === 'templario-escudo');

  it('el gambesón del héroe se cambia como cualquier otra pieza, y le llega', () => {
    const b = pelea();
    const heroe = b.stacks.find((s) => s.origen.kind === 'heroe') as BattleStack;
    const gambeson = pieza('gambeson');
    const mas = { ...gambeson, armadura: (gambeson.armadura ?? 0) + 3 };
    expect(
      retocarEnBatalla(
        b,
        { kind: 'piezas', equipo: catalogoCon(mas) },
        catalogoDe(b, EQUIPO_DEL_JUEGO),
      ),
    ).toBeNull();
    expect(armaduraDe(de(b, heroe.id).unit)).toBe(armaduraDe(heroe.unit) + 3);
  });

  it('tras cambiarle la espada por la maza a un tipo, cambiar la espada ya no lo toca', () => {
    const b = pelea();
    const [a, a2] = conEspada(b) as [BattleStack, BattleStack];
    // Sin arma no se pelea (vuelta 2): se le cambia por otra.
    expect(
      retocarEnBatalla(
        b,
        {
          kind: 'tipo',
          fuente: delBorrador(equiparEnArena(guerrero(), 'maza', EQUIPO_DEL_JUEGO)),
        },
        catalogoDe(b, EQUIPO_DEL_JUEGO),
      ),
    ).toBeNull();
    const sinEspada = de(b, a.id).unit;
    retocarEnBatalla(
      b,
      { kind: 'piezas', equipo: catalogoCon(ESPADA_MAS) },
      catalogoDe(b, EQUIPO_DEL_JUEGO),
    );
    expect(de(b, a.id).unit).toBe(sinEspada);
    expect(de(b, a2.id).unit.attack).toBe(a2.unit.attack + ESPADA_MAS.ataque - ESPADA.ataque);
  });

  it('con la batalla terminada no entra', () => {
    const b = pelea();
    b.finished = { winner: 'attacker' };
    expect(
      retocarEnBatalla(
        b,
        { kind: 'piezas', equipo: catalogoCon(ESPADA_MAS) },
        catalogoDe(b, EQUIPO_DEL_JUEGO),
      ),
    ).toBe('la batalla ya ha terminado; el cambio vale para la pelea siguiente');
  });
});

// ------------------------------------------------------------------ la vista

describe('la vista «Editar equipo»', () => {
  const nueva = piezaNueva('arma', EQUIPO_DEL_JUEGO);
  /** Un arma con todo en el nivel 0, lo peor. */
  const nuevaEnCero: Pieza = {
    ...(nueva as Pieza),
    id: 'arma-en-cero',
    nombre: 'Arma en cero',
    rueda: todoA(0),
  };
  const piezas = catalogoCon(ESPADA_MAS, nueva, nuevaEnCero);
  const vista = (elegida: string, rechazo: string | null = null, eq = piezas) =>
    marcadoDe(
      renderEquipo({
        piezas: eq,
        elegida,
        llevan: (id) => (id === 'espada' ? ['Guerrero con escudo'] : []),
        rechazo,
        enCombate: false,
        sinGuardar: sinGuardarEnPalabras(2, 1),
      }),
    );

  it('la ficha dice de dónde se consigue con dos casillas, marcadas según la pieza', () => {
    const casillas = (id: string) =>
      [
        ...vista(id).matchAll(/data-arena-pieza-campo="se-consigue-(armeria|botin)"( checked)?/g),
      ].map((x) => `${x[1]}${x[2] === undefined ? '' : ' ✓'}`);
    expect(casillas('espada')).toEqual(['armeria ✓', 'botin']);
    expect(casillas('espada_de_herreria')).toEqual(['armeria', 'botin ✓']);
    expect(casillas(nueva.id)).toEqual(['armeria', 'botin']);
  });

  it('la ficha no tiene PV ni calidad, y un solo precio, en oro', () => {
    for (const id of ['espada', 'brigantina', 'escudo', 'arco', nueva.id]) {
      const m = vista(id);
      expect(m, id).not.toContain('data-arena-pieza-campo="pv"');
      expect(m, id).not.toContain('data-arena-pieza-campo="calidad"');
      expect(m, id).not.toMatch(/data-arena-pieza-campo="precio-(?!gold)/);
      expect(m.match(/data-arena-pieza-campo="precio-gold"/g), id).toHaveLength(1);
      expect(m, id).not.toContain('>Calidad<');
    }
  });

  it('toda pieza se borra; ninguna cambia de hueco, y una entera de cuerpo a cuerpo dice si es una lanza', () => {
    const espada = vista('espada');
    expect(espada).toMatch(/data-arena="retirar-pieza"[^>]*>Borrar/);
    expect(espada).toContain('data-arena="crear-pieza-sobre"');
    expect(espada).toContain('data-arena-pieza-campo="manos"');
    expect(espada).toContain('Guerrero con escudo');
    // Un enlace abierto ya no pelea con otra pieza que la del catálogo: no hay aviso.
    expect(espada).not.toContain('data-aviso-del-enlace');
    // La lanza dejó de ser un hueco (25-10-2026): ninguna cambia de hueco, y la
    // casilla «es una lanza» va en las enteras de cuerpo a cuerpo, marcada en la lanza.
    for (const id of ['espada', nueva.id, 'arco', 'espada_bendita']) {
      expect(vista(id), id).not.toContain('data-arena-pieza-campo="hueco"');
    }
    expect(espada).toMatch(/<input type="checkbox" data-arena-pieza-campo="lanza" >/);
    expect(vista('lanza')).toMatch(/data-arena-pieza-campo="lanza" checked/);
    expect(vista('arco')).not.toContain('data-arena-pieza-campo="lanza"');
    expect(vista('espada_bendita')).not.toContain('data-arena-pieza-campo="lanza"');
    // Las manos, solo en un arma.
    expect(vista('brigantina')).not.toContain('data-arena-pieza-campo="manos"');
    expect(vista('espada', 'No se cambia: X.')).toContain('class="aviso-de-pieza rechazo"');
    // Una que no está en el catálogo (por un id que llegó de antes) no abre ficha.
    expect(vista('garrote')).toContain('Elige una pieza de la lista');
  });

  it('lo guardado se dice en una frase, con lo que no vale y se conserva', () => {
    expect(guardadoEnPalabras({ ruta: 'u.json', unidades: 3, conservadas: 1 })).toBe(
      'Guardado en u.json: 3 unidades, y 1 que no vale, tal como estaba.',
    );
    expect(guardadoEnPalabras({ ruta: 'u.json', unidades: 1, piezas: 2 })).toBe(
      `Guardado en u.json: 1 unidad. Y en ${RUTA_DEL_CATALOGO_DE_EQUIPO}: 2 piezas.`,
    );
  });
});

describe('la ficha de una unidad ofrece solo lo que el núcleo admite (H3 de la vuelta 2)', () => {
  const como = enElMontaje(EQUIPO_DEL_JUEGO);
  const ficha = (u: Unidad): string => marcadoDe(renderFicha(u, false, como));
  /** Las opciones del desplegable de `hueco` en la ficha: su id y si va desactivada. */
  function ofrecidas(m: string, hueco: string): { id: string; desactivada: boolean }[] {
    const i = m.indexOf(`<select data-arena-pieza="${hueco}">`);
    if (i < 0) return [];
    const select = m.slice(i, m.indexOf('</select>', i));
    return [...select.matchAll(/<option value="([^"]+)"( disabled)?>/g)].map((x) => ({
      id: x[1] as string,
      desactivada: x[2] !== undefined,
    }));
  }

  it('cada hueco ofrece las piezas del suyo, sin accesorio', () => {
    const m = ficha(guerrero());
    expect(m).not.toContain('data-hueco-de-la-ficha="accesorio"');
    expect(m).not.toContain('data-arena-pieza="accesorio"');
    for (const hueco of HUECOS) {
      const ids = ofrecidas(m, hueco).map((o) => o.id);
      expect(ids.length, hueco).toBeGreaterThan(0);
      for (const id of ids) {
        expect(huecosDeLaPieza(EQUIPO_DEL_JUEGO.pieza(id).hueco), id).toContain(hueco);
      }
    }
    // Un hueco que no existe no se monta.
    expect(() =>
      validarUnidad({ ...guerrero(), equipo: { accesorio: 'escudo' } }, EQUIPO_DEL_JUEGO),
    ).toThrow('no hay ningún hueco "accesorio"');
  });

  it('el arma de cuerpo a cuerpo no se quita: sin ella no se monta, y la ficha lo dice en vez de la ×', () => {
    const u = guerrero();
    expect(quitarBlocker(u, 'arma', EQUIPO_DEL_JUEGO)).toMatch(/no lleva arma de cuerpo a cuerpo/);
    expect(quitarBlocker(u, 'armadura', EQUIPO_DEL_JUEGO)).toBeNull();
    expect(quitarBlocker(u, 'distancia', EQUIPO_DEL_JUEGO)).toMatch(/no lleva nada en/);
    const m = ficha(u);
    expect(m).not.toContain('data-arena="quitar-pieza" data-hueco="arma"');
    expect(m).toContain('data-no-se-quita="arma"');
    expect(m).toContain('data-arena="quitar-pieza" data-hueco="armadura"');
    // Lo que la ficha deja quitar, el núcleo lo admite.
    for (const [, hueco] of m.matchAll(/data-arena="quitar-pieza" data-hueco="([^"]+)"/g)) {
      const h = hueco as Hueco;
      expect(() => validarUnidad(quitarEnArena(u, h), EQUIPO_DEL_JUEGO), h).not.toThrow();
    }
  });
});
