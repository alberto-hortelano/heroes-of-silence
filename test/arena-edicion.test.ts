/**
 * La vista de edición de la arena (`src/client/arena/edicion.ts`): abrir, cerrar
 * y recordar las fichas que se quieran (sin tope desde el 12-10-2026), la lista
 * con «Abrir» y el marco de cada ficha, cuyo cuerpo es la ficha de siempre. Lo
 * que se ve en pantalla —como mucho tres columnas, sin scroll dentro de una
 * ficha— lo mide `pnpm capturas` (pasada «edicion»).
 */
import { describe, expect, it } from 'vitest';
import {
  abiertasATexto,
  abrirFicha,
  abrirFichaBlocker,
  cerrarFicha,
  claveDeFicha,
  type FichaEditable,
  fichaDeClave,
  focoTrasCerrar,
  interiorDeFichaAbierta,
  leerAbiertas,
  listaPlegadaTras,
  renderEdicion,
} from '../src/client/arena/edicion.js';
import {
  avisoDelBorradorLeido,
  avisoDeNuevaUnidad,
  enElMontaje,
  focoTrasQuitar,
  renderCatalogo,
  renderFicha,
  renderFichaDeCatalogo,
} from '../src/client/arena/paneles.js';
import { html, marcadoDe } from '../src/client/html.js';
import { unidadNueva } from '../src/core/arena.js';
import { REGLAS_DEL_JUEGO, reglasDeLaURL } from '../src/core/battle/reglas.js';
import { creature } from '../src/core/data.js';
import { hojasDeLaArena, unidadDeArena } from './helpers.js';

const HOJAS = hojasDeLaArena();
const hoja = (id: string): FichaEditable => ({ kind: 'unidad', id });
const cat = (id: string): FichaEditable => ({ kind: 'catalogo', id });
const CUATRO = [hoja('templario-escudo'), hoja('templario-monje'), cat('pikeman'), cat('archer')];
/** Seis: más de las cuatro que cabían antes, y más de las tres columnas de una fila. */
const SEIS = [...CUATRO, cat('peasant'), hoja('zombi')];

describe('abrir y cerrar fichas', () => {
  it('abre al final y dice cuál', () => {
    const r = abrirFicha([hoja('templario-escudo')], cat('pikeman'), 'Piquero');
    expect(r.abiertas).toEqual([hoja('templario-escudo'), cat('pikeman')]);
    expect(r.aviso).toBe('Piquero: ficha abierta.');
  });

  it('la misma no se abre dos veces', () => {
    const antes = [hoja('templario-escudo'), cat('pikeman')];
    const r = abrirFicha(antes, cat('pikeman'), 'Piquero');
    expect(r.abiertas).toBe(antes);
    expect(r.aviso).toBe('Piquero. Su ficha ya está abierta.');
    // Una hoja y una criatura con el mismo id son dos fichas distintas.
    expect(abrirFicha([hoja('x')], cat('x'), 'X').abiertas).toHaveLength(2);
  });

  it('sin tope: con cuatro abiertas entra una quinta y una sexta, sin aviso de lleno', () => {
    const quinta = abrirFicha(CUATRO, cat('peasant'), 'Campesino');
    expect(quinta.abiertas).toEqual(SEIS.slice(0, 5));
    expect(quinta.aviso).toBe('Campesino: ficha abierta.');
    const sexta = abrirFicha(quinta.abiertas, hoja('zombi'), 'Zombi');
    expect(sexta.abiertas).toEqual(SEIS);
    expect(sexta.aviso).toBe('Zombi: ficha abierta.');
    expect(abrirFichaBlocker(SEIS, cat('goblin'), null)).toBeNull();
  });

  it('un motivo por caso, el mismo para el botón, el gesto y abrirFicha', () => {
    // La incompleta manda sobre las otras dos: no se abre aunque quepa o ya esté.
    expect(abrirFichaBlocker(CUATRO, hoja('templario-escudo'), 'le falta d7')).toBe(
      'No se abre: le falta d7.',
    );
    expect(abrirFichaBlocker(CUATRO, hoja('templario-escudo'), null)).toBe(
      'Su ficha ya está abierta.',
    );
    expect(abrirFichaBlocker(CUATRO, cat('peasant'), null)).toBeNull();
    expect(abrirFichaBlocker([], cat('peasant'), null)).toBeNull();
    const r = abrirFicha([], hoja('x'), 'X', 'le falta d7');
    expect(r.abiertas).toEqual([]);
    expect(r.aviso).toBe('X. No se abre: le falta d7.');
  });

  it('cerrar quita solo esa y deja las demás en su orden', () => {
    expect(cerrarFicha(CUATRO, 'catalogo:pikeman')).toEqual([
      hoja('templario-escudo'),
      hoja('templario-monje'),
      cat('archer'),
    ]);
    expect(() => cerrarFicha(CUATRO, 'catalogo:peasant')).toThrow(
      'no hay ninguna ficha «catalogo:peasant» abierta que cerrar',
    );
  });
});

describe('la clave de una ficha', () => {
  it('va y vuelve con las tres, y lanza con lo que no es una ficha', () => {
    const heroe = { kind: 'heroe', lado: 'derecha' } as const;
    for (const f of [...CUATRO, heroe]) expect(fichaDeClave(claveDeFicha(f))).toEqual(f);
    expect(claveDeFicha(heroe)).toBe('heroe:derecha');
    // Un id con dos puntos no se parte por el segundo.
    expect(fichaDeClave('unidad:a:b')).toEqual(hoja('a:b'));
    for (const basura of ['', 'hoja', 'unidad:', 'heroe:arriba', 'heroe:', 'monje', ':x']) {
      expect(() => fichaDeClave(basura), basura).toThrow('no es la clave de una ficha');
    }
  });

  it('la ficha la lleva en el marcado, y es la misma clave para las tres', () => {
    const como = enElMontaje(REGLAS_DEL_JUEGO);
    const u = unidadDeArena('templario-monje');
    expect(marcadoDe(renderFicha(u, false, como))).toContain(
      'class="ficha" data-clave-de-ficha="unidad:templario-monje"',
    );
    expect(marcadoDe(renderFichaDeCatalogo('pikeman', creature('pikeman'), false, como))).toContain(
      'class="ficha" data-clave-de-ficha="catalogo:pikeman"',
    );
  });
});

describe('recordar las abiertas', () => {
  const todas = (): boolean => true;

  it('sin nada guardado, ninguna y sin aviso', () => {
    expect(leerAbiertas(null, todas)).toEqual({ abiertas: [], aviso: '' });
  });

  it('va y vuelve por el texto', () => {
    expect(leerAbiertas(abiertasATexto(CUATRO), todas)).toEqual({ abiertas: CUATRO, aviso: '' });
  });

  it('lo ilegible empieza sin ninguna y lo dice', () => {
    for (const roto of ['{', '"unidad:x"', '[1,2]', '{"a":1}']) {
      const r = leerAbiertas(roto, todas);
      expect(r.abiertas, roto).toEqual([]);
      expect(r.aviso, roto).toContain('No se leen las fichas que estaban abiertas');
    }
  });

  it('vuelve a abrir más de cuatro', () => {
    expect(leerAbiertas(abiertasATexto(SEIS), todas)).toEqual({ abiertas: SEIS, aviso: '' });
  });

  it('lee la clave de antes de las unidades nuevas, «hoja:<id>», como la de su unidad', () => {
    // La unidad de una hoja tiene el id de su hoja: lo recordado en el navegador
    // antes del 12-10-2026 sigue abriendo su ficha.
    expect(fichaDeClave('hoja:zombi')).toEqual({ kind: 'unidad', id: 'zombi' });
    expect(leerAbiertas(JSON.stringify(['hoja:zombi']), () => true).abiertas).toEqual([
      { kind: 'unidad', id: 'zombi' },
    ]);
  });

  it('quita las que ya no se abren y las repetidas, diciéndolo', () => {
    const texto = JSON.stringify([
      'unidad:borrada',
      'unidad:templario-escudo',
      'unidad:templario-escudo',
      'basura',
      ...CUATRO.slice(1).map(claveDeFicha),
      'catalogo:peasant',
      'heroe:izquierda',
    ]);
    const r = leerAbiertas(texto, (f) => f.id !== 'borrada');
    // La quinta, el campesino, ya cabe: no hay tope.
    expect(r.abiertas).toEqual([...CUATRO, cat('peasant')]);
    expect(r.aviso).toContain('«unidad:borrada»');
    expect(r.aviso).toContain('«basura»');
    expect(r.aviso).not.toContain('«catalogo:peasant»');
    // Un héroe tiene clave, pero no se abre en la edición.
    expect(r.aviso).toContain('«heroe:izquierda»');
    expect(r.aviso.match(/«unidad:templario-escudo»/g)).toHaveLength(1);
  });
});

describe('la lista plegable: solo su botón la cambia (12-10-2026)', () => {
  it('abrir, cerrar o entrar no la pliegan ni la despliegan', () => {
    for (const g of ['entrar', 'abrir', 'cerrar'] as const) {
      expect(listaPlegadaTras(g, false, 1), g).toBe(false);
      expect(listaPlegadaTras(g, false, 6), g).toBe(false);
      expect(listaPlegadaTras(g, true, 3), g).toBe(true);
    }
  });

  it('su botón la alterna', () => {
    expect(listaPlegadaTras('alternar', true, 2)).toBe(false);
    expect(listaPlegadaTras('alternar', false, 2)).toBe(true);
  });

  it('sin ninguna abierta, siempre desplegada', () => {
    for (const g of ['entrar', 'abrir', 'cerrar', 'alternar'] as const) {
      expect(listaPlegadaTras(g, true, 0)).toBe(false);
    }
  });
});

describe('el foco al cerrar con el teclado (H4 de QA)', () => {
  it('va al × de la siguiente; si era la última, al de la anterior', () => {
    expect(focoTrasCerrar(CUATRO, 'unidad:templario-monje')).toEqual({
      kind: 'cerrar',
      clave: 'catalogo:pikeman',
    });
    expect(focoTrasCerrar(CUATRO, 'catalogo:archer')).toEqual({
      kind: 'cerrar',
      clave: 'catalogo:pikeman',
    });
  });

  it('sin ninguna más, al «Abrir» de la que se cerró', () => {
    expect(focoTrasCerrar([cat('pikeman')], 'catalogo:pikeman')).toEqual({
      kind: 'abrir',
      ficha: cat('pikeman'),
    });
  });

  it('una que no está abierta es un error del gesto', () => {
    expect(() => focoTrasCerrar(CUATRO, 'unidad:nadie')).toThrow('«unidad:nadie»');
  });
});

describe('el foco al quitar una etiqueta con el teclado (M2 de QA)', () => {
  const rasgos = ['flying', 'undead', 'shooter'];

  it('va al × de la siguiente de su grupo', () => {
    expect(focoTrasQuitar(rasgos, 'flying')).toBe('undead');
    expect(focoTrasQuitar(rasgos, 'undead')).toBe('shooter');
  });

  it('si era la última o la única, al «Añadir» (`null`), no a la anterior', () => {
    expect(focoTrasQuitar(rasgos, 'shooter')).toBeNull();
    expect(focoTrasQuitar(['curar'], 'curar')).toBeNull();
  });

  it('una que no está en su grupo es un error del gesto', () => {
    expect(() => focoTrasQuitar(rasgos, 'nadie')).toThrow('«nadie»');
  });
});

describe('la lista en la vista de edición', () => {
  const muchas = { kind: 'edicion', abiertas: SEIS, plegada: false } as const;

  it('cada tarjeta lleva «Abrir» y no «+ izq.»; la abierta, «Abierta» deshabilitada', () => {
    const m = marcadoDe(
      renderCatalogo(HOJAS, 'todas', [], {
        kind: 'edicion',
        abiertas: [hoja('templario-escudo')],
        plegada: false,
      }),
    );
    expect(m).not.toContain('data-arena="añadir"');
    expect(m.match(/data-arena="abrir-ficha"/g)).toHaveLength(HOJAS.length);
    expect(m).toContain(
      'data-arena="abrir-ficha" data-unidad="templario-escudo" title="Su ficha ya está abierta." disabled>Abierta<',
    );
    expect(m.match(/disabled>/g)).toHaveLength(1);
  });

  it('con seis abiertas, las demás se siguen abriendo; solo las abiertas van deshabilitadas', () => {
    const m = marcadoDe(renderCatalogo(HOJAS, 'todas', [], muchas));
    // Las tres hojas abiertas (templario, monje y zombi): «Abierta»; las demás, «Abrir» sin motivo.
    expect(m.match(/disabled>Abierta</g)).toHaveLength(3);
    expect(m.match(/disabled>/g)).toHaveLength(3);
    expect(m.match(/title="Abre su ficha junto a las demás" >Abrir</g)).toHaveLength(
      HOJAS.length - 3,
    );
    const c = marcadoDe(
      renderCatalogo(
        HOJAS,
        'catalogo',
        [
          { id: 'pikeman', name: 'Piquero', resumen: 'A 5' },
          { id: 'goblin', name: 'Trasgo', resumen: '' },
        ],
        muchas,
      ),
    );
    expect(c).toContain(
      'data-arena="abrir-ficha" data-criatura="pikeman" title="Su ficha ya está abierta." disabled>Abierta<',
    );
    expect(c).toContain(
      'data-arena="abrir-ficha" data-criatura="goblin" title="Abre su ficha junto a las demás" >Abrir<',
    );
    expect(c).not.toContain('añadir-catalogo');
  });

  it('una hoja incompleta no se abre, con su motivo', () => {
    const [primera, ...resto] = HOJAS;
    if (primera === undefined) throw new Error('sin hojas');
    const hojas = [{ ...primera, incompleta: 'le falta d7' }, ...resto];
    const m = marcadoDe(
      renderCatalogo(hojas, 'todas', [], { kind: 'edicion', abiertas: [], plegada: false }),
    );
    expect(m).toContain(
      `data-arena="abrir-ficha" data-unidad="${primera.id}" title="No se abre: le falta d7." disabled>Abrir<`,
    );
  });

  it('«Nueva unidad» avisa de que las criaturas del catálogo salen con el maniquí (H3 de QA)', () => {
    const m = marcadoDe(
      renderCatalogo(HOJAS, 'todas', [], undefined, {
        cuerpos: {
          hojas: [{ id: 'esqueleto-guerrero', nombre: 'Esqueleto guerrero' }],
          criaturas: [{ id: 'skeleton', name: 'Esqueleto' }],
        },
      }),
    );
    expect(m).toContain('<optgroup label="Hojas"><option value="hoja:esqueleto-guerrero">');
    expect(m).toContain(
      '<optgroup label="Catálogo del juego (con el maniquí)"><option value="criatura:skeleton">Esqueleto</option>',
    );
  });

  it('en el montaje sigue como estaba', () => {
    const m = marcadoDe(renderCatalogo(HOJAS, 'todas'));
    expect(m).not.toContain('abrir-ficha');
    expect(m).not.toContain('plegar-lista');
  });

  it('con alguna abierta se pliega a su cabecera, y su botón la despliega (H1, H2)', () => {
    const una = [hoja('templario-escudo')];
    const plegada = marcadoDe(
      renderCatalogo(HOJAS, 'todas', [], { kind: 'edicion', abiertas: una, plegada: true }),
    );
    expect(plegada).not.toContain('abrir-ficha');
    expect(plegada).not.toContain('data-arena="filtro"');
    expect(plegada).toContain('data-arena="plegar-lista" aria-expanded="false"');
    expect(plegada).toContain('>Desplegar</button>');
    const abierta = marcadoDe(
      renderCatalogo(HOJAS, 'todas', [], { kind: 'edicion', abiertas: una, plegada: false }),
    );
    expect(abierta).toContain('data-arena="plegar-lista" aria-expanded="true"');
    expect(abierta.match(/data-arena="abrir-ficha"/g)).toHaveLength(HOJAS.length);
    // Sin ninguna abierta no hay nada que plegar: ni botón, ni lista plegada.
    const vacia = marcadoDe(
      renderCatalogo(HOJAS, 'todas', [], { kind: 'edicion', abiertas: [], plegada: false }),
    );
    expect(vacia).not.toContain('plegar-lista');
    expect(() =>
      renderCatalogo(HOJAS, 'todas', [], { kind: 'edicion', abiertas: [], plegada: true }),
    ).toThrow('no se pliega sin ninguna ficha abierta');
  });
});

describe('la vista de edición', () => {
  it('cada ficha va con su × y su cuerpo es la ficha de siempre, tal cual', () => {
    const u = unidadDeArena('templario-monje');
    const como = enElMontaje(reglasDeLaURL('bendicion'));
    const deHoja = renderFicha(u, false, como);
    const deCatalogo = renderFichaDeCatalogo('pikeman', creature('pikeman'), true, como);
    const m = marcadoDe(
      renderEdicion({
        lista: html`<div class="catalogo"></div>`,
        fichas: [
          { clave: 'unidad:templario-monje', titulo: u.name, cuerpo: deHoja },
          { clave: 'catalogo:pikeman', titulo: '<Piquero>', cuerpo: deCatalogo },
        ],
      }),
    );
    // Un solo renderizador: el cuerpo es el marcado de la ficha del montaje.
    expect(m).toContain(marcadoDe(deHoja));
    expect(m).toContain(marcadoDe(deCatalogo));
    expect(m.match(/<article class="ficha-abierta"/g)).toHaveLength(2);
    expect(m.match(/data-arena="cerrar-ficha"/g)).toHaveLength(2);
    // El × no lleva clave propia: la de su `article`, la misma que la de la ficha.
    expect(m).toContain(
      '<article class="ficha-abierta" data-clave-de-ficha="unidad:templario-monje">',
    );
    expect(m).toContain('<article class="ficha-abierta" data-clave-de-ficha="catalogo:pikeman">');
    // Lo que se repinta solo tras un cambio es lo de dentro del `article`, tal cual.
    expect(m).toContain(
      marcadoDe(
        interiorDeFichaAbierta({ clave: 'unidad:templario-monje', titulo: u.name, cuerpo: deHoja }),
      ),
    );
    expect(m).toContain('&lt;Piquero&gt;');
    expect(m).toContain('Fichas abiertas · 2</h3>');
    expect(m).not.toContain(' de 4');
  });

  it('sin ninguna dice cómo abrir, sin tope; con seis, las seis y sin aviso de lleno', () => {
    const vacia = marcadoDe(renderEdicion({ lista: html``, fichas: [] }));
    expect(vacia).toContain('Ninguna ficha abierta');
    expect(vacia).not.toMatch(/hasta \d/);
    const cuerpo = renderFicha(null, false, enElMontaje(REGLAS_DEL_JUEGO));
    const seis = marcadoDe(
      renderEdicion({
        lista: html``,
        fichas: SEIS.map((f) => ({ clave: claveDeFicha(f), titulo: f.id, cuerpo })),
      }),
    );
    expect(seis.match(/<article class="ficha-abierta"/g)).toHaveLength(6);
    expect(seis).toContain('Fichas abiertas · 6</h3>');
    expect(seis).not.toContain('cierra una');
  });

  it('el nombre no se repite fuera de la ficha: el marco solo pone el ×', () => {
    const u = unidadDeArena('templario-monje');
    const cuerpo = renderFicha(u, false, enElMontaje(REGLAS_DEL_JUEGO));
    const m = marcadoDe(
      interiorDeFichaAbierta({ clave: 'unidad:templario-monje', titulo: u.name, cuerpo }),
    );
    // Una vez en el título de la ficha y otra en la etiqueta del × y del «✎».
    expect(m.match(new RegExp(`<span class="nombre">${u.name}</span>`, 'g'))).toHaveLength(1);
    expect(m).not.toContain('cabecera-de-ficha');
  });
});

describe('la barra al crear y al leer el borrador (segunda vuelta de QA)', () => {
  const ocupados = { validas: [], sinValidar: [], hojas: [] };

  it('R1: el nivel de una nueva se lee de su índice, el mismo de su ficha', () => {
    const paladin = unidadNueva({ criatura: 'paladin' }, ocupados);
    expect(avisoDeNuevaUnidad(paladin, 'edicion')).toBe(
      'Nueva unidad «Paladín 2», sin equipo (Índice 217 · nivel 2): su ficha está abierta.',
    );
    expect(avisoDeNuevaUnidad(paladin, 'montaje')).toBe(
      'Nueva unidad «Paladín 2», sin equipo (Índice 217 · nivel 2): añádela a un bando o cambia su ficha.',
    );
    // Lo mismo que dice su ficha, sin «nivel 1» escrito a mano.
    expect(marcadoDe(renderFicha(paladin, false))).toContain('Índice 217 · nivel 2');
    expect(avisoDeNuevaUnidad(unidadNueva({ criatura: 'peasant' }, ocupados), 'edicion')).toMatch(
      / \(Índice 1\d\d · nivel 1\): /,
    );
  });

  it('R4: un borrador con solo unidades que no valen se ha leído, y se dice', () => {
    expect(avisoDelBorradorLeido('data/borradores/unidades.json', 0, 3)).toBe(
      'Cargado data/borradores/unidades.json: ninguna unidad vale, y las 3 que trae se conservan tal cual al guardar; mientras, las unidades salen con cifras por defecto, inventadas.',
    );
    expect(avisoDelBorradorLeido('b.json', 0, 1)).toContain(
      'ninguna unidad vale, y la que trae se conserva',
    );
    expect(avisoDelBorradorLeido('b.json', 0, 0)).toMatch(
      /^Sin borrador guardado todavía \(b\.json\)/,
    );
    expect(avisoDelBorradorLeido('b.json', 2, 1)).toBe('Cargado b.json: 2 unidades.');
  });
});
