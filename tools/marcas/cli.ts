/**
 * `pnpm marcas`: las marcas de fallo del mapa que se dejan desde `pnpm dev`.
 *
 *   pnpm marcas [lista] [--todas]   las pendientes (o todas), con la URL para verlas
 *   pnpm marcas ver <id>            la marca entera y las rutas de sus PNG
 *   pnpm marcas resolver <id> <ref> la da por resuelta con una issue (#160) o un commit
 *   pnpm marcas recorte <id>        el mismo recorte pintado por el taller (<id>.taller.png)
 *
 * Sale 1 con una orden desconocida o un id que no existe, diciéndolo.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { motivoDe } from '../../src/client/desarrollo/esquema.js';
import { CARPETA_DE_MARCAS, leerMarca, listarMarcas, resolverMarca } from './almacen.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Lo que se pega en la barra de direcciones de `pnpm dev` para volver a mirar la marca. */
const urlDe = (m: { id: string; semilla: number }): string =>
  `http://localhost:3100/?seed=${m.semilla}&marca=${m.id}`;

const ORDENES = 'lista [--todas], ver <id>, resolver <id> <ref>, recorte <id>';

function idDe(args: readonly string[], orden: string): string {
  const id = args[0];
  if (id === undefined)
    throw new Error(`«pnpm marcas ${orden}» pide el id de la marca (pnpm marcas lista)`);
  return id;
}

async function main(argv: readonly string[]): Promise<void> {
  const [orden = 'lista', ...args] = argv;
  switch (orden) {
    case 'lista': {
      const todas = args.includes('--todas');
      const marcas = listarMarcas(RAIZ).filter((m) => todas || m.resuelta === null);
      if (marcas.length === 0) {
        console.log(todas ? `No hay marcas en ${CARPETA_DE_MARCAS}.` : 'No hay marcas pendientes.');
        return;
      }
      for (const m of marcas) {
        const estado = m.resuelta === null ? 'pendiente' : `resuelta con ${m.resuelta.ref}`;
        console.log(
          `${m.id}  [${estado}]  casilla (${m.casilla.x}, ${m.casilla.y}), ${m.queHay.terreno}, día ${m.dia}\n    ${m.nota.replaceAll('\n', ' ')}\n    ${urlDe(m)}`,
        );
      }
      return;
    }
    case 'ver': {
      const m = leerMarca(RAIZ, idDe(args, orden));
      const carpeta = join(RAIZ, CARPETA_DE_MARCAS);
      const taller = join(carpeta, `${m.id}.taller.png`);
      console.log(JSON.stringify(m, null, 2));
      console.log(`\nrecorte del juego:  ${join(carpeta, m.png)}`);
      console.log(
        `recorte del taller: ${existsSync(taller) ? taller : `(aún no: pnpm marcas recorte ${m.id})`}`,
      );
      console.log(`para verla:         ${urlDe(m)}`);
      if (m.dia > 1)
        console.log(
          `ojo: la URL vuelve al sitio y al zoom con el mapa entero a la vista, pero es el día 1 de la semilla, no el ${m.dia} en que se marcó.`,
        );
      return;
    }
    case 'resolver': {
      const id = idDe(args, orden);
      const ref = args.slice(1).join(' ');
      const m = resolverMarca(RAIZ, id, ref);
      console.log(`${m.id} resuelta con ${m.resuelta?.ref}.`);
      return;
    }
    case 'recorte': {
      const m = leerMarca(RAIZ, idDe(args, orden));
      const salida = join(RAIZ, CARPETA_DE_MARCAS, `${m.id}.taller.png`);
      // Aquí y no arriba: el taller trae Playwright y el escenógrafo, y `lista`,
      // `ver` y `resolver` no tienen por qué esperarlos.
      const { recorteDeMarca } = await import('../taller/escenario/escenario.js');
      const { avisos } = await recorteDeMarca(m, salida);
      for (const a of avisos) console.warn(`aviso: ${a}`);
      console.log(salida);
      return;
    }
    default:
      throw new Error(`orden desconocida «${orden}»: ${ORDENES}`);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(motivoDe(err));
  process.exit(1);
});
