/**
 * El editor de equipo de la arena: las piezas de la arena del fichero se cambian
 * solo para ella, se crean nuevas, se guardan con las unidades y pelean —también a
 * media pelea— sin que el juego lo vea. Desde el 18-10-2026, solo las de calidad
 * `arena`, por tipos (`docs/agents/2026-10-18-equipo-por-tipos-y-bases/`); las
 * bases, en `test/equipo-bases.test.ts`.
 *
 * Escritos desde los criterios del plan (`docs/agents/2026-10-12-editor-de-equipo/`):
 * cada regla con su caso que se rechaza, que es donde vive el fail-loud. Reglas,
 * no resultados de combate: las cifras salen de las piezas, no del JSON.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  batallaDeArena,
  cambioDePiezaBlocker,
  catalogoDeLaArena,
  conPieza,
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
  piezasDeLaArena,
  piezasDelEnlace,
  piezasDelMontaje,
  piezasQueSeGuardan,
  quitarBlocker,
  quitarEnArena,
  retocarEnBatalla,
  selloDePieza,
  sinPieza,
  unidadNueva,
  VERSION_DEL_ENLACE,
  validarPiezaDeArena,
} from '../src/core/arena.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import { REGLAS_DEL_JUEGO } from '../src/core/battle/reglas.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { UNIDADES } from '../src/core/catalogo.js';
import { cuentaTiros, EQUIPO, isShooter, type Pieza } from '../src/core/data.js';
import {
  EQUIPO_BASE,
  PIEZAS_DE_ARMERIA,
  PIEZAS_DE_BOTIN,
  PIEZAS_DEL_CATALOGO,
  PIEZAS_DEL_JUEGO,
  pieza,
} from '../src/core/hero/equipo.js';
import { indiceDePoder } from '../src/core/nivel.js';
import { createRng } from '../src/core/rng.js';
import { HUECOS_DE_LA_ARENA, type HuecoDeArena } from '../src/core/types.js';
import {
  ESPADA_DE_LA_ARENA,
  equipoDeArenaBlocker,
  piezaDelJuegoBlocker,
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  type UnidadDeArena,
  unidadDeCombate,
  validarUnidadDeArena,
} from '../src/core/unidad.js';
import { escribirCatalogo, leerCatalogo, RUTA_DE_EQUIPO } from '../tools/arena/borrador.js';
import {
  DEL_JUEGO,
  delBorrador,
  hojaDeLaArena,
  hojasDeLaArena,
  MONTAJE,
  todoA,
  unidadDeArena,
} from './helpers.js';

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
  const u = unidadNueva(hojaDeLaArena('templario-escudo'), ocupados, DEL_JUEGO);
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

  it('un arma de cuerpo a cuerpo nueva nace con la rueda de la Espada; la de otro hueco, sin rueda', () => {
    const deLaEspada = ESPADA.rueda;
    expect(deLaEspada).toBeDefined();
    expect((piezaNueva('arma', DEL_JUEGO) as Pieza).rueda).toEqual(deLaEspada);
    expect((piezaNueva('carga', DEL_JUEGO) as Pieza).rueda).toEqual(deLaEspada);
    for (const h of ['distancia', 'armadura', 'escudo'] as const) {
      expect(piezaNueva(h, DEL_JUEGO), h).not.toHaveProperty('rueda');
    }
    // Pasar un arco a cuerpo a cuerpo le da la rueda de una nueva; y al revés, la pierde.
    const arco = piezaNueva('distancia', DEL_JUEGO) as Pieza;
    expect(enElHueco(arco, 'arma').rueda).toEqual(deLaEspada);
    expect(enElHueco(pieza('maza'), 'distancia')).not.toHaveProperty('rueda');
    // Un 0 es un nivel: la forma canónica lo escribe, y va y vuelve.
    const enCero = validarPiezaDeArena({
      ...arco,
      hueco: 'arma',
      rueda: { ...todoA(3), fuerte: 0 },
    });
    expect((enCero as Pieza).rueda).toEqual({ ...todoA(3), fuerte: 0 });
    expect(validarPiezaDeArena(JSON.parse(JSON.stringify(enCero)))).toEqual(enCero);
  });

  it('un arma a distancia nueva, sin disparos, ya hace tirador a quien la lleva (13-10-2026)', () => {
    // Sin munición: llevarla es disparar. Antes nacía con los 12 del arco (H1 del QA
    // de las armas por uso), que con 0 no se usaba nunca.
    const nueva = piezaNueva('distancia', DEL_JUEGO);
    expect(nueva).not.toHaveProperty('disparos');
    expect(DEL_JUEGO.pieza('arco')).not.toHaveProperty('disparos');
    const eq = catalogoDeLaArena([nueva]);
    const conElla = unidadDeCombate(equiparEnArena(guerrero(), nueva.id, eq), eq);
    expect(isShooter(conElla)).toBe(true);
    expect(cuentaTiros(conElla)).toBe(false);
    expect(isShooter(unidadDeCombate(guerrero(), DEL_JUEGO))).toBe(false);
  });

  it('una del fichero no cambia de hueco; una del juego no se cambia; una nueva es de la arena; lo ajeno se dice', () => {
    // El hueco lo mira la resolución (`resolverBases`), la misma para la entera y
    // para la que tiene base: la frase se dice en un sitio.
    // Sin su rueda, que en el accesorio no va: así lo que se dice es el hueco.
    const { rueda: _, ...espadaSinRueda } = ESPADA;
    expect(() => catalogoDeLaArena([{ ...espadaSinRueda, hueco: 'accesorio' }])).toThrow(
      '«Espada» es una pieza de data/equipo.json y va en Arma: su hueco no se cambia en la arena',
    );
    // Solo las de la arena (18-10-2026): ni el garrote, ni con otra calidad.
    expect(() =>
      validarPiezaDeArena({ ...pieza('garrote'), calidad: 'arena', rueda: ESPADA.rueda }),
    ).toThrow(
      '«Garrote» es una pieza del juego de calidad «comun»: en la arena solo se cambian las piezas de la arena',
    );
    expect(() => validarPiezaDeArena({ ...pieza('garrote'), ataque: 5 })).toThrow(
      'en la arena solo se cambian las piezas de la arena',
    );
    // Sin su rueda, que en otra calidad no va: así lo que se dice es la calidad.
    expect(() =>
      validarPiezaDeArena({ ...espadaSinRueda, id: 'espada-9', calidad: 'comun' }),
    ).toThrow('es una pieza de la arena y su calidad es «arena»');
    // Con ella, también se dice.
    expect(() => validarPiezaDeArena({ ...ESPADA, id: 'espada-9', calidad: 'comun' })).toThrow(
      '«Espada» es de calidad comun y lleva rueda del golpe: la rueda es solo de la arena',
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
    // Lo que no suma se escribe sin el campo: una mano.
    expect(validarPiezaDeArena({ ...ESPADA, manos: 1 })).toEqual(ESPADA);
    // Los disparos ya no son un campo (13-10-2026): sin munición.
    expect(() => validarPiezaDeArena({ ...ARCO, disparos: 12 })).toThrow(
      '«Arco»: «disparos» no es un campo de una pieza',
    );
  });

  it('cambiar el hueco rehace lo que el hueco exige: el escudo resta y las manos son de un arma', () => {
    const arma = { ...(piezaNueva('arma', DEL_JUEGO) as Pieza), manos: 2 as const };
    const escudo = validarPiezaDeArena(enElHueco(arma, 'escudo')) as Pieza;
    expect(escudo).toMatchObject({ hueco: 'escudo', velocidad: -1 });
    expect(escudo.manos).toBeUndefined();
    // Lo que ya restaba se queda; lo que el escudo exigía se va con él: de vuelta
    // al arma no resta. Un arma que ya restaba sin ser escudo, sigue restando.
    expect(enElHueco({ ...escudo, velocidad: -2 }, 'escudo').velocidad).toBe(-2);
    expect((validarPiezaDeArena(enElHueco(escudo, 'arma')) as Pieza).velocidad).toBe(0);
    expect(enElHueco({ ...arma, velocidad: -1 }, 'accesorio').velocidad).toBe(-1);
    // Lo que el hueco nuevo no suma se queda en 0 (18-10-2026): un arma que pasa a
    // escudo deja su ataque y su daño, y a armadura, también su rueda.
    const maza = pieza('maza');
    expect(enElHueco(maza, 'escudo')).toMatchObject({ ataque: 0, velocidad: -1 });
    expect(enElHueco(maza, 'escudo')).not.toHaveProperty('danio');
    expect(enElHueco(maza, 'armadura')).not.toHaveProperty('rueda');
    expect(enElHueco(maza, 'carga').rueda).toEqual(maza.rueda);
  });

  it('«Nueva pieza» y «Duplicar» dan un id libre y una pieza de la arena', () => {
    const escudo = piezaNueva('escudo', DEL_JUEGO) as Pieza;
    expect(escudo).toMatchObject({ id: 'escudo-2', nombre: 'Escudo 2', calidad: 'arena' });
    expect(escudo.velocidad).toBeLessThan(0);
    const eq = catalogoDeLaArena([escudo]);
    expect(piezaNueva('escudo', eq).id).toBe('escudo-3');
    // Uno del borrador que no vale tampoco se pisa.
    expect(piezaNueva('escudo', eq, ['escudo-3']).id).toBe('escudo-4');
    const copia = piezaNueva(ESPADA, DEL_JUEGO) as Pieza;
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
  it('la espada cambiada suma en la unidad y en la pelea, y el índice lo ve (18-10-2026)', () => {
    const eq = catalogoDeLaArena([ESPADA_MAS]);
    const u = guerrero();
    const delJuego = unidadDeCombate(u, DEL_JUEGO);
    const deLaArena = unidadDeCombate(u, eq);
    expect(deLaArena.attack - delJuego.attack).toBe(ESPADA_MAS.ataque - ESPADA.ataque);
    // El nivel se mide con el equipo puesto: más ataque en el arma, más índice.
    expect(indiceDePoder(deLaArena)).toBeGreaterThan(indiceDePoder(delJuego));
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
    const nueva = { ...(piezaNueva('arma', DEL_JUEGO) as Pieza), manos: 2 as const };
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
  const nueva = { ...(piezaNueva(ESPADA, DEL_JUEGO) as Pieza), ataque: ESPADA.ataque + 3 };
  const eq = catalogoDeLaArena([nueva]);
  const conNueva = equiparEnArena(guerrero(), nueva.id, eq);
  const lado = (unidad: string, ia: boolean) => ({
    ia,
    puestos: [{ unidad, escalera: false }],
    heroe: null,
  });
  const ENLACE: MontajeDelEnlace = {
    unidades: [conNueva, arquero()],
    piezas: [nueva],
    izquierda: lado(conNueva.id, false),
    derecha: lado('goblin-arquero', true),
    muralla: null,
  };

  it('va y vuelve con la pieza nueva, y monta con las del juego más las suyas', () => {
    expect(VERSION_DEL_ENLACE).toBe(11);
    const leido = montajeDeLaURL(montajeALaURL(ENLACE));
    expect(leido).toEqual(ENLACE);
    const montado = montajeDeArenaDelEnlace(leido, MONTAJE.reglas, leido.piezas);
    expect(batallaDeArena(montado, createRng(3)).stacks[0]?.unit.attack).toBe(
      unidadDeCombate(conNueva, eq).attack,
    );
    // Lo que va en el enlace es lo que lleva lo montado (`idsLlevados`).
    expect(piezasDelMontaje(ENLACE.unidades, false, [nueva, ESPADA_MAS])).toEqual([nueva]);
    // El héroe: el equipo base con la Espada de la arena (vuelta 2), que viaja si
    // está cambiada.
    expect(idsLlevados([], true)).toEqual(
      new Set(Object.values({ ...EQUIPO_BASE, arma: 'espada' })),
    );
    expect(piezasDelMontaje([], true, [ESPADA_MAS])).toEqual([validarPiezaDeArena(ESPADA_MAS)]);
    expect(piezasDelMontaje([], false, [ESPADA_MAS])).toEqual([]);
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
    escribirCatalogo(d, { unidades: [guerrero()], piezas: [] });
    expect(() => readFileSync(join(d, RUTA_DE_EQUIPO))).toThrow();
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    expect(
      escribirCatalogo(d, { unidades: [guerrero()], piezas: [nueva, ESPADA_MAS] }),
    ).toMatchObject({
      unidades: 1,
      piezas: 2,
    });
    const leido = leerCatalogo(d);
    expect(leido.unidades).toEqual([guerrero()]);
    expect(leido.piezas).toEqual([nueva, validarPiezaDeArena(ESPADA_MAS)]);
    const json = JSON.parse(readFileSync(join(d, RUTA_DE_EQUIPO), 'utf8')) as { _comment: string };
    expect(json._comment).toContain('El juego NO lo lee');
    // Una editada a mano que no vale se conserva tal cual al guardar.
    const mala = { ...(piezaNueva('escudo', DEL_JUEGO) as Pieza), velocidad: 2 };
    writeFileSync(join(d, RUTA_DE_EQUIPO), JSON.stringify({ piezas: [nueva, mala] }));
    expect(leerCatalogo(d).piezasInvalidas.map((i) => i.clave)).toEqual([mala.id]);
    expect(escribirCatalogo(d, { unidades: [guerrero()], piezas: [nueva] }).piezasConservadas).toBe(
      1,
    );
  });

  it('una unidad que solo vale con una pieza del borrador de equipo no entra en el catálogo del juego, y se dice', () => {
    // El catálogo (`data/unidades.json`) lo lee `core/catalogo.ts` con las piezas
    // de `data/equipo.json`: una unidad con una pieza nueva tumbaría su carga.
    // «Guardar» valida una vez, con esa misma regla (`validarCatalogo`).
    const d = carpeta();
    escribirCatalogo(d, { unidades: [guerrero()], piezas: [] });
    const antes = readFileSync(join(d, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8');
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    expect(() => escribirCatalogo(d, { unidades: [guerrero(), con], piezas: [nueva] })).toThrow(
      `data/unidades.json: la unidad «${con.name}»: no existe ninguna pieza "${nueva.id}"`,
    );
    // No se escribe ninguno de los dos.
    expect(readFileSync(join(d, RUTA_DEL_CATALOGO_DE_UNIDADES), 'utf8')).toBe(antes);
    expect(() => readFileSync(join(d, RUTA_DE_EQUIPO))).toThrow();
  });

  it('si algo no vale no escribe ninguno: una unidad con una pieza que no viene, o una pieza mala', () => {
    const d = carpeta();
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    expect(() => escribirCatalogo(d, { unidades: [con], piezas: [] })).toThrow(
      `no existe ninguna pieza "${nueva.id}"`,
    );
    expect(() =>
      escribirCatalogo(d, { unidades: [guerrero()], piezas: [{ ...ESPADA, ataque: -1 }] }),
    ).toThrow('ataque tiene que ser un entero ≥ 0');
    expect(leerCatalogo(d)).toMatchObject({ unidades: [], piezas: [] });
  });

  it('tras abrir un enlace, «Guardar» no sustituye ni borra una pieza tuya; las nuevas del enlace, sí', () => {
    const d = carpeta();
    // Tu brigantina, cambiada y guardada.
    const tuya = { ...pieza('brigantina'), armadura: (pieza('brigantina').armadura ?? 0) + 2 };
    escribirCatalogo(d, { unidades: [], piezas: [tuya] });
    // El enlace lleva al guerrero con la brigantina del juego y al arquero con una nueva.
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const conNueva = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    const lado = (unidad: string) => ({
      ia: false,
      puestos: [{ unidad, escalera: false }],
      heroe: null,
    });
    const enlace = montajeDeLaURL(
      montajeALaURL({
        unidades: [guerrero(), conNueva],
        piezas: [nueva],
        izquierda: lado(guerrero().id),
        derecha: lado(conNueva.id),
        muralla: null,
      }),
    );
    const delDisco = leerCatalogo(d).piezas;
    const capa = piezasDelEnlace(enlace);
    // En la pelea va la del juego…
    expect(catalogoDeLaArena(capa.reduce(conPieza, delDisco)).pieza('brigantina').armadura).toBe(
      pieza('brigantina').armadura,
    );
    // …y al guardar, la tuya se queda y la nueva entra. (La unidad que la lleva no
    // va al catálogo del juego: solo admite las piezas de `data/equipo.json`.)
    escribirCatalogo(d, {
      unidades: [guerrero()],
      piezas: piezasQueSeGuardan(delDisco, capa),
    });
    expect(leerCatalogo(d).piezas).toEqual([validarPiezaDeArena(tuya), nueva]);
  });

  it('un equipo.json ilegible no deja ilegible el de unidades, y no se pisa al guardar', () => {
    const d = carpeta();
    const nueva = piezaNueva('accesorio', DEL_JUEGO);
    const con = equiparEnArena(arquero(), nueva.id, catalogoDeLaArena([nueva]));
    // A mano: «Guardar» no deja una pieza del borrador en el catálogo del juego.
    mkdirSync(join(d, 'data/borradores'), { recursive: true });
    writeFileSync(
      join(d, RUTA_DEL_CATALOGO_DE_UNIDADES),
      JSON.stringify({ unidades: [guerrero(), con] }),
    );
    writeFileSync(join(d, RUTA_DE_EQUIPO), '{ roto');
    const leido = leerCatalogo(d);
    expect(leido.equipoIlegible).toMatch(/no es JSON/);
    // Se leen con las del juego: la que lleva la nueva no vale y se conserva.
    expect(leido.unidades).toEqual([guerrero()]);
    expect(leido.invalidas.map((i) => i.id)).toEqual([con.id]);
    expect(() => escribirCatalogo(d, { unidades: [guerrero()], piezas: [] })).toThrow(
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
    // La espada, con 3 de ataque más, se los da a los dos que la llevan (un arma
    // suma ataque y daño, no armadura: 18-10-2026).
    const mas = { ...ESPADA, ataque: ESPADA.ataque + 3 };
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [mas] })).toBeNull();
    expect(de(b, a2.id).unit.attack).toBe(antes.a2.unit.attack + 3);
    expect(armaduraDe(de(b, a2.id).unit)).toBe(armaduraDe(antes.a2.unit));
    expect(de(b, a2.id).unit.hp).toBe(antes.a2.unit.hp);
    // La herida se queda.
    expect(de(b, a.id).unit.hp - de(b, a.id).topHp).toBe(30);
    // El arquero no lleva espada: el mismo objeto.
    expect(b.stacks.find((s) => s.body === 'goblin-arquero')).toBe(arq);
    // El héroe pelea con la Espada de la arena (vuelta 2): también le llega.
    const heroe = b.stacks.find((s) => s.origen.kind === 'heroe') as BattleStack;
    expect(b.log.slice(desde)).toEqual([
      {
        kind: 'retoque',
        nombre: 'Espada',
        stacks: [a.id, heroe.id, a2.id],
        cambios: [`ataque ${ESPADA.ataque} → ${ESPADA.ataque + 3}`],
      },
    ]);
    // Volver a la del juego deja las cifras de antes, con la herida.
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas: [] })).toBeNull();
    expect(de(b, a.id).unit).toEqual(antes.a.unit);
    expect(de(b, a.id).topHp).toBe(antes.a.topHp);
    expect(b.log.at(-1)).toMatchObject({
      cambios: [`ataque ${ESPADA.ataque + 3} → ${ESPADA.ataque}`, 'vuelve a la de serie'],
    });
    expect(b.piezasDeArena).toEqual([]);
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

  it('el equipo base del héroe es del juego: la arena no lo cambia (18-10-2026; su arma, desde la vuelta 2, es la Espada de la arena)', () => {
    const b = pelea();
    const armeria = pieza('espada_de_armeria');
    const piezas = [{ ...armeria, ataque: armeria.ataque + 5 }];
    expect(retocarEnBatalla(b, { kind: 'piezas', piezas })).toBe(
      '«Espada de armería» es una pieza del juego de calidad «armeria»: en la arena solo se cambian las piezas de la arena',
    );
  });

  it('tras cambiarle la espada por la maza a un tipo, cambiar la espada ya no lo toca', () => {
    const b = pelea();
    const [a, a2] = conEspada(b) as [BattleStack, BattleStack];
    // Sin arma no se pelea (vuelta 2): se le cambia por otra.
    expect(
      retocarEnBatalla(b, {
        kind: 'tipo',
        fuente: delBorrador(equiparEnArena(guerrero(), 'maza', DEL_JUEGO)),
      }),
    ).toBeNull();
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
  /** Un arma con todo en el nivel 0, lo peor. */
  const nuevaEnCero: Pieza = {
    ...(nueva as Pieza),
    id: 'arma-en-cero',
    nombre: 'Arma en cero',
    rueda: todoA(0),
  };
  const piezas = catalogoDeLaArena([ESPADA_MAS, nueva, nuevaEnCero]);
  const vista = (elegida: string, rechazo: string | null = null, eq = piezas) =>
    marcadoDe(
      renderEquipo({
        piezas: eq,
        elegida,
        llevan: (id) => (id === 'espada' ? ['Guerrero con escudo'] : []),
        enLaPelea: (id) => (id === 'espada' ? ESPADA : null),
        rechazo,
        enCombate: false,
        sinGuardar: sinGuardarEnPalabras(2, 1),
      }),
    );

  it('lista solo las de la arena en cuatro secciones, sin accesorios, y cuenta lo que no se ha guardado', () => {
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
    expect(m).not.toContain('data-hueco="accesorio"');
    const deLaArena = [...piezas.piezas.values()].filter(
      (p) => p.calidad === 'arena' && p.hueco !== 'accesorio',
    );
    expect(m.match(/data-arena="elegir-pieza"/g)).toHaveLength(deLaArena.length);
    // Ni el garrote ni ningún accesorio ni la espada de armería.
    for (const id of ['garrote', 'amuleto_de_hueso', 'espada_de_armeria', 'botas_de_marcha']) {
      expect(m, id).not.toContain(`data-pieza="${id}"`);
    }
    // La lanza va con el cuerpo a cuerpo.
    const cuerpo = m.slice(
      m.indexOf('data-seccion-de-equipo="cuerpo"'),
      m.indexOf('data-seccion-de-equipo="distancia"'),
    );
    expect(cuerpo).toContain('data-pieza="lanza_de_jinete"');
    expect(cuerpo).toContain('data-pieza="maza"');
    expect(m).toMatch(/data-pieza="espada"[\s\S]*?cambiada/);
    expect(m).toMatch(new RegExp(`data-pieza="${nueva.id}"[\\s\\S]*?nueva`));
    expect(m).toMatch(/data-pieza="arco"[\s\S]*?de serie/);
    // La de herrería dice sobre qué va.
    expect(m).toMatch(/data-pieza="espada_de_herreria"[\s\S]*?sobre Espada</);
    expect(m).toContain('Sin guardar: 2 piezas y 1 unidad.');
    expect(sinGuardarEnPalabras(0, 0)).toBe('');
  });

  it('la de serie cuya base está cambiada dice «su base cambió», con cuál (QA 2)', () => {
    // `piezas` lleva la Espada cambiada: la de herrería sigue escrita igual.
    const m = vista('espada_de_herreria');
    const ficha = m.slice(m.indexOf('data-pieza-elegida'));
    expect(ficha).toContain('data-su-base-cambio="espada"');
    expect(ficha).toContain('su base cambió');
    // Con la Espada de serie, la de herrería vuelve a ser «de serie».
    const deSerie = vista('espada_de_herreria', null, catalogoDeLaArena([nueva]));
    expect(deSerie).not.toContain('su base cambió');
  });

  it('la ficha no tiene PV ni calidad, y un solo precio, en oro', () => {
    for (const id of ['espada', 'brigantina', 'escudo', 'arco', nueva.id]) {
      const m = vista(id);
      expect(m, id).not.toContain('data-arena-pieza-campo="pv"');
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
          (c) => !['nombre', 'base', 'hueco', 'manos'].includes(c) && !c.startsWith('rueda-'),
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

  it('una cambiada vuelve a la de serie y no cambia de hueco; una nueva se borra y elige entre arma y lanza', () => {
    const cambiada = vista('espada');
    expect(cambiada).toMatch(/data-arena="retirar-pieza"[^>]*>Volver a la de serie/);
    expect(cambiada).toContain('data-arena="crear-pieza-sobre"');
    expect(cambiada).not.toContain('data-arena-pieza-campo="hueco"');
    expect(cambiada).toContain('data-arena-pieza-campo="manos"');
    expect(cambiada).toContain('Guerrero con escudo');
    // Con un enlace abierto que pelea con otra, la ficha enseña la tuya y lo dice.
    expect(cambiada).toContain('En esta pelea va la del enlace');
    expect(vista('arco')).not.toContain('data-aviso-del-enlace');
    const deLaArena = vista(nueva.id);
    expect(deLaArena).toMatch(/data-arena="retirar-pieza"[^>]*>Borrar/);
    const hueco = deLaArena.slice(deLaArena.indexOf('data-arena-pieza-campo="hueco"'));
    expect(
      [...hueco.slice(0, hueco.indexOf('</select>')).matchAll(/value="([^"]+)"/g)].map((x) => x[1]),
    ).toEqual(['arma', 'carga']);
    // Una nueva de otro tipo no cambia de hueco.
    const escudo = piezaNueva('escudo', DEL_JUEGO);
    expect(vista(escudo.id, null, catalogoDeLaArena([escudo]))).not.toContain(
      'data-arena-pieza-campo="hueco"',
    );
    // Una de serie tal cual no tiene nada que retirar; las manos, solo en un arma.
    expect(vista('arco')).not.toContain('data-arena="retirar-pieza"');
    expect(vista('brigantina')).not.toContain('data-arena-pieza-campo="manos"');
    expect(vista('espada', 'No se cambia: X.')).toContain('class="aviso-de-pieza rechazo"');
    // Una del juego elegida (por un id que llegó de antes) no abre ficha.
    expect(vista('garrote')).toContain('Elige una pieza de la lista');
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

describe('la ficha de una unidad ofrece solo lo que el núcleo admite (H3 de la vuelta 2)', () => {
  const como = enElMontaje(REGLAS_DEL_JUEGO, DEL_JUEGO);
  const ficha = (u: UnidadDeArena): string => marcadoDe(renderFicha(u, false, como));
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

  it('en la arena solo cuentan las piezas de la arena: una armadura o un accesorio del juego no se monta', () => {
    const u = guerrero();
    expect(() =>
      validarUnidadDeArena({ ...u, equipo: { ...u.equipo, armadura: 'cota_de_malla' } }, DEL_JUEGO),
    ).toThrow(
      'lleva «Cota de malla» en Armadura, que es del juego: en la arena solo cuentan las piezas de la arena',
    );
    expect(piezaDelJuegoBlocker({ ...u.equipo, accesorio: 'anillo_de_cobre' }, DEL_JUEGO)).toMatch(
      /«Anillo de cobre» en Accesorio, que es del juego/,
    );
    expect(piezaDelJuegoBlocker(u.equipo, DEL_JUEGO)).toBeNull();
    // Y lo mismo al cambiar una pieza que alguien lleva: la pregunta es la misma.
    expect(equipoDeArenaBlocker({ arma: 'garrote' }, DEL_JUEGO)).toMatch(/que es del juego/);
  });

  it('ni piezas del juego ni accesorios: cada hueco, las de la arena del suyo', () => {
    const m = ficha(guerrero());
    expect(m).not.toContain('data-hueco-de-la-ficha="accesorio"');
    expect(m).not.toContain('data-arena-pieza="accesorio"');
    for (const juego of PIEZAS_DEL_JUEGO) expect(m, juego.id).not.toContain(`value="${juego.id}"`);
    for (const hueco of ['arma', 'distancia', 'carga', 'armadura', 'escudo'] as const) {
      const ids = ofrecidas(m, hueco).map((o) => o.id);
      expect(ids.length, hueco).toBeGreaterThan(0);
      for (const id of ids) {
        expect(DEL_JUEGO.pieza(id), id).toMatchObject({ hueco, calidad: 'arena' });
      }
    }
    expect(opcionesDelHueco(guerrero(), 'accesorio', DEL_JUEGO)).toEqual([]);
  });

  it('lo que ofrece entra y lo desactivado se rechaza con el motivo que enseña, en todo el catálogo', () => {
    for (const u of UNIDADES) {
      const h = { id: u.id };
      const m = ficha(u);
      for (const hueco of HUECOS_DE_LA_ARENA) {
        for (const o of ofrecidas(m, hueco)) {
          const poner = (): UnidadDeArena =>
            validarUnidadDeArena(equiparEnArena(u, o.id, DEL_JUEGO), DEL_JUEGO);
          if (o.desactivada) expect(poner, `${h.id} ${o.id}`).toThrow();
          else expect(poner, `${h.id} ${o.id}`).not.toThrow();
        }
      }
    }
    // El escudo con el mandoble a dos manos: va, desactivado y con su motivo.
    const orco = unidadDeArena('orko-dos-armas');
    const escudos = opcionesDelHueco(orco, 'escudo', DEL_JUEGO);
    expect(escudos.length).toBeGreaterThan(0);
    for (const e of escudos) expect(e.motivo, e.pieza.id).toMatch(/arma a dos manos/);
    expect(ficha(orco)).toMatch(/<option value="escudo" disabled>Escudo · no: .*a dos manos/);
  });

  it('el arma de cuerpo a cuerpo no se quita: sin ella no se monta, y la ficha lo dice en vez de la ×', () => {
    const u = guerrero();
    expect(quitarBlocker(u, 'arma', DEL_JUEGO)).toMatch(/no lleva arma de cuerpo a cuerpo/);
    expect(quitarBlocker(u, 'armadura', DEL_JUEGO)).toBeNull();
    expect(quitarBlocker(u, 'distancia', DEL_JUEGO)).toMatch(/no lleva nada en/);
    const m = ficha(u);
    expect(m).not.toContain('data-arena="quitar-pieza" data-hueco="arma"');
    expect(m).toContain('data-no-se-quita="arma"');
    expect(m).toContain('data-arena="quitar-pieza" data-hueco="armadura"');
    // Lo que la ficha deja quitar, el núcleo lo admite.
    for (const [, hueco] of m.matchAll(/data-arena="quitar-pieza" data-hueco="([^"]+)"/g)) {
      const h = hueco as HuecoDeArena;
      expect(() => validarUnidadDeArena(quitarEnArena(u, h), DEL_JUEGO), h).not.toThrow();
    }
  });

  it('el héroe dice con qué arma pelea, y la Espada lo cuenta entre quienes la llevan', () => {
    const m = marcadoDe(renderFichaDeHeroe('izquierda', MAGO, como, []));
    const armas = m.slice(m.indexOf('data-armas-del-heroe'));
    expect(armas).toMatch(/data-arma-de-la-ficha="cuerpo"[\s\S]*Espada ·/);
    expect(laLlevaElHeroe(ESPADA_DE_LA_ARENA)).toBe(true);
    expect(laLlevaElHeroe('mandoble')).toBe(false);
    const vista = marcadoDe(
      renderEquipo({
        piezas: DEL_JUEGO,
        elegida: ESPADA_DE_LA_ARENA,
        llevan: () => ['Guerrero con escudo', LA_LLEVA_EL_HEROE],
        enLaPelea: () => null,
        rechazo: null,
        enCombate: false,
        sinGuardar: '',
      }),
    );
    expect(vista).toContain('Guerrero con escudo, todo héroe de la arena');
  });
});
