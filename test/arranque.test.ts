/**
 * **Una página con el núcleo roto dice por qué** (H5 de QA, 19-10-2026): una
 * unidad que no vale en `data/unidades.json` tumba `core/unidad/catalogo.ts` al
 * importarse, y con `main.ts` de entrada la arena se quedaba en «Cargando las
 * hojas…», la partida en blanco y `pnpm dev` ni arrancaba. Se vigilan las tres
 * cosas que lo arreglan: el motivo llega entero a la página (`arranque.ts`), la
 * entrada de cada página no importa el núcleo (lo carga a demanda) y la
 * configuración de vite tampoco (carga el lado de disco de la arena a demanda).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import unidadesJson from '../data/unidades.json' with { type: 'json' };
import { renderNoArranca } from '../src/client/comun/arranque.js';
import { html, marcadoDe } from '../src/client/comun/html.js';
import { importacionesDe, ruta } from './codigo-del-repo.js';
import { RAIZ } from './comun.js';

/** Las páginas, cada una con su entrada: la partida, la arena y el espectador. */
const PAGINAS = [
  ruta('src/client'),
  ruta('src/client/arena'),
  ruta('src/client/espectador'),
] as const;

/**
 * Los módulos que `desde` (relativa a la raíz) carga **al evaluarse**: sus imports
 * estáticos de valor, y los de esos, sin los `import type` (se borran al compilar)
 * ni los `import()` (van a demanda) ni los paquetes. Relativos a la raíz. Cada
 * paso, con el resolutor de los guardias (`importacionesDe`).
 */
function cargaAlEvaluarse(desde: string): Set<string> {
  const vistos = new Set<string>();
  const pendientes = [desde];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    for (const m of importacionesDe(actual)) if (m.endsWith('.ts')) pendientes.push(m);
  }
  return vistos;
}

describe('una página que no arranca dice por qué (H5)', () => {
  afterEach(() => {
    vi.doUnmock('../data/unidades.json');
    vi.resetModules();
  });

  it('una unidad rota a mano tumba el catálogo, y su motivo llega entero a la página', async () => {
    // Como quien toca el JSON: «Guardar» no la dejaría pasar.
    const [primera, ...resto] = unidadesJson.unidades;
    const rota = { ...unidadesJson, unidades: [{ ...primera, nivelInventado: 3 }, ...resto] };
    vi.doMock('../data/unidades.json', () => ({ default: rota }));
    vi.resetModules();
    const err = await import('../src/core/unidad/catalogo.js').then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    const motivo = (err as Error).message;
    // Dice el fichero, la unidad y el campo que sobra.
    expect(motivo).toContain(ruta('data/unidades.json'));
    expect(motivo).toContain(String(primera?.id));
    expect(motivo).toContain('nivelInventado');
    // Y la página lo pinta entero, escapado, sin cortar.
    const marcado = marcadoDe(renderNoArranca(err));
    expect(marcado).toContain('La página no arranca');
    expect(marcado).toContain(marcadoDe(html`<pre class="motivo">${motivo}</pre>`));
  });

  it('lo que no es un Error también se dice', () => {
    expect(marcadoDe(renderNoArranca('algo raro'))).toContain('algo raro');
  });

  it.each(PAGINAS)('%s: la página entra por `entrada.ts`, que no carga el núcleo', (dir) => {
    const pagina = readFileSync(join(RAIZ, dir, 'index.html'), 'utf8');
    const scripts = [...pagina.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    expect(scripts).toEqual(['./entrada.ts']);
    const entrada = join(dir, 'entrada.ts');
    // Carga `main.ts` a demanda dentro de `arrancar`; la partida, antes, su pantalla
    // de inicio (`inicio/inicio.ts`), también a demanda y solo si la URL no pide
    // partida (`hayQuePreguntar`, de `semilla.ts`, que no importa nada).
    expect(readFileSync(join(RAIZ, entrada), 'utf8')).toMatch(
      /arrancar\((?:async )?\(\) =>[\s\S]*import\('\.\/main\.js'\)[\s\S]*\);/,
    );
    // Lo que se evalúa seguro: si cargase algo del núcleo, un catálogo roto lo
    // tumbaría antes de poder decir nada. El motivo lo saca `mensajeDe`
    // (`comun/errores.ts`, que tampoco importa nada: fase C de la reorganización).
    const dePartida = dir === ruta('src/client') ? [ruta('src/client/comun/semilla.ts')] : [];
    expect([...cargaAlEvaluarse(entrada)].sort()).toEqual(
      [
        entrada,
        ruta('src/client/comun/arranque.ts'),
        ruta('src/client/comun/errores.ts'),
        ruta('src/client/comun/html.ts'),
        ...dePartida,
      ].sort(),
    );
  });

  it('la configuración de vite no carga el catálogo al arrancar: `pnpm dev` arranca con él roto', () => {
    const carga = cargaAlEvaluarse(ruta('vite.config.ts'));
    // El recorrido llega al núcleo: la muralla de la arena trae el tablero de batalla
    // (era `src/core/data.ts` hasta la fase N de la reorganización, 07-11-2026).
    expect(carga.has(ruta('src/core/battle/board.ts'))).toBe(true);
    // El catálogo (era `src/core/catalogo.ts` hasta la fase N de la reorganización, 07-11-2026).
    expect(carga.has(ruta('src/core/unidad/catalogo.ts'))).toBe(false);
    expect(carga.has(ruta('tools/arena/borrador.ts'))).toBe(false);
  });
});
