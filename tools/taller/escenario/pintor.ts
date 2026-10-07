/**
 * La página del taller para una escena: un HTML con la escena en JSON y el
 * pintor (`pintar.ts`, por `pagina.ts`) empaquetado dentro, así que se abre sola,
 * también desde `file://` (entonces pinta pero no mide). El empaquetado lo hace
 * Vite, una vez por proceso.
 */
import { resolve } from 'node:path';
import { build } from 'vite';
import type { Escena } from '../../../src/client/render/escenario/colocar.js';

let guion: Promise<string> | undefined;

/** `pagina.ts` y lo que importa, en un solo guion que se mete en la página. */
function guionDeLaPagina(): Promise<string> {
  guion ??= (async () => {
    const salida = await build({
      configFile: false,
      logLevel: 'silent',
      // El pintor importa lo que importa el escenógrafo, y eso alcanza `@core/…`
      // (`relieve.ts` lee `isWalkable`): el mismo alias que `vite.config.ts`.
      resolve: { alias: { '@core': resolve(import.meta.dirname, '../../../src/core') } },
      build: {
        write: false,
        minify: false,
        lib: {
          entry: resolve(import.meta.dirname, 'pagina.ts'),
          formats: ['iife'],
          name: 'paginaDeEscena',
        },
      },
    });
    const [primera] = Array.isArray(salida) ? salida : [salida];
    if (primera === undefined || !('output' in primera))
      throw new Error('Vite no devolvió el guion de la página de la escena');
    const trozo = primera.output.find((o) => o.type === 'chunk');
    if (trozo === undefined || trozo.type !== 'chunk')
      throw new Error('Vite no devolvió el guion de la página de la escena');
    return trozo.code;
  })();
  return guion;
}

/** Que un `</script>` dentro de un texto no cierre la etiqueta. */
const enGuion = (texto: string) => texto.replaceAll('</', '<\\/');

export async function paginaDeEscena(e: Escena, rutaAssets: string, tile = 48): Promise<string> {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Escenario · semilla ${e.semilla}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0d0e0b; color: #ddd; font: 13px system-ui, sans-serif; }
  #info { position: fixed; top: 6px; right: 10px; background: #000a; padding: 4px 8px; border-radius: 4px; }
  canvas { display: block; }
</style></head><body>
<div id="info">cargando…</div>
<canvas id="lienzo"></canvas>
<script>
window.__escena = ${enGuion(JSON.stringify(e))};
window.__base = ${enGuion(JSON.stringify(rutaAssets))};
window.__tile = ${tile};
</script>
<script>
${enGuion(await guionDeLaPagina())}
</script></body></html>
`;
}
