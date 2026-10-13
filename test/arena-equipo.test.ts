/**
 * El editor de equipo de la arena: las piezas del juego se cambian solo para la
 * arena, se crean nuevas, se guardan con las unidades y pelean —también a media
 * pelea— sin que el juego lo vea.
 *
 * Escritos desde los criterios del plan (`docs/agents/2026-10-12-editor-de-equipo/`):
 * cada regla con su caso que se rechaza, que es donde vive el fail-loud. Reglas,
 * no resultados de combate: las cifras salen de las piezas, no del JSON.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  guardadoEnPalabras,
  renderEquipo,
  sinGuardarEnPalabras,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import {
  batallaDeArena,
  CON_PIEZAS,
  cambioDePiezaBlocker,
  catalogoDeLaArena,
  conPieza,
  enElHueco,
  equiparEnArena,
  type HeroeDeArena,
  heroePorDefecto,
  idsLlevados,
  lecturaDelNivel,
  type MontajeDeArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeArenaDelEnlace,
  montajeDeLaURL,
  perfilDeLasHojas,
  piezaNueva,
  piezasDeLaArena,
  piezasDelEnlace,
  piezasDelMontaje,
  piezasQueSeGuardan,
  quitarEnArena,
  retocarEnBatalla,
  selloDePieza,
  sinPieza,
  type UnidadDeArena,
  unidadDeCombate,
  unidadNueva,
  VERSION_DEL_ENLACE,
  validarPiezaDeArena,
} from '../src/core/arena.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { EQUIPO, type Pieza } from '../src/core/data.js';
import {
  EQUIPO_BASE,
  PIEZAS_DE_ARMERIA,
  PIEZAS_DE_BOTIN,
  PIEZAS_DEL_CATALOGO,
  PIEZAS_DEL_JUEGO,
  pieza,
} from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import { escribirBorrador, leerBorrador, RUTA_DE_EQUIPO } from '../tools/arena/borrador.js';
import {
  DEL_JUEGO,
  delBorrador,
  hojaDeLaArena,
  hojasDeLaArena,
  MONTAJE,
  unidadDeArena,
} from './helpers.js';

const perfilDe = perfilDeLasHojas(hojasDeLaArena());
const ESPADA = pieza('espada');
const ARCO = pieza('arco');
/** La espada cambiada para la arena: más ataque que la del juego. */
const ESPADA_MAS: Pieza = { ...ESPADA, ataque: ESPADA.ataque + 7 };
const MAGO: HeroeDeArena = { ...heroePorDefecto('izquierda'), nombre: 'Maga de pruebas' };

/** El guerrero con escudo (espada, brigantina y escudo: su perfil) y el arquero goblin (arco). */
const guerrero = (): UnidadDeArena => unidadDeArena('templario-escudo');
const arquero = (): UnidadDeArena => unidadDeArena('goblin-arquero');
/** Una unidad nueva de otro tipo que también lleva la espada. */
function otroConEspada(): UnidadDeArena {
  const ocupados = { validas: [], sinValidar: [], hojas: hojasDeLaArena().map((h) => h.id) };
  const u = unidadNueva({ hoja: hojaDeLaArena('templario-escudo') }, ocupados, DEL_JUEGO);
  return equiparEnArena(u, 'espada', DEL_JUEGO);
}

describe('las piezas de la arena', () => {
  it('van encima de las del juego, y el juego no las ve', () => {
    const nueva = piezaNueva('arma', DEL_JUEGO);
    const eq = catalogoDeLaArena([ESPADA_MAS, nueva]);
    expect(eq.pieza('espada').ataque).toBe(ESPADA_MAS.ataque);
    // La nueva, detrás de las del juego; las del juego, en su orden.
    expect([...eq.piezas.keys()]).toEqual([...EQUIPO.map((p) => p.id), nueva.id]);
    expect(piezasDeLaArena(eq)).toEqual([validarPiezaDeArena(ESPADA_MAS), nueva]);
    expect([ESPADA, validarPiezaDeArena(ESPADA_MAS), nueva].map(selloDePieza)).toEqual([
      'del juego',
      'cambiada',
      'nueva',
    ]);
    // El juego sigue con las suyas: catálogo, botín, armería, equipo base y agente.
    expect(PIEZAS_DEL_CATALOGO.get('espada')).toBe(ESPADA);
    expect([...PIEZAS_DE_BOTIN, ...PIEZAS_DE_ARMERIA, ...PIEZAS_DEL_JUEGO]).not.toContain(nueva);
    expect(Object.values(EQUIPO_BASE)).not.toContain(nueva.id);
    expect(() => catalogoDeLaArena([ESPADA_MAS, ESPADA_MAS])).toThrow('va dos veces');
  });

  it('una del juego no cambia de hueco ni de calidad; una nueva es de la arena; lo ajeno se dice', () => {
    expect(() => validarPiezaDeArena({ ...ESPADA, hueco: 'accesorio' })).toThrow(
      '«Espada» es una pieza del juego y va en Arma: su hueco no se cambia en la arena',
    );
    expect(() => validarPiezaDeArena({ ...pieza('garrote'), calidad: 'arena' })).toThrow(
      'su calidad no se cambia en la arena',
    );
    expect(() => validarPiezaDeArena({ ...ESPADA, id: 'espada-9', calidad: 'comun' })).toThrow(
      'es una pieza nueva y su calidad es «arena»',
    );
    expect(() => validarPiezaDeArena({ ...ESPADA, filo: 3 })).toThrow(
      '«filo» no es un campo de una pieza',
    );
    expect(() => validarPiezaDeArena({ ...ESPADA, id: 'Espada Mala' })).toThrow(
      'el id «Espada Mala» va en minúsculas',
    );
  });

  it('muerde con la regla de una pieza del catálogo: el escudo resta, las manos son de un arma, el daño en orden', () => {
    expect(() => validarPiezaDeArena({ ...pieza('escudo'), velocidad: 1 })).toThrow(
      '«Escudo» es un escudo y tiene que restar velocidad (un número negativo), y es 1',
    );
    expect(() => validarPiezaDeArena({ ...pieza('brigantina'), manos: 2 })).toThrow(
      'solo un arma se lleva a dos manos',
    );
    expect(() => validarPiezaDeArena({ ...ESPADA, danio: [30, 10] })).toThrow(
      'el daño mínimo que suma (30) pasa del máximo (10)',
    );
    // Para la persona: qué hacer, el recurso en español y un campo vacío sin «NaN».
    expect(() => validarPiezaDeArena({ ...ESPADA, nombre: ' ' })).toThrow(
      'no tiene nombre: escribe uno',
    );
    expect(() => validarPiezaDeArena({ ...ESPADA, precio: { gold: -5 } })).toThrow(
      '«Espada» cuesta -5 de oro: tiene que ser un entero ≥ 0',
    );
    expect(() => validarPiezaDeArena({ ...ESPADA, ataque: Number.NaN })).toThrow(
      '«Espada»: ataque tiene que ser un entero ≥ 0 y no es un número',
    );
    // Lo que no suma se escribe sin el campo: una mano, 0 disparos.
    expect(validarPiezaDeArena({ ...ESPADA, manos: 1, disparos: 0 })).toEqual(ESPADA);
  });

  it('cambiar el hueco rehace lo que el hueco exige: el escudo resta y las manos son de un arma', () => {
    const arma = { ...piezaNueva('arma', DEL_JUEGO), manos: 2 as const };
    const escudo = validarPiezaDeArena(enElHueco(arma, 'escudo'));
    expect(escudo).toMatchObject({ hueco: 'escudo', velocidad: -1 });
    expect(escudo.manos).toBeUndefined();
    // Lo que ya restaba se queda; lo que el escudo exigía se va con él: de vuelta
    // al arma no resta. Un arma que ya restaba sin ser escudo, sigue restando.
    expect(enElHueco({ ...escudo, velocidad: -2 }, 'escudo').velocidad).toBe(-2);
    expect(validarPiezaDeArena(enElHueco(escudo, 'arma')).velocidad).toBe(0);
    expect(enElHueco({ ...arma, velocidad: -1 }, 'accesorio').velocidad).toBe(-1);
  });

  it('«Nueva pieza» y «Duplicar» dan un id libre y una pieza de la arena', () => {
    const escudo = piezaNueva('escudo', DEL_JUEGO);
    expect(escudo).toMatchObject({ id: 'escudo-2', nombre: 'Escudo 2', calidad: 'arena' });
    expect(escudo.velocidad).toBeLessThan(0);
    const eq = catalogoDeLaArena([escudo]);
    expect(piezaNueva('escudo', eq).id).toBe('escudo-3');
    // Uno del borrador que no vale tampoco se pisa.
    expect(piezaNueva('escudo', eq, ['escudo-3']).id).toBe('escudo-4');
    const copia = piezaNueva(ESPADA, DEL_JUEGO);
    expect(copia).toEqual({ ...ESPADA, id: 'espada-2', nombre: 'Espada 2' });
    // La copia de una copia no encadena sufijos.
    expect(piezaNueva(copia, catalogoDeLaArena([copia])).id).toBe('espada-3');
    // Ni el nombre de otra: con «Espada 2» ya puesto a otra pieza, la copia salta.
    const ocupa = { ...piezaNueva('accesorio', DEL_JUEGO), nombre: 'Espada 2' };
    expect(piezaNueva(ESPADA, catalogoDeLaArena([ocupa]))).toMatchObject({
      id: 'espada-3',
      nombre: 'Espada 3',
    });
  });

  it('una del juego que vuelve a sus cifras deja de estar cambiada; quitar lo que no está se dice', () => {
    const cambiadas = conPieza([], ESPADA_MAS);
    expect(cambiadas).toHaveLength(1);
    expect(conPieza(cambiadas, { ...ESPADA })).toEqual([]);
    expect(sinPieza(cambiadas, 'espada')).toEqual([]);
    expect(() => sinPieza([], 'espada')).toThrow('no está cambiada ni es nueva');
  });
});

describe('la arena pelea con sus piezas', () => {
  it('la espada cambiada suma en la unidad y en la pelea, y el nivel no cambia', () => {
    const eq = catalogoDeLaArena([ESPADA_MAS]);
    const u = guerrero();
    const delJuego = unidadDeCombate(u, DEL_JUEGO);
    const deLaArena = unidadDeCombate(u, eq);
    expect(deLaArena.attack - delJuego.attack).toBe(ESPADA_MAS.ataque - ESPADA.ataque);
    expect(lecturaDelNivel(deLaArena)).toBe(lecturaDelNivel(delJuego));
    const b = batallaDeArena(
      {
        izquierda: { unidades: [delBorrador(u)], heroe: null },
        derecha: { unidades: [delBorrador(arquero())], heroe: null },
        ...MONTAJE,
        piezas: [ESPADA_MAS],
      },
      createRng(1),
    );
    expect(b.stacks[0]?.unit.attack).toBe(deLaArena.attack);
    expect(b.piezasDeArena).toEqual([validarPiezaDeArena(ESPADA_MAS)]);
  });

  it('una pieza nueva se pone como cualquier otra, con la misma regla de las manos', () => {
    const nueva = { ...piezaNueva('arma', DEL_JUEGO), manos: 2 as const };
    const eq = catalogoDeLaArena([nueva]);
    const u = guerrero();
    expect(() => equiparEnArena(u, nueva.id, eq)).toThrow(
      `${nueva.nombre} es un arma a dos manos y no se puede llevar con Escudo`,
    );
    const sinEscudo = quitarEnArena(u, 'escudo');
    expect(equiparEnArena(sinEscudo, nueva.id, eq).equipo.arma).toBe(nueva.id);
    // Con las piezas del juego, no existe.
    expect(() => equiparEnArena(sinEscudo, nueva.id, DEL_JUEGO)).toThrow(
      `pieza de equipo desconocida: "${nueva.id}"`,
    );
  });
});

describe('cambiar una pieza no deja sin valer a nadie del borrador', () => {
  it('pasar la espada a dos manos con el escudo puesto se rechaza nombrando a quién', () => {
    const motivo = cambioDePiezaBlocker([], [{ ...ESPADA, manos: 2 }], [guerrero(), arquero()]);
    expect(motivo).toBe(
      `la lleva «${guerrero().name}»: Espada es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo`,
    );
    // Sin nadie que la lleve, entra.
    expect(cambioDePiezaBlocker([], [{ ...ESPADA, manos: 2 }], [arquero()])).toBeNull();
  });

  it('borrar una nueva que alguien lleva, no; y lo que no vale de la pieza, tampoco', () => {
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const conElla = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    expect(cambioDePiezaBlocker([nueva], [], [conElla])).toBe(
      `la lleva «${conElla.name}»: quítasela antes de borrar «${nueva.nombre}»`,
    );
    expect(cambioDePiezaBlocker([nueva], [], [arquero()])).toBeNull();
    expect(cambioDePiezaBlocker([], [{ ...pieza('escudo'), velocidad: 1 }], [])).toMatch(
      /es un escudo y tiene que restar velocidad/,
    );
  });

  it('dos piezas no se llaman igual: el nombre de otra se rechaza diciendo cuál', () => {
    const copia = piezaNueva(ESPADA, DEL_JUEGO);
    expect(cambioDePiezaBlocker([copia], [{ ...copia, nombre: ' espada ' }], [])).toBe(
      'ya hay una pieza que se llama «Espada» (Arma): ponle otro nombre, que en la ficha de una unidad no se distinguirían',
    );
    expect(cambioDePiezaBlocker([copia], [{ ...copia, nombre: 'Espada corta' }], [])).toBeNull();
  });
});

// ------------------------------------------------------------------ el enlace

describe('el enlace de la pelea lleva las piezas de la arena', () => {
  const nueva = { ...piezaNueva(ESPADA, DEL_JUEGO), ataque: ESPADA.ataque + 3 };
  const eq = catalogoDeLaArena([nueva]);
  const conNueva = equiparEnArena(guerrero(), nueva.id, eq);
  const lado = (unidad: string, ia: boolean) => ({
    ia,
    puestos: [{ kind: 'unidad' as const, unidad, escalera: false }],
    heroe: null,
  });
  const ENLACE: MontajeDelEnlace = {
    unidades: [conNueva, arquero()],
    piezas: [nueva],
    pruebas: {},
    izquierda: lado(conNueva.id, false),
    derecha: lado('goblin-arquero', true),
    muralla: null,
  };

  it('versión 6: va y vuelve con la pieza nueva, y monta con las del juego más las suyas', () => {
    expect(VERSION_DEL_ENLACE).toBe(CON_PIEZAS);
    const leido = montajeDeLaURL(montajeALaURL(ENLACE));
    expect(leido).toEqual({ ...ENLACE, version: VERSION_DEL_ENLACE });
    const montado = montajeDeArenaDelEnlace(leido, MONTAJE.reglas, leido.piezas);
    expect(batallaDeArena(montado, createRng(3)).stacks[0]?.unit.attack).toBe(
      unidadDeCombate(conNueva, eq).attack,
    );
    // Lo que va en el enlace es lo que lleva lo montado (`idsLlevados`).
    expect(piezasDelMontaje(ENLACE.unidades, false, [nueva, ESPADA_MAS])).toEqual([nueva]);
    expect(idsLlevados([], true)).toEqual(new Set(Object.values(EQUIPO_BASE)));
  });

  it('abierto en una arena con piezas cambiadas, lo que lleva pelea con las del enlace o las del juego', () => {
    // El arquero lleva el arco del juego: el enlace lo trae tal cual, y encima del
    // borrador deshace el arco cambiado de esta arena; la espada, que nadie lleva
    // en el enlace, se queda como está.
    const capa = piezasDelEnlace(montajeDeLaURL(montajeALaURL(ENLACE)));
    const aqui = [ESPADA_MAS, { ...ARCO, ataque: ARCO.ataque + 1 }];
    expect(capa.reduce(conPieza, aqui)).toEqual([validarPiezaDeArena(ESPADA_MAS), nueva]);
  });

  it('una pieza que nadie lleva, una que no vale o una que falta se rechazan diciendo cuál', () => {
    const o = JSON.parse(montajeALaURL(ENLACE));
    const sobra = { ...o, piezas: [...o.piezas, piezaNueva('escudo', eq)] };
    expect(() => montajeDeLaURL(JSON.stringify(sobra))).toThrow(
      'trae la pieza «Escudo 2» y no la lleva nadie',
    );
    const mala = { ...o, piezas: [{ ...o.piezas[0], ataque: -1 }] };
    expect(() => montajeDeLaURL(JSON.stringify(mala))).toThrow(
      'una pieza del enlace no vale: «Espada 2»: ataque tiene que ser un entero ≥ 0 y es -1',
    );
    const falta = { ...o, piezas: [] };
    expect(() => montajeDeLaURL(JSON.stringify(falta))).toThrow(
      `no existe ninguna pieza "${nueva.id}"`,
    );
  });

  it('un enlace de la versión 5 se lee con las piezas de la arena que lo abre', () => {
    const o = JSON.parse(
      montajeALaURL({
        ...ENLACE,
        unidades: [guerrero(), arquero()],
        piezas: [],
        izquierda: lado('templario-escudo', false),
      }),
    );
    o.v = 5;
    delete o.piezas;
    const leido = montajeDeLaURL(JSON.stringify(o), perfilDe, [ESPADA_MAS]);
    expect(leido.version).toBe(5);
    expect(leido.piezas).toEqual([]);
    // Si con las de aquí una unidad del enlace no vale, no se monta y se dice por qué.
    expect(() => montajeDeLaURL(JSON.stringify(o), perfilDe, [{ ...ESPADA, manos: 2 }])).toThrow(
      'Espada es un arma a dos manos y no se puede llevar con Escudo',
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
  const carpeta = (): string => {
    dir = mkdtempSync(join(tmpdir(), 'arena-equipo-'));
    return dir;
  };

  it('escribe los dos y los lee; sin piezas, no crea el de equipo; lo que no vale se conserva', () => {
    const d = carpeta();
    escribirBorrador(d, { unidades: [guerrero()], piezas: [] });
    expect(() => readFileSync(join(d, RUTA_DE_EQUIPO))).toThrow();
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    expect(escribirBorrador(d, { unidades: [con], piezas: [nueva, ESPADA_MAS] })).toMatchObject({
      unidades: 1,
      piezas: 2,
    });
    const leido = leerBorrador(d);
    expect(leido.unidades).toEqual([con]);
    expect(leido.piezas).toEqual([nueva, validarPiezaDeArena(ESPADA_MAS)]);
    const json = JSON.parse(readFileSync(join(d, RUTA_DE_EQUIPO), 'utf8')) as { _comment: string };
    expect(json._comment).toContain('El juego NO lo lee');
    // Una editada a mano que no vale se conserva tal cual al guardar.
    const mala = { ...piezaNueva('escudo', DEL_JUEGO), velocidad: 2 };
    writeFileSync(join(d, RUTA_DE_EQUIPO), JSON.stringify({ piezas: [nueva, mala] }));
    expect(leerBorrador(d).piezasInvalidas.map((i) => i.clave)).toEqual([mala.id]);
    expect(escribirBorrador(d, { unidades: [con], piezas: [nueva] }).piezasConservadas).toBe(1);
  });

  it('si algo no vale no escribe ninguno: una unidad con una pieza que no viene, o una pieza mala', () => {
    const d = carpeta();
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    expect(() => escribirBorrador(d, { unidades: [con], piezas: [] })).toThrow(
      `no existe ninguna pieza "${nueva.id}"`,
    );
    expect(() =>
      escribirBorrador(d, { unidades: [guerrero()], piezas: [{ ...ESPADA, ataque: -1 }] }),
    ).toThrow('ataque tiene que ser un entero ≥ 0');
    expect(leerBorrador(d)).toMatchObject({ unidades: [], piezas: [] });
  });

  it('tras abrir un enlace, «Guardar» no sustituye ni borra una pieza tuya; las nuevas del enlace, sí', () => {
    const d = carpeta();
    // Tu brigantina, cambiada y guardada.
    const tuya = { ...pieza('brigantina'), pv: pieza('brigantina').pv + 20 };
    escribirBorrador(d, { unidades: [], piezas: [tuya] });
    // El enlace lleva al guerrero con la brigantina del juego y al arquero con una nueva.
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const conNueva = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    const lado = (unidad: string) => ({
      ia: false,
      puestos: [{ kind: 'unidad' as const, unidad, escalera: false }],
      heroe: null,
    });
    const enlace = montajeDeLaURL(
      montajeALaURL({
        unidades: [guerrero(), conNueva],
        piezas: [nueva],
        pruebas: {},
        izquierda: lado(guerrero().id),
        derecha: lado(conNueva.id),
        muralla: null,
      }),
    );
    const delDisco = leerBorrador(d).piezas;
    const capa = piezasDelEnlace(enlace);
    // En la pelea va la del juego…
    expect(catalogoDeLaArena(capa.reduce(conPieza, delDisco)).pieza('brigantina').pv).toBe(
      pieza('brigantina').pv,
    );
    // …y al guardar, la tuya se queda y la nueva entra con las unidades del enlace.
    escribirBorrador(d, {
      unidades: [guerrero(), conNueva],
      piezas: piezasQueSeGuardan(delDisco, capa),
    });
    expect(leerBorrador(d).piezas).toEqual([validarPiezaDeArena(tuya), nueva]);
  });

  it('un equipo.json ilegible no deja ilegible el de unidades, y no se pisa al guardar', () => {
    const d = carpeta();
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    escribirBorrador(d, { unidades: [guerrero(), con], piezas: [nueva] });
    writeFileSync(join(d, RUTA_DE_EQUIPO), '{ roto');
    const leido = leerBorrador(d);
    expect(leido.equipoIlegible).toMatch(/no es JSON/);
    // Se leen con las del juego: la que lleva la nueva no vale y se conserva.
    expect(leido.unidades).toEqual([guerrero()]);
    expect(leido.invalidas.map((i) => i.id)).toEqual([con.id]);
    expect(() => escribirBorrador(d, { unidades: [guerrero()], piezas: [] })).toThrow(
      'no se guarda para no pisarlo',
    );
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
    return batallaDeArena(montaje, createRng(5));
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
    const mas = { ...ESPADA, pv: ESPADA.pv + 100 };
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [mas] })).toBeNull();
    expect(de(b, a2.id).unit.hp).toBe(antes.a2.unit.hp + 100);
    // Subir los PV no cura: la herida se queda.
    expect(de(b, a.id).unit.hp - de(b, a.id).topHp).toBe(30);
    // El arquero no lleva espada: el mismo objeto.
    expect(b.stacks.find((s) => s.body === 'goblin-arquero')).toBe(arq);
    expect(b.log.slice(desde)).toEqual([
      {
        kind: 'retoque',
        nombre: 'Espada',
        stacks: [a.id, a2.id],
        cambios: [`PV ${ESPADA.pv} → ${mas.pv}`],
      },
    ]);
    // Volver a la del juego deja las cifras de antes, con la herida.
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [] })).toBeNull();
    expect(de(b, a.id).unit).toEqual(antes.a.unit);
    expect(de(b, a.id).topHp).toBe(antes.a.topHp);
    expect(b.log.at(-1)).toMatchObject({
      cambios: [`PV ${mas.pv} → ${ESPADA.pv}`, 'vuelve a la del juego'],
    });
    expect(b.piezasDeArena).toEqual([]);
  });

  it('lo gastado de más se debe: bajar los disparos del arco y volver a subirlos no devuelve tiros', () => {
    const b = pelea();
    const arq = b.stacks.find((s) => s.body === 'goblin-arquero') as BattleStack;
    const quedan = 2;
    arq.shotsLeft = quedan;
    // El arco con `quedan + 1` disparos menos: se queda sin ninguno y debe uno.
    const menos = { ...ARCO, disparos: (ARCO.disparos ?? 0) - quedan - 1 };
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [menos] })).toBeNull();
    expect(de(b, arq.id).shotsLeft).toBe(0);
    expect(de(b, arq.id).gastadoDeMas?.disparos).toBe(1);
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [] })).toBeNull();
    expect(de(b, arq.id).shotsLeft).toBe(quedan);
    expect(de(b, arq.id).gastadoDeMas).toBeUndefined();
  });

  it('lo que deja sin valer a un stack se rechaza con su nombre y no toca nada', () => {
    const b = pelea();
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [{ ...ESPADA, manos: 2 }] })).toBe(
      `la lleva «${guerrero().name}»: Espada es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo`,
    );
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [{ ...ESPADA, ataque: -1 }] })).toMatch(
      /ataque tiene que ser un entero ≥ 0/,
    );
    expect(b.log.some((e) => e.kind === 'retoque')).toBe(false);
  });

  it('el héroe lleva el equipo base: si la arena lo cambia, su cuerpo cambia', () => {
    const b = pelea();
    const heroe = b.stacks.find((s) => s.origen.kind === 'heroe') as BattleStack;
    const armeria = pieza('espada_de_armeria');
    const piezas = [{ ...armeria, ataque: armeria.ataque + 5 }];
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas })).toBeNull();
    expect(de(b, heroe.id).unit.attack).toBe(heroe.unit.attack + 5);
  });

  it('tras quitarle la espada a un tipo, cambiar la espada ya no lo toca', () => {
    const b = pelea();
    const [a, a2] = conEspada(b) as [BattleStack, BattleStack];
    retocarEnBatalla(b, { kind: 'tipo', fuente: delBorrador(quitarEnArena(guerrero(), 'arma')) });
    const sinEspada = de(b, a.id).unit;
    retocarEnBatalla(b, { kind: 'piezas', piezas: [ESPADA_MAS] });
    expect(de(b, a.id).unit).toBe(sinEspada);
    expect(de(b, a2.id).unit.attack).toBe(a2.unit.attack + ESPADA_MAS.ataque - ESPADA.ataque);
  });

  it('con la batalla terminada no entra', () => {
    const b = pelea();
    b.finished = { winner: 'attacker' };
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [ESPADA_MAS] })).toBe(
      'la batalla ya ha terminado; el cambio vale para la pelea siguiente',
    );
  });
});

// ------------------------------------------------------------------ la vista

describe('la vista «Editar equipo»', () => {
  const nueva = piezaNueva('arma', DEL_JUEGO);
  const piezas = catalogoDeLaArena([ESPADA_MAS, nueva]);
  const vista = (elegida: string, rechazo: string | null = null) =>
    marcadoDe(
      renderEquipo({
        piezas,
        elegida,
        llevan: (id) => (id === 'espada' ? ['Guerrero con escudo'] : []),
        enLaPelea: (id) => (id === 'espada' ? ESPADA : null),
        rechazo,
        enCombate: false,
        sinGuardar: sinGuardarEnPalabras(2, 1),
      }),
    );

  it('lista las piezas por hueco con su sello, y cuenta lo que no se ha guardado', () => {
    const m = vista('espada');
    for (const h of ['arma', 'armadura', 'accesorio', 'escudo']) {
      expect(m).toContain(`data-arena="crear-pieza" data-hueco="${h}"`);
    }
    expect(m.match(/data-arena="elegir-pieza"/g)).toHaveLength(EQUIPO.length + 1);
    expect(m).toMatch(/data-pieza="espada"[\s\S]*?cambiada/);
    expect(m).toMatch(new RegExp(`data-pieza="${nueva.id}"[\\s\\S]*?nueva`));
    expect(m).toMatch(/data-pieza="garrote"[\s\S]*?del juego/);
    expect(m).toContain('Sin guardar: 2 piezas y 1 unidad.');
    expect(sinGuardarEnPalabras(0, 0)).toBe('');
  });

  it('una cambiada vuelve a la del juego y no cambia de hueco; una nueva se borra y elige hueco', () => {
    const cambiada = vista('espada');
    expect(cambiada).toMatch(/data-arena="retirar-pieza"[^>]*>Volver a la del juego/);
    expect(cambiada).not.toContain('data-arena-pieza-campo="hueco"');
    expect(cambiada).toContain('data-arena-pieza-campo="manos"');
    expect(cambiada).toContain('Guerrero con escudo');
    // Con un enlace abierto que pelea con otra, la ficha enseña la tuya y lo dice.
    expect(cambiada).toContain('En esta pelea va la del enlace');
    expect(vista('garrote')).not.toContain('data-aviso-del-enlace');
    const deLaArena = vista(nueva.id);
    expect(deLaArena).toMatch(/data-arena="retirar-pieza"[^>]*>Borrar/);
    expect(deLaArena).toContain('data-arena-pieza-campo="hueco"');
    // Una del juego tal cual no tiene nada que retirar; las manos, solo en un arma.
    expect(vista('garrote')).not.toContain('data-arena="retirar-pieza"');
    expect(vista('brigantina')).not.toContain('data-arena-pieza-campo="manos"');
    expect(vista('espada', 'No se cambia: X.')).toContain('class="aviso-de-pieza rechazo"');
  });

  it('lo guardado se dice en una frase, con lo que no vale y se conserva', () => {
    expect(guardadoEnPalabras({ ruta: 'u.json', unidades: 3, conservadas: 1 })).toBe(
      'Guardado en u.json: 3 unidades, y 1 que no vale, tal como estaba.',
    );
    expect(
      guardadoEnPalabras({ ruta: 'u.json', unidades: 1, rutaDePiezas: 'e.json', piezas: 2 }),
    ).toBe('Guardado en u.json: 1 unidad. Y en e.json: 2 piezas.');
  });
});
