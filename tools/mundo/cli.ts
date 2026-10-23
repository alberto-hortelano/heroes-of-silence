/**
 * `pnpm mundo`: los mundos de la F1a (`docs/agents/2026-10-22-mapa-vivo/`).
 *
 *   pnpm mundo nuevo <id> [--semilla=N] [--faccion=<f>] [--heroe=<tipo>] [--regiones=N]
 *       escribe assets/mundos/<id>/mundo.json y plan.json (el plan procedimental
 *       congelado) y la lectura del mapa; la historia la escribe el motor
 *   pnpm mundo leer <id> [--sin-png]
 *       .cache/mundos/<id>/lectura.json y mapa.png: el mapa por regiones, las
 *       casillas que admiten un lugar, el vocabulario y el catálogo
 *   pnpm mundo validar <id>
 *       la misma validación que la página y, además, la biblia (`biblia.md`, que la
 *       página no carga); sale 1 con los problemas
 *   pnpm mundo medir <id>…
 *       cuánta trama lleva cada mundo: lugares y regiones, marcas que cruzan,
 *       lugares encadenados, desenlaces que se excluyen y, por persona, nodos y
 *       niveles de su conversación (el inicio es el 1). Una medida, no una regla: no exige la biblia,
 *       para medir también los mundos de antes
 */
import { REGIONES_POR_BANDO } from '../../src/core/map/generate.js';
import { parseSeed } from '../../src/core/rng.js';
import { parseFaccion } from '../../src/core/types.js';
import { bandera } from '../argumentos.js';
import {
  escribirLectura,
  escribirMundoNuevo,
  leerMundoDeDisco,
  lineaDeProblema,
  validarEnDisco,
} from './disco.js';
import { describirMedida, medirMundo } from './medida.js';

function entero(texto: string | undefined, nombre: string, defecto: number): number {
  if (texto === undefined) return defecto;
  const n = Number(texto);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`--${nombre}=${texto} no es un entero`);
  return n;
}

async function main(argv: readonly string[]): Promise<number> {
  const [orden, id, ...resto] = argv;
  if (id === undefined || orden === undefined) {
    console.error('uso: pnpm mundo nuevo|leer|validar|medir <id> (mira tools/mundo/cli.ts)');
    return 2;
  }
  switch (orden) {
    case 'nuevo': {
      // La semilla y la facción, con las reglas de la URL (`parseSeed`, `parseFaccion`).
      const mundo = await escribirMundoNuevo({
        id,
        semilla: parseSeed(bandera(resto, 'semilla')) ?? Date.now() % 1_000_000,
        faccion: parseFaccion(bandera(resto, 'faccion')) ?? 'imperio',
        heroe: bandera(resto, 'heroe'),
        regionesPorBando: entero(bandera(resto, 'regiones'), 'regiones', REGIONES_POR_BANDO),
      });
      console.log(`assets/mundos/${id}/: mundo.json y plan.json (semilla ${mundo.semilla})`);
      const { dir } = await escribirLectura(id, !resto.includes('--sin-png'));
      console.log(`${dir}: la lectura para el motor`);
      return 0;
    }
    case 'leer': {
      const { lectura, dir } = await escribirLectura(id, !resto.includes('--sin-png'), () =>
        console.log('pintando el mapa con el taller…'),
      );
      const muestras = lectura.regiones.reduce((n, r) => n + r.admitenUnLugar.length, 0);
      console.log(
        `${dir}: lectura.json (${lectura.regiones.length} regiones, ${muestras} casillas que admiten un lugar)${resto.includes('--sin-png') ? '' : ' y mapa.png'}`,
      );
      return 0;
    }
    case 'validar': {
      const problemas = await validarEnDisco(id);
      if (problemas.length === 0) {
        console.log(`el mundo "${id}" vale: se juega con ?mundo=${id}`);
        return 0;
      }
      console.log(
        `el mundo "${id}" tiene ${problemas.length} problema${problemas.length === 1 ? '' : 's'}:`,
      );
      for (const p of problemas) console.log(lineaDeProblema(p));
      return 1;
    }
    case 'medir': {
      for (const uno of [id, ...resto]) {
        const { mundo, biblia } = await leerMundoDeDisco(uno);
        for (const l of describirMedida(uno, medirMundo(mundo, biblia))) console.log(l);
      }
      return 0;
    }
    default:
      console.error(`orden desconocida «${orden}»: nuevo, leer, validar o medir`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (codigo) => process.exit(codigo),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
