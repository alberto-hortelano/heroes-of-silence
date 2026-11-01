/**
 * Un tema de interfaz por ejército (13-10-2026): las fichas del CSS.
 *
 * El color vive en la hoja de estilos: el `:root` de `style.css` es el neutro, y
 * en `temas.css` un bloque común (`:root[data-tema]`) y uno por tema que lo
 * completa. Aquí se vigila que a ningún tema le falte una ficha que lean las
 * hojas (el elemento que la lee saldría con la del neutro, a medio vestir), que
 * el neutro tenga las que se leen sin tema, que la tinta se lea sobre el panel y
 * sobre el botón, que los cinco se distingan y que el respaldo del lienzo sin DOM
 * sea el neutro y no otra copia de los colores.
 */
import { FACTION_IDS } from '@core/types.js';
import { describe, expect, it } from 'vitest';
import { FICHAS_DEL_LIENZO, LIENZO_NEUTRO, temaDelLienzo } from '../src/client/temas.js';
import { contraste, PAREJAS, sobre } from '../tools/taller/temas/paleta.js';
import {
  bloquesCss,
  type Declaracion,
  hojasDelCliente,
  leerHoja as leer,
  neutro,
  resuelta,
  sinComentariosCss,
  temas,
} from './hojas-de-estilo.js';

/**
 * Las fichas fijas: solo en el `:root` neutro, iguales en todos los temas. Las
 * `--info-*` y las medidas del escenario, que leen `style.css` y `forma.css`.
 */
const esFija = (ficha: string): boolean =>
  ficha.startsWith('--info-') || ['--relleno-del-escenario', '--borde-del-mapa'].includes(ficha);

/**
 * Las fichas que leen las hojas del cliente (`var(--x…)`) y el lienzo
 * (`FICHAS_DEL_LIENZO`): las que se leen con tema (en una regla bajo
 * `[data-tema`, o en `temas.css`) y las que se leen sin él. Y las que una regla
 * se define para sí (`--sombra-con-pieza`, `--tope`…) o pone la hoja generada de
 * las piezas: esas no son del tema.
 */
function fichasLeidas(): { conTema: Set<string>; sinTema: Set<string>; propias: Set<string> } {
  const conTema = new Set<string>();
  const sinTema = new Set<string>(Object.values(FICHAS_DEL_LIENZO));
  const propias = new Set<string>();
  for (const ruta of hojasDelCliente()) {
    const hoja = ruta.replace(/^src\/client\//, '');
    for (const { selector, padres, declaraciones } of bloquesCss(leer(hoja))) {
      const enTema = [selector, ...padres].some((x) => x.includes('[data-tema'));
      const raiz = hoja === 'temas.css' || (hoja === 'style.css' && selector === ':root');
      for (const { propiedad, valor } of declaraciones) {
        if (propiedad.startsWith('--') && !raiz) propias.add(propiedad);
        for (const m of valor.matchAll(/var\(\s*(--[a-z0-9-]+)/g))
          (enTema ? conTema : sinTema).add(m[1] as string);
      }
    }
  }
  for (const f of sinTema) conTema.add(f);
  return { conTema, sinTema, propias };
}

/**
 * Familias con cifras de caja baja por defecto: «Día 1» se lee «Día ı», y en el
 * lienzo (las cifras de daño) no hay `font-variant-numeric` que lo arregle. Un
 * tema no las lleva en ninguna de sus cadenas, ni de respaldo: en una máquina
 * sin las de delante, son las que salen (EB Garamond lo hacía en Linux). El
 * neutro sigue con su Georgia de siempre.
 */
const CIFRAS_DE_CAJA_BAJA = [
  'EB Garamond',
  'Georgia',
  'Candara',
  'Constantia',
  'Corbel',
  'Hoefler Text',
  'Cormorant',
  'Accanthis ADF Std',
  'GFS BodoniClassic',
];

const familias = (letra: string): string[] =>
  letra.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));

describe('los temas de la interfaz', () => {
  it('hay un tema por facción de la arena, ni uno más, y style.css los trae', () => {
    const { bloques } = temas();
    expect([...bloques.keys()].sort()).toEqual([...FACTION_IDS].sort());
    // Las tres páginas cargan solo `style.css`: sin el `@import`, ningún tema.
    expect(sinComentariosCss(leer('style.css'))).toMatch(/^\s*@import '\.\/temas\.css';/);
  });

  it('«común ∪ tema» define toda ficha que leen las hojas con tema, y no sobra ninguna', () => {
    // Un tema al que le falta una ficha que una regla lee pinta ese rincón con la
    // del neutro, a medio vestir. Roto a mano: sin el `--seccion-filo` de los
    // orkos sale rojo con su tema; un `var(--lateral-tintaa)` en `forma.css`, como
    // ficha que no define nadie.
    const { comun, bloques } = temas();
    const n = neutro();
    const { conTema, propias } = fichasLeidas();
    const delTema = new Set([
      ...comun.keys(),
      ...[...bloques.values()].flatMap((b) => [...b.keys()]),
    ]);
    // La imagen de una pieza y su marca solo existen con la pieza en disco: las
    // vigila `piezas-de-tema.test.ts`.
    const deUnaPieza = (f: string): boolean => /^--(?:con-)?pieza-/.test(f);
    const nadie = [...conTema].filter(
      (f) => !delTema.has(f) && !n.has(f) && !propias.has(f) && !deUnaPieza(f),
    );
    expect({ nadie }).toEqual({ nadie: [] });
    const pedidas = [...conTema].filter((f) => delTema.has(f) || (n.has(f) && !esFija(f)));
    expect(pedidas.length).toBeGreaterThan(50);
    for (const [tema, bloque] of bloques) {
      const faltan = pedidas.filter((f) => !bloque.has(f));
      const sobran = [...bloque.keys()].filter((f) => !conTema.has(f));
      expect({ tema, faltan, sobran }).toEqual({ tema, faltan: [], sobran: [] });
    }
  });

  it('el neutro define toda ficha que se lee sin tema, y solo esas y las fijas', () => {
    // Sin tema (el espectador) manda el `:root` de `style.css`: lo que solo lee
    // `forma.css` vive en el común de `temas.css`, no aquí. Roto a mano: sin el
    // `--barra-fondo` del neutro sale rojo.
    const n = neutro();
    const { sinTema, propias } = fichasLeidas();
    const faltan = [...sinTema].filter((f) => !n.has(f) && !propias.has(f));
    const sobran = [...n.keys()].filter((f) => !sinTema.has(f) && !esFija(f));
    expect({ faltan, sobran }).toEqual({ faltan: [], sobran: [] });
  });

  it('las fichas fijas (`--info-*`) solo las define el neutro: ningún tema las cambia', () => {
    expect([...neutro().keys()].filter(esFija).length).toBeGreaterThan(0);
    for (const [tema, bloque] of temas().bloques) {
      expect({ tema, fijas: [...bloque.keys()].filter(esFija) }).toEqual({ tema, fijas: [] });
    }
  });

  it('temas.css lleva solo bloques de tema: ninguna regla se esconde ahí', () => {
    expect(temas().resto).toBe('');
  });

  it('toda ficha de un tema se resuelve dentro de su bloque', () => {
    for (const [, bloque] of temas().bloques) {
      for (const ficha of bloque.keys()) expect(() => resuelta(bloque, ficha)).not.toThrow();
    }
  });

  it('toda tinta se lee sobre su fondo (`PAREJAS`: barra, botones, panel lateral, día y cartela), en el neutro y en los cinco', () => {
    // Cada tema, a través del común (`temas().bloques` los funde): una pareja que
    // le falte lanza. El neutro, solo en las que se pintan sin tema: el panel
    // lateral, el día y la cartela son de `forma.css`.
    const todos = new Map([['neutro', neutro()], ...temas().bloques]);
    expect(todos.size).toBe(6);
    const flojos: string[] = [];
    let medidas = 0;
    for (const [tema, f] of todos) {
      for (const [tinta, fondo] of PAREJAS) {
        if (tema === 'neutro' && !(f.has(tinta) && f.has(fondo))) continue;
        medidas++;
        const debajo = sobre(resuelta(f, fondo), resuelta(f, '--bg'));
        const c = contraste(sobre(resuelta(f, tinta), debajo), debajo);
        if (c < 4.5) flojos.push(`${tema}: ${tinta} sobre ${fondo} = ${c.toFixed(2)}`);
      }
    }
    expect(flojos).toEqual([]);
    expect(medidas).toBeGreaterThan(5 * PAREJAS.length);
  });

  it('la pastilla de lo que lleva colgado una unidad se lee en la fila de «En el campo», en el neutro y en los cinco (H1 de QA, 01-11-2026)', () => {
    // Con las reglas de verdad: el color de la pastilla (`style.css`), su fondo
    // (`forma.css`; sin él, el de la fila) y el de la fila (`.stack`, la de cada
    // unidad en `listaDelCampo`), con las fichas que el lateral reasigna
    // (`--accent` → `--lateral-acento`…). Roto a mano: sin la regla del fondo de
    // `forma.css`, «elfos +» = 1,02 y «elfos −» = 1,29 (verde y rojo oscuros sobre su
    // fila verde azulada). La fila que no es la activa va además a `opacity: 0.45`
    // (`.empty`), que apaga igual su nombre: eso no es de la pastilla y no se mide.
    const reglas = (hoja: string, selector: string): readonly Declaracion[] =>
      bloquesCss(leer(hoja))
        .filter((b) => b.selector === selector && b.padres.length === 0)
        .flatMap((b) => b.declaraciones);
    const fichasDeLaRegla = (hoja: string, selector: string): Map<string, string> =>
      new Map(
        reglas(hoja, selector)
          .filter((d) => d.propiedad.startsWith('--'))
          .map((d) => [d.propiedad, d.valor]),
      );
    /** De las reglas que se le aplican (de menos a más peso), la que gana en `propiedad`. */
    const gana = (
      aplican: readonly (readonly [string, string])[],
      propiedad: string,
    ): string | null =>
      aplican
        .flatMap(([hoja, selector]) => reglas(hoja, selector))
        .filter((d) => d.propiedad === propiedad)
        .at(-1)?.valor ?? null;
    // Un `var()` se resuelve donde se declara, con lo heredado de más arriba: el
    // `--accent: var(--lateral-acento)` del lateral lee la `--lateral-acento` de la raíz.
    const enLasCapas = (
      capas: readonly ReadonlyMap<string, string>[],
      valor: string,
      hasta = capas.length - 1,
      vistas: readonly string[] = [],
    ): string =>
      valor.replace(/var\((--[a-z0-9-]+)\)/g, (_, ficha: string) => {
        for (let i = hasta; i >= 0; i--) {
          const suyo = capas[i]?.get(ficha);
          if (suyo === undefined) continue;
          const clave = `${i}:${ficha}`;
          if (vistas.includes(clave))
            throw new Error(`fichas en círculo: ${[...vistas, clave].join(' → ')}`);
          return enLasCapas(capas, suyo, i, [...vistas, clave]);
        }
        throw new Error(`${ficha} no la define nadie`);
      });

    const LATERAL = ':root[data-tema] #lateral';
    type Reglas = readonly (readonly [string, string])[];
    const casos: readonly {
      readonly tema: string;
      /** Las fichas de la raíz al lateral y a la fila. */
      readonly capas: readonly ReadonlyMap<string, string>[];
      /** Lo que hay detrás de la fila: el panel lateral. */
      readonly detras: string;
      readonly fila: Reglas;
      readonly pastilla: Reglas;
    }[] = [
      {
        tema: 'neutro',
        capas: [neutro()],
        detras: 'var(--panel)',
        fila: [['style.css', '.stack']],
        pastilla: [['style.css', '.modificador']],
      },
      ...[...temas().bloques].map(([tema, bloque]) => ({
        tema,
        capas: [
          bloque,
          fichasDeLaRegla('forma.css', LATERAL),
          fichasDeLaRegla('forma.css', `${LATERAL} .stack`),
        ],
        detras: 'var(--lateral)',
        fila: [
          ['style.css', '.stack'],
          ['forma.css', `${LATERAL} .stack`],
        ] as const,
        pastilla: [
          ['style.css', '.modificador'],
          ['forma.css', `${LATERAL} .modificador[data-signo]`],
        ] as const,
      })),
    ];
    expect(casos.length).toBe(6);
    const medidas: string[] = [];
    for (const { tema, capas, detras, fila, pastilla } of casos) {
      const fondoDeLaFila = gana(fila, 'background');
      if (fondoDeLaFila === null) throw new Error(`${tema}: la fila sin fondo`);
      const bajo = sobre(enLasCapas(capas, fondoDeLaFila), enLasCapas(capas.slice(0, 2), detras));
      const suFondo = gana(pastilla, 'background');
      const fondo = suFondo === null ? bajo : sobre(enLasCapas(capas, suFondo), bajo);
      for (const signo of ['+', '−']) {
        const tinta = gana([['style.css', `.modificador[data-signo="${signo}"]`]], 'color');
        if (tinta === null) throw new Error(`la pastilla «${signo}» sin color`);
        const c = contraste(sobre(enLasCapas(capas, tinta), fondo), fondo);
        medidas.push(`${tema} ${signo} ${c >= 4.5 ? 'se lee' : `= ${c.toFixed(2)}`}`);
      }
    }
    expect(medidas.filter((m) => !m.endsWith('se lee'))).toEqual([]);
    expect(medidas.length).toBe(12);
  });

  it('los cinco se distinguen: panel, marco y letra de títulos, distintos en cada uno', () => {
    const bloques = [...temas().bloques.values()];
    for (const ficha of ['--panel', '--boton', '--marco-estilo', '--titulo']) {
      expect(new Set(bloques.map((b) => resuelta(b, ficha))).size, ficha).toBe(bloques.length);
    }
    const letras = bloques.map((b) => familias(resuelta(b, '--letra-titulo'))[0]);
    expect(new Set(letras).size).toBe(bloques.length);
  });

  it('toda letra acaba en una genérica y no carga nada por su cuenta', () => {
    const genericas = /(?:^|,)\s*(?:serif|sans-serif|monospace|system-ui)\s*$/;
    for (const [tema, f] of new Map([['neutro', neutro()], ...temas().bloques])) {
      for (const nombre of f.keys()) {
        if (!nombre.startsWith('--letra-')) continue;
        const valor = resuelta(f, nombre);
        expect(genericas.test(valor), `${tema} ${nombre}: ${valor}`).toBe(true);
        expect(valor, `${tema} ${nombre}`).not.toMatch(/url\(/);
      }
    }
  });

  it('los títulos de cada tema van con su OFL de `fuentes.css`, y el texto corrido con las del sistema', () => {
    // La letra de título es la primera de `--letra-titulo` y tiene su
    // `@font-face`; el cuerpo y la interfaz no nombran ninguna (se leen a 12-13 px
    // y no se bajan). El neutro no nombra ninguna. Roto a mano: `Cinzel` en el
    // `--letra-cuerpo` de los templarios sale rojo.
    const caras = new Set(
      [...sinComentariosCss(leer('fuentes.css')).matchAll(/font-family:\s*([^;]+);/g)].map(
        (m) => familias(m[1] as string)[0] as string,
      ),
    );
    expect(caras.size).toBe(FACTION_IDS.length);
    const mal: string[] = [];
    for (const [tema, f] of new Map([['neutro', neutro()], ...temas().bloques])) {
      for (const nombre of [
        '--letra-titulo',
        '--letra-encabezado',
        '--letra-cuerpo',
        '--letra-ui',
      ]) {
        const [primera, ...resto] = familias(resuelta(f, nombre));
        const deTitulo =
          tema !== 'neutro' && nombre !== '--letra-cuerpo' && nombre !== '--letra-ui';
        if (deTitulo && !caras.has(primera as string))
          mal.push(`${tema} ${nombre}: ${primera} sin @font-face`);
        for (const familia of deTitulo ? resto : [primera, ...resto])
          if (caras.has(familia as string))
            mal.push(`${tema} ${nombre}: ${familia} es de otro sitio`);
      }
    }
    expect(mal).toEqual([]);
  });

  it('los emblemas van con su cadena de símbolos, la de los tres sistemas', () => {
    // Ninguna letra de título trae el ✠ ni el ❦ (QA, 13-10-2026, H6): salían de
    // la de respaldo de la máquina (DejaVu Sans en Linux), y en otra podían salir
    // como cuadros. Cada regla que pinta `var(--emblema)` o `var(--adorno)` dice su
    // letra, `--letra-simbolos`, y esa cadena nombra una de Windows, una de macOS y
    // una de Linux. Roto a mano: sin la `font-family` del adorno de «Fin de turno»,
    // rojo; sin 'Segoe UI Symbol' en la cadena, también.
    const deEmblema = (v: string): boolean => /var\(--(?:emblema|adorno)\)/.test(v);
    const sinLetra = bloquesCss(leer('forma.css'))
      .filter((b) => b.declaraciones.some((d) => d.propiedad === 'content' && deEmblema(d.valor)))
      .filter(
        (b) =>
          !b.declaraciones.some(
            (d) =>
              (d.propiedad === 'font' || d.propiedad === 'font-family') &&
              d.valor.includes('var(--letra-simbolos)'),
          ),
      )
      .map((b) => `${b.selector} (línea ${b.linea})`);
    expect(sinLetra).toEqual([]);
    const cadena = familias(resuelta(temas().comun, '--letra-simbolos'));
    for (const sistema of [
      ['Segoe UI Symbol'],
      ['Apple Symbols'],
      ['DejaVu Sans', 'Noto Sans Symbols'],
    ])
      expect(
        sistema.some((f) => cadena.includes(f)),
        cadena.join(', '),
      ).toBe(true);
  });

  it('ningún tema escribe sus cifras de caja baja: ni de primera ni de respaldo', () => {
    const malas: string[] = [];
    for (const [tema, f] of temas().bloques) {
      for (const nombre of f.keys()) {
        if (!nombre.startsWith('--letra-')) continue;
        for (const familia of familias(resuelta(f, nombre))) {
          if (CIFRAS_DE_CAJA_BAJA.includes(familia)) malas.push(`${tema} ${nombre}: ${familia}`);
        }
      }
    }
    expect(malas).toEqual([]);
  });

  it('ninguna letra de interfaz es estrecha: ni de primera ni de respaldo', () => {
    // La interfaz va a 12-13 px: una estrecha (Arial Narrow, la de los orkos)
    // dejaba los botones y la edición apretados y más pequeños que en los otros
    // cuatro (H3 de QA, 13-10-2026). Roto a mano: 'Liberation Sans Narrow' de
    // respaldo en los orkos sale rojo con su tema.
    const malas: string[] = [];
    for (const [tema, f] of temas().bloques) {
      for (const familia of familias(resuelta(f, '--letra-ui'))) {
        if (/narrow|condensed|compressed/i.test(familia)) malas.push(`${tema}: ${familia}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('el respaldo del lienzo sin DOM es el `:root` neutro de style.css, ficha a ficha', () => {
    const n = neutro();
    for (const [campo, ficha] of Object.entries(FICHAS_DEL_LIENZO)) {
      expect(LIENZO_NEUTRO[campo as keyof typeof LIENZO_NEUTRO], ficha).toBe(n.get(ficha));
    }
    expect(temaDelLienzo()).toBe(LIENZO_NEUTRO);
  });
});
