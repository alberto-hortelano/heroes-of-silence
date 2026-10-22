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
 *       hondura de su conversación. Una medida, no una regla: no exige la biblia,
 *       para medir también los mundos de antes
 */
import { REGIONES_POR_BANDO } from '../../src/core/map/generate.js';
import { leerMundo } from '../../src/core/mundo/validar.js';
import { parseSeed } from '../../src/core/rng.js';
import { parseFaccion } from '../../src/core/types.js';
import {
  escribirLectura,
  escribirMundoNuevo,
  leerBiblia,
  leerCrudos,
  validarEnDisco,
} from './disco.js';
import { medirMundo } from './medida.js';

function bandera(args: readonly string[], nombre: string): string | undefined {
  const a = args.find((x) => x.startsWith(`--${nombre}=`));
  return a?.slice(nombre.length + 3);
}

function entero(texto: string | undefined, nombre: string, defecto: number): number {
  if (texto === undefined) return defecto;
  const n = Number(texto);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`--${nombre}=${texto} no es un entero`);
  return n;
}

/** «1 lugar», «3 lugares». */
function cuantos(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
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
      for (const p of problemas) console.log(`- ${p}`);
      return 1;
    }
    case 'medir': {
      for (const uno of [id, ...resto]) {
        const leido = await leerCrudos(uno);
        if ('problemas' in leido) {
          throw new Error(`el mundo "${uno}" no se mide: ${leido.problemas.join('; ')}`);
        }
        const m = medirMundo(leerMundo(leido.crudos, uno), await leerBiblia(uno));
        const cruzan = m.marcasQueCruzan;
        console.log(
          [
            `${uno}: ${cuantos(m.lugares, 'lugar', 'lugares')} en ${cuantos(m.regiones, 'región', 'regiones')}`,
            `${cuantos(m.marcas, 'marca', 'marcas')}, ${cruzan.length} ${cruzan.length === 1 ? 'cruza' : 'cruzan'} lugares${cruzan.length === 0 ? '' : ` (${cruzan.join(', ')})`}`,
            `${cuantos(m.encadenados, 'lugar encadenado', 'lugares encadenados')}`,
            `${cuantos(m.exclusiones.length, 'desenlace que se excluye', 'desenlaces que se excluyen')}${m.exclusiones.length === 0 ? '' : ` (${m.exclusiones.map(([a, b]) => `${a} / ${b}`).join(', ')})`}`,
            `biblia: ${m.palabrasDeLaBiblia === null ? 'no tiene' : cuantos(m.palabrasDeLaBiblia, 'palabra', 'palabras')}`,
          ].join(' · '),
        );
        for (const p of m.personas) {
          console.log(
            `  ${p.lugar} · ${p.nombre}: ${cuantos(p.nodos, 'nodo', 'nodos')}, hondura ${p.hondura}, ${cuantos(p.conHace, 'opción que hace algo', 'opciones que hacen algo')}`,
          );
        }
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
