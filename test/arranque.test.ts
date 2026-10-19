/**
 * **Una página con el núcleo roto dice por qué** (H5 de QA, 19-10-2026): una
 * unidad que no vale en `data/unidades.json` tumba `core/catalogo.ts` al
 * importarse, y con `main.ts` de entrada la arena se quedaba en «Cargando las
 * hojas…», la partida en blanco y `pnpm dev` ni arrancaba. Se vigilan las tres
 * cosas que lo arreglan: el motivo llega entero a la página (`arranque.ts`), la
 * entrada de cada página no importa el núcleo (lo carga a demanda) y la
 * configuración de vite tampoco (carga el lado de disco de la arena a demanda).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import unidadesJson from '../data/unidades.json' with { type: 'json' };
import { renderNoArranca } from '../src/client/arranque.js';
import { html, marcadoDe } from '../src/client/html.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/** Las páginas, cada una con su entrada: la partida, la arena y el espectador. */
const PAGINAS = ['src/client', 'src/client/arena', 'src/client/espectador'] as const;

/**
 * Los módulos que `ruta` (relativa a la raíz) carga **al evaluarse**: sus imports
 * estáticos de valor, y los de esos, sin los `import type` (se borran al compilar)
 * ni los `import()` (van a demanda) ni los paquetes. Relativos a la raíz.
 */
function cargaAlEvaluarse(ruta: string): Set<string> {
  const vistos = new Set<string>();
  const pendientes = [ruta];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    const codigo = readFileSync(join(RAIZ, actual), 'utf8');
    const patron = /^\s*(import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    for (const m of codigo.matchAll(patron)) {
      const destino = m[2] as string;
      let absoluto: string;
      if (destino.startsWith('.')) absoluto = resolve(RAIZ, dirname(actual), destino);
      else if (destino.startsWith('@core/')) absoluto = join(RAIZ, 'src/core', destino.slice(6));
      else continue;
      const ts = absoluto.replace(/\.js$/, '.ts');
      const final = existsSync(ts) ? ts : absoluto;
      if (!final.endsWith('.ts')) continue;
      pendientes.push(relative(RAIZ, final));
    }
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
    const err = await import('../src/core/catalogo.js').then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    const motivo = (err as Error).message;
    // Dice el fichero, la unidad y el campo que sobra.
    expect(motivo).toContain('data/unidades.json');
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
    expect(readFileSync(join(RAIZ, entrada), 'utf8')).toContain(
      "arrancar(() => import('./main.js'));",
    );
    // Lo que se evalúa seguro: si cargase algo del núcleo, un catálogo roto lo
    // tumbaría antes de poder decir nada.
    expect([...cargaAlEvaluarse(entrada)].sort()).toEqual(
      [entrada, 'src/client/arranque.ts', 'src/client/html.ts'].sort(),
    );
  });

  it('la configuración de vite no carga el catálogo al arrancar: `pnpm dev` arranca con él roto', () => {
    const carga = cargaAlEvaluarse('vite.config.ts');
    expect(carga.has('src/core/data.ts')).toBe(true); // el recorrido llega al núcleo
    expect(carga.has('src/core/catalogo.ts')).toBe(false);
    expect(carga.has('tools/arena/borrador.ts')).toBe(false);
  });
});
