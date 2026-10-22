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
  LA_LLEVA_EL_HEROE,
  renderEquipo,
  renderFicha,
  renderFichaDeHeroe,
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
  laLlevaElHeroe,
  type MontajeDeArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeArenaDelEnlace,
  montajeDeLaURL,
  opcionesDelHueco,
  piezaNueva,
  piezasDelMontaje,
  quitarBlocker,
  quitarEnArena,
  retocarEnBatalla,
  unidadNueva,
  VERSION_DEL_ENLACE,
} from '../src/core/arena.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { UNIDADES } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import {
  COMENTARIO_DEL_CATALOGO_DE_EQUIPO,
  EQUIPO,
  EQUIPO_ESCRITO,
  isShooter,
  type Pieza,
  type PiezaEscrita,
  RUTA_DEL_CATALOGO_DE_EQUIPO,
  validarPieza,
} from '../src/core/data.js';
import { catalogoDeEquipo, EQUIPO_BASE, EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import { indiceDePoder } from '../src/core/nivel.js';
import { createRng } from '../src/core/rng.js';
import { HUECOS, type Hueco } from '../src/core/types.js';
import {
  ESPADA as ID_DE_LA_ESPADA,
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
    expect((piezaNueva('lanza', EQUIPO_DEL_JUEGO) as Pieza).rueda).toEqual(deLaEspada);
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

  it('lo ajeno se dice: un campo que no existe, la calidad o los PV de antes, un id mal escrito', () => {
    expect(() => validarPieza({ ...ESPADA, filo: 3 })).toThrow(
      '«filo» no es un campo de una pieza',
    );
    expect(() => validarPieza({ ...ESPADA, calidad: 'arena' })).toThrow(
      '«Espada»: «calidad» no es un campo de una pieza',
    );
    expect(() => validarPieza({ ...pieza('brigantina'), pv: 10 })).toThrow(
      '«Brigantina» suma PV: ninguna pieza da PV',
    );
    expect(() => validarPieza({ ...ESPADA, id: 'Espada Mala' })).toThrow(
      'el id «Espada Mala» va en minúsculas',
    );
  });

  it('muerde con la regla de una pieza del catálogo: el escudo resta, las manos son de un arma, el daño en orden', () => {
    expect(() => validarPieza({ ...pieza('escudo'), velocidad: 1 })).toThrow(
      '«Escudo» es un escudo y tiene que restar velocidad (un número negativo), y es 1',
    );
    expect(() => validarPieza({ ...pieza('brigantina'), manos: 2 })).toThrow(
      'solo un arma se lleva a dos manos',
    );
    expect(() => validarPieza({ ...ESPADA, danio: [30, 10] })).toThrow(
      'el daño mínimo que suma (30) pasa del máximo (10)',
    );
    // Para la persona: qué hacer, el recurso en español y un campo vacío sin «NaN».
    expect(() => validarPieza({ ...ESPADA, nombre: ' ' })).toThrow('no tiene nombre: escribe uno');
    expect(() => validarPieza({ ...ESPADA, precio: -5 })).toThrow(
      '«Espada» cuesta -5 de oro: tiene que ser un entero ≥ 0',
    );
    expect(() => validarPieza({ ...ESPADA, ataque: Number.NaN })).toThrow(
      '«Espada»: ataque tiene que ser un entero ≥ 0 y no es un número',
    );
    // Lo que no suma se escribe sin el campo: una mano.
    expect(validarPieza({ ...ESPADA, manos: 1 })).toEqual(ESPADA);
    // Los disparos ya no son un campo (13-10-2026): sin munición.
    expect(() => validarPieza({ ...ARCO, disparos: 12 })).toThrow(
      '«Arco»: «disparos» no es un campo de una pieza',
    );
  });

  it('cambiar el hueco rehace lo que el hueco exige: el escudo resta y las manos son de un arma', () => {
    const arma = { ...(piezaNueva('arma', EQUIPO_DEL_JUEGO) as Pieza), manos: 2 as const };
    const escudo = validarPieza(enElHueco(arma, 'escudo')) as Pieza;
    expect(escudo).toMatchObject({ hueco: 'escudo', velocidad: -1 });
    expect(escudo.manos).toBeUndefined();
    // Lo que ya restaba se queda; lo que el escudo exigía se va con él: de vuelta
    // al arma no resta. Un arma que ya restaba sin ser escudo, sigue restando.
    expect(enElHueco({ ...escudo, velocidad: -2 }, 'escudo').velocidad).toBe(-2);
    expect((validarPieza(enElHueco(escudo, 'arma')) as Pieza).velocidad).toBe(0);
    expect(enElHueco({ ...arma, velocidad: -1 }, 'armadura').velocidad).toBe(-1);
    // Lo que el hueco nuevo no suma se queda en 0 (18-10-2026): un arma que pasa a
    // escudo deja su ataque y su daño, y a armadura, también su rueda.
    const maza = pieza('maza');
    expect(enElHueco(maza, 'escudo')).toMatchObject({ ataque: 0, velocidad: -1 });
    expect(enElHueco(maza, 'escudo')).not.toHaveProperty('danio');
    expect(enElHueco(maza, 'armadura')).not.toHaveProperty('rueda');
    expect(enElHueco(maza, 'lanza').rueda).toEqual(maza.rueda);
  });

  it('«Nueva pieza» y «Duplicar» dan un id libre', () => {
    const escudo = piezaNueva('escudo', EQUIPO_DEL_JUEGO) as Pieza;
    expect(escudo).toMatchObject({ id: 'escudo-2', nombre: 'Escudo 2' });
    expect(escudo.velocidad).toBeLessThan(0);
    const eq = catalogoCon(escudo);
    expect(piezaNueva('escudo', eq).id).toBe('escudo-3');
    // La copia lo es todo, también de dónde se consigue.
    const copia = piezaNueva(ESPADA, EQUIPO_DEL_JUEGO) as Pieza;
    expect(copia).toEqual({ ...ESPADA, id: 'espada-2', nombre: 'Espada 2' });
    // La copia de una copia no encadena sufijos.
    expect(piezaNueva(copia, catalogoCon(copia)).id).toBe('espada-3');
    // Ni el nombre de otra: con «Espada 2» ya puesto a otra pieza, la copia salta.
    const ocupa = { ...piezaNueva('armadura', EQUIPO_DEL_JUEGO), nombre: 'Espada 2' };
    expect(piezaNueva(ESPADA, catalogoCon(ocupa))).toMatchObject({
      id: 'espada-3',
      nombre: 'Espada 3',
    });
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
  it('la espada cambiada suma en la unidad y en la pelea, y el índice lo ve (18-10-2026)', () => {
    const eq = catalogoCon(ESPADA_MAS);
    const u = guerrero();
    const delJuego = unidadDeCombate(u, EQUIPO_DEL_JUEGO);
    const deLaArena = unidadDeCombate(u, eq);
    expect(deLaArena.attack - delJuego.attack).toBe(ESPADA_MAS.ataque - ESPADA.ataque);
    // El nivel se mide con el equipo puesto: más ataque en el arma, más índice.
    expect(indiceDePoder(deLaArena)).toBeGreaterThan(indiceDePoder(delJuego));
    const b = montar(
      {
        izquierda: { unidades: [delBorrador(u)], heroe: null },
        derecha: { unidades: [delBorrador(arquero())], heroe: null },
        ...MONTAJE,
        equipo: eq,
      },
      createRng(1),
    );
    expect(b.stacks[0]?.unit.attack).toBe(deLaArena.attack);
    // La pelea no guarda el catálogo: el golpe lleva el nombre de su arma.
    expect(b).not.toHaveProperty('piezasDeArena');
    expect(b.stacks[0]?.unit.armas?.arma.arma).toEqual({ id: 'espada', nombre: 'Espada' });
  });

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
  /** El cambio de `antes` (el catálogo con esas piezas) a `despues`, preguntado con `unidades`. */
  const cambio = (
    antes: readonly PiezaEscrita[],
    despues: readonly PiezaEscrita[],
    unidades: readonly Unidad[],
  ) => motivoDelCambio(catalogoCon(...antes), elCatalogoCon(...despues), unidades);

  it('pasar la espada a dos manos con el escudo puesto se rechaza nombrando a quién', () => {
    const motivo = cambio([], [{ ...ESPADA, manos: 2 }], [guerrero(), arquero()]);
    expect(motivo).toBe(
      `la lleva «${guerrero().name}»: Espada es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo`,
    );
    // Sin nadie que la lleve, entra.
    expect(cambio([], [{ ...ESPADA, manos: 2 }], [arquero()])).toBeNull();
  });

  it('borrar una que alguien lleva, no; ni una del equipo base del héroe; y lo que no vale de la pieza, tampoco', () => {
    const nueva = piezaNueva('escudo', EQUIPO_DEL_JUEGO);
    const conElla = equiparEnArena(arquero(), nueva.id, catalogoCon(nueva));
    const sin = EQUIPO_ESCRITO;
    expect(motivoDelCambio(catalogoCon(nueva), sin, [conElla])).toBe(
      `la lleva «${conElla.name}»: quítasela antes de borrar «${nueva.nombre}»`,
    );
    expect(motivoDelCambio(catalogoCon(nueva), sin, [arquero()])).toBeNull();
    expect(
      motivoDelCambio(EQUIPO_DEL_JUEGO, conMala({ ...pieza('escudo'), velocidad: 1 }), []),
    ).toMatch(/es un escudo y tiene que restar velocidad/);
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

  it('dos piezas no se llaman igual: el nombre de otra se rechaza diciendo cuál', () => {
    const copia = piezaNueva(ESPADA, EQUIPO_DEL_JUEGO);
    expect(cambio([copia], [{ ...copia, nombre: ' espada ' }], [])).toBe(
      'ya hay una pieza que se llama «Espada» (Arma): ponle otro nombre, que en la ficha de una unidad no se distinguirían',
    );
    expect(cambio([copia], [{ ...copia, nombre: 'Espada corta' }], [])).toBeNull();
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
    piezas: piezasDelMontaje([conNueva, arquero()], false, [...eq.escritas.values()]),
    izquierda: lado(conNueva.id, false),
    derecha: lado('goblin-arquero', true),
    muralla: null,
    combate: COMBATE_COMPLETO,
  };

  it('va y vuelve con todas las piezas que lleva, y monta con ellas en el catálogo de quien lo abre', () => {
    expect(VERSION_DEL_ENLACE).toBe(14);
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
    expect(idsLlevados([], true)).toEqual(new Set(Object.values(EQUIPO_BASE)));
    expect(piezasDelMontaje([], true, elCatalogoCon(ESPADA_MAS)).map((p) => p.id)).toEqual([
      'espada',
      'gambeson',
    ]);
    expect(piezasDelMontaje([], false, elCatalogoCon(ESPADA_MAS))).toEqual([]);
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

  it('una pieza que nadie lleva, una que no vale o una que falta se rechazan diciendo cuál', () => {
    const o = JSON.parse(montajeALaURL(ENLACE));
    const sobra = { ...o, piezas: [...o.piezas, piezaNueva('escudo', eq)] };
    expect(() => montajeDeLaURL(JSON.stringify(sobra))).toThrow(
      'trae la pieza «Escudo 2» y no la lleva nadie',
    );
    const deLaNueva = (p: { id: string }) => p.id === nueva.id;
    const mala = {
      ...o,
      piezas: o.piezas.map((p: { id: string }) => (deLaNueva(p) ? { ...p, ataque: -1 } : p)),
    };
    expect(() => montajeDeLaURL(JSON.stringify(mala))).toThrow(
      'una pieza del enlace no vale: «Espada 2»: ataque tiene que ser un entero ≥ 0 y es -1',
    );
    // Sin la nueva, las cifras de quien la lleva no valen con lo que hay.
    const sinLaNueva = { ...o, piezas: o.piezas.filter((p: { id: string }) => !deLaNueva(p)) };
    expect(() => montajeDeLaURL(JSON.stringify(sinLaNueva))).toThrow(
      `no existe ninguna pieza "${nueva.id}"`,
    );
    // Sin una del fichero, quien la abre la tendría, pero el enlace no se abriría
    // igual en otra máquina: se rechaza diciéndolo.
    const sinElArco = { ...o, piezas: o.piezas.filter((p: { id: string }) => p.id !== 'arco') };
    expect(() => montajeDeLaURL(JSON.stringify(sinElArco))).toThrow(
      'el montaje del enlace no trae una pieza: lo montado lleva la pieza «arco» y no está',
    );
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
        piezas: piezasDelMontaje([guerrero(), conNueva], false, elCatalogoCon(nueva)),
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

  it('cambia a todos los que la llevan, de los dos bandos, conservando la herida; y lo dice el parte', () => {
    const b = pelea();
    const [a, a2] = conEspada(b) as [BattleStack, BattleStack];
    const arq = b.stacks.find((s) => s.body === 'goblin-arquero') as BattleStack;
    a.topHp -= 30;
    const antes = { a: { ...a }, a2: { ...a2 } };
    const desde = b.log.length;
    // La espada, con 3 de ataque más, se los da a los dos que la llevan (un arma
    // suma ataque y daño, no armadura: 18-10-2026).
    const mas = { ...ESPADA, ataque: ESPADA.ataque + 3 };
    const conMas = catalogoCon(mas);
    expect(
      retocarEnBatalla(b, { kind: 'piezas', equipo: conMas }, catalogoDe(b, EQUIPO_DEL_JUEGO)),
    ).toBeNull();
    expect(de(b, a2.id).unit.attack).toBe(antes.a2.unit.attack + 3);
    expect(armaduraDe(de(b, a2.id).unit)).toBe(armaduraDe(antes.a2.unit));
    expect(de(b, a2.id).unit.hp).toBe(antes.a2.unit.hp);
    // La herida se queda.
    expect(de(b, a.id).unit.hp - de(b, a.id).topHp).toBe(30);
    // El arquero no lleva espada: el mismo objeto.
    expect(b.stacks.find((s) => s.body === 'goblin-arquero')).toBe(arq);
    // El héroe pelea con la Espada, su equipo base: también le llega.
    const heroe = b.stacks.find((s) => s.origen.kind === 'heroe') as BattleStack;
    expect(b.log.slice(desde)).toEqual([
      {
        kind: 'retoque',
        nombre: 'Espada',
        stacks: [a.id, heroe.id, a2.id],
        cambios: [`ataque ${ESPADA.ataque} → ${ESPADA.ataque + 3}`],
      },
    ]);
    // Volver a la de antes deja las cifras de antes, con la herida.
    expect(
      retocarEnBatalla(b, { kind: 'piezas', equipo: EQUIPO_DEL_JUEGO }, catalogoDe(b, conMas)),
    ).toBeNull();
    expect(de(b, a.id).unit).toEqual(antes.a.unit);
    expect(de(b, a.id).topHp).toBe(antes.a.topHp);
    expect(b.log.at(-1)).toMatchObject({
      cambios: [`ataque ${ESPADA.ataque + 3} → ${ESPADA.ataque}`],
    });
  });

  it('lo que deja sin valer a un stack se rechaza con su nombre y no toca nada', () => {
    const b = pelea();
    expect(
      retocarEnBatalla(
        b,
        { kind: 'piezas', equipo: catalogoCon({ ...ESPADA, manos: 2 }) },
        catalogoDe(b, EQUIPO_DEL_JUEGO),
      ),
    ).toBe(
      `la lleva «${guerrero().name}»: Espada es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo`,
    );
    expect(b.log.some((e) => e.kind === 'retoque')).toBe(false);
  });

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

  it('lista el catálogo entero en cuatro secciones, con de dónde sale cada una, y cuenta lo que no se ha guardado', () => {
    const m = vista('espada');
    expect([...m.matchAll(/data-seccion-de-equipo="([^"]+)"/g)].map((x) => x[1])).toEqual([
      'cuerpo',
      'distancia',
      'armadura',
      'escudo',
    ]);
    for (const h of ['arma', 'distancia', 'armadura', 'escudo']) {
      expect(m).toContain(`data-arena="crear-pieza" data-hueco="${h}"`);
    }
    expect(m.match(/data-arena="elegir-pieza"/g)).toHaveLength(piezas.piezas.size);
    // La lanza va con el cuerpo a cuerpo.
    const cuerpo = m.slice(
      m.indexOf('data-seccion-de-equipo="cuerpo"'),
      m.indexOf('data-seccion-de-equipo="distancia"'),
    );
    expect(cuerpo).toContain('data-pieza="lanza_de_jinete"');
    expect(cuerpo).toContain('data-pieza="maza"');
    // De dónde sale: la Espada, de la armería; la maza, del botín; la nueva, de ninguno.
    const tarjeta = (id: string) =>
      m.slice(m.indexOf(`data-pieza="${id}"`)).split('</button>')[0] as string;
    expect(tarjeta('espada')).toContain('data-se-consigue="armeria"');
    expect(tarjeta('maza')).toContain('data-se-consigue="botin"');
    expect(tarjeta(nueva.id)).toContain('data-se-consigue="ninguno"');
    expect(m).not.toContain('de serie');
    // La de herrería dice sobre qué va.
    expect(m).toMatch(/data-pieza="espada_de_herreria"[\s\S]*?sobre Espada</);
    expect(m).toContain('Sin guardar: 2 piezas y 1 unidad.');
    expect(sinGuardarEnPalabras(0, 0)).toBe('');
  });

  it('la ficha dice de dónde se consigue con dos casillas, marcadas según la pieza', () => {
    const casillas = (id: string) =>
      [
        ...vista(id).matchAll(/data-arena-pieza-campo="se-consigue-(armeria|botin)"( checked)?/g),
      ].map((x) => `${x[1]}${x[2] === undefined ? '' : ' ✓'}`);
    expect(casillas('espada')).toEqual(['armeria ✓', 'botin']);
    expect(casillas('maza')).toEqual(['armeria', 'botin ✓']);
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

  it('cada tipo enseña solo sus cifras, y la rueda solo el cuerpo a cuerpo', () => {
    const campos = (id: string): string[] =>
      [...vista(id).matchAll(/data-arena-pieza-campo="([^"]+)"/g)]
        .map((x) => x[1] as string)
        .filter(
          (c) =>
            !['nombre', 'base', 'hueco', 'manos'].includes(c) &&
            !c.startsWith('rueda-') &&
            !c.startsWith('se-consigue-'),
        );
    expect(campos('espada')).toEqual(['ataque', 'danio-min', 'danio-max', 'precio-gold']);
    expect(campos('arco')).toEqual(['ataque', 'danio-min', 'danio-max', 'precio-gold']);
    expect(campos('brigantina')).toEqual(['defensa', 'armadura', 'velocidad', 'precio-gold']);
    expect(campos('escudo')).toEqual(['defensa', 'velocidad', 'precio-gold']);
    for (const id of ['espada', 'maza', 'lanza_de_jinete']) {
      expect(vista(id), id).toContain('data-rueda-de-la-pieza="si"');
      // Seis tipos: Normal no tiene nivel.
      expect(vista(id).match(/data-arena-pieza-campo="rueda-/g), id).toHaveLength(6);
      expect(vista(id), id).not.toContain('data-arena-pieza-campo="rueda-normal"');
    }
    for (const id of ['arco', 'brigantina', 'escudo']) {
      expect(vista(id), id).not.toContain('data-rueda-de-la-pieza');
    }
    // La maza: Fuerte en el nivel 5 → ×1,83 y Rápido en el 1 → 2 golpes ×0,38.
    const maza = vista('maza');
    expect(maza).toMatch(/data-arena-pieza-campo="rueda-fuerte" value="5"/);
    expect(maza).toContain('Daño ×1,83');
    expect(maza).toContain('2 golpes ×0,38');
    // Sin base, la casilla es el nivel, de 0 a 6.
    expect(maza).toMatch(/min="0" max="6" data-arena-pieza-campo="rueda-fuerte"/);
  });

  it('la rueda se edita en barras de 0 a 6, «+» sube un nivel (también en la Finta), y la rueda teñida va al lado', () => {
    const maza = vista('maza');
    // Seis filas, dos pasos cada una; ninguna de Normal.
    expect(maza.match(/data-arena="paso-de-rueda"/g)).toHaveLength(12);
    expect(maza).not.toContain('class="barra-de-la-rueda" data-tipo="normal"');
    expect(maza).toContain('data-arena="paso-de-rueda" data-tipo="finta" data-sentido="1"');
    const fila = (t: string) =>
      maza.slice(maza.indexOf(`class="barra-de-la-rueda" data-tipo="${t}"`)).split('</div>')[0];
    // La barra, llena desde la izquierda hasta el nivel: Fuerte 5 de 6 (50 de 60).
    expect(fila('fuerte')).toContain('data-nivel="5"');
    expect(fila('fuerte')).toContain('class="relleno" x="0" y="1.5" width="50"');
    // La Finta en el 1: lo que da, de menos a más casillas.
    expect(fila('finta')).toContain('data-nivel="1"');
    expect(fila('finta')).toContain('resta 3 a 7 casillas');
    // Rápido en el 1: se puede bajar y subir.
    expect(fila('rapido')).toMatch(/data-sentido="-1" aria-label="Rápido: un nivel menos" >/);
    // En el 0 no se baja, y en el 6 no se sube.
    const daga = vista('daga');
    const filaDe = (m: string, t: string) =>
      m.slice(m.indexOf(`class="barra-de-la-rueda" data-tipo="${t}"`)).split('</div>')[0];
    expect(filaDe(daga, 'rapido')).toContain('data-nivel="6"');
    expect(filaDe(daga, 'rapido')).toMatch(/aria-label="Rápido: un nivel más" disabled>/);
    expect(filaDe(daga, 'rapido')).not.toMatch(/un nivel menos" disabled/);
    const peor = vista(nuevaEnCero.id);
    expect(filaDe(peor, 'fuerte')).toContain('data-nivel="0"');
    expect(filaDe(peor, 'fuerte')).toMatch(/aria-label="Fuerte: un nivel menos" disabled>/);
    expect(filaDe(peor, 'fuerte')).not.toContain('class="relleno"');
    // La rueda de al lado, teñida por nivel; Normal, en el centro, sin nivel.
    expect(maza).toMatch(/class="disco rueda-de-la-pieza"/);
    expect(maza).toContain('data-sector="fuerte" data-nivel="5"');
    expect(maza).toContain('data-sector="rapido" data-nivel="1"');
    expect(maza).toContain('data-sector="ofensivo" data-nivel="3"');
    expect(maza).toMatch(/<circle class="sector centro" data-sector="normal" r=/);
    expect(maza).not.toContain('data-mejora');
    // El nivel no va en la fila (un antepasado de los botones): `pintar` busca el
    // botón con el foco del teclado por sus `data-*`, y uno que cambia a cada paso
    // se lo perdía (QA de la vuelta 2, H1).
    expect(maza).not.toMatch(/class="barra-de-la-rueda"[^>]*data-nivel/);
  });

  it('una con base dice su cadena y su extra por cifra; el desplegable no ofrece ni ella ni lo que está sobre ella', () => {
    const m = vista('espada_bendita');
    expect(m).toContain('Espada → Espada de herrería → Espada bendita');
    // El extra se escribe; el final, en su `<output>`.
    expect(m).toMatch(/data-arena-pieza-campo="ataque" value="1"/);
    expect(m).toMatch(
      new RegExp(`data-final="ataque"[^>]*>${piezas.pieza('espada_bendita').ataque}<`),
    );
    // Sobre la Espada cambiada (+7 de ataque): 2 + 7, +1 y +1.
    expect(piezas.pieza('espada_bendita').ataque).toBe(ESPADA_MAS.ataque + 2);
    // La rueda: la casilla, lo que sube sobre la base; la barra, el nivel final.
    expect(m).toMatch(/data-arena-pieza-campo="rueda-ofensivo" value="1"/);
    expect(m).toMatch(/data-arena-pieza-campo="rueda-finta" value="0"/);
    expect(
      m.slice(m.indexOf('class="barra-de-la-rueda" data-tipo="ofensivo"')).split('</div>')[0],
    ).toContain('class="barra" data-nivel="4"');
    expect(m).not.toMatch(/min="0" max="6" data-arena-pieza-campo="rueda-/);
    // Con base, las manos y el hueco son los de la base: no se escriben.
    expect(m).not.toContain('data-arena-pieza-campo="manos"');
    expect(m).not.toContain('data-arena-pieza-campo="hueco"');
    const opciones = (id: string): string[] => {
      const x = vista(id);
      const sel = x.slice(
        x.indexOf('data-arena-pieza-campo="base"'),
        x.indexOf('</select>', x.indexOf('data-arena-pieza-campo="base"')),
      );
      return [...sel.matchAll(/<option value="([^"]*)"/g)].map((o) => o[1] as string);
    };
    // La Espada no puede ir sobre la herrería ni la bendita (están sobre ella), ni sobre sí.
    const deLaEspada = opciones('espada');
    expect(deLaEspada).toContain('');
    expect(deLaEspada).toContain('maza');
    for (const id of [
      'espada',
      'espada_de_herreria',
      'espada_bendita',
      'arco',
      'lanza_de_jinete',
    ]) {
      expect(deLaEspada, id).not.toContain(id);
    }
    // La bendita va sobre la herrería, que sale elegida.
    expect(vista('espada_bendita')).toMatch(/<option value="espada_de_herreria" selected/);
  });

  it('toda pieza se borra; una entera de cuerpo a cuerpo elige entre arma y lanza, las demás no cambian de hueco', () => {
    const espada = vista('espada');
    expect(espada).toMatch(/data-arena="retirar-pieza"[^>]*>Borrar/);
    expect(espada).toContain('data-arena="crear-pieza-sobre"');
    expect(espada).toContain('data-arena-pieza-campo="manos"');
    expect(espada).toContain('Guerrero con escudo');
    // Un enlace abierto ya no pelea con otra pieza que la del catálogo: no hay aviso.
    expect(espada).not.toContain('data-aviso-del-enlace');
    const hueco = (m: string): string[] => {
      const h = m.slice(m.indexOf('data-arena-pieza-campo="hueco"'));
      return [...h.slice(0, h.indexOf('</select>')).matchAll(/value="([^"]+)"/g)].map(
        (x) => x[1] as string,
      );
    };
    expect(hueco(espada)).toEqual(['arma', 'lanza']);
    expect(hueco(vista(nueva.id))).toEqual(['arma', 'lanza']);
    // Una de otro tipo, o con base, no cambia de hueco.
    expect(vista('arco')).not.toContain('data-arena-pieza-campo="hueco"');
    expect(vista('espada_bendita')).not.toContain('data-arena-pieza-campo="hueco"');
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
      for (const id of ids) expect(EQUIPO_DEL_JUEGO.pieza(id), id).toMatchObject({ hueco });
    }
    // Un hueco que no existe no se monta.
    expect(() =>
      validarUnidad({ ...guerrero(), equipo: { accesorio: 'escudo' } }, EQUIPO_DEL_JUEGO),
    ).toThrow('no hay ningún hueco "accesorio"');
  });

  it('lo que ofrece entra y lo desactivado se rechaza con el motivo que enseña, en todo el catálogo', () => {
    for (const u of UNIDADES) {
      const h = { id: u.id };
      const m = ficha(u);
      for (const hueco of HUECOS) {
        for (const o of ofrecidas(m, hueco)) {
          const poner = (): Unidad =>
            validarUnidad(equiparEnArena(u, o.id, EQUIPO_DEL_JUEGO), EQUIPO_DEL_JUEGO);
          if (o.desactivada) expect(poner, `${h.id} ${o.id}`).toThrow();
          else expect(poner, `${h.id} ${o.id}`).not.toThrow();
        }
      }
    }
    // El escudo con el mandoble a dos manos: va, desactivado y con su motivo.
    const orco = unidadDeArena('orko-dos-armas');
    const escudos = opcionesDelHueco(orco, 'escudo', EQUIPO_DEL_JUEGO);
    expect(escudos.length).toBeGreaterThan(0);
    for (const e of escudos) expect(e.motivo, e.pieza.id).toMatch(/arma a dos manos/);
    expect(ficha(orco)).toMatch(/<option value="escudo" disabled>Escudo · no: .*a dos manos/);
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

  it('el héroe dice con qué arma pelea, y la Espada lo cuenta entre quienes la llevan', () => {
    const m = marcadoDe(renderFichaDeHeroe('izquierda', MAGO, como, []));
    const armas = m.slice(m.indexOf('data-armas-del-heroe'));
    expect(armas).toMatch(/data-arma-de-la-ficha="arma"[\s\S]*Espada ·/);
    expect(laLlevaElHeroe(ID_DE_LA_ESPADA)).toBe(true);
    expect(laLlevaElHeroe('mandoble')).toBe(false);
    const vista = marcadoDe(
      renderEquipo({
        piezas: EQUIPO_DEL_JUEGO,
        elegida: ID_DE_LA_ESPADA,
        llevan: () => ['Guerrero con escudo', LA_LLEVA_EL_HEROE],
        rechazo: null,
        enCombate: false,
        sinGuardar: '',
      }),
    );
    expect(vista).toContain('Guerrero con escudo, todo héroe (su equipo base)');
    expect(laLlevaElHeroe('gambeson')).toBe(true);
  });
});
